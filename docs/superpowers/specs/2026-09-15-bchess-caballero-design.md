# BChess — El caballero (diseño)

Fecha: 2026-09-15. Continúa la torre y su gigante de piedra
(`2026-09-14-bchess-torre-gigante-design.md`).

## 1. Objetivo

Como en Battle Chess, cada captura con el caballero es una batalla con gag. Decisiones del usuario:
- «Va a caballo sobre el tablero. En las batallas desmonta, o el caballo lo tira y huye, y lucha a
  pie» (diseño general, 2026-09-13).
- Se mueve con un salto de ajedrez, por encima de las piezas.
- Sus capturas son ya los gags del original con las piezas que existen (peón, torre y caballero).
- Caballo y jinete son modelos aparte.

**Éxito:** en la web publicada:
- los cuatro caballeros están a caballo en b1, g1, b8 y g8, mirando al oponente;
- saltan en L por encima de las piezas;
- cada captura en la que participa un caballero es su gag (sección 7).

Comprobado por código:
- el caballo no toca ninguna pieza al saltar;
- ni los luchadores ni lo que sale volando tocan a las piezas vecinas que tienen hueco para
  apartarse;
- la espada, la patada y el puño tocan al rival sin atravesarlo;
- el jinete sentado no se hunde en el caballo;
- al terminar cada jugada, todas las piezas están en el centro de su casilla, y un caballero
  ganador, a caballo sobre su peana.

## 2. Reglas y toques

- **Colocación.** Caballeros en b1 y g1 (blancos) y en b8 y g8 (negros), mirando al oponente.
- **Movimiento.** En L: dos casillas en una dirección y una en perpendicular. Salta por encima de
  cualquier pieza. No puede ir a una casilla con una pieza propia; si en ella hay una enemiga, se
  la come.
- **Las demás piezas.** Peones y torres pueden comerse caballeros con sus reglas, y los caballeros
  cuentan como piezas para bloquear a peones y torres.
- **Marcas y botones.** Como con la torre: puntos dorados en sus casillas y aros rojos bajo los
  enemigos que puede comerse. Atacar, Golpe y Caer siguen actuando solo sobre peones.
- **Fuera de alcance:** turnos, jaque, alfiles, damas y reyes, y los gags con esas piezas.

## 3. Las figuras

| | Caballo | Caballero |
|---|---|---|
| Qué es | Modelo con esqueleto de cuadrúpedo, sin jinete: silla, testera y gualdrapa | Modelo con esqueleto humano: armadura completa y yelmo con penacho |
| Blanco | Caballo claro, testera de plata y gualdrapa crema con el león azul | Armadura de plata y penacho blanco |
| Negro | Caballo oscuro, testera dorada y gualdrapa roja y oro con el grifo | Armadura oscura y penacho rojo |
| En el tablero | Quieto sobre su peana, con el caballero en la silla | Sentado en la silla, con la lanza y el escudo |
| En las batallas | Espera apartado o huye | A pie, con espada y escudo |

- **Aspecto.** El de las imágenes de referencia del usuario (`raw/ref/piezas_white_front.png` y
  `piezas_black_front.png`, segunda figura).
- **Peana.** La de los peones de su color, más ancha para que quepa el caballo, como pide el
  reciclaje del diseño general.
- **Altura.** La figura a caballo mide unas 1,8 casillas hasta el penacho, peana incluida; la lanza
  sobresale por encima.
- **Jinete.** Sentado en la silla con una pierna a cada lado, sujeto a ella: se mueve con el caballo.
- **Lanza con banderín.** Hecha en código: el asta y la punta de la lanza de los peones, con un
  banderín de dos puntas con el emblema de su bando, hecho con la tela de las torres.
- **Espada.** Hecha en código: hoja de acero, guarda y pomo.
- **Escudo.** El de los peones de su color.

## 4. El salto de ajedrez

1. El caballo gira hacia su destino y se encabrita sobre las patas traseras (0,4 s), mientras la
   peana encoge dentro de una nube de polvo.
2. Salta en arco hasta el centro de la casilla de destino:
   - entre sus cascos y la pieza más alta que haya bajo el camino quedan al menos 0,2 casillas, y el
     arco nunca sube menos de 0,8 casillas;
   - la duración sale de la distancia: unos 0,9 s para una L;
   - estira las patas al subir y las recoge al bajar.
3. Aterriza con un pequeño rebote, polvo y un temblor ligero de cámara. La peana vuelve a crecer bajo
   los cascos y el caballo gira hasta mirar al oponente.
4. Si el caballo necesita más sitio que su casilla, las piezas de al lado se apartan como con el
   gigante (sección 6).

## 5. Desmontar y montar

- **Cuándo.** Al empezar cada batalla en la que participa un caballero.
- **Dónde.**
  - El caballero que defiende desmonta en su casilla.
  - El que ataca antes salta con su caballo hasta la línea que lo une con el rival, a la distancia
    a la que empieza su batalla (sección 7), y desmonta allí.
- **Cómo.** Se elige al azar, con la misma probabilidad, entre:
  - **Desmonta:** salta de la silla al suelo y clava la lanza a su lado, y el caballo retrocede unos
    pasos, lejos de la pelea, y espera.
  - **El caballo lo tira:** se encabrita, el caballero cae sentado entre polvo y estrellitas y se
    levanta, la lanza sale volando y desaparece, y el caballo huye andando deprisa hacia el borde
    más cercano del tablero y desaparece tras él.
- **Al ganar:**
  1. El caballero entra en la casilla conquistada.
  2. El caballo se reúne con él de un salto. Si había huido, vuelve desde el borde del tablero.
  3. El caballero monta de un salto y recoge la lanza. Si salió volando, le aparece en la mano con
     un poco de polvo.
  4. La peana crece bajo los cascos.
- **Al perder:** el caballo que esperaba huye asustado hacia el borde del tablero.

## 6. Hacer sitio

Como en la torre (sección 6 de su diseño), con las mismas reglas para las piezas que se apartan.
Piden sitio:
- el caballo al aterrizar y mientras anda para huir o volver, con el tramo que tiene por delante;
- los luchadores de cada batalla, con el abanico de lo que van a hacer en su puesto, y lo que sale
  volando (brazos, piernas, lanza y espada) mientras está en el tablero.

## 7. Las cinco batallas

Todas usan la cámara de cine, la cámara lenta con congelado de impacto, las chispas, el temblor y las
estrellitas de las capturas anteriores. Gana siempre el atacante. Nunca hay sangre: la armadura está
hueca y lo que salta son piezas de metal. La espada, la patada y los puños buscan la malla del rival
con rayos, como la lanza y el puño del gigante, para tocarlo sin atravesarlo.

- **Peón come caballero: patada en la entrepierna** (unos 8 s)
  1. El caballero desmonta o su caballo lo tira; desenvaina y se pone en guardia.
  2. El peón baja de su peana y se acerca, y el caballero levanta la espada para golpearle.
  3. A cámara lenta, el peón le da una patada en la entrepierna. Suena a metal, al caballero se le
     juntan las rodillas, suelta la espada y cae de bruces con estrellitas.
  4. Desaparece en polvo, su caballo huye si seguía allí, y el peón ocupa la casilla, sube a su
     peana y lo celebra.
- **Caballero come peón: lo atraviesa con la espada** (unos 8 s)
  1. El caballero salta hasta el peón y desmonta.
  2. El peón le tira una estocada y él la para con el escudo, entre chispas.
  3. Le mete la espada por debajo del brazo y la punta asoma por la espalda. El peón se queda tieso
     y mira la hoja; al sacarla, cae redondo con estrellitas y desaparece en polvo.
  4. El caballero ocupa la casilla, el caballo se reúne con él y monta.
- **Caballero come caballero: el Caballero Negro de los Monty Python** (unos 15 s)
  1. Los dos desmontan y cruzan un par de golpes parados, con chispas.
  2. El atacante le corta el brazo de la espada, que sale volando y rebota por el tablero con ruido
     de metal. El otro mira el muñón y sigue peleando con el escudo.
  3. Le corta el otro brazo, recibe una patada y le corta una pierna y después la otra. Queda un
     tronco en el suelo que aún le planta cara, con un bocadillo de cómic: «¡Solo es un rasguño!».
  4. El atacante le da un toquecito en el yelmo; cae y desaparece en polvo junto con sus piezas. El
     ganador ocupa la casilla y monta.
- **Caballero come torre: le barre las piernas** (unos 9 s)
  1. El caballero salta hasta la torre y desmonta. La torre se convierte en gigante y lo provoca, si
     cabe.
  2. El gigante descarga un puñetazo; el caballero lo esquiva agachándose y le barre las piernas de
     un tajo.
  3. A cámara lenta, el gigante cae de espaldas y se deshace en rocas, con una gran nube de polvo y
     temblor.
  4. El caballero ocupa la casilla, el caballo se reúne con él y monta.
- **Torre come caballero: un casco con pies** (unos 9 s)
  1. La torre se convierte en gigante y avanza. El caballero desmonta, o su caballo lo tira y huye
     aterrado.
  2. El caballero se pone en guardia, temblando.
  3. A cámara lenta, el gigante lo aplasta con los dos puños: el cuerpo se le mete dentro de las
     piernas y solo quedan el yelmo, con su penacho, encima de las botas.
  4. El casco con pies se tambalea mareado con estrellitas, da unos pasitos y desaparece en polvo.
     El gigante ocupa la casilla y vuelve a ser torre.

Cómo se hacen las partes difíciles:
- **Cortar brazos y piernas.** El hueso de esa extremidad encoge hasta que el trozo desaparece, y sale
  volando una copia rígida de esa pieza de armadura, sacada de la propia malla del caballero (los
  triángulos que mueve ese hueso). Rebota por el tablero y desaparece con el vencido.
- **Casco con pies.** Los huesos del tronco encogen hasta que el yelmo queda apoyado en las botas.
- **Bocadillo de cómic.** Un globo con el texto sobre la escena, que sigue al tronco durante 1,5 s.
- **Movimientos.** Los tajos, paradas, patadas, golpes recibidos y caídas salen de la biblioteca de
  Tripo. Lo que no exista (agacharse para esquivar, juntar las rodillas, encabritarse, el salto del
  caballo) se hace en código.

## 8. Modelos y animaciones

1. **Imágenes (Gemini, gratis).** A partir del recorte del caballero blanco de la referencia:
   - el caballero a pie, de frente y en pose A, sin caballo, lanza ni escudo, con fondo gris;
   - el caballo solo, con silla, testera y gualdrapa, sin jinete, visto de lado y un poco de frente;
   - las versiones negras: se editan las blancas cambiando solo los materiales y los emblemas, y las
     proporciones se miden por código.
2. **Tripo** (unos 230 créditos; quedan 2.650):
   - caballero blanco: modelo, textura y esqueleto «v1.0 · humanoides»;
   - caballo blanco: modelo, textura y esqueleto de cuadrúpedo «v2.5 · animales»;
   - versiones negras: retextura de los modelos blancos, que conservan su esqueleto.
3. **Animaciones.** Se revisan en la galería antes de aplicarlas y exportarlas:
   - caballero: reposo, andar, salto, tajos, parada con escudo, patadas, golpes recibidos, caídas,
     provocación y victoria;
   - caballo: andar.
4. **Optimización.** Como los peones: versión de ordenador y versión ligera de móvil.

## 9. Arquitectura

| Fichero | Responsabilidad |
|---|---|
| `src/rules/knight.js` | Puro. `knightMoves(square, occupied, enemies) → { moves, captures }`. |
| `src/moves/leap.js` | Puro. Altura y duración del arco del salto según las piezas que hay bajo el camino, y posición en cada instante. |
| `src/pieces/knight.js` | Carga el caballo y el caballero; crea cada caballero con el jinete sentado y la lanza, la espada y el escudo enganchados. |
| `src/moves/knight-mover.js` | Mover del caballero, con la misma forma que los demás (`placeOn`, `goTo`, `square`, `busy`): saltar, desmontar, montar y que el caballo huya o vuelva. |
| `src/pieces/limbs.js` | Separa extremidades en piezas rígidas y encoge huesos (cortar brazos y piernas, casco con pies). |
| `src/ui/bubble.js` | Bocadillo de cómic que sigue a un punto de la escena. |
| `src/combat/fight.js` | Lo que comparten las capturas con gag: cámara lenta, sitio en abanico y rayos de contacto. Sale de `smash.js`, que ha crecido mucho. |
| `src/combat/knight/*.js` | Una batalla por fichero. |
| `src/combat/smash.js` | Las capturas cortas de la torre, ya con `fight.js`. |
| `src/main.js` | Tipo de pieza `knight`: reglas, marcas y qué batalla lanza cada captura. |
| `assets/models/manifest.json` | Tipos `white-knight` y `black-knight`, con `horse` y `rider`. |

## 10. Errores

- **Sin caballo:** el caballero va a pie sobre su peana, como un peón, y salta igual; las batallas
  empiezan ya desmontado.
- **Sin caballero o sin sus animaciones:** en sus capturas, el vencido se esfuma y el ganador va a su
  casilla, como las capturas sin combate.
- **Error durante un salto o una batalla:** se registra en la consola y el tablero queda coherente:
  las piezas en su casilla, el ganador a caballo, la cámara restaurada y los toques desbloqueados.

## 11. Pruebas

- **Unitarias** (`node --test`):
  - saltos en L desde el centro, los bordes y las esquinas, sin salirse del tablero;
  - piezas propias que bloquean la casilla de llegada y capturas de enemigos;
  - peones y torres que se comen caballeros o quedan bloqueados por ellos;
  - altura del arco: deja el hueco mínimo sobre la pieza más alta del camino y respeta la altura
    mínima.
- **En el navegador, por código:**
  - salto: ni el caballo ni el jinete tocan ninguna pieza, el jinete no se hunde en el caballo y
    todo acaba en su casilla;
  - las cinco batallas, con lo que ya se mide en las capturas de la torre (hueco, holgura, apartado,
    tablero coherente, cámara restaurada) y además:
    - cuánto se hunde en el rival cada golpe;
    - cuántos trozos se cortan en el gag de los Monty Python y que desaparecen al acabar;
    - que en el casco con pies el yelmo queda sobre las botas.
- **En la web publicada:** carga sin errores, los caballeros saltan y una batalla con gag funciona.
