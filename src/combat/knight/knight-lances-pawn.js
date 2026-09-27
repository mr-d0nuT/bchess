import * as THREE from 'three';
import { GRIP_SPEED } from '../../pieces/piece.js';
import { afterImpact, knockBack, slowToImpact, stanceOf } from '../fight.js';
import {
  BODY_GAP, bonePosition, COMBAT_RAISE, facingTo, fallDirection, knockOut, lyingBody, PAWN_BODY, postOf,
  shout, topple, victoryLap,
} from './common.js';

// Caballero come peón, sin bajarse del caballo: la carga con la lanza (lo pidió el usuario, que para eso
// lleva lanza). El peón baja de su peana y se encara; el caballero deja la peana, se aparta para tomar
// carrerilla, calza la lanza bajo el brazo y carga. A cámara lenta la punta le da de lleno: el peón sale
// despedido, cae de espaldas con estrellitas y se esfuma. El caballero se planta en la casilla.

const RUN_UP = 1.1; // lo que retrocede para tomar carrerilla
const BACK_SECONDS = 1.2; // y lo que tarda: al paso, sin darse la vuelta
const BITE = 0.12; // lo que se hunde la punta en el peón
const CHARGE_SECONDS = 0.75;
const FLY_BACK = 0.55; // lo que sale despedido el peón
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

// Dónde queda la punta de la lanza respecto a la figura del caballo, con la lanza ya calzada: lo que
// asoma por delante (`ahead`) y lo que queda a un lado (`side`, positivo hacia la izquierda del caballo).
function lanceTip(knight, rider, facing) {
  const tip = rider.props.spear.localToWorld(new THREE.Vector3(0, rider.spearEnds.top, 0));
  const dx = tip.x - knight.figure.position.x;
  const dz = tip.z - knight.figure.position.z;
  return { ahead: dx * Math.sin(facing) + dz * Math.cos(facing), side: dx * Math.cos(facing) - dz * Math.sin(facing) };
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

    // 2. Se encara con el peón, retrocede al paso para tomar carrerilla —sin darse la vuelta, como un
    //    caballo de verdad— y calza la lanza bajo el brazo.
    const start = { x: home.x - away.x * RUN_UP, z: home.z - away.z * RUN_UP };
    await attacker.mover.turnTo(facing, 0.3);
    await attacker.mover.chargeTo(start, { seconds: BACK_SECONDS, backwards: true });
    rider.setSpearPose('forward');
    await clock.wait(0.25);

    // 3. La carga: se para donde la punta se hunde BITE en el peón. Dos cosas tiran del sitio en
    //    que se para, y hay que hacerles caso a las dos: el caballo, que es un animal entero por
    //    delante y no puede empotrarse en el peón, y la lanza, que tiene que llegar. Cuando manda
    //    el caballo, la lanza se queda corta —y se veía: la punta pasaba a un palmo—, así que se
    //    la deja salir de la mano lo que falte. El jinete la agarra más atrás y la punta alcanza.
    knight.object.updateMatrixWorld(true);
    const { side } = lanceTip(knight, rider, facing);
    // La lanza va calzada a un lado del caballo: cargando derecho hacia el peón, la punta le pasaba
    // rozando por el costado sin tocarlo. Se tuerce la carga lo justo para que por el centro del peón
    // pase la punta, no el caballo; y se gira ya, antes de cronometrar, para que la carga arranque en
    // el acto.
    const from = { x: knight.figure.position.x, z: knight.figure.position.z };
    const lejos = Math.hypot(center.x - from.x, center.z - from.z);
    const directo = Math.atan2(center.x - from.x, center.z - from.z);
    const rumbo = directo - Math.asin(THREE.MathUtils.clamp(side / lejos, -1, 1));
    const dir = new THREE.Vector3(Math.sin(rumbo), 0, Math.cos(rumbo));
    const fondo = lejos * Math.cos(directo - rumbo); // lo que queda hasta el centro del peón, a lo largo de la carga
    await attacker.mover.turnTo(rumbo, 0.2);
    // Dónde toca la punta de verdad: un rayo desde la punta, en la dirección de la carga, contra el
    // cuerpo del peón. A la altura de la punta el peón es más estrecho que PAWN_BODY, y cronometrando
    // con él el fogonazo saltaba un palmo antes de tocarlo.
    knight.object.updateMatrixWorld(true);
    pawn.object.updateMatrixWorld(true);
    const tip0 = rider.props.spear.localToWorld(new THREE.Vector3(0, rider.spearEnds.top, 0));
    const cuerpo = [];
    pawn.object.traverse((o) => { if (o.isSkinnedMesh) cuerpo.push(o); });
    const hit = new THREE.Raycaster(tip0, dir, 0, fondo + 1).intersectObjects(cuerpo, false)[0];
    const toca = hit?.distance ?? Math.max(0, (center.x - tip0.x) * dir.x + (center.z - tip0.z) * dir.z - PAWN_BODY);
    const cabe = fondo - (knight.radius + PAWN_BODY + BODY_GAP); // lo más que avanza el caballo sin empotrarse
    let recorrido = toca + BITE;
    if (recorrido > cabe) {
      const falta = recorrido - cabe;
      rider.setGripSlide(-falta);
      await clock.wait(falta / GRIP_SPEED + 0.05); // que acabe de resbalar antes de arrancar
      recorrido = cabe;
    }
    recorrido = Math.max(BITE + 1e-3, recorrido);
    const end = { x: from.x + dir.x * recorrido, z: from.z + dir.z * recorrido };
    const charging = attacker.mover.chargeTo(end, { seconds: CHARGE_SECONDS });
    // La carga avanza a velocidad constante hasta `end`, donde la punta queda BITE dentro del peón:
    // el momento de tocarlo es ese menos lo que se hunde, medido sobre lo que recorre.
    await slowToImpact(clock, CHARGE_SECONDS * (1 - BITE / recorrido));
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
    rider.setGripSlide(0);
    pawn.setSpearDefault(null);
    stances.delete(attacker);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.rideOnto(target) });
  },
};
