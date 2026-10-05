import test from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_FEN } from '../src/chess/position.js';
import { gameRecord } from '../src/chess/notation.js';

const T = '︎';
const sans = (record) => record.rows.flatMap((row) => [row.white?.san, row.black?.san]).filter(Boolean);

test('la apertura se escribe con figuritas, y el peón sin ninguna', () => {
  const record = gameRecord(INITIAL_FEN, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6']);
  assert.deepEqual(sans(record), ['e4', 'e5', `♘${T}f3`, `♞${T}c6`, `♗${T}b5`, 'a6']);
  assert.deepEqual(record.rows.map((row) => row.n), [1, 2, 3]);
  assert.equal(record.rows[0].white.from, 'e2');
  assert.equal(record.rows[0].white.to, 'e4');
});

test('comer, el jaque y el mate (el del pastor)', () => {
  const record = gameRecord(INITIAL_FEN, ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
  assert.equal(sans(record).at(-1), `♕${T}xf7#`);
  assert.deepEqual(record.captured, { white: ['pawn'], black: [] });
  assert.equal(record.advantage, 1);
});

test('el peón que come dice su columna; el enroque, O-O', () => {
  const record = gameRecord(INITIAL_FEN, ['e2e4', 'd7d5', 'e4d5', 'g8f6', 'g1f3', 'f6d5', 'f1e2', 'e7e6', 'e1g1']);
  assert.ok(sans(record).includes('exd5'));
  assert.ok(sans(record).includes(`♞${T}xd5`));
  assert.equal(sans(record).at(-1), 'O-O');
  assert.equal(record.advantage, 0); // uno por uno
});

test('si dos caballos pueden ir a la misma casilla, se dice cuál', () => {
  // Caballos blancos en b1 y f3, los dos llegan a d2.
  const fen = '4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1';
  assert.deepEqual(sans(gameRecord(fen, ['b1d2'])), [`♘${T}bd2`]);
  // Torres en a1 y a5: misma columna, se dice la fila.
  const torres = '4k3/8/8/R7/8/8/8/R3K3 w - - 0 1';
  assert.deepEqual(sans(gameRecord(torres, ['a1a3'])), [`♖${T}1a3`]);
});

test('coronar se escribe con la figurita de lo que sale, y cuenta como lo que es ahora', () => {
  const record = gameRecord('7k/P7/8/8/8/8/8/K7 w - - 0 1', ['a7a8q']);
  assert.equal(sans(record)[0], `a8=♕${T}+`);
  assert.equal(record.advantage, 9);
});

test('si empieza moviendo el negro, la primera fila no tiene jugada blanca', () => {
  const record = gameRecord('4k3/8/8/8/8/8/4P3/4K3 b - - 0 7', ['e8d7', 'e2e4']);
  assert.equal(record.rows[0].n, 7);
  assert.equal(record.rows[0].white, null);
  assert.equal(record.rows[0].black.san, `♚${T}d7`);
  assert.equal(record.rows[1].n, 8);
  assert.equal(record.rows[1].white.san, 'e4');
});

test('una jugada que no vale corta la lista ahí', () => {
  const record = gameRecord(INITIAL_FEN, ['e2e4', 'e2e4', 'e7e5']);
  assert.deepEqual(sans(record), ['e4']);
});
