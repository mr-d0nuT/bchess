import test from 'node:test';
import assert from 'node:assert/strict';
import { queenMoves } from '../src/rules/queen.js';
import { rookMoves } from '../src/rules/rook.js';
import { bishopMoves } from '../src/rules/bishop.js';

const vacío = new Set();

test('en un tablero vacío, desde el centro alcanza 27 casillas', () => {
  const { moves } = queenMoves('d4', vacío, vacío);
  assert.equal(moves.length, 27); // 14 en línea recta y 13 en diagonal
});

test('es exactamente la torre más el alfil', () => {
  const ocupadas = new Set(['d6', 'f4']);
  const enemigas = new Set(['b2', 'd2']);
  const reina = queenMoves('d4', ocupadas, enemigas);
  const torre = rookMoves('d4', ocupadas, enemigas);
  const alfil = bishopMoves('d4', ocupadas, enemigas);
  assert.deepEqual([...reina.moves].sort(), [...torre.moves, ...alfil.moves].sort());
  assert.deepEqual([...reina.captures].sort(), [...torre.captures, ...alfil.captures].sort());
});

test('se para antes de una pieza propia y se come a la enemiga', () => {
  const { moves, captures } = queenMoves('d1', new Set(['d3']), new Set(['f3']));
  assert.ok(moves.includes('d2'));
  assert.ok(!moves.includes('d3'));
  assert.ok(!moves.includes('d4'));
  assert.ok(captures.includes('f3'));
  assert.ok(!moves.includes('g4')); // detrás de la enemiga, ya no sigue
});

test('desde una esquina alcanza 21 casillas', () => {
  assert.equal(queenMoves('a1', vacío, vacío).moves.length, 21);
});

test('una casilla que no existe da error', () => {
  assert.throws(() => queenMoves('j9', vacío, vacío), /Casilla no válida/);
});
