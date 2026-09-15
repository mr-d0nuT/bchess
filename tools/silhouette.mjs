// Silueta de una imagen de referencia: la caja de sus bordes marcados (saltos bruscos de brillo).
// El fondo de estudio, con degradados suaves y sombras difuminadas, no los tiene; la figura, sí.
// Sirve para comparar las proporciones de las versiones blanca y negra de una pieza.
// Uso: node tools/silhouette.mjs imagen.jpeg [umbral]
// El umbral es el salto de brillo entre dos píxeles separados por uno (0-255); por defecto, 12,
// porque una pieza clara sobre fondo claro apenas se distingue.
import sharp from 'sharp';

const MIN_EDGES = 3; // bordes que debe tener una fila o columna para contar

const [file, thresholdArg] = process.argv.slice(2);
if (!file) {
  console.error('Uso: node tools/silhouette.mjs imagen.jpeg [umbral]');
  process.exit(1);
}
const threshold = Number(thresholdArg ?? 12);
const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const rows = new Uint32Array(height);
const columns = new Uint32Array(width);
for (let y = 1; y < height - 1; y++) {
  for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    const jump = Math.max(Math.abs(data[i + 1] - data[i - 1]), Math.abs(data[i + width] - data[i - width]));
    if (jump <= threshold) continue;
    rows[y]++;
    columns[x]++;
  }
}
const first = (counts) => counts.findIndex((n) => n >= MIN_EDGES);
const last = (counts) => counts.length - 1 - [...counts].reverse().findIndex((n) => n >= MIN_EDGES);
const box = { x: first(columns), y: first(rows) };
box.w = last(columns) - box.x + 1;
box.h = last(rows) - box.y + 1;
console.log(JSON.stringify({ file, width, height, box, ratio: +(box.w / box.h).toFixed(3) }));
