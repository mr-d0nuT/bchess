import * as THREE from 'three';

// Transformaciones de la torre (diseño, sección 4), con el reloj de juego. De torre a gigante:
// tiembla, estalla en rocas y se alza el gigante. De gigante a torre: el gigante se encoge entre
// polvo mientras las rocas vuelan hacia su casilla, y la torre vuelve a subir del suelo.

const SHAKE_SECONDS = 0.4;
const SHAKE_SIZE = 0.05;
const RISE_SECONDS = 0.5;
const SETTLE_SECONDS = 0.3;
const SHRINK_SECONDS = 0.4;
const REBUILD_SECONDS = 0.45;
const REST_SECONDS = 0.15;
const DUST_Y = 0.05;

// De 0 a 1, pasándose un poco al final: el rebote.
function overshoot(t) {
  const s = 1.70158;
  const u = t - 1;
  return u * u * ((s + 1) * u + s) + 1;
}

// `obstacles()` devuelve las piezas en las que rebotan las rocas.
export async function towerToGiant({ rook, clock, dust, rubble, cinema, obstacles }) {
  const { tower, giant } = rook;
  const at = tower.position.clone();
  const floor = new THREE.Vector3(at.x, DUST_Y, at.z);

  // 1. Tiembla, cada vez más, con polvo en la base.
  dust.puff(floor, { count: 6, radius: 0.5, duration: 0.4 });
  await clock.tween(SHAKE_SECONDS, (t) => {
    const k = SHAKE_SIZE * t;
    tower.position.set(at.x + (Math.random() - 0.5) * k, 0, at.z + (Math.random() - 0.5) * k);
    tower.rotation.z = (Math.random() - 0.5) * k;
  });
  tower.position.copy(at);
  tower.rotation.z = 0;

  // 2. Estalla en rocas y polvo, y la cámara tiembla.
  tower.visible = false;
  rubble.explode(at, { color: rook.stone, count: 14 + Math.floor(Math.random() * 7), height: rook.height, obstacles });
  dust.puff(floor, { count: 18, radius: 0.9, duration: 0.8 });
  cinema.shake(0.12);

  // 3. El gigante se alza del suelo con un pequeño rebote.
  giant.figure.position.set(at.x, 0, at.z);
  giant.figure.scale.setScalar(0.2);
  giant.object.visible = true;
  giant.play('idle', { fade: 0 });
  await clock.tween(RISE_SECONDS, (t) => {
    giant.figure.scale.setScalar(0.2 + 0.8 * overshoot(t));
  });
  giant.figure.scale.setScalar(1);
  await clock.wait(SETTLE_SECONDS);
}

export async function giantToTower({ rook, clock, dust, rubble, restFacing }) {
  const { tower, giant } = rook;
  const at = giant.figure.position.clone();
  const floor = new THREE.Vector3(at.x, DUST_Y, at.z);

  // 1. El gigante se encoge dentro del polvo y las rocas vuelan hacia su casilla.
  dust.puff(floor, { count: 16, radius: 0.8, duration: 0.7 });
  rubble.implode(at, { color: rook.stone, count: 14, seconds: SHRINK_SECONDS });
  await clock.tween(SHRINK_SECONDS, (t) => {
    giant.figure.scale.setScalar(Math.max(0.001, 1 - t * t));
  });
  giant.object.visible = false;
  giant.figure.scale.setScalar(1);

  // 2. La torre sube del suelo con un rebote y se asienta, mirando al oponente.
  tower.position.set(at.x, 0, at.z);
  tower.rotation.set(0, restFacing, 0);
  tower.scale.setScalar(0.001);
  tower.visible = true;
  dust.puff(floor, { count: 10, radius: 0.6, duration: 0.5 });
  await clock.tween(REBUILD_SECONDS, (t) => {
    tower.scale.setScalar(Math.max(0.001, overshoot(t)));
  });
  tower.scale.setScalar(1);
  await clock.wait(REST_SECONDS);
}
