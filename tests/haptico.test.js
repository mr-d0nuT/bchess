import test from 'node:test';
import assert from 'node:assert/strict';
import { createHaptico } from '../src/ui/haptico.js';

test('vibra con el navegador donde lo hay (Android), y en el ordenador, no', () => {
  const pedidas = [];
  const android = createHaptico({ nav: { vibrate: (ms) => pedidas.push(ms), userAgent: 'Android' }, tactil: true });
  assert.equal(android.puede, true);
  android.vibra(40);
  android.vibra([60, 40, 60]);
  assert.deepEqual(pedidas, [40, [60, 40, 60]]);
  const mac = createHaptico({ nav: { userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0 }, tactil: false });
  assert.equal(mac.puede, false);
  mac.vibra(40); // no hace nada
});

test('en el iPhone (sin vibrate), marca un interruptor escondido: el toque háptico de iOS 18', () => {
  const clics = [];
  const creado = [];
  const doc = {
    createElement: (tag) => {
      const el = { tag, style: {}, attrs: {}, hijos: [], setAttribute(k, v) { this.attrs[k] = v; }, append(h) { this.hijos.push(h); }, click() { clics.push(tag); } };
      creado.push(el);
      return el;
    },
    body: { append: () => {} },
  };
  const iphone = createHaptico({ nav: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }, doc, tactil: false });
  assert.equal(iphone.puede, true);
  iphone.vibra(40);
  iphone.vibra(40);
  assert.deepEqual(clics, ['label', 'label']);
  const input = creado.find((e) => e.tag === 'input');
  assert.equal(input.type, 'checkbox');
  assert.equal('switch' in input.attrs, true);
  assert.equal(creado.filter((e) => e.tag === 'label').length, 1, 'el mismo interruptor siempre');
});
