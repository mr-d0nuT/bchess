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
