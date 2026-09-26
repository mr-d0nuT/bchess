// Las posturas de los conjuros: el bastonazo del rey y el hechizo de la reina.
//
// Ni reyes ni reinas traen una sola animación —se exportaron pelados, porque cualquier clip les
// destrozaba la capa—, así que sus ataques se los pone el juego hueso a hueso, igual que el andar.
// Aquí solo están las POSTURAS, en grados y en el espacio de la figura (+X a su izquierda, +Y
// arriba, +Z delante); el compás lo lleva quien las usa, mezclando de una a otra.
//
// Los brazos parten en cruz —es la pose que pide el aparejo automático— y en reposo se les bajan
// (`restArms`), así que aquí el cero es el brazo horizontal: girar en -Z sube el izquierdo y en +Z
// lo baja, y al derecho al revés.

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

// EL REY. Tres tiempos: levanta el báculo por encima de la cabeza y se echa atrás, aguanta ahí
// mientras la joya se carga, y lo descarga contra el suelo con todo el cuerpo detrás.
export const KING = {
  // Brazo derecho arriba y un poco atrás; el cuerpo, arqueado hacia atrás cogiendo impulso.
  raise: {
    R_Arm: { z: -128, y: 16 },
    R_ForeArm: { x: -22 },
    L_Arm: { z: -52, y: -18 },
    L_ForeArm: { x: -26 },
    Spine: { x: 8 },
    Spine2: { x: 6 },
    Head: { x: -10 },
  },
  // Y abajo: el báculo contra el tablero, el cuerpo volcado hacia delante.
  smite: {
    R_Arm: { z: 34, y: -30 },
    R_ForeArm: { x: -6 },
    L_Arm: { z: 62, y: 22 },
    L_ForeArm: { x: -14 },
    Spine: { x: -18 },
    Spine2: { x: -12 },
    Head: { x: 12 },
  },
};

// LA REINA. Levanta las dos manos por encima de la cabeza, como quien llama a la tormenta, y desde
// ahí arriba las abre hacia el rival: el conjuro sale de las dos a la vez.
//
// Y con el torso DERECHO. La primera versión echaba el cuerpo atrás para invocar y lo tiraba
// adelante al lanzar, que es lo que se hace con un empujón físico; pero esto no es un empujón, y lo
// que se veía era a la reina sacando pecho. Una reina que conjura no embiste: se queda quieta y lo
// que se mueve son las manos.
export const QUEEN = {
  // Las dos manos arriba, codos doblados: está reuniendo la tormenta.
  summon: {
    L_Arm: { z: -104, y: -12 },
    R_Arm: { z: 104, y: 12 },
    L_ForeArm: { x: -42 },
    R_ForeArm: { x: -42 },
    Spine: { x: 0 },
    Spine2: { x: 0 },
    Head: { x: -8 },
  },
  // Y desde arriba las abre hacia él, estirando los codos. El cuerpo, en su sitio.
  cast: {
    L_Arm: { z: -82, y: 44 },
    R_Arm: { z: 82, y: -44 },
    L_ForeArm: { x: -8 },
    R_ForeArm: { x: -8 },
    Spine: { x: 0 },
    Spine2: { x: -3 },
    Head: { x: 4 },
  },
};

// Los huesos que tocan estas posturas, para poder soltarlos todos al acabar.
export const CAST_BONES = [...new Set([
  ...Object.keys(KING.raise), ...Object.keys(KING.smite),
  ...Object.keys(QUEEN.summon), ...Object.keys(QUEEN.cast),
  ...Object.keys(armsDown()),
])];
