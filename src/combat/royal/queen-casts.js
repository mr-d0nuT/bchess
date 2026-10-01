import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { creep } from '../../fx/creep.js';
import { QUEEN, armsDown } from '../../pieces/cast.js';
import { afterImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { facingTo, shout, victoryLap } from '../knight/common.js';
import { ROYAL_COLOR, chestOf, faceAttacker, horseBolts, pose, poseTo, rebote, release, stepDown, suave, victimOf } from './royal.js';

// LA REINA BLANCA HIELA. El rey sentencia con el báculo —mazazo, rayo, onda y el rival llevado por
// los aires—; la reina, no: lo suyo es el frío, y se tenían que distinguir de un vistazo. (La negra
// quema: `queen-burns.js`.) No se acerca a pegar: se planta a distancia y alza las manos; el frío se le
// junta en ellas, arremolinado, y el suelo se le escarcha a los pies. Entonces las lanza al frente y por el
// suelo corre una ola de picos de hielo, cada vez más grandes, hasta el rival. Al llegar, el rival se
// encoge, el hielo le trepa de los pies a la cabeza y un racimo de cristal brota a su alrededor y lo
// encierra. Un instante quieto, congelado… y ella cierra las manos: todo estalla en esquirlas, el rival
// con ellas, y nieva.
//
// Antes el rayo era un reguero de cristalitos que no se veía, el encierro un cilindro gris como de
// plástico y el rival seguía respirando dentro.
//
// Hueso a hueso, como el andar: su modelo no trae ni una animación.

const REACH = 2.05; // se queda LEJOS: una reina no se pelea, sentencia desde su sitio
const GAP = 0.35;
const SUMMON_SECONDS = 0.8; // lo que tarda en alzar las manos
const CHARGE_SECONDS = 0.7; // y lo que se le junta el frío en ellas
const CAST_SECONDS = 0.18; // el latigazo de los brazos al frente
const RAY_SECONDS = 0.6; // lo que tarda la ola de hielo en llegar al rival
const FLINCH_SECONDS = 0.35; // lo que se encoge el rival antes de quedarse helado
const FREEZE_SECONDS = 0.9; // lo que tarda el hielo en trepar por él y encerrarlo
const FROZEN_SECONDS = 0.7; // el rival congelado, quieto, antes de romperse
const ICE = '#dff4ff'; // la piel de hielo que le trepa
const ICE_EDGE = '#8fdcff'; // y su frente
const SNAP_SECONDS = 0.12; // ella cierra las manos
const RECOVER_SECONDS = 0.55;
const crece = (t) => 1 - (1 - t) ** 2;

export const queenCasts = {
  matches: (attacker) => attacker.kind === 'queen' && attacker.color !== 'black',
  can: (attacker) => attacker.piece.armDrop >= 0,

  async run({ attacker, defender, board, home, center, target, clock, fx, cinema, hud, crowd, rubble, bubbles, obstacles, bodies }) {
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

      // 2. Alza las manos y el frío se le junta en ellas, arremolinado; a sus pies se abre un sello de
      //    escarcha y se levanta vaho.
      const suyo = queen.figure.getWorldPosition(new THREE.Vector3());
      fx.sigil(suyo, { radius: 0.7, seconds: SUMMON_SECONDS + CHARGE_SECONDS + 0.5, color: ICE_EDGE, spin: 1.2 });
      fx.updraft(suyo.clone().setY(0.1), { seconds: SUMMON_SECONDS + CHARGE_SECONDS, count: 22, color: '#ffffff', radius: 0.55, height: 1.4 });
      await poseTo(queen, reposo, QUEEN.summon, { clock, seconds: SUMMON_SECONDS, ease: suave });
      fx.charge(mano('L'), { seconds: CHARGE_SECONDS, color: ICE_EDGE, size: 0.32, motes: 20 });
      fx.charge(mano('R'), { seconds: CHARGE_SECONDS, color: ICE_EDGE, size: 0.32, motes: 20 });
      const magia = sfx.play('conjuro');
      grita(attacker, 'grito');
      await clock.wait(CHARGE_SECONDS);

      // 3. Lanza las manos al frente y una ola de picos de hielo corre por el suelo hasta el rival.
      await poseTo(queen, QUEEN.summon, QUEEN.cast, { clock, seconds: CAST_SECONDS, ease: rebote });
      const victima = victimOf(defender);
      const pies = victima.figure.getWorldPosition(new THREE.Vector3());
      const vida = RAY_SECONDS + FLINCH_SECONDS + FREEZE_SECONDS + FROZEN_SECONDS + 1;
      const ola = fx.iceRay(suyo, pies, { seconds: RAY_SECONDS, life: vida, color: ICE_EDGE });
      magia?.stop(0.3);
      sfx.play('hielo_rayo');
      cinema.shake(0.06);
      await clock.wait(RAY_SECONDS);

      // 4. Le llega: se encoge, se queda helado y el hielo le trepa de los pies a la cabeza mientras un
      //    racimo de cristal brota a su alrededor y lo encierra.
      grita(defender, 'dolor');
      fx.shockwave(pies, { radius: 1.3, seconds: 0.45, color: ICE_EDGE });
      for (const clip of ['frightened', 'afraid']) {
        if (victima.hasClip?.('fidget', clip)) {
          victima.playOnce('fidget', { clip, fade: 0.1 });
          await clock.wait(FLINCH_SECONDS);
          break;
        }
      }
      victima.freeze?.(true);
      const alto = (victima.height ?? defender.piece.height) * 1.05;
      const piel = creep(victima.object, { color: ICE, edge: ICE_EDGE, roughness: 0.12, metalness: 0.3, keep: 0.6, grain: 0.12, band: 0.06, glow: 2 });
      const hielo = fx.encase(pies, { height: alto, radius: Math.min(0.46, Math.max(0.3, defender.piece.radius * 0.85)), seconds: FREEZE_SECONDS, color: ICE_EDGE });
      sfx.play('hielo_encierra');
      sfx.play('hielo', { volume: 0.7 });
      await clock.tween(FREEZE_SECONDS, (t) => { piel.level = -0.1 + (alto + 0.15) * crece(t); });
      piel.glow = 0.6;
      cinema.shake(0.08);
      await clock.wait(FROZEN_SECONDS);

      // 5. Cierra las manos: el hielo estalla en esquirlas, el rival se rompe con él en trozos de hielo, y
      //    nieva.
      await poseTo(queen, QUEEN.cast, QUEEN.summon, { clock, seconds: SNAP_SECONDS, ease: rebote });
      const pecho = chestOf(defender);
      hielo.shatter();
      ola.shatter();
      victima.figure.visible = false;
      rubble?.explode(pies.clone().setY(0.1), { color: ICE, count: 26, height: alto, force: 1.6, obstacles: () => crowd.obstacles([attacker, defender]) });
      fx.burst(pecho, { size: 1.15, sparks: 40 });
      fx.snow(pies, { seconds: 2.4, count: 50, radius: 1.3, height: 2.6 });
      hud.flash();
      cinema.shake(0.24);
      shout(bubbles, '¡CRAC!', pecho);
      sfx.play('hielo_rompe');
      await afterImpact(clock);

      // 6. Baja los brazos sin despeinarse; del rival no queda nada.
      await Promise.all([
        poseTo(queen, QUEEN.summon, reposo, { clock, seconds: RECOVER_SECONDS, ease: suave }),
        // Ya ha estallado: sin la nube de polvo de quien se esfuma (al caballero, su caballo ya se fue).
        defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : Promise.resolve(defender.piece.object.visible = false),
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
