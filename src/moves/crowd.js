import * as THREE from 'three';
import { roomTarget, stepRoom } from './room.js';

// Hacer sitio a los gigantes (diseño, sección 6). En cada fotograma, las piezas que no participan
// en la jugada se apartan de los cuerpos que piden sitio, sin chocar entre ellas, y cuando ya no
// hace falta vuelven al centro de su casilla. Se mueve el objeto entero de cada pieza: peana y
// figura juntas, o la torre con su base.

export function createCrowd({ board, entries }) {
  const claims = new Set(); // { owners: Set, bodies() }
  const slots = new WeakMap(); // pieza → { home, radius, offset, speed, target }
  const waiting = [];
  const point = new THREE.Vector3();
  let settled = true;

  // Pide sitio hasta que se llame a la función que devuelve. `owners` son las piezas de la jugada,
  // que no se apartan; `bodies()` devuelve los cuerpos que empujan ahora ({ from, to, radius }).
  function claim({ owners, bodies }) {
    const entry = { owners: new Set(owners), bodies };
    claims.add(entry);
    settled = false;
    return () => claims.delete(entry);
  }

  function slotFor(entry) {
    let slot = slots.get(entry);
    if (!slot) {
      slot = { home: { x: 0, z: 0 }, radius: entry.piece.radius, offset: { x: 0, z: 0 }, speed: 0, target: { x: 0, z: 0 } };
      slots.set(entry, slot);
    }
    const home = board.squareToWorld(entry.mover.square);
    slot.home.x = home.x;
    slot.home.z = home.z;
    return slot;
  }

  function flush() {
    if (settled) for (const resolve of waiting.splice(0)) resolve();
  }

  function update(dt) {
    if (settled && !claims.size) {
      flush();
      return;
    }
    const owners = new Set([...claims].flatMap((c) => [...c.owners]));
    const bodies = [...claims].flatMap((c) => c.bodies());
    const fixed = [];
    const yielding = [];
    for (const entry of entries()) {
      if (owners.has(entry)) {
        entry.piece.figure.getWorldPosition(point);
        fixed.push({ x: point.x, z: point.z, radius: entry.piece.radius });
      } else {
        yielding.push({ entry, slot: slotFor(entry) });
      }
    }
    const positions = yielding.map(({ slot }) => ({ x: slot.home.x + slot.offset.x, z: slot.home.z + slot.offset.z, radius: slot.radius }));
    yielding.forEach(({ slot }, i) => {
      slot.target = bodies.length
        ? roomTarget(slot, bodies, [...positions.slice(0, i), ...positions.slice(i + 1), ...fixed])
        : { x: 0, z: 0 };
    });
    stepRoom(yielding.map(({ slot }) => slot), fixed, dt);
    settled = claims.size === 0;
    for (const { entry, slot } of yielding) {
      entry.piece.object.position.set(slot.offset.x, 0, slot.offset.z);
      if (slot.offset.x !== 0 || slot.offset.z !== 0) settled = false;
    }
    flush();
  }

  // Se cumple cuando nadie pide sitio y todas las piezas han vuelto a su casilla.
  function settle() {
    return new Promise((resolve) => waiting.push(resolve));
  }

  // Cilindros de las piezas visibles, salvo `except`, para que las rocas reboten en ellas.
  function obstacles(except = []) {
    return entries()
      .filter((entry) => !except.includes(entry) && entry.piece.object.visible)
      .map((entry) => {
        entry.piece.figure.getWorldPosition(point);
        return { x: point.x, z: point.z, radius: entry.piece.radius, height: entry.piece.height };
      });
  }

  return { claim, update, settle, obstacles };
}
