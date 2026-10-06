import test from 'node:test';
import assert from 'node:assert/strict';
import { ID_KEY, identidadOnline, packOnline, packTodas, readOnline } from '../src/net/guardadas-online.js';
import { createPartidaOnline } from '../src/net/partida.js';
import { createSession } from '../src/net/online.js';

// Una partida de «aaaa» (blancas, yo) contra «bbbb», a blitz 3|2, con unas jugadas hechas.
function partida({ jugadas = ['e2e4', 'e7e5', 'g1f3'], now = 0 } = {}) {
  const info = { game: 'aaaa-bbbb-x7', white: 'aaaa', time: 'blitz:3+2', opponent: 'bbbb', opponentName: 'Bruno' };
  const p = createPartidaOnline({ info, yo: 'aaaa', miNombre: 'Ana', now });
  for (const uci of jugadas) {
    p.position.playUci(uci);
    p.moves.push(uci);
  }
  p.origen = 'reto';
  return p;
}

test('una partida online guardada se recupera igual: con quién, colores, nombres, jugadas y ritmo', () => {
  const p = partida();
  const texto = packTodas([packOnline(p, { now: 1000 })]);
  const [g] = readOnline(texto, 1000);
  assert.deepEqual(g.info, { game: 'aaaa-bbbb-x7', white: 'aaaa', time: 'blitz:3+2', opponent: 'bbbb', opponentName: 'Bruno' });
  assert.equal(g.yo, 'aaaa');
  assert.equal(g.origen, 'reto');
  assert.deepEqual(g.nombres, { white: 'Ana', black: 'Bruno' });
  assert.deepEqual(g.moves, ['e2e4', 'e7e5', 'g1f3']);
  // Y se sigue con ella: la posición, jugada otra vez, y el reloj del que mueve, corriendo.
  const q = createPartidaOnline({ info: g.info, yo: g.yo, now: 1000, moves: g.moves, reloj: g.reloj, nombres: g.nombres });
  assert.equal(q.position.side, 'black');
  assert.equal(q.clock.running, 'black');
  assert.equal(q.color, 'white');
  assert.deepEqual(q.nombres, { white: 'Ana', black: 'Bruno' });
});

test('la jugada que se está animando (ya salió hacia el rival) también se guarda', () => {
  const p = partida({ jugadas: ['e2e4'] });
  const [g] = readOnline(packTodas([packOnline(p, { enCurso: 'e7e5', now: 0 })]), 0);
  assert.deepEqual(g.moves, ['e2e4', 'e7e5']);
});

test('al recuperarla, al que le tocaba se le ha ido el tiempo que ha pasado (online no se para); al otro, no', () => {
  const p = partida({ now: 0 }); // tras 1. e4 e5 2. Cf3, mueven las negras
  p.clock.switchTo('black', 0);
  p.clock.restore({ white: 150000, black: 140000 });
  const texto = packTodas([packOnline(p, { now: 10000 })]); // a las negras, 10 s gastados ya: 130 s
  const [g] = readOnline(texto, 10000 + 25000); // la página, 25 s cerrada
  assert.deepEqual(g.reloj, { white: 150000, black: 130000 - 25000 });
  const [tarde] = readOnline(texto, 10000 + 999999);
  assert.equal(tarde.reloj.black, 0, 'se le acabó mientras tanto: al volver, pierde por tiempo');
  const sinReloj = createPartidaOnline({ info: { game: 'aaaa-bbbb-x8', white: 'aaaa', time: 'libre:libre', opponent: 'bbbb' }, yo: 'aaaa' });
  assert.equal(readOnline(packTodas([packOnline(sinReloj, { now: 0 })]), 5000)[0].reloj, null);
});

test('lo que no cuadra no se recupera: identificadores raros, jugadas que no valen, partidas acabadas o repetidas', () => {
  const buena = packOnline(partida(), { now: 0 });
  const malas = [
    { ...buena, yo: 'a/#' },
    { ...buena, rival: 'aaaa' },
    { ...buena, game: '#' },
    { ...buena, game: 'cccc-bbbb-x7' }, // no es de los dos
    { ...buena, white: 'cccc' },
    { ...buena, time: 7 },
    { ...buena, moves: ['e2e4', 'e2e4'] },
    { ...buena, moves: ['e2e9'] },
    { ...buena, moves: ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'] }, // mate: acabada
    null,
  ];
  assert.deepEqual(readOnline(packTodas(malas), 0), []);
  assert.equal(readOnline(packTodas([buena, buena]), 0).length, 1, 'la misma, una vez');
  assert.deepEqual(readOnline('{"v":99,"partidas":[]}', 0), []);
  assert.deepEqual(readOnline('no es json', 0), []);
  assert.deepEqual(readOnline(null, 0), []);
});

// Un almacén de mentira, como `localStorage`.
const almacen = () => {
  const datos = new Map();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)), datos };
};
let cuenta = 0;
const nuevo = () => `nuevo${++cuenta}`;

test('la pestaña que se queda el candado usa siempre la misma identidad (guardada); las demás, una de usar y tirar', async () => {
  const storage = almacen();
  const conCandado = { request: (nombre, opciones, fn) => Promise.resolve(fn({ name: nombre })) };
  const sinCandado = { request: (nombre, opciones, fn) => Promise.resolve(fn(null)) };
  const primera = await identidadOnline({ locks: conCandado, storage, nuevo });
  assert.equal(primera.titular, true);
  assert.equal(storage.datos.get(ID_KEY), primera.me);
  const otraVez = await identidadOnline({ locks: conCandado, storage, nuevo });
  assert.equal(otraVez.me, primera.me, 'al recargar, la misma');
  const otraPestana = await identidadOnline({ locks: sinCandado, storage, nuevo });
  assert.equal(otraPestana.titular, false);
  assert.notEqual(otraPestana.me, primera.me);
  assert.equal(storage.datos.get(ID_KEY), primera.me, 'sin tocar la guardada');
  // Sin candados (navegadores viejos): titular.
  assert.equal((await identidadOnline({ locks: null, storage, nuevo })).me, primera.me);
});

test('una partida que se sigue tras recargar no espera a que llegue el rival (ya estaba en ella)', () => {
  let latir = null;
  let hora = 0;
  const bus = { subscribe: () => {}, publish: () => {}, onMessage: () => () => {} };
  const timers = { every: (fn) => (latir = fn), stop: () => {} };
  const sesion = createSession({ bus, me: 'aaaa', game: 'aaaa-bbbb-x7', opponent: 'bbbb', white: 'aaaa', moves: () => [], now: () => hora, timers, reanudada: true });
  const eventos = [];
  sesion.on('cancel', () => eventos.push('cancel'));
  hora = 16000;
  latir();
  assert.deepEqual(eventos, []);
});
