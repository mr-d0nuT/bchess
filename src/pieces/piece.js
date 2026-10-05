import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { pickDriftTrack, pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion } from './clips.js';
import { pickHandBone } from './bones.js';
import { createSpear } from './spear.js';
import { createSword } from './sword.js';
import { strideSpeed } from '../moves/walk.js';
import { closeFistOn, shaftRadius } from './fist.js';
import { bendFist } from './fist-mesh.js';
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
const GAITS = ['walk', 'trot', 'gallop']; // los aires, del más lento al más rápido: cada uno sabe lo que avanza
const FALLBACK_PEDESTAL_HEIGHT = 0.26;
// Posturas de la lanza respecto a la figura cuando deja de seguir a la mano: en estocada, su
// eje (+Y) apunta al frente y un poco hacia abajo; erguida, hacia arriba.
const SPEAR_POSES = {
  forward: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(98)),
  upright: new THREE.Quaternion(),
  // Calzada bajo el brazo para cargar a caballo: casi horizontal y un pelo hacia arriba. De punta
  // (`forward`, que es para la estocada a pie), desde la silla apuntaba a la barriga del peón.
  couch: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(85)),
};
const SPEAR_TURN_SPEED = 7; // por segundo: la lanza tarda ~0,15 s en cambiar de postura
const IDENTITY = new THREE.Quaternion();
const THRUST_BLEND = 0.15; // segundos del clip en que la espada pasa del agarre a la estocada, y vuelta
const THRUST_ARM = 0.05; // lo que ha de distar de la mano el hueso que marca la línea del antebrazo
// LA ESTOCADA A LO LARGO DEL BRAZO (`thrustAlongArm`, el peón). Con la lanza de punta fija respecto a la
// figura y el puño delante del pecho (sus estocadas son puñetazos), lo que quedaba del palo detrás del puño
// le atravesaba el cuerpo, y para sacarlo la lanza resbalaba hasta quedar cogida por el regatón: la punta
// llegaba tan lejos que al impactar atravesaba medio metro al rival (lo vio el usuario). Ahora, en la
// estocada, la lanza sigue la línea del antebrazo —la parte de atrás pasa junto al codo y el hombro, por
// el costado— y se coge más por en medio, como se coge de verdad.
const ARM_TURN_SPEED = 14; // radianes por segundo: sigue al antebrazo casi sin retraso
// El eje sobre el que el báculo da vueltas cuando se le pide (`setSpearSpin`): perpendicular a la
// vara, así que voltea de punta a regatón, no gira sobre sí mismo como un taladro —que en un palo
// redondo casi no se ve. Y como su origen está en el agarre, voltea alrededor del PUÑO.
const SPIN_AXIS = new THREE.Vector3(1, 0, 0);
const SPEAR_FLOOR_MARGIN = 0.02; // lo que queda su extremo más bajo por encima del suelo
export const GRIP_SPEED = 4; // casillas por segundo que resbala la lanza cuando lo pide el combate
// El brazo del escudo (el izquierdo, en el peón y en el jinete): en sus ataques se queda en guardia, quieto
// como empieza el golpe (`holdBones`). El escudo es para defenderse, no para pegar.
export const SHIELD_ARM = /^L_(Clavicle|Upperarm|Forearm|Hand)/;
const SHIELD_UPRIGHT_RATE = 5; // por segundo: lo que tarda el escudo en pasar de seguir al tronco a ir derecho (0,2 s)
// Los pasos que se oyen (`onStep`), en alturas de la pieza: lo que ha de subir un pie para contar como alzado,
// lo cerca del suelo que ha de volver para contar como posado, y lo que se deja subir cada segundo el suelo
// que se recuerda de cada pie (por si cambia: una peana, un escalón).
const STEP_LIFT = 0.025;
const STEP_PLANT = 0.008;
const STEP_DRIFT = 0.01;
const STEP_GAP = 0.08; // segundos entre dos pasos de la misma pieza, como mínimo (los cascos que caen a la vez)
const STEP_ACTIONS = new Set(['walk', 'run', 'trot', 'canter', 'gallop', 'turn']);
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
  // Lo mismo con el trote y el galope, si los trae (el caballo): cada aire sabe a qué velocidad avanza,
  // y quien lo ponga a andar ajusta su ritmo a lo que se mueva la figura, para que no patine.
  let walkSpeed = spec.walkSpeed ?? strideSpeed({ rootDistance: 0, clipDuration: 1, height: spec.height });
  const gaits = {};
  const touched = new Set();
  for (const gait of GAITS) {
    const clip = moves[gait]?.[0] ? clipByName(moves[gait][0].clip) : null;
    const root = clip && !touched.has(clip.name) ? rootTrack(clip) : null;
    if (!root) continue;
    const { distance, values } = removeLinearDrift(root.track.times, root.track.values, root.upAxis);
    root.track.values = values;
    touched.add(clip.name);
    const bone = model.getObjectByName(root.name.slice(0, -'.position'.length));
    const parentScale = bone?.parent ? bone.parent.getWorldScale(new THREE.Vector3()).x : 1;
    const rootDistance = distance * parentScale;
    if (gait === 'walk') walkSpeed = strideSpeed({ rootDistance, clipDuration: clip.duration, height: spec.height });
    else if (rootDistance > 0.05 * spec.height) gaits[gait] = rootDistance / clip.duration;
  }
  if (moves.walk?.[0]) gaits.walk = walkSpeed;
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
    gaits,
    // Grados por segundo a los que se compuso su paso de girar en el sitio (el caballo), si lo trae.
    turnRate: moves.turn?.[0]?.turnRate ?? null,
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
  let onPlay = null; // a quién se avisa al empezar cada movimiento (las voces); antes del primer `play`
  let spearSpin = 0; // radianes que el báculo lleva volteados sobre el puño
  let gripTarget = 0; // lo que el combate pide que la lanza resbale hacia el regatón
  let grip = 0;
  let armThrust = null; // `thrustAlongArm`: { grip }, lo que se sube el puño por el palo en la estocada
  let armGrip = 0; // lo que lleva subido, que va hacia lo que toque sin saltos
  const armPose = new THREE.Quaternion(); // la estocada a lo largo del antebrazo, en el sistema del modelo
  let forearmBone = null;
  let flying = null; // lanza que ha salido volando: { velocity, axis, age }
  const cuts = []; // acciones de `playOnce` que acaban antes, por `seconds`: { action, at, resolve }
  let planted = false; // lanza clavada en el tablero
  // Giros y escalas que el código impone a algunos huesos encima de la animación (sentarse en la silla,
  // juntar las rodillas, encoger un brazo cortado…): nombre → { bone, turn, scale, base, baseScale,
  // depth, applied }.
  const bonePoses = new Map();
  let posedBones = []; // los de `bonePoses`, de padres a hijos

  // 'body': erguida, pero a lo largo del cuerpo y no del todo vertical: si se agacha, se inclina con él. Al
  // celebrar, la lanza vertical le pasaba por el hombro cuando la animación lo doblaba hacia delante.
  const bodyPose = new THREE.Quaternion();
  // `spearRest`: la de la pieza cuando nada pide otra (el peón, en guardia: erguida). Por debajo de todas.
  let spearRest = null;
  const spearPoseName = () => spearOverride ?? currentVariant?.spear ?? spearDefault ?? spearRest;
  // ¿Estocada a lo largo del brazo ahora mismo?
  const thrustingAlongArm = () => Boolean(armThrust) && spearPoseName() === 'forward';
  function applySpearPose() {
    const name = spearPoseName();
    const pose = name === 'body' ? bodyPose : name === 'forward' && armThrust ? armPose : SPEAR_POSES[name];
    if (pose) spearPose = pose;
    spearTarget = pose ? 1 : 0;
  }
  // La de 'body', con la postura de ahora: del eje del cuerpo (cadera → cabeza) en el sistema del modelo.
  let bodyAxis = null;
  const bodyUp = new THREE.Vector3(0, 1, 0);
  // La de la estocada a lo largo del brazo: del codo a la mano, en el sistema del modelo. El codo es el
  // primer hueso por encima de la mano que no está pegado a ella (los de giro del antebrazo, sí).
  function followArm() {
    if (!forearmBone) {
      let arm = spearBone?.parent;
      spearBone?.getWorldPosition(guardTo);
      while (arm?.parent?.isBone && arm.getWorldPosition(guardFrom).distanceTo(guardTo) < THRUST_ARM) arm = arm.parent;
      forearmBone = arm?.isBone ? arm : null;
      if (!forearmBone) return;
    }
    spearBone.getWorldPosition(guardTo);
    forearmBone.getWorldPosition(guardFrom);
    axis.subVectors(guardTo, guardFrom);
    if (axis.lengthSq() < 1e-8) return;
    axis.applyQuaternion(model.getWorldQuaternion(guardTurn).invert()).normalize();
    armPose.setFromUnitVectors(bodyUp, axis);
  }
  function followBody() {
    bodyAxis ??= bodyGuard ? { from: bodyGuard.from, to: bodyGuard.to } : { from: findBone(model, 'Hip'), to: findBone(model, 'Head') };
    if (!bodyAxis.from || !bodyAxis.to) return;
    bodyAxis.from.getWorldPosition(guardFrom);
    bodyAxis.to.getWorldPosition(guardTo);
    axis.subVectors(guardTo, guardFrom);
    if (axis.lengthSq() < 1e-8) return;
    axis.applyQuaternion(model.getWorldQuaternion(guardTurn).invert()).normalize();
    bodyPose.setFromUnitVectors(bodyUp, axis);
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
    onPlay?.(action, variant.key); // su voz (`audio/voces.js`), si la tiene; con la clave, para los gestos
    return next;
  }

  // Un clip con algunos huesos quietos. Quitarles la pista no vale: three mezclaría esos huesos con la
  // postura de enlace (un brazo se abriría en cruz); se les deja fijo el valor de un fotograma: el primero
  // del reposo (`pose` 'idle') o el primero del propio clip ('self'). `still` recibe el nombre del hueso.
  function stillClip(clip, still, pose) {
    const copy = clip.clone();
    const from = pose === 'self' ? clip : variants.idle?.[0]?.action.getClip();
    if (!from) return copy;
    for (const track of copy.tracks) {
      const bone = track.name.slice(0, track.name.lastIndexOf('.'));
      const same = still(bone) && from.tracks.find((t) => t.name === track.name);
      if (!same) continue;
      const size = track.getValueSize();
      const value = same.values.slice(0, size);
      track.times = new Float32Array([0, copy.duration]);
      track.values = new Float32Array(size * 2);
      track.values.set(value, 0);
      track.values.set(value, size);
    }
    return copy;
  }

  // Otra versión de un movimiento con algunos huesos quietos en su postura de reposo: celebrar a caballo
  // con el brazo del escudo en su sitio, por ejemplo. Se registra como `name`.
  function addStillBones(name, from, still, { clip: key = null } = {}) {
    const source = key ? variants[from]?.find((variant) => variant.key === key) : variants[from]?.[0];
    if (!source || !variants.idle?.length) return false;
    const clip = stillClip(source.action.getClip(), still, 'idle');
    clip.name = `${clip.name}:${name}`;
    variants[name] = [{ ...source, action: mixer.clipAction(clip) }];
    return true;
  }

  // Todas las versiones de un movimiento con algunos huesos AMORTIGUADOS: de lo que se apartan de su primer
  // fotograma, solo les queda `keep` (de 0 a 1). Para que el caballero dé el espadazo erguido: el clip lo
  // doblaba por la cintura y le agachaba la cabeza (lo vio el usuario), y con el tronco del todo quieto
  // quedaba de palo.
  function dampBones(action, test, keep) {
    const q0 = new THREE.Quaternion();
    const q = new THREE.Quaternion();
    variants[action] = (variants[action] ?? []).map((variant) => {
      const clip = variant.action.getClip().clone();
      for (const track of clip.tracks) {
        const bone = track.name.slice(0, track.name.lastIndexOf('.'));
        if (!test(bone)) continue;
        const size = track.getValueSize();
        const values = Float32Array.from(track.values);
        if (track.name.endsWith('.quaternion') && size === 4) {
          q0.fromArray(values, 0);
          for (let i = 0; i < values.length; i += 4) {
            q.fromArray(values, i);
            q.copy(q0.clone().slerp(q, keep)).toArray(values, i);
          }
        } else {
          for (let i = size; i < values.length; i++) values[i] = values[i % size] + (values[i] - values[i % size]) * keep;
        }
        track.values = values;
      }
      clip.name = `${clip.name}:erguido`;
      return { ...variant, action: mixer.clipAction(clip) };
    });
  }

  // Todas las versiones de un movimiento, con algunos huesos quietos en el primer fotograma de cada una:
  // el caballero ataca con la espada y el brazo del escudo se queda en guardia, como empieza el golpe.
  function holdBones(action, still) {
    variants[action] = (variants[action] ?? []).map((variant) => {
      const clip = stillClip(variant.action.getClip(), still, 'self');
      clip.name = `${clip.name}:firme`;
      return { ...variant, action: mixer.clipAction(clip) };
    });
  }

  // Una sola vez; se resuelve al terminar. Si la versión trae `seconds` (clips muy largos, como
  // una celebración de 12 s), se resuelve al llegar a ese momento y quien llama pasa a otra cosa.
  // `from`: desde qué segundo del clip empieza (para saltarse una preparación larga).
  function playOnce(action, { fade = 0.2, clip, from = 0 } = {}) {
    return new Promise((resolve) => {
      const running = play(action, { loop: false, fade, clip });
      if (running && from > 0) running.time = from;
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

  // En las estocadas (las versiones de ataque marcadas `thrust`), la espada sigue la línea del antebrazo,
  // como si el brazo se alargase en la hoja. Tal como se agarra, en esos golpes (puñetazos con la espada
  // en la mano) apuntaba al cielo mientras el puño iba al frente, y la estocada parecía un empujón. La
  // mezcla va con el tiempo del propio clip y no con el reloj, para que la medida de los golpes, que para
  // el clip en cada instante, vea la misma espada que el combate.
  const swordHold = props.sword ? props.sword.quaternion.clone() : null;
  const swordTurn = { parent: new THREE.Quaternion(), world: new THREE.Quaternion(), aim: new THREE.Quaternion() };
  const swordLine = { hand: new THREE.Vector3(), arm: new THREE.Vector3(), axis: new THREE.Vector3(), blade: new THREE.Vector3() };
  // Si el combate le ha quitado un arma (`debris.throwPiece` la cuelga de la escena, o del trozo de
  // brazo que sale volando), ya no es cosa de la pieza. Seguir poniéndola cada fotograma como la lleva
  // en la mano le borraba el giro en el aire y, al tumbarse en el suelo, la volvía a poner de pie: el
  // báculo del alfil se quedaba hundido en el tablero, asomando como un trozo de lanza rota.
  // Suya es si cuelga de su figura (el esqueleto) o de su objeto (donde se deja al lanzarla o clavarla). Las
  // dos cosas: al jinete del caballero lo sientan en el caballo y su figura deja de colgar de su objeto; mirando
  // solo el objeto, su lanza no se calzaba para cargar (iba en vertical) ni su espada apuntaba.
  function isOurs(prop) {
    for (let o = prop.parent; o; o = o.parent) if (o === object || o === figure) return true;
    return false;
  }

  // El escudo, siempre derecho. Va atado a la mano y gira con ella: en los puñetazos, los golpes que
  // recibe y las paradas, con el antebrazo por delante, se quedaba tumbado (el usuario lo veía en
  // horizontal). Cada fotograma se endereza lo justo para que su eje vertical (+Y, que en reposo es el
  // vertical) siga al del tronco —de la cadera al cuello: si quien lo lleva cae, el escudo cae con él—,
  // sin cambiar hacia dónde mira, que lo sigue marcando el brazo. Y se endereza girándolo alrededor de la
  // MANO, que es por donde se agarra: su origen cuelga un palmo por debajo, y girando alrededor de él, con
  // el brazo en alto, el escudo acababa flotando por encima de la cabeza.
  // Mientras ataca, en cambio, sigue la vertical de verdad, no la del tronco: en la patada el peón se echa
  // atrás casi tumbado, y el escudo, con el tronco, se quedaba plano a la altura de la rodilla. El paso de
  // una a otra es suave (`SHIELD_UPRIGHT_RATE`), que al cambiar de movimiento no dé un salto.
  const shieldHold = props.shield ? props.shield.quaternion.clone() : null;
  const shieldHoldAt = props.shield ? props.shield.position.clone() : null;
  const trunkLow = findBone(model, 'Hips');
  const trunkHigh = findBone(model, 'Neck') ?? findBone(model, 'Head');
  const steady = {
    up: new THREE.Vector3(), trunk: new THREE.Vector3(), low: new THREE.Vector3(), grip: new THREE.Vector3(), at: new THREE.Vector3(),
    world: new THREE.Quaternion(), parent: new THREE.Quaternion(), fix: new THREE.Quaternion(), upright: 0,
  };
  // QUE EL ESCUDO NO LE ATRAVIESE EL CUERPO. En las patadas y al recibir golpes, el brazo del escudo se queda
  // en guardia mientras el cuerpo se dobla o gira, y el escudo acababa metido en el tronco (medido: hasta el
  // eje del cuerpo). Moverlo solo a él lo dejaría flotando lejos del brazo; así que, si se pide
  // (`guardShield`), cada fotograma se mira el punto del escudo que más se mete en el tronco (de la cadera al
  // cuello) y el hombro gira el brazo entero hacia fuera lo justo para sacarlo.
  let shieldGuard = null; // { from, to, radius, arm, points: [puntos del escudo, en su sistema] }
  const shieldPoint = new THREE.Vector3();
  const shieldDeep = new THREE.Vector3();
  const shieldAxis = new THREE.Vector3();
  const shoulderAt = new THREE.Vector3();
  const shieldTurn = new THREE.Quaternion();
  const armParent = new THREE.Quaternion();
  const SHIELD_GUARD_MAX = 0.9; // radianes que puede girar el brazo en cada pasada, como mucho
  function keepShieldOffBody() {
    const shield = props.shield;
    if (!shieldGuard || !shield || !isOurs(shield)) return;
    for (let pasada = 0; pasada < 3; pasada++) {
      shieldGuard.from.getWorldPosition(guardFrom);
      shieldGuard.to.getWorldPosition(guardTo);
      shield.updateWorldMatrix(true, false);
      let depth = 0;
      for (const local of shieldGuard.points) {
        shieldPoint.copy(local).applyMatrix4(shield.matrixWorld);
        // El punto del eje más cercano.
        axis.subVectors(guardTo, guardFrom);
        const t = THREE.MathUtils.clamp(segA.subVectors(shieldPoint, guardFrom).dot(axis) / Math.max(1e-9, axis.lengthSq()), 0, 1);
        segB.copy(guardFrom).addScaledVector(axis, t);
        const dentro = shieldGuard.radius - shieldPoint.distanceTo(segB);
        if (dentro > depth) {
          depth = dentro;
          shieldDeep.copy(shieldPoint);
          shieldAxis.copy(segB);
        }
      }
      if (depth <= 0) return;
      // Hacia fuera del eje (si cae justo en él, hacia la izquierda de la figura, que es su lado).
      pushOut.subVectors(shieldDeep, shieldAxis);
      if (pushOut.lengthSq() < 1e-8) pushOut.set(1, 0, 0).applyQuaternion(figure.getWorldQuaternion(shieldTurn));
      pushOut.normalize();
      // El giro del hombro que lleva ese punto al borde del cuerpo.
      shieldGuard.arm.getWorldPosition(shoulderAt);
      segA.subVectors(shieldDeep, shoulderAt);
      segR.copy(shieldDeep).addScaledVector(pushOut, depth).sub(shoulderAt);
      if (segA.lengthSq() < 1e-6 || segR.lengthSq() < 1e-6) return;
      shieldTurn.setFromUnitVectors(segA.normalize(), segR.normalize());
      const angulo = 2 * Math.acos(Math.min(1, Math.abs(shieldTurn.w)));
      if (angulo > SHIELD_GUARD_MAX) shieldTurn.slerp(guardTurn.identity(), 1 - SHIELD_GUARD_MAX / angulo);
      const arm = shieldGuard.arm;
      arm.parent.getWorldQuaternion(armParent);
      arm.quaternion.premultiply(armParent).premultiply(shieldTurn).premultiply(armParent.invert());
      arm.updateWorldMatrix(false, true);
    }
  }

  function steadyShield(dt = 0) {
    const shield = props.shield;
    if (!shield || !shieldHold || !trunkLow || !trunkHigh || !isOurs(shield)) return;
    const hand = shield.parent;
    shield.quaternion.copy(shieldHold);
    shield.position.copy(shieldHoldAt);
    hand.updateWorldMatrix(true, false);
    hand.getWorldQuaternion(steady.parent);
    hand.getWorldPosition(steady.grip);
    steady.at.copy(shieldHoldAt).applyMatrix4(hand.matrixWorld);
    steady.world.copy(steady.parent).multiply(shieldHold);
    steady.up.set(0, 1, 0).applyQuaternion(steady.world);
    trunkHigh.updateWorldMatrix(true, false);
    trunkHigh.getWorldPosition(steady.trunk);
    trunkLow.getWorldPosition(steady.low);
    steady.trunk.sub(steady.low);
    if (steady.trunk.lengthSq() < 1e-8) return;
    const derecho = currentName === 'attack' ? 1 : 0;
    steady.upright += Math.sign(derecho - steady.upright) * Math.min(Math.abs(derecho - steady.upright), SHIELD_UPRIGHT_RATE * dt);
    steady.trunk.normalize().multiplyScalar(1 - steady.upright);
    steady.trunk.y += steady.upright;
    if (steady.trunk.lengthSq() < 1e-8) return;
    steady.fix.setFromUnitVectors(steady.up, steady.trunk.normalize());
    steady.world.premultiply(steady.fix);
    steady.at.sub(steady.grip).applyQuaternion(steady.fix).add(steady.grip);
    shield.quaternion.copy(steady.parent.invert()).multiply(steady.world);
    shield.position.copy(hand.worldToLocal(steady.at));
  }

  function aimSword() {
    const sword = props.sword;
    if (!sword || !swordHold || !isOurs(sword)) return;
    sword.quaternion.copy(swordHold);
    if (currentName !== 'attack' || !currentVariant?.thrust || !current) return;
    const end = currentVariant.seconds ?? current.getClip().duration;
    const ramp = (x) => Math.min(1, Math.max(0, x / THRUST_BLEND));
    const weight = ramp(current.time) * ramp(end - current.time);
    if (weight <= 0) return;
    const hand = sword.parent;
    hand.updateWorldMatrix(true, false);
    hand.getWorldPosition(swordLine.hand);
    // El antebrazo: el primer hueso de más arriba que no esté pegado a la mano (los de giro, sí).
    let arm = hand.parent;
    while (arm?.parent?.isBone && arm.getWorldPosition(swordLine.arm).distanceTo(swordLine.hand) < THRUST_ARM) arm = arm.parent;
    if (!arm) return;
    arm.getWorldPosition(swordLine.arm);
    swordLine.axis.subVectors(swordLine.hand, swordLine.arm).normalize();
    hand.getWorldQuaternion(swordTurn.parent);
    swordTurn.world.copy(swordTurn.parent).multiply(swordHold);
    swordLine.blade.set(0, 1, 0).applyQuaternion(swordTurn.world);
    swordTurn.aim.setFromUnitVectors(swordLine.blade, swordLine.axis).multiply(swordTurn.world);
    swordTurn.aim.premultiply(swordTurn.parent.invert());
    sword.quaternion.slerpQuaternions(swordHold, swordTurn.aim, weight);
  }
  const spearGripAt = props.spear ? props.spear.position.clone() : null;
  const spearScale = props.spear ? props.spear.scale.clone() : null;

  // Cada pieza respira a su ritmo: si todas empezaran a la vez parecerían soldaditos de cuerda.
  const idleAction = variants.idle?.[0]?.action;
  if (idleAction) idleAction.time = Math.random() * idleAction.getClip().duration;

  const modelQuaternion = new THREE.Quaternion();
  const boneQuaternion = new THREE.Quaternion();
  const posed = new THREE.Quaternion();
  const spinQuaternion = new THREE.Quaternion();
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  const floor = new THREE.Vector3();
  const axis = new THREE.Vector3();
  const boneScale = new THREE.Vector3();

  // QUE SU PROPIA LANZA NO LE ATRAVIESE EL CUERPO. En la guardia y al atacar, la lanza va fija respecto a
  // la figura (o sigue a la mano), y cuando la animación le pasa la mano por delante del pecho, el palo
  // le cruzaba el tronco; al celebrar con la lanza erguida, se agachaba y el palo le salía por la espalda
  // (lo vio el usuario). Así que, si se pide (`guardSpear`), cada fotograma se mira lo cerca que pasa el
  // palo del eje del cuerpo —de la cadera a lo alto de la cabeza— y, si pasa por dentro, se ladea lo
  // justo girándolo sobre el puño: lo que hace cualquiera para apartarse la lanza del cuerpo.
  let bodyGuard = null; // { from, to, radius, over }: los huesos del eje del cuerpo, su radio y lo que sube por encima del último
  const guardFrom = new THREE.Vector3();
  const guardTo = new THREE.Vector3();
  const onShaft = new THREE.Vector3();
  const onBody = new THREE.Vector3();
  const gripAt = new THREE.Vector3();
  const pushOut = new THREE.Vector3();
  const guardTurn = new THREE.Quaternion();
  const parentTurn2 = new THREE.Quaternion();
  const spearAt = new THREE.Vector3();
  const segA = new THREE.Vector3();
  const segB = new THREE.Vector3();
  const segR = new THREE.Vector3();

  // Los puntos más cercanos entre los segmentos [p1, q1] y [p2, q2] (en `out1`, `out2`).
  function closestOnSegments(p1, q1, p2, q2, out1, out2) {
    segA.subVectors(q1, p1);
    segB.subVectors(q2, p2);
    segR.subVectors(p1, p2);
    const a = segA.dot(segA);
    const e = segB.dot(segB);
    const f = segB.dot(segR);
    const c = segA.dot(segR);
    const b = segA.dot(segB);
    const den = a * e - b * b;
    let s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
    let t = e > 1e-9 ? (b * s + f) / e : 0;
    if (t < 0) {
      t = 0;
      s = a > 1e-9 ? THREE.MathUtils.clamp(-c / a, 0, 1) : 0;
    } else if (t > 1) {
      t = 1;
      s = a > 1e-9 ? THREE.MathUtils.clamp((b - c) / a, 0, 1) : 0;
    }
    out1.copy(p1).addScaledVector(segA, s);
    out2.copy(p2).addScaledVector(segB, t);
  }

  // Dos pasadas: al girar el palo, puede ser otro trozo el que quede más cerca del cuerpo.
  //
  // Y el giro, SUAVE. Calculado de cero en cada fotograma, saltaba: cuando el palo cruzaba el cuerpo junto
  // al puño (ahí girarlo no sirve) se soltaba de golpe, y en una estocada la punta se teletransportaba medio
  // metro de un fotograma al siguiente (y la medida del golpe caía en uno de esos saltos). Ahora lo que pide
  // cada fotograma es el objetivo, y el giro que se aplica va hacia él a `GUARD_TURN_RATE`.
  const GUARD_TURN_RATE = 6; // radianes por segundo
  const guardBefore = new THREE.Quaternion();
  const guardWant = new THREE.Quaternion();
  const guardSmooth = new THREE.Quaternion();
  const guardGrip = new THREE.Vector3();
  function keepSpearOffBody(spear, dt = 0) {
    if (!bodyGuard || !spearEnds) return;
    slideRearOut(spear, dt);
    spear.updateWorldMatrix(true, false);
    spear.getWorldQuaternion(guardBefore);
    const posBefore = spear.position.clone();
    const quatBefore = spear.quaternion.clone();
    if (pushSpearOut(spear)) pushSpearOut(spear);
    // Lo que ha girado este fotograma (en el mundo), y vuelta a como estaba.
    spear.getWorldQuaternion(guardWant).multiply(guardBefore.invert());
    spear.position.copy(posBefore);
    spear.quaternion.copy(quatBefore);
    spear.updateWorldMatrix(false, false);
    if (dt > 0) guardSmooth.rotateTowards(guardWant, GUARD_TURN_RATE * dt);
    else guardSmooth.copy(guardWant);
    if (guardSmooth.angleTo(IDENTITY) < 1e-4) return;
    spearBone.localToWorld(guardGrip.copy(spearGripAt));
    turnSpearAround(spear, guardSmooth, guardGrip);
  }

  // Gira la lanza `turn` (en el mundo) alrededor del punto `pivot`: el palo gira y su origen gira alrededor.
  function turnSpearAround(spear, turn, pivot) {
    spear.getWorldPosition(spearAt).sub(pivot).applyQuaternion(turn).add(pivot);
    spear.parent.getWorldQuaternion(parentTurn2);
    spear.quaternion.premultiply(parentTurn2).premultiply(turn).premultiply(parentTurn2.invert());
    spear.position.copy(spear.parent.worldToLocal(spearAt));
    spear.updateWorldMatrix(false, false);
  }

  // LA PARTE DE ATRÁS. Con el puño delante de la barriga y la lanza apuntando al frente (preparando la
  // estocada), lo que queda del palo por detrás del puño se le metía en el cuerpo, y girarla alrededor del
  // puño no lo arregla: el puño está pegado. Así que la lanza resbala hacia delante por el puño hasta que la
  // parte de atrás sale del cuerpo, que es lo que hace un lancero: cogerla más atrás.
  const REAR_MIN = 0.08; // lo que se deja siempre por detrás del puño, para que lo agarre
  const REAR_RATE = 2.5; // casillas por segundo que resbala (sin saltos)
  const rearGrip = new THREE.Vector3();
  const rearAxis = new THREE.Vector3();
  let rearSlide = 0; // lo que lleva resbalado, que va hacia lo que haga falta
  function slideRearOut(spear, dt) {
    spear.updateWorldMatrix(true, false);
    spear.localToWorld(bottom.set(0, spearEnds.bottom, 0));
    spear.localToWorld(top.set(0, spearEnds.top, 0));
    spearBone.localToWorld(rearGrip.copy(spearGripAt));
    rearAxis.subVectors(top, bottom).normalize();
    // Se mide con la lanza como la pone el resto del juego en este fotograma (sin el resbalón de aquí): si
    // no, al resbalar dejaría de tocar, volvería y no pararía de ir y venir.
    const atras = rearGrip.clone().sub(bottom).dot(rearAxis); // del regatón al puño, a lo largo de la lanza
    let quiere = 0;
    // En la estocada a lo largo del brazo, no: lo de atrás ya pasa por el costado, y resbalar es lo que la
    // dejaba cogida por el regatón.
    if (atras > REAR_MIN && !thrustingAlongArm()) {
      bodyGuard.from.getWorldPosition(guardFrom);
      bodyGuard.to.getWorldPosition(guardTo);
      guardTo.addScaledVector(axis.subVectors(guardTo, guardFrom), bodyGuard.over);
      const tope = rearGrip.clone().addScaledVector(rearAxis, -REAR_MIN);
      closestOnSegments(bottom, tope, guardFrom, guardTo, onShaft, onBody);
      const radius = bodyGuard.radius * figure.getWorldScale(boneScale).x;
      if (onShaft.distanceTo(onBody) < radius) quiere = atras - REAR_MIN; // la parte de atrás, fuera del cuerpo
    }
    const paso = REAR_RATE * Math.max(dt, 0);
    rearSlide += dt > 0 ? THREE.MathUtils.clamp(quiere - rearSlide, -paso, paso) : quiere - rearSlide;
    const resbala = Math.min(rearSlide, Math.max(0, atras - REAR_MIN));
    if (resbala <= 1e-4) return;
    spear.parent.worldToLocal(spearAt.copy(spear.getWorldPosition(spearAt)).addScaledVector(rearAxis, resbala));
    spear.position.copy(spearAt);
    spear.updateWorldMatrix(false, false);
  }

  // EL MOLINETE, AL COSTADO. Con guarda (`guardSpear`), la lanza no voltea en su plano de siempre, que en la
  // burla del duelo le cruzaba el pecho: voltea en un plano vertical al costado del cuerpo —el eje del giro
  // apunta del puño al cuerpo—, como quien voltea un bastón junto a la cadera. Antes se apartaba la lanza
  // entera de lado, y se salía de la mano.
  const spinWorld = new THREE.Vector3();
  const spinBody = new THREE.Vector3();
  const spinLocal = new THREE.Vector3();
  const spinTurn = new THREE.Quaternion();
  function spinAxis(spear) {
    if (!bodyGuard) return SPIN_AXIS;
    spear.parent.getWorldQuaternion(spinTurn).multiply(spear.quaternion); // la lanza en el mundo, sin el giro
    spear.parent.localToWorld(spinWorld.copy(spear.position));
    bodyGuard.from.getWorldPosition(spinBody);
    spinLocal.subVectors(spinBody, spinWorld).setY(0);
    if (spinLocal.lengthSq() < 1e-6) return SPIN_AXIS;
    spinLocal.applyQuaternion(spinTurn.invert()); // al sistema de la lanza
    spinLocal.y = 0; // perpendicular al palo, o no voltea entero
    if (spinLocal.lengthSq() < 1e-6) return SPIN_AXIS;
    return spinLocal.normalize();
  }

  // Una pasada: devuelve si ha tenido que girarlo.
  function pushSpearOut(spear) {
    spear.updateWorldMatrix(true, false);
    spear.localToWorld(bottom.set(0, spearEnds.bottom, 0));
    spear.localToWorld(top.set(0, spearEnds.top, 0));
    bodyGuard.from.getWorldPosition(guardFrom);
    bodyGuard.to.getWorldPosition(guardTo);
    guardTo.addScaledVector(axis.subVectors(guardTo, guardFrom), bodyGuard.over); // hasta lo alto de la cabeza
    closestOnSegments(bottom, top, guardFrom, guardTo, onShaft, onBody);
    const radius = bodyGuard.radius * figure.getWorldScale(boneScale).x;
    const lejos = onShaft.distanceTo(onBody);
    if (lejos >= radius) return false;
    spearBone.localToWorld(gripAt.copy(spearGripAt)); // el agarre (en el peón, el centro del puño): el palo no sale de la mano
    if (onShaft.distanceTo(gripAt) < radius * 0.5) return false; // cruza por el mismo puño: girar no lo arregla
    // Hacia fuera del eje; si el palo lo corta justo, hacia la derecha de la figura.
    pushOut.subVectors(onShaft, onBody);
    if (pushOut.lengthSq() < 1e-8) pushOut.set(-1, 0, 0).applyQuaternion(figure.getWorldQuaternion(guardTurn));
    pushOut.normalize();
    // El giro sobre el puño que lleva ese punto del palo al borde del cuerpo.
    axis.subVectors(onShaft, gripAt).normalize();
    pushOut.multiplyScalar(radius).add(onBody).sub(gripAt).normalize();
    guardTurn.setFromUnitVectors(axis, pushOut);
    // Se aplica en el mundo: el palo gira y su origen gira alrededor del puño.
    turnSpearAround(spear, guardTurn, gripAt);
    return true;
  }

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
    // El largo, en casillas de la pieza a su tamaño: al coronar (o al deshacer) la pieza nace encogida
    // al 1 % y crece, y si se medía entonces —el primer fotograma, al colocarla en su casilla, cuenta
    // como que anda— creía tener las piernas cien veces más cortas y pisaba cien veces más deprisa.
    const escala = figure.getWorldScale(new THREE.Vector3()).x || 1;
    return {
      thigh: a.distanceTo(b) / largo,
      shin: b.distanceTo(c) / largo,
      length: largo / escala,
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
  // LOS PASOS QUE SE OYEN: cada vez que un pie se posa andando, `onStep()`, que pone quien sabe a qué suena
  // (madera, armadura, piedra o cascos). Con el paso hueso a hueso (la reina, el rey), cuando su ciclo pasa
  // por el apoyo de cada pie (`applyGait`); con un clip de andar, cuando un pie que venía de arriba vuelve a
  // ras de suelo. Los pies, por defecto, los de una persona; el caballo dice cuáles son sus cascos.
  let onStep = null;
  let stepFeet = null;
  let lastStep = -Infinity;
  let stepClock = 0;
  const stepAt = new THREE.Vector3();
  const stepRoot = new THREE.Vector3();
  function watchFeet(names) {
    stepFeet = names.map((name) => findBone(model, name)).filter(Boolean).map((bone) => ({ bone, low: Infinity, up: false }));
  }
  function step() {
    if (stepClock - lastStep < STEP_GAP) return;
    lastStep = stepClock;
    onStep?.call(figure);
  }
  function detectSteps(dt) {
    stepClock += dt;
    if (!onStep || gaiting || dt <= 0) return;
    stepFeet ??= ['L_Foot', 'R_Foot'].map((name) => findBone(model, name)).filter(Boolean).map((bone) => ({ bone, low: Infinity, up: false }));
    if (!stepFeet.length) return;
    const andando = STEP_ACTIONS.has(currentName) && !current?.paused;
    if (!andando) {
      for (const foot of stepFeet) foot.up = false;
      return;
    }
    const alto = kit.spec.height;
    figure.getWorldPosition(stepRoot);
    for (const foot of stepFeet) {
      const y = foot.bone.getWorldPosition(stepAt).y - stepRoot.y;
      foot.low = Math.min(foot.low + STEP_DRIFT * alto * dt, y);
      if (y > foot.low + STEP_LIFT * alto) foot.up = true;
      else if (foot.up && y < foot.low + STEP_PLANT * alto) {
        foot.up = false;
        step();
      }
    }
  }

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
    const antes = gaitPhase;
    gaitPhase = (gaitPhase + gaitRate(moving, legs.length) * dt) % 1;
    if ((antes < 0.5 && gaitPhase >= 0.5) || gaitPhase < antes) step(); // se posa un pie (el derecho, el izquierdo)
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

  // Quieta del todo, como una estatua: sin animación, sin capa, sin contoneo ni pasos. La petrifica el
  // alfil: antes, ya de piedra, seguía respirando y meneando la lanza.
  let frozen = false;
  function update(dt) {
    if (frozen) return;
    restoreBones();
    restoreFist();
    restoreStance();
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
    applyStance(dt);
    for (const cut of [...cuts]) {
      if (cut.action.time < cut.at && cut.action === current) continue;
      cuts.splice(cuts.indexOf(cut), 1);
      cut.resolve(true);
    }
    aimSword();
    steadyShield(dt);
    keepShieldOffBody();
    detectSteps(dt);
    const spear = props.spear;
    if (!spear || !isOurs(spear)) return;
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
      if (spearPoseName() === 'body') followBody();
      const alongArm = thrustingAlongArm();
      if (alongArm) followArm();
      poseNow.rotateTowards(spearPose, (alongArm ? ARM_TURN_SPEED : POSE_TURN_SPEED) * dt);
      model.getWorldQuaternion(modelQuaternion).multiply(poseNow);
      spear.parent.getWorldQuaternion(boneQuaternion).invert();
      posed.copy(boneQuaternion).multiply(modelQuaternion);
      spear.quaternion.slerpQuaternions(spearHold, posed, spearBlend);
    }
    // El molinete va al final y por la derecha, que es componer en el sistema del PROPIO palo: así
    // da igual que el palo esté siguiendo a la mano (el peón) o puesto en una postura (el rey), y
    // como el origen de un palo está en su agarre, las vueltas salen alrededor del puño.
    if (spearSpin) spear.quaternion.multiply(spinQuaternion.setFromAxisAngle(spinAxis(spear), spearSpin));
    // El combate puede pedir que la lanza resbale hacia el regatón (para no atravesar al
    // rival) y, si un extremo se hunde en la peana o en el tablero, resbala hacia arriba.
    const gripStep = GRIP_SPEED * dt;
    grip += Math.max(-gripStep, Math.min(gripStep, gripTarget - grip));
    // En la estocada a lo largo del brazo, además, el puño sube por el palo (se coge más por en medio).
    armGrip += Math.max(-gripStep, Math.min(gripStep, (thrustingAlongArm() ? armThrust.grip : 0) - armGrip));
    spear.position.copy(spearGripAt);
    if (grip + armGrip !== 0) {
      axis.set(0, 1, 0).applyQuaternion(spear.quaternion);
      spear.position.addScaledVector(axis, -(grip + armGrip) / spear.parent.getWorldScale(boneScale).x);
    }
    spear.updateWorldMatrix(true, false);
    // Volteando, el báculo se sale del suelo media vuelta de cada vuelta: dejarlo resbalar para que
    // no lo atraviese lo haría correr por dentro del puño en cada giro, que es justo lo que NO se
    // quiere ver. Mientras voltea, atraviesa lo que haga falta.
    if (spearSpin) return;
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
    keepSpearOffBody(spear, dt);
    alignFist(spear);
  }

  // EN GUARDIA (`spearStance`). Con la mano colgando, los dedos miran al suelo y el puño solo puede agarrar un
  // palo atravesado, como el asa de una maleta: para sujetar la lanza derecha hay que llevar el antebrazo
  // hacia delante, con el codo doblado, como un piquero en guardia. Así, en reposo y andando: el brazo de la
  // lanza se coloca hueso a hueso (el del brazo apunta al codo y el del antebrazo a la muñeca, puestos en el
  // sistema de la figura), encima de la animación y fundiéndose con ella al entrar y al salir. En lo demás
  // (atacar, recibir, los gestos), manda la animación. Lo pidió el usuario: que la muñeca no se tuerza de
  // forma imposible para agarrar la lanza.
  let stance = null; // { upper, fore, hand, elbow, wrist, w, baseUpper, baseFore, applied }
  const STANCE_RATE = 4; // por segundo: entra y sale en un cuarto de segundo
  const STANCE_SNAP = 20; // y para el molinete, en una vigésima
  const stanceS = new THREE.Vector3();
  const stanceE = new THREE.Vector3();
  const stanceW = new THREE.Vector3();
  const stanceTo = new THREE.Vector3();
  const stanceFrom = new THREE.Vector3();
  const stanceFig = new THREE.Quaternion();
  const stanceRot = new THREE.Quaternion();
  const stanceBone = new THREE.Quaternion();
  const stanceParent = new THREE.Quaternion();
  const stanceIK = new THREE.Quaternion();
  function restoreStance() {
    if (!stance?.applied) return;
    stance.upper.quaternion.copy(stance.baseUpper);
    stance.fore.quaternion.copy(stance.baseFore);
    stance.applied = false;
  }
  // Gira `bone` en el mundo hasta que lo que va de `from` a su hijo apunte a `to`, y se queda con `w` de ese
  // giro (de 0, como estaba, a 1, del todo).
  function aimStance(bone, child, to, w) {
    bone.getWorldPosition(stanceFrom);
    child.getWorldPosition(stanceE);
    stanceE.sub(stanceFrom);
    stanceTo.copy(to).sub(stanceFrom);
    if (stanceE.lengthSq() < 1e-10 || stanceTo.lengthSq() < 1e-10) return;
    stanceRot.setFromUnitVectors(stanceE.normalize(), stanceTo.normalize());
    bone.getWorldQuaternion(stanceBone);
    bone.parent.getWorldQuaternion(stanceParent);
    stanceIK.copy(stanceParent.invert().multiply(stanceRot.multiply(stanceBone)));
    bone.quaternion.slerp(stanceIK, w);
    bone.updateWorldMatrix(false, true);
  }
  function applyStance(dt) {
    if (!stance) return;
    // En reposo, andando, saltando de la peana y mirando alrededor (que solo mueve la cabeza); y haciendo el
    // molinete, sea con lo que sea, que con el puño pegado al pecho (la burla del duelo) la lanza le barría el
    // cuerpo al voltear: con el antebrazo delante, voltea por delante de él. No en los gestos que mueven el
    // brazo ni al atacar.
    const enGuardia = currentName === 'idle' || currentName === 'walk' || currentName === 'jump'
      || (currentName === 'fidget' && currentVariant?.key === 'look_around') || Boolean(spearSpin);
    const quiere = enGuardia && !planted && !flying && props.spear?.visible ? 1 : 0;
    const paso = (spearSpin ? STANCE_SNAP : STANCE_RATE) * Math.max(dt, 0); // para el molinete, de golpe: la lanza ya voltea
    stance.w += THREE.MathUtils.clamp(quiere - stance.w, -paso, paso);
    if (dt === 0 && quiere) stance.w = 1; // al nacer, ya en guardia
    if (stance.w <= 0.001) return;
    stance.baseUpper.copy(stance.upper.quaternion);
    stance.baseFore.copy(stance.fore.quaternion);
    stance.applied = true;
    // Los largos, de la postura de ahora; los sitios, en el sistema de la figura.
    stance.upper.getWorldPosition(stanceS);
    stance.fore.getWorldPosition(stanceE);
    stance.hand.getWorldPosition(stanceW);
    const brazo = stanceE.distanceTo(stanceS);
    const antebrazo = stanceW.distanceTo(stanceE);
    figure.getWorldQuaternion(stanceFig);
    const codo = stanceS.clone().addScaledVector(stance.elbow.clone().applyQuaternion(stanceFig), brazo);
    aimStance(stance.upper, stance.fore, codo, stance.w);
    stance.fore.getWorldPosition(stanceE);
    const muneca = stanceE.clone().addScaledVector(stance.wrist.clone().applyQuaternion(stanceFig), antebrazo);
    aimStance(stance.fore, stance.hand, muneca, stance.w);
  }

  // EL PUÑO SIGUE AL PALO (`gripSpearFist`). El guante ya está cerrado en un puño; cada fotograma se le gira
  // la muñeca lo justo para que el hueco del puño quede a lo largo de la lanza, esté como esté (en la mano,
  // erguida o en plena estocada), y la lanza se queda donde estaba. Al voltearla (el molinete) no: la
  // muñeca seguiría a las vueltas.
  let fistTunnel = null; // el eje del hueco del puño, en el sistema del hueso de la mano
  // Cómo dejó la animación la muñeca antes de girarla, para devolverla al empezar el fotograma siguiente
  // (`restoreFist`): el mezclador de animaciones solo reescribe un hueso si su valor cambia, y con la mano
  // quieta el giro se iba sumando fotograma a fotograma (es lo mismo que hace `restoreBones`).
  const fistBase = new THREE.Quaternion();
  let fistApplied = false;
  function restoreFist() {
    if (!fistApplied) return;
    spearBone.quaternion.copy(fistBase);
    fistApplied = false;
  }
  // Lo que se le deja girar a la muñeca, para que no quede imposible (lo pidió el usuario): rotar la mano con
  // el antebrazo (como al abrir un pomo) llega lejos; doblarla, poco. Si con eso no basta, el palo cruza el
  // puño algo en diagonal: mejor eso que una muñeca rota.
  const FIST_TWIST_MAX = THREE.MathUtils.degToRad(80);
  const FIST_SWING_MAX = THREE.MathUtils.degToRad(35);
  const forearmAt = new THREE.Vector3();
  const handAt = new THREE.Vector3();
  const forearmAxis = new THREE.Vector3();
  const fistA = new THREE.Vector3();
  const fistB = new THREE.Vector3();
  const fistCross = new THREE.Vector3();
  const fistTwist = new THREE.Quaternion();
  const fistIdentity = new THREE.Quaternion();
  const fistStats = { twist: 0, swing: 0, residual: 0 }; // lo del último fotograma, en grados (para las pruebas)
  const fistDir = new THREE.Vector3();
  const fistAt = new THREE.Vector3();
  const fistCenter = new THREE.Vector3();
  const fistAxis = new THREE.Vector3();
  const fistShaft = new THREE.Vector3();
  const fistTurn = new THREE.Quaternion();
  const fistHand = new THREE.Quaternion();
  const fistParent = new THREE.Quaternion();
  const fistSpear = new THREE.Quaternion();
  function alignFist(spear) {
    if (!fistTunnel || spearSpin || planted || flying || spear.parent !== spearBone) return;
    spear.getWorldQuaternion(fistSpear);
    fistShaft.set(0, 1, 0).applyQuaternion(fistSpear);
    // Lo que ha resbalado la lanza por el puño, a lo largo de ella: girar la muñeca no lo puede cambiar.
    fistDir.copy(fistShaft);
    spear.getWorldPosition(fistAt);
    spearBone.localToWorld(fistCenter.copy(spearGripAt));
    const resbalon = fistAt.sub(fistCenter).dot(fistDir);
    spearBone.getWorldQuaternion(fistHand);
    fistAxis.copy(fistTunnel).applyQuaternion(fistHand);
    // 1. La mano rota con el antebrazo: el giro, alrededor de su eje, que más acerca el hueco del puño al palo
    //    (los dos se miran proyectados en el plano perpendicular al antebrazo). El hueco no tiene sentido:
    //    se gira lo menos posible, hacia un lado o hacia el otro.
    spearBone.parent.getWorldPosition(forearmAt);
    spearBone.getWorldPosition(handAt);
    forearmAxis.subVectors(handAt, forearmAt);
    let twist = 0;
    if (forearmAxis.lengthSq() > 1e-10) {
      forearmAxis.normalize();
      fistA.copy(fistAxis).addScaledVector(forearmAxis, -fistAxis.dot(forearmAxis));
      fistB.copy(fistShaft).addScaledVector(forearmAxis, -fistShaft.dot(forearmAxis));
      if (fistA.lengthSq() > 1e-6 && fistB.lengthSq() > 1e-6) {
        fistA.normalize();
        fistB.normalize();
        twist = Math.atan2(forearmAxis.dot(fistCross.crossVectors(fistA, fistB)), fistA.dot(fistB));
        if (twist > Math.PI / 2) twist -= Math.PI;
        else if (twist < -Math.PI / 2) twist += Math.PI;
        twist = THREE.MathUtils.clamp(twist, -FIST_TWIST_MAX, FIST_TWIST_MAX);
      }
      fistTwist.setFromAxisAngle(forearmAxis, twist);
    } else {
      fistTwist.identity();
    }
    fistAxis.applyQuaternion(fistTwist);
    // 2. Y se dobla, poco, lo que falte.
    if (fistAxis.dot(fistShaft) < 0) fistShaft.negate();
    fistTurn.setFromUnitVectors(fistAxis, fistShaft);
    let swing = 2 * Math.acos(Math.min(1, Math.abs(fistTurn.w)));
    if (swing > FIST_SWING_MAX) {
      fistTurn.slerp(fistIdentity, 1 - FIST_SWING_MAX / swing);
      swing = FIST_SWING_MAX;
    }
    fistStats.twist = THREE.MathUtils.radToDeg(twist);
    fistStats.swing = THREE.MathUtils.radToDeg(swing);
    fistStats.residual = THREE.MathUtils.radToDeg(fistA.copy(fistAxis).applyQuaternion(fistTurn).angleTo(fistShaft));
    fistTurn.multiply(fistTwist);
    if (Math.abs(twist) < 1e-4 && swing < 1e-4) return;
    // La mano, girada en el mundo; la lanza, con el giro de vuelta, para que no se mueva.
    if (!fistApplied) {
      fistBase.copy(spearBone.quaternion);
      fistApplied = true;
    }
    spearBone.parent.getWorldQuaternion(fistParent);
    spearBone.quaternion.copy(fistParent.invert().multiply(fistTurn.multiply(fistHand)));
    spearBone.updateWorldMatrix(false, false);
    spearBone.getWorldQuaternion(fistHand);
    spear.quaternion.copy(fistHand.invert().multiply(fistSpear));
    // Y por el centro del puño, que se ha movido con la mano, con el mismo resbalón. Dejarla donde estaba en
    // la mano sacaba el palo del puño en cuanto había resbalado (al celebrar, hasta un palmo).
    spearBone.localToWorld(fistCenter.copy(spearGripAt));
    fistAt.copy(fistCenter).addScaledVector(fistDir, resbalon);
    spear.position.copy(spearBone.worldToLocal(fistAt));
    spear.updateWorldMatrix(false, false);
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
    gaits: kit.gaits, // { aire: velocidad }, de los que trae
    turnRate: kit.turnRate,
    has: (action) => Boolean(variants[action]?.length),
    addStillBones,
    holdBones,
    dampBones,
    // Los pasos que se oyen: qué hacer cuando se posa un pie, y qué huesos son los pies.
    set onStep(fn) {
      onStep = fn ?? null;
    },
    get onPlay() {
      return onPlay;
    },
    set onPlay(fn) {
      onPlay = fn ?? null;
    },
    freeze(on = true) {
      frozen = on;
    },
    get frozen() {
      return frozen;
    },
    watchFeet,
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
    // Voltea el báculo sobre el puño: `radians` es lo que lleva girado, así que el combate lo
    // tuerce con un tween de 0 a las vueltas que quiera. Con 0 vuelve a su postura.
    setSpearSpin(radians) {
      spearSpin = radians || 0;
    },
    // Desliza la lanza en la mano: positivo, hacia el regatón; negativo, hacia la punta (sube).
    setGripSlide(amount) {
      gripTarget = Math.max(-1, amount);
    },
    // Que la lanza no le atraviese el cuerpo (`keepSpearOffBody`): el eje va del hueso `from` al `to` (y
    // `over` de su largo más arriba), con `radius` de grueso, medido en la figura sin escalar. Con null,
    // nada.
    // Que el escudo no le atraviese el cuerpo (`keepShieldOffBody`): el tronco va del hueso `from` al `to`,
    // con `radius` de grueso, y lo que se gira es el brazo `arm`. Con null, nada.
    guardShield(options) {
      const shield = props.shield;
      if (!options || !shield) {
        shieldGuard = null;
        return false;
      }
      const from = findBone(model, options.from);
      const to = findBone(model, options.to);
      const arm = findBone(model, options.arm);
      if (!from || !to || !arm) {
        shieldGuard = null;
        return false;
      }
      // Unos cuantos puntos de su malla, en el sistema del escudo: con un puñado basta para saber si se mete.
      shield.updateWorldMatrix(true, true);
      const inversa = shield.matrixWorld.clone().invert();
      const points = [];
      shield.traverse((o) => {
        const pos = o.isMesh ? o.geometry?.attributes?.position : null;
        if (!pos) return;
        const paso = Math.max(1, Math.floor(pos.count / 200));
        for (let i = 0; i < pos.count; i += paso) {
          points.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).applyMatrix4(inversa));
        }
      });
      shieldGuard = { from, to, arm, radius: options.radius ?? 0.13, points };
      return true;
    },
    // La estocada (`forward`) a lo largo del antebrazo y con la lanza cogida más por en medio: `grip` es lo
    // que sube el puño por el palo. Con null, como antes.
    thrustAlongArm(options) {
      armThrust = options ? { grip: options.grip ?? 0 } : null;
      applySpearPose();
    },
    guardSpear(options) {
      if (!options) {
        bodyGuard = null;
        return false;
      }
      const from = findBone(model, options.from);
      const to = findBone(model, options.to);
      bodyGuard = from && to ? { from, to, radius: options.radius ?? 0.15, over: options.over ?? 0.3 } : null;
      return Boolean(bodyGuard);
    },
    throwSpear,
    plantSpear,
    holdSpear,
    // Cierra el guante en un puño alrededor de la lanza (`fist-mesh.js`), para el peón, que tiene la mano de
    // una pieza: sin huesos en los dedos, la lanza le iba pegada a la mano abierta (lo vio el usuario). El
    // doblez se hace una vez en la malla, que comparten todos los peones de ese color; la lanza pasa a ir
    // por el hueco del puño, y la muñeca la sigue cada fotograma (`alignFist`).
    // En guardia, con la lanza derecha (ver `applyStance`): el brazo de la lanza (`upper`, `fore`, `hand`) con
    // el codo hacia `elbow` y la muñeca hacia `wrist` (direcciones en el sistema de la figura: +X a su
    // izquierda, +Y arriba, +Z delante). Con null, nada.
    spearStance(options) {
      if (!options) {
        restoreStance();
        stance = null;
        spearRest = null;
        applySpearPose();
        return false;
      }
      const upper = findBone(model, options.upper);
      const fore = findBone(model, options.fore);
      const hand = findBone(model, options.hand);
      if (!upper || !fore || !hand) return false;
      stance = {
        upper, fore, hand,
        elbow: new THREE.Vector3(...options.elbow).normalize(),
        wrist: new THREE.Vector3(...options.wrist).normalize(),
        w: 0, baseUpper: new THREE.Quaternion(), baseFore: new THREE.Quaternion(), applied: false,
      };
      spearRest = 'upright';
      applySpearPose();
      return true;
    },
    get fistStats() {
      return { ...fistStats };
    },
    gripSpearFist() {
      if (!props.spear || !spearBone || !spearGripAt) return false;
      for (let i = 0; i < 4; i++) update(0.3);
      object.updateMatrixWorld(true);
      let piel = null;
      model.traverse((o) => { if (!piel && o.isSkinnedMesh && o.skeleton?.bones.includes(spearBone)) piel = o; });
      if (!piel) return false;
      const g = piel.geometry;
      if (g.userData.puno === undefined) {
        const escala = spearBone.getWorldScale(new THREE.Vector3()).x || 1;
        const cuerpo = spearBone.worldToLocal(figure.getWorldPosition(new THREE.Vector3()).setY(spearBone.getWorldPosition(new THREE.Vector3()).y));
        g.userData.puno = bendFist({
          mesh: piel,
          bone: spearBone,
          shaftRadius: shaftRadius(props.spear) / escala,
          palmToward: cuerpo.normalize(),
        });
      }
      const puno = g.userData.puno;
      if (!puno) return false;
      spearGripAt.copy(puno.center);
      fistTunnel = puno.tunnel.clone();
      props.spear.position.copy(spearGripAt);
      return true;
    },
    // Cierra la mano sobre el báculo, dedo a dedo. Se pide desde fuera y no al cargar la pieza,
    // porque hasta que no tiene puesta su postura de reposo —con los brazos bajados, que es cosa
    // del juego y no del modelo— la mano no está donde va a estar, y el puño se cerraría sobre el
    // aire. Una vez cerrada se queda así: nada de lo que impone el juego toca los dedos.
    closeHandOnSpear() {
      if (!props.spear) return null;
      // Unos cuantos fotogramas antes de medir: la lanza llega a su postura (erguida, embestida…)
      // girando hacia ella, no de golpe, y con la pieza recién nacida todavía está a medio camino.
      // Cerrar el puño ahí orientaría la muñeca hacia una vara que aún se está moviendo.
      for (let i = 0; i < 4; i++) update(0.3);
      object.updateMatrixWorld(true);
      // Lo que se guarda es el DESPLAZAMIENTO que encuentra el puño, no el sitio en que acaba la
      // lanza: donde está ahora es `spearGripAt` más lo que le suma cada fotograma (el resbalón que
      // la levanta para que no atraviese la peana). Copiar el sitio entero metería ese resbalón
      // dentro del agarre, y al fotograma siguiente se volvería a sumar encima.
      const partida = props.spear.position.clone();
      const hecho = closeFistOn({
        model,
        prop: props.spear,
        side: spec.spear?.hand ?? 'right',
        center: figure.getWorldPosition(new THREE.Vector3()),
      });
      if (hecho && spearGripAt) spearGripAt.add(props.spear.position).sub(partida);
      return hecho;
    },
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
