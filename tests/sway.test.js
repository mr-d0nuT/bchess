import test from 'node:test';
import assert from 'node:assert/strict';
import { LAG, SWAY_BONES, swayPose } from '../src/pieces/sway.js';

test('al empezar el ciclo la cadera está recta; el torso aún viene de atrás', () => {
  const pose = swayPose(0);
  assert.ok(Math.abs(pose.hips.z) < 1e-9);
  assert.ok(Math.abs(pose.hips.y) < 1e-9);
  assert.ok(Math.abs(pose.waist.z) < 1e-9);
  assert.ok(Math.abs(pose.chest.z) > 1e-6, 'el pecho llega con retardo, no a la vez que la cadera');
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

test('el torso llega tarde: la cadera hace su tope en 0,25 y el pecho, en 0,25 + el retardo', () => {
  assert.ok(swayPose(0.25).hips.z > swayPose(0.25 + LAG).hips.z, 'la cadera ya va de vuelta');
  const aTiempo = Math.abs(swayPose(0.25).chest.z);
  const conRetardo = Math.abs(swayPose(0.25 + LAG).chest.z);
  assert.ok(conRetardo > aTiempo, 'el pecho alcanza su tope un poco después');
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
  assert.ok(Math.abs(swayPose(1).chest.z - swayPose(0).chest.z) < 1e-9);
});

test('mueve el cuerpo entero, la cadera, la cintura, el pecho, el cuello y la cabeza', () => {
  assert.deepEqual(Object.keys(SWAY_BONES).sort(), Object.keys(swayPose(0.1)).sort());
});

test('el cuerpo se mece al lado contrario que la cadera: el peso pasa de un pie al otro', () => {
  const pose = swayPose(0.25);
  assert.ok(pose.hips.z > 0 && pose.body.z < 0);
  assert.ok(Math.abs(swayPose(0.75).body.z + pose.body.z) < 1e-9, 'y al otro lado en el medio ciclo');
});
