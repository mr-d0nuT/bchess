// Un caballo mide 1,6 casillas de largo: sobresale 0,86 por delante del centro de su casilla y 0,74 por
// detrás, así que a las piezas anchas que tiene cerca les mete la cabeza o la cola dentro (dos caballos
// frente a frente se metían la cabeza el uno en el otro, y uno detrás de otro, la cola en el pecho).
// Quieto, se gira lo justo para no tocar a nadie: se prueban giros cada vez mayores, a un lado y a otro,
// contra los puntos de las piezas de alrededor, y se queda con el primero que deja hueco.
//
// Aquí solo la búsqueda, sin three (se puede probar); las nubes de puntos las saca `main.js` de las
// mallas. Una nube es una lista plana [x, y, z, x, y, z…].

export const TURNS = [0, 15, -15, 25, -25, 35, -35, 45, -45]; // grados; positivo, a su derecha
export const MARGIN = 0.015; // más cerca que esto, se tocan (lo que respiran las piezas mueve unos centímetros)
// Lo que se mira de un caballo son sus extremos: la cabeza y la cola, más allá de esto (en su marco) del
// centro de su casilla. Es lo que se metía en las demás piezas; el jinete y su escudo, en el medio, apenas
// rozan al de al lado en la raya entre casillas, y por eso no merece la pena girar a nadie.
export const END = 0.45;

// Los extremos de una nube de caballo (en su marco: z hacia delante).
export function endsOf(local, reach = END) {
  const out = [];
  for (let i = 0; i < local.length; i += 3) {
    if (Math.abs(local[i + 2]) > reach) out.push(local[i], local[i + 1], local[i + 2]);
  }
  return Float32Array.from(out);
}

// Celdas numeradas: tres índices de -512 a 511 en un solo número, más rápido que una clave de texto.
const cellKey = (x, y, z) => ((x + 512) * 1024 + (y + 512)) * 1024 + (z + 512);

// Rejilla de los puntos (del mundo) en celdas de lado `cell`, para mirar solo los de al lado.
export function gridOf(points, cell = MARGIN) {
  const cells = new Map();
  for (let i = 0; i < points.length; i += 3) {
    const key = cellKey(Math.floor(points[i] / cell), Math.floor(points[i + 1] / cell), Math.floor(points[i + 2] / cell));
    let list = cells.get(key);
    if (!list) cells.set(key, (list = []));
    list.push(i);
  }
  return { cells, cell, points };
}

// ¿Hay algún punto de la rejilla a menos de `margin` de (x, y, z)?
export function touches(grid, x, y, z, margin = MARGIN) {
  const { cells, cell, points } = grid;
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  const cz = Math.floor(z / cell);
  const r = Math.ceil(margin / cell);
  const m2 = margin * margin;
  for (let i = cx - r; i <= cx + r; i++) {
    for (let j = cy - r; j <= cy + r; j++) {
      for (let k = cz - r; k <= cz + r; k++) {
        const list = cells.get(cellKey(i, j, k));
        if (!list) continue;
        for (const p of list) {
          const dx = points[p] - x;
          const dy = points[p + 1] - y;
          const dz = points[p + 2] - z;
          if (dx * dx + dy * dy + dz * dz < m2) return true;
        }
      }
    }
  }
  return false;
}

// Pone una nube del marco de su figura (+z, hacia donde mira) en `center` ({x, z}) girada `yaw`
// (radianes, como el `rotation.y` de three: con π/2, lo de delante queda hacia +x).
export function place(local, center, yaw) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  const out = new Float32Array(local.length);
  for (let i = 0; i < local.length; i += 3) {
    out[i] = center.x + local[i] * c + local[i + 2] * s;
    out[i + 1] = local[i + 1];
    out[i + 2] = center.z - local[i] * s + local[i + 2] * c;
  }
  return out;
}

// El giro de `turns` (grados, positivo a su derecha) con el que la nube `own` del caballo, en `center` y
// mirando a `yaw`, no toca nada de `grid`: el primero de la lista que quede limpio, que es el más pequeño.
// Si ninguno lo queda, el que menos puntos mete.
export function pickTurn({ own, center, yaw, grid, turns = TURNS, margin = MARGIN }) {
  let best = turns[0];
  let fewest = Infinity;
  for (const turn of turns) {
    const placed = place(own, center, yaw - (turn * Math.PI) / 180);
    let hits = 0;
    for (let i = 0; i < placed.length && hits < fewest; i += 3) {
      if (touches(grid, placed[i], placed[i + 1], placed[i + 2], margin)) hits++;
    }
    if (hits === 0) return turn;
    if (hits < fewest) {
      fewest = hits;
      best = turn;
    }
  }
  return best;
}

// ¿Toca algo de `grid` la nube `own` puesta en `center` mirando a `yaw`?
export function clashes({ own, center, yaw, grid, margin = MARGIN }) {
  const placed = place(own, center, yaw);
  for (let i = 0; i < placed.length; i += 3) {
    if (touches(grid, placed[i], placed[i + 1], placed[i + 2], margin)) return true;
  }
  return false;
}

// Dos caballos que se estorban (frente a frente, o uno detrás de otro) se apartan a la vez: de uno en
// uno, el primero se aparta de más contando con que el otro sigue recto, y ya no hay vuelta atrás. Aquí se
// prueban las parejas de giros de menos a más giro entre los dos, y vale la primera que deja limpios a
// ambos: los extremos de cada uno (`own`) contra lo de alrededor (`grid`, sin el otro) y contra el cuerpo
// entero del otro (`body`). null si ninguna. `a` y `b`: { own, body, center, yaw, grid }.
export function pickPair({ a, b, turns = TURNS, margin = MARGIN }) {
  const radians = (turn) => (turn * Math.PI) / 180;
  const freeA = new Map(turns.map((t) => [t, !clashes({ ...a, yaw: a.yaw - radians(t), margin })]));
  const freeB = new Map(turns.map((t) => [t, !clashes({ ...b, yaw: b.yaw - radians(t), margin })]));
  const bodies = new Map(); // cada cuerpo, en cada giro: se hace una sola vez
  const bodyGrid = (who, turn) => {
    const key = `${who === a ? 'a' : 'b'}${turn}`;
    if (!bodies.has(key)) bodies.set(key, gridOf(place(who.body ?? who.own, who.center, who.yaw - radians(turn))));
    return bodies.get(key);
  };
  const pairs = turns.flatMap((ta) => turns.map((tb) => [ta, tb]))
    .sort((p, q) => Math.abs(p[0]) + Math.abs(p[1]) - (Math.abs(q[0]) + Math.abs(q[1])));
  for (const [ta, tb] of pairs) {
    if (!freeA.get(ta) || !freeB.get(tb)) continue;
    if (clashes({ own: a.own, center: a.center, yaw: a.yaw - radians(ta), grid: bodyGrid(b, tb), margin })) continue;
    if (clashes({ own: b.own, center: b.center, yaw: b.yaw - radians(tb), grid: bodyGrid(a, ta), margin })) continue;
    return [ta, tb];
  }
  return null;
}
