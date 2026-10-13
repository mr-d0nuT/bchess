import { connectMqtt } from './mqtt.js';
import { cleanName } from '../names.js';
import { ONLINE_CATEGORIES, categoryOf } from '../rating/ratings.js';

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
//   · «ping» {n, h}: cada cuatro segundos, cuántas jugadas conoce (las hechas, la que anima y las del rival que
//     ya le han llegado) y su huella. Quien tiene más le manda la lista entera («sync»); quien tiene menos la
//     pide («want»). Así se recupera lo que se pierde en un corte. Si las huellas no casan, se anula.
//   · «reclamo» {n, que: 'time'}: a mí su reloj me marca cero (cada uno manda en el reloj de su jugador); él
//     contesta con «reloj» {n, white, black} (lo que de verdad marca el suyo) o, si de verdad se le acabó,
//     acabándola.
//   · «fin» {status, winner, flagged, moves}: quien acaba la partida dice cómo (el mismo final para los dos:
//     'resign' es que se rinde quien no gana) y lo deja guardado en `…/g/<partida>/fin/<id>` para el rival que
//     ahora no tenga red; «fin-ok», que se ha enterado (y lo guardado se borra).
//   Y en mi buzón, «cancel» (o «invite-cancel»): el rival no llegó a empezarla. Sin noticias del rival en un
//   rato (con mi conexión sana), se avisa de que se ha perdido la conexión; en más, se puede reclamar la victoria.
// - LA DIARIA (tantos días por jugada): los dos casi nunca están a la vez, así que cada uno deja guardadas en el broker
//   (`retain`) sus jugadas, con la hora de la última, en `…/g/<partida>/estado/<id>` («estado» {moves, at}): al rival le
//   llegan en cuanto abre el juego, aunque sea días después. Su silencio no cuenta (callar es lo normal): solo el plazo
//   de cada jugada, que cuenta desde que se hizo.

// Usuario y contraseña de shiftr.io: los públicos de su instancia de pruebas, que son de su documentación.
export const BROKERS = [
  { url: 'wss://public.cloud.shiftr.io', username: 'public', password: 'public' },
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
];
// v2: el final de la partida cambió («fin» en vez de «bye»). Con otro prefijo, los aparatos que aún tengan
// guardada la versión de antes no se cruzan con los nuevos (no se verán en la sala hasta que actualicen).
const PREFIX = 'mrdonut-bchess/v2';
const PV = 3; // la versión del protocolo, en lo que se anuncia: para poder entenderse con las siguientes
// Desde la 3, el rival al azar se propone antes de empezar (`confirma`): con uno de antes, que empieza sin preguntar, no
// hay manera de entenderse (él empezaba y yo esperaba su «sí»; se quedaba esperando a un rival que nunca llegaba), así
// que al azar solo se empareja con los de la 3 en adelante. Los retos directos, igual que antes, con todos.
const PV_PROPUESTA = 3;
const entiendePropuesta = (msg) => Number(msg.pv) >= PV_PROPUESTA;
export const LOBBY = `${PREFIX}/lobby`;
export const inbox = (id) => `${PREFIX}/p/${id}`;
export const gameTopic = (game) => `${PREFIX}/g/${game}`;
// Donde cada uno deja guardado su final de la partida (`retain`), para el rival que ahora no tiene conexión.
export const finTopic = (game, id) => `${gameTopic(game)}/fin/${id}`;
// Y, en la diaria, sus jugadas (`retain`): para el rival que abrirá el juego más tarde.
export const estadoTopic = (game, id) => `${gameTopic(game)}/estado/${id}`;

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
const esHora = (ms) => Number.isFinite(ms) && ms > 0; // una hora de reloj de verdad (milisegundos desde 1970)
// Una partida que me ofrece (o a la que me reta) `de`: la ha nombrado él, con él delante y yo detrás.
const esPartidaDe = (game, de, para) => typeof game === 'string' && PARTIDA.test(game) && game.startsWith(`${de}-${para}-`);

export const SEEK_EVERY = 2000; // cada cuánto se anuncia quien busca
const SEEN_FOR = 7000; // un anuncio de hace más de esto ya no cuenta: se ha ido
const ANSWER_WAIT = 4500; // lo que se espera a que contesten a una oferta (o a que confirmen)
const RETRY_AFTER = 6000; // a quien no contestó, no se le vuelve a ofrecer hasta pasado esto
export const PING_EVERY = 4000;
// Los silencios del rival solo cuentan mientras MI conexión está sana (ver `createSession`).
export const LOST_AFTER = 20000; // sin noticias del rival en este tiempo: conexión perdida
export const START_WAIT = 15000; // sin una sola noticia del rival al empezar: no ha llegado a la partida
const GO_AGAIN = 800; // el «go» (y el «invite-go») se manda dos veces: si se pierde el primero, una partida fantasma

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
  const recientes = []; // lo publicado hace poco (sin lo periódico): { topic, texto, retain, at }
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
  function guarda(topic, texto, retain) {
    recientes.push({ topic, texto, retain, at: now() });
    olvidaViejos();
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
    for (const r of recientes) c.publish(r.topic, r.texto, { retain: r.retain });
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
        const c = await connect(url, { clientId: `${clientId}${i}`, username, password });
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
    // `retain`: que el broker lo guarde para quien se suscriba después (`finTopic`).
    publish(topic, msg, { retain = false } = {}) {
      seq += 1;
      const texto = JSON.stringify({ ...msg, mid: `${clientId}:${seq}` });
      for (const c of clientes.values()) c.publish(topic, texto, { retain });
      if (!PERIODICOS.has(msg.k)) guarda(topic, texto, retain);
    },
    // Borra lo que se dejó guardado en `topic` (un mensaje vacío con `retain`; a quien lo recibe no le dice nada).
    limpia(topic) {
      for (const c of clientes.values()) c.publish(topic, '', { retain: true });
      guarda(topic, '', true);
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

// LA PUNTUACIÓN QUE ANUNCIA CADA UNO ([r, rd], la de su ritmo): la dice él de sí mismo, y sin un servidor no hay
// forma de comprobarla (cualquiera puede decir que tiene 3000). Sirve para emparejar con alguien parecido y para
// enseñarla, no para nada que haya que creerse. Con sentido (r entre 100 y 3500, rd entre 45 y 350); si no, la de
// empezar.
export const PUNTUACION_INICIAL = { r: 1200, rd: 350 };
export function leePuntuacion(rt) {
  const [r, rd] = Array.isArray(rt) ? rt : [];
  const vale = Number.isFinite(r) && r >= 100 && r <= 3500 && Number.isFinite(rd) && rd >= 45 && rd <= 350;
  return vale ? { r, rd } : { ...PUNTUACION_INICIAL };
}
// Y la mía, para anunciarla: redondeada.
export const anunciaPuntuacion = (p) => [Math.round(p?.r ?? PUNTUACION_INICIAL.r), Math.round(p?.rd ?? PUNTUACION_INICIAL.rd)];
// Las de todos los ritmos online, en la sala: { bala: [r, rd], blitz: …, rapida: …, diaria: … }. Lo que no tenga
// sentido, la de empezar.
export function leePuntuaciones(rt) {
  const todas = rt && typeof rt === 'object' && !Array.isArray(rt) ? rt : {};
  return Object.fromEntries(ONLINE_CATEGORIES.map((c) => [c, leePuntuacion(todas[c])]));
}
// La de un ritmo, de una de esas listas (o la de empezar).
export const puntuacionEn = (todas, time) => todas?.[categoryOf({ mode: 'online', time })] ?? { ...PUNTUACION_INICIAL };

// El ritmo que se anuncia o se propone online: el que sea (la diaria también), o sin reloj si no es un ritmo.
export const esDiaria = (time) => String(time).split(':')[0] === 'diaria';
export const ritmoOnline = (time) => (esRitmo(time) ? time : 'libre:libre');

const MEZCLA_TRAS = 15000; // buscando más que esto, también con quien busca otro ritmo
const VENTANA = 200; // la diferencia de puntuación con que se empieza a buscar
const VENTANA_CRECE = 100; // y lo que se ensancha…
const VENTANA_CADA = 5000; // …cada tanto buscando

// ---- El emparejamiento ----
// `bus`: { subscribe, publish, onMessage }. `me`: mi identificador. `time`: el reloj que he elegido.
// `name`: mi nombre (puede ir vacío), que el rival sabe al emparejarse. `rating(time)`: mi puntuación en un ritmo
// ({ r, rd }; o, si es la misma para todos, el objeto).
// `evita(id)`: si a ese no se le empareja (se propuso hace poco y uno de los dos prefirió buscar otro).
// Devuelve { found: Promise<{ game, white, time, opponent, opponentName, opponentRating }>, seekers(): cuántos
// más buscan, stop() }.
export function createMatchmaker({ bus, me, time, name = '', rating = null, evita = () => false, now = Date.now, random = Math.random, timers = TIMERS }) {
  const since = now();
  const miRitmo = ritmoOnline(time);
  const puntuacionPara = (t) => leePuntuacion(anunciaPuntuacion(typeof rating === 'function' ? rating(t) : rating));
  const miPuntuacion = puntuacionPara(miRitmo);
  const seekers = new Map(); // id → { since, time, seen, r, rd }
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
    // El reloj: el mismo si buscamos el mismo; si no (pasado un rato), el de quien lleva más rato esperando.
    const reloj = s.time === miRitmo || s.since >= since ? miRitmo : s.time;
    pending = { to: id, game, white, time: reloj };
    state = 'offering';
    to(id, { k: 'offer', pv: PV, game, white, time: reloj, name, rt: anunciaPuntuacion(puntuacionPara(reloj)) });
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

  // Si estoy libre, le ofrezco partida a uno de los que buscan con un identificador mayor que el mío (así no nos
  // ofrecemos los dos a la vez): primero a quien busca mi mismo ritmo y con la puntuación más parecida a la mía,
  // dentro de una ventana que se ensancha cuanto más se busca (200 puntos, y 100 más cada 5 s); pasados 15 s, también
  // a quien busca otro ritmo. Antes se le ofrecía al primero de la lista, con el ritmo que fuera, y el reloj lo
  // ponía quien llevara más rato esperando: a quien quería una bala le podía tocar una rápida.
  function tick() {
    if (state !== 'seeking') return;
    const buscando = now() - since;
    const ventana = VENTANA + VENTANA_CRECE * Math.floor(buscando / VENTANA_CADA);
    let mejor = null;
    for (const [id, s] of seekers) {
      if (id <= me || !fresh(id) || evita(id)) continue;
      const t = tried.get(id);
      if (t !== undefined && now() - t < RETRY_AFTER) continue;
      const otroRitmo = s.time !== miRitmo;
      // Con otro ritmo, pasado un rato; pero la diaria, nunca con uno de reloj (ni al revés): son otra cosa.
      if (otroRitmo && (buscando < MEZCLA_TRAS || esDiaria(s.time) !== esDiaria(miRitmo))) continue;
      const diferencia = Math.abs(s.r - miPuntuacion.r);
      if (diferencia > ventana) continue;
      const orden = [otroRitmo ? 1 : 0, diferencia, id];
      if (!mejor || orden[0] < mejor[0] || (orden[0] === mejor[0] && (orden[1] < mejor[1] || (orden[1] === mejor[1] && id < mejor[2])))) mejor = orden;
    }
    if (mejor) offer(mejor[2]);
  }

  const off = bus.onMessage((topic, msg) => {
    if (state === 'matched' || state === 'stopped' || msg.from === me) return;
    if (topic === LOBBY) {
      if (msg.k === 'seek') {
        if (!entiendePropuesta(msg)) return; // uno de antes: no nos entenderíamos
        // Su reloj puede acabar siendo el de la partida: si no es un ritmo (o es la diaria), sin reloj.
        seekers.set(msg.from, { since: Number.isFinite(msg.since) ? msg.since : now(), time: ritmoOnline(msg.time), seen: now(), ...leePuntuacion(msg.rt) });
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
      if ((state === 'seeking' || state === 'offering') && esDiaria(msg.time) === esDiaria(miRitmo) && !evita(msg.from) && entiendePropuesta(msg)) {
        if (state === 'offering') to(pending.to, { k: 'cancel', game: pending.game });
        pending = null;
        accepted = { from: msg.from, game: msg.game, white: msg.white, time: msg.time, name: cleanName(msg.name), rating: leePuntuacion(msg.rt) };
        state = 'accepted';
        to(msg.from, { k: 'accept', game: msg.game, name, rt: anunciaPuntuacion(puntuacionPara(msg.time)) });
        const game = msg.game;
        espera(() => {
          if (state === 'accepted' && accepted?.game === game) {
            // Su «go» no ha llegado: se le dice, que él sí la habrá empezado (y si no, se quedaba esperando).
            to(accepted.from, { k: 'cancel', game });
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
        // Dos veces: si el primero se pierde, yo empezaría la partida y él no (el repetido no hace nada).
        const go = { k: 'go', game: msg.game };
        to(msg.from, go);
        timers.set(() => to(msg.from, go), GO_AGAIN);
        match({ game: pending.game, white: pending.white, time: pending.time, opponent: msg.from, opponentName: cleanName(msg.name), opponentRating: leePuntuacion(msg.rt) });
      } else {
        to(msg.from, { k: 'cancel', game: msg.game });
      }
    } else if (msg.k === 'go') {
      if (state === 'accepted' && accepted?.game === msg.game && accepted.from === msg.from) {
        match({ game: accepted.game, white: accepted.white, time: accepted.time, opponent: msg.from, opponentName: accepted.name, opponentRating: accepted.rating });
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
    if (state === 'seeking' || state === 'offering') {
      bus.publish(LOBBY, { k: 'seek', pv: PV, from: me, since, time: miRitmo, name, rt: anunciaPuntuacion(miPuntuacion) });
    }
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
export const CONFIRMA_FOR = 30000; // lo que dura la propuesta de un rival al azar sin contestar
const LISTO_CADA = 1500; // «listo» se repite mientras el otro no contesta (por si se pierde)
const LISTO_OTRA = 800; // y una vez más al empezar, por si el suyo llegó y el mío no
const STATUSES = ['menu', 'seeking', 'playing'];

// `bus`, `me`: como en el emparejamiento. Devuelve:
// - players(): los que hay ({ id, name, status, games, rt? }), sin uno mismo; onPlayers(fn), cada vez que cambia.
//   `rt`: sus puntuaciones por ritmo (`leePuntuaciones`), si las dice.
// - set({ name, status, games, rt }): lo que digo de mí (`rt`: mis puntuaciones, { bala: [r, rd], … }).
// - invite(id, { time, white, revancha }): reta a `id`; { promise, cancel }. La promesa da el emparejamiento ({ game,
//   white, time, opponent, opponentName, opponentRating }) o { declined | expired | canceled: true }. `white`: quién
//   lleva las blancas (uno de los dos; si no, a suertes); `revancha`: que es la revancha de la partida de antes.
// - onInvite(fn): los retos que llegan ({ game, from, name, time, rating, expires, color, revancha }: `color`, con el
//   que juego yo) y los que se retiran ({ game, gone: true }). acceptInvite(game) da el emparejamiento (o null);
//   declineInvite(game).
export function createLobby({ bus, me, now = Date.now, random = Math.random, timers = TIMERS }) {
  const players = new Map(); // id → { id, name, status, games, seen }
  const oyentes = new Set();
  const retosOyentes = new Set();
  const enviados = new Map(); // game → { to, white, time, name, resolve, plazo }
  const recibidos = new Map(); // game → { game, from, name, time, white, expires, plazo }
  const aceptando = new Map(); // game → { reto, resolve, plazo }
  const confirmando = new Map(); // game → { opponent, llega(k) }: las propuestas de un rival al azar
  const llegadas = new Map(); // game → { from, kinds, at }: lo que llegó de una antes de proponerla aquí
  let yo = { name: '', status: 'menu', games: 0 };
  let cerrada = false;

  const to = (id, msg) => bus.publish(inbox(id), { ...msg, from: me });
  const lista = () => [...players.values()]
    .filter((p) => now() - p.seen < PRESENT_FOR)
    .map(({ id, name, status, games, rt, time }) => ({ id, name, status, games, ...(rt ? { rt } : {}), ...(status === 'seeking' && time ? { time } : {}) }))
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
        const status = STATUSES.includes(msg.status) ? msg.status : 'menu';
        // Buscando rival, a qué ritmo: el que dice (o el de su último «seek»).
        const ritmo = status !== 'seeking' ? null : esRitmo(msg.time) ? ritmoOnline(msg.time) : antes?.time;
        players.set(msg.from, {
          id: msg.from,
          name: cleanName(msg.name),
          status,
          games: Math.max(0, Math.min(99, Number(msg.games) || 0)),
          seen: now(),
          ...(msg.rt !== undefined ? { rt: leePuntuaciones(msg.rt) } : {}),
          ...(ritmo ? { time: ritmo } : {}),
        });
        avisa();
      } else if (msg.k === 'seek') {
        // Quien busca rival al azar también está (aunque sea de antes de la sala y no diga más), con su ritmo.
        players.set(msg.from, {
          id: msg.from, games: 0, ...antes, name: cleanName(msg.name) || antes?.name || '', status: 'seeking', time: ritmoOnline(msg.time), seen: now(),
        });
        avisa();
      } else if (msg.k === 'leave' && antes) {
        // Ha dejado de buscar (el latido dirá qué hace ahora).
        const resto = { ...antes };
        delete resto.time;
        players.set(msg.from, { ...resto, status: antes.status === 'seeking' ? 'menu' : antes.status });
        avisa();
      } else if (msg.k === 'gone' && antes) {
        players.delete(msg.from);
        avisa();
      }
      return;
    }
    if (topic !== inbox(me) || typeof msg.game !== 'string') return;
    if (msg.k === 'listo' || msg.k === 'paso') {
      const c = confirmando.get(msg.game);
      if (c) {
        if (c.opponent === msg.from) c.llega(msg.k);
        return;
      }
      // Aún no se ha propuesto aquí (su emparejamiento ha llegado antes que el mío): se guarda un rato.
      for (const [game, l] of llegadas) if (now() - l.at > CONFIRMA_FOR) llegadas.delete(game);
      if (llegadas.size > 20) return;
      const l = llegadas.get(msg.game) ?? { from: msg.from, kinds: new Set(), at: now() };
      if (l.from === msg.from) l.kinds.add(msg.k);
      llegadas.set(msg.game, l);
      return;
    }
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
        rating: leePuntuacion(msg.rt),
        expires: now() + INVITE_FOR,
        revancha: msg.revancha === true,
      };
      reto.plazo = timers.set(() => retira(msg.game), INVITE_FOR);
      recibidos.set(msg.game, reto);
      retoAvisa({
        game: reto.game, from: reto.from, name: reto.name, time: reto.time, rating: reto.rating, expires: reto.expires,
        color: reto.white === me ? 'white' : 'black', revancha: reto.revancha,
      });
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
        // Dos veces, como el «go» del emparejamiento: perdido el primero, él se quedaba sin partida y yo con una.
        const go = { k: 'invite-go', game: msg.game };
        to(msg.from, go);
        timers.set(() => to(msg.from, go), GO_AGAIN);
        s.resolve({ game: msg.game, white: s.white, time: s.time, opponent: msg.from, opponentName: cleanName(msg.name) || s.name, opponentRating: leePuntuacion(msg.rt) });
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
        a.resolve({ game: a.reto.game, white: a.reto.white, time: a.reto.time, opponent: a.reto.from, opponentName: a.reto.name, opponentRating: a.reto.rating });
      }
    }
  });

  function anuncia() {
    if (cerrada) return;
    bus.publish(LOBBY, {
      k: 'here', pv: PV, from: me, name: yo.name, status: yo.status, games: yo.games, ...(yo.rt ? { rt: yo.rt } : {}),
      ...(yo.status === 'seeking' && yo.time ? { time: yo.time } : {}),
    });
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
    invite(id, { time: ritmo = 'libre:libre', white: blancas = null, revancha = false } = {}) {
      const time = ritmoOnline(ritmo); // el que sea (la diaria también); si no es un ritmo, sin reloj
      const game = `${me}-${id}-${Math.floor(random() * 1e9).toString(36)}`;
      // Los colores que se piden (la revancha, cambiados), si son de uno de los dos; si no, a suertes.
      const white = blancas === me || blancas === id ? blancas : random() < 0.5 ? me : id;
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
      to(id, { k: 'invite', pv: PV, game, white, time, name: yo.name, rt: anunciaPuntuacion(puntuacionEn(leePuntuaciones(yo.rt), time)), ...(revancha ? { revancha: true } : {}) });
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
      to(reto.from, { k: 'invite-accept', game, name: yo.name, rt: anunciaPuntuacion(puntuacionEn(leePuntuaciones(yo.rt), reto.time)) });
      return new Promise((resolve) => {
        const plazo = timers.set(() => {
          // Su confirmación no ha llegado: se le dice, que él sí la habrá empezado (y si no, se quedaba esperando).
          aceptando.delete(game);
          to(reto.from, { k: 'invite-cancel', game });
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
    // EL RIVAL AL AZAR, PROPUESTO (lo pidió el usuario): antes de empezar, los dos ven con quién, a qué ritmo y con qué
    // color, y cada uno dice por el buzón del otro si la quiere («listo») o busca otro («paso»). Empieza si dicen que sí
    // los dos; si uno no quiere, o nadie contesta en `espera`, no. Devuelve { acepta(), rechaza(), promise }: la
    // promesa da 'empieza', 'paso' (no la quise yo), 'rival' (no la quiso él) o 'tiempo'.
    confirma(info, { espera = CONFIRMA_FOR } = {}) {
      const { game, opponent } = info;
      let mio = false;
      let suyo = false;
      let acabada = false;
      let insiste = null;
      let resolver;
      const promise = new Promise((resolve) => {
        resolver = resolve;
      });
      const dice = (k) => to(opponent, { k, game });
      const termina = (como) => {
        if (acabada) return;
        acabada = true;
        timers.clear(plazo);
        if (insiste !== null) timers.stop(insiste);
        confirmando.delete(game);
        resolver(como);
      };
      const empieza = () => {
        dice('listo');
        timers.set(() => dice('listo'), LISTO_OTRA);
        termina('empieza');
      };
      const llega = (k) => {
        if (k === 'paso') {
          termina('rival');
          return;
        }
        suyo = true;
        if (mio) empieza();
      };
      confirmando.set(game, { opponent, llega });
      const plazo = timers.set(() => {
        if (acabada) return;
        dice('paso');
        termina('tiempo');
      }, espera);
      const antes = llegadas.get(game);
      llegadas.delete(game);
      if (antes?.from === opponent) for (const k of antes.kinds) llega(k);
      return {
        promise,
        acepta() {
          if (acabada || mio) return;
          mio = true;
          if (suyo) {
            empieza();
            return;
          }
          dice('listo');
          insiste = timers.every(() => dice('listo'), LISTO_CADA);
        },
        rechaza() {
          if (acabada) return;
          dice('paso');
          timers.set(() => dice('paso'), LISTO_OTRA);
          termina('paso');
        },
      };
    },
    // Los retos que tengo sin contestar.
    invites() {
      return [...recibidos.values()].map(({ game, from, name, time, rating, expires, white, revancha }) => ({
        game, from, name, time, rating, expires, color: white === me ? 'white' : 'black', revancha,
      }));
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

// La huella de una lista de jugadas (FNV-1a de 32 bits): la misma en los dos lados si las listas son iguales.
// Va en cada latido, para notar que la partida ya no es la misma en los dos lados.
export function huella(moves) {
  let h = 0x811c9dc5;
  for (const ch of moves.join(' ')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// Cómo se puede acabar una partida: por las reglas (los dos lados lo ven solos al jugar las mismas jugadas) o por
// lo que decide uno (sin tiempo, se rinde, se va o se anula).
export const FINES_DE_REGLAS = ['checkmate', 'stalemate', 'fifty', 'repetition', 'material'];
const FINES = new Set([...FINES_DE_REGLAS, 'time', 'resign', 'abandon', 'agreement', 'anulada']);
// Las tablas, ofrecidas (`net/partida.js`): la oferta, el sí, el no y el «ya no vale», cada una con sus jugadas.
const TABLAS = new Set(['tablas', 'tablas-si', 'tablas-no', 'tablas-nula']);
// Las reacciones de la partida (`gesto`): solo estas, que lo que llega por la red no se enseña tal cual.
export const GESTOS = ['👋', '👍', '😮', '😅', '🔥', '🤝'];
const esColor = (c) => c === 'white' || c === 'black';
export const TERMINADA_MS = 10 * 60 * 1000; // acabada, lo que se espera a que el rival diga que se ha enterado

// ---- La partida ----
// `moves()`: las jugadas que conozco (`partida.js`, `conocidas`): las que cuento en el latido y las que mando
// para poner al día al rival. Eventos (`on`), solo con lo que el rival dice con sentido: 'move' ({ n, uci }),
// 'press' ({ side, n, white, black }), 'sync' ({ moves }), 'fin' ({ status, winner, flagged, moves }: cómo ha
// acabado para él), 'reclamo' ({ n }: a él le marca cero mi reloj), 'reloj' ({ n, white, black }: lo que marca el
// suyo, que no acepta mi reclamo), 'lost' (calla), 'back' (vuelve), 'cancel' (no llegó a empezar) y 'desync' (la
// partida ya no es la misma en los dos lados: se anula). Y `estado()`: { enlace, silencio, supoAlgo }.
//
// EL FINAL, EL MISMO EN LOS DOS LADOS (v2). Antes cada aparato decidía solo, con lo que sabía, y al acabar mandaba
// un «bye» que el rival, si aún estaba viendo el último combate, leía como un abandono: el que recibía el mate veía
// «Tu rival ha abandonado: ¡ganas!». Ahora quien acaba la partida (`terminar`) manda su «fin» con cómo ha acabado y
// sus jugadas, y además lo deja guardado en el broker (`finTopic`, con `retain`) para el rival que ahora no tenga
// red: le llegará en cuanto vuelva. La sesión se queda un rato contestando a sus latidos con ese «fin», hasta que
// él diga que se ha enterado («fin-ok», y lo guardado se borra) o pasen diez minutos.
//
// DESINCRONIZADA. Antes, si las dos listas de jugadas llegaban a ser distintas, los dos se mandaban la lista
// cada cuatro segundos para siempre, la partida se quedaba quieta y nadie decía nada. Ahora cada latido lleva
// la huella de las jugadas que cuenta (`h`): si dos seguidos no casan con las mías (o llega una lista que no
// empieza como la mía), se anula, y se le dice al rival (un «fin» anulado). Sin arreglos: haría falta deshacer
// jugadas en los dos tableros, y con lo que se comprueba ya todo lo que llega, no debería pasar nunca.
//
// EL QUE NO TIENE RED PUEDO SER YO. Con el móvil en el bolsillo dos minutos (o al pasar de wifi a datos), al
// volver mi aparato veía al rival callado todo ese rato y lo daba por ido: «¡ganas!»; y él, que me había visto
// callar a mí, también ganaba. Así que el silencio del rival solo cuenta mientras mi conexión está sana
// (`enlaceBien`: algún broker me ha dicho algo hace poco); sin ella, o al volver al primer plano, el reloj del
// silencio vuelve a cero. Y si su latido llega y el mío lleva un rato sin salir (una pestaña de fondo frena los
// temporizadores, pero no los mensajes), le contesto con otro: que él tampoco me dé por ido.
// Darlo por ido ya no es cosa de la sesión: cuánto lleva callado lo dice `estado()`, y quien juega decide (ofrece
// «Reclamar la victoria»; antes, a los dos minutos se ganaba solo, sin preguntar).
// Si al empezar el rival no dice nada en 15 s de conexión sana, no ha llegado a la partida ('cancel'), y lo
// mismo si me lo dice él en mi buzón («cancel» o «invite-cancel»: su confirmación no llegó).
//
// LA DIARIA (`diaria`): cada uno juega cuando puede, días después. Mis jugadas, con la hora de la última (`instante()`,
// o la de la jugada que sale), quedan guardadas en el broker (`estadoTopic`) al jugar, al empezar y al volver la
// conexión (por si el broker las perdió), y las del rival llegan de lo suyo guardado ('estado' { moves, at }). Su
// silencio no cuenta: ni «perdido» ni «no ha llegado», y para el juego calla cero (no hay victoria que reclamar).
export function createSession({ bus, me, game, opponent, white, moves, now = Date.now, timers = TIMERS, enlaceBien = () => true, reanudada = false, diaria = false, instante = now }) {
  const topic = gameTopic(game);
  const suFin = finTopic(game, opponent); // donde me deja guardado su final
  const miFin = finTopic(game, me);
  const suEstado = estadoTopic(game, opponent); // en la diaria, sus jugadas guardadas
  const miEstado = estadoTopic(game, me);
  const mio = white === me ? 'white' : 'black';
  const suyo = mio === 'white' ? 'black' : 'white'; // el color del rival
  const oyentes = new Map();
  let visto = now();
  let empezada = now(); // para saber si el rival no llega a empezarla
  let latidoEn = -Infinity; // cuándo salió mi último latido
  let perdido = false;
  let cerrada = false;
  let supoAlgo = reanudada; // el rival ya ha dicho algo en la partida (en una que se sigue tras recargar, sí)
  let distintas = 0; // latidos seguidos con una huella que no casa con mis jugadas
  let terminada = null; // mi final, ya mandado: { fin, desde }
  let suyoVisto = false; // su final ya ha llegado (llega por dos temas: el de la partida y el guardado)
  const emit = (k, data) => {
    for (const fn of oyentes.get(k) ?? []) fn(data);
  };
  const send = (k, data = {}) => {
    if (!cerrada) bus.publish(topic, { ...data, k, from: me });
  };
  const late = () => {
    const mias = moves();
    latidoEn = now();
    send('ping', { n: mias.length, h: huella(mias) });
  };
  // El silencio del rival vuelve a contar desde ahora (no sé si ha callado él o he callado yo); y si aún no ha
  // llegado a la partida, le quedan al menos unos segundos de conexión sana para llegar.
  const ceroSilencio = () => {
    visto = now();
    empezada = Math.max(empezada, now() - START_WAIT / 2);
  };
  const finDe = (f) => ({ status: f.status, winner: f.winner ?? null, flagged: f.flagged ?? null, moves: [...f.moves] });

  // En la diaria, mis jugadas, guardadas en el broker para el rival (con la hora `at` de la última).
  function guardaEstado(at) {
    if (!diaria || cerrada || terminada) return;
    const lista = moves();
    if (lista.length && esHora(at)) bus.publish(miEstado, { k: 'estado', moves: [...lista], at, from: me }, { retain: true });
  }

  // Se acabó aquí: mi final, al rival y guardado en el broker. Una vez.
  function terminar(fin) {
    if (cerrada || terminada) return;
    terminada = { fin: finDe(fin), desde: now() };
    send('fin', terminada.fin);
    bus.publish(miFin, { ...terminada.fin, k: 'fin', from: me }, { retain: true });
  }
  function anula() {
    terminar({ status: 'anulada', winner: null, flagged: null, moves: moves() });
  }
  function desincronizada() {
    anula();
    emit('desync');
  }

  // Lo que dice el rival, solo si tiene sentido: sus jugadas son las de su color (las pares si lleva blancas),
  // escritas como jugadas y dentro de una partida posible; su reloj, el suyo y con tiempos de verdad. Antes, un
  // `press` con otro bando escribía mi tiempo en el reloj del rival, y una lista sin fin se aceptaba entera.
  function vale(msg) {
    switch (msg.k) {
      case 'ping': return esEntero(msg.n) && (msg.h === undefined || (typeof msg.h === 'string' && msg.h.length <= 16));
      case 'want': case 'fin-ok': return true;
      case 'move': return esEntero(msg.n, MAX_JUGADAS - 1) && msg.n % 2 === (suyo === 'white' ? 0 : 1) && esJugada(msg.uci) && (msg.at === undefined || esHora(msg.at));
      case 'sync': return Array.isArray(msg.moves) && msg.moves.length <= MAX_JUGADAS && msg.moves.every(esJugada);
      case 'estado': return Array.isArray(msg.moves) && msg.moves.length > 0 && msg.moves.length <= MAX_JUGADAS && msg.moves.every(esJugada) && esHora(msg.at);
      case 'press': return msg.side === suyo && esEntero(msg.n) && esTiempo(msg.white) && esTiempo(msg.black);
      case 'reclamo': return esEntero(msg.n) && msg.que === 'time';
      case 'reloj': return esEntero(msg.n) && esTiempo(msg.white) && esTiempo(msg.black);
      case 'fin': return valeFin(msg);
      case 'tablas': case 'tablas-si': case 'tablas-no': case 'tablas-nula': return esEntero(msg.n, MAX_JUGADAS);
      case 'gesto': return GESTOS.includes(msg.e);
      default: return false;
    }
  }
  // Su final, con sentido: si se rinde, gano yo; si dice que me he ido, gana él; sin tiempo, uno de los dos; el
  // mate, con ganador; las tablas y la anulada, sin.
  function valeFin(msg) {
    if (!FINES.has(msg.status) || !(msg.winner === null || esColor(msg.winner)) || !(msg.flagged === null || esColor(msg.flagged))) return false;
    if (!Array.isArray(msg.moves) || msg.moves.length > MAX_JUGADAS || !msg.moves.every(esJugada)) return false;
    if (msg.status === 'resign') return msg.winner === mio;
    if (msg.status === 'abandon') return msg.winner === suyo;
    if (msg.status === 'time') return esColor(msg.flagged);
    if (msg.status === 'checkmate') return esColor(msg.winner);
    return msg.winner === null;
  }

  const off = bus.onMessage((t, msg) => {
    if (cerrada || msg.from !== opponent) return;
    if (t === inbox(me)) {
      if ((msg.k === 'cancel' || msg.k === 'invite-cancel') && msg.game === game && !supoAlgo) {
        cerrar();
        emit('cancel');
      }
      return;
    }
    const suyoGuardado = (t === suFin && msg.k === 'fin') || (diaria && t === suEstado && msg.k === 'estado');
    if (!((t === topic && msg.k !== 'estado') || suyoGuardado) || !vale(msg)) return;
    supoAlgo = true;
    visto = now();
    if (perdido) {
      perdido = false;
      emit('back');
    }
    if (msg.k === 'fin') {
      // Su final: que sepa que me he enterado (y borre lo guardado), y a decidir qué pasa aquí. Si yo no la había
      // acabado, ya no hay nada más que hablar.
      send('fin-ok');
      if (suyoVisto) return;
      suyoVisto = true;
      if (!terminada) cerrar();
      emit('fin', finDe(msg));
      return;
    }
    if (terminada) {
      // Acabada aquí: a lo que diga, mi final (por si no le llegó); y en cuanto se entera, fuera, y lo guardado también.
      if (msg.k === 'fin-ok') {
        bus.limpia?.(miFin);
        if (diaria) bus.limpia?.(miEstado);
        cerrar();
      } else if (msg.k === 'ping' || msg.k === 'want') {
        send('fin', terminada.fin);
      }
      return;
    }
    if (msg.k === 'ping') {
      const mias = moves();
      // Su huella, contra las mías hasta donde llega la suya (las que tengo de más aún no las sabe). Una sola
      // que no casa puede ser de paso; dos seguidas, no.
      if (typeof msg.h === 'string' && msg.n <= mias.length) {
        distintas = huella(mias.slice(0, msg.n)) === msg.h ? 0 : distintas + 1;
        if (distintas >= 2) {
          desincronizada();
          return;
        }
      }
      if (msg.n < mias.length) send('sync', { moves: mias });
      else if (msg.n > mias.length) send('want');
      if (now() - latidoEn >= PING_EVERY) late(); // mi latido lleva un rato sin salir: que sepa que sigo
    } else if (msg.k === 'want') {
      send('sync', { moves: moves() });
    } else if (msg.k === 'move') {
      emit('move', msg.at === undefined ? { n: msg.n, uci: msg.uci } : { n: msg.n, uci: msg.uci, at: msg.at });
    } else if (msg.k === 'estado') {
      // Lo que tiene guardado: como su lista entera, con la hora de su última jugada (una vieja, más corta, vale igual).
      const mias = moves();
      for (let i = 0; i < Math.min(mias.length, msg.moves.length); i++) {
        if (mias[i] !== msg.moves[i]) {
          desincronizada();
          return;
        }
      }
      emit('estado', { moves: [...msg.moves], at: msg.at });
    } else if (msg.k === 'sync') {
      // Hasta donde llegan las dos, han de ser iguales (una lista vieja, más corta, no dice nada nuevo).
      const mias = moves();
      for (let i = 0; i < Math.min(mias.length, msg.moves.length); i++) {
        if (mias[i] !== msg.moves[i]) {
          desincronizada();
          return;
        }
      }
      emit('sync', { moves: [...msg.moves] });
    } else if (msg.k === 'press') {
      emit('press', { side: msg.side, n: msg.n, white: msg.white, black: msg.black });
    } else if (msg.k === 'reclamo') {
      emit('reclamo', { n: msg.n });
    } else if (msg.k === 'reloj') {
      emit('reloj', { n: msg.n, white: msg.white, black: msg.black });
    } else if (TABLAS.has(msg.k)) {
      emit('tablas', { que: msg.k, n: msg.n });
    } else if (msg.k === 'gesto' && GESTOS.includes(msg.e)) {
      emit('gesto', { e: msg.e });
    }
  });
  // Mi buzón, por mi cuenta: el «cancel» del rival llega ahí, y antes solo se oía si la sala o el
  // emparejamiento se habían suscrito antes. Y su final guardado, que llega en cuanto me suscribo.
  bus.subscribe(inbox(me));
  bus.subscribe(topic);
  bus.subscribe(suFin);
  if (diaria) bus.subscribe(suEstado);

  const latido = timers.every(() => {
    // Acabada aquí, ya no late: solo se espera a que el rival se entere (lo guardado en el broker sigue ahí).
    if (terminada) {
      if (now() - terminada.desde > TERMINADA_MS) cerrar();
      return;
    }
    late();
    // Sin conexión sana, el silencio del rival no dice nada de él.
    if (!enlaceBien()) {
      ceroSilencio();
      return;
    }
    // En la diaria, callar días es lo normal: ni «no ha llegado» ni «perdido».
    if (diaria) return;
    if (!supoAlgo && now() - empezada > START_WAIT) {
      cerrar();
      emit('cancel');
      return;
    }
    if (!perdido && now() - visto > LOST_AFTER) {
      perdido = true;
      emit('lost');
    }
  }, PING_EVERY);
  late();
  guardaEstado(instante());
  // Al volver la conexión, un latido ya: si algo se perdió mientras tanto, se pide en el momento (y en la diaria, lo
  // mío se vuelve a dejar guardado). Y al volver al primer plano (`revive`), el silencio del rival vuelve a contar
  // desde cero.
  const offEstado = bus.onEstado?.((estado) => {
    if (estado === 'conectado' && !terminada) {
      late();
      guardaEstado(instante());
    } else if (estado === 'revive') ceroSilencio();
  });

  // Se acabó del todo: ni latidos, ni oídos, ni sus temas (antes se seguía suscrito a todas las partidas
  // jugadas, y al reconectar se volvían a pedir todas).
  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    timers.stop(latido);
    off();
    offEstado?.();
    bus.unsubscribe?.(topic);
    bus.unsubscribe?.(suFin);
    if (diaria) bus.unsubscribe?.(suEstado);
  }

  return {
    game,
    opponent,
    color: mio,
    get lost() {
      return perdido;
    },
    // Cómo va: `enlace`, si mi conexión está sana; `silencio`, cuánto lleva el rival sin decir nada con ella sana
    // (sin ella, cero: no se sabe si calla él o yo); `supoAlgo`, si ha llegado a decir algo en la partida.
    estado() {
      const enlace = enlaceBien();
      const contando = enlace && !terminada && !cerrada && !diaria;
      return { enlace, silencio: contando ? Math.max(0, now() - visto) : 0, supoAlgo };
    },
    // Acabada aquí, esperando a que el rival se entere.
    get terminada() {
      return Boolean(terminada);
    },
    on(k, fn) {
      if (!oyentes.has(k)) oyentes.set(k, new Set());
      oyentes.get(k).add(fn);
      return () => oyentes.get(k).delete(fn);
    },
    // Mi jugada `n`, hecha a la hora `at` (la de verdad): sale ya, y en la diaria queda guardada (con las de antes).
    move(n, uci, at = now()) {
      send('move', { n, uci, at });
      guardaEstado(at);
    },
    // He pulsado mi reloj tras la jugada `n` (las que van, contando esa): lo que nos queda a cada uno.
    press(side, remaining, n) {
      send('press', { side, n, white: remaining.white, black: remaining.black });
    },
    // Que me mande otra vez sus jugadas (la que llegó no valía aquí).
    pide() {
      send('want');
    },
    // A mí su reloj me marca cero, y le toca tras `n` jugadas: que conteste (o que acepte que ha perdido).
    reclama(n) {
      send('reclamo', { n, que: 'time' });
    },
    // No acepto su reclamo: lo que de verdad marca mi reloj.
    reloj({ n, white, black }) {
      send('reloj', { n, white, black });
    },
    // Las tablas (`que`: 'tablas', la oferta; 'tablas-si', 'tablas-no' o 'tablas-nula'), con `n` jugadas.
    tablas(que, n) {
      if (!TABLAS.has(que)) throw new Error(`tablas: ${que}`);
      send(que, { n });
    },
    // Una reacción (uno de GESTOS) para el rival.
    gesto(e) {
      if (GESTOS.includes(e)) send('gesto', { e });
    },
    // Se acabó aquí: { status, winner, flagged, moves } (status, el de todos: 'resign' es que se rinde quien no gana).
    terminar,
    // La partida se anula (ya no es la misma en los dos lados).
    anula,
    // Se cierra sin decir nada (una partida que se quita de la lista).
    leave() {
      cerrar();
    },
  };
}

// ---- Todo junto, para el juego ----
// `find({ time, name, onStatus })`: busca rival y resuelve con { info, color, time, opponentName }, o null si
// se cancela.
// `onStatus({ phase: 'connecting' | 'searching' | 'found' | 'error', seekers })`.
// `me`: mi identificador (el de siempre, guardado en el aparato: `guardadas-online.js`).
export function createOnline({ urls = BROKERS, me = randomId() } = {}) {
  let bus = null;
  let busca = null;
  let busquedas = 0; // cada búsqueda (y cada cancelación) cambia el número: lo que llegue tarde no cuenta
  // El cliente MQTT, con una marca de esta carga de la página: con el mismo identificador de siempre, la conexión
  // que dejó colgada la carga de antes se peleaba con la nueva, y sus mensajes (con los mismos números que antes)
  // el rival los tiraba por repetidos. Solo letras y cifras, y como mucho 23: lo que todo broker acepta.
  const clientId = `b${me}${Math.random().toString(36).slice(2, 7)}`;

  function getBus() {
    if (!bus) bus = createBus({ urls, clientId });
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
    // `rating`: mi puntuación en ese ritmo, para emparejar con alguien parecido.
    async find({ time, name = '', rating = null, evita = () => false, onStatus = () => {} }) {
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
      const mm = createMatchmaker({ bus: b, me, time, name: cleanName(name), rating, evita });
      busca = mm;
      // (Con `conectado`: si se pierde la red mientras se busca, la pantalla lo dice en vez de «nadie busca».)
      const cuenta = setInterval(() => onStatus({ phase: 'searching', seekers: mm.seekers(), conectado: b.sano }), 1000);
      onStatus({ phase: 'searching', seekers: 0, conectado: true });
      const info = await mm.found;
      clearInterval(cuenta);
      if (busca === mm) busca = null;
      if (!info) return null;
      return { info, color: info.white === me ? 'white' : 'black', time: info.time, opponentName: info.opponentName ?? '' };
    },
    // La sesión de la partida emparejada; `moves()` da las jugadas que conoce el juego (`createSession`).
    // Una partida que se sigue tras recargar: `yo`, el identificador con que se jugó, y `reanudada` (el rival ya
    // estaba en ella: no se le espera a que llegue).
    // `instante()`: la hora de la última jugada (en la diaria, la que se deja guardada con ellas).
    session(info, moves, { yo = me, reanudada = false, instante = Date.now } = {}) {
      const b = getBus();
      return createSession({
        bus: b, me: yo, game: info.game, opponent: info.opponent, white: info.white, moves, reanudada, enlaceBien: () => b.sano,
        diaria: esDiaria(info.time), instante,
      });
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
    // ¿Me llega algo de algún broker? Sin eso, ni el silencio del rival ni su reloj dicen nada de él.
    get sano() {
      return Boolean(bus?.sano);
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
