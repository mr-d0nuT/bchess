import * as THREE from 'three';
import { sfx } from '../../audio/sfx.js';
import { GRIP_SPEED } from '../../pieces/piece.js';
import { afterImpact, slowToImpact, stanceOf } from '../fight.js';
import {
  BODY_GAP, bonePosition, COMBAT_RAISE, facingTo, knockOut, lyingBody, PAWN_BODY, postOf, rightOf, shout, victoryLap,
} from './common.js';

// Caballero come peón sin bajarse del caballo: la carga con la lanza, como en una justa (lo pidió el usuario,
// que para eso lleva lanza). El peón baja de su peana, se encara y se cubre con el escudo. El caballero da
// media vuelta y se aleja al trote para tomar carrerilla; se vuelve, calza la lanza bajo el brazo y el
// caballo escarba, impaciente. Entonces carga al galope, levantando polvo. A cámara lenta la punta revienta
// contra el escudo: el peón sale volando de espaldas, cae con estrellitas y se esfuma. El caballo sigue un
// trecho, frenando, y el caballero se planta en la casilla.
//
// Antes retrocedía al paso sin darse la vuelta (poco más de una casilla), calzaba la lanza en el último
// momento y «cargaba» otro tanto: más que una embestida, un caballo dando unos pasos. Y la cámara se ponía del
// lado del escudo del jinete, con la lanza escondida detrás del caballo: ahora, del lado de la lanza.

const RUN_UP = 3.3; // de la casilla del peón a la salida de la carga, si el tablero da para tanto
const BOARD = 3.8; // lo más lejos del centro del tablero que llega al tomar carrerilla
const TROT = 1.7; // casillas por segundo al alejarse
const TURN_SECONDS = 0.6; // al volverse de cara al peón
const PAW_SECONDS = 0.8; // el caballo escarba, impaciente, con la lanza ya calzada
const PAW_REAR = 0.16; // radianes que se levanta al escarbar
const GALLOP = 3.4; // casillas por segundo en la carga
const BITE = 0.12; // lo que se hunde la punta
const DUST_EVERY = 0.14; // segundos entre polvaredas de los cascos en la carga
const DUST_BEHIND = 0.35; // salen de los cascos de atrás, no de debajo de la barriga
const FLY = 1.3; // lo que sale volando el peón
const FLY_UP = 0.55; // y lo alto
const FLY_SECONDS = 0.6;
const FOLLOW = 0.6; // lo que sigue el caballo tras el golpe, frenando
const FOLLOW_SECONDS = 0.45;
const GUARD = 60; // grados que sube el peón el brazo del escudo para cubrirse
const DUST_Y = 0.05;

// Dónde queda la punta de la lanza respecto a la figura del caballo, con la lanza ya calzada: lo que
// asoma por delante (`ahead`) y lo que queda a un lado (`side`, positivo hacia la izquierda del caballo).
function lanceTip(knight, rider, facing) {
  const tip = rider.props.spear.localToWorld(new THREE.Vector3(0, rider.spearEnds.top, 0));
  const dx = tip.x - knight.figure.position.x;
  const dz = tip.z - knight.figure.position.z;
  return { ahead: dx * Math.sin(facing) + dz * Math.cos(facing), side: dx * Math.cos(facing) - dz * Math.sin(facing) };
}

// Hasta dónde puede alejarse de `center` en la dirección contraria a `away` sin salirse del tablero.
function roomBehind(center, away) {
  let most = Infinity;
  for (const axis of ['x', 'z']) {
    if (away[axis] > 1e-6) most = Math.min(most, (center[axis] + BOARD) / away[axis]);
    if (away[axis] < -1e-6) most = Math.min(most, (center[axis] - BOARD) / away[axis]);
  }
  return most;
}

export const knightLancesPawn = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'pawn',
  can: (attacker, defender) => Boolean(attacker.piece.rider.props.spear) && attacker.piece.mounted
    && (defender.piece.has('fall') || defender.piece.has('defeat')),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, dust, bubbles, stances, bodies, obstacles }) {
    const knight = attacker.piece;
    const { rider } = knight;
    const pawn = defender.piece;
    const facing = facingTo(home, center); // el caballero, hacia el peón
    const away = { x: Math.sin(facing), z: Math.cos(facing) };

    // La salida de la carga: por la línea que une al peón con la casilla del caballero, alejándose todo lo
    // que dé el tablero (y nunca menos que su casilla, que ya está a un salto de caballo).
    const desdeCasa = Math.hypot(home.x - center.x, home.z - center.z);
    const carrera = Math.max(desdeCasa, Math.min(RUN_UP, roomBehind(center, away)));
    const salida = { x: center.x - away.x * carrera, z: center.z - away.z * carrera };

    // 1. La cámara encuadra desde el lado de la lanza, el peón baja de su peana, se encara y se cubre con
    //    el escudo, y el caballero deja la suya.
    stances.set(attacker, stanceOf(postOf(attacker, home, facing, [])));
    pawn.setSpearDefault('upright');
    pawn.setGripSlide(-COMBAT_RAISE);
    await Promise.all([
      cinema.frame(clock, salida, center, obstacles, { favor: rightOf(facing) }),
      defender.mover.descend(center),
      defender.mover.turnTo(facing + Math.PI, 0.3),
      attacker.mover.leavePedestal(),
    ]);
    const cover = clock.tween(0.35, (t) => pawn.turnBone('L_Upperarm', { x: -GUARD * t }));

    // 2. Carrerilla: media vuelta, al trote hasta la salida, y otra vez de cara al peón.
    if (Math.hypot(salida.x - home.x, salida.z - home.z) > 0.2) {
      await attacker.mover.chargeTo(salida, { seconds: Math.hypot(salida.x - home.x, salida.z - home.z) / TROT });
    }
    await attacker.mover.turnTo(facingTo(salida, center), TURN_SECONDS);
    await cover;

    // 3. Calza la lanza bajo el brazo y el caballo escarba, impaciente, levantando las manos.
    rider.setSpearPose('couch');
    const horse = knight.figure;
    const hoof = knight.mount?.hoofBack ?? 0.4;
    const baseY = horse.position.y;
    shout(bubbles, '¡A LA CARGA!', bonePosition(rider, 'Head'));
    sfx.play('relincho');
    await clock.tween(PAW_SECONDS, (t) => {
      const k = Math.sin(Math.PI * t) * (1 + 0.35 * Math.sin(6 * Math.PI * t)); // dos manotazos en el aire
      horse.rotation.x = -PAW_REAR * k;
      horse.position.y = baseY + hoof * Math.sin(PAW_REAR * k);
    });
    horse.rotation.x = 0;
    horse.position.y = baseY;

    // 4. La carga. Se para donde la punta se hunde BITE en el peón. Dos cosas tiran del sitio en que se
    //    para: el caballo, que es un animal entero por delante y no puede empotrarse en el peón, y la lanza,
    //    que tiene que llegar; cuando manda el caballo, la lanza sale de la mano lo que falte. Y como va
    //    calzada a un lado del caballo, se tuerce la carga lo justo para que por el centro del peón pase
    //    la punta, no el caballo.
    knight.object.updateMatrixWorld(true);
    const { side } = lanceTip(knight, rider, facingTo(salida, center));
    const from = { x: horse.position.x, z: horse.position.z };
    const lejos = Math.hypot(center.x - from.x, center.z - from.z);
    const directo = Math.atan2(center.x - from.x, center.z - from.z);
    const rumbo = directo - Math.asin(THREE.MathUtils.clamp(side / lejos, -1, 1));
    const dir = new THREE.Vector3(Math.sin(rumbo), 0, Math.cos(rumbo));
    const fondo = lejos * Math.cos(directo - rumbo); // lo que queda hasta el centro del peón, a lo largo de la carga
    await attacker.mover.turnTo(rumbo, 0.2);
    // Dónde toca la punta de verdad: un rayo desde la punta, en la dirección de la carga, contra el cuerpo
    // del peón (y su escudo, que es lo que se pone delante).
    knight.object.updateMatrixWorld(true);
    pawn.object.updateMatrixWorld(true);
    const tip0 = rider.props.spear.localToWorld(new THREE.Vector3(0, rider.spearEnds.top, 0));
    const cuerpo = [];
    const lanzaPeon = new Set();
    pawn.props.spear?.traverse((o) => lanzaPeon.add(o)); // su lanza, erguida y fina, no cuenta
    pawn.object.traverse((o) => { if (o.isMesh && o.visible && !lanzaPeon.has(o)) cuerpo.push(o); });
    const hit = new THREE.Raycaster(tip0, dir, 0, fondo + 1).intersectObjects(cuerpo, false)[0];
    const toca = hit?.distance ?? Math.max(0, (center.x - tip0.x) * dir.x + (center.z - tip0.z) * dir.z - PAWN_BODY);
    const cabe = fondo - (knight.radius + PAWN_BODY + BODY_GAP); // lo más que avanza el caballo sin empotrarse
    let recorrido = toca + BITE;
    if (recorrido > cabe) {
      const falta = recorrido - cabe;
      rider.setGripSlide(-falta);
      await clock.wait(falta / GRIP_SPEED + 0.05); // que acabe de resbalar antes de arrancar
      recorrido = cabe;
    }
    recorrido = Math.max(BITE + 1e-3, recorrido);
    const end = { x: from.x + dir.x * recorrido, z: from.z + dir.z * recorrido };
    let galopa = true;
    (async () => {
      while (galopa) {
        const atras = horse.rotation.y;
        dust.puff(new THREE.Vector3(horse.position.x - Math.sin(atras) * DUST_BEHIND, DUST_Y, horse.position.z - Math.cos(atras) * DUST_BEHIND), { count: 2, radius: 0.2, duration: 0.35 });
        await clock.wait(DUST_EVERY);
      }
    })();
    const charging = attacker.mover.chargeTo(end, { seconds: recorrido / GALLOP });
    const galope = sfx.play('galope');
    // Avanza a velocidad constante hasta `end`, donde la punta queda BITE dentro: toca BITE antes.
    await slowToImpact(clock, (recorrido - BITE) / GALLOP);
    const tip = rider.props.spear.localToWorld(new THREE.Vector3(0, rider.spearEnds.top, 0));
    fx.burst(tip, { size: 1.4, sparks: 34 });
    hud.flash();
    cinema.shake(0.26);
    shout(bubbles, '¡CATAPLÁN!', tip);
    sfx.play('embestida');
    pawn.throwSpear({ x: dir.x, z: dir.z });
    pawn.turnBone('L_Upperarm', null);
    pawn.play('idle', { fade: 0.1 });

    // 5. El peón sale volando de espaldas y cae tendido; el caballo sigue un trecho, frenando.
    const figura = pawn.figure;
    const desde = figura.position.clone();
    figura.rotation.order = 'YXZ';
    const giro0 = figura.rotation.x;
    const vuela = clock.tween(FLY_SECONDS, (t) => {
      figura.position.set(desde.x + dir.x * FLY * t, desde.y + 4 * FLY_UP * t * (1 - t), desde.z + dir.z * FLY * t);
      figura.rotation.x = giro0 + (-Math.PI / 2 - giro0) * t;
    });
    await Promise.all([afterImpact(clock), vuela, charging]);
    const sigue = { x: end.x + dir.x * FOLLOW, z: end.z + dir.z * FOLLOW };
    const frena = attacker.mover.chargeTo(sigue, { seconds: FOLLOW_SECONDS });
    const caido = { x: figura.position.x, z: figura.position.z };
    bodies.push(lyingBody({ at: caido, angle: Math.atan2(dir.x, dir.z), length: pawn.height }));
    dust.puff(new THREE.Vector3(caido.x, DUST_Y, caido.z), { count: 14, radius: 0.7, duration: 0.6 });
    sfx.play('caida'); // el peón, contra el tablero
    cinema.shake(0.12);
    await frena;
    galope?.stop(0.35);
    galopa = false;
    await knockOut({ clock, fx, fighter: pawn });
    await defender.mover.vanish();
    bodies.length = 0;

    // 6. El caballero recoge la lanza, se planta en la casilla y lo celebra desde la silla.
    rider.setSpearPose(null);
    rider.setGripSlide(0);
    pawn.setSpearDefault(null);
    stances.delete(attacker);
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.rideOnto(target) });
  },
};
