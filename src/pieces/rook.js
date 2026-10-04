import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitToHeight, loadPieceKit, spawnPiece, withShadows } from './piece.js';
import { createFlag, flagTexture } from './flag.js';
import { pinFlagToPole } from './pole-flag.js';
import { measureBody, measureFront, measureStrikes } from '../combat/strikes.js';

// La torre: una pieza con dos formas en el mismo objeto. En reposo, la torre estática sobre su peana,
// con un banderín que ondea; para moverse y pelear, el gigante de piedra, una pieza con esqueleto que
// pisa el tablero. `figure` es el gigante (o la torre, si no hay gigante).

const MODELS = 'assets/models/';
const DEFAULT_STONE = '#cfc4ae';

export async function loadRookKit(spec, quality) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [towerGltf, giant, emblem, pedestalGltf] = await Promise.all([
    loader.loadAsync(MODELS + spec.tower.files[quality.name]),
    spec.giant
      ? loadPieceKit({ ...spec.giant, pedestal: false }, quality).catch((err) => {
        console.error('[BChess] No se pudo cargar el gigante; la torre se moverá sin transformarse:', err);
        return null;
      })
      : null,
    spec.flag ? new THREE.ImageLoader().loadAsync(spec.flag.texture).catch(() => null) : null,
    spec.pedestalModel ? loader.loadAsync(MODELS + spec.pedestalModel.files[quality.name]) : null,
  ]);
  const tower = withShadows(towerGltf.scene);
  fitToHeight(tower, spec.tower.height);
  tower.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tower);
  // El mástil va en el tejado: donde un rayo vertical por el centro toca la torre.
  const down = new THREE.Raycaster(new THREE.Vector3(0, spec.tower.height + 1, 0), new THREE.Vector3(0, -1, 0));
  const roof = down.intersectObject(tower, true)[0]?.point.y ?? spec.tower.height * 0.9;
  if (giant) {
    pinGiantFlag(giant.model);
    giant.strikes = measureStrikes(giant, spawnPiece, { faces: true });
    giant.body = measureBody(giant, spawnPiece);
    giant.front = measureFront(giant, spawnPiece);
  }
  // La peana de los peones, ensanchada para que la torre se asiente en ella.
  const pedestalHeight = spec.pedestalModel?.height ?? 0;
  let pedestal = null;
  let pedestalRadius = 0;
  if (pedestalGltf) {
    pedestal = withShadows(pedestalGltf.scene);
    fitToHeight(pedestal, pedestalHeight);
    const width = spec.pedestalModel.width ?? 1;
    pedestal.scale.x *= width;
    pedestal.scale.z *= width;
    pedestal.position.x *= width;
    pedestal.position.z *= width;
    pedestal.updateMatrixWorld(true);
    const footprint = new THREE.Box3().setFromObject(pedestal);
    pedestalRadius = Math.max(footprint.max.x - footprint.min.x, footprint.max.z - footprint.min.z) / 2;
  }

  return {
    spec,
    tower,
    pedestal,
    pedestalHeight,
    radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z, pedestalRadius * 2) / 2,
    roof,
    giant,
    flagTexture: spec.flag ? flagTexture(emblem) : null,
  };
}

// La bandera que el gigante lleva a la espalda, pegada a su mástil (`pole-flag.js`): el modelo la trae
// flotando a un palmo del palo y atada a otros huesos, y se le veía separada. Se cambia la geometría de su
// malla una sola vez, al cargar: la comparten todos los gigantes de ese color.
//
// Las posiciones vienen comprimidas (enteros normalizados, intercalados con las normales): se trabaja sobre
// una copia en decimales y se escriben de vuelta con `setXYZ`, que las vuelve a comprimir. Los huesos y los
// pesos son arrays sueltos de cuatro por vértice: se copian tal cual de un vértice a otro.
function pinGiantFlag(model) {
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const g = o.geometry;
    const { position, skinIndex, skinWeight } = g.attributes;
    if (!position || !skinIndex?.array || !skinWeight?.array || skinIndex.isInterleavedBufferAttribute) return;
    const positions = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      positions[i * 3] = position.getX(i);
      positions[i * 3 + 1] = position.getY(i);
      positions[i * 3 + 2] = position.getZ(i);
    }
    const antes = positions.slice();
    const hecho = pinFlagToPole({
      positions,
      index: g.index?.array ?? null,
      skinIndex: skinIndex.array,
      skinWeight: skinWeight.array,
    });
    if (!hecho) return;
    for (let i = 0; i < position.count; i++) {
      if (positions[i * 3] === antes[i * 3] && positions[i * 3 + 1] === antes[i * 3 + 1] && positions[i * 3 + 2] === antes[i * 3 + 2]) continue;
      position.setXYZ(i, positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    }
    position.needsUpdate = true;
    skinIndex.needsUpdate = true;
    skinWeight.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
  });
}

export function spawnRook(kit) {
  const { spec } = kit;
  const object = new THREE.Group();
  object.name = 'torre';

  // La peana va aparte de la torre: la torre estalla y vuelve a crecer, y la peana la espera encogida.
  const pedestal = new THREE.Group();
  pedestal.name = 'peana';
  if (kit.pedestal) pedestal.add(kit.pedestal.clone());
  object.add(pedestal);

  const tower = new THREE.Group();
  tower.name = 'torre-de-piedra';
  tower.add(kit.tower.clone());
  const flag = kit.flagTexture ? createFlag({ texture: kit.flagTexture }) : null;
  if (flag) {
    flag.object.position.y = kit.roof;
    tower.add(flag.object);
  }
  // Zona de toque invisible, del tamaño de la torre.
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(kit.radius, kit.radius, spec.tower.height, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = spec.tower.height / 2;
  hitbox.userData.noPick = true; // referencia del centro, no zona de toque
  tower.add(hitbox);
  object.add(tower);

  const giant = kit.giant ? spawnPiece(kit.giant) : null;
  if (giant) {
    giant.object.visible = false;
    object.add(giant.object);
  }

  return {
    object,
    tower,
    pedestal,
    pedestalHeight: kit.pedestalHeight,
    giant,
    hitbox,
    radius: kit.radius,
    height: kit.pedestalHeight + spec.tower.height,
    stone: spec.stone ?? DEFAULT_STONE,
    body: kit.giant?.body ?? null,
    giantFront: kit.giant?.front ?? null, // lo que sobresale el gigante por delante de su centro (`measureFront`)
    get figure() {
      return giant ? giant.figure : tower;
    },
    placeAt(position) {
      pedestal.position.set(position.x, 0, position.z);
      tower.position.set(position.x, kit.pedestalHeight, position.z);
      giant?.placeAt(position); // el gigante pisa el tablero, sin peana
    },
    face(angle) {
      pedestal.rotation.set(0, angle, 0);
      tower.rotation.set(0, angle, 0);
      giant?.face(angle);
    },
    update(dt) {
      flag?.update(dt);
      if (giant?.object.visible) giant.update(dt);
    },
  };
}
