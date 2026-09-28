import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_FEN, Position, describeMove } from '../src/chess/position.js';

// «Perft»: cuántas partidas distintas hay a N jugadas de una posición. Los números de referencia los
// conoce todo el que escribe motores (chessprogramming.org); si una sola regla está mal —un enroque
// a través de jaque, una captura al paso que deja al rey al descubierto, una coronación de menos—,
// el recuento no cuadra.
function perft(p, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of p.generate()) {
    if (!p.make(m)) continue;
    nodes += perft(p, depth - 1);
    p.unmake();
  }
  return nodes;
}

test('perft desde la posición inicial: 20, 400, 8902, 197281', () => {
  const p = Position.initial();
  assert.equal(perft(p, 1), 20);
  assert.equal(perft(p, 2), 400);
  assert.equal(perft(p, 3), 8902);
  assert.equal(perft(p, 4), 197281);
  assert.equal(p.toFEN(), INITIAL_FEN, 'hacer y deshacer deja el tablero como estaba');
});

test('perft de «Kiwipete» (enroques, capturas al paso y coronaciones): 48, 2039, 97862', () => {
  const p = Position.fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  assert.equal(perft(p, 1), 48);
  assert.equal(perft(p, 2), 2039);
  assert.equal(perft(p, 3), 97862);
});

test('perft de la posición 3 (jaques descubiertos y capturas al paso que no valen): 14, 191, 2812, 43238', () => {
  const p = Position.fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
  assert.equal(perft(p, 1), 14);
  assert.equal(perft(p, 2), 191);
  assert.equal(perft(p, 3), 2812);
  assert.equal(perft(p, 4), 43238);
});

test('perft de la posición 4 (coronaciones y enroques con el rey atacado): 6, 264, 9467', () => {
  const p = Position.fromFEN('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
  assert.equal(perft(p, 1), 6);
  assert.equal(perft(p, 2), 264);
  assert.equal(perft(p, 3), 9467);
});

test('perft de la posición 5: 44, 1486, 62379', () => {
  const p = Position.fromFEN('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
  assert.equal(perft(p, 1), 44);
  assert.equal(perft(p, 2), 1486);
  assert.equal(perft(p, 3), 62379);
});

test('empiezan las blancas y luego mueven las negras', () => {
  const p = Position.initial();
  assert.equal(p.side, 'white');
  assert.equal(p.findUci('e7e5'), null, 'las negras no pueden mover primero');
  p.playUci('e2e4');
  assert.equal(p.side, 'black');
  assert.equal(p.findUci('d2d4'), null, 'las blancas no pueden mover dos veces seguidas');
  assert.notEqual(p.findUci('e7e5'), null);
});

test('mate del pastor: jaque mate y la partida se acaba', () => {
  const p = Position.initial();
  for (const m of ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6']) p.playUci(m);
  assert.equal(p.status(), 'playing');
  p.playUci('h5f7');
  assert.equal(p.status(), 'checkmate');
  assert.equal(p.legalMoves().length, 0);
});

test('jaque: solo valen las jugadas que lo quitan', () => {
  const p = Position.fromFEN('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
  assert.equal(p.status(), 'check');
  const jugadas = p.legalMoves().map((m) => Position.uci(m)).sort();
  assert.deepEqual(jugadas, ['e1d1', 'e1e2', 'e1f1']);
});

test('ahogado: sin jugadas y sin jaque son tablas', () => {
  const p = Position.fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(p.status(), 'stalemate');
});

test('tablas por material insuficiente y por la regla de las cincuenta jugadas', () => {
  assert.equal(Position.fromFEN('8/8/4k3/8/8/3NK3/8/8 w - - 0 1').status(), 'material');
  assert.equal(Position.fromFEN('8/8/4k3/8/8/3BK3/8/8 w - - 0 1').status(), 'material');
  assert.equal(Position.fromFEN('8/8/4k3/8/8/3RK3/8/8 w - - 0 1').status(), 'playing');
  assert.equal(Position.fromFEN('8/8/4k3/8/8/3RK3/8/8 w - - 100 80').status(), 'fifty');
});

test('tablas por triple repetición', () => {
  const p = Position.initial();
  for (let i = 0; i < 2; i++) for (const m of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) p.playUci(m);
  assert.equal(p.repetitions(), 3);
  assert.equal(p.status(), 'repetition');
});

test('enroque: el rey va dos casillas y la torre salta por encima', () => {
  const p = Position.fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const corto = p.findUci('e1g1');
  const plan = describeMove(p, corto);
  assert.deepEqual(plan.castle, { rookFrom: 'h1', rookTo: 'f1' });
  p.make(corto);
  assert.equal(p.pieceAt('g1').kind, 'king');
  assert.equal(p.pieceAt('f1').kind, 'rook');
  assert.equal(p.pieceAt('h1'), null);
  const largo = describeMove(p, p.findUci('e8c8'));
  assert.deepEqual(largo.castle, { rookFrom: 'a8', rookTo: 'd8' });
});

test('no se enroca a través de una casilla atacada ni estando en jaque', () => {
  const pasa = Position.fromFEN('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1');
  assert.equal(pasa.findUci('e1g1'), null, 'f1 está atacada');
  assert.notEqual(pasa.findUci('e1c1'), null);
  const jaque = Position.fromFEN('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1');
  assert.equal(jaque.findUci('e1c1'), null);
  assert.equal(jaque.findUci('e1g1'), null);
});

test('captura al paso: el peón comido no está en la casilla de destino', () => {
  const p = Position.initial();
  for (const m of ['e2e4', 'a7a6', 'e4e5', 'd7d5']) p.playUci(m);
  const m = p.findUci('e5d6');
  const plan = describeMove(p, m);
  assert.equal(plan.enPassant, true);
  assert.equal(plan.captured, 'd5');
  p.make(m);
  assert.equal(p.pieceAt('d5'), null);
  assert.equal(p.pieceAt('d6').kind, 'pawn');
  p.unmake();
  assert.equal(p.pieceAt('d5').kind, 'pawn');
});

test('coronación: el peón que llega a la última fila elige en qué se convierte', () => {
  const p = Position.fromFEN('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
  const opciones = p.legalMoves().map((m) => Position.uci(m)).filter((u) => u.startsWith('e7'));
  assert.deepEqual(opciones.sort(), ['e7e8b', 'e7e8n', 'e7e8q', 'e7e8r']);
  const plan = describeMove(p, p.findUci('e7e8n'));
  assert.equal(plan.promotion, 'knight');
  p.playUci('e7e8q');
  assert.equal(p.pieceAt('e8').kind, 'queen');
});

test('la huella de la posición es la misma venga por donde venga', () => {
  const a = Position.initial();
  for (const m of ['g1f3', 'g8f6', 'b1c3']) a.playUci(m);
  const b = Position.initial();
  for (const m of ['b1c3', 'g8f6', 'g1f3']) b.playUci(m);
  assert.equal(a.hashLo, b.hashLo);
  assert.equal(a.hashHi, b.hashHi);
  const c = Position.fromFEN(a.toFEN());
  assert.equal(c.hashLo, a.hashLo);
});

test('material para dar mate: cuenta cuando al rival se le acaba el tiempo', () => {
  const p = Position.fromFEN('4k3/8/8/8/8/8/4P3/3NK3 w - - 0 1');
  assert.equal(p.hasMatingMaterial('white'), true, 'con un peón, sí');
  assert.equal(p.hasMatingMaterial('black'), false, 'el rey solo, no');
  assert.equal(Position.fromFEN('4k3/8/8/8/8/8/8/2BNK3 w - - 0 1').hasMatingMaterial('white'), true, 'dos menores, sí');
  assert.equal(Position.fromFEN('4k3/8/8/8/8/8/8/3NK3 w - - 0 1').hasMatingMaterial('white'), false, 'un caballo suelto, no');
});
