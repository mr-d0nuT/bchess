import * as THREE from 'three';
import { TORSO, bestStrike, fightSpots, strikeSpot, usableStrikes } from './plan.js';
import {
  afterImpact, choose, gripSlideToTarget, knockBack, overlapOf, planPunch, poseAhead, slowToImpact, stanceOf, standing, targetsOf, towardRival,
} from './fight.js';
import { skinnedMeshes } from './strikes.js';
import { findBone } from '../pieces/bone-names.js';
import { CRUMBLE_SECONDS } from '../moves/rook-mover.js';

// Capturas cortas y brutales en las que participa una torre (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-torre-gigante-design.md, sección 7). Gana siempre el atacante. Antes de empezar
// se decide qué hará cada gigante en su puesto, eligiendo el derrumbe y la provocación que dejan más
// hueco a las piezas de alrededor; si provocar les quita sitio, no provoca. Mientras dura, cada
// gigante pide sitio con el abanico de lo que va a hacer; el atacante y el defensor no se apartan.
// La mitad de las veces, si puede, el gigante machaca el cráneo del rival de un puñetazo de arriba
// abajo en vez de pegarle de frente. Lo que comparte con las batallas del caballero está en `fight.js`.

const KO_SECONDS = 1;
const COLLAPSE_SECONDS = 0.8; // del impacto a deshacerse en rocas
const RECOVER = 0.3; // lo que tarda en bajar el arma antes de volver a subir la lanza en la mano
const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const COMBAT_RAISE = 0.3; // como en el duelo: la lanza, algo subida en la mano
const GRIP_SETTLE = 0.35; // lo que tarda la lanza en resbalar en la mano antes de la estocada
const SPEAR_RECOIL = 0.12; // lo que rebota la lanza en la piedra tras el golpe
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas
const FIST_BITE = 0.03; // lo que se hunde en el rival la cara del puño
const FIST_REACH = 1; // hasta dónde se busca, por debajo del hueso de la mano, la cara de abajo del puño
const SQUASH = 0.55; // lo que queda de alto el peón al que machaca un puñetazo de arriba abajo
const OVERHEAD_CHANCE = 0.5; // cada cuánto, contra alguien bajito, machaca el cráneo en vez de pegar de frente
// A partir de esta parte de su propia altura, el rival es «de su tamaño» y el puñetazo de frente deja
// de servir: para que el puño le llegue al pecho, los dos cuerpos acaban pegados y el gigante se
// agacha a abrazarlo. Contra esos va siempre el golpe de arriba abajo, que cae sobre la coronilla
// desde más atrás y se lee como lo que es. Un peón queda por debajo del listón y conserva los dos.
const TALL_SHARE = 0.9;
const BACK_OFF = 1.4; // paso atrás contra un rival de su tamaño, en costados suyos
// Y hasta dónde se le deja retroceder por detrás del centro de SU casilla. El sitio de pegar se mide
// desde el rival, así que si el rival está pegado el gigante acaba detrás de su propia casilla, y
// ahí hay otra pieza. Menos de media casilla: se queda dentro de la suya pase lo que pase.
const RETREAT_MAX = 0.4;
const RAY_FAR = 3; // desde dónde se lanza el rayo que busca la coronilla del rival
const CROWN_PHASES = 4; // momentos del reposo del rival en los que se mira su coronilla
// Cruz de rayos alrededor del hueso de la cabeza: la corona del gigante es almenada y por el centro
// está hundida, así que el puño tiene que pararse encima de lo más alto, no entre las almenas.
const CROWN_RAYS = [[0, 0], [0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]];

const giantOf = (entry) => (entry.kind === 'rook' ? entry.piece.giant : null);
const collapseOf = (giant) => (giant.has('defeat') ? 'defeat' : 'hit');
const spearTip = (piece) => piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0));
// Puesto de una torre: su gigante en `at`, mirando a `facing`, con las partes de lo que hará allí.
const postOf = (entry, at, facing, parts = []) => ({ entry, fans: entry.piece.body.fans, margin: entry.piece.body.margin, at, facing, parts });

export function canSmash(attacker, defender) {
  const giant = giantOf(attacker);
  if (giant) {
    if (!bestStrike(giant.attacks, giant.strikes)) return false;
    return defender.kind === 'rook' ? Boolean(giantOf(defender)) : defender.piece.has('defeat') || defender.piece.has('fall');
  }
  return attacker.kind === 'pawn' && Boolean(giantOf(defender))
    && usableStrikes(attacker.piece.attacks, attacker.piece.strikes, 'duel').length > 0;
}

// Cuánto sobresale el puño por debajo del hueso de la mano en el instante `t` del golpe `key`: un rayo
// hacia arriba contra la propia malla del que pega, con el clip puesto en ese momento. Devuelve 0 si por
// debajo del hueso no hay puño (a mitad de la bajada el puño va por delante, no debajo). Hace falta
// medirlo y no darlo por sabido: en el gigante pasa de 0 a 38 cm según el momento del tajo.
function fistBelow(fighter, key, bone, t) {
  const action = fighter.play('attack', { loop: false, fade: 0, clip: key });
  if (!action) return 0;
  const now = action.time;
  const up = new THREE.Vector3(0, 1, 0);
  try {
    action.time = t;
    fighter.update(0);
    fighter.object.updateMatrixWorld(true);
    const at = fighter.object.getObjectByName(bone)?.getWorldPosition(new THREE.Vector3());
    if (!at) return 0;
    const hit = new THREE.Raycaster(at.clone().addScaledVector(up, -FIST_REACH), up, 0, FIST_REACH)
      .intersectObjects(skinnedMeshes(fighter.object), false)[0];
    return hit ? FIST_REACH - hit.distance : 0;
  } finally {
    action.time = now;
    fighter.play('idle', { fade: 0 });
    fighter.update(0);
  }
}

// Puñetazo de arriba abajo: a qué distancia entre los centros se para el gigante para que su puño, que
// baja por `strike.overhead.path` (medido con la pieza de prueba mirando hacia +Z), se hunda FIST_BITE
// en la coronilla del rival (`target`, plantado en `center` y mirando hacia `from`), y en qué momento del
// golpe la toca. `turn` es lo que gira el gigante sobre la línea hacia la cabeza, para que el puño, que
// baja por un lado, caiga justo encima. Se resuelve en dos pasadas: la primera coloca el hueso en la
// coronilla, y con ese instante se mide cuánto puño cuelga por debajo (`fistBelow`) para volver a
// resolver con esa medida. Devuelve null si el puño no llega a la cabeza, si con el puño de verdad no
// puede caerle encima sin metérsele dentro, o si el gigante tendría que acercarse más de `closest`; en
// esos casos pega de frente.
function planOverhead({ strike, from, center, target, closest, rest = false, fighter, key }) {
  const { path } = strike.overhead;
  const facing = Math.atan2(center.x - from.x, center.z - from.z);
  const head = standing(target, facing + Math.PI, () => {
    const bone = findBone(target.object, 'Head');
    if (!bone) return null;
    const down = new THREE.Vector3(0, -1, 0);
    const targets = targetsOf(target);
    // El reposo de un gigante sube y baja la cabeza un palmo, y el golpe llega vaya a saber en qué
    // momento de ese vaivén: se mira la coronilla a lo largo de todo su reposo y manda la más alta, así
    // el puño nunca se le mete dentro (como mucho se queda un pelo corto).
    const idle = rest ? target.play('idle', { fade: 0 }) : null;
    const duration = idle?.getClip().duration ?? 0;
    const now = idle?.time ?? 0;
    const phases = idle && duration > 0 ? CROWN_PHASES : 1;
    let best = null;
    try {
      for (let i = 0; i < phases; i++) {
        if (idle && duration > 0) {
          idle.time = (duration * i) / phases;
          target.update(0);
          target.object.updateMatrixWorld(true);
        }
        const at = bone.getWorldPosition(new THREE.Vector3());
        for (const [dx, dz] of CROWN_RAYS) {
          const from2 = new THREE.Vector3(at.x + dx, at.y + RAY_FAR, at.z + dz);
          const hit = new THREE.Raycaster(from2, down, 0, 2 * RAY_FAR).intersectObjects(targets, false)[0];
          if (hit && (!best || hit.point.y > best.crown)) best = { x: at.x, z: at.z, crown: hit.point.y };
        }
      }
    } finally {
      if (idle) {
        idle.time = now;
        target.update(0);
      }
    }
    return best;
  }, { rest });
  if (!head) return null;
  const top = path.reduce((best, sample, i) => (sample.y > path[best].y ? i : best), 0);
  const bajada = path.slice(top);
  // El puño baja casi un palmo por fotograma, así que entre la muestra de antes y la de después se
  // interpola el momento justo en el que su cara de abajo llega a la coronilla. `below` es lo que cuelga
  // el puño por debajo del hueso de la mano en ese momento.
  const resolver = (below) => {
    const objetivo = head.crown + below - FIST_BITE;
    // Si en lo más alto del golpe el puño ya está por debajo de esa altura, nunca le cae encima: no hay
    // bajada que cruce la coronilla, solo un puño que pasa por dentro de la cabeza.
    if (!bajada.length || bajada[0].y <= objetivo) return null;
    const corte = bajada.findIndex((sample) => sample.y <= objetivo);
    if (corte < 0) return null;
    const hasta = bajada[corte];
    const desde = corte > 0 ? bajada[corte - 1] : null;
    const k = desde && desde.y > hasta.y ? (desde.y - objetivo) / (desde.y - hasta.y) : 1;
    const entre = (a, b) => a + (b - a) * k;
    return desde ? { t: entre(desde.t, hasta.t), x: entre(desde.x, hasta.x), z: entre(desde.z, hasta.z) } : hasta;
  };
  let impact = resolver(0); // primera pasada: el hueso justo en la coronilla
  if (!impact) return null;
  const below = fistBelow(fighter, key, strike.overhead.bone, impact.t);
  if (below > 0) {
    impact = resolver(below);
    if (!impact) return null; // con el puño de verdad no le cae encima sin metérsele dentro: de frente
  }
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

// Derrumbe del gigante vencido: el que deja más hueco y, a igual hueco, el que menos se echa encima
// del arma del rival, que tiene delante.
function chooseCollapse(post, { overlap, random }) {
  const action = collapseOf(giantOf(post.entry));
  const seconds = COLLAPSE_SECONDS + CRUMBLE_SECONDS;
  return choose(post, action, { overlap, random, seconds, cost: (key) => towardRival(post.fans, action, key, seconds) });
}

// La torre se come a un peón o a otra torre.
async function giantSmash({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, stances, obstacles, random }) {
  const rook = attacker.piece;
  const giant = rook.giant;
  const rival = giantOf(defender);
  const d = rival ?? defender.piece;
  const rest = Boolean(rival);
  const closest = rook.body.torso + (rival ? defender.piece.body.torso : PAWN_BODY) + BODY_GAP;
  // Si tiene un golpe de arriba abajo y el puño llega a la coronilla del rival, le machaca el cráneo;
  // si no, o si el puño se queda corto, un puñetazo de frente. Contra un rival de su tamaño lo
  // intenta siempre; contra uno bajito, la mitad de las veces, que así hay variedad.
  const overheads = giant.attacks.filter((attack) => attack.overhead && giant.strikes[attack.key]?.overhead);
  const grande = (d.height ?? 0) >= giant.height * TALL_SHARE;
  const quiere = overheads.length && (grande || random() < OVERHEAD_CHANCE);
  const pick = quiere ? overheads[Math.floor(random() * overheads.length)].key : null;
  const down = pick ? planOverhead({ strike: giant.strikes[pick], from: home, center, target: d, closest, rest, fighter: giant, key: pick }) : null;
  const plan = down ? { key: pick, distance: down.distance } : planPunch({
    attacks: giant.attacks, strikes: giant.strikes, from: home, center, target: d, rest,
    torso: rival ? defender.piece.body.torso : TORSO,
    closest,
  });
  const key = plan.key;
  // Contra alguien de su tamaño y pegando de frente, se queda un paso más atrás. El puño se planta
  // donde toca para hundirse en el pecho, y con dos cuerpos anchos eso deja al gigante encima del
  // rival, agachado sobre él. Quedándose atrás el puño no llega a hundirse, pero eso no se ve: lo
  // que se ve es el parón, el temblor y las chispas. Lo que sí se veía era el abrazo.
  //
  // Con tope: el paso atrás no puede sacarlo de su casilla, que detrás hay otra pieza esperando.
  const camino = Math.hypot(center.x - home.x, center.z - home.z);
  const paso = !down && grande ? rook.body.torso * BACK_OFF : 0;
  const distance = Math.min(plan.distance + paso, Math.max(plan.distance, camino + RETREAT_MAX));
  const measure = giant.strikes[key];
  const spots = strikeSpot(home, down ? down.head : center, { reach: distance, torso: 0 });
  const facing = spots.attackerFacing + (down?.turn ?? 0); // el puño baja por un lado: gira para que caiga encima
  const impact = down ? { t: down.t, bone: measure.overhead.bone } : { t: measure.body.t, bone: measure.body.bone };

  // 0. Qué hará cada gigante en su puesto: el atacante, su golpe y, si cabe, una provocación; el
  //    vencido, un derrumbe.
  const posts = [postOf(attacker, spots.attacker, facing, [{ action: 'attack', key }])];
  if (rival) posts.push(postOf(defender, center, spots.defenderFacing));
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
  //    después, se deshace en rocas; a un peón machacado desde arriba se le aplasta el cuerpo.
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
    if (down) squash(clock, d.figure); // machacado desde arriba: se aplasta en el sitio
    else knockBack({ clock, figure: d.figure, ux, uz });
  }
  await afterImpact(clock);
  await attack;
  giant.play('idle', { fade: 0.3 });

  // 4. El gigante vencido ya es un montón de rocas; un peón ve estrellitas y se esfuma.
  if (rival) {
    await crumbled;
  } else {
    await fall;
    fx.koStars(findBone(d.object, 'Head') ?? d.figure, { seconds: KO_SECONDS });
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
  const post = postOf(defender, center, spots.defenderFacing);
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
  const slide = poseAhead(giant, idle, GRIP_SETTLE + measure.spear.t, () => gripSlideToTarget({
    spear: measure.spear, spot: spots.attacker, facing: spots.attackerFacing, distance: spots.distance, target: giant, torso: defender.piece.body.torso,
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
