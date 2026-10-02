import * as THREE from 'three';
import { findBone } from '../../pieces/bone-names.js';

// EL BATAZO. Lo pidió el usuario: que el alfil, con el rival ya de piedra, lo «batee» con el báculo y lo
// haga añicos. Coge el báculo a dos manos como un bate, lo levanta sobre el hombro derecho, gira el
// tronco y lo descarga en horizontal a la altura del pecho, y remata por encima del hombro izquierdo.
// (Antes era el clip de acuchillar, un bastonazo de arriba abajo con un meneo de cabeza que no se
// entendía.)
//
// No hay clip para esto, y girar los huesos unos grados encima de su animación no servía: el reposo ya
// trae el codo doblado y cada grado acababa en cualquier sitio. Así que la pieza se congela y cada hueso
// se ORIENTA: el brazo, del hombro al codo, hacia tal dirección; el antebrazo, del codo a la muñeca, hacia
// tal otra; el tronco, girado tanto. Y el báculo no cuelga de la mano: se pone cada vez saliendo del puño
// en la dirección del bate, cogido cerca del regatón.

const ARRIBA = new THREE.Vector3(0, 1, 0);
const GRIP_FROM_BOTTOM = 0.2; // por dónde lo agarra, desde el regatón (en largos del báculo sin escalar)

// Las posturas: hacia dónde va cada hueso (de él a su hijo) y el báculo, en el espacio de la figura (+X a
// su izquierda, +Y arriba, +Z delante), y lo que gira el tronco (grados; + hacia su izquierda). Miradas
// en el tablero, no supuestas.
export const SWING = {
  // Preparado: el bate en alto sobre el hombro derecho, el tronco girado hacia atrás.
  arriba: { twist: -35, ru: [-0.9, -0.35, -0.3], rf: [0.15, 0.95, -0.25], lu: [-0.45, -0.45, 0.75], lf: [-0.6, 0.75, -0.1], bat: [-0.25, 0.85, -0.45] },
  // A media vuelta: el bate en horizontal, por su derecha.
  lado: { twist: -15, ru: [-0.85, -0.45, 0.25], rf: [-0.3, 0.1, 0.95], lu: [-0.3, -0.5, 0.8], lf: [-0.7, 0.1, 0.7], bat: [-0.95, 0.12, 0.25] },
  // El golpe: los brazos estirados delante y el bate hacia el rival, a la altura del pecho.
  golpe: { twist: 15, ru: [-0.3, -0.3, 0.9], rf: [0.1, 0, 1], lu: [0.05, -0.35, 0.94], lf: [-0.2, 0, 1], bat: [0.2, -0.04, 0.98] },
  // El remate: el bate por encima del hombro izquierdo, el tronco girado del todo.
  remate: { twist: 50, ru: [0.45, -0.15, 0.88], rf: [0.65, 0.6, -0.25], lu: [0.85, -0.35, 0.35], lf: [0.15, 0.9, -0.3], bat: [0.55, 0.6, -0.6] },
};
const DIRS = ['ru', 'rf', 'lu', 'lf', 'bat'];

// Mezcla dos direcciones (unitarias) por el camino corto.
const giro = new THREE.Quaternion();
const nada = new THREE.Quaternion();
function mezcla(a, b, t, out) {
  giro.setFromUnitVectors(a, b);
  return out.copy(a).applyQuaternion(nada.identity().slerp(giro, t)).normalize();
}

// Prepara al alfil (`piece`) para batear. Devuelve `pose(a, b, t)`, que lo pone entre dos posturas (de
// `SWING`, o 'reposo', la que tenía al empezar); `tip()`, dónde está la punta del báculo; y `release()`,
// que le devuelve su animación y el báculo a la mano.
export function batSwing(piece) {
  const hueso = (name) => findBone(piece.figure, name);
  const b = {
    spine: hueso('Spine1') ?? hueso('Spine'),
    ra: hueso('R_Arm'), rf: hueso('R_ForeArm'), rh: hueso('R_Hand'),
    la: hueso('L_Arm'), lf: hueso('L_ForeArm'), lh: hueso('L_Hand'),
    nudillos: hueso('mixamorigRightHandMiddle1'),
  };
  const spear = piece.props?.spear;
  if (!b.spine || !b.ra || !b.rf || !b.rh || !b.la || !b.lf || !b.lh || !spear || !piece.spearEnds) return null;

  piece.freeze(true); // sin animación: pisaría los huesos
  const base = Object.fromEntries(['spine', 'ra', 'rf', 'la', 'lf'].map((k) => [k, b[k].quaternion.clone()]));
  const figura = piece.figure.getWorldQuaternion(new THREE.Quaternion());
  const figuraInv = figura.clone().invert();
  const W = (o, out = new THREE.Vector3()) => o.getWorldPosition(out);
  const enFigura = (v) => v.applyQuaternion(figuraInv).normalize();
  piece.figure.updateMatrixWorld(true);
  // La de reposo: hacia dónde van ahora sus huesos y el báculo.
  const reposo = {
    twist: 0,
    ru: enFigura(W(b.rf).sub(W(b.ra))),
    rf: enFigura(W(b.rh).sub(W(b.rf))),
    lu: enFigura(W(b.lf).sub(W(b.la))),
    lf: enFigura(W(b.lh).sub(W(b.lf))),
    bat: enFigura(ARRIBA.clone().applyQuaternion(spear.getWorldQuaternion(new THREE.Quaternion()))),
  };
  const poses = { reposo };
  for (const [name, p] of Object.entries(SWING)) {
    poses[name] = { twist: p.twist, ...Object.fromEntries(DIRS.map((k) => [k, new THREE.Vector3(...p[k]).normalize()])) };
  }
  // El báculo, suelto de la mano (clavado: así la pieza no lo toca) para ponerlo a mano.
  const at = W(spear);
  piece.plantSpear({ x: at.x, z: at.z });

  const q = new THREE.Quaternion();
  const mundo = new THREE.Quaternion();
  const padre = new THREE.Quaternion();
  const d = new THREE.Vector3();
  const objetivo = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  // Gira un hueso en el mundo (encima de cómo esté) y lo deja así en su sistema.
  function enMundo(o, giroMundo) {
    o.getWorldQuaternion(mundo);
    o.parent.getWorldQuaternion(padre);
    o.quaternion.copy(padre.invert().multiply(giroMundo.multiply(mundo)));
    o.updateWorldMatrix(false, true);
  }
  // Orienta `o` para que su hijo quede en la dirección `dir` (del mundo).
  function orienta(o, hijo, dir) {
    o.updateWorldMatrix(true, true);
    d.copy(W(hijo, tmp)).sub(W(o)).normalize();
    enMundo(o, q.setFromUnitVectors(d, dir));
  }
  const dir = Object.fromEntries(DIRS.map((k) => [k, new THREE.Vector3()]));
  const puño = new THREE.Vector3();
  let soltado = false;

  function pose(a, bName, t) {
    const pa = poses[a] ?? reposo;
    const pb = poses[bName] ?? reposo;
    for (const k of DIRS) mezcla(pa[k], pb[k], t, dir[k]).applyQuaternion(figura);
    for (const [k, quat] of Object.entries(base)) b[k].quaternion.copy(quat);
    b.spine.updateWorldMatrix(true, true);
    const twist = (pa.twist + (pb.twist - pa.twist) * t) * (Math.PI / 180);
    enMundo(b.spine, q.setFromAxisAngle(ARRIBA, twist));
    orienta(b.ra, b.rf, dir.ru);
    orienta(b.rf, b.rh, dir.rf);
    orienta(b.la, b.lf, dir.lu);
    orienta(b.lf, b.lh, dir.lf);
    // El báculo: del puño (entre la muñeca y los nudillos) hacia donde va el bate, cogido cerca del regatón.
    W(b.rh, puño);
    if (b.nudillos) puño.lerp(W(b.nudillos, tmp), 0.55);
    const objeto = piece.object;
    objeto.getWorldQuaternion(mundo);
    spear.quaternion.copy(mundo.invert().multiply(q.setFromUnitVectors(ARRIBA, dir.bat)));
    const escala = spear.getWorldScale(tmp).y;
    objetivo.copy(puño).addScaledVector(dir.bat, -(piece.spearEnds.bottom + GRIP_FROM_BOTTOM) * escala);
    spear.position.copy(objeto.worldToLocal(objetivo));
    spear.updateWorldMatrix(false, true);
  }

  return {
    pose,
    // La punta del báculo (la voluta), en el mundo.
    tip: () => spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0)),
    // Hacia dónde va el bate en el golpe, en el mundo (para que los pedazos salgan por ahí).
    swingDir: () => new THREE.Vector3(1, 0, 0.4).normalize().applyQuaternion(figura),
    // Vale llamarla de más (también se llama si el combate falla a medias): solo suelta una vez.
    release() {
      if (soltado) return;
      soltado = true;
      for (const [k, quat] of Object.entries(base)) b[k].quaternion.copy(quat);
      piece.freeze(false);
      piece.holdSpear();
    },
  };
}
