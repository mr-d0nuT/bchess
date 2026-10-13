import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { t } from '../../i18n.js';
import { sfx } from '../../audio/sfx.js';
import { afterImpact, HIT_STOP, punchDistance, SLOW_AFTER, SLOW_BEFORE, SLOW_MOTION, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { aroundLength, aroundPath, clashSpot, cutStand, segmentDistance, standsAiming, standsAround } from '../sword-contact.js';
import { cutLimb, longAxisOf } from '../../pieces/limbs.js';
import {
  bladeBody, bladeIntoBody, bladesMeet, bladeStrikes, BODY_GAP, bodyParts, boneOf, bonePosition, circleTo, dismountMode,
  downswingAt, facingTo, fallDirection, kickOf, knockOut, lyingBody, postOf, rehearseBlade, rightOf, shout, standFor, stepTo,
  swordTip, toppleAt, untilTouch, victoryLap,
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
const RECOIL_SECONDS = 0.35; // tras el golpe, lo que tarda la hoja en volver arriba
const GUARD_SECONDS = 0.5; // y tras los golpes parados, en bajar la espada al reposo
// Los tajos del duelo, en tres tiempos: levanta la espada (del reposo a la postura del tajo con la espada ya arriba,
// en STRIKE_FROM, quieta), la tiene arriba un instante y la baja. El clip empezaba con un segundo de guardia, la
// espada baja apuntando al otro, y al levantarla la barría por delante hacia su izquierda: cara a cara, una hoja
// atravesaba la otra. Fundiendo del reposo a la espada arriba, sube por delante, sin barrer.
const STRIKE_FROM = 1.95;
const RAISE_SECONDS = 0.45;
const HOLD_SECONDS = 0.2;
// En alturas del jinete: lo lejos del blanco que puede entrar primero la hoja en un corte y en el toque al yelmo.
const CUT_REACH = 0.1;
const TAP_REACH = 0.12;
// Dónde puede ponerse para cada corte: alrededor del otro, de cerca a STAND_FAR y por cualquier lado (lo rodea si
// hace falta; la cámara se pone después del lado de su espada), mirándolo o algo desviado, y sin pisar ni atravesar
// un caballo.
const STAND_FAR = 1.3;
const STAND_STEP = 0.05;
const STAND_ANGLE = Math.PI / 18;
const STAND_YAWS = [-0.2, 0, 0.2];
// Lo que ha de librar la hoja, hasta tocar el blanco, de lo que no es el blanco (el otro se queda quieto mientras le
// apuntan, `hold`, así que basta poco).
const CUT_MARGIN = { head: 0.02, other: 0.01 };
// Para las piernas, el otro se aparta: al ver venir la espada dobla el tronco hacia el otro lado. Tiene la cabeza justo
// encima de la cintura, y el tajo, que baja desde lo alto, no llegaba a la cintura sin pasar antes por ella (salvo por
// un pasillo de dos dedos); así se aparta un palmo y deja paso.
const LEAN = 22; // grados
const LEAN_BONE = 'Spine01';
const LEAN_SECONDS = 0.4;

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

// Levanta la espada para el tajo `key` y la deja arriba, quieta; `strike` la baja. Devuelve la acción (para pararla
// al chocar).
function raise(fighter, key) {
  const action = fighter.play('attack', { loop: false, fade: RAISE_SECONDS, clip: key });
  if (action) {
    action.time = STRIKE_FROM;
    action.paused = true;
  }
  return action;
}
async function strike(clock, actions) {
  await clock.wait(RAISE_SECONDS + HOLD_SECONDS);
  for (const action of actions) if (action) action.paused = false;
}

// Tras el golpe, la hoja vuelve por donde ha venido hasta la espada en alto (el tajo, hacia atrás): si volviera al
// reposo, con la espada baja apuntando al frente, se le metía al otro en el cuerpo o en el escudo.
function recoil(clock, action) {
  if (!action) return Promise.resolve();
  const from = action.time;
  action.paused = true;
  return clock.tween(RECOIL_SECONDS, (k) => {
    action.time = from + (STRIKE_FROM - from) * k * k * (3 - 2 * k);
  });
}

// Las piezas del cuerpo que puede atravesar la hoja al cortar `bone` sin que cuente como meterse donde no toca: el
// propio miembro; y, para las piernas, la cadera, que se cortan por el costado de la cintura.
function spareFor(bone) {
  const side = bone[0];
  return bone.includes('Thigh') ? [`${side}_leg`, 'pelvis'] : [`${side}_arm`];
}

// Dobla el tronco de `fighter` `degrees` hacia su derecha (negativo, hacia su izquierda), desde la cintura; con 0, nada.
function lean(fighter, degrees) {
  fighter.turnBone(LEAN_BONE, degrees ? { z: degrees } : null);
}
function leanTo(clock, fighter, from, to) {
  return clock.tween(LEAN_SECONDS, (k) => lean(fighter, from + (to - from) * k * k * (3 - 2 * k)));
}

// Lo alto del yelmo: el final de la pieza de la cabeza (`bodyParts`), más su grueso.
function helmetTop(fighter) {
  const head = bodyParts(fighter).find((part) => part.limb === 'head');
  return head ? head.b.clone().add(new THREE.Vector3(0, head.r, 0)) : null;
}

// Dónde se pone el atacante, y hacia dónde mira, para que su tajo (`path`, ensayado; o, sin él, el medido del golpe
// `key`) toque primero `target`, a menos de `reach` alturas del otro, y en qué instante del tajo lo toca: { stand,
// facing, t }. Si no hay sitio que valga, donde la punta, al bajar, pasa por el blanco, mirando hacia donde mira.
function aimCut({ mine, his, key, path, target, center, minDistance, spare, reach, horses = [] }) {
  const at = mine.figure.position;
  const facing = mine.figure.rotation.y;
  const aim = path?.length
    ? downswingAt(path, target.y - at.y)
    : { t: mine.strikes[key].blade.t, x: mine.strikes[key].blade.side, z: mine.strikes[key].blade.reach };
  const guess = { stand: standFor(target, aim, facing), facing, t: aim.t };
  if (!path?.length) return guess;
  const distances = [];
  for (let d = minDistance; d <= STAND_FAR + 1e-9; d += STAND_STEP) distances.push(d);
  // Alrededor, en una rejilla; y los sitios desde los que la hoja pasa justo por el blanco. Sin ponerse encima de un
  // caballo (con su cuerpo, la mitad del hueco entre los dos luchadores) ni pasar por él para llegar.
  const flat = (p) => ({ x: p.x, y: 0, z: p.z });
  const gap = (p, horse) => segmentDistance(flat(p), flat(p), flat(horse.from), flat(horse.to)).distance - horse.radius;
  const stands = [
    ...standsAround({ center, bearing: Math.atan2(at.x - center.x, at.z - center.z), distances, spread: Math.PI, step: STAND_ANGLE, yaws: STAND_YAWS }),
    ...standsAiming({ path, target, center, minDistance }),
  ].filter((stand) => horses.every((horse) => gap(stand.at, horse) >= minDistance / 2 && aroundPath(at, stand.at, center).every((p) => gap(p, horse) >= 0)));
  const plan = cutStand({
    path, body: bodyParts(his), target, reach: reach * his.height, stands, facing, spare, margin: CUT_MARGIN,
    walk: (stand) => aroundLength(at, stand.at, center),
  });
  return plan ? { stand: plan.at, facing: plan.facing, t: plan.t } : guess;
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
    // Ya a pie, la cámara los vuelve a encuadrar (al ponerse para los golpes parados, abajo): de lado, desde
    // el de la espada del atacante, y sin las lanzas que han clavado (o que han salido volando) entre ella y
    // el combate. Antes se quedaba con el encuadre de antes de desmontar, a veces desde detrás de uno y con
    // las lanzas delante (lo vio el usuario).
    const lanzas = [mine, his]
      .map((fighter) => fighter.props.spear)
      .filter((spear) => spear?.visible)
      .map((spear) => {
        const p = spear.getWorldPosition(new THREE.Vector3());
        return { x: p.x, z: p.z };
      });
    // Y los caballos, que esperan apartados: la cámara no ha de quedar tras ellos, ni el atacante ponerse encima. Cómo
    // están ahora: lo que ocupan, { from, to, radius }, a lo largo del caballo (`room` da un círculo de su medio largo,
    // que de lado lo hincha el doble).
    const horses = () => [attacker, defender]
      .map((entry) => entry.piece)
      .filter((knight) => knight.horse?.object.visible && !knight.mounted)
      .map((knight) => {
        const figure = knight.horse.figure;
        const scale = figure.scale.x;
        const half = Math.max(0, knight.mount.halfLength - knight.mount.halfWidth) * scale;
        const ux = Math.sin(figure.rotation.y) * half;
        const uz = Math.cos(figure.rotation.y) * half;
        const { x, z } = figure.position;
        return { from: { x: x - ux, z: z - uz }, to: { x: x + ux, z: z + uz }, radius: knight.mount.halfWidth * scale };
      });
    const estorbos = () => [...obstacles, ...lanzas, ...horses().flatMap(({ from, to }) => [from, to])];
    const favor = rightOf(spots.attackerFacing);

    // 2. Un par de golpes parados. Cara a cara, cada tajo baja hacia la izquierda de quien lo da, por su lado, y las
    //    hojas se cruzaban a un palmo sin tocarse, con el ¡CLANC! saliendo ya con las espadas bajadas (lo vio el
    //    usuario). Se ensayan los tajos de los dos en las propias piezas, ya a pie, y el atacante se aparta lo justo
    //    a su derecha y atrás para que las hojas se encuentren en el aire, por en medio; el golpe sale cuando se
    //    tocan de verdad, y en vez de seguir (una atravesaría la otra) se quedan juntas el instante del golpe y
    //    vuelven atrás por donde han venido.
    const path = rehearseBlade(mine, slashes[0], { from: STRIKE_FROM, fade: 0 });
    const hisPath = hisSlashes.length && his.props.sword ? rehearseBlade(his, hisSlashes[0], { from: STRIKE_FROM, fade: 0 }) : null;
    // Y con la subida desde el reposo, para los cortes: muy cerca, al levantar la espada le pasaba por la cabeza.
    const rising = rehearseBlade(mine, slashes[0], { from: STRIKE_FROM, raise: RAISE_SECONDS });
    const minDistance = attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP;
    const clash = path && hisPath
      ? clashSpot({ mine: path, his: hisPath, from: spots.attacker, facing: spots.attackerFacing, rival: center, rivalFacing: facing, minDistance })
      : null;
    const duelSpot = clash?.at ?? spots.attacker;
    stances.set(attacker, stanceOf(postOf(attacker, duelSpot, spots.attackerFacing, [{ action: 'attack', key: slashes[0] }])));
    await Promise.all([
      stepTo(clock, mine, duelSpot, spots.attackerFacing),
      cinema.frame(clock, duelSpot, center, estorbos(), { favor }),
    ]);
    // El caballo del otro, que esperaba a su lado, sale huyendo en cuanto suenan las espadas (si lo tiró, ya se ha
    // ido): para cortarle por ese costado, el atacante tiene que poder ponerse allí.
    defender.mover.horseFlee?.({ avoid: center });
    for (let i = 0; i < CLASHES; i++) {
      const key = slashes[i % slashes.length];
      const mio = raise(mine, key);
      const suyo = hisSlashes.length ? raise(his, hisSlashes[i % hisSlashes.length]) : null;
      await strike(clock, [mio, suyo]);
      await clock.wait(Math.max(0, (clash?.t ?? mine.strikes[key].blade.t) - STRIKE_FROM - SLOW_BEFORE));
      clock.timeScale = SLOW_MOTION;
      const cruce = his.props.sword
        ? await untilTouch(clock, bladesMeet(mine, his), { seconds: SLOW_BEFORE * 2, after: SLOW_BEFORE })
        : swordTip(mine);
      if (mio) mio.paused = true;
      if (suyo) suyo.paused = true;
      sfx.play('espadas'); // las hojas se cruzan y una resbala por la otra
      fx.burst(cruce, { size: 0.8, sparks: 18 });
      hud.flash();
      cinema.shake(0.1);
      shout(bubbles, '¡CLANC!', cruce);
      await clock.hold(HIT_STOP);
      recoil(clock, mio);
      recoil(clock, suyo);
      await clock.wait(SLOW_AFTER);
      clock.timeScale = 1;
      mine.play('idle', { fade: GUARD_SECONDS });
      his.play('idle', { fade: GUARD_SECONDS });
    }
    // Ya con las espadas bajadas: los cortes se apuntan con el otro quieto, y a media bajada aún movía el brazo.
    await clock.wait(GUARD_SECONDS);

    // 3. Corta brazos y piernas. Para cada corte busca dónde ponerse para que la hoja, al bajar, entre primero por el
    //    blanco (el hombro, o el costado de la cintura) y no por la cabeza o el pecho, y el ¡CHAS! sale cuando lo
    //    toca de verdad: antes salía al pasar la punta por la altura del blanco, con la hoja ya dentro del cuerpo.
    //    Cada trozo sale volando de la propia malla y el hueso encoge; entre los brazos y las piernas, el atacante
    //    recibe una patada del otro (si la tiene) y sigue.
    const kick = kickOf(his);
    let trunkDrop = 0; // lo que ha bajado el tronco al quedarse sin piernas
    for (const [n, bone] of LIMBS.entries()) {
      const key = slashes[n % slashes.length];
      const cut = key === slashes[0] && rising ? rising : rehearseBlade(mine, key, { from: STRIKE_FROM, raise: RAISE_SECONDS });
      // Quieto mientras el otro se coloca y le pega: su reposo se cambia de pie y se va un palmo de lado, y el tajo,
      // apuntado con la cabeza a dos dedos, le daría en ella. Para las piernas, además, se aparta (`LEAN`): el corte se
      // apunta con el tronco ya doblado, y se dobla de verdad mientras el otro se coloca.
      his.hold(true);
      const away = bone.includes('Thigh') ? (bone[0] === 'R' ? -LEAN : LEAN) : 0;
      if (away) {
        lean(his, away);
        his.update(0);
      }
      const target = cutTarget(his, bone, center);
      const { stand, facing: toward, t: when } = aimCut({
        mine, his, key, path: cut, target, center, minDistance, spare: spareFor(bone), reach: CUT_REACH, horses: horses(),
      });
      if (away) {
        lean(his, 0);
        his.update(0);
      }
      stances.set(attacker, stanceOf(postOf(attacker, stand, toward, [{ action: 'attack', key }])));
      // Y la cámara, mientras se coloca, vuelve a ponerse de perfil, del lado de su espada: el paso cambia la línea
      // entre los dos.
      await Promise.all([
        circleTo(clock, mine, center, stand, toward),
        cinema.frame(clock, stand, center, estorbos(), { favor: rightOf(toward) }),
        away ? leanTo(clock, his, 0, away) : null,
      ]);
      const cutting = raise(mine, key);
      await strike(clock, [cutting]);
      // A cámara lenta desde un poco antes, y el corte cuando la hoja toca de verdad. Ahí se para (como al chocar las
      // espadas) y vuelve arriba mientras el trozo sale volando: si el tajo siguiera, se metía en el tronco.
      await clock.wait(Math.max(0, when - STRIKE_FROM - SLOW_BEFORE));
      clock.timeScale = SLOW_MOTION;
      const at = await untilTouch(clock, bladeIntoBody(mine, his), { seconds: SLOW_BEFORE * 2, after: SLOW_BEFORE });
      if (cutting) cutting.paused = true;
      his.hold(false);
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
          velocity: { x: Math.sin(toward) * CUT_SPEED.x, y: CUT_SPEED.y, z: Math.cos(toward) * CUT_SPEED.x },
          obstacles: () => crowd.obstacles([attacker, defender]),
          lie,
        });
      }
      his.scaleBone(bone, SHRINK);
      if (n === 0 && his.props.sword && !espada) his.props.sword.visible = false;
      if (n === 1 && his.props.shield) his.props.shield.visible = false;
      await clock.hold(HIT_STOP);
      recoil(clock, cutting);
      await Promise.all([clock.wait(SLOW_AFTER), away ? leanTo(clock, his, away, 0) : null]);
      clock.timeScale = 1;
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

    // 4. El tronco aún le planta cara, con su bocadillo; un toquecito en lo alto del yelmo y cae. Se apunta como los
    //    cortes, la espada se para al tocarlo y el tajo empieza a tiempo de que el toque llegue cuando ya se ha podido
    //    leer el bocadillo. Antes el ¡TOC! salía con la espada aún abajo, sin haber empezado el tajo.
    const head = boneOf(his, 'Head');
    const bocadillo = bubbles.say(SCRATCH(), head, { seconds: SCRATCH_SECONDS });
    const shown = clock.now;
    his.hold(true);
    const yelmo = helmetTop(his);
    const toque = yelmo && rising
      ? aimCut({
        mine, his, key: slashes[0], path: rising, target: yelmo, center, minDistance, spare: ['head'], reach: TAP_REACH, horses: horses(),
      })
      : null;
    if (toque) await circleTo(clock, mine, center, toque.stand, toque.facing);
    const down = toque ? toque.t - STRIKE_FROM : 0; // de soltar la espada al toque
    await clock.wait(Math.max(0, READ_SECONDS - RAISE_SECONDS - HOLD_SECONDS - down - (clock.now - shown)));
    const tap = raise(mine, slashes[0]);
    await strike(clock, [tap]);
    // A cámara lenta, como los cortes: a velocidad normal la hoja corre tanto que se paraba a un palmo del yelmo.
    await clock.wait(Math.max(0, down - SLOW_BEFORE));
    clock.timeScale = SLOW_MOTION;
    const toc = await untilTouch(clock, bladeIntoBody(mine, his), { seconds: SLOW_BEFORE * 2, after: SLOW_BEFORE });
    if (tap) tap.paused = true;
    his.hold(false);
    fx.burst(toc, { size: 0.7, sparks: 14 });
    hud.flash();
    shout(bubbles, '¡TOC!', toc);
    sfx.play('casco', { rate: 1.5, volume: 0.5 }); // un toquecito, no un mazazo
    await clock.hold(HIT_STOP);
    recoil(clock, tap); // y levanta la espada
    await clock.wait(SLOW_AFTER);
    clock.timeScale = 1;
    await bocadillo;
    const angle = fallDirection({
      at: center,
      around: facing + Math.PI,
      spread: FALL_SPREAD,
      length: his.height * 0.5,
      rival: { x: mine.figure.position.x, z: mine.figure.position.z, radius: attacker.piece.body.torso },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    // Cae de espaldas girando por la cadera, que es donde se apoya el tronco.
    grita(defender, 'caida');
    await toppleAt({ clock, figure: his.figure, pivot: trunkDrop, forward: false, sound: 'caida_armadura' });
    const donde = bonePosition(his, 'Head');
    dust.puff(new THREE.Vector3(donde.x, DUST_Y, donde.z), { count: 14, radius: 0.7, duration: 0.5 });
    cinema.shake(0.12);
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
