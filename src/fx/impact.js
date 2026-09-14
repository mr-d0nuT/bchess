import * as THREE from 'three';

// Efectos de dibujos animados del combate: destello con chispas en cada impacto y estrellitas
// de K.O. girando sobre la cabeza del vencido. Texturas dibujadas en canvas, sin ficheros.

const GRAVITY = 5;

function canvasTexture(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Estrella de cómic con puntas largas y cortas, blanca en el centro.
function drawBurst(g, size) {
  const c = size / 2;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? c * 0.98 : c * (i % 4 === 1 ? 0.3 : 0.45);
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath();
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, '#fff3a6');
  gradient.addColorStop(1, '#ffb21e');
  g.fillStyle = gradient;
  g.fill();
}

function drawSpark(g, size) {
  const c = size / 2;
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,214,90,0.9)');
  gradient.addColorStop(1, 'rgba(255,140,20,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
}

// Estrellita de K.O.: cinco puntas amarillas con borde marrón.
function drawKoStar(g, size) {
  const c = size / 2;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? c * 0.9 : c * 0.4;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffd93b';
  g.fill();
  g.lineWidth = size * 0.06;
  g.strokeStyle = '#7a4a00';
  g.stroke();
}

export function createImpactFx(scene) {
  const burstMap = canvasTexture(drawBurst);
  const sparkMap = canvasTexture(drawSpark, 64);
  const koMap = canvasTexture(drawKoStar);
  const live = []; // { object, life, age, step(k, dt, age) }

  function sprite(map, additive) {
    const object = new THREE.Sprite(new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    object.renderOrder = 10;
    scene.add(object);
    return object;
  }

  function add(object, life, step) {
    live.push({ object, life, age: 0, step });
  }

  // Destello de impacto en `position`, con `size` en casillas y `sparks` chispas.
  function burst(position, { size = 0.55, sparks = 14 } = {}) {
    const star = sprite(burstMap, true);
    star.position.copy(position);
    star.material.rotation = Math.random() * Math.PI;
    add(star, 0.28, (k) => {
      star.scale.setScalar(size * (0.35 + 0.65 * Math.sin((Math.min(1, k * 1.6) * Math.PI) / 2)));
      star.material.opacity = 1 - k * k;
    });
    for (let i = 0; i < sparks; i++) {
      const spark = sprite(sparkMap, true);
      spark.position.copy(position);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 2.2;
      const velocity = new THREE.Vector3(Math.cos(angle) * speed, 0.8 + Math.random() * 1.6, Math.sin(angle) * speed);
      const scale = 0.05 + Math.random() * 0.06;
      add(spark, 0.35 + Math.random() * 0.25, (k, dt) => {
        velocity.y -= GRAVITY * dt;
        spark.position.addScaledVector(velocity, dt);
        spark.scale.setScalar(scale * (1 - k));
        spark.material.opacity = 1 - k;
      });
    }
  }

  // Estrellitas girando sobre `bone` (normalmente la cabeza) durante `seconds`.
  function koStars(bone, { seconds = 1.2, count = 3 } = {}) {
    const center = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const star = sprite(koMap, false);
      const phase = (i / count) * Math.PI * 2;
      add(star, seconds, (k, dt, age) => {
        bone.getWorldPosition(center);
        const a = phase + age * 5;
        star.position.set(center.x + Math.cos(a) * 0.22, center.y + 0.22 + Math.sin(age * 9 + phase) * 0.03, center.z + Math.sin(a) * 0.22);
        star.scale.setScalar(0.11 * Math.min(1, age * 6) * (k > 0.8 ? (1 - k) * 5 : 1));
        star.material.rotation = age * 4 + phase;
      });
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const item = live[i];
      item.age += dt;
      const k = Math.min(1, item.age / item.life);
      item.step(k, dt, item.age);
      if (k >= 1) {
        scene.remove(item.object);
        item.object.material.dispose();
        live.splice(i, 1);
      }
    }
  }

  return { burst, koStars, update };
}
