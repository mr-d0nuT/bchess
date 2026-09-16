// Piel de una malla con esqueleto, pura: qué huesos cuelgan de otro y qué triángulos mueve un grupo de
// huesos. Sirve para separar una extremidad en una pieza rígida (`limbs.js`).

// Índices de `root` y de todos los huesos que cuelgan de él. `parents[i]` es el índice del padre del
// hueso i en la misma lista, o -1.
export function descendantsOf(parents, root) {
  const found = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    parents.forEach((parent, i) => {
      if (!found.has(i) && found.has(parent)) {
        found.add(i);
        grew = true;
      }
    });
  }
  return found;
}

// Triángulos cuyos tres vértices dependen sobre todo de `bones` (al menos `share` de su peso).
// `index` son los vértices de los triángulos, de tres en tres, o null si la malla no tiene índices (y
// entonces hay `count` vértices seguidos); `skinIndex` y `skinWeight`, cuatro huesos y cuatro pesos por
// vértice. Devuelve los índices de vértice de esos triángulos, de tres en tres.
export function trianglesOfBones({ index = null, count = 0, skinIndex, skinWeight, bones, share = 0.5 }) {
  const vertices = skinWeight.length / 4;
  const owned = new Uint8Array(vertices);
  for (let v = 0; v < vertices; v++) {
    let inside = 0;
    let total = 0;
    for (let j = 0; j < 4; j++) {
      const weight = skinWeight[v * 4 + j];
      total += weight;
      if (bones.has(skinIndex[v * 4 + j])) inside += weight;
    }
    owned[v] = total > 0 && inside / total >= share ? 1 : 0;
  }
  const corners = index ? index.length : count;
  const triangles = [];
  for (let i = 0; i + 2 < corners; i += 3) {
    const a = index ? index[i] : i;
    const b = index ? index[i + 1] : i + 1;
    const c = index ? index[i + 2] : i + 2;
    if (owned[a] && owned[b] && owned[c]) triangles.push(a, b, c);
  }
  return triangles;
}
