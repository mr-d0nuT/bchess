// Casillas a las que puede avanzar un peón blanco, sin capturas: una hacia delante si
// está libre, o dos desde la fila 2 si las dos están libres. En la fila 8 no avanza
// (la coronación llega con la Parte 2). `occupied` es un Set con las casillas ocupadas.

export function whitePawnMoves(square, occupied) {
  const file = square[0];
  const rank = Number(square[1]);
  const moves = [];
  if (rank >= 8) return moves;
  const one = file + (rank + 1);
  if (occupied.has(one)) return moves;
  moves.push(one);
  const two = file + (rank + 2);
  if (rank === 2 && !occupied.has(two)) moves.push(two);
  return moves;
}
