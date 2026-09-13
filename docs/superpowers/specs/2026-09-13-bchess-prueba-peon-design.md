# BChess — Visión general y Parte 1: prueba del peón

- **Fecha:** 2026-09-13
- **Estado:** diseño aprobado en conversación; pendiente de revisión de este documento.

## 1. Visión

Juego de ajedrez para navegador, homenaje a *Battle Chess* (Interplay, 1988): cada captura
es una batalla animada entre las dos piezas. Las piezas son figuras 3D hiperrealistas
sacadas de las imágenes de referencia del usuario:

- **Blancas:** plata y crema, león azul, peanas de madera clara.
- **Negras:** negro, rojo y oro, grifo dorado, peanas de madera oscura.

Se aloja como repo público en GitHub Pages.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Enfoque gráfico | 3D en tiempo real en el navegador (Three.js), cámara libre, batallas en la propia casilla. Descartados: batallas en vídeo generado con IA y 2,5D prerenderizado. |
| Aparatos | Ordenador y móvil. En móvil la calidad se reduce sola (texturas y sombras). |
| Modos | Contra el ordenador con niveles, dos jugadores en el mismo aparato y ordenador contra ordenador. Jugar por internet queda como extra futuro. |
| Tono | Humor de dibujos animados, sin sangre: salir volando, quedar chamuscado, nubes de polvo. Se conservan los 35 gags del original (Anexo A). |
| Caballero | Va a caballo sobre el tablero. En las batallas desmonta, o el caballo lo tira y huye, y lucha a pie. |
| Nombre | «BChess», con la línea «Homenaje a Battle Chess (1988)». *Battle Chess* es marca registrada de Interplay Entertainment y no se usa como título. |
| Presupuesto | 0 € hasta ver una pieza en movimiento. Después se decide si se paga un servicio. |
| Herramienta 3D de la prueba | Tripo Studio, plan gratuito (propuesta del usuario). |
| Repo | `mr-d0nuT/bchess`, público, clon local en `~/bchess`, GitHub Pages desde `main`, sin compilación. |

## 3. Partes del proyecto

Cada parte tiene su propio diseño, plan e implementación.

1. **Prueba del peón** — este documento.
2. **Juego jugable:** reglas completas (chess.js), rival Stockfish 18 lite de un solo hilo
   en WebAssembly, tablero 3D, vista 2D sin animaciones, los tres modos y deshacer jugada.
   La licencia del repo (Stockfish es GPL-3.0) se decide en el diseño de esa parte.
3. **Las 12 piezas, el gólem de piedra y el caballo:** modelos, esqueletos y movimientos
   base (quieto, andar, recibir golpe, caer).
4. **Las 35 batallas** del Anexo A, con efectos y sonido.
5. **Pulido:** música, sonido, pantalla de carga y rendimiento en móvil.

## 4. Parte 1 — Prueba del peón

### 4.1 Objetivo y criterio de éxito

Comprobar, sin gastar dinero, que una figura sacada de las imágenes del usuario se ve
«como la imagen, pero en 3D y viva» en el navegador, tanto en ordenador como en móvil.

- **Éxito:** el usuario lo confirma viendo la web publicada en su ordenador y en su móvil.
- **Si no convence:** se rehace el 3D con TRELLIS.2 (Microsoft, licencia MIT) y se usa
  Tripo solo para el esqueleto.

### 4.2 Qué hace la página

Dirección: `https://mr-d0nut.github.io/bchess/`

- **Tablero:** tablero de ajedrez 3D realista de 8×8 con marco, luz de estudio a partir
  de un HDRI libre (Poly Haven, CC0) y sombras suaves.
- **Cámara:** gira, acerca y aleja con ratón y con el dedo. Tiene límites para no
  meterse bajo el tablero ni alejarse de más.
- **Peón:** peón blanco sobre su peana en e2, con la animación de reposo, mirando hacia
  el lado de las negras.
- **Tocar una casilla vacía** lanza esta secuencia:
  1. El peón salta de la peana. Si Tripo no tiene animación de salto, baja con un paso
     y el código le da un pequeño arco.
  2. La peana desaparece en una nube de polvo de dibujos animados (~0,4 s).
  3. El peón se gira hacia la casilla y anda hasta ella. El desplazamiento va sincronizado
     con la zancada para que los pies no patinen.
  4. La peana reaparece bajo sus pies con otra nube y lo sube a su altura.
  5. El peón vuelve a reposo mirando hacia el lado de las negras.

  Mientras dura la secuencia se ignoran los toques en el tablero y los botones. En esta
  prueba no hay reglas de ajedrez: vale cualquier casilla vacía.
- **Botón «Atacar»:** reproduce el ataque con la lanza y vuelve a reposo.
- **Botón «Golpe»:** reproduce la reacción a un golpe y vuelve a reposo.
- **Botón «Caer»:** reproduce la caída. A los 1,5 s el peón reaparece de pie con una
  nube de polvo.
- **Contador de fluidez:** fotogramas por segundo, en una esquina.
- **Pie de página:** «Modelos: Tripo AI (CC BY 4.0) · Homenaje a Battle Chess (Interplay,
  1988)» y el dónut de autoría del usuario.

### 4.3 Fabricación de los modelos

Entradas: `~/Downloads/white-peon.png` (seis vistas del peón) y
`~/Downloads/piezas_white_front.png` (juego blanco de frente).

1. **Imagen de referencia de pie.** La hace el usuario en la app de Gemini, gratis, con
   el texto del Anexo B. Hace falta porque a un personaje arrodillado no se le puede
   poner esqueleto.
2. **Recortes.** Los hace Claude en local: el escudo y la peana del peón, sin el fondo
   verde, como PNG con transparencia.
3. **Tripo Studio**, con la cuenta gratuita del usuario. Los clics los hace el usuario
   siguiendo instrucciones, o Claude en su Chrome si el usuario lo permite.
   - Imagen a 3D del peón de pie, con texturas PBR si el plan gratuito las incluye.
   - Esqueleto de tipo *biped*, con nombres de huesos compatibles con Mixamo.
   - Animaciones: reposo, andar, ataque, golpe recibido y caída, más un salto si existe.
   - Imagen a 3D del escudo y de la peana, sin esqueleto.
   - Descarga en GLB de los tres modelos. Gasta entre 3 y 8 de las 15 descargas del mes,
     según si Tripo exporta todas las animaciones en un solo fichero o una por fichero.
   - Presupuesto: como máximo los 200 créditos del mes. Si se agotan, se espera al mes
     siguiente o se pasa a TRELLIS.2.
4. **Lanza.** Geometría hecha en código: asta de madera y punta de acero con materiales
   PBR. La IA suele fallar con objetos tan finos.
5. **Optimización.** La hace Claude en local con `@gltf-transform/cli`: texturas WebP de
   2048 px para ordenador y 1024 px para móvil, compresión meshopt y limpieza.
   - Objetivo: el peón pesa como mucho 6 MB en la versión de ordenador y 3 MB en la
     de móvil.
   - Los originales descargados se guardan en `raw/`, que está en `.gitignore` y no se
     sube al repo.

### 4.4 Estructura técnica de la web

Sin compilación: módulos ES con import map. Three.js r186 se guarda dentro del repo en
`vendor/three/`, con el núcleo y solo los addons usados: GLTFLoader, OrbitControls,
HDRLoader, el decodificador meshopt y SkeletonUtils.

| Fichero | Responsabilidad |
|---|---|
| `index.html` | Página, import map, contenedor del lienzo y de la interfaz. |
| `src/main.js` | Arranque: elige el nivel de calidad, crea la escena y carga el peón. |
| `src/quality.js` | Decide «ordenador» o «móvil» a partir del tipo de puntero y del tamaño de pantalla, y fija texturas, sombras y resolución máxima. |
| `src/scene/board.js` | Tablero y marco. Convierte casilla a posición 3D y al revés. |
| `src/scene/lighting.js` | Entorno HDRI, luz principal con sombras y *tone mapping*. |
| `src/pieces/piece.js` | Figura con esqueleto: carga el GLB, gestiona las animaciones, engancha la lanza y el escudo a los huesos de las manos y lleva su peana. |
| `src/pieces/spear.js` | Geometría y materiales de la lanza. |
| `src/moves/walk.js` | Funciones puras: ruta, orientación y duración del paseo entre dos casillas. |
| `src/fx/dust.js` | Nube de polvo de dibujos animados hecha con sprites. |
| `src/input.js` | Traduce toques y clics a casillas mediante raycast. |
| `src/ui/hud.js` | Botones, contador de fluidez y créditos. |
| `assets/models/`, `assets/env/` | Modelos optimizados y HDRI. |
| `tests/` | Pruebas unitarias con `node --test`. |

Niveles de calidad:

| Nivel | Texturas | Mapa de sombras | Resolución máxima (devicePixelRatio) |
|---|---|---|---|
| Móvil | 1024 px | 1024 | 1,5 |
| Ordenador | 2048 px | 2048 | 2 |

### 4.5 Errores

- **El modelo no carga** (fallo de red o fichero ausente): aparece el mensaje «No se pudo
  cargar el peón» con un botón «Reintentar». El tablero sigue visible.
- **WebGL no está disponible:** un mensaje explica que el navegador no puede mostrar 3D.
- **Falta una animación en el GLB:** el botón correspondiente se oculta y se deja un
  aviso en la consola.

### 4.6 Pruebas

- **Unitarias** (`node --test`, sin dependencias): conversión de casilla a posición y al
  revés; ruta, orientación y duración de `walk.js`.
- **En el panel de vista previa:**
  - la página carga sin errores en la consola;
  - tocar una casilla lleva el peón a esa casilla;
  - cada botón reproduce su animación;
  - la vista de móvil emulada se ve bien.
- **Móvil real:** el usuario abre la web en su teléfono. Objetivo: al menos 30 fps en
  móvil y 60 fps en ordenador.

### 4.7 Fuera de alcance de la Parte 1

Reglas de ajedrez, otras piezas, pieza negra, batallas, sonido, arrodillarse como en la
imagen y caballo.

## Anexo A — Las 35 batallas del original

Resumen propio a partir de
[Brandon's Notepad](https://brandonsnotepad.wordpress.com/2011/10/07/original-battle-chess-capture-sequences/)
y [Wikipedia](https://en.wikipedia.org/wiki/Battle_Chess). En el original, el jaque mate
también se representa como batalla contra el rey. Salen 35 porque un rey no puede
capturar a otro rey. El tono se adapta a dibujos animados en la Parte 4.

| Atacante | Víctima | Qué pasa |
|---|---|---|
| Peón | Peón | Le pincha con la lanza, primero en el pie y luego en la cabeza. |
| Peón | Alfil | Abre un agujero en el suelo con la lanza y el alfil cae dentro. |
| Peón | Caballero | Patada en la entrepierna y el caballero se desploma. |
| Peón | Torre | Forcejeo breve; la torre se derrumba y se hace pedazos. |
| Peón | Reina | La apuñala por la espalda con un cuchillo. |
| Peón | Rey | Le quita la corona con la lanza y el rey coge una rabieta. |
| Alfil | Peón | Cuerpo a cuerpo; lo atraviesa con el báculo afilado. |
| Alfil | Alfil | Lo evapora con el báculo. |
| Alfil | Caballero | Muy parecido a la captura del peón. |
| Alfil | Torre | La desmorona con el báculo. |
| Alfil | Reina | Detiene sus golpes con las manos y la atraviesa. |
| Alfil | Rey | Lo corta en tres trozos. |
| Caballero | Peón | Cuerpo a cuerpo; lo atraviesa con la espada. |
| Caballero | Alfil | Estocada en la barriga y luego lo decapita; el alfil desaparece. |
| Caballero | Caballero | Le corta brazos y piernas (guiño al Caballero Negro de los Monty Python). |
| Caballero | Torre | Le barre las piernas; la torre cae y se desmorona. |
| Caballero | Reina | Refleja su rayo con el escudo y ella se convierte en dragón. |
| Caballero | Rey | Falla al decapitarlo, le parte el cetro y lo deja sin ropa. |
| Torre | Peón | El peón se rinde y la torre lo aplasta hasta dejarlo como una bola de metal. |
| Torre | Alfil | Dos golpes en la cabeza. |
| Torre | Caballero | Lo aplasta hasta dejar un casco con pies. |
| Torre | Torre | Pelea a puñetazos; un puño le atraviesa de la cabeza al cuerpo. |
| Torre | Reina | Se la come entera. |
| Torre | Rey | Lo aplana y el rey cae planeando hasta el suelo. |
| Reina | Peón | Le evapora la lanza; el peón intenta huir y ella lo fulmina. |
| Reina | Alfil | Lo carboniza; su esqueleto se desploma en un montón de huesos. |
| Reina | Caballero | Lo evapora dentro de su armadura. |
| Reina | Torre | La reduce a un montón de escombros. |
| Reina | Reina | La fulmina y la otra encoge hasta desaparecer. |
| Reina | Rey | Lo desintegra; solo quedan la túnica, la corona y el cetro. |
| Rey | Peón | Saca una maza escondida en el cetro y le da un porrazo. |
| Rey | Alfil | Le dispara al pecho tras fallar a la cabeza y a los pies (guiño a *En busca del arca perdida*). |
| Rey | Caballero | Le devuelve una bomba golpeándola con el cetro como un bate. |
| Rey | Torre | La encoge con unos polvos que arden. |
| Rey | Reina | Se abrazan, ella intenta apuñalarlo y él la tumba. |

## Anexo B — Texto para Gemini (peón de pie)

Se adjunta `white-peon.png` en la app de Gemini con este texto:

> Toma como referencia al soldado de la imagen adjunta (la primera figura, la vista de
> frente). Genera UNA sola imagen de ese mismo personaje, idéntico en cara, casco, cofia
> y mangas de cota de malla, túnica beige con el león azul, cinturón, bolsa, botas y
> colores, con estos cambios: de pie y erguido, de frente a la cámara; en pose A, con los
> brazos rectos y separados del cuerpo unos 40 grados y las manos abiertas; piernas
> rectas y ligeramente separadas; manos vacías, sin lanza y sin escudo; sin peana ni
> base, con los pies en el suelo; cuerpo entero de la cabeza a los pies, centrado y con
> margen alrededor; cámara a la altura del pecho, sin perspectiva exagerada; luz de
> estudio suave y uniforme, sin sombras marcadas; fondo liso gris claro. Mismo estilo
> hiperrealista de figura pintada que la referencia.

## Anexo C — Licencias

- **Modelos de Tripo del plan gratuito:** CC BY 4.0, uso no comercial y visibles en su
  galería pública. Mientras BChess use estos modelos debe ser gratis y sin anuncios, con
  la atribución visible.
- **Three.js:** MIT. **HDRI de Poly Haven:** CC0.
- ***Battle Chess*:** marca de Interplay Entertainment. Solo se menciona como homenaje.
