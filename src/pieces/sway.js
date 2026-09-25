// El contoneo de la reina. Lo que se contonea es la CADERA; de cintura para arriba no se mueve casi
// nada.
//
// Y contonearse no es GIRAR la pelvis: es LLEVARLA sobre el pie que aguanta, que es donde tiene que
// caer el peso. Girándola sola, la cadera se queda donde estaba y lo que acaba yendo de un lado a
// otro es el torso, que cuelga de ella: un pato mareado.
//
// Pero moverla a ella sola tampoco vale, porque de la pelvis cuelgan las piernas y el pie que
// estaba clavado en el suelo se va con ella. Lo que se hace es MECER LA FIGURA ENTERA con el eje en
// el suelo, entre los pies. Desde ese eje, la cadera (a un largo de pierna de altura) se desplaza
// de verdad, y los tobillos —que están a un dedo del suelo— casi no se enteran. Un mismo giro
// mueve mucho lo que está alto y nada lo que está bajo: por eso el eje va donde va.
//
// Luego la cintura deshace ese mecimiento para que el torso siga vertical.
//
// Y una cosa que hay que saber del esqueleto: lo que se le impone a un hueso se aplica ENCIMA de lo
// que haga su padre. O sea que basculando la pelvis, la pierna entera bascula con ella —el pie se
// va medio palmo de lado— y no hay manera de que se quede clavada en el suelo sin resolver la
// pierna en tres dimensiones. Así que andando, la pelvis no bascula: gira (eso apenas mueve los
// pies) y el vaivén lo pone el mecimiento de abajo, que sí lo hace bien. Basculando solo se
// bascula al deslizarse con los pies juntos, que entonces no hay pie clavado que respetar. Así anda quien anda marcando: la pelvis bascula y gira con cada zancada, y la columna va
// deshaciendo ese giro tramo a tramo, de modo que los hombros y la cabeza siguen quietos y mirando
// al frente. Si el torso acompaña a la cadera en vez de contrarrestarla, sale un pato mareado.
//
// Por eso el contragiro suma exactamente lo que ha hecho la pelvis: la cintura deshace un poco más
// de la mitad y el pecho, el resto. De Spine2 para arriba —cuello, cabeza, corona— no queda nada
// que deshacer.
//
// El mecimiento del cuerpo entero (`body`) es otra cosa: es para cuando NO da pasos y se desliza,
// con los pies juntos, pasando el peso de uno a otro. Andando estorba, y quien la mueve se encarga
// de apagarlo.
//
// Puro: recibe la fase del ciclo (de 0 a 1, un ciclo son dos pasos) y devuelve grados, que es lo
// que come `turnBone`. `amount` es cuánto se le sube el volumen: 0 nada, 1 lo normal.

const TWO_PI = Math.PI * 2;

const HIP_ROLL = 9; // grados que se levanta una cadera sobre la otra
const HIP_TURN = 8; // y lo que gira la pelvis con la zancada
const CINTURA = 0.55; // qué parte del giro de la pelvis deshace la cintura
const PECHO = 1 - CINTURA; // y el pecho, el resto: entre las dos, todo
const CABEZA = 0.12; // un pelín de vida en la cabeza, que tampoco es un maniquí
// Cuánto se va la cadera sobre el pie que aguanta, en largos de pierna. Poco: al mecerse desde el
// suelo se mueve el cuerpo ENTERO, así que lo que se le pone a la cadera se lo lleva también el
// torso. Un cuerpo de verdad desplaza la cadera unos cuatro dedos al andar, no un palmo; pasarse
// aquí es lo que convierte el contoneo en un bamboleo de cubierta de barco.
const LADO = 0.035;
const ROCK = 3.5; // grados que se mece el cuerpo entero, con los pies juntos, cuando no anda
export const LAG = 0.12; // lo que el mecimiento va por detrás de la cadera (solo al deslizarse)

// La postura del contoneo en este momento del ciclo. Los ejes son los de la figura: x mira al lado,
// y hacia arriba y z hacia delante, así que girar sobre z es bascular y sobre y, girar.
export function swayPose(phase, amount = 1, andando = false) {
  const vaiven = Math.sin(TWO_PI * (phase ?? 0));
  const tarde = Math.sin(TWO_PI * ((phase ?? 0) - LAG));
  const k = amount;
  const roll = andando ? 0 : vaiven * HIP_ROLL * k;
  const turn = vaiven * HIP_TURN * k;
  return {
    // Solo cuando se desliza sin dar pasos: el peso pasa de un pie al otro.
    body: { z: -tarde * ROCK * k },
    hips: { y: turn, z: roll },
    // Y la columna lo deshace, para que arriba no se note.
    waist: { y: -turn * CINTURA, z: -roll * CINTURA },
    chest: { y: -turn * PECHO, z: -roll * PECHO },
    head: { z: roll * CABEZA },
    shoulders: { z: 0 },
    // Y lo que de verdad contonea: la cadera se va al lado del pie que aguanta. En largos de
    // pierna, que es como habla `gait.js`. Quien la aplique tiene dos cosas que hacer con esto:
    // llevar ahí la pelvis y devolver el torso al centro doblando la cintura.
    side: vaiven * LADO * k,
  };
}

// Los huesos que mueve, con el nombre corto del juego (`findBone` los traduce si el modelo los llama
// a la manera de Mixamo). En orden de abajo arriba.
export const SWAY_BONES = {
  body: 'Root', // la raíz, con el eje en el suelo: mecerla mece la figura entera, pies incluidos
  hips: 'Hips',
  waist: 'Spine',
  chest: 'Spine2',
  head: 'Head',
  shoulders: 'Neck',
};

// Lo que la pelvis le hace a la articulación de la cadera, para que quien resuelva las piernas lo
// tenga en cuenta: girar la pelvis mueve el sitio del que cuelga cada pierna, y si nadie lo
// descuenta, el pie que estaba clavado en el suelo se va con ella.
//
// `halfWidth`: media distancia entre las dos caderas, en las mismas unidades que se quiera la
// respuesta. Devuelve, para cada lado, cuánto sube la articulación y cuánto se adelanta.
export function hipShift(pose, halfWidth) {
  const roll = ((pose.hips?.z ?? 0) * Math.PI) / 180;
  const turn = ((pose.hips?.y ?? 0) * Math.PI) / 180;
  const sube = halfWidth * Math.sin(roll);
  const adelanta = halfWidth * Math.sin(turn);
  const lado = pose.side ?? 0;
  return {
    left: { rise: sube, forward: -adelanta, side: lado },
    right: { rise: -sube, forward: adelanta, side: lado },
  };
}

// Cuánto hay que mecer la figura, con el eje en el suelo, para que la cadera se vaya lo que dice el
// contoneo. `hipHeight`: a qué altura está la cadera, en largos de pierna (uno, más o menos).
// En grados.
export function rockAngle(pose, hipHeight = 1) {
  const lado = pose.side ?? 0;
  if (!(hipHeight > 0)) return 0;
  return (Math.asin(Math.max(-1, Math.min(1, lado / hipHeight))) * 180) / Math.PI;
}

// Y cuánto tiene que deshacer la cintura del mecimiento que se le ha aplicado al cuerpo para que el
// torso siga vertical: todo, al revés. De la cintura para arriba el cuerpo no se entera de que por
// debajo se está meciendo.
export function uprightBend(applied) {
  return -applied;
}
