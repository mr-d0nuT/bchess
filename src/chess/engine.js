import { BISHOP, BLACK, KING, KNIGHT, PAWN, Position, QUEEN, ROOK, WHITE } from './position.js';
import { pickBookMove } from './book.js';

// LA CPU. Piensa como los motores de siempre: prueba jugadas, contesta por el rival, vuelve a
// contestar… y se queda con la que mejor acaba suponiendo que el otro también juega lo mejor que
// puede (minimax, con la poda alfa-beta para no mirar ramas que ya se sabe que no van a elegirse).
// Profundiza de uno en uno mientras le quede tiempo, así que siempre tiene una jugada preparada.
//
// Para puntuar una posición cuenta el material (un peón vale 100) y dónde está cada pieza: un
// caballo en el centro vale más que en una esquina, un peón que avanza vale más, y el rey se
// esconde mientras hay damas y sale a pelear en el final. Las tablas de casillas son las de
// siempre, a mano, con los valores de medio juego y de final mezclados según el material que quede.
//
// El nivel (1-100) lo decide todo: hasta dónde mira, cuánto tiempo se da, cuánto «ruido» mete al
// puntuar (con ruido juega jugadas razonables pero no las mejores), cuántas jugadas de libro sigue al
// empezar y, en los niveles bajos, cuánto se conforma con una jugada peor que la mejor.
//
// FALLOS CREÍBLES (punto 16 del plan de mejora). Antes los niveles bajos movían de vez en cuando a lo loco:
// una jugada cualquiera, que ninguna persona haría. Ahora puntúan TODAS sus jugadas y eligen entre ellas como
// un jugador flojo: casi siempre una de las buenas, a menudo una algo peor, y de vez en cuando un error de
// verdad (dejarse un peón, una pieza…), más cuanto más bajo el nivel. Es la «temperatura»: la probabilidad
// de cada jugada cae con lo que pierde respecto a la mejor, y a más temperatura, más despacio cae.

const VALUE = [0, 100, 320, 330, 500, 900, 0];
const MATE = 30000;
const INF = 32000;

// Las tablas se escriben como se ve el tablero desde las blancas (la fila 8 arriba). `pst[tipo]` se
// lee con la casilla 0x88 de una pieza blanca; para una negra, se refleja la fila.
const TABLAS = {
  [PAWN]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    60, 60, 60, 60, 60, 60, 60, 60,
    14, 16, 24, 32, 32, 24, 16, 14,
    6, 8, 12, 26, 26, 12, 8, 6,
    0, 0, 6, 22, 22, 6, 0, 0,
    4, -4, -8, 2, 2, -8, -4, 4,
    4, 10, 10, -22, -22, 10, 10, 4,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  [KNIGHT]: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 4, 4, 0, -20, -40,
    -30, 4, 12, 16, 16, 12, 4, -30,
    -30, 6, 16, 22, 22, 16, 6, -30,
    -30, 2, 16, 22, 22, 16, 2, -30,
    -30, 6, 12, 14, 14, 12, 6, -30,
    -40, -20, 0, 6, 6, 0, -20, -40,
    -50, -36, -30, -30, -30, -30, -36, -50,
  ],
  [BISHOP]: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 6, 10, 10, 6, 0, -10,
    -10, 6, 6, 10, 10, 6, 6, -10,
    -10, 0, 10, 12, 12, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 6, 0, 0, 0, 0, 6, -10,
    -20, -10, -12, -10, -10, -12, -10, -20,
  ],
  [ROOK]: [
    0, 0, 0, 0, 0, 0, 0, 0,
    6, 12, 12, 12, 12, 12, 12, 6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    -6, 0, 0, 0, 0, 0, 0, -6,
    0, 0, 2, 6, 6, 4, 0, 0,
  ],
  [QUEEN]: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  // El rey en el medio juego: en su rincón, enrocado.
  [KING]: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    16, 16, 0, -6, -6, 0, 16, 16,
    20, 30, 12, 0, 0, 8, 32, 20,
  ],
};
// Y en el final: al centro, que ya no hay damas que lo cacen.
const REY_FINAL = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

// De la tabla (fila 8 arriba) a un índice por casilla 0x88, para blancas y para negras.
function porCasilla(tabla) {
  const blancas = new Int16Array(128);
  const negras = new Int16Array(128);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      blancas[rank * 16 + file] = tabla[(7 - rank) * 8 + file];
      negras[rank * 16 + file] = tabla[rank * 8 + file];
    }
  }
  return [blancas, negras];
}
const PST = {};
for (const tipo of [PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING]) PST[tipo] = porCasilla(TABLAS[tipo]);
const PST_REY_FINAL = porCasilla(REY_FINAL);
const FASE = [0, 0, 1, 1, 2, 4, 0]; // lo que pesa cada pieza para saber si es medio juego o final
const FASE_TOTAL = 24;

// La puntuación de la posición para quien mueve (positiva, le va bien).
export function evaluate(p, noise = 0, seed = 0) {
  const b = p.board;
  let medio = 0;
  let fase = 0;
  let reyB = 0;
  let reyN = 0;
  let alfilesB = 0;
  let alfilesN = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) {
      s += 7;
      continue;
    }
    const piece = b[s];
    if (!piece) continue;
    const tipo = piece & 7;
    const negra = piece & BLACK ? 1 : 0;
    fase += FASE[tipo];
    if (tipo === KING) {
      if (negra) reyN = s;
      else reyB = s;
      continue;
    }
    const valor = VALUE[tipo] + PST[tipo][negra][s];
    medio += negra ? -valor : valor;
    if (tipo === BISHOP) {
      if (negra) alfilesN += 1;
      else alfilesB += 1;
    }
  }
  // El rey, mezclando su tabla de medio juego y la del final según lo que quede.
  const f = Math.min(fase, FASE_TOTAL);
  const rey = (s, negra) => (PST[KING][negra][s] * f + PST_REY_FINAL[negra][s] * (FASE_TOTAL - f)) / FASE_TOTAL;
  medio += rey(reyB, 0) - rey(reyN, 1);
  if (alfilesB >= 2) medio += 30; // la pareja de alfiles
  if (alfilesN >= 2) medio -= 30;
  let score = p.turn === WHITE ? medio : -medio;
  if (noise > 0) {
    // Un error de apreciación que depende de la posición (la misma posición, el mismo error): así la
    // búsqueda no se contradice y la CPU juega jugadas «razonables» que no son las mejores.
    const h = Math.imul(p.hashLo ^ seed, 0x9e3779b1) >>> 0;
    score += (h % (2 * noise + 1)) - noise;
  }
  return Math.round(score);
}

// La fuerza de cada nivel (1-100).
export const HUMAN_UNTIL = 60; // por debajo de este nivel elige «como una persona» (`temperature`)
export function levelSettings(level) {
  const nivel = Math.max(1, Math.min(100, Math.round(level)));
  const n = nivel / 100;
  return {
    depth: Math.max(1, Math.min(8, 1 + Math.floor(n * 7.4))),
    timeMs: Math.round(120 + n * n * 1900),
    noise: Math.round(120 * (1 - n) ** 2), // centipeones de error al puntuar
    // Lo que se conforma con una jugada peor, en centipeones: cada 1 × esto que pierda una jugada respecto a
    // la mejor, sale e veces menos. 0, siempre la mejor.
    temperature: nivel >= HUMAN_UNTIL ? 0 : Math.round(150 * ((HUMAN_UNTIL - nivel) / (HUMAN_UNTIL - 1)) ** 1.4),
    book: 2 + Math.floor(n * 14), // jugadas del libro de aperturas que sigue, como mucho
  };
}

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

export function createEngine() {
  const ttKey = new Int32Array(TT_SIZE);
  const ttMove = new Int32Array(TT_SIZE);
  const ttScore = new Int16Array(TT_SIZE);
  const ttDepth = new Int8Array(TT_SIZE);
  const ttFlag = new Int8Array(TT_SIZE);
  const killers = Array.from({ length: 64 }, () => [0, 0]);
  const historia = new Int32Array(16 * 128);
  let nodes = 0;
  let deadline = 0;
  let stopped = false;
  let noise = 0;
  let seed = 0;
  let now = () => Date.now();


  // Orden de las jugadas: primero la que la tabla ya daba por buena, luego las capturas (la pieza
  // más valiosa comida por la más barata, primero), las coronaciones, las «jugadas asesinas» que
  // cortaron en esta misma profundidad y el resto según lo que han servido antes.
  function ordena(p, moves, ttBest, ply) {
    const b = p.board;
    const puntos = new Int32Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      if (m === ttBest) {
        puntos[i] = 1e9;
        continue;
      }
      const from = m & 127;
      const to = (m >> 7) & 127;
      const victima = b[to] & 7 || (((m >> 17) & 7) === 2 ? PAWN : 0);
      const promo = (m >> 14) & 7;
      if (victima) puntos[i] = 1e8 + VALUE[victima] * 10 - VALUE[b[from] & 7];
      else if (promo) puntos[i] = 9e7 + VALUE[promo];
      else if (killers[ply]?.[0] === m) puntos[i] = 8e7;
      else if (killers[ply]?.[1] === m) puntos[i] = 7e7;
      else puntos[i] = historia[b[from] * 128 + to];
    }
    const idx = [...moves.keys()].sort((x, y) => puntos[y] - puntos[x]);
    return idx.map((i) => moves[i]);
  }

  // Cada mil posiciones mira el reloj. Si se ha pasado, todo lo que queda por calcular devuelve cero
  // y la vuelta a medio hacer se tira: vale la jugada de la vuelta anterior, que sí se acabó.
  function reloj() {
    if ((++nodes & 1023) === 0 && now() > deadline) stopped = true;
    return stopped;
  }

  // Al final de cada cálculo no se para en seco: se siguen mirando las capturas hasta que no quede
  // ninguna, que si no la CPU se comería un peón sin ver que le comen la dama.
  function quiescence(p, alpha, beta, ply) {
    if (reloj()) return 0;
    const quieto = evaluate(p, noise, seed);
    if (quieto >= beta) return beta;
    if (quieto > alpha) alpha = quieto;
    const moves = ordena(p, p.generate([], true), 0, Math.min(ply, 63));
    for (const m of moves) {
      if (!p.make(m)) continue;
      const score = -quiescence(p, -beta, -alpha, ply + 1);
      p.unmake();
      if (stopped) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function repetida(p) {
    const last = p.seen.length - 1;
    for (let i = last - 2; i >= 0 && i >= last - p.halfmove; i -= 2) {
      if (p.seen[i][0] === p.hashLo && p.seen[i][1] === p.hashHi) return true;
    }
    return false;
  }

  function tieneMaterial(p) {
    const us = p.turn;
    for (let s = 0; s < 128; s++) {
      if (s & 0x88) continue;
      const piece = p.board[s];
      if (piece && (piece & BLACK) === us && (piece & 7) !== PAWN && (piece & 7) !== KING) return true;
    }
    return false;
  }

  function negamax(p, depth, alpha, beta, ply, nulo) {
    if (reloj()) return 0;
    if (ply > 0 && (p.halfmove >= 100 || repetida(p))) return 0;
    const check = p.inCheck();
    if (check) depth += 1; // en jaque se mira una más: es cuando todo se decide
    if (depth <= 0) return quiescence(p, alpha, beta, ply);

    const slot = p.hashLo & (TT_SIZE - 1);
    let ttBest = 0;
    if (ttKey[slot] === p.hashHi) {
      ttBest = ttMove[slot];
      if (ply > 0 && ttDepth[slot] >= depth) {
        let score = ttScore[slot];
        if (score > MATE - 100) score -= ply;
        else if (score < -MATE + 100) score += ply;
        const flag = ttFlag[slot];
        if (flag === EXACT) return score;
        if (flag === LOWER && score >= beta) return score;
        if (flag === UPPER && score <= alpha) return score;
      }
    }

    // Jugada nula: si pasando el turno el rival sigue sin poder con nosotros, esta rama ya es buena.
    if (nulo && !check && depth >= 3 && ply > 0 && tieneMaterial(p)) {
      p.makeNull();
      const score = -negamax(p, depth - 3, -beta, -beta + 1, ply + 1, false);
      p.unmakeNull();
      if (stopped) return 0;
      if (score >= beta) return beta;
    }

    const moves = ordena(p, p.generate(), ttBest, Math.min(ply, 63));
    const alpha0 = alpha;
    let best = -INF;
    let bestMove = 0;
    let legales = 0;
    for (const m of moves) {
      if (!p.make(m)) continue;
      legales += 1;
      const score = -negamax(p, depth - 1, -beta, -alpha, ply + 1, true);
      p.unmake();
      if (stopped) return 0;
      if (score > best) {
        best = score;
        bestMove = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        const victima = p.board[(m >> 7) & 127];
        if (!victima && ply < 64) {
          const k = killers[ply];
          if (k[0] !== m) {
            k[1] = k[0];
            k[0] = m;
          }
          historia[p.board[m & 127] * 128 + ((m >> 7) & 127)] += depth * depth;
        }
        break;
      }
    }
    if (!legales) return check ? -MATE + ply : 0;

    let guardar = best;
    if (guardar > MATE - 100) guardar += ply;
    else if (guardar < -MATE + 100) guardar -= ply;
    ttKey[slot] = p.hashHi;
    ttMove[slot] = bestMove;
    ttScore[slot] = Math.max(-32000, Math.min(32000, guardar));
    ttDepth[slot] = depth;
    ttFlag[slot] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  }

  // Lo que vale cada jugada (no solo la mejor), para que los niveles flojos elijan entre todas como lo haría
  // una persona. Cada una con su ventana entera, que si no solo se sabría que son peores, no cuánto.
  // Profundiza mientras quede tiempo, como `search`: valen las puntuaciones de la última vuelta acabada.
  function scoreMoves(p, { depth: maxDepth = 3, timeMs = 500, noise: ruido = 0, seed: semilla = 0, clock } = {}) {
    now = clock ?? (() => Date.now());
    nodes = 0;
    stopped = false;
    noise = ruido;
    seed = semilla;
    deadline = now() + timeMs;
    for (const k of killers) {
      k[0] = 0;
      k[1] = 0;
    }
    historia.fill(0);
    const raiz = p.legalMoves();
    let hechas = raiz.map((move) => ({ move, score: 0 }));
    for (let depth = 1; depth <= maxDepth; depth++) {
      const vuelta = [];
      for (const m of ordena(p, raiz, 0, 0)) {
        p.make(m);
        const score = -negamax(p, depth - 1, -INF, INF, 1, true);
        p.unmake();
        if (stopped) break;
        vuelta.push({ move: m, score });
      }
      if (stopped) break;
      hechas = vuelta;
    }
    return hechas;
  }

  // Busca la mejor jugada, profundizando mientras quede tiempo.
  function search(p, { depth: maxDepth = 6, timeMs = 1000, noise: ruido = 0, seed: semilla = 0, clock } = {}) {
    now = clock ?? (() => Date.now());
    nodes = 0;
    stopped = false;
    noise = ruido;
    seed = semilla;
    deadline = now() + timeMs;
    for (const k of killers) {
      k[0] = 0;
      k[1] = 0;
    }
    historia.fill(0);
    const raiz = p.legalMoves();
    if (!raiz.length) return { move: 0, score: 0, depth: 0, nodes };
    let bestMove = raiz[0];
    let bestScore = 0;
    let hecha = 0;
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -INF;
      let mejor = 0;
      const slot = p.hashLo & (TT_SIZE - 1);
      const ttBest = ttKey[slot] === p.hashHi ? ttMove[slot] : bestMove;
      for (const m of ordena(p, raiz, ttBest || bestMove, 0)) {
        p.make(m);
        const score = -negamax(p, depth - 1, -INF, -alpha, 1, true);
        p.unmake();
        if (stopped) break;
        if (score > alpha) {
          alpha = score;
          mejor = m;
        }
      }
      if (stopped) break; // la vuelta a medias no vale
      bestMove = mejor;
      bestScore = alpha;
      hecha = depth;
      ttKey[slot] = p.hashHi;
      ttMove[slot] = mejor;
      if (Math.abs(alpha) > MATE - 100) break; // mate visto: no hace falta mirar más
    }
    return { move: bestMove, score: bestScore, depth: hecha, nodes };
  }

  return { search, scoreMoves };
}

// Elige entre jugadas puntuadas ({ move, score }) como un jugador de esa `temperature`: la mejor es la más
// probable, y cada una lo es menos cuanto más pierde respecto a ella.
export function pickLikeAPerson(scored, temperature, random = Math.random) {
  if (!scored.length) return null;
  const mejor = Math.max(...scored.map((s) => s.score));
  const pesos = scored.map((s) => Math.exp((s.score - mejor) / Math.max(1, temperature)));
  const total = pesos.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < scored.length; i++) {
    r -= pesos[i];
    if (r < 0) return scored[i].move;
  }
  return scored.at(-1).move;
}

// Las jugadas que lleva la partida, contando desde el principio por el número de jugada.
const pliesOf = (p) => (p.fullmove - 1) * 2 + (p.turn === WHITE ? 0 : 1);

// La jugada de la CPU para un nivel. `random` (0-1) para poder repetirlo en las pruebas.
export function chooseMove(p, level, { random = Math.random, clock, engine = createEngine(), maxMs = null } = {}) {
  const ajustes = levelSettings(level);
  if (maxMs > 0) ajustes.timeMs = Math.min(ajustes.timeMs, maxMs); // con reloj, lo que se pueda permitir
  const legales = p.legalMoves();
  if (!legales.length) return null;
  // Al empezar, del libro: aperturas de verdad, y no siempre la misma.
  if (pliesOf(p) < ajustes.book) {
    const libro = pickBookMove(p, random);
    const m = libro ? p.findUci(libro) : null;
    if (m !== null) return m;
  }
  // Los niveles flojos, como una persona: puntúa todas y elige sin ser perfecto.
  if (ajustes.temperature > 0) {
    const scored = engine.scoreMoves(p, {
      depth: ajustes.depth,
      timeMs: ajustes.timeMs,
      noise: ajustes.noise,
      seed: Math.floor(random() * 0x7fffffff),
      clock,
    });
    return pickLikeAPerson(scored, ajustes.temperature, random) ?? legales[0];
  }
  const { move } = engine.search(p, {
    depth: ajustes.depth,
    timeMs: ajustes.timeMs,
    noise: ajustes.noise,
    seed: Math.floor(random() * 0x7fffffff),
    clock,
  });
  return move || legales[0];
}

export { Position };
