import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWalk, pointAlong, shortestTurn, strideSpeed, REST_FACING } from '../src/moves/walk.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} no es ≈ ${b}`);

test('siempre miran hacia delante (a las negras): girar PI', () => {
  close(REST_FACING, Math.PI);
  close(planWalk({ x: 0.5, z: 2.5 }, { x: 0.5, z: 0.5 }, 1).heading, Math.PI);
});

test('andar hacia +X mira a PI/2', () => {
  close(planWalk({ x: 0, z: 0 }, { x: 2, z: 0 }, 1).heading, Math.PI / 2);
});

test('planWalk calcula distancia y duración', () => {
  const plan = planWalk({ x: 0.5, z: 2.5 }, { x: 3.5, z: -1.5 }, 2);
  close(plan.distance, 5);
  close(plan.duration, 2.5);
});

test('planWalk rechaza una velocidad no positiva', () => {
  assert.throws(() => planWalk({ x: 0, z: 0 }, { x: 1, z: 0 }, 0), /velocidad/);
});

test('pointAlong interpola y no se pasa del destino', () => {
  assert.deepEqual(pointAlong({ x: 0, z: 0 }, { x: 2, z: 4 }, 0.5), { x: 1, z: 2 });
  assert.deepEqual(pointAlong({ x: 0, z: 0 }, { x: 2, z: 4 }, 1.5), { x: 2, z: 4 });
});

test('shortestTurn gira por el lado corto', () => {
  close(shortestTurn(0.1, 2 * Math.PI - 0.1), -0.2);
  close(shortestTurn(-3, 3), 6 - 2 * Math.PI);
  close(shortestTurn(0, Math.PI / 2), Math.PI / 2);
});

test('strideSpeed usa el avance del clip y, si anda en el sitio, la altura', () => {
  close(strideSpeed({ rootDistance: 1.2, clipDuration: 1, height: 1.35 }), 1.2);
  close(strideSpeed({ rootDistance: 0, clipDuration: 1, height: 1.35 }), 0.945);
});
