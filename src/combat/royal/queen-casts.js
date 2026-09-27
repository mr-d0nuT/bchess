import * as THREE from 'three';
import { QUEEN, armsDown } from '../../pieces/cast.js';
import { afterImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { facingTo, shout, victoryLap } from '../knight/common.js';
import { ROYAL_COLOR, chestOf, faceAttacker, horseBolts, pose, poseTo, rebote, release, stepDown, suave, victimOf } from './royal.js';

// LA REINA HIELA. El rey sentencia con el báculo —mazazo, rayo, onda y el rival llevado por los aires—;
// la reina, no: lo suyo es el frío, y se tenían que distinguir de un vistazo. No se acerca a pegar: se
// planta a distancia y alza las manos, y el frío se le junta en ellas. Entonces las lanza al frente y la
// escarcha corre por el suelo hasta el rival, le trepa por el cuerpo y lo encierra en cristal. Un
// instante quieto, congelado… y ella cierra las manos: el hielo estalla en esquirlas y el rival con él.
//
// Hueso a hueso, como el andar: su modelo no trae ni una animación.

const REACH = 2.05; // se queda LEJOS: una reina no se pelea, sentencia desde su sitio
const GAP = 0.35;
const SUMMON_SECONDS = 0.8; // lo que tarda en alzar las manos
const CHARGE_SECONDS = 0.7; // y lo que se le junta el frío en ellas
const CAST_SECONDS = 0.18; // el latigazo de los brazos al frente
const FROST_SECONDS = 0.45; // lo que tarda la escarcha en llegar al rival
const FREEZE_SECONDS = 0.7; // y en encerrarlo en hielo
const FROZEN_SECONDS = 0.55; // el rival congelado, quieto, antes de romperse
const SNAP_SECONDS = 0.12; // ella cierra las manos
const RECOVER_SECONDS = 0.55;

export const queenCasts = {
  matches: (attacker) => attacker.kind === 'queen',
  can: (attacker) => attacker.piece.armDrop >= 0,

  async run({ attacker, defender, board, home, center, target, clock, fx, cinema, hud, crowd, bubbles, obstacles, bodies }) {
    const queen = attacker.piece;
    const reposo = armsDown(queen.armDrop || 0);
    const lejos = Math.max(REACH, queen.radius + defender.piece.radius + GAP);
    const spots = strikeSpot(home, center, { reach: lejos, torso: 0 });
    const color = ROYAL_COLOR[attacker.color] ?? ROYAL_COLOR.white;
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

      // 2. Alza las manos y el frío se le junta en ellas.
      await poseTo(queen, reposo, QUEEN.summon, { clock, seconds: SUMMON_SECONDS, ease: suave });
      fx.charge(mano('L'), { seconds: CHARGE_SECONDS, color, size: 0.26, motes: 14 });
      fx.charge(mano('R'), { seconds: CHARGE_SECONDS, color, size: 0.26, motes: 14 });
      await clock.wait(CHARGE_SECONDS);

      // 3. Lanza las manos al frente y la escarcha corre por el suelo hasta el rival, le trepa por el
      //    cuerpo y lo encierra en cristal.
      await poseTo(queen, QUEEN.summon, QUEEN.cast, { clock, seconds: CAST_SECONDS, ease: rebote });
      const victima = victimOf(defender);
      const suyo = queen.figure.getWorldPosition(new THREE.Vector3());
      const pies = victima.figure.getWorldPosition(new THREE.Vector3());
      const vida = FROST_SECONDS + FREEZE_SECONDS + FROZEN_SECONDS + 1.2;
      fx.frost(suyo, pies, { seconds: vida, reach: FROST_SECONDS / vida, color });
      await clock.wait(FROST_SECONDS);
      const alto = (victima.height ?? defender.piece.height) * 1.05;
      const hielo = fx.encase(pies, { height: alto, radius: Math.min(0.42, Math.max(0.28, defender.piece.radius * 0.8)), seconds: FREEZE_SECONDS, color });
      await clock.wait(FREEZE_SECONDS * 0.6);
      const quieto = victima.play?.('idle', { fade: 0.1 }); // se queda helado a medio respirar
      await clock.wait(FREEZE_SECONDS * 0.4);
      if (quieto) quieto.paused = true;
      await clock.wait(FROZEN_SECONDS);

      // 4. Cierra las manos: el hielo estalla en esquirlas y el rival se rompe con él.
      await poseTo(queen, QUEEN.cast, QUEEN.summon, { clock, seconds: SNAP_SECONDS, ease: rebote });
      const pecho = chestOf(defender);
      hielo.shatter();
      victima.figure.visible = false;
      fx.burst(pecho, { size: 1.5, sparks: 32 });
      hud.flash();
      cinema.shake(0.2);
      shout(bubbles, '¡CRAC!', pecho);
      await afterImpact(clock);

      // 5. Baja los brazos sin despeinarse; del rival no queda nada.
      await Promise.all([
        poseTo(queen, QUEEN.summon, reposo, { clock, seconds: RECOVER_SECONDS, ease: suave }),
        defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish(),
      ]);
      bodies.length = 0;

      // 7. Y ocupa la casilla.
      await victoryLap({
        entry: attacker, clock, cinema, at: center, obstacles,
        move: () => attacker.mover.walkOnto(target),
      });
    } finally {
      clock.timeScale = 1;
      release(queen);
      pose(queen, reposo);
    }
  },
};
