import * as THREE from 'three';

// Cámara de cine del combate. Se pone de lado para encuadrar a los dos luchadores, tiembla con
// los golpes y al terminar vuelve a donde la tenía el usuario. Mientras actúa, los controles
// de órbita no responden.
//
// El encuadre del principio se hace con la casilla de la que sale el atacante, que puede estar lejos (una
// torre o un alfil que comen desde el otro lado del tablero); mientras pelean, la cámara se ajusta sola a
// donde están de verdad los dos (`watch`), así que se va acercando a medida que se juntan. Antes se
// quedaba donde la había puesto el primer encuadre: demasiado lejos de los que peleaban.

const MOVE_SECONDS = 0.8;
const SHAKE_SECONDS = 0.3;
const MIN_DISTANCE = 3.4;
const MAX_DISTANCE = 8; // aunque el atacante salga de muy lejos: el combate es cerca de la víctima
const FRAME_MARGIN = 1.4; // lo que se deja a lo ancho, además de lo que se separan: su anchura y algo de aire
const FRAME_MARGIN_TALL = 0.8; // en una pantalla vertical (el móvil), menos: si no, la cámara se iba lejísimos
const CLOSER = 0.2; // al elegir desde dónde encuadrar, lo que pesa cada unidad de distancia de más
// Lo que pesa ponerse del lado contrario al pedido (`favor`): más que una pieza en medio, que el
// atenuado la deja ver a través, y un escudo por delante no.
const FAVOR_WEIGHT = 1.5;
const LIVE_RATE = 2.2; // lo deprisa que se ajusta a los que pelean (por segundo): suave, sin tirones
const ELEVATION = 0.65; // altura de la cámara por cada casilla de distancia: mira por encima
const PIECE_TOP = 1.75; // altura de una pieza sobre su peana, para saber si tapa el encuadre
const ANGLE_STEP = Math.PI / 6; // se prueban direcciones cada 30° alrededor de la de lado
const TARGET_HEIGHT = 0.75; // a qué altura de la pieza mira la cámara
// Plano de quien gana, de frente: entero y con algo de tablero alrededor. Más cerca (a 1,2 alturas),
// al usuario le quedaba la cámara encima de la figura.
const CLOSE_LOOK = 0.55; // a qué parte de su altura mira
const CLOSE_RISE = 0.55; // lo que la cámara queda por encima de ese punto
const CLOSE_FILL = 2.1; // alturas de la pieza a las que se pone
const CLOSE_MIN = 2.6; // y nunca más cerca que esto
// Las tomas a mano (`shot`): nunca más cerca que esto, y con este aire alrededor de lo que se encuadra.
const SHOT_MIN = 1.5;
const SHOT_AIR = 1.12;
// El zoom de impacto (`punch`): se cierra de golpe y se vuelve a abrir despacio.
const PUNCH_SECONDS = 0.55;
const PUNCH_IN = 0.1; // la parte del zoom que es cerrarse
const smooth = (t) => t * t * (3 - 2 * t);

// `onShake(size)`: se avisa a quien quiera de cada temblor (la vibración del móvil).
export function createCinema(stage, { onShake = null } = {}) {
  const { camera, controls } = stage;
  let saved = null;
  let shakeLeft = 0;
  let shakeSize = 0;
  let tracked = null; // pieza a la que sigue la cámara, mientras se mueve
  const offset = new THREE.Vector3();
  const behind = new THREE.Vector3(); // lo que la cámara se queda por detrás de a quien sigue
  const aim = new THREE.Vector3();
  let aimHeight = TARGET_HEIGHT; // a qué altura mira mientras sigue a una pieza: la del encuadre que había
  let watching = null; // () => [{x, z}…]: dónde están los que pelean, para ajustar el encuadre
  let framing = null; // { dir }: desde dónde encuadra ahora (unitario, del centro a la cámara), o null
  let gliding = 0; // viajes de cámara en curso: mientras tanto, no se ajusta
  let held = false; // una toma a mano (`shot`) manda hasta que se suelte (`free`)
  let punchLeft = 0;
  let punchSize = 0;
  let punchBase = 0; // el campo de visión de verdad, mientras el zoom de impacto lo cierra
  let punchSet = 0; // y el que le ha puesto el zoom: si cambia, es que la ventana ha cambiado de tamaño
  const liveMid = new THREE.Vector3();
  const livePosition = new THREE.Vector3();

  // Si la ventana cambia de tamaño mientras encuadra, la cámara sigue donde está y, al terminar,
  // vuelve al encuadre de reposo del tamaño nuevo.
  stage.keepCamera = (view) => {
    if (!saved) return false;
    saved = { position: view.position.clone(), target: view.target.clone() };
    return true;
  };

  function glide(clock, toPosition, toTarget, { seconds = MOVE_SECONDS, ease = smooth } = {}) {
    const fromPosition = camera.position.clone().sub(offset);
    const fromTarget = controls.target.clone();
    gliding += 1;
    return clock.tween(seconds, (t) => {
      const k = ease(t);
      camera.position.lerpVectors(fromPosition, toPosition, k).add(offset);
      controls.target.lerpVectors(fromTarget, toTarget, k);
      camera.lookAt(controls.target);
    }).finally(() => {
      gliding -= 1;
    });
  }

  // Dónde mirar y a qué distancia ponerse para que quepan los puntos ({x, z}) vistos desde `dir`: lo
  // justo para que quepan a lo ancho —lo que se separan de lado, vistos desde ahí, más su anchura—, y ni
  // más cerca de MIN_DISTANCE ni más lejos de MAX_DISTANCE.
  function fit(points, dir, mid = new THREE.Vector3()) {
    mid.set(0, TARGET_HEIGHT, 0);
    for (const p of points) {
      mid.x += p.x / points.length;
      mid.z += p.z / points.length;
    }
    let lo = 0;
    let hi = 0;
    for (const p of points) {
      const side = (p.x - mid.x) * dir.z - (p.z - mid.z) * dir.x;
      lo = Math.min(lo, side);
      hi = Math.max(hi, side);
    }
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(camera.aspect, 1.6);
    const margin = camera.aspect < 1 ? FRAME_MARGIN_TALL : FRAME_MARGIN;
    const distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, (hi - lo + margin) / (2 * halfWidth)));
    return { mid, distance };
  }

  const cameraAt = (mid, dir, distance, out = new THREE.Vector3()) => out.copy(mid).addScaledVector(dir, distance).setY(mid.y + distance * ELEVATION);

  // A qué distancia ponerse para que quepa una caja de `width` de ancho por `height` de alto.
  function fitBox({ width, height }) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    return Math.max(SHOT_MIN, width / 2 / tanH, height / 2 / tanV) * SHOT_AIR;
  }

  return {
    get active() {
      return saved !== null;
    },

    // Encuadra a los luchadores en `a` y `b` ({x, z}) desde arriba y, a ser posible, de lado.
    // Prueba direcciones cada 30° alrededor de las dos de lado y se queda con la que menos
    // piezas (`obstacles`, {x, z}) meten entre la cámara y el combate. Penaliza un poco alejarse
    // de lado y el lado contrario al de la cámara del usuario.
    // `favor` ({x, z}, opcional): el lado desde el que conviene mirar —el del arma del atacante: desde el
    // del escudo, el escudo tapaba el golpe—.
    frame(clock, a, b, obstacles = [], { favor = null } = {}) {
      tracked = null;
      held = false;
      if (!saved) saved = { position: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      const center = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const toUser = new THREE.Vector3(saved.position.x - center.x, 0, saved.position.z - center.z);
      const sideways = Math.atan2(b.x - a.x, -(b.z - a.z)); // ángulo (en x, z) perpendicular a la línea
      let best = null;
      for (const base of [sideways, sideways + Math.PI]) {
        for (const step of [0, 1, -1, 2, -2]) {
          const angle = base + step * ANGLE_STEP;
          const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
          const { mid, distance } = fit([a, b], dir);
          const blockers = obstacles.filter((o) => {
            const along = (o.x - mid.x) * dir.x + (o.z - mid.z) * dir.z;
            const aside = Math.abs((o.x - mid.x) * dir.z - (o.z - mid.z) * dir.x);
            return along > 0.3 && along < distance && aside < 0.55 && 0.75 + ELEVATION * along < PIECE_TOP;
          }).length;
          // Mejor de lado, pero también mejor de cerca: en una pantalla vertical, de lado solo caben los
          // dos desde muy lejos, y un plano de tres cuartos los pone uno más cerca que el otro y cabe mucho
          // más cerca. Por eso ahí ladearse penaliza menos.
          const wrongSide = favor && dir.x * favor.x + dir.z * favor.z < 0 ? FAVOR_WEIGHT : 0;
          const score = blockers + Math.abs(step) * 0.3 * Math.min(1, camera.aspect) + (dir.dot(toUser) < 0 ? 0.2 : 0)
            + distance * CLOSER + wrongSide;
          if (!best || score < best.score) best = { score, dir, mid, distance };
        }
      }
      framing = { dir: best.dir };
      return glide(clock, cameraAt(best.mid, best.dir, best.distance), best.mid);
    },

    // Dónde están los que pelean (`at` → [{x, z}…]), para que el encuadre de `frame` se ajuste a ellos
    // mientras dure: desde el mismo lado, solo acercándose o alejándose y corriéndose con ellos. null, deja
    // de ajustarse.
    watch(at) {
      watching = at ?? null;
    },

    // PRIMER PLANO de quien ha ganado, de frente: la cámara se le pone delante —hacia donde mira—, a la
    // altura de su pecho, y lo mira. Si alguna pieza (`obstacles`, {x, z}) se mete en medio, prueba
    // ladeándose de 30 en 30°, y se queda con la que menos tapa, mejor cuanto más de frente.
    closeUp(clock, piece, obstacles = []) {
      tracked = null;
      held = false;
      framing = null; // el primer plano manda: ya no se ajusta a los dos
      if (!saved) saved = { position: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      const at = piece.figure.getWorldPosition(new THREE.Vector3());
      const facing = piece.figure.rotation.y;
      const height = piece.height ?? PIECE_TOP;
      const look = new THREE.Vector3(at.x, height * CLOSE_LOOK, at.z);
      const distance = Math.max(CLOSE_MIN, height * CLOSE_FILL);
      let best = null;
      for (const step of [0, 1, -1, 2, -2]) {
        const angle = facing + step * ANGLE_STEP;
        const dir = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        const blockers = obstacles.filter((o) => {
          const along = (o.x - at.x) * dir.x + (o.z - at.z) * dir.z;
          const aside = Math.abs((o.x - at.x) * dir.z - (o.z - at.z) * dir.x);
          return along > 0.3 && along < distance + 0.3 && aside < 0.5;
        }).length;
        const score = blockers + Math.abs(step) * 0.35;
        if (!best || score < best.score) best = { score, dir };
      }
      const position = look.clone().addScaledVector(best.dir, distance).add(new THREE.Vector3(0, CLOSE_RISE, 0));
      return glide(clock, position, look);
    },

    // UNA TOMA A MANO: un travelling, una grúa, un acercamiento… lo que pida el combate en cada momento
    // (subir a ver la tormenta, irse a la cara del que la recibe). Mira a `look` desde `dir` (en el suelo;
    // por defecto, desde donde encuadra ahora), a `distance` —o a la que haga falta para que quepa `box`,
    // { width, height }— y con la cámara `rise` por encima de lo que mira (por debajo, un contrapicado).
    // Hasta que se suelte (`free`), el encuadre automático no la toca.
    shot(clock, { look, dir = null, distance = null, box = null, rise = null, seconds = MOVE_SECONDS, ease = smooth }) {
      tracked = null;
      if (!saved) saved = { position: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      held = true;
      const desde = (dir ? dir.clone() : framing?.dir.clone() ?? camera.position.clone().sub(look)).setY(0).normalize();
      const lejos = distance ?? fitBox(box ?? { width: 2, height: 2 });
      const position = look.clone().addScaledVector(desde, lejos);
      position.y = look.y + (rise ?? lejos * ELEVATION);
      return glide(clock, position, look, { seconds, ease });
    },

    // Suelta la toma a mano: el encuadre automático vuelve, suave, a los que pelean.
    free() {
      held = false;
    },

    // Desde dónde encuadra ahora (unitario, en el suelo, del centro a la cámara), o null.
    side() {
      return framing ? framing.dir.clone() : null;
    },

    // ZOOM DE IMPACTO: el plano se cierra de golpe un `size` (0,1 es un 10 %) y se vuelve a abrir.
    punch(size = 0.1) {
      if (punchLeft <= 0) {
        punchBase = camera.fov;
        punchSet = 0;
      }
      punchLeft = PUNCH_SECONDS;
      punchSize = size;
    },

    // Sigue a una pieza que se mueve: la cámara mantiene el encuadre de ahora y viaja con ella, que
    // se queda en el centro. `at` devuelve dónde está ({x, z}); con null, deja de seguirla. Solo
    // mientras la cámara es del cine: si es la del usuario, no se la toca.
    follow(at) {
      if (!at || !saved) {
        tracked = null;
        return false;
      }
      const point = at();
      aimHeight = controls.target.y;
      aim.set(point.x, aimHeight, point.z);
      behind.copy(camera.position).sub(offset).sub(aim);
      tracked = at;
      return true;
    },

    shake(size) {
      shakeLeft = SHAKE_SECONDS;
      shakeSize = size;
      onShake?.(size);
    },

    // Cada fotograma, antes de que los controles de órbita lean la cámara: quita el temblor del
    // fotograma anterior, para que no se les acumule (también tiembla fuera del combate).
    settle() {
      camera.position.sub(offset);
      offset.set(0, 0, 0);
    },

    // Cada fotograma, en tiempo real, después de mover la cámara: pone el temblor de este.
    update(dt) {
      if (tracked) {
        const point = tracked();
        aim.set(point.x, aimHeight, point.z);
        camera.position.copy(aim).add(behind);
        controls.target.copy(aim);
        camera.lookAt(aim);
      } else if (watching && framing && !gliding && !held && saved) {
        const points = watching();
        if (points?.length) {
          const { distance } = fit(points, framing.dir, liveMid);
          const k = 1 - Math.exp(-dt * LIVE_RATE);
          camera.position.lerp(cameraAt(liveMid, framing.dir, distance, livePosition), k);
          controls.target.lerp(liveMid, k);
          camera.lookAt(controls.target);
        }
      }
      if (shakeLeft > 0) {
        shakeLeft = Math.max(0, shakeLeft - dt);
        const k = shakeSize * (shakeLeft / SHAKE_SECONDS);
        offset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      } else {
        offset.set(0, 0, 0);
      }
      camera.position.add(offset);
      if (punchLeft > 0) {
        if (punchSet && camera.fov !== punchSet) punchBase = camera.fov; // la ventana ha cambiado
        punchLeft = Math.max(0, punchLeft - dt);
        const u = 1 - punchLeft / PUNCH_SECONDS;
        const cierra = u < PUNCH_IN ? u / PUNCH_IN : (1 - (u - PUNCH_IN) / (1 - PUNCH_IN)) ** 2;
        camera.fov = punchLeft > 0 ? punchBase / (1 + punchSize * cierra) : punchBase;
        punchSet = punchLeft > 0 ? camera.fov : 0;
        camera.updateProjectionMatrix();
      }
    },

    // Vuelve a la cámara del usuario y le devuelve los controles.
    async restore(clock) {
      tracked = null;
      framing = null;
      held = false;
      if (!saved) return;
      await glide(clock, saved.position, saved.target);
      camera.position.sub(offset);
      offset.set(0, 0, 0);
      shakeLeft = 0;
      saved = null;
      controls.enabled = true;
    },

    // Vuelta inmediata, para errores.
    reset() {
      tracked = null;
      framing = null;
      held = false;
      if (punchLeft > 0) {
        punchLeft = 0;
        camera.fov = punchBase;
        camera.updateProjectionMatrix();
      }
      if (!saved) return;
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
      camera.lookAt(controls.target);
      offset.set(0, 0, 0);
      shakeLeft = 0;
      saved = null;
      controls.enabled = true;
    },
  };
}
