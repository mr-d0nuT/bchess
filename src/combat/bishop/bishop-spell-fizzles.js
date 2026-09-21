import * as THREE from 'three';
import { afterImpact, slowToImpact } from '../fight.js';
import { bestStrike, strikeSpot } from '../plan.js';
import {
  bonePosition, dismountMode, facingTo, fighterOf, knockOut, lyingBody, shout, topple, victoryLap,
} from '../knight/common.js';

// Se comen al alfil: el hechizo le sale rana (mismo espíritu de gag que las batallas del caballero). El
// alfil baja de su peana, levanta el báculo y lanza su hechizo… y no sale nada, solo una nubecilla. Se
// queda mirando la voluta y, mientras, el otro le arrea: suelta el báculo, cae tieso de espaldas y se
// esfuma. Sirva quien sirva de atacante: peón, caballero (que desmonta) o torre (que despierta).

const SPELL = 'cast_a_spell';
const FIZZLE_SECONDS = 0.9; // lo que se queda mirando el báculo apagado
const HIT_GAP = 0.05;
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

// Deja al atacante en su sitio, listo para pegar, según lo que sea.
async function bringUp(attacker, { at, facing, random }) {
  if (attacker.kind === 'knight') {
    await attacker.mover.leapTo(at);
    await attacker.mover.dismount({ at, facing, mode: dismountMode(random) });
    return;
  }
  if (attacker.kind === 'rook') {
    await attacker.mover.awaken();
    await attacker.mover.walkTo(at);
    await attacker.mover.turnTo(facing, 0.3);
    return;
  }
  await attacker.mover.descend(attacker.mover.square ? at : at);
  await attacker.mover.walkTo(at);
  await attacker.mover.turnTo(facing, 0.25);
}

export const bishopSpellFizzles = {
  matches: (attacker, defender) => defender.kind === 'bishop' && attacker.kind !== 'bishop',
  can: (attacker, defender) => Boolean(fighterOf(attacker)) && defender.piece.has('attack')
    && Boolean(bestStrike(fighterOf(attacker).attacks, fighterOf(attacker).strikes)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, bodies, obstacles, random }) {
    const bishop = defender.piece;
    const fighter = fighterOf(attacker);
    const blow = bestStrike(fighter.attacks, fighter.strikes);
    const facing = facingTo(center, home); // el alfil mira al que viene
    const reach = fighter.strikes[blow].body.reach + HIT_GAP;
    const spots = strikeSpot(home, center, { reach, torso: 0 });

    // 1. La cámara encuadra, el alfil baja de su peana y se encara, y el otro se planta delante.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.descend(center),
      defender.mover.turnTo(facing, 0.3),
    ]);
    await bringUp(attacker, { at: spots.attacker, facing: spots.attackerFacing, random });

    // 2. El hechizo que no sale: una nubecilla en la voluta y cara de tonto.
    const casting = bishop.playOnce('attack', { clip: SPELL, fade: 0.15 });
    await clock.wait((bishop.strikes?.[SPELL]?.body?.t ?? 1.1));
    const tip = bishop.props.spear
      ? bishop.props.spear.localToWorld(new THREE.Vector3(0, bishop.spearEnds.top, 0))
      : bonePosition(bishop, 'R_Hand');
    fx.burst(tip, { size: 0.35, sparks: 6 });
    dust.puff(tip.clone(), { count: 6, radius: 0.18, duration: 0.5 });
    shout(bubbles, '¡PUF!', tip);
    await casting;
    bishop.play('idle', { fade: 0.2 });
    await clock.wait(FIZZLE_SECONDS);

    // 3. El otro le arrea, a cámara lenta.
    const hitting = fighter.playOnce('attack', { clip: blow, fade: 0.15 });
    await slowToImpact(clock, fighter.strikes[blow].body.t);
    const fist = bonePosition(fighter, fighter.strikes[blow].body.bone);
    fx.burst(fist, { size: 1.1, sparks: 26 });
    hud.flash();
    cinema.shake(0.2);
    shout(bubbles, '¡PLAF!', fist);
    if (bishop.props.spear?.visible) {
      debris.throwPiece(bishop.props.spear, {
        velocity: { x: Math.sin(facing) * -0.8, y: 2.2, z: Math.cos(facing) * -0.8 },
        obstacles: () => crowd.obstacles([attacker, defender]),
      });
    }
    await afterImpact(clock);
    await hitting;
    fighter.play('idle', { fade: 0.3 });

    // 4. Cae tieso de espaldas, con estrellitas, y se esfuma.
    bodies.push(lyingBody({ at: center, angle: facing + Math.PI, length: bishop.height }));
    await defender.mover.turnTo(facing, 0.12);
    await topple({ clock, figure: bishop.figure, forward: false });
    const head = bonePosition(bishop, 'Head');
    dust.puff(new THREE.Vector3(head.x, DUST_Y, head.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.1);
    await knockOut({ clock, fx, fighter: bishop });
    await defender.mover.vanish();
    bodies.length = 0;
    debris.clear({ seconds: 0.3 });

    // 5. El ganador ocupa la casilla y lo celebra, con la cámara encima.
    const ocupar = attacker.kind === 'knight'
      ? () => attacker.mover.mount(target)
      : () => attacker.mover.walkOnto(target);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: ocupar });
  },
};
