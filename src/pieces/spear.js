import * as THREE from 'three';

// Lanza del peón hecha en código: asta de madera, punta de acero y regatón.
// El origen es el punto de agarre y la punta mira a +Y. Unidad: casillas.

export function createSpear({ length = 1.9, grip = 0.62 } = {}) {
  const group = new THREE.Group();
  group.name = 'lanza';

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.75, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.28, metalness: 1 });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, length, 12), wood);
  shaft.position.y = length / 2 - grip;

  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 4), steel);
  blade.scale.z = 0.35;
  blade.position.y = length - grip + 0.13;

  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.09, 12), steel);
  socket.position.y = length - grip - 0.02;

  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 12), steel);
  butt.rotation.x = Math.PI;
  butt.position.y = -grip - 0.03;

  group.add(shaft, blade, socket, butt);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}
