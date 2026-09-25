// El vuelo de la capa. Una capa no va pegada al cuerpo: se queda atrás cuando arrancas, te alcanza
// y se pasa de frenada cuando paras, y al girar sale despedida hacia fuera. Todo eso es un péndulo
// —cuelga de los hombros y la mueve la inercia—, así que aquí hay un péndulo y poco más.
//
// El modelo tiene tres huesos de capa en cadena (`Capa1`, `Capa2`, `Capa3`, puestos con
// `tools/capa.py`). El péndulo da UN ángulo y la cadena lo reparte: cada hueso gira un poco, y al
// sumarse los tres la capa se curva en vez de bascular como una tabla.
//
// Puro: el estado entra y sale, no se guarda nada aquí. El movimiento se pasa en el espacio de la
// figura (`forward` es lo que avanza de frente, `side` lo que se desplaza de lado, `turn` lo que
// gira), que es como lo siente ella.

const TWO_PI = Math.PI * 2;

const RIGIDEZ = 42; // cuánto tira la gravedad de volver a la vertical: más, capa más tiesa
const ROCE = 9; // cuánto se le va la fuerza: más, menos rebote
const ARRASTRE = 14; // grados que se queda atrás por cada unidad de velocidad
const VOLANDA = 22; // y los que sale hacia fuera por cada vuelta por segundo
const TOPE = 38; // hasta dónde se le permite levantarse, que no es una bandera
const REPARTO = [0.45, 0.33, 0.22]; // qué parte del ángulo pone cada hueso, de arriba abajo
// Y el vaivén de los pasos. Una capa sobre alguien que anda no se queda quieta: se va a un lado y al
// otro al compás de las caderas, una vez por ciclo, y da un tirón corto arriba y abajo en cada
// apoyo, dos veces por ciclo. Sin esto la tela parece cartón, y además es lo que abre hueco para que
// la pierna pase por dentro en vez de atravesarla.
const PASO_LADO = 7; // grados que se va de lado con cada zancada
const PASO_FONDO = 2.5; // y el tironcillo de delante atrás, en cada pisada

export const CAPE_BONES = ['Capa1', 'Capa2', 'Capa3'];

export function capeRest() {
  return { pitch: 0, roll: 0, pitchRate: 0, rollRate: 0 };
}

function muelle(angulo, velocidad, objetivo, dt) {
  // Un paso de péndulo amortiguado hacia `objetivo`. Con dt grandes se parte en trozos, que si no
  // el muelle se dispara (un fotograma perdido no puede mandar la capa a la luna).
  let a = angulo;
  let v = velocidad;
  const trozos = Math.max(1, Math.ceil(dt / 0.02));
  const h = dt / trozos;
  for (let i = 0; i < trozos; i++) {
    v += (RIGIDEZ * (objetivo - a) - ROCE * v) * h;
    a += v * h;
    if (a > TOPE || a < -TOPE) {
      // Topa contra su propio límite: se queda ahí y pierde el impulso, como la tela al tensarse.
      a = a > 0 ? TOPE : -TOPE;
      if (a * v > 0) v = 0;
    }
  }
  return [a, v];
}

// Un paso de la simulación. `forward` y `side`, en unidades de tablero por segundo; `turn`, en
// vueltas por segundo; `step`, en qué punto del ciclo de andar va (de 0 a 1), o null si no anda.
// Devuelve el estado nuevo, que se le vuelve a pasar en el fotograma siguiente.
export function capeStep(state, { forward = 0, side = 0, turn = 0, step = null, dt = 0 } = {}) {
  if (!(dt > 0)) return state;
  // Andar hacia delante deja la capa atrás; el giro la abre hacia fuera, al lado contrario.
  const anda = step !== null && step !== undefined;
  const vaiven = anda ? Math.sin(TWO_PI * step) : 0;
  const pisada = anda ? Math.sin(2 * TWO_PI * step) : 0;
  const objetivoPitch = -forward * ARRASTRE + pisada * PASO_FONDO;
  const objetivoRoll = -side * ARRASTRE - turn * VOLANDA + vaiven * PASO_LADO;
  const [pitch, pitchRate] = muelle(state.pitch, state.pitchRate, objetivoPitch, dt);
  const [roll, rollRate] = muelle(state.roll, state.rollRate, objetivoRoll, dt);
  return { pitch, roll, pitchRate, rollRate };
}

// Cómo queda cada hueso de la cadena: el mismo vaivén repartido, para que la tela se curve.
export function capePose(state, amount = 1) {
  return REPARTO.map((parte) => ({
    x: state.pitch * parte * amount,
    z: state.roll * parte * amount,
  }));
}
