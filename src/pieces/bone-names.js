// Los modelos llegan con dos escuelas de nombres de hueso. Los primeros que hizo Tripo traen los
// cortos que usa el juego («Head», «R_Hand», «L_Foot»); los que pasan por el Auto Rig humanoide, como
// los alfiles, vienen con los de Mixamo («mixamorigHead», «mixamorigRightHand»). Aquí se traduce de
// los nuestros a los suyos, para poder pedir siempre «Head» y que aparezca la cabeza de quien sea.
// Puro: `findBone` solo necesita objetos que sepan `getObjectByName`.

const MIXAMO = 'mixamorig';
const SIDES = { R: 'Right', L: 'Left' };

// Y además cada aparejo bautiza el tronco a su manera. Se pide por el nombre de siempre y se prueban
// los sinónimos: la reina, por ejemplo, trae `Pelvis`, `Spine01` y `NeckTwist01`.
const SYNONYMS = {
  // La raíz de la figura: el nudo que está por encima de todo el esqueleto y cuyo origen cae en el
  // suelo. Girarlo mece la figura entera —pies incluidos— apoyada en el suelo, que es otra cosa que
  // girar la pelvis (eso sería un balancín con el eje en la cintura). Los modelos de Tripo lo llaman
  // «Armature»; si un esqueleto no tiene ninguno, se cae a la pelvis, que es lo más parecido.
  Root: ['Armature', 'Hips', 'Pelvis'],
  Hips: ['Pelvis', 'Hip'],
  Hip: ['Hips', 'Pelvis'],
  Spine: ['Spine01', 'Spine1'],
  Spine2: ['Spine02', 'Spine1', 'Chest'],
  Neck: ['NeckTwist01', 'Neck01'],
  Head: ['Head01'],
};

// «R_Hand» → «mixamorigRightHand»; «Head» → «mixamorigHead». Un nombre que ya es de Mixamo se queda
// como está, que si no se traduciría dos veces.
export function mixamoName(name, separador = '') {
  if (name.startsWith(MIXAMO)) return name;
  const lado = name[1] === '_' ? SIDES[name[0]] : null;
  return MIXAMO + separador + (lado ?? '') + (lado ? name.slice(2) : name);
}

// Los nombres con los que buscar un hueso, en orden: el nuestro, sus sinónimos y los de Mixamo.
export function boneAliases(name) {
  const nombres = [name, ...(SYNONYMS[name] ?? [])];
  // Unos exportadores escriben «mixamorigHead» y otros «mixamorig:Head»: se prueban las dos.
  const todos = [...nombres, ...nombres.map((n) => mixamoName(n)), ...nombres.map((n) => mixamoName(n, ':'))];
  return [...new Set(todos)];
}

// El hueso `name` dentro de `root`, llámese como se llame en ese esqueleto. `root` puede ser null.
export function findBone(root, name) {
  if (!root) return null;
  for (const alias of boneAliases(name)) {
    const bone = root.getObjectByName(alias);
    if (bone) return bone;
  }
  return null;
}
