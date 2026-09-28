import * as THREE from 'three';

// Mientras dos piezas pelean, las demás se vuelven translúcidas: así no tapan la escena aunque queden
// entre la cámara y el combate (lo pidió el usuario). Los materiales de un modelo los comparten todas
// sus copias, así que a la pieza que se atenúa se le clonan los suyos la primera vez.
//
// Translúcida no basta con la que queda justo DELANTE de lo que se enseña: en un plano corto —la
// celebración del que gana, de frente— su fantasma, además borroso por la profundidad de campo,
// ocupa medio encuadre. Así que en cada fotograma se mira, en la pantalla, qué piezas atenuadas
// tapan a las que importan (`watch`) y están más cerca de la cámara que ellas, y esas se apagan del
// todo; en cuanto dejan de tapar, vuelven a translúcidas. Todo va por fotogramas (`update`), no por
// animaciones sueltas, para que atenuar, apagar y restaurar no se pisen.

const OPACITY = 0.18; // lo que queda de una pieza apartada del combate
const SPEED = 1 / 0.3; // de entera a atenuada (o al revés) en 0,3 s
const SHRINK = 0.15; // lo que se encoge el recuadro de lo que importa: rozarle el borde no es taparlo
const AHEAD = 0.25; // lo que ha de estar más cerca de la cámara que ello para taparlo
const OFF = 0.02; // por debajo de esto, la pieza ni se pinta (ni su sombra)

export function createFade() {
  const faded = new Map(); // objeto → { materials, anchor, height, radius, opacity, base, hiddenByUs }
  let restoring = false;
  let subjects = null; // () => [{ anchor, height, radius }]: lo que no se puede tapar
  let hidden = 0; // hasta dónde se apaga lo que lo tapa
  let waiters = [];

  function ownMaterials(object) {
    const materials = [];
    object.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      o.material = Array.isArray(o.material) ? list.map((m) => m.clone()) : list[0].clone();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.push(material);
    });
    return materials;
  }

  // Cuándo se ha llegado a donde se iba: para quien espera a que acabe de atenuar o de restaurar.
  function settled() {
    for (const f of faded.values()) if (Math.abs(f.opacity - f.goal) > 1e-3) return false;
    return true;
  }
  function wait() {
    if (settled()) return Promise.resolve();
    return new Promise((resolve) => waiters.push(resolve));
  }

  // Atenúa las piezas de `items`: objetos de three, o { object, anchor, height, radius } para que
  // además se puedan apagar si tapan lo que importa.
  function dim(items, { opacity = OPACITY } = {}) {
    restoring = false;
    for (const item of items) {
      const desc = item?.isObject3D ? { object: item } : item;
      if (!desc?.object) continue;
      let f = faded.get(desc.object);
      if (!f) {
        f = { ...desc, materials: ownMaterials(desc.object), opacity: 1, goal: 1, hiddenByUs: false };
        faded.set(desc.object, f);
      }
      Object.assign(f, desc);
      f.base = opacity;
      f.goal = opacity;
    }
    return wait();
  }

  // Lo que no se puede tapar (una función que devuelve [{ anchor, height, radius }]), o null.
  // `off`: la opacidad de lo que lo tape (0, que ni se vea).
  function watch(fn, { off = 0 } = {}) {
    subjects = fn;
    hidden = off;
  }

  // Devuelve a todas su color de siempre. Espera a que acaben.
  async function restore() {
    if (!faded.size) return;
    restoring = true;
    for (const f of faded.values()) f.goal = 1;
    await wait();
    for (const f of faded.values()) {
      for (const material of f.materials) {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      }
      if (f.hiddenByUs) f.object.visible = true;
    }
    faded.clear();
    restoring = false;
  }

  // El recuadro que ocupa una pieza en la pantalla (en coordenadas de -1 a 1) y lo lejos que está
  // de la cámara, o null si queda detrás.
  const tmp = new THREE.Vector3();
  const right = new THREE.Vector3();
  const base = new THREE.Vector3();
  function onScreen(desc, camera) {
    desc.anchor.getWorldPosition(base);
    base.y = 0;
    tmp.copy(base).applyMatrix4(camera.matrixWorldInverse);
    const depth = -tmp.z;
    if (depth <= camera.near) return null;
    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize().multiplyScalar(desc.radius ?? 0.4);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const alto of [0, desc.height ?? 1.8]) {
      for (const lado of [-1, 1]) {
        tmp.copy(base).addScaledVector(right, lado);
        tmp.y = alto;
        tmp.project(camera);
        x0 = Math.min(x0, tmp.x);
        x1 = Math.max(x1, tmp.x);
        y0 = Math.min(y0, tmp.y);
        y1 = Math.max(y1, tmp.y);
      }
    }
    return { x0, x1, y0, y1, depth };
  }

  // Cada fotograma: cada pieza va hacia su opacidad, y las que tapan lo que importa, hacia `hidden`.
  function update(dt, camera) {
    if (!faded.size) return;
    let mirar = null;
    if (subjects && camera && !restoring) {
      camera.updateMatrixWorld();
      mirar = subjects().filter((s) => s?.anchor).map((s) => onScreen(s, camera)).filter(Boolean).map((r) => {
        const w = (r.x1 - r.x0) * SHRINK;
        const h = (r.y1 - r.y0) * SHRINK;
        return { x0: r.x0 + w, x1: r.x1 - w, y0: r.y0 + h, y1: r.y1 - h, depth: r.depth };
      });
    }
    const paso = dt * SPEED;
    for (const f of faded.values()) {
      if (!restoring) {
        let tapa = false;
        if (mirar?.length && f.anchor) {
          const r = onScreen(f, camera);
          tapa = Boolean(r) && mirar.some((s) => r.depth < s.depth - AHEAD
            && r.x0 < s.x1 && r.x1 > s.x0 && r.y0 < s.y1 && r.y1 > s.y0);
        }
        f.goal = tapa ? Math.min(hidden, f.base) : f.base;
      }
      const d = f.goal - f.opacity;
      f.opacity = Math.abs(d) <= paso ? f.goal : f.opacity + Math.sign(d) * paso;
      // Entera, se pinta como cualquier pieza (opaca y escribiendo profundidad); translúcida, sin
      // escribirla, que si no se tapa a sí misma a trozos.
      const opaca = f.opacity >= 0.999;
      for (const material of f.materials) {
        material.opacity = f.opacity;
        if (material.transparent === opaca) {
          material.transparent = !opaca;
          material.depthWrite = opaca;
        }
      }
      // Apagada del todo, ni se pinta: así tampoco deja su sombra sobre el tablero.
      if (f.opacity < OFF && f.object.visible) {
        f.object.visible = false;
        f.hiddenByUs = true;
      } else if (f.opacity >= OFF && f.hiddenByUs) {
        f.object.visible = true;
        f.hiddenByUs = false;
      }
    }
    if (waiters.length && settled()) {
      const listos = waiters;
      waiters = [];
      listos.forEach((resolve) => resolve());
    }
  }

  return { dim, watch, restore, update, get count() { return faded.size; } };
}
