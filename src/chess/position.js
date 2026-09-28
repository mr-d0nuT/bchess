// LAS REGLAS DEL AJEDREZ, enteras: turnos, jaque, jaque mate, ahogado, enroque, captura al paso,
// coronación y las tablas (repetición, cincuenta jugadas y material insuficiente).
//
// El tablero va en «0x88»: 128 casillas de las que solo se usan 64, en filas de 16. Parece un
// desperdicio y es un truco: una casilla está fuera del tablero justo cuando `casilla & 0x88` no es
// cero, así que para saber si un caballo se sale basta un AND, sin mirar columnas ni filas. Lo usa
// medio mundo que escribe motores, y aquí hace falta porque la CPU piensa con estas mismas reglas y
// tiene que mirar cientos de miles de posiciones por jugada.
//
// Las jugadas son enteros (de dónde, adónde, a qué corona y qué tienen de especial) y se hacen y se
// deshacen sobre el mismo tablero, sin copiarlo: `make` y `unmake`. Una jugada que deja al propio
// rey en jaque no vale; se descubre haciéndola y mirando.
//
// Puro: nada de three ni del DOM, para que lo use también el hilo de la CPU y se pueda probar suelto.

export const WHITE = 0;
export const BLACK = 8;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

const FILES = 'abcdefgh';
export const KINDS = [null, 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const KIND_CODE = { pawn: PAWN, knight: KNIGHT, bishop: BISHOP, rook: ROOK, queen: QUEEN, king: KING };
const FEN_LETTERS = ' pnbrqk';

export const squareName = (s) => FILES[s & 7] + ((s >> 4) + 1);
export function squareIndex(name) {
  if (!/^[a-h][1-8]$/.test(name)) throw new Error(`Casilla no válida: ${name}`);
  return (Number(name[1]) - 1) * 16 + FILES.indexOf(name[0]);
}

const KNIGHT_STEPS = [33, 31, 18, 14, -33, -31, -18, -14];
const KING_STEPS = [1, -1, 16, -16, 17, 15, -17, -15];
const ROOK_DIRS = [1, -1, 16, -16];
const BISHOP_DIRS = [17, 15, -17, -15];

// Qué tiene de especial una jugada.
export const NORMAL = 0;
export const DOUBLE = 1; // el peón avanza dos
export const EN_PASSANT = 2;
export const CASTLE_KING = 3; // enroque corto
export const CASTLE_QUEEN = 4; // enroque largo

export const encodeMove = (from, to, promo = 0, flag = NORMAL) => from | (to << 7) | (promo << 14) | (flag << 17);
export const moveFrom = (m) => m & 127;
export const moveTo = (m) => (m >> 7) & 127;
export const movePromo = (m) => (m >> 14) & 7;
export const moveFlag = (m) => (m >> 17) & 7;

// Derechos de enroque: un bit por enroque. Mover (o comer) lo que haya en estas casillas los pierde.
const WK = 1;
const WQ = 2;
const BK = 4;
const BQ = 8;
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0] = 15 & ~WQ; // a1
CASTLE_MASK[7] = 15 & ~WK; // h1
CASTLE_MASK[4] = 15 & ~(WK | WQ); // e1
CASTLE_MASK[112] = 15 & ~BQ; // a8
CASTLE_MASK[119] = 15 & ~BK; // h8
CASTLE_MASK[116] = 15 & ~(BK | BQ); // e8

// Zobrist: cada cosa del tablero (qué pieza en qué casilla, de quién es el turno, los enroques y la
// casilla de captura al paso) tiene dos números al azar, y la «huella» de una posición es el XOR de
// los suyos. Se actualiza sola al mover, y dos posiciones iguales tienen la misma. Con semilla fija,
// para que las huellas no cambien de una vez a otra.
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  };
}
const azar = mulberry32(0x5eed);
const Z_PIECE = new Int32Array(16 * 128 * 2).map(() => azar());
const Z_CASTLE = new Int32Array(16 * 2).map(() => azar());
const Z_EP = new Int32Array(8 * 2).map(() => azar());
const Z_SIDE = [azar(), azar()];

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export class Position {
  constructor() {
    this.board = new Int8Array(128);
    this.turn = WHITE;
    this.castling = 0;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.kings = [-1, -1];
    this.hashLo = 0;
    this.hashHi = 0;
    this.undo = []; // lo necesario para deshacer cada jugada hecha
    this.seen = []; // huellas de las posiciones por las que se ha pasado, para las repeticiones
  }

  static initial() {
    return Position.fromFEN(INITIAL_FEN);
  }

  static fromFEN(fen) {
    const p = new Position();
    const [placement, side, castling, ep, half, full] = fen.trim().split(/\s+/);
    let rank = 7;
    let file = 0;
    for (const ch of placement) {
      if (ch === '/') {
        rank -= 1;
        file = 0;
      } else if (/\d/.test(ch)) {
        file += Number(ch);
      } else {
        const code = FEN_LETTERS.indexOf(ch.toLowerCase());
        if (code < 1) throw new Error(`FEN no válido: ${fen}`);
        const s = rank * 16 + file;
        p.board[s] = code | (ch === ch.toLowerCase() ? BLACK : WHITE);
        if (code === KING) p.kings[ch === ch.toLowerCase() ? 1 : 0] = s;
        file += 1;
      }
    }
    p.turn = side === 'b' ? BLACK : WHITE;
    p.castling = (castling.includes('K') ? WK : 0) | (castling.includes('Q') ? WQ : 0)
      | (castling.includes('k') ? BK : 0) | (castling.includes('q') ? BQ : 0);
    p.ep = ep && ep !== '-' ? squareIndex(ep) : -1;
    p.halfmove = Number(half ?? 0);
    p.fullmove = Number(full ?? 1);
    p.rehash();
    p.seen = [[p.hashLo, p.hashHi]];
    return p;
  }

  toFEN() {
    let out = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const piece = this.board[rank * 16 + file];
        if (!piece) {
          empty += 1;
          continue;
        }
        if (empty) out += empty;
        empty = 0;
        const letter = FEN_LETTERS[piece & 7];
        out += piece & BLACK ? letter : letter.toUpperCase();
      }
      if (empty) out += empty;
      if (rank) out += '/';
    }
    const c = this.castling;
    const castling = `${c & WK ? 'K' : ''}${c & WQ ? 'Q' : ''}${c & BK ? 'k' : ''}${c & BQ ? 'q' : ''}` || '-';
    return `${out} ${this.turn === WHITE ? 'w' : 'b'} ${castling} ${this.ep >= 0 ? squareName(this.ep) : '-'} ${this.halfmove} ${this.fullmove}`;
  }

  rehash() {
    let lo = 0;
    let hi = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88 || !this.board[s]) continue;
      const k = (this.board[s] * 128 + s) * 2;
      lo ^= Z_PIECE[k];
      hi ^= Z_PIECE[k + 1];
    }
    lo ^= Z_CASTLE[this.castling * 2];
    hi ^= Z_CASTLE[this.castling * 2 + 1];
    if (this.ep >= 0) {
      lo ^= Z_EP[(this.ep & 7) * 2];
      hi ^= Z_EP[(this.ep & 7) * 2 + 1];
    }
    if (this.turn === BLACK) {
      lo ^= Z_SIDE[0];
      hi ^= Z_SIDE[1];
    }
    this.hashLo = lo;
    this.hashHi = hi;
  }

  toggle(piece, s) {
    const k = (piece * 128 + s) * 2;
    this.hashLo ^= Z_PIECE[k];
    this.hashHi ^= Z_PIECE[k + 1];
  }

  // ¿Ataca `by` (WHITE o BLACK) la casilla `s`?
  attacked(s, by) {
    const b = this.board;
    // Peones: un peón blanco ataca en diagonal hacia arriba, así que se le busca abajo.
    if (by === WHITE) {
      if (!((s - 15) & 0x88) && b[s - 15] === (PAWN | WHITE)) return true;
      if (!((s - 17) & 0x88) && b[s - 17] === (PAWN | WHITE)) return true;
    } else {
      if (!((s + 15) & 0x88) && b[s + 15] === (PAWN | BLACK)) return true;
      if (!((s + 17) & 0x88) && b[s + 17] === (PAWN | BLACK)) return true;
    }
    for (const d of KNIGHT_STEPS) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === (KNIGHT | by)) return true;
    }
    for (const d of KING_STEPS) {
      const t = s + d;
      if (!(t & 0x88) && b[t] === (KING | by)) return true;
    }
    for (const d of ROOK_DIRS) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const piece = b[t];
        if (!piece) continue;
        if ((piece & BLACK) === by && ((piece & 7) === ROOK || (piece & 7) === QUEEN)) return true;
        break;
      }
    }
    for (const d of BISHOP_DIRS) {
      for (let t = s + d; !(t & 0x88); t += d) {
        const piece = b[t];
        if (!piece) continue;
        if ((piece & BLACK) === by && ((piece & 7) === BISHOP || (piece & 7) === QUEEN)) return true;
        break;
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    return this.attacked(this.kings[color >> 3], color ^ BLACK);
  }

  // Las jugadas posibles sin mirar si dejan al rey en jaque (eso lo mira `make`). Con `captures`,
  // solo las que comen o coronan: son las que la CPU mira al final de cada cálculo.
  generate(out = [], captures = false) {
    const b = this.board;
    const us = this.turn;
    const them = us ^ BLACK;
    const forward = us === WHITE ? 16 : -16;
    const startRank = us === WHITE ? 1 : 6;
    const lastRank = us === WHITE ? 7 : 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) {
        s += 7;
        continue;
      }
      const piece = b[s];
      if (!piece || (piece & BLACK) !== us) continue;
      const type = piece & 7;
      if (type === PAWN) {
        const one = s + forward;
        if (!(one & 0x88) && !b[one]) {
          if (one >> 4 === lastRank) {
            for (const promo of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(encodeMove(s, one, promo));
          } else if (!captures) {
            out.push(encodeMove(s, one));
            const two = one + forward;
            if (s >> 4 === startRank && !b[two]) out.push(encodeMove(s, two, 0, DOUBLE));
          }
        }
        for (const side of [forward - 1, forward + 1]) {
          const t = s + side;
          if (t & 0x88) continue;
          if (b[t] && (b[t] & BLACK) === them) {
            if (t >> 4 === lastRank) {
              for (const promo of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(encodeMove(s, t, promo));
            } else {
              out.push(encodeMove(s, t));
            }
          } else if (t === this.ep) {
            out.push(encodeMove(s, t, 0, EN_PASSANT));
          }
        }
        continue;
      }
      if (type === KNIGHT || type === KING) {
        for (const d of type === KNIGHT ? KNIGHT_STEPS : KING_STEPS) {
          const t = s + d;
          if (t & 0x88) continue;
          const target = b[t];
          if (target ? (target & BLACK) === them : !captures) out.push(encodeMove(s, t));
        }
        if (type === KING && !captures) this.castles(s, out);
        continue;
      }
      const dirs = type === ROOK ? ROOK_DIRS : type === BISHOP ? BISHOP_DIRS : KING_STEPS;
      for (const d of dirs) {
        for (let t = s + d; !(t & 0x88); t += d) {
          const target = b[t];
          if (!target) {
            if (!captures) out.push(encodeMove(s, t));
            continue;
          }
          if ((target & BLACK) === them) out.push(encodeMove(s, t));
          break;
        }
      }
    }
    return out;
  }

  // El enroque: el rey y la torre sin haberse movido (los derechos), nada entre ellos, y el rey ni
  // está en jaque, ni pasa por una casilla atacada, ni acaba en ella.
  castles(s, out) {
    const b = this.board;
    const us = this.turn;
    const them = us ^ BLACK;
    const home = us === WHITE ? 4 : 116;
    if (s !== home) return;
    const corto = us === WHITE ? WK : BK;
    const largo = us === WHITE ? WQ : BQ;
    if (!(this.castling & (corto | largo)) || this.attacked(s, them)) return;
    if (this.castling & corto && !b[s + 1] && !b[s + 2] && b[s + 3] === (ROOK | us)
      && !this.attacked(s + 1, them) && !this.attacked(s + 2, them)) {
      out.push(encodeMove(s, s + 2, 0, CASTLE_KING));
    }
    if (this.castling & largo && !b[s - 1] && !b[s - 2] && !b[s - 3] && b[s - 4] === (ROOK | us)
      && !this.attacked(s - 1, them) && !this.attacked(s - 2, them)) {
      out.push(encodeMove(s, s - 2, 0, CASTLE_QUEEN));
    }
  }

  // Hace la jugada. Si deja al propio rey en jaque, la deshace y devuelve false.
  make(m) {
    const b = this.board;
    const from = m & 127;
    const to = (m >> 7) & 127;
    const promo = (m >> 14) & 7;
    const flag = (m >> 17) & 7;
    const piece = b[from];
    const us = piece & BLACK;
    let capSq = to;
    if (flag === EN_PASSANT) capSq = us === WHITE ? to - 16 : to + 16;
    const captured = b[capSq];
    this.undo.push({ m, captured, capSq, castling: this.castling, ep: this.ep, halfmove: this.halfmove, hashLo: this.hashLo, hashHi: this.hashHi });

    if (captured) {
      this.toggle(captured, capSq);
      b[capSq] = 0;
    }
    this.toggle(piece, from);
    b[from] = 0;
    const placed = promo ? promo | us : piece;
    b[to] = placed;
    this.toggle(placed, to);
    if (flag === CASTLE_KING || flag === CASTLE_QUEEN) {
      const rookFrom = flag === CASTLE_KING ? to + 1 : to - 2;
      const rookTo = flag === CASTLE_KING ? to - 1 : to + 1;
      const rook = b[rookFrom];
      this.toggle(rook, rookFrom);
      b[rookFrom] = 0;
      b[rookTo] = rook;
      this.toggle(rook, rookTo);
    }
    if ((piece & 7) === KING) this.kings[us >> 3] = to;

    this.hashLo ^= Z_CASTLE[this.castling * 2];
    this.hashHi ^= Z_CASTLE[this.castling * 2 + 1];
    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.hashLo ^= Z_CASTLE[this.castling * 2];
    this.hashHi ^= Z_CASTLE[this.castling * 2 + 1];
    if (this.ep >= 0) {
      this.hashLo ^= Z_EP[(this.ep & 7) * 2];
      this.hashHi ^= Z_EP[(this.ep & 7) * 2 + 1];
    }
    this.ep = flag === DOUBLE ? (from + to) >> 1 : -1;
    if (this.ep >= 0) {
      this.hashLo ^= Z_EP[(this.ep & 7) * 2];
      this.hashHi ^= Z_EP[(this.ep & 7) * 2 + 1];
    }
    this.halfmove = (piece & 7) === PAWN || captured ? 0 : this.halfmove + 1;
    if (us === BLACK) this.fullmove += 1;
    this.turn ^= BLACK;
    this.hashLo ^= Z_SIDE[0];
    this.hashHi ^= Z_SIDE[1];

    if (this.attacked(this.kings[us >> 3], this.turn)) {
      this.restore();
      return false;
    }
    this.seen.push([this.hashLo, this.hashHi]);
    return true;
  }

  // Deshace la última jugada hecha con `make` (que valiera).
  unmake() {
    if (!this.undo.length) return;
    this.seen.pop();
    this.restore();
  }

  // Pasar el turno sin mover, que no es una jugada del ajedrez: lo usa la CPU para ver si una
  // posición es tan buena que ni dejando mover dos veces al rival se estropea.
  makeNull() {
    this.undo.push({ nulo: true, ep: this.ep, hashLo: this.hashLo, hashHi: this.hashHi });
    if (this.ep >= 0) {
      this.hashLo ^= Z_EP[(this.ep & 7) * 2];
      this.hashHi ^= Z_EP[(this.ep & 7) * 2 + 1];
    }
    this.ep = -1;
    this.turn ^= BLACK;
    this.hashLo ^= Z_SIDE[0];
    this.hashHi ^= Z_SIDE[1];
  }

  unmakeNull() {
    const u = this.undo.pop();
    this.turn ^= BLACK;
    this.ep = u.ep;
    this.hashLo = u.hashLo;
    this.hashHi = u.hashHi;
  }

  restore() {
    const u = this.undo.pop();
    const b = this.board;
    const { m } = u;
    const from = m & 127;
    const to = (m >> 7) & 127;
    const promo = (m >> 14) & 7;
    const flag = (m >> 17) & 7;
    this.turn ^= BLACK;
    const us = this.turn;
    const moved = b[to];
    b[from] = promo ? PAWN | us : moved;
    b[to] = 0;
    if (u.captured) b[u.capSq] = u.captured;
    if (flag === CASTLE_KING || flag === CASTLE_QUEEN) {
      const rookFrom = flag === CASTLE_KING ? to + 1 : to - 2;
      const rookTo = flag === CASTLE_KING ? to - 1 : to + 1;
      b[rookFrom] = b[rookTo];
      b[rookTo] = 0;
    }
    if ((b[from] & 7) === KING) this.kings[us >> 3] = from;
    if (us === BLACK) this.fullmove -= 1;
    this.castling = u.castling;
    this.ep = u.ep;
    this.halfmove = u.halfmove;
    this.hashLo = u.hashLo;
    this.hashHi = u.hashHi;
  }

  legalMoves() {
    const legal = [];
    for (const m of this.generate()) {
      if (this.make(m)) {
        this.unmake();
        legal.push(m);
      }
    }
    return legal;
  }

  // Cuántas veces se ha estado ya en esta misma posición (contando esta). Solo hace falta mirar
  // desde la última jugada que no tiene vuelta atrás (un peón o una captura), y de dos en dos:
  // entre medias le tocaba mover al otro.
  repetitions() {
    let count = 0;
    const last = this.seen.length - 1;
    for (let i = last; i >= 0 && i >= last - this.halfmove; i -= 2) {
      if (this.seen[i][0] === this.hashLo && this.seen[i][1] === this.hashHi) count += 1;
    }
    return count;
  }

  // Sin material para dar mate: reyes solos, o con un solo alfil o caballo, o con alfiles todos del
  // mismo color de casilla.
  insufficientMaterial() {
    let minors = 0;
    const bishopColors = new Set();
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const type = this.board[s] & 7;
      if (!type || type === KING) continue;
      if (type === PAWN || type === ROOK || type === QUEEN) return false;
      if (type === KNIGHT) minors += 1;
      if (type === BISHOP) bishopColors.add(((s >> 4) + (s & 7)) % 2);
    }
    if (minors === 0) return bishopColors.size <= 1;
    return minors === 1 && bishopColors.size === 0;
  }

  // ¿Puede `color` dar mate con lo que le queda? Solo cuenta para cuando al otro se le acaba el
  // tiempo: si el que queda no puede ganar ni con ayuda, son tablas. Con un peón, una torre, una dama
  // o dos piezas menores, sí; con el rey solo o con un alfil o un caballo sueltos, no.
  hasMatingMaterial(color) {
    const us = color === 'black' ? BLACK : WHITE;
    let menores = 0;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const piece = this.board[s];
      if (!piece || (piece & BLACK) !== us) continue;
      const type = piece & 7;
      if (type === PAWN || type === ROOK || type === QUEEN) return true;
      if (type === KNIGHT || type === BISHOP) menores += 1;
    }
    return menores >= 2;
  }

  // Cómo está la partida: 'checkmate', 'stalemate', 'fifty', 'repetition', 'material' (se acabó) o
  // 'check' / 'playing' (sigue).
  status() {
    const moves = this.legalMoves();
    const check = this.inCheck();
    if (!moves.length) return check ? 'checkmate' : 'stalemate';
    if (this.halfmove >= 100) return 'fifty';
    if (this.repetitions() >= 3) return 'repetition';
    if (this.insufficientMaterial()) return 'material';
    return check ? 'check' : 'playing';
  }

  // La pieza de una casilla, para quien no piensa en números: { color, kind } o null.
  pieceAt(name) {
    const piece = this.board[squareIndex(name)];
    if (!piece) return null;
    return { color: piece & BLACK ? 'black' : 'white', kind: KINDS[piece & 7] };
  }

  get side() {
    return this.turn === WHITE ? 'white' : 'black';
  }

  // Jugadas en la notación de UCI («e2e4», «e7e8q»): así se las pasan la partida y la CPU.
  static uci(m) {
    const promo = (m >> 14) & 7;
    return squareName(m & 127) + squareName((m >> 7) & 127) + (promo ? FEN_LETTERS[promo] : '');
  }

  findUci(text) {
    return this.legalMoves().find((m) => Position.uci(m) === text) ?? null;
  }

  playUci(text) {
    const m = this.findUci(text);
    if (m === null) throw new Error(`Jugada no válida: ${text} en ${this.toFEN()}`);
    this.make(m);
    return m;
  }
}

// Lo que tiene que animar el tablero para una jugada: quién va de dónde a dónde, a quién se come y en
// qué casilla está (en la captura al paso no es la de destino), qué torre acompaña al rey en el
// enroque y en qué se corona. Se pide ANTES de hacer la jugada.
export function describeMove(position, m) {
  const from = m & 127;
  const to = (m >> 7) & 127;
  const promo = (m >> 14) & 7;
  const flag = (m >> 17) & 7;
  const piece = position.board[from];
  const us = piece & BLACK;
  let captured = null;
  if (flag === EN_PASSANT) captured = squareName(us === WHITE ? to - 16 : to + 16);
  else if (position.board[to]) captured = squareName(to);
  let castle = null;
  if (flag === CASTLE_KING) castle = { rookFrom: squareName(to + 1), rookTo: squareName(to - 1) };
  if (flag === CASTLE_QUEEN) castle = { rookFrom: squareName(to - 2), rookTo: squareName(to + 1) };
  return {
    from: squareName(from),
    to: squareName(to),
    color: us === WHITE ? 'white' : 'black',
    kind: KINDS[piece & 7],
    captured,
    enPassant: flag === EN_PASSANT,
    castle,
    promotion: promo ? KINDS[promo] : null,
    uci: Position.uci(m),
  };
}

export const kindCode = (kind) => KIND_CODE[kind];
