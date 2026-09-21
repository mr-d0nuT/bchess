import * as THREE from 'three';
import { afterImpact, choose, overlapOf, slowToImpact, stanceOf } from '../fight.js';
import { bestStrike, strikeSpot } from '../plan.js';
import {
  bladeStrikes, BODY_GAP, boneOf, bonePosition, dismountMode, facingTo, fighterOf, knockOut, postOf, shout,
  victoryLap,
} from './common.js';

// Torre come caballero: un casco con pies (diseño, sección 7). La torre se convierte en gigante y avanza; el
// caballero desmonta (o su caballo lo tira y huye aterrado) y se pone en guardia, temblando. A cámara lenta
// el gigante lo machaca: el cuerpo se le mete dentro de las piernas y solo quedan el yelmo, con su penacho,
// encima de las botas. El casco con pies se tambalea mareado con estrellitas, da unos pasitos y desaparece
// en polvo. El gigante ocupa la casilla y vuelve a ser torre.

const TORSO_BONES = ['Spine02', 'Spine01', 'Waist', 'Pelvis']; // lo que encoge hasta apoyar el yelmo en las botas
const ARM_BONES = ['R_Upperarm', 'L_Upperarm'];
const SQUASH_SECONDS = 0.35;
const SHRINK = 0.001;
const TREMBLE = 2; // grados que tiembla en guardia
const TREMBLE_SECONDS = 0.9;
const STAGGER_SECONDS = 1.2; // los pasitos mareados
const STAGGER = 0.14; // lo que se mueve a cada lado
const DUST = { count: 18, radius: 0.8, duration: 0.6 };
const GIANT_GAP = 0.45; // lo que se aparta de un gigante: el caballo aterriza largo y él se desploma encima
const DUST_Y = 0.05;

export const giantCrushesKnight = {
  matches: (attacker, defender) => attacker.kind === 'rook' && defender.kind === 'knight',
  can: (attacker, defender) => Boolean(attacker.piece.giant && bestStrike(attacker.piece.giant.attacks, attacker.piece.giant.strikes))
    && TORSO_BONES.some((bone) => boneOf(defender.piece.rider, bone)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const giant = fighterOf(attacker);
    const rider = defender.piece.rider;
    const punch = bestStrike(giant.attacks, giant.strikes);
    const guard = bladeStrikes(rider, { thrust: false })[0] ?? bladeStrikes(rider)[0];
    const facing = facingTo(center, home);

    // 1. Puestos y encuadre: el gigante avanza hasta donde su golpe alcanza al caballero.
    // Lo que se separan: sus torsos medidos se quedan cortos con el gigante (el gigante es mucho más ancho que su torso medido),
    // así que al menos lo que ocupan sus peanas, o acaban uno encima del otro.
    const distance = Math.max(
      attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP,
      attacker.piece.radius + defender.piece.radius + GIANT_GAP,
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    const post = postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: punch }]);
    const overlap = () => overlapOf(crowd, [attacker, defender], [post]);
    const taunt = choose(post, 'taunt', { overlap, random, optional: true });
    stances.set(attacker, stanceOf(post));
    stances.set(defender, stanceOf(postOf(defender, center, facing, guard ? [{ action: 'attack', key: guard }] : [])));
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      attacker.mover.awaken(),
      defender.mover.dismount({ at: center, facing, mode: dismountMode(random) }),
    ]);
    await defender.mover.horseFlee({ avoid: spots.attacker });

    // 2. El gigante se acerca y provoca si cabe; el caballero se pone en guardia, temblando.
    await attacker.mover.walkTo(spots.attacker);
    await attacker.mover.turnTo(spots.attackerFacing, 0.3);
    if (taunt) await giant.playOnce('taunt', { clip: taunt });
    giant.play('idle', { fade: 0.25 });
    const temblor = clock.tween(TREMBLE_SECONDS, (t) => {
      rider.figure.rotation.y = facing + THREE.MathUtils.degToRad(TREMBLE) * Math.sin(t * Math.PI * 12);
    });

    // 3. El golpe, a cámara lenta: el cuerpo se mete dentro de las piernas.
    const crushing = giant.playOnce('attack', { clip: punch, fade: 0.15 });
    await slowToImpact(clock, giant.strikes[punch].body.t);
    const puño = bonePosition(giant, giant.strikes[punch].body.bone);
    fx.burst(puño, { size: 1.3, sparks: 32 });
    hud.flash();
    cinema.shake(0.3);
    shout(bubbles, '¡CHOF!', puño);
    await temblor;
    rider.figure.rotation.y = facing;
    if (rider.props.sword) rider.props.sword.visible = false;
    if (rider.props.shield) rider.props.shield.visible = false;
    await clock.tween(SQUASH_SECONDS, (t) => {
      const k = 1 - t * (1 - SHRINK);
      for (const bone of TORSO_BONES) rider.scaleBone(bone, k);
      for (const bone of ARM_BONES) rider.scaleBone(bone, k);
    });
    await afterImpact(clock);
    await crushing;
    giant.play('idle', { fade: 0.3 });

    // 4. El casco con pies se tambalea mareado, da unos pasitos y desaparece en polvo.
    await knockOut({ clock, fx, fighter: rider });
    const sitio = rider.figure.position.clone();
    await clock.tween(STAGGER_SECONDS, (t) => {
      rider.figure.position.x = sitio.x + Math.sin(t * Math.PI * 4) * STAGGER;
      rider.figure.position.z = sitio.z + Math.sin(t * Math.PI * 2.5) * STAGGER * 0.5;
    });
    dust.puff(new THREE.Vector3(sitio.x, DUST_Y, sitio.z), DUST);
    await defender.mover.defeated({ avoid: spots.attacker });
    rider.resetBones();
    stances.delete(defender);

    // 5. El gigante ocupa la casilla y vuelve a ser torre.
    stances.delete(attacker);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.walkOnto(target) });
  },
};
