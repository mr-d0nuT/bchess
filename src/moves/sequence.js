import * as THREE from 'three';
import { REST_FACING, planWalk, pointAlong, shortestTurn } from './walk.js';

// Coreografía de «ir a una casilla» y de las acciones de los botones. Mientras dura una,
// `busy` es true y se ignora cualquier otra orden.

const HOP_DISTANCE = 0.5; // lo que avanza al saltar de la peana (su radio)
const DUST_Y = 0.05;

function tween(seconds, step) {
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / (seconds * 1000));
      step(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMover({ piece, board, dust, onBusy = () => {} }) {
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
    piece.pedestal.visible = true;
    piece.pedestal.scale.setScalar(1);
    piece.pedestal.rotation.y = REST_FACING; // el escudo de la peana, delante, como la pieza
    piece.face(REST_FACING);
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

      // 4. La peana reaparece bajo sus pies y lo sube.
      piece.play('idle', { fade: 0.3 });
      piece.pedestal.position.set(to.x, 0, to.z);
      piece.pedestal.visible = true;
      dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
      await tween(0.4, (t) => {
        const k = 1 - (1 - t) ** 3;
        piece.pedestal.scale.setScalar(Math.max(0.001, k));
        piece.figure.position.y = h * k;
      });

      // 5. Reposo mirando a la cámara.
      await turnTo(REST_FACING, 0.35);
      square = target;
    });
  }

  function perform(action) {
    if (!piece.has(action)) return Promise.resolve(false);
    return exclusive(async () => {
      await piece.playOnce(action);
      if (action === 'fall') {
        await wait(1500);
        const at = piece.figure.position;
        dust.puff(new THREE.Vector3(at.x, piece.pedestalHeight + DUST_Y, at.z), { radius: 0.35 });
        piece.play('idle', { fade: 0 });
      } else {
        piece.play('idle', { fade: 0.25 });
      }
    });
  }

  return {
    placeOn,
    goTo,
    perform,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
