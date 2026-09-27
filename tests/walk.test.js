import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_EDGE, nearestEdgeExit, pickGait, planWalk, pointAlong, shortestTurn, strideSpeed, REST_FACING, restFacingFor } from '../src/moves/walk.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} no es ≈ ${b}`);

test('siempre miran hacia delante (a las negras): girar PI', () => {
  close(REST_FACING, Math.PI);
  close(planWalk({ x: 0.5, z: 2.5 }, { x: 0.5, z: 0.5 }, 1).heading, Math.PI);
});

test('cada color mira a su oponente: blancas hacia -Z (PI), negras hacia +Z (0)', () => {
  close(restFacingFor('white'), Math.PI);
  close(restFacingFor('black'), 0);
  assert.throws(() => restFacingFor('green'), /Color no válido/);
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

test('nearestEdgeExit sale en línea recta por el borde más cercano del marco', () => {
  assert.deepEqual(nearestEdgeExit({ x: 3.2, z: -1 }), { x: BOARD_EDGE, z: -1 });
  assert.deepEqual(nearestEdgeExit({ x: -0.5, z: -3.9 }), { x: -0.5, z: -BOARD_EDGE });
  assert.deepEqual(nearestEdgeExit({ x: 1, z: 2.5 }), { x: 1, z: BOARD_EDGE });
  assert.deepEqual(nearestEdgeExit({ x: -2, z: 2 }), { x: -BOARD_EDGE, z: 2 });
});

// `pickGait` escoge al paso, al trote o al galope según lo rápido que tenga que ir el caballo.
const HORSE = { walk: 0.9, trot: 1.6, gallop: 2.5 };

test('pickGait va al paso despacio, al trote a media marcha y al galope deprisa', () => {
  assert.equal(pickGait(HORSE, 0.9).gait, 'walk');
  assert.equal(pickGait(HORSE, 1.5).gait, 'trot');
  assert.equal(pickGait(HORSE, 3).gait, 'gallop');
});

test('pickGait acompasa la animación a la velocidad, para que no patine', () => {
  assert.equal(pickGait(HORSE, 1.6).timeScale, 1);
  assert.equal(pickGait(HORSE, 3.75).timeScale, 1.5);
  assert.equal(pickGait(HORSE, 0.45).timeScale, 0.5);
});

test('pickGait anda hacia atrás al paso, con la animación al revés', () => {
  assert.deepEqual(pickGait(HORSE, -0.9), { gait: 'walk', timeScale: -1 });
});

test('pickGait sin aires anda al paso tal cual', () => {
  assert.deepEqual(pickGait(null, 2), { gait: 'walk', timeScale: 1 });
  assert.deepEqual(pickGait({}, -2), { gait: 'walk', timeScale: -1 });
});
