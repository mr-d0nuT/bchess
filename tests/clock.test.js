import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/combat/clock.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('wait se cumple al pasar el tiempo de juego', async () => {
  const clock = createClock();
  let done = false;
  clock.wait(1).then(() => { done = true; });
  clock.tick(0.6);
  await flush();
  assert.equal(done, false);
  clock.tick(0.5);
  await flush();
  assert.equal(done, true);
});

test('con timeScale 0,5 el tiempo de juego va a la mitad', async () => {
  const clock = createClock();
  clock.timeScale = 0.5;
  let done = false;
  clock.wait(1).then(() => { done = true; });
  assert.equal(clock.tick(1.5), 0.75);
  await flush();
  assert.equal(done, false);
  clock.tick(0.6);
  await flush();
  assert.equal(done, true);
});

test('tween recorre de 0 a 1 y termina en 1', async () => {
  const clock = createClock();
  const seen = [];
  let done = false;
  clock.tween(1, (t) => seen.push(t)).then(() => { done = true; });
  clock.tick(0.25);
  clock.tick(0.5);
  clock.tick(0.5);
  await flush();
  assert.deepEqual(seen, [0.25, 0.75, 1]);
  assert.equal(done, true);
});

test('un tween sin duración da el paso final enseguida', async () => {
  const clock = createClock();
  const seen = [];
  await clock.tween(0, (t) => seen.push(t));
  assert.deepEqual(seen, [1]);
});

test('hold congela el tiempo de juego y luego recupera la escala', async () => {
  const clock = createClock();
  clock.timeScale = 0.3;
  let done = false;
  clock.hold(0.1).then(() => { done = true; });
  assert.equal(clock.timeScale, 0);
  assert.equal(clock.tick(0.05), 0);
  await flush();
  assert.equal(done, false);
  clock.tick(0.06);
  await flush();
  assert.equal(done, true);
  assert.equal(clock.timeScale, 0.3);
});
