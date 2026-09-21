// Los modelos llegan con dos escuelas de nombres de hueso. Los primeros que hizo Tripo traen los
// cortos que usa el juego («Head», «R_Hand», «L_Foot»); los que pasan por el Auto Rig humanoide, como
// los alfiles, vienen con los de Mixamo («mixamorigHead», «mixamorigRightHand»). Aquí se traduce de
// los nuestros a los suyos, para poder pedir siempre «Head» y que aparezca la cabeza de quien sea.
// Puro: `findBone` solo necesita objetos que sepan `getObjectByName`.

const MIXAMO = 'mixamorig';
const SIDES = { R: 'Right', L: 'Left' };

// «R_Hand» → «mixamorigRightHand»; «Head» → «mixamorigHead». Un nombre que ya es de Mixamo se queda
// como está, que si no se traduciría dos veces.
export function mixamoName(name) {
  if (name.startsWith(MIXAMO)) return name;
  const lado = name[1] === '_' ? SIDES[name[0]] : null;
  return MIXAMO + (lado ?? '') + (lado ? name.slice(2) : name);
}

// Los nombres con los que buscar un hueso, en orden: el nuestro y el de Mixamo.
export function boneAliases(name) {
  const mixamo = mixamoName(name);
  return mixamo === name ? [name] : [name, mixamo];
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
