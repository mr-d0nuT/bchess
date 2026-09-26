import * as THREE from 'three';
import { KING, armsDown } from '../../pieces/cast.js';
import { afterImpact } from '../fight.js';
import { twirl } from '../twirl.js';
import { strikeSpot } from '../plan.js';
import { facingTo, knockOut, shout, victoryLap } from '../knight/common.js';
import { ROYAL_COLOR, chestOf, faceAttacker, fallClear, golpe, horseBolts, pose, poseTo, release, stepDown, suave, victimOf, wandTip } from './royal.js';

// EL REY SENTENCIA. Se planta delante, levanta el báculo por encima de la cabeza y la joya se le
// enciende; el suelo se le abre en un sello de runas mientras carga. Entonces descarga el báculo
// contra el tablero: la onda sale disparada, un rayo salta de la joya al pecho del rival y el
// tablero entero tiembla. Al rival se lo llevan hacia arriba en motas y cae fulminado.
//
// Sin una sola animación: el rey no trae ninguna (se exportó pelado, que cualquier clip le
// destrozaba la capa), así que todo va hueso a hueso con las posturas de `cast.js`.

const REACH = 1.35; // lo cerca que se pone: lo justo para que el báculo llegue al suelo entre los dos
const GAP = 0.3;
const TWIRL_TURNS = 4; // vueltas de campana del báculo antes del conjuro
const TWIRL_SECONDS = 0.85;
const RAISE_SECONDS = 0.75; // lo que tarda en levantar el báculo
const CHARGE_SECONDS = 0.6; // y lo que lo aguanta arriba mientras la joya se carga
const SMITE_SECONDS = 0.16; // el mazazo: tiene que ser CORTO, o no es un mazazo
const HOLD_SECONDS = 0.35; // el báculo clavado en el suelo, después del golpe
const RECOVER_SECONDS = 0.5;
const BOLT_SECONDS = 0.4;
const WAVE_RADIUS = 3.4; // la onda cruza media fila: el golpe se ha sentido en todo el tablero
const KO_SECONDS = 1;

export const kingSmites = {
  matches: (attacker) => attacker.kind === 'king',
  can: (attacker) => attacker.piece.armDrop > 0 || Boolean(attacker.piece.props?.spear),

  async run({ attacker, defender, board, home, center, target, clock, fx, cinema, hud, crowd, bubbles, obstacles, bodies }) {
    const king = attacker.piece;
    const reposo = armsDown(king.armDrop || 66);
    const lejos = Math.max(REACH, king.radius + defender.piece.radius + GAP);
    const spots = strikeSpot(home, center, { reach: lejos, torso: 0 });
    const color = ROYAL_COLOR[attacker.color] ?? ROYAL_COLOR.white;

    try {
      // 1. La cámara encuadra, el rival baja a plantarle cara y el rey se acerca.
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

      // 2. EL MOLINETE. Antes de nada, el báculo da cuatro vueltas de campana sobre el puño,
      //    embalándose, y la joya va dejando el rastro: desde fuera es un anillo de chispas que se
      //    cierra alrededor del rey. Es puro alarde —no hace falta para el conjuro—, y por eso va
      //    antes de que se abra el sello: primero se luce, luego llama.
      const punta = () => wandTip(king);
      fx.charge(punta, { seconds: TWIRL_SECONDS, color, size: 0.34, motes: 14 });
      await twirl(king, { clock, turns: TWIRL_TURNS, seconds: TWIRL_SECONDS });
      cinema.shake(0.05);

      // 3. Levanta el báculo. Mientras sube, el sello se abre a sus pies y la joya empieza a cargar:
      //    la carga sigue a la punta, que se está moviendo.
      const suyo = attacker.piece.figure.getWorldPosition(new THREE.Vector3());
      fx.sigil(suyo, { radius: 0.62, seconds: RAISE_SECONDS + CHARGE_SECONDS + 0.4, color, spin: 1.5 });
      await poseTo(king, reposo, KING.raise, { clock, seconds: RAISE_SECONDS, ease: suave });

      // 4. Aguanta arriba mientras se carga, y a cámara lenta justo antes de soltarlo.
      fx.charge(punta, { seconds: CHARGE_SECONDS, color, size: 0.5, motes: 18 });
      await clock.wait(CHARGE_SECONDS * 0.6);
      clock.timeScale = 0.35;
      await clock.wait(CHARGE_SECONDS * 0.4);

      // 5. EL MAZAZO. Corto y seco; el tiempo vuelve a su sitio justo al caer.
      await poseTo(king, KING.raise, KING.smite, { clock, seconds: SMITE_SECONDS, ease: golpe });
      clock.timeScale = 1;
      const impacto = new THREE.Vector3(spots.attacker.x, 0, spots.attacker.z);
      const joya = punta();
      fx.shockwave(impacto, { radius: WAVE_RADIUS, seconds: 0.6, color });
      fx.burst(joya, { size: 1.5, sparks: 34 });
      hud.flash();
      cinema.shake(0.22);
      shout(bubbles, '¡BASTA!', joya);

      // 6. Y del báculo al pecho del rival: el rayo, su sello y las motas que se lo llevan.
      const pecho = chestOf(defender);
      fx.bolt(joya, pecho, { seconds: BOLT_SECONDS, color, width: 0.07, kinks: 11 });
      await clock.wait(BOLT_SECONDS * 0.5);
      fx.sigil(center, { radius: 0.78, seconds: 1.2, color, spin: -2.4 });
      fx.burst(pecho, { size: 1.6, sparks: 30 });
      fx.updraft(() => chestOf(defender), { seconds: 1.3, count: 34, color, radius: 0.45, height: 2.4 });
      cinema.shake(0.16);
      await afterImpact(clock);
      await clock.wait(HOLD_SECONDS);

      // 7. El rival cae fulminado y el rey se yergue.
      await Promise.all([
        fallClear(defender, {
          clock, at: center, from: home, crowd, bodies, owners: [attacker, defender],
          rival: { ...attacker.piece.figure.position, radius: attacker.piece.radius },
        }),
        poseTo(king, KING.smite, reposo, { clock, seconds: RECOVER_SECONDS, ease: suave }),
      ]);
      await knockOut({ clock, fx, fighter: victimOf(defender), seconds: KO_SECONDS });
      await (defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish());
      bodies.length = 0; // ya no hay cuerpo que estorbe

      // 8. El rey ocupa la casilla.
      await victoryLap({
        entry: attacker, clock, cinema, at: center, obstacles,
        move: () => attacker.mover.walkOnto(target),
      });
    } finally {
      clock.timeScale = 1;
      release(king);
      pose(king, reposo);
    }
  },
};
