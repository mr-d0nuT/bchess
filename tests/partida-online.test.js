import test from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../src/chess/position.js';
import { createPartidaOnline } from '../src/net/partida.js';

// El emparejamiento visto por «bbbb» (negras): su rival, «aaaa», lleva blancas.
const info = (cambios = {}) => ({ game: 'aaaa-bbbb-x', white: 'aaaa', time: 'blitz:3+2', opponent: 'aaaa', opponentName: '  Ana ', ...cambios });
const juega = (p, ...jugadas) => {
  for (const uci of jugadas) {
    p.position.playUci(uci);
    p.moves.push(uci);
  }
};

test('la partida sale del emparejamiento: mi color, el del rival, los nombres limpios y el reloj de las blancas en marcha', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb', miNombre: 'Bruno', now: 1000 });
  assert.equal(p.id, 'aaaa-bbbb-x');
  assert.equal(p.opponent, 'aaaa');
  assert.equal(p.color, 'black');
  assert.equal(p.rival, 'white');
  assert.deepEqual(p.nombres, { black: 'Bruno', white: 'Ana' });
  assert.equal(p.time, 'blitz:3+2');
  assert.equal(p.clock.running, 'white');
  assert.equal(p.clock.remaining('white', 61000), 120000);
  assert.equal(p.clock.remaining('black', 61000), 180000);
  const libre = createPartidaOnline({ info: info({ time: 'libre:libre' }), yo: 'aaaa' });
  assert.equal(libre.color, 'white');
  assert.equal(libre.clock, null);
});

test('una jugada del rival se guarda una sola vez: ni las ya jugadas, ni la que se anima, ni repetidas, ni acabada la partida', () => {
  const p = createPartidaOnline({ info: info(), yo: 'aaaa' }); // yo, blancas
  juega(p, 'e2e4', 'e7e5');
  assert.equal(p.recibe(1, 'e7e5'), false, 'ya jugada');
  assert.equal(p.recibe(3, 'b8c6', 'g1f3'), true, 'la suya, mientras animo la mía');
  assert.equal(p.recibe(3, 'g8f6', 'g1f3'), false, 'la primera que llega es la que vale');
  assert.equal(p.remote.get(3), 'b8c6');
  assert.equal(p.recibe(2, 'g1f3', 'g1f3'), false, 'la que se anima ya cuenta');
  p.acabada = { status: 'resign', winner: 'black', flagged: null };
  assert.equal(p.recibe(5, 'f8c5'), false);
});

test('la lista entera del rival completa lo que falta, solo si empieza por lo que ya tengo', () => {
  const p = createPartidaOnline({ info: info(), yo: 'aaaa' });
  juega(p, 'e2e4');
  assert.equal(p.sincroniza(['d2d4', 'e7e5']), 0, 'es de otra partida');
  assert.equal(p.remote.size, 0);
  assert.equal(p.sincroniza(['e2e4']), 0, 'nada nuevo');
  assert.equal(p.sincroniza(['e2e4', 'e7e5']), 1);
  assert.equal(p.remote.get(1), 'e7e5');
  juega(p, 'e7e5');
  // Mientras animo la mía, su lista ya la trae (y la suya detrás).
  assert.equal(p.sincroniza(['e2e4', 'e7e5', 'g1f3', 'b8c6'], 'g1f3'), 1);
  assert.equal(p.remote.get(3), 'b8c6');
});

test('en espera, lo que llega del rival se juega seguido y se pulsa su reloj; lo que llega desordenado espera su turno', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb', now: 0 }); // yo, negras
  p.recibe(2, 'g1f3'); // la tercera llega antes que la primera
  assert.deepEqual(p.avanza(1000), { movio: false, mala: false, status: null });
  p.recibe(0, 'e2e4');
  assert.deepEqual(p.avanza(5000), { movio: true, mala: false, status: 'playing' });
  assert.deepEqual(p.moves, ['e2e4']);
  assert.equal(p.position.side, 'black');
  assert.equal(p.clock.running, 'black', 'su reloj, pulsado: ahora corre el mío');
  assert.equal(p.clock.remaining('white', 5000), 180000 - 5000 + 2000, 'con su incremento');
  assert.ok(p.remote.has(2), 'la tercera, después de la mía');
  // La mía (en el tablero) y su respuesta, que ya estaba: se juega al avanzar.
  juega(p, 'e7e5');
  assert.deepEqual(p.avanza(6000), { movio: true, mala: false, status: 'playing' });
  assert.deepEqual(p.moves, ['e2e4', 'e7e5', 'g1f3']);
});

test('una jugada del rival que no vale aquí se tira (para que llegue la buena), y a la tercera ya no hay arreglo', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb' });
  p.recibe(0, 'e2e5');
  assert.deepEqual(p.avanza(0), { movio: false, mala: true, status: null });
  assert.deepEqual(p.moves, []);
  assert.equal(p.remote.has(0), false, 'fuera: si no, la buena no se guardaba nunca');
  assert.equal(p.malas, 1);
  // La buena llega después (en la lista que se le pide) y se juega.
  assert.equal(p.sincroniza(['e2e4']), 1);
  assert.deepEqual(p.avanza(0), { movio: true, mala: false, status: 'playing' });
  assert.equal(p.descarta(5), false);
  assert.equal(p.descarta(5), true, 'la tercera');
});

test('el reloj del rival es el que dice él: se pone al hacer su jugada aquí, aunque llegue antes; el mío no lo toca', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb', now: 0 });
  p.pulsa({ side: 'white', n: 1, white: 178500, black: 180000 }, 1000); // su reloj llega antes que su jugada
  assert.ok(p.pendingPress);
  p.recibe(0, 'e2e4');
  p.avanza(4000); // aquí su jugada llegó con 4 s de retraso: su reloj aquí marcaría 178 s
  assert.equal(p.pendingPress, null);
  assert.equal(p.clock.remaining('white', 4000), 178500, 'lo que dice el suyo');
  assert.equal(p.clock.remaining('black', 4000), 180000, 'el mío, el mío');
  // Con su jugada ya hecha, se pone en el momento.
  juega(p, 'e7e5');
  p.clock.press('black', 9000);
  p.recibe(2, 'g1f3');
  p.avanza(9500);
  p.pulsa({ side: 'white', n: 3, white: 170000, black: 999999 }, 9500);
  assert.equal(p.clock.remaining('white', 9500), 170000);
  assert.equal(p.clock.remaining('black', 9500), 180000 - 5000 + 2000, 'nunca lo que diga él del mío');
  // Y lo que diga de mi lado no cuenta.
  p.aplicaTiempo({ side: 'black', white: 1, black: 1 }, 9500);
  assert.equal(p.clock.remaining('white', 9500), 170000);
});

test('quién gana: por las reglas, sin tiempo (si al otro le queda con qué dar mate) y por lo que pasa online', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb' }); // yo, negras
  assert.equal(p.ganador('abandon'), 'black');
  assert.equal(p.ganador('rivalResigned'), 'black');
  assert.equal(p.ganador('resign'), 'white');
  assert.equal(p.ganador('stalemate'), null);
  assert.equal(p.ganador('time', 'white'), 'black');
  juega(p, 'e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7');
  assert.equal(p.position.status(), 'checkmate');
  assert.equal(p.ganador('checkmate'), 'white');
  p.position = Position.fromFEN('8/8/8/8/8/8/k7/K6N w - - 0 1');
  assert.equal(p.ganador('time', 'black'), null, 'con un caballo solo no se da mate: tablas');
});

test('en el latido cuentan las jugadas que conozco: las hechas, la que se anima y las del rival ya llegadas, seguidas', () => {
  const p = createPartidaOnline({ info: info(), yo: 'aaaa' }); // yo, blancas
  juega(p, 'e2e4', 'e7e5');
  assert.deepEqual(p.conocidas(), ['e2e4', 'e7e5']);
  p.recibe(3, 'b8c6', 'g1f3'); // su respuesta llega mientras animo la mía
  p.recibe(5, 'f8c5', 'g1f3'); // y otra con un hueco delante: esa no
  assert.deepEqual(p.conocidas('g1f3'), ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  assert.deepEqual(p.jugadas('g1f3'), ['e2e4', 'e7e5', 'g1f3']);
  assert.deepEqual(p.moves, ['e2e4', 'e7e5'], 'sin tocar las de verdad');
});

test('lo que llegó con la partida en el tablero (y se quedó aparcado al cambiar de partida) se juega al ponerla en espera', () => {
  // Yo, blancas, he movido; mientras buscaba otro rival, su respuesta llegó y se quedó guardada sin jugar.
  const p = createPartidaOnline({ info: info(), yo: 'aaaa', now: 0 });
  juega(p, 'e2e4');
  p.clock.press('white', 3000);
  p.recibe(1, 'e7e5');
  p.pulsa({ side: 'black', n: 2, white: 179000, black: 178000 }, 6000);
  // Al quedar en espera se juega ya, y corre mi reloj (antes seguía corriendo el suyo hasta «ganarle» por tiempo).
  assert.deepEqual(p.avanza(9000), { movio: true, mala: false, status: 'playing' });
  assert.deepEqual(p.moves, ['e2e4', 'e7e5']);
  assert.equal(p.position.side, 'white');
  assert.equal(p.clock.running, 'white');
  assert.equal(p.clock.remaining('black', 9000), 178000, 'el suyo, lo que dijo él');
});
