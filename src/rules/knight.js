// Movimientos del caballero: en L, dos casillas en una dirección y una en perpendicular, saltando por
// encima de cualquier pieza. No puede ir a una casilla con una pieza propia; si en ella hay una
// enemiga, puede comérsela.

const FILES = 'abcdefgh';
// [columnas, filas], en el sentido de las agujas del reloj desde arriba a la derecha.
const JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

// `occupied`: casillas con alguna pieza; `enemies`: las que ocupan piezas del otro bando.
export function knightMoves(square, occupied, enemies) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const moves = [];
  const captures = [];
  for (const [df, dr] of JUMPS) {
    const f = file + df;
    const r = rank + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) continue;
    const target = FILES[f] + r;
    if (enemies.has(target)) captures.push(target);
    else if (!occupied.has(target)) moves.push(target);
  }
  return { moves, captures };
}
