# BChess — Plan de mejora integral

Iremos punto por punto: basta con decir «haz el 3». Cada punto dice qué es, por qué merece la
pena, cómo se haría y cuánto cuesta (S: una sesión; M: varias; L: grande, por partes).

**Dónde estamos (30/9/2026).** Ajedrez completo con reglas, CPU de nivel 1 a 100, relojes,
deshacer, 7 idiomas, menú, música, pantalla completa. Combates con gag para casi todas las parejas
de piezas, cámara de cine y efectos. Lo que falta, sobre todo, es sonido, comodidad en una partida
entera y un final a la altura.

---

## Fase 1 — Lo que más se nota ya (y protege lo hecho)

### 1. Saltar combates · S–M · ✔ hecho
**Qué:** tocar la pantalla durante un combate lo acelera, y un segundo toque lo salta. En ajustes:
combates *siempre*, *solo la primera vez de cada tipo* o *nunca* (captura rápida).
**Por qué:** una partida tiene 15–30 capturas y cada combate dura de 10 a 50 segundos. La tercera
vez que ves el mismo, se hace largo.
**Cómo:** el reloj del combate ya lo controla todo. Para acelerar se sube su velocidad y para saltar
se termina el combate dejando las piezas en su sitio.

### 2. Efectos de sonido · M · ✔ hecho
**Hecho:** efectos en todos los combates (espadas, escudo, casco, cortes, puñetazos, caídas, bomba,
magia de hielo, fuego y rayo, piedra, relincho); pasos que suenan al posar cada pie (madera, armadura,
piedra del gigante, cascos del caballo), más flojos cuanto más lejos; tocar pieza, reloj (y el tic de
los diez últimos segundos), botones, jaque, final (fanfarria, trombón triste o tablas), coronación y la
torre que se transforma. En la configuración, música y efectos con su interruptor y su volumen, y
vibración en los golpes fuertes donde el navegador deja (Android; el iPhone no deja a las webs).
**Qué:** pasos, galope, choques de metal, lanzazos, espadazos, magia (hielo, fuego, rayo),
explosiones, caídas, rocas, el reloj de ajedrez y los botones. Volumen de música y de efectos por
separado en ajustes. Y vibración del móvil en los golpes fuertes.
**Por qué:** la mitad de la gracia de Battle Chess era cómo sonaba. Hoy solo suena la música.
**Cómo:** se prepara ya el sistema y se engancha a los momentos que ya existen (cada golpe tiene su
instante exacto). Llevará sonidos provisionales hasta que lleguen tus WAV. Funcionará en el iPhone,
que es el más exigente con el sonido.
**Depende de:** tus WAV para el sonido definitivo; el sistema no los necesita para empezar.

### 3. Carga rápida y juego sin conexión · S–M · ✔ hecho
**Hecho (5/10/2026):** `sw.js` guarda en el aparato todo lo que la web va pidiendo; desde la segunda
visita carga al instante y funciona sin cobertura (salvo lo online). El código se pregunta siempre a la
web por detrás, y si ha cambiado, el menú avisa: «Hay una versión nueva del juego · Actualizar». En
local solo se activa con `?sw`.
**Qué:** tras la primera visita, el juego queda guardado en el móvil. Las siguientes veces carga al
instante y funciona aunque no haya cobertura.
**Por qué:** hoy baja unos 18 MB de figuras más la música cada vez que el navegador borra su caché.
**Cómo:** un pequeño programa que el navegador guarda junto a la web y que sirve los ficheros desde
el móvil (lo que se llama «service worker»), con aviso cuando hay versión nueva.

### 4. Guardar y reanudar la partida · S · ✔ hecho
**Qué:** si cierras la app o se apaga el móvil, al volver la partida sigue donde estaba, con los
relojes.
**Cómo:** se guarda la lista de jugadas en el propio navegador tras cada jugada y, al abrir, se ofrece
«Continuar partida».

### 5. Red de seguridad · M · ✔ hecho
**Qué:** una prueba automática que juega en segundo plano todos los combates (cada pareja de piezas)
y avisa si alguno falla o se queda colgado.
**Por qué:** dos fallos míos lo justifican. Uno dejó un rato sin combates a todo lo que no fuera
peones; el otro (la lanza del jinete en vertical) llegó a publicarse. Con esto, antes de publicar se
ve si algo se ha roto.

## Fase 2 — Espectáculo

### 6. Jaque mate de película · M · ✔ hecho
**Hecho (5/10/2026):** golpe de orquesta y la cámara a la cara del rey vencido (lo que lo tape se apaga,
como en los combates); se le cae el báculo, que vuelca y rebota contra el tablero hacia donde no hay
piezas, y él cae de rodillas, hundido, respirando hondo. Luego fanfarria (o trombón triste si ha ganado la
CPU), la cámara sube y lo rodea, llueve confeti de los colores del bando que gana y estallan fuegos
artificiales; y plano general desde detrás del ejército ganador, que lo celebra: el rey voltea el báculo y
lo alza, la reina levanta los brazos, los demás hacen su animación de victoria y las torres disparan
cohetes. El cartel del final sale abajo, con la fiesta detrás; un toque lo saca antes.
**Qué:** al dar mate, el rey vencido suelta el báculo y cae de rodillas. Las piezas del ganador lo
celebran, suena una fanfarria, la cámara da una vuelta y caen confeti o chispas del color del bando.
**Por qué:** ahora el final es un cartel. Es el momento más importante de la partida.

### 7. Coronación espectacular · S–M · ✔ hecho
**Hecho (5/10/2026):** la cámara se queda cerca del peón al llegar y lo mira desde abajo; brota una columna
de luz dorada y el peón sube dentro girando cada vez más deprisa, entre chispas; arriba, un fogonazo y ya es
la pieza elegida, que frena, baja despacio a su casilla mientras la luz se apaga y hace su pose (la reina
alza los brazos, el alfil y el caballero hacen su victoria, la torre dispara un cohete desde sus almenas).
**Qué:** el peón que llega al final se eleva en una columna de luz, se transforma en la pieza
elegida y hace su pose. Hoy desaparece entre chispas y aparece la nueva.

### 8. Más variedad de combates · L (por partes)
**Qué:** un segundo gag para las parejas que solo tienen uno, empezando por las capturas más
frecuentes. Hoy tienen un único combate:
- el alfil, la torre, la reina y el rey cuando atacan (a cualquiera);
- el caballero contra el caballero, el alfil, la torre y la reina;
- el peón contra la torre.
**Por qué:** ver siempre el mismo combate para la misma pareja cansa.
**Cómo:** uno por sesión, diseñado contigo antes de hacerlo.

### 9. Público · M · ✔ hecho (primera parte)
**Hecho (6/10/2026):** al acabar cada combate (no en las capturas rápidas), las piezas que lo han visto de
cerca reaccionan, tres de cada cuatro veces: una o dos del bando que gana dan saltitos de alegría (la primera
lo grita: ¡yahoo!, o la risa de villano de las negras) y una del que pierde se lamenta («ooooh…») con un
gesto. Sin estorbar: la que tenga que moverse para entonces no reacciona. Falta lo de durante el combate
(asustarse, taparse los ojos): ahí las demás están translúcidas para no tapar la escena, y habría que decidir
contigo si alguna se queda a la vista.
**Qué:** las piezas cercanas reaccionan al combate: se asustan si pasa algo cerca, aplauden al
ganador de su bando, se tapan los ojos…

### 10. Pantalla final con resumen · S · ✔ hecho
**Hecho (6/10/2026):** el cartel del final enseña cómo cambia la puntuación (la cifra contando hasta la nueva,
con la diferencia en verde o rojo) y el resumen: jugadas, piezas comidas, duración y combates vistos.
**Qué:** al acabar, jugadas, capturas, tiempo y combates vistos, con Revancha y Menú.

## Fase 3 — Comodidad de partida

### 11. Historial y piezas capturadas · S–M · ✔ hecho
**Hecho (5/10/2026):** botón de lista arriba, que abre un panel plegable (se acuerda de cómo estaba) con
las jugadas en notación con figuritas en vez de letras (♘f3, ♕xd7+: igual en los siete idiomas) y lo que
ha comido cada bando con la ventaja de material. Tocar una jugada la señala en el tablero con una flecha
dorada que se apaga sola.
**Qué:** un panel plegable con la lista de jugadas y las piezas comidas por cada bando, con la
ventaja de material (+3, −1…).

### 12. Rendirse y ofrecer tablas · S · rendirse ✔ hecho
**Hecho:** la bandera blanca, en cualquier partida (online, contra la CPU y uno contra uno). Falta
ofrecer tablas.
**Qué:** botones en ajustes. Contra la CPU, esta acepta las tablas o no según cómo vaya la partida.

### 13. Pista · S · ✔ hecho
**Hecho (5/10/2026):** botón de bombilla con un globo que dice cuántas quedan (tres por partida, contra la
CPU o uno contra uno; online no, que sería hacer trampa). La CPU piensa a nivel alto la jugada del que mueve
y la marca con la flecha dorada, con la pieza ya elegida: solo falta tocar adónde va.
**Qué:** la CPU te sugiere una jugada y la marca en el tablero, con un número limitado de pistas por
partida.

### 14. Última jugada, discreta · S · ✔ hecho
**Hecho (5/10/2026):** una flecha fina y tenue, de color marfil, de la casilla de salida a la de llegada de
la última jugada, que se queda hasta la siguiente. Sin teñir ninguna casilla.
**Qué:** una marca suave para ver qué se movió (por ejemplo, un rastro tenue entre las dos casillas),
nada parecido al tinte amarillo que se quitó.

### 15. CPU contra CPU · S · ✔ hecho
**Hecho (6/10/2026):** en «1 contra CPU», una cuarta opción en «Tus piezas»: «Mirar». La CPU juega con las
dos, al nivel elegido, y se ven todos los combates. Sin rendirse ni pistas, no cuenta para la puntuación y no
pisa la partida guardada que hubiera.
**Qué:** un modo para ver una partida entera de combates sin jugar (estaba en las decisiones del
principio).

## Fase 4 — CPU y rendimiento

### 16. Niveles de la CPU más humanos · M · ✔ hecho
**Hecho (5/10/2026):** ya no mueve nunca a lo loco. Por debajo del nivel 60 puntúa todas sus jugadas y elige
como una persona: casi siempre una buena, a menudo una algo peor y, cuanto más bajo el nivel, más a menudo un
error de verdad (dejarse un peón o una pieza). Y abre con un libro de 32 aperturas reales (española,
italiana, siciliana, francesa, Caro-Kann, gambito de dama, india de rey, nimzoindia, inglesa…), elegidas al
azar según lo que se juegan; el principiante se sale del libro enseguida y el nivel alto lo sigue hasta 16
jugadas.
**Qué:** en los niveles bajos, fallos creíbles (no jugadas al azar), y aperturas variadas para que
no empiece siempre igual.

### 17. Calidad automática · M · ✔ hecho
**Hecho (5/10/2026):** si el aparato baja de 45 fotogramas por segundo un par de segundos seguidos, baja un
escalón (primero la resolución, luego el detalle de las sombras); si va a 56 o más durante 8 s, sube uno, sin
pasar nunca de la calidad de partida. Tras bajar tarda en volver a subir, para no estar subiendo y bajando
en cada combate.
**Qué:** si el móvil va justo, el juego baja solo sombras, resolución o efectos para ir fluido; si va
sobrado, los sube.

### 18. Ahorro de batería · S · ✔ hecho
**Hecho (5/10/2026):** cuando no pasa nada (en el menú o esperando jugada, sin tocar la pantalla desde hace
segundo y medio y sin nada moviéndose), a 30 fotogramas por segundo; en cuanto algo se mueve o se toca, a
60. Y nunca más de 60, aunque la pantalla sea de 120 Hz (los iPhone Pro y los Mac nuevos pintaban el doble
para nada).
**Qué:** menos fotogramas por segundo cuando no pasa nada (en el menú o esperando tu jugada), para
que el móvil no se caliente.

## Fase 5 — Grandes

### 19. Ordenar el código principal · M
**Qué:** `main.js` tiene más de 1.100 líneas. Se separaría en partida, capturas y pantalla para que
cada mejora sea más segura. No cambia nada que se vea; se puede ir haciendo por dentro de otros
puntos.

### 20. Jugar por internet · L · ✔ hecho (sin servidor)
**Hecho (4-5/10/2026):** por brokers MQTT públicos y gratuitos, sin servidor propio: emparejamiento al
azar, sala con quién hay conectado (buscador y retos directos), nombres, rendirse y varias partidas a la
vez, en espera.
**Qué:** partida con un amigo a distancia mediante un enlace de invitación. Necesita un pequeño
servidor que conecte a los dos jugadores.

---

## Orden recomendado

1 → 2 → 3 → 5 → 6 → 4 → 7 → 11 → 8 (por partes) → el resto.

Primero lo que más se nota en cada partida (saltar combates, sonido, que cargue al instante) y la red
de seguridad. Después, el espectáculo del mate y la coronación. El orden es solo una propuesta: se
cambia cuando quieras.
