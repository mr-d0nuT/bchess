import * as THREE from 'three';
import { TORSO, bestStrike, fightSpots, gripSlideForReach, strikeSpot, usableStrikes } from './plan.js';
import { skinnedMeshes } from './strikes.js';
import { FAN_SECTORS, fanReach, joinReach } from '../moves/room.js';
import { CRUMBLE_SECONDS } from '../moves/rook-mover.js';

// Capturas cortas y brutales en las que participa una torre (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-torre-gigante-design.md, sección 7). Gana siempre el atacante. Antes de empezar
// se decide qué hará cada gigante en su puesto, eligiendo el derrumbe y la provocación que dejan más
// hueco a las piezas de alrededor; si provocar les quita sitio, no provoca. Mientras dura, cada
// gigante pide sitio con el abanico de lo que va a hacer; el atacante y el defensor no se apartan.

const HIT_STOP = 0.1; // segundos reales congelados en el impacto
const SLOW_MOTION = 0.3;
const SLOW_BEFORE = 0.35; // segundos de juego antes del impacto, ya a cámara lenta
const SLOW_AFTER = 0.45;
const KNOCKBACK = 0.2; // lo que sale despedido el peón
const KO_SECONDS = 1;
const COLLAPSE_SECONDS = 0.8; // del impacto a deshacerse en rocas
const RECOVER = 0.3; // lo que tarda en bajar el arma antes de volver a subir la lanza en la mano
const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const COMBAT_RAISE = 0.3; // como en el duelo: la lanza, algo subida en la mano
const GRIP_SETTLE = 0.35; // lo que tarda la lanza en resbalar en la mano antes de la estocada
const SPEAR_BITE = 0.03; // lo que se hunde la punta de la lanza en la piedra
const SPEAR_RECOIL = 0.12; // lo que rebota la lanza en la piedra tras el golpe
const FIST_BITE = 0.03; // lo que se hunde en el rival la cara del puño o del pie del gigante
const FIST_HALF = 0.02; // del hueso de la mano del gigante a la cara de abajo de su puño cerrado, medido
const SQUASH = 0.55; // lo que queda de alto el peón al que machaca un puñetazo de arriba abajo
const OVERHEAD_CHANCE = 0.5; // cada cuánto, si puede, machaca el cráneo en vez de pegar de frente
const FRONT_ANGLE = Math.PI / 6; // a cada lado de la dirección del rival, lo que cuenta como delante
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas
const IDLE_SECONDS = 4; // lo más que dura seguido el reposo de un gigante en una captura
const FADE_SECONDS = 0.25; // fundido de una acción con la siguiente
const RAY_FAR = 3; // desde dónde se lanzan los rayos que buscan la superficie del rival
const UP = new THREE.Vector3(0, 1, 0);

const giantOf = (entry) => (entry.kind === 'rook' ? entry.piece.giant : null);
const collapseOf = (giant) => (giant.has('defeat') ? 'defeat' : 'hit');
const spearTip = (piece) => piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0));

export function canSmash(attacker, defender) {
  const giant = giantOf(attacker);
  if (giant) {
    if (!bestStrike(giant.attacks, giant.strikes)) return false;
    return defender.kind === 'rook' ? Boolean(giantOf(defender)) : defender.piece.has('defeat') || defender.piece.has('fall');
  }
  return attacker.kind === 'pawn' && Boolean(giantOf(defender))
    && usableStrikes(attacker.piece.attacks, attacker.piece.strikes, 'duel').length > 0;
}

// Copia de `list` en orden aleatorio.
function shuffled(list, random) {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Abanico con el que pide sitio un gigante en su puesto (`post`: { entry, at, facing, parts }): lo
// que alcanza en reposo y en cada parte ({ action, key, seconds }) de lo que hará allí.
function stanceOf({ entry, at, facing, parts }) {
  const { fans } = entry.piece.body;
  const reaches = Object.values(fans.idle ?? {}).map((fan) => fanReach(fan.profile, IDLE_SECONDS));
  for (const { action, key, seconds } of parts) {
    const fan = fans[action]?.[key];
    if (fan) reaches.push(fanReach(fan.profile, seconds ?? fan.seconds + FADE_SECONDS));
  }
  return { at: { x: at.x, z: at.z }, facing, reach: joinReach(reaches) };
}

// Hueco que les faltaría a las piezas de alrededor con los gigantes en sus puestos.
function overlapOf(crowd, owners, posts) {
  return crowd.overlap({
    owners,
    bodies: posts.map((post) => ({ ...stanceOf(post), margin: post.entry.piece.body.margin })),
  });
}

// Lo que se adelanta un gigante hacia su rival, que tiene delante, en los primeros `seconds` de una
// versión de `action`.
function towardRival(entry, action, key, seconds) {
  const reach = fanReach(entry.piece.body.fans[action][key].profile, seconds);
  return Math.max(0, ...reach.filter((_, k) => Math.abs(-Math.PI + ((k + 0.5) * 2 * Math.PI) / FAN_SECTORS) < FRONT_ANGLE));
}

// Añade a un puesto la versión de `action` que menos hueco quita (`overlap()`), probándolas en orden
// aleatorio; a igual hueco, la de menor `cost`. Devuelve su clave. Si es `optional`, solo la añade si
// no quita más hueco que no hacerla; si no añade ninguna, devuelve null.
function choose(post, action, { overlap, random, seconds, optional = false, cost = () => 0 }) {
  const without = optional ? overlap() : Infinity;
  let best = null;
  for (const key of shuffled(Object.keys(post.entry.piece.body.fans[action] ?? {}), random)) {
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

// Derrumbe del gigante vencido: el que deja más hueco y, a igual hueco, el que menos se echa encima
// del arma del rival, que tiene delante.
function chooseCollapse(post, { overlap, random }) {
  const action = collapseOf(giantOf(post.entry));
  const seconds = COLLAPSE_SECONDS + CRUMBLE_SECONDS;
  return choose(post, action, { overlap, random, seconds, cost: (key) => towardRival(post.entry, action, key, seconds) });
}

// Lo que puede recibir un golpe: las mallas con esqueleto de la pieza y, si lo lleva, su escudo.
function targetsOf(entry) {
  const giant = giantOf(entry);
  if (giant) return skinnedMeshes(giant.object);
  const meshes = skinnedMeshes(entry.piece.object);
  entry.piece.props.shield?.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

// Llama a `measure` con el rival como estará al recibir el golpe, plantado en el tablero y mirando a
// `facing` (un gigante, además, en reposo), y lo deja como estaba.
function standing(entry, facing, measure) {
  const { figure } = entry.piece;
  const { y } = figure.position;
  const turn = figure.rotation.y;
  figure.position.y = 0;
  figure.rotation.y = facing;
  const giant = giantOf(entry);
  if (giant) {
    giant.play('idle', { fade: 0 });
    giant.update(0);
  }
  try {
    return measure();
  } finally {
    figure.position.y = y;
    figure.rotation.y = turn;
    entry.piece.object.updateMatrixWorld(true);
  }
}

// Distancia entre los centros a la que la cara del golpe de un gigante toca al rival, plantado en
// `center` y mirando hacia `from`, y se hunde FIST_BITE. `body` trae dónde está la mano o el pie en lo
// más largo del golpe y hasta dónde llega su malla en unas líneas paralelas a la del golpe (`faces`);
// cada línea sigue hasta el rival, y manda la que antes lo toca. Si ninguna lo toca, cuenta con su
// pecho (`torso`).
function punchDistance({ body, from, center, defender, torso }) {
  if (!body.faces) return body.reach + torso - FIST_BITE;
  const length = Math.hypot(center.x - from.x, center.z - from.z);
  const forward = new THREE.Vector3((center.x - from.x) / length, 0, (center.z - from.z) / length);
  const facing = Math.atan2(forward.x, forward.z);
  const side = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const contact = standing(defender, facing + Math.PI, () => {
    const targets = targetsOf(defender);
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
  });
  return (contact ?? (body.faces[0].face ?? body.reach) + torso) - FIST_BITE;
}

// Golpe del gigante y a qué distancia del rival se para. Prueba los golpes del que más alcanza al
// que menos y se queda con el primero con el que no tiene que retroceder desde su casilla (`from`);
// si con todos tendría que retroceder, con el que menos. Nunca se pone a menos de `closest`. Cada
// prueba lanza rayos contra la malla del rival, así que casi siempre basta con una.
function planPunch({ giant, from, center, defender, torso, closest }) {
  const length = Math.hypot(center.x - from.x, center.z - from.z);
  const byReach = giant.attacks
    .map(({ key }) => ({ key, body: giant.strikes[key]?.body }))
    .filter(({ body }) => body)
    .sort((a, b) => b.body.reach - a.body.reach);
  let shortest = null;
  for (const { key, body } of byReach) {
    const distance = Math.max(closest, punchDistance({ body, from, center, defender, torso }));
    if (distance <= length + 1e-6) return { key, distance };
    if (!shortest || distance < shortest.distance) shortest = { key, distance };
  }
  return shortest;
}

// Puñetazo de arriba abajo: a qué distancia entre los centros se para el gigante para que su puño, que
// baja por `strike.overhead.path` (medido con la pieza de prueba mirando hacia +Z), se hunda FIST_BITE
// en la coronilla del rival, y en qué momento del golpe la toca. `turn` es lo que gira el gigante sobre
// la línea hacia la cabeza, para que el puño, que baja por un lado, caiga justo encima. Devuelve null
// si el puño no llega a bajar hasta la cabeza o si el gigante tendría que acercarse más de `closest`.
function planOverhead({ strike, from, center, defender, closest }) {
  const { path } = strike.overhead;
  const facing = Math.atan2(center.x - from.x, center.z - from.z);
  const head = standing(defender, facing + Math.PI, () => {
    const bone = (giantOf(defender) ?? defender.piece).object.getObjectByName('Head');
    if (!bone) return null;
    const at = bone.getWorldPosition(new THREE.Vector3());
    const down = new THREE.Vector3(0, -1, 0);
    const hit = new THREE.Raycaster(new THREE.Vector3(at.x, at.y + RAY_FAR, at.z), down, 0, 2 * RAY_FAR).intersectObjects(targetsOf(defender), false)[0];
    return hit ? { x: at.x, z: at.z, crown: hit.point.y } : null;
  });
  if (!head) return null;
  const top = path.reduce((best, sample, i) => (sample.y > path[best].y ? i : best), 0);
  // El puño baja casi un palmo por fotograma, así que entre la muestra de antes y la de después se
  // interpola el momento justo en el que su cara de abajo llega a la coronilla.
  const objetivo = head.crown + FIST_HALF - FIST_BITE;
  const bajada = path.slice(top);
  const corte = bajada.findIndex((sample) => sample.y <= objetivo);
  if (corte < 0) return null;
  const hasta = bajada[corte];
  const desde = corte > 0 ? bajada[corte - 1] : null;
  const k = desde && desde.y > hasta.y ? (desde.y - objetivo) / (desde.y - hasta.y) : 1;
  const entre = (a, b) => a + (b - a) * k;
  const impact = desde ? { t: entre(desde.t, hasta.t), x: entre(desde.x, hasta.x), z: entre(desde.z, hasta.z) } : hasta;
  const distance = Math.hypot(impact.x, impact.z);
  if (distance < closest) return null;
  return { head: { x: head.x, z: head.z }, distance, t: impact.t, turn: -Math.atan2(impact.x, impact.z) };
}

// El puñetazo de arriba abajo aplasta al peón como un acordeón, y rebota.
function squash(clock, figure) {
  return clock.tween(0.5, (t) => {
    const k = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const wide = 1 + (1 - SQUASH) * 0.5 * k;
    figure.scale.set(wide, 1 - (1 - SQUASH) * k, wide);
  });
}

// Llama a `measure` con el gigante como estará dentro de `seconds` de juego si sigue en reposo, y lo
// deja como estaba. `idle` es su acción de reposo, que ya se ve del todo.
function poseAhead(giant, idle, seconds, measure) {
  if (!idle) return measure();
  const now = idle.time;
  idle.time = (now + seconds) % idle.getClip().duration;
  giant.update(0);
  try {
    return measure();
  } finally {
    idle.time = now;
    giant.update(0);
  }
}

// Cuánto debe resbalar la lanza para que, en lo más hondo de la estocada, la punta se hunda
// SPEAR_BITE en el gigante. Un rayo sigue la línea de la punta en ese momento (`spear`, medida con
// la pieza de prueba) desde la mano del peón, colocado en `spot` y mirando a `facing`. Si no toca la
// malla, la punta se queda en el pecho medido (`torso`).
function gripSlideToGiant({ spear, spot, facing, distance, giant, torso }) {
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, facing);
  const axis = new THREE.Vector3(...spear.axis).applyQuaternion(turn);
  const tip = new THREE.Vector3(spear.side, spear.height, spear.reach).applyQuaternion(turn).add(new THREE.Vector3(spot.x, 0, spot.z));
  const back = spear.reach; // el rayo sale de la altura de la mano
  const hit = new THREE.Raycaster(tip.clone().addScaledVector(axis, -back), axis, 0, back + 1).intersectObjects(skinnedMeshes(giant.object), false)[0];
  if (!hit) return gripSlideForReach({ reach: spear.reach, distance, torso });
  return Math.max(0, back - hit.distance - SPEAR_BITE);
}

// Cámara lenta hasta un impacto que llega a los `seconds` de juego; se resuelve en el impacto.
async function slowToImpact(clock, seconds) {
  await clock.wait(Math.max(0, seconds - SLOW_BEFORE));
  clock.timeScale = SLOW_MOTION;
  await clock.wait(Math.min(SLOW_BEFORE, seconds));
}

// Tras el impacto: congelado, algo más de cámara lenta y vuelta a la velocidad normal.
async function afterImpact(clock) {
  await clock.hold(HIT_STOP);
  await clock.wait(SLOW_AFTER);
  clock.timeScale = 1;
}

// La torre se come a un peón o a otra torre.
async function giantSmash({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, stances, obstacles, random }) {
  const rook = attacker.piece;
  const giant = rook.giant;
  const rival = giantOf(defender);
  const d = rival ?? defender.piece;
  const closest = rook.body.torso + (rival ? defender.piece.body.torso : PAWN_BODY) + BODY_GAP;
  // La mitad de las veces, si tiene un golpe de arriba abajo y el puño llega a la coronilla del rival,
  // le machaca el cráneo; si no, o si el puño se queda corto, un puñetazo de frente.
  const overheads = giant.attacks.filter((attack) => attack.overhead && giant.strikes[attack.key]?.overhead);
  const pick = overheads.length && random() < OVERHEAD_CHANCE ? overheads[Math.floor(random() * overheads.length)].key : null;
  const down = pick ? planOverhead({ strike: giant.strikes[pick], from: home, center, defender, closest }) : null;
  const { key, distance } = down ? { key: pick, distance: down.distance } : planPunch({
    giant, from: home, center, defender,
    torso: rival ? defender.piece.body.torso : TORSO,
    closest,
  });
  const measure = giant.strikes[key];
  const spots = strikeSpot(home, down ? down.head : center, { reach: distance, torso: 0 });
  const facing = spots.attackerFacing + (down?.turn ?? 0); // el puño baja por un lado: gira para que caiga encima
  const impact = down ? { t: down.t, bone: measure.overhead.bone } : { t: measure.body.t, bone: measure.body.bone };

  // 0. Qué hará cada gigante en su puesto: el atacante, su golpe y, si cabe, una provocación; el
  //    vencido, un derrumbe.
  const posts = [{ entry: attacker, at: spots.attacker, facing, parts: [{ action: 'attack', key }] }];
  if (rival) posts.push({ entry: defender, at: center, facing: spots.defenderFacing, parts: [] });
  const overlap = () => overlapOf(crowd, [attacker, defender], posts);
  const collapse = rival ? chooseCollapse(posts[1], { overlap, random }) : null;
  const taunt = choose(posts[0], 'taunt', { overlap, random, optional: true });
  for (const post of posts) stances.set(post.entry, stanceOf(post));

  // 1. La cámara encuadra y la torre (o las dos) se transforman.
  const opening = [cinema.frame(clock, spots.attacker, center, obstacles), attacker.mover.awaken()];
  if (rival) {
    opening.push(defender.mover.awaken());
  } else {
    d.setSpearDefault('upright');
    d.setGripSlide(-COMBAT_RAISE);
  }
  await Promise.all(opening);

  // 2. El gigante avanza hasta que su golpe alcanza al rival, se encaran y, si cabe, lo provoca.
  await attacker.mover.walkTo(spots.attacker);
  await Promise.all([
    attacker.mover.turnTo(facing, 0.3),
    defender.mover.turnTo(spots.defenderFacing, 0.3),
  ]);
  const taunts = [];
  if (taunt) taunts.push(giant.playOnce('taunt', { clip: taunt }));
  if (!rival && random() < 0.5 && d.hasClip('fidget', 'frightened')) taunts.push(d.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  giant.play('idle', { fade: 0.25 });
  if (!rival) {
    await defender.mover.descend(center);
    await defender.mover.turnTo(spots.defenderFacing, 0.2);
  }

  // 3. Golpe a cámara lenta, con destello, chispas y temblor. Un gigante vencido se tambalea y, poco
  //    después, se deshace en rocas.
  const attack = giant.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, impact.t);
  fx.burst(giant.object.getObjectByName(impact.bone).getWorldPosition(new THREE.Vector3()), { size: 1.2, sparks: 30 });
  hud.flash();
  cinema.shake(0.25);
  const ux = Math.sin(spots.attackerFacing);
  const uz = Math.cos(spots.attackerFacing);
  let fall = null;
  let crumbled = null;
  if (rival) {
    rival.playOnce(collapseOf(rival), { clip: collapse, fade: 0.1 });
    crumbled = clock.wait(COLLAPSE_SECONDS).then(() => defender.mover.crumble());
  } else {
    fall = d.playOnce(d.has('defeat') ? 'defeat' : 'fall', { fade: 0.1 });
    d.throwSpear({ x: ux, z: uz });
    if (down) {
      squash(clock, d.figure); // machacado desde arriba: se aplasta en el sitio en vez de salir despedido
    } else {
      const start = d.figure.position.clone();
      clock.tween(0.3, (t) => {
        const k = 1 - (1 - t) ** 2;
        d.figure.position.set(start.x + ux * KNOCKBACK * k, start.y, start.z + uz * KNOCKBACK * k);
      });
    }
  }
  await afterImpact(clock);
  await attack;
  giant.play('idle', { fade: 0.3 });

  // 4. El gigante vencido ya es un montón de rocas; un peón ve estrellitas y se esfuma.
  if (rival) {
    await crumbled;
  } else {
    await fall;
    fx.koStars(d.object.getObjectByName('Head') ?? d.figure, { seconds: KO_SECONDS });
    await clock.wait(KO_SECONDS);
    await defender.mover.vanish();
  }

  // 5. La cámara vuelve mientras el gigante ocupa la casilla y vuelve a ser torre.
  stances.delete(attacker);
  await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
}

// Un peón se come a una torre: estocada, y el gigante se derrumba en rocas.
async function pawnFellsGiant({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, stances, obstacles, random }) {
  const a = attacker.piece;
  const giant = defender.piece.giant;
  const spots = fightSpots(home, center, 'duel');
  const keys = usableStrikes(a.attacks, a.strikes, 'duel');
  const key = keys[Math.floor(random() * keys.length)];
  const measure = a.strikes[key];
  a.setSpearDefault('upright');
  a.setGripSlide(-COMBAT_RAISE);

  // 0. Qué hará el gigante en su casilla: un derrumbe y, si cabe, una provocación.
  const post = { entry: defender, at: center, facing: spots.defenderFacing, parts: [] };
  const overlap = () => overlapOf(crowd, [attacker, defender], [post]);
  const collapse = chooseCollapse(post, { overlap, random });
  const taunt = choose(post, 'taunt', { overlap, random, optional: true });
  stances.set(defender, stanceOf(post));

  // 1. La cámara encuadra, la torre se transforma, se encaran y el gigante provoca si cabe.
  await Promise.all([
    cinema.frame(clock, spots.attacker, spots.defender, obstacles),
    defender.mover.awaken(),
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
  ]);
  await defender.mover.turnTo(spots.defenderFacing, 0.35);
  const taunts = [];
  if (taunt) taunts.push(giant.playOnce('taunt', { clip: taunt }));
  if (random() < 0.5 && a.hasClip('fidget', 'frightened')) taunts.push(a.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  const idle = giant.play('idle', { fade: 0.25 });
  await attacker.mover.descend(spots.attacker);
  // Antes de la estocada, aún quieto, apunta la lanza al gigante y la hace resbalar en la mano. Si
  // girara y resbalara ya atacando, la punta se clavaría en el gigante y, al agacharse, el regatón
  // se hundiría en el suelo. Se mide contra el gigante tal y como estará en el impacto.
  const slide = poseAhead(giant, idle, GRIP_SETTLE + measure.spear.t, () => gripSlideToGiant({
    spear: measure.spear, spot: spots.attacker, facing: spots.attackerFacing, distance: spots.distance, giant, torso: defender.piece.body.torso,
  }));
  a.setSpearPose('forward');
  a.setGripSlide(slide);
  await Promise.all([attacker.mover.turnTo(spots.attackerFacing, 0.2), clock.wait(GRIP_SETTLE)]);

  // 2. Estocada a cámara lenta: la punta toca la piedra y rebota, y el gigante se tambalea y, poco
  //    después, se deshace en rocas.
  const attack = a.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, measure.spear.t);
  fx.burst(spearTip(a), { size: 1.1, sparks: 28 });
  hud.flash();
  cinema.shake(0.2);
  a.setGripSlide(slide + SPEAR_RECOIL);
  giant.playOnce(collapseOf(giant), { clip: collapse, fade: 0.1 });
  const crumbled = clock.wait(COLLAPSE_SECONDS).then(() => defender.mover.crumble());
  await afterImpact(clock);
  await attack;
  // Baja el arma y, con la lanza ya erguida, vuelve a subirla en la mano.
  a.setSpearPose(null);
  a.play('idle', { fade: 0.3 });
  await clock.wait(RECOVER);
  a.setGripSlide(-COMBAT_RAISE);
  await crumbled;

  // 3. Victoria: la cámara vuelve, el peón ocupa la casilla y lo celebra.
  a.setSpearPose(null);
  a.setGripSlide(0);
  await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
  if (a.has('victory')) {
    await a.playOnce('victory');
    a.play('idle', { fade: 0.3 });
  } else {
    await attacker.mover.hop(2);
  }
  a.setSpearDefault(null);
}

// `obstacles` son los centros {x, z} de las demás piezas, para que la cámara no quede tapada.
export async function runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles = [], random = Math.random }) {
  const stances = new Map(); // gigante → abanico de lo que hará en su puesto (`stanceOf`)
  const fight = {
    attacker, defender, clock, fx, cinema, hud, crowd, stances, obstacles, random,
    target: defender.mover.square,
    home: board.squareToWorld(attacker.mover.square),
    center: board.squareToWorld(defender.mover.square),
  };
  const release = crowd.claim({
    owners: [attacker, defender],
    bodies: () => [attacker, defender].flatMap((entry) => entry.mover.room?.({ stance: stances.get(entry) }) ?? []),
  });
  try {
    if (giantOf(attacker)) await giantSmash(fight);
    else await pawnFellsGiant(fight);
  } finally {
    release();
  }
  await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
}
