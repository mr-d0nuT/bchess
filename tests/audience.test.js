import test from 'node:test';
import assert from 'node:assert/strict';
import { CHEER_MAX, NEAR, pickAudience } from '../src/combat/audience.js';

// Un azar que se repite: cada llamada, el siguiente de la lista (y vuelta a empezar).
const serie = (...valores) => {
  let i = 0;
  return () => valores[i++ % valores.length];
};

const piezas = [
  { kind: 'pawn', color: 'white', square: 'd3' },
  { kind: 'pawn', color: 'white', square: 'e3' },
  { kind: 'bishop', color: 'white', square: 'f2' },
  { kind: 'knight', color: 'white', square: 'c3' }, // el caballo no: anda a su manera
  { kind: 'pawn', color: 'white', square: 'a1' }, // lejos
  { kind: 'pawn', color: 'black', square: 'e5' },
  { kind: 'queen', color: 'black', square: 'h8' }, // lejos
];

test('reaccionan las cercanas: unas pocas del que gana y una del que pierde', () => {
  const r = pickAudience({ pieces: piezas, at: 'e4', winner: 'white', random: serie(0.1, 0.5, 0.3, 0.8) });
  assert.ok(r);
  assert.ok(r.cheer.length >= 1 && r.cheer.length <= CHEER_MAX);
  for (const p of r.cheer) {
    assert.equal(p.color, 'white');
    assert.notEqual(p.kind, 'knight');
    assert.notEqual(p.square, 'a1');
  }
  assert.equal(r.sigh.square, 'e5');
});

test('no siempre: a veces nadie', () => {
  assert.equal(pickAudience({ pieces: piezas, at: 'e4', winner: 'white', random: () => 0.99 }), null);
});

test('si nadie lo ha visto de cerca, nadie reacciona', () => {
  const lejos = [{ kind: 'pawn', color: 'white', square: 'a1' }, { kind: 'pawn', color: 'black', square: 'h8' }];
  assert.equal(pickAudience({ pieces: lejos, at: 'e4', winner: 'white', random: () => 0.1 }), null);
  assert.equal(NEAR, 2);
});
