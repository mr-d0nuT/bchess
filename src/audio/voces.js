import { sfx } from './sfx.js';

// LAS VOCES DE LAS PIEZAS: gritos de guerra, gruñidos al golpear, quejidos, gritos al caer y la victoria.
// Sin palabras (el juego habla siete idiomas). Cada pieza tiene la suya: de hombre los peones, los
// caballeros, los alfiles y los reyes; de mujer, las reinas; y el gigante de la torre ruge. Y su tono: el
// peón, algo más agudo; el rey, más grave; el caballero, que habla dentro del yelmo, un poco también.
//
// Al ganar, las blancas lo celebran (¡yahoo!, ¡woohoo!, ¡hurra!) y las negras se ríen como villanos; la
// reina blanca grita de alegría y la negra se ríe como una bruja.
//
// Las piezas con animaciones avisan solas al empezar a atacar, recibir o caer (`voicesFor`); lo demás
// (las reinas y el rey, que se mueven hueso a hueso, y los momentos de cada combate) lo pide el combate
// con `grita(entrada, momento)`.

const VOZ = { pawn: 'h', knight: 'h', bishop: 'h', king: 'h', queen: 'm', rook: 'g' };
const TONO = { pawn: 1.07, knight: 0.93, bishop: 1, king: 0.86, queen: 1, rook: 0.92 };
const DICE = {
  h: { grito: 'grito_h', ataque: 'ataque_h', dolor: 'dolor_h', caida: 'caida_h', vuela: 'vuela_h', victoria: 'victoria_h', ay: 'ay_comico', huh: 'huh', decepcion: 'decepcion', risa: 'risa_malvada', esfuerzo: 'esfuerzo', alivio: 'alivio' },
  m: { grito: 'grito_m', ataque: 'ataque_m', dolor: 'dolor_m', caida: 'caida_m', vuela: 'caida_m', victoria: 'victoria_m', ay: 'dolor_m', risa: 'risa_bruja' },
  g: { grito: 'rugido', ataque: 'rugido', dolor: 'gigante_dolor', caida: 'gigante_dolor', vuela: 'gigante_dolor', victoria: 'gigante_victoria', ay: 'gigante_dolor', huh: 'rugido', risa: 'gigante_victoria' },
};
const ATTACK_CHANCE = 0.65; // no todos los golpes llevan gruñido: cansaría
const PAUSA = { ataque: 0.5, dolor: 0.35 }; // segundos que ha de callar una pieza antes de repetir

const ultima = new WeakMap(); // pieza → { momento: instante }

// Que diga lo suyo en ese `momento`. `entry` es la pieza ({ kind, color }); devuelve el sonido o null.
export function grita(entry, momento, { volume = 1 } = {}) {
  if (!entry) return null;
  const voz = VOZ[entry.kind] ?? 'h';
  let sonido = DICE[voz][momento];
  if (momento === 'victoria' && entry.color === 'black') {
    if (voz === 'h') sonido = 'risa_malvada';
    if (voz === 'm') sonido = 'risa_bruja';
  }
  if (!sonido) return null;
  const ahora = performance.now() / 1000;
  const suyas = ultima.get(entry) ?? {};
  if (PAUSA[momento] && ahora - (suyas[momento] ?? -Infinity) < PAUSA[momento]) return null;
  suyas[momento] = ahora;
  ultima.set(entry, suyas);
  return sfx.play(sonido, { volume, rate: TONO[entry.kind] ?? 1 });
}

// Lo que dice una pieza con animaciones al empezar cada movimiento suyo (lo engancha `main.js`).
const POR_MOVIMIENTO = { attack: 'ataque', taunt: 'grito', hit: 'dolor', defeat: 'caida', fall: 'caida' };
// Y en los gestos de reposo, según cuál (su clave): al ESTIRARSE (el peón se dobla hasta tocarse la pierna,
// el gesto «scratch»), un quejido de esfuerzo al doblarse y un suspiro al erguirse. `en`: segundos desde
// que empieza el gesto.
const GESTOS = {
  scratch: [{ momento: 'esfuerzo', en: 0.25 }, { momento: 'alivio', en: 2.45 }],
};
// `volumen()`: lo fuerte que se oye ahora (lo lejos que está de la cámara); para los gestos de reposo, que
// pasan en cualquier rincón del tablero.
export function voicesFor(entry, { volumen = () => 1 } = {}) {
  return (action, key) => {
    if (action === 'fidget') {
      for (const { momento, en } of GESTOS[key] ?? []) {
        setTimeout(() => grita(entry, momento, { volume: volumen() }), en * 1000);
      }
      return;
    }
    const momento = POR_MOVIMIENTO[action];
    if (!momento) return;
    if (momento === 'ataque' && Math.random() > ATTACK_CHANCE) return;
    grita(entry, momento);
  };
}
