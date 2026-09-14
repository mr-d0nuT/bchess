// Casillas a las que puede avanzar un peón, sin capturas: una hacia delante si está libre,
// o dos desde su fila de salida si las dos están libres. En la última fila no avanza (la
// coronación llega con la Parte 2). `occupied` es un Set con las casillas ocupadas.

const PAWN_RULES = {
  white: { step: 1, startRank: 2, lastRank: 8 },
  black: { step: -1, startRank: 7, lastRank: 1 },
};
const FILES = 'abcdefgh';

export function pawnMoves(square, occupied, color = 'white') {
  if (!Object.hasOwn(PAWN_RULES, color)) throw new Error(`Color no válido: ${color}`);
  const { step, startRank, lastRank } = PAWN_RULES[color];
  const file = square[0];
  const rank = Number(square[1]);
  const moves = [];
  if (rank === lastRank) return moves;
  const one = file + (rank + step);
  if (occupied.has(one)) return moves;
  moves.push(one);
  const two = file + (rank + 2 * step);
  if (rank === startRank && !occupied.has(two)) moves.push(two);
  return moves;
}

// Casillas que puede comer: en diagonal hacia delante, ocupadas por un enemigo. `enemies` es
// un Set con las casillas de las piezas del otro color.
export function pawnCaptures(square, enemies, color = 'white') {
  if (!Object.hasOwn(PAWN_RULES, color)) throw new Error(`Color no válido: ${color}`);
  const { step, lastRank } = PAWN_RULES[color];
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (rank === lastRank) return [];
  const captures = [];
  for (const side of [-1, 1]) {
    const column = FILES[file + side];
    const target = column && column + (rank + step);
    if (target && enemies.has(target)) captures.push(target);
  }
  return captures;
}
