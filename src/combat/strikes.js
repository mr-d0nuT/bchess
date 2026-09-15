import * as THREE from 'three';
import { FAN_SECTORS, FAN_STEP } from '../moves/room.js';

// Mide, una vez por tipo de pieza y con una pieza de prueba fuera de la escena, cada versión
// de ataque. Guarda cuándo y hasta dónde llegan por delante la punta de la lanza (`spear`, con
// dónde está la punta y hacia dónde apunta la lanza en ese momento) y la mano o el pie que más
// avanzan (`body`), y cuánto se abren los pies a los lados (`sideStep`). Son distancias desde el
// centro de la figura, que mira hacia +Z, en casillas.

const FPS = 60;
const LIMBS = ['L_Hand', 'R_Hand', 'L_ToeBase', 'R_ToeBase'];

// Mallas con esqueleto de una pieza, con su postura de ahora: sin su zona de toque invisible, la
// peana ni lo que lleva en las manos.
export function skinnedMeshes(object) {
  const meshes = [];
  object.updateMatrixWorld(true);
  object.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  for (const mesh of meshes) mesh.computeBoundingSphere();
  return meshes;
}

const FACE_SPREAD = 0.12; // medio puño
// Líneas, paralelas a la del golpe, con las que se tantea su cara: por el hueso y a medio puño a cada
// lado, arriba y abajo.
const FACE_RAYS = [[0, 0], [FACE_SPREAD, 0], [-FACE_SPREAD, 0], [0, FACE_SPREAD], [0, -FACE_SPREAD]];

// Con `faces`, cada golpe con mano o pie guarda también dónde está el hueso en ese momento (`side`,
// `height`) y, en cada línea de FACE_RAYS ({ dx, dy }), hasta dónde llega por delante su malla
// (`face`, o null si por ahí no hay malla), para que un gigante no hunda el puño en su rival.
export function measureStrikes(kit, spawnPiece, { faces = false } = {}) {
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
        const tip = piece.props.spear.localToWorld(point.set(0, piece.spearEnds.top, 0));
        if (!spear || tip.z > spear.reach) {
          const axis = piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.bottom, 0)).sub(tip).negate().normalize();
          spear = { t, reach: tip.z, side: tip.x, height: tip.y, axis: [axis.x, axis.y, axis.z] };
        }
      }
      for (const limb of limbs) {
        const at = limb.getWorldPosition(point);
        if (!body || at.z > body.reach) body = { t, reach: at.z, bone: limb.name };
        if (limb.name.includes('Toe')) sideStep = Math.max(sideStep, Math.abs(at.x));
      }
    }
    if (faces && body) {
      piece.play('attack', { loop: false, fade: 0, clip: attack.key }).time = body.t;
      piece.update(0);
      const meshes = skinnedMeshes(piece.object);
      const limb = piece.object.getObjectByName(body.bone).getWorldPosition(new THREE.Vector3());
      const back = new THREE.Vector3(0, 0, -1);
      body.side = limb.x;
      body.height = limb.y;
      body.faces = FACE_RAYS.map(([dx, dy]) => {
        const hit = new THREE.Raycaster(new THREE.Vector3(limb.x + dx, limb.y + dy, limb.z + 1), back, 0, 1.5).intersectObjects(meshes, false)[0];
        return { dx, dy, face: hit ? limb.z + 1 - hit.distance : null };
      });
    }
    strikes[attack.key] = { duration, spear, body, sideStep };
  }
  return strikes;
}

const BODY_FPS = 30;
const MIN_MARGIN = 0.05;

// Alcance en abanico de cada versión de `actions`, con una pieza de prueba que mira hacia +Z: en cada
// uno de FAN_SECTORS sectores iguales (el primero detrás, girando como atan2(x, z)), la distancia
// horizontal más lejana del centro de la figura a la que llega algún hueso. Se guarda por tramos de
// FAN_STEP segundos, y cada tramo incluye los anteriores (se lee con `fanReach`). `seconds` es lo
// que se ve de la versión: entera o hasta su `seconds` del manifiesto.
function measureFans(kit, spawnPiece, actions) {
  const piece = spawnPiece(kit);
  piece.placeAt({ x: 0, z: 0 });
  piece.figure.position.y = 0;
  piece.face(0);
  const bones = [];
  piece.object.traverse((o) => { if (o.isBone) bones.push(o); });
  const point = new THREE.Vector3();
  const sector = (2 * Math.PI) / FAN_SECTORS;
  const fans = {};
  for (const action of actions) {
    fans[action] = {};
    for (const variant of kit.moves[action] ?? []) {
      const running = piece.play(action, { loop: false, fade: 0, clip: variant.key });
      if (!running) continue;
      const duration = running.getClip().duration;
      const reach = new Array(FAN_SECTORS).fill(0);
      const profile = [];
      const frames = Math.ceil(duration * BODY_FPS);
      for (let frame = 0; frame <= frames; frame++) {
        piece.update(frame === 0 ? 0 : 1 / BODY_FPS);
        piece.object.updateMatrixWorld(true);
        for (const bone of bones) {
          bone.getWorldPosition(point);
          const k = Math.min(FAN_SECTORS - 1, Math.floor((Math.atan2(point.x, point.z) + Math.PI) / sector));
          reach[k] = Math.max(reach[k], Math.hypot(point.x, point.z));
        }
        profile[Math.max(0, Math.ceil(frame / BODY_FPS / FAN_STEP - 1e-9) - 1)] = [...reach];
      }
      fans[action][variant.key] = { seconds: Math.min(duration, variant.seconds ?? duration), profile };
    }
  }
  return fans;
}

// Medidas del cuerpo de un gigante, una vez por tipo de pieza:
// - `margin` compara la malla con los huesos en la postura de reposo del esqueleto;
// - `torso` es donde un rayo horizontal a media altura toca su pecho;
// - `walk`, hasta dónde llegan los huesos en reposo y al andar, más el margen;
// - `fans`, el alcance en abanico de cada versión de sus acciones (`measureFans`).
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
  const fans = measureFans(kit, spawnPiece, ['idle', 'walk', 'attack', 'hit', 'taunt', 'defeat']);
  const farthest = (versions) => Math.max(0, ...Object.values(versions).map(({ profile }) => Math.max(...profile[profile.length - 1])));
  return {
    walk: Math.max(farthest(fans.idle), farthest(fans.walk)) + margin,
    margin,
    torso: hit ? Math.max(0.1, hit.point.z) : 0.3,
    fans,
  };
}
