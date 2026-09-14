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
