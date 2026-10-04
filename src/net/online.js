import { connectMqtt } from './mqtt.js';

// LAS PARTIDAS ONLINE. Lo pidió el usuario: que cualquiera que entre pueda elegir «Online» y empiece una
// partida con otro que también lo haya pedido, gratis y sin servidor propio. Así que todo va por brokers
// MQTT públicos (`mqtt.js`): son buzones abiertos donde cada uno publica en un tema y recibe lo de los
// temas a los que se ha suscrito.
//
// - EL BUS: se conecta a varios brokers a la vez y publica en todos; lo que llega repetido se descarta. Si
//   uno se cae o no contesta, bastan los otros; y dos jugadores se encuentran mientras compartan uno. El
//   primero va por el puerto 443, el de las webs, que pasa por cualquier red (los otros van por puertos
//   propios, y hay wifis que los cierran). Si se corta (el móvil en segundo plano), vuelve a conectar solo.
// - EL EMPAREJAMIENTO: quien busca rival lo anuncia en la sala común cada dos segundos («seek»). Al ver a
//   otro, el de identificador MENOR le hace una oferta en su buzón (así no se la hacen los dos a la vez);
//   el otro la acepta y el primero confirma («go»). Tres pasos y no dos: si mientras tanto alguno se ha
//   emparejado con otro, lo dice («cancel») y los dos siguen buscando, sin quedarse nadie colgado. Juega
//   con blancas uno de los dos a suertes, y con el reloj de quien llevaba más tiempo esperando.
// - LA PARTIDA: cada uno publica sus jugadas en el tema de la partida, numeradas. Cada cuatro segundos,
//   un latido con cuántas jugadas lleva: si uno se ha perdido alguna (un corte), el otro le manda la lista
//   entera. Sin latidos del rival en un rato, se avisa de que se ha perdido la conexión.

// Usuario y contraseña de shiftr.io: los públicos de su instancia de pruebas, que son de su documentación.
export const BROKERS = [
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
];
const PREFIX = 'mrdonut-bchess/v1';
const LOBBY = `${PREFIX}/lobby`;
const inbox = (id) => `${PREFIX}/p/${id}`;
const gameTopic = (game) => `${PREFIX}/g/${game}`;

export const SEEK_EVERY = 2000; // cada cuánto se anuncia quien busca
const SEEN_FOR = 7000; // un anuncio de hace más de esto ya no cuenta: se ha ido
const ANSWER_WAIT = 4500; // lo que se espera a que contesten a una oferta (o a que confirmen)
const RETRY_AFTER = 6000; // a quien no contestó, no se le vuelve a ofrecer hasta pasado esto
export const PING_EVERY = 4000;
export const LOST_AFTER = 20000; // sin noticias del rival en este tiempo: conexión perdida

// Los temporizadores de verdad (envueltos: en el navegador, `setInterval` no se puede llamar como
// método de otro objeto). Las pruebas pasan otros, más rápidos.
const TIMERS = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h),
  every: (fn, ms) => setInterval(fn, ms),
  stop: (h) => clearInterval(h),
};

export const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ---- El bus: varios brokers como si fueran uno ----
export function createBus({ urls = BROKERS, clientId = `bchess-${randomId()}`, connect = connectMqtt, retry = 2500 } = {}) {
  const temas = new Set();
  const oyentes = new Set();
  const vistos = new Set();
  const orden = [];
  const clientes = new Map(); // url → cliente conectado
  let seq = 0;
  let cerrado = false;

  function recibe(topic, texto) {
    let msg;
    try {
      msg = JSON.parse(texto);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.mid !== 'string') return;
    if (vistos.has(msg.mid)) return;
    vistos.add(msg.mid);
    orden.push(msg.mid);
    if (orden.length > 600) vistos.delete(orden.shift());
    for (const fn of oyentes) fn(topic, msg);
  }

  async function engancha(broker) {
    const { url, username = null, password = null } = typeof broker === 'string' ? { url: broker } : broker;
    while (!cerrado) {
      try {
        const c = await connect(url, { clientId: `${clientId}-${urls.indexOf(broker)}`, username, password });
        if (cerrado) {
          c.close();
          return;
        }
        clientes.set(url, c);
        c.onMessage(recibe);
        for (const t of temas) c.subscribe(t);
        await new Promise((resolve) => c.onClose(resolve));
        clientes.delete(url);
      } catch {
        // no contesta: se vuelve a probar
      }
      if (!cerrado) await new Promise((resolve) => setTimeout(resolve, retry));
    }
  }

  // Resuelve cuando hay al menos un broker; la rechaza si ninguno contesta en `timeout`.
  const listo = new Promise((resolve, reject) => {
    const plazo = setTimeout(() => {
      if (!clientes.size) reject(new Error('Sin conexión con ningún broker'));
    }, 9000);
    const mira = setInterval(() => {
      if (clientes.size) {
        clearInterval(mira);
        clearTimeout(plazo);
        resolve();
      } else if (cerrado) {
        clearInterval(mira);
        clearTimeout(plazo);
      }
    }, 50);
  });
  for (const broker of urls) engancha(broker);

  return {
    ready: listo,
    get connected() {
      return clientes.size > 0;
    },
    subscribe(topic) {
      temas.add(topic);
      for (const c of clientes.values()) c.subscribe(topic);
    },
    publish(topic, msg) {
      seq += 1;
      const texto = JSON.stringify({ ...msg, mid: `${clientId}:${seq}` });
      for (const c of clientes.values()) c.publish(topic, texto);
    },
    onMessage(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    close() {
      cerrado = true;
      for (const c of clientes.values()) c.close();
      clientes.clear();
    },
  };
}

// ---- El emparejamiento ----
// `bus`: { subscribe, publish, onMessage }. `me`: mi identificador. `time`: el reloj que he elegido.
// Devuelve { found: Promise<{ game, white, time, opponent }>, seekers(): cuántos más buscan, stop() }.
export function createMatchmaker({ bus, me, time, now = Date.now, random = Math.random, timers = TIMERS }) {
  const since = now();
  const seekers = new Map(); // id → { since, time, seen }
  const tried = new Map(); // id → cuándo se le ofreció sin respuesta
  let state = 'seeking'; // 'offering' | 'accepted' | 'matched' | 'stopped'
  let pending = null; // la oferta que he hecho: { to, game, white, time }
  let accepted = null; // la que he aceptado: { from, game, white, time }
  let plazo = null;
  let resolveFound;
  const found = new Promise((resolve) => {
    resolveFound = resolve;
  });

  const to = (id, msg) => bus.publish(inbox(id), { ...msg, from: me });
  const fresh = (id) => {
    const s = seekers.get(id);
    return s && now() - s.seen < SEEN_FOR;
  };
  const espera = (fn) => {
    timers.clear(plazo);
    plazo = timers.set(fn, ANSWER_WAIT);
  };

  function offer(id) {
    const s = seekers.get(id);
    const game = `${me}-${id}-${Math.floor(random() * 1e9).toString(36)}`;
    const white = random() < 0.5 ? me : id;
    // El reloj, el de quien lleva más rato esperando.
    const reloj = s.since < since ? s.time : time;
    pending = { to: id, game, white, time: reloj };
    state = 'offering';
    to(id, { k: 'offer', game, white, time: reloj });
    espera(() => {
      if (state === 'offering' && pending?.game === game) {
        tried.set(id, now());
        pending = null;
        state = 'seeking';
        tick();
      }
    });
  }

  function match(info) {
    state = 'matched';
    timers.clear(plazo);
    timers.stop(anuncio);
    off();
    bus.publish(LOBBY, { k: 'leave', from: me });
    resolveFound(info);
  }

  // Si estoy libre, le ofrezco partida al primero que busca y tiene un identificador mayor que el mío.
  function tick() {
    if (state !== 'seeking') return;
    for (const id of [...seekers.keys()].sort()) {
      if (id <= me || !fresh(id)) continue;
      const t = tried.get(id);
      if (t !== undefined && now() - t < RETRY_AFTER) continue;
      offer(id);
      return;
    }
  }

  const off = bus.onMessage((topic, msg) => {
    if (state === 'matched' || state === 'stopped' || msg.from === me) return;
    if (topic === LOBBY) {
      if (msg.k === 'seek') {
        seekers.set(msg.from, { since: msg.since, time: msg.time, seen: now() });
        tick();
      } else if (msg.k === 'leave') {
        seekers.delete(msg.from);
      }
      return;
    }
    if (topic !== inbox(me)) return;
    if (msg.k === 'offer') {
      if (state === 'seeking' || state === 'offering') {
        if (state === 'offering') to(pending.to, { k: 'cancel', game: pending.game });
        pending = null;
        accepted = { from: msg.from, game: msg.game, white: msg.white, time: msg.time };
        state = 'accepted';
        to(msg.from, { k: 'accept', game: msg.game });
        const game = msg.game;
        espera(() => {
          if (state === 'accepted' && accepted?.game === game) {
            accepted = null;
            state = 'seeking';
            tick();
          }
        });
      } else {
        to(msg.from, { k: 'decline', game: msg.game });
      }
    } else if (msg.k === 'accept') {
      if (state === 'offering' && pending?.game === msg.game && pending.to === msg.from) {
        to(msg.from, { k: 'go', game: msg.game });
        match({ game: pending.game, white: pending.white, time: pending.time, opponent: msg.from });
      } else {
        to(msg.from, { k: 'cancel', game: msg.game });
      }
    } else if (msg.k === 'go') {
      if (state === 'accepted' && accepted?.game === msg.game && accepted.from === msg.from) {
        match({ game: accepted.game, white: accepted.white, time: accepted.time, opponent: msg.from });
      } else {
        to(msg.from, { k: 'cancel', game: msg.game });
      }
    } else if (msg.k === 'decline' || msg.k === 'cancel') {
      if (state === 'offering' && pending?.game === msg.game) {
        tried.set(pending.to, now());
        pending = null;
        state = 'seeking';
        tick();
      } else if (state === 'accepted' && accepted?.game === msg.game) {
        accepted = null;
        state = 'seeking';
        tick();
      }
    }
  });

  bus.subscribe(LOBBY);
  bus.subscribe(inbox(me));
  const anuncia = () => {
    if (state === 'seeking' || state === 'offering') bus.publish(LOBBY, { k: 'seek', from: me, since, time });
    tick();
  };
  const anuncio = timers.every(anuncia, SEEK_EVERY);
  anuncia();

  return {
    found,
    get state() {
      return state;
    },
    // Cuántos más buscan ahora mismo.
    seekers() {
      return [...seekers.keys()].filter(fresh).length;
    },
    stop() {
      if (state === 'matched' || state === 'stopped') return;
      if (state === 'offering') to(pending.to, { k: 'cancel', game: pending.game });
      if (state === 'accepted') to(accepted.from, { k: 'cancel', game: accepted.game });
      state = 'stopped';
      timers.clear(plazo);
      timers.stop(anuncio);
      off();
      bus.publish(LOBBY, { k: 'leave', from: me });
      resolveFound(null);
    },
  };
}

// ---- La partida ----
// `moves()`: las jugadas que llevo (para el latido y para poner al día al rival). Eventos (`on`): 'move'
// ({ n, uci }), 'press' ({ side, n, white, black }), 'sync' ({ moves }), 'resign', 'bye', 'lost', 'back',
// 'cancel' (el rival no llegó a empezar: se había emparejado con otro).
export function createSession({ bus, me, game, opponent, white, moves, now = Date.now, timers = TIMERS }) {
  const topic = gameTopic(game);
  const oyentes = new Map();
  let visto = now();
  let perdido = false;
  let cerrada = false;
  let supoAlgo = false; // el rival ya ha dicho algo en la partida
  const emit = (k, data) => {
    for (const fn of oyentes.get(k) ?? []) fn(data);
  };
  const send = (k, data = {}) => {
    if (!cerrada) bus.publish(topic, { ...data, k, from: me });
  };

  const off = bus.onMessage((t, msg) => {
    if (cerrada || msg.from !== opponent) return;
    if (t === inbox(me)) {
      if (msg.k === 'cancel' && msg.game === game && !supoAlgo) {
        cerrar();
        emit('cancel');
      }
      return;
    }
    if (t !== topic) return;
    supoAlgo = true;
    visto = now();
    if (perdido) {
      perdido = false;
      emit('back');
    }
    if (msg.k === 'ping') {
      const mias = moves();
      if (typeof msg.n === 'number' && msg.n < mias.length) send('sync', { moves: mias });
      else if (typeof msg.n === 'number' && msg.n > mias.length) send('want');
    } else if (msg.k === 'want') {
      send('sync', { moves: moves() });
    } else if (msg.k === 'move' && typeof msg.uci === 'string') {
      emit('move', { n: msg.n, uci: msg.uci });
    } else if (msg.k === 'sync' && Array.isArray(msg.moves)) {
      emit('sync', { moves: msg.moves.filter((m) => typeof m === 'string') });
    } else if (msg.k === 'press') {
      emit('press', msg);
    } else if (msg.k === 'resign' || msg.k === 'bye') {
      cerrar();
      emit(msg.k);
    }
  });
  bus.subscribe(topic);

  const latido = timers.every(() => {
    send('ping', { n: moves().length });
    if (!perdido && now() - visto > LOST_AFTER) {
      perdido = true;
      emit('lost');
    }
  }, PING_EVERY);
  send('ping', { n: moves().length });

  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    timers.stop(latido);
    off();
  }

  return {
    game,
    opponent,
    color: white === me ? 'white' : 'black',
    get lost() {
      return perdido;
    },
    on(k, fn) {
      if (!oyentes.has(k)) oyentes.set(k, new Set());
      oyentes.get(k).add(fn);
      return () => oyentes.get(k).delete(fn);
    },
    move(n, uci) {
      send('move', { n, uci });
    },
    // He pulsado mi reloj tras la jugada `n` (las que van, contando esa): lo que nos queda a cada uno.
    press(side, remaining, n) {
      send('press', { side, n, white: remaining.white, black: remaining.black });
    },
    // Se va: abandona (`resign`) o se marcha sin más (`bye`, al acabar).
    leave(k = 'bye') {
      send(k);
      cerrar();
    },
  };
}

// ---- Todo junto, para el juego ----
// `find({ time, onStatus })`: busca rival y resuelve con { session, color, time }, o null si se cancela.
// `onStatus({ phase: 'connecting' | 'searching' | 'found' | 'error', seekers })`.
export function createOnline({ urls = BROKERS } = {}) {
  let bus = null;
  let busca = null;
  const me = randomId();

  function getBus() {
    if (!bus) bus = createBus({ urls, clientId: `bchess-${me}` });
    return bus;
  }

  return {
    me,
    async find({ time, onStatus = () => {} }) {
      busca?.stop();
      onStatus({ phase: 'connecting', seekers: 0 });
      const b = getBus();
      try {
        await b.ready;
      } catch {
        onStatus({ phase: 'error', seekers: 0 });
        return null;
      }
      const mm = createMatchmaker({ bus: b, me, time });
      busca = mm;
      const cuenta = setInterval(() => onStatus({ phase: 'searching', seekers: mm.seekers() }), 1000);
      onStatus({ phase: 'searching', seekers: 0 });
      const info = await mm.found;
      clearInterval(cuenta);
      if (busca === mm) busca = null;
      if (!info) return null;
      onStatus({ phase: 'found', seekers: 0 });
      return { info, color: info.white === me ? 'white' : 'black', time: info.time };
    },
    // La sesión de la partida emparejada; `moves()` da las jugadas que lleva el juego.
    session(info, moves) {
      return createSession({ bus: getBus(), me, game: info.game, opponent: info.opponent, white: info.white, moves });
    },
    cancel() {
      busca?.stop();
      busca = null;
    },
  };
}
