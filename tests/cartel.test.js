import test from 'node:test';
import assert from 'node:assert/strict';
import { encajaCartel } from '../src/ui/match-ui.js';

test('un grito corto cabe tal cual; una frase va en dos líneas y, si hace falta, con la letra más pequeña', () => {
  assert.deepEqual(encajaCartel(168, 311), { lineas: 1, escala: 1 }, '¡JAQUE!');
  const frase = encajaCartel(583, 311); // «Bruno rechaza las tablas» en un iPhone
  assert.equal(frase.lineas, 2);
  assert.ok(frase.escala > 0.9 && frase.escala <= 1);
  const larga = encajaCartel(918, 311); // «Se ha perdido la conexión con el rival…»
  assert.equal(larga.lineas, 2);
  assert.ok(918 * larga.escala <= 2 * 311, 'en dos líneas, cabe');
  assert.deepEqual(encajaCartel(400, 500), { lineas: 1, escala: 1 }, 'en un ordenador, en una');
});
