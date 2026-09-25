import test from 'node:test';
import assert from 'node:assert/strict';
import { FORWARD_SHARE, GAIT_BONES, STEP, footAt, footPath, gaitPose, gaitRate, hipHeight, restArms, solveLeg } from '../src/pieces/gait.js';

const MUSLO = 0.52;
const ESPINILLA = 0.48;

test('la cinemática inversa lleva el pie exactamente donde se le pide', () => {
  for (const z of [-0.2, -0.05, 0, 0.1, 0.25]) {
    for (const drop of [0.75, 0.85, 0.93]) {
      const { hip, knee } = solveLeg(z, drop, MUSLO, ESPINILLA);
      const donde = footAt(hip, knee, MUSLO, ESPINILLA);
      assert.ok(Math.abs(donde.z - z) < 1e-6, `z pedido ${z}, conseguido ${donde.z}`);
      assert.ok(Math.abs(donde.drop - drop) < 1e-6, `caída pedida ${drop}, conseguida ${donde.drop}`);
    }
  }
});

test('la rodilla nunca se dobla al revés', () => {
  for (let f = 0; f < 1; f += 0.01) {
    const pose = gaitPose(f, { thigh: MUSLO, shin: ESPINILLA });
    assert.ok(pose.leftShin.x >= -1e-9, `en la fase ${f.toFixed(2)} la rodilla se dobla al revés`);
    assert.ok(pose.rightShin.x >= -1e-9);
  }
});

test('un pie fuera de alcance estira la pierna en vez de romperse', () => {
  const { hip, knee } = solveLeg(0.9, 0.9, MUSLO, ESPINILLA);
  assert.ok(Number.isFinite(hip) && Number.isFinite(knee));
  assert.ok(Math.abs(knee) < 3, 'con la pierna estirada, la rodilla casi recta');
});

test('mientras aguanta, el pie está en el suelo y va hacia atrás a ritmo constante', () => {
  const a = footPath(0.05);
  const b = footPath(0.2);
  const c = footPath(0.35);
  assert.equal(a.y, 0);
  assert.equal(b.y, 0);
  assert.ok(a.apoyo && b.apoyo && c.apoyo);
  assert.ok(Math.abs((a.z - b.z) - (b.z - c.z)) < 1e-9, 'sin acelerones: por eso no resbala');
});

test('el paso va sobre todo hacia delante, que detrás está la capa', () => {
  const alFrente = footPath(0).z;
  const atras = footPath(0.5 - 1e-9).z;
  assert.ok(alFrente > 0 && atras < 0);
  assert.ok(alFrente > 2 * Math.abs(atras), 'tres cuartas partes del paso, por delante');
  assert.ok(Math.abs(alFrente - STEP * FORWARD_SHARE) < 1e-9);
});

test('en el vuelo el pie se despega del suelo y vuelve al frente', () => {
  assert.ok(footPath(0.75).y > 0);
  assert.ok(!footPath(0.75).apoyo);
  assert.ok(footPath(0.9).z > footPath(0.6).z);
  assert.ok(Math.abs(footPath(0.999).y) < 0.01, 'y llega al suelo para posarse');
});

test('la cadera sube y baja sola: arriba con la pierna debajo, abajo con las piernas abiertas', () => {
  const abiertas = hipHeight(0);
  const debajo = hipHeight(0.25);
  assert.ok(debajo > abiertas, 'a media zancada el cuerpo está más alto');
  assert.ok(Math.abs(hipHeight(0.25) - hipHeight(0.75)) < 1e-9, 'dos veces por ciclo, una por pierna');
});

test('la altura de la cadera no pega brincos al cambiar de pie: si los pega, son saltitos', () => {
  let mayor = 0;
  let previa = hipHeight(0);
  for (let f = 0.001; f <= 1.0001; f += 0.001) {
    const ahora = hipHeight(f);
    mayor = Math.max(mayor, Math.abs(ahora - previa));
    previa = ahora;
  }
  // En una milésima de ciclo no puede moverse más de lo que se mueve en cualquier otra.
  assert.ok(mayor < 0.001, `pega un brinco de ${mayor.toFixed(5)} largos de pierna`);
});

test('el cuerpo nunca sube por encima de estar de pie', () => {
  for (let f = 0; f < 1; f += 0.01) {
    assert.ok(gaitPose(f, { thigh: MUSLO, shin: ESPINILLA }).rise <= 0);
  }
});

test('la pierna derecha va media vuelta por detrás de la izquierda', () => {
  const pose = gaitPose(0.2, { thigh: MUSLO, shin: ESPINILLA });
  const media = gaitPose(0.7, { thigh: MUSLO, shin: ESPINILLA });
  assert.ok(Math.abs(pose.rightThigh.x - media.leftThigh.x) < 1e-9);
});

test('el pie va plano en el suelo mientras aguanta, salvo al entrar y al salir', () => {
  const pose = gaitPose(0.25, { thigh: MUSLO, shin: ESPINILLA });
  // A media zancada, lo que giran muslo y espinilla lo deshace el tobillo: la planta, horizontal.
  const acumulado = pose.leftThigh.x + pose.leftShin.x + pose.leftFoot.x;
  assert.ok(Math.abs(acumulado) < 10, `la planta se queda casi horizontal (${acumulado.toFixed(1)}°)`);
});

test('el ciclo cierra: la fase 1 es la misma postura que la 0', () => {
  const a = gaitPose(0, { thigh: MUSLO, shin: ESPINILLA });
  const b = gaitPose(1, { thigh: MUSLO, shin: ESPINILLA });
  assert.ok(Math.abs(a.leftThigh.x - b.leftThigh.x) < 1e-9);
  assert.ok(Math.abs(a.rise - b.rise) < 1e-9);
});

test('los brazos van cruzados con las piernas', () => {
  const pose = gaitPose(0.1, { thigh: MUSLO, shin: ESPINILLA });
  assert.ok(Math.sign(pose.leftArm.x) === -Math.sign(pose.leftThigh.x));
  assert.ok(Math.sign(pose.rightArm.x) === -Math.sign(pose.rightThigh.x));
});

test('`amount` sube y baja el volumen del paso sin cambiar su forma', () => {
  const entero = gaitPose(0.3, { thigh: MUSLO, shin: ESPINILLA, amount: 1 });
  const medio = gaitPose(0.3, { thigh: MUSLO, shin: ESPINILLA, amount: 0.5 });
  assert.ok(Math.abs(entero.leftThigh.x / 2 - medio.leftThigh.x) < 1e-9);
  assert.ok(gaitPose(0.3, { amount: 0 }).leftThigh.x === 0);
});

test('el ritmo sale de la velocidad: al doble de prisa, el doble de pasos', () => {
  assert.ok(Math.abs(gaitRate(2, 1) - 2 * gaitRate(1, 1)) < 1e-9);
  assert.equal(gaitRate(0, 1), 0);
});

test('con las piernas más largas se dan menos pasos para el mismo camino', () => {
  assert.ok(gaitRate(1, 1.4) < gaitRate(1, 0.7));
});

test('una pierna sin medida no tiene ritmo que valga', () => {
  assert.throws(() => gaitRate(1, 0), /medir/);
});

test('mueve las dos piernas y los dos brazos, y sube y baja el cuerpo', () => {
  const partes = Object.keys(gaitPose(0.1)).filter((k) => k !== 'rise');
  assert.deepEqual(partes.sort(), Object.keys(GAIT_BONES).sort());
});


test('las piernas van un poco abiertas, que si no los pies se rozan', () => {
  const pose = gaitPose(0.25, { thigh: MUSLO, shin: ESPINILLA });
  assert.ok(pose.leftThigh.z < 0 && pose.rightThigh.z > 0, 'cada una hacia su lado');
  assert.ok(Math.abs(pose.leftThigh.z + pose.rightThigh.z) < 1e-9, 'lo mismo las dos');
  // Y el tobillo lo deshace, para que la planta no quede de canto.
  assert.ok(Math.abs(pose.leftFoot.z + pose.leftThigh.z) < 1e-9);
});

test('la abertura es fija: no cambia con el paso, así que no mueve el pie clavado', () => {
  const a = gaitPose(0.1, { thigh: MUSLO, shin: ESPINILLA }).leftThigh.z;
  const b = gaitPose(0.4, { thigh: MUSLO, shin: ESPINILLA }).leftThigh.z;
  assert.equal(a, b);
});

test('una figura con los brazos en cruz los baja al costado', () => {
  const brazos = restArms(90);
  assert.ok(brazos.leftArm.z < 0 && brazos.rightArm.z > 0, 'cada uno hacia su lado');
  assert.ok(Math.abs(brazos.leftArm.z + brazos.rightArm.z) < 1e-9, 'lo mismo los dos');
  assert.ok(restArms(0).leftArm.z === 0, 'sin nada que bajar, no se bajan');
});

test('el braceo se suma a lo bajados que estén, no lo sustituye', () => {
  const quietos = gaitPose(0.25, { thigh: MUSLO, shin: ESPINILLA, armDrop: 0 });
  const bajados = gaitPose(0.25, { thigh: MUSLO, shin: ESPINILLA, armDrop: 70 });
  assert.equal(bajados.leftArm.x, quietos.leftArm.x, 'el braceo, igual');
  assert.equal(bajados.leftArm.z, -70, 'y además colgando');
});
