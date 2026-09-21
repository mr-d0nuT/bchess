import * as THREE from 'three';
import { afterImpact, punchDistance, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot } from '../plan.js';
import {
  bladeStrikes, BODY_GAP, bonePosition, COMBAT_RAISE, dismountMode, facingTo, fallDirection, kickOf,
  knockOut, lyingBody, PAWN_BODY, postOf, shout, topple, victoryLap, windUp,
} from './common.js';

// Peón come caballero: patada en la entrepierna (diseño, sección 7). El caballero desmonta o su caballo lo
// tira, y se pone en guardia. El peón baja de su peana y se acerca, y el caballero levanta la espada. A
// cámara lenta, el peón le da la patada: suena a metal, al caballero se le juntan las rodillas, suelta la
// espada y cae de bruces, hacia un lado para no aplastar al peón, con estrellitas. Desaparece en polvo, su
// caballo huye si seguía allí y el peón ocupa la casilla y lo celebra.

const KNEES = 25; // grados que se juntan las rodillas
const KNEES_SECONDS = 0.15;
const FALL_SPREAD = Math.PI / 3; // de bruces, hacia un lado de donde está el peón
const DUST_Y = 0.05;

export const pawnKicksKnight = {
  matches: (attacker, defender) => attacker.kind === 'pawn' && defender.kind === 'knight',
  can: (attacker, defender) => Boolean(kickOf(attacker.piece)) && bladeStrikes(defender.piece.rider).length > 0,

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const pawn = attacker.piece;
    const knight = defender.piece;
    const { rider } = knight;
    const kick = kickOf(pawn);
    const slash = bladeStrikes(rider, { thrust: false })[0] ?? bladeStrikes(rider)[0];
    const facing = facingTo(center, home);
    pawn.setSpearDefault('upright');
    pawn.setGripSlide(-COMBAT_RAISE);
    stances.set(defender, stanceOf(postOf(defender, center, facing, [{ action: 'attack', key: slash }])));

    // 1. La cámara encuadra; el caballero desmonta (o su caballo lo tira) y se pone en guardia.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      attacker.mover.turnTo(facingTo(home, center), 0.3),
      defender.mover.dismount({ at: center, facing, mode: dismountMode(random) }),
    ]);

    // 2. El peón baja de su peana y se acerca hasta donde su patada llega; el caballero levanta la espada.
    const distance = Math.max(
      knight.body.torso + PAWN_BODY + BODY_GAP,
      punchDistance({ body: pawn.strikes[kick].body, from: home, center, target: rider, torso: knight.body.torso }),
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    await attacker.mover.descend(home);
    await attacker.mover.walkTo(spots.attacker);
    await attacker.mover.turnTo(spots.attackerFacing, 0.2);
    const swing = await windUp({ clock, fighter: rider, key: slash });

    // 3. La patada, a cámara lenta: suena a metal, se le juntan las rodillas, suelta la espada y cae de
    //    bruces a un lado.
    const kicking = pawn.playOnce('attack', { clip: kick, fade: 0.15 });
    await slowToImpact(clock, pawn.strikes[kick].body.t);
    const toe = bonePosition(pawn, pawn.strikes[kick].body.bone);
    fx.burst(toe, { size: 1, sparks: 24 });
    hud.flash();
    cinema.shake(0.15);
    shout(bubbles, '¡CLONC!', toe);
    if (swing) swing.paused = false;
    rider.play('idle', { fade: 0.2 });
    const knees = clock.tween(KNEES_SECONDS, (t) => {
      rider.turnBone('L_Thigh', { z: -KNEES * t });
      rider.turnBone('R_Thigh', { z: KNEES * t });
    });
    if (rider.props.sword?.visible) {
      debris.throwPiece(rider.props.sword, {
        velocity: { x: Math.cos(facing) * 0.6, y: 1.8, z: -Math.sin(facing) * 0.6 },
        obstacles: () => crowd.obstacles([attacker, defender]),
      });
    }
    await Promise.all([afterImpact(clock), knees]);
    const angle = fallDirection({
      at: center,
      around: facing,
      spread: FALL_SPREAD,
      length: rider.height,
      rival: { x: spots.attacker.x, z: spots.attacker.z, radius: PAWN_BODY },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    stances.delete(defender);
    bodies.push(lyingBody({ at: center, angle, length: rider.height }));
    await defender.mover.turnTo(angle, 0.12);
    await topple({ clock, figure: rider.figure, forward: true });
    const head = bonePosition(rider, 'Head');
    dust.puff(new THREE.Vector3(head.x, DUST_Y, head.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.1);
    await kicking;
    pawn.play('idle', { fade: 0.3 });
    await knockOut({ clock, fx, fighter: rider });

    // 4. Desaparece en polvo, su caballo huye si seguía allí y el peón ocupa la casilla y lo celebra.
    debris.clear();
    await defender.mover.defeated({ avoid: center });
    bodies.length = 0;
    pawn.setSpearDefault(null);
    pawn.setGripSlide(0);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.walkOnto(target) });
  },
};
