import * as THREE from 'three';

// UNA PIEL NUEVA QUE TREPA: la piedra del alfil o el hielo de la reina blanca, que suben por una figura
// desde los pies hasta la cabeza con un frente que brilla. Antes, el color se iba de toda la figura a la
// vez, como un fundido, y no se leía como un conjuro que la atrapa.
//
// Se clonan sus materiales (los comparten todas las copias del mismo modelo) y se les mete un trozo de
// sombreador: por debajo de una altura del mundo (`level`), el color, el brillo y la rugosidad son los de la
// piel nueva, con su grano; justo en la línea, un resplandor; y la línea no es recta, se mella con un ruido,
// que la piedra no sube en bandeja. De la figura de antes se guarda un poco del relieve de su textura
// (`keep`): una estatua conserva los detalles tallados.

export function creep(object, { color, edge, roughness = 1, metalness = 0, keep = 0.3, grain = 0.3, band = 0.08, glow = 1.6 }) {
  const uniforms = {
    uNivel: { value: -10 },
    uPiel: { value: new THREE.Color(color) },
    uBorde: { value: new THREE.Color(edge) },
    uKeep: { value: keep },
    uGrano: { value: grain },
    uBanda: { value: band },
    uBrillo: { value: glow },
    uRugoso: { value: roughness },
    uMetal: { value: metalness },
  };
  object.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const nuevos = list.map((material) => {
      const copia = material.clone();
      inject(copia, uniforms);
      return copia;
    });
    o.material = Array.isArray(o.material) ? nuevos : nuevos[0];
  });
  return {
    // La altura (del mundo) hasta la que ha subido la piel nueva.
    get level() {
      return uniforms.uNivel.value;
    },
    set level(y) {
      uniforms.uNivel.value = y;
    },
    // El resplandor del frente: al acabar de subir, se apaga.
    set glow(value) {
      uniforms.uBrillo.value = value;
    },
  };
}

function inject(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTrepa;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvTrepa = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vTrepa;
uniform float uNivel, uKeep, uGrano, uBanda, uBrillo, uRugoso, uMetal;
uniform vec3 uPiel, uBorde;
`)
      .replace('#include <map_fragment>', `#include <map_fragment>
// El frente, mellado con ondas suaves (un ruido por bloques lo dejaba a cuadros); y el grano, a manchas.
float trepaMella = (sin(vTrepa.x * 23.0 + vTrepa.z * 17.0) * 0.5 + sin(vTrepa.z * 31.0 - vTrepa.x * 13.0) * 0.3
  + sin((vTrepa.x + vTrepa.z) * 47.0 + vTrepa.y * 9.0) * 0.2) * uBanda * 0.9;
float trepaBajo = step(vTrepa.y, uNivel + trepaMella);
float trepaManchas = sin(vTrepa.x * 37.0) * sin(vTrepa.y * 41.0) * sin(vTrepa.z * 29.0);
float trepaGrano = 1.0 + uGrano * 0.5 * trepaManchas;
float trepaLuz = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
vec3 trepaPiel = uPiel * trepaGrano * mix(1.0, 0.55 + trepaLuz, uKeep);
diffuseColor.rgb = mix(diffuseColor.rgb, trepaPiel, trepaBajo);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, uRugoso, trepaBajo);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, uMetal, trepaBajo);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float trepaFrente = 1.0 - smoothstep(0.0, uBanda, abs(vTrepa.y - (uNivel + trepaMella)));
totalEmissiveRadiance += uBorde * trepaFrente * uBrillo;`);
  };
  material.customProgramCacheKey = () => 'trepa';
  material.needsUpdate = true;
}
