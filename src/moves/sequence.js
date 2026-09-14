import * as THREE from 'three';
import { REST_FACING, planWalk, pointAlong, shortestTurn } from './walk.js';

// Coreografía de «ir a una casilla», de las acciones de los botones y de los pasos del combate.
// Los tiempos van con el reloj del juego (`clock`), así que la cámara lenta del combate también
// los frena. Mientras dura una orden con bloqueo, `busy` es true y se ignora cualquier otra.

const HOP_DISTANCE = 0.5; // lo que avanza al saltar de la peana (su radio)
const DUST_Y = 0.05;

export function createMover({ piece, board, dust, clock, onBusy = () => {}, restFacing = REST_FACING }) {
  let square = null;
  let busy = false;
  const tween = (seconds, step) => clock.tween(seconds, step);

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

  function turnTo(angle, seconds) {
    const from = piece.figure.rotation.y;
    const delta = shortestTurn(from, angle);
    return tween(seconds, (t) => {
      piece.figure.rotation.y = from + delta * t;
    });
  }

  function placeOn(target) {
    square = target;
    piece.placeAt(board.squareToWorld(target));
    piece.object.visible = true;
    piece.figure.scale.setScalar(1);
    piece.pedestal.visible = true;
    piece.pedestal.scale.setScalar(1);
    piece.pedestal.rotation.y = restFacing; // el escudo de la peana, delante, como la pieza
    piece.face(restFacing);
  }

  // La peana reaparece bajo sus pies en `to` entre polvo, lo sube y lo gira hacia el oponente.
  async function rise(to) {
    piece.play('idle', { fade: 0.3 });
    piece.pedestal.position.set(to.x, 0, to.z);
    piece.pedestal.rotation.y = restFacing;
    piece.pedestal.visible = true;
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
    await tween(0.4, (t) => {
      const k = 1 - (1 - t) ** 3;
      piece.pedestal.scale.setScalar(Math.max(0.001, k));
      piece.figure.position.y = piece.pedestalHeight * k;
    });
    await turnTo(restFacing, 0.35);
  }

  function goTo(target) {
    if (target === square) return Promise.resolve(false);
    return exclusive(async () => {
      const from = board.squareToWorld(square);
      const to = board.squareToWorld(target);
      const { heading } = planWalk(from, to, piece.walkSpeed);
      const h = piece.pedestalHeight;

      await turnTo(heading, 0.25);

      // 1. Salta de la peana (o baja de un paso si no hay animación de salto).
      const hopStart = piece.figure.position.clone();
      const hopEnd = new THREE.Vector3(from.x + Math.sin(heading) * HOP_DISTANCE, 0, from.z + Math.cos(heading) * HOP_DISTANCE);
      const canJump = piece.has('jump');
      piece.play(canJump ? 'jump' : 'walk', { loop: !canJump, fade: 0.15 });
      await tween(0.35, (t) => {
        piece.figure.position.lerpVectors(hopStart, hopEnd, t);
        piece.figure.position.y = h * (1 - t) + Math.sin(Math.PI * t) * 0.18;
      });

      // 2. La peana se esfuma en una nube de polvo.
      dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
      piece.play('walk', { fade: 0.15 });
      await tween(0.4, (t) => {
        piece.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      });
      piece.pedestal.visible = false;

      // 3. Anda hasta la casilla.
      const walk = planWalk(hopEnd, to, piece.walkSpeed);
      await tween(walk.duration, (t) => {
        const p = pointAlong(hopEnd, to, t);
        piece.figure.position.set(p.x, 0, p.z);
      });

      // 4. La peana reaparece bajo sus pies, lo sube y vuelve a mirar al oponente.
      await rise(to);
      square = target;
    });
  }

  // Cae dentro de su casilla: la peana se esfuma, el peón cae al tablero y, pasado un rato,
  // la peana reaparece bajo sus pies entre una nube de polvo y lo vuelve a subir.
  async function fall() {
    const h = piece.pedestalHeight;
    const at = piece.figure.position.clone();
    const falling = piece.playOnce('fall');
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z));
    await tween(0.35, (t) => {
      piece.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      piece.figure.position.y = h * (1 - t * t);
    });
    piece.pedestal.visible = false;
    await falling;
    await clock.wait(1.5);
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { radius: 0.5 });
    piece.play('idle', { fade: 0 });
    piece.pedestal.visible = true;
    await tween(0.4, (t) => {
      const k = 1 - (1 - t) ** 3;
      piece.pedestal.scale.setScalar(Math.max(0.001, k));
      piece.figure.position.y = h * k;
    });
  }

  function perform(action) {
    if (!piece.has(action)) return Promise.resolve(false);
    return exclusive(async () => {
      if (action === 'fall') {
        await fall();
        return;
      }
      await piece.playOnce(action);
      piece.play('idle', { fade: 0.25 });
    });
  }

  // Gesto suelto en reposo; nunca mientras la pieza está en plena coreografía. Devuelve la
  // versión elegida, o null.
  function fidget(options) {
    return busy ? null : piece.fidget(options);
  }

  // Pasos del combate. Los usa el director, que ya tiene el bloqueo general, así que no
  // pasan por `exclusive`.

  // Baja de la peana en su sitio: la peana encoge entre polvo mientras la figura baja al
  // tablero y se desliza hasta `spot` ({x, z}, dentro de su casilla).
  async function descend(spot) {
    const h = piece.pedestalHeight;
    const start = piece.figure.position.clone();
    piece.play('idle', { fade: 0.2 });
    dust.puff(new THREE.Vector3(start.x, DUST_Y, start.z));
    await tween(0.35, (t) => {
      piece.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      piece.figure.position.set(start.x + (spot.x - start.x) * t, h * (1 - t * t), start.z + (spot.z - start.z) * t);
    });
    piece.pedestal.visible = false;
  }

  // Anda por el tablero, ya sin peana, desde donde está hasta `to` ({x, z}).
  async function walkTo(to) {
    const at = piece.figure.position;
    const from = { x: at.x, z: at.z };
    const walk = planWalk(from, to, piece.walkSpeed);
    if (walk.distance < 1e-3) return;
    await turnTo(walk.heading, 0.25);
    piece.play('walk', { fade: 0.15 });
    await tween(walk.duration, (t) => {
      const p = pointAlong(from, to, t);
      piece.figure.position.set(p.x, 0, p.z);
    });
    piece.play('idle', { fade: 0.25 });
  }

  // Tras ganar: anda hasta la casilla conquistada y sube a su peana.
  async function walkOnto(target) {
    const to = board.squareToWorld(target);
    await walkTo(to);
    await rise(to);
    square = target;
  }

  // Desaparece del tablero encogiendo dentro de una gran nube de polvo.
  async function vanish() {
    const at = piece.figure.position.clone();
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await tween(0.5, (t) => {
      const k = Math.max(0.001, 1 - t * t);
      piece.figure.scale.setScalar(k);
      piece.pedestal.scale.setScalar(k);
    });
    piece.object.visible = false;
  }

  // Saltitos de alegría, para celebrar si no hay animación de victoria.
  async function hop(times = 2) {
    const base = piece.figure.position.y;
    for (let i = 0; i < times; i++) {
      await tween(0.32, (t) => {
        piece.figure.position.y = base + Math.sin(Math.PI * t) * 0.22;
      });
      const at = piece.figure.position;
      dust.puff(new THREE.Vector3(at.x, base + DUST_Y, at.z), { count: 5, radius: 0.3, duration: 0.3 });
    }
  }

  return {
    placeOn,
    goTo,
    perform,
    fidget,
    turnTo,
    descend,
    walkTo,
    walkOnto,
    vanish,
    hop,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
