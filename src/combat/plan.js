import { pickVariant } from '../pieces/clips.js';

// Plan del combate entre dos peones: estilo, puestos de los luchadores, golpes y cuánto debe
// resbalar la lanza para no atravesar al rival. Todo puro y en casillas.

export const STYLES = ['duel', 'melee'];
export const DUEL_RETREAT = 0.3; // en el duelo, el atacante se retira dentro de su casilla
// Separación de los luchadores en el cuerpo a cuerpo, de centro a centro. Con 0,9 los dos cuerpos
// casi se tocaban (escudos y lanzas por delante): el usuario los veía encima el uno del otro. Más de
// 1,0 deja fuera el puñetazo (llega a 0,68) y el cuerpo a cuerpo se quedaría en patadas. Solo valen
// los golpes que llegan a esta distancia; si no hay ninguno, pelean a lanza.
export const MELEE_DISTANCE = 1.0;
export const TORSO = 0.17; // del centro de la figura a su pecho
const MELEE_SLACK = 0.15; // lo que un golpe puede quedarse corto en el cuerpo a cuerpo
const MELEE_SIDE_STEP = 0.3; // lo que pueden abrirse los pies a los lados en el cuerpo a cuerpo

// Estilo al azar, sin repetir el del combate anterior.
export function pickStyle(last, random = Math.random) {
  const pool = STYLES.filter((style) => style !== last);
  return pool[Math.floor(random() * pool.length)];
}

// Dónde se coloca cada luchador y hacia dónde mira (ángulos como en `walk.js`). `from` y `to`
// son los centros {x, z} de las casillas del atacante y del defensor.
export function fightSpots(from, to, style) {
  if (!STYLES.includes(style)) throw new Error(`Estilo no válido: ${style}`);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const attacker = style === 'duel'
    ? { x: from.x - ux * DUEL_RETREAT, z: from.z - uz * DUEL_RETREAT }
    : { x: to.x - ux * MELEE_DISTANCE, z: to.z - uz * MELEE_DISTANCE };
  const defender = { x: to.x, z: to.z };
  return {
    attacker,
    defender,
    attackerFacing: Math.atan2(ux, uz),
    defenderFacing: Math.atan2(-ux, -uz),
    distance: Math.hypot(defender.x - attacker.x, defender.z - attacker.z),
  };
}

// Cuánto debe resbalar la lanza hacia el regatón para que la punta, que en la estocada llega
// a `reach`, se quede en el pecho de un rival a `distance`.
export function gripSlideForReach({ reach, distance, torso = TORSO }) {
  return Math.max(0, reach - (distance - torso));
}

// Muestra con el valor más alto de una lista de { t, value }, o null si está vacía.
export function peak(samples) {
  let best = null;
  for (const sample of samples) if (!best || sample.value > best.value) best = sample;
  return best;
}

// ¿Se da este golpe con la mano del escudo (`shield`, el nombre del hueso del que cuelga)? El escudo es
// para parar, no para pegar: el usuario lo pidió, que ataquen con la lanza, con la espada o con lo que
// tengan, pero no a escudazos. Los puñetazos de izquierda del peón eran justo eso, y además con el
// escudo tumbado por delante.
export const shieldStrike = (strike, shield) => Boolean(shield) && strike?.body?.bone === shield;
// El hueso del que cuelga el escudo de una pieza (el de la mano que lo lleva), o null si no lleva.
export const shieldOf = (piece) => piece?.props?.shield?.parent?.name ?? null;

// Claves de los golpes que sirven para un estilo. `attacks` son las versiones de ataque de la
// pieza ({ key, spear }) y `strikes`, sus medidas por clave. El duelo usa las estocadas; el
// cuerpo a cuerpo, los golpes con mano o pie que llegan al rival sin abrir tanto los pies
// (`sideStep`) que pisen las casillas vecinas, que en el cuerpo a cuerpo quedan más cerca. Nunca los
// que se dan con la mano del escudo (`shield`).
export function usableStrikes(attacks, strikes, style, { shield = null } = {}) {
  return attacks
    .filter((attack) => {
      const strike = strikes[attack.key];
      if (!strike || shieldStrike(strike, shield)) return false;
      if (style === 'duel') return attack.spear === 'forward' && Boolean(strike.spear);
      return Boolean(strike.body)
        && strike.body.reach >= MELEE_DISTANCE - TORSO - MELEE_SLACK
        && (strike.sideStep ?? 0) <= MELEE_SIDE_STEP;
    })
    .map((attack) => attack.key);
}

// Intercambios: uno o dos golpes previos (el primero del atacante; el segundo, un contraataque
// del defensor) y el golpe final del atacante, sin repetir golpe dos veces seguidas.
export function planExchanges(keys, random = Math.random) {
  if (!keys.length) throw new Error('No hay golpes para este estilo');
  let last = -1;
  const next = () => {
    last = pickVariant(keys.length, last, random);
    return keys[last];
  };
  const beats = [{ by: 'attacker', key: next(), final: false }];
  if (random() < 0.5) beats.push({ by: 'defender', key: next(), final: false });
  beats.push({ by: 'attacker', key: next(), final: true });
  return beats;
}

// Clave del golpe con mano o pie que más lejos llega por delante, o null si no hay ninguno medido. Sin
// contar los que se dan con la mano del escudo (`shield`).
export function bestStrike(attacks, strikes, { shield = null } = {}) {
  let best = null;
  for (const attack of attacks) {
    const strike = strikes[attack.key];
    const body = strike?.body;
    if (!body || shieldStrike(strike, shield)) continue;
    if (!best || body.reach > strikes[best].body.reach) best = attack.key;
  }
  return best;
}

// Dónde se para quien golpea con la mano o el pie para que el golpe, que le llega a `reach` por
// delante, alcance el pecho de un rival que lo tiene a `torso` de su centro, sin acercarse a menos
// de `closest`. Si desde `from` ya le llega, no se mueve. `from` y `to` son centros {x, z}.
export function strikeSpot(from, to, { reach, torso = TORSO, closest = 0 }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const distance = Math.min(length, Math.max(reach + torso, closest));
  return {
    attacker: { x: to.x - ux * distance, z: to.z - uz * distance },
    attackerFacing: Math.atan2(ux, uz),
    defenderFacing: Math.atan2(-ux, -uz),
    distance,
  };
}

// El tajo de arriba abajo sobre la cabeza del rival: en el camino de la punta de la espada (`path`, de
// { t, y, z } en el marco de quien pega, +z al frente), el primer instante después de su punto más alto
// en que la punta baja de `height` (lo alto del casco). Devuelve cuándo (`t`), a qué distancia por
// delante (`reach`: plantándose ahí del centro del rival, la hoja le cae en el casco) y cuándo tiene la
// espada más alta (`top`); null si la punta nunca baja de ahí.
export function chopHit(path, height) {
  if (!path?.length) return null;
  let top = 0;
  for (let i = 1; i < path.length; i++) if (path[i].y > path[top].y) top = i;
  for (let i = top + 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.y >= height && b.y < height) {
      const k = (a.y - height) / (a.y - b.y);
      return { t: a.t + (b.t - a.t) * k, reach: a.z + (b.z - a.z) * k, top: path[top].t };
    }
  }
  return null;
}
