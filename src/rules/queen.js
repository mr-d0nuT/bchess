import { DIAGONAL, STRAIGHT, slideMoves } from './slide.js';

// Movimientos de la reina: los de la torre y los del alfil juntos, que por eso es la que más manda.

const DIRECTIONS = [...STRAIGHT, ...DIAGONAL];

export function queenMoves(square, occupied, enemies) {
  return slideMoves(square, occupied, enemies, DIRECTIONS);
}
