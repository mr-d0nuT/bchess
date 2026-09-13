import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHighlights } from './scene/highlights.js';
import { createHud } from './ui/hud.js';
import { loadManifest, loadPawnKit, spawnPawn } from './pieces/piece.js';
import { createDust } from './fx/dust.js';
import { createMover } from './moves/sequence.js';
import { onBoardTap } from './input.js';
import { whitePawnMoves } from './rules/pawn.js';

// Arranque de la prueba: ocho peones blancos en la fila 2. Tocas uno, se marcan sus
// casillas posibles y, al tocar una, anda hasta ella. Los botones actúan sobre el elegido.

const START_SQUARES = ['a2', 'b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'];
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
  const pawns = []; // { piece, mover }
  const state = { selected: null, busy: false };

  let previous = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    for (const pawn of pawns) pawn.piece.update(dt);
    dust.update(dt);
    stage.controls.update();
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  const occupied = () => new Set(pawns.map((p) => p.mover.square));
  const pawnAt = (square) => pawns.find((p) => p.mover.square === square) ?? null;
  const refreshButtons = () => hud.setBusy(state.busy || !state.selected);

  function select(pawn) {
    state.selected = pawn;
    highlights.select(pawn ? pawn.mover.square : null);
    highlights.showMoves(pawn ? whitePawnMoves(pawn.mover.square, occupied()) : []);
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
    if (pawn && square && whitePawnMoves(pawn.mover.square, occupied()).includes(square)) {
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

  async function loadPawns() {
    try {
      const manifest = await loadManifest();
      const kit = await loadPawnKit(manifest, quality);
      for (const square of START_SQUARES) {
        const piece = spawnPawn(kit);
        stage.scene.add(piece.object);
        const pawn = { piece, mover: createMover({ piece, board, dust, onBusy }) };
        pawn.mover.placeOn(square);
        piece.hitbox.userData.owner = pawn;
        pawns.push(pawn);
      }
      for (const action of BUTTON_ACTIONS) {
        if (!kit.has(action)) hud.hideAction(action);
      }
      refreshButtons();
    } catch (err) {
      console.error('[BChess] No se pudieron cargar los peones:', err);
      hud.showMessage('No se pudo cargar el peón', { retry: loadPawns });
    }
  }

  await addLighting(stage, quality);
  await loadPawns();
  // Acceso para depurar desde la consola; `tap` simula un toque ({ owner, square }).
  window.bchess = { stage, board, quality, pawns, state, tap: handleTap };
}

start();
