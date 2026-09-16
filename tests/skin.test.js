import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descendantsOf, trianglesOfBones } from '../src/pieces/skin.js';

test('descendantsOf reúne el hueso y todo lo que cuelga de él', () => {
  const parents = [-1, 0, 1, 1, 0, 4]; // 0 raíz; 1 brazo con 2 y 3; 4 pierna con 5
  assert.deepEqual([...descendantsOf(parents, 1)].sort(), [1, 2, 3]);
  assert.deepEqual([...descendantsOf(parents, 0)].sort(), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...descendantsOf(parents, 5)], [5]);
});

// Seis vértices en dos triángulos: el primero, del hueso 1; el segundo, con un vértice del hueso 0.
const skin = {
  skinIndex: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  skinWeight: [1, 0, 0, 0, 1, 0, 0, 0, 0.6, 0.4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};

test('trianglesOfBones se queda con los triángulos que mueven esos huesos', () => {
  assert.deepEqual(trianglesOfBones({ index: [0, 1, 2, 3, 4, 5], ...skin, bones: new Set([1]) }), [0, 1, 2]);
  assert.deepEqual(trianglesOfBones({ index: [0, 1, 2, 3, 4, 5], ...skin, bones: new Set([0, 1]) }), [0, 1, 2, 3, 4, 5]);
});

test('trianglesOfBones: un vértice repartido cuenta si llega a la parte pedida', () => {
  assert.deepEqual(trianglesOfBones({ index: [0, 1, 2], ...skin, bones: new Set([1]), share: 0.7 }), []);
});

test('trianglesOfBones sin índices recorre los vértices de tres en tres', () => {
  assert.deepEqual(trianglesOfBones({ count: 6, ...skin, bones: new Set([1]) }), [0, 1, 2]);
});
