import * as THREE from 'three';
import { pointAlong } from './walk.js';

// Mover de la torre, con la misma forma que el de los peones. Sin gigante, la torre se desliza
// entre polvo hasta su casilla.

const SLIDE_SECONDS = 0.45; // por casilla de distancia
const DUST_Y = 0.05;
const smooth = (t) => t * t * (3 - 2 * t);

export function createRookMover({ rook, board, dust, clock, onBusy = () => {}, restFacing }) {
  let square = null;
  let busy = false;

  function setBusy(value) {
    busy = value;
    onBusy(value);
  }

  async function exclusive(task) {
    if (busy) return false;
    setBusy(true);
    try {
      await task();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function placeOn(target) {
    square = target;
    rook.object.visible = true;
    rook.placeAt(board.squareToWorld(target));
    rook.face(restFacing);
    rook.tower.visible = true;
    rook.tower.scale.setScalar(1);
    if (rook.giant) {
      rook.giant.object.visible = false;
      rook.giant.figure.scale.setScalar(1);
    }
  }

  async function slide(target) {
    const from = board.squareToWorld(square);
    const to = board.squareToWorld(target);
    dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
    await clock.tween(from.distanceTo(to) * SLIDE_SECONDS, (t) => {
      const p = pointAlong(from, to, smooth(t));
      rook.tower.position.set(p.x, 0, p.z);
    });
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
    placeOn(target);
  }

  function goTo(target) {
    if (target === square) return Promise.resolve(false);
    return exclusive(() => slide(target));
  }

  // Desaparece del tablero encogiendo dentro de una nube de polvo.
  async function vanish() {
    const at = rook.tower.position.clone();
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await clock.tween(0.5, (t) => rook.tower.scale.setScalar(Math.max(0.001, 1 - t * t)));
    rook.object.visible = false;
  }

  return {
    placeOn,
    goTo,
    vanish,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
