import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whitePawnMoves } from '../src/rules/pawn.js';

test('desde la fila 2 puede avanzar una o dos casillas', () => {
  assert.deepEqual(whitePawnMoves('e2', new Set(['e2'])), ['e3', 'e4']);
});

test('fuera de la fila 2 solo avanza una', () => {
  assert.deepEqual(whitePawnMoves('e3', new Set(['e3'])), ['e4']);
});

test('una pieza delante lo bloquea del todo', () => {
  assert.deepEqual(whitePawnMoves('e2', new Set(['e2', 'e3'])), []);
});

test('una pieza a dos casillas solo impide el salto doble', () => {
  assert.deepEqual(whitePawnMoves('e2', new Set(['e2', 'e4'])), ['e3']);
});

test('en la fila 8 no puede avanzar', () => {
  assert.deepEqual(whitePawnMoves('a8', new Set(['a8'])), []);
});

test('los peones de otras columnas no estorban', () => {
  assert.deepEqual(whitePawnMoves('a2', new Set(['a2', 'b3', 'b4'])), ['a3', 'a4']);
});
