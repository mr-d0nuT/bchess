import * as THREE from 'three';

// Bocadillos de cómic sobre la escena (diseño, sección 7): un globo con texto que sigue a un punto de la
// escena mientras dura, con el tiempo de juego. Con `shout`, una onomatopeya grande y amarilla
// («¡CLANC!»). Son elementos del HUD, por encima del lienzo.

export function createBubbles({ camera, canvas, clock }) {
  const layer = document.getElementById('hud');
  const live = [];
  const point = new THREE.Vector3();

  function place({ element, anchor, lift }) {
    if (typeof anchor === 'function') point.copy(anchor());
    else anchor.getWorldPosition(point);
    point.y += lift;
    point.project(camera);
    const rect = canvas.getBoundingClientRect();
    element.hidden = point.z > 1; // detrás de la cámara
    element.style.left = `${rect.left + ((point.x + 1) / 2) * rect.width}px`;
    element.style.top = `${rect.top + ((1 - point.y) / 2) * rect.height}px`;
  }

  // Muestra `text` sobre `anchor` (un objeto de la escena o una función que devuelve un Vector3),
  // `lift` casillas más arriba, durante `seconds` de juego. Se resuelve al quitarse.
  function say(text, anchor, { seconds = 1.5, shout = false, lift = 0.25 } = {}) {
    const element = document.createElement('div');
    element.className = shout ? 'onomatopeya' : 'bocadillo';
    element.textContent = text;
    layer.append(element);
    const item = { element, anchor, lift };
    live.push(item);
    place(item);
    return clock.wait(seconds).then(() => {
      element.remove();
      const index = live.indexOf(item);
      if (index >= 0) live.splice(index, 1);
    });
  }

  // Cada fotograma, después de mover la cámara: los globos siguen a su punto.
  function update() {
    for (const item of live) place(item);
  }

  // Quita todos los globos (errores).
  function clear() {
    for (const item of live.splice(0)) item.element.remove();
  }

  return { say, update, clear };
}
