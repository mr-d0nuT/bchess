import { DIAGONAL, slideMoves } from './slide.js';

// Movimientos del alfil: en diagonal, hasta el borde del tablero o hasta la primera pieza. Si esa
// pieza es enemiga, puede comérsela. Como la torre, pero de esquina a esquina.

export function bishopMoves(square, occupied, enemies) {
  return slideMoves(square, occupied, enemies, DIAGONAL);
}
