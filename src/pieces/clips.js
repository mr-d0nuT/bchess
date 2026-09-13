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

// Pista de posición del hueso raíz (caderas) de un clip, o null.
export function pickRootPositionTrack(trackNames) {
  const find = (pattern) => trackNames.find((n) => pattern.test(n)) ?? null;
  return find(/(hips?|pelvis)\.position$/i) ?? find(/root\.position$/i);
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
