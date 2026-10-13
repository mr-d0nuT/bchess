import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOP_DISTANCE, HOP_SECONDS, RISE_SECONDS, REST_TURN_SECONDS, VANISH_SECONDS, WALK_TURN_SECONDS, walkOverTimeline,
} from '../src/moves/walk.js';
import { CASTLE_HOP, GIANT_BODY, GIANT_HIGH, KING_BODY, planCastleHop } from '../src/moves/castle-hop.js';

// Las casillas como las pone el tablero: una casilla mide 1 y el centro del tablero es el 0.
const sq = (name) => ({ x: 'abcdefgh'.indexOf(name[0]) - 3.5, z: 4.5 - Number(name[1]) });
const TOWER = { radius: 0.39, height: 2.38 };
const PEANA = 0.26;
const ENROQUES = [
  { nombre: 'blancas, corto', rey: ['e1', 'g1'], torre: ['h1', 'f1'] },
  { nombre: 'blancas, largo', rey: ['e1', 'c1'], torre: ['a1', 'd1'] },
  { nombre: 'negras, corto', rey: ['e8', 'g8'], torre: ['h8', 'f8'] },
  { nombre: 'negras, largo', rey: ['e8', 'c8'], torre: ['a8', 'd8'] },
];
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function plan({ rey, torre }) {
  const king = walkOverTimeline({ from: sq(rey[0]), to: sq(rey[1]), speed: 0.9, pedestal: PEANA });
  return { king, hop: planCastleHop({ king, tower: TOWER, from: sq(torre[0]), to: sq(torre[1]) }) };
}

// Lo que ocupa el rey en `t`, como lo dice KING_BODY: de pie un círculo; en marcha, un rectángulo hacia donde va.
function huecoAlRey(p, king, t) {
  const r = king.at(t);
  const cuerpo = KING_BODY[r.phase] ?? KING_BODY.standing;
  const dx = p.x - r.x;
  const dz = p.z - r.z;
  if (cuerpo.radius !== undefined) return { hueco: Math.hypot(dx, dz) - cuerpo.radius, tope: r.y + cuerpo.top };
  const ida = { x: king.at(king.end).x - king.at(0).x, z: king.at(king.end).z - king.at(0).z };
  const largo = Math.hypot(ida.x, ida.z);
  const u = (dx * ida.x + dz * ida.z) / largo;
  const v = (dx * ida.z - dz * ida.x) / largo;
  return { hueco: Math.hypot(Math.max(0, u - cuerpo.fwd, -cuerpo.back - u), Math.max(0, Math.abs(v) - cuerpo.side)), tope: r.y + cuerpo.top };
}

test('walkOverTimeline: el paseo de siempre, con sus tiempos y su sitio en cada momento', () => {
  const from = sq('e1');
  const to = sq('e3');
  const k = walkOverTimeline({ from, to, speed: 0.9, pedestal: PEANA });
  const walk = (2 - HOP_DISTANCE) / 0.9;
  assert.ok(close(k.walkAt, WALK_TURN_SECONDS + HOP_SECONDS + VANISH_SECONDS));
  assert.ok(close(k.arrive, k.walkAt + walk));
  assert.ok(close(k.end, k.arrive + RISE_SECONDS + REST_TURN_SECONDS));
  // Quieto en su peana mientras se gira.
  assert.deepEqual(k.at(0), { x: from.x, z: from.z, y: PEANA, phase: 'turn' });
  // Saltando de la peana: acaba a su radio, en el suelo.
  const bajo = k.at(k.walkAt - 0.01);
  assert.equal(bajo.phase, 'vanish');
  assert.ok(close(bajo.x, from.x) && close(bajo.z, from.z - HOP_DISTANCE) && bajo.y === 0);
  // A mitad del paseo, a mitad del camino que le queda.
  const medio = k.at(k.walkAt + walk / 2);
  assert.equal(medio.phase, 'walk');
  assert.ok(close(medio.z, from.z - HOP_DISTANCE - (2 - HOP_DISTANCE) / 2, 1e-6));
  // Y al final, en su casilla y en su peana.
  assert.deepEqual(k.at(k.end + 1), { x: to.x, z: to.z, y: PEANA, phase: 'rest' });
});

for (const enroque of ENROQUES) {
  test(`planCastleHop (${enroque.nombre}): salta a la vez que anda el rey y nunca lo toca`, () => {
    const { king, hop } = plan(enroque);
    assert.ok(hop, 'hay salto');
    const from = sq(enroque.torre[0]);
    const to = sq(enroque.torre[1]);
    // Empieza quieta en su casilla y acaba quieta en la otra, derecha y sin aplastar.
    const antes = hop.at(0);
    const despues = hop.at(Math.max(king.end, hop.end) + 0.5);
    for (const [p, en] of [[antes, from], [despues, to]]) {
      assert.ok(close(p.x, en.x) && close(p.z, en.z) && p.y === 0 && p.sy === 1 && p.sx === 1 && p.tilt === 0);
    }
    // Se agacha, despega y cae en orden, y mientras el rey anda: a la vez.
    assert.ok(hop.crouch < hop.liftoff && hop.liftoff < hop.landing && hop.landing < hop.end);
    assert.ok(hop.liftoff > king.walkAt && hop.liftoff < king.arrive, 'despega mientras el rey anda');
    // Ni muy alto ni muy bajo, y con la cámara sabiendo hasta dónde llega.
    assert.ok(hop.height >= CASTLE_HOP.low && hop.height <= CASTLE_HOP.high);
    assert.ok(hop.top > hop.height + TOWER.height * 0.9);
    assert.ok(hop.margin >= 0, `aire de sobra con el rey (${hop.margin})`);
    // Comprobado aparte, mirando más fino que quien lo calculó: cuando la torre está encima del rey (de lado, menos
    // del aire pedido), su base va por encima de la cabeza del rey con aire.
    let cruza = false;
    let lado = null;
    for (let t = 0; t <= Math.max(king.end, hop.end); t += 1 / 997) {
      const p = hop.at(t);
      // El eje de la torre visto desde arriba: de la base a la punta, que se va hacia donde se inclina.
      const largo = Math.hypot(to.x - from.x, to.z - from.z);
      const lean = TOWER.height * p.sy * Math.sin(p.tilt);
      let hueco = Infinity;
      let tope = 0;
      for (const k of [0, 0.25, 0.5, 0.75, 1]) {
        const q = { x: p.x + ((to.x - from.x) / largo) * lean * k, z: p.z + ((to.z - from.z) / largo) * lean * k };
        const r = huecoAlRey(q, king, t);
        hueco = Math.min(hueco, r.hueco);
        tope = r.tope;
      }
      const s = Math.sign((p.x - king.at(t).x) * (to.x - from.x) + (p.z - king.at(t).z) * (to.z - from.z));
      if (lado !== null && s !== lado) cruza = true;
      lado = s;
      const inclinada = TOWER.radius * p.sx * Math.abs(Math.sin(p.tilt));
      if (hueco - TOWER.radius * p.sx >= CASTLE_HOP.aside - 1e-6) continue;
      assert.ok(p.y - inclinada >= tope + CASTLE_HOP.over - 0.005, `t=${t.toFixed(3)}: la base (${(p.y - inclinada).toFixed(3)}) va por encima del rey (${tope.toFixed(3)})`);
    }
    assert.ok(cruza, 'la torre pasa al otro lado del rey');
  });
}

test('planCastleHop: el mismo enroque, el mismo salto (se calcula una vez)', () => {
  const a = plan(ENROQUES[0]).hop;
  const b = plan(ENROQUES[0]).hop;
  assert.equal(a, b);
});

test('planCastleHop: sin camino no hay salto', () => {
  const king = walkOverTimeline({ from: sq('e1'), to: sq('g1'), speed: 0.9, pedestal: PEANA });
  assert.equal(planCastleHop({ king, tower: TOWER, from: sq('h1'), to: sq('h1') }), null);
});

// El gigante (lo pidió el usuario: la torre salta en forma de gigante). El rey se vuelve y silba quieto en su peana
// (`espera`), la torre despierta en gigante, y no se agacha hasta estar despierto y vuelto (`earliest`).
for (const enroque of ENROQUES) {
  test(`planCastleHop con el gigante (${enroque.nombre}): despierto, salta por encima del rey sin tocarlo`, () => {
    const espera = 1.05;
    const base = walkOverTimeline({ from: sq(enroque.rey[0]), to: sq(enroque.rey[1]), speed: 0.9, pedestal: PEANA });
    const king = { ...base, walkAt: base.walkAt + espera, arrive: base.arrive + espera, end: base.end + espera, at: (t) => (t < espera ? { ...base.at(0), phase: 'turn' } : base.at(t - espera)) };
    const earliest = 2.15;
    const hop = planCastleHop({ king, jumper: GIANT_BODY, from: sq(enroque.torre[0]), to: sq(enroque.torre[1]), options: { earliest, high: GIANT_HIGH } });
    assert.ok(hop, 'hay salto');
    assert.ok(hop.crouch >= earliest - 1e-9, 'no se agacha antes de despertar');
    assert.ok(hop.liftoff > king.walkAt && hop.liftoff < king.arrive, 'despega mientras el rey anda');
    assert.ok(hop.height <= GIANT_HIGH);
    assert.ok(hop.margin >= 0, `aire de sobra con el rey (${hop.margin})`);
    const fin = hop.at(Math.max(king.end, hop.end) + 0.5);
    assert.ok(close(fin.x, sq(enroque.torre[1]).x) && close(fin.z, sq(enroque.torre[1]).z) && fin.y === 0);
  });
}
