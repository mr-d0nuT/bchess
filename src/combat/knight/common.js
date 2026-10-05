import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { FRENA, twirl } from '../twirl.js';
import { roomClearance } from '../../moves/room.js';
import { findBone } from '../../pieces/bone-names.js';
import { ORBIT } from '../../scene/cinema.js';

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
// cara (lo vio el usuario). Así queda entera por encima del puño, que es como se alza una lanza.
const RAISED_GRIP = -0.42;

export async function celebrate(entry, clock) {
  grita(entry, 'victoria'); // ¡yahoo!, ¡woohoo!… o, las negras, una risa de villano
  const fighter = fighterOf(entry);
  const lanza = Boolean(fighter.props?.spear);
  if (lanza) {
    fighter.setSpearPose('upright');
    if (clock) await twirl(fighter, { clock, turns: 2, seconds: 0.6, ease: FRENA });
    fighter.setGripSlide?.(RAISED_GRIP);
    fighter.setSpearPose('body'); // y si la animación lo dobla, la lanza se inclina con él
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

// Por dónde pasa DE VERDAD la punta de la espada de `fighter` durante `seconds` ({ t, x, y, z }, en su
// sistema: desde sus pies y mirando hacia +Z). La medida de `strikes.js` se hace con una pieza de prueba,
// sin lo que se le hace al jinete en la partida (el torso erguido), y los cortes fallaban por un palmo.
// Ojo: el reloj mueve sus transiciones ANTES de que las piezas pongan la postura del fotograma, así que
// lo que se ve en cada paso es la postura del momento anterior.
export function recordTip(clock, fighter, seconds) {
  const path = [];
  const figure = fighter.figure;
  const at = new THREE.Vector3();
  let before = 0;
  return clock.tween(seconds, (k) => {
    const tip = swordTip(fighter);
    figure.getWorldPosition(at);
    const dx = tip.x - at.x;
    const dz = tip.z - at.z;
    const c = Math.cos(figure.rotation.y);
    const sn = Math.sin(figure.rotation.y);
    path.push({ t: before, x: dx * c - dz * sn, y: tip.y - at.y, z: dx * sn + dz * c });
    before = k * seconds;
  }).then(() => path);
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
export async function stepTo(clock, fighter, to, facing) {
  const figure = fighter.figure;
  const from = { x: figure.position.x, z: figure.position.z };
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  if (d < 0.02) return;
  const walking = d > WALK_FROM;
  if (walking) fighter.play('walk', { fade: 0.12 });
  await clock.tween(STEP_SECONDS + (walking ? d * 0.6 : 0), (k) => {
    const e = k * k * (3 - 2 * k);
    figure.position.x = from.x + (to.x - from.x) * e;
    figure.position.z = from.z + (to.z - from.z) * e;
  });
  figure.rotation.y = facing;
  if (walking) fighter.play('idle', { fade: 0.15 });
}

// EL TAJO, ENSAYADO. Por dónde pasa de verdad la punta de la espada de `fighter` en el golpe `clip` ({ t, x,
// y, z }, en su sistema: desde sus pies y mirando hacia +Z), ensayado sin que se vea ni se oiga: se juega
// entero en la pieza de verdad entre dos fotogramas (sin pintar y sin su voz), se apunta la punta en cada
// paso y se vuelve a como estaba. La medida de `strikes.js` es con una pieza de prueba y no coincide del
// todo con la de la partida: en el casco del peón, el tajo caía un palmo corto.
export function rehearseBlade(fighter, clip, { fade = 0.15, fps = 60 } = {}) {
  const voz = fighter.onPlay;
  fighter.onPlay = null;
  try {
    const action = fighter.play('attack', { loop: false, fade, clip });
    if (!action) return null;
    const at = fighter.figure.getWorldPosition(new THREE.Vector3());
    const f = fighter.figure.rotation.y;
    const c = Math.cos(f);
    const sn = Math.sin(f);
    const frames = Math.ceil(action.getClip().duration * fps);
    const path = [];
    for (let i = 0; i <= frames; i++) {
      fighter.update(i ? 1 / fps : 0);
      fighter.object.updateMatrixWorld(true);
      const tip = swordTip(fighter);
      const dx = tip.x - at.x;
      const dz = tip.z - at.z;
      path.push({ t: action.time, x: dx * c - dz * sn, y: tip.y - at.y, z: dx * sn + dz * c });
    }
    return path;
  } finally {
    fighter.play('idle', { fade: 0 });
    fighter.update(0);
    fighter.onPlay = voz;
  }
}
