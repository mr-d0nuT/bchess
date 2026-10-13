// STOCKFISH, EL MOTOR DE VERDAD. Es el más fuerte que existe, gratis y de código libre (GPL), y va copiado dentro
// del juego (`vendor/stockfish`, la versión de stockfish.js para navegadores, «lite» y de un solo hilo): no depende
// de ningún servicio de fuera, piensa en su propio hilo en el aparato y, una vez guardado, sin conexión.
//
// Se le habla como a cualquier motor de ajedrez, con el protocolo UCI, en líneas de texto: «uci» → «uciok»,
// «position … moves …», «go movetime 800» → «bestmove e2e4». Con `UCI_LimitStrength` y `UCI_Elo` juega a la fuerza
// que se le pida (de 1320 a 3190), que es como lo calibran sus autores; sin ellos, a toda su fuerza.
//
// `createStockfish` arranca el hilo la primera vez que se le pide algo (o con `ready`). Las peticiones van de una en
// una. `Worker` se puede cambiar (las pruebas lo hacen correr en Node).

const MOTOR = new URL('../../vendor/stockfish/stockfish-19-lite-single.js', import.meta.url);
export const ELO_MIN = 1320;
export const ELO_MAX = 3190;
const MATE = 30000; // un mate, en centipeones: como en `engine.js`
const ARRANQUE_MS = 20000; // lo más que se espera a que arranque (bajarse el motor por una conexión lenta)
const MARGEN_MS = 8000; // lo que se le espera, además de lo que se le ha dado para pensar, antes de darlo por colgado

export function createStockfish({ url = MOTOR, Worker: Hilo = globalThis.Worker, hash = 16, margin = MARGEN_MS } = {}) {
  let worker = null;
  let listo = null;
  let roto = null;
  let espera = null; // { hasta: RegExp, lineas: [], resolve, reject }
  let cola = Promise.resolve();
  let opciones = {}; // lo último que se le ha dicho de cada opción: no se repite

  function linea(texto) {
    for (const l of String(texto).split('\n')) {
      const t = l.trim();
      if (!t || !espera) continue;
      espera.lineas.push(t);
      if (espera.hasta.test(t)) {
        const { resolve, lineas } = espera;
        espera = null;
        resolve(lineas);
      }
    }
  }

  function manda(orden) {
    worker.postMessage(orden);
  }

  // Manda `orden` y espera hasta la línea que cumpla `hasta` (devuelve todas las que han llegado).
  function pide(orden, hasta, ms = null) {
    return new Promise((resolve, reject) => {
      const reloj = ms ? setTimeout(() => {
        if (espera?.resolve === resolve) espera = null;
        reject(new Error(`Stockfish no contesta a «${orden}»`));
      }, ms) : null;
      espera = {
        hasta,
        lineas: [],
        resolve: (lineas) => {
          if (reloj) clearTimeout(reloj);
          resolve(lineas);
        },
        reject,
      };
      manda(orden);
    });
  }

  // Colgado (no contesta a tiempo): se tira el hilo y la próxima petición arranca uno nuevo.
  function reinicia() {
    worker?.terminate?.();
    worker = null;
    listo = null;
    espera = null;
    opciones = {};
  }

  function falla(err) {
    roto = err instanceof Error ? err : new Error(String(err?.message ?? err));
    if (espera) {
      const { reject } = espera;
      espera = null;
      reject(roto);
    }
  }

  // Arranca el hilo (una vez) y espera a que esté listo.
  function ready() {
    if (roto) return Promise.reject(roto);
    if (listo) return listo;
    listo = (async () => {
      if (typeof Hilo !== 'function') throw new Error('Sin hilos: no hay Stockfish');
      worker = new Hilo(url);
      worker.onmessage = (event) => linea(event.data);
      worker.onerror = (event) => falla(event?.message ?? event);
      await pide('uci', /^uciok/, ARRANQUE_MS);
      manda(`setoption name Hash value ${hash}`);
      await pide('isready', /^readyok/, ARRANQUE_MS);
    })().catch((err) => {
      falla(err);
      throw roto;
    });
    return listo;
  }

  // De una en una: cada petición espera a que acabe la anterior.
  function enCola(tarea) {
    const hecha = cola.then(() => ready()).then(tarea);
    cola = hecha.catch(() => {});
    return hecha;
  }

  function opcion(nombre, valor) {
    if (opciones[nombre] === valor) return;
    opciones[nombre] = valor;
    manda(`setoption name ${nombre} value ${valor}`);
  }

  // Piensa `movetime` y espera su jugada; si no llega a tiempo, lo da por colgado y lo reinicia.
  async function piensa(movetime) {
    const ms = Math.max(10, Math.round(movetime));
    try {
      return await pide(`go movetime ${ms}`, /^bestmove/, ms + margin);
    } catch (err) {
      reinicia();
      throw err;
    }
  }

  const posicion = ({ fen = null, moves = [] }) => `position ${fen ? `fen ${fen}` : 'startpos'}${moves.length ? ` moves ${moves.join(' ')}` : ''}`;

  return {
    ready,

    // La mejor jugada de la partida `{ fen, moves }` pensando `movetime` milisegundos, a la fuerza `elo` (null, a
    // toda la suya). Resuelve { move, score }: la jugada en UCI (null si no hay ninguna) y cómo va para el que mueve
    // (centipeones; un mate, ±30000 menos las jugadas que faltan).
    bestMove({ fen = null, moves = [], movetime = 1000, elo = null }) {
      return enCola(async () => {
        opcion('UCI_LimitStrength', elo ? 'true' : 'false');
        if (elo) opcion('UCI_Elo', Math.round(Math.min(ELO_MAX, Math.max(ELO_MIN, elo))));
        manda(posicion({ fen, moves }));
        const lineas = await piensa(movetime);
        return { move: jugadaDe(lineas.at(-1)), score: puntuacionDe(lineas) };
      });
    },

    // Lo que vale cada jugada (hasta `multipv`, las mejores) de la partida `{ fen, moves }`, pensándolo `movetime` a
    // toda su fuerza: [{ move, score }], de la mejor a la peor (`score` para el que mueve, como en `bestMove`). Para
    // los niveles por debajo de lo que Stockfish sabe jugar flojo: se elige entre ellas como una persona.
    scoreMoves({ fen = null, moves = [], movetime = 500, multipv = 50 }) {
      return enCola(async () => {
        opcion('UCI_LimitStrength', 'false');
        opcion('MultiPV', multipv);
        manda(posicion({ fen, moves }));
        const lineas = await piensa(movetime);
        opcion('MultiPV', 1);
        return puntuadas(lineas);
      });
    },

    // Cómo va la partida `{ fen, moves }` para el que mueve, en centipeones, pensándolo `movetime` (a toda su fuerza).
    async evaluate({ fen = null, moves = [], movetime = 300 }) {
      return (await this.bestMove({ fen, moves, movetime })).score;
    },

    // Que deje de pensar ya: la jugada que estuviera buscando llega enseguida (y quien la pidió ya no la quiere).
    stop() {
      if (worker && espera) manda('stop');
    },

    // Partida nueva: olvida lo que había aprendido de la anterior.
    newGame() {
      return enCola(() => {
        manda('ucinewgame');
        return pide('isready', /^readyok/);
      });
    },

    terminate() {
      worker?.terminate?.();
      falla(new Error('Stockfish cerrado'));
    },

    get broken() {
      return roto;
    },
  };
}

// «bestmove e2e4 ponder e7e5» → «e2e4»; «bestmove (none)» → null.
export function jugadaDe(linea) {
  const m = /^bestmove\s+(\S+)/.exec(linea ?? '');
  return m && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m[1]) ? m[1] : null;
}

// «score cp N» o «score mate M» de una línea «info …», en centipeones para el que mueve; null si no lleva.
function scoreOf(linea) {
  const m = /\bscore (cp|mate) (-?\d+)/.exec(linea);
  if (!m) return null;
  const n = Number(m[2]);
  if (m[1] === 'cp') return n;
  return n > 0 ? MATE - n : -MATE - n; // mate en n: mejor cuanto antes
}

// La puntuación de la última línea que la lleve (la de la mejor jugada).
export function puntuacionDe(lineas) {
  for (let i = lineas.length - 1; i >= 0; i--) {
    const s = scoreOf(lineas[i]);
    if (s !== null && !/\bmultipv (?!1\b)\d+/.test(lineas[i])) return s;
  }
  return 0;
}

// Con varias jugadas a la vez (MultiPV): cada jugada, con la puntuación de lo más hondo que se ha llegado a mirar
// («info depth N … multipv K … pv e2e4 …»; la última vuelta puede quedarse a medias, y entonces las que no le dio
// tiempo a mirar valen lo de la anterior). [{ move, score }], de la mejor a la peor.
export function puntuadas(lineas) {
  const porHondura = new Map(); // hondura → Map(jugada → puntuación)
  for (const l of lineas) {
    if (!l.startsWith('info ') || /\b(lowerbound|upperbound)\b/.test(l)) continue;
    const d = /\bdepth (\d+)/.exec(l);
    const pv = /\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/.exec(l);
    const s = scoreOf(l);
    if (!d || !pv || s === null) continue;
    const hondura = Number(d[1]);
    if (!porHondura.has(hondura)) porHondura.set(hondura, new Map());
    porHondura.get(hondura).set(pv[1], s);
  }
  const todas = new Map();
  for (const hondura of [...porHondura.keys()].sort((a, b) => b - a)) {
    for (const [move, score] of porHondura.get(hondura)) if (!todas.has(move)) todas.set(move, score);
  }
  return [...todas].map(([move, score]) => ({ move, score })).sort((a, b) => b.score - a.score);
}
