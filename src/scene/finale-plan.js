// Las cuentas de la escena del jaque mate (`finale.js`), puras y en casillas, para poder probarlas sin
// navegador: hacia dónde cae el báculo del rey vencido y desde dónde se ve el plano general.

export const BOARD_EDGE = 3.9; // lo que se puede alejar algo del centro sin salirse del tablero
const STEP = Math.PI / 6; // se prueban direcciones de 30 en 30°
const ORDER = [-2, -1, -3, 0, -4, 1, -5, 2, 3, 4, 5, 6]; // empezando por su derecha y algo por delante
const BLOCK_ASIDE = 0.55; // una pieza a menos de esto del palo tumbado lo tendría encima

// Hacia dónde dejar caer el báculo, que mide `length` y tiene el regatón en `from` ({x, z}), de un rey que
// mira a `facing` (ángulo como en `walk.js`: 0 es +z). A su derecha y algo por delante, que se vea; o, si
// ahí hay piezas (`others`, {x, z}: en un mate suele estar rodeado), hacia donde menos haya y sin que la
// cabeza se salga del tablero. Devuelve {x, z}, unitario.
export function staffDirection({ from, length, facing, others = [], edge = BOARD_EDGE }) {
  let best = null;
  for (const step of ORDER) {
    const angle = facing - Math.PI / 4 + step * STEP;
    const dir = { x: Math.sin(angle), z: Math.cos(angle) };
    const end = { x: from.x + dir.x * length, z: from.z + dir.z * length };
    const fuera = Math.abs(end.x) > edge || Math.abs(end.z) > edge ? 10 : 0;
    let blockers = 0;
    for (const p of others) {
      const along = (p.x - from.x) * dir.x + (p.z - from.z) * dir.z;
      const aside = Math.abs((p.x - from.x) * dir.z - (p.z - from.z) * dir.x);
      if (along > -0.2 && along < length + 0.3 && aside < BLOCK_ASIDE) blockers += 1;
    }
    const score = fuera + blockers * 3 + Math.abs(step) * 0.2;
    if (!best || score < best.score) best = { score, dir };
  }
  return best.dir;
}

// EL PLANO GENERAL del final: desde detrás de las piezas del ganador (`winners`, {x, z}) mirando hacia el
// rey vencido (`king`, {x, z}), lo justo para que quepan todos con la cámara de `fov` (grados, en vertical)
// y `aspect`, entre `min` y `max`. Si lo rodean (y el medio de los que ganan cae encima de él), desde el lado
// del tablero de donde salieron (`home`: +1 las blancas, -1 las negras, en z).
// Devuelve dónde mirar (`look`, {x, z}), desde dónde (`dir`, {x, z} unitario, del punto al que mira hacia la
// cámara), a qué distancia y el medio de los que ganan (`winnersAt`).
export function wideFraming({ king, winners, home, fov, aspect, toward = 0.4, min = 6, max = 10, margin = 0.6 }) {
  const n = Math.max(1, winners.length);
  const winnersAt = {
    x: winners.reduce((sum, p) => sum + p.x, 0) / n,
    z: winners.reduce((sum, p) => sum + p.z, 0) / n,
  };
  let dir = { x: winnersAt.x - king.x, z: winnersAt.z - king.z };
  let largo = Math.hypot(dir.x, dir.z);
  if (largo < 1.5) {
    dir = { x: 0, z: home };
    largo = 1;
  }
  dir = { x: dir.x / largo, z: dir.z / largo };
  const look = { x: king.x + (winnersAt.x - king.x) * toward, z: king.z + (winnersAt.z - king.z) * toward };
  let reach = 1;
  for (const p of [...winners, king]) reach = Math.max(reach, Math.hypot(p.x - look.x, p.z - look.z) + margin);
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * aspect;
  // A lo ancho, que quepa el círculo entero; a lo alto, visto desde arriba se achata a la mitad, más o menos.
  const distance = Math.min(max, Math.max(min, reach / tanH, (reach * 0.55) / tanV));
  return { look, dir, distance, winnersAt };
}
