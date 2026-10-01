import * as THREE from 'three';
import { grita } from '../audio/voces.js';
import { sfx } from '../audio/sfx.js';
import { afterImpact } from './fight.js';
import { charring } from './burn.js';
import { boneOf, facingTo, rightOf, shout, topple, victoryLap } from './knight/common.js';
import { chestOf, faceAttacker, horseBolts, stepDown, victimOf } from './royal/royal.js';

// EL PEÓN GRANADERO. Idea del usuario: el peón no se acerca a pegar. Se planta, se enfada, saca una
// bomba de las de dibujos animados, enciende la mecha y se la tira al otro a los pies. El otro se la
// queda mirando —«¡¿?!»— y ¡BUUUM!: una bola de fuego, la onda por el suelo, humo, y el rival negro
// como un tizón, humeando, que aún se tambalea un momento antes de caer de espaldas.
//
// La bomba va en la derecha y se lanza con un directo: la izquierda lleva el escudo, que no es para pegar.
// Antes se lanzaba con el puñetazo de la izquierda, y el escudo salía disparado hacia el rival con la bomba
// pegada, como un escudazo. La lanza, mientras tanto, se queda clavada a su lado.

const FUSE_SECONDS = 1.9; // lo que tarda en consumirse la mecha, del encendido a la explosión
const HOLD_SECONDS = 0.55; // lo que la enseña, encendida, antes de lanzarla
const FLIGHT_SECONDS = 0.65;
const FLIGHT_HEIGHT = 0.9;
const ROLL = 0.18; // lo que rueda al caer
const THROW_LEAD = 0.9; // lo que se ve del directo antes de soltarla (entero tarda 2,3 s en llegar)
const SPEAR_ASIDE = 0.14; // la lanza se clava un poco por fuera de la mano: que el brazo no la atraviese
// Donde se para, a los pies del rival: a esto de su centro (antes, a medio metro por delante).
const AT_FEET = 0.25;
const BOMB_SIZE = 1.15; // un poco más pequeña que al principio (1,45): parecía un balón
const STARE_SECONDS = 0.45; // lo que el rival se la queda mirando
const SMOKE_SECONDS = 0.9; // tiznado y humeando, antes de caer
const BOMB_CHANCE = 0.3; // entre peones, cada cuánto hay bomba en vez de duelo (lo decide `capture`)

// El puñetazo con la mano que no lleva el escudo (la derecha), o el que haya.
function throwStrike(pawn) {
  const keys = (pawn.attacks ?? []).map((attack) => attack.key).filter((key) => pawn.strikes?.[key]?.body);
  const derecha = keys.find((key) => /R_Hand|RightHand/.test(pawn.strikes[key].body.bone));
  const mano = keys.find((key) => /Hand/.test(pawn.strikes[key].body.bone));
  return derecha ?? mano ?? null;
}

// Clava la lanza junto a la mano que la lleva, un poco por fuera, y la deja ahí: esa mano queda libre.
function plantBeside(pawn, facing) {
  const spear = pawn.props?.spear;
  if (!spear?.visible) return false;
  const at = spear.getWorldPosition(new THREE.Vector3());
  const fuera = rightOf(facing);
  pawn.plantSpear({ x: at.x + fuera.x * SPEAR_ASIDE, z: at.z + fuera.z * SPEAR_ASIDE });
  return true;
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

    // 2. Se enfada, clava la lanza a su lado, saca la bomba y enciende la mecha.
    if (pawn.has('taunt')) await pawn.playOnce('taunt', { fade: 0.15 });
    pawn.play('idle', { fade: 0.2 });
    const clavada = /R_Hand|RightHand/.test(strike.body.bone) && plantBeside(pawn, facing);
    const bomba = fx.bomb(hand, { size: BOMB_SIZE });
    shout(bubbles, '¡TACHÁN!', hand.getWorldPosition(new THREE.Vector3()).setY(1.6));
    grita(attacker, 'risa'); // je, je…
    await clock.wait(0.35);
    bomba.light(FUSE_SECONDS);
    shout(bubbles, '¡FSSS!', bomba.position.clone().setY(bomba.position.y + 0.3));
    const mecha = sfx.play('mecha');
    await clock.wait(HOLD_SECONDS);

    // 3. La lanza con el directo: se suelta en el momento del golpe y va en arco a los pies del rival.
    //    (Si la lanza siguiera en la mano, erguida: con la postura de ese golpe apuntaría al rival.)
    pawn.setSpearPose('upright');
    const desde = Math.max(0, strike.body.t - THROW_LEAD);
    const lanzando = pawn.playOnce('attack', { clip: key, fade: 0.1, from: desde });
    await clock.wait((strike.body.t - desde) * 0.85);
    const victima = victimOf(defender);
    const pies = victima.figure.getWorldPosition(new THREE.Vector3());
    const hacia = new THREE.Vector3(pies.x - home.x, 0, pies.z - home.z).normalize();
    const cae = { x: pies.x - hacia.x * (AT_FEET + ROLL), z: pies.z - hacia.z * (AT_FEET + ROLL) };
    sfx.play('bomba_vuela');
    await bomba.throwTo(cae, { seconds: FLIGHT_SECONDS, height: FLIGHT_HEIGHT, roll: { x: hacia.x * ROLL, z: hacia.z * ROLL } });
    await lanzando;
    pawn.play('idle', { fade: 0.2 });
    pawn.setSpearPose(null);

    // 4. El rival se la queda mirando, y el peón se tapa los oídos (o se encoge).
    const cabeza = () => chestOf(defender).setY(chestOf(defender).y + 0.55);
    bubbles.say('¡¿?!', cabeza, { seconds: STARE_SECONDS + 0.2 });
    grita(defender, 'huh');
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
    grita(defender, 'caida');
    mecha?.stop(0.04);
    sfx.play('explosion');
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
    await topple({ clock, figure: victima.figure, forward: false, sound: defender.kind === 'knight' ? 'caida_armadura' : 'caida' });
    dust.puff(new THREE.Vector3(pies.x, 0.05, pies.z), { count: 14, radius: 0.7, duration: 0.6 });
    cinema.shake(0.12);
    await clock.wait(0.4);
    await (defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish());
    bodies.length = 0;

    // 7. Recoge la lanza y ocupa la casilla, riéndose.
    if (clavada) pawn.holdSpear();
    await victoryLap({ entry: attacker, clock, cinema, obstacles, move: () => attacker.mover.walkOnto(target) });
  },
};
