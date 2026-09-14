import * as THREE from 'three';

// Marcas sobre el tablero: un aro dorado bajo la pieza elegida, un disco en cada casilla a la
// que puede ir y un aro rojo, que late, bajo cada enemigo que puede comerse. Sin sombras ni
// luz propia, para que se lean bien sobre la madera.

const GOLD = 0xf2c14e;
const RED = 0xe0493a;
const LIFT = 0.006; // justo por encima de las casillas para no parpadear con ellas

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

  // Los aros rojos laten para llamar la atención.
  function pulse(seconds) {
    captureMaterial.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(seconds * 6));
  }

  function clear() {
    select(null);
    showMoves([]);
    showCaptures([]);
  }

  return { select, showMoves, showCaptures, pulse, clear };
}
