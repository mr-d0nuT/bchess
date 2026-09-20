// Batallas del caballero (diseño en docs/superpowers/specs/2026-09-15-bchess-caballero-design.md,
// sección 7): cada captura en la que participa un caballero es un gag, con su fichero. Aquí se elige cuál
// toca y se prepara lo que comparten: el sitio que piden los luchadores (sus abanicos, los cuerpos
// tendidos y los trozos que salen volando) y la limpieza al terminar, pase lo que pase.

import { knightFightsKnight } from './knight-fights-knight.js';
import { knightRunsThroughPawn } from './knight-runs-through-pawn.js';
import { knightSweepsGiant } from './knight-sweeps-giant.js';
import { pawnKicksKnight } from './pawn-kicks-knight.js';

const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas
const BATTLES = [pawnKicksKnight, knightRunsThroughPawn, knightFightsKnight, knightSweepsGiant]; // una batalla por fichero

const battleFor = (attacker, defender) => BATTLES.find((battle) => battle.matches(attacker, defender)) ?? null;

export function canKnightBattle(attacker, defender) {
  const battle = battleFor(attacker, defender);
  return Boolean(battle?.can(attacker, defender));
}

// `obstacles` son los centros {x, z} de las demás piezas, para que la cámara no quede tapada.
export async function runKnightBattle({ attacker, defender, board, clock, fx, cinema, hud, crowd, dust, debris, bubbles, obstacles = [], random = Math.random }) {
  const stances = new Map(); // luchador → abanico de lo que hará en su puesto (`stanceOf`)
  const bodies = []; // cuerpos tendidos en el suelo
  const release = crowd.claim({
    owners: [attacker, defender],
    bodies: () => [
      ...[attacker, defender].flatMap((entry) => entry.mover.room?.({ stance: stances.get(entry) }) ?? []),
      ...bodies,
      ...debris.bodies(),
    ],
  });
  try {
    await battleFor(attacker, defender).run({
      attacker, defender, board, clock, fx, cinema, hud, crowd, dust, debris, bubbles, obstacles, random, stances, bodies,
      target: defender.mover.square,
      home: board.squareToWorld(attacker.mover.square),
      center: board.squareToWorld(defender.mover.square),
    });
  } finally {
    release();
    debris.clear();
    bubbles.clear();
  }
  await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
}
