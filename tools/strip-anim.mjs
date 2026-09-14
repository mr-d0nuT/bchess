// Deja un GLB solo con nodos y animaciones (sin mallas, pieles, materiales ni texturas) y
// quita las pistas de posición de todos los huesos salvo la cadera y la raíz. Así las
// animaciones sirven a cualquier esqueleto de Tripo con los mismos nombres de hueso, aunque
// sus proporciones sean algo distintas.
// Uso: node tools/strip-anim.mjs entrada.glb salida.glb [clave1,clave2,…]
// Con la lista, solo se quedan esas animaciones (claves de Tripo, como `angry_01`).
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const KEEP_TRANSLATION = /(hips?|pelvis|root)$/i;
const [input, output, keepList] = process.argv.slice(2);
if (!input || !output) {
  console.error('Uso: node tools/strip-anim.mjs entrada.glb salida.glb [clave1,clave2,…]');
  process.exit(1);
}

const io = new NodeIO();
const doc = await io.read(input);
const root = doc.getRoot();

if (keepList) {
  const keep = new Set(keepList.split(','));
  for (const animation of root.listAnimations()) {
    const key = animation.getName().replace(/^.*:/, '').replace(/\.\d+$/, '');
    if (!keep.has(key)) animation.dispose();
  }
}

for (const node of root.listNodes()) {
  node.setMesh(null);
  node.setSkin(null);
}
for (const mesh of root.listMeshes()) mesh.dispose();
for (const skin of root.listSkins()) skin.dispose();

let removed = 0;
for (const animation of root.listAnimations()) {
  for (const channel of animation.listChannels()) {
    const name = channel.getTargetNode()?.getName() ?? '';
    if (channel.getTargetPath() !== 'translation' || KEEP_TRANSLATION.test(name)) continue;
    const sampler = channel.getSampler();
    animation.removeChannel(channel);
    channel.dispose();
    if (sampler) {
      animation.removeSampler(sampler);
      sampler.dispose();
    }
    removed++;
  }
}

await doc.transform(prune());
await io.write(output, doc);
console.log(`${output}: ${root.listAnimations().length} animaciones, ${removed} pistas de posición quitadas`);
