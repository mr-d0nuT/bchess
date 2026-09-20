import * as THREE from 'three';

// Espada del caballero hecha en código: hoja de acero, guarda y pomo dorados y empuñadura de cuero. El
// origen es el punto de agarre y la punta mira a +Y, como la lanza. Unidad: casillas.

export function createSword({ length = 0.75 } = {}) {
  const group = new THREE.Group();
  group.name = 'espada';
  const steel = new THREE.MeshStandardMaterial({ color: 0xd4d7dc, roughness: 0.22, metalness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b44a, roughness: 0.35, metalness: 0.8 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.8, metalness: 0 });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 10), leather);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), gold);
  pommel.position.y = -0.085;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.024, 0.032), gold);
  guard.position.y = 0.077;
  const bladeLength = length - 0.089 - 0.1;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.046, bladeLength, 0.012), steel);
  blade.position.y = 0.089 + bladeLength / 2;
  // Punta: un cono de cuatro caras aplastado hasta el grosor de la hoja.
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.1, 4), steel);
  tip.scale.z = 0.26;
  tip.position.y = length - 0.05;

  group.add(handle, pommel, guard, blade, tip);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}
