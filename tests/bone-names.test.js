import test from 'node:test';
import assert from 'node:assert/strict';
import { boneAliases, findBone, mixamoName } from '../src/pieces/bone-names.js';

// Un esqueleto de mentira: solo sabe decir si tiene un hueso con ese nombre.
function skeleton(names) {
  return { getObjectByName: (name) => (names.includes(name) ? { name } : undefined) };
}

test('traduce los nombres cortos a los de Mixamo', () => {
  assert.equal(mixamoName('Head'), 'mixamorigHead');
  assert.equal(mixamoName('R_Hand'), 'mixamorigRightHand');
  assert.equal(mixamoName('L_Foot'), 'mixamorigLeftFoot');
});

test('un nombre sin lado no se inventa ninguno', () => {
  assert.equal(mixamoName('Hips'), 'mixamorigHips');
  assert.equal(mixamoName('Spine'), 'mixamorigSpine');
});

test('busca primero con nuestro nombre y luego con el de Mixamo', () => {
  assert.deepEqual(boneAliases('Head'), ['Head', 'mixamorigHead']);
  assert.deepEqual(boneAliases('mixamorigHead'), ['mixamorigHead']);
});

test('encuentra el hueso tanto en un esqueleto corto como en uno de Mixamo', () => {
  assert.equal(findBone(skeleton(['Head', 'R_Hand']), 'Head').name, 'Head');
  assert.equal(findBone(skeleton(['mixamorigHead']), 'Head').name, 'mixamorigHead');
  assert.equal(findBone(skeleton(['mixamorigRightHand']), 'R_Hand').name, 'mixamorigRightHand');
});

test('sin hueso y sin esqueleto, devuelve null', () => {
  assert.equal(findBone(skeleton(['Hips']), 'Head'), null);
  assert.equal(findBone(null, 'Head'), null);
});
