import * as THREE from 'three';
import { QUEEN, armsDown } from '../../pieces/cast.js';
import { afterImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { facingTo, knockOut, shout, victoryLap } from '../knight/common.js';
import { ROYAL_COLOR, chestOf, faceAttacker, fallClear, horseBolts, pose, poseTo, rebote, release, stepDown, suave, victimOf } from './royal.js';

// LA REINA CONJURA. No se acerca a pegar: se planta a distancia, abre los brazos y llama. Un sello
// enorme se abre a sus pies y otro sobre el rival; la energía se le junta en las dos manos, en
// espiral. Entonces lanza los brazos al frente y salen DOS rayos a la vez, uno de cada mano, que se
// clavan en el pecho del rival. El suelo se abre en ondas, al rival se lo llevan hacia arriba
// deshecho en motas y cae.
//
// Hueso a hueso, como el andar: su modelo no trae ni una animación.

const REACH = 2.05; // se queda LEJOS: una reina no se pelea, sentencia desde su sitio
const GAP = 0.35;
const SUMMON_SECONDS = 0.8; // lo que tarda en abrir los brazos
const CHARGE_SECONDS = 0.85; // y lo que se le junta la energía en las manos
const CAST_SECONDS = 0.18; // el latigazo de los brazos al frente
const BOLT_SECONDS = 0.5;
const HOLD_SECONDS = 0.45;
const RECOVER_SECONDS = 0.55;
const KO_SECONDS = 1;

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

      // 2. Abre los brazos y llama: su sello a los pies, y otro sobre el rival, que ya está
      //    sentenciado antes de que salga nada de las manos.
      const suyo = attacker.piece.figure.getWorldPosition(new THREE.Vector3());
      fx.sigil(suyo, { radius: 0.8, seconds: SUMMON_SECONDS + CHARGE_SECONDS + 0.5, color, spin: 1.2 });
      await poseTo(queen, reposo, QUEEN.summon, { clock, seconds: SUMMON_SECONDS, ease: suave });
      fx.sigil(center, { radius: 0.72, seconds: CHARGE_SECONDS + 0.9, color, spin: -1.8 });

      // 3. La energía se junta en las dos manos, y a cámara lenta antes de soltarla.
      fx.charge(mano('L'), { seconds: CHARGE_SECONDS, color, size: 0.34, motes: 12 });
      fx.charge(mano('R'), { seconds: CHARGE_SECONDS, color, size: 0.34, motes: 12 });
      await clock.wait(CHARGE_SECONDS * 0.55);
      clock.timeScale = 0.3;
      await clock.wait(CHARGE_SECONDS * 0.45);

      // 4. EL CONJURO. Los brazos salen disparados al frente y con ellos los dos rayos.
      await poseTo(queen, QUEEN.summon, QUEEN.cast, { clock, seconds: CAST_SECONDS, ease: rebote });
      clock.timeScale = 1;
      const pecho = chestOf(defender);
      for (const lado of ['L', 'R']) {
        const desde = mano(lado)();
        fx.bolt(desde, pecho, { seconds: BOLT_SECONDS, color, width: 0.055, kinks: 10 });
        fx.burst(desde, { size: 0.9, sparks: 16 });
      }
      hud.flash();
      cinema.shake(0.18);
      shout(bubbles, '¡FUERA!', pecho);

      // 5. Los rayos llegan: onda, fogonazo y el rival deshaciéndose hacia arriba.
      await clock.wait(BOLT_SECONDS * 0.45);
      fx.shockwave(center, { radius: 2.6, seconds: 0.6, color });
      fx.burst(pecho, { size: 1.7, sparks: 34 });
      fx.updraft(() => chestOf(defender), { seconds: 1.4, count: 40, color, radius: 0.5, height: 2.6 });
      cinema.shake(0.2);
      await afterImpact(clock);
      await clock.wait(HOLD_SECONDS);

      // 6. Cae, y ella baja los brazos sin despeinarse.
      await Promise.all([
        fallClear(defender, {
          clock, at: center, from: home, crowd, bodies, owners: [attacker, defender],
          rival: { ...attacker.piece.figure.position, radius: attacker.piece.radius },
        }),
        poseTo(queen, QUEEN.cast, reposo, { clock, seconds: RECOVER_SECONDS, ease: suave }),
      ]);
      await knockOut({ clock, fx, fighter: victimOf(defender), seconds: KO_SECONDS });
      await (defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish());
      bodies.length = 0; // ya no hay cuerpo que estorbe

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
