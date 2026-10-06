// EL PÚBLICO (punto 9 del plan de mejora): al acabar un combate, las piezas que lo han visto de cerca
// reaccionan. Las del bando que gana dan saltitos de alegría (y una lo grita); una del que pierde se lamenta
// («ooooh…») y hace un gesto. Pocas, y no siempre: con todas a la vez, o en cada captura, cansaría.
//
// Aquí solo se elige quién (puro); lo hace `main.js`. Solo piezas que se mueven por su cuenta con el andar
// de siempre (peones, alfiles, damas y reyes): el caballo y la torre van aparte.

export const NEAR = 2; // casillas de distancia (en cualquier dirección) a las que se ve el combate
export const CHEER_MAX = 2;
export const REACT_CHANCE = 0.75; // y no en todos los combates
const KINDS = new Set(['pawn', 'bishop', 'queen', 'king']);
const FILES = 'abcdefgh';

const coords = (square) => ({ file: FILES.indexOf(square[0]), rank: Number(square[1]) - 1 });
const distance = (a, b) => {
  const p = coords(a);
  const q = coords(b);
  return Math.max(Math.abs(p.file - q.file), Math.abs(p.rank - q.rank));
};

function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Quién reacciona a un combate en `at` (casilla) que ha ganado `winner` (color): `pieces` = [{ kind, color,
// square }] (sin el que ha ganado). Devuelve { cheer: [...] (de las del ganador, las más cercanas antes),
// sigh: pieza o null (una del que pierde) }, o null si esta vez nadie.
export function pickAudience({ pieces, at, winner, random = Math.random }) {
  if (random() >= REACT_CHANCE) return null;
  const cerca = pieces.filter((p) => KINDS.has(p.kind) && p.square && distance(p.square, at) <= NEAR);
  const suyas = shuffle(cerca.filter((p) => p.color === winner), random)
    .sort((a, b) => distance(a.square, at) - distance(b.square, at))
    .slice(0, CHEER_MAX);
  const otras = shuffle(cerca.filter((p) => p.color !== winner), random);
  if (!suyas.length && !otras.length) return null;
  return { cheer: suyas, sigh: otras[0] ?? null };
}
