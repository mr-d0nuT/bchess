import * as THREE from 'three';

// Mitra del alfil hecha en código: dos paños en punta, la cinta que los ciñe y las ínfulas que cuelgan
// por detrás. El origen va en la coronilla y la punta mira a +Y. Unidad: casillas.

export function createMitre({ height = 0.34, color = 0xf3ece0, trim = 0xd9b44a } = {}) {
  const group = new THREE.Group();
  group.name = 'mitra';

  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.35, metalness: 0.8 });

  // Cada paño es medio cono achatado: juntos forman la punta de delante y la de detrás.
  for (const side of [1, -1]) {
    const panel = new THREE.Mesh(new THREE.ConeGeometry(0.135, height, 16, 1, false, 0, Math.PI), cloth);
    panel.scale.z = 0.42;
    panel.rotation.y = side > 0 ? 0 : Math.PI;
    panel.position.y = height / 2;
    group.add(panel);
  }

  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.132, 0.05, 20), gold);
  band.scale.z = 0.5;
  band.position.y = 0.025;
  group.add(band);

  // Ínfulas: las dos cintas que caen por la nuca.
  for (const side of [-1, 1]) {
    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.01), cloth);
    ribbon.position.set(side * 0.05, -0.1, -0.055);
    group.add(ribbon);
  }

  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}
