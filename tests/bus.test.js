import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/net/online.js';

// Brokers de mentira para el bus: `connect` falla las primeras `fallos` veces y luego da clientes que apuntan
// a qué se suscriben y qué publican, y que la prueba puede cerrar (`matar`) o hacer hablar (`llega`).
function brokers({ fallos = 0 } = {}) {
  const clientes = [];
  let intentos = 0;
  async function connect(url) {
    intentos += 1;
    if (intentos <= fallos) throw new Error('no contesta');
    const cierres = new Set();
    const oyentes = new Set();
    const c = {
      url,
      temas: [],
      quitados: [],
      publicados: [],
      oido: Date.now(),
      contesta: true, // a `probe`
      subscribe: (t) => c.temas.push(t),
      unsubscribe: (t) => c.quitados.push(t),
      publish: (t, texto) => c.publicados.push([t, JSON.parse(texto)]),
      onMessage: (fn) => {
        oyentes.add(fn);
        return () => oyentes.delete(fn);
      },
      onClose: (fn) => {
        cierres.add(fn);
        return () => cierres.delete(fn);
      },
      close: () => {},
      matar: (motivo) => {
        for (const fn of cierres) fn(motivo);
      },
      probe: async () => {
        if (c.contesta) return true;
        c.matar('sondeo');
        return false;
      },
      llega: (t, msg) => {
        c.oido = Date.now();
        for (const fn of oyentes) fn(t, JSON.stringify(msg));
      },
    };
    clientes.push(c);
    return c;
  }
  return {
    connect,
    clientes,
    get intentos() {
      return intentos;
    },
  };
}
// Deja correr lo pendiente (promesas y lo que encadenan), sin que pase el tiempo de mentira.
const corre = () => new Promise((resolve) => setImmediate(resolve));
const tipos = (c) => c.publicados.map(([, m]) => m.k);

function bus(t, opciones) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const b = createBus({ clientId: 'yo', retry: 1000, ...opciones });
  t.after(() => b.close());
  return b;
}

test('sin respuesta, el bus espera cada vez más para volver a probar; `revive` lo despierta y conecta ya', async (t) => {
  const red = brokers({ fallos: 5 });
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect });
  await corre();
  assert.equal(red.intentos, 1);
  for (const espera of [1000, 2000, 4000, 8000]) {
    t.mock.timers.tick(espera - 1);
    await corre();
    t.mock.timers.tick(1);
    await corre();
  }
  assert.equal(red.intentos, 5, 'esperando 1, 2, 4 y 8 s');
  t.mock.timers.tick(15000); // ahora espera 16 s
  await corre();
  assert.equal(red.intentos, 5);
  b.revive();
  await corre();
  assert.equal(red.intentos, 6, 'al volver al primer plano, ya');
  assert.equal(red.clientes.length, 1);
  assert.ok(b.connected);
});

test('al reconectar se vuelve a suscribir a todo y avisa de que está conectado', async (t) => {
  const red = brokers();
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect });
  await corre();
  const estados = [];
  b.onEstado((estado) => estados.push(estado));
  b.subscribe('sala');
  b.subscribe('partida');
  const [primero] = red.clientes;
  assert.deepEqual(primero.temas, ['sala', 'partida']);
  primero.matar('cerrada');
  await corre();
  assert.deepEqual(estados, ['desconectado']);
  assert.equal(b.connected, false);
  t.mock.timers.tick(1000);
  await corre();
  assert.deepEqual(red.clientes[1].temas, ['sala', 'partida']);
  assert.deepEqual(estados, ['desconectado', 'conectado']);
});

test('una conexión que no contesta al volver se cierra y se rehace enseguida, sin esperar', async (t) => {
  const red = brokers();
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect });
  await corre();
  red.clientes[0].contesta = false;
  b.revive();
  await corre();
  assert.equal(red.clientes.length, 2, 'otra conexión, sin esperar el segundo de turno');
});

test('lo publicado sin conexión sale al conectar; lo periódico no, ni lo de hace más de medio minuto', async (t) => {
  const red = brokers({ fallos: 1 });
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect, retry: 40000 });
  await corre(); // el primer intento falla: 40 s hasta el siguiente
  b.publish('g/x', { k: 'resign', from: 'yo' });
  t.mock.timers.tick(20000);
  b.publish('g/x', { k: 'move', n: 0, uci: 'e2e4', from: 'yo' });
  b.publish('g/x', { k: 'ping', n: 1, from: 'yo' });
  b.publish('sala', { k: 'here', from: 'yo' });
  t.mock.timers.tick(20000);
  await corre();
  const [c] = red.clientes;
  assert.ok(c, 'conectado a los 40 s');
  assert.deepEqual(tipos(c), ['move'], 'la rendición tiene 40 s: ya no');
  // Y el mismo mensaje (mismo `mid`) cada vez: quien ya lo tenía lo descarta.
  const mid = c.publicados[0][1].mid;
  c.matar('callado');
  await corre();
  assert.deepEqual(red.clientes[1].publicados.map(([, m]) => m.mid), [mid]);
});

test('`whenReady`: sin brokers, falla al plazo; en cuanto conecta uno, vale (y una vez fallado, se puede volver a pedir)', async (t) => {
  const red = brokers({ fallos: 3 });
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect });
  await corre(); // el primer intento falla: un segundo hasta el siguiente
  const temprano = b.whenReady(100);
  t.mock.timers.tick(100);
  await assert.rejects(temprano, /Sin conexión/);
  t.mock.timers.tick(900); // 2.º intento, falla
  await corre();
  t.mock.timers.tick(2000); // 3.º, falla
  await corre();
  const luego = b.whenReady(9000);
  let listo = false;
  luego.then(() => {
    listo = true;
  });
  t.mock.timers.tick(3999);
  await corre();
  assert.equal(listo, false);
  t.mock.timers.tick(1); // 4.º, conecta
  await corre();
  assert.equal(listo, true);
  await b.whenReady(1); // y conectado, al momento
});

test('lo que llega por dos brokers a la vez se entrega una sola vez', async (t) => {
  const red = brokers();
  const b = bus(t, { urls: ['wss://uno', 'wss://dos'], connect: red.connect });
  await corre();
  const llegan = [];
  b.onMessage((topic, msg) => llegan.push(msg.mid));
  const [uno, dos] = red.clientes;
  uno.llega('sala', { k: 'here', from: 'ana1', mid: 'ana1:7' });
  dos.llega('sala', { k: 'here', from: 'ana1', mid: 'ana1:7' });
  dos.llega('sala', { k: 'here', from: 'ana1', mid: 'ana1:8' });
  assert.deepEqual(llegan, ['ana1:7', 'ana1:8']);
});

test('un tema que se deja ya no se pide al reconectar', async (t) => {
  const red = brokers();
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect });
  await corre();
  b.subscribe('sala');
  b.subscribe('partida');
  b.unsubscribe('partida');
  b.unsubscribe('nunca');
  assert.deepEqual(red.clientes[0].quitados, ['partida']);
  red.clientes[0].matar('cerrada');
  await corre();
  t.mock.timers.tick(1000);
  await corre();
  assert.deepEqual(red.clientes[1].temas, ['sala']);
});

test('`sano`: algún broker ha dicho algo hace menos de 15 s', async (t) => {
  const red = brokers();
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect });
  await corre();
  assert.equal(b.sano, true);
  t.mock.timers.tick(15000);
  assert.equal(b.sano, false, 'callado: no se sabe si hay red');
  red.clientes[0].llega('sala', { k: 'here', from: 'ana1', mid: 'ana1:1' });
  assert.equal(b.sano, true);
  red.clientes[0].matar('cerrada');
  await corre();
  assert.equal(b.sano, false, 'sin brokers');
});

test('`corta(s)`: sin conexión y sin volver a conectar hasta que pasan los segundos (ni con `revive`)', async (t) => {
  const red = brokers();
  const b = bus(t, { urls: ['wss://uno'], connect: red.connect });
  await corre();
  b.corta(15);
  await corre();
  assert.equal(b.connected, false);
  assert.equal(b.estado().cortada, 15);
  b.revive();
  t.mock.timers.tick(14999);
  await corre();
  assert.equal(red.clientes.length, 1);
  t.mock.timers.tick(1);
  await corre();
  assert.equal(red.clientes.length, 2);
  assert.ok(b.connected);
});
