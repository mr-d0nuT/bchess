import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeUpView, turnAround } from '../src/scene/framing.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} no es ≈ ${b}`);

test('media vuelta alrededor del centro del tablero lleva la cámara al lado de las negras', () => {
  const p = turnAround({ x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0 }, Math.PI);
  close(p.x, -1);
  close(p.y, 2);
  close(p.z, -3);
});

test('la media vuelta se hace alrededor del pivote, y dos seguidas dejan todo como estaba', () => {
  const p = turnAround({ x: 2, y: 5, z: 1 }, { x: 1, y: 0, z: 1 }, Math.PI);
  close(p.x, 0);
  close(p.z, 1);
  const q = turnAround(turnAround({ x: 0.3, y: 1, z: -2 }, { x: 0.5, y: 0, z: 0.5 }, Math.PI), { x: 0.5, y: 0, z: 0.5 }, Math.PI);
  close(q.x, 0.3);
  close(q.z, -2);
});

test('girar un cuarto de vuelta va en el sentido de rotation.y (+Z pasa a +X)', () => {
  const p = turnAround({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 }, Math.PI / 2);
  close(p.x, 1);
  close(p.z, 0);
});

test('el primer plano mira al medio de la pieza, desde el lado de la cámara y un poco desde arriba', () => {
  const { target, position } = closeUpView({ at: { x: 1.5, z: -0.5 }, height: 2, from: { x: 1.5, y: 8, z: 10 }, fov: 40 });
  close(target.x, 1.5);
  close(target.y, 1);
  close(target.z, -0.5);
  close(position.x, 1.5); // la cámara estaba justo detrás, en +Z: sigue ahí
  assert.ok(position.z > target.z);
  assert.ok(position.y > target.y);
});

test('cuanto más alta la pieza y más estrecha la cámara, más lejos se pone', () => {
  const lejos = (height, fov) => {
    const { target, position } = closeUpView({ at: { x: 0, z: 0 }, height, from: { x: 0, y: 5, z: 9 }, fov });
    return Math.hypot(position.x - target.x, position.z - target.z);
  };
  assert.ok(lejos(2.4, 40) > lejos(1.3, 40));
  assert.ok(lejos(1.8, 40) > lejos(1.8, 55));
});

test('con la cámara justo encima de la pieza no se rompe: elige un lado', () => {
  const { position } = closeUpView({ at: { x: 0, z: 0 }, height: 1.5, from: { x: 0, y: 9, z: 0 }, fov: 40 });
  assert.ok(Number.isFinite(position.x) && Number.isFinite(position.z));
});
