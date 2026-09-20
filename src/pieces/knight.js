import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitToHeight, loadPieceKit, spawnPiece, withShadows } from './piece.js';
import { createFlag, flagTexture } from './flag.js';
import { findHorseBones } from './horse-bones.js';
import { measureBody, measureStrikes } from '../combat/strikes.js';

// El caballero (diseño en docs/superpowers/specs/2026-09-15-bchess-caballero-design.md, sección 3): una
// peana con un caballo encima y el jinete sentado en la silla, con la lanza y su banderín, la espada
// envainada (oculta) y el escudo. Caballo y jinete son piezas con esqueleto de `spawnPiece`, sin peana
// propia. A caballo, la figura del jinete cuelga de la del caballo; para pelear, baja al tablero. Sin
// caballo, el jinete va de pie sobre la peana, como un peón.

const MODELS = 'assets/models/';
const SEAT_LIFT = 0.06; // de la silla a la cadera del jinete sentado
const HITBOX_RADIUS = 0.45;
const PENNANT_SCALE = 0.7;
const PENNANT_BELOW_TIP = 0.3; // del extremo de la lanza al banderín
const MIN_HALF_WIDTH = 0.3; // el jinete, con el escudo y la lanza, es más ancho que el caballo
// Estribos: se buscan con rayos verticales por fuera de la barriga del caballo, cerca de la silla. La
// suela del estribo es una chapa fina que cuelga suelta: el rayo solo la atraviesa a ella (dos cortes,
// separados menos de `plate`) y queda por debajo de la silla (`low`). De todas las que aparecen se
// toman las más bajas (`band`), que son la suela; las demás son pliegues de la gualdrapa.
const STIRRUP_SCAN = { x: [0.18, 0.46], z: [-0.2, 0.45], step: 0.015, from: 1.25, reach: 1.1, plate: 0.05, low: 0.8, band: 0.04 };
const FOOT_ROUNDS = 14; // vueltas de la cinemática inversa de cada pierna del jinete
const KNEE_FORWARD = 0.45; // cuánto pesa que la rodilla vaya adelante frente a que vaya hacia fuera
const KNEE_STEP = 5; // grados entre cada posición de rodilla que se prueba
const FOOT_BONES = { 1: ['L_Thigh', 'L_Calf'], '-1': ['R_Thigh', 'R_Calf'] };
const FOOT_TIP = { 1: 'L_Foot', '-1': 'R_Foot' };
// Reposo vivo del caballo: este caballo no tiene animación de reposo (solo el paseo), así que quieto
// respira, mueve el cuello y espanta moscas con la cola aquí, con tres compases distintos para que no
// parezca un mecanismo. Lo pidió el usuario: quieto del todo parecía una estatua.
const BREATH_SECONDS = 3.6;
const BREATH_LIFT = 0.006; // lo que sube y baja el cuerpo al respirar
const BREATH_NECK = 5; // grados que sube y baja el cuello entero
const NECK_SWAY = 7; // y que se va de lado, a su aire
const TAIL_SECONDS = 5.3;
const TAIL_SWING = 10; // grados que se mueve la cola
// Acciones del jinete cuyo alcance en abanico se mide, para pedir sitio en las batallas.
const RIDER_FAN_ACTIONS = ['idle', 'walk', 'attack', 'block', 'kick', 'hit', 'fall', 'defeat', 'taunt', 'victory'];

// Sienta al jinete: los muslos hacia delante y abiertos, las rodillas dobladas y el brazo del escudo
// separado del cuerpo (`seat` del manifiesto, en grados en el espacio de la figura). Sin separar el
// brazo, el escudo queda dentro del caballo: de pie cuelga junto a la pierna, y ahí está el caballo.
function seat(rider, { thigh, calf, arm }) {
  rider.turnBone('L_Thigh', { x: thigh.x, z: thigh.z });
  rider.turnBone('R_Thigh', { x: thigh.x, z: -thigh.z });
  rider.turnBone('L_Calf', { x: calf.x });
  rider.turnBone('R_Calf', { x: calf.x });
  if (arm?.upper) rider.turnBone('L_Upperarm', arm.upper);
  if (arm?.fore) rider.turnBone('L_Forearm', arm.fore);
}

// Cadera del jinete de pie, en reposo, respecto a su figura.
function measureHip(rider) {
  const test = spawnPiece(rider);
  test.placeAt({ x: 0, z: 0 });
  test.face(0);
  test.holdRoot(); // la misma cadera quieta con la que irá sentado: si no, la medida sale del vaivén
  test.play('idle', { fade: 0 });
  test.update(0);
  test.object.updateMatrixWorld(true);
  const hip = test.object.getObjectByName('Hip').getWorldPosition(new THREE.Vector3());
  // De pie las suelas tocan el suelo, así que la altura del tobillo es lo que la bota sube la suela:
  // con ella se sabe a qué altura ha de ir el tobillo para que la bota pise el estribo.
  const ankle = test.object.getObjectByName(FOOT_TIP[1])?.getWorldPosition(new THREE.Vector3());
  hip.ankleHeight = ankle ? ankle.y : 0;
  return hip;
}

// Postura de quieto del caballo: el fotograma del paseo en el que las cuatro patas quedan más a la par
// (el primero deja una mano en el aire, como si cojeara) y lo que hay que subir o bajar el modelo para
// que los cascos toquen la peana en esa postura. Este caballo no tiene animación de reposo.
const STILL_SAMPLES = 32; // fotogramas del paseo que se prueban
const STILL_EVERY = 3; // un vértice de cada tantos
const STILL_BITE = 0.012; // lo que se hunden los cascos en la peana, para que no parezcan flotar
const STILL_NEAR = 0.3; // lo cerca que ha de estar un vértice del casco para ser de esa pata
const STILL_COMPACT = 0.5; // cuánto pesa que las patas estén recogidas frente a que estén a la par
const IK_ROUNDS = 10; // vueltas de la cinemática inversa
const IK_BONES = 3; // huesos de cada pata que se giran: los de arriba, que los de abajo dan el casco

// Baja un hueso (`tip`) hasta `target` (un punto del mundo) girando los huesos de `chain`, por
// aproximaciones sucesivas y encima de lo que haga la animación. Devuelve los giros impuestos, para
// poder repetirlos en otra pieza igual.
function reachTo(piece, chain, tipName, target, { rounds = IK_ROUNDS, start = null } = {}) {
  const tip = piece.figure.getObjectByName(tipName);
  const bones = chain.map((name) => ({ name, object: piece.figure.getObjectByName(name) })).filter((b) => b.object);
  if (!tip || !bones.length) return [];
  // Se parte de la postura que ya tuviera (la de sentado): así el resultado se le parece y no sale la
  // pierna recta, que es el camino más corto del muslo al estribo… y pasa por dentro del caballo.
  const turns = bones.map((bone, i) => (start?.[i] ? start[i].clone() : new THREE.Quaternion()));
  const figureTurn = new THREE.Quaternion();
  const swing = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  for (let round = 0; round < rounds; round++) {
    for (let i = bones.length - 1; i >= 0; i--) {
      piece.update(0);
      piece.figure.updateMatrixWorld(true);
      bones[i].object.getWorldPosition(at);
      from.copy(tip.getWorldPosition(new THREE.Vector3())).sub(at);
      to.copy(target).sub(at);
      if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) continue;
      swing.setFromUnitVectors(from.normalize(), to.normalize());
      piece.figure.getWorldQuaternion(figureTurn);
      // El giro se impone en el espacio de la figura, encima del que ya tuviera.
      turns[i].premultiply(figureTurn.clone().invert().multiply(swing).multiply(figureTurn));
      piece.turnBone(bones[i].name, turns[i]);
    }
  }
  return bones.map((bone, i) => ({ bone: bone.name, turn: turns[i].clone() }));
}

// Lo más bajo de la malla junto a cada casco y la altura de su hueso: la diferencia es lo que el casco
// baja por debajo del hueso, distinta en las patas de delante y en las de detrás.
function hoofSoles(test, legs) {
  const v = new THREE.Vector3();
  const ankles = Object.fromEntries(Object.entries(legs).map(([name, bones]) => [
    name, test.object.getObjectByName(bones.at(-1))?.getWorldPosition(new THREE.Vector3()) ?? null,
  ]));
  const lowest = Object.fromEntries(Object.keys(legs).map((name) => [name, Infinity]));
  test.object.traverseVisible((o) => {
    if (!o.isSkinnedMesh) return; // solo el caballo: la zona de toque es un cilindro invisible hasta el suelo
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i += STILL_EVERY) {
      o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld);
      for (const [name, ankle] of Object.entries(ankles)) {
        if (!ankle || Math.hypot(v.x - ankle.x, v.z - ankle.z) > STILL_NEAR) continue;
        lowest[name] = Math.min(lowest[name], v.y);
      }
    }
  });
  return Object.fromEntries(Object.entries(ankles).map(([name, ankle]) => [
    name, { ankle, sole: Number.isFinite(lowest[name]) ? lowest[name] : (ankle?.y ?? 0) },
  ]));
}

// Busca el estribo de un lado (`side`: 1 izquierda, -1 derecha) en las mallas del caballo, con rayos
// verticales. Devuelve el centro de la suela del estribo en el espacio de `figure`, o null.
function findStirrup(meshes, figure, side) {
  const down = new THREE.Vector3(0, -1, 0);
  const found = [];
  for (let x = STIRRUP_SCAN.x[0]; x <= STIRRUP_SCAN.x[1]; x += STIRRUP_SCAN.step) {
    for (let z = STIRRUP_SCAN.z[0]; z <= STIRRUP_SCAN.z[1]; z += STIRRUP_SCAN.step) {
      const from = figure.localToWorld(new THREE.Vector3(side * x, STIRRUP_SCAN.from, z));
      const hits = new THREE.Raycaster(from, down, 0, STIRRUP_SCAN.reach).intersectObjects(meshes, false);
      if (hits.length !== 2) continue;
      const ys = hits.map((hit) => figure.worldToLocal(hit.point.clone()).y);
      if (ys[0] - ys[1] > STIRRUP_SCAN.plate || ys[0] > STIRRUP_SCAN.low) continue;
      found.push({ x: side * x, y: ys[0], z });
    }
  }
  if (!found.length) return null;
  const lowest = Math.min(...found.map((p) => p.y));
  const tread = found.filter((p) => p.y <= lowest + STIRRUP_SCAN.band);
  const sum = tread.reduce((a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }), { x: 0, y: 0, z: 0 });
  return new THREE.Vector3(sum.x / tread.length, sum.y / tread.length, sum.z / tread.length);
}

// Postura de quieto del caballo, que no tiene animación de reposo. Ningún fotograma del paseo tiene las
// cuatro patas en el suelo (andando siempre hay alguna en el aire), así que se compone una: del paseo se
// toma el fotograma en que quedan más a la par y, encima, cada casco se baja al suelo con cinemática
// inversa. Devuelve ese fotograma, los giros que hay que imponer y cuánto sube o baja el modelo.
function measureStill(horse, legs) {
  const test = spawnPiece(horse);
  test.placeAt({ x: 0, z: 0 });
  test.face(0);
  const walk = test.play('walk', { fade: 0 }) || test.play('idle', { fade: 0 });
  if (!walk) return { time: 0, lift: 0, turns: [] };
  walk.paused = true;
  const duration = walk.getClip().duration;

  // 1. El fotograma en que los cuatro cascos quedan más a la par y más recogidos: de nada sirve tenerlos
  // a la misma altura si el caballo va con una mano estirada y el casco se sale de la peana.
  let base = null;
  for (let i = 0; i < STILL_SAMPLES; i++) {
    const time = (i / STILL_SAMPLES) * duration;
    walk.time = time;
    test.update(0);
    test.object.updateMatrixWorld(true);
    const hooves = Object.values(hoofSoles(test, legs));
    const soles = hooves.map((hoof) => hoof.sole);
    const zs = hooves.map((hoof) => hoof.ankle?.z ?? 0);
    const spread = Math.max(...soles) - Math.min(...soles);
    const length = Math.max(...zs) - Math.min(...zs); // lo que el caballo abre las patas a lo largo
    const score = spread + STILL_COMPACT * length;
    if (!base || score < base.score) base = { time, score, spread, floor: Math.min(...soles) };
  }
  walk.time = base.time;
  test.update(0);
  test.object.updateMatrixWorld(true);

  // 2. Cada casco, al suelo: se gira lo de arriba de la pata hasta que la suela llega al nivel del casco
  // más bajo, sin mover el casco de sitio.
  const turns = [];
  for (const [name, bones] of Object.entries(legs)) {
    const hoof = hoofSoles(test, legs)[name];
    if (!hoof?.ankle) continue;
    const drop = hoof.sole - base.floor;
    if (drop < 0.005) continue;
    const target = hoof.ankle.clone().setY(hoof.ankle.y - drop);
    turns.push(...reachTo(test, bones.slice(0, IK_BONES), bones.at(-1), target));
  }

  // 3. Con la postura ya compuesta, lo que hay que subir o bajar el modelo para tocar la peana.
  test.update(0);
  test.object.updateMatrixWorld(true);
  const soles = Object.values(hoofSoles(test, legs)).map((hoof) => hoof.sole);
  return { time: base.time, lift: -Math.min(...soles) - STILL_BITE, turns };
}

// Lo que los cascos traseros quedan por detrás del centro, con el caballo en la postura en la que de
// verdad se le ve. No vale medirlo en el modelo recién cargado: su esqueleto está en la postura de
// enlace, que en este caballo sale al doble de tamaño, y encabritándose se levantaría el doble de lo
// que debe, flotando un palmo sobre su peana.
function measureHoofBack(horse, legs) {
  const test = spawnPiece(horse);
  test.placeAt({ x: 0, z: 0 });
  test.face(0);
  const pose = test.play('idle', { fade: 0 }) || test.play('walk', { fade: 0 });
  if (pose) {
    pose.paused = true;
    pose.time = 0;
  }
  test.update(0);
  test.object.updateMatrixWorld(true);
  const backZ = [legs.backLeft.at(-1), legs.backRight.at(-1)]
    .map((name) => test.object.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).z ?? 0);
  return -(backZ[0] + backZ[1]) / 2;
}

// Medidas del conjunto, con el caballo en su postura de reposo y mirando a +Z:
// - `yaw`, `legs`, `neck`, `tail`: de `findHorseBones`;
// - `hoofBack`: lo que quedan los cascos traseros por detrás del centro, para encabritarse sobre ellos;
// - `still`: el fotograma del paseo en que se queda quieto y el ajuste de altura de esa postura;
// - `halfLength`, `halfWidth`: la huella del caballo con el jinete, para el salto;
// - `riderOffset`: dónde va la figura del jinete sentado, en el espacio de la figura del caballo;
// - `height`: del tablero al penacho, peana incluida.
function measureMount(horse, spec, hip, pedestalHeight) {
  const model = horse.model;
  model.updateMatrixWorld(true);
  const bones = [];
  const point = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isBone) return;
    o.getWorldPosition(point);
    bones.push({ name: o.name, parent: o.parent?.isBone ? o.parent.name : null, x: point.x, y: point.y, z: point.z });
  });
  const { yaw, legs, seatZ, neck, tail } = findHorseBones(bones);
  horse.spec.yaw = yaw; // `spawnPiece` lo aplica a cada caballo
  const hoofBack = measureHoofBack(horse, legs);
  const still = measureStill(horse, legs);

  // Huella y silla, con el modelo girado para mirar a +Z.
  model.rotation.y = yaw;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const down = new THREE.Raycaster(new THREE.Vector3(0, spec.horse.height + 1, seatZ), new THREE.Vector3(0, -1, 0));
  const seatY = down.intersectObject(model, true)[0]?.point.y ?? spec.horse.height * 0.65;
  model.rotation.y = 0;
  model.updateMatrixWorld(true);

  return {
    yaw,
    legs,
    neck,
    tail,
    still,
    hoofBack,
    halfLength: Math.max(-box.min.z, box.max.z),
    halfWidth: Math.max(-box.min.x, box.max.x, MIN_HALF_WIDTH),
    riderOffset: { x: -hip.x, y: seatY + SEAT_LIFT - hip.y, z: seatZ - hip.z },
    height: pedestalHeight + seatY + SEAT_LIFT + spec.rider.height - hip.y,
  };
}

export async function loadKnightKit(spec, quality) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [rider, horse, pedestalGltf, emblem] = await Promise.all([
    loadPieceKit({ ...spec.rider, pedestal: false }, quality),
    spec.horse
      ? loadPieceKit({ ...spec.horse, pedestal: false }, quality).catch((err) => {
        console.error('[BChess] No se pudo cargar el caballo; el caballero irá a pie:', err);
        return null;
      })
      : null,
    loader.loadAsync(MODELS + spec.pedestalModel.files[quality.name]),
    spec.pennant ? new THREE.ImageLoader().loadAsync(spec.pennant.texture).catch(() => null) : null,
  ]);
  rider.strikes = measureStrikes(rider, spawnPiece, { faces: true });
  rider.body = measureBody(rider, spawnPiece, { actions: RIDER_FAN_ACTIONS });
  const hip = measureHip(rider);

  // La peana de los peones, ensanchada para que quepa el caballo.
  const pedestal = withShadows(pedestalGltf.scene);
  const pedestalHeight = spec.pedestalModel.height;
  fitToHeight(pedestal, pedestalHeight);
  const width = spec.pedestalModel.width ?? 1;
  pedestal.scale.x *= width;
  pedestal.scale.z *= width;
  pedestal.position.x *= width;
  pedestal.position.z *= width;
  pedestal.updateMatrixWorld(true);
  const footprint = new THREE.Box3().setFromObject(pedestal);

  return {
    spec,
    rider,
    horse,
    pedestal,
    pedestalHeight,
    hipHeight: hip.y,
    ankleHeight: hip.ankleHeight,
    radius: Math.max(footprint.max.x - footprint.min.x, footprint.max.z - footprint.min.z) / 2,
    mount: horse ? measureMount(horse, spec, hip, pedestalHeight) : null,
    pennant: spec.pennant ? flagTexture(emblem) : null,
  };
}

export function spawnKnight(kit) {
  const { spec, mount } = kit;
  const object = new THREE.Group();
  object.name = 'caballero';

  const pedestal = new THREE.Group();
  pedestal.name = 'peana';
  pedestal.add(kit.pedestal.clone());
  object.add(pedestal);

  const rider = spawnPiece(kit.rider);
  object.add(rider.object);
  const horse = kit.horse ? spawnPiece(kit.horse) : null;
  if (horse) object.add(horse.object);
  // Los cascos, a ras de peana: la postura de quieto no deja el caballo a la altura del modelo, así que
  // se le sube o baja dentro de su figura una sola vez y el resto del juego no tiene que saberlo.
  if (horse && mount?.still?.lift) for (const child of horse.figure.children) child.position.y += mount.still.lift;
  // Giran primero hacia donde miran y después se inclinan sobre su propio eje (encabritarse, caer).
  rider.figure.rotation.order = 'YXZ';
  if (horse) horse.figure.rotation.order = 'YXZ';
  if (rider.props.sword) rider.props.sword.visible = false; // envainada mientras va a caballo

  const pennant = kit.pennant && rider.props.spear ? createFlag({ texture: kit.pennant, pole: false, poleHeight: 0 }) : null;
  if (pennant) {
    pennant.object.scale.setScalar(PENNANT_SCALE);
    pennant.object.rotation.y = Math.PI / 2; // la tela ondea hacia atrás
    pennant.object.position.y = rider.spearEnds.top - PENNANT_BELOW_TIP;
    rider.props.spear.add(pennant.object);
  }

  const height = mount?.height ?? kit.pedestalHeight + spec.rider.height;
  // Zona de toque invisible, del tamaño del caballero a caballo.
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(HITBOX_RADIUS, HITBOX_RADIUS, height, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  object.add(hitbox);

  // Cómo lleva el escudo de pie: su postura respecto a la figura y la que tiene colgado de la mano. A
  // caballo hay que separarle el brazo para que el escudo no quede dentro del caballo, y eso lo dejaría
  // torcido; con esto se le endereza sin moverlo de donde el brazo lo pone.
  const shield = rider.props.shield ?? null;
  const shieldInHand = shield ? { position: shield.position.clone(), quaternion: shield.quaternion.clone() } : null;
  let shieldStanding = null;
  if (shield) {
    rider.object.updateMatrixWorld(true);
    shieldStanding = rider.figure.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(shield.getWorldQuaternion(new THREE.Quaternion()));
  }

  // Cómo lleva las botas de pie: con esa misma inclinación pisarán el estribo, en vez de quedarse
  // colgando en el ángulo que dejen el muslo y la pantorrilla.
  const bootStanding = {};
  for (const side of [1, -1]) {
    const boot = rider.figure.getObjectByName(FOOT_TIP[side]);
    if (boot) {
      bootStanding[side] = rider.figure.getWorldQuaternion(new THREE.Quaternion()).invert()
        .multiply(boot.getWorldQuaternion(new THREE.Quaternion()));
    }
  }
  let stirrups = null; // dónde están los estribos, medidos una vez

  let mounted = false;
  let fidgeting = false; // mientras el caballo hace su gesto en reposo
  let resting = false; // quieto en su casilla: respira
  let restY = 0; // altura del caballo quieto, sobre la que respira
  let breath = Math.random() * BREATH_SECONDS; // cada caballo respira a su aire

  const hipBone = rider.object.getObjectByName('Hip'); // antes de que su figura cuelgue del caballo
  const down = new THREE.Vector3(0, -1, 0);
  const isRider = (o) => { for (let at = o; at; at = at.parent) if (at === rider.figure) return true; return false; };

  // El jinete se sienta en la silla: su figura pasa a colgar de la del caballo. La altura fina la da el
  // caballo de verdad, no la medida del kit: un rayo desde la cadera busca el lomo y lo deja SEAT_LIFT
  // por encima, así el jinete no se hunde ni flota aunque cambie el tamaño del caballo.
  function seatRider() {
    if (!horse) return;
    mounted = true;
    rider.resetBones();
    seat(rider, spec.rider.seat);
    horse.figure.add(rider.figure);
    rider.figure.position.set(mount.riderOffset.x, mount.riderOffset.y, mount.riderOffset.z);
    rider.figure.rotation.set(0, 0, 0);
    rider.figure.scale.setScalar(1);
    if (!hipBone) return;
    rider.holdRoot(); // sentado no se balancea de lado: iría a su aire y el escudo atravesaría al caballo
    horse.update(0); // primero el caballo en su postura de verdad: recién creado aún está en la de enlace
    rider.update(0);
    object.updateMatrixWorld(true);
    const meshes = [];
    horse.figure.traverseVisible((o) => { if (o.isSkinnedMesh && !isRider(o)) meshes.push(o); });
    const hip = hipBone.getWorldPosition(new THREE.Vector3());
    const saddle = new THREE.Raycaster(new THREE.Vector3(hip.x, hip.y + spec.horse.height, hip.z), down, 0, 2 * spec.horse.height)
      .intersectObjects(meshes, false)[0];
    if (saddle) rider.figure.position.y += saddle.point.y + SEAT_LIFT - hip.y;
    uprightShield();
    feetToStirrups(meshes);
  }

  // Mete los pies del jinete en los estribos: busca dónde están (una vez), baja cada tobillo a la altura
  // justa sobre la suela del estribo girando muslo y pantorrilla, y deja la bota como cuando va de pie.
  // Sin esto el jinete va con las piernas colgando y abiertas, como sentado a horcajadas.
  function feetToStirrups(meshes) {
    if (!horse || !mount) return;
    if (!stirrups) {
      stirrups = {};
      for (const side of [1, -1]) stirrups[side] = findStirrup(meshes, horse.figure, side);
    }
    const target = new THREE.Vector3();
    for (const side of [1, -1]) {
      const stirrup = stirrups[side];
      if (!stirrup) continue;
      target.copy(stirrup);
      target.y += kit.ankleHeight ?? 0;
      horse.figure.localToWorld(target);
      legToStirrup(side, target);
      levelBoot(side);
    }
  }

  // La postura de sentado del manifiesto, como giros, de la que se parte.
  function seatTurns(side) {
    const { thigh, calf } = spec.rider.seat;
    const degrees = Math.PI / 180;
    return [
      new THREE.Quaternion().setFromEuler(new THREE.Euler(thigh.x * degrees, 0, side * thigh.z * degrees)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(calf.x * degrees, 0, 0)),
    ];
  }

  // Pierna del jinete hasta el estribo, con la rodilla abierta por fuera de la barriga: muslo y
  // pantorrilla son dos segmentos de largo conocido, así que se resuelve de una vez. La rodilla se pone
  // del lado que marca el «polo» (hacia fuera y algo adelante), que es lo que hace que la pierna abrace
  // al caballo en vez de atravesarlo.
  function legToStirrup(side, target) {
    const thighBone = rider.figure.getObjectByName(FOOT_BONES[side][0]);
    const calfBone = rider.figure.getObjectByName(FOOT_BONES[side][1]);
    const footBone = rider.figure.getObjectByName(FOOT_TIP[side]);
    if (!thighBone || !calfBone || !footBone) return;
    const turns = seatTurns(side);
    rider.turnBone(FOOT_BONES[side][0], turns[0]);
    rider.turnBone(FOOT_BONES[side][1], turns[1]);
    rider.update(0);
    object.updateMatrixWorld(true);

    const hip = thighBone.getWorldPosition(new THREE.Vector3());
    const knee = calfBone.getWorldPosition(new THREE.Vector3());
    const ankle = footBone.getWorldPosition(new THREE.Vector3());
    const thighLength = hip.distanceTo(knee);
    const calfLength = knee.distanceTo(ankle);
    const reach = target.clone().sub(hip);
    const span = Math.min(
      Math.max(reach.length(), Math.abs(thighLength - calfLength) + 1e-3),
      thighLength + calfLength - 1e-3,
    );
    const direction = reach.clone().normalize();

    // Con el pie en el estribo, la rodilla puede estar en cualquier punto de una circunferencia. Se
    // recorre entera y se queda con la que más se aparta del caballo (y, a igualdad, la más adelantada):
    // esa es la pierna que abraza la barriga en vez de atravesarla.
    const centre = horse.figure.getWorldPosition(new THREE.Vector3());
    const outward = horse.figure.localToWorld(new THREE.Vector3(side, 0, 0)).sub(centre).normalize();
    const forward = horse.figure.localToWorld(new THREE.Vector3(0, 0, 1)).sub(centre).normalize();
    const cosine = (thighLength * thighLength + span * span - calfLength * calfLength) / (2 * thighLength * span);
    const angle = Math.acos(Math.min(1, Math.max(-1, cosine)));
    const along = hip.clone().addScaledVector(direction, thighLength * Math.cos(angle));
    const radius = thighLength * Math.sin(angle);
    const u = new THREE.Vector3().crossVectors(direction, outward);
    if (u.lengthSq() < 1e-6) return;
    u.normalize();
    const w = new THREE.Vector3().crossVectors(direction, u).normalize();
    let wanted = null;
    let bestScore = -Infinity;
    const point = new THREE.Vector3();
    for (let degrees = 0; degrees < 360; degrees += KNEE_STEP) {
      const t = (degrees * Math.PI) / 180;
      point.copy(along).addScaledVector(u, radius * Math.cos(t)).addScaledVector(w, radius * Math.sin(t));
      const offset = point.clone().sub(hip);
      const score = offset.dot(outward) + KNEE_FORWARD * offset.dot(forward);
      if (score > bestScore) {
        bestScore = score;
        wanted = point.clone();
      }
    }
    if (!wanted) return;

    const figureTurn = rider.figure.getWorldQuaternion(new THREE.Quaternion());
    const inFigure = (turn) => figureTurn.clone().invert().multiply(turn).multiply(figureTurn);

    // 1. El muslo apunta a donde ha de ir la rodilla; la pantorrilla va con él (giro por delante y por
    // detrás, que es lo que deja su postura igual respecto al muslo).
    const swingThigh = inFigure(new THREE.Quaternion().setFromUnitVectors(
      knee.clone().sub(hip).normalize(),
      wanted.clone().sub(hip).normalize(),
    ));
    turns[0].premultiply(swingThigh);
    turns[1].premultiply(swingThigh).multiply(swingThigh.clone().invert());
    rider.turnBone(FOOT_BONES[side][0], turns[0]);
    rider.turnBone(FOOT_BONES[side][1], turns[1]);
    rider.update(0);
    object.updateMatrixWorld(true);

    // 2. La pantorrilla baja hasta el estribo.
    const kneeNow = calfBone.getWorldPosition(new THREE.Vector3());
    const ankleNow = footBone.getWorldPosition(new THREE.Vector3());
    turns[1].premultiply(inFigure(new THREE.Quaternion().setFromUnitVectors(
      ankleNow.clone().sub(kneeNow).normalize(),
      target.clone().sub(kneeNow).normalize(),
    )));
    rider.turnBone(FOOT_BONES[side][1], turns[1]);
    rider.update(0);
    object.updateMatrixWorld(true);
  }

  // Deja el escudo tan recto como cuando el caballero va a pie, esté como esté el brazo, girándolo
  // alrededor del puño: girándolo sobre su propio centro se quedaría flotando lejos de la mano.
  function uprightShield() {
    if (!shield || !shieldStanding || !shieldInHand) return;
    shield.parent.updateMatrixWorld(true);
    const want = rider.figure.getWorldQuaternion(new THREE.Quaternion()).multiply(shieldStanding);
    const turn = shield.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want);
    // Dónde agarra la mano el escudo, en el espacio del escudo: el origen del hueso de la mano.
    const grip = shieldInHand.position.clone().negate().applyQuaternion(shieldInHand.quaternion.clone().invert());
    shield.quaternion.copy(turn);
    shield.position.copy(grip.applyQuaternion(turn).negate());
  }

  // Deja la bota como cuando el caballero va de pie: horizontal sobre el estribo.
  function levelBoot(side) {
    const boot = rider.figure.getObjectByName(FOOT_TIP[side]);
    if (!boot || !bootStanding[side]) return;
    rider.update(0);
    object.updateMatrixWorld(true);
    const figureTurn = rider.figure.getWorldQuaternion(new THREE.Quaternion());
    const want = figureTurn.clone().multiply(bootStanding[side]);
    const turn = figureTurn.clone().invert()
      .multiply(want).multiply(boot.getWorldQuaternion(new THREE.Quaternion()).invert())
      .multiply(figureTurn);
    rider.turnBone(FOOT_TIP[side], turn);
  }

  // Respiración y meneo del caballo quieto: el cuerpo sube y baja un pelo, el cuello se mueve con otro
  // compás y la cola con un tercero, para que ninguno de los tres caiga a la vez que otro.
  function breathe(dt) {
    if (!horse || !mount) return;
    breath += dt;
    const chest = Math.sin((2 * Math.PI * breath) / BREATH_SECONDS);
    const sway = Math.sin((2 * Math.PI * breath) / (BREATH_SECONDS * 1.63) + 0.7);
    const swish = Math.sin((2 * Math.PI * breath) / TAIL_SECONDS);
    horse.figure.position.y = restY + BREATH_LIFT * chest;
    for (const name of mount.neck) horse.turnBone(name, { x: (BREATH_NECK * chest) / mount.neck.length, y: (NECK_SWAY * sway) / mount.neck.length });
    for (const name of mount.tail) horse.turnBone(name, { y: (TAIL_SWING * swish) / mount.tail.length });
  }

  // El jinete deja la silla donde está: su figura vuelve a colgar de su pieza, erguida y mirando hacia
  // donde miraba, con las piernas sueltas.
  function unseatRider() {
    if (!mounted) return;
    mounted = false;
    rider.object.attach(rider.figure);
    const turn = new THREE.Euler().setFromQuaternion(rider.figure.quaternion, 'YXZ');
    rider.figure.rotation.set(0, turn.y, 0);
    rider.figure.scale.setScalar(1);
    rider.holdRoot(false);
    rider.resetBones();
    if (shield && shieldInHand) { // vuelve a colgar de la mano como cuando va a pie
      shield.position.copy(shieldInHand.position);
      shield.quaternion.copy(shieldInHand.quaternion);
    }
  }

  return {
    object,
    pedestal,
    hitbox,
    horse,
    rider,
    mount,
    body: kit.rider.body, // medidas del jinete para pelear a pie (`measureBody`)
    radius: kit.radius,
    height,
    pedestalHeight: kit.pedestalHeight,
    hipHeight: kit.hipHeight,
    get mounted() {
      return mounted;
    },
    get fidgeting() {
      return fidgeting || (!mounted && rider.fidgeting);
    },
    // Quieto en su casilla: mientras lo está, respira. Lo apaga quien lo mueva.
    get resting() {
      return resting;
    },
    set resting(value) {
      const on = Boolean(value) && Boolean(horse);
      if (on === resting) return;
      resting = on;
      if (!horse || !mount) return;
      if (on) restY = horse.figure.position.y;
      else for (const name of [...mount.neck, ...mount.tail]) horse.turnBone(name, null);
    },
    set fidgeting(value) {
      fidgeting = Boolean(value);
    },
    // A caballo, la figura es la del caballo; a pie (o sin caballo), la del jinete.
    get figure() {
      return mounted ? horse.figure : rider.figure;
    },
    seatRider,
    unseatRider,
    placeAt(position) {
      pedestal.position.set(position.x, 0, position.z);
      hitbox.position.set(position.x, height / 2, position.z);
      (horse ?? rider).figure.position.set(position.x, kit.pedestalHeight, position.z);
    },
    face(angle) {
      (horse ?? rider).figure.rotation.set(0, angle, 0);
    },
    update(dt) {
      if (resting) breathe(dt);
      horse?.update(dt);
      rider.update(dt);
      pennant?.update(dt);
    },
  };
}
