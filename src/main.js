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
import { pawnMoves } from './rules/pawn.js';

// Arranque de la prueba: peones blancos en la fila 2 y negros en la 7 (los colores que
// traiga el manifiesto). Tocas uno, se marcan sus casillas posibles y, al tocar una, anda
// hasta ella. Los botones actúan sobre el elegido.

const SIDES = [
  { color: 'white', kind: 'white-pawn', rank: 2 },
  { color: 'black', kind: 'black-pawn', rank: 7 },
];
const FILES = 'abcdefgh';
const BUTTON_ACTIONS = ['attack', 'hit', 'fall'];
// Cada peón hace de vez en cuando un gesto suelto (rascarse, mirar alrededor…).
const FIDGET_MIN_MS = 9000;
const FIDGET_RANGE_MS = 14000;
const nextFidgetDelay = () => FIDGET_MIN_MS + Math.random() * FIDGET_RANGE_MS;
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
  const pawns = []; // { color, piece, mover, nextFidgetAt }
  const state = { selected: null, busy: false };

  let previous = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    for (const pawn of pawns) {
      pawn.piece.update(dt);
      if (now >= pawn.nextFidgetAt) {
        if (!state.busy && pawn !== state.selected) pawn.mover.fidget();
        pawn.nextFidgetAt = now + nextFidgetDelay();
      }
    }
    dust.update(dt);
    stage.controls.update();
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  const occupied = () => new Set(pawns.map((p) => p.mover.square));
  const pawnAt = (square) => pawns.find((p) => p.mover.square === square) ?? null;
  const movesOf = (pawn) => pawnMoves(pawn.mover.square, occupied(), pawn.color);
  const refreshButtons = () => hud.setBusy(state.busy || !state.selected);

  function select(pawn) {
    state.selected = pawn;
    highlights.select(pawn ? pawn.mover.square : null);
    highlights.showMoves(pawn ? movesOf(pawn) : []);
    refreshButtons();
  }

  function onBusy(busy) {
    state.busy = busy;
    refreshButtons();
  }

  async function handleTap({ owner, square }) {
    if (state.busy) return;
    const tapped = owner ?? (square ? pawnAt(square) : null);
    if (tapped) {
      select(tapped);
      return;
    }
    const pawn = state.selected;
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
    if (!state.busy && state.selected) state.selected.mover.perform(action);
  });

  async function loadPieces() {
    try {
      const manifest = await loadManifest();
      const sides = SIDES.filter((side) => manifest.pieces?.[side.kind]);
      const kits = await Promise.all(sides.map((side) => loadPieceKit(manifest.pieces[side.kind], quality)));
      sides.forEach((side, i) => {
        for (const file of FILES) {
          const piece = spawnPiece(kits[i]);
          stage.scene.add(piece.object);
          const pawn = {
            color: side.color,
            piece,
            mover: createMover({ piece, board, dust, onBusy, restFacing: restFacingFor(side.color) }),
            nextFidgetAt: performance.now() + nextFidgetDelay() / 2,
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
  window.bchess = { stage, board, quality, pawns, state, tap: handleTap };
}

start();
