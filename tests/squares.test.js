import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareToPosition, positionToSquare } from '../src/scene/squares.js';

test('e2 está en x=0.5, z=2.5', () => {
  assert.deepEqual(squareToPosition('e2'), { x: 0.5, z: 2.5 });
});

test('a1 y h8 son esquinas opuestas', () => {
  assert.deepEqual(squareToPosition('a1'), { x: -3.5, z: 3.5 });
  assert.deepEqual(squareToPosition('h8'), { x: 3.5, z: -3.5 });
});

test('ida y vuelta de las 64 casillas', () => {
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank++) {
      const square = file + rank;
      const { x, z } = squareToPosition(square);
      assert.equal(positionToSquare(x, z), square);
    }
  }
});

test('un punto dentro de la casilla da esa casilla', () => {
  assert.equal(positionToSquare(0.9, 2.1), 'e2');
});

test('fuera del tablero da null', () => {
  assert.equal(positionToSquare(4.2, 0), null);
  assert.equal(positionToSquare(0, -4.5), null);
});

test('casilla no válida lanza error', () => {
  assert.throws(() => squareToPosition('i9'), /Casilla no válida/);
});
