// El contoneo de la reina. El clip de andar que trae el modelo es el de andar de cualquiera, así que
// la pasarela se le pone encima: la cadera bascula y gira al compás de los pasos, el pecho hace el
// contragiro (para que los hombros sigan mirando al frente) y la cabeza se endereza. Es lo mismo que
// hace un cuerpo de verdad al andar marcando, solo que exagerado.
//
// Y como no da pasos —se desliza—, el cuerpo entero se mece de lado a lado con los pies juntos, que
// es lo que pidió el usuario: el peso pasa de un pie al otro sin levantarlos.
//
// El torso va con RETARDO respecto a la cadera (`LAG`): primero se mueve la cadera y el pecho llega
// un poco después, que es lo que hace un cuerpo de verdad —y, de paso, lo que hace que la capa, que
// cuelga de la espalda, se balancee como tela en vez de ir clavada al cuerpo.
//
// Puro: recibe la fase del ciclo (de 0 a 1, un ciclo son dos pasos) y devuelve grados, que es lo que
// come `turnBone`. `amount` es cuánto se le sube el volumen: 0 nada, 1 lo normal.

const TWO_PI = Math.PI * 2;

const HIP_ROLL = 8; // grados que se levanta una cadera sobre la otra
const HIP_TURN = 10; // y lo que gira la pelvis con la zancada
const LEAN = 3.5; // lo que se echa el cuerpo sobre la pierna que aguanta
const CHEST_TURN = 7; // el contragiro de los hombros
const CHEST_ROLL = 4; // y su contrabalanceo
const HEAD_ROLL = 3; // la cabeza se queda derecha aunque debajo todo se mueva
const SHOULDER = 2.5; // el hombro acompaña un pelín
const ROCK = 3.5; // grados que se mece el cuerpo entero de lado a lado, con los pies juntos
export const LAG = 0.12; // parte del ciclo que el torso (y la capa) va por detrás de la cadera

// La postura del contoneo en este momento del ciclo. Los ejes son los de la figura: x mira al lado,
// y hacia arriba y z hacia delante, así que girar sobre z es bascular y sobre y, girar.
export function swayPose(phase, amount = 1) {
  const vaiven = Math.sin(TWO_PI * (phase ?? 0));
  const tarde = Math.sin(TWO_PI * ((phase ?? 0) - LAG)); // lo que el torso aún no ha alcanzado
  const k = amount;
  return {
    // El cuerpo entero se mece de un pie al otro (la reina no da pasos: se desliza meciéndose).
    body: { z: -vaiven * ROCK * k },
    hips: { y: vaiven * HIP_TURN * k, z: vaiven * HIP_ROLL * k },
    waist: { z: -vaiven * LEAN * k },
    chest: { y: -tarde * CHEST_TURN * k, z: -tarde * CHEST_ROLL * k },
    head: { z: tarde * HEAD_ROLL * k },
    shoulders: { z: -tarde * SHOULDER * k },
  };
}

// Los huesos que mueve, con el nombre corto del juego (`findBone` los traduce si el modelo los llama
// a la manera de Mixamo). En orden de abajo arriba.
export const SWAY_BONES = {
  body: 'Hip', // el hueso de arriba del todo: mover este mueve la figura entera, pies incluidos
  hips: 'Hips',
  waist: 'Spine',
  chest: 'Spine2',
  head: 'Head',
  shoulders: 'Neck',
};
