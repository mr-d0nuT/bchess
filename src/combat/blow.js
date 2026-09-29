import * as THREE from 'three';
import { TORSO, bestStrike } from './plan.js';
import { bladeStrikes, bonePosition, dismountMode, fighterOf } from './knight/common.js';

// Lo que comparten los combates en que cualquiera (peón, caballero o torre) se acerca a pegar a una
// pieza que no pelea con él cuerpo a cuerpo: el alfil al que le sale rana el hechizo, la reina a la que
// no le da tiempo a conjurar.

export const HIT_GAP = 0.05; // lo que queda entre el golpe y el rival
const HORSE_BACK = 0.6; // lo que se queda atrás el caballo del que llega montado, antes de desmontar

// A qué distancia del CENTRO del rival se planta el que le pega: lo que alcanza el golpe, más el
// cuerpo del rival —el golpe ha de dar en su pecho, no en su centro, que si no acaban el uno
// metido en el otro—, más un respiro.
export function blowDistance({ defender, blow }) {
  const torso = fighterOf(defender)?.body?.torso ?? defender.piece.body?.torso ?? TORSO;
  return blow.reach + torso + HIT_GAP;
}

// El golpe con que lo remata: con espada si la lleva (el caballero: un tajo), y si no, el de más alcance.
// Devuelve la clave, lo que alcanza, cuándo llega y dónde mirar en ese momento; null si no tiene golpes.
export function blowOf(fighter) {
  const slash = fighter.props?.sword ? bladeStrikes(fighter, { thrust: false })[0] ?? bladeStrikes(fighter)[0] : null;
  if (slash) {
    const { blade } = fighter.strikes[slash];
    return { key: slash, reach: blade.reach, t: blade.t, point: () => swordTip(fighter) };
  }
  const key = fighter.attacks && fighter.strikes ? bestStrike(fighter.attacks, fighter.strikes) : null;
  if (!key) return null;
  const { body } = fighter.strikes[key];
  return { key, reach: body.reach, t: body.t, point: () => bonePosition(fighter, body.bone) };
}

// Lanza el golpe. Los puñetazos del peón llevan la lanza de punta (`spear: 'forward'` en el manifiesto,
// para el duelo, donde la estocada se mide aparte); aquí el golpe se mide por la mano —la del escudo—,
// y con la lanza de punta le daba con el escudo y a la vez lo atravesaba con ella de lado a lado. Así
// que mientras pega, la lanza va erguida.
export function playBlow(fighter, blow) {
  const erguida = Boolean(fighter.props?.spear)
    && fighter.attacks?.some((attack) => attack.key === blow.key && attack.spear === 'forward');
  if (erguida) fighter.setSpearPose('upright');
  const golpe = fighter.playOnce('attack', { clip: blow.key, fade: 0.15 });
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
