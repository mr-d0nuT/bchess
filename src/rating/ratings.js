import { ageDeviation, expectedScore, rate } from './glicko2.js';

// LA PUNTUACIÓN DEL JUGADOR (el «ranking», como en chess.com). Una por ritmo de juego, como allí, porque no
// se juega igual a un minuto que a treinta:
// - online, contra personas: bala, blitz, rápida y diaria (la partida sin reloj cuenta como rápida);
// - contra la CPU, aparte: cada nivel tiene su puntuación (el 1, unos 400; el 100, unos 2400), y ganarle a
//   un nivel alto da mucho más que a uno bajo;
// - y el RANKING LOCAL: en el uno contra uno con nombres, cada nombre tiene la suya (la familia, los amigos
//   que juegan en el mismo aparato).
// Todos empiezan con 1200 (lo de siempre en chess.com) y provisionales («1200?») hasta que la puntuación es
// fiable: entonces se le quita el interrogante.
//
// Se guarda en el aparato (y, con cuenta, también en la nube: `export`/`import`). Puro salvo el
// almacenamiento, que se le pasa.

export const START = { r: 1200, rd: 350, vol: 0.06 };
export const PROVISIONAL_RD = 110; // por encima, provisional (como lichess)
export const ONLINE_CATEGORIES = ['bala', 'blitz', 'rapida', 'diaria'];
export const CATEGORIES = [...ONLINE_CATEGORIES, 'cpu'];
const HISTORY = 120; // puntuaciones que se recuerdan de cada categoría, para la gráfica
const DAY = 24 * 60 * 60 * 1000;
const KEY = 'bchess.ranking';
const VERSION = 1;

// La puntuación de la CPU en cada nivel (1-100): de 400 a 2400. Bien conocida (`rd` baja): es siempre la
// misma.
export const CPU_RD = 60;
export function cpuRating(level) {
  const nivel = Math.max(1, Math.min(100, Math.round(level)));
  return { r: Math.round(400 + ((nivel - 1) * 2000) / 99), rd: CPU_RD };
}

// En qué categoría cuenta una partida: `mode` ('cpu', 'online', 'pvp') y el ritmo (`time`, «blitz:3+2»).
// null si no cuenta (uno contra uno sin nombres).
export function categoryOf({ mode, time }) {
  if (mode === 'cpu') return 'cpu';
  if (mode === 'pvp') return 'local';
  const ritmo = String(time ?? 'libre').split(':')[0];
  if (ritmo === 'libre') return 'rapida';
  return ONLINE_CATEGORIES.includes(ritmo) ? ritmo : 'rapida';
}

export const isProvisional = (entry) => (entry?.rd ?? START.rd) > PROVISIONAL_RD;
// «1216» o «1216?» si aún es provisional.
export const shown = (entry) => `${Math.round(entry?.r ?? START.r)}${isProvisional(entry) ? '?' : ''}`;

const fresh = () => ({ ...START, games: 0, win: 0, loss: 0, draw: 0, best: null, last: 0, history: [] });
const clean = (text) => String(text ?? '').trim().slice(0, 16);
const nameKey = (name) => clean(name).toLocaleLowerCase();

function sane(entry) {
  const e = { ...fresh(), ...(entry ?? {}) };
  const num = (x, lo, hi, def) => (Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : def);
  e.r = num(e.r, 100, 3500, START.r);
  e.rd = num(e.rd, 45, 350, START.rd);
  e.vol = num(e.vol, 0.01, 0.2, START.vol);
  for (const k of ['games', 'win', 'loss', 'draw', 'last']) e[k] = num(e[k], 0, Number.MAX_SAFE_INTEGER, 0);
  e.best = Number.isFinite(e.best) ? e.best : null;
  e.history = Array.isArray(e.history) ? e.history.filter((p) => Array.isArray(p) && p.length === 2).slice(-HISTORY) : [];
  return e;
}

// Una partida para `entry` contra `opponent` ({ r, rd }), con `score` (1, 0,5 o 0), jugada en `at`. Devuelve
// la entrada nueva (no toca la vieja).
export function applyGame(entry, opponent, score, at) {
  const antes = sane(entry);
  // Sin jugar, se fía menos: la `rd` crece con los días que lleva parado.
  const dias = antes.last ? Math.max(0, (at - antes.last) / DAY) : 0;
  const jugador = { r: antes.r, rd: ageDeviation(antes, dias), vol: antes.vol };
  const nuevo = rate(jugador, [{ r: opponent.r, rd: opponent.rd ?? START.rd, score }]);
  const despues = {
    ...antes,
    r: nuevo.r,
    rd: nuevo.rd,
    vol: nuevo.vol,
    games: antes.games + 1,
    win: antes.win + (score === 1 ? 1 : 0),
    loss: antes.loss + (score === 0 ? 1 : 0),
    draw: antes.draw + (score === 0.5 ? 1 : 0),
    last: at,
    history: [...antes.history, [at, Math.round(nuevo.r)]].slice(-HISTORY),
  };
  // La mejor, solo cuando ya es fiable (con la provisional, cualquier racha la disparaba).
  if (!isProvisional(despues)) despues.best = Math.max(despues.best ?? 0, Math.round(despues.r));
  return despues;
}

// El almacén. `storage`: algo con getItem/setItem (el localStorage, o uno de mentira en las pruebas).
export function createRatings({ storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  let data = leer();
  const avisos = new Set();

  function leer() {
    try {
      const raw = JSON.parse(storage?.getItem(KEY) ?? 'null');
      if (raw?.v === VERSION) return normaliza(raw);
    } catch { /* roto o sin almacenamiento: de cero */ }
    return normaliza({});
  }

  function normaliza(raw) {
    const ratings = {};
    for (const c of CATEGORIES) ratings[c] = sane(raw.ratings?.[c]);
    const local = {};
    for (const [key, entry] of Object.entries(raw.local ?? {})) {
      const name = clean(entry?.name);
      if (name && nameKey(name) === key) local[key] = { ...sane(entry), name };
    }
    return { v: VERSION, ratings, local, updated: Number.isFinite(raw.updated) ? raw.updated : 0 };
  }

  function guarda() {
    data.updated = now();
    try { storage?.setItem(KEY, JSON.stringify(data)); } catch { /* sin almacenamiento: solo esta sesión */ }
    for (const fn of avisos) fn(data);
  }

  return {
    // La puntuación de una categoría ({ r, rd, vol, games, win, loss, draw, best, last, history }).
    get(category) {
      return { ...data.ratings[category] };
    },
    all() {
      return Object.fromEntries(CATEGORIES.map((c) => [c, { ...data.ratings[c] }]));
    },
    // Una partida de la categoría `category` contra `opponent` ({ r, rd }), con `score` (1, 0,5 o 0). Devuelve
    // { category, before, after, delta (redondeado), expected } para enseñarlo.
    record({ category, opponent, score }) {
      if (!CATEGORIES.includes(category)) return null;
      const before = data.ratings[category];
      const after = applyGame(before, opponent, score, now());
      data.ratings[category] = after;
      guarda();
      return { category, before: { ...before }, after: { ...after }, delta: Math.round(after.r) - Math.round(before.r), expected: expectedScore(before, opponent) };
    },
    // EL RANKING LOCAL: los nombres del uno contra uno.
    local: {
      get(name) {
        const key = nameKey(name);
        return key ? { ...(data.local[key] ?? { ...fresh(), name: clean(name) }) } : null;
      },
      // Una partida entre `white` y `black` (nombres) con `score` de las blancas. null si falta algún nombre o
      // son el mismo (jugar contra uno mismo no cuenta).
      record({ white, black, score }) {
        const kw = nameKey(white);
        const kb = nameKey(black);
        if (!kw || !kb || kw === kb) return null;
        const at = now();
        const blancas = data.local[kw] ?? { ...fresh(), name: clean(white) };
        const negras = data.local[kb] ?? { ...fresh(), name: clean(black) };
        const nuevaB = { ...applyGame(blancas, negras, score, at), name: clean(white) };
        const nuevaN = { ...applyGame(negras, blancas, 1 - score, at), name: clean(black) };
        data.local[kw] = nuevaB;
        data.local[kb] = nuevaN;
        guarda();
        return {
          white: { before: blancas, after: nuevaB, delta: Math.round(nuevaB.r) - Math.round(blancas.r) },
          black: { before: negras, after: nuevaN, delta: Math.round(nuevaN.r) - Math.round(negras.r) },
        };
      },
      // Todos, de más a menos puntuación.
      list() {
        return Object.values(data.local).map((e) => ({ ...e })).sort((a, b) => b.r - a.r);
      },
    },
    onChange(fn) {
      avisos.add(fn);
      return () => avisos.delete(fn);
    },
    // Para la nube: todo, y traerlo de vuelta (se queda con lo más reciente de cada categoría).
    export() {
      return JSON.parse(JSON.stringify(data));
    },
    import(raw) {
      const otro = normaliza(raw ?? {});
      for (const c of CATEGORIES) if (otro.ratings[c].last > data.ratings[c].last) data.ratings[c] = otro.ratings[c];
      for (const [key, entry] of Object.entries(otro.local)) {
        if (!data.local[key] || entry.last > data.local[key].last) data.local[key] = entry;
      }
      guarda();
    },
  };
}
