import test from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../src/chess/position.js';
import { createPartidaOnline, decideBandera, decideFin, decideReclamo, estadoLocal, finDeTodos, mandaElSuyo } from '../src/net/partida.js';

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

// ---- El final, el mismo en los dos lados ----

const MATE_PASTOR = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
const finDe = (status, winner, moves, flagged = null) => ({ status, winner, flagged, moves });

test('un final de la red se lee desde mi lado: quien se rinde o se va es el que no gana', () => {
  assert.equal(estadoLocal('resign', 'black', 'black'), 'rivalResigned');
  assert.equal(estadoLocal('resign', 'white', 'black'), 'resign');
  assert.equal(estadoLocal('abandon', 'black', 'black'), 'abandon');
  assert.equal(estadoLocal('abandon', 'white', 'black'), 'abandonada');
  assert.equal(estadoLocal('checkmate', 'white', 'black'), 'checkmate');
  for (const s of ['rivalResigned', 'resign', 'abandon', 'abandonada', 'time', 'checkmate', 'anulada']) {
    assert.equal(finDeTodos(estadoLocal(finDeTodos(s), 'white', 'white')), finDeTodos(s));
  }
});

test('el mate del rival llega antes de que aquí se haya jugado: lo deciden mis reglas al jugarlo (mate, nunca «abandono»)', () => {
  // Negras: las blancas dan mate, saltándose el combate; aquí aún no ha llegado la última jugada.
  const p = createPartidaOnline({ info: info({ time: 'libre:libre' }), yo: 'bbbb' });
  juega(p, ...MATE_PASTOR.slice(0, 6));
  const fin = finDe('checkmate', 'white', MATE_PASTOR);
  assert.deepEqual(decideFin(p, fin), { accion: 'esperar' });
  assert.equal(p.sincroniza(fin.moves), 1, 'su final trae la jugada que faltaba');
  const { status } = p.avanza(0);
  assert.equal(status, 'checkmate');
  assert.equal(p.ganador(status), 'white');
});

test('los finales que decide uno (se rinde, se va, sin tiempo, anulada) se acaban tal cual', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb' }); // negras
  assert.deepEqual(decideFin(p, finDe('resign', 'black', [])), { accion: 'acabar', status: 'rivalResigned', flagged: null });
  assert.deepEqual(decideFin(p, finDe('abandon', 'white', [])), { accion: 'acabar', status: 'abandonada', flagged: null });
  assert.deepEqual(decideFin(p, finDe('time', 'white', [], 'black')), { accion: 'acabar', status: 'time', flagged: 'black' });
  assert.deepEqual(decideFin(p, finDe('anulada', null, [])), { accion: 'acabar', status: 'anulada', flagged: null });
});

test('dos finales que se cruzan: manda el de menos jugadas y, si empatan, el de las blancas (los dos lados eligen el mismo)', () => {
  assert.equal(mandaElSuyo({ jugadas: 10, de: 'white' }, { jugadas: 9, de: 'black' }), true);
  assert.equal(mandaElSuyo({ jugadas: 9, de: 'white' }, { jugadas: 10, de: 'black' }), false);
  assert.equal(mandaElSuyo({ jugadas: 9, de: 'black' }, { jugadas: 9, de: 'white' }), true);
  assert.equal(mandaElSuyo({ jugadas: 9, de: 'white' }, { jugadas: 9, de: 'black' }), false);
  // Se rinden los dos a la vez: blancas («aaaa») y negras («bbbb»), cada uno con su final.
  const blancas = createPartidaOnline({ info: info({ opponent: 'bbbb' }), yo: 'aaaa' });
  const negras = createPartidaOnline({ info: info(), yo: 'bbbb' });
  blancas.acabada = { status: 'resign', winner: 'black', flagged: null, fin: { status: 'resign', winner: 'black' }, jugadas: 4, de: 'white' };
  negras.acabada = { status: 'resign', winner: 'white', flagged: null, fin: { status: 'resign', winner: 'white' }, jugadas: 4, de: 'black' };
  const deBlancas = finDe('resign', 'black', ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  const deNegras = finDe('resign', 'white', ['e2e4', 'e7e5', 'g1f3', 'b8c6']);
  assert.deepEqual(decideFin(blancas, deNegras), { accion: 'nada' }, 'las blancas se quedan con el suyo');
  assert.deepEqual(decideFin(negras, deBlancas), { accion: 'cambiar', status: 'rivalResigned', winner: 'black', flagged: null }, 'y las negras lo adoptan');
  // Y el mismo final que ya tenía: nada.
  assert.deepEqual(decideFin(negras, deNegras), { accion: 'nada' });
});

test('mi reloj a cero aquí: pierdo; el suyo: se espera, se le reclama y solo sin respuesta (con red) se gana', () => {
  const yo = createPartidaOnline({ info: info({ time: 'bala:1' }), yo: 'aaaa', now: 0 }); // blancas: me corre a mí
  assert.equal(decideBandera(yo, 59000), null);
  assert.deepEqual(decideBandera(yo, 60000), { accion: 'perder' });
  const p = createPartidaOnline({ info: info({ time: 'bala:1' }), yo: 'bbbb', now: 0 }); // negras: le corre a él
  assert.deepEqual(decideBandera(p, 60000), { accion: 'esperar' }, 'un poco, por si llega su jugada');
  assert.deepEqual(decideBandera(p, 62999), { accion: 'esperar' });
  assert.deepEqual(decideBandera(p, 63000), { accion: 'reclamar', n: 0 });
  assert.deepEqual(decideBandera(p, 70000), { accion: 'esperar' }, 'el reclamo, una vez');
  // Sin red, el plazo vuelve a empezar: nunca se gana así.
  assert.deepEqual(decideBandera(p, 80000, { enlaceBien: false }), { accion: 'esperar' });
  assert.deepEqual(decideBandera(p, 99999), { accion: 'esperar' });
  assert.deepEqual(decideBandera(p, 100000), { accion: 'ganar' });
});

test('su jugada llega con su reloj a cero aquí: se juega, su reloj se corrige y el reclamo se olvida', () => {
  const p = createPartidaOnline({ info: info({ time: 'bala:1' }), yo: 'bbbb', now: 0 });
  decideBandera(p, 60500);
  decideBandera(p, 63500); // reclamado
  assert.ok(p.reclamo);
  // Movió con 0,3 s en su reloj: aquí llegó tarde (las animaciones, la red).
  p.recibe(0, 'e2e4');
  p.pulsa({ side: 'white', n: 1, white: 300, black: 60000 }, 63600);
  p.avanza(63600);
  assert.equal(p.clock.remaining('white', 63600), 300);
  assert.equal(decideBandera(p, 63600), null);
  assert.equal(p.reclamo, null);
});

test('un reclamo de tiempo: si ya moví, nada; si me queda tiempo (o aún no he visto su jugada), mi reloj; si no, pierdo', () => {
  const p = createPartidaOnline({ info: info({ time: 'bala:1' }), yo: 'aaaa', now: 0 }); // blancas: me toca
  assert.deepEqual(decideReclamo(p, { n: 0 }, 20000), { accion: 'corregir', reloj: { white: 40000, black: 60000 } });
  assert.deepEqual(decideReclamo(p, { n: 0 }, 59500), { accion: 'perder' }, 'con medio segundo, de verdad se acaba');
  assert.deepEqual(decideReclamo(p, { n: 0 }, 59500, 'e2e4'), { accion: 'ignorar' }, 'ya moví: va de camino, con mi tiempo');
  juega(p, 'e2e4');
  assert.deepEqual(decideReclamo(p, { n: 0 }, 59500), { accion: 'ignorar' });
  // Su reclamo cuenta su jugada, que aquí aún se está animando: mi reloj ni ha empezado.
  p.clock.press('white', 1000);
  const r = decideReclamo(p, { n: 2 }, 61000, 'e7e5');
  assert.equal(r.accion, 'corregir');
  const libre = createPartidaOnline({ info: info({ time: 'libre:libre' }), yo: 'aaaa' });
  assert.deepEqual(decideReclamo(libre, { n: 0 }, 0), { accion: 'ignorar' });
});
