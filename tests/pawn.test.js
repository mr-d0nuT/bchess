import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pawnCaptures, pawnMoves } from '../src/rules/pawn.js';

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

test('capturas: en diagonal hacia delante, solo si hay un enemigo', () => {
  assert.deepEqual(pawnCaptures('d4', new Set(['c5', 'e5']), 'white'), ['c5', 'e5']);
  assert.deepEqual(pawnCaptures('d4', new Set(['d5', 'c3', 'e3']), 'white'), []);
  assert.deepEqual(pawnCaptures('e5', new Set(['d4', 'f4']), 'black'), ['d4', 'f4']);
  assert.deepEqual(pawnCaptures('e5', new Set(['d6', 'f6']), 'black'), []);
});

test('capturas en los bordes del tablero', () => {
  assert.deepEqual(pawnCaptures('a2', new Set(['b3']), 'white'), ['b3']);
  assert.deepEqual(pawnCaptures('h7', new Set(['g6']), 'black'), ['g6']);
});

test('sin capturas desde la última fila; color desconocido, error', () => {
  assert.deepEqual(pawnCaptures('c8', new Set(['b9', 'd9']), 'white'), []);
  assert.throws(() => pawnCaptures('e2', new Set(), 'green'), /Color no válido/);
});
