import * as THREE from 'three';

// LA CÁMARA DEL MENÚ. Mientras se elige partida, detrás del menú se ve el tablero de verdad, con sus piezas
// respirando y haciendo sus gestos, y la cámara lo recorre en tomas de cine, como la portada de un juego:
// una órbita lenta a ras de tablero, un travelling por la fila de los peones, un primer plano de una figura
// que se va acercando (con el fondo desenfocado), una grúa que sube hasta verlo entero y un contraplano a
// ras de suelo. Entre toma y toma, un corte a negro. Al jugar, la cámara baja en un vuelo hasta la vista de
// la partida (`stop`).
//
// Lo pidió el usuario: un menú «profesional, impactante, dinámico y vistoso». Antes era un fondo negro.

const SHOT_SECONDS = [6.5, 8.5]; // lo que dura cada toma, entre esto y esto
const CUT = 0.55; // el corte a negro entre toma y toma: la mitad para fundirse y la otra para volver
const GLIDE_SECONDS = 1.5; // el vuelo final, hasta la vista de la partida
const smooth = (t) => t * t * (3 - 2 * t);
const UP = new THREE.Vector3(0, 1, 0);

// `pieces()`: las piezas del tablero. `focus`: el desenfoque por distancia (`scene/focus.js`). `veil`: la
// capa negra de los cortes (un elemento del DOM). `clock`: el reloj del juego, para el vuelo final.
export function createAttract({ stage, clock, pieces, focus, veil }) {
  const { camera, controls } = stage;
  let running = false;
  let gliding = false; // el vuelo final: aún es suya la cámara
  let saved = null; // { position, target }: la vista a la que se vuelve
  let shot = null; // { seconds, kind, pose(t, position, target) }
  let age = 0;
  let last = null;
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  const focusPoint = new THREE.Vector3();

  // Si cambia el tamaño de la ventana mientras dura, se queda donde está y, al acabar, vuelve a la vista de
  // reposo del tamaño nuevo.
  const keep = stage.keepCamera;
  stage.keepCamera = (view) => {
    if (keep(view)) return true;
    if (!running) return false;
    saved = { position: view.position.clone(), target: view.target.clone() };
    return true;
  };

  // En una pantalla vertical cabe menos a lo ancho: se aleja un poco.
  const lejos = () => (camera.aspect < 1 ? 1.35 : 1);
  const vivas = () => pieces().filter((entry) => entry.piece.object.visible);

  // Las tomas: cada una sabe dónde está la cámara y adónde mira en cada momento (t de 0 a 1).
  const SHOTS = {
    // Una vuelta lenta alrededor del tablero, casi a ras, bajando.
    orbit() {
      const a0 = Math.random() * Math.PI * 2;
      const giro = (Math.random() < 0.5 ? -1 : 1) * 0.75;
      return (t, p, q) => {
        const a = a0 + giro * t;
        const r = 7.4 * lejos();
        p.set(Math.sin(a) * r, 2.9 - 0.9 * t, Math.cos(a) * r);
        q.set(0, 0.45, 0);
      };
    },
    // Un travelling a la altura de los ojos por delante de la fila de los peones, mirando un poco adelante.
    row() {
      const peones = vivas().filter((entry) => entry.kind === 'pawn');
      const blancos = peones.filter((entry) => entry.color === 'white');
      const negros = peones.filter((entry) => entry.color === 'black');
      const fila = blancos.length >= negros.length ? blancos : negros;
      if (fila.length < 3) return null;
      const xs = fila.map((entry) => entry.piece.figure.position.x);
      const z = fila.reduce((s, entry) => s + entry.piece.figure.position.z, 0) / fila.length;
      const facing = fila[0].piece.figure.rotation.y;
      const fwd = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
      const ida = Math.random() < 0.5 ? 1 : -1;
      const desde = (ida > 0 ? Math.min(...xs) : Math.max(...xs)) - ida * 0.6;
      const hasta = (ida > 0 ? Math.max(...xs) : Math.min(...xs)) + ida * 0.6;
      return (t, p, q) => {
        const x = desde + (hasta - desde) * smooth(t);
        p.set(x, 0.85, z).addScaledVector(fwd, 2.3 * lejos());
        q.set(x + ida * 0.9, 0.9, z);
      };
    },
    // Primer plano de una figura (un rey, una reina, un caballero, un alfil o una torre), acercándose despacio
    // y rodeándola un poco; con el fondo desenfocado.
    hero() {
      const figuras = vivas().filter((entry) => entry.kind !== 'pawn');
      if (!figuras.length) return null;
      const entry = figuras[Math.floor(Math.random() * figuras.length)];
      const fig = entry.piece.figure;
      const alto = entry.piece.height ?? 1.8;
      const a0 = fig.rotation.y + (Math.random() < 0.5 ? -1 : 1) * 0.45;
      const giro = (Math.random() < 0.5 ? -1 : 1) * 0.35;
      return (t, p, q) => {
        const at = fig.getWorldPosition(new THREE.Vector3());
        const a = a0 + giro * t;
        const d = (3.4 - 1.1 * smooth(t)) * lejos();
        p.set(at.x + Math.sin(a) * d, alto * 0.78, at.z + Math.cos(a) * d);
        q.set(at.x, alto * 0.66, at.z);
      };
    },
    // Una grúa: sale de ras de suelo, detrás de un bando, y sube hasta ver el tablero entero.
    crane() {
      const lado = Math.random() < 0.5 ? 1 : -1;
      const x = (Math.random() - 0.5) * 3;
      return (t, p, q) => {
        const k = smooth(t);
        p.set(x * (1 - k), 0.55 + 6.2 * k, lado * (5.6 + 2.6 * k) * lejos());
        q.set(0, 0.6 - 0.4 * k, lado * (1.5 - 1.5 * k));
      };
    },
    // Un contraplano a ras de suelo, en diagonal, que avanza hacia el centro.
    across() {
      const a = Math.PI / 4 + Math.floor(Math.random() * 4) * (Math.PI / 2);
      return (t, p, q) => {
        const r = (6.4 - 1.6 * smooth(t)) * lejos();
        p.set(Math.sin(a) * r, 0.7 + 0.3 * t, Math.cos(a) * r);
        q.set(-Math.sin(a) * 1.5, 0.55, -Math.cos(a) * 1.5);
      };
    },
  };
  const ORDER = ['orbit', 'hero', 'row', 'crane', 'hero', 'across'];
  let turn = 0;

  function nextShot() {
    for (let i = 0; i < ORDER.length; i++) {
      const kind = ORDER[(turn + i) % ORDER.length];
      if (kind === last && kind !== 'hero') continue;
      const pose = SHOTS[kind]();
      if (!pose) continue;
      turn = (turn + i + 1) % ORDER.length;
      last = kind;
      return { kind, pose, seconds: SHOT_SECONDS[0] + Math.random() * (SHOT_SECONDS[1] - SHOT_SECONDS[0]) };
    }
    return { kind: 'orbit', pose: SHOTS.orbit(), seconds: SHOT_SECONDS[1] };
  }

  function place() {
    shot.pose(Math.min(1, age / shot.seconds), position, target);
    camera.position.copy(position);
    controls.target.copy(target);
    camera.lookAt(target);
    focusPoint.copy(target);
  }

  function paintVeil() {
    if (!veil) return;
    const media = CUT / 2;
    let o = 0;
    if (age < media) o = 1 - age / media;
    else if (age > shot.seconds - media) o = Math.min(1, (age - (shot.seconds - media)) / media);
    veil.style.opacity = String(o);
  }

  return {
    get active() {
      return running || gliding;
    },

    start() {
      if (running) return;
      running = true;
      saved = { position: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      turn = Math.floor(Math.random() * ORDER.length);
      shot = nextShot();
      age = 0;
      place();
      paintVeil();
      focus?.on(() => focusPoint);
    },

    // Cada fotograma, en tiempo real.
    update(dt) {
      if (!running) return;
      age += dt;
      if (age >= shot.seconds) {
        shot = nextShot();
        age = 0;
      }
      place();
      paintVeil();
    },

    // Se acaba: la cámara vuela hasta la vista de la partida y devuelve los controles.
    async stop({ seconds = GLIDE_SECONDS } = {}) {
      if (!running) return;
      running = false;
      if (veil) veil.style.opacity = '0';
      focus?.off();
      const fromPosition = camera.position.clone();
      const fromTarget = controls.target.clone();
      const to = saved;
      // En arco: sube por el camino, como una grúa, y baja a su sitio.
      const alto = Math.max(fromPosition.y, to.position.y) + 1.2;
      gliding = true;
      try {
        await clock.tween(seconds, (t) => {
          const k = smooth(t);
          camera.position.lerpVectors(fromPosition, to.position, k);
          camera.position.y += (alto - Math.max(fromPosition.y, to.position.y)) * Math.sin(Math.PI * k);
          controls.target.lerpVectors(fromTarget, to.target, k);
          camera.lookAt(controls.target);
        });
      } finally {
        gliding = false;
      }
      camera.position.copy(to.position);
      controls.target.copy(to.target);
      camera.up.copy(UP);
      camera.lookAt(controls.target);
      controls.enabled = true;
      controls.update();
    },
  };
}
