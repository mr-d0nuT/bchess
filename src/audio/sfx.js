import { runningAudioContext } from './context.js';

// LOS EFECTOS DE SONIDO (punto 2 del plan de mejora). Cada sonido se carga una vez, ya descomprimido, y
// suena las veces que haga falta, cada vez un pelín más agudo o más grave, que no parezca un disco rayado.
// Los combates lo piden en el instante exacto de cada golpe: `sfx.play('espadas')`. Los largos (la mecha,
// el galope) devuelven con qué cortarlos: `const mecha = sfx.play('mecha'); … mecha?.stop()`.
//
// Los ficheros salen de los originales de `raw/sonidos/` con `tools/prepara-sonidos.py`: recortados para
// que el golpe caiga al principio, al mismo nivel y en MP3. Casi todos son de Pixabay (licencia de
// Pixabay: uso libre, sin atribución); el de las espadas, de BigSoundBank.
//
// No suenan si se han quitado en la configuración, ni mientras se salta un combate (al saltarlo, el resto
// del combate pasa de golpe y sonaría todo a la vez), ni en la red de seguridad (`sfx.silenced`, que pone
// quien arranca el juego).

// Cada sonido: su volumen (para que suenen parejos) y de dónde sale (nombre e id en Pixabay).
const SOUNDS = {
  espadas: { volume: 0.8 }, // dos hojas que se cruzan y una resbala por la otra («Sword», BigSoundBank 0129)
  escudo: { volume: 0.85 }, // lanza o puño contra un escudo («shield guard», 6963)
  embestida: { volume: 1 }, // la lanza revienta contra el escudo, con su vibración larga («Shield Block Shortsword», 143940)
  casco: { volume: 0.8 }, // ¡CLONC! en el casco o en la armadura («Metal Hit Cartoon», 7118)
  corte: { volume: 0.75 }, // tajo de espada («Sword Slice», 393847)
  punetazo: { volume: 0.85 }, // puñetazo o patada («Classic Punch Impact», 352711)
  caida: { volume: 0.7 }, // un cuerpo contra el suelo («Body Fall», 259680)
  caida_armadura: { volume: 0.75 }, // y con armadura («Heavy Body Fall», 352446)
  explosion: { volume: 1 }, // ¡BUUUM! de dibujos animados («Cartoon Explosion», 567193)
  mecha: { volume: 0.45 }, // la mecha, chisporroteando hasta que explota («FUSE», 80913)
  bomba_vuela: { volume: 0.5 }, // silbato que baja, mientras la bomba vuela («Cartoon Slide Whistle Down 1», 176647)
  galope: { volume: 0.7 }, // la carga al galope («Harse Gallop Loop2», 103633)
  relincho: { volume: 0.6 }, // el caballo se encabrita («Horse Neigh», 390297)
  hielo: { volume: 0.6 }, // la escarcha que trepa («ice freezing», 445024)
  hielo_rompe: { volume: 0.85 }, // el hielo estalla en esquirlas («Shattering Ice», 454251)
  fuego: { volume: 0.8 }, // bolas de fuego («Fireball Whoosh 1», 179125)
  rayo: { volume: 0.8 }, // el rayo del rey («Lightning Strike», 386161)
  hechizo: { volume: 0.7 }, // el rayo del alfil («Lightning Spell», 386163)
  conjuro: { volume: 0.45 }, // la magia que se junta en las manos o en la joya («Spell Casting», 229208)
  puf: { volume: 0.6 }, // nubecilla: el hechizo que no sale, la magia que estalla («Poof», 80161)
  piedra_rompe: { volume: 0.85 }, // piedra que se rompe en cascotes («Rock destroy», 6409)
  piedra_cruje: { volume: 0.7 }, // la piedra se asienta con un crujido («Flint Strike», 38491)
  silbido: { volume: 0.7 }, // un golpe que pasa rozando («Whoosh Blow Flutter Short», 14678)
};
for (const [name, sound] of Object.entries(SOUNDS)) sound.src = `assets/audio/efectos/${name}.mp3`;
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
const sounding = new Set(); // los que están sonando, para poder callarlos todos

export const sfx = {
  // true mientras no deban sonar (se salta un combate, corre la red de seguridad…).
  silenced: () => false,

  // Los carga todos, sin esperar: para cuando haga falta el primero, ya estarán.
  preload() {
    for (const name of Object.keys(SOUNDS)) load(name);
  },

  // Suena ya, si se puede, y devuelve con qué cortarlo ({ stop(segundos) }), o null. `volume`, de 0 a 1,
  // sobre el volumen propio del sonido; `rate`, más agudo y corto (>1) o más grave y largo (<1).
  play(name, { volume = 1, rate = 1 } = {}) {
    const sound = SOUNDS[name];
    if (!sound || this.muted || this.silenced()) return null;
    if (!sound.buffer) {
      load(name);
      return null;
    }
    const context = runningAudioContext();
    if (!context) return null; // nadie ha tocado aún la página
    if (!master || master.context !== context) {
      master = context.createGain();
      master.connect(context.destination);
    }
    const source = context.createBufferSource();
    source.buffer = sound.buffer;
    source.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * VARY);
    const gain = context.createGain();
    gain.gain.value = sound.volume * volume;
    source.connect(gain).connect(master);
    source.start();
    const handle = {
      // Se apaga en `seconds` (sin chasquido) y se para.
      stop(seconds = 0.12) {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + seconds);
        try { source.stop(now + seconds + 0.02); } catch { /* ya había acabado */ }
      },
    };
    sounding.add(handle);
    source.onended = () => sounding.delete(handle);
    return handle;
  },

  // Calla todo lo que esté sonando (al saltar un combate: la mecha o el galope seguirían sonando).
  stopAll(seconds = 0.1) {
    for (const handle of sounding) handle.stop(seconds);
    sounding.clear();
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
