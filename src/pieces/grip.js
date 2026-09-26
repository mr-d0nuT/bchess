// Si el extremo más bajo de la lanza se hunde por debajo del suelo (la peana o el tablero), la
// lanza resbala por la mano a lo largo de su eje hasta quedar encima. Devuelve cuánto se
// desliza, en unidades del tablero: positivo hacia la punta y negativo hacia el regatón.
// `axisY` es la componente vertical del eje unitario de la lanza, del regatón a la punta. Con la
// lanza casi horizontal, deslizarla apenas la sube, así que no se toca.
export function slideAboveFloor({ lowY, floorY, axisY, minAxis = 0.3, maxSlide = 1 }) {
  if (lowY >= floorY || Math.abs(axisY) < minAxis) return 0;
  const slide = (floorY - lowY) / axisY;
  return Math.max(-maxSlide, Math.min(maxSlide, slide));
}

// NO hay aquí una postura de puño, y no por olvido. Cerrar los dedos pide girar cada falange sobre
// SU eje, y lo que el juego sabe hacer (`turnBone`) gira los huesos en el espacio de la figura: eso
// es justo lo que hace que el contoneo y el paso funcionen con esqueletos de nombres distintos,
// pero a unos dedos, que cada uno apunta hacia un lado, los manda a paseo. Si algún día hace falta
// un puño, lo primero es que `turnBone` sepa girar también en el espacio del hueso.
