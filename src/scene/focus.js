import * as THREE from 'three';

// PROFUNDIDAD DE CAMPO: mientras dos piezas pelean, la cámara enfoca a la distancia a la que están
// ellas y todo lo demás —las otras treinta piezas, el marco, el suelo— se va quedando borroso según
// se aleja de ese plano. Es lo que hace un teleobjetivo abierto, y es lo que separa un combate de un
// tablero con dos muñecos moviéndose: el ojo no tiene que buscar dónde mirar.
//
// No se desenfoca «a las piezas que no pelean», sino POR DISTANCIA, que es lo que hace una cámara de
// verdad: la que esté justo al lado del combate saldrá nítida, y así debe ser.
//
// La escena se pinta a una textura con su mapa de profundidad y luego se vuelca a la pantalla con un
// solo triángulo que, en cada píxel, mira lo lejos que está del plano de enfoque y promedia otros
// tantos de alrededor. Fuera del combate no se hace nada de esto: se pinta directo a la pantalla,
// como siempre, y ni siquiera se reserva la textura hasta el primer combate.

const TAPS = { movil: 10, ordenador: 22 }; // muestras del desenfoque, según la máquina
const MAX_BLUR = 0.012; // radio máximo, en alturas de pantalla
const RANGE = 1.15; // casillas a cada lado del plano de enfoque que siguen nítidas
const FADE = 0.45; // segundos que tarda en entrar y salir el desenfoque
const DEPTH_BIAS = 0.35; // lo que se adelanta el plano de enfoque hacia la cámara, para el que está delante

const VERTEX = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// El desenfoque es una espiral de muestras: con pocas, repartidas en ángulo dorado, no se ven los
// anillos que deja una circunferencia de muestras cuando el radio crece.
const FRAGMENT = (taps) => /* glsl */`
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float cameraNear;
uniform float cameraFar;
uniform float focusDistance;
uniform float focusRange;
uniform float maxBlur;
uniform float strength;
varying vec2 vUv;

const float GOLDEN = 2.39996323;

// De la profundidad del búfer (no lineal) a la distancia a la cámara, en unidades del tablero.
float distancia(float depth) {
  float ndc = depth * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
}

void main() {
  float lejos = distancia(texture2D(tDepth, vUv).x);
  float fuera = max(0.0, abs(lejos - focusDistance) - focusRange);
  float radio = maxBlur * strength * clamp(fuera / focusRange, 0.0, 1.0);
  vec4 suma = texture2D(tColor, vUv);
  float peso = 1.0;
  if (radio >= texel.y) {
    for (int i = 1; i <= ${taps}; i++) {
      float t = float(i) / float(${taps});
      float angulo = float(i) * GOLDEN;
      vec2 salto = vec2(cos(angulo), sin(angulo)) * sqrt(t) * radio;
      salto.x *= texel.x / texel.y; // el radio va en alturas de pantalla, no en anchuras
      suma += texture2D(tColor, vUv + salto);
      peso += 1.0;
    }
  }
  gl_FragColor = suma / peso;
  // La escena se ha pintado a una textura, y ahí three no hace nada de lo que sí haría al pintar a la
  // pantalla: ni el mapeo de tonos ni la conversión final de color. Se hacen aquí, con sus mismos
  // trozos de shader, y a TODOS los píxeles —también a los enfocados, que son los que pelean—: sin
  // esto el combate sale oscuro y los dos luchadores, casi negros.
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createFocus(renderer, scene, camera, quality) {
  const taps = TAPS[quality?.name] ?? TAPS.ordenador;
  let target = null;
  let material = null;
  let quad = null;
  let vista = null; // el punto al que se enfoca, o una función que lo devuelve
  let fuerza = 0; // 0 = nítido; 1 = desenfoque entero
  let quiere = 0;
  const punto = new THREE.Vector3();

  function prepara() {
    if (target) return;
    const { width, height } = renderer.getDrawingBufferSize(new THREE.Vector2());
    target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthTexture: Object.assign(new THREE.DepthTexture(width, height), {
        format: THREE.DepthFormat,
        type: THREE.UnsignedIntType,
      }),
    });
    material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT(taps),
      uniforms: {
        tColor: { value: target.texture },
        tDepth: { value: target.depthTexture },
        texel: { value: new THREE.Vector2(1 / width, 1 / height) },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
        focusDistance: { value: 6 },
        focusRange: { value: RANGE },
        maxBlur: { value: MAX_BLUR },
        strength: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    // Un triángulo que tapa la pantalla: más barato que dos y sin costura en la diagonal.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
  }

  // El tamaño se mira en cada volcado y no en un `resize` propio: quien cambia el del lienzo es
  // `stage`, y aquí solo importa ir detrás de él.
  const medida = new THREE.Vector2();
  function ajusta() {
    renderer.getDrawingBufferSize(medida);
    if (target.width === medida.x && target.height === medida.y) return;
    target.setSize(medida.x, medida.y);
    material.uniforms.texel.value.set(1 / medida.x, 1 / medida.y);
  }

  // Enfoca a `at` ({ x, y, z } o una función que lo devuelve): el combate.
  function on(at) {
    vista = at;
    quiere = 1;
    prepara();
  }

  function off() {
    quiere = 0;
  }

  function render(dt = 0) {
    fuerza += Math.max(-dt / FADE, Math.min(dt / FADE, quiere - fuerza));
    if (!target || fuerza <= 0.001) {
      if (fuerza <= 0.001) vista = null;
      renderer.render(scene, camera);
      return;
    }
    ajusta();
    const at = typeof vista === 'function' ? vista() : vista;
    if (at) {
      punto.set(at.x ?? 0, at.y ?? 0, at.z ?? 0);
      // El plano de enfoque se adelanta un poco: en un plano corto, el que está de espaldas a la
      // cámara tapa al otro, y enfocando al punto medio los dos quedan en el filo de lo nítido.
      material.uniforms.focusDistance.value = Math.max(camera.near, camera.position.distanceTo(punto) - DEPTH_BIAS);
    }
    material.uniforms.cameraNear.value = camera.near;
    material.uniforms.cameraFar.value = camera.far;
    material.uniforms.strength.value = fuerza;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(quad, CAMARA_PLANA);
  }

  return { on, off, render, get active() { return fuerza > 0.001; } };
}

// La cámara del volcado a pantalla no mira nada: el triángulo ya viene en coordenadas de pantalla.
const CAMARA_PLANA = new THREE.Camera();
