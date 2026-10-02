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

// Una llama: una gota con la punta hacia arriba, blanca y amarilla abajo, donde quema, naranja en
// medio y roja en el filo, que se apaga hacia la punta. Se tiñe luego del color que toque.
function dibujaLlama(g, size) {
  const c = size / 2;
  g.clearRect(0, 0, size, size);
  const forma = () => {
    g.beginPath();
    g.moveTo(c, size * 0.04); // la punta
    g.bezierCurveTo(c + size * 0.12, size * 0.3, c + size * 0.36, size * 0.5, c + size * 0.3, size * 0.72);
    g.bezierCurveTo(c + size * 0.24, size * 0.92, c - size * 0.24, size * 0.92, c - size * 0.3, size * 0.72);
    g.bezierCurveTo(c - size * 0.36, size * 0.5, c - size * 0.12, size * 0.3, c, size * 0.04);
    g.closePath();
  };
  const fuego = g.createRadialGradient(c, size * 0.72, 0, c, size * 0.62, size * 0.62);
  fuego.addColorStop(0, 'rgba(255,255,235,1)');
  fuego.addColorStop(0.18, 'rgba(255,236,150,0.98)');
  fuego.addColorStop(0.42, 'rgba(255,150,40,0.85)');
  fuego.addColorStop(0.7, 'rgba(230,60,10,0.45)');
  fuego.addColorStop(1, 'rgba(160,20,0,0)');
  g.fillStyle = fuego;
  g.filter = `blur(${Math.round(size * 0.02)}px)`;
  forma();
  g.fill();
  g.filter = 'none';
}

// Humo y ceniza: una bola blanda, que se tiñe de gris al usarla y se pinta encima (no sumando luz),
// porque el humo tapa, no brilla.
function dibujaHumo(g, size) {
  const c = size / 2;
  const gradiente = g.createRadialGradient(c, c, 0, c, c, c);
  gradiente.addColorStop(0, 'rgba(255,255,255,0.75)');
  gradiente.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gradiente.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradiente;
  g.fillRect(0, 0, size, size);
}

// Una bola de nubarrón de dibujo animado: redonda, de borde casi limpio, clara arriba a la izquierda y
// oscura abajo, que es lo que le da volumen. Varias, montadas unas sobre otras, hacen la nube de tormenta.
function dibujaNubarron(g, size) {
  const c = size / 2;
  const luz = g.createRadialGradient(c * 0.72, c * 0.62, 0, c, c, c);
  luz.addColorStop(0, 'rgba(255,255,255,1)');
  luz.addColorStop(0.45, 'rgba(196,200,210,1)');
  luz.addColorStop(0.8, 'rgba(118,122,136,1)');
  luz.addColorStop(0.92, 'rgba(92,96,110,0.95)');
  luz.addColorStop(1, 'rgba(92,96,110,0)');
  g.fillStyle = luz;
  g.beginPath();
  g.arc(c, c, c, 0, Math.PI * 2);
  g.fill();
}

export function createSpellFx(scene) {
  const brasa = lienzo(dibujaBrasa, 128);
  const llama = lienzo(dibujaLlama, 128);
  const humo = lienzo(dibujaHumo, 64);
  const nubarron = lienzo(dibujaNubarron, 128);
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
    object.scale.setScalar(0.001); // hasta su primer paso: si nace dentro de `update`, se pintaba un fotograma a tamaño 1
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

  // Como `mota`, pero pintada encima en vez de sumando luz: para el humo y la ceniza.
  function nube(color) {
    const object = new THREE.Sprite(new THREE.SpriteMaterial({
      map: humo,
      color: new THREE.Color(color),
      transparent: true,
      depthWrite: false,
    }));
    object.renderOrder = 10;
    object.scale.setScalar(0.001);
    scene.add(object);
    return object;
  }

  function vive(object, life, step) {
    vivos.push({ object, life, age: 0, step });
    return object;
  }

  // Acaba ya con lo que vive en `object`: se quita en el próximo fotograma.
  function acaba(object) {
    const item = vivos.find((v) => v.object === object);
    if (item) item.life = Math.min(item.life, item.age);
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

  // EL HIELO. El frío se arrastra por el suelo en una ola de picos, trepa por el rival hasta encerrarlo en un
  // racimo de cristal y luego se rompe con él dentro. Los cristales son columnas de seis caras que se
  // afinan hacia la punta, translúcidas, con un brillo propio del color de quien conjura y el reflejo del
  // entorno: así se leen como hielo de lejos. (Antes el rayo era un reguero de cristalitos que no se veía y
  // el encierro, un cilindro gris como de plástico.)
  function cristal(color, { punta = 0 } = {}) {
    const geometry = new THREE.CylinderGeometry(punta, 1, 1, 6, 1);
    geometry.translate(0, 0.5, 0); // la base en el origen: crece hacia arriba
    const tono = new THREE.Color(color);
    const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: tono.clone().lerp(new THREE.Color('#ffffff'), 0.3),
      emissive: tono,
      emissiveIntensity: 0.42,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      flatShading: true,
    }));
    object.renderOrder = 10;
    scene.add(object);
    return object;
  }
  const crece = (t) => 1 - (1 - t) ** 3;
  // Crece pasándose un poco y vuelve: el hielo brota de golpe.
  const brota = (t) => (t >= 1 ? 1 : 1 - (1 - t) ** 3 + Math.sin(Math.PI * t) * 0.18);

  // Esquirlas que saltan de `pieza` (un cristal ya puesto) hacia fuera, girando, y caen.
  function esquirlas(donde, { count = 3, color, size = 0.05, fuerza = 2 } = {}) {
    for (let i = 0; i < count; i++) {
      const esquirla = cristal(color);
      const angulo = Math.random() * Math.PI * 2;
      esquirla.position.copy(donde);
      esquirla.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      const tam = size * (0.5 + Math.random());
      esquirla.scale.set(tam * 0.6, tam * 1.7, tam * 0.6);
      const empuje = fuerza * (0.5 + Math.random());
      const velocidad = new THREE.Vector3(Math.cos(angulo) * empuje, 0.8 + Math.random() * 2.4, Math.sin(angulo) * empuje);
      const giro = new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      vive(esquirla, 0.9 + Math.random() * 0.6, (k, dt) => {
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
        esquirla.material.opacity = 0.7 * (k > 0.6 ? (1 - k) / 0.4 : 1);
      });
    }
  }

  // EL RAYO DE HIELO. De `from` a `to` (por el suelo), en `seconds`, corre un frente que hace brotar
  // racimos de picos, cada vez más altos según se acerca al rival, con una estela de luz y vaho frío por
  // encima. Los picos se quedan hasta `life`, o hasta que `shatter()` los hace añicos.
  function iceRay(from, to, { seconds = 0.6, life = 4, color = '#bfe6ff', count = 20 } = {}) {
    const a = new THREE.Vector3().copy(from).setY(0);
    const b = new THREE.Vector3().copy(to).setY(0);
    const largo = Math.max(0.01, a.distanceTo(b));
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const lado = new THREE.Vector3().crossVectors(dir, ARRIBA).normalize();
    const estado = { edad: 0, roto: false };
    const picos = [];
    // La estela: una franja de luz por el suelo que se alarga con el frente y luego se apaga.
    const estela = plano(brasa, color);
    estela.geometry.dispose();
    estela.geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    estela.position.copy(a).setY(0.015);
    estela.rotation.y = Math.atan2(-dir.x, -dir.z);
    vive(estela, life, (k, dt, age) => {
      const llega = Math.min(1, age / seconds);
      estela.scale.set(0.5, 1, largo * llega);
      estela.material.opacity = (age < seconds ? 0.9 : Math.max(0, 0.9 - (age - seconds) * 0.5)) * (1 - k * k);
    });
    // El frente: un resplandor que corre a ras de suelo, con vaho que se levanta a su paso.
    const frente = mota(brasa, '#ffffff');
    vive(frente, seconds + 0.15, (k, dt, age) => {
      const t = Math.min(1, age / seconds);
      frente.position.copy(a).addScaledVector(dir, largo * t).setY(0.18);
      frente.scale.setScalar(0.55 + Math.random() * 0.2);
      frente.material.opacity = age < seconds ? 1 : Math.max(0, 1 - (age - seconds) / 0.15);
    });
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const vaho = nube('#eaf7ff');
      const sitio = new THREE.Vector3().copy(a).addScaledVector(dir, largo * t);
      vive(vaho, 1.4, (k, dt, age) => {
        const g = Math.max(0, Math.min(1, (age - t * seconds) / 0.3));
        vaho.position.copy(sitio).setY(0.1 + 0.35 * g);
        vaho.scale.setScalar(0.3 + 0.4 * g);
        vaho.material.opacity = 0.32 * g * (1 - k);
      });
    }
    // Los picos: racimos de dos o tres, inclinados hacia delante y hacia fuera, más grandes al final.
    for (let i = 0; i < count; i++) {
      const t = (i + 0.3 + Math.random() * 0.5) / count;
      const racimo = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < racimo; j++) {
        const pico = cristal(color);
        const fuera = (Math.random() - 0.5) * (0.18 + 0.3 * t);
        pico.position.copy(a).addScaledVector(dir, largo * t).addScaledVector(lado, fuera);
        const alto = 0.12 + 0.5 * t ** 1.4 + Math.random() * 0.12;
        const grueso = 0.035 + 0.05 * t + Math.random() * 0.02;
        // Hacia delante (hacia el rival) y hacia el lado en que queda.
        const inclina = new THREE.Vector3().copy(dir).multiplyScalar(0.45).addScaledVector(lado, Math.sign(fuera) * 0.5).add(ARRIBA).normalize();
        pico.quaternion.setFromUnitVectors(ARRIBA, inclina);
        pico.rotateY(Math.random() * Math.PI);
        pico.scale.setScalar(0.001);
        picos.push(pico);
        vive(pico, life, (k, dt, age) => {
          if (estado.roto) return;
          const g = Math.max(0, Math.min(1, (age - t * seconds) / 0.14));
          const s = brota(g);
          pico.scale.set(grueso * s, alto * s, grueso * s);
          if (k > 0.85) pico.material.opacity = 0.62 * (1 - k) / 0.15; // si nadie los rompe, se funden
        });
      }
    }
    return {
      shatter() {
        if (estado.roto) return;
        estado.roto = true;
        const donde2 = new THREE.Vector3();
        for (const pico of picos) {
          pico.visible = false;
          const item = vivos.find((v) => v.object === pico);
          if (item) item.life = item.age;
          esquirlas(donde2.copy(pico.position).setY(0.05 + pico.scale.y * 0.5), { count: 2, color, size: 0.04 + pico.scale.x * 0.4, fuerza: 1.2 });
        }
      },
    };
  }

  // El encierro: un racimo de columnas de cristal que brotan alrededor de `at` (los pies del rival), de
  // abajo arriba, abriéndose hacia fuera, con un prisma de hielo tenue dentro que lo envuelve y una corona
  // de picos por el suelo. Devuelve `shatter()`, que lo rompe en esquirlas. Hasta que se rompe, se queda.
  function encase(at, { height = 1.6, radius = 0.3, seconds = 0.8, color = '#bfe6ff', count = 11 } = {}) {
    const pie = new THREE.Vector3().copy(at).setY(0);
    const piezas = [];
    const estado = { edad: 0, roto: false };
    const bloque = cristal(color, { punta: 0.35 }); // en punta: con la tapa plana asomaba como una caja
    bloque.material.opacity = 0.12;
    bloque.material.emissiveIntensity = 0.8;
    bloque.position.copy(pie);
    bloque.scale.set(radius * 1.02, 0.001, radius * 1.02);
    piezas.push(bloque);
    vive(bloque, 3600, (k, dt) => {
      if (estado.roto) return;
      estado.edad += dt;
      bloque.scale.y = height * 0.92 * crece(Math.min(1, estado.edad / seconds));
    });
    // Las columnas, alrededor, abriéndose hacia fuera y cada una de su alto.
    for (let i = 0; i < count; i++) {
      const columna = cristal(color, { punta: 0.4 });
      const angulo = (i / count) * Math.PI * 2 + Math.random() * 0.35;
      const r = radius * (0.55 + Math.random() * 0.35);
      columna.position.set(pie.x + Math.cos(angulo) * r, 0, pie.z + Math.sin(angulo) * r);
      const abre = 0.12 + Math.random() * 0.22;
      const eje = new THREE.Vector3(Math.cos(angulo) * Math.sin(abre), Math.cos(abre), Math.sin(angulo) * Math.sin(abre));
      columna.quaternion.setFromUnitVectors(ARRIBA, eje);
      columna.rotateY(Math.random() * Math.PI);
      const alto = height * (0.55 + Math.random() * 0.6);
      const grueso = radius * (0.22 + Math.random() * 0.18);
      const cuando = Math.random() * 0.3;
      columna.scale.setScalar(0.001);
      piezas.push(columna);
      vive(columna, 3600, () => {
        if (estado.roto) return;
        const g = Math.max(0, Math.min(1, (estado.edad / seconds - cuando) / 0.55));
        const s = brota(g);
        columna.scale.set(grueso * s, alto * crece(g), grueso * s);
      });
    }
    // Y la corona de picos por el suelo, hacia fuera.
    for (let i = 0; i < 12; i++) {
      const pico = cristal(color);
      const angulo = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
      const r = radius * (1 + Math.random() * 0.3);
      pico.position.set(pie.x + Math.cos(angulo) * r, 0, pie.z + Math.sin(angulo) * r);
      const eje = new THREE.Vector3(Math.cos(angulo) * 0.7, 0.7, Math.sin(angulo) * 0.7).normalize();
      pico.quaternion.setFromUnitVectors(ARRIBA, eje);
      const alto = 0.14 + Math.random() * 0.18;
      const grueso = 0.035 + Math.random() * 0.03;
      pico.scale.setScalar(0.001);
      piezas.push(pico);
      vive(pico, 3600, () => {
        if (estado.roto) return;
        const g = Math.max(0, Math.min(1, estado.edad / (seconds * 0.4)));
        const s = brota(g);
        pico.scale.set(grueso * s, alto * s, grueso * s);
      });
    }
    return {
      // Se rompe: cada cristal salta en esquirlas, hacia fuera, girando, y caen.
      shatter({ shards = 90 } = {}) {
        estado.roto = true;
        for (const pieza of piezas) {
          pieza.visible = false;
          const item = vivos.find((v) => v.object === pieza);
          if (item) item.life = item.age; // fuera en el próximo fotograma
        }
        const donde2 = new THREE.Vector3();
        for (let i = 0; i < shards; i++) {
          const angulo = Math.random() * Math.PI * 2;
          donde2.set(pie.x + Math.cos(angulo) * radius * Math.random(), Math.random() * height, pie.z + Math.sin(angulo) * radius * Math.random());
          esquirlas(donde2, { count: 1, color, size: 0.06, fuerza: 2.2 });
        }
      },
    };
  }

  // Nieve que cae despacio, meciéndose, alrededor de `at`.
  function snow(at, { seconds = 2.2, count = 45, radius = 1.2, height = 2.4 } = {}) {
    const centro = new THREE.Vector3().copy(at);
    for (let i = 0; i < count; i++) {
      const copo = mota(brasa, '#ffffff');
      const angulo = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      const x = centro.x + Math.cos(angulo) * r;
      const z = centro.z + Math.sin(angulo) * r;
      const arriba = height * (0.5 + Math.random() * 0.5);
      const fase = Math.random() * Math.PI * 2;
      const tam = 0.04 + Math.random() * 0.05;
      vive(copo, seconds * (0.7 + Math.random() * 0.3), (k, dt, age) => {
        copo.position.set(x + Math.sin(fase + age * 2.2) * 0.12, Math.max(0.02, arriba * (1 - k)), z + Math.cos(fase + age * 1.7) * 0.12);
        copo.scale.setScalar(tam);
        copo.material.opacity = Math.min(1, k * 6) * (1 - k * k);
      });
    }
  }

  // EL FUEGO. Lo de la reina negra, que con el hielo no pegaba: el rojo de su bando es el del fuego.
  // Las llamas son gotas que nacen abajo, suben encogiendo y temblando y se apagan en la punta; lo
  // que hace que parezcan fuego y no chispas es que nunca paran de relevarse unas a otras.
  const FUEGO = '#ffffff'; // la llama ya viene pintada con su color; se tiñe solo para matizarla

  // Llamas en `at` (un punto o una función, para que sigan a la mano) durante `seconds`: un fuego
  // pequeño que crece según se acerca el final, como la carga.
  function flame(at, { seconds = 1, size = 0.3, count = 7, color = FUEGO } = {}) {
    const punto = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const lengua = mota(llama, color);
      const fase = i / count;
      const ciclo = 0.32 + Math.random() * 0.18;
      const lado = (Math.random() - 0.5) * size * 0.5;
      vive(lengua, seconds, (k, dt, age) => {
        donde(at, punto);
        const t = ((age / ciclo) + fase) % 1; // cada lengua nace, sube y se apaga, una y otra vez
        const crece = 0.45 + 0.55 * k;
        lengua.position.set(punto.x + lado * (1 - t), punto.y + size * 0.15 + t * size * 0.9 * crece, punto.z);
        lengua.scale.set(size * 0.55 * crece * (1 - t * 0.5), size * crece * (1 - t * 0.35), 1);
        lengua.material.opacity = Math.min(1, k * 4) * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8);
        lengua.material.rotation = Math.sin(age * 13 + i) * 0.18;
      });
    }
  }

  // Una bola de fuego de `from` a `to` en `seconds`, en un arco de `arc` de alto, con una estela de
  // brasas que se quedan atrás cayendo y humo.
  function fireball(from, to, { seconds = 0.45, size = 0.34, arc = 0.35, color = FUEGO } = {}) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    donde(from, a);
    donde(to, b);
    const bola = mota(brasa, '#ffd27a');
    const cola = mota(llama, color);
    const ultimo = new THREE.Vector3().copy(a);
    const rumbo = new THREE.Vector3();
    vive(bola, seconds, (k, dt, age) => {
      const x = a.x + (b.x - a.x) * k;
      const z = a.z + (b.z - a.z) * k;
      const y = a.y + (b.y - a.y) * k + Math.sin(Math.PI * k) * arc;
      bola.position.set(x, y, z);
      bola.scale.setScalar(size * (0.8 + 0.2 * Math.sin(age * 40)));
      rumbo.set(x, y, z).sub(ultimo);
      ultimo.set(x, y, z);
      // La llama de la cola va detrás de la bola, a donde viene.
      cola.position.set(x, y, z).addScaledVector(rumbo.normalize(), -size * 0.35);
      cola.scale.set(size * 1.1, size * 1.6, 1);
      cola.material.rotation = Math.atan2(rumbo.x, rumbo.y) + Math.PI; // la punta hacia atrás
      // Brasas que se desprenden y caen.
      if (Math.random() < 0.8) {
        const chispa = mota(brasa, '#ff9a3a');
        const cae = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
        chispa.position.set(x, y, z);
        vive(chispa, 0.35 + Math.random() * 0.3, (kk, dd) => {
          cae.y -= 3 * dd;
          chispa.position.addScaledVector(cae, dd);
          chispa.scale.setScalar(0.06 * (1 - kk));
          chispa.material.opacity = 1 - kk;
        });
      }
    });
    vive(cola, seconds, () => {});
  }

  // La hoguera: llamas que envuelven `at` (los pies del rival) hasta `height`, en un tubo de
  // `radius`, durante `seconds`; entran de golpe y se apagan al final. Con brasas que suben, un
  // resplandor en el suelo y humo por encima.
  function blaze(at, { height = 1.6, radius = 0.35, seconds = 1.4, count = 48, color = FUEGO } = {}) {
    const pie = new THREE.Vector3().copy(at).setY(0);
    const vida = (k) => Math.min(1, k / 0.1) * (k > 0.75 ? (1 - k) / 0.25 : 1);
    const talla = height / 1.6; // las llamas, a la medida de quien arde: un gigante arde a lo grande
    for (let i = 0; i < count; i++) {
      const lengua = mota(llama, color);
      const fase = Math.random();
      const ciclo = 0.3 + Math.random() * 0.3;
      const angulo = Math.random() * Math.PI * 2;
      const r = radius * (0.35 + 0.65 * Math.sqrt(Math.random()));
      // Cada lengua nace a una altura del cuerpo y sube un trecho: así arde entero, no solo los pies.
      const nace = height * 0.72 * Math.random() ** 1.3;
      const sube = height * (0.3 + Math.random() * 0.25);
      const grande = (0.4 + Math.random() * 0.45) * talla;
      vive(lengua, seconds, (k, dt, age) => {
        const t = ((age / ciclo) + fase) % 1;
        const v = vida(k);
        const cierra = 1 - t * 0.5; // subiendo, se cierran hacia el cuerpo
        lengua.position.set(pie.x + Math.cos(angulo) * r * cierra, 0.05 + (nace + t * sube) * v, pie.z + Math.sin(angulo) * r * cierra);
        const tam = grande * (1 - t * 0.55) * (0.35 + 0.65 * v);
        lengua.scale.set(tam * 0.72, tam, 1);
        lengua.material.opacity = v * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88);
        lengua.material.rotation = Math.sin(age * 11 + angulo * 3) * 0.22;
      });
    }
    // El resplandor del suelo: la hoguera ilumina la casilla.
    const suelo = plano(brasa, '#ff7a1a');
    suelo.rotation.x = -Math.PI / 2;
    suelo.position.set(pie.x, 0.012, pie.z);
    vive(suelo, seconds, (k, dt, age) => {
      suelo.scale.setScalar(radius * 5 * (0.9 + 0.1 * Math.sin(age * 23)));
      suelo.material.opacity = 0.8 * vida(k);
    });
    // Y un resplandor en el aire, a media altura, que titila.
    const aura = mota(brasa, '#ff8a2a');
    vive(aura, seconds, (k, dt, age) => {
      aura.position.set(pie.x, height * 0.45, pie.z);
      aura.scale.setScalar(height * 1.3 * (0.9 + 0.12 * Math.sin(age * 17)));
      aura.material.opacity = 0.45 * vida(k);
    });
    // Brasas que suben.
    for (let i = 0; i < 22; i++) {
      const chispa = mota(brasa, '#ffb347');
      const tarda = Math.random() * 0.7;
      const angulo = Math.random() * Math.PI * 2;
      const r = radius * (0.3 + Math.random() * 0.8);
      const sube = height * (0.9 + Math.random() * 0.8);
      vive(chispa, seconds, (k) => {
        const t = Math.max(0, Math.min(1, (k - tarda) / 0.3));
        chispa.position.set(pie.x + Math.cos(angulo + t * 3) * r, 0.1 + sube * t, pie.z + Math.sin(angulo + t * 3) * r);
        chispa.scale.setScalar(0.05 * (1 - t * 0.6));
        chispa.material.opacity = t <= 0 || t >= 1 ? 0 : 1 - t;
      });
    }
    // Humo por encima, que sube y se abre.
    for (let i = 0; i < 9; i++) {
      const bocanada = nube('#2b2522');
      const tarda = 0.1 + (i / 9) * 0.6;
      const lado = (Math.random() - 0.5) * radius;
      vive(bocanada, seconds + 0.6, (k) => {
        const total = seconds + 0.6;
        const t = Math.max(0, Math.min(1, (k * total - tarda * seconds) / 1.0));
        bocanada.position.set(pie.x + lado * (1 + t), height * (0.8 + t * 0.8), pie.z);
        bocanada.scale.setScalar(radius * (1.4 + t * 2.2));
        bocanada.material.opacity = t <= 0 ? 0 : 0.55 * Math.min(1, t * 4) * (1 - t);
      });
    }
  }

  // La ceniza: lo que queda de quien se ha quemado. Motas grises que caen del sitio que ocupaba el
  // cuerpo, un montoncito de brasas en el suelo que se apaga, y una última bocanada de humo.
  function ashes(at, { height = 1.4, radius = 0.3, count = 40 } = {}) {
    const pie = new THREE.Vector3().copy(at).setY(0);
    for (let i = 0; i < count; i++) {
      const ceniza = nube(Math.random() < 0.5 ? '#3a3330' : '#5c534d');
      const angulo = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      const desde = Math.random() * height;
      const deriva = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0, (Math.random() - 0.5) * 0.5);
      const tam = 0.05 + Math.random() * 0.08;
      vive(ceniza, 0.9 + Math.random() * 0.6, (k) => {
        const cae = k * k; // cae cada vez más deprisa
        ceniza.position.set(
          pie.x + Math.cos(angulo) * r + deriva.x * k,
          Math.max(0.02, desde * (1 - cae)),
          pie.z + Math.sin(angulo) * r + deriva.z * k,
        );
        ceniza.scale.setScalar(tam * (1 - k * 0.3));
        ceniza.material.opacity = 0.9 * (k > 0.7 ? (1 - k) / 0.3 : 1);
      });
    }
    for (let i = 0; i < 16; i++) {
      const brasita = mota(brasa, '#ff6a1a');
      const angulo = Math.random() * Math.PI * 2;
      const r = radius * 0.7 * Math.sqrt(Math.random());
      brasita.position.set(pie.x + Math.cos(angulo) * r, 0.025, pie.z + Math.sin(angulo) * r);
      const late = Math.random() * 6;
      vive(brasita, 1.6 + Math.random() * 0.8, (k, dt, age) => {
        brasita.scale.setScalar(0.07 * (0.7 + 0.3 * Math.sin(age * 9 + late)));
        brasita.material.opacity = 1 - k;
      });
    }
    for (let i = 0; i < 6; i++) {
      const bocanada = nube('#4a423d');
      const lado = (Math.random() - 0.5) * radius * 1.5;
      vive(bocanada, 1.4, (k) => {
        bocanada.position.set(pie.x + lado, height * (0.2 + k * 0.9), pie.z);
        bocanada.scale.setScalar(radius * (1.2 + k * 2.4));
        bocanada.material.opacity = 0.5 * Math.min(1, k * 5) * (1 - k);
      });
    }
  }

  // LA BOMBA, de dibujos animados: negra y brillante, con su tapón de latón y su mecha de cuerda.
  // Aparece en la mano (`hand`, un hueso) y la sigue; `light()` enciende la mecha, que se va
  // consumiendo echando chispas; `throwTo()` la lanza en arco, girando, y al caer bota y rueda un
  // poco; `explode()` la quita y devuelve dónde estaba. Todo va por fotogramas, con el reloj del juego.
  function bomb(hand, { size = 1.45 } = {}) {
    const grupo = new THREE.Group();
    grupo.name = 'bomba';
    const cuerpo = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 28, 18),
      new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.28, metalness: 0.6 }),
    );
    const tapon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.052, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0xa47b2c, roughness: 0.35, metalness: 0.85 }),
    );
    tapon.position.y = 0.135;
    const curva = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.155, 0),
      new THREE.Vector3(0.015, 0.21, 0),
      new THREE.Vector3(0.06, 0.255, 0.01),
      new THREE.Vector3(0.105, 0.27, 0.02),
    ]);
    const mechaGeo = new THREE.TubeGeometry(curva, 18, 0.011, 6, false);
    const mecha = new THREE.Mesh(mechaGeo, new THREE.MeshStandardMaterial({ color: 0xcaa46a, roughness: 0.95 }));
    grupo.add(cuerpo, tapon, mecha);
    grupo.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    grupo.scale.setScalar(0.001);
    scene.add(grupo);

    const indices = mechaGeo.index.count;
    const estado = {
      fase: 'mano', aparece: 0, quema: 0, ardiendo: false, fuse: 2,
      vuelo: null, fin: null,
    };
    const punta = () => grupo.localToWorld(curva.getPointAt(Math.max(0.05, 1 - estado.quema * 0.9)).clone());
    vive(grupo, 3600, (k, dt) => {
      estado.aparece = Math.min(1, estado.aparece + dt / 0.25);
      const pop = estado.aparece < 1 ? 1 + Math.sin(Math.PI * estado.aparece) * 0.25 : 1;
      grupo.scale.setScalar(Math.max(0.001, estado.aparece * pop * size));
      if (estado.ardiendo) {
        estado.quema = Math.min(1, estado.quema + dt / estado.fuse);
        mechaGeo.setDrawRange(0, Math.round((indices * (1 - estado.quema * 0.9)) / 3) * 3);
      }
      if (estado.fase === 'mano' && hand) {
        hand.getWorldPosition(grupo.position);
        grupo.position.y += 0.04;
      } else if (estado.fase === 'vuelo') {
        const v = estado.vuelo;
        v.edad = Math.min(v.seconds, v.edad + dt);
        const t = v.edad / v.seconds;
        grupo.position.lerpVectors(v.desde, v.hasta, t);
        grupo.position.y = v.desde.y + (v.hasta.y - v.desde.y) * t + Math.sin(Math.PI * t) * v.alto;
        grupo.rotateOnWorldAxis(v.eje, dt * 9);
        if (t >= 1) {
          estado.fase = 'suelo';
          estado.suelo = { edad: 0, desde: grupo.position.clone(), rueda: v.rueda };
          v.resolve();
        }
      } else if (estado.fase === 'suelo') {
        // Un bote pequeño y rueda un palmo hacia el rival.
        const s = estado.suelo;
        s.edad = Math.min(0.5, s.edad + dt);
        const t = s.edad / 0.5;
        grupo.position.copy(s.desde).addScaledVector(s.rueda, 1 - (1 - t) * (1 - t));
        grupo.position.y = 0.13 * size + Math.abs(Math.sin(Math.PI * t * 1.5)) * 0.12 * (1 - t);
        grupo.rotateOnWorldAxis(new THREE.Vector3(-s.rueda.z, 0, s.rueda.x).normalize(), dt * 6 * (1 - t));
      }
    });
    return {
      // Enciende la mecha: arde `seconds` en consumirse, y chisporrotea.
      light(seconds = 2) {
        estado.ardiendo = true;
        estado.fuse = seconds;
        flame(punta, { seconds: 3.5, size: 0.11, count: 5 });
        charge(punta, { seconds: 3.5, color: '#ffb347', size: 0.1, motes: 8 });
      },
      // La lanza hasta `to` ({x, z}, a ras de suelo), en arco de `height`, en `seconds`. Se resuelve al
      // caer; luego aún bota y rueda hacia `roll` ({x, z}, lo que rueda).
      throwTo(to, { seconds = 0.65, height = 0.9, roll = { x: 0, z: 0 } } = {}) {
        estado.fase = 'vuelo';
        return new Promise((resolve) => {
          const desde = grupo.position.clone();
          const hasta = new THREE.Vector3(to.x, 0.13 * size, to.z);
          const eje = new THREE.Vector3(hasta.z - desde.z, 0, desde.x - hasta.x).normalize();
          estado.vuelo = { edad: 0, seconds, desde, hasta, alto: height, eje, resolve, rueda: new THREE.Vector3(roll.x, 0, roll.z) };
        });
      },
      // ¡Bum! Se quita y dice dónde estaba.
      explode() {
        const donde = grupo.position.clone();
        grupo.visible = false;
        acaba(grupo);
        return donde;
      },
      get position() {
        return grupo.position;
      },
    };
  }

  // EL CIELO DEL REY: la tormenta que se le junta encima al rival, el rayo que cae de ella, los chispazos
  // del que se electrocuta, el humo del chamuscado y la estela del molinete.
  //
  // Una línea mide un píxel por gruesa que se pida (WebGL no sabe de grosores): así era el rayo de antes,
  // un hilo. Estos tienen cuerpo: un tramo de cilindro por quiebro, con un núcleo blanco y un halo del
  // color de quien conjura alrededor.
  const eje = new THREE.Vector3();
  function tender(tramo, a, b, radio) {
    eje.subVectors(b, a);
    const largo = eje.length();
    tramo.position.copy(a);
    if (largo < 1e-5) {
      tramo.scale.set(radio, 1e-4, radio);
      return;
    }
    tramo.quaternion.setFromUnitVectors(ARRIBA, eje.divideScalar(largo));
    tramo.scale.set(radio, largo, radio);
  }

  // Una cuerda de rayo de `n` tramos. `trazar(puntos)` la tiende por ellos; `brillo`, de 0 a 1.
  function cuerda(n, { color, nucleo = 0.02, halo = 0.07 }) {
    const grupo = new THREE.Group();
    const geometria = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    const blanco = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const aura = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending });
    const tramos = [];
    for (let i = 0; i < n; i++) {
      const dentro = new THREE.Mesh(geometria, blanco);
      const fuera = new THREE.Mesh(geometria, aura);
      dentro.renderOrder = 12;
      fuera.renderOrder = 11;
      dentro.visible = fuera.visible = false;
      grupo.add(dentro, fuera);
      tramos.push([dentro, fuera]);
    }
    scene.add(grupo);
    return {
      grupo,
      trazar(puntos) {
        tramos.forEach(([dentro, fuera], i) => {
          const hay = i + 1 < puntos.length;
          dentro.visible = fuera.visible = hay;
          if (!hay) return;
          tender(dentro, puntos[i], puntos[i + 1], nucleo);
          tender(fuera, puntos[i], puntos[i + 1], halo);
        });
      },
      set brillo(v) {
        blanco.opacity = v;
        aura.opacity = 0.4 * v;
      },
    };
  }

  // Un camino quebrado de `a` a `b` en `kinks` tramos, que se aparta hasta `amplitude` de la recta (menos
  // cerca de las puntas, que están clavadas).
  const LADO_X = new THREE.Vector3(1, 0, 0);
  function quiebra(a, b, kinks, amplitude, out = []) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const vertical = Math.abs(dir.y) > 0.9 * dir.length();
    const lado = new THREE.Vector3().crossVectors(dir, vertical ? LADO_X : ARRIBA).normalize();
    const otro = new THREE.Vector3().crossVectors(dir, lado).normalize();
    for (let i = 0; i <= kinks; i++) {
      const t = i / kinks;
      const p = out[i] ?? (out[i] = new THREE.Vector3());
      p.copy(a).addScaledVector(dir, t);
      if (i > 0 && i < kinks) {
        const cabe = Math.sqrt(Math.sin(Math.PI * t)) * amplitude * 2;
        p.addScaledVector(lado, (Math.random() - 0.5) * cabe).addScaledVector(otro, (Math.random() - 0.5) * cabe);
      }
    }
    out.length = kinks + 1;
    return out;
  }

  // EL RAYO. De `from` a `to` (puntos, o funciones si se mueven) en un trazo grueso que se requiebra sin
  // parar (`jag`: cuánto), con ramas que se abren hacia abajo y un resplandor a lo largo. Con `flicker`, parpadea como
  // los de verdad: cae, se apaga, vuelve a caer y se va. Con `ground`, deja en el suelo, donde cae, un
  // fogonazo y una quemadura. Sin las dos cosas es un hilo de energía que va de un sitio a otro.
  function lightning(from, to, { seconds = 0.6, color = '#cfe6ff', width = 1, branches = 4, kinks = 16, flicker = true, ground = true, jag = 1 } = {}) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    donde(from, a);
    donde(to, b);
    const todo = new THREE.Group();
    scene.add(todo);
    const tronco = cuerda(kinks, { color, nucleo: 0.026 * width, halo: 0.08 * width });
    const ramas = Array.from({ length: branches }, () => cuerda(6, { color, nucleo: 0.011 * width, halo: 0.036 * width }));
    const brillos = Array.from({ length: Math.max(2, Math.ceil(a.distanceTo(b) / 0.3)) }, () => mota(brasa, color));
    todo.add(tronco.grupo, ...ramas.map((r) => r.grupo), ...brillos);
    let puntos = [];
    let siguiente = 0;
    const encendido = (age) => {
      if (!flicker) return Math.min(1, age / 0.06) * (age > seconds * 0.75 ? Math.max(0, (seconds - age) / (seconds * 0.25)) : 1);
      if (age < 0.08) return 1;
      if (age < 0.13) return 0.12;
      if (age < 0.24) return 1;
      if (age < 0.29) return 0.2;
      return Math.max(0, 1 - (age - 0.29) / Math.max(0.05, seconds - 0.29)) ** 0.7;
    };
    vive(todo, seconds, (k, dt, age) => {
      donde(from, a);
      donde(to, b);
      if (age >= siguiente) {
        siguiente = age + 0.045; // se requiebra 22 veces por segundo
        puntos = quiebra(a, b, kinks, (0.06 + a.distanceTo(b) * 0.045) * jag, puntos);
        tronco.trazar(puntos);
        for (const rama of ramas) {
          const desde = puntos[2 + Math.floor(Math.random() * Math.max(1, kinks - 5))];
          const hasta = desde.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.1, -(0.25 + Math.random() * 0.5), (Math.random() - 0.5) * 1.1));
          rama.trazar(quiebra(desde, hasta, 6, 0.07));
        }
        brillos.forEach((brillo, i) => brillo.position.copy(puntos[Math.round((i / (brillos.length - 1)) * kinks)]));
      }
      const v = encendido(age);
      tronco.brillo = v;
      for (const rama of ramas) rama.brillo = v * 0.85;
      for (const brillo of brillos) {
        brillo.scale.setScalar(0.62 * width);
        brillo.material.opacity = 0.32 * v;
      }
    });
    if (!ground) return;
    // El fogonazo del suelo, que se cierra enseguida…
    const fogonazo = plano(brasa, color);
    fogonazo.rotation.x = -Math.PI / 2;
    fogonazo.position.set(b.x, 0.014, b.z);
    vive(fogonazo, 0.7, (k) => {
      fogonazo.scale.setScalar(3 * width * (1 - k * 0.6));
      fogonazo.material.opacity = (1 - k) ** 2;
    });
    // …y la quemadura, que se queda un rato.
    const quemadura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: humo, color: '#000000', transparent: true, opacity: 0, depthWrite: false,
    }));
    quemadura.rotation.x = -Math.PI / 2;
    quemadura.position.set(b.x, 0.008, b.z);
    quemadura.scale.setScalar(1.05 * width);
    quemadura.renderOrder = 9;
    scene.add(quemadura);
    vive(quemadura, 4, (k) => {
      quemadura.material.opacity = 0.85 * Math.min(1, k * 20) * (k > 0.7 ? (1 - k) / 0.3 : 1);
    });
  }

  // LA TORMENTA. Sobre `at` (los pies de quien la va a recibir), a `height`, se junta en `seconds` una nube
  // negra que gira despacio y se enciende por dentro con relámpagos; y mientras, el tablero se queda a
  // oscuras (`dark`: la luz que queda) y frío, como cuando se nubla de golpe. `strike()` es el fogonazo
  // de un rayo, que lo ilumina todo un instante, dos veces; `clear(seconds)` la deshace y devuelve la luz
  // (con 0, de golpe). Si nadie la deshace, se deshace sola a los `life` segundos: la luz no se puede
  // quedar apagada.
  const FRIO = new THREE.Color('#8faaf0');
  function storm(at, { height = 2.8, radius = 0.9, seconds = 1.2, color = '#cfe6ff', dark = 0.3, life = 16 } = {}) {
    const centro = new THREE.Vector3().copy(at).setY(height);
    const grupo = new THREE.Group();
    scene.add(grupo);
    const luces = [];
    scene.traverse((o) => {
      if (o.isLight) luces.push({ luz: o, intensidad: o.intensity, color: o.color.clone() });
    });
    const ambiente = scene.environmentIntensity ?? 1;
    const estado = { edad: 0, fin: null, fogonazo: 0, repite: null, devuelta: false };
    const devuelve = () => {
      if (estado.devuelta) return;
      estado.devuelta = true;
      for (const { luz, intensidad, color: tono } of luces) {
        luz.intensity = intensidad;
        luz.color.copy(tono);
      }
      scene.environmentIntensity = ambiente;
    };
    // La nube: bocanadas oscuras que llegan desde fuera, se juntan y giran.
    // Bolas de nubarrón, más oscuras las de abajo; gris azulado y no negro, que con el fondo negro una nube
    // negra no se veía, solo sus relámpagos.
    const bocanadas = [];
    for (let i = 0; i < 26; i++) {
      const y = (Math.random() - 0.45) * radius * 0.5;
      const abajo = Math.max(0, Math.min(1, 0.5 - y / (radius * 0.5)));
      const tono = new THREE.Color('#7d879c').lerp(new THREE.Color('#2a2f3c'), abajo * 0.8 + Math.random() * 0.2);
      const bocanada = new THREE.Sprite(new THREE.SpriteMaterial({ map: nubarron, color: tono, transparent: true, depthWrite: false }));
      bocanada.renderOrder = 10;
      bocanada.scale.setScalar(0.001);
      grupo.add(bocanada);
      const angulo = Math.random() * Math.PI * 2;
      const r = radius * Math.sqrt(Math.random());
      bocanadas.push({
        bocanada, angulo, r, y,
        tam: radius * (0.55 + Math.random() * 0.55),
        gira: 0.25 + Math.random() * 0.25,
        cuando: Math.random() * 0.4,
      });
    }
    // Los relámpagos de dentro: resplandores que se encienden un instante aquí y allá.
    const dentro = Array.from({ length: 3 }, () => {
      const luz = mota(brasa, color);
      grupo.add(luz);
      return { luz, hasta: -1 };
    });
    let proximo = 0.3;
    vive(grupo, life, (k, dt, age) => {
      estado.edad = age;
      const junta = crece(Math.min(1, age / seconds));
      const vaSe = estado.fin ? Math.min(1, (age - estado.fin.desde) / estado.fin.seconds) : 0;
      for (const p of bocanadas) {
        const g = Math.max(0, Math.min(1, (junta - p.cuando) / (1 - p.cuando)));
        const a = p.angulo + age * p.gira;
        const r = p.r * (1 + (1 - g) * 1.6 + vaSe * 1.2);
        p.bocanada.position.set(centro.x + Math.cos(a) * r, centro.y + p.y + vaSe * 0.4, centro.z + Math.sin(a) * r);
        p.bocanada.scale.setScalar(p.tam * (0.3 + 0.7 * g) * (1 + vaSe * 0.6));
        p.bocanada.material.opacity = Math.min(1, g * 1.5) * (1 - vaSe);
      }
      // Relámpagos dentro, cada poco, más a menudo según se carga.
      if (age >= proximo && !estado.fin) {
        proximo = age + 0.08 + Math.random() * (0.4 - 0.25 * junta);
        const libre = dentro.find((d) => d.hasta < age) ?? dentro[0];
        const angulo = Math.random() * Math.PI * 2;
        const r = radius * 0.6 * Math.random();
        libre.luz.position.set(centro.x + Math.cos(angulo) * r, centro.y + (Math.random() - 0.5) * 0.2, centro.z + Math.sin(angulo) * r);
        libre.hasta = age + 0.05 + Math.random() * 0.1;
        libre.tam = radius * (0.7 + Math.random() * 0.7) * junta;
      }
      if (estado.repite !== null && age >= estado.repite) {
        estado.fogonazo = Math.max(estado.fogonazo, 0.75);
        estado.repite = null;
      }
      for (const d of dentro) {
        const on = d.hasta >= age ? 1 : 0;
        d.luz.scale.setScalar(Math.max(0.001, (d.tam ?? radius) * (1 + estado.fogonazo)));
        d.luz.material.opacity = Math.max(on * 0.6, estado.fogonazo * 0.8) * (1 - vaSe);
      }
      // La luz del tablero: a oscuras y fría mientras dura, y blanca de golpe con cada rayo.
      if (k >= 1 || vaSe >= 1) {
        devuelve();
        if (vaSe >= 1) acaba(grupo);
        return;
      }
      const oscuro = Math.min(1, age / (seconds * 0.8)) * (1 - vaSe);
      const nivel = 1 - (1 - dark) * oscuro;
      const f = estado.fogonazo;
      for (const { luz, intensidad, color: tono } of luces) {
        luz.intensity = intensidad * (nivel + f * 2.4);
        luz.color.copy(tono).lerp(FRIO, Math.max(oscuro * 0.55, f * 0.8));
      }
      scene.environmentIntensity = ambiente * (nivel + f * 1.6);
      estado.fogonazo = Math.max(0, estado.fogonazo - dt * 6);
    });
    return {
      center: centro,
      strike(power = 1) {
        estado.fogonazo = Math.max(estado.fogonazo, power);
        estado.repite = estado.edad + 0.17;
      },
      clear(segundos = 1) {
        if (estado.devuelta) return;
        if (!(segundos > 0)) {
          devuelve();
          for (const p of bocanadas) p.bocanada.visible = false;
          acaba(grupo);
          return;
        }
        if (!estado.fin) estado.fin = { desde: estado.edad, seconds: segundos };
      },
    };
  }

  // CHISPAZOS: arcos eléctricos que saltan aquí y allá alrededor de `at` (los pies de quien se
  // electrocuta, o una función), en un cilindro de `radius` por `height` desde `base`, durante `seconds`.
  function arcs(at, { seconds = 1, radius = 0.3, height = 1.4, base = 0, color = '#cfe6ff', every = 0.05, width = 1, count = 3 } = {}) {
    const punto = new THREE.Vector3();
    const grupo = new THREE.Group();
    scene.add(grupo);
    const hilos = Array.from({ length: count }, () => {
      const hilo = cuerda(5, { color, nucleo: 0.008 * width, halo: 0.028 * width });
      grupo.add(hilo.grupo);
      return hilo;
    });
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    let siguiente = 0;
    vive(grupo, seconds, (k, dt, age) => {
      if (age >= siguiente) {
        siguiente = age + every;
        donde(at, punto);
        for (const hilo of hilos) {
          hilo.grupo.visible = Math.random() < 0.8;
          const y = base + Math.random() * height;
          const angulo = Math.random() * Math.PI * 2;
          const otro = angulo + (Math.random() - 0.5) * 2.4;
          const y2 = Math.min(base + height, Math.max(base, y + (Math.random() - 0.5) * height * 0.6));
          p.set(punto.x + Math.cos(angulo) * radius, punto.y + y, punto.z + Math.sin(angulo) * radius);
          q.set(punto.x + Math.cos(otro) * radius, punto.y + y2, punto.z + Math.sin(otro) * radius);
          hilo.trazar(quiebra(p, q, 5, radius * 0.3 + 0.02));
        }
      }
      for (const hilo of hilos) hilo.brillo = 1 - k * k * 0.6;
    });
  }

  // HUMO que sale de `at` (un punto o una función) y sube abriéndose, en bocanadas cada `every` segundos
  // durante `seconds`: lo que echa un cuerpo chamuscado, o un cañón que acaba de disparar.
  function smoke(at, { seconds = 1.5, every = 0.08, size = 0.25, rise = 0.9, life = 1.2, color = '#3a3632', opacity = 0.55, spread = 0.15 } = {}) {
    const punto = new THREE.Vector3();
    const emisor = new THREE.Object3D();
    scene.add(emisor);
    let siguiente = 0;
    vive(emisor, seconds, (k, dt, age) => {
      while (age >= siguiente) {
        siguiente += every;
        donde(at, punto);
        const bocanada = nube(color);
        const desde = punto.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread));
        const deriva = new THREE.Vector3((Math.random() - 0.5) * 0.35, 0, (Math.random() - 0.5) * 0.35);
        const gira = (Math.random() - 0.5) * 2;
        const fuerza = 1 - k * 0.6; // va echando menos
        vive(bocanada, life * (0.8 + Math.random() * 0.4), (kk) => {
          bocanada.position.copy(desde).addScaledVector(deriva, kk);
          bocanada.position.y = desde.y + rise * (1 - (1 - kk) ** 2);
          bocanada.scale.setScalar(size * (0.5 + 2 * kk));
          bocanada.material.opacity = opacity * fuerza * Math.min(1, kk * 6) * (1 - kk);
          bocanada.material.rotation = gira * kk;
        });
      }
    });
  }

  // UNA ESTELA: motas que se quedan donde ha ido pasando `at` (una función) y se apagan enseguida. Si
  // `at` da vueltas, dibujan el aro: el molinete del báculo, que antes apenas se veía.
  function trail(at, { seconds = 1, color = '#cfe6ff', size = 0.16, fade = 0.3 } = {}) {
    const punto = new THREE.Vector3();
    const ultimo = new THREE.Vector3();
    const emisor = new THREE.Object3D();
    scene.add(emisor);
    let primero = true;
    vive(emisor, seconds, () => {
      donde(at, punto);
      // Entre un fotograma y otro la punta avanza mucho (va lanzada): se rellena el hueco.
      const pasos = primero ? 1 : Math.min(8, Math.max(1, Math.ceil(punto.distanceTo(ultimo) / (size * 0.3))));
      for (let i = 1; i <= pasos; i++) {
        const chispa = mota(brasa, color);
        chispa.position.copy(primero ? punto : ultimo).lerp(punto, i / pasos);
        chispa.scale.setScalar(size);
        vive(chispa, fade, (k) => {
          chispa.scale.setScalar(size * (1 - k * 0.6));
          chispa.material.opacity = 0.9 * (1 - k);
        });
      }
      ultimo.copy(punto);
      primero = false;
    });
  }

  function update(dt) {
    for (let i = vivos.length - 1; i >= 0; i--) {
      const item = vivos[i];
      item.age += dt;
      const k = Math.min(1, item.age / item.life);
      item.step(k, dt, item.age);
      if (k >= 1) {
        scene.remove(item.object);
        // Un grupo (la bomba) libera lo de cada una de sus mallas.
        item.object.traverse((o) => {
          o.material?.dispose?.();
          if (!o.isSprite) o.geometry?.dispose?.();
        });
        vivos.splice(i, 1);
      }
    }
  }

  return {
    charge, sigil, bolt, shockwave, updraft, iceRay, encase, snow, flame, fireball, blaze, ashes, bomb,
    lightning, storm, arcs, smoke, trail, update,
  };
}
