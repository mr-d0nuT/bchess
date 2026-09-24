// Las piezas que se deslizan (torre, alfil y reina) se mueven todas igual: tiran en línea recta en
// cada una de sus direcciones hasta el borde del tablero o hasta la primera pieza que encuentran, y
// si esa pieza es enemiga, pueden comérsela. Lo único que las distingue son las direcciones.

const FILES = 'abcdefgh';

export const STRAIGHT = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // arriba, abajo, derecha, izquierda
export const DIAGONAL = [[1, 1], [1, -1], [-1, -1], [-1, 1]]; // las cuatro esquinas

// `occupied`: casillas con alguna pieza; `enemies`: las que ocupan piezas del otro bando.
// `directions`: pares [columnas, filas].
export function slideMoves(square, occupied, enemies, directions) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const moves = [];
  const captures = [];
  for (const [df, dr] of directions) {
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
