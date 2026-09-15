import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rookMoves } from '../src/rules/rook.js';

test('en un tablero vacío llega a los cuatro bordes', () => {
  assert.deepEqual(rookMoves('d4', new Set(['d4']), new Set()), {
    moves: ['d5', 'd6', 'd7', 'd8', 'd3', 'd2', 'd1', 'e4', 'f4', 'g4', 'h4', 'c4', 'b4', 'a4'],
    captures: [],
  });
});

test('una pieza propia la detiene justo antes', () => {
  assert.deepEqual(rookMoves('a1', new Set(['a1', 'a2', 'd1']), new Set()), { moves: ['b1', 'c1'], captures: [] });
});

test('come la primera pieza enemiga de cada dirección, no las de detrás', () => {
  assert.deepEqual(
    rookMoves('a1', new Set(['a1', 'a4', 'a5', 'c1']), new Set(['a4', 'a5', 'c1'])),
    { moves: ['a2', 'a3', 'b1'], captures: ['a4', 'c1'] },
  );
});

test('desde una esquina no se sale del tablero', () => {
  assert.deepEqual(rookMoves('h8', new Set(['h8']), new Set()), {
    moves: ['h7', 'h6', 'h5', 'h4', 'h3', 'h2', 'h1', 'g8', 'f8', 'e8', 'd8', 'c8', 'b8', 'a8'],
    captures: [],
  });
});

test('una casilla no válida lanza error', () => {
  assert.throws(() => rookMoves('i9', new Set(), new Set()), /Casilla no válida/);
});
