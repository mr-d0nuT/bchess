import { Position, describeMove } from './position.js';

// LA LISTA DE JUGADAS (punto 11 del plan de mejora), en notación algebraica con figuritas en vez de letras:
// «♘f3», «♕xd7+», «exd5», «O-O», «e8=♕#». Las letras cambian con el idioma (la dama es D en español, Q en
// inglés; el alfil, F en francés), y las figuritas se entienden en los siete: son la pieza misma. Y lo que
// lleva comido cada bando, con la ventaja de material. Todo puro.

export const FIGURINES = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};
// El iPhone pinta alguna como emoji (el peón negro, a color y más grande que las demás): el selector de
// presentación de texto (U+FE0E) se lo impide.
const AS_TEXT = '︎';
export const figurine = (color, kind) => FIGURINES[color][kind] + AS_TEXT;

// Lo que vale cada pieza, en peones: la cuenta de siempre.
export const VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };
const ORDER = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const FILES = 'abcdefgh';

// La jugada `m` de `position` (antes de hacerla), escrita. Deja la posición como estaba.
export function sanOf(position, m) {
  const plan = describeMove(position, m);
  let san;
  if (plan.castle) {
    san = plan.castle.rookFrom[0] === 'h' ? 'O-O' : 'O-O-O';
  } else if (plan.kind === 'pawn') {
    san = (plan.captured ? `${plan.from[0]}x` : '') + plan.to + (plan.promotion ? `=${figurine(plan.color, plan.promotion)}` : '');
  } else {
    // Si otra pieza igual puede ir a la misma casilla, se dice de cuál se habla: por la columna si basta,
    // si no por la fila, y si no por las dos.
    const otras = position.legalMoves()
      .filter((other) => other !== m)
      .map((other) => describeMove(position, other))
      .filter((o) => o.kind === plan.kind && o.to === plan.to && o.from !== plan.from && !o.castle);
    let cual = '';
    if (otras.length) {
      if (otras.every((o) => o.from[0] !== plan.from[0])) cual = plan.from[0];
      else if (otras.every((o) => o.from[1] !== plan.from[1])) cual = plan.from[1];
      else cual = plan.from;
    }
    san = figurine(plan.color, plan.kind) + cual + (plan.captured ? 'x' : '') + plan.to;
  }
  position.make(m);
  const status = position.status();
  position.unmake();
  if (status === 'checkmate') return `${san}#`;
  if (status === 'check') return `${san}+`;
  return san;
}

// La material de cada bando en el tablero, en peones.
function material(position) {
  const total = { white: 0, black: 0 };
  for (let rank = 1; rank <= 8; rank++) {
    for (const file of FILES) {
      const piece = position.pieceAt(file + rank);
      if (piece) total[piece.color] += VALUES[piece.kind];
    }
  }
  return total;
}

// La partida que empezó en `startFen` y lleva `moves` (UCI), lista para enseñar:
// - `rows`: [{ n, white, black }], cada jugada { san, uci, from, to } o null (si empezó moviendo el negro);
// - `captured`: lo que ha comido cada bando ({ white: ['queen', 'pawn'…], black: […] }), lo más valioso antes;
// - `advantage`: los peones de ventaja de las blancas en el tablero (negativo, si van por detrás las
//   blancas). Se cuenta lo que hay, no lo comido, para que un peón coronado cuente como lo que es ahora.
// Si una jugada no vale en esa posición, la lista se para ahí.
export function gameRecord(startFen, moves) {
  const position = Position.fromFEN(startFen);
  const rows = [];
  const captured = { white: [], black: [] };
  for (const uci of moves) {
    const m = position.findUci(uci);
    if (m === null) break;
    const plan = describeMove(position, m);
    const jugada = { san: sanOf(position, m), uci, from: plan.from, to: plan.to };
    if (plan.captured) {
      const victima = position.pieceAt(plan.captured);
      if (victima) captured[plan.color].push(victima.kind);
    }
    if (plan.color === 'white' || !rows.length) rows.push({ n: position.fullmove, white: null, black: null });
    rows[rows.length - 1][plan.color] = jugada;
    position.make(m);
  }
  for (const side of ['white', 'black']) captured[side].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const total = material(position);
  return { rows, captured, advantage: total.white - total.black };
}
