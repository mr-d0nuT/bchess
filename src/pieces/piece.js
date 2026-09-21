import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { pickDriftTrack, pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion } from './clips.js';
import { pickHandBone } from './bones.js';
import { createMitre } from './mitre.js';
import { createSpear } from './spear.js';
import { createSword } from './sword.js';
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
const GRIP_SPEED = 4; // casillas por segundo que resbala la lanza cuando lo pide el combate
const SPEAR_FLIGHT = 0.8; // segundos que tarda en desvanecerse la lanza que sale volando
const SPEAR_GRAVITY = 6;
const SPEAR_PLANT_DEPTH = 0.12; // lo que se clava en el tablero la lanza que se deja en el suelo
const DEGREES = Math.PI / 180;

export async function loadManifest() {
  const response = await fetch(`${MODELS}manifest.json`);
  if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}`);
  return response.json();
}

// Escala un objeto recién cargado (sin transformar) a una altura, con la base en y = 0
// y centrado en X y Z.
export function fitToHeight(object, height) {
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

export function withShadows(object) {
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return object;
}

// Pista de posición del hueso raíz de un clip (tras `loadPieceKit`, la única que le queda), con su eje
// vertical, o null.
function rootTrack(clip) {
  const track = clip.tracks.find((t) => t.name.endsWith('.position'));
  if (!track) return null;
  return { name: track.name, track, upAxis: pickUpAxis([track.values[0], track.values[1], track.values[2]]) };
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
  // a otro de proporciones algo distintas (cada hueso mantiene su propia longitud). En un esqueleto de
  // nombres desconocidos (el caballo), la cadera es el hueso que más avanza.
  for (const clip of clips) {
    const rootName = pickRootPositionTrack(clip.tracks.map((t) => t.name)) ?? pickDriftTrack(clip.tracks);
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.position') || t.name === rootName);
  }
  // La cadera, el hueso raíz: el único que conserva su pista de posición. Con `holdRoot` se le puede
  // pedir a una pieza que no se mueva del sitio (el jinete sentado en la silla).
  const rootBone = clips.reduce((found, clip) => {
    if (found) return found;
    const name = pickRootPositionTrack(clip.tracks.map((t) => t.name)) ?? pickDriftTrack(clip.tracks);
    return name ? name.slice(0, -'.position'.length) : null;
  }, null);
  const clipNames = clips.map((c) => c.name);
  const clipByName = (name) => clips.find((c) => c.name === name);

  const model = withShadows(pieceGltf.scene);
  fitToHeight(model, spec.height);
  model.updateMatrixWorld(true);
  // Con `pedestal: false` (el gigante), sin peana: los pies, en el tablero.
  const standsOnBoard = spec.pedestal === false;
  const pedestalHeight = standsOnBoard ? 0 : spec.pedestalModel?.height ?? FALLBACK_PEDESTAL_HEIGHT;
  let pedestal = new THREE.Group();
  if (!standsOnBoard) {
    pedestal = pedestalGltf ? withShadows(pedestalGltf.scene) : createFallbackPedestal(pedestalHeight);
    fitToHeight(pedestal, pedestalHeight);
  }
  // Radio de la pieza en el tablero (el de su peana, o el de la figura), para hacer sitio.
  const footprint = new THREE.Box3().setFromObject(standsOnBoard ? model : pedestal);
  const radius = Math.max(footprint.max.x - footprint.min.x, footprint.max.z - footprint.min.z) / 2;
  const shield = shieldGltf ? withShadows(shieldGltf.scene) : null;
  if (shield) fitToHeight(shield, spec.shieldModel.height);

  const { moves, missing } = resolveMoves(clipNames, spec.moves ?? {});
  if (missing.length) console.warn(`[BChess] El manifiesto pide clips que no están en el GLB: ${missing.join(', ')}. Clips: ${clipNames.join(', ')}`);
  // Las piezas que pelean avisan de lo que les falta; las demás (el caballo) dicen qué necesitan en `required`.
  for (const action of spec.required ?? ['idle', 'walk', 'attack', 'hit']) {
    if (!moves[action]?.length) console.warn(`[BChess] La pieza no tiene animación «${action}». Clips: ${clipNames.join(', ') || '(ninguno)'}`);
  }
  if (!spec.required && !moves.fall.length && !moves.defeat?.length) console.warn(`[BChess] La pieza no tiene animación para caer. Clips: ${clipNames.join(', ') || '(ninguno)'}`);

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
  if ((spec.spear || spec.shield || spec.sword) && (!hands.right || !hands.left)) console.warn(`[BChess] No encuentro las manos de la pieza. Huesos: ${bones.join(', ')}`);

  return {
    spec,
    model,
    pedestal,
    pedestalHeight,
    radius,
    shield,
    clips,
    moves,
    walkSpeed,
    rootBone,
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
  let spearOverride = null; // postura que impone el combate a todo lo que haga ('upright'…)
  let spearDefault = null; // postura en combate de lo que no pide ninguna (reacciones, guardia)
  let currentVariant = null;
  let gripTarget = 0; // lo que el combate pide que la lanza resbale hacia el regatón
  let grip = 0;
  let flying = null; // lanza que ha salido volando: { velocity, axis, age }
  const cuts = []; // acciones de `playOnce` que acaban antes, por `seconds`: { action, at, resolve }
  let planted = false; // lanza clavada en el tablero
  // Giros y escalas que el código impone a algunos huesos encima de la animación (sentarse en la silla,
  // juntar las rodillas, encoger un brazo cortado…): nombre → { bone, turn, scale, base, baseScale,
  // depth, applied }.
  const bonePoses = new Map();
  let posedBones = []; // los de `bonePoses`, de padres a hijos

  function applySpearPose() {
    const pose = SPEAR_POSES[spearOverride ?? currentVariant?.spear ?? spearDefault];
    if (pose) spearPose = pose;
    spearTarget = pose ? 1 : 0;
  }

  // Reproduce una versión de la acción: la de clave `clip` si se pide, o una al azar sin
  // repetir la anterior (o la de `avoid`).
  function play(action, { loop = true, fade = 0.25, avoid, clip } = {}) {
    const list = variants[action];
    if (!list?.length) return null;
    const forced = clip ? list.findIndex((variant) => variant.key === clip) : -1;
    const index = forced >= 0 ? forced : pickVariant(list.length, avoid ?? lastVariant[action] ?? -1);
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
    currentVariant = variant;
    applySpearPose();
    playCount++;
    return next;
  }

  // Una sola vez; se resuelve al terminar. Si la versión trae `seconds` (clips muy largos, como
  // una celebración de 12 s), se resuelve al llegar a ese momento y quien llama pasa a otra cosa.
  function playOnce(action, { fade = 0.2, clip } = {}) {
    return new Promise((resolve) => {
      const running = play(action, { loop: false, fade, clip });
      if (running && currentVariant?.seconds) cuts.push({ action: running, at: currentVariant.seconds, resolve });
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

  // Gesto suelto en reposo (rascarse, mirar alrededor…). Devuelve qué versión hace, o null
  // si ahora no puede. No bloquea: si mientras tanto se pide otro movimiento, al terminar el
  // gesto no vuelve a reposo.
  function fidget({ avoid } = {}) {
    const idle = variants.idle?.[0]?.action;
    if (!variants.fidget?.length || current !== idle) return null;
    const running = play('fidget', { loop: false, fade: 0.3, avoid });
    const index = lastVariant.fidget;
    const count = playCount;
    const done = (event) => {
      if (event.action !== running) return;
      mixer.removeEventListener('finished', done);
      if (count === playCount) play('idle', { fade: 0.4 });
    };
    mixer.addEventListener('finished', done);
    return index;
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
    const spear = createSpear({ length: spec.spear.length, grip: spec.spear.grip, crook: Boolean(spec.spear.crook) });
    spear.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(spear);
    spearEnds = { bottom: box.min.y, top: box.max.y };
    props.spear = attachInWorld(spear, spearBone, spec.spear);
  }
  if (shieldBone && kit.shield) {
    props.shield = attachInWorld(new THREE.Group().add(kit.shield.clone()), shieldBone, spec.shield);
  }
  const swordBone = spec.sword ? boneFor(spec.sword.hand ?? 'right') : null;
  let swordEnds = null; // alturas del pomo y de la punta respecto al agarre
  if (swordBone) {
    const sword = createSword({ length: spec.sword.length });
    sword.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sword);
    swordEnds = { bottom: box.min.y, top: box.max.y };
    props.sword = attachInWorld(sword, swordBone, spec.sword);
  }
  // Sombrero (la mitra del alfil): se engancha a la coronilla como los demás complementos.
  const hatBone = spec.hat ? model.getObjectByName(spec.hat.bone ?? 'Head') : null;
  if (hatBone) props.hat = attachInWorld(createMitre(spec.hat), hatBone, spec.hat);

  const spearHold = props.spear ? props.spear.quaternion.clone() : null;
  const spearGripAt = props.spear ? props.spear.position.clone() : null;
  const spearScale = props.spear ? props.spear.scale.clone() : null;

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

  // La lanza sale disparada hacia arriba, girando, y se desvanece: el vencido queda desarmado.
  // `direction` es la dirección horizontal (unitaria) en la que sale despedido.
  function throwSpear(direction) {
    const spear = props.spear;
    if (!spear || flying) return;
    object.attach(spear); // conserva su sitio en el mundo y deja de seguir a la mano
    spear.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
    });
    flying = {
      velocity: new THREE.Vector3(direction.x * 0.3, 4.5, direction.z * 0.3),
      axis: new THREE.Vector3(direction.z, 0, -direction.x).normalize(),
      age: 0,
    };
  }

  // Clava la lanza erguida en el tablero, en `at` ({x, z}), y deja de seguir a la mano.
  function plantSpear(at) {
    const spear = props.spear;
    if (!spear) return;
    flying = null;
    object.attach(spear);
    spear.quaternion.identity();
    spear.position.copy(object.worldToLocal(new THREE.Vector3(at.x, -spearEnds.bottom * spear.scale.y - SPEAR_PLANT_DEPTH, at.z)));
    planted = true;
  }

  // Vuelve a poner la lanza en la mano, como al crear la pieza, aunque estuviera clavada o hubiera
  // salido volando.
  function holdSpear() {
    const spear = props.spear;
    if (!spear) return;
    flying = null;
    planted = false;
    spearBone.add(spear);
    spear.position.copy(spearGripAt);
    spear.quaternion.copy(spearHold);
    spear.scale.copy(spearScale);
    spear.visible = true;
    spear.traverse((o) => {
      if (!o.isMesh || !o.material.transparent) return;
      o.material.opacity = 1;
      o.material.transparent = false;
    });
    grip = 0;
    gripTarget = 0;
    spearBlend = 0;
  }

  function poseOf(name) {
    let pose = bonePoses.get(name);
    if (pose) return pose;
    const bone = model.getObjectByName(name);
    if (!bone?.isBone) return null;
    let depth = 0;
    for (let at = bone.parent; at; at = at.parent) depth++;
    pose = { bone, turn: null, scale: null, base: new THREE.Quaternion(), baseScale: new THREE.Vector3(1, 1, 1), depth, applied: false };
    bonePoses.set(name, pose);
    posedBones = [...bonePoses.values()].sort((a, b) => a.depth - b.depth);
    return pose;
  }

  // Mientras la pieza está sujeta (el jinete, sentado en la silla), su cadera se queda en la postura de
  // enlace del esqueleto: el balanceo del reposo lo llevaría de lado sin que el caballo lo siguiera, y el
  // escudo se hundiría en él. En la de enlace y no en un fotograma cualquiera, que dejaría al jinete
  // torcido para siempre en el sitio donde le pilló el vaivén.
  const rootBone = kit.rootBone ? model.getObjectByName(kit.rootBone) : null;
  const rootBind = rootBone ? rootBone.position.clone() : null;
  let heldRoot = null;
  function holdRoot(on = true) {
    heldRoot = on && rootBone ? { bone: rootBone, position: rootBind } : null;
    return Boolean(heldRoot);
  }

  // Deja los huesos impuestos como los dejó la animación en el fotograma anterior.
  function restoreBones() {
    for (const pose of posedBones) {
      if (!pose.applied) continue;
      pose.bone.quaternion.copy(pose.base);
      pose.bone.scale.copy(pose.baseScale);
    }
  }

  const figureTurn = new THREE.Quaternion();
  const figureTurnInverse = new THREE.Quaternion();
  const parentTurn = new THREE.Quaternion();
  const parentTurnInverse = new THREE.Quaternion();
  const worldTurn = new THREE.Quaternion();

  // Encima de la animación, cada hueso impuesto se escala y gira en el espacio de la figura. Los padres
  // van antes que los hijos, para que el giro de un hijo cuente con el de su padre.
  function applyBones() {
    if (!posedBones.length) return;
    figure.getWorldQuaternion(figureTurn);
    figureTurnInverse.copy(figureTurn).invert();
    for (const pose of posedBones) {
      pose.base.copy(pose.bone.quaternion);
      pose.baseScale.copy(pose.bone.scale);
      pose.applied = true;
      if (pose.scale !== null) pose.bone.scale.setScalar(pose.scale);
      if (!pose.turn) continue;
      pose.bone.parent.getWorldQuaternion(parentTurn);
      parentTurnInverse.copy(parentTurn).invert();
      worldTurn.copy(figureTurn).multiply(pose.turn).multiply(figureTurnInverse);
      pose.bone.quaternion.copy(parentTurnInverse).multiply(worldTurn).multiply(parentTurn).multiply(pose.base);
    }
  }

  const spin = new THREE.Quaternion();

  function flySpear(spear, dt) {
    flying.age += dt;
    flying.velocity.y -= SPEAR_GRAVITY * dt;
    spear.position.addScaledVector(flying.velocity, dt);
    spear.quaternion.premultiply(spin.setFromAxisAngle(flying.axis, 5 * dt));
    const opacity = Math.max(0, 1 - flying.age / SPEAR_FLIGHT);
    spear.traverse((o) => {
      if (o.isMesh) o.material.opacity = opacity;
    });
    spear.visible = opacity > 0;
  }

  // Postura que tiene ahora la lanza fuera de la mano. Al pasar de una postura a otra (de erguida a
  // en estocada, o al revés) gira poco a poco hacia la nueva, en vez de saltar de golpe.
  const poseNow = new THREE.Quaternion();
  const POSE_TURN_SPEED = 7; // radianes por segundo: de erguida a en estocada tarda ~0,25 s

  function update(dt) {
    restoreBones();
    mixer.update(dt);
    if (heldRoot) heldRoot.bone.position.copy(heldRoot.position);
    applyBones();
    for (const cut of [...cuts]) {
      if (cut.action.time < cut.at && cut.action === current) continue;
      cuts.splice(cuts.indexOf(cut), 1);
      cut.resolve(true);
    }
    const spear = props.spear;
    if (!spear) return;
    if (flying) {
      flySpear(spear, dt);
      return;
    }
    if (planted) return;
    // Con la lanza en la mano, la postura no se ve: la próxima empieza ya en su sitio.
    if (spearBlend <= 0.0001) poseNow.copy(spearPose);
    const step = SPEAR_TURN_SPEED * dt;
    spearBlend += Math.max(-step, Math.min(step, spearTarget - spearBlend));
    if (spearBlend <= 0.0001) {
      spear.quaternion.copy(spearHold);
    } else {
      // Fuera de la mano, la orientación de la lanza se fija respecto a la figura.
      poseNow.rotateTowards(spearPose, POSE_TURN_SPEED * dt);
      model.getWorldQuaternion(modelQuaternion).multiply(poseNow);
      spear.parent.getWorldQuaternion(boneQuaternion).invert();
      posed.copy(boneQuaternion).multiply(modelQuaternion);
      spear.quaternion.slerpQuaternions(spearHold, posed, spearBlend);
    }
    // El combate puede pedir que la lanza resbale hacia el regatón (para no atravesar al
    // rival) y, si un extremo se hunde en la peana o en el tablero, resbala hacia arriba.
    const gripStep = GRIP_SPEED * dt;
    grip += Math.max(-gripStep, Math.min(gripStep, gripTarget - grip));
    spear.position.copy(spearGripAt);
    if (grip !== 0) {
      axis.set(0, 1, 0).applyQuaternion(spear.quaternion);
      spear.position.addScaledVector(axis, -grip / spear.parent.getWorldScale(boneScale).x);
    }
    spear.updateWorldMatrix(true, false);
    spear.localToWorld(top.set(0, spearEnds.top, 0));
    spear.localToWorld(bottom.set(0, spearEnds.bottom, 0));
    const slide = slideAboveFloor({
      lowY: Math.min(top.y, bottom.y),
      floorY: figure.getWorldPosition(floor).y + SPEAR_FLOOR_MARGIN,
      axisY: (top.y - bottom.y) / Math.max(1e-6, top.distanceTo(bottom)), // la figura puede estar encogiendo
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
    radius: kit.radius,
    height: kit.spec.height + kit.pedestalHeight,
    walkSpeed: kit.walkSpeed,
    has: (action) => Boolean(variants[action]?.length),
    play,
    playOnce,
    fidget,
    holdRoot,
    // Para el combate.
    setSpearPose(name) {
      spearOverride = name ?? null;
      applySpearPose();
    },
    setSpearDefault(name) {
      spearDefault = name ?? null;
      applySpearPose();
    },
    // Desliza la lanza en la mano: positivo, hacia el regatón; negativo, hacia la punta (sube).
    setGripSlide(amount) {
      gripTarget = Math.max(-1, amount);
    },
    throwSpear,
    plantSpear,
    holdSpear,
    // Gira un hueso `turn` grados ({ x, y, z }, en el espacio de la figura: +X a su izquierda, +Y arriba
    // y +Z delante) encima de lo que haga la animación; con null deja de girarlo.
    turnBone(name, turn) {
      const pose = poseOf(name);
      if (!pose) return false;
      if (!turn) {
        pose.turn = null;
        return true;
      }
      pose.turn ??= new THREE.Quaternion();
      // En grados ({x, y, z}) o ya como giro hecho (lo que sale de la cinemática inversa).
      if (turn.isQuaternion) pose.turn.copy(turn);
      else pose.turn.setFromEuler(new THREE.Euler((turn.x ?? 0) * DEGREES, (turn.y ?? 0) * DEGREES, (turn.z ?? 0) * DEGREES));
      return true;
    },
    // Escala un hueso, y todo lo que cuelga de él, encima de la animación; con null deja de escalarlo.
    scaleBone(name, scale) {
      const pose = poseOf(name);
      if (!pose) return false;
      pose.scale = scale ?? null;
      return true;
    },
    // Quita todos los giros y escalas impuestos.
    resetBones() {
      restoreBones();
      bonePoses.clear();
      posedBones = [];
    },
    // Sin ninguna animación: el esqueleto vuelve a la postura de reposo del modelo (el caballo quieto,
    // si no tiene animación de reposo).
    rest() {
      mixer.stopAllAction();
      current = null;
      currentVariant = null;
      model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
      applySpearPose();
    },
    hasClip(action, key) {
      return Boolean(variants[action]?.some((variant) => variant.key === key));
    },
    spearEnds,
    swordEnds,
    get attacks() {
      return kit.moves.attack ?? [];
    },
    get strikes() {
      return kit.strikes ?? {};
    },
    get fidgeting() {
      return Boolean(variants.fidget?.some((variant) => variant.action === current));
    },
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
