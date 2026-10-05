import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_EDGE, staffDirection, wideFraming } from '../src/scene/finale-plan.js';

const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const derechaDelante = (facing) => ({ x: Math.sin(facing - Math.PI / 4), z: Math.cos(facing - Math.PI / 4) });

test('sin nadie alrededor, el báculo cae a su derecha y algo por delante', () => {
  for (const facing of [0, Math.PI]) {
    const dir = staffDirection({ from: { x: 0, z: 0 }, length: 1.75, facing });
    const quiere = derechaDelante(facing);
    assert.ok(cerca(dir.x, quiere.x) && cerca(dir.z, quiere.z), `mirando a ${facing}: ${JSON.stringify(dir)}`);
  }
});

test('el báculo no cae encima de una pieza: busca un hueco', () => {
  const facing = 0;
  const quiere = derechaDelante(facing);
  const encima = { x: quiere.x * 1, z: quiere.z * 1 }; // una pieza justo donde caería
  const dir = staffDirection({ from: { x: 0, z: 0 }, length: 1.75, facing, others: [encima] });
  const along = encima.x * dir.x + encima.z * dir.z;
  const aside = Math.abs(encima.x * dir.z - encima.z * dir.x);
  assert.ok(!(along > -0.2 && along < 2.05 && aside < 0.55), `le cae encima: ${JSON.stringify(dir)}`);
});

test('el báculo no se sale del tablero (el rey blanco en g1, con sus peones delante)', () => {
  // Lo que pasó: con el largo mal medido, toda dirección «se salía» y caía por fuera del borde.
  const from = { x: 2.78, z: 3.23 };
  const others = [{ x: 1.5, z: 2.5 }, { x: 2.5, z: 2.5 }, { x: 3.5, z: 2.5 }];
  const dir = staffDirection({ from, length: 1.75, facing: Math.PI, others });
  const end = { x: from.x + dir.x * 1.75, z: from.z + dir.z * 1.75 };
  assert.ok(Math.abs(end.x) <= BOARD_EDGE && Math.abs(end.z) <= BOARD_EDGE, `se sale: ${JSON.stringify(end)}`);
  for (const p of others) {
    const along = (p.x - from.x) * dir.x + (p.z - from.z) * dir.z;
    const aside = Math.abs((p.x - from.x) * dir.z - (p.z - from.z) * dir.x);
    assert.ok(!(along > -0.2 && along < 2.05 && aside < 0.55), `le cae encima a ${JSON.stringify(p)}`);
  }
});

test('el plano general mira desde detrás de los que ganan, hacia el rey vencido', () => {
  const king = { x: 2.5, z: -3.5 };
  const winners = [{ x: -3.5, z: -3.5 }, { x: 2.5, z: 3.5 }, { x: 1.5, z: 2.5 }, { x: 2.5, z: 2.5 }];
  const plan = wideFraming({ king, winners, home: 1, fov: 40, aspect: 1.6 });
  // La cámara, del lado de los que ganan.
  const haciaEllos = { x: plan.winnersAt.x - king.x, z: plan.winnersAt.z - king.z };
  assert.ok(plan.dir.x * haciaEllos.x + plan.dir.z * haciaEllos.z > 0);
  assert.ok(cerca(Math.hypot(plan.dir.x, plan.dir.z), 1));
  // Mira entre él y ellos, más cerca de él.
  const dk = Math.hypot(plan.look.x - king.x, plan.look.z - king.z);
  const dw = Math.hypot(plan.look.x - plan.winnersAt.x, plan.look.z - plan.winnersAt.z);
  assert.ok(dk < dw);
  assert.ok(plan.distance >= 6 && plan.distance <= 10);
});

test('si lo rodean, el plano general sale del lado del tablero del que ganan', () => {
  const king = { x: 0.5, z: -0.5 };
  const winners = [{ x: -0.5, z: -0.5 }, { x: 1.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: 0.5, z: -1.5 }];
  assert.deepEqual(wideFraming({ king, winners, home: 1, fov: 40, aspect: 1.6 }).dir, { x: 0, z: 1 });
  assert.deepEqual(wideFraming({ king, winners, home: -1, fov: 40, aspect: 1.6 }).dir, { x: 0, z: -1 });
});

test('en una pantalla vertical el plano general se aleja más, sin pasarse del máximo', () => {
  const king = { x: 0.5, z: -3.5 };
  const winners = [{ x: -1.5, z: 1.5 }, { x: 2.5, z: 2.5 }];
  const ancho = wideFraming({ king, winners, home: 1, fov: 40, aspect: 1.6 });
  const alto = wideFraming({ king, winners, home: 1, fov: 55, aspect: 0.46 });
  assert.ok(alto.distance >= ancho.distance);
  assert.ok(alto.distance <= 10);
});
