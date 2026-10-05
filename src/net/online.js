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
//   propios, y hay wifis que los cierran). Si se corta (el móvil en segundo plano), vuelve a conectar solo;
//   una conexión callada se da por muerta, al volver al primer plano se comprueba ya (`revive`), y lo que se
//   publicó sin conexión sale al reconectar.
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
// - LA PARTIDA, en su tema (`…/g/<partida>`), con mensajes que se comprueban antes de usarlos:
//   · «move» {n, uci}: cada uno publica su jugada, numerada, en cuanto la hace (antes de animarla).
//   · «press» {side, n, white, black}: tras animarla, lo que marca su reloj; el suyo manda sobre el mío.
//   · «ping» {n}: cada cuatro segundos, cuántas jugadas conoce (las hechas, la que anima y las del rival que
//     ya le han llegado). Quien tiene más le manda la lista entera («sync»); quien tiene menos la pide
//     («want»). Así se recupera lo que se pierde en un corte.
//   · «resign»: se rinde; «bye»: se va al acabar. Y en mi buzón, «cancel»: el rival no llegó a empezarla.
//   Sin noticias del rival en un rato, se avisa de que se ha perdido la conexión; en más, se da por ido.

// Usuario y contraseña de shiftr.io: los públicos de su instancia de pruebas, que son de su documentación.
export const BROKERS = [
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
];
const PREFIX = 'mrdonut-bchess/v1';
export const LOBBY = `${PREFIX}/lobby`;
export const inbox = (id) => `${PREFIX}/p/${id}`;
export const gameTopic = (game) => `${PREFIX}/g/${game}`;

// LO QUE LLEGA DE LA RED NO SE CREE A CIEGAS: el código es público y cualquiera puede publicar en estos temas.
// Los identificadores acaban dentro de temas MQTT (`…/p/<id>`, `…/g/<partida>`), y con un «#» o un «+» ahí
// publicar va contra el protocolo y el broker corta la conexión: un solo «seek» falso con `from: "~#"` hacía
// que todos los que buscaban rival le ofrecieran partida y los brokers los echaran, una y otra vez.
const ID = /^[a-z0-9]{1,24}$/; // como los de `randomId`
const PARTIDA = /^[a-z0-9]{1,24}-[a-z0-9]{1,24}-[a-z0-9]{1,8}$/; // `${quien ofrece}-${a quién}-${suerte}`
export const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
export const MAX_JUGADAS = 600; // ninguna partida de verdad llega a tantas (ni a la mitad)
const MAX_TIEMPO = 8 * 24 * 3600 * 1000; // lo más que puede marcar un reloj: la diaria de 7 días, y algo
// (Siempre mirando que sea texto: `RegExp.test` convierte lo que le den, y `undefined` pasaría por un id.)
export const esId = (s) => typeof s === 'string' && ID.test(s);
const esJugada = (uci) => typeof uci === 'string' && UCI.test(uci);
const esRitmo = (time) => typeof time === 'string' && time.length <= 32;
const esEntero = (n, max = MAX_JUGADAS) => Number.isInteger(n) && n >= 0 && n <= max;
const esTiempo = (ms) => Number.isFinite(ms) && ms >= 0 && ms <= MAX_TIEMPO;
// Una partida que me ofrece (o a la que me reta) `de`: la ha nombrado él, con él delante y yo detrás.
const esPartidaDe = (game, de, para) => typeof game === 'string' && PARTIDA.test(game) && game.startsWith(`${de}-${para}-`);

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

const RETRY_MAX = 60000; // lo más que se espera para volver a probar un broker que no contesta

export const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const SANO_MS = 15000; // un broker vivo contesta al latido cada 10 s: si en esto no ha dicho nada, algo pasa
const SONDEO_MS = 3000; // al volver al primer plano, lo que se le da a cada broker para contestar
const GUARDA_MS = 30000; // lo publicado hace menos de esto se reenvía al broker que (re)conecta
// Lo que se repite solo (y lo que solo contesta a eso): no hace falta reenviarlo.
const PERIODICOS = new Set(['here', 'seek', 'ping', 'want', 'sync']);

// ---- El bus: varios brokers como si fueran uno ----
// Además de publicar y suscribirse:
// - `whenReady(ms)`: resuelve en cuanto hay un broker (ya, si lo hay); la rechaza si en `ms` no hay ninguno.
//   Antes era una sola promesa que se rechazaba una vez para siempre: si el juego se abría sin red, «Buscar
//   rival» decía «No hay conexión» hasta recargar, aunque la red hubiera vuelto.
// - `onEstado(fn)`: fn('conectado', url) cada vez que un broker (re)conecta, ya suscrito a todo y con lo
//   reciente reenviado; fn('desconectado') al quedarse sin ninguno; fn('revive') al volver al primer plano.
// - `sano`: algún broker ha dicho algo hace poco. Con la conexión callada (o el móvil recién despertado) no
//   se sabe si el rival calla o si el que no tiene red soy yo.
// - `revive()`: al volver al primer plano o al volver la red: pregunta a cada broker si sigue vivo (y el que
//   no contesta en 3 s, fuera y a conectar de nuevo) y despierta a los que esperaban para volver a probar.
// - Lo que se publica sin conexión (o justo antes de un corte) no se pierde: se guarda medio minuto y se
//   reenvía al broker que conecta (quien ya lo tenía lo descarta por su `mid`). Una rendición o una jugada
//   hechas en un túnel salen al volver la cobertura.
// - `corta(s)`, `zombi(s)`, `estado()`: para probar a mano (`bchess.red` en la consola).
export function createBus({ urls = BROKERS, clientId = `bchess-${randomId()}`, connect = connectMqtt, retry = 2500, now = Date.now, timers = TIMERS } = {}) {
  const temas = new Set();
  const oyentes = new Set();
  const estados = new Set();
  const vistos = new Set();
  const orden = [];
  const clientes = new Map(); // url → cliente conectado
  const recientes = []; // lo publicado hace poco (sin lo periódico): { topic, texto, at }
  const despertadores = new Set(); // las esperas de `engancha` que `revive` puede acortar
  let seq = 0;
  let cerrado = false;
  let cortadaHasta = 0; // `corta`: hasta entonces no se vuelve a conectar

  const cambia = (estado, url) => {
    for (const fn of [...estados]) fn(estado, url);
  };
  function alEstado(fn) {
    estados.add(fn);
    return () => estados.delete(fn);
  }
  function sano() {
    const ahora = now();
    for (const c of clientes.values()) if (c.oido === undefined || ahora - c.oido < SANO_MS) return true;
    return false;
  }
  function olvidaViejos() {
    const ahora = now();
    while (recientes.length && (ahora - recientes[0].at > GUARDA_MS || recientes.length > 200)) recientes.shift();
  }

  function recibe(topic, texto) {
    let msg;
    try {
      msg = JSON.parse(texto);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof msg.mid !== 'string') return;
    // Todos los mensajes del juego dicen qué son y de quién: lo demás (o un remitente que no es un
    // identificador, que acabaría en un tema) se tira aquí, en un solo sitio.
    if (typeof msg.k !== 'string' || !esId(msg.from)) return;
    if (vistos.has(msg.mid)) return;
    vistos.add(msg.mid);
    orden.push(msg.mid);
    if (orden.length > 600) vistos.delete(orden.shift());
    for (const fn of oyentes) fn(topic, msg);
  }

  // Una espera que `revive` puede acortar (resuelve true si la ha despertado él).
  function duerme(ms) {
    return new Promise((resolve) => {
      const fin = (despertada) => {
        timers.clear(plazo);
        despertadores.delete(fin);
        resolve(despertada);
      };
      const plazo = timers.set(() => fin(false), ms);
      despertadores.add(fin);
    });
  }

  // Un broker recién conectado: se suscribe a todo, se le reenvía lo reciente y se avisa. Resuelve al
  // cerrarse, con el motivo.
  async function usa(url, c) {
    clientes.set(url, c);
    const cerrada = new Promise((resolve) => c.onClose(resolve));
    c.onMessage(recibe);
    for (const t of temas) c.subscribe(t);
    olvidaViejos();
    for (const r of recientes) c.publish(r.topic, r.texto);
    cambia('conectado', url);
    const motivo = await cerrada;
    clientes.delete(url);
    if (!clientes.size) cambia('desconectado', url);
    return motivo;
  }

  // Si no contesta, se vuelve a probar, cada vez esperando el doble (hasta un minuto): hay redes que cierran
  // los puertos de algunos brokers, y probar cada dos segundos para siempre solo gasta batería. Pero al volver
  // al primer plano (o la red) se prueba ya: antes se esperaba lo que tocara, hasta un minuto.
  async function engancha(broker, i) {
    const { url, username = null, password = null } = typeof broker === 'string' ? { url: broker } : broker;
    let espera = retry;
    while (!cerrado) {
      const cortada = cortadaHasta - now();
      if (cortada > 0) {
        await duerme(cortada);
        continue;
      }
      let ya = false;
      try {
        const c = await connect(url, { clientId: `${clientId}-${i}`, username, password });
        if (cerrado) {
          c.close();
          return;
        }
        espera = retry;
        const motivo = await usa(url, c);
        // La hemos dado por muerta nosotros (callada, o sin contestar al volver): otra, enseguida.
        ya = motivo === 'callado' || motivo === 'sondeo' || motivo === 'corta';
      } catch {
        // no contesta: se vuelve a probar, más tarde
      }
      if (cerrado || ya) continue;
      espera = (await duerme(espera)) ? retry : Math.min(espera * 2, RETRY_MAX);
    }
  }
  urls.forEach((broker, i) => engancha(broker, i));

  return {
    get connected() {
      return clientes.size > 0;
    },
    get sano() {
      return sano();
    },
    whenReady(ms = 9000) {
      if (clientes.size) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const quita = alEstado((estado) => {
          if (estado !== 'conectado') return;
          timers.clear(plazo);
          quita();
          resolve();
        });
        const plazo = timers.set(() => {
          quita();
          reject(new Error('Sin conexión con ningún broker'));
        }, ms);
      });
    },
    onEstado: alEstado,
    subscribe(topic) {
      temas.add(topic);
      for (const c of clientes.values()) c.subscribe(topic);
    },
    // Ya no interesa (una partida acabada): ni llega ni se vuelve a pedir al reconectar.
    unsubscribe(topic) {
      if (!temas.delete(topic)) return;
      for (const c of clientes.values()) c.unsubscribe?.(topic);
    },
    publish(topic, msg) {
      seq += 1;
      const texto = JSON.stringify({ ...msg, mid: `${clientId}:${seq}` });
      for (const c of clientes.values()) c.publish(topic, texto);
      if (!PERIODICOS.has(msg.k)) {
        recientes.push({ topic, texto, at: now() });
        olvidaViejos();
      }
    },
    onMessage(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
    revive() {
      if (cerrado) return;
      for (const despierta of [...despertadores]) despierta(true);
      for (const c of [...clientes.values()]) c.probe?.(SONDEO_MS);
      cambia('revive');
    },
    // Para probar a mano. `corta(s)`: fuera todas las conexiones, y sin volver a conectar en `s` segundos.
    corta(s = 15) {
      cortadaHasta = now() + s * 1000;
      for (const c of [...clientes.values()]) c.matar?.('corta');
    },
    // `zombi(s)`: las conexiones siguen abiertas pero durante `s` segundos no pasa nada por ellas (lo que
    // deja el iPhone al despertar). Se tienen que dar por muertas solas, o al volver al primer plano.
    zombi(s = 60) {
      for (const c of clientes.values()) c.zombi?.(s * 1000);
    },
    estado() {
      const ahora = now();
      return {
        conectados: [...clientes.keys()],
        sano: sano(),
        oido: Object.fromEntries([...clientes].map(([url, c]) => [url, c.oido === undefined ? null : `hace ${Math.round((ahora - c.oido) / 1000)} s`])),
        cortada: Math.max(0, Math.ceil((cortadaHasta - ahora) / 1000)),
        temas: [...temas],
        guardados: recientes.length,
      };
    },
    close() {
      cerrado = true;
      for (const c of clientes.values()) c.close();
      clientes.clear();
      for (const despierta of [...despertadores]) despierta(true);
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
    offEstado?.();
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
        // Su reloj puede acabar siendo el de la partida: si no es un ritmo, sin reloj.
        seekers.set(msg.from, { since: Number.isFinite(msg.since) ? msg.since : now(), time: esRitmo(msg.time) ? msg.time : 'libre:libre', seen: now() });
        tick();
      } else if (msg.k === 'leave') {
        seekers.delete(msg.from);
      }
      return;
    }
    if (topic !== inbox(me)) return;
    if (msg.k === 'offer') {
      // Una oferta de verdad la ha nombrado quien la hace (`${él}-${yo}-…`), juega con blancas uno de los dos
      // y trae un ritmo. Si no, es falsa o de algo roto: ni se contesta. (Con otro color, los dos creían
      // llevar las negras; con «#» por partida, uno se suscribía a todas.)
      if (!esPartidaDe(msg.game, msg.from, me) || (msg.white !== me && msg.white !== msg.from) || !esRitmo(msg.time)) return;
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
  // Al volver la conexión, se anuncia ya (el bus que no lo tenga, como el de las pruebas, no avisa).
  const offEstado = bus.onEstado?.((estado) => estado === 'conectado' && anuncia());
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
      offEstado?.();
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
      // Como las ofertas del emparejamiento: nombrada por quien reta, uno de los dos con blancas y un ritmo.
      if (!esPartidaDe(msg.game, msg.from, me) || (msg.white !== me && msg.white !== msg.from) || !esRitmo(msg.time)) return;
      if (recibidos.has(msg.game) || aceptando.has(msg.game)) return;
      const reto = {
        game: msg.game,
        from: msg.from,
        name: cleanName(msg.name),
        time: msg.time,
        white: msg.white,
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
  // Al volver la conexión, se dice ya que sigo aquí (sin esperar al latido).
  const offEstado = bus.onEstado?.((estado) => estado === 'conectado' && anuncia());
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
      offEstado?.();
    },
  };
}

// ---- La partida ----
// `moves()`: las jugadas que conozco (`partida.js`, `conocidas`): las que cuento en el latido y las que mando
// para poner al día al rival. Eventos (`on`), solo con lo que el rival dice con sentido: 'move' ({ n, uci }),
// 'press' ({ side, n, white, black }), 'sync' ({ moves }), 'resign', 'bye', 'lost' (calla), 'back' (vuelve),
// 'gone' (calla demasiado) y 'cancel' (no llegó a empezar: se había emparejado con otro).
export function createSession({ bus, me, game, opponent, white, moves, now = Date.now, timers = TIMERS }) {
  const topic = gameTopic(game);
  const oyentes = new Map();
  const suyo = white === opponent ? 'white' : 'black'; // el color del rival
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
  // Lo que dice el rival, solo si tiene sentido: sus jugadas son las de su color (las pares si lleva blancas),
  // escritas como jugadas y dentro de una partida posible; su reloj, el suyo y con tiempos de verdad. Antes, un
  // `press` con otro bando escribía mi tiempo en el reloj del rival, y una lista sin fin se aceptaba entera.
  function vale(msg) {
    switch (msg.k) {
      case 'ping': return esEntero(msg.n);
      case 'want': case 'resign': case 'bye': return true;
      case 'move': return esEntero(msg.n, MAX_JUGADAS - 1) && msg.n % 2 === (suyo === 'white' ? 0 : 1) && esJugada(msg.uci);
      case 'sync': return Array.isArray(msg.moves) && msg.moves.length <= MAX_JUGADAS && msg.moves.every(esJugada);
      case 'press': return msg.side === suyo && esEntero(msg.n) && esTiempo(msg.white) && esTiempo(msg.black);
      default: return false;
    }
  }

  const off = bus.onMessage((t, msg) => {
    if (cerrada || msg.from !== opponent) return;
    if (t === inbox(me)) {
      if (msg.k === 'cancel' && msg.game === game && !supoAlgo) {
        cerrar();
        emit('cancel');
      }
      return;
    }
    if (t !== topic || !vale(msg)) return;
    supoAlgo = true;
    visto = now();
    if (perdido) {
      perdido = false;
      emit('back');
    }
    if (msg.k === 'ping') {
      const mias = moves();
      if (msg.n < mias.length) send('sync', { moves: mias });
      else if (msg.n > mias.length) send('want');
    } else if (msg.k === 'want') {
      send('sync', { moves: moves() });
    } else if (msg.k === 'move') {
      emit('move', { n: msg.n, uci: msg.uci });
    } else if (msg.k === 'sync') {
      emit('sync', { moves: [...msg.moves] });
    } else if (msg.k === 'press') {
      emit('press', { side: msg.side, n: msg.n, white: msg.white, black: msg.black });
    } else if (msg.k === 'resign' || msg.k === 'bye') {
      cerrar();
      emit(msg.k);
    }
  });
  // Mi buzón, por mi cuenta: el «cancel» del rival llega ahí, y antes solo se oía si la sala o el
  // emparejamiento se habían suscrito antes.
  bus.subscribe(inbox(me));
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
  // Al volver la conexión, un latido ya: si algo se perdió mientras tanto, se pide en el momento.
  const offEstado = bus.onEstado?.((estado) => estado === 'conectado' && send('ping', { n: moves().length }));

  // Se acabó del todo: ni latidos, ni oídos, ni su tema (antes se seguía suscrito a todas las partidas
  // jugadas, y al reconectar se volvían a pedir todas).
  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    timers.stop(latido);
    off();
    offEstado?.();
    bus.unsubscribe?.(topic);
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
  let busquedas = 0; // cada búsqueda (y cada cancelación) cambia el número: lo que llegue tarde no cuenta
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
    async find({ time, name = '', onStatus = () => {} }) {
      busca?.stop();
      const turno = ++busquedas;
      onStatus({ phase: 'connecting', seekers: 0 });
      const b = getBus();
      try {
        await b.whenReady();
      } catch {
        if (turno === busquedas) onStatus({ phase: 'error', seekers: 0 });
        return null;
      }
      // Cancelada mientras conectaba: sin esto, la búsqueda empezaba igual por detrás, y quien se
      // emparejara con ella se quedaba esperando una partida que aquí nadie iba a jugar.
      if (turno !== busquedas) return null;
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
    // La sesión de la partida emparejada; `moves()` da las jugadas que conoce el juego (`createSession`).
    session(info, moves) {
      return createSession({ bus: getBus(), me, game: info.game, opponent: info.opponent, white: info.white, moves });
    },
    cancel() {
      busquedas += 1;
      busca?.stop();
      busca = null;
    },
    // Al volver al primer plano o al volver la red: los brokers se comprueban ya (`createBus`).
    revive() {
      bus?.revive();
    },
    // Para probar a mano desde la consola (`bchess.red`): `corta(s)` deja sin red `s` segundos, `zombi(s)`
    // deja las conexiones abiertas pero mudas (como al despertar el iPhone) y `estado()` dice cómo están.
    red: {
      corta: (s) => getBus().corta(s),
      zombi: (s) => getBus().zombi(s),
      estado: () => getBus().estado(),
    },
  };
}
