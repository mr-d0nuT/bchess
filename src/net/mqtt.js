// UN CLIENTE MQTT MÍNIMO, sobre WebSocket. Las partidas online van por brokers MQTT públicos y gratuitos
// (lo pidió el usuario: «¡GRATIS! sin pagar servers ni raspberry pi»): son buzones a los que cualquiera
// puede conectarse, publicar en un tema y recibir lo que se publica en los temas a los que se suscribe.
// Todo pasa por el broker, así que no hay que abrir puertos ni pelearse con el NAT del móvil, y una
// jugada de ajedrez son unos pocos bytes.
//
// Solo lo que hace falta de MQTT 3.1.1, con calidad de servicio 0: conectar, suscribirse, publicar,
// el latido (PINGREQ) y desconectar. Las funciones de codificar y descodificar van aparte, sin
// WebSocket, para poder probarlas sueltas.

const enc = new TextEncoder();
const dec = new TextDecoder();

// Los tipos de paquete (los cuatro bits altos del primer byte).
export const CONNECT = 1;
export const CONNACK = 2;
export const PUBLISH = 3;
export const SUBSCRIBE = 8;
export const SUBACK = 9;
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
// `timeout` ms. El cliente: subscribe(topic), publish(topic, texto), onMessage(fn(topic, texto)),
// onClose(fn), close().
export function connectMqtt(url, { clientId, keepalive = 30, timeout = 6000, username = null, password = null, WebSocketImpl = globalThis.WebSocket } = {}) {
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
    const mensajes = new Set();
    const cierres = new Set();
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

    const send = (bytes) => {
      if (!closed && ws.readyState === 1) ws.send(bytes);
    };
    const client = {
      url,
      get connected() {
        return ready && !closed;
      },
      subscribe(topic) {
        const id = nextId;
        nextId = (nextId % 65535) + 1;
        send(subscribePacket(id, topic));
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
      close() {
        if (closed) return;
        send(disconnectPacket());
        closed = true;
        clearInterval(latido);
        try {
          ws.close();
        } catch {
          // ya estaba cerrado
        }
      },
    };

    ws.onopen = () => send(connectPacket(clientId, keepalive, { username, password }));
    ws.onmessage = (event) => {
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
          latido = setInterval(() => send(pingPacket()), (keepalive * 1000) / 2);
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
      if (!ready) {
        clearTimeout(plazo);
        reject(new Error(`MQTT: no se pudo conectar con ${url}`));
      }
      if (estaba) for (const fn of cierres) fn();
    };
    ws.onclose = alCerrar;
    ws.onerror = alCerrar;
  });
}
