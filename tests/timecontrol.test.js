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

test('al continuar una partida guardada, cada reloj sigue con lo que le quedaba', () => {
  const c = createChessClock({ base: 180000, inc: 2000 });
  c.restore({ white: 95000, black: 41000 });
  c.start('black', 1000);
  assert.equal(c.remaining('white', 4000), 95000);
  assert.equal(c.remaining('black', 4000), 38000);
  c.press('black', 4000);
  assert.equal(c.remaining('black', 4000), 40000, 'con su incremento');
});

test('la CPU gasta su tiempo como una persona: en «1 | 1» su reloj baja, y nunca se lo funde de golpe', async () => {
  const { cpuMoveTime, findTimeControl } = await import('../src/chess/timecontrol.js');
  const control = findTimeControl('bala:1+1');
  // Mitad de partida, tiempo entero: entre el 60 y el 150 % de lo que le toca (1,35 s de reparto + 0,9 del incremento).
  const lento = cpuMoveTime(control, { remaining: 60000, ply: 20, random: () => 1 });
  const rapido = cpuMoveTime(control, { remaining: 60000, ply: 20, random: () => 0 });
  assert.ok(Math.abs(lento - 2250 * 1.5) < 1e-6 && Math.abs(rapido - 2250 * 0.6) < 1e-6, `${rapido} ${lento}`);
  // De media gasta más que el incremento: su reloj baja.
  let queda = 60000;
  for (let ply = 0; ply < 60; ply += 2) queda += 1000 - cpuMoveTime(control, { remaining: queda, ply, random: () => 0.5 });
  assert.ok(queda < 45000, `le quedan ${queda}`);
  // Con poco tiempo, nunca más del 30 % de lo que le queda.
  assert.ok(cpuMoveTime(control, { remaining: 2000, ply: 40, random: () => 1 }) <= 600);
  // Sin reloj, o en la diaria, nada que administrar.
  assert.equal(cpuMoveTime(findTimeControl('diaria:1d'), { remaining: 86400000 }), null);
});
