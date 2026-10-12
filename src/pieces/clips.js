// Asigna los clips de un GLB a las acciones del juego por su nombre (Tripo, Mixamo…)
// y quita el avance de un clip de paseo para que la figura ande donde diga el código.

const PATTERNS = {
  idle: [/idle/i, /breath/i, /stand/i],
  walk: [/walk/i],
  attack: [/attack/i, /slash/i, /stab/i, /thrust/i, /strike/i, /punch/i],
  hit: [/hurt/i, /hit/i, /impact/i, /damage/i, /react/i],
  fall: [/fall/i, /death/i, /dying/i, /die/i, /knock/i],
  jump: [/jump/i, /hop/i, /leap/i],
};

export const ACTIONS = Object.keys(PATTERNS);

export function mapClips(clipNames, overrides = {}) {
  const result = {};
  const used = new Set();
  for (const action of ACTIONS) {
    const name = overrides[action];
    if (name && clipNames.includes(name)) {
      result[action] = name;
      used.add(name);
    }
  }
  for (const action of ACTIONS) {
    if (result[action]) continue;
    let match = null;
    for (const pattern of PATTERNS[action]) {
      match = clipNames.find((n) => pattern.test(n) && !used.has(n)) ?? null;
      if (match) break;
    }
    result[action] = match;
    if (match) used.add(match);
  }
  return result;
}

// Nombre completo de un clip a partir de su clave de Tripo («hit_to_body_01» →
// «preset:biped:hit_to_body_01.001»). Solo coincidencias exactas de clave, para no
// confundir «hit_to_body_01» con «hit_to_body_012».
export function findClipName(clipNames, key) {
  return (
    clipNames.find((n) => n === key) ??
    clipNames.find((n) => n.includes(`:${key}.`) || n.endsWith(`:${key}`)) ??
    null
  );
}

// Versiones de cada acción: las del manifiesto (`moves`, con claves de Tripo y opciones
// como `spear` o `travel`) y, para las acciones que no menciona, la detección automática.
// `missing` lista las claves del manifiesto que no están en el GLB. Cada versión guarda su
// clave corta en `key` (para pedir una versión concreta).
export function resolveMoves(clipNames, moves = {}) {
  const auto = mapClips(clipNames);
  const result = {};
  const missing = [];
  for (const action of new Set([...ACTIONS, ...Object.keys(moves)])) {
    if (!moves[action]) {
      result[action] = auto[action] ? [{ clip: auto[action], key: auto[action] }] : [];
      continue;
    }
    result[action] = [];
    for (const variant of moves[action]) {
      const name = findClipName(clipNames, variant.clip);
      if (name) result[action].push({ ...variant, key: variant.clip, clip: name });
      else missing.push(variant.clip);
    }
  }
  return { moves: result, missing };
}

// Índice de la versión a reproducir: al azar y sin repetir la anterior (`last`).
export function pickVariant(count, last, random = Math.random) {
  if (count <= 1) return 0;
  if (!(last >= 0 && last < count)) return Math.floor(random() * count);
  const i = Math.floor(random() * (count - 1));
  return i >= last ? i + 1 : i;
}

// Pista de posición del hueso raíz (caderas) de un clip, o null.
export function pickRootPositionTrack(trackNames) {
  const find = (pattern) => trackNames.find((n) => pattern.test(n)) ?? null;
  return find(/(hips?|pelvis)\.position$/i) ?? find(/root\.position$/i);
}

// Pista de posición que más se desplaza del primer al último fotograma: la del hueso que lleva el
// avance en un esqueleto con nombres desconocidos (el caballo de Tripo). `tracks` son { name, times,
// values }; null si ninguna se mueve.
export function pickDriftTrack(tracks) {
  let best = null;
  for (const track of tracks) {
    const n = track.times.length;
    if (!track.name.endsWith('.position') || n < 2) continue;
    const moved = Math.hypot(
      track.values[(n - 1) * 3] - track.values[0],
      track.values[(n - 1) * 3 + 1] - track.values[1],
      track.values[(n - 1) * 3 + 2] - track.values[2],
    );
    if (moved > 1e-6 && (!best || moved > best.moved)) best = { name: track.name, moved };
  }
  return best?.name ?? null;
}

// Eje vertical de un esqueleto (0 = x, 1 = y, 2 = z): el componente más largo de la
// posición de la cadera, que está a la altura de la cintura. Mixamo usa Y; Tripo, Z.
export function pickUpAxis(hipPosition) {
  let axis = 0;
  for (let k = 1; k < 3; k++) {
    if (Math.abs(hipPosition[k]) > Math.abs(hipPosition[axis])) axis = k;
  }
  return axis;
}

// Acorta el desplazamiento horizontal de un clip respecto a su primer fotograma,
// multiplicándolo por `factor`, sin tocar la altura. Sirve para que una caída se quede
// dentro de su casilla. `values` = [x, y, z, …]; `upAxis`, el eje vertical.
export function scaleHorizontalMotion(values, upAxis, factor) {
  const out = Float32Array.from(values);
  const axes = [0, 1, 2].filter((k) => k !== upAxis);
  for (let i = 0; i < values.length; i += 3) {
    for (const k of axes) out[i + k] = values[k] + (values[i + k] - values[k]) * factor;
  }
  return out;
}

// Quita el avance horizontal (lo que se desplaza de principio a fin) conservando el
// balanceo. `values` = [x, y, z, x, y, z, …] alineado con `times`; `upAxis` es el eje
// vertical, que no se toca.
export function removeLinearDrift(times, values, upAxis = 1) {
  const n = times.length;
  const out = Float32Array.from(values);
  if (n < 2) return { distance: 0, values: out };
  const axes = [0, 1, 2].filter((k) => k !== upAxis);
  const deltas = axes.map((k) => values[(n - 1) * 3 + k] - values[k]);
  const t0 = times[0];
  const span = times[n - 1] - t0 || 1;
  for (let i = 0; i < n; i++) {
    const f = (times[i] - t0) / span;
    axes.forEach((k, j) => {
      out[i * 3 + k] = values[i * 3 + k] - deltas[j] * f;
    });
  }
  return { distance: Math.hypot(...deltas), values: out };
}

// Entre dos giros (cuaterniones [x, y, z, w]), por el camino corto.
export function slerpValues(a, b, t) {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
    cos = -cos;
  }
  let s0 = 1 - t;
  let s1 = t;
  if (cos < 0.9995) {
    const angle = Math.acos(cos);
    const sin = Math.sin(angle);
    s0 = Math.sin((1 - t) * angle) / sin;
    s1 = Math.sin(t * angle) / sin;
  }
  const q = [a[0] * s0 + bx * s1, a[1] * s0 + by * s1, a[2] * s0 + bz * s1, a[3] * s0 + bw * s1];
  const n = Math.hypot(...q) || 1;
  return q.map((v) => v / n);
}

const lerpValues = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);

// Corta una pista en `until` y, en vez de acabar en seco, la devuelve a su primer fotograma en `back`
// segundos, entrando y saliendo despacio. Para quedarse con lo primero de un clip y que acabe como empezó:
// el conjuro del alfil trae dos lanzamientos, y el segundo (la cadera girada 90° y la cabeza vuelta del
// revés para seguir mirando al frente) le pillaba con la piedra subiéndole al rival, quieto en esa postura
// (lo vio el usuario). `sample(t)` da el valor de la pista en `t`; `quaternion`, si son giros.
export function cutAndReturn({ times, values, size, until, back, sample, quaternion = false, steps = 4 }) {
  const outTimes = [];
  const outValues = [];
  for (let i = 0; i < times.length && times[i] < until - 1e-6; i++) {
    outTimes.push(times[i]);
    for (let k = 0; k < size; k++) outValues.push(values[i * size + k]);
  }
  const at = Array.from(sample(until));
  const first = Array.from(values.slice(0, size));
  const blend = quaternion ? slerpValues : lerpValues;
  outTimes.push(until);
  outValues.push(...at);
  for (let s = 1; s <= steps; s++) {
    const k = s / steps;
    outTimes.push(until + back * k);
    outValues.push(...blend(at, first, k * k * (3 - 2 * k)));
  }
  return { times: Float32Array.from(outTimes), values: Float32Array.from(outValues) };
}
