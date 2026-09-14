// Deja en un GLB de Tripo solo las animaciones de la lista, conservando malla, esqueleto y
// texturas. Sirve para que el modelo de una pieza lleve dentro sus animaciones elegidas.
// Uso: node tools/keep-anims.mjs entrada.glb salida.glb clave1,clave2,…
// Las claves son las de Tripo, como `walk` o `hit_to_body_01`.
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const [input, output, keepList] = process.argv.slice(2);
if (!input || !output || !keepList) {
  console.error('Uso: node tools/keep-anims.mjs entrada.glb salida.glb clave1,clave2,…');
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(input);
const keep = new Set(keepList.split(','));
const kept = [];
for (const animation of doc.getRoot().listAnimations()) {
  const key = animation.getName().replace(/^.*:/, '').replace(/\.\d+$/, '');
  if (keep.has(key)) kept.push(key);
  else animation.dispose();
}
await doc.transform(prune());
await io.write(output, doc);
const missing = [...keep].filter((key) => !kept.includes(key));
console.log(`${output}: ${kept.length} animaciones (${kept.join(', ')})${missing.length ? `; faltan: ${missing.join(', ')}` : ''}`);
