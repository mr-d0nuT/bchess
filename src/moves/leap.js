// Salto de ajedrez del caballo (diseño, sección 4). Todo puro y en casillas. La altura del arco
// depende de lo que hay bajo el camino: `points` son puntos { x, y, z } de las superficies de las
// demás piezas. Mientras la huella del caballo pasa sobre un punto, sus cascos van al menos
// LEAP_CLEARANCE por encima. La huella es un rectángulo de 2·halfLength por 2·halfWidth centrado en
// el caballo y alineado con el camino.

export const LEAP_CLEARANCE = 0.2;
export const LEAP_MIN_PEAK = 0.8;
export const LEAP_SPEED = 2.5; // casillas por segundo en horizontal: una L (√5) en ~0,9 s
export const LEAP_GRAVITY = 25; // de dibujos animados: los saltos altos tardan algo más
const SAMPLES = 64; // tramos en los que se tantea el camino

// Altura del arco (de 0 a 1) cuando ha recorrido la fracción `k` del camino: sube casi en vertical
// al despegar y baja casi en vertical al aterrizar, para librar las piezas pegadas a la salida y a
// la llegada.
export function arcShape(k) {
  return 2 * Math.sqrt(Math.max(0, k * (1 - k)));
}

// Altura máxima, duración y orientación del salto de `from` a `to` ({x, z}).
export function planLeap({ from, to, points = [], halfLength, halfWidth, clearance = LEAP_CLEARANCE, minPeak = LEAP_MIN_PEAK }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (!(distance > 0)) throw new Error('El salto necesita un destino distinto de la salida');
  const ux = dx / distance;
  const uz = dz / distance;
  // Cada punto, en coordenadas del camino: cuánto avanza (`along`) y a qué altura está.
  const under = [];
  for (const p of points) {
    const along = (p.x - from.x) * ux + (p.z - from.z) * uz;
    const aside = Math.abs((p.x - from.x) * uz - (p.z - from.z) * ux);
    if (aside <= halfWidth && along >= -halfLength && along <= distance + halfLength) under.push({ along, y: p.y });
  }
  // Entre dos muestras, un punto puede entrar en la huella: se cuenta desde una muestra antes y hasta
  // una después. Como el arco es cóncavo, basta con cumplir en las muestras.
  const reach = halfLength + distance / SAMPLES;
  let peak = minPeak;
  for (let i = 1; i < SAMPLES; i++) {
    const k = i / SAMPLES;
    let top = -Infinity;
    for (const p of under) if (Math.abs(p.along - k * distance) <= reach) top = Math.max(top, p.y);
    if (top > -Infinity) peak = Math.max(peak, (top + clearance) / arcShape(k));
  }
  return {
    from: { x: from.x, z: from.z },
    to: { x: to.x, z: to.z },
    distance,
    heading: Math.atan2(dx, dz),
    peak,
    duration: Math.max(distance / LEAP_SPEED, Math.sqrt((8 * peak) / LEAP_GRAVITY)),
  };
}

// Dónde van los cascos en el instante `u` del salto (0 al despegar, 1 al aterrizar). Avanza despacio
// al principio y al final. `climb` es el ángulo con el que sube (positivo) o baja (negativo).
export function leapAt(plan, u) {
  const t = Math.min(1, Math.max(0, u));
  const k = t * t * (3 - 2 * t);
  const e = 1e-3;
  const k0 = Math.max(0, k - e);
  const k1 = Math.min(1, k + e);
  return {
    x: plan.from.x + (plan.to.x - plan.from.x) * k,
    y: plan.peak * arcShape(k),
    z: plan.from.z + (plan.to.z - plan.from.z) * k,
    climb: Math.atan2(plan.peak * (arcShape(k1) - arcShape(k0)), plan.distance * (k1 - k0)),
  };
}
