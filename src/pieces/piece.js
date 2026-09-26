import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { pickDriftTrack, pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion } from './clips.js';
import { pickHandBone } from './bones.js';
import { createSpear } from './spear.js';
import { createSword } from './sword.js';
import { strideSpeed } from '../moves/walk.js';
import { slideAboveFloor } from './grip.js';
import { findBone } from './bone-names.js';
import { CAPE_BONES, capePose, capeRest, capeStep } from './cape.js';
import { GAIT_BONES, gaitPose, gaitRate, restArms } from './gait.js';
import { SWAY_BONES, hipShift, rockAngle, swayPose, uprightBend } from './sway.js';

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
const STRUT_SECONDS = 1.1; // lo que dura un ciclo de contoneo cuando la pieza se desliza sin dar pasos

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

// Por dónde pasa la vara de un bastón a la altura `y`: el centro de lo que tiene alrededor, medido
// en la propia malla. Sirve para poner el origen en el eje de la vara y no en el centro de la caja
// envolvente, que en un bastón con la cabeza labrada están en sitios distintos.
function shaftCenter(model, y, length) {
  const margen = length * 0.04; // una rodaja fina a esa altura
  const punto = new THREE.Vector3();
  let sx = 0;
  let sz = 0;
  let n = 0;
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    const position = o.isMesh ? o.geometry?.getAttribute('position') : null;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      punto.fromBufferAttribute(position, i).applyMatrix4(o.matrixWorld);
      if (Math.abs(punto.y - y) > margen) continue;
      sx += punto.x;
      sz += punto.z;
      n++;
    }
  });
  return n ? new THREE.Vector3(sx / n, 0, sz / n) : new THREE.Vector3();
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
  const [pieceGltf, shieldGltf, pedestalGltf, spearGltf, ...animationGltfs] = await Promise.all([
    loader.loadAsync(MODELS + spec.files[quality.name]),
    optional(spec.shieldModel),
    optional(spec.pedestalModel),
    optional(spec.spearModel),
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
  // Un báculo de verdad, en vez del que se hace en código. Se le da su largo y se le corre el origen
  // hasta el punto de agarre, que es donde `attachInWorld` lo cose a la mano: así un modelo traído de
  // fuera se comporta igual que el que dibuja `spear.js`, con su postura erguida, su resbalón en la
  // mano y todo lo demás.
  let spearModel = null;
  if (spearGltf) {
    spearModel = withShadows(spearGltf.scene);
    fitToHeight(spearModel, spec.spear.length);
    spearModel.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(spearModel);
    const agarre = caja.min.y + spec.spear.grip;
    // El origen va donde lo coge la mano, y eso no es el centro de la caja: la caja la manda la
    // cabeza labrada, que es mucho más ancha que la vara, así que centrando por ella el bastón
    // queda colgando al lado del puño. Se centra por la VARA, mirando por dónde pasa a la altura
    // justa del agarre.
    const grupo = new THREE.Group();
    grupo.name = 'báculo';
    const eje = shaftCenter(spearModel, agarre, spec.spear.length);
    spearModel.position.set(-eje.x, -agarre, -eje.z);
    grupo.add(spearModel);
    spearModel = grupo;
  }

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
  // El paso de cada figura sale de su clip de andar; quien no trae clip anda a 0,7 alturas por
  // segundo. La reina va más despacio y lo dice en su ficha: con la capa hasta el suelo y la
  // zancada corta que eso obliga, al ritmo de todos le salían casi cuatro pasos por segundo, un
  // trotecillo impropio.
  let walkSpeed = spec.walkSpeed ?? strideSpeed({ rootDistance: 0, clipDuration: 1, height: spec.height });
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
    spearModel,
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

  // Cilindro invisible del tamaño de la pieza. Ya no se toca con el ratón (se tocan las mallas, que
  // es lo que se ve): queda como referencia del centro de la pieza y de su altura.
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, spec.height, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.userData.noPick = true;
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
  let currentName = null; // qué acción suena ahora ('walk', 'idle'…)
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
  let sway = 0; // cuánto contonea al moverse (la reina); 0, nada
  let swaying = false; // si ahora mismo tiene el contoneo puesto encima
  let swayPhase = 0; // su propio compás, para cuando se desliza sin clip de andar
  let gait = 0; // cuánto anda por su cuenta, hueso a hueso (la reina, que no trae clip); 0, nada
  let gaiting = false;
  let gaitPhase = 0; // en qué punto del ciclo va: un ciclo son dos pasos
  let armDrop = 0; // cuánto hay que bajarle los brazos a una figura que viene con ellos en cruz
  let rock = 0; // lo que se mece la figura sobre el suelo para llevar la cadera al pie que aguanta
  let hipBend = 0; // y lo que la cintura deshace de eso, para que el torso siga vertical
  let cape = 0; // cuánto vuela la capa (la reina); 0, ninguna capa que mover
  let capeState = capeRest();
  let capeBones = null; // los huesos de capa que tenga este modelo; null si aún no se ha mirado
  const lastTurn = new THREE.Quaternion();
  let turnKnown = false;
  let legs = null; // lo que mide su pierna, que es de donde sale todo lo demás
  let frozenIdle = null; // instante en el que se congela el reposo (modelos sin clip de reposo)
  const lastAt = new THREE.Vector3();
  const stepped = new THREE.Vector3(); // lo andado en el último fotograma, en el mundo
  let moving = 0; // lo que se ha movido en el último fotograma

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
    if (action === 'idle' && frozenIdle !== null) {
      next.time = frozenIdle; // pose quieta: el clip no avanza, y encima va el contoneo
      next.paused = true;
    }
    current = next;
    currentName = action;
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
  // El hueso del que cuelga lo que se lleva en la mano. Por defecto, la mano; con `palm`, la base
  // del dedo corazón, que está en mitad de la palma: el hueso de la mano de Mixamo está en la
  // MUÑECA, y colgando de ahí un bastón lo atraviesa por el antebrazo en vez de quedar agarrado.
  const boneFor = (side, palm = false) => {
    const dedo = palm ? findBone(model, `${side === 'left' ? 'L' : 'R'}_HandMiddle1`) : null;
    return dedo ?? (kit.hands[side] ? model.getObjectByName(kit.hands[side]) : null);
  };
  const props = {};
  const spearBone = spec.spear ? boneFor(spec.spear.hand ?? 'right', Boolean(spec.spear.palm)) : null;
  const shieldBone = spec.shield ? boneFor(spec.shield.hand ?? 'left') : null;
  let spearEnds = null; // alturas del regatón y de la punta respecto al agarre
  if (spearBone) {
    const spear = kit.spearModel
      ? kit.spearModel.clone()
      : createSpear({ length: spec.spear.length, grip: spec.spear.grip, crook: Boolean(spec.spear.crook) });
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
  // Los pinchos no se pueden tocar con el ratón: una lanza o un báculo son un palo fino que se cruza
  // por delante de media docena de casillas, y robarían el clic de la que hay detrás.
  for (const prop of [props.spear, props.sword]) if (prop) prop.userData.noPick = true;

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

  // Mueve un hueso de su sitio, encima de lo que haga la animación; con null lo deja donde estaba.
  // Lo usa el paso de la reina para dos cosas: el cuerpo sube un poco en cada apoyo (que es lo que
  // separa andar de ir en volandas) y la cadera se va de lado sobre el pie que aguanta (que es lo
  // que separa contonearse de girar la pelvis y quedarse donde estaba).
  function liftBone(name, lift) {
    const pose = poseOf(name);
    if (!pose) return false;
    if (lift === null || lift === undefined) pose.lift = null;
    else pose.lift = typeof lift === 'number' ? { x: 0, y: lift, z: 0 } : { x: lift.x ?? 0, y: lift.y ?? 0, z: lift.z ?? 0 };
    return true;
  }

  function turnBone(name, turn) {
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
  }

  function poseOf(name) {
    let pose = bonePoses.get(name);
    if (pose) return pose;
    const bone = findBone(model, name); // «Head» o «mixamorigHead»: da igual cómo los llame el modelo
    // Casi siempre es un hueso, pero la raíz de la figura («Armature») es el nudo del que cuelga el
    // esqueleto, y no lo es. Vale igual: se gira en el espacio de la figura como cualquier otro.
    if (!bone || bone === model) return null;
    let depth = 0;
    for (let at = bone.parent; at; at = at.parent) depth++;
    pose = {
      bone,
      turn: null,
      scale: null,
      lift: null,
      base: new THREE.Quaternion(),
      baseScale: new THREE.Vector3(1, 1, 1),
      basePos: new THREE.Vector3(),
      depth,
      applied: false,
    };
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
      if (pose.lift !== null) pose.bone.position.copy(pose.basePos);
    }
  }

  const figureTurn = new THREE.Quaternion();
  const figureTurnInverse = new THREE.Quaternion();
  const parentTurn = new THREE.Quaternion();
  const parentTurnInverse = new THREE.Quaternion();
  const worldTurn = new THREE.Quaternion();
  const shiftLocal = new THREE.Vector3();
  const parentScale = new THREE.Vector3(1, 1, 1);

  // Encima de la animación, cada hueso impuesto se escala y gira en el espacio de la figura. Los padres
  // van antes que los hijos, para que el giro de un hijo cuente con el de su padre.
  function applyBones() {
    if (!posedBones.length) return;
    figure.getWorldQuaternion(figureTurn);
    figureTurnInverse.copy(figureTurn).invert();
    for (const pose of posedBones) {
      pose.base.copy(pose.bone.quaternion);
      pose.baseScale.copy(pose.bone.scale);
      pose.basePos.copy(pose.bone.position);
      pose.applied = true;
      if (pose.scale !== null) pose.bone.scale.setScalar(pose.scale);
      if (pose.lift !== null) {
        // El desplazamiento se pide en el espacio de la figura, pero el hueso vive en el de su
        // padre: hay que traducirlo, o mover la cadera «a su izquierda» la mandaría a cualquier
        // sitio según cómo esté girado el esqueleto debajo. Y hay que DIVIDIR por la escala del
        // padre: la figura está escalada para medir lo que mide en el tablero, así que un centímetro
        // de allí no es un centímetro de aquí. Sin eso, la cadera se va casi el doble de lo pedido
        // y las piernas, que descuentan lo pedido, no llegan: el pie que estaba clavado patina.
        pose.bone.parent.getWorldQuaternion(parentTurn);
        pose.bone.parent.getWorldScale(parentScale);
        shiftLocal.set(pose.lift.x, pose.lift.y, pose.lift.z)
          .applyQuaternion(figureTurn)
          .applyQuaternion(parentTurnInverse.copy(parentTurn).invert())
          .divide(parentScale);
        pose.bone.position.add(shiftLocal);
      }
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

  // Lo que mide su pierna, medido en la propia figura y no a ojo: el muslo, la espinilla y la suma
  // de los dos. De ahí salen las dos cosas que hacen falta: la zancada (que ha de comerse
  // exactamente el terreno que recorre, o el pie patina) y los dos lados del triángulo que resuelve
  // la cinemática inversa. Se mide una vez, en la postura de enlace, antes de imponerle nada.
  function measureLegs() {
    const cadera = findBone(model, 'L_UpLeg');
    const rodilla = findBone(model, 'L_Leg');
    const tobillo = findBone(model, 'L_Foot');
    if (!cadera || !rodilla || !tobillo) return null;
    const a = cadera.getWorldPosition(new THREE.Vector3());
    const b = rodilla.getWorldPosition(new THREE.Vector3());
    const c = tobillo.getWorldPosition(new THREE.Vector3());
    const largo = a.distanceTo(b) + b.distanceTo(c);
    if (!(largo > 0)) return null;
    const otra = findBone(model, 'R_UpLeg');
    const ancho = otra ? a.distanceTo(otra.getWorldPosition(new THREE.Vector3())) / 2 : largo * 0.09;
    const cintura = findBone(model, 'Spine');
    const testa = findBone(model, 'Head');
    const alto = cintura && testa
      ? cintura.getWorldPosition(new THREE.Vector3()).distanceTo(testa.getWorldPosition(new THREE.Vector3()))
      : largo * 0.8;
    return {
      thigh: a.distanceTo(b) / largo,
      shin: b.distanceTo(c) / largo,
      length: largo,
      halfWidth: ancho / largo, // en largos de pierna, como todo lo demás en `gait.js`
      spine: alto / largo, // de la cintura a la cabeza: cuánto palanca tiene para enderezarse
    };
  }

  // El vuelo de la capa. La capa cuelga de una cadena de huesos propia (`Capa1..3`, que les pone
  // `tools/capa.py`) y la mueve la inercia: se queda atrás al arrancar, alcanza al pararse y se abre
  // al girar. Aquí solo se mide lo que hace el cuerpo —cuánto avanza, cuánto se desplaza de lado y
  // cuánto gira, medido COMO LO SIENTE ELLA, no en el mundo— y se le pasa al muelle de `cape.js`.
  const capeVelocity = new THREE.Vector3();
  const figureInverse = new THREE.Quaternion();
  const turnDelta = new THREE.Quaternion();
  function applyCape(dt) {
    if (cape <= 0 || dt <= 0) return;
    if (capeBones === null) capeBones = CAPE_BONES.filter((name) => poseOf(name));
    if (!capeBones.length) return;
    // Lo andado en este fotograma, pasado al espacio de la figura.
    capeVelocity.copy(stepped).divideScalar(dt);
    figure.getWorldQuaternion(figureInverse).invert();
    capeVelocity.applyQuaternion(figureInverse);
    // Y lo girado: el ángulo entre la orientación de antes y la de ahora, en vueltas por segundo.
    let turn = 0;
    const now = figure.quaternion;
    if (turnKnown) {
      turnDelta.copy(lastTurn).invert().multiply(now);
      const seno = Math.min(1, Math.abs(turnDelta.w));
      turn = ((2 * Math.acos(seno)) / (2 * Math.PI)) / dt * Math.sign(turnDelta.y || 1);
    }
    lastTurn.copy(now);
    turnKnown = true;
    // Si va dando pasos, la capa se entera: se balancea al compás en vez de quedarse tiesa, que es
    // además lo que le abre hueco a la pierna para pasar por dentro de la tela.
    capeState = capeStep(capeState, {
      forward: capeVelocity.z,
      side: capeVelocity.x,
      turn,
      step: gaiting ? gaitPhase : null,
      dt,
    });
    const pose = capePose(capeState, cape);
    capeBones.forEach((name, i) => turnBone(name, pose[i]));
  }

  // El paso de la reina, hueso a hueso. Su modelo no trae ninguna animación (se exportó pelado,
  // porque cualquier clip le destrozaba la capa), así que andar se lo pone el juego: `gait.js` dice
  // la postura y aquí se le da el compás, sacado de lo que avanza de verdad para que no patine.
  function applyGait(dt) {
    const andando = gait > 0 && moving > 0.02;
    if (!andando) {
      if (!gaiting) return;
      // Parada, las piernas vuelven a lo suyo; los brazos, no: si vienen en cruz hay que seguir
      // bajándoselos, andando y quieta.
      const brazos = armDrop > 0 ? restArms(armDrop) : null;
      for (const [parte, bone] of Object.entries(GAIT_BONES)) turnBone(bone, brazos?.[parte] ?? null);
      liftBone(SWAY_BONES.body, null);
      rock = 0;
      hipBend = 0;
      gaiting = false;
      gaitPhase = 0;
      return;
    }
    legs ??= measureLegs();
    if (!legs) return;
    gaitPhase = (gaitPhase + gaitRate(moving, legs.length) * dt) % 1;
    // El contoneo mueve la pelvis, y la pelvis es de donde cuelgan las piernas: hay que decírselo a
    // la cinemática inversa o el pie clavado se va con la cadera. Se calcula aquí la misma postura
    // que luego aplicará `applySway`, para que las dos cuenten lo mismo.
    const contoneo = sway > 0 ? swayPose(gaitPhase, sway, true) : null;
    const shift = contoneo ? hipShift(contoneo, legs.halfWidth) : undefined;
    const pose = gaitPose(gaitPhase, { amount: gait, thigh: legs.thigh, shin: legs.shin, shift, armDrop });
    for (const [parte, bone] of Object.entries(GAIT_BONES)) turnBone(bone, pose[parte]);
    liftBone(SWAY_BONES.body, pose.rise * legs.length); // el cuerpo baja y sube con la zancada
    // Y el contoneo: la figura entera se mece con el eje en el suelo, entre los pies. Así la cadera
    // se va de verdad sobre el pie que aguanta y los tobillos, que están a un dedo del suelo, casi
    // no se enteran. La cintura lo deshace para que el torso siga vertical.
    // `rock` es ya el giro que se le aplica al cuerpo: negativo, porque girar sobre Z lleva lo alto
    // hacia -X y la cadera ha de irse hacia +X cuando el contoneo lo pide.
    rock = contoneo ? -rockAngle(contoneo) : 0;
    hipBend = uprightBend(rock);
    gaiting = true;
  }

  // El contoneo de la reina: encima del clip de andar, al compás de los pasos. Se pone y se quita
  // solo, según ande o no.
  function applySway(dt) {
    // Se contonea mientras se mueve por el tablero, ande con las piernas o se deslice.
    const andando = sway > 0 && (currentName === 'walk' || moving > 0.02);
    if (!andando) {
      if (!swaying) return;
      for (const bone of Object.values(SWAY_BONES)) turnBone(bone, null);
      swaying = false;
      return;
    }
    // Al compás de los pasos si los hay —los del clip o los que le pone `applyGait`—; si se
    // desliza sin dar ninguno, a su propio ritmo. La cadera tiene que ir con los pies, no por libre.
    const duration = currentName === 'walk' && current ? current.getClip().duration : 0;
    if (gaiting) swayPhase = gaitPhase;
    else swayPhase = duration > 0 ? (current.time % duration) / duration : (swayPhase + dt / STRUT_SECONDS) % 1;
    const pose = swayPose(swayPhase, sway, gaiting);
    for (const [parte, bone] of Object.entries(SWAY_BONES)) {
      // Cuando anda de verdad, el contoneo se queda de cintura para arriba. El mecimiento del
      // cuerpo entero y el giro de la pelvis mueven también las piernas, y las piernas ya no son
      // suyas: las lleva la cinemática inversa, que acaba de clavar un pie en el suelo. Si el
      // contoneo se lo mueve, el pie patina, y patinar es justo lo que había que quitar.
      if (gaiting && parte === 'waist') {
        // La cintura tiene dos cosas que deshacer: el giro de la pelvis (como siempre) y el
        // mecimiento de abajo. Se suman: la cadera se va de lado y el torso sigue vertical.
        turnBone(bone, { ...pose.waist, z: pose.waist.z + hipBend });
        continue;
      }
      if (gaiting && parte === 'body') {
        // Andando, el mecimiento no es el del deslizarse (que va con retardo, como un barco): es el
        // que lleva la cadera sobre el pie que aguanta, al compás exacto de los pasos.
        turnBone(bone, { z: rock });
        continue;
      }
      turnBone(bone, pose[parte]);
    }
    swaying = true;
  }

  function update(dt) {
    restoreBones();
    mixer.update(dt);
    if (dt > 0) {
      // Lo andado en este fotograma, que es de donde sale tanto la velocidad como el vuelo de la
      // capa. Se guarda antes de mover `lastAt`, que si no se pierde.
      stepped.copy(figure.position).sub(lastAt);
      moving = stepped.length() / dt;
      lastAt.copy(figure.position);
    }
    applyGait(dt);
    applyCape(dt); // después del paso: la capa se balancea con él
    applySway(dt);
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
    // En qué punto del ciclo va la animación que suena ahora, de 0 a 1: sirve para colgarle encima
    // movimientos propios (el contoneo de la reina) al compás de los pasos.
    // En qué instante se congela el reposo, para los modelos que no traen clip de reposo propio
    // (la reina se queda quieta en un fotograma de su andar y respira con el contoneo).
    set frozenIdle(time) {
      frozenIdle = time ?? null;
    },
    // Cuánto vuela la capa: 0 nada (va pegada al cuerpo), 1 lo normal. Solo hace algo si el modelo
    // trae la cadena de huesos de capa.
    get cape() {
      return cape;
    },
    set cape(value) {
      cape = Math.max(0, value ?? 0);
    },
    // Cuánto hay que bajarle los brazos, en grados, si la figura viene con ellos en cruz. Los
    // modelos se generan así a propósito: es lo que pide el aparejo automático para no coser el
    // brazo al costado. 90 los deja pegados al cuerpo; 0, como venían.
    get armDrop() {
      return armDrop;
    },
    set armDrop(value) {
      armDrop = Math.max(0, value ?? 0);
      if (armDrop > 0 && !gaiting) {
        const brazos = restArms(armDrop);
        for (const [parte, bone] of Object.entries(GAIT_BONES)) {
          if (brazos[parte]) turnBone(bone, brazos[parte]);
        }
      }
    },
    // Cuánto anda por su cuenta: 0 nada (usa su clip de andar), 1 lo normal. Para los modelos que
    // vienen sin animaciones, como la reina.
    get gait() {
      return gait;
    },
    set gait(value) {
      gait = Math.max(0, value ?? 0);
    },
    // Cuánto contonea al moverse: 0 nada, 1 lo normal. La reina lo lleva puesto.
    get sway() {
      return sway;
    },
    set sway(value) {
      sway = Math.max(0, value ?? 0);
    },
    get phase() {
      if (!current) return 0;
      const duration = current.getClip().duration;
      return duration > 0 ? (current.time % duration) / duration : 0;
    },
    get playing() {
      return currentVariant?.key ?? null;
    },
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
    turnBone,
    liftBone,
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
