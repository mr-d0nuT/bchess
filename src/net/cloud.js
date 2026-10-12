import { FIREBASE } from './firebase-config.js';
import { currentLanguage } from '../i18n.js';
import { cleanName } from '../names.js';

// LA CUENTA Y LA NUBE (Firebase, en su plan gratuito: sin tarjeta, no puede cobrar nada; si un día se pasara
// del cupo, la nube se para hasta el día siguiente y el juego sigue igual, con lo guardado en el aparato).
// - Entrar con Google o con correo y contraseña (con el correo de confirmación y el de cambiar la contraseña,
//   que los manda Firebase solo, en el idioma del juego).
// - El perfil del jugador (su nombre en el ranking y sus puntuaciones) en la nube: el mismo en el iPhone y en
//   el Mac. Se escribe al acabar cada partida (una escritura) y se lee al entrar.
// - El ranking mundial: los cincuenta mejores de cada ritmo, que se piden como mucho cada cinco minutos.
//
// El SDK de Firebase no se carga hasta que hace falta, y solo si hay configuración (`firebase-config.js`).

const SDK = 'https://www.gstatic.com/firebasejs/12.19.0';
const LEADERBOARD_SIZE = 50;
const LEADERBOARD_TTL = 5 * 60 * 1000; // el ranking mundial, como mucho cada cinco minutos
const SAVE_DELAY = 2000; // y el perfil, juntando lo que cambie seguido
const NAME_MAX = 16;
const LANGUAGE = { zh: 'zh-CN' }; // los correos de Firebase, en el idioma del juego

// Lo que dice Firebase cuando algo falla, en una clave de texto del juego (null: no hay que decir nada, como
// cuando el jugador cierra la ventana de Google).
export function errorKey(code) {
  switch (code) {
    case 'auth/invalid-email': return 'cuenta.error.correo';
    case 'auth/missing-password':
    case 'auth/weak-password': return 'cuenta.error.clave';
    case 'auth/email-already-in-use': return 'cuenta.error.existe';
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'cuenta.error.datos';
    case 'auth/network-request-failed': return 'cuenta.error.red';
    case 'auth/popup-blocked': return 'cuenta.error.ventana';
    case 'auth/too-many-requests': return 'cuenta.error.muchos';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled': return null;
    default: return 'cuenta.error.otro';
  }
}

// LOS NOMBRES DEL RANKING, ÚNICOS (lo pidió el usuario: al registrarse, que diga en el momento si el nombre ya
// existe, y que no haya dos iguales). Cada nombre se reserva en `nombres/{clave}`, con la clave sin mayúsculas
// («Ana» y «ana» son el mismo), y las reglas (`firestore.rules`) solo dejan reservar uno libre y salir en el
// ranking con uno reservado por uno mismo.
export const claveNombre = (nombre) => cleanName(nombre).toLowerCase();
// Por qué no vale como nombre del ranking (la clave del texto), o null si vale: vacío, o algo que no puede ser el
// nombre de un documento de la base de datos (una barra, «.», «..» o «__…__»).
export function nombreInvalido(nombre) {
  const limpio = cleanName(nombre);
  if (!limpio) return 'cuenta.error.nombreVacio';
  if (limpio.includes('/') || limpio === '.' || limpio === '..' || /^__.*__$/.test(limpio)) return 'cuenta.error.nombreRaro';
  return null;
}
// Los que se prueban, por orden, si el que se quiere está cogido: «Josep», «Josep2»… (sin pasar de 16 letras).
export function sugerenciasNombre(base, cuantas = 9) {
  const limpio = cleanName(base) || 'Jugador';
  const lista = [limpio];
  for (let i = 2; i <= cuantas; i++) {
    const numero = String(i);
    lista.push(`${Array.from(limpio).slice(0, NAME_MAX - numero.length).join('').trimEnd()}${numero}`);
  }
  return lista;
}

// El perfil público del jugador tal como se guarda: su nombre, sus puntuaciones y, para ordenar el ranking,
// `board` (categoría → puntuación redondeada, solo de las que tienen partidas). Sin correo ni nada personal.
// Lo privado (el ranking local, con los nombres de los que juegan en casa) no va aquí: va aparte y solo lo ve él.
export function profileOf({ name, data }) {
  const board = {};
  for (const [cat, entry] of Object.entries(data.ratings ?? {})) {
    if (entry?.games > 0) board[cat] = Math.round(entry.r);
  }
  // Limpio como el reservado (`claveNombre`): si no, las reglas no lo reconocerían como suyo.
  return { name: cleanName(name) || 'Jugador', ratings: data.ratings, board };
}

export function createCloud() {
  const avisos = new Set();
  let sdk = null; // { auth, store, a, db } cuando ya está cargado
  let cargando = null;
  let user = null; // { uid, name, email, verified, google }
  let reservado = null; // { uid, nombre }: el nombre del ranking del que ha entrado (`aseguraNombre`)
  let registrando = null; // el nombre con que se está creando la cuenta: ese es el que se reserva, lo pida quien lo pida
  let asegurando = null; // la reserva en marcha (una a la vez: dos a la vez dejaban a uno con dos nombres)
  let guardar = 0;
  const cache = new Map(); // categoría → { at, list }
  const puestos = new Map(); // `categoría:puntuación` → { at, puesto }

  async function carga() {
    if (!FIREBASE) throw new Error('sin configuración');
    if (sdk) return sdk;
    cargando ??= (async () => {
      const [{ initializeApp }, auth, store] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        import(`${SDK}/firebase-auth.js`),
        import(`${SDK}/firebase-firestore.js`),
      ]);
      const app = initializeApp(FIREBASE);
      const a = auth.getAuth(app);
      const db = store.getFirestore(app);
      sdk = { auth, store, a, db };
      auth.onAuthStateChanged(a, (u) => {
        user = u ? describe(u) : null;
        for (const fn of avisos) fn(user);
      });
      return sdk;
    })();
    return cargando;
  }

  const describe = (u) => ({
    uid: u.uid,
    name: u.displayName ?? '',
    email: u.email ?? '',
    verified: Boolean(u.emailVerified),
    google: u.providerData?.some((p) => p.providerId === 'google.com') ?? false,
  });

  const idioma = (s) => {
    const lang = currentLanguage();
    s.a.languageCode = LANGUAGE[lang] ?? lang;
  };
  const vuelta = () => ({ url: `${location.origin}${location.pathname}` });

  // Lo que pide el jugador. Devuelven { ok } o { error } (la clave del texto).
  async function intenta(fn) {
    try {
      const s = await carga();
      idioma(s);
      await fn(s);
      return { ok: true };
    } catch (err) {
      const key = errorKey(err?.code);
      if (key && key !== 'cuenta.error.datos') console.warn('[BChess] Cuenta:', err?.code ?? err);
      return { error: key };
    }
  }

  return {
    // Si hay cuentas (si se ha configurado Firebase).
    available: Boolean(FIREBASE),
    // `fn(user)` cada vez que cambia quién ha entrado (null, nadie). Carga Firebase si hace falta.
    onUser(fn) {
      avisos.add(fn);
      if (FIREBASE) carga().then(() => fn(user)).catch(() => fn(null));
      return () => avisos.delete(fn);
    },
    get user() {
      return user;
    },
    google: () => intenta(({ auth, a }) => auth.signInWithPopup(a, new auth.GoogleAuthProvider())),
    signIn: (email, password) => intenta(({ auth, a }) => auth.signInWithEmailAndPassword(a, email, password)),
    // Cuenta nueva con correo, con su nombre del ranking (que ha de estar libre: se mira antes de crearla, y al
    // crearla se reserva); y se le manda el correo de confirmación.
    async signUp(email, password, name) {
      const invalido = nombreInvalido(name);
      if (invalido) return { error: invalido };
      const libre = await this.nombreLibre(name);
      if (libre.error) return libre;
      if (!libre.libre) return { error: 'cuenta.error.nombreCogido' };
      registrando = cleanName(name);
      try {
        const r = await intenta(async ({ auth, a }) => {
          const { user: u } = await auth.createUserWithEmailAndPassword(a, email, password);
          await auth.updateProfile(u, { displayName: cleanName(name) });
          await auth.sendEmailVerification(u, vuelta());
          user = describe(u);
        });
        if (r.error) return r;
        // Si alguien se lo ha quedado justo ahora, el más parecido que quede libre («Ana2»).
        await this.aseguraNombre(name);
        for (const fn of avisos) fn(user);
        return r;
      } finally {
        registrando = null;
      }
    },
    resendVerification: () => intenta(({ auth, a }) => auth.sendEmailVerification(a.currentUser, vuelta())),
    resetPassword: (email) => intenta(({ auth, a }) => auth.sendPasswordResetEmail(a, email, vuelta())),
    // ¿Ya ha confirmado el correo? (al volver a la pestaña después de abrir el enlace).
    async refresh() {
      if (!sdk?.a.currentUser) return user;
      try {
        await sdk.a.currentUser.reload();
        await sdk.a.currentUser.getIdToken(true); // que las reglas vean ya la cuenta confirmada
        user = describe(sdk.a.currentUser);
        for (const fn of avisos) fn(user);
      } catch { /* sin red: ya se mirará */ }
      return user;
    },
    signOut: () => intenta(({ auth, a }) => auth.signOut(a)),

    // LOS NOMBRES DEL RANKING (`claveNombre`). ¿Está libre? { libre, mio } (mio: es el mío), o { error }.
    async nombreLibre(nombre) {
      const invalido = nombreInvalido(nombre);
      if (invalido) return { error: invalido };
      try {
        const { store, db } = await carga();
        const doc = await store.getDoc(store.doc(db, 'nombres', claveNombre(nombre)));
        const mio = doc.exists() && doc.data().uid === user?.uid;
        return { libre: !doc.exists() || mio, mio };
      } catch (err) {
        console.warn('[BChess] No se pudo mirar el nombre:', err?.code ?? err);
        return { error: 'cuenta.error.red' };
      }
    },
    // El nombre del ranking del que ha entrado (el que tiene reservado), o null.
    get nombre() {
      return reservado?.uid === user?.uid ? reservado.nombre : null;
    },
    // Se queda `nombre` (si está libre) y suelta el que tuviera. { ok, nombre } o { error }.
    async reservaNombre(nombre) {
      if (!user) return { error: 'cuenta.error.otro' };
      const invalido = nombreInvalido(nombre);
      if (invalido) return { error: invalido };
      const limpio = cleanName(nombre);
      const clave = claveNombre(limpio);
      try {
        const { store, db } = await carga();
        const anterior = this.nombre ?? (await this.leeNombre());
        if (anterior && claveNombre(anterior) === clave && anterior === limpio) return { ok: true, nombre: limpio };
        // Si es el mío con otras mayúsculas, se suelta antes (si no, la clave ya estaría cogida, por mí).
        if (anterior && claveNombre(anterior) === clave) await store.deleteDoc(store.doc(db, 'nombres', clave));
        await store.setDoc(store.doc(db, 'nombres', clave), { uid: user.uid, nombre: limpio, creado: store.serverTimestamp() });
        if (anterior && claveNombre(anterior) !== clave) {
          await store.deleteDoc(store.doc(db, 'nombres', claveNombre(anterior))).catch(() => {});
        }
        reservado = { uid: user.uid, nombre: limpio };
        return { ok: true, nombre: limpio };
      } catch (err) {
        // Las reglas no dejan quedarse uno que ya es de alguien: es que está cogido (salvo que sea mío).
        if (err?.code === 'permission-denied') {
          const { store, db } = await carga();
          const doc = await store.getDoc(store.doc(db, 'nombres', clave)).catch(() => null);
          if (doc?.exists() && doc.data().uid === user.uid) {
            reservado = { uid: user.uid, nombre: doc.data().nombre };
            return { ok: true, nombre: doc.data().nombre };
          }
          return { error: 'cuenta.error.nombreCogido' };
        }
        console.warn('[BChess] No se pudo reservar el nombre:', err?.code ?? err);
        return { error: 'cuenta.error.red' };
      }
    },
    // El que tiene reservado en la nube (o null).
    async leeNombre() {
      if (!user) return null;
      try {
        const { store, db } = await carga();
        const snap = await store.getDocs(store.query(store.collection(db, 'nombres'), store.where('uid', '==', user.uid), store.limit(1)));
        const nombre = snap.empty ? null : snap.docs[0].data().nombre;
        if (nombre) reservado = { uid: user.uid, nombre };
        return nombre;
      } catch (err) {
        console.warn('[BChess] No se pudo leer el nombre:', err?.code ?? err);
        return null;
      }
    },
    // Que tenga uno: el que ya tiene; si no, `sugerencia` (creando la cuenta, el elegido) o, si está cogida, la
    // primera libre de `sugerenciasNombre`.
    aseguraNombre(sugerencia) {
      asegurando ??= (async () => {
        try {
          if (!user) return null;
          const ya = this.nombre ?? (await this.leeNombre());
          if (ya) return ya;
          for (const nombre of sugerenciasNombre(registrando ?? sugerencia)) {
            const r = await this.reservaNombre(nombre);
            if (r.ok) return r.nombre;
            if (r.error !== 'cuenta.error.nombreCogido') return null; // sin red: ya se probará
          }
          return null;
        } finally {
          asegurando = null;
        }
      })();
      return asegurando;
    },

    // EL PERFIL. Lo que hay guardado en la nube del que ha entrado (o null).
    async load() {
      if (!user) return null;
      try {
        const { store, db } = await carga();
        const [publico, privado] = await Promise.all([
          store.getDoc(store.doc(db, 'users', user.uid)),
          store.getDoc(store.doc(db, 'users', user.uid, 'privado', 'datos')),
        ]);
        if (!publico.exists()) return null;
        return { ...publico.data(), local: privado.exists() ? privado.data().local : {} };
      } catch (err) {
        console.warn('[BChess] No se pudo leer el perfil:', err?.code ?? err);
        return null;
      }
    },
    // Guarda el perfil ({ name, data }: `data` es lo de `ratings.export()`), juntando lo que llegue seguido.
    // Solo con la cuenta confirmada (las reglas no dejan otra cosa).
    save(profile) {
      clearTimeout(guardar);
      guardar = setTimeout(async () => {
        if (!user?.verified) return;
        try {
          const { store, db } = await carga();
          await Promise.all([
            store.setDoc(store.doc(db, 'users', user.uid), { ...profileOf(profile), updated: store.serverTimestamp() }),
            store.setDoc(store.doc(db, 'users', user.uid, 'privado', 'datos'), { local: profile.data.local ?? {}, updated: store.serverTimestamp() }),
          ]);
          cache.clear();
        } catch (err) {
          console.warn('[BChess] No se pudo guardar el perfil:', err?.code ?? err);
        }
      }, SAVE_DELAY);
    },
    // MI PUESTO en el ranking mundial de una categoría, con `rating` (la mía): { puesto, de }, o null (sin cuenta, sin
    // partidas ahí o sin red). Lo dicen dos cuentas en la nube (cuántos van por delante y cuántos hay), no la lista:
    // así se sabe aunque no se salga entre los primeros.
    async position(category, rating) {
      if (!user?.verified || !Number.isFinite(rating)) return null;
      const clave = `${category}:${Math.round(rating)}`;
      const guardado = puestos.get(clave);
      if (guardado && Date.now() - guardado.at < LEADERBOARD_TTL) return guardado.puesto;
      try {
        const { store, db } = await carga();
        const col = store.collection(db, 'users');
        const campo = `board.${category}`;
        const [delante, todos] = await Promise.all([
          store.getCountFromServer(store.query(col, store.where(campo, '>', Math.round(rating)))),
          store.getCountFromServer(store.query(col, store.where(campo, '>=', 0))),
        ]);
        const puesto = { puesto: delante.data().count + 1, de: Math.max(todos.data().count, delante.data().count + 1) };
        puestos.set(clave, { at: Date.now(), puesto });
        return puesto;
      } catch (err) {
        console.warn('[BChess] No se pudo saber el puesto en el ranking:', err?.code ?? err);
        return null;
      }
    },
    // EL RANKING MUNDIAL de una categoría: [{ name, r, rd, games, uid }], de más a menos.
    async leaderboard(category) {
      const guardado = cache.get(category);
      if (guardado && Date.now() - guardado.at < LEADERBOARD_TTL) return guardado.list;
      try {
        const { store, db } = await carga();
        const q = store.query(store.collection(db, 'users'), store.orderBy(`board.${category}`, 'desc'), store.limit(LEADERBOARD_SIZE));
        const snap = await store.getDocs(q);
        const list = snap.docs.map((d) => {
          const p = d.data();
          const e = p.ratings?.[category] ?? {};
          return { uid: d.id, name: p.name, r: e.r ?? p.board?.[category], rd: e.rd, games: e.games ?? 0 };
        });
        cache.set(category, { at: Date.now(), list });
        return list;
      } catch (err) {
        console.warn('[BChess] No se pudo leer el ranking:', err?.code ?? err);
        return guardado?.list ?? [];
      }
    },
  };
}
