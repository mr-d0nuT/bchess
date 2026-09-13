// Casillas a las que puede avanzar un peón, sin capturas: una hacia delante si está libre,
// o dos desde su fila de salida si las dos están libres. En la última fila no avanza (la
// coronación llega con la Parte 2). `occupied` es un Set con las casillas ocupadas.

const PAWN_RULES = {
  white: { step: 1, startRank: 2, lastRank: 8 },
  black: { step: -1, startRank: 7, lastRank: 1 },
};

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
