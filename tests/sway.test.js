import test from 'node:test';
import assert from 'node:assert/strict';
import { LAG, SWAY_BONES, hipShift, rockAngle, swayPose, uprightBend } from '../src/pieces/sway.js';

test('al empezar el ciclo la pelvis está recta', () => {
  const pose = swayPose(0);
  assert.ok(Math.abs(pose.hips.z) < 1e-9);
  assert.ok(Math.abs(pose.hips.y) < 1e-9);
  assert.ok(Math.abs(pose.waist.z) < 1e-9);
  assert.ok(Math.abs(pose.chest.z) < 1e-9);
});

test('a mitad de cada paso la pelvis bascula al máximo, a un lado y al otro', () => {
  const cuarto = swayPose(0.25).hips;
  const tresCuartos = swayPose(0.75).hips;
  assert.ok(cuarto.z > 0);
  assert.ok(Math.abs(cuarto.z + tresCuartos.z) < 1e-9); // el mismo balanceo, al revés
  assert.ok(Math.abs(cuarto.y + tresCuartos.y) < 1e-9);
});

test('lo que hace la pelvis lo deshace la columna, ENTERO: arriba no queda nada', () => {
  for (const f of [0.1, 0.25, 0.4, 0.6, 0.9]) {
    const pose = swayPose(f);
    const queda = pose.hips.z + pose.waist.z + pose.chest.z;
    const gira = pose.hips.y + pose.waist.y + pose.chest.y;
    assert.ok(Math.abs(queda) < 1e-9, `en la fase ${f} el pecho aún bascula ${queda}`);
    assert.ok(Math.abs(gira) < 1e-9, `en la fase ${f} el pecho aún gira ${gira}`);
  }
});

test('la cintura deshace algo más de la mitad y el pecho, el resto', () => {
  const pose = swayPose(0.25);
  assert.ok(pose.hips.z > 0 && pose.waist.z < 0 && pose.chest.z < 0);
  assert.ok(Math.abs(pose.waist.z) > Math.abs(pose.chest.z));
});

test('los hombros no se mueven: es la cadera la que anda, no el torso', () => {
  assert.equal(swayPose(0.25).shoulders.z, 0);
  assert.ok(Math.abs(swayPose(0.25).head.z) < Math.abs(swayPose(0.25).hips.z) / 4);
});

test('`amount` sube y baja el volumen sin cambiar la forma', () => {
  const entero = swayPose(0.3, 1);
  const medio = swayPose(0.3, 0.5);
  assert.ok(Math.abs(entero.hips.z / 2 - medio.hips.z) < 1e-9);
  assert.equal(swayPose(0.3, 0).hips.z, 0);
});

test('el ciclo se repite: la fase 1 es la misma postura que la 0', () => {
  assert.ok(Math.abs(swayPose(1).hips.z - swayPose(0).hips.z) < 1e-9);
  assert.ok(Math.abs(swayPose(1).chest.z - swayPose(0).chest.z) < 1e-9);
});

test('mueve el cuerpo entero, la cadera, la cintura, el pecho, el cuello y la cabeza', () => {
  const partes = Object.keys(swayPose(0.1)).filter((k) => k !== 'side');
  assert.deepEqual(Object.keys(SWAY_BONES).sort(), partes.sort());
});

test('la cadera se va sobre el pie que aguanta, a un lado y al otro', () => {
  assert.ok(swayPose(0.25).side > 0);
  assert.ok(Math.abs(swayPose(0.25).side + swayPose(0.75).side) < 1e-9);
  assert.ok(Math.abs(swayPose(0).side) < 1e-9, 'al cambiar de pie pasa por el centro');
});

test('el mecimiento lleva la cadera justo a donde dice el contoneo', () => {
  const pose = swayPose(0.25);
  const mece = rockAngle(pose, 1);
  assert.ok(mece > 0);
  // A un largo de pierna de altura, ese giro desplaza exactamente lo pedido.
  assert.ok(Math.abs(Math.sin((mece * Math.PI) / 180) - pose.side) < 1e-9);
});

test('con la cadera más alta hace falta mecerse menos para lo mismo', () => {
  const pose = swayPose(0.25);
  assert.ok(rockAngle(pose, 1.4) < rockAngle(pose, 0.9));
});

test('la cintura deshace el mecimiento entero: de ahí para arriba, vertical', () => {
  assert.equal(uprightBend(7.5), -7.5);
  assert.equal(uprightBend(0), -0);
});

test('sin altura que valga no hay mecimiento', () => {
  assert.equal(rockAngle(swayPose(0.25), 0), 0);
});

test('el mecimiento del cuerpo entero va por detrás de la cadera: es para deslizarse', () => {
  assert.ok(Math.abs(swayPose(0).body.z) > 1e-6, 'a fase 0 la cadera está recta pero el cuerpo no');
  assert.ok(Math.abs(swayPose(LAG).body.z) < 1e-9, 'alcanza a la cadera con el retardo');
});

test('bascular la pelvis sube una articulación de la cadera y baja la otra', () => {
  const shift = hipShift(swayPose(0.25), 0.1);
  assert.ok(shift.left.rise > 0 && shift.right.rise < 0);
  assert.ok(Math.abs(shift.left.rise + shift.right.rise) < 1e-9);
});

test('girar la pelvis adelanta una cadera y atrasa la otra', () => {
  const shift = hipShift(swayPose(0.25), 0.1);
  assert.ok(Math.abs(shift.left.forward + shift.right.forward) < 1e-9);
  assert.ok(Math.abs(shift.left.forward) > 0);
});

test('con la pelvis recta no hay nada que descontar', () => {
  const shift = hipShift(swayPose(0), 0.1);
  assert.ok(Math.abs(shift.left.rise) < 1e-9 && Math.abs(shift.left.forward) < 1e-9);
});

test('el desplazamiento crece con lo ancha que sea la cadera', () => {
  assert.ok(hipShift(swayPose(0.25), 0.2).left.rise > hipShift(swayPose(0.25), 0.1).left.rise);
});

test('andando, la pelvis no bascula: basculándola se van los pies con ella', () => {
  const andando = swayPose(0.25, 1, true);
  assert.equal(andando.hips.z, 0);
  assert.ok(Math.abs(andando.hips.y) > 0, 'pero sí gira, que eso apenas los mueve');
  // Y si no bascula, tampoco hay nada que deshacer arriba.
  assert.equal(andando.waist.z, -0);
  assert.equal(andando.chest.z, -0);
});

test('deslizándose sí bascula, que entonces no hay pie clavado que respetar', () => {
  assert.ok(Math.abs(swayPose(0.25, 1, false).hips.z) > 0);
});
