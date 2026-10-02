// Las posturas de los conjuros: el bastonazo del rey y el hechizo de la reina.
//
// Ni reyes ni reinas traen una sola animación —se exportaron pelados, porque cualquier clip les
// destrozaba la capa—, así que sus ataques se los pone el juego hueso a hueso, igual que el andar.
// Aquí solo están las POSTURAS, en grados y en el espacio de la figura (+X a su izquierda, +Y
// arriba, +Z delante); el compás lo lleva quien las usa, mezclando de una a otra.
//
// Cada giro parte de la postura del modelo. El rey viene con los brazos en cruz —es la pose que pide el
// aparejo automático— y en reposo se le bajan (`restArms`), así que en el suyo el cero es el brazo
// horizontal; la reina los trae ya colgando, y en el suyo el cero es el brazo caído. En los dos, girar
// en +Z SUBE el izquierdo (hacia fuera) y en -Z lo baja, y al derecho al revés: medido, no supuesto.
// (Aquí decía lo contrario, y la reina conjuraba con los brazos cruzados: cada uno giraba hacia
// dentro, le atravesaba el pecho y acababa en el lado del otro.)

// Mezcla dos posturas. `t` de 0 a 1. Los huesos que solo estén en una se mezclan contra su reposo,
// que es lo que hace que una postura pueda entrar y salir sin dar tirones.
export function blend(a, b, t) {
  const k = Math.max(0, Math.min(1, t));
  const pose = {};
  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const uno = a[bone] ?? {};
    const otro = b[bone] ?? {};
    pose[bone] = {
      x: (uno.x ?? 0) + ((otro.x ?? 0) - (uno.x ?? 0)) * k,
      y: (uno.y ?? 0) + ((otro.y ?? 0) - (uno.y ?? 0)) * k,
      z: (uno.z ?? 0) + ((otro.z ?? 0) - (uno.z ?? 0)) * k,
    };
  }
  return pose;
}

// Los brazos colgando, que es de donde salen y adonde vuelven todos.
export function armsDown(drop = 66) {
  return {
    L_Arm: { z: -drop },
    R_Arm: { z: drop },
    L_ForeArm: { x: -10 },
    R_ForeArm: { x: -10 },
  };
}

// EL REY. Llama a la tormenta con el báculo en alto y lo clava delante de él contra el tablero (el báculo
// resbala por el puño hasta el suelo: `setGripSlide`, lo pone quien lo usa).
//
// Medido en su aparejo, no supuesto: en el brazo derecho, +Y lo lleva hacia DELANTE; en el tronco, +X lo
// inclina hacia delante y -X lo arquea hacia atrás; en la cabeza, -X mira arriba. Antes se suponía lo
// contrario en el brazo y en el tronco, y el «mazazo» echaba el báculo atrás y al rey de espaldas.
export const KING = {
  // Levanta el báculo por encima de la cabeza (para el bastonazo de siempre).
  raise: {
    R_Arm: { z: -128, y: 16 },
    R_ForeArm: { x: -22 },
    L_Arm: { z: -52, y: -18 },
    L_ForeArm: { x: -26 },
    Spine: { x: -8 },
    Spine2: { x: -6 },
    Head: { x: -10 },
  },
  // Los dos brazos al cielo, el báculo en alto, el cuerpo arqueado hacia atrás y la cara mirando arriba:
  // está llamando a la tormenta.
  invoke: {
    R_Arm: { z: -100, y: 6 },
    R_ForeArm: { x: -10 },
    L_Arm: { z: 72, y: -14 },
    L_ForeArm: { x: -16 },
    Spine: { x: -12 },
    Spine2: { x: -8 },
    Head: { x: -26 },
  },
  // Y abajo: el brazo del báculo, delante y bajo, clavándolo en el tablero; el otro, el puño cerrado
  // abajo; el cuerpo volcado hacia delante y mirando dónde ha caído.
  smite: {
    R_Arm: { z: 58, y: 85 },
    R_ForeArm: { x: -15 },
    L_Arm: { z: -58, y: 0 },
    L_ForeArm: { x: -24 },
    Spine: { x: 18 },
    Spine2: { x: 10 },
    Head: { x: 12 },
  },
};

// LA REINA. Levanta las dos manos por encima de la cabeza, como quien llama a la tormenta, y desde
// ahí arriba las abre hacia el rival: el conjuro sale de las dos a la vez. Sus brazos parten de
// colgar, así que para subirlos hay que girarlos más de 90°.
//
// Y con el torso DERECHO. La primera versión echaba el cuerpo atrás para invocar y lo tiraba
// adelante al lanzar, que es lo que se hace con un empujón físico; pero esto no es un empujón, y lo
// que se veía era a la reina sacando pecho. Una reina que conjura no embiste: se queda quieta y lo
// que se mueve son las manos.
export const QUEEN = {
  // Las dos manos arriba, por encima de la corona, los codos algo doblados hacia dentro y un poco
  // adelantadas: está reuniendo la tormenta.
  summon: {
    L_Arm: { z: 125, y: -15 },
    R_Arm: { z: -125, y: 15 },
    L_ForeArm: { z: 40 },
    R_ForeArm: { z: -40 },
    Spine: { x: 0 },
    Spine2: { x: 0 },
    Head: { x: -8 },
  },
  // Y desde arriba las lanza hacia él, a la altura de los hombros y algo abiertas, estirando los
  // codos. El cuerpo, en su sitio.
  cast: {
    L_Arm: { x: -80, z: 12 },
    R_Arm: { x: -80, z: -12 },
    L_ForeArm: { x: -5 },
    R_ForeArm: { x: -5 },
    Spine: { x: 0 },
    Spine2: { x: -3 },
    Head: { x: 4 },
  },
  // Cuando la magia le estalla en las manos (la sorprenden conjurando): los brazos, abiertos de golpe
  // hacia arriba y atrás.
  fling: {
    L_Arm: { z: 100, y: 30 },
    R_Arm: { z: -100, y: -30 },
    L_ForeArm: { z: 10 },
    R_ForeArm: { z: -10 },
    Spine: { x: 0 },
    Spine2: { x: 4 },
    Head: { x: -10 },
  },
};

// Los huesos que tocan estas posturas, para poder soltarlos todos al acabar.
export const CAST_BONES = [...new Set([
  ...Object.keys(KING.raise), ...Object.keys(KING.invoke), ...Object.keys(KING.smite),
  ...Object.keys(QUEEN.summon), ...Object.keys(QUEEN.cast), ...Object.keys(QUEEN.fling),
  ...Object.keys(armsDown()),
])];
