// UN CLIENTE MQTT MÍNIMO, sobre WebSocket. Las partidas online van por brokers MQTT públicos y gratuitos
// (lo pidió el usuario: «¡GRATIS! sin pagar servers ni raspberry pi»): son buzones a los que cualquiera
// puede conectarse, publicar en un tema y recibir lo que se publica en los temas a los que se suscribe.
// Todo pasa por el broker, así que no hay que abrir puertos ni pelearse con el NAT del móvil, y una
// jugada de ajedrez son unos pocos bytes.
//
// Solo lo que hace falta de MQTT 3.1.1, con calidad de servicio 0: conectar, suscribirse (y dejarlo),
// publicar, el latido (PINGREQ) y desconectar. Las funciones de codificar y descodificar van aparte, sin
// WebSocket, para poder probarlas sueltas.

const enc = new TextEncoder();
const dec = new TextDecoder();

// Los tipos de paquete (los cuatro bits altos del primer byte).
export const CONNECT = 1;
export const CONNACK = 2;
export const PUBLISH = 3;
export const SUBSCRIBE = 8;
export const SUBACK = 9;
export const UNSUBSCRIBE = 10;
export const PINGREQ = 12;
export const PINGRESP = 13;
export const DISCONNECT = 14;

// La longitud que queda del paquete: de 7 en 7 bits, con el octavo diciendo si sigue.
export function encodeLength(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 128;
    out.push(byte);
  } while (n > 0);
  return out;
}

const str = (s) => {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 255, ...b];
};

function packet(first, body) {
  const bytes = new Uint8Array(1 + encodeLength(body.length).length + body.length);
  const head = [first, ...encodeLength(body.length)];
  bytes.set(head, 0);
  bytes.set(body, head.length);
  return bytes;
}

export function connectPacket(clientId, keepalive = 30, { username = null, password = null } = {}) {
  // Protocolo «MQTT», nivel 4 (3.1.1), sesión limpia y el latido en segundos. Algunos brokers públicos
  // piden un usuario y una contraseña que son públicos también (los de su documentación).
  let flags = 0x02;
  const extra = [];
  if (username !== null) {
    flags |= 0x80;
    extra.push(...str(username));
    if (password !== null) {
      flags |= 0x40;
      extra.push(...str(password));
    }
  }
  return packet(CONNECT << 4, [...str('MQTT'), 4, flags, keepalive >> 8, keepalive & 255, ...str(clientId), ...extra]);
}

export function subscribePacket(id, topic) {
  return packet((SUBSCRIBE << 4) | 0x02, [id >> 8, id & 255, ...str(topic), 0]);
}

export function unsubscribePacket(id, topic) {
  return packet((UNSUBSCRIBE << 4) | 0x02, [id >> 8, id & 255, ...str(topic)]);
}

export function publishPacket(topic, payload) {
  const datos = typeof payload === 'string' ? enc.encode(payload) : payload;
  return packet(PUBLISH << 4, [...str(topic), ...datos]);
}

export const pingPacket = () => new Uint8Array([PINGREQ << 4, 0]);
export const disconnectPacket = () => new Uint8Array([DISCONNECT << 4, 0]);

// Trocea lo que llega (que puede traer varios paquetes, o medio) en paquetes enteros. Devuelve
// { packets: [{ type, flags, body }], rest } con lo que sobra para la próxima vez.
export function splitPackets(bytes) {
  const packets = [];
  let i = 0;
  while (i < bytes.length) {
    let len = 0;
    let mult = 1;
    let j = i + 1;
    let complete = false;
    while (j < bytes.length) {
      const b = bytes[j++];
      len += (b & 127) * mult;
      mult *= 128;
      if (!(b & 128)) {
        complete = true;
        break;
      }
    }
    if (!complete || j + len > bytes.length) break;
    packets.push({ type: bytes[i] >> 4, flags: bytes[i] & 15, body: bytes.subarray(j, j + len) });
    i = j + len;
  }
  return { packets, rest: bytes.subarray(i) };
}

// Un PUBLISH recibido: { topic, payload } (el texto).
export function readPublish({ flags, body }) {
  const n = (body[0] << 8) | body[1];
  const topic = dec.decode(body.subarray(2, 2 + n));
  const qos = (flags >> 1) & 3;
  const from = 2 + n + (qos > 0 ? 2 : 0);
  return { topic, payload: dec.decode(body.subarray(from)) };
}

// Se conecta a `url` (wss://…). Devuelve una promesa con el cliente, o la rechaza si no conecta en
// `timeout` ms. El cliente: subscribe(topic), unsubscribe(topic), publish(topic, texto),
// onMessage(fn(topic, texto)), onClose(fn(motivo)), probe(ms), oido, close().
//
// UNA CONEXIÓN MUERTA NO SIEMPRE AVISA. Al despertar el iPhone, al pasar de wifi a datos o cuando el router
// olvida la conexión, el WebSocket sigue «abierto» sin que pase nada por él, y su `onclose` tarda minutos o
// no llega: se publicaba al vacío y no llegaba nada, sin volver a conectar nunca. Así que se mira lo que
// llega: el broker contesta a cada latido, y si en vez y media del latido no ha dicho nada, está muerta y se
// cierra ya (`onClose` con el motivo 'callado'). `probe` pregunta en el momento (al volver al primer plano).
export function connectMqtt(url, { clientId, keepalive = 20, timeout = 6000, username = null, password = null, WebSocketImpl = globalThis.WebSocket } = {}) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WebSocketImpl(url, 'mqtt');
    } catch (err) {
      reject(err);
      return;
    }
    ws.binaryType = 'arraybuffer';
    let buffer = new Uint8Array(0);
    let ready = false;
    let closed = false;
    let nextId = 1;
    let latido = null;
    let oido = Date.now(); // lo último que llegó del broker: si calla, la conexión está muerta aunque diga OPEN
    let tic = Date.now(); // el último latido: si hace mucho, el navegador nos tuvo parados
    let sordoHasta = 0; // para probar (`zombi`): hasta entonces no entra ni sale nada, y no se cierra
    const mensajes = new Set();
    const cierres = new Set();
    const sondeos = new Set(); // los `probe` que esperan a que diga algo
    const plazo = setTimeout(() => {
      if (!ready) {
        try {
          ws.close();
        } catch {
          // ya estaba cerrado
        }
        reject(new Error(`MQTT: ${url} no contesta`));
      }
    }, timeout);

    const sordo = () => Date.now() < sordoHasta;
    const send = (bytes) => {
      if (!closed && ws.readyState === 1 && !sordo()) ws.send(bytes);
    };
    const nuevoId = () => {
      const id = nextId;
      nextId = (nextId % 65535) + 1;
      return id;
    };
    const acabaSondeos = (vivo) => {
      for (const fn of [...sondeos]) fn(vivo);
    };
    // Se da por muerta sin esperar al `onclose` (con un socket zombi tarda o no llega) y se avisa ya.
    function matar(motivo) {
      if (closed) return;
      const estaba = ready;
      closed = true;
      clearInterval(latido);
      try {
        ws.close();
      } catch {
        // ya estaba cerrado
      }
      acabaSondeos(false);
      if (estaba) for (const fn of [...cierres]) fn(motivo);
    }
    const client = {
      url,
      get connected() {
        return ready && !closed;
      },
      // Cuándo llegó lo último del broker (para saber si el enlace está sano).
      get oido() {
        return oido;
      },
      subscribe(topic) {
        send(subscribePacket(nuevoId(), topic));
      },
      unsubscribe(topic) {
        send(unsubscribePacket(nuevoId(), topic));
      },
      publish(topic, payload) {
        send(publishPacket(topic, payload));
      },
      onMessage(fn) {
        mensajes.add(fn);
        return () => mensajes.delete(fn);
      },
      onClose(fn) {
        cierres.add(fn);
        return () => cierres.delete(fn);
      },
      // ¿Sigue viva? Un PINGREQ: si en `ms` no llega nada, se da por muerta (`onClose` con 'sondeo').
      // Resuelve true o false.
      probe(ms = 3000) {
        if (closed) return Promise.resolve(false);
        return new Promise((resolve) => {
          const fin = (vivo) => {
            clearTimeout(espera);
            sondeos.delete(fin);
            resolve(vivo);
          };
          const espera = setTimeout(() => {
            sondeos.delete(fin);
            matar('sondeo');
            resolve(false);
          }, ms);
          sondeos.add(fin);
          send(pingPacket());
        });
      },
      // Para probar a mano: durante `ms`, ni entra ni sale nada, pero la conexión no se cierra (como un
      // socket zombi de verdad).
      zombi(ms) {
        sordoHasta = Date.now() + ms;
      },
      matar,
      close() {
        if (closed) return;
        send(disconnectPacket());
        closed = true;
        clearInterval(latido);
        acabaSondeos(false);
        try {
          ws.close();
        } catch {
          // ya estaba cerrado
        }
      },
    };

    ws.onopen = () => send(connectPacket(clientId, keepalive, { username, password }));
    ws.onmessage = (event) => {
      if (sordo()) return;
      oido = Date.now();
      acabaSondeos(true);
      const llega = new Uint8Array(event.data);
      const junto = new Uint8Array(buffer.length + llega.length);
      junto.set(buffer, 0);
      junto.set(llega, buffer.length);
      const { packets, rest } = splitPackets(junto);
      buffer = rest.slice();
      for (const p of packets) {
        if (p.type === CONNACK) {
          if (p.body[1] !== 0) {
            clearTimeout(plazo);
            reject(new Error(`MQTT: ${url} rechaza la conexión (${p.body[1]})`));
            client.close();
            return;
          }
          ready = true;
          clearTimeout(plazo);
          tic = Date.now();
          // El latido, dos veces por plazo. Si el broker lleva vez y media del plazo sin decir nada (contesta
          // a cada latido), la conexión está muerta. Salvo tras una pausa: si el navegador nos tuvo parados (el
          // móvil en el bolsillo), lo callado no es culpa del broker, y primero se le pregunta.
          latido = setInterval(() => {
            const ahora = Date.now();
            if (ahora - tic < keepalive * 250) return; // latidos atrasados que salen todos de golpe: basta uno
            const dormido = ahora - tic > keepalive * 1000;
            tic = ahora;
            if (!dormido && ahora - oido > keepalive * 1500) {
              matar('callado');
              return;
            }
            send(pingPacket());
          }, (keepalive * 1000) / 2);
          resolve(client);
        } else if (p.type === PUBLISH) {
          const { topic, payload } = readPublish(p);
          for (const fn of mensajes) fn(topic, payload);
        }
      }
    };
    const alCerrar = () => {
      clearInterval(latido);
      const estaba = ready && !closed;
      closed = true;
      acabaSondeos(false);
      if (!ready) {
        clearTimeout(plazo);
        reject(new Error(`MQTT: no se pudo conectar con ${url}`));
      }
      if (estaba) for (const fn of [...cierres]) fn('cerrada');
    };
    ws.onclose = alCerrar;
    ws.onerror = alCerrar;
  });
}
