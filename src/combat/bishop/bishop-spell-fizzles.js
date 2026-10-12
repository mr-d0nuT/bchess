import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { afterImpact, slowToImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { aimBlow, blowDistance, blowOf, bringUp, gapTo, playBlow, shaftOf, torsoOf } from '../blow.js';
import {
  bonePosition, facingTo, fighterOf, knockOut, lyingBody, shout, topple, victoryLap,
} from '../knight/common.js';

// Se comen al alfil: el hechizo le sale rana (mismo espíritu de gag que las batallas del caballero). El
// alfil baja de su peana, levanta el báculo y lanza su hechizo… y no sale nada, solo una nubecilla. Se
// queda mirando la voluta y, mientras, el otro le arrea: suelta el báculo, cae tieso de espaldas y se
// esfuma. Sirva quien sirva de atacante: peón, caballero (que desmonta) o torre (que despierta).

const SPELL = 'cast_a_spell';
const FIZZLE_SECONDS = 0.9; // lo que se queda mirando el báculo apagado
const STAFF_FLY = 1.5; // lo que sale volando el báculo hacia atrás (por segundo)…
const STAFF_UP = 2.4; // …y hacia arriba
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

export const bishopSpellFizzles = {
  matches: (attacker, defender) => defender.kind === 'bishop' && attacker.kind !== 'bishop',
  can: (attacker, defender) => Boolean(fighterOf(attacker)) && defender.piece.has('attack')
    && Boolean(blowOf(fighterOf(attacker))),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, bodies, obstacles, random }) {
    const bishop = defender.piece;
    const fighter = fighterOf(attacker);
    const blow = blowOf(fighter);
    const facing = facingTo(center, home); // el alfil mira al que viene
    const spots = strikeSpot(home, center, { reach: blowDistance({ defender, blow }), torso: 0 });

    // 1. La cámara encuadra, el alfil baja de su peana y se encara, y el otro se planta delante.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.descend(center),
      defender.mover.turnTo(facing, 0.3),
    ]);
    await bringUp(attacker, { at: spots.attacker, facing: spots.attackerFacing, random });

    // 2. El hechizo que no sale: una nubecilla en la voluta y cara de tonto.
    // Con el báculo quieto en alto (`conjurar`): el clip, tal cual, lo lanzaba hacia atrás.
    const casting = bishop.has('conjurar')
      ? bishop.playOnce('conjurar', { fade: 0.15 })
      : bishop.playOnce('attack', { clip: SPELL, fade: 0.15 });
    const magia = sfx.play('conjuro', { volume: 0.7 });
    await clock.wait((bishop.strikes?.[SPELL]?.body?.t ?? 1.1));
    const tip = bishop.props.spear
      ? bishop.props.spear.localToWorld(new THREE.Vector3(0, bishop.spearEnds.top, 0))
      : bonePosition(bishop, 'R_Hand');
    fx.burst(tip, { size: 0.35, sparks: 6 });
    dust.puff(tip.clone(), { count: 6, radius: 0.18, duration: 0.5 });
    shout(bubbles, '¡PUF!', tip);
    grita(defender, 'decepcion'); // ooooh…
    magia?.stop(0.08);
    sfx.play('puf');
    await casting;
    bishop.play('idle', { fade: 0.2 });
    await clock.wait(FIZZLE_SECONDS);

    // 3. El otro le arrea, a cámara lenta (con lanza, antes la pone de punta hacia él).
    await aimBlow(fighter, blow, { clock, distance: gapTo(fighter, center), torso: torsoOf(defender), target: defender });
    const hitting = playBlow(fighter, blow);
    await slowToImpact(clock, blow.t);
    const fist = blow.point();
    fx.burst(fist, { size: 1.1, sparks: 26 });
    hud.flash();
    cinema.shake(0.2);
    shout(bubbles, '¡PLAF!', fist);
    grita(defender, 'dolor');
    sfx.play('punetazo');
    if (bishop.props.spear?.visible) {
      // El báculo sale hacia atrás, lejos del que pega, y volteándose hacia atrás (la voluta por delante):
      // con un giro al azar, la voluta, larga, se volteaba hacia el peón, le atravesaba la lanza y caía a
      // sus pies (lo vio el usuario). Lo lleva en guardia, por delante, y ha de alejarse más que antes.
      const atras = new THREE.Vector3(-Math.sin(facing), 0, -Math.cos(facing));
      debris.throwPiece(bishop.props.spear, {
        velocity: { x: atras.x * STAFF_FLY, y: STAFF_UP, z: atras.z * STAFF_FLY },
        obstacles: () => crowd.obstacles([attacker, defender]),
        lie: shaftOf(bishop.props.spear),
        spin: new THREE.Vector3(0, 1, 0).cross(atras),
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
