import { INITIAL_FEN, Position } from '../chess/position.js';
import { createChessClock, findTimeControl } from '../chess/timecontrol.js';
import { cleanName } from '../names.js';
import { categoryOf } from '../rating/ratings.js';

// A la tercera jugada del rival que no vale aquí, la partida ya no es la misma en los dos lados: se anula.
export const MAX_MALAS = 3;

// UNA PARTIDA ONLINE, LAS CUENTAS. Cada partida online es un registro: con quién y con qué color, sus reglas
// (`Position`), sus jugadas, su reloj y lo que ha llegado del rival y aún no se ha jugado. La del tablero es
// una de ellas (main.js anima sus piezas); las demás esperan, y lo que llega de su rival se juega aquí, sin
// animar. Aquí no hay tablero ni red (los mensajes los lleva `online.js`): así se puede probar todo sin
// navegador. Los tiempos (`now`) son los del reloj de la partida, en milisegundos.
//
// `info`: el emparejamiento ({ game, white, time, opponent, opponentName, opponentRating }); `yo`: mi identificador en la
// partida; `miNombre`: el mío. Para seguir una partida guardada (`guardadas-online.js`): sus `moves` (ya
// comprobadas), su `reloj` ({ white, black }, como va ahora), sus `nombres` y `ultimaAt` (la hora de la última jugada).
export function createPartidaOnline({ info, yo, miNombre = '', now = 0, moves = [], reloj = null, nombres = null, ultimaAt = null }) {
  const color = info.white === yo ? 'white' : 'black';
  const rival = color === 'white' ? 'black' : 'white';
  const control = findTimeControl(info.time);
  const p = {
    id: info.game,
    yo,
    opponent: info.opponent,
    color,
    rival,
    time: info.time ?? 'libre:libre',
    nombres: nombres ? { white: cleanName(nombres.white), black: cleanName(nombres.black) } : { [color]: cleanName(miNombre), [rival]: cleanName(info.opponentName) },
    control,
    clock: control ? createChessClock(control) : null,
    start: INITIAL_FEN,
    position: Position.initial(),
    moves: [],
    remote: new Map(), // número de jugada → la del rival, llegada y aún sin jugar
    remoteAt: new Map(), // número de jugada → la hora en que la hizo (en la diaria, su plazo cuenta desde ahí)
    ultimaAt: Number.isFinite(ultimaAt) ? ultimaAt : now, // la hora de la última jugada (la mía o la suya)
    pendingPress: null, // lo que dijo su reloj al pulsar, si llegó antes que su jugada
    malas: 0, // jugadas suyas que no valían aquí
    acabada: null, // { status, winner, flagged } al acabar
    aviso: false, // ha movido mientras esperaba: se marca en la lista
    session: null, // la de `online.js`, que pone quien la crea
    // La puntuación que anunció el rival al empezar ({ r, rd }), contra la que se puntúa al acabar.
    rivalRating: info.opponentRating ?? { r: 1200, rd: 350 },
    // Las tablas ofrecidas (`ofrezco`, `recibeOferta`…): la mía y la suya ({ n }: con cuántas jugadas se hizo), la
    // que estoy aceptando ({ n, desde }) y con cuántas hice la última (para no volver a ofrecerlas sin jugar).
    tablas: { mia: null, suya: null, aceptando: null, ultima: null },

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

    // Llega la jugada `n` del rival, hecha a la hora `at` (si la dice): se guarda si es nueva (ni jugada ya ni llegada
    // antes). Devuelve si la guarda.
    recibe(n, uci, enCurso = null, at = undefined) {
      if (p.acabada || n < p.jugadas(enCurso).length || p.remote.has(n)) return false;
      p.remote.set(n, uci);
      if (Number.isFinite(at)) p.remoteAt.set(n, at);
      return true;
    },

    // Llega su lista entera (las que se perdieron por el camino, o la que dejó guardada en la diaria, con la hora `at`
    // de la última): solo si empieza por lo que ya tengo, se guarda lo que falte. Devuelve cuántas nuevas.
    sincroniza(moves, enCurso = null, at = undefined) {
      const mias = p.jugadas(enCurso);
      if (!mias.every((uci, i) => moves[i] === uci)) return 0;
      let nuevas = 0;
      for (let n = mias.length; n < moves.length; n++) if (p.recibe(n, moves[n], enCurso)) nuevas += 1;
      if (nuevas && Number.isFinite(at) && p.remote.has(moves.length - 1)) p.remoteAt.set(moves.length - 1, at);
      return nuevas;
    },

    // Cuándo pulsar su reloj tras su jugada `n`. En la diaria, a la hora en que la hizo: el plazo de la mía cuenta desde
    // ahí, no desde que me llega, que puede ser horas o días después. Sin creerse una hora rara: del futuro, ahora; de
    // antes de la jugada anterior, la de la jugada anterior. En las demás, ahora (su reloj lo corrige el suyo, `pulsa`).
    momento(n, now) {
      const at = p.remoteAt.get(n);
      if (!p.control?.perMove || !Number.isFinite(at) || at > now) return now;
      return Math.max(at, p.ultimaAt);
    },

    // Pulsa su reloj tras su jugada, hecha a la hora `cuando` (`momento`): el mío arranca con lo que le queda desde
    // entonces. Se pulsa ahora y se le quita lo pasado, sin fiarse de que el reloj esté corriendo: el del tablero se
    // para mientras se anima la jugada, y al seguir contaba desde ese momento (el plazo entero, días después).
    pulsaSuya(cuando, now) {
      if (!p.clock) return;
      p.clock.press(p.rival, now);
      if (cuando < now) {
        const queda = { white: p.clock.remaining('white', now), black: p.clock.remaining('black', now) };
        queda[p.color] = Math.max(0, queda[p.color] - (now - cuando));
        p.clock.restore(queda);
      }
      p.ultimaAt = cuando;
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
        p.pulsaSuya(p.momento(p.moves.length - 1, now), now);
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
      p.remoteAt.delete(n);
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
  for (const uci of moves) {
    p.position.playUci(uci);
    p.moves.push(uci);
  }
  if (p.clock && reloj) p.clock.restore(reloj);
  p.clock?.start(p.position.side, now); // corre el del que mueve (al empezar, las blancas)
  return p;
}

// Cuánto tiene que llevar callado el rival (con mi conexión sana) para poder reclamar la victoria, según el ritmo:
// en bala, medio minuto es mucho; en una rápida, menos. (Antes, en cualquier ritmo, a los dos minutos se ganaba
// solo, sin preguntar.)
export function retrasoReclamo(time) {
  const ritmo = String(time ?? '').split(':')[0];
  if (ritmo === 'bala') return 30000;
  if (ritmo === 'blitz') return 45000;
  return 60000;
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

// ---- Las tablas, ofrecidas (punto 12 del plan de mejora) ----
// Una oferta vale mientras quien la recibe no haya jugado desde que se hizo: jugar es decir que no (como en
// chess.com), y quien la hace puede seguir jugando. Se apunta con cuántas jugadas llevaba la partida (`n`). Para
// aceptarla, los dos han de ver la misma partida: quien acepta dice cuántas jugadas ve, quien la ofreció lo comprueba
// y, si cuadra, acaba la partida (tablas, «agreement») y le manda su final; si no, le dice que ya no vale.
export const TABLAS_ESPERA = 8000; // lo que espera quien acepta a que el otro cierre la partida

// ¿Ha jugado `color` alguna desde la jugada número `n` (contando desde 0: las blancas juegan las pares)?
export function jugoDesde(moves, color, n) {
  for (let i = Math.max(0, n); i < moves.length; i++) if (i % 2 === (color === 'white' ? 0 : 1)) return true;
  return false;
}
// La mía sigue en pie: el rival no ha jugado desde que la hice.
export function ofertaMia(p, enCurso = null) {
  const oferta = p.tablas.mia;
  return Boolean(oferta) && !p.acabada && !jugoDesde(p.jugadas(enCurso), p.rival, oferta.n);
}
// La suya, la que puedo aceptar: en pie (no he jugado desde que la hizo) y viendo ya la posición en que la hizo.
export function ofertaSuya(p, enCurso = null) {
  const oferta = p.tablas.suya;
  if (!oferta || p.acabada) return false;
  const lista = p.jugadas(enCurso);
  return lista.length >= oferta.n && !jugoDesde(lista, p.color, oferta.n);
}
// ¿Puedo ofrecerlas? No con una mía en pie, ni con una suya (esa se acepta), ni aceptando; y una vez por jugada:
// tras ofrecerlas, hasta haber jugado no se vuelven a ofrecer (si no, un «no» detrás de otro).
export function puedoOfrecer(p, enCurso = null) {
  if (p.acabada || p.tablas.aceptando || ofertaMia(p, enCurso) || ofertaSuya(p, enCurso)) return false;
  return p.tablas.ultima === null || jugoDesde(p.jugadas(enCurso), p.color, p.tablas.ultima);
}
// Las ofrezco: devuelve con cuántas jugadas (lo que se le dice al rival).
export function ofrezco(p, enCurso = null) {
  const n = p.jugadas(enCurso).length;
  p.tablas.mia = { n };
  p.tablas.ultima = n;
  return n;
}
// Llega su oferta, hecha con `n` jugadas: se apunta si aún puede valer (no he jugado desde entonces).
export function recibeOferta(p, n, enCurso = null) {
  if (p.acabada || jugoDesde(p.jugadas(enCurso), p.color, n)) return false;
  if (p.tablas.suya && p.tablas.suya.n >= n) return false; // repetida (o una vieja)
  p.tablas.suya = { n };
  return true;
}
// Acepto la suya: devuelve cuántas jugadas veo (lo que se le dice), y hasta que cierre la partida, espero.
export function acepto(p, enCurso, now) {
  const n = p.jugadas(enCurso).length;
  p.tablas.aceptando = { n, desde: now };
  return n;
}
// La rechazo: devuelve con cuántas la hizo (para decírselo), o null si no había.
export function rechazo(p) {
  const n = p.tablas.suya?.n ?? null;
  p.tablas.suya = null;
  return n;
}
// Acepta la mía viendo `n` jugadas: si sigue en pie y vemos lo mismo, 'acabar' (tablas); si no, 'nula'.
export function decideAceptacion(p, n, enCurso = null) {
  return ofertaMia(p, enCurso) && n === p.jugadas(enCurso).length ? 'acabar' : 'nula';
}
// Rechaza la mía (la que hice con `n`): ya no está en pie. Devuelve si era esa.
export function rechazada(p, n) {
  if (p.tablas.mia?.n !== n) return false;
  p.tablas.mia = null;
  return true;
}
// Dice que la suya que acepté ya no vale (se cruzó con una jugada): ni aceptando ni oferta. Devuelve si esperaba.
export function anuladas(p) {
  if (!p.tablas.aceptando) return false;
  p.tablas.aceptando = null;
  p.tablas.suya = null;
  return true;
}
// Aceptando, y sin noticias en `espera`: ya no valen (devuelve true una vez, al caducar).
export function aceptacionCaducada(p, now, espera = TABLAS_ESPERA) {
  if (!p.tablas.aceptando || now - p.tablas.aceptando.desde <= espera) return false;
  p.tablas.aceptando = null;
  p.tablas.suya = null;
  return true;
}

// LA PUNTUACIÓN de una partida online acabada (como en chess.com): en su ritmo (`categoryOf`), contra la puntuación
// que anunció el rival al empezar, con lo que he sacado (1, 0,5 o 0). No cuentan las anuladas ni las que no
// llegaron a empezar (menos de dos jugadas). Una sola vez por partida; devuelve lo de `ratings.record` (o null).
export function puntuaOnline(p, ratings) {
  if (p.puntos !== undefined) return p.puntos;
  if (!p.acabada || p.acabada.status === 'anulada' || p.moves.length < 2) return null;
  const { winner } = p.acabada;
  const score = !winner ? 0.5 : winner === p.color ? 1 : 0;
  p.puntos = ratings.record({ category: categoryOf({ mode: 'online', time: p.time }), opponent: p.rivalRating, score, rival: p.nombres?.[p.rival] ?? '' });
  return p.puntos;
}
