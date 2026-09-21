import * as THREE from 'three';
import { afterImpact, knockBack, slowToImpact, stanceOf } from '../fight.js';
import {
  BODY_GAP, COMBAT_RAISE, PAWN_BODY, bonePosition, celebrate, facingTo, fallDirection, knockOut, lyingBody,
  postOf, shout, topple,
} from './common.js';

// Caballero come peón, sin bajarse del caballo: la carga con la lanza (lo pidió el usuario, que para eso
// lleva lanza). El peón baja de su peana y se encara; el caballero deja la peana, se aparta para tomar
// carrerilla, calza la lanza bajo el brazo y carga. A cámara lenta la punta le da de lleno: el peón sale
// despedido, cae de espaldas con estrellitas y se esfuma. El caballero se planta en la casilla.

const RUN_UP = 1.1; // lo que retrocede para tomar carrerilla
const BITE = 0.12; // lo que se hunde la punta en el peón
const CHARGE_SECONDS = 0.75;
const FLY_BACK = 0.55; // lo que sale despedido el peón
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

// Lo que la punta de la lanza asoma por delante del caballo, con la lanza ya calzada.
function lanceAhead(knight, rider, facing) {
  const tip = rider.props.spear.localToWorld(new THREE.Vector3(0, rider.spearEnds.top, 0));
  const at = knight.figure.position;
  return (tip.x - at.x) * Math.sin(facing) + (tip.z - at.z) * Math.cos(facing);
}

export const knightLancesPawn = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'pawn',
  can: (attacker, defender) => Boolean(attacker.piece.rider.props.spear) && attacker.piece.mounted
    && (defender.piece.has('fall') || defender.piece.has('defeat')),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles }) {
    const knight = attacker.piece;
    const { rider } = knight;
    const pawn = defender.piece;
    const facing = facingTo(home, center); // el caballero, hacia el peón
    const away = { x: Math.sin(facing), z: Math.cos(facing) };

    // 1. La cámara encuadra, el peón baja de su peana y se encara, y el caballero deja la suya.
    stances.set(attacker, stanceOf(postOf(attacker, home, facing, [])));
    pawn.setSpearDefault('upright');
    pawn.setGripSlide(-COMBAT_RAISE);
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.descend(center),
      defender.mover.turnTo(facing + Math.PI, 0.3),
      attacker.mover.leavePedestal(),
    ]);

    // 2. Retrocede para tomar carrerilla y calza la lanza bajo el brazo.
    const start = { x: home.x - away.x * RUN_UP, z: home.z - away.z * RUN_UP };
    await attacker.mover.chargeTo(start, { seconds: 0.5 });
    await attacker.mover.turnTo(facing, 0.25);
    rider.setSpearPose('forward');
    await clock.wait(0.25);

    // 3. La carga: se para donde la punta se hunde BITE en el peón.
    knight.object.updateMatrixWorld(true);
    const ahead = lanceAhead(knight, rider, facing);
    const stop = Math.max(knight.radius + PAWN_BODY + BODY_GAP, ahead + PAWN_BODY - BITE);
    const end = { x: center.x - away.x * stop, z: center.z - away.z * stop };
    const charging = attacker.mover.chargeTo(end, { seconds: CHARGE_SECONDS });
    await slowToImpact(clock, CHARGE_SECONDS * 0.72);
    const tip = rider.props.spear.localToWorld(new THREE.Vector3(0, rider.spearEnds.top, 0));
    fx.burst(tip, { size: 1.1, sparks: 28 });
    hud.flash();
    cinema.shake(0.2);
    shout(bubbles, '¡ZAS!', tip);
    pawn.throwSpear({ x: -away.x, z: -away.z });
    pawn.play('idle', { fade: 0.1 });
    await Promise.all([
      afterImpact(clock),
      knockBack({ clock, figure: pawn.figure, ux: away.x, uz: away.z, distance: FLY_BACK }),
    ]);
    await charging;

    // 4. El peón cae de espaldas, con estrellitas, y se esfuma.
    const fallen = { x: pawn.figure.position.x, z: pawn.figure.position.z };
    const angle = fallDirection({
      at: fallen,
      around: facing,
      spread: FALL_SPREAD,
      length: pawn.height,
      rival: { x: end.x, z: end.z, radius: knight.radius },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    bodies.push(lyingBody({ at: fallen, angle, length: pawn.height }));
    await defender.mover.turnTo(angle + Math.PI, 0.12);
    await topple({ clock, figure: pawn.figure, forward: false });
    const head = bonePosition(pawn, 'Head');
    dust.puff(new THREE.Vector3(head.x, DUST_Y, head.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.1);
    await knockOut({ clock, fx, fighter: pawn });
    await defender.mover.vanish();
    bodies.length = 0;

    // 5. El caballero recoge la lanza, se planta en la casilla y lo celebra desde la silla.
    rider.setSpearPose(null);
    pawn.setSpearDefault(null);
    stances.delete(attacker);
    await Promise.all([cinema.restore(clock), attacker.mover.rideOnto(target)]);
    await celebrate(attacker);
  },
};
