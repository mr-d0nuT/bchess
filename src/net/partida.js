import { INITIAL_FEN, Position } from '../chess/position.js';
import { createChessClock, findTimeControl } from '../chess/timecontrol.js';
import { cleanName } from '../names.js';

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
    // reloj. Devuelve { movio, status } (el de las reglas tras lo jugado, o null si no ha movido).
    avanza(now) {
      let movio = false;
      while (!p.acabada && p.position.side === p.rival && p.remote.has(p.moves.length)) {
        const uci = p.remote.get(p.moves.length);
        const m = p.position.findUci(uci);
        if (m === null || m === undefined) break;
        p.position.make(m);
        p.moves.push(uci);
        p.clock?.press(p.rival, now);
        p.pulsaPendiente(now);
        movio = true;
      }
      return { movio, status: movio ? p.position.status() : null };
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
      if (status === 'resign') return p.rival;
      return null;
    },
  };
  p.clock?.start('white', now);
  return p;
}
