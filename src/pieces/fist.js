import * as THREE from 'three';
import { findBone } from './bone-names.js';
import { FALANGES, bestAngle } from './grip.js';

// CERRAR LA MANO sobre el palo que lleva.
//
// Esto es lo que `grip.js` dejaba anotado como pendiente. `turnBone` gira los huesos en el espacio
// de la FIGURA, y eso es justo lo que hace que el andar y el contoneo funcionen con esqueletos de
// nombres distintos; pero a unos dedos —cada uno apuntando hacia su lado— los manda a paseo. Un
// dedo solo se dobla girándolo en SU PROPIO espacio, que es `hueso.quaternion.multiply(...)`:
// componer por la derecha aplica el giro en el sistema del hueso, no en el del padre.
//
// Con eso resuelto quedan dos problemas de geometría que no se arreglan a ojo:
//
//  1. Una mano que cuelga en reposo tiene los dedos hacia ABAJO, así que al cerrarlos forman un
//     túnel HORIZONTAL: la postura de agarrar una barra de metro, no un bastón. Hay que girar la
//     muñeca hasta que el túnel mire a lo largo de la vara (en estos reyes son 63°). El giro va
//     entero en el hueso de la mano, y no se reparte con el antebrazo, porque el antebrazo lo
//     reescribe cada fotograma la postura de reposo de los brazos (`restArms`).
//
//  2. Cuánto cierra cada dedo no es un número que se pueda poner a mano: depende del grosor de la
//     vara y de lo largo que sea ese dedo. Se busca. Para cada dedo se tantea primero hacia dónde
//     cierra (el sentido que lleva la punta al lado de la palma, que es el único anatómicamente
//     posible: si se deja libre, el barrido encuentra ángulos que doblan el dedo HACIA ATRÁS y
//     también llegan al radio) y después se barre la magnitud hasta que la punta queda apoyada en
//     la superficie de la vara.

export const DEDOS = ['Index', 'Middle', 'Ring', 'Pinky'];
const TANTEO = 12; // grados de prueba para averiguar hacia dónde cierra un dedo
const RODAJA = 0.03; // media altura de la rodaja de vara en la que se mide el grosor
const GORDOS = 0.9; // percentil con el que se mide: el máximo se lo lleva cualquier adorno suelto
const HOLGURA = 1.15; // la punta del dedo se queda algo fuera de la madera, que el dedo tiene carne
const VUELTAS = 3; // veces que se alternan cerrar los dedos y recentrar la vara

// Los tres ejes de la mano, en el mundo: hacia dónde apuntan los dedos, hacia dónde mira la palma
// y el eje del túnel que forma el puño al cerrarse (que es por donde tiene que pasar la vara).
function handAxes(mano, centro) {
  const nudillo = mano.Middle1.getWorldPosition(new THREE.Vector3());
  const punta = mano.Middle3.getWorldPosition(new THREE.Vector3());
  const indice = mano.Index1.getWorldPosition(new THREE.Vector3());
  const menique = mano.Pinky1.getWorldPosition(new THREE.Vector3());
  const dedos = punta.clone().sub(nudillo).normalize();
  const palma = new THREE.Vector3().crossVectors(dedos, indice.clone().sub(menique).normalize()).normalize();
  // De los dos lados del plano de la mano, la palma es la que mira al cuerpo.
  if (palma.dot(centro.clone().sub(nudillo).setY(0)) < 0) palma.negate();
  return { dedos, palma, tunel: new THREE.Vector3().crossVectors(dedos, palma).normalize(), nudillo };
}

// Gira `hueso` en su propio espacio hasta que `desde` (en el mundo) apunte como `hacia`.
function aimBone(hueso, desde, hacia) {
  const giro = new THREE.Quaternion().setFromUnitVectors(desde, hacia);
  const mundo = giro.multiply(hueso.getWorldQuaternion(new THREE.Quaternion()));
  const padre = hueso.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  hueso.quaternion.copy(padre.multiply(mundo));
  hueso.updateMatrixWorld(true);
}

// Distancia de un punto al eje de la vara.
function toAxis(punto, prop) {
  const origen = prop.getWorldPosition(new THREE.Vector3());
  const eje = new THREE.Vector3(0, 1, 0).applyQuaternion(prop.getWorldQuaternion(new THREE.Quaternion()));
  const v = punto.clone().sub(origen);
  return v.sub(eje.multiplyScalar(v.dot(eje))).length();
}

// El grosor de la vara justo donde la coge la mano. Se mide en el sistema del propio báculo, cuyo
// origen está en su eje y cuya Y lo recorre: en el del mundo habría que dar por hecho que está
// vertical, y mientras se busca el agarre no lo está —la muñeca se acaba de girar y se lo ha
// llevado—, así que la rodaja saldría en diagonal y el grosor, el doble.
//
// Y NO se toma el vértice más lejano: estos báculos llevan la vara sembrada de adornos, y un solo
// pico a la altura del puño manda la mano a cerrarse sobre un grosor que no existe, con lo que no
// llega a cerrarse.
function shaftRadius(prop) {
  const p = new THREE.Vector3();
  const lejos = [];
  prop.updateMatrixWorld(true);
  const escala = prop.getWorldScale(new THREE.Vector3()).x || 1;
  const rodaja = RODAJA / escala;
  prop.traverse((o) => {
    const pos = o.isMesh ? o.geometry?.getAttribute('position') : null;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      prop.worldToLocal(p);
      if (Math.abs(p.y) > rodaja) continue;
      lejos.push(Math.hypot(p.x, p.z));
    }
  });
  if (!lejos.length) return 0;
  lejos.sort((a, b) => a - b);
  return lejos[Math.floor(GORDOS * (lejos.length - 1))] * escala * HOLGURA;
}

// La cadena de falanges de un dedo, con el hueso que le sigue a cada una (que es quien dice hacia
// dónde apunta) y la postura de partida, para poder probar ángulos y volver atrás.
function chainOf(model, lado, dedo) {
  const cadena = [];
  for (let i = 1; i <= 3; i++) {
    const hueso = findBone(model, `${lado}_Hand${dedo}${i}`);
    const hijo = findBone(model, `${lado}_Hand${dedo}${i + 1}`);
    if (!hueso || !hijo) continue;
    // La postura de partida se guarda en el hueso la PRIMERA vez, no en cada llamada: si no,
    // cerrar la mano dos veces partiría del puño ya cerrado y los ángulos se sumarían.
    if (!hueso.userData.manoAbierta) hueso.userData.manoAbierta = hueso.quaternion.clone();
    cadena.push({ hueso, hijo, base: hueso.userData.manoAbierta });
  }
  return cadena;
}

// Dobla un dedo entero `grados`, siempre desde su postura de partida.
function bendFinger(cadena, grados, palma) {
  for (const { hueso, base } of cadena) hueso.quaternion.copy(base);
  if (cadena.length) cadena[0].hueso.updateMatrixWorld(true);
  cadena.forEach(({ hueso, hijo }, i) => {
    const frente = hijo.position.clone().normalize();
    const hacia = palma.clone().applyQuaternion(hueso.getWorldQuaternion(new THREE.Quaternion()).invert()).normalize();
    const eje = new THREE.Vector3().crossVectors(frente, hacia);
    if (eje.lengthSq() < 1e-8) return;
    const giro = grados * FALANGES[i] * THREE.MathUtils.DEG2RAD;
    hueso.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(eje.normalize(), giro));
    hueso.updateMatrixWorld(true);
  });
}

// Hacia qué lado cierra este dedo: el giro que acerca la punta al lado de la palma.
function bendSign(cadena, punta, nudillo, palma) {
  const alejamiento = () => punta.getWorldPosition(new THREE.Vector3()).sub(nudillo.getWorldPosition(new THREE.Vector3())).dot(palma);
  bendFinger(cadena, 0, palma);
  const quieto = alejamiento();
  bendFinger(cadena, TANTEO, palma);
  const doblado = alejamiento();
  bendFinger(cadena, 0, palma);
  return doblado > quieto ? 1 : -1;
}

// Cierra la mano de `model` sobre `prop`, un palo cuyo origen está en su eje a la altura del
// agarre. Devuelve lo que ha hecho, para poder contarlo en las pruebas.
export function closeFistOn({ model, prop, side = 'right', center }) {
  const lado = side === 'left' ? 'L' : 'R';
  const nombre = (n) => findBone(model, `${lado}_Hand${n}`);
  const mano = {
    hand: findBone(model, `${lado}_Hand`),
    Middle1: nombre('Middle1'), Middle3: nombre('Middle3'),
    Index1: nombre('Index1'), Pinky1: nombre('Pinky1'),
  };
  if (!mano.hand || !mano.Middle1 || !mano.Middle3 || !mano.Index1 || !mano.Pinky1) return null;

  model.updateMatrixWorld(true);
  // Se puede pedir dos veces (la pieza nace, se coloca y se asienta): cada una parte de la mano
  // abierta, no de la anterior.
  if (!mano.hand.userData.manoAbierta) mano.hand.userData.manoAbierta = mano.hand.quaternion.clone();
  mano.hand.quaternion.copy(mano.hand.userData.manoAbierta);
  for (const dedo of [...DEDOS, 'Thumb']) chainOf(model, lado, dedo).forEach(({ hueso, base }) => hueso.quaternion.copy(base));
  model.updateMatrixWorld(true);

  // 1. La muñeca, hasta que el túnel del puño mire a lo largo de la vara.
  const rumbo = prop.getWorldQuaternion(new THREE.Quaternion());
  const vara = new THREE.Vector3(0, 1, 0).applyQuaternion(rumbo);
  const { tunel } = handAxes(mano, center);
  aimBone(mano.hand, tunel.clone(), tunel.dot(vara) < 0 ? vara.clone().negate() : vara.clone());
  // Girar la muñeca se ha llevado el báculo con ella, y eso aquí es mentira: el juego le fija la
  // orientación respecto a la FIGURA, no a la mano, y al fotograma siguiente vuelve a estar
  // erguido. Se le devuelve ya, o los dedos se buscarían contra una vara torcida.
  prop.quaternion.copy(prop.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rumbo));
  prop.updateMatrixWorld(true);

  // 2. La vara, al hueco del puño; los dedos, apoyados en ella. Cada cosa mueve a la otra, así que
  //    se alternan un par de veces y convergen.
  const { palma } = handAxes(mano, center);
  const radio = shaftRadius(prop);
  const cadenas = new Map();
  const punta = new Map();
  for (const dedo of DEDOS) {
    const cadena = chainOf(model, lado, dedo);
    if (!cadena.length) continue;
    cadenas.set(dedo, cadena);
    punta.set(dedo, findBone(model, `${lado}_Hand${dedo}4`) ?? cadena[cadena.length - 1].hijo);
  }
  const alHueco = () => {
    const centro = new THREE.Vector3();
    let n = 0;
    for (const dedo of cadenas.keys()) {
      centro.add(nombre(`${dedo}1`).getWorldPosition(new THREE.Vector3()));
      centro.add(punta.get(dedo).getWorldPosition(new THREE.Vector3()));
      n += 2;
    }
    if (!n) return;
    centro.multiplyScalar(1 / n);
    const aqui = prop.getWorldPosition(new THREE.Vector3());
    prop.position.copy(prop.parent.worldToLocal(new THREE.Vector3(centro.x, aqui.y, centro.z)));
    prop.updateMatrixWorld(true);
  };

  const cerrados = {};
  for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
    alHueco();
    for (const [dedo, cadena] of cadenas) {
      const signo = bendSign(cadena, punta.get(dedo), nombre(`${dedo}1`), palma);
      const { angulo } = bestAngle((a) => {
        bendFinger(cadena, signo * a, palma);
        return toAxis(punta.get(dedo).getWorldPosition(new THREE.Vector3()), prop);
      }, radio);
      bendFinger(cadena, signo * angulo, palma);
      cerrados[dedo] = signo * angulo;
    }
  }

  // 3. El pulgar no envuelve la vara: se cierra sobre los demás dedos, como en un puño de verdad.
  const pulgar = chainOf(model, lado, 'Thumb');
  const puntaPulgar = findBone(model, `${lado}_HandThumb4`);
  if (pulgar.length && puntaPulgar && cadenas.has('Index')) {
    const diana = () => nombre('Index2').getWorldPosition(new THREE.Vector3()).lerp(nombre('Index3').getWorldPosition(new THREE.Vector3()), 0.5);
    const signo = bendSign(pulgar, puntaPulgar, nombre('Thumb1'), palma);
    const { angulo } = bestAngle((a) => {
      bendFinger(pulgar, signo * a, palma);
      return puntaPulgar.getWorldPosition(new THREE.Vector3()).distanceTo(diana());
    }, 0);
    bendFinger(pulgar, signo * angulo, palma);
    cerrados.Thumb = signo * angulo;
  }
  return { radio, cerrados, grip: prop.position.clone() };
}
