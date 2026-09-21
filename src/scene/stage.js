import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Lienzo, cámara y controles de órbita. La cámara empieza detrás de las blancas y se
// aleja lo necesario para que el tablero quepa a lo ancho (en vertical, en el móvil).

const BOARD_HALF_WIDTH = 5.2; // media anchura del tablero con marco, más margen
const DEFAULT_DISTANCE = 12.4;

export function createStage(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true; // para recortar al plano del tablero lo que se cuela por un agujero
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b09);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.4, 0.8);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
  const viewDirection = new THREE.Vector3(0, 7.1, 10.2).normalize();
  const home = controls.target.clone();
  // `keepCamera(view)` puede quedarse con el encuadre de reposo nuevo sin que la cámara se mueva
  // (lo hace la cámara de cine mientras encuadra un combate).
  const stage = { renderer, scene, camera, controls, keepCamera: () => false };

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < height ? 55 : 40;
    camera.updateProjectionMatrix();
    const halfHorizontalFov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
    const distance = Math.max(DEFAULT_DISTANCE, BOARD_HALF_WIDTH / Math.tan(halfHorizontalFov));
    controls.maxDistance = Math.max(18, distance * 1.3);
    const view = { position: home.clone().addScaledVector(viewDirection, distance), target: home.clone() };
    if (stage.keepCamera(view)) return;
    camera.position.copy(view.position);
    controls.target.copy(view.target);
    controls.update();
  }
  window.addEventListener('resize', resize);
  resize();

  return stage;
}
