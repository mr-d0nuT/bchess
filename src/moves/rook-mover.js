import * as THREE from 'three';
import { planWalk, pointAlong, shortestTurn } from './walk.js';
import { giantToTower, towerToGiant } from './transform.js';

// Mover de la torre, con la misma forma que el de los peones. Para ir a otra casilla se transforma
// en gigante, anda y vuelve a ser torre, pidiendo sitio a las piezas de alrededor (`crowd`). Sin
// gigante, la torre se desliza entre polvo. Los pasos sueltos (`room`, `turnTo`, `awaken`,
// `walkTo`, `walkOnto`, `crumble`) los usa el director de capturas, que ya tiene el bloqueo general.

export const CRUMBLE_SECONDS = 0.25; // lo que tarda en deshacerse en rocas tras perder
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
  let shrinking = false; // mientras el gigante encoge para volver a ser torre o se deshace en rocas
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
    rook.pedestal.visible = true;
    rook.pedestal.scale.setScalar(1);
    if (giant) {
      giant.object.visible = false;
      giant.figure.scale.setScalar(1);
    }
  }

  // Cuerpos con los que pide sitio ahora: su círculo y, al andar, el tramo que tiene por delante. En
  // una captura, `stance` ({ at, facing, reach }) es el abanico de lo que hará en su puesto: lo pide
  // desde el principio y, mientras no anda, en lugar del círculo. Mientras encoge o se deshace, pide
  // cada vez menos; deshecho en rocas, ya no pide nada.
  function room({ stance = null } = {}) {
    if (!giant || !rook.body || !rook.object.visible) return [];
    const scale = shrinking ? giant.figure.scale.x : 1;
    const bodies = [];
    if (stance) {
      bodies.push({ at: stance.at, facing: stance.facing, reach: stance.reach.map((r) => r * scale), margin: rook.body.margin * scale });
      if (!heading) return bodies;
    }
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
    bodies.push({ from, to, radius: rook.body.walk * scale });
    return bodies;
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
      rook.tower.position.set(p.x, rook.pedestalHeight, p.z);
      rook.pedestal.position.set(p.x, 0, p.z);
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
      // Lo pidió el usuario: la cámara se acerca a la torre para verla convertirse en gigante, se abre
      // para enseñar el camino y lo sigue mientras anda. Al acabar, vuelve a donde la tenía el usuario.
      const from = board.squareToWorld(square);
      const to = board.squareToWorld(target);
      try {
        await cinema.frame(clock, from, from, others());
        await awaken();
        await cinema.frame(clock, from, to, others());
        cinema.follow(() => giant.figure.position);
        await walkOnto(target);
      } catch (err) {
        console.error('[BChess] La torre no pudo moverse:', err);
        placeOn(target);
      } finally {
        cinema.follow(null);
        release();
        await cinema.restore(clock);
      }
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
    });
  }

  // Tras perder: se deshace en rocas y polvo.
  async function crumble() {
    const at = giant.figure.position.clone();
    shrinking = true;
    rubble.explode(at, { color: rook.stone, count: 22, height: rook.height, obstacles: others });
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 20, radius: 1, duration: 0.9 });
    cinema.shake(0.15);
    await clock.tween(CRUMBLE_SECONDS, (t) => {
      giant.figure.scale.setScalar(Math.max(0.001, 1 - t));
    });
    rook.object.visible = false;
  }

  // Desaparece del tablero encogiendo dentro de una nube de polvo (capturas sin combate).
  async function vanish() {
    const enPie = giant?.object.visible;
    const form = enPie ? giant.figure : rook.tower;
    const at = form.position.clone();
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await clock.tween(0.5, (t) => {
      const k = Math.max(0.001, 1 - t * t);
      form.scale.setScalar(k);
      if (!enPie) rook.pedestal.scale.setScalar(k); // la torre se va con su peana
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
