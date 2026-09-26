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

// Cerrar los dedos pide girar cada falange sobre SU eje, y lo que el juego sabe hacer (`turnBone`)
// gira los huesos en el espacio de la figura: eso es justo lo que hace que el contoneo y el paso
// funcionen con esqueletos de nombres distintos, pero a unos dedos, que cada uno apunta hacia un
// lado, los manda a paseo. El puño está en `fist.js`, que gira cada hueso en su propio espacio;
// aquí viven las dos cosas suyas que no necesitan ni un esqueleto ni la escena.

// Cuánto cierra cada falange respecto de la primera: la del medio es la que más se dobla y la de la
// punta la que menos, que es como se cierra una mano.
export const FALANGES = [1, 1.15, 0.75];

// El ángulo de [0, tope] cuyo `medir(ángulo)` más se acerca a `objetivo`, barriendo grueso y luego
// fino. Con esto averigua cada dedo cuánto tiene que cerrarse: lo que se mide es la punta del dedo
// dando una vuelta alrededor del nudillo, que no tiene fórmula, pero es suave y con un solo valle
// en el tramo que importa. Solo se buscan ángulos positivos porque un dedo solo se dobla hacia la
// palma: dejándolo libre, el barrido encuentra ángulos que lo doblan HACIA ATRÁS y también llegan
// al grosor pedido.
export function bestAngle(medir, objetivo, { tope = 130, paso = 4 } = {}) {
  let mejor = { angulo: 0, error: Infinity };
  const probar = (angulo) => {
    const error = Math.abs(medir(angulo) - objetivo);
    if (error < mejor.error) mejor = { angulo, error };
  };
  for (let a = 0; a <= tope; a += paso) probar(a);
  const desde = Math.max(0, mejor.angulo - paso);
  for (let a = desde; a <= Math.min(tope, mejor.angulo + paso); a += 1) probar(a);
  return mejor;
}
