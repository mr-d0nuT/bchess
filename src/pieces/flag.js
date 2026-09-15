import * as THREE from 'three';

// Banderín de dos puntas que ondea en lo alto de la torre: un mástil dorado y una tela plana que
// se ondula en cada fotograma, fija al mástil por su borde. La tela es la imagen del emblema de su
// bando, recortada con la forma del banderín.

const POLE_RADIUS = 0.012;
const CLOTH_WIDTH = 0.36;
const CLOTH_HEIGHT = 0.22;
const WAVE_SPEED = 5; // radianes por segundo
const WAVE_SIZE = 0.03;

// Textura de la tela: la imagen del emblema cubre el lienzo y se le recorta la cola en punta. Sin
// imagen, tela marfil lisa.
export function flagTexture(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const g = canvas.getContext('2d');
  if (image) {
    const k = Math.max(canvas.width / image.width, canvas.height / image.height);
    const w = image.width * k;
    const h = image.height * k;
    g.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  } else {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(canvas.width, 0);
  g.lineTo(canvas.width * 0.74, canvas.height / 2);
  g.lineTo(canvas.width, canvas.height);
  g.lineTo(0, canvas.height);
  g.closePath();
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createFlag({ texture, poleHeight = 0.5 }) {
  const object = new THREE.Group();
  object.name = 'banderin';
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9b44a, metalness: 0.8, roughness: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, poleHeight, 8), metal);
  pole.position.y = poleHeight / 2;
  pole.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(POLE_RADIUS * 2.2, 12, 8), metal);
  knob.position.y = poleHeight;

  const geometry = new THREE.PlaneGeometry(CLOTH_WIDTH, CLOTH_HEIGHT, 12, 3);
  geometry.translate(CLOTH_WIDTH / 2, 0, 0); // el borde izquierdo, en el mástil
  const rest = Float32Array.from(geometry.attributes.position.array);
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.85,
  }));
  cloth.position.set(POLE_RADIUS, poleHeight - CLOTH_HEIGHT / 2 - 0.03, 0);
  object.add(pole, knob, cloth);

  const phase = Math.random() * Math.PI * 2;
  let time = 0;

  // La onda crece hacia la punta y la tela cae un poco por su peso.
  function update(dt) {
    time += dt;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const u = rest[i * 3] / CLOTH_WIDTH;
      position.setZ(i, Math.sin(u * 7 - time * WAVE_SPEED + phase) * WAVE_SIZE * u);
      position.setY(i, rest[i * 3 + 1] - u * u * 0.02);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  update(0);
  return { object, update };
}
