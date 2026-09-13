import * as THREE from 'three';

// Nube de polvo de dibujos animados: bolas blandas que se hinchan, suben un poco y se
// desvanecen. La textura se dibuja en un canvas, sin ficheros.

let puffTexture = null;

function texture() {
  if (puffTexture) return puffTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,248,235,1)');
  gradient.addColorStop(0.55, 'rgba(236,224,204,0.85)');
  gradient.addColorStop(1, 'rgba(236,224,204,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

export function createDust(scene) {
  const active = [];

  function puff(position, { count = 9, radius = 0.45, duration = 0.4 } = {}) {
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(), transparent: true, depthWrite: false }));
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const distance = radius * (0.35 + Math.random() * 0.4);
      sprite.position.set(
        position.x + Math.cos(angle) * distance,
        position.y + 0.1 + Math.random() * 0.25,
        position.z + Math.sin(angle) * distance,
      );
      sprite.userData = {
        age: 0,
        duration: duration * (0.8 + Math.random() * 0.4),
        from: 0.25 + Math.random() * 0.15,
        to: 0.7 + Math.random() * 0.35,
        drift: new THREE.Vector3(Math.cos(angle) * 0.6, 0.5 + Math.random() * 0.3, Math.sin(angle) * 0.6),
      };
      sprite.scale.setScalar(sprite.userData.from);
      scene.add(sprite);
      active.push(sprite);
    }
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const sprite = active[i];
      const u = sprite.userData;
      u.age += dt;
      const t = Math.min(1, u.age / u.duration);
      const eased = 1 - (1 - t) ** 3;
      sprite.scale.setScalar(u.from + (u.to - u.from) * eased);
      sprite.position.addScaledVector(u.drift, dt * (1 - t));
      sprite.material.opacity = 1 - t * t;
      if (t >= 1) {
        scene.remove(sprite);
        sprite.material.dispose();
        active.splice(i, 1);
      }
    }
  }

  return { puff, update };
}
