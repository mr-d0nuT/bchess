import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { t } from '../../i18n.js';
import { sfx } from '../../audio/sfx.js';
import { afterImpact, punchDistance, SLOW_BEFORE, SLOW_MOTION, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { cutLimb, longAxisOf } from '../../pieces/limbs.js';
import {
  bladeBody, bladeStrikes, BODY_GAP, boneOf, bonePosition, dismountMode, facingTo, fallDirection, kickOf,
  knockOut, lyingBody, postOf, rightOf, shout, swordTip, toppleAt, victoryLap,
} from './common.js';

// Caballero come caballero: el Caballero Negro de los Monty Python (diseño, sección 7). Los dos desmontan y
// cruzan un par de golpes parados. El atacante le corta el brazo de la espada, que sale volando y rebota;
// el otro se mira el muñón y sigue peleando con el escudo. Le corta el otro brazo, recibe una patada y le
// corta las dos piernas. Queda un tronco en el suelo que aún le planta cara: «¡Solo es un rasguño!». Un
// toquecito en el yelmo y cae; desaparece en polvo con sus trozos y el ganador ocupa la casilla y monta.

const LIMBS = ['R_Upperarm', 'L_Upperarm', 'R_Thigh', 'L_Thigh']; // en este orden: espada, escudo y piernas
const SHRINK = 0.001; // a lo que encoge el hueso del trozo cortado
const CLASHES = 2; // golpes parados antes del primer corte
const CUT_SPEED = { x: 1.1, y: 2.6 }; // con lo que sale volando cada trozo
const SCRATCH = () => t('burbuja.rasguno');
// El bocadillo del rasguño: lo que dura y lo que se le deja leer antes del toquecito en el yelmo. Con 1,6 s
// y el toque a la mitad no daba tiempo a leerlo (lo dijo el usuario).
const SCRATCH_SECONDS = 3.8;
const READ_SECONDS = 2.4;
const STUMP_SECONDS = 0.5; // lo que se mira el muñón
const TAP_SECONDS = 0.35;
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;
const TRUNK_SECONDS = 0.3; // lo que tarda en caer al suelo el tronco sin piernas
const PELVIS = 0.14; // en alturas del jinete: de la articulación de la cadera a lo más bajo del tronco
// Adónde va cada corte. Antes los cuatro iban al mismo sitio (el final del tajo, a la altura de la
// cadera y siempre del mismo lado) y ninguno daba en el hombro ni en la cintura (lo vio el usuario).
// Ahora cada uno busca su blanco: el brazo se corta por el hombro, y la pierna, por el costado de la
// cintura (la articulación de la cadera, un poco hacia fuera).
const WAIST_OUT = 0.07;
const WAIST_UP = 0.12; // en alturas del jinete: el hueso `Waist` de su esqueleto está a la altura de la cadera
const STEP_SECONDS = 0.35; // el paso con el que se coloca para cada corte
const WALK_FROM = 0.25; // a partir de esta distancia, el paso es andando; por debajo, se arrima

// Dónde pasa la punta de la espada, bajando, por la altura `y`: { t, x, z } en el sistema de la figura
// (mirando hacia +Z). Si la bajada no llega tan abajo, su punto más bajo.
function downswingAt(path, y) {
  let top = 0;
  for (let i = 1; i < path.length; i++) if (path[i].y > path[top].y) top = i;
  let low = top;
  for (let i = top + 1; i < path.length; i++) {
    if (path[i].y < path[low].y) low = i;
    else if (path[i].y > path[low].y + 0.05) break; // vuelve a subir: se acabó la bajada
  }
  for (let i = top + 1; i <= low; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.y >= y && b.y <= y) {
      const k = (a.y - y) / Math.max(1e-6, a.y - b.y);
      return { t: a.t + (b.t - a.t) * k, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return { t: path[low].t, x: path[low].x, z: path[low].z };
}

// Por dónde pasa DE VERDAD la punta de la espada de `fighter` durante `seconds` ({ t, x, y, z }, en su
// sistema: desde sus pies y mirando hacia +Z). La medida de `strikes.js` se hace con una pieza de prueba,
// sin lo que se le hace al jinete en la partida (el torso erguido), y los cortes fallaban por un palmo.
// Ojo: el reloj mueve sus transiciones ANTES de que las piezas pongan la postura del fotograma, así que
// lo que se ve en cada paso es la postura del momento anterior.
function recordTip(clock, fighter, seconds) {
  const path = [];
  const figure = fighter.figure;
  const at = new THREE.Vector3();
  let before = 0;
  return clock.tween(seconds, (k) => {
    const tip = swordTip(fighter);
    figure.getWorldPosition(at);
    const dx = tip.x - at.x;
    const dz = tip.z - at.z;
    const c = Math.cos(figure.rotation.y);
    const sn = Math.sin(figure.rotation.y);
    path.push({ t: before, x: dx * c - dz * sn, y: tip.y - at.y, z: dx * sn + dz * c });
    before = k * seconds;
  }).then(() => path);
}

// Espera a que la punta de la espada, bajando, pase por la altura `y` (del mundo), y como mucho `seconds`.
// La bajada del tajo es tan rápida (unos 5 m/s) que un fotograma de más o de menos son un palmo: por eso
// el corte no se fía del cronómetro, sino de dónde está la punta.
function tipBelow(clock, fighter, y, seconds) {
  return new Promise((resolve) => {
    let done = false;
    clock.tween(seconds, (k) => {
      if (done) return;
      if (swordTip(fighter).y <= y || k >= 1) {
        done = true;
        resolve();
      }
    });
  });
}

// El blanco de cada corte, en el mundo: el hombro (donde empieza el brazo) o el costado de la cintura (del
// lado de esa pierna, un poco hacia fuera, y a la altura de la cintura de verdad: algo por encima del
// hueso que se llama así, que en este esqueleto está a la altura de la cadera).
function cutTarget(fighter, bone, center) {
  const at = bonePosition(fighter, bone);
  if (!bone.includes('Thigh')) return at;
  const out = Math.hypot(at.x - center.x, at.z - center.z) || 1;
  at.x += ((at.x - center.x) / out) * WAIST_OUT;
  at.z += ((at.z - center.z) / out) * WAIST_OUT;
  at.y = bonePosition(fighter, 'Waist').y + WAIST_UP * fighter.height;
  return at;
}

// Dónde ha de ponerse quien mira hacia `facing` para que la punta de su espada, en `tip` (en su sistema),
// caiga en `target`.
function standFor(target, tip, facing) {
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  return { x: target.x - (tip.x * c + tip.z * sn), z: target.z - (-tip.x * sn + tip.z * c) };
}

// Un paso hasta `to` ({x, z}) sin perder de vista al rival: si es corto, se arrima; si no, se gira, anda y
// vuelve a encararlo.
async function stepTo(clock, fighter, to, facing) {
  const figure = fighter.figure;
  const from = { x: figure.position.x, z: figure.position.z };
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d < 0.02) return;
  const walking = d > WALK_FROM;
  if (walking) fighter.play('walk', { fade: 0.12 });
  await clock.tween(STEP_SECONDS + (walking ? d * 0.6 : 0), (k) => {
    const e = k * k * (3 - 2 * k);
    figure.position.x = from.x + (to.x - from.x) * e;
    figure.position.z = from.z + (to.z - from.z) * e;
  });
  figure.rotation.y = facing;
  if (walking) fighter.play('idle', { fade: 0.15 });
}

export const knightFightsKnight = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'knight',
  can: (attacker, defender) => bladeStrikes(attacker.piece.rider, { thrust: false }).length > 0
    && LIMBS.every((bone) => boneOf(defender.piece.rider, bone)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const mine = attacker.piece.rider;
    const his = defender.piece.rider;
    const slashes = bladeStrikes(mine, { thrust: false });
    const hisSlashes = bladeStrikes(his, { thrust: false });
    const facing = facingTo(center, home);
    const measure = mine.strikes[slashes[0]];

    // 1. La cámara encuadra y los dos desmontan, cara a cara y a distancia de espada.
    const distance = Math.max(
      attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP,
      punchDistance({ body: bladeBody(measure.blade), from: home, center, target: his, torso: defender.piece.body.torso }),
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    stances.set(attacker, stanceOf(postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: slashes[0] }])));
    stances.set(defender, stanceOf(postOf(defender, center, facing, hisSlashes[0] ? [{ action: 'attack', key: hisSlashes[0] }] : [])));
    await cinema.frame(clock, home, center, obstacles);
    await Promise.all([
      attacker.mover.dismount({ at: spots.attacker, facing: spots.attackerFacing, mode: 'dismount' }),
      defender.mover.dismount({ at: center, facing, mode: dismountMode(random) }),
    ]);
    // Ya a pie y en sus puestos, la cámara los vuelve a encuadrar: de lado, desde el de la espada del
    // atacante, y sin las lanzas que han clavado (o que han salido volando) entre ella y el combate. Antes
    // se quedaba con el encuadre de antes de desmontar, a veces desde detrás de uno y con las lanzas
    // delante (lo vio el usuario).
    const lanzas = [mine, his]
      .map((fighter) => fighter.props.spear)
      .filter((spear) => spear?.visible)
      .map((spear) => {
        const p = spear.getWorldPosition(new THREE.Vector3());
        return { x: p.x, z: p.z };
      });
    const estorbos = [...obstacles, ...lanzas];
    const favor = rightOf(spots.attackerFacing);
    await cinema.frame(clock, spots.attacker, center, estorbos, { favor });

    // 2. Un par de golpes parados, con chispas donde se cruzan las hojas. Del primero se graba por dónde
    //    pasa la punta, para apuntar luego los cortes.
    let recording = null;
    for (let i = 0; i < CLASHES; i++) {
      const mio = mine.playOnce('attack', { clip: slashes[i % slashes.length], fade: 0.15 });
      if (i === 0) recording = recordTip(clock, mine, mine.strikes[slashes[0]].duration);
      const suyo = hisSlashes.length ? his.playOnce('attack', { clip: hisSlashes[i % hisSlashes.length], fade: 0.15 }) : null;
      await slowToImpact(clock, mine.strikes[slashes[i % slashes.length]].blade.t);
      const cruce = swordTip(mine).lerp(his.props.sword ? swordTip(his) : swordTip(mine), 0.5);
      sfx.play('espadas'); // las hojas se cruzan y una resbala por la otra
      fx.burst(cruce, { size: 0.8, sparks: 18 });
      hud.flash();
      cinema.shake(0.1);
      shout(bubbles, '¡CLANC!', cruce);
      await afterImpact(clock);
      await Promise.all([mio, suyo]);
      mine.play('idle', { fade: 0.2 });
      his.play('idle', { fade: 0.2 });
    }

    // 3. Corta brazos y piernas. Cada trozo sale volando de la propia malla y el hueso encoge; entre los
    //    brazos y las piernas, el atacante recibe una patada del otro (si la tiene) y sigue.
    const kick = kickOf(his);
    const recorded = recording ? await recording : null;
    let trunkDrop = 0; // lo que ha bajado el tronco al quedarse sin piernas
    for (const [n, bone] of LIMBS.entries()) {
      const key = slashes[n % slashes.length];
      // Se coloca para que la punta, al bajar, pase justo por el blanco.
      const target = cutTarget(his, bone, center);
      const baseY = mine.figure.position.y;
      const path = key === slashes[0] && recorded?.length ? recorded : mine.strikes[key].blade.path;
      const aim = path?.length
        ? downswingAt(path, target.y - baseY)
        : { t: mine.strikes[key].blade.t, x: mine.strikes[key].blade.side, z: mine.strikes[key].blade.reach };
      const stand = standFor(target, aim, spots.attackerFacing);
      stances.set(attacker, stanceOf(postOf(attacker, stand, spots.attackerFacing, [{ action: 'attack', key }])));
      // Y la cámara, mientras se coloca, vuelve a ponerse de perfil: el paso cambia la línea entre los dos.
      await Promise.all([
        stepTo(clock, mine, stand, spots.attackerFacing),
        cinema.frame(clock, stand, center, estorbos, { favor }),
      ]);
      const cutting = mine.playOnce('attack', { clip: key, fade: 0.15 });
      // A cámara lenta desde un poco antes, y el corte cuando la punta pasa de verdad por el blanco.
      await clock.wait(Math.max(0, aim.t - SLOW_BEFORE));
      clock.timeScale = SLOW_MOTION;
      await tipBelow(clock, mine, target.y, SLOW_BEFORE * 2);
      const at = target;
      fx.burst(at, { size: 1, sparks: 26 });
      hud.flash();
      cinema.shake(0.16);
      shout(bubbles, bone.includes('Thigh') ? '¡ZAS!' : '¡CHAS!', at);
      sfx.play('corte');
      grita(defender, 'dolor');
      const piece = cutLimb(his.object, bone);
      // El brazo de la espada se va con la espada: su mano la sigue agarrando mientras vuela, y al
      // caer se tumba a lo largo del filo en vez de quedarse clavado de punta.
      const espada = n === 0 && piece ? his.props.sword : null;
      let lie = null;
      if (espada) {
        const eje = longAxisOf(espada);
        piece.updateMatrixWorld(true);
        piece.attach(espada);
        lie = () => eje.clone().transformDirection(espada.matrixWorld);
      }
      if (piece) {
        debris.throwPiece(piece, {
          velocity: { x: Math.sin(spots.attackerFacing) * CUT_SPEED.x, y: CUT_SPEED.y, z: Math.cos(spots.attackerFacing) * CUT_SPEED.x },
          obstacles: () => crowd.obstacles([attacker, defender]),
          lie,
        });
      }
      his.scaleBone(bone, SHRINK);
      if (n === 0 && his.props.sword && !espada) his.props.sword.visible = false;
      if (n === 1 && his.props.shield) his.props.shield.visible = false;
      await afterImpact(clock);
      await cutting;
      mine.play('idle', { fade: 0.25 });
      if (n === 0) {
        his.play('idle', { fade: 0.2 }); // se mira el muñón
        await clock.wait(STUMP_SECONDS);
      }
      if (n === 1 && kick) {
        const kicking = his.playOnce('attack', { clip: kick, fade: 0.15 });
        await slowToImpact(clock, his.strikes[kick].body.t);
        const toe = bonePosition(his, his.strikes[kick].body.bone);
        fx.burst(toe, { size: 0.8, sparks: 16 });
        cinema.shake(0.12);
        shout(bubbles, t('burbuja.toma'), toe);
        sfx.play('punetazo');
        if (mine.has('hit')) mine.playOnce('hit', { fade: 0.1 });
        await afterImpact(clock);
        await kicking;
        his.play('idle', { fade: 0.2 });
      }
      if (n === LIMBS.length - 1) {
        stances.delete(defender);
        // Sin piernas, el tronco se queda en el aire a la altura de la cadera: cae de golpe al suelo
        // (la cadera, contra el tablero) antes de decir nada.
        const figura = his.figure;
        const cadera = (bonePosition(his, 'L_Thigh').y + bonePosition(his, 'R_Thigh').y) / 2;
        const baseY = figura.position.y;
        trunkDrop = Math.max(0, cadera - baseY - PELVIS * his.height);
        await clock.tween(TRUNK_SECONDS, (k) => {
          figura.position.y = baseY - trunkDrop * k * k;
        });
        const golpe = new THREE.Vector3(center.x, DUST_Y, center.z);
        dust.puff(golpe, { count: 16, radius: 0.6, duration: 0.5 });
        cinema.shake(0.14);
        shout(bubbles, '¡PUMBA!', bonePosition(his, 'Head'));
        sfx.play('caida_armadura', { rate: 0.9 }); // el tronco, contra el tablero
        await clock.wait(0.35);
        bodies.push(lyingBody({ at: center, angle: facing, length: his.height * 0.5, radius: 0.3 }));
      }
    }

    // 4. El tronco aún le planta cara, con su bocadillo; un toquecito en el yelmo y cae.
    const head = boneOf(his, 'Head');
    const bocadillo = bubbles.say(SCRATCH(), head, { seconds: SCRATCH_SECONDS });
    await clock.wait(READ_SECONDS);
    const tap = mine.playOnce('attack', { clip: slashes[0], fade: 0.15 });
    await clock.wait(TAP_SECONDS);
    fx.burst(bonePosition(his, 'Head'), { size: 0.7, sparks: 14 });
    hud.flash();
    shout(bubbles, '¡TOC!', bonePosition(his, 'Head'));
    sfx.play('casco', { rate: 1.5, volume: 0.5 }); // un toquecito, no un mazazo
    await bocadillo;
    const angle = fallDirection({
      at: center,
      around: facing + Math.PI,
      spread: FALL_SPREAD,
      length: his.height * 0.5,
      rival: { x: spots.attacker.x, z: spots.attacker.z, radius: attacker.piece.body.torso },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    // Cae de espaldas girando por la cadera, que es donde se apoya el tronco.
    grita(defender, 'caida');
    await toppleAt({ clock, figure: his.figure, pivot: trunkDrop, forward: false, sound: 'caida_armadura' });
    const donde = bonePosition(his, 'Head');
    dust.puff(new THREE.Vector3(donde.x, DUST_Y, donde.z), { count: 14, radius: 0.7, duration: 0.5 });
    cinema.shake(0.12);
    await tap;
    mine.play('idle', { fade: 0.3 });
    await knockOut({ clock, fx, fighter: his });

    // 5. Desaparece en polvo con sus trozos; el ganador ocupa la casilla y monta.
    bodies.length = 0;
    debris.clear({ seconds: 0.3 });
    await defender.mover.defeated({ avoid: center });
    his.resetBones();
    stances.delete(attacker);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.mount(target) });
  },
};
