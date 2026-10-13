// EL CONTACTO DE LA ESPADA. En el duelo de caballeros las dos hojas se cruzaban a un palmo la una de la otra sin
// tocarse, y el ¡CLANC! salía cuando ya estaban bajadas; los cortes entraban por la cabeza o el pecho antes de
// llegar al hombro, y el ¡CHAS! salía con la hoja ya pasada (lo vio el usuario). Aquí está la geometría, sin
// three.js (para las pruebas): una hoja es un segmento, de la guarda a la punta; el cuerpo del rival, piezas
// sacadas de sus huesos (cápsulas: un segmento con su grueso; y el escudo, una placa).
//
// Un tajo ensayado (`rehearseBlade`) es una lista de muestras { t, x, y, z, gx, gy, gz }: la punta y la guarda en
// el sistema de quien pega, desde sus pies, con x hacia su izquierda y z hacia delante.

export const BLADE_TOUCH = 0.02; // a lo que se tocan dos hojas: lo que miden de grueso, más o menos
// Que la una pase al otro lado de la otra entre dos instantes solo es que se han cruzado si estaban así de cerca en
// los dos: girando deprisa, la perpendicular a las dos hojas da la vuelta y el lado cambia aunque pasen lejos.
export const CROSS_NEAR = 0.12;
// Por dónde se han de encontrar las hojas, en partes de la hoja desde la guarda: ni por la cruz ni por la punta.
const CLASH_ALONG = [0.3, 0.9];
const CLASH_MIDDLE = 0.55; // y mejor, por aquí
const CUT_ALONG = 0.25; // un corte, como poco a esta parte de la hoja desde la guarda (no con el puño)
// Lo que pesa cada cosa al elegir sitio: lo que se mete la hoja donde no toca (al seguir el tajo), lo que anda y lo
// que se gira para ponerse, y lo lejos del blanco que toca primero.
const WEIGHT = { sink: 4, walk: 1, turn: 0.3, miss: 2, along: 0.3 };
const SLOW = 0.3; // en partes de lo más rápido que va la punta: por debajo, el tajo ya ha acabado de bajar

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const along = (p, d, k) => ({ x: p.x + d.x * k, y: p.y + d.y * k, z: p.z + d.z * k });
const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });
const length = (a) => Math.sqrt(dot(a, a));

// Distancia entre los segmentos p1-q1 y p2-q2. Devuelve { distance, s, t, a, b, side }: los puntos más cercanos (a,
// a `s` del primero, de p1 a q1; b, a `t` del segundo) y de qué lado del primero pasa el segundo (el signo de su
// separación a lo largo de la perpendicular a los dos; si cambia entre dos instantes, se han cruzado).
export function segmentDistance(p1, q1, p2, q2) {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= 1e-12) {
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const pa = along(p1, d1, s);
  const pb = along(p2, d2, t);
  const gap = sub(pb, pa);
  const normal = { x: d1.y * d2.z - d1.z * d2.y, y: d1.z * d2.x - d1.x * d2.z, z: d1.x * d2.y - d1.y * d2.x };
  const side = Math.sign(dot(gap, normal));
  return { distance: length(gap), s, t, a: pa, b: pb, side };
}

// Un punto del sistema de quien está en `at` ({x, z}) mirando hacia `facing`, en el mundo. `y0`: la altura de sus pies.
export function toWorld(local, at, facing, y0 = 0) {
  const c = Math.cos(facing);
  const sn = Math.sin(facing);
  return { x: at.x + local.x * c + local.z * sn, y: y0 + local.y, z: at.z - local.x * sn + local.z * c };
}

// La hoja de una muestra del tajo, en el mundo: [guarda, punta].
export function bladeAt(sample, at, facing, y0 = 0) {
  return [toWorld({ x: sample.gx, y: sample.gy, z: sample.gz }, at, facing, y0), toWorld(sample, at, facing, y0)];
}

// Cuánto le falta a la hoja (de `p` a `q`) para tocar una pieza del cuerpo (negativo: ya está dentro). Una
// cápsula es { a, b, r }; una placa (el escudo), { c, u, v, hu, hv, r }: su centro, sus dos ejes (unitarios), la
// mitad de lo que mide en cada uno y su medio grueso. Devuelve { gap, point, along }: el punto de la hoja más
// cercano y a qué parte de ella (de la guarda a la punta).
export function partGap(p, q, part) {
  if (part.c) return plateGap(p, q, part);
  const d = segmentDistance(p, q, part.a, part.b);
  return { gap: d.distance - part.r, point: d.a, along: d.s };
}

function plateGap(p, q, plate) {
  const n = {
    x: plate.u.y * plate.v.z - plate.u.z * plate.v.y,
    y: plate.u.z * plate.v.x - plate.u.x * plate.v.z,
    z: plate.u.x * plate.v.y - plate.u.y * plate.v.x,
  };
  const inside = (point) => {
    const rel = sub(point, plate.c);
    return Math.abs(dot(rel, plate.u)) <= plate.hu && Math.abs(dot(rel, plate.v)) <= plate.hv;
  };
  // La hoja atraviesa la placa.
  const dp = dot(sub(p, plate.c), n);
  const dq = dot(sub(q, plate.c), n);
  if (dp * dq < 0) {
    const k = dp / (dp - dq);
    const hit = lerp(p, q, k);
    if (inside(hit)) return { gap: -plate.r, point: hit, along: k };
  }
  // Si no, lo más cerca: un extremo de la hoja sobre la placa, o la hoja contra uno de sus bordes.
  let best = null;
  const consider = (gap, point, k) => {
    if (!best || gap < best.gap) best = { gap, point, along: k };
  };
  for (const [point, k] of [[p, 0], [q, 1]]) {
    const rel = sub(point, plate.c);
    const pu = Math.max(-plate.hu, Math.min(plate.hu, dot(rel, plate.u)));
    const pv = Math.max(-plate.hv, Math.min(plate.hv, dot(rel, plate.v)));
    const near = along(along(plate.c, plate.u, pu), plate.v, pv);
    consider(length(sub(point, near)) - plate.r, point, k);
  }
  const corner = (su, sv) => along(along(plate.c, plate.u, su * plate.hu), plate.v, sv * plate.hv);
  const corners = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
  for (let i = 0; i < 4; i++) {
    const d = segmentDistance(p, q, corners[i], corners[(i + 1) % 4]);
    consider(d.distance - plate.r, d.a, d.s);
  }
  return best;
}

// Lo que toca primero la hoja de entre las piezas de `body`: { gap, point, along, part }.
export function bodyGap(p, q, body) {
  let best = null;
  for (const part of body) {
    const g = partGap(p, q, part);
    if (!best || g.gap < best.gap) best = { ...g, part };
  }
  return best;
}

// Cuándo baja de verdad el tajo: de lo más alto de la punta hasta que, pasado lo más rápido, frena (va a menos de
// SLOW de su velocidad más alta). Índices de las muestras: { top, end }.
export function strikeWindow(path) {
  let top = 0;
  for (let i = 1; i < path.length; i++) if (path[i].y > path[top].y) top = i;
  const speed = (i) => length(sub(path[i], path[i - 1])) / Math.max(1e-6, path[i].t - path[i - 1].t);
  let fastest = top;
  let max = 0;
  for (let i = top + 1; i < path.length; i++) {
    const v = speed(i);
    if (v > max) {
      max = v;
      fastest = i;
    }
    if (max > 0 && i > fastest && v < SLOW * max) return { top, end: i };
  }
  return { top, end: path.length - 1 };
}

// La muestra de `path` más cercana al instante `t` (los ensayos van a paso fijo).
function sampleAt(path, t) {
  const step = (path[path.length - 1].t - path[0].t) / Math.max(1, path.length - 1) || 1;
  return path[Math.max(0, Math.min(path.length - 1, Math.round((t - path[0].t) / step)))];
}

// DÓNDE SE CRUZAN LAS HOJAS. Los dos dan su tajo (`mine`, el del atacante, y `his`, el del otro, ensayados), cada
// uno hacia su izquierda: cara a cara, las hojas bajan cada una por su lado y no se encuentran. El atacante se
// aparta a su derecha (`side`) y algo hacia atrás (`back`) de `from`, sin girarse (sigue mirando hacia `facing`), y
// el otro empieza su tajo `delay` segundos después (antes, si es negativo), para que las hojas se encuentren en el
// aire mientras bajan: las dos por en medio (ni por la cruz ni por la punta: si se tocan antes las puntas, no vale)
// y sin rozarse antes, mientras levantan la espada. Busca en una rejilla el sitio más cercano que vale, a no menos
// de `minDistance` del otro (`rival`, que mira hacia `rivalFacing`). Devuelve { at: {x, z}, delay, t, point, along:
// [en la suya, en la del otro] } o null: `t`, el instante del tajo del atacante en que se tocan.
export function clashSpot({ mine, his, from, facing, rival, rivalFacing, minDistance = 0, side = [-0.3, 0.8], back = [-0.3, 0.6], delays = [0], step = 0.05 }) {
  const { top, end } = strikeWindow(mine);
  const right = { x: -Math.cos(facing), z: Math.sin(facing) };
  const forward = { x: Math.sin(facing), z: Math.cos(facing) };
  let best = null;
  for (const delay of delays) {
    const theirs = [];
    for (let i = 0; i <= end; i++) theirs.push(bladeAt(sampleAt(his, mine[i].t - delay), rival, rivalFacing));
    for (let s = side[0]; s <= side[1] + 1e-9; s += step) {
      for (let k = back[0]; k <= back[1] + 1e-9; k += step) {
        const at = { x: from.x + right.x * s - forward.x * k, z: from.z + right.z * s - forward.z * k };
        if (Math.hypot(at.x - rival.x, at.z - rival.z) < minDistance) continue;
        const touch = firstClash(mine, theirs, at, facing, top, end);
        if (!touch) continue;
        if (touch.along.some((x) => x < CLASH_ALONG[0] || x > CLASH_ALONG[1])) continue;
        const walk = Math.hypot(s, k) + Math.abs(delay);
        const score = walk * WEIGHT.walk + WEIGHT.along * touch.along.reduce((sum, x) => sum + Math.abs(x - CLASH_MIDDLE), 0);
        if (!best || score < best.score) best = { score, at, delay, t: touch.t, point: touch.point, along: touch.along };
      }
    }
  }
  return best && { at: best.at, delay: best.delay, t: best.t, point: best.point, along: best.along };
}

// La primera vez que se tocan las hojas (o se cruzan), con el atacante en `at`: { t, point, along }. Entre muestra y
// muestra se miran CLASH_STEPS puntos más (la punta corre mucho al bajar: de una muestra a otra, las puntas pueden
// tocarse y separarse). Null si se tocan antes de que empiece el tajo de verdad (`top`), mientras levantan la
// espada, o si no se tocan.
const CLASH_STEPS = 6;
function firstClash(mine, theirs, at, facing, top, end) {
  let before = null;
  let previous = null;
  for (let i = 0; i <= end; i++) {
    const now = [...bladeAt(mine[i], at, facing), ...theirs[i]];
    for (let j = previous ? 1 : CLASH_STEPS; j <= CLASH_STEPS; j++) {
      const k = j / CLASH_STEPS;
      const [g1, p1, g2, p2] = previous ? now.map((point, n) => lerp(previous[n], point, k)) : now;
      const d = segmentDistance(g1, p1, g2, p2);
      if (d.distance <= BLADE_TOUCH || crossed(before, d)) {
        if (i < top) return null;
        const t = previous ? mine[i - 1].t + (mine[i].t - mine[i - 1].t) * k : mine[i].t;
        return { t, point: lerp(d.a, d.b, 0.5), along: [d.s, d.t] };
      }
      before = d;
    }
    previous = now;
  }
  return null;
}

// Si entre `before` y `now` (dos `segmentDistance` de las mismas hojas) la una ha pasado a través de la otra: cerca
// en los dos instantes, por dentro de las dos hojas y cada vez de un lado.
export function crossed(before, now) {
  const inside = (d) => d.s > 0 && d.s < 1 && d.t > 0 && d.t < 1 && d.side !== 0 && d.distance < CROSS_NEAR;
  return Boolean(before && inside(before) && inside(now) && before.side !== now.side);
}

// DÓNDE PONERSE PARA UN CORTE. De entre los sitios `stands` ({ at: {x, z}, facing }) busca dónde ha de ponerse el
// atacante para que su tajo (`path`, ensayado) toque primero el cuerpo del otro (`body`, sus piezas) a menos de
// `reach` del blanco (`target`, {x, y, z}), mientras baja y con la hoja (no con el puño); y que al seguir bajando se
// meta lo menos posible en las piezas que no son del blanco (las que no están en `spare`, por su `limb`). Hasta
// tocar el blanco, la hoja ha de pasar a más de `margin` de esas otras piezas ({ [limb]: lo que libra, other: el
// resto }): el otro respira y se mece, y pasando a dos dedos de la cabeza, a veces la rozaba antes. Prefiere lo que
// menos ande (`walk(stand)`, lo que cuesta llegar) y menos tenga que girarse desde `facing`. Devuelve { at, facing, t,
// point } o null.
export function cutStand({ path, body, target, reach, stands, walk, facing, spare = [], margin = {} }) {
  const { top, end } = strikeWindow(path);
  const wide = body.map((part) => (spare.includes(part.limb) ? part : { ...part, r: part.r + (margin[part.limb] ?? margin.other ?? 0) }));
  const bound = boundOf(wide);
  let best = null;
  for (const stand of stands) {
    const touch = firstTouch(path, wide, bound, stand.at, stand.facing, end);
    if (!touch || touch.i < top || touch.along < CUT_ALONG || !spare.includes(touch.part.limb)) continue;
    const miss = length(sub(touch.point, target));
    if (miss > reach) continue;
    // Lo que se mete, al seguir bajando, en lo que no es el blanco.
    let sink = 0;
    for (let i = touch.i; i <= end; i++) {
      const [g, p] = bladeAt(path[i], stand.at, stand.facing);
      for (const part of body) {
        if (spare.includes(part.limb)) continue;
        sink = Math.max(sink, -partGap(g, p, part).gap);
      }
    }
    const turn = Math.abs(Math.atan2(Math.sin(stand.facing - facing), Math.cos(stand.facing - facing)));
    const score = sink * WEIGHT.sink + walk(stand) * WEIGHT.walk + turn * WEIGHT.turn + miss * WEIGHT.miss;
    if (!best || score < best.score) best = { score, at: stand.at, facing: stand.facing, t: touch.t, point: touch.point };
  }
  return best && { at: best.at, facing: best.facing, t: best.t, point: best.point };
}

// Lo que se anda de `from` a `to` ({x, z}) rodeando a quien está en `center`: el arco alrededor de él más lo que se
// acerca o se aleja (`circleTo` va así, para no atravesarlo).
export function aroundLength(from, to, center) {
  const r0 = Math.hypot(from.x - center.x, from.z - center.z);
  const r1 = Math.hypot(to.x - center.x, to.z - center.z);
  const b0 = Math.atan2(from.x - center.x, from.z - center.z);
  const b1 = Math.atan2(to.x - center.x, to.z - center.z);
  return Math.abs(Math.atan2(Math.sin(b1 - b0), Math.cos(b1 - b0))) * ((r0 + r1) / 2) + Math.abs(r1 - r0);
}

// Los sitios desde los que la hoja pasa por el blanco: para cada orientación (FACINGS alrededor), cada instante de la
// bajada (`path`, de lo más alto a cuando frena) y cada punto de la hoja (`along`, de la guarda a la punta), el sitio en
// el que ponerse para que ese punto de la hoja esté, en ese instante, en `target`. Solo los que miran a `center` (con
// no más de `maxYaw` de desvío) y no están a menos de `minDistance` de él. Buscar a ciegas alrededor dejaba muy pocos
// sitios buenos para las piernas, en un pasillo de dos dedos entre la cabeza y la cadera.
export function standsAiming({ path, target, center, minDistance = 0, maxYaw = 0.45, facings = 48, along = [0.35, 0.5, 0.65, 0.8], stride = 1 }) {
  const { top, end } = strikeWindow(path);
  const stands = [];
  for (let k = 0; k < facings; k++) {
    const facing = (k / facings) * 2 * Math.PI;
    const c = Math.cos(facing);
    const sn = Math.sin(facing);
    for (let i = top; i <= end; i += stride) {
      const sample = path[i];
      for (const a of along) {
        const x = sample.gx + (sample.x - sample.gx) * a;
        const z = sample.gz + (sample.z - sample.gz) * a;
        const at = { x: target.x - (x * c + z * sn), z: target.z - (-x * sn + z * c) };
        const dx = center.x - at.x;
        const dz = center.z - at.z;
        if (Math.hypot(dx, dz) < minDistance) continue;
        const yaw = Math.atan2(Math.sin(facing - Math.atan2(dx, dz)), Math.cos(facing - Math.atan2(dx, dz)));
        if (Math.abs(yaw) <= maxYaw) stands.push({ at, facing });
      }
    }
  }
  return stands;
}

// Por dónde se va de `from` a `to` rodeando a quien está en `center` (como `circleTo`): `steps` puntos del camino,
// con el ángulo alrededor y la distancia yendo a la vez de lo que eran a lo que han de ser.
export function aroundPath(from, to, center, steps = 8) {
  const r0 = Math.hypot(from.x - center.x, from.z - center.z);
  const r1 = Math.hypot(to.x - center.x, to.z - center.z);
  const b0 = Math.atan2(from.x - center.x, from.z - center.z);
  const db = Math.atan2(Math.sin(Math.atan2(to.x - center.x, to.z - center.z) - b0), Math.cos(Math.atan2(to.x - center.x, to.z - center.z) - b0));
  const points = [];
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const b = b0 + db * k;
    const r = r0 + (r1 - r0) * k;
    points.push({ x: center.x + Math.sin(b) * r, z: center.z + Math.cos(b) * r });
  }
  return points;
}

// Sitios alrededor de `center` desde los que mirarlo para pegarle: a cada distancia de `distances`, por el lado de
// `bearing` (el ángulo, desde el centro, de donde viene quien pega) y hasta `spread` a cada lado; mirando al centro,
// o algo desviado (`yaws`).
export function standsAround({ center, bearing, distances, spread = Math.PI / 2, step = Math.PI / 36, yaws = [0] }) {
  const stands = [];
  for (let b = -spread; b <= spread + 1e-9; b += step) {
    const angle = bearing + b;
    for (const d of distances) {
      const at = { x: center.x + Math.sin(angle) * d, z: center.z + Math.cos(angle) * d };
      for (const yaw of yaws) stands.push({ at, facing: angle + Math.PI + yaw });
    }
  }
  return stands;
}

// Una esfera que envuelve el cuerpo, para no mirar pieza a pieza la hoja cuando pasa lejos.
function boundOf(body) {
  const points = body.flatMap((part) => (part.c ? [part.c] : [part.a, part.b]));
  const c = points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length, z: sum.z + p.z / points.length }), { x: 0, y: 0, z: 0 });
  let r = 0;
  for (const part of body) {
    const extent = part.c ? Math.hypot(part.hu, part.hv) + part.r : part.r;
    for (const p of part.c ? [part.c] : [part.a, part.b]) r = Math.max(r, length(sub(p, c)) + extent);
  }
  return { c, r };
}

// La primera vez que la hoja, con quien pega en `at`, toca el cuerpo: { i, t, point, along, part }. Entre dos
// muestras, el instante en que lo toca se saca de lo que le faltaba en una y lo que se había metido en la otra.
function firstTouch(path, body, bound, at, facing, end) {
  let before = null;
  for (let i = 0; i <= end; i++) {
    const [g, p] = bladeAt(path[i], at, facing);
    if (segmentDistance(g, p, bound.c, bound.c).distance > bound.r) {
      before = null;
      continue;
    }
    const now = bodyGap(g, p, body);
    if (now.gap <= 0) {
      if (!before || i === 0) return { i, t: path[i].t, point: now.point, along: now.along, part: now.part };
      const k = before.gap / (before.gap - now.gap);
      const [g0, p0] = bladeAt(path[i - 1], at, facing);
      const hit = bodyGap(lerp(g0, g, k), lerp(p0, p, k), body);
      return { i, t: path[i - 1].t + (path[i].t - path[i - 1].t) * k, point: hit.point, along: hit.along, part: hit.part };
    }
    before = now;
  }
  return null;
}
