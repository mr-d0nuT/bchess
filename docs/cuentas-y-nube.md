# Las cuentas y la nube (Firebase)

Las cuentas de jugador (Google, o correo y contraseña con enlace de confirmación), la puntuación guardada en
la nube y el ranking mundial van con **Firebase, en su plan gratuito (Spark)**. El código está en
`src/net/cloud.js` (y la pantalla, en `src/ui/auth-ui.js` y `src/ui/ranking-ui.js`); la configuración, en
`src/net/firebase-config.js`.

## Dónde está

- **Proyecto:** «bchess», identificador `api-project-32749131805` (era el «API Project» de la cuenta de
  Google de siempre; se le cambió el nombre para que se sepa de qué es). **No borrarlo:** con él se van
  todas las cuentas y puntuaciones del juego.
- Consola de Firebase: https://console.firebase.google.com/project/api-project-32749131805
- Consola de Google Cloud (el mismo proyecto): https://console.cloud.google.com/home/dashboard?project=api-project-32749131805

## Gratis para siempre

- El proyecto **no tiene cuenta de facturación**, así que no puede cobrar nada, pase lo que pase. Si un día
  se pasara de lo que da gratis, lo que pasa es que deja de responder hasta el día siguiente, no una factura.
- **Nunca** vincularle una tarjeta ni pasarlo al plan Blaze, ni activar «Identity Platform», ni las copias
  de seguridad de Firestore (piden Blaze).
- Lo gratuito de Firestore da de sobra para el juego: 1 GiB guardado, 50.000 lecturas y 20.000 escrituras
  al día. Cada jugador es un documento pequeño, y cada uno lee el ranking (50 lecturas) como mucho cada 5
  minutos por categoría.

## Lo que hay configurado

- **Authentication:** «Correo electrónico/contraseña» (sin el enlace sin contraseña) y «Google» (nombre
  público «BChess»). Dominios autorizados: `localhost`, los dos del propio proyecto y `mr-d0nut.github.io`.
  Si el juego se publica en otra dirección, hay que añadirla ahí (Authentication → Configuración → Dominios
  autorizados), o el inicio de sesión fallará.
- **Firestore:** la base de datos «(default)», edición Standard, en `eur3` (Europa; no se puede cambiar).
  Una colección, `users`: `users/{id}` es lo público (nombre, puntuaciones) y `users/{id}/privado/datos`,
  el ranking local, que solo ve su dueño.
- **Reglas:** las de `firestore.rules`, publicadas en la consola (Firestore → Reglas). Si se cambian en el
  repositorio, hay que pegarlas allí y darle a «Publicar»: el juego no las sube solo.
- **App web:** «bchess-web» (de ahí sale la configuración de `src/net/firebase-config.js`).
- **Pantalla de consentimiento de Google:** en producción, para usuarios externos. El juego solo pide el
  nombre y el correo, que no necesitan verificación de Google.
- **La clave de API** del juego es la «Browser key (auto created by Firebase)», limitada a los servicios de
  Firebase. La otra que hay en el proyecto, «Browser key 1» (de 2013), no es del juego: no tocarla.
