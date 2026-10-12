// Un solo contexto de Web Audio para todo el juego: la música lo usa para fundir (en el iPhone el volumen
// de un <audio> no se puede cambiar) y los efectos para sonar. El navegador no deja que suene nada hasta
// que el usuario toca la página, así que se crea (o se despierta) en cada toque si hace falta; y al volver
// de segundo plano, que el iPhone lo deja en pausa.

let context = null;
let armed = false;

// El contexto, creándolo si aún no existe (solo dentro de un toque, o nacerá dormido).
export function audioContext() {
  if (!context) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) context = new Ctx();
  }
  return context;
}

// El contexto si ya existe y está sonando, o null: lo que necesita un efecto para sonar ya.
export function runningAudioContext() {
  return context?.state === 'running' ? context : null;
}

// EL VOLUMEN GENERAL (el altavoz de la partida, lo pidió el usuario: activar y desactivar el sonido y regularlo
// desde la pantalla de juego). Todo lo que suena —música, efectos y voces— pasa por un último nodo de
// ganancia (`audioOut`), y el altavoz solo toca ese: el volumen de cada cosa en la configuración sigue igual.
const VOLUME_STORE = 'bchess.sonido.volumen'; // de 0 a 100
const MUTE_STORE = 'bchess.sonido.silencio'; // 'si' si está silenciado
const listeners = new Set();
let out = null;
let volume = null;
let muted = null;

function readStore(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { /* sin almacenamiento: solo esta sesión */ }
}
function load() {
  if (volume !== null) return;
  const guardado = readStore(VOLUME_STORE);
  volume = guardado === null ? 1 : Math.max(0, Math.min(1, Number(guardado) / 100 || 0));
  muted = readStore(MUTE_STORE) === 'si';
}
function changed() {
  if (out) {
    const now = out.context.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(master.gain, now, 0.03); // sin chasquido
  }
  for (const fn of listeners) fn(master);
}

// El nodo al que se conecta todo lo que suena (en vez de `destination`), o null si aún no hay contexto.
export function audioOut() {
  const c = audioContext();
  if (!c) return null;
  if (!out || out.context !== c) {
    out = c.createGain();
    out.gain.value = master.gain;
    out.connect(c.destination);
  }
  return out;
}

export const master = {
  // De 0 a 1.
  get volume() {
    load();
    return volume;
  },
  set volume(value) {
    load();
    volume = Math.max(0, Math.min(1, value));
    writeStore(VOLUME_STORE, String(Math.round(volume * 100)));
    // Subir el volumen, si estaba en silencio, es querer oírlo.
    if (muted && volume > 0) {
      muted = false;
      writeStore(MUTE_STORE, 'no');
    }
    changed();
  },
  get muted() {
    load();
    return muted;
  },
  set muted(value) {
    load();
    muted = Boolean(value);
    writeStore(MUTE_STORE, muted ? 'si' : 'no');
    changed();
  },
  // Lo que deja pasar ahora: nada en silencio; si no, el volumen.
  get gain() {
    load();
    return muted ? 0 : volume;
  },
  // Avisa de cada cambio (la música que no pasa por Web Audio, el icono del altavoz). Devuelve con qué dejarlo.
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function unlockAudioOnGesture() {
  if (armed) return;
  armed = true;
  const wake = () => {
    const c = audioContext();
    if (c && c.state !== 'running') c.resume?.().catch(() => {});
  };
  for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, wake, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && context && context.state !== 'running') context.resume?.().catch(() => {});
  });
}
