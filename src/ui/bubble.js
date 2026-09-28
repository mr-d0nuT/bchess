import * as THREE from 'three';
import { currentLanguage } from '../i18n.js';

// Bocadillos de cómic sobre la escena (diseño, sección 7): un globo con texto que sigue a un punto de la
// escena mientras dura, con el tiempo de juego. Con `shout`, una onomatopeya de tebeo: letras gordas
// con su contorno negro sobre una explosión de puntas y rayas de velocidad, que revienta al salir, se
// sacude y se va. El color va con el sonido: metal en acero, cortes en rojo y blanco, golpes en
// amarillo, fuego en naranja, hielo en cian. Son elementos del HUD, por encima del lienzo.

// De qué es cada sonido, por cómo suena.
const ESTILOS = [
  ['metal', /CLANC|CLONC|CLING|TOC|TAC|CLIN|DING|GONG/],
  ['corte', /ZAS|CHAS|ZIS|TRIS|FIU/],
  ['fuego', /FUU|FSS|FLAM|BRRR/],
  ['hielo', /CRIC|CRAC|CRIS/],
  ['blando', /PLOF|CHOF|PUF|PLAF|PUMBA|CATACROC|BUM|PAM/],
];
const estiloDe = (texto) => ESTILOS.find(([, re]) => re.test(String(texto).toUpperCase()))?.[0] ?? 'golpe';

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
    // Los signos de apertura («¡», «¿») son del español y del catalán; en los demás idiomas, fuera.
    if (!['es', 'ca'].includes(currentLanguage())) text = String(text).replace(/[¡¿]/g, '');
    const element = document.createElement('div');
    element.className = shout ? 'onomatopeya' : 'bocadillo';
    if (shout) {
      // La explosión de detrás, las rayas y las letras, cada cosa en su capa; torcida a su manera.
      element.dataset.estilo = estiloDe(text);
      element.style.setProperty('--giro', `${(Math.random() * 22 - 11).toFixed(1)}deg`);
      const explosion = document.createElement('span');
      explosion.className = 'ono-explosion';
      const rayas = document.createElement('span');
      rayas.className = 'ono-rayas';
      const letras = document.createElement('span');
      letras.className = 'ono-letras';
      letras.textContent = text;
      element.append(rayas, explosion, letras);
    } else {
      element.textContent = text;
    }
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
