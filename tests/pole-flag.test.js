import test from 'node:test';
import assert from 'node:assert/strict';
import { findPoleAndFlag, meshParts, pinFlagToPole } from '../src/pieces/pole-flag.js';

// Una malla de juguete como la del gigante: un cuerpo grande abajo, un mástil fino que llega más alto que
// nada, y la bandera a 0,1 del mástil (como la del modelo, que flota a unos centímetros del palo). Cada pieza,
// atada a su hueso: el cuerpo al 0, el mástil al 1 y la bandera al 2.
function malla() {
  const positions = [];
  const index = [];
  const skinIndex = [];
  const skinWeight = [];
  const quad = (a, b, c, d, bone) => {
    const base = positions.length / 3;
    for (const v of [a, b, c, d]) {
      positions.push(...v);
      skinIndex.push(bone, 0, 0, 0);
      skinWeight.push(1, 0, 0, 0);
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  quad([-1, 0, 0], [1, 0, 0], [1, 0.8, 0], [-1, 0.8, 0], 0); // el cuerpo
  quad([0, 0.5, 0], [0.02, 0.5, 0], [0.02, 1.5, 0], [0, 1.5, 0], 1); // el mástil, fino y vertical
  quad([0.12, 1.1, 0], [0.5, 1.1, 0], [0.5, 1.4, 0], [0.12, 1.4, 0], 2); // la bandera, separada
  return {
    positions: Float32Array.from(positions),
    index: Uint16Array.from(index),
    skinIndex: Uint16Array.from(skinIndex),
    skinWeight: Float32Array.from(skinWeight),
  };
}

test('las piezas sueltas de una malla son las que no comparten triángulos ni sitio', () => {
  const m = malla();
  assert.equal(meshParts(m.positions, m.index).length, 3);
});

test('el mástil es la pieza fina que llega más alto, y la bandera la que tiene más cerca', () => {
  const m = malla();
  const { pole, flag, gap } = findPoleAndFlag(m.positions, m.index);
  assert.deepEqual([...pole].sort((a, b) => a - b), [4, 5, 6, 7]);
  assert.deepEqual([...flag].sort((a, b) => a - b), [8, 9, 10, 11]);
  // De vértice a vértice: aquí el par más cercano está en diagonal (la esquina de la bandera y lo alto del palo).
  assert.ok(Math.abs(gap - Math.hypot(0.1, 0.1)) < 1e-6, `hueco ${gap}`);
});

test('la bandera se arrima al mástil y se ata a su hueso; el cuerpo no se toca', () => {
  const m = malla();
  const cuerpo = Array.from(m.positions.slice(0, 12));
  const hecho = pinFlagToPole(m);
  assert.ok(hecho);
  // El borde de la bandera que daba al palo, ya dentro del palo (entre su superficie y su eje).
  const xs = [8, 9, 10, 11].map((i) => m.positions[i * 3]);
  assert.ok(Math.min(...xs) <= 0.02 + 1e-6 && Math.min(...xs) >= 0, `borde en x=${Math.min(...xs)}`);
  // Sin deformarse: sigue midiendo lo mismo.
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 0.38) < 1e-5);
  // Atada al hueso del mástil.
  for (const i of [8, 9, 10, 11]) {
    assert.equal(m.skinIndex[i * 4], 1);
    assert.equal(m.skinWeight[i * 4], 1);
  }
  assert.deepEqual(Array.from(m.positions.slice(0, 12)), cuerpo);
  for (const i of [0, 1, 2, 3]) assert.equal(m.skinIndex[i * 4], 0);
});

test('si la pieza que llega más alto no es fina, no hay mástil', () => {
  const m = malla();
  assert.equal(findPoleAndFlag(m.positions, m.index, { maxPoleVerts: 2 }), null);
});
