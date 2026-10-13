import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuPlan, personaTemperature } from '../src/chess/cpu-plan.js';
import { ELO_MAX, ELO_MIN } from '../src/chess/stockfish.js';
import { CPU_TOP, cpuRating } from '../src/rating/ratings.js';

test('juega siempre Stockfish, con el libro delante', () => {
  for (let nivel = 1; nivel <= 100; nivel++) {
    const plan = cpuPlan(nivel);
    assert.equal(plan.engine, 'stockfish');
    assert.equal(plan.rating, cpuRating(nivel).r);
    assert.ok(plan.book >= 2 && plan.movetime >= 300);
  }
});

test('por debajo de 1320, como una persona: cuanto más flojo, más se equivoca', () => {
  let antes = Infinity;
  for (let nivel = 1; cpuRating(nivel).r < ELO_MIN; nivel++) {
    const { persona, elo } = cpuPlan(nivel);
    assert.equal(elo, null);
    assert.ok(persona && persona.multipv >= 40, 'puntúa todas');
    assert.ok(persona.temperature < antes, 'menos errores con más nivel');
    antes = persona.temperature;
  }
  // Calibrada: 80 en 1290 (empata casi con Stockfish a 1320) y, cada 530 puntos menos, por e.
  assert.equal(personaTemperature(1290), 80);
  assert.equal(personaTemperature(1290 - 530), Math.round(80 * Math.E));
  assert.ok(personaTemperature(100) > 700 && personaTemperature(ELO_MIN) < 80);
});

test('desde 1320, a la fuerza de su puntuación; en el 100, a toda su fuerza', () => {
  for (let nivel = 1; nivel < 100; nivel++) {
    const { rating, elo, persona } = cpuPlan(nivel);
    if (rating < ELO_MIN) continue;
    assert.equal(persona, null);
    assert.equal(elo, Math.min(ELO_MAX, rating));
  }
  assert.equal(cpuPlan(100).elo, null);
  assert.equal(cpuPlan(100).persona, null);
  assert.equal(cpuRating(100).r, CPU_TOP);
});
