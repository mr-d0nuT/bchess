import test from 'node:test';
import assert from 'node:assert/strict';
import { kingMoves } from '../src/rules/king.js';

const vacío = new Set();

test('en el centro del tablero alcanza sus ocho vecinas', () => {
  const { moves } = kingMoves('d4', vacío, vacío);
  assert.equal(moves.length, 8);
  assert.deepEqual([...moves].sort(), ['c3', 'c4', 'c5', 'd3', 'd5', 'e3', 'e4', 'e5']);
});

test('en una esquina solo le quedan tres', () => {
  assert.equal(kingMoves('a1', vacío, vacío).moves.length, 3);
  assert.equal(kingMoves('h8', vacío, vacío).moves.length, 3);
});

test('no entra donde hay una pieza suya, y se come a la enemiga', () => {
  const { moves, captures } = kingMoves('e1', new Set(['d1', 'e2']), new Set(['f2']));
  assert.ok(!moves.includes('d1'));
  assert.ok(!moves.includes('e2'));
  assert.ok(captures.includes('f2'));
  assert.ok(moves.includes('f1'));
});

test('solo una casilla: no llega a la de más allá', () => {
  const { moves } = kingMoves('d4', vacío, vacío);
  assert.ok(!moves.includes('d6'));
  assert.ok(!moves.includes('b4'));
});

test('una casilla que no existe da error', () => {
  assert.throws(() => kingMoves('z9', vacío, vacío), /Casilla no válida/);
});
