// El paso de la reina. Su modelo no trae ninguna animación —se exportó aparejado y pelado, porque
// cualquier clip de andar le destrozaba la capa—, así que el paso se lo pone el juego.
//
// Y se lo pone AL REVÉS de como se hace a mano. Lo intuitivo es girar la cadera y la rodilla unos
// grados y ver qué sale, pero eso hace que el pie describa un arco: en el apoyo se hunde en el
// suelo por el medio y patina por los extremos, y por muy finos que se afinen los grados eso no se
// arregla, porque es geometría. Andar es lo contrario: primero se decide DÓNDE VA EL PIE —clavado
// en el suelo mientras aguanta, en arco por el aire mientras vuelve— y después se busca qué ángulos
// de cadera y rodilla lo llevan ahí. Eso es cinemática inversa, y con dos huesos se resuelve con el
// teorema del coseno, sin iterar.
//
// De ahí sale gratis lo que más se nota: la cadera SUBE Y BAJA sola. Con las piernas abiertas el
// pie queda más lejos, y para alcanzarlo sin estirar la pierna del todo hay que bajar; a media
// zancada, con la pierna debajo, se sube. Dos veces por ciclo, sin tener que inventárselo.
//
// El paso va sesgado hacia delante (`DELANTE`): la reina lleva una capa hasta el suelo que le cae
// por detrás, y una pierna que se va hacia atrás la atraviesa. Por delante la capa se abre.
//
// Puro: todo en radios de pierna y grados, sin tocar nada de three.

const GRADO = 180 / Math.PI;

const PASO = 0.40; // lo que abarca un paso, en largos de pierna
const DELANTE = 0.75; // qué parte del paso cae por delante del cuerpo (detrás está la tela)
const ALZA = 0.055; // lo que sube el pie al volar, en largos de pierna
const ESTIRA = 0.97; // lo más que se estira la pierna: una rodilla no se bloquea al andar
const TALON = 9; // grados que el pie apunta hacia arriba al posar el talón
const PUNTA = 18; // y hacia abajo al despegar la punta
const BRAZO = 0.5; // el braceo, cruzado con las piernas: la mitad de lo que gira el muslo
const CODO = 10; // y el codo, que acompaña doblando un poco

// Dónde está el pie en este momento de SU ciclo, visto desde el cuerpo: `z` hacia delante y `y`
// sobre el suelo, los dos en largos de pierna. La primera mitad es apoyo y la segunda, vuelo.
export function footPath(phase, paso = PASO, alza = ALZA) {
  const f = ((phase % 1) + 1) % 1;
  const delante = paso * DELANTE;
  const detras = paso * (1 - DELANTE);
  if (f < 0.5) {
    // Apoyo: el pie está clavado en el suelo y es el cuerpo el que pasa por encima. Va hacia atrás
    // a ritmo constante, exactamente lo que avanza la figura: por eso no resbala.
    const t = f * 2;
    return { z: delante - (delante + detras) * t, y: 0, apoyo: true };
  }
  // Vuelo: vuelve al frente al doble de velocidad, levantando el pie para no arrastrarlo.
  const t = (f - 0.5) * 2;
  const s = t * t * (3 - 2 * t);
  return { z: -detras + (delante + detras) * s, y: alza * Math.sin(Math.PI * t), apoyo: false };
}

// Los ángulos de cadera y rodilla que llevan el pie a `{z, drop}` (drop: cuánto cae el pie por
// debajo de la cadera), con un muslo y una espinilla de esos largos. Teorema del coseno: el triángulo
// cadera-rodilla-pie tiene los tres lados conocidos, así que sus ángulos salen solos.
//
// `hip` en grados hacia delante; `knee` en grados de flexión, siempre negativo (una rodilla no se
// dobla al revés).
export function solveLeg(z, drop, thigh, shin) {
  const alcance = (thigh + shin) * 0.9999;
  let d = Math.hypot(z, drop);
  if (d > alcance) d = alcance; // el pie fuera de alcance: se estira todo lo que da y ya
  if (d < 1e-6) return { hip: 0, knee: 0 };
  // Hacia dónde apunta la pierna entera, medido desde la vertical.
  const direccion = Math.atan2(z, drop);
  // Y cuánto se aparta el muslo de esa dirección para que la rodilla llegue.
  const cosApertura = (thigh * thigh + d * d - shin * shin) / (2 * thigh * d);
  const apertura = Math.acos(Math.max(-1, Math.min(1, cosApertura)));
  const cosRodilla = (thigh * thigh + shin * shin - d * d) / (2 * thigh * shin);
  const rodilla = Math.acos(Math.max(-1, Math.min(1, cosRodilla)));
  return { hip: (direccion + apertura) * GRADO, knee: -(Math.PI - rodilla) * GRADO };
}

// A qué altura va la cadera en este momento: la justa para llegar al pie MÁS LEJANO sin estirar la
// pierna del todo. De aquí sale el sube y baja del cuerpo, que no hay que inventarse.
//
// Al pie más lejano, y no al que aguanta, y eso importa: en el instante en que el peso pasa de un
// pie al otro, el que aguantaba está detrás y el que entra, delante. Mirando solo al que aguanta,
// la altura pega un brinco justo en ese cambio —dos veces por ciclo— y la reina daba saltitos.
// Mirando al más lejano de los dos, en el cambio los dos están a la misma distancia y la altura
// pasa de uno a otro sin enterarse.
export function hipHeight(phase, paso = PASO, estira = ESTIRA) {
  const izq = footPath(phase, paso);
  const der = footPath(phase + 0.5, paso);
  const lejos = Math.max(Math.abs(izq.z), Math.abs(der.z));
  return Math.sqrt(Math.max(0, estira * estira - lejos * lejos));
}

// El pie va plano en el suelo mientras aguanta (así que el tobillo tiene que deshacer lo que hayan
// girado el muslo y la espinilla), con el talón entrando primero y la punta saliendo la última.
function anklePitch(f, hip, knee) {
  const llano = -(hip + knee);
  if (f < 0.5) {
    const t = f * 2;
    return llano + TALON * (1 - t) - PUNTA * t * t; // entra de talón, sale de punta
  }
  const t = (f - 0.5) * 2;
  return llano - PUNTA * (1 - t) * (1 - t) + TALON * t * t;
}

// `shift` es lo que la pelvis le ha hecho a esta articulación al contonearse: cuánto ha subido y
// cuánto se ha adelantado. Se le descuenta al objetivo, y así el pie se queda donde estaba aunque
// la cadera se mueva. Sin esto, contonearse y tener el pie clavado son incompatibles.
function pierna(phase, paso, cadera, thigh, shin, shift) {
  const f = ((phase % 1) + 1) % 1;
  const pie = footPath(f, paso);
  const z = pie.z - (shift?.forward ?? 0);
  const drop = cadera + (shift?.rise ?? 0) - pie.y;
  const { hip, knee } = solveLeg(z, drop, thigh, shin);
  return { hip, knee, ankle: anklePitch(f, hip, knee) };
}

const ADELANTE = -1; // pasar de «grados hacia delante» al giro del hueso (+Z es el frente)

// La postura entera. `phase` es el ciclo completo (dos pasos); la pierna derecha va media vuelta por
// detrás. `thigh` y `shin` son los largos de los dos huesos, en largos de pierna (suman ~1).
export function gaitPose(phase, { amount = 1, thigh = 0.5, shin = 0.5, step = PASO, shift } = {}) {
  const f = ((phase % 1) + 1) % 1;
  const cadera = hipHeight(f, step);
  const izq = pierna(f, step, cadera, thigh, shin, shift?.left);
  const der = pierna(f + 0.5, step, cadera, thigh, shin, shift?.right);
  const g = ADELANTE * amount;
  return {
    leftThigh: { x: izq.hip * g },
    leftShin: { x: izq.knee * g },
    leftFoot: { x: izq.ankle * g },
    rightThigh: { x: der.hip * g },
    rightShin: { x: der.knee * g },
    rightFoot: { x: der.ankle * g },
    // Los brazos, cruzados: el derecho acompaña a la pierna izquierda. Van con el MUSLO y no con
    // el pie, que en el vuelo van cada uno por su lado (el muslo ya adelanta mientras el pie sigue
    // detrás, con la rodilla doblada) y el brazo tiene que acompañar al muslo.
    leftArm: { x: -izq.hip * BRAZO * g },
    rightArm: { x: -der.hip * BRAZO * g },
    leftForearm: { x: -CODO * amount },
    rightForearm: { x: -CODO * amount },
    // Lo que sube o baja el cuerpo respecto a estar de pie, en largos de pierna.
    rise: (cadera - 1) * amount,
  };
}

// Dónde acaba el pie con esos ángulos. Es la vuelta de `solveLeg`, y está aquí porque es la única
// manera honrada de comprobar que la cinemática inversa hace lo que dice: se le pide un sitio, se
// resuelve, y se mira si el pie ha ido donde se le pidió.
export function footAt(hip, knee, thigh, shin) {
  const a = hip / GRADO;
  const b = (hip + knee) / GRADO;
  return {
    z: thigh * Math.sin(a) + shin * Math.sin(b),
    drop: thigh * Math.cos(a) + shin * Math.cos(b),
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

// Cuántas veces por segundo repite el ciclo para andar a `speed` sin resbalar: el paso ha de comerse
// exactamente el terreno que recorre. `legLength` es de la cadera al suelo.
export function gaitRate(speed, legLength, step = PASO) {
  if (!(legLength > 0)) throw new Error('la pierna ha de medir algo');
  const paso = legLength * step;
  return paso > 0 ? Math.abs(speed) / (2 * paso) : 0; // dos pasos por ciclo
}

export { PASO as STEP, DELANTE as FORWARD_SHARE };
