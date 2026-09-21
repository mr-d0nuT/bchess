import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bishopMoves } from '../src/rules/bishop.js';

const set = (...squares) => new Set(squares);

test('desde el centro llega a las cuatro diagonales', () => {
  const { moves, captures } = bishopMoves('d4', set('d4'), set());
  assert.equal(captures.length, 0);
  assert.equal(moves.length, 13);
  for (const square of ['e5', 'f6', 'g7', 'h8', 'e3', 'f2', 'g1', 'c3', 'b2', 'a1', 'c5', 'b6', 'a7']) {
    assert.ok(moves.includes(square), `falta ${square}`);
  }
});

test('desde una esquina solo tiene una diagonal', () => {
  const { moves } = bishopMoves('a1', set('a1'), set());
  assert.deepEqual(moves, ['b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']);
});

test('una pieza propia le corta el paso y no se come', () => {
  const { moves, captures } = bishopMoves('c1', set('c1', 'e3'), set());
  assert.ok(moves.includes('d2'));
  assert.ok(!moves.includes('e3'));
  assert.ok(!moves.includes('f4'));
  assert.equal(captures.length, 0);
});

test('se come la primera pieza enemiga de la diagonal y ahí se para', () => {
  const { moves, captures } = bishopMoves('c1', set('c1', 'f4'), set('f4'));
  assert.deepEqual(captures, ['f4']);
  assert.ok(moves.includes('d2'));
  assert.ok(moves.includes('e3'));
  assert.ok(!moves.includes('g5'));
});

test('no se mueve en línea recta', () => {
  const { moves } = bishopMoves('d4', set('d4'), set());
  for (const square of ['d5', 'd3', 'c4', 'e4']) assert.ok(!moves.includes(square), `no debería llegar a ${square}`);
});

test('una casilla que no existe es un error', () => {
  assert.throws(() => bishopMoves('j9', set(), set()), /Casilla no válida/);
});
