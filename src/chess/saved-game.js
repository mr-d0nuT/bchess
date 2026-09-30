// La partida a medias, guardada en el propio navegador (punto 4 del plan de mejora). Si se cierra la
// app, se apaga el móvil o el navegador tira la página, al volver el menú ofrece «Continuar partida» y
// todo sigue donde estaba, relojes incluidos.
//
// Se guarda poco y bien: la posición de salida y la lista de jugadas (como en la CPU y en deshacer, de
// ahí sale todo lo demás), cómo se juega (modo, nivel, color del jugador, ritmo) y lo que le queda a
// cada reloj. Al leerla se comprueba jugada a jugada: si algo no cuadra (otra versión, datos rotos, una
// partida ya acabada), no hay nada que continuar.

import { Position } from './position.js';

export const SAVE_KEY = 'bchess.partida';
const VERSION = 1;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

// Lo que se guarda.
export function packGame({ start, moves, mode, level, human, color, time, clock = null, now }) {
  return { v: VERSION, start, moves: [...moves], mode, level, human, color, time, reloj: clock, cuando: now };
}

// La partida guardada (texto de `localStorage`), comprobada y con su posición ya jugada; o null.
export function readSavedGame(raw) {
  let g;
  try {
    g = JSON.parse(raw ?? 'null');
  } catch {
    return null;
  }
  if (!g || g.v !== VERSION || !Array.isArray(g.moves) || !g.moves.length) return null;
  if (g.mode !== 'pvp' && g.mode !== 'cpu') return null;
  if (g.human !== 'white' && g.human !== 'black') return null;
  if (!g.moves.every((m) => typeof m === 'string' && UCI.test(m))) return null;
  let position;
  try {
    position = Position.fromFEN(g.start);
    for (const uci of g.moves) {
      const m = position.findUci(uci);
      if (m === null || m === undefined) return null; // una jugada que no vale ahí: la lista no es de esta partida
      position.make(m);
    }
  } catch {
    return null;
  }
  const status = position.status();
  if (status !== 'playing' && status !== 'check') return null; // acabada: nada que continuar
  const tiempo = (ms) => (Number.isFinite(ms) && ms >= 0 ? ms : null);
  const reloj = g.reloj && tiempo(g.reloj.white) !== null && tiempo(g.reloj.black) !== null
    ? { white: g.reloj.white, black: g.reloj.black }
    : null;
  return {
    start: g.start,
    moves: [...g.moves],
    position,
    mode: g.mode,
    level: Math.max(1, Math.min(100, Math.round(Number(g.level) || 30))),
    human: g.human,
    color: ['white', 'black', 'random'].includes(g.color) ? g.color : g.human,
    time: typeof g.time === 'string' ? g.time : 'libre:libre',
    reloj,
    cuando: Number.isFinite(g.cuando) ? g.cuando : null,
  };
}

// Lo que le queda a cada reloj al continuar. Con la app cerrada no se juega, y el tiempo se congela;
// menos en la diaria, que es un plazo de calendario (tantos días por jugada): al que le toca se le ha
// ido gastando mientras tanto, como en el ajedrez por correspondencia.
export function clockOnResume(saved, control, now) {
  if (!saved.reloj) return null;
  const reloj = { ...saved.reloj };
  if (control?.perMove && saved.cuando !== null) {
    const lado = saved.position.side;
    reloj[lado] = Math.max(0, reloj[lado] - Math.max(0, now - saved.cuando));
  }
  return reloj;
}
