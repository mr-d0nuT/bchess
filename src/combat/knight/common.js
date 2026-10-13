import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { FRENA, twirl } from '../twirl.js';
import { roomClearance } from '../../moves/room.js';
import { findBone } from '../../pieces/bone-names.js';
import { ORBIT } from '../../scene/cinema.js';
import { BLADE_TOUCH, bodyGap, crossed, segmentDistance } from '../sword-contact.js';

// Lo que comparten las batallas del caballero (diseño en docs/superpowers/specs/
// 2026-09-15-bchess-caballero-design.md, sección 7).

export const KO_SECONDS = 1;
export const COMBAT_RAISE = 0.3; // como en el duelo: la lanza del peón, algo subida en la mano
export const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
export const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const TOPPLE_SECONDS = 0.45;
const SHOUT_SECONDS = 1.15; // lo que dura una onomatopeya: su estallido, su sacudida y su salida
export const WIND_UP = 0.45; // parte del camino hasta el golpe en la que se queda con el arma en alto

// La pieza con esqueleto que pelea: el peón, el jinete del caballero o el gigante de la torre.
export function fighterOf(entry) {
  if (entry.kind === 'knight') return entry.piece.rider;
  if (entry.kind === 'rook') return entry.piece.giant;
  return entry.piece;
}

// Puesto de un caballero o una torre para pedir sitio (`fight.js`): su luchador en `at`, mirando a
// `facing`, con las partes de lo que hará allí.
export function postOf(entry, at, facing, parts = []) {
  const { body } = entry.piece;
  return { entry, fans: body.fans, margin: body.margin, at, facing, parts };
}

// Hacia dónde mira quien está en `from` para ver `to` ({x, z}).
export const facingTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// A su derecha ({x, z}, unitario) quien mira hacia `facing`: el lado de la lanza y de la espada. La
// cámara del combate se pone de ese lado (`cinema.frame`, `favor`): desde el del escudo, el escudo tapaba
// el golpe.
export const rightOf = (facing) => ({ x: -Math.cos(facing), z: Math.sin(facing) });

// Claves de los golpes con espada de un luchador (con la punta de la espada medida). Con `thrust`, solo
// las estocadas (true) o solo los tajos (false).
export function bladeStrikes(fighter, { thrust } = {}) {
  return fighter.attacks
    .filter((attack) => fighter.strikes[attack.key]?.blade && (thrust === undefined || Boolean(attack.thrust) === thrust))
    .map((attack) => attack.key);
}

// Clave del ataque con el pie que más alcanza, o null.
export function kickOf(fighter) {
  let best = null;
  for (const { key } of fighter.attacks) {
    const body = fighter.strikes[key]?.body;
    if (body?.bone.includes('Toe') && (!best || body.reach > fighter.strikes[best].body.reach)) best = key;
  }
  return best;
}

// La punta de la espada como la cara de un golpe, para `punchDistance`: un solo rayo, por la punta.
export function bladeBody(blade) {
  return { reach: blade.reach, side: blade.side, height: blade.height, faces: [{ dx: 0, dy: 0, face: blade.reach }] };
}

// Dónde está ahora la punta de la espada de un luchador.
export function swordTip(fighter) {
  return fighter.props.sword.localToWorld(new THREE.Vector3(0, fighter.swordEnds.top, 0));
}

// Un hueso del luchador, esté donde esté su figura (a caballo cuelga de la del caballo, no de su
// pieza) y se llame como se llame en su esqueleto (`findBone` traduce a los nombres de Mixamo).
export function boneOf(fighter, name) {
  return findBone(fighter.figure, name) ?? findBone(fighter.object, name);
}

// Dónde está ahora un hueso.
export function bonePosition(fighter, name) {
  const bone = boneOf(fighter, name);
  if (!bone) throw new Error(`El luchador no tiene el hueso ${name}`);
  return bone.getWorldPosition(new THREE.Vector3());
}

// Al azar y con la misma probabilidad: desmonta o su caballo lo tira.
export function dismountMode(random) {
  return random() < 0.5 ? 'dismount' : 'thrown';
}

// Onomatopeya de cómic («¡CLANC!») sobre `anchor` (un objeto de la escena o un punto).
export function shout(bubbles, text, anchor) {
  const point = anchor.isVector3 ? anchor.clone() : null;
  return bubbles.say(text, point ? () => point : anchor, { seconds: SHOUT_SECONDS, shout: true, lift: 0.3 });
}

// LA PROVOCACIÓN. Antes de pelear, el que va a pegar se enfada (su clip de provocar)… o, si es un peón y le da por
// ahí, suelta la patada de Bruce Lee al aire con su «¡HIIIYAAA!» (lo pidió el usuario: «úsala alguna vez, que queda
// muy gracioso»; salió por un error, lanzando la bomba con ella). Devuelve qué ha hecho: 'kungfu', 'taunt' o null.
export const KUNG_FU_CHANCE = 0.35;
const KUNG_FU_CLIP = 'front_kick_01';
// Si esta vez toca patada (se echa a suertes una vez, antes, para decidir lo demás: el molinete, por ejemplo).
export function wantsKungFu(entry, random = Math.random) {
  return entry.kind === 'pawn' && Boolean(fighterOf(entry)?.hasClip?.('attack', KUNG_FU_CLIP)) && random() < KUNG_FU_CHANCE;
}
export async function taunt(entry, { bubbles = null, random = Math.random, kungfu = wantsKungFu(entry, random) } = {}) {
  const piece = fighterOf(entry);
  if (kungfu) {
    grita(entry, 'grito');
    if (bubbles && boneOf(piece, 'Head')) shout(bubbles, '¡HIIIYAAA!', bonePosition(piece, 'Head').setY(bonePosition(piece, 'Head').y + 0.35));
    await piece.playOnce('attack', { clip: KUNG_FU_CLIP, fade: 0.12 });
    piece.play('idle', { fade: 0.3 });
    return 'kungfu';
  }
  if (!piece.has('taunt')) return null;
  await piece.playOnce('taunt', { fade: 0.15 });
  return 'taunt';
}

// Empieza el golpe `key` y lo deja con el arma en alto, a WIND_UP del momento del golpe. Devuelve la
// acción, en pausa.
export async function windUp({ clock, fighter, key }) {
  const measure = fighter.strikes[key];
  const action = fighter.play('attack', { loop: false, fade: 0.15, clip: key });
  await clock.wait((measure.blade ?? measure.body ?? measure.spear).t * WIND_UP);
  if (action) action.paused = true;
  return action;
}

// Cae rígido como un tablón, girando sobre sus pies: de bruces (`forward`) o de espaldas, hacia donde
// mira la figura.
// Como `topple`, pero girando alrededor de un punto de la figura a `pivot` de altura sobre su origen
// (el tronco sin piernas, que se apoya en la cadera: girando por los pies, que ya no tiene, se
// hundiría en el tablero).
// `sound`: el golpe contra el suelo al acabar ('caida_armadura' para quien lleva armadura; null, ninguno).
export async function toppleAt({ clock, figure, pivot, forward = true, seconds = TOPPLE_SECONDS, sound = 'caida' }) {
  figure.rotation.order = 'YXZ';
  const start = figure.rotation.x;
  const end = forward ? Math.PI / 2 : -Math.PI / 2;
  const base = figure.position.clone();
  const punto = new THREE.Vector3(0, pivot, 0);
  const antes = punto.clone().applyEuler(figure.rotation);
  const giro = figure.rotation.clone();
  await clock.tween(seconds, (t) => {
    giro.x = start + (end - start) * t * t;
    figure.rotation.x = giro.x;
    const ahora = punto.clone().applyEuler(giro);
    figure.position.copy(base).add(antes).sub(ahora);
  });
  if (sound) sfx.play(sound);
}

export async function topple({ clock, figure, forward = true, seconds = TOPPLE_SECONDS, sound = 'caida' }) {
  figure.rotation.order = 'YXZ';
  const start = figure.rotation.x;
  const end = forward ? Math.PI / 2 : -Math.PI / 2;
  await clock.tween(seconds, (t) => {
    figure.rotation.x = start + (end - start) * t * t;
  });
  if (sound) sfx.play(sound);
}

// Cuerpo tendido en el suelo, para pedir sitio: de los pies (`at`) a la cabeza, hacia `angle`. El `length`
// que le pasan las batallas es el `height` del luchador, que en un peón incluye su peana: así pide un palmo
// de más, que es el lado seguro (pedir de menos dejaría a alguien encima del caído).
export function lyingBody({ at, angle, length, radius = 0.25 }) {
  return { from: { x: at.x, z: at.z }, to: { x: at.x + Math.sin(angle) * length, z: at.z + Math.cos(angle) * length }, radius };
}

// Hacia dónde cae un luchador tendido de `length` desde `at`: de `around` + `spread`, `around` - `spread`
// y `around`, la que deja más hueco a las piezas de alrededor (`overlap(body)`) sin caer sobre el rival
// (`rival`: { x, z, radius }).
export function fallDirection({ at, around, spread, length, rival, overlap }) {
  let best = null;
  for (const angle of [around + spread, around - spread, around]) {
    const body = lyingBody({ at, angle, length });
    if (rival && roomClearance(rival.x, rival.z, rival.radius, [body]) < 0) continue;
    const missing = overlap(body);
    if (!best || missing < best.missing - 1e-6) best = { angle, missing };
  }
  return best?.angle ?? around + spread;
}

// Estrellitas sobre la cabeza durante `seconds`.
export async function knockOut({ clock, fx, fighter, seconds = KO_SECONDS }) {
  sfx.play('mareo');
  fx.koStars(boneOf(fighter, 'Head') ?? fighter.figure, { seconds });
  await clock.wait(seconds);
}

// El ganador ocupa su casilla y lo celebra con la cámara encima: la sigue mientras va, se le pone
// delante en primer plano hasta que acaba de celebrar y, al terminar, vuelve a donde la tenía el
// usuario. Lo pidió el usuario: quería ver la celebración de cerca, de frente y de forma cinemática.
export async function victoryLap({ entry, clock, cinema, obstacles = [], move }) {
  const figure = () => entry.piece.figure.position;
  cinema.follow(figure);
  try {
    await move();
  } finally {
    cinema.follow(null);
  }
  await cinema.closeUp(clock, entry.piece, obstacles); // primer plano, de frente, del que ha ganado
  cinema.follow(figure, ORBIT); // y la cámara lo va rodeando mientras lo celebra
  sfx.play('jubilo'); // y el público lo jalea
  try {
    await celebrate(entry, clock);
  } finally {
    cinema.follow(null);
    await cinema.restore(clock);
  }
}

// Celebra la victoria: su animación o, si no la tiene, unos saltitos. Quien lleva lanza la hace
// girar antes, frenando hasta dejarla quieta y erguida.
//
// Lo de erguirla no es un adorno: con la lanza pegada a la mano, la animación de victoria la deja
// apuntando AL SUELO. El clip levanta el brazo girando la muñeca, y el palo se va con ella; un
// vencedor enseñando el regatón al cielo y la punta a sus propios pies no celebra nada.
//
// Y la alza cogida por abajo, cerca del regatón (`RAISED_GRIP`): la animación sube el puño por encima de la
// cabeza, y con la lanza cogida por el medio, el trozo que quedaba por debajo de la mano le pasaba por la
// cara (lo vio el usuario). Así queda entera por encima del puño, que es como se alza una lanza. El peón,
// que la lleva siempre por en medio (`holdsSpearMiddle`, lo pidió el usuario), la alza inclinada: la punta
// por encima de la cabeza y el regatón por fuera del hombro (`'raised'`).
const RAISED_GRIP = -0.42;

// `shout`: si lo grita (en el jaque mate lo celebran todas a la vez, y gritan solo unas pocas).
export async function celebrate(entry, clock, { shout = true } = {}) {
  if (shout) grita(entry, 'victoria'); // ¡yahoo!, ¡woohoo!… o, las negras, una risa de villano
  const fighter = fighterOf(entry);
  const lanza = Boolean(fighter.props?.spear);
  if (lanza) {
    fighter.setSpearPose('upright');
    if (clock) await twirl(fighter, { clock, turns: 2, seconds: 0.6, ease: FRENA });
    fighter.setGripSlide?.(RAISED_GRIP);
    // Y si la animación lo dobla, la lanza se inclina con él.
    fighter.setSpearPose(fighter.holdsSpearMiddle ? 'raised' : 'body');
  }
  const victory = entry.kind === 'knight' && entry.piece.mounted && fighter.has('victoryMounted') ? 'victoryMounted' : 'victory';
  if (fighter.has(victory)) {
    await fighter.playOnce(victory);
    fighter.play(victory === 'victoryMounted' && fighter.has('idleMounted') ? 'idleMounted' : 'idle', { fade: 0.3 });
  } else if (entry.mover.hop) {
    await entry.mover.hop(2);
  }
  if (lanza) {
    fighter.setSpearPose(null);
    fighter.setGripSlide?.(0);
  }
}

// ---- El tajo, apuntado: lo comparten el duelo de caballeros y el caballero que come peón ----
const STEP_SECONDS = 0.35; // el paso con el que se coloca para cada corte
const WALK_FROM = 0.25; // a partir de esta distancia, el paso es andando; por debajo, se arrima

// Dónde pasa la punta de la espada, bajando, por la altura `y`: { t, x, z } en el sistema de la figura
// (mirando hacia +Z). Si la bajada no llega tan abajo, su punto más bajo.
export function downswingAt(path, y) {
  let top = 0;
  for (let i = 1; i < path.length; i++) if (path[i].y > path[top].y) top = i;
  let low = top;
  for (let i = top + 1; i < path.length; i++) {
    if (path[i].y < path[low].y) low = i;
    else if (path[i].y > path[low].y + 0.05) break; // vuelve a subir: se acabó la bajada
  }
  for (let i = top + 1; i <= low; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.y >= y && b.y <= y) {
      const k = (a.y - y) / Math.max(1e-6, a.y - b.y);
      return { t: a.t + (b.t - a.t) * k, x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  return { t: path[low].t, x: path[low].x, z: path[low].z };
}

// La hoja de la espada de un luchador, ahora, en el mundo: [guarda, punta]. La guarda, a BLADE_FROM de lo que mide
// del puño a la punta (la cruz).
export function bladeOf(fighter) {
  const sword = fighter.props.sword;
  const top = fighter.swordEnds.top;
  return [sword.localToWorld(new THREE.Vector3(0, top * BLADE_FROM, 0)), sword.localToWorld(new THREE.Vector3(0, top, 0))];
}
const BLADE_FROM = 0.15;

// EL CUERPO, EN PIEZAS (para que la espada lo toque donde debe, `sword-contact.js`): la cabeza, el tronco, la cadera,
// los hombros, los brazos y las piernas, en cápsulas que van de hueso a hueso con su grueso (en alturas del
// luchador); y el escudo, si lo lleva a la vista, como una placa. Cada una dice de qué miembro es (`limb`). Un
// miembro cortado (su hueso encogido) se queda en una bola en el muñón.
const BODY = {
  head: { from: 0.05, to: 0.13, r: 0.075 }, // del hueso de la cabeza hacia arriba, el yelmo
  torso: 0.065,
  pelvis: { up: 0.07, r: 0.07 }, // de cadera a cadera, algo por encima de las articulaciones
  shoulder: 0.055,
  upperarm: 0.04,
  forearm: 0.035,
  thigh: 0.055,
  calf: 0.045,
  stump: 0.025, // lo que queda de un miembro cortado: su hueso encoge y la malla del brazo o la pierna se va con él
};
export function bodyParts(fighter) {
  const h = fighter.height;
  const parts = [];
  const at = (name) => boneOf(fighter, name)?.getWorldPosition(new THREE.Vector3()) ?? null;
  const cut = (name) => (boneOf(fighter, name)?.scale.x ?? 1) < 0.01;
  const capsule = (limb, a, b, r) => {
    if (a && b) parts.push({ limb, a, b, r: r * h });
  };
  const head = at('Head');
  const neck = at('Neck');
  const hips = at('Hips');
  if (head) {
    const up = neck ? head.clone().sub(neck).normalize() : new THREE.Vector3(0, 1, 0);
    if (up.y < 0.5) up.set(0, 1, 0);
    capsule('head', head.clone().addScaledVector(up, BODY.head.from * h), head.clone().addScaledVector(up, BODY.head.to * h), BODY.head.r);
  }
  capsule('torso', hips, neck ?? head, BODY.torso);
  const thighs = ['L', 'R'].map((side) => at(`${side}_Thigh`));
  if (thighs[0] && thighs[1]) {
    const up = new THREE.Vector3(0, BODY.pelvis.up * h, 0);
    capsule('pelvis', thighs[0].clone().add(up), thighs[1].clone().add(up), BODY.pelvis.r);
  }
  for (const side of ['L', 'R']) {
    const arm = `${side}_arm`;
    const shoulder = at(`${side}_Upperarm`);
    if (cut(`${side}_Upperarm`)) capsule(arm, shoulder, shoulder, BODY.stump);
    else {
      capsule(arm, shoulder, shoulder, BODY.shoulder);
      capsule(arm, shoulder, at(`${side}_Forearm`), BODY.upperarm);
      capsule(arm, at(`${side}_Forearm`), at(`${side}_Hand`), BODY.forearm);
    }
    const leg = `${side}_leg`;
    const hip = at(`${side}_Thigh`);
    if (cut(`${side}_Thigh`)) capsule(leg, hip, hip, BODY.stump);
    else {
      capsule(leg, hip, at(`${side}_Calf`), BODY.thigh);
      capsule(leg, at(`${side}_Calf`), at(`${side}_Foot`), BODY.calf);
    }
  }
  const shield = fighter.props?.shield;
  if (shield?.visible && shield.parent) parts.push(shieldPlate(shield));
  return parts;
}

// El escudo como una placa: su caja (en su propio sistema), con el lado más fino de grueso.
function shieldPlate(shield) {
  shield.updateWorldMatrix(true, true);
  const inverse = shield.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const local = new THREE.Matrix4();
  shield.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    local.multiplyMatrices(inverse, o.matrixWorld);
    box.union(o.geometry.boundingBox.clone().applyMatrix4(local));
  });
  const size = box.getSize(new THREE.Vector3());
  const e = shield.matrixWorld.elements;
  const axes = [new THREE.Vector3(e[0], e[1], e[2]), new THREE.Vector3(e[4], e[5], e[6]), new THREE.Vector3(e[8], e[9], e[10])];
  const half = [size.x, size.y, size.z].map((x, k) => (x * axes[k].length()) / 2);
  const [n, u, v] = [0, 1, 2].sort((a, b) => half[a] - half[b]);
  return {
    limb: 'shield',
    c: box.getCenter(new THREE.Vector3()).applyMatrix4(shield.matrixWorld),
    u: axes[u].clone().normalize(),
    v: axes[v].clone().normalize(),
    hu: half[u],
    hv: half[v],
    r: half[n],
  };
}

// Espera a que la hoja toque y dice dónde. Cada fotograma mide `measure()` → { gap, point, crossed }: lo que le
// falta para tocar (negativo, ya dentro), dónde, y si se ha cruzado con otra hoja desde el anterior. El reloj corre
// ANTES de que las piezas pongan la postura del fotograma, así que lo que se mide es el anterior, y lo que se haga al
// resolverse se ve uno después: sale ya si, a lo que se acerca por fotograma, le falta menos de AHEAD fotogramas (al
// bajar, la hoja acelera; esperando a uno, la congelación del golpe la pillaba ya pasada al otro lado). Si, pasado
// `after`, la hoja pasa de largo sin llegar a tocar, sale en lo más cerca; y como mucho espera `seconds`.
const NEAR = 0.15;
const AHEAD = 1.5;
export function untilTouch(clock, measure, { seconds, after = 0 }) {
  const start = clock.now;
  return new Promise((resolve) => {
    let done = false;
    let before = null;
    clock.tween(seconds, (k) => {
      if (done) return;
      const now = measure();
      const closing = before ? before.gap - now.gap : 0; // lo que se ha acercado en un fotograma
      let point = null;
      if (now.gap <= 0 || now.crossed) point = now.point;
      else if (closing > 0 && now.gap <= closing * AHEAD) point = now.point.clone().lerp(before.point, -now.gap / closing);
      else if (before && clock.now - start >= after && closing < 0 && before.gap < NEAR) point = before.point;
      else if (k >= 1) point = now.point;
      before = now;
      if (!point) return;
      done = true;
      resolve(point);
    });
  });
}

// Lo que mide `untilTouch` cuando chocan dos espadas: lo que les falta a las hojas para tocarse y el punto de en
// medio; y si se han cruzado entre dos fotogramas (cambia el lado por el que pasa una de la otra).
export function bladesMeet(mine, his) {
  let before = null;
  return () => {
    const [g1, p1] = bladeOf(mine);
    const [g2, p2] = bladeOf(his);
    const d = segmentDistance(g1, p1, g2, p2);
    const through = crossed(before, d);
    before = d;
    return { gap: d.distance - BLADE_TOUCH, crossed: through, point: new THREE.Vector3((d.a.x + d.b.x) / 2, (d.a.y + d.b.y) / 2, (d.a.z + d.b.z) / 2) };
  };
}

// Lo que mide `untilTouch` cuando la espada de `mine` va a por el cuerpo de `his`: lo que le falta a la hoja para
// tocar la pieza más cercana y el punto de la hoja que la toca.
export function bladeIntoBody(mine, his) {
  return () => {
    const [g, p] = bladeOf(mine);
    const touch = bodyGap(g, p, bodyParts(his));
    return { gap: touch.gap, crossed: false, point: new THREE.Vector3(touch.point.x, touch.point.y, touch.point.z) };
  };
}

// Espera a que la punta de la espada, bajando, pase por la altura `y` (del mundo), y como mucho `seconds`.
// La bajada del tajo es tan rápida (unos 5 m/s) que un fotograma de más o de menos son un palmo: por eso
// el corte no se fía del cronómetro, sino de dónde está la punta.
export function tipBelow(clock, fighter, y, seconds) {
  return new Promise((resolve) => {
    let done = false;
    clock.tween(seconds, (k) => {
      if (done) return;
      if (swordTip(fighter).y <= y || k >= 1) {
        done = true;
        resolve();
      }
    });
  });
}

// Dónde ha de ponerse quien mira hacia `facing` para que la punta de su espada, en `tip` (en su sistema),
// caiga en `target`.
export function standFor(target, tip, facing) {
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  return { x: target.x - (tip.x * c + tip.z * sn), z: target.z - (-tip.x * sn + tip.z * c) };
}

// Un paso hasta `to` ({x, z}) sin perder de vista al rival: si es corto, se arrima; si no, se gira, anda y
// vuelve a encararlo.
// `keepPose`: sin andar (se arrima con la espada en alto, tal como la tiene).
export async function stepTo(clock, fighter, to, facing, { keepPose = false } = {}) {
  const figure = fighter.figure;
  const from = { x: figure.position.x, z: figure.position.z };
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  // Y se va girando por el camino (por el lado corto) hasta mirar hacia `facing`, en vez de girarse de golpe al llegar.
  const start = figure.rotation.y;
  const turn = Math.atan2(Math.sin(facing - start), Math.cos(facing - start));
  if (d < 0.02 && Math.abs(turn) < 0.02) {
    figure.rotation.y = facing;
    return;
  }
  const walking = !keepPose && d > WALK_FROM;
  if (walking) fighter.play('walk', { fade: 0.12 });
  await clock.tween(STEP_SECONDS + (walking ? d * 0.6 : 0), (k) => {
    const e = k * k * (3 - 2 * k);
    figure.position.x = from.x + (to.x - from.x) * e;
    figure.position.z = from.z + (to.z - from.z) * e;
    figure.rotation.y = start + turn * e;
  });
  figure.rotation.y = facing;
  if (walking) fighter.play('idle', { fade: 0.15 });
}

// Un paso hasta `to` ({x, z}) rodeando a quien está en `center`: en línea recta, para pasar a su otro costado lo
// atravesaría. La distancia y el ángulo alrededor de él van a la vez de lo que eran a lo que tienen que ser; por el
// camino se va girando hacia donde anda, y al llegar mira hacia `facing`. Si es poco, un paso normal (`stepTo`).
const CIRCLE_FROM = 0.4; // a partir de este rodeo (en arco), se rodea
export async function circleTo(clock, fighter, center, to, facing) {
  const figure = fighter.figure;
  const r0 = Math.hypot(figure.position.x - center.x, figure.position.z - center.z);
  const r1 = Math.hypot(to.x - center.x, to.z - center.z);
  const b0 = Math.atan2(figure.position.x - center.x, figure.position.z - center.z);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  const turnAround = wrap(Math.atan2(to.x - center.x, to.z - center.z) - b0); // lo que lo rodea, por el lado corto
  const length = Math.abs(turnAround) * ((r0 + r1) / 2) + Math.abs(r1 - r0);
  if (length < CIRCLE_FROM) return stepTo(clock, fighter, to, facing);
  const yaw0 = wrap(figure.rotation.y - (b0 + Math.PI)); // lo que no mira al centro, al salir…
  const yaw1 = wrap(facing - (b0 + turnAround + Math.PI)); // …y al llegar
  const ahead = -Math.sign(turnAround) * (Math.PI / 2); // hacia donde anda, respecto a mirar al centro
  fighter.play('walk', { fade: 0.12 });
  await clock.tween(STEP_SECONDS + length * 0.6, (k) => {
    const e = k * k * (3 - 2 * k);
    const b = b0 + turnAround * e;
    const r = r0 + (r1 - r0) * e;
    figure.position.x = center.x + Math.sin(b) * r;
    figure.position.z = center.z + Math.cos(b) * r;
    const walking = Math.min(1, k / 0.25, (1 - k) / 0.25);
    figure.rotation.y = b + Math.PI + yaw0 + (yaw1 - yaw0) * e + ahead * walking;
  });
  figure.rotation.y = facing;
  fighter.play('idle', { fade: 0.15 });
}

// EL TAJO, ENSAYADO. Por dónde pasa de verdad la punta de la espada de `fighter` en el golpe `clip` ({ t, x,
// y, z }, en su sistema: desde sus pies y mirando hacia +Z; y su guarda, { gx, gy, gz }, para tener la hoja
// entera), ensayado sin que se vea ni se oiga: se juega entero en la pieza de verdad entre dos fotogramas
// (sin pintar y sin su voz), se apunta la hoja en cada paso y se vuelve a como estaba. La medida de
// `strikes.js` es con una pieza de prueba y no coincide del todo con la de la partida: en el casco del peón,
// el tajo caía un palmo corto.
// `from`: desde qué segundo del clip (como `playOnce`), para ensayarlo como se jugará. `raise`: antes, lo que tarda en
// levantar el arma desde el reposo, fundiendo a la postura de `from` quieta (los tajos del duelo de caballeros); esas
// muestras van con su tiempo antes de `from`.
export function rehearseBlade(fighter, clip, { fade = 0.15, fps = 60, from = 0, raise = 0 } = {}) {
  const voz = fighter.onPlay;
  fighter.onPlay = null;
  try {
    const action = fighter.play('attack', { loop: false, fade: raise || fade, clip });
    if (!action) return null;
    if (from > 0) action.time = from;
    action.paused = raise > 0;
    const at = fighter.figure.getWorldPosition(new THREE.Vector3());
    const f = fighter.figure.rotation.y;
    const c = Math.cos(f);
    const sn = Math.sin(f);
    const frames = Math.ceil((raise + action.getClip().duration - from) * fps);
    const path = [];
    for (let i = 0; i <= frames; i++) {
      if (action.paused && i / fps >= raise) action.paused = false;
      fighter.update(i ? 1 / fps : 0);
      fighter.object.updateMatrixWorld(true);
      const [guard, tip] = bladeOf(fighter);
      const dx = tip.x - at.x;
      const dz = tip.z - at.z;
      const gx = guard.x - at.x;
      const gz = guard.z - at.z;
      path.push({
        t: action.paused ? from - raise + i / fps : action.time, x: dx * c - dz * sn, y: tip.y - at.y, z: dx * sn + dz * c,
        gx: gx * c - gz * sn, gy: guard.y - at.y, gz: gx * sn + gz * c,
      });
    }
    return path;
  } finally {
    fighter.play('idle', { fade: 0 });
    fighter.update(0);
    fighter.onPlay = voz;
  }
}
