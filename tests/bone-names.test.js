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
  assert.deepEqual(boneAliases('R_Hand'), ['R_Hand', 'mixamorigRightHand']);
  assert.deepEqual(boneAliases('mixamorigHead'), ['mixamorigHead']);
});

test('y prueba también los sinónimos del tronco que usa cada aparejo', () => {
  assert.ok(boneAliases('Hips').includes('Pelvis'));
  assert.ok(boneAliases('Spine').includes('Spine01'));
  assert.ok(boneAliases('Spine2').includes('Spine02'));
  assert.ok(boneAliases('Neck').includes('NeckTwist01'));
});

test('encuentra el tronco de la reina, que se llama a la manera de Tripo', () => {
  const reina = skeleton(['BoneRoot', 'Hip', 'Pelvis', 'Spine01', 'Spine02', 'NeckTwist01', 'Head']);
  assert.equal(findBone(reina, 'Hips').name, 'Pelvis');
  assert.equal(findBone(reina, 'Spine').name, 'Spine01');
  assert.equal(findBone(reina, 'Spine2').name, 'Spine02');
  assert.equal(findBone(reina, 'Neck').name, 'NeckTwist01');
  assert.equal(findBone(reina, 'Head').name, 'Head');
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
