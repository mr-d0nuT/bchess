import * as THREE from 'three';

// Marcas sobre el tablero, todas del mismo neón azul: un aro que late y gira bajo la pieza elegida,
// con su casilla enmarcada; un punto de luz en cada casilla a la que puede ir, y una diana bajo cada
// enemigo que puede comerse. Lo único que no es azul es el aro ROJO bajo el rey en jaque, que tiene
// que saltar a la vista. Y la última jugada deja sus dos casillas teñidas, para saber qué ha movido
// el otro. Sin sombras ni luz propia, para que se lean bien sobre la madera.

const LIFT = 0.006; // justo por encima de las casillas para no parpadear con ellas
const TINT_LIFT = 0.004; // la última jugada, por debajo de todo lo demás
const HOVER_LIFT = 0.009; // y el contorno del ratón, por encima de todo lo demás
const HOVER_GLIDE = 0.07; // segundos que tarda en deslizarse de una casilla a la vecina
const HOVER_BEAT = 2.4; // radianes por segundo del latido: una respiración, no un parpadeo
const HOVER_LOW = 0.3;
const HOVER_HIGH = 0.95;
// El aro de la pieza elegida: un tubo de neón azul que late —se enciende y se apaga un poco, y
// respira de tamaño— y gira despacio, para que el degradado de color corra por él.
const NEON_SIZE = 1.3; // lado del cuadrado donde va pintado, en casillas
const NEON_BEAT = 4.2; // radianes por segundo del latido
const NEON_SPIN = 0.6; // y del giro
const NEON_LOW = 0.6;
const NEON_HIGH = 1;
const NEON_BREATH = 0.035; // lo que crece y encoge al latir

// El contorno que sigue al ratón, dibujado en un lienzo: un marco blanco de esquinas redondeadas con
// su halo, como un led encendido sobre la madera. En textura y no con geometría porque así el borde
// sale difuminado y no se ve el filo del polígono.
function hoverTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // El marco ocupa casi toda la casilla, pero no del todo: pegado al borde se confunde con la junta
  // entre casillas y deja de leerse como una marca.
  const inset = 13;
  const radius = 26;
  const marco = () => {
    ctx.beginPath();
    const lado = size - inset * 2;
    if (ctx.roundRect) ctx.roundRect(inset, inset, lado, lado, radius);
    else ctx.rect(inset, inset, lado, lado); // navegadores viejos: esquinas vivas, pero se ve
  };

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; // un velo dentro, para saber qué casilla es
  marco();
  ctx.fill();

  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'; // el halo
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 7;
  marco();
  ctx.stroke();

  ctx.shadowBlur = 0; // y el filamento, fino y nítido
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.lineWidth = 3;
  marco();
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// El aro de neón, pintado en un lienzo: el halo, ancho y de un azul eléctrico profundo; encima el
// tubo, con el degradado de color que le da la vuelta (de cian a azul y a violeta), y dentro del
// tubo un filamento más claro, que es lo que hace que un neón parezca encendido y no pintado. Se
// pinta encima de la madera, no sumado a ella: sumado, sobre el roble claro salía casi blanco.
const AZUL = {
  halo: ['rgba(0, 60, 255, 0)', 'rgba(0, 95, 255, 0.45)', 'rgba(0, 130, 255, 0.7)', 'rgba(0, 90, 255, 0.4)', 'rgba(0, 40, 255, 0)'],
  tubo: ['rgb(0, 210, 255)', 'rgb(0, 110, 255)', 'rgb(80, 70, 255)', 'rgb(0, 140, 255)'],
  sombra: 'rgb(0, 120, 255)',
  filamento: ['rgb(90, 200, 255)', 'rgba(150, 230, 255, 0.9)'],
};
const ROJO = {
  halo: ['rgba(255, 20, 0, 0)', 'rgba(255, 40, 20, 0.5)', 'rgba(255, 60, 30, 0.75)', 'rgba(255, 30, 10, 0.45)', 'rgba(255, 0, 0, 0)'],
  tubo: ['rgb(255, 90, 40)', 'rgb(255, 30, 30)', 'rgb(255, 0, 90)', 'rgb(255, 50, 20)'],
  sombra: 'rgb(255, 30, 0)',
  filamento: ['rgb(255, 170, 120)', 'rgba(255, 220, 190, 0.9)'],
};

function neonTexture(paleta = AZUL, { radio: r = 0.45, grosor = 1 } = {}) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const radio = size * (r / NEON_SIZE); // el tubo, a `r` casillas del centro
  const aro = (width) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, radio, 0, Math.PI * 2);
    ctx.stroke();
  };

  const halo = ctx.createRadialGradient(c, c, radio - size * 0.075 * grosor, c, c, radio + size * 0.095 * grosor);
  [0, 0.4, 0.5, 0.62, 1].forEach((t, i) => halo.addColorStop(t, paleta.halo[i]));
  ctx.strokeStyle = halo;
  aro(size * 0.17 * grosor);

  let tubo = paleta.tubo[1];
  if (ctx.createConicGradient) {
    tubo = ctx.createConicGradient(0, c, c);
    [0, 0.3, 0.55, 0.8].forEach((t, i) => tubo.addColorStop(t, paleta.tubo[i]));
    tubo.addColorStop(1, paleta.tubo[0]);
  }
  ctx.shadowColor = paleta.sombra;
  ctx.shadowBlur = size * 0.035 * grosor;
  ctx.strokeStyle = tubo;
  aro(size * 0.032 * grosor);

  ctx.shadowBlur = size * 0.01;
  ctx.shadowColor = paleta.filamento[0];
  ctx.strokeStyle = paleta.filamento[1];
  aro(size * 0.008 * Math.max(1, grosor));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// El punto de luz de una casilla libre: un núcleo claro con su halo azul.
function dotTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(200, 245, 255, 1)');
  g.addColorStop(0.16, 'rgba(90, 210, 255, 1)');
  g.addColorStop(0.3, 'rgba(0, 140, 255, 0.85)');
  g.addColorStop(0.55, 'rgba(0, 90, 255, 0.3)');
  g.addColorStop(1, 'rgba(0, 60, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// El marco de neón de la casilla elegida (y, muy suave, el tinte de la última jugada).
function squareTexture({ relleno, borde }) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const inset = 10;
  const lado = size - inset * 2;
  const marco = () => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(inset, inset, lado, lado, 18);
    else ctx.rect(inset, inset, lado, lado);
  };
  ctx.fillStyle = relleno;
  marco();
  ctx.fill();
  if (borde) {
    ctx.shadowColor = 'rgb(0, 140, 255)';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.85)';
    ctx.lineWidth = 7;
    marco();
    ctx.stroke();
    ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(160, 230, 255, 0.95)';
    ctx.lineWidth = 2.5;
    marco();
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const neonMaterial = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });

export function createHighlights(scene, board) {
  const ringMaterial = new THREE.MeshBasicMaterial({
    map: neonTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: false, // que el mapeo de tonos no lo apague: un neón es más vivo que la escena
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(NEON_SIZE, NEON_SIZE), ringMaterial);
  ring.name = 'aro';
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 1;
  ring.visible = false;
  scene.add(ring);

  // La casilla elegida, enmarcada.
  const frameMaterial = neonMaterial(squareTexture({ relleno: 'rgba(0, 120, 255, 0.16)', borde: true }));
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), frameMaterial);
  frame.rotation.x = -Math.PI / 2;
  frame.renderOrder = 1;
  frame.visible = false;
  scene.add(frame);

  const dotGeometry = new THREE.PlaneGeometry(0.64, 0.64);
  const dotMaterial = neonMaterial(dotTexture());
  const dots = [];

  // La diana bajo cada enemigo que se puede comer: el mismo neón, más fino y latiendo más deprisa.
  const captureGeometry = new THREE.PlaneGeometry(NEON_SIZE, NEON_SIZE);
  const captureMaterial = neonMaterial(neonTexture(AZUL, { radio: 0.42, grosor: 0.7 }));
  const captureRings = [];

  // El rey en jaque: el mismo aro, en rojo.
  const checkMaterial = neonMaterial(neonTexture(ROJO, { radio: 0.44, grosor: 1.15 }));
  const checkRing = new THREE.Mesh(new THREE.PlaneGeometry(NEON_SIZE, NEON_SIZE), checkMaterial);
  checkRing.rotation.x = -Math.PI / 2;
  checkRing.renderOrder = 1;
  checkRing.visible = false;
  scene.add(checkRing);

  // La última jugada: sus dos casillas, apenas teñidas.
  const tintMaterial = neonMaterial(squareTexture({ relleno: 'rgba(0, 150, 255, 0.2)', borde: false }));
  const tints = [0, 1].map(() => {
    const tinte = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tintMaterial);
    tinte.rotation.x = -Math.PI / 2;
    tinte.visible = false;
    scene.add(tinte);
    return tinte;
  });

  // El contorno de la casilla que hay bajo el ratón: lo que se elegiría al pulsar.
  const hoverMaterial = new THREE.MeshBasicMaterial({
    map: hoverTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // se enciende sobre la madera en vez de pintarla de blanco
  });
  const hoverMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hoverMaterial);
  hoverMesh.name = 'contorno';
  hoverMesh.rotation.x = -Math.PI / 2;
  hoverMesh.position.y = HOVER_LIFT;
  hoverMesh.renderOrder = 2;
  hoverMesh.visible = false;
  scene.add(hoverMesh);
  let hovered = null; // la casilla que señala ahora
  let hoverAge = 0; // lo que lleva encendido, para que entre suave

  function select(square) {
    ring.visible = Boolean(square);
    frame.visible = Boolean(square);
    if (square) {
      ring.position.copy(board.squareToWorld(square)).setY(LIFT);
      frame.position.copy(board.squareToWorld(square)).setY(LIFT * 0.8);
    }
  }

  // El rey en jaque (su casilla), o null.
  function check(square) {
    checkRing.visible = Boolean(square);
    if (square) checkRing.position.copy(board.squareToWorld(square)).setY(LIFT * 1.2);
  }

  // Las dos casillas de la última jugada, o null.
  function lastMove(from, to) {
    [from, to].forEach((square, i) => {
      tints[i].visible = Boolean(square);
      if (square) tints[i].position.copy(board.squareToWorld(square)).setY(TINT_LIFT);
    });
  }

  function showMoves(squares) {
    for (const dot of dots) scene.remove(dot);
    dots.length = 0;
    for (const square of squares) {
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      dot.rotation.x = -Math.PI / 2;
      dot.position.copy(board.squareToWorld(square)).setY(LIFT);
      scene.add(dot);
      dots.push(dot);
    }
  }

  // La diana bajo cada enemigo que la pieza elegida puede comerse.
  function showCaptures(squares) {
    for (const mark of captureRings) scene.remove(mark);
    captureRings.length = 0;
    for (const square of squares) {
      const mark = new THREE.Mesh(captureGeometry, captureMaterial);
      mark.rotation.x = -Math.PI / 2;
      mark.position.copy(board.squareToWorld(square)).setY(LIFT);
      scene.add(mark);
      captureRings.push(mark);
    }
  }

  // La casilla bajo el ratón, o null si no señala ninguna.
  function hover(square) {
    if (square === hovered) return;
    hovered = square;
    if (!square) return;
    const at = board.squareToWorld(square);
    if (!hoverMesh.visible) hoverMesh.position.set(at.x, HOVER_LIFT, at.z); // la primera vez, sin viaje
    hoverMesh.visible = true;
    hoverAge = 0;
  }

  // Los aros rojos laten para llamar la atención, y el contorno del ratón respira mientras se desliza
  // hasta la casilla que señala.
  function pulse(seconds, dt = 0) {
    const rapido = 0.5 + 0.5 * Math.sin(seconds * 6);
    captureMaterial.opacity = 0.6 + 0.4 * rapido;
    for (const mark of captureRings) {
      mark.scale.setScalar(1 + 0.05 * (rapido - 0.5));
      mark.rotation.z = -seconds * NEON_SPIN * 1.4;
    }
    dotMaterial.opacity = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(seconds * NEON_BEAT));
    frameMaterial.opacity = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(seconds * NEON_BEAT));
    if (checkRing.visible) {
      const alarma = 0.5 + 0.5 * Math.sin(seconds * 7.5);
      checkMaterial.opacity = 0.6 + 0.4 * alarma;
      checkRing.scale.setScalar(1 + 0.06 * (alarma - 0.5));
      checkRing.rotation.z = seconds * NEON_SPIN * 2;
    }
    if (ring.visible) {
      const latido = 0.5 + 0.5 * Math.sin(seconds * NEON_BEAT);
      ringMaterial.opacity = NEON_LOW + (NEON_HIGH - NEON_LOW) * latido;
      ring.scale.setScalar(1 + NEON_BREATH * (latido - 0.5) * 2);
      ring.rotation.z = seconds * NEON_SPIN;
    }
    if (!hoverMesh.visible) return;
    if (!hovered) {
      hoverAge = Math.max(0, hoverAge - dt / 0.12);
      hoverMaterial.opacity = HOVER_LOW * hoverAge;
      if (hoverAge <= 0) hoverMesh.visible = false;
      return;
    }
    const at = board.squareToWorld(hovered);
    const k = dt > 0 ? Math.min(1, dt / HOVER_GLIDE) : 1; // se desliza a la casilla nueva, no salta
    hoverMesh.position.x += (at.x - hoverMesh.position.x) * k;
    hoverMesh.position.z += (at.z - hoverMesh.position.z) * k;
    hoverAge = Math.min(1, hoverAge + dt / 0.18); // y entra encendiéndose
    const latido = 0.5 + 0.5 * Math.sin(seconds * HOVER_BEAT);
    hoverMaterial.opacity = (HOVER_LOW + (HOVER_HIGH - HOVER_LOW) * latido) * hoverAge;
  }

  function clear() {
    select(null);
    showMoves([]);
    showCaptures([]);
  }

  return { select, showMoves, showCaptures, hover, pulse, clear, check, lastMove };
}
