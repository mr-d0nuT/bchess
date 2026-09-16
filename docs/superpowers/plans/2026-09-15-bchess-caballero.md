# El caballero — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que los cuatro caballeros estén a caballo en el tablero, salten en L por encima de las piezas y que cada captura en la que participa un caballero sea su batalla con gag.

**Architecture:** El caballero es una pieza compuesta: un caballo con esqueleto de cuadrúpedo sobre una peana y un jinete con esqueleto humano sentado en su silla, con la lanza, la espada y el escudo enganchados. Un módulo puro calcula el arco del salto con las piezas que hay bajo el camino, y otro separa en piezas rígidas los triángulos de una extremidad. Su mover encadena salto, desmontar, montar y la huida o vuelta del caballo con el reloj de juego, pidiendo sitio a las piezas de alrededor como el gigante. Lo que comparten las capturas con gag (cámara lenta, sitio en abanico y rayos de contacto) sale de `smash.js` a `fight.js`, y cada batalla del caballero tiene su fichero.

**Tech Stack:** Three.js r186 en `vendor/three/`, módulos ES sin compilación, `node --test`, verificación por código en el panel de vista previa (servidor `bchess`, puerto 8741), Gemini y Tripo Studio en Chrome para los modelos, `@gltf-transform/cli` y `sharp` para los ficheros.

**Diseño:** `docs/superpowers/specs/2026-09-15-bchess-caballero-design.md`.

## Global Constraints

- Sin compilación: módulos ES con import map; Three.js r186 copiado en `vendor/three/`.
- Textos de la interfaz y comentarios en castellano; commits en castellano terminados en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Tono de dibujos animados y nunca hay sangre: la armadura está hueca y lo que salta son piezas de metal. Gana siempre el atacante.
- Sin sonido: el juego aún no tiene audio. Donde el diseño dice «suena a metal» o «ruido de metal», sale una onomatopeya de cómic («¡CLANC!») en un bocadillo.
- Medidas en casillas (1 casilla = 1 unidad). A caballo, unas 1,8 casillas hasta el penacho, peana incluida. A pie, el caballero mide 1,5 (el peón, 1,35; el gigante, 1,9).
- Peana: la de los peones de su color (radio 0,384 y alto 0,26), ensanchada 1,22 veces hasta un radio de 0,47.
- Salto: gira y se encabrita 0,4 s mientras la peana encoge. Entre los cascos y la pieza más alta bajo el camino quedan al menos 0,2 casillas, y el arco nunca sube menos de 0,8. Dura unos 0,9 s para una L. Aterriza con rebote, polvo y temblor ligero.
- Hacer sitio: las reglas de la torre (hueco mínimo 0,03; como mucho 0,45 desde el centro de la casilla; 1,2 casillas por segundo). El caballo, al andar, pide 0,8 casillas por delante.
- Batallas: unos 8 s (peón come caballero y caballero come peón), 15 s (caballero come caballero) y 9 s (con torre). El bocadillo dura 1,5 s.
- Los dos colores, idénticos en forma: la versión negra de cada imagen se edita desde la blanca, y cada modelo negro es una retextura del blanco; nunca se genera otro.
- Gigantes de las torres (petición del usuario del 2026-09-15): «los movimientos de ataque de las torres (ahora con la mano abierta) se ven muy cutres!! deberian ser cerrando el puño y dando puñetado de frente o un puñetaco de arriba a bajo machacando el craneo del oponente!». Se regeneran con los puños cerrados y pegan de frente o de arriba abajo; se publica antes que el caballero.
- Tripo: unos 375 créditos (250 del caballero y el caballo, cuando el diseño estimaba 230, y 125 de los gigantes con puños; quedan 2.650). Antes de pulsar, comprobar el coste que muestra cada botón. Caballero: esqueleto «v1.0 · humanoides». Caballo: esqueleto de cuadrúpedo «v2.5 · animales». No compartir clips entre esqueletos. Repasar cada movimiento en la galería antes de exportar. Al exportar: «Exportar esqueleto» activado, «Animación en el sitio» desactivado y «Seleccionar todo» con el contador N/N.
- Nunca teclear contraseñas ni datos de pago. No tocar Tripo si el usuario está exportando o pagando.
- Se trabaja en la rama `caballero`, porque `main` se publica sola en GitHub Pages. Se une a `main` al final.
- Los módulos que prueba `node --test` no importan `three` (en Node no hay import map).
- El panel de vista previa oculto corta cada llamada a los 45 s: las comprobaciones largas se lanzan en segundo plano, guardan el resultado en `window` y se consultan después.

---

## Estructura de ficheros

| Fichero | Tarea | Responsabilidad |
|---|---|---|
| `raw/ref/caballero-*.jpeg`, `raw/ref/caballo-*.jpeg` | 1 | Imágenes de referencia (no se publican). |
| `assets/models/knight-*.glb`, `black-knight-*.glb` | 2 | Caballeros con esqueleto humano y sus animaciones dentro. |
| `assets/models/horse-*.glb`, `black-horse-*.glb` | 3 | Caballos con esqueleto de cuadrúpedo y su paseo. |
| `src/rules/knight.js`, `tests/knight.test.js` | 4 | Puro: `knightMoves`. |
| `tests/pawn.test.js`, `tests/rook.test.js` | 4 | Peones y torres con caballeros en medio. |
| `src/moves/leap.js`, `tests/leap.test.js` | 5 | Puro: `planLeap`, `leapAt`. |
| `src/moves/walk.js`, `tests/walk.test.js` | 5 | `nearestEdgeExit`. |
| `src/pieces/skin.js`, `tests/skin.test.js` | 6 | Puro: `descendantsOf`, `trianglesOfBones`. |
| `src/pieces/horse-bones.js`, `tests/horse-bones.test.js` | 6 | Puro: `findHorseBones`. |
| `src/pieces/clips.js`, `tests/clips.test.js` | 6 | `pickDriftTrack`. |
| `src/combat/fight.js` | 7 | Cámara lenta, sitio en abanico y rayos de contacto, sacados de `smash.js`. |
| `src/combat/smash.js` | 7 | Las capturas de la torre, ya con `fight.js`. |
| `src/pieces/sword.js` | 8 | `createSword`. |
| `src/pieces/piece.js` | 8 | Huesos girados y encogidos, espada, lanza clavada y recogida, avisos según la pieza. |
| `src/pieces/flag.js` | 8 | Banderín sin mástil, para la lanza. |
| `src/combat/strikes.js` | 8 | Medidas de la espada (`blade`) y acciones a medir en `measureBody`. |
| `src/pieces/knight.js` | 9 | `loadKnightKit`, `spawnKnight`. |
| `src/moves/knight-mover.js` | 9 y 10 | `createKnightMover`. |
| `assets/models/manifest.json` | 9 | `white-knight` y `black-knight`. |
| `src/main.js` | 9 y 12 | Tipo de pieza `knight`: colocación, reglas, marcas y batallas. |
| `src/pieces/limbs.js` | 11 | `cutLimb`, `createDebris`. |
| `src/ui/bubble.js`, `src/ui/style.css` | 11 | `createBubbles`. |
| `src/combat/knight/battle.js` | 12 | `canKnightBattle`, `runKnightBattle` y los pasos comunes. |
| `src/combat/knight/pawn-kicks-knight.js` | 12 | Peón come caballero. |
| `src/combat/knight/knight-skewers-pawn.js` | 13 | Caballero come peón. |
| `src/combat/knight/black-knight.js` | 14 | Caballero come caballero. |
| `src/combat/knight/knight-sweeps-giant.js` | 15 | Caballero come torre. |
| `src/combat/knight/giant-squashes-knight.js` | 16 | Torre come caballero. |
| `raw/tmp/verificar-caballero.js`, `raw/tmp/verificar-batalla-caballero.js` | 9 a 16 | Comprobaciones por código (no se publican). |
| `README.md`, `index.html` | 17 | Documentación y título. |

Orden: las tareas 1 a 3 (modelos) y 4 a 7 (código puro y extracción) son independientes; mientras Tripo genera, se avanza con el código. La 8 no necesita modelos. La 9 necesita la 2, la 3 y la 8; la 10, la 9; la 11, la 8; y de la 12 a la 16, la 10 y la 11.

---

### Tarea 1: Imágenes de referencia

**Files:**
- Create (no se publican; `raw/` está en `.gitignore`): `raw/tmp/ref-caballero-blanco.png`, `raw/tmp/ref-caballero-negro.png`, `raw/ref/caballero-blanco.jpeg`, `raw/ref/caballero-negro.jpeg`, `raw/ref/caballo-blanco.jpeg`, `raw/ref/caballo-negro.jpeg`

**Interfaces:**
- Consumes: `raw/ref/piezas_white_front.png` y `raw/ref/piezas_black_front.png` (el caballero es la segunda figura) y `tools/silhouette.mjs`.
- Produces: las cuatro imágenes que suben a Tripo las tareas 2 y 3.

- [ ] **Paso 1: Recortar el caballero de las referencias**

Con la hoja entera, Gemini convierte todas las figuras; se recorta antes la segunda figura, de la punta de la lanza a la peana. El borde del escudo del peón asoma abajo a la izquierda del recorte, así que se tapa con el verde del fondo:

```bash
cd ~/bchess && node --input-type=module -e "
import sharp from 'sharp';
for (const [from, to] of [['piezas_white_front', 'ref-caballero-blanco'], ['piezas_black_front', 'ref-caballero-negro']]) {
  const crop = await sharp('raw/ref/' + from + '.png').extract({ left: 240, top: 8, width: 262, height: 740 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (8 * crop.info.width + 8) * crop.info.channels; // el fondo, en la esquina de arriba
  const background = { r: crop.data[at], g: crop.data[at + 1], b: crop.data[at + 2] };
  const patch = await sharp({ create: { width: 26, height: 330, channels: 3, background } }).png().toBuffer();
  const info = await sharp(crop.data, { raw: crop.info }).composite([{ input: patch, left: 0, top: 400 }]).png().toFile('raw/tmp/' + to + '.png');
  console.log(to, info.width, info.height, background);
}"
```

Expected: `ref-caballero-blanco 262 740 { r: …, g: …, b: … }` y lo mismo para el negro, con un verde. Mirar los dos recortes: el caballero entero, con la punta de la lanza y la peana, sin trozos del escudo del peón ni del alfil.

- [ ] **Paso 2: Cómo adjuntar y guardar en Gemini**

- Adjuntar: crear en la página de Gemini un `input[type=file]` propio, subir a él la imagen con `file_upload` y pegar `input.files` sobre el editor con un `ClipboardEvent('paste')` sintético (adjunta dos veces cada imagen, sin efecto en el resultado). Escribir el texto con `document.execCommand('insertText')` y enviar con el botón de enviar.
- Gemini rechaza un fichero con el mismo nombre que otro ya subido en la conversación: cada imagen se sube con su nombre.
- Guardar: descargar a tamaño completo y copiar la imagen más reciente de `~/Downloads`:

```bash
bash -c 'f=$(find "$HOME/Downloads" -maxdepth 1 -type f -Btime -60m \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) -exec stat -f "%B %N" {} \; | sort -n | tail -1 | cut -d" " -f2-); sips -s format jpeg -s formatOptions 92 "$f" --out ~/bchess/raw/ref/caballero-blanco.jpeg'
```

- Si Chrome ya no descarga (bloquea las descargas múltiples de gemini.google.com sin avisar): antes de copiar, guardar el texto del portapapeles del usuario con `pbpaste > ~/bchess/raw/tmp/portapapeles.txt`; pulsar «Copiar imagen» con un clic real; guardar la imagen y devolver el texto:

```bash
cd ~/bchess && osascript -e 'set f to open for access POSIX file "/Users/mr_donut/bchess/raw/tmp/gemini.png" with write permission' -e 'set eof f to 0' -e 'write (the clipboard as «class PNGf») to f' -e 'close access f' && sips -s format jpeg -s formatOptions 92 raw/tmp/gemini.png --out raw/ref/caballero-blanco.jpeg && pbcopy < raw/tmp/portapapeles.txt
```

En los pasos siguientes, cambiar el nombre de salida (`caballero-blanco.jpeg`) por el de cada imagen.

- [ ] **Paso 3: Caballero blanco a pie**

En una conversación nueva, con `raw/tmp/ref-caballero-blanco.png` adjunta:

> Toma como referencia al caballero de la imagen adjunta. Genera UNA sola imagen de ese mismo caballero, idéntico en armadura, yelmo cerrado con penacho blanco, cota de malla, hombreras y colores, con estos cambios: de pie en el suelo, sin caballo, sin peana, sin lanza y sin escudo; de frente, en pose A (brazos separados del cuerpo unos 30 grados, manos abiertas y piernas algo separadas); entero, centrado y con margen alrededor; luz de estudio suave y uniforme, sin sombras marcadas; fondo liso gris claro. Mismo estilo hiperrealista de figura pintada que la referencia.

Guardar como `raw/ref/caballero-blanco.jpeg`. Mirarla: el mismo caballero, a pie, con los brazos y las piernas separados del cuerpo.

- [ ] **Paso 4: Caballo blanco sin jinete**

En la misma conversación, con `raw/tmp/ref-caballero-blanco.png` adjunta otra vez:

> Toma como referencia el caballo de la imagen adjunta. Genera UNA sola imagen de ese mismo caballo, idéntico en capa, testera de plata, silla y gualdrapa crema con el león rampante azul, con estos cambios: sin jinete, sin lanza y sin peana; de pie y quieto sobre las cuatro patas, con la cabeza erguida; visto de lado y un poco de frente, en tres cuartos; la gualdrapa corta, por encima de las rodillas, para que se vean las cuatro patas separadas; entero, centrado y con margen alrededor; luz de estudio suave y uniforme; fondo liso gris claro. Mismo estilo hiperrealista de figura pintada que la referencia.

Guardar como `raw/ref/caballo-blanco.jpeg`. Mirarla: cuatro patas separadas, silla vacía y la cabeza entera.

- [ ] **Paso 5: Versiones negras**

En otra conversación, con `raw/ref/caballero-blanco.jpeg` y `raw/tmp/ref-caballero-negro.png` adjuntas:

> Edita la primera imagen: es el mismo caballero, con exactamente la misma pose, forma, tamaño, proporciones, encuadre, luz y fondo. Cambia solo los materiales para que sea el caballero negro de la segunda imagen: armadura de acero muy oscuro, casi negro, con remates dorados, y penacho rojo.

Guardar como `raw/ref/caballero-negro.jpeg`. Después, con `raw/ref/caballo-blanco.jpeg` y la misma referencia negra:

> Edita la primera imagen: es el mismo caballo, con exactamente la misma pose, forma, tamaño, proporciones, encuadre, luz y fondo. Cambia solo los materiales para que sea el caballo negro de la segunda imagen: capa marrón muy oscura, casi negra; testera dorada; silla oscura; gualdrapa roja y dorada con el grifo dorado.

Guardar como `raw/ref/caballo-negro.jpeg`.

- [ ] **Paso 6: Comparar proporciones**

```bash
cd ~/bchess && for f in caballero-blanco caballero-negro caballo-blanco caballo-negro; do node tools/silhouette.mjs raw/ref/$f.jpeg; done
```

Expected: el `ratio` de cada versión negra está a menos de un 3 % del de su blanca. Si no, repetir su edición pidiendo expresamente las mismas proporciones.

Nada que añadir a git: `raw/` no se publica.

---

### Tarea 2: Caballeros en Tripo y sus animaciones

**Files:**
- Create (no se publican): `raw/tripo/knight-candidatas.glb`, `raw/tripo/knight.glb`, `raw/tripo/black-knight-candidatas.glb`, `raw/tripo/black-knight.glb`
- Create: `assets/models/knight-ordenador.glb`, `assets/models/knight-movil.glb`, `assets/models/black-knight-ordenador.glb`, `assets/models/black-knight-movil.glb`

**Interfaces:**
- Consumes: `raw/ref/caballero-blanco.jpeg` y `raw/ref/caballero-negro.jpeg` (tarea 1).
- Produces: caballeros con el esqueleto humano de Tripo (41 huesos, los mismos que el peón: `Hip`, `Pelvis`, `Waist`, `Spine01`, `Spine02`, `NeckTwist01`, `NeckTwist02`, `Head`, `L_Clavicle`, `L_Upperarm`, `L_Forearm`, `L_Hand`, `L_Thigh`, `L_Calf`, `L_Foot`, `L_ToeBase`, los de la derecha con `R_` y los `*Twist*`) y, dentro del modelo, solo las animaciones elegidas. Las claves elegidas van a `rider.moves` del manifiesto (tarea 9).

- [ ] **Paso 1: Malla del caballero blanco**

Nuevo modelo desde `raw/ref/caballero-blanco.jpeg` con «Malla Smart» (el botón debe decir 65 créditos). Revisar la vista previa: armadura entera, yelmo con penacho, y brazos y piernas separados del cuerpo.

- [ ] **Paso 2: Textura**

«Texturizar» con la misma imagen (20 créditos).

- [ ] **Paso 3: Esqueleto**

Cambiar el desplegable a «v1.0 · humanoides» y después pulsar «Auto Rig» (20 créditos). Revisar que brazos y piernas siguen a sus huesos.

- [ ] **Paso 4: Candidatas de la biblioteca (gratis)**

Aplicar cada una buscándola por su nombre en castellano en «Buscar» y pulsando la primera tarjeta; esperar a que termine «Retargeting» (unos 30 s) antes del siguiente clic. Apuntar la clave inglesa de cada una (el nombre de su miniatura `.avif`).
- Ya conocidas: `idle`, `walk`, `jump_down`, `slash`, `chop`, `box_03`, `box_01`, `front_kick_01`, `front_kick_02`, `hit_to_head`, `hit_to_body_01`, `hit_to_stomach`, `fall`, `defeat_03`, `angry_01`, `cheer` y `frightened`.
- Por buscar, si existen: parar con el escudo («bloquear», «defender», «parar»), levantarse («levantarse»), mareado («mareado», «tambalearse») y saltar a la pata coja («pata coja»).

- [ ] **Paso 5: Exportar las candidatas**

«Exportar» en GLB con «Exportar esqueleto» activado y «Animación en el sitio» desactivado. En «Número de animaciones» → «Elegir animaciones», pulsar «Seleccionar todo» y comprobar que el contador dice N/N. Descargar a `raw/tripo/knight-candidatas.glb` y comprobarlo:

```bash
cd ~/bchess && node -e 'const b=require("fs").readFileSync(process.argv[1]); const j=JSON.parse(b.toString("utf8",20,20+b.readUInt32LE(12))); console.log(b.readUInt32LE(8)===b.length ? "completo" : "INCOMPLETO"); console.log(j.skins[0].joints.map(i=>j.nodes[i].name).join(" ")); console.log((j.animations??[]).map(a=>a.name).join(", "))' raw/tripo/knight-candidatas.glb
```

Expected: `completo`, los 41 huesos de arriba y una animación por candidata aplicada.

- [ ] **Paso 6: Elegir en la galería**

Abrir `http://localhost:8741/tools/anim-gallery.html`, escribir la ruta `../raw/tripo/knight-candidatas.glb` y pulsar «Cargar». En las hojas de frente y de perfil, elegir y apuntar, con los segundos a los que conviene cortar las que sigan después del gesto:
- `idle`, `walk` y `jump_down` (para bajar del caballo; que caiga en el sitio);
- ataques: el tajo `slash` y 2 estocadas (`box_03`, `box_01`) con el brazo derecho recto hacia delante. `chop` («talar») es exactamente la misma animación que `slash`, dato a dato: sobra;
- `block`: la biblioteca no tiene paradas; se queda vacía;
- `kick`: `front_kick_02` y `front_kick_01` (las dos giran el cuerpo; se ve en el juego cuál avanza más);
- `hit`: `hit_to_head`, `hit_to_body_01` y `hit_to_stomach`, que no se salen de su casilla;
- `fall`: `fall`; `defeat`: `defeat_03`;
- `taunt`: `angry_01`; `victory`: `cheer`, cortada a 3,2 s; `fidget`: `frightened`;
- `getup`, `dizzy` y `hop` no existen en la biblioteca.

- [ ] **Paso 7: Dejar solo las elegidas y aligerar**

Las 16 claves elegidas en el paso 6:

```bash
cd ~/bchess && node tools/keep-anims.mjs raw/tripo/knight-candidatas.glb raw/tripo/knight.glb idle,walk,jump_down,slash,box_03,box_01,front_kick_01,front_kick_02,hit_to_head,hit_to_body_01,hit_to_stomach,fall,defeat_03,angry_01,cheer,frightened
bash tools/optimize-model.sh raw/tripo/knight.glb knight
```

Expected: `raw/tripo/knight.glb: N animaciones (…)` sin «faltan»; `knight-ordenador.glb` pesa menos de 3 MB y `knight-movil.glb`, menos de 1,5 MB.

- [ ] **Paso 8: Caballero negro**

Sobre la misma malla blanca, «Texturizar» con `raw/ref/caballero-negro.jpeg` (20 créditos). La retextura conserva el esqueleto: no pulsar «Auto Rig». Aplicar exactamente las claves elegidas, exportar como en el paso 5 a `raw/tripo/black-knight-candidatas.glb` y comprobarlo con la orden del paso 5. Después:

```bash
cd ~/bchess && node tools/keep-anims.mjs raw/tripo/black-knight-candidatas.glb raw/tripo/black-knight.glb idle,walk,jump_down,slash,box_03,box_01,front_kick_01,front_kick_02,hit_to_head,hit_to_body_01,hit_to_stomach,fall,defeat_03,angry_01,cheer,frightened
bash tools/optimize-model.sh raw/tripo/black-knight.glb black-knight
```

Expected: las mismas animaciones que el blanco y pesos parecidos.

- [ ] **Paso 9: Commit**

```bash
git add assets/models/knight-ordenador.glb assets/models/knight-movil.glb assets/models/black-knight-ordenador.glb assets/models/black-knight-movil.glb
git commit -m "Modelos de los caballeros blanco y negro con sus animaciones" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 3: Caballos en Tripo

**Files:**
- Create (no se publican): `raw/tripo/horse.glb`, `raw/tripo/black-horse.glb`
- Create: `assets/models/horse-ordenador.glb`, `assets/models/horse-movil.glb`, `assets/models/black-horse-ordenador.glb`, `assets/models/black-horse-movil.glb`

**Interfaces:**
- Consumes: `raw/ref/caballo-blanco.jpeg` y `raw/ref/caballo-negro.jpeg` (tarea 1).
- Produces: caballos con esqueleto de cuadrúpedo y la animación `walk` dentro. Los nombres de sus huesos no hacen falta: `findHorseBones` (tarea 6) encuentra las patas, la silla y hacia dónde mira por la posición de los huesos, y `pickDriftTrack` (tarea 6), el hueso que avanza al andar.

- [ ] **Paso 1: Malla del caballo blanco**

Nuevo modelo desde `raw/ref/caballo-blanco.jpeg` con «Malla Smart» (65 créditos). Revisar la vista previa: cuatro patas separadas, cabeza, cola y silla.

- [ ] **Paso 2: Textura**

«Texturizar» con la misma imagen (20 créditos).

- [ ] **Paso 3: Esqueleto de cuadrúpedo**

Dejar el desplegable en «v2.5 · animales» y pulsar «Auto Rig» (20 créditos). Revisar que cada pata sigue a sus huesos.

- [ ] **Paso 4: Movimientos**

En la biblioteca de cuadrúpedos, aplicar «caminar» (`walk`) y, si aparecen, «reposo» (`idle`) y «correr» (`run`). La documentación de Tripo solo lista `walk` para este esqueleto (https://developers.tripo3d.ai/en/docs/animations-retarget). Revisar el paseo en el visor: las patas no se cruzan y los cascos tocan el suelo.

- [ ] **Paso 5: Exportar y comprobar**

Exportar como en la tarea 2, paso 5, a `raw/tripo/horse.glb`, y comprobarlo con su orden cambiando el fichero.

Expected: `completo`, un esqueleto con cuatro cadenas de huesos para las patas y la animación `walk`.

- [ ] **Paso 6: Caballo negro**

Sobre la misma malla blanca, «Texturizar» con `raw/ref/caballo-negro.jpeg` (20 créditos), sin volver a pulsar «Auto Rig». Aplicar los mismos movimientos, exportar a `raw/tripo/black-horse.glb` y comprobarlo igual.

- [ ] **Paso 7: Aligerar**

```bash
cd ~/bchess && bash tools/optimize-model.sh raw/tripo/horse.glb horse
bash tools/optimize-model.sh raw/tripo/black-horse.glb black-horse
```

Expected: los cuatro ficheros; los de ordenador pesan menos de 3 MB y los de móvil, menos de 1,5 MB.

- [ ] **Paso 8: Commit**

```bash
git add assets/models/horse-ordenador.glb assets/models/horse-movil.glb assets/models/black-horse-ordenador.glb assets/models/black-horse-movil.glb
git commit -m "Modelos de los caballos blanco y negro" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 4: Reglas del caballero

**Files:**
- Create: `src/rules/knight.js`, `tests/knight.test.js`
- Modify: `tests/pawn.test.js`, `tests/rook.test.js`

**Interfaces:**
- Produces: `knightMoves(square: string, occupied: Set<string>, enemies: Set<string>) → { moves: string[], captures: string[] }`. Orden de los saltos, en el sentido de las agujas del reloj desde arriba a la derecha: `[1, 2]`, `[2, 1]`, `[2, -1]`, `[1, -2]`, `[-1, -2]`, `[-2, -1]`, `[-2, 1]`, `[-1, 2]` ([columnas, filas]).

- [ ] **Paso 1: Pruebas**

`tests/knight.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { knightMoves } from '../src/rules/knight.js';

test('desde el centro salta a las ocho casillas en L', () => {
  assert.deepEqual(knightMoves('d4', new Set(['d4']), new Set()), {
    moves: ['e6', 'f5', 'f3', 'e2', 'c2', 'b3', 'b5', 'c6'],
    captures: [],
  });
});

test('desde una esquina y un borde no se sale del tablero', () => {
  assert.deepEqual(knightMoves('a1', new Set(['a1']), new Set()), { moves: ['b3', 'c2'], captures: [] });
  assert.deepEqual(knightMoves('h5', new Set(['h5']), new Set()), { moves: ['g3', 'f4', 'f6', 'g7'], captures: [] });
});

test('salta por encima de las piezas; solo le para una propia en la casilla de llegada', () => {
  const occupied = new Set(['b1', 'a1', 'c1', 'a2', 'b2', 'c2', 'd2']);
  assert.deepEqual(knightMoves('b1', occupied, new Set()), { moves: ['c3', 'a3'], captures: [] });
});

test('come a un enemigo en la casilla de llegada', () => {
  assert.deepEqual(knightMoves('b1', new Set(['b1', 'c3', 'a3', 'd2']), new Set(['c3'])), { moves: [], captures: ['c3'] });
});

test('una casilla no válida lanza error', () => {
  assert.throws(() => knightMoves('z0', new Set(), new Set()), /Casilla no válida/);
});
```

Al final de `tests/pawn.test.js`:

```js
test('los caballeros bloquean a los peones y se pueden comer en diagonal', () => {
  assert.deepEqual(pawnMoves('g2', new Set(['g2', 'g3']), 'white'), []);
  assert.deepEqual(pawnCaptures('a7', new Set(['b6']), 'black'), ['b6']);
});
```

Al final de `tests/rook.test.js`:

```js
test('un caballero propio detiene a la torre y uno enemigo se lo come', () => {
  assert.deepEqual(rookMoves('a1', new Set(['a1', 'a2', 'b1']), new Set()), { moves: [], captures: [] });
  assert.deepEqual(rookMoves('a1', new Set(['a1', 'a3', 'b1']), new Set(['a3'])), { moves: ['a2'], captures: ['a3'] });
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd ~/bchess && node --test tests/knight.test.js tests/pawn.test.js tests/rook.test.js`
Expected: `knight.test.js` falla con `ERR_MODULE_NOT_FOUND`. Las pruebas nuevas de peón y torre pasan ya, porque sus reglas no distinguen tipos de pieza; quedan escritas.

- [ ] **Paso 3: Implementación**

`src/rules/knight.js`:

```js
// Movimientos del caballero: en L, dos casillas en una dirección y una en perpendicular, saltando por
// encima de cualquier pieza. No puede ir a una casilla con una pieza propia; si en ella hay una
// enemiga, puede comérsela.

const FILES = 'abcdefgh';
// [columnas, filas], en el sentido de las agujas del reloj desde arriba a la derecha.
const JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

// `occupied`: casillas con alguna pieza; `enemies`: las que ocupan piezas del otro bando.
export function knightMoves(square, occupied, enemies) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Casilla no válida: ${square}`);
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  const moves = [];
  const captures = [];
  for (const [df, dr] of JUMPS) {
    const f = file + df;
    const r = rank + dr;
    if (f < 0 || f > 7 || r < 1 || r > 8) continue;
    const target = FILES[f] + r;
    if (enemies.has(target)) captures.push(target);
    else if (!occupied.has(target)) moves.push(target);
  }
  return { moves, captures };
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

- [ ] **Paso 5: Commit**

```bash
git add src/rules/knight.js tests/knight.test.js tests/pawn.test.js tests/rook.test.js
git commit -m "Reglas de movimiento y captura del caballero" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 5: Arco del salto y borde de huida

**Files:**
- Create: `src/moves/leap.js`, `tests/leap.test.js`
- Modify: `src/moves/walk.js`, `tests/walk.test.js`

**Interfaces:**
- Produces:
  - constantes `LEAP_CLEARANCE = 0.2`, `LEAP_MIN_PEAK = 0.8`, `LEAP_SPEED = 2.5`, `LEAP_GRAVITY = 25`;
  - `arcShape(k) → number`, de 0 a 1;
  - `planLeap({ from: {x, z}, to: {x, z}, points: {x, y, z}[], halfLength, halfWidth, clearance?, minPeak? }) → { from, to, distance, heading, peak, duration }`; `peak` es la altura de los cascos en lo más alto;
  - `leapAt(plan, u) → { x, y, z, climb }`, con `u` de 0 (despega) a 1 (aterriza) y `climb` en radianes;
  - en `walk.js`: `BOARD_EDGE = 4.5` y `nearestEdgeExit(point: {x, z}, edge = BOARD_EDGE) → { x, z }`.

- [ ] **Paso 1: Pruebas**

`tests/leap.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEAP_CLEARANCE, LEAP_GRAVITY, LEAP_MIN_PEAK, LEAP_SPEED, arcShape, leapAt, planLeap } from '../src/moves/leap.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} no es ≈ ${b}`);
// Una L de b1 a c3: dos casillas hacia las negras (-Z) y una a la derecha (+X).
const B1 = { x: -2.5, z: 3.5 };
const C3 = { x: -1.5, z: 1.5 };
const HORSE = { halfLength: 0.47, halfWidth: 0.3 };
// Poste vertical fino en (x, z): puntos cada 0,1 casillas hasta `height`.
const pole = (x, z, height) => Array.from({ length: Math.round(height * 10) + 1 }, (_, i) => ({ x, y: i / 10, z }));

// Comprueba en 1000 instantes del camino que los cascos van LEAP_CLEARANCE por encima de cada punto
// que tienen debajo.
function assertClears(plan, points) {
  const ux = (plan.to.x - plan.from.x) / plan.distance;
  const uz = (plan.to.z - plan.from.z) / plan.distance;
  for (let i = 1; i < 1000; i++) {
    const k = i / 1000;
    for (const p of points) {
      const along = (p.x - plan.from.x) * ux + (p.z - plan.from.z) * uz;
      const aside = Math.abs((p.x - plan.from.x) * uz - (p.z - plan.from.z) * ux);
      if (aside > HORSE.halfWidth || Math.abs(along - k * plan.distance) > HORSE.halfLength) continue;
      assert.ok(plan.peak * arcShape(k) >= p.y + LEAP_CLEARANCE - 1e-9, `a ${k} del camino, ${plan.peak * arcShape(k)} < ${p.y + LEAP_CLEARANCE}`);
    }
  }
}

test('sin piezas debajo, el arco sube lo mínimo y una L dura ~0,9 s', () => {
  const plan = planLeap({ from: B1, to: C3, ...HORSE });
  close(plan.peak, LEAP_MIN_PEAK);
  close(plan.distance, Math.sqrt(5));
  close(plan.duration, Math.sqrt(5) / LEAP_SPEED);
  close(plan.heading, Math.atan2(1, -2));
});

test('una pieza bajo el camino levanta el arco lo justo para librarla', () => {
  const points = pole(-2, 2.5, 1.61);
  const plan = planLeap({ from: B1, to: C3, points, ...HORSE });
  assert.ok(plan.peak >= 1.61 + LEAP_CLEARANCE, `peak ${plan.peak}`);
  assert.ok(plan.peak < 2.4, `peak ${plan.peak}`);
  assertClears(plan, points);
});

test('una lanza pegada al camino, cerca de la salida, también se libra', () => {
  const points = [...pole(-2.17, 2.5, 2.54), ...pole(-2.5, 2.5, 0.26)];
  const plan = planLeap({ from: B1, to: C3, points, ...HORSE });
  assertClears(plan, points);
});

test('lo que queda fuera de la huella no cuenta', () => {
  const aside = planLeap({ from: B1, to: C3, points: pole(-3.5, 2.5, 3), ...HORSE });
  close(aside.peak, LEAP_MIN_PEAK);
  const behind = planLeap({ from: B1, to: C3, points: pole(-2.5, 4.5, 3), ...HORSE });
  close(behind.peak, LEAP_MIN_PEAK);
});

test('un salto muy alto tarda más', () => {
  const plan = planLeap({ from: B1, to: C3, points: pole(-2, 2.5, 4), ...HORSE });
  close(plan.duration, Math.sqrt((8 * plan.peak) / LEAP_GRAVITY));
  assert.ok(plan.duration > Math.sqrt(5) / LEAP_SPEED);
});

test('leapAt sale de la salida, llega al destino y sube hasta la mitad', () => {
  const plan = planLeap({ from: B1, to: C3, ...HORSE });
  const start = leapAt(plan, 0);
  close(start.x, B1.x);
  close(start.z, B1.z);
  close(start.y, 0);
  const end = leapAt(plan, 1);
  close(end.x, C3.x);
  close(end.z, C3.z);
  close(end.y, 0);
  const middle = leapAt(plan, 0.5);
  close(middle.x, -2);
  close(middle.z, 2.5);
  close(middle.y, plan.peak);
  assert.ok(leapAt(plan, 0.2).climb > 0 && leapAt(plan, 0.8).climb < 0);
  close(middle.climb, 0, 1e-6);
});

test('un salto sin distancia lanza error', () => {
  assert.throws(() => planLeap({ from: B1, to: B1, ...HORSE }), /destino distinto/);
});
```

En `tests/walk.test.js`, la importación pasa a:

```js
import { BOARD_EDGE, nearestEdgeExit, planWalk, pointAlong, shortestTurn, strideSpeed, REST_FACING, restFacingFor } from '../src/moves/walk.js';
```

y al final:

```js
test('nearestEdgeExit sale en línea recta por el borde más cercano del marco', () => {
  assert.deepEqual(nearestEdgeExit({ x: 3.2, z: -1 }), { x: BOARD_EDGE, z: -1 });
  assert.deepEqual(nearestEdgeExit({ x: -0.5, z: -3.9 }), { x: -0.5, z: -BOARD_EDGE });
  assert.deepEqual(nearestEdgeExit({ x: 1, z: 2.5 }), { x: 1, z: BOARD_EDGE });
  assert.deepEqual(nearestEdgeExit({ x: -2, z: 2 }), { x: -BOARD_EDGE, z: 2 });
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd ~/bchess && node --test tests/leap.test.js tests/walk.test.js`
Expected: `leap.test.js` falla con `ERR_MODULE_NOT_FOUND` y `walk.test.js`, con `does not provide an export named 'BOARD_EDGE'`.

- [ ] **Paso 3: Implementación**

`src/moves/leap.js`:

```js
// Salto de ajedrez del caballo (diseño, sección 4). Todo puro y en casillas. La altura del arco
// depende de lo que hay bajo el camino: `points` son puntos { x, y, z } de las superficies de las
// demás piezas. Mientras la huella del caballo pasa sobre un punto, sus cascos van al menos
// LEAP_CLEARANCE por encima. La huella es un rectángulo de 2·halfLength por 2·halfWidth centrado en
// el caballo y alineado con el camino.

export const LEAP_CLEARANCE = 0.2;
export const LEAP_MIN_PEAK = 0.8;
export const LEAP_SPEED = 2.5; // casillas por segundo en horizontal: una L (√5) en ~0,9 s
export const LEAP_GRAVITY = 25; // de dibujos animados: los saltos altos tardan algo más
const SAMPLES = 64; // tramos en los que se tantea el camino

// Altura del arco (de 0 a 1) cuando ha recorrido la fracción `k` del camino: sube casi en vertical
// al despegar y baja casi en vertical al aterrizar, para librar las piezas pegadas a la salida y a
// la llegada.
export function arcShape(k) {
  return 2 * Math.sqrt(Math.max(0, k * (1 - k)));
}

// Altura máxima, duración y orientación del salto de `from` a `to` ({x, z}).
export function planLeap({ from, to, points = [], halfLength, halfWidth, clearance = LEAP_CLEARANCE, minPeak = LEAP_MIN_PEAK }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (!(distance > 0)) throw new Error('El salto necesita un destino distinto de la salida');
  const ux = dx / distance;
  const uz = dz / distance;
  // Cada punto, en coordenadas del camino: cuánto avanza (`along`) y a qué altura está.
  const under = [];
  for (const p of points) {
    const along = (p.x - from.x) * ux + (p.z - from.z) * uz;
    const aside = Math.abs((p.x - from.x) * uz - (p.z - from.z) * ux);
    if (aside <= halfWidth && along >= -halfLength && along <= distance + halfLength) under.push({ along, y: p.y });
  }
  // Entre dos muestras, un punto puede entrar en la huella: se cuenta desde una muestra antes y hasta
  // una después. Como el arco es cóncavo, basta con cumplir en las muestras.
  const reach = halfLength + distance / SAMPLES;
  let peak = minPeak;
  for (let i = 1; i < SAMPLES; i++) {
    const k = i / SAMPLES;
    let top = -Infinity;
    for (const p of under) if (Math.abs(p.along - k * distance) <= reach) top = Math.max(top, p.y);
    if (top > -Infinity) peak = Math.max(peak, (top + clearance) / arcShape(k));
  }
  return {
    from: { x: from.x, z: from.z },
    to: { x: to.x, z: to.z },
    distance,
    heading: Math.atan2(dx, dz),
    peak,
    duration: Math.max(distance / LEAP_SPEED, Math.sqrt((8 * peak) / LEAP_GRAVITY)),
  };
}

// Dónde van los cascos en el instante `u` del salto (0 al despegar, 1 al aterrizar). Avanza despacio
// al principio y al final. `climb` es el ángulo con el que sube (positivo) o baja (negativo).
export function leapAt(plan, u) {
  const t = Math.min(1, Math.max(0, u));
  const k = t * t * (3 - 2 * t);
  const e = 1e-3;
  const k0 = Math.max(0, k - e);
  const k1 = Math.min(1, k + e);
  return {
    x: plan.from.x + (plan.to.x - plan.from.x) * k,
    y: plan.peak * arcShape(k),
    z: plan.from.z + (plan.to.z - plan.from.z) * k,
    climb: Math.atan2(plan.peak * (arcShape(k1) - arcShape(k0)), plan.distance * (k1 - k0)),
  };
}
```

En `src/moves/walk.js`, después de `const FACING_BY_COLOR = { white: Math.PI, black: 0 };`:

```js
export const BOARD_EDGE = 4.5; // del centro del tablero al borde de su marco
```

y al final del fichero:

```js
// Punto del borde del marco más cercano a `point`, en línea recta hacia fuera: por donde huye un
// caballo. A igual distancia de dos bordes, sale por los lados (eje X).
export function nearestEdgeExit(point, edge = BOARD_EDGE) {
  if (Math.abs(point.x) >= Math.abs(point.z)) return { x: point.x < 0 ? -edge : edge, z: point.z };
  return { x: point.x, z: point.z < 0 ? -edge : edge };
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd ~/bchess && npm test`
Expected: todas pasan. Como referencia, una L de b1 a c3 entre los peones de b2 y c2 (con sus lanzas de 2,54 de alto) sube a unas 3,1 casillas y dura 1 s.

- [ ] **Paso 5: Commit**

```bash
git add src/moves/leap.js tests/leap.test.js src/moves/walk.js tests/walk.test.js
git commit -m "Arco del salto del caballo y borde por el que huye" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 6: Piel, huesos del caballo y pista de avance

**Files:**
- Create: `src/pieces/skin.js`, `tests/skin.test.js`, `src/pieces/horse-bones.js`, `tests/horse-bones.test.js`
- Modify: `src/pieces/clips.js`, `tests/clips.test.js`

**Interfaces:**
- Produces:
  - `descendantsOf(parents: number[], root: number) → Set<number>`;
  - `trianglesOfBones({ index: number[] | null, count?: number, skinIndex, skinWeight, bones: Set<number>, share = 0.5 }) → number[]`, índices de vértice de tres en tres;
  - `findHorseBones(bones: { name, parent: string | null, x, y, z }[]) → { yaw, legs: { frontLeft, frontRight, backLeft, backRight }, seatZ }`: cada pata es una lista de nombres de hueso de arriba abajo; `yaw` hace que el caballo mire a +Z y `seatZ` va en ese giro;
  - `pickDriftTrack(tracks: { name, times, values }[]) → string | null`.

- [ ] **Paso 1: Pruebas**

`tests/skin.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descendantsOf, trianglesOfBones } from '../src/pieces/skin.js';

test('descendantsOf reúne el hueso y todo lo que cuelga de él', () => {
  const parents = [-1, 0, 1, 1, 0, 4]; // 0 raíz; 1 brazo con 2 y 3; 4 pierna con 5
  assert.deepEqual([...descendantsOf(parents, 1)].sort(), [1, 2, 3]);
  assert.deepEqual([...descendantsOf(parents, 0)].sort(), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual([...descendantsOf(parents, 5)], [5]);
});

// Seis vértices en dos triángulos: el primero, del hueso 1; el segundo, con un vértice del hueso 0.
const skin = {
  skinIndex: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  skinWeight: [1, 0, 0, 0, 1, 0, 0, 0, 0.6, 0.4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
};

test('trianglesOfBones se queda con los triángulos que mueven esos huesos', () => {
  assert.deepEqual(trianglesOfBones({ index: [0, 1, 2, 3, 4, 5], ...skin, bones: new Set([1]) }), [0, 1, 2]);
  assert.deepEqual(trianglesOfBones({ index: [0, 1, 2, 3, 4, 5], ...skin, bones: new Set([0, 1]) }), [0, 1, 2, 3, 4, 5]);
});

test('trianglesOfBones: un vértice repartido cuenta si llega a la parte pedida', () => {
  assert.deepEqual(trianglesOfBones({ index: [0, 1, 2], ...skin, bones: new Set([1]), share: 0.7 }), []);
});

test('trianglesOfBones sin índices recorre los vértices de tres en tres', () => {
  assert.deepEqual(trianglesOfBones({ count: 6, ...skin, bones: new Set([1]) }), [0, 1, 2]);
});
```

`tests/horse-bones.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findHorseBones } from '../src/pieces/horse-bones.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} no es ≈ ${b}`);
// Caballo de prueba que mira hacia +X: su izquierda está en -Z. Cada pata tiene tres huesos, de la
// cadera o el hombro al casco.
const leg = (prefix, parent, x, z) => [
  { name: `${prefix}1`, parent, x, y: 0.5, z },
  { name: `${prefix}2`, parent: `${prefix}1`, x, y: 0.25, z },
  { name: `${prefix}3`, parent: `${prefix}2`, x, y: 0, z },
];
const HORSE = [
  { name: 'Raiz', parent: null, x: 0, y: 0.6, z: 0 },
  { name: 'Pelvis', parent: 'Raiz', x: -0.3, y: 0.6, z: 0 },
  { name: 'Pecho', parent: 'Raiz', x: 0.3, y: 0.62, z: 0 },
  { name: 'Cuello', parent: 'Pecho', x: 0.45, y: 0.8, z: 0 },
  { name: 'Cabeza', parent: 'Cuello', x: 0.55, y: 0.95, z: 0 },
  { name: 'Cola', parent: 'Pelvis', x: -0.45, y: 0.5, z: 0 },
  ...leg('TI', 'Pelvis', -0.3, -0.1),
  ...leg('TD', 'Pelvis', -0.3, 0.1),
  ...leg('DI', 'Pecho', 0.3, -0.1),
  ...leg('DD', 'Pecho', 0.3, 0.1),
];

test('encuentra hacia dónde mira y el giro que lo pone mirando a +Z', () => {
  close(findHorseBones(HORSE).yaw, -Math.PI / 2);
});

test('separa las cuatro patas, de arriba abajo, delanteras e izquierdas incluidas', () => {
  assert.deepEqual(findHorseBones(HORSE).legs, {
    frontLeft: ['DI1', 'DI2', 'DI3'],
    frontRight: ['DD1', 'DD2', 'DD3'],
    backLeft: ['TI1', 'TI2', 'TI3'],
    backRight: ['TD1', 'TD2', 'TD3'],
  });
});

test('la silla va en el lomo, más cerca de las patas delanteras', () => {
  close(findHorseBones(HORSE).seatZ, -0.3 + 0.6 * 0.6);
});

test('sin cuatro puntas, lanza error', () => {
  assert.throws(() => findHorseBones(HORSE.slice(0, 6)), /cuatro patas/);
});
```

En `tests/clips.test.js`, la importación pasa a:

```js
import {
  ACTIONS, findClipName, mapClips, pickDriftTrack, pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion,
} from '../src/pieces/clips.js';
```

y al final:

```js
test('pickDriftTrack elige la pista de posición que más avanza', () => {
  const tracks = [
    { name: 'Lomo.position', times: [0, 1], values: [0, 0, 1, 0, 0.02, 1.01] },
    { name: 'Raiz.position', times: [0, 0.5, 1], values: [0, 0, 0.9, 0, -0.6, 0.92, 0, -1.2, 0.9] },
    { name: 'Pata.quaternion', times: [0, 1], values: [0, 0, 0, 1, 0, 0.7, 0, 0.7] },
  ];
  assert.equal(pickDriftTrack(tracks), 'Raiz.position');
});

test('pickDriftTrack devuelve null si ninguna pista de posición se mueve', () => {
  assert.equal(pickDriftTrack([{ name: 'Raiz.position', times: [0, 1], values: [0, 1, 0, 0, 1, 0] }]), null);
  assert.equal(pickDriftTrack([]), null);
});
```

- [ ] **Paso 2: Comprobar que fallan**

Run: `cd ~/bchess && node --test tests/skin.test.js tests/horse-bones.test.js tests/clips.test.js`
Expected: los dos ficheros nuevos fallan con `ERR_MODULE_NOT_FOUND` y `clips.test.js`, con `does not provide an export named 'pickDriftTrack'`.

- [ ] **Paso 3: Implementación**

`src/pieces/skin.js`:

```js
// Piel de una malla con esqueleto, pura: qué huesos cuelgan de otro y qué triángulos mueve un grupo de
// huesos. Sirve para separar una extremidad en una pieza rígida (`limbs.js`).

// Índices de `root` y de todos los huesos que cuelgan de él. `parents[i]` es el índice del padre del
// hueso i en la misma lista, o -1.
export function descendantsOf(parents, root) {
  const found = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    parents.forEach((parent, i) => {
      if (!found.has(i) && found.has(parent)) {
        found.add(i);
        grew = true;
      }
    });
  }
  return found;
}

// Triángulos cuyos tres vértices dependen sobre todo de `bones` (al menos `share` de su peso).
// `index` son los vértices de los triángulos, de tres en tres, o null si la malla no tiene índices (y
// entonces hay `count` vértices seguidos); `skinIndex` y `skinWeight`, cuatro huesos y cuatro pesos por
// vértice. Devuelve los índices de vértice de esos triángulos, de tres en tres.
export function trianglesOfBones({ index = null, count = 0, skinIndex, skinWeight, bones, share = 0.5 }) {
  const vertices = skinWeight.length / 4;
  const owned = new Uint8Array(vertices);
  for (let v = 0; v < vertices; v++) {
    let inside = 0;
    let total = 0;
    for (let j = 0; j < 4; j++) {
      const weight = skinWeight[v * 4 + j];
      total += weight;
      if (bones.has(skinIndex[v * 4 + j])) inside += weight;
    }
    owned[v] = total > 0 && inside / total >= share ? 1 : 0;
  }
  const corners = index ? index.length : count;
  const triangles = [];
  for (let i = 0; i + 2 < corners; i += 3) {
    const a = index ? index[i] : i;
    const b = index ? index[i + 1] : i + 1;
    const c = index ? index[i + 2] : i + 2;
    if (owned[a] && owned[b] && owned[c]) triangles.push(a, b, c);
  }
  return triangles;
}
```

`src/pieces/horse-bones.js`:

```js
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
```

En `src/pieces/clips.js`, después de `pickRootPositionTrack`:

```js
// Pista de posición que más se desplaza del primer al último fotograma: la del hueso que lleva el
// avance en un esqueleto con nombres desconocidos (el caballo de Tripo). `tracks` son { name, times,
// values }; null si ninguna se mueve.
export function pickDriftTrack(tracks) {
  let best = null;
  for (const track of tracks) {
    const n = track.times.length;
    if (!track.name.endsWith('.position') || n < 2) continue;
    const moved = Math.hypot(
      track.values[(n - 1) * 3] - track.values[0],
      track.values[(n - 1) * 3 + 1] - track.values[1],
      track.values[(n - 1) * 3 + 2] - track.values[2],
    );
    if (moved > 1e-6 && (!best || moved > best.moved)) best = { name: track.name, moved };
  }
  return best?.name ?? null;
}
```

- [ ] **Paso 4: Comprobar que pasan**

Run: `cd ~/bchess && npm test`
Expected: todas pasan.

- [ ] **Paso 5: Comprobar con los modelos reales**

Con la tarea 3 hecha, en la consola de la vista previa:

```js
const { GLTFLoader } = await import('/vendor/three/examples/jsm/loaders/GLTFLoader.js');
const { MeshoptDecoder } = await import('/vendor/three/examples/jsm/libs/meshopt_decoder.module.js');
const { fitToHeight } = await import('/src/pieces/piece.js');
const { findHorseBones } = await import('/src/pieces/horse-bones.js');
const { pickDriftTrack } = await import('/src/pieces/clips.js');
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('assets/models/horse-ordenador.glb');
fitToHeight(gltf.scene, 0.9);
gltf.scene.updateMatrixWorld(true);
const bones = [];
gltf.scene.traverse((o) => { if (o.isBone) { const p = o.getWorldPosition(new (o.position.constructor)()); bones.push({ name: o.name, parent: o.parent?.isBone ? o.parent.name : null, x: p.x, y: p.y, z: p.z }); } });
JSON.stringify({ ...findHorseBones(bones), avance: gltf.animations.map((clip) => [clip.name, pickDriftTrack(clip.tracks)]) });
```

Expected: cuatro patas con al menos dos huesos cada una, un `yaw` que al aplicarlo deja la cabeza delante (en la tarea 9 se ve), `seatZ` entre las patas traseras y las delanteras, y para `walk` el nombre de la pista del hueso que avanza.

- [ ] **Paso 6: Commit**

```bash
git add src/pieces/skin.js tests/skin.test.js src/pieces/horse-bones.js tests/horse-bones.test.js src/pieces/clips.js tests/clips.test.js
git commit -m "Triángulos por hueso, patas del caballo y pista de avance" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 7: Lo que comparten las capturas con gag, en `fight.js`

**Files:**
- Create: `src/combat/fight.js`
- Modify: `src/combat/smash.js` (se sustituye entero)

**Interfaces:**
- Consumes: `gripSlideForReach` (`plan.js`), `skinnedMeshes` (`strikes.js`), `FAN_SECTORS`, `fanReach` y `joinReach` (`room.js`).
- Produces, desde `src/combat/fight.js`:
  - constantes `HIT_STOP = 0.1`, `SLOW_MOTION = 0.3`, `SLOW_BEFORE = 0.35`, `SLOW_AFTER = 0.45`, `KNOCKBACK = 0.2`;
  - `shuffled(list, random)`;
  - con un puesto `post = { entry, fans, margin, at: {x, z}, facing, parts: { action, key, seconds? }[] }`: `stanceOf(post) → { at, facing, reach }`, `overlapOf(crowd, owners, posts) → number` y `choose(post, action, { overlap, random, seconds?, optional?, cost? }) → key | null`;
  - `towardRival(fans, action, key, seconds) → number`;
  - con un luchador `fighter` (pieza de `spawnPiece`: `object`, `figure`, `props`, `play`, `update`): `targetsOf(fighter) → Mesh[]` y `standing(fighter, facing, measure, { rest? })`;
  - `punchDistance({ body, from, center, target, torso, rest? }) → number` y `planPunch({ attacks, strikes, from, center, target, torso, closest, rest? }) → { key, distance }`;
  - `poseAhead(piece, idle, seconds, measure)`;
  - `gripSlideToTarget({ spear, spot, facing, distance, target, torso }) → number` (antes `gripSlideToGiant`);
  - `slowToImpact(clock, seconds)`, `afterImpact(clock)` y `knockBack({ clock, figure, ux, uz, distance? }) → Promise`.
- `smash.js` sigue exportando `canSmash` y `runSmash` sin cambios de comportamiento.
- **Ojo:** el `smash.js` publicado ya trae el puñetazo de arriba abajo del gigante (constantes
  `FIST_HALF = 0.02`, `SQUASH = 0.55` y `OVERHEAD_CHANCE = 0.5`, las funciones `planOverhead` y
  `squash`, y la elección del golpe, el giro y el impacto dentro de `giantSmash`; commits 71ad707 y
  3664d97, ya en `main`). Al sustituir el fichero hay que conservarlo tal cual, importando
  `standing` y `targetsOf` de `fight.js`, y `measureStrikes` (`strikes.js`) sigue guardando
  `overhead` con `highestHand`. Las comprobaciones del paso 4 incluyen un golpe de arriba abajo.

- [ ] **Paso 1: `fight.js`**

`src/combat/fight.js`:

```js
import * as THREE from 'three';
import { gripSlideForReach } from './plan.js';
import { skinnedMeshes } from './strikes.js';
import { FAN_SECTORS, fanReach, joinReach } from '../moves/room.js';

// Lo que comparten las capturas con gag (las de la torre y las del caballero): cámara lenta con
// congelado de impacto; sitio en abanico para lo que hará cada luchador en su puesto; y rayos que
// buscan la malla del rival, para que los golpes lo toquen sin atravesarlo.
//
// Un luchador (`fighter`) es una pieza con esqueleto de `spawnPiece`: el peón, el gigante de una torre
// o el jinete de un caballero. Un puesto (`post`) es { entry, fans, margin, at, facing, parts }: la
// pieza del tablero, los abanicos medidos de su luchador (`measureBody`), dónde está y hacia dónde
// mira, y las partes ({ action, key, seconds }) de lo que hará allí.

export const HIT_STOP = 0.1; // segundos reales congelados en el impacto
export const SLOW_MOTION = 0.3;
export const SLOW_BEFORE = 0.35; // segundos de juego antes del impacto, ya a cámara lenta
export const SLOW_AFTER = 0.45;
export const KNOCKBACK = 0.2; // lo que sale despedido el vencido
const IDLE_SECONDS = 4; // lo más que dura seguido el reposo de un luchador en una captura
const FADE_SECONDS = 0.25; // fundido de una acción con la siguiente
const FIST_BITE = 0.03; // lo que se hunde en el rival la cara del puño o del pie
const SPEAR_BITE = 0.03; // lo que se hunde la punta de la lanza
const FRONT_ANGLE = Math.PI / 6; // a cada lado de la dirección del rival, lo que cuenta como delante
const RAY_FAR = 3; // desde dónde se lanzan los rayos que buscan la superficie del rival
const UP = new THREE.Vector3(0, 1, 0);

// Copia de `list` en orden aleatorio.
export function shuffled(list, random) {
  const order = [...list];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// Abanico con el que pide sitio un luchador en su puesto: lo que alcanza en reposo y en cada parte de
// lo que hará allí.
export function stanceOf({ fans, at, facing, parts }) {
  const reaches = Object.values(fans.idle ?? {}).map((fan) => fanReach(fan.profile, IDLE_SECONDS));
  for (const { action, key, seconds } of parts) {
    const fan = fans[action]?.[key];
    if (fan) reaches.push(fanReach(fan.profile, seconds ?? fan.seconds + FADE_SECONDS));
  }
  return { at: { x: at.x, z: at.z }, facing, reach: joinReach(reaches) };
}

// Hueco que les faltaría a las piezas de alrededor, salvo `owners`, con los luchadores en sus puestos.
export function overlapOf(crowd, owners, posts) {
  return crowd.overlap({
    owners,
    bodies: posts.map((post) => ({ ...stanceOf(post), margin: post.margin })),
  });
}

// Lo que se adelanta un luchador hacia su rival, que tiene delante, en los primeros `seconds` de una
// versión de `action`.
export function towardRival(fans, action, key, seconds) {
  const reach = fanReach(fans[action][key].profile, seconds);
  return Math.max(0, ...reach.filter((_, k) => Math.abs(-Math.PI + ((k + 0.5) * 2 * Math.PI) / FAN_SECTORS) < FRONT_ANGLE));
}

// Añade a un puesto la versión de `action` que menos hueco quita (`overlap()`), probándolas en orden
// aleatorio; a igual hueco, la de menor `cost`. Devuelve su clave. Si es `optional`, solo la añade si
// no quita más hueco que no hacerla; si no añade ninguna, devuelve null.
export function choose(post, action, { overlap, random, seconds, optional = false, cost = () => 0 }) {
  const without = optional ? overlap() : Infinity;
  let best = null;
  for (const key of shuffled(Object.keys(post.fans[action] ?? {}), random)) {
    post.parts.push({ action, key, seconds });
    const missing = overlap();
    post.parts.pop();
    if (missing > without + 1e-6) continue;
    const extra = cost(key);
    if (!best || missing < best.missing - 1e-6 || (missing <= best.missing + 1e-6 && extra < best.extra - 1e-6)) {
      best = { key, missing, extra };
    }
  }
  if (best) post.parts.push({ action, key: best.key, seconds });
  return best?.key ?? null;
}

// Lo que puede recibir un golpe: las mallas con esqueleto del luchador y, si lo lleva, su escudo.
export function targetsOf(fighter) {
  const meshes = skinnedMeshes(fighter.object);
  fighter.props?.shield?.traverse((o) => { if (o.isMesh) meshes.push(o); });
  return meshes;
}

// Llama a `measure` con el luchador como estará al recibir el golpe, plantado en el tablero y mirando a
// `facing` (con `rest`, además, en reposo), y lo deja como estaba.
export function standing(fighter, facing, measure, { rest = false } = {}) {
  const { figure } = fighter;
  const { y } = figure.position;
  const turn = figure.rotation.y;
  figure.position.y = 0;
  figure.rotation.y = facing;
  if (rest) {
    fighter.play('idle', { fade: 0 });
    fighter.update(0);
  }
  try {
    return measure();
  } finally {
    figure.position.y = y;
    figure.rotation.y = turn;
    fighter.object.updateMatrixWorld(true);
  }
}

// Distancia entre los centros a la que la cara del golpe toca al rival (`target`), plantado en `center`
// y mirando hacia `from`, y se hunde FIST_BITE. `body` trae dónde está la mano, el pie o la punta en lo
// más largo del golpe y hasta dónde llega su malla en unas líneas paralelas a la del golpe (`faces`);
// cada línea sigue hasta el rival, y manda la que antes lo toca. Si ninguna lo toca, cuenta con su
// pecho (`torso`).
export function punchDistance({ body, from, center, target, torso, rest = false }) {
  if (!body.faces) return body.reach + torso - FIST_BITE;
  const length = Math.hypot(center.x - from.x, center.z - from.z);
  const forward = new THREE.Vector3((center.x - from.x) / length, 0, (center.z - from.z) / length);
  const facing = Math.atan2(forward.x, forward.z);
  const side = new THREE.Vector3(Math.cos(facing), 0, -Math.sin(facing));
  const contact = standing(target, facing + Math.PI, () => {
    const targets = targetsOf(target);
    let first = null;
    for (const { dx, dy, face } of body.faces) {
      if (face === null) continue;
      const origin = new THREE.Vector3(center.x, body.height + dy, center.z)
        .addScaledVector(forward, -RAY_FAR)
        .addScaledVector(side, body.side + dx);
      // El rayo atraviesa al rival entero: por un hueco, lo primero que toca puede estar tras su centro.
      const hit = new THREE.Raycaster(origin, forward, 0, 2 * RAY_FAR).intersectObjects(targets, false)[0];
      if (hit) first = Math.max(first ?? -Infinity, face + RAY_FAR - hit.distance);
    }
    return first;
  }, { rest });
  return (contact ?? (body.faces[0].face ?? body.reach) + torso) - FIST_BITE;
}

// Golpe con mano o pie y a qué distancia del rival se para quien lo da. Prueba los golpes (`attacks`,
// con sus medidas en `strikes`) del que más alcanza al que menos y se queda con el primero con el que
// no tiene que retroceder desde `from`; si con todos tendría que retroceder, con el que menos. Nunca se
// pone a menos de `closest`. Cada prueba lanza rayos contra la malla del rival, así que casi siempre
// basta con una.
export function planPunch({ attacks, strikes, from, center, target, torso, closest, rest = false }) {
  const length = Math.hypot(center.x - from.x, center.z - from.z);
  const byReach = attacks
    .map(({ key }) => ({ key, body: strikes[key]?.body }))
    .filter(({ body }) => body)
    .sort((a, b) => b.body.reach - a.body.reach);
  let shortest = null;
  for (const { key, body } of byReach) {
    const distance = Math.max(closest, punchDistance({ body, from, center, target, torso, rest }));
    if (distance <= length + 1e-6) return { key, distance };
    if (!shortest || distance < shortest.distance) shortest = { key, distance };
  }
  return shortest;
}

// Llama a `measure` con la pieza como estará dentro de `seconds` de juego si sigue en reposo, y la deja
// como estaba. `idle` es su acción de reposo, que ya se ve del todo.
export function poseAhead(piece, idle, seconds, measure) {
  if (!idle) return measure();
  const now = idle.time;
  idle.time = (now + seconds) % idle.getClip().duration;
  piece.update(0);
  try {
    return measure();
  } finally {
    idle.time = now;
    piece.update(0);
  }
}

// Cuánto debe resbalar la lanza para que, en lo más hondo de la estocada, la punta se hunda SPEAR_BITE
// en el rival (`target`). Un rayo sigue la línea de la punta en ese momento (`spear`, medida con la
// pieza de prueba) desde la mano de quien la lleva, colocado en `spot` y mirando a `facing`. Si no toca
// la malla, la punta se queda en el pecho medido (`torso`).
export function gripSlideToTarget({ spear, spot, facing, distance, target, torso }) {
  const turn = new THREE.Quaternion().setFromAxisAngle(UP, facing);
  const axis = new THREE.Vector3(...spear.axis).applyQuaternion(turn);
  const tip = new THREE.Vector3(spear.side, spear.height, spear.reach).applyQuaternion(turn).add(new THREE.Vector3(spot.x, 0, spot.z));
  const back = spear.reach; // el rayo sale de la altura de la mano
  const hit = new THREE.Raycaster(tip.clone().addScaledVector(axis, -back), axis, 0, back + 1).intersectObjects(targetsOf(target), false)[0];
  if (!hit) return gripSlideForReach({ reach: spear.reach, distance, torso });
  return Math.max(0, back - hit.distance - SPEAR_BITE);
}

// Cámara lenta hasta un impacto que llega a los `seconds` de juego; se resuelve en el impacto.
export async function slowToImpact(clock, seconds) {
  await clock.wait(Math.max(0, seconds - SLOW_BEFORE));
  clock.timeScale = SLOW_MOTION;
  await clock.wait(Math.min(SLOW_BEFORE, seconds));
}

// Tras el impacto: congelado, algo más de cámara lenta y vuelta a la velocidad normal.
export async function afterImpact(clock) {
  await clock.hold(HIT_STOP);
  await clock.wait(SLOW_AFTER);
  clock.timeScale = 1;
}

// El vencido sale despedido `distance` en la dirección (ux, uz), frenando.
export function knockBack({ clock, figure, ux, uz, distance = KNOCKBACK }) {
  const start = figure.position.clone();
  return clock.tween(0.3, (t) => {
    const k = 1 - (1 - t) ** 2;
    figure.position.set(start.x + ux * distance * k, start.y, start.z + uz * distance * k);
  });
}
```

- [ ] **Paso 2: `smash.js` con `fight.js`**

Sustituir `src/combat/smash.js` entero por:

```js
import * as THREE from 'three';
import { TORSO, bestStrike, fightSpots, strikeSpot, usableStrikes } from './plan.js';
import {
  afterImpact, choose, gripSlideToTarget, knockBack, overlapOf, planPunch, poseAhead, slowToImpact, stanceOf, towardRival,
} from './fight.js';
import { CRUMBLE_SECONDS } from '../moves/rook-mover.js';

// Capturas cortas y brutales en las que participa una torre (diseño en docs/superpowers/specs/
// 2026-09-14-bchess-torre-gigante-design.md, sección 7). Gana siempre el atacante. Antes de empezar
// se decide qué hará cada gigante en su puesto, eligiendo el derrumbe y la provocación que dejan más
// hueco a las piezas de alrededor; si provocar les quita sitio, no provoca. Mientras dura, cada
// gigante pide sitio con el abanico de lo que va a hacer; el atacante y el defensor no se apartan.
// Lo que comparte con las batallas del caballero está en `fight.js`.

const KO_SECONDS = 1;
const COLLAPSE_SECONDS = 0.8; // del impacto a deshacerse en rocas
const RECOVER = 0.3; // lo que tarda en bajar el arma antes de volver a subir la lanza en la mano
const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const COMBAT_RAISE = 0.3; // como en el duelo: la lanza, algo subida en la mano
const GRIP_SETTLE = 0.35; // lo que tarda la lanza en resbalar en la mano antes de la estocada
const SPEAR_RECOIL = 0.12; // lo que rebota la lanza en la piedra tras el golpe
const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas

const giantOf = (entry) => (entry.kind === 'rook' ? entry.piece.giant : null);
const collapseOf = (giant) => (giant.has('defeat') ? 'defeat' : 'hit');
const spearTip = (piece) => piece.props.spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.top, 0));
// Puesto de una torre: su gigante en `at`, mirando a `facing`, con las partes de lo que hará allí.
const postOf = (entry, at, facing, parts = []) => ({ entry, fans: entry.piece.body.fans, margin: entry.piece.body.margin, at, facing, parts });

export function canSmash(attacker, defender) {
  const giant = giantOf(attacker);
  if (giant) {
    if (!bestStrike(giant.attacks, giant.strikes)) return false;
    return defender.kind === 'rook' ? Boolean(giantOf(defender)) : defender.piece.has('defeat') || defender.piece.has('fall');
  }
  return attacker.kind === 'pawn' && Boolean(giantOf(defender))
    && usableStrikes(attacker.piece.attacks, attacker.piece.strikes, 'duel').length > 0;
}

// Derrumbe del gigante vencido: el que deja más hueco y, a igual hueco, el que menos se echa encima
// del arma del rival, que tiene delante.
function chooseCollapse(post, { overlap, random }) {
  const action = collapseOf(giantOf(post.entry));
  const seconds = COLLAPSE_SECONDS + CRUMBLE_SECONDS;
  return choose(post, action, { overlap, random, seconds, cost: (key) => towardRival(post.fans, action, key, seconds) });
}

// La torre se come a un peón o a otra torre.
async function giantSmash({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, stances, obstacles, random }) {
  const rook = attacker.piece;
  const giant = rook.giant;
  const rival = giantOf(defender);
  const d = rival ?? defender.piece;
  const { key, distance } = planPunch({
    attacks: giant.attacks, strikes: giant.strikes, from: home, center, target: d, rest: Boolean(rival),
    torso: rival ? defender.piece.body.torso : TORSO,
    closest: rook.body.torso + (rival ? defender.piece.body.torso : PAWN_BODY) + BODY_GAP,
  });
  const measure = giant.strikes[key];
  const spots = strikeSpot(home, center, { reach: distance, torso: 0 });

  // 0. Qué hará cada gigante en su puesto: el atacante, su golpe y, si cabe, una provocación; el
  //    vencido, un derrumbe.
  const posts = [postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key }])];
  if (rival) posts.push(postOf(defender, center, spots.defenderFacing));
  const overlap = () => overlapOf(crowd, [attacker, defender], posts);
  const collapse = rival ? chooseCollapse(posts[1], { overlap, random }) : null;
  const taunt = choose(posts[0], 'taunt', { overlap, random, optional: true });
  for (const post of posts) stances.set(post.entry, stanceOf(post));

  // 1. La cámara encuadra y la torre (o las dos) se transforman.
  const opening = [cinema.frame(clock, spots.attacker, center, obstacles), attacker.mover.awaken()];
  if (rival) {
    opening.push(defender.mover.awaken());
  } else {
    d.setSpearDefault('upright');
    d.setGripSlide(-COMBAT_RAISE);
  }
  await Promise.all(opening);

  // 2. El gigante avanza hasta que su golpe alcanza al rival, se encaran y, si cabe, lo provoca.
  await attacker.mover.walkTo(spots.attacker);
  await Promise.all([
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
    defender.mover.turnTo(spots.defenderFacing, 0.3),
  ]);
  const taunts = [];
  if (taunt) taunts.push(giant.playOnce('taunt', { clip: taunt }));
  if (!rival && random() < 0.5 && d.hasClip('fidget', 'frightened')) taunts.push(d.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  giant.play('idle', { fade: 0.25 });
  if (!rival) {
    await defender.mover.descend(center);
    await defender.mover.turnTo(spots.defenderFacing, 0.2);
  }

  // 3. Golpe a cámara lenta, con destello, chispas y temblor. Un gigante vencido se tambalea y, poco
  //    después, se deshace en rocas.
  const attack = giant.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, measure.body.t);
  fx.burst(giant.object.getObjectByName(measure.body.bone).getWorldPosition(new THREE.Vector3()), { size: 1.2, sparks: 30 });
  hud.flash();
  cinema.shake(0.25);
  const ux = Math.sin(spots.attackerFacing);
  const uz = Math.cos(spots.attackerFacing);
  let fall = null;
  let crumbled = null;
  if (rival) {
    rival.playOnce(collapseOf(rival), { clip: collapse, fade: 0.1 });
    crumbled = clock.wait(COLLAPSE_SECONDS).then(() => defender.mover.crumble());
  } else {
    fall = d.playOnce(d.has('defeat') ? 'defeat' : 'fall', { fade: 0.1 });
    d.throwSpear({ x: ux, z: uz });
    knockBack({ clock, figure: d.figure, ux, uz });
  }
  await afterImpact(clock);
  await attack;
  giant.play('idle', { fade: 0.3 });

  // 4. El gigante vencido ya es un montón de rocas; un peón ve estrellitas y se esfuma.
  if (rival) {
    await crumbled;
  } else {
    await fall;
    fx.koStars(d.object.getObjectByName('Head') ?? d.figure, { seconds: KO_SECONDS });
    await clock.wait(KO_SECONDS);
    await defender.mover.vanish();
  }

  // 5. La cámara vuelve mientras el gigante ocupa la casilla y vuelve a ser torre.
  stances.delete(attacker);
  await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
}

// Un peón se come a una torre: estocada, y el gigante se derrumba en rocas.
async function pawnFellsGiant({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, stances, obstacles, random }) {
  const a = attacker.piece;
  const giant = defender.piece.giant;
  const spots = fightSpots(home, center, 'duel');
  const keys = usableStrikes(a.attacks, a.strikes, 'duel');
  const key = keys[Math.floor(random() * keys.length)];
  const measure = a.strikes[key];
  a.setSpearDefault('upright');
  a.setGripSlide(-COMBAT_RAISE);

  // 0. Qué hará el gigante en su casilla: un derrumbe y, si cabe, una provocación.
  const post = postOf(defender, center, spots.defenderFacing);
  const overlap = () => overlapOf(crowd, [attacker, defender], [post]);
  const collapse = chooseCollapse(post, { overlap, random });
  const taunt = choose(post, 'taunt', { overlap, random, optional: true });
  stances.set(defender, stanceOf(post));

  // 1. La cámara encuadra, la torre se transforma, se encaran y el gigante provoca si cabe.
  await Promise.all([
    cinema.frame(clock, spots.attacker, spots.defender, obstacles),
    defender.mover.awaken(),
    attacker.mover.turnTo(spots.attackerFacing, 0.3),
  ]);
  await defender.mover.turnTo(spots.defenderFacing, 0.35);
  const taunts = [];
  if (taunt) taunts.push(giant.playOnce('taunt', { clip: taunt }));
  if (random() < 0.5 && a.hasClip('fidget', 'frightened')) taunts.push(a.playOnce('fidget', { clip: 'frightened' }));
  await Promise.all(taunts);
  const idle = giant.play('idle', { fade: 0.25 });
  await attacker.mover.descend(spots.attacker);
  // Antes de la estocada, aún quieto, apunta la lanza al gigante y la hace resbalar en la mano. Si
  // girara y resbalara ya atacando, la punta se clavaría en el gigante y, al agacharse, el regatón
  // se hundiría en el suelo. Se mide contra el gigante tal y como estará en el impacto.
  const slide = poseAhead(giant, idle, GRIP_SETTLE + measure.spear.t, () => gripSlideToTarget({
    spear: measure.spear, spot: spots.attacker, facing: spots.attackerFacing, distance: spots.distance, target: giant, torso: defender.piece.body.torso,
  }));
  a.setSpearPose('forward');
  a.setGripSlide(slide);
  await Promise.all([attacker.mover.turnTo(spots.attackerFacing, 0.2), clock.wait(GRIP_SETTLE)]);

  // 2. Estocada a cámara lenta: la punta toca la piedra y rebota, y el gigante se tambalea y, poco
  //    después, se deshace en rocas.
  const attack = a.playOnce('attack', { clip: key, fade: 0.15 });
  await slowToImpact(clock, measure.spear.t);
  fx.burst(spearTip(a), { size: 1.1, sparks: 28 });
  hud.flash();
  cinema.shake(0.2);
  a.setGripSlide(slide + SPEAR_RECOIL);
  giant.playOnce(collapseOf(giant), { clip: collapse, fade: 0.1 });
  const crumbled = clock.wait(COLLAPSE_SECONDS).then(() => defender.mover.crumble());
  await afterImpact(clock);
  await attack;
  // Baja el arma y, con la lanza ya erguida, vuelve a subirla en la mano.
  a.setSpearPose(null);
  a.play('idle', { fade: 0.3 });
  await clock.wait(RECOVER);
  a.setGripSlide(-COMBAT_RAISE);
  await crumbled;

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
  const stances = new Map(); // gigante → abanico de lo que hará en su puesto (`stanceOf`)
  const fight = {
    attacker, defender, clock, fx, cinema, hud, crowd, stances, obstacles, random,
    target: defender.mover.square,
    home: board.squareToWorld(attacker.mover.square),
    center: board.squareToWorld(defender.mover.square),
  };
  const release = crowd.claim({
    owners: [attacker, defender],
    bodies: () => [attacker, defender].flatMap((entry) => entry.mover.room?.({ stance: stances.get(entry) }) ?? []),
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

- [ ] **Paso 3: Pruebas**

Run: `cd ~/bchess && npm test && node --check src/combat/fight.js && node --check src/combat/smash.js`
Expected: todas pasan y las dos comprobaciones de sintaxis no dicen nada.

- [ ] **Paso 4: Repetir las comprobaciones de la torre**

Con la vista previa en marcha (`preview_start` con el nombre `bchess`), para cada captura de `raw/tmp/verificar-captura-torre.js` (`torre-come-peon`, `peon-come-torre`, `torre-negra-come-peon` y `torre-come-torre`): recargar la página y lanzarla en segundo plano en la consola, porque cada llamada se corta a los 45 s:

```js
window.__r = null;
import('/raw/tmp/verificar-captura-torre.js').then((m) => m.capturar('torre-come-peon')).then((r) => { window.__r = r; });
```

y consultar el resultado, las veces que haga falta, con:

```js
const tick = () => new Promise((resolve) => { const channel = new MessageChannel(); channel.port1.onmessage = () => resolve(); channel.port2.postMessage(null); });
const t0 = performance.now();
while (!window.__r && performance.now() - t0 < 38000) await tick();
window.__r;
```

Expected, como en la tabla final del plan de la torre:
- `hueco` ≥ 0,029, `holgura` ≥ 0, `ambos` 0 y `apartado` ≤ 0,45;
- `hundidoMaximo` entre −0,01 y 0,035;
- `piezas` 19, `fuera` vacío, `camara` 0, `controles: true`, `rocas: 0` y ningún error en la consola (`read_console_messages`).

- [ ] **Paso 5: Commit**

```bash
git add src/combat/fight.js src/combat/smash.js
git commit -m "Lo que comparten las capturas con gag, en fight.js" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 8: Huesos impuestos, espada y lanza clavada

**Files:**
- Create: `src/pieces/sword.js`, `raw/tmp/prueba-pieza.js` (no se publica)
- Modify: `src/pieces/piece.js`, `src/pieces/flag.js`, `src/combat/strikes.js`

**Interfaces:**
- Consumes: `pickDriftTrack` (tarea 6).
- Produces:
  - `createSword({ length = 0.75 }) → THREE.Group`, con el agarre en el origen y la punta hacia +Y;
  - en el manifiesto de una pieza: `sword: { hand, offset, rotation, length }` y `required: string[]` (acciones sin las que avisa; por defecto `['idle', 'walk', 'attack', 'hit']`, y sin `required` también avisa si no puede caer);
  - en cada pieza de `spawnPiece`: `props.sword`, `swordEnds: { bottom, top }`, `plantSpear({ x, z })`, `holdSpear()`, `turnBone(name, { x?, y?, z? } | null) → boolean` (grados en el espacio de la figura: +X a su izquierda, +Y arriba, +Z delante), `scaleBone(name, scale | null) → boolean`, `resetBones()` y `rest()` (sin animación, en la postura de reposo del modelo);
  - en `createFlag`: la opción `pole` (por defecto, `true`);
  - en `measureStrikes`: `strikes[key].blade = { t, reach, side, height }` si la pieza lleva espada;
  - `measureBody(kit, spawnPiece, { actions })`.

- [ ] **Paso 1: Espada**

`src/pieces/sword.js`:

```js
import * as THREE from 'three';

// Espada del caballero hecha en código: hoja de acero, guarda y pomo dorados y empuñadura de cuero. El
// origen es el punto de agarre y la punta mira a +Y, como la lanza. Unidad: casillas.

export function createSword({ length = 0.75 } = {}) {
  const group = new THREE.Group();
  group.name = 'espada';
  const steel = new THREE.MeshStandardMaterial({ color: 0xd4d7dc, roughness: 0.22, metalness: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9b44a, roughness: 0.35, metalness: 0.8 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.8, metalness: 0 });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.13, 10), leather);
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 8), gold);
  pommel.position.y = -0.085;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.024, 0.032), gold);
  guard.position.y = 0.077;
  const bladeLength = length - 0.089 - 0.1;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.046, bladeLength, 0.012), steel);
  blade.position.y = 0.089 + bladeLength / 2;
  // Punta: un cono de cuatro caras aplastado hasta el grosor de la hoja.
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.023, 0.1, 4), steel);
  tip.scale.z = 0.26;
  tip.position.y = length - 0.05;

  group.add(handle, pommel, guard, blade, tip);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}
```

- [ ] **Paso 2: Banderín sin mástil**

En `src/pieces/flag.js`, sustituir:

```js
// bando, recortada con la forma del banderín.
```

por:

```js
// bando, recortada con la forma del banderín. Sin mástil (`pole: false`), la tela sola, para atarla a
// la lanza del caballero.
```

Sustituir:

```js
export function createFlag({ texture, poleHeight = 0.5 }) {
  const object = new THREE.Group();
  object.name = 'banderin';
  const metal = new THREE.MeshStandardMaterial({ color: 0xd9b44a, metalness: 0.8, roughness: 0.35 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, poleHeight, 8), metal);
  pole.position.y = poleHeight / 2;
  pole.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(POLE_RADIUS * 2.2, 12, 8), metal);
  knob.position.y = poleHeight;
```

por:

```js
export function createFlag({ texture, poleHeight = 0.5, pole = true }) {
  const object = new THREE.Group();
  object.name = 'banderin';
  if (pole) {
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9b44a, metalness: 0.8, roughness: 0.35 });
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, poleHeight, 8), metal);
    staff.position.y = poleHeight / 2;
    staff.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(POLE_RADIUS * 2.2, 12, 8), metal);
    knob.position.y = poleHeight;
    object.add(staff, knob);
  }
```

Y sustituir:

```js
  cloth.position.set(POLE_RADIUS, poleHeight - CLOTH_HEIGHT / 2 - 0.03, 0);
  object.add(pole, knob, cloth);
```

por:

```js
  cloth.position.set(pole ? POLE_RADIUS : 0, poleHeight - CLOTH_HEIGHT / 2 - 0.03, 0);
  object.add(cloth);
```

- [ ] **Paso 3: Medidas de la espada y acciones a medir**

En `src/combat/strikes.js`, sustituir:

```js
// dónde está la punta y hacia dónde apunta la lanza en ese momento) y la mano o el pie que más
// avanzan (`body`), y cuánto se abren los pies a los lados (`sideStep`). Son distancias desde el
// centro de la figura, que mira hacia +Z, en casillas.
```

por:

```js
// dónde está la punta y hacia dónde apunta la lanza en ese momento), la punta de la espada (`blade`)
// y la mano o el pie que más avanzan (`body`), y cuánto se abren los pies a los lados (`sideStep`).
// Son distancias desde el centro de la figura, que mira hacia +Z, en casillas.
```

Sustituir `    let spear = null;` por:

```js
    let spear = null;
    let blade = null;
```

Sustituir:

```js
      for (const limb of limbs) {
        const at = limb.getWorldPosition(point);
```

por:

```js
      if (piece.props.sword && piece.swordEnds) {
        const tip = piece.props.sword.localToWorld(point.set(0, piece.swordEnds.top, 0));
        if (!blade || tip.z > blade.reach) blade = { t, reach: tip.z, side: tip.x, height: tip.y };
      }
      for (const limb of limbs) {
        const at = limb.getWorldPosition(point);
```

Sustituir `    strikes[attack.key] = { duration, spear, body, sideStep };` por `    strikes[attack.key] = { duration, spear, blade, body, sideStep };`.

Sustituir:

```js
// Medidas del cuerpo de un gigante, una vez por tipo de pieza:
```

por:

```js
// Medidas del cuerpo de una pieza que pelea sin peana (el gigante, el jinete), una vez por tipo:
```

Sustituir:

```js
// - `fans`, el alcance en abanico de cada versión de sus acciones (`measureFans`).
export function measureBody(kit, spawnPiece) {
```

por:

```js
// - `fans`, el alcance en abanico de cada versión de `actions` (`measureFans`).
export function measureBody(kit, spawnPiece, { actions = ['idle', 'walk', 'attack', 'hit', 'taunt', 'defeat'] } = {}) {
```

Y sustituir:

```js
  const fans = measureFans(kit, spawnPiece, ['idle', 'walk', 'attack', 'hit', 'taunt', 'defeat']);
  const farthest = (versions) => Math.max(0, ...Object.values(versions).map(({ profile }) => Math.max(...profile[profile.length - 1])));
```

por:

```js
  const fans = measureFans(kit, spawnPiece, actions);
  const farthest = (versions = {}) => Math.max(0, ...Object.values(versions).map(({ profile }) => Math.max(...profile[profile.length - 1])));
```

- [ ] **Paso 4: `piece.js`: importaciones, raíz de los clips y avisos**

En `src/pieces/piece.js`, sustituir:

```js
import { pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion } from './clips.js';
```

por:

```js
import { pickDriftTrack, pickRootPositionTrack, pickUpAxis, pickVariant, removeLinearDrift, resolveMoves, scaleHorizontalMotion } from './clips.js';
```

Sustituir `import { createSpear } from './spear.js';` por:

```js
import { createSpear } from './spear.js';
import { createSword } from './sword.js';
```

Sustituir `const SPEAR_GRAVITY = 6;` por:

```js
const SPEAR_GRAVITY = 6;
const SPEAR_PLANT_DEPTH = 0.12; // lo que se clava en el tablero la lanza que se deja en el suelo
const DEGREES = Math.PI / 180;
```

Sustituir:

```js
// Pista de posición de la cadera de un clip, con su eje vertical, o null.
function rootTrack(clip) {
  const name = pickRootPositionTrack(clip.tracks.map((t) => t.name));
  const track = name ? clip.tracks.find((t) => t.name === name) : null;
  if (!track) return null;
  return { name, track, upAxis: pickUpAxis([track.values[0], track.values[1], track.values[2]]) };
}
```

por:

```js
// Pista de posición del hueso raíz de un clip (tras `loadPieceKit`, la única que le queda), con su eje
// vertical, o null.
function rootTrack(clip) {
  const track = clip.tracks.find((t) => t.name.endsWith('.position'));
  if (!track) return null;
  return { name: track.name, track, upAxis: pickUpAxis([track.values[0], track.values[1], track.values[2]]) };
}
```

Sustituir:

```js
  // a otro de proporciones algo distintas (cada hueso mantiene su propia longitud).
  for (const clip of clips) {
    const rootName = pickRootPositionTrack(clip.tracks.map((t) => t.name));
```

por:

```js
  // a otro de proporciones algo distintas (cada hueso mantiene su propia longitud). En un esqueleto de
  // nombres desconocidos (el caballo), la cadera es el hueso que más avanza.
  for (const clip of clips) {
    const rootName = pickRootPositionTrack(clip.tracks.map((t) => t.name)) ?? pickDriftTrack(clip.tracks);
```

Sustituir:

```js
  for (const action of ['idle', 'walk', 'attack', 'hit']) {
    if (!moves[action].length) console.warn(`[BChess] La pieza no tiene animación «${action}». Clips: ${clipNames.join(', ') || '(ninguno)'}`);
  }
  if (!moves.fall.length && !moves.defeat?.length) console.warn(`[BChess] La pieza no tiene animación para caer. Clips: ${clipNames.join(', ') || '(ninguno)'}`);
```

por:

```js
  // Las piezas que pelean avisan de lo que les falta; las demás (el caballo) dicen qué necesitan en `required`.
  for (const action of spec.required ?? ['idle', 'walk', 'attack', 'hit']) {
    if (!moves[action]?.length) console.warn(`[BChess] La pieza no tiene animación «${action}». Clips: ${clipNames.join(', ') || '(ninguno)'}`);
  }
  if (!spec.required && !moves.fall.length && !moves.defeat?.length) console.warn(`[BChess] La pieza no tiene animación para caer. Clips: ${clipNames.join(', ') || '(ninguno)'}`);
```

Y sustituir:

```js
  if (!hands.right || !hands.left) console.warn(`[BChess] No encuentro las manos de la pieza. Huesos: ${bones.join(', ')}`);
```

por:

```js
  if ((spec.spear || spec.shield || spec.sword) && (!hands.right || !hands.left)) console.warn(`[BChess] No encuentro las manos de la pieza. Huesos: ${bones.join(', ')}`);
```

- [ ] **Paso 5: `piece.js`: espada, lanza clavada y huesos impuestos**

Sustituir:

```js
  const cuts = []; // acciones de `playOnce` que acaban antes, por `seconds`: { action, at, resolve }
```

por:

```js
  const cuts = []; // acciones de `playOnce` que acaban antes, por `seconds`: { action, at, resolve }
  let planted = false; // lanza clavada en el tablero
  // Giros y escalas que el código impone a algunos huesos encima de la animación (sentarse en la silla,
  // juntar las rodillas, encoger un brazo cortado…): nombre → { bone, turn, scale, base, baseScale,
  // depth, applied }.
  const bonePoses = new Map();
  let posedBones = []; // los de `bonePoses`, de padres a hijos
```

Sustituir:

```js
  const spearHold = props.spear ? props.spear.quaternion.clone() : null;
  const spearGripAt = props.spear ? props.spear.position.clone() : null;
```

por:

```js
  const swordBone = spec.sword ? boneFor(spec.sword.hand ?? 'right') : null;
  let swordEnds = null; // alturas del pomo y de la punta respecto al agarre
  if (swordBone) {
    const sword = createSword({ length: spec.sword.length });
    sword.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(sword);
    swordEnds = { bottom: box.min.y, top: box.max.y };
    props.sword = attachInWorld(sword, swordBone, spec.sword);
  }
  const spearHold = props.spear ? props.spear.quaternion.clone() : null;
  const spearGripAt = props.spear ? props.spear.position.clone() : null;
  const spearScale = props.spear ? props.spear.scale.clone() : null;
```

Sustituir `  const spin = new THREE.Quaternion();` por:

```js
  // Clava la lanza erguida en el tablero, en `at` ({x, z}), y deja de seguir a la mano.
  function plantSpear(at) {
    const spear = props.spear;
    if (!spear) return;
    flying = null;
    object.attach(spear);
    spear.quaternion.identity();
    spear.position.copy(object.worldToLocal(new THREE.Vector3(at.x, -spearEnds.bottom * spear.scale.y - SPEAR_PLANT_DEPTH, at.z)));
    planted = true;
  }

  // Vuelve a poner la lanza en la mano, como al crear la pieza, aunque estuviera clavada o hubiera
  // salido volando.
  function holdSpear() {
    const spear = props.spear;
    if (!spear) return;
    flying = null;
    planted = false;
    spearBone.add(spear);
    spear.position.copy(spearGripAt);
    spear.quaternion.copy(spearHold);
    spear.scale.copy(spearScale);
    spear.visible = true;
    spear.traverse((o) => {
      if (!o.isMesh || !o.material.transparent) return;
      o.material.opacity = 1;
      o.material.transparent = false;
    });
    grip = 0;
    gripTarget = 0;
    spearBlend = 0;
  }

  function poseOf(name) {
    let pose = bonePoses.get(name);
    if (pose) return pose;
    const bone = model.getObjectByName(name);
    if (!bone?.isBone) return null;
    let depth = 0;
    for (let at = bone.parent; at; at = at.parent) depth++;
    pose = { bone, turn: null, scale: null, base: new THREE.Quaternion(), baseScale: new THREE.Vector3(1, 1, 1), depth, applied: false };
    bonePoses.set(name, pose);
    posedBones = [...bonePoses.values()].sort((a, b) => a.depth - b.depth);
    return pose;
  }

  // Deja los huesos impuestos como los dejó la animación en el fotograma anterior.
  function restoreBones() {
    for (const pose of posedBones) {
      if (!pose.applied) continue;
      pose.bone.quaternion.copy(pose.base);
      pose.bone.scale.copy(pose.baseScale);
    }
  }

  const figureTurn = new THREE.Quaternion();
  const figureTurnInverse = new THREE.Quaternion();
  const parentTurn = new THREE.Quaternion();
  const parentTurnInverse = new THREE.Quaternion();
  const worldTurn = new THREE.Quaternion();

  // Encima de la animación, cada hueso impuesto se escala y gira en el espacio de la figura. Los padres
  // van antes que los hijos, para que el giro de un hijo cuente con el de su padre.
  function applyBones() {
    if (!posedBones.length) return;
    figure.getWorldQuaternion(figureTurn);
    figureTurnInverse.copy(figureTurn).invert();
    for (const pose of posedBones) {
      pose.base.copy(pose.bone.quaternion);
      pose.baseScale.copy(pose.bone.scale);
      pose.applied = true;
      if (pose.scale !== null) pose.bone.scale.setScalar(pose.scale);
      if (!pose.turn) continue;
      pose.bone.parent.getWorldQuaternion(parentTurn);
      parentTurnInverse.copy(parentTurn).invert();
      worldTurn.copy(figureTurn).multiply(pose.turn).multiply(figureTurnInverse);
      pose.bone.quaternion.copy(parentTurnInverse).multiply(worldTurn).multiply(parentTurn).multiply(pose.base);
    }
  }

  const spin = new THREE.Quaternion();
```

- [ ] **Paso 6: `piece.js`: fotograma y lo que ofrece la pieza**

Sustituir:

```js
  function update(dt) {
    mixer.update(dt);
```

por:

```js
  function update(dt) {
    restoreBones();
    mixer.update(dt);
    applyBones();
```

Sustituir:

```js
    if (flying) {
      flySpear(spear, dt);
      return;
    }
```

por:

```js
    if (flying) {
      flySpear(spear, dt);
      return;
    }
    if (planted) return;
```

Sustituir:

```js
    throwSpear,
    hasClip(action, key) {
```

por:

```js
    throwSpear,
    plantSpear,
    holdSpear,
    // Gira un hueso `turn` grados ({ x, y, z }, en el espacio de la figura: +X a su izquierda, +Y arriba
    // y +Z delante) encima de lo que haga la animación; con null deja de girarlo.
    turnBone(name, turn) {
      const pose = poseOf(name);
      if (!pose) return false;
      if (!turn) {
        pose.turn = null;
        return true;
      }
      pose.turn ??= new THREE.Quaternion();
      pose.turn.setFromEuler(new THREE.Euler((turn.x ?? 0) * DEGREES, (turn.y ?? 0) * DEGREES, (turn.z ?? 0) * DEGREES));
      return true;
    },
    // Escala un hueso, y todo lo que cuelga de él, encima de la animación; con null deja de escalarlo.
    scaleBone(name, scale) {
      const pose = poseOf(name);
      if (!pose) return false;
      pose.scale = scale ?? null;
      return true;
    },
    // Quita todos los giros y escalas impuestos.
    resetBones() {
      restoreBones();
      bonePoses.clear();
      posedBones = [];
    },
    // Sin ninguna animación: el esqueleto vuelve a la postura de reposo del modelo (el caballo quieto,
    // si no tiene animación de reposo).
    rest() {
      mixer.stopAllAction();
      current = null;
      currentVariant = null;
      model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
      applySpearPose();
    },
    hasClip(action, key) {
```

Y sustituir `    spearEnds,` por:

```js
    spearEnds,
    swordEnds,
```

- [ ] **Paso 7: Pruebas y sintaxis**

Run: `cd ~/bchess && npm test && for f in src/pieces/sword.js src/pieces/flag.js src/pieces/piece.js src/combat/strikes.js; do node --check $f; done`
Expected: todas pasan y ninguna comprobación de sintaxis dice nada.

- [ ] **Paso 8: Comprobación en el navegador**

`raw/tmp/prueba-pieza.js`:

```js
// Prueba de desarrollo (raw/ no se publica) de los cambios de `piece.js`: huesos girados y encogidos,
// espada, lanza clavada y recogida. Crea un peón blanco con espada en e4, lo prueba y lo quita.
import * as THREE from '/vendor/three/build/three.module.js';
import { loadManifest, loadPieceKit, spawnPiece } from '/src/pieces/piece.js';
import { measureStrikes } from '/src/combat/strikes.js';

const round = (v) => v.toArray().map((x) => +x.toFixed(3));

export async function probar() {
  const b = window.bchess;
  const manifest = await loadManifest();
  const spec = {
    ...manifest.pieces['white-pawn'],
    sword: { hand: 'right', offset: [0, -0.03, 0.03], rotation: [Math.PI / 2, 0, 0], length: 0.75 },
  };
  const kit = await loadPieceKit(spec, b.quality);
  kit.strikes = measureStrikes(kit, spawnPiece);
  const piece = spawnPiece(kit);
  b.stage.scene.add(piece.object);
  piece.placeAt(b.board.squareToWorld('e4'));
  piece.face(Math.PI);
  piece.play('idle', { fade: 0 });
  const bone = (name) => piece.object.getObjectByName(name);
  const inFigure = (name, from) => {
    piece.object.updateMatrixWorld(true);
    const turn = piece.figure.getWorldQuaternion(new THREE.Quaternion()).invert();
    return bone(name).getWorldPosition(new THREE.Vector3()).sub(bone(from).getWorldPosition(new THREE.Vector3())).applyQuaternion(turn);
  };
  const frames = (n) => { for (let i = 0; i < n; i++) piece.update(1 / 60); };
  const out = {};

  frames(2);
  out.pieAntes = round(inFigure('L_Foot', 'L_Thigh'));
  piece.turnBone('L_Thigh', { x: -80 });
  frames(120);
  out.pieGirado = round(inFigure('L_Foot', 'L_Thigh'));
  piece.turnBone('L_Thigh', null);
  frames(2);
  out.pieSuelto = round(inFigure('L_Foot', 'L_Thigh'));

  piece.scaleBone('R_Upperarm', 0.001);
  frames(2);
  out.manoEncogida = round(inFigure('R_Hand', 'R_Upperarm'));
  piece.resetBones();
  frames(2);
  out.manoDeVuelta = round(inFigure('R_Hand', 'R_Upperarm'));

  out.espada = { ends: piece.swordEnds, padre: piece.props.sword.parent.name, blade: kit.strikes[Object.keys(kit.strikes)[0]]?.blade ?? null };

  const spear = piece.props.spear;
  const gripAt = spear.position.clone();
  piece.plantSpear({ x: 1.2, z: -0.6 });
  frames(3);
  spear.updateMatrixWorld(true);
  const bottom = spear.localToWorld(new THREE.Vector3(0, piece.spearEnds.bottom, 0));
  out.lanzaClavada = { padre: spear.parent.name, abajo: round(bottom) };
  piece.throwSpear({ x: 1, z: 0 });
  frames(30);
  piece.holdSpear();
  frames(3);
  out.lanzaEnLaMano = { padre: spear.parent.name, igual: spear.position.distanceTo(gripAt) < 0.05, visible: spear.visible };

  b.stage.scene.remove(piece.object);
  return JSON.stringify(out);
}
```

Recargar la vista previa y, en su consola:

```js
const m = await import('/raw/tmp/prueba-pieza.js?v=' + Date.now());
await m.probar();
```

Expected (medido con los módulos de este paso, antes de escribir el plan):
- `pieAntes` ≈ `[-0.05, -0.71, -0.02]`; `pieGirado` ≈ `[-0.05, -0.15, 0.70]`, sin crecer aunque pasen 120 fotogramas; `pieSuelto` ≈ `pieAntes`;
- `manoEncogida` ≈ `[0, 0, 0]` y `manoDeVuelta` ≈ `[-0.08, -0.39, 0.05]`;
- `espada`: `ends` ≈ `{ bottom: -0.111, top: 0.75 }`, `padre: "R_Hand"` y `blade` con `reach` y `t`;
- `lanzaClavada`: `padre: "pieza"` y `abajo` ≈ `[1.2, -0.12, -0.6]`;
- `lanzaEnLaMano`: `padre: "R_Hand"`, `igual: true`, `visible: true`;
- ningún error en la consola.

Después, en otra recarga, repetir el duelo de peones (`raw/tmp/verificar-combate.js`, `verify('white', 'duel')`, lanzado en segundo plano como en la tarea 7) y `peon-come-torre`: los mismos márgenes de la tabla final de sus planes (vecinos ≥ 0, suelo ≥ 0 y `hundidoMaximo` entre −0,01 y 0,035).

- [ ] **Paso 9: Commit**

```bash
git add src/pieces/sword.js src/pieces/piece.js src/pieces/flag.js src/combat/strikes.js
git commit -m "Huesos impuestos, espada y lanza clavada en las piezas" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 9: Los caballeros en el tablero

**Files:**
- Create: `src/pieces/knight.js`, `src/moves/knight-mover.js`, `raw/tmp/verificar-caballero.js` (no se publica)
- Modify: `assets/models/manifest.json`, `src/main.js`

**Interfaces:**
- Consumes:
  - de la tarea 5: `planLeap`, `leapAt`, `BOARD_EDGE`, `nearestEdgeExit`;
  - de la tarea 6: `findHorseBones`;
  - de la tarea 8: `turnBone`, `resetBones`, `rest`, `holdSpear`, `plantSpear`, `props.sword`, `measureBody(…, { actions })`;
  - `fitToHeight`, `withShadows`, `loadPieceKit`, `spawnPiece` (`piece.js`); `createFlag`, `flagTexture` (`flag.js`); `measureStrikes`.
- Produces:
  - `loadKnightKit(spec, quality) → kit` y `spawnKnight(kit) → knight`, con `object`, `pedestal`, `hitbox`, `horse` (pieza o null), `rider` (pieza), `mount` ({ yaw, legs, hoofBack, halfLength, halfWidth, riderOffset, height } o null), `body` (medidas del jinete), `radius`, `height`, `pedestalHeight`, `hipHeight`, `mounted`, `figure` (la del caballo a caballo; la del jinete a pie), `seatRider()`, `unseatRider()`, `placeAt({x, z})`, `face(angle)` y `update(dt)`;
  - `createKnightMover({ knight, owner, pieces, board, dust, fx, clock, cinema, crowd, onBusy, restFacing }) → mover` con `placeOn(square)`, `goTo(square) → Promise<boolean>`, `vanish()`, `room({ stance }) → cuerpos`, `turnTo(angle, seconds)`, `leapTo({x, z})`, `square` y `busy`;
  - en `window.bchess`: `knights`.

- [ ] **Paso 1: La pieza**

`src/pieces/knight.js`:

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { fitToHeight, loadPieceKit, spawnPiece, withShadows } from './piece.js';
import { createFlag, flagTexture } from './flag.js';
import { findHorseBones } from './horse-bones.js';
import { measureBody, measureStrikes } from '../combat/strikes.js';

// El caballero (diseño en docs/superpowers/specs/2026-09-15-bchess-caballero-design.md, sección 3): una
// peana con un caballo encima y el jinete sentado en la silla, con la lanza y su banderín, la espada
// envainada (oculta) y el escudo. Caballo y jinete son piezas con esqueleto de `spawnPiece`, sin peana
// propia. A caballo, la figura del jinete cuelga de la del caballo; para pelear, baja al tablero. Sin
// caballo, el jinete va de pie sobre la peana, como un peón.

const MODELS = 'assets/models/';
const SEAT_LIFT = 0.04; // de la silla a la cadera del jinete sentado
const HITBOX_RADIUS = 0.45;
const PENNANT_SCALE = 0.7;
const PENNANT_BELOW_TIP = 0.3; // del extremo de la lanza al banderín
const MIN_HALF_WIDTH = 0.3; // el jinete, con el escudo y la lanza, es más ancho que el caballo
// Acciones del jinete cuyo alcance en abanico se mide, para pedir sitio en las batallas.
const RIDER_FAN_ACTIONS = ['idle', 'walk', 'attack', 'block', 'kick', 'hit', 'fall', 'defeat', 'taunt', 'victory'];

// Sienta al jinete: los muslos hacia delante y abiertos, y las rodillas dobladas (`seat` del manifiesto,
// en grados en el espacio de la figura).
function seat(rider, { thigh, calf }) {
  rider.turnBone('L_Thigh', { x: thigh.x, z: thigh.z });
  rider.turnBone('R_Thigh', { x: thigh.x, z: -thigh.z });
  rider.turnBone('L_Calf', { x: calf.x });
  rider.turnBone('R_Calf', { x: calf.x });
}

// Cadera del jinete de pie, en reposo, respecto a su figura.
function measureHip(rider) {
  const test = spawnPiece(rider);
  test.placeAt({ x: 0, z: 0 });
  test.face(0);
  test.play('idle', { fade: 0 });
  test.update(0);
  test.object.updateMatrixWorld(true);
  return test.object.getObjectByName('Hip').getWorldPosition(new THREE.Vector3());
}

// Medidas del conjunto, con el caballo en su postura de reposo y mirando a +Z:
// - `yaw`, `legs`: de `findHorseBones`;
// - `hoofBack`: lo que quedan los cascos traseros por detrás del centro, para encabritarse sobre ellos;
// - `halfLength`, `halfWidth`: la huella del caballo con el jinete, para el salto;
// - `riderOffset`: dónde va la figura del jinete sentado, en el espacio de la figura del caballo;
// - `height`: del tablero al penacho, peana incluida.
function measureMount(horse, spec, hip, pedestalHeight) {
  const model = horse.model;
  model.updateMatrixWorld(true);
  const bones = [];
  const point = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isBone) return;
    o.getWorldPosition(point);
    bones.push({ name: o.name, parent: o.parent?.isBone ? o.parent.name : null, x: point.x, y: point.y, z: point.z });
  });
  const { yaw, legs, seatZ } = findHorseBones(bones);
  horse.spec.yaw = yaw; // `spawnPiece` lo aplica a cada caballo
  const turnedZ = (name) => {
    const bone = bones.find((b) => b.name === name);
    return -bone.x * Math.sin(yaw) + bone.z * Math.cos(yaw);
  };
  const hoofBack = -(turnedZ(legs.backLeft.at(-1)) + turnedZ(legs.backRight.at(-1))) / 2;

  // Huella y silla, con el modelo girado para mirar a +Z.
  model.rotation.y = yaw;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const down = new THREE.Raycaster(new THREE.Vector3(0, spec.horse.height + 1, seatZ), new THREE.Vector3(0, -1, 0));
  const seatY = down.intersectObject(model, true)[0]?.point.y ?? spec.horse.height * 0.65;
  model.rotation.y = 0;
  model.updateMatrixWorld(true);

  return {
    yaw,
    legs,
    hoofBack,
    halfLength: Math.max(-box.min.z, box.max.z),
    halfWidth: Math.max(-box.min.x, box.max.x, MIN_HALF_WIDTH),
    riderOffset: { x: -hip.x, y: seatY + SEAT_LIFT - hip.y, z: seatZ - hip.z },
    height: pedestalHeight + seatY + SEAT_LIFT + spec.rider.height - hip.y,
  };
}

export async function loadKnightKit(spec, quality) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [rider, horse, pedestalGltf, emblem] = await Promise.all([
    loadPieceKit({ ...spec.rider, pedestal: false }, quality),
    spec.horse
      ? loadPieceKit({ ...spec.horse, pedestal: false }, quality).catch((err) => {
        console.error('[BChess] No se pudo cargar el caballo; el caballero irá a pie:', err);
        return null;
      })
      : null,
    loader.loadAsync(MODELS + spec.pedestalModel.files[quality.name]),
    spec.pennant ? new THREE.ImageLoader().loadAsync(spec.pennant.texture).catch(() => null) : null,
  ]);
  rider.strikes = measureStrikes(rider, spawnPiece, { faces: true });
  rider.body = measureBody(rider, spawnPiece, { actions: RIDER_FAN_ACTIONS });
  const hip = measureHip(rider);

  // La peana de los peones, ensanchada para que quepa el caballo.
  const pedestal = withShadows(pedestalGltf.scene);
  const pedestalHeight = spec.pedestalModel.height;
  fitToHeight(pedestal, pedestalHeight);
  const width = spec.pedestalModel.width ?? 1;
  pedestal.scale.x *= width;
  pedestal.scale.z *= width;
  pedestal.position.x *= width;
  pedestal.position.z *= width;
  pedestal.updateMatrixWorld(true);
  const footprint = new THREE.Box3().setFromObject(pedestal);

  return {
    spec,
    rider,
    horse,
    pedestal,
    pedestalHeight,
    hipHeight: hip.y,
    radius: Math.max(footprint.max.x - footprint.min.x, footprint.max.z - footprint.min.z) / 2,
    mount: horse ? measureMount(horse, spec, hip, pedestalHeight) : null,
    pennant: spec.pennant ? flagTexture(emblem) : null,
  };
}

export function spawnKnight(kit) {
  const { spec, mount } = kit;
  const object = new THREE.Group();
  object.name = 'caballero';

  const pedestal = new THREE.Group();
  pedestal.name = 'peana';
  pedestal.add(kit.pedestal.clone());
  object.add(pedestal);

  const rider = spawnPiece(kit.rider);
  object.add(rider.object);
  const horse = kit.horse ? spawnPiece(kit.horse) : null;
  if (horse) object.add(horse.object);
  // Giran primero hacia donde miran y después se inclinan sobre su propio eje (encabritarse, caer).
  rider.figure.rotation.order = 'YXZ';
  if (horse) horse.figure.rotation.order = 'YXZ';
  if (rider.props.sword) rider.props.sword.visible = false; // envainada mientras va a caballo

  const pennant = kit.pennant && rider.props.spear ? createFlag({ texture: kit.pennant, pole: false, poleHeight: 0 }) : null;
  if (pennant) {
    pennant.object.scale.setScalar(PENNANT_SCALE);
    pennant.object.rotation.y = Math.PI / 2; // la tela ondea hacia atrás
    pennant.object.position.y = rider.spearEnds.top - PENNANT_BELOW_TIP;
    rider.props.spear.add(pennant.object);
  }

  const height = mount?.height ?? kit.pedestalHeight + spec.rider.height;
  // Zona de toque invisible, del tamaño del caballero a caballo.
  const hitbox = new THREE.Mesh(
    new THREE.CylinderGeometry(HITBOX_RADIUS, HITBOX_RADIUS, height, 8),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  object.add(hitbox);

  let mounted = false;

  // El jinete se sienta en la silla: su figura pasa a colgar de la del caballo.
  function seatRider() {
    if (!horse) return;
    mounted = true;
    rider.resetBones();
    seat(rider, spec.rider.seat);
    horse.figure.add(rider.figure);
    rider.figure.position.set(mount.riderOffset.x, mount.riderOffset.y, mount.riderOffset.z);
    rider.figure.rotation.set(0, 0, 0);
    rider.figure.scale.setScalar(1);
  }

  // El jinete deja la silla donde está: su figura vuelve a colgar de su pieza, erguida y mirando hacia
  // donde miraba, con las piernas sueltas.
  function unseatRider() {
    if (!mounted) return;
    mounted = false;
    rider.object.attach(rider.figure);
    const turn = new THREE.Euler().setFromQuaternion(rider.figure.quaternion, 'YXZ');
    rider.figure.rotation.set(0, turn.y, 0);
    rider.figure.scale.setScalar(1);
    rider.resetBones();
  }

  return {
    object,
    pedestal,
    hitbox,
    horse,
    rider,
    mount,
    body: kit.rider.body, // medidas del jinete para pelear a pie (`measureBody`)
    radius: kit.radius,
    height,
    pedestalHeight: kit.pedestalHeight,
    hipHeight: kit.hipHeight,
    get mounted() {
      return mounted;
    },
    // A caballo, la figura es la del caballo; a pie (o sin caballo), la del jinete.
    get figure() {
      return mounted ? horse.figure : rider.figure;
    },
    seatRider,
    unseatRider,
    placeAt(position) {
      pedestal.position.set(position.x, 0, position.z);
      hitbox.position.set(position.x, height / 2, position.z);
      (horse ?? rider).figure.position.set(position.x, kit.pedestalHeight, position.z);
    },
    face(angle) {
      (horse ?? rider).figure.rotation.set(0, angle, 0);
    },
    update(dt) {
      horse?.update(dt);
      rider.update(dt);
      pennant?.update(dt);
    },
  };
}
```

- [ ] **Paso 2: El manifiesto**

En `assets/models/manifest.json`, después de `"black-rook": { … }` (añadiendo la coma), las dos entradas siguientes. En `rider.moves`, con lo elegido en la tarea 2, paso 6: quitar las versiones que no se eligieron, poner en `block`, `getup`, `dizzy` y `hop` las claves encontradas (o dejarlas vacías) y cambiar los `seconds` de los tajos por los apuntados. `thrust: true` marca las estocadas.

```json
    "white-knight": {
      "pedestalModel": { "files": { "movil": "pedestal-movil.glb", "ordenador": "pedestal-ordenador.glb" }, "height": 0.26, "width": 1.22 },
      "pennant": { "texture": "assets/textures/flag-white.jpg" },
      "horse": {
        "files": { "movil": "horse-movil.glb", "ordenador": "horse-ordenador.glb" },
        "height": 0.9,
        "required": ["walk"],
        "moves": { "idle": [{ "clip": "idle" }], "walk": [{ "clip": "walk" }] }
      },
      "rider": {
        "files": { "movil": "knight-movil.glb", "ordenador": "knight-ordenador.glb" },
        "height": 1.5,
        "yaw": 0,
        "moves": {
          "idle": [{ "clip": "idle" }],
          "walk": [{ "clip": "walk" }],
          "jump": [{ "clip": "jump_down" }],
          "attack": [
            { "clip": "slash", "seconds": 1.6 },
            { "clip": "box_03", "thrust": true },
            { "clip": "box_01", "thrust": true }
          ],
          "block": [],
          "kick": [{ "clip": "front_kick_02" }, { "clip": "front_kick_01" }],
          "hit": [{ "clip": "hit_to_head" }, { "clip": "hit_to_body_01" }, { "clip": "hit_to_stomach" }],
          "fall": [{ "clip": "fall", "travel": 0.3 }],
          "defeat": [{ "clip": "defeat_03", "travel": 0.4 }],
          "taunt": [{ "clip": "angry_01", "seconds": 2.6 }],
          "victory": [{ "clip": "cheer", "seconds": 3.2 }],
          "fidget": [{ "clip": "frightened", "travel": 0.4 }],
          "getup": [],
          "dizzy": [],
          "hop": []
        },
        "hands": {},
        "seat": { "thigh": { "x": -80, "z": 18 }, "calf": { "x": 75 } },
        "spear": { "hand": "right", "offset": [0, -0.07, 0.02], "rotation": [0, 0, 0], "grip": 0.7, "length": 2.3 },
        "sword": { "hand": "right", "offset": [0, -0.03, 0.03], "rotation": [1.5707963267948966, 0, 0], "length": 0.75 },
        "shield": { "hand": "left", "offset": [0.04, -0.34, 0.02], "rotation": [0, 1.5707963267948966, 0], "scale": 1 },
        "shieldModel": { "files": { "movil": "shield-movil.glb", "ordenador": "shield-ordenador.glb" }, "height": 0.62 }
      }
    },
    "black-knight": {
      "pedestalModel": { "files": { "movil": "black-pedestal-movil.glb", "ordenador": "black-pedestal-ordenador.glb" }, "height": 0.26, "width": 1.22 },
      "pennant": { "texture": "assets/textures/flag-black.jpg" },
      "horse": {
        "files": { "movil": "black-horse-movil.glb", "ordenador": "black-horse-ordenador.glb" },
        "height": 0.9,
        "required": ["walk"],
        "moves": { "idle": [{ "clip": "idle" }], "walk": [{ "clip": "walk" }] }
      },
      "rider": {
        "files": { "movil": "black-knight-movil.glb", "ordenador": "black-knight-ordenador.glb" },
        "height": 1.5,
        "yaw": 0,
        "moves": {
          "idle": [{ "clip": "idle" }],
          "walk": [{ "clip": "walk" }],
          "jump": [{ "clip": "jump_down" }],
          "attack": [
            { "clip": "slash", "seconds": 1.6 },
            { "clip": "box_03", "thrust": true },
            { "clip": "box_01", "thrust": true }
          ],
          "block": [],
          "kick": [{ "clip": "front_kick_02" }, { "clip": "front_kick_01" }],
          "hit": [{ "clip": "hit_to_head" }, { "clip": "hit_to_body_01" }, { "clip": "hit_to_stomach" }],
          "fall": [{ "clip": "fall", "travel": 0.3 }],
          "defeat": [{ "clip": "defeat_03", "travel": 0.4 }],
          "taunt": [{ "clip": "angry_01", "seconds": 2.6 }],
          "victory": [{ "clip": "cheer", "seconds": 3.2 }],
          "fidget": [{ "clip": "frightened", "travel": 0.4 }],
          "getup": [],
          "dizzy": [],
          "hop": []
        },
        "hands": {},
        "seat": { "thigh": { "x": -80, "z": 18 }, "calf": { "x": 75 } },
        "spear": { "hand": "right", "offset": [0, -0.07, 0.02], "rotation": [0, 0, 0], "grip": 0.7, "length": 2.3 },
        "sword": { "hand": "right", "offset": [0, -0.03, 0.03], "rotation": [1.5707963267948966, 0, 0], "length": 0.75 },
        "shield": { "hand": "left", "offset": [0.04, -0.34, 0.02], "rotation": [0, 1.5707963267948966, 0], "scale": 1 },
        "shieldModel": { "files": { "movil": "black-shield-movil.glb", "ordenador": "black-shield-ordenador.glb" }, "height": 0.62 }
      }
    }
```

Si el caballo no trae `idle`, se queda quieto en su postura de reposo (`rest`); el aviso de `resolveMoves` por la clave que falta se puede quitar borrando `idle` de sus `moves`.

Run: `cd ~/bchess && node -e "JSON.parse(require('fs').readFileSync('assets/models/manifest.json','utf8')); console.log('JSON válido')"`
Expected: `JSON válido`.

- [ ] **Paso 3: El mover y el salto**

`src/moves/knight-mover.js`:

```js
import * as THREE from 'three';
import { leapAt, planLeap } from './leap.js';
import { BOARD_EDGE, nearestEdgeExit, planWalk, pointAlong, shortestTurn } from './walk.js';

// Mover del caballero (diseño en docs/superpowers/specs/2026-09-15-bchess-caballero-design.md,
// secciones 4 a 6), con la misma forma que los de los peones y las torres. Para ir a otra casilla, el
// caballo gira, se encabrita mientras la peana encoge, salta en arco por encima de las piezas y
// aterriza, y la peana vuelve a crecer; sin caballo, el jinete salta igual. Mientras salta, y mientras
// el caballo anda o espera apartado, pide sitio a las piezas de alrededor (`crowd`). Los pasos sueltos
// (`room`, `turnTo`, `leapTo`, `dismount`, `walkTo`, `horseFlee`, `mount`) los usan las batallas, que
// ya tienen el bloqueo general.

const REAR_SECONDS = 0.4;
const REAR_ANGLE = 0.6; // radianes que se levanta el caballo al encabritarse
const THROW_REAR = 0.8; // y cuando tira al jinete
const MAX_PITCH = 0.7; // lo que más se inclina el cuerpo en el aire
const LEG_STRETCH = { front: -40, back: 35 }; // grados de las patas estiradas al subir
const LEG_TUCK = { front: 55, back: -45 }; // y recogidas al bajar
const LAND_SECONDS = 0.25;
const LAND_BOUNCE = 0.08;
const RISE_SECONDS = 0.4;
const ON_FOOT = { halfLength: 0.3, halfWidth: 0.3 }; // huella del jinete sin caballo
const POINT_STEP = 7; // de las demás piezas, un vértice de cada tantos para el arco del salto
const PATH_MARGIN = 1.3; // piezas más lejos que esto del camino no cuentan para el arco
const LOOK_AHEAD = 0.8; // casillas por delante que pide el caballo al andar
const SETTLE_LIMIT = 4; // segundos de juego que espera, como mucho, a que vuelvan las piezas
const DUST_Y = 0.05;
const JUMP_OFF_SIDE = 0.5; // lo que se aparta del caballo el jinete al saltar de la silla
const SPEAR_BESIDE = 0.25; // del jinete a su lanza clavada
const BACK_OFF = 0.9; // lo que retrocede el caballo tras desmontar el jinete
const BOARD_LIMIT = 3.9; // lo más lejos del centro del tablero que se para el caballo al retroceder
const FLEE_SPEED = 1.8; // veces su paseo, cuando huye
const DROP = 0.35; // lo que baja el caballo tras el borde del tablero al huir
const AVOID = 0.8; // lo que se aparta de la pelea el camino del caballo que huye
const THROW_SECONDS = 0.6;
const SIT_HEIGHT = 0.12; // altura de la cadera del jinete sentado en el suelo
const DAZE_SECONDS = 1;
const GETUP_SECONDS = 0.5;
const MOUNT_SECONDS = 0.55;
const SWORD_SECONDS = 0.2;

const segmentDistance = (p, a, b) => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
};
const clampToBoard = ({ x, z }) => ({
  x: Math.max(-BOARD_LIMIT, Math.min(BOARD_LIMIT, x)),
  z: Math.max(-BOARD_LIMIT, Math.min(BOARD_LIMIT, z)),
});

export function createKnightMover({ knight, owner, pieces, board, dust, fx, clock, cinema, crowd, onBusy = () => {}, restFacing }) {
  const { horse, rider } = knight;
  const swordScale = rider.props.sword?.scale.x ?? 1;
  let square = null;
  let busy = false;
  let heading = null; // destino {x, z} mientras el caballo anda
  let landing = null; // dónde cae {x, z} mientras salta
  let fled = null; // borde {x, z} por el que huyó el caballo
  let leaving = null; // la huida del caballo, mientras dura
  let spearThrown = false; // la lanza salió volando al tirarlo el caballo

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

  function turnFigure(figure, angle, seconds) {
    const from = figure.rotation.y;
    const delta = shortestTurn(from, angle);
    return clock.tween(seconds, (t) => {
      figure.rotation.y = from + delta * t;
    });
  }

  // Gira al caballo con su jinete o, a pie, al jinete.
  function turnTo(angle, seconds) {
    return turnFigure(knight.figure, angle, seconds);
  }

  function stillHorse() {
    if (horse && !horse.play('idle', { fade: 0.3 })) horse.rest();
  }

  function placeOn(target) {
    square = target;
    heading = null;
    landing = null;
    fled = null;
    leaving = null;
    spearThrown = false;
    const at = board.squareToWorld(target);
    knight.object.visible = true;
    knight.pedestal.visible = true;
    knight.pedestal.scale.setScalar(1);
    knight.pedestal.rotation.y = restFacing;
    rider.object.visible = true;
    rider.resetBones();
    rider.holdSpear();
    rider.setSpearPose(null);
    rider.setSpearDefault(null);
    rider.setGripSlide(0);
    if (rider.props.sword) {
      rider.props.sword.visible = false;
      rider.props.sword.scale.setScalar(swordScale);
    }
    if (horse) {
      horse.object.visible = true;
      horse.figure.scale.setScalar(1);
      horse.resetBones();
      stillHorse();
      knight.seatRider();
    }
    knight.placeAt(at);
    knight.face(restFacing);
    rider.figure.scale.setScalar(1);
    rider.play('idle', { fade: 0 });
  }

  // Cuerpos con los que pide sitio ahora:
  // - el caballo, mientras salta, con su largo alrededor de donde cae;
  // - el caballo que anda, con el tramo que tiene por delante;
  // - el caballo que espera sin jinete, con un círculo de su largo;
  // - en una batalla, `stance` ({ at, facing, reach }), el abanico de lo que hará el jinete en su puesto.
  function room({ stance = null } = {}) {
    const bodies = [];
    if (!knight.object.visible) return bodies;
    if (stance && rider.object.visible) bodies.push({ ...stance, margin: knight.body.margin });
    if (!horse?.object.visible) return bodies;
    const { halfLength, halfWidth } = knight.mount;
    const at = horse.figure.position;
    const scale = horse.figure.scale.x;
    if (landing) {
      bodies.push({ from: landing, to: landing, radius: halfLength });
    } else if (heading) {
      const dx = heading.x - at.x;
      const dz = heading.z - at.z;
      const left = Math.hypot(dx, dz);
      if (left > 1e-6) {
        const ux = dx / left;
        const uz = dz / left;
        const ahead = Math.min(LOOK_AHEAD, left);
        bodies.push({
          from: { x: at.x - ux * halfLength, z: at.z - uz * halfLength },
          to: { x: at.x + ux * (halfLength + ahead), z: at.z + uz * (halfLength + ahead) },
          radius: halfWidth * scale,
        });
      }
    } else if (!knight.mounted) {
      bodies.push({ from: { x: at.x, z: at.z }, to: { x: at.x, z: at.z }, radius: halfLength * scale });
    }
    return bodies;
  }

  // Puntos de las superficies de las demás piezas cerca del camino, para el arco del salto: un vértice de
  // cada POINT_STEP de sus mallas visibles, en su postura de ahora. `extra` son objetos que también
  // cuentan (el jinete, cuando salta el caballo solo).
  function pointsNear(from, to, extra = []) {
    const points = [];
    const v = new THREE.Vector3();
    const objects = [...extra];
    for (const entry of pieces()) {
      if (entry === owner || !entry.piece.object.visible) continue;
      entry.piece.figure.getWorldPosition(v);
      if (segmentDistance(v, from, to) <= PATH_MARGIN) objects.push(entry.piece.object);
    }
    for (const object of objects) {
      object.updateMatrixWorld(true);
      object.traverseVisible((o) => {
        if (!o.isMesh || (!Array.isArray(o.material) && !o.material.visible)) return;
        const position = o.geometry.attributes.position;
        for (let i = 0; i < position.count; i += POINT_STEP) {
          if (o.isSkinnedMesh) o.getVertexPosition(i, v);
          else v.fromBufferAttribute(position, i);
          v.applyMatrix4(o.matrixWorld);
          points.push({ x: v.x, y: v.y, z: v.z });
        }
      });
    }
    return points;
  }

  // Patas del caballo: estiradas (`stretch`, de 0 a 1) y recogidas (`tuck`).
  function setLegs(stretch, tuck) {
    for (const [name, bones] of Object.entries(knight.mount.legs)) {
      const end = name.startsWith('front') ? 'front' : 'back';
      const angle = LEG_STRETCH[end] * stretch + LEG_TUCK[end] * tuck;
      horse.turnBone(bones[0], Math.abs(angle) > 1e-3 ? { x: angle } : null);
    }
  }

  // Salto en arco de `figure` hasta `to` ({x, z}). `horseMoves`: el caballo se encabrita al despegar y
  // mueve las patas en el aire. Si el caballero está sobre la peana, la peana encoge al despegar.
  async function leap({ figure, to, footprint, horseMoves, extra = [] }) {
    const from = { x: figure.position.x, z: figure.position.z };
    const plan = planLeap({ from, to, points: pointsNear(from, to, extra), halfLength: footprint.halfLength, halfWidth: footprint.halfWidth });
    await turnFigure(figure, plan.heading, 0.25);

    // 1. Se encabrita mientras la peana encoge.
    const onPedestal = knight.pedestal.visible && figure === knight.figure;
    const startY = figure.position.y;
    dust.puff(new THREE.Vector3(from.x, DUST_Y, from.z));
    await clock.tween(REAR_SECONDS, (t) => {
      const k = Math.sin((Math.PI / 2) * t);
      if (onPedestal) knight.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      figure.position.y = startY * (1 - t) + (horseMoves ? knight.mount.hoofBack * Math.sin(REAR_ANGLE * k) : 0);
      if (horseMoves) figure.rotation.x = -REAR_ANGLE * k;
    });
    if (onPedestal) knight.pedestal.visible = false;

    // 2. Vuela: el cuerpo sigue la pendiente del arco y las patas se estiran al subir y se recogen al bajar.
    landing = { x: to.x, z: to.z };
    const rear = figure.rotation.x;
    if (!horseMoves) rider.play(rider.has('jump') ? 'jump' : 'idle', { loop: false, fade: 0.1 });
    await clock.tween(plan.duration, (u) => {
      const p = leapAt(plan, u);
      figure.position.set(p.x, p.y, p.z);
      if (!horseMoves) return;
      const pitch = -Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.climb));
      figure.rotation.x = u < 0.2 ? rear + (pitch - rear) * (u / 0.2) : pitch;
      setLegs(u < 0.5 ? Math.sin(2 * Math.PI * u) : 0, u >= 0.5 ? Math.sin(Math.PI * (2 * u - 1)) : 0);
    });

    // 3. Aterriza con un rebote, polvo y un temblor ligero.
    if (horseMoves) setLegs(0, 0);
    figure.position.set(to.x, 0, to.z);
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.06);
    const pitch = figure.rotation.x;
    await clock.tween(LAND_SECONDS, (t) => {
      figure.rotation.x = pitch * (1 - t);
      figure.position.y = Math.sin(Math.PI * t) * LAND_BOUNCE;
    });
    figure.rotation.x = 0;
    figure.position.y = 0;
    landing = null;
    if (!horseMoves) rider.play('idle', { fade: 0.2 });
  }

  // El caballero, a caballo o a pie, salta hasta `to`.
  function leapTo(to) {
    return leap({ figure: knight.figure, to, footprint: knight.mounted ? knight.mount : ON_FOOT, horseMoves: knight.mounted });
  }

  // La peana reaparece bajo sus pies en `to` entre polvo, lo sube y lo gira hacia el oponente.
  async function rise(to) {
    const figure = knight.figure;
    knight.pedestal.position.set(to.x, 0, to.z);
    knight.pedestal.rotation.y = restFacing;
    knight.pedestal.visible = true;
    knight.hitbox.position.set(to.x, knight.height / 2, to.z);
    dust.puff(new THREE.Vector3(to.x, DUST_Y, to.z));
    await clock.tween(RISE_SECONDS, (t) => {
      const k = 1 - (1 - t) ** 3;
      knight.pedestal.scale.setScalar(Math.max(0.001, k));
      figure.position.y = knight.pedestalHeight * k;
    });
    await turnTo(restFacing, 0.35);
  }

  function goTo(target) {
    if (target === square) return Promise.resolve(false);
    return exclusive(async () => {
      const to = board.squareToWorld(target);
      const release = crowd.claim({ owners: [owner], bodies: () => room() });
      try {
        await leapTo(to);
        await rise(to);
        square = target;
      } catch (err) {
        console.error('[BChess] El caballero no pudo saltar:', err);
        placeOn(target);
      } finally {
        release();
      }
      await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
    });
  }

  // Desaparece del tablero encogiendo dentro de una nube de polvo (capturas sin batalla).
  async function vanish() {
    const at = knight.figure.getWorldPosition(new THREE.Vector3());
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    await clock.tween(0.5, (t) => {
      const k = Math.max(0.001, 1 - t * t);
      knight.pedestal.scale.setScalar(k);
      if (horse) horse.figure.scale.setScalar(k);
      if (!knight.mounted) rider.figure.scale.setScalar(k);
    });
    knight.object.visible = false;
  }

  return {
    placeOn,
    goTo,
    vanish,
    room,
    turnTo,
    leapTo,
    get square() {
      return square;
    },
    get busy() {
      return busy;
    },
  };
}
```

Las constantes de desmontar, huir y montar (`THROW_REAR`, `JUMP_OFF_SIDE`, `BACK_OFF`…) y `BOARD_EDGE`, `nearestEdgeExit`, `planWalk` y `pointAlong` se usan en la tarea 10.

- [ ] **Paso 4: Conectar en `main.js`**

En `src/main.js`, sustituir:

```js
import { loadRookKit, spawnRook } from './pieces/rook.js';
```

por:

```js
import { loadRookKit, spawnRook } from './pieces/rook.js';
import { loadKnightKit, spawnKnight } from './pieces/knight.js';
```

Sustituir `import { createRookMover } from './moves/rook-mover.js';` por:

```js
import { createRookMover } from './moves/rook-mover.js';
import { createKnightMover } from './moves/knight-mover.js';
```

Sustituir `import { rookMoves } from './rules/rook.js';` por:

```js
import { rookMoves } from './rules/rook.js';
import { knightMoves } from './rules/knight.js';
```

Sustituir:

```js
// Arranque: peones blancos en la fila 2 y negros en la 7, y torres en las esquinas (las piezas
// que traiga el manifiesto). Tocas una pieza y se marcan sus casillas posibles (puntos dorados) y
```

por:

```js
// Arranque: peones blancos en la fila 2 y negros en la 7, torres en las esquinas y caballeros en las
// columnas b y g (las piezas que traiga el manifiesto). Tocas una pieza y se marcan sus casillas
// posibles (puntos dorados) y
```

Sustituir:

```js
  { color: 'white', pawn: 'white-pawn', rook: 'white-rook', pawnRank: 2, backRank: 1 },
  { color: 'black', pawn: 'black-pawn', rook: 'black-rook', pawnRank: 7, backRank: 8 },
];
const FILES = 'abcdefgh';
const ROOK_FILES = 'ah';
```

por:

```js
  { color: 'white', pawn: 'white-pawn', rook: 'white-rook', knight: 'white-knight', pawnRank: 2, backRank: 1 },
  { color: 'black', pawn: 'black-pawn', rook: 'black-rook', knight: 'black-knight', pawnRank: 7, backRank: 8 },
];
const FILES = 'abcdefgh';
const ROOK_FILES = 'ah';
const KNIGHT_FILES = 'bg';
```

Sustituir `  const pieces = []; // { kind: 'pawn' | 'rook', color, piece, mover }` por `  const pieces = []; // { kind: 'pawn' | 'rook' | 'knight', color, piece, mover }`.

Sustituir:

```js
  const movesOf = (entry) => (entry.kind === 'rook'
    ? rookMoves(entry.mover.square, occupied(), enemiesOf(entry)).moves
    : pawnMoves(entry.mover.square, occupied(), entry.color));
  const capturesOf = (entry) => (entry.kind === 'rook'
    ? rookMoves(entry.mover.square, occupied(), enemiesOf(entry)).captures
    : pawnCaptures(entry.mover.square, enemiesOf(entry), entry.color));
```

por:

```js
  // La torre y el caballero se mueven y comen igual; el peón come de otra forma que avanza.
  const reach = (entry) => (entry.kind === 'rook'
    ? rookMoves(entry.mover.square, occupied(), enemiesOf(entry))
    : knightMoves(entry.mover.square, occupied(), enemiesOf(entry)));
  const movesOf = (entry) => (entry.kind === 'pawn' ? pawnMoves(entry.mover.square, occupied(), entry.color) : reach(entry).moves);
  const capturesOf = (entry) => (entry.kind === 'pawn' ? pawnCaptures(entry.mover.square, enemiesOf(entry), entry.color) : reach(entry).captures);
```

Hasta la tarea 12, las capturas con caballero son capturas sin batalla. Sustituir:

```js
      } else if (canSmash(attacker, defender)) {
```

por:

```js
      } else if (attacker.kind !== 'knight' && defender.kind !== 'knight' && canSmash(attacker, defender)) {
```

Sustituir `  async function loadPieces() {` por:

```js
  // Los caballeros también van aparte.
  async function loadKnights(manifest) {
    try {
      const sides = SIDES.filter((side) => manifest.pieces?.[side.knight]);
      const kits = await Promise.all(sides.map((side) => loadKnightKit(manifest.pieces[side.knight], quality)));
      sides.forEach((side, i) => {
        for (const file of KNIGHT_FILES) {
          const piece = spawnKnight(kits[i]);
          const entry = { kind: 'knight', color: side.color, piece };
          entry.mover = createKnightMover({
            knight: piece, owner: entry, pieces: () => pieces, board, dust, fx, clock, cinema, crowd, onBusy, restFacing: restFacingFor(side.color),
          });
          addPiece(entry, file + side.backRank);
        }
      });
    } catch (err) {
      console.error('[BChess] No se pudieron cargar los caballeros:', err);
      hud.showMessage('No se pudieron cargar los caballeros', { retry: () => loadKnights(manifest) });
    }
  }

  async function loadPieces() {
```

Sustituir `    await Promise.all([loadPawns(manifest), loadRooks(manifest)]);` por `    await Promise.all([loadPawns(manifest), loadRooks(manifest), loadKnights(manifest)]);`.

Y sustituir:

```js
    get rooks() {
      return pieces.filter((entry) => entry.kind === 'rook');
    },
```

por:

```js
    get rooks() {
      return pieces.filter((entry) => entry.kind === 'rook');
    },
    get knights() {
      return pieces.filter((entry) => entry.kind === 'knight');
    },
```

Run: `cd ~/bchess && npm test && node --check src/main.js && node --check src/pieces/knight.js && node --check src/moves/knight-mover.js`
Expected: todas pasan y ninguna comprobación de sintaxis dice nada.

- [ ] **Paso 5: Comprobación por código del salto**

`raw/tmp/verificar-caballero.js`:

```js
// Comprobación por código de los saltos del caballero (solo desarrollo; raw/ no se publica). En cada
// salto mide:
// - `hueco`, `apartado`: lo mismo que con la torre (`medidor`);
// - `holguraSalto`: lo más bajo que pasa algún punto del caballo o del jinete por encima de lo que
//   tiene debajo de las demás piezas (negativo si lo toca);
// - `jinete`: la parte de las piernas del jinete que queda dentro del caballo y lo más hondo que entra,
//   sentado sobre la peana y en lo más alto del salto;
// - `final`: todas las piezas en el centro de su casilla y el caballero a caballo sobre su peana.
import * as THREE from '/vendor/three/build/three.module.js';
import { final, medidor } from './verificar-torre.js';

const CELL = 0.05; // lado de cada celda del mapa de alturas
const EVERY = 5; // de las demás piezas, un vértice de cada tantos
const MOVING_EVERY = 11; // del caballo y el jinete, un vértice de cada tantos
const LEG_BONES = ['L_Thigh', 'L_Calf', 'L_Foot', 'R_Thigh', 'R_Calf', 'R_Foot'];

export async function listo() {
  for (let i = 0; i < 120 && !(window.bchess && window.bchess.knights?.length === 4 && window.bchess.rooks.length === 4 && window.bchess.pawns.length === 16); i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  window.bchess.gesture.at = Infinity;
  return window.bchess;
}

// Puntos de las mallas visibles de `object`, uno de cada `every` vértices, en su postura de ahora.
function pointsOf(object, every, keep = () => true) {
  const points = [];
  const v = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.traverseVisible((o) => {
    if (!o.isMesh || (!Array.isArray(o.material) && !o.material.visible)) return;
    const position = o.geometry.attributes.position;
    for (let i = 0; i < position.count; i += every) {
      if (!keep(o, i)) continue;
      if (o.isSkinnedMesh) o.getVertexPosition(i, v);
      else v.fromBufferAttribute(position, i);
      points.push(v.clone().applyMatrix4(o.matrixWorld));
    }
  });
  return points;
}

// Mapa de alturas de las demás piezas: por celda, lo más alto y lo más bajo que hay.
function heightMap(b, except) {
  const cells = new Map();
  for (const entry of b.pieces) {
    if (entry === except || !entry.piece.object.visible) continue;
    for (const p of pointsOf(entry.piece.object, EVERY)) {
      const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
      const cell = cells.get(key);
      if (!cell) cells.set(key, { top: p.y, bottom: p.y, square: entry.mover.square });
      else {
        cell.top = Math.max(cell.top, p.y);
        cell.bottom = Math.min(cell.bottom, p.y);
      }
    }
  }
  return cells;
}

// Parte de las piernas del jinete que queda dentro del caballo: un rayo hacia arriba desde cada punto
// cruza la malla del caballo un número impar de veces si el punto está dentro.
function riderInHorse(knight) {
  const { rider, horse } = knight;
  if (!horse || !knight.mounted) return null;
  const skeleton = [];
  rider.object.traverse((o) => { if (o.isSkinnedMesh) skeleton.push(o); });
  const legs = new Set();
  for (const mesh of skeleton) {
    mesh.skeleton.bones.forEach((bone, i) => { if (LEG_BONES.includes(bone.name)) legs.add(`${mesh.uuid}:${i}`); });
  }
  const keep = (mesh, i) => {
    const index = mesh.geometry.attributes.skinIndex;
    const weight = mesh.geometry.attributes.skinWeight;
    if (!index) return false;
    let share = 0;
    for (let j = 0; j < 4; j++) if (legs.has(`${mesh.uuid}:${index.getComponent(i, j)}`)) share += weight.getComponent(i, j);
    return share >= 0.5;
  };
  const points = pointsOf(rider.object, MOVING_EVERY, keep);
  const horseMeshes = [];
  horse.object.traverse((o) => { if (o.isSkinnedMesh) horseMeshes.push(o); });
  const up = new THREE.Vector3(0, 1, 0);
  let inside = 0;
  let deepest = 0;
  for (const p of points) {
    const hits = new THREE.Raycaster(p, up, 0, 3).intersectObjects(horseMeshes, false);
    if (hits.length % 2 === 1) {
      inside++;
      deepest = Math.max(deepest, hits[0].distance);
    }
  }
  return { puntos: points.length, dentro: +(inside / Math.max(1, points.length)).toFixed(3), hondo: +deepest.toFixed(3) };
}

export async function saltar(desde, hasta) {
  const b = await listo();
  const knight = b.pieces.find((p) => p.mover.square === desde);
  const camara = b.stage.camera.position.clone();
  const m = medidor(b, [knight]);
  const salida = riderInHorse(knight.piece);
  let cells = heightMap(b, knight);
  let holgura = { valor: 9 };
  let enLoAlto = null;
  let alto = 0;
  await b.tap({ owner: knight });
  const jugada = b.tap({ square: hasta });
  let frames = 0;
  while (b.state.busy && frames < 3000) {
    await b.advance(1 / 60);
    m.muestra();
    if (frames % 10 === 0) cells = heightMap(b, knight);
    if (frames % 2 === 0) {
      const figure = knight.piece.figure;
      for (const p of pointsOf(knight.piece.object, MOVING_EVERY)) {
        const cell = cells.get(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`);
        if (!cell || p.y < cell.bottom - CELL) continue;
        const valor = p.y - cell.top;
        if (valor < holgura.valor) holgura = { valor: +valor.toFixed(3), pieza: cell.square, altura: +p.y.toFixed(2), t: +b.clock.now.toFixed(2) };
      }
      // El jinete, medido una vez: en cuanto el caballo empieza a bajar tras lo más alto del salto.
      if (figure.position.y > alto) alto = figure.position.y;
      else if (!enLoAlto && alto > 0.5 && figure.position.y < alto - 0.01) enLoAlto = riderInHorse(knight.piece);
    }
    frames++;
  }
  await jugada;
  await b.advance(1);
  const p = knight.piece;
  const centro = b.board.squareToWorld(knight.mover.square);
  return JSON.stringify({
    desde, hasta, frames, ...m.peor, holguraSalto: holgura, pico: +alto.toFixed(2),
    jinete: { salida, enLoAlto },
    caballero: {
      casilla: knight.mover.square,
      aCaballo: p.mounted,
      peana: p.pedestal.visible && Math.abs(p.pedestal.scale.x - 1) < 1e-6,
      centro: +Math.hypot(p.figure.position.x - centro.x, p.figure.position.z - centro.z).toFixed(4),
      altura: +p.figure.position.y.toFixed(3),
      mira: +p.figure.rotation.y.toFixed(3),
    },
    ...final(b, camara),
  });
}
```

Con la vista previa en marcha, para cada salto (`saltar('b1', 'c3')` y, en otra recarga, `saltar('g8', 'f6')`), lanzarlo en segundo plano en la consola:

```js
window.__r = null;
import('/raw/tmp/verificar-caballero.js').then((m) => m.saltar('b1', 'c3')).then((r) => { window.__r = r; });
```

y consultar el resultado con la espera de la tarea 7, paso 4.

Expected:
- `holguraSalto.valor` ≥ 0 (ni el caballo ni el jinete tocan ninguna pieza) y `pico` entre 2,5 y 3,6 (entre los peones de b2 y c2, con sus lanzas de 2,54 de alto; en f6, entre los de f7 y g7);
- `hueco` ≥ 0,029, `apartado` ≤ 0,45 y `ambos` 0;
- `jinete.salida` y `jinete.enLoAlto` con `dentro` ≤ 0,05 y `hondo` ≤ 0,03;
- `caballero`: la casilla de destino, `aCaballo: true`, `peana: true`, `centro: 0`, `altura: 0.26` y `mira` π (3,142) para el blanco y 0 para el negro;
- `fuera` vacío, `piezas` 24, `camara` 0, `controles: true` y ningún error en la consola.

- [ ] **Paso 6: Mirarlo y ajustar**

En la vista previa visible (o en Chrome, en `http://localhost:8741/`), con capturas de pantalla:
- los cuatro caballeros en b1, g1, b8 y g8, a caballo sobre su peana y mirando al oponente;
- la cabeza del caballo, delante (si mira hacia atrás o de lado, `findHorseBones` tomó por cabeza otro hueso: comprobar con `bchess.knights[0].piece.mount.yaw` y la lista de huesos de la tarea 6, paso 5);
- el jinete sentado con una pierna a cada lado, la lanza erguida en la mano derecha con el banderín ondeando hacia atrás, y el escudo en el brazo izquierdo;
- un salto de b1 a c3 tocando las piezas de verdad.

Si hace falta, ajustar en el manifiesto `horse.height` (hasta que `bchess.knights[0].piece.height` sea 1,8 ± 0,05), `rider.seat` (si las piernas se hunden en el caballo o quedan en el aire) y `rider.spear.offset`, y repetir el paso 5.

- [ ] **Paso 7: Commit**

```bash
git add src/pieces/knight.js src/moves/knight-mover.js assets/models/manifest.json src/main.js
git commit -m "Caballeros a caballo en el tablero, con su salto de ajedrez" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 10: Desmontar, montar y el caballo que huye

**Files:**
- Create: `raw/tmp/verificar-desmontar.js` (no se publica)
- Modify: `src/moves/knight-mover.js`, `raw/tmp/verificar-caballero.js`

**Interfaces:**
- Consumes: el mover y la pieza de la tarea 9; `plantSpear`, `holdSpear`, `throwSpear`, `turnBone`, `rest` (tarea 8); `fx.koStars`.
- Produces, en el mover del caballero:
  - `leavePedestal() → Promise`: la peana encoge y la figura baja al tablero;
  - `dismount({ at: {x, z}, facing, mode: 'dismount' | 'thrown' }) → Promise`: acaba con el jinete de pie en `at`, mirando a `facing` y con la espada en la mano;
  - `walkTo({x, z})`: el jinete anda por el tablero;
  - `drawSword() → Promise`;
  - `horseFlee({ avoid: {x, z} | null }) → Promise`: el caballo sin jinete huye sin cruzar `avoid`; `horseLeaving` es la huida en curso o null;
  - `mount(square) → Promise`: tras ganar, acaba a caballo sobre su peana en el centro de `square`;
  - `defeated({ avoid }) → Promise`: el jinete vencido se esfuma y el caballo que esperaba huye;
  - `sit(sitting: boolean)` y `standUp() → Promise`: sentado en el suelo y levantarse.

Todo lo de esta tarea va en `src/moves/knight-mover.js`, antes de la línea `  // Desaparece del tablero encogiendo dentro de una nube de polvo (capturas sin batalla).`, en tres pasos.

- [ ] **Paso 1: Pasos sueltos: peana, arco, lado libre, andar y espada**

Añadir:

```js
  // Si está sobre la peana, la peana encoge entre polvo mientras la figura baja al tablero.
  async function leavePedestal() {
    if (!knight.pedestal.visible) return;
    const figure = knight.figure;
    const startY = figure.position.y;
    dust.puff(new THREE.Vector3(figure.position.x, DUST_Y, figure.position.z));
    await clock.tween(0.35, (t) => {
      knight.pedestal.scale.setScalar(Math.max(0.001, 1 - t));
      figure.position.y = startY * (1 - t * t);
    });
    knight.pedestal.visible = false;
  }

  // Salto en arco de una figura de `from` a `to` (puntos del tablero), sin girarla.
  function jumpArc(figure, from, to, seconds, height) {
    return clock.tween(seconds, (t) => {
      figure.position.lerpVectors(from, to, t);
      figure.position.y += Math.sin(Math.PI * t) * height;
    });
  }

  // De los dos lados de `at`, a `distance` y con la figura mirando a `facing`, el que queda más lejos de
  // las demás piezas.
  function clearestSide(at, facing, distance) {
    const v = new THREE.Vector3();
    const others = pieces()
      .filter((entry) => entry !== owner && entry.piece.object.visible)
      .map((entry) => entry.piece.figure.getWorldPosition(v).clone());
    const spots = [1, -1].map((side) => ({ x: at.x + Math.cos(facing) * distance * side, z: at.z - Math.sin(facing) * distance * side }));
    const space = (spot) => Math.min(Infinity, ...others.map((o) => Math.hypot(o.x - spot.x, o.z - spot.z)));
    return space(spots[0]) >= space(spots[1]) ? spots[0] : spots[1];
  }

  // El jinete anda, ya sin peana ni caballo, desde donde está hasta `to` ({x, z}).
  async function walkTo(to) {
    const figure = rider.figure;
    const from = { x: figure.position.x, z: figure.position.z };
    const walk = planWalk(from, to, rider.walkSpeed);
    if (walk.distance < 1e-3) return;
    await turnFigure(figure, walk.heading, 0.2);
    rider.play('walk', { fade: 0.15 });
    await clock.tween(walk.duration, (t) => {
      const p = pointAlong(from, to, t);
      figure.position.set(p.x, 0, p.z);
    });
    rider.play('idle', { fade: 0.25 });
  }

  // El caballo, sin jinete, anda hasta `to` pidiendo sitio por delante. Con `backwards`, retrocede sin
  // girarse.
  async function horseWalk(to, { speed = 1, backwards = false } = {}) {
    const figure = horse.figure;
    const from = { x: figure.position.x, z: figure.position.z };
    const walk = planWalk(from, to, horse.walkSpeed * speed);
    if (walk.distance < 1e-3) return;
    if (!backwards) await turnFigure(figure, walk.heading, 0.3);
    heading = { x: to.x, z: to.z };
    const action = horse.play('walk', { fade: 0.2 });
    if (action) action.timeScale = backwards ? -speed : speed;
    try {
      await clock.tween(walk.duration, (t) => {
        const p = pointAlong(from, to, t);
        figure.position.set(p.x, 0, p.z);
      });
    } finally {
      heading = null;
      if (action) action.timeScale = 1;
    }
    stillHorse();
  }

  // Desenvaina: la espada aparece en la mano, creciendo.
  async function drawSword() {
    const sword = rider.props.sword;
    if (!sword || sword.visible) return;
    sword.scale.setScalar(0.001);
    sword.visible = true;
    await clock.tween(SWORD_SECONDS, (t) => sword.scale.setScalar(Math.max(0.001, swordScale * t)));
  }

  // Envaina: la espada encoge hasta desaparecer.
  async function sheathSword() {
    const sword = rider.props.sword;
    if (!sword?.visible) return;
    await clock.tween(SWORD_SECONDS, (t) => sword.scale.setScalar(Math.max(0.001, swordScale * (1 - t))));
    sword.visible = false;
    sword.scale.setScalar(swordScale);
  }
```

- [ ] **Paso 2: Desmontar, caer y huir**

Añadir, a continuación:

```js
  // Borde del tablero más cercano por el que puede huir el caballo desde `point` sin cruzar la pelea
  // (`avoid`, {x, z}).
  function exitAwayFrom(point, avoid) {
    const exits = [
      { x: BOARD_EDGE, z: point.z }, { x: -BOARD_EDGE, z: point.z },
      { x: point.x, z: BOARD_EDGE }, { x: point.x, z: -BOARD_EDGE },
    ].sort((a, b) => Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z));
    return exits.find((exit) => !avoid || segmentDistance(avoid, point, exit) > AVOID) ?? nearestEdgeExit(point);
  }

  // El caballo sin jinete huye andando deprisa hasta el borde del tablero y desaparece tras él.
  function horseFlee({ avoid = null } = {}) {
    if (!horse?.object.visible || knight.mounted) return leaving ?? Promise.resolve();
    leaving = (async () => {
      const figure = horse.figure;
      const exit = exitAwayFrom({ x: figure.position.x, z: figure.position.z }, avoid);
      fled = exit;
      await horseWalk(exit, { speed: FLEE_SPEED });
      dust.puff(new THREE.Vector3(exit.x, DUST_Y, exit.z), { count: 10, radius: 0.5, duration: 0.5 });
      await clock.tween(0.4, (t) => {
        figure.position.y = -DROP * t;
        figure.scale.setScalar(Math.max(0.001, 1 - t));
      });
      horse.object.visible = false;
      figure.position.y = 0;
      leaving = null;
    })();
    return leaving;
  }

  // Sentado en el suelo, con las piernas estiradas hacia delante; con `false`, las piernas sueltas.
  function sit(sitting) {
    for (const bone of ['L_Thigh', 'R_Thigh']) rider.turnBone(bone, sitting ? { x: -90 } : null);
  }

  // Se levanta del suelo: con su animación, si la tiene; si no, con un saltito.
  async function standUp() {
    const figure = rider.figure;
    const startY = figure.position.y;
    if (rider.has('getup')) {
      sit(false);
      figure.position.y = 0;
      await rider.playOnce('getup', { fade: 0.1 });
      rider.play('idle', { fade: 0.2 });
      return;
    }
    await clock.tween(GETUP_SECONDS, (t) => {
      for (const bone of ['L_Thigh', 'R_Thigh']) rider.turnBone(bone, { x: -90 * (1 - t) });
      figure.position.y = startY * (1 - t) + Math.sin(Math.PI * t) * 0.15;
    });
    sit(false);
    figure.position.y = 0;
  }

  // Salta de la silla a un lado, clava la lanza junto a él, el caballo retrocede y espera, y el jinete va
  // a su puesto.
  async function jumpOff(at, facing) {
    const side = clearestSide(at, facing, JUMP_OFF_SIDE);
    const from = rider.figure.getWorldPosition(new THREE.Vector3());
    knight.unseatRider();
    rider.play(rider.has('jump') ? 'jump' : 'idle', { loop: false, fade: 0.1 });
    await jumpArc(rider.figure, from, new THREE.Vector3(side.x, 0, side.z), 0.5, 0.25);
    dust.puff(new THREE.Vector3(side.x, DUST_Y, side.z), { count: 6, radius: 0.35, duration: 0.3 });
    rider.play('idle', { fade: 0.25 });
    const out = Math.hypot(side.x - at.x, side.z - at.z) || 1;
    rider.plantSpear({ x: side.x + ((side.x - at.x) / out) * SPEAR_BESIDE, z: side.z + ((side.z - at.z) / out) * SPEAR_BESIDE });
    await horseWalk(clampToBoard({ x: at.x - Math.sin(facing) * BACK_OFF, z: at.z - Math.cos(facing) * BACK_OFF }), { backwards: true });
    await walkTo(at);
  }

  // El caballo se encabrita y lo tira: cae sentado entre polvo y estrellitas, la lanza sale volando, el
  // caballo huye y el jinete se levanta y va a su puesto.
  async function thrownOff(at, facing) {
    const figure = horse.figure;
    const rearUp = (k) => {
      figure.rotation.x = -THROW_REAR * k;
      figure.position.y = knight.mount.hoofBack * Math.sin(THROW_REAR * k);
    };
    await clock.tween(REAR_SECONDS, (t) => rearUp(Math.sin((Math.PI / 2) * t)));
    const from = rider.figure.getWorldPosition(new THREE.Vector3());
    knight.unseatRider();
    spearThrown = true;
    rider.throwSpear({ x: -Math.sin(facing), z: -Math.cos(facing) });
    const side = clearestSide(at, facing, JUMP_OFF_SIDE);
    const ground = new THREE.Vector3(side.x - Math.sin(facing) * 0.3, 0, side.z - Math.cos(facing) * 0.3);
    sit(true);
    await Promise.all([
      jumpArc(rider.figure, from, new THREE.Vector3(ground.x, SIT_HEIGHT - knight.hipHeight, ground.z), THROW_SECONDS, 0.4),
      clock.tween(REAR_SECONDS, (t) => rearUp(1 - t)),
    ]);
    figure.rotation.x = 0;
    figure.position.y = 0;
    dust.puff(ground.setY(DUST_Y), { count: 14, radius: 0.6, duration: 0.6 });
    cinema.shake(0.08);
    fx.koStars(rider.object.getObjectByName('Head') ?? rider.figure, { seconds: DAZE_SECONDS });
    horseFlee({ avoid: at });
    await clock.wait(DAZE_SECONDS);
    await standUp();
    await walkTo(at);
  }

  // Baja del caballo para pelear en `at` ({x, z}), mirando a `facing`, y desenvaina. `mode` es 'dismount'
  // (salta de la silla y el caballo espera apartado) o 'thrown' (el caballo lo tira y huye; la huida
  // sigue sola, en `horseLeaving`). Sin caballo, baja de la peana y va andando.
  async function dismount({ at, facing, mode = 'dismount' }) {
    await leavePedestal();
    if (!knight.mounted) {
      await walkTo(at);
    } else {
      await turnTo(facing, 0.25);
      if (mode === 'thrown') await thrownOff(at, facing);
      else await jumpOff(at, facing);
    }
    await turnFigure(rider.figure, facing, 0.2);
    await drawSword();
  }
```

- [ ] **Paso 3: Montar, vencido y lo que ofrece el mover**

Añadir, a continuación:

```js
  // El caballo vuelve hasta `to` ({x, z}): si había huido, espera a que acabe de irse, reaparece en el
  // borde por donde se fue y entra en el tablero; después salta.
  async function horseComes(to) {
    const figure = horse.figure;
    if (leaving) await leaving;
    if (fled) {
      const inside = clampToBoard(fled);
      figure.position.set(fled.x, 0, fled.z);
      figure.rotation.set(0, Math.atan2(inside.x - fled.x, inside.z - fled.z), 0);
      figure.scale.setScalar(0.001);
      horse.object.visible = true;
      dust.puff(new THREE.Vector3(fled.x, DUST_Y, fled.z), { count: 10, radius: 0.5, duration: 0.5 });
      await clock.tween(0.3, (t) => figure.scale.setScalar(Math.max(0.001, t)));
      await horseWalk(inside);
      fled = null;
    }
    await leap({ figure, to, footprint: knight.mount, horseMoves: true, extra: [rider.object] });
    stillHorse();
  }

  // Tras ganar, en la casilla `target`: el jinete se aparta a un lado de su centro, el caballo se reúne
  // con él de un salto, el jinete envaina, monta de otro salto y recoge la lanza (si salió volando, le
  // aparece en la mano entre polvo) y la peana crece bajo los cascos.
  async function mount(target) {
    const center = board.squareToWorld(target);
    if (!horse) {
      await walkTo(center);
      await sheathSword();
      rider.holdSpear();
      await rise(center);
      square = target;
      return;
    }
    const side = clearestSide(center, restFacing, JUMP_OFF_SIDE);
    await walkTo(side);
    await Promise.all([horseComes(center), sheathSword()]);
    await Promise.all([turnFigure(horse.figure, restFacing, 0.3), turnFigure(rider.figure, restFacing, 0.3)]);
    const from = rider.figure.getWorldPosition(new THREE.Vector3());
    const seatAt = horse.figure.localToWorld(new THREE.Vector3(knight.mount.riderOffset.x, knight.mount.riderOffset.y, knight.mount.riderOffset.z));
    rider.play(rider.has('jump') ? 'jump' : 'idle', { loop: false, fade: 0.1 });
    await jumpArc(rider.figure, from, seatAt, MOUNT_SECONDS, 0.35);
    knight.seatRider();
    rider.play('idle', { fade: 0.2 });
    const planted = rider.props.spear && !spearThrown ? rider.props.spear.getWorldPosition(new THREE.Vector3()) : null;
    rider.holdSpear();
    if (planted) dust.puff(planted.setY(DUST_Y), { count: 6, radius: 0.3, duration: 0.3 });
    const hand = rider.props.spear?.getWorldPosition(new THREE.Vector3());
    if (hand) dust.puff(hand, { count: spearThrown ? 8 : 4, radius: 0.25, duration: 0.3 });
    spearThrown = false;
    await rise(center);
    square = target;
  }

  // El jinete vencido desaparece encogiendo en una nube de polvo, y el caballo que esperaba huye sin
  // cruzar la pelea (`avoid`).
  async function defeated({ avoid = null } = {}) {
    const at = rider.figure.getWorldPosition(new THREE.Vector3());
    dust.puff(new THREE.Vector3(at.x, DUST_Y, at.z), { count: 18, radius: 0.8, duration: 0.7 });
    const escape = horseFlee({ avoid });
    await clock.tween(0.5, (t) => rider.figure.scale.setScalar(Math.max(0.001, 1 - t * t)));
    rider.object.visible = false;
    await escape;
    knight.object.visible = false;
  }
```

Y en el `return` del mover, sustituir:

```js
    turnTo,
    leapTo,
    get square() {
```

por:

```js
    turnTo,
    leapTo,
    leavePedestal,
    dismount,
    walkTo,
    drawSword,
    horseFlee,
    mount,
    defeated,
    sit,
    standUp,
    get horseLeaving() {
      return leaving;
    },
    get square() {
```

- [ ] **Paso 4: Sintaxis y pruebas**

Run: `cd ~/bchess && node --check src/moves/knight-mover.js && npm test`
Expected: sin mensajes de sintaxis y todas las pruebas pasan. (Con piezas provisionales, el peón como jinete y el gigante como caballo, estos pasos ya se ejecutaron sin errores antes de escribir el plan: desmontar, montar, tirado, huida y vuelta, acabando a caballo en el centro de la casilla.)

- [ ] **Paso 5: Comprobación por código**

En `raw/tmp/verificar-caballero.js`, sustituir `function riderInHorse(knight) {` por `export function riderInHorse(knight) {`.

`raw/tmp/verificar-desmontar.js`:

```js
// Comprobación por código de desmontar y montar (solo desarrollo; raw/ no se publica). Lleva el caballero
// blanco de b1 a d4 y el peón negro de d7 a d5 y, delante de él, desmonta y vuelve a montar: primero
// saltando de la silla y después tirado por el caballo, que huye y vuelve. Mide lo mismo que `saltar` y
// el estado al final de cada paso.
import { final, medidor } from './verificar-torre.js';
import { listo, riderInHorse } from './verificar-caballero.js';

const round = (x) => +x.toFixed(3);

export async function desmontar() {
  const b = await listo();
  const at = (square) => b.pieces.find((p) => p.mover.square === square);
  const knight = at('b1');
  knight.mover.placeOn('d4');
  at('d7').mover.placeOn('d5');
  await b.advance(0.1);
  const camara = b.stage.camera.position.clone();
  const m = medidor(b, [knight]);
  const release = b.crowd.claim({ owners: [knight], bodies: () => knight.mover.room() });

  // Avanza el juego hasta que se cumple `promise` (o hasta `limit` fotogramas), midiendo cada fotograma.
  async function run(promise, limit = 3000) {
    let done = false;
    let error = null;
    promise.then(() => { done = true; }, (err) => { done = true; error = err; });
    let frames = 0;
    while (!done && frames < limit) {
      await b.advance(1 / 60);
      m.muestra();
      frames++;
    }
    if (error) throw error;
    return frames;
  }
  const p = knight.piece;
  const state = () => ({
    aCaballo: p.mounted,
    jinete: [round(p.rider.figure.position.x), round(p.rider.figure.position.y), round(p.rider.figure.position.z)],
    caballo: { visible: p.horse.object.visible, x: round(p.horse.figure.position.x), z: round(p.horse.figure.position.z) },
    espada: p.rider.props.sword.visible,
    lanza: { padre: p.rider.props.spear.parent.name, visible: p.rider.props.spear.visible },
    peana: p.pedestal.visible,
  });
  const center = b.board.squareToWorld('d4');
  const spot = { x: center.x, z: center.z - 0.3 };
  const out = {};
  out.desmontar = { frames: await run(knight.mover.dismount({ at: spot, facing: Math.PI, mode: 'dismount' })), ...state() };
  out.montar = { frames: await run(knight.mover.mount('d4')), ...state(), sentado: riderInHorse(p) };
  out.tirado = { frames: await run(knight.mover.dismount({ at: spot, facing: Math.PI, mode: 'thrown' })), ...state() };
  out.huida = { frames: await run(knight.mover.horseLeaving ?? Promise.resolve()), ...state() };
  out.vuelve = { frames: await run(knight.mover.mount('d4')), ...state(), sentado: riderInHorse(p) };
  release();
  await run(b.crowd.settle(), 600);
  return JSON.stringify({ ...out, ...m.peor, ...final(b, camara) });
}
```

Recargar la vista previa, lanzarla en segundo plano en la consola (`import('/raw/tmp/verificar-desmontar.js').then((m) => m.desmontar()).then((r) => { window.__r = r; })`) y consultar como en la tarea 7, paso 4.

Expected (con el blanco mirando a -Z, «detrás» es +Z):
- `desmontar`: `aCaballo: false`; `jinete` ≈ `[-0.5, 0, 0.2]`; `caballo` visible en `x` -0,5 y `z` ≈ 1,1; `espada: true`; `lanza` con `padre: "pieza"` y visible; `peana: false`;
- `montar`: `aCaballo: true`, `peana: true`, `espada: false`, `lanza` con `padre: "R_Hand"` y visible, y `sentado.dentro` ≤ 0,05;
- `tirado`: `aCaballo: false`, `jinete` ≈ `[-0.5, 0, 0.2]` y `lanza.visible: false`; `huida`: `caballo.visible: false`;
- `vuelve`: como `montar`;
- `hueco` ≥ 0,029, `apartado` ≤ 0,45, `fuera` vacío, `piezas` 24, `camara` 0 y ningún error en la consola.

- [ ] **Paso 6: Mirarlo**

En Chrome, con el reloj congelado en los momentos clave (`b.clock.tick = (dt) => (v.congelado ? 0 : tick(dt))`, como en las capturas de la torre), capturas de:
- el jinete saltando de la silla a un lado y la lanza clavada junto a él;
- el caballo retrocediendo;
- el jinete sentado en el suelo con estrellitas y la lanza por los aires;
- el caballo huyendo por el borde y volviendo de un salto;
- el jinete montando de un salto.

Si el jinete sentado en el suelo se hunde o flota, ajustar `SIT_HEIGHT`; si al montar no cae en la silla, revisar `riderOffset` (tarea 9, paso 6).

- [ ] **Paso 7: Commit**

```bash
git add src/moves/knight-mover.js
git commit -m "El caballero desmonta, cae del caballo y vuelve a montar" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 11: Trozos que salen volando y bocadillos de cómic

**Files:**
- Create: `src/pieces/limbs.js`, `src/ui/bubble.js`, `raw/tmp/prueba-trozos.js` (no se publica)
- Modify: `src/ui/style.css`, `src/main.js`

**Interfaces:**
- Consumes: `descendantsOf`, `trianglesOfBones` (tarea 6); `rockStep` (`fx/rock.js`); `scaleBone` (tarea 8).
- Produces:
  - `cutLimb(object, boneName) → THREE.Mesh | null`: copia rígida, en el mundo y con el origen en su centro, de lo que mueve ese hueso;
  - `createDebris(scene) → { throwPiece(object, { velocity: {x, y, z}, obstacles }), update(dt), bodies() → cuerpos, clear({ seconds }), count }`;
  - `createBubbles({ camera, canvas, clock }) → { say(text, anchor, { seconds = 1.5, shout = false, lift = 0.25 }) → Promise, update(), clear() }`;
  - en `window.bchess`: `debris` y `bubbles`, que `main.js` actualiza en cada fotograma.

- [ ] **Paso 1: Trozos**

`src/pieces/limbs.js`:

```js
import * as THREE from 'three';
import { descendantsOf, trianglesOfBones } from './skin.js';
import { rockStep } from '../fx/rock.js';

// Trozos de armadura que salen volando (diseño, sección 7). Al cortar un brazo o una pierna, sale una
// copia rígida de los triángulos que mueve ese hueso y lo que cuelga de él, sacada de la propia malla en
// su postura de ahora, y el hueso encoge hasta desaparecer (`scaleBone`). Los trozos caen, rebotan en el
// tablero y en las piezas (`rockStep`), piden sitio mientras están en el tablero y desaparecen
// encogiendo cuando se pide.

const FADE_SECONDS = 0.5;
const SPIN = 7; // radianes por segundo que gira un trozo en el aire
const REST_RADIUS = 0.08; // altura a la que se queda en el suelo el centro de un trozo

// Copia rígida, en coordenadas del mundo, de los triángulos de las mallas con esqueleto de `object` que
// mueve el hueso `boneName` o lo que cuelga de él. Devuelve un Mesh con el origen en su centro, o null.
export function cutLimb(object, boneName) {
  object.updateMatrixWorld(true);
  const positions = [];
  const uvs = [];
  let material = null;
  const v = new THREE.Vector3();
  object.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const { bones } = mesh.skeleton;
    const root = bones.findIndex((bone) => bone.name === boneName);
    if (root < 0) return;
    const { geometry } = mesh;
    const triangles = trianglesOfBones({
      index: geometry.index ? geometry.index.array : null,
      count: geometry.attributes.position.count,
      skinIndex: geometry.attributes.skinIndex.array,
      skinWeight: geometry.attributes.skinWeight.array,
      bones: descendantsOf(bones.map((bone) => bones.indexOf(bone.parent)), root),
    });
    const uv = geometry.attributes.uv;
    for (const i of triangles) {
      mesh.getVertexPosition(i, v);
      v.applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
    }
    if (triangles.length) material ??= mesh.material;
  });
  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (uvs.length === (positions.length / 3) * 2) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const center = geometry.boundingSphere.center.clone();
  geometry.translate(-center.x, -center.y, -center.z);
  const chunk = new THREE.Mesh(geometry, material.clone());
  chunk.name = `trozo-${boneName}`;
  chunk.position.copy(center);
  chunk.castShadow = true;
  return chunk;
}

// Trozos sueltos por el tablero. `throwPiece` suelta un objeto (un trozo de `cutLimb`, la espada, el
// escudo…) con una velocidad; rebota en las piezas de `obstacles()` ({ x, z, radius, height }) y se queda
// en el suelo hasta `clear()`.
export function createDebris(scene) {
  const items = [];

  function throwPiece(object, { velocity, obstacles = () => [] }) {
    scene.attach(object); // conserva su sitio en el mundo aunque colgara de una mano
    items.push({
      object,
      obstacles,
      scale: object.scale.clone(),
      fade: null,
      spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      body: {
        position: { x: object.position.x, y: Math.max(object.position.y, REST_RADIUS), z: object.position.z },
        velocity: { ...velocity },
        radius: REST_RADIUS,
        bounces: 0,
        resting: false,
      },
    });
  }

  function update(dt) {
    const lists = new Map(); // cada lista de obstáculos se pide una vez por fotograma
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item.body.resting) {
        if (!lists.has(item.obstacles)) lists.set(item.obstacles, item.obstacles());
        rockStep(item.body, dt, lists.get(item.obstacles));
        item.object.rotateOnWorldAxis(item.spin, SPIN * dt);
      }
      const { position } = item.body;
      item.object.position.set(position.x, position.y, position.z);
      if (!item.fade) continue;
      item.fade.age += dt;
      const k = Math.min(1, item.fade.age / item.fade.seconds);
      item.object.scale.copy(item.scale).multiplyScalar(Math.max(0.001, 1 - k));
      if (k >= 1) {
        scene.remove(item.object);
        items.splice(i, 1);
      }
    }
  }

  // Con lo que piden sitio los trozos que siguen en el tablero: su caja vista desde arriba, como un tramo a
  // lo largo de su lado largo (una lanza tirada no es un círculo de su largo).
  function bodies() {
    const box = new THREE.Box3();
    return items.map(({ object }) => {
      box.setFromObject(object);
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      const width = box.max.x - box.min.x;
      const depth = box.max.z - box.min.z;
      const radius = Math.max(0.04, Math.min(width, depth) / 2);
      const half = Math.max(0, Math.max(width, depth) / 2 - radius);
      return width >= depth
        ? { from: { x: cx - half, z: cz }, to: { x: cx + half, z: cz }, radius }
        : { from: { x: cx, z: cz - half }, to: { x: cx, z: cz + half }, radius };
    });
  }

  // Todos los trozos encogen hasta desaparecer en `seconds`.
  function clear({ seconds = FADE_SECONDS } = {}) {
    for (const item of items) item.fade ??= { age: 0, seconds };
  }

  return {
    throwPiece,
    update,
    bodies,
    clear,
    get count() {
      return items.length;
    },
  };
}
```

- [ ] **Paso 2: Bocadillos**

`src/ui/bubble.js`:

```js
import * as THREE from 'three';

// Bocadillos de cómic sobre la escena (diseño, sección 7): un globo con texto que sigue a un punto de la
// escena mientras dura, con el tiempo de juego. Con `shout`, una onomatopeya grande y amarilla
// («¡CLANC!»). Son elementos del HUD, por encima del lienzo.

export function createBubbles({ camera, canvas, clock }) {
  const layer = document.getElementById('hud');
  const live = [];
  const point = new THREE.Vector3();

  function place({ element, anchor, lift }) {
    if (typeof anchor === 'function') point.copy(anchor());
    else anchor.getWorldPosition(point);
    point.y += lift;
    point.project(camera);
    const rect = canvas.getBoundingClientRect();
    element.hidden = point.z > 1; // detrás de la cámara
    element.style.left = `${rect.left + ((point.x + 1) / 2) * rect.width}px`;
    element.style.top = `${rect.top + ((1 - point.y) / 2) * rect.height}px`;
  }

  // Muestra `text` sobre `anchor` (un objeto de la escena o una función que devuelve un Vector3),
  // `lift` casillas más arriba, durante `seconds` de juego. Se resuelve al quitarse.
  function say(text, anchor, { seconds = 1.5, shout = false, lift = 0.25 } = {}) {
    const element = document.createElement('div');
    element.className = shout ? 'onomatopeya' : 'bocadillo';
    element.textContent = text;
    layer.append(element);
    const item = { element, anchor, lift };
    live.push(item);
    place(item);
    return clock.wait(seconds).then(() => {
      element.remove();
      const index = live.indexOf(item);
      if (index >= 0) live.splice(index, 1);
    });
  }

  // Cada fotograma, después de mover la cámara: los globos siguen a su punto.
  function update() {
    for (const item of live) place(item);
  }

  // Quita todos los globos (errores).
  function clear() {
    for (const item of live.splice(0)) item.element.remove();
  }

  return { say, update, clear };
}
```

Al final de `src/ui/style.css`, antes de `@media (max-width: 520px) {`:

```css
.bocadillo, .onomatopeya {
  position: absolute;
  transform: translate(-50%, -100%);
  pointer-events: none;
  white-space: nowrap;
}
.bocadillo {
  margin-top: -14px;
  padding: 8px 12px;
  border: 2px solid #1a120b;
  border-radius: 16px;
  background: #fffdf5;
  color: #1a120b;
  font: 700 16px/1.2 "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif;
}
.bocadillo::after {
  content: "";
  position: absolute;
  left: calc(50% - 7px);
  bottom: -8px;
  width: 12px;
  height: 12px;
  border-right: 2px solid #1a120b;
  border-bottom: 2px solid #1a120b;
  background: #fffdf5;
  transform: rotate(45deg);
}
.onomatopeya {
  color: #ffd93b;
  font: 900 30px/1 Impact, "Arial Black", system-ui, sans-serif;
  letter-spacing: 1px;
  text-shadow: 3px 3px 0 #7a2a00, -1px -1px 0 #7a2a00;
  transform: translate(-50%, -100%) rotate(-6deg);
  animation: onomatopeya 0.35s ease-out;
}
@keyframes onomatopeya {
  from { transform: translate(-50%, -100%) scale(0.3) rotate(-14deg); }
  to { transform: translate(-50%, -100%) rotate(-6deg); }
}
```

- [ ] **Paso 3: Conectar en `main.js`**

Sustituir `import { createRubble } from './fx/rubble.js';` por:

```js
import { createRubble } from './fx/rubble.js';
import { createDebris } from './pieces/limbs.js';
import { createBubbles } from './ui/bubble.js';
```

Sustituir `  const rubble = createRubble(stage.scene);` por:

```js
  const rubble = createRubble(stage.scene);
  const debris = createDebris(stage.scene);
  const bubbles = createBubbles({ camera: stage.camera, canvas: stage.renderer.domElement, clock });
```

Sustituir:

```js
    rubble.update(step);
    fx.update(step);
```

por:

```js
    rubble.update(step);
    debris.update(step);
    fx.update(step);
```

Sustituir `    cinema.update(dt);` (dentro de `frame`) por:

```js
    cinema.update(dt);
    bubbles.update();
```

Y en `window.bchess`, sustituir `tap: handleTap, capture, crowd, rubble,` por `tap: handleTap, capture, crowd, rubble, debris, bubbles,`.

Run: `cd ~/bchess && node --check src/pieces/limbs.js && node --check src/ui/bubble.js && node --check src/main.js && npm test`
Expected: sin mensajes de sintaxis y todas las pruebas pasan.

- [ ] **Paso 4: Comprobación en el navegador**

`raw/tmp/prueba-trozos.js`:

```js
// Prueba de desarrollo (raw/ no se publica) de los trozos y los bocadillos: a un peón blanco de prueba en
// e4 se le corta el brazo derecho, el trozo y su lanza salen volando y rebotan, y un bocadillo lo sigue.
import * as THREE from '/vendor/three/build/three.module.js';
import { loadManifest, loadPieceKit, spawnPiece } from '/src/pieces/piece.js';
import { cutLimb } from '/src/pieces/limbs.js';

export async function probar() {
  const b = window.bchess;
  b.gesture.at = Infinity;
  const manifest = await loadManifest();
  const kit = await loadPieceKit(manifest.pieces['white-pawn'], b.quality);
  const piece = spawnPiece(kit);
  b.stage.scene.add(piece.object);
  piece.placeAt(b.board.squareToWorld('e4'));
  piece.face(Math.PI);
  piece.play('idle', { fade: 0 });
  for (let i = 0; i < 3; i++) piece.update(1 / 60);

  const out = {};
  const t0 = performance.now();
  const chunk = cutLimb(piece.object, 'R_Upperarm');
  out.corte = { ms: Math.round(performance.now() - t0), triangulos: chunk ? chunk.geometry.attributes.position.count / 3 : 0 };
  const obstacles = () => b.crowd.obstacles();
  b.debris.throwPiece(chunk, { velocity: { x: 1.2, y: 2.5, z: 0.4 }, obstacles });
  b.debris.throwPiece(piece.props.spear, { velocity: { x: 1, y: 3, z: -0.3 }, obstacles });
  piece.scaleBone('R_Upperarm', 0.001);
  let removed = false;
  b.bubbles.say('¡Solo es un rasguño!', piece.object.getObjectByName('Head'), { seconds: 1.5 }).then(() => { removed = true; });
  const bubble = document.querySelector('.bocadillo');
  for (let i = 0; i < 60; i++) {
    await b.advance(1 / 60);
    piece.update(1 / 60);
  }
  out.bocadillo = { texto: bubble?.textContent, left: bubble?.style.left, top: bubble?.style.top, quitado: removed };
  await b.advance(1.5);
  out.trozos = { cuantos: b.debris.count, sitio: b.debris.bodies().map((body) => +body.radius.toFixed(2)), bocadilloQuitado: removed };
  out.manoEncogida = +piece.object.getObjectByName('R_Hand').getWorldPosition(new THREE.Vector3()).distanceTo(piece.object.getObjectByName('R_Upperarm').getWorldPosition(new THREE.Vector3())).toFixed(3);
  b.debris.clear({ seconds: 0.3 });
  await b.advance(0.5);
  out.alLimpiar = b.debris.count;
  b.stage.scene.remove(piece.object);
  return JSON.stringify(out);
}
```

Recargar la vista previa y, en su consola:

```js
const m = await import('/raw/tmp/prueba-trozos.js?v=' + Date.now());
await m.probar();
```

Expected (medido con estos módulos antes de escribir el plan): `corte.triangulos` en los miles y `ms` por debajo de 50; el bocadillo con su texto y `left`/`top` en píxeles, sin quitar al segundo y quitado a los 2,5 s; `trozos.cuantos: 2`, con un `radius` pequeño cada uno (la lanza, un tramo fino y no un círculo de su largo); `manoEncogida: 0`; `alLimpiar: 0`; ningún error en la consola. Una captura durante el vuelo: el brazo sale entero, con su textura, y el peón se queda sin él.

- [ ] **Paso 5: Commit**

```bash
git add src/pieces/limbs.js src/ui/bubble.js src/ui/style.css src/main.js
git commit -m "Trozos de armadura que salen volando y bocadillos de cómic" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 12: El director de batallas y lo que comparten

**Files:**
- Create: `src/combat/knight/common.js`, `src/combat/knight/battle.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: de la tarea 7, `stanceOf`, `overlapOf`, `punchDistance`, `slowToImpact` y `afterImpact`; de la
  tarea 9, la pieza (`rider`, `horse`, `body`, `height`) y su mover; de la tarea 10, `dismount`, `walkTo`,
  `defeated`, `horseFlee` y `mount`; de la tarea 11, `debris` y `bubbles`; `roomClearance` (`room.js`);
  `fx.koStars`.
- Produces:
  - de `common.js`: `KO_SECONDS`, `COMBAT_RAISE`, `PAWN_BODY`, `BODY_GAP`, `fighterOf(entry)`,
    `postOf(entry, at, facing, parts?)`, `facingTo(from, to)`, `bladeStrikes(fighter, { thrust? }) → key[]`,
    `kickOf(fighter) → key | null`, `bladeBody(blade)`, `swordTip(fighter)`, `bonePosition(fighter, name)`,
    `dismountMode(random)`, `shout(bubbles, text, anchor)`, `windUp({ clock, fighter, key }) → acción en pausa`,
    `topple({ clock, figure, forward?, seconds? })`, `lyingBody({ at, angle, length, radius? })`,
    `fallDirection({ at, around, spread, length, rival, overlap }) → ángulo`,
    `knockOut({ clock, fx, fighter, seconds? })` y `celebrate(entry)`;
  - de `battle.js`: `canKnightBattle(attacker, defender) → boolean` y `runKnightBattle({ attacker, defender,
    board, clock, fx, cinema, hud, crowd, dust, debris, bubbles, obstacles, random }) → Promise`. Cada batalla
    de las tareas 13 a 17 es un objeto `{ matches(attacker, defender), can(attacker, defender), run(escena) }`
    que se añade a la lista `BATTLES` de este fichero.

- [ ] **Paso 1: `common.js`**

`src/combat/knight/common.js`:

```js
import * as THREE from 'three';
import { roomClearance } from '../../moves/room.js';

// Lo que comparten las batallas del caballero (diseño en docs/superpowers/specs/
// 2026-09-15-bchess-caballero-design.md, sección 7).

export const KO_SECONDS = 1;
export const COMBAT_RAISE = 0.3; // como en el duelo: la lanza del peón, algo subida en la mano
export const PAWN_BODY = 0.25; // del centro de un peón, ya sin peana, a su costado
export const BODY_GAP = 0.05; // hueco entre los cuerpos de los dos luchadores
const TOPPLE_SECONDS = 0.45;
const SHOUT_SECONDS = 0.8;
const WIND_UP = 0.45; // parte del camino hasta el golpe en la que se queda con el arma en alto

// La pieza con esqueleto que pelea: el peón, el jinete del caballero o el gigante de la torre.
export function fighterOf(entry) {
  if (entry.kind === 'knight') return entry.piece.rider;
  if (entry.kind === 'rook') return entry.piece.giant;
  return entry.piece;
}

// Puesto de un caballero o una torre para pedir sitio (`fight.js`): su luchador en `at`, mirando a
// `facing`, con las partes de lo que hará allí.
export function postOf(entry, at, facing, parts = []) {
  const { body } = entry.piece;
  return { entry, fans: body.fans, margin: body.margin, at, facing, parts };
}

// Hacia dónde mira quien está en `from` para ver `to` ({x, z}).
export const facingTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

// Claves de los golpes con espada de un luchador (con la punta de la espada medida). Con `thrust`, solo
// las estocadas (true) o solo los tajos (false).
export function bladeStrikes(fighter, { thrust } = {}) {
  return fighter.attacks
    .filter((attack) => fighter.strikes[attack.key]?.blade && (thrust === undefined || Boolean(attack.thrust) === thrust))
    .map((attack) => attack.key);
}

// Clave del ataque con el pie que más alcanza, o null.
export function kickOf(fighter) {
  let best = null;
  for (const { key } of fighter.attacks) {
    const body = fighter.strikes[key]?.body;
    if (body?.bone.includes('Toe') && (!best || body.reach > fighter.strikes[best].body.reach)) best = key;
  }
  return best;
}

// La punta de la espada como la cara de un golpe, para `punchDistance`: un solo rayo, por la punta.
export function bladeBody(blade) {
  return { reach: blade.reach, side: blade.side, height: blade.height, faces: [{ dx: 0, dy: 0, face: blade.reach }] };
}

// Dónde está ahora la punta de la espada de un luchador.
export function swordTip(fighter) {
  return fighter.props.sword.localToWorld(new THREE.Vector3(0, fighter.swordEnds.top, 0));
}

// Dónde está ahora un hueso.
export function bonePosition(fighter, name) {
  return fighter.object.getObjectByName(name).getWorldPosition(new THREE.Vector3());
}

// Al azar y con la misma probabilidad: desmonta o su caballo lo tira.
export function dismountMode(random) {
  return random() < 0.5 ? 'dismount' : 'thrown';
}

// Onomatopeya de cómic («¡CLANC!») sobre `anchor` (un objeto de la escena o un punto).
export function shout(bubbles, text, anchor) {
  const point = anchor.isVector3 ? anchor.clone() : null;
  return bubbles.say(text, point ? () => point : anchor, { seconds: SHOUT_SECONDS, shout: true, lift: 0.3 });
}

// Empieza el golpe `key` y lo deja con el arma en alto, a WIND_UP del momento del golpe. Devuelve la
// acción, en pausa.
export async function windUp({ clock, fighter, key }) {
  const measure = fighter.strikes[key];
  const action = fighter.play('attack', { loop: false, fade: 0.15, clip: key });
  await clock.wait((measure.blade ?? measure.body).t * WIND_UP);
  if (action) action.paused = true;
  return action;
}

// Cae rígido como un tablón, girando sobre sus pies: de bruces (`forward`) o de espaldas, hacia donde
// mira la figura.
export async function topple({ clock, figure, forward = true, seconds = TOPPLE_SECONDS }) {
  figure.rotation.order = 'YXZ';
  const start = figure.rotation.x;
  const end = forward ? Math.PI / 2 : -Math.PI / 2;
  await clock.tween(seconds, (t) => {
    figure.rotation.x = start + (end - start) * t * t;
  });
}

// Cuerpo tendido en el suelo, para pedir sitio: de los pies (`at`) a la cabeza, hacia `angle`. El `length`
// que le pasan las batallas es el `height` del luchador, que en un peón incluye su peana: así pide un palmo
// de más, que es el lado seguro (pedir de menos dejaría a alguien encima del caído).
export function lyingBody({ at, angle, length, radius = 0.25 }) {
  return { from: { x: at.x, z: at.z }, to: { x: at.x + Math.sin(angle) * length, z: at.z + Math.cos(angle) * length }, radius };
}

// Hacia dónde cae un luchador tendido de `length` desde `at`: de `around` + `spread`, `around` - `spread`
// y `around`, la que deja más hueco a las piezas de alrededor (`overlap(body)`) sin caer sobre el rival
// (`rival`: { x, z, radius }).
export function fallDirection({ at, around, spread, length, rival, overlap }) {
  let best = null;
  for (const angle of [around + spread, around - spread, around]) {
    const body = lyingBody({ at, angle, length });
    if (rival && roomClearance(rival.x, rival.z, rival.radius, [body]) < 0) continue;
    const missing = overlap(body);
    if (!best || missing < best.missing - 1e-6) best = { angle, missing };
  }
  return best?.angle ?? around + spread;
}

// Estrellitas sobre la cabeza durante `seconds`.
export async function knockOut({ clock, fx, fighter, seconds = KO_SECONDS }) {
  fx.koStars(fighter.object.getObjectByName('Head') ?? fighter.figure, { seconds });
  await clock.wait(seconds);
}

// Celebra la victoria: su animación o, si no la tiene, unos saltitos.
export async function celebrate(entry) {
  const fighter = fighterOf(entry);
  if (fighter.has('victory')) {
    await fighter.playOnce('victory');
    fighter.play('idle', { fade: 0.3 });
  } else if (entry.mover.hop) {
    await entry.mover.hop(2);
  }
}
```

- [ ] **Paso 2: `battle.js`**

La lista `BATTLES` empieza vacía: cada tarea de la 13 a la 17 añade su batalla (import arriba y entrada en la
lista). Con la lista vacía, `canKnightBattle` devuelve false y las capturas del caballero salen como las
capturas sin combate, que es justo lo que pide el diseño cuando falta una batalla.

`src/combat/knight/battle.js`:

```js
// Batallas del caballero (diseño en docs/superpowers/specs/2026-09-15-bchess-caballero-design.md,
// sección 7): cada captura en la que participa un caballero es un gag, con su fichero. Aquí se elige cuál
// toca y se prepara lo que comparten: el sitio que piden los luchadores (sus abanicos, los cuerpos
// tendidos y los trozos que salen volando) y la limpieza al terminar, pase lo que pase.

const SETTLE_LIMIT = 4; // segundos de juego que se espera, como mucho, a que vuelvan las piezas
const BATTLES = []; // una batalla por fichero; las tareas 13 a 17 las van añadiendo

const battleFor = (attacker, defender) => BATTLES.find((battle) => battle.matches(attacker, defender)) ?? null;

export function canKnightBattle(attacker, defender) {
  const battle = battleFor(attacker, defender);
  return Boolean(battle?.can(attacker, defender));
}

// `obstacles` son los centros {x, z} de las demás piezas, para que la cámara no quede tapada.
export async function runKnightBattle({ attacker, defender, board, clock, fx, cinema, hud, crowd, dust, debris, bubbles, obstacles = [], random = Math.random }) {
  const stances = new Map(); // luchador → abanico de lo que hará en su puesto (`stanceOf`)
  const bodies = []; // cuerpos tendidos en el suelo
  const release = crowd.claim({
    owners: [attacker, defender],
    bodies: () => [
      ...[attacker, defender].flatMap((entry) => entry.mover.room?.({ stance: stances.get(entry) }) ?? []),
      ...bodies,
      ...debris.bodies(),
    ],
  });
  try {
    await battleFor(attacker, defender).run({
      attacker, defender, board, clock, fx, cinema, hud, crowd, dust, debris, bubbles, obstacles, random, stances, bodies,
      target: defender.mover.square,
      home: board.squareToWorld(attacker.mover.square),
      center: board.squareToWorld(defender.mover.square),
    });
  } finally {
    release();
    debris.clear();
    bubbles.clear();
  }
  await Promise.race([crowd.settle(), clock.wait(SETTLE_LIMIT)]);
}
```

- [ ] **Paso 3: Conectar en `main.js`**

En `src/main.js`, después de la línea de `smash.js`, añadir el import:

```js
import { canSmash, runSmash } from './combat/smash.js';
import { canKnightBattle, runKnightBattle } from './combat/knight/battle.js';
```

Y en `capture`, delante de la rama de la torre (las batallas del caballero mandan sobre la captura corta
cuando participan los dos), sustituir:

```js
      } else if (canSmash(attacker, defender)) {
        await runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles });
      } else {
```

por:

```js
      } else if (canKnightBattle(attacker, defender)) {
        await runKnightBattle({ attacker, defender, board, clock, fx, cinema, hud, crowd, dust, debris, bubbles, obstacles });
      } else if (canSmash(attacker, defender)) {
        await runSmash({ attacker, defender, board, clock, fx, cinema, hud, crowd, obstacles });
      } else {
```

`dust` y `crowd` ya están declarados en `main.js`; `debris` y `bubbles` llegan en la tarea 11.

- [ ] **Paso 4: Sintaxis y pruebas**

Run: `cd ~/bchess && node --check src/combat/knight/common.js && node --check src/combat/knight/battle.js && node --check src/main.js && npm test`

Expected: sin errores y las pruebas en verde (siguen siendo las de siempre: estos módulos usan three y no
se prueban en Node).

En la vista previa, con la lista vacía: un caballero que se come a un peón hace la captura sin combate de
siempre, sin errores en la consola.

- [ ] **Paso 5: Commit**

```bash
git add src/combat/knight/common.js src/combat/knight/battle.js src/main.js
git commit -m "Director de las batallas del caballero" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 13: Batalla 1 — el peón le da la patada al caballero

**Files:**
- Create: `src/combat/knight/pawn-kicks-knight.js`, `raw/tmp/verificar-batalla.js` (no se publica)
- Modify: `src/combat/knight/battle.js`

**Interfaces:**
- Consumes: de la tarea 7, `afterImpact`, `punchDistance`, `slowToImpact` y `stanceOf`; `strikeSpot` (`plan.js`);
  de la tarea 12, todo lo de `common.js`; de la tarea 10, `dismount`, `descend`, `walkTo`, `turnTo`,
  `defeated` y `walkOnto`; de la tarea 11, `debris.throwPiece`.
- Produces: `pawnKicksKnight`, con `matches` (peón contra caballero), `can` (el peón tiene patada y el
  caballero, tajo) y `run`; y, en `raw/tmp/verificar-batalla.js`, `pelear(nombre)`, que prepara la posición,
  lanza la captura y mide el golpe, la caída y la limpieza.

- [ ] **Paso 1: La batalla**

`src/combat/knight/pawn-kicks-knight.js`:

```js
import * as THREE from 'three';
import { afterImpact, punchDistance, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot } from '../plan.js';
import {
  BODY_GAP, COMBAT_RAISE, PAWN_BODY, bladeStrikes, bonePosition, celebrate, dismountMode, facingTo, fallDirection, kickOf, knockOut,
  lyingBody, postOf, shout, topple, windUp,
} from './common.js';

// Peón come caballero: patada en la entrepierna (diseño, sección 7). El caballero desmonta o su caballo lo
// tira, y se pone en guardia. El peón baja de su peana y se acerca, y el caballero levanta la espada. A
// cámara lenta, el peón le da la patada: suena a metal, al caballero se le juntan las rodillas, suelta la
// espada y cae de bruces, hacia un lado para no aplastar al peón, con estrellitas. Desaparece en polvo, su
// caballo huye si seguía allí y el peón ocupa la casilla y lo celebra.

const KNEES = 25; // grados que se juntan las rodillas
const KNEES_SECONDS = 0.15;
const FALL_SPREAD = Math.PI / 3; // de bruces, hacia un lado de donde está el peón
const DUST_Y = 0.05;

export const pawnKicksKnight = {
  matches: (attacker, defender) => attacker.kind === 'pawn' && defender.kind === 'knight',
  can: (attacker, defender) => Boolean(kickOf(attacker.piece)) && bladeStrikes(defender.piece.rider).length > 0,

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const pawn = attacker.piece;
    const knight = defender.piece;
    const { rider } = knight;
    const kick = kickOf(pawn);
    const slash = bladeStrikes(rider, { thrust: false })[0] ?? bladeStrikes(rider)[0];
    const facing = facingTo(center, home);
    pawn.setSpearDefault('upright');
    pawn.setGripSlide(-COMBAT_RAISE);
    stances.set(defender, stanceOf(postOf(defender, center, facing, [{ action: 'attack', key: slash }])));

    // 1. La cámara encuadra; el caballero desmonta (o su caballo lo tira) y se pone en guardia.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      attacker.mover.turnTo(facingTo(home, center), 0.3),
      defender.mover.dismount({ at: center, facing, mode: dismountMode(random) }),
    ]);

    // 2. El peón baja de su peana y se acerca hasta donde su patada llega; el caballero levanta la espada.
    const distance = Math.max(
      knight.body.torso + PAWN_BODY + BODY_GAP,
      punchDistance({ body: pawn.strikes[kick].body, from: home, center, target: rider, torso: knight.body.torso }),
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    await attacker.mover.descend(home);
    await attacker.mover.walkTo(spots.attacker);
    await attacker.mover.turnTo(spots.attackerFacing, 0.2);
    const swing = await windUp({ clock, fighter: rider, key: slash });

    // 3. La patada, a cámara lenta: suena a metal, se le juntan las rodillas, suelta la espada y cae de
    //    bruces a un lado.
    const kicking = pawn.playOnce('attack', { clip: kick, fade: 0.15 });
    await slowToImpact(clock, pawn.strikes[kick].body.t);
    const toe = bonePosition(pawn, pawn.strikes[kick].body.bone);
    fx.burst(toe, { size: 1, sparks: 24 });
    hud.flash();
    cinema.shake(0.15);
    shout(bubbles, '¡CLONC!', toe);
    if (swing) swing.paused = false;
    rider.play('idle', { fade: 0.2 });
    const knees = clock.tween(KNEES_SECONDS, (t) => {
      rider.turnBone('L_Thigh', { z: -KNEES * t });
      rider.turnBone('R_Thigh', { z: KNEES * t });
    });
    if (rider.props.sword?.visible) {
      debris.throwPiece(rider.props.sword, {
        velocity: { x: Math.cos(facing) * 0.6, y: 1.8, z: -Math.sin(facing) * 0.6 },
        obstacles: () => crowd.obstacles([attacker, defender]),
      });
    }
    await Promise.all([afterImpact(clock), knees]);
    const angle = fallDirection({
      at: center,
      around: facing,
      spread: FALL_SPREAD,
      length: rider.height,
      rival: { x: spots.attacker.x, z: spots.attacker.z, radius: PAWN_BODY },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    stances.delete(defender);
    bodies.push(lyingBody({ at: center, angle, length: rider.height }));
    await defender.mover.turnTo(angle, 0.12);
    await topple({ clock, figure: rider.figure, forward: true });
    const head = bonePosition(rider, 'Head');
    dust.puff(new THREE.Vector3(head.x, DUST_Y, head.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.1);
    await kicking;
    pawn.play('idle', { fade: 0.3 });
    await knockOut({ clock, fx, fighter: rider });

    // 4. Desaparece en polvo, su caballo huye si seguía allí y el peón ocupa la casilla y lo celebra.
    debris.clear();
    await defender.mover.defeated({ avoid: center });
    bodies.length = 0;
    pawn.setSpearDefault(null);
    pawn.setGripSlide(0);
    await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
    await celebrate(attacker);
  },
};
```

- [ ] **Paso 2: Apuntarla en el director**

En `src/combat/knight/battle.js`, añadir arriba el import y meterla en la lista:

```js
import { pawnKicksKnight } from './pawn-kicks-knight.js';
```

```js
const BATTLES = [pawnKicksKnight]; // una batalla por fichero; las tareas 14 a 17 las van añadiendo
```

- [ ] **Paso 3: El módulo de comprobación**

`raw/tmp/verificar-batalla.js` (no se publica; las tareas siguientes le añaden preparaciones):

```js
// Comprobación por código de las batallas del caballero (solo desarrollo; raw/ no se publica).
// Prepara la posición, lanza la captura y mide: lo que se hunde el golpe en el rival, dónde acaba el
// vencido, si queda algún trozo o bocadillo por el tablero y si la cámara y los controles vuelven.
import * as THREE from 'three';
import { final, listo, medidor } from './verificar-torre.js';

const PREPARACIONES = {
  // El peón blanco, llevado a d4, se come al caballero negro, llevado a e5; alrededor, peones en e4 y d5.
  'peon-come-caballero': (at) => {
    at('d2').mover.placeOn('d4');
    at('g8').mover.placeOn('e5');
    at('e2').mover.placeOn('e4');
    at('d7').mover.placeOn('d5');
    return ['d4', 'e5'];
  },
};

const CADA = 5; // tras el impacto, se mide uno de cada CADA fotogramas
const FOTOGRAMAS = 120;

// Mallas con esqueleto de una pieza (sin peana, escudo, lanza ni zona de toque).
function mallasDe(pieza) {
  const mallas = [];
  pieza.object.updateMatrixWorld(true);
  pieza.object.traverse((o) => { if (o.isSkinnedMesh) mallas.push(o); });
  for (const malla of mallas) malla.computeBoundingSphere();
  return mallas;
}

// Distancia de `desde` a la superficie de `mallas` en la dirección `eje`: negativa si ya está dentro.
function hastaSuperficie(desde, eje, mallas) {
  const atras = 0.8;
  const toque = new THREE.Raycaster(desde.clone().addScaledVector(eje, -atras), eje, 0, 3).intersectObjects(mallas, false)[0];
  return toque ? toque.distance - atras : null;
}

export async function pelear(nombre) {
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
    const pieza = p.kind === 'knight' ? p.piece.rider : (p.piece.giant ?? p.piece);
    const original = pieza.playOnce;
    pieza.playOnce = (action, opts = {}) => {
      acciones.push(`${p.kind}:${action}${opts.clip ? `:${opts.clip}` : ''}`);
      return original.call(pieza, action, opts);
    };
  }
  // Desde el destello del impacto, lo que se hunde el golpe en el rival.
  let tras = null;
  const golpes = [];
  const flash = b.hud.flash;
  b.hud.flash = (...args) => { tras = 0; return flash.apply(b.hud, args); };
  const rival = defensor.kind === 'knight' ? defensor.piece.rider : (defensor.piece.giant ?? defensor.piece);
  const luchador = atacante.kind === 'knight' ? atacante.piece.rider : (atacante.piece.giant ?? atacante.piece);
  function medirGolpe() {
    if (!rival.object.visible) return null;
    const punta = luchador.props.sword?.visible
      ? luchador.props.sword.localToWorld(new THREE.Vector3(0, luchador.swordEnds.top, 0))
      : null;
    const hueso = punta ?? luchador.object.getObjectByName(luchador.strikes[Object.keys(luchador.strikes)[0]].body.bone).getWorldPosition(new THREE.Vector3());
    const giro = luchador.figure.rotation.y;
    const eje = new THREE.Vector3(Math.sin(giro), 0, Math.cos(giro));
    const hasta2 = hastaSuperficie(hueso, eje, mallasDe(rival));
    return hasta2 === null ? null : -hasta2;
  }
  await b.tap({ owner: atacante });
  const captura = b.tap({ owner: defensor });
  let frames = 0;
  while (b.state.fighting && frames < 8000) {
    await b.advance(1 / 60);
    m.muestra();
    if (tras !== null && tras < FOTOGRAMAS) {
      if (tras % CADA === 0) golpes.push([tras, medirGolpe()]);
      tras++;
    }
    frames++;
  }
  await captura;
  await b.advance(2);
  b.hud.flash = flash;
  const medidas = golpes.filter(([, g]) => g !== null);
  const peor = medidas.reduce((a, c) => (!a || c[1] > a[1] ? c : a), null);
  const redondea = (x) => (x === null || x === undefined ? null : +x.toFixed(3));
  return JSON.stringify({
    nombre, frames, ...m.peor,
    hundidoAlGolpear: redondea(golpes[0]?.[1]), hundidoMaximo: redondea(peor?.[1]),
    acciones, ganador: atacante.mover.square,
    trozos: b.debris.count, bocadillos: document.querySelectorAll('.bocadillo').length,
    caballos: b.pieces.filter((p) => p.kind === 'knight').map((p) => p.piece.mounted),
    ...final(b, camara),
  });
}
```

- [ ] **Paso 4: Comprobarlo**

Recargar la vista previa y, en su consola:

```js
const m = await import('/raw/tmp/verificar-batalla.js?v=' + Date.now());
await m.pelear('peon-come-caballero');
```

Expected: `acciones` con `knight:attack` (el tajo que levanta), `pawn:attack` (la patada) y `pawn:victory`
o los saltitos; `hundidoAlGolpear` entre 0 y 0,06 (el pie toca la armadura sin atravesarla);
`hueco` ≥ 0 y `holgura` ≥ 0 (nadie se queda sin sitio, ni con el caballero tendido);
`trozos: 0` y `bocadillos: 0` al terminar; `caballos` sin el caballero vencido; `ganador: 'e5'`;
`camara: 0` y `controles: true`; ningún error en la consola. Mirarlo también con los ojos: la patada
suena con su «¡CLONC!», las rodillas se juntan, la espada sale volando y el caballero cae de bruces sin
pisar al peón.

- [ ] **Paso 5: Commit**

```bash
git add src/combat/knight/pawn-kicks-knight.js src/combat/knight/battle.js
git commit -m "Batalla: el peón le da la patada al caballero" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 14: Batalla 2 — el caballero atraviesa al peón con la espada

**Files:**
- Create: `src/combat/knight/knight-runs-through-pawn.js`
- Modify: `src/combat/knight/battle.js`, `raw/tmp/verificar-batalla.js`

**Interfaces:**
- Consumes: de la tarea 7, `afterImpact`, `punchDistance`, `slowToImpact` y `stanceOf`; `strikeSpot` y
  `usableStrikes` (`plan.js`); de la tarea 12, `bladeBody`, `bladeStrikes`, `bonePosition`, `celebrate`,
  `facingTo`, `fallDirection`, `knockOut`, `lyingBody`, `postOf`, `shout`, `swordTip` y `topple`; de la
  tarea 9, `leapTo`; de la tarea 10, `dismount` y `mount`; de la tarea 8, `turnBone` y `resetBones`.
- Produces: `knightRunsThroughPawn`, con `matches` (caballero contra peón), `can` (el jinete tiene estocada
  y el peón sabe caer) y `run`.

- [ ] **Paso 1: La batalla**

`src/combat/knight/knight-runs-through-pawn.js`:

```js
import * as THREE from 'three';
import { afterImpact, punchDistance, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot, usableStrikes } from '../plan.js';
import {
  BODY_GAP, COMBAT_RAISE, PAWN_BODY, bladeBody, bladeStrikes, bonePosition, celebrate, facingTo, fallDirection,
  knockOut, lyingBody, postOf, shout, swordTip, topple, windUp,
} from './common.js';

// Caballero come peón: lo atraviesa con la espada (diseño, sección 7). El caballero salta hasta el peón y
// desmonta; el peón le tira una estocada y él la para con el escudo, entre chispas. Le mete la espada por
// debajo del brazo hasta que la punta asoma por la espalda; el peón se queda tieso, se mira la hoja y, al
// sacarla, cae de espaldas con estrellitas. El caballero ocupa la casilla y vuelve a montar.

const THROUGH = 0.18; // lo que asoma la punta por la espalda del peón
const GUARD = 70; // grados que sube el brazo del escudo cuando no hay animación de parada
const GUARD_SECONDS = 0.25;
const STIFF_SECONDS = 0.9; // lo que se queda tieso mirándose la hoja
const HEAD_TURN = 30; // grados que baja la cabeza para mirársela
const PULL_SECONDS = 0.5; // lo que tarda en sacar la espada, andando hacia atrás
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

export const knightRunsThroughPawn = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'pawn',
  can: (attacker, defender) => bladeStrikes(attacker.piece.rider, { thrust: true }).length > 0
    && (defender.piece.has('defeat') || defender.piece.has('fall')),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const knight = attacker.piece;
    const { rider } = knight;
    const pawn = defender.piece;
    const thrust = bladeStrikes(rider, { thrust: true })[0];
    const measure = rider.strikes[thrust];
    const facing = facingTo(center, home); // el peón mira hacia el caballero

    // 1. La cámara encuadra, el peón baja de su peana y se encara, y el caballero salta y desmonta.
    //    Se para donde la punta, al final de la estocada, le asoma THROUGH por la espalda.
    const distance = Math.max(
      knight.body.torso + PAWN_BODY + BODY_GAP,
      punchDistance({ body: bladeBody(measure.blade), from: home, center, target: pawn, torso: PAWN_BODY }) - THROUGH,
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    stances.set(attacker, stanceOf(postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: thrust }])));
    pawn.setSpearDefault('upright');
    pawn.setGripSlide(-COMBAT_RAISE);
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.descend(center),
      defender.mover.turnTo(facing, 0.3),
    ]);
    await attacker.mover.leapTo(spots.attacker);
    await attacker.mover.dismount({ at: spots.attacker, facing: spots.attackerFacing, mode: 'dismount' });

    // 2. El peón le tira una estocada y el caballero la para con el escudo: chispas y «¡CLANC!». Si no
    //    tiene animación de parada, sube el brazo del escudo por código.
    const jab = usableStrikes(pawn.attacks, pawn.strikes, 'duel')[0];
    if (jab) {
      pawn.setSpearPose('forward');
      const jabbing = pawn.playOnce('attack', { clip: jab, fade: 0.15 });
      const guard = rider.has('block')
        ? rider.playOnce('block', { fade: 0.1 })
        : clock.tween(GUARD_SECONDS, (t) => rider.turnBone('L_Upperarm', { x: -GUARD * t }));
      await slowToImpact(clock, pawn.strikes[jab].spear?.t ?? pawn.strikes[jab].body.t);
      const shield = rider.props.shield ?? rider.object.getObjectByName('L_Hand');
      const at = shield.getWorldPosition(new THREE.Vector3());
      fx.burst(at, { size: 0.9, sparks: 22 });
      hud.flash();
      cinema.shake(0.12);
      shout(bubbles, '¡CLANC!', at);
      await afterImpact(clock);
      await Promise.all([jabbing, guard]);
      pawn.play('idle', { fade: 0.2 });
    }

    // 3. La estocada del caballero: la punta asoma por la espalda, el peón se queda tieso y se la mira.
    const running = rider.playOnce('attack', { clip: thrust, fade: 0.15 });
    await slowToImpact(clock, measure.blade.t);
    const tip = swordTip(rider);
    fx.burst(tip, { size: 1, sparks: 26 });
    hud.flash();
    cinema.shake(0.18);
    shout(bubbles, '¡ZAS!', tip);
    const ux = Math.sin(spots.attackerFacing);
    const uz = Math.cos(spots.attackerFacing);
    pawn.throwSpear({ x: ux, z: uz });
    pawn.play('idle', { fade: 0.1 });
    pawn.turnBone('Head', { x: HEAD_TURN });
    await afterImpact(clock);
    await clock.wait(STIFF_SECONDS);

    // 4. Saca la espada andando hacia atrás y el peón cae de espaldas, con estrellitas.
    const back = rider.figure.position.clone();
    await clock.tween(PULL_SECONDS, (t) => {
      rider.figure.position.set(back.x - ux * THROUGH * t, back.y, back.z - uz * THROUGH * t);
    });
    await running;
    rider.play('idle', { fade: 0.3 });
    const angle = fallDirection({
      at: center,
      around: facing + Math.PI,
      spread: FALL_SPREAD,
      length: pawn.height,
      rival: { x: spots.attacker.x, z: spots.attacker.z, radius: knight.body.torso },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    bodies.push(lyingBody({ at: center, angle, length: pawn.height }));
    pawn.resetBones();
    await defender.mover.turnTo(angle + Math.PI, 0.12);
    await topple({ clock, figure: pawn.figure, forward: false });
    const head = bonePosition(pawn, 'Head');
    dust.puff(new THREE.Vector3(head.x, DUST_Y, head.z), { count: 12, radius: 0.6, duration: 0.5 });
    cinema.shake(0.1);
    await knockOut({ clock, fx, fighter: pawn });
    await defender.mover.vanish();
    bodies.length = 0;
    stances.delete(attacker);

    // 5. El caballero ocupa la casilla, el caballo se reúne con él y monta.
    pawn.setSpearDefault(null);
    await Promise.all([cinema.restore(clock), attacker.mover.mount(target)]);
    await celebrate(attacker);
  },
};
```

`windUp` no se usa aquí: la estocada va seguida. Se deja fuera del import si el linter se queja.

- [ ] **Paso 2: Apuntarla en el director**

En `src/combat/knight/battle.js`:

```js
import { knightRunsThroughPawn } from './knight-runs-through-pawn.js';
import { pawnKicksKnight } from './pawn-kicks-knight.js';
```

```js
const BATTLES = [pawnKicksKnight, knightRunsThroughPawn];
```

- [ ] **Paso 3: Preparación para comprobarla**

En `raw/tmp/verificar-batalla.js`, dentro de `PREPARACIONES`, añadir:

```js
  // El caballero blanco, llevado a d4, se come al peón negro, llevado a e5; alrededor, peones en e4 y d5.
  'caballero-come-peon': (at) => {
    at('b1').mover.placeOn('d4');
    at('e7').mover.placeOn('e5');
    at('e2').mover.placeOn('e4');
    at('d7').mover.placeOn('d5');
    return ['d4', 'e5'];
  },
```

- [ ] **Paso 4: Comprobarlo**

Recargar la vista previa y, en su consola:

```js
const m = await import('/raw/tmp/verificar-batalla.js?v=' + Date.now());
await m.pelear('caballero-come-peon');
```

Expected: `acciones` con `pawn:attack` (la estocada parada), `knight:attack` (la del caballero) y el final
del peón; `hundidoAlGolpear` entre 0,10 y 0,30 (la punta entra y asoma por la espalda, sin pasarse);
`hueco` ≥ 0 y `holgura` ≥ 0; `trozos: 0` y `bocadillos: 0`; `caballos: [true]` (el ganador vuelve a estar a
caballo); `ganador: 'e5'`; `camara: 0` y `controles: true`; ningún error. Y con los ojos: el escudo para la
estocada con chispas, la punta asoma por la espalda del peón, se la mira y cae de espaldas.

- [ ] **Paso 5: Commit**

```bash
git add src/combat/knight/knight-runs-through-pawn.js src/combat/knight/battle.js
git commit -m "Batalla: el caballero atraviesa al peón con la espada" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 15: Batalla 3 — caballero contra caballero, el Caballero Negro

**Files:**
- Create: `src/combat/knight/knight-fights-knight.js`
- Modify: `src/combat/knight/battle.js`, `raw/tmp/verificar-batalla.js`

**Interfaces:**
- Consumes: de la tarea 7, `afterImpact`, `punchDistance`, `slowToImpact` y `stanceOf`; `strikeSpot`
  (`plan.js`); `cutLimb` (tarea 11) y `debris.throwPiece`; `bubbles.say`; de la tarea 8, `scaleBone` y
  `resetBones`; de la tarea 10, `dismount`, `sit`, `defeated` y `mount`; de la tarea 12, el resto.
- Produces: `knightFightsKnight`, con `matches` (caballero contra caballero), `can` (el atacante tiene tajo
  y el defensor, brazos y piernas que cortar) y `run`.

- [ ] **Paso 1: La batalla**

`src/combat/knight/knight-fights-knight.js`:

```js
import * as THREE from 'three';
import { afterImpact, punchDistance, slowToImpact, stanceOf } from '../fight.js';
import { strikeSpot } from '../plan.js';
import { cutLimb } from '../../pieces/limbs.js';
import {
  BODY_GAP, bladeBody, bladeStrikes, bonePosition, celebrate, dismountMode, facingTo, fallDirection, kickOf,
  knockOut, lyingBody, postOf, shout, swordTip, topple, windUp,
} from './common.js';

// Caballero come caballero: el Caballero Negro de los Monty Python (diseño, sección 7). Los dos desmontan y
// cruzan un par de golpes parados. El atacante le corta el brazo de la espada, que sale volando y rebota;
// el otro se mira el muñón y sigue peleando con el escudo. Le corta el otro brazo, recibe una patada y le
// corta las dos piernas. Queda un tronco en el suelo que aún le planta cara: «¡Solo es un rasguño!». Un
// toquecito en el yelmo y cae; desaparece en polvo con sus trozos y el ganador ocupa la casilla y monta.

const LIMBS = ['R_Upperarm', 'L_Upperarm', 'R_Thigh', 'L_Thigh']; // en este orden: espada, escudo y piernas
const SHRINK = 0.001; // a lo que encoge el hueso del trozo cortado
const CLASHES = 2; // golpes parados antes del primer corte
const CUT_SPEED = { x: 1.1, y: 2.6 }; // con lo que sale volando cada trozo
const SCRATCH = '¡Solo es un rasguño!';
const SCRATCH_SECONDS = 1.6;
const STUMP_SECONDS = 0.5; // lo que se mira el muñón
const TAP_SECONDS = 0.35;
const FALL_SPREAD = Math.PI / 4;
const DUST_Y = 0.05;

export const knightFightsKnight = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'knight',
  can: (attacker, defender) => bladeStrikes(attacker.piece.rider, { thrust: false }).length > 0
    && LIMBS.every((bone) => defender.piece.rider.object.getObjectByName(bone)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const mine = attacker.piece.rider;
    const his = defender.piece.rider;
    const slashes = bladeStrikes(mine, { thrust: false });
    const hisSlashes = bladeStrikes(his, { thrust: false });
    const facing = facingTo(center, home);
    const measure = mine.strikes[slashes[0]];

    // 1. La cámara encuadra y los dos desmontan, cara a cara y a distancia de espada.
    const distance = Math.max(
      attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP,
      punchDistance({ body: bladeBody(measure.blade), from: home, center, target: his, torso: defender.piece.body.torso }),
    );
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    stances.set(attacker, stanceOf(postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: slashes[0] }])));
    stances.set(defender, stanceOf(postOf(defender, center, facing, hisSlashes[0] ? [{ action: 'attack', key: hisSlashes[0] }] : [])));
    await cinema.frame(clock, home, center, obstacles);
    await Promise.all([
      attacker.mover.dismount({ at: spots.attacker, facing: spots.attackerFacing, mode: 'dismount' }),
      defender.mover.dismount({ at: center, facing, mode: dismountMode(random) }),
    ]);

    // 2. Un par de golpes parados, con chispas donde se cruzan las hojas.
    for (let i = 0; i < CLASHES; i++) {
      const mio = mine.playOnce('attack', { clip: slashes[i % slashes.length], fade: 0.15 });
      const suyo = hisSlashes.length ? his.playOnce('attack', { clip: hisSlashes[i % hisSlashes.length], fade: 0.15 }) : null;
      await slowToImpact(clock, mine.strikes[slashes[i % slashes.length]].blade.t);
      const cruce = swordTip(mine).lerp(his.props.sword ? swordTip(his) : swordTip(mine), 0.5);
      fx.burst(cruce, { size: 0.8, sparks: 18 });
      hud.flash();
      cinema.shake(0.1);
      shout(bubbles, '¡CLANC!', cruce);
      await afterImpact(clock);
      await Promise.all([mio, suyo]);
      mine.play('idle', { fade: 0.2 });
      his.play('idle', { fade: 0.2 });
    }

    // 3. Corta brazos y piernas. Cada trozo sale volando de la propia malla y el hueso encoge; entre los
    //    brazos y las piernas, el atacante recibe una patada del otro (si la tiene) y sigue.
    const kick = kickOf(his);
    for (const [n, bone] of LIMBS.entries()) {
      const key = slashes[n % slashes.length];
      const cutting = mine.playOnce('attack', { clip: key, fade: 0.15 });
      await slowToImpact(clock, mine.strikes[key].blade.t);
      const at = bonePosition(his, bone);
      fx.burst(at, { size: 1, sparks: 26 });
      hud.flash();
      cinema.shake(0.16);
      shout(bubbles, bone.includes('Thigh') ? '¡ZAS!' : '¡CHAS!', at);
      const piece = cutLimb(his.object, bone);
      if (piece) {
        debris.throwPiece(piece, {
          velocity: { x: Math.sin(spots.attackerFacing) * CUT_SPEED.x, y: CUT_SPEED.y, z: Math.cos(spots.attackerFacing) * CUT_SPEED.x },
          obstacles: () => crowd.obstacles([attacker, defender]),
        });
      }
      his.scaleBone(bone, SHRINK);
      if (n === 0 && his.props.sword) his.props.sword.visible = false;
      if (n === 1 && his.props.shield) his.props.shield.visible = false;
      await afterImpact(clock);
      await cutting;
      mine.play('idle', { fade: 0.25 });
      if (n === 0) {
        his.play('idle', { fade: 0.2 }); // se mira el muñón
        await clock.wait(STUMP_SECONDS);
      }
      if (n === 1 && kick) {
        const kicking = his.playOnce('attack', { clip: kick, fade: 0.15 });
        await slowToImpact(clock, his.strikes[kick].body.t);
        const toe = bonePosition(his, his.strikes[kick].body.bone);
        fx.burst(toe, { size: 0.8, sparks: 16 });
        cinema.shake(0.12);
        shout(bubbles, '¡TOMA!', toe);
        if (mine.has('hit')) mine.playOnce('hit', { fade: 0.1 });
        await afterImpact(clock);
        await kicking;
        his.play('idle', { fade: 0.2 });
      }
      if (n === LIMBS.length - 1) {
        stances.delete(defender);
        await defender.mover.sit(true); // ya solo es un tronco en el suelo
        bodies.push(lyingBody({ at: center, angle: facing, length: his.height * 0.5, radius: 0.3 }));
      }
    }

    // 4. El tronco aún le planta cara, con su bocadillo; un toquecito en el yelmo y cae.
    const head = his.object.getObjectByName('Head');
    const bocadillo = bubbles.say(SCRATCH, head, { seconds: SCRATCH_SECONDS });
    await clock.wait(SCRATCH_SECONDS * 0.6);
    const tap = mine.playOnce('attack', { clip: slashes[0], fade: 0.15 });
    await clock.wait(TAP_SECONDS);
    fx.burst(bonePosition(his, 'Head'), { size: 0.7, sparks: 14 });
    hud.flash();
    shout(bubbles, '¡TOC!', bonePosition(his, 'Head'));
    await bocadillo;
    const angle = fallDirection({
      at: center,
      around: facing + Math.PI,
      spread: FALL_SPREAD,
      length: his.height * 0.5,
      rival: { x: spots.attacker.x, z: spots.attacker.z, radius: attacker.piece.body.torso },
      overlap: (body) => crowd.overlap({ owners: [attacker, defender], bodies: [body] }),
    });
    await topple({ clock, figure: his.figure, forward: false });
    const donde = bonePosition(his, 'Head');
    dust.puff(new THREE.Vector3(donde.x, DUST_Y, donde.z), { count: 14, radius: 0.7, duration: 0.5 });
    cinema.shake(0.12);
    await tap;
    mine.play('idle', { fade: 0.3 });
    await knockOut({ clock, fx, fighter: his });

    // 5. Desaparece en polvo con sus trozos; el ganador ocupa la casilla y monta.
    bodies.length = 0;
    debris.clear({ seconds: 0.3 });
    await defender.mover.defeated({ avoid: center });
    his.resetBones();
    stances.delete(attacker);
    await Promise.all([cinema.restore(clock), attacker.mover.mount(target)]);
    await celebrate(attacker);
  },
};
```

`windUp` no hace falta aquí; se deja fuera del import si el linter se queja. `fallDirection` se usa para el
ángulo del tronco: si no cabe hacia atrás, cae hacia el lado que deje más sitio.

- [ ] **Paso 2: Apuntarla en el director**

```js
import { knightFightsKnight } from './knight-fights-knight.js';
```

```js
const BATTLES = [pawnKicksKnight, knightRunsThroughPawn, knightFightsKnight];
```

- [ ] **Paso 3: Preparación para comprobarla**

En `raw/tmp/verificar-batalla.js`, dentro de `PREPARACIONES`:

```js
  // Caballero blanco en d4 contra caballero negro en e5, con peones alrededor en e4 y d5.
  'caballero-come-caballero': (at) => {
    at('b1').mover.placeOn('d4');
    at('g8').mover.placeOn('e5');
    at('e2').mover.placeOn('e4');
    at('d7').mover.placeOn('d5');
    return ['d4', 'e5'];
  },
```

- [ ] **Paso 4: Comprobarlo**

```js
const m = await import('/raw/tmp/verificar-batalla.js?v=' + Date.now());
await m.pelear('caballero-come-caballero');
```

Expected: `acciones` con cuatro `knight:attack` del atacante como mínimo; `trozos: 0` y `bocadillos: 0` al
terminar (los cuatro trozos vuelan y se limpian con el vencido); `hueco` ≥ 0 y `holgura` ≥ 0 mientras dura;
`caballos: [true]`; `ganador: 'e5'`; `camara: 0` y `controles: true`; ningún error en la consola. Con los
ojos: los brazos y las piernas salen enteros y con su textura, el tronco suelta su «¡Solo es un rasguño!» y
el toquecito en el yelmo lo tumba. Dura unos 15 s.

- [ ] **Paso 5: Commit**

```bash
git add src/combat/knight/knight-fights-knight.js src/combat/knight/battle.js
git commit -m "Batalla: caballero contra caballero, el Caballero Negro" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 16: Batalla 4 — el caballero le barre las piernas al gigante

**Files:**
- Create: `src/combat/knight/knight-sweeps-giant.js`
- Modify: `src/combat/knight/battle.js`, `raw/tmp/verificar-batalla.js`

**Interfaces:**
- Consumes: de la tarea 7, `afterImpact`, `choose`, `overlapOf`, `slowToImpact` y `stanceOf`; `bestStrike` y
  `strikeSpot` (`plan.js`); de la tarea 12, `bladeStrikes`, `bonePosition`, `celebrate`, `facingTo`,
  `fighterOf`, `postOf`, `shout` y `swordTip`; de la tarea 9, `leapTo`; de la tarea 10, `dismount` y `mount`;
  del mover de la torre, `awaken()` y `crumble()`.
- Produces: `knightSweepsGiant`, con `matches` (caballero contra torre), `can` (el gigante tiene puñetazo y
  el jinete, tajo) y `run`.

- [ ] **Paso 1: La batalla**

`src/combat/knight/knight-sweeps-giant.js`:

```js
import * as THREE from 'three';
import { afterImpact, choose, overlapOf, slowToImpact, stanceOf } from '../fight.js';
import { bestStrike, strikeSpot } from '../plan.js';
import {
  BODY_GAP, bladeStrikes, bonePosition, celebrate, facingTo, fighterOf, postOf, shout, swordTip,
} from './common.js';

// Caballero come torre: le barre las piernas (diseño, sección 7). El caballero salta hasta la torre y
// desmonta; la torre se convierte en gigante y lo provoca si cabe. El gigante descarga un puñetazo, el
// caballero lo esquiva agachándose y le barre las piernas de un tajo. A cámara lenta, el gigante cae de
// espaldas y se deshace en rocas, con una gran nube de polvo y temblor. El caballero ocupa la casilla y monta.

const DUCK = 0.35; // lo que baja la figura al agacharse
const DUCK_SECONDS = 0.22;
const SWEEP_SECONDS = 0.3; // lo que tarda en levantarse después de barrer
const COLLAPSE_SECONDS = 0.8; // del tajo a deshacerse en rocas
const LEG_BONES = ['R_Calf', 'L_Calf', 'R_Thigh', 'L_Thigh'];
const DUST = { count: 26, radius: 1.3, duration: 0.8 };
const DUST_Y = 0.05;

export const knightSweepsGiant = {
  matches: (attacker, defender) => attacker.kind === 'knight' && defender.kind === 'rook',
  can: (attacker, defender) => bladeStrikes(attacker.piece.rider, { thrust: false }).length > 0
    && Boolean(defender.piece.giant && bestStrike(defender.piece.giant.attacks, defender.piece.giant.strikes)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const rider = attacker.piece.rider;
    const giant = fighterOf(defender);
    const sweep = bladeStrikes(rider, { thrust: false })[0];
    const punch = bestStrike(giant.attacks, giant.strikes);
    const facing = facingTo(center, home);

    // 1. Puestos: el caballero a distancia de espada del gigante; el gigante, en su casilla, con su
    //    puñetazo y, si cabe, una provocación.
    const distance = attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP;
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    const post = postOf(defender, center, facing, [{ action: 'attack', key: punch }]);
    const overlap = () => overlapOf(crowd, [attacker, defender], [post]);
    const taunt = choose(post, 'taunt', { overlap, random, optional: true });
    stances.set(defender, stanceOf(post));
    stances.set(attacker, stanceOf(postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: sweep }])));

    // 2. La cámara encuadra, la torre despierta y el caballero salta, desmonta y se encara.
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      defender.mover.awaken(),
      attacker.mover.leapTo(spots.attacker),
    ]);
    await attacker.mover.dismount({ at: spots.attacker, facing: spots.attackerFacing, mode: 'dismount' });
    await defender.mover.turnTo(facing, 0.3);
    if (taunt) await giant.playOnce('taunt', { clip: taunt });
    giant.play('idle', { fade: 0.25 });

    // 3. El puñetazo pasa por encima: el caballero se agacha justo en el impacto.
    const punching = giant.playOnce('attack', { clip: punch, fade: 0.15 });
    const agachado = rider.figure.position.y;
    await slowToImpact(clock, Math.max(0, giant.strikes[punch].body.t - DUCK_SECONDS));
    await clock.tween(DUCK_SECONDS, (t) => {
      rider.figure.position.y = agachado - DUCK * t;
    });
    const puño = bonePosition(giant, giant.strikes[punch].body.bone);
    fx.burst(puño, { size: 0.8, sparks: 14 });
    cinema.shake(0.1);
    shout(bubbles, '¡FIUUU!', puño);
    await afterImpact(clock);

    // 4. El tajo a las piernas, a cámara lenta: chispas en la espinilla y el gigante se desploma.
    const sweeping = rider.playOnce('attack', { clip: sweep, fade: 0.15 });
    await slowToImpact(clock, rider.strikes[sweep].blade.t);
    const pierna = LEG_BONES.map((bone) => giant.object.getObjectByName(bone)).find(Boolean);
    const at = pierna ? pierna.getWorldPosition(new THREE.Vector3()) : swordTip(rider);
    fx.burst(at, { size: 1.2, sparks: 30 });
    hud.flash();
    cinema.shake(0.25);
    shout(bubbles, '¡ZAS!', at);
    giant.playOnce(giant.has('defeat') ? 'defeat' : 'hit', { clip: undefined, fade: 0.1 });
    const crumbled = clock.wait(COLLAPSE_SECONDS).then(() => defender.mover.crumble());
    await afterImpact(clock);
    await clock.tween(SWEEP_SECONDS, (t) => {
      rider.figure.position.y = agachado - DUCK * (1 - t);
    });
    rider.figure.position.y = agachado;
    await sweeping;
    rider.play('idle', { fade: 0.3 });
    dust.puff(new THREE.Vector3(center.x, DUST_Y, center.z), DUST);
    cinema.shake(0.2);
    await crumbled;

    // 5. El caballero ocupa la casilla, el caballo se reúne con él y monta.
    stances.delete(attacker);
    stances.delete(defender);
    await Promise.all([cinema.restore(clock), attacker.mover.mount(target)]);
    await celebrate(attacker);
  },
};
```

- [ ] **Paso 2: Apuntarla en el director**

```js
import { knightSweepsGiant } from './knight-sweeps-giant.js';
```

```js
const BATTLES = [pawnKicksKnight, knightRunsThroughPawn, knightFightsKnight, knightSweepsGiant];
```

- [ ] **Paso 3: Preparación para comprobarla**

En `raw/tmp/verificar-batalla.js`, dentro de `PREPARACIONES`:

```js
  // El caballero blanco, llevado a d4, se come a la torre negra, llevada a d6, con peones en la fila 7.
  'caballero-come-torre': (at) => {
    at('b1').mover.placeOn('d4');
    at('a8').mover.placeOn('d6');
    return ['d4', 'd6'];
  },
```

- [ ] **Paso 4: Comprobarlo**

```js
const m = await import('/raw/tmp/verificar-batalla.js?v=' + Date.now());
await m.pelear('caballero-come-torre');
```

Expected: `acciones` con `rook:attack` (el puñetazo que falla), `knight:attack` (el tajo) y el derrumbe del
gigante; `hueco` ≥ 0 y `holgura` ≥ 0; `trozos: 0` y `bocadillos: 0`; `caballos: [true]`; `ganador: 'd6'`;
`rocas` a 0 al final (las piedras se limpian); `camara: 0` y `controles: true`; ningún error. Con los ojos:
el puño pasa por encima del yelmo, el tajo llega a la espinilla y el gigante cae de espaldas con su nube de
polvo. Dura unos 9 s.

- [ ] **Paso 5: Commit**

```bash
git add src/combat/knight/knight-sweeps-giant.js src/combat/knight/battle.js
git commit -m "Batalla: el caballero le barre las piernas al gigante" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 17: Batalla 5 — el gigante deja al caballero en un casco con pies

**Files:**
- Create: `src/combat/knight/giant-crushes-knight.js`
- Modify: `src/combat/knight/battle.js`, `raw/tmp/verificar-batalla.js`

**Interfaces:**
- Consumes: de la tarea 7, `afterImpact`, `choose`, `overlapOf`, `slowToImpact` y `stanceOf`; `bestStrike` y
  `strikeSpot` (`plan.js`); de la tarea 12, `bladeStrikes`, `bonePosition`, `dismountMode`, `facingTo`,
  `fighterOf`, `knockOut`, `postOf` y `shout`; de la tarea 8, `scaleBone` y `resetBones`; de la tarea 10,
  `dismount`, `horseFlee` y `defeated`; del mover de la torre, `awaken()`, `walkTo` y `walkOnto`.
- Produces: `giantCrushesKnight`, con `matches` (torre contra caballero), `can` (el gigante tiene golpe y el
  jinete, huesos de tronco que encoger) y `run`.

- [ ] **Paso 1: La batalla**

`src/combat/knight/giant-crushes-knight.js`:

```js
import * as THREE from 'three';
import { afterImpact, choose, overlapOf, slowToImpact, stanceOf } from '../fight.js';
import { bestStrike, strikeSpot } from '../plan.js';
import {
  BODY_GAP, bladeStrikes, bonePosition, dismountMode, facingTo, fighterOf, knockOut, postOf, shout,
} from './common.js';

// Torre come caballero: un casco con pies (diseño, sección 7). La torre se convierte en gigante y avanza; el
// caballero desmonta (o su caballo lo tira y huye aterrado) y se pone en guardia, temblando. A cámara lenta
// el gigante lo machaca: el cuerpo se le mete dentro de las piernas y solo quedan el yelmo, con su penacho,
// encima de las botas. El casco con pies se tambalea mareado con estrellitas, da unos pasitos y desaparece
// en polvo. El gigante ocupa la casilla y vuelve a ser torre.

const TORSO_BONES = ['Spine02', 'Spine01', 'Waist', 'Pelvis']; // lo que encoge hasta apoyar el yelmo en las botas
const ARM_BONES = ['R_Upperarm', 'L_Upperarm'];
const SQUASH_SECONDS = 0.35;
const SHRINK = 0.001;
const TREMBLE = 2; // grados que tiembla en guardia
const TREMBLE_SECONDS = 0.9;
const STAGGER_SECONDS = 1.2; // los pasitos mareados
const STAGGER = 0.14; // lo que se mueve a cada lado
const DUST = { count: 18, radius: 0.8, duration: 0.6 };
const DUST_Y = 0.05;

export const giantCrushesKnight = {
  matches: (attacker, defender) => attacker.kind === 'rook' && defender.kind === 'knight',
  can: (attacker, defender) => Boolean(attacker.piece.giant && bestStrike(attacker.piece.giant.attacks, attacker.piece.giant.strikes))
    && TORSO_BONES.some((bone) => defender.piece.rider.object.getObjectByName(bone)),

  async run({ attacker, defender, home, center, target, clock, fx, cinema, hud, crowd, dust, debris, bubbles, stances, bodies, obstacles, random }) {
    const giant = fighterOf(attacker);
    const rider = defender.piece.rider;
    const punch = bestStrike(giant.attacks, giant.strikes);
    const guard = bladeStrikes(rider, { thrust: false })[0] ?? bladeStrikes(rider)[0];
    const facing = facingTo(center, home);

    // 1. Puestos y encuadre: el gigante avanza hasta donde su golpe alcanza al caballero.
    const distance = attacker.piece.body.torso + defender.piece.body.torso + BODY_GAP;
    const spots = strikeSpot(home, center, { reach: distance, torso: 0 });
    const post = postOf(attacker, spots.attacker, spots.attackerFacing, [{ action: 'attack', key: punch }]);
    const overlap = () => overlapOf(crowd, [attacker, defender], [post]);
    const taunt = choose(post, 'taunt', { overlap, random, optional: true });
    stances.set(attacker, stanceOf(post));
    stances.set(defender, stanceOf(postOf(defender, center, facing, guard ? [{ action: 'attack', key: guard }] : [])));
    await Promise.all([
      cinema.frame(clock, home, center, obstacles),
      attacker.mover.awaken(),
      defender.mover.dismount({ at: center, facing, mode: dismountMode(random) }),
    ]);
    await defender.mover.horseFlee({ avoid: spots.attacker });

    // 2. El gigante se acerca y provoca si cabe; el caballero se pone en guardia, temblando.
    await attacker.mover.walkTo(spots.attacker);
    await attacker.mover.turnTo(spots.attackerFacing, 0.3);
    if (taunt) await giant.playOnce('taunt', { clip: taunt });
    giant.play('idle', { fade: 0.25 });
    const temblor = clock.tween(TREMBLE_SECONDS, (t) => {
      rider.figure.rotation.y = facing + THREE.MathUtils.degToRad(TREMBLE) * Math.sin(t * Math.PI * 12);
    });

    // 3. El golpe, a cámara lenta: el cuerpo se mete dentro de las piernas.
    const crushing = giant.playOnce('attack', { clip: punch, fade: 0.15 });
    await slowToImpact(clock, giant.strikes[punch].body.t);
    const puño = bonePosition(giant, giant.strikes[punch].body.bone);
    fx.burst(puño, { size: 1.3, sparks: 32 });
    hud.flash();
    cinema.shake(0.3);
    shout(bubbles, '¡CHOF!', puño);
    await temblor;
    rider.figure.rotation.y = facing;
    if (rider.props.sword) rider.props.sword.visible = false;
    if (rider.props.shield) rider.props.shield.visible = false;
    await clock.tween(SQUASH_SECONDS, (t) => {
      const k = 1 - t * (1 - SHRINK);
      for (const bone of TORSO_BONES) rider.scaleBone(bone, k);
      for (const bone of ARM_BONES) rider.scaleBone(bone, k);
    });
    await afterImpact(clock);
    await crushing;
    giant.play('idle', { fade: 0.3 });

    // 4. El casco con pies se tambalea mareado, da unos pasitos y desaparece en polvo.
    await knockOut({ clock, fx, fighter: rider });
    const sitio = rider.figure.position.clone();
    await clock.tween(STAGGER_SECONDS, (t) => {
      rider.figure.position.x = sitio.x + Math.sin(t * Math.PI * 4) * STAGGER;
      rider.figure.position.z = sitio.z + Math.sin(t * Math.PI * 2.5) * STAGGER * 0.5;
    });
    dust.puff(new THREE.Vector3(sitio.x, DUST_Y, sitio.z), DUST);
    await defender.mover.defeated({ avoid: spots.attacker });
    rider.resetBones();
    stances.delete(defender);

    // 5. El gigante ocupa la casilla y vuelve a ser torre.
    stances.delete(attacker);
    await Promise.all([cinema.restore(clock), attacker.mover.walkOnto(target)]);
  },
};
```

- [ ] **Paso 2: Apuntarla en el director**

```js
import { giantCrushesKnight } from './giant-crushes-knight.js';
```

```js
const BATTLES = [pawnKicksKnight, knightRunsThroughPawn, knightFightsKnight, knightSweepsGiant, giantCrushesKnight];
```

Con las cinco en la lista, `canKnightBattle` cubre todas las capturas en las que participa un caballero.

- [ ] **Paso 3: Preparación para comprobarla**

En `raw/tmp/verificar-batalla.js`, dentro de `PREPARACIONES`:

```js
  // La torre blanca, llevada a d4, se come al caballero negro, llevado a d6.
  'torre-come-caballero': (at) => {
    at('a1').mover.placeOn('d4');
    at('g8').mover.placeOn('d6');
    return ['d4', 'd6'];
  },
```

- [ ] **Paso 4: Comprobarlo**

```js
const m = await import('/raw/tmp/verificar-batalla.js?v=' + Date.now());
await m.pelear('torre-come-caballero');
```

Expected: `acciones` con `rook:attack` y sin ataque del caballero; `hueco` ≥ 0 y `holgura` ≥ 0 (el caballo
que huye no deja a nadie sin sitio); `trozos: 0` y `bocadillos: 0`; `caballos: []` (el caballero vencido ya
no está); `ganador: 'd6'` con la torre otra vez en forma de torre; `camara: 0` y `controles: true`; ningún
error. Con los ojos: el caballo sale huyendo, el cuerpo se mete dentro de las botas y quedan el yelmo y el
penacho encima, tambaleándose. Dura unos 9 s.

- [ ] **Paso 5: Commit**

```bash
git add src/combat/knight/giant-crushes-knight.js src/combat/knight/battle.js
git commit -m "Batalla: el gigante deja al caballero en un casco con pies" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tarea 18: Documentación, tanda de comprobaciones y publicación

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: el juego publicado con caballeros en https://mr-d0nut.github.io/bchess/ y el README contándolo.

- [ ] **Paso 1: README**

En `README.md`, cambiar la primera frase:

```markdown
batalla animada. Por ahora hay **peones y torres**: tablero 3D con los ocho peones de cada
```

por:

```markdown
batalla animada. Por ahora hay **peones, torres y caballeros**: tablero 3D con los ocho peones de cada
```

y añadir, después del apartado «Torres», este apartado nuevo:

```markdown
## Caballeros

Los caballeros salen a caballo, en las casillas b1, g1, b8 y g8. Al elegir uno se marcan sus ocho
casillas en L y los enemigos que puede comerse; para ir, el caballo salta por encima de lo que haya en
medio, con el arco más alto cuanto más alta sea la pieza que salta.

Cada captura en la que participa un caballero es un gag distinto:

- **Un peón se lo come:** el caballero desmonta y levanta la espada, y el peón le da una patada en la
  entrepierna; suena a metal y cae de bruces con estrellitas.
- **Se come a un peón:** salta hasta él, para su estocada con el escudo y lo atraviesa con la espada,
  que asoma por la espalda.
- **Caballero contra caballero:** el homenaje al Caballero Negro de los Monty Python, con brazos y
  piernas que salen volando y un «¡Solo es un rasguño!».
- **Se come a una torre:** esquiva el puñetazo del gigante agachándose y le barre las piernas de un tajo.
- **Una torre se lo come:** el gigante lo machaca de un puñetazo y lo deja en un casco con pies, que se
  tambalea mareado antes de esfumarse.

Cuando el caballero pelea a pie, su caballo se aparta y espera; si pierde, huye del tablero.
```

- [ ] **Paso 2: La tanda entera de comprobaciones**

```bash
cd ~/bchess && npm test && node --check src/main.js && for f in src/combat/knight/*.js src/pieces/knight.js src/pieces/limbs.js src/moves/knight-mover.js src/ui/bubble.js src/rules/knight.js src/moves/leap.js; do node --check "$f" || echo "FALLA $f"; done
```

Expected: pruebas en verde y ningún «FALLA».

En la vista previa (recargando antes), las ocho comprobaciones por código, una a una:

```js
const b = await import('/raw/tmp/verificar-batalla.js?v=' + Date.now());
for (const n of ['peon-come-caballero', 'caballero-come-peon', 'caballero-come-caballero', 'caballero-come-torre', 'torre-come-caballero']) {
  console.log(await b.pelear(n));
  location.reload(); // cada pelea parte de un tablero limpio: recargar y repetir a mano
}
```

```js
const t = await import('/raw/tmp/verificar-captura-torre.js?v=' + Date.now());
await t.capturar('torre-come-peon');
```

Expected: lo que dice cada tarea. Las tres capturas de la torre (`torre-come-peon`, `peon-come-torre`,
`torre-come-torre`) siguen igual que antes del caballero.

- [ ] **Paso 3: Móvil**

Abrir `http://localhost:8741/?calidad=movil`, comprobar que carga los modelos ligeros y que una batalla del
caballero va fluida. El usuario lo prueba en su teléfono con la dirección publicada.

- [ ] **Paso 4: Publicar**

```bash
cd ~/bchess && git switch main && git merge caballero -m "Caballeros: salto, batallas y modelos" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" && npm test && git push origin main
```

Comprobar que la página publicada responde y trae los modelos nuevos:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://mr-d0nut.github.io/bchess/ && curl -s https://mr-d0nut.github.io/bchess/assets/models/manifest.json | grep -c white-knight
```

Expected: `200` y `1`.

- [ ] **Paso 5: Memoria**

Anotar en la memoria del proyecto lo aprendido que valga para la próxima pieza (el alfil): claves de las
animaciones del caballero, que la retextura borra las animaciones aplicadas y hay que volver a ponerlas, y
cómo se miden los golpes con la espada.

---

## Repaso

- **Cobertura del diseño.** Secciones del spec y dónde están: 2 (reglas y toques) → tarea 4 y tarea 9,
  paso 4; 3 (las figuras) → tareas 2, 3 y 9; 4 (el salto) → tareas 5 y 9, paso 3; 5 (desmontar y montar) →
  tarea 10; 6 (hacer sitio) → tareas 9 y 12; 7 (las cinco batallas) → tareas 13 a 17, con los trozos, el
  casco con pies y los bocadillos de la tarea 11; 8 (modelos y animaciones) → tareas 1, 2 y 3; 9
  (arquitectura) → los ficheros de cada tarea; 10 (errores) → tarea 9, paso 4 (guardas de `canSmash` y del
  salto) y tarea 12 (lista vacía = captura sin combate); 11 (pruebas) → las pruebas de las tareas 4, 5 y 6 y
  las comprobaciones por código de las tareas 9, 10, 13 a 17 y 18.
- **Nombres.** `knightMoves`, `planLeap`/`leapAt`, `findHorseBones`, `pickDriftTrack`, `cutLimb`,
  `createDebris`, `createBubbles`, `canKnightBattle`/`runKnightBattle` y las cinco batallas se llaman igual
  en la tarea que las define y en las que las usan.
- **Sin huecos.** Cada paso trae su código entero o la orden exacta, con lo que debe salir.
