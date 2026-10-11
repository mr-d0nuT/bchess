// LA CONFIGURACIÓN DE FIREBASE (la cuenta del jugador y la nube): el bloque `firebaseConfig` que da la consola
// de Firebase al registrar la app web (Configuración del proyecto → Tus apps → bchess-web). No es una
// contraseña: está hecho para ir en la web pública; lo que protege los datos son las reglas de
// `firestore.rules` (publicadas en la consola: Firestore → Reglas), y la clave solo sirve para los servicios
// de Firebase (Google Cloud → Credenciales → «Browser key (auto created by Firebase)»).
//
// El proyecto es «bchess» (identificador `api-project-32749131805`), en el plan gratuito de Firebase, sin
// cuenta de facturación: no puede cobrar nada. Si se borra ese proyecto, se acaban las cuentas del juego.
// La base de datos es la «(default)», en eur3 (Europa).
export const FIREBASE = {
  apiKey: 'AIzaSyDK0djRBUEF1zLCthGUx2aRQ8lVqnn1tF0',
  authDomain: 'api-project-32749131805.firebaseapp.com',
  projectId: 'api-project-32749131805',
  storageBucket: 'api-project-32749131805.firebasestorage.app',
  messagingSenderId: '32749131805',
  appId: '1:32749131805:web:286ccef388a2a954cccef4',
};
