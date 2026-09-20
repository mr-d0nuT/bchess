import * as THREE from 'three';
import { roomClearance } from '../../moves/room.js';

// Lo que comparten las batallas del caballero (diseño en docs/superpowers/specs/
// 2026-09-15-bchess-caballero-design.md, sección 7).

export const KO_SECONDS = 1;
export const COMBAT_RAISE = 0.3; // como en el duelo: la lanza del peón, algo subida en la mano
export const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
export const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const TOPPLE_SECONDS = 0.45;
const SHOUT_SECONDS = 0.8;
const WIND_UP = 0.45; // parte del camino hasta el golpe en la que se queda con el arma en alto

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

// Dónde está ahora un hueso.
export function bonePosition(fighter, name) {
  return fighter.object.getObjectByName(name).getWorldPosition(new THREE.Vector3());
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

// Empieza el golpe `key` y lo deja con el arma en alto, a WIND_UP del momento del golpe. Devuelve la
// acción, en pausa.
export async function windUp({ clock, fighter, key }) {
  const measure = fighter.strikes[key];
  const action = fighter.play('attack', { loop: false, fade: 0.15, clip: key });
  await clock.wait((measure.blade ?? measure.body).t * WIND_UP);
  if (action) action.paused = true;
  return action;
}

// Cae rígido como un tablón, girando sobre sus pies: de bruces (`forward`) o de espaldas, hacia donde
// mira la figura.
export async function topple({ clock, figure, forward = true, seconds = TOPPLE_SECONDS }) {
  figure.rotation.order = 'YXZ';
  const start = figure.rotation.x;
  const end = forward ? Math.PI / 2 : -Math.PI / 2;
  await clock.tween(seconds, (t) => {
    figure.rotation.x = start + (end - start) * t * t;
  });
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
  fx.koStars(fighter.object.getObjectByName('Head') ?? fighter.figure, { seconds });
  await clock.wait(seconds);
}

// Celebra la victoria: su animación o, si no la tiene, unos saltitos.
export async function celebrate(entry) {
  const fighter = fighterOf(entry);
  if (fighter.has('victory')) {
    await fighter.playOnce('victory');
    fighter.play('idle', { fade: 0.3 });
  } else if (entry.mover.hop) {
    await entry.mover.hop(2);
  }
}
