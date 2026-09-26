import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slideAboveFloor } from '../src/pieces/grip.js';

test('no desliza la lanza si su extremo más bajo queda por encima del suelo', () => {
  assert.equal(slideAboveFloor({ lowY: 0.4, floorY: 0.26, axisY: 1 }), 0);
});

test('sube una lanza vertical lo que se hunde su regatón', () => {
  assert.ok(Math.abs(slideAboveFloor({ lowY: -0.1, floorY: 0.26, axisY: 1 }) - 0.36) < 1e-9);
});

test('con la punta hacia abajo desliza hacia el regatón para sacar la punta', () => {
  assert.ok(Math.abs(slideAboveFloor({ lowY: 0.1, floorY: 0.26, axisY: -1 }) + 0.16) < 1e-9);
});

test('una lanza inclinada se desliza más para subir lo mismo', () => {
  assert.ok(Math.abs(slideAboveFloor({ lowY: 0.16, floorY: 0.26, axisY: 0.5 }) - 0.2) < 1e-9);
});

test('una lanza casi horizontal no se desliza', () => {
  assert.equal(slideAboveFloor({ lowY: 0, floorY: 0.26, axisY: 0.1 }), 0);
});

test('nunca desliza más del máximo', () => {
  assert.equal(slideAboveFloor({ lowY: -2, floorY: 0.26, axisY: 1, maxSlide: 0.5 }), 0.5);
  assert.equal(slideAboveFloor({ lowY: -2, floorY: 0.26, axisY: -1, maxSlide: 0.5 }), -0.5);
});

