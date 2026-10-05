import { connectMqtt } from './mqtt.js';
import { cleanName } from '../names.js';

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
// - LA SALA: cada uno, mientras tiene el juego abierto, dice cada cuatro segundos que sigue ahí, con su
//   nombre y qué hace (en el menú, buscando rival o jugando). Así se ve quién hay, y se le puede retar a
//   uno en concreto: el reto le llega a su buzón, lo acepta o lo rechaza, y quien retó confirma (los mismos
//   tres pasos que el emparejamiento, con mensajes propios para no cruzarse con él). Un reto caduca al
//   minuto.
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
export const GONE_AFTER = 90000; // y en este: se ha ido (cerró la app sin despedirse)

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
// `name`: mi nombre (puede ir vacío), que el rival sabe al emparejarse.
// Devuelve { found: Promise<{ game, white, time, opponent, opponentName }>, seekers(): cuántos más
// buscan, stop() }.
export function createMatchmaker({ bus, me, time, name = '', now = Date.now, random = Math.random, timers = TIMERS }) {
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
    to(id, { k: 'offer', game, white, time: reloj, name });
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
        accepted = { from: msg.from, game: msg.game, white: msg.white, time: msg.time, name: cleanName(msg.name) };
        state = 'accepted';
        to(msg.from, { k: 'accept', game: msg.game, name });
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
        match({ game: pending.game, white: pending.white, time: pending.time, opponent: msg.from, opponentName: cleanName(msg.name) });
      } else {
        to(msg.from, { k: 'cancel', game: msg.game });
      }
    } else if (msg.k === 'go') {
      if (state === 'accepted' && accepted?.game === msg.game && accepted.from === msg.from) {
        match({ game: accepted.game, white: accepted.white, time: accepted.time, opponent: msg.from, opponentName: accepted.name });
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
    if (state === 'seeking' || state === 'offering') bus.publish(LOBBY, { k: 'seek', from: me, since, time, name });
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

// ---- La sala: quién está conectado y los retos directos ----
export const PRESENCE_EVERY = 4000; // cada cuánto dice cada uno que sigue ahí
export const PRESENT_FOR = 13000; // sin noticias suyas en este tiempo, ya no está
export const INVITE_FOR = 60000; // lo que dura un reto sin contestar
const GO_WAIT = 6000; // tras aceptar un reto, lo que se espera la confirmación de quien retó
const STATUSES = ['menu', 'seeking', 'playing'];

// `bus`, `me`: como en el emparejamiento. Devuelve:
// - players(): los que hay ({ id, name, status, games }), sin uno mismo; onPlayers(fn), cada vez que cambia.
// - set({ name, status, games }): lo que digo de mí.
// - invite(id, { time }): reta a `id`; { promise, cancel }. La promesa da el emparejamiento ({ game, white,
//   time, opponent, opponentName }) o { declined | expired | canceled: true }.
// - onInvite(fn): los retos que llegan ({ game, from, name, time, expires }) y los que se retiran
//   ({ game, gone: true }). acceptInvite(game) da el emparejamiento (o null); declineInvite(game).
export function createLobby({ bus, me, now = Date.now, random = Math.random, timers = TIMERS }) {
  const players = new Map(); // id → { id, name, status, games, seen }
  const oyentes = new Set();
  const retosOyentes = new Set();
  const enviados = new Map(); // game → { to, white, time, name, resolve, plazo }
  const recibidos = new Map(); // game → { game, from, name, time, white, expires, plazo }
  const aceptando = new Map(); // game → { reto, resolve, plazo }
  let yo = { name: '', status: 'menu', games: 0 };
  let cerrada = false;

  const to = (id, msg) => bus.publish(inbox(id), { ...msg, from: me });
  const lista = () => [...players.values()]
    .filter((p) => now() - p.seen < PRESENT_FOR)
    .map(({ id, name, status, games }) => ({ id, name, status, games }))
    .sort((a, b) => (a.name || '\uffff').localeCompare(b.name || '\uffff') || a.id.localeCompare(b.id));
  const avisa = () => {
    const l = lista();
    for (const fn of oyentes) fn(l);
  };
  const retoAvisa = (reto) => {
    for (const fn of retosOyentes) fn(reto);
  };
  function retira(game) {
    const reto = recibidos.get(game);
    if (!reto) return;
    recibidos.delete(game);
    timers.clear(reto.plazo);
    retoAvisa({ game, gone: true });
  }

  const off = bus.onMessage((topic, msg) => {
    if (cerrada || msg.from === me) return;
    if (topic === LOBBY) {
      const antes = players.get(msg.from);
      if (msg.k === 'here') {
        players.set(msg.from, {
          id: msg.from,
          name: cleanName(msg.name),
          status: STATUSES.includes(msg.status) ? msg.status : 'menu',
          games: Math.max(0, Math.min(99, Number(msg.games) || 0)),
          seen: now(),
        });
        avisa();
      } else if (msg.k === 'seek') {
        // Quien busca rival al azar también está (aunque sea de antes de la sala y no diga más).
        players.set(msg.from, { id: msg.from, games: 0, ...antes, name: cleanName(msg.name) || antes?.name || '', status: 'seeking', seen: now() });
        avisa();
      } else if (msg.k === 'leave' && antes) {
        // Ha dejado de buscar (el latido dirá qué hace ahora).
        players.set(msg.from, { ...antes, status: antes.status === 'seeking' ? 'menu' : antes.status });
        avisa();
      } else if (msg.k === 'gone' && antes) {
        players.delete(msg.from);
        avisa();
      }
      return;
    }
    if (topic !== inbox(me) || typeof msg.game !== 'string') return;
    if (msg.k === 'invite') {
      if (recibidos.has(msg.game) || aceptando.has(msg.game)) return;
      const reto = {
        game: msg.game,
        from: msg.from,
        name: cleanName(msg.name),
        time: typeof msg.time === 'string' ? msg.time : 'libre:libre',
        white: msg.white === me ? me : msg.from,
        expires: now() + INVITE_FOR,
      };
      reto.plazo = timers.set(() => retira(msg.game), INVITE_FOR);
      recibidos.set(msg.game, reto);
      retoAvisa({ game: reto.game, from: reto.from, name: reto.name, time: reto.time, expires: reto.expires });
    } else if (msg.k === 'invite-cancel') {
      retira(msg.game);
      const a = aceptando.get(msg.game);
      if (a) {
        aceptando.delete(msg.game);
        timers.clear(a.plazo);
        a.resolve(null);
      }
    } else if (msg.k === 'invite-accept') {
      const s = enviados.get(msg.game);
      if (s && s.to === msg.from) {
        enviados.delete(msg.game);
        timers.clear(s.plazo);
        to(msg.from, { k: 'invite-go', game: msg.game });
        s.resolve({ game: msg.game, white: s.white, time: s.time, opponent: msg.from, opponentName: cleanName(msg.name) || s.name });
      } else {
        to(msg.from, { k: 'invite-cancel', game: msg.game });
      }
    } else if (msg.k === 'invite-decline') {
      const s = enviados.get(msg.game);
      if (s && s.to === msg.from) {
        enviados.delete(msg.game);
        timers.clear(s.plazo);
        s.resolve({ declined: true });
      }
    } else if (msg.k === 'invite-go') {
      const a = aceptando.get(msg.game);
      if (a && a.reto.from === msg.from) {
        aceptando.delete(msg.game);
        timers.clear(a.plazo);
        a.resolve({ game: a.reto.game, white: a.reto.white, time: a.reto.time, opponent: a.reto.from, opponentName: a.reto.name });
      }
    }
  });

  function anuncia() {
    if (cerrada) return;
    bus.publish(LOBBY, { k: 'here', from: me, name: yo.name, status: yo.status, games: yo.games });
    let cambio = false;
    for (const [id, p] of players) {
      if (now() - p.seen >= PRESENT_FOR) {
        players.delete(id);
        cambio = true;
      }
    }
    if (cambio) avisa();
  }
  bus.subscribe(LOBBY);
  bus.subscribe(inbox(me));
  const latido = timers.every(anuncia, PRESENCE_EVERY);
  anuncia();

  return {
    players: lista,
    get me() {
      return me;
    },
    set(cambios) {
      yo = { ...yo, ...cambios, name: cleanName(cambios.name ?? yo.name) };
      anuncia();
    },
    onPlayers(fn) {
      oyentes.add(fn);
      fn(lista());
      return () => oyentes.delete(fn);
    },
    onInvite(fn) {
      retosOyentes.add(fn);
      return () => retosOyentes.delete(fn);
    },
    invite(id, { time = 'libre:libre' } = {}) {
      const game = `${me}-${id}-${Math.floor(random() * 1e9).toString(36)}`;
      const white = random() < 0.5 ? me : id;
      let resolver;
      const promise = new Promise((resolve) => {
        resolver = resolve;
      });
      const plazo = timers.set(() => {
        if (!enviados.has(game)) return;
        enviados.delete(game);
        to(id, { k: 'invite-cancel', game });
        resolver({ expired: true });
      }, INVITE_FOR);
      enviados.set(game, { to: id, white, time, name: players.get(id)?.name ?? '', resolve: resolver, plazo });
      to(id, { k: 'invite', game, white, time, name: yo.name });
      return {
        game,
        promise,
        cancel() {
          const s = enviados.get(game);
          if (!s) return;
          enviados.delete(game);
          timers.clear(s.plazo);
          to(id, { k: 'invite-cancel', game });
          s.resolve({ canceled: true });
        },
      };
    },
    acceptInvite(game) {
      const reto = recibidos.get(game);
      if (!reto) return Promise.resolve(null);
      recibidos.delete(game);
      timers.clear(reto.plazo);
      to(reto.from, { k: 'invite-accept', game, name: yo.name });
      return new Promise((resolve) => {
        const plazo = timers.set(() => {
          aceptando.delete(game);
          resolve(null);
        }, GO_WAIT);
        aceptando.set(game, { reto, resolve, plazo });
      });
    },
    declineInvite(game) {
      const reto = recibidos.get(game);
      if (!reto) return;
      recibidos.delete(game);
      timers.clear(reto.plazo);
      to(reto.from, { k: 'invite-decline', game });
    },
    // Los retos que tengo sin contestar.
    invites() {
      return [...recibidos.values()].map(({ game, from, name, time, expires }) => ({ game, from, name, time, expires }));
    },
    close() {
      if (cerrada) return;
      for (const [game, s] of enviados) {
        to(s.to, { k: 'invite-cancel', game });
        timers.clear(s.plazo);
        s.resolve({ canceled: true });
      }
      enviados.clear();
      for (const game of [...recibidos.keys()]) this.declineInvite(game);
      bus.publish(LOBBY, { k: 'gone', from: me });
      cerrada = true;
      timers.stop(latido);
      off();
    },
  };
}

// ---- La partida ----
// `moves()`: las jugadas que llevo (para el latido y para poner al día al rival). Eventos (`on`): 'move'
// ({ n, uci }), 'press' ({ side, n, white, black }), 'sync' ({ moves }), 'resign', 'bye', 'lost', 'back', 'gone',
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
    if (now() - visto > GONE_AFTER) {
      cerrar();
      emit('gone');
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
// `find({ time, name, onStatus })`: busca rival y resuelve con { info, color, time, opponentName }, o null si
// se cancela.
// `onStatus({ phase: 'connecting' | 'searching' | 'found' | 'error', seekers })`.
export function createOnline({ urls = BROKERS } = {}) {
  let bus = null;
  let busca = null;
  const me = randomId();

  function getBus() {
    if (!bus) bus = createBus({ urls, clientId: `bchess-${me}` });
    return bus;
  }

  let sala = null;
  return {
    me,
    // La sala (quién hay y los retos), que se conecta al pedirla y se queda abierta.
    lobby() {
      if (!sala) sala = createLobby({ bus: getBus(), me });
      return sala;
    },
    get connected() {
      return Boolean(bus?.connected);
    },
    async find({ time, name = '', onStatus = () => {} }) {
      busca?.stop();
      onStatus({ phase: 'connecting', seekers: 0 });
      const b = getBus();
      try {
        await b.ready;
      } catch {
        onStatus({ phase: 'error', seekers: 0 });
        return null;
      }
      const mm = createMatchmaker({ bus: b, me, time, name: cleanName(name) });
      busca = mm;
      const cuenta = setInterval(() => onStatus({ phase: 'searching', seekers: mm.seekers() }), 1000);
      onStatus({ phase: 'searching', seekers: 0 });
      const info = await mm.found;
      clearInterval(cuenta);
      if (busca === mm) busca = null;
      if (!info) return null;
      return { info, color: info.white === me ? 'white' : 'black', time: info.time, opponentName: info.opponentName ?? '' };
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
