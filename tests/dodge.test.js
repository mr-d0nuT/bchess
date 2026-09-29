import test from 'node:test';
import assert from 'node:assert/strict';
import { clashes, gridOf, pickPair, pickTurn, place, touches } from '../src/moves/dodge.js';

// Un «caballo» de juguete: una vara de puntos a la altura de la cabeza, del rabo (-0,74) al hocico (0,86),
// mirando a +z en su marco.
function horse() {
  const points = [];
  for (let z = -0.74; z <= 0.86 + 1e-9; z += 0.02) points.push(0, 1.2, z);
  return points;
}

// Un «poste» macizo de radio `radius` en (x, z), entre y = 0,5 y 1,6.
function pole(x, z, radius = 0.2) {
  const points = [];
  for (let px = -radius; px <= radius + 1e-9; px += 0.02) {
    for (let pz = -radius; pz <= radius + 1e-9; pz += 0.02) {
      if (px * px + pz * pz > radius * radius) continue;
      for (let y = 0.5; y <= 1.6 + 1e-9; y += 0.05) points.push(x + px, y, z + pz);
    }
  }
  return points;
}

test('colocar una nube sigue el convenio de three: con π/2, lo de delante queda hacia +x', () => {
  const [x, y, z] = place([0, 1, 1], { x: 2, z: 3 }, Math.PI / 2);
  assert.ok(Math.abs(x - 3) < 1e-6 && y === 1 && Math.abs(z - 3) < 1e-6);
});

test('la rejilla encuentra lo que está cerca y no lo que está lejos', () => {
  const grid = gridOf([0, 1, 0, 1, 1, 1]);
  assert.equal(touches(grid, 0.01, 1, 0), true);
  assert.equal(touches(grid, 0.5, 1, 0.5), false);
  assert.equal(touches(grid, -0.005, 1.005, -0.005), true, 'también a través de la frontera de una celda');
});

test('sin nada delante, el caballo mira al frente', () => {
  const grid = gridOf(pole(3, 3));
  assert.equal(pickTurn({ own: horse(), center: { x: 0, z: 0 }, yaw: 0, grid }), 0);
});

test('con una pieza justo delante, se gira lo justo, primero a su derecha', () => {
  const grid = gridOf(pole(0, 1));
  const turn = pickTurn({ own: horse(), center: { x: 0, z: 0 }, yaw: 0, grid });
  assert.equal(turn, 15);
});

test('si a su derecha también estorba, se gira a la izquierda', () => {
  // Mirando a +z, su derecha es -x: un poste delante y otro delante a la derecha.
  const grid = gridOf([...pole(0, 1), ...pole(-0.3, 0.8)]);
  const turn = pickTurn({ own: horse(), center: { x: 0, z: 0 }, yaw: 0, grid });
  assert.ok(turn < 0, `giro ${turn}`);
});

test('si nada queda limpio, el giro que menos mete', () => {
  const grid = gridOf(pole(0, 0, 1)); // un poste que lo envuelve entero
  const turn = pickTurn({ own: horse(), center: { x: 0, z: 0 }, yaw: 0, grid, turns: [0, 15] });
  assert.ok([0, 15].includes(turn));
});

test('dos caballos hocico con hocico se apartan a la vez, lo justo', () => {
  const vacio = gridOf([]);
  const a = { own: horse(), center: { x: 0, z: 0 }, yaw: 0, grid: vacio };
  const b = { own: horse(), center: { x: 0, z: 1 }, yaw: Math.PI, grid: vacio };
  const par = pickPair({ a, b });
  assert.ok(par && (par[0] !== 0 || par[1] !== 0), `pareja ${par}`);
  const [ta, tb] = par;
  const gridB = gridOf(place(b.own, b.center, b.yaw - (tb * Math.PI) / 180));
  assert.equal(clashes({ own: a.own, center: a.center, yaw: a.yaw - (ta * Math.PI) / 180, grid: gridB }), false);
});

test('si la pareja no tiene salida, null', () => {
  const lleno = gridOf(pole(0, 0.5, 1.5));
  const a = { own: horse(), center: { x: 0, z: 0 }, yaw: 0, grid: lleno };
  const b = { own: horse(), center: { x: 0, z: 1 }, yaw: Math.PI, grid: lleno };
  assert.equal(pickPair({ a, b, turns: [0, 15] }), null);
});
