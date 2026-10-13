import { Position } from './position.js';
import { pickBookMove } from './book.js';
import { pickLikeAPerson } from './engine.js';
import { createStockfish } from './stockfish.js';
import { cpuPlan } from './cpu-plan.js';

// La CPU vista desde la partida: se le pasa la partida (la posición de salida en FEN y las jugadas
// hechas desde ella) y el nivel, y contesta (en su hilo) con la suya, en notación UCI («e7e5»). Piensa Stockfish, como
// dice el nivel (`cpu-plan.js`). Si no arranca (un navegador viejo), piensa el motor propio; y si el navegador no deja
// crear hilos, el propio piensa en este mismo, y el tablero se queda quieto mientras tanto: peor, pero juega.
export function createCpu({ stockfish = createStockfish() } = {}) {
  let worker = null;
  const pendientes = new Map();
  let siguiente = 1;

  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const espera = pendientes.get(data.id);
      if (!espera) return;
      pendientes.delete(data.id);
      if (data.error) espera.reject(new Error(data.error));
      else espera.resolve('score' in data ? data.score : data.move);
    };
    worker.onerror = (event) => {
      console.error('[BChess] El hilo de la CPU falló; piensa en el principal:', event.message ?? event);
      worker = null;
      for (const espera of pendientes.values()) espera.reject(new Error('sin hilo'));
      pendientes.clear();
    };
  } catch (err) {
    console.error('[BChess] No se pudo crear el hilo de la CPU:', err);
    worker = null;
  }

  async function enEsteHilo({ fen, moves, maxMs }, level) {
    const { chooseMove } = await import('./engine.js');
    const p = fen ? Position.fromFEN(fen) : Position.initial();
    for (const uci of moves) p.playUci(uci);
    const m = chooseMove(p, level, { maxMs });
    return m === null ? null : Position.uci(m);
  }
  async function valoraAqui({ fen, moves }) {
    const { valora } = await import('./engine.js');
    const p = fen ? Position.fromFEN(fen) : Position.initial();
    for (const uci of moves) p.playUci(uci);
    return valora(p);
  }

  // El motor propio, en su hilo.
  function propio(partida, level) {
    if (!worker) return enEsteHilo(partida, level);
    const id = siguiente++;
    return new Promise((resolve, reject) => {
      pendientes.set(id, { resolve, reject });
      worker.postMessage({ id, fen: partida.fen, moves: partida.moves, level, maxMs: partida.maxMs ?? null });
    }).catch(() => enEsteHilo(partida, level));
  }
  function valoraPropio(partida) {
    if (!worker) return valoraAqui(partida);
    const id = siguiente++;
    return new Promise((resolve, reject) => {
      pendientes.set(id, { resolve, reject });
      worker.postMessage({ id, fen: partida.fen, moves: partida.moves, que: 'valora' });
    }).catch(() => valoraAqui(partida));
  }

  // Stockfish: primero el libro (aperturas de verdad, y no siempre la misma) y luego él, a la fuerza del nivel. Con
  // reloj piensa lo que se pueda permitir (`maxMs`); sin él, lo de su nivel.
  async function conStockfish({ fen, moves, maxMs }, plan) {
    const p = fen ? Position.fromFEN(fen) : Position.initial();
    for (const uci of moves) p.playUci(uci);
    const jugadas = (p.fullmove - 1) * 2 + (p.side === 'white' ? 0 : 1);
    if (jugadas < plan.book) {
      const libro = pickBookMove(p);
      if (libro && p.findUci(libro) !== null && p.findUci(libro) !== undefined) return libro;
    }
    const movetime = maxMs > 0 ? Math.min(maxMs, Math.max(plan.movetime, maxMs * 0.5)) : plan.movetime;
    if (plan.persona) {
      // Por debajo de lo que Stockfish sabe jugar flojo: puntúa todas y se elige como una persona de ese nivel.
      const scored = await stockfish.scoreMoves({ fen, moves, movetime, multipv: plan.persona.multipv });
      const legales = scored.filter(({ move }) => p.findUci(move) !== null && p.findUci(move) !== undefined);
      if (legales.length) return pickLikeAPerson(legales, plan.persona.temperature);
    }
    const { move } = await stockfish.bestMove({ fen, moves, movetime, elo: plan.elo });
    return move;
  }

  return {
    // La jugada de la CPU para la partida `{ fen, moves, maxMs }` en el nivel `level` (1-100).
    think(partida, level) {
      const plan = cpuPlan(level);
      if (stockfish.broken) return propio(partida, level);
      return conStockfish(partida, plan).catch((err) => {
        console.error('[BChess] Stockfish no ha podido pensar; piensa el motor propio:', err);
        return propio(partida, level);
      });
    },
    // Cómo va la partida `{ fen, moves }` para el que mueve (en centésimas de peón): para decidir si acepta unas
    // tablas. Lo mira Stockfish, a toda su fuerza; si no puede, el propio.
    valora(partida) {
      if (stockfish.broken) return valoraPropio(partida);
      return stockfish.evaluate({ fen: partida.fen, moves: partida.moves, movetime: 300 }).catch(() => valoraPropio(partida));
    },
    // Que vaya arrancando Stockfish: la primera jugada no espera a que se baje y arranque.
    prepare() {
      stockfish.ready().catch(() => {});
    },
    // Lo que estuviera pensando ya no importa (partida nueva): se contesta null.
    cancel() {
      for (const espera of pendientes.values()) espera.resolve(null);
      pendientes.clear();
      stockfish.stop();
    },
  };
}
