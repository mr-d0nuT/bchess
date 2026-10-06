import { DefaultLoadingManager, Vector3 } from 'three';
import { pickQuality, qualityFromQuery } from './quality.js';
import { createMusic } from './audio/music.js';
import { unlockAudioOnGesture } from './audio/context.js';
import { sfx } from './audio/sfx.js';
import { voicesFor } from './audio/voces.js';
import { createLoading } from './ui/loading.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createAttract } from './scene/attract.js';
import { createBoard } from './scene/board.js';
import { createHighlights } from './scene/highlights.js';
import { createHud } from './ui/hud.js';
import { SHIELD_ARM, loadManifest, loadPieceKit, spawnPiece } from './pieces/piece.js';
import { loadRookKit, spawnRook } from './pieces/rook.js';
import { loadKnightKit, spawnKnight } from './pieces/knight.js';
import { createDust } from './fx/dust.js';
import { createRubble } from './fx/rubble.js';
import { createConfetti } from './fx/confetti.js';
import { createDebris } from './pieces/limbs.js';
import { createBubbles } from './ui/bubble.js';
import { createMover } from './moves/sequence.js';
import { createRookMover } from './moves/rook-mover.js';
import { createKnightMover } from './moves/knight-mover.js';
import { createCrowd } from './moves/crowd.js';
import { restFacingFor } from './moves/walk.js';
import { endsOf, gridOf, pickPair, pickTurn, place } from './moves/dodge.js';
import { onBoardTap } from './input.js';
import { INITIAL_FEN, Position, describeMove, moveFrom, squareName } from './chess/position.js';
import { createCpu } from './chess/cpu.js';
import { createOnline } from './net/online.js';
import { createOnlineUi } from './ui/online-ui.js';
import { createLobbyUi } from './ui/lobby-ui.js';
import { cleanName } from './names.js';
import { createMenu, levelName, timeLabel } from './ui/menu.js';
import { createMatchUi } from './ui/match-ui.js';
import { createChessClockUi } from './ui/chess-clock.js';
import { createHistoryUi } from './ui/history-ui.js';
import { gameRecord } from './chess/notation.js';
import { createRankingUi } from './ui/ranking-ui.js';
import { cpuRating, createRatings, isProvisional } from './rating/ratings.js';
import { createCloud } from './net/cloud.js';
import { createAuthUi } from './ui/auth-ui.js';
import { createChessClock, findTimeControl } from './chess/timecontrol.js';
import { SAVE_KEY, clockOnResume, packGame, readSavedGame } from './chess/saved-game.js';
import { initLanguage, onLanguage, t } from './i18n.js';
import { createFullscreen } from './ui/fullscreen.js';
import { GESTURE_RETRY_MS, nextGestureDelay, pickPerformer } from './moves/gestures.js';
import { createClock } from './combat/clock.js';
import { measureStrikes } from './combat/strikes.js';
import { createImpactFx } from './fx/impact.js';
import { createSpellFx } from './fx/spell.js';
import { createCinema } from './scene/cinema.js';
import { createView } from './scene/view.js';
import { createFade } from './scene/fade.js';
import { createFocus } from './scene/focus.js';
import { createFinale } from './scene/finale.js';
import { createCoronation } from './scene/coronation.js';
import { createPacer, qualitySteps } from './scene/pacer.js';
import { STYLES, pickStyle } from './combat/plan.js';
import { canFight, runCombat } from './combat/duel.js';
import { canSmash, runSmash } from './combat/smash.js';
import { battleName, battlesFor, runGagBattle, testing } from './combat/battles.js';
import { pawnThrowsBomb } from './combat/pawn-bomb.js';

// Arranque: la pantalla de carga, el menú (uno contra uno o contra la CPU, y su nivel) y la partida,
// con las reglas del ajedrez enteras (`chess/position.js`): empiezan las blancas, se mueve por turnos
// y solo valen las jugadas legales. Tocas una pieza tuya y se marcan en neón azul las casillas a las
// que puede ir y los enemigos que puede comerse; al tocar una de ellas, juega. Contra la CPU, ella
// piensa en su propio hilo (`chess/cpu.js`); uno contra uno, el tablero se da la vuelta en cada turno
// para que cada jugador lo vea desde su lado.

// El aviso de versión nueva de lo guardado en el aparato (`sw.js`): se escucha desde el principio, porque
// puede llegar antes de que el juego acabe de cargar (y lo que llega sin nadie escuchando se pierde).
let versionNueva = false;
const alHaberVersion = new Set();
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.tipo !== 'nueva-version') return;
  versionNueva = true;
  for (const fn of alHaberVersion) fn();
});

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
const GUARDA_RELOJ_MS = 5000; // con reloj, cada cuánto se guarda la partida mientras corre
// El brazo del báculo del alfil, con los nombres de Tripo o, como en su esqueleto, los de Mixamo.
const STAFF_ARM = /^(R_(Clavicle|Upperarm|Forearm|Hand)|mixamorigRight(Shoulder|Arm|ForeArm|Hand))/;
const SONIDO_CERCA = 6; // a esta distancia de la cámara (o menos), los pasos suenan enteros
const SONIDO_LEJOS = 0.2; // y nunca por debajo de esto
const VIBRA_DESDE = 0.12; // temblores más flojos que esto no vibran
const VIBRA_MS = 220; // milisegundos de vibración por unidad de temblor (el de la bomba, 0,35: 77 ms)
const NUBE_PASO = 5; // de cada malla, un vértice de cada tantos para saber a quién toca un caballo
const NUBE_SUELO = 0.45; // y solo lo de encima de las peanas, que no se giran
const VECINDAD = 1.6; // piezas más lejos que esto (entre centros de casilla) no llegan a tocar a un caballo
// Lo que tarda una pieza recién puesta en tomar su postura: la animación se aplica al actualizarla, y el
// rey además baja los brazos poco a poco (su modelo viene en cruz). Antes de eso su forma no vale.
const POSTURA_SEGUNDOS = 0.5;
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

// Los botones suenan al pulsarlos; JUGAR y «Continuar», con su ¡fiuuu! El reloj tiene su propio golpe.
function wireButtonSounds() {
  document.addEventListener('click', (event) => {
    const boton = event.target.closest?.('button');
    if (!boton || boton.disabled || boton.classList.contains('pulsador')) return;
    sfx.play(boton.id === 'menu-jugar' || boton.id === 'menu-continuar' ? 'jugar' : 'clic');
  }, true);
}

// Las voces (gritos, quejidos, risas), con su propio interruptor: hay a quien le gustan los golpes y no
// los gritos. Al ponerlas, se oye un grito de muestra.
function wireVoicesButton() {
  const button = document.getElementById('voces');
  const estado = document.getElementById('voces-estado');
  if (!button) return;
  const paint = () => {
    button.setAttribute('aria-pressed', String(!sfx.voicesMuted));
    button.setAttribute('aria-label', t('ajustes.voces'));
    if (estado) estado.textContent = sfx.voicesMuted ? t('ajustes.voces.no') : t('ajustes.voces.si');
  };
  paint();
  onLanguage(paint);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    sfx.toggleVoices();
    paint();
    if (!sfx.voicesMuted) sfx.play('victoria_h', { volume: 0.7 });
  });
}

// Los efectos de sonido, igual. Al ponerlos, suena uno de muestra.
function wireEffectsButton() {
  const button = document.getElementById('efectos');
  const estado = document.getElementById('efectos-estado');
  if (!button) return;
  const paint = () => {
    button.setAttribute('aria-pressed', String(!sfx.muted));
    button.setAttribute('aria-label', t('ajustes.efectos'));
    if (estado) estado.textContent = sfx.muted ? t('ajustes.efectos.no') : t('ajustes.efectos.si');
  };
  paint();
  onLanguage(paint);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    sfx.toggle();
    paint();
    if (!sfx.muted) sfx.play('espadas', { volume: 0.6 });
  });
  // El volumen: se oye cómo queda al soltarlo.
  const rango = document.getElementById('efectos-volumen');
  if (rango) {
    rango.value = String(Math.round(sfx.volume * 100));
    rango.addEventListener('input', () => { sfx.volume = Number(rango.value) / 100; });
    rango.addEventListener('change', () => sfx.play('pieza'));
  }
}

// La música se quita y se pone desde la configuración (el engranaje): su nota y si suena o no.
function wireMusicButton(music) {
  const button = document.getElementById('musica');
  const estado = document.getElementById('musica-estado');
  if (!button) return;
  const paint = () => {
    button.setAttribute('aria-pressed', String(!music.muted));
    button.title = music.muted ? t('boton.musica.poner') : t('boton.musica.quitar');
    button.setAttribute('aria-label', t('ajustes.musica'));
    if (estado) estado.textContent = music.muted ? t('ajustes.musica.no') : t('ajustes.musica.si');
  };
  paint();
  onLanguage(paint);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    music.toggle();
    paint();
  });
  const rango = document.getElementById('musica-volumen');
  if (rango) {
    rango.value = String(Math.round(music.volume * 100));
    rango.addEventListener('input', () => { music.volume = Number(rango.value) / 100; });
  }
}

async function start() {
  // Lo primero, el idioma (el de la última vez o el del navegador) y la pantalla de carga con su
  // música, que el resto tarda unos segundos.
  initLanguage();
  // A pantalla completa en cuanto se toque algo (antes no deja el navegador).
  createFullscreen(document.getElementById('pantalla'));
  const loading = createLoading();
  const music = createMusic({
    onNeedGesture: () => loading.askForSound(true),
    onGesture: () => loading.askForSound(false),
  });
  music.startIntro();
  wireMusicButton(music);
  wireEffectsButton();
  wireVoicesButton();
  wireButtonSounds();
  unlockAudioOnGesture();
  wireSettings();
  if (!webglAvailable()) {
    loading.finish();
    hud.showMessage(t('error.webgl'));
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
  // Al devolver la cámara al usuario, fuera el desenfoque: si no, se quedaba un momento sobre el tablero entero.
  const cinema = createCinema(stage, { onShake: (size) => vibra(size), onRestore: () => focus.off() });
  const rubble = createRubble(stage.scene);
  const debris = createDebris(stage.scene);
  // El jaque mate de película: el rey vencido de rodillas, confeti, fuegos y la cámara dando vueltas.
  const confetti = createConfetti(stage.scene);
  // La coronación de película: columna de luz, el peón sube girando y baja convertido, y hace su pose.
  const coronation = createCoronation({ scene: stage.scene, camera: stage.camera, cinema, clock, fx, dust, confetti });
  // Mientras dura, lo que tape al rey vencido se apaga, como en los combates, y el resto se desenfoca.
  const finale = createFinale({
    clock,
    cinema,
    camera: stage.camera,
    confetti,
    dust,
    onFocus: (king) => {
      fade.dim(pieces.filter((entry) => entry !== king).map(describe), { opacity: 1 });
      fade.watch(() => (pieces.includes(king) ? [describe(king)] : []));
      focus.on(() => {
        const p = king.piece.figure.position;
        return new Vector3(p.x, 1, p.z);
      });
    },
    offFocus: () => {
      focus.off();
      fade.watch(null);
      fade.restore();
    },
  });
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
  // Y a la que se mueve, que no la tape nadie: la torre anda como gigante, que es otra figura y más alta.
  const describeMoving = (entry) => {
    const giant = entry.kind === 'rook' ? entry.piece.giant : null;
    return giant ? { ...describe(entry), anchor: giant.figure, height: giant.height ?? entry.piece.height * 1.6 } : describe(entry);
  };
  const fade = createFade(clock);
  const focus = createFocus(stage.renderer, stage.scene, stage.camera, quality);
  const bubbles = createBubbles({ camera: stage.camera, canvas: stage.renderer.domElement, clock });
  const pieces = []; // { kind: 'pawn' | 'rook' | 'knight', color, piece, mover }
  // La cámara del menú: detrás de él, el tablero de verdad recorrido en tomas de cine. Mientras dura, los
  // botones de la cámara (dar la vuelta, acercarse) esperan.
  const attract = createAttract({ stage, clock, pieces: () => pieces, focus, veil: document.getElementById('menu-velo') });
  const view = createView({ stage, clock, cinema, fade, pieces: () => pieces, busy: () => attract.active });
  const crowd = createCrowd({ board, entries: () => pieces });
  const state = { selected: null, busy: false, fighting: false, lastStyle: null, phase: 'menu' };
  // La partida: las reglas (`Position`), las jugadas hechas (la CPU y las repeticiones las necesitan),
  // cómo se juega y a qué nivel. `id` cambia con cada partida nueva, para tirar lo que llegue tarde.
  const game = {
    start: INITIAL_FEN, position: Position.initial(), moves: [], mode: 'cpu', level: 30, human: 'white', color: 'white',
    id: 0, thinking: false, animating: false, control: null, clock: null, press: null, enCurso: null, deConsola: false,
    nombres: { white: '', black: '' }, // los de los jugadores (1 contra 1 y online), si los han puesto
    miNombre: '', // online, el mío
  };
  const cpu = createCpu();
  // LA PUNTUACIÓN (el ranking, `rating/ratings.js`): la del jugador por ritmo, la de contra la CPU y la del
  // ranking local del uno contra uno. El trofeo del menú la enseña y abre el panel.
  const ratings = createRatings();
  // Y LA CUENTA (`net/cloud.js`, Firebase en su plan gratuito): con ella, la puntuación se guarda en la nube
  // (la misma en todos los aparatos) y se sale en el ranking mundial. Sin configurar Firebase, no aparece.
  const cloud = createCloud();
  const ranking = createRankingUi({ ratings, button: document.getElementById('menu-ranking'), world: cloud.available });
  createAuthUi({ cloud, area: ranking.accountArea });
  // El nombre en el ranking: el que se ha puesto para jugar online; si no, el nombre de pila de la cuenta.
  const nombreEnRanking = (user) => cleanName(game.miNombre || (user?.name ?? '').split(' ')[0]) || 'Jugador';
  if (cloud.available) {
    // Al entrar: lo de la nube y lo del aparato se juntan (de cada ritmo, lo más reciente) y se guarda.
    cloud.onUser(async (user) => {
      ranking.meUid = user?.uid ?? null;
      ranking.refresh();
      if (!user?.verified) return;
      const remoto = await cloud.load();
      if (remoto) ratings.import(remoto);
      cloud.save({ name: nombreEnRanking(user), data: ratings.export() });
    });
    // Y al acabar cada partida, a la nube (una escritura; si hay varias seguidas, se juntan).
    ratings.onChange(() => {
      if (cloud.user?.verified) cloud.save({ name: nombreEnRanking(cloud.user), data: ratings.export() });
    });
    const pideMundial = async (categoria) => ranking.setWorld(await cloud.leaderboard(categoria), categoria);
    ranking.onOpen = () => pideMundial(ranking.worldCategory);
    ranking.onWorld = pideMundial;
  }
  // Las partidas online (`net/online.js`): se conecta al buscar la primera. Online, `game.session` es la
  // partida con el rival; sus jugadas llegan a `game.remote` (número de jugada → jugada).
  const online = createOnline();
  const onlineUi = createOnlineUi();
  const menu = createMenu({
    onShow: () => attract.start(),
    onHide: () => attract.stop(),
    onChange: (eleccion) => ponMiNombre(eleccion.nombres?.yo),
  });
  // LA SALA (`net/online.js`, `ui/lobby-ui.js`): se conecta al arrancar, para ver quién hay online (y que los
  // demás vean que estoy), retar a uno en concreto y recibir sus retos, estés donde estés.
  const sala = online.lobby();
  const salaUi = createLobbyUi({
    lobby: sala,
    time: () => menu.choice.time,
    canChallenge: () => state.phase !== 'starting',
    onGame: (id) => {
      const p = partidas.find((x) => x.id === id);
      if (p) irAPartida(p);
    },
    onDismissGame: (id) => {
      const p = partidas.find((x) => x.id === id);
      if (p?.acabada && !activa(p)) quitaPartida(p);
    },
    onMatch: (info) => empezarReto(info),
    // Desde el menú, como JUGAR con «Online»; a mitad de partida, la búsqueda directamente.
    onQuick: () => menu.answer({ ...menu.choice, mode: 'online' }) || jugarOnline({ time: menu.choice.time }),
  });
  // LA WEB, GUARDADA EN EL MÓVIL (`sw.js`, punto 3 del plan de mejora): carga al instante, funciona sin
  // conexión y avisa cuando hay versión nueva. En la web publicada; en local, solo con `?sw` (si no, al
  // programar se vería lo guardado y no lo último). El aviso, en el menú: actualizar recarga la página, y a
  // media partida la cortaría.
  function avisaVersion() {
    if (!versionNueva || state.phase !== 'menu') return;
    versionNueva = false;
    salaUi.notify({ texto: t('version.nueva'), boton: t('version.actualizar'), accion: () => location.reload(), dura: 0, icono: '✨' });
  }
  alHaberVersion.add(avisaVersion);
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  if ('serviceWorker' in navigator && (!local || new URLSearchParams(location.search).has('sw'))) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[BChess] Sin guardado en el aparato:', err));
  } else if ('serviceWorker' in navigator && local) {
    // En local sin `?sw`, fuera el que se registrara probando (si no, se seguiría viendo lo guardado).
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((reg) => reg.unregister())).catch(() => {});
  }

  function ponMiNombre(nombre) {
    game.miNombre = cleanName(nombre);
    sala.set({ name: game.miNombre });
    salaUi.setName(game.miNombre);
  }
  ponMiNombre(menu.choice.nombres?.yo);
  // Lo que digo de mí en la sala: disponible (en el menú o en una partida que no es online), buscando rival o
  // jugando online.
  function ponEstado(status) {
    const vivas = partidasVivas().length;
    sala.set({ status: status === 'seeking' ? 'seeking' : vivas ? 'playing' : status, games: vivas });
  }
  const ui = createMatchUi();
  const clockUi = createChessClockUi(document.getElementById('hud'));
  // Las jugadas y lo comido (punto 11): tocar una la señala en el tablero con una flecha.
  const historial = createHistoryUi({
    button: document.getElementById('historial'),
    onPoint: ({ from, to }) => highlights.trail(from, to),
  });
  const controlName = () => (game.control ? `${t(`tiempo.${game.control.key.split(':')[0]}`)} · ${timeLabel(game.control)}` : '');
  onLanguage(() => {
    ui.refresh();
    clockUi.refresh();
    paintSettings();
  });
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
    const candidates = state.busy || state.fighting || finale.playing
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
  const undoButton = document.getElementById('deshacer');
  // Tus partidas online (las que están en espera): se abre la sala, con ellas arriba. El globo, en cuántas te toca.
  const partidasBoton = document.getElementById('partidas');
  const partidasGlobo = partidasBoton?.querySelector('.boton-globo');
  partidasBoton?.addEventListener('click', (event) => {
    event.stopPropagation();
    salaUi.open();
  });
  flipButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    view.flip();
  });
  zoomButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (view.zoomed) view.zoomOut();
    else if (state.selected) view.zoomTo(state.selected);
  });
  undoButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    undoMove();
  });
  // Online, en el sitio de deshacer: rendirse. El primer toque pregunta y el segundo (en 3,5 s) confirma.
  const resignButton = document.getElementById('rendirse');
  let preguntaRendirse = 0;
  resignButton?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (resignButton.classList.contains('confirma')) {
      clearTimeout(preguntaRendirse);
      resignButton.classList.remove('confirma');
      rendirse();
      return;
    }
    resignButton.querySelector('.boton-texto').textContent = t('boton.rendirse.seguro');
    resignButton.classList.add('confirma');
    preguntaRendirse = setTimeout(() => resignButton.classList.remove('confirma'), 3500);
  });
  // LA PISTA (punto 13 del plan de mejora): la CPU piensa, a nivel alto, la mejor jugada del que mueve y la
  // marca: la flecha dorada de la casilla de salida a la de llegada, y la pieza ya elegida, que solo falta
  // tocar adónde va. Tres por partida, contra la CPU o uno contra uno; online, ninguna (sería hacer trampa).
  const PISTAS = 3;
  const PISTA_NIVEL = 85;
  const PISTA_MS = 1500;
  const pistaBoton = document.getElementById('pista');
  const pistaGlobo = pistaBoton?.querySelector('.boton-globo');
  const pista = { quedan: PISTAS, pensando: false, partida: null, titulo: '' };
  function puedePista() {
    if (state.phase !== 'playing' || game.mode === 'online' || pista.pensando || pista.quedan <= 0) return false;
    if (game.animating || state.fighting || state.busy || game.thinking || view.moving) return false;
    return game.mode !== 'cpu' || game.position.side === game.human;
  }
  pistaBoton?.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!puedePista()) return;
    const id = game.id;
    const jugadas = game.moves.length;
    pista.pensando = true;
    pistaBoton.classList.add('pensando');
    let uci = null;
    try {
      uci = await cpu.think({ fen: game.start, moves: game.moves.slice(), maxMs: PISTA_MS }, PISTA_NIVEL);
    } catch (err) {
      console.error('[BChess] Sin pista:', err);
    }
    pista.pensando = false;
    pistaBoton.classList.remove('pensando');
    // Si mientras pensaba se ha movido, o ya es otra partida, no vale (ni se gasta).
    if (!uci || id !== game.id || jugadas !== game.moves.length || state.phase !== 'playing') return;
    pista.quedan -= 1;
    sfx.play('conjuro', { volume: 0.5 });
    highlights.trail(uci.slice(0, 2), uci.slice(2, 4));
    const pieza = pieceAt(uci.slice(0, 2));
    if (pieza) select(pieza);
  });
  function pintaPista() {
    if (!pistaBoton) return;
    if (pista.partida !== game.id) {
      pista.partida = game.id; // partida nueva: otra vez tres
      pista.quedan = PISTAS;
    }
    const visible = state.phase === 'playing' && game.mode !== 'online';
    if (pistaBoton.hidden !== !visible) pistaBoton.hidden = !visible;
    const puede = puedePista();
    if (pistaBoton.disabled !== !puede) pistaBoton.disabled = !puede;
    const n = String(pista.quedan);
    if (pistaGlobo && pistaGlobo.textContent !== n) pistaGlobo.textContent = n;
    const titulo = pista.quedan > 0 ? t('boton.pista', { n }) : t('pista.ninguna');
    if (titulo !== pista.titulo) {
      pista.titulo = titulo;
      pistaBoton.title = titulo;
      pistaBoton.setAttribute('aria-label', titulo);
    }
  }

  function paintViewButtons() {
    historial.show(state.phase === 'playing' || state.phase === 'over');
    pintaPista();
    const quieta = !state.fighting && !view.moving;
    if (flipButton && flipButton.disabled !== !quieta) flipButton.disabled = !quieta;
    if (undoButton) {
      const puede = canUndo();
      if (undoButton.disabled !== !puede) undoButton.disabled = !puede;
    }
    // Online no se deshace. Y la bandera blanca, en cualquier partida (lo pidió el usuario): online gana el
    // rival; contra la CPU, la CPU; uno contra uno, se rinde el que mueve.
    const jugando = state.phase === 'playing';
    const enLinea = game.mode === 'online' && jugando;
    if (undoButton && undoButton.hidden !== enLinea) undoButton.hidden = enLinea;
    if (resignButton) {
      if (resignButton.hidden !== !jugando) resignButton.hidden = !jugando;
      const puede = jugando && !state.fighting && !game.animating;
      if (resignButton.disabled !== !puede) resignButton.disabled = !puede;
      if (!jugando) resignButton.classList.remove('confirma');
    }
    if (!zoomButton) return;
    const puede = quieta && (view.zoomed || Boolean(state.selected));
    if (zoomButton.disabled !== !puede) zoomButton.disabled = !puede;
    const pulsado = String(view.zoomed);
    const titulo = view.zoomed ? t('boton.alejar') : t('boton.acercar');
    if (zoomButton.getAttribute('aria-pressed') !== pulsado || zoomButton.title !== titulo) {
      zoomButton.setAttribute('aria-pressed', pulsado);
      zoomButton.title = titulo;
      zoomButton.setAttribute('aria-label', titulo);
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
    confetti.update(step);
    finale.update(step);
    highlights.pulse(now / 1000, dt);
    fade.update(dt, stage.camera);
    cinema.settle();
    if (!cinema.active && !attract.active) stage.controls.update();
    cinema.update(dt);
    attract.update(dt);
    bubbles.update();
    paintViewButtons();
    tickClock();
  }

  // Combates (ajustes): siempre, solo la primera vez de cada uno, o nunca (captura rápida). Se recuerda,
  // y también qué combates se han visto ya.
  const COMBATES = 'bchess.combates';
  const VISTOS = 'bchess.combates.vistos';
  const leerPreferencia = (clave, porDefecto) => {
    try { return localStorage.getItem(clave) ?? porDefecto; } catch { return porDefecto; }
  };
  const guardarPreferencia = (clave, valor) => {
    try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: solo esta sesión */ }
  };
  let modoCombates = leerPreferencia(COMBATES, 'siempre');
  // VIBRACIÓN en los golpes fuertes, los que hacen temblar la cámara: más larga cuanto más fuerte. Solo
  // donde el navegador deja (en el iPhone, Safari no deja vibrar a las páginas): ahí el ajuste no sale.
  const VIBRACION = 'bchess.vibracion';
  const puedeVibrar = typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches;
  let vibrar = leerPreferencia(VIBRACION, 'si') !== 'no';
  function vibra(size) {
    if (!puedeVibrar || !vibrar || size < VIBRA_DESDE || sfx.silenced()) return;
    try { navigator.vibrate(Math.round(VIBRA_MS * size)); } catch { /* sin permiso aún */ }
  }
  {
    const seccion = document.getElementById('ajustes-vibracion');
    const boton = document.getElementById('vibracion');
    const estado = document.getElementById('vibracion-estado');
    if (puedeVibrar && seccion && boton) {
      seccion.hidden = false;
      const pinta = () => {
        boton.setAttribute('aria-pressed', String(vibrar));
        boton.setAttribute('aria-label', t('ajustes.vibracion'));
        if (estado) estado.textContent = t(vibrar ? 'ajustes.vibracion.si' : 'ajustes.vibracion.no');
      };
      pinta();
      onLanguage(pinta);
      boton.addEventListener('click', () => {
        vibrar = !vibrar;
        guardarPreferencia(VIBRACION, vibrar ? 'si' : 'no');
        pinta();
        if (vibrar) navigator.vibrate(60);
      });
    }
  }
  const vistos = new Set((() => {
    try { return JSON.parse(leerPreferencia(VISTOS, '[]')); } catch { return []; }
  })());
  const botonesCombates = [...document.querySelectorAll('#ajustes-combates button')];
  const pintaCombates = () => {
    for (const boton of botonesCombates) boton.setAttribute('aria-pressed', String(boton.dataset.combates === modoCombates));
  };
  for (const boton of botonesCombates) {
    boton.addEventListener('click', () => {
      modoCombates = boton.dataset.combates;
      guardarPreferencia(COMBATES, modoCombates);
      pintaCombates();
    });
  }
  pintaCombates();

  // Saltar combates (punto 1 del plan): una partida tiene 15-30 capturas y cada combate dura de 10 a 50
  // segundos. Durante uno, un toque lo acelera y otro lo salta: la pantalla se funde a negro, el combate
  // corre por detrás a toda velocidad (como en las pruebas, con `advance`) y, al acabar, vuelve la imagen.
  // El toque que empieza la captura no cuenta (llega a la vez que empieza el combate).
  const SALTO_ACELERA = 3; // fotogramas de juego por fotograma de pantalla, acelerando
  const SALTO_IGNORA = 450; // ms tras empezar el combate en que un toque no cuenta
  const SALTO_FUNDIDO = 260; // ms del fundido a negro antes de saltar
  const salto = { velocidad: 1, saltando: false, desde: 0 };
  // Al saltar un combate, lo que queda pasa de golpe: sus sonidos sonarían todos a la vez.
  sfx.silenced = () => salto.saltando || testing.active;
  // Lo que se oye algo según lo lejos que esté de la cámara: entero hasta CERCA y, más allá, menos.
  const enMundo = new Vector3();
  const cercania = (figure) => {
    if (!figure?.getWorldPosition) return 1;
    const lejos = figure.getWorldPosition(enMundo).distanceTo(stage.camera.position);
    return Math.max(SONIDO_LEJOS, Math.min(1, SONIDO_CERCA / Math.max(1e-3, lejos)));
  };
  const botonSaltar = document.getElementById('saltar');
  const fundido = document.getElementById('fundido');
  function pintaSalto() {
    if (!botonSaltar) return;
    botonSaltar.hidden = !state.fighting || salto.saltando;
    botonSaltar.textContent = salto.velocidad > 1 ? `⏭ ${t('combate.saltar')}` : `⏩ ${t('combate.acelerar')}`;
  }
  function finSalto() {
    salto.velocidad = 1;
    salto.saltando = false;
    fundido?.classList.remove('negro');
    pintaSalto();
  }
  async function tocaCombate() {
    if (!state.fighting || salto.saltando || performance.now() - salto.desde < SALTO_IGNORA) return;
    if (salto.velocidad === 1) {
      salto.velocidad = SALTO_ACELERA;
      pintaSalto();
      return;
    }
    salto.saltando = true;
    salto.velocidad = 1;
    sfx.stopAll();
    fundido?.classList.add('negro');
    pintaSalto();
    await new Promise((resolve) => { setTimeout(resolve, SALTO_FUNDIDO); });
    while (state.fighting) await advance(0.5, 30);
  }
  botonSaltar?.addEventListener('click', (event) => {
    event.stopPropagation();
    tocaCombate();
  });
  // Durante la escena del jaque mate, un toque saca ya el cartel del final.
  stage.renderer.domElement.addEventListener('pointerup', () => (finale.playing ? finale.hurry() : tocaCombate()));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Enter') (finale.playing ? finale.hurry() : tocaCombate());
  });
  onLanguage(pintaSalto);

  let previous = performance.now();
  let manual = false; // mientras `advance` mueve el juego a mano
  // El ritmo de los fotogramas (`scene/pacer.js`): a 30 cuando no pasa nada, a 60 como mucho, y la calidad
  // que baja sola si el aparato va justo. «No pasa nada»: nadie toca la pantalla desde hace un rato y no se
  // mueve ninguna pieza ni la cámara.
  const CALMA_TRAS = 1500; // ms sin tocar nada
  let tocadoEn = performance.now();
  const toca = () => {
    tocadoEn = performance.now();
  };
  for (const tipo of ['pointerdown', 'pointermove', 'wheel', 'keydown']) window.addEventListener(tipo, toca, { passive: true });
  const enCalma = (now) => now - tocadoEn > CALMA_TRAS && !game.animating && !state.fighting && !cinema.active
    && !view.moving && !finale.playing && !confetti.active && salto.velocidad === 1 && !salto.saltando;
  const pacer = createPacer({
    steps: qualitySteps({ devicePixelRatio: window.devicePixelRatio, ...quality }),
    apply: (step) => {
      stage.renderer.setPixelRatio(step.pixelRatio);
      // Las sombras, con menos detalle: el mapa se rehace solo con el tamaño nuevo.
      stage.scene.traverse((o) => {
        if (!o.isDirectionalLight || !o.castShadow || o.shadow.mapSize.x === step.shadowMapSize) return;
        o.shadow.mapSize.set(step.shadowMapSize, step.shadowMapSize);
        o.shadow.map?.dispose();
        o.shadow.map = null;
      });
    },
  });
  stage.renderer.setAnimationLoop((now) => {
    const calma = enCalma(now);
    if (!manual && pacer.skip(now, calma)) return;
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    // Acelerando un combate, varios fotogramas de juego por cada uno de pantalla: pasos de tiempo
    // normales, que con uno largo la física y los andares se descolocan.
    if (!manual) for (let i = 0; i < salto.velocidad; i++) frame(now, dt);
    if (!salto.saltando) focus.render(dt); // saltando, la pantalla está en negro
    hud.tickFps(now);
    if (!manual) pacer.rendered(now, calma);
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
    sfx.play('puf');
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
    salto.desde = performance.now();
    pintaSalto();
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
      // Y la cámara, mientras pelean, se ajusta a donde están los dos (se acerca a medida que se juntan).
      cinema.watch(() => enPie().map((entry) => {
        const p = entry.piece.figure.position;
        return { x: p.x, z: p.z, height: entry.piece.height, radius: entry.piece.radius };
      }));
      // Los combates que le pueden tocar a esta pareja, cada uno con su peso al echarlo a suertes. Entre
      // peones, un duelo y, de vez en cuando (`pawnThrowsBomb.chance`), la bomba; el estilo del duelo se
      // alterna, pero si en el que toca no tienen golpes, el otro (el cuerpo a cuerpo solo tenía un
      // puñetazo que llegase, y era de izquierda: un escudazo, y el escudo no es para pegar). Si no hay
      // gag, el gigante de la torre (`runSmash`); si nada, la captura sin combate.
      const peones = attacker.kind === 'pawn' && defender.kind === 'pawn';
      const candidatos = [];
      if (peones) {
        const elegido = pickStyle(state.lastStyle);
        const style = canFight(attacker, defender, elegido) ? elegido : STYLES.find((otro) => canFight(attacker, defender, otro));
        if (style) {
          candidatos.push({
            clave: 'duelo', peso: 1 - pawnThrowsBomb.chance,
            jugar: () => { state.lastStyle = style; return runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, obstacles }); },
          });
        }
      }
      for (const gag of battlesFor(attacker, defender)) {
        candidatos.push({
          clave: `${battleName(gag)}:${defender.kind}`, gag, peso: peones && gag === pawnThrowsBomb ? pawnThrowsBomb.chance : 1,
          jugar: () => runGagBattle({ attacker, defender, board, clock, fx, cinema, hud, crowd, dust, rubble, debris, bubbles, obstacles, pick: gag }),
        });
      }
      if (!candidatos.length && attacker.kind !== 'knight' && defender.kind !== 'knight' && canSmash(attacker, defender)) {
        candidatos.push({ clave: `gigante:${attacker.kind}>${defender.kind}`, peso: 1, jugar: () => runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles, dust, rubble }) });
      }
      const combate = elegirCombate(candidatos);
      if (combate) {
        await combate.jugar();
        resumen.combates += 1;
        if (!testing.active) {
          vistos.add(combate.clave);
          guardarPreferencia(VISTOS, JSON.stringify([...vistos]));
        }
      } else {
        await plainCapture(attacker, defender, target);
      }
    } catch (err) {
      console.error('[BChess] El combate falló:', err);
      clock.timeScale = 1;
      cinema.reset();
      if (attacker.kind === 'pawn') {
        attacker.piece.holdSpear(); // la lanza, a la mano (si la había clavado o lanzado)
        attacker.piece.setSpearPose(null);
        attacker.piece.setSpearDefault(null);
        attacker.piece.setGripSlide(0);
      }
      attacker.mover.placeOn(target);
    } finally {
      if (pieces.includes(defender)) removePiece(defender);
      focus.off();
      cinema.watch(null);
      fade.watch(null);
      await fade.restore();
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
      state.fighting = false;
      finSalto();
    }
  }

  // De los combates que pueden tocar, cuál, según el ajuste: con «nunca», ninguno (captura rápida); con
  // «la primera vez», solo los que aún no se han visto. Entre los que quedan, a suertes según su peso (la
  // red de seguridad puede forzar uno: `testing.only`).
  function elegirCombate(candidatos) {
    const forzado = candidatos.find((c) => c.gag && c.gag === testing.only);
    if (forzado) return forzado;
    let lista = candidatos.filter((c) => c.peso > 0);
    if (modoCombates === 'nunca') lista = [];
    if (modoCombates === 'primera') lista = lista.filter((c) => !vistos.has(c.clave));
    const total = lista.reduce((suma, c) => suma + c.peso, 0);
    let r = Math.random() * total;
    for (const c of lista) {
      r -= c.peso;
      if (r <= 0) return c;
    }
    return lista.at(-1) ?? null;
  }

  // ¿Puede tocar ahora el jugador? Ni en el menú, ni con algo moviéndose, ni en el turno de la CPU.
  function canPlay() {
    if (state.phase !== 'playing' || state.busy || state.fighting || game.animating || game.thinking || game.press) return false;
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
        sfx.play('pieza', { rate: 0.8 }); // ¡ahí va!
        await playHuman(jugadas);
        return;
      }
    }
    if (tapped && tapped.color === game.position.side) {
      if (tapped !== selected) sfx.play('pieza');
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
    // Se guarda ya, antes del combate: si se cierra la app a media animación, al volver la jugada está
    // hecha (y si un combate llegara a colgarse, al recargar se sigue sin él).
    game.enCurso = plan.uci;
    guardarPartida();
    // Online, la del jugador sale ya hacia el rival: así la ven a la vez los dos.
    if (game.mode === 'online' && game.session && game.position.side === game.human) game.session.move(game.moves.length, plan.uci);
    select(null);
    highlights.check(null);
    try {
      await view.zoomOut(); // el combate lo encuadra la cámara de cine, desde el tablero entero
      if (plan.captured) {
        const victima = pieceAt(plan.captured);
        if (victima) await capture(actor, victima);
        // En la captura al paso, el que come se queda donde estaba el comido: le falta un paso.
        if (actor.mover.square !== plan.to) await conCamara(actor, () => actor.mover.goTo(plan.to));
      } else {
        // Si corona, la cámara se queda cerca: la coronación la toma desde ahí.
        await conCamara(actor, () => actor.mover.goTo(plan.to, { keepCamera: Boolean(plan.promotion) && actor.kind === 'pawn' }));
      }
      // El enroque: primero el rey y después la torre, que al andar hace que el rey se aparte.
      const torre = plan.castle ? pieceAt(plan.castle.rookFrom) : null;
      if (torre) await conCamara(torre, () => torre.mover.goTo(plan.castle.rookTo));
      if (plan.promotion) await promote(actor, plan.promotion);
    } catch (err) {
      console.error('[BChess] La jugada no se pudo animar:', err);
      cinema.reset(); // la cámara, al usuario ya: si no, se quedaba sin poder moverla
    } finally {
      game.animating = false;
    }
    game.position.make(m);
    game.moves.push(plan.uci);
    game.enCurso = null;
    squareUp();
    await afterMove();
  }

  // Mientras una pieza se mueve, la cámara la sigue de cerca (cada `mover` lo hace con `cinema.track`): las
  // que se le pongan delante se apagan mientras la tapen, como en los combates, y el resto del tablero se
  // desenfoca, que el ojo vaya a ella.
  async function conCamara(entry, mueve) {
    fade.dim(pieces.filter((other) => other !== entry).map(describe), { opacity: 1 });
    fade.watch(() => [describeMoving(entry)]);
    focus.on(() => stage.controls.target);
    try {
      return await mueve();
    } finally {
      focus.off();
      fade.watch(null);
      await fade.restore();
    }
  }

  // El peón que llega al final se convierte (`scene/coronation.js`): sube en una columna de luz, arriba es ya
  // la pieza elegida, baja a su casilla y hace su pose. Lo que la tape se apaga, como al moverse.
  async function promote(pawn, kind) {
    const square = pawn.mover.square;
    let actual = pawn;
    fade.dim(pieces.filter((other) => other !== pawn).map(describe), { opacity: 1 });
    fade.watch(() => (pieces.includes(actual) ? [describe(actual)] : []));
    focus.on(() => {
      const p = actual.piece.figure.position;
      return new Vector3(p.x, 1.4, p.z);
    });
    try {
      await coronation.play({
        pawn,
        color: pawn.color,
        swap: () => {
          removePiece(pawn);
          actual = spawnEntry(kind, pawn.color, square) ?? pawn;
          return actual === pawn ? null : actual;
        },
      });
    } finally {
      focus.off();
      fade.watch(null);
      await fade.restore();
    }
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
  // Los caballos quietos no se meten en las piezas de al lado (`moves/dodge.js`): el caballo mide 1,6
  // casillas de largo, y con piezas anchas cerca les metía la cabeza o la cola dentro. Para saber a quién
  // toca, cada clase de pieza (tipo y color: todas las copias son la misma malla) tiene su nube de puntos:
  // lo que asoma por encima de las peanas, en el marco de su figura (origen en el centro de su casilla, +z
  // hacia donde mira), sacado de sus mallas una sola vez y QUIETA de verdad. Medida en mitad de un gesto
  // (el peón que se asusta y recula, el caballo encabritado) o recién puesta (sin postura aún: el caballo
  // salía el doble de grande y el rey con los brazos en cruz), a los caballos les parecía que los tocaban.
  const nubes = new Map();
  const muestra = new Vector3();
  const yawDe = (entry) => entry.piece.figure?.rotation.y ?? 0;
  const claseDe = (entry) => `${entry.kind}-${entry.color}`;
  // (El rey y la reina no tienen animación de reposo: se quedan en un fotograma de su andar.)
  const quieta = (entry) => clock.now - (entry.nacida ?? -Infinity) >= POSTURA_SEGUNDOS && !entry.piece.fidgeting
    && (entry.kind === 'knight' || entry.piece.frozenIdle || (entry.piece.playing ?? 'idle') === 'idle');
  function muestreo(entry) {
    const centro = board.squareToWorld(entry.mover.square);
    const s = Math.sin(-yawDe(entry));
    const c = Math.cos(-yawDe(entry));
    const puntos = [];
    entry.piece.object.updateMatrixWorld(true);
    entry.piece.object.traverse((o) => {
      if (!o.isMesh || !o.geometry?.attributes?.position) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      if ([o.material].flat().every((m) => m?.visible === false)) return; // la zona de toque, invisible
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += NUBE_PASO) {
        muestra.fromBufferAttribute(pos, i);
        if (o.isSkinnedMesh) o.applyBoneTransform(i, muestra);
        muestra.applyMatrix4(o.matrixWorld);
        if (muestra.y < NUBE_SUELO) continue;
        const dx = muestra.x - centro.x;
        const dz = muestra.z - centro.z;
        puntos.push(dx * c + dz * s, muestra.y, -dx * s + dz * c);
      }
    });
    return Float32Array.from(puntos);
  }
  function nubeDe(entry) {
    const clase = claseDe(entry);
    if (nubes.has(clase)) return nubes.get(clase);
    // De la clase, una copia quieta; si ahora mismo no hay ninguna, esta tal cual, sin guardarla.
    const modelo = pieces.find((otra) => claseDe(otra) === clase && otra.mover.square && quieta(otra));
    if (!modelo) return muestreo(entry);
    const nube = muestreo(modelo);
    nubes.set(clase, nube);
    return nube;
  }

  // Tras cada jugada puede haber llegado o haberse ido una pieza de al lado de un caballo: cada caballo
  // quieto busca el giro más pequeño con el que no toca a nadie y se gira. Dos caballos vecinos buscan a
  // la vez (`pickPair`): de uno en uno, el primero se apartaba de más contando con que el otro seguía
  // recto. `instant`, al montar el tablero de golpe.
  async function settleKnights({ instant = false } = {}) {
    if (!pieces.some((entry) => entry.kind === 'knight')) return;
    // Las recién puestas en el tablero se miden cuando ya tienen su postura: medido al nacer, el caballo
    // salía en la postura de fábrica de su esqueleto (el doble de grande) y el rey con los brazos en cruz,
    // y a los caballos de al lado les parecía que los tocaban.
    const falta = Math.max(0, ...pieces.map((entry) => (entry.nacida ?? -Infinity) + POSTURA_SEGUNDOS - clock.now));
    if (falta > 0) await clock.wait(falta);
    const caballos = pieces.filter((entry) => entry.kind === 'knight' && entry.mover.square && !entry.mover.busy);
    if (!caballos.length) return;
    await Promise.all(caballos.map((entry) => entry.mover.stopGesture()));
    const giros = new Map(caballos.map((entry) => [entry, 0]));
    const radianes = (grados) => (grados * Math.PI) / 180;
    const centroDe = (entry) => board.squareToWorld(entry.mover.square);
    const cerca = (a, b) => {
      const p = centroDe(a);
      const q = centroDe(b);
      return Math.hypot(p.x - q.x, p.z - q.z) <= VECINDAD;
    };
    // Lo que tiene alrededor un caballo (sin los de `menos`), con los demás caballos como van quedando.
    function alrededorDe(caballo, menos = []) {
      const centro = centroDe(caballo);
      const puntos = [];
      for (const otra of pieces) {
        // Los peones no cuentan: son estrechos, y la cabeza del caballo les pasa por encima o al lado (al
        // empezar, el hocico queda a unos centímetros de la espalda del de delante, que al respirar se
        // acerca y se aleja: medirlo giraba a los caballos de salida unas veces sí y otras no).
        if (otra.kind === 'pawn') continue;
        if (otra === caballo || menos.includes(otra) || !otra.mover.square || !otra.piece.object.visible) continue;
        const donde = centroDe(otra);
        if (Math.hypot(donde.x - centro.x, donde.z - centro.z) > VECINDAD) continue;
        const yaw = giros.has(otra) ? restFacingFor(otra.color) - giros.get(otra) : yawDe(otra);
        for (const v of place(nubeDe(otra), donde, yaw)) puntos.push(v);
      }
      return gridOf(puntos);
    }
    const datos = (caballo, menos) => ({
      own: endsOf(nubeDe(caballo)), body: nubeDe(caballo), center: centroDe(caballo), yaw: restFacingFor(caballo.color), grid: alrededorDe(caballo, menos),
    });
    const hechos = new Set();
    for (const a of caballos) {
      if (hechos.has(a)) continue;
      const b = caballos.find((otro) => otro !== a && !hechos.has(otro) && cerca(a, otro));
      const par = b ? pickPair({ a: datos(a, [b]), b: datos(b, [a]) }) : null;
      if (!par) continue; // sin pareja, o sin salida limpia para los dos: uno a uno, abajo
      giros.set(a, radianes(par[0]));
      giros.set(b, radianes(par[1]));
      hechos.add(a);
      hechos.add(b);
    }
    for (const caballo of caballos) {
      if (!hechos.has(caballo)) giros.set(caballo, radianes(pickTurn(datos(caballo))));
    }
    await Promise.all(caballos.map((entry) => entry.mover.settle(giros.get(entry), { instant })));
  }

  async function afterMove() {
    await settleKnights();
    const status = game.position.status();
    const side = game.position.side;
    const movio = side === 'white' ? 'black' : 'white';
    const enJaque = status === 'check' || status === 'checkmate';
    highlights.check(enJaque ? squareName(game.position.kings[game.position.turn >> 3]) : null);
    if (status !== 'playing' && status !== 'check') {
      await gameOver(status);
      return;
    }
    if (status === 'check') {
      ui.banner(t('cartel.jaque'));
      sfx.play('jaque');
    }
    // Con reloj, el que ha movido lo pulsa para parar su tiempo y arrancar el del otro. La CPU lo
    // pulsa sola; el jugador, con su mano (y mientras no lo pulse, su tiempo sigue corriendo).
    if (game.clock) {
      const id = game.id;
      // Online, el reloj se pulsa solo, como en cualquier partida por internet.
      if ((game.mode === 'cpu' && movio !== game.human) || game.mode === 'online') {
        clockUi.press(movio);
      } else {
        game.press = movio;
        paintTurn();
        const pulsado = await clockUi.awaitPress(movio);
        game.press = null;
        if (pulsado === false || id !== game.id || state.phase !== 'playing') return;
      }
      game.clock.press(movio, performance.now());
      if (game.mode === 'online') relojOnline(movio);
    }
    paintTurn();
    if (game.mode === 'pvp') await view.flipTo(side === 'black');
    else if (side !== game.human) {
      if (game.mode === 'online') onlineTurn();
      else cpuTurn();
    }
  }

  // ONLINE: le toca al rival. Su jugada puede haber llegado ya (mientras se animaba la nuestra) o llegar
  // luego; cuando está, se juega como cualquier otra.
  async function onlineTurn() {
    const id = game.id;
    game.thinking = true;
    paintTurn();
    const uci = await jugadaDelRival(game.moves.length);
    if (id !== game.id || state.phase !== 'playing') return;
    game.thinking = false;
    const m = uci ? game.position.findUci(uci) : null;
    if (m === undefined || m === null) {
      console.error('[BChess] La jugada del rival no vale aquí:', uci);
      return;
    }
    paintTurn();
    await playMove(m);
  }

  // Me rindo. Online se le dice al rival (gana él); contra la CPU gana ella; uno contra uno, se rinde el que
  // mueve. Y se acaba la partida.
  async function rendirse() {
    if (state.phase !== 'playing' || game.animating || state.fighting) return;
    if (game.mode === 'online') {
      if (!game.session) return;
      game.session.leave('resign');
      game.session = null;
    }
    sueltaEspera();
    cpu.cancel();
    game.id += 1;
    await gameOver('resign');
  }

  // La jugada número `n` del rival: la que ya llegó o la próxima que llegue (null si se acaba la partida).
  function jugadaDelRival(n) {
    const ya = game.remote?.get(n);
    if (ya) return Promise.resolve(ya);
    return new Promise((resolve) => {
      game.remoteWait = { n, resolve };
    });
  }
  function sueltaEspera() {
    game.remoteWait?.resolve(null);
    game.remoteWait = null;
  }

  // El reloj online. Al pulsar el jugador, se le dice al rival cuánto le queda; al pulsar aquí por el
  // rival, se pone lo que dice su propio reloj (si ya ha llegado: si no, en cuanto llegue). Después de
  // pulsar, y no antes, para no sumarle dos veces el incremento.
  function relojOnline(movio) {
    const p = game.partida;
    if (!p) return;
    const ahora = performance.now();
    if (movio === game.human) {
      game.session?.press(movio, { white: game.clock.remaining('white', ahora), black: game.clock.remaining('black', ahora) }, game.moves.length);
    } else if (p.pendingPress && game.moves.length >= p.pendingPress.n) {
      aplicaTiempo(p, p.pendingPress);
      p.pendingPress = null;
    }
  }
  function aplicaTiempo(p, { side, white, black }) {
    if (!p.clock || side === p.color || !Number.isFinite(white) || !Number.isFinite(black)) return;
    const mio = p.clock.remaining(p.color, performance.now());
    p.clock.restore(side === 'white' ? { white, black: mio } : { white: mio, black });
  }

  // VARIAS PARTIDAS ONLINE A LA VEZ. Lo pidió el usuario: poder jugar varias, quedando en espera. Cada
  // partida online es un registro con su sesión, sus jugadas, sus reglas y su reloj; la del tablero es una
  // de ellas (`game.partida`, y `game.moves`/`game.position` son los suyos), y las demás siguen vivas en
  // espera: lo que llega de su rival se juega en sus reglas al momento, sin animar, y se avisa. Al ponerla
  // en el tablero, las piezas se colocan como está.
  const partidas = [];
  const activa = (p) => game.mode === 'online' && game.partida === p;
  const partidasVivas = () => partidas.filter((p) => !p.acabada);
  // Las jugadas que lleva (las del tablero, con la que se está animando).
  const jugadasDe = (p) => (!p ? [] : activa(p) && game.enCurso ? [...p.moves, game.enCurso] : p.moves);

  function crearPartida(info, session) {
    const color = info.white === online.me ? 'white' : 'black';
    const rival = color === 'white' ? 'black' : 'white';
    const control = findTimeControl(info.time);
    const p = {
      id: info.game, session, color, rival, time: info.time ?? 'libre:libre',
      nombres: { [color]: game.miNombre, [rival]: cleanName(info.opponentName) },
      control, clock: control ? createChessClock(control) : null,
      start: INITIAL_FEN, position: Position.initial(), moves: [],
      remote: new Map(), pendingPress: null, acabada: null, aviso: false,
    };
    p.clock?.start('white', performance.now());
    partidas.push(p);
    session.on('move', ({ n, uci }) => llegaJugada(p, n, uci));
    // Las que se perdieron por el camino: solo si la lista del rival empieza por lo que ya tenemos.
    session.on('sync', ({ moves }) => {
      const mias = jugadasDe(p);
      if (!mias.every((uci, i) => moves[i] === uci)) return;
      for (let n = mias.length; n < moves.length; n++) llegaJugada(p, n, moves[n]);
    });
    session.on('press', (msg) => {
      if (!p.clock || p.acabada) return;
      if (p.moves.length >= msg.n && p.clock.running !== msg.side) aplicaTiempo(p, msg);
      else p.pendingPress = msg;
    });
    session.on('lost', () => {
      if (activa(p) && state.phase === 'playing') ui.banner(t('online.perdido'), { tipo: 'tablas', ms: 4000 });
    });
    session.on('back', () => {
      if (activa(p) && state.phase === 'playing') ui.banner(t('online.vuelve'), { tipo: 'tablas', ms: 2000 });
    });
    session.on('resign', () => seVa(p, 'rivalResigned'));
    session.on('bye', () => seVa(p, 'abandon'));
    session.on('gone', () => seVa(p, 'abandon'));
    // Se había emparejado con otro a la vez y no llegó a empezar: fuera; y si estaba en el tablero, a buscar otra.
    session.on('cancel', () => {
      if (p.moves.length || p.acabada) return;
      const estaba = activa(p);
      quitaPartida(p);
      if (estaba && state.phase === 'playing') jugarOnline({ time: p.time });
    });
    pintaPartidas();
    return p;
  }

  function llegaJugada(p, n, uci) {
    if (p.acabada || n < jugadasDe(p).length || p.remote.has(n)) return;
    p.remote.set(n, uci);
    if (activa(p)) {
      if (game.remoteWait?.n === n) {
        const espera = game.remoteWait;
        game.remoteWait = null;
        espera.resolve(uci);
      }
      return;
    }
    avanzaEnEspera(p);
  }

  // Una partida en espera: lo que ha llegado de su rival se juega en sus reglas, sin animar, y se avisa.
  function avanzaEnEspera(p) {
    let movio = false;
    while (!p.acabada && p.position.side === p.rival && p.remote.has(p.moves.length)) {
      const m = p.position.findUci(p.remote.get(p.moves.length));
      if (m === null || m === undefined) break;
      p.position.make(m);
      p.moves.push(p.remote.get(p.moves.length));
      p.clock?.press(p.rival, performance.now());
      if (p.pendingPress && p.moves.length >= p.pendingPress.n) {
        aplicaTiempo(p, p.pendingPress);
        p.pendingPress = null;
      }
      movio = true;
    }
    if (!movio) return;
    const status = p.position.status();
    if (status !== 'playing' && status !== 'check') {
      acabaEnEspera(p, status);
      return;
    }
    p.aviso = true;
    salaUi.notify({ texto: t('aviso.movio', { nombre: nombreRival(p) }), boton: t('aviso.ver'), accion: () => irAPartida(p) });
    pintaPartidas();
  }

  const nombreRival = (p) => p.nombres[p.rival] || t('sala.anonimo');

  // El rival se rinde, se va o desaparece: en el tablero, el final de siempre; en espera, se acaba ahí y se avisa.
  function seVa(p, como) {
    if (p.acabada) return;
    if (activa(p)) {
      if (state.phase !== 'playing') return;
      sueltaEspera();
      game.id += 1;
      game.session = null;
      gameOver(como);
      return;
    }
    acabaEnEspera(p, como);
  }

  // Quién gana una partida que se acaba: `status`, el de las reglas, 'time' (sin tiempo `flagged`) o el
  // del online ('abandon', 'rivalResigned', 'resign').
  function ganador(p, status, flagged = null) {
    if (status === 'checkmate') return p.position.side === 'white' ? 'black' : 'white';
    if (status === 'time') {
      const otro = flagged === 'white' ? 'black' : 'white';
      return p.position.hasMatingMaterial(otro) ? otro : null;
    }
    if (status === 'abandon' || status === 'rivalResigned') return p.color;
    if (status === 'resign') return p.rival;
    return null;
  }

  function acabaEnEspera(p, status, flagged = null) {
    const winner = ganador(p, status, flagged);
    p.acabada = { status, winner, flagged };
    p.session.leave();
    const nombre = nombreRival(p);
    const texto = status === 'rivalResigned' ? t('aviso.rinde', { nombre })
      : status === 'abandon' ? t('aviso.seva', { nombre })
        : !winner ? t('aviso.tablas', { nombre })
          : winner === p.color ? t('aviso.gana', { nombre }) : t('aviso.pierde', { nombre });
    salaUi.notify({ texto, boton: t('aviso.ver'), accion: () => irAPartida(p) });
    pintaPartidas();
    ponEstado(state.phase === 'searching' ? 'seeking' : 'menu');
  }

  function quitaPartida(p) {
    const i = partidas.indexOf(p);
    if (i >= 0) partidas.splice(i, 1);
    if (!p.acabada) p.session.leave();
    pintaPartidas();
  }

  // En espera, los relojes siguen: si a alguien se le acaba el tiempo, esa partida se acaba (una vez por
  // segundo basta).
  let revisadas = 0;
  function revisaPartidasEnEspera(ahora) {
    if (ahora - revisadas < 1000) return;
    revisadas = ahora;
    for (const p of partidasVivas()) {
      if (activa(p) || !p.clock) continue;
      const sinTiempo = p.clock.flagged(ahora);
      if (sinTiempo) acabaEnEspera(p, 'time', sinTiempo);
    }
    pintaPartidas();
  }

  // Lo que se enseña de cada una (la sala y el botón «Tus partidas»).
  function pintaPartidas() {
    const ahora = performance.now();
    salaUi.setGames(partidas.map((p) => ({
      id: p.id,
      rival: nombreRival(p),
      rivalId: p.session.opponent,
      color: p.color,
      jugada: Math.floor(p.moves.length / 2) + 1,
      aqui: activa(p),
      toca: !p.acabada && p.position.side === p.color,
      aviso: p.aviso,
      acabada: p.acabada && (!p.acabada.winner ? 'tablas' : p.acabada.winner === p.color ? 'ganada' : 'perdida'),
      reloj: p.clock ? { white: p.clock.remaining('white', ahora), black: p.clock.remaining('black', ahora) } : null,
    })));
    const meToca = partidas.filter((p) => !activa(p) && !p.acabada && p.position.side === p.color).length;
    if (partidasBoton) {
      partidasBoton.hidden = partidas.length === 0;
      partidasGlobo.hidden = meToca === 0;
      partidasGlobo.textContent = String(meToca);
    }
  }

  // Ir a una partida online desde donde se esté: desde el menú (se cierra y sigue `toMenu`), desde la
  // búsqueda al azar (se cancela) o desde otra partida.
  function irAPartida(p) {
    if (!partidas.includes(p)) return;
    if (state.phase === 'menu' && menu.answer({ ...menu.choice, partida: p.id })) return;
    if (state.phase === 'searching') {
      state.phase = 'starting'; // `jugarOnline` ve que ya no busca y se aparta
      online.cancel();
      onlineUi.hide();
    }
    activarPartida(p);
  }

  // Pone en el tablero la partida online `p`. La que había se queda en espera (si es online) o guardada
  // para continuarla (si es de aquí).
  async function activarPartida(p) {
    if (!partidas.includes(p) || activa(p)) return;
    while (game.animating || state.fighting || view.moving) await new Promise((resolve) => setTimeout(resolve, 150));
    const ahora = performance.now();
    if (game.mode === 'online' && game.partida && !game.partida.acabada) {
      sueltaEspera();
      game.partida.clock?.resume(ahora);
    } else if (state.phase === 'playing') {
      guardarPartida();
    }
    salaUi.close();
    game.id += 1;
    cpu.cancel();
    clockUi.cancel();
    ui.closeAll();
    select(null);
    highlights.check(null);
    if (p.moves.length) resetPieces(p.position);
    else if (game.moves.length || pieces.length !== 32) resetPieces();
    settleKnights({ instant: true });
    Object.assign(game, {
      start: p.start, position: p.position, moves: p.moves, enCurso: null, deConsola: false,
      mode: 'online', level: 30, color: p.color, human: p.color, thinking: false, press: null,
      nombres: p.nombres, session: p.session, partida: p, remote: p.remote,
      control: p.control, clock: p.clock,
    });
    p.aviso = false;
    clockUi.show(game.control, controlName);
    await view.zoomOut();
    await view.flipTo(game.human === 'black');
    state.phase = p.acabada ? 'over' : 'playing';
    const status = game.position.status();
    highlights.check(status === 'check' ? squareName(game.position.kings[game.position.turn >> 3]) : null);
    paintTurn();
    paintSettings();
    pintaPartidas();
    ponEstado('playing');
    if (p.acabada) {
      ui.banner(p.acabada.winner === p.color ? t('final.ganas') : p.acabada.winner ? t('final.pierdes') : t('cartel.tablas'), { tipo: 'tablas', ms: 2200 });
      return;
    }
    if (game.position.side !== game.human) onlineTurn();
  }

  async function cpuTurn() {
    const id = game.id;
    const token = (game.token = (game.token ?? 0) + 1);
    game.thinking = true;
    paintTurn();
    const inicio = performance.now();
    let uci = null;
    try {
      // Con reloj, la CPU se administra: nunca más de una parte de lo que le queda (más el incremento).
      let maxMs = null;
      if (game.clock) {
        const queda = game.clock.remaining(game.position.side, performance.now());
        maxMs = Math.max(120, Math.min(queda / 25 + (game.control.inc ?? 0) * 0.7, queda * 0.5));
      }
      uci = await cpu.think({ fen: game.start, moves: game.moves.slice(), maxMs }, game.level);
    } catch (err) {
      console.error('[BChess] La CPU no ha podido pensar:', err);
    }
    const falta = CPU_MIN_MS - (performance.now() - inicio);
    if (falta > 0) await new Promise((resolve) => setTimeout(resolve, falta));
    game.thinking = false;
    if (id !== game.id || game.token !== token || state.phase !== 'playing') return; // otra partida, deshecha, o en el menú
    const m = (uci && game.position.findUci(uci)) ?? game.position.legalMoves()[0];
    if (m === undefined || m === null) return;
    paintTurn();
    await playMove(m);
  }

  // Se acabó. `status`: el de las reglas, o 'time' si al que mueve (`flagged`) se le acabó el tiempo:
  // pierde, salvo que al otro no le quede con qué dar mate, que entonces son tablas.
  async function gameOver(status, flagged = null) {
    if (game.mode !== 'online') borrarPartida(); // la online no se guarda: la que hubiera, se queda
    sueltaEspera();
    state.phase = 'over';
    game.press = null;
    clockUi.cancel();
    game.clock?.pause(performance.now());
    select(null);
    paintTurn();
    let winner = status === 'checkmate' ? (game.position.side === 'white' ? 'black' : 'white') : null;
    if (status === 'time') {
      const otro = flagged === 'white' ? 'black' : 'white';
      winner = game.position.hasMatingMaterial(otro) ? otro : null;
    }
    if (status === 'abandon' || status === 'rivalResigned') winner = game.human; // online: el rival se ha ido o se ha rendido
    // Me he rendido (uno contra uno, el que mueve): gana el otro.
    if (status === 'resign') winner = (game.mode === 'pvp' ? game.position.side : game.human) === 'white' ? 'black' : 'white';
    const cartel = status === 'checkmate' ? t('cartel.mate') : status === 'time' ? t('cartel.tiempo') : t('cartel.tablas');
    // Y suena el final: fanfarria para quien gana; contra la CPU, si gana ella, trombón triste; tablas, trompetas.
    // En el mate, cuando empieza la fiesta (`escenaMate`).
    const fanfarria = !winner ? 'tablas' : (game.mode === 'cpu' || game.mode === 'online') && winner !== game.human ? 'derrota' : 'victoria';
    const escena = status === 'checkmate' ? escenaMate(winner, fanfarria) : null;
    if (!escena) sfx.play(fanfarria);
    if (!['abandon', 'rivalResigned', 'resign'].includes(status)) {
      ui.banner(cartel, { tipo: winner ? 'jaque' : 'tablas', ms: 1700 });
      await (escena ?? new Promise((resolve) => setTimeout(resolve, 1700)));
    }
    // Online, la partida con ese rival se acaba aquí (y la revancha es buscar otro).
    const eraOnline = game.mode === 'online';
    const partida = eraOnline ? game.partida : null;
    if (partida) partida.acabada = { status, winner, flagged };
    game.session?.leave();
    game.session = null;
    pintaPartidas();
    ponEstado('menu');
    const puntos = puntua(winner);
    const cartelFinal = ui.gameOver({ status, winner, mode: game.mode, human: game.human, flagged, nombres: game.nombres, escena: Boolean(escena) });
    ui.showRating(puntos);
    ui.showSummary(resumenPartida());
    const que = await cartelFinal;
    // Fin de la fiesta: el rey, otra vez de pie, y la cámara, para el usuario.
    if (escena) {
      finale.undo();
      await cinema.restore(clock);
    }
    if (partida) quitaPartida(partida);
    if (que === 'rematch' && eraOnline) await jugarOnline({ time: game.control?.key ?? 'libre:libre' });
    else if (que === 'rematch') await newGame({ mode: game.mode, level: game.level, color: game.color, time: game.control?.key ?? 'libre:libre', nombres: game.nombres });
    else await toMenu();
  }

  // LA PUNTUACIÓN al acabar (como en chess.com): contra la CPU cuenta en «Contra la CPU», según su nivel; en
  // el uno contra uno con nombres, en el ranking local, para los dos. Las partidas casi sin jugar (menos de
  // dos jugadas) no cuentan, como las que allí se anulan; ni las posiciones de prueba de la consola. Devuelve
  // las líneas para el cartel: [{ label, from, to, delta, provisional }].
  function puntua(winner) {
    if (game.deConsola || game.moves.length < 2) return [];
    const linea = (label, r) => ({ label, from: Math.round(r.before.r), to: Math.round(r.after.r), delta: r.delta, provisional: isProvisional(r.after) });
    if (game.mode === 'cpu') {
      const score = !winner ? 0.5 : winner === game.human ? 1 : 0;
      const r = ratings.record({ category: 'cpu', opponent: cpuRating(game.level), score });
      return r ? [linea(t('ranking.cat.cpu'), r)] : [];
    }
    if (game.mode === 'pvp') {
      const { white, black } = game.nombres ?? {};
      const r = ratings.local.record({ white, black, score: !winner ? 0.5 : winner === 'white' ? 1 : 0 });
      return r ? [linea(white, r.white), linea(black, r.black)] : [];
    }
    return []; // online: con el protocolo nuevo, cada uno manda la suya al rival
  }

  // EL JAQUE MATE DE PELÍCULA (`scene/finale.js`): el rey de `winner` ha dado mate. Devuelve cuándo sacar el
  // cartel del final, o null si no hay rey vencido en el tablero (una posición de prueba).
  function escenaMate(winner, fanfare) {
    const vencido = winner === 'white' ? 'black' : 'white';
    const king = pieces.find((entry) => entry.kind === 'king' && entry.color === vencido);
    if (!king) return null;
    const others = pieces.filter((entry) => entry !== king);
    return finale.play({
      king,
      winners: pieces.filter((entry) => entry.color === winner),
      others,
      color: winner,
      fanfare,
    });
  }

  // EL RESUMEN DE LA PARTIDA (punto 10 del plan de mejora), para el cartel del final: cuántas jugadas, cuántas
  // piezas comidas, cuánto ha durado y cuántos combates se han visto. Se empieza a contar con la partida
  // (sin jugadas) o, en una que se continúa, desde que se abre.
  const resumen = { desde: 0, combates: 0 };
  function cuentaResumen() {
    if (!game.moves.length) {
      resumen.desde = Date.now();
      resumen.combates = 0;
    } else if (!resumen.desde) {
      resumen.desde = Date.now();
    }
  }
  function resumenPartida() {
    const record = gameRecord(game.start, game.moves);
    return {
      jugadas: Math.ceil(game.moves.length / 2),
      capturas: record.captured.white.length + record.captured.black.length,
      segundos: Math.max(0, Math.round((Date.now() - resumen.desde) / 1000)),
      combates: resumen.combates,
    };
  }

  function paintTurn() {
    cuentaResumen();
    historial.set(game.start, game.moves);
    // La última jugada, con una flecha tenue (punto 14).
    const ultima = game.moves.at(-1);
    highlights.lastMove(ultima?.slice(0, 2) ?? null, ultima?.slice(2, 4) ?? null);
    ui.turn({ side: game.position.side, mode: game.mode, human: game.human, thinking: game.thinking, hidden: state.phase !== 'playing', press: game.press, nombres: game.nombres });
  }

  function paintSettings() {
    const texto = document.getElementById('ajustes-partida');
    if (!texto) return;
    let linea = game.mode === 'cpu' ? t('ajustes.cpu', { n: game.level, nombre: levelName(game.level) }) : game.mode === 'online' ? t('ajustes.online') : t('ajustes.pvp');
    if (game.control) linea += ` · ${controlName()}`;
    texto.textContent = linea;
  }

  // El reloj en cada fotograma: corre solo mientras el que mueve puede mover (las animaciones y los
  // combates no cuentan), se pinta, y si a alguien se le acaba el tiempo, se acabó la partida.
  function tickClock() {
    revisaPartidasEnEspera(performance.now());
    const reloj = game.clock;
    if (!reloj) return;
    const ahora = performance.now();
    const vivo = state.phase === 'playing' && !game.animating && !state.fighting && !view.moving;
    if (vivo) reloj.resume(ahora);
    else reloj.pause(ahora);
    clockUi.render({ white: reloj.remaining('white', ahora), black: reloj.remaining('black', ahora), running: reloj.running, paused: reloj.paused });
    if (vivo && ahora - guardadaEn > GUARDA_RELOJ_MS) guardarPartida(); // por si se va la app sin avisar
    const sinTiempo = state.phase === 'playing' ? reloj.flagged(ahora) : null;
    if (sinTiempo) {
      game.id += 1; // lo que estuviera en marcha (la CPU pensando) ya no cuenta
      cpu.cancel();
      gameOver('time', sinTiempo);
    }
  }

  // DESHACER. Uno contra uno, la última jugada; contra la CPU, hasta que vuelva a tocarle al jugador
  // (su jugada y la respuesta de la CPU, o solo la suya si la CPU aún está pensando). Las reglas se
  // rehacen desde el principio sin esas jugadas, y el tablero se pone como dicen: la pieza que se
  // movió vuelve a su casilla, la comida reaparece y la coronada vuelve a ser peón.
  function pliesToUndo() {
    if (!game.moves.length || game.mode === 'online') return 0; // online no se deshace: el rival ya la ha visto
    if (game.mode === 'pvp') return 1;
    // Contra la CPU: se deshace hacia atrás hasta que mueva el jugador, y al menos una jugada suya.
    let n = 0;
    const p = Position.fromFEN(game.start);
    const lados = [];
    for (const uci of game.moves) {
      lados.push(p.side);
      p.playUci(uci);
    }
    for (let i = lados.length - 1; i >= 0; i--) {
      n += 1;
      if (lados[i] === game.human) return n;
    }
    return 0; // solo ha movido la CPU: no hay jugada del jugador que deshacer
  }

  function canUndo() {
    return state.phase === 'playing' && !game.animating && !state.fighting && !view.moving && !state.busy && pliesToUndo() > 0;
  }

  async function undoMove() {
    if (!canUndo()) return;
    const n = pliesToUndo();
    game.token = (game.token ?? 0) + 1; // si la CPU estaba pensando, su jugada ya no vale
    cpu.cancel();
    game.thinking = false;
    game.press = null;
    clockUi.cancel();
    select(null);
    await view.zoomOut();
    game.moves = game.moves.slice(0, -n);
    const p = Position.fromFEN(game.start);
    for (const uci of game.moves) p.playUci(uci);
    game.position = p;
    restoreBoard();
    settleKnights({ instant: true });
    const status = game.position.status();
    highlights.check(status === 'check' ? squareName(game.position.kings[game.position.turn >> 3]) : null);
    game.clock?.switchTo(game.position.side, performance.now());
    guardarPartida();
    paintTurn();
    if (game.mode === 'pvp') await view.flipTo(game.position.side === 'black');
  }

  // Pone el tablero como dicen las reglas: lo que ya está bien se queda; lo que se movió vuelve a su
  // casilla (la más cercana de las que esperan una pieza como ella), lo que falta aparece y lo que
  // sobra se va, todo entre polvo.
  function restoreBoard() {
    const falta = new Map();
    for (let rank = 1; rank <= 8; rank++) {
      for (const file of FILES) {
        const debe = game.position.pieceAt(file + rank);
        if (debe) falta.set(file + rank, debe);
      }
    }
    const sueltas = [];
    for (const entry of pieces) {
      const debe = falta.get(entry.mover.square);
      if (debe && debe.kind === entry.kind && debe.color === entry.color) falta.delete(entry.mover.square);
      else sueltas.push(entry);
    }
    const puff = (square) => {
      const at = board.squareToWorld(square);
      dust.puff(new Vector3(at.x, 0.05, at.z), { count: 10, radius: 0.45, duration: 0.5 });
    };
    for (const [square, debe] of falta) {
      const at = board.squareToWorld(square);
      let mejor = -1;
      let cerca = Infinity;
      sueltas.forEach((entry, i) => {
        if (entry.kind !== debe.kind || entry.color !== debe.color) return;
        const donde = board.squareToWorld(entry.mover.square);
        const d = Math.hypot(donde.x - at.x, donde.z - at.z);
        if (d < cerca) {
          cerca = d;
          mejor = i;
        }
      });
      if (mejor >= 0) {
        const [entry] = sueltas.splice(mejor, 1);
        puff(entry.mover.square);
        entry.mover.placeOn(square);
      } else {
        const entry = spawnEntry(debe.kind, debe.color, square);
        if (entry) {
          const object = entry.piece.object;
          object.scale.setScalar(0.01);
          clock.tween(0.45, (k) => object.scale.setScalar(Math.max(0.01, 1 - (1 - k) ** 3))).then(() => object.scale.setScalar(1));
        }
      }
      puff(square);
    }
    for (const entry of sueltas) {
      puff(entry.mover.square);
      removePiece(entry);
    }
  }

  // Tablero nuevo: fuera todas las piezas y cada una otra vez en su casilla de salida; o, al continuar
  // una partida guardada, donde diga su posición.
  function resetPieces(position = null) {
    for (const entry of [...pieces]) removePiece(entry);
    debris.clear();
    if (position) {
      for (let rank = 1; rank <= 8; rank++) {
        for (const file of FILES) {
          const debe = position.pieceAt(file + rank);
          if (debe) spawnEntry(debe.kind, debe.color, file + rank);
        }
      }
      return;
    }
    for (const side of SIDES) {
      for (const kind of KINDS) {
        for (const square of startSquares(kind, side)) spawnEntry(kind, side.color, square);
      }
    }
  }

  // Partida nueva o, con `guardada` (la de `partidaGuardada()`), la que se dejó a medias: sus piezas donde
  // estaban, sus relojes y el turno de quien tocaba.
  async function newGame({ mode, level, color = 'white', time = 'libre:libre', guardada = null, session = null, nombres = null }) {
    game.id += 1;
    cpu.cancel();
    sueltaEspera();
    // La online que estuviera en el tablero se queda en espera (sigue viva, con su reloj).
    if (game.mode === 'online' && game.partida && !game.partida.acabada) game.partida.clock?.resume(performance.now());
    game.session = session;
    game.partida = null;
    game.remote = null;
    clockUi.cancel();
    ui.closeAll();
    select(null);
    highlights.check(null);
    if (!guardada && mode !== 'online') borrarPartida(); // se ha elegido empezar otra: la de antes ya no se continúa
    if (guardada) resetPieces(guardada.position);
    else if (game.moves.length || pieces.length !== 32) resetPieces(); // al empezar, el tablero ya está puesto
    // Con todas quietas en su casilla, cada clase de pieza deja medida su forma y los caballos se apartan
    // si hace falta (en la de salida no tocan a nadie y siguen al frente). Sin esperar: tarda medio segundo.
    settleKnights({ instant: true });
    game.start = guardada?.start ?? INITIAL_FEN;
    game.position = guardada?.position ?? Position.initial();
    game.moves = guardada ? [...guardada.moves] : [];
    game.enCurso = null;
    game.deConsola = false;
    game.mode = mode;
    game.level = level;
    game.color = color;
    // Contra la CPU, el jugador lleva las piezas que ha elegido (o las que le toquen a suertes).
    // Online, el que le ha tocado en el emparejamiento.
    game.human = guardada?.human ?? (mode === 'cpu' ? (color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color) : mode === 'online' ? color : 'white');
    game.thinking = false;
    game.press = null;
    // Los nombres: en 1 contra 1, los del menú (o los de la partida guardada); online, el mío y el del
    // rival; contra la CPU, ninguno.
    const n = guardada?.nombres ?? nombres;
    game.nombres = mode === 'cpu' || !n ? { white: '', black: '' } : { white: cleanName(n.white), black: cleanName(n.black) };
    game.control = findTimeControl(time);
    game.clock = game.control ? createChessClock(game.control) : null;
    const reloj = guardada && game.clock ? clockOnResume(guardada, game.control, Date.now()) : null;
    if (reloj) game.clock.restore(reloj);
    clockUi.show(game.control, controlName);
    const lado = game.position.side;
    await view.zoomOut();
    // Cada uno mira el tablero desde su lado; uno contra uno, desde el del que mueve.
    await view.flipTo(game.mode === 'pvp' ? lado === 'black' : game.human === 'black');
    state.phase = 'playing';
    game.clock?.start(lado, performance.now());
    const status = game.position.status();
    highlights.check(status === 'check' ? squareName(game.position.kings[game.position.turn >> 3]) : null);
    paintTurn();
    paintSettings();
    if (game.mode === 'cpu' && lado !== game.human) cpuTurn(); // le toca a la CPU (con blancas, empieza ella)
    ponEstado('menu');
  }

  // ONLINE: busca rival (la pantalla del radar) y, al encontrarlo, empieza la partida con el color que le
  // haya tocado y el reloj acordado. Si se cancela, o no hay conexión, vuelve al menú.
  async function jugarOnline({ time = 'libre:libre', nombres = null } = {}) {
    if (nombres) ponMiNombre(nombres.yo);
    // Si se busca desde una partida (la sala está también a mitad de partida), al cancelar se vuelve a ella.
    const volver = state.phase === 'playing' ? { partida: game.mode === 'online' ? game.partida : null } : null;
    if (volver && game.mode === 'online') sueltaEspera();
    state.phase = 'searching';
    ponEstado('seeking');
    paintTurn();
    let pulsado = null;
    const boton = new Promise((resolve) => {
      pulsado = resolve;
    });
    let fase = 'connecting';
    onlineUi.show(() => pulsado());
    const busca = online.find({
      time,
      name: game.miNombre,
      onStatus: (s) => {
        fase = s.phase;
        onlineUi.status(s);
      },
    });
    const r = await Promise.race([busca, boton.then(() => null)]);
    if (state.phase !== 'searching') return; // se ha ido al menú por los ajustes: ya está allí
    if (!r) {
      online.cancel();
      if (fase === 'error') await boton; // sin conexión: lo dice y espera al botón
      onlineUi.hide();
      if (volver?.partida && partidas.includes(volver.partida)) {
        game.partida = null; // para que `activarPartida` la vuelva a poner
        state.phase = 'starting';
        await activarPartida(volver.partida);
      } else if (volver) {
        state.phase = 'playing'; // la partida de aquí sigue donde estaba
        ponEstado('menu');
        paintTurn();
      } else {
        await toMenu();
      }
      return;
    }
    await empezarOnline(r.info);
  }

  // La partida online con el rival de `info` (del emparejamiento o de un reto): un momento el «¡Rival
  // encontrado!» y a jugar.
  async function empezarOnline(info) {
    state.phase = 'starting';
    salaUi.clearInvites();
    salaUi.close();
    const color = info.white === online.me ? 'white' : 'black';
    onlineUi.show(() => {});
    onlineUi.status({ phase: 'found', color, rival: info.opponentName });
    await new Promise((resolve) => setTimeout(resolve, 1700));
    let partida = null;
    const session = online.session(info, () => jugadasDe(partida));
    partida = crearPartida(info, session);
    if (state.phase !== 'starting') {
      partida.session.leave('resign'); // se fue justo ahora: que el rival no se quede esperando
      quitaPartida(partida);
      return;
    }
    onlineUi.hide();
    state.phase = 'playing'; // para que `activarPartida` deje en espera la que hubiera
    await activarPartida(partida);
  }

  // Un reto aceptado (lo he aceptado yo o lo ha aceptado el retado): la partida, venga de donde venga.
  async function empezarReto(info) {
    if (state.phase === 'starting') return;
    salaUi.clearInvites();
    if (state.phase === 'menu' && menu.answer({ ...menu.choice, mode: 'online', reto: info })) return; // sigue `toMenu`
    if (state.phase === 'searching') online.cancel(); // `jugarOnline` ve que ya no busca y se aparta
    else if (state.phase === 'playing') guardarPartida(); // la partida de aquí se puede continuar luego
    ui.closeAll();
    await empezarOnline(info);
  }

  // LA PARTIDA GUARDADA (`chess/saved-game.js`): tras cada jugada (nada más decidirla), al deshacer, al
  // irse al menú, al esconderse la app y, con reloj, de tanto en tanto. Al acabar la partida o empezar
  // otra, se borra. La red de seguridad y las posiciones puestas desde la consola no la tocan.
  let guardadaEn = -Infinity;
  function guardarPartida() {
    if (testing.active || game.deConsola || state.phase !== 'playing' || game.mode === 'online') return;
    const moves = game.enCurso ? [...game.moves, game.enCurso] : game.moves;
    if (!moves.length) {
      borrarPartida();
      return;
    }
    const ahora = performance.now();
    guardadaEn = ahora;
    const clock = game.clock ? { white: game.clock.remaining('white', ahora), black: game.clock.remaining('black', ahora) } : null;
    const datos = packGame({
      start: game.start, moves, mode: game.mode, level: game.level, human: game.human, color: game.color,
      time: game.control?.key ?? 'libre:libre', clock, now: Date.now(), names: game.nombres,
    });
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(datos));
    } catch {
      // sin almacenamiento (ventana privada, lleno): se juega igual, sin poder continuar luego
    }
  }
  function borrarPartida() {
    if (testing.active) return;
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // nada que borrar
    }
  }
  function partidaGuardada() {
    try {
      return readSavedGame(localStorage.getItem(SAVE_KEY));
    } catch {
      return null;
    }
  }
  // Lo que el menú cuenta de ella en «Continuar partida».
  const resumenGuardada = () => {
    const g = partidaGuardada();
    return g && { mode: g.mode, level: g.level, time: g.time, moves: g.moves.length, cuando: g.cuando, nombres: g.nombres };
  };
  // Lo elegido en el menú: continuar la guardada (si sigue ahí) o una partida nueva.
  async function empezar(eleccion) {
    const guardada = eleccion.continuar ? partidaGuardada() : null;
    const elegida = eleccion.continuar ? menu.choice : eleccion;
    const enEspera = eleccion.partida ? partidas.find((p) => p.id === eleccion.partida) : null;
    if (enEspera) await activarPartida(enEspera);
    else if (guardada) await newGame({ ...guardada, guardada });
    else if (eleccion.reto) await empezarOnline(eleccion.reto);
    else if (elegida.mode === 'online') await jugarOnline(elegida);
    else await newGame(elegida);
  }
  const alEsconderse = () => {
    if (document.visibilityState === 'hidden') guardarPartida();
  };
  document.addEventListener('visibilitychange', alEsconderse);
  window.addEventListener('pagehide', () => guardarPartida());

  // Al menú: vuelve la melodía de la carga y, al pulsar JUGAR, se funde y empieza la partida elegida.
  async function toMenu() {
    guardarPartida(); // la de ahora se puede continuar desde el menú
    // Online, la partida del tablero se queda en espera, viva (rendirse es con la bandera blanca).
    sueltaEspera();
    if (game.mode === 'online' && game.partida && !game.partida.acabada) game.partida.clock?.resume(performance.now());
    game.session = null;
    game.partida = null;
    online.cancel(); // si estaba buscando rival, deja de buscar
    onlineUi.hide();
    state.phase = 'menu';
    game.id += 1;
    cpu.cancel();
    clockUi.cancel();
    clockUi.show(null);
    game.clock = null;
    game.press = null;
    ui.closeAll();
    select(null);
    music.backToIntro();
    ponEstado('menu');
    const mostrando = menu.show({ guardada: resumenGuardada() });
    avisaVersion(); // si llegó a media partida, ahora
    const eleccion = await mostrando;
    music.endIntro();
    await menu.hide(); // y la cámara del menú baja en vuelo hasta la vista de la partida
    await empezar(eleccion);
  }

  // Para depurar desde la consola: la partida desde una posición cualquiera, en FEN. Las piezas que
  // sobran se quitan y las que faltan aparecen en su casilla.
  function setup(fen) {
    game.start = fen;
    game.position = Position.fromFEN(fen);
    game.moves = [];
    game.deConsola = true; // una posición de prueba: no se guarda encima de la partida de verdad
    select(null);
    squareUp();
    settleKnights({ instant: true });
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
      if (kind === 'pawn') pawnTweaks(piece);
      // El alfil conjura con la mano libre y el báculo quieto: el clip de lanzar hechizos es para manos
      // vacías, y con el báculo en la derecha lo lanzaba hacia atrás y el fogonazo salía a su espalda.
      if (kind === 'bishop') piece.addStillBones('conjurar', 'attack', (bone) => STAFF_ARM.test(bone), { clip: 'cast_a_spell' });
      entry = { kind, color, piece };
      // Todas mueven de cine, como el caballo y la torre: la cámara se acerca a verlas andar (lo pidió el
      // usuario: «cuando cualquier pieza se mueve, la cámara debe mostrarla de cerca»).
      entry.mover = createMover({
        piece, board, dust, clock, onBusy, restFacing, cinema,
        obstacles: () => pieces.filter((other) => other !== entry).map((other) => board.squareToWorld(other.mover.square)),
      });
    }
    entry.nacida = clock.now; // para no medir su forma hasta que tenga su postura (`settleKnights`)
    // Los pasos que se oyen, cada una con los suyos: madera; el caballero a pie, con su armadura; el
    // caballo, sus cascos; el gigante de la torre, piedra. Más flojos cuanto más lejos de la cámara (el
    // caballo que huye del tablero se va apagando).
    const pisa = (sound) => function () { sfx.play(sound, { volume: cercania(this) }); };
    // Y su voz: gruñe al atacar, se queja al recibir y grita al caer (`audio/voces.js`); y el peón, al
    // estirarse en reposo, resopla (más flojo cuanto más lejos).
    const voz = voicesFor(entry, { volumen: () => cercania(entry.piece.figure) });
    if (kind === 'knight') entry.piece.rider.onPlay = voz;
    else if (kind === 'rook') { if (entry.piece.giant) entry.piece.giant.onPlay = voz; }
    else entry.piece.onPlay = voz;
    if (kind === 'knight') {
      entry.piece.rider.onStep = pisa('paso_armadura');
      if (entry.piece.horse) {
        entry.piece.horse.watchFeet(Object.values(entry.piece.mount?.legs ?? {}).map((leg) => leg.at(-1)));
        entry.piece.horse.onStep = pisa('casco_caballo');
      }
    } else if (kind === 'rook') {
      if (entry.piece.giant) entry.piece.giant.onStep = pisa('paso_gigante');
    } else {
      entry.piece.onStep = pisa('paso');
    }
    addPiece(entry, square);
    // La mano del rey se cierra sobre el báculo lo último: el puño se busca con los brazos ya
    // bajados y la pieza en su casilla, no sobre el modelo recién cargado.
    if (kind === 'king') entry.piece.closeHandOnSpear();
    // Y la del peón, en un puño alrededor de la lanza (`pawnGrip`).
    if (kind === 'pawn') pawnGrip(entry.piece);
    return entry;
  }

  // Lo que se le hace a cada peón al crearlo, también al que sirve para medir sus golpes
  // (`measureStrikes`): así se miden los golpes de verdad. Sin esto, la estocada medida no se parecía a
  // la del juego (en el juego la lanza va en el puño y apartada del cuerpo, que la empuja hacia delante),
  // y la del peón contra el caballero pasaba de largo junto al escudo (lo vio el usuario).
  function pawnTweaks(piece) {
    // Ataca con la lanza o con los pies, y el escudo se queda en guardia: en la patada, el brazo del escudo
    // se iba hacia delante y abajo y lo dejaba plano a la altura de la rodilla, empujando.
    if (piece.props.shield) piece.holdBones('attack', (bone) => SHIELD_ARM.test(bone));
    // Y su lanza no le atraviesa el cuerpo: al atacar le cruzaba el pecho, y al celebrar con ella erguida,
    // agachándose, le salía por la espalda (lo vio el usuario).
    piece.guardSpear({ from: 'Hip', to: 'Head', radius: 0.2, over: 0.35 });
    // Ni el escudo, que en las patadas y al recibir se le metía en el tronco: el hombro aparta el brazo.
    piece.guardShield({ from: 'Hip', to: 'NeckTwist01', arm: 'L_Upperarm', radius: 0.13 });
    // Y la estocada, a lo largo del antebrazo y con la lanza cogida más por en medio (el puño, al 40 % del
    // palo y no en el regatón): así la punta llega justo al rival y lo de atrás pasa por su costado.
    piece.thrustAlongArm({ grip: 0.38 });
    return piece;
  }
  // Y la mano, en un puño alrededor de la lanza (la llevaba pegada a la mano abierta), y en guardia: en
  // reposo y andando, el antebrazo hacia delante y la lanza derecha, que con el brazo colgando el puño no la
  // podía agarrar sin torcer la muñeca de forma imposible. Ya en su sitio: el puño se busca con su postura.
  function pawnGrip(piece) {
    piece.spearStance({
      upper: 'R_Upperarm', fore: 'R_Forearm', hand: 'R_Hand',
      elbow: [-0.14, -0.97, 0.21], // el codo, abajo, algo adelantado y hacia fuera
      wrist: [0.05, -0.25, 0.98], // el antebrazo, hacia delante y algo hacia abajo: así la muñeca queda casi recta (medido)
    });
    piece.gripSpearFist();
    return piece;
  }
  // El peón con el que se miden los golpes: como los de la partida.
  const spawnPawnToMeasure = (kit) => {
    const piece = pawnTweaks(spawnPiece(kit));
    piece.placeAt({ x: 0, z: 0 });
    piece.face(0);
    return pawnGrip(piece);
  };

  // Carga los modelos de un tipo de pieza (los dos bandos) y pone cada pieza en su casilla. Cada tipo
  // va aparte: si uno falla, el resto del tablero sigue.
  async function loadKind(manifest, kind, load, { strikes = true } = {}) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side[kind]]);
      const loaded = await Promise.all(sides.map((side) => load(manifest.pieces[side[kind]], quality)));
      if (strikes) for (const kit of loaded) kit.strikes = measureStrikes(kit, kind === 'pawn' ? spawnPawnToMeasure : spawnPiece);
      kits[kind] = {};
      sides.forEach((side, i) => {
        kits[kind][side.color] = loaded[i];
        for (const square of startSquares(kind, side)) spawnEntry(kind, side.color, square);
      });
    } catch (err) {
      console.error(`[BChess] No se pudieron cargar ${NOMBRES[kind]}:`, err);
      hud.showMessage(t(`error.${kind}`), { retry: () => loadKind(manifest, kind, load, { strikes }) });
    }
  }

  async function loadPieces() {
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      console.error('[BChess] No se pudo leer el manifiesto:', err);
      hud.showMessage(t('error.piezas'), { retry: loadPieces });
      return;
    }
    // Uno detrás de otro, no todos a la vez: así el tablero se va llenando desde el primer momento en
    // vez de quedarse vacío mientras los modelos compiten por la conexión. Primero los peones, que son
    // la mitad del tablero, y enseguida los caballeros y los alfiles, que son los que más se hacen
    // esperar.
    // La barra de la pantalla de carga: cada tipo de pieza pesa lo que suele tardar, y dentro de cada
    // uno avanza con los ficheros que van llegando (hasta el 90 % de su parte: el resto es prepararlos).
    const tipos = [
      [t('carga.peones'), (m) => loadKind(m, 'pawn', loadPieceKit), 0.12],
      [t('carga.caballos'), (m) => loadKind(m, 'knight', loadKnightKit, { strikes: false }), 0.3],
      [t('carga.alfiles'), (m) => loadKind(m, 'bishop', loadPieceKit), 0.14],
      [t('carga.reinas'), (m) => loadKind(m, 'queen', loadPieceKit), 0.1],
      [t('carga.coronas'), (m) => loadKind(m, 'king', loadPieceKit), 0.12],
      [t('carga.gigantes'), (m) => loadKind(m, 'rook', loadRookKit, { strikes: false }), 0.17],
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

  loading.progress(0.02, t('carga.antorchas'));
  await addLighting(stage, quality);
  await loadPieces();
  sfx.preload();
  // Acceso para depurar desde la consola; `tap` simula un toque ({ owner, square }).
  window.bchess = {
    stage, board, quality, pieces, state, gesture, clock, highlights, fx, cinema, focus, hud, advance, tap: handleTap, capture, crowd, rubble, debris, bubbles, music, view,
    finale, confetti, pacer, ratings, ranking, cloud,
    game, menu, ui, cpu, newGame, playMove, toMenu, setup, settleKnights, empezar,
    // La partida guardada, tal como se continuaría (o null).
    get guardada() {
      return partidaGuardada();
    },
    get combates() {
      return modoCombates;
    },
    set combates(modo) {
      modoCombates = modo;
      pintaCombates();
    },
    // La red de seguridad: juega todos los combates y dice cuáles fallan (`dev/autotest.js`).
    async autotest(opciones) {
      const prueba = await import('./dev/autotest.js');
      const resultados = await prueba.runAutotest(window.bchess, { onProgress: (p) => prueba.showReport(null, p), ...opciones });
      prueba.showReport(resultados);
      return resultados;
    },
    get nubes() {
      return nubes;
    },
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
  // Con `?autotest`, en vez de jugar, la red de seguridad: se salta el menú y juega todos los combates.
  if (new URLSearchParams(location.search).has('autotest')) {
    await loading.finish();
    window.__autotest = await window.bchess.autotest();
    return;
  }

  // Todo cargado: la pantalla de carga se funde y debajo espera el menú, con la melodía de la carga
  // sonando todavía. Al pulsar JUGAR se funde la música y empieza la partida.
  const eleccion = menu.show({ guardada: resumenGuardada() });
  await loading.finish();
  const elegido = await eleccion;
  music.endIntro();
  await menu.hide(); // y la cámara del menú baja en vuelo hasta la vista de la partida
  await empezar(elegido);
}

start();
