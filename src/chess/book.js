import { Position } from './position.js';

// EL LIBRO DE APERTURAS (punto 16 del plan de mejora): para que la CPU no empiece siempre igual. Son líneas de
// verdad (la española, la italiana, la siciliana, la francesa, el gambito de dama, la india de rey…), cada
// una con su peso: cuanto más se juega, más sale. En cada posición del libro la CPU elige entre lo que
// ponen las líneas que pasan por ella (por la posición y no por el orden de las jugadas: si se llega por otro
// camino, también vale). Cuántas jugadas sigue el libro lo dice el nivel: un principiante se sale enseguida.

const LINES = [
  [8, 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6'], // e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6
  [4, 'e2e4 e7e5 g1f3 b8c6 f1b5 g8f6 e1g1 f6e4 d2d4 e4d6'], // e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6
  [7, 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8'], // e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O
  [5, 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8e7 e1g1 e8g8'], // e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O
  [4, 'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6'], // e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6
  [3, 'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5'], // e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5
  [3, 'e2e4 e7e5 b1c3 g8f6 f1c4 b8c6 d2d3 f8c5'], // e4 e5 Nc3 Nf6 Bc4 Nc6 d3 Bc5
  [2, 'e2e4 e7e5 f2f4 e5f4 g1f3 g7g5 h2h4 g5g4'], // e4 e5 f4 exf4 Nf3 g5 h4 g4
  [8, 'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6 f1e2 e7e5'], // e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5
  [5, 'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g7g6 b1c3 f8g7'], // e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7
  [4, 'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6 b1c3 d8c7'], // e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7
  [3, 'e2e4 c7c5 b1c3 b8c6 g2g3 g7g6 f1g2 f8g7 d2d3 d7d6'], // e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6
  [5, 'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7'], // e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7
  [4, 'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6'], // e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6
  [5, 'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6'], // e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6
  [3, 'e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1e2 c6c5'], // e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5
  [3, 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5'], // e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 Bf5
  [3, 'e2e4 g7g6 d2d4 f8g7 b1c3 d7d6 g1f3 g8f6 f1e2 e8g8'], // e4 g6 d4 Bg7 Nc3 d6 Nf3 Nf6 Be2 O-O
  [2, 'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 f2f4 f8g7 g1f3 e8g8'], // e4 d6 d4 Nf6 Nc3 g6 f4 Bg7 Nf3 O-O
  [7, 'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3 h7h6'], // d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6
  [5, 'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5'], // d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5
  [3, 'd2d4 d7d5 c2c4 d5c4 g1f3 g8f6 e2e3 e7e6 f1c4 c7c5'], // d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5
  [6, 'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5'], // d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5
  [5, 'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5'], // d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5
  [4, 'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7 f1g2 f8e7'], // d4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7
  [4, 'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5 c2c3 b8c6'], // d4 d5 Nf3 Nf6 Bf4 e6 e3 c5 c3 Nc6
  [3, 'd2d4 g8f6 c2c4 c7c5 d4d5 e7e6 b1c3 e6d5 c4d5 d7d6'], // d4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6
  [2, 'd2d4 f7f5 g2g3 g8f6 f1g2 g7g6 g1f3 f8g7 e1g1 e8g8'], // d4 f5 g3 Nf6 Bg2 g6 Nf3 Bg7 O-O O-O
  [5, 'c2c4 e7e5 b1c3 g8f6 g2g3 d7d5 c4d5 f6d5 f1g2 d5b6'], // c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6
  [3, 'c2c4 c7c5 g1f3 b8c6 b1c3 g7g6 g2g3 f8g7 f1g2 e7e6'], // c4 c5 Nf3 Nc6 Nc3 g6 g3 Bg7 Bg2 e6
  [4, 'g1f3 d7d5 g2g3 g8f6 f1g2 c7c6 e1g1 c8g4 d2d3 b8d7'], // Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7
  [2, 'g1f3 g8f6 c2c4 g7g6 b1c3 d7d5 c4d5 f6d5'], // Nf3 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5
];

// La posición sin los contadores de jugadas: la misma posición, llegue cuando llegue.
const keyOf = (position) => position.toFEN().split(' ').slice(0, 4).join(' ');

let book = null; // posición → Map(uci → peso)
function build() {
  book = new Map();
  for (const [weight, line] of LINES) {
    const position = Position.initial();
    for (const uci of line.split(' ')) {
      const key = keyOf(position);
      const options = book.get(key) ?? new Map();
      options.set(uci, (options.get(uci) ?? 0) + weight);
      book.set(key, options);
      position.playUci(uci);
    }
  }
  return book;
}

// Las jugadas del libro para `position`, con su peso: [{ uci, weight }] (vacío si no está en el libro).
export function bookMoves(position) {
  const options = (book ?? build()).get(keyOf(position));
  return options ? [...options].map(([uci, weight]) => ({ uci, weight })) : [];
}

// Una de ellas, al azar según su peso; null si no hay.
export function pickBookMove(position, random = Math.random) {
  const options = bookMoves(position);
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  if (!total) return null;
  let r = random() * total;
  for (const option of options) {
    r -= option.weight;
    if (r < 0) return option.uci;
  }
  return options.at(-1).uci;
}
