import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rockStep } from '../src/fx/rock.js';

const rock = (position, velocity) => ({ position, velocity, radius: 0.05, bounces: 0, resting: false });

test('cae, rebota una vez en el tablero y se queda quieta', () => {
  const r = rock({ x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 0 });
  let highestAfterBounce = 0;
  for (let frame = 0; frame < 240; frame++) {
    rockStep(r, 1 / 60);
    if (r.bounces === 1) highestAfterBounce = Math.max(highestAfterBounce, r.position.y);
  }
  assert.equal(r.bounces, 1);
  assert.equal(r.resting, true);
  assert.equal(r.position.y, 0.05);
  assert.ok(highestAfterBounce < 0.5, `rebote de ${highestAfterBounce}`);
});

test('rebota en una pieza en vez de atravesarla', () => {
  const r = rock({ x: 0, y: 0.5, z: 0 }, { x: 3, y: 0, z: 0 });
  const piece = { x: 1, z: 0, radius: 0.4, height: 1.6 };
  for (let frame = 0; frame < 60; frame++) {
    rockStep(r, 1 / 60, [piece]);
    assert.ok(Math.hypot(r.position.x - piece.x, r.position.z - piece.z) >= piece.radius + r.radius - 1e-9);
  }
  assert.ok(r.velocity.x <= 0);
});

test('pasa por encima de las piezas más bajas que ella', () => {
  const r = rock({ x: 0, y: 1.2, z: 0 }, { x: 3, y: 0, z: 0 });
  rockStep(r, 0.2, [{ x: 0.6, z: 0, radius: 0.4, height: 0.5 }]);
  assert.ok(r.position.x > 0.55);
});
