import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pawnMoves } from '../src/rules/pawn.js';

test('blancas: desde la fila 2 puede avanzar una o dos casillas', () => {
  assert.deepEqual(pawnMoves('e2', new Set(['e2']), 'white'), ['e3', 'e4']);
});

test('blancas: fuera de la fila 2 solo avanza una', () => {
  assert.deepEqual(pawnMoves('e3', new Set(['e3']), 'white'), ['e4']);
});

test('una pieza delante lo bloquea del todo', () => {
  assert.deepEqual(pawnMoves('e2', new Set(['e2', 'e3']), 'white'), []);
  assert.deepEqual(pawnMoves('e7', new Set(['e7', 'e6']), 'black'), []);
});

test('una pieza a dos casillas solo impide el salto doble', () => {
  assert.deepEqual(pawnMoves('e2', new Set(['e2', 'e4']), 'white'), ['e3']);
  assert.deepEqual(pawnMoves('e7', new Set(['e7', 'e5']), 'black'), ['e6']);
});

test('en la última fila no puede avanzar', () => {
  assert.deepEqual(pawnMoves('a8', new Set(['a8']), 'white'), []);
  assert.deepEqual(pawnMoves('h1', new Set(['h1']), 'black'), []);
});

test('los peones de otras columnas no estorban', () => {
  assert.deepEqual(pawnMoves('a2', new Set(['a2', 'b3', 'b4']), 'white'), ['a3', 'a4']);
});

test('negras: avanzan hacia la fila 1, dos casillas desde la 7', () => {
  assert.deepEqual(pawnMoves('d7', new Set(['d7']), 'black'), ['d6', 'd5']);
  assert.deepEqual(pawnMoves('d6', new Set(['d6']), 'black'), ['d5']);
});

test('un color desconocido lanza error', () => {
  assert.throws(() => pawnMoves('e2', new Set(), 'green'), /Color no válido/);
});
