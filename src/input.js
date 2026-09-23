import * as THREE from 'three';
import { onScreen, ownerOf } from './pieces/pick.js';

// Traduce un toque o un clic sobre el lienzo a lo que hay debajo: la pieza que se ve o, si no hay
// ninguna, la casilla del tablero. El mismo camino sirve para saber qué hay bajo el ratón sin pulsar
// (`onHover`), así que lo que se ilumina es exactamente lo que se elegirá.
//
// Se toca lo que se ve: la malla de verdad de la pieza, no un cilindro invisible a su alrededor. El
// cilindro fallaba por los dos lados — se comía clics de la madera que se ve alrededor de la pieza y
// en cambio no llegaba a la cabeza del caballo ni a la mitra del alfil, que se colaban hasta el suelo
// y elegían la casilla de detrás. Y no hace falta para acertarle a una pieza: pinchando la madera a
// sus pies sale su casilla, que es lo mismo.
//
// Mirar las mallas de todas las piezas costaría demasiado para hacerlo en cada temblor del ratón, así
// que primero se descartan las que ni de lejos están bajo el puntero y luego se prueban de la más
// cercana a la cámara hacia atrás, parando en la primera que recibe el rayo.

const DRAG = 12; // píxeles que puede moverse el ratón y seguir contando como clic y no como arrastre
const LOOK_EVERY = 40; // un vistazo cada tanto: el ratón dispara muchos más eventos de los que hacen falta
const LOOK_SLOP = 3; // y ni eso si el ratón apenas se ha movido

// `targets` son las piezas: `object` es lo que se mira; `anchor`, un objeto plantado en la base de la
// pieza; `lift`, lo que hay de la base a su centro, y `reach`, el radio de la bola que la envuelve. Con
// el centro y el radio se descarta de un vistazo casi todo lo que no está bajo el puntero, sin tocar
// un solo triángulo.
export function onBoardTap({ canvas, camera, board, targets = () => [] }, handler, onHover = null) {
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const middle = new THREE.Vector3();
  let down = null;
  let hovering = 0; // cuándo fue el último vistazo, para no mirar en cada temblor del ratón

  // Lo que hay bajo el puntero: { owner, square }. `owner` es la pieza tocada (y entonces manda ella,
  // esté en la casilla que esté) y `square`, la casilla del tablero bajo el puntero, o null si el
  // puntero se sale del tablero.
  function under(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { owner: null, square: null };
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const owner = pieceUnder();
    if (owner) return { owner, square: null };
    if (!raycaster.ray.intersectPlane(floor, hit)) return { owner: null, square: null };
    return { owner: null, square: board.worldToSquare(hit) };
  }

  // La primera pieza que se ve de las que cruza el rayo, empezando por la más cercana a la cámara.
  function pieceUnder() {
    const cerca = [];
    for (const { object, anchor, lift = 0, reach = 1.6 } of targets()) {
      middle.setFromMatrixPosition(anchor.matrixWorld);
      middle.y += lift;
      if (raycaster.ray.distanceSqToPoint(middle) > reach * reach) continue;
      cerca.push({ object, far: raycaster.ray.origin.distanceToSquared(middle) });
    }
    cerca.sort((a, b) => a.far - b.far);
    for (const { object } of cerca) {
      for (const impacto of raycaster.intersectObject(object, true)) {
        if (!onScreen(impacto.object)) continue; // el rayo atraviesa lo escondido; el ratón, no
        const owner = ownerOf(impacto.object);
        if (owner) return owner;
      }
    }
    return null;
  }

  const forget = () => { down = null; };

  canvas.addEventListener('pointerdown', (event) => {
    // Solo el botón principal: girar la cámara con el derecho no debe elegir nada.
    down = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  });
  canvas.addEventListener('pointercancel', forget);

  canvas.addEventListener('pointerup', (event) => {
    const start = down;
    down = null;
    if (!start || event.pointerId !== start.id) return;
    // Sin prisa: da igual lo que dure el clic (antes se perdían los que pasaban de medio segundo).
    // Lo único que lo descarta es haber arrastrado, que eso es girar la cámara.
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DRAG) return;
    handler(under(event));
  });

  if (!onHover) return;

  let looked = null; // dónde se miró por última vez
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return; // en el móvil no hay ratón que pasear
    const now = performance.now();
    if (now - hovering < LOOK_EVERY) return;
    if (looked && Math.hypot(event.clientX - looked.x, event.clientY - looked.y) < LOOK_SLOP) return;
    hovering = now;
    looked = { x: event.clientX, y: event.clientY };
    onHover(under(event));
  });
  canvas.addEventListener('pointerleave', () => onHover({ owner: null, square: null }));
}
