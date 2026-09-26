import assert from 'node:assert/strict';
import test from 'node:test';
import { FALANGES, bestAngle } from '../src/pieces/grip.js';

// `bestAngle` es el buscador con el que cada dedo averigua cuánto tiene que cerrarse: no hay
// fórmula (lo que mide es la punta del dedo dando una vuelta), así que se barre. Aquí se prueba
// contra funciones de juguete, que es lo único que se puede comprobar sin un esqueleto delante.

test('bestAngle encuentra el ángulo que da el valor pedido', () => {
  const { angulo } = bestAngle((a) => a / 2, 30);
  assert.equal(angulo, 60);
});

test('bestAngle afina de grado en grado, no solo el barrido grueso', () => {
  const { angulo, error } = bestAngle((a) => a, 37);
  assert.equal(angulo, 37); // el grueso va de cuatro en cuatro: sin afinar habría dado 36 o 40
  assert.equal(error, 0);
});

test('bestAngle no se sale del tope ni busca ángulos negativos', () => {
  // Un dedo solo se dobla hacia la palma: si el objetivo queda del otro lado, se queda quieto.
  assert.equal(bestAngle((a) => a, -50).angulo, 0);
  assert.equal(bestAngle((a) => a, 999, { tope: 90 }).angulo, 90);
});

test('bestAngle se queda con el más cercano cuando no hay ninguno exacto', () => {
  const { angulo } = bestAngle((a) => (a < 50 ? 0 : 100), 40);
  assert.equal(angulo, 0); // 40 está más cerca de 0 que de 100
});

test('las falanges cierran de más a menos hacia la punta, y la del medio es la que más', () => {
  assert.equal(FALANGES.length, 3);
  assert.ok(FALANGES[1] > FALANGES[0]);
  assert.ok(FALANGES[2] < FALANGES[0]);
});
