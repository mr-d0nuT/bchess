import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion } from './clips.js';
import { pickHandBone } from './bones.js';
import { createSpear } from './spear.js';
import { strideSpeed } from '../moves/walk.js';

// Peones con esqueleto. `loadPawnKit` carga una sola vez los modelos y prepara las
// animaciones, con varias versiones por acción; `spawnPawn` crea cada peón compartiendo
// mallas, texturas y clips, con su propio esqueleto, lanza, escudo, peana y zona de toque.
// `figure` y `pedestal` se colocan en coordenadas del tablero.

const MODELS = 'assets/models/';
const FALLBACK_PEDESTAL_HEIGHT = 0.26;
// Lanza en estocada: su eje (+Y) apunta al frente de la figura y un poco hacia abajo.
const SPEAR_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(98));
const SPEAR_TURN_SPEED = 7; // por segundo: la lanza tarda ~0,15 s en ponerse en estocada

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

export async function loadPawnKit(manifest, quality) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const spec = manifest.pawn;

  // El escudo y la peana son opcionales en el manifiesto: sin ellos, peana de reserva.
  const optional = (entry) => (entry ? loader.loadAsync(MODELS + entry.files[quality.name]) : null);
  const [pawnGltf, shieldGltf, pedestalGltf, ...animationGltfs] = await Promise.all([
    loader.loadAsync(MODELS + spec.files[quality.name]),
    optional(manifest.shield),
    optional(manifest.pedestal),
    ...(spec.animationFiles ?? []).map((file) => loader.loadAsync(MODELS + file)),
  ]);
  const clips = [...pawnGltf.animations, ...animationGltfs.flatMap((g) => g.animations)];
  const clipNames = clips.map((c) => c.name);
  const clipByName = (name) => clips.find((c) => c.name === name);

  const model = withShadows(pawnGltf.scene);
  fitToHeight(model, spec.height);
  model.updateMatrixWorld(true);
  const pedestalHeight = manifest.pedestal?.height ?? FALLBACK_PEDESTAL_HEIGHT;
  const pedestal = pedestalGltf ? withShadows(pedestalGltf.scene) : createFallbackPedestal(pedestalHeight);
  fitToHeight(pedestal, pedestalHeight);
  const shield = shieldGltf ? withShadows(shieldGltf.scene) : null;
  if (shield) fitToHeight(shield, manifest.shield.height);

  const { moves, missing } = resolveMoves(clipNames, spec.moves ?? {});
  if (missing.length) console.warn(`[BChess] El manifiesto pide clips que no están en el GLB: ${missing.join(', ')}. Clips: ${clipNames.join(', ')}`);
  for (const action of ['idle', 'walk', 'attack', 'hit', 'fall']) {
    if (!moves[action].length) console.warn(`[BChess] El peón no tiene animación «${action}». Clips: ${clipNames.join(', ') || '(ninguno)'}`);
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
  if (!hands.right || !hands.left) console.warn(`[BChess] No encuentro las manos del peón. Huesos: ${bones.join(', ')}`);

  return {
    manifest,
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

export function spawnPawn(kit) {
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

  // Zona de toque invisible: un cilindro del tamaño del peón, más fácil de acertar que la malla.
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, spec.height, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = spec.height / 2;
  figure.add(hitbox);

  const object = new THREE.Group();
  object.name = 'peon';
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
  let spearTarget = 0; // 0 = lanza en la mano; 1 = en estocada
  let spearBlend = 0;

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
    spearTarget = variant.spear === 'forward' ? 1 : 0;
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

  // Lanza y escudo: se enganchan con el peón ya en la postura de reposo (aún en el origen
  // y sin girar), colocados antes en el espacio de la figura; la lanza, vertical.
  play('idle', { fade: 0 });
  mixer.update(0);
  object.updateMatrixWorld(true);
  const boneFor = (side) => (kit.hands[side] ? model.getObjectByName(kit.hands[side]) : null);
  const props = {};
  const spearBone = boneFor(spec.spear?.hand ?? 'right');
  const shieldBone = boneFor(spec.shield?.hand ?? 'left');
  if (spearBone) {
    const spear = createSpear({ length: spec.spear?.length, grip: spec.spear?.grip });
    props.spear = attachInWorld(spear, spearBone, spec.spear);
  }
  if (shieldBone && kit.shield) {
    props.shield = attachInWorld(new THREE.Group().add(kit.shield.clone()), shieldBone, spec.shield);
  }
  const spearHold = props.spear ? props.spear.quaternion.clone() : null;

  // Cada peón respira a su ritmo: si todos empezaran a la vez parecerían soldaditos de cuerda.
  const idleAction = variants.idle?.[0]?.action;
  if (idleAction) idleAction.time = Math.random() * idleAction.getClip().duration;

  const modelQuaternion = new THREE.Quaternion();
  const boneQuaternion = new THREE.Quaternion();
  const spearForward = new THREE.Quaternion();

  function update(dt) {
    mixer.update(dt);
    if (!props.spear) return;
    const step = SPEAR_TURN_SPEED * dt;
    spearBlend += Math.max(-step, Math.min(step, spearTarget - spearBlend));
    if (spearBlend <= 0.0001) {
      props.spear.quaternion.copy(spearHold);
      return;
    }
    // En estocada, la orientación de la lanza se fija respecto a la figura y no a la mano.
    model.getWorldQuaternion(modelQuaternion).multiply(SPEAR_FORWARD);
    props.spear.parent.getWorldQuaternion(boneQuaternion).invert();
    spearForward.copy(boneQuaternion).multiply(modelQuaternion);
    props.spear.quaternion.slerpQuaternions(spearHold, spearForward, spearBlend);
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
