import test from 'node:test';
import assert from 'node:assert/strict';
import { connectPacket, encodeLength, publishPacket, readPublish, splitPackets, PUBLISH } from '../src/net/mqtt.js';
import { createMatchmaker, createSession } from '../src/net/online.js';

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
  const a = createMatchmaker({ bus: net.bus('a'), me: 'a1', time: 'blitz:3+2', now, timers: rapido });
  reloj = 2000;
  const b = createMatchmaker({ bus: net.bus('b'), me: 'b2', time: 'libre:libre', now, timers: rapido });
  const [fa, fb] = await conPlazo(Promise.all([a.found, b.found]));
  assert.equal(fa.game, fb.game);
  assert.equal(fa.white, fb.white);
  assert.ok(['a1', 'b2'].includes(fa.white));
  assert.equal(fa.opponent, 'b2');
  assert.equal(fb.opponent, 'a1');
  assert.equal(fa.time, 'blitz:3+2');
  assert.equal(fb.time, 'blitz:3+2');
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
