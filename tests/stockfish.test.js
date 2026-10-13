import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Position } from '../src/chess/position.js';
import { ELO_MAX, ELO_MIN, createStockfish, jugadaDe, puntuacionDe, puntuadas } from '../src/chess/stockfish.js';

// El motor de verdad (`vendor/stockfish`), en Node: el mismo fichero que el navegador abre como hilo, aquí como un
// programa aparte con el que se habla por su entrada y su salida. Se le pone la cara de un Worker del navegador
// (`postMessage` y `onmessage`) y se apunta lo que se le manda.
class NodeWorker {
  constructor(url) {
    this.mandado = [];
    // Sin la marca del lanzador de pruebas: con ella, el motor se creería otra prueba y no contestaría.
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    this.proceso = spawn(process.execPath, [fileURLToPath(url)], { stdio: ['pipe', 'pipe', 'ignore'], env });
    let resto = '';
    this.proceso.stdout.on('data', (trozo) => {
      resto += trozo;
      let i;
      while ((i = resto.indexOf('\n')) >= 0) {
        const linea = resto.slice(0, i);
        resto = resto.slice(i + 1);
        this.onmessage?.({ data: linea });
      }
    });
  }

  postMessage(orden) {
    this.mandado.push(orden);
    this.proceso.stdin.write(`${orden}\n`);
  }

  terminate() {
    this.proceso.kill();
  }
}

function motor() {
  let hilo = null;
  const sf = createStockfish({ Worker: class extends NodeWorker { constructor(url) { super(url); hilo = this; } } });
  return { sf, mandado: () => hilo?.mandado ?? [] };
}

test('jugadaDe: la jugada de «bestmove», o null si no hay', () => {
  assert.equal(jugadaDe('bestmove e2e4 ponder e7e5'), 'e2e4');
  assert.equal(jugadaDe('bestmove e7e8q'), 'e7e8q');
  assert.equal(jugadaDe('bestmove (none)'), null);
  assert.equal(jugadaDe('info depth 3'), null);
});

test('puntuacionDe: la última puntuación de la mejor jugada; un mate, cuanto antes mejor', () => {
  assert.equal(puntuacionDe(['info depth 1 score cp 12 pv e2e4', 'info depth 2 score cp -30 pv d2d4', 'bestmove d2d4']), -30);
  assert.equal(puntuacionDe(['info depth 5 score mate 2 pv h5f7']), 30000 - 2);
  assert.equal(puntuacionDe(['info depth 5 score mate -3 pv a2a3']), -30000 + 3);
  // Con varias a la vez, la de la primera.
  assert.equal(puntuacionDe(['info depth 4 multipv 1 score cp 50 pv e2e4', 'info depth 4 multipv 2 score cp 10 pv a2a3']), 50);
  assert.equal(puntuacionDe(['bestmove e2e4']), 0);
});

test('puntuadas: cada jugada con lo más hondo que se ha mirado, de la mejor a la peor', () => {
  const lineas = [
    'info depth 1 seldepth 1 multipv 1 score cp 40 nodes 20 pv e2e4',
    'info depth 1 seldepth 1 multipv 2 score cp 30 nodes 20 pv d2d4',
    'info depth 1 seldepth 1 multipv 3 score cp -90 nodes 20 pv g2g4',
    'info depth 2 seldepth 2 multipv 1 score cp 35 nodes 90 pv d2d4 d7d5',
    'info depth 2 seldepth 2 multipv 2 score cp 20 lowerbound nodes 90 pv e2e4', // a medias: no cuenta
    'bestmove d2d4',
  ];
  assert.deepEqual(puntuadas(lineas), [
    { move: 'e2e4', score: 40 }, // de la vuelta 1: en la 2 no llegó a cerrarse
    { move: 'd2d4', score: 35 },
    { move: 'g2g4', score: -90 },
  ]);
});

test('Stockfish de verdad: ve el mate en una', async () => {
  const { sf } = motor();
  try {
    const { move, score } = await sf.bestMove({ fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', movetime: 300 });
    assert.equal(move, 'h5f7');
    assert.ok(score > 29000, 'se sabe mate');
  } finally {
    sf.terminate();
  }
});

test('Stockfish de verdad: juega desde las jugadas hechas, a la fuerza pedida, y se le pone y quita el freno', async () => {
  const { sf, mandado } = motor();
  try {
    const moves = ['e2e4', 'e7e5', 'g1f3'];
    const { move } = await sf.bestMove({ moves, movetime: 150, elo: 1500 });
    const p = Position.initial();
    for (const m of moves) p.playUci(m);
    assert.ok(p.findUci(move) !== null && p.findUci(move) !== undefined, `${move} vale ahí`);
    assert.ok(mandado().includes('setoption name UCI_LimitStrength value true'));
    assert.ok(mandado().includes('setoption name UCI_Elo value 1500'));
    assert.ok(mandado().includes('position startpos moves e2e4 e7e5 g1f3'));
    // Más allá de lo que admite, lo que admite; y sin elo, a toda su fuerza.
    await sf.bestMove({ moves, movetime: 50, elo: 9999 });
    assert.ok(mandado().includes(`setoption name UCI_Elo value ${ELO_MAX}`));
    await sf.bestMove({ moves, movetime: 50, elo: 100 });
    assert.ok(mandado().includes(`setoption name UCI_Elo value ${ELO_MIN}`));
    await sf.bestMove({ moves, movetime: 50 });
    assert.equal(mandado().filter((o) => o === 'setoption name UCI_LimitStrength value false').length, 1);
  } finally {
    sf.terminate();
  }
});

test('Stockfish de verdad: puntúa todas las jugadas, y la que cuelga la dama es de las peores', async () => {
  const { sf } = motor();
  try {
    // Blancas: la dama de d1 puede ir a h5, donde la come el caballo de f6.
    const fen = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 3';
    const scored = await sf.scoreMoves({ fen, movetime: 400, multipv: 50 });
    const p = Position.fromFEN(fen);
    assert.equal(scored.length, p.legalMoves().length, 'todas');
    for (let i = 1; i < scored.length; i++) assert.ok(scored[i - 1].score >= scored[i].score, 'de la mejor a la peor');
    const regalo = scored.findIndex(({ move }) => move === 'd1h5');
    assert.ok(regalo >= scored.length - 5, `colgar la dama (${regalo + 1}.ª de ${scored.length}) es de las peores`);
    // Y después juega normal, con una sola.
    const { move } = await sf.bestMove({ fen, movetime: 100 });
    assert.ok(p.findUci(move) !== null && p.findUci(move) !== undefined);
  } finally {
    sf.terminate();
  }
});

test('Stockfish de verdad: cómo va, para el que mueve', async () => {
  const { sf } = motor();
  try {
    const conDama = '4k3/8/8/8/8/8/Q7/4K3'; // la dama en a2: sin dar jaque, que con las blancas mueve sería imposible
    assert.ok(await sf.evaluate({ fen: `${conDama} w - - 0 1`, movetime: 150 }) > 500, 'las blancas, con la dama, van ganando');
    assert.ok(await sf.evaluate({ fen: `${conDama} b - - 0 1`, movetime: 150 }) < -500, 'y las negras, perdiendo');
  } finally {
    sf.terminate();
  }
});

test('si se queda sin contestar, se rinde a tiempo y vuelve a arrancar para la siguiente', async () => {
  // Un motor que contesta a todo menos a pensar.
  let arrancados = 0;
  class Mudo {
    constructor() {
      arrancados += 1;
    }

    postMessage(orden) {
      const di = (l) => setTimeout(() => this.onmessage?.({ data: l }), 1);
      if (orden === 'uci') di('uciok');
      else if (orden === 'isready') di('readyok');
    }

    terminate() {}
  }
  const sf = createStockfish({ Worker: Mudo, margin: 50 });
  await assert.rejects(sf.bestMove({ movetime: 20 }), /no contesta/);
  assert.equal(sf.broken, null, 'no se da por roto: se reinicia');
  await assert.rejects(sf.bestMove({ movetime: 20 }), /no contesta/);
  assert.equal(arrancados, 2, 'la segunda vez, con un hilo nuevo');
});

test('sin hilos no hay Stockfish, y se sabe (para que piense el motor propio)', async () => {
  const sf = createStockfish({ Worker: undefined });
  await assert.rejects(sf.bestMove({ movetime: 50 }));
  assert.ok(sf.broken);
});
