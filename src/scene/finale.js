import * as THREE from 'three';
import { sfx } from '../audio/sfx.js';
import { grita } from '../audio/voces.js';
import { celebrate } from '../combat/knight/common.js';
import { poseTo } from '../combat/royal/royal.js';
import { FRENA, twirl } from '../combat/twirl.js';
import { COLORS } from '../fx/confetti.js';
import { KING, QUEEN, blend, restPoseOf as restPose } from '../pieces/cast.js';
import { findBone } from '../pieces/bone-names.js';
import { staffDirection, wideFraming } from './finale-plan.js';

// EL JAQUE MATE DE PELÍCULA (punto 6 del plan de mejora). Antes el final era un cartel, y es el momento
// más importante de la partida. Ahora:
//
// 1. La cámara va a la cara del rey vencido.
// 2. Se le cae el báculo, que rebota contra el tablero, y él cae de rodillas, hundido, la cabeza gacha.
// 3. Suena la fanfarria, la cámara sube y lo rodea, llueve confeti de los colores del bando que gana y
//    estallan fuegos artificiales.
// 4. Plano general desde detrás del ejército que gana, con él al fondo: las piezas del ganador lo celebran
//    (el rey voltea el báculo y lo alza, la reina levanta los brazos, los demás hacen lo suyo y las torres
//    disparan cohetes).
// 5. Sale el cartel del final, y por detrás sigue la fiesta.
//
// El rey y la reina no traen animaciones (cualquier clip les destrozaba la capa): todo lo suyo va hueso a
// hueso, como sus conjuros. Al acabar (`undo`) todo vuelve a su sitio.

// Cuándo pasa cada cosa, en segundos de juego desde el mate.
const DROP_AT = 0.55; // se le cae el báculo
const KNEEL_AT = 0.95; // y se le doblan las rodillas
const KNEEL_SECONDS = 0.5; // cayendo, cada vez más deprisa
const SLUMP_SECONDS = 0.8; // y ya en el suelo se hunde: la espalda, la cabeza, los brazos
const PARTY_AT = 2.4; // fanfarria, confeti y fuegos, y la cámara lo rodea
const WIDE_AT = 4.6; // plano general, desde detrás de los que ganan
const CELEBRATE_AT = 5.4; // y lo celebran, cuando la cámara ya casi está
const ENCORE = 3.6; // y algunas, otra vez, al rato (sigue la fiesta detrás del cartel)
const DIALOG_AT = 7.6; // el cartel del final

// LA POSTURA DEL VENCIDO, en grados y en el espacio de la figura (+X a su izquierda, +Y arriba, +Z delante),
// medida en su aparejo: girar en +X lleva lo que cuelga (las piernas) hacia atrás y lo que sube (el tronco)
// hacia delante.
const THIGH = -10; // los muslos, algo adelantados: arrodillado y no sentado sobre los talones
const KNEEL = {
  L_UpLeg: { x: THIGH },
  R_UpLeg: { x: THIGH },
  L_Leg: { x: 92 }, // las espinillas, tumbadas hacia atrás
  R_Leg: { x: 92 },
  L_Foot: { x: 70 }, // y los pies, estirados detrás
  R_Foot: { x: 70 },
};
const SLUMP = {
  Spine: { x: 10 },
  Spine2: { x: 6 },
  Neck: { x: 6 },
  Head: { x: 14 }, // la cabeza gacha, pero que se le vea la cara: más, de frente solo se veía la corona
  L_Arm: { z: -84, x: -12 }, // los brazos, caídos y algo por delante
  R_Arm: { z: 84, x: -12 },
  L_ForeArm: { x: -26 },
  R_ForeArm: { x: -26 },
};
const KNEE_PAD = 0.07; // la rodilla apoyada queda a su grosor del suelo
const HIPS_FORWARD = 0.1; // y la cadera, algo adelante: si no, los pies le salían por detrás de la peana
const SOB = { rate: 2.3, spine: 1.6, head: 2.2 }; // ya hundido, respira hondo: grados que sube y baja

// La cámara. Primero, de cerca y algo de lado, hacia donde cae el báculo: se le ve la cara, se ve caer el
// báculo y se le ve caer a él. Las piezas que lo tapen se apagan mientras tapen (`onFocus`), como en los
// combates: en un mate suele estar rodeado, y en el del pasillo sus peones le quedan justo delante.
const CLOSE_SECONDS = 0.9;
const CLOSE_DISTANCE = 3.7;
const CLOSE_DISTANCE_TALL = 4.6; // en una pantalla vertical, más lejos: si no, no cabe entero
const CLOSE_LOOK = 1.25; // a qué altura mira: le cabe de pie y le sigue cabiendo de rodillas
const CLOSE_RISE = 0.75; // lo que la cámara queda por encima de eso
const CLOSE_TOWARD_STAFF = 0.5; // cuánto se ladea hacia donde cae el báculo
// Luego sube como una grúa, rodeándolo, y se queda dándole vueltas.
const CRANE_SECONDS = 2.2;
const CRANE_TURN = 0.6; // radianes que rodea mientras sube
const CRANE_DISTANCE = 4.8;
const CRANE_DISTANCE_TALL = 6.4;
// No muy alta: lo que lo tape se apaga, y desde arriba los cohetes estallaban fuera del plano.
const CRANE_RISE = 2;
const CRANE_LOOK = 1.2;
const ORBIT_SPEED = 0.16; // radianes por segundo
// Y el plano general: mira a medio camino entre él y los que ganan, desde detrás de ellos, y los rodea
// despacio. Lo justo para que quepan todos, entre estas distancias.
const WIDE_SECONDS = 2;
const WIDE_LOOK = 0.9;
const WIDE_TOWARD_WINNERS = 0.4; // dónde mira: de él (0) a los que ganan (1)
const WIDE_MIN = 6;
const WIDE_MAX = 10;
const WIDE_ELEVATION = 0.5; // altura de la cámara por cada casilla de distancia
const WIDE_ORBIT = 0.06;

// La fiesta.
const CONFETTI_RADIUS = 3.4;
const CONFETTI_COUNT = 460;
const FIREWORKS = 4; // cohetes alrededor del rey vencido, además de los de las torres (y otros tantos luego)
const FIREWORK_EVERY = 0.75;
const CELEBRATE_SPREAD = 0.9; // las piezas no lo celebran todas a la vez: hasta este retraso
const SHOUTERS = 3; // ni gritan todas: con más de tres voces a la vez, no se entiende nada

const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

// `camera`: la del escenario. `dust`, `confetti`: los efectos. `cinema` y `clock`, los de siempre.
// `onFocus(king)`: que no lo tape nadie y que el resto se desenfoque; `offFocus()`, al acabar.
export function createFinale({ clock, cinema, camera, confetti, dust, onFocus = null, offFocus = null }) {
  let scene = null; // la escena en curso

  // Dónde tiene el báculo el regatón y la cabeza, en el mundo; null si no lleva.
  function staffEnds(piece) {
    const spear = piece.props?.spear;
    const ends = piece.spearEnds;
    if (!spear || !ends) return null;
    spear.updateWorldMatrix(true, false);
    return {
      bottom: spear.localToWorld(new THREE.Vector3(0, ends.bottom, 0)),
      top: spear.localToWorld(new THREE.Vector3(0, ends.top, 0)),
    };
  }

  // Hacia dónde dejar caer el báculo (`staffDirection`): medido desde donde está el regatón y con lo que mide
  // de verdad, en el mundo (cuelga de un hueso escalado, y su escala propia no dice nada).
  function dropDirection(king, others) {
    const at = king.piece.figure.position;
    const ends = staffEnds(king.piece);
    return staffDirection({
      from: ends ? ends.bottom : at,
      length: ends ? ends.bottom.distanceTo(ends.top) : 1.8,
      facing: king.piece.figure.rotation.y,
      others: others.map((entry) => entry.piece.figure.position),
    });
  }

  // Cae de rodillas: las piernas se doblan hacia atrás deprisa mientras la cadera cae cada vez más deprisa
  // (así los pies se levantan antes de que el cuerpo llegue abajo y no se hunden en la peana), y en el suelo
  // se hunde.
  async function kneel(s) {
    const piece = s.king.piece;
    // Lo que ha de bajar la cadera para que las rodillas toquen el suelo, medido en su pierna.
    const cadera = findBone(piece.object, 'L_UpLeg');
    const rodilla = findBone(piece.object, 'L_Leg');
    const suelo = piece.figure.getWorldPosition(new THREE.Vector3()).y;
    let drop = 0.55;
    if (cadera && rodilla) {
      const a = cadera.getWorldPosition(new THREE.Vector3());
      const b = rodilla.getWorldPosition(new THREE.Vector3());
      drop = Math.max(0, a.y - suelo - (a.distanceTo(b) * Math.cos(THREE.MathUtils.degToRad(THIGH)) + KNEE_PAD));
    }
    const brazos = restPose(piece);
    await clock.tween(KNEEL_SECONDS, (t) => {
      if (s.undone) return;
      const piernas = blend({}, KNEEL, easeOut(t));
      for (const [bone, turn] of Object.entries(piernas)) piece.turnBone(bone, turn);
      const k = easeIn(t);
      piece.liftBone('Hips', { y: -drop * k, z: HIPS_FORWARD * k });
    });
    if (s.undone) return;
    // ¡Pum!, de rodillas contra la peana.
    sfx.play('caida_armadura', { rate: 0.85 });
    const at = piece.figure.getWorldPosition(new THREE.Vector3());
    const facing = piece.figure.rotation.y;
    dust?.puff(new THREE.Vector3(at.x + Math.sin(facing) * 0.15, suelo, at.z + Math.cos(facing) * 0.15), { count: 6, radius: 0.35, duration: 0.5, color: '#c9c0b2', size: 0.45 });
    cinema.shake(0.05);
    await clock.tween(SLUMP_SECONDS, (t) => {
      if (s.undone) return;
      const pose = blend(brazos, SLUMP, easeOut(t));
      for (const [bone, turn] of Object.entries(pose)) piece.turnBone(bone, turn);
    });
    if (!s.undone) s.sobbing = 0;
  }

  // Lo celebra una pieza del ganador. `shout`: si grita.
  async function party(entry, s, shout) {
    const piece = entry.piece;
    if (entry.kind === 'king' || entry.kind === 'queen') s.posed.add(piece);
    if (entry.kind === 'king') {
      // Voltea el báculo (un molinete que frena) y lo alza por encima de la cabeza.
      if (shout) grita(entry, 'victoria');
      const reposo = restPose(piece);
      if (piece.props?.spear) await twirl(piece, { clock, turns: 2, seconds: 0.7, ease: FRENA });
      if (s.undone) return;
      await poseTo(piece, reposo, KING.raise, { clock, seconds: 0.45 });
      await clock.wait(1.4);
      if (s.undone) return;
      await poseTo(piece, KING.raise, reposo, { clock, seconds: 0.6 });
      stand(piece);
    } else if (entry.kind === 'queen') {
      // Los dos brazos al cielo.
      if (shout) grita(entry, 'victoria');
      const reposo = restPose(piece);
      await poseTo(piece, reposo, QUEEN.summon, { clock, seconds: 0.5 });
      await clock.wait(1.3);
      if (s.undone) return;
      await poseTo(piece, QUEEN.summon, reposo, { clock, seconds: 0.6 });
      stand(piece);
    } else if (entry.kind === 'rook') {
      // La torre no se transforma para esto: dispara un cohete desde lo alto de sus almenas.
      const top = piece.figure.getWorldPosition(new THREE.Vector3());
      top.y += piece.height ?? 2;
      launch(top, s, 1.8);
    } else {
      await celebrate(entry, clock, { shout });
    }
  }

  // El rey o la reina que lo celebraba, otra vez quieto en su postura de reposo.
  function stand(piece) {
    for (const bone of new Set([...Object.keys(KING.raise), ...Object.keys(QUEEN.summon)])) piece.turnBone(bone, null);
    for (const [bone, turn] of Object.entries(restPose(piece))) piece.turnBone(bone, turn);
    piece.setSpearSpin?.(0);
  }

  // Un cohete desde `from`, con su silbido al salir y su estampido al reventar (el de un disparo, grave y
  // flojo, que de lejos es justo eso).
  function launch(from, s, height = 2.2) {
    sfx.play('silbido', { rate: 0.7, volume: 0.5 });
    confetti.firework(from, {
      colors: COLORS[s.color],
      height,
      onBurst: () => {
        if (!s.undone) sfx.play('disparo', { rate: 0.7, volume: 0.3 });
      },
    });
  }

  async function run(s) {
    const { king, winners } = s;
    const piece = king.piece;
    const center = piece.figure.getWorldPosition(new THREE.Vector3());
    // Hacia dónde caerá el báculo, y desde dónde mirarlo: de frente, ladeándose hacia ese lado.
    const staff = dropDirection(king, s.others);
    const facing = piece.figure.rotation.y;
    const frente = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).addScaledVector(new THREE.Vector3(staff.x, 0, staff.z), CLOSE_TOWARD_STAFF).normalize();
    sfx.play('jaque'); // ¡chan!: el golpe de orquesta del jaque, ahora el último
    onFocus?.(king);
    s.toma += 1;
    cinema.shot(clock, {
      look: new THREE.Vector3(center.x, CLOSE_LOOK, center.z),
      dir: frente,
      distance: cinema.portrait ? CLOSE_DISTANCE_TALL : CLOSE_DISTANCE,
      rise: CLOSE_RISE,
      seconds: CLOSE_SECONDS,
    });
    await clock.wait(DROP_AT);
    if (s.undone) return;
    // ¡Ooooh…! Y se le cae el báculo.
    grita(king, 'decepcion');
    piece.dropSpear?.(staff, {
      onHit: (end, strength, at) => {
        if (s.undone || strength < 0.12) return;
        sfx.play('casco', { rate: end === 'top' ? 1.35 : 1.6, volume: 0.35 + strength * 0.5 });
        if (end === 'top' && strength > 0.5) dust?.puff(at, { count: 4, radius: 0.2, duration: 0.35, size: 0.35 });
      },
    });
    await clock.wait(KNEEL_AT - DROP_AT);
    if (s.undone) return;
    await kneel(s);
    await clock.wait(Math.max(0, PARTY_AT - KNEEL_AT - KNEEL_SECONDS - SLUMP_SECONDS));
    if (s.undone) return;

    // LA FIESTA.
    sfx.play(s.fanfare);
    confetti.rain(center, { colors: COLORS[s.color], radius: CONFETTI_RADIUS, count: CONFETTI_COUNT, seconds: 3 });
    // La grúa: sube y lo va rodeando, y luego sigue dándole vueltas.
    const look = new THREE.Vector3(center.x, CRANE_LOOK, center.z);
    const desde = camera.position.clone().sub(look).setY(0).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), CRANE_TURN);
    const lejos = cinema.portrait ? CRANE_DISTANCE_TALL : CRANE_DISTANCE;
    toma(s, { look, dir: desde, distance: lejos, rise: CRANE_RISE, seconds: CRANE_SECONDS }, center, ORBIT_SPEED);
    fireworks(s, center, 0.5);
    // Y las piezas del ganador, cada una a su aire. Gritan el rey, la reina y alguna más, no todas.
    const gritan = new Set(winners.filter((e) => e.kind === 'king' || e.kind === 'queen'));
    for (const entry of [...winners].sort(() => Math.random() - 0.5)) {
      if (gritan.size >= SHOUTERS) break;
      if (entry.kind !== 'rook') gritan.add(entry);
    }
    for (const entry of winners) {
      const cuando = CELEBRATE_AT - PARTY_AT + Math.random() * CELEBRATE_SPREAD;
      clock.wait(cuando).then(() => {
        if (!s.undone) party(entry, s, gritan.has(entry)).catch((error) => console.warn('[BChess] Celebración', error));
      });
      // Y algunas repiten (sin gritar), que la fiesta sigue mientras se lee el cartel.
      if (Math.random() < 0.5) {
        clock.wait(cuando + ENCORE + Math.random()).then(() => {
          if (!s.undone) party(entry, s, false).catch((error) => console.warn('[BChess] Celebración', error));
        });
      }
    }

    // EL PLANO GENERAL: desde detrás de los que ganan, con todo ya a la vista (lo que tapaba al rey vuelve).
    await clock.wait(WIDE_AT - PARTY_AT);
    if (s.undone) return;
    offFocus?.();
    const wide = wideShot(s, center);
    toma(s, { look: wide.look, dir: wide.dir, distance: wide.distance, rise: wide.distance * WIDE_ELEVATION, seconds: WIDE_SECONDS }, wide.look, WIDE_ORBIT);
    confetti.rain(wide.winners, { colors: COLORS[s.color], radius: CONFETTI_RADIUS, count: CONFETTI_COUNT * 0.6, seconds: 2.5 });
    fireworks(s, center, WIDE_SECONDS * 0.6);
    await clock.wait(DIALOG_AT - WIDE_AT);
  }

  // Una toma (`cinema.shot`) y, al llegar, a dar vueltas alrededor de `around` ({x, z}). Cada toma deja sin
  // efecto las anteriores: la grúa acababa justo cuando empezaba el plano general, y su «ahora, a dar
  // vueltas» llegaba después y se lo comía (la cámara se quedaba rodeando al rey, a medio camino).
  function toma(s, shot, around, orbit) {
    const numero = ++s.toma;
    cinema.follow(null);
    cinema.shot(clock, shot).then(() => {
      if (!s.undone && s.toma === numero) cinema.follow(() => ({ x: around.x, z: around.z }), { orbit });
    });
  }

  // Unos cohetes por detrás del rey vencido, vistos desde donde está la cámara al lanzarlos: que estallen
  // en el plano. Empiezan dentro de `after` segundos.
  function fireworks(s, center, after) {
    for (let i = 0; i < FIREWORKS; i++) {
      clock.wait(after + i * FIREWORK_EVERY).then(() => {
        if (s.undone) return;
        const lado = (i % 2 ? 1 : -1) * (0.8 + Math.random() * 1.4);
        const atras = 1 + Math.random() * 1.2;
        const fuera = camera.position.clone().sub(center).setY(0).normalize();
        const from = new THREE.Vector3(
          center.x - fuera.x * atras + fuera.z * lado,
          0.2,
          center.z - fuera.z * atras - fuera.x * lado,
        );
        launch(from, s);
      });
    }
  }

  // El plano general (`wideFraming`): desde detrás de las piezas del ganador, mirando hacia el rey vencido.
  function wideShot(s, center) {
    const plan = wideFraming({
      king: center,
      winners: s.winners.map((entry) => entry.piece.figure.position),
      home: s.color === 'white' ? 1 : -1,
      fov: camera.fov,
      aspect: camera.aspect,
      toward: WIDE_TOWARD_WINNERS,
      min: WIDE_MIN,
      max: WIDE_MAX,
    });
    return {
      look: new THREE.Vector3(plan.look.x, WIDE_LOOK, plan.look.z),
      dir: new THREE.Vector3(plan.dir.x, 0, plan.dir.z),
      distance: plan.distance,
      winners: new THREE.Vector3(plan.winnersAt.x, 0, plan.winnersAt.z),
    };
  }

  return {
    get playing() {
      return Boolean(scene && !scene.undone);
    },

    // El mate: `king`, el rey vencido; `winners`, las piezas del ganador (`color`); `others`, todas las
    // demás (para que el báculo no les caiga encima); `fanfare`, el sonido de la fiesta. Devuelve cuándo sacar el cartel del final (antes, si se toca la pantalla:
    // `hurry`). La escena sigue detrás del cartel hasta `undo`.
    play({ king, winners, others, color, fanfare = 'victoria' }) {
      this.undo();
      const s = { king, winners, others, color, fanfare, undone: false, sobbing: null, hurry: null, posed: new Set(), toma: 0 };
      scene = s;
      const prisa = new Promise((resolve) => { s.hurry = resolve; });
      const hecho = run(s).catch((error) => console.warn('[BChess] Escena del mate', error));
      return Promise.race([hecho, prisa]);
    },

    // Un toque: el cartel ya (la fiesta sigue por detrás).
    hurry() {
      scene?.hurry?.();
    },

    // Ya hundido, respira hondo.
    update(dt) {
      const s = scene;
      if (!s || s.undone || s.sobbing === null) return;
      s.sobbing += dt;
      const k = Math.sin(s.sobbing * SOB.rate);
      const piece = s.king.piece;
      piece.turnBone('Spine', { x: SLUMP.Spine.x + k * SOB.spine });
      piece.turnBone('Head', { x: SLUMP.Head.x - k * SOB.head });
    },

    // Todo como estaba: el rey de pie con su báculo en la mano, sin confeti y la cámara para el usuario.
    undo() {
      const s = scene;
      if (!s) return;
      s.undone = true;
      s.hurry?.();
      scene = null;
      const piece = s.king.piece;
      for (const bone of new Set([...Object.keys(KNEEL), ...Object.keys(SLUMP)])) piece.turnBone(bone, null);
      piece.liftBone('Hips', null);
      for (const [bone, turn] of Object.entries(restPose(piece))) piece.turnBone(bone, turn); // los brazos, en reposo
      piece.holdSpear?.();
      for (const other of s.posed) stand(other); // y quien lo estuviera celebrando con los brazos en alto
      confetti.clear();
      cinema.follow(null);
      offFocus?.();
    },
  };
}
