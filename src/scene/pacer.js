// EL RITMO DE LOS FOTOGRAMAS: ahorro de batería y calidad automática (puntos 17 y 18 del plan de mejora).
//
// - AHORRO DE BATERÍA. Cuando no pasa nada (en el menú, o esperando a que alguien mueva sin tocar la
//   pantalla), a 30 fotogramas por segundo: las piezas respiran igual de bien y el móvil no se calienta. En
//   cuanto algo se mueve o se toca, a toda velocidad otra vez. Y «toda velocidad» es 60 como mucho: las
//   pantallas de 120 Hz (los iPhone Pro, los Mac nuevos) pintaban el doble para nada.
// - CALIDAD AUTOMÁTICA. Si el aparato va justo (menos de 45 fotogramas por segundo un par de segundos
//   seguidos), baja un escalón: primero la resolución, luego el detalle de las sombras. Si va sobrado
//   (56 o más durante 8 s), sube uno, sin pasar nunca de lo que se eligió al empezar. Tras bajar, tarda en
//   volver a subir: si no, en los combates (que piden más) subía y bajaba sin parar.

export const MAX_FPS = 60;
export const CALM_FPS = 30;
export const SLOW_FPS = 45;
export const FAST_FPS = 56;
const WINDOW = 0.5; // segundos de cada medida de fotogramas por segundo
const BAD_WINDOWS = 4; // 2 s seguidos por debajo: se baja
const GOOD_WINDOWS = 16; // 8 s seguidos por encima: se sube
const COOLDOWN = 3; // tras cualquier cambio, que se asiente antes de juzgar otra vez
const AFTER_DROP = 25; // tras bajar, no se sube hasta pasado esto

// Los escalones de calidad, de mejor a peor, para un aparato con `devicePixelRatio` y la calidad de partida
// (`maxPixelRatio`, `shadowMapSize`). Sin repetir escalones iguales.
export function qualitySteps({ devicePixelRatio = 1, maxPixelRatio = 2, shadowMapSize = 2048 }) {
  const base = Math.min(devicePixelRatio, maxPixelRatio);
  const steps = [
    { pixelRatio: base, shadowMapSize },
    { pixelRatio: Math.max(1, base * 0.8), shadowMapSize },
    { pixelRatio: Math.max(1, base * 0.8), shadowMapSize: shadowMapSize / 2 },
    { pixelRatio: Math.max(1, base * 0.65), shadowMapSize: shadowMapSize / 2 },
    { pixelRatio: Math.min(base, 0.8), shadowMapSize: shadowMapSize / 4 }, // el último recurso
  ];
  return steps.filter((step, i) => i === 0
    || step.pixelRatio !== steps[i - 1].pixelRatio || step.shadowMapSize !== steps[i - 1].shadowMapSize);
}

// El regulador, puro: se le da la duración de cada fotograma pintado a toda velocidad (`frame(segundos)`)
// y dice en qué escalón (`level`, 0 el mejor) hay que estar. `onChange(level)`, al cambiar.
export function createGovernor({ steps, onChange = null }) {
  let level = 0;
  let time = 0; // segundos medidos, en total
  let windowTime = 0;
  let windowFrames = 0;
  let bad = 0;
  let good = 0;
  let quietUntil = 0; // sin juzgar hasta aquí
  let upAfter = 0; // sin subir hasta aquí

  function change(to) {
    level = to;
    bad = 0;
    good = 0;
    quietUntil = time + COOLDOWN;
    onChange?.(level, steps[level]);
  }

  return {
    get level() {
      return level;
    },
    get step() {
      return steps[level];
    },
    frame(seconds) {
      if (!(seconds > 0) || seconds > 0.25) return level; // pestaña oculta o un tirón suelto: no cuenta
      time += seconds;
      windowTime += seconds;
      windowFrames += 1;
      if (windowTime < WINDOW) return level;
      const fps = windowFrames / windowTime;
      windowTime = 0;
      windowFrames = 0;
      if (time < quietUntil) return level;
      if (fps < SLOW_FPS) {
        bad += 1;
        good = 0;
      } else if (fps >= FAST_FPS) {
        good += 1;
        bad = 0;
      } else {
        bad = 0;
        good = 0;
      }
      if (bad >= BAD_WINDOWS && level < steps.length - 1) {
        change(level + 1);
        upAfter = time + AFTER_DROP;
      } else if (good >= GOOD_WINDOWS && level > 0 && time >= upAfter) {
        change(level - 1);
      }
      return level;
    },
  };
}

// El ritmo, en el bucle de animación: `skip(now, calm)` dice si este fotograma se salta (a 60 como mucho; en
// calma, a 30), y `rendered(now, calm)` cuenta el que se pinta. `apply(step)`: poner un escalón de calidad.
export function createPacer({ apply, steps }) {
  let last = -Infinity; // el último fotograma pintado
  let lastCalm = true;
  const governor = createGovernor({ steps, onChange: (_, step) => apply(step) });
  return {
    governor,
    skip(now, calm) {
      const fps = calm ? CALM_FPS : MAX_FPS;
      // Con margen: los avisos del navegador no llegan clavados, y con el límite exacto se saltaría uno de
      // cada pocos a 60 en una pantalla de 60.
      return now - last < 1000 / fps - (calm ? 4 : 2.5);
    },
    rendered(now, calm) {
      // Solo cuentan para la calidad los fotogramas a toda velocidad seguidos (no el primero tras la calma,
      // que viene de un hueco largo a propósito).
      if (!calm && !lastCalm) governor.frame((now - last) / 1000);
      last = now;
      lastCalm = calm;
    },
  };
}
