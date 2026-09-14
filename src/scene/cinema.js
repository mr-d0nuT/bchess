import * as THREE from 'three';

// Cámara de cine del combate. Se pone de lado para encuadrar a los dos luchadores, tiembla con
// los golpes y al terminar vuelve a donde la tenía el usuario. Mientras actúa, los controles
// de órbita no responden.

const MOVE_SECONDS = 0.8;
const SHAKE_SECONDS = 0.3;
const MIN_DISTANCE = 3.4;
const ELEVATION = 0.9; // altura de la cámara por cada casilla de distancia: mira por encima
const smooth = (t) => t * t * (3 - 2 * t);

export function createCinema({ camera, controls }) {
  let saved = null;
  let shakeLeft = 0;
  let shakeSize = 0;
  const offset = new THREE.Vector3();

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

    // Encuadra a los luchadores en `a` y `b` ({x, z}) de lado y desde arriba, para ver por
    // encima de las demás piezas. Elige el lado con menos piezas (`obstacles`, {x, z}) entre
    // la cámara y el combate; si empatan, el más cercano a la cámara del usuario.
    frame(clock, a, b, obstacles = []) {
      if (!saved) saved = { position: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      const mid = new THREE.Vector3((a.x + b.x) / 2, 0.75, (a.z + b.z) / 2);
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(camera.aspect, 1.6);
      const distance = Math.max(MIN_DISTANCE, (gap + 1.4) / (2 * halfWidth));
      const across = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
      const blockers = (side) => obstacles.filter((o) => {
        const along = (o.x - mid.x) * side.x + (o.z - mid.z) * side.z;
        const aside = Math.abs((o.x - mid.x) * side.z - (o.z - mid.z) * side.x);
        return along > 0.4 && along < distance && aside < 0.8;
      }).length;
      const other = across.clone().negate();
      const toUser = new THREE.Vector3().subVectors(saved.position, mid).setY(0);
      const [first, second] = across.dot(toUser) >= 0 ? [across, other] : [other, across];
      const side = blockers(second) < blockers(first) ? second : first;
      const position = mid.clone().addScaledVector(side, distance).add(new THREE.Vector3(0, distance * ELEVATION, 0));
      return glide(clock, position, mid);
    },

    shake(size) {
      shakeLeft = SHAKE_SECONDS;
      shakeSize = size;
    },

    // Cada fotograma, en tiempo real, después de mover la cámara.
    update(dt) {
      camera.position.sub(offset);
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
