import * as THREE from 'three';

// Quemado: un cuerpo que se va quedando negro como un tizón, con el rojo de las ascuas brillándole
// un poco por encima. Lo usan el fuego de la reina negra y la bomba del peón.
//
// A la figura se le clonan los materiales (los comparten todas las copias del mismo modelo: sin
// clonarlos se quemarían los ocho peones) y se devuelve una función que la lleva de su color al de un
// tizón (`k` de 0 a 1), con el brillo de ascuas que se le diga.

const CARBON = new THREE.Color('#0d0806'); // lo que queda de un cuerpo quemado
const EMBER = new THREE.Color('#ff3a0a'); // y el rojo de las ascuas que le brillan por encima

// Le clona los materiales a la figura y apunta cómo eran.
function propios(figure) {
  const materiales = [];
  figure.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const lista = Array.isArray(o.material) ? o.material : [o.material];
    const clones = lista.map((m) => m.clone());
    o.material = Array.isArray(o.material) ? clones : clones[0];
    for (const m of clones) {
      materiales.push({ m, color: m.color?.clone(), emissive: m.emissive?.clone(), intensity: m.emissiveIntensity ?? 1 });
    }
  });
  return materiales;
}

export function charring(figure) {
  const materiales = propios(figure);
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

// EL CALAMBRE: el rayo le pasa por el cuerpo y parpadea entre un blanco que deslumbra y un negro de
// chamusquina, como en los dibujos animados. Devuelve una función que lo pone blanco (`blanco`, de 0 a
// 1) o negro (`negro`), y con `ascuas` (un brillo muy tenue, 0,05) humeando por dentro, como un tizón;
// con (0, 0), como estaba. Un brillo de ascuas fuerte, como el de `charring`, lo dejaba rojo entero: en
// un cuerpo negro, cualquier emisión manda.
const DESCARGA = new THREE.Color('#e4f2ff');

export function zapping(figure) {
  const materiales = propios(figure);
  return (blanco, negro = 0, ascuas = 0) => {
    for (const { m, color, emissive, intensity } of materiales) {
      if (color) m.color.copy(color).lerp(CARBON, negro);
      if (!emissive) continue;
      if (blanco > 0) {
        m.emissive.copy(emissive).lerp(DESCARGA, blanco);
        m.emissiveIntensity = intensity * (1 - blanco) + 2.2 * blanco;
      } else if (ascuas > 0) {
        m.emissive.copy(EMBER);
        m.emissiveIntensity = ascuas;
      } else {
        m.emissive.copy(emissive);
        m.emissiveIntensity = intensity;
      }
    }
  };
}
