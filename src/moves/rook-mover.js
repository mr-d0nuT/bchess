import * as THREE from 'three';
import { planWalk, pointAlong, shortestTurn } from './walk.js';
import { giantToTower, towerToGiant } from './transform.js';

// Mover de la torre, con la misma forma que el de los peones. Para ir a otra casilla se transforma
// en gigante, anda y vuelve a ser torre, pidiendo sitio a las piezas de alrededor (`crowd`). Sin
// gigante, la torre se desliza entre polvo. Los pasos sueltos (`room`, `turnTo`, `awaken`,
// `walkTo`, `walkOnto`, `crumble`) los usa el director de capturas, que ya tiene el bloqueo general.

const SLIDE_SECONDS = 0.45; // por casilla, cuando se desliza sin gigante
const LOOK_AHEAD = 0.8; // casillas por delante que pide al andar
const SETTLE_LIMIT = 4; // segundos de juego que espera, como mucho, a que vuelvan las piezas
const DUST_Y = 0.05;
const smooth = (t) => t * t * (3 - 2 * t);

export function createRookMover({ rook, owner, board, dust, rubble, clock, cinema, crowd, onBusy = () => {}, restFacing }) {
  const { giant } = rook;
  let square = null;
  let busy = false;
  let heading = null; // destino {x, z} mientras el gigante anda
  let shrinking = false; // mientras el gigante encoge para volver a ser torre
  const others = () => crowd.obstacles([owner]);

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
    heading = null;
    shrinking = false;
    rook.object.visible = true;
    rook.placeAt(board.squareToWorld(target));
    rook.face(restFacing);
    rook.tower.visible = true;
    rook.tower.scale.setScalar(1);
    if (giant) {
      giant.object.visible = false;
      giant.figure.scale.setScalar(1);
    }
  }

  // Cuerpos con los que pide sitio ahora: su círculo y, al andar, el tramo que tiene por delante.
  // Mientras encoge, pide cada vez menos; deshecho en rocas, ya no pide nada.
  function room({ fighting = false } = {}) {
    if (!giant || !rook.body || !rook.object.visible) return [];
    const at = giant.figure.position;
    const from = { x: at.x, z: at.z };
    let to = from;
    if (heading) {
      const dx = heading.x - at.x;
      const dz = heading.z - at.z;
      const left = Math.hypot(dx, dz);
      if (left > 1e-6) {
        const k = Math.min(LOOK_AHEAD, left) / left;
        to = { x: at.x + dx * k, z: at.z + dz * k };
      }
    }
    const radius = (fighting ? rook.body.fight : rook.body.walk) * (shrinking ? giant.figure.scale.x : 1);
    return [{ from, to, radius }];
  }

  function turnTo(angle, seconds) {
    const from = giant.figure.rotation.y;
    const delta = shortestTurn(from, angle);
    return clock.tween(seconds, (t) => {
      giant.figure.rotation.y = from + delta * t;
    });
  }

  function awaken() {
    return towerToGiant({ rook, clock, dust, rubble, cinema, obstacles: others });
  }

  // El gigante anda desde donde está hasta `to` ({x, z}) con su paseo pesado.
  async function walkTo(to) {
    const at = giant.figure.position;
    const from = { x: at.x, z: at.z };
    const walk = planWalk(from, to, giant.walkSpeed);
    if (walk.distance < 1e-3) return;
    await turnTo(walk.heading, 0.35);
    heading = { x: to.x, z: to.z };
    giant.play('walk', { fade: 0.2 });
    await clock.tween(walk.duration, (t) => {
      const p = pointAlong(from, to, t);
      giant.figure.position.set(p.x, 0, p.z);
    });
    heading = null;
    giant.play('idle', { fade: 0.3 });
  }

  // Anda hasta el centro de `target` y allí vuelve a ser torre.
  async function walkOnto(target) {
    await walkTo(board.squareToWorld(target));
    shrinking = true;
    await giantToTower({ rook, clock, dust, rubble, restFacing });
    placeOn(target);
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
    return exclusive(async () => {
      if (!giant) {
        await slide(target);
        return;
      }
      const release = crowd.claim({ owners: [owner], bodies: () => room() });
      try {
        await awaken();
        await walkOnto(target);
      } catch (err) {
        console.error('[BChess] La torre no pudo moverse:', err);
        placeOn(target);
      } finally {
        release();
      }
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
    });
  }

  // Tras perder: se deshace en rocas y polvo.
  async function crumble() {
    const at = giant.figure.position.clone();
    rubble.explode(at, { color: rook.stone, count: 22, height: rook.height, obstacles: others });
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 20, radius: 1, duration: 0.9 });
    cinema.shake(0.15);
    await clock.tween(0.25, (t) => {
      giant.figure.scale.setScalar(Math.max(0.001, 1 - t));
    });
    rook.object.visible = false;
  }

  // Desaparece del tablero encogiendo dentro de una nube de polvo (capturas sin combate).
  async function vanish() {
    const form = giant?.object.visible ? giant.figure : rook.tower;
    const at = form.position.clone();
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await clock.tween(0.5, (t) => {
      form.scale.setScalar(Math.max(0.001, 1 - t * t));
    });
    rook.object.visible = false;
  }

  return {
    placeOn,
    goTo,
    vanish,
    room,
    turnTo,
    awaken,
    walkTo,
    walkOnto,
    crumble,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
