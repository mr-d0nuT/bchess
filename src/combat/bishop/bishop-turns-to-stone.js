import * as THREE from 'three';
import { afterImpact, slowToImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { bonePosition, facingTo, shout, victoryLap } from '../knight/common.js';

// El alfil se come a cualquiera (mismo espíritu de gag que las batallas del caballero). Baja de su peana,
// se acerca lo justo, levanta el báculo y lanza el hechizo: fogonazo en la voluta y al rival se le va el
// color hasta quedar de piedra lisa, y entonces se resquebraja en cascotes.
//
// Con la torre no vale petrificarla, que ya es de piedra: ella despierta como gigante para plantarle
// cara y el hechizo le abre el suelo. El gigante se tambalea y se lo traga el agujero: mientras baja se
// le recorta al ras del tablero (`clippingPlanes`), así que desaparece tragado de verdad y no
// encogiendo. Antes se probó a derretirlo en un charco y no colaba: un disco con ondas nunca parece
// líquido.

const SPELL = 'cast_a_spell';
const CAST_DISTANCE = 1.15; // lo cerca que se pone a lanzar el hechizo
const CAST_GAP = 0.35; // y lo que se aparta de más si el rival es un vozarrón de piedra
const STONE_SECONDS = 0.7; // lo que tarda en volverse piedra
const STONE = new THREE.Color('#8f8a82');
const CRACK_SECONDS = 0.35; // de piedra a cascotes
const ROCKS = 22;
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

// Le quita el color a una pieza hasta dejarla de piedra: se le clonan los materiales (los comparten
// todas las copias del mismo modelo) y se les lleva el color y el brillo a los de la roca.
function petrify(object) {
  const materials = [];
  object.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    o.material = Array.isArray(o.material) ? list.map((m) => m.clone()) : list[0].clone();
    for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.push({ material, color: material.color?.clone() ?? null, map: material.map });
    }
  });
  return (t) => {
    for (const { material, color, map } of materials) {
      if (color) material.color.copy(color).lerp(STONE, t);
      if (map && t > 0.6) material.map = null; // al final, piedra lisa: la textura delata a la figura
      material.roughness = Math.max(material.roughness ?? 1, t);
      material.metalness = (material.metalness ?? 0) * (1 - t);
      material.needsUpdate = true;
    }
  };
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

export const bishopTurnsToStone = {
  matches: (attacker) => attacker.kind === 'bishop',
  can: (attacker) => Boolean(attacker.piece.strikes?.[SPELL] ?? attacker.piece.has('attack')),

  async run({ attacker, defender, board, home, center, target, clock, fx, cinema, hud, crowd, dust, rubble, bubbles, obstacles }) {
    const bishop = attacker.piece;
    const facing = facingTo(home, center);
    const lejos = Math.max(CAST_DISTANCE, attacker.piece.radius + defender.piece.radius + CAST_GAP);
    const spots = strikeSpot(home, center, { reach: lejos, torso: 0 });
    const esTorre = defender.kind === 'rook' && Boolean(defender.piece.giant);

    // 1. La cámara encuadra; si es una torre, despierta como gigante para plantarle cara. El rival se
    //    gira hacia él y el alfil baja de su peana y se acerca.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      esTorre ? defender.mover.awaken() : Promise.resolve(),
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

    // 2. El hechizo, a cámara lenta: fogonazo en la voluta del báculo.
    const strike = bishop.strikes?.[SPELL];
    const casting = bishop.playOnce('attack', { clip: SPELL, fade: 0.15 });
    await slowToImpact(clock, strike?.body?.t ?? 1.1);
    const tip = bishop.props.spear
      ? bishop.props.spear.localToWorld(new THREE.Vector3(0, bishop.spearEnds.top, 0))
      : bonePosition(bishop, 'R_Hand');
    fx.burst(tip, { size: 1.2, sparks: 30 });
    hud.flash();
    cinema.shake(0.12);
    shout(bubbles, '¡ZAS!', tip);

    const victim = defender.kind === 'knight'
      ? defender.piece.object
      : (esTorre ? defender.piece.giant.object : defender.piece.object);
    const forma = defender.piece.figure;
    const at = forma.getWorldPosition(new THREE.Vector3());
    fx.burst(at.clone().setY(1), { size: 1, sparks: 18 });

    if (esTorre) {
      // 3a. Al gigante el hechizo le abre el suelo: se tambalea y se lo traga el tablero.
      const radio = Math.min(HOLE_MAX, Math.max(HOLE_RADIUS, defender.piece.body?.walk ?? 0));
      const hole = openHole(board, center);
      clipToBoard(victim);
      await clock.tween(HOLE_SECONDS, (t) => hole.scale.setScalar(Math.max(0.001, radio * t)));
      dust.puff(new THREE.Vector3(center.x, DUST_Y, center.z), { count: 9, radius: 0.62, duration: 0.5, color: HOLE_DUST });
      cinema.shake(0.12);
      shout(bubbles, '¡AAAH!', at);
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
      await clock.tween(HOLE_SECONDS, (t) => hole.scale.setScalar(Math.max(0.001, radio * (1 - t))));
      board.group.remove(hole);
      hole.geometry.dispose();
      hole.material.map?.dispose();
      hole.material.dispose();
    } else {
      // 3b. A los demás el hechizo los vuelve piedra y se resquebrajan en cascotes.
      const stone = petrify(victim);
      await clock.tween(STONE_SECONDS, stone);
      await afterImpact(clock);
      await casting;
      bishop.play('idle', { fade: 0.3 });
      rubble.explode(at, {
        color: `#${STONE.getHexString()}`,
        count: ROCKS,
        height: defender.piece.height,
        obstacles: () => crowd.obstacles([attacker, defender]),
      });
      dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 20, radius: 0.9, duration: 0.8 });
      cinema.shake(0.18);
      shout(bubbles, '¡CRAC!', at);
      await clock.tween(CRACK_SECONDS, (t) => {
        forma.scale.setScalar(Math.max(0.001, 1 - t));
      });
      await defender.mover.vanish();
    }

    // 4. Ocupa la casilla y hace la reverencia, con la cámara encima.
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.walkOnto(target) });
  },
};
