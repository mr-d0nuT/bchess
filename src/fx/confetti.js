import * as THREE from 'three';

// LA FIESTA DEL JAQUE MATE (punto 6 del plan de mejora): confeti que llueve sobre el tablero y fuegos
// artificiales, de los colores del bando que gana. Sin ficheros, y barato en el móvil: todo el confeti es
// una sola malla repetida (`InstancedMesh`) y todas las chispas de todos los fuegos, una sola nube de
// puntos. Así cuesta lo mismo dibujar seiscientos papelitos que una pieza.

// Los colores de cada bando, sacados de sus figuras: las blancas, blanco, plata, el azul de sus zafiros y
// oro; las negras, el rojo de sus rubíes, oro, bronce y algo de negro (poco: sobre el tablero no se ve).
export const COLORS = {
  white: ['#ffffff', '#dfe7f2', '#3b6fe0', '#f2c548'],
  black: ['#d0202c', '#f2c548', '#b0703a', '#2b2b31'],
};

const PAPER_WIDTH = 0.09; // un papelito, en casillas
const PAPER_HEIGHT = 0.05;
const MAX_PAPERS = 700;
const FALL_SPEED = 0.85; // lo deprisa que cae (casillas por segundo): el aire lo frena enseguida
const FLUTTER = 0.45; // lo que se va de lado mientras cae, aleteando
const BOARD_Y = 0.004; // posado en el tablero, un pelín por encima para que no parpadee
const REST_SECONDS = 7; // lo que se queda en el tablero antes de irse
const SHRINK_SECONDS = 0.6; // y lo que tarda en irse: encogiendo, que una malla repetida no se desvanece

const MAX_SPARKS = 2400;
const SPARK_SIZE = 0.22;
const SPARK_GRAVITY = 1.4; // las chispas caen despacio y el aire las frena
const SPARK_DRAG = 1.6;
const ROCKET_SECONDS = 0.95; // lo que tarda el cohete en subir

function sparkTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const c = size / 2;
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createConfetti(scene, random = Math.random) {
  // ---- El confeti ----
  const papers = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(PAPER_WIDTH, PAPER_HEIGHT),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3 }),
    MAX_PAPERS,
  );
  papers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  papers.frustumCulled = false; // están repartidos por todo el tablero: la caja de la malla no vale
  papers.count = 0;
  papers.visible = false;
  scene.add(papers);
  const live = []; // { x, y, z, delay, speed, phase, freq, axis, spin, color, rest, yaw }
  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  const yawTurn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  // Llueve confeti en un círculo de `radius` alrededor de `center` ({x, z}): `count` papelitos de `colors`
  // que van saliendo durante `seconds` desde lo alto (entre `from` y `to` casillas de altura).
  function rain(center, { colors, radius = 3, count = 360, seconds = 2.5, from = 3.5, to = 6 } = {}) {
    for (let i = 0; i < count && live.length < MAX_PAPERS; i++) {
      const angle = random() * Math.PI * 2;
      const distance = radius * Math.sqrt(random());
      live.push({
        x: center.x + Math.cos(angle) * distance,
        y: from + random() * (to - from),
        z: center.z + Math.sin(angle) * distance,
        delay: random() * seconds,
        speed: FALL_SPEED * (0.7 + random() * 0.6),
        phase: random() * Math.PI * 2,
        freq: 2.5 + random() * 3,
        axis: new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize(),
        spin: (4 + random() * 7) * (random() < 0.5 ? -1 : 1),
        color: new THREE.Color(colors[Math.floor(random() * colors.length)]),
        age: 0,
        rest: -1, // segundos que lleva posado; -1 mientras cae
        yaw: random() * Math.PI * 2,
      });
    }
    papers.visible = true;
  }

  function stepPapers(dt) {
    let n = 0;
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i];
      if (p.delay > 0) {
        p.delay -= dt;
        continue;
      }
      p.age += dt;
      let size = 1;
      if (p.rest < 0) {
        // Cae aleteando: de lado y a vueltas, cada uno a su compás.
        p.y -= p.speed * dt;
        p.x += Math.cos(p.age * p.freq + p.phase) * FLUTTER * dt;
        p.z += Math.sin(p.age * p.freq * 0.7 + p.phase) * FLUTTER * 0.6 * dt;
        turn.setFromAxisAngle(p.axis, p.age * p.spin);
        if (p.y <= BOARD_Y) {
          p.y = BOARD_Y;
          p.rest = 0;
        }
      } else {
        // Posado en el tablero, plano; al cabo de un rato se va.
        p.rest += dt;
        yawTurn.setFromAxisAngle(up, p.yaw);
        turn.copy(yawTurn).multiply(flat);
        size = 1 - Math.max(0, p.rest - REST_SECONDS) / SHRINK_SECONDS;
        if (size <= 0) {
          live.splice(i, 1);
          continue;
        }
      }
      matrix.compose(at.set(p.x, p.y, p.z), turn, scale.setScalar(size));
      papers.setMatrixAt(n, matrix);
      papers.setColorAt(n, p.color);
      n += 1;
    }
    papers.count = n;
    papers.visible = n > 0;
    if (n > 0) {
      papers.instanceMatrix.needsUpdate = true;
      if (papers.instanceColor) papers.instanceColor.needsUpdate = true;
    }
  }

  // ---- Los fuegos artificiales ----
  const positions = new Float32Array(MAX_SPARKS * 3);
  const tints = new Float32Array(MAX_SPARKS * 3);
  const cloud = new THREE.BufferGeometry();
  cloud.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  cloud.setAttribute('color', new THREE.BufferAttribute(tints, 3).setUsage(THREE.DynamicDrawUsage));
  cloud.setDrawRange(0, 0);
  const sparks = new THREE.Points(cloud, new THREE.PointsMaterial({
    size: SPARK_SIZE,
    map: sparkTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // se suman a lo de detrás: se apagan bajando el color a negro
  }));
  sparks.frustumCulled = false;
  sparks.renderOrder = 10;
  scene.add(sparks);
  const glow = []; // { x, y, z, vx, vy, vz, life, age, r, g, b, twinkle }
  const rockets = []; // { from, to, age, colors, count, onBurst, trail }
  const flashes = [];
  const flashMap = sparkTexture();

  function spark(x, y, z, vx, vy, vz, life, tint, twinkle = false) {
    if (glow.length >= MAX_SPARKS) return;
    glow.push({ x, y, z, vx, vy, vz, life, age: 0, r: tint.r, g: tint.g, b: tint.b, twinkle });
  }

  // Un cohete que sube desde `from` (Vector3) `height` casillas, dejando estela, y revienta en una palmera
  // de `count` chispas de `colors`. `onBurst(at)`: al reventar (para el estampido).
  function firework(from, { colors, height = 3.5, count = 120, onBurst = null, delay = 0 } = {}) {
    const to = from.clone().add(new THREE.Vector3((random() - 0.5) * 0.8, height * (0.85 + random() * 0.3), (random() - 0.5) * 0.8));
    rockets.push({ from: from.clone(), to, age: -delay, colors, count, onBurst, trail: 0 });
  }

  function burst(at, colors, count) {
    for (let i = 0; i < count; i++) {
      // Repartidas por una esfera, todas a una velocidad parecida: una palmera redonda.
      const u = random() * 2 - 1;
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const speed = 2.5 + random() * 0.6;
      color.set(colors[i % colors.length]);
      spark(at.x, at.y, at.z, r * Math.cos(a) * speed, u * speed + 0.3, r * Math.sin(a) * speed, 1.3 + random() * 0.6, color, random() < 0.5);
    }
    const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flash.position.copy(at);
    flash.renderOrder = 10;
    scene.add(flash);
    flashes.push({ object: flash, age: 0 });
  }

  function stepFireworks(dt) {
    for (let i = rockets.length - 1; i >= 0; i--) {
      const rocket = rockets[i];
      rocket.age += dt;
      if (rocket.age < 0) continue;
      const k = Math.min(1, rocket.age / ROCKET_SECONDS);
      const ease = 1 - (1 - k) * (1 - k); // sale disparado y frena arriba
      at.lerpVectors(rocket.from, rocket.to, ease);
      // La estela: chispitas doradas que se quedan atrás y se apagan enseguida.
      rocket.trail += dt;
      while (rocket.trail > 0.012) {
        rocket.trail -= 0.012;
        color.set('#ffd27a');
        spark(at.x, at.y, at.z, (random() - 0.5) * 0.3, -0.3 - random() * 0.4, (random() - 0.5) * 0.3, 0.35 + random() * 0.2, color);
      }
      if (k >= 1) {
        rockets.splice(i, 1);
        burst(rocket.to, rocket.colors, rocket.count);
        rocket.onBurst?.(rocket.to.clone());
      }
    }
    let n = 0;
    for (let i = glow.length - 1; i >= 0; i--) {
      const s = glow[i];
      s.age += dt;
      if (s.age >= s.life) {
        glow.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-SPARK_DRAG * dt);
      s.vx *= drag;
      s.vy = s.vy * drag - SPARK_GRAVITY * dt;
      s.vz *= drag;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const k = s.age / s.life;
      // Se apagan al final, y las que titilan parpadean mientras caen.
      let light = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      if (s.twinkle && k > 0.35) light *= 0.45 + 0.55 * Math.abs(Math.sin(s.age * 31 + i));
      positions[n * 3] = s.x;
      positions[n * 3 + 1] = s.y;
      positions[n * 3 + 2] = s.z;
      tints[n * 3] = s.r * light;
      tints[n * 3 + 1] = s.g * light;
      tints[n * 3 + 2] = s.b * light;
      n += 1;
    }
    cloud.setDrawRange(0, n);
    cloud.attributes.position.needsUpdate = true;
    cloud.attributes.color.needsUpdate = true;
    sparks.visible = n > 0;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const flash = flashes[i];
      flash.age += dt;
      const k = flash.age / 0.35;
      if (k >= 1) {
        scene.remove(flash.object);
        flash.object.material.dispose();
        flashes.splice(i, 1);
        continue;
      }
      flash.object.scale.setScalar(0.4 + k * 1.6);
      flash.object.material.opacity = 1 - k;
    }
  }

  return {
    rain,
    firework,
    // ¿Queda algo en el aire o en el tablero?
    get active() {
      return live.length > 0 || glow.length > 0 || rockets.length > 0;
    },
    // Fuera todo de golpe (partida nueva).
    clear() {
      live.length = 0;
      glow.length = 0;
      rockets.length = 0;
      for (const flash of flashes) {
        scene.remove(flash.object);
        flash.object.material.dispose();
      }
      flashes.length = 0;
      papers.count = 0;
      papers.visible = false;
      cloud.setDrawRange(0, 0);
      sparks.visible = false;
    },
    update(dt) {
      if (live.length || papers.visible) stepPapers(dt);
      if (glow.length || rockets.length || flashes.length || sparks.visible) stepFireworks(dt);
    },
  };
}
