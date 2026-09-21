import * as THREE from 'three';
import { afterImpact, punchDistance, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot, usableStrikes } from '../plan.js';
import {
  bladeBody, bladeStrikes, BODY_GAP, bonePosition, COMBAT_RAISE, facingTo, fallDirection, knockOut,
  lyingBody, PAWN_BODY, postOf, shout, swordTip, topple, victoryLap,
} from './common.js';

// Caballero come peón: lo atraviesa con la espada (diseño, sección 7). El caballero salta hasta el peón y
// desmonta; el peón le tira una estocada y él la para con el escudo, entre chispas. Le mete la espada por
// debajo del brazo hasta que la punta asoma por la espalda; el peón se queda tieso, se mira la hoja y, al
// sacarla, cae de espaldas con estrellitas. El caballero ocupa la casilla y vuelve a montar.

const THROUGH = 0.18; // lo que asoma la punta por la espalda del peón
const GUARD = 70; // grados que sube el brazo del escudo cuando no hay animación de parada
const GUARD_SECONDS = 0.25;
const STIFF_SECONDS = 0.9; // lo que se queda tieso mirándose la hoja
const HEAD_TURN = 30; // grados que baja la cabeza para mirársela
const PULL_SECONDS = 0.5; // lo que tarda en sacar la espada, andando hacia atrás
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

export const knightRunsThroughPawn = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'pawn',
  can: (attacker, defender) => bladeStrikes(attacker.piece.rider, { thrust: true }).length > 0
    && (defender.piece.has('defeat') || defender.piece.has('fall')),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const knight = attacker.piece;
    const { rider } = knight;
    const pawn = defender.piece;
    const thrust = bladeStrikes(rider, { thrust: true })[0];
    const measure = rider.strikes[thrust];
    const facing = facingTo(center, home); // el peón mira hacia el caballero

    // 1. La cámara encuadra, el peón baja de su peana y se encara, y el caballero salta y desmonta.
    //    Se para donde la punta, al final de la estocada, le asoma THROUGH por la espalda.
    const distance = Math.max(
      knight.body.torso + PAWN_BODY + BODY_GAP,
      punchDistance({ body: bladeBody(measure.blade), from: home, center, target: pawn, torso: PAWN_BODY }) - THROUGH,
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    stances.set(attacker, stanceOf(postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: thrust }])));
    pawn.setSpearDefault('upright');
    pawn.setGripSlide(-COMBAT_RAISE);
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.descend(center),
      defender.mover.turnTo(facing, 0.3),
    ]);
    await attacker.mover.leapTo(spots.attacker);
    await attacker.mover.dismount({ at: spots.attacker, facing: spots.attackerFacing, mode: 'dismount' });

    // 2. El peón le tira una estocada y el caballero la para con el escudo: chispas y «¡CLANC!». Si no
    //    tiene animación de parada, sube el brazo del escudo por código.
    const jab = usableStrikes(pawn.attacks, pawn.strikes, 'duel')[0];
    if (jab) {
      pawn.setSpearPose('forward');
      const jabbing = pawn.playOnce('attack', { clip: jab, fade: 0.15 });
      const guard = rider.has('block')
        ? rider.playOnce('block', { fade: 0.1 })
        : clock.tween(GUARD_SECONDS, (t) => rider.turnBone('L_Upperarm', { x: -GUARD * t }));
      await slowToImpact(clock, pawn.strikes[jab].spear?.t ?? pawn.strikes[jab].body.t);
      const shield = rider.props.shield ?? rider.object.getObjectByName('L_Hand');
      const at = shield.getWorldPosition(new THREE.Vector3());
      fx.burst(at, { size: 0.9, sparks: 22 });
      hud.flash();
      cinema.shake(0.12);
      shout(bubbles, '¡CLANC!', at);
      await afterImpact(clock);
      await Promise.all([jabbing, guard]);
      pawn.play('idle', { fade: 0.2 });
    }

    // 3. La estocada del caballero: la punta asoma por la espalda, el peón se queda tieso y se la mira.
    const running = rider.playOnce('attack', { clip: thrust, fade: 0.15 });
    await slowToImpact(clock, measure.blade.t);
    const tip = swordTip(rider);
    fx.burst(tip, { size: 1, sparks: 26 });
    hud.flash();
    cinema.shake(0.18);
    shout(bubbles, '¡ZAS!', tip);
    const ux = Math.sin(spots.attackerFacing);
    const uz = Math.cos(spots.attackerFacing);
    pawn.throwSpear({ x: ux, z: uz });
    pawn.play('idle', { fade: 0.1 });
    pawn.turnBone('Head', { x: HEAD_TURN });
    await afterImpact(clock);
    await clock.wait(STIFF_SECONDS);

    // 4. Saca la espada andando hacia atrás y el peón cae de espaldas, con estrellitas.
    const back = rider.figure.position.clone();
    await clock.tween(PULL_SECONDS, (t) => {
      rider.figure.position.set(back.x - ux * THROUGH * t, back.y, back.z - uz * THROUGH * t);
    });
    await running;
    rider.play('idle', { fade: 0.3 });
    const angle = fallDirection({
      at: center,
      around: facing + Math.PI,
      spread: FALL_SPREAD,
      length: pawn.height,
      rival: { x: spots.attacker.x, z: spots.attacker.z, radius: knight.body.torso },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    bodies.push(lyingBody({ at: center, angle, length: pawn.height }));
    pawn.resetBones();
    await defender.mover.turnTo(angle + Math.PI, 0.12);
    await topple({ clock, figure: pawn.figure, forward: false });
    const head = bonePosition(pawn, 'Head');
    dust.puff(new THREE.Vector3(head.x, DUST_Y, head.z), { count: 12, radius: 0.6, duration: 0.5 });
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
