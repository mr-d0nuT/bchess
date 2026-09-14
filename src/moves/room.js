// Hacer sitio a los gigantes (diseño, sección 6). Todo puro y en casillas: dónde debe ponerse cada
// pieza para dejar sitio (`roomTarget`) y cómo avanza hacia allí sin chocar con nadie
// (`stepRoom`). Un cuerpo que pide sitio es un tramo { from, to } con grosor `radius`; si
// from = to, un círculo.

export const ROOM_GAP = 0.03; // hueco mínimo entre los bordes de dos piezas
export const MAX_SHIFT = 0.45; // lo más que se aleja una pieza del centro de su casilla
export const SLIDE_SPEED = 1.2; // casillas por segundo
export const SLIDE_ACCEL = 6; // casillas por segundo², para arrancar con suavidad
const SLIDE_GAIN = 8; // al llegar frena: la velocidad no pasa de lo que falta × SLIDE_GAIN
const SNAP = 0.004; // más cerca del objetivo que esto, llega de golpe
const SAMPLE = 0.01; // paso con el que se tantea cada dirección
const DETOURS = [0, 20, -20, 40, -40, 60, -60].map((degrees) => (degrees * Math.PI) / 180);

function closestOnSegment(from, to, x, z) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length2)) : 0;
  return { x: from.x + dx * t, z: from.z + dz * t };
}

// Holgura de una pieza de radio `radius` en (x, z) con los cuerpos: negativa si no les deja sitio.
export function roomClearance(x, z, radius, bodies) {
  let clearance = Infinity;
  for (const body of bodies) {
    const near = closestOnSegment(body.from, body.to, x, z);
    clearance = Math.min(clearance, Math.hypot(x - near.x, z - near.z) - body.radius - radius - ROOM_GAP);
  }
  return clearance;
}

function fits(x, z, radius, others) {
  return others.every((other) => Math.hypot(x - other.x, z - other.z) >= other.radius + radius + ROOM_GAP);
}

// Desplazamiento { x, z }, respecto al centro de su casilla (`piece.home`), al que debe ir una
// pieza para dejar sitio a `bodies` sin acercarse demasiado a `others` ({ x, z, radius }). Se aleja
// del cuerpo que más la aprieta; si por ahí choca con otra pieza, prueba a desviarse. Si no hay
// hueco suficiente, elige lo que más sitio deja.
export function roomTarget(piece, bodies, others = []) {
  const { home, radius } = piece;
  if (!bodies.length || roomClearance(home.x, home.z, radius, bodies) >= 0) return { x: 0, z: 0 };
  let away = null;
  for (const body of bodies) {
    const near = closestOnSegment(body.from, body.to, home.x, home.z);
    const distance = Math.hypot(home.x - near.x, home.z - near.z);
    const deficit = body.radius + radius + ROOM_GAP - distance;
    if (distance > 1e-6 && (!away || deficit > away.deficit)) {
      away = { deficit, angle: Math.atan2(home.x - near.x, home.z - near.z) };
    }
  }
  if (!away) return { x: 0, z: 0 };
  let best = null;
  for (const detour of DETOURS) {
    const dx = Math.sin(away.angle + detour);
    const dz = Math.cos(away.angle + detour);
    let reached = null;
    for (let i = 1; i <= Math.round(MAX_SHIFT / SAMPLE); i++) {
      const shift = i * SAMPLE;
      const x = home.x + dx * shift;
      const z = home.z + dz * shift;
      if (!fits(x, z, radius, others)) break;
      reached = { x: dx * shift, z: dz * shift, clearance: roomClearance(x, z, radius, bodies) };
      if (reached.clearance >= 0) return { x: reached.x, z: reached.z };
    }
    if (reached && (!best || reached.clearance > best.clearance)) best = reached;
  }
  return best ? { x: best.x, z: best.z } : { x: 0, z: 0 };
}

// ¿Puede la pieza pasar al desplazamiento (x, z)? Sí, si queda a ROOM_GAP de todas las demás o, de
// las que ya tenía más cerca, no se acerca más.
function free(piece, x, z, pieces, fixed) {
  const nx = piece.home.x + x;
  const nz = piece.home.z + z;
  const cx = piece.home.x + piece.offset.x;
  const cz = piece.home.z + piece.offset.z;
  const clearOf = (ox, oz, otherRadius) => {
    const after = Math.hypot(nx - ox, nz - oz);
    return after >= piece.radius + otherRadius + ROOM_GAP || after >= Math.hypot(cx - ox, cz - oz);
  };
  for (const other of pieces) {
    if (other !== piece && !clearOf(other.home.x + other.offset.x, other.home.z + other.offset.z, other.radius)) return false;
  }
  return fixed.every((other) => clearOf(other.x, other.z, other.radius));
}

// Avanza un fotograma de `dt` segundos cada pieza hacia su objetivo: acelera poco a poco hasta
// SLIDE_SPEED y frena al llegar. Da el paso entero, o la mitad, o un cuarto, solo si `free` lo
// permite; las piezas se mueven de una en una, así que ninguna choca aunque se muevan varias.
export function stepRoom(pieces, fixed, dt) {
  for (const piece of pieces) {
    const dx = piece.target.x - piece.offset.x;
    const dz = piece.target.z - piece.offset.z;
    const distance = Math.hypot(dx, dz);
    if (distance === 0) {
      piece.speed = 0;
      continue;
    }
    if (distance <= SNAP) {
      if (free(piece, piece.target.x, piece.target.z, pieces, fixed)) {
        piece.offset.x = piece.target.x;
        piece.offset.z = piece.target.z;
      }
      piece.speed = 0;
      continue;
    }
    const speed = Math.min(SLIDE_SPEED, distance * SLIDE_GAIN, piece.speed + SLIDE_ACCEL * dt);
    const length = Math.min(distance, speed * dt);
    piece.speed = 0;
    for (const k of [1, 0.5, 0.25]) {
      const x = piece.offset.x + (dx / distance) * length * k;
      const z = piece.offset.z + (dz / distance) * length * k;
      if (!free(piece, x, z, pieces, fixed)) continue;
      piece.offset.x = x;
      piece.offset.z = z;
      piece.speed = speed * k;
      break;
    }
  }
}
