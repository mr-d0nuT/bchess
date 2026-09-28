import * as THREE from 'three';

// Quemado: un cuerpo que se va quedando negro como un tizón, con el rojo de las ascuas brillándole
// un poco por encima. Lo usan el fuego de la reina negra y la bomba del peón.
//
// A la figura se le clonan los materiales (los comparten todas las copias del mismo modelo: sin
// clonarlos se quemarían los ocho peones) y se devuelve una función que la lleva de su color al de un
// tizón (`k` de 0 a 1), con el brillo de ascuas que se le diga.

const CARBON = new THREE.Color('#0d0806'); // lo que queda de un cuerpo quemado
const EMBER = new THREE.Color('#ff3a0a'); // y el rojo de las ascuas que le brillan por encima

export function charring(figure) {
  const materiales = [];
  figure.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const lista = Array.isArray(o.material) ? o.material : [o.material];
    const propios = lista.map((m) => m.clone());
    o.material = Array.isArray(o.material) ? propios : propios[0];
    for (const m of propios) {
      materiales.push({ m, color: m.color?.clone(), emissive: m.emissive?.clone(), intensity: m.emissiveIntensity ?? 1 });
    }
  });
  return (k, brillo = 0) => {
    for (const { m, color, emissive, intensity } of materiales) {
      if (color) m.color.copy(color).lerp(CARBON, k);
      if (emissive) {
        m.emissive.copy(emissive).lerp(EMBER, k);
        m.emissiveIntensity = intensity * (1 - k) + brillo * k;
      }
    }
  };
}
