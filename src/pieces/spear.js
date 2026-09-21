import * as THREE from 'three';

// Lanza del peón hecha en código: asta de madera, punta de acero y regatón. Con `crook`, en vez de la
// punta lleva la voluta de un báculo: es el bastón del alfil.
// El origen es el punto de agarre y la punta mira a +Y. Unidad: casillas.

export function createSpear({ length = 1.9, grip = 0.62, crook = false } = {}) {
  const group = new THREE.Group();
  group.name = crook ? 'báculo' : 'lanza';

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.75, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.28, metalness: 1 });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, length, 12), wood);
  shaft.position.y = length / 2 - grip;

  // Punta: la de la lanza, o la voluta del báculo (una vuelta y media de aro, dorada).
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b44a, roughness: 0.35, metalness: 0.8 });
  const top = new THREE.Group();
  if (crook) {
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.022, 10, 26, Math.PI * 1.55), gold);
    curl.rotation.z = -Math.PI / 2;
    curl.position.y = 0.1;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), gold);
    knob.position.set(0.1, 0.1, 0);
    top.add(curl, knob);
    top.position.y = length - grip;
  } else {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 4), steel);
    blade.scale.z = 0.35;
    blade.position.y = 0.13;
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.09, 12), steel);
    socket.position.y = -0.02;
    top.add(blade, socket);
    top.position.y = length - grip;
  }

  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 12), steel);
  butt.rotation.x = Math.PI;
  butt.position.y = -grip - 0.03;

  group.add(shaft, top, butt);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}
