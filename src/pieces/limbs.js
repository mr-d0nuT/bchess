import * as THREE from 'three';
import { descendantsOf, trianglesOfBones } from './skin.js';
import { rockStep } from '../fx/rock.js';

// Trozos de armadura que salen volando (diseño, sección 7). Al cortar un brazo o una pierna, sale una
// copia rígida de los triángulos que mueve ese hueso y lo que cuelga de él, sacada de la propia malla en
// su postura de ahora, y el hueso encoge hasta desaparecer (`scaleBone`). Los trozos caen, rebotan en el
// tablero y en las piezas (`rockStep`), piden sitio mientras están en el tablero y desaparecen
// encogiendo cuando se pide.

const FADE_SECONDS = 0.5;
const SPIN = 7; // radianes por segundo que gira un trozo en el aire
const REST_RADIUS = 0.08; // altura a la que se queda en el suelo el centro de un trozo

// Copia rígida, en coordenadas del mundo, de los triángulos de las mallas con esqueleto de `object` que
// mueve el hueso `boneName` o lo que cuelga de él. Devuelve un Mesh con el origen en su centro, o null.
export function cutLimb(object, boneName) {
  object.updateMatrixWorld(true);
  const positions = [];
  const uvs = [];
  let material = null;
  const v = new THREE.Vector3();
  object.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { bones } = mesh.skeleton;
    const root = bones.findIndex((bone) => bone.name === boneName);
    if (root < 0) return;
    const { geometry } = mesh;
    const triangles = trianglesOfBones({
      index: geometry.index ? geometry.index.array : null,
      count: geometry.attributes.position.count,
      skinIndex: geometry.attributes.skinIndex.array,
      skinWeight: geometry.attributes.skinWeight.array,
      bones: descendantsOf(bones.map((bone) => bones.indexOf(bone.parent)), root),
    });
    const uv = geometry.attributes.uv;
    for (const i of triangles) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
    }
    if (triangles.length) material ??= mesh.material;
  });
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs.length === (positions.length / 3) * 2) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const center = geometry.boundingSphere.center.clone();
  geometry.translate(-center.x, -center.y, -center.z);
  const chunk = new THREE.Mesh(geometry, material.clone());
  chunk.name = `trozo-${boneName}`;
  chunk.position.copy(center);
  chunk.castShadow = true;
  return chunk;
}

// Trozos sueltos por el tablero. `throwPiece` suelta un objeto (un trozo de `cutLimb`, la espada, el
// escudo…) con una velocidad; rebota en las piezas de `obstacles()` ({ x, z, radius, height }) y se queda
// en el suelo hasta `clear()`.
export function createDebris(scene) {
  const items = [];

  function throwPiece(object, { velocity, obstacles = () => [] }) {
    scene.attach(object); // conserva su sitio en el mundo aunque colgara de una mano
    items.push({
      object,
      obstacles,
      scale: object.scale.clone(),
      fade: null,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      body: {
        position: { x: object.position.x, y: Math.max(object.position.y, REST_RADIUS), z: object.position.z },
        velocity: { ...velocity },
        radius: REST_RADIUS,
        bounces: 0,
        resting: false,
      },
    });
  }

  function update(dt) {
    const lists = new Map(); // cada lista de obstáculos se pide una vez por fotograma
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item.body.resting) {
        if (!lists.has(item.obstacles)) lists.set(item.obstacles, item.obstacles());
        rockStep(item.body, dt, lists.get(item.obstacles));
        item.object.rotateOnWorldAxis(item.spin, SPIN * dt);
      }
      const { position } = item.body;
      item.object.position.set(position.x, position.y, position.z);
      if (!item.fade) continue;
      item.fade.age += dt;
      const k = Math.min(1, item.fade.age / item.fade.seconds);
      item.object.scale.copy(item.scale).multiplyScalar(Math.max(0.001, 1 - k));
      if (k >= 1) {
        scene.remove(item.object);
        items.splice(i, 1);
      }
    }
  }

  // Con lo que piden sitio los trozos que siguen en el tablero: su caja vista desde arriba, como un tramo a
  // lo largo de su lado largo (una lanza tirada no es un círculo de su largo).
  function bodies() {
    const box = new THREE.Box3();
    return items.map(({ object }) => {
      box.setFromObject(object);
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const width = box.max.x - box.min.x;
      const depth = box.max.z - box.min.z;
      const radius = Math.max(0.04, Math.min(width, depth) / 2);
      const half = Math.max(0, Math.max(width, depth) / 2 - radius);
      return width >= depth
        ? { from: { x: cx - half, z: cz }, to: { x: cx + half, z: cz }, radius }
        : { from: { x: cx, z: cz - half }, to: { x: cx, z: cz + half }, radius };
    });
  }

  // Todos los trozos encogen hasta desaparecer en `seconds`.
  function clear({ seconds = FADE_SECONDS } = {}) {
    for (const item of items) item.fade ??= { age: 0, seconds };
  }

  return {
    throwPiece,
    update,
    bodies,
    clear,
    get count() {
      return items.length;
    },
  };
}
