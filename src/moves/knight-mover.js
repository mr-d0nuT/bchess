import * as THREE from 'three';
import { LEAP_GRAVITY, LEAP_MIN_PEAK, LEAP_SPEED, leapAt, planLeap } from './leap.js';
import { BOARD_EDGE, nearestEdgeExit, planWalk, pointAlong, shortestTurn } from './walk.js';

// Mover del caballero (diseño en docs/superpowers/specs/2026-09-15-bchess-caballero-design.md,
// secciones 4 a 6), con la misma forma que los de los peones y las torres. Para ir a otra casilla, el
// caballo gira, se encabrita mientras la peana encoge, salta en arco por encima de las piezas y
// aterriza, y la peana vuelve a crecer; sin caballo, el jinete salta igual. Mientras salta, y mientras
// el caballo anda o espera apartado, pide sitio a las piezas de alrededor (`crowd`). Los pasos sueltos
// (`room`, `turnTo`, `leapTo`, `dismount`, `walkTo`, `horseFlee`, `mount`) los usan las batallas, que
// ya tienen el bloqueo general.

const REAR_SECONDS = 0.4;
const REAR_ANGLE = 0.6; // radianes que se levanta el caballo al encabritarse
const THROW_REAR = 0.8; // y cuando tira al jinete
const MAX_PITCH = 0.7; // lo que más se inclina el cuerpo en el aire
const LEG_STRETCH = { front: -40, back: 35 }; // grados de las patas estiradas al subir
const LEG_TUCK = { front: 55, back: -45 }; // y recogidas al bajar
const LEAP_MAX_PEAK = 2.2; // por alto que sea lo de debajo, el arco no pasa de aquí
const TROT = 1.7; // veces su paseo, cuando va al trote
const FIDGET_REAR = 0.6; // radianes que se levanta el caballo en su gesto de reposo
const FIDGET_UP = 0.45; // segundos que tarda en levantarse
const FIDGET_PAWS = 2; // manotazos al aire antes de bajar
const FIDGET_PAW_SECONDS = 0.55;
const FIDGET_DOWN = 0.3;
const PAW_UPPER = { mid: 48, swing: 26 }; // grados del brazo de la pata delantera: postura y vaivén
const PAW_KNEE = { mid: 40, swing: -34 }; // y de la rodilla, al revés: se estira al dar el manotazo
const LAND_SECONDS = 0.25;
const LAND_BOUNCE = 0.08;
const RISE_SECONDS = 0.4;
const ON_FOOT = { halfLength: 0.3, halfWidth: 0.3 }; // huella del jinete sin caballo
const POINT_STEP = 7; // de las demás piezas, un vértice de cada tantos para el arco del salto
const PATH_MARGIN = 1.3; // piezas más lejos que esto del camino no cuentan para el arco
const LOOK_AHEAD = 0.8; // casillas por delante que pide el caballo al andar
const SETTLE_LIMIT = 4; // segundos de juego que espera, como mucho, a que vuelvan las piezas
const DUST_Y = 0.05;
const JUMP_OFF_SIDE = 0.5; // lo que se aparta del caballo el jinete al saltar de la silla
const SPEAR_BESIDE = 0.25; // del jinete a su lanza clavada
const BACK_OFF = 0.9; // lo que retrocede el caballo tras desmontar el jinete
const BOARD_LIMIT = 3.9; // lo más lejos del centro del tablero que se para el caballo al retroceder
const FLEE_SPEED = 1.8; // veces su paseo, cuando huye
const DROP = 0.35; // lo que baja el caballo tras el borde del tablero al huir
const AVOID = 0.8; // lo que se aparta de la pelea el camino del caballo que huye
const THROW_SECONDS = 0.6;
const SIT_HEIGHT = 0.12; // altura de la cadera del jinete sentado en el suelo
const DAZE_SECONDS = 1;
const GETUP_SECONDS = 0.5;
const MOUNT_SECONDS = 0.55;
const SWORD_SECONDS = 0.2;

const segmentDistance = (p, a, b) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};
const clampToBoard = ({ x, z }) => ({
  x: Math.max(-BOARD_LIMIT, Math.min(BOARD_LIMIT, x)),
  z: Math.max(-BOARD_LIMIT, Math.min(BOARD_LIMIT, z)),
});

export function createKnightMover({ knight, owner, pieces, board, dust, fx, clock, cinema, crowd, onBusy = () => {}, restFacing }) {
  const { horse, rider } = knight;
  const swordScale = rider.props.sword?.scale.x ?? 1;
  let square = null;
  let busy = false;
  let heading = null; // destino {x, z} mientras el caballo anda
  let landing = null; // dónde cae {x, z} mientras salta
  let fled = null; // borde {x, z} por el que huyó el caballo
  let leaving = null; // la huida del caballo, mientras dura
  let spearThrown = false; // la lanza salió volando al tirarlo el caballo
  let gesturing = null; // el gesto en reposo del caballo, mientras dura
  let cutGesture = false; // hay que acabarlo ya: el caballero tiene que moverse

  function setBusy(value) {
    busy = value;
    onBusy(value);
  }

  async function exclusive(task) {
    if (busy) return false;
    setBusy(true);
    knight.resting = false; // quieto respira; moviéndose, la altura y el cuello los lleva el movimiento
    try {
      await task();
      return true;
    } finally {
      setBusy(false);
      knight.resting = knight.mounted;
    }
  }

  function turnFigure(figure, angle, seconds) {
    const from = figure.rotation.y;
    const delta = shortestTurn(from, angle);
    return clock.tween(seconds, (t) => {
      figure.rotation.y = from + delta * t;
    });
  }

  // Gira al caballo con su jinete o, a pie, al jinete.
  function turnTo(angle, seconds) {
    return turnFigure(knight.figure, angle, seconds);
  }

  // Caballo quieto. Si no tiene animación de reposo, su paseo congelado en el fotograma en que las
  // cuatro patas apoyan (`mount.still`): en el primero levanta una mano y parece que cojee, y la
  // postura de enlace de su esqueleto (`rest`) sale al doble de tamaño y medio metro bajo el tablero.
  function stillHorse() {
    if (!horse) return;
    if (horse.play('idle', { fade: 0.3 })) return;
    const walk = horse.play('walk', { fade: 0.3 });
    if (!walk) {
      horse.rest();
      return;
    }
    walk.paused = true;
    walk.time = knight.mount?.still?.time ?? 0; // el fotograma en que las cuatro patas quedan más a la par
    for (const { bone, turn } of knight.mount?.still?.turns ?? []) horse.turnBone(bone, turn); // y cada pata, apoyada
  }

  // Suelta las patas de la postura de quieto: andando, saltando o encabritándose manda la animación.
  function looseLegs() {
    if (!horse) return;
    for (const { bone } of knight.mount?.still?.turns ?? []) horse.turnBone(bone, null);
  }

  function placeOn(target) {
    square = target;
    heading = null;
    landing = null;
    fled = null;
    leaving = null;
    spearThrown = false;
    const at = board.squareToWorld(target);
    knight.object.visible = true;
    knight.pedestal.visible = true;
    knight.pedestal.scale.setScalar(1);
    knight.pedestal.rotation.y = restFacing;
    rider.object.visible = true;
    rider.resetBones();
    rider.holdSpear();
    rider.setSpearPose(null);
    rider.setSpearDefault(null);
    rider.setGripSlide(0);
    if (rider.props.sword) {
      rider.props.sword.visible = false;
      rider.props.sword.scale.setScalar(swordScale);
    }
    if (horse) {
      horse.object.visible = true;
      horse.figure.scale.setScalar(1);
      horse.resetBones();
      stillHorse();
      knight.seatRider();
    }
    knight.placeAt(at);
    knight.face(restFacing);
    rider.figure.scale.setScalar(1);
    rider.play('idle', { fade: 0 });
    if (horse) knight.seatRider(); // otra vez al final: sentarlo antes de tener sitio y reposo no cuaja
    knight.resting = knight.mounted;
  }

  // Cuerpos con los que pide sitio ahora:
  // - el caballo, mientras salta, con su largo alrededor de donde cae;
  // - el caballo que anda, con el tramo que tiene por delante;
  // - el caballo que espera sin jinete, con un círculo de su largo;
  // - en una batalla, `stance` ({ at, facing, reach }), el abanico de lo que hará el jinete en su puesto.
  function room({ stance = null } = {}) {
    const bodies = [];
    if (!knight.object.visible) return bodies;
    if (stance && rider.object.visible) bodies.push({ ...stance, margin: knight.body.margin });
    if (!horse?.object.visible) return bodies;
    const { halfLength, halfWidth } = knight.mount;
    const at = horse.figure.position;
    const scale = horse.figure.scale.x;
    if (landing) {
      bodies.push({ from: landing, to: landing, radius: halfLength });
    } else if (heading) {
      const dx = heading.x - at.x;
      const dz = heading.z - at.z;
      const left = Math.hypot(dx, dz);
      if (left > 1e-6) {
        const ux = dx / left;
        const uz = dz / left;
        const ahead = Math.min(LOOK_AHEAD, left);
        bodies.push({
          from: { x: at.x - ux * halfLength, z: at.z - uz * halfLength },
          to: { x: at.x + ux * (halfLength + ahead), z: at.z + uz * (halfLength + ahead) },
          radius: halfWidth * scale,
        });
      }
    } else if (!knight.mounted) {
      bodies.push({ from: { x: at.x, z: at.z }, to: { x: at.x, z: at.z }, radius: halfLength * scale });
    }
    return bodies;
  }

  // Puntos de las superficies de las demás piezas cerca del camino, para el arco del salto: un vértice de
  // cada POINT_STEP de sus mallas visibles, en su postura de ahora. `extra` son objetos que también
  // cuentan (el jinete, cuando salta el caballo solo).
  function pointsNear(from, to, extra = []) {
    const points = [];
    const v = new THREE.Vector3();
    const objects = [...extra];
    // Lanzas, escudos y banderines no cuentan: el caballo salta por encima de la pieza, no de su lanza de
    // dos metros y medio, que si no el brinco sale absurdo.
    const sinContar = new Set();
    for (const entry of pieces()) {
      if (entry === owner || !entry.piece.object.visible) continue;
      entry.piece.figure.getWorldPosition(v);
      if (segmentDistance(v, from, to) > PATH_MARGIN) continue;
      objects.push(entry.piece.object);
      for (const prop of Object.values(entry.piece.props ?? {})) if (prop) sinContar.add(prop);
    }
    const esAccesorio = (o) => { for (let at = o; at; at = at.parent) if (sinContar.has(at)) return true; return false; };
    for (const object of objects) {
      object.updateMatrixWorld(true);
      object.traverseVisible((o) => {
        if (!o.isMesh || (!Array.isArray(o.material) && !o.material.visible) || esAccesorio(o)) return;
        const position = o.geometry.attributes.position;
        for (let i = 0; i < position.count; i += POINT_STEP) {
          if (o.isSkinnedMesh) o.getVertexPosition(i, v);
          else v.fromBufferAttribute(position, i);
          v.applyMatrix4(o.matrixWorld);
          points.push({ x: v.x, y: v.y, z: v.z });
        }
      });
    }
    return points;
  }

  // Patas del caballo: estiradas (`stretch`, de 0 a 1) y recogidas (`tuck`).
  function setLegs(stretch, tuck) {
    for (const [name, bones] of Object.entries(knight.mount.legs)) {
      const end = name.startsWith('front') ? 'front' : 'back';
      const angle = LEG_STRETCH[end] * stretch + LEG_TUCK[end] * tuck;
      horse.turnBone(bones[0], Math.abs(angle) > 1e-3 ? { x: angle } : null);
    }
  }

  // Manotazo al aire de las patas delanteras, encabritado: una sube mientras la otra baja. `t` va de 0 a
  // 1 en cada manotazo y `k`, de 0 a 1, dice cuánto de la postura se aplica (al subir y al bajar). Las
  // traseras, las que aguantan el peso, se quedan casi rectas: si se estiran, el caballo se sale de su
  // peana.
  function pawAir(t, k = 1) {
    for (const [name, bones] of Object.entries(knight.mount.legs)) {
      if (!name.startsWith('front')) {
        horse.turnBone(bones[0], null); // rectas: dobladas, los cascos dejan de tocar la peana
        continue;
      }
      const swing = Math.sin(2 * Math.PI * (name === 'frontLeft' ? t : t + 0.5));
      horse.turnBone(bones[0], { x: (PAW_UPPER.mid + PAW_UPPER.swing * swing) * k });
      if (bones[1]) horse.turnBone(bones[1], { x: (PAW_KNEE.mid + PAW_KNEE.swing * swing) * k });
    }
  }

  // Detrás del caballero, a una casilla: si hay una pieza, no se encabrita (le caería el lomo encima).
  function backClear() {
    const figure = knight.figure;
    const behind = { x: figure.position.x + Math.sin(figure.rotation.y + Math.PI), z: figure.position.z + Math.cos(figure.rotation.y + Math.PI) };
    return !pieces().some((entry) => {
      if (entry === owner || !entry.piece.object.visible || !entry.mover.square) return false;
      const at = board.squareToWorld(entry.mover.square);
      return Math.hypot(at.x - behind.x, at.z - behind.z) < 0.6;
    });
  }

  // Gesto en reposo del caballo (lo pidió el usuario): se encabrita sobre las patas traseras, manotea en
  // el aire y vuelve al suelo. No bloquea el juego ni deja la casilla; si mientras tanto le toca mover,
  // `stopGesture` le hace bajar en cuanto acaba el manotazo que esté dando.
  function fidget() {
    if (busy || gesturing || !horse || !knight.mounted || !knight.object.visible || !backClear()) return null;
    const figure = knight.figure;
    const startY = figure.position.y;
    const rear = (k) => {
      figure.rotation.x = -FIDGET_REAR * k;
      figure.position.y = startY + knight.mount.hoofBack * Math.sin(FIDGET_REAR * k);
    };
    cutGesture = false;
    looseLegs();
    knight.fidgeting = true;
    knight.resting = false; // el gesto lleva la altura del caballo; la respiración, después
    gesturing = (async () => {
      try {
        await clock.tween(FIDGET_UP, (t) => {
          const k = Math.sin((Math.PI / 2) * t);
          rear(k);
          pawAir(0, k);
        });
        for (let i = 0; i < FIDGET_PAWS && !cutGesture; i++) {
          await clock.tween(FIDGET_PAW_SECONDS, (t) => {
            rear(1 - 0.05 * Math.sin(2 * Math.PI * t)); // el cuerpo se mece un poco mientras manotea
            pawAir(t);
          });
        }
        await clock.tween(FIDGET_DOWN, (t) => {
          rear(1 - t);
          pawAir(0, 1 - t);
        });
        dust.puff(new THREE.Vector3(figure.position.x, DUST_Y, figure.position.z), { count: 8, radius: 0.5, duration: 0.4 });
      } finally {
        horse.resetBones();
        stillHorse();
        figure.rotation.x = 0;
        figure.position.y = startY;
        knight.fidgeting = false;
        knight.resting = knight.mounted;
        gesturing = null;
      }
    })();
    return 0;
  }

  // Corta el gesto si lo hay y espera a que el caballo esté de nuevo con las cuatro patas en el suelo.
  function stopGesture() {
    cutGesture = true;
    return gesturing ?? Promise.resolve();
  }

  // Salto en arco de `figure` hasta `to` ({x, z}). `horseMoves`: el caballo se encabrita al despegar y
  // mueve las patas en el aire. Si el caballero está sobre la peana, la peana encoge al despegar.
  async function leap({ figure, to, footprint, horseMoves, extra = [], plan: dado = null }) {
    const from = { x: figure.position.x, z: figure.position.z };
    const plan = dado ?? planLeap({ from, to, points: pointsNear(from, to, extra), halfLength: footprint.halfLength, halfWidth: footprint.halfWidth });
    if (plan.peak > LEAP_MAX_PEAK) {
      plan.peak = LEAP_MAX_PEAK;
      plan.duration = Math.max(plan.distance / LEAP_SPEED, Math.sqrt((8 * plan.peak) / LEAP_GRAVITY));
    }
    await turnFigure(figure, plan.heading, 0.25);
    looseLegs();

    // 1. Se encabrita mientras la peana encoge.
    const onPedestal = knight.pedestal.visible && figure === knight.figure;
    const startY = figure.position.y;
    dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
    await clock.tween(REAR_SECONDS, (t) => {
      const k = Math.sin((Math.PI / 2) * t);
      if (onPedestal) knight.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      figure.position.y = startY * (1 - t) + (horseMoves ? knight.mount.hoofBack * Math.sin(REAR_ANGLE * k) : 0);
      if (horseMoves) figure.rotation.x = -REAR_ANGLE * k;
    });
    if (onPedestal) knight.pedestal.visible = false;

    // 2. Vuela: el cuerpo sigue la pendiente del arco y las patas se estiran al subir y se recogen al bajar.
    landing = { x: to.x, z: to.z };
    const rear = figure.rotation.x;
    if (!horseMoves) rider.play(rider.has('jump') ? 'jump' : 'idle', { loop: false, fade: 0.1 });
    await clock.tween(plan.duration, (u) => {
      const p = leapAt(plan, u);
      figure.position.set(p.x, p.y, p.z);
      if (!horseMoves) return;
      const pitch = -Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.climb));
      figure.rotation.x = u < 0.2 ? rear + (pitch - rear) * (u / 0.2) : pitch;
      setLegs(u < 0.5 ? Math.sin(2 * Math.PI * u) : 0, u >= 0.5 ? Math.sin(Math.PI * (2 * u - 1)) : 0);
    });

    // 3. Aterriza con un rebote, polvo y un temblor ligero.
    if (horseMoves) setLegs(0, 0);
    figure.position.set(to.x, 0, to.z);
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.06);
    const pitch = figure.rotation.x;
    await clock.tween(LAND_SECONDS, (t) => {
      figure.rotation.x = pitch * (1 - t);
      figure.position.y = Math.sin(Math.PI * t) * LAND_BOUNCE;
    });
    figure.rotation.x = 0;
    figure.position.y = 0;
    landing = null;
    if (!horseMoves) rider.play('idle', { fade: 0.2 });
  }

  // El caballero, a caballo o a pie, salta hasta `to`.
  function leapTo(to) {
    return leap({ figure: knight.figure, to, footprint: knight.mounted ? knight.mount : ON_FOOT, horseMoves: knight.mounted });
  }

  // Trote hasta `to`: la peana encoge, el caballo cruza al trote con su paseo acelerado y se para. Va en
  // línea recta, que es lo que hace un caballo cuando no tiene nada que librar.
  async function trot(figure, to) {
    looseLegs();
    const from = { x: figure.position.x, z: figure.position.z };
    const plan = planWalk(from, to, (horse?.walkSpeed ?? 1) * TROT);
    await turnFigure(figure, plan.heading, 0.25);
    if (knight.pedestal.visible) {
      dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
      await clock.tween(REAR_SECONDS / 2, (t) => {
        knight.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
        figure.position.y = knight.pedestalHeight * (1 - t);
      });
      knight.pedestal.visible = false;
    }
    heading = { x: to.x, z: to.z };
    const paso = horse?.play('walk', { fade: 0.2 });
    if (paso) {
      paso.paused = false;
      paso.timeScale = TROT;
    }
    await clock.tween(plan.duration, (t) => {
      const at = pointAlong(from, to, t);
      figure.position.set(at.x, 0, at.z);
    });
    heading = null;
    if (paso) paso.timeScale = 1;
    stillHorse();
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z), { count: 8, radius: 0.5, duration: 0.4 });
  }

  // Si por el camino no hay nada que librar, va al trote; si hay alguna pieza debajo, salta por encima.
  function moveTo(to) {
    const figure = knight.figure;
    const footprint = knight.mounted ? knight.mount : ON_FOOT;
    const from = { x: figure.position.x, z: figure.position.z };
    const plan = planLeap({ from, to, points: pointsNear(from, to), halfLength: footprint.halfLength, halfWidth: footprint.halfWidth });
    if (knight.mounted && plan.peak <= LEAP_MIN_PEAK + 1e-6) return trot(figure, to);
    return leap({ figure, to, footprint, horseMoves: knight.mounted, plan });
  }

  // La peana reaparece bajo sus pies en `to` entre polvo, lo sube y lo gira hacia el oponente.
  async function rise(to) {
    const figure = knight.figure;
    knight.pedestal.position.set(to.x, 0, to.z);
    knight.pedestal.rotation.y = restFacing;
    knight.pedestal.visible = true;
    knight.hitbox.position.set(to.x, knight.height / 2, to.z);
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
    await clock.tween(RISE_SECONDS, (t) => {
      const k = 1 - (1 - t) ** 3;
      knight.pedestal.scale.setScalar(Math.max(0.001, k));
      figure.position.y = knight.pedestalHeight * k;
    });
    await turnTo(restFacing, 0.35);
  }

  function goTo(target) {
    if (target === square) return Promise.resolve(false);
    return exclusive(async () => {
      await stopGesture();
      const to = board.squareToWorld(target);
      const from = board.squareToWorld(square);
      const release = crowd.claim({ owners: [owner], bodies: () => room() });
      // La cámara se acerca a seguir la jugada y, al acabar, vuelve a donde la tenía el usuario.
      const obstacles = pieces().filter((entry) => entry !== owner).map((entry) => board.squareToWorld(entry.mover.square));
      try {
        await cinema.frame(clock, from, to, obstacles);
        cinema.follow(() => knight.figure.position);
        await moveTo(to);
        cinema.follow(null);
        await rise(to);
        square = target;
      } catch (err) {
        console.error('[BChess] El caballero no pudo saltar:', err);
        placeOn(target);
      } finally {
        cinema.follow(null);
        release();
        await cinema.restore(clock);
      }
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
    });
  }

  // Si está sobre la peana, la peana encoge entre polvo mientras la figura baja al tablero.
  async function leavePedestal() {
    if (!knight.pedestal.visible) return;
    const figure = knight.figure;
    const startY = figure.position.y;
    dust.puff(new THREE.Vector3(figure.position.x, DUST_Y, figure.position.z));
    await clock.tween(0.35, (t) => {
      knight.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      figure.position.y = startY * (1 - t * t);
    });
    knight.pedestal.visible = false;
  }

  // Salto en arco de una figura de `from` a `to` (puntos del tablero), sin girarla.
  function jumpArc(figure, from, to, seconds, height) {
    return clock.tween(seconds, (t) => {
      figure.position.lerpVectors(from, to, t);
      figure.position.y += Math.sin(Math.PI * t) * height;
    });
  }

  // De los dos lados de `at`, a `distance` y con la figura mirando a `facing`, el que queda más lejos de
  // las demás piezas.
  function clearestSide(at, facing, distance) {
    const v = new THREE.Vector3();
    const others = pieces()
      .filter((entry) => entry !== owner && entry.piece.object.visible)
      .map((entry) => entry.piece.figure.getWorldPosition(v).clone());
    const spots = [1, -1].map((side) => ({ x: at.x + Math.cos(facing) * distance * side, z: at.z - Math.sin(facing) * distance * side }));
    const space = (spot) => Math.min(Infinity, ...others.map((o) => Math.hypot(o.x - spot.x, o.z - spot.z)));
    return space(spots[0]) >= space(spots[1]) ? spots[0] : spots[1];
  }

  // El jinete anda, ya sin peana ni caballo, desde donde está hasta `to` ({x, z}).
  async function walkTo(to) {
    const figure = rider.figure;
    const from = { x: figure.position.x, z: figure.position.z };
    const walk = planWalk(from, to, rider.walkSpeed);
    if (walk.distance < 1e-3) return;
    await turnFigure(figure, walk.heading, 0.2);
    rider.play('walk', { fade: 0.15 });
    await clock.tween(walk.duration, (t) => {
      const p = pointAlong(from, to, t);
      figure.position.set(p.x, 0, p.z);
    });
    rider.play('idle', { fade: 0.25 });
  }

  // El caballo, sin jinete, anda hasta `to` pidiendo sitio por delante. Con `backwards`, retrocede sin
  // girarse.
  async function horseWalk(to, { speed = 1, backwards = false } = {}) {
    const figure = horse.figure;
    const from = { x: figure.position.x, z: figure.position.z };
    const walk = planWalk(from, to, horse.walkSpeed * speed);
    if (walk.distance < 1e-3) return;
    looseLegs();
    if (!backwards) await turnFigure(figure, walk.heading, 0.3);
    heading = { x: to.x, z: to.z };
    const action = horse.play('walk', { fade: 0.2 });
    if (action) {
      action.paused = false;
      action.timeScale = backwards ? -speed : speed;
    }
    try {
      await clock.tween(walk.duration, (t) => {
        const p = pointAlong(from, to, t);
        figure.position.set(p.x, 0, p.z);
      });
    } finally {
      heading = null;
      if (action) action.timeScale = 1;
    }
    stillHorse();
  }

  // Desenvaina: la espada aparece en la mano, creciendo.
  async function drawSword() {
    const sword = rider.props.sword;
    if (!sword || sword.visible) return;
    sword.scale.setScalar(0.001);
    sword.visible = true;
    await clock.tween(SWORD_SECONDS, (t) => sword.scale.setScalar(Math.max(0.001, swordScale * t)));
  }

  // Envaina: la espada encoge hasta desaparecer.
  async function sheathSword() {
    const sword = rider.props.sword;
    if (!sword?.visible) return;
    await clock.tween(SWORD_SECONDS, (t) => sword.scale.setScalar(Math.max(0.001, swordScale * (1 - t))));
    sword.visible = false;
    sword.scale.setScalar(swordScale);
  }

  // Borde del tablero más cercano por el que puede huir el caballo desde `point` sin cruzar la pelea
  // (`avoid`, {x, z}).
  function exitAwayFrom(point, avoid) {
    const exits = [
      { x: BOARD_EDGE, z: point.z }, { x: -BOARD_EDGE, z: point.z },
      { x: point.x, z: BOARD_EDGE }, { x: point.x, z: -BOARD_EDGE },
    ].sort((a, b) => Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z));
    return exits.find((exit) => !avoid || segmentDistance(avoid, point, exit) > AVOID) ?? nearestEdgeExit(point);
  }

  // El caballo sin jinete huye andando deprisa hasta el borde del tablero y desaparece tras él.
  function horseFlee({ avoid = null } = {}) {
    if (!horse?.object.visible || knight.mounted) return leaving ?? Promise.resolve();
    leaving = (async () => {
      const figure = horse.figure;
      const exit = exitAwayFrom({ x: figure.position.x, z: figure.position.z }, avoid);
      fled = exit;
      await horseWalk(exit, { speed: FLEE_SPEED });
      dust.puff(new THREE.Vector3(exit.x, DUST_Y, exit.z), { count: 10, radius: 0.5, duration: 0.5 });
      await clock.tween(0.4, (t) => {
        figure.position.y = -DROP * t;
        figure.scale.setScalar(Math.max(0.001, 1 - t));
      });
      horse.object.visible = false;
      figure.position.y = 0;
      leaving = null;
    })();
    return leaving;
  }

  // Sentado en el suelo, con las piernas estiradas hacia delante; con `false`, las piernas sueltas.
  function sit(sitting) {
    for (const bone of ['L_Thigh', 'R_Thigh']) rider.turnBone(bone, sitting ? { x: -90 } : null);
  }

  // Se levanta del suelo: con su animación, si la tiene; si no, con un saltito.
  async function standUp() {
    const figure = rider.figure;
    const startY = figure.position.y;
    if (rider.has('getup')) {
      sit(false);
      figure.position.y = 0;
      await rider.playOnce('getup', { fade: 0.1 });
      rider.play('idle', { fade: 0.2 });
      return;
    }
    await clock.tween(GETUP_SECONDS, (t) => {
      for (const bone of ['L_Thigh', 'R_Thigh']) rider.turnBone(bone, { x: -90 * (1 - t) });
      figure.position.y = startY * (1 - t) + Math.sin(Math.PI * t) * 0.15;
    });
    sit(false);
    figure.position.y = 0;
  }

  // Salta de la silla a un lado, clava la lanza junto a él, el caballo retrocede y espera, y el jinete va
  // a su puesto.
  async function jumpOff(at, facing) {
    const side = clearestSide(at, facing, JUMP_OFF_SIDE);
    const from = rider.figure.getWorldPosition(new THREE.Vector3());
    knight.unseatRider();
    rider.play(rider.has('jump') ? 'jump' : 'idle', { loop: false, fade: 0.1 });
    await jumpArc(rider.figure, from, new THREE.Vector3(side.x, 0, side.z), 0.5, 0.25);
    dust.puff(new THREE.Vector3(side.x, DUST_Y, side.z), { count: 6, radius: 0.35, duration: 0.3 });
    rider.play('idle', { fade: 0.25 });
    const out = Math.hypot(side.x - at.x, side.z - at.z) || 1;
    rider.plantSpear({ x: side.x + ((side.x - at.x) / out) * SPEAR_BESIDE, z: side.z + ((side.z - at.z) / out) * SPEAR_BESIDE });
    await horseWalk(clampToBoard({ x: at.x - Math.sin(facing) * BACK_OFF, z: at.z - Math.cos(facing) * BACK_OFF }), { backwards: true });
    await walkTo(at);
  }

  // El caballo se encabrita y lo tira: cae sentado entre polvo y estrellitas, la lanza sale volando, el
  // caballo huye y el jinete se levanta y va a su puesto.
  async function thrownOff(at, facing) {
    const figure = horse.figure;
    looseLegs();
    const rearUp = (k) => {
      figure.rotation.x = -THROW_REAR * k;
      figure.position.y = knight.mount.hoofBack * Math.sin(THROW_REAR * k);
    };
    await clock.tween(REAR_SECONDS, (t) => rearUp(Math.sin((Math.PI / 2) * t)));
    const from = rider.figure.getWorldPosition(new THREE.Vector3());
    knight.unseatRider();
    spearThrown = true;
    rider.throwSpear({ x: -Math.sin(facing), z: -Math.cos(facing) });
    const side = clearestSide(at, facing, JUMP_OFF_SIDE);
    const ground = new THREE.Vector3(side.x - Math.sin(facing) * 0.3, 0, side.z - Math.cos(facing) * 0.3);
    sit(true);
    await Promise.all([
      jumpArc(rider.figure, from, new THREE.Vector3(ground.x, SIT_HEIGHT - knight.hipHeight, ground.z), THROW_SECONDS, 0.4),
      clock.tween(REAR_SECONDS, (t) => rearUp(1 - t)),
    ]);
    figure.rotation.x = 0;
    figure.position.y = 0;
    stillHorse();
    dust.puff(ground.setY(DUST_Y), { count: 14, radius: 0.6, duration: 0.6 });
    cinema.shake(0.08);
    fx.koStars(rider.object.getObjectByName('Head') ?? rider.figure, { seconds: DAZE_SECONDS });
    horseFlee({ avoid: at });
    await clock.wait(DAZE_SECONDS);
    await standUp();
    await walkTo(at);
  }

  // Baja del caballo para pelear en `at` ({x, z}), mirando a `facing`, y desenvaina. `mode` es 'dismount'
  // (salta de la silla y el caballo espera apartado) o 'thrown' (el caballo lo tira y huye; la huida
  // sigue sola, en `horseLeaving`). Sin caballo, baja de la peana y va andando.
  async function dismount({ at, facing, mode = 'dismount' }) {
    knight.resting = false;
    await stopGesture();
    await leavePedestal();
    if (!knight.mounted) {
      await walkTo(at);
    } else {
      await turnTo(facing, 0.25);
      if (mode === 'thrown') await thrownOff(at, facing);
      else await jumpOff(at, facing);
    }
    await turnFigure(rider.figure, facing, 0.2);
    await drawSword();
  }

  // El caballo vuelve hasta `to` ({x, z}): si había huido, espera a que acabe de irse, reaparece en el
  // borde por donde se fue y entra en el tablero; después salta.
  async function horseComes(to) {
    const figure = horse.figure;
    if (leaving) await leaving;
    if (fled) {
      const inside = clampToBoard(fled);
      figure.position.set(fled.x, 0, fled.z);
      figure.rotation.set(0, Math.atan2(inside.x - fled.x, inside.z - fled.z), 0);
      figure.scale.setScalar(0.001);
      horse.object.visible = true;
      dust.puff(new THREE.Vector3(fled.x, DUST_Y, fled.z), { count: 10, radius: 0.5, duration: 0.5 });
      await clock.tween(0.3, (t) => figure.scale.setScalar(Math.max(0.001, t)));
      await horseWalk(inside);
      fled = null;
    }
    await leap({ figure, to, footprint: knight.mount, horseMoves: true, extra: [rider.object] });
    stillHorse();
  }

  // Tras ganar, en la casilla `target`: el jinete se aparta a un lado de su centro, el caballo se reúne
  // con él de un salto, el jinete envaina, monta de otro salto y recoge la lanza (si salió volando, le
  // aparece en la mano entre polvo) y la peana crece bajo los cascos.
  async function mount(target) {
    const center = board.squareToWorld(target);
    if (!horse) {
      await walkTo(center);
      await sheathSword();
      rider.holdSpear();
      await rise(center);
      square = target;
      knight.resting = knight.mounted;
      return;
    }
    const side = clearestSide(center, restFacing, JUMP_OFF_SIDE);
    await walkTo(side);
    await Promise.all([horseComes(center), sheathSword()]);
    await Promise.all([turnFigure(horse.figure, restFacing, 0.3), turnFigure(rider.figure, restFacing, 0.3)]);
    const from = rider.figure.getWorldPosition(new THREE.Vector3());
    const seatAt = horse.figure.localToWorld(new THREE.Vector3(knight.mount.riderOffset.x, knight.mount.riderOffset.y, knight.mount.riderOffset.z));
    rider.play(rider.has('jump') ? 'jump' : 'idle', { loop: false, fade: 0.1 });
    await jumpArc(rider.figure, from, seatAt, MOUNT_SECONDS, 0.35);
    knight.seatRider();
    rider.play('idle', { fade: 0.2 });
    const planted = rider.props.spear && !spearThrown ? rider.props.spear.getWorldPosition(new THREE.Vector3()) : null;
    rider.holdSpear();
    if (planted) dust.puff(planted.setY(DUST_Y), { count: 6, radius: 0.3, duration: 0.3 });
    const hand = rider.props.spear?.getWorldPosition(new THREE.Vector3());
    if (hand) dust.puff(hand, { count: spearThrown ? 8 : 4, radius: 0.25, duration: 0.3 });
    spearThrown = false;
    await rise(center);
    square = target;
    knight.resting = knight.mounted;
  }

  // El jinete vencido desaparece encogiendo en una nube de polvo, y el caballo que esperaba huye sin
  // cruzar la pelea (`avoid`).
  async function defeated({ avoid = null } = {}) {
    const at = rider.figure.getWorldPosition(new THREE.Vector3());
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    const escape = horseFlee({ avoid });
    await clock.tween(0.5, (t) => rider.figure.scale.setScalar(Math.max(0.001, 1 - t * t)));
    rider.object.visible = false;
    await escape;
    knight.object.visible = false;
  }

  // Desaparece del tablero encogiendo dentro de una nube de polvo (capturas sin batalla).
  async function vanish() {
    const at = knight.figure.getWorldPosition(new THREE.Vector3());
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await clock.tween(0.5, (t) => {
      const k = Math.max(0.001, 1 - t * t);
      knight.pedestal.scale.setScalar(k);
      if (horse) horse.figure.scale.setScalar(k);
      if (!knight.mounted) rider.figure.scale.setScalar(k);
    });
    knight.object.visible = false;
  }

  return {
    placeOn,
    goTo,
    vanish,
    room,
    turnTo,
    leapTo,
    fidget,
    stopGesture,
    leavePedestal,
    dismount,
    walkTo,
    drawSword,
    horseFlee,
    mount,
    defeated,
    sit,
    standUp,
    get horseLeaving() {
      return leaving;
    },
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
