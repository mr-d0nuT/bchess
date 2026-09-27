import * as THREE from 'three';

// Los efectos de los conjuros: lo que hace que un hechizo parezca un hechizo y no un fogonazo.
//
// Un destello suelto no cuenta nada. Un conjuro se lee cuando tiene las tres partes: se CARGA (algo
// crece y da vueltas en la punta del báculo o en la palma), se LANZA (una descarga va de quien lo
// echa a quien lo recibe) y ATERRIZA (el suelo se abre en ondas y al rival se lo llevan por los
// aires). Aquí está cada una por separado, para que cada pieza arme la suya.
//
// Todo dibujado en lienzo, sin ficheros, y sumando luz en vez de pintando encima (`AdditiveBlending`),
// que es lo que hace que el blanco del centro parezca que quema.

const ARRIBA = new THREE.Vector3(0, 1, 0);

function lienzo(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Un núcleo blanco que se apaga hacia fuera: sirve de brasa, de mota y de resplandor.
function dibujaBrasa(g, size) {
  const c = size / 2;
  const gradiente = g.createRadialGradient(c, c, 0, c, c, c);
  gradiente.addColorStop(0, 'rgba(255,255,255,1)');
  gradiente.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gradiente.addColorStop(0.55, 'rgba(255,255,255,0.28)');
  gradiente.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradiente;
  g.fillRect(0, 0, size, size);
}

// El aro del sello: un anillo con su filo brillante y sus muescas, como un reloj.
function dibujaSello(g, size) {
  const c = size / 2;
  g.clearRect(0, 0, size, size);
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = size * 0.02;
  g.beginPath(); g.arc(c, c, c * 0.92, 0, Math.PI * 2); g.stroke();
  g.lineWidth = size * 0.012;
  g.beginPath(); g.arc(c, c, c * 0.72, 0, Math.PI * 2); g.stroke();
  // Muescas alrededor, como las horas de una esfera.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const largo = i % 6 === 0 ? 0.16 : 0.07;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * c * 0.72, c + Math.sin(a) * c * 0.72);
    g.lineTo(c + Math.cos(a) * c * (0.72 + largo), c + Math.sin(a) * c * (0.72 + largo));
    g.stroke();
  }
  // Y una estrella de seis puntas dentro, de trazo fino.
  g.lineWidth = size * 0.01;
  for (const vuelta of [0, Math.PI / 3]) {
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = vuelta + (i / 3) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(c + Math.cos(a) * c * 0.66, c + Math.sin(a) * c * 0.66);
    }
    g.closePath();
    g.stroke();
  }
}

// La onda del suelo: un anillo con el borde de dentro afilado y el de fuera difuminado.
function dibujaOnda(g, size) {
  const c = size / 2;
  const gradiente = g.createRadialGradient(c, c, c * 0.62, c, c, c);
  gradiente.addColorStop(0, 'rgba(255,255,255,0)');
  gradiente.addColorStop(0.45, 'rgba(255,255,255,0.95)');
  gradiente.addColorStop(0.7, 'rgba(255,255,255,0.35)');
  gradiente.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradiente;
  g.fillRect(0, 0, size, size);
}

export function createSpellFx(scene) {
  const brasa = lienzo(dibujaBrasa, 128);
  const sello = lienzo(dibujaSello, 256);
  const onda = lienzo(dibujaOnda, 256);
  const vivos = []; // { object, life, age, step(k, dt, age) }

  const donde = (sitio, destino) => (typeof sitio === 'function' ? destino.copy(sitio()) : destino.copy(sitio));

  function mota(mapa, color) {
    const object = new THREE.Sprite(new THREE.SpriteMaterial({
      map: mapa,
      color: new THREE.Color(color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    object.renderOrder = 11;
    scene.add(object);
    return object;
  }

  function plano(mapa, color) {
    const object = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: mapa,
        color: new THREE.Color(color),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    object.renderOrder = 11;
    scene.add(object);
    return object;
  }

  function vive(object, life, step) {
    vivos.push({ object, life, age: 0, step });
    return object;
  }

  // 1. LA CARGA. En `at` (un punto o una función que lo devuelve, para que siga a la mano) crece un
  //    resplandor y unas motas le dan vueltas en espiral, cada vez más deprisa y más cerradas: la
  //    energía se está juntando ahí.
  function charge(at, { seconds = 1, color = '#8ec5ff', size = 0.42, motes = 10 } = {}) {
    const punto = new THREE.Vector3();
    const nucleo = mota(brasa, color);
    vive(nucleo, seconds, (k) => {
      donde(at, nucleo.position);
      const crece = k * k; // despacio al principio y de golpe al final
      nucleo.scale.setScalar(size * (0.15 + 0.85 * crece));
      nucleo.material.opacity = 0.35 + 0.65 * crece;
    });
    for (let i = 0; i < motes; i++) {
      const chispa = mota(brasa, color);
      const fase = (i / motes) * Math.PI * 2;
      const altura = (Math.random() - 0.5) * size * 1.6;
      vive(chispa, seconds, (k, dt, age) => {
        donde(at, punto);
        const radio = size * 2.2 * (1 - k * 0.92); // la espiral se cierra sobre el núcleo
        const giro = fase + age * (5 + 9 * k);
        chispa.position.set(
          punto.x + Math.cos(giro) * radio,
          punto.y + altura * (1 - k),
          punto.z + Math.sin(giro) * radio,
        );
        chispa.scale.setScalar(size * 0.3 * (0.4 + 0.6 * k));
        chispa.material.opacity = Math.min(1, k * 3);
      });
    }
    return nucleo;
  }

  // 2. EL SELLO. Un aro de runas tumbado en el suelo que gira y se abre. Debajo de quien lanza,
  //    dice que está invocando; debajo de quien lo recibe, que está sentenciado.
  function sigil(at, { radius = 0.6, seconds = 1.2, color = '#8ec5ff', spin = 1.6, tilt = 0 } = {}) {
    const aro = plano(sello, color);
    const punto = new THREE.Vector3();
    donde(at, punto);
    aro.rotation.x = -Math.PI / 2 + tilt;
    vive(aro, seconds, (k, dt, age) => {
      donde(at, punto);
      aro.position.set(punto.x, punto.y + 0.012, punto.z);
      const abre = Math.min(1, k * 4); // se abre de golpe y luego solo gira
      aro.scale.setScalar(radius * 2 * (0.2 + 0.8 * abre));
      aro.rotation.z = age * spin;
      aro.material.opacity = k < 0.7 ? 0.85 * abre : 0.85 * (1 - (k - 0.7) / 0.3);
    });
    return aro;
  }

  // 3. LA DESCARGA. Un rayo quebrado de `from` a `to`, que se vuelve a quebrar cada poco: quieto
  //    parece un palo, y lo que lo hace rayo es que no para de cambiar.
  function bolt(from, to, { seconds = 0.35, color = '#cfe6ff', width = 0.06, kinks = 7 } = {}) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    donde(from, a);
    donde(to, b);
    const puntos = new Float32Array((kinks + 1) * 3);
    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(puntos, 3));
    const rayo = new THREE.Line(geometria, new THREE.LineBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    rayo.renderOrder = 12;
    scene.add(rayo);
    const lado = new THREE.Vector3();
    const arriba = new THREE.Vector3();
    let siguiente = 0;
    vive(rayo, seconds, (k, dt, age) => {
      donde(from, a);
      donde(to, b);
      if (age >= siguiente) {
        siguiente = age + 0.035; // se requiebra 28 veces por segundo
        lado.subVectors(b, a).normalize().cross(ARRIBA).normalize();
        arriba.subVectors(b, a).normalize().cross(lado).normalize();
        for (let i = 0; i <= kinks; i++) {
          const t = i / kinks;
          const desvio = i === 0 || i === kinks ? 0 : (Math.random() - 0.5) * width * 8;
          const desvio2 = i === 0 || i === kinks ? 0 : (Math.random() - 0.5) * width * 8;
          puntos[i*3] = a.x + (b.x - a.x) * t + lado.x * desvio + arriba.x * desvio2;
          puntos[i*3+1] = a.y + (b.y - a.y) * t + lado.y * desvio + arriba.y * desvio2;
          puntos[i*3+2] = a.z + (b.z - a.z) * t + lado.z * desvio + arriba.z * desvio2;
        }
        geometria.attributes.position.needsUpdate = true;
      }
      rayo.material.opacity = 1 - k * k;
    });
    return rayo;
  }

  // 4. LA ONDA. Un anillo que se abre por el suelo desde `at`. Es lo que convierte un golpe en un
  //    golpe que se ha sentido en todo el tablero.
  function shockwave(at, { radius = 2.2, seconds = 0.5, color = '#ffe7b0' } = {}) {
    const anillo = plano(onda, color);
    const punto = new THREE.Vector3();
    donde(at, punto);
    anillo.rotation.x = -Math.PI / 2;
    anillo.position.set(punto.x, punto.y + 0.01, punto.z);
    vive(anillo, seconds, (k) => {
      const abre = Math.sqrt(k); // rápida al salir y frenando, como una onda de verdad
      anillo.scale.setScalar(radius * 2 * abre);
      anillo.material.opacity = (1 - k) * 0.9;
    });
    return anillo;
  }

  // 5. LO QUE SE LO LLEVA. Motas que suben en espiral alrededor de `at`: el rival deshaciéndose
  //    hacia arriba, como ceniza que tira para el cielo.
  function updraft(at, { seconds = 1, count = 26, color = '#cfe6ff', radius = 0.4, height = 2 } = {}) {
    const punto = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const chispa = mota(brasa, color);
      const fase = Math.random() * Math.PI * 2;
      const tarda = Math.random() * 0.35;
      const sube = height * (0.6 + Math.random() * 0.6);
      const ancho = radius * (0.5 + Math.random() * 0.8);
      vive(chispa, seconds, (k, dt, age) => {
        donde(at, punto);
        const t = Math.max(0, Math.min(1, (k - tarda) / (1 - tarda)));
        const giro = fase + t * 7;
        chispa.position.set(
          punto.x + Math.cos(giro) * ancho * (1 - t * 0.5),
          punto.y + sube * t,
          punto.z + Math.sin(giro) * ancho * (1 - t * 0.5),
        );
        chispa.scale.setScalar(0.1 * (1 - t * 0.7));
        chispa.material.opacity = t <= 0 ? 0 : Math.min(1, t * 4) * (1 - t);
      });
    }
  }

  // EL HIELO. Nada de rayos: el frío se arrastra por el suelo, trepa por el rival hasta encerrarlo en
  // cristal y luego se rompe con él dentro. Los cristales son pirámides de seis caras, finas y
  // translúcidas, con un brillo propio del color de quien conjura: así se leen como hielo de lejos.
  function cristal(color) {
    const geometry = new THREE.CylinderGeometry(0, 1, 1, 6, 1);
    geometry.translate(0, 0.5, 0); // la base en el origen: crece hacia arriba
    const tono = new THREE.Color(color);
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: tono.clone().lerp(new THREE.Color('#ffffff'), 0.5),
      emissive: tono,
      emissiveIntensity: 0.4,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      flatShading: true,
    }));
    object.renderOrder = 10;
    scene.add(object);
    return object;
  }
  const crece = (t) => 1 - (1 - t) ** 3;

  // La escarcha: de `from` a `to` (puntos del suelo) brotan cristalitos al paso de un frente que tarda
  // `reach` de la vida en llegar, con vaho frío por encima. Se funden al final.
  function frost(from, to, { seconds = 1.6, reach = 0.35, color = '#bfe6ff', count = 28 } = {}) {
    const a = new THREE.Vector3().copy(from).setY(0);
    const b = new THREE.Vector3().copy(to).setY(0);
    const lado = new THREE.Vector3().subVectors(b, a).cross(ARRIBA).normalize();
    for (let i = 0; i < count; i++) {
      const t = (i + Math.random()) / count;
      const hielo = cristal(color);
      hielo.position.copy(a).lerp(b, t).addScaledVector(lado, (Math.random() - 0.5) * 0.3);
      hielo.rotation.set((Math.random() - 0.5) * 0.9, Math.random() * Math.PI, (Math.random() - 0.5) * 0.9);
      const alto = 0.06 + Math.random() * 0.12;
      const grueso = 0.018 + Math.random() * 0.022;
      vive(hielo, seconds, (k) => {
        const g = Math.max(0, Math.min(1, (k - t * reach) / 0.06));
        hielo.scale.set(grueso * crece(g), alto * crece(g), grueso * crece(g));
        hielo.material.opacity = 0.68 * (k > 0.8 ? (1 - k) / 0.2 : 1);
      });
    }
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const vaho = mota(brasa, color);
      const sitio = new THREE.Vector3().copy(a).lerp(b, t).setY(0.08);
      vive(vaho, seconds, (k) => {
        const g = Math.max(0, Math.min(1, (k - t * reach) / 0.1));
        vaho.position.copy(sitio).setY(0.08 + 0.12 * k);
        vaho.scale.setScalar(0.35 + 0.25 * g);
        vaho.material.opacity = 0.35 * g * (1 - k);
      });
    }
  }

  // El bloque: cristales que crecen alrededor de `at` (los pies del rival), de abajo arriba, hasta
  // `height`, y un prisma de hielo que lo envuelve. Devuelve `shatter()`, que lo rompe en esquirlas
  // que salen despedidas y caen. Hasta que se rompe, se queda.
  function encase(at, { height = 1.6, radius = 0.3, seconds = 0.8, color = '#bfe6ff', count = 22 } = {}) {
    const pie = new THREE.Vector3().copy(at).setY(0);
    const piezas = [];
    const bloque = cristal(color);
    bloque.geometry.dispose();
    bloque.geometry = new THREE.CylinderGeometry(radius, radius * 1.12, 1, 6, 1).translate(0, 0.5, 0);
    bloque.material.opacity = 0.32;
    bloque.position.copy(pie);
    bloque.scale.set(1, 0.001, 1);
    piezas.push(bloque);
    const estado = { edad: 0, roto: false };
    vive(bloque, 3600, (k, dt) => {
      if (estado.roto) return;
      estado.edad += dt;
      bloque.scale.y = height * crece(Math.min(1, estado.edad / seconds));
    });
    for (let i = 0; i < count; i++) {
      const hielo = cristal(color);
      const angulo = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const altura = Math.random() * height * 0.85;
      const r = radius * (0.85 + Math.random() * 0.25);
      hielo.position.set(pie.x + Math.cos(angulo) * r, altura, pie.z + Math.sin(angulo) * r);
      // Hacia fuera y hacia arriba, más echados cuanto más altos.
      const echa = 0.35 + (altura / height) * 0.6;
      hielo.lookAt(pie.x + Math.cos(angulo) * (r + 1), altura + 1 / Math.tan(echa), pie.z + Math.sin(angulo) * (r + 1));
      hielo.rotateX(Math.PI / 2);
      const largo = (altura < 0.1 ? 0.35 : 0.18) + Math.random() * 0.25;
      const grueso = 0.035 + Math.random() * 0.04;
      const cuando = (altura / height) * 0.75;
      hielo.scale.setScalar(0.001);
      piezas.push(hielo);
      vive(hielo, 3600, () => {
        if (estado.roto) return;
        const g = Math.max(0, Math.min(1, (estado.edad / seconds - cuando) / 0.25));
        hielo.scale.set(grueso * crece(g), largo * crece(g), grueso * crece(g));
      });
    }
    return {
      // Se rompe: cada cristal y el bloque se van en esquirlas hacia fuera, girando, y caen.
      shatter({ shards = 70 } = {}) {
        estado.roto = true;
        const donde = new THREE.Vector3();
        for (const pieza of piezas) {
          pieza.visible = false;
          const item = vivos.find((v) => v.object === pieza);
          if (item) item.life = item.age; // fuera en el próximo fotograma
        }
        for (let i = 0; i < shards; i++) {
          const esquirla = cristal(color);
          const angulo = Math.random() * Math.PI * 2;
          donde.set(pie.x + Math.cos(angulo) * radius * Math.random(), Math.random() * height, pie.z + Math.sin(angulo) * radius * Math.random());
          esquirla.position.copy(donde);
          esquirla.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
          const tam = 0.03 + Math.random() * 0.06;
          esquirla.scale.set(tam * 0.6, tam * 1.6, tam * 0.6);
          const fuerza = 1.2 + Math.random() * 2.2;
          const velocidad = new THREE.Vector3(Math.cos(angulo) * fuerza, 0.8 + Math.random() * 2.4, Math.sin(angulo) * fuerza);
          const giro = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
          vive(esquirla, 0.9 + Math.random() * 0.5, (k, dt) => {
            velocidad.y -= 7 * dt;
            esquirla.position.addScaledVector(velocidad, dt);
            if (esquirla.position.y < 0.02) {
              esquirla.position.y = 0.02;
              velocidad.multiplyScalar(0.35);
              velocidad.y = Math.abs(velocidad.y) * 0.3;
            }
            esquirla.rotation.x += giro.x * dt;
            esquirla.rotation.y += giro.y * dt;
            esquirla.rotation.z += giro.z * dt;
            esquirla.material.opacity = 0.75 * (k > 0.6 ? (1 - k) / 0.4 : 1);
          });
        }
      },
    };
  }

  function update(dt) {
    for (let i = vivos.length - 1; i >= 0; i--) {
      const item = vivos[i];
      item.age += dt;
      const k = Math.min(1, item.age / item.life);
      item.step(k, dt, item.age);
      if (k >= 1) {
        scene.remove(item.object);
        item.object.material.dispose();
        item.object.geometry?.dispose?.();
        vivos.splice(i, 1);
      }
    }
  }

  return { charge, sigil, bolt, shockwave, updraft, frost, encase, update };
}
