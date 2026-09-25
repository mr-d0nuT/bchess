// El paso de la reina. El modelo no trae ninguna animación —se exportó aparejado y pelado, porque
// cualquier clip de andar le destrozaba la capa—, así que el paso se lo pone el juego hueso a hueso.
//
// Un ciclo son DOS pasos: la pierna de cada lado va media vuelta por detrás de la otra. Dentro de
// cada paso hay dos mitades bien distintas, y es la diferencia entre ellas lo que hace que se vea
// andar y no patinar:
//
//   · APOYO (la mitad del ciclo): el pie está clavado en el suelo y el cuerpo pasa por encima. La
//     pierna va de delante atrás a velocidad constante, que es justo lo que avanza la figura.
//   · VUELO (la otra mitad): el pie se despega, la rodilla se dobla para que no roce y la pierna
//     vuelve al frente, al doble de velocidad porque tiene la mitad de tiempo.
//
// La rodilla solo dobla hacia atrás (una rodilla no se dobla al revés) y dobla sobre todo en el
// vuelo. Los brazos van cruzados: el derecho adelante con la pierna izquierda.
//
// Puro: recibe la fase del ciclo (0 a 1) y devuelve grados, que es lo que come `turnBone`.
//
// Ojo con el signo: `legPose` habla en claro —positivo es la pierna DELANTE—, pero en el espacio de
// la figura el frente es +Z, así que adelantar una pierna es girarla en -X. La conversión se hace
// en un solo sitio, en `gaitPose`, y de ahí sale ya lo que se le pasa a `turnBone`.

const TWO_PI = Math.PI * 2;
const ADELANTE = -1; // pasar de «grados hacia delante» al giro del hueso (+Z es el frente)

// Pasos cortos. No es un capricho de estilo: la reina lleva una capa hasta el suelo, y una pierna
// que zanquea la atraviesa. Con la zancada corta la pierna se queda dentro de la tela, y de paso
// camina como camina alguien con cola —pasos menudos y muchos—, que es lo que toca.
const ZANCADA = 16; // grados que la cadera lleva el muslo hacia delante y hacia atrás
const RODILLA_VUELO = 34; // lo que se dobla la rodilla al recoger el pie
const RODILLA_APOYO = 7; // y lo poquito que cede mientras aguanta el peso
const TOBILLO = 14; // el pie apunta al despegar y se endereza para posarse
const ALZA = 0.035; // altura del pie en el aire, en unidades de tablero
const BRAZO = 11; // el braceo, cruzado con las piernas
const CODO = 10; // y el codo, que acompaña doblando un poco
const SUBE = 0.018; // lo que sube y baja el cuerpo: dos veces por ciclo, en cada apoyo

// Cuánto ha avanzado el paso, de 0 (el pie acaba de posarse) a 1 (vuelve a posarse). La primera
// mitad es apoyo y la segunda, vuelo.
function tramo(fase) {
  const f = ((fase % 1) + 1) % 1;
  return f < 0.5 ? { apoyo: true, t: f * 2 } : { apoyo: false, t: (f - 0.5) * 2 };
}

// Una curva suave de 0 a 1 que sale y entra sin tirón.
function suave(t) {
  return t * t * (3 - 2 * t);
}

// La pierna de un lado en este momento de SU ciclo.
export function legPose(fase) {
  const { apoyo, t } = tramo(fase);
  if (apoyo) {
    // El pie está en el suelo: el muslo va de delante atrás a ritmo constante, que es lo que hace
    // que el pie no resbale mientras el cuerpo pasa por encima.
    return {
      hip: ZANCADA * (1 - 2 * t),
      knee: -RODILLA_APOYO * Math.sin(Math.PI * t),
      ankle: TOBILLO * (2 * t - 1),
      lift: 0,
    };
  }
  // En el aire: vuelve al frente al doble de velocidad, doblando la rodilla para no arrastrar.
  const s = suave(t);
  return {
    hip: -ZANCADA + 2 * ZANCADA * s,
    knee: -RODILLA_VUELO * Math.sin(Math.PI * t),
    ankle: TOBILLO * (1 - 2 * suave(Math.max(0, t - 0.4) / 0.6)),
    lift: ALZA * Math.sin(Math.PI * t),
  };
}

// La postura entera. `phase` es el ciclo completo; la pierna derecha va media vuelta por detrás.
export function gaitPose(phase, amount = 1) {
  const fase = ((phase ?? 0) % 1 + 1) % 1;
  const izq = legPose(fase);
  const der = legPose(fase + 0.5);
  const k = amount;
  const g = ADELANTE * k;
  return {
    leftThigh: { x: izq.hip * g },
    leftShin: { x: izq.knee * g },
    leftFoot: { x: izq.ankle * g },
    rightThigh: { x: der.hip * g },
    rightShin: { x: der.knee * g },
    rightFoot: { x: der.ankle * g },
    // Los brazos, cruzados: el derecho acompaña a la pierna izquierda.
    leftArm: { x: -izq.hip * (BRAZO / ZANCADA) * g },
    rightArm: { x: -der.hip * (BRAZO / ZANCADA) * g },
    leftForearm: { x: -CODO * k },
    rightForearm: { x: -CODO * k },
    // El cuerpo sube en cada apoyo: dos veces por ciclo.
    rise: SUBE * (1 - Math.cos(2 * TWO_PI * fase)) * 0.5 * k,
  };
}

// Los huesos que mueve, con el nombre corto del juego (`findBone` los traduce al del modelo).
export const GAIT_BONES = {
  leftThigh: 'L_UpLeg',
  leftShin: 'L_Leg',
  leftFoot: 'L_Foot',
  rightThigh: 'R_UpLeg',
  rightShin: 'R_Leg',
  rightFoot: 'R_Foot',
  leftArm: 'L_Arm',
  rightArm: 'R_Arm',
  leftForearm: 'L_ForeArm',
  rightForearm: 'R_ForeArm',
};

// Cuántas veces por segundo repite el ciclo para andar a `speed` sin resbalar: la zancada ha de
// comerse exactamente el terreno que recorre. `legLength` es de la cadera al suelo.
export function gaitRate(speed, legLength, stride = 2 * Math.sin((ZANCADA * Math.PI) / 180)) {
  if (!(legLength > 0)) throw new Error('la pierna ha de medir algo');
  const paso = legLength * stride; // lo que avanza en un paso
  return paso > 0 ? Math.abs(speed) / (2 * paso) : 0; // dos pasos por ciclo
}
