import { FIREBASE } from './firebase-config.js';
import { currentLanguage } from '../i18n.js';

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

// El perfil público del jugador tal como se guarda: su nombre, sus puntuaciones y, para ordenar el ranking,
// `board` (categoría → puntuación redondeada, solo de las que tienen partidas). Sin correo ni nada personal.
// Lo privado (el ranking local, con los nombres de los que juegan en casa) no va aquí: va aparte y solo lo ve él.
export function profileOf({ name, data }) {
  const board = {};
  for (const [cat, entry] of Object.entries(data.ratings ?? {})) {
    if (entry?.games > 0) board[cat] = Math.round(entry.r);
  }
  return { name: String(name ?? '').trim().slice(0, NAME_MAX) || 'Jugador', ratings: data.ratings, board };
}

export function createCloud() {
  const avisos = new Set();
  let sdk = null; // { auth, store, a, db } cuando ya está cargado
  let cargando = null;
  let user = null; // { uid, name, email, verified, google }
  let guardar = 0;
  const cache = new Map(); // categoría → { at, list }

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
    // Cuenta nueva con correo: se le pone el nombre y se le manda el correo de confirmación.
    signUp: (email, password, name) => intenta(async ({ auth, a }) => {
      const { user: u } = await auth.createUserWithEmailAndPassword(a, email, password);
      if (name) await auth.updateProfile(u, { displayName: String(name).trim().slice(0, NAME_MAX) });
      await auth.sendEmailVerification(u, vuelta());
      user = describe(u);
      for (const fn of avisos) fn(user);
    }),
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
