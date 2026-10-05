import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernor, createPacer, qualitySteps } from '../src/scene/pacer.js';

// `seconds` de fotogramas de `ms` cada uno.
function feed(governor, seconds, ms) {
  for (let t = 0; t < seconds * 1000; t += ms) governor.frame(ms / 1000);
}

test('escalones de calidad: primero la resolución, luego las sombras, sin repetir', () => {
  const iphone = qualitySteps({ devicePixelRatio: 3, maxPixelRatio: 1.5, shadowMapSize: 1024 });
  assert.deepEqual(iphone.map((s) => [Number(s.pixelRatio.toFixed(2)), s.shadowMapSize]), [
    [1.5, 1024], [1.2, 1024], [1.2, 512], [1, 512], [0.8, 256],
  ]);
  const pantallaNormal = qualitySteps({ devicePixelRatio: 1, maxPixelRatio: 2, shadowMapSize: 2048 });
  assert.deepEqual(pantallaNormal.map((s) => [s.pixelRatio, s.shadowMapSize]), [[1, 2048], [1, 1024], [0.8, 512]]);
});

test('si va justo, baja un escalón; si va sobrado, tarda en volver a subir', () => {
  const steps = qualitySteps({ devicePixelRatio: 2, maxPixelRatio: 2, shadowMapSize: 2048 });
  const cambios = [];
  const g = createGovernor({ steps, onChange: (level) => cambios.push(level) });
  feed(g, 1.5, 1000 / 30); // 1,5 s a 30: aún no
  assert.equal(g.level, 0);
  feed(g, 1, 1000 / 30); // ya van más de 2 s
  assert.equal(g.level, 1);
  feed(g, 10, 1000 / 60); // va sobrado, pero acaba de bajar: no sube todavía
  assert.equal(g.level, 1);
  feed(g, 20, 1000 / 60);
  assert.equal(g.level, 0, 'pasado un rato a 60, vuelve a la mejor');
  assert.deepEqual(cambios, [1, 0]);
});

test('entre 45 y 56 no toca nada, y nunca baja del último escalón', () => {
  const steps = qualitySteps({ devicePixelRatio: 2, maxPixelRatio: 2, shadowMapSize: 2048 });
  const g = createGovernor({ steps });
  feed(g, 30, 1000 / 50);
  assert.equal(g.level, 0);
  feed(g, 120, 1000 / 10);
  assert.equal(g.level, steps.length - 1);
});

test('una pestaña oculta (un hueco de segundos) no cuenta como ir lento', () => {
  const steps = qualitySteps({ devicePixelRatio: 2, maxPixelRatio: 2, shadowMapSize: 2048 });
  const g = createGovernor({ steps });
  for (let i = 0; i < 10; i++) g.frame(3);
  assert.equal(g.level, 0);
});

test('a 60 como mucho, y en calma a 30', () => {
  const pintados = (hz, calm, seconds = 2) => {
    const pacer = createPacer({ apply: () => {}, steps: qualitySteps({}) });
    let n = 0;
    for (let t = 0; t < seconds * 1000; t += 1000 / hz) {
      if (pacer.skip(t, calm)) continue;
      pacer.rendered(t, calm);
      n += 1;
    }
    return n / seconds;
  };
  assert.ok(Math.abs(pintados(60, false) - 60) <= 1, 'pantalla de 60: todos');
  assert.ok(Math.abs(pintados(120, false) - 60) <= 1, 'pantalla de 120: uno de cada dos');
  assert.ok(Math.abs(pintados(60, true) - 30) <= 1, 'en calma: 30');
  assert.ok(Math.abs(pintados(120, true) - 30) <= 2, 'en calma, también en una de 120');
});
