import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPacket, encodeLength, publishPacket, readPublish, splitPackets, PUBLISH } from '../src/net/mqtt.js';
import { LOBBY, createBus, createLobby, createMatchmaker, createSession, gameTopic, huella, inbox } from '../src/net/online.js';
import { cleanName } from '../src/names.js';

test('la longitud de MQTT va de 7 en 7 bits', () => {
  assert.deepEqual(encodeLength(0), [0]);
  assert.deepEqual(encodeLength(127), [127]);
  assert.deepEqual(encodeLength(128), [128, 1]);
  assert.deepEqual(encodeLength(16383), [255, 127]);
  assert.deepEqual(encodeLength(16384), [128, 128, 1]);
});

test('un PUBLISH se trocea y se lee igual que se escribió, aunque llegue junto con otro o a medias', () => {
  const a = publishPacket('sala/uno', '{"k":"seek"}');
  const b = publishPacket('sala/dos', 'ñandú'.repeat(40)); // más de 127 bytes: longitud de dos bytes
  const juntos = new Uint8Array(a.length + b.length);
  juntos.set(a, 0);
  juntos.set(b, a.length);
  const { packets, rest } = splitPackets(juntos);
  assert.equal(packets.length, 2);
  assert.equal(rest.length, 0);
  assert.equal(packets[0].type, PUBLISH);
  assert.deepEqual(readPublish(packets[0]), { topic: 'sala/uno', payload: '{"k":"seek"}' });
  assert.deepEqual(readPublish(packets[1]), { topic: 'sala/dos', payload: 'ñandú'.repeat(40) });
  // A medias: el primero entero y el resto, para luego.
  const medio = splitPackets(juntos.subarray(0, a.length + 5));
  assert.equal(medio.packets.length, 1);
  assert.equal(medio.rest.length, 5);
});

test('el CONNECT pide MQTT 3.1.1 con sesión limpia', () => {
  const p = connectPacket('yo', 30);
  assert.equal(p[0], 0x10);
  assert.deepEqual([...p.subarray(2, 8)], [0, 4, 77, 81, 84, 84]); // «MQTT»
  assert.equal(p[8], 4);
  assert.equal(p[9], 0x02);
});

// Una red de juguete: cada mensaje llega a quien esté suscrito al tema, más tarde (como por la red).
// `drop(msg)` decide qué se pierde.
function red({ drop = () => false } = {}) {
  const nodos = new Set();
  return {
    bus(id) {
      const nodo = { temas: new Set(), oyentes: new Set() };
      nodos.add(nodo);
      let seq = 0;
      return {
        subscribe: (t) => nodo.temas.add(t),
        publish: (t, msg) => {
          const m = { ...msg, mid: `${id}:${++seq}` };
          if (drop(m)) return;
          for (const n of nodos) if (n.temas.has(t)) for (const fn of n.oyentes) setImmediate(() => fn(t, m));
        },
        onMessage: (fn) => {
          nodo.oyentes.add(fn);
          return () => nodo.oyentes.delete(fn);
        },
      };
    },
  };
}
// Los tiempos del emparejamiento, cincuenta veces más deprisa.
const rapido = { set: (fn, ms) => setTimeout(fn, ms / 50), clear: clearTimeout, every: (fn, ms) => setInterval(fn, ms / 50), stop: clearInterval };
const conPlazo = (p, ms = 3000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('no se emparejan')), ms))]);

test('dos que buscan se emparejan en la misma partida, uno con blancas, con el reloj del que esperaba antes', async () => {
  const net = red();
  let reloj = 1000;
  const now = () => reloj;
  const a = createMatchmaker({ bus: net.bus('a'), me: 'a1', time: 'blitz:3+2', name: 'Ana', now, timers: rapido });
  reloj = 2000;
  const b = createMatchmaker({ bus: net.bus('b'), me: 'b2', time: 'libre:libre', name: '  Bruno\u0007 ', now, timers: rapido });
  const [fa, fb] = await conPlazo(Promise.all([a.found, b.found]));
  assert.equal(fa.game, fb.game);
  assert.equal(fa.white, fb.white);
  assert.ok(['a1', 'b2'].includes(fa.white));
  assert.equal(fa.opponent, 'b2');
  assert.equal(fb.opponent, 'a1');
  assert.equal(fa.time, 'blitz:3+2');
  assert.equal(fb.time, 'blitz:3+2');
  // Y cada uno sabe cómo se llama el otro (limpio: sin espacios de más ni caracteres de control).
  assert.equal(fa.opponentName, 'Bruno');
  assert.equal(fb.opponentName, 'Ana');
});

test('con tres buscando, se empareja una pareja y el tercero sigue buscando hasta que llega un cuarto', async () => {
  const net = red();
  const mm = ['m1', 'm2', 'm3'].map((me) => createMatchmaker({ bus: net.bus(me), me, time: 'libre:libre', timers: rapido }));
  const hechos = [];
  mm.forEach((m, i) => m.found.then((info) => hechos.push({ i, info })));
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(hechos.length, 2, `emparejados: ${hechos.length}`);
  assert.equal(hechos[0].info.game, hechos[1].info.game);
  const solo = mm.find((m) => m.state !== 'matched');
  assert.equal(solo.state, 'seeking');
  const cuarto = createMatchmaker({ bus: net.bus('m4'), me: 'm4', time: 'libre:libre', timers: rapido });
  const [x, y] = await conPlazo(Promise.all([solo.found, cuarto.found]));
  assert.equal(x.game, y.game);
  for (const m of [...mm, cuarto]) m.stop();
});

test('quien cancela deja de buscar y nadie se empareja con él', async () => {
  const net = red();
  const a = createMatchmaker({ bus: net.bus('a'), me: 'a1', time: 'libre:libre', timers: rapido });
  a.stop();
  assert.equal(await a.found, null);
  const b = createMatchmaker({ bus: net.bus('b'), me: 'b2', time: 'libre:libre', timers: rapido });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(b.state, 'seeking');
  b.stop();
});

test('en la partida llegan las jugadas, y si una se pierde, el latido la recupera', async () => {
  let perder = true;
  const net = red({ drop: (m) => m.k === 'move' && perder && !(perder = false) });
  const lentos = { every: (fn, ms) => setInterval(fn, ms / 40), stop: clearInterval };
  const jugadasA = [];
  const jugadasB = [];
  const A = createSession({ bus: net.bus('a'), me: 'a1', game: 'g', opponent: 'b2', white: 'a1', moves: () => jugadasA, timers: lentos });
  const B = createSession({ bus: net.bus('b'), me: 'b2', game: 'g', opponent: 'a1', white: 'a1', moves: () => jugadasB, timers: lentos });
  assert.equal(A.color, 'white');
  assert.equal(B.color, 'black');
  const recibidas = [];
  B.on('move', ({ n, uci }) => recibidas.push([n, uci]));
  const sincronia = new Promise((resolve) => B.on('sync', ({ moves }) => resolve(moves)));
  jugadasA.push('e2e4');
  A.move(0, 'e2e4'); // esta se pierde
  const moves = await conPlazo(sincronia);
  assert.deepEqual(moves, ['e2e4']);
  assert.deepEqual(recibidas, []);
  jugadasB.push('e2e4', 'e7e5');
  const llega = new Promise((resolve) => A.on('move', resolve));
  B.move(1, 'e7e5');
  assert.deepEqual(await conPlazo(llega), { n: 1, uci: 'e7e5' });
  const adios = new Promise((resolve) => B.on('resign', resolve));
  A.leave('resign');
  await conPlazo(adios);
  B.leave();
});

// La sala, con los tiempos cincuenta veces más deprisa.
const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('en la sala cada uno ve a los demás, con su nombre y qué hacen, y deja de verlos al irse', async () => {
  const net = red();
  const a = createLobby({ bus: net.bus('a'), me: 'a1', timers: rapido });
  const b = createLobby({ bus: net.bus('b'), me: 'b2', timers: rapido });
  a.set({ name: 'Ana', status: 'menu' });
  b.set({ name: 'Bruno', status: 'playing', games: 2 });
  await espera(120);
  assert.deepEqual(a.players(), [{ id: 'b2', name: 'Bruno', status: 'playing', games: 2 }]);
  assert.deepEqual(b.players().map((p) => p.name), ['Ana']);
  b.close();
  await espera(50);
  assert.deepEqual(a.players(), []);
  a.close();
});

test('un reto aceptado empareja a los dos en la misma partida, con colores contrarios', async () => {
  const net = red();
  const a = createLobby({ bus: net.bus('a'), me: 'a1', timers: rapido });
  const b = createLobby({ bus: net.bus('b'), me: 'b2', timers: rapido });
  a.set({ name: 'Ana' });
  b.set({ name: 'Bruno' });
  await espera(60);
  const llega = new Promise((resolve) => b.onInvite(resolve));
  const reto = a.invite('b2', { time: 'blitz:3+2' });
  const visto = await conPlazo(llega);
  assert.equal(visto.name, 'Ana');
  assert.equal(visto.time, 'blitz:3+2');
  const [suyo, mio] = await conPlazo(Promise.all([b.acceptInvite(visto.game), reto.promise]));
  assert.equal(suyo.game, mio.game);
  assert.equal(suyo.white, mio.white);
  assert.equal(mio.opponent, 'b2');
  assert.equal(mio.opponentName, 'Bruno');
  assert.equal(suyo.opponent, 'a1');
  assert.equal(suyo.opponentName, 'Ana');
  assert.equal(suyo.time, 'blitz:3+2');
  a.close();
  b.close();
});

test('un reto rechazado lo sabe quien retó; y uno retirado desaparece para el retado', async () => {
  const net = red();
  const a = createLobby({ bus: net.bus('a'), me: 'a1', timers: rapido });
  const b = createLobby({ bus: net.bus('b'), me: 'b2', timers: rapido });
  const retos = [];
  b.onInvite((r) => retos.push(r));
  const primero = a.invite('b2');
  await espera(30);
  b.declineInvite(retos[0].game);
  assert.deepEqual(await conPlazo(primero.promise), { declined: true });
  const segundo = a.invite('b2');
  await espera(30);
  assert.equal(b.invites().length, 1);
  segundo.cancel();
  await espera(30);
  assert.deepEqual(await segundo.promise, { canceled: true });
  assert.equal(b.invites().length, 0);
  assert.ok(retos.some((r) => r.game === segundo.game && r.gone));
  a.close();
  b.close();
});

test('un reto sin contestar caduca para los dos', async () => {
  const net = red();
  const a = createLobby({ bus: net.bus('a'), me: 'a1', timers: rapido });
  const b = createLobby({ bus: net.bus('b'), me: 'b2', timers: rapido });
  const reto = a.invite('b2');
  assert.deepEqual(await conPlazo(reto.promise, 4000), { expired: true });
  await espera(30);
  assert.equal(b.invites().length, 0);
  a.close();
  b.close();
});

// ---- Lo que llega de la red no se cree a ciegas ----

// Un broker de juguete detrás del bus de verdad: lo que se publica llega (más tarde, como por la red) a los
// clientes suscritos a ese tema, y se apunta en qué tema se ha publicado. `inyecta` publica como lo haría
// cualquiera desde fuera (un tramposo, por ejemplo).
function brokerDeJuguete() {
  const clientes = new Set();
  const publicados = [];
  const reparte = (t, texto) => {
    for (const c of clientes) if (c.temas.has(t)) for (const fn of c.oyentes) setImmediate(() => fn(t, texto));
  };
  return {
    publicados,
    inyecta: (t, msg) => reparte(t, JSON.stringify(msg)),
    async connect(url) {
      const c = { temas: new Set(), oyentes: new Set() };
      clientes.add(c);
      return {
        url,
        subscribe: (t) => c.temas.add(t),
        publish: (t, texto) => {
          publicados.push(t);
          reparte(t, texto);
        },
        onMessage: (fn) => {
          c.oyentes.add(fn);
          return () => c.oyentes.delete(fn);
        },
        onClose: () => () => {},
        close: () => clientes.delete(c),
      };
    },
  };
}

test('un remitente que no es un identificador se tira: nadie acaba publicando en un tema con comodines', async (t) => {
  const broker = brokerDeJuguete();
  const bus = createBus({ urls: ['wss://juguete'], clientId: 'prueba', connect: broker.connect });
  const mm = createMatchmaker({ bus, me: 'aaaa1', time: 'libre:libre', timers: rapido });
  const sala = createLobby({ bus, me: 'aaaa1', timers: rapido });
  t.after(() => {
    mm.stop();
    sala.close();
    bus.close();
  });
  await espera(80); // conectado y suscrito
  // «~#» va detrás de «aaaa1»: si contara, se le ofrecería partida en su buzón… «…/p/~#».
  for (const from of ['~#', 'zz+z', 'a/b', '#', '', 'ZZZZ', null, 42]) {
    broker.inyecta(LOBBY, { k: 'seek', from, since: 0, time: 'libre:libre', mid: `s${from}` });
    broker.inyecta(LOBBY, { k: 'here', from, name: 'Trampa', mid: `h${from}` });
  }
  broker.inyecta(LOBBY, { from: 'zzzz8', mid: 'sin-k' }); // sin decir qué es
  broker.inyecta(LOBBY, { k: 'seek', from: 'zzzz9', since: 0, time: { a: 1 }, mid: 'bueno' }); // y uno de verdad
  await espera(200);
  assert.ok(broker.publicados.length > 0);
  assert.deepEqual(broker.publicados.filter((t) => /[+#]/.test(t)), []);
  assert.equal(mm.seekers(), 1);
  assert.deepEqual(sala.players().map((p) => p.id), ['zzzz9']);
});

test('una oferta mal nombrada, con un tercero con blancas o sin ritmo, ni se contesta', async () => {
  const enviados = [];
  const net = red({ drop: (m) => !enviados.push(m) });
  const b = createMatchmaker({ bus: net.bus('b'), me: 'b2', time: 'libre:libre', timers: rapido });
  const tramposo = net.bus('t');
  const malas = [
    { game: '#' },
    { game: 'a1-b2-x/#' },
    { game: 'zz-b2-x' }, // nombrada por otro
    { game: 'b2-a1-x' }, // al revés
    { white: 'zz' }, // con blancas, un tercero: los dos creerían llevar negras
    { time: 'x'.repeat(40) },
    { time: null },
  ];
  for (const m of malas) tramposo.publish(inbox('b2'), { k: 'offer', from: 'a1', game: 'a1-b2-x', white: 'a1', time: 'libre:libre', ...m });
  await espera(60);
  assert.equal(b.state, 'seeking');
  assert.deepEqual(enviados.filter((m) => m.from === 'b2' && m.k !== 'seek'), []);
  // La buena, sí.
  tramposo.publish(inbox('b2'), { k: 'offer', from: 'a1', game: 'a1-b2-x', white: 'a1', time: 'blitz:3+2' });
  await espera(20);
  assert.equal(b.state, 'accepted');
  b.stop();
});

test('un reto mal nombrado, con un tercero con blancas o sin ritmo, no llega', async () => {
  const net = red();
  const b = createLobby({ bus: net.bus('b'), me: 'b2', timers: rapido });
  const retos = [];
  b.onInvite((r) => retos.push(r));
  const tramposo = net.bus('t');
  for (const m of [{ game: '#' }, { game: 'zz-b2-x' }, { white: 'zz' }, { time: 7 }]) {
    tramposo.publish(inbox('b2'), { k: 'invite', from: 'a1', game: 'a1-b2-x', white: 'a1', time: 'libre:libre', name: 'Ana', ...m });
  }
  await espera(40);
  assert.deepEqual(retos, []);
  tramposo.publish(inbox('b2'), { k: 'invite', from: 'a1', game: 'a1-b2-x', white: 'b2', time: 'blitz:3+2', name: 'Ana' });
  await espera(20);
  assert.deepEqual(b.invites().map((r) => [r.game, r.time]), [['a1-b2-x', 'blitz:3+2']]);
  b.close();
});

test('en la partida se ignora lo que no tiene sentido: jugadas del otro color, relojes ajenos, listas sin fin', async () => {
  const enviados = [];
  const net = red({ drop: (m) => !enviados.push(m) });
  const quieto = { every: () => 0, stop: () => {} };
  // Yo llevo negras: las jugadas del rival son las pares, y su reloj, el de las blancas.
  const B = createSession({ bus: net.bus('b'), me: 'b2', game: 'a1-b2-x', opponent: 'a1', white: 'a1', moves: () => [], timers: quieto });
  const llega = [];
  for (const k of ['move', 'press', 'sync']) B.on(k, (d) => llega.push([k, d]));
  const rival = net.bus('a');
  const dice = (m) => rival.publish(gameTopic('a1-b2-x'), { from: 'a1', ...m });
  dice({ k: 'move', n: 1, uci: 'e7e5' }); // una de las negras: las mías
  dice({ k: 'move', n: 0, uci: 'e2e4#' });
  dice({ k: 'move', n: 0, uci: ['e2e4'] });
  dice({ k: 'move', n: 0.5, uci: 'e2e4' });
  dice({ k: 'move', n: 600, uci: 'e2e4' });
  dice({ k: 'press', side: 'x', n: 1, white: 1000, black: 1000 }); // escribía mi tiempo en el suyo
  dice({ k: 'press', side: 'black', n: 1, white: 1000, black: 1000 }); // mi reloj lo llevo yo
  dice({ k: 'press', side: 'white', n: 1, white: -5, black: 1000 });
  dice({ k: 'press', side: 'white', n: 1, white: '9', black: 1000 });
  dice({ k: 'press', side: 'white', n: 1, white: 1e12, black: 1000 });
  dice({ k: 'press', side: 'white', n: 'uno', white: 1000, black: 1000 });
  dice({ k: 'sync', moves: Array(601).fill('e2e4') });
  dice({ k: 'sync', moves: ['e2e4', 5] });
  dice({ k: 'sync', moves: 'e2e4' });
  dice({ k: 'ping', n: 'x' });
  dice({ k: 'ping', n: 1000 }); // si contara, se le pedirían las jugadas
  dice({ k: 'nadaqueverl' });
  await espera(30);
  assert.deepEqual(llega, []);
  assert.deepEqual(enviados.filter((m) => m.from === 'b2' && m.k !== 'ping'), []);
  dice({ k: 'move', n: 0, uci: 'e2e4' });
  dice({ k: 'press', side: 'white', n: 1, white: 59000, black: 60000, extra: 'fuera' });
  dice({ k: 'sync', moves: ['e2e4'] });
  await espera(30);
  assert.deepEqual(llega, [
    ['move', { n: 0, uci: 'e2e4' }],
    ['press', { side: 'white', n: 1, white: 59000, black: 60000 }],
    ['sync', { moves: ['e2e4'] }],
  ]);
  B.leave();
});

test('la partida escucha su propio buzón: el «cancel» del rival llega aunque no haya sala ni emparejamiento', async () => {
  const net = red();
  const quieto = { every: () => 0, stop: () => {} };
  const B = createSession({ bus: net.bus('b'), me: 'b2', game: 'a1-b2-x', opponent: 'a1', white: 'a1', moves: () => [], timers: quieto });
  const cancelada = new Promise((resolve) => B.on('cancel', resolve));
  net.bus('a').publish(inbox('b2'), { k: 'cancel', from: 'a1', game: 'a1-b2-x' });
  await conPlazo(cancelada, 500);
});

test('los nombres que llegan de la red no traen caracteres invisibles que den la vuelta al texto', () => {
  assert.equal(cleanName('Ana\u202Eodag'), 'Anaodag');
  assert.equal(cleanName('\u2066Bruno\u2069\u200F'), 'Bruno');
  assert.equal(cleanName('\uFEFFEva\u200B Luz'), 'Eva Luz');
  assert.equal(cleanName('مرحبا'), 'مرحبا', 'el árabe se queda como está');
});

test('al volver la conexión, la partida da un latido y la sala dice que sigue ahí, sin esperar a su turno', () => {
  const enviados = [];
  const estados = new Set();
  const bus = {
    subscribe: () => {},
    unsubscribe: () => {},
    publish: (topic, msg) => enviados.push(msg.k),
    onMessage: () => () => {},
    onEstado: (fn) => {
      estados.add(fn);
      return () => estados.delete(fn);
    },
  };
  const quieto = { set: () => 0, clear: () => {}, every: () => 0, stop: () => {} };
  const sesion = createSession({ bus, me: 'b2', game: 'a1-b2-x', opponent: 'a1', white: 'a1', moves: () => [], timers: quieto });
  const sala = createLobby({ bus, me: 'b2', timers: quieto });
  enviados.length = 0;
  for (const fn of estados) fn('conectado', 'wss://uno');
  assert.deepEqual(enviados.sort(), ['here', 'ping']);
  // Y la partida que se acaba, y la sala que se cierra, dejan de escuchar.
  sesion.leave();
  sala.close();
  assert.equal(estados.size, 0);
});

// ---- Partidas desincronizadas ----

// La partida de «b2» (negras) contra «a1», con las jugadas que diga `mias`; `dice` habla por el rival.
function partidaDeB(mias) {
  const enviados = [];
  const net = red({ drop: (m) => !enviados.push(m) });
  const quieto = { every: () => 0, stop: () => {} };
  const B = createSession({ bus: net.bus('b'), me: 'b2', game: 'a1-b2-x', opponent: 'a1', white: 'a1', moves: () => mias, timers: quieto });
  const rival = net.bus('a');
  const dice = (m) => rival.publish(gameTopic('a1-b2-x'), { from: 'a1', ...m });
  const deB = (k) => enviados.filter((m) => m.from === 'b2' && m.k === k);
  return { B, dice, deB };
}

test('la huella de las jugadas es la misma en los dos lados si las listas son iguales', () => {
  assert.equal(huella(['e2e4', 'e7e5']), huella(['e2e4', 'e7e5']));
  assert.notEqual(huella(['e2e4', 'e7e5']), huella(['e2e4', 'e7e6']));
  assert.notEqual(huella(['e2e4']), huella(['e2e4', 'e7e5']));
  assert.equal(typeof huella([]), 'string');
});

test('el latido lleva la huella; dos seguidos que no casan anulan la partida (y se le dice al rival), uno suelto no', async () => {
  const mias = ['e2e4', 'e7e5'];
  const { B, dice, deB } = partidaDeB(mias);
  assert.equal(deB('ping')[0].h, huella(mias));
  let anulada = 0;
  B.on('desync', () => anulada++);
  dice({ k: 'ping', n: 2, h: huella(['e2e4', 'e7e6']) }); // una que no casa
  await espera(10);
  dice({ k: 'ping', n: 2, h: huella(mias) }); // y luego sí: era de paso
  await espera(10);
  dice({ k: 'ping', n: 1, h: huella(['e2e4']) }); // de las que tengo, las suyas: casan
  dice({ k: 'ping', n: 3, h: 'zz' }); // más que yo: no se puede comparar
  dice({ k: 'ping', n: 2, h: huella(['e2e4', 'e7e6']) });
  await espera(10);
  assert.equal(anulada, 0);
  dice({ k: 'ping', n: 1, h: huella(['d2d4']) }); // la segunda seguida
  await espera(10);
  assert.equal(anulada, 1);
  assert.equal(deB('bye').length, 1);
  assert.equal(deB('bye')[0].anulada, true);
  dice({ k: 'move', n: 2, uci: 'g1f3' }); // ya no se escucha
  await espera(10);
  assert.equal(anulada, 1);
});

test('una lista del rival que no empieza como la mía anula la partida; una vieja, más corta, no', async () => {
  const { B, dice } = partidaDeB(['e2e4', 'e7e5', 'g1f3']);
  const listas = [];
  let anulada = 0;
  B.on('sync', ({ moves }) => listas.push(moves.length));
  B.on('desync', () => anulada++);
  dice({ k: 'sync', moves: ['e2e4'] });
  dice({ k: 'sync', moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'] });
  await espera(10);
  assert.deepEqual(listas, [1, 4]);
  assert.equal(anulada, 0);
  dice({ k: 'sync', moves: ['e2e4', 'e7e6'] });
  await espera(10);
  assert.equal(anulada, 1);
  assert.deepEqual(listas, [1, 4]);
});

test('si el rival anula la partida, aquí también; y se le pueden volver a pedir las jugadas', async () => {
  const { B, dice, deB } = partidaDeB([]);
  B.pide();
  assert.equal(deB('want').length, 1);
  let anulada = 0;
  let adios = 0;
  B.on('desync', () => anulada++);
  B.on('bye', () => adios++);
  dice({ k: 'bye', anulada: true });
  await espera(10);
  assert.equal(anulada, 1);
  assert.equal(adios, 0, 'no es un adiós (ni gana nadie)');
});

// ---- El que no tiene red puedo ser yo ----

// La partida de «b2» con la hora en la mano: `pasa(ms)` adelanta la hora y da los latidos que tocan (uno cada 4 s);
// `adelanta(ms)`, sin latidos (una pestaña de fondo, o el móvil dormido). `dice` habla por el rival y `estado`
// hace de bus.
function partidaConReloj({ enlace = () => true } = {}) {
  let hora = 0;
  let latir = null;
  const enviados = [];
  const oyentes = new Set();
  const estados = new Set();
  const bus = {
    subscribe: () => {},
    unsubscribe: () => {},
    publish: (topic, msg) => enviados.push(msg),
    onMessage: (fn) => {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    onEstado: (fn) => {
      estados.add(fn);
      return () => estados.delete(fn);
    },
  };
  const timers = { every: (fn) => (latir = fn), stop: () => (latir = null) };
  const sesion = createSession({ bus, me: 'b2', game: 'a1-b2-x', opponent: 'a1', white: 'a1', moves: () => [], now: () => hora, timers, enlaceBien: () => enlace() });
  const eventos = [];
  for (const k of ['lost', 'back', 'gone', 'cancel']) sesion.on(k, () => eventos.push(k));
  return {
    eventos,
    pings: () => enviados.filter((m) => m.k === 'ping').length,
    pasa(ms) {
      for (let i = 0; i < ms; i += 4000) {
        hora += Math.min(4000, ms - i);
        latir?.();
      }
    },
    adelanta(ms) {
      hora += ms;
    },
    dice: (msg) => {
      for (const fn of [...oyentes]) fn(gameTopic('a1-b2-x'), { from: 'a1', ...msg });
    },
    estado: (e) => {
      for (const fn of [...estados]) fn(e);
    },
  };
}

test('sin conexión sana, el silencio del rival no cuenta: ni «perdido» ni «ido»; con ella, sí', () => {
  let sana = false;
  const p = partidaConReloj({ enlace: () => sana });
  p.dice({ k: 'ping', n: 0 });
  p.pasa(100000); // el móvil sin cobertura: el rival calla porque no me llega nada
  assert.deepEqual(p.eventos, []);
  sana = true;
  p.pasa(20000);
  assert.deepEqual(p.eventos, []);
  p.pasa(4000);
  assert.deepEqual(p.eventos, ['lost'], 'a los 20 s de silencio con la conexión sana');
  p.pasa(96000);
  assert.deepEqual(p.eventos, ['lost'], 'a los 120 s, aún no');
  p.pasa(4000);
  assert.deepEqual(p.eventos, ['lost', 'gone']);
});

test('al volver al primer plano, el silencio del rival vuelve a contar desde cero', () => {
  const p = partidaConReloj();
  p.dice({ k: 'ping', n: 0 });
  p.adelanta(122000); // dos minutos en el bolsillo, sin un latido
  p.estado('revive');
  p.pasa(16000);
  assert.deepEqual(p.eventos, [], 'sin esto, al primer latido: «se ha ido»');
});

test('si llega su latido y el mío lleva un rato sin salir (una pestaña de fondo), le contesto con otro', () => {
  const p = partidaConReloj();
  assert.equal(p.pings(), 1, 'el del principio');
  p.adelanta(5000);
  p.dice({ k: 'ping', n: 0 });
  assert.equal(p.pings(), 2);
  p.adelanta(1000);
  p.dice({ k: 'ping', n: 0 });
  assert.equal(p.pings(), 2, 'con uno reciente basta');
});

test('si el rival no dice nada en 15 s de conexión sana, no ha llegado a la partida', () => {
  let sana = true;
  const p = partidaConReloj({ enlace: () => sana });
  p.pasa(12000);
  assert.deepEqual(p.eventos, []);
  sana = false;
  p.pasa(60000); // sin red no cuenta
  assert.deepEqual(p.eventos, []);
  sana = true;
  p.pasa(4000);
  assert.deepEqual(p.eventos, [], 'al volver, aún le quedan unos segundos');
  p.pasa(4000);
  assert.deepEqual(p.eventos, ['cancel']);
  // Y con una sola noticia suya, nunca.
  const q = partidaConReloj();
  q.dice({ k: 'want' });
  q.pasa(19000);
  assert.deepEqual(q.eventos, []);
});

test('si se pierde el primer «go», el repetido empareja a los dos igual', async () => {
  let gos = 0;
  const net = red({ drop: (m) => m.k === 'go' && gos++ === 0 });
  const a = createMatchmaker({ bus: net.bus('a'), me: 'a1', time: 'libre:libre', timers: rapido });
  const b = createMatchmaker({ bus: net.bus('b'), me: 'b2', time: 'libre:libre', timers: rapido });
  const [fa, fb] = await conPlazo(Promise.all([a.found, b.found]));
  assert.equal(fa.game, fb.game);
  assert.equal(gos, 2, 'el primero se perdió y llegó el segundo');
});

test('si no llega ningún «go», a quien lo mandó le llega un «cancel» en su partida: su rival no la empezó', async () => {
  const net = red({ drop: (m) => m.k === 'go' });
  const a = createMatchmaker({ bus: net.bus('a'), me: 'a1', time: 'libre:libre', timers: rapido });
  const b = createMatchmaker({ bus: net.bus('b'), me: 'b2', time: 'libre:libre', timers: rapido });
  const fa = await conPlazo(a.found); // «a1» ofrece y confirma: para él, ya hay partida
  const quieto = { every: () => 0, stop: () => {} };
  const sesion = createSession({ bus: net.bus('a'), me: 'a1', game: fa.game, opponent: 'b2', white: fa.white, moves: () => [], timers: quieto });
  await conPlazo(new Promise((resolve) => sesion.on('cancel', resolve)), 1000);
  assert.equal(b.state, 'seeking', 'y el otro sigue buscando');
  b.stop();
});

test('si no llega el «invite-go», quien aceptó se entera (null) y a quien retó le llega un «cancel»', async () => {
  const net = red({ drop: (m) => m.k === 'invite-go' });
  const a = createLobby({ bus: net.bus('a'), me: 'a1', timers: rapido });
  const b = createLobby({ bus: net.bus('b'), me: 'b2', timers: rapido });
  const llega = new Promise((resolve) => b.onInvite(resolve));
  const reto = a.invite('b2', { time: 'blitz:3+2' });
  const visto = await conPlazo(llega);
  const acepta = b.acceptInvite(visto.game);
  const mio = await conPlazo(reto.promise); // quien retó ya tiene partida
  const quieto = { every: () => 0, stop: () => {} };
  const sesion = createSession({ bus: net.bus('a'), me: 'a1', game: mio.game, opponent: 'b2', white: mio.white, moves: () => [], timers: quieto });
  const cancelada = new Promise((resolve) => sesion.on('cancel', resolve));
  assert.equal(await conPlazo(acepta), null);
  await conPlazo(cancelada, 1000);
  a.close();
  b.close();
});
