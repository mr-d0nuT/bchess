import test from 'node:test';
import assert from 'node:assert/strict';
import { CAST_BONES, KING, QUEEN, armsDown, blend } from '../src/pieces/cast.js';

test('mezclar al principio da la primera postura y al final la segunda', () => {
  const a = { R_Arm: { z: -100 } };
  const b = { R_Arm: { z: 40 } };
  assert.equal(blend(a, b, 0).R_Arm.z, -100);
  assert.equal(blend(a, b, 1).R_Arm.z, 40);
  assert.equal(blend(a, b, 0.5).R_Arm.z, -30);
});

test('un hueso que solo está en una postura se mezcla contra su reposo, sin tirones', () => {
  const pose = blend({ Head: { x: 20 } }, {}, 0.5);
  assert.equal(pose.Head.x, 10);
  assert.equal(blend({}, { Head: { x: 20 } }, 0.5).Head.x, 10);
});

test('la mezcla no se sale de los extremos aunque se le pida', () => {
  const a = { R_Arm: { z: 0 } };
  const b = { R_Arm: { z: 10 } };
  assert.equal(blend(a, b, -3).R_Arm.z, 0);
  assert.equal(blend(a, b, 7).R_Arm.z, 10);
});

test('el rey levanta el báculo por encima de la cabeza y lo baja al suelo', () => {
  assert.ok(KING.raise.R_Arm.z < -90, 'arriba: más allá de la vertical');
  assert.ok(KING.smite.R_Arm.z > 0, 'y abajo, por debajo del hombro');
  assert.ok(KING.raise.Spine.x > 0 && KING.smite.Spine.x < 0, 'el cuerpo se arquea y se vuelca');
});

test('la reina abre los dos brazos y los lanza al frente a la vez', () => {
  assert.ok(Math.abs(QUEEN.summon.L_Arm.y + QUEEN.summon.R_Arm.y) < 1e-9, 'simétrica al invocar');
  assert.ok(Math.abs(QUEEN.cast.L_Arm.y + QUEEN.cast.R_Arm.y) < 1e-9, 'y al lanzar');
  assert.ok(Math.abs(QUEEN.cast.L_Arm.y) > Math.abs(QUEEN.summon.L_Arm.y), 'los brazos van al frente');
  assert.ok(QUEEN.summon.L_ForeArm.x < QUEEN.cast.L_ForeArm.x, 'el codo se estira al lanzar');
});

test('los brazos de reposo cuelgan, cada uno a su lado', () => {
  const pose = armsDown(70);
  assert.equal(pose.L_Arm.z, -70);
  assert.equal(pose.R_Arm.z, 70);
});

test('la lista de huesos cubre todas las posturas, para poder soltarlos al acabar', () => {
  for (const pose of [KING.raise, KING.smite, QUEEN.summon, QUEEN.cast, armsDown()]) {
    for (const bone of Object.keys(pose)) assert.ok(CAST_BONES.includes(bone), `falta ${bone}`);
  }
});

test('la reina conjura con las manos ARRIBA, no con el pecho por delante', () => {
  assert.ok(QUEEN.summon.L_Arm.z < -90, 'las manos, por encima de la cabeza');
  assert.ok(QUEEN.cast.L_Arm.z < -60, 'y siguen arriba al lanzar');
  for (const postura of [QUEEN.summon, QUEEN.cast]) {
    assert.ok(Math.abs(postura.Spine.x) <= 2, 'el torso no se echa atrás ni se tira adelante');
    assert.ok(Math.abs(postura.Spine2.x) <= 4);
  }
});
