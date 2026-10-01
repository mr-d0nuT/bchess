import * as THREE from 'three';
import { sfx } from '../../audio/sfx.js';
import { QUEEN, armsDown } from '../../pieces/cast.js';
import { afterImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { shout, victoryLap } from '../knight/common.js';
import { charring } from '../burn.js';
import { chestOf, faceAttacker, horseBolts, pose, poseTo, rebote, release, stepDown, suave, victimOf } from './royal.js';

// LA REINA NEGRA QUEMA. La blanca hiela, y el hielo en la negra no pegaba: el rojo de su bando es el
// del fuego. Hace el mismo gesto que la blanca —las dos son reinas, se plantan lejos y conjuran con
// las manos—, pero lo que se le junta en ellas son llamas. Las lanza en dos bolas de fuego que caen
// sobre el rival, que arde en una hoguera, se va quedando negro como un tizón y al final se deshace
// en ceniza.
//
// Hueso a hueso, como el andar: su modelo no trae ni una animación.

const REACH = 2.05; // se queda LEJOS: una reina no se pelea, sentencia desde su sitio
const GAP = 0.35;
const SUMMON_SECONDS = 0.8; // lo que tarda en alzar las manos
const CHARGE_SECONDS = 0.8; // y lo que tarda el fuego en prenderle en ellas
const CAST_SECONDS = 0.18; // el latigazo de los brazos al frente
const FLIGHT_SECONDS = 0.42; // lo que tardan las bolas de fuego en llegar
const BURN_SECONDS = 1.7; // lo que dura la hoguera
const CHAR_SECONDS = 1.0; // lo que tarda el rival en quedarse negro
const CRUMBLE_SECONDS = 0.45; // y en deshacerse en ceniza
const RECOVER_SECONDS = 0.55;
const FIRE = '#ff8a2a'; // el color de la carga en las manos
const GLOW = 0.1; // cuánto brillan: poco, que un tizón es negro y lo que luce son las vetas

export const queenBurns = {
  matches: (attacker) => attacker.kind === 'queen' && attacker.color === 'black',
  can: (attacker) => attacker.piece.armDrop >= 0,

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, bubbles, obstacles, bodies }) {
    const queen = attacker.piece;
    const reposo = armsDown(queen.armDrop || 0);
    const lejos = Math.max(REACH, queen.radius + defender.piece.radius + GAP);
    const spots = strikeSpot(home, center, { reach: lejos, torso: 0 });
    const mano = (lado) => () => {
      const bone = queen.object.getObjectByName(lado === 'L' ? 'mixamorigLeftHand' : 'mixamorigRightHand');
      return (bone ?? queen.figure).getWorldPosition(new THREE.Vector3());
    };

    try {
      // 1. La cámara encuadra, el rival baja a plantarle cara y ella se acerca lo justo.
      await Promise.all([
        cinema.frame(clock, home, center, obstacles),
        stepDown(defender, center),
      ]);
      await faceAttacker(defender, center, home);
      await attacker.mover.descend(home);
      await attacker.mover.walkTo(spots.attacker);
      await attacker.mover.turnTo(spots.attackerFacing, 0.25);

      // 1b. Si enfrente hay un caballero, el caballo se encabrita, lo tira al suelo y huye. El
      //     conjuro no cae hasta que el animal ha salido del tablero.
      await horseBolts(defender, center, home);

      // 2. Alza las manos y le prenden en ellas unas llamas que van creciendo.
      await poseTo(queen, reposo, QUEEN.summon, { clock, seconds: SUMMON_SECONDS, ease: suave });
      for (const lado of ['L', 'R']) {
        fx.charge(mano(lado), { seconds: CHARGE_SECONDS, color: FIRE, size: 0.24, motes: 12 });
        fx.flame(mano(lado), { seconds: CHARGE_SECONDS + CAST_SECONDS, size: 0.3 });
      }
      const magia = sfx.play('conjuro');
      await clock.wait(CHARGE_SECONDS);

      // 3. Lanza las manos al frente y el fuego sale de cada una en una bola, que caen sobre el rival.
      await poseTo(queen, QUEEN.summon, QUEEN.cast, { clock, seconds: CAST_SECONDS, ease: rebote });
      const victima = victimOf(defender);
      const pecho = chestOf(defender);
      magia?.stop(0.2);
      sfx.play('fuego');
      fx.fireball(mano('L')(), pecho, { seconds: FLIGHT_SECONDS, arc: 0.3 });
      fx.fireball(mano('R')(), pecho, { seconds: FLIGHT_SECONDS * 1.1, arc: 0.45 });
      await clock.wait(FLIGHT_SECONDS * 1.1);

      // 4. Arde: una hoguera lo envuelve y se va quedando negro, con las ascuas brillándole encima.
      const alto = (victima.height ?? defender.piece.height) * 1.05;
      const pies = victima.figure.getWorldPosition(new THREE.Vector3());
      const ancho = Math.min(0.45, Math.max(0.28, defender.piece.radius * 0.8));
      fx.burst(pecho, { size: 1.3, sparks: 28 });
      fx.blaze(pies, { height: alto, radius: ancho, seconds: BURN_SECONDS });
      hud.flash();
      cinema.shake(0.15);
      shout(bubbles, '¡FUUUSH!', pecho);
      sfx.play('fuego', { rate: 0.75 }); // la hoguera prende
      const quieto = victima.play?.('idle', { fade: 0.1 });
      const quema = charring(victima.figure);
      await clock.tween(CHAR_SECONDS, (t) => {
        quema(suave(t), GLOW * (1 + 0.6 * Math.sin(t * 47) * Math.sin(t * 13)));
      });
      if (quieto) quieto.paused = true; // tieso, hecho un tizón

      // 5. Se deshace en ceniza: se desploma sobre sus pies mientras cae la ceniza.
      fx.ashes(pies, { height: alto, radius: ancho });
      const escala = victima.figure.scale.clone();
      await clock.tween(CRUMBLE_SECONDS, (t) => {
        const k = t * t;
        victima.figure.scale.set(escala.x * (1 + 0.25 * k), escala.y * Math.max(0.05, 1 - k), escala.z * (1 + 0.25 * k));
        quema(1, GLOW * (1 - t));
      });
      victima.figure.visible = false;
      victima.figure.scale.copy(escala);
      await afterImpact(clock);

      // 6. Baja los brazos sin despeinarse; del rival no queda más que un montón de ceniza.
      await Promise.all([
        poseTo(queen, QUEEN.cast, reposo, { clock, seconds: RECOVER_SECONDS, ease: suave }),
        defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish(),
      ]);
      bodies.length = 0;

      // 7. Y ocupa la casilla.
      await victoryLap({
        entry: attacker, clock, cinema, obstacles,
        move: () => attacker.mover.walkOnto(target),
      });
    } finally {
      clock.timeScale = 1;
      release(queen);
      pose(queen, reposo);
    }
  },
};
