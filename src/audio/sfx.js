import { runningAudioContext } from './context.js';

// LOS EFECTOS DE SONIDO (punto 2 del plan de mejora). Cada sonido se carga una vez, ya descomprimido, y
// suena las veces que haga falta, cada vez un pelín más agudo o más grave, que no parezca un disco rayado.
// Los combates lo piden en el instante exacto de cada golpe: `sfx.play('espadas')`.
//
// No suenan si se han quitado en la configuración, ni mientras se salta un combate (al saltarlo, el resto
// del combate pasa de golpe y sonaría todo a la vez), ni en la red de seguridad (`sfx.silenced`, que pone
// quien arranca el juego).

const SOUNDS = {
  // Dos espadas que se cruzan y una hoja resbala por la otra («schiiing»), con su vibración de metal.
  // «Sword» (ID 0129) de BigSoundBank, recortado para que empiece en el contacto de las hojas y sin el
  // pitido de 15,7 kHz que traía la grabación.
  espadas: { src: 'assets/audio/efectos/espadas.wav', volume: 0.8 },
};
const STORE = 'bchess.efectos'; // 'no' si el usuario los ha quitado
const VARY = 0.05; // lo que cambia el tono de una vez a otra (±5 %)

function read() {
  try { return localStorage.getItem(STORE); } catch { return null; }
}
function write(value) {
  try { localStorage.setItem(STORE, value); } catch { /* sin almacenamiento: solo esta sesión */ }
}

// Se descomprimen sin el contexto de verdad (que no se puede crear hasta el primer toque): los sonidos ya
// descomprimidos valen para cualquiera.
let offline = null;
function decode(data) {
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  offline ??= new Offline(1, 1, 44100);
  return new Promise((resolve, reject) => offline.decodeAudioData(data, resolve, reject));
}

const loading = new Map();
function load(name) {
  const sound = SOUNDS[name];
  if (!sound) return Promise.resolve(null);
  if (!loading.has(name)) {
    loading.set(name, fetch(sound.src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(decode)
      .then((buffer) => {
        sound.buffer = buffer;
        return buffer;
      })
      .catch((err) => {
        console.warn(`[BChess] No se pudo cargar el sonido «${name}» (${sound.src}):`, err);
        loading.delete(name); // la próxima vez que se pida, se vuelve a intentar
        return null;
      }));
  }
  return loading.get(name);
}

let muted = null; // se lee al pedirlo por primera vez
let master = null;

export const sfx = {
  // true mientras no deban sonar (se salta un combate, corre la red de seguridad…).
  silenced: () => false,

  // Los carga todos, sin esperar: para cuando haga falta el primero, ya estarán.
  preload() {
    for (const name of Object.keys(SOUNDS)) load(name);
  },

  // Suena ya, si se puede. `volume`, de 0 a 1, sobre el volumen propio del sonido.
  play(name, { volume = 1 } = {}) {
    const sound = SOUNDS[name];
    if (!sound || this.muted || this.silenced()) return false;
    if (!sound.buffer) {
      load(name);
      return false;
    }
    const context = runningAudioContext();
    if (!context) return false; // nadie ha tocado aún la página
    if (!master || master.context !== context) {
      master = context.createGain();
      master.connect(context.destination);
    }
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = 1 + (Math.random() * 2 - 1) * VARY;
    const gain = context.createGain();
    gain.gain.value = sound.volume * volume;
    source.connect(gain).connect(master);
    source.start();
    return true;
  },

  get muted() {
    if (muted === null) muted = read() === 'no';
    return muted;
  },

  // Quita o pone los efectos (y se acuerda para la próxima vez).
  toggle() {
    muted = !this.muted;
    write(muted ? 'no' : 'si');
    return muted;
  },

  // Los nombres de los sonidos, para depurar desde la consola.
  get names() {
    return Object.keys(SOUNDS);
  },
};
