// Gestos especiales en reposo (mirar alrededor, rascarse, asustarse): cada pocos segundos, un
// solo peón del tablero hace uno. El resto del tiempo todos siguen en su reposo, con ese
// balanceo suave sobre la peana. Lo pidió el usuario: con un reloj por peón se movían sin parar,
// y después, que los gestos fueran más a menudo (2026-09-15).

export const GESTURE_MIN_MS = 4000;
export const GESTURE_RANGE_MS = 6000;
export const GESTURE_RETRY_MS = 2000; // si ahora no puede nadie, se vuelve a probar en un rato

// Espera desde que acaba un gesto hasta que empieza el siguiente.
export function nextGestureDelay(random = Math.random) {
  return GESTURE_MIN_MS + random() * GESTURE_RANGE_MS;
}

// Elige al azar quién hace el gesto, sin repetir el último si hay alguien más.
export function pickPerformer(candidates, last, random = Math.random) {
  const pool = candidates.length > 1 ? candidates.filter((candidate) => candidate !== last) : candidates;
  if (!pool.length) return null;
  return pool[Math.floor(random() * pool.length)];
}
