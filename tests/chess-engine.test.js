import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../src/chess/position.js';
import { chooseMove, createEngine, evaluate, levelSettings, pickLikeAPerson } from '../src/chess/engine.js';
import { bookMoves, pickBookMove } from '../src/chess/book.js';

const uci = (m) => Position.uci(m);
// Un «azar» que siempre devuelve lo mismo, para que las pruebas no dependan de la suerte.
const fijo = (x) => () => x;

test('ve el mate en una', () => {
  const p = Position.fromFEN('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  const { move } = createEngine().search(p, { depth: 3, timeMs: 5000 });
  assert.equal(uci(move), 'a1a8');
});

test('se come la dama que le dejan colgando', () => {
  const p = Position.fromFEN('rnb1kbnr/pppp1ppp/8/4q3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3');
  const { move } = createEngine().search(p, { depth: 3, timeMs: 5000 });
  assert.equal(uci(move), 'f3e5', 'el caballo de f3 se come la dama de e5');
});

test('no deja la dama colgando por comerse un peón', () => {
  // La dama blanca puede comerse el peón de b7, pero entonces la torre de a8 no… se la come el alfil.
  const p = Position.fromFEN('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 2 3');
  const { move } = createEngine().search(p, { depth: 4, timeMs: 5000 });
  const tras = Position.fromFEN(p.toFEN());
  tras.make(move);
  // Después de su jugada, el rival no puede ganar la dama de golpe.
  const respuesta = createEngine().search(tras, { depth: 2, timeMs: 5000 });
  const final = Position.fromFEN(tras.toFEN());
  final.make(respuesta.move);
  let damas = 0;
  for (let s = 0; s < 128; s++) if (!(s & 0x88) && final.board[s] === 5) damas += 1;
  assert.equal(damas, 1);
});

test('mate en dos con la dama y la torre', () => {
  const p = Position.fromFEN('k7/8/1K6/8/8/8/8/7R w - - 0 1');
  const { move, score } = createEngine().search(p, { depth: 5, timeMs: 5000 });
  assert.equal(uci(move), 'h1h8');
  assert.ok(score > 20000, `debería ver el mate (${score})`);
});

test('la puntuación es simétrica: la misma posición vista desde el otro bando', () => {
  const blancas = Position.fromFEN('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  assert.equal(evaluate(blancas), 0);
  const ventaja = Position.fromFEN('rnbqkbnr/pppp1ppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  assert.ok(evaluate(ventaja) > 50, 'un peón de más se nota');
});

test('los niveles van de flojo a fuerte', () => {
  const uno = levelSettings(1);
  const cien = levelSettings(100);
  assert.ok(uno.depth < cien.depth);
  assert.ok(uno.noise > cien.noise);
  assert.equal(cien.noise, 0);
  assert.equal(cien.temperature, 0, 'el nivel más alto juega siempre su mejor jugada');
  assert.ok(uno.temperature > 100, 'el más bajo se conforma a menudo con una peor');
  assert.ok(levelSettings(30).temperature < uno.temperature);
  assert.ok(uno.book < cien.book, 'el principiante se sale antes del libro');
  assert.equal(uno.random, undefined, 'ya no mueve nunca a lo loco');
  assert.ok(cien.timeMs <= 2100, 'ni en el nivel más alto se piensa más de dos segundos');
});

// Un azar que se repite (mulberry32): las pruebas de estadística no dependen de la suerte.
function semilla(n) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('como una persona: la mejor es la más probable, y una mucho peor casi nunca sale', () => {
  const scored = [{ move: 'buena', score: 50 }, { move: 'regular', score: 0 }, { move: 'mala', score: -900 }];
  const azar = semilla(7);
  const veces = { buena: 0, regular: 0, mala: 0 };
  for (let i = 0; i < 2000; i++) veces[pickLikeAPerson(scored, 100, azar)] += 1;
  assert.ok(veces.buena > veces.regular, JSON.stringify(veces));
  assert.ok(veces.regular > 300, `la regular también sale: ${JSON.stringify(veces)}`);
  assert.ok(veces.mala < 10, `la que pierde la dama, casi nunca: ${JSON.stringify(veces)}`);
  // Sin temperatura que valga, siempre la mejor.
  assert.equal(pickLikeAPerson(scored, 1, semilla(3)), 'buena');
});

test('el nivel 1 ya no regala: casi siempre se come la dama que le dejan', () => {
  const p = Position.fromFEN('rnb1kbnr/pppp1ppp/8/4q3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3');
  const azar = semilla(11);
  let come = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const m = chooseMove(p, 1, { random: azar, clock: (() => { let t = 0; return () => (t += 5); })() });
    if (uci(m) === 'f3e5') come += 1;
  }
  assert.ok(come >= N * 0.8, `se la come ${come} de ${N} veces`);
});

test('el libro de aperturas: jugadas de verdad, y no siempre la misma', () => {
  const inicio = Position.initial();
  const primeras = bookMoves(inicio).map((o) => o.uci).sort();
  assert.deepEqual(primeras, ['c2c4', 'd2d4', 'e2e4', 'g1f3']);
  const azar = semilla(5);
  const vistas = new Set();
  for (let i = 0; i < 60; i++) vistas.add(Position.uci(chooseMove(inicio, 100, { random: azar })));
  assert.ok(vistas.size >= 3, `abre con ${[...vistas].join(', ')}`);
  for (const m of vistas) assert.ok(primeras.includes(m));
  // Llegando a la misma posición por otro orden de jugadas, el libro también la conoce.
  const p = Position.initial();
  for (const m of ['c2c4', 'g8f6', 'd2d4', 'e7e6', 'b1c3', 'f8b4']) p.playUci(m); // la nimzoindia, por otro orden
  assert.ok(bookMoves(p).some((o) => o.uci === 'e2e3'), 'la nimzoindia por otro orden');
  assert.equal(pickBookMove(Position.fromFEN('8/8/8/4k3/8/8/8/4K3 w - - 0 1')), null);
});

test('en cualquier nivel devuelve una jugada que vale', () => {
  const p = Position.initial();
  for (const level of [1, 10, 35, 60, 100]) {
    for (const r of [0.01, 0.5, 0.99]) {
      const m = chooseMove(p, level, { random: fijo(r), clock: (() => { let t = 0; return () => (t += 50); })() });
      assert.ok(p.legalMoves().includes(m), `nivel ${level}: ${uci(m)}`);
    }
  }
});

test('se para cuando se le acaba el tiempo y aun así contesta', () => {
  let t = 0;
  const reloj = () => (t += 1);
  const p = Position.initial();
  const { move, depth } = createEngine().search(p, { depth: 30, timeMs: 5000, clock: reloj });
  assert.ok(p.legalMoves().includes(move));
  assert.ok(depth < 30);
  assert.equal(p.toFEN(), Position.initial().toFEN(), 'el tablero queda como estaba');
});

test('velocidad: al menos unas decenas de miles de posiciones por segundo', () => {
  const p = Position.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const t0 = Date.now();
  const { nodes, depth } = createEngine().search(p, { depth: 20, timeMs: 1000 });
  const s = (Date.now() - t0) / 1000;
  console.log(`   ${Math.round(nodes / s)} posiciones/s, profundidad ${depth}`);
  assert.ok(nodes / s > 20000);
});
