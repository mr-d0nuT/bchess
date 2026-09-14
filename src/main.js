import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHighlights } from './scene/highlights.js';
import { createHud } from './ui/hud.js';
import { loadManifest, loadPieceKit, spawnPiece } from './pieces/piece.js';
import { createDust } from './fx/dust.js';
import { createMover } from './moves/sequence.js';
import { restFacingFor } from './moves/walk.js';
import { onBoardTap } from './input.js';
import { pawnCaptures, pawnMoves } from './rules/pawn.js';
import { GESTURE_RETRY_MS, nextGestureDelay, pickPerformer } from './moves/gestures.js';
import { createClock } from './combat/clock.js';
import { measureStrikes } from './combat/strikes.js';
import { createImpactFx } from './fx/impact.js';
import { createCinema } from './scene/cinema.js';

// Arranque de la prueba: peones blancos en la fila 2 y negros en la 7 (los colores que
// traiga el manifiesto). Tocas uno y se marcan sus casillas posibles (puntos dorados) y los
// enemigos que puede comerse (aros rojos). Al tocar una casilla anda hasta ella; al tocar un
// enemigo marcado, se lo come. Los botones actúan sobre el elegido.

const SIDES = [
  { color: 'white', kind: 'white-pawn', rank: 2 },
  { color: 'black', kind: 'black-pawn', rank: 7 },
];
const FILES = 'abcdefgh';
const BUTTON_ACTIONS = ['attack', 'hit', 'fall'];
const hud = createHud();

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function currentQuality() {
  return qualityFromQuery(location.search) ?? pickQuality({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    screenWidth: screen.width,
    screenHeight: screen.height,
  });
}

async function start() {
  if (!webglAvailable()) {
    hud.showMessage('Tu navegador no puede mostrar gráficos 3D (WebGL no está disponible). Prueba con Chrome, Safari o Firefox actualizados.');
    return;
  }
  const quality = currentQuality();
  const stage = createStage(document.getElementById('escena'), quality);
  const board = createBoard();
  stage.scene.add(board.group);
  const highlights = createHighlights(stage.scene, board);
  const dust = createDust(stage.scene);
  const clock = createClock();
  const fx = createImpactFx(stage.scene);
  const cinema = createCinema(stage);
  const pawns = []; // { color, piece, mover }
  const state = { selected: null, busy: false, fighting: false, lastStyle: null };
  // De tanto en tanto, un solo peón del tablero hace un gesto especial; nunca dos a la vez.
  const gesture = { performer: null, last: null, lastVariant: -1, at: performance.now() + nextGestureDelay() };

  function directGestures(now) {
    if (gesture.performer) {
      if (gesture.performer.piece.fidgeting) return;
      gesture.performer = null;
      gesture.at = now + nextGestureDelay();
    }
    if (now < gesture.at) return;
    const candidates = state.busy || state.fighting ? [] : pawns.filter((pawn) => pawn !== state.selected);
    const pawn = pickPerformer(candidates, gesture.last);
    const variant = pawn ? pawn.mover.fidget({ avoid: gesture.lastVariant }) : null;
    if (variant === null) {
      gesture.at = now + GESTURE_RETRY_MS;
      return;
    }
    Object.assign(gesture, { performer: pawn, last: pawn, lastVariant: variant });
  }

  // Un fotograma de juego: reloj, animaciones, gestos y efectos.
  function frame(now, dt) {
    const step = clock.tick(dt);
    for (const pawn of pawns) pawn.piece.update(step);
    directGestures(now);
    dust.update(step);
    fx.update(step);
    highlights.pulse(now / 1000);
    if (!cinema.active) stage.controls.update();
    cinema.update(dt);
  }

  let previous = performance.now();
  let manual = false; // mientras `advance` mueve el juego a mano
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    if (!manual) frame(now, dt);
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  // Para comprobar por código: avanza `seconds` de juego a `fps` fotogramas por segundo sin
  // depender de que la pestaña esté visible (oculta, el navegador frena el bucle de animación).
  async function advance(seconds, fps = 60) {
    const nextTask = () => new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
    manual = true;
    try {
      for (let i = 0; i < Math.round(seconds * fps); i++) {
        frame(performance.now(), 1 / fps);
        await nextTask();
      }
    } finally {
      manual = false;
      previous = performance.now();
    }
  }

  const occupied = () => new Set(pawns.map((p) => p.mover.square));
  const pawnAt = (square) => pawns.find((p) => p.mover.square === square) ?? null;
  const movesOf = (pawn) => pawnMoves(pawn.mover.square, occupied(), pawn.color);
  const capturesOf = (pawn) => pawnCaptures(
    pawn.mover.square,
    new Set(pawns.filter((p) => p.color !== pawn.color).map((p) => p.mover.square)),
    pawn.color,
  );
  const refreshButtons = () => hud.setBusy(state.busy || state.fighting || !state.selected);

  function select(pawn) {
    state.selected = pawn;
    highlights.select(pawn ? pawn.mover.square : null);
    highlights.showMoves(pawn ? movesOf(pawn) : []);
    highlights.showCaptures(pawn ? capturesOf(pawn) : []);
    refreshButtons();
  }

  function onBusy(busy) {
    state.busy = busy;
    refreshButtons();
  }

  function removePawn(pawn) {
    stage.scene.remove(pawn.piece.object);
    pawns.splice(pawns.indexOf(pawn), 1);
    if (gesture.performer === pawn) gesture.performer = null;
    if (gesture.last === pawn) gesture.last = null;
  }

  // Un peón se come a otro: el vencido se esfuma y el ganador anda hasta su casilla.
  async function capture(attacker, defender) {
    state.fighting = true;
    highlights.clear();
    refreshButtons();
    const target = defender.mover.square;
    try {
      await defender.mover.vanish();
      removePawn(defender);
      await attacker.mover.goTo(target);
    } catch (err) {
      console.error('[BChess] La captura falló:', err);
      attacker.mover.placeOn(target);
    } finally {
      if (pawns.includes(defender)) removePawn(defender);
      state.fighting = false;
      select(attacker);
    }
  }

  async function handleTap({ owner, square }) {
    if (state.busy || state.fighting) return;
    const tapped = owner ?? (square ? pawnAt(square) : null);
    const pawn = state.selected;
    if (pawn && tapped && tapped.color !== pawn.color && capturesOf(pawn).includes(tapped.mover.square)) {
      await capture(pawn, tapped);
      return;
    }
    if (tapped) {
      select(tapped);
      return;
    }
    if (pawn && square && movesOf(pawn).includes(square)) {
      highlights.clear();
      await pawn.mover.goTo(square);
      select(pawn);
      return;
    }
    select(null);
  }

  onBoardTap(
    { canvas: stage.renderer.domElement, camera: stage.camera, board, targets: () => pawns.map((p) => p.piece.hitbox) },
    handleTap,
  );

  hud.onAction((action) => {
    if (!state.busy && !state.fighting && state.selected) state.selected.mover.perform(action);
  });

  async function loadPieces() {
    try {
      const manifest = await loadManifest();
      const sides = SIDES.filter((side) => manifest.pieces?.[side.kind]);
      const kits = await Promise.all(sides.map((side) => loadPieceKit(manifest.pieces[side.kind], quality)));
      for (const kit of kits) kit.strikes = measureStrikes(kit, spawnPiece);
      sides.forEach((side, i) => {
        for (const file of FILES) {
          const piece = spawnPiece(kits[i]);
          stage.scene.add(piece.object);
          const pawn = {
            color: side.color,
            piece,
            mover: createMover({ piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) }),
          };
          pawn.mover.placeOn(file + side.rank);
          piece.hitbox.userData.owner = pawn;
          pawns.push(pawn);
        }
      });
      for (const action of BUTTON_ACTIONS) {
        if (!kits.some((kit) => kit.has(action))) hud.hideAction(action);
      }
      refreshButtons();
    } catch (err) {
      console.error('[BChess] No se pudieron cargar las piezas:', err);
      hud.showMessage('No se pudo cargar el peón', { retry: loadPieces });
    }
  }

  await addLighting(stage, quality);
  await loadPieces();
  // Acceso para depurar desde la consola; `tap` simula un toque ({ owner, square }).
  window.bchess = { stage, board, quality, pawns, state, gesture, clock, highlights, fx, cinema, hud, advance, tap: handleTap, capture };
}

start();
