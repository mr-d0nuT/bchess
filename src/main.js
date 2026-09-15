import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHighlights } from './scene/highlights.js';
import { createHud } from './ui/hud.js';
import { loadManifest, loadPieceKit, spawnPiece } from './pieces/piece.js';
import { loadRookKit, spawnRook } from './pieces/rook.js';
import { createDust } from './fx/dust.js';
import { createRubble } from './fx/rubble.js';
import { createMover } from './moves/sequence.js';
import { createRookMover } from './moves/rook-mover.js';
import { createCrowd } from './moves/crowd.js';
import { restFacingFor } from './moves/walk.js';
import { onBoardTap } from './input.js';
import { pawnCaptures, pawnMoves } from './rules/pawn.js';
import { rookMoves } from './rules/rook.js';
import { GESTURE_RETRY_MS, nextGestureDelay, pickPerformer } from './moves/gestures.js';
import { createClock } from './combat/clock.js';
import { measureStrikes } from './combat/strikes.js';
import { createImpactFx } from './fx/impact.js';
import { createCinema } from './scene/cinema.js';
import { pickStyle } from './combat/plan.js';
import { canFight, runCombat } from './combat/duel.js';
import { canSmash, runSmash } from './combat/smash.js';

// Arranque: peones blancos en la fila 2 y negros en la 7, y torres en las esquinas (las piezas
// que traiga el manifiesto). Tocas una pieza y se marcan sus casillas posibles (puntos dorados) y
// los enemigos que puede comerse (aros rojos). Al tocar una casilla va hasta ella; al tocar un
// enemigo marcado, se lo come. Los botones actúan sobre el peón elegido.

const SIDES = [
  { color: 'white', pawn: 'white-pawn', rook: 'white-rook', pawnRank: 2, backRank: 1 },
  { color: 'black', pawn: 'black-pawn', rook: 'black-rook', pawnRank: 7, backRank: 8 },
];
const FILES = 'abcdefgh';
const ROOK_FILES = 'ah';
const BUTTON_ACTIONS = ['attack', 'hit', 'fall'];
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas apartadas
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
  const rubble = createRubble(stage.scene);
  const pieces = []; // { kind: 'pawn' | 'rook', color, piece, mover }
  const crowd = createCrowd({ board, entries: () => pieces });
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
    const candidates = state.busy || state.fighting ? [] : pieces.filter((entry) => entry.kind === 'pawn' && entry !== state.selected);
    const pawn = pickPerformer(candidates, gesture.last);
    const variant = pawn ? pawn.mover.fidget({ avoid: gesture.lastVariant }) : null;
    if (variant === null) {
      gesture.at = now + GESTURE_RETRY_MS;
      return;
    }
    Object.assign(gesture, { performer: pawn, last: pawn, lastVariant: variant });
  }

  // Un fotograma de juego: reloj, sitio para los gigantes, animaciones, gestos y efectos.
  function frame(now, dt) {
    const step = clock.tick(dt);
    crowd.update(step);
    for (const entry of pieces) entry.piece.update(step);
    directGestures(now);
    dust.update(step);
    rubble.update(step);
    fx.update(step);
    highlights.pulse(now / 1000);
    cinema.settle();
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

  const occupied = () => new Set(pieces.map((entry) => entry.mover.square));
  const enemiesOf = (entry) => new Set(pieces.filter((other) => other.color !== entry.color).map((other) => other.mover.square));
  const pieceAt = (square) => pieces.find((entry) => entry.mover.square === square) ?? null;
  const movesOf = (entry) => (entry.kind === 'rook'
    ? rookMoves(entry.mover.square, occupied(), enemiesOf(entry)).moves
    : pawnMoves(entry.mover.square, occupied(), entry.color));
  const capturesOf = (entry) => (entry.kind === 'rook'
    ? rookMoves(entry.mover.square, occupied(), enemiesOf(entry)).captures
    : pawnCaptures(entry.mover.square, enemiesOf(entry), entry.color));
  // Atacar, Golpe y Caer solo actúan sobre peones.
  const refreshButtons = () => hud.setBusy(state.busy || state.fighting || state.selected?.kind !== 'pawn');

  function select(entry) {
    state.selected = entry;
    highlights.select(entry ? entry.mover.square : null);
    highlights.showMoves(entry ? movesOf(entry) : []);
    highlights.showCaptures(entry ? capturesOf(entry) : []);
    refreshButtons();
  }

  function onBusy(busy) {
    state.busy = busy;
    refreshButtons();
  }

  function removePiece(entry) {
    stage.scene.remove(entry.piece.object);
    pieces.splice(pieces.indexOf(entry), 1);
    if (gesture.performer === entry) gesture.performer = null;
    if (gesture.last === entry) gesture.last = null;
  }

  // Sin combate posible: el vencido se esfuma y el ganador va hasta su casilla.
  async function plainCapture(attacker, defender, target) {
    await defender.mover.vanish();
    removePiece(defender);
    await attacker.mover.goTo(target);
  }

  // Una pieza se come a otra. Entre peones, un combate (duelo de lanzas o cuerpo a cuerpo, sin
  // repetir el estilo anterior); si hay una torre, una captura corta con su gigante. Si faltan
  // animaciones, el vencido se esfuma y el ganador va hasta su casilla. Pase lo que pase, el
  // tablero queda coherente.
  async function capture(attacker, defender) {
    state.fighting = true;
    highlights.clear();
    refreshButtons();
    const target = defender.mover.square;
    try {
      const obstacles = pieces.filter((entry) => entry !== attacker && entry !== defender).map((entry) => board.squareToWorld(entry.mover.square));
      const style = pickStyle(state.lastStyle);
      if (attacker.kind === 'pawn' && defender.kind === 'pawn' && canFight(attacker, defender, style)) {
        state.lastStyle = style;
        await runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, obstacles });
      } else if (canSmash(attacker, defender)) {
        await runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles });
      } else {
        await plainCapture(attacker, defender, target);
      }
    } catch (err) {
      console.error('[BChess] El combate falló:', err);
      clock.timeScale = 1;
      cinema.reset();
      if (attacker.kind === 'pawn') {
        attacker.piece.setSpearPose(null);
        attacker.piece.setSpearDefault(null);
        attacker.piece.setGripSlide(0);
      }
      attacker.mover.placeOn(target);
    } finally {
      if (pieces.includes(defender)) removePiece(defender);
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
      state.fighting = false;
      select(attacker);
    }
  }

  async function handleTap({ owner, square }) {
    if (state.busy || state.fighting) return;
    const tapped = owner ?? (square ? pieceAt(square) : null);
    const selected = state.selected;
    if (selected && tapped && tapped.color !== selected.color && capturesOf(selected).includes(tapped.mover.square)) {
      await capture(selected, tapped);
      return;
    }
    if (tapped) {
      select(tapped);
      return;
    }
    if (selected && square && movesOf(selected).includes(square)) {
      highlights.clear();
      await selected.mover.goTo(square);
      select(selected);
      return;
    }
    select(null);
  }

  onBoardTap(
    { canvas: stage.renderer.domElement, camera: stage.camera, board, targets: () => pieces.map((entry) => entry.piece.hitbox) },
    handleTap,
  );

  hud.onAction((action) => {
    if (!state.busy && !state.fighting && state.selected?.kind === 'pawn') state.selected.mover.perform(action);
  });

  function addPiece(entry, square) {
    stage.scene.add(entry.piece.object);
    entry.mover.placeOn(square);
    entry.piece.hitbox.userData.owner = entry;
    pieces.push(entry);
  }

  async function loadPawns(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.pawn]);
      const kits = await Promise.all(sides.map((side) => loadPieceKit(manifest.pieces[side.pawn], quality)));
      for (const kit of kits) kit.strikes = measureStrikes(kit, spawnPiece);
      sides.forEach((side, i) => {
        for (const file of FILES) {
          const piece = spawnPiece(kits[i]);
          const entry = { kind: 'pawn', color: side.color, piece };
          entry.mover = createMover({ piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) });
          addPiece(entry, file + side.pawnRank);
        }
      });
      for (const action of BUTTON_ACTIONS) {
        if (!kits.some((kit) => kit.has(action))) hud.hideAction(action);
      }
      refreshButtons();
    } catch (err) {
      console.error('[BChess] No se pudieron cargar los peones:', err);
      hud.showMessage('No se pudieron cargar los peones', { retry: () => loadPawns(manifest) });
    }
  }

  // Las torres van aparte: si fallan, los peones siguen funcionando.
  async function loadRooks(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.rook]);
      const kits = await Promise.all(sides.map((side) => loadRookKit(manifest.pieces[side.rook], quality)));
      sides.forEach((side, i) => {
        for (const file of ROOK_FILES) {
          const piece = spawnRook(kits[i]);
          const entry = { kind: 'rook', color: side.color, piece };
          entry.mover = createRookMover({ rook: piece, owner: entry, board, dust, rubble, clock, cinema, crowd, onBusy, restFacing: restFacingFor(side.color) });
          addPiece(entry, file + side.backRank);
        }
      });
    } catch (err) {
      console.error('[BChess] No se pudieron cargar las torres:', err);
      hud.showMessage('No se pudieron cargar las torres', { retry: () => loadRooks(manifest) });
    }
  }

  async function loadPieces() {
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      console.error('[BChess] No se pudo leer el manifiesto:', err);
      hud.showMessage('No se pudieron cargar las piezas', { retry: loadPieces });
      return;
    }
    await Promise.all([loadPawns(manifest), loadRooks(manifest)]);
  }

  await addLighting(stage, quality);
  await loadPieces();
  // Acceso para depurar desde la consola; `tap` simula un toque ({ owner, square }).
  window.bchess = {
    stage, board, quality, pieces, state, gesture, clock, highlights, fx, cinema, hud, advance, tap: handleTap, capture, crowd, rubble,
    get pawns() {
      return pieces.filter((entry) => entry.kind === 'pawn');
    },
    get rooks() {
      return pieces.filter((entry) => entry.kind === 'rook');
    },
  };
}

start();
