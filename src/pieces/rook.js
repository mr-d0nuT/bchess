import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitToHeight, loadPieceKit, spawnPiece, withShadows } from './piece.js';
import { createFlag, flagTexture } from './flag.js';
import { measureBody, measureStrikes } from '../combat/strikes.js';

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
    giant.strikes = measureStrikes(giant, spawnPiece, { faces: true });
    giant.body = measureBody(giant, spawnPiece);
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
