import * as THREE from 'three';
import { bestStrike } from './plan.js';
import { bladeStrikes, bonePosition, dismountMode } from './knight/common.js';

// Lo que comparten los combates en que cualquiera (peón, caballero o torre) se acerca a pegar a una
// pieza que no pelea con él cuerpo a cuerpo: el alfil al que le sale rana el hechizo, la reina a la que
// no le da tiempo a conjurar.

export const HIT_GAP = 0.05; // lo que queda entre el golpe y el rival

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

function swordTip(fighter) {
  return fighter.props.sword.localToWorld(new THREE.Vector3(0, fighter.swordEnds.top, 0));
}

// Deja al atacante en su sitio, listo para pegar, según lo que sea.
export async function bringUp(attacker, { at, facing, random }) {
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
