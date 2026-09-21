import * as THREE from 'three';
import { afterImpact, punchDistance, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { cutLimb } from '../../pieces/limbs.js';
import {
  bladeBody, bladeStrikes, BODY_GAP, boneOf, bonePosition, dismountMode, facingTo, fallDirection, kickOf,
  knockOut, lyingBody, postOf, shout, swordTip, topple, victoryLap,
} from './common.js';

// Caballero come caballero: el Caballero Negro de los Monty Python (diseño, sección 7). Los dos desmontan y
// cruzan un par de golpes parados. El atacante le corta el brazo de la espada, que sale volando y rebota;
// el otro se mira el muñón y sigue peleando con el escudo. Le corta el otro brazo, recibe una patada y le
// corta las dos piernas. Queda un tronco en el suelo que aún le planta cara: «¡Solo es un rasguño!». Un
// toquecito en el yelmo y cae; desaparece en polvo con sus trozos y el ganador ocupa la casilla y monta.

const LIMBS = ['R_Upperarm', 'L_Upperarm', 'R_Thigh', 'L_Thigh']; // en este orden: espada, escudo y piernas
const SHRINK = 0.001; // a lo que encoge el hueso del trozo cortado
const CLASHES = 2; // golpes parados antes del primer corte
const CUT_SPEED = { x: 1.1, y: 2.6 }; // con lo que sale volando cada trozo
const SCRATCH = '¡Solo es un rasguño!';
const SCRATCH_SECONDS = 1.6;
const STUMP_SECONDS = 0.5; // lo que se mira el muñón
const TAP_SECONDS = 0.35;
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

export const knightFightsKnight = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'knight',
  can: (attacker, defender) => bladeStrikes(attacker.piece.rider, { thrust: false }).length > 0
    && LIMBS.every((bone) => boneOf(defender.piece.rider, bone)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const mine = attacker.piece.rider;
    const his = defender.piece.rider;
    const slashes = bladeStrikes(mine, { thrust: false });
    const hisSlashes = bladeStrikes(his, { thrust: false });
    const facing = facingTo(center, home);
    const measure = mine.strikes[slashes[0]];

    // 1. La cámara encuadra y los dos desmontan, cara a cara y a distancia de espada.
    const distance = Math.max(
      attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP,
      punchDistance({ body: bladeBody(measure.blade), from: home, center, target: his, torso: defender.piece.body.torso }),
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    stances.set(attacker, stanceOf(postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: slashes[0] }])));
    stances.set(defender, stanceOf(postOf(defender, center, facing, hisSlashes[0] ? [{ action: 'attack', key: hisSlashes[0] }] : [])));
    await cinema.frame(clock, home, center, obstacles);
    await Promise.all([
      attacker.mover.dismount({ at: spots.attacker, facing: spots.attackerFacing, mode: 'dismount' }),
      defender.mover.dismount({ at: center, facing, mode: dismountMode(random) }),
    ]);

    // 2. Un par de golpes parados, con chispas donde se cruzan las hojas.
    for (let i = 0; i < CLASHES; i++) {
      const mio = mine.playOnce('attack', { clip: slashes[i % slashes.length], fade: 0.15 });
      const suyo = hisSlashes.length ? his.playOnce('attack', { clip: hisSlashes[i % hisSlashes.length], fade: 0.15 }) : null;
      await slowToImpact(clock, mine.strikes[slashes[i % slashes.length]].blade.t);
      const cruce = swordTip(mine).lerp(his.props.sword ? swordTip(his) : swordTip(mine), 0.5);
      fx.burst(cruce, { size: 0.8, sparks: 18 });
      hud.flash();
      cinema.shake(0.1);
      shout(bubbles, '¡CLANC!', cruce);
      await afterImpact(clock);
      await Promise.all([mio, suyo]);
      mine.play('idle', { fade: 0.2 });
      his.play('idle', { fade: 0.2 });
    }

    // 3. Corta brazos y piernas. Cada trozo sale volando de la propia malla y el hueso encoge; entre los
    //    brazos y las piernas, el atacante recibe una patada del otro (si la tiene) y sigue.
    const kick = kickOf(his);
    for (const [n, bone] of LIMBS.entries()) {
      const key = slashes[n % slashes.length];
      const cutting = mine.playOnce('attack', { clip: key, fade: 0.15 });
      await slowToImpact(clock, mine.strikes[key].blade.t);
      const at = bonePosition(his, bone);
      fx.burst(at, { size: 1, sparks: 26 });
      hud.flash();
      cinema.shake(0.16);
      shout(bubbles, bone.includes('Thigh') ? '¡ZAS!' : '¡CHAS!', at);
      const piece = cutLimb(his.object, bone);
      if (piece) {
        debris.throwPiece(piece, {
          velocity: { x: Math.sin(spots.attackerFacing) * CUT_SPEED.x, y: CUT_SPEED.y, z: Math.cos(spots.attackerFacing) * CUT_SPEED.x },
          obstacles: () => crowd.obstacles([attacker, defender]),
        });
      }
      his.scaleBone(bone, SHRINK);
      if (n === 0 && his.props.sword) his.props.sword.visible = false;
      if (n === 1 && his.props.shield) his.props.shield.visible = false;
      await afterImpact(clock);
      await cutting;
      mine.play('idle', { fade: 0.25 });
      if (n === 0) {
        his.play('idle', { fade: 0.2 }); // se mira el muñón
        await clock.wait(STUMP_SECONDS);
      }
      if (n === 1 && kick) {
        const kicking = his.playOnce('attack', { clip: kick, fade: 0.15 });
        await slowToImpact(clock, his.strikes[kick].body.t);
        const toe = bonePosition(his, his.strikes[kick].body.bone);
        fx.burst(toe, { size: 0.8, sparks: 16 });
        cinema.shake(0.12);
        shout(bubbles, '¡TOMA!', toe);
        if (mine.has('hit')) mine.playOnce('hit', { fade: 0.1 });
        await afterImpact(clock);
        await kicking;
        his.play('idle', { fade: 0.2 });
      }
      if (n === LIMBS.length - 1) {
        stances.delete(defender);
        await defender.mover.sit(true); // ya solo es un tronco en el suelo
        bodies.push(lyingBody({ at: center, angle: facing, length: his.height * 0.5, radius: 0.3 }));
      }
    }

    // 4. El tronco aún le planta cara, con su bocadillo; un toquecito en el yelmo y cae.
    const head = boneOf(his, 'Head');
    const bocadillo = bubbles.say(SCRATCH, head, { seconds: SCRATCH_SECONDS });
    await clock.wait(SCRATCH_SECONDS * 0.6);
    const tap = mine.playOnce('attack', { clip: slashes[0], fade: 0.15 });
    await clock.wait(TAP_SECONDS);
    fx.burst(bonePosition(his, 'Head'), { size: 0.7, sparks: 14 });
    hud.flash();
    shout(bubbles, '¡TOC!', bonePosition(his, 'Head'));
    await bocadillo;
    const angle = fallDirection({
      at: center,
      around: facing + Math.PI,
      spread: FALL_SPREAD,
      length: his.height * 0.5,
      rival: { x: spots.attacker.x, z: spots.attacker.z, radius: attacker.piece.body.torso },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    await topple({ clock, figure: his.figure, forward: false });
    const donde = bonePosition(his, 'Head');
    dust.puff(new THREE.Vector3(donde.x, DUST_Y, donde.z), { count: 14, radius: 0.7, duration: 0.5 });
    cinema.shake(0.12);
    await tap;
    mine.play('idle', { fade: 0.3 });
    await knockOut({ clock, fx, fighter: his });

    // 5. Desaparece en polvo con sus trozos; el ganador ocupa la casilla y monta.
    bodies.length = 0;
    debris.clear({ seconds: 0.3 });
    await defender.mover.defeated({ avoid: center });
    his.resetBones();
    stances.delete(attacker);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.mount(target) });
  },
};
