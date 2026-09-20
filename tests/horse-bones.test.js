import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHorseBones } from '../src/pieces/horse-bones.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} no es ≈ ${b}`);
// Caballo de prueba que mira hacia +X: su izquierda está en -Z. Cada pata tiene tres huesos, de la
// cadera o el hombro al casco.
const leg = (prefix, parent, x, z) => [
  { name: `${prefix}1`, parent, x, y: 0.5, z },
  { name: `${prefix}2`, parent: `${prefix}1`, x, y: 0.25, z },
  { name: `${prefix}3`, parent: `${prefix}2`, x, y: 0, z },
];
const HORSE = [
  { name: 'Raiz', parent: null, x: 0, y: 0.6, z: 0 },
  { name: 'Pelvis', parent: 'Raiz', x: -0.3, y: 0.6, z: 0 },
  { name: 'Pecho', parent: 'Raiz', x: 0.3, y: 0.62, z: 0 },
  { name: 'Cuello', parent: 'Pecho', x: 0.45, y: 0.8, z: 0 },
  { name: 'Cabeza', parent: 'Cuello', x: 0.55, y: 0.95, z: 0 },
  { name: 'Cola', parent: 'Pelvis', x: -0.45, y: 0.5, z: 0 },
  ...leg('TI', 'Pelvis', -0.3, -0.1),
  ...leg('TD', 'Pelvis', -0.3, 0.1),
  ...leg('DI', 'Pecho', 0.3, -0.1),
  ...leg('DD', 'Pecho', 0.3, 0.1),
];

test('encuentra hacia dónde mira y el giro que lo pone mirando a +Z', () => {
  close(findHorseBones(HORSE).yaw, -Math.PI / 2);
});

test('separa las cuatro patas, de arriba abajo, delanteras e izquierdas incluidas', () => {
  assert.deepEqual(findHorseBones(HORSE).legs, {
    frontLeft: ['DI1', 'DI2', 'DI3'],
    frontRight: ['DD1', 'DD2', 'DD3'],
    backLeft: ['TI1', 'TI2', 'TI3'],
    backRight: ['TD1', 'TD2', 'TD3'],
  });
});

test('la silla va en el lomo, más cerca de las patas delanteras', () => {
  close(findHorseBones(HORSE).seatZ, -0.3 + 0.6 * 0.6);
});

test('sin cuatro puntas, lanza error', () => {
  assert.throws(() => findHorseBones(HORSE.slice(0, 6)), /cuatro patas/);
});

test('el cuello va de la cruz a la cabeza, de dentro afuera', () => {
  assert.deepEqual(findHorseBones(HORSE).neck, ['Cuello', 'Cabeza']);
});

test('la cola es lo que cuelga por detrás de la grupa', () => {
  assert.deepEqual(findHorseBones(HORSE).tail, ['Cola']);
});

test('un caballo sin cola no se inventa una', () => {
  assert.deepEqual(findHorseBones(HORSE.filter((bone) => bone.name !== 'Cola')).tail, []);
});
