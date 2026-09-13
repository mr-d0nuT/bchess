import * as THREE from 'three';
import { squareToPosition, positionToSquare } from './squares.js';

// Tablero 8×8 de chapa de madera (roble claro y palisandro oscuro) con marco y mesa.
// La cara superior de las casillas está en y = 0. Unidad: 1 = una casilla.

const TEXTURES = 'assets/textures/';

function woodMaterial(loader, name) {
  const load = (map, srgb) => {
    const texture = loader.load(`${TEXTURES}${name}_${map}_1k.jpg`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return new THREE.MeshStandardMaterial({
    map: load('diff', true),
    normalMap: load('nor_gl', false),
    roughnessMap: load('rough', false),
    roughness: 1,
    metalness: 0,
  });
}

// Cada casilla toma un trozo distinto de la textura para que la veta no se repita.
function tileGeometry(offsetU, offsetV) {
  const geometry = new THREE.BoxGeometry(1, 0.12, 1);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * 0.5 + offsetU, uv.getY(i) * 0.5 + offsetV);
  }
  return geometry;
}

export function createBoard() {
  const loader = new THREE.TextureLoader();
  const light = woodMaterial(loader, 'oak_veneer_01');
  const dark = woodMaterial(loader, 'rosewood_veneer1');
  const frameMaterial = dark.clone();
  frameMaterial.color = new THREE.Color(0x6b4a33);

  const group = new THREE.Group();
  group.name = 'tablero';

  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      const square = 'abcdefgh'[file] + (rank + 1);
      const { x, z } = squareToPosition(square);
      const isLight = (file + rank) % 2 === 1;
      const offsetU = ((file * 37 + rank * 17) % 10) / 10;
      const offsetV = ((file * 13 + rank * 29) % 10) / 10;
      const tile = new THREE.Mesh(tileGeometry(offsetU, offsetV), isLight ? light : dark);
      tile.position.set(x, -0.06, z);
      tile.rotation.y = ((file + rank * 3) % 2) * (Math.PI / 2);
      tile.receiveShadow = true;
      tile.name = square;
      group.add(tile);
    }
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 9), frameMaterial);
  frame.position.y = -0.17;
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const table = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: 0x1b140f, roughness: 0.9 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.32;
  table.receiveShadow = true;
  group.add(table);

  return {
    group,
    squareToWorld(square) {
      const { x, z } = squareToPosition(square);
      return new THREE.Vector3(x, 0, z);
    },
    worldToSquare(point) {
      return positionToSquare(point.x, point.z);
    },
  };
}
