import test from 'node:test';
import assert from 'node:assert/strict';
import { GAIT_BONES, gaitPose, gaitRate, legPose } from '../src/pieces/gait.js';

test('en el apoyo el muslo va de delante atrás a ritmo constante: el pie no resbala', () => {
  const a = legPose(0).hip;
  const b = legPose(0.25).hip;
  const c = legPose(0.5 - 1e-9).hip;
  assert.ok(a > 0, 'el paso empieza con la pierna delante');
  assert.ok(c < 0, 'y acaba con ella detrás');
  assert.ok(Math.abs((a - b) - (b - c)) < 1e-6, 'a ritmo constante, sin acelerones');
});

test('en el vuelo la pierna vuelve al frente y el pie se despega del suelo', () => {
  assert.equal(legPose(0.25).lift, 0, 'mientras apoya, el pie está en el suelo');
  assert.ok(legPose(0.75).lift > 0, 'y en el vuelo, en el aire');
  assert.ok(legPose(0.75).hip > legPose(0.55).hip, 'la pierna adelanta');
});

test('la rodilla solo dobla hacia atrás, y sobre todo al recoger el pie', () => {
  for (const f of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
    assert.ok(legPose(f).knee <= 1e-9, `en la fase ${f} la rodilla no se dobla al revés`);
  }
  assert.ok(Math.abs(legPose(0.75).knee) > Math.abs(legPose(0.25).knee) * 3, 'dobla mucho más en el aire');
});

test('el ciclo cierra: la fase 1 es la misma pierna que la 0', () => {
  const a = legPose(0);
  const b = legPose(1);
  assert.ok(Math.abs(a.hip - b.hip) < 1e-9);
  assert.ok(Math.abs(a.knee - b.knee) < 1e-9);
});

test('una pierna va media vuelta por detrás de la otra', () => {
  const pose = gaitPose(0.2);
  // El signo cambia al pasar al espacio de la figura: adelantar la pierna es girar en -X.
  assert.ok(Math.abs(pose.leftThigh.x + legPose(0.2).hip) < 1e-9);
  assert.ok(Math.abs(pose.rightThigh.x + legPose(0.7).hip) < 1e-9);
});

test('adelantar una pierna la gira en -X, que es hacia donde mira la figura', () => {
  assert.ok(legPose(0).hip > 0 && gaitPose(0).leftThigh.x < 0);
});

test('los brazos van cruzados con las piernas', () => {
  const pose = gaitPose(0.1);
  assert.ok(pose.leftThigh.x < 0 && pose.leftArm.x > 0, 'pierna izquierda delante, brazo izquierdo detrás');
  assert.ok(Math.sign(pose.rightArm.x) === -Math.sign(pose.rightThigh.x));
});

test('el cuerpo sube dos veces por ciclo, una por cada apoyo', () => {
  assert.ok(Math.abs(gaitPose(0).rise) < 1e-9);
  assert.ok(gaitPose(0.25).rise > 0);
  assert.ok(Math.abs(gaitPose(0.5).rise) < 1e-9);
  assert.ok(Math.abs(gaitPose(0.25).rise - gaitPose(0.75).rise) < 1e-9);
});

test('`amount` sube y baja el volumen del paso sin cambiar su forma', () => {
  assert.ok(Math.abs(gaitPose(0.3, 1).leftThigh.x / 2 - gaitPose(0.3, 0.5).leftThigh.x) < 1e-9);
  assert.ok(gaitPose(0.3, 0).leftThigh.x === 0, 'a volumen cero, la pierna quieta');
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

test('mueve las dos piernas y los dos brazos, y levanta el cuerpo', () => {
  const partes = Object.keys(gaitPose(0.1)).filter((k) => k !== 'rise');
  assert.deepEqual(partes.sort(), Object.keys(GAIT_BONES).sort());
});

test('la pierna va mucho más hacia delante que hacia atrás: detrás está la capa', () => {
  let masAdelante = -Infinity;
  let masAtras = Infinity;
  for (let f = 0; f < 1; f += 0.005) {
    masAdelante = Math.max(masAdelante, legPose(f).hip);
    masAtras = Math.min(masAtras, legPose(f).hip);
  }
  assert.ok(masAdelante > 0 && masAtras < 0, 'algo va hacia cada lado');
  assert.ok(masAdelante > 3 * Math.abs(masAtras), 'pero hacia atrás, apenas');
});
