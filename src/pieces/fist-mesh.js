import * as THREE from 'three';

// EL PUÑO DEL PEÓN. Lo pidió el usuario: los peones han de agarrar la lanza, no llevarla pegada. Su modelo
// (Tripo) tiene la mano de una pieza —un solo hueso, `R_Hand`, sin dedos—, con el guante abierto y los dedos
// estirados, y la lanza le pasaba por el costado de la palma. Sin huesos que doblar, el puño se hace en la
// propia malla: los dedos se curvan alrededor de un eje que cruza la palma, como si rodearan un palo, y por
// ese hueco pasa luego la lanza.
//
// Todo en el sistema del hueso de la mano en reposo (el de la malla: `boneInverse · bindMatrix`):
// - Los dedos apuntan hacia donde están los vértices más lejanos de la muñeca (`d`); de los otros dos ejes,
//   el ancho de la mano es el largo (`t`, por donde pasará el palo: el túnel del puño) y el grueso, el corto
//   (`n`, hacia la palma: hacia el cuerpo, que es adonde mira una mano que cuelga).
// - De los nudillos (a la mitad de lo largo de la mano) en adelante, cada punto se curva alrededor de un eje
//   paralelo a `t` que está a `R` de los dedos, del lado de la palma: un doblez de chapa, el mismo que hace
//   cualquier programa de 3D. `R` es el radio del palo más medio dedo, así que los dedos acaban apoyados en él.
//
// Devuelve el centro del puño y el eje del túnel, en el sistema del hueso, o null si la malla no es así.

const KNUCKLES = 0.52; // dónde empiezan los dedos, en partes de lo largo de la mano
const TIPS = 0.8; // de aquí en adelante, para medir lo grueso de un dedo
const CURL_MAX = THREE.MathUtils.degToRad(250); // lo más que se enroscan las puntas

// El eje mayor de una nube de puntos 2D (`a`, `b`): el ángulo de su recta de regresión.
function majorAngle(points) {
  let ma = 0;
  let mb = 0;
  for (const [a, b] of points) {
    ma += a / points.length;
    mb += b / points.length;
  }
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (const [a, b] of points) {
    saa += (a - ma) * (a - ma);
    sbb += (b - mb) * (b - mb);
    sab += (a - ma) * (b - mb);
  }
  return 0.5 * Math.atan2(2 * sab, saa - sbb);
}

// `mesh`: la malla con piel; `bone`: el hueso de la mano; `shaftRadius`: el radio del palo, en el sistema del
// hueso; `palmToward`: hacia dónde ha de mirar la palma, en el sistema del hueso (hacia el cuerpo).
export function bendFist({ mesh, bone, shaftRadius, palmToward }) {
  const g = mesh.geometry;
  const huesos = mesh.skeleton?.bones ?? [];
  const idx = huesos.indexOf(bone);
  const { position, normal, skinIndex, skinWeight } = g.attributes;
  if (idx < 0 || !position || !skinIndex || !skinWeight) return null;
  const M = new THREE.Matrix4().multiplyMatrices(mesh.skeleton.boneInverses[idx], mesh.bindMatrix);
  const Mi = M.clone().invert();
  const N = new THREE.Matrix3().getNormalMatrix(M);
  const Ni = new THREE.Matrix3().getNormalMatrix(Mi);

  // Los vértices de la mano (los que mueve sobre todo ese hueso), en su sistema.
  const mano = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === idx) w += skinWeight.getComponent(i, k);
    if (w < 0.5) continue;
    p.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(M);
    mano.push({ i, p: p.clone() });
  }
  if (mano.length < 40) return null;

  // Hacia dónde apuntan los dedos: hacia los vértices más lejanos de la muñeca (el origen del hueso).
  const lejos = [...mano].sort((a, b) => b.p.length() - a.p.length()).slice(0, Math.max(8, Math.floor(mano.length * 0.04)));
  const d = lejos.reduce((s, v) => s.add(v.p), new THREE.Vector3()).normalize();
  // Los otros dos ejes: dos perpendiculares cualquiera a `d`, y en ese plano, el eje mayor de la mano.
  const e1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
  const e2 = new THREE.Vector3().crossVectors(d, e1).normalize();
  const angulo = majorAngle(mano.map((v) => [v.p.dot(e1), v.p.dot(e2)]));
  const t = e1.clone().multiplyScalar(Math.cos(angulo)).addScaledVector(e2, Math.sin(angulo)).normalize();
  const n = new THREE.Vector3().crossVectors(t, d).normalize();
  if (palmToward && n.dot(palmToward) < 0) n.negate();

  const largo = Math.max(...mano.map((v) => v.p.dot(d)));
  const k = largo * KNUCKLES;
  const dedos = mano.filter((v) => v.p.dot(d) > k);
  if (!dedos.length) return null;
  const w0 = dedos.reduce((s, v) => s + v.p.dot(n), 0) / dedos.length;
  const puntas = dedos.filter((v) => v.p.dot(d) > largo * TIPS);
  const grueso = puntas.length ? (Math.max(...puntas.map((v) => v.p.dot(n))) - Math.min(...puntas.map((v) => v.p.dot(n)))) / 2 : 0.008;
  const R = shaftRadius + grueso * 0.9;
  const zc = dedos.reduce((s, v) => s + v.p.dot(t), 0) / dedos.length;

  // Las posiciones vienen comprimidas e intercaladas con las normales: se pasan a un atributo propio en
  // decimales (el doblez saca algunos puntos de la caja en la que se comprimieron).
  const nuevas = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    nuevas[i * 3] = position.getX(i);
    nuevas[i * 3 + 1] = position.getY(i);
    nuevas[i * 3 + 2] = position.getZ(i);
  }
  const q = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (const { i, p: v } of dedos) {
    const u = v.dot(d);
    const w = v.dot(n);
    const z = v.dot(t);
    const theta = Math.min(CURL_MAX, (u - k) / R);
    const h = w - w0;
    const u2 = k + (R - h) * Math.sin(theta);
    const w2 = w0 + R - (R - h) * Math.cos(theta);
    q.copy(d).multiplyScalar(u2).addScaledVector(n, w2).addScaledVector(t, z).applyMatrix4(Mi);
    nuevas[i * 3] = q.x;
    nuevas[i * 3 + 1] = q.y;
    nuevas[i * 3 + 2] = q.z;
    // Y su normal, girada lo mismo en el plano de `d` y `n`.
    if (normal) {
      nn.set(normal.getX(i), normal.getY(i), normal.getZ(i)).applyMatrix3(N).normalize();
      const cd = nn.dot(d);
      const cn = nn.dot(n);
      const ct = nn.dot(t);
      nn.copy(d).multiplyScalar(cd * Math.cos(theta) - cn * Math.sin(theta))
        .addScaledVector(n, cd * Math.sin(theta) + cn * Math.cos(theta))
        .addScaledVector(t, ct)
        .applyMatrix3(Ni)
        .normalize();
      normal.setXYZ(i, nn.x, nn.y, nn.z);
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(nuevas, 3));
  if (normal) normal.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();

  const center = d.clone().multiplyScalar(k).addScaledVector(n, w0 + R).addScaledVector(t, zc);
  return { center, tunnel: t.clone(), bent: dedos.length, radius: R };
}
