import * as THREE from 'three';

// Marcas sobre el tablero, en un arcoíris de neón que no para de cambiar: un aro bajo la pieza elegida
// que late, respira y suelta una onda en cada latido, con los colores dándole vueltas; un punto de luz
// en cada casilla a la que puede ir, del color que tiene el aro mirando hacia él y con ondas de color
// que salen de la pieza hacia fuera; y una diana bajo cada enemigo que puede comerse. Lo único que no
// es arcoíris es el aro ROJO bajo el rey en jaque, que tiene que saltar a la vista. Sin sombras ni luz
// propia, para que se lean bien sobre la madera.

const LIFT = 0.006; // justo por encima de las casillas para no parpadear con ellas
const HOVER_LIFT = 0.009; // y el contorno del ratón, por encima de todo lo demás
const HOVER_GLIDE = 0.07; // segundos que tarda en deslizarse de una casilla a la vecina
const HOVER_BEAT = 2.4; // radianes por segundo del latido: una respiración, no un parpadeo
const HOVER_LOW = 0.3;
const HOVER_HIGH = 0.95;
// El aro de la pieza elegida: un tubo de neón que late —se enciende y se apaga, y respira de tamaño—,
// suelta una onda en cada latido y gira, para que los colores corran por él.
const NEON_SIZE = 1.3; // lado del cuadrado donde va pintado, en casillas
const NEON_BEAT = 4.2; // radianes por segundo del latido: uno cada segundo y medio
const NEON_SPIN = 1.3; // y del giro: los colores dan la vuelta al aro en unos 5 s
const NEON_LOW = 0.5;
const NEON_HIGH = 1;
const NEON_BREATH = 0.07; // lo que crece y encoge al latir
const WAVE_GROWTH = 0.7; // la onda de cada latido se abre hasta 1,7 veces el aro mientras se apaga
const WAVE_OPACITY = 0.85;
const CAPTURE_SPIN = 1.8; // la diana gira al revés que el aro, y más deprisa
const CHECK_SPIN = 1.2;
const HUE_SPREAD = 0.06; // lo que cambia el color de un punto por cada casilla que se aleja de la pieza

// El contorno que sigue al ratón, dibujado en un lienzo: un marco blanco de esquinas redondeadas con
// su halo, como un led encendido sobre la madera. En textura y no con geometría porque así el borde
// sale difuminado y no se ve el filo del polígono.
function hoverTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // El marco ocupa casi toda la casilla, pero no del todo: pegado al borde se confunde con la junta
  // entre casillas y deja de leerse como una marca.
  const inset = 13;
  const radius = 26;
  const marco = () => {
    ctx.beginPath();
    const lado = size - inset * 2;
    if (ctx.roundRect) ctx.roundRect(inset, inset, lado, lado, radius);
    else ctx.rect(inset, inset, lado, lado); // navegadores viejos: esquinas vivas, pero se ve
  };

  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; // un velo dentro, para saber qué casilla es
  marco();
  ctx.fill();

  ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'; // el halo
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 7;
  marco();
  ctx.stroke();

  ctx.shadowBlur = 0; // y el filamento, fino y nítido
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.lineWidth = 3;
  marco();
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// El arcoíris: los seis colores del círculo cromático con la luz de un neón (HSL con L al 60 %). Entre
// dos seguidos el lienzo mezcla en línea recta, que es justo como va el círculo cromático: el punto del
// degradado ES el tono. Por eso los puntos pueden copiar con setHSL el color del aro.
const TONOS = ['rgb(255, 51, 51)', 'rgb(255, 255, 51)', 'rgb(51, 255, 51)', 'rgb(51, 255, 255)', 'rgb(51, 51, 255)', 'rgb(255, 51, 255)'];
const LUZ = 0.6;

// El aro de neón, pintado en un lienzo: el halo, ancho y del color de la paleta; encima el tubo, con
// su resplandor, y dentro del tubo un filamento más claro, que es lo que hace que un neón parezca
// encendido y no pintado. El arcoíris se pinta en blanco y luego se tiñe entero con los colores
// repartidos en círculo, así el halo y el resplandor llevan en cada punto el color del tubo. Se pinta
// encima de la madera, no sumado a ella: sumado, sobre el roble claro salía casi blanco.
const ARCOIRIS = {
  halo: ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.7)', 'rgba(255, 255, 255, 0.4)', 'rgba(255, 255, 255, 0)'],
  tubo: ['#fff', '#fff', '#fff', '#fff'],
  sombra: '#fff',
  filamento: ['rgb(255, 255, 255)', 'rgba(255, 255, 255, 0.85)'],
  tinte: TONOS,
};
const ROJO = {
  halo: ['rgba(255, 20, 0, 0)', 'rgba(255, 40, 20, 0.5)', 'rgba(255, 60, 30, 0.75)', 'rgba(255, 30, 10, 0.45)', 'rgba(255, 0, 0, 0)'],
  tubo: ['rgb(255, 90, 40)', 'rgb(255, 30, 30)', 'rgb(255, 0, 90)', 'rgb(255, 50, 20)'],
  sombra: 'rgb(255, 30, 0)',
  filamento: ['rgb(255, 170, 120)', 'rgba(255, 220, 190, 0.9)'],
};

function neonTexture(paleta = ARCOIRIS, { radio: r = 0.45, grosor = 1 } = {}) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const radio = size * (r / NEON_SIZE); // el tubo, a `r` casillas del centro
  const aro = (width) => {
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(c, c, radio, 0, Math.PI * 2);
    ctx.stroke();
  };

  const halo = ctx.createRadialGradient(c, c, radio - size * 0.075 * grosor, c, c, radio + size * 0.095 * grosor);
  [0, 0.4, 0.5, 0.62, 1].forEach((t, i) => halo.addColorStop(t, paleta.halo[i]));
  ctx.strokeStyle = halo;
  aro(size * 0.17 * grosor);

  let tubo = paleta.tubo[1];
  if (ctx.createConicGradient) {
    tubo = ctx.createConicGradient(0, c, c);
    [0, 0.3, 0.55, 0.8].forEach((t, i) => tubo.addColorStop(t, paleta.tubo[i]));
    tubo.addColorStop(1, paleta.tubo[0]);
  }
  ctx.shadowColor = paleta.sombra;
  ctx.shadowBlur = size * 0.035 * grosor;
  ctx.strokeStyle = tubo;
  aro(size * 0.032 * grosor);

  if (paleta.tinte) colorea(ctx, size, paleta.tinte);

  ctx.shadowBlur = size * 0.01;
  ctx.shadowColor = paleta.filamento[0];
  ctx.strokeStyle = paleta.filamento[1];
  aro(size * 0.008 * Math.max(1, grosor));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Tiñe lo ya pintado con los colores dados, repartidos en círculo alrededor del centro (el primero a la
// derecha y los demás en el sentido de las agujas del reloj), sin tocar su transparencia.
function colorea(ctx, size, colores) {
  const c = size / 2;
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.shadowBlur = 0;
  if (ctx.createConicGradient) {
    const tinte = ctx.createConicGradient(0, c, c);
    colores.forEach((color, i) => tinte.addColorStop(i / colores.length, color));
    tinte.addColorStop(1, colores[0]);
    ctx.fillStyle = tinte;
    ctx.fillRect(0, 0, size, size);
  } else {
    // Navegadores sin degradado cónico: por gajos, un poco solapados para que no se vean las juntas.
    const gajos = 180;
    for (let i = 0; i < gajos; i++) {
      ctx.fillStyle = `hsl(${(i / gajos) * 360}, 100%, ${LUZ * 100}%)`;
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, size, (i / gajos) * Math.PI * 2, ((i + 1.5) / gajos) * Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// El punto de luz de una casilla libre va en dos capas: el halo, en blanco para teñirlo del color que
// le toque en cada momento, y encima el núcleo, que se queda blanco, como el filamento del aro.
const DOT_HALO = [[0, 1], [0.3, 0.85], [0.55, 0.3], [1, 0]];
const DOT_CORE = [[0, 1], [0.12, 0.9], [0.26, 0]];

function dotTexture(paradas) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  for (const [t, alfa] of paradas) g.addColorStop(t, `rgba(255, 255, 255, ${alfa})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const neonMaterial = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, toneMapped: false });

// LA JUGADA SEÑALADA (el historial, punto 11): una flecha de luz suave de una casilla a otra que se
// enciende, se queda un rato y se apaga. Discreta y de otro color que lo demás: no es una pieza elegida
// ni un sitio al que ir, es una jugada ya hecha.
const TRAIL_SECONDS = 3.2; // lo que se queda encendida
const TRAIL_IN = 0.25;
const TRAIL_OUT = 0.7;
const TRAIL_OPACITY = 0.85;
const TRAIL_COLOR = '#ffcf6b';
const TRAIL_SHAFT = 0.14; // ancho del palo de la flecha, en casillas
const TRAIL_HEAD = { width: 0.42, length: 0.36 };
const TRAIL_CLEAR = 0.4; // lo que se aparta de los centros: debajo están las peanas
const TRAIL_LIFT = 0.008;
// LA ÚLTIMA JUGADA (punto 14): la misma flecha, más fina, tenue y quieta, hasta la jugada siguiente. Que
// se vea qué se movió sin que pinte el tablero (el tinte amarillo de las casillas se quitó por eso).
const LAST_OPACITY = 0.3;
const LAST_COLOR = '#fff0c8';
const LAST_SHAFT = 0.09;
const LAST_HEAD = { width: 0.3, length: 0.26 };
const LAST_IN = 0.5; // segundos en encenderse

export function createHighlights(scene, board) {
  const ringMaterial = new THREE.MeshBasicMaterial({
    map: neonTexture(ARCOIRIS),
    transparent: true,
    depthWrite: false,
    toneMapped: false, // que el mapeo de tonos no lo apague: un neón es más vivo que la escena
  });
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(NEON_SIZE, NEON_SIZE), ringMaterial);
  ring.name = 'aro';
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 1;
  ring.visible = false;
  scene.add(ring);

  // La onda que suelta el aro en cada latido: el mismo neón, más fino, que se abre y se apaga.
  const waveMaterial = neonMaterial(neonTexture(ARCOIRIS, { radio: 0.45, grosor: 0.55 }));
  const wave = new THREE.Mesh(new THREE.PlaneGeometry(NEON_SIZE, NEON_SIZE), waveMaterial);
  wave.name = 'onda';
  wave.rotation.x = -Math.PI / 2;
  wave.renderOrder = 0.5; // por debajo del aro
  wave.visible = false;
  scene.add(wave);

  const dotGeometry = new THREE.PlaneGeometry(0.64, 0.64);
  const dotHalo = dotTexture(DOT_HALO);
  const coreMaterial = neonMaterial(dotTexture(DOT_CORE));
  const dots = []; // { mesh, material }: cada punto lleva su material, porque cada uno va de su color

  // La diana bajo cada enemigo que se puede comer: el mismo neón, más fino y latiendo más deprisa.
  const captureGeometry = new THREE.PlaneGeometry(NEON_SIZE, NEON_SIZE);
  const captureMaterial = neonMaterial(neonTexture(ARCOIRIS, { radio: 0.42, grosor: 0.7 }));
  const captureRings = [];

  // El rey en jaque: el mismo aro, en rojo.
  const checkMaterial = neonMaterial(neonTexture(ROJO, { radio: 0.44, grosor: 1.15 }));
  const checkRing = new THREE.Mesh(new THREE.PlaneGeometry(NEON_SIZE, NEON_SIZE), checkMaterial);
  checkRing.rotation.x = -Math.PI / 2;
  checkRing.renderOrder = 1;
  checkRing.visible = false;
  scene.add(checkRing);

  // El contorno de la casilla que hay bajo el ratón: lo que se elegiría al pulsar.
  const hoverMaterial = new THREE.MeshBasicMaterial({
    map: hoverTexture(),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending, // se enciende sobre la madera en vez de pintarla de blanco
  });
  const hoverMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), hoverMaterial);
  hoverMesh.name = 'contorno';
  hoverMesh.rotation.x = -Math.PI / 2;
  hoverMesh.position.y = HOVER_LIFT;
  hoverMesh.renderOrder = 2;
  hoverMesh.visible = false;
  scene.add(hoverMesh);
  let hovered = null; // la casilla que señala ahora
  let hoverAge = 0; // lo que lleva encendido, para que entre suave

  function select(square) {
    ring.visible = wave.visible = Boolean(square);
    if (!square) return;
    ring.position.copy(board.squareToWorld(square)).setY(LIFT);
    wave.position.copy(ring.position);
  }

  // El rey en jaque (su casilla), o null.
  function check(square) {
    checkRing.visible = Boolean(square);
    if (square) checkRing.position.copy(board.squareToWorld(square)).setY(LIFT * 1.2);
  }


  function showMoves(squares) {
    for (const dot of dots) {
      scene.remove(dot.mesh);
      dot.material.dispose();
    }
    dots.length = 0;
    for (const square of squares) {
      const material = neonMaterial(dotHalo);
      const mesh = new THREE.Mesh(dotGeometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(board.squareToWorld(square)).setY(LIFT);
      const core = new THREE.Mesh(dotGeometry, coreMaterial);
      core.renderOrder = 1; // por encima de su halo
      mesh.add(core);
      scene.add(mesh);
      dots.push({ mesh, material });
    }
  }

  // La diana bajo cada enemigo que la pieza elegida puede comerse.
  function showCaptures(squares) {
    for (const mark of captureRings) scene.remove(mark);
    captureRings.length = 0;
    for (const square of squares) {
      const mark = new THREE.Mesh(captureGeometry, captureMaterial);
      mark.rotation.x = -Math.PI / 2;
      mark.position.copy(board.squareToWorld(square)).setY(LIFT);
      scene.add(mark);
      captureRings.push(mark);
    }
  }

  // La casilla bajo el ratón, o null si no señala ninguna.
  function hover(square) {
    if (square === hovered) return;
    hovered = square;
    if (!square) return;
    const at = board.squareToWorld(square);
    if (!hoverMesh.visible) hoverMesh.position.set(at.x, HOVER_LIFT, at.z); // la primera vez, sin viaje
    hoverMesh.visible = true;
    hoverAge = 0;
  }

  // Todo late y cambia de color, y el contorno del ratón respira mientras se desliza hasta la casilla
  // que señala.
  function pulse(seconds, dt = 0) {
    const giro = seconds * NEON_SPIN; // lo que ha girado el aro: los colores corren con él
    const rapido = 0.5 + 0.5 * Math.sin(seconds * 6);
    captureMaterial.opacity = 0.6 + 0.4 * rapido;
    for (const mark of captureRings) {
      mark.scale.setScalar(1 + 0.05 * (rapido - 0.5));
      mark.rotation.z = -seconds * CAPTURE_SPIN;
    }
    // Cada punto, del color que tiene el aro mirando hacia él, y un poco más atrás en el arcoíris
    // cuanto más lejos está: así los colores salen de la pieza hacia fuera, en ondas. (El degradado
    // del aro empieza a la derecha del lienzo, que en el tablero es +x, y gira hacia +z; al girar el
    // aro un ángulo, lo que se ve en cada dirección es lo que había ese ángulo más allá.)
    const brillo = 0.75 + 0.25 * (0.5 + 0.5 * Math.sin(seconds * NEON_BEAT));
    coreMaterial.opacity = brillo;
    for (const { mesh, material } of dots) {
      const dx = mesh.position.x - ring.position.x;
      const dz = mesh.position.z - ring.position.z;
      const tono = (Math.atan2(dz, dx) + giro) / (Math.PI * 2) - Math.hypot(dx, dz) * HUE_SPREAD;
      material.color.setHSL(tono - Math.floor(tono), 1, LUZ);
      material.opacity = brillo;
    }
    if (checkRing.visible) {
      const alarma = 0.5 + 0.5 * Math.sin(seconds * 7.5);
      checkMaterial.opacity = 0.6 + 0.4 * alarma;
      checkRing.scale.setScalar(1 + 0.06 * (alarma - 0.5));
      checkRing.rotation.z = seconds * CHECK_SPIN;
    }
    if (ring.visible) {
      const fase = seconds * NEON_BEAT;
      const latido = 0.5 + 0.5 * Math.sin(fase);
      ringMaterial.opacity = NEON_LOW + (NEON_HIGH - NEON_LOW) * latido;
      ring.scale.setScalar(1 + NEON_BREATH * (latido - 0.5) * 2);
      ring.rotation.z = giro;
      // La onda nace del aro en lo más alto de cada latido y se abre mientras se apaga.
      const vueltas = fase / (Math.PI * 2) - 0.25;
      const vida = vueltas - Math.floor(vueltas);
      wave.scale.setScalar(1 + NEON_BREATH + WAVE_GROWTH * (1 - (1 - vida) ** 2));
      waveMaterial.opacity = WAVE_OPACITY * (1 - vida) ** 1.5;
      wave.rotation.z = giro;
    }
    if (!hoverMesh.visible) return;
    if (!hovered) {
      hoverAge = Math.max(0, hoverAge - dt / 0.12);
      hoverMaterial.opacity = HOVER_LOW * hoverAge;
      if (hoverAge <= 0) hoverMesh.visible = false;
      return;
    }
    const at = board.squareToWorld(hovered);
    const k = dt > 0 ? Math.min(1, dt / HOVER_GLIDE) : 1; // se desliza a la casilla nueva, no salta
    hoverMesh.position.x += (at.x - hoverMesh.position.x) * k;
    hoverMesh.position.z += (at.z - hoverMesh.position.z) * k;
    hoverAge = Math.min(1, hoverAge + dt / 0.18); // y entra encendiéndose
    const latido = 0.5 + 0.5 * Math.sin(seconds * HOVER_BEAT);
    hoverMaterial.opacity = (HOVER_LOW + (HOVER_HIGH - HOVER_LOW) * latido) * hoverAge;
  }

  // Una flecha tumbada en el tablero, de una casilla a otra: el palo se estira con lo larga que sea la
  // jugada; la punta, siempre igual.
  function arrow(material, shaftWidth, headSize) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(shaftWidth, 1).translate(0, 0.5, 0), material);
    const shape = new THREE.Shape();
    shape.moveTo(-headSize.width / 2, 0);
    shape.lineTo(headSize.width / 2, 0);
    shape.lineTo(0, headSize.length);
    shape.closePath();
    const head = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    const group = new THREE.Group();
    for (const part of [shaft, head]) {
      // Tumbadas, y de vuelta: tumbado, el «arriba» del plano (+y) queda hacia -z, y la flecha ha de
      // apuntar hacia +z del grupo.
      part.rotation.set(-Math.PI / 2, 0, Math.PI);
      part.renderOrder = 1;
      group.add(part);
    }
    group.visible = false;
    scene.add(group);
    return {
      group,
      aim(from, to) {
        const a = board.squareToWorld(from);
        const b = board.squareToWorld(to);
        const largo = Math.hypot(b.x - a.x, b.z - a.z);
        const palo = Math.max(0.05, largo - TRAIL_CLEAR * 2 - headSize.length);
        group.position.set(a.x, TRAIL_LIFT, a.z);
        group.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        shaft.scale.set(1, palo, 1);
        shaft.position.z = TRAIL_CLEAR;
        head.position.z = TRAIL_CLEAR + palo;
        group.visible = true;
      },
    };
  }

  // La jugada que se toca en el historial (`trail`): se enciende, se queda un rato y se apaga.
  const trailMaterial = new THREE.MeshBasicMaterial({ color: TRAIL_COLOR, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const trail = arrow(trailMaterial, TRAIL_SHAFT, TRAIL_HEAD);
  let trailAge = -1;

  function showTrail(from, to) {
    trail.aim(from, to);
    trailAge = 0;
  }

  function stepTrail(dt) {
    if (trailAge < 0) return;
    trailAge += dt;
    let k = 1;
    if (trailAge < TRAIL_IN) k = trailAge / TRAIL_IN;
    else if (trailAge > TRAIL_SECONDS - TRAIL_OUT) k = Math.max(0, (TRAIL_SECONDS - trailAge) / TRAIL_OUT);
    trailMaterial.opacity = TRAIL_OPACITY * k;
    if (trailAge >= TRAIL_SECONDS) {
      trailAge = -1;
      trail.group.visible = false;
    }
  }

  // La última jugada (`lastMove`): tenue y quieta hasta la siguiente; con null, ninguna.
  const lastMaterial = new THREE.MeshBasicMaterial({ color: LAST_COLOR, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const last = arrow(lastMaterial, LAST_SHAFT, LAST_HEAD);
  let lastKey = null;
  function lastMove(from, to) {
    const key = from && to ? from + to : null;
    if (key === lastKey) return;
    lastKey = key;
    if (!key) {
      last.group.visible = false;
      return;
    }
    last.aim(from, to);
    lastMaterial.opacity = 0;
  }
  function stepLast(dt) {
    if (!last.group.visible || lastMaterial.opacity >= LAST_OPACITY) return;
    lastMaterial.opacity = Math.min(LAST_OPACITY, lastMaterial.opacity + (dt / LAST_IN) * LAST_OPACITY);
  }

  function clear() {
    select(null);
    showMoves([]);
    showCaptures([]);
  }

  return {
    select,
    showMoves,
    showCaptures,
    hover,
    pulse(seconds, dt = 0) {
      stepTrail(dt);
      stepLast(dt);
      pulse(seconds, dt);
    },
    clear,
    check,
    trail: showTrail,
    lastMove,
  };
}
