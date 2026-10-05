import * as THREE from 'three';
import { sfx } from '../audio/sfx.js';
import { grita } from '../audio/voces.js';
import { celebrate } from '../combat/knight/common.js';
import { poseTo } from '../combat/royal/royal.js';
import { COLORS } from '../fx/confetti.js';
import { QUEEN, restPoseOf } from '../pieces/cast.js';

// LA CORONACIÓN (punto 7 del plan de mejora). Antes el peón se esfumaba entre chispas y la pieza nueva
// crecía de la nada. Ahora es un momento:
//
// 1. La cámara se le pone delante, algo por debajo (un contrapicado: se ve subir).
// 2. Del suelo brota una columna de luz dorada y el peón se eleva dentro de ella, girando cada vez más
//    deprisa, entre chispas que suben.
// 3. Arriba, un fogonazo: el peón ya es la pieza elegida, que sigue girando, frena y baja despacio a su
//    casilla mientras la luz se apaga.
// 4. Y hace su pose: la reina alza los brazos, el alfil y el caballero, su victoria, y la torre dispara un
//    cohete desde sus almenas.

const LOOK_UP = 1.45; // a qué altura mira la cámara
const CLOSE_DISTANCE = 3.7;
const CLOSE_DISTANCE_TALL = 4.8; // en una pantalla vertical, más lejos
const CLOSE_RISE = -0.1; // la cámara, algo por debajo de lo que mira
const CAMERA_SECONDS = 0.7;
const GROW_SECONDS = 0.4; // lo que tarda la columna en brotar
const RISE = 0.85; // lo que sube la pieza dentro de la columna (con su peana)
const RISE_SECONDS = 1.3;
const SPIN_TURNS = 2; // vueltas mientras sube (y una más, frenando, ya transformada)
const POP_SECONDS = 0.3; // la pieza nueva aparece algo pequeña y se hincha
const DESCEND_SECONDS = 1;
const FADE_SECONDS = 0.7;
const COLUMN_HEIGHT = 6;
const COLUMN_RADIUS = 0.55;
const COLUMN_COLOR = '#ffd47e';

// La luz: rayas verticales, fuertes abajo y que se pierden hacia arriba.
function streaksTexture() {
  const w = 64;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  for (let x = 0; x < w; x++) {
    const raya = 0.35 + 0.65 * Math.abs(Math.sin(x * 0.7) * Math.sin(x * 0.23 + 1.3));
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.55, `rgba(255,255,255,${0.35 * raya})`);
    gradient.addColorStop(1, `rgba(255,255,255,${raya})`);
    g.fillStyle = gradient;
    g.fillRect(x, 0, 1, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function glowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const c = size / 2;
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const easeInOut = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeIn = (t) => t * t;

// `scene`: donde va la luz. `camera`, `cinema`, `clock`, los de siempre. `fx`: las chispas (`burst`,
// `updraft`); `dust`, `confetti`: el polvo al posarse y el cohete de la torre.
export function createCoronation({ scene, camera, cinema, clock, fx, dust, confetti }) {
  // La columna (dos cilindros abiertos: un núcleo y su halo) y el resplandor del suelo. Se hacen una vez.
  const column = new THREE.Group();
  const streaks = streaksTexture();
  const capas = [
    // Suaves: la luz se suma a lo de detrás, y más fuerte el peón de dentro ni se veía.
    { radius: COLUMN_RADIUS * 0.45, opacity: 0.5 },
    { radius: COLUMN_RADIUS, opacity: 0.28 },
  ].map(({ radius, opacity }) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, COLUMN_HEIGHT, 40, 1, true);
    geometry.translate(0, COLUMN_HEIGHT / 2, 0); // la base en el suelo: crece hacia arriba
    const material = new THREE.MeshBasicMaterial({
      map: streaks,
      color: COLUMN_COLOR,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 9;
    column.add(mesh);
    return { material, opacity };
  });
  const suelo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: COLUMN_COLOR, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  suelo.rotation.x = -Math.PI / 2;
  suelo.position.y = 0.015;
  column.add(suelo);
  column.visible = false;
  scene.add(column);
  let brillo = 0; // lo que luce la columna ahora, de 0 a 1
  let giro = 0;

  function luce(k) {
    brillo = k;
    for (const capa of capas) capa.material.opacity = capa.opacity * k;
    suelo.material.opacity = k;
    column.visible = k > 0.001;
  }

  // Un cohete desde lo alto de la torre recién coronada, de los colores de su bando.
  function cohete(entry, color) {
    const top = entry.piece.figure.getWorldPosition(new THREE.Vector3());
    top.y += entry.piece.height ?? 2.4;
    sfx.play('silbido', { rate: 0.7, volume: 0.5 });
    confetti?.firework(top, { colors: COLORS[color], height: 2, onBurst: () => sfx.play('disparo', { rate: 0.7, volume: 0.3 }) });
  }

  // La pose de la pieza recién coronada.
  async function pose(entry, color) {
    const piece = entry.piece;
    if (entry.kind === 'queen') {
      grita(entry, 'victoria');
      const reposo = restPoseOf(piece);
      await poseTo(piece, reposo, QUEEN.summon, { clock, seconds: 0.45 });
      await clock.wait(0.8);
      await poseTo(piece, QUEEN.summon, reposo, { clock, seconds: 0.5 });
      for (const bone of Object.keys(QUEEN.summon)) piece.turnBone(bone, reposo[bone] ?? null);
    } else if (entry.kind === 'rook') {
      cohete(entry, color);
      await clock.wait(1.2);
    } else {
      await celebrate(entry, clock);
    }
  }

  return {
    // `pawn`: el peón que corona (ya en su casilla). `swap()`: lo quita y pone en su casilla la pieza nueva,
    // que devuelve. Mientras tanto, la cámara es de la coronación; al acabar se devuelve.
    async play({ pawn, color, swap }) {
      const at = pawn.piece.figure.getWorldPosition(new THREE.Vector3()).setY(0);
      // La cámara, delante y algo por debajo, desde el lado del usuario.
      const desde = camera.position.clone().sub(at).setY(0).normalize();
      cinema.shot(clock, {
        look: new THREE.Vector3(at.x, LOOK_UP, at.z),
        dir: desde,
        distance: cinema.portrait ? CLOSE_DISTANCE_TALL : CLOSE_DISTANCE,
        rise: CLOSE_RISE,
        seconds: CAMERA_SECONDS,
      });
      // Brota la columna.
      column.position.copy(at);
      column.scale.set(1, 0.01, 1);
      luce(1);
      sfx.play('conjuro', { volume: 0.8 });
      clock.tween(GROW_SECONDS, (t) => column.scale.set(1, Math.max(0.01, easeOut(t)), 1));
      fx.updraft?.(new THREE.Vector3(at.x, 0, at.z), { seconds: RISE_SECONDS + 0.8, count: 40, color: COLUMN_COLOR, radius: 0.5, height: 3.2 });
      // Y el peón sube girando, cada vez más deprisa.
      const object = pawn.piece.object;
      const figure = pawn.piece.figure;
      const facing = figure.rotation.y;
      await clock.tween(RISE_SECONDS, (t) => {
        object.position.y = RISE * easeInOut(t);
        figure.rotation.y = facing + SPIN_TURNS * Math.PI * 2 * easeIn(t);
        giro += 0.02;
        streaks.offset.x = giro;
      });
      // ¡Fogonazo! Ya es la pieza elegida.
      const arriba = new THREE.Vector3(at.x, RISE + 1.1, at.z);
      fx.burst?.(arriba, { size: 2.4, sparks: 40 });
      sfx.play('corona');
      cinema.shake(0.04);
      object.position.y = 0;
      figure.rotation.y = facing;
      const entry = swap();
      if (!entry) {
        luce(0);
        await cinema.restore(clock);
        return null;
      }
      const nueva = entry.piece.object;
      const cuerpo = entry.piece.figure;
      const reposo = cuerpo.rotation.y;
      nueva.position.y = RISE;
      // Aparece algo pequeña y se hincha, girando todavía; frena y baja despacio a su casilla.
      clock.tween(POP_SECONDS, (t) => nueva.scale.setScalar(0.6 + 0.4 * easeOut(t) + Math.sin(Math.PI * t) * 0.08));
      await clock.tween(DESCEND_SECONDS, (t) => {
        nueva.position.y = RISE * (1 - easeOut(t));
        cuerpo.rotation.y = reposo + Math.PI * 2 * (1 - easeOut(t));
        giro += 0.015;
        streaks.offset.x = giro;
      });
      nueva.position.y = 0;
      nueva.scale.setScalar(1);
      cuerpo.rotation.y = reposo;
      sfx.play('pieza', { rate: 0.8 });
      dust?.puff(new THREE.Vector3(at.x, 0.02, at.z), { count: 8, radius: 0.55, duration: 0.5, size: 0.6 });
      // Se apaga la luz mientras hace su pose.
      const desde0 = brillo;
      clock.tween(FADE_SECONDS, (t) => {
        luce(desde0 * (1 - t));
        column.scale.set(1 - 0.5 * t, 1, 1 - 0.5 * t);
      }).then(() => luce(0));
      await pose(entry, color);
      await cinema.restore(clock);
      return entry;
    },
  };
}
