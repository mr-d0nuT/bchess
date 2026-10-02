import * as THREE from 'three';
import { grita } from '../../audio/voces.js';
import { sfx } from '../../audio/sfx.js';
import { creep } from '../../fx/creep.js';
import { afterImpact, slowToImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { WIND_UP, bonePosition, facingTo, shout, victoryLap, windUp } from '../knight/common.js';
import { batSwing } from './bat-swing.js';
import { ladeado } from '../royal/royal.js';

// El alfil se come a cualquiera (mismo espíritu de gag que las batallas del caballero). Baja de su peana,
// se acerca lo justo y conjura con la mano libre, el báculo en alto: la magia se le junta en la voluta y de
// ahí sale el rayo al pecho del rival. El rival se encoge de miedo y se queda así, quieto del todo, mientras
// la piedra le trepa de los pies a la cabeza con un frente de luz.
//
// Antes conjuraba con el clip de lanzar hechizos tal cual, que es para manos vacías: con el báculo en la
// derecha lo lanzaba hacia atrás y el fogonazo salía a su espalda, lejos del rival. Y la estatua seguía
// respirando y meneando la lanza: ahora se congela (`freeze`).
//
// Y no la deja ahí: se arrima y la revienta de un bastonazo, con el báculo por encima de la cabeza.
//
// Con la torre no vale petrificarla, que ya es de piedra: ella despierta como gigante para plantarle
// cara y el hechizo le abre el suelo. El gigante se tambalea y se lo traga el agujero: mientras baja se
// le recorta al ras del tablero (`clippingPlanes`), así que desaparece tragado de verdad y no
// encogiendo. Antes se probó a derretirlo en un charco y no colaba: un disco con ondas nunca parece
// líquido.

const SPELL = 'cast_a_spell';
const SPELL_COLOR = '#9fd0ff'; // el azul frío de la magia del alfil
const BOLT_SECONDS = 0.34; // lo que dura el rayo de la voluta al pecho
const CAST_DISTANCE = 1.4; // lo cerca que se pone a lanzar el hechizo (a 1,15, la estatua encogida le rozaba la mano)
const CAST_GAP = 0.35; // y lo que se aparta de más si el rival es un vozarrón de piedra
const STONE_SECONDS = 1.2; // lo que tarda la piedra en subirle de los pies a la cabeza
const FLINCH_SECONDS = 0.45; // lo que se encoge de miedo antes de quedarse de piedra
const STONE = new THREE.Color('#8f8a82');
const ADMIRE_SECONDS = 0.5; // lo que se recrea el alfil en su estatua antes de romperla
const SMASH = 'slash'; // el bastonazo de antes, por si al modelo le faltan los huesos del batazo
// El batazo (`bat-swing.js`): a qué distancia se pone, y sus tiempos.
const BAT_DISTANCE = 1.05; // con el bate cogido del regatón, le da con la mitad del báculo
const BAT_GAP = 0.45;
const BAT_WINDUP_SECONDS = 0.5; // lo levanta sobre el hombro
const BAT_HOLD_SECONDS = 0.35; // y lo aguanta ahí, apuntando
const BAT_SWING_SECONDS = 0.12; // de arriba a media vuelta, a toda velocidad…
const BAT_HIT_SECONDS = 0.1; // …y de media vuelta al golpe, ya a cámara lenta
const BAT_SLOW = 0.3;
const BAT_FOLLOW_SECONDS = 0.28; // el remate, por encima del otro hombro
const BAT_RECOVER_SECONDS = 0.5;
const BAT_PUSH = 2.4; // lo que se llevan los pedazos hacia donde va el bate
const SMASH_GAP = 0.25; // respiro entre los dos al rematar la estatua: con menos, el alfil se le echaba encima
const SMASH_HOLD = 0.3; // el báculo en alto, aguantando, antes de caer
const SMASH_ROCKS = 36; // salta en muchos más pedazos que un simple derrumbe
const SMASH_FORCE = 2; // y salen volando el doble de lejos
const SMASH_SHAKE = 0.34;
const HOLE_RADIUS = 0.46; // mínimo; se agranda hasta los hombros del gigante para que quepa entero
const HOLE_MAX = 0.58; // y no más, que la casilla mide 1 de lado
const HOLE_SECONDS = 0.5; // lo que tarda el agujero en abrirse (y en cerrarse)
const TEETER_SECONDS = 0.7; // el tambaleo antes de caer
const TEETER = 0.22; // radianes que se bambolea
const FALL_SECONDS = 1.1;
const FALL_DEPTH = 3.2; // lo que baja hasta perderse
const FALL_SPIN = 1.6; // y lo que gira mientras cae
const BOARD_TOP = 0.004; // el ras del tablero: por debajo, recortado
const DUST_Y = 0.05;
const HOLE_DUST = '#6b6054'; // el polvo del agujero es de madera rota, no blanco

// Se encoge de miedo, si sabe (el peón y el alfil tienen su gesto de susto): así se queda la estatua.
function flinch(defender) {
  const fighter = defender.kind === 'knight' ? defender.piece.rider : defender.piece;
  for (const clip of ['frightened', 'afraid']) {
    if (fighter.hasClip?.('fidget', clip)) {
      fighter.playOnce('fidget', { clip, fade: 0.1 });
      return true;
    }
  }
  return false;
}

// Quieta como una estatua: sin animación, ni capa, ni lanza que se menee. Al caballero, con su caballo.
function freeze(defender) {
  const parts = defender.kind === 'knight' ? [defender.piece.rider, defender.piece.horse] : [defender.piece];
  for (const part of parts) part?.freeze?.(true);
}

// Recorta una figura al ras del tablero: lo que baja de ahí deja de verse, que es lo que hace que
// parezca que se la traga el agujero en vez de que encoja.
function clipToBoard(object) {
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_TOP);
  object.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    o.material = Array.isArray(o.material) ? list.map((m) => m.clone()) : list[0].clone();
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      material.clippingPlanes = [plane];
      material.clipShadows = true;
      material.needsUpdate = true;
    }
  });
}

// Agujero en la casilla: no vale un disco negro pegado, que se nota plano. Se pinta en un lienzo un
// degradado que va de negro en el centro a nada en el borde, con grietas saliendo hacia fuera, y se
// tiende sobre la baldosa: así parece que la madera se ha roto y debajo no hay nada.
function holeTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;

  // Las grietas primero, que el degradado las tape hacia el centro.
  ctx.strokeStyle = 'rgba(20, 14, 10, 0.85)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 14; i++) {
    const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.2;
    const largo = c * (0.82 + Math.random() * 0.22);
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    ctx.moveTo(c, c);
    let x = c;
    let y = c;
    const pasos = 4;
    for (let k = 1; k <= pasos; k++) {
      const r = (largo * k) / pasos;
      const desvio = (Math.random() - 0.5) * 0.25;
      x = c + Math.cos(angle + desvio) * r;
      y = c + Math.sin(angle + desvio) * r;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Y encima el pozo: negro en el centro, difuminado en el borde.
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(2, 3, 5, 1)');
  grad.addColorStop(0.58, 'rgba(4, 5, 8, 1)');
  grad.addColorStop(0.76, 'rgba(12, 10, 9, 0.85)');
  grad.addColorStop(0.9, 'rgba(26, 18, 12, 0.35)');
  grad.addColorStop(1, 'rgba(26, 18, 12, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function openHole(board, at) {
  const texture = holeTexture();
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  hole.name = 'agujero';
  hole.rotation.x = -Math.PI / 2;
  hole.rotation.z = Math.random() * Math.PI * 2; // que no salgan las grietas siempre igual
  hole.position.set(at.x, 0.006, at.z);
  hole.renderOrder = 1; // sobre la baldosa, por debajo del polvo
  hole.scale.setScalar(0.001);
  board.group.add(hole);
  return hole;
}

// Baja al rival de su peana para pelear, cada uno a su manera: la torre despierta como gigante (que
// ya pisa el tablero), el caballero se la quita con su caballo encima y los demás bajan a la casilla.
function stepDown(defender, at) {
  if (defender.kind === 'rook' && defender.piece.giant) return defender.mover.awaken();
  if (defender.kind === 'knight') return defender.mover.leavePedestal();
  return defender.mover.descend(at);
}

export const bishopTurnsToStone = {
  matches: (attacker) => attacker.kind === 'bishop',
  can: (attacker) => Boolean(attacker.piece.strikes?.[SPELL] ?? attacker.piece.has('attack')),

  async run({ attacker, defender, board, home, center, target, clock, fx, cinema, hud, crowd, dust, rubble, bubbles, obstacles }) {
    const bishop = attacker.piece;
    const facing = facingTo(home, center);
    const lejos = Math.max(CAST_DISTANCE, attacker.piece.radius + defender.piece.radius + CAST_GAP);
    const spots = strikeSpot(home, center, { reach: lejos, torso: 0 });
    const esTorre = defender.kind === 'rook' && Boolean(defender.piece.giant);

    // 1. La cámara encuadra y el rival baja de su peana a plantarle cara (la torre, despertando como
    //    gigante), se gira hacia él, y el alfil baja de la suya y se acerca.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      stepDown(defender, center),
    ]);
    await defender.mover.turnTo(facingTo(center, home), 0.3);
    await attacker.mover.descend(home);
    await attacker.mover.walkTo(spots.attacker);
    await attacker.mover.turnTo(spots.attackerFacing, 0.25);
    if (esTorre) {
      const giant = defender.piece.giant;
      if (giant.has('taunt')) await giant.playOnce('taunt'); // el gigante se viene arriba… por poco tiempo
      giant.play('idle', { fade: 0.25 });
    }

    // 2. El hechizo. Un fogonazo suelto no cuenta nada: un conjuro se lee cuando tiene sus tres
    //    partes. Se CARGA —un sello de runas se abre a sus pies y la energía se junta en la voluta
    //    del báculo, en espiral y cada vez más deprisa—, se LANZA —un rayo quebrado que va de la
    //    voluta al pecho del rival— y ATERRIZA —otro sello bajo el rival, una onda por el suelo y
    //    el fogonazo. Y todo a cámara lenta, que es cuando se ve.
    const strike = bishop.strikes?.[SPELL];
    const casting = bishop.has('conjurar')
      ? bishop.playOnce('conjurar', { fade: 0.15 })
      : bishop.playOnce('attack', { clip: SPELL, fade: 0.15 });
    grita(attacker, 'grito');
    // La punta del báculo, viva: la mano se mueve mientras conjura, y la carga tiene que ir con ella.
    const voluta = () => (bishop.props.spear
      ? bishop.props.spear.localToWorld(new THREE.Vector3(0, bishop.spearEnds.top, 0))
      : bonePosition(bishop, 'R_Hand'));
    const cuando = strike?.body?.t ?? 1.1;
    fx.sigil(home, { radius: 0.52, seconds: cuando + 0.9, color: SPELL_COLOR, spin: 1.4 });
    fx.charge(voluta, { seconds: cuando, color: SPELL_COLOR, size: 0.34, motes: 14 });
    const magia = sfx.play('conjuro');
    await slowToImpact(clock, cuando);

    const victim = defender.kind === 'knight'
      ? defender.piece.object
      : (esTorre ? defender.piece.giant.object : defender.piece.object);
    const forma = defender.piece.figure;
    const at = forma.getWorldPosition(new THREE.Vector3());
    const pecho = at.clone().setY(defender.piece.height * 0.55);

    const tip = voluta();
    fx.bolt(tip, pecho, { seconds: BOLT_SECONDS, color: SPELL_COLOR, width: 0.07, kinks: 9 });
    fx.bolt(tip, pecho, { seconds: BOLT_SECONDS * 0.8, color: '#ffffff', width: 0.03, kinks: 13 });
    fx.burst(tip, { size: 1.2, sparks: 30 });
    hud.flash();
    cinema.shake(0.12);
    shout(bubbles, '¡ZAS!', tip);
    grita(defender, 'dolor');
    magia?.stop(0.1);
    sfx.play('hechizo');
    await clock.wait(BOLT_SECONDS * 0.6); // lo que tarda el rayo en llegar
    fx.sigil(center, { radius: 0.7, seconds: 1.1, color: SPELL_COLOR, spin: -2.2 });
    fx.shockwave(center, { radius: 1.9, seconds: 0.55, color: SPELL_COLOR });
    fx.burst(pecho, { size: 1.4, sparks: 26 });
    cinema.shake(0.16);

    if (esTorre) {
      // 3a. Al gigante el hechizo le abre el suelo: se tambalea y se lo traga el tablero.
      const radio = Math.min(HOLE_MAX, Math.max(HOLE_RADIUS, defender.piece.body?.walk ?? 0));
      const hole = openHole(board, center);
      clipToBoard(victim);
      await clock.tween(HOLE_SECONDS, (t) => hole.scale.setScalar(Math.max(0.001, radio * t)));
      dust.puff(new THREE.Vector3(center.x, DUST_Y, center.z), { count: 9, radius: 0.62, duration: 0.5, color: HOLE_DUST });
      cinema.shake(0.12);
      shout(bubbles, '¡AAAH!', at);
      grita(defender, 'vuela'); // el gigante, tragado por el suelo
      sfx.play('piedra_rompe', { rate: 0.75, volume: 0.7 }); // el suelo se abre
      await afterImpact(clock);
      await casting;
      bishop.play('idle', { fade: 0.3 });
      const desde = forma.position.y;
      const giro = forma.rotation.y;
      await clock.tween(TEETER_SECONDS, (t) => {
        forma.rotation.z = Math.sin(t * Math.PI * 3) * TEETER * (1 - t); // manotea buscando el suelo
        forma.position.y = desde - 0.05 * t;
      });
      rubble.explode(new THREE.Vector3(center.x, 0.1, center.z), {
        color: defender.piece.stone ?? `#${STONE.getHexString()}`,
        count: 10,
        height: 0.6,
        obstacles: () => crowd.obstacles([attacker, defender]),
      });
      await clock.tween(FALL_SECONDS, (t) => {
        const k = t * t; // cae acelerando, como quien se cae de verdad
        forma.position.y = desde - FALL_DEPTH * k;
        forma.rotation.z = TEETER * 0.6 * (1 - t);
        forma.rotation.y = giro + FALL_SPIN * k;
      });
      defender.piece.object.visible = false;
      forma.rotation.set(0, giro, 0);
      forma.position.y = desde;
      dust.puff(new THREE.Vector3(center.x, DUST_Y, center.z), { count: 12, radius: 0.75, duration: 0.7, color: HOLE_DUST });
      cinema.shake(0.16);
      shout(bubbles, '¡PLOF!', at);
      sfx.play('caida', { rate: 0.6 }); // el gigante, al fondo del agujero
      await clock.tween(HOLE_SECONDS, (t) => hole.scale.setScalar(Math.max(0.001, radio * (1 - t))));
      board.group.remove(hole);
      hole.geometry.dispose();
      hole.material.map?.dispose();
      hole.material.dispose();
    } else {
      // 3b. A los demás el hechizo los deja de piedra. Se encogen de miedo y se quedan así, quietos del
      //     todo, mientras la piedra les trepa de los pies a la cabeza con un frente de luz azul.
      if (flinch(defender)) await clock.wait(FLINCH_SECONDS);
      freeze(defender);
      const piedra = creep(victim, { color: STONE, edge: SPELL_COLOR, roughness: 1, metalness: 0, keep: 0.4, grain: 0.35 });
      const alto = defender.piece.height + 0.15;
      sfx.play('hielo', { rate: 0.55, volume: 0.9 }); // crepita al subir: piedra, no hielo, más grave
      await clock.tween(STONE_SECONDS, (t) => {
        piedra.level = -0.1 + (alto + 0.1) * (1 - (1 - t) * (1 - t));
      });
      await clock.tween(0.3, (t) => { piedra.glow = 1.6 * (1 - t); });
      await afterImpact(clock);
      await casting;
      bishop.play('idle', { fade: 0.3 });
      shout(bubbles, '¡CRIC!', at); // la estatua se asienta, con su crujidito
      sfx.play('piedra_cruje');
      await clock.wait(ADMIRE_SECONDS); // y el alfil se recrea un momento en su obra

      // 3c. Y el remate: se arrima y la BATEA. Coge el báculo a dos manos como un bate, lo levanta sobre
      //     el hombro, lo aguanta, y lo descarga en horizontal —a cámara lenta justo al dar—; la estatua
      //     salta en pedazos hacia donde va el golpe, y remata por encima del otro hombro. (Antes era un
      //     bastonazo de arriba abajo, con un meneo de cabeza que no se entendía.)
      const lejos = Math.max(BAT_DISTANCE, attacker.piece.radius + defender.piece.radius * 0.5 + BAT_GAP);
      const sitio = strikeSpot(home, center, { reach: lejos, torso: 0 });
      await attacker.mover.walkTo(sitio.attacker);
      await attacker.mover.turnTo(sitio.attackerFacing, 0.2);
      bishop.play('idle', { fade: 0.15 });
      // La cámara, de tres cuartos por delante del alfil: se le ve la cara y el bate viniendo (desde el
      // encuadre automático salía a veces de espaldas).
      const suyo = bishop.figure.getWorldPosition(new THREE.Vector3()).setY(0);
      const haciaEl = at.clone().setY(0).sub(suyo).normalize();
      const lado = cinema.side() ?? new THREE.Vector3(-haciaEl.z, 0, haciaEl.x);
      const vertical = cinema.portrait; // en el móvil, más de frente: de lado solo caben desde lejos
      const separados = suyo.distanceTo(at.clone().setY(0));
      cinema.shot(clock, {
        look: suyo.clone().lerp(at.clone().setY(0), 0.45).setY(defender.piece.height * 0.5),
        dir: ladeado(lado, haciaEl, vertical ? 1.1 : 0.6),
        box: { width: vertical ? separados * 0.6 + 1.1 : separados + 1.9, height: defender.piece.height + 0.9 },
        rise: 0.35,
        seconds: 0.5,
      });
      await clock.wait(0.2);
      const bate = batSwing(bishop);
      try {
        if (bate) {
          await clock.tween(BAT_WINDUP_SECONDS, (t) => bate.pose('reposo', 'arriba', t * t * (3 - 2 * t)));
          grita(attacker, 'grito');
          await clock.wait(BAT_HOLD_SECONDS);
          sfx.play('silbido', { rate: 0.75, volume: 0.9 });
          grita(attacker, 'ataque');
          await clock.tween(BAT_SWING_SECONDS, (t) => bate.pose('arriba', 'lado', t * t));
          clock.timeScale = BAT_SLOW;
          await clock.tween(BAT_HIT_SECONDS, (t) => bate.pose('lado', 'golpe', t));
        } else {
          const golpe = bishop.strikes?.[SMASH]?.spear;
          if (golpe) {
            const swing = await windUp({ clock, fighter: bishop, key: SMASH });
            await clock.wait(SMASH_HOLD);
            if (swing) swing.paused = false;
            await slowToImpact(clock, golpe.t * (1 - WIND_UP));
          }
        }
        const punta = bishop.props.spear
          ? bishop.props.spear.localToWorld(new THREE.Vector3(0, bishop.spearEnds.top, 0))
          : at.clone().setY(defender.piece.height * 0.8);
        const empuje = bate ? bate.swingDir().multiplyScalar(BAT_PUSH) : null;
        hud.flash();
        cinema.shake(SMASH_SHAKE);
        fx.burst(at.clone().setY(defender.piece.height * 0.55), { size: bate ? 1.1 : 1.8, sparks: 44 });
        fx.burst(punta, { size: 1.1, sparks: 18 });
        rubble.explode(at, {
          color: `#${STONE.getHexString()}`,
          count: SMASH_ROCKS,
          height: defender.piece.height,
          force: SMASH_FORCE,
          push: empuje,
          obstacles: () => crowd.obstacles([attacker, defender]),
        });
        // Polvo, el justo: con la cámara cerca, una polvareda grande tapaba medio plano.
        dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 8, radius: 0.6, duration: 0.55 });
        shout(bubbles, '¡CATACROC!', at);
        sfx.play('piedra_rompe');
        victim.visible = false; // no se desvanece: se hace añicos de golpe
        defender.piece.object.visible = false;
        if (bate) {
          // El remate sigue mientras dura el congelado del golpe y la cámara lenta.
          const remate = clock.tween(BAT_FOLLOW_SECONDS, (t) => bate.pose('golpe', 'remate', 1 - (1 - t) * (1 - t)));
          await afterImpact(clock);
          await remate;
          await clock.wait(0.3);
          await clock.tween(BAT_RECOVER_SECONDS, (t) => bate.pose('remate', 'reposo', t * t * (3 - 2 * t)));
          bate.release();
          cinema.free();
        } else {
          await afterImpact(clock);
        }
      } finally {
        bate?.release(); // si algo falla a medias, que no se quede congelado y sin báculo
        cinema.free();
      }
      bishop.play('idle', { fade: 0.25 });
    }

    // 4. Ocupa la casilla y hace la reverencia, con la cámara encima.
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.walkOnto(target) });
  },
};
