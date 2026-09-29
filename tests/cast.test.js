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

// Un brazo de la reina tal como lo trae su modelo, medido en el juego en el espacio de la figura (+X a
// su izquierda, +Y arriba, +Z delante): cuelga del hombro, un poco hacia fuera. Cada giro se aplica
// como en `turnBone`: en el espacio de la figura y en el orden de un Euler XYZ (primero Z, luego Y,
// luego X); el del antebrazo, encima del que ya le ha dado el brazo. Con esto las pruebas saben DÓNDE
// acaba cada mano, que es lo que se ve (con los números de antes, cada brazo giraba hacia dentro y
// la reina conjuraba con los brazos cruzados).
const HOMBRO = { L: [0.13, 1.44, 0.05], R: [-0.12, 1.44, 0.05] };
const BRAZO = { L: [0.07, -0.26, 0], R: [-0.07, -0.26, 0] };
const ANTEBRAZO = { L: [0.08, -0.206, 0.075], R: [-0.08, -0.206, 0.075] };
const CABEZA = 1.59;

function gira([x, y, z], turn = {}) {
  const rad = (g) => ((g ?? 0) * Math.PI) / 180;
  const [cz, sz] = [Math.cos(rad(turn.z)), Math.sin(rad(turn.z))];
  const [cy, sy] = [Math.cos(rad(turn.y)), Math.sin(rad(turn.y))];
  const [cx, sx] = [Math.cos(rad(turn.x)), Math.sin(rad(turn.x))];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  return [x, y, z];
}
const suma = (a, b) => a.map((v, i) => v + b[i]);

function manoDe(postura, lado) {
  const brazo = postura[`${lado}_Arm`];
  const codo = suma(HOMBRO[lado], gira(BRAZO[lado], brazo));
  return suma(codo, gira(gira(ANTEBRAZO[lado], brazo), postura[`${lado}_ForeArm`]));
}

test('el modelo del brazo coincide con lo medido en el juego', () => {
  const [x, y, z] = manoDe(QUEEN.summon, 'L');
  assert.ok(Math.abs(x - 0.25) < 0.02 && Math.abs(y - 1.86) < 0.02 && Math.abs(z - 0.2) < 0.02, `${x} ${y} ${z}`);
});

test('las posturas de la reina son simétricas', () => {
  for (const postura of Object.values(QUEEN)) {
    for (const hueso of ['Arm', 'ForeArm']) {
      const l = postura[`L_${hueso}`];
      const r = postura[`R_${hueso}`];
      assert.equal(l.x ?? 0, r.x ?? 0);
      assert.equal((l.y ?? 0) + (r.y ?? 0), 0);
      assert.equal((l.z ?? 0) + (r.z ?? 0), 0);
    }
  }
});

test('la reina nunca cruza los brazos: cada mano se queda en su lado', () => {
  for (const [nombre, postura] of Object.entries(QUEEN)) {
    assert.ok(manoDe(postura, 'L')[0] > 0.1, `${nombre}: la izquierda, a su izquierda`);
    assert.ok(manoDe(postura, 'R')[0] < -0.1, `${nombre}: la derecha, a su derecha`);
  }
});

test('la reina lanza el conjuro al frente, a la altura de los hombros y con los codos estirados', () => {
  const [, y, z] = manoDe(QUEEN.cast, 'L');
  assert.ok(z > 0.35, 'al frente');
  assert.ok(Math.abs(y - HOMBRO.L[1]) < 0.15, 'a la altura de los hombros');
  assert.ok(Math.abs(QUEEN.cast.L_ForeArm.x ?? 0) + Math.abs(QUEEN.cast.L_ForeArm.z ?? 0)
    < Math.abs(QUEEN.summon.L_ForeArm.z ?? 0), 'el codo se estira al lanzar');
});

test('si le estalla la magia en las manos, abre los brazos hacia arriba y atrás', () => {
  const [x, y, z] = manoDe(QUEEN.fling, 'L');
  assert.ok(x > 0.35 && y > HOMBRO.L[1] && z < 0);
});

test('los brazos de reposo cuelgan, cada uno a su lado', () => {
  const pose = armsDown(70);
  assert.equal(pose.L_Arm.z, -70);
  assert.equal(pose.R_Arm.z, 70);
});

test('la lista de huesos cubre todas las posturas, para poder soltarlos al acabar', () => {
  for (const pose of [KING.raise, KING.smite, QUEEN.summon, QUEEN.cast, QUEEN.fling, armsDown()]) {
    for (const bone of Object.keys(pose)) assert.ok(CAST_BONES.includes(bone), `falta ${bone}`);
  }
});

test('la reina conjura con las manos ARRIBA, no con el pecho por delante', () => {
  for (const lado of ['L', 'R']) assert.ok(manoDe(QUEEN.summon, lado)[1] > CABEZA + 0.15, 'las manos, por encima de la corona');
  for (const postura of [QUEEN.summon, QUEEN.cast]) {
    assert.ok(Math.abs(postura.Spine.x) <= 2, 'el torso no se echa atrás ni se tira adelante');
    assert.ok(Math.abs(postura.Spine2.x) <= 4);
  }
});
