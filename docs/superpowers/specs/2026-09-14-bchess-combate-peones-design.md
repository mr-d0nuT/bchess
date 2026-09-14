# BChess — Combate entre peones (diseño)

Fecha: 2026-09-14. Continúa la prueba del peón
(`2026-09-13-bchess-prueba-peon-design.md`), ya con los dos bandos en el tablero.

## 1. Objetivo

Cuando un peón se come a otro, se desarrolla un combate animado entre los dos. Lo pidió el
usuario: «esto debe ser de lo más vistoso», **variado**, a veces duelo de lanzas y a veces
cuerpo a cuerpo.

**Éxito:** en la web publicada, comer un peón lanza un combate que el usuario ve vistoso y
distinto cada vez. Cumple estas condiciones, comprobadas por código:
- ninguna parte de los luchadores (cuerpo, lanza o escudo) toca a las piezas vecinas;
- la lanza no atraviesa al rival ni se hunde en el suelo;
- cada golpe coincide con la reacción del otro.

## 2. Reglas y toques

- **Capturas.** Un peón puede comerse a un peón enemigo que esté en diagonal hacia delante: la
  fila siguiente en su sentido de avance, una columna a izquierda o derecha.
- **Qué se marca.** Al elegir un peón:
  - los puntos dorados de siempre señalan sus casillas de avance;
  - un **aro rojo** bajo la peana señala cada enemigo que puede comerse.
- **Empezar el combate.** Se toca un enemigo marcado, en su zona de toque o en su casilla.
  Tocar un peón propio lo elige, como hasta ahora.
- **Resultado.** Gana siempre el atacante, como en el ajedrez y en Battle Chess, pero el
  defensor puede devolver un golpe antes de caer.
- **Mientras dura:**
  - se ignoran los toques y los botones;
  - no hay gestos especiales;
  - la cámara no responde al usuario.
- **Al terminar:**
  - el vencido desaparece del tablero y deja de contar para las reglas;
  - el ganador queda en la casilla conquistada, elegido y con sus nuevas marcas.
- **Fuera de alcance:** comer al paso, coronar, turnos y otras piezas.

## 3. Dos estilos

Se elige uno al azar, sin repetir el del combate anterior.

| | Duelo de lanzas | Cuerpo a cuerpo |
|---|---|---|
| Colocación | Cada uno baja de su peana en su casilla. El atacante se retira 0,3 casillas hacia atrás dentro de la suya. Separación: 1,71. | El defensor baja en su casilla. El atacante baja y anda hasta quedar a 0,9 del defensor. |
| Lanza | En estocada. Resbala en la mano lo justo para que la punta se quede en el pecho del rival (0,17 por delante de su centro) en el instante del impacto. | Erguida todo el combate. |
| Golpes | Estocadas: `box_01`, `box_03` y `box_02`. | Golpes de escudo y puñetazos (las mismas animaciones de boxeo, midiendo la mano que más llega) y patada `front_kick_02`. |

Medidas en el peón blanco y el negro (casi iguales):
- **Punta de la lanza en estocada:** llega a 2,17–2,44 casillas por delante.
- **Mano izquierda (escudo) en `box_01` y `box_03`:** 0,68–0,80.
- **Mano derecha en `box_02`:** 0,68.
- **Pie en `front_kick_02`:** 0,78.

El programa no usa estos números fijos: los mide al cargar cada tipo de pieza (sección 7).

## 4. Coreografía

1. **Preparación.**
   - La cámara de cine encuadra a los dos (sección 6).
   - El atacante gira hacia el defensor y hace una **provocación** si tiene esa animación.
   - El defensor, la mitad de las veces, se asusta (`frightened`).
   - Los dos bajan de sus peanas: la peana encoge y desaparece con polvo mientras la figura
     baja al tablero en su sitio.
   - Cada uno se coloca en su puesto (sección 3) y mira al otro.
2. **Intercambios.** Hay 1 o 2 al azar.
   - El primero es siempre del atacante.
   - El segundo, si lo hay, es un contraataque del defensor.
   - Cada intercambio consiste en:
     1. Quien ataca empieza un golpe del estilo, elegido al azar sin repetir el anterior.
     2. **En el instante del impacto:**
        - quien lo recibe empieza una reacción al azar (`hit_to_head`, `hit_to_stomach` o
          `hit_to_body_01`);
        - aparece el efecto de impacto en el punto del golpe;
        - la imagen se congela 0,08 s;
        - la cámara tiembla.
     3. Los dos vuelven a guardia (reposo) antes del siguiente.
3. **Golpe final** del atacante.
   - **Cámara lenta:** el tiempo va a 0,3 desde 0,35 s antes del impacto hasta 0,4 s después.
   - **En el impacto:**
     - destello blanco en pantalla y el efecto de impacto más grande;
     - el defensor sale despedido 0,2 casillas hacia atrás mientras hace la **derrota** (o la
       caída `fall` si no la tiene).
   - **Límite:** entre el empujón y la caída, el defensor no pasa de 0,5 casillas del centro
     de su casilla.
4. **K.O.**
   - Estrellitas girando sobre la cabeza del vencido durante 1,2 s.
   - Después encoge hasta desaparecer en 0,5 s dentro de una gran nube de polvo.
5. **Victoria.**
   - El ganador anda hasta el centro de la casilla conquistada.
   - La peana aparece bajo sus pies con polvo, lo sube y lo gira mirando al oponente.
   - Hace una **celebración** si la tiene. Si no, dos saltitos de alegría hechos en código.
   - Su peana original ya desapareció al bajar, en la preparación.

## 5. Efectos visuales

- **Impacto:**
  - estrella de destello de dibujos animados que crece y se desvanece en 0,25 s;
  - chispas que salen despedidas con gravedad.
  Todo son sprites con texturas dibujadas en un canvas, sin imágenes externas.
- **Congelado de impacto:** los mezcladores de animación de los dos luchadores se detienen
  0,08 s.
- **Temblor de cámara:** desplazamiento aleatorio que decae en 0,3 s. Es mayor en el golpe
  final.
- **Cámara lenta:** un reloj de combate con escala de tiempo. Mueve las animaciones de los
  dos luchadores, las esperas del combate y los efectos.
- **Destello blanco:** una capa HTML sobre el lienzo que se enciende y se apaga en 0,3 s.
- **Estrellitas de K.O.:** tres estrellas en órbita sobre la cabeza.
- **Polvo:** el de siempre, con más partículas y más radio para desaparecer.

## 6. Cámara de cine

- **Encuadre:**
  - apunta al punto medio entre los luchadores, a 0,7 de altura;
  - se coloca de lado, perpendicular a la línea del combate, por el lado más cercano a la
    cámara actual;
  - la distancia hace que quepan los dos con margen.
- **Transiciones:** entra en 0,8 s con aceleración suave, sin mover los controles del
  usuario. Al terminar vuelve en 0,8 s a la posición y el objetivo que tenía el usuario.

## 7. Arquitectura

| Fichero | Responsabilidad |
|---|---|
| `src/rules/pawn.js` | `pawnCaptures(square, enemies, color)`: casillas que puede comer. Puro. |
| `src/scene/highlights.js` | `showCaptures(squares)`: aros rojos. `clear()` también los quita. |
| `src/combat/plan.js` | Puro: `pickStyle`, `fightSpots` (puestos y orientaciones), `gripSlideForReach`, `planExchanges` (1–2, quién ataca y con qué versión), `peak` (máximo de una serie de muestras). |
| `src/combat/clock.js` | Puro: reloj de combate con `timeScale`, `tick(dt)`, `wait(s)` y `tween(s, paso)`. |
| `src/combat/strikes.js` | `measureStrikes(kit, spawnPiece)`. Simula una vez por tipo de pieza cada versión de ataque. Guarda cuándo llega al máximo y hasta dónde llegan la punta de la lanza y la mano o el pie que más avanzan. |
| `src/combat/duel.js` | Director: `runCombat({ attacker, defender, board, stage, clock, fx, dust, style })` ejecuta la coreografía y resuelve al terminar. `attacker` y `defender` son peones `{ color, piece, mover }`. |
| `src/fx/impact.js` | Destellos, chispas y estrellitas de K.O. |
| `src/scene/cinema.js` | Encuadre, temblor y vuelta de la cámara. |
| `src/pieces/piece.js` | `play` puede forzar una versión concreta. Añade la postura de lanza impuesta por el combate, el deslizamiento extra de la lanza en la mano y la escala de tiempo o pausa del mezclador. |
| `src/moves/sequence.js` | `descend()`: bajar de la peana en el sitio. `walkOnto(square)`: andar desde donde está y subir a la peana en la casilla. |
| `src/main.js` | Marcas de captura, toque sobre un enemigo, reloj de combate en el bucle y retirada del vencido. |
| `src/ui/hud.js`, `src/ui/style.css` | Capa del destello blanco. |
| `assets/models/manifest.json` | Acciones nuevas `taunt`, `victory` y `defeat`, con sus ficheros de animación. |

## 8. Animaciones nuevas (Tripo, sin créditos)

- **Candidatas de la biblioteca:**
  - provocación: `angry_01`, `angry_02`, `angry_03`, `fold_arms`;
  - celebración: `cheer`, `clap`, `laugh_01`, `laugh_02`;
  - derrota: `defeat_02`, `defeat_03`;
  - reacciones extra: `hit_to_side`, `hit_to_body_02`.
- **Proceso:**
  1. Aplicarlas a cada esqueleto.
  2. Exportarlas marcando solo esas.
  3. Revisarlas en `tools/anim-gallery.html`. Tienen que ser cómicas y exageradas, y el
     cuerpo no puede salir de su casilla (se miden los desplazamientos de cadera).
  4. Las elegidas se guardan como GLB solo de animaciones con `tools/optimize-anims.sh`.
- **Si una acción no tiene animación**, el combate usa la alternativa de la sección 4.

## 9. Errores

- **Sin animaciones de ataque, golpe o caída:** la captura no tiene combate. El vencido
  desaparece en una nube de polvo y el ganador anda a la casilla.
- **Error durante el combate:** se registra en la consola y el tablero queda coherente. El
  vencido se retira y el ganador ocupa la casilla, con la cámara restaurada y los toques
  desbloqueados.

## 10. Pruebas

- **Unitarias** (`node --test`):
  - capturas de los dos colores, en los bordes del tablero y sin enemigos;
  - `pickStyle` sin repetir;
  - `fightSpots` para los dos estilos y las cuatro diagonales;
  - `gripSlideForReach`;
  - `planExchanges`;
  - `peak`;
  - el reloj con escala de tiempo, esperas y tweens.
- **En el navegador, por código, con combates simulados de los dos estilos:**
  - separación entre luchadores y distancia a las peanas vecinas;
  - hueco entre la lanza y el suelo;
  - la punta de la lanza no pasa del pecho del rival;
  - el vencido no sale de su casilla;
  - la reacción empieza en el impacto medido;
  - al terminar, 15 peones, el ganador en la casilla y la cámara restaurada.
- **En la web publicada:** carga sin errores y el combate funciona.
