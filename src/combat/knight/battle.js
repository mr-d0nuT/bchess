// Batallas del caballero (diseño en docs/superpowers/specs/2026-09-15-bchess-caballero-design.md,
// sección 7): cada captura en la que participa un caballero es un gag, con su fichero. Aquí se elige cuál
// toca y se prepara lo que comparten: el sitio que piden los luchadores (sus abanicos, los cuerpos
// tendidos y los trozos que salen volando) y la limpieza al terminar, pase lo que pase.

import { giantCrushesKnight } from './giant-crushes-knight.js';
import { knightFightsKnight } from './knight-fights-knight.js';
import { knightLancesPawn } from './knight-lances-pawn.js';
import { knightRunsThroughPawn } from './knight-runs-through-pawn.js';
import { knightSweepsGiant } from './knight-sweeps-giant.js';
import { pawnKicksKnight } from './pawn-kicks-knight.js';

const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas
const BATTLES = [pawnKicksKnight, knightRunsThroughPawn, knightLancesPawn, knightFightsKnight, knightSweepsGiant, giantCrushesKnight];

// Las que encajan con esta pareja y pueden hacerse ahora mismo. Cuando hay más de una (el caballero
// contra un peón puede atravesarlo a pie o cargar con la lanza sin bajarse), se echa a suertes.
const battlesFor = (attacker, defender) => BATTLES.filter((battle) => battle.matches(attacker, defender) && battle.can(attacker, defender));

export function canKnightBattle(attacker, defender) {
  return battlesFor(attacker, defender).length > 0;
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
  const options = battlesFor(attacker, defender);
  const battle = options[Math.floor(random() * options.length)] ?? options[0];
  try {
    await battle.run({
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
