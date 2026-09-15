import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FAN_SECTORS, FAN_STEP, MAX_SHIFT, ROOM_GAP, SLIDE_ACCEL, SLIDE_SPEED, fanReach, joinReach, roomClearance, roomOverlap, roomTarget, stepRoom,
} from '../src/moves/room.js';

const circle = (x, z, radius) => ({ from: { x, z }, to: { x, z }, radius });
const slot = (x, z, offset = { x: 0, z: 0 }, target = { x: 0, z: 0 }) => ({
  home: { x, z }, radius: 0.4, offset: { ...offset }, speed: 0, target: { ...target },
});
const gap = (a, b) => Math.hypot(
  a.home.x + a.offset.x - b.home.x - b.offset.x,
  a.home.z + a.offset.z - b.home.z - b.offset.z,
) - a.radius - b.radius;
const piece = (x, z) => ({ home: { x, z }, radius: 0.4 });
// Abanico en el origen que llega a `front` en los sectores de delante (a menos de 45° de `facing`)
// y a `rest` en los demás.
const fan = ({ front, rest = 0.3, facing = 0 }) => ({
  at: { x: 0, z: 0 },
  facing,
  margin: 0.1,
  reach: Array.from({ length: FAN_SECTORS }, (_, k) => {
    const middle = -Math.PI + ((k + 0.5) * 2 * Math.PI) / FAN_SECTORS;
    return Math.abs(middle) < Math.PI / 4 ? front : rest;
  }),
});

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

test('el abanico aparta a quien tiene delante, no a quien tiene detrás ni al lado', () => {
  const bodies = [fan({ front: 0.8 })];
  const ahead = roomTarget(piece(0, 1), bodies);
  assert.ok(Math.abs(ahead.x) < 1e-9 && ahead.z >= 0.33 - 1e-9 && ahead.z <= 0.34 + 1e-9, JSON.stringify(ahead));
  assert.ok(roomClearance(ahead.x, 1 + ahead.z, 0.4, bodies) >= 0);
  assert.deepEqual(roomTarget(piece(0, -1), bodies), { x: 0, z: 0 });
  assert.deepEqual(roomTarget(piece(1, 0), bodies), { x: 0, z: 0 });
});

test('el abanico gira hacia donde mira el gigante', () => {
  const bodies = [fan({ front: 0.8, facing: Math.PI / 2 })];
  const ahead = roomTarget(piece(1, 0), bodies);
  assert.ok(ahead.x > 0.3 && Math.abs(ahead.z) < 1e-9, JSON.stringify(ahead));
  assert.deepEqual(roomTarget(piece(0, 1), bodies), { x: 0, z: 0 });
});

test('roomOverlap es cero si todas caben y crece con lo que falta', () => {
  assert.equal(roomOverlap([piece(0, 1)], [fan({ front: 0.8 })]), 0);
  const short = roomOverlap([piece(0, 1)], [fan({ front: 1.1 })]);
  const shorter = roomOverlap([piece(0, 1)], [fan({ front: 1.2 })]);
  assert.ok(short > 0 && shorter > short, `${short} ${shorter}`);
});

test('roomOverlap cuenta con las piezas que cierran el paso', () => {
  const bodies = [fan({ front: 0.8 })];
  assert.ok(roomOverlap([piece(0, 1)], bodies, [{ x: 0, z: 2, radius: 0.4 }]) > 0);
  assert.ok(roomOverlap([piece(0, 1), piece(0, 2)], bodies) > 0);
});

test('fanReach da el alcance hasta el tramo que cubre los segundos pedidos, y joinReach el mayor de cada sector', () => {
  const profile = [[1], [2], [3]];
  assert.deepEqual(fanReach(profile, 0), [1]);
  assert.deepEqual(fanReach(profile, FAN_STEP), [1]);
  assert.deepEqual(fanReach(profile, FAN_STEP + 0.01), [2]);
  assert.deepEqual(fanReach(profile, 99), [3]);
  const a = new Array(FAN_SECTORS).fill(0.5);
  a[3] = 2;
  const joined = joinReach([a, new Array(FAN_SECTORS).fill(1)]);
  assert.equal(joined[3], 2);
  assert.equal(joined[0], 1);
  assert.deepEqual(joinReach([]), new Array(FAN_SECTORS).fill(0));
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
