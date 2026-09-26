import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHighlights } from './scene/highlights.js';
import { createHud } from './ui/hud.js';
import { loadManifest, loadPieceKit, spawnPiece } from './pieces/piece.js';
import { loadRookKit, spawnRook } from './pieces/rook.js';
import { loadKnightKit, spawnKnight } from './pieces/knight.js';
import { createDust } from './fx/dust.js';
import { createRubble } from './fx/rubble.js';
import { createDebris } from './pieces/limbs.js';
import { createBubbles } from './ui/bubble.js';
import { createMover } from './moves/sequence.js';
import { createRookMover } from './moves/rook-mover.js';
import { createKnightMover } from './moves/knight-mover.js';
import { createCrowd } from './moves/crowd.js';
import { restFacingFor } from './moves/walk.js';
import { onBoardTap } from './input.js';
import { pawnCaptures, pawnMoves } from './rules/pawn.js';
import { rookMoves } from './rules/rook.js';
import { bishopMoves } from './rules/bishop.js';
import { kingMoves } from './rules/king.js';
import { queenMoves } from './rules/queen.js';
import { knightMoves } from './rules/knight.js';
import { GESTURE_RETRY_MS, nextGestureDelay, pickPerformer } from './moves/gestures.js';
import { createClock } from './combat/clock.js';
import { measureStrikes } from './combat/strikes.js';
import { createImpactFx } from './fx/impact.js';
import { createCinema } from './scene/cinema.js';
import { createFade } from './scene/fade.js';
import { pickStyle } from './combat/plan.js';
import { canFight, runCombat } from './combat/duel.js';
import { canSmash, runSmash } from './combat/smash.js';
import { canGagBattle, runGagBattle } from './combat/battles.js';

// Arranque: peones blancos en la fila 2 y negros en la 7, torres en las esquinas y caballeros en las
// columnas b y g (las piezas que traiga el manifiesto). Tocas una pieza y se marcan sus casillas
// posibles (puntos dorados) y
// los enemigos que puede comerse (aros rojos). Al tocar una casilla va hasta ella; al tocar un
// enemigo marcado, se lo come. Los botones actúan sobre el peón elegido.

const SIDES = [
  { color: 'white', pawn: 'white-pawn', rook: 'white-rook', knight: 'white-knight', bishop: 'white-bishop', queen: 'white-queen', king: 'white-king', pawnRank: 2, backRank: 1 },
  { color: 'black', pawn: 'black-pawn', rook: 'black-rook', knight: 'black-knight', bishop: 'black-bishop', queen: 'black-queen', king: 'black-king', pawnRank: 7, backRank: 8 },
];
const FILES = 'abcdefgh';
const ROOK_FILES = 'ah';
const KNIGHT_FILES = 'bg';
const BISHOP_FILES = 'cf';
const QUEEN_FILES = 'd';
const QUEEN_SWAY = 1; // la reina se mueve contoneándose (`sway.js`)
const QUEEN_GAIT = 1; // y andando de verdad, hueso a hueso, porque su modelo no trae animaciones
const QUEEN_CAPE = 1; // y con la capa colgando de su propia cadena de huesos (`cape.js`)
const KING_FILES = 'e';
const KING_SWAY = 0.35; // el rey no contonea: solo se acompaña
const KING_ARMS = 66; // sus imágenes se hicieron con los brazos en cruz, como pide el aparejo
const QUEEN_STILL = 0.35; // segundos del clip de andar en los que se queda quieta (su pose de reposo)
const BUTTON_ACTIONS = ['attack', 'hit', 'fall'];
const PICK_SLACK = 0.25; // lo que se ensancha la bola de cada pieza al buscar qué hay bajo el ratón
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
  const debris = createDebris(stage.scene);
  const fade = createFade(clock);
  const bubbles = createBubbles({ camera: stage.camera, canvas: stage.renderer.domElement, clock });
  const pieces = []; // { kind: 'pawn' | 'rook' | 'knight', color, piece, mover }
  const crowd = createCrowd({ board, entries: () => pieces });
  const state = { selected: null, busy: false, fighting: false, lastStyle: null };
  // De tanto en tanto, una sola pieza del tablero hace un gesto especial (un peón, o el caballo de un
  // caballero encabritándose); nunca dos a la vez.
  const gesture = { performer: null, last: null, lastVariant: -1, at: performance.now() + nextGestureDelay() };

  function directGestures(now) {
    if (gesture.performer) {
      if (gesture.performer.piece.fidgeting) return;
      gesture.performer = null;
      gesture.at = now + nextGestureDelay();
    }
    if (now < gesture.at) return;
    const candidates = state.busy || state.fighting
      ? []
      : pieces.filter((entry) => (entry.kind === 'pawn' || entry.kind === 'knight') && entry !== state.selected);
    const actor = pickPerformer(candidates, gesture.last);
    const variant = actor ? actor.mover.fidget({ avoid: gesture.lastVariant }) : null;
    if (variant === null) {
      gesture.at = now + GESTURE_RETRY_MS;
      return;
    }
    Object.assign(gesture, { performer: actor, last: actor, lastVariant: variant });
  }

  // Un fotograma de juego: reloj, sitio para los gigantes, animaciones, gestos y efectos.
  function frame(now, dt) {
    const step = clock.tick(dt);
    crowd.update(step);
    for (const entry of pieces) entry.piece.update(step);
    directGestures(now);
    dust.update(step);
    rubble.update(step);
    debris.update(step);
    fx.update(step);
    highlights.pulse(now / 1000, dt);
    cinema.settle();
    if (!cinema.active) stage.controls.update();
    cinema.update(dt);
    bubbles.update();
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
  // La torre y el caballero se mueven y comen igual; el peón come de otra forma que avanza.
  const reach = (entry) => {
    if (entry.kind === 'rook') return rookMoves(entry.mover.square, occupied(), enemiesOf(entry));
    if (entry.kind === 'bishop') return bishopMoves(entry.mover.square, occupied(), enemiesOf(entry));
    if (entry.kind === 'queen') return queenMoves(entry.mover.square, occupied(), enemiesOf(entry));
    if (entry.kind === 'king') return kingMoves(entry.mover.square, occupied(), enemiesOf(entry));
    return knightMoves(entry.mover.square, occupied(), enemiesOf(entry));
  };
  const movesOf = (entry) => (entry.kind === 'pawn' ? pawnMoves(entry.mover.square, occupied(), entry.color) : reach(entry).moves);
  const capturesOf = (entry) => (entry.kind === 'pawn' ? pawnCaptures(entry.mover.square, enemiesOf(entry), entry.color) : reach(entry).captures);
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
      // Las que no pelean, translúcidas: si alguna queda delante de la cámara, no tapa el combate.
      fade.dim(pieces.filter((entry) => entry !== attacker && entry !== defender).map((entry) => entry.piece.object));
      const style = pickStyle(state.lastStyle);
      if (attacker.kind === 'pawn' && defender.kind === 'pawn' && canFight(attacker, defender, style)) {
        state.lastStyle = style;
        await runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, obstacles });
      } else if (canGagBattle(attacker, defender)) {
        await runGagBattle({ attacker, defender, board, clock, fx, cinema, hud, crowd, dust, rubble, debris, bubbles, obstacles });
      } else if (attacker.kind !== 'knight' && defender.kind !== 'knight' && canSmash(attacker, defender)) {
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
      await fade.restore();
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

  // Lo que se ilumina bajo el ratón es lo que elegirá el clic: si señala una pieza, su casilla.
  function handleHover({ owner, square }) {
    highlights.hover(state.busy || state.fighting ? null : (owner?.mover.square ?? square));
  }

  onBoardTap(
    {
      canvas: stage.renderer.domElement,
      camera: stage.camera,
      board,
      targets: () => pieces.map((entry) => ({
        object: entry.piece.object,
        anchor: entry.piece.figure, // la figura, que es la que anda (la torre se va de paseo de gigante)
        lift: entry.piece.height / 2,
        reach: Math.hypot(entry.piece.radius, entry.piece.height / 2) + PICK_SLACK,
      })),
    },
    handleTap,
    handleHover,
  );

  hud.onAction((action) => {
    if (!state.busy && !state.fighting && state.selected?.kind === 'pawn') state.selected.mover.perform(action);
  });

  function addPiece(entry, square) {
    stage.scene.add(entry.piece.object);
    entry.mover.placeOn(square);
    entry.piece.object.userData.owner = entry;
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

  // Los alfiles van aparte, como los demás: si fallan, el resto del tablero sigue.
  async function loadBishops(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.bishop]);
      const kits = await Promise.all(sides.map((side) => loadPieceKit(manifest.pieces[side.bishop], quality)));
      for (const kit of kits) kit.strikes = measureStrikes(kit, spawnPiece);
      sides.forEach((side, i) => {
        for (const file of BISHOP_FILES) {
          const piece = spawnPiece(kits[i]);
          const entry = { kind: 'bishop', color: side.color, piece };
          entry.mover = createMover({ piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) });
          addPiece(entry, file + side.backRank);
        }
      });
    } catch (err) {
      console.error('[BChess] No se pudieron cargar los alfiles:', err);
      hud.showMessage('No se pudieron cargar los alfiles', { retry: () => loadBishops(manifest) });
    }
  }

  // Las reinas, como los alfiles, pero contoneándose al andar.
  async function loadQueens(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.queen]);
      const kits = await Promise.all(sides.map((side) => loadPieceKit(manifest.pieces[side.queen], quality)));
      for (const kit of kits) kit.strikes = measureStrikes(kit, spawnPiece);
      sides.forEach((side, i) => {
        for (const file of QUEEN_FILES) {
          const piece = spawnPiece(kits[i]);
          // Se desliza por el tablero en vez de dar pasos: con vestido largo, cualquier animación de
          // piernas destroza la tela (el aparejado automático se la cose a las piernas). Así que en
          // reposo se queda quieta en un fotograma de su andar y el movimiento se lo pone el contoneo.
          piece.sway = QUEEN_SWAY;
          piece.gait = QUEEN_GAIT;
          piece.cape = QUEEN_CAPE;
          piece.frozenIdle = QUEEN_STILL;
          const entry = { kind: 'queen', color: side.color, piece };
          entry.mover = createMover({ piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) });
          addPiece(entry, file + side.backRank);
        }
      });
    } catch (err) {
      console.error('[BChess] No se pudieron cargar las reinas:', err);
      hud.showMessage('No se pudieron cargar las reinas', { retry: () => loadQueens(manifest) });
    }
  }

  // Los reyes, como las reinas: andan hueso a hueso y llevan capa. Vienen con los brazos en cruz
  // —los modelos se generan así porque es lo que pide el aparejo automático, que con los brazos
  // pegados al costado cose el uno al otro—, así que lo primero es bajárselos.
  async function loadKings(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.king]);
      const kits = await Promise.all(sides.map((side) => loadPieceKit(manifest.pieces[side.king], quality)));
      for (const kit of kits) kit.strikes = measureStrikes(kit, spawnPiece);
      sides.forEach((side, i) => {
        for (const file of KING_FILES) {
          const piece = spawnPiece(kits[i]);
          piece.armDrop = KING_ARMS;
          // El báculo, erguido. La postura de la lanza la dicen normalmente los clips ("spear":
          // "upright" en el manifiesto), y el rey no trae ninguno: sin decírselo se queda en la
          // postura de embestida, cruzado por delante del cuerpo.
          piece.setSpearDefault('upright');
          piece.sway = KING_SWAY;
          piece.gait = QUEEN_GAIT;
          piece.cape = QUEEN_CAPE;
          piece.frozenIdle = QUEEN_STILL;
          const entry = { kind: 'king', color: side.color, piece };
          entry.mover = createMover({ piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) });
          addPiece(entry, file + side.backRank);
        }
      });
    } catch (err) {
      console.error('[BChess] No se pudieron cargar los reyes:', err);
      hud.showMessage('No se pudieron cargar los reyes', { retry: () => loadKings(manifest) });
    }
  }

  // Los caballeros también van aparte.
  async function loadKnights(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.knight]);
      const kits = await Promise.all(sides.map((side) => loadKnightKit(manifest.pieces[side.knight], quality)));
      sides.forEach((side, i) => {
        for (const file of KNIGHT_FILES) {
          const piece = spawnKnight(kits[i]);
          const entry = { kind: 'knight', color: side.color, piece };
          entry.mover = createKnightMover({
            knight: piece, owner: entry, pieces: () => pieces, board, dust, fx, clock, cinema, crowd, onBusy, restFacing: restFacingFor(side.color),
          });
          addPiece(entry, file + side.backRank);
        }
      });
    } catch (err) {
      console.error('[BChess] No se pudieron cargar los caballeros:', err);
      hud.showMessage('No se pudieron cargar los caballeros', { retry: () => loadKnights(manifest) });
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
    // Uno detrás de otro, no todos a la vez: así el tablero se va llenando desde el primer momento en
    // vez de quedarse vacío mientras los modelos compiten por la conexión. Primero los peones, que son
    // la mitad del tablero, y enseguida los caballeros y los alfiles, que son los que más se hacen
    // esperar.
    await loadPawns(manifest);
    await loadKnights(manifest);
    await loadBishops(manifest);
    await loadQueens(manifest);
    await loadKings(manifest);
    await loadRooks(manifest);
  }

  await addLighting(stage, quality);
  await loadPieces();
  // Acceso para depurar desde la consola; `tap` simula un toque ({ owner, square }).
  window.bchess = {
    stage, board, quality, pieces, state, gesture, clock, highlights, fx, cinema, hud, advance, tap: handleTap, capture, crowd, rubble, debris, bubbles,
    get pawns() {
      return pieces.filter((entry) => entry.kind === 'pawn');
    },
    get rooks() {
      return pieces.filter((entry) => entry.kind === 'rook');
    },
    get bishops() {
      return pieces.filter((entry) => entry.kind === 'bishop');
    },
    get knights() {
      return pieces.filter((entry) => entry.kind === 'knight');
    },
  };
}

start();
