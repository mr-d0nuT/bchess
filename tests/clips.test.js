import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, findClipName, mapClips, pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion,
} from '../src/pieces/clips.js';

test('las acciones del juego', () => {
  assert.deepEqual(ACTIONS, ['idle', 'walk', 'attack', 'hit', 'fall', 'jump']);
});

test('nombres tipo Tripo', () => {
  assert.deepEqual(mapClips(['Idle', 'Walk', 'Slash', 'Hurt', 'Fall', 'Jump']), {
    idle: 'Idle', walk: 'Walk', attack: 'Slash', hit: 'Hurt', fall: 'Fall', jump: 'Jump',
  });
});

test('nombres tipo Mixamo', () => {
  const m = mapClips(['mixamo.com|Standing Idle', 'Walking', 'Stabbing', 'Hit Reaction', 'Falling Back Death']);
  assert.equal(m.idle, 'mixamo.com|Standing Idle');
  assert.equal(m.walk, 'Walking');
  assert.equal(m.attack, 'Stabbing');
  assert.equal(m.hit, 'Hit Reaction');
  assert.equal(m.fall, 'Falling Back Death');
  assert.equal(m.jump, null);
});

test('las indicaciones del manifiesto mandan y no se reutilizan', () => {
  const m = mapClips(['Anim_0', 'Anim_1', 'Walk'], { walk: 'Anim_1', idle: 'Anim_0' });
  assert.equal(m.walk, 'Anim_1');
  assert.equal(m.idle, 'Anim_0');
  assert.equal(m.attack, null);
});

test('pista raíz: caderas antes que root', () => {
  assert.equal(pickRootPositionTrack(['Root.position', 'mixamorigHips.position', 'mixamorigHips.quaternion']), 'mixamorigHips.position');
  assert.equal(pickRootPositionTrack(['Armature_Root.position']), 'Armature_Root.position');
  assert.equal(pickRootPositionTrack(['Root.position', 'Hip.position']), 'Hip.position');
  assert.equal(pickRootPositionTrack(['Spine.quaternion']), null);
});

test('removeLinearDrift quita el avance y conserva el balanceo', () => {
  const times = [0, 0.5, 1];
  const values = [0, 1, 0, 0.1, 1.05, 0.5, 0, 1, 1];
  const result = removeLinearDrift(times, values);
  assert.ok(Math.abs(result.distance - 1) < 1e-9);
  const rounded = [...result.values].map((v) => Math.round(v * 1000) / 1000);
  assert.deepEqual(rounded, [0, 1, 0, 0.1, 1.05, 0, 0, 1, 0]);
});

test('removeLinearDrift con el eje vertical en Z (esqueletos de Tripo)', () => {
  const times = [0, 1];
  const values = [0, 0, 0.5, 0, -1.5, 0.5];
  const result = removeLinearDrift(times, values, 2);
  assert.ok(Math.abs(result.distance - 1.5) < 1e-9);
  assert.deepEqual([...result.values], [0, 0, 0.5, 0, 0, 0.5]);
});

test('findClipName prefiere la clave exacta de Tripo', () => {
  const names = ['preset:biped:hit_to_body_01.001', 'preset:biped:hit_to_body_012.001', 'Walk'];
  assert.equal(findClipName(names, 'hit_to_body_01'), 'preset:biped:hit_to_body_01.001');
  assert.equal(findClipName(names, 'hit_to_body_012'), 'preset:biped:hit_to_body_012.001');
  assert.equal(findClipName(names, 'Walk'), 'Walk');
  assert.equal(findClipName(names, 'nada'), null);
});

test('resolveMoves usa el manifiesto y, para lo que no dice, la detección automática', () => {
  const names = ['preset:biped:idle.001', 'preset:biped:walk.001', 'preset:biped:boxing_01.001', 'preset:biped:hit_to_head.001', 'preset:biped:fall.001'];
  const { moves, missing } = resolveMoves(names, {
    attack: [{ clip: 'boxing_01', spear: 'forward' }, { clip: 'front_kick_01' }],
    hit: [{ clip: 'hit_to_head' }],
    fidget: [{ clip: 'scratch' }],
  });
  assert.deepEqual(moves.attack, [{ clip: 'preset:biped:boxing_01.001', spear: 'forward' }]);
  assert.deepEqual(moves.hit, [{ clip: 'preset:biped:hit_to_head.001' }]);
  assert.deepEqual(moves.idle, [{ clip: 'preset:biped:idle.001' }]);
  assert.deepEqual(moves.walk, [{ clip: 'preset:biped:walk.001' }]);
  assert.deepEqual(moves.fall, [{ clip: 'preset:biped:fall.001' }]);
  assert.deepEqual(moves.jump, []);
  assert.deepEqual(moves.fidget, []);
  assert.deepEqual(missing, ['front_kick_01', 'scratch']);
});

test('pickVariant elige al azar sin repetir la anterior', () => {
  assert.equal(pickVariant(1, 0, () => 0.9), 0);
  assert.equal(pickVariant(3, -1, () => 0), 0);
  assert.equal(pickVariant(3, -1, () => 0.99), 2);
  assert.equal(pickVariant(3, 0, () => 0), 1);
  assert.equal(pickVariant(3, 1, () => 0), 0);
  assert.equal(pickVariant(3, 1, () => 0.99), 2);
});

test('scaleHorizontalMotion acorta el desplazamiento sin tocar la altura', () => {
  const values = [0, 0, 0.5, 0.4, -0.2, 0.3, 0.8, -0.4, 0.1];
  const out = [...scaleHorizontalMotion(values, 2, 0.25)].map((v) => Math.round(v * 1000) / 1000);
  assert.deepEqual(out, [0, 0, 0.5, 0.1, -0.05, 0.3, 0.2, -0.1, 0.1]);
});

test('pickUpAxis elige el eje más largo de la cadera', () => {
  assert.equal(pickUpAxis([0.0045, -0.0166, 0.5176]), 2);
  assert.equal(pickUpAxis([0.01, 1.02, -0.03]), 1);
});
