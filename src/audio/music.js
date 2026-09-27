// La música. Mientras carga suena la melodía de la intro; al acabar la carga se funde y empiezan las
// canciones del juego, una detrás de otra y en orden aleatorio (al volver a barajar, la que acaba de
// sonar no sale la primera).
//
// Dos cosas del navegador mandan aquí:
// - Nada suena hasta que el usuario toca la página (la reproducción automática está bloqueada casi
//   siempre). Si la intro no puede arrancar sola, se avisa (`onNeedGesture`) y suena al primer toque.
// - En el iPhone el volumen de un <audio> no se puede cambiar. Para fundir, la pista se pasa por Web
//   Audio con un nodo de ganancia; eso solo se puede montar tras un toque, así que se monta entonces.

const INTRO = 'assets/audio/carga.mp3';
const SONGS = ['assets/audio/juego-1.mp3', 'assets/audio/juego-2.mp3', 'assets/audio/juego-3.mp3', 'assets/audio/juego-4.mp3'];
const INTRO_VOLUME = 0.8;
const GAME_VOLUME = 0.45;
const INTRO_FADE = 2; // segundos en que se apaga la intro al acabar la carga
const SONG_FADE = 1.5; // y en que entra cada canción
const STORE = 'bchess.musica'; // 'no' si el usuario la ha quitado

export function createMusic({ onNeedGesture = () => {}, onGesture = () => {} } = {}) {
  let context = null;
  let muted = read() === 'no';
  let phase = 'intro'; // 'intro' mientras carga; 'game' después
  const intro = track(INTRO, true);
  let song = null;
  let order = [];
  let last = null;
  let waiting = false; // esperando un toque para poder sonar

  function read() {
    try { return localStorage.getItem(STORE); } catch { return null; }
  }
  function write(value) {
    try { localStorage.setItem(STORE, value); } catch { /* sin almacenamiento: solo esta sesión */ }
  }

  function track(src, loop = false) {
    const audio = new Audio();
    audio.preload = loop ? 'auto' : 'none'; // las del juego, que no le quiten conexión a la carga
    audio.loop = loop;
    audio.src = src;
    return { audio, gain: null };
  }

  // Web Audio, montado dentro de un toque (fuera de él, el navegador lo deja mudo).
  function wire(t) {
    if (!context || t.gain) return;
    try {
      const source = context.createMediaElementSource(t.audio);
      t.gain = context.createGain();
      t.gain.gain.value = t.audio.volume;
      source.connect(t.gain).connect(context.destination);
    } catch { /* ya estaba montada, o el navegador no deja: se queda con el volumen del elemento */ }
  }

  // Lleva el volumen de una pista a `to` en `seconds`.
  function fade(t, to, seconds) {
    if (t.gain) {
      const now = context.currentTime;
      t.gain.gain.cancelScheduledValues(now);
      t.gain.gain.setValueAtTime(t.gain.gain.value, now);
      t.gain.gain.linearRampToValueAtTime(to, now + seconds);
      return;
    }
    const from = t.audio.volume;
    const start = performance.now();
    clearInterval(t.timer);
    t.timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / (seconds * 1000));
      t.audio.volume = from + (to - from) * k;
      if (k >= 1) clearInterval(t.timer);
    }, 50);
  }

  function setVolume(t, value) {
    if (t.gain) t.gain.gain.value = value;
    else t.audio.volume = value;
  }

  async function play(t, volume, fadeIn = 0) {
    wire(t);
    setVolume(t, fadeIn ? 0 : volume);
    try {
      await t.audio.play();
    } catch {
      return false;
    }
    if (fadeIn) fade(t, volume, fadeIn);
    return true;
  }

  // Lo que ha de sonar ahora, según en qué punto estemos.
  async function resume() {
    if (muted) return true;
    if (phase === 'intro') return play(intro, INTRO_VOLUME);
    if (!song) return nextSong();
    return play(song, GAME_VOLUME, SONG_FADE);
  }

  // Al primer toque: se monta Web Audio y suena lo que tocaba.
  function waitForGesture() {
    if (waiting) return;
    waiting = true;
    onNeedGesture();
    const unlock = () => {
      for (const type of ['pointerdown', 'keydown', 'touchend']) window.removeEventListener(type, unlock, true);
      waiting = false;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!context && Ctx) context = new Ctx();
      context?.resume?.();
      wire(intro);
      if (song) wire(song);
      onGesture();
      resume();
    };
    for (const type of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(type, unlock, true);
  }

  function shuffle() {
    order = SONGS.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (order.length > 1 && order[0] === last) [order[0], order[1]] = [order[1], order[0]];
  }

  async function nextSong() {
    if (!order.length) shuffle();
    last = order.shift();
    song?.audio.pause();
    song = track(last);
    song.audio.addEventListener('ended', () => { if (!muted) nextSong(); }, { once: true });
    if (muted) return true;
    const ok = await play(song, GAME_VOLUME, SONG_FADE);
    if (!ok) waitForGesture();
    return ok;
  }

  return {
    // Arranca la intro. Si el navegador no deja, espera al primer toque.
    async startIntro() {
      if (muted) return;
      if (!(await play(intro, INTRO_VOLUME))) waitForGesture();
    },
    // La carga ha terminado: la intro se funde y, al acabar de fundirse, empiezan las canciones.
    endIntro() {
      phase = 'game';
      if (!intro.audio.paused) fade(intro, 0, INTRO_FADE);
      setTimeout(() => {
        intro.audio.pause();
        if (!muted && !waiting) nextSong();
      }, INTRO_FADE * 1000);
    },
    get muted() {
      return muted;
    },
    // Qué suena ahora, para depurar desde la consola.
    get state() {
      return {
        phase,
        waiting,
        intro: !intro.audio.paused,
        song: song ? { src: song.audio.src.split('/').pop(), playing: !song.audio.paused, time: Math.round(song.audio.currentTime) } : null,
        next: order.map((src) => src.split('/').pop()),
      };
    },
    // Quita o pone la música (y se acuerda para la próxima vez).
    toggle() {
      muted = !muted;
      write(muted ? 'no' : 'si');
      if (muted) {
        intro.audio.pause();
        song?.audio.pause();
      } else {
        resume().then((ok) => { if (!ok) waitForGesture(); });
      }
      return muted;
    },
  };
}
