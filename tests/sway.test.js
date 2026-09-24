import test from 'node:test';
import assert from 'node:assert/strict';
import { SWAY_BONES, swayPose } from '../src/pieces/sway.js';

test('al empezar el ciclo el cuerpo está recto', () => {
  const pose = swayPose(0);
  for (const parte of Object.values(pose)) {
    for (const grados of Object.values(parte)) assert.ok(Math.abs(grados) < 1e-9, `${grados} debería ser 0`);
  }
});

test('a mitad de cada paso la cadera bascula al máximo, a un lado y al otro', () => {
  const cuarto = swayPose(0.25).hips;
  const tresCuartos = swayPose(0.75).hips;
  assert.ok(cuarto.z > 0);
  assert.ok(Math.abs(cuarto.z + tresCuartos.z) < 1e-9); // el mismo balanceo, al revés
  assert.ok(Math.abs(cuarto.y + tresCuartos.y) < 1e-9);
});

test('el pecho hace el contragiro de la cadera, para que los hombros miren al frente', () => {
  const pose = swayPose(0.25);
  assert.ok(pose.hips.y > 0 && pose.chest.y < 0);
  assert.ok(pose.hips.z > 0 && pose.chest.z < 0);
});

test('la cabeza se endereza contra el contrabalanceo del pecho', () => {
  const pose = swayPose(0.25);
  assert.ok(pose.head.z > 0 && pose.chest.z < 0);
});

test('`amount` sube y baja el volumen sin cambiar la forma', () => {
  const entero = swayPose(0.3, 1);
  const medio = swayPose(0.3, 0.5);
  assert.ok(Math.abs(entero.hips.z / 2 - medio.hips.z) < 1e-9);
  const nada = swayPose(0.3, 0);
  assert.equal(nada.hips.z, 0);
});

test('el ciclo se repite: la fase 1 es la misma postura que la 0', () => {
  assert.ok(Math.abs(swayPose(1).hips.z - swayPose(0).hips.z) < 1e-9);
});

test('mueve la cadera, la cintura, el pecho, el cuello y la cabeza', () => {
  assert.deepEqual(Object.keys(SWAY_BONES).sort(), Object.keys(swayPose(0.1)).sort());
});
