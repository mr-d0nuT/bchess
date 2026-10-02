import * as THREE from 'three';

// LA PISTOLA DEL REY: una de chispa, de las de pirata, hecha en código. Cañón de hierro pavonado con su
// boca de latón, caja y culata de madera con la cantonera de latón, la llave con su martillo y el
// guardamonte con el gatillo. Algo grande para su mano, como en los dibujos: que se lea de lejos.
//
// El origen es el puño (donde se agarra); el cañón apunta a +Z y la culata baja hacia -Y, así que
// `lookAt` la apunta tal cual. `userData.muzzle`: la boca del cañón, en su sistema (el fogonazo y el humo).
// Unidad: casillas.

export function createPistol({ size = 1 } = {}) {
  const group = new THREE.Group();
  group.name = 'pistola';
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2e35, roughness: 0.32, metalness: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a046, roughness: 0.32, metalness: 0.85 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6e3c1b, roughness: 0.55, metalness: 0 });

  const alto = 0.04; // a qué altura del puño va el cañón
  const largo = 0.27;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.019, largo, 16), iron);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, alto, 0.03 + largo / 2);
  const boca = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.026, 16), brass);
  boca.rotation.x = Math.PI / 2;
  boca.position.set(0, alto, 0.03 + largo);
  const anillo = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.014, 16), brass);
  anillo.rotation.x = Math.PI / 2;
  anillo.position.set(0, alto, 0.03 + largo * 0.45);
  // La caja de madera bajo el cañón, de la llave a media caña.
  const caja = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.03, largo * 0.72), wood);
  caja.position.set(0, alto - 0.024, 0.03 + largo * 0.36);
  // La culata: baja hacia atrás desde la llave, y acaba en una cantonera de latón.
  const culata = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.14, 0.052), wood);
  culata.position.set(0, -0.03, -0.025);
  culata.rotation.x = -0.42;
  const cantonera = new THREE.Mesh(new THREE.SphereGeometry(0.031, 14, 10), brass);
  cantonera.scale.set(1, 0.8, 1.15);
  cantonera.position.set(0, -0.1, -0.058);
  // La llave (el mecanismo, en el costado derecho) y el martillo con su pedernal.
  const llave = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.032, 0.07), iron);
  llave.position.set(0.021, alto - 0.006, 0.012);
  const martillo = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.05, 0.016), iron);
  martillo.position.set(0.022, alto + 0.03, -0.012);
  martillo.rotation.x = -0.55;
  // Guardamonte: medio aro de latón bajo la caja, y el gatillo dentro.
  const guarda = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 16, Math.PI), brass);
  guarda.rotation.set(0, Math.PI / 2, Math.PI);
  guarda.position.set(0, alto - 0.04, 0.035);
  const gatillo = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.026, 0.008), iron);
  gatillo.position.set(0, alto - 0.05, 0.03);
  gatillo.rotation.x = 0.3;

  group.add(barrel, boca, anillo, caja, culata, cantonera, llave, martillo, guarda, gatillo);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.scale.setScalar(size);
  group.userData.muzzle = new THREE.Vector3(0, alto, 0.03 + largo + 0.016);
  return group;
}
