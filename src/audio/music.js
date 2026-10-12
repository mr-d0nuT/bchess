import { audioContext, audioOut, master, runningAudioContext } from './context.js';

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
// El volumen de la música DURANTE LA PARTIDA, de 0 a 100, el que deja el usuario. Por defecto, al 20 %: a
// tope no se oían los efectos (lo pidió el usuario). La intro y el menú suenan siempre a tope. (La clave es
// nueva: con la de antes, 'bchess.musica.volumen', a quien ya la había tocado no le llegaba el 20 %.)
const LEVEL_STORE = 'bchess.musica.partida';
const DEFAULT_LEVEL = 0.2;

export function createMusic({ onNeedGesture = () => {}, onGesture = () => {} } = {}) {
  let context = null;
  let muted = read() === 'no';
  let phase = 'intro'; // 'intro' mientras carga; 'game' después
  const intro = track(INTRO, true);
  let song = null;
  let order = [];
  let last = null;
  let waiting = false; // esperando un toque para poder sonar

  function read(key = STORE) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  // El volumen que ha elegido el usuario para la partida, de 0 a 1, por encima del propio de cada pista.
  const guardado = read(LEVEL_STORE);
  let level = guardado === null ? DEFAULT_LEVEL : Math.max(0, Math.min(1, Number(guardado) / 100 || 0));
  function write(value) {
    try { localStorage.setItem(STORE, value); } catch { /* sin almacenamiento: solo esta sesión */ }
  }

  function track(src, loop = false) {
    const audio = new Audio();
    audio.preload = loop ? 'auto' : 'none'; // las del juego, que no le quiten conexión a la carga
    audio.loop = loop;
    audio.src = src;
    return { audio, gain: null, level: 0 }; // `level`: su volumen, sin contar el general (`master`)
  }

  // Web Audio, con el contexto ya en marcha (fuera de un toque, el navegador lo deja mudo). Desde aquí la pista
  // pasa por su nodo de ganancia y por el volumen general (el altavoz de la partida).
  function wire(t) {
    context ??= runningAudioContext(); // el mismo que los efectos (`context.js`), si ya suena
    if (!context || t.gain) return;
    try {
      const source = context.createMediaElementSource(t.audio);
      t.gain = context.createGain();
      t.gain.gain.value = t.level;
      source.connect(t.gain).connect(audioOut() ?? context.destination);
      clearInterval(t.timer);
      t.audio.volume = 1; // el volumen, ya en el nodo
      t.audio.muted = false;
    } catch { /* ya estaba montada, o el navegador no deja: se queda con el volumen del elemento */ }
  }

  // Lleva el volumen de una pista a `to` en `seconds`.
  function fade(t, to, seconds) {
    if (t.gain) {
      const now = context.currentTime;
      t.level = to;
      t.gain.gain.cancelScheduledValues(now);
      t.gain.gain.setValueAtTime(t.gain.gain.value, now);
      t.gain.gain.linearRampToValueAtTime(to, now + seconds);
      return;
    }
    const from = t.level;
    const start = performance.now();
    clearInterval(t.timer);
    t.timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / (seconds * 1000));
      t.level = from + (to - from) * k;
      aplica(t);
      if (k >= 1) clearInterval(t.timer);
    }, 50);
  }

  function setVolume(t, value) {
    t.level = value;
    if (t.gain) t.gain.gain.value = value;
    else aplica(t);
  }
  // La pista que aún no pasa por Web Audio (el navegador la dejó sonar sola, sin esperar a un toque: en el Mac,
  // a menudo) no oye al nodo del volumen general: se le pone a mano en el elemento —su volumen por el general, y
  // callada si está en silencio, que en el iPhone el volumen no se puede cambiar y `muted` sí—. Antes solo le
  // llegaba el silencio, y la barra del altavoz no le cambiaba el volumen (lo vio el usuario).
  function aplica(t) {
    if (t.gain) return;
    t.audio.volume = Math.max(0, Math.min(1, t.level * master.gain));
    t.audio.muted = master.gain === 0;
  }
  // Tocar el altavoz es un toque: si el contexto ya suena, la pista que sonaba suelta se monta en él.
  master.onChange(() => {
    for (const t of [intro, song]) {
      if (!t) continue;
      wire(t);
      aplica(t);
    }
  });

  async function play(t, base, fadeIn = 0) {
    wire(t);
    const volume = base * (t === intro ? 1 : level); // la intro (y el menú), a tope
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
      context ??= audioContext(); // el mismo que los efectos (`context.js`)
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
        if (phase !== 'game') return; // se volvió al menú antes de acabar de fundirse
        intro.audio.pause();
        if (!muted && !waiting) nextSong();
      }, INTRO_FADE * 1000);
    },
    // Vuelta al menú: la canción de la partida se funde y vuelve a sonar la melodía de la carga.
    async backToIntro() {
      phase = 'intro';
      const sonando = song;
      if (sonando && !sonando.audio.paused) {
        fade(sonando, 0, SONG_FADE);
        setTimeout(() => sonando.audio.pause(), SONG_FADE * 1000);
      }
      if (muted) return;
      intro.audio.currentTime = 0;
      if (!(await play(intro, INTRO_VOLUME, SONG_FADE))) waitForGesture();
    },
    get muted() {
      return muted;
    },
    // El volumen que elige el usuario para la partida (de 0 a 1): se aplica en el acto a la canción que suene.
    get volume() {
      return level;
    },
    set volume(value) {
      level = Math.max(0, Math.min(1, value));
      try { localStorage.setItem(LEVEL_STORE, String(Math.round(level * 100))); } catch { /* solo esta sesión */ }
      if (song && !song.audio.paused) setVolume(song, GAME_VOLUME * level);
    },
    // Qué suena ahora, para depurar desde la consola.
    get state() {
      return {
        phase,
        waiting,
        intro: !intro.audio.paused,
        // Cómo suena: por Web Audio (`web`, con su ganancia) o suelta (el volumen del elemento).
        salida: [intro, song].filter(Boolean).map((t) => (t.gain ? `web ${t.gain.gain.value.toFixed(2)}` : `suelta ${t.audio.volume.toFixed(2)}${t.audio.muted ? ' muda' : ''}`)),
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
