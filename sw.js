// LA WEB, GUARDADA EN EL MÓVIL (punto 3 del plan de mejora). Un «service worker»: el navegador lo guarda
// junto a la web y le pasa todas sus peticiones. Así, tras la primera visita:
//
// - Carga al instante: todo (código, figuras, texturas, música) sale de lo guardado en el aparato, y por
//   detrás se pide a la web lo último, que queda guardado para la próxima vez.
// - Funciona sin conexión (salvo lo online, claro).
// - Avisa cuando hay versión nueva. Lo vio el usuario: tras publicar algo, el móvil seguía enseñando lo de
//   antes (el navegador guarda cada fichero diez minutos). Ahora el código se pregunta siempre a la web, y si
//   algún fichero ha cambiado, cuando ya está todo lo nuevo bajado se le dice a la página, que ofrece
//   «Actualizar».
//
// Sin paso de compilación ni lista de ficheros: se guarda lo que la web va pidiendo.

const CACHE = 'bchess';
const CODIGO = /\.(?:html|js|mjs|css|json|webmanifest)$|\/$/; // lo que cambia con cada versión

let pendientes = 0; // lo que se está pidiendo por detrás ahora mismo
let cambiado = false; // y si algo del código ha cambiado

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const nombre of await caches.keys()) if (nombre !== CACHE) await caches.delete(nombre);
    // La página se guardaba una vez por cada dirección con parámetros (`?v=…`, `?fbclid=…`), y al buscarla sin
    // ellos salía la primera que se guardó: la más vieja, para siempre. Fuera esas copias (ahora se guarda sin
    // ellos, `paginaDe`).
    const cache = await caches.open(CACHE);
    for (const req of await cache.keys()) {
      const url = new URL(req.url);
      if (url.search && (url.pathname.endsWith('/') || url.pathname.endsWith('.html'))) await cache.delete(req);
    }
    await self.clients.claim();
  })());
});

// Una página, guardada sin sus parámetros: venga con los que venga, es la misma.
const paginaDe = (url) => new Request(url.origin + url.pathname);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('range')) return; // los trozos (audio a pedazos), a la red
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(responde(event, req, url));
});

// Lo mismo del servidor, o no: por la etiqueta de versión que pone la web (ETag) o, si no, por la fecha.
function distinto(viejo, nuevo) {
  const a = viejo.headers.get('etag');
  const b = nuevo.headers.get('etag');
  if (a && b) return a !== b;
  const c = viejo.headers.get('last-modified');
  const d = nuevo.headers.get('last-modified');
  if (c && d) return c !== d;
  return false;
}

async function avisa() {
  for (const cliente of await self.clients.matchAll({ type: 'window' })) cliente.postMessage({ tipo: 'nueva-version' });
}

async function responde(event, req, url) {
  const cache = await caches.open(CACHE);
  const navega = req.mode === 'navigate';
  const codigo = navega || CODIGO.test(url.pathname);
  const clave = navega ? paginaDe(url) : req;
  const guardada = await cache.match(clave);
  // Por detrás, lo último de la web. El código, preguntando siempre (sin la caché de diez minutos del
  // navegador); lo demás (figuras, música), como venga.
  pendientes += 1;
  const red = fetch(req, codigo ? { cache: 'no-cache' } : {})
    .then(async (res) => {
      if (res.ok && res.type === 'basic') {
        if (guardada && codigo && distinto(guardada, res)) cambiado = true;
        await cache.put(clave, res.clone());
      }
      return res;
    })
    .catch(() => null)
    .finally(() => {
      pendientes -= 1;
      if (pendientes === 0 && cambiado) {
        cambiado = false;
        avisa();
      }
    });
  if (guardada) {
    event.waitUntil(red);
    return guardada;
  }
  return (await red) ?? new Response('', { status: 504, statusText: 'Sin conexión' });
}

// LOS AVISOS DE «TE TOCA» (`main.js`): al tocar uno, el juego al frente y, en él, esa partida (su `tag`); si no
// había ninguno abierto, se abre.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const abiertos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const cliente = abiertos[0];
    if (!cliente) {
      await self.clients.openWindow(self.registration.scope);
      return;
    }
    await cliente.focus();
    cliente.postMessage({ tipo: 'abre-partida', partida: event.notification.tag });
  })());
});
