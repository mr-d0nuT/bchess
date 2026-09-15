# BChess — La torre y su gigante de piedra (diseño)

Fecha: 2026-09-14. Continúa la prueba del peón
(`2026-09-13-bchess-prueba-peon-design.md`) y el combate entre peones
(`2026-09-14-bchess-combate-peones-design.md`).

## 1. Objetivo

Como en Battle Chess, la torre se convierte en un gigante de piedra para moverse y pelear. Lo
pidió el usuario: «recuerda que debe convertirse en un gigante de piedra».

**Éxito:** en la web publicada:
- las cuatro torres aparecen en sus casillas;
- al moverlas se transforman en gigantes, andan hasta su casilla y vuelven a ser torres;
- el gigante ocupa más que su casilla, así que las piezas de alrededor se apartan deslizando su
  peana, sin chocar entre ellas, y al acabar vuelven a su sitio;
- cuando comen o las comen hay un golpe corto y brutal.

Comprobado por código:
- entre dos piezas que se apartan o vuelven siempre quedan al menos 0,03 casillas;
- el gigante no toca a las piezas que tienen hueco para apartarse, ni al andar ni al pelear;
- la torre y el gigante no se ven a la vez salvo durante la transformación;
- al terminar cada jugada, todas las piezas están en el centro de su casilla y la torre se ve en
  la suya.

## 2. Reglas y toques

- **Colocación.** Torres en a1 y h1 (blancas) y en a8 y h8 (negras), mirando al oponente.
- **Movimiento.** En línea recta, en horizontal o en vertical, tantas casillas libres como
  quiera. Se detiene antes de una pieza propia y puede comer la primera pieza enemiga de cada
  dirección.
- **Peones.** Los peones pueden comer torres en diagonal, igual que a otros peones. Sus
  movimientos tienen en cuenta todas las piezas del tablero.
- **Marcas.** Al elegir una torre, puntos dorados en sus casillas y aros rojos bajo los enemigos
  que puede comer, igual que con los peones.
- **Botones.** Atacar, Golpe y Caer siguen actuando solo sobre peones; con una torre elegida
  quedan desactivados.
- **Fuera de alcance:** enroque, turnos, jaque y otras piezas.

## 3. Dos formas

| | Torre | Gigante |
|---|---|---|
| Qué es | Modelo estático (sin esqueleto) con su base octogonal de piedra | Modelo con esqueleto y animaciones |
| Cuándo se ve | En reposo | Al moverse y al pelear |
| Altura | 1,75 casillas, base incluida | 1,9 casillas |
| Bandera | Hecha en código: un banderín de dos puntas que ondea en lo alto, con el emblema de su bando (león azul sobre blanco o grifo dorado sobre rojo) | La del modelo, clavada en la espalda |

- **Peana.** La torre no lleva la peana de madera de los peones: su base de piedra ya lo es,
  como en la imagen de referencia.
- **Aspecto del gigante blanco.** El del boceto aprobado (`raw/ref/gigante-blanco.jpeg`): un
  gólem bonachón de sillares crema. La cabeza es un torreón almenado con cara, las hombreras son
  torrecillas y tiene manos enormes.
- **Aspecto del gigante negro.** El mismo con los materiales de la torre negra: piedra oscura,
  bandas doradas, ventanas rojas y bandera roja con el grifo dorado.

## 4. La transformación

**De torre a gigante** (1,2 s):
1. La torre tiembla durante 0,4 s, cada vez más, con polvo en la base. Mientras tanto, las piezas
   de alrededor empiezan a hacerle sitio (sección 6).
2. **Estalla:**
   - la torre desaparece;
   - salen despedidas de 14 a 20 rocas, trozos de piedra hechos en código con el color de la
     torre, que caen con gravedad y rebotan una vez;
   - se levanta una gran nube de polvo y la cámara tiembla.
3. **El gigante se alza** del suelo en 0,5 s: crece de 0,2 a 1 con un pequeño rebote mientras se
   asienta el polvo, y se queda en reposo.

**De gigante a torre** (1 s):
1. El gigante se encoge hasta desaparecer dentro de una nube de polvo, mientras las rocas vuelan
   hacia su casilla.
2. La torre sube del suelo, crece con un rebote y se asienta con polvo, mirando al oponente.

Las rocas que quedan en el tablero encogen y desaparecen en 1 s.

## 5. Moverse

1. Transformación de torre a gigante en su casilla.
2. El gigante gira hacia su destino y anda con su paseo pesado. La velocidad sale de su zancada
   medida, como con los peones. A su paso, las piezas cercanas se apartan y después vuelven.
3. Transformación de gigante a torre en la casilla de destino.
4. La jugada termina cuando todas las piezas han vuelto al centro de su casilla.

## 6. Hacer sitio

Lo pidió el usuario: que las piezas colindantes «se separen un poco de ella para hacerle
sitio», deslizando «la peana con la figura encima», «sin que lleguen a chocar con las
colindantes».

- **Quién se aparta.** Las piezas en reposo: el peón con su peana y la torre con su base. No se
  apartan las que participan en la jugada.
- **Cuánto sitio pide el gigante:**
  - al moverse, un círculo con su radio, medido al cargar: hasta dónde llegan sus manos y sus pies
    en reposo y al andar, más un margen;
  - al andar, también el tramo de 0,8 casillas que tiene por delante, para que las piezas se
    aparten antes de que llegue;
  - al pelear, un abanico: lo que alcanza en cada dirección (24 sectores) con lo que va a hacer en
    su puesto, medido al cargar para cada animación, más el margen. Así, un puñetazo pide sitio
    hacia delante y una provocación, hacia donde abre los brazos. Lo pide desde que empieza la
    captura, para que las piezas ya se hayan apartado cuando golpea, provoca o se derrumba.
- **Cómo se apartan:**
  - se deslizan peana y figura juntas, sin girar, y siguen respirando;
  - se alejan del gigante lo justo para que queden 0,03 casillas entre sus bordes, y como mucho
    0,45 casillas desde el centro de su casilla;
  - van a 1,2 casillas por segundo como mucho, arrancando y frenando con suavidad.
- **Sin chocar:**
  - entre dos piezas siempre quedan al menos 0,03 casillas;
  - si alejarse en línea recta del gigante las lleva hacia otra pieza, prueban a desviarse hasta
    60° a cada lado;
  - en cada fotograma, una pieza solo avanza si su nueva posición respeta esa distancia con todas
    las demás, así que no pueden chocar aunque se muevan varias a la vez;
  - si no hay hueco, la pieza se queda donde ha llegado y el gigante puede rozarla.
- **Vuelta.** Cuando el gigante ya no necesita el sitio (ha pasado de largo o ha vuelto a ser
  torre), las piezas vuelven deslizándose al centro de su casilla con las mismas reglas.

## 7. Capturas cortas y brutales

Usan la cámara de cine, el congelado de impacto, las chispas y la cámara lenta del combate entre
peones. Las piezas cercanas también hacen sitio; el atacante y el defensor no se apartan. Las
batallas largas y variadas llegan en el paso siguiente.

Antes de empezar se decide qué hará cada gigante en su puesto. De sus derrumbes y provocaciones,
elige los que dejan más hueco a las piezas de alrededor; si provocar les quitaría sitio, no
provoca. A igual hueco, elige el derrumbe que menos se echa encima del arma del rival.

- **Torre come a peón:**
  1. La torre se transforma.
  2. El gigante anda hasta que su golpe alcanza al peón y lo provoca, si cabe.
  3. Golpea a cámara lenta con el puñetazo o pisotón que más alcanza sin tener que retroceder, y
     se para donde la cara del golpe toca al peón.
  4. El peón sale despedido, se le cae la lanza y se esfuma en polvo.
  5. El gigante ocupa la casilla y vuelve a ser torre.
- **Peón come a torre:**
  1. La torre se transforma y el gigante provoca, si cabe.
  2. El peón baja de su peana y le da una estocada. La lanza resbala en su mano antes de la
     estocada, para que la punta toque la piedra justo en el golpe, y después rebota.
  3. El gigante se tambalea y, 0,8 s después del golpe, se deshace en rocas y polvo.
  4. El peón anda hasta la casilla y sube a su peana.
- **Torre come a torre:**
  1. Las dos se transforman.
  2. El atacante golpea; el defensor se tambalea y, 0,8 s después del golpe, se deshace en rocas.
  3. El atacante ocupa la casilla y vuelve a ser torre.

Las distancias salen del alcance medido de cada golpe y de rayos contra la malla del rival, para
que la lanza y el puño lo toquen sin atravesarlo.

## 8. Modelos y animaciones

1. **Imágenes (Gemini, gratis):**
   - torre blanca aislada: de frente y un poco desde arriba, con su base octogonal, sin bandera
     ni mástil y con fondo gris;
   - gigante blanco: el boceto aprobado;
   - versiones negras: se editan las blancas cambiando solo los materiales y los emblemas, y las
     proporciones se miden por código;
   - banderas: el emblema de cada bando sobre una tela plana, vista de frente, para la textura
     del banderín.
2. **Tripo** (unos 220 créditos):
   - torre blanca con «Modelo HD» (55);
   - torre negra: retextura del modelo blanco (20);
   - gigante blanco: «Malla Smart» (65), textura (20) y esqueleto «v1.0 · humanoides» (20);
   - gigante negro: retextura de la malla blanca (20) y su esqueleto (20).
3. **Animaciones del gigante.** Salen de la biblioteca de Tripo y se revisan en la galería:
   reposo, andar, golpe (puñetazo o pisotón), golpe recibido, derrumbe y provocación. Cada
   gigante exporta las suyas.
4. **Optimización.** La torre, simplificada como las peanas (versión ligera para el móvil). El
   gigante, como los peones.

## 9. Arquitectura

| Fichero | Responsabilidad |
|---|---|
| `src/rules/rook.js` | Puro. `rookMoves(square, occupied, enemies) → { moves, captures }`. |
| `src/moves/room.js` | Puro. Cuerpos que piden sitio, en tramo o en abanico: dónde debe ponerse cada pieza para hacer sitio (`roomTarget`), cuánto avanza en un fotograma sin chocar (`stepRoom`) y cuánto hueco faltaría (`roomOverlap`). |
| `src/moves/crowd.js` | Cada fotograma aplica el sitio que piden los gigantes: desliza las piezas y avisa cuando todas han vuelto. Dice cuánto hueco faltaría para unos cuerpos (`overlap`). |
| `src/pieces/rook.js` | Carga la torre estática y el gigante, y crea cada torre con su banderín hecho en código. |
| `src/fx/rubble.js` | Rocas que salen despedidas o vuelan hacia la casilla, rebotan y desaparecen. |
| `src/moves/transform.js` | Transformaciones torre ⇄ gigante con el reloj de juego. |
| `src/moves/rook-mover.js` | Mover de la torre, con la misma forma que el de los peones (`placeOn`, `goTo`, `square`, `busy`). |
| `src/combat/strikes.js` | También mide el cuerpo del gigante: margen, pecho, radio al andar y alcance en abanico de cada animación. |
| `src/combat/smash.js` | Capturas cortas en las que participa una torre; elige el derrumbe y la provocación que caben. |
| `src/scene/cinema.js` | El temblor de cámara también sirve fuera del combate, sin descolocar los controles. |
| `src/main.js` | Lista `pieces` con `kind` (`pawn` o `rook`): reglas, toques y capturas según el tipo de pieza. |
| `assets/models/manifest.json` | Tipos `white-rook` y `black-rook`, con `tower` y `giant`. |

## 10. Errores

- **Sin gigante o sin sus animaciones:** la torre se desliza con polvo hasta su casilla, sin
  transformarse. En las capturas, el vencido se esfuma.
- **Error durante una transformación o una captura:** se registra en la consola y el tablero
  queda coherente: la torre visible en su casilla, las piezas apartadas de vuelta en la suya, la
  cámara restaurada y los toques desbloqueados.

## 11. Pruebas

- **Unitarias** (`node --test`):
  - movimientos y capturas de la torre, con bloqueos por piezas propias y enemigas y en los
    bordes;
  - peones con torres en medio;
  - hacer sitio:
    - las piezas se alejan lo justo y nunca más de 0,45 casillas;
    - se desvían si detrás hay otra pieza;
    - el abanico aparta a quien tiene delante, no a quien tiene al lado o detrás, y gira con el
      gigante;
    - el hueco que falta es cero si todas caben y crece si una pieza cierra el paso;
    - ningún paso deja dos piezas a menos de 0,03 casillas;
    - vuelven al centro;
  - colocación por alcance en las capturas nuevas.
- **En el navegador, por código:**
  - la torre y el gigante no se ven a la vez fuera de la transformación y, al terminar, solo
    queda la torre;
  - con los peones en la fila 2, la torre de a1 va a d1: distancia mínima entre piezas, holgura
    del gigante con los peones y todas las piezas de vuelta en su casilla;
  - las tres capturas (torre come peón, peón come torre, torre come torre), con las mismas
    medidas, el tablero coherente y la cámara restaurada; en la estocada, cuánto se hunde la
    punta en la malla del gigante.
- **En la web publicada:** carga sin errores y las jugadas de la torre funcionan.
