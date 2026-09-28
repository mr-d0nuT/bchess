import * as THREE from 'three';
import { afterImpact } from './fight.js';
import { charring } from './burn.js';
import { boneOf, facingTo, shout, topple, victoryLap } from './knight/common.js';
import { chestOf, faceAttacker, horseBolts, stepDown, victimOf } from './royal/royal.js';

// EL PEÓN GRANADERO. Idea del usuario: el peón no se acerca a pegar. Se planta, se enfada, saca una
// bomba de las de dibujos animados, enciende la mecha y se la tira al otro a los pies. El otro se la
// queda mirando —«¡¿?!»— y ¡BUUUM!: una bola de fuego, la onda por el suelo, humo, y el rival negro
// como un tizón, humeando, que aún se tambalea un momento antes de caer de espaldas.
//
// La lanza no se suelta: va en la mano derecha, y la bomba se lanza con el puñetazo de la izquierda.

const FUSE_SECONDS = 1.9; // lo que tarda en consumirse la mecha, del encendido a la explosión
const HOLD_SECONDS = 0.55; // lo que la enseña, encendida, antes de lanzarla
const FLIGHT_SECONDS = 0.65;
const FLIGHT_HEIGHT = 0.9;
const ROLL = 0.18; // lo que rueda al caer
const STARE_SECONDS = 0.45; // lo que el rival se la queda mirando
const SMOKE_SECONDS = 0.9; // tiznado y humeando, antes de caer
const BOMB_CHANCE = 0.3; // entre peones, cada cuánto hay bomba en vez de duelo (lo decide `capture`)

// El puñetazo con la mano libre (la izquierda, que la derecha lleva la lanza), o el que haya.
function throwStrike(pawn) {
  const keys = (pawn.attacks ?? []).map((attack) => attack.key).filter((key) => pawn.strikes?.[key]?.body);
  const izquierda = keys.find((key) => /L_Hand|LeftHand/.test(pawn.strikes[key].body.bone));
  const mano = keys.find((key) => /Hand/.test(pawn.strikes[key].body.bone));
  return izquierda ?? mano ?? null;
}

export const pawnThrowsBomb = {
  chance: BOMB_CHANCE,
  // Contra peones, alfiles, reinas y caballeros; las torres tienen su gigante y su pelea propia.
  matches: (attacker, defender) => attacker.kind === 'pawn' && ['pawn', 'bishop', 'queen', 'knight'].includes(defender.kind),
  can: (attacker) => Boolean(throwStrike(attacker.piece)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, dust, bubbles, obstacles, bodies }) {
    const pawn = attacker.piece;
    const key = throwStrike(pawn);
    const strike = pawn.strikes[key];
    const hand = boneOf(pawn, strike.body.bone);
    const facing = facingTo(home, center);

    // 1. La cámara encuadra; el rival baja a plantarle cara y el peón baja de su peana, en su casilla.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      stepDown(defender, center),
    ]);
    await faceAttacker(defender, center, home);
    await attacker.mover.descend(home);
    await attacker.mover.turnTo(facing, 0.25);
    await horseBolts(defender, center, home); // al caballero, su caballo lo tira y se va

    // 2. Se enfada, saca la bomba y enciende la mecha.
    if (pawn.has('taunt')) await pawn.playOnce('taunt', { fade: 0.15 });
    pawn.play('idle', { fade: 0.2 });
    const bomba = fx.bomb(hand);
    shout(bubbles, '¡TACHÁN!', hand.getWorldPosition(new THREE.Vector3()).setY(1.6));
    await clock.wait(0.35);
    bomba.light(FUSE_SECONDS);
    shout(bubbles, '¡FSSS!', bomba.position.clone().setY(bomba.position.y + 0.3));
    await clock.wait(HOLD_SECONDS);

    // 3. La lanza con el puñetazo: se suelta en el momento del golpe y va en arco a los pies del rival.
    //    La lanza, erguida: con la postura de ese golpe apuntaría al rival como en una estocada.
    pawn.setSpearPose('upright');
    const lanzando = pawn.playOnce('attack', { clip: key, fade: 0.1 });
    await clock.wait(strike.body.t * 0.85);
    const victima = victimOf(defender);
    const pies = victima.figure.getWorldPosition(new THREE.Vector3());
    const hacia = new THREE.Vector3(pies.x - home.x, 0, pies.z - home.z).normalize();
    const radio = defender.piece.radius ?? 0.4;
    const cae = { x: pies.x - hacia.x * (radio + ROLL + 0.1), z: pies.z - hacia.z * (radio + ROLL + 0.1) };
    await bomba.throwTo(cae, { seconds: FLIGHT_SECONDS, height: FLIGHT_HEIGHT, roll: { x: hacia.x * ROLL, z: hacia.z * ROLL } });
    await lanzando;
    pawn.play('idle', { fade: 0.2 });
    pawn.setSpearPose(null);

    // 4. El rival se la queda mirando, y el peón se tapa los oídos (o se encoge).
    const cabeza = () => chestOf(defender).setY(chestOf(defender).y + 0.55);
    bubbles.say('¡¿?!', cabeza, { seconds: STARE_SECONDS + 0.2 });
    await clock.wait(STARE_SECONDS);

    // 5. ¡BUUUM!
    const donde = bomba.explode();
    const suelo = new THREE.Vector3(donde.x, 0.02, donde.z);
    hud.flash();
    cinema.shake(0.35);
    fx.burst(donde.clone().setY(0.4), { size: 2.6, sparks: 60 });
    fx.blaze(suelo, { height: 1.1, radius: 0.55, seconds: 0.7, count: 40 });
    fx.shockwave(suelo, { radius: 2.4, seconds: 0.6, color: '#ffb35a' });
    dust.puff(new THREE.Vector3(donde.x, 0.05, donde.z), { count: 28, radius: 1.3, duration: 1 });
    shout(bubbles, '¡BUUUM!', donde.clone().setY(1.3));
    if (pawn.has('hit')) pawn.playOnce('hit', { fade: 0.08 }); // la onda también le llega
    const quema = charring(victima.figure);
    await clock.tween(0.25, (t) => quema(t, 0.12 * (1 - t)));
    await afterImpact(clock);

    // 6. Tiznado, humeando, se tambalea… y cae de espaldas.
    const alto = victima.height ?? defender.piece.height ?? 1.6;
    fx.ashes(pies, { height: alto, radius: 0.25, count: 18 });
    victima.play?.('idle', { fade: 0.1 });
    await clock.wait(SMOKE_SECONDS);
    shout(bubbles, '¡PLOF!', chestOf(defender));
    await topple({ clock, figure: victima.figure, forward: false });
    dust.puff(new THREE.Vector3(pies.x, 0.05, pies.z), { count: 14, radius: 0.7, duration: 0.6 });
    cinema.shake(0.12);
    await clock.wait(0.4);
    await (defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish());
    bodies.length = 0;

    // 7. Y ocupa la casilla, riéndose.
    await victoryLap({ entry: attacker, clock, cinema, obstacles, move: () => attacker.mover.walkOnto(target) });
  },
};
