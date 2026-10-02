import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { armsDown } from '../../pieces/cast.js';
import { createPistol } from '../../pieces/pistol.js';
import { FRENA } from '../twirl.js';
import { strikeSpot } from '../plan.js';
import { boneOf, knockOut, rightOf, shout, victoryLap } from '../knight/common.js';
import { chestOf, faceAttacker, fallClear, horseBolts, ladeado, pose, poseTo, rebote, release, stepDown, suave, victimOf } from './royal.js';

// EL REY DESENFUNDA. Lo pidió el usuario: «que saque una pistola y le pegue un par de disparos». Clava el
// báculo en el tablero a su lado y saca una pistola de chispa —el rival se queda con cara de «¿eh?»—, la
// hace girar sobre el dedo como un pistolero, la amartilla, apunta (la cámara, por encima de su hombro) y
// le pega dos tiros: fogonazo, humo, retroceso y «¡BANG!». Con cada uno el rival se sacude; con el segundo
// se tambalea y cae de espaldas, viendo estrellitas. El rey sopla el humo del cañón, se ríe, la enfunda y
// recoge su báculo.
//
// Sin animaciones, como el rayo: el rey no trae ninguna, así que va hueso a hueso con posturas medidas en su
// aparejo (+Y adelanta el brazo derecho, -Z lo sube, +X inclina el tronco hacia delante). La pistola no
// cuelga del hueso de la mano: cada fotograma se pone en el puño y se orienta en el mundo (apuntando al
// rival, o hacia arriba), que es lo que se ve; seguir los ejes del hueso la dejaba torcida.

const SHOOT_REACH = 1.9; // a qué distancia dispara, si viene de lejos (de cerca, desde donde está)
const GAP = 0.35;
const PISTOL_SIZE = 0.85; // a 1,3 se veía enorme y tapaba la mano entera
const DRAW_SECONDS = 0.45;
const TWIRL_TURNS = 2; // vueltas sobre el dedo
const TWIRL_SECONDS = 0.6;
const AIM_SECONDS = 0.35;
const STEADY_SECONDS = 0.5; // apuntando, quieto, antes del primer tiro
const BETWEEN_SECONDS = 0.55; // entre tiro y tiro
const RECOIL = 0.55; // radianes que la pistola levanta el cañón al disparar
const KICK_SECONDS = 0.07;
const SETTLE_SECONDS = 0.25;
const JERK = 0.22; // lo que se echa atrás el rival con cada tiro (radianes)
const JERK_SECONDS = 0.34;
const STAGGER_SECONDS = 0.55; // tras el segundo tiro, lo que se tambalea antes de caer
const KO_SECONDS = 0.9;
const BLOW_SECONDS = 1.1; // soplando el humo del cañón
const HOLSTER_SECONDS = 0.4;
// El báculo se clava a su IZQUIERDA, un poco por delante: a la derecha quedaba justo delante de la cámara
// que mira por encima de su hombro derecho. Va de la mano a su sitio en un vuelo corto.
const STAFF_ASIDE = 0.42;
const STAFF_AHEAD = 0.08;
const STAFF_TOSS_SECONDS = 0.2;

// Las posturas, encima de los brazos colgando.
const SHOW = { R_Arm: { z: 30, y: 50 }, R_ForeArm: { x: -70 }, Head: { x: 6 } }; // la pistola a la vista
const AIM = { R_Arm: { z: 5, y: 80 }, R_ForeArm: { x: -5 }, Spine: { x: -4 }, Head: { x: 2 } };
const KICK = { R_Arm: { z: -18, y: 78 }, R_ForeArm: { x: -28 }, Spine: { x: -9 }, Head: { x: -4 } };
// Soplando: la mano a la altura del pecho, a su derecha, y el cañón inclinado hacia la boca. Con la mano
// delante de la cara, el cañón se la tapaba y la boca del arma le quedaba por encima de la corona.
const BLOW = { R_Arm: { z: 60, y: 45 }, R_ForeArm: { x: -92 }, Head: { x: 12, y: -10 } };
const TOWARD_MOUTH = 0.45; // lo que se inclina el cañón hacia él cuando apunta al cielo

const brota = (t) => (t >= 1 ? 1 : 1 - (1 - t) ** 3 + Math.sin(Math.PI * t) * 0.25);

export const kingShoots = {
  matches: (attacker) => attacker.kind === 'king',
  can: (attacker) => Boolean(attacker.piece.props?.spear) && attacker.piece.armDrop > 0,

  async run({ attacker, defender, home, center, target, clock, fx, cinema, crowd, bubbles, obstacles, bodies }) {
    const king = attacker.piece;
    const reposo = armsDown(king.armDrop || 66);
    const con = (postura) => ({ ...reposo, ...postura });
    const lejos = Math.max(SHOOT_REACH, king.radius + defender.piece.radius + GAP);
    const spots = strikeSpot(home, center, { reach: lejos, torso: 0 });
    const pistola = createPistol();
    // `arriba`: de 0 (apuntando a `blanco`) a 1 (el cañón al cielo, la culata hacia él).
    const arma = { escala: 0, arriba: 1, blanco: new THREE.Vector3(), giro: 0, retroceso: 0 };
    let titere = null;
    let plantado = false;

    try {
      // 1. La cámara encuadra, el rival baja a plantarle cara y el rey se acerca, si viene de lejos.
      await Promise.all([
        cinema.frame(clock, home, center, obstacles, { favor: rightOf(spots.attackerFacing) }),
        stepDown(defender, center),
      ]);
      await faceAttacker(defender, center, home);
      await attacker.mover.descend(home);
      await attacker.mover.walkTo(spots.attacker);
      await attacker.mover.turnTo(spots.attackerFacing, 0.25);
      await horseBolts(defender, center, home);

      const victima = victimOf(defender);
      const alto = victima.height ?? defender.piece.height;
      const pies = victima.figure.getWorldPosition(new THREE.Vector3()).setY(0);
      const suyo = king.figure.getWorldPosition(new THREE.Vector3()).setY(0);
      const frente = pies.clone().sub(suyo).setY(0).normalize(); // del rey al rival
      const derecha = new THREE.Vector3(-frente.z, 0, frente.x); // la derecha del rey (+X es su izquierda)
      const lado = cinema.side() ?? derecha.clone();
      const mano = boneOf(king, 'R_Hand');
      const nudillos = boneOf(king, 'mixamorigRightHandMiddle1');

      // La pistola, cada fotograma en el puño: entre apuntando al rival y el cañón al cielo (con la culata
      // hacia él), y con su molinete y su retroceso encima.
      arma.blanco.copy(chestOf(defender));
      const guia = new THREE.Object3D();
      const puño = new THREE.Vector3();
      const dedos = new THREE.Vector3();
      const agarre = new THREE.Vector3();
      const apunta = new THREE.Quaternion();
      const alCielo = new THREE.Quaternion();
      const colocar = () => {
        // El puño: entre la muñeca (de donde sale el hueso de la mano) y los nudillos. Puesta en la
        // muñeca, la culata le tapaba la mano.
        (mano ?? king.figure).getWorldPosition(puño);
        if (nudillos) puño.lerp(nudillos.getWorldPosition(dedos), 0.55);
        guia.position.copy(puño);
        guia.up.set(0, 1, 0);
        guia.lookAt(arma.blanco);
        apunta.copy(guia.quaternion);
        guia.up.copy(frente);
        guia.lookAt(puño.x - frente.x * TOWARD_MOUTH, puño.y + 1, puño.z - frente.z * TOWARD_MOUTH);
        alCielo.copy(guia.quaternion);
        pistola.quaternion.slerpQuaternions(apunta, alCielo, arma.arriba);
        if (arma.giro) pistola.rotateX(arma.giro);
        if (arma.retroceso) pistola.rotateX(-arma.retroceso);
        const tam = Math.max(0.001, PISTOL_SIZE * arma.escala);
        pistola.scale.setScalar(tam);
        // Y la culata, dentro del puño: la pistola gira (molinete, retroceso) alrededor de ella.
        agarre.copy(pistola.userData.grip).multiplyScalar(tam).applyQuaternion(pistola.quaternion);
        pistola.position.copy(puño).sub(agarre);
      };
      const boca = () => pistola.localToWorld(pistola.userData.muzzle.clone());

      // 2. Clava el báculo a su derecha y desenfunda, de cerca: el rival se queda con cara de «¿eh?».
      cinema.shot(clock, {
        look: suyo.clone().setY(king.height * 0.62),
        dir: ladeado(lado, frente, 0.75),
        box: { width: 1.4, height: king.height + 0.5 },
        rise: 0.25,
        seconds: 0.6,
      });
      const desde = king.props.spear.getWorldPosition(new THREE.Vector3());
      const sitio = new THREE.Vector3(
        suyo.x - derecha.x * STAFF_ASIDE + frente.x * STAFF_AHEAD,
        0,
        suyo.z - derecha.z * STAFF_ASIDE + frente.z * STAFF_AHEAD,
      );
      plantado = true;
      await clock.tween(STAFF_TOSS_SECONDS, (t) => {
        const k = suave(t);
        king.plantSpear({ x: desde.x + (sitio.x - desde.x) * k, z: desde.z + (sitio.z - desde.z) * k });
      });
      sfx.play('punetazo', { volume: 0.45, rate: 0.8 }); // el regatón contra el tablero
      titere = fx.puppet(pistola, colocar);
      await Promise.all([
        poseTo(king, reposo, con(SHOW), { clock, seconds: DRAW_SECONDS, ease: rebote }),
        clock.tween(DRAW_SECONDS * 0.7, (t) => { arma.escala = brota(t); }),
      ]);
      grita(defender, 'huh'); // ¿eh? ¿una pistola?

      // 3. El molinete sobre el dedo, a lo pistolero, y la amartilla.
      sfx.play('silbido', { volume: 0.35, rate: 1.6 });
      await clock.tween(TWIRL_SECONDS, (t) => { arma.giro = FRENA(t) * Math.PI * 2 * TWIRL_TURNS; });
      arma.giro = 0;
      sfx.play('amartillar');

      // 4. Apunta. La cámara, por encima de su hombro derecho, mirando al rival.
      cinema.shot(clock, {
        look: chestOf(defender),
        dir: ladeado(frente.clone().negate(), derecha, 0.42),
        distance: suyo.distanceTo(pies) + 1.25,
        rise: 0.5,
        seconds: 0.5,
      });
      await Promise.all([
        poseTo(king, con(SHOW), con(AIM), { clock, seconds: AIM_SECONDS, ease: suave }),
        clock.tween(AIM_SECONDS, (t) => { arma.arriba = 1 - suave(t); }),
      ]);
      await clock.wait(STEADY_SECONDS);

      // 5. ¡BANG! Y ¡BANG!: fogonazo, humo, retroceso, y el rival se sacude con cada uno.
      const sacudida = () => {
        const figura = victima.figure;
        figura.rotation.order = 'YXZ';
        const x0 = figura.rotation.x;
        if (victima.has?.('hit')) victima.playOnce('hit', { fade: 0.06 });
        return clock.tween(JERK_SECONDS, (t) => {
          figura.rotation.x = x0 - JERK * Math.sin(Math.PI * Math.min(1, t * 1.6));
        });
      };
      const dispara = async (tiro) => {
        const desde = boca();
        const pecho = chestOf(defender).add(new THREE.Vector3((Math.random() - 0.5) * 0.12, (tiro - 0.5) * 0.12, 0));
        fx.burst(desde, { size: 0.55, sparks: 14 });
        fx.smoke(desde, { seconds: 0.18, every: 0.03, size: 0.12, rise: 0.4, life: 1, color: '#dcd8d0', opacity: 0.85, spread: 0.06 });
        fx.lightning(desde, pecho, { seconds: 0.07, width: 0.22, branches: 0, kinks: 1, flicker: false, ground: false, jag: 0, color: '#ffd27a' });
        fx.burst(pecho, { size: 0.5, sparks: 16 });
        sfx.play('disparo');
        cinema.shake(0.12);
        cinema.punch(0.08);
        shout(bubbles, '¡BANG!', desde);
        grita(defender, 'dolor');
        const sacude = sacudida();
        await Promise.all([
          poseTo(king, con(AIM), con(KICK), { clock, seconds: KICK_SECONDS, ease: rebote }),
          clock.tween(KICK_SECONDS, (t) => { arma.retroceso = RECOIL * t; }),
        ]);
        await Promise.all([
          poseTo(king, con(KICK), con(AIM), { clock, seconds: SETTLE_SECONDS, ease: suave }),
          clock.tween(SETTLE_SECONDS, (t) => { arma.retroceso = RECOIL * (1 - t); }),
          sacude,
        ]);
      };
      await dispara(0);
      await clock.wait(BETWEEN_SECONDS);
      // El segundo, y la cámara se va a la cara del rival.
      const ultimo = dispara(1);
      cinema.shot(clock, {
        look: pies.clone().setY(alto * 0.58),
        dir: ladeado(lado, frente, -0.8),
        box: { width: 1.3, height: alto + 0.5 },
        rise: 0.35,
        seconds: 0.35,
        ease: rebote,
      });
      await ultimo;

      // 6. Se tambalea, mira al rey sin creérselo y cae de espaldas, viendo estrellitas; el rey, sin dejar
      //    de apuntarle.
      const figura = victima.figure;
      const z0 = figura.rotation.z;
      await clock.tween(STAGGER_SECONDS, (t) => { figura.rotation.z = z0 + Math.sin(t * Math.PI * 3) * 0.07 * (1 - t); });
      figura.rotation.z = z0;
      cinema.free();
      grita(defender, 'caida');
      await fallClear(defender, {
        clock, at: center, from: home, crowd, bodies, owners: [attacker, defender],
        rival: { ...king.figure.position, radius: king.radius },
      });
      await knockOut({ clock, fx, fighter: victima, seconds: KO_SECONDS });

      // 7. Sopla el humo del cañón, de cerca, y se ríe.
      const cara = (boneOf(king, 'Head') ?? king.figure).getWorldPosition(new THREE.Vector3());
      cinema.shot(clock, {
        look: cara.setY(cara.y - 0.12),
        dir: ladeado(lado, frente, 0.85),
        box: { width: 0.9, height: 0.95 },
        rise: 0.12,
        seconds: 0.5,
      });
      await Promise.all([
        poseTo(king, con(AIM), con(BLOW), { clock, seconds: 0.45, ease: suave }),
        clock.tween(0.45, (t) => { arma.arriba = suave(t); }),
      ]);
      fx.smoke(boca, { seconds: BLOW_SECONDS, every: 0.07, size: 0.07, rise: 0.55, life: 1.1, color: '#e6e2dc', opacity: 0.7, spread: 0.02 });
      sfx.play('silbido', { volume: 0.2, rate: 0.55 }); // fff…
      await clock.wait(BLOW_SECONDS * 0.6);
      grita(attacker, 'risa');
      await clock.wait(BLOW_SECONDS * 0.4);

      // 8. La enfunda con otro molinete, recoge el báculo, y del rival no queda nada.
      sfx.play('silbido', { volume: 0.3, rate: 1.5 });
      await Promise.all([
        poseTo(king, con(BLOW), reposo, { clock, seconds: HOLSTER_SECONDS, ease: suave }),
        clock.tween(HOLSTER_SECONDS, (t) => {
          arma.giro = FRENA(t) * Math.PI * 2;
          arma.escala = 1 - t * t;
        }),
      ]);
      titere.remove();
      titere = null;
      king.holdSpear();
      plantado = false;
      cinema.free();
      await (defender.kind === 'knight' ? defender.mover.defeated({ avoid: center }) : defender.mover.vanish());
      bodies.length = 0;

      // 9. Y ocupa la casilla.
      await victoryLap({
        entry: attacker, clock, cinema, at: center, obstacles,
        move: () => attacker.mover.walkOnto(target),
      });
    } finally {
      clock.timeScale = 1;
      titere?.remove();
      if (plantado) king.holdSpear();
      cinema.free();
      release(king);
      pose(king, reposo);
    }
  },
};
