import * as THREE from 'three';

// Marcas sobre el tablero: un aro dorado bajo la pieza elegida, un disco en cada casilla a la
// que puede ir y un aro rojo, que late, bajo cada enemigo que puede comerse. Sin sombras ni
// luz propia, para que se lean bien sobre la madera.

const GOLD = 0xf2c14e;
const RED = 0xe0493a;
const LIFT = 0.006; // justo por encima de las casillas para no parpadear con ellas
const HOVER_LIFT = 0.009; // y el contorno del ratón, por encima de todo lo demás
const HOVER_GLIDE = 0.07; // segundos que tarda en deslizarse de una casilla a la vecina
const HOVER_BEAT = 2.4; // radianes por segundo del latido: una respiración, no un parpadeo
const HOVER_LOW = 0.3;
const HOVER_HIGH = 0.95;

// El contorno que sigue al ratón, dibujado en un lienzo: un marco blanco de esquinas redondeadas con
// su halo, como un led encendido sobre la madera. En textura y no con geometría porque así el borde
// sale difuminado y no se ve el filo del polígono.
function hoverTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const inset = 26;
  const radius = 30;
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

export function createHighlights(scene, board) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.47, 48),
    new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const dotGeometry = new THREE.CircleGeometry(0.16, 32);
  const dotMaterial = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, depthWrite: false });
  const dots = [];

  const captureGeometry = new THREE.RingGeometry(0.36, 0.47, 48);
  const captureMaterial = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.9, depthWrite: false });
  const captureRings = [];

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
    if (square) ring.position.copy(board.squareToWorld(square)).setY(LIFT);
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

  // Aro rojo bajo cada enemigo que el peón elegido puede comerse.
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
    captureMaterial.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(seconds * 6));
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

  return { select, showMoves, showCaptures, hover, pulse, clear };
}
