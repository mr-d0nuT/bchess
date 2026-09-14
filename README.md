# BChess

Homenaje 3D a *Battle Chess* (Interplay, 1988): un ajedrez en el que cada captura es una
batalla animada. Por ahora hay **peones y torres**: tablero 3D con los ocho peones de cada
bando y las cuatro torres, con esqueleto y animaciones, que se mueven según las reglas del
ajedrez.

**Jugar:** https://mr-d0nut.github.io/bchess/

Para forzar el nivel de detalle, añade `?calidad=movil` o `?calidad=ordenador` a la dirección.

## Cómo se juega (prueba)

- Toca un peón: se marca con un aro dorado y se iluminan las casillas a las que puede avanzar.
- Toca una casilla iluminada: el peón baja de su peana, anda hasta ella y la peana
  reaparece bajo sus pies.
- Si tiene un enemigo en diagonal hacia delante, aparece un aro rojo bajo el enemigo. Tócalo y
  pelearán. Unas veces es un duelo de lanzas y otras, cuerpo a cuerpo; gana el que ataca.
- Los botones **Atacar**, **Golpe** y **Caer** actúan sobre el peón elegido.
- Arrastra para girar la cámara y pellizca o usa la rueda para acercarte.

## Torres

Las torres están en las esquinas. Al elegir una se marcan sus casillas en línea recta y los enemigos
que puede comerse. Para moverse, la torre estalla en rocas y se convierte en un gigante de piedra,
que anda hasta su casilla y vuelve a ser torre. El gigante ocupa más que una casilla, así que las
piezas de alrededor se apartan deslizando su peana, sin chocar entre ellas, y vuelven a su sitio al
terminar. Las capturas con torre son cortas: el gigante aplasta de un golpe, y si un peón le da
una estocada, se derrumba en rocas.

## Desarrollo

- Servidor local sin caché: `python3 tools/dev-server.py 8741` y abrir http://127.0.0.1:8741/
- Pruebas: `npm test`
- Aligerar un modelo nuevo: `bash tools/optimize-model.sh raw/tripo/<modelo>.glb <nombre> [ratio]`
- Quedarse solo con las animaciones de un GLB: `bash tools/optimize-anims.sh raw/tripo/<modelo>.glb <nombre>`
- Dejar en un modelo con esqueleto solo algunas animaciones: `node tools/keep-anims.mjs <entrada.glb> <salida.glb> clave1,clave2`
- Comparar las proporciones de dos imágenes de referencia: `node tools/silhouette.mjs imagen.jpeg`
- Sin compilación: módulos ES con import map; Three.js r186 copiado en `vendor/three/`.
- Diseño y plan: `docs/superpowers/`.

## Créditos y licencias

- **Peones, escudos, peanas, torres y gigantes:** modelos generados con
  [Tripo AI](https://www.tripo3d.ai), plan Pro con uso comercial, a partir de imágenes de
  referencia del autor hechas con Gemini. Las telas de los banderines también son de Gemini.
- **[Three.js](https://threejs.org):** MIT.
- **HDRI `studio_small_09` y texturas `oak_veneer_01` y `rosewood_veneer1`:**
  [Poly Haven](https://polyhaven.com), CC0.
- ***Battle Chess*** es una marca de Interplay Entertainment. BChess no está afiliado a
  Interplay; solo le rinde homenaje.
