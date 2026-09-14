// Reloj del juego. Avanza con el bucle de animación multiplicado por `timeScale`: con él van
// las esperas y transiciones, las animaciones y los efectos, de modo que la cámara lenta y el
// congelado de impacto del combate lo frenan todo a la vez.

export function createClock() {
  let now = 0;
  const timers = [];
  const tweens = [];
  const holds = [];

  const clock = {
    timeScale: 1,

    get now() {
      return now;
    },

    // Avanza `dt` segundos reales y devuelve los segundos de juego que han pasado.
    tick(dt) {
      for (const hold of [...holds]) {
        hold.left -= dt;
        if (hold.left <= 0) {
          holds.splice(holds.indexOf(hold), 1);
          hold.done();
        }
      }
      const step = dt * clock.timeScale;
      now += step;
      for (const tween of [...tweens]) {
        const t = Math.min(1, (now - tween.start) / tween.seconds);
        tween.step(t);
        if (t >= 1) {
          tweens.splice(tweens.indexOf(tween), 1);
          tween.resolve();
        }
      }
      for (const timer of [...timers]) {
        if (now >= timer.at) {
          timers.splice(timers.indexOf(timer), 1);
          timer.resolve();
        }
      }
      return step;
    },

    // Espera `seconds` de tiempo de juego.
    wait(seconds) {
      return new Promise((resolve) => timers.push({ at: now + seconds, resolve }));
    },

    // Llama a `step(t)` con t de 0 a 1 durante `seconds` de tiempo de juego.
    tween(seconds, step) {
      if (!(seconds > 0)) {
        step(1);
        return Promise.resolve();
      }
      return new Promise((resolve) => tweens.push({ start: now, seconds, step, resolve }));
    },

    // Congela el tiempo de juego `seconds` reales y después recupera la escala que había.
    hold(seconds) {
      const previous = clock.timeScale;
      clock.timeScale = 0;
      return new Promise((resolve) => holds.push({
        left: seconds,
        done: () => {
          clock.timeScale = previous;
          resolve();
        },
      }));
    },
  };
  return clock;
}
