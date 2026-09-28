// Cuentas de la cámara de los botones, sin nada de three para poder probarlas sueltas.

// Gira `point` alrededor del eje vertical que pasa por `pivot`, `angle` radianes (el mismo sentido
// que `rotation.y` en three). La altura no cambia. Media vuelta alrededor del centro del tablero es
// mirarlo desde el lado de las negras.
export function turnAround(point, pivot, angle) {
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: pivot.x + dx * c + dz * s, y: point.y, z: pivot.z - dx * s + dz * c };
}

const LOOK = 0.5; // a qué parte de su altura mira: al medio de la figura con su peana
const RISE = 0.3; // cuánto más alta que ese punto va la cámara, en alturas de la pieza: un poco desde arriba
const MARGIN = 0.66; // media altura de encuadre por cada altura de pieza: la figura entera y aire alrededor

// El primer plano de una pieza que mide `height` (con su peana) y está en `at` (su casilla, a ras de
// tablero), visto desde el lado donde ya está la cámara (`from`), con una cámara de `fov` grados en
// vertical. Devuelve adónde mira y dónde se pone.
export function closeUpView({ at, height, from, fov }) {
  const target = { x: at.x, y: height * LOOK, z: at.z };
  let dx = from.x - target.x;
  let dz = from.z - target.z;
  const lejos = Math.hypot(dx, dz);
  if (lejos < 1e-6) {
    dx = 0;
    dz = 1;
  } else {
    dx /= lejos;
    dz /= lejos;
  }
  const distance = (height * MARGIN) / Math.tan(((fov ?? 40) * Math.PI) / 360);
  return {
    target,
    position: { x: target.x + dx * distance, y: target.y + height * RISE, z: target.z + dz * distance },
  };
}
