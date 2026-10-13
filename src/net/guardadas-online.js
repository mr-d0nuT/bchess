import { INITIAL_FEN, Position } from '../chess/position.js';
import { findTimeControl } from '../chess/timecontrol.js';
import { cleanName } from '../names.js';
import { anunciaPuntuacion, leePuntuacion } from './online.js';

// LAS PARTIDAS ONLINE, GUARDADAS EN EL APARATO. El iPhone suele tirar las pestañas pesadas que se quedan de fondo
// y las recarga al volver, y «Actualizar» (la versión nueva) también recarga: antes, al recargar se perdían todas
// las partidas online, y el rival «ganaba» al rato por abandono. Ahora cada partida en marcha se guarda (con quién,
// con qué color, sus jugadas y su reloj) y al volver se recupera tal cual, en espera, con la misma identidad.
//
// Al leerlas, el reloj que corría ha seguido corriendo: online la partida no se para porque uno se vaya (al
// contrario que las partidas de aquí, que se congelan). Y se comprueba todo, como en la partida guardada de
// siempre: identificadores, ritmo y jugadas (que se juegan otra vez desde el principio); lo roto o acabado, fuera.

export const ONLINE_KEY = 'bchess.online';
export const ID_KEY = 'bchess.online.id';
const VERSION = 1;
const ID = /^[a-z0-9]{1,24}$/;
const ID_GUARDADO = /^[a-z0-9]{5,12}$/; // como los de `randomId`
const PARTIDA = /^[a-z0-9]{1,24}-[a-z0-9]{1,24}-[a-z0-9]{1,8}$/;
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_JUGADAS = 600;
const MAX_TIEMPO = 8 * 24 * 3600 * 1000;
const esId = (s) => typeof s === 'string' && ID.test(s);
const esTiempo = (ms) => Number.isFinite(ms) && ms >= 0 && ms <= MAX_TIEMPO;

// Lo que se guarda de una partida (`p`, de `net/partida.js`): con quién, con qué color, sus jugadas (con la que se
// está animando, `enCurso`, que ya ha salido hacia el rival) y lo que marca su reloj ahora (`now`, la hora de verdad).
export function packOnline(p, { enCurso = null, now }) {
  return {
    game: p.id,
    yo: p.yo,
    rival: p.opponent,
    white: p.color === 'white' ? p.yo : p.opponent,
    time: p.time,
    nombres: { white: p.nombres.white ?? '', black: p.nombres.black ?? '' },
    origen: p.origen === 'reto' ? 'reto' : 'azar',
    moves: [...p.jugadas(enCurso)],
    reloj: p.clock ? { white: p.clock.remaining('white', now), black: p.clock.remaining('black', now), at: now } : null,
    rt: anunciaPuntuacion(p.rivalRating), // la del rival al empezar: al acabar se puntúa contra ella
    ultimaAt: Number.isFinite(p.ultimaAt) ? p.ultimaAt : null, // la hora de la última jugada (la diaria la deja guardada)
  };
}

// Todas las que se guardan, en el texto de `localStorage`.
export const packTodas = (lista) => JSON.stringify({ v: VERSION, partidas: lista });

// Las partidas guardadas (el texto de `localStorage`), comprobadas y listas para seguir: [{ info, yo, origen,
// nombres, moves, reloj, ultimaAt }] (en `info`, también la puntuación del rival), con `reloj` ({ white, black }) como va
// ahora, a la hora `now`: al que le tocaba se le ha gastado el tiempo que ha pasado. Lo que no cuadra, o una
// partida ya acabada, no se devuelve.
export function readOnline(raw, now) {
  let datos;
  try {
    datos = JSON.parse(raw ?? 'null');
  } catch {
    return [];
  }
  if (!datos || datos.v !== VERSION || !Array.isArray(datos.partidas)) return [];
  const vistas = new Set();
  const lista = [];
  for (const g of datos.partidas) {
    const una = leeUna(g, now);
    if (!una || vistas.has(una.info.game)) continue;
    vistas.add(una.info.game);
    lista.push(una);
  }
  return lista;
}

function leeUna(g, now) {
  if (!g || typeof g !== 'object') return null;
  if (!esId(g.yo) || !esId(g.rival) || g.yo === g.rival) return null;
  if (typeof g.game !== 'string' || !PARTIDA.test(g.game)) return null;
  if (!g.game.startsWith(`${g.yo}-${g.rival}-`) && !g.game.startsWith(`${g.rival}-${g.yo}-`)) return null;
  if (g.white !== g.yo && g.white !== g.rival) return null;
  if (typeof g.time !== 'string' || g.time.length > 32) return null;
  if (!Array.isArray(g.moves) || g.moves.length > MAX_JUGADAS || !g.moves.every((m) => typeof m === 'string' && UCI.test(m))) return null;
  let position;
  try {
    position = Position.fromFEN(INITIAL_FEN);
    for (const uci of g.moves) {
      const m = position.findUci(uci);
      if (m === null || m === undefined) return null; // una jugada que no vale: no es de esta partida
      position.make(m);
    }
  } catch {
    return null;
  }
  const status = position.status();
  if (status !== 'playing' && status !== 'check') return null; // acabada: nada que seguir
  // El reloj: el que corría (el del que mueve) ha seguido corriendo mientras tanto.
  let reloj = null;
  if (findTimeControl(g.time) && g.reloj && esTiempo(g.reloj.white) && esTiempo(g.reloj.black) && Number.isFinite(g.reloj.at)) {
    reloj = { white: g.reloj.white, black: g.reloj.black };
    reloj[position.side] = Math.max(0, reloj[position.side] - Math.max(0, now - g.reloj.at));
  }
  const miColor = g.white === g.yo ? 'white' : 'black';
  const suColor = miColor === 'white' ? 'black' : 'white';
  const nombres = { white: cleanName(g.nombres?.white), black: cleanName(g.nombres?.black) };
  return {
    info: { game: g.game, white: g.white, time: g.time, opponent: g.rival, opponentName: nombres[suColor], opponentRating: leePuntuacion(g.rt) },
    yo: g.yo,
    origen: g.origen === 'reto' ? 'reto' : 'azar',
    nombres,
    moves: [...g.moves],
    reloj,
    ultimaAt: Number.isFinite(g.ultimaAt) && g.ultimaAt > 0 ? g.ultimaAt : null,
  };
}

// QUIÉN SOY ONLINE. Para recuperar las partidas hay que volver con la misma identidad: se guarda en el aparato. Pero
// solo la usa la pestaña que se queda el candado (`navigator.locks`): las demás pestañas abiertas a la vez van con
// una de usar y tirar, y ni guardan ni recuperan nada (si no, dos pestañas jugarían la misma partida, y las pruebas
// con varias pestañas dejarían de funcionar). Resuelve { me, titular }. `nuevo()`: un identificador nuevo.
export function identidadOnline({ locks = globalThis.navigator?.locks, storage = globalThis.localStorage, nuevo }) {
  return new Promise((resolve) => {
    let hecho = false;
    const decide = (titular) => {
      if (hecho) return;
      hecho = true;
      if (!titular) {
        resolve({ me: nuevo(), titular: false });
        return;
      }
      let me = null;
      try {
        me = storage?.getItem(ID_KEY) ?? null;
      } catch {
        // sin almacenamiento: uno nuevo cada vez
      }
      if (!ID_GUARDADO.test(me ?? '')) {
        me = nuevo();
        try {
          storage?.setItem(ID_KEY, me);
        } catch {
          // no se podrá recuperar nada, pero se juega igual
        }
      }
      resolve({ me, titular: true });
    };
    // Sin candados (navegadores viejos): la única pestaña, la titular.
    if (!locks?.request) {
      decide(true);
      return;
    }
    try {
      locks.request('bchess-online', { ifAvailable: true }, (lock) => {
        decide(Boolean(lock));
        return lock ? new Promise(() => {}) : undefined; // se queda con él mientras viva la pestaña
      }).catch(() => decide(false));
    } catch {
      decide(false);
    }
  });
}
