// Movimientos del alfil: en diagonal, hasta el borde del tablero o hasta la primera pieza. Si esa
// pieza es enemiga, puede comérsela. Como la torre, pero de esquina a esquina.

const FILES = 'abcdefgh';
const DIRECTIONS = [[1, 1], [1, -1], [-1, -1], [-1, 1]]; // [columnas, filas]: las cuatro diagonales

// `occupied`: casillas con alguna pieza; `enemies`: las que ocupan piezas del otro bando.
export function bishopMoves(square, occupied, enemies) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const moves = [];
  const captures = [];
  for (const [df, dr] of DIRECTIONS) {
    for (let f = file + df, r = rank + dr; f >= 0 && f < 8 && r >= 1 && r <= 8; f += df, r += dr) {
      const target = FILES[f] + r;
      if (occupied.has(target) || enemies.has(target)) {
        if (enemies.has(target)) captures.push(target);
        break;
      }
      moves.push(target);
    }
  }
  return { moves, captures };
}
