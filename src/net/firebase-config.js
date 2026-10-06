// LA CONFIGURACIÓN DE FIREBASE (la cuenta del jugador y la nube): el bloque `firebaseConfig` que da la consola
// de Firebase al registrar la app web (Configuración del proyecto → Tus apps). No es una contraseña: está
// hecho para ir en la web pública; lo que protege los datos son las reglas de `firestore.rules`.
//
// Mientras sea null, el juego funciona igual, sin cuentas: la puntuación se guarda solo en el aparato.
export const FIREBASE = null;
