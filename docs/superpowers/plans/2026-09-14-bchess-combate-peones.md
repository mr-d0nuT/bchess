# Combate entre peones — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un peón pueda comerse a otro en diagonal y que la captura sea un combate animado y vistoso, a veces duelo de lanzas y a veces cuerpo a cuerpo.

**Architecture:** Un reloj de juego con escala de tiempo mueve animaciones, efectos y coreografías, así la cámara lenta y el congelado de impacto frenan todo a la vez. El plan del combate (estilo, puestos, golpes, deslizamiento de la lanza) es puro y probado. Un director asíncrono ejecuta la coreografía con las piezas, los efectos de cómic y la cámara de cine, usando medidas de cada golpe tomadas al cargar.

**Tech Stack:** Three.js r186 en `vendor/three/`, módulos ES sin compilación, `node --test` para las pruebas, verificación por código en el panel de vista previa (servidor `bchess`, puerto 8741).

**Diseño:** `docs/superpowers/specs/2026-09-14-bchess-combate-peones-design.md`.

## Global Constraints

- Sin compilación: módulos ES con import map; Three.js r186 copiado en `vendor/three/`.
- Textos de la interfaz y comentarios en castellano; commits en castellano terminados en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Tono de dibujos animados, sin sangre.
- Gana siempre el atacante.
- Medidas en casillas (1 casilla = 1 unidad).
- Nadie invade las piezas vecinas. La lanza no atraviesa al rival ni se hunde en el suelo.
- Se trabaja en la rama `combate-peones`, porque `main` se publica sola en GitHub Pages. Se une a `main` al final.
- Los peones de los dos bandos tienen las mismas claves de animación de ataque (`box_01`, `box_02`, `box_03`, `front_kick_01`, `front_kick_02`).

---

## Estructura de ficheros

| Fichero | Tarea | Responsabilidad |
|---|---|---|
| `src/combat/clock.js` | 1 | Reloj de juego con `timeScale`: `tick`, `wait`, `tween`, `hold`. Puro. |
| `tests/clock.test.js` | 1 | Pruebas del reloj. |
| `src/moves/sequence.js` | 1 | El mover usa el reloj. Pasos de combate: `descend`, `walkTo`, `walkOnto`, `vanish`, `hop` y `turnTo` público. |
| `src/rules/pawn.js` | 2 | `pawnCaptures`. |
| `tests/pawn.test.js` | 2 | Pruebas de capturas. |
| `src/scene/highlights.js` | 2 | Aros rojos que laten (`showCaptures`, `pulse`). |
| `src/main.js` | 1-5 | Reloj en el bucle, capturas, efectos, cámara y director. |
| `src/pieces/clips.js` | 3 | Las versiones guardan su clave corta (`key`). |
| `tests/clips.test.js` | 3 | Se actualiza la prueba de `resolveMoves`. |
| `src/combat/plan.js` | 3 | Puro: `pickStyle`, `fightSpots`, `gripSlideForReach`, `peak`, `usableStrikes`, `planExchanges`. |
| `tests/combat-plan.test.js` | 3 | Pruebas del plan. |
| `src/pieces/piece.js` | 3 | Versión forzada, postura de lanza impuesta, deslizamiento extra, `attacks`, `strikes`, `hasClip`, `spearEnds`. |
| `src/combat/strikes.js` | 3 | `measureStrikes(kit, spawnPiece)`. |
| `src/fx/impact.js` | 4 | Destellos, chispas y estrellitas de K.O. |
| `src/scene/cinema.js` | 4 | Encuadre, temblor y vuelta de la cámara. |
| `src/ui/hud.js`, `src/ui/style.css` | 4 | Destello blanco. |
| `src/combat/duel.js` | 5 | `canFight` y `runCombat`. |
| `assets/models/*`, `manifest.json` | 6 | Animaciones `taunt`, `victory` y `defeat`. |

---

### Tarea 1: Reloj de juego

**Files:**
- Create: `src/combat/clock.js`, `tests/clock.test.js`
- Modify: `src/moves/sequence.js` (fichero completo), `src/main.js`

**Interfaces:**
- Produces: `createClock() → { timeScale, now, tick(dt) → pasoDeJuego, wait(s) → Promise, tween(s, step(t)) → Promise, hold(s) → Promise }`.
- Produces: `createMover({ piece, board, dust, clock, onBusy, restFacing })`. Devuelve:
  - `placeOn(square)`, `goTo(square) → Promise<bool>`, `perform(action)`, `fidget(options)`;
  - `turnTo(angle, s)`, `descend(spot)`, `walkTo(point)`, `walkOnto(square)`, `vanish()`, `hop(times)`;
  - `square`, `busy`.

- [ ] **Paso 1: Prueba del reloj**

`tests/clock.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/combat/clock.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('wait se cumple al pasar el tiempo de juego', async () => {
  const clock = createClock();
  let done = false;
  clock.wait(1).then(() => { done = true; });
  clock.tick(0.6);
  await flush();
  assert.equal(done, false);
  clock.tick(0.5);
  await flush();
  assert.equal(done, true);
});

test('con timeScale 0,5 el tiempo de juego va a la mitad', async () => {
  const clock = createClock();
  clock.timeScale = 0.5;
  let done = false;
  clock.wait(1).then(() => { done = true; });
  assert.equal(clock.tick(1.5), 0.75);
  await flush();
  assert.equal(done, false);
  clock.tick(0.6);
  await flush();
  assert.equal(done, true);
});

test('tween recorre de 0 a 1 y termina en 1', async () => {
  const clock = createClock();
  const seen = [];
  let done = false;
  clock.tween(1, (t) => seen.push(t)).then(() => { done = true; });
  clock.tick(0.25);
  clock.tick(0.5);
  clock.tick(0.5);
  await flush();
  assert.deepEqual(seen, [0.25, 0.75, 1]);
  assert.equal(done, true);
});

test('un tween sin duración da el paso final enseguida', async () => {
  const clock = createClock();
  const seen = [];
  await clock.tween(0, (t) => seen.push(t));
  assert.deepEqual(seen, [1]);
});

test('hold congela el tiempo de juego y luego recupera la escala', async () => {
  const clock = createClock();
  clock.timeScale = 0.3;
  let done = false;
  clock.hold(0.1).then(() => { done = true; });
  assert.equal(clock.timeScale, 0);
  assert.equal(clock.tick(0.05), 0);
  await flush();
  assert.equal(done, false);
  clock.tick(0.06);
  await flush();
  assert.equal(done, true);
  assert.equal(clock.timeScale, 0.3);
});
```

- [ ] **Paso 2: Comprobar que falla**

Run: `node --test tests/clock.test.js`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (`src/combat/clock.js`).

- [ ] **Paso 3: El reloj**

`src/combat/clock.js`:

```js
// Reloj del juego. Avanza con el bucle de animación multiplicado por `timeScale`: con él van
// las esperas y transiciones, las animaciones y los efectos, de modo que la cámara lenta y el
// congelado de impacto del combate lo frenan todo a la vez.

export function createClock() {
  let now = 0;
  const timers = [];
  const tweens = [];
  const holds = [];

  const clock = {
    timeScale: 1,

    get now() {
      return now;
    },

    // Avanza `dt` segundos reales y devuelve los segundos de juego que han pasado.
    tick(dt) {
      for (const hold of [...holds]) {
        hold.left -= dt;
        if (hold.left <= 0) {
          holds.splice(holds.indexOf(hold), 1);
          hold.done();
        }
      }
      const step = dt * clock.timeScale;
      now += step;
      for (const tween of [...tweens]) {
        const t = Math.min(1, (now - tween.start) / tween.seconds);
        tween.step(t);
        if (t >= 1) {
          tweens.splice(tweens.indexOf(tween), 1);
          tween.resolve();
        }
      }
      for (const timer of [...timers]) {
        if (now >= timer.at) {
          timers.splice(timers.indexOf(timer), 1);
          timer.resolve();
        }
      }
      return step;
    },

    // Espera `seconds` de tiempo de juego.
    wait(seconds) {
      return new Promise((resolve) => timers.push({ at: now + seconds, resolve }));
    },

    // Llama a `step(t)` con t de 0 a 1 durante `seconds` de tiempo de juego.
    tween(seconds, step) {
      if (!(seconds > 0)) {
        step(1);
        return Promise.resolve();
      }
      return new Promise((resolve) => tweens.push({ start: now, seconds, step, resolve }));
    },

    // Congela el tiempo de juego `seconds` reales y después recupera la escala que había.
    hold(seconds) {
      const previous = clock.timeScale;
      clock.timeScale = 0;
      return new Promise((resolve) => holds.push({
        left: seconds,
        done: () => {
          clock.timeScale = previous;
          resolve();
        },
      }));
    },
  };
  return clock;
}
```

- [ ] **Paso 4: Comprobar que pasa**

Run: `node --test tests/clock.test.js`
Expected: `ℹ pass 5`, `ℹ fail 0`.

- [ ] **Paso 5: El mover con el reloj y los pasos del combate**

`src/moves/sequence.js` (fichero completo):

```js
import * as THREE from 'three';
import { REST_FACING, planWalk, pointAlong, shortestTurn } from './walk.js';

// Coreografía de «ir a una casilla», de las acciones de los botones y de los pasos del combate.
// Los tiempos van con el reloj del juego (`clock`), así que la cámara lenta del combate también
// los frena. Mientras dura una orden con bloqueo, `busy` es true y se ignora cualquier otra.

const HOP_DISTANCE = 0.5; // lo que avanza al saltar de la peana (su radio)
const DUST_Y = 0.05;

export function createMover({ piece, board, dust, clock, onBusy = () => {}, restFacing = REST_FACING }) {
  let square = null;
  let busy = false;
  const tween = (seconds, step) => clock.tween(seconds, step);

  function setBusy(value) {
    busy = value;
    onBusy(value);
  }

  async function exclusive(task) {
    if (busy) return false;
    setBusy(true);
    try {
      await task();
      return true;
    } finally {
      setBusy(false);
    }
  }

  function turnTo(angle, seconds) {
    const from = piece.figure.rotation.y;
    const delta = shortestTurn(from, angle);
    return tween(seconds, (t) => {
      piece.figure.rotation.y = from + delta * t;
    });
  }

  function placeOn(target) {
    square = target;
    piece.placeAt(board.squareToWorld(target));
    piece.object.visible = true;
    piece.figure.scale.setScalar(1);
    piece.pedestal.visible = true;
    piece.pedestal.scale.setScalar(1);
    piece.pedestal.rotation.y = restFacing; // el escudo de la peana, delante, como la pieza
    piece.face(restFacing);
  }

  // La peana reaparece bajo sus pies en `to` entre polvo, lo sube y lo gira hacia el oponente.
  async function rise(to) {
    piece.play('idle', { fade: 0.3 });
    piece.pedestal.position.set(to.x, 0, to.z);
    piece.pedestal.rotation.y = restFacing;
    piece.pedestal.visible = true;
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
    await tween(0.4, (t) => {
      const k = 1 - (1 - t) ** 3;
      piece.pedestal.scale.setScalar(Math.max(0.001, k));
      piece.figure.position.y = piece.pedestalHeight * k;
    });
    await turnTo(restFacing, 0.35);
  }

  function goTo(target) {
    if (target === square) return Promise.resolve(false);
    return exclusive(async () => {
      const from = board.squareToWorld(square);
      const to = board.squareToWorld(target);
      const { heading } = planWalk(from, to, piece.walkSpeed);
      const h = piece.pedestalHeight;

      await turnTo(heading, 0.25);

      // 1. Salta de la peana (o baja de un paso si no hay animación de salto).
      const hopStart = piece.figure.position.clone();
      const hopEnd = new THREE.Vector3(from.x + Math.sin(heading) * HOP_DISTANCE, 0, from.z + Math.cos(heading) * HOP_DISTANCE);
      const canJump = piece.has('jump');
      piece.play(canJump ? 'jump' : 'walk', { loop: !canJump, fade: 0.15 });
      await tween(0.35, (t) => {
        piece.figure.position.lerpVectors(hopStart, hopEnd, t);
        piece.figure.position.y = h * (1 - t) + Math.sin(Math.PI * t) * 0.18;
      });

      // 2. La peana se esfuma en una nube de polvo.
      dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
      piece.play('walk', { fade: 0.15 });
      await tween(0.4, (t) => {
        piece.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      });
      piece.pedestal.visible = false;

      // 3. Anda hasta la casilla.
      const walk = planWalk(hopEnd, to, piece.walkSpeed);
      await tween(walk.duration, (t) => {
        const p = pointAlong(hopEnd, to, t);
        piece.figure.position.set(p.x, 0, p.z);
      });

      // 4. La peana reaparece bajo sus pies, lo sube y vuelve a mirar al oponente.
      await rise(to);
      square = target;
    });
  }

  // Cae dentro de su casilla: la peana se esfuma, el peón cae al tablero y, pasado un rato,
  // la peana reaparece bajo sus pies entre una nube de polvo y lo vuelve a subir.
  async function fall() {
    const h = piece.pedestalHeight;
    const at = piece.figure.position.clone();
    const falling = piece.playOnce('fall');
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z));
    await tween(0.35, (t) => {
      piece.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      piece.figure.position.y = h * (1 - t * t);
    });
    piece.pedestal.visible = false;
    await falling;
    await clock.wait(1.5);
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { radius: 0.5 });
    piece.play('idle', { fade: 0 });
    piece.pedestal.visible = true;
    await tween(0.4, (t) => {
      const k = 1 - (1 - t) ** 3;
      piece.pedestal.scale.setScalar(Math.max(0.001, k));
      piece.figure.position.y = h * k;
    });
  }

  function perform(action) {
    if (!piece.has(action)) return Promise.resolve(false);
    return exclusive(async () => {
      if (action === 'fall') {
        await fall();
        return;
      }
      await piece.playOnce(action);
      piece.play('idle', { fade: 0.25 });
    });
  }

  // Gesto suelto en reposo; nunca mientras la pieza está en plena coreografía. Devuelve la
  // versión elegida, o null.
  function fidget(options) {
    return busy ? null : piece.fidget(options);
  }

  // Pasos del combate. Los usa el director, que ya tiene el bloqueo general, así que no
  // pasan por `exclusive`.

  // Baja de la peana en su sitio: la peana encoge entre polvo mientras la figura baja al
  // tablero y se desliza hasta `spot` ({x, z}, dentro de su casilla).
  async function descend(spot) {
    const h = piece.pedestalHeight;
    const start = piece.figure.position.clone();
    piece.play('idle', { fade: 0.2 });
    dust.puff(new THREE.Vector3(start.x, DUST_Y, start.z));
    await tween(0.35, (t) => {
      piece.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      piece.figure.position.set(start.x + (spot.x - start.x) * t, h * (1 - t * t), start.z + (spot.z - start.z) * t);
    });
    piece.pedestal.visible = false;
  }

  // Anda por el tablero, ya sin peana, desde donde está hasta `to` ({x, z}).
  async function walkTo(to) {
    const at = piece.figure.position;
    const from = { x: at.x, z: at.z };
    const walk = planWalk(from, to, piece.walkSpeed);
    if (walk.distance < 1e-3) return;
    await turnTo(walk.heading, 0.25);
    piece.play('walk', { fade: 0.15 });
    await tween(walk.duration, (t) => {
      const p = pointAlong(from, to, t);
      piece.figure.position.set(p.x, 0, p.z);
    });
    piece.play('idle', { fade: 0.25 });
  }

  // Tras ganar: anda hasta la casilla conquistada y sube a su peana.
  async function walkOnto(target) {
    const to = board.squareToWorld(target);
    await walkTo(to);
    await rise(to);
    square = target;
  }

  // Desaparece del tablero encogiendo dentro de una gran nube de polvo.
  async function vanish() {
    const at = piece.figure.position.clone();
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await tween(0.5, (t) => {
      const k = Math.max(0.001, 1 - t * t);
      piece.figure.scale.setScalar(k);
      piece.pedestal.scale.setScalar(k);
    });
    piece.object.visible = false;
  }

  // Saltitos de alegría, para celebrar si no hay animación de victoria.
  async function hop(times = 2) {
    const base = piece.figure.position.y;
    for (let i = 0; i < times; i++) {
      await tween(0.32, (t) => {
        piece.figure.position.y = base + Math.sin(Math.PI * t) * 0.22;
      });
      const at = piece.figure.position;
      dust.puff(new THREE.Vector3(at.x, base + DUST_Y, at.z), { count: 5, radius: 0.3, duration: 0.3 });
    }
  }

  return {
    placeOn,
    goTo,
    perform,
    fidget,
    turnTo,
    descend,
    walkTo,
    walkOnto,
    vanish,
    hop,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
```

- [ ] **Paso 6: El reloj en el bucle de `main.js`**

Añadir el import tras el de `gestures.js`:

```js
import { createClock } from './combat/clock.js';
```

Tras `const dust = createDust(stage.scene);`:

```js
  const clock = createClock();
```

En el bucle, sustituir `for (const pawn of pawns) pawn.piece.update(dt);` y `dust.update(dt);` por:

```js
    const step = clock.tick(dt);
    for (const pawn of pawns) pawn.piece.update(step);
```

y

```js
    dust.update(step);
```

En `loadPieces`, `createMover({ piece, board, dust, onBusy, …` pasa a `createMover({ piece, board, dust, clock, onBusy, …`. En `window.bchess` se añade `clock`.

- [ ] **Paso 7: Pruebas y comprobación en el navegador**

Run: `npm test` → Expected: `ℹ fail 0`.

En el panel de vista previa (`preview_start` con `bchess`, ir a `http://localhost:8741/`), `javascript_tool`:

```js
for (let i = 0; i < 80 && !(window.bchess && window.bchess.pawns.length === 16); i++) await new Promise((r) => setTimeout(r, 500));
const b = window.bchess;
const p = b.pawns.find((x) => x.mover.square === 'e2');
await b.tap({ owner: p });
await b.tap({ square: 'e4' });
const ataque = await p.mover.perform('attack');
JSON.stringify({ casilla: p.mover.square, ataque });
```

Expected: `{"casilla":"e4","ataque":true}` y `read_console_messages` sin errores.

- [ ] **Paso 8: Commit**

```bash
git add src/combat/clock.js tests/clock.test.js src/moves/sequence.js src/main.js
git commit -m "Reloj de juego con escala de tiempo para las coreografías" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 2: Capturas (todavía sin combate)

**Files:**
- Modify: `src/rules/pawn.js`, `tests/pawn.test.js`, `src/scene/highlights.js`, `src/main.js`

**Interfaces:**
- Consumes: `createMover(...).vanish()` y `.goTo()` (tarea 1).
- Produces: `pawnCaptures(square, enemies: Set, color) → string[]`; `highlights.showCaptures(squares)` y `highlights.pulse(seconds)`; en `main.js`, `capture(attacker, defender)` y `removePawn(pawn)`.

- [ ] **Paso 1: Pruebas de capturas**

En `tests/pawn.test.js`, cambiar el import por `import { pawnCaptures, pawnMoves } from '../src/rules/pawn.js';` y añadir al final:

```js
test('capturas: en diagonal hacia delante, solo si hay un enemigo', () => {
  assert.deepEqual(pawnCaptures('d4', new Set(['c5', 'e5']), 'white'), ['c5', 'e5']);
  assert.deepEqual(pawnCaptures('d4', new Set(['d5', 'c3', 'e3']), 'white'), []);
  assert.deepEqual(pawnCaptures('e5', new Set(['d4', 'f4']), 'black'), ['d4', 'f4']);
  assert.deepEqual(pawnCaptures('e5', new Set(['d6', 'f6']), 'black'), []);
});

test('capturas en los bordes del tablero', () => {
  assert.deepEqual(pawnCaptures('a2', new Set(['b3']), 'white'), ['b3']);
  assert.deepEqual(pawnCaptures('h7', new Set(['g6']), 'black'), ['g6']);
});

test('sin capturas desde la última fila; color desconocido, error', () => {
  assert.deepEqual(pawnCaptures('c8', new Set(['b9', 'd9']), 'white'), []);
  assert.throws(() => pawnCaptures('e2', new Set(), 'green'), /Color no válido/);
});
```

- [ ] **Paso 2: Comprobar que falla**

Run: `node --test tests/pawn.test.js` → Expected: FAIL (`pawnCaptures` no existe).

- [ ] **Paso 3: `pawnCaptures`**

En `src/rules/pawn.js`, tras `PAWN_RULES`:

```js
const FILES = 'abcdefgh';
```

y al final:

```js
// Casillas que puede comer: en diagonal hacia delante, ocupadas por un enemigo. `enemies` es
// un Set con las casillas de las piezas del otro color.
export function pawnCaptures(square, enemies, color = 'white') {
  if (!Object.hasOwn(PAWN_RULES, color)) throw new Error(`Color no válido: ${color}`);
  const { step, lastRank } = PAWN_RULES[color];
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (rank === lastRank) return [];
  const captures = [];
  for (const side of [-1, 1]) {
    const column = FILES[file + side];
    const target = column && column + (rank + step);
    if (target && enemies.has(target)) captures.push(target);
  }
  return captures;
}
```

- [ ] **Paso 4: Comprobar que pasa**

Run: `node --test tests/pawn.test.js` → Expected: `ℹ fail 0`.

- [ ] **Paso 5: Aros rojos**

En `src/scene/highlights.js`, tras `const GOLD = 0xf2c14e;`:

```js
const RED = 0xe0493a;
```

Tras la creación de `dots`:

```js
  const captureGeometry = new THREE.RingGeometry(0.36, 0.47, 48);
  const captureMaterial = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.9, depthWrite: false });
  const captureRings = [];

  // Aro rojo bajo cada enemigo que el peón elegido puede comerse.
  function showCaptures(squares) {
    for (const mark of captureRings) scene.remove(mark);
    captureRings.length = 0;
    for (const square of squares) {
      const mark = new THREE.Mesh(captureGeometry, captureMaterial);
      mark.rotation.x = -Math.PI / 2;
      mark.position.copy(board.squareToWorld(square)).setY(LIFT);
      scene.add(mark);
      captureRings.push(mark);
    }
  }

  // Los aros rojos laten para llamar la atención.
  function pulse(seconds) {
    captureMaterial.opacity = 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(seconds * 6));
  }
```

`clear()` también llama a `showCaptures([])` y el `return` pasa a `{ select, showMoves, showCaptures, pulse, clear }`. El comentario de cabecera añade: «y un aro rojo bajo cada enemigo que puede comerse».

- [ ] **Paso 6: Capturar en `main.js`**

1. Import: `import { pawnCaptures, pawnMoves } from './rules/pawn.js';`.
2. `const state = { selected: null, busy: false, fighting: false, lastStyle: null };`.
3. En `directGestures`: `const candidates = state.busy || state.fighting ? [] : pawns.filter((pawn) => pawn !== state.selected);`.
4. En el bucle, tras `dust.update(step);`: `highlights.pulse(now / 1000);`.
5. Tras `movesOf`:

```js
  const capturesOf = (pawn) => pawnCaptures(
    pawn.mover.square,
    new Set(pawns.filter((p) => p.color !== pawn.color).map((p) => p.mover.square)),
    pawn.color,
  );
  const refreshButtons = () => hud.setBusy(state.busy || state.fighting || !state.selected);
```

6. `select(pawn)` añade `highlights.showCaptures(pawn ? capturesOf(pawn) : []);` tras `showMoves`.
7. Tras `onBusy`:

```js
  function removePawn(pawn) {
    stage.scene.remove(pawn.piece.object);
    pawns.splice(pawns.indexOf(pawn), 1);
    if (gesture.performer === pawn) gesture.performer = null;
    if (gesture.last === pawn) gesture.last = null;
  }

  // Un peón se come a otro: el vencido se esfuma y el ganador anda hasta su casilla.
  async function capture(attacker, defender) {
    state.fighting = true;
    highlights.clear();
    refreshButtons();
    const target = defender.mover.square;
    try {
      await defender.mover.vanish();
      removePawn(defender);
      await attacker.mover.goTo(target);
    } catch (err) {
      console.error('[BChess] La captura falló:', err);
      attacker.mover.placeOn(target);
    } finally {
      if (pawns.includes(defender)) removePawn(defender);
      state.fighting = false;
      select(attacker);
    }
  }
```

8. `handleTap` completo:

```js
  async function handleTap({ owner, square }) {
    if (state.busy || state.fighting) return;
    const tapped = owner ?? (square ? pawnAt(square) : null);
    const pawn = state.selected;
    if (pawn && tapped && tapped.color !== pawn.color && capturesOf(pawn).includes(tapped.mover.square)) {
      await capture(pawn, tapped);
      return;
    }
    if (tapped) {
      select(tapped);
      return;
    }
    if (pawn && square && movesOf(pawn).includes(square)) {
      highlights.clear();
      await pawn.mover.goTo(square);
      select(pawn);
      return;
    }
    select(null);
  }
```

9. `hud.onAction`: `if (!state.busy && !state.fighting && state.selected) state.selected.mover.perform(action);`.
10. `window.bchess` añade `highlights` y `capture`. El comentario de cabecera explica los aros rojos.

- [ ] **Paso 7: Pruebas y comprobación**

Run: `npm test` → Expected: `ℹ fail 0`.

En la vista previa, recargar y:

```js
for (let i = 0; i < 80 && !(window.bchess && window.bchess.pawns.length === 16); i++) await new Promise((r) => setTimeout(r, 500));
const b = window.bchess; b.gesture.at = Infinity;
const w = b.pawns.find((p) => p.mover.square === 'e2');
const k = b.pawns.find((p) => p.mover.square === 'd7');
w.mover.placeOn('e4'); k.mover.placeOn('d5');
await b.tap({ owner: w });
const aros = b.stage.scene.children.filter((o) => o.isMesh && o.material.color && o.material.color.getHex() === 0xe0493a).length;
await b.tap({ owner: k });
JSON.stringify({ aros, peones: b.pawns.length, ganador: w.mover.square, elegido: b.state.selected === w });
```

Expected: `{"aros":1,"peones":15,"ganador":"d5","elegido":true}`.

- [ ] **Paso 8: Commit**

```bash
git add src/rules/pawn.js tests/pawn.test.js src/scene/highlights.js src/main.js
git commit -m "Capturas en diagonal con aros rojos que laten" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 3: Medidas de los golpes y plan del combate

**Files:**
- Create: `src/combat/plan.js`, `tests/combat-plan.test.js`, `src/combat/strikes.js`
- Modify: `src/pieces/clips.js`, `tests/clips.test.js`, `src/pieces/piece.js`, `src/main.js`

**Interfaces:**
- Consumes: `spawnPiece(kit)` y la pieza (`play`, `update`, `props`, `object`, `placeAt`, `face`).
- Produces:
  - Constantes: `STYLES`, `DUEL_RETREAT = 0.3`, `MELEE_DISTANCE = 0.9`, `TORSO = 0.17`.
  - `pickStyle(last, random) → 'duel' | 'melee'`.
  - `fightSpots(from, to, style) → { attacker:{x,z}, defender:{x,z}, attackerFacing, defenderFacing, distance }`.
  - `gripSlideForReach({ reach, distance, torso }) → número ≥ 0`.
  - `peak(samples) → { t, value } | null`.
  - `usableStrikes(attacks, strikes, style) → string[]` (claves).
  - `planExchanges(keys, random) → [{ by: 'attacker' | 'defender', key, final }]`.
  - `measureStrikes(kit, spawnPiece) → { [key]: { duration, spear: {t, reach} | null, body: {t, reach, bone} } }`.
  - En la pieza:
    - `play(action, { clip })` y `playOnce(action, { clip })`;
    - `setSpearPose(name | null)`, `setGripSlide(amount)`;
    - `attacks` (versiones de ataque `{ key, clip, spear, travel }`), `strikes` (`kit.strikes`), `hasClip(action, key)`;
    - `spearEnds` (`{ bottom, top }` o null).
  - Las versiones de `resolveMoves` llevan `key`.

- [ ] **Paso 1: Pruebas**

En `tests/clips.test.js`, en la prueba `resolveMoves usa el manifiesto…`, las expectativas pasan a incluir `key`:

```js
  assert.deepEqual(moves.attack, [{ clip: 'preset:biped:boxing_01.001', key: 'boxing_01', spear: 'forward' }]);
  assert.deepEqual(moves.hit, [{ clip: 'preset:biped:hit_to_head.001', key: 'hit_to_head' }]);
  assert.deepEqual(moves.idle, [{ clip: 'preset:biped:idle.001', key: 'preset:biped:idle.001' }]);
  assert.deepEqual(moves.walk, [{ clip: 'preset:biped:walk.001', key: 'preset:biped:walk.001' }]);
  assert.deepEqual(moves.fall, [{ clip: 'preset:biped:fall.001', key: 'preset:biped:fall.001' }]);
```

`tests/combat-plan.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUEL_RETREAT, MELEE_DISTANCE, fightSpots, gripSlideForReach, peak, pickStyle, planExchanges, usableStrikes,
} from '../src/combat/plan.js';

const close = (a, b) => Math.abs(a - b) < 1e-9;
const sequence = (...values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

test('pickStyle no repite el estilo anterior', () => {
  assert.equal(pickStyle('duel', () => 0.9), 'melee');
  assert.equal(pickStyle('melee', () => 0), 'duel');
  assert.ok(['duel', 'melee'].includes(pickStyle(null, () => 0.7)));
});

test('duelo: el atacante se retira dentro de su casilla y se miran', () => {
  const s = fightSpots({ x: 0, z: 0 }, { x: 1, z: -1 }, 'duel');
  assert.ok(close(s.defender.x, 1) && close(s.defender.z, -1));
  assert.ok(close(Math.hypot(s.attacker.x, s.attacker.z), DUEL_RETREAT));
  assert.ok(close(s.distance, Math.SQRT2 + DUEL_RETREAT));
  assert.ok(close(s.attackerFacing, Math.atan2(1, -1)));
  assert.ok(close(s.defenderFacing, Math.atan2(-1, 1)));
});

test('cuerpo a cuerpo: el atacante queda a la distancia fija del defensor', () => {
  const s = fightSpots({ x: 2, z: 2 }, { x: 1, z: 3 }, 'melee');
  assert.ok(close(s.distance, MELEE_DISTANCE));
  assert.ok(close(Math.hypot(s.attacker.x - 1, s.attacker.z - 3), MELEE_DISTANCE));
});

test('en las cuatro diagonales el atacante no sale de su casilla', () => {
  for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (const style of ['duel', 'melee']) {
      const s = fightSpots({ x: 0, z: 0 }, { x: dx, z: dz }, style);
      assert.ok(Math.abs(s.attacker.x) < 0.5 && Math.abs(s.attacker.z) < 0.5, `${style} ${dx},${dz}`);
    }
  }
});

test('un estilo desconocido lanza error', () => {
  assert.throws(() => fightSpots({ x: 0, z: 0 }, { x: 1, z: 1 }, 'magia'), /Estilo no válido/);
});

test('gripSlideForReach deja la punta en el pecho y nunca desliza hacia la punta', () => {
  assert.ok(close(gripSlideForReach({ reach: 2.18, distance: 1.71 }), 2.18 - (1.71 - 0.17)));
  assert.equal(gripSlideForReach({ reach: 1, distance: 2 }), 0);
});

test('peak devuelve la muestra más alta', () => {
  assert.deepEqual(peak([{ t: 0, value: 1 }, { t: 0.5, value: 3 }, { t: 1, value: 2 }]), { t: 0.5, value: 3 });
  assert.equal(peak([]), null);
});

test('usableStrikes: estocadas para el duelo y golpes que llegan para el cuerpo a cuerpo', () => {
  const attacks = [{ key: 'box_03', spear: 'forward' }, { key: 'front_kick_01' }, { key: 'front_kick_02' }, { key: 'sin_medir' }];
  const strikes = {
    box_03: { spear: { t: 1.1, reach: 2.18 }, body: { t: 0.7, reach: 0.68, bone: 'L_Hand' } },
    front_kick_01: { spear: { t: 0.5, reach: 1.62 }, body: { t: 0.68, reach: 0.33, bone: 'R_ToeBase' } },
    front_kick_02: { spear: { t: 0, reach: 0.41 }, body: { t: 0.95, reach: 0.78, bone: 'R_ToeBase' } },
  };
  assert.deepEqual(usableStrikes(attacks, strikes, 'duel'), ['box_03']);
  assert.deepEqual(usableStrikes(attacks, strikes, 'melee'), ['box_03', 'front_kick_02']);
});

test('planExchanges: uno o dos golpes previos y el final del atacante, sin repetir seguidos', () => {
  const short = planExchanges(['a', 'b', 'c'], sequence(0, 0.9, 0));
  assert.deepEqual(short.map((beat) => beat.by), ['attacker', 'attacker']);
  assert.deepEqual(short.map((beat) => beat.final), [false, true]);
  const long = planExchanges(['a', 'b', 'c'], sequence(0, 0.1, 0, 0));
  assert.deepEqual(long.map((beat) => beat.by), ['attacker', 'defender', 'attacker']);
  for (let i = 1; i < long.length; i++) assert.notEqual(long[i].key, long[i - 1].key);
});

test('planExchanges sin golpes lanza error', () => {
  assert.throws(() => planExchanges([]), /No hay golpes/);
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `npm test` → Expected: FAIL en `clips.test.js` (falta `key`) y en `combat-plan.test.js` (no existe el módulo).

- [ ] **Paso 3: `key` en `resolveMoves` y el plan**

En `src/pieces/clips.js`, `resolveMoves`:
- `result[action] = auto[action] ? [{ clip: auto[action], key: auto[action] }] : [];`
- `if (name) result[action].push({ ...variant, key: variant.clip, clip: name });`
- Al comentario se añade: «Cada versión guarda su clave corta en `key`».

`src/combat/plan.js`:

```js
import { pickVariant } from '../pieces/clips.js';

// Plan del combate entre dos peones: estilo, puestos de los luchadores, golpes y cuánto debe
// resbalar la lanza para no atravesar al rival. Todo puro y en casillas.

export const STYLES = ['duel', 'melee'];
export const DUEL_RETREAT = 0.3; // en el duelo, el atacante se retira dentro de su casilla
export const MELEE_DISTANCE = 0.9; // separación de los luchadores en el cuerpo a cuerpo
export const TORSO = 0.17; // del centro de la figura a su pecho
const MELEE_SLACK = 0.15; // lo que un golpe puede quedarse corto en el cuerpo a cuerpo

// Estilo al azar, sin repetir el del combate anterior.
export function pickStyle(last, random = Math.random) {
  const pool = STYLES.filter((style) => style !== last);
  return pool[Math.floor(random() * pool.length)];
}

// Dónde se coloca cada luchador y hacia dónde mira (ángulos como en `walk.js`). `from` y `to`
// son los centros {x, z} de las casillas del atacante y del defensor.
export function fightSpots(from, to, style) {
  if (!STYLES.includes(style)) throw new Error(`Estilo no válido: ${style}`);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const attacker = style === 'duel'
    ? { x: from.x - ux * DUEL_RETREAT, z: from.z - uz * DUEL_RETREAT }
    : { x: to.x - ux * MELEE_DISTANCE, z: to.z - uz * MELEE_DISTANCE };
  const defender = { x: to.x, z: to.z };
  return {
    attacker,
    defender,
    attackerFacing: Math.atan2(ux, uz),
    defenderFacing: Math.atan2(-ux, -uz),
    distance: Math.hypot(defender.x - attacker.x, defender.z - attacker.z),
  };
}

// Cuánto debe resbalar la lanza hacia el regatón para que la punta, que en la estocada llega
// a `reach`, se quede en el pecho de un rival a `distance`.
export function gripSlideForReach({ reach, distance, torso = TORSO }) {
  return Math.max(0, reach - (distance - torso));
}

// Muestra con el valor más alto de una lista de { t, value }, o null si está vacía.
export function peak(samples) {
  let best = null;
  for (const sample of samples) if (!best || sample.value > best.value) best = sample;
  return best;
}

// Claves de los golpes que sirven para un estilo. `attacks` son las versiones de ataque de la
// pieza ({ key, spear }) y `strikes`, sus medidas por clave. El duelo usa las estocadas; el
// cuerpo a cuerpo, los golpes con mano o pie que llegan al rival.
export function usableStrikes(attacks, strikes, style) {
  return attacks
    .filter((attack) => {
      const strike = strikes[attack.key];
      if (!strike) return false;
      if (style === 'duel') return attack.spear === 'forward' && Boolean(strike.spear);
      return Boolean(strike.body) && strike.body.reach >= MELEE_DISTANCE - TORSO - MELEE_SLACK;
    })
    .map((attack) => attack.key);
}

// Intercambios: uno o dos golpes previos (el primero del atacante; el segundo, un contraataque
// del defensor) y el golpe final del atacante, sin repetir golpe dos veces seguidas.
export function planExchanges(keys, random = Math.random) {
  if (!keys.length) throw new Error('No hay golpes para este estilo');
  let last = -1;
  const next = () => {
    last = pickVariant(keys.length, last, random);
    return keys[last];
  };
  const beats = [{ by: 'attacker', key: next(), final: false }];
  if (random() < 0.5) beats.push({ by: 'defender', key: next(), final: false });
  beats.push({ by: 'attacker', key: next(), final: true });
  return beats;
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `npm test` → Expected: `ℹ fail 0`.

- [ ] **Paso 5: La pieza, preparada para el combate**

En `src/pieces/piece.js`:

1. Tras `const SPEAR_FLOOR_MARGIN = …`:

```js
const GRIP_SPEED = 2.5; // casillas por segundo que resbala la lanza cuando lo pide el combate
```

2. Sustituir las tres variables de la lanza (`spearTarget`, `spearBlend`, `spearPose`) por:

```js
  let spearTarget = 0; // 0 = lanza en la mano; 1 = en la postura `spearPose`
  let spearBlend = 0;
  let spearPose = SPEAR_POSES.forward;
  let spearOverride = null; // postura que impone el combate a todo lo que haga ('upright'…)
  let currentVariant = null;
  let gripTarget = 0; // lo que el combate pide que la lanza resbale hacia el regatón
  let grip = 0;

  function applySpearPose() {
    const pose = SPEAR_POSES[spearOverride ?? currentVariant?.spear];
    if (pose) spearPose = pose;
    spearTarget = pose ? 1 : 0;
  }
```

3. `play`:

```js
  // Reproduce una versión de la acción: la de clave `clip` si se pide, o una al azar sin
  // repetir la anterior (o la de `avoid`).
  function play(action, { loop = true, fade = 0.25, avoid, clip } = {}) {
    const list = variants[action];
    if (!list?.length) return null;
    const forced = clip ? list.findIndex((variant) => variant.key === clip) : -1;
    const index = forced >= 0 ? forced : pickVariant(list.length, avoid ?? lastVariant[action] ?? -1);
```

y, dentro, las tres líneas que calculan `pose` y `spearTarget` pasan a:

```js
    currentVariant = variant;
    applySpearPose();
```

4. `playOnce(action, { fade = 0.2, clip } = {})`, que llama a `play(action, { loop: false, fade, clip })`.
5. En la lanza enganchada, guardar sus extremos antes de `attachInWorld`. Ya existe `spearEnds` con `Box3`; se deja igual.
6. En `update`, el bloque «Si un extremo se hunde…» empieza así:

```js
    // El combate puede pedir que la lanza resbale hacia el regatón (para no atravesar al
    // rival) y, si un extremo se hunde en la peana o en el tablero, resbala hacia arriba.
    const gripStep = GRIP_SPEED * dt;
    grip += Math.max(-gripStep, Math.min(gripStep, gripTarget - grip));
    spear.position.copy(spearGripAt);
    if (grip > 0) {
      axis.set(0, 1, 0).applyQuaternion(spear.quaternion);
      spear.position.addScaledVector(axis, -grip / spear.parent.getWorldScale(boneScale).x);
    }
    spear.updateWorldMatrix(true, false);
```

(sustituye a `spear.position.copy(spearGripAt);` y `spear.updateWorldMatrix(true, false);`).

7. En el objeto devuelto, tras `fidget,`:

```js
    // Para el combate.
    setSpearPose(name) {
      spearOverride = name ?? null;
      applySpearPose();
    },
    setGripSlide(amount) {
      gripTarget = Math.max(0, amount);
    },
    hasClip(action, key) {
      return Boolean(variants[action]?.some((variant) => variant.key === key));
    },
    spearEnds,
    get attacks() {
      return kit.moves.attack ?? [];
    },
    get strikes() {
      return kit.strikes ?? {};
    },
```

- [ ] **Paso 6: Medir los golpes**

`src/combat/strikes.js`:

```js
import * as THREE from 'three';

// Mide, una vez por tipo de pieza y con una pieza de prueba fuera de la escena, cada versión
// de ataque. Guarda cuándo y hasta dónde llegan por delante la punta de la lanza (`spear`) y
// la mano o el pie que más avanzan (`body`). Son distancias horizontales desde el centro de la
// figura, en la dirección en la que mira, en casillas.

const FPS = 60;
const LIMBS = ['L_Hand', 'R_Hand', 'L_ToeBase', 'R_ToeBase'];

export function measureStrikes(kit, spawnPiece) {
  const piece = spawnPiece(kit);
  piece.placeAt({ x: 0, z: 0 });
  piece.figure.position.y = 0;
  piece.face(0); // mira hacia +Z
  const limbs = LIMBS.map((name) => piece.object.getObjectByName(name)).filter(Boolean);
  const point = new THREE.Vector3();
  const strikes = {};
  for (const attack of kit.moves.attack ?? []) {
    piece.play('idle', { fade: 0 });
    for (let i = 0; i < 20; i++) piece.update(1 / FPS);
    const action = piece.play('attack', { loop: false, fade: 0, clip: attack.key });
    if (!action) continue;
    const duration = action.getClip().duration;
    let spear = null;
    let body = null;
    for (let frame = 0; frame < Math.ceil(duration * FPS); frame++) {
      piece.update(1 / FPS);
      piece.object.updateMatrixWorld(true);
      const t = action.time;
      if (piece.props.spear && piece.spearEnds) {
        const reach = piece.props.spear.localToWorld(point.set(0, piece.spearEnds.top, 0)).z;
        if (!spear || reach > spear.reach) spear = { t, reach };
      }
      for (const limb of limbs) {
        const reach = limb.getWorldPosition(point).z;
        if (!body || reach > body.reach) body = { t, reach, bone: limb.name };
      }
    }
    strikes[attack.key] = { duration, spear, body };
  }
  return strikes;
}
```

En `src/main.js`: `import { measureStrikes } from './combat/strikes.js';` y, en `loadPieces`, tras cargar los kits:

```js
      for (const kit of kits) kit.strikes = measureStrikes(kit, spawnPiece);
```

- [ ] **Paso 7: Comprobación**

Run: `npm test` → Expected: `ℹ fail 0`.

En la vista previa:

```js
for (let i = 0; i < 80 && !(window.bchess && window.bchess.pawns.length === 16); i++) await new Promise((r) => setTimeout(r, 500));
const s = window.bchess.pawns[0].piece.strikes;
JSON.stringify(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { lanza: v.spear && +v.spear.reach.toFixed(2), t: v.spear && +v.spear.t.toFixed(2), cuerpo: +v.body.reach.toFixed(2), hueso: v.body.bone }])));
```

Expected (±0,05):
- `box_03`: lanza 2,18 en t≈1,1, cuerpo 0,68 (`L_Hand`);
- `box_01`: lanza 2,17, cuerpo 0,80;
- `front_kick_02`: cuerpo 0,78 (`*_ToeBase`);
- `front_kick_01`: cuerpo ≈0,37.

Sin errores en la consola.

- [ ] **Paso 8: Commit**

```bash
git add src/pieces/clips.js tests/clips.test.js src/combat/plan.js tests/combat-plan.test.js src/combat/strikes.js src/pieces/piece.js src/main.js
git commit -m "Plan del combate y medidas de cada golpe al cargar las piezas" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 4: Efectos de cómic y cámara de cine

**Files:**
- Create: `src/fx/impact.js`, `src/scene/cinema.js`
- Modify: `src/ui/hud.js`, `src/ui/style.css`, `src/main.js`

**Interfaces:**
- Consumes: `clock.tween` (tarea 1).
- Produces:
  - `createImpactFx(scene) → { burst(position, { size, sparks }), koStars(bone, { seconds, count }), update(dt) }`.
  - `createCinema({ camera, controls }) → { active, frame(clock, a, b) → Promise, shake(size), update(dt), restore(clock) → Promise, reset() }`.
  - `hud.flash()`.

- [ ] **Paso 1: Destellos, chispas y estrellitas**

`src/fx/impact.js`:

```js
import * as THREE from 'three';

// Efectos de dibujos animados del combate: destello con chispas en cada impacto y estrellitas
// de K.O. girando sobre la cabeza del vencido. Texturas dibujadas en canvas, sin ficheros.

const GRAVITY = 5;

function canvasTexture(draw, size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Estrella de cómic con puntas largas y cortas, blanca en el centro.
function drawBurst(g, size) {
  const c = size / 2;
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? c * 0.98 : c * (i % 4 === 1 ? 0.3 : 0.45);
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath();
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, '#fff3a6');
  gradient.addColorStop(1, '#ffb21e');
  g.fillStyle = gradient;
  g.fill();
}

function drawSpark(g, size) {
  const c = size / 2;
  const gradient = g.createRadialGradient(c, c, 0, c, c, c);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,214,90,0.9)');
  gradient.addColorStop(1, 'rgba(255,140,20,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
}

// Estrellita de K.O.: cinco puntas amarillas con borde marrón.
function drawKoStar(g, size) {
  const c = size / 2;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? c * 0.9 : c * 0.4;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  g.closePath();
  g.fillStyle = '#ffd93b';
  g.fill();
  g.lineWidth = size * 0.06;
  g.strokeStyle = '#7a4a00';
  g.stroke();
}

export function createImpactFx(scene) {
  const burstMap = canvasTexture(drawBurst);
  const sparkMap = canvasTexture(drawSpark, 64);
  const koMap = canvasTexture(drawKoStar);
  const live = []; // { object, life, age, step(k, dt, age) }

  function sprite(map, additive) {
    const object = new THREE.Sprite(new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    object.renderOrder = 10;
    scene.add(object);
    return object;
  }

  function add(object, life, step) {
    live.push({ object, life, age: 0, step });
  }

  // Destello de impacto en `position`, con `size` en casillas y `sparks` chispas.
  function burst(position, { size = 0.55, sparks = 14 } = {}) {
    const star = sprite(burstMap, true);
    star.position.copy(position);
    star.material.rotation = Math.random() * Math.PI;
    add(star, 0.28, (k) => {
      star.scale.setScalar(size * (0.35 + 0.65 * Math.sin((Math.min(1, k * 1.6) * Math.PI) / 2)));
      star.material.opacity = 1 - k * k;
    });
    for (let i = 0; i < sparks; i++) {
      const spark = sprite(sparkMap, true);
      spark.position.copy(position);
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 2.2;
      const velocity = new THREE.Vector3(Math.cos(angle) * speed, 0.8 + Math.random() * 1.6, Math.sin(angle) * speed);
      const scale = 0.05 + Math.random() * 0.06;
      add(spark, 0.35 + Math.random() * 0.25, (k, dt) => {
        velocity.y -= GRAVITY * dt;
        spark.position.addScaledVector(velocity, dt);
        spark.scale.setScalar(scale * (1 - k));
        spark.material.opacity = 1 - k;
      });
    }
  }

  // Estrellitas girando sobre `bone` (normalmente la cabeza) durante `seconds`.
  function koStars(bone, { seconds = 1.2, count = 3 } = {}) {
    const center = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const star = sprite(koMap, false);
      const phase = (i / count) * Math.PI * 2;
      add(star, seconds, (k, dt, age) => {
        bone.getWorldPosition(center);
        const a = phase + age * 5;
        star.position.set(center.x + Math.cos(a) * 0.22, center.y + 0.22 + Math.sin(age * 9 + phase) * 0.03, center.z + Math.sin(a) * 0.22);
        star.scale.setScalar(0.11 * Math.min(1, age * 6) * (k > 0.8 ? (1 - k) * 5 : 1));
        star.material.rotation = age * 4 + phase;
      });
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const item = live[i];
      item.age += dt;
      const k = Math.min(1, item.age / item.life);
      item.step(k, dt, item.age);
      if (k >= 1) {
        scene.remove(item.object);
        item.object.material.dispose();
        live.splice(i, 1);
      }
    }
  }

  return { burst, koStars, update };
}
```

- [ ] **Paso 2: Cámara de cine**

`src/scene/cinema.js`:

```js
import * as THREE from 'three';

// Cámara de cine del combate. Se pone de lado para encuadrar a los dos luchadores, tiembla con
// los golpes y al terminar vuelve a donde la tenía el usuario. Mientras actúa, los controles
// de órbita no responden.

const MOVE_SECONDS = 0.8;
const SHAKE_SECONDS = 0.3;
const MIN_DISTANCE = 3.4;
const smooth = (t) => t * t * (3 - 2 * t);

export function createCinema({ camera, controls }) {
  let saved = null;
  let shakeLeft = 0;
  let shakeSize = 0;
  const offset = new THREE.Vector3();

  function glide(clock, toPosition, toTarget) {
    const fromPosition = camera.position.clone().sub(offset);
    const fromTarget = controls.target.clone();
    return clock.tween(MOVE_SECONDS, (t) => {
      const k = smooth(t);
      camera.position.lerpVectors(fromPosition, toPosition, k).add(offset);
      controls.target.lerpVectors(fromTarget, toTarget, k);
      camera.lookAt(controls.target);
    });
  }

  return {
    get active() {
      return saved !== null;
    },

    // Encuadra a los luchadores en `a` y `b` ({x, z}) desde el lado más cercano a la cámara.
    frame(clock, a, b) {
      if (!saved) saved = { position: camera.position.clone(), target: controls.target.clone() };
      controls.enabled = false;
      const mid = new THREE.Vector3((a.x + b.x) / 2, 0.75, (a.z + b.z) / 2);
      const across = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize();
      if (across.dot(new THREE.Vector3().subVectors(saved.position, mid).setY(0)) < 0) across.negate();
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      const halfWidth = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * Math.min(camera.aspect, 1.6);
      const distance = Math.max(MIN_DISTANCE, (gap + 1.4) / (2 * halfWidth));
      const position = mid.clone().addScaledVector(across, distance).add(new THREE.Vector3(0, distance * 0.32, 0));
      return glide(clock, position, mid);
    },

    shake(size) {
      shakeLeft = SHAKE_SECONDS;
      shakeSize = size;
    },

    // Cada fotograma, en tiempo real, después de mover la cámara.
    update(dt) {
      camera.position.sub(offset);
      if (shakeLeft > 0) {
        shakeLeft = Math.max(0, shakeLeft - dt);
        const k = shakeSize * (shakeLeft / SHAKE_SECONDS);
        offset.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
      } else {
        offset.set(0, 0, 0);
      }
      camera.position.add(offset);
    },

    // Vuelve a la cámara del usuario y le devuelve los controles.
    async restore(clock) {
      if (!saved) return;
      await glide(clock, saved.position, saved.target);
      camera.position.sub(offset);
      offset.set(0, 0, 0);
      shakeLeft = 0;
      saved = null;
      controls.enabled = true;
    },

    // Vuelta inmediata, para errores.
    reset() {
      if (!saved) return;
      camera.position.copy(saved.position);
      controls.target.copy(saved.target);
      camera.lookAt(controls.target);
      offset.set(0, 0, 0);
      shakeLeft = 0;
      saved = null;
      controls.enabled = true;
    },
  };
}
```

- [ ] **Paso 3: Destello blanco**

En `src/ui/hud.js`, tras `const buttons = …`:

```js
  const flashEl = document.createElement('div');
  flashEl.id = 'destello';
  document.body.append(flashEl);
```

y antes del `return`:

```js
  // Destello blanco a pantalla completa (golpe final del combate).
  function flash() {
    flashEl.classList.remove('apagandose');
    flashEl.classList.add('encendido');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      flashEl.classList.remove('encendido');
      flashEl.classList.add('apagandose');
    }));
  }
```

El `return` añade `flash`. En `src/ui/style.css`, antes de `@media`:

```css
#destello { position: fixed; inset: 0; background: #fff; opacity: 0; pointer-events: none; }
#destello.encendido { opacity: 0.85; }
#destello.apagandose { transition: opacity 0.35s ease-out; }
```

- [ ] **Paso 4: Efectos y cámara en el bucle**

En `src/main.js`:
- Imports `createImpactFx` (`./fx/impact.js`) y `createCinema` (`./scene/cinema.js`).
- Tras `const clock = createClock();`: `const fx = createImpactFx(stage.scene);` y `const cinema = createCinema(stage);`.
- En el bucle, tras `dust.update(step);`: `fx.update(step);`.
- `stage.controls.update();` pasa a `if (!cinema.active) stage.controls.update();`, seguido de `cinema.update(dt);`.
- `window.bchess` añade `fx`, `cinema` y `hud`.

- [ ] **Paso 5: Comprobación visual**

En la vista previa:

```js
for (let i = 0; i < 80 && !(window.bchess && window.bchess.pawns.length === 16); i++) await new Promise((r) => setTimeout(r, 500));
const b = window.bchess; b.gesture.at = Infinity;
const w = b.pawns.find((p) => p.mover.square === 'e2'); const k = b.pawns.find((p) => p.mover.square === 'e7');
await b.cinema.frame(b.clock, { x: 0.5, z: 2.5 }, { x: 0.5, z: -2.5 });
const antes = b.cinema.active;
b.fx.burst(w.piece.object.getObjectByName('Spine02').getWorldPosition(w.piece.figure.position.clone()), { size: 1, sparks: 26 });
b.fx.koStars(k.piece.object.getObjectByName('Head'));
b.hud.flash(); b.cinema.shake(0.18);
await b.clock.wait(0.1);
'listo ' + antes;
```

Screenshot → Expected: destello y chispas en el peón e2, estrellitas sobre e7 y cámara de lado. Después:

```js
const b = window.bchess; await b.cinema.restore(b.clock); JSON.stringify({ activa: b.cinema.active, controles: b.stage.controls.enabled });
```

Expected: `{"activa":false,"controles":true}`. Sin errores en la consola.

- [ ] **Paso 6: Commit**

```bash
git add src/fx/impact.js src/scene/cinema.js src/ui/hud.js src/ui/style.css src/main.js
git commit -m "Efectos de cómic y cámara de cine para el combate" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 5: Director del combate

**Files:**
- Create: `src/combat/duel.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - `canFight(attacker, defender, style) → bool`.
  - `runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, random }) → Promise`: al resolverse, el defensor es invisible y el atacante está en la casilla del defensor.

- [ ] **Paso 1: El director**

`src/combat/duel.js`:

```js
import * as THREE from 'three';
import { fightSpots, gripSlideForReach, planExchanges, usableStrikes } from './plan.js';

// Director del combate entre dos peones (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-combate-peones-design.md). Gana siempre el atacante.

const HIT_STOP = 0.08; // segundos reales congelados en cada impacto
const SLOW_MOTION = 0.3;
const SLOW_BEFORE = 0.35; // segundos de juego antes del golpe final en cámara lenta
const SLOW_AFTER = 0.4;
const KNOCKBACK = 0.2; // lo que sale despedido el vencido
const KO_SECONDS = 1.2;

function strikesFor(pawn, style) {
  return usableStrikes(pawn.piece.attacks, pawn.piece.strikes, style);
}

// Claves de golpe que pueden usar los dos luchadores en este estilo.
function sharedStrikes(attacker, defender, style) {
  const theirs = strikesFor(defender, style);
  return strikesFor(attacker, style).filter((key) => theirs.includes(key));
}

export function canFight(attacker, defender, style) {
  const a = attacker.piece;
  const d = defender.piece;
  return a.has('attack') && a.has('hit') && d.has('attack') && d.has('hit')
    && (d.has('defeat') || d.has('fall'))
    && sharedStrikes(attacker, defender, style).length > 0;
}

// Punto del impacto: la punta de la lanza en el duelo; la mano o el pie en el cuerpo a cuerpo.
function impactPoint(hitter, measure, style) {
  const piece = hitter.piece;
  if (style === 'duel' && piece.props.spear && piece.spearEnds) {
    return piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0));
  }
  return piece.object.getObjectByName(measure.body.bone).getWorldPosition(new THREE.Vector3());
}

async function strike({ hitter, receiver, beat, style, spots, clock, fx, cinema, hud }) {
  const h = hitter.piece;
  const r = receiver.piece;
  const measure = h.strikes[beat.key];
  const impact = style === 'duel' ? measure.spear : measure.body;
  if (style === 'duel') h.setGripSlide(gripSlideForReach({ reach: measure.spear.reach, distance: spots.distance }));
  const attack = h.playOnce('attack', { clip: beat.key, fade: 0.15 });

  if (!beat.final) {
    await clock.wait(impact.t);
    fx.burst(impactPoint(hitter, measure, style), { size: 0.55, sparks: 12 });
    cinema.shake(0.07);
    const reaction = r.playOnce('hit', { fade: 0.08 });
    await clock.hold(HIT_STOP);
    await Promise.all([attack, reaction]);
    h.setGripSlide(0);
    h.play('idle', { fade: 0.25 });
    r.play('idle', { fade: 0.25 });
    await clock.wait(0.25);
    return;
  }

  // Golpe final: cámara lenta, destello, empujón y derrota.
  await clock.wait(Math.max(0, impact.t - SLOW_BEFORE));
  clock.timeScale = SLOW_MOTION;
  await clock.wait(Math.min(SLOW_BEFORE, impact.t));
  fx.burst(impactPoint(hitter, measure, style), { size: 1, sparks: 26 });
  hud.flash();
  cinema.shake(0.18);
  const fall = r.playOnce(r.has('defeat') ? 'defeat' : 'fall', { fade: 0.1 });
  const start = r.figure.position.clone();
  const ux = (spots.defender.x - spots.attacker.x) / spots.distance;
  const uz = (spots.defender.z - spots.attacker.z) / spots.distance;
  const knock = clock.tween(0.3, (t) => {
    const k = 1 - (1 - t) ** 2;
    r.figure.position.set(start.x + ux * KNOCKBACK * k, start.y, start.z + uz * KNOCKBACK * k);
  });
  await clock.hold(HIT_STOP);
  await clock.wait(SLOW_AFTER);
  clock.timeScale = 1;
  await Promise.all([attack, fall, knock]);
  h.setGripSlide(0);
  h.play('idle', { fade: 0.3 });
}

export async function runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, random = Math.random }) {
  const a = attacker.piece;
  const d = defender.piece;
  const target = defender.mover.square;
  const home = board.squareToWorld(attacker.mover.square);
  const spots = fightSpots(home, board.squareToWorld(target), style);
  const beats = planExchanges(sharedStrikes(attacker, defender, style), random);

  // 1. Preparación: la cámara encuadra, se encaran, provocación o susto, y bajan de la peana.
  const framing = cinema.frame(clock, spots.attacker, spots.defender);
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
    defender.mover.turnTo(spots.defenderFacing, 0.3),
  ]);
  const opening = [framing];
  if (a.has('taunt')) opening.push(a.playOnce('taunt'));
  if (random() < 0.5 && d.hasClip('fidget', 'frightened')) opening.push(d.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(opening);
  await Promise.all([
    attacker.mover.descend(style === 'duel' ? spots.attacker : home),
    defender.mover.descend(spots.defender),
  ]);
  if (style === 'melee') {
    a.setSpearPose('upright');
    d.setSpearPose('upright');
    await attacker.mover.walkTo(spots.attacker);
  }
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.25),
    defender.mover.turnTo(spots.defenderFacing, 0.25),
  ]);

  // 2 y 3. Intercambios y golpe final.
  for (const beat of beats) {
    const [hitter, receiver] = beat.by === 'attacker' ? [attacker, defender] : [defender, attacker];
    await strike({ hitter, receiver, beat, style, spots, clock, fx, cinema, hud });
  }

  // 4. K.O.: estrellitas y el vencido se esfuma.
  fx.koStars(d.object.getObjectByName('Head') ?? d.figure, { seconds: KO_SECONDS });
  await clock.wait(KO_SECONDS);
  await defender.mover.vanish();

  // 5. Victoria: la cámara vuelve, el ganador ocupa la casilla y lo celebra.
  a.setSpearPose(null);
  a.setGripSlide(0);
  await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
  if (a.has('victory')) {
    await a.playOnce('victory');
    a.play('idle', { fade: 0.3 });
  } else {
    await attacker.mover.hop(2);
  }
}
```

- [ ] **Paso 2: El combate en la captura**

En `src/main.js`, imports `import { pickStyle } from './combat/plan.js';` y `import { canFight, runCombat } from './combat/duel.js';`. `capture` completo:

```js
  // Un peón se come a otro con un combate (duelo de lanzas o cuerpo a cuerpo, sin repetir el
  // estilo anterior). Si no hay animaciones para pelear, el vencido se esfuma y el ganador
  // anda hasta su casilla. Pase lo que pase, el tablero queda coherente.
  async function capture(attacker, defender) {
    state.fighting = true;
    highlights.clear();
    refreshButtons();
    const target = defender.mover.square;
    const style = pickStyle(state.lastStyle);
    try {
      if (canFight(attacker, defender, style)) {
        state.lastStyle = style;
        await runCombat({ attacker, defender, board, clock, fx, cinema, hud, style });
      } else {
        await defender.mover.vanish();
        removePawn(defender);
        await attacker.mover.goTo(target);
      }
    } catch (err) {
      console.error('[BChess] El combate falló:', err);
      clock.timeScale = 1;
      cinema.reset();
      attacker.piece.setSpearPose(null);
      attacker.piece.setGripSlide(0);
      attacker.mover.placeOn(target);
    } finally {
      if (pawns.includes(defender)) removePawn(defender);
      state.fighting = false;
      select(attacker);
    }
  }
```

- [ ] **Paso 3: Verificación por código de los dos estilos**

En la vista previa, para cada estilo (`'duel'` y `'melee'`), recargar y ejecutar con `ESTILO` sustituido:

```js
for (let i = 0; i < 80 && !(window.bchess && window.bchess.pawns.length === 16); i++) await new Promise((r) => setTimeout(r, 500));
const THREE = await import('/vendor/three/build/three.module.js');
const b = window.bchess; b.gesture.at = Infinity;
b.state.lastStyle = ESTILO === 'duel' ? 'melee' : 'duel';
const w = b.pawns.find((p) => p.mover.square === 'e2'); const k = b.pawns.find((p) => p.mover.square === 'd7');
w.mover.placeOn('e4'); k.mover.placeOn('d5');
const vecinos = b.pawns.filter((p) => p !== w && p !== k);
const camara = b.stage.camera.position.clone();
const center = b.board.squareToWorld('d5');
const box = new THREE.Box3(); const v = new THREE.Vector3();
const log = { minVecino: 9, maxDefensorFuera: 0, minSueloLanza: 9, minPuntaPecho: 9, reacciones: [] };
const orig = { w: w.piece.playOnce, k: k.piece.playOnce };
let inicioAtaque = {};
for (const [name, pawn] of [['w', w], ['k', k]]) {
  pawn.piece.playOnce = (action, opts = {}) => {
    if (action === 'attack') inicioAtaque[name] = { t: b.clock.now, key: opts.clip };
    if (action === 'hit' || action === 'fall' || action === 'defeat') {
      const otro = name === 'w' ? 'k' : 'w';
      const golpeador = name === 'w' ? k : w;
      const med = golpeador.piece.strikes[inicioAtaque[otro].key];
      const esperado = ESTILO === 'duel' ? med.spear.t : med.body.t;
      log.reacciones.push(+(b.clock.now - inicioAtaque[otro].t - esperado).toFixed(3));
    }
    return orig[name].call(pawn.piece, action, opts);
  };
}
let running = true;
const watch = (async () => {
  while (running) {
    for (const f of [w, k]) {
      f.piece.object.updateMatrixWorld(true);
      const pts = [];
      f.piece.object.traverse((o) => { if (o.isBone) pts.push(o.getWorldPosition(new THREE.Vector3())); });
      if (f.piece.props.spear && f.piece.props.spear.visible !== false && f.piece.object.visible) {
        box.setFromObject(f.piece.props.spear); log.minSueloLanza = Math.min(log.minSueloLanza, box.min.y);
        pts.push(f.piece.props.spear.localToWorld(new THREE.Vector3(0, f.piece.spearEnds.top, 0)));
        pts.push(f.piece.props.spear.localToWorld(new THREE.Vector3(0, f.piece.spearEnds.bottom, 0)));
      }
      for (const n of vecinos) {
        const c = n.piece.figure.position;
        for (const p of pts) log.minVecino = Math.min(log.minVecino, Math.hypot(p.x - c.x, p.z - c.z) - (p.y < 0.35 ? 0.47 : 0.3));
      }
    }
    if (k.piece.object.visible) {
      const hip = k.piece.object.getObjectByName('Hip').getWorldPosition(v);
      log.maxDefensorFuera = Math.max(log.maxDefensorFuera, Math.abs(hip.x - center.x), Math.abs(hip.z - center.z));
      if (ESTILO === 'duel' && w.piece.props.spear) {
        const tip = w.piece.props.spear.localToWorld(new THREE.Vector3(0, w.piece.spearEnds.top, 0));
        const kc = k.piece.figure.position;
        if (tip.y > 0.3 && tip.y < 1.6) log.minPuntaPecho = Math.min(log.minPuntaPecho, Math.hypot(tip.x - kc.x, tip.z - kc.z));
      }
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
})();
await b.tap({ owner: w });
await b.tap({ owner: k });
running = false; await watch;
Object.assign(log, { estilo: b.state.lastStyle, peones: b.pawns.length, ganador: w.mover.square, luchando: b.state.fighting, camaraVuelve: +b.stage.camera.position.distanceTo(camara).toFixed(4), controles: b.stage.controls.enabled });
for (const key of ['minVecino', 'maxDefensorFuera', 'minSueloLanza', 'minPuntaPecho']) log[key] = +log[key].toFixed(3);
JSON.stringify(log);
```

Expected en los dos estilos:
- `estilo` igual a `ESTILO`, `peones: 15`, `ganador: "d5"`, `luchando: false`, `camaraVuelve: 0`, `controles: true`;
- `minVecino > 0`, `maxDefensorFuera ≤ 0.5`, `minSueloLanza ≥ -0.01`;
- cada valor de `reacciones` entre −0,02 y 0,04 (un fotograma);
- en el duelo, `minPuntaPecho ≥ 0.1`.

Si la llamada supera el límite de 45 s, se lanza la captura sin `await` (`b.tap(...)`), se espera con varias llamadas cortas hasta `b.state.fighting === false` y se lee `log` al final.

Si algo falla, ajustar la constante responsable y repetir:
- `DUEL_RETREAT` o `MELEE_DISTANCE` en `plan.js`, si toca a los vecinos;
- `KNOCKBACK` en `duel.js`, si el vencido sale de su casilla;
- `TORSO`, si la punta atraviesa.

Screenshots en tres momentos: preparación, golpe final y victoria.

- [ ] **Paso 4: Commit**

```bash
git add src/combat/duel.js src/main.js
git commit -m "Combate entre peones: duelo de lanzas y cuerpo a cuerpo con cámara de cine" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 6: Provocación, celebración y derrota

**Files:**
- Create: `assets/models/pawn-combat.glb`, `assets/models/black-pawn-combat.glb`
- Modify: `assets/models/manifest.json`

**Interfaces:**
- Consumes: `tools/optimize-anims.sh`, `tools/anim-gallery.html`, el director (usa `taunt`, `victory` y `defeat` si existen).
- Produces: acciones `taunt`, `victory` y `defeat` en los dos peones.

- [ ] **Paso 1: Exportar las candidatas del peón blanco**

En Tripo, esqueleto del peón blanco (`/es/workspace/rigging/530cc55a-5078-402a-98a0-2979cbd5eb8b`), con las 12 candidatas ya aplicadas:
1. «Exportar» → «Número de animaciones» → marcar solo `enojado_01`, `enojado_02`, `enojado_03`, `cruzar_brazos`, `animar`, `aplaudir`, `reir_01`, `reir_02`, `derrota`, `derrota_02`, `golpe_al_costado` y `golpe_al_cuerpo_02`.
2. Comprobar `12/30` y «Exportar esqueleto» activado.
3. Exportar con el vigilante de descargas en marcha.
4. Copiar a `raw/tripo/pawn-combate-candidatas.glb`.

- [ ] **Paso 2: Revisarlas en la galería**

1. Abrir `http://localhost:8741/tools/anim-gallery.html` con `../raw/tripo/pawn-combate-candidatas.glb` y ver las hojas de cada clip, de frente y de perfil.
2. Medir el desplazamiento de cadera de cada clip, igual que en el día 1: pista `Hip.position` sin su deriva, en casillas con la altura de 1,35.
3. Criterios:
   - **Provocación:** clara y cómica, de 1,5 a 4 s, cadera < 0,3.
   - **Celebración:** exagerada, cadera < 0,3.
   - **Derrota:** caída espectacular. El `travel` hace que la cadera no pase de 0,28, porque con el empujón de 0,2 debe quedar dentro de 0,5.
4. Elegir una o dos por acción y apuntar sus claves y `travel`.

- [ ] **Paso 3: Las mismas en el peón negro**

1. En el esqueleto negro (`/es/workspace/rigging/a0e3096e-a3a3-4f46-9c1d-34a0dd70dc9e`), aplicar solo las elegidas con el bucle de la página.
2. Exportar marcando solo esas y copiar a `raw/tripo/black-pawn-combate.glb`.
3. Del blanco, volver a exportar solo las elegidas a `raw/tripo/pawn-combate.glb`.

- [ ] **Paso 4: Optimizar y manifiesto**

```bash
bash tools/optimize-anims.sh raw/tripo/pawn-combate.glb pawn-combat
bash tools/optimize-anims.sh raw/tripo/black-pawn-combate.glb black-pawn-combat
```

En el manifiesto:
- `white-pawn.animationFiles` pasa a `["pawn-fidgets.glb", "pawn-combat.glb"]` y `black-pawn.animationFiles` a `["black-pawn-combat.glb"]`.
- En los dos `moves` se añaden las elegidas en el paso 2. Por ejemplo, si se eligen `angry_02`, `cheer`, `laugh_01` y `defeat_02`:

```json
        "taunt": [{ "clip": "angry_02" }],
        "victory": [{ "clip": "cheer" }, { "clip": "laugh_01" }],
        "defeat": [{ "clip": "defeat_02", "travel": 0.5 }]
```

(el `travel` real es el calculado en el paso 2).

- [ ] **Paso 5: Comprobación**

Repetir la verificación de la tarea 5 en los dos estilos. Expected: lo mismo y, además, la consola sin avisos de clips que faltan.

- [ ] **Paso 6: Commit**

```bash
git add assets/models/pawn-combat.glb assets/models/black-pawn-combat.glb assets/models/manifest.json
git commit -m "Provocación, celebración y derrota en los combates" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 7: Publicar

**Files:**
- Modify: `docs/superpowers/plans/2026-09-14-bchess-combate-peones.md` (sección «Cambios durante la ejecución»), `README.md`

- [ ] **Paso 1: README**

En «Cómo se juega (prueba)», añadir:

```markdown
- Si el peón elegido tiene un enemigo en diagonal hacia delante, aparece un aro rojo bajo el
  enemigo: tócalo y pelearán. Unas veces es un duelo de lanzas y otras, cuerpo a cuerpo.
```

- [ ] **Paso 2: Unir a `main` y publicar**

```bash
npm test
git checkout main
git merge --ff-only combate-peones
git push
```

Expected: `ℹ fail 0` y el push de `main`.

- [ ] **Paso 3: Comprobar la web publicada**

1. Esperar a que `gh api repos/mr-d0nuT/bchess/pages/builds/latest --jq '.status + " " + .commit'` dé `built` con el commit de `main`.
2. En la vista previa, `https://mr-d0nut.github.io/bchess/?v=<commit>`.
3. Ejecutar la verificación de la tarea 5 con un estilo.

Expected: los mismos resultados y ningún error en la consola.
