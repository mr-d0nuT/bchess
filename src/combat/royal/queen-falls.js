import * as THREE from 'three';
import { sfx } from '../../audio/sfx.js';
import { QUEEN, armsDown } from '../../pieces/cast.js';
import { afterImpact, slowToImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { aimBlow, blowDistance, blowOf, bringUp, gapTo, playBlow, torsoOf } from '../blow.js';
import { facingTo, fighterOf, knockOut, shout, victoryLap } from '../knight/common.js';
import { ROYAL_COLOR, chestOf, fallClear, pose, poseTo, rebote, release, suave } from './royal.js';

// LA REINA, SORPRENDIDA. Se comen a la reina un peón, un caballero o una torre: con ellos no hay
// duelo de magia, así que la reina hace lo único que sabe —conjurar—, pero no le da tiempo. Baja de
// su peana, el otro se le planta delante, ella alza las manos y la energía se le junta en ellas…
// y él es más rápido. El golpe llega a cámara lenta justo cuando el conjuro está a punto, la magia le
// estalla en las manos y cae de espaldas, deshaciéndose en motas de su color. Antes, sin combate, se
// esfumaba sin más.
//
// Hueso a hueso, como sus conjuros: su modelo no trae ni una animación.

const SUMMON_SECONDS = 0.8; // lo que tarda en alzar las manos
const HEAD_START = 0.35; // lo que le da tiempo a conjurar antes de que él arranque el golpe
const FLING_SECONDS = 0.25; // los brazos, abiertos de golpe por el estallido

export const queenFalls = {
  matches: (attacker, defender) => defender.kind === 'queen' && ['pawn', 'knight', 'rook'].includes(attacker.kind),
  can: (attacker, defender) => defender.piece.armDrop >= 0 && Boolean(fighterOf(attacker))
    && Boolean(blowOf(fighterOf(attacker))),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, bubbles, bodies, obstacles, random }) {
    const queen = defender.piece;
    const fighter = fighterOf(attacker);
    const blow = blowOf(fighter);
    const facing = facingTo(center, home); // la reina mira al que viene
    const reposo = armsDown(queen.armDrop || 0);
    const color = ROYAL_COLOR[defender.color] ?? ROYAL_COLOR.white;
    const spots = strikeSpot(home, center, { reach: blowDistance({ defender, blow }), torso: 0 });
    const mano = (lado) => () => {
      const bone = queen.object.getObjectByName(lado === 'L' ? 'mixamorigLeftHand' : 'mixamorigRightHand');
      return (bone ?? queen.figure).getWorldPosition(new THREE.Vector3());
    };

    try {
      // 1. La cámara encuadra, la reina baja de su peana y se encara con el que viene.
      await Promise.all([
        cinema.frame(clock, home, center, obstacles),
        defender.mover.descend(center),
      ]);
      await defender.mover.turnTo(facing, 0.3);

      // 2. El otro se le planta delante: el caballero salta y desmonta, la torre despierta a su
      //    gigante, el peón baja de su peana.
      await bringUp(attacker, { at: spots.attacker, facing: spots.attackerFacing, random });
      // Con lanza, la pone de punta hacia ella antes de que empiece a conjurar.
      await aimBlow(fighter, blow, { clock, distance: gapTo(fighter, center), torso: torsoOf(defender) });

      // 3. Ella conjura: alza las manos, su sello se abre a sus pies y la energía se le junta en las
      //    manos, hasta el instante del golpe.
      const hastaGolpe = HEAD_START + blow.t;
      fx.sigil(queen.figure.getWorldPosition(new THREE.Vector3()), { radius: 0.8, seconds: hastaGolpe + 0.4, color, spin: 1.2 });
      const brazos = poseTo(queen, reposo, QUEEN.summon, { clock, seconds: SUMMON_SECONDS, ease: suave });
      fx.charge(mano('L'), { seconds: hastaGolpe, color, size: 0.3, motes: 10 });
      fx.charge(mano('R'), { seconds: hastaGolpe, color, size: 0.3, motes: 10 });
      const magia = sfx.play('conjuro');
      await clock.wait(HEAD_START);

      // 4. Pero él es más rápido: su golpe llega a cámara lenta, y la magia le estalla en las manos.
      const hitting = playBlow(fighter, blow);
      await slowToImpact(clock, blow.t);
      const donde = blow.point();
      fx.burst(donde, { size: 1.1, sparks: 26 });
      for (const lado of ['L', 'R']) fx.burst(mano(lado)(), { size: 0.8, sparks: 16 });
      fx.shockwave(center, { radius: 1.8, seconds: 0.5, color });
      hud.flash();
      cinema.shake(0.2);
      shout(bubbles, '¡ZAS!', donde);
      magia?.stop(0.05);
      sfx.play('punetazo');
      sfx.play('puf'); // la magia le estalla en las manos
      await brazos;
      const abiertos = poseTo(queen, QUEEN.summon, QUEEN.fling, { clock, seconds: FLING_SECONDS, ease: rebote });
      await afterImpact(clock);
      await Promise.all([hitting, abiertos]);
      fighter.play('idle', { fade: 0.3 });

      // 5. Cae de espaldas, hacia donde no estorbe, deshaciéndose en motas de su color, y se esfuma.
      fx.updraft(() => chestOf(defender), { seconds: 1.4, count: 34, color, radius: 0.45, height: 2.2 });
      await fallClear(defender, {
        clock, at: center, from: home, crowd, bodies, owners: [attacker, defender],
        rival: { ...fighter.figure.getWorldPosition(new THREE.Vector3()), radius: attacker.piece.radius },
      });
      await knockOut({ clock, fx, fighter: queen });
      await defender.mover.vanish();
      bodies.length = 0;

      // 6. El ganador ocupa la casilla y lo celebra.
      const ocupar = attacker.kind === 'knight'
        ? () => attacker.mover.mount(target)
        : () => attacker.mover.walkOnto(target);
      await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: ocupar });
    } finally {
      clock.timeScale = 1;
      release(queen);
      pose(queen, reposo);
    }
  },
};
