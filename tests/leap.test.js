import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAP_CLEARANCE, LEAP_GRAVITY, LEAP_MIN_PEAK, LEAP_SPEED, arcShape, leapAt, planLeap } from '../src/moves/leap.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} no es ≈ ${b}`);
// Una L de b1 a c3: dos casillas hacia las negras (-Z) y una a la derecha (+X).
const B1 = { x: -2.5, z: 3.5 };
const C3 = { x: -1.5, z: 1.5 };
const HORSE = { halfLength: 0.47, halfWidth: 0.3 };
// Poste vertical fino en (x, z): puntos cada 0,1 casillas hasta `height`.
const pole = (x, z, height) => Array.from({ length: Math.round(height * 10) + 1 }, (_, i) => ({ x, y: i / 10, z }));

// Comprueba en 1000 instantes del camino que los cascos van LEAP_CLEARANCE por encima de cada punto
// que tienen debajo.
function assertClears(plan, points) {
  const ux = (plan.to.x - plan.from.x) / plan.distance;
  const uz = (plan.to.z - plan.from.z) / plan.distance;
  for (let i = 1; i < 1000; i++) {
    const k = i / 1000;
    for (const p of points) {
      const along = (p.x - plan.from.x) * ux + (p.z - plan.from.z) * uz;
      const aside = Math.abs((p.x - plan.from.x) * uz - (p.z - plan.from.z) * ux);
      if (aside > HORSE.halfWidth || Math.abs(along - k * plan.distance) > HORSE.halfLength) continue;
      assert.ok(plan.peak * arcShape(k) >= p.y + LEAP_CLEARANCE - 1e-9, `a ${k} del camino, ${plan.peak * arcShape(k)} < ${p.y + LEAP_CLEARANCE}`);
    }
  }
}

test('sin piezas debajo, el arco sube lo mínimo y una L dura ~0,9 s', () => {
  const plan = planLeap({ from: B1, to: C3, ...HORSE });
  close(plan.peak, LEAP_MIN_PEAK);
  close(plan.distance, Math.sqrt(5));
  close(plan.duration, Math.sqrt(5) / LEAP_SPEED);
  close(plan.heading, Math.atan2(1, -2));
});

test('una pieza bajo el camino levanta el arco lo justo para librarla', () => {
  const points = pole(-2, 2.5, 1.61);
  const plan = planLeap({ from: B1, to: C3, points, ...HORSE });
  assert.ok(plan.peak >= 1.61 + LEAP_CLEARANCE, `peak ${plan.peak}`);
  assert.ok(plan.peak < 2.4, `peak ${plan.peak}`);
  assertClears(plan, points);
});

test('una lanza pegada al camino, cerca de la salida, también se libra', () => {
  const points = [...pole(-2.17, 2.5, 2.54), ...pole(-2.5, 2.5, 0.26)];
  const plan = planLeap({ from: B1, to: C3, points, ...HORSE });
  assertClears(plan, points);
});

test('lo que queda fuera de la huella no cuenta', () => {
  const aside = planLeap({ from: B1, to: C3, points: pole(-3.5, 2.5, 3), ...HORSE });
  close(aside.peak, LEAP_MIN_PEAK);
  const behind = planLeap({ from: B1, to: C3, points: pole(-2.5, 4.5, 3), ...HORSE });
  close(behind.peak, LEAP_MIN_PEAK);
});

test('un salto muy alto tarda más', () => {
  const plan = planLeap({ from: B1, to: C3, points: pole(-2, 2.5, 4), ...HORSE });
  close(plan.duration, Math.sqrt((8 * plan.peak) / LEAP_GRAVITY));
  assert.ok(plan.duration > Math.sqrt(5) / LEAP_SPEED);
});

test('leapAt sale de la salida, llega al destino y sube hasta la mitad', () => {
  const plan = planLeap({ from: B1, to: C3, ...HORSE });
  const start = leapAt(plan, 0);
  close(start.x, B1.x);
  close(start.z, B1.z);
  close(start.y, 0);
  const end = leapAt(plan, 1);
  close(end.x, C3.x);
  close(end.z, C3.z);
  close(end.y, 0);
  const middle = leapAt(plan, 0.5);
  close(middle.x, -2);
  close(middle.z, 2.5);
  close(middle.y, plan.peak);
  assert.ok(leapAt(plan, 0.2).climb > 0 && leapAt(plan, 0.8).climb < 0);
  close(middle.climb, 0, 1e-6);
});

test('un salto sin distancia lanza error', () => {
  assert.throws(() => planLeap({ from: B1, to: B1, ...HORSE }), /destino distinto/);
});
