import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitToHeight, loadPieceKit, spawnPiece, withShadows } from './piece.js';
import { createFlag, flagTexture } from './flag.js';
import { findHorseBones } from './horse-bones.js';
import { measureBody, measureStrikes } from '../combat/strikes.js';
import { groundLift } from '../moves/walk.js';

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
const STILL_BITE = 0.012; // lo que se hunden los cascos en la peana, para que no parezcan flotar
const STILL_FLAT = 0.01; // grosor de la rodaja en la que se da una suela por apoyada
const STILL_PLANT = 0.02; // lo alto que puede estar una pezuña y seguir contando como apoyada
const STILL_SOLE = 0.8; // parte de la mejor suela apoyada que hay que tener para valer
const HOOF_STEP = 0.5; // radianes del primer tanteo al aplomar una pezuña
const HOOF_FINE = 0.03; // y del último, ya afinando
const HOOF_ROUNDS = 8; // vueltas como mucho con cada tamaño de paso
const STILL_EDGE = 0.07; // lo que un casco se queda por dentro del borde de la peana
const STILL_STEADY = 0.01; // radianes de diferencia que ya no vale la pena imponer
const POSE_TRIES = 4; // veces que se impone un giro y se corrige lo que falta
const STILL_STRETCH = 3; // veces que se mide y se alarga la pata que no llega al suelo
const STILL_MAX = 0.12; // lo más que se alarga o se recoge una pata, pase lo que pase
const STILL_REACH = 0.35; // y lo más que se le adelanta o se le atrasa la pezuña

// Un paso hacia `pide` que ni se pasa del tope total (`tope`) ni corrige todo de golpe.
const frena = (pide, llevado, tope) => {
  const queda = Math.max(0, tope - Math.abs(llevado));
  return Math.sign(pide) * Math.min(Math.abs(pide), queda);
};
const GROUND_SAMPLES = 24; // puntos del paseo en los que se mide dónde le queda el suelo
const STILL_FLOOR = 0.005; // altura por debajo de la cual un casco ya se da por apoyado

// La suela de cada casco: su vértice más bajo, cuántos quedan a ras de él y por dónde toca.
//
// Los vértices de una pezuña son LOS SUYOS —los que ese hueso manda en el esqueleto—, no los que le
// caen cerca. La diferencia lo es todo: alrededor de un casco hay caña y menudillo, y esos no se
// mueven cuando se gira la pezuña. Midiendo por cercanía, girarla nunca parece arreglar nada (lo más
// bajo sigue donde estaba) y se sigue girando hasta enterrarla un palmo por debajo de las otras
// tres; y una pezuña levantada que pasa por encima de la de al lado se queda con los vértices de la
// otra y parece apoyada.
function hoofSoles(test, legs) {
  const dueño = new Map(); // hueso del casco → nombre de su pata
  const ankles = {};
  for (const [name, bones] of Object.entries(legs)) {
    const casco = test.object.getObjectByName(bones.at(-1));
    ankles[name] = casco?.getWorldPosition(new THREE.Vector3()) ?? null;
    if (casco) dueño.set(casco, name);
  }
  const bajo = Object.fromEntries(Object.keys(legs).map((name) => [name, Infinity]));
  const suyos = Object.fromEntries(Object.keys(legs).map((name) => [name, []]));
  const v = new THREE.Vector3();
  const indices = new THREE.Vector4();
  const pesos = new THREE.Vector4();
  test.object.traverseVisible((o) => {
    if (!o.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = o.geometry.attributes;
    if (!skinIndex || !skinWeight) return;
    const deIndice = new Map();
    o.skeleton.bones.forEach((hueso, i) => {
      const name = dueño.get(hueso);
      if (name) deIndice.set(i, name);
    });
    if (!deIndice.size) return;
    for (let i = 0; i < position.count; i++) {
      indices.fromBufferAttribute(skinIndex, i);
      pesos.fromBufferAttribute(skinWeight, i);
      let manda = -1;
      let peso = 0;
      if (pesos.x > peso) { peso = pesos.x; manda = indices.x; }
      if (pesos.y > peso) { peso = pesos.y; manda = indices.y; }
      if (pesos.z > peso) { peso = pesos.z; manda = indices.z; }
      if (pesos.w > peso) { peso = pesos.w; manda = indices.w; }
      const name = deIndice.get(manda);
      if (!name) continue;
      o.getVertexPosition(i, v);
      v.applyMatrix4(o.matrixWorld);
      suyos[name].push(v.clone());
      bajo[name] = Math.min(bajo[name], v.y);
    }
  });
  return Object.fromEntries(Object.keys(legs).map((name) => {
    const tocan = suyos[name].filter((p) => p.y <= bajo[name] + STILL_FLAT);
    return [name, {
      ankle: ankles[name],
      sole: Number.isFinite(bajo[name]) ? bajo[name] : (ankles[name]?.y ?? 0),
      flat: tocan.length, // muchos si la suela está apoyada de plano; cuatro si toca de canto
      contact: tocan.length
        ? tocan.reduce((suma, p) => suma.add(p), new THREE.Vector3()).multiplyScalar(1 / tocan.length)
        : null,
    }];
  }));
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

// UN CABALLO PARADO, SACADO DE SU PROPIO PASEO.
//
// El modelo no trae postura de reposo: solo el paseo. Y un paseo NUNCA tiene las cuatro pezuñas
// abajo a la vez, así que congelarlo en un fotograma deja al caballo con una mano en el aire, pase
// lo que pase. Estirarle esa pata con cinemática inversa tampoco sale: el sitio al que habría que
// bajar el casco le queda fuera del alcance de la pata, y lo único que se consigue es torcerle el
// menudillo y dejarle la pezuña mirando al cielo.
//
// Lo que sí funciona: cada pata se saca del instante en que ESA pata pisa. Las cuatro son cadenas de
// huesos independientes —no comparten ninguno—, así que se pueden tomar de momentos distintos del
// mismo paseo y juntarlas. Cada una queda entonces en una postura de apoyo de verdad, hecha por
// quien animó el caballo, con su menudillo y su pezuña donde tienen que estar.
//
// Devuelve el fotograma en que se queda el cuerpo, los giros que ponen cada pata en su sitio y lo
// que hay que subir o bajar el modelo para que las pezuñas toquen la peana.
function measureStill(horse, legs, radius) {
  const test = spawnPiece(horse);
  test.placeAt({ x: 0, z: 0 });
  test.face(0);
  const walk = test.play('walk', { fade: 0 }) || test.play('idle', { fade: 0 });
  if (!walk) return { time: 0, lift: 0, turns: [] };
  walk.paused = true;
  const duration = walk.getClip().duration;
  const en = (time) => {
    walk.time = time;
    test.update(0);
    test.object.updateMatrixWorld(true);
  };

  // 1. Cuándo pisa cada pata: cuando su suela está en lo más bajo. Una pezuña se queda plantada un
  // buen rato, así que de entre esos instantes se coge el que la deja más cerca de la vertical de su
  // hombro —que es como se para un caballo, y además la mete dentro de la peana.
  const cabe = (radius ?? Infinity) - STILL_EDGE;
  const medidas = new Map(Object.keys(legs).map((name) => [name, []]));
  for (let i = 0; i < STILL_SAMPLES; i++) {
    const time = (i / STILL_SAMPLES) * duration;
    en(time);
    const hooves = hoofSoles(test, legs);
    for (const [name, bones] of Object.entries(legs)) {
      const hoof = hooves[name];
      if (!hoof?.ankle) continue;
      const hombro = test.object.getObjectByName(bones[0])?.getWorldPosition(new THREE.Vector3());
      medidas.get(name).push({
        time,
        sole: hoof.sole,
        apoyo: hoof.flat, // cuánta suela toca: lo que distingue pisar de rozar con la punta
        aplomo: hombro ? Math.hypot(hoof.ankle.x - hombro.x, hoof.ankle.z - hombro.z) : 0,
        lejos: Math.hypot(hoof.ankle.x, hoof.ankle.z),
      });
    }
  }
  const pisa = {};
  for (const [name, lista] of medidas) {
    if (!lista.length) continue;
    // Pisar no es «tener el punto más bajo»: es tocar CON TODA LA SUELA. De los instantes en que la
    // pezuña está abajo se descartan los que la dejan fuera de la peana y, de los que quedan, se
    // coge el de más suela apoyada; a igualdad, el que la deja más cerca de la vertical de su hombro.
    const abajo = Math.min(...lista.map((m) => m.sole));
    const apoyadas = lista.filter((m) => m.sole <= abajo + STILL_PLANT);
    // Por orden, sin descartar nada: primero la que menos se sale de la peana (casi siempre, varias
    // no se salen nada), de esas la de más suela apoyada, y a igualdad la más aplomada. Filtrando en
    // vez de ordenar se acaba con el conjunto vacío y con una pata estirada media casilla hacia atrás.
    const fuera = (m) => Math.max(0, m.lejos - cabe);
    const masSuela = Math.max(...apoyadas.map((m) => m.apoyo));
    pisa[name] = apoyadas.reduce((mejor, m) => {
      const suyo = [fuera(m), -Math.min(m.apoyo, masSuela * STILL_SOLE), m.aplomo];
      const otro = [fuera(mejor), -Math.min(mejor.apoyo, masSuela * STILL_SOLE), mejor.aplomo];
      for (let i = 0; i < suyo.length; i++) {
        if (suyo[i] < otro[i] - 1e-6) return m;
        if (suyo[i] > otro[i] + 1e-6) return mejor;
      }
      return mejor;
    });
  }

  // 2. La postura de cada pata en su instante, hueso a hueso. Se guarda la del ESQUELETO, no la del
  // mundo: así se puede volver a poner con el cuerpo en otro fotograma.
  const quiere = new Map();
  for (const [name, bones] of Object.entries(legs)) {
    if (!pisa[name]) continue;
    en(pisa[name].time);
    for (const nombre of bones) {
      const hueso = test.object.getObjectByName(nombre);
      if (hueso) quiere.set(nombre, hueso.quaternion.clone());
    }
  }

  // 3. El cuerpo se queda en un fotograma del paseo (en un paseo el tronco casi no se mueve) y a
  // cada hueso de las patas se le impone el giro que lo lleva de la postura que tiene ahí a la que
  // tenía cuando esa pata pisaba. Los giros van en el espacio de la FIGURA, que es lo que sabe hacer
  // `turnBone`, y de arriba abajo: girar un hueso arrastra a los de debajo, así que cada uno se
  // calcula con los de encima ya puestos.
  const time = pisa[Object.keys(legs)[0]]?.time ?? 0;
  en(time);
  const figura = test.figure.getWorldQuaternion(new THREE.Quaternion());
  const inversa = figura.clone().invert();
  const padre = new THREE.Quaternion();
  const turns = [];
  for (const bones of Object.values(legs)) {
    for (const nombre of bones) {
      const hueso = test.object.getObjectByName(nombre);
      const destino = quiere.get(nombre);
      if (!hueso || !destino) continue;
      // Se impone, se mira cómo ha quedado y se corrige: el giro se pide en el espacio de la figura
      // y acaba componiéndose con el del padre y con el que la animación ya tuviera, así que a la
      // primera se queda cerca pero no clavado —y en el menudillo «cerca» es una pezuña torcida.
      // Midiendo lo que falta y volviendo a pedirlo, en dos o tres vueltas no queda diferencia.
      let turn = null;
      for (let intento = 0; intento < POSE_TRIES; intento++) {
        if (hueso.quaternion.angleTo(destino) < STILL_STEADY) break;
        hueso.parent.getWorldQuaternion(padre);
        const falta = padre.clone()
          .multiply(destino)
          .multiply(hueso.quaternion.clone().invert())
          .multiply(padre.clone().invert());
        turn = inversa.clone().multiply(falta).multiply(figura).multiply(turn ?? new THREE.Quaternion());
        test.turnBone(nombre, turn);
        test.update(0);
        test.object.updateMatrixWorld(true);
      }
      if (turn) turns.push({ bone: nombre, turn });
    }
  }

  // 3b. LA PEZUÑA, DE PLANO. Hay patas que en TODO el paseo no llegan a apoyar bien —esta mano
  // derecha toca con cuatro vértices donde las otras tocan con veinte—, así que por bien que se
  // elija el instante, la suela se queda de canto y la herradura mirando al cielo. Eso ya no es
  // cuestión de elegir: hay que girarle la pezuña.
  //
  // Y se busca a tientas, probando giros y quedándose con el que deja MÁS SUELA TOCANDO, que es la
  // definición de una pezuña apoyada. Apuntar el hueso hacia abajo no vale: en un casco el hueso
  // está donde el aparejo lo puso —en esta pata, de lado—, y enderezarlo a él deja la suela igual de
  // torcida. Se prueba a pasos grandes y luego finos, y solo con las patas que lo necesitan: cada
  // prueba cuesta recorrer la malla entera.
  const ejes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
  const apoyos = hoofSoles(test, legs);
  const mejorSuela = Math.max(...Object.values(apoyos).map((hoof) => hoof.flat));
  for (const [name, bones] of Object.entries(legs)) {
    if ((apoyos[name]?.flat ?? 0) >= mejorSuela * STILL_SOLE) continue; // esta ya pisa de plano
    const nombre = bones.at(-1);
    const casco = test.object.getObjectByName(nombre);
    if (!casco) continue;
    const previo = turns.find((t) => t.bone === nombre);
    const poner = (q) => {
      test.turnBone(nombre, q);
      test.update(0);
      test.object.updateMatrixWorld(true);
    };
    const suela = () => hoofSoles(test, legs)[name]?.flat ?? 0;
    let mejor = { turn: previo?.turn ?? null, flat: suela() };
    for (let paso = HOOF_STEP; paso >= HOOF_FINE; paso /= 2) {
      for (let vuelta = 0; vuelta < HOOF_ROUNDS; vuelta++) {
        let mejora = false;
        for (const eje of ejes) {
          for (const signo of [1, -1]) {
            const prueba = inversa.clone()
              .multiply(new THREE.Quaternion().setFromAxisAngle(eje, signo * paso))
              .multiply(figura)
              .multiply(mejor.turn ?? new THREE.Quaternion());
            poner(prueba);
            const flat = suela();
            if (flat > mejor.flat) {
              mejor = { turn: prueba, flat };
              mejora = true;
            }
          }
        }
        poner(mejor.turn);
        if (!mejora) break;
      }
    }
    if (previo) previo.turn = mejor.turn;
    else if (mejor.turn) turns.push({ bone: nombre, turn: mejor.turn });
  }

  // 4. CADA PEZUÑA, A SU SITIO: a ras del suelo y bajo su propio hombro. Dos cosas que no arregla
  // elegir bien el instante, porque no son de la postura sino del modelo y de la animación:
  //
  //  - Este caballo no es simétrico: su mano derecha no baja tanto como las otras tres en NINGÚN
  //    momento del paseo. Sin corregirlo, esa pezuña se queda en el aire.
  //  - Y hay patas cuyo único instante de apoyo las pilla estiradas hacia atrás —la trasera derecha
  //    apoya veintinueve centímetros por detrás de su cadera, cuando las otras tres se quedan a
  //    menos de ocho—, así que se sale de la peana.
  //
  // Las dos se arreglan igual: moviendo los huesos de la pata, repartido entre todos, de modo que
  // cada uno se desplaza una pizca y la pezuña se desplaza la suma. El hueso de arriba no se toca,
  // así que la pata sigue colgando del cuerpo donde debe. Repartido no se ve; de golpe en el
  // menudillo saldría una cuartilla del doble de largo.
  //
  // El suelo es la MEDIANA de las cuatro, no la más baja: si se toma la más baja, basta con que una
  // quede un poco por debajo para que las otras tres «falten» un palmo, y recalculándola en cada
  // vuelta se realimenta hasta dejar al caballo con medio metro de pata, enterrado en la peana.

  const lifts = [];
  const alturas = Object.values(hoofSoles(test, legs)).map((hoof) => hoof.sole).sort((a, b) => a - b);
  const suelo = (alturas[Math.floor((alturas.length - 1) / 2)] + alturas[Math.ceil((alturas.length - 1) / 2)]) / 2;
  const movido = new Map(Object.keys(legs).map((name) => [name, new THREE.Vector3()]));
  const paso = new THREE.Vector3();
  for (let vuelta = 0; vuelta < STILL_STRETCH; vuelta++) {
    const hooves = hoofSoles(test, legs);
    for (const [name, bones] of Object.entries(legs)) {
      const casco = hooves[name]?.ankle;
      const hombro = test.object.getObjectByName(bones[0])?.getWorldPosition(new THREE.Vector3());
      if (!casco || bones.length < 2) continue;
      // Adónde tiene que ir la pezuña: a ras del suelo y bajo su propio hombro (o su cadera).
      paso.set(
        hombro ? hombro.x - casco.x : 0,
        suelo - (hooves[name]?.sole ?? suelo),
        hombro ? hombro.z - casco.z : 0,
      );
      // Con freno, y sin pasarse de lo que se le puede mover a una pata en total.
      const queda = movido.get(name);
      paso.x = frena(paso.x, queda.x, STILL_REACH);
      paso.y = frena(paso.y, queda.y, STILL_MAX);
      paso.z = frena(paso.z, queda.z, STILL_REACH);
      if (paso.lengthSq() < STILL_FLOOR * STILL_FLOOR) continue;
      queda.add(paso);
      for (const nombre of bones.slice(1)) {
        let previo = lifts.find((l) => l.bone === nombre);
        if (!previo) {
          previo = { bone: nombre, lift: { x: 0, y: 0, z: 0 } };
          lifts.push(previo);
        }
        previo.lift.x += paso.x / (bones.length - 1);
        previo.lift.y += paso.y / (bones.length - 1);
        previo.lift.z += paso.z / (bones.length - 1);
        test.liftBone(nombre, previo.lift);
      }
      test.update(0);
      test.object.updateMatrixWorld(true);
    }
  }

  // 5. Y con las cuatro pezuñas ya a la par, lo que hay que subir o bajar el modelo para que toquen
  // la peana.
  const hooves = hoofSoles(test, legs);
  const soles = Object.values(hooves).map((hoof) => hoof.sole);
  const piso = Math.min(...soles);
  if (globalThis.location?.search.includes('patas')) {
    console.log('[BChess] patas: ' + JSON.stringify(Object.fromEntries(Object.keys(legs).map((name) => {
      const casco = hooves[name].ankle;
      const hombro = test.object.getObjectByName(legs[name][0])?.getWorldPosition(new THREE.Vector3());
      return [name, {
        sobreElSuelo: +(hooves[name].sole - piso).toFixed(4),
        suelaApoyada: hooves[name].flat,
        bajoElHombro: casco && hombro ? +Math.hypot(casco.x - hombro.x, casco.z - hombro.z).toFixed(3) : null,
        delCentro: +Math.hypot(casco?.x ?? 0, casco?.z ?? 0).toFixed(3),
      }];
    }))));
  }
  return { time, lift: -piso - STILL_BITE, turns, lifts };
}

// EL SUELO DEL PASEO. La animación se hizo con su propio suelo, que no es el del tablero: andando,
// las pezuñas se hunden en la madera entre cuatro y nueve centímetros, y además esa cantidad cambia
// a lo largo del ciclo, así que el caballo va bamboleándose dentro del tablero. Se mide de antemano
// cuánto baja la pezuña más baja en cada punto del paseo y luego se le sube al caballo justo eso en
// cada fotograma: deja de hundirse y deja de bambolearse, que es lo que hace un caballo de verdad
// —siempre tiene alguna pezuña en el suelo, y el suelo no se mueve.
function measureGround(horse, legs) {
  const test = spawnPiece(horse);
  test.placeAt({ x: 0, z: 0 });
  test.face(0);
  const walk = test.play('walk', { fade: 0 });
  if (!walk) return null;
  walk.paused = true;
  const duration = walk.getClip().duration;
  const base = test.figure.getWorldPosition(new THREE.Vector3()).y;
  const suelo = [];
  for (let i = 0; i < GROUND_SAMPLES; i++) {
    walk.time = (i / GROUND_SAMPLES) * duration;
    test.update(0);
    test.object.updateMatrixWorld(true);
    const soles = Object.values(hoofSoles(test, legs)).map((hoof) => hoof.sole);
    suelo.push(Math.min(...soles) - base);
  }
  return suelo;
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
function measureMount(horse, spec, hip, pedestalHeight, radius) {
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
  const still = measureStill(horse, legs, radius);
  const ground = measureGround(horse, legs);

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
    ground,
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
  const radius = Math.max(footprint.max.x - footprint.min.x, footprint.max.z - footprint.min.z) / 2;

  return {
    spec,
    rider,
    horse,
    pedestal,
    pedestalHeight,
    hipHeight: hip.y,
    ankleHeight: hip.ankleHeight,
    radius,
    mount: horse ? measureMount(horse, spec, hip, pedestalHeight, radius) : null,
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
  // Y de ahí parte el seguimiento del suelo mientras anda, que sube o baja al caballo un poco más
  // en cada fotograma del paseo.
  if (horse) for (const child of horse.figure.children) child.userData.restY = child.position.y;
  let followGround = false; // lo encienden el paseo y la carga; lo apaga pararse
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
  hitbox.userData.noPick = true; // referencia del centro, no zona de toque
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
    // Andando, el caballo se sube lo que haga falta para que la pezuña más baja pise el tablero en
    // vez de hundirse en él. Parado no: entonces manda la postura de quieto, que ya viene aplomada.
    set followGround(value) {
      followGround = Boolean(value) && Boolean(mount?.ground);
      if (!horse) return;
      if (!followGround) for (const child of horse.figure.children) child.position.y = child.userData.restY;
    },
    get followGround() {
      return followGround;
    },
    update(dt) {
      if (resting) breathe(dt);
      horse?.update(dt);
      if (horse && followGround) {
        const sube = groundLift(mount.ground, horse.phase);
        for (const child of horse.figure.children) child.position.y = child.userData.restY + sube;
      }
      rider.update(dt);
      pennant?.update(dt);
    },
  };
}
