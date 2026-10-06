import { INITIAL_FEN, Position } from '../chess/position.js';
import { createChessClock, findTimeControl } from '../chess/timecontrol.js';
import { cleanName } from '../names.js';

// A la tercera jugada del rival que no vale aquí, la partida ya no es la misma en los dos lados: se anula.
export const MAX_MALAS = 3;

// UNA PARTIDA ONLINE, LAS CUENTAS. Cada partida online es un registro: con quién y con qué color, sus reglas
// (`Position`), sus jugadas, su reloj y lo que ha llegado del rival y aún no se ha jugado. La del tablero es
// una de ellas (main.js anima sus piezas); las demás esperan, y lo que llega de su rival se juega aquí, sin
// animar. Aquí no hay tablero ni red (los mensajes los lleva `online.js`): así se puede probar todo sin
// navegador. Los tiempos (`now`) son los del reloj de la partida, en milisegundos.
//
// `info`: el emparejamiento ({ game, white, time, opponent, opponentName }); `yo`: mi identificador en la
// partida; `miNombre`: el mío.
export function createPartidaOnline({ info, yo, miNombre = '', now = 0 }) {
  const color = info.white === yo ? 'white' : 'black';
  const rival = color === 'white' ? 'black' : 'white';
  const control = findTimeControl(info.time);
  const p = {
    id: info.game,
    opponent: info.opponent,
    color,
    rival,
    time: info.time ?? 'libre:libre',
    nombres: { [color]: cleanName(miNombre), [rival]: cleanName(info.opponentName) },
    control,
    clock: control ? createChessClock(control) : null,
    start: INITIAL_FEN,
    position: Position.initial(),
    moves: [],
    remote: new Map(), // número de jugada → la del rival, llegada y aún sin jugar
    pendingPress: null, // lo que dijo su reloj al pulsar, si llegó antes que su jugada
    malas: 0, // jugadas suyas que no valían aquí
    acabada: null, // { status, winner, flagged } al acabar
    aviso: false, // ha movido mientras esperaba: se marca en la lista
    session: null, // la de `online.js`, que pone quien la crea

    // Las jugadas que lleva: las hechas y, si el tablero está animando una (`enCurso`), esa también.
    jugadas(enCurso = null) {
      return enCurso ? [...p.moves, enCurso] : p.moves;
    },

    // Las que conozco: esas y, detrás, las del rival que ya han llegado seguidas aunque aún no se hayan
    // jugado (mientras se anima un combate). Es lo que se cuenta en el latido: contando solo las jugadas, el
    // rival veía que me faltaban y cada cuatro segundos me mandaba la lista entera durante todo el combate.
    conocidas(enCurso = null) {
      const lista = [...p.jugadas(enCurso)];
      while (p.remote.has(lista.length)) lista.push(p.remote.get(lista.length));
      return lista;
    },

    // Llega la jugada `n` del rival: se guarda si es nueva (ni jugada ya ni llegada antes). Devuelve si la guarda.
    recibe(n, uci, enCurso = null) {
      if (p.acabada || n < p.jugadas(enCurso).length || p.remote.has(n)) return false;
      p.remote.set(n, uci);
      return true;
    },

    // Llega su lista entera (las que se perdieron por el camino): solo si empieza por lo que ya tengo, se
    // guarda lo que falte. Devuelve cuántas nuevas.
    sincroniza(moves, enCurso = null) {
      const mias = p.jugadas(enCurso);
      if (!mias.every((uci, i) => moves[i] === uci)) return 0;
      let nuevas = 0;
      for (let n = mias.length; n < moves.length; n++) if (p.recibe(n, moves[n], enCurso)) nuevas += 1;
      return nuevas;
    },

    // En espera (no en el tablero): lo que ha llegado del rival, seguido, se juega en sus reglas y se pulsa su
    // reloj. Devuelve { movio, mala, status }: si ha movido, si ha topado con una que no vale (y la ha tirado)
    // y el estado de las reglas tras lo jugado (null si no ha movido).
    avanza(now) {
      let movio = false;
      let mala = false;
      while (!p.acabada && p.position.side === p.rival && p.remote.has(p.moves.length)) {
        const uci = p.remote.get(p.moves.length);
        const m = p.position.findUci(uci);
        if (m === null || m === undefined) {
          p.descarta(p.moves.length);
          mala = true;
          break;
        }
        p.position.make(m);
        p.moves.push(uci);
        p.clock?.press(p.rival, now);
        p.pulsaPendiente(now);
        movio = true;
      }
      return { movio, mala, status: movio ? p.position.status() : null };
    },

    // Una jugada suya que no vale aquí (rota por el camino, o de una versión con otras reglas): fuera, para que
    // pueda llegar la buena (se guarda la primera que llega, y si no se tirase, la partida se quedaba colgada para
    // siempre en «Turno de…»). Devuelve true a la tercera: entonces ya no hay arreglo.
    descarta(n) {
      p.remote.delete(n);
      p.malas += 1;
      return p.malas >= MAX_MALAS;
    },

    // Llega lo que marca su reloj al pulsar tras su jugada `n`: se pone ya si esa jugada está hecha aquí (y
    // pulsada); si no, en cuanto lo esté (`pulsaPendiente`).
    pulsa(msg, now) {
      if (!p.clock || p.acabada) return;
      if (p.moves.length >= msg.n && p.clock.running !== msg.side) p.aplicaTiempo(msg, now);
      else p.pendingPress = msg;
    },
    pulsaPendiente(now) {
      if (p.pendingPress && p.moves.length >= p.pendingPress.n) {
        p.aplicaTiempo(p.pendingPress, now);
        p.pendingPress = null;
      }
    },

    // Su tiempo, el que dice su reloj (aquí corría con lo que tarda en llegar y en animarse); el mío, el mío.
    aplicaTiempo({ side, white, black }, now) {
      if (!p.clock || side === p.color || !Number.isFinite(white) || !Number.isFinite(black)) return;
      const mio = p.clock.remaining(p.color, now);
      p.clock.restore(side === 'white' ? { white, black: mio } : { white: mio, black });
    },

    // Quién gana si se acaba así: `status`, el de las reglas, 'time' (sin tiempo `flagged`: pierde, salvo que
    // al otro no le quede con qué dar mate) o los del online ('abandon', 'rivalResigned', 'resign').
    ganador(status, flagged = null) {
      if (status === 'checkmate') return p.position.side === 'white' ? 'black' : 'white';
      if (status === 'time') {
        const otro = flagged === 'white' ? 'black' : 'white';
        return p.position.hasMatingMaterial(otro) ? otro : null;
      }
      if (status === 'abandon' || status === 'rivalResigned') return p.color;
      if (status === 'resign' || status === 'abandonada') return p.rival;
      return null;
    },
  };
  p.clock?.start('white', now);
  return p;
}

// ---- El final, el mismo en los dos lados ----
const DE_REGLAS = new Set(['checkmate', 'stalemate', 'fifty', 'repetition', 'material']);

// Cómo se llama aquí un final que llega de la red, que es el mismo para los dos (`status` de todos y `winner`):
// 'resign' es que se rinde el que no gana, y 'abandon', que se fue el que no gana. Y al revés, `finDeTodos`.
export function estadoLocal(status, winner, miColor) {
  if (status === 'resign') return winner === miColor ? 'rivalResigned' : 'resign';
  if (status === 'abandon') return winner === miColor ? 'abandon' : 'abandonada';
  return status;
}
export function finDeTodos(status) {
  if (status === 'rivalResigned') return 'resign';
  if (status === 'abandonada') return 'abandon';
  return status;
}

// De dos finales que se cruzan (los dos acaban a la vez, cada uno a su manera: se rinden los dos a la vez, o uno
// gana por tiempo mientras el otro da mate), cuál manda: el de menos jugadas; si empatan, el de las blancas. Los
// dos lados eligen el mismo. `mio`/`suyo`: { jugadas, de }.
export function mandaElSuyo(mio, suyo) {
  if (suyo.jugadas !== mio.jugadas) return suyo.jugadas < mio.jugadas;
  return suyo.de === 'white';
}

// Llega el final del rival ({ status, winner, flagged, moves }). Qué hacer aquí:
// - 'esperar': es de reglas (mate, tablas…): las mías lo verán solas al jugar sus jugadas (que ya trae).
// - 'acabar' ({ status, flagged }): se acaba así (se rindió, se le acabó el tiempo, se anuló…).
// - 'cambiar' ({ status, winner, flagged }): ya estaba acabada aquí de otra manera, y manda la suya.
// - 'nada': ya estaba acabada así (o manda la mía).
export function decideFin(p, fin) {
  const status = estadoLocal(fin.status, fin.winner, p.color);
  if (p.acabada) {
    const yo = p.acabada.fin ?? { status: finDeTodos(p.acabada.status), winner: p.acabada.winner };
    if (yo.status === fin.status && yo.winner === fin.winner) return { accion: 'nada' };
    const suyo = { jugadas: fin.moves.length, de: p.rival };
    const mio = { jugadas: p.acabada.jugadas ?? p.moves.length, de: p.acabada.de ?? p.color };
    return mandaElSuyo(mio, suyo) ? { accion: 'cambiar', status, winner: fin.winner, flagged: fin.flagged } : { accion: 'nada' };
  }
  if (DE_REGLAS.has(fin.status)) return { accion: 'esperar' };
  return { accion: 'acabar', status, flagged: fin.flagged };
}

// EL TIEMPO, online. Cada aparato manda en el reloj de su jugador: el suyo lo decide su aparato, que es donde de
// verdad corre (aquí corre con lo que tardan sus jugadas en llegar y las animaciones de cada lado, y antes los
// dos podían ganar por tiempo a la vez). Si mi reloj llega a cero aquí, pierdo ('perder'). Si llega a cero el suyo,
// se espera un poco (`gracia`) a que llegue su jugada, y luego se le reclama ('reclamar', con las jugadas que
// llevo): su aparato dirá si de verdad se le ha acabado. Solo si no contesta en `espera` (con mi conexión sana:
// sin ella, el plazo vuelve a empezar) gano sin más ('ganar'). Si no, 'esperar' (o null, con tiempo los dos).
export function decideBandera(p, ahora, { gracia = 3000, espera = 20000, enlaceBien = true, enCurso = null } = {}) {
  const sin = p.clock?.flagged(ahora);
  if (!sin) {
    p.reclamo = null;
    return null;
  }
  if (sin === p.color) return { accion: 'perder' };
  p.reclamo ??= { desde: ahora, enviado: 0 };
  if (!enlaceBien) {
    p.reclamo.desde = ahora;
    if (p.reclamo.enviado) p.reclamo.enviado = ahora;
    return { accion: 'esperar' };
  }
  if (!p.reclamo.enviado && ahora - p.reclamo.desde >= gracia) {
    p.reclamo.enviado = ahora;
    return { accion: 'reclamar', n: p.jugadas(enCurso).length };
  }
  if (p.reclamo.enviado && ahora - p.reclamo.enviado >= espera) return { accion: 'ganar' };
  return { accion: 'esperar' };
}

// El rival dice que a él le marca cero mi reloj, tras `n` jugadas. Si ya he movido (la jugada va de camino), nada:
// con ella le llega mi tiempo. Si me toca y de verdad me queda un segundo o menos, he perdido ('perder'). Si no
// (me queda tiempo, o aún no he visto su última jugada, que aquí se está animando o no ha llegado), le digo lo que
// marca de verdad mi reloj ('corregir', con `reloj`).
export function decideReclamo(p, { n }, ahora, enCurso = null) {
  if (!p.clock || p.acabada) return { accion: 'ignorar' };
  const llevo = p.jugadas(enCurso).length;
  if (llevo > n) return { accion: 'ignorar' };
  const reloj = { white: p.clock.remaining('white', ahora), black: p.clock.remaining('black', ahora) };
  if (llevo === n && p.position.side === p.color && !enCurso && reloj[p.color] <= 1000) return { accion: 'perder' };
  return { accion: 'corregir', reloj };
}
