import * as THREE from 'three';
import { fightSpots, gripSlideForReach, planExchanges, usableStrikes } from './plan.js';

// Director del combate entre dos peones (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-combate-peones-design.md). Gana siempre el atacante.

const HIT_STOP = 0.08; // segundos reales congelados en cada impacto
const SLOW_MOTION = 0.3;
const SLOW_BEFORE = 0.35; // segundos de juego antes del golpe final en cámara lenta
const SLOW_AFTER = 0.4;
const KNOCKBACK = 0.2; // lo que sale despedido el vencido
const KO_SECONDS = 1.2;
const RECOVER = 0.3; // la lanza vuelve a su agarre antes de bajar el arma, para no barrer al lado
// En combate, las lanzas van erguidas y algo subidas en la mano, para que el regatón no barra
// las peanas vecinas en los golpes recibidos.
const COMBAT_RAISE = 0.3;

function strikesFor(pawn, style) {
  return usableStrikes(pawn.piece.attacks, pawn.piece.strikes, style);
}

// Claves de golpe que pueden usar los dos luchadores en este estilo.
function sharedStrikes(attacker, defender, style) {
  const theirs = strikesFor(defender, style);
  return strikesFor(attacker, style).filter((key) => theirs.includes(key));
}

export function canFight(attacker, defender, style) {
  const a = attacker.piece;
  const d = defender.piece;
  return a.has('attack') && a.has('hit') && d.has('attack') && d.has('hit')
    && (d.has('defeat') || d.has('fall'))
    && sharedStrikes(attacker, defender, style).length > 0;
}

// Punto del impacto: la punta de la lanza en el duelo; la mano o el pie en el cuerpo a cuerpo.
function impactPoint(hitter, measure, style) {
  const piece = hitter.piece;
  if (style === 'duel' && piece.props.spear && piece.spearEnds) {
    return piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0));
  }
  return piece.object.getObjectByName(measure.body.bone).getWorldPosition(new THREE.Vector3());
}

async function strike({ hitter, receiver, beat, style, spots, clock, fx, cinema, hud }) {
  const h = hitter.piece;
  const r = receiver.piece;
  const measure = h.strikes[beat.key];
  const impact = style === 'duel' ? measure.spear : measure.body;
  if (style === 'duel') h.setGripSlide(gripSlideForReach({ reach: measure.spear.reach, distance: spots.distance }));
  const attack = h.playOnce('attack', { clip: beat.key, fade: 0.15 });

  if (!beat.final) {
    await clock.wait(impact.t);
    fx.burst(impactPoint(hitter, measure, style), { size: 0.55, sparks: 12 });
    cinema.shake(0.07);
    const reaction = r.playOnce('hit', { fade: 0.08 });
    await clock.hold(HIT_STOP);
    await Promise.all([attack, reaction]);
    h.setGripSlide(-COMBAT_RAISE);
    await clock.wait(RECOVER);
    h.play('idle', { fade: 0.25 });
    r.play('idle', { fade: 0.25 });
    await clock.wait(0.25);
    return;
  }

  // Golpe final: cámara lenta, destello, empujón y derrota.
  await clock.wait(Math.max(0, impact.t - SLOW_BEFORE));
  clock.timeScale = SLOW_MOTION;
  await clock.wait(Math.min(SLOW_BEFORE, impact.t));
  fx.burst(impactPoint(hitter, measure, style), { size: 1, sparks: 26 });
  hud.flash();
  cinema.shake(0.18);
  const fall = r.playOnce(r.has('defeat') ? 'defeat' : 'fall', { fade: 0.1 });
  const start = r.figure.position.clone();
  const ux = (spots.defender.x - spots.attacker.x) / spots.distance;
  const uz = (spots.defender.z - spots.attacker.z) / spots.distance;
  r.throwSpear({ x: ux, z: uz }); // la lanza del vencido sale volando
  const knock = clock.tween(0.3, (t) => {
    const k = 1 - (1 - t) ** 2;
    r.figure.position.set(start.x + ux * KNOCKBACK * k, start.y, start.z + uz * KNOCKBACK * k);
  });
  await clock.hold(HIT_STOP);
  await clock.wait(SLOW_AFTER);
  clock.timeScale = 1;
  await Promise.all([attack, fall, knock]);
  h.setGripSlide(-COMBAT_RAISE);
  await clock.wait(RECOVER);
  h.play('idle', { fade: 0.3 });
}

// `obstacles` son las posiciones {x, z} de las demás piezas, para que la cámara no quede tapada.
export async function runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, obstacles = [], random = Math.random }) {
  const a = attacker.piece;
  const d = defender.piece;
  const target = defender.mover.square;
  const home = board.squareToWorld(attacker.mover.square);
  const spots = fightSpots(home, board.squareToWorld(target), style);
  const beats = planExchanges(sharedStrikes(attacker, defender, style), random);
  for (const piece of [a, d]) {
    piece.setSpearDefault('upright'); // también durante la provocación, que agita los brazos
    piece.setGripSlide(-COMBAT_RAISE);
    if (style === 'melee') piece.setSpearPose('upright');
  }

  // 1. Preparación: la cámara encuadra, se encaran, provocación o susto, y bajan de la peana.
  const framing = cinema.frame(clock, spots.attacker, spots.defender, obstacles);
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
    defender.mover.turnTo(spots.defenderFacing, 0.3),
  ]);
  const opening = [framing];
  if (a.has('taunt')) opening.push(a.playOnce('taunt'));
  if (random() < 0.5 && d.hasClip('fidget', 'frightened')) opening.push(d.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(opening);
  await Promise.all([
    attacker.mover.descend(style === 'duel' ? spots.attacker : home),
    defender.mover.descend(spots.defender),
  ]);
  if (style === 'melee') await attacker.mover.walkTo(spots.attacker);
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.25),
    defender.mover.turnTo(spots.defenderFacing, 0.25),
  ]);

  // 2 y 3. Intercambios y golpe final.
  for (const beat of beats) {
    const [hitter, receiver] = beat.by === 'attacker' ? [attacker, defender] : [defender, attacker];
    await strike({ hitter, receiver, beat, style, spots, clock, fx, cinema, hud });
  }

  // 4. K.O.: estrellitas y el vencido se esfuma.
  fx.koStars(d.object.getObjectByName('Head') ?? d.figure, { seconds: KO_SECONDS });
  await clock.wait(KO_SECONDS);
  await defender.mover.vanish();

  // 5. Victoria: la cámara vuelve, el ganador ocupa la casilla y lo celebra con la lanza
  // erguida (si siguiera a la mano, al alzar los brazos barrería a las piezas vecinas).
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
