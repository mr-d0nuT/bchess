import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUEL_RETREAT, MELEE_DISTANCE, bestStrike, fightSpots, gripSlideForReach, peak, pickStyle, planExchanges, strikeSpot, usableStrikes,
} from '../src/combat/plan.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('pickStyle no repite el estilo anterior', () => {
  assert.equal(pickStyle('duel', () => 0.9), 'melee');
  assert.equal(pickStyle('melee', () => 0), 'duel');
  assert.ok(['duel', 'melee'].includes(pickStyle(null, () => 0.7)));
});

test('duelo: el atacante se retira dentro de su casilla y se miran', () => {
  const s = fightSpots({ x: 0, z: 0 }, { x: 1, z: -1 }, 'duel');
  assert.ok(close(s.defender.x, 1) && close(s.defender.z, -1));
  assert.ok(close(Math.hypot(s.attacker.x, s.attacker.z), DUEL_RETREAT));
  assert.ok(close(s.distance, Math.SQRT2 + DUEL_RETREAT));
  assert.ok(close(s.attackerFacing, Math.atan2(1, -1)));
  assert.ok(close(s.defenderFacing, Math.atan2(-1, 1)));
});

test('cuerpo a cuerpo: el atacante queda a la distancia fija del defensor', () => {
  const s = fightSpots({ x: 2, z: 2 }, { x: 1, z: 3 }, 'melee');
  assert.ok(close(s.distance, MELEE_DISTANCE));
  assert.ok(close(Math.hypot(s.attacker.x - 1, s.attacker.z - 3), MELEE_DISTANCE));
});

test('en las cuatro diagonales el atacante no sale de su casilla', () => {
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (const style of ['duel', 'melee']) {
      const s = fightSpots({ x: 0, z: 0 }, { x: dx, z: dz }, style);
      assert.ok(Math.abs(s.attacker.x) < 0.5 && Math.abs(s.attacker.z) < 0.5, `${style} ${dx},${dz}`);
    }
  }
});

test('un estilo desconocido lanza error', () => {
  assert.throws(() => fightSpots({ x: 0, z: 0 }, { x: 1, z: 1 }, 'magia'), /Estilo no válido/);
});

test('gripSlideForReach deja la punta en el pecho y nunca desliza hacia la punta', () => {
  assert.ok(close(gripSlideForReach({ reach: 2.18, distance: 1.71 }), 2.18 - (1.71 - 0.17)));
  assert.equal(gripSlideForReach({ reach: 1, distance: 2 }), 0);
});

test('peak devuelve la muestra más alta', () => {
  assert.deepEqual(peak([{ t: 0, value: 1 }, { t: 0.5, value: 3 }, { t: 1, value: 2 }]), { t: 0.5, value: 3 });
  assert.equal(peak([]), null);
});

test('usableStrikes: estocadas para el duelo y golpes que llegan para el cuerpo a cuerpo', () => {
  const attacks = [
    { key: 'box_03', spear: 'forward' }, { key: 'box_02', spear: 'forward' },
    { key: 'front_kick_01' }, { key: 'front_kick_02' }, { key: 'sin_medir' },
  ];
  const strikes = {
    box_03: { spear: { t: 1.1, reach: 2.18 }, body: { t: 0.7, reach: 0.68, bone: 'L_Hand' }, sideStep: 0.2 },
    box_02: { spear: { t: 2.3, reach: 2.44 }, body: { t: 2.3, reach: 0.68, bone: 'R_Hand' }, sideStep: 0.45 },
    front_kick_01: { spear: { t: 0.5, reach: 1.62 }, body: { t: 0.68, reach: 0.33, bone: 'R_ToeBase' }, sideStep: 0.15 },
    front_kick_02: { spear: { t: 0, reach: 0.41 }, body: { t: 0.95, reach: 0.78, bone: 'R_ToeBase' }, sideStep: 0.25 },
  };
  assert.deepEqual(usableStrikes(attacks, strikes, 'duel'), ['box_03', 'box_02']);
  // En el cuerpo a cuerpo, box_02 abre demasiado los pies (pisaría las casillas vecinas).
  assert.deepEqual(usableStrikes(attacks, strikes, 'melee'), ['box_03', 'front_kick_02']);
});

test('planExchanges: uno o dos golpes previos y el final del atacante, sin repetir seguidos', () => {
  const short = planExchanges(['a', 'b', 'c'], sequence(0, 0.9, 0));
  assert.deepEqual(short.map((beat) => beat.by), ['attacker', 'attacker']);
  assert.deepEqual(short.map((beat) => beat.final), [false, true]);
  const long = planExchanges(['a', 'b', 'c'], sequence(0, 0.1, 0, 0));
  assert.deepEqual(long.map((beat) => beat.by), ['attacker', 'defender', 'attacker']);
  for (let i = 1; i < long.length; i++) assert.notEqual(long[i].key, long[i - 1].key);
});

test('planExchanges sin golpes lanza error', () => {
  assert.throws(() => planExchanges([]), /No hay golpes/);
});

test('bestStrike: el golpe con mano o pie que más alcanza', () => {
  const attacks = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const strikes = { a: { body: { reach: 0.5 } }, b: { body: { reach: 0.9 } }, c: { body: null } };
  assert.equal(bestStrike(attacks, strikes), 'b');
  assert.equal(bestStrike([{ key: 'c' }], strikes), null);
});

test('strikeSpot: se para donde su golpe llega al pecho del rival', () => {
  const spot = strikeSpot({ x: 0, z: 0 }, { x: 3, z: 0 }, { reach: 0.8, torso: 0.17 });
  assert.ok(Math.abs(spot.attacker.x - 2.03) < 1e-9);
  assert.equal(spot.attacker.z, 0);
  assert.ok(Math.abs(spot.distance - 0.97) < 1e-9);
  assert.equal(spot.attackerFacing, Math.PI / 2);
  assert.equal(spot.defenderFacing, -Math.PI / 2);
});

test('strikeSpot: si ya le llega, golpea desde donde está, y nunca se acerca más de closest', () => {
  assert.deepEqual(strikeSpot({ x: 0, z: 0 }, { x: 1, z: 0 }, { reach: 0.9, torso: 0.17 }).attacker, { x: 0, z: 0 });
  const close = strikeSpot({ x: 0, z: 0 }, { x: 3, z: 0 }, { reach: 0.3, torso: 0.17, closest: 0.75 });
  assert.ok(Math.abs(close.attacker.x - 2.25) < 1e-9);
});
