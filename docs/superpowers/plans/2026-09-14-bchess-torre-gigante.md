# La torre y su gigante de piedra — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las cuatro torres estén en el tablero y se conviertan en gigantes de piedra para moverse y pelear, que las piezas de alrededor les hagan sitio sin chocar y que las capturas con torre sean cortas y brutales.

**Architecture:** La torre es una pieza con dos formas en el mismo objeto: la torre estática con un banderín hecho en código y el gigante, una pieza con esqueleto y sin peana. Su mover encadena transformación, paseo y vuelta con el reloj de juego. Un módulo puro calcula dónde debe ponerse cada pieza para hacer sitio y cómo avanza sin chocar, y `crowd.js` lo aplica en cada fotograma. Las capturas con torre tienen su propio director (`smash.js`), que reutiliza los efectos, la cámara de cine y las medidas de golpes del combate entre peones.

**Tech Stack:** Three.js r186 en `vendor/three/`, módulos ES sin compilación, `node --test`, verificación por código en el panel de vista previa (servidor `bchess`, puerto 8741), Gemini y Tripo Studio en Chrome para los modelos, `@gltf-transform/cli` y `sharp` para los ficheros.

**Diseño:** `docs/superpowers/specs/2026-09-14-bchess-torre-gigante-design.md`.

## Global Constraints

- Sin compilación: módulos ES con import map; Three.js r186 copiado en `vendor/three/`.
- Textos de la interfaz y comentarios en castellano; commits en castellano terminados en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Tono de dibujos animados, sin sangre. Gana siempre el atacante.
- Medidas en casillas (1 casilla = 1 unidad). Torre: 1,75 de alto con su base. Gigante: 1,9.
- Hacer sitio: hueco mínimo de 0,03 entre piezas; como mucho 0,45 desde el centro de su casilla; 1,2 casillas por segundo como mucho; desvíos de hasta 60°; al andar, el gigante pide 0,8 casillas por delante.
- De torre a gigante, 1,2 s: temblor de 0,4 s, de 14 a 20 rocas y el gigante crece de 0,2 a 1 en 0,5 s. De gigante a torre, 1 s. Las rocas del suelo desaparecen en 1 s.
- Los dos colores, idénticos en forma: la versión negra de cada modelo es una retextura del modelo blanco; nunca se genera otro.
- Tripo: unos 220 créditos. Antes de pulsar, comprobar el coste que muestra cada botón. Esqueleto «v1.0 · humanoides» (el desplegable viene en «v2.5 · animales»). No compartir clips entre esqueletos. Al exportar, marcar las animaciones una a una y comprobar el contador.
- Nunca teclear contraseñas ni datos de pago. No tocar Tripo si el usuario está exportando o pagando.
- Se trabaja en la rama `torre-gigante`, porque `main` se publica sola en GitHub Pages. Se une a `main` al final.
- Los módulos que prueba `node --test` no importan `three` (en Node no hay import map).

---

## Estructura de ficheros

| Fichero | Tarea | Responsabilidad |
|---|---|---|
| `raw/ref/*.jpeg` | 1 | Imágenes de referencia (no se publican). |
| `tools/silhouette.mjs` | 1 | Caja de la silueta de una imagen, para comparar proporciones. |
| `assets/textures/flag-white.jpg`, `flag-black.jpg` | 1 | Telas de los banderines. |
| `assets/models/tower-*.glb`, `black-tower-*.glb` | 2 | Torres estáticas (ordenador y móvil). |
| `assets/models/giant-*.glb`, `black-giant-*.glb` | 3 | Gigantes con esqueleto; sus animaciones, en `giant-moves.glb` y `black-giant-moves.glb`. |
| `src/rules/rook.js`, `tests/rook.test.js` | 4 | `rookMoves`. |
| `tests/pawn.test.js` | 4 | Peones con torres en medio. |
| `src/moves/room.js`, `tests/room.test.js` | 5 | Puro: `roomClearance`, `roomTarget`, `stepRoom`. |
| `src/fx/rock.js`, `tests/rock.test.js` | 6 | Puro: `rockStep`. |
| `src/fx/rubble.js` | 6 | `createRubble`: `explode`, `implode`, `update`, `count`. |
| `src/combat/plan.js`, `tests/combat-plan.test.js` | 7 | `bestStrike`, `strikeSpot`. |
| `src/combat/strikes.js` | 7 | `measureBody`. |
| `src/pieces/piece.js` | 8 | Exporta `fitToHeight` y `withShadows`; piezas sin peana; `radius` y `height`. |
| `src/pieces/flag.js` | 8 | `flagTexture`, `createFlag`. |
| `src/pieces/rook.js` | 8 | `loadRookKit`, `spawnRook`. |
| `src/moves/rook-mover.js` | 8 y 9 | `createRookMover`. |
| `src/main.js` | 8, 9 y 10 | Piezas de dos tipos, torres, sitio y capturas. |
| `assets/models/manifest.json` | 8 y 9 | `white-rook` y `black-rook`. |
| `src/scene/cinema.js` | 9 | `settle`: el temblor no descoloca los controles. |
| `src/moves/transform.js` | 9 | `towerToGiant`, `giantToTower`. |
| `src/moves/crowd.js` | 9 | `createCrowd`: `claim`, `update`, `settle`, `obstacles`. |
| `src/combat/smash.js` | 10 | `canSmash`, `runSmash`. |
| `raw/tmp/verificar-torre.js`, `raw/tmp/verificar-captura-torre.js` | 9 y 10 | Comprobaciones por código (no se publican). |
| `README.md`, `index.html` | 11 | Documentación y título. |

Orden: las tareas 1 a 3 (modelos) y 4 a 7 (código puro) son independientes; mientras Tripo genera, se avanza con el código. La 8 necesita la 2; la 9 y la 10, la 3.

---

### Tarea 1: Imágenes de referencia y telas de los banderines

**Files:**
- Create (no se publican; `raw/` está en `.gitignore`): `raw/ref/gigante-blanco.jpeg`, `raw/ref/torre-blanca.jpeg`, `raw/ref/torre-negra.jpeg`, `raw/ref/gigante-negro.jpeg`, `raw/ref/bandera-blanca.jpeg`, `raw/ref/bandera-negra.jpeg`
- Create: `tools/silhouette.mjs`, `assets/textures/flag-white.jpg`, `assets/textures/flag-black.jpg`

**Interfaces:**
- Produces: `node tools/silhouette.mjs <imagen> [umbral]` imprime `{ file, width, height, box: { x, y, w, h }, ratio }`.
- Produces: las imágenes que suben a Tripo las tareas 2 y 3, y las telas que carga `loadRookKit` (tarea 8).

- [ ] **Paso 1: Rama de trabajo**

```bash
cd ~/bchess && git switch -c torre-gigante
```

- [ ] **Paso 2: Guardar el boceto aprobado**

Gemini descarga en `~/Downloads`; a veces el fichero sale primero oculto como `.com.google.Chrome.XXXX` y después se renombra a `Gemini_Generated_Image_….jpeg`. Se guarda la imagen más reciente:

```bash
bash -c 'f=$(find "$HOME/Downloads" -maxdepth 1 -type f -Btime -60m \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) -exec stat -f "%B %N" {} \; | sort -n | tail -1 | cut -d" " -f2-); sips -s format jpeg -s formatOptions 92 "$f" --out ~/bchess/raw/ref/gigante-blanco.jpeg'
```

Expected: `raw/ref/gigante-blanco.jpeg` de 2816 × 1536, con el gólem crema.

- [ ] **Paso 3: Herramienta de siluetas**

`tools/silhouette.mjs`:

```js
// Silueta de una imagen de referencia con fondo liso: la caja de los píxeles que se distinguen
// del color de la esquina. Sirve para comparar las proporciones de las versiones blanca y negra.
// Uso: node tools/silhouette.mjs imagen.jpeg [umbral]
// El umbral es la suma de diferencias en rojo, verde y azul (0-765); por defecto, 30.
import sharp from 'sharp';

const [file, thresholdArg] = process.argv.slice(2);
if (!file) {
  console.error('Uso: node tools/silhouette.mjs imagen.jpeg [umbral]');
  process.exit(1);
}
const threshold = Number(thresholdArg ?? 30);
const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const background = [data[0], data[1], data[2]];
let minX = width;
let minY = height;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * channels;
    const difference = Math.abs(data[i] - background[0]) + Math.abs(data[i + 1] - background[1]) + Math.abs(data[i + 2] - background[2]);
    if (difference <= threshold) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
}
const w = maxX - minX + 1;
const h = maxY - minY + 1;
console.log(JSON.stringify({ file, width, height, box: { x: minX, y: minY, w, h }, ratio: +(w / h).toFixed(3) }));
```

Run: `cd ~/bchess && node tools/silhouette.mjs raw/ref/peana.jpeg && node tools/silhouette.mjs raw/ref/peana-negra.jpeg`
Expected: dos líneas JSON con `ratio` parecidos (esas dos peanas ya se igualaron). Si falta `sharp`: `npm install --no-save sharp`.

- [ ] **Paso 4: Torre blanca aislada**

Gemini no tiene un `input[type=file]` fijo en la página. Para adjuntar una imagen local: abrirla en una pestaña de Chrome desde el servidor de desarrollo (`http://localhost:8741/raw/ref/…`), hacer una captura y soltarla con `upload_image` (arrastrar y soltar) sobre la caja de texto de Gemini. Enviar siempre con el botón de enviar: Intro no siempre envía.

En la conversación blanca, con `raw/ref/piezas_white_front.png` adjunta:

> Toma como referencia la torre de la imagen adjunta (la última figura, a la derecha). Genera UNA sola imagen de esa misma torre, idéntica en forma, piedra, almenas, matacanes, ventanas, zócalo de sillares y base octogonal, con estos cambios: sin bandera y sin mástil; vista de frente y un poco desde arriba, unos 15 grados; entera, centrada y con margen alrededor; luz de estudio suave y uniforme, sin sombras marcadas; fondo liso gris claro. Mismo estilo hiperrealista de figura pintada que la referencia.

Descargar a tamaño completo y guardar como `raw/ref/torre-blanca.jpeg` (orden del paso 2, cambiando el nombre de salida). Mirarla: la misma torre, sin bandera.

- [ ] **Paso 5: Torre negra**

En la conversación negra, con `raw/ref/torre-blanca.jpeg` y `raw/ref/piezas_black_front.png` adjuntas:

> Edita la primera imagen: es la misma torre, con exactamente la misma forma, tamaño, proporciones, encuadre, luz y fondo. Cambia solo los materiales para que sea la torre negra de la segunda imagen (la última figura): piedra gris muy oscura, casi negra; bandas y remates dorados en las almenas, en la cornisa y en la base; marcos rojos en las ventanas. Sin bandera y sin mástil.

Guardar como `raw/ref/torre-negra.jpeg`.

- [ ] **Paso 6: Gigante negro**

Con `raw/ref/gigante-blanco.jpeg` y `raw/ref/torre-negra.jpeg` adjuntas:

> Edita la primera imagen: es el mismo gigante de piedra, con exactamente la misma pose, forma, tamaño, proporciones, cara, encuadre, luz y fondo. Cambia solo los materiales para que combine con la torre negra de la segunda imagen: sillares de piedra gris muy oscura, casi negra, con bandas doradas en las almenas de la cabeza, en las hombreras y en el cinturón, y detalles rojos. La bandera de la espalda pasa a ser roja con un grifo dorado.

Guardar como `raw/ref/gigante-negro.jpeg`.

- [ ] **Paso 7: Comparar proporciones**

```bash
cd ~/bchess && for f in torre-blanca torre-negra gigante-blanco gigante-negro; do node tools/silhouette.mjs raw/ref/$f.jpeg; done
```

Expected: el `ratio` de cada versión negra está a menos de un 3 % del de su blanca. Si no, repetir la edición del paso 5 o 6 pidiendo expresamente las mismas proporciones.

- [ ] **Paso 8: Telas de los banderines**

Con `raw/ref/escudo.jpeg` adjunta:

> Genera UNA imagen de una tela de bandera plana, vista de frente, que llene toda la imagen, sin bordes ni fondo: tela color marfil con el león rampante azul del escudo adjunto en el centro, idéntico en forma y color. Textura de tela suave, sin arrugas marcadas, sin mástil y sin sombras. Formato apaisado.

Con `raw/ref/escudo-negro.jpeg`, la misma petición cambiando la tela: «tela roja con el grifo dorado del escudo adjunto en el centro». Guardarlas como `raw/ref/bandera-blanca.jpeg` y `raw/ref/bandera-negra.jpeg` y recortarlas:

```bash
cd ~/bchess && node --input-type=module -e "
import sharp from 'sharp';
for (const [from, to] of [['bandera-blanca', 'flag-white'], ['bandera-negra', 'flag-black']]) {
  const info = await sharp('raw/ref/' + from + '.jpeg').resize(512, 320, { fit: 'cover' }).jpeg({ quality: 85 }).toFile('assets/textures/' + to + '.jpg');
  console.log(to, info.width, info.height, info.size);
}"
```

Expected: `flag-white 512 320 …` y `flag-black 512 320 …`.

- [ ] **Paso 9: Commit**

```bash
git add tools/silhouette.mjs assets/textures/flag-white.jpg assets/textures/flag-black.jpg
git commit -m "Telas de los banderines y herramienta de siluetas" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 2: Torres en Tripo

**Files:**
- Create (no se publican): `raw/tripo/tower.glb`, `raw/tripo/black-tower.glb`
- Create: `assets/models/tower-ordenador.glb`, `assets/models/tower-movil.glb`, `assets/models/black-tower-ordenador.glb`, `assets/models/black-tower-movil.glb`

**Interfaces:**
- Consumes: `raw/ref/torre-blanca.jpeg` y `raw/ref/torre-negra.jpeg` (tarea 1).
- Produces: los GLB que `loadRookKit` carga desde `manifest.pieces['white-rook'].tower.files[quality.name]` (tarea 8).

- [ ] **Paso 1: Torre blanca**

En Tripo Studio, nuevo modelo a partir de `raw/ref/torre-blanca.jpeg` con «Modelo HD». El botón debe decir 55 créditos. Al terminar, revisar la vista previa de frente y desde arriba: una sola pieza, base octogonal, almenas con huecos y ventanas.

- [ ] **Paso 2: Descargar y comprobar**

Descargar en GLB, sin esqueleto, y copiar a `raw/tripo/tower.glb`:

```bash
cd ~/bchess && node -e "const b=require('fs').readFileSync(process.argv[1]); console.log(b.toString('ascii',0,4), b.readUInt32LE(8)===b.length ? 'completo' : 'INCOMPLETO')" raw/tripo/tower.glb
```

Expected: `glTF completo`.

- [ ] **Paso 3: Torre negra**

Sobre el mismo modelo blanco, «Texturizar» con la imagen `raw/ref/torre-negra.jpeg` (20 créditos). Descargar a `raw/tripo/black-tower.glb` y comprobarlo con la orden del paso 2.

- [ ] **Paso 4: Aligerar**

```bash
cd ~/bchess && npx --yes @gltf-transform/cli@4.5.0 inspect raw/tripo/tower.glb
```

Con el número de triángulos `T` que muestra, `ratio = 40000 / T` para el ordenador y `ratio_movil = 15000 / T` para el móvil, redondeados a tres decimales:

```bash
bash tools/optimize-model.sh raw/tripo/tower.glb tower <ratio> <ratio_movil>
bash tools/optimize-model.sh raw/tripo/black-tower.glb black-tower <ratio> <ratio_movil>
```

Expected: los cuatro ficheros; los de ordenador pesan menos de 2,5 MB y los de móvil, menos de 1 MB.

- [ ] **Paso 5: Commit**

```bash
git add assets/models/tower-ordenador.glb assets/models/tower-movil.glb assets/models/black-tower-ordenador.glb assets/models/black-tower-movil.glb
git commit -m "Modelos de las torres blanca y negra" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 3: Gigantes en Tripo y sus animaciones

**Files:**
- Create (no se publican): `raw/tripo/giant.glb`, `raw/tripo/giant-candidatas.glb`, `raw/tripo/black-giant.glb`, `raw/tripo/black-giant-candidatas.glb`
- Create: `assets/models/giant-ordenador.glb`, `giant-movil.glb`, `giant-moves.glb`, `black-giant-ordenador.glb`, `black-giant-movil.glb`, `black-giant-moves.glb`

**Interfaces:**
- Consumes: `raw/ref/gigante-blanco.jpeg` y `raw/ref/gigante-negro.jpeg` (tarea 1).
- Produces: gigantes con el esqueleto de Tripo (huesos `Hip`, `Head`, `L_Hand`, `R_Hand`, `L_ToeBase`, `R_ToeBase`), con `idle` y `walk` en el modelo y las demás claves en `*-moves.glb`. Las claves elegidas van a `giant.moves` del manifiesto (tarea 9).

- [ ] **Paso 1: Malla del gigante blanco**

Nuevo modelo desde `raw/ref/gigante-blanco.jpeg` con «Malla Smart» (65 créditos). Revisar la vista previa: gólem entero, cabeza de torreón, manos separadas del cuerpo y bandera en la espalda.

- [ ] **Paso 2: Textura**

«Texturizar» con la misma imagen (20 créditos).

- [ ] **Paso 3: Esqueleto**

Cambiar el desplegable a «v1.0 · humanoides» y después pulsar «Auto Rig» (20 créditos). Revisar que brazos y piernas siguen a sus huesos.

- [ ] **Paso 4: Candidatas de la biblioteca (gratis)**

Aplicar estas, si están, y buscar en la biblioteca otras más de gigante (pisotón, golpe al suelo, zombi, monstruo, rugido, pesado). Como mucho 14, apuntando la clave inglesa de cada una (el nombre de su miniatura `.avif`):
- andar pesado, si lo hay (además de `walk`);
- ataques: `box_03`, `box_01`, `front_kick_02` y los golpes pesados que aparezcan;
- golpe recibido: `hit_to_body_01`, `hit_to_stomach`;
- derrumbe: `defeat_03`, `fall`;
- provocación: `angry_01`, `angry_03`.

- [ ] **Paso 5: Exportar las candidatas**

«Exportar» en GLB con esqueleto y con «Animación en el sitio» desactivado. En «Número de animaciones» → «Elegir animaciones», marcar cada candidata (botones con `data-state="checked"`) y comprobar que el contador coincide. Descargar a `raw/tripo/giant-candidatas.glb` y comprobarlo con la orden de la tarea 2, paso 2.

- [ ] **Paso 6: Exportar el modelo base**

Otra exportación con solo `idle` y `walk` (al reabrir el diálogo, el contador vuelve a 0: marcarlas otra vez), a `raw/tripo/giant.glb`. Comprobarlo igual.

- [ ] **Paso 7: Elegir en la galería**

Abrir `http://localhost:8741/tools/anim-gallery.html`, escribir la ruta `../raw/tripo/giant-candidatas.glb` y pulsar «Cargar». En las hojas de frente y de perfil, elegir:
- ataques: 2, los que más avanzan con mano o pie y menos abren los pies;
- golpe recibido: 1 o 2, que no se salgan de su casilla;
- derrumbe: 1, cómico, que caiga en el sitio o hacia atrás;
- provocación: 1 o 2;
- andar: el pesado si parece de gigante; si no, `walk`.

- [ ] **Paso 8: Gigante negro**

Sobre la misma malla blanca: «Texturizar» con `raw/ref/gigante-negro.jpeg` (20 créditos), esqueleto «v1.0 · humanoides» (20 créditos), aplicar exactamente las claves elegidas y exportar igual que el blanco: `raw/tripo/black-giant.glb` (`idle` y `walk`) y `raw/tripo/black-giant-candidatas.glb` (las elegidas). Comprobar los dos ficheros.

- [ ] **Paso 9: Aligerar**

`<claves>` son las elegidas en el paso 7, separadas por comas; `idle` y `walk` no, porque ya van en el modelo:

```bash
bash tools/optimize-model.sh raw/tripo/giant.glb giant
bash tools/optimize-model.sh raw/tripo/black-giant.glb black-giant
bash tools/optimize-anims.sh raw/tripo/giant-candidatas.glb giant-moves <claves>
bash tools/optimize-anims.sh raw/tripo/black-giant-candidatas.glb black-giant-moves <claves>
```

Expected: `giant-ordenador.glb` y `black-giant-ordenador.glb` pesan menos de 3 MB; los `*-moves.glb`, menos de 600 KB.

- [ ] **Paso 10: Commit**

```bash
git add assets/models/giant-ordenador.glb assets/models/giant-movil.glb assets/models/giant-moves.glb assets/models/black-giant-ordenador.glb assets/models/black-giant-movil.glb assets/models/black-giant-moves.glb
git commit -m "Gigantes de piedra blanco y negro con sus animaciones" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 4: Reglas de la torre

**Files:**
- Create: `src/rules/rook.js`, `tests/rook.test.js`
- Modify: `tests/pawn.test.js`

**Interfaces:**
- Produces: `rookMoves(square: string, occupied: Set<string>, enemies: Set<string>) → { moves: string[], captures: string[] }`. Orden de las direcciones: arriba, abajo, derecha e izquierda.

- [ ] **Paso 1: Pruebas**

`tests/rook.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rookMoves } from '../src/rules/rook.js';

test('en un tablero vacío llega a los cuatro bordes', () => {
  assert.deepEqual(rookMoves('d4', new Set(['d4']), new Set()), {
    moves: ['d5', 'd6', 'd7', 'd8', 'd3', 'd2', 'd1', 'e4', 'f4', 'g4', 'h4', 'c4', 'b4', 'a4'],
    captures: [],
  });
});

test('una pieza propia la detiene justo antes', () => {
  assert.deepEqual(rookMoves('a1', new Set(['a1', 'a2', 'd1']), new Set()), { moves: ['b1', 'c1'], captures: [] });
});

test('come la primera pieza enemiga de cada dirección, no las de detrás', () => {
  assert.deepEqual(
    rookMoves('a1', new Set(['a1', 'a4', 'a5', 'c1']), new Set(['a4', 'a5', 'c1'])),
    { moves: ['a2', 'a3', 'b1'], captures: ['a4', 'c1'] },
  );
});

test('desde una esquina no se sale del tablero', () => {
  assert.deepEqual(rookMoves('h8', new Set(['h8']), new Set()), {
    moves: ['h7', 'h6', 'h5', 'h4', 'h3', 'h2', 'h1', 'g8', 'f8', 'e8', 'd8', 'c8', 'b8', 'a8'],
    captures: [],
  });
});

test('una casilla no válida lanza error', () => {
  assert.throws(() => rookMoves('i9', new Set(), new Set()), /Casilla no válida/);
});
```

Al final de `tests/pawn.test.js`:

```js
test('las torres bloquean a los peones y se pueden comer en diagonal', () => {
  assert.deepEqual(pawnMoves('a7', new Set(['a7', 'a6']), 'black'), []);
  assert.deepEqual(pawnCaptures('b2', new Set(['a3', 'c3']), 'white'), ['a3', 'c3']);
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd ~/bchess && node --test tests/rook.test.js tests/pawn.test.js`
Expected: `rook.test.js` falla con `ERR_MODULE_NOT_FOUND`. La prueba nueva de `pawn.test.js` pasa ya: las reglas del peón no distinguen tipos de pieza, y la prueba lo deja escrito.

- [ ] **Paso 3: Implementación**

`src/rules/rook.js`:

```js
// Movimientos de la torre: en línea recta, en horizontal o en vertical, hasta el borde del
// tablero o hasta la primera pieza. Si esa pieza es enemiga, puede comérsela.

const FILES = 'abcdefgh';
const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]]; // [columnas, filas]: arriba, abajo, derecha, izquierda

// `occupied`: casillas con alguna pieza; `enemies`: las que ocupan piezas del otro bando.
export function rookMoves(square, occupied, enemies) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const moves = [];
  const captures = [];
  for (const [df, dr] of DIRECTIONS) {
    for (let f = file + df, r = rank + dr; f >= 0 && f < 8 && r >= 1 && r <= 8; f += df, r += dr) {
      const target = FILES[f] + r;
      if (occupied.has(target) || enemies.has(target)) {
        if (enemies.has(target)) captures.push(target);
        break;
      }
      moves.push(target);
    }
  }
  return { moves, captures };
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

- [ ] **Paso 5: Commit**

```bash
git add src/rules/rook.js tests/rook.test.js tests/pawn.test.js
git commit -m "Reglas de movimiento y captura de la torre" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 5: Hacer sitio

**Files:**
- Create: `src/moves/room.js`, `tests/room.test.js`

**Interfaces:**
- Produces:
  - constantes `ROOM_GAP = 0.03`, `MAX_SHIFT = 0.45`, `SLIDE_SPEED = 1.2`, `SLIDE_ACCEL = 6`;
  - `roomClearance(x, z, radius, bodies) → number`, negativo si la pieza no deja sitio;
  - `roomTarget(piece: { home: {x, z}, radius }, bodies, others = []) → { x, z }`, el desplazamiento respecto al centro de su casilla;
  - `stepRoom(pieces: { home, radius, offset: {x, z}, speed, target: {x, z} }[], fixed: { x, z, radius }[], dt)`, que modifica `offset` y `speed`.
- Un cuerpo es `{ from: {x, z}, to: {x, z}, radius }`: un tramo con grosor (si `from` = `to`, un círculo).

- [ ] **Paso 1: Pruebas**

`tests/room.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SHIFT, ROOM_GAP, SLIDE_ACCEL, SLIDE_SPEED, roomClearance, roomTarget, stepRoom } from '../src/moves/room.js';

const circle = (x, z, radius) => ({ from: { x, z }, to: { x, z }, radius });
const slot = (x, z, offset = { x: 0, z: 0 }, target = { x: 0, z: 0 }) => ({
  home: { x, z }, radius: 0.4, offset: { ...offset }, speed: 0, target: { ...target },
});
const gap = (a, b) => Math.hypot(
  a.home.x + a.offset.x - b.home.x - b.offset.x,
  a.home.z + a.offset.z - b.home.z - b.offset.z,
) - a.radius - b.radius;

test('sin cuerpos, o si ya le dejan sitio, se queda en el centro de su casilla', () => {
  assert.deepEqual(roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, []), { x: 0, z: 0 });
  assert.deepEqual(roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, [circle(0, 0, 0.5)]), { x: 0, z: 0 });
});

test('se aleja del gigante lo justo para dejar el hueco mínimo', () => {
  const bodies = [circle(0, 0, 0.7)];
  const target = roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, bodies);
  assert.ok(Math.abs(target.x) < 1e-9);
  assert.ok(target.z >= 0.13 - 1e-9 && target.z <= 0.14 + 1e-9, `z = ${target.z}`);
  assert.ok(roomClearance(target.x, 1 + target.z, 0.4, bodies) >= 0);
});

test('ante el tramo por el que anda el gigante, se aparta de lado', () => {
  const walk = { from: { x: 0, z: 0 }, to: { x: 3, z: 0 }, radius: 0.7 };
  const target = roomTarget({ home: { x: 2, z: 1 }, radius: 0.4 }, [walk]);
  assert.ok(Math.abs(target.x) < 1e-9 && target.z > 0.12, JSON.stringify(target));
});

test('nunca se aleja más de MAX_SHIFT', () => {
  const target = roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, [circle(0, 0, 1.2)]);
  assert.ok(Math.hypot(target.x, target.z) <= MAX_SHIFT + 1e-9);
  assert.ok(target.z > MAX_SHIFT - 0.011);
});

test('si detrás hay otra pieza, se desvía sin acercarse a ella', () => {
  const behind = { x: 0, z: 2, radius: 0.4 };
  const target = roomTarget({ home: { x: 0, z: 1 }, radius: 0.4 }, [circle(0, 0, 0.9)], [behind]);
  assert.ok(Math.abs(target.x) > 0.1, `x = ${target.x}`);
  assert.ok(target.z > 0);
  assert.ok(Math.hypot(target.x - behind.x, 1 + target.z - behind.z) >= 0.8 + ROOM_GAP - 1e-9);
});

test('un paso nunca deja dos piezas a menos del hueco mínimo', () => {
  const a = slot(0, 0, { x: 0, z: 0 }, { x: 0.3, z: 0 });
  const b = slot(1, 0, { x: 0, z: 0 }, { x: -0.3, z: 0 });
  for (let frame = 0; frame < 120; frame++) {
    stepRoom([a, b], [], 1 / 60);
    assert.ok(gap(a, b) >= ROOM_GAP - 1e-9, `hueco ${gap(a, b)} en el fotograma ${frame}`);
  }
  assert.ok(a.offset.x > 0.05);
});

test('no se acerca a una pieza fija que ya estaba cerca, pero puede alejarse de ella', () => {
  const fixed = [{ x: 0.75, z: 0, radius: 0.4 }];
  const toward = slot(0, 0, { x: 0, z: 0 }, { x: 0.3, z: 0 });
  stepRoom([toward], fixed, 1 / 60);
  assert.equal(toward.offset.x, 0);
  const away = slot(0, 0, { x: 0, z: 0 }, { x: -0.3, z: 0 });
  for (let frame = 0; frame < 30; frame++) stepRoom([away], fixed, 1 / 60);
  assert.ok(away.offset.x < -0.1);
});

test('vuelve exactamente al centro de su casilla', () => {
  const piece = slot(0, 0, { x: 0.2, z: -0.1 });
  for (let frame = 0; frame < 90; frame++) stepRoom([piece], [], 1 / 60);
  assert.deepEqual(piece.offset, { x: 0, z: 0 });
});

test('arranca poco a poco y nunca pasa de la velocidad máxima', () => {
  const dt = 1 / 60;
  const piece = slot(0, 0, { x: 0, z: 0 }, { x: 0.35, z: 0 });
  stepRoom([piece], [], dt);
  assert.ok(piece.offset.x <= SLIDE_ACCEL * dt * dt + 1e-12);
  let last = piece.offset.x;
  for (let frame = 0; frame < 60; frame++) {
    stepRoom([piece], [], dt);
    assert.ok(piece.offset.x - last <= SLIDE_SPEED * dt + 1e-12);
    last = piece.offset.x;
  }
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd ~/bchess && node --test tests/room.test.js`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (`src/moves/room.js`).

- [ ] **Paso 3: Implementación**

`src/moves/room.js`:

```js
// Hacer sitio a los gigantes (diseño, sección 6). Todo puro y en casillas: dónde debe ponerse cada
// pieza para dejar sitio (`roomTarget`) y cómo avanza hacia allí sin chocar con nadie
// (`stepRoom`). Un cuerpo que pide sitio es un tramo { from, to } con grosor `radius`; si
// from = to, un círculo.

export const ROOM_GAP = 0.03; // hueco mínimo entre los bordes de dos piezas
export const MAX_SHIFT = 0.45; // lo más que se aleja una pieza del centro de su casilla
export const SLIDE_SPEED = 1.2; // casillas por segundo
export const SLIDE_ACCEL = 6; // casillas por segundo², para arrancar con suavidad
const SLIDE_GAIN = 8; // al llegar frena: la velocidad no pasa de lo que falta × SLIDE_GAIN
const SNAP = 0.004; // más cerca del objetivo que esto, llega de golpe
const SAMPLE = 0.01; // paso con el que se tantea cada dirección
const DETOURS = [0, 20, -20, 40, -40, 60, -60].map((degrees) => (degrees * Math.PI) / 180);

function closestOnSegment(from, to, x, z) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / length2)) : 0;
  return { x: from.x + dx * t, z: from.z + dz * t };
}

// Holgura de una pieza de radio `radius` en (x, z) con los cuerpos: negativa si no les deja sitio.
export function roomClearance(x, z, radius, bodies) {
  let clearance = Infinity;
  for (const body of bodies) {
    const near = closestOnSegment(body.from, body.to, x, z);
    clearance = Math.min(clearance, Math.hypot(x - near.x, z - near.z) - body.radius - radius - ROOM_GAP);
  }
  return clearance;
}

function fits(x, z, radius, others) {
  return others.every((other) => Math.hypot(x - other.x, z - other.z) >= other.radius + radius + ROOM_GAP);
}

// Desplazamiento { x, z }, respecto al centro de su casilla (`piece.home`), al que debe ir una
// pieza para dejar sitio a `bodies` sin acercarse demasiado a `others` ({ x, z, radius }). Se aleja
// del cuerpo que más la aprieta; si por ahí choca con otra pieza, prueba a desviarse. Si no hay
// hueco suficiente, elige lo que más sitio deja.
export function roomTarget(piece, bodies, others = []) {
  const { home, radius } = piece;
  if (!bodies.length || roomClearance(home.x, home.z, radius, bodies) >= 0) return { x: 0, z: 0 };
  let away = null;
  for (const body of bodies) {
    const near = closestOnSegment(body.from, body.to, home.x, home.z);
    const distance = Math.hypot(home.x - near.x, home.z - near.z);
    const deficit = body.radius + radius + ROOM_GAP - distance;
    if (distance > 1e-6 && (!away || deficit > away.deficit)) {
      away = { deficit, angle: Math.atan2(home.x - near.x, home.z - near.z) };
    }
  }
  if (!away) return { x: 0, z: 0 };
  let best = null;
  for (const detour of DETOURS) {
    const dx = Math.sin(away.angle + detour);
    const dz = Math.cos(away.angle + detour);
    let reached = null;
    for (let i = 1; i <= Math.round(MAX_SHIFT / SAMPLE); i++) {
      const shift = i * SAMPLE;
      const x = home.x + dx * shift;
      const z = home.z + dz * shift;
      if (!fits(x, z, radius, others)) break;
      reached = { x: dx * shift, z: dz * shift, clearance: roomClearance(x, z, radius, bodies) };
      if (reached.clearance >= 0) return { x: reached.x, z: reached.z };
    }
    if (reached && (!best || reached.clearance > best.clearance)) best = reached;
  }
  return best ? { x: best.x, z: best.z } : { x: 0, z: 0 };
}

// ¿Puede la pieza pasar al desplazamiento (x, z)? Sí, si queda a ROOM_GAP de todas las demás o, de
// las que ya tenía más cerca, no se acerca más.
function free(piece, x, z, pieces, fixed) {
  const nx = piece.home.x + x;
  const nz = piece.home.z + z;
  const cx = piece.home.x + piece.offset.x;
  const cz = piece.home.z + piece.offset.z;
  const clearOf = (ox, oz, otherRadius) => {
    const after = Math.hypot(nx - ox, nz - oz);
    return after >= piece.radius + otherRadius + ROOM_GAP || after >= Math.hypot(cx - ox, cz - oz);
  };
  for (const other of pieces) {
    if (other !== piece && !clearOf(other.home.x + other.offset.x, other.home.z + other.offset.z, other.radius)) return false;
  }
  return fixed.every((other) => clearOf(other.x, other.z, other.radius));
}

// Avanza un fotograma de `dt` segundos cada pieza hacia su objetivo: acelera poco a poco hasta
// SLIDE_SPEED y frena al llegar. Da el paso entero, o la mitad, o un cuarto, solo si `free` lo
// permite; las piezas se mueven de una en una, así que ninguna choca aunque se muevan varias.
export function stepRoom(pieces, fixed, dt) {
  for (const piece of pieces) {
    const dx = piece.target.x - piece.offset.x;
    const dz = piece.target.z - piece.offset.z;
    const distance = Math.hypot(dx, dz);
    if (distance === 0) {
      piece.speed = 0;
      continue;
    }
    if (distance <= SNAP) {
      if (free(piece, piece.target.x, piece.target.z, pieces, fixed)) {
        piece.offset.x = piece.target.x;
        piece.offset.z = piece.target.z;
      }
      piece.speed = 0;
      continue;
    }
    const speed = Math.min(SLIDE_SPEED, distance * SLIDE_GAIN, piece.speed + SLIDE_ACCEL * dt);
    const length = Math.min(distance, speed * dt);
    piece.speed = 0;
    for (const k of [1, 0.5, 0.25]) {
      const x = piece.offset.x + (dx / distance) * length * k;
      const z = piece.offset.z + (dz / distance) * length * k;
      if (!free(piece, x, z, pieces, fixed)) continue;
      piece.offset.x = x;
      piece.offset.z = z;
      piece.speed = speed * k;
      break;
    }
  }
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

- [ ] **Paso 5: Commit**

```bash
git add src/moves/room.js tests/room.test.js
git commit -m "Cálculo puro para que las piezas hagan sitio sin chocar" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 6: Rocas

**Files:**
- Create: `src/fx/rock.js`, `tests/rock.test.js`, `src/fx/rubble.js`

**Interfaces:**
- Produces: `rockStep(rock: { position, velocity, radius, bounces, resting }, dt, obstacles: { x, z, radius, height }[] = []) → rock`, que modifica la roca.
- Produces: `createRubble(scene) → { explode(center, { color, count, height, obstacles }), implode(center, { color, count, seconds }), update(dt), count }`. `obstacles` es una función que devuelve los cilindros de las piezas.

- [ ] **Paso 1: Pruebas**

`tests/rock.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rockStep } from '../src/fx/rock.js';

const rock = (position, velocity) => ({ position, velocity, radius: 0.05, bounces: 0, resting: false });

test('cae, rebota una vez en el tablero y se queda quieta', () => {
  const r = rock({ x: 0, y: 1, z: 0 }, { x: 1, y: 2, z: 0 });
  let highestAfterBounce = 0;
  for (let frame = 0; frame < 240; frame++) {
    rockStep(r, 1 / 60);
    if (r.bounces === 1) highestAfterBounce = Math.max(highestAfterBounce, r.position.y);
  }
  assert.equal(r.bounces, 1);
  assert.equal(r.resting, true);
  assert.equal(r.position.y, 0.05);
  assert.ok(highestAfterBounce < 0.5, `rebote de ${highestAfterBounce}`);
});

test('rebota en una pieza en vez de atravesarla', () => {
  const r = rock({ x: 0, y: 0.5, z: 0 }, { x: 3, y: 0, z: 0 });
  const piece = { x: 1, z: 0, radius: 0.4, height: 1.6 };
  for (let frame = 0; frame < 60; frame++) {
    rockStep(r, 1 / 60, [piece]);
    assert.ok(Math.hypot(r.position.x - piece.x, r.position.z - piece.z) >= piece.radius + r.radius - 1e-9);
  }
  assert.ok(r.velocity.x <= 0);
});

test('pasa por encima de las piezas más bajas que ella', () => {
  const r = rock({ x: 0, y: 1.2, z: 0 }, { x: 3, y: 0, z: 0 });
  rockStep(r, 0.2, [{ x: 0.6, z: 0, radius: 0.4, height: 0.5 }]);
  assert.ok(r.position.x > 0.55);
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd ~/bchess && node --test tests/rock.test.js`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` (`src/fx/rock.js`).

- [ ] **Paso 3: Física de la roca**

`src/fx/rock.js`:

```js
// Física de una roca de dibujos animados, pura y en casillas: cae con gravedad, rebota una vez
// en el tablero y rebota en las piezas en vez de atravesarlas.

export const GRAVITY = 9;
const BOUNCE = 0.35; // velocidad vertical que conserva al rebotar en el tablero
const FRICTION = 0.5; // velocidad horizontal que conserva al rebotar en el tablero
const WALL_BOUNCE = 0.3; // velocidad que conserva al rebotar en una pieza
const MIN_BOUNCE = 0.5; // más despacio que esto, ya no rebota

// Un fotograma de una roca { position, velocity, radius, bounces, resting }, que se modifica.
// `obstacles`: cilindros de las piezas { x, z, radius, height }.
export function rockStep(rock, dt, obstacles = []) {
  if (rock.resting) return rock;
  const { position, velocity } = rock;
  velocity.y -= GRAVITY * dt;
  position.x += velocity.x * dt;
  position.y += velocity.y * dt;
  position.z += velocity.z * dt;
  for (const obstacle of obstacles) {
    if (position.y - rock.radius > obstacle.height) continue;
    const dx = position.x - obstacle.x;
    const dz = position.z - obstacle.z;
    const distance = Math.hypot(dx, dz);
    const minimum = obstacle.radius + rock.radius;
    if (distance >= minimum || distance < 1e-6) continue;
    const nx = dx / distance;
    const nz = dz / distance;
    position.x = obstacle.x + nx * minimum;
    position.z = obstacle.z + nz * minimum;
    const along = velocity.x * nx + velocity.z * nz;
    if (along < 0) {
      velocity.x -= (1 + WALL_BOUNCE) * along * nx;
      velocity.z -= (1 + WALL_BOUNCE) * along * nz;
    }
  }
  if (position.y <= rock.radius) {
    position.y = rock.radius;
    if (rock.bounces === 0 && velocity.y < -MIN_BOUNCE) {
      velocity.y *= -BOUNCE;
      velocity.x *= FRICTION;
      velocity.z *= FRICTION;
      rock.bounces = 1;
    } else {
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
      rock.resting = true;
    }
  }
  return rock;
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

- [ ] **Paso 5: Rocas en la escena**

`src/fx/rubble.js`:

```js
import * as THREE from 'three';
import { rockStep } from './rock.js';

// Rocas hechas en código: salen despedidas, caen, rebotan (en el tablero y en las piezas) y, un
// rato después, encogen hasta desaparecer. O vuelan desde el suelo hacia un punto, encogiendo,
// cuando la torre se rehace.

const LINGER = 0.6; // segundos quietas en el suelo antes de encoger
const SHRINK = 1; // segundos que tardan en desaparecer
const SHAPES = [[1, 0.7, 0.9], [0.8, 1, 0.75], [1.1, 0.8, 1]]; // escalas de las tres formas de roca

export function createRubble(scene) {
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const materials = new Map();
  const rocks = [];

  function material(color, shade) {
    const key = `${color}:${shade}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({
        color: new THREE.Color(color).multiplyScalar(shade),
        roughness: 0.95,
        metalness: 0,
        flatShading: true,
      }));
    }
    return materials.get(key);
  }

  function addMesh(color, size, i) {
    const mesh = new THREE.Mesh(geometry, material(color, i % 2 ? 0.78 : 1));
    const [sx, sy, sz] = SHAPES[i % SHAPES.length];
    const scale = new THREE.Vector3(sx * size, sy * size, sz * size);
    mesh.scale.copy(scale);
    mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    mesh.castShadow = true;
    scene.add(mesh);
    return { mesh, scale };
  }

  // Estalla en `center` ({x, z}): rocas repartidas en todo el alto (`height`) que salen hacia
  // fuera. `obstacles()` devuelve las piezas en las que rebotan.
  function explode(center, { color, count = 18, height = 1.6, obstacles = () => [] }) {
    for (let i = 0; i < count; i++) {
      const size = 0.05 + Math.random() * 0.07;
      const angle = Math.random() * Math.PI * 2;
      const from = 0.1 + Math.random() * 0.2;
      const out = 0.7 + Math.random() * 1.1;
      rocks.push({
        ...addMesh(color, size, i),
        obstacles,
        age: 0,
        restAge: null,
        body: {
          position: { x: center.x + Math.sin(angle) * from, y: 0.15 + Math.random() * height, z: center.z + Math.cos(angle) * from },
          velocity: { x: Math.sin(angle) * out, y: 1 + Math.random() * 2.2, z: Math.cos(angle) * out },
          radius: size,
          bounces: 0,
          resting: false,
        },
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        spinSpeed: 5 + Math.random() * 7,
      });
    }
  }

  // Rocas que vuelan desde el suelo, alrededor de `center`, hasta él en `seconds`, encogiendo.
  function implode(center, { color, count = 14, seconds = 0.4 }) {
    for (let i = 0; i < count; i++) {
      const size = 0.05 + Math.random() * 0.06;
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.35 + Math.random() * 0.2;
      rocks.push({
        ...addMesh(color, size, i),
        age: 0,
        gather: {
          from: new THREE.Vector3(center.x + Math.sin(angle) * distance, size, center.z + Math.cos(angle) * distance),
          to: new THREE.Vector3(center.x, 0.3 + Math.random() * 0.9, center.z),
          arc: 0.3 + Math.random() * 0.4,
          seconds,
        },
      });
    }
  }

  function remove(i) {
    scene.remove(rocks[i].mesh);
    rocks.splice(i, 1);
  }

  function update(dt) {
    const lists = new Map(); // cada lista de obstáculos se pide una vez por fotograma
    for (let i = rocks.length - 1; i >= 0; i--) {
      const rock = rocks[i];
      rock.age += dt;
      if (rock.gather) {
        const { from, to, arc, seconds } = rock.gather;
        const t = Math.min(1, rock.age / seconds);
        rock.mesh.position.lerpVectors(from, to, t);
        rock.mesh.position.y += Math.sin(Math.PI * t) * arc;
        rock.mesh.scale.copy(rock.scale).multiplyScalar(Math.max(0.001, 1 - t * t));
        if (t >= 1) remove(i);
        continue;
      }
      if (!lists.has(rock.obstacles)) lists.set(rock.obstacles, rock.obstacles());
      rockStep(rock.body, dt, lists.get(rock.obstacles));
      const { position } = rock.body;
      rock.mesh.position.set(position.x, position.y, position.z);
      if (!rock.body.resting) {
        rock.mesh.rotateOnAxis(rock.spin, rock.spinSpeed * dt);
        continue;
      }
      rock.restAge ??= rock.age;
      const k = (rock.age - rock.restAge - LINGER) / SHRINK;
      if (k > 0) rock.mesh.scale.copy(rock.scale).multiplyScalar(Math.max(0.001, 1 - k));
      if (k >= 1) remove(i);
    }
  }

  return {
    explode,
    implode,
    update,
    get count() {
      return rocks.length;
    },
  };
}
```

`rubble.js` se comprueba en el navegador en la tarea 9.

- [ ] **Paso 6: Commit**

```bash
git add src/fx/rock.js tests/rock.test.js src/fx/rubble.js
git commit -m "Rocas que salen despedidas, rebotan y desaparecen" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 7: Golpes y cuerpo del gigante

**Files:**
- Modify: `src/combat/plan.js`, `tests/combat-plan.test.js`, `src/combat/strikes.js`

**Interfaces:**
- Produces: `bestStrike(attacks: { key }[], strikes) → string | null`, el golpe con mano o pie que más alcanza.
- Produces: `strikeSpot(from, to, { reach, torso = TORSO, closest = 0 }) → { attacker: {x, z}, attackerFacing, defenderFacing, distance }`.
- Produces: `measureBody(kit, spawnPiece) → { walk, fight, margin, torso }`, en casillas:
  - `walk`: radio en reposo y al andar;
  - `fight`: radio al pelear, sin contar lo que avanza hacia delante;
  - `margin`: lo que la malla sobresale de los huesos;
  - `torso`: del centro al pecho.

- [ ] **Paso 1: Pruebas**

En `tests/combat-plan.test.js`, añadir `bestStrike` y `strikeSpot` al `import` de `../src/combat/plan.js` y, al final:

```js
test('bestStrike: el golpe con mano o pie que más alcanza', () => {
  const attacks = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const strikes = { a: { body: { reach: 0.5 } }, b: { body: { reach: 0.9 } }, c: { body: null } };
  assert.equal(bestStrike(attacks, strikes), 'b');
  assert.equal(bestStrike([{ key: 'c' }], strikes), null);
});

test('strikeSpot: se para donde su golpe llega al pecho del rival', () => {
  const spot = strikeSpot({ x: 0, z: 0 }, { x: 3, z: 0 }, { reach: 0.8, torso: 0.17 });
  assert.ok(Math.abs(spot.attacker.x - 2.03) < 1e-9);
  assert.equal(spot.attacker.z, 0);
  assert.ok(Math.abs(spot.distance - 0.97) < 1e-9);
  assert.equal(spot.attackerFacing, Math.PI / 2);
  assert.equal(spot.defenderFacing, -Math.PI / 2);
});

test('strikeSpot: si ya le llega, golpea desde donde está, y nunca se acerca más de closest', () => {
  assert.deepEqual(strikeSpot({ x: 0, z: 0 }, { x: 1, z: 0 }, { reach: 0.9, torso: 0.17 }).attacker, { x: 0, z: 0 });
  const close = strikeSpot({ x: 0, z: 0 }, { x: 3, z: 0 }, { reach: 0.3, torso: 0.17, closest: 0.75 });
  assert.ok(Math.abs(close.attacker.x - 2.25) < 1e-9);
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd ~/bchess && node --test tests/combat-plan.test.js`
Expected: FAIL: `bestStrike` y `strikeSpot` no existen.

- [ ] **Paso 3: Implementación**

Al final de `src/combat/plan.js`:

```js
// Clave del golpe con mano o pie que más lejos llega por delante, o null si no hay ninguno medido.
export function bestStrike(attacks, strikes) {
  let best = null;
  for (const attack of attacks) {
    const body = strikes[attack.key]?.body;
    if (body && (!best || body.reach > strikes[best].body.reach)) best = attack.key;
  }
  return best;
}

// Dónde se para quien golpea con la mano o el pie para que el golpe, que le llega a `reach` por
// delante, alcance el pecho de un rival que lo tiene a `torso` de su centro, sin acercarse a menos
// de `closest`. Si desde `from` ya le llega, no se mueve. `from` y `to` son centros {x, z}.
export function strikeSpot(from, to, { reach, torso = TORSO, closest = 0 }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  const ux = dx / length;
  const uz = dz / length;
  const distance = Math.min(length, Math.max(reach + torso, closest));
  return {
    attacker: { x: to.x - ux * distance, z: to.z - uz * distance },
    attackerFacing: Math.atan2(ux, uz),
    defenderFacing: Math.atan2(-ux, -uz),
    distance,
  };
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

- [ ] **Paso 5: Medidas del cuerpo**

Al final de `src/combat/strikes.js` (se comprueban en el navegador en la tarea 9):

```js
const BODY_FPS = 30;
const MIN_MARGIN = 0.05;

// Hasta dónde llegan en horizontal, desde el centro de la figura, los huesos de una pieza de
// prueba al hacer todas las versiones de `actions`. Con `front: false`, lo que queda por delante
// (+Z) solo cuenta hacia los lados, porque ahí está el rival.
function reachOf(kit, spawnPiece, actions, { front = true } = {}) {
  const piece = spawnPiece(kit);
  piece.placeAt({ x: 0, z: 0 });
  piece.figure.position.y = 0;
  piece.face(0);
  const bones = [];
  piece.object.traverse((o) => { if (o.isBone) bones.push(o); });
  const point = new THREE.Vector3();
  let reach = 0;
  for (const action of actions) {
    for (const variant of kit.moves[action] ?? []) {
      const running = piece.play(action, { loop: false, fade: 0, clip: variant.key });
      if (!running) continue;
      const frames = Math.ceil(running.getClip().duration * BODY_FPS);
      for (let frame = 0; frame <= frames; frame++) {
        piece.update(1 / BODY_FPS);
        piece.object.updateMatrixWorld(true);
        for (const bone of bones) {
          bone.getWorldPosition(point);
          reach = Math.max(reach, Math.hypot(point.x, front || point.z < 0 ? point.z : 0));
        }
      }
    }
  }
  return reach;
}

// Medidas del cuerpo de un gigante, una vez por tipo de pieza. `margin` compara la malla con los
// huesos en la postura de reposo del esqueleto; `torso` es donde un rayo horizontal a media altura
// toca su pecho.
export function measureBody(kit, spawnPiece) {
  kit.model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(kit.model);
  const point = new THREE.Vector3();
  let boneRadius = 0;
  kit.model.traverse((o) => {
    if (!o.isBone) return;
    o.getWorldPosition(point);
    boneRadius = Math.max(boneRadius, Math.hypot(point.x, point.z));
  });
  const meshRadius = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
  const margin = Math.max(MIN_MARGIN, meshRadius - boneRadius);
  const chest = new THREE.Raycaster(new THREE.Vector3(0, kit.spec.height * 0.55, 5), new THREE.Vector3(0, 0, -1));
  const hit = chest.intersectObject(kit.model, true)[0];
  return {
    walk: reachOf(kit, spawnPiece, ['idle', 'walk']) + margin,
    fight: reachOf(kit, spawnPiece, ['idle', 'attack', 'hit', 'taunt'], { front: false }) + margin,
    margin,
    torso: hit ? Math.max(0.1, hit.point.z) : 0.3,
  };
}
```

- [ ] **Paso 6: Commit**

```bash
git add src/combat/plan.js tests/combat-plan.test.js src/combat/strikes.js
git commit -m "Colocación para golpear y medidas del cuerpo del gigante" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 8: Las torres en el tablero

**Files:**
- Modify: `src/pieces/piece.js`, `assets/models/manifest.json`, `src/main.js` (fichero completo)
- Create: `src/pieces/flag.js`, `src/pieces/rook.js`, `src/moves/rook-mover.js`

**Interfaces:**
- Consumes: `rookMoves` (tarea 4), `measureStrikes`, `measureBody` (tarea 7), las torres de la tarea 2 y las telas de la tarea 1.
- Produces:
  - `piece.js` exporta `fitToHeight(object, height)` y `withShadows(object)`. Con `spec.pedestal === false`, la pieza no tiene peana (`pedestalHeight = 0`). Las piezas añaden `radius` (el de su peana, o el de la figura si no tiene) y `height` (figura más peana).
  - `flagTexture(image | null) → THREE.CanvasTexture` y `createFlag({ texture, poleHeight = 0.5 }) → { object, update(dt) }`.
  - `loadRookKit(spec, quality) → { spec, tower, radius, roof, giant, flagTexture }`, con `giant.strikes` y `giant.body` medidos.
  - `spawnRook(kit)` devuelve:
    - `{ object, tower, giant, hitbox, radius, height, stone, body }`;
    - `figure`: el gigante, o la torre si no hay gigante;
    - `placeAt(position)`, `face(angle)`, `update(dt)`.
  - `createRookMover({ rook, board, dust, clock, onBusy, restFacing }) → { placeOn, goTo, vanish, square, busy }`.
  - En `main.js`, cada entrada de `pieces` es `{ kind: 'pawn' | 'rook', color, piece, mover }`. `window.bchess` tiene `pieces`, `pawns` y `rooks`.

- [ ] **Paso 1: Piezas sin peana, radio y alto**

En `src/pieces/piece.js`:

1. `function fitToHeight(object, height) {` pasa a `export function fitToHeight(object, height) {`, y `function withShadows(object) {` a `export function withShadows(object) {`.
2. Sustituir:

```js
  const pedestalHeight = spec.pedestalModel?.height ?? FALLBACK_PEDESTAL_HEIGHT;
  const pedestal = pedestalGltf ? withShadows(pedestalGltf.scene) : createFallbackPedestal(pedestalHeight);
  fitToHeight(pedestal, pedestalHeight);
```

por:

```js
  // Con `pedestal: false` (el gigante), sin peana: los pies, en el tablero.
  const standsOnBoard = spec.pedestal === false;
  const pedestalHeight = standsOnBoard ? 0 : spec.pedestalModel?.height ?? FALLBACK_PEDESTAL_HEIGHT;
  let pedestal = new THREE.Group();
  if (!standsOnBoard) {
    pedestal = pedestalGltf ? withShadows(pedestalGltf.scene) : createFallbackPedestal(pedestalHeight);
    fitToHeight(pedestal, pedestalHeight);
  }
  // Radio de la pieza en el tablero (el de su peana, o el de la figura), para hacer sitio.
  const footprint = new THREE.Box3().setFromObject(standsOnBoard ? model : pedestal);
  const radius = Math.max(footprint.max.x - footprint.min.x, footprint.max.z - footprint.min.z) / 2;
```

3. Sustituir:

```js
  for (const action of ['idle', 'walk', 'attack', 'hit', 'fall']) {
    if (!moves[action].length) console.warn(`[BChess] La pieza no tiene animación «${action}». Clips: ${clipNames.join(', ') || '(ninguno)'}`);
  }
```

por:

```js
  for (const action of ['idle', 'walk', 'attack', 'hit']) {
    if (!moves[action].length) console.warn(`[BChess] La pieza no tiene animación «${action}». Clips: ${clipNames.join(', ') || '(ninguno)'}`);
  }
  if (!moves.fall.length && !moves.defeat?.length) console.warn(`[BChess] La pieza no tiene animación para caer. Clips: ${clipNames.join(', ') || '(ninguno)'}`);
```

4. En el objeto que devuelve `loadPieceKit`, después de `pedestalHeight,`, añadir `radius,`.
5. En el objeto que devuelve `spawnPiece`, después de `pedestalHeight: kit.pedestalHeight,`, añadir:

```js
    radius: kit.radius,
    height: kit.spec.height + kit.pedestalHeight,
```

- [ ] **Paso 2: Banderín**

`src/pieces/flag.js`:

```js
import * as THREE from 'three';

// Banderín de dos puntas que ondea en lo alto de la torre: un mástil dorado y una tela plana que
// se ondula en cada fotograma, fija al mástil por su borde. La tela es la imagen del emblema de su
// bando, recortada con la forma del banderín.

const POLE_RADIUS = 0.012;
const CLOTH_WIDTH = 0.36;
const CLOTH_HEIGHT = 0.22;
const WAVE_SPEED = 5; // radianes por segundo
const WAVE_SIZE = 0.03;

// Textura de la tela: la imagen del emblema cubre el lienzo y se le recorta la cola en punta. Sin
// imagen, tela marfil lisa.
export function flagTexture(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const g = canvas.getContext('2d');
  if (image) {
    const k = Math.max(canvas.width / image.width, canvas.height / image.height);
    const w = image.width * k;
    const h = image.height * k;
    g.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  } else {
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(canvas.width, 0);
  g.lineTo(canvas.width * 0.74, canvas.height / 2);
  g.lineTo(canvas.width, canvas.height);
  g.lineTo(0, canvas.height);
  g.closePath();
  g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createFlag({ texture, poleHeight = 0.5 }) {
  const object = new THREE.Group();
  object.name = 'banderin';
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9b44a, metalness: 0.8, roughness: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, poleHeight, 8), metal);
  pole.position.y = poleHeight / 2;
  pole.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(POLE_RADIUS * 2.2, 12, 8), metal);
  knob.position.y = poleHeight;

  const geometry = new THREE.PlaneGeometry(CLOTH_WIDTH, CLOTH_HEIGHT, 12, 3);
  geometry.translate(CLOTH_WIDTH / 2, 0, 0); // el borde izquierdo, en el mástil
  const rest = Float32Array.from(geometry.attributes.position.array);
  const cloth = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: texture,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
    roughness: 0.85,
  }));
  cloth.position.set(POLE_RADIUS, poleHeight - CLOTH_HEIGHT / 2 - 0.03, 0);
  object.add(pole, knob, cloth);

  const phase = Math.random() * Math.PI * 2;
  let time = 0;

  // La onda crece hacia la punta y la tela cae un poco por su peso.
  function update(dt) {
    time += dt;
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const u = rest[i * 3] / CLOTH_WIDTH;
      position.setZ(i, Math.sin(u * 7 - time * WAVE_SPEED + phase) * WAVE_SIZE * u);
      position.setY(i, rest[i * 3 + 1] - u * u * 0.02);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  update(0);
  return { object, update };
}
```

- [ ] **Paso 3: La torre**

`src/pieces/rook.js`:

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitToHeight, loadPieceKit, spawnPiece, withShadows } from './piece.js';
import { createFlag, flagTexture } from './flag.js';
import { measureBody, measureStrikes } from '../combat/strikes.js';

// La torre: una pieza con dos formas en el mismo objeto. En reposo, la torre estática con su base
// de piedra y un banderín que ondea; para moverse y pelear, el gigante de piedra, una pieza con
// esqueleto y sin peana. `figure` es el gigante (o la torre, si no hay gigante).

const MODELS = 'assets/models/';
const DEFAULT_STONE = '#cfc4ae';

export async function loadRookKit(spec, quality) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [towerGltf, giant, emblem] = await Promise.all([
    loader.loadAsync(MODELS + spec.tower.files[quality.name]),
    spec.giant
      ? loadPieceKit({ ...spec.giant, pedestal: false }, quality).catch((err) => {
        console.error('[BChess] No se pudo cargar el gigante; la torre se moverá sin transformarse:', err);
        return null;
      })
      : null,
    spec.flag ? new THREE.ImageLoader().loadAsync(spec.flag.texture).catch(() => null) : null,
  ]);
  const tower = withShadows(towerGltf.scene);
  fitToHeight(tower, spec.tower.height);
  tower.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(tower);
  // El mástil va en el tejado: donde un rayo vertical por el centro toca la torre.
  const down = new THREE.Raycaster(new THREE.Vector3(0, spec.tower.height + 1, 0), new THREE.Vector3(0, -1, 0));
  const roof = down.intersectObject(tower, true)[0]?.point.y ?? spec.tower.height * 0.9;
  if (giant) {
    giant.strikes = measureStrikes(giant, spawnPiece);
    giant.body = measureBody(giant, spawnPiece);
  }
  return {
    spec,
    tower,
    radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2,
    roof,
    giant,
    flagTexture: spec.flag ? flagTexture(emblem) : null,
  };
}

export function spawnRook(kit) {
  const { spec } = kit;
  const object = new THREE.Group();
  object.name = 'torre';

  const tower = new THREE.Group();
  tower.name = 'torre-de-piedra';
  tower.add(kit.tower.clone());
  const flag = kit.flagTexture ? createFlag({ texture: kit.flagTexture }) : null;
  if (flag) {
    flag.object.position.y = kit.roof;
    tower.add(flag.object);
  }
  // Zona de toque invisible, del tamaño de la torre.
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(kit.radius, kit.radius, spec.tower.height, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hitbox.position.y = spec.tower.height / 2;
  tower.add(hitbox);
  object.add(tower);

  const giant = kit.giant ? spawnPiece(kit.giant) : null;
  if (giant) {
    giant.object.visible = false;
    object.add(giant.object);
  }

  return {
    object,
    tower,
    giant,
    hitbox,
    radius: kit.radius,
    height: spec.tower.height,
    stone: spec.stone ?? DEFAULT_STONE,
    body: kit.giant?.body ?? null,
    get figure() {
      return giant ? giant.figure : tower;
    },
    placeAt(position) {
      tower.position.set(position.x, 0, position.z);
      giant?.placeAt(position);
    },
    face(angle) {
      tower.rotation.set(0, angle, 0);
      giant?.face(angle);
    },
    update(dt) {
      flag?.update(dt);
      if (giant?.object.visible) giant.update(dt);
    },
  };
}
```

- [ ] **Paso 4: Mover de la torre, sin gigante todavía**

`src/moves/rook-mover.js`:

```js
import * as THREE from 'three';
import { pointAlong } from './walk.js';

// Mover de la torre, con la misma forma que el de los peones. Sin gigante, la torre se desliza
// entre polvo hasta su casilla.

const SLIDE_SECONDS = 0.45; // por casilla de distancia
const DUST_Y = 0.05;
const smooth = (t) => t * t * (3 - 2 * t);

export function createRookMover({ rook, board, dust, clock, onBusy = () => {}, restFacing }) {
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

  function placeOn(target) {
    square = target;
    rook.object.visible = true;
    rook.placeAt(board.squareToWorld(target));
    rook.face(restFacing);
    rook.tower.visible = true;
    rook.tower.scale.setScalar(1);
    if (rook.giant) {
      rook.giant.object.visible = false;
      rook.giant.figure.scale.setScalar(1);
    }
  }

  async function slide(target) {
    const from = board.squareToWorld(square);
    const to = board.squareToWorld(target);
    dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
    await clock.tween(from.distanceTo(to) * SLIDE_SECONDS, (t) => {
      const p = pointAlong(from, to, smooth(t));
      rook.tower.position.set(p.x, 0, p.z);
    });
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
    placeOn(target);
  }

  function goTo(target) {
    if (target === square) return Promise.resolve(false);
    return exclusive(() => slide(target));
  }

  // Desaparece del tablero encogiendo dentro de una nube de polvo.
  async function vanish() {
    const at = rook.tower.position.clone();
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await clock.tween(0.5, (t) => rook.tower.scale.setScalar(Math.max(0.001, 1 - t * t)));
    rook.object.visible = false;
  }

  return {
    placeOn,
    goTo,
    vanish,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
```

- [ ] **Paso 5: Torres en el manifiesto**

En `assets/models/manifest.json`, dentro de `pieces`, después de `black-pawn`:

```json
    "white-rook": {
      "tower": { "files": { "movil": "tower-movil.glb", "ordenador": "tower-ordenador.glb" }, "height": 1.75 },
      "flag": { "texture": "assets/textures/flag-white.jpg" },
      "stone": "#d8ccb4"
    },
    "black-rook": {
      "tower": { "files": { "movil": "black-tower-movil.glb", "ordenador": "black-tower-ordenador.glb" }, "height": 1.75 },
      "flag": { "texture": "assets/textures/flag-black.jpg" },
      "stone": "#3b3733"
    }
```

- [ ] **Paso 6: Piezas de dos tipos en `main.js`**

`src/main.js` (fichero completo):

```js
import { pickQuality, qualityFromQuery } from './quality.js';
import { createStage } from './scene/stage.js';
import { addLighting } from './scene/lighting.js';
import { createBoard } from './scene/board.js';
import { createHighlights } from './scene/highlights.js';
import { createHud } from './ui/hud.js';
import { loadManifest, loadPieceKit, spawnPiece } from './pieces/piece.js';
import { loadRookKit, spawnRook } from './pieces/rook.js';
import { createDust } from './fx/dust.js';
import { createMover } from './moves/sequence.js';
import { createRookMover } from './moves/rook-mover.js';
import { restFacingFor } from './moves/walk.js';
import { onBoardTap } from './input.js';
import { pawnCaptures, pawnMoves } from './rules/pawn.js';
import { rookMoves } from './rules/rook.js';
import { GESTURE_RETRY_MS, nextGestureDelay, pickPerformer } from './moves/gestures.js';
import { createClock } from './combat/clock.js';
import { measureStrikes } from './combat/strikes.js';
import { createImpactFx } from './fx/impact.js';
import { createCinema } from './scene/cinema.js';
import { pickStyle } from './combat/plan.js';
import { canFight, runCombat } from './combat/duel.js';

// Arranque: peones blancos en la fila 2 y negros en la 7, y torres en las esquinas (las piezas
// que traiga el manifiesto). Tocas una pieza y se marcan sus casillas posibles (puntos dorados) y
// los enemigos que puede comerse (aros rojos). Al tocar una casilla va hasta ella; al tocar un
// enemigo marcado, se lo come. Los botones actúan sobre el peón elegido.

const SIDES = [
  { color: 'white', pawn: 'white-pawn', rook: 'white-rook', pawnRank: 2, backRank: 1 },
  { color: 'black', pawn: 'black-pawn', rook: 'black-rook', pawnRank: 7, backRank: 8 },
];
const FILES = 'abcdefgh';
const ROOK_FILES = 'ah';
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
  const highlights = createHighlights(stage.scene, board);
  const dust = createDust(stage.scene);
  const clock = createClock();
  const fx = createImpactFx(stage.scene);
  const cinema = createCinema(stage);
  const pieces = []; // { kind: 'pawn' | 'rook', color, piece, mover }
  const state = { selected: null, busy: false, fighting: false, lastStyle: null };
  // De tanto en tanto, un solo peón del tablero hace un gesto especial; nunca dos a la vez.
  const gesture = { performer: null, last: null, lastVariant: -1, at: performance.now() + nextGestureDelay() };

  function directGestures(now) {
    if (gesture.performer) {
      if (gesture.performer.piece.fidgeting) return;
      gesture.performer = null;
      gesture.at = now + nextGestureDelay();
    }
    if (now < gesture.at) return;
    const candidates = state.busy || state.fighting ? [] : pieces.filter((entry) => entry.kind === 'pawn' && entry !== state.selected);
    const pawn = pickPerformer(candidates, gesture.last);
    const variant = pawn ? pawn.mover.fidget({ avoid: gesture.lastVariant }) : null;
    if (variant === null) {
      gesture.at = now + GESTURE_RETRY_MS;
      return;
    }
    Object.assign(gesture, { performer: pawn, last: pawn, lastVariant: variant });
  }

  // Un fotograma de juego: reloj, animaciones, gestos y efectos.
  function frame(now, dt) {
    const step = clock.tick(dt);
    for (const entry of pieces) entry.piece.update(step);
    directGestures(now);
    dust.update(step);
    fx.update(step);
    highlights.pulse(now / 1000);
    if (!cinema.active) stage.controls.update();
    cinema.update(dt);
  }

  let previous = performance.now();
  let manual = false; // mientras `advance` mueve el juego a mano
  stage.renderer.setAnimationLoop((now) => {
    const dt = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    if (!manual) frame(now, dt);
    stage.renderer.render(stage.scene, stage.camera);
    hud.tickFps(now);
  });

  // Para comprobar por código: avanza `seconds` de juego a `fps` fotogramas por segundo sin
  // depender de que la pestaña esté visible (oculta, el navegador frena el bucle de animación).
  async function advance(seconds, fps = 60) {
    const nextTask = () => new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(null);
    });
    manual = true;
    try {
      for (let i = 0; i < Math.round(seconds * fps); i++) {
        frame(performance.now(), 1 / fps);
        await nextTask();
      }
    } finally {
      manual = false;
      previous = performance.now();
    }
  }

  const occupied = () => new Set(pieces.map((entry) => entry.mover.square));
  const enemiesOf = (entry) => new Set(pieces.filter((other) => other.color !== entry.color).map((other) => other.mover.square));
  const pieceAt = (square) => pieces.find((entry) => entry.mover.square === square) ?? null;
  const movesOf = (entry) => (entry.kind === 'rook'
    ? rookMoves(entry.mover.square, occupied(), enemiesOf(entry)).moves
    : pawnMoves(entry.mover.square, occupied(), entry.color));
  const capturesOf = (entry) => (entry.kind === 'rook'
    ? rookMoves(entry.mover.square, occupied(), enemiesOf(entry)).captures
    : pawnCaptures(entry.mover.square, enemiesOf(entry), entry.color));
  // Atacar, Golpe y Caer solo actúan sobre peones.
  const refreshButtons = () => hud.setBusy(state.busy || state.fighting || state.selected?.kind !== 'pawn');

  function select(entry) {
    state.selected = entry;
    highlights.select(entry ? entry.mover.square : null);
    highlights.showMoves(entry ? movesOf(entry) : []);
    highlights.showCaptures(entry ? capturesOf(entry) : []);
    refreshButtons();
  }

  function onBusy(busy) {
    state.busy = busy;
    refreshButtons();
  }

  function removePiece(entry) {
    stage.scene.remove(entry.piece.object);
    pieces.splice(pieces.indexOf(entry), 1);
    if (gesture.performer === entry) gesture.performer = null;
    if (gesture.last === entry) gesture.last = null;
  }

  // Sin combate posible: el vencido se esfuma y el ganador va hasta su casilla.
  async function plainCapture(attacker, defender, target) {
    await defender.mover.vanish();
    removePiece(defender);
    await attacker.mover.goTo(target);
  }

  // Una pieza se come a otra. Entre peones, un combate (duelo de lanzas o cuerpo a cuerpo, sin
  // repetir el estilo anterior). Si no hay combate para esas piezas, el vencido se esfuma y el
  // ganador va hasta su casilla. Pase lo que pase, el tablero queda coherente.
  async function capture(attacker, defender) {
    state.fighting = true;
    highlights.clear();
    refreshButtons();
    const target = defender.mover.square;
    try {
      const obstacles = pieces.filter((entry) => entry !== attacker && entry !== defender).map((entry) => board.squareToWorld(entry.mover.square));
      const style = pickStyle(state.lastStyle);
      if (attacker.kind === 'pawn' && defender.kind === 'pawn' && canFight(attacker, defender, style)) {
        state.lastStyle = style;
        await runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, obstacles });
      } else {
        await plainCapture(attacker, defender, target);
      }
    } catch (err) {
      console.error('[BChess] El combate falló:', err);
      clock.timeScale = 1;
      cinema.reset();
      if (attacker.kind === 'pawn') {
        attacker.piece.setSpearPose(null);
        attacker.piece.setSpearDefault(null);
        attacker.piece.setGripSlide(0);
      }
      attacker.mover.placeOn(target);
    } finally {
      if (pieces.includes(defender)) removePiece(defender);
      state.fighting = false;
      select(attacker);
    }
  }

  async function handleTap({ owner, square }) {
    if (state.busy || state.fighting) return;
    const tapped = owner ?? (square ? pieceAt(square) : null);
    const selected = state.selected;
    if (selected && tapped && tapped.color !== selected.color && capturesOf(selected).includes(tapped.mover.square)) {
      await capture(selected, tapped);
      return;
    }
    if (tapped) {
      select(tapped);
      return;
    }
    if (selected && square && movesOf(selected).includes(square)) {
      highlights.clear();
      await selected.mover.goTo(square);
      select(selected);
      return;
    }
    select(null);
  }

  onBoardTap(
    { canvas: stage.renderer.domElement, camera: stage.camera, board, targets: () => pieces.map((entry) => entry.piece.hitbox) },
    handleTap,
  );

  hud.onAction((action) => {
    if (!state.busy && !state.fighting && state.selected?.kind === 'pawn') state.selected.mover.perform(action);
  });

  function addPiece(entry, square) {
    stage.scene.add(entry.piece.object);
    entry.mover.placeOn(square);
    entry.piece.hitbox.userData.owner = entry;
    pieces.push(entry);
  }

  async function loadPawns(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.pawn]);
      const kits = await Promise.all(sides.map((side) => loadPieceKit(manifest.pieces[side.pawn], quality)));
      for (const kit of kits) kit.strikes = measureStrikes(kit, spawnPiece);
      sides.forEach((side, i) => {
        for (const file of FILES) {
          const piece = spawnPiece(kits[i]);
          const entry = { kind: 'pawn', color: side.color, piece };
          entry.mover = createMover({ piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) });
          addPiece(entry, file + side.pawnRank);
        }
      });
      for (const action of BUTTON_ACTIONS) {
        if (!kits.some((kit) => kit.has(action))) hud.hideAction(action);
      }
      refreshButtons();
    } catch (err) {
      console.error('[BChess] No se pudieron cargar los peones:', err);
      hud.showMessage('No se pudieron cargar los peones', { retry: () => loadPawns(manifest) });
    }
  }

  // Las torres van aparte: si fallan, los peones siguen funcionando.
  async function loadRooks(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.rook]);
      const kits = await Promise.all(sides.map((side) => loadRookKit(manifest.pieces[side.rook], quality)));
      sides.forEach((side, i) => {
        for (const file of ROOK_FILES) {
          const piece = spawnRook(kits[i]);
          const entry = { kind: 'rook', color: side.color, piece };
          entry.mover = createRookMover({ rook: piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) });
          addPiece(entry, file + side.backRank);
        }
      });
    } catch (err) {
      console.error('[BChess] No se pudieron cargar las torres:', err);
      hud.showMessage('No se pudieron cargar las torres', { retry: () => loadRooks(manifest) });
    }
  }

  async function loadPieces() {
    let manifest;
    try {
      manifest = await loadManifest();
    } catch (err) {
      console.error('[BChess] No se pudo leer el manifiesto:', err);
      hud.showMessage('No se pudieron cargar las piezas', { retry: loadPieces });
      return;
    }
    await Promise.all([loadPawns(manifest), loadRooks(manifest)]);
  }

  await addLighting(stage, quality);
  await loadPieces();
  // Acceso para depurar desde la consola; `tap` simula un toque ({ owner, square }).
  window.bchess = {
    stage, board, quality, pieces, state, gesture, clock, highlights, fx, cinema, hud, advance, tap: handleTap, capture,
    get pawns() {
      return pieces.filter((entry) => entry.kind === 'pawn');
    },
    get rooks() {
      return pieces.filter((entry) => entry.kind === 'rook');
    },
  };
}

start();
```

- [ ] **Paso 7: Pruebas y comprobación en el navegador**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

Abrir la vista previa `bchess` (`http://localhost:8741/`) y, en su consola:

```js
JSON.stringify({
  torres: bchess.rooks.map((r) => [r.color, r.mover.square, +r.piece.radius.toFixed(3), r.piece.tower.visible]),
  peones: bchess.pawns.length,
})
```

Expected: `torres` con `white` en a1 y h1 y `black` en a8 y h8, radios entre 0,3 y 0,45, y `peones: 16`. Sin errores en la consola.

Mover la torre de a1 a d1:

```js
window.__r = null;
(async () => { await bchess.tap({ owner: bchess.rooks[0] }); const p = bchess.tap({ square: 'd1' }); await bchess.advance(3); await p; window.__r = bchess.rooks[0].mover.square; })();
```

Después, `window.__r` debe ser `'d1'`. En una captura de pantalla, las cuatro torres con su banderín ondeando y la de d1 en su casilla.

- [ ] **Paso 8: Commit**

```bash
git add src/pieces/piece.js src/pieces/flag.js src/pieces/rook.js src/moves/rook-mover.js src/main.js assets/models/manifest.json
git commit -m "Las cuatro torres en el tablero, con su banderín y sus reglas" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 9: Transformación, paseo y hacer sitio

**Files:**
- Modify: `src/scene/cinema.js`, `src/moves/rook-mover.js` (fichero completo), `src/main.js`, `assets/models/manifest.json`
- Create: `src/moves/transform.js`, `src/moves/crowd.js`, `raw/tmp/verificar-torre.js`

**Interfaces:**
- Consumes: `roomTarget`, `stepRoom` (tarea 5), `createRubble` (tarea 6), `loadRookKit` y `spawnRook` (tarea 8), los gigantes de la tarea 3.
- Produces:
  - `cinema.settle()`, que se llama en cada fotograma antes de `controls.update()`.
  - `towerToGiant({ rook, clock, dust, rubble, cinema, obstacles })` y `giantToTower({ rook, clock, dust, rubble, restFacing })`, promesas.
  - `createCrowd({ board, entries })` devuelve:
    - `claim({ owners, bodies }) → release()`;
    - `update(dt)`;
    - `settle() → Promise`;
    - `obstacles(except = []) → { x, z, radius, height }[]`.
  - `createRookMover({ rook, owner, board, dust, rubble, clock, cinema, crowd, onBusy, restFacing })` devuelve:
    - `placeOn`, `goTo`, `vanish`, `square` y `busy`;
    - para las capturas: `room({ fighting })`, `turnTo(angle, s)`, `awaken()`, `walkTo({x, z})`, `walkOnto(square)` y `crumble()`.

- [ ] **Paso 1: Temblor sin descolocar los controles**

En `src/scene/cinema.js`, sustituir:

```js
    // Cada fotograma, en tiempo real, después de mover la cámara.
    update(dt) {
      camera.position.sub(offset);
      if (shakeLeft > 0) {
```

por:

```js
    // Cada fotograma, antes de que los controles de órbita lean la cámara: quita el temblor del
    // fotograma anterior, para que no se les acumule (también tiembla fuera del combate).
    settle() {
      camera.position.sub(offset);
      offset.set(0, 0, 0);
    },

    // Cada fotograma, en tiempo real, después de mover la cámara: pone el temblor de este.
    update(dt) {
      if (shakeLeft > 0) {
```

- [ ] **Paso 2: Transformaciones**

`src/moves/transform.js`:

```js
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
```

- [ ] **Paso 3: Hacer sitio en la escena**

`src/moves/crowd.js`:

```js
import * as THREE from 'three';
import { roomTarget, stepRoom } from './room.js';

// Hacer sitio a los gigantes (diseño, sección 6). En cada fotograma, las piezas que no participan
// en la jugada se apartan de los cuerpos que piden sitio, sin chocar entre ellas, y cuando ya no
// hace falta vuelven al centro de su casilla. Se mueve el objeto entero de cada pieza: peana y
// figura juntas, o la torre con su base.

export function createCrowd({ board, entries }) {
  const claims = new Set(); // { owners: Set, bodies() }
  const slots = new WeakMap(); // pieza → { home, radius, offset, speed, target }
  const waiting = [];
  const point = new THREE.Vector3();
  let settled = true;

  // Pide sitio hasta que se llame a la función que devuelve. `owners` son las piezas de la jugada,
  // que no se apartan; `bodies()` devuelve los cuerpos que empujan ahora ({ from, to, radius }).
  function claim({ owners, bodies }) {
    const entry = { owners: new Set(owners), bodies };
    claims.add(entry);
    settled = false;
    return () => claims.delete(entry);
  }

  function slotFor(entry) {
    let slot = slots.get(entry);
    if (!slot) {
      slot = { home: { x: 0, z: 0 }, radius: entry.piece.radius, offset: { x: 0, z: 0 }, speed: 0, target: { x: 0, z: 0 } };
      slots.set(entry, slot);
    }
    const home = board.squareToWorld(entry.mover.square);
    slot.home.x = home.x;
    slot.home.z = home.z;
    return slot;
  }

  function flush() {
    if (settled) for (const resolve of waiting.splice(0)) resolve();
  }

  function update(dt) {
    if (settled && !claims.size) {
      flush();
      return;
    }
    const owners = new Set([...claims].flatMap((c) => [...c.owners]));
    const bodies = [...claims].flatMap((c) => c.bodies());
    const fixed = [];
    const yielding = [];
    for (const entry of entries()) {
      if (owners.has(entry)) {
        entry.piece.figure.getWorldPosition(point);
        fixed.push({ x: point.x, z: point.z, radius: entry.piece.radius });
      } else {
        yielding.push({ entry, slot: slotFor(entry) });
      }
    }
    const positions = yielding.map(({ slot }) => ({ x: slot.home.x + slot.offset.x, z: slot.home.z + slot.offset.z, radius: slot.radius }));
    yielding.forEach(({ slot }, i) => {
      slot.target = bodies.length
        ? roomTarget(slot, bodies, [...positions.slice(0, i), ...positions.slice(i + 1), ...fixed])
        : { x: 0, z: 0 };
    });
    stepRoom(yielding.map(({ slot }) => slot), fixed, dt);
    settled = claims.size === 0;
    for (const { entry, slot } of yielding) {
      entry.piece.object.position.set(slot.offset.x, 0, slot.offset.z);
      if (slot.offset.x !== 0 || slot.offset.z !== 0) settled = false;
    }
    flush();
  }

  // Se cumple cuando nadie pide sitio y todas las piezas han vuelto a su casilla.
  function settle() {
    return new Promise((resolve) => waiting.push(resolve));
  }

  // Cilindros de las piezas visibles, salvo `except`, para que las rocas reboten en ellas.
  function obstacles(except = []) {
    return entries()
      .filter((entry) => !except.includes(entry) && entry.piece.object.visible)
      .map((entry) => {
        entry.piece.figure.getWorldPosition(point);
        return { x: point.x, z: point.z, radius: entry.piece.radius, height: entry.piece.height };
      });
  }

  return { claim, update, settle, obstacles };
}
```

- [ ] **Paso 4: Mover de la torre con gigante**

`src/moves/rook-mover.js` (fichero completo):

```js
import * as THREE from 'three';
import { planWalk, pointAlong, shortestTurn } from './walk.js';
import { giantToTower, towerToGiant } from './transform.js';

// Mover de la torre, con la misma forma que el de los peones. Para ir a otra casilla se transforma
// en gigante, anda y vuelve a ser torre, pidiendo sitio a las piezas de alrededor (`crowd`). Sin
// gigante, la torre se desliza entre polvo. Los pasos sueltos (`room`, `turnTo`, `awaken`,
// `walkTo`, `walkOnto`, `crumble`) los usa el director de capturas, que ya tiene el bloqueo general.

const SLIDE_SECONDS = 0.45; // por casilla, cuando se desliza sin gigante
const LOOK_AHEAD = 0.8; // casillas por delante que pide al andar
const SETTLE_LIMIT = 4; // segundos de juego que espera, como mucho, a que vuelvan las piezas
const DUST_Y = 0.05;
const smooth = (t) => t * t * (3 - 2 * t);

export function createRookMover({ rook, owner, board, dust, rubble, clock, cinema, crowd, onBusy = () => {}, restFacing }) {
  const { giant } = rook;
  let square = null;
  let busy = false;
  let heading = null; // destino {x, z} mientras el gigante anda
  let shrinking = false; // mientras el gigante encoge para volver a ser torre
  const others = () => crowd.obstacles([owner]);

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

  function placeOn(target) {
    square = target;
    heading = null;
    shrinking = false;
    rook.object.visible = true;
    rook.placeAt(board.squareToWorld(target));
    rook.face(restFacing);
    rook.tower.visible = true;
    rook.tower.scale.setScalar(1);
    if (giant) {
      giant.object.visible = false;
      giant.figure.scale.setScalar(1);
    }
  }

  // Cuerpos con los que pide sitio ahora: su círculo y, al andar, el tramo que tiene por delante.
  // Mientras encoge, pide cada vez menos; deshecho en rocas, ya no pide nada.
  function room({ fighting = false } = {}) {
    if (!giant || !rook.body || !rook.object.visible) return [];
    const at = giant.figure.position;
    const from = { x: at.x, z: at.z };
    let to = from;
    if (heading) {
      const dx = heading.x - at.x;
      const dz = heading.z - at.z;
      const left = Math.hypot(dx, dz);
      if (left > 1e-6) {
        const k = Math.min(LOOK_AHEAD, left) / left;
        to = { x: at.x + dx * k, z: at.z + dz * k };
      }
    }
    const radius = (fighting ? rook.body.fight : rook.body.walk) * (shrinking ? giant.figure.scale.x : 1);
    return [{ from, to, radius }];
  }

  function turnTo(angle, seconds) {
    const from = giant.figure.rotation.y;
    const delta = shortestTurn(from, angle);
    return clock.tween(seconds, (t) => {
      giant.figure.rotation.y = from + delta * t;
    });
  }

  function awaken() {
    return towerToGiant({ rook, clock, dust, rubble, cinema, obstacles: others });
  }

  // El gigante anda desde donde está hasta `to` ({x, z}) con su paseo pesado.
  async function walkTo(to) {
    const at = giant.figure.position;
    const from = { x: at.x, z: at.z };
    const walk = planWalk(from, to, giant.walkSpeed);
    if (walk.distance < 1e-3) return;
    await turnTo(walk.heading, 0.35);
    heading = { x: to.x, z: to.z };
    giant.play('walk', { fade: 0.2 });
    await clock.tween(walk.duration, (t) => {
      const p = pointAlong(from, to, t);
      giant.figure.position.set(p.x, 0, p.z);
    });
    heading = null;
    giant.play('idle', { fade: 0.3 });
  }

  // Anda hasta el centro de `target` y allí vuelve a ser torre.
  async function walkOnto(target) {
    await walkTo(board.squareToWorld(target));
    shrinking = true;
    await giantToTower({ rook, clock, dust, rubble, restFacing });
    placeOn(target);
  }

  async function slide(target) {
    const from = board.squareToWorld(square);
    const to = board.squareToWorld(target);
    dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
    await clock.tween(from.distanceTo(to) * SLIDE_SECONDS, (t) => {
      const p = pointAlong(from, to, smooth(t));
      rook.tower.position.set(p.x, 0, p.z);
    });
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
    placeOn(target);
  }

  function goTo(target) {
    if (target === square) return Promise.resolve(false);
    return exclusive(async () => {
      if (!giant) {
        await slide(target);
        return;
      }
      const release = crowd.claim({ owners: [owner], bodies: () => room() });
      try {
        await awaken();
        await walkOnto(target);
      } catch (err) {
        console.error('[BChess] La torre no pudo moverse:', err);
        placeOn(target);
      } finally {
        release();
      }
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
    });
  }

  // Tras perder: se deshace en rocas y polvo.
  async function crumble() {
    const at = giant.figure.position.clone();
    rubble.explode(at, { color: rook.stone, count: 22, height: rook.height, obstacles: others });
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 20, radius: 1, duration: 0.9 });
    cinema.shake(0.15);
    await clock.tween(0.25, (t) => {
      giant.figure.scale.setScalar(Math.max(0.001, 1 - t));
    });
    rook.object.visible = false;
  }

  // Desaparece del tablero encogiendo dentro de una nube de polvo (capturas sin combate).
  async function vanish() {
    const form = giant?.object.visible ? giant.figure : rook.tower;
    const at = form.position.clone();
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await clock.tween(0.5, (t) => {
      form.scale.setScalar(Math.max(0.001, 1 - t * t));
    });
    rook.object.visible = false;
  }

  return {
    placeOn,
    goTo,
    vanish,
    room,
    turnTo,
    awaken,
    walkTo,
    walkOnto,
    crumble,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
```

- [ ] **Paso 5: Conectar en `main.js`**

1. Después de `import { createDust } from './fx/dust.js';`, añadir `import { createRubble } from './fx/rubble.js';`. Después de `import { createRookMover } from './moves/rook-mover.js';`, añadir `import { createCrowd } from './moves/crowd.js';`.
2. Sustituir:

```js
  const cinema = createCinema(stage);
  const pieces = []; // { kind: 'pawn' | 'rook', color, piece, mover }
```

por:

```js
  const cinema = createCinema(stage);
  const rubble = createRubble(stage.scene);
  const pieces = []; // { kind: 'pawn' | 'rook', color, piece, mover }
  const crowd = createCrowd({ board, entries: () => pieces });
```

3. Sustituir la función `frame` entera por:

```js
  // Un fotograma de juego: reloj, sitio para los gigantes, animaciones, gestos y efectos.
  function frame(now, dt) {
    const step = clock.tick(dt);
    crowd.update(step);
    for (const entry of pieces) entry.piece.update(step);
    directGestures(now);
    dust.update(step);
    rubble.update(step);
    fx.update(step);
    highlights.pulse(now / 1000);
    cinema.settle();
    if (!cinema.active) stage.controls.update();
    cinema.update(dt);
  }
```

4. Sustituir `entry.mover = createRookMover({ rook: piece, board, dust, clock, onBusy, restFacing: restFacingFor(side.color) });` por:

```js
          entry.mover = createRookMover({ rook: piece, owner: entry, board, dust, rubble, clock, cinema, crowd, onBusy, restFacing: restFacingFor(side.color) });
```

5. En `window.bchess`, después de `capture,`, añadir `crowd, rubble,`.

- [ ] **Paso 6: Gigantes en el manifiesto**

En `assets/models/manifest.json`, añadir a `white-rook` (después de `"stone"`):

```json
      "giant": {
        "files": { "movil": "giant-movil.glb", "ordenador": "giant-ordenador.glb" },
        "animationFiles": ["giant-moves.glb"],
        "height": 1.9,
        "yaw": 0,
        "moves": {
          "idle": [{ "clip": "idle" }],
          "walk": [{ "clip": "walk" }],
          "jump": [],
          "fall": [],
          "attack": [{ "clip": "box_03" }, { "clip": "front_kick_02" }],
          "hit": [{ "clip": "hit_to_body_01" }],
          "defeat": [{ "clip": "defeat_03", "travel": 0.4 }],
          "taunt": [{ "clip": "angry_01" }]
        },
        "hands": {}
      }
```

Y a `black-rook`, lo mismo con `"files": { "movil": "black-giant-movil.glb", "ordenador": "black-giant-ordenador.glb" }` y `"animationFiles": ["black-giant-moves.glb"]`. Las claves de `attack`, `hit`, `defeat`, `taunt` y, si se eligió un andar pesado, `walk` son las elegidas en la tarea 3, paso 7; las de este bloque son las que se aplican si no aparece nada mejor en la biblioteca.

- [ ] **Paso 7: Comprobación por código**

`raw/tmp/verificar-torre.js`:

```js
// Comprobación por código de las jugadas de torre (solo desarrollo; raw/ no se publica).
// `medidor` mide en cada fotograma:
// - el hueco mínimo entre las piezas que no participan (bordes de sus peanas o bases);
// - la holgura del gigante (sus huesos más lo que sobresale su malla) con esas piezas;
// - los fotogramas con la torre y el gigante visibles a la vez;
// - el desplazamiento máximo de las que se apartan.
// `final` resume el estado al terminar.
import * as THREE from '/vendor/three/build/three.module.js';

export async function listo() {
  for (let i = 0; i < 80 && !(window.bchess && window.bchess.rooks.length === 4 && window.bchess.pawns.length === 16); i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  window.bchess.gesture.at = Infinity;
  return window.bchess;
}

export function medidor(b, protagonistas) {
  const v = new THREE.Vector3();
  const peor = { hueco: 9, holgura: 9, ambos: 0, apartado: 0 };
  const gigantes = protagonistas.filter((p) => p.kind === 'rook' && p.piece.giant).map((p) => {
    const huesos = [];
    p.piece.giant.object.traverse((o) => { if (o.isBone) huesos.push(o); });
    return { p, huesos };
  });
  function muestra() {
    const quietas = b.pieces.filter((p) => !protagonistas.includes(p) && p.piece.object.visible).map((p) => {
      p.piece.figure.getWorldPosition(v);
      return { p, x: v.x, z: v.z, r: p.piece.radius, h: p.piece.height };
    });
    for (let i = 0; i < quietas.length; i++) {
      const a = quietas[i];
      peor.apartado = Math.max(peor.apartado, +Math.hypot(a.p.piece.object.position.x, a.p.piece.object.position.z).toFixed(3));
      for (let j = i + 1; j < quietas.length; j++) {
        const c = quietas[j];
        const hueco = Math.hypot(a.x - c.x, a.z - c.z) - a.r - c.r;
        if (hueco < peor.hueco) Object.assign(peor, { hueco: +hueco.toFixed(3), entre: [a.p.mover.square, c.p.mover.square], tHueco: +b.clock.now.toFixed(2) });
      }
    }
    for (const { p, huesos } of gigantes) {
      const g = p.piece.giant;
      if (p.piece.tower.visible && g.object.visible) peor.ambos++;
      if (!g.object.visible || !p.piece.object.visible) continue;
      g.object.updateMatrixWorld(true);
      const margen = p.piece.body.margin * g.figure.scale.x;
      for (const hueso of huesos) {
        hueso.getWorldPosition(v);
        for (const o of quietas) {
          if (v.y > o.h) continue;
          const holgura = Math.hypot(v.x - o.x, v.z - o.z) - o.r - margen;
          if (holgura < peor.holgura) Object.assign(peor, { holgura: +holgura.toFixed(3), hueso: hueso.name, pieza: o.p.mover.square, tHolgura: +b.clock.now.toFixed(2) });
        }
      }
    }
  }
  return { peor, muestra };
}

export function final(b, camara) {
  return {
    fuera: b.pieces.filter((p) => Math.hypot(p.piece.object.position.x, p.piece.object.position.z) > 1e-9).map((p) => p.mover.square),
    torres: b.rooks.map((p) => {
      const centro = b.board.squareToWorld(p.mover.square);
      return {
        casilla: p.mover.square,
        torre: p.piece.tower.visible,
        gigante: Boolean(p.piece.giant?.object.visible),
        centro: +Math.hypot(p.piece.tower.position.x - centro.x, p.piece.tower.position.z - centro.z).toFixed(4),
      };
    }),
    piezas: b.pieces.length,
    camara: +b.stage.camera.position.distanceTo(camara).toFixed(4),
    controles: b.stage.controls.enabled,
    rocas: b.rubble.count,
  };
}

export async function moverTorre(desde, hasta) {
  const b = await listo();
  const torre = b.pieces.find((p) => p.mover.square === desde);
  const camara = b.stage.camera.position.clone();
  const m = medidor(b, [torre]);
  await b.tap({ owner: torre });
  const jugada = b.tap({ square: hasta });
  let frames = 0;
  while (b.state.busy && frames < 6000) {
    await b.advance(1 / 60);
    m.muestra();
    frames++;
  }
  await jugada;
  await b.advance(2); // las últimas rocas terminan de desaparecer
  return JSON.stringify({ desde, hasta, frames, cuerpo: torre.piece.body, ...m.peor, ...final(b, camara) });
}
```

Recargar la vista previa y, en su consola:

```js
window.__r = null;
import('/raw/tmp/verificar-torre.js').then((m) => m.moverTorre('a1', 'd1')).then((r) => { window.__r = r; });
```

Cuando `window.__r` tenga el resultado:

Expected:
- `cuerpo`: `walk` entre 0,5 y 0,95; `margin` entre 0,05 y 0,3; `torso` entre 0,15 y 0,45.
- `hueco` ≥ 0,029, `holgura` ≥ 0, `ambos` 0 y `apartado` ≤ 0,45.
- `fuera` vacío; la torre de d1 con `torre: true`, `gigante: false` y `centro: 0`.
- `camara` 0, `controles: true`, `rocas: 0` y ningún error en la consola.

Repetir con la torre negra, recargando antes: `moverTorre('h8', 'e8')`. Si `holgura` sale negativa, el gigante roza a un peón. Hay que subir el margen de `measureBody` (`MIN_MARGIN`) o bajar `giant.height` a 1,8 en el manifiesto, apuntarlo en «Cambios durante la ejecución» y repetir.

- [ ] **Paso 8: Mirarlo**

En la vista previa visible, mover la torre blanca de a1 a c1 con toques reales. En capturas de pantalla durante el paso, comprobar que:
- la torre tiembla y estalla en rocas;
- el gigante se alza y anda con los peones de la fila 2 apartándose;
- vuelve a ser torre.

- [ ] **Paso 9: Commit**

```bash
git add src/scene/cinema.js src/moves/transform.js src/moves/crowd.js src/moves/rook-mover.js src/main.js assets/models/manifest.json
git commit -m "La torre se transforma en gigante para moverse y las piezas le hacen sitio" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 10: Capturas con torre

**Files:**
- Create: `src/combat/smash.js`, `raw/tmp/verificar-captura-torre.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes:
  - de la tarea 7: `TORSO`, `bestStrike`, `fightSpots`, `gripSlideForReach`, `strikeSpot` y `usableStrikes`;
  - `rook.body`;
  - de la tarea 9: los pasos del mover de la torre y `crowd`;
  - los pasos del mover de los peones: `turnTo`, `descend`, `walkOnto`, `vanish` y `hop`.
- Produces: `canSmash(attacker, defender) → boolean` y `runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles, random }) → Promise`.

- [ ] **Paso 1: Director de las capturas**

`src/combat/smash.js`:

```js
import * as THREE from 'three';
import { TORSO, bestStrike, fightSpots, gripSlideForReach, strikeSpot, usableStrikes } from './plan.js';

// Capturas cortas y brutales en las que participa una torre (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-torre-gigante-design.md, sección 7). Gana siempre el atacante. Mientras dura,
// los gigantes piden sitio a las piezas de alrededor; el atacante y el defensor no se apartan.

const HIT_STOP = 0.1; // segundos reales congelados en el impacto
const SLOW_MOTION = 0.3;
const SLOW_BEFORE = 0.35; // segundos de juego antes del impacto, ya a cámara lenta
const SLOW_AFTER = 0.45;
const KNOCKBACK = 0.2; // lo que sale despedido el peón
const KO_SECONDS = 1;
const COLLAPSE_SECONDS = 0.8; // lo que se ve del derrumbe antes de deshacerse en rocas
const RECOVER = 0.3; // la lanza vuelve a su agarre antes de bajar el arma
const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const COMBAT_RAISE = 0.3; // como en el duelo: la lanza, algo subida en la mano
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas

const giantOf = (entry) => (entry.kind === 'rook' ? entry.piece.giant : null);
const spearTip = (piece) => piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0));

export function canSmash(attacker, defender) {
  const giant = giantOf(attacker);
  if (giant) {
    if (!bestStrike(giant.attacks, giant.strikes)) return false;
    return defender.kind === 'rook' ? Boolean(giantOf(defender)) : defender.piece.has('defeat') || defender.piece.has('fall');
  }
  return attacker.kind === 'pawn' && Boolean(giantOf(defender))
    && usableStrikes(attacker.piece.attacks, attacker.piece.strikes, 'duel').length > 0;
}

// Cámara lenta hasta un impacto que llega a los `seconds` de juego; se resuelve en el impacto.
async function slowToImpact(clock, seconds) {
  await clock.wait(Math.max(0, seconds - SLOW_BEFORE));
  clock.timeScale = SLOW_MOTION;
  await clock.wait(Math.min(SLOW_BEFORE, seconds));
}

// Tras el impacto: congelado, algo más de cámara lenta y vuelta a la velocidad normal.
async function afterImpact(clock) {
  await clock.hold(HIT_STOP);
  await clock.wait(SLOW_AFTER);
  clock.timeScale = 1;
}

// La torre se come a un peón o a otra torre.
async function giantSmash({ attacker, defender, home, center, target, clock, fx, cinema, hud, obstacles, random }) {
  const rook = attacker.piece;
  const giant = rook.giant;
  const key = bestStrike(giant.attacks, giant.strikes);
  const measure = giant.strikes[key];
  const rival = giantOf(defender);
  const d = rival ?? defender.piece;
  const spots = strikeSpot(home, center, {
    reach: measure.body.reach,
    torso: rival ? defender.piece.body.torso : TORSO,
    closest: rook.body.torso + (rival ? defender.piece.body.torso : PAWN_BODY) + BODY_GAP,
  });

  // 1. La cámara encuadra y la torre (o las dos) se transforman.
  const opening = [cinema.frame(clock, spots.attacker, center, obstacles), attacker.mover.awaken()];
  if (rival) {
    opening.push(defender.mover.awaken());
  } else {
    d.setSpearDefault('upright');
    d.setGripSlide(-COMBAT_RAISE);
  }
  await Promise.all(opening);

  // 2. El gigante avanza hasta que su golpe alcanza al rival, se encaran y lo provoca.
  await attacker.mover.walkTo(spots.attacker);
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
    defender.mover.turnTo(spots.defenderFacing, 0.3),
  ]);
  const taunts = [];
  if (giant.has('taunt')) taunts.push(giant.playOnce('taunt'));
  if (!rival && random() < 0.5 && d.hasClip('fidget', 'frightened')) taunts.push(d.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  giant.play('idle', { fade: 0.25 });
  if (!rival) {
    await defender.mover.descend(center);
    await defender.mover.turnTo(spots.defenderFacing, 0.2);
  }

  // 3. Golpe a cámara lenta, con destello, chispas y temblor.
  const attack = giant.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, measure.body.t);
  fx.burst(giant.object.getObjectByName(measure.body.bone).getWorldPosition(new THREE.Vector3()), { size: 1.2, sparks: 30 });
  hud.flash();
  cinema.shake(0.25);
  const ux = Math.sin(spots.attackerFacing);
  const uz = Math.cos(spots.attackerFacing);
  let fall;
  if (rival) {
    fall = rival.playOnce(rival.has('defeat') ? 'defeat' : 'hit', { fade: 0.1 });
  } else {
    fall = d.playOnce(d.has('defeat') ? 'defeat' : 'fall', { fade: 0.1 });
    d.throwSpear({ x: ux, z: uz });
    const start = d.figure.position.clone();
    clock.tween(0.3, (t) => {
      const k = 1 - (1 - t) ** 2;
      d.figure.position.set(start.x + ux * KNOCKBACK * k, start.y, start.z + uz * KNOCKBACK * k);
    });
  }
  await afterImpact(clock);
  await attack;
  giant.play('idle', { fade: 0.3 });

  // 4. El vencido se deshace en rocas o, si es un peón, ve estrellitas y se esfuma.
  if (rival) {
    await Promise.race([fall, clock.wait(COLLAPSE_SECONDS)]);
    await defender.mover.crumble();
  } else {
    await fall;
    fx.koStars(d.object.getObjectByName('Head') ?? d.figure, { seconds: KO_SECONDS });
    await clock.wait(KO_SECONDS);
    await defender.mover.vanish();
  }

  // 5. La cámara vuelve mientras el gigante ocupa la casilla y vuelve a ser torre.
  await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
}

// Un peón se come a una torre: estocada, y el gigante se derrumba en rocas.
async function pawnFellsGiant({ attacker, defender, home, center, target, clock, fx, cinema, hud, obstacles, random }) {
  const a = attacker.piece;
  const giant = defender.piece.giant;
  const spots = fightSpots(home, center, 'duel');
  const keys = usableStrikes(a.attacks, a.strikes, 'duel');
  const key = keys[Math.floor(random() * keys.length)];
  const measure = a.strikes[key];
  a.setSpearDefault('upright');
  a.setGripSlide(-COMBAT_RAISE);

  // 1. La cámara encuadra, la torre se transforma, se encaran y el gigante provoca.
  await Promise.all([
    cinema.frame(clock, spots.attacker, spots.defender, obstacles),
    defender.mover.awaken(),
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
  ]);
  await defender.mover.turnTo(spots.defenderFacing, 0.35);
  const taunts = [];
  if (giant.has('taunt')) taunts.push(giant.playOnce('taunt'));
  if (random() < 0.5 && a.hasClip('fidget', 'frightened')) taunts.push(a.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  giant.play('idle', { fade: 0.25 });
  await attacker.mover.descend(spots.attacker);
  await attacker.mover.turnTo(spots.attackerFacing, 0.2);

  // 2. Estocada a cámara lenta: la punta se queda en el pecho del gigante, que se derrumba.
  a.setGripSlide(gripSlideForReach({ reach: measure.spear.reach, distance: spots.distance, torso: defender.piece.body.torso }));
  const attack = a.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, measure.spear.t);
  fx.burst(spearTip(a), { size: 1.1, sparks: 28 });
  hud.flash();
  cinema.shake(0.2);
  const collapse = giant.playOnce(giant.has('defeat') ? 'defeat' : 'hit', { fade: 0.1 });
  await afterImpact(clock);
  await attack;
  a.setGripSlide(-COMBAT_RAISE);
  await clock.wait(RECOVER);
  a.play('idle', { fade: 0.3 });
  await Promise.race([collapse, clock.wait(COLLAPSE_SECONDS)]);
  await defender.mover.crumble();

  // 3. Victoria: la cámara vuelve, el peón ocupa la casilla y lo celebra.
  a.setSpearPose(null);
  a.setGripSlide(0);
  await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
  if (a.has('victory')) {
    await a.playOnce('victory');
    a.play('idle', { fade: 0.3 });
  } else {
    await attacker.mover.hop(2);
  }
  a.setSpearDefault(null);
}

// `obstacles` son los centros {x, z} de las demás piezas, para que la cámara no quede tapada.
export async function runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles = [], random = Math.random }) {
  const fight = {
    attacker, defender, clock, fx, cinema, hud, obstacles, random,
    target: defender.mover.square,
    home: board.squareToWorld(attacker.mover.square),
    center: board.squareToWorld(defender.mover.square),
  };
  const release = crowd.claim({
    owners: [attacker, defender],
    bodies: () => [
      ...(attacker.mover.room?.({ fighting: true }) ?? []),
      ...(defender.mover.room?.({ fighting: true }) ?? []),
    ],
  });
  try {
    if (giantOf(attacker)) await giantSmash(fight);
    else await pawnFellsGiant(fight);
  } finally {
    release();
  }
  await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
}
```

- [ ] **Paso 2: Conectar en `main.js`**

1. Después de `import { canFight, runCombat } from './combat/duel.js';`, añadir `import { canSmash, runSmash } from './combat/smash.js';`.
2. Después de `const BUTTON_ACTIONS = ['attack', 'hit', 'fall'];`, añadir:

```js
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas apartadas
```

3. Sustituir el comentario de `capture` y sus ramas:

```js
  // Una pieza se come a otra. Entre peones, un combate (duelo de lanzas o cuerpo a cuerpo, sin
  // repetir el estilo anterior). Si no hay combate para esas piezas, el vencido se esfuma y el
  // ganador va hasta su casilla. Pase lo que pase, el tablero queda coherente.
```

por:

```js
  // Una pieza se come a otra. Entre peones, un combate (duelo de lanzas o cuerpo a cuerpo, sin
  // repetir el estilo anterior); si hay una torre, una captura corta con su gigante. Si faltan
  // animaciones, el vencido se esfuma y el ganador va hasta su casilla. Pase lo que pase, el
  // tablero queda coherente.
```

y:

```js
        await runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, obstacles });
      } else {
        await plainCapture(attacker, defender, target);
      }
```

por:

```js
        await runCombat({ attacker, defender, board, clock, fx, cinema, hud, style, obstacles });
      } else if (canSmash(attacker, defender)) {
        await runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles });
      } else {
        await plainCapture(attacker, defender, target);
      }
```

4. Sustituir:

```js
    } finally {
      if (pieces.includes(defender)) removePiece(defender);
      state.fighting = false;
      select(attacker);
    }
```

por:

```js
    } finally {
      if (pieces.includes(defender)) removePiece(defender);
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
      state.fighting = false;
      select(attacker);
    }
```

- [ ] **Paso 3: Comprobación por código**

`raw/tmp/verificar-captura-torre.js`:

```js
// Comprobación por código de las capturas con torre (solo desarrollo; raw/ no se publica).
// Prepara la posición con `placeOn`, lanza la captura con `advance` y mide lo mismo que
// `moverTorre`, además de lo cerca que llega la punta de la lanza al centro del gigante.
import * as THREE from '/vendor/three/build/three.module.js';
import { final, listo, medidor } from './verificar-torre.js';

const PREPARACIONES = {
  // La torre blanca de a1 sube por la columna a y se come al peón negro, llevado a a5; el peón de
  // a2 pasa a b3, al lado del camino.
  'torre-come-peon': (at) => {
    at('a2').mover.placeOn('b3');
    at('a7').mover.placeOn('a5');
    return ['a1', 'a5'];
  },
  // El peón blanco, llevado a d4, se come en diagonal a la torre negra, llevada a e5; alrededor,
  // peones en e4, d5 y f6.
  'peon-come-torre': (at) => {
    at('d2').mover.placeOn('d4');
    at('h8').mover.placeOn('e5');
    at('e2').mover.placeOn('e4');
    at('d7').mover.placeOn('d5');
    at('f7').mover.placeOn('f6');
    return ['d4', 'e5'];
  },
  // La torre blanca, llevada a d3, se come a la negra, llevada a d6, entre los peones de las filas 2 y 7.
  'torre-come-torre': (at) => {
    at('a1').mover.placeOn('d3');
    at('a8').mover.placeOn('d6');
    return ['d3', 'd6'];
  },
};

export async function capturar(nombre) {
  const b = await listo();
  const at = (square) => b.pieces.find((p) => p.mover.square === square);
  const [desde, hasta] = PREPARACIONES[nombre](at);
  await b.advance(0.1);
  const atacante = at(desde);
  const defensor = at(hasta);
  const camara = b.stage.camera.position.clone();
  const m = medidor(b, [atacante, defensor]);
  const acciones = [];
  for (const p of [atacante, defensor]) {
    const pieza = p.kind === 'rook' ? p.piece.giant : p.piece;
    const original = pieza.playOnce;
    pieza.playOnce = (action, opts = {}) => {
      acciones.push(`${p.kind}:${action}${opts.clip ? `:${opts.clip}` : ''}`);
      return original.call(pieza, action, opts);
    };
  }
  let punta = null;
  await b.tap({ owner: atacante });
  const captura = b.tap({ owner: defensor });
  let frames = 0;
  while (b.state.fighting && frames < 8000) {
    await b.advance(1 / 60);
    m.muestra();
    const lanza = atacante.kind === 'pawn' ? atacante.piece.props.spear : null;
    if (lanza?.visible && defensor.piece.giant?.object.visible) {
      const tip = lanza.localToWorld(new THREE.Vector3(0, atacante.piece.spearEnds.top, 0));
      const g = defensor.piece.giant.figure.position;
      const d = Math.hypot(tip.x - g.x, tip.z - g.z);
      if (punta === null || d < punta) punta = +d.toFixed(3);
    }
    frames++;
  }
  await captura;
  await b.advance(2);
  return JSON.stringify({
    nombre, frames, ...m.peor, puntaAlGigante: punta, torso: defensor.piece.body?.torso ?? null,
    acciones, ganador: atacante.mover.square, ...final(b, camara),
  });
}
```

Para cada captura, recargar la vista previa y, en su consola (cambiando el nombre):

```js
window.__r = null;
import('/raw/tmp/verificar-captura-torre.js').then((m) => m.capturar('torre-come-peon')).then((r) => { window.__r = r; });
```

Expected, en las tres (`torre-come-peon`, `peon-come-torre`, `torre-come-torre`):
- `hueco` ≥ 0,029, `holgura` ≥ 0, `ambos` 0 y `apartado` ≤ 0,45.
- `acciones` con el ataque del atacante y la derrota o el golpe del defensor.
- `ganador` = la casilla del defensor; `fuera` vacío; `piezas` 19.
- Las torres que quedan, con `torre: true`, `gigante: false` y `centro: 0`.
- `camara` 0, `controles: true`, `rocas: 0` y ningún error en la consola.
- En `peon-come-torre`, `puntaAlGigante` ≥ `torso` − 0,05: la lanza no atraviesa al gigante.

Repetir `torre-come-peon` con los colores cambiados en otra recarga, a mano en la consola: llevar la torre negra de h8 a h6 y el peón blanco de h2 a h4, y capturar h4 desde h6 con `bchess.tap`.

- [ ] **Paso 4: Mirarlo**

En la vista previa visible, con toques reales, hacer que la torre blanca coma un peón. En capturas de pantalla, comprobar:
- la transformación y la cámara de cine;
- el golpe a cámara lenta con destello;
- el peón que sale despedido;
- la vuelta a torre en la casilla conquistada.

- [ ] **Paso 5: Commit**

```bash
git add src/combat/smash.js src/main.js
git commit -m "Capturas cortas y brutales con el gigante de piedra" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 11: Documentación y publicación

**Files:**
- Modify: `README.md`, `index.html`, `docs/superpowers/plans/2026-09-14-bchess-torre-gigante.md`

**Interfaces:**
- Consumes: todo lo anterior, verificado.

- [ ] **Paso 1: Título de la página**

En `index.html`:
- `<title>BChess · prueba del peón</title>` pasa a `<title>BChess · peones y torres</title>`;
- en la descripción, `prueba del peón animado` pasa a `peones y torres animados`;
- `aria-label="Tablero de ajedrez en 3D con el peón blanco"` pasa a `aria-label="Tablero de ajedrez en 3D con peones y torres"`.

- [ ] **Paso 2: README**

Después de la sección que explica las capturas de peones, añadir:

```markdown
## Torres

Las torres están en las esquinas. Al elegir una se marcan sus casillas en línea recta y los enemigos
que puede comerse. Para moverse, la torre estalla en rocas y se convierte en un gigante de piedra,
que anda hasta su casilla y vuelve a ser torre. El gigante ocupa más que una casilla, así que las
piezas de alrededor se apartan deslizando su peana, sin chocar entre ellas, y vuelven a su sitio al
terminar. Las capturas con torre son cortas: el gigante aplasta de un golpe, y si un peón le da
una estocada, se derrumba en rocas.

Modelos: `tower-*`, `black-tower-*`, `giant-*` y `black-giant-*` en `assets/models/`; las telas de
los banderines, en `assets/textures/flag-*.jpg`. Para comparar las proporciones de dos imágenes de
referencia: `node tools/silhouette.mjs imagen.jpeg`.
```

- [ ] **Paso 3: Cambios durante la ejecución**

Añadir al final de este plan una sección «Cambios durante la ejecución» con lo que cambió respecto al plan y la tabla de resultados de las comprobaciones de las tareas 9 y 10.

- [ ] **Paso 4: Pruebas y commit**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

```bash
git add README.md index.html docs/superpowers/plans/2026-09-14-bchess-torre-gigante.md
git commit -m "Documentación de la torre y su gigante" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Paso 5: Unir y publicar**

```bash
cd ~/bchess && git switch main && git merge --no-ff torre-gigante -m "Torre y gigante de piedra" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && git push
```

Esperar a que GitHub Pages publique (`gh api repos/mr-d0nuT/bchess/pages/builds/latest --jq .status` hasta `built`) y abrir `https://mr-d0nut.github.io/bchess/`:
- las cuatro torres cargan sin errores en la consola;
- mover una torre;
- hacer una captura con torre.

- [ ] **Paso 6: Memoria**

Actualizar `bchess-app.md` en la memoria con lo aprendido que no está en el repositorio:
- cómo adjuntar imágenes a Gemini;
- las claves elegidas para el gigante;
- los créditos gastados.

---

## Cambios durante la ejecución

- **Orden.** Las tareas 4 a 10 se hicieron antes que los modelos de Tripo, con piezas provisionales: torres de ocho lados hechas en código (`raw/tmp/stand-in-tower.mjs`) y el peón de cada color a 1,9 casillas como gigante. Las comprobaciones de las tareas 9 y 10 pasaron con ellas y se repiten con los modelos definitivos.
- **Siluetas.** `tools/silhouette.mjs` mide la caja de los bordes marcados (saltos de brillo) con umbral 12, en vez de comparar con el color de la esquina: con los fondos de estudio en degradado, ese método tomaba la imagen entera.
- **Adjuntar en Gemini.** Soltar imágenes y los `input[type=file]` de Gemini no adjuntan de forma fiable. Las imágenes se suben a un `input[type=file]` propio creado en la página y se pegan con un evento `paste` sintético. El pegado adjunta cada imagen dos veces, sin efecto en el resultado.
- **Descargas de Gemini.** Chrome dejó de descargar imágenes de Gemini tras las primeras (bloqueo de descargas múltiples). La bandera negra y el gigante negro se copiaron con «Copiar imagen» y se guardaron desde el portapapeles con `osascript`, a 1024 px: basta para la tela y como referencia de textura. Después se restauró el texto que tenía el portapapeles del usuario.
- **Referencia de la torre.** Con `piezas_white_front.png` entera, Gemini convirtió las seis figuras en torres. La referencia es un recorte de la torre (`raw/tmp/ref-torre-*.png`) con la estrellita de la marca de agua tapada.
- **Torre negra.** Se editó la torre blanca generada, con el recorte de la torre negra como referencia de materiales.
- **Verificación de la punta de la lanza.** En `verificar-captura-torre.js`, la distancia de la punta al gigante solo se mide mientras la torre es visible. Antes seguía midiendo cuando el peón ya entraba en la casilla y daba un falso 0,043.
- **Colores cambiados.** Se añadió la captura `torre-negra-come-peon`.
- **Resultados con las piezas provisionales:**

| Comprobación | hueco | holgura | a la vez | apartado | final |
|---|---|---|---|---|---|
| Torre blanca a1 → d1 | 0,216 | 0,303 | 0 | 0,08 | todo en su casilla, cámara 0 |
| Torre negra h8 → e8 | 0,216 | 0,306 | 0 | 0,10 | todo en su casilla, cámara 0 |
| Torre come peón | 0,030 | 0,401 | 0 | 0,35 | 19 piezas, rocas 0 |
| Torre negra come peón | 0,030 | 0,394 | 0 | 0,35 | 19 piezas, rocas 0 |
| Peón come torre (punta a 0,137 del centro; pecho a 0,157) | 0,216 | 0,127 | 0 | 0,35 | 19 piezas, rocas 0 |
| Torre come torre | 0,127 | 0,379 | 0 | 0,35 | 19 piezas, rocas 0 |
