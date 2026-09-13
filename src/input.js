import * as THREE from 'three';

// Traduce un toque o clic sobre el lienzo a lo que hay debajo: primero las zonas de toque
// de las piezas (`targets`) y, si no, la casilla del tablero. Ignora los arrastres (girar
// la cámara): el gesto debe ser corto y casi sin movimiento.

export function onBoardTap({ canvas, camera, board, targets = () => [] }, handler) {
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let down = null;

  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY, time: performance.now() };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const quick = performance.now() - down.time < 500;
    down = null;
    if (moved > 8 || !quick) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    const pieceHit = raycaster.intersectObjects(targets(), false)[0];
    if (pieceHit) {
      handler({ owner: pieceHit.object.userData.owner, square: null });
      return;
    }
    if (!raycaster.ray.intersectPlane(floor, hit)) return;
    const square = board.worldToSquare(hit);
    if (square) handler({ owner: null, square });
  });
}
