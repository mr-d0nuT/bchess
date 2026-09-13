import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { ACTIONS, mapClips, pickRootPositionTrack, pickUpAxis, removeLinearDrift } from './clips.js';
import { pickHandBone } from './bones.js';
import { createSpear } from './spear.js';
import { strideSpeed } from '../moves/walk.js';

// Peones con esqueleto. `loadPawnKit` carga una sola vez los modelos y prepara las
// animaciones; `spawnPawn` crea cada peón compartiendo mallas, texturas y clips, con su
// propio esqueleto, lanza, escudo, peana y zona de toque. `figure` y `pedestal` se
// colocan en coordenadas del tablero.

const MODELS = 'assets/models/';

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

const FALLBACK_PEDESTAL_HEIGHT = 0.26;

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

  const model = withShadows(pawnGltf.scene);
  fitToHeight(model, spec.height);
  model.updateMatrixWorld(true);
  const pedestalHeight = manifest.pedestal?.height ?? FALLBACK_PEDESTAL_HEIGHT;
  const pedestal = pedestalGltf ? withShadows(pedestalGltf.scene) : createFallbackPedestal(pedestalHeight);
  fitToHeight(pedestal, pedestalHeight);
  const shield = shieldGltf ? withShadows(shieldGltf.scene) : null;
  if (shield) fitToHeight(shield, manifest.shield.height);

  const mapping = mapClips(clips.map((c) => c.name), spec.clips ?? {});
  for (const action of ACTIONS) {
    if (!mapping[action]) console.warn(`[BChess] El peón no tiene animación «${action}». Clips: ${clips.map((c) => c.name).join(', ') || '(ninguno)'}`);
  }

  // El avance del paseo se quita ANTES de crear acciones, porque cada acción copia las
  // pistas al crearse. La velocidad sale de lo que avanzaba el clip.
  let walkSpeed = strideSpeed({ rootDistance: 0, clipDuration: 1, height: spec.height });
  const walkClip = mapping.walk ? clips.find((c) => c.name === mapping.walk) : null;
  if (walkClip) {
    const trackName = pickRootPositionTrack(walkClip.tracks.map((t) => t.name));
    const track = trackName ? walkClip.tracks.find((t) => t.name === trackName) : null;
    if (track) {
      const upAxis = pickUpAxis([track.values[0], track.values[1], track.values[2]]);
      const { distance, values } = removeLinearDrift(track.times, track.values, upAxis);
      track.values = values;
      const bone = model.getObjectByName(trackName.slice(0, -'.position'.length));
      const parentScale = bone?.parent ? bone.parent.getWorldScale(new THREE.Vector3()).x : 1;
      walkSpeed = strideSpeed({ rootDistance: distance * parentScale, clipDuration: walkClip.duration, height: spec.height });
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
    mapping,
    walkSpeed,
    hands,
    has: (action) => Boolean(mapping[action]),
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
  const actions = {};
  for (const action of ACTIONS) {
    const clip = kit.mapping[action] ? kit.clips.find((c) => c.name === kit.mapping[action]) : null;
    if (clip) actions[action] = mixer.clipAction(clip);
  }

  let current = null;

  function play(action, { loop = true, fade = 0.25 } = {}) {
    const next = actions[action];
    if (!next) return null;
    next.reset();
    next.setEffectiveWeight(1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    if (current && current !== next) next.crossFadeFrom(current, fade, false);
    next.play();
    current = next;
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

  // Cada peón respira a su ritmo: si todos empezaran a la vez parecerían soldaditos de cuerda.
  if (actions.idle) actions.idle.time = Math.random() * actions.idle.getClip().duration;

  return {
    object,
    figure,
    pedestal,
    props,
    hitbox,
    pedestalHeight: kit.pedestalHeight,
    walkSpeed: kit.walkSpeed,
    has: (action) => Boolean(actions[action]),
    play,
    playOnce,
    placeAt(position) {
      pedestal.position.set(position.x, 0, position.z);
      figure.position.set(position.x, kit.pedestalHeight, position.z);
    },
    face(angle) {
      figure.rotation.y = angle;
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}
