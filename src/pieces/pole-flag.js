// LA BANDERA DEL GIGANTE, PEGADA A SU MÁSTIL. El gigante de la torre (el modelo de Tripo) trae la bandera
// esculpida aparte del mástil: a unos 7 cm de él y atada a otros huesos (la tela, a la cabeza y al brazo; el
// mástil, a la clavícula), así que se le veía flotando, separada del palo (lo vio el usuario). Se arrima la
// tela al mástil —que el borde que da a él quede dentro del palo— y cada vértice de la tela se ata a los
// mismos huesos, con los mismos pesos, que el vértice del mástil que tiene más cerca: así va pegada a él y
// se mueve con él.
//
// Sin three: trabaja sobre los arrays de la geometría (posiciones, índices, huesos y pesos), para poder
// probarlo suelto.

const dist2 = (p, a, b) => {
  const dx = p[a] - p[b];
  const dy = p[a + 1] - p[b + 1];
  const dz = p[a + 2] - p[b + 2];
  return dx * dx + dy * dy + dz * dz;
};

// Las piezas sueltas de una malla: los vértices unidos por triángulos o que están en el mismo sitio (una
// malla exportada parte los vértices por las costuras de la textura, y eso no las separa).
export function meshParts(positions, index) {
  const n = positions.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const join = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const same = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${positions[i * 3].toFixed(5)},${positions[i * 3 + 1].toFixed(5)},${positions[i * 3 + 2].toFixed(5)}`;
    if (same.has(key)) join(i, same.get(key));
    else same.set(key, i);
  }
  if (index) {
    for (let t = 0; t + 2 < index.length; t += 3) {
      join(index[t], index[t + 1]);
      join(index[t], index[t + 2]);
    }
  }
  const parts = new Map();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!parts.has(root)) parts.set(root, []);
    parts.get(root).push(i);
  }
  return [...parts.values()];
}

const topOf = (positions, verts) => Math.max(...verts.map((i) => positions[i * 3 + 1]));

// El mástil y la tela: el mástil es la pieza que llega más alto, si es fina (pocos vértices); la tela, de
// las demás piezas pequeñas, la que tiene más cerca. Null si la malla no es así.
export function findPoleAndFlag(positions, index, { maxPoleVerts = 400, maxFlagVerts = 3000 } = {}) {
  const parts = meshParts(positions, index).sort((a, b) => topOf(positions, b) - topOf(positions, a));
  const pole = parts[0];
  if (!pole || pole.length > maxPoleVerts) return null;
  let flag = null;
  let best = Infinity;
  for (const part of parts.slice(1)) {
    if (part.length > maxFlagVerts) continue;
    let near = Infinity;
    for (const i of part) for (const j of pole) near = Math.min(near, dist2(positions, i * 3, j * 3));
    if (near < best) {
      best = near;
      flag = part;
    }
  }
  return flag ? { pole, flag, gap: Math.sqrt(best) } : null;
}

// El eje del mástil: del centro de sus vértices de abajo al de los de arriba.
function poleAxis(positions, pole) {
  const byHeight = [...pole].sort((a, b) => positions[a * 3 + 1] - positions[b * 3 + 1]);
  const slice = Math.max(1, Math.floor(byHeight.length * 0.15));
  const mean = (verts) => {
    const c = [0, 0, 0];
    for (const i of verts) for (let k = 0; k < 3; k++) c[k] += positions[i * 3 + k] / verts.length;
    return c;
  };
  return { from: mean(byHeight.slice(0, slice)), to: mean(byHeight.slice(-slice)) };
}

// El punto del eje más cercano a `p` ([x, y, z]).
function onAxis(axis, p) {
  const d = axis.to.map((v, k) => v - axis.from[k]);
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] || 1;
  const t = ((p[0] - axis.from[0]) * d[0] + (p[1] - axis.from[1]) * d[1] + (p[2] - axis.from[2]) * d[2]) / len2;
  return axis.from.map((v, k) => v + d[k] * t);
}

// Arrima la tela al mástil y la ata a sus huesos. `sink`: lo que se mete el borde de la tela hacia el eje
// del palo (0, a su superficie; 1, hasta el eje). Cambia los arrays y devuelve lo que ha hecho, o null si
// no ha encontrado mástil y bandera.
export function pinFlagToPole({ positions, index, skinIndex, skinWeight, sink = 0.6 }) {
  const found = findPoleAndFlag(positions, index);
  if (!found) return null;
  const { pole, flag, gap } = found;
  // El par más cercano: el vértice de la tela que da al palo y el del palo que tiene enfrente.
  let near = Infinity;
  let p = -1;
  let q = -1;
  for (const i of flag) {
    for (const j of pole) {
      const d = dist2(positions, i * 3, j * 3);
      if (d < near) {
        near = d;
        p = i;
        q = j;
      }
    }
  }
  const axis = poleAxis(positions, pole);
  const qAt = [positions[q * 3], positions[q * 3 + 1], positions[q * 3 + 2]];
  const inside = onAxis(axis, qAt);
  const move = [0, 1, 2].map((k) => qAt[k] - positions[p * 3 + k] + (inside[k] - qAt[k]) * sink);
  for (const i of flag) for (let k = 0; k < 3; k++) positions[i * 3 + k] += move[k];
  // Y cada vértice de la tela, a los huesos del vértice del palo más cercano.
  if (skinIndex && skinWeight) {
    for (const i of flag) {
      let nearest = pole[0];
      let d = Infinity;
      for (const j of pole) {
        const dd = dist2(positions, i * 3, j * 3);
        if (dd < d) {
          d = dd;
          nearest = j;
        }
      }
      for (let k = 0; k < 4; k++) {
        skinIndex[i * 4 + k] = skinIndex[nearest * 4 + k];
        skinWeight[i * 4 + k] = skinWeight[nearest * 4 + k];
      }
    }
  }
  return { gap, move, pole: pole.length, flag: flag.length };
}
