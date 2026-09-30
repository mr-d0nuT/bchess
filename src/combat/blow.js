import * as THREE from 'three';
import { TORSO, bestStrike, gripSlideForReach, shieldOf } from './plan.js';
import { bladeStrikes, bonePosition, dismountMode, fighterOf } from './knight/common.js';

// Lo que comparten los combates en que cualquiera (peón, caballero o torre) se acerca a pegar a una
// pieza que no pelea con él cuerpo a cuerpo: el alfil al que le sale rana el hechizo, la reina a la que
// no le da tiempo a conjurar.

export const HIT_GAP = 0.05; // lo que queda entre el golpe y el rival
const HORSE_BACK = 0.6; // lo que se queda atrás el caballo del que llega montado, antes de desmontar
// A qué distancia (de centro a centro) se planta quien pega con lanza: la estocada llega a casi 2,5 y
// la lanza resbala en la mano lo que falte (`aimBlow`); más cerca, habría que agarrarla casi por la punta.
const THRUST_STAND = 1.8;
const GRIP_SETTLE = 0.35; // lo que tarda la lanza en ponerse de punta y resbalar, antes de la estocada
// Lo que se ve de la estocada antes de que llegue: la del peón (box_02) tarda 2,3 s en soltarse, con mucho
// baile de pies antes. Se empieza el clip lo que sobre más adelante (`lead`).
const THRUST_LEAD = 1.0;

// A qué distancia del CENTRO del rival se planta el que le pega: lo que alcanza el golpe, más el
// cuerpo del rival —el golpe ha de dar en su pecho, no en su centro, que si no acaban el uno
// metido en el otro—, más un respiro.
export function blowDistance({ defender, blow }) {
  return blow.reach + torsoOf(defender) + HIT_GAP;
}

// Del centro del rival a su pecho.
export const torsoOf = (defender) => fighterOf(defender)?.body?.torso ?? defender.piece.body?.torso ?? TORSO;

// Lo que separa (en el suelo) al que pega del centro del rival, ahora.
export function gapTo(fighter, center) {
  const at = fighter.figure.getWorldPosition(new THREE.Vector3());
  return Math.hypot(at.x - center.x, at.z - center.z);
}

// El golpe con que lo remata, con lo que lleva y nunca con el escudo: con espada, un tajo (el caballero);
// con lanza, una estocada (el peón); y si no, el golpe de más alcance. Devuelve la clave, lo que alcanza,
// cuándo llega y dónde mirar en ese momento; null si no tiene golpes.
export function blowOf(fighter) {
  const slash = fighter.props?.sword ? bladeStrikes(fighter, { thrust: false })[0] ?? bladeStrikes(fighter)[0] : null;
  if (slash) {
    const { blade } = fighter.strikes[slash];
    return { key: slash, reach: blade.reach, t: blade.t, point: () => swordTip(fighter) };
  }
  const thrust = spearThrustOf(fighter);
  if (thrust) return thrust;
  const key = fighter.attacks && fighter.strikes ? bestStrike(fighter.attacks, fighter.strikes, { shield: shieldOf(fighter) }) : null;
  if (!key) return null;
  const { body } = fighter.strikes[key];
  return { key, reach: body.reach, t: body.t, point: () => bonePosition(fighter, body.bone) };
}

// La estocada de quien lleva lanza: un golpe de la mano que la sujeta, con la lanza de punta (en el
// manifiesto, `spear: 'forward'`). Antes el peón remataba con su puñetazo de más alcance, que era de
// izquierda: un escudazo, con el escudo tumbado por delante. Se planta a THRUST_STAND del rival.
function spearThrustOf(fighter) {
  const spear = fighter.props?.spear;
  if (!spear || !fighter.attacks || !fighter.strikes) return null;
  const hand = spear.parent?.name;
  const attack = fighter.attacks.find((a) => a.spear === 'forward' && fighter.strikes[a.key]?.spear
    && fighter.strikes[a.key].body?.bone === hand);
  if (!attack) return null;
  const measure = fighter.strikes[attack.key].spear;
  const lead = Math.max(0, measure.t - THRUST_LEAD);
  return {
    key: attack.key,
    reach: THRUST_STAND - TORSO - HIT_GAP, // `blowDistance` le suma el cuerpo del rival y el respiro
    t: measure.t - lead, // desde que arranca (en `lead`) hasta que llega
    lead,
    spear: measure,
    point: () => spear.localToWorld(new THREE.Vector3(0, fighter.spearEnds.top, 0)),
  };
}

// Antes de pegar, quieto: quien pega con lanza la pone de punta hacia el rival y la hace resbalar en la
// mano lo justo para que la punta se le quede en el pecho (como en el duelo). Girándola y resbalándola ya
// atacando, la punta le atravesaría. `distance`, de centro a centro; `torso`, el del rival.
export async function aimBlow(fighter, blow, { clock, distance, torso = TORSO }) {
  if (!blow.spear) return;
  fighter.setSpearPose('forward');
  fighter.setGripSlide(gripSlideForReach({ reach: blow.spear.reach, distance, torso }));
  await clock.wait(GRIP_SETTLE);
}

// Lanza el golpe (tras `aimBlow`). Con lanza, de punta y agarrada donde la dejó `aimBlow`; al acabar,
// vuelve a su postura y a su agarre. Sin estocada, la lanza (si la lleva) va erguida mientras pega: si
// no, algunos puñetazos del manifiesto la llevan de punta, y atravesaba al rival de lado a lado.
export function playBlow(fighter, blow) {
  const golpe = fighter.playOnce('attack', { clip: blow.key, fade: 0.15, from: blow.lead ?? 0 });
  if (blow.spear) {
    return golpe.finally(() => {
      fighter.setSpearPose(null);
      fighter.setGripSlide(0);
    });
  }
  const erguida = Boolean(fighter.props?.spear)
    && fighter.attacks?.some((attack) => attack.key === blow.key && attack.spear === 'forward');
  if (erguida) fighter.setSpearPose('upright');
  return erguida ? golpe.finally(() => fighter.setSpearPose(null)) : golpe;
}

// Para lo que sale volando de la mano y es largo (el báculo, la espada): el eje de su vara en el mundo,
// para que al caer se quede tumbado en el tablero (`lie` de `debris.throwPiece`). Sin él se posaba tal
// como caía, a menudo de pie y medio hundido en el tablero: un palo roto que salía de la nada.
export const shaftOf = (object) => () => new THREE.Vector3(0, 1, 0).transformDirection(object.matrixWorld);

function swordTip(fighter) {
  return fighter.props.sword.localToWorld(new THREE.Vector3(0, fighter.swordEnds.top, 0));
}

// Deja al atacante en su sitio, listo para pegar, según lo que sea.
export async function bringUp(attacker, { at, facing, random }) {
  if (attacker.kind === 'knight') {
    // El caballo salta a un punto más atrás: si se encabrita al desmontar justo donde ha de pegar el
    // jinete, se le echa encima al rival. El jinete va a pie hasta su sitio.
    const atras = { x: at.x - Math.sin(facing) * HORSE_BACK, z: at.z - Math.cos(facing) * HORSE_BACK };
    await attacker.mover.leapTo(atras);
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
