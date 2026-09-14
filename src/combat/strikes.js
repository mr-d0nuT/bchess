import * as THREE from 'three';

// Mide, una vez por tipo de pieza y con una pieza de prueba fuera de la escena, cada versión
// de ataque. Guarda cuándo y hasta dónde llegan por delante la punta de la lanza (`spear`) y
// la mano o el pie que más avanzan (`body`). Son distancias horizontales desde el centro de la
// figura, en la dirección en la que mira, en casillas.

const FPS = 60;
const LIMBS = ['L_Hand', 'R_Hand', 'L_ToeBase', 'R_ToeBase'];

export function measureStrikes(kit, spawnPiece) {
  const piece = spawnPiece(kit);
  piece.placeAt({ x: 0, z: 0 });
  piece.figure.position.y = 0;
  piece.face(0); // mira hacia +Z
  const limbs = LIMBS.map((name) => piece.object.getObjectByName(name)).filter(Boolean);
  const point = new THREE.Vector3();
  const strikes = {};
  for (const attack of kit.moves.attack ?? []) {
    piece.play('idle', { fade: 0 });
    for (let i = 0; i < 20; i++) piece.update(1 / FPS);
    const action = piece.play('attack', { loop: false, fade: 0, clip: attack.key });
    if (!action) continue;
    const duration = action.getClip().duration;
    let spear = null;
    let body = null;
    for (let frame = 0; frame < Math.ceil(duration * FPS); frame++) {
      piece.update(1 / FPS);
      piece.object.updateMatrixWorld(true);
      const t = action.time;
      if (piece.props.spear && piece.spearEnds) {
        const reach = piece.props.spear.localToWorld(point.set(0, piece.spearEnds.top, 0)).z;
        if (!spear || reach > spear.reach) spear = { t, reach };
      }
      for (const limb of limbs) {
        const reach = limb.getWorldPosition(point).z;
        if (!body || reach > body.reach) body = { t, reach, bone: limb.name };
      }
    }
    strikes[attack.key] = { duration, spear, body };
  }
  return strikes;
}
