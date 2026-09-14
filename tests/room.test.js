import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SHIFT, ROOM_GAP, SLIDE_ACCEL, SLIDE_SPEED, roomClearance, roomTarget, stepRoom } from '../src/moves/room.js';

const circle = (x, z, radius) => ({ from: { x, z }, to: { x, z }, radius });
const slot = (x, z, offset = { x: 0, z: 0 }, target = { x: 0, z: 0 }) => ({
  home: { x, z }, radius: 0.4, offset: { ...offset }, speed: 0, target: { ...target },
});
const gap = (a, b) => Math.hypot(
  a.home.x + a.offset.x - b.home.x - b.offset.x,
  a.home.z + a.offset.z - b.home.z - b.offset.z,
) - a.radius - b.radius;

test('sin cuerpos, o si ya le dejan sitio, se queda en el centro de su casilla', () => {
  assert.deepEqual(roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, []), { x: 0, z: 0 });
  assert.deepEqual(roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, [circle(0, 0, 0.5)]), { x: 0, z: 0 });
});

test('se aleja del gigante lo justo para dejar el hueco mínimo', () => {
  const bodies = [circle(0, 0, 0.7)];
  const target = roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, bodies);
  assert.ok(Math.abs(target.x) < 1e-9);
  assert.ok(target.z >= 0.13 - 1e-9 && target.z <= 0.14 + 1e-9, `z = ${target.z}`);
  assert.ok(roomClearance(target.x, 1 + target.z, 0.4, bodies) >= 0);
});

test('ante el tramo por el que anda el gigante, se aparta de lado', () => {
  const walk = { from: { x: 0, z: 0 }, to: { x: 3, z: 0 }, radius: 0.7 };
  const target = roomTarget({ home: { x: 2, z: 1 }, radius: 0.4 }, [walk]);
  assert.ok(Math.abs(target.x) < 1e-9 && target.z > 0.12, JSON.stringify(target));
});

test('nunca se aleja más de MAX_SHIFT', () => {
  const target = roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, [circle(0, 0, 1.2)]);
  assert.ok(Math.hypot(target.x, target.z) <= MAX_SHIFT + 1e-9);
  assert.ok(target.z > MAX_SHIFT - 0.011);
});

test('si detrás hay otra pieza, se desvía sin acercarse a ella', () => {
  const behind = { x: 0, z: 2, radius: 0.4 };
  const target = roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, [circle(0, 0, 0.9)], [behind]);
  assert.ok(Math.abs(target.x) > 0.1, `x = ${target.x}`);
  assert.ok(target.z > 0);
  assert.ok(Math.hypot(target.x - behind.x, 1 + target.z - behind.z) >= 0.8 + ROOM_GAP - 1e-9);
});

test('un paso nunca deja dos piezas a menos del hueco mínimo', () => {
  const a = slot(0, 0, { x: 0, z: 0 }, { x: 0.3, z: 0 });
  const b = slot(1, 0, { x: 0, z: 0 }, { x: -0.3, z: 0 });
  for (let frame = 0; frame < 120; frame++) {
    stepRoom([a, b], [], 1 / 60);
    assert.ok(gap(a, b) >= ROOM_GAP - 1e-9, `hueco ${gap(a, b)} en el fotograma ${frame}`);
  }
  assert.ok(a.offset.x > 0.05);
});

test('no se acerca a una pieza fija que ya estaba cerca, pero puede alejarse de ella', () => {
  const fixed = [{ x: 0.75, z: 0, radius: 0.4 }];
  const toward = slot(0, 0, { x: 0, z: 0 }, { x: 0.3, z: 0 });
  stepRoom([toward], fixed, 1 / 60);
  assert.equal(toward.offset.x, 0);
  const away = slot(0, 0, { x: 0, z: 0 }, { x: -0.3, z: 0 });
  for (let frame = 0; frame < 30; frame++) stepRoom([away], fixed, 1 / 60);
  assert.ok(away.offset.x < -0.1);
});

test('vuelve exactamente al centro de su casilla', () => {
  const piece = slot(0, 0, { x: 0.2, z: -0.1 });
  for (let frame = 0; frame < 90; frame++) stepRoom([piece], [], 1 / 60);
  assert.deepEqual(piece.offset, { x: 0, z: 0 });
});

test('arranca poco a poco y nunca pasa de la velocidad máxima', () => {
  const dt = 1 / 60;
  const piece = slot(0, 0, { x: 0, z: 0 }, { x: 0.35, z: 0 });
  stepRoom([piece], [], dt);
  assert.ok(piece.offset.x <= SLIDE_ACCEL * dt * dt + 1e-12);
  let last = piece.offset.x;
  for (let frame = 0; frame < 60; frame++) {
    stepRoom([piece], [], dt);
    assert.ok(piece.offset.x - last <= SLIDE_SPEED * dt + 1e-12);
    last = piece.offset.x;
  }
});
