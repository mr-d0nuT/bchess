import test from 'node:test';
import assert from 'node:assert/strict';
import { claveNombre, errorKey, nombreInvalido, profileOf, sugerenciasNombre } from '../src/net/cloud.js';
import { createRatings, cpuRating } from '../src/rating/ratings.js';

function almacenFalso() {
  const datos = new Map();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
}

test('el perfil público lleva el nombre y las puntuaciones, y nada privado', () => {
  const ratings = createRatings({ storage: almacenFalso(), now: () => 1000 });
  ratings.record({ category: 'cpu', opponent: cpuRating(30), score: 1 });
  ratings.local.record({ white: 'Ana', black: 'Luis', score: 1 });
  const perfil = profileOf({ name: '  Mr Donut con un nombre larguísimo ', data: ratings.export() });
  assert.deepEqual(Object.keys(perfil).sort(), ['board', 'name', 'ratings']);
  assert.equal(perfil.name, 'Mr Donut con un ');
  assert.equal('local' in perfil, false, 'los nombres de casa no van al perfil público');
  // Para ordenar el ranking, solo los ritmos con partidas.
  assert.deepEqual(Object.keys(perfil.board), ['cpu']);
  assert.equal(perfil.board.cpu, Math.round(ratings.get('cpu').r));
  assert.equal(profileOf({ name: '', data: ratings.export() }).name, 'Jugador');
});

test('cada error de Firebase, con su mensaje (o ninguno si el jugador cerró la ventana)', () => {
  assert.equal(errorKey('auth/invalid-email'), 'cuenta.error.correo');
  assert.equal(errorKey('auth/weak-password'), 'cuenta.error.clave');
  assert.equal(errorKey('auth/email-already-in-use'), 'cuenta.error.existe');
  assert.equal(errorKey('auth/invalid-credential'), 'cuenta.error.datos');
  assert.equal(errorKey('auth/network-request-failed'), 'cuenta.error.red');
  assert.equal(errorKey('auth/popup-blocked'), 'cuenta.error.ventana');
  assert.equal(errorKey('auth/too-many-requests'), 'cuenta.error.muchos');
  assert.equal(errorKey('auth/popup-closed-by-user'), null);
  assert.equal(errorKey('algo/raro'), 'cuenta.error.otro');
});

test('los nombres del ranking: la misma clave sin mayúsculas ni espacios de más', () => {
  assert.equal(claveNombre('  Ana  María '), 'ana maría');
  assert.equal(claveNombre('ANA'), claveNombre('ana'));
  assert.notEqual(claveNombre('Ana'), claveNombre('Ana2'));
});

test('un nombre del ranking no puede ir vacío ni llevar barras (sería una ruta de la base de datos)', () => {
  assert.equal(nombreInvalido('Ana'), null);
  assert.equal(nombreInvalido('   '), 'cuenta.error.nombreVacio');
  assert.equal(nombreInvalido('Ana/Luis'), 'cuenta.error.nombreRaro');
  assert.equal(nombreInvalido('..'), 'cuenta.error.nombreRaro');
  assert.equal(nombreInvalido('__ana__'), 'cuenta.error.nombreRaro');
});

test('si el nombre está cogido, se prueba con un número detrás, sin pasar de 16 letras', () => {
  assert.deepEqual(sugerenciasNombre('Josep').slice(0, 3), ['Josep', 'Josep2', 'Josep3']);
  const largo = sugerenciasNombre('Bartolomé Ramírez');
  assert.equal(largo[0], 'Bartolomé Ramíre');
  assert.equal(largo[1], 'Bartolomé Ramír2');
  assert.ok(largo.every((n) => [...n].length <= 16));
  assert.deepEqual(sugerenciasNombre('').slice(0, 2), ['Jugador', 'Jugador2']);
});
