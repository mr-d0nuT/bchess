import * as THREE from 'three';

// Mientras dos piezas pelean, las demás se vuelven translúcidas: así no tapan la escena aunque queden
// entre la cámara y el combate (lo pidió el usuario). Los materiales de un modelo los comparten todas
// sus copias, así que a la pieza que se atenúa se le clonan los suyos la primera vez.

const OPACITY = 0.18; // lo que queda de una pieza apartada del combate
const SECONDS = 0.35;

export function createFade(clock) {
  const faded = new Map(); // objeto de la pieza → sus materiales propios

  function ownMaterials(object) {
    let materials = faded.get(object);
    if (materials) return materials;
    materials = [];
    object.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      o.material = Array.isArray(o.material) ? list.map((m) => m.clone()) : list[0].clone();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        material.transparent = true;
        material.depthWrite = false;
        materials.push(material);
      }
    });
    faded.set(object, materials);
    return materials;
  }

  // Atenúa los objetos de `objects` (los de las piezas que no pelean).
  function dim(objects, { opacity = OPACITY, seconds = SECONDS } = {}) {
    const all = objects.flatMap((object) => ownMaterials(object));
    if (!all.length) return Promise.resolve();
    const from = all.map((material) => material.opacity);
    return clock.tween(seconds, (t) => {
      all.forEach((material, i) => {
        material.opacity = THREE.MathUtils.lerp(from[i], opacity, t);
      });
    });
  }

  // Devuelve a todas su color de siempre.
  async function restore({ seconds = SECONDS } = {}) {
    const all = [...faded.values()].flat();
    if (!all.length) return;
    const from = all.map((material) => material.opacity);
    await clock.tween(seconds, (t) => {
      all.forEach((material, i) => {
        material.opacity = THREE.MathUtils.lerp(from[i], 1, t);
      });
    });
    for (const material of all) {
      material.opacity = 1;
      material.transparent = false;
      material.depthWrite = true;
    }
    faded.clear();
  }

  return { dim, restore, get count() { return faded.size; } };
}
