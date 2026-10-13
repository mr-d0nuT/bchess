// EL ENROQUE: LA TORRE SALTA POR ENCIMA DEL REY. Es la única vez en el ajedrez, con el caballo, que una pieza pasa
// por encima de otra, y así se hace con la mano: el rey va dos casillas hacia la torre y la torre salta al otro lado
// del rey. Antes el rey iba primero y luego la torre, hecha gigante, pasaba andando a través de él (lo vio el
// usuario: «se traspasan literalmente»). Ahora se mueven a la vez: el rey anda su paseo de siempre y la torre, sin
// despertar al gigante, se agacha, salta con su peana por encima de él en pleno paseo y cae a su lado, con el
// estirón y el aplastamiento de los dibujos animados.
//
// El salto no se hace a ojo. Se sabe dónde estará el rey en cada momento (`walkOverTimeline`) y cuánto ocupa (de pie
// y andando, con el cetro que se le va hacia fuera), y se busca el salto —cuándo despega, cuánto dura, cómo de alto
// y con qué forma— que nunca lo toca: siempre que estén cerca de lado, la base de la torre va por encima de lo más
// alto del rey, con aire. Entre los que valen, el que más parece un salto de verdad (una parábola a velocidad
// constante, con el tiempo de vuelo que le toca a su altura), el más bajo, el que pasa sobre el rey en lo más alto y
// el que acaba antes.
//
// Puro: sin three.

export const CASTLE_HOP = {
  crouch: 0.24, // lo que tarda en agacharse para coger impulso (s)
  settle: 0.5, // lo que tarda en asentarse al caer: se aplasta, rebota y se queda quieta (s)
  over: 0.12, // aire, como poco, entre la base de la torre y lo más alto del rey (corona o cetro)
  slack: 0.02, // y lo que se le suma al buscar, que entre una mirada y la siguiente la torre baja un poco
  aside: 0.06, // y de lado, cuando no va por encima
  low: 0.8, // ni más bajo, aunque no hiciera falta: es un salto
  high: 3.4, // ni más alto: la cámara lo ha de ver entero
  // La gravedad de los saltos (casillas por segundo al cuadrado), que da el tiempo de vuelo de cada altura: la de los
  // dibujos animados, el doble de la de verdad. Con la de verdad la torre se quedaba arriba flotando: parecía levitar.
  gravity: 22,
  squash: 0.18, // lo que se aplasta al agacharse y al caer
  stretch: 0.14, // lo que se estira al despegar
  tilt: 0.2, // lo que se inclina hacia donde va al despegar (y, menos, lo que se balancea al caer), en radianes: unos 11°
  step: 1 / 240, // cada cuánto se comprueba el salto elegido (s)
};

// Lo que ocupa el rey (medido en los dos modelos, blanco y negro, con la figura entera: corona, capa y cetro; el
// mayor de los dos, con un poco de aire). De pie, un círculo; en marcha, más por delante que por detrás: el cetro
// se le va hacia delante al andar y aún más al bajar de la peana.
export const KING_BODY = {
  standing: { radius: 0.5, top: 2.32 },
  hop: { fwd: 0.7, back: 0.36, side: 0.56, top: 2.32 },
  vanish: { fwd: 0.64, back: 0.36, side: 0.56, top: 2.32 },
  walk: { fwd: 0.64, back: 0.36, side: 0.56, top: 2.32 },
};

// Lo que ocupa el gigante de la torre (medido en su modelo, mirando hacia donde salta): quieto, ocupa más por delante (los
// puños) que por detrás, y los brazos a los lados; en el aire, rugiendo con los brazos en alto, algo más; y despierto en
// su casilla, sin saber aún hacia dónde mira, un círculo con lo que más ocupa (y la torre de antes, que es más alta). Los
// pies le quedan un poco por debajo de su base (`bottom`).
const GIGANTE_QUIETO = { fwd: 0.64, back: 0.35, side: 0.68, height: 1.96, bottom: 0.1 };
export const GIANT_BODY = {
  rest: { radius: 0.7, height: 2.38, bottom: 0.1 },
  crouch: GIGANTE_QUIETO,
  flight: { fwd: 0.7, back: 0.45, side: 0.75, height: 1.97, bottom: 0.1 },
  settle: GIGANTE_QUIETO,
  landed: GIGANTE_QUIETO,
};
// El gigante, más ancho que la torre, tiene que subir más para pasar por encima del rey sin rozarlo.
export const GIANT_HIGH = 4.2;

// Las formas que se prueban: `lift` 0 avanzaría a velocidad constante (una parábola de verdad) y con más sale y
// llega más en vertical (con 1, sube recta, cruza por arriba y baja recta, como la torre que levanta la mano para
// enrocar). En el enroque la parábola nunca vale: el rey acaba justo al lado de donde cae la torre, y bajando en
// diagonal le daría. `flat` 1 sería la parábola y con menos sube y baja antes y arriba se queda más rato.
const LIFTS = [0.5, 0.75, 1];
const FLATS = [0.7, 0.5];
const FLIGHT = { from: 0.7, to: 1.8, step: 0.1 }; // lo que puede durar el vuelo (s)
const LAUNCH_STEP = 0.04; // cada cuánto se prueba el despegue (s)
const LATE = 0.6; // lo que puede despegar, como mucho, después de que el rey acabe (s)

// Lo que pesa cada cosa al elegir entre los saltos que valen.
const COST = { height: 1, natural: 1.5, lift: 0.6, flat: 0.8, cross: 1.2, total: 0.5 };

const smooth = (u) => {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
};
const lerp = (a, b, k) => a + (b - a) * k;
const along = (s, lift) => s - (lift / (2 * Math.PI)) * Math.sin(2 * Math.PI * s);
const bump = (s, flat) => (4 * s * (1 - s)) ** flat;

// Cómo va de aplastada (`sy`, lo alto; lo ancho es 1/√sy, que no cambie de volumen) y de inclinada (`tilt`) en cada
// tramo: agachándose (`u` de 0 a 1), en el aire (`s`) y asentándose (`u`).
function crouchPose(u, o) {
  const k = smooth(u);
  return { sy: 1 - o.squash * k, tilt: -o.tilt * 0.35 * k }; // se echa atrás, como quien coge impulso
}
function flightPose(s, o) {
  let sy;
  if (s < 0.12) sy = lerp(1 - o.squash, 1 + o.stretch, smooth(s / 0.12));
  else if (s < 0.5) sy = lerp(1 + o.stretch, 1, smooth((s - 0.12) / 0.38));
  else if (s < 0.8) sy = 1;
  else sy = lerp(1, 1 + o.stretch * 0.4, smooth((s - 0.8) / 0.2));
  // Sale echándose hacia donde va y en el aire se endereza: baja derecha, que al lado de donde cae está el rey.
  const tilt = s < 0.15 ? lerp(-o.tilt * 0.35, o.tilt, smooth(s / 0.15)) : lerp(o.tilt, 0, smooth((s - 0.15) / 0.45));
  return { sy, tilt };
}
function settlePose(u, o) {
  const fin = (1 - u) ** 2; // que acabe en reposo de verdad
  let sy;
  if (u < 0.12) sy = lerp(1 + o.stretch * 0.4, 1 - o.squash, smooth(u / 0.12));
  else {
    const v = u - 0.12;
    sy = 1 - o.squash * Math.exp(-4.5 * v) * Math.cos(2.6 * Math.PI * v) * fin / (1 - 0.12) ** 2;
  }
  // Al caer, la inercia la balancea hacia donde iba —hacia fuera, no hacia el rey— y se queda quieta.
  return { sy, tilt: o.tilt * 0.9 * Math.exp(-4 * u) * Math.sin(3 * Math.PI * u) * fin };
}

// LO QUE OCUPA CADA UNO, VISTO DESDE ARRIBA: un rectángulo que mira hacia `u` ({x, z}, unitario), con `fwd` por
// delante, `back` por detrás y `side` a cada lado. Un círculo, como un cuadrado de su radio: en el enroque todo va en
// línea por la fila, y de frente ocupan lo mismo.
const rect = (x, z, u, { fwd, back, side }) => ({ x, z, u, fwd, back, side });
const forma = (b) => (b.radius !== undefined ? { fwd: b.radius, back: b.radius, side: b.radius } : b);

function corners(r) {
  const v = { x: r.u.z, z: -r.u.x };
  return [[r.fwd, r.side], [r.fwd, -r.side], [-r.back, r.side], [-r.back, -r.side]]
    .map(([a, b]) => ({ x: r.x + r.u.x * a + v.x * b, z: r.z + r.u.z * a + v.z * b }));
}

// Distancia de un punto ({x, z}) a un rectángulo (0 si está dentro).
function toRect(p, r) {
  const dx = p.x - r.x;
  const dz = p.z - r.z;
  const a = dx * r.u.x + dz * r.u.z;
  const b = dx * r.u.z - dz * r.u.x;
  return Math.hypot(Math.max(0, a - r.fwd, -r.back - a), Math.max(0, Math.abs(b) - r.side));
}

// El hueco entre dos rectángulos: 0 si se tocan (no hay eje que los separe); si no, lo que hay de la esquina más cercana
// de uno al otro.
function rectGap(a, b) {
  // Atajo, el caso del enroque: los dos en paralelo (o de frente). Por los dos ejes, a lo largo y de lado.
  const paralelos = a.u.x * b.u.x + a.u.z * b.u.z;
  if (Math.abs(Math.abs(paralelos) - 1) < 1e-9) {
    const sb = Math.sign(paralelos);
    const da = (b.x - a.x) * a.u.x + (b.z - a.z) * a.u.z; // dónde está b, a lo largo de a
    const la = (b.x - a.x) * a.u.z - (b.z - a.z) * a.u.x; // y de lado
    const [b0, b1] = sb > 0 ? [da - b.back, da + b.fwd] : [da - b.fwd, da + b.back];
    const largo = Math.max(0, b0 - a.fwd, -a.back - b1);
    const lado = Math.max(0, Math.abs(la) - a.side - b.side);
    return Math.hypot(largo, lado);
  }
  const ca = corners(a);
  const cb = corners(b);
  let separados = false;
  for (const eje of [a.u, { x: a.u.z, z: -a.u.x }, b.u, { x: b.u.z, z: -b.u.x }]) {
    const pa = ca.map((p) => p.x * eje.x + p.z * eje.z);
    const pb = cb.map((p) => p.x * eje.x + p.z * eje.z);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) {
      separados = true;
      break;
    }
  }
  if (!separados) return 0;
  return Math.min(...ca.map((p) => toRect(p, b)), ...cb.map((p) => toRect(p, a)));
}

// Lo que ocupa el que salta (la torre o el gigante) en `p` ({x, z, y, sx, sy, tilt}) con el cuerpo `b` ({ radius,
// height } o { fwd, back, side, height }, y `bottom`: lo que le baja de su base, los pies del gigante), mirando hacia
// `dir`: su rectángulo (con lo que la inclinación le saca lo alto hacia delante o hacia atrás), lo más bajo y lo más
// alto. La torre es un cilindro: al inclinarse, baja un canto de la base.
function jumperExtent(p, b, dir, cilindro) {
  const f = forma(b);
  const lean = b.height * p.sy * Math.sin(p.tilt);
  const canto = cilindro ? (b.radius ?? 0) * p.sx * Math.abs(Math.sin(p.tilt)) : 0;
  return {
    rect: rect(p.x, p.z, dir, { fwd: f.fwd * p.sx + Math.max(0, lean), back: f.back * p.sx + Math.max(0, -lean), side: f.side * p.sx }),
    bottom: p.y - (b.bottom ?? 0) - canto,
    top: p.y + b.height * p.sy * Math.cos(p.tilt) + canto,
  };
}

// El rey en `t`: hasta dónde llega (`top`) y lo que ocupa (`rect`). De pie (girándose, silbando, subiendo a la peana), un
// círculo; en marcha (saltando de la peana, empezando a andar y andando), mira hacia donde va (`dir`) y ocupa más por
// delante —el cetro se le va hacia delante— que por detrás.
function kingState(king, body, dir, t) {
  const p = king.at(t);
  const b = body[p.phase] ?? body.standing;
  return { x: p.x, z: p.z, top: p.y + b.top, rect: rect(p.x, p.z, dir, forma(b)) };
}

// EL SALTO DE LA TORRE en el enroque, de `from` a `to` ({x, z}), mientras el rey hace su paseo `king`
// (`walkOverTimeline`, con el tiempo contado desde que empiezan los dos). `body`: lo que ocupa el rey en cada fase de
// su paseo (`standing` y, si cambia, 'hop', 'vanish', 'walk'…), de pie { radius, top } y en marcha { fwd, back, side,
// top } (`top`, lo alto sobre sus pies; lo demás, hacia delante, hacia atrás y a cada lado). Lo que salta: `tower`, la
// torre con su peana ({ radius, height }), o `jumper`, el gigante, con lo que ocupa esperando en su casilla (`rest`),
// agachándose, volando y asentándose (`crouch`, `flight`, `settle`, mirando hacia donde salta) y ya caído (`landed`):
// rugiendo en el aire abre los brazos, y al caer vuelve a su reposo. Con `options.earliest`, no
// se agacha antes (el gigante tiene que despertar). Devuelve null si no hay salto que valga; si no, { crouch, liftoff, landing, end,
// height, top, margin, at(t) }: cuándo empieza a agacharse, despega, cae y acaba de asentarse; lo alto que va su base
// y lo más alto que llega; el aire que deja, como poco, con el rey (0 o más); y `at(t)`: { x, z, y, sx, sy, tilt,
// axis }, dónde va su base, cómo va de aplastada (`sx` de ancho, `sy` de alto) y lo que se inclina hacia donde va
// (`tilt`, en radianes, girando sobre `axis`, {x, y, z}, el eje de lado).
const hechos = new Map(); // el mismo enroque, el mismo salto: se busca una vez
export function planCastleHop({ king, body = KING_BODY, tower = null, jumper = null, from, to, options = {} }) {
  const salta = jumper ?? { rest: tower, crouch: tower, flight: tower, settle: tower, landed: tower, cylinder: true };
  const muestras = [0, 0.5, 1, 1.5, 2, 3].map((t) => king.at(t));
  const clave = JSON.stringify([muestras, king.at(king.end), king.end, body, salta, from, to, options]);
  if (!hechos.has(clave)) hechos.set(clave, buscaSalto({ king, body, salta, from, to, options }));
  return hechos.get(clave);
}

function buscaSalto({ king, body, salta, from, to, options }) {
  const o = { ...CASTLE_HOP, earliest: 0, ...options };
  const cuerpo = { quieta: salta.rest, crouch: salta.crouch, flight: salta.flight, settle: salta.settle, landed: salta.landed };
  const cilindro = Boolean(salta.cylinder);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  if (!(length > 0)) return null;
  const dir = { x: dx / length, z: dz / length };
  const axis = { x: dir.z, y: 0, z: -dir.x }; // arriba × dir: girando así, lo de arriba se va hacia `dir`

  // El rey en `t`. Va hacia donde anda: de su casilla a la de llegada.
  const ida = { x: king.at(king.end).x - king.at(0).x, z: king.at(king.end).z - king.at(0).z };
  const largo = Math.hypot(ida.x, ida.z) || 1;
  const kingDir = { x: ida.x / largo, z: ida.z / largo };
  const reyEn = (t) => kingState(king, body, kingDir, t);

  // Una forma de salto con altura 1: en `t`, dónde va su base, cuánto subiría por cada unidad de altura (`up`) y con
  // qué cuerpo (`b`: esperando, agachándose, en el aire, asentándose o ya caído).
  function shape(t, { t0, T, lift, flat }) {
    if (t < t0 - o.crouch) return { x: from.x, z: from.z, up: 0, sy: 1, tilt: 0, b: cuerpo.quieta };
    if (t < t0) return { x: from.x, z: from.z, up: 0, ...crouchPose((t - (t0 - o.crouch)) / o.crouch, o), b: cuerpo.crouch };
    if (t < t0 + T) {
      const s = (t - t0) / T;
      const k = along(s, lift);
      return { x: from.x + dx * k, z: from.z + dz * k, up: bump(s, flat), ...flightPose(s, o), b: cuerpo.flight };
    }
    if (t < t0 + T + o.settle) return { x: to.x, z: to.z, up: 0, ...settlePose((t - t0 - T) / o.settle, o), b: cuerpo.settle };
    return { x: to.x, z: to.z, up: 0, sy: 1, tilt: 0, b: cuerpo.landed };
  }
  const extentOf = (p, y) => jumperExtent({ x: p.x, z: p.z, y, sx: 1 / Math.sqrt(p.sy), sy: p.sy, tilt: p.tilt }, p.b, dir, cilindro);

  // Quieto en su casilla, también ocupa: hasta cuándo puede esperar en `from` (lo que tarda el rey en acercársele) y
  // desde cuándo puede estar ya en `to` (cuando el rey se ha apartado de allí para siempre).
  const fin = king.end + LATE + FLIGHT.to + o.settle;
  function quieta(at, b, paso) {
    const ext = extentOf({ x: at.x, z: at.z, sy: 1, tilt: 0, b }, 0);
    let primero = Infinity;
    let ultimo = -Infinity;
    for (let t = 0; t <= fin + 1e-9; t += paso) {
      if (rectGap(ext.rect, reyEn(t).rect) >= o.aside) continue;
      primero = Math.min(primero, t);
      ultimo = t;
    }
    return { primero, ultimo };
  }

  // Lo que ha de subir, como poco, el salto `form` para no tocar al rey (Infinity si lo toca en el suelo) mirando
  // cada `paso`, y cuándo pasa por encima de él. Solo mientras se agacha, vuela y se asienta: quieta, ya se sabe.
  function needed(form, paso) {
    let height = o.low;
    let cross = null;
    let antes = null;
    for (let t = form.t0 - o.crouch; t <= form.t0 + form.T + o.settle + 1e-9; t += paso) {
      const torre = shape(t, form);
      const rey = reyEn(t);
      const lado = (torre.x - rey.x) * dir.x + (torre.z - rey.z) * dir.z;
      if (antes !== null && cross === null && Math.sign(lado) !== Math.sign(antes)) cross = t;
      antes = lado;
      const ext = extentOf(torre, 0);
      if (rectGap(ext.rect, rey.rect) >= o.aside) continue;
      if (torre.up <= 1e-6) return { height: Infinity };
      // Base: up·H + bottom (el canto que baja al inclinarse) ≥ lo alto del rey + aire.
      height = Math.max(height, (rey.top + o.over + o.slack - ext.bottom) / torre.up);
      if (height > o.high) return { height: Infinity };
    }
    return { height, cross };
  }

  // Se busca mirando cada sexagésimo de segundo y el elegido se comprueba cada 1/240: si ahí no vale (se colaría
  // entre dos miradas), el siguiente.
  const grueso = 1 / 60;
  const enFrom = quieta(from, cuerpo.quieta, grueso);
  const enTo = quieta(to, cuerpo.landed, grueso);
  if (o.debug) Object.assign(o.debug, { enFrom, enTo });
  const candidatos = [];
  for (const lift of LIFTS) {
    for (const flat of FLATS) {
      for (let T = FLIGHT.from; T <= FLIGHT.to + 1e-9; T += FLIGHT.step) {
        // Despega cuando aún no ha llegado el rey a su casilla, y cae cuando ya se ha ido de la otra.
        const desde = Math.max(o.crouch + o.earliest, enTo.ultimo - T - o.settle + grueso);
        const hasta = Math.min(king.end + LATE, enFrom.primero + o.crouch - grueso);
        for (let t0 = desde; t0 <= hasta + 1e-9; t0 += LAUNCH_STEP) {
          const form = { t0, T, lift, flat };
          const { height, cross } = needed(form, grueso);
          if (!Number.isFinite(height)) continue;
          const natural = 2 * Math.sqrt((2 * height) / o.gravity);
          const total = Math.max(king.end, t0 + T + o.settle);
          const cost = COST.height * height + COST.natural * Math.abs(T - natural) + COST.lift * lift + COST.flat * (1 - flat)
            + COST.cross * Math.abs((cross ?? t0 + T / 2) - (t0 + T / 2)) + COST.total * total;
          candidatos.push({ cost, form });
        }
      }
    }
  }
  candidatos.sort((a, b) => a.cost - b.cost);
  const fino = o.step;
  const finoFrom = quieta(from, cuerpo.quieta, fino);
  const finoTo = quieta(to, cuerpo.landed, fino);
  let elegido = null;
  for (const { form } of candidatos.slice(0, 40)) {
    if (form.t0 - o.crouch >= finoFrom.primero || form.t0 + form.T + o.settle <= finoTo.ultimo) continue;
    const { height } = needed(form, fino);
    if (Number.isFinite(height)) {
      elegido = { form, height };
      break;
    }
  }
  if (!elegido) return null;

  const { form, height } = elegido;
  const at = (t) => {
    const p = shape(t, form);
    return { x: p.x, z: p.z, y: p.up * height, sx: 1 / Math.sqrt(p.sy), sy: p.sy, tilt: p.tilt, axis };
  };
  // Lo que deja de aire con el rey, como poco (para las pruebas y para saber que el salto vale), y lo más alto.
  let margin = Infinity;
  let top = 0;
  for (let t = 0; t <= Math.max(king.end, form.t0 + form.T + o.settle) + 1e-9; t += fino) {
    const ext = extentOf(shape(t, form), at(t).y);
    const rey = reyEn(t);
    top = Math.max(top, ext.top);
    const lado = rectGap(ext.rect, rey.rect) - o.aside;
    margin = Math.min(margin, Math.max(lado, ext.bottom - rey.top - o.over));
  }
  return {
    crouch: form.t0 - o.crouch,
    liftoff: form.t0,
    landing: form.t0 + form.T,
    end: form.t0 + form.T + o.settle,
    height,
    top,
    margin,
    form,
    at,
  };
}
