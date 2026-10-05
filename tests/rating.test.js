import test from 'node:test';
import assert from 'node:assert/strict';
import { ageDeviation, expectedScore, rate } from '../src/rating/glicko2.js';
import { START, applyGame, categoryOf, cpuRating, createRatings, isProvisional, shown } from '../src/rating/ratings.js';

const cerca = (a, b, tol) => Math.abs(a - b) <= tol;

test('Glicko-2: el ejemplo del artículo de Glickman, al decimal', () => {
  const jugador = { r: 1500, rd: 200, vol: 0.06 };
  const partidas = [
    { r: 1400, rd: 30, score: 1 },
    { r: 1550, rd: 100, score: 0 },
    { r: 1700, rd: 300, score: 0 },
  ];
  const nuevo = rate(jugador, partidas);
  assert.ok(cerca(nuevo.r, 1464.06, 0.05), `r = ${nuevo.r}`);
  assert.ok(cerca(nuevo.rd, 151.52, 0.05), `rd = ${nuevo.rd}`);
  assert.ok(cerca(nuevo.vol, 0.05999, 0.00001), `vol = ${nuevo.vol}`);
});

test('ganar a uno mejor da más que ganar a uno peor; perder con uno peor quita más', () => {
  const yo = { r: 1500, rd: 80, vol: 0.06 };
  const aUnoMejor = rate(yo, [{ r: 1800, rd: 80, score: 1 }]).r - 1500;
  const aUnoPeor = rate(yo, [{ r: 1200, rd: 80, score: 1 }]).r - 1500;
  assert.ok(aUnoMejor > aUnoPeor && aUnoPeor > 0);
  const conUnoPeor = 1500 - rate(yo, [{ r: 1200, rd: 80, score: 0 }]).r;
  const conUnoMejor = 1500 - rate(yo, [{ r: 1800, rd: 80, score: 0 }]).r;
  assert.ok(conUnoPeor > conUnoMejor && conUnoMejor > 0);
  assert.ok(cerca(expectedScore({ r: 1500 }, { r: 1500, rd: 50 }), 0.5, 1e-9));
});

test('el que empieza se mueve mucho; el que ya tiene puntuación fiable, poco', () => {
  const nuevo = applyGame(START, { r: 1200, rd: 350 }, 1, 0);
  assert.ok(nuevo.r - START.r > 100, `+${nuevo.r - START.r}`);
  const veterano = applyGame({ r: 1500, rd: 50, vol: 0.06 }, { r: 1500, rd: 50 }, 1, 0);
  assert.ok(veterano.r - 1500 > 2 && veterano.r - 1500 < 15, `+${veterano.r - 1500}`);
});

test('sin jugar, se fía menos de la puntuación, sin pasar del principio', () => {
  const jugador = { rd: 60, vol: 0.06 };
  assert.ok(ageDeviation(jugador, 100) > 60);
  assert.ok(ageDeviation(jugador, 100) > ageDeviation(jugador, 10));
  assert.equal(ageDeviation(jugador, 1e9), 350);
  assert.equal(ageDeviation(jugador, 0), 60);
});

test('categorías: online por ritmo, la CPU aparte y el uno contra uno, local', () => {
  assert.equal(categoryOf({ mode: 'online', time: 'bala:1+1' }), 'bala');
  assert.equal(categoryOf({ mode: 'online', time: 'blitz:3+2' }), 'blitz');
  assert.equal(categoryOf({ mode: 'online', time: 'rapida:10' }), 'rapida');
  assert.equal(categoryOf({ mode: 'online', time: 'libre:libre' }), 'rapida');
  assert.equal(categoryOf({ mode: 'online', time: 'diaria:1d' }), 'diaria');
  assert.equal(categoryOf({ mode: 'cpu', time: 'bala:1' }), 'cpu');
  assert.equal(categoryOf({ mode: 'pvp' }), 'local');
  assert.deepEqual(cpuRating(1), { r: 400, rd: 60 });
  assert.deepEqual(cpuRating(100), { r: 2400, rd: 60 });
  assert.ok(cpuRating(50).r > cpuRating(49).r);
});

function almacenFalso() {
  const datos = new Map();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)), datos };
}

test('el almacén: empieza en 1200 provisional, suma la partida y lo guarda', () => {
  const storage = almacenFalso();
  let t = 1_000_000;
  const ratings = createRatings({ storage, now: () => t });
  assert.equal(shown(ratings.get('cpu')), '1200?');
  const r = ratings.record({ category: 'cpu', opponent: cpuRating(60), score: 1 });
  assert.ok(r.delta > 0);
  assert.equal(r.after.games, 1);
  assert.equal(r.after.win, 1);
  assert.equal(r.after.history.length, 1);
  // Otra vez, desde lo guardado.
  const otra = createRatings({ storage, now: () => t });
  assert.equal(Math.round(otra.get('cpu').r), Math.round(r.after.r));
  // Muchas partidas igualadas: deja de ser provisional.
  for (let i = 0; i < 30; i++) {
    t += 3600_000;
    otra.record({ category: 'blitz', opponent: { r: 1300, rd: 80 }, score: i % 2 });
  }
  assert.ok(!isProvisional(otra.get('blitz')));
  assert.ok(otra.get('blitz').best !== null);
});

test('el ranking local: por nombres, y contra uno mismo no cuenta', () => {
  const ratings = createRatings({ storage: almacenFalso(), now: () => 5 });
  assert.equal(ratings.local.record({ white: 'Ana', black: 'ana', score: 1 }), null);
  assert.equal(ratings.local.record({ white: 'Ana', black: '', score: 1 }), null);
  const r = ratings.local.record({ white: 'Ana', black: 'Luis', score: 1 });
  assert.ok(r.white.delta > 0 && r.black.delta < 0);
  const lista = ratings.local.list();
  assert.deepEqual(lista.map((e) => e.name), ['Ana', 'Luis']);
  assert.equal(ratings.local.get('ANA').win, 1, 'el nombre, sin importar mayúsculas');
});

test('lo que viene de la nube: de cada categoría se queda con lo más reciente', () => {
  let t = 10;
  const a = createRatings({ storage: almacenFalso(), now: () => t });
  a.record({ category: 'blitz', opponent: { r: 1200, rd: 100 }, score: 1 });
  t = 20;
  const b = createRatings({ storage: almacenFalso(), now: () => t });
  b.record({ category: 'blitz', opponent: { r: 1200, rd: 100 }, score: 0 });
  b.record({ category: 'cpu', opponent: cpuRating(10), score: 1 });
  a.import(b.export());
  assert.equal(a.get('blitz').loss, 1, 'la de b es más nueva');
  assert.equal(a.get('cpu').win, 1);
  // Lo que venga roto no rompe nada.
  a.import({ ratings: { blitz: { r: 'x', rd: -5 } }, local: { zz: { name: 'otro' } } });
  assert.equal(a.get('blitz').loss, 1);
});
