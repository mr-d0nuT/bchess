import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// LAS COORDENADAS DEL TABLERO (lo pidió el usuario): las letras de las columnas y los números de las filas, en el
// borde del marco y no en las casillas, de oro, metálicos y en relieve. Son 3D de verdad: el contorno de cada
// letra (Cormorant Garamond SemiBold, con sus cifras alineadas; ver `tools/coordenadas-fuente.py`) se extruye con
// un bisel redondeado, que es lo que coge los brillos del oro y hace que se lea el relieve.
//
// En los cuatro lados, y todas derechas para quien mira: desde las blancas, como se leen desde ahí; al dar la vuelta
// al tablero (o jugar con negras), cada una gira media vuelta sobre sí misma. Con las del otro lado giradas para
// él, desde las blancas el 6 de la derecha parecía un 9.

const FONT = 'assets/fonts/coordenadas.json';
const FILES = 'abcdefgh';
const RANKS = '12345678';
const BORDER = 4.25; // el centro de la franja del marco (las casillas acaban en 4 y el marco en 4,5)
const FRAME_TOP = -0.02; // la cara de arriba del marco (`board.js`)
const DIGIT_HEIGHT = 0.25; // lo que miden las cifras (y en proporción, las letras): media franja
const DEPTH = 0.006; // lo que sobresale el cuerpo de la letra…
const BEVEL = { thickness: 0.009, size: 0.0035 }; // …y su bisel, que la redondea
// El oro: metal pulido, algo cálido. Con el entorno de la escena (`lighting.js`) refleja la sala.
const GOLD = { color: 0xf7cf78, roughness: 0.24, metalness: 1 };
const CREASE = THREE.MathUtils.degToRad(40);

// Las formas (THREE.Shape) de un glifo de TrueType: contornos de puntos sobre la curva y de control
// (cuadráticos); dos de control seguidos llevan, en medio, uno sobre la curva implícito.
function glyphShapes(glyph) {
  const path = new THREE.ShapePath();
  for (const points of glyph.contornos) {
    const n = points.length;
    if (n < 2) continue;
    let start = points.findIndex((p) => p[2]);
    let first;
    if (start < 0) {
      start = 0;
      first = [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
    } else {
      first = points[start];
    }
    path.moveTo(first[0], first[1]);
    let control = null;
    for (let k = 1; k <= n; k++) {
      const p = points[(start + k) % n];
      if (p[2]) {
        if (control) path.quadraticCurveTo(control[0], control[1], p[0], p[1]);
        else path.lineTo(p[0], p[1]);
        control = null;
      } else {
        if (control) {
          const mx = (control[0] + p[0]) / 2;
          const my = (control[1] + p[1]) / 2;
          path.quadraticCurveTo(control[0], control[1], mx, my);
        }
        control = p;
      }
    }
    if (control) path.quadraticCurveTo(control[0], control[1], first[0], first[1]);
  }
  // En TrueType, el contorno de fuera va en el sentido de las agujas del reloj y los huecos al revés: lo que
  // `toShapes` entiende por defecto.
  return path.toShapes();
}

// La geometría de un glifo, tumbada sobre el marco: el relieve hacia arriba (+Y), la letra leyéndose desde +Z (las
// blancas) y centrada en el origen. `center`, en unidades de la fuente: el punto del glifo que va al centro.
function glyphGeometry(glyph, scale, center, { curveSegments, bevelSegments }) {
  const geometry = new THREE.ExtrudeGeometry(glyphShapes(glyph), {
    depth: DEPTH / scale,
    bevelEnabled: true,
    bevelThickness: BEVEL.thickness / scale,
    bevelSize: BEVEL.size / scale,
    bevelSegments,
    curveSegments,
  });
  geometry.translate(-center.x, -center.y, 0);
  geometry.scale(scale, scale, scale);
  geometry.rotateX(-Math.PI / 2); // de pie a tumbada: su arriba, hacia el fondo del tablero (-Z)
  return geometry;
}

// Dónde va el centro de un glifo: a lo ancho, el centro de su avance; a lo alto, el de la banda de su clase (las
// letras, el ojo de la minúscula; las cifras, su altura), que así las de una fila quedan sobre la misma línea y
// las astas de la b, la d o la h suben y la g baja, como en un libro.
function centerOf(glyph, band) {
  return { x: glyph.avance / 2, y: band / 2 };
}

// Las coordenadas, en un grupo que se llena al llegar la fuente. `detail`: 'alta' u otra cosa (el móvil). Devuelve
// el grupo y `orient(posición de la cámara)`, que las pone derechas para el lado desde el que se mira.
export function createCoordinates({ detail = 'alta' } = {}) {
  const group = new THREE.Group();
  group.name = 'coordenadas';
  const settings = detail === 'alta' ? { curveSegments: 6, bevelSegments: 3 } : { curveSegments: 4, bevelSegments: 2 };
  const material = new THREE.MeshStandardMaterial(GOLD);
  material.name = 'oro';
  fetch(FONT)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((font) => {
      const glyphs = font.glifos;
      const digitBand = bandHeight(RANKS.split('').map((c) => glyphs[c]));
      const letterBand = xHeight(glyphs);
      const scale = DIGIT_HEIGHT / digitBand;
      // Dos juegos: derechas desde las blancas y derechas desde las negras (cada letra, girada sobre sí misma).
      const parts = { white: [], black: [] };
      const place = (char, band, x, z) => {
        const geometry = glyphGeometry(glyphs[char], scale, centerOf(glyphs[char], band), settings);
        const turned = geometry.clone().rotateY(Math.PI);
        parts.white.push(geometry.translate(x, FRAME_TOP, z));
        parts.black.push(turned.translate(x, FRAME_TOP, z));
      };
      for (let i = 0; i < 8; i++) {
        place(FILES[i], letterBand, i - 3.5, BORDER); // las letras, abajo…
        place(FILES[i], letterBand, i - 3.5, -BORDER); // …y arriba
        place(RANKS[i], digitBand, -BORDER, 3.5 - i); // los números, a la izquierda…
        place(RANKS[i], digitBand, BORDER, 3.5 - i); // …y a la derecha
      }
      for (const side of ['white', 'black']) {
        const merged = mergeGeometries(parts[side], false);
        for (const part of parts[side]) part.dispose();
        // El bisel, liso: con las normales de cada cara salía en facetas. Se suavizan entre caras que forman menos
        // de CREASE, y la cara de arriba sigue con su arista viva, que es la que da el corte del grabado.
        const geometry = toCreasedNormals(merged, CREASE);
        merged.dispose();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `coordenadas-${side}`;
        mesh.receiveShadow = true;
        mesh.visible = side === facing;
        meshes[side] = mesh;
        group.add(mesh);
      }
    })
    .catch((err) => console.warn('[BChess] No se pudieron cargar las coordenadas del tablero:', err));
  const meshes = {};
  let facing = 'white';
  return {
    group,
    // Las blancas miran desde +Z; las negras, desde -Z. Se cambia pasado el medio con un margen, que la cámara
    // que rodea el tablero de lado no las haga bailar.
    orient(camera) {
      const want = camera.z > SWITCH ? 'white' : camera.z < -SWITCH ? 'black' : facing;
      if (want === facing) return;
      facing = want;
      if (meshes.white) meshes.white.visible = facing === 'white';
      if (meshes.black) meshes.black.visible = facing === 'black';
    },
  };
}
const SWITCH = 0.5;

// La altura de las cifras: la más alta de ellas (el borde de arriba de su caja).
function bandHeight(glyphs) {
  let top = 0;
  for (const glyph of glyphs) for (const contour of glyph.contornos) for (const p of contour) top = Math.max(top, p[1]);
  return top;
}

// El ojo de la minúscula: lo alto de la «a», la «c» y la «e», que no tienen astas.
function xHeight(glyphs) {
  return bandHeight(['a', 'c', 'e'].map((c) => glyphs[c]));
}
