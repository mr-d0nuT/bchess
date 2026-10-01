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
