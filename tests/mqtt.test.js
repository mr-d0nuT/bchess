import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCONNECT, PINGREQ, PUBLISH, connectMqtt, publishPacket, unsubscribePacket } from '../src/net/mqtt.js';

// Un WebSocket de mentira: se abre solo un momento después (como el de verdad), apunta lo que se le manda y
// deja que la prueba haga llegar bytes del broker.
class WsFalso {
  constructor() {
    this.readyState = 0;
    this.enviados = [];
    WsFalso.ultimo = this;
    queueMicrotask(() => {
      this.readyState = 1;
      this.onopen?.();
    });
  }

  send(bytes) {
    this.enviados.push(bytes);
  }

  close() {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.());
  }

  llega(bytes) {
    this.onmessage?.({ data: new Uint8Array(bytes).buffer });
  }
}
const CONNACK = [0x20, 2, 0, 0];
const PINGRESP = [0xd0, 0];
const tipos = (ws) => ws.enviados.map((b) => b[0] >> 4);
const latidos = (ws) => tipos(ws).filter((x) => x === PINGREQ).length;
// El tiempo pasa de segundo en segundo, como de verdad (`tick` de golpe pone la hora final a todo lo que salta).
const pasa = (t, ms) => {
  for (let i = 0; i < ms; i += 1000) t.mock.timers.tick(Math.min(1000, ms - i));
};

// Conectado a un broker de mentira con el tiempo de mentira (keepalive de 20 s: latido cada 10 s).
async function conecta(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const promesa = connectMqtt('wss://falso', { clientId: 'yo', WebSocketImpl: WsFalso });
  await Promise.resolve(); // se abre y manda el CONNECT
  const ws = WsFalso.ultimo;
  ws.llega(CONNACK);
  const cliente = await promesa;
  const cierres = [];
  cliente.onClose((motivo) => cierres.push(motivo));
  return { ws, cliente, cierres };
}

test('el UNSUBSCRIBE lleva su número y el tema, con los bits que pide MQTT', () => {
  assert.deepEqual([...unsubscribePacket(1, 'a/b')], [0xa2, 7, 0, 1, 0, 3, 97, 47, 98]);
});

test('si el broker calla vez y media el latido, la conexión se da por muerta y se avisa (aunque el socket diga OPEN)', async (t) => {
  const { ws, cierres } = await conecta(t);
  pasa(t, 30000);
  assert.deepEqual(cierres, []);
  assert.equal(latidos(ws), 3, 'mientras, sus latidos');
  pasa(t, 10000);
  assert.deepEqual(cierres, ['callado']);
  assert.equal(ws.readyState, 3);
});

test('mientras el broker contesta a los latidos, la conexión sigue', async (t) => {
  const { ws, cliente, cierres } = await conecta(t);
  for (let i = 0; i < 12; i++) {
    pasa(t, 10000);
    ws.llega(PINGRESP);
  }
  assert.deepEqual(cierres, []);
  assert.ok(cliente.connected);
  assert.equal(cliente.oido, 120000);
});

test('tras una pausa del navegador (el móvil en el bolsillo), primero se pregunta: no se mata a la primera', async (t) => {
  const { ws, cierres } = await conecta(t);
  t.mock.timers.setTime(Date.now() + 120000); // dos minutos sin que corra nada
  pasa(t, 1000); // al despertar salen de golpe los latidos atrasados
  assert.deepEqual(cierres, []);
  assert.equal(latidos(ws), 1, 'un latido, no uno por cada uno atrasado');
  ws.llega(PINGRESP);
  pasa(t, 30000);
  assert.deepEqual(cierres, []);
  // Y si después ya no contesta, sí: en vez y media el latido.
  pasa(t, 10000);
  assert.deepEqual(cierres, ['callado']);
});

test('tras una pausa, si al despertar el broker no contesta, fuera en cuanto vence el plazo', async (t) => {
  const { cierres } = await conecta(t);
  t.mock.timers.setTime(Date.now() + 120000);
  pasa(t, 1000);
  assert.deepEqual(cierres, []);
  pasa(t, 10000);
  assert.deepEqual(cierres, ['callado']);
});

test('`probe` pregunta: si en 3 s no contesta, fuera; si contesta, sigue', async (t) => {
  const { ws, cliente, cierres } = await conecta(t);
  const vivo = cliente.probe();
  assert.equal(tipos(ws).at(-1), PINGREQ);
  ws.llega(PINGRESP);
  assert.equal(await vivo, true);
  const muerto = cliente.probe(3000);
  t.mock.timers.tick(2999);
  assert.deepEqual(cierres, []);
  t.mock.timers.tick(1);
  assert.equal(await muerto, false);
  assert.deepEqual(cierres, ['sondeo']);
  assert.equal(await cliente.probe(), false, 'una muerta ya no contesta');
});

test('`close` se despide y no avisa de cierre; un error seguido de cierre avisa una sola vez', async (t) => {
  const a = await conecta(t);
  a.cliente.close();
  await Promise.resolve();
  assert.equal(tipos(a.ws).at(-1), DISCONNECT);
  assert.deepEqual(a.cierres, []);
  t.mock.timers.reset();
  const b = await conecta(t);
  b.ws.onerror();
  b.ws.onclose();
  assert.deepEqual(b.cierres, ['cerrada']);
});

test('`zombi`: ni entra ni sale nada, sin cerrar, hasta que el latido la da por muerta', async (t) => {
  const { ws, cliente, cierres } = await conecta(t);
  const recibidos = [];
  cliente.onMessage((topic, texto) => recibidos.push([topic, texto]));
  cliente.zombi(60000);
  const antes = ws.enviados.length;
  cliente.publish('t', 'hola');
  ws.llega([...publishPacket('t', 'oye')]);
  ws.llega(PINGRESP);
  assert.equal(ws.enviados.length, antes, 'no sale nada');
  assert.deepEqual(recibidos, [], 'no entra nada');
  pasa(t, 40000);
  assert.deepEqual(cierres, ['callado']);
  assert.equal(tipos(ws).filter((x) => x === PUBLISH).length, 0);
});
