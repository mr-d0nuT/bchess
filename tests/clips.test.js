import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, cutAndReturn, findClipName, mapClips, pickDriftTrack, pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves,
  scaleHorizontalMotion, slerpValues,
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
  assert.deepEqual(moves.attack, [{ clip: 'preset:biped:boxing_01.001', key: 'boxing_01', spear: 'forward' }]);
  assert.deepEqual(moves.hit, [{ clip: 'preset:biped:hit_to_head.001', key: 'hit_to_head' }]);
  assert.deepEqual(moves.idle, [{ clip: 'preset:biped:idle.001', key: 'preset:biped:idle.001' }]);
  assert.deepEqual(moves.walk, [{ clip: 'preset:biped:walk.001', key: 'preset:biped:walk.001' }]);
  assert.deepEqual(moves.fall, [{ clip: 'preset:biped:fall.001', key: 'preset:biped:fall.001' }]);
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

test('pickDriftTrack elige la pista de posición que más avanza', () => {
  const tracks = [
    { name: 'Lomo.position', times: [0, 1], values: [0, 0, 1, 0, 0.02, 1.01] },
    { name: 'Raiz.position', times: [0, 0.5, 1], values: [0, 0, 0.9, 0, -0.6, 0.92, 0, -1.2, 0.9] },
    { name: 'Pata.quaternion', times: [0, 1], values: [0, 0, 0, 1, 0, 0.7, 0, 0.7] },
  ];
  assert.equal(pickDriftTrack(tracks), 'Raiz.position');
});

test('pickDriftTrack devuelve null si ninguna pista de posición se mueve', () => {
  assert.equal(pickDriftTrack([{ name: 'Raiz.position', times: [0, 1], values: [0, 1, 0, 0, 1, 0] }]), null);
  assert.equal(pickDriftTrack([]), null);
});

test('cortar un clip y que vuelva a como empezó (el conjuro del alfil, sin su segundo lanzamiento)', () => {
  // Una pista de posición que va de 0 a 10 en 4 s.
  const times = Float32Array.from([0, 1, 2, 3, 4]);
  const values = Float32Array.from([0, 0, 0, 2, 0, 0, 5, 0, 0, 8, 0, 0, 10, 0, 0]);
  const sample = (t) => [t <= 1 ? 2 * t : t <= 2 ? 2 + 3 * (t - 1) : 5 + 3 * (t - 2), 0, 0];
  const { times: tt, values: vv } = cutAndReturn({ times, values, size: 3, until: 1.5, back: 1, sample });
  // Lo de antes del corte, tal cual; en el corte, su valor; y en `until + back`, el primero.
  assert.deepEqual(Array.from(tt), [0, 1, 1.5, 1.75, 2, 2.25, 2.5]);
  assert.equal(vv[2 * 3], 3.5);
  assert.equal(vv[6 * 3], 0);
  // Vuelve despacio al principio y al final (entra y sale suave): la mitad, a mitad de camino.
  assert.ok(Math.abs(vv[4 * 3] - 1.75) < 1e-6);
  assert.ok(vv[3 * 3] > 1.75 * 1.5 && vv[3 * 3] < 3.5);
});

test('los giros vuelven por el camino corto', () => {
  const s = Math.SQRT1_2;
  // De 90° en Y a nada; con el primero dado la vuelta (el mismo giro, con el signo cambiado).
  const mitad = slerpValues([0, s, 0, s], [-0, -0, -0, -1], 0.5);
  assert.ok(Math.abs(Math.hypot(...mitad) - 1) < 1e-9);
  const angulo = 2 * Math.acos(Math.min(1, Math.abs(mitad[3])));
  assert.ok(Math.abs(angulo - Math.PI / 4) < 1e-6, `${angulo}`);
});
