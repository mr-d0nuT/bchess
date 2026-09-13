# BChess — Parte 1: prueba del peón · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar en `https://mr-d0nut.github.io/bchess/` un tablero 3D realista con el peón
blanco sacado de las imágenes del usuario. El peón anda a la casilla que se toca, y con
botones ataca, recibe un golpe y cae.

**Architecture:**
- Web estática sin compilación: módulos ES con import map y Three.js r186 copiado en
  `vendor/`.
- La lógica pura (casillas, paseo, calidad, clips y huesos) va en módulos que no importan
  Three.js y se prueba con `node --test`.
- La escena, la figura, los efectos y la interfaz se comprueban en el panel de vista previa.
- Los modelos salen de Gemini (imagen de pie) y de Tripo Studio (3D, esqueleto y
  animaciones), y se aligeran con gltf-transform.

**Tech Stack:** Three.js 0.186.0 (MIT) con GLTFLoader + MeshoptDecoder, OrbitControls y
HDRLoader · Node 24 (`node --test`) · @gltf-transform/cli 4.5.0 · Python 3 (servidor de
desarrollo) · GitHub Pages.

**Diseño:** `docs/superpowers/specs/2026-09-13-bchess-prueba-peon-design.md`

## Global Constraints

- Repo `mr-d0nuT/bchess`, público. GitHub Pages desde `main`, carpeta raíz. Sin compilación.
- Three.js **0.186.0** copiado en `vendor/three/`: solo el núcleo y los addons usados.
- Interfaz en castellano. Botones: «Atacar», «Golpe», «Caer».
- Créditos, texto exacto: «Modelos: Tripo AI (CC BY 4.0) · Homenaje a Battle Chess (Interplay, 1988)».
- Error de carga, texto exacto: «No se pudo cargar el peón», con el botón «Reintentar».
- Nivel `movil`: texturas de 1024 px, mapa de sombras de 1024 y devicePixelRatio máximo 1,5.
- Nivel `ordenador`: texturas de 2048 px, mapa de sombras de 2048 y devicePixelRatio máximo 2.
- Peso del peón: como mucho 6 MB (`ordenador`) y 3 MB (`movil`).
- La nube de polvo dura ≈ 0,4 s. Tras «Caer», el peón reaparece de pie a los 1,5 s de acabar
  la caída.
- Unidad de escena: 1 = lado de una casilla.
- Ejes: tablero centrado en el origen, blancas en +Z, columnas a→h en +X y cara superior
  de las casillas en y = 0.
- `raw/` no se sube al repo: está en `.gitignore`.
- Pruebas unitarias con `node --test`, sin dependencias.
- Fluidez: al menos 30 fps en móvil y 60 fps en ordenador.

---

## Estructura de ficheros

| Fichero | Responsabilidad | Tarea |
|---|---|---|
| `package.json` | `type: module` y el script `npm test`. Sin dependencias. | 1 |
| `tools/dev-server.py` | Servidor estático de desarrollo con `Cache-Control: no-store`. | 1 |
| `src/scene/squares.js` | Puro. Casilla ↔ posición en el tablero. | 1 |
| `src/moves/walk.js` | Puro. Orientación, distancia, duración, giro y velocidad del paseo. | 1 |
| `src/quality.js` | Puro. Niveles `movil` y `ordenador`, y cómo se elige uno. | 1 |
| `vendor/three/` | Three.js r186: núcleo y addons usados. | 2 |
| `assets/env/`, `assets/textures/` | HDRI y chapas de madera de Poly Haven (CC0). | 2 |
| `index.html` | Página, import map, lienzo e interfaz. | 2, 6 |
| `src/ui/style.css` | Estilos de la interfaz. | 2 |
| `src/ui/hud.js` | Contador de fluidez, botones y avisos. | 2 |
| `src/scene/stage.js` | Renderizador, cámara, controles de órbita y ajuste al tamaño de la ventana. | 2 |
| `src/scene/lighting.js` | HDRI y luz principal con sombras. | 2 |
| `src/scene/board.js` | Tablero con marco y conversión casilla ↔ `Vector3`. | 2 |
| `src/main.js` | Arranque y bucle de dibujo. | 2, 4, 5, 6 |
| `assets/models/` | GLB optimizados y `manifest.json`. | 3 |
| `tools/strip-anim.mjs` | Deja un GLB solo con nodos y animaciones (solo si Tripo exporta un fichero por animación). | 3 |
| `src/pieces/clips.js` | Puro. Asigna clips a acciones y quita el avance del paseo. | 4 |
| `src/pieces/bones.js` | Puro. Busca el hueso de cada mano. | 4 |
| `src/pieces/spear.js` | Lanza hecha en código. | 4 |
| `src/pieces/piece.js` | Carga el peón, sus animaciones, la lanza, el escudo y la peana. | 4 |
| `src/fx/dust.js` | Nube de polvo de dibujos animados. | 5 |
| `src/input.js` | Toque o clic → casilla. | 5 |
| `src/moves/sequence.js` | Coreografía de ir a una casilla y de los botones, con bloqueo. | 5 |
| `README.md`, `.nojekyll` | Presentación, créditos y licencias; publicación sin Jekyll. | 7 |

Respecto a la tabla del diseño se añaden `squares.js`, `clips.js` y `bones.js`, que separan la
lógica pura para poder probarla en Node. También se añaden `stage.js`, para que `main.js` no
crezca, y `sequence.js`, para que la coreografía no se mezcle con la carga del modelo.

Orden: 1 → 2 → 4 → 5 → 6 → 7. La Tarea 3 (modelos) va en paralelo con la 1 y la 2 y tiene
que estar acabada antes de la 4.

---

### Tarea 1: Base del proyecto y matemáticas puras

**Files:**
- Create: `package.json`, `tools/dev-server.py`
- Create: `src/scene/squares.js`, `src/moves/walk.js`, `src/quality.js`
- Test: `tests/squares.test.js`, `tests/walk.test.js`, `tests/quality.test.js`
- Modify: `/Users/mr_donut/.claude/launch.json` (añadir la configuración `bchess`)

**Interfaces:**
- Consumes: nada.
- Produces:
  - `squareToPosition(square: string) → { x: number, z: number }`. Lanza un `Error('Casilla no válida: …')` si la casilla no es válida.
  - `positionToSquare(x: number, z: number) → string | null`
  - `FACING_BLACK: number` (= `Math.PI`)
  - `planWalk(from: {x,z}, to: {x,z}, speed: number) → { distance, heading, duration }`
  - `pointAlong(from: {x,z}, to: {x,z}, t: number) → { x, z }`
  - `shortestTurn(fromAngle: number, toAngle: number) → number` en (-π, π]
  - `strideSpeed({ rootDistance, clipDuration, height }) → number`
  - `LEVELS.movil`, `LEVELS.ordenador`. Cada nivel es `{ name, textureSize, shadowMapSize, maxPixelRatio }`.
  - `pickQuality({ coarsePointer: boolean, screenWidth: number, screenHeight: number }) → nivel`
  - `qualityFromQuery(search: string) → nivel | null`

- [ ] **Paso 1: Crear `package.json`**

```json
{
  "name": "bchess",
  "private": true,
  "type": "module",
  "description": "BChess — homenaje 3D a Battle Chess (1988)",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Paso 2: Escribir las pruebas que fallan**

`tests/squares.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareToPosition, positionToSquare } from '../src/scene/squares.js';

test('e2 está en x=0.5, z=2.5', () => {
  assert.deepEqual(squareToPosition('e2'), { x: 0.5, z: 2.5 });
});

test('a1 y h8 son esquinas opuestas', () => {
  assert.deepEqual(squareToPosition('a1'), { x: -3.5, z: 3.5 });
  assert.deepEqual(squareToPosition('h8'), { x: 3.5, z: -3.5 });
});

test('ida y vuelta de las 64 casillas', () => {
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank++) {
      const square = file + rank;
      const { x, z } = squareToPosition(square);
      assert.equal(positionToSquare(x, z), square);
    }
  }
});

test('un punto dentro de la casilla da esa casilla', () => {
  assert.equal(positionToSquare(0.9, 2.1), 'e2');
});

test('fuera del tablero da null', () => {
  assert.equal(positionToSquare(4.2, 0), null);
  assert.equal(positionToSquare(0, -4.5), null);
});

test('casilla no válida lanza error', () => {
  assert.throws(() => squareToPosition('i9'), /Casilla no válida/);
});
```

`tests/walk.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWalk, pointAlong, shortestTurn, strideSpeed, FACING_BLACK } from '../src/moves/walk.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} no es ≈ ${b}`);

test('mirar a las negras es girar PI', () => {
  close(FACING_BLACK, Math.PI);
  close(planWalk({ x: 0.5, z: 2.5 }, { x: 0.5, z: 0.5 }, 1).heading, Math.PI);
});

test('andar hacia +X mira a PI/2', () => {
  close(planWalk({ x: 0, z: 0 }, { x: 2, z: 0 }, 1).heading, Math.PI / 2);
});

test('planWalk calcula distancia y duración', () => {
  const plan = planWalk({ x: 0.5, z: 2.5 }, { x: 3.5, z: -1.5 }, 2);
  close(plan.distance, 5);
  close(plan.duration, 2.5);
});

test('planWalk rechaza una velocidad no positiva', () => {
  assert.throws(() => planWalk({ x: 0, z: 0 }, { x: 1, z: 0 }, 0), /velocidad/);
});

test('pointAlong interpola y no se pasa del destino', () => {
  assert.deepEqual(pointAlong({ x: 0, z: 0 }, { x: 2, z: 4 }, 0.5), { x: 1, z: 2 });
  assert.deepEqual(pointAlong({ x: 0, z: 0 }, { x: 2, z: 4 }, 1.5), { x: 2, z: 4 });
});

test('shortestTurn gira por el lado corto', () => {
  close(shortestTurn(0.1, 2 * Math.PI - 0.1), -0.2);
  close(shortestTurn(-3, 3), 6 - 2 * Math.PI);
  close(shortestTurn(0, Math.PI / 2), Math.PI / 2);
});

test('strideSpeed usa el avance del clip y, si anda en el sitio, la altura', () => {
  close(strideSpeed({ rootDistance: 1.2, clipDuration: 1, height: 1.35 }), 1.2);
  close(strideSpeed({ rootDistance: 0, clipDuration: 1, height: 1.35 }), 0.945);
});
```

`tests/quality.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickQuality, qualityFromQuery, LEVELS } from '../src/quality.js';

test('los niveles tienen los valores del diseño', () => {
  assert.deepEqual(LEVELS.movil, { name: 'movil', textureSize: 1024, shadowMapSize: 1024, maxPixelRatio: 1.5 });
  assert.deepEqual(LEVELS.ordenador, { name: 'ordenador', textureSize: 2048, shadowMapSize: 2048, maxPixelRatio: 2 });
});

test('teléfono táctil → movil', () => {
  assert.equal(pickQuality({ coarsePointer: true, screenWidth: 390, screenHeight: 844 }).name, 'movil');
});

test('portátil con ratón → ordenador', () => {
  assert.equal(pickQuality({ coarsePointer: false, screenWidth: 1440, screenHeight: 900 }).name, 'ordenador');
});

test('tableta grande táctil → ordenador', () => {
  assert.equal(pickQuality({ coarsePointer: true, screenWidth: 1366, screenHeight: 1024 }).name, 'ordenador');
});

test('?calidad= fuerza el nivel y no acepta nombres raros', () => {
  assert.equal(qualityFromQuery('?calidad=movil').name, 'movil');
  assert.equal(qualityFromQuery('?calidad=ordenador').name, 'ordenador');
  assert.equal(qualityFromQuery('?calidad=toString'), null);
  assert.equal(qualityFromQuery('?x=1'), null);
});
```

- [ ] **Paso 3: Comprobar que fallan**

Run: `cd /Users/mr_donut/bchess && npm test`
Expected: FAIL. Las tres pruebas dan `ERR_MODULE_NOT_FOUND` porque los módulos aún no existen.

- [ ] **Paso 4: Escribir los módulos**

`src/scene/squares.js`:

```js
// Conversión entre casillas de ajedrez («e2») y posiciones en el tablero.
// Unidad: 1 = lado de una casilla. Blancas en +Z (cerca de la cámara), columnas a→h en +X.

const FILES = 'abcdefgh';

export function squareToPosition(square) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return { x: file - 3.5, z: 3.5 - rank };
}

export function positionToSquare(x, z) {
  const file = Math.floor(x + 4);
  const rank = Math.floor(4 - z);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return FILES[file] + (rank + 1);
}
```

`src/moves/walk.js`:

```js
// Paseo entre dos puntos del tablero: orientación, distancia y duración.
// Orientación como en Three.js: rotation.y = atan2(dx, dz) hace que un modelo glTF,
// que mira a +Z, mire hacia el destino.

export const FACING_BLACK = Math.PI; // -Z: el lado de las negras

export function planWalk(from, to, speed) {
  if (!(speed > 0)) throw new Error('La velocidad debe ser positiva');
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  return { distance, heading: Math.atan2(dx, dz), duration: distance / speed };
}

export function pointAlong(from, to, t) {
  const k = Math.min(1, Math.max(0, t));
  return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k };
}

// Diferencia de ángulo más corta, en (-PI, PI].
export function shortestTurn(fromAngle, toAngle) {
  let d = (toAngle - fromAngle) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

// Velocidad de paseo: si el clip avanza (root motion), lo que avanza por segundo;
// si anda en el sitio, 0,7 alturas por segundo (ritmo de paseo de una persona).
export function strideSpeed({ rootDistance, clipDuration, height }) {
  if (rootDistance > 0.05 * height && clipDuration > 0) return rootDistance / clipDuration;
  return 0.7 * height;
}
```

`src/quality.js`:

```js
// Nivel de calidad según el aparato. «movil» aligera texturas, sombras y resolución.

export const LEVELS = {
  movil: { name: 'movil', textureSize: 1024, shadowMapSize: 1024, maxPixelRatio: 1.5 },
  ordenador: { name: 'ordenador', textureSize: 2048, shadowMapSize: 2048, maxPixelRatio: 2 },
};

export function pickQuality({ coarsePointer, screenWidth, screenHeight }) {
  const shortSide = Math.min(screenWidth, screenHeight);
  return coarsePointer && shortSide < 900 ? LEVELS.movil : LEVELS.ordenador;
}

// Permite forzar el nivel para probar: ?calidad=movil o ?calidad=ordenador
export function qualityFromQuery(search) {
  const value = new URLSearchParams(search).get('calidad');
  return value && Object.hasOwn(LEVELS, value) ? LEVELS[value] : null;
}
```

- [ ] **Paso 5: Comprobar que pasan**

Run: `cd /Users/mr_donut/bchess && npm test`
Expected: PASS, con `ℹ tests 18`, `ℹ pass 18` y `ℹ fail 0`.

- [ ] **Paso 6: Servidor de desarrollo sin caché**

`tools/dev-server.py`:

```python
#!/usr/bin/env python3
"""Servidor estático de desarrollo con Cache-Control: no-store.

El navegador de vista previa cachea los módulos ES con fuerza; sin esto se sirven
versiones viejas y se depura código que no se está ejecutando.
Uso: python3 tools/dev-server.py 8741
"""
import http.server
import sys
from functools import partial
from pathlib import Path


class NoStoreHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.glb': 'model/gltf-binary',
        '.hdr': 'application/octet-stream',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8741
    root = Path(__file__).resolve().parent.parent
    handler = partial(NoStoreHandler, directory=str(root))
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'BChess en http://127.0.0.1:{port}/', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
```

Leer `/Users/mr_donut/.claude/launch.json` y añadir este objeto a `configurations`, sin tocar
las demás entradas:

```json
{
  "name": "bchess",
  "runtimeExecutable": "python3",
  "runtimeArgs": ["/Users/mr_donut/bchess/tools/dev-server.py", "8741"],
  "port": 8741
}
```

Run: `preview_start` con `{ "name": "bchess" }` y después
`curl -sI http://127.0.0.1:8741/package.json | grep -i cache-control`
Expected: `Cache-Control: no-store`

- [ ] **Paso 7: Commit**

```bash
cd /Users/mr_donut/bchess
git add package.json tools/dev-server.py src tests .gitignore
git commit -m "Base del proyecto: casillas, paseo y calidad con pruebas"
```

---

### Tarea 2: Escena — Three.js, tablero, luz, cámara y fluidez

**Files:**
- Create: `vendor/three/…` (núcleo y addons), `assets/env/studio_small_09_1k.hdr` y 6 texturas en `assets/textures/`
- Create: `index.html`, `src/ui/style.css`, `src/ui/hud.js`
- Create: `src/scene/stage.js`, `src/scene/lighting.js`, `src/scene/board.js`, `src/main.js`

**Interfaces:**
- Consumes: `squareToPosition` y `positionToSquare` (Tarea 1); `pickQuality`, `qualityFromQuery` y los niveles (Tarea 1).
- Produces:
  - `createStage(canvas: HTMLCanvasElement, quality) → { renderer, scene, camera, controls }`
  - `addLighting({ renderer, scene }, quality) → Promise<void>`
  - `createBoard() → { group: THREE.Group, squareToWorld(square) → THREE.Vector3 (y = 0), worldToSquare(point: THREE.Vector3) → string | null }`
  - `createHud() → { tickFps(now), onAction(handler(action)), setBusy(busy), hideAction(action), showMessage(text, { retry }?), hideMessage() }`
  - `window.bchess = { stage, board, quality }`: acceso para depurar desde la consola.

- [ ] **Paso 1: Copiar Three.js r186**

```bash
cd /Users/mr_donut/bchess
rm -rf raw/tmp/three && mkdir -p raw/tmp/three
npm pack three@0.186.0 --pack-destination raw/tmp/three --silent
tar -xzf raw/tmp/three/three-0.186.0.tgz -C raw/tmp/three
P=raw/tmp/three/package
mkdir -p vendor/three/build vendor/three/examples/jsm/{loaders,controls,utils,libs}
cp $P/build/three.module.js $P/build/three.core.js vendor/three/build/
cp $P/examples/jsm/loaders/GLTFLoader.js $P/examples/jsm/loaders/HDRLoader.js vendor/three/examples/jsm/loaders/
cp $P/examples/jsm/controls/OrbitControls.js vendor/three/examples/jsm/controls/
cp $P/examples/jsm/utils/BufferGeometryUtils.js $P/examples/jsm/utils/SkeletonUtils.js vendor/three/examples/jsm/utils/
cp $P/examples/jsm/libs/meshopt_decoder.module.js vendor/three/examples/jsm/libs/
cp $P/LICENSE vendor/three/LICENSE
grep -rhoE "^import .* from '\.[^']+'" vendor/three | sort -u
```

Expected: solo aparecen importaciones relativas a `./three.core.js`,
`../utils/BufferGeometryUtils.js` y `../utils/SkeletonUtils.js`, y las tres existen en
`vendor/three`.

- [ ] **Paso 2: Descargar el HDRI y las chapas de madera (Poly Haven, CC0)**

```bash
cd /Users/mr_donut/bchess
mkdir -p assets/env assets/textures
curl -sSfL -o assets/env/studio_small_09_1k.hdr https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr
for t in oak_veneer_01 rosewood_veneer1; do
  for m in diff nor_gl rough; do
    curl -sSfL -o "assets/textures/${t}_${m}_1k.jpg" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/$t/${t}_${m}_1k.jpg"
  done
done
ls -l assets/env assets/textures
```

Expected: `studio_small_09_1k.hdr` de 1615248 bytes y seis `.jpg`. Los de `oak_veneer_01`
pesan 641756, 484844 y 865194 bytes; los de `rosewood_veneer1`, 836142, 327517 y 234966.

- [ ] **Paso 3: Página y estilos**

`index.html`:

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>BChess · prueba del peón</title>
  <meta name="description" content="BChess, homenaje 3D a Battle Chess (1988): prueba del peón animado.">
  <meta name="theme-color" content="#0d0b09">
  <link rel="stylesheet" href="src/ui/style.css">
  <script type="importmap">
    {
      "imports": {
        "three": "./vendor/three/build/three.module.js",
        "three/addons/": "./vendor/three/examples/jsm/"
      }
    }
  </script>
</head>
<body>
  <canvas id="escena" aria-label="Tablero de ajedrez en 3D con el peón blanco"></canvas>
  <div id="hud">
    <div id="fps">-- fps</div>
    <div id="acciones" role="group" aria-label="Movimientos del peón">
      <button type="button" data-accion="attack" disabled>Atacar</button>
      <button type="button" data-accion="hit" disabled>Golpe</button>
      <button type="button" data-accion="fall" disabled>Caer</button>
    </div>
    <div id="aviso" role="alert" hidden></div>
    <footer id="creditos">Modelos: Tripo AI (CC BY 4.0) · Homenaje a Battle Chess (Interplay, 1988)</footer>
  </div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

`src/ui/style.css`:

```css
:root {
  color-scheme: dark;
  --tinta: #f4ead7;
  --fondo-boton: rgba(24, 18, 12, 0.72);
  --borde-boton: rgba(244, 234, 215, 0.35);
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  overflow: hidden;
  background: #0d0b09;
  color: var(--tinta);
  font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}

#escena { position: fixed; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
#hud { position: fixed; inset: 0; pointer-events: none; }

#fps {
  position: absolute;
  top: max(10px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  padding: 5px 7px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.45);
  font: 12px/1 ui-monospace, Menlo, monospace;
}

#acciones {
  position: absolute;
  left: 50%;
  bottom: max(44px, calc(env(safe-area-inset-bottom) + 36px));
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  pointer-events: auto;
}

#acciones button {
  min-width: 88px;
  padding: 11px 18px;
  border: 1px solid var(--borde-boton);
  border-radius: 999px;
  background: var(--fondo-boton);
  color: var(--tinta);
  font: 600 15px/1 system-ui, sans-serif;
  cursor: pointer;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
#acciones button:disabled { opacity: 0.45; cursor: default; }
#acciones button:not(:disabled):hover { border-color: var(--tinta); }

#aviso {
  position: absolute;
  left: 50%;
  top: 42%;
  transform: translate(-50%, -50%);
  max-width: min(420px, 88vw);
  padding: 18px 20px;
  border: 1px solid var(--borde-boton);
  border-radius: 12px;
  background: rgba(20, 14, 10, 0.92);
  text-align: center;
  pointer-events: auto;
}
#aviso p { margin: 0; }
#aviso button {
  margin-top: 12px;
  padding: 9px 16px;
  border: 0;
  border-radius: 999px;
  background: var(--tinta);
  color: #1a120b;
  font: 600 14px/1 system-ui, sans-serif;
  cursor: pointer;
}

#creditos {
  position: absolute;
  right: max(12px, env(safe-area-inset-right));
  bottom: max(10px, env(safe-area-inset-bottom));
  font-size: 11px;
  opacity: 0.7;
  text-align: right;
}

@media (max-width: 520px) {
  #acciones button { min-width: 0; padding: 10px 14px; }
  #creditos { max-width: 60vw; font-size: 10px; }
}
```

- [ ] **Paso 4: Interfaz (`src/ui/hud.js`)**

```js
// Interfaz: contador de fluidez, botones de acciones y avisos.

export function createHud() {
  const fpsEl = document.getElementById('fps');
  const aviso = document.getElementById('aviso');
  const buttons = [...document.querySelectorAll('#acciones button')];

  let frames = 0;
  let last = performance.now();

  function tickFps(now) {
    frames++;
    if (now - last >= 500) {
      fpsEl.textContent = `${Math.round((frames * 1000) / (now - last))} fps`;
      frames = 0;
      last = now;
    }
  }

  function onAction(handler) {
    for (const button of buttons) {
      button.addEventListener('click', () => handler(button.dataset.accion));
    }
  }

  function setBusy(busy) {
    for (const button of buttons) button.disabled = busy;
  }

  function hideAction(action) {
    const button = buttons.find((b) => b.dataset.accion === action);
    if (button) button.hidden = true;
  }

  function hideMessage() {
    aviso.hidden = true;
    aviso.replaceChildren();
  }

  function showMessage(text, { retry } = {}) {
    const p = document.createElement('p');
    p.textContent = text;
    aviso.replaceChildren(p);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Reintentar';
      button.addEventListener('click', () => {
        hideMessage();
        retry();
      });
      aviso.append(button);
    }
    aviso.hidden = false;
  }

  return { tickFps, onAction, setBusy, hideAction, showMessage, hideMessage };
}
```

- [ ] **Paso 5: Escena, luz y tablero**

`src/scene/stage.js`:

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Lienzo, cámara y controles de órbita. La cámara empieza detrás de las blancas.

export function createStage(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b09);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 7.5, 11);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.4, 0.8);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 18;
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
  controls.update();

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = width < height ? 55 : 40;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, controls };
}
```

`src/scene/lighting.js`:

```js
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Luz de estudio: un HDRI libre (Poly Haven, CC0) para reflejos y luz ambiente, y una
// luz principal que proyecta sombras suaves. Si el HDRI no carga, luz de reserva.

export async function addLighting({ renderer, scene }, quality) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const hdr = await new HDRLoader().loadAsync('assets/env/studio_small_09_1k.hdr');
    scene.environment = pmrem.fromEquirectangular(hdr).texture;
    scene.environmentIntensity = 0.9;
    hdr.dispose();
    pmrem.dispose();
  } catch (err) {
    console.error('[BChess] Sin HDRI, uso luz de reserva:', err);
    scene.add(new THREE.HemisphereLight(0xfff4e0, 0x201810, 1.2));
  }

  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(-4, 9, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 25 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  scene.add(key);
}
```

`src/scene/board.js`:

```js
import * as THREE from 'three';
import { squareToPosition, positionToSquare } from './squares.js';

// Tablero 8×8 de chapa de madera (roble claro y palisandro oscuro) con marco y mesa.
// La cara superior de las casillas está en y = 0. Unidad: 1 = una casilla.

const TEXTURES = 'assets/textures/';

function woodMaterial(loader, name) {
  const load = (map, srgb) => {
    const texture = loader.load(`${TEXTURES}${name}_${map}_1k.jpg`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  return new THREE.MeshStandardMaterial({
    map: load('diff', true),
    normalMap: load('nor_gl', false),
    roughnessMap: load('rough', false),
    roughness: 1,
    metalness: 0,
  });
}

// Cada casilla toma un trozo distinto de la textura para que la veta no se repita.
function tileGeometry(offsetU, offsetV) {
  const geometry = new THREE.BoxGeometry(1, 0.12, 1);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * 0.5 + offsetU, uv.getY(i) * 0.5 + offsetV);
  }
  return geometry;
}

export function createBoard() {
  const loader = new THREE.TextureLoader();
  const light = woodMaterial(loader, 'oak_veneer_01');
  const dark = woodMaterial(loader, 'rosewood_veneer1');
  const frameMaterial = dark.clone();
  frameMaterial.color = new THREE.Color(0x6b4a33);

  const group = new THREE.Group();
  group.name = 'tablero';

  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      const square = 'abcdefgh'[file] + (rank + 1);
      const { x, z } = squareToPosition(square);
      const isLight = (file + rank) % 2 === 1;
      const offsetU = ((file * 37 + rank * 17) % 10) / 10;
      const offsetV = ((file * 13 + rank * 29) % 10) / 10;
      const tile = new THREE.Mesh(tileGeometry(offsetU, offsetV), isLight ? light : dark);
      tile.position.set(x, -0.06, z);
      tile.rotation.y = ((file + rank * 3) % 2) * (Math.PI / 2);
      tile.receiveShadow = true;
      tile.name = square;
      group.add(tile);
    }
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 9), frameMaterial);
  frame.position.y = -0.17;
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const table = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ color: 0x1b140f, roughness: 0.9 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.32;
  table.receiveShadow = true;
  group.add(table);

  return {
    group,
    squareToWorld(square) {
      const { x, z } = squareToPosition(square);
      return new THREE.Vector3(x, 0, z);
    },
    worldToSquare(point) {
      return positionToSquare(point.x, point.z);
    },
  };
}
```

- [ ] **Paso 6: Arranque (`src/main.js`, versión de la Tarea 2)**

```js
import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHud } from './ui/hud.js';

// Arranque de la prueba del peón (Tarea 2: la escena, todavía sin peón).

const hud = createHud();

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function currentQuality() {
  return qualityFromQuery(location.search) ?? pickQuality({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    screenWidth: screen.width,
    screenHeight: screen.height,
  });
}

async function start() {
  if (!webglAvailable()) {
    hud.showMessage('Tu navegador no puede mostrar gráficos 3D (WebGL no está disponible). Prueba con Chrome, Safari o Firefox actualizados.');
    return;
  }
  const quality = currentQuality();
  const stage = createStage(document.getElementById('escena'), quality);
  const board = createBoard();
  stage.scene.add(board.group);

  stage.renderer.setAnimationLoop((now) => {
    stage.controls.update();
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  await addLighting(stage, quality);
  window.bchess = { stage, board, quality };
}

start();
```

- [ ] **Paso 7: Comprobar en la vista previa**

1. `preview_start` con `{ "name": "bchess" }`. Navegar a `http://127.0.0.1:8741/`.
2. `read_console_messages` con `onlyErrors: true` → Expected: ningún error.
3. `read_network_requests` → Expected: `three.module.js`, `three.core.js`, `OrbitControls.js`,
   `HDRLoader.js`, el `.hdr` y las 6 texturas con estado 200.
4. `computer` screenshot → Expected: tablero de 8×8 con casillas claras y oscuras, a1 oscura
   en la esquina inferior izquierda, marco y sombra suave; esquina superior derecha con
   «NN fps».
5. `javascript_tool`: `window.bchess.quality.name` → Expected: `"ordenador"`.
6. `computer` left_click_drag en el lienzo → Expected: la cámara gira y no se mete bajo el
   tablero.
7. `resize_window` con `preset: "mobile"`, recargar y comprobar que el tablero se ve entero.
   Después, `preset: "desktop"`.

- [ ] **Paso 8: Commit**

```bash
cd /Users/mr_donut/bchess
git add index.html vendor assets/env assets/textures src
git commit -m "Escena: Three.js r186, tablero de madera, luz de estudio y contador de fluidez"
```

---

### Tarea 3: Modelos del peón (Gemini + Tripo Studio + optimización)

En paralelo con las Tareas 1 y 2, en el Chrome del usuario («Macbook-air»), con su permiso
para hacerlo de principio a fin.

**Files:**
- Create (no se suben): `raw/ref/peon-de-pie.png`, `raw/ref/escudo.png`, `raw/ref/peana.png`, `raw/tripo/*.glb`
- Create: `assets/models/pawn-ordenador.glb`, `assets/models/pawn-movil.glb`
- Create: `assets/models/shield-ordenador.glb`, `assets/models/shield-movil.glb`
- Create: `assets/models/pedestal-ordenador.glb`, `assets/models/pedestal-movil.glb`
- Create: `assets/models/manifest.json`
- Create (solo si hace falta): `tools/strip-anim.mjs`, `assets/models/pawn-anim-*.glb`

**Interfaces:**
- Consumes: la imagen de pie generada en la conversación de Gemini.
- Produces: `assets/models/manifest.json` con esta forma exacta (lo usa la Tarea 4):

```json
{
  "pawn": {
    "files": { "movil": "pawn-movil.glb", "ordenador": "pawn-ordenador.glb" },
    "animationFiles": [],
    "height": 1.35,
    "yaw": 0,
    "clips": {},
    "hands": {},
    "spear": { "hand": "right", "position": [0, 0, 0], "rotation": [0, 0, 0] },
    "shield": { "hand": "left", "position": [0, 0, 0.06], "rotation": [0, 0, 0], "scale": 1 }
  },
  "shield": { "files": { "movil": "shield-movil.glb", "ordenador": "shield-ordenador.glb" }, "height": 0.62 },
  "pedestal": { "files": { "movil": "pedestal-movil.glb", "ordenador": "pedestal-ordenador.glb" }, "height": 0.26 }
}
```

- `clips`: `{}` para detectar los nombres solos. Si la detección falla, poner los nombres
  exactos, por ejemplo `{ "walk": "Anim_3" }`.
- `hands`: `{}` para detectarlas solas. Si falla, `{ "right": "<hueso>", "left": "<hueso>" }`.
- `yaw`: giro en radianes si el modelo no mira a +Z.

- [ ] **Paso 1: Guardar la imagen de pie**

```bash
cd /Users/mr_donut/bchess
f=$(ls -Ut ~/Downloads/*.png ~/Downloads/*.jpg ~/Downloads/*.jpeg 2>/dev/null | head -1)
cp "$f" raw/ref/peon-de-pie.${f##*.}
sips -g pixelWidth -g pixelHeight raw/ref/peon-de-pie.*
```

Expected: una imagen de al menos 1024 px de lado. Abrirla con `Read` y comprobar tres cosas:
cuerpo entero, brazos separados del cuerpo y manos vacías.

- [ ] **Paso 2: Escudo y peana aislados en la misma conversación de Gemini**

Escribir en la conversación, y enviar, este texto:

> Genera UNA sola imagen del escudo que lleva el soldado de la imagen de referencia: escudo de
> cometa alargado, blanco hueso desgastado, con el león rampante azul pintado y el borde
> metálico con remaches. Solo el escudo, sin personaje, visto de frente y plano a la cámara,
> centrado y con margen alrededor, luz de estudio suave y uniforme, sin sombras, fondo liso
> gris claro. Mismo estilo hiperrealista.

Descargarla con «Descargar imagen a tamaño completo» y copiarla a `raw/ref/escudo.png` como
en el Paso 1. Después, este otro texto:

> Genera UNA sola imagen de la peana redonda de madera sobre la que está el soldado en la
> imagen de referencia: base cilíndrica de madera clara, con molduras arriba y abajo y el
> pequeño escudo con el león azul en el frente. Solo la peana, vacía, sin personaje ni
> objetos encima, vista de frente y un poco desde arriba (unos 20 grados) para que se vea la
> cara superior, centrada y con margen alrededor, luz de estudio suave y uniforme, fondo liso
> gris claro. Mismo estilo hiperrealista.

Descargarla y copiarla a `raw/ref/peana.png`.

Si alguna no se parece a la referencia, usar como reserva los recortes
`raw/ref/crop_shield.png` y `raw/ref/crop_base_raw.png`.

- [ ] **Paso 3: Tripo Studio, el peón en 3D**

1. En `studio.tripo3d.ai`, crear un modelo con «Imagen a 3D» subiendo `raw/ref/peon-de-pie.png`.
   Para subir: localizar el `input[type=file]` con `find` y usar `file_upload`, sin pulsar el
   botón que abre el selector del sistema.
2. Elegir la calidad más alta que permita el plan gratuito, con textura y PBR si están
   disponibles.
3. Esperar a que termine y revisar el resultado girándolo. Se acepta si:
   - la silueta está entera, de cabeza a pies;
   - la cara, el casco y el león azul de la túnica son reconocibles;
   - no hay trozos flotando.

   Si no, un único intento más.

- [ ] **Paso 4: Tripo Studio, esqueleto y animaciones**

1. Con el peón aceptado, ir a la función de esqueleto automático. Tipo: bípedo/humanoide.
   Si ofrece nombres de huesos compatibles con Mixamo, elegirlos.
2. Añadir estas animaciones de su biblioteca: reposo (*idle*), andar (*walk*), ataque
   (*attack*, *slash* o *stab*), golpe recibido (*hurt* o *hit*), caída (*fall* o *death*) y
   salto (*jump*), si existe.
3. Exportar en GLB con el esqueleto y las animaciones.
   - **Caso A, un único GLB con todas:** descargarlo y guardarlo como `raw/tripo/pawn.glb`.
   - **Caso B, un GLB por animación:** guardar cada uno como `raw/tripo/pawn-<accion>.glb`
     (`idle`, `walk`, `attack`, `hit`, `fall`, `jump`). El de reposo hace de modelo:
     `cp raw/tripo/pawn-idle.glb raw/tripo/pawn.glb`. Después, el Paso 6b.

Las descargas de Chrome van a `~/Downloads`. Copiarlas con
`cp "$(ls -Ut ~/Downloads/*.glb | head -1)" raw/tripo/<nombre>.glb`.

- [ ] **Paso 5: Tripo Studio, escudo y peana**

«Imagen a 3D» con `raw/ref/escudo.png` → exportar GLB → `raw/tripo/shield.glb`.
«Imagen a 3D» con `raw/ref/peana.png` → exportar GLB → `raw/tripo/pedestal.glb`.
Sin esqueleto.

- [ ] **Paso 6: Inspeccionar**

```bash
cd /Users/mr_donut/bchess
for m in pawn shield pedestal; do npx --yes @gltf-transform/cli@4.5.0 inspect raw/tripo/$m.glb; done
```

Expected: `pawn.glb` tiene una sección ANIMATIONS con los clips (en el caso A) y texturas.
Apuntar los nombres de los clips para el manifiesto.

- [ ] **Paso 6b (solo caso B): animaciones sin malla**

`tools/strip-anim.mjs`:

```js
// Deja un GLB solo con nodos y animaciones: sin mallas, pieles, materiales ni texturas.
// Uso: node tools/strip-anim.mjs entrada.glb salida.glb
import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';

const [input, output] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(input);
const root = doc.getRoot();
for (const node of root.listNodes()) {
  node.setMesh(null);
  node.setSkin(null);
}
for (const mesh of root.listMeshes()) mesh.dispose();
await doc.transform(prune());
await io.write(output, doc);
console.log(`${output}: ${root.listAnimations().map((a) => a.getName()).join(', ')}`);
```

```bash
cd /Users/mr_donut/bchess
npm install --no-save @gltf-transform/core@4.5.0 @gltf-transform/functions@4.5.0
for a in walk attack hit fall jump; do
  [ -f raw/tripo/pawn-$a.glb ] && node tools/strip-anim.mjs raw/tripo/pawn-$a.glb assets/models/pawn-anim-$a.glb
done
ls -l assets/models/pawn-anim-*.glb
```

Expected: una línea por fichero con el nombre de su clip, y cada fichero de menos de 300 KB.
En el manifiesto, `"animationFiles"` lista esos ficheros; por ejemplo
`["pawn-anim-walk.glb", "pawn-anim-attack.glb"]`.

- [ ] **Paso 7: Optimizar a los dos niveles**

```bash
cd /Users/mr_donut/bchess
G="npx --yes @gltf-transform/cli@4.5.0"
mkdir -p raw/tmp/opt assets/models
for level in ordenador:2048 movil:1024; do
  name=${level%%:*}; size=${level##*:}
  for m in pawn shield pedestal; do
    t=raw/tmp/opt/$m-$name
    $G dedup raw/tripo/$m.glb $t-1.glb
    $G prune $t-1.glb $t-2.glb
    $G resample $t-2.glb $t-3.glb
    $G resize $t-3.glb $t-4.glb --width $size --height $size
    $G webp $t-4.glb $t-5.glb --quality 88
    $G meshopt $t-5.glb assets/models/$m-$name.glb --level medium
  done
done
ls -l assets/models/*.glb
```

Expected: `pawn-ordenador.glb` ≤ 6 000 000 bytes y `pawn-movil.glb` ≤ 3 000 000 bytes.
Si alguno se pasa, repetir ese nivel con `--quality 75` en `webp` y tamaños de 1536 y 768.

- [ ] **Paso 8: Manifiesto**

Crear `assets/models/manifest.json` con el JSON de **Interfaces** de esta tarea:
- Rellenar `animationFiles` si se usó el caso B.
- En `clips`, poner solo los nombres que la Tarea 4 no detecte sola. La Tarea 4 avisa en la
  consola con la lista de clips.

- [ ] **Paso 9: Commit**

```bash
cd /Users/mr_donut/bchess
git add assets/models
git diff --cached --quiet -- tools/strip-anim.mjs 2>/dev/null; [ -f tools/strip-anim.mjs ] && git add tools/strip-anim.mjs
git commit -m "Modelos del peón, escudo y peana (Tripo AI, CC BY 4.0) optimizados"
```

---

### Tarea 4: Figura con esqueleto: clips, manos, lanza, escudo y peana

**Files:**
- Create: `src/pieces/clips.js`, `src/pieces/bones.js`, `src/pieces/spear.js`, `src/pieces/piece.js`
- Test: `tests/clips.test.js`, `tests/bones.test.js`
- Modify: `src/main.js` (sustituir entero)

**Interfaces:**
- Consumes:
  - `strideSpeed` y `FACING_BLACK` (Tarea 1);
  - `createStage`, `addLighting`, `createBoard` y `createHud` (Tarea 2);
  - `assets/models/manifest.json` (Tarea 3).
- Produces:
  - `ACTIONS = ['idle', 'walk', 'attack', 'hit', 'fall', 'jump']`
  - `mapClips(clipNames: string[], overrides?: object) → { idle, walk, attack, hit, fall, jump }`, con `string | null` en cada acción.
  - `pickRootPositionTrack(trackNames: string[]) → string | null`
  - `removeLinearDrift(times: ArrayLike<number>, values: ArrayLike<number>) → { distance: number, values: Float32Array }`
  - `pickHandBone(boneNames: string[], side: 'right' | 'left') → string | null`
  - `createSpear() → THREE.Group`. El origen es el punto de agarre y la punta mira a +Y.
  - `loadManifest() → Promise<object>`
  - `createPawn(manifest, quality) → Promise<Piece>`
- `Piece`:
  - `object: THREE.Group`, que contiene `figure` y `pedestal`;
  - `figure: THREE.Group`, `pedestal: THREE.Group` y `props: { spear?, shield? }`;
  - `pedestalHeight: number` y `walkSpeed: number` (casillas por segundo);
  - `has(action) → boolean`;
  - `play(action, { loop = true, fade = 0.25 }) → AnimationAction | null`;
  - `playOnce(action, { fade = 0.2 }) → Promise<boolean>`;
  - `placeAt(position: THREE.Vector3)` coloca la peana en el suelo y la figura encima;
  - `face(angle: number)` y `update(dt: number)`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

`tests/clips.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, mapClips, pickRootPositionTrack, removeLinearDrift } from '../src/pieces/clips.js';

test('las acciones del juego', () => {
  assert.deepEqual(ACTIONS, ['idle', 'walk', 'attack', 'hit', 'fall', 'jump']);
});

test('nombres tipo Tripo', () => {
  assert.deepEqual(mapClips(['Idle', 'Walk', 'Slash', 'Hurt', 'Fall', 'Jump']), {
    idle: 'Idle', walk: 'Walk', attack: 'Slash', hit: 'Hurt', fall: 'Fall', jump: 'Jump',
  });
});

test('nombres tipo Mixamo', () => {
  const m = mapClips(['mixamo.com|Standing Idle', 'Walking', 'Stabbing', 'Hit Reaction', 'Falling Back Death']);
  assert.equal(m.idle, 'mixamo.com|Standing Idle');
  assert.equal(m.walk, 'Walking');
  assert.equal(m.attack, 'Stabbing');
  assert.equal(m.hit, 'Hit Reaction');
  assert.equal(m.fall, 'Falling Back Death');
  assert.equal(m.jump, null);
});

test('las indicaciones del manifiesto mandan y no se reutilizan', () => {
  const m = mapClips(['Anim_0', 'Anim_1', 'Walk'], { walk: 'Anim_1', idle: 'Anim_0' });
  assert.equal(m.walk, 'Anim_1');
  assert.equal(m.idle, 'Anim_0');
  assert.equal(m.attack, null);
});

test('pista raíz: caderas antes que root', () => {
  assert.equal(pickRootPositionTrack(['Root.position', 'mixamorigHips.position', 'mixamorigHips.quaternion']), 'mixamorigHips.position');
  assert.equal(pickRootPositionTrack(['Armature_Root.position']), 'Armature_Root.position');
  assert.equal(pickRootPositionTrack(['Spine.quaternion']), null);
});

test('removeLinearDrift quita el avance y conserva el balanceo', () => {
  const times = [0, 0.5, 1];
  const values = [0, 1, 0, 0.1, 1.05, 0.5, 0, 1, 1];
  const result = removeLinearDrift(times, values);
  assert.ok(Math.abs(result.distance - 1) < 1e-9);
  const rounded = [...result.values].map((v) => Math.round(v * 1000) / 1000);
  assert.deepEqual(rounded, [0, 1, 0, 0.1, 1.05, 0, 0, 1, 0]);
});
```

`tests/bones.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickHandBone } from '../src/pieces/bones.js';

test('nombres de Mixamo, sin confundir los dedos', () => {
  const names = ['mixamorigHips', 'mixamorigRightHandThumb1', 'mixamorigRightHand', 'mixamorigLeftHand'];
  assert.equal(pickHandBone(names, 'right'), 'mixamorigRightHand');
  assert.equal(pickHandBone(names, 'left'), 'mixamorigLeftHand');
});

test('estilos de Blender, 3ds Max y con guion bajo', () => {
  assert.equal(pickHandBone(['hand.L', 'hand.R'], 'right'), 'hand.R');
  assert.equal(pickHandBone(['Bip01 R Hand', 'Bip01 L Hand'], 'left'), 'Bip01 L Hand');
  assert.equal(pickHandBone(['L_Hand', 'R_Hand'], 'right'), 'R_Hand');
});

test('sin manos devuelve null y un lado raro lanza error', () => {
  assert.equal(pickHandBone(['Hips', 'Spine'], 'right'), null);
  assert.throws(() => pickHandBone(['Hips'], 'up'), /Lado no válido/);
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd /Users/mr_donut/bchess && npm test`
Expected: FAIL. `clips.test.js` y `bones.test.js` dan `ERR_MODULE_NOT_FOUND`; las 18
anteriores siguen pasando.

- [ ] **Paso 3: Escribir `clips.js` y `bones.js`**

`src/pieces/clips.js`:

```js
// Asigna los clips de un GLB a las acciones del juego por su nombre (Tripo, Mixamo…)
// y quita el avance de un clip de paseo para que la figura ande donde diga el código.

const PATTERNS = {
  idle: [/idle/i, /breath/i, /stand/i],
  walk: [/walk/i],
  attack: [/attack/i, /slash/i, /stab/i, /thrust/i, /strike/i, /punch/i],
  hit: [/hurt/i, /hit/i, /impact/i, /damage/i, /react/i],
  fall: [/fall/i, /death/i, /dying/i, /die/i, /knock/i],
  jump: [/jump/i, /hop/i, /leap/i],
};

export const ACTIONS = Object.keys(PATTERNS);

export function mapClips(clipNames, overrides = {}) {
  const result = {};
  const used = new Set();
  for (const action of ACTIONS) {
    const name = overrides[action];
    if (name && clipNames.includes(name)) {
      result[action] = name;
      used.add(name);
    }
  }
  for (const action of ACTIONS) {
    if (result[action]) continue;
    let match = null;
    for (const pattern of PATTERNS[action]) {
      match = clipNames.find((n) => pattern.test(n) && !used.has(n)) ?? null;
      if (match) break;
    }
    result[action] = match;
    if (match) used.add(match);
  }
  return result;
}

// Pista de posición del hueso raíz (caderas) de un clip, o null.
export function pickRootPositionTrack(trackNames) {
  const find = (pattern) => trackNames.find((n) => pattern.test(n)) ?? null;
  return find(/(hips|pelvis)\.position$/i) ?? find(/root\.position$/i);
}

// Quita el avance horizontal (lo que se desplaza de principio a fin) conservando el
// balanceo. `values` = [x, y, z, x, y, z, …] alineado con `times`.
export function removeLinearDrift(times, values) {
  const n = times.length;
  const out = Float32Array.from(values);
  if (n < 2) return { distance: 0, values: out };
  const dx = values[(n - 1) * 3] - values[0];
  const dz = values[(n - 1) * 3 + 2] - values[2];
  const t0 = times[0];
  const span = times[n - 1] - t0 || 1;
  for (let i = 0; i < n; i++) {
    const k = (times[i] - t0) / span;
    out[i * 3] = values[i * 3] - dx * k;
    out[i * 3 + 2] = values[i * 3 + 2] - dz * k;
  }
  return { distance: Math.hypot(dx, dz), values: out };
}
```

`src/pieces/bones.js`:

```js
// Busca el hueso de cada mano por su nombre (Tripo, Mixamo, Blender, 3ds Max…).
// Se comparan los nombres sin separadores ni mayúsculas y anclados al final, para no
// confundir la mano con sus dedos («RightHandThumb1»).

const SIDE_PATTERNS = {
  right: [/righthand$/, /handr(ight)?$/, /rhand$/],
  left: [/lefthand$/, /handl(eft)?$/, /lhand$/],
};

const normalize = (name) => name.replace(/[\s_.:|-]/g, '').toLowerCase();

export function pickHandBone(boneNames, side) {
  const patterns = SIDE_PATTERNS[side];
  if (!patterns) throw new Error(`Lado no válido: ${side}`);
  for (const pattern of patterns) {
    const found = boneNames.find((n) => pattern.test(normalize(n)));
    if (found) return found;
  }
  return null;
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd /Users/mr_donut/bchess && npm test`
Expected: PASS, con `ℹ tests 27`, `ℹ pass 27` y `ℹ fail 0`.

- [ ] **Paso 5: Lanza (`src/pieces/spear.js`)**

```js
import * as THREE from 'three';

// Lanza del peón hecha en código: asta de madera, punta de acero y regatón.
// El origen es el punto de agarre y la punta mira a +Y. Unidad: casillas.

export function createSpear({ length = 1.9, grip = 0.62 } = {}) {
  const group = new THREE.Group();
  group.name = 'lanza';

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.75, metalness: 0 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.28, metalness: 1 });

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, length, 12), wood);
  shaft.position.y = length / 2 - grip;

  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.26, 4), steel);
  blade.scale.z = 0.35;
  blade.position.y = length - grip + 0.13;

  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.09, 12), steel);
  socket.position.y = length - grip - 0.02;

  const butt = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 12), steel);
  butt.rotation.x = Math.PI;
  butt.position.y = -grip - 0.03;

  group.add(shaft, blade, socket, butt);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}
```

- [ ] **Paso 6: Figura (`src/pieces/piece.js`)**

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ACTIONS, mapClips, pickRootPositionTrack, removeLinearDrift } from './clips.js';
import { pickHandBone } from './bones.js';
import { createSpear } from './spear.js';
import { strideSpeed } from '../moves/walk.js';

// Figura con esqueleto: modelo animado, lanza y escudo en las manos, y su peana.
// `figure` y `pedestal` se colocan en coordenadas del tablero; el modelo va dentro de
// `figure`, escalado a su altura y girado según el manifiesto.

const MODELS = 'assets/models/';

export async function loadManifest() {
  const response = await fetch(`${MODELS}manifest.json`);
  if (!response.ok) throw new Error(`manifest.json: HTTP ${response.status}`);
  return response.json();
}

// Escala un objeto recién cargado (sin transformar) a una altura, con la base en y = 0
// y centrado en X y Z.
function fitToHeight(object, height) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const k = height / (box.max.y - box.min.y);
  object.scale.setScalar(k);
  object.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
}

// Engancha un objeto a un hueso. El soporte anula la escala del hueso, así que la
// posición, el giro y la escala del objeto quedan en unidades del tablero.
function attachToBone(prop, bone, { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
  const holder = new THREE.Group();
  bone.add(holder);
  const s = bone.getWorldScale(new THREE.Vector3());
  holder.scale.set(1 / s.x, 1 / s.y, 1 / s.z);
  prop.position.fromArray(position);
  prop.rotation.set(rotation[0], rotation[1], rotation[2]);
  prop.scale.setScalar(scale);
  holder.add(prop);
  return prop;
}

function withShadows(object) {
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return object;
}

export async function createPawn(manifest, quality) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const spec = manifest.pawn;

  const [pawnGltf, shieldGltf, pedestalGltf, ...animationGltfs] = await Promise.all([
    loader.loadAsync(MODELS + spec.files[quality.name]),
    loader.loadAsync(MODELS + manifest.shield.files[quality.name]),
    loader.loadAsync(MODELS + manifest.pedestal.files[quality.name]),
    ...(spec.animationFiles ?? []).map((file) => loader.loadAsync(MODELS + file)),
  ]);
  const clips = [...pawnGltf.animations, ...animationGltfs.flatMap((g) => g.animations)];

  // Peana: origen en el suelo, en el centro.
  const pedestal = new THREE.Group();
  pedestal.name = 'peana';
  const pedestalModel = withShadows(pedestalGltf.scene);
  fitToHeight(pedestalModel, manifest.pedestal.height);
  pedestal.add(pedestalModel);

  // Figura: el modelo a su altura dentro de un giro de corrección.
  const figure = new THREE.Group();
  figure.name = 'figura';
  const turn = new THREE.Group();
  turn.rotation.y = spec.yaw ?? 0;
  const model = withShadows(pawnGltf.scene);
  fitToHeight(model, spec.height);
  turn.add(model);
  figure.add(turn);

  const object = new THREE.Group();
  object.name = 'peon';
  object.add(pedestal, figure);
  object.updateMatrixWorld(true);

  // Animaciones. El avance del paseo se quita ANTES de crear las acciones, porque
  // cada acción copia las pistas al crearse.
  const mapping = mapClips(clips.map((c) => c.name), spec.clips ?? {});
  let walkSpeed = strideSpeed({ rootDistance: 0, clipDuration: 1, height: spec.height });
  const walkClip = mapping.walk ? clips.find((c) => c.name === mapping.walk) : null;
  if (walkClip) {
    const trackName = pickRootPositionTrack(walkClip.tracks.map((t) => t.name));
    const track = trackName ? walkClip.tracks.find((t) => t.name === trackName) : null;
    if (track) {
      const { distance, values } = removeLinearDrift(track.times, track.values);
      track.values = values;
      const bone = model.getObjectByName(trackName.slice(0, -'.position'.length));
      const parentScale = bone?.parent ? bone.parent.getWorldScale(new THREE.Vector3()).x : 1;
      walkSpeed = strideSpeed({ rootDistance: distance * parentScale, clipDuration: walkClip.duration, height: spec.height });
    }
  }

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const action of ACTIONS) {
    const clip = mapping[action] ? clips.find((c) => c.name === mapping[action]) : null;
    if (clip) actions[action] = mixer.clipAction(clip);
    else console.warn(`[BChess] El peón no tiene animación «${action}». Clips: ${clips.map((c) => c.name).join(', ') || '(ninguno)'}`);
  }

  // Lanza y escudo en las manos.
  const bones = [];
  model.traverse((o) => { if (o.isBone) bones.push(o.name); });
  const boneFor = (side) => {
    const name = spec.hands?.[side] ?? pickHandBone(bones, side);
    return name ? model.getObjectByName(name) : null;
  };
  const props = {};
  const spearBone = boneFor(spec.spear?.hand ?? 'right');
  const shieldBone = boneFor(spec.shield?.hand ?? 'left');
  if (spearBone) props.spear = attachToBone(createSpear(), spearBone, spec.spear);
  if (shieldBone) {
    const shieldModel = withShadows(shieldGltf.scene);
    fitToHeight(shieldModel, manifest.shield.height);
    props.shield = attachToBone(new THREE.Group().add(shieldModel), shieldBone, spec.shield);
  }
  if (!spearBone || !shieldBone) console.warn(`[BChess] No encuentro las manos del peón. Huesos: ${bones.join(', ')}`);

  let current = null;

  function play(action, { loop = true, fade = 0.25 } = {}) {
    const next = actions[action];
    if (!next) return null;
    next.reset();
    next.setEffectiveWeight(1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    if (current && current !== next) next.crossFadeFrom(current, fade, false);
    next.play();
    current = next;
    return next;
  }

  function playOnce(action, { fade = 0.2 } = {}) {
    return new Promise((resolve) => {
      const running = play(action, { loop: false, fade });
      if (!running) {
        resolve(false);
        return;
      }
      const done = (event) => {
        if (event.action !== running) return;
        mixer.removeEventListener('finished', done);
        resolve(true);
      };
      mixer.addEventListener('finished', done);
    });
  }

  play('idle', { fade: 0 });

  return {
    object,
    figure,
    pedestal,
    props,
    pedestalHeight: manifest.pedestal.height,
    walkSpeed,
    has: (action) => Boolean(actions[action]),
    play,
    playOnce,
    placeAt(position) {
      pedestal.position.set(position.x, 0, position.z);
      figure.position.set(position.x, manifest.pedestal.height, position.z);
    },
    face(angle) {
      figure.rotation.y = angle;
    },
    update(dt) {
      mixer.update(dt);
    },
  };
}
```

- [ ] **Paso 7: Arranque con el peón (`src/main.js`, versión de la Tarea 4)**

```js
import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHud } from './ui/hud.js';
import { loadManifest, createPawn } from './pieces/piece.js';
import { FACING_BLACK } from './moves/walk.js';

// Arranque de la prueba del peón (Tarea 4: escena y peón en reposo en e2).

const START_SQUARE = 'e2';
const hud = createHud();

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function currentQuality() {
  return qualityFromQuery(location.search) ?? pickQuality({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    screenWidth: screen.width,
    screenHeight: screen.height,
  });
}

async function start() {
  if (!webglAvailable()) {
    hud.showMessage('Tu navegador no puede mostrar gráficos 3D (WebGL no está disponible). Prueba con Chrome, Safari o Firefox actualizados.');
    return;
  }
  const quality = currentQuality();
  const stage = createStage(document.getElementById('escena'), quality);
  const board = createBoard();
  stage.scene.add(board.group);
  const state = { piece: null };

  let previous = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    state.piece?.update(dt);
    stage.controls.update();
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  await addLighting(stage, quality);
  const manifest = await loadManifest();
  state.piece = await createPawn(manifest, quality);
  stage.scene.add(state.piece.object);
  state.piece.placeAt(board.squareToWorld(START_SQUARE));
  state.piece.face(FACING_BLACK);
  window.bchess = { stage, board, quality, state };
}

start();
```

- [ ] **Paso 8: Comprobar en la vista previa y ajustar el manifiesto**

1. Recargar `http://127.0.0.1:8741/`. `read_console_messages`:
   - Expected: ni errores ni avisos «No encuentro las manos».
   - Si aparece «no tiene animación», poner en `manifest.json` → `pawn.clips` el nombre
     exacto de la lista que imprime el aviso y recargar.
2. Screenshot con zoom sobre e2. Expected:
   - el peón de pie sobre su peana en e2, de espaldas a la cámara (mirando a las negras) y
     respirando;
   - la lanza en la mano derecha y el escudo en la izquierda.
3. Ajustar la posición y el giro de la lanza y del escudo desde la consola hasta que queden
   bien agarrados:
   - `window.bchess.state.piece.props.spear.position.set(x, y, z)`
   - `window.bchess.state.piece.props.spear.rotation.set(rx, ry, rz)`
   - lo mismo con `props.shield`.

   Copiar los valores finales a `manifest.json` → `pawn.spear` y `pawn.shield`, y recargar
   para confirmarlos.
4. Si el peón no mira hacia las negras (-Z), poner `pawn.yaw` a `3.141592653589793` y recargar.
5. `javascript_tool`: `window.bchess.state.piece.walkSpeed` → Expected: un número entre
   0,4 y 2.

- [ ] **Paso 9: Commit**

```bash
cd /Users/mr_donut/bchess
git add src tests assets/models/manifest.json
git commit -m "Peón con esqueleto: animaciones, lanza, escudo y peana en e2"
```

---

### Tarea 5: Ir a una casilla: toque, polvo y coreografía

**Files:**
- Create: `src/fx/dust.js`, `src/input.js`, `src/moves/sequence.js`
- Modify: `src/main.js` (sustituir entero)

**Interfaces:**
- Consumes:
  - `Piece` (Tarea 4);
  - `board.squareToWorld` y `board.worldToSquare` (Tarea 2);
  - `planWalk`, `pointAlong`, `shortestTurn` y `FACING_BLACK` (Tarea 1);
  - `hud.setBusy` (Tarea 2).
- Produces:
  - `createDust(scene) → { puff(position: THREE.Vector3, { count = 9, radius = 0.45, duration = 0.4 }?), update(dt) }`
  - `onSquareTap({ canvas, camera, board }, handler(square: string))`
  - `createMover({ piece, board, dust, onBusy(busy) }) → { placeOn(square), goTo(square) → Promise<boolean>, perform(action) → Promise<boolean>, square, busy }`

- [ ] **Paso 1: Polvo (`src/fx/dust.js`)**

```js
import * as THREE from 'three';

// Nube de polvo de dibujos animados: bolas blandas que se hinchan, suben un poco y se
// desvanecen. La textura se dibuja en un canvas, sin ficheros.

let puffTexture = null;

function texture() {
  if (puffTexture) return puffTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const gradient = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,248,235,1)');
  gradient.addColorStop(0.55, 'rgba(236,224,204,0.85)');
  gradient.addColorStop(1, 'rgba(236,224,204,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

export function createDust(scene) {
  const active = [];

  function puff(position, { count = 9, radius = 0.45, duration = 0.4 } = {}) {
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture(), transparent: true, depthWrite: false }));
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const distance = radius * (0.35 + Math.random() * 0.4);
      sprite.position.set(
        position.x + Math.cos(angle) * distance,
        position.y + 0.1 + Math.random() * 0.25,
        position.z + Math.sin(angle) * distance,
      );
      sprite.userData = {
        age: 0,
        duration: duration * (0.8 + Math.random() * 0.4),
        from: 0.25 + Math.random() * 0.15,
        to: 0.7 + Math.random() * 0.35,
        drift: new THREE.Vector3(Math.cos(angle) * 0.6, 0.5 + Math.random() * 0.3, Math.sin(angle) * 0.6),
      };
      sprite.scale.setScalar(sprite.userData.from);
      scene.add(sprite);
      active.push(sprite);
    }
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const sprite = active[i];
      const u = sprite.userData;
      u.age += dt;
      const t = Math.min(1, u.age / u.duration);
      const eased = 1 - (1 - t) ** 3;
      sprite.scale.setScalar(u.from + (u.to - u.from) * eased);
      sprite.position.addScaledVector(u.drift, dt * (1 - t));
      sprite.material.opacity = 1 - t * t;
      if (t >= 1) {
        scene.remove(sprite);
        sprite.material.dispose();
        active.splice(i, 1);
      }
    }
  }

  return { puff, update };
}
```

- [ ] **Paso 2: Toques (`src/input.js`)**

```js
import * as THREE from 'three';

// Traduce un toque o clic sobre el lienzo a la casilla que hay debajo. Ignora los
// arrastres (girar la cámara): el gesto debe ser corto y casi sin movimiento.

export function onSquareTap({ canvas, camera, board }, handler) {
  const raycaster = new THREE.Raycaster();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointer = new THREE.Vector2();
  const hit = new THREE.Vector3();
  let down = null;

  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY, time: performance.now() };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!down) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    const quick = performance.now() - down.time < 500;
    down = null;
    if (moved > 8 || !quick) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(floor, hit)) return;
    const square = board.worldToSquare(hit);
    if (square) handler(square);
  });
}
```

- [ ] **Paso 3: Coreografía (`src/moves/sequence.js`)**

```js
import * as THREE from 'three';
import { FACING_BLACK, planWalk, pointAlong, shortestTurn } from './walk.js';

// Coreografía de «ir a una casilla» y de las acciones de los botones. Mientras dura una,
// `busy` es true y se ignora cualquier otra orden.

const HOP_DISTANCE = 0.5; // lo que avanza al saltar de la peana (su radio)
const DUST_Y = 0.05;

function tween(seconds, step) {
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now) => {
      const t = Math.min(1, (now - start) / (seconds * 1000));
      step(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createMover({ piece, board, dust, onBusy = () => {} }) {
  let square = null;
  let busy = false;

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
    piece.pedestal.visible = true;
    piece.pedestal.scale.setScalar(1);
    piece.face(FACING_BLACK);
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

      // 4. La peana reaparece bajo sus pies y lo sube.
      piece.play('idle', { fade: 0.3 });
      piece.pedestal.position.set(to.x, 0, to.z);
      piece.pedestal.visible = true;
      dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
      await tween(0.4, (t) => {
        const k = 1 - (1 - t) ** 3;
        piece.pedestal.scale.setScalar(Math.max(0.001, k));
        piece.figure.position.y = h * k;
      });

      // 5. Reposo mirando a las negras.
      await turnTo(FACING_BLACK, 0.35);
      square = target;
    });
  }

  function perform(action) {
    if (!piece.has(action)) return Promise.resolve(false);
    return exclusive(async () => {
      await piece.playOnce(action);
      if (action === 'fall') {
        await wait(1500);
        const at = piece.figure.position;
        dust.puff(new THREE.Vector3(at.x, piece.pedestalHeight + DUST_Y, at.z), { radius: 0.35 });
        piece.play('idle', { fade: 0 });
      } else {
        piece.play('idle', { fade: 0.25 });
      }
    });
  }

  return {
    placeOn,
    goTo,
    perform,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
```

- [ ] **Paso 4: Arranque con toques (`src/main.js`, versión de la Tarea 5)**

```js
import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHud } from './ui/hud.js';
import { loadManifest, createPawn } from './pieces/piece.js';
import { createDust } from './fx/dust.js';
import { createMover } from './moves/sequence.js';
import { onSquareTap } from './input.js';

// Arranque de la prueba del peón (Tarea 5: tocar una casilla lo lleva hasta ella).

const START_SQUARE = 'e2';
const hud = createHud();

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function currentQuality() {
  return qualityFromQuery(location.search) ?? pickQuality({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    screenWidth: screen.width,
    screenHeight: screen.height,
  });
}

async function start() {
  if (!webglAvailable()) {
    hud.showMessage('Tu navegador no puede mostrar gráficos 3D (WebGL no está disponible). Prueba con Chrome, Safari o Firefox actualizados.');
    return;
  }
  const quality = currentQuality();
  const stage = createStage(document.getElementById('escena'), quality);
  const board = createBoard();
  stage.scene.add(board.group);
  const dust = createDust(stage.scene);
  const state = { piece: null, mover: null };

  let previous = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    state.piece?.update(dt);
    dust.update(dt);
    stage.controls.update();
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  onSquareTap({ canvas: stage.renderer.domElement, camera: stage.camera, board }, (square) => {
    state.mover?.goTo(square);
  });

  await addLighting(stage, quality);
  const manifest = await loadManifest();
  state.piece = await createPawn(manifest, quality);
  stage.scene.add(state.piece.object);
  state.mover = createMover({ piece: state.piece, board, dust, onBusy: (busy) => hud.setBusy(busy) });
  state.mover.placeOn(START_SQUARE);
  window.bchess = { stage, board, quality, state };
}

start();
```

- [ ] **Paso 5: Comprobar en la vista previa**

1. Recargar. `read_console_messages` con `onlyErrors: true` → Expected: ninguno.
2. Averiguar dónde queda e4 en pantalla con `javascript_tool`:

   ```js
   const { stage, board } = window.bchess;
   const v = board.squareToWorld('e4').project(stage.camera);
   const r = stage.renderer.domElement.getBoundingClientRect();
   ({ x: Math.round(r.left + (v.x + 1) / 2 * r.width), y: Math.round(r.top + (1 - v.y) / 2 * r.height) })
   ```

3. `computer` left_click en esas coordenadas. Enseguida, screenshot → Expected: el peón ya
   ha bajado de la peana y hay polvo o la peana está encogiéndose.
4. Mientras anda, clic en la casilla de d5 (calculada igual) → Expected: se ignora.
5. Tras 4 s, `javascript_tool`:

   ```js
   ({ square: window.bchess.state.mover.square, busy: window.bchess.state.mover.busy, y: window.bchess.state.piece.figure.position.y.toFixed(2), rot: window.bchess.state.piece.figure.rotation.y.toFixed(2), pedestal: window.bchess.state.piece.pedestal.visible })
   ```

   Expected: `square: "e4"`, `busy: false`, `y: "0.26"`, `rot: "3.14"` y `pedestal: true`.
6. Screenshot con zoom sobre e4 → Expected: los pies no patinan al andar. Si patinan,
   comparar a ojo y ajustar `pawn.height` en el manifiesto, porque la velocidad sale de la
   altura cuando el clip anda en el sitio.
7. Arrastrar en el lienzo para girar la cámara → Expected: el peón no se mueve.

- [ ] **Paso 6: Commit**

```bash
cd /Users/mr_donut/bchess
git add src
git commit -m "Tocar una casilla: salto de la peana, polvo, paseo y peana que reaparece"
```

---

### Tarea 6: Botones, errores, créditos y dónut

**Files:**
- Modify: `src/main.js` (sustituir entero), `index.html` (insertar el dónut antes de `</body>`)

**Interfaces:**
- Consumes: `createMover().perform` (Tarea 5); `hud.onAction`, `hud.hideAction`, `hud.showMessage` y `hud.setBusy` (Tarea 2); `piece.has` (Tarea 4).
- Produces: la página final de la prueba.

- [ ] **Paso 1: Arranque final (`src/main.js`)**

```js
import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHud } from './ui/hud.js';
import { loadManifest, createPawn } from './pieces/piece.js';
import { createDust } from './fx/dust.js';
import { createMover } from './moves/sequence.js';
import { onSquareTap } from './input.js';

// Arranque de la prueba del peón: escena, peón, toques, botones y avisos de error.

const START_SQUARE = 'e2';
const BUTTON_ACTIONS = ['attack', 'hit', 'fall'];
const hud = createHud();

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function currentQuality() {
  return qualityFromQuery(location.search) ?? pickQuality({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    screenWidth: screen.width,
    screenHeight: screen.height,
  });
}

async function start() {
  if (!webglAvailable()) {
    hud.showMessage('Tu navegador no puede mostrar gráficos 3D (WebGL no está disponible). Prueba con Chrome, Safari o Firefox actualizados.');
    return;
  }
  const quality = currentQuality();
  const stage = createStage(document.getElementById('escena'), quality);
  const board = createBoard();
  stage.scene.add(board.group);
  const dust = createDust(stage.scene);
  const state = { piece: null, mover: null };

  let previous = performance.now();
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    state.piece?.update(dt);
    dust.update(dt);
    stage.controls.update();
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  onSquareTap({ canvas: stage.renderer.domElement, camera: stage.camera, board }, (square) => {
    state.mover?.goTo(square);
  });
  hud.onAction((action) => {
    state.mover?.perform(action);
  });

  async function loadPawn() {
    try {
      const manifest = await loadManifest();
      const piece = await createPawn(manifest, quality);
      stage.scene.add(piece.object);
      for (const action of BUTTON_ACTIONS) {
        if (!piece.has(action)) hud.hideAction(action);
      }
      state.piece = piece;
      state.mover = createMover({ piece, board, dust, onBusy: (busy) => hud.setBusy(busy) });
      state.mover.placeOn(START_SQUARE);
      hud.setBusy(false);
    } catch (err) {
      console.error('[BChess] No se pudo cargar el peón:', err);
      hud.showMessage('No se pudo cargar el peón', { retry: loadPawn });
    }
  }

  await addLighting(stage, quality);
  await loadPawn();
  window.bchess = { stage, board, quality, state };
}

start();
```

- [ ] **Paso 2: Insertar el dónut**

```bash
cd /Users/mr_donut/bchess
gh api -H "Accept: application/vnd.github.raw" repos/mr-d0nuT/pulsebcn/contents/index.html \
  | awk '/<!-- ===== dOnuT badge · mr_d0nuT ===== -->/{f=1} f{print} /<!-- ===== \/dOnuT badge ===== -->/{f=0}' \
  > raw/donut-snippet.html
head -1 raw/donut-snippet.html; tail -1 raw/donut-snippet.html
python3 - <<'EOF'
from pathlib import Path
page = Path('index.html')
html = page.read_text(encoding='utf-8')
snippet = Path('raw/donut-snippet.html').read_text(encoding='utf-8')
assert 'dOnuT badge' not in html, 'El dónut ya está en index.html'
assert snippet.startswith('<!-- ===== dOnuT badge'), 'Recorte del dónut incompleto'
page.write_text(html.replace('</body>', snippet + '</body>', 1), encoding='utf-8')
print('dónut insertado')
EOF
```

Expected: la primera línea es `<!-- ===== dOnuT badge · mr_d0nuT ===== -->`, la última
`<!-- ===== /dOnuT badge ===== -->`, y el script imprime `dónut insertado`.

- [ ] **Paso 3: Comprobar en la vista previa**

1. Recargar. `read_console_messages` con `onlyErrors: true` → Expected: ninguno.
2. Clic en «Atacar» → Expected: los tres botones se desactivan, el peón ataca, vuelve a
   reposo y los botones se reactivan. Lo mismo con «Golpe».
3. Clic en «Caer» → Expected: cae y se queda en el suelo; a los 1,5 s sale una nube de polvo
   y aparece de pie sobre la peana.
4. Probar el error de carga:
   - `mv assets/models/manifest.json raw/manifest.json.bak` y recargar → Expected: aviso «No se
     pudo cargar el peón» con el botón «Reintentar»; el tablero sigue visible.
   - `mv raw/manifest.json.bak assets/models/manifest.json` y clic en «Reintentar» → Expected:
     el aviso desaparece y aparece el peón en e2 con los botones activos.
5. Screenshot → Expected: el dónut abajo a la izquierda, los créditos abajo a la derecha y
   los botones centrados. Clic en el dónut → se abre su tarjeta; Escape la cierra.
6. `resize_window` con `preset: "mobile"`, recargar y screenshot → Expected: ni el dónut, ni
   los botones, ni los créditos se tapan entre sí. Después, `preset: "desktop"`.

- [ ] **Paso 4: Commit**

```bash
cd /Users/mr_donut/bchess
git add src/main.js index.html
git commit -m "Botones de ataque, golpe y caída, aviso de error con reintento y dónut"
```

---

### Tarea 7: Publicar en GitHub Pages y prueba en el móvil

**Files:**
- Create: `README.md`, `.nojekyll`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `https://mr-d0nut.github.io/bchess/`.

- [ ] **Paso 1: README y `.nojekyll`**

`README.md`:

```markdown
# BChess

Homenaje 3D a *Battle Chess* (Interplay, 1988): un ajedrez en el que cada captura es una
batalla animada. Esta es la **prueba del peón**: tablero 3D, el peón blanco con esqueleto y
animaciones, paseo entre casillas y los botones Atacar, Golpe y Caer.

**Jugar:** https://mr-d0nut.github.io/bchess/ (añade `?calidad=movil` u `?calidad=ordenador`
para forzar el nivel de detalle).

## Desarrollo

- Servidor local sin caché: `python3 tools/dev-server.py 8741` → http://127.0.0.1:8741/
- Pruebas: `npm test`
- Sin compilación: módulos ES con import map; Three.js r186 en `vendor/three/`.

## Créditos y licencias

- Modelos del peón, escudo y peana: generados con [Tripo AI](https://www.tripo3d.ai) en su
  plan gratuito, licencia **CC BY 4.0, uso no comercial**. BChess es gratis y sin anuncios.
- Imagen de referencia de pie: generada con Gemini a partir de los diseños del autor.
- [Three.js](https://threejs.org): MIT.
- HDRI `studio_small_09` y texturas `oak_veneer_01` y `rosewood_veneer1`:
  [Poly Haven](https://polyhaven.com), CC0.
- *Battle Chess* es una marca de Interplay Entertainment. BChess no está afiliado a
  Interplay; solo le rinde homenaje.
```

```bash
cd /Users/mr_donut/bchess
touch .nojekyll
npm test
git add README.md .nojekyll
git commit -m "README con créditos y licencias"
```

Expected: `npm test` da `ℹ pass 27` y `ℹ fail 0` antes del commit.

- [ ] **Paso 2: Crear el repo público, subir y activar Pages**

```bash
cd /Users/mr_donut/bchess
gh repo create mr-d0nuT/bchess --public --source . --remote origin --description "BChess — homenaje 3D a Battle Chess (1988)" --push
gh api -X POST repos/mr-d0nuT/bchess/pages -f "source[branch]=main" -f "source[path]=/"
```

Expected: el repo creado con `main` subido. La API de Pages responde 201; si responde que
ya existe, repetir con `-X PUT`.

- [ ] **Paso 3: Esperar al despliegue y comprobarlo**

Run: `gh api repos/mr-d0nuT/bchess/pages/builds/latest --jq .status` hasta que dé `built`.
Un Monitor con bucle `until` que consulte cada 20 s.

Run: `curl -sI https://mr-d0nut.github.io/bchess/ | head -1` → Expected: `HTTP/2 200`.

Abrir `https://mr-d0nut.github.io/bchess/` en el panel de vista previa:
- `read_console_messages` con `onlyErrors: true` → Expected: ninguno.
- Screenshot → Expected: el peón en e2 con los botones activos.
- Tocar e4 → Expected: llega a e4.

- [ ] **Paso 4: Prueba en el móvil del usuario**

Pedir al usuario que abra `https://mr-d0nut.github.io/bchess/` en su móvil y confirme cuatro
cosas:
1. que se ve como su imagen, pero en 3D y vivo;
2. el contador marca al menos 30 fps;
3. tocar una casilla lleva el peón hasta ella;
4. los tres botones funcionan.

Es el criterio de éxito del diseño.
