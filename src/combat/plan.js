import { pickVariant } from '../pieces/clips.js';

// Plan del combate entre dos peones: estilo, puestos de los luchadores, golpes y cuánto debe
// resbalar la lanza para no atravesar al rival. Todo puro y en casillas.

export const STYLES = ['duel', 'melee'];
export const DUEL_RETREAT = 0.3; // en el duelo, el atacante se retira dentro de su casilla
export const MELEE_DISTANCE = 0.9; // separación de los luchadores en el cuerpo a cuerpo
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

// Claves de los golpes que sirven para un estilo. `attacks` son las versiones de ataque de la
// pieza ({ key, spear }) y `strikes`, sus medidas por clave. El duelo usa las estocadas; el
// cuerpo a cuerpo, los golpes con mano o pie que llegan al rival sin abrir tanto los pies
// (`sideStep`) que pisen las casillas vecinas, que en el cuerpo a cuerpo quedan más cerca.
export function usableStrikes(attacks, strikes, style) {
  return attacks
    .filter((attack) => {
      const strike = strikes[attack.key];
      if (!strike) return false;
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
