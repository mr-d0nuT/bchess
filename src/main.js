import { DefaultLoadingManager, Vector3 } from 'three';
import { pickQuality, qualityFromQuery } from './quality.js';
import { createMusic } from './audio/music.js';
import { createLoading } from './ui/loading.js';
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
import { INITIAL_FEN, Position, describeMove, moveFrom, squareName } from './chess/position.js';
import { createCpu } from './chess/cpu.js';
import { createMenu, levelName } from './ui/menu.js';
import { createMatchUi } from './ui/match-ui.js';
import { GESTURE_RETRY_MS, nextGestureDelay, pickPerformer } from './moves/gestures.js';
import { createClock } from './combat/clock.js';
import { measureStrikes } from './combat/strikes.js';
import { createImpactFx } from './fx/impact.js';
import { createSpellFx } from './fx/spell.js';
import { createCinema } from './scene/cinema.js';
import { createView } from './scene/view.js';
import { createFade } from './scene/fade.js';
import { createFocus } from './scene/focus.js';
import { pickStyle } from './combat/plan.js';
import { canFight, runCombat } from './combat/duel.js';
import { canSmash, runSmash } from './combat/smash.js';
import { canGagBattle, runGagBattle } from './combat/battles.js';

// Arranque: la pantalla de carga, el menú (uno contra uno o contra la CPU, y su nivel) y la partida,
// con las reglas del ajedrez enteras (`chess/position.js`): empiezan las blancas, se mueve por turnos
// y solo valen las jugadas legales. Tocas una pieza tuya y se marcan en neón azul las casillas a las
// que puede ir y los enemigos que puede comerse; al tocar una de ellas, juega. Contra la CPU, ella
// piensa en su propio hilo (`chess/cpu.js`); uno contra uno, el tablero se da la vuelta en cada turno
// para que cada jugador lo vea desde su lado.

const SIDES = [
  { color: 'white', pawn: 'white-pawn', rook: 'white-rook', knight: 'white-knight', bishop: 'white-bishop', queen: 'white-queen', king: 'white-king', pawnRank: 2, backRank: 1 },
  { color: 'black', pawn: 'black-pawn', rook: 'black-rook', knight: 'black-knight', bishop: 'black-bishop', queen: 'black-queen', king: 'black-king', pawnRank: 7, backRank: 8 },
];
const FILES = 'abcdefgh';
const QUEEN_SWAY = 1; // la reina se mueve contoneándose (`sway.js`)
const QUEEN_GAIT = 1; // y andando de verdad, hueso a hueso, porque su modelo no trae animaciones
const QUEEN_CAPE = 1; // y con la capa colgando de su propia cadena de huesos (`cape.js`)
const KING_SWAY = 0.35; // el rey no contonea: solo se acompaña
const KING_ARMS = 66; // sus imágenes se hicieron con los brazos en cruz, como pide el aparejo
const QUEEN_STILL = 0.35; // segundos del clip de andar en los que se queda quieta (su pose de reposo)
const PICK_SLACK = 0.25; // lo que se ensancha la bola de cada pieza al buscar qué hay bajo el ratón
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas apartadas
const CPU_MIN_MS = 700; // la CPU nunca contesta antes: una jugada al instante parece un error
const BACK_RANK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
const KINDS = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
const NOMBRES = { pawn: 'los peones', rook: 'las torres', knight: 'los caballeros', bishop: 'los alfiles', queen: 'las reinas', king: 'los reyes' };

// Dónde empieza cada pieza de un bando.
function startSquares(kind, side) {
  if (kind === 'pawn') return [...FILES].map((file) => file + side.pawnRank);
  return BACK_RANK.flatMap((k, i) => (k === kind ? [FILES[i] + side.backRank] : []));
}
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

// El botón de la música: la quita o la pone, y se acuerda.
// La configuración: se abre con su botón y se cierra con el suyo, con Escape o tocando fuera.
function wireSettings() {
  const button = document.getElementById('ajustes');
  const panel = document.getElementById('ajustes-panel');
  const close = document.getElementById('ajustes-cerrar');
  if (!button || !panel) return;
  const abrir = (abierto) => {
    panel.hidden = !abierto;
    if (abierto) close?.focus();
    else button.focus();
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    abrir(true);
  });
  close?.addEventListener('click', () => abrir(false));
  panel.addEventListener('click', (event) => {
    if (event.target === panel) abrir(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) abrir(false);
  });
}

function wireMusicButton(music) {
  const button = document.getElementById('musica');
  if (!button) return;
  const paint = () => {
    button.setAttribute('aria-pressed', String(!music.muted));
    button.title = music.muted ? 'Poner la música' : 'Quitar la música';
  };
  paint();
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    music.toggle();
    paint();
  });
}

async function start() {
  // Lo primero, la pantalla de carga y su música, que el resto tarda unos segundos.
  const loading = createLoading();
  const music = createMusic({
    onNeedGesture: () => loading.askForSound(true),
    onGesture: () => loading.askForSound(false),
  });
  music.startIntro();
  wireMusicButton(music);
  wireSettings();
  if (!webglAvailable()) {
    loading.finish();
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
  // Los efectos: los golpes por un lado y los conjuros por otro, pero se pasan juntos a los gags
  // como un solo `fx`, que a ellos les da igual de dónde salga cada cosa.
  const impacts = createImpactFx(stage.scene);
  const spells = createSpellFx(stage.scene);
  const fx = {
    ...impacts,
    ...spells,
    update(dt) {
      impacts.update(dt);
      spells.update(dt);
    },
  };
  const cinema = createCinema(stage);
  const rubble = createRubble(stage.scene);
  const debris = createDebris(stage.scene);
  // El punto donde enfoca la cámara: el medio de los que siguen en pie (al final, el que ha ganado,
  // que es a quien se le hace el primer plano de la celebración).
  const centerOf = (entries) => {
    let x = 0;
    let z = 0;
    let alto = 0;
    for (const entry of entries) {
      x += entry.piece.figure.position.x;
      z += entry.piece.figure.position.z;
      alto = Math.max(alto, entry.piece.height);
    }
    const n = entries.length || 1;
    return { x: x / n, y: alto * 0.45, z: z / n };
  };
  // Cómo ve el atenuado a una pieza: dónde está y cuánto ocupa.
  const describe = (entry) => ({ object: entry.piece.object, anchor: entry.piece.figure, height: entry.piece.height, radius: entry.piece.radius });
  const fade = createFade(clock);
  const focus = createFocus(stage.renderer, stage.scene, stage.camera, quality);
  const bubbles = createBubbles({ camera: stage.camera, canvas: stage.renderer.domElement, clock });
  const pieces = []; // { kind: 'pawn' | 'rook' | 'knight', color, piece, mover }
  const view = createView({ stage, clock, cinema, fade, pieces: () => pieces });
  const crowd = createCrowd({ board, entries: () => pieces });
  const state = { selected: null, busy: false, fighting: false, lastStyle: null, phase: 'menu' };
  // La partida: las reglas (`Position`), las jugadas hechas (la CPU y las repeticiones las necesitan),
  // cómo se juega y a qué nivel. `id` cambia con cada partida nueva, para tirar lo que llegue tarde.
  const game = { start: INITIAL_FEN, position: Position.initial(), moves: [], mode: 'cpu', level: 30, human: 'white', id: 0, thinking: false, animating: false };
  const cpu = createCpu();
  const menu = createMenu();
  const ui = createMatchUi();
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

  // Los botones de la cámara: dar la vuelta al tablero y acercarse a la pieza elegida. Durante un
  // combate no se pueden tocar (la cámara es de la de cine), y acercarse pide una pieza elegida.
  const flipButton = document.getElementById('girar');
  const zoomButton = document.getElementById('acercar');
  flipButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    view.flip();
  });
  zoomButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (view.zoomed) view.zoomOut();
    else if (state.selected) view.zoomTo(state.selected);
  });
  function paintViewButtons() {
    const quieta = !state.fighting && !view.moving;
    if (flipButton && flipButton.disabled !== !quieta) flipButton.disabled = !quieta;
    if (!zoomButton) return;
    const puede = quieta && (view.zoomed || Boolean(state.selected));
    if (zoomButton.disabled !== !puede) zoomButton.disabled = !puede;
    const pulsado = String(view.zoomed);
    if (zoomButton.getAttribute('aria-pressed') !== pulsado) {
      zoomButton.setAttribute('aria-pressed', pulsado);
      zoomButton.title = view.zoomed ? 'Volver al tablero entero' : 'Acercarse a la pieza elegida';
      zoomButton.setAttribute('aria-label', zoomButton.title);
    }
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
    fade.update(dt, stage.camera);
    cinema.settle();
    if (!cinema.active) stage.controls.update();
    cinema.update(dt);
    bubbles.update();
    paintViewButtons();
  }

  let previous = performance.now();
  let manual = false; // mientras `advance` mueve el juego a mano
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    if (!manual) frame(now, dt);
    focus.render(dt);
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

  const pieceAt = (square) => pieces.find((entry) => entry.mover.square === square) ?? null;
  // Las jugadas que valen desde la casilla de una pieza, con las reglas de la partida en curso.
  const legalFrom = (entry) => game.position.legalMoves().filter((m) => squareName(moveFrom(m)) === entry.mover.square);
  // Lo que se marca al elegirla: las casillas libres a las que puede ir y las casillas donde come (en
  // la captura al paso, la de destino, que es la que se toca).
  function targetsOf(entry) {
    const moves = [];
    const captures = [];
    for (const m of legalFrom(entry)) {
      const plan = describeMove(game.position, m);
      const lista = plan.captured ? captures : moves;
      if (!lista.includes(plan.to)) lista.push(plan.to);
    }
    return { moves, captures };
  }
  function select(entry) {
    state.selected = entry;
    const { moves, captures } = entry ? targetsOf(entry) : { moves: [], captures: [] };
    highlights.select(entry ? entry.mover.square : null);
    highlights.showMoves(moves);
    highlights.showCaptures(captures);
    // Con la cámara acercada, elegir otra pieza la lleva a ella.
    if (entry && !state.fighting) view.follow(entry);
  }

  function onBusy(busy) {
    state.busy = busy;
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
    const target = defender.mover.square;
    try {
      const obstacles = pieces.filter((entry) => entry !== attacker && entry !== defender).map((entry) => board.squareToWorld(entry.mover.square));
      // Las que no pelean, translúcidas: si alguna queda delante de la cámara, no tapa el combate. Y
      // la que tape a los que pelean (o al que celebra), ni eso: se apaga del todo mientras tape.
      fade.dim(pieces.filter((entry) => entry !== attacker && entry !== defender).map(describe));
      const enPie = () => [attacker, defender].filter((entry) => pieces.includes(entry) && entry.piece.object.visible);
      fade.watch(() => enPie().map(describe));
      // Y la cámara enfoca a los que pelean: el resto del tablero se queda borroso. El punto se pide
      // en cada fotograma, no se fija aquí, porque los dos se mueven durante todo el combate.
      focus.on(() => centerOf(enPie().length ? enPie() : [attacker]));
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
      focus.off();
      fade.watch(null);
      await fade.restore();
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
      state.fighting = false;
    }
  }

  // ¿Puede tocar ahora el jugador? Ni en el menú, ni con algo moviéndose, ni en el turno de la CPU.
  function canPlay() {
    if (state.phase !== 'playing' || state.busy || state.fighting || game.animating || game.thinking) return false;
    return game.mode === 'pvp' || game.position.side === game.human;
  }

  async function handleTap({ owner, square }) {
    if (!canPlay()) return;
    const tapped = owner ?? (square ? pieceAt(square) : null);
    const selected = state.selected;
    const destino = tapped ? tapped.mover.square : square;
    if (selected && destino) {
      // Vale tocar la casilla de destino o la pieza que se come (en la captura al paso no es la misma).
      const jugadas = legalFrom(selected).filter((m) => {
        const plan = describeMove(game.position, m);
        return plan.to === destino || plan.captured === destino;
      });
      if (jugadas.length) {
        await playHuman(jugadas);
        return;
      }
    }
    if (tapped && tapped.color === game.position.side) {
      select(tapped === selected ? null : tapped); // tocarla otra vez la suelta
      return;
    }
    select(null);
  }

  // Una jugada del jugador. Si son varias a la misma casilla, es una coronación: se pregunta en qué.
  async function playHuman(jugadas) {
    let m = jugadas[0];
    if (jugadas.length > 1) {
      const kind = await ui.promotion(game.position.side);
      m = jugadas.find((j) => describeMove(game.position, j).promotion === kind) ?? m;
    }
    await playMove(m);
  }

  // Una jugada de principio a fin: primero se ve en el tablero —el combate si come, la torre que
  // acompaña al rey en el enroque, el peón que corona— y luego cuentan las reglas.
  async function playMove(m) {
    const plan = describeMove(game.position, m);
    const actor = pieceAt(plan.from);
    if (!actor) {
      console.error('[BChess] No hay pieza en', plan.from);
      return;
    }
    game.animating = true;
    select(null);
    highlights.check(null);
    try {
      await view.zoomOut(); // el combate lo encuadra la cámara de cine, desde el tablero entero
      if (plan.captured) {
        const victima = pieceAt(plan.captured);
        if (victima) await capture(actor, victima);
        // En la captura al paso, el que come se queda donde estaba el comido: le falta un paso.
        if (actor.mover.square !== plan.to) await actor.mover.goTo(plan.to);
      } else {
        await actor.mover.goTo(plan.to);
      }
      // El enroque: primero el rey y después la torre, que al andar hace que el rey se aparte.
      if (plan.castle) await pieceAt(plan.castle.rookFrom)?.mover.goTo(plan.castle.rookTo);
      if (plan.promotion) await promote(actor, plan.promotion);
    } catch (err) {
      console.error('[BChess] La jugada no se pudo animar:', err);
    } finally {
      game.animating = false;
    }
    game.position.make(m);
    game.moves.push(plan.uci);
    squareUp();
    await afterMove();
  }

  // El peón que llega al final se convierte: se esfuma entre destellos y en su casilla crece de la
  // nada la pieza nueva.
  async function promote(pawn, kind) {
    const square = pawn.mover.square;
    const at = board.squareToWorld(square);
    fx.burst(new Vector3(at.x, 0.9, at.z), { size: 1.6, sparks: 30 });
    fx.updraft(new Vector3(at.x, 0, at.z), { seconds: 1.2, count: 30, color: '#ffe7a0', radius: 0.45, height: 2.2 });
    await pawn.mover.vanish();
    removePiece(pawn);
    const entry = spawnEntry(kind, pawn.color, square);
    if (!entry) return;
    const object = entry.piece.object;
    object.scale.setScalar(0.01);
    dust.puff(new Vector3(at.x, 0.05, at.z), { count: 14, radius: 0.6, duration: 0.6 });
    await clock.tween(0.6, (t) => object.scale.setScalar(Math.max(0.01, 1 - (1 - t) ** 3)));
    object.scale.setScalar(1);
  }

  // El tablero ha de decir lo mismo que las reglas. Si una animación se ha torcido, se corrige aquí
  // (y se avisa): una pieza fuera de su sitio estropea la partida entera.
  function squareUp() {
    for (const entry of [...pieces]) {
      const debe = game.position.pieceAt(entry.mover.square);
      if (!debe || debe.kind !== entry.kind || debe.color !== entry.color) {
        console.warn('[BChess] Pieza de más en', entry.mover.square, entry.kind, entry.color);
        removePiece(entry);
      }
    }
    for (let rank = 1; rank <= 8; rank++) {
      for (const file of FILES) {
        const square = file + rank;
        const debe = game.position.pieceAt(square);
        if (debe && !pieceAt(square)) {
          console.warn('[BChess] Falta una pieza en', square, debe.kind, debe.color);
          spawnEntry(debe.kind, debe.color, square);
        }
      }
    }
  }

  // Después de cada jugada: jaque, final, de quién es el turno y, si toca, la CPU o la vuelta al
  // tablero para el otro jugador.
  async function afterMove() {
    const status = game.position.status();
    const side = game.position.side;
    const enJaque = status === 'check' || status === 'checkmate';
    highlights.check(enJaque ? squareName(game.position.kings[game.position.turn >> 3]) : null);
    if (status !== 'playing' && status !== 'check') {
      await gameOver(status);
      return;
    }
    if (status === 'check') ui.banner('¡JAQUE!');
    paintTurn();
    if (game.mode === 'pvp') await view.flipTo(side === 'black');
    else if (side !== game.human) cpuTurn();
  }

  async function cpuTurn() {
    const id = game.id;
    game.thinking = true;
    paintTurn();
    const inicio = performance.now();
    let uci = null;
    try {
      uci = await cpu.think({ fen: game.start, moves: game.moves.slice() }, game.level);
    } catch (err) {
      console.error('[BChess] La CPU no ha podido pensar:', err);
    }
    const falta = CPU_MIN_MS - (performance.now() - inicio);
    if (falta > 0) await new Promise((resolve) => setTimeout(resolve, falta));
    game.thinking = false;
    if (id !== game.id || state.phase !== 'playing') return; // otra partida, o de vuelta en el menú
    const m = (uci && game.position.findUci(uci)) ?? game.position.legalMoves()[0];
    if (m === undefined || m === null) return;
    paintTurn();
    await playMove(m);
  }

  async function gameOver(status) {
    state.phase = 'over';
    select(null);
    paintTurn();
    const winner = status === 'checkmate' ? (game.position.side === 'white' ? 'black' : 'white') : null;
    ui.banner(status === 'checkmate' ? '¡JAQUE MATE!' : 'TABLAS', { tipo: status === 'checkmate' ? 'jaque' : 'tablas', ms: 1700 });
    await new Promise((resolve) => setTimeout(resolve, 1700));
    const que = await ui.gameOver({ status, winner, mode: game.mode, human: game.human });
    if (que === 'rematch') await newGame({ mode: game.mode, level: game.level });
    else await toMenu();
  }

  function paintTurn() {
    ui.turn({ side: game.position.side, mode: game.mode, human: game.human, thinking: game.thinking, hidden: state.phase !== 'playing' });
  }

  function paintSettings() {
    const texto = document.getElementById('ajustes-partida');
    if (texto) texto.textContent = game.mode === 'cpu' ? `1 contra CPU · nivel ${game.level} (${levelName(game.level)})` : '1 contra 1';
  }

  // Tablero nuevo: fuera todas las piezas y cada una otra vez en su casilla de salida.
  function resetPieces() {
    for (const entry of [...pieces]) removePiece(entry);
    debris.clear();
    for (const side of SIDES) {
      for (const kind of KINDS) {
        for (const square of startSquares(kind, side)) spawnEntry(kind, side.color, square);
      }
    }
  }

  async function newGame({ mode, level }) {
    game.id += 1;
    cpu.cancel();
    ui.closeAll();
    select(null);
    highlights.check(null);
    if (game.moves.length || pieces.length !== 32) resetPieces(); // al empezar, el tablero ya está puesto
    game.start = INITIAL_FEN;
    game.position = Position.initial();
    game.moves = [];
    game.mode = mode;
    game.level = level;
    game.thinking = false;
    await view.zoomOut();
    await view.flipTo(false); // las blancas empiezan, y se juega desde su lado
    state.phase = 'playing';
    paintTurn();
    paintSettings();
  }

  // Al menú: vuelve la melodía de la carga y, al pulsar JUGAR, se funde y empieza la partida elegida.
  async function toMenu() {
    state.phase = 'menu';
    game.id += 1;
    cpu.cancel();
    ui.closeAll();
    select(null);
    music.backToIntro();
    const eleccion = await menu.show();
    music.endIntro();
    await newGame(eleccion);
    await menu.hide();
  }

  // Para depurar desde la consola: la partida desde una posición cualquiera, en FEN. Las piezas que
  // sobran se quitan y las que faltan aparecen en su casilla.
  function setup(fen) {
    game.start = fen;
    game.position = Position.fromFEN(fen);
    game.moves = [];
    select(null);
    squareUp();
    const status = game.position.status();
    highlights.check(status === 'check' ? squareName(game.position.kings[game.position.turn >> 3]) : null);
    paintTurn();
  }

  document.getElementById('ajustes-menu')?.addEventListener('click', () => {
    document.getElementById('ajustes-panel').hidden = true;
    if (state.phase === 'menu' || game.animating || state.fighting) return;
    toMenu();
  });

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

  function addPiece(entry, square) {
    stage.scene.add(entry.piece.object);
    entry.mover.placeOn(square);
    entry.piece.object.userData.owner = entry;
    pieces.push(entry);
  }

  // Los modelos de cada pieza de cada bando, cargados una sola vez: de aquí salen las piezas del
  // principio, las de cada partida nueva y aquella en que se corona un peón.
  const kits = {}; // kind → { white, black }

  // Una pieza nueva, de `kind` y `color`, puesta en `square`.
  function spawnEntry(kind, color, square) {
    const kit = kits[kind]?.[color];
    if (!kit) return null;
    const restFacing = restFacingFor(color);
    let entry;
    if (kind === 'rook') {
      const piece = spawnRook(kit);
      entry = { kind, color, piece };
      entry.mover = createRookMover({ rook: piece, owner: entry, board, dust, rubble, clock, cinema, crowd, onBusy, restFacing });
    } else if (kind === 'knight') {
      const piece = spawnKnight(kit);
      entry = { kind, color, piece };
      entry.mover = createKnightMover({
        knight: piece, owner: entry, pieces: () => pieces, board, dust, fx, clock, cinema, crowd, onBusy, restFacing,
      });
    } else {
      const piece = spawnPiece(kit);
      if (kind === 'queen') {
        // Anda hueso a hueso (su modelo no trae animaciones) y contoneándose, con la capa colgando
        // de su propia cadena de huesos; en reposo se queda quieta en un fotograma de su andar.
        piece.sway = QUEEN_SWAY;
        piece.gait = QUEEN_GAIT;
        piece.cape = QUEEN_CAPE;
        piece.frozenIdle = QUEEN_STILL;
      }
      if (kind === 'king') {
        // Viene con los brazos en cruz (es lo que pide el aparejo automático): se le bajan. Y el
        // báculo, erguido: sin decírselo se queda en la postura de embestida, cruzado por delante.
        piece.armDrop = KING_ARMS;
        piece.setSpearDefault('upright');
        piece.sway = KING_SWAY;
        piece.gait = QUEEN_GAIT;
        piece.cape = QUEEN_CAPE;
        piece.frozenIdle = QUEEN_STILL;
      }
      entry = { kind, color, piece };
      // El peón, como el caballo, mueve de cine: la cámara se acerca a verlo andar.
      const cine = kind === 'pawn' ? {
        cinema,
        obstacles: () => pieces.filter((other) => other !== entry).map((other) => board.squareToWorld(other.mover.square)),
      } : {};
      entry.mover = createMover({ piece, board, dust, clock, onBusy, restFacing, ...cine });
    }
    addPiece(entry, square);
    // La mano del rey se cierra sobre el báculo lo último: el puño se busca con los brazos ya
    // bajados y la pieza en su casilla, no sobre el modelo recién cargado.
    if (kind === 'king') entry.piece.closeHandOnSpear();
    return entry;
  }

  // Carga los modelos de un tipo de pieza (los dos bandos) y pone cada pieza en su casilla. Cada tipo
  // va aparte: si uno falla, el resto del tablero sigue.
  async function loadKind(manifest, kind, load, { strikes = true } = {}) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side[kind]]);
      const loaded = await Promise.all(sides.map((side) => load(manifest.pieces[side[kind]], quality)));
      if (strikes) for (const kit of loaded) kit.strikes = measureStrikes(kit, spawnPiece);
      kits[kind] = {};
      sides.forEach((side, i) => {
        kits[kind][side.color] = loaded[i];
        for (const square of startSquares(kind, side)) spawnEntry(kind, side.color, square);
      });
    } catch (err) {
      console.error(`[BChess] No se pudieron cargar ${NOMBRES[kind]}:`, err);
      hud.showMessage(`No se pudieron cargar ${NOMBRES[kind]}`, { retry: () => loadKind(manifest, kind, load, { strikes }) });
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
    // La barra de la pantalla de carga: cada tipo de pieza pesa lo que suele tardar, y dentro de cada
    // uno avanza con los ficheros que van llegando (hasta el 90 % de su parte: el resto es prepararlos).
    const tipos = [
      ['Formando a los peones', (m) => loadKind(m, 'pawn', loadPieceKit), 0.12],
      ['Ensillando a los caballos', (m) => loadKind(m, 'knight', loadKnightKit, { strikes: false }), 0.3],
      ['Bendiciendo a los alfiles', (m) => loadKind(m, 'bishop', loadPieceKit), 0.14],
      ['Peinando a las reinas', (m) => loadKind(m, 'queen', loadPieceKit), 0.1],
      ['Puliendo las coronas', (m) => loadKind(m, 'king', loadPieceKit), 0.12],
      ['Despertando a los gigantes', (m) => loadKind(m, 'rook', loadRookKit, { strikes: false }), 0.17],
    ];
    let hecho = 0.05;
    let cuenta = { loaded: 0, total: 0 };
    let tramo = null;
    DefaultLoadingManager.onProgress = (url, loaded, total) => {
      cuenta = { loaded, total };
      if (!tramo) return;
      const nuevos = cuenta.total - tramo.desde;
      const f = nuevos > 0 ? (cuenta.loaded - tramo.desde) / nuevos : 0;
      loading.progress(hecho + tramo.peso * Math.min(0.9, f));
    };
    for (const [label, carga, peso] of tipos) {
      tramo = { desde: cuenta.loaded, peso };
      loading.progress(hecho, label);
      await carga(manifest);
      hecho += peso;
      loading.progress(hecho);
    }
    tramo = null;
  }

  loading.progress(0.02, 'Encendiendo las antorchas');
  await addLighting(stage, quality);
  await loadPieces();
  // Acceso para depurar desde la consola; `tap` simula un toque ({ owner, square }).
  window.bchess = {
    stage, board, quality, pieces, state, gesture, clock, highlights, fx, cinema, focus, hud, advance, tap: handleTap, capture, crowd, rubble, debris, bubbles, music, view,
    game, menu, ui, cpu, newGame, playMove, toMenu, setup,
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
  // Todo cargado: la pantalla de carga se funde y debajo espera el menú, con la melodía de la carga
  // sonando todavía. Al pulsar JUGAR se funde la música y empieza la partida.
  const eleccion = menu.show();
  await loading.finish();
  const elegido = await eleccion;
  music.endIntro();
  await newGame(elegido);
  await menu.hide();
}

start();
