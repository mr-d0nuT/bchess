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
- cuando comen o las comen hay un golpe corto y brutal.

Comprobado por código:
- el gigante no toca a las piezas vecinas, ni al andar ni al pelear;
- la torre y el gigante no se ven a la vez salvo durante la transformación;
- al terminar cada jugada el tablero queda coherente, con la torre visible en su casilla.

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
| Bandera | Hecha en código: tela que ondea con el emblema (león azul o grifo dorado), recortado de las imágenes de los escudos | La del modelo, clavada en la espalda |

- **Peana.** La torre no lleva la peana de madera de los peones: su base de piedra ya lo es,
  como en la imagen de referencia.
- **Aspecto del gigante blanco.** El del boceto aprobado (`raw/ref/gigante-blanco.jpeg`): un
  gólem bonachón de sillares crema. La cabeza es un torreón almenado con cara, las hombreras son
  torrecillas y tiene manos enormes.
- **Aspecto del gigante negro.** El mismo con los materiales de la torre negra: piedra oscura,
  bandas doradas, ventanas rojas y bandera roja con el grifo dorado.

## 4. La transformación

**De torre a gigante** (1,2 s):
1. La torre tiembla durante 0,4 s, cada vez más, con polvo en la base.
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
   medida, como con los peones.
3. Transformación de gigante a torre en la casilla de destino.

## 6. Capturas cortas y brutales

Usan la cámara de cine, el congelado de impacto, las chispas y la cámara lenta del combate entre
peones. Las batallas largas y variadas llegan en el paso siguiente.

- **Torre come a peón:**
  1. La torre se transforma.
  2. El gigante anda hasta que su golpe alcanza al peón y lo provoca, si tiene provocación.
  3. Golpea a cámara lenta con el puñetazo o pisotón que más alcanza.
  4. El peón sale despedido, se le cae la lanza y se esfuma en polvo.
  5. El gigante ocupa la casilla y vuelve a ser torre.
- **Peón come a torre:**
  1. La torre se transforma.
  2. El peón baja de su peana y le da una estocada, con el alcance medido como en el duelo.
  3. El gigante hace su derrumbe y se deshace en rocas y polvo.
  4. El peón anda hasta la casilla y sube a su peana.
- **Torre come a torre:**
  1. Las dos se transforman.
  2. El atacante golpea y el defensor se derrumba en rocas.
  3. El atacante ocupa la casilla y vuelve a ser torre.

Las distancias salen del alcance medido de cada golpe, como en el combate entre peones.

## 7. Modelos y animaciones

1. **Imágenes (Gemini, gratis).**
   - Torre blanca aislada: vista de frente y un poco desde arriba, con su base octogonal y
     fondo gris.
   - Gigante blanco: el boceto aprobado.
   - Versiones negras: se editan las blancas cambiando solo los materiales y los emblemas, y
     las proporciones se miden por código.
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

## 8. Arquitectura

| Fichero | Responsabilidad |
|---|---|
| `src/rules/rook.js` | Puro. `rookMoves(square, occupied, enemies) → { moves, captures }`. |
| `src/pieces/tower.js` | Carga la torre estática y crea cada una con su bandera hecha en código. |
| `src/fx/rubble.js` | Rocas que salen despedidas, rebotan y desaparecen. |
| `src/moves/transform.js` | Transformaciones torre ⇄ gigante con el reloj de juego. |
| `src/moves/rook-mover.js` | Mover de la torre, con la misma forma que el de los peones (`placeOn`, `goTo`, `square`, `busy`). |
| `src/combat/smash.js` | Capturas cortas en las que participa una torre. |
| `src/main.js` | Lista `pieces` con `kind` (`pawn` o `rook`), reglas y capturas según el tipo de pieza. |
| `assets/models/manifest.json` | Tipos `white-rook` y `black-rook`, con `tower` y `giant`. |

## 9. Errores

- **Sin gigante o sin sus animaciones:** la torre se desliza con polvo hasta su casilla, sin
  transformarse. En las capturas, el vencido se esfuma.
- **Error durante una transformación o una captura:** se registra en la consola y el tablero
  queda coherente, con la torre visible en su casilla, la cámara restaurada y los toques
  desbloqueados.

## 10. Pruebas

- **Unitarias** (`node --test`):
  - movimientos y capturas de la torre, con bloqueos por piezas propias y enemigas y en los
    bordes;
  - peones con torres en medio;
  - colocación por alcance en las capturas nuevas.
- **En el navegador, por código:**
  - la torre y el gigante no se ven a la vez fuera de la transformación y, al terminar, solo
    queda la torre;
  - el gigante no toca piezas vecinas al andar junto a una columna llena;
  - las tres capturas (torre come peón, peón come torre, torre come torre) dejan el tablero
    coherente y la cámara restaurada.
- **En la web publicada:** carga sin errores y las jugadas de la torre funcionan.
