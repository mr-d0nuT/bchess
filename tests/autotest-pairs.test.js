import test from 'node:test';
import assert from 'node:assert/strict';
import { FROM, TO, fenFor, pairs } from '../src/dev/pairs.js';
import { Position, squareName, moveFrom, moveTo } from '../src/chess/position.js';

test('cada pareja de la red de seguridad es una posición legal en la que la captura se puede hacer', () => {
  const lista = pairs();
  assert.ok(lista.length >= 35);
  for (const { color, attacker, defender } of lista) {
    const fen = fenFor(color, attacker, defender);
    const position = Position.fromFEN(fen);
    const from = FROM[color][attacker];
    const to = TO[color];
    const legal = position.legalMoves().some((m) => squareName(moveFrom(m)) === from && squareName(moveTo(m)) === to);
    assert.ok(legal, `${color} ${attacker} → ${defender}: ${fen}`);
    assert.ok(['playing', 'check'].includes(position.status()), `${fen}: la partida sigue`); // el rey que come al peón está en su jaque
    // Y después de comer tampoco se acaba (con solo reyes y una pieza serían tablas y se quedaría esperando).
    const m = position.legalMoves().find((mm) => squareName(moveFrom(mm)) === from && squareName(moveTo(mm)) === to);
    position.make(m);
    assert.ok(['playing', 'check'].includes(position.status()), `${fen}: tras comer, ${position.status()}`);
  }
});
