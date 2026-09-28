import { Position } from './position.js';
import { chooseMove, createEngine } from './engine.js';

// El hilo de la CPU. Pensar le lleva hasta dos segundos, y en el hilo de la página eso congelaría
// el tablero: las piezas dejarían de respirar y la música de avanzar la animación. Aquí piensa
// aparte y contesta con la jugada.
//
// Recibe la partida entera (la posición de salida y las jugadas desde ella) y no solo la posición
// de ahora: para las tablas por repetición hay que saber por dónde se ha pasado.
const engine = createEngine();

self.onmessage = ({ data }) => {
  const { id, fen, moves, level, maxMs } = data;
  try {
    const p = fen ? Position.fromFEN(fen) : Position.initial();
    for (const uci of moves) p.playUci(uci);
    const m = chooseMove(p, level, { engine, maxMs });
    self.postMessage({ id, move: m === null ? null : Position.uci(m) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
