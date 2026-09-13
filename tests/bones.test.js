import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickHandBone } from '../src/pieces/bones.js';

test('nombres de Mixamo, sin confundir los dedos', () => {
  const names = ['mixamorigHips', 'mixamorigRightHandThumb1', 'mixamorigRightHand', 'mixamorigLeftHand'];
  assert.equal(pickHandBone(names, 'right'), 'mixamorigRightHand');
  assert.equal(pickHandBone(names, 'left'), 'mixamorigLeftHand');
});

test('estilos de Blender, 3ds Max y con guion bajo', () => {
  assert.equal(pickHandBone(['hand.L', 'hand.R'], 'right'), 'hand.R');
  assert.equal(pickHandBone(['Bip01 R Hand', 'Bip01 L Hand'], 'left'), 'Bip01 L Hand');
  assert.equal(pickHandBone(['L_Hand', 'R_Hand'], 'right'), 'R_Hand');
});

test('sin manos devuelve null y un lado raro lanza error', () => {
  assert.equal(pickHandBone(['Hips', 'Spine'], 'right'), null);
  assert.throws(() => pickHandBone(['Hips'], 'up'), /Lado no válido/);
});
