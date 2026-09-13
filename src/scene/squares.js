// Conversión entre casillas de ajedrez («e2») y posiciones en el tablero.
// Unidad: 1 = lado de una casilla. Blancas en +Z (cerca de la cámara), columnas a→h en +X.

const FILES = 'abcdefgh';

export function squareToPosition(square) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return { x: file - 3.5, z: 3.5 - rank };
}

export function positionToSquare(x, z) {
  const file = Math.floor(x + 4);
  const rank = Math.floor(4 - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return FILES[file] + (rank + 1);
}
