import * as THREE from 'three';
import { gripSlideForReach } from './plan.js';
import { skinnedMeshes } from './strikes.js';
import { FAN_SECTORS, fanReach, joinReach } from '../moves/room.js';

// Lo que comparten las capturas con gag (las de la torre y las del caballero): cámara lenta con
// congelado de impacto; sitio en abanico para lo que hará cada luchador en su puesto; y rayos que
// buscan la malla del rival, para que los golpes lo toquen sin atravesarlo.
//
// Un luchador (`fighter`) es una pieza con esqueleto de `spawnPiece`: el peón, el gigante de una torre
// o el jinete de un caballero. Un puesto (`post`) es { entry, fans, margin, at, facing, parts }: la
// pieza del tablero, los abanicos medidos de su luchador (`measureBody`), dónde está y hacia dónde
// mira, y las partes ({ action, key, seconds }) de lo que hará allí.

export const HIT_STOP = 0.1; // segundos reales congelados en el impacto
export const SLOW_MOTION = 0.3;
export const SLOW_BEFORE = 0.35; // segundos de juego antes del impacto, ya a cámara lenta
export const SLOW_AFTER = 0.45;
export const KNOCKBACK = 0.2; // lo que sale despedido el vencido
const IDLE_SECONDS = 4; // lo más que dura seguido el reposo de un luchador en una captura
const FADE_SECONDS = 0.25; // fundido de una acción con la siguiente
const FIST_BITE = 0.03; // lo que se hunde en el rival la cara del puño o del pie
const SPEAR_BITE = 0.03; // lo que se hunde la punta de la lanza
const FRONT_ANGLE = Math.PI / 6; // a cada lado de la dirección del rival, lo que cuenta como delante
const RAY_FAR = 3; // desde dónde se lanzan los rayos que buscan la superficie del rival
const UP = new THREE.Vector3(0, 1, 0);

// Copia de `list` en orden aleatorio.
export function shuffled(list, random) {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Abanico con el que pide sitio un luchador en su puesto: lo que alcanza en reposo y en cada parte de
// lo que hará allí.
export function stanceOf({ fans, at, facing, parts }) {
  const reaches = Object.values(fans.idle ?? {}).map((fan) => fanReach(fan.profile, IDLE_SECONDS));
  for (const { action, key, seconds } of parts) {
    const fan = fans[action]?.[key];
    if (fan) reaches.push(fanReach(fan.profile, seconds ?? fan.seconds + FADE_SECONDS));
  }
  return { at: { x: at.x, z: at.z }, facing, reach: joinReach(reaches) };
}

// Hueco que les faltaría a las piezas de alrededor, salvo `owners`, con los luchadores en sus puestos.
export function overlapOf(crowd, owners, posts) {
  return crowd.overlap({
    owners,
    bodies: posts.map((post) => ({ ...stanceOf(post), margin: post.margin })),
  });
}

// Lo que se adelanta un luchador hacia su rival, que tiene delante, en los primeros `seconds` de una
// versión de `action`.
export function towardRival(fans, action, key, seconds) {
  const reach = fanReach(fans[action][key].profile, seconds);
  return Math.max(0, ...reach.filter((_, k) => Math.abs(-Math.PI + ((k + 0.5) * 2 * Math.PI) / FAN_SECTORS) < FRONT_ANGLE));
}

// Añade a un puesto la versión de `action` que menos hueco quita (`overlap()`), probándolas en orden
// aleatorio; a igual hueco, la de menor `cost`. Devuelve su clave. Si es `optional`, solo la añade si
// no quita más hueco que no hacerla; si no añade ninguna, devuelve null.
export function choose(post, action, { overlap, random, seconds, optional = false, cost = () => 0 }) {
  const without = optional ? overlap() : Infinity;
  let best = null;
  for (const key of shuffled(Object.keys(post.fans[action] ?? {}), random)) {
    post.parts.push({ action, key, seconds });
    const missing = overlap();
    post.parts.pop();
    if (missing > without + 1e-6) continue;
    const extra = cost(key);
    if (!best || missing < best.missing - 1e-6 || (missing <= best.missing + 1e-6 && extra < best.extra - 1e-6)) {
      best = { key, missing, extra };
    }
  }
  if (best) post.parts.push({ action, key: best.key, seconds });
  return best?.key ?? null;
}

// Lo que puede recibir un golpe: las mallas con esqueleto del luchador y, si lo lleva, su escudo.
export function targetsOf(fighter) {
  const meshes = skinnedMeshes(fighter.object);
  fighter.props?.shield?.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

// Llama a `measure` con el luchador como estará al recibir el golpe, plantado en el tablero y mirando a
// `facing` (con `rest`, además, en reposo), y lo deja como estaba.
export function standing(fighter, facing, measure, { rest = false } = {}) {
  const { figure } = fighter;
  const { y } = figure.position;
  const turn = figure.rotation.y;
  figure.position.y = 0;
  figure.rotation.y = facing;
  if (rest) {
    fighter.play('idle', { fade: 0 });
    fighter.update(0);
  }
  try {
    return measure();
  } finally {
    figure.position.y = y;
    figure.rotation.y = turn;
    fighter.object.updateMatrixWorld(true);
  }
}

// Distancia entre los centros a la que la cara del golpe toca al rival (`target`), plantado en `center`
// y mirando hacia `from`, y se hunde FIST_BITE. `body` trae dónde está la mano, el pie o la punta en lo
// más largo del golpe y hasta dónde llega su malla en unas líneas paralelas a la del golpe (`faces`);
// cada línea sigue hasta el rival, y manda la que antes lo toca. Si ninguna lo toca, cuenta con su
// pecho (`torso`).
export function punchDistance({ body, from, center, target, torso, rest = false }) {
  if (!body.faces) return body.reach + torso - FIST_BITE;
  const length = Math.hypot(center.x - from.x, center.z - from.z);
  const forward = new THREE.Vector3((center.x - from.x) / length, 0, (center.z - from.z) / length);
  const facing = Math.atan2(forward.x, forward.z);
  const side = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const contact = standing(target, facing + Math.PI, () => {
    const targets = targetsOf(target);
    let first = null;
    for (const { dx, dy, face } of body.faces) {
      if (face === null) continue;
      const origin = new THREE.Vector3(center.x, body.height + dy, center.z)
        .addScaledVector(forward, -RAY_FAR)
        .addScaledVector(side, body.side + dx);
      // El rayo atraviesa al rival entero: por un hueco, lo primero que toca puede estar tras su centro.
      const hit = new THREE.Raycaster(origin, forward, 0, 2 * RAY_FAR).intersectObjects(targets, false)[0];
      if (hit) first = Math.max(first ?? -Infinity, face + RAY_FAR - hit.distance);
    }
    return first;
  }, { rest });
  return (contact ?? (body.faces[0].face ?? body.reach) + torso) - FIST_BITE;
}

// Golpe con mano o pie y a qué distancia del rival se para quien lo da. Prueba los golpes (`attacks`,
// con sus medidas en `strikes`) del que más alcanza al que menos y se queda con el primero con el que
// no tiene que retroceder desde `from`; si con todos tendría que retroceder, con el que menos. Nunca se
// pone a menos de `closest`. Cada prueba lanza rayos contra la malla del rival, así que casi siempre
// basta con una.
export function planPunch({ attacks, strikes, from, center, target, torso, closest, rest = false }) {
  const length = Math.hypot(center.x - from.x, center.z - from.z);
  const byReach = attacks
    .map(({ key }) => ({ key, body: strikes[key]?.body }))
    .filter(({ body }) => body)
    .sort((a, b) => b.body.reach - a.body.reach);
  let shortest = null;
  for (const { key, body } of byReach) {
    const distance = Math.max(closest, punchDistance({ body, from, center, target, torso, rest }));
    if (distance <= length + 1e-6) return { key, distance };
    if (!shortest || distance < shortest.distance) shortest = { key, distance };
  }
  return shortest;
}

// Llama a `measure` con la pieza como estará dentro de `seconds` de juego si sigue en reposo, y la deja
// como estaba. `idle` es su acción de reposo, que ya se ve del todo.
export function poseAhead(piece, idle, seconds, measure) {
  if (!idle) return measure();
  const now = idle.time;
  idle.time = (now + seconds) % idle.getClip().duration;
  piece.update(0);
  try {
    return measure();
  } finally {
    idle.time = now;
    piece.update(0);
  }
}

// Cuánto debe resbalar la lanza para que, en lo más hondo de la estocada, la punta se hunda SPEAR_BITE
// en el rival (`target`). Un rayo sigue la línea de la punta en ese momento (`spear`, medida con la
// pieza de prueba) desde la mano de quien la lleva, colocado en `spot` y mirando a `facing`. Si no toca
// la malla, la punta se queda en el pecho medido (`torso`).
export function gripSlideToTarget({ spear, spot, facing, distance, target, torso }) {
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, facing);
  const axis = new THREE.Vector3(...spear.axis).applyQuaternion(turn);
  const tip = new THREE.Vector3(spear.side, spear.height, spear.reach).applyQuaternion(turn).add(new THREE.Vector3(spot.x, 0, spot.z));
  const back = spear.reach; // el rayo sale de la altura de la mano
  const hit = new THREE.Raycaster(tip.clone().addScaledVector(axis, -back), axis, 0, back + 1).intersectObjects(targetsOf(target), false)[0];
  if (!hit) return gripSlideForReach({ reach: spear.reach, distance, torso });
  return Math.max(0, back - hit.distance - SPEAR_BITE);
}

// Cámara lenta hasta un impacto que llega a los `seconds` de juego; se resuelve en el impacto.
export async function slowToImpact(clock, seconds) {
  await clock.wait(Math.max(0, seconds - SLOW_BEFORE));
  clock.timeScale = SLOW_MOTION;
  await clock.wait(Math.min(SLOW_BEFORE, seconds));
}

// Tras el impacto: congelado, algo más de cámara lenta y vuelta a la velocidad normal.
export async function afterImpact(clock) {
  await clock.hold(HIT_STOP);
  await clock.wait(SLOW_AFTER);
  clock.timeScale = 1;
}

// El vencido sale despedido `distance` en la dirección (ux, uz), frenando.
export function knockBack({ clock, figure, ux, uz, distance = KNOCKBACK }) {
  const start = figure.position.clone();
  return clock.tween(0.3, (t) => {
    const k = 1 - (1 - t) ** 2;
    figure.position.set(start.x + ux * distance * k, start.y, start.z + uz * distance * k);
  });
}
