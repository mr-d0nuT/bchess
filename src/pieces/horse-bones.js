// Huesos de un caballo con un esqueleto de nombres desconocidos (el cuadrúpedo de Tripo), por su
// posición en la postura de reposo. Puro. `bones` son { name, parent, x, y, z }, con `parent` el nombre
// del padre (o null) y los cascos en y = 0.
// - Los cascos son las cuatro puntas más bajas del esqueleto.
// - La cabeza es el hueso más alto: hacia ella mira el caballo, y `yaw` es el giro que hace que mire
//   hacia +Z, como las demás piezas.
// - Cada pata va desde el hueso que cuelga del tronco hasta el casco. Con el caballo mirando a +Z, las
//   delanteras son las de mayor z y las izquierdas, las de mayor x.
// - `seatZ` es dónde va la silla a lo largo del lomo, en ese mismo giro: algo más cerca de las patas
//   delanteras que de las traseras.

const SEAT_FROM_BACK = 0.6; // fracción del lomo, de las patas traseras a las delanteras

export function findHorseBones(bones) {
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const hasChildren = new Set(bones.map((bone) => bone.parent).filter(Boolean));
  const leaves = bones.filter((bone) => !hasChildren.has(bone.name));
  if (leaves.length < 4) throw new Error('No encuentro las cuatro patas del caballo');
  const hooves = [...leaves].sort((a, b) => a.y - b.y).slice(0, 4);

  const head = bones.reduce((best, bone) => (bone.y > best.y ? bone : best));
  const cx = hooves.reduce((sum, hoof) => sum + hoof.x, 0) / 4;
  const cz = hooves.reduce((sum, hoof) => sum + hoof.z, 0) / 4;
  const yaw = -Math.atan2(head.x - cx, head.z - cz);
  const turned = (bone) => ({
    x: bone.x * Math.cos(yaw) + bone.z * Math.sin(yaw),
    z: -bone.x * Math.sin(yaw) + bone.z * Math.cos(yaw),
  });

  const ancestors = (bone) => {
    const chain = [];
    for (let at = bone; at; at = at.parent ? byName.get(at.parent) : null) chain.push(at.name);
    return chain;
  };
  // De cada pareja de patas, lo que hay por debajo del hueso común más cercano, de arriba abajo.
  const pair = ([a, b]) => {
    const upA = ancestors(a);
    const upB = new Set(ancestors(b));
    const common = upA.find((name) => upB.has(name));
    const leg = (hoof) => {
      const up = ancestors(hoof);
      return up.slice(0, up.indexOf(common)).reverse();
    };
    return [leg(a), leg(b)];
  };
  const byDepth = [...hooves].sort((a, b) => turned(b).z - turned(a).z);
  const byLeft = (list) => [...list].sort((a, b) => turned(b).x - turned(a).x);
  const [frontLeft, frontRight] = pair(byLeft(byDepth.slice(0, 2)));
  const [backLeft, backRight] = pair(byLeft(byDepth.slice(2)));

  const topZ = (legs) => legs.reduce((sum, leg) => sum + turned(byName.get(leg[0])).z, 0) / legs.length;
  const front = topZ([frontLeft, frontRight]);
  const back = topZ([backLeft, backRight]);
  return { yaw, legs: { frontLeft, frontRight, backLeft, backRight }, seatZ: back + SEAT_FROM_BACK * (front - back) };
}
