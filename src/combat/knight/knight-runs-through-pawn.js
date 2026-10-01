import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { afterImpact, slowToImpact, stanceOf } from '../fight.js';
import { chopHit, gripSlideForReach, shieldOf, strikeSpot, usableStrikes } from '../plan.js';
import {
  BODY_GAP, bonePosition, COMBAT_RAISE, facingTo, fallDirection, knockOut, lyingBody, PAWN_BODY, postOf, rightOf,
  shout, topple, victoryLap,
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
// (El nombre del fichero es de cuando lo atravesaba.)

const CHOP = 'slash'; // el tajo de arriba abajo
const HELMET = 0.12; // de la cabeza (su hueso) a lo alto del casco, donde cae la hoja
const PARRY_GAP = 1.7; // de centro a centro, al parar la estocada: la lanza del peón le llega sin agarrarla por la punta
const GUARD = 70; // grados que sube el brazo del escudo para parar
const GUARD_SECONDS = 0.25;
const GRIP_SETTLE = 0.35; // lo que tarda la lanza del peón en ponerse de punta y resbalar
const JAB_LEAD = 0.9; // lo que se ve de su estocada antes de que llegue: la entera tarda 2,3 s en soltarla
const HOLD = 0.3; // la espada en alto, aguantando, antes de caer
const DAZE_SECONDS = 0.9; // lo que se tambalea el peón con estrellitas antes de caer
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

// De centro a centro, en el suelo.
function gap(a, b) {
  const p = a.figure.getWorldPosition(new THREE.Vector3());
  const q = b.figure.getWorldPosition(new THREE.Vector3());
  return Math.hypot(p.x - q.x, p.z - q.z);
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

    // Dónde se planta para el tajo: donde la punta, bajando, pasa por lo alto del casco del peón.
    const casco = bonePosition(pawn, 'Head').y - pawn.figure.getWorldPosition(new THREE.Vector3()).y + HELMET;
    const hit = chopHit(rider.strikes[CHOP].blade.path, casco);
    const chopGap = Math.max(knight.body.torso + PAWN_BODY + BODY_GAP, hit?.reach ?? 0.95);
    const parry = strikeSpot(home, center, { reach: PARRY_GAP, torso: 0 });
    const chop = strikeSpot(home, center, { reach: chopGap, torso: 0 });
    stances.set(attacker, stanceOf(postOf(attacker, chop.attacker, chop.attackerFacing, [{ action: 'attack', key: CHOP }])));
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
    //    «¡CLANC!». La lanza se pone de punta y resbala en la mano antes (como en el duelo), para que la
    //    punta llegue al escudo y no más allá; y el escudo sube justo antes de que llegue.
    const guardUp = (up) => clock.tween(GUARD_SECONDS, (t) => rider.turnBone('L_Upperarm', { x: -GUARD * (up ? t : 1 - t) }));
    const jab = usableStrikes(pawn.attacks, pawn.strikes, 'duel', { shield: shieldOf(pawn) })[0];
    if (jab) {
      const measure = pawn.strikes[jab].spear;
      pawn.setSpearPose('forward');
      pawn.setGripSlide(gripSlideForReach({ reach: measure.reach, distance: gap(pawn, rider), torso: knight.body.torso }));
      await clock.wait(GRIP_SETTLE);
      const jabbing = pawn.play('attack', { loop: false, clip: jab, fade: 0.15 });
      if (jabbing) jabbing.time = Math.max(0, measure.t - JAB_LEAD);
      const falta = measure.t - (jabbing?.time ?? 0);
      const guard = clock.wait(Math.max(0, falta - GUARD_SECONDS - 0.1)).then(() => guardUp(true));
      await slowToImpact(clock, falta);
      const at = (rider.props.shield ?? rider.figure).getWorldPosition(new THREE.Vector3());
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
    //    en lo más alto y, a cámara lenta, la deja caer.
    await Promise.all([jab ? guardUp(false) : null, attacker.mover.walkTo(chop.attacker)]);
    rider.turnBone('L_Upperarm', null);
    await attacker.mover.turnTo(chop.attackerFacing, 0.2);
    const swing = rider.play('attack', { loop: false, fade: 0.15, clip: CHOP });
    const top = hit?.top ?? 0;
    await clock.wait(top);
    if (swing) swing.paused = true;
    await clock.wait(HOLD);
    if (swing) swing.paused = false;
    await slowToImpact(clock, (hit?.t ?? rider.strikes[CHOP].blade.t) - top);
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
      rival: { x: chop.attacker.x, z: chop.attacker.z, radius: knight.body.torso },
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
