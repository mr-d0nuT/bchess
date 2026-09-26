import * as THREE from 'three';
import { CAST_BONES, armsDown, blend } from '../../pieces/cast.js';
import { facingTo, fallDirection, fighterOf, lyingBody, topple } from '../knight/common.js';
import { shortestTurn } from '../../moves/walk.js';

// Lo que comparten los ataques de los reyes y las reinas.
//
// Sus modelos no traen ni una animación —se exportaron pelados, porque cualquier clip les destrozaba
// la capa—, así que sus ataques van hueso a hueso, como el andar. Eso obliga a algo que las piezas
// con clips no necesitan: soltar los huesos al acabar y devolverles la pose de reposo, o se quedan
// clavados en mitad del conjuro para siempre.

export const ROYAL_COLOR = { white: '#a8d4ff', black: '#ff7a5c' };

// Baja al rival de su peana para que se plante, sea lo que sea.
export function stepDown(defender, at) {
  if (defender.kind === 'rook' && defender.piece.giant) return defender.mover.awaken();
  if (defender.kind === 'knight') return defender.mover.leavePedestal();
  return defender.mover.descend(at);
}

// Se gira hacia el agresor. Un caballero al que ya ha tirado el caballo quedó mirándolo al caer, y
// `turnTo` giraría el caballo, que ya no está.
export function faceAttacker(defender, at, from) {
  if (defender.kind === 'knight') return Promise.resolve();
  return defender.mover.turnTo(facingTo(at, from), 0.3);
}

// EL CABALLO NO SE QUEDA. Con el que conjura ya plantado delante, el animal ve lo que viene: se
// encabrita, tira al jinete al suelo y sale huyendo del tablero. Hasta aquí no hay nada que inventar
// —`dismount` en modo 'thrown' hace justo eso, y es lo que pasa cuando un peón le planta cara—, pero
// el conjuro TIENE que esperar a que el caballo acabe de salir (`horseLeaving`): primero huye, y solo
// después cae el rayo. Fulminar al caballo sería una canallada, y dejarlo plantado debajo del rayo, un
// despropósito; así lo que recibe el conjuro es un hombre a pie, como los demás. Con cualquier otra
// pieza no pasa nada de esto.
export async function horseBolts(defender, at, from) {
  if (defender.kind !== 'knight') return;
  await defender.mover.dismount({ at, facing: facingTo(at, from), mode: 'thrown' });
  await defender.mover.horseLeaving;
}

// Quien recibe el conjuro: el jinete de un caballero, el gigante de una torre, o la pieza misma.
export function victimOf(defender) {
  return fighterOf(defender);
}

const FALL_SPREAD = Math.PI / 4; // lo que puede desviarse la caída para buscar hueco

// Gira a quien va a caerse, sea lo que sea. A un caballero desmontado no se le puede pedir por su
// mover: ahí `turnTo` gira el CABALLO, y el caballo ya no está.
function turnFighter(defender, victima, angle, clock) {
  if (defender.kind !== 'knight') return defender.mover.turnTo(angle, 0.12);
  const desde = victima.figure.rotation.y;
  const giro = shortestTurn(desde, angle);
  return clock.tween(0.12, (t) => { victima.figure.rotation.y = desde + giro * t; });
}

// TUMBARLO SIN INVADIR LA CASILLA DE AL LADO. Un cuerpo de espaldas mide casi una casilla entera, así
// que dejarlo caer en la línea del conjuro lo mete debajo del vecino. Se prueban tres direcciones
// —la del conjuro y una a cada lado— y se queda la que deja más hueco a las piezas de alrededor; el
// cuerpo tendido se apunta en `bodies`, que es de donde el resto del combate saca quién ocupa qué.
export async function fallClear(defender, { clock, at, from, crowd, bodies, owners, rival }) {
  const victima = fighterOf(defender);
  const donde = { x: victima.figure.position.x, z: victima.figure.position.z };
  const angle = fallDirection({
    at: donde,
    around: facingTo(from, at), // el conjuro lo echa hacia atrás; de ahí se busca hueco
    spread: FALL_SPREAD,
    length: victima.height,
    rival,
    overlap: (body) => crowd.overlap({ owners, bodies: [body] }),
  });
  bodies.push(lyingBody({ at: donde, angle, length: victima.height }));
  await turnFighter(defender, victima, angle + Math.PI, clock);
  await topple({ clock, figure: victima.figure, forward: false });
}

// Lleva a la figura de una postura a otra en `seconds`, con la curva que se le diga. `ease` por
// defecto suaviza las dos puntas; para un golpe se le pasa una que arranque de golpe.
export function poseTo(piece, from, to, { clock, seconds, ease = suave }) {
  return clock.tween(seconds, (t) => {
    const pose = blend(from, to, ease(t));
    for (const [bone, turn] of Object.entries(pose)) piece.turnBone(bone, turn);
  });
}

export const suave = (t) => t * t * (3 - 2 * t);
export const golpe = (t) => t * t * t; // arranca despacio y cae de golpe: un mazazo
export const rebote = (t) => 1 - (1 - t) * (1 - t); // sale disparado y frena: un latigazo

// Impone una postura de golpe, sin viaje.
export function pose(piece, postura) {
  for (const [bone, turn] of Object.entries(postura)) piece.turnBone(bone, turn);
}

// Suelta todos los huesos del conjuro y le devuelve los brazos a su sitio.
export function release(piece) {
  for (const bone of CAST_BONES) piece.turnBone(bone, null);
  if (piece.armDrop > 0) pose(piece, armsDown(piece.armDrop));
}

// El punto del que sale el conjuro: la voluta del báculo si lleva, y si no, la mano.
export function wandTip(piece, hand = 'R_Hand') {
  if (piece.props?.spear && piece.spearEnds) {
    return piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0));
  }
  const bone = piece.object.getObjectByName(hand) ?? piece.figure;
  return bone.getWorldPosition(new THREE.Vector3());
}

// Dónde tiene el pecho el rival, que es adonde va el conjuro. Del JINETE si es un caballero, que el
// caballo ya se ha ido; del gigante si es una torre.
export function chestOf(defender) {
  const victima = victimOf(defender);
  const at = victima.figure.getWorldPosition(new THREE.Vector3());
  return at.setY(at.y + (victima.height ?? defender.piece.height) * 0.55);
}
