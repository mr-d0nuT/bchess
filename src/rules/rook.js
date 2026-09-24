import { STRAIGHT, slideMoves } from './slide.js';

// Movimientos de la torre: en línea recta, en horizontal o en vertical, hasta el borde del
// tablero o hasta la primera pieza. Si esa pieza es enemiga, puede comérsela.

export function rookMoves(square, occupied, enemies) {
  return slideMoves(square, occupied, enemies, STRAIGHT);
}
