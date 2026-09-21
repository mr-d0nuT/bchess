import * as THREE from 'three';
import { afterImpact, choose, overlapOf, slowToImpact, stanceOf } from '../fight.js';
import { bestStrike, strikeSpot } from '../plan.js';
import {
  BODY_GAP, bladeStrikes, bonePosition, celebrate, facingTo, fighterOf, postOf, shout, swordTip,
} from './common.js';

// Caballero come torre: le barre las piernas (diseño, sección 7). El caballero salta hasta la torre y
// desmonta; la torre se convierte en gigante y lo provoca si cabe. El gigante descarga un puñetazo, el
// caballero lo esquiva agachándose y le barre las piernas de un tajo. A cámara lenta, el gigante cae de
// espaldas y se deshace en rocas, con una gran nube de polvo y temblor. El caballero ocupa la casilla y monta.

const DUCK = 0.35; // lo que baja la figura al agacharse
const DUCK_SECONDS = 0.22;
const SWEEP_SECONDS = 0.3; // lo que tarda en levantarse después de barrer
const COLLAPSE_SECONDS = 0.8; // del tajo a deshacerse en rocas
const LEG_BONES = ['R_Calf', 'L_Calf', 'R_Thigh', 'L_Thigh'];
const DUST = { count: 26, radius: 1.3, duration: 0.8 };
const BACK_STEP = 0.35; // lo que retrocede al ver caer al gigante
const GIANT_GAP = 0.45; // lo que se aparta de un gigante: el caballo aterriza largo y él se desploma encima
const DUST_Y = 0.05;

export const knightSweepsGiant = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'rook',
  can: (attacker, defender) => bladeStrikes(attacker.piece.rider, { thrust: false }).length > 0
    && Boolean(defender.piece.giant && bestStrike(defender.piece.giant.attacks, defender.piece.giant.strikes)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const rider = attacker.piece.rider;
    const giant = fighterOf(defender);
    const sweep = bladeStrikes(rider, { thrust: false })[0];
    const punch = bestStrike(giant.attacks, giant.strikes);
    const facing = facingTo(center, home);

    // 1. Puestos: el caballero a distancia de espada del gigante; el gigante, en su casilla, con su
    //    puñetazo y, si cabe, una provocación.
    // Lo que se separan: sus torsos medidos se quedan cortos con el gigante (el gigante es mucho más ancho que su torso medido),
    // así que al menos lo que ocupan sus peanas, o acaban uno encima del otro.
    const distance = Math.max(
      attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP,
      attacker.piece.radius + defender.piece.radius + GIANT_GAP,
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    const post = postOf(defender, center, facing, [{ action: 'attack', key: punch }]);
    const overlap = () => overlapOf(crowd, [attacker, defender], [post]);
    const taunt = choose(post, 'taunt', { overlap, random, optional: true });
    stances.set(defender, stanceOf(post));
    stances.set(attacker, stanceOf(postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: sweep }])));

    // 2. La cámara encuadra, la torre despierta y el caballero salta, desmonta y se encara.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.awaken(),
      attacker.mover.leapTo(spots.attacker),
    ]);
    await attacker.mover.dismount({ at: spots.attacker, facing: spots.attackerFacing, mode: 'dismount' });
    await defender.mover.turnTo(facing, 0.3);
    if (taunt) await giant.playOnce('taunt', { clip: taunt });
    giant.play('idle', { fade: 0.25 });

    // 3. El puñetazo pasa por encima: el caballero se agacha justo en el impacto.
    const punching = giant.playOnce('attack', { clip: punch, fade: 0.15 });
    const agachado = rider.figure.position.y;
    await slowToImpact(clock, Math.max(0, giant.strikes[punch].body.t - DUCK_SECONDS));
    await clock.tween(DUCK_SECONDS, (t) => {
      rider.figure.position.y = agachado - DUCK * t;
    });
    const puño = bonePosition(giant, giant.strikes[punch].body.bone);
    fx.burst(puño, { size: 0.8, sparks: 14 });
    cinema.shake(0.1);
    shout(bubbles, '¡FIUUU!', puño);
    await afterImpact(clock);

    // 4. El tajo a las piernas, a cámara lenta: chispas en la espinilla y el gigante se desploma.
    const sweeping = rider.playOnce('attack', { clip: sweep, fade: 0.15 });
    await slowToImpact(clock, rider.strikes[sweep].blade.t);
    const pierna = LEG_BONES.map((bone) => giant.object.getObjectByName(bone)).find(Boolean);
    const at = pierna ? pierna.getWorldPosition(new THREE.Vector3()) : swordTip(rider);
    fx.burst(at, { size: 1.2, sparks: 30 });
    hud.flash();
    cinema.shake(0.25);
    shout(bubbles, '¡ZAS!', at);
    giant.playOnce(giant.has('defeat') ? 'defeat' : 'hit', { fade: 0.1 });
    const crumbled = clock.wait(COLLAPSE_SECONDS).then(() => defender.mover.crumble());
    await afterImpact(clock);
    // Se levanta y retrocede un paso: el gigante se le venía encima al desplomarse.
    const desde = rider.figure.position.clone();
    const atrasX = -Math.sin(spots.attackerFacing) * BACK_STEP;
    const atrasZ = -Math.cos(spots.attackerFacing) * BACK_STEP;
    await clock.tween(SWEEP_SECONDS, (t) => {
      rider.figure.position.set(desde.x + atrasX * t, agachado - DUCK * (1 - t), desde.z + atrasZ * t);
    });
    rider.figure.position.y = agachado;
    await sweeping;
    rider.play('idle', { fade: 0.3 });
    dust.puff(new THREE.Vector3(center.x, DUST_Y, center.z), DUST);
    cinema.shake(0.2);
    await crumbled;

    // 5. El caballero ocupa la casilla, el caballo se reúne con él y monta.
    stances.delete(attacker);
    stances.delete(defender);
    await Promise.all([cinema.restore(clock), attacker.mover.mount(target)]);
    await celebrate(attacker);
  },
};
