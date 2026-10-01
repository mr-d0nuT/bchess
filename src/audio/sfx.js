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
  // Los pasos, cada uno en varias pisadas distintas (`variants`), que dos seguidas no suenen igual.
  paso: { volume: 0.3, variants: 3 }, // sobre la madera del tablero («Footsteps on Wood», 397989)
  paso_armadura: { volume: 0.35, variants: 3 }, // el caballero a pie: su paso y su armadura (y «armor», 6890)
  paso_gigante: { volume: 0.55, variants: 3 }, // el gigante de piedra («Monster Footstep», 162883, y «Stone Steps», 6748)
  casco_caballo: { volume: 0.3, variants: 4 }, // los cascos del caballo («Horse Walking», 123782)
  // La partida.
  pieza: { volume: 0.5 }, // al tocar una pieza («Chess Pieces hitting wooden board», 99336)
  clic: { volume: 0.4 }, // los botones («UI click», 43196)
  jugar: { volume: 0.6 }, // ¡JUGAR! («swoosh», 6428)
  reloj: { volume: 0.6 }, // pulsar el reloj («Cassette Recorder Stop Button», 359987)
  tic: { volume: 0.35 }, // cada segundo de los diez últimos («Clock Tick (Tik Tak)», 76043)
  jaque: { volume: 0.55 }, // ¡JAQUE! («Orchestra Hit», 240475)
  victoria: { volume: 0.6 }, // fanfarria de quien gana («Medieval Fanfare», 6826)
  derrota: { volume: 0.55 }, // contra la CPU, al perder («wah wah sad trombone», 6347)
  tablas: { volume: 0.5 }, // tablas («Success Fanfare Trumpets», 6185)
  torre: { volume: 0.5 }, // piedra que roza: la torre se desliza o se transforma («rock stone slide», 304550)
  corona: { volume: 0.6 }, // la coronación («Level Up», 191997)
};
for (const [name, sound] of Object.entries(SOUNDS)) {
  sound.srcs = sound.variants
    ? Array.from({ length: sound.variants }, (_, i) => `assets/audio/efectos/${name}-${i + 1}.mp3`)
    : [`assets/audio/efectos/${name}.mp3`];
  sound.buffers = [];
  sound.last = -1;
}
const STORE = 'bchess.efectos'; // 'no' si el usuario los ha quitado
const LEVEL_STORE = 'bchess.efectos.volumen'; // de 0 a 100, lo que ha dejado el usuario
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
    loading.set(name, Promise.all(sound.srcs.map((src) => fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(decode))).then((buffers) => {
      sound.buffers = buffers;
      return buffers;
    }).catch((err) => {
      console.warn(`[BChess] No se pudo cargar el sonido «${name}»:`, err);
      loading.delete(name); // la próxima vez que se pida, se vuelve a intentar
      return null;
    }));
  }
  return loading.get(name);
}

// Una de sus pisadas (o el único que tiene), sin repetir la de la vez anterior.
function pick(sound) {
  const n = sound.buffers.length;
  if (n < 2) return sound.buffers[0];
  let i = Math.floor(Math.random() * (n - 1));
  if (i >= sound.last) i += 1;
  sound.last = i;
  return sound.buffers[i];
}

let muted = null; // se lee al pedirlo por primera vez
let level = null; // y el volumen, igual
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
    if (!sound.buffers.length) {
      load(name);
      return null;
    }
    const context = runningAudioContext();
    if (!context) return null; // nadie ha tocado aún la página
    if (!master || master.context !== context) {
      master = context.createGain();
      master.gain.value = this.volume;
      master.connect(context.destination);
    }
    const source = context.createBufferSource();
    source.buffer = pick(sound);
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

  // El volumen que elige el usuario, de 0 a 1, por encima del propio de cada sonido.
  get volume() {
    if (level === null) {
      let guardado = null;
      try { guardado = localStorage.getItem(LEVEL_STORE); } catch { /* sin almacenamiento */ }
      level = guardado === null ? 1 : Math.max(0, Math.min(1, Number(guardado) / 100 || 0));
    }
    return level;
  },
  set volume(value) {
    level = Math.max(0, Math.min(1, value));
    try { localStorage.setItem(LEVEL_STORE, String(Math.round(level * 100))); } catch { /* solo esta sesión */ }
    if (master) master.gain.value = level;
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
