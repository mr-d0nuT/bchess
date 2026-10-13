import test from 'node:test';
import assert from 'node:assert/strict';
import { Position } from '../src/chess/position.js';
import {
  TABLAS_ESPERA, aceptacionCaducada, acepto, anuladas, createPartidaOnline, decideAceptacion, decideBandera, decideFin, decideReclamo, estadoLocal,
  finDeTodos, jugoDesde, mandaElSuyo, ofertaMia, ofertaSuya, ofrezco, puedoOfrecer, puntuaOnline, rechazada, rechazo, recibeOferta, retrasoReclamo,
} from '../src/net/partida.js';
import { createRatings } from '../src/rating/ratings.js';

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

test('el silencio que hace falta para reclamar la victoria, según el ritmo: bala 30 s, blitz 45 s, lo demás un minuto', () => {
  assert.equal(retrasoReclamo('bala:1'), 30000);
  assert.equal(retrasoReclamo('blitz:3+2'), 45000);
  assert.equal(retrasoReclamo('rapida:10'), 60000);
  assert.equal(retrasoReclamo('libre:libre'), 60000);
  assert.equal(retrasoReclamo(undefined), 60000);
});

// ---- La puntuación online ----

// Un almacén de mentira, como `localStorage`.
const almacen = () => {
  const datos = new Map();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
};

test('una partida online acabada puntúa en su ritmo, contra la puntuación que dijo el rival, y una sola vez', () => {
  const ratings = createRatings({ storage: almacen(), now: () => 1000 });
  const p = createPartidaOnline({ info: info({ opponentRating: { r: 1800, rd: 60 } }), yo: 'bbbb' }); // blitz, yo negras
  juega(p, 'e2e4', 'e7e5');
  p.acabada = { status: 'rivalResigned', winner: 'black', flagged: null };
  const r = puntuaOnline(p, ratings);
  assert.equal(r.category, 'blitz');
  assert.ok(r.delta > 0);
  assert.equal(ratings.get('blitz').games, 1);
  assert.equal(ratings.get('bala').games, 0, 'solo en su ritmo');
  assert.equal(puntuaOnline(p, ratings), r, 'una vez');
  assert.equal(ratings.get('blitz').games, 1);
  // Contra un rival más flojo, ganar da menos.
  const otros = createRatings({ storage: almacen(), now: () => 1000 });
  const q = createPartidaOnline({ info: info({ opponentRating: { r: 1000, rd: 60 } }), yo: 'bbbb' });
  juega(q, 'e2e4', 'e7e5');
  q.acabada = { status: 'rivalResigned', winner: 'black', flagged: null };
  assert.ok(puntuaOnline(q, otros).delta < r.delta);
  // Unas tablas por las reglas cuentan medio punto; sin reloj, en «rápida».
  const tablas = createPartidaOnline({ info: info({ time: 'libre:libre', opponentRating: { r: 1200, rd: 350 } }), yo: 'bbbb' });
  juega(tablas, 'e2e4', 'e7e5');
  tablas.acabada = { status: 'stalemate', winner: null, flagged: null };
  const t = puntuaOnline(tablas, otros);
  assert.equal(t.category, 'rapida');
  assert.equal(otros.get('rapida').draw, 1);
});

test('no puntúan las partidas anuladas ni las de menos de dos jugadas (no llegaron a empezar)', () => {
  const ratings = createRatings({ storage: almacen() });
  const anulada = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(anulada, 'e2e4', 'e7e5');
  anulada.acabada = { status: 'anulada', winner: null, flagged: null };
  assert.equal(puntuaOnline(anulada, ratings), null);
  const corta = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(corta, 'e2e4');
  corta.acabada = { status: 'resign', winner: 'white', flagged: null };
  assert.equal(puntuaOnline(corta, ratings), null);
  const viva = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(viva, 'e2e4', 'e7e5');
  assert.equal(puntuaOnline(viva, ratings), null, 'sin acabar, nada');
  assert.equal(ratings.get('blitz').games, 0);
});

test('sin puntuación del rival (o con una sin sentido, ya cambiada por la de empezar), se puntúa contra 1200', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb' });
  assert.deepEqual(p.rivalRating, { r: 1200, rd: 350 });
});

// ---- Las tablas, ofrecidas (punto 12) ----

test('quién ha jugado desde una jugada: las blancas, las pares', () => {
  const lista = ['e2e4', 'e7e5', 'g1f3'];
  assert.equal(jugoDesde(lista, 'white', 2), true, 'g1f3 es la 2');
  assert.equal(jugoDesde(lista, 'black', 2), false);
  assert.equal(jugoDesde(lista, 'black', 0), true);
  assert.equal(jugoDesde(lista, 'white', 3), false, 'desde la 3, nadie');
});

test('tablas: las ofrezco, el rival las acepta viendo la misma partida, y se acaba', () => {
  const yo = createPartidaOnline({ info: info(), yo: 'aaaa' }); // blancas
  const el = createPartidaOnline({ info: info(), yo: 'bbbb' }); // negras
  juega(yo, 'e2e4', 'e7e5');
  juega(el, 'e2e4', 'e7e5');
  assert.equal(puedoOfrecer(yo), true);
  const n = ofrezco(yo);
  assert.equal(n, 2);
  assert.equal(ofertaMia(yo), true);
  assert.equal(puedoOfrecer(yo), false, 'una a la vez');
  assert.equal(recibeOferta(el, n), true);
  assert.equal(ofertaSuya(el), true);
  assert.equal(puedoOfrecer(el), false, 'la suya se acepta, no se ofrece otra');
  const m = acepto(el, null, 1000);
  assert.equal(m, 2);
  assert.ok(el.tablas.aceptando);
  assert.equal(decideAceptacion(yo, m), 'acabar');
});

test('tablas: jugar es decir que no; y una aceptación que se cruza con una jugada ya no vale', () => {
  const yo = createPartidaOnline({ info: info(), yo: 'aaaa' }); // blancas
  juega(yo, 'e2e4', 'e7e5');
  const n = ofrezco(yo);
  // Las ofrezco y juego yo: siguen en pie (el que decide es él).
  juega(yo, 'g1f3');
  assert.equal(ofertaMia(yo), true);
  // Él aceptó sin haber visto mi jugada: no vemos la misma partida.
  assert.equal(decideAceptacion(yo, n), 'nula');
  // Él juega: es que no.
  juega(yo, 'b8c6');
  assert.equal(ofertaMia(yo), false);
  assert.equal(decideAceptacion(yo, 4), 'nula');
  // La suya, si yo ya he jugado desde que la hizo, ni se apunta.
  const el = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(el, 'e2e4', 'e7e5', 'g1f3');
  assert.equal(recibeOferta(el, 1), false, 'hecha antes de mi e7e5');
  assert.equal(recibeOferta(el, 3), true);
  // Y aceptarla aún sin ver la posición en que la hizo, tampoco.
  const tarde = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(tarde, 'e2e4');
  assert.equal(recibeOferta(tarde, 3), true);
  assert.equal(ofertaSuya(tarde), false, 'su jugada aún no ha llegado');
});

test('tablas: rechazadas, no se pueden volver a ofrecer hasta haber jugado', () => {
  const yo = createPartidaOnline({ info: info(), yo: 'aaaa' }); // blancas
  juega(yo, 'e2e4', 'e7e5');
  const n = ofrezco(yo);
  const el = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(el, 'e2e4', 'e7e5');
  recibeOferta(el, n);
  assert.equal(rechazo(el), n);
  assert.equal(ofertaSuya(el), false);
  assert.equal(rechazada(yo, n + 1), false, 'de otra oferta: nada');
  assert.equal(rechazada(yo, n), true);
  assert.equal(ofertaMia(yo), false);
  assert.equal(puedoOfrecer(yo), false, 'hasta que juegue');
  juega(yo, 'g1f3', 'b8c6');
  assert.equal(puedoOfrecer(yo), true);
});

test('tablas: si nadie cierra la partida a tiempo, aceptarlas caduca; y si el otro dice que ya no valen, también', () => {
  const el = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(el, 'e2e4', 'e7e5');
  recibeOferta(el, 2);
  acepto(el, null, 1000);
  assert.equal(aceptacionCaducada(el, 1000 + TABLAS_ESPERA), false);
  assert.equal(aceptacionCaducada(el, 1001 + TABLAS_ESPERA), true);
  assert.equal(el.tablas.aceptando, null);
  assert.equal(ofertaSuya(el), false);
  assert.equal(recibeOferta(el, 2), true, 'otra vez, la misma posición');
  assert.equal(ofertaSuya(el), true);
  juega(el, 'g1f3', 'b8c6');
  assert.equal(ofertaSuya(el), false, 'he jugado yo: era que no');
  const otra = createPartidaOnline({ info: info(), yo: 'bbbb' });
  juega(otra, 'e2e4', 'e7e5');
  recibeOferta(otra, 2);
  acepto(otra, null, 0);
  assert.equal(anuladas(otra), true);
  assert.equal(otra.tablas.aceptando, null);
  assert.equal(anuladas(otra), false, 'una vez');
});

test('tablas acordadas: medio punto para cada uno, y el final es el mismo en los dos lados', () => {
  const ratings = createRatings({ storage: almacen() });
  const p = createPartidaOnline({ info: info({ opponentRating: { r: 1200, rd: 350 } }), yo: 'bbbb' });
  juega(p, 'e2e4', 'e7e5');
  assert.equal(p.ganador('agreement'), null);
  assert.equal(estadoLocal('agreement', null, 'black'), 'agreement');
  assert.equal(finDeTodos('agreement'), 'agreement');
  assert.deepEqual(decideFin(p, { status: 'agreement', winner: null, flagged: null, moves: ['e2e4', 'e7e5'] }), { accion: 'acabar', status: 'agreement', flagged: null });
  p.acabada = { status: 'agreement', winner: null, flagged: null };
  assert.ok(puntuaOnline(p, ratings));
  assert.equal(ratings.get('blitz').draw, 1);
});

test('en la diaria, el plazo de mi jugada cuenta desde que el rival hizo la suya, no desde que me llega', () => {
  const HORA = 3600 * 1000;
  const DIA = 24 * HORA;
  const p = createPartidaOnline({ info: info({ time: 'diaria:1d' }), yo: 'bbbb', now: 0 }); // yo, negras
  // El rival (blancas) jugó a la hora de empezar, y yo abro el juego cinco horas después: me llega ahora.
  assert.equal(p.recibe(0, 'e2e4', null, HORA), true);
  p.avanza(5 * HORA);
  assert.equal(p.clock.running, 'black');
  assert.equal(p.clock.remaining('black', 5 * HORA), DIA - 4 * HORA, 'me quedan 20 h, no un día entero');
  assert.equal(p.ultimaAt, HORA);
  // Por su lista guardada, igual: la hora va con su última jugada.
  const q = createPartidaOnline({ info: info({ time: 'diaria:1d' }), yo: 'bbbb', now: 0 });
  assert.equal(q.sincroniza(['e2e4'], null, 2 * HORA), 1);
  q.avanza(10 * HORA);
  assert.equal(q.clock.remaining('black', 10 * HORA), DIA - 8 * HORA);
  // Una hora rara (de antes de que le tocara, o del futuro) no se cree a ciegas.
  const r = createPartidaOnline({ info: info({ time: 'diaria:1d' }), yo: 'bbbb', now: 3 * HORA });
  r.recibe(0, 'e2e4', null, 99 * DIA);
  r.avanza(4 * HORA);
  assert.equal(r.clock.remaining('black', 4 * HORA), DIA, 'del futuro: cuenta desde que llega');
});

test('en las demás, el reloj se pulsa al llegar, como siempre (la hora del rival no se usa)', () => {
  const p = createPartidaOnline({ info: info(), yo: 'bbbb', now: 0 }); // blitz 3|2
  p.recibe(0, 'e2e4', null, 1000);
  p.avanza(5000);
  assert.equal(p.clock.running, 'black');
  assert.equal(p.clock.remaining('black', 5000), 180000);
});

test('en la diaria, su jugada me resta el tiempo pasado aunque mi reloj estuviera parado (el tablero lo para al animar)', () => {
  const HORA = 3600 * 1000;
  const DIA = 24 * HORA;
  const p = createPartidaOnline({ info: info({ time: 'diaria:1d' }), yo: 'bbbb', now: 0 }); // yo, negras
  p.clock.pause(0); // se estaba animando: el reloj del tablero, parado
  p.recibe(0, 'e2e4', null, HORA);
  p.position.playUci('e2e4');
  p.moves.push('e2e4');
  p.pulsaSuya(p.momento(0, 3 * HORA), 3 * HORA);
  p.clock.resume(3 * HORA); // y sigue al acabar la animación
  assert.equal(p.clock.remaining('black', 4 * HORA), DIA - 3 * HORA, 'desde su jugada (1 h), no desde que siguió el reloj (3 h)');
});
