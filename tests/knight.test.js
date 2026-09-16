import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knightMoves } from '../src/rules/knight.js';

test('desde el centro salta a las ocho casillas en L', () => {
  assert.deepEqual(knightMoves('d4', new Set(['d4']), new Set()), {
    moves: ['e6', 'f5', 'f3', 'e2', 'c2', 'b3', 'b5', 'c6'],
    captures: [],
  });
});

test('desde una esquina y un borde no se sale del tablero', () => {
  assert.deepEqual(knightMoves('a1', new Set(['a1']), new Set()), { moves: ['b3', 'c2'], captures: [] });
  assert.deepEqual(knightMoves('h5', new Set(['h5']), new Set()), { moves: ['g3', 'f4', 'f6', 'g7'], captures: [] });
});

test('salta por encima de las piezas; solo le para una propia en la casilla de llegada', () => {
  const occupied = new Set(['b1', 'a1', 'c1', 'a2', 'b2', 'c2', 'd2']);
  assert.deepEqual(knightMoves('b1', occupied, new Set()), { moves: ['c3', 'a3'], captures: [] });
});

test('come a un enemigo en la casilla de llegada', () => {
  assert.deepEqual(knightMoves('b1', new Set(['b1', 'c3', 'a3', 'd2']), new Set(['c3'])), { moves: [], captures: ['c3'] });
});

test('una casilla no válida lanza error', () => {
  assert.throws(() => knightMoves('z0', new Set(), new Set()), /Casilla no válida/);
});
