import * as THREE from 'three';
import { sfx } from '../audio/sfx.js';
import { TORSO, aimedSlide, fightSpots, gripSlideForReach, planExchanges, shieldOf, usableStrikes } from './plan.js';
import { twirl } from './twirl.js';
import { rightOf, victoryLap } from './knight/common.js';

// Director del combate entre dos peones (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-combate-peones-design.md). Gana siempre el atacante.

const HIT_STOP = 0.08; // segundos reales congelados en cada impacto
const SLOW_MOTION = 0.3;
const SLOW_BEFORE = 0.35; // segundos de juego antes del golpe final en cámara lenta
const SLOW_AFTER = 0.4;
const KNOCKBACK = 0.2; // lo que sale despedido el vencido
const KO_SECONDS = 1.2;
const GRIP_SETTLE = 0.35; // lo que tarda la lanza en resbalar en la mano antes de la estocada
const RECOVER = 0.3; // lo que tarda en bajar el arma y erguir la lanza antes de volver a subirla en la mano
// En combate, las lanzas van erguidas y algo subidas en la mano, para que el regatón no barra
// las peanas vecinas en los golpes recibidos.
const COMBAT_RAISE = 0.3;
const TWIRL_TURNS = 3; // vueltas de lanza del atacante al encarar, y del vencedor al celebrar
const TWIRL_SECONDS = 0.7;
// Lo que se ve de cada golpe antes de que llegue. La única estocada del peón que no es con la mano del
// escudo (box_02) tarda 2,3 s en soltarse, con mucho baile de pies antes: sin recortarla, cada intercambio
// se hacía eterno.
const STRIKE_LEAD = 1.0;
// LA ESTOCADA, AL CUERPO, Y LA PARADA CON EL ESCUDO (lo pidió el usuario). Las estocadas iban hacia arriba y de
// lado, a la cabeza o al hombro del otro: ahora van del puño a un punto del cuerpo (`aimSpear`), y las que no
// son la última las para quien las recibe, subiendo el escudo delante del pecho y de cara a la punta.
const HIT_HEIGHT = 0.62; // la que entra: al pecho (en alturas de la figura de quien la recibe)
const PARRY_HEIGHT = 0.52; // la que se para: al cuerpo, algo más abajo, que el escudo cuelga un palmo de la mano
const PARRY_OUT = 0.2; // lo que adelanta el escudo del pecho al parar
const PARRY_BEHIND = 0.03; // el centro del escudo, tras el punto donde da la punta (lo que abulta)
const PARRY_LEAD = 0.55; // segundos antes del golpe en que empieza a subirlo…
const PARRY_RAISE = 0.32; // …lo que tarda en subirlo…
const PARRY_HOLD = 0.3; // …lo que lo aguanta tras el golpe…
const PARRY_LOWER = 0.45; // …y lo que tarda en bajarlo
const PARRY_PUSH = 0.06; // lo que le empuja la estocada parada
// El codo del brazo del escudo al pararla: abajo y hacia fuera (en el sistema de la figura, +X es su izquierda).
const PARRY_POLE = new THREE.Vector3(0.8, -0.55, -0.2);

function strikesFor(pawn, style) {
  return usableStrikes(pawn.piece.attacks, pawn.piece.strikes, style, { shield: shieldOf(pawn.piece) });
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

// Adónde va la estocada y cuánto ha de resbalar la lanza en la mano para que la punta llegue justo ahí: del
// puño (donde estará al dar, según se midió el golpe) a un punto del cuerpo de quien la recibe, o delante de
// él, donde pondrá el escudo si la para. Null si el golpe no trae medido el puño.
function aimThrust({ hitter, receiver, measure, parry }) {
  const spear = measure.spear;
  if (!spear?.fist) return null;
  const h = hitter.piece;
  const r = receiver.piece;
  const fist = h.figure.localToWorld(new THREE.Vector3(spear.fist.x, spear.fist.y, spear.fist.z));
  const tip = h.figure.localToWorld(new THREE.Vector3(spear.side, spear.height, spear.reach));
  const from = h.figure.getWorldPosition(new THREE.Vector3());
  const to = r.figure.getWorldPosition(new THREE.Vector3());
  const u = to.clone().sub(from).setY(0).normalize(); // de quien pega a quien recibe
  const point = to.clone().addScaledVector(u, -(TORSO + (parry ? PARRY_OUT : 0)));
  point.y = to.y + (r.height - r.pedestalHeight) * (parry ? PARRY_HEIGHT : HIT_HEIGHT);
  return { point, u, slide: aimedSlide({ fist, tipToFist: tip.distanceTo(fist), target: point }) };
}

// Quien recibe sube el escudo delante del pecho, de cara a la punta, justo a tiempo; lo aguanta y lo baja. El
// brazo, con un IK de dos huesos (`reachArms`) que lleva la mano adonde el escudo (que cuelga de ella) queda
// con su centro tras el punto donde dará la punta.
async function parry({ receiver, aim, clock, untilImpact }) {
  const r = receiver.piece;
  await clock.wait(Math.max(0, untilImpact - PARRY_LEAD));
  const centro = aim.point.clone().addScaledVector(aim.u, PARRY_BEHIND);
  const cara = aim.u.clone().negate(); // hacia quien pega
  const escudo = new THREE.Vector3();
  const mano = new THREE.Vector3();
  const total = PARRY_LEAD + PARRY_HOLD + PARRY_LOWER;
  const suave = (x) => x * x * (3 - 2 * x);
  await clock.tween(total, (t) => {
    const s = t * total;
    const w = s < PARRY_RAISE ? suave(s / PARRY_RAISE)
      : s < PARRY_LEAD + PARRY_HOLD ? 1
        : suave(Math.max(0, 1 - (s - PARRY_LEAD - PARRY_HOLD) / PARRY_LOWER));
    r.faceShield(cara, w);
    const brazo = r.armPoints().left;
    if (!brazo || !r.shieldCenter(escudo)) return;
    // Lo que va de la mano al centro del escudo ahora; la mano, ahí menos eso.
    mano.copy(centro).sub(escudo.sub(brazo.hand));
    r.reachArms({ left: { target: mano, pole: PARRY_POLE } }, w);
  });
  r.reachArms(null);
  r.faceShield(null);
}

async function strike({ hitter, receiver, beat, style, spots, clock, fx, cinema, hud }) {
  const h = hitter.piece;
  const r = receiver.piece;
  const measure = h.strikes[beat.key];
  const impact = style === 'duel' ? measure.spear : measure.body;
  // En el duelo, la estocada que no es la última la para quien la recibe, si lleva escudo.
  const parada = style === 'duel' && !beat.final && Boolean(r.props.shield);
  const aim = style === 'duel' ? aimThrust({ hitter, receiver, measure, parry: parada }) : null;
  if (style === 'duel') {
    // Antes de la estocada, aún quieto, apunta la lanza al rival y la hace resbalar en la mano. Si
    // girara y resbalara ya atacando, la punta atravesaría al rival y, al agacharse, el regatón se
    // hundiría en el suelo.
    h.setSpearPose('forward');
    h.aimSpear(aim?.point ?? null);
    h.setGripSlide(aim ? aim.slide : gripSlideForReach({ reach: measure.spear.reach, distance: spots.distance }));
    await clock.wait(GRIP_SETTLE);
  }
  const lead = Math.max(0, impact.t - STRIKE_LEAD);
  const attack = h.playOnce('attack', { clip: beat.key, fade: 0.15, from: lead });
  const hasta = impact.t - lead; // lo que falta para el golpe

  if (!beat.final) {
    const defensa = parada && aim ? parry({ receiver, aim, clock, untilImpact: hasta }) : null;
    await clock.wait(hasta);
    sfx.play(style === 'duel' ? 'escudo' : 'punetazo', { volume: 0.8 });
    fx.burst(impactPoint(hitter, measure, style), { size: 0.55, sparks: 12 });
    cinema.shake(0.07);
    // Parada: el escudo aguanta y a él solo le empuja un poco; si no, encaja el golpe.
    const reaction = defensa
      ? knockBack({ clock, figure: r.figure, u: aim.u, distance: PARRY_PUSH, seconds: 0.18 })
      : r.playOnce('hit', { fade: 0.08 });
    await clock.hold(HIT_STOP);
    await Promise.all([attack, reaction, defensa]);
    h.aimSpear(null);
    // Baja el arma y, con la lanza ya erguida, vuelve a subirla en la mano: si resbalara antes, con
    // la lanza aún de punta, saldría disparada hacia el rival.
    if (style === 'duel') h.setSpearPose(null);
    h.play('idle', { fade: 0.25 });
    r.play('idle', { fade: 0.25 });
    await clock.wait(RECOVER);
    h.setGripSlide(-COMBAT_RAISE);
    await clock.wait(0.25);
    return;
  }

  // Golpe final: cámara lenta, destello, empujón y derrota.
  await clock.wait(Math.max(0, hasta - SLOW_BEFORE));
  clock.timeScale = SLOW_MOTION;
  await clock.wait(Math.min(SLOW_BEFORE, hasta));
  fx.burst(impactPoint(hitter, measure, style), { size: 1, sparks: 26 });
  sfx.play(style === 'duel' ? 'escudo' : 'punetazo', { rate: 0.85 });
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
  h.aimSpear(null);
  if (style === 'duel') h.setSpearPose(null);
  h.play('idle', { fade: 0.3 });
  await clock.wait(RECOVER);
  h.setGripSlide(-COMBAT_RAISE);
}

// Un empujón corto, en la dirección `u` (horizontal, unitaria).
function knockBack({ clock, figure, u, distance, seconds }) {
  const start = figure.position.clone();
  return clock.tween(seconds, (t) => {
    const k = 1 - (1 - t) ** 2;
    figure.position.set(start.x + u.x * distance * k, start.y, start.z + u.z * distance * k);
  });
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
  // Del lado de la lanza del atacante: del del escudo, el escudo tapaba la estocada.
  const framing = cinema.frame(clock, spots.attacker, spots.defender, obstacles, { favor: rightOf(spots.attackerFacing) });
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
    defender.mover.turnTo(spots.defenderFacing, 0.3),
  ]);
  // El atacante hace girar la lanza sobre el puño mientras provoca: un molinete no sirve para nada
  // en una pelea, y por eso mismo se hace —es decirle al otro que tiene tiempo de sobra.
  const opening = [framing, twirl(a, { clock, turns: TWIRL_TURNS, seconds: TWIRL_SECONDS })];
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
  // La celebración, con la cámara delante en primer plano (y otro molinete para rematar, frenando:
  // acaba la vuelta con la lanza quieta y erguida).
  a.setSpearPose(null);
  a.setGripSlide(0);
  await victoryLap({ entry: attacker, clock, cinema, obstacles, move: () => attacker.mover.walkOnto(target) });
  a.setSpearDefault(null);
}
