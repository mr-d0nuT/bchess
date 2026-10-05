import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { afterImpact, SLOW_MOTION, slowToImpact, stanceOf } from '../fight.js';
import { shieldOf, strikeSpot, usableStrikes } from '../plan.js';
import {
  BODY_GAP, bonePosition, COMBAT_RAISE, downswingAt, facingTo, fallDirection, knockOut, lyingBody, PAWN_BODY, postOf,
  rehearseBlade, rightOf, shout, standFor, stepTo, tipBelow, topple, victoryLap,
} from './common.js';

// Caballero come peón, a pie y a espadazo limpio. El caballero salta hasta el peón y desmonta. El peón le
// tira una estocada con la lanza y él la para con el escudo, entre chispas. Entonces se arrima, alza la
// espada y, a cámara lenta, se la descarga en el casco: ¡CLONC!, estrellitas, el peón suelta la lanza, se
// tambalea y cae de espaldas. El caballero ocupa la casilla y vuelve a montar.
//
// Antes lo atravesaba con una «estocada» que era un puñetazo de izquierda: la mano de la espada casi no se
// movía, la hoja se quedaba en alto junto a su cabeza y avanzaba un palmo, y parecía un golpe a la cabeza
// que no llegaba. El tajo, de arriba abajo, sí llega: se mide por dónde pasa la punta de la espada
// (`chopHit`) y el caballero se planta donde la hoja, bajando, cae justo en lo alto del casco. Y la cámara
// se pone del lado de la espada: desde el del escudo, al pararla, el escudo tapaba la escena.
//
// Y las dos cosas, apuntadas de verdad (lo pidió el usuario: la lanza y el escudo no se tocaban). La lanza
// del peón llega lejos —la lleva cogida por atrás, que el regatón no le puede atravesar el cuerpo— y antes
// se acortaba deslizándola en el puño, pero lo que la aparta del cuerpo la volvía a empujar y la punta
// pasaba de largo junto al escudo. Ahora no se acorta: el caballero se planta donde la punta, a su alcance
// de verdad, cae en la cara de su escudo en guardia (medido sin que se vea), con el brazo a la altura de la
// punta. Y el tajo, como en el duelo de caballeros: la hoja baja por la derecha del caballero, así que se
// planta a un lado, y el golpe llega cuando la punta pasa de verdad por lo alto del casco.
//
// (El nombre del fichero es de cuando lo atravesaba.)

const CHOP = 'slash'; // el tajo de arriba abajo
const HELMET = 0.12; // de la cabeza (su hueso) a lo alto del casco, donde cae la hoja
const PARRY_GAP = 1.7; // de centro a centro, al parar la estocada, si no se sabe cuánto alcanza la lanza
const GUARD = 70; // grados que sube el brazo del escudo para parar, si no se sabe a qué altura llega la punta
const GUARDS = [30, 40, 50, 60, 70, 80, 90, 100]; // los que se prueban para poner el escudo a la altura de la punta
const SHIELD_FACE = 0.04; // del centro del escudo a su cara: la punta se queda ahí, no dentro
const GUARD_SECONDS = 0.25;
const GRIP_SETTLE = 0.35; // lo que tarda la lanza del peón en ponerse de punta
const JAB_LEAD = 0.9; // lo que se ve de su estocada antes de que llegue: la entera tarda 2,3 s en soltarla
const HOLD = 0.3; // la espada en alto, aguantando, antes de caer
const SETTLE = 0.5; // lo que tarda el peón en volver a su guardia tras la estocada: hasta entonces la cabeza aún va hacia delante
const DAZE_SECONDS = 0.9; // lo que se tambalea el peón con estrellitas antes de caer
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

// El centro del escudo del jinete con el brazo del escudo subido `guard` grados, en su sistema (desde sus
// pies y mirando hacia +Z). Se mide sin que se vea: se sube el brazo, se mira y se baja, todo entre dos
// fotogramas.
function guardedShield(rider, guard) {
  const shield = rider.props.shield;
  if (!shield) return null;
  rider.turnBone('L_Upperarm', { x: -guard });
  rider.update(0);
  rider.object.updateMatrixWorld(true);
  const c = new THREE.Box3().setFromObject(shield).getCenter(new THREE.Vector3());
  rider.turnBone('L_Upperarm', null);
  rider.update(0);
  rider.object.updateMatrixWorld(true);
  const at = rider.figure.getWorldPosition(new THREE.Vector3());
  const f = rider.figure.rotation.y;
  const dx = c.x - at.x;
  const dz = c.z - at.z;
  return { x: dx * Math.cos(f) - dz * Math.sin(f), y: c.y - at.y, z: dx * Math.sin(f) + dz * Math.cos(f) };
}

// De los ángulos de guardia, el que deja el centro del escudo más cerca de la altura `height`.
function guardFor(rider, height) {
  let best = null;
  for (const angle of GUARDS) {
    const shield = guardedShield(rider, angle);
    if (shield && (!best || Math.abs(shield.y - height) < Math.abs(best.shield.y - height))) best = { angle, shield };
  }
  return best;
}

// Dónde queda la punta de la lanza del peón al llegar (`spear`: su medida, en el sistema del peón), en el
// mundo, con el peón en `at` mirando hacia `facing`.
function spearTipAt(spear, at, facing) {
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  return { x: at.x + spear.side * c + spear.reach * sn, z: at.z - spear.side * sn + spear.reach * c };
}

export const knightRunsThroughPawn = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'pawn',
  can: (attacker, defender) => Boolean(attacker.piece.rider.strikes?.[CHOP]?.blade?.path?.length)
    && (defender.piece.has('defeat') || defender.piece.has('fall')),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, bubbles, stances, bodies, obstacles }) {
    const knight = attacker.piece;
    const { rider } = knight;
    const pawn = defender.piece;
    const facing = facingTo(center, home); // el peón mira hacia el caballero
    const towards = facingTo(home, center); // y el caballero, hacia el peón

    // La estocada del peón y hasta dónde llega: ahí se planta el caballero a pararla (luego se ajusta).
    const jab = usableStrikes(pawn.attacks, pawn.strikes, 'duel', { shield: shieldOf(pawn) })[0];
    const measure = jab ? pawn.strikes[jab].spear : null;
    const parry = strikeSpot(home, center, { reach: measure ? Math.max(PARRY_GAP, measure.reach - 0.35) : PARRY_GAP, torso: 0 });
    const chop = strikeSpot(home, center, { reach: knight.body.torso + PAWN_BODY + BODY_GAP, torso: 0 });
    stances.set(attacker, stanceOf(postOf(attacker, parry.attacker, parry.attackerFacing, [{ action: 'attack', key: CHOP }])));
    pawn.setSpearDefault('upright');
    pawn.setGripSlide(-COMBAT_RAISE);

    // 1. La cámara encuadra desde el lado de la espada, el peón baja de su peana y se encara, y el
    //    caballero salta hasta él y desmonta, espada en mano.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles, { favor: rightOf(towards) }),
      defender.mover.descend(center),
      defender.mover.turnTo(facing, 0.3),
    ]);
    await attacker.mover.leapTo(parry.attacker);
    await attacker.mover.dismount({ at: parry.attacker, facing: parry.attackerFacing, mode: 'dismount' });

    // 2. El peón le tira una estocada con la lanza y el caballero la para con el escudo: chispas y
    //    «¡CLANC!». Antes, el caballero da un paso hasta donde la punta, a su alcance de verdad (con la lanza
    //    como se midió: de punta y sin deslizar en el puño), cae en la cara de su escudo en guardia; y sube
    //    el brazo lo justo para que el escudo quede a la altura de la punta. El escudo sube justo antes de
    //    que llegue.
    let guardia = GUARD;
    const guardUp = (up) => clock.tween(GUARD_SECONDS, (t) => rider.turnBone('L_Upperarm', { x: -guardia * (up ? t : 1 - t) }));
    if (jab) {
      pawn.setSpearPose('forward');
      pawn.setGripSlide(0);
      const parada = rider.props.shield ? guardFor(rider, measure.height) : null;
      if (parada) {
        guardia = parada.angle;
        const peon = pawn.figure.getWorldPosition(new THREE.Vector3());
        const punta = spearTipAt(measure, peon, facing);
        const sitio = standFor(punta, { x: parada.shield.x, z: parada.shield.z + SHIELD_FACE }, parry.attackerFacing);
        stances.set(attacker, stanceOf(postOf(attacker, sitio, parry.attackerFacing, [{ action: 'attack', key: CHOP }])));
        await stepTo(clock, rider, sitio, parry.attackerFacing);
      }
      await clock.wait(GRIP_SETTLE);
      const jabbing = pawn.play('attack', { loop: false, clip: jab, fade: 0.15 });
      if (jabbing) jabbing.time = Math.max(0, measure.t - JAB_LEAD);
      const falta = measure.t - (jabbing?.time ?? 0);
      const guard = clock.wait(Math.max(0, falta - GUARD_SECONDS - 0.1)).then(() => guardUp(true));
      await slowToImpact(clock, falta);
      // Las chispas, donde la punta toca el escudo.
      const at = pawn.props.spear && pawn.spearEnds
        ? pawn.props.spear.localToWorld(new THREE.Vector3(0, pawn.spearEnds.top, 0))
        : (rider.props.shield ?? rider.figure).getWorldPosition(new THREE.Vector3());
      fx.burst(at, { size: 0.9, sparks: 22 });
      hud.flash();
      cinema.shake(0.12);
      shout(bubbles, '¡CLANC!', at);
      sfx.play('escudo');
      await afterImpact(clock);
      await guard;
      pawn.setSpearPose(null);
      pawn.setGripSlide(-COMBAT_RAISE);
      pawn.play('idle', { fade: 0.2 });
    }

    // 3. Baja el escudo, se arrima y le descarga la espada en el casco: la alza, la aguanta un instante
    //    en lo más alto y, a cámara lenta, la deja caer. Se planta donde la punta, al bajar, pasa por lo alto
    //    del casco (la hoja baja por su derecha: se pone a un lado), y el golpe llega cuando la punta pasa de
    //    verdad por esa altura.
    // Primero el peón vuelve a su guardia (si se apunta antes, con la cabeza aún adelantada por la estocada,
    // la hoja caía un palmo delante del casco) y el caballero, mientras, baja el escudo.
    const bajaEscudo = jab ? guardUp(false) : null;
    await clock.wait(SETTLE);
    const head0 = bonePosition(pawn, 'Head');
    const casco = new THREE.Vector3(head0.x, head0.y + HELMET, head0.z);
    // El recorrido de la punta, ensayado en el propio jinete (mira ya hacia el peón, como al pegar).
    const path = rehearseBlade(rider, CHOP) ?? rider.strikes[CHOP].blade.path;
    const aim = downswingAt(path, casco.y - rider.figure.position.y);
    const tajo = standFor(casco, aim, chop.attackerFacing);
    stances.set(attacker, stanceOf(postOf(attacker, tajo, chop.attackerFacing, [{ action: 'attack', key: CHOP }])));
    await Promise.all([bajaEscudo, attacker.mover.walkTo(tajo)]);
    rider.turnBone('L_Upperarm', null);
    await attacker.mover.turnTo(chop.attackerFacing, 0.2);
    const swing = rider.play('attack', { loop: false, fade: 0.15, clip: CHOP });
    let top = 0;
    for (let i = 1; i < path.length; i++) if (path[i].y > path[top].y) top = i;
    await clock.wait(path[top].t);
    if (swing) swing.paused = true;
    await clock.wait(HOLD);
    if (swing) swing.paused = false;
    clock.timeScale = SLOW_MOTION;
    await tipBelow(clock, rider, casco.y, Math.max(0.5, aim.t - path[top].t + 0.6));
    const head = bonePosition(pawn, 'Head');
    const golpe = new THREE.Vector3(head.x, head.y + HELMET, head.z);
    fx.burst(golpe, { size: 1.2, sparks: 30 });
    hud.flash();
    cinema.shake(0.22);
    shout(bubbles, '¡CLONC!', golpe);
    sfx.play('casco');
    const ux = Math.sin(chop.attackerFacing);
    const uz = Math.cos(chop.attackerFacing);
    pawn.throwSpear({ x: ux, z: uz }); // suelta la lanza
    pawn.play('hit', { loop: false, clip: 'hit_to_head', fade: 0.08 }); // el golpe en la cabeza, si lo tiene
    fx.koStars(pawn.object.getObjectByName('Head') ?? pawn.figure, { seconds: DAZE_SECONDS + 0.6 });
    await afterImpact(clock);
    rider.play('idle', { fade: 0.35 }); // la espada no sigue bajando por dentro del peón
    await clock.wait(DAZE_SECONDS);

    // 4. Cae de espaldas, con estrellitas, y se esfuma.
    const angle = fallDirection({
      at: center,
      around: facing + Math.PI,
      spread: FALL_SPREAD,
      length: pawn.height,
      rival: { x: tajo.x, z: tajo.z, radius: knight.body.torso },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    bodies.push(lyingBody({ at: center, angle, length: pawn.height }));
    pawn.resetBones();
    await defender.mover.turnTo(angle + Math.PI, 0.12);
    grita(defender, 'caida');
    await topple({ clock, figure: pawn.figure, forward: false });
    const nuca = bonePosition(pawn, 'Head');
    dust.puff(new THREE.Vector3(nuca.x, DUST_Y, nuca.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.1);
    await knockOut({ clock, fx, fighter: pawn });
    await defender.mover.vanish();
    bodies.length = 0;
    stances.delete(attacker);

    // 5. El caballero ocupa la casilla, el caballo se reúne con él y monta.
    pawn.setSpearDefault(null);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.mount(target) });
  },
};
