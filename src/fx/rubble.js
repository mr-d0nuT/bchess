import * as THREE from 'three';
import { rockStep } from './rock.js';

// Rocas hechas en código: salen despedidas, caen, rebotan (en el tablero y en las piezas) y, un
// rato después, encogen hasta desaparecer. O vuelan desde el suelo hacia un punto, encogiendo,
// cuando la torre se rehace.

const LINGER = 0.6; // segundos quietas en el suelo antes de encoger
const SHRINK = 1; // segundos que tardan en desaparecer
const SHAPES = [[1, 0.7, 0.9], [0.8, 1, 0.75], [1.1, 0.8, 1]]; // escalas de las tres formas de roca

export function createRubble(scene) {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const materials = new Map();
  const rocks = [];

  function material(color, shade) {
    const key = `${color}:${shade}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(shade),
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }));
    }
    return materials.get(key);
  }

  function addMesh(color, size, i) {
    const mesh = new THREE.Mesh(geometry, material(color, i % 2 ? 0.78 : 1));
    const [sx, sy, sz] = SHAPES[i % SHAPES.length];
    const scale = new THREE.Vector3(sx * size, sy * size, sz * size);
    mesh.scale.copy(scale);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, scale };
  }

  // Estalla en `center` ({x, z}): rocas repartidas en todo el alto (`height`) que salen hacia
  // fuera. `obstacles()` devuelve las piezas en las que rebotan.
  function explode(center, { color, count = 18, height = 1.6, obstacles = () => [] }) {
    for (let i = 0; i < count; i++) {
      const size = 0.05 + Math.random() * 0.07;
      const angle = Math.random() * Math.PI * 2;
      const from = 0.1 + Math.random() * 0.2;
      const out = 0.7 + Math.random() * 1.1;
      rocks.push({
        ...addMesh(color, size, i),
        obstacles,
        age: 0,
        restAge: null,
        body: {
          position: { x: center.x + Math.sin(angle) * from, y: 0.15 + Math.random() * height, z: center.z + Math.cos(angle) * from },
          velocity: { x: Math.sin(angle) * out, y: 1 + Math.random() * 2.2, z: Math.cos(angle) * out },
          radius: size,
          bounces: 0,
          resting: false,
        },
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spinSpeed: 5 + Math.random() * 7,
      });
    }
  }

  // Rocas que vuelan desde el suelo, alrededor de `center`, hasta él en `seconds`, encogiendo.
  function implode(center, { color, count = 14, seconds = 0.4 }) {
    for (let i = 0; i < count; i++) {
      const size = 0.05 + Math.random() * 0.06;
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.35 + Math.random() * 0.2;
      rocks.push({
        ...addMesh(color, size, i),
        age: 0,
        gather: {
          from: new THREE.Vector3(center.x + Math.sin(angle) * distance, size, center.z + Math.cos(angle) * distance),
          to: new THREE.Vector3(center.x, 0.3 + Math.random() * 0.9, center.z),
          arc: 0.3 + Math.random() * 0.4,
          seconds,
        },
      });
    }
  }

  function remove(i) {
    scene.remove(rocks[i].mesh);
    rocks.splice(i, 1);
  }

  function update(dt) {
    const lists = new Map(); // cada lista de obstáculos se pide una vez por fotograma
    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i];
      rock.age += dt;
      if (rock.gather) {
        const { from, to, arc, seconds } = rock.gather;
        const t = Math.min(1, rock.age / seconds);
        rock.mesh.position.lerpVectors(from, to, t);
        rock.mesh.position.y += Math.sin(Math.PI * t) * arc;
        rock.mesh.scale.copy(rock.scale).multiplyScalar(Math.max(0.001, 1 - t * t));
        if (t >= 1) remove(i);
        continue;
      }
      if (!lists.has(rock.obstacles)) lists.set(rock.obstacles, rock.obstacles());
      rockStep(rock.body, dt, lists.get(rock.obstacles));
      const { position } = rock.body;
      rock.mesh.position.set(position.x, position.y, position.z);
      if (!rock.body.resting) {
        rock.mesh.rotateOnAxis(rock.spin, rock.spinSpeed * dt);
        continue;
      }
      rock.restAge ??= rock.age;
      const k = (rock.age - rock.restAge - LINGER) / SHRINK;
      if (k > 0) rock.mesh.scale.copy(rock.scale).multiplyScalar(Math.max(0.001, 1 - k));
      if (k >= 1) remove(i);
    }
  }

  return {
    explode,
    implode,
    update,
    get count() {
      return rocks.length;
    },
  };
}
