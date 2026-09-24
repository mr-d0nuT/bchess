// Movimientos del rey: una sola casilla, pero en cualquiera de las ocho direcciones. Si en esa
// casilla hay una pieza enemiga, se la come; si es de las suyas, no puede ir.
//
// Sin enroque ni jaque: este juego no lleva la partida, solo mueve las piezas (como el Battle Chess
// del 88 en su modo libre).

import { DIAGONAL, STRAIGHT } from './slide.js';

const FILES = 'abcdefgh';
const DIRECTIONS = [...STRAIGHT, ...DIAGONAL];

export function kingMoves(square, occupied, enemies) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const moves = [];
  const captures = [];
  for (const [df, dr] of DIRECTIONS) {
    const f = file + df;
    const r = rank + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) continue;
    const target = FILES[f] + r;
    if (enemies.has(target)) captures.push(target);
    else if (!occupied.has(target)) moves.push(target);
  }
  return { moves, captures };
}
