import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion } from './clips.js';
import { pickHandBone } from './bones.js';
import { createSpear } from './spear.js';
import { strideSpeed } from '../moves/walk.js';
import { slideAboveFloor } from './grip.js';

// Piezas con esqueleto. `loadPieceKit` carga una sola vez los modelos de un tipo de pieza
// (por ejemplo, el peón blanco) y prepara sus animaciones, con varias versiones por acción;
// `spawnPiece` crea cada pieza compartiendo mallas, texturas y clips, con su propio esqueleto,
// lanza, escudo, peana y zona de toque. `figure` y `pedestal` van en coordenadas del tablero.

THREE.Cache.enabled = true; // un fichero de animaciones compartido por dos colores se descarga una vez

const MODELS = 'assets/models/';
const FALLBACK_PEDESTAL_HEIGHT = 0.26;
// Posturas de la lanza respecto a la figura cuando deja de seguir a la mano: en estocada, su
// eje (+Y) apunta al frente y un poco hacia abajo; erguida, hacia arriba.
const SPEAR_POSES = {
  forward: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(98)),
  upright: new THREE.Quaternion(),
};
const SPEAR_TURN_SPEED = 7; // por segundo: la lanza tarda ~0,15 s en cambiar de postura
const SPEAR_FLOOR_MARGIN = 0.02; // lo que queda su extremo más bajo por encima del suelo

export async function loadManifest() {
  const response = await fetch(`${MODELS}manifest.json`);
  if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}`);
  return response.json();
}

// Escala un objeto recién cargado (sin transformar) a una altura, con la base en y = 0
// y centrado en X y Z.
function fitToHeight(object, height) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const k = height / (box.max.y - box.min.y);
  object.scale.setScalar(k);
  object.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
}

// Engancha un objeto a un hueso colocándolo primero en el espacio de la figura: en la
// posición del hueso más `offset`, con el giro `rotation` y la escala `scale`, todo en
// unidades del tablero. `attach` conserva esa colocación y desde entonces sigue al hueso,
// sin depender de cómo orienta cada programa los ejes de sus huesos.
function attachInWorld(prop, bone, { offset = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
  const at = bone.getWorldPosition(new THREE.Vector3());
  prop.position.set(at.x + offset[0], at.y + offset[1], at.z + offset[2]);
  prop.rotation.set(rotation[0], rotation[1], rotation[2]);
  prop.scale.setScalar(scale);
  prop.updateMatrixWorld(true);
  bone.attach(prop);
  return prop;
}

// Peana de reserva mientras no haya modelo 3D: un cilindro de madera clara con molduras.
function createFallbackPedestal(height) {
  const wood = new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 0.6, metalness: 0 });
  const profile = [
    [0, 0], [0.47, 0], [0.47, 0.05], [0.44, 0.07], [0.42, 0.2], [0.44, 0.22], [0.44, 0.26], [0, 0.26],
  ].map(([x, y]) => new THREE.Vector2(x, (y / 0.26) * height));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), wood);
  return withShadows(new THREE.Group().add(mesh));
}

function withShadows(object) {
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return object;
}

// Pista de posición de la cadera de un clip, con su eje vertical, o null.
function rootTrack(clip) {
  const name = pickRootPositionTrack(clip.tracks.map((t) => t.name));
  const track = name ? clip.tracks.find((t) => t.name === name) : null;
  if (!track) return null;
  return { name, track, upAxis: pickUpAxis([track.values[0], track.values[1], track.values[2]]) };
}

export async function loadPieceKit(spec, quality) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  // El escudo y la peana son opcionales: sin peana, se usa la de reserva.
  const optional = (entry) => (entry ? loader.loadAsync(MODELS + entry.files[quality.name]) : null);
  const [pieceGltf, shieldGltf, pedestalGltf, ...animationGltfs] = await Promise.all([
    loader.loadAsync(MODELS + spec.files[quality.name]),
    optional(spec.shieldModel),
    optional(spec.pedestalModel),
    ...(spec.animationFiles ?? []).map((file) => loader.loadAsync(MODELS + file)),
  ]);
  const clips = [...pieceGltf.animations, ...animationGltfs.flatMap((g) => g.animations)];
  // Solo la cadera conserva su pista de posición: así las animaciones de un esqueleto sirven
  // a otro de proporciones algo distintas (cada hueso mantiene su propia longitud).
  for (const clip of clips) {
    const rootName = pickRootPositionTrack(clip.tracks.map((t) => t.name));
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.position') || t.name === rootName);
  }
  const clipNames = clips.map((c) => c.name);
  const clipByName = (name) => clips.find((c) => c.name === name);

  const model = withShadows(pieceGltf.scene);
  fitToHeight(model, spec.height);
  model.updateMatrixWorld(true);
  const pedestalHeight = spec.pedestalModel?.height ?? FALLBACK_PEDESTAL_HEIGHT;
  const pedestal = pedestalGltf ? withShadows(pedestalGltf.scene) : createFallbackPedestal(pedestalHeight);
  fitToHeight(pedestal, pedestalHeight);
  const shield = shieldGltf ? withShadows(shieldGltf.scene) : null;
  if (shield) fitToHeight(shield, spec.shieldModel.height);

  const { moves, missing } = resolveMoves(clipNames, spec.moves ?? {});
  if (missing.length) console.warn(`[BChess] El manifiesto pide clips que no están en el GLB: ${missing.join(', ')}. Clips: ${clipNames.join(', ')}`);
  for (const action of ['idle', 'walk', 'attack', 'hit', 'fall']) {
    if (!moves[action].length) console.warn(`[BChess] La pieza no tiene animación «${action}». Clips: ${clipNames.join(', ') || '(ninguno)'}`);
  }

  // Las pistas se cambian ANTES de crear acciones, porque cada acción las copia al crearse.
  // Paseo: se quita su avance y de él sale la velocidad. Resto: `travel` acorta el
  // desplazamiento (por ejemplo, para que una caída se quede en su casilla).
  let walkSpeed = strideSpeed({ rootDistance: 0, clipDuration: 1, height: spec.height });
  const touched = new Set();
  const walkClip = moves.walk[0] ? clipByName(moves.walk[0].clip) : null;
  const walkRoot = walkClip ? rootTrack(walkClip) : null;
  if (walkRoot) {
    const { distance, values } = removeLinearDrift(walkRoot.track.times, walkRoot.track.values, walkRoot.upAxis);
    walkRoot.track.values = values;
    touched.add(walkClip.name);
    const bone = model.getObjectByName(walkRoot.name.slice(0, -'.position'.length));
    const parentScale = bone?.parent ? bone.parent.getWorldScale(new THREE.Vector3()).x : 1;
    walkSpeed = strideSpeed({ rootDistance: distance * parentScale, clipDuration: walkClip.duration, height: spec.height });
  }
  for (const variants of Object.values(moves)) {
    for (const variant of variants) {
      if (variant.travel === undefined || touched.has(variant.clip)) continue;
      const root = rootTrack(clipByName(variant.clip));
      if (root) root.track.values = scaleHorizontalMotion(root.track.values, root.upAxis, variant.travel);
      touched.add(variant.clip);
    }
  }

  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o.name); });
  const hands = {
    right: spec.hands?.right ?? pickHandBone(bones, 'right'),
    left: spec.hands?.left ?? pickHandBone(bones, 'left'),
  };
  if (!hands.right || !hands.left) console.warn(`[BChess] No encuentro las manos de la pieza. Huesos: ${bones.join(', ')}`);

  return {
    spec,
    model,
    pedestal,
    pedestalHeight,
    shield,
    clips,
    moves,
    walkSpeed,
    hands,
    has: (action) => Boolean(moves[action]?.length),
  };
}

export function spawnPiece(kit) {
  const { spec } = kit;

  const pedestal = new THREE.Group();
  pedestal.name = 'peana';
  pedestal.add(kit.pedestal.clone());

  const figure = new THREE.Group();
  figure.name = 'figura';
  const turn = new THREE.Group();
  turn.rotation.y = spec.yaw ?? 0;
  const model = cloneSkinned(kit.model);
  turn.add(model);
  figure.add(turn);

  // Zona de toque invisible: un cilindro del tamaño de la pieza, más fácil de acertar que la malla.
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, spec.height, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = spec.height / 2;
  figure.add(hitbox);

  const object = new THREE.Group();
  object.name = 'pieza';
  object.add(pedestal, figure);
  object.updateMatrixWorld(true);

  const mixer = new THREE.AnimationMixer(model);
  const variants = {};
  for (const [action, list] of Object.entries(kit.moves)) {
    variants[action] = list.map((variant) => ({ ...variant, action: mixer.clipAction(kit.clips.find((c) => c.name === variant.clip)) }));
  }
  const lastVariant = {};
  let current = null;
  let playCount = 0;
  let spearTarget = 0; // 0 = lanza en la mano; 1 = en la postura `spearPose`
  let spearBlend = 0;
  let spearPose = SPEAR_POSES.forward;

  // Reproduce una versión al azar de la acción (sin repetir la anterior).
  function play(action, { loop = true, fade = 0.25 } = {}) {
    const list = variants[action];
    if (!list?.length) return null;
    const index = pickVariant(list.length, lastVariant[action] ?? -1);
    lastVariant[action] = index;
    const variant = list[index];
    const next = variant.action;
    next.reset();
    next.setEffectiveWeight(1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    if (current && current !== next) next.crossFadeFrom(current, fade, false);
    next.play();
    current = next;
    const pose = SPEAR_POSES[variant.spear];
    if (pose) spearPose = pose;
    spearTarget = pose ? 1 : 0;
    playCount++;
    return next;
  }

  function playOnce(action, { fade = 0.2 } = {}) {
    return new Promise((resolve) => {
      const running = play(action, { loop: false, fade });
      if (!running) {
        resolve(false);
        return;
      }
      const done = (event) => {
        if (event.action !== running) return;
        mixer.removeEventListener('finished', done);
        resolve(true);
      };
      mixer.addEventListener('finished', done);
    });
  }

  // Gesto suelto en reposo (rascarse, mirar alrededor…). No bloquea: si mientras tanto
  // se pide otro movimiento, al terminar el gesto no vuelve a reposo.
  function fidget() {
    const idle = variants.idle?.[0]?.action;
    if (!variants.fidget?.length || current !== idle) return false;
    const running = play('fidget', { loop: false, fade: 0.3 });
    const count = playCount;
    const done = (event) => {
      if (event.action !== running) return;
      mixer.removeEventListener('finished', done);
      if (count === playCount) play('idle', { fade: 0.4 });
    };
    mixer.addEventListener('finished', done);
    return true;
  }

  // Lanza y escudo: se enganchan con la pieza ya en la postura de reposo (aún en el origen
  // y sin girar), colocados antes en el espacio de la figura; la lanza, vertical.
  play('idle', { fade: 0 });
  mixer.update(0);
  object.updateMatrixWorld(true);
  const boneFor = (side) => (kit.hands[side] ? model.getObjectByName(kit.hands[side]) : null);
  const props = {};
  const spearBone = spec.spear ? boneFor(spec.spear.hand ?? 'right') : null;
  const shieldBone = spec.shield ? boneFor(spec.shield.hand ?? 'left') : null;
  let spearEnds = null; // alturas del regatón y de la punta respecto al agarre
  if (spearBone) {
    const spear = createSpear({ length: spec.spear.length, grip: spec.spear.grip });
    spear.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(spear);
    spearEnds = { bottom: box.min.y, top: box.max.y };
    props.spear = attachInWorld(spear, spearBone, spec.spear);
  }
  if (shieldBone && kit.shield) {
    props.shield = attachInWorld(new THREE.Group().add(kit.shield.clone()), shieldBone, spec.shield);
  }
  const spearHold = props.spear ? props.spear.quaternion.clone() : null;
  const spearGripAt = props.spear ? props.spear.position.clone() : null;

  // Cada pieza respira a su ritmo: si todas empezaran a la vez parecerían soldaditos de cuerda.
  const idleAction = variants.idle?.[0]?.action;
  if (idleAction) idleAction.time = Math.random() * idleAction.getClip().duration;

  const modelQuaternion = new THREE.Quaternion();
  const boneQuaternion = new THREE.Quaternion();
  const posed = new THREE.Quaternion();
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  const floor = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const boneScale = new THREE.Vector3();

  function update(dt) {
    mixer.update(dt);
    const spear = props.spear;
    if (!spear) return;
    const step = SPEAR_TURN_SPEED * dt;
    spearBlend += Math.max(-step, Math.min(step, spearTarget - spearBlend));
    if (spearBlend <= 0.0001) {
      spear.quaternion.copy(spearHold);
    } else {
      // Fuera de la mano, la orientación de la lanza se fija respecto a la figura.
      model.getWorldQuaternion(modelQuaternion).multiply(spearPose);
      spear.parent.getWorldQuaternion(boneQuaternion).invert();
      posed.copy(boneQuaternion).multiply(modelQuaternion);
      spear.quaternion.slerpQuaternions(spearHold, posed, spearBlend);
    }
    // Si un extremo se hunde en la peana o en el tablero, la lanza resbala por la mano.
    spear.position.copy(spearGripAt);
    spear.updateWorldMatrix(true, false);
    spear.localToWorld(top.set(0, spearEnds.top, 0));
    spear.localToWorld(bottom.set(0, spearEnds.bottom, 0));
    const slide = slideAboveFloor({
      lowY: Math.min(top.y, bottom.y),
      floorY: figure.getWorldPosition(floor).y + SPEAR_FLOOR_MARGIN,
      axisY: (top.y - bottom.y) / (spearEnds.top - spearEnds.bottom),
    });
    if (slide) {
      axis.set(0, 1, 0).applyQuaternion(spear.quaternion);
      spear.position.addScaledVector(axis, slide / spear.parent.getWorldScale(boneScale).x);
    }
  }

  return {
    object,
    figure,
    pedestal,
    props,
    hitbox,
    pedestalHeight: kit.pedestalHeight,
    walkSpeed: kit.walkSpeed,
    has: (action) => Boolean(variants[action]?.length),
    play,
    playOnce,
    fidget,
    placeAt(position) {
      pedestal.position.set(position.x, 0, position.z);
      figure.position.set(position.x, kit.pedestalHeight, position.z);
    },
    face(angle) {
      figure.rotation.y = angle;
    },
    update,
  };
}
