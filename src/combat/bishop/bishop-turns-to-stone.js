import * as THREE from 'three';
import { afterImpact, slowToImpact } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { bonePosition, facingTo, shout, victoryLap } from '../knight/common.js';

// El alfil se come a cualquiera: lo convierte en piedra (diseño, sección 7 del caballero, mismo espíritu
// de gag). El alfil baja de su peana y se acerca lo justo, levanta el báculo y lanza el hechizo: un
// fogonazo en la voluta, el rival se queda tieso y se le va el color hasta quedar de piedra, y se
// resquebraja en cascotes. El alfil ocupa la casilla y hace su reverencia con la cámara encima.
//
// Con la torre no vale petrificarla, que ya es de piedra: a ella se la derrite. Se vuelve líquido, se
// abre un agujero en su casilla y el charco se cuela por él (lo pidió el usuario).

const SPELL = 'cast_a_spell';
const CAST_DISTANCE = 1.15; // lo cerca que se pone a lanzar el hechizo
const STONE_SECONDS = 0.7; // lo que tarda en volverse piedra
const STONE = new THREE.Color('#8f8a82');
const CRACK_SECONDS = 0.35; // de piedra a cascotes
const ROCKS = 22;
const LIQUID = new THREE.Color('#2f3a42'); // el charco en que se queda la torre
const MELT_SECONDS = 1.5; // lo que tarda en derretirse
const DRAIN_SECONDS = 0.9; // y en colarse por el agujero
const HOLE_RADIUS = 0.46;
const PUDDLE = 1.35; // lo que se despatarra el charco antes de colarse
const DUST_Y = 0.05;

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

// Lo mismo, pero a líquido: color de charco y brillo mojado, que es lo que se le hace a la torre.
function liquefy(object) {
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
      if (color) material.color.copy(color).lerp(LIQUID, t);
      if (map && t > 0.5) material.map = null;
      material.roughness = Math.min(material.roughness ?? 1, 1 - 0.85 * t);
      material.metalness = Math.max(material.metalness ?? 0, 0.5 * t);
      material.needsUpdate = true;
    }
  };
}

// Agujero negro en la casilla: un disco sobre la baldosa que crece, se traga el charco y se cierra.
function openHole(board, at) {
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(1, 36),
    new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.95 }),
  );
  hole.name = 'agujero';
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(at.x, 0.006, at.z);
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
    const spots = strikeSpot(home, center, { reach: CAST_DISTANCE, torso: 0 });

    // 1. La cámara encuadra, el rival se gira hacia él y el alfil baja de su peana y se acerca.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.turnTo(facingTo(center, home), 0.3),
    ]);
    await attacker.mover.descend(home);
    await attacker.mover.walkTo(spots.attacker);
    await attacker.mover.turnTo(spots.attackerFacing, 0.25);

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

    // 3. El rival cambia: la torre, que ya es de piedra, se derrite; los demás se vuelven piedra.
    const esTorre = defender.kind === 'rook';
    const victim = defender.kind === 'knight'
      ? defender.piece.object
      : (esTorre ? defender.piece.tower : defender.piece.object);
    const forma = esTorre ? defender.piece.tower : defender.piece.figure;
    const cambio = esTorre ? liquefy(victim) : petrify(victim);
    fx.burst(defender.piece.figure.getWorldPosition(new THREE.Vector3()).setY(1), { size: 1, sparks: 18 });
    await clock.tween(STONE_SECONDS, cambio);
    await afterImpact(clock);
    await casting;
    bishop.play('idle', { fade: 0.3 });

    const at = defender.piece.figure.getWorldPosition(new THREE.Vector3());
    if (esTorre) {
      // 4a. La torre se derrite en un charco, se abre un agujero en su casilla y el charco se cuela.
      const hole = openHole(board, center);
      shout(bubbles, '¡CHOF!', at);
      const alto = forma.scale.y;
      await Promise.all([
        clock.tween(MELT_SECONDS, (t) => {
          const k = t * t; // al principio aguanta y luego se viene abajo de golpe
          forma.scale.set(1 + (PUDDLE - 1) * k, alto * Math.max(0.02, 1 - k), 1 + (PUDDLE - 1) * k);
        }),
        clock.tween(MELT_SECONDS * 0.7, (t) => hole.scale.setScalar(Math.max(0.001, HOLE_RADIUS * t))),
      ]);
      shout(bubbles, '¡GLUP!', at);
      await clock.tween(DRAIN_SECONDS, (t) => {
        const k = 1 - t;
        forma.scale.set(PUDDLE * k, Math.max(0.001, alto * 0.02 * k), PUDDLE * k);
        forma.position.y = -0.08 * t;
      });
      defender.piece.object.visible = false;
      await clock.tween(0.45, (t) => hole.scale.setScalar(Math.max(0.001, HOLE_RADIUS * (1 - t))));
      board.group.remove(hole);
      hole.geometry.dispose();
      hole.material.dispose();
    } else {
      // 4b. Y los demás se resquebrajan en cascotes, con su nube de polvo y su temblor.
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

    // 5. Ocupa la casilla y hace la reverencia, con la cámara encima.
    await victoryLap({ entry: attacker, clock, cinema, at: center, obstacles, move: () => attacker.mover.walkOnto(target) });
  },
};
