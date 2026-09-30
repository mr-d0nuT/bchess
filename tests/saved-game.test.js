import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_FEN } from '../src/chess/position.js';
import { findTimeControl } from '../src/chess/timecontrol.js';
import { clockOnResume, packGame, readSavedGame } from '../src/chess/saved-game.js';

const partida = (cambios = {}) => JSON.stringify({
  ...packGame({
    start: INITIAL_FEN, moves: ['e2e4', 'e7e5', 'g1f3'], mode: 'cpu', level: 42, human: 'black', color: 'random',
    time: 'blitz:3+2', clock: { white: 170000, black: 150000 }, now: 1000,
  }),
  ...cambios,
});

test('la partida guardada se lee con su posición ya jugada', () => {
  const g = readSavedGame(partida());
  assert.ok(g);
  assert.deepEqual(g.moves, ['e2e4', 'e7e5', 'g1f3']);
  assert.equal(g.position.side, 'black');
  assert.equal(g.position.pieceAt('f3').kind, 'knight');
  assert.equal(g.mode, 'cpu');
  assert.equal(g.level, 42);
  assert.equal(g.human, 'black', 'con el color que le tocó a suertes, no «random»');
  assert.equal(g.color, 'random');
  assert.equal(g.time, 'blitz:3+2');
  assert.deepEqual(g.reloj, { white: 170000, black: 150000 });
  assert.equal(g.cuando, 1000);
});

test('lo que no es una partida a medias no se ofrece', () => {
  assert.equal(readSavedGame(null), null);
  assert.equal(readSavedGame('esto no es json'), null);
  assert.equal(readSavedGame(partida({ v: 99 })), null, 'de otra versión');
  assert.equal(readSavedGame(partida({ moves: [] })), null, 'sin jugadas: no hay nada que continuar');
  assert.equal(readSavedGame(partida({ moves: ['e2e4', 'e2e4'] })), null, 'una jugada imposible');
  assert.equal(readSavedGame(partida({ moves: ['e2e4', 42] })), null);
  assert.equal(readSavedGame(partida({ mode: 'online' })), null);
  assert.equal(readSavedGame(partida({ human: 'green' })), null);
  assert.equal(readSavedGame(partida({ start: 'basura' })), null);
  // El mate del pastor: acabada, no se continúa.
  assert.equal(readSavedGame(partida({ moves: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'] })), null);
});

test('un reloj roto no rompe la partida: se juega sin él', () => {
  assert.equal(readSavedGame(partida({ reloj: { white: -5, black: 1000 } })).reloj, null);
  assert.equal(readSavedGame(partida({ reloj: null })).reloj, null);
});

test('con la app cerrada, el reloj se congela; en la diaria, el plazo sigue corriendo', () => {
  const g = readSavedGame(partida());
  assert.deepEqual(clockOnResume(g, findTimeControl('blitz:3+2'), 3600000), { white: 170000, black: 150000 });
  const dia = 24 * 3600000;
  const d = readSavedGame(partida({ time: 'diaria:1d', reloj: { white: dia, black: dia / 2 } }));
  const tras = clockOnResume(d, findTimeControl('diaria:1d'), 1000 + 3600000);
  assert.equal(tras.black, dia / 2 - 3600000, 'a quien le toca (las negras) se le ha ido una hora');
  assert.equal(tras.white, dia);
  assert.equal(clockOnResume(d, findTimeControl('diaria:1d'), 1000 + 2 * dia).black, 0, 'y si se pasó del plazo, a cero');
  assert.equal(clockOnResume(readSavedGame(partida({ reloj: null })), null, 5000), null);
});
