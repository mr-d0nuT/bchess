import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIME_CONTROLS, createChessClock, findTimeControl, formatClock } from '../src/chess/timecontrol.js';

test('los ritmos de siempre, con sus nombres', () => {
  const nombres = TIME_CONTROLS.map((c) => c.name);
  assert.deepEqual(nombres, ['Sin límite', 'Bala', 'Blitz', 'Rápida', 'Diaria']);
  assert.deepEqual(TIME_CONTROLS.find((c) => c.id === 'blitz').options.map((o) => o.id), ['3', '3+2', '5']);
  assert.equal(findTimeControl('libre:libre'), null);
  const blitz = findTimeControl('blitz:3+2');
  assert.equal(blitz.base, 180000);
  assert.equal(blitz.inc, 2000);
  assert.equal(blitz.category, 'Blitz');
  assert.equal(findTimeControl('diaria:3d').perMove, 3 * 24 * 3600 * 1000);
  assert.equal(findTimeControl('nada:1'), null);
});

test('solo corre el reloj del que mueve, y al pulsar se pasa al otro', () => {
  const c = createChessClock({ base: 60000 });
  c.start('white', 0);
  assert.equal(c.remaining('white', 5000), 55000);
  assert.equal(c.remaining('black', 5000), 60000);
  assert.equal(c.press('black', 6000), false, 'no pulsa quien no mueve');
  assert.equal(c.press('white', 6000), true);
  assert.equal(c.running, 'black');
  assert.equal(c.remaining('white', 9000), 54000);
  assert.equal(c.remaining('black', 9000), 57000);
});

test('el incremento se lo lleva quien pulsa', () => {
  const c = createChessClock({ base: 60000, inc: 2000 });
  c.start('white', 0);
  c.press('white', 10000);
  assert.equal(c.remaining('white', 10000), 52000);
});

test('en pausa no corre (las animaciones no cuentan)', () => {
  const c = createChessClock({ base: 60000 });
  c.start('white', 0);
  c.pause(1000);
  assert.equal(c.remaining('white', 30000), 59000);
  c.resume(30000);
  assert.equal(c.remaining('white', 31000), 58000);
});

test('se le cae la bandera a quien se queda sin tiempo', () => {
  const c = createChessClock({ base: 3000 });
  c.start('white', 0);
  assert.equal(c.flagged(2999), null);
  assert.equal(c.flagged(3000), 'white');
  assert.equal(c.remaining('white', 5000), 0);
});

test('la diaria es un plazo por jugada', () => {
  const dia = 24 * 3600 * 1000;
  const c = createChessClock({ perMove: dia });
  c.start('white', 0);
  c.press('white', 5 * 3600 * 1000);
  assert.equal(c.remaining('black', 5 * 3600 * 1000), dia, 'el otro empieza con el plazo entero');
  c.press('black', 6 * 3600 * 1000);
  assert.equal(c.remaining('white', 6 * 3600 * 1000), dia, 'y al volver, el primero también');
});

test('cómo se lee en la pantalla', () => {
  assert.equal(formatClock(180000), '3:00');
  assert.equal(formatClock(59000), '0:59');
  assert.equal(formatClock(9800), '0:09.8');
  assert.equal(formatClock(0), '0:00.0');
  assert.equal(formatClock(3600000), '1:00:00');
  assert.equal(formatClock(30 * 60000), '30:00');
  assert.equal(formatClock(3 * 24 * 3600000), '3d 00h');
  assert.equal(formatClock(2 * 24 * 3600000 + 23 * 3600000), '2d 23h');
});
