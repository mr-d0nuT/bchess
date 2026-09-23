import test from 'node:test';
import assert from 'node:assert/strict';
import { onScreen, ownerOf } from '../src/pieces/pick.js';

// Objetos de mentira con la forma que mira `pick.js`: padre, `visible` y `userData`.
function node({ parent = null, visible = true, owner = null } = {}) {
  return { parent, visible, userData: owner ? { owner } : {} };
}

test('la malla de una pieza lleva hasta su dueño', () => {
  const pieza = { kind: 'knight' };
  const raíz = node({ owner: pieza });
  const figura = node({ parent: raíz });
  const crin = node({ parent: figura });
  assert.equal(ownerOf(crin), pieza);
  assert.equal(ownerOf(raíz), pieza);
});

test('sin dueño por ninguna rama, no hay pieza', () => {
  assert.equal(ownerOf(node({ parent: node() })), null);
  assert.equal(ownerOf(null), null);
});

test('una malla escondida, o con un padre escondido, no se ve', () => {
  const raíz = node();
  const torre = node({ parent: raíz, visible: false });
  const caja = node({ parent: torre });
  assert.equal(onScreen(caja), false);
  assert.equal(onScreen(node({ visible: false })), false);
});

test('lo que está a la vista, con todos sus padres, se ve', () => {
  const raíz = node();
  const figura = node({ parent: raíz });
  assert.equal(onScreen(node({ parent: figura })), true);
});

test('las lanzas no se pueden tocar: el rayo sigue hasta lo que hay detrás', () => {
  const pieza = { kind: 'pawn' };
  const raíz = node({ owner: pieza });
  const lanza = node({ parent: raíz });
  lanza.userData.noPick = true;
  const banderola = node({ parent: lanza });
  assert.equal(ownerOf(lanza), null);
  assert.equal(ownerOf(banderola), null);
  assert.equal(ownerOf(node({ parent: raíz })), pieza);
});
