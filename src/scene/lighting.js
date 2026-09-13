import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Luz de estudio: un HDRI libre (Poly Haven, CC0) para reflejos y luz ambiente, y una
// luz principal que proyecta sombras suaves. Si el HDRI no carga, luz de reserva.

export async function addLighting({ renderer, scene }, quality) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdr = await new HDRLoader().loadAsync('assets/env/studio_small_09_1k.hdr');
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.9;
    hdr.dispose();
    pmrem.dispose();
  } catch (err) {
    console.error('[BChess] Sin HDRI, uso luz de reserva:', err);
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x201810, 1.2));
  }

  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);
}
