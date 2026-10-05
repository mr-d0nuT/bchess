import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, TEXTS } from '../src/i18n.js';

// Los huecos de un texto («{nombre}», «{n}»), que cada idioma ha de tener iguales: si falta uno, el nombre
// del rival no sale; si sobra, sale vacío.
const huecos = (texto) => [...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('cada idioma tiene todos los textos del español, con los mismos huecos, y ninguno de más', () => {
  const claves = Object.keys(TEXTS.es);
  for (const { id } of LANGUAGES) {
    const textos = TEXTS[id];
    assert.ok(textos, `falta el idioma ${id}`);
    for (const clave of claves) {
      assert.equal(typeof textos[clave], 'string', `${id}: falta «${clave}»`);
      assert.deepEqual(huecos(textos[clave]), huecos(TEXTS.es[clave]), `${id}: «${clave}» con otros huecos`);
    }
    assert.deepEqual(Object.keys(textos).filter((clave) => !(clave in TEXTS.es)), [], `${id}: textos que el español no tiene`);
  }
});
