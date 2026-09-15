import * as THREE from 'three';

// Cámara de cine del combate. Se pone de lado para encuadrar a los dos luchadores, tiembla con
// los golpes y al terminar vuelve a donde la tenía el usuario. Mientras actúa, los controles
// de órbita no responden.

const MOVE_SECONDS = 0.8;
const SHAKE_SECONDS = 0.3;
const MIN_DISTANCE = 3.4;
const ELEVATION = 0.65; // altura de la cámara por cada casilla de distancia: mira por encima
const PIECE_TOP = 1.75; // altura de una pieza sobre su peana, para saber si tapa el encuadre
const ANGLE_STEP = Math.PI / 6; // se prueban direcciones cada 30° alrededor de la de lado
const smooth = (t) => t * t * (3 - 2 * t);

export function createCinema(stage) {
  const { camera, controls } = stage;
  let saved = null;
  let shakeLeft = 0;
  let shakeSize = 0;
  const offset = new THREE.Vector3();

  // Si la ventana cambia de tamaño mientras encuadra, la cámara sigue donde está y, al terminar,
  // vuelve al encuadre de reposo del tamaño nuevo.
  stage.keepCamera = (view) => {
    if (!saved) return false;
    saved = { position: view.position.clone(), target: view.target.clone() };
    return true;
  };

  function glide(clock, toPosition, toTarget) {
    const fromPosition = camera.position.clone().sub(offset);
    const fromTarget = controls.target.clone();
    return clock.tween(MOVE_SECONDS, (t) => {
      const k = smooth(t);
      camera.position.lerpVectors(fromPosition, toPosition, k).add(offset);
      controls.target.lerpVectors(fromTarget, toTarget, k);
      camera.lookAt(controls.target);
    });
  }

  return {
    get active() {
      return saved !== null;
    },

    // Encuadra a los luchadores en `a` y `b` ({x, z}) desde arriba y, a ser posible, de lado.
    // Prueba direcciones cada 30° alrededor de las dos de lado y se queda con la que menos
    // piezas (`obstacles`, {x, z}) meten entre la cámara y el combate. Penaliza un poco alejarse
    // de lado y el lado contrario al de la cámara del usuario.
    frame(clock, a, b, obstacles = []) {
      if (!saved) saved = { position: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      const mid = new THREE.Vector3((a.x + b.x) / 2, 0.75, (a.z + b.z) / 2);
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(camera.aspect, 1.6);
      const distance = Math.max(MIN_DISTANCE, (gap + 1.4) / (2 * halfWidth));
      const toUser = new THREE.Vector3().subVectors(saved.position, mid).setY(0);
      const sideways = Math.atan2(b.x - a.x, -(b.z - a.z)); // ángulo (en x, z) perpendicular a la línea
      let best = null;
      for (const base of [sideways, sideways + Math.PI]) {
        for (const step of [0, 1, -1, 2, -2]) {
          const angle = base + step * ANGLE_STEP;
          const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
          const blockers = obstacles.filter((o) => {
            const along = (o.x - mid.x) * dir.x + (o.z - mid.z) * dir.z;
            const aside = Math.abs((o.x - mid.x) * dir.z - (o.z - mid.z) * dir.x);
            return along > 0.3 && along < distance && aside < 0.55 && 0.75 + ELEVATION * along < PIECE_TOP;
          }).length;
          const score = blockers + Math.abs(step) * 0.3 + (dir.dot(toUser) < 0 ? 0.2 : 0);
          if (!best || score < best.score) best = { score, dir };
        }
      }
      const position = mid.clone().addScaledVector(best.dir, distance).add(new THREE.Vector3(0, distance * ELEVATION, 0));
      return glide(clock, position, mid);
    },

    shake(size) {
      shakeLeft = SHAKE_SECONDS;
      shakeSize = size;
    },

    // Cada fotograma, antes de que los controles de órbita lean la cámara: quita el temblor del
    // fotograma anterior, para que no se les acumule (también tiembla fuera del combate).
    settle() {
      camera.position.sub(offset);
      offset.set(0, 0, 0);
    },

    // Cada fotograma, en tiempo real, después de mover la cámara: pone el temblor de este.
    update(dt) {
      if (shakeLeft > 0) {
        shakeLeft = Math.max(0, shakeLeft - dt);
        const k = shakeSize * (shakeLeft / SHAKE_SECONDS);
        offset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      } else {
        offset.set(0, 0, 0);
      }
      camera.position.add(offset);
    },

    // Vuelve a la cámara del usuario y le devuelve los controles.
    async restore(clock) {
      if (!saved) return;
      await glide(clock, saved.position, saved.target);
      camera.position.sub(offset);
      offset.set(0, 0, 0);
      shakeLeft = 0;
      saved = null;
      controls.enabled = true;
    },

    // Vuelta inmediata, para errores.
    reset() {
      if (!saved) return;
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
      camera.lookAt(controls.target);
      offset.set(0, 0, 0);
      shakeLeft = 0;
      saved = null;
      controls.enabled = true;
    },
  };
}
