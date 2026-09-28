import * as THREE from 'three';
import { closeUpView, turnAround } from './framing.js';

// Lo que el usuario hace con la cámara desde los botones: DAR LA VUELTA al tablero para mirarlo
// desde el lado de las negras, y ACERCARSE a la pieza elegida.
//
// La vuelta es media vuelta alrededor del centro del tablero —o de la pieza, si está acercado—, en
// arco: yendo en línea recta, la cámara pasaría por encima del tablero rozando las piezas.
//
// Acercarse deja la cámara delante de la pieza, de tres cuartos —por el lado desde el que ya se
// miraba—, y con los controles apuntando a ella: se puede girar alrededor y pellizcar como siempre.
// Desde el lado de quien juega las piezas propias se ven de espaldas, y de espaldas no hay pieza
// que luzca. Para llegar ahí la cámara rodea a la pieza en arco en vez de cruzar el tablero en
// línea recta, que la metería por entre las demás. Volver deja la cámara donde estaba. Si se
// elige otra pieza mientras está acercado, la cámara va a la nueva.
//
// De tres cuartos por delante, lo que tiene delante la pieza —los peones de su fila— queda entre
// ella y la cámara. Esas piezas se vuelven translúcidas mientras dura el acercamiento, como las que
// no pelean durante un combate.
//
// Nada de esto puede pasar durante un combate: ahí la cámara es de la cámara de cine.

const FLIP_SECONDS = 0.9;
const ZOOM_SECONDS = 0.7;
const ZOOM_MIN_DISTANCE = 1.2; // acercado, se deja pellizcar más cerca que en el tablero entero
const ZOOM_ANGLE = (35 * Math.PI) / 180; // de tres cuartos: lo que se aparta de mirarla de frente
const IN_THE_WAY = 0.8; // a menos de esto de la línea de la cámara a la pieza, una pieza estorba
const smooth = (t) => t * t * (3 - 2 * t);
const UP = new THREE.Vector3(0, 1, 0);

export function createView({ stage, clock, cinema, fade, pieces = () => [], onChange = () => {} }) {
  const { camera, controls } = stage;
  const minDistance = controls.minDistance;
  let zoom = null; // { entry, back: { position, target } }: a quién se acerca y adónde se vuelve
  let moving = false;

  // Si la ventana cambia de tamaño con la cámara acercada, se queda acercada; lo que cambia es
  // adónde volverá.
  const cinemaKeep = stage.keepCamera;
  stage.keepCamera = (view) => {
    if (cinemaKeep(view)) return true;
    if (!zoom) return false;
    zoom.back = { position: view.position.clone(), target: view.target.clone() };
    return true;
  };

  async function run(task) {
    moving = true;
    controls.enabled = false;
    onChange();
    try {
      await task();
    } finally {
      controls.enabled = !cinema.active;
      moving = false;
      onChange();
    }
  }

  // En arco alrededor de `target`: ángulo, distancia y altura van cada uno de lo que eran a lo que
  // han de ser, y el punto al que se mira, en línea recta.
  function orbitTo(position, target, seconds) {
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    const antes = fromPosition.clone().sub(target);
    const despues = position.clone().sub(target);
    const a0 = Math.atan2(antes.x, antes.z);
    let giro = Math.atan2(despues.x, despues.z) - a0;
    giro = Math.atan2(Math.sin(giro), Math.cos(giro)); // por el lado corto
    const r0 = Math.hypot(antes.x, antes.z);
    const r1 = Math.hypot(despues.x, despues.z);
    return clock.tween(seconds, (t) => {
      const k = smooth(t);
      const a = a0 + giro * k;
      const r = r0 + (r1 - r0) * k;
      camera.position.set(target.x + Math.sin(a) * r, fromPosition.y + (position.y - fromPosition.y) * k, target.z + Math.cos(a) * r);
      controls.target.lerpVectors(fromTarget, target, k);
      camera.lookAt(controls.target);
    });
  }

  function glide(position, target, seconds) {
    const fromPosition = camera.position.clone();
    const fromTarget = controls.target.clone();
    return clock.tween(seconds, (t) => {
      const k = smooth(t);
      camera.position.lerpVectors(fromPosition, position, k);
      controls.target.lerpVectors(fromTarget, target, k);
      camera.lookAt(controls.target);
    });
  }

  const free = () => !moving && !cinema.active;

  // Las piezas que quedan entre la cámara y la pieza a la que se acerca, vistas desde arriba.
  const sitio = new THREE.Vector3();
  function inTheWay(entry, from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const largo = dx * dx + dz * dz || 1;
    return pieces()
      .filter((other) => other !== entry)
      .filter((other) => {
        other.piece.figure.getWorldPosition(sitio);
        const t = ((sitio.x - from.x) * dx + (sitio.z - from.z) * dz) / largo;
        if (t < 0 || t > 0.97) return false;
        return Math.hypot(from.x + dx * t - sitio.x, from.z + dz * t - sitio.z) < IN_THE_WAY;
      })
      .map((other) => other.piece.object);
  }

  // Media vuelta. Acercado, alrededor de la pieza; si no, alrededor del centro del tablero.
  function flip() {
    if (!free()) return Promise.resolve();
    return run(async () => {
      const pivot = zoom ? controls.target.clone() : new THREE.Vector3(0, 0, 0);
      const fromPosition = camera.position.clone();
      const fromTarget = controls.target.clone();
      await clock.tween(FLIP_SECONDS, (t) => {
        const angle = Math.PI * smooth(t);
        camera.position.copy(turnAround(fromPosition, pivot, angle));
        controls.target.copy(turnAround(fromTarget, pivot, angle));
        camera.lookAt(controls.target);
      });
      stage.flipped = !stage.flipped;
      // Y la vista a la que se vuelve al alejarse también se da la vuelta, con el tablero.
      if (zoom) {
        const centro = { x: 0, y: 0, z: 0 };
        zoom.back = {
          position: new THREE.Vector3().copy(turnAround(zoom.back.position, centro, Math.PI)),
          target: new THREE.Vector3().copy(turnAround(zoom.back.target, centro, Math.PI)),
        };
      }
    });
  }

  function zoomTo(entry) {
    if (!free() || !entry) return Promise.resolve();
    return run(async () => {
      const back = zoom?.back ?? { position: camera.position.clone(), target: controls.target.clone() };
      zoom = { entry, back };
      const at = entry.piece.figure.getWorldPosition(new THREE.Vector3());
      // Hacia dónde mira la pieza, y de ahí, de tres cuartos por el lado de la cámara.
      const frente = new THREE.Vector3(0, 0, 1).applyQuaternion(entry.piece.figure.getWorldQuaternion(new THREE.Quaternion()));
      frente.y = 0;
      if (frente.lengthSq() < 1e-6) frente.set(0, 0, 1);
      frente.normalize();
      const hacia = camera.position.clone().sub(at);
      const lado = Math.sign(frente.x * hacia.z - frente.z * hacia.x) || 1;
      frente.applyAxisAngle(UP, -lado * ZOOM_ANGLE);
      const { target, position } = closeUpView({ at, height: entry.piece.height, from: at.clone().add(frente), fov: camera.fov });
      controls.minDistance = ZOOM_MIN_DISTANCE;
      if (fade?.count) await fade.restore({ seconds: 0.2 }); // las que estorbaban a la anterior
      await Promise.all([
        orbitTo(new THREE.Vector3().copy(position), new THREE.Vector3().copy(target), ZOOM_SECONDS * 1.4),
        fade?.dim(inTheWay(entry, position, target), { opacity: 0.22 }),
      ]);
    });
  }

  function zoomOut() {
    if (!zoom || moving) return Promise.resolve();
    return run(async () => {
      const { back } = zoom;
      zoom = null;
      await Promise.all([glide(back.position, back.target, ZOOM_SECONDS), fade?.restore()]);
      controls.minDistance = minDistance;
    });
  }

  // Deja el tablero mirado desde un lado: `black` true, desde el de las negras. Si la cámara está
  // ocupada (acabando de volver de un combate), espera a que quede libre.
  async function flipTo(black) {
    for (let i = 0; i < 90 && !free(); i++) await clock.wait(0.05);
    if (Boolean(stage.flipped) !== Boolean(black)) await flip();
  }

  return {
    flip,
    flipTo,
    zoomTo,
    zoomOut,
    // Con la cámara acercada, elegir otra pieza la lleva a la nueva.
    follow(entry) {
      if (zoom && entry && entry !== zoom.entry) return zoomTo(entry);
      return Promise.resolve();
    },
    get zoomed() {
      return zoom !== null;
    },
    get moving() {
      return moving;
    },
  };
}
