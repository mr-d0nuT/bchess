import * as THREE from 'three';
import { TORSO, bestStrike, fightSpots, gripSlideForReach, strikeSpot, usableStrikes } from './plan.js';

// Capturas cortas y brutales en las que participa una torre (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-torre-gigante-design.md, sección 7). Gana siempre el atacante. Mientras dura,
// los gigantes piden sitio a las piezas de alrededor; el atacante y el defensor no se apartan.

const HIT_STOP = 0.1; // segundos reales congelados en el impacto
const SLOW_MOTION = 0.3;
const SLOW_BEFORE = 0.35; // segundos de juego antes del impacto, ya a cámara lenta
const SLOW_AFTER = 0.45;
const KNOCKBACK = 0.2; // lo que sale despedido el peón
const KO_SECONDS = 1;
const COLLAPSE_SECONDS = 0.8; // lo que se ve del derrumbe antes de deshacerse en rocas
const RECOVER = 0.3; // la lanza vuelve a su agarre antes de bajar el arma
const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const COMBAT_RAISE = 0.3; // como en el duelo: la lanza, algo subida en la mano
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas

const giantOf = (entry) => (entry.kind === 'rook' ? entry.piece.giant : null);
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
async function giantSmash({ attacker, defender, home, center, target, clock, fx, cinema, hud, obstacles, random }) {
  const rook = attacker.piece;
  const giant = rook.giant;
  const key = bestStrike(giant.attacks, giant.strikes);
  const measure = giant.strikes[key];
  const rival = giantOf(defender);
  const d = rival ?? defender.piece;
  const spots = strikeSpot(home, center, {
    reach: measure.body.reach,
    torso: rival ? defender.piece.body.torso : TORSO,
    closest: rook.body.torso + (rival ? defender.piece.body.torso : PAWN_BODY) + BODY_GAP,
  });

  // 1. La cámara encuadra y la torre (o las dos) se transforman.
  const opening = [cinema.frame(clock, spots.attacker, center, obstacles), attacker.mover.awaken()];
  if (rival) {
    opening.push(defender.mover.awaken());
  } else {
    d.setSpearDefault('upright');
    d.setGripSlide(-COMBAT_RAISE);
  }
  await Promise.all(opening);

  // 2. El gigante avanza hasta que su golpe alcanza al rival, se encaran y lo provoca.
  await attacker.mover.walkTo(spots.attacker);
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
    defender.mover.turnTo(spots.defenderFacing, 0.3),
  ]);
  const taunts = [];
  if (giant.has('taunt')) taunts.push(giant.playOnce('taunt'));
  if (!rival && random() < 0.5 && d.hasClip('fidget', 'frightened')) taunts.push(d.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  giant.play('idle', { fade: 0.25 });
  if (!rival) {
    await defender.mover.descend(center);
    await defender.mover.turnTo(spots.defenderFacing, 0.2);
  }

  // 3. Golpe a cámara lenta, con destello, chispas y temblor.
  const attack = giant.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, measure.body.t);
  fx.burst(giant.object.getObjectByName(measure.body.bone).getWorldPosition(new THREE.Vector3()), { size: 1.2, sparks: 30 });
  hud.flash();
  cinema.shake(0.25);
  const ux = Math.sin(spots.attackerFacing);
  const uz = Math.cos(spots.attackerFacing);
  let fall;
  if (rival) {
    fall = rival.playOnce(rival.has('defeat') ? 'defeat' : 'hit', { fade: 0.1 });
  } else {
    fall = d.playOnce(d.has('defeat') ? 'defeat' : 'fall', { fade: 0.1 });
    d.throwSpear({ x: ux, z: uz });
    const start = d.figure.position.clone();
    clock.tween(0.3, (t) => {
      const k = 1 - (1 - t) ** 2;
      d.figure.position.set(start.x + ux * KNOCKBACK * k, start.y, start.z + uz * KNOCKBACK * k);
    });
  }
  await afterImpact(clock);
  await attack;
  giant.play('idle', { fade: 0.3 });

  // 4. El vencido se deshace en rocas o, si es un peón, ve estrellitas y se esfuma.
  if (rival) {
    await Promise.race([fall, clock.wait(COLLAPSE_SECONDS)]);
    await defender.mover.crumble();
  } else {
    await fall;
    fx.koStars(d.object.getObjectByName('Head') ?? d.figure, { seconds: KO_SECONDS });
    await clock.wait(KO_SECONDS);
    await defender.mover.vanish();
  }

  // 5. La cámara vuelve mientras el gigante ocupa la casilla y vuelve a ser torre.
  await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
}

// Un peón se come a una torre: estocada, y el gigante se derrumba en rocas.
async function pawnFellsGiant({ attacker, defender, home, center, target, clock, fx, cinema, hud, obstacles, random }) {
  const a = attacker.piece;
  const giant = defender.piece.giant;
  const spots = fightSpots(home, center, 'duel');
  const keys = usableStrikes(a.attacks, a.strikes, 'duel');
  const key = keys[Math.floor(random() * keys.length)];
  const measure = a.strikes[key];
  a.setSpearDefault('upright');
  a.setGripSlide(-COMBAT_RAISE);

  // 1. La cámara encuadra, la torre se transforma, se encaran y el gigante provoca.
  await Promise.all([
    cinema.frame(clock, spots.attacker, spots.defender, obstacles),
    defender.mover.awaken(),
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
  ]);
  await defender.mover.turnTo(spots.defenderFacing, 0.35);
  const taunts = [];
  if (giant.has('taunt')) taunts.push(giant.playOnce('taunt'));
  if (random() < 0.5 && a.hasClip('fidget', 'frightened')) taunts.push(a.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  giant.play('idle', { fade: 0.25 });
  await attacker.mover.descend(spots.attacker);
  await attacker.mover.turnTo(spots.attackerFacing, 0.2);

  // 2. Estocada a cámara lenta: la punta se queda en el pecho del gigante, que se derrumba.
  a.setGripSlide(gripSlideForReach({ reach: measure.spear.reach, distance: spots.distance, torso: defender.piece.body.torso }));
  const attack = a.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, measure.spear.t);
  fx.burst(spearTip(a), { size: 1.1, sparks: 28 });
  hud.flash();
  cinema.shake(0.2);
  const collapse = giant.playOnce(giant.has('defeat') ? 'defeat' : 'hit', { fade: 0.1 });
  await afterImpact(clock);
  await attack;
  a.setGripSlide(-COMBAT_RAISE);
  await clock.wait(RECOVER);
  a.play('idle', { fade: 0.3 });
  await Promise.race([collapse, clock.wait(COLLAPSE_SECONDS)]);
  await defender.mover.crumble();

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
  const fight = {
    attacker, defender, clock, fx, cinema, hud, obstacles, random,
    target: defender.mover.square,
    home: board.squareToWorld(attacker.mover.square),
    center: board.squareToWorld(defender.mover.square),
  };
  const release = crowd.claim({
    owners: [attacker, defender],
    bodies: () => [
      ...(attacker.mover.room?.({ fighting: true }) ?? []),
      ...(defender.mover.room?.({ fighting: true }) ?? []),
    ],
  });
  try {
    if (giantOf(attacker)) await giantSmash(fight);
    else await pawnFellsGiant(fight);
  } finally {
    release();
  }
  await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
}
