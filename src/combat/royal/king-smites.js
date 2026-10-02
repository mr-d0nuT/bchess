import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { t } from '../../i18n.js';
import { KING, armsDown } from '../../pieces/cast.js';
import { zapping } from '../burn.js';
import { twirl } from '../twirl.js';
import { strikeSpot } from '../plan.js';
import { boneOf, rightOf, shout, victoryLap } from '../knight/common.js';
import { ROYAL_COLOR, chestOf, faceAttacker, fallClear, golpe, horseBolts, ladeado, pose, poseTo, rebote, release, stepDown, suave, victimOf, wandTip } from './royal.js';

// EL REY LLAMA AL RAYO. Se planta delante y se luce: el báculo da cuatro vueltas de campana sobre su puño
// dejando un aro de luz. Luego lo alza al cielo con los dos brazos, arqueado y mirando arriba, y sobre el
// rival se junta una tormenta negra que se enciende por dentro mientras el tablero se queda a oscuras; de
// la joya, que chisporrotea, sale un hilo de luz hasta la nube. Entonces descarga el báculo contra el
// tablero y del cielo cae un rayo enorme sobre el rival, con trueno, fogonazo y temblor. El rival se
// electrocuta como en los dibujos —parpadea entre blanco y negro, rígido, temblando y soltando chispazos—,
// se queda chamuscado y humeando, y cae de espaldas como un tablón. Y el rey se ríe.
//
// La cámara cuenta la historia: se acerca al rey mientras hace el molinete, se echa atrás y abajo para ver
// la tormenta (un contrapicado: el rey crece), cierra el plano de golpe con el rayo y se va a la cara del
// que se electrocuta; al caer, vuelve a encuadrar a los dos.
//
// Sin una sola animación: el rey no trae ninguna (se exportó pelado, que cualquier clip le destrozaba la
// capa), así que todo va hueso a hueso con las posturas de `cast.js`. Antes era un bastonazo con un rayo
// de un píxel del báculo al pecho, y se veía pobre.

const REACH = 1.35; // lo cerca que se pone: lo justo para que el báculo llegue al suelo entre los dos
const GAP = 0.3;
const TWIRL_TURNS = 4; // vueltas de campana del báculo antes del conjuro
const TWIRL_SECONDS = 1;
const INVOKE_SECONDS = 0.75; // lo que tarda en alzar el báculo al cielo
const GATHER_SECONDS = 1.7; // lo que tarda la tormenta en juntarse, con él ahí arriba
const SMITE_SECONDS = 0.14; // el mazazo: tiene que ser CORTO, o no es un mazazo
const STAFF_DROP = 0.9; // lo que resbala el báculo por el puño al clavarlo (lo para el tablero)
const BOLT_SECONDS = 0.65; // lo que dura el rayo del cielo, con sus parpadeos
const ZAP_SECONDS = 1.2; // el calambre
const ZAP_RATE = 13; // parpadeos por segundo entre blanco y negro
const ZAP_SHAKE = 0.05; // lo que tiembla mientras (casillas)
const WIDE_HOLD = 0.3; // lo que aguanta el plano general con el rayo antes de irse a la cara del rival
const STUNNED_SECONDS = 0.45; // chamuscado y quieto, humeando, antes de caer
const RECOVER_SECONDS = 0.6;
const STORM_ABOVE = 0.9; // la nube, por encima de la cabeza del rival
const DARK = 0.45; // la luz que queda con la tormenta encima
const WAVE_RADIUS = 3.4; // la onda del rayo cruza media fila: se ha sentido en todo el tablero
const VANISH_DELAY = 0.8; // humeando en el suelo antes de esfumarse

export const kingSmites = {
  matches: (attacker) => attacker.kind === 'king',
  can: (attacker) => attacker.piece.armDrop > 0 || Boolean(attacker.piece.props?.spear),

  async run({ attacker, defender, board, home, center, target, clock, fx, cinema, hud, crowd, bubbles, obstacles, bodies }) {
    const king = attacker.piece;
    const reposo = armsDown(king.armDrop || 66);
    const lejos = Math.max(REACH, king.radius + defender.piece.radius + GAP);
    const spots = strikeSpot(home, center, { reach: lejos, torso: 0 });
    const color = ROYAL_COLOR[attacker.color] ?? ROYAL_COLOR.white;
    let tormenta = null;

    try {
      // 1. La cámara encuadra (del lado del báculo, que no lo tape el rey), el rival baja a plantarle
      //    cara y el rey se acerca.
      await Promise.all([
        cinema.frame(clock, home, center, obstacles, { favor: rightOf(spots.attackerFacing) }),
        stepDown(defender, center),
      ]);
      await faceAttacker(defender, center, home);
      await attacker.mover.descend(home);
      await attacker.mover.walkTo(spots.attacker);
      await attacker.mover.turnTo(spots.attackerFacing, 0.25);

      // 1b. Si enfrente hay un caballero, el caballo se encabrita, lo tira al suelo y huye. El
      //     conjuro no cae hasta que el animal ha salido del tablero.
      await horseBolts(defender, center, home);

      const victima = victimOf(defender);
      const alto = victima.height ?? defender.piece.height;
      const pies = victima.figure.getWorldPosition(new THREE.Vector3()).setY(0);
      const suyo = king.figure.getWorldPosition(new THREE.Vector3()).setY(0);
      const frente = pies.clone().sub(suyo).setY(0).normalize(); // del rey al rival
      const lado = cinema.side() ?? new THREE.Vector3(-frente.z, 0, frente.x);
      const punta = () => wandTip(king);
      const cabeza = () => boneOf(victima, 'Head')?.getWorldPosition(new THREE.Vector3()) ?? chestOf(defender);
      const nubeAlto = alto + STORM_ABOVE;

      // 2. EL MOLINETE, de cerca y de tres cuartos: el báculo da cuatro vueltas de campana sobre el puño,
      //    embalándose, y la joya va dejando un aro de luz; cada vuelta silba más.
      cinema.shot(clock, {
        look: suyo.clone().setY(king.height * 0.6),
        dir: ladeado(lado, frente, 0.75),
        box: { width: 1.4, height: king.height + 0.6 },
        rise: 0.3,
        seconds: 0.6,
      });
      fx.trail(punta, { seconds: TWIRL_SECONDS, color, size: 0.2, fade: 0.32 });
      fx.charge(punta, { seconds: TWIRL_SECONDS, color, size: 0.36, motes: 16 });
      const silbidos = (async () => {
        let antes = 0;
        for (let n = 0; n < TWIRL_TURNS; n++) {
          const cuando = Math.sqrt((n + 0.6) / TWIRL_TURNS) * TWIRL_SECONDS; // las vueltas se embalan
          await clock.wait(cuando - antes);
          antes = cuando;
          sfx.play('silbido', { volume: 0.45 + 0.12 * n, rate: 0.85 + 0.1 * n });
        }
      })();
      await twirl(king, { clock, turns: TWIRL_TURNS, seconds: TWIRL_SECONDS });
      await silbidos;

      // 3. LA INVOCACIÓN. La cámara se echa atrás y abajo, en contrapicado, para que quepan los dos y el
      //    cielo; el rey alza el báculo con los dos brazos, se abren los sellos —a sus pies, que invoca; a
      //    los del rival, que está sentenciado— y sobre el rival se junta la tormenta mientras se va la luz.
      const vertical = cinema.portrait; // en el móvil, más de tres cuartos: de lado solo caben desde lejos
      cinema.shot(clock, {
        look: suyo.clone().lerp(pies, 0.55).setY((nubeAlto + 0.8) / 2),
        dir: ladeado(lado, frente, vertical ? 0.9 : 0.2),
        box: { width: suyo.distanceTo(pies) * (vertical ? 0.65 : 1) + (vertical ? 1 : 1.5), height: nubeAlto + 1.4 },
        rise: -0.25,
        seconds: 1.1,
      });
      tormenta = fx.storm(pies, { height: nubeAlto, radius: 0.7 + defender.piece.radius * 0.5, seconds: GATHER_SECONDS, color, dark: DARK });
      const sellos = INVOKE_SECONDS + GATHER_SECONDS + 0.4;
      fx.sigil(suyo, { radius: 0.7, seconds: sellos, color, spin: 1.5 });
      fx.sigil(pies, { radius: 0.6, seconds: sellos, color, spin: -2.2 });
      const magia = sfx.play('conjuro');
      grita(attacker, 'grito');
      sfx.play('trueno', { volume: 0.3, rate: 0.75 }); // a lo lejos: se está nublando
      await poseTo(king, reposo, KING.invoke, { clock, seconds: INVOKE_SECONDS, ease: suave });

      // 4. Aguanta arriba: la joya se carga y chisporrotea, y de ella sale un hilo de luz hasta la nube.
      //    Justo antes del golpe, a cámara lenta.
      fx.charge(punta, { seconds: GATHER_SECONDS, color, size: 0.55, motes: 22 });
      fx.arcs(punta, { seconds: GATHER_SECONDS, radius: 0.13, height: 0.32, base: -0.16, color, every: 0.05, width: 0.8 });
      await clock.wait(GATHER_SECONDS * 0.45);
      fx.lightning(punta, () => tormenta.center, { seconds: GATHER_SECONDS * 0.55, color, width: 0.45, branches: 0, kinks: 10, flicker: false, ground: false });
      sfx.play('rayo', { volume: 0.5, rate: 1.3 });
      await clock.wait(GATHER_SECONDS * 0.4);
      clock.timeScale = 0.35;
      await clock.wait(GATHER_SECONDS * 0.15);

      // 5. EL MAZAZO Y EL RAYO. El báculo contra el tablero, corto y seco, y en ese instante cae del cielo
      //    el rayo sobre el rival: fogonazo, trueno, temblor y el plano que se cierra de golpe.
      king.setGripSlide?.(STAFF_DROP); // y el báculo resbala por el puño hasta clavarse en el tablero
      await poseTo(king, KING.invoke, KING.smite, { clock, seconds: SMITE_SECONDS, ease: golpe });
      clock.timeScale = 1;
      magia?.stop(0.08);
      const joya = punta();
      fx.shockwave(joya.clone().setY(0.02), { radius: 1.4, seconds: 0.4, color });
      fx.lightning(tormenta.center.clone().setY(nubeAlto - 0.1), pies, { seconds: BOLT_SECONDS, color, width: 1.5 + defender.piece.radius * 0.6, jag: 1.8 });
      tormenta.strike(1);
      fx.shockwave(pies.clone().setY(0.02), { radius: WAVE_RADIUS, seconds: 0.6, color });
      fx.burst(chestOf(defender), { size: 1.1, sparks: 44 });
      hud.flash();
      cinema.shake(0.32);
      cinema.punch(0.14);
      shout(bubbles, t('burbuja.basta'), joya);
      sfx.play('punetazo', { rate: 0.6 }); // el báculo contra el tablero
      sfx.play('trueno');
      sfx.play('rayo');
      grita(defender, 'dolor');

      // 6. EL CALAMBRE, en primer plano: rígido, parpadeando entre blanco y negro, temblando y soltando
      //    chispazos. (El plano general aguanta un momento, que el rayo se vea entero.)
      victima.freeze?.(true);
      const calambre = zapping(victima.figure);
      calambre(1, 0);
      await clock.wait(WIDE_HOLD);
      cinema.shot(clock, {
        look: pies.clone().setY(alto * 0.58),
        dir: ladeado(lado, frente, -0.8),
        box: { width: 1.3, height: alto + 0.55 },
        rise: 0.35,
        seconds: 0.4,
        ease: rebote,
      });
      const sitio = victima.figure.position.clone();
      const giro = victima.figure.rotation.clone();
      fx.arcs(pies, { seconds: ZAP_SECONDS, radius: Math.max(0.24, defender.piece.radius * 0.75), height: alto * 0.95, color, every: 0.045, width: 1.3, count: 4 });
      let chispas = 0;
      await clock.tween(ZAP_SECONDS, (k) => {
        const blanco = Math.floor(k * ZAP_SECONDS * ZAP_RATE) % 2 === 0;
        calambre(blanco ? 1 : 0, blanco ? 0 : 0.92);
        const tiembla = ZAP_SHAKE * (1 - k * 0.5);
        victima.figure.position.set(sitio.x + (Math.random() - 0.5) * tiembla, sitio.y + Math.random() * tiembla * 0.6, sitio.z + (Math.random() - 0.5) * tiembla);
        victima.figure.rotation.set(giro.x + (Math.random() - 0.5) * tiembla * 1.6, giro.y, giro.z + (Math.random() - 0.5) * tiembla * 1.6);
        if (k * 5 >= chispas + 1) {
          chispas += 1;
          fx.burst(cabeza().lerp(pies, Math.random() * 0.6), { size: 0.45, sparks: 10 });
          if (chispas === 2) sfx.play('rayo', { volume: 0.7, rate: 1.15 });
        }
      });
      victima.figure.position.copy(sitio);
      victima.figure.rotation.copy(giro);

      // 7. Negro como un tizón, con las ascuas latiéndole muy flojo por dentro y echando humo; se queda un
      //    instante así, quieto, y cae de espaldas, tieso como un tablón. La cámara vuelve a los dos y el
      //    rey se ríe.
      fx.smoke(cabeza, { seconds: STUNNED_SECONDS + 2.2, every: 0.05, size: 0.26, rise: 1.1, color: '#6a645e', opacity: 0.85, spread: 0.2 });
      fx.smoke(() => chestOf(defender), { seconds: STUNNED_SECONDS + 1.2, every: 0.09, size: 0.3, rise: 0.9, color: '#575049', opacity: 0.7, spread: 0.35 });
      const latido = (edad) => 0.02 + 0.014 * Math.sin(edad * 9);
      calambre(0, 0.96, latido(0));
      await clock.tween(STUNNED_SECONDS, (k) => calambre(0, 0.96, latido(k * STUNNED_SECONDS)));
      cinema.free();
      tormenta.clear(1.4);
      grita(defender, 'ay', { volume: 0.8 }); // un «ay» flojito, de tizón
      await Promise.all([
        fallClear(defender, {
          clock, at: center, from: home, crowd, bodies, owners: [attacker, defender],
          rival: { ...king.figure.position, radius: king.radius },
        }),
        poseTo(king, KING.smite, reposo, { clock, seconds: RECOVER_SECONDS, ease: suave }),
      ]);
      king.setGripSlide?.(0);
      cinema.shake(0.12);
      grita(attacker, 'risa');
      await clock.wait(VANISH_DELAY);
      await (defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish());
      bodies.length = 0; // ya no hay cuerpo que estorbe

      // 8. El rey ocupa la casilla.
      await victoryLap({
        entry: attacker, clock, cinema, at: center, obstacles,
        move: () => attacker.mover.walkOnto(target),
      });
    } finally {
      clock.timeScale = 1;
      king.setGripSlide?.(0);
      tormenta?.clear(0);
      cinema.free();
      release(king);
      pose(king, reposo);
    }
  },
};
