// Nivel de calidad según el aparato. «movil» aligera texturas, sombras y resolución.

export const LEVELS = {
  movil: { name: 'movil', textureSize: 1024, shadowMapSize: 1024, maxPixelRatio: 1.5 },
  ordenador: { name: 'ordenador', textureSize: 2048, shadowMapSize: 2048, maxPixelRatio: 2 },
};

export function pickQuality({ coarsePointer, screenWidth, screenHeight }) {
  const shortSide = Math.min(screenWidth, screenHeight);
  return coarsePointer && shortSide < 900 ? LEVELS.movil : LEVELS.ordenador;
}

// Permite forzar el nivel para probar: ?calidad=movil o ?calidad=ordenador
export function qualityFromQuery(search) {
  const value = new URLSearchParams(search).get('calidad');
  return value && Object.hasOwn(LEVELS, value) ? LEVELS[value] : null;
}
