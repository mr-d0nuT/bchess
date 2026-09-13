# BChess

Homenaje 3D a *Battle Chess* (Interplay, 1988): un ajedrez en el que cada captura es una
batalla animada. Esta es la **prueba del peón**: tablero 3D y ocho peones blancos con
esqueleto y animaciones que avanzan según las reglas del ajedrez.

**Jugar:** https://mr-d0nut.github.io/bchess/

Para forzar el nivel de detalle, añade `?calidad=movil` o `?calidad=ordenador` a la dirección.

## Cómo se juega (prueba)

- Toca un peón: se marca con un aro dorado y se iluminan las casillas a las que puede avanzar.
- Toca una casilla iluminada: el peón baja de su peana, anda hasta ella y la peana
  reaparece bajo sus pies.
- Los botones **Atacar**, **Golpe** y **Caer** actúan sobre el peón elegido.
- Arrastra para girar la cámara y pellizca o usa la rueda para acercarte.

## Desarrollo

- Servidor local sin caché: `python3 tools/dev-server.py 8741` y abrir http://127.0.0.1:8741/
- Pruebas: `npm test`
- Aligerar un modelo nuevo: `bash tools/optimize-model.sh raw/tripo/<modelo>.glb <nombre> [ratio]`
- Sin compilación: módulos ES con import map; Three.js r186 copiado en `vendor/three/`.
- Diseño y plan: `docs/superpowers/`.

## Créditos y licencias

- **Peón, escudo y peana:** modelos generados con [Tripo AI](https://www.tripo3d.ai), plan
  Pro con uso comercial, a partir de imágenes de referencia del autor hechas con Gemini.
- **[Three.js](https://threejs.org):** MIT.
- **HDRI `studio_small_09` y texturas `oak_veneer_01` y `rosewood_veneer1`:**
  [Poly Haven](https://polyhaven.com), CC0.
- ***Battle Chess*** es una marca de Interplay Entertainment. BChess no está afiliado a
  Interplay; solo le rinde homenaje.
