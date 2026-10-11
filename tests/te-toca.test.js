import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartidaOnline } from '../src/net/partida.js';
import { meToca, tituloConTurno } from '../src/ui/te-toca.js';

test('el título dice en cuántas partidas te toca; sin ninguna, el de siempre', () => {
  assert.equal(tituloConTurno('Battle Chess', 2, '¡Te toca!'), '(2) ¡Te toca! · Battle Chess');
  assert.equal(tituloConTurno('Battle Chess', 0, '¡Te toca!'), 'Battle Chess');
});

test('me toca si mueve mi color, o si su jugada ya ha llegado aunque aún no se haya jugado', () => {
  const info = { game: 'aaaa-bbbb-x', white: 'aaaa', time: 'blitz:3+2', opponent: 'aaaa', opponentName: 'Ana' };
  const p = createPartidaOnline({ info, yo: 'bbbb' }); // yo, negras: empiezan ellas
  assert.equal(meToca(p), false);
  p.recibe(0, 'e2e4');
  assert.equal(meToca(p), true, 'ha llegado su e4');
  p.position.playUci('e2e4');
  p.moves.push('e2e4');
  p.remote.delete(0);
  assert.equal(meToca(p), true, 'jugada: me toca');
  assert.equal(meToca(p, 'e7e5'), false, 'la mía, a medio animar');
  p.acabada = { status: 'resign', winner: 'white', flagged: null };
  assert.equal(meToca(p), false, 'acabada');
});
