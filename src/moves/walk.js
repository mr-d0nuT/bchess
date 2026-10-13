// Paseo entre dos puntos del tablero: orientación, distancia y duración.
// Orientación como en Three.js: rotation.y = atan2(dx, dz) hace que un modelo glTF,
// que mira a +Z, mire hacia el destino.

// En reposo miran siempre al oponente, como las piezas de ajedrez: las blancas hacia -Z
// (hacia las negras) y las negras hacia +Z (hacia las blancas).
export const REST_FACING = Math.PI;
const FACING_BY_COLOR = { white: Math.PI, black: 0 };
export const BOARD_EDGE = 4.5; // del centro del tablero al borde de su marco

export function restFacingFor(color) {
  if (!Object.hasOwn(FACING_BY_COLOR, color)) throw new Error(`Color no válido: ${color}`);
  return FACING_BY_COLOR[color];
}

export function planWalk(from, to, speed) {
  if (!(speed > 0)) throw new Error('La velocidad debe ser positiva');
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  return { distance, heading: Math.atan2(dx, dz), duration: distance / speed };
}

export function pointAlong(from, to, t) {
  const k = Math.min(1, Math.max(0, t));
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
}

// IR A OTRA CASILLA, como lo hace `walkOver` (`sequence.js`): se gira hacia donde va, salta de la peana (lo que
// mide su radio, con un saltito), la peana se esfuma mientras empieza a andar en el sitio, anda hasta el centro de
// la casilla, la peana lo sube y se vuelve hacia el oponente. Los tiempos, aquí, para que el mover y quien
// necesite saber dónde estará la pieza en cada momento (el enroque: la torre salta por encima del rey) usen los
// mismos.
export const WALK_TURN_SECONDS = 0.25;
export const HOP_DISTANCE = 0.5;
export const HOP_SECONDS = 0.35;
export const HOP_LIFT = 0.18;
export const VANISH_SECONDS = 0.4;
export const RISE_SECONDS = 0.4;
export const REST_TURN_SECONDS = 0.35;

// Ese paseo en el tiempo, de `from` a `to` ({x, z}) a `speed` y con una peana de `pedestal` de alto. `at(t)` (en
// segundos desde que empieza) dice dónde está la figura ({x, z} y la altura de sus pies, `y`) y qué hace
// (`phase`: 'turn', 'hop', 'vanish', 'walk', 'rise' o 'rest'). `arrive` es cuando llega andando y `end`, cuando
// acaba de volverse.
export function walkOverTimeline({ from, to, speed, pedestal }) {
  const { heading } = planWalk(from, to, speed);
  const hopEnd = { x: from.x + Math.sin(heading) * HOP_DISTANCE, z: from.z + Math.cos(heading) * HOP_DISTANCE };
  const walk = planWalk(hopEnd, to, speed);
  const hopAt = WALK_TURN_SECONDS;
  const vanishAt = hopAt + HOP_SECONDS;
  const walkAt = vanishAt + VANISH_SECONDS;
  const arrive = walkAt + walk.duration;
  const rested = arrive + RISE_SECONDS;
  const end = rested + REST_TURN_SECONDS;
  function at(t) {
    if (t < hopAt) return { x: from.x, z: from.z, y: pedestal, phase: 'turn' };
    if (t < vanishAt) {
      const k = (t - hopAt) / HOP_SECONDS;
      return { ...pointAlong(from, hopEnd, k), y: pedestal * (1 - k) + Math.sin(Math.PI * k) * HOP_LIFT, phase: 'hop' };
    }
    if (t < walkAt) return { ...hopEnd, y: 0, phase: 'vanish' };
    if (t < arrive) return { ...pointAlong(hopEnd, to, (t - walkAt) / walk.duration), y: 0, phase: 'walk' };
    if (t < rested) return { x: to.x, z: to.z, y: pedestal * (1 - (1 - (t - arrive) / RISE_SECONDS) ** 3), phase: 'rise' };
    return { x: to.x, z: to.z, y: pedestal, phase: t < end ? 'turn' : 'rest' };
  }
  return { heading, hopEnd, walkAt, arrive, end, at };
}

// Diferencia de ángulo más corta, en (-PI, PI].
export function shortestTurn(fromAngle, toAngle) {
  let d = (toAngle - fromAngle) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

// Velocidad de paseo: si el clip avanza (root motion), lo que avanza por segundo;
// si anda en el sitio, 0,7 alturas por segundo (ritmo de paseo de una persona).
export function strideSpeed({ rootDistance, clipDuration, height }) {
  if (rootDistance > 0.05 * height && clipDuration > 0) return rootDistance / clipDuration;
  return 0.7 * height;
}

// Punto del borde del marco más cercano a `point`, en línea recta hacia fuera: por donde huye un
// caballo. A igual distancia de dos bordes, sale por los lados (eje X).
export function nearestEdgeExit(point, edge = BOARD_EDGE) {
  if (Math.abs(point.x) >= Math.abs(point.z)) return { x: point.x < 0 ? -edge : edge, z: point.z };
  return { x: point.x, z: point.z < 0 ? -edge : edge };
}

// El aire que va con una velocidad: de los que tiene la pieza (`gaits`, { aire: velocidad }), el que
// menos se aparta de ella en proporción —al paso, al trote o al galope—, y a qué ritmo ha de ir su
// animación para que los cascos no patinen (negativo si va hacia atrás). Sin aires, el paso tal cual.
export function pickGait(gaits, speed) {
  const own = Object.entries(gaits ?? {}).filter(([, value]) => value > 0);
  if (!own.length || !speed) return { gait: 'walk', timeScale: Math.sign(speed) || 1 };
  const off = ([, value]) => Math.abs(Math.log(value / Math.abs(speed)));
  const [gait, value] = own.reduce((best, entry) => (off(entry) < off(best) ? entry : best));
  return { gait, timeScale: speed / value };
}
