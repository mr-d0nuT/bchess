import * as THREE from 'three';

// Mide, una vez por tipo de pieza y con una pieza de prueba fuera de la escena, cada versión
// de ataque. Guarda cuándo y hasta dónde llegan por delante la punta de la lanza (`spear`) y
// la mano o el pie que más avanzan (`body`), y cuánto se abren los pies a los lados
// (`sideStep`). Son distancias horizontales desde el centro de la figura, en casillas.

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
    let sideStep = 0;
    for (let frame = 0; frame < Math.ceil(duration * FPS); frame++) {
      piece.update(1 / FPS);
      piece.object.updateMatrixWorld(true);
      const t = action.time;
      if (piece.props.spear && piece.spearEnds) {
        const reach = piece.props.spear.localToWorld(point.set(0, piece.spearEnds.top, 0)).z;
        if (!spear || reach > spear.reach) spear = { t, reach };
      }
      for (const limb of limbs) {
        const at = limb.getWorldPosition(point);
        if (!body || at.z > body.reach) body = { t, reach: at.z, bone: limb.name };
        if (limb.name.includes('Toe')) sideStep = Math.max(sideStep, Math.abs(at.x));
      }
    }
    strikes[attack.key] = { duration, spear, body, sideStep };
  }
  return strikes;
}

const BODY_FPS = 30;
const MIN_MARGIN = 0.05;

// Hasta dónde llegan en horizontal, desde el centro de la figura, los huesos de una pieza de
// prueba al hacer todas las versiones de `actions`. Con `front: false`, lo que queda por delante
// (+Z) solo cuenta hacia los lados, porque ahí está el rival.
function reachOf(kit, spawnPiece, actions, { front = true } = {}) {
  const piece = spawnPiece(kit);
  piece.placeAt({ x: 0, z: 0 });
  piece.figure.position.y = 0;
  piece.face(0);
  const bones = [];
  piece.object.traverse((o) => { if (o.isBone) bones.push(o); });
  const point = new THREE.Vector3();
  let reach = 0;
  for (const action of actions) {
    for (const variant of kit.moves[action] ?? []) {
      const running = piece.play(action, { loop: false, fade: 0, clip: variant.key });
      if (!running) continue;
      const frames = Math.ceil(running.getClip().duration * BODY_FPS);
      for (let frame = 0; frame <= frames; frame++) {
        piece.update(1 / BODY_FPS);
        piece.object.updateMatrixWorld(true);
        for (const bone of bones) {
          bone.getWorldPosition(point);
          reach = Math.max(reach, Math.hypot(point.x, front || point.z < 0 ? point.z : 0));
        }
      }
    }
  }
  return reach;
}

// Medidas del cuerpo de un gigante, una vez por tipo de pieza. `margin` compara la malla con los
// huesos en la postura de reposo del esqueleto; `torso` es donde un rayo horizontal a media altura
// toca su pecho.
export function measureBody(kit, spawnPiece) {
  kit.model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(kit.model);
  const point = new THREE.Vector3();
  let boneRadius = 0;
  kit.model.traverse((o) => {
    if (!o.isBone) return;
    o.getWorldPosition(point);
    boneRadius = Math.max(boneRadius, Math.hypot(point.x, point.z));
  });
  const meshRadius = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
  const margin = Math.max(MIN_MARGIN, meshRadius - boneRadius);
  const chest = new THREE.Raycaster(new THREE.Vector3(0, kit.spec.height * 0.55, 5), new THREE.Vector3(0, 0, -1));
  const hit = chest.intersectObject(kit.model, true)[0];
  return {
    walk: reachOf(kit, spawnPiece, ['idle', 'walk']) + margin,
    fight: reachOf(kit, spawnPiece, ['idle', 'attack', 'hit', 'taunt'], { front: false }) + margin,
    margin,
    torso: hit ? Math.max(0.1, hit.point.z) : 0.3,
  };
}
