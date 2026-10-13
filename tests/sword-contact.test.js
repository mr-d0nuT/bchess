import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aroundLength, aroundPath, BLADE_TOUCH, bladeAt, bodyGap, clashSpot, crossed, cutStand, partGap, segmentDistance, standsAiming, standsAround, strikeWindow, toWorld,
} from '../src/combat/sword-contact.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const P = (x, y, z) => ({ x, y, z });

test('dos hojas que se cruzan a 10 cm: distancia, puntos y de qué lado pasa la segunda', () => {
  const d = segmentDistance(P(-1, 0, 0), P(1, 0, 0), P(0, -1, 0.1), P(0, 1, 0.1));
  assert.ok(near(d.distance, 0.1));
  assert.ok(near(d.s, 0.5) && near(d.t, 0.5));
  assert.equal(d.side, 1);
  assert.equal(segmentDistance(P(-1, 0, 0), P(1, 0, 0), P(0, -1, -0.1), P(0, 1, -0.1)).side, -1);
});

test('que una hoja cambie de lado solo es cruzarse si estaban cerca (girando, el lado da la vuelta lejos)', () => {
  const lejos = [segmentDistance(P(-1, 0, 0), P(1, 0, 0), P(0, -1, 0.5), P(0, 1, 0.5)), segmentDistance(P(-1, 0, 0), P(1, 0, 0), P(0, 1, 0.5), P(0, -1, 0.5))];
  assert.notEqual(lejos[0].side, lejos[1].side);
  assert.equal(crossed(lejos[0], lejos[1]), false);
  const antes = segmentDistance(P(-1, 0, 0), P(1, 0, 0), P(0, -1, 0.05), P(0, 1, 0.05));
  const ahora = segmentDistance(P(-1, 0, 0), P(1, 0, 0), P(0, -1, -0.04), P(0, 1, -0.04));
  assert.equal(crossed(antes, ahora), true);
  assert.equal(crossed(null, ahora), false);
});

test('segmentos paralelos y extremos: lo más cerca', () => {
  assert.ok(near(segmentDistance(P(0, 0, 0), P(1, 0, 0), P(0, 1, 0), P(1, 1, 0)).distance, 1));
  const d = segmentDistance(P(0, 0, 0), P(1, 0, 0), P(2, 1, 0), P(3, 1, 0));
  assert.ok(near(d.distance, Math.SQRT2));
  assert.ok(near(d.s, 1) && near(d.t, 0));
});

test('del sistema de quien pega al mundo: z hacia delante, x hacia su izquierda', () => {
  const at = { x: 1, z: 2 };
  const ahead = toWorld(P(0, 0.5, 1), at, Math.PI / 2); // mirando hacia +x
  assert.ok(near(ahead.x, 2) && near(ahead.y, 0.5) && near(ahead.z, 2));
  const left = toWorld(P(1, 0, 0), at, Math.PI / 2);
  assert.ok(near(left.x, 1) && near(left.z, 1)); // mirando hacia +x, su izquierda es -z
});

test('la hoja contra una cápsula y contra el escudo (una placa)', () => {
  const capsule = { a: P(0, 0, 0.5), b: P(0, 0.5, 0.5), r: 0.1 };
  assert.ok(near(partGap(P(0, 1, 0), P(0, 1, 1), capsule).gap, 0.4));
  const plate = { c: P(0, 1, 0), u: P(1, 0, 0), v: P(0, 1, 0), hu: 0.2, hv: 0.3, r: 0.01 };
  assert.ok(near(partGap(P(0, 1, -0.5), P(0, 1, 0.5), plate).gap, -0.01)); // la atraviesa
  assert.ok(near(partGap(P(0.5, 1, -0.5), P(0.5, 1, 0.5), plate).gap, 0.29)); // pasa por fuera del borde
  const g = bodyGap(P(0, 1, -0.5), P(0, 1, 0.5), [capsule, plate]);
  assert.equal(g.part, plate);
});

// Un tajo de prueba: la hoja, inclinada `rise` hacia arriba, barre de lado de `from` a `to` (ángulo en el suelo
// desde su derecha: 0, a su derecha; π/2, delante; π, a su izquierda), con la guarda quieta en `guard`.
function sweep({ guard, from, to, rise = Math.PI / 6, length = 0.7, hold = 0.3, seconds = 0.3, fps = 60 }) {
  const path = [];
  const total = hold + seconds + hold;
  for (let i = 0; i <= total * fps; i++) {
    const t = i / fps;
    const k = Math.min(1, Math.max(0, (t - hold) / seconds));
    const phi = from + (to - from) * k * k * (3 - 2 * k);
    const tip = {
      x: guard.x - Math.cos(phi) * Math.cos(rise) * length,
      y: guard.y + Math.sin(rise) * length,
      z: guard.z + Math.sin(phi) * Math.cos(rise) * length,
    };
    path.push({ t, ...tip, gx: guard.x, gy: guard.y, gz: guard.z });
  }
  return path;
}

test('el tajo de verdad: de lo más alto hasta que frena', () => {
  const path = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const y = t < 0.4 ? 1 + t : t < 0.6 ? 1.4 - (t - 0.4) * 4 : 0.6; // sube despacio, baja de golpe y se para
    path.push({ t, x: 0, y, z: 0.5, gx: 0, gy: 1, gz: 0.2 });
  }
  const { top, end } = strikeWindow(path);
  assert.ok(near(path[top].t, 0.4, 0.02));
  assert.ok(path[end].t > 0.55 && path[end].t < 0.66, `acaba en ${path[end].t}`);
});

test('las hojas cara a cara se cruzan por en medio sin moverse cuando ya se encuentran', () => {
  const mine = sweep({ guard: P(0, 1, 0.3), from: 0, to: Math.PI });
  const his = sweep({ guard: P(0, 1, 0.3), from: 0, to: Math.PI });
  const clash = clashSpot({ mine, his, from: { x: 0, z: 0 }, facing: 0, rival: { x: 0, z: 1.2 }, rivalFacing: Math.PI, minDistance: 0.6 });
  assert.ok(clash, 'se encuentran');
  assert.ok(Math.hypot(clash.at.x, clash.at.z) < 0.03, `sin moverse: ${JSON.stringify(clash.at)}`);
  assert.ok(clash.along.every((x) => x > 0.35 && x < 0.65), `por en medio: ${clash.along}`);
  assert.ok(near(clash.point.z, 0.6, 0.05) && near(clash.point.x, 0, 0.05));
});

test('si las hojas pasan cada una por su lado, el atacante se aparta a su derecha y se tocan de verdad', () => {
  const mine = sweep({ guard: P(0.2, 1, 0.3), from: Math.PI / 2, to: Math.PI });
  const his = sweep({ guard: P(0.2, 1, 0.3), from: Math.PI / 2, to: Math.PI });
  const from = { x: 0, z: 0 };
  const rival = { x: 0, z: 1.2 };
  const clash = clashSpot({ mine, his, from, facing: 0, rival, rivalFacing: Math.PI, minDistance: 0.6 });
  assert.ok(clash, 'encuentra sitio');
  assert.ok(-(clash.at.x - from.x) > 0.05, `a su derecha (-x): ${JSON.stringify(clash.at)}`);
  assert.ok(clash.along.every((x) => x >= 0.3 && x <= 0.9));
  // En ese instante, con el atacante ahí, las hojas se tocan (o se han cruzado en la última muestra).
  const i = mine.findIndex((s) => near(s.t, clash.t, 1e-9));
  const [g1, p1] = bladeAt(mine[i], clash.at, 0);
  const [g2, p2] = bladeAt(his[i], rival, Math.PI);
  assert.ok(segmentDistance(g1, p1, g2, p2).distance < 0.06, 'se tocan');
  assert.ok(BLADE_TOUCH > 0);
});

// Un tajo de arriba abajo de prueba: la hoja gira en su plano (x = 0) de vertical a hacia delante y abajo.
function chop({ guard = P(0, 1.3, 0.25), length = 0.7, fps = 120 } = {}) {
  const path = [];
  for (let i = 0; i <= 0.8 * fps; i++) {
    const t = i / fps;
    const k = Math.min(1, Math.max(0, (t - 0.3) / 0.2));
    const theta = (2 * Math.PI / 3) * k * k * (3 - 2 * k);
    path.push({ t, x: guard.x, y: guard.y + Math.cos(theta) * length, z: guard.z + Math.sin(theta) * length, gx: guard.x, gy: guard.y, gz: guard.z });
  }
  return path;
}

test('para cortar el brazo por el hombro, la hoja baja por fuera de la cabeza y del tronco', () => {
  const D = 1.2;
  const body = [
    { a: P(0, 1.42, D), b: P(0, 1.48, D), r: 0.12, limb: 'head' },
    { a: P(0, 0.8, D), b: P(0, 1.25, D), r: 0.1, limb: 'torso' },
    { a: P(-0.2, 1.2, D), b: P(-0.2, 1.2, D), r: 0.08, limb: 'R_arm' },
    { a: P(-0.2, 1.2, D), b: P(-0.22, 0.9, D), r: 0.06, limb: 'R_arm' },
  ];
  const target = P(-0.2, 1.2, D);
  const stands = [];
  for (let x = -0.4; x <= 0.4001; x += 0.025) for (let z = -0.3; z <= 0.3001; z += 0.025) stands.push({ at: { x, z }, facing: 0 });
  const walk = (stand) => Math.hypot(stand.at.x, stand.at.z);
  const plan = cutStand({ path: chop(), body, target, reach: 0.12, stands, walk, facing: 0, spare: ['R_arm'], margin: { head: 0.03, other: 0.01 } });
  assert.ok(plan, 'encuentra sitio');
  assert.ok(plan.at.x < -0.12 && plan.at.x > -0.28, `por el hombro, fuera de la cabeza: x = ${plan.at.x}`);
  assert.ok(Math.hypot(plan.point.x - target.x, plan.point.y - target.y, plan.point.z - target.z) <= 0.12);
  assert.ok(plan.t > 0.3 && plan.t < 0.55, `mientras baja: ${plan.t}`);
});

test('los sitios alrededor del rival lo miran a él', () => {
  const center = { x: 1, z: 2 };
  const stands = standsAround({ center, bearing: 0, distances: [1], spread: Math.PI / 2, step: Math.PI / 2 });
  assert.equal(stands.length, 3);
  for (const { at, facing } of stands) {
    assert.ok(near(Math.hypot(at.x - center.x, at.z - center.z), 1));
    // mirando hacia el centro: un paso adelante lo acerca
    const ahead = { x: at.x + Math.sin(facing) * 0.1, z: at.z + Math.cos(facing) * 0.1 };
    assert.ok(near(Math.hypot(ahead.x - center.x, ahead.z - center.z), 0.9));
  }
});

test('para pasar de un costado al otro se cuenta lo que se anda rodeándolo, no en línea recta', () => {
  const center = { x: 0, z: 0 };
  assert.ok(near(aroundLength({ x: -1, z: 0 }, { x: 1, z: 0 }, center), Math.PI));
  assert.ok(near(aroundLength({ x: 0, z: 1 }, { x: 0, z: 1.5 }, center), 0.5));
});

test('un corte no vale si la hoja toca antes otra pieza que no es la del blanco', () => {
  const D = 1.2;
  // La cabeza, justo encima del hombro: el tajo, bajando en su plano, la toca antes que al hombro.
  const body = [
    { a: P(-0.2, 1.45, D), b: P(-0.2, 1.5, D), r: 0.1, limb: 'head' },
    { a: P(-0.2, 1.2, D), b: P(-0.2, 1.2, D), r: 0.08, limb: 'R_arm' },
  ];
  const stands = [{ at: { x: -0.2, z: 0 }, facing: 0 }];
  const plan = cutStand({ path: chop(), body, target: P(-0.2, 1.2, D), reach: 0.3, stands, walk: () => 0, facing: 0, spare: ['R_arm'] });
  assert.equal(plan, null);
});

test('los sitios apuntados ponen un punto de la hoja en el blanco, mirando al rival', () => {
  const path = chop();
  const target = P(0.3, 1.0, 2);
  const center = { x: 0.3, z: 2.2 };
  const stands = standsAiming({ path, target, center, minDistance: 0.5, maxYaw: 0.3, facings: 24, along: [0.5] });
  assert.ok(stands.length > 0);
  const { top, end } = strikeWindow(path);
  for (const stand of stands.slice(0, 20)) {
    // en algún instante de la bajada, el punto de en medio de la hoja cae en el blanco
    let best = Infinity;
    for (let i = top; i <= end; i++) {
      const [g, p] = bladeAt(path[i], stand.at, stand.facing);
      const mid = { x: (g.x + p.x) / 2, z: (g.z + p.z) / 2 };
      best = Math.min(best, Math.hypot(mid.x - target.x, mid.z - target.z));
    }
    assert.ok(best < 1e-6, `pasa por el blanco: ${best}`);
  }
});

test('el camino rodeando al rival no se le acerca más de lo que se estaba', () => {
  const center = { x: 0, z: 0 };
  const path = aroundPath({ x: -1, z: 0 }, { x: 1, z: 0.2 }, center, 10);
  assert.equal(path.length, 10);
  for (const p of path) assert.ok(Math.hypot(p.x, p.z) >= 1 - 1e-9);
  assert.ok(near(path[9].x, 1) && near(path[9].z, 0.2));
});
