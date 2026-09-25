import test from 'node:test';
import assert from 'node:assert/strict';
import { CAPE_BONES, capePose, capeRest, capeStep } from '../src/pieces/cape.js';

// Deja correr la simulación `seconds` con el mismo movimiento, a 60 por segundo.
function correr(movimiento, seconds, state = capeRest()) {
  for (let i = 0; i < Math.round(seconds * 60); i++) state = capeStep(state, { ...movimiento, dt: 1 / 60 });
  return state;
}

test('quieta, la capa cuelga a plomo', () => {
  const state = correr({}, 2);
  assert.ok(Math.abs(state.pitch) < 1e-6);
  assert.ok(Math.abs(state.roll) < 1e-6);
});

test('al andar hacia delante la capa se queda atrás', () => {
  assert.ok(correr({ forward: 1.3 }, 1).pitch < -5);
});

test('y cuanto más deprisa, más atrás', () => {
  assert.ok(correr({ forward: 2 }, 1).pitch < correr({ forward: 1 }, 1).pitch);
});

test('al parar, la capa sigue y se pasa de frenada antes de quedarse quieta', () => {
  const andando = correr({ forward: 1.5 }, 1);
  const justoAlParar = capeStep(andando, { dt: 1 / 60 });
  assert.ok(justoAlParar.pitchRate > 0, 'vuelve hacia delante');
  const luego = correr({}, 3, andando);
  assert.ok(Math.abs(luego.pitch) < 0.5, 'y acaba a plomo');
});

test('al girar sale volando hacia el lado de fuera', () => {
  assert.ok(correr({ turn: 0.5 }, 0.6).roll < -3);
  assert.ok(correr({ turn: -0.5 }, 0.6).roll > 3);
});

test('no se levanta más de lo que se levanta una capa', () => {
  const state = correr({ forward: 40, turn: 20 }, 2);
  assert.ok(Math.abs(state.pitch) <= 38 && Math.abs(state.roll) <= 38);
});

test('un fotograma perdido no manda la capa a la luna', () => {
  const salto = capeStep(capeRest(), { forward: 2, dt: 0.5 });
  const poquito = correr({ forward: 2 }, 0.5);
  assert.ok(Math.abs(salto.pitch - poquito.pitch) < 6, 'un salto largo se parte en trozos');
});

test('sin tiempo no pasa nada', () => {
  const state = capeRest();
  assert.equal(capeStep(state, { forward: 3, dt: 0 }), state);
});

test('la cadena reparte el vaivén entre los tres huesos, de más a menos', () => {
  const pose = capePose({ pitch: 30, roll: 10 }, 1);
  assert.equal(pose.length, CAPE_BONES.length);
  assert.ok(pose[0].x > pose[1].x && pose[1].x > pose[2].x);
  assert.ok(Math.abs(pose.reduce((s, p) => s + p.x, 0) - 30) < 1e-9, 'entre los tres suman el ángulo');
});

test('`amount` sube y baja el vuelo sin cambiar su forma', () => {
  assert.ok(Math.abs(capePose({ pitch: 20, roll: 0 }, 1)[0].x / 2 - capePose({ pitch: 20, roll: 0 }, 0.5)[0].x) < 1e-9);
});

test('al andar, la capa se balancea al compás de los pasos aunque no se mueva del sitio', () => {
  const unLado = correr({ step: 0.25 }, 0.5);
  const elOtro = correr({ step: 0.75 }, 0.5);
  assert.ok(unLado.roll > 1, 'con la cadera a un lado, la capa se va a ese lado');
  assert.ok(Math.abs(unLado.roll + elOtro.roll) < 1e-6, 'y al medio ciclo, al contrario');
});

test('el vaivén de los pasos se suma al de andar, no lo sustituye', () => {
  const soloAndar = correr({ forward: 1.2 }, 1);
  const conPasos = correr({ forward: 1.2, step: 0.25 }, 1);
  assert.ok(Math.abs(conPasos.pitch - soloAndar.pitch) < 4, 'sigue quedándose atrás igual');
  assert.ok(conPasos.roll > soloAndar.roll, 'y además se va de lado');
});
