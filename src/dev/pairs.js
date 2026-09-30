// Las parejas de la red de seguridad (`autotest.js`) y la posición de cada una. Puro: se prueba sin
// navegador (`tests/autotest-pairs.test.js`).

const KINDS = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
// Desde dónde come cada pieza blanca a la de d5 (y cada negra, a la de d4).
export const FROM = {
  white: { pawn: 'e4', knight: 'c3', bishop: 'b3', rook: 'd1', queen: 'd1', king: 'e4' },
  black: { pawn: 'e5', knight: 'c6', bishop: 'b6', rook: 'd8', queen: 'd8', king: 'e5' },
};
export const TO = { white: 'd5', black: 'd4' };
const DEFENDERS = ['pawn', 'knight', 'bishop', 'rook', 'queen'];

// La posición: el atacante, la víctima, los dos reyes lejos y un peón de cada bando en su rincón (con
// solo reyes y una pieza, la partida acabaría en tablas al comer y se quedaría esperando al diálogo).
export function fenFor(color, attacker, defender) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const put = (square, letter) => { board[8 - Number(square[1])][square.charCodeAt(0) - 97] = letter; };
  const mine = (kind) => (color === 'white' ? KINDS[kind].toUpperCase() : KINDS[kind]);
  const theirs = (kind) => (color === 'white' ? KINDS[kind] : KINDS[kind].toUpperCase());
  put(FROM[color][attacker], mine(attacker));
  put(TO[color], theirs(defender));
  if (attacker !== 'king') put(color === 'white' ? 'a1' : 'a8', mine('king'));
  put(color === 'white' ? 'h8' : 'h1', theirs('king'));
  put(color === 'white' ? 'a2' : 'a7', mine('pawn'));
  put(color === 'white' ? 'h7' : 'h2', theirs('pawn'));
  const rows = board.map((row) => {
    let out = '';
    let empty = 0;
    for (const cell of row) {
      if (!cell) { empty += 1; continue; }
      if (empty) out += empty;
      empty = 0;
      out += cell;
    }
    return out + (empty || '');
  });
  return `${rows.join('/')} ${color === 'white' ? 'w' : 'b'} - - 0 1`;
}

// Las parejas: todo lo blanco contra todo lo negro, y la reina negra (que ataca con fuego, no con hielo).
export function pairs() {
  const list = [];
  for (const attacker of Object.keys(FROM.white)) {
    for (const defender of DEFENDERS) list.push({ color: 'white', attacker, defender });
  }
  for (const defender of DEFENDERS) list.push({ color: 'black', attacker: 'queen', defender });
  return list;
}
