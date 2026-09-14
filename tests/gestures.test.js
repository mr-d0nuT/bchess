import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GESTURE_MIN_MS, GESTURE_RANGE_MS, nextGestureDelay, pickPerformer } from '../src/moves/gestures.js';

test('la espera entre gestos va del mínimo al mínimo más el margen', () => {
  assert.equal(nextGestureDelay(() => 0), GESTURE_MIN_MS);
  assert.equal(nextGestureDelay(() => 0.5), GESTURE_MIN_MS + GESTURE_RANGE_MS / 2);
  assert.ok(nextGestureDelay(() => 0.999999) < GESTURE_MIN_MS + GESTURE_RANGE_MS);
});

test('entre gesto y gesto pasan al menos 15 segundos', () => {
  assert.ok(GESTURE_MIN_MS >= 15000);
});

test('sin candidatos no elige a nadie', () => {
  assert.equal(pickPerformer([], null), null);
});

test('no repite el último si hay alguien más', () => {
  for (const r of [0, 0.3, 0.6, 0.99]) {
    assert.notEqual(pickPerformer(['a', 'b', 'c'], 'b', () => r), 'b');
  }
  assert.equal(pickPerformer(['a', 'b', 'c'], 'b', () => 0), 'a');
  assert.equal(pickPerformer(['a', 'b', 'c'], 'b', () => 0.99), 'c');
});

test('si solo queda el último, lo repite', () => {
  assert.equal(pickPerformer(['a'], 'a'), 'a');
});
