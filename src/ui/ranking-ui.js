import { CATEGORIES, isProvisional, shown } from '../rating/ratings.js';
import { onLanguage, t } from '../i18n.js';

// EL RANKING (la puntuación del jugador, como en chess.com): un botón con un trofeo y la puntuación en el
// menú, y al tocarlo un panel con una tarjeta por ritmo (la puntuación, si aún es provisional, las partidas
// ganadas, perdidas y en tablas, la mejor y una gráfica de cómo ha ido), el ranking local del uno contra
// uno y, con cuenta, el mundial. `account` (opcional): la zona de la cuenta, que pone `auth-ui.js`.

// El nombre de una categoría: los ritmos, como en el menú; la CPU, el suyo.
const nombre = (c) => t(c === 'cpu' ? 'ranking.cat.cpu' : `tiempo.${c}`);

const ICONOS = {
  // Una bala, un rayo, un cronómetro, un sol (un día) y un chip.
  bala: '<path d="M3.5 9h9.5c3.6 0 6.5 1.3 6.5 3s-2.9 3-6.5 3H3.5z"/><path d="M8 9v6"/>',
  blitz: '<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>',
  rapida: '<circle cx="12" cy="13" r="7"/><path d="M12 13V9.5M10 3h4M18 7l1.5-1.5"/>',
  diaria: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  cpu: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3"/>',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// La gráfica de una categoría: sus últimas puntuaciones, en una línea.
function grafica(history) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 120 30');
  svg.setAttribute('class', 'rk-grafica');
  svg.setAttribute('aria-hidden', 'true');
  const puntos = history.slice(-40).map(([, r]) => r);
  if (puntos.length < 2) return svg;
  const lo = Math.min(...puntos);
  const hi = Math.max(...puntos);
  const alto = Math.max(20, hi - lo);
  const linea = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  linea.setAttribute('points', puntos.map((r, i) => `${((i / (puntos.length - 1)) * 116 + 2).toFixed(1)},${(27 - ((r - lo) / alto) * 24).toFixed(1)}`).join(' '));
  svg.append(linea);
  return svg;
}

// La categoría que más se juega (para el botón del menú): la de más partidas; si no hay ninguna, la CPU.
export function mainCategory(all) {
  let mejor = 'cpu';
  for (const c of CATEGORIES) if ((all[c]?.games ?? 0) > (all[mejor]?.games ?? 0)) mejor = c;
  return mejor;
}

// `world`: si hay ranking mundial (si hay nube); si no, ni se menciona.
export function createRankingUi({ ratings, button, world = false }) {
  const fondo = el('div', 'sala ranking');
  fondo.hidden = true;
  const caja = el('div', 'sala-caja ranking-caja');
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  const cabecera = el('div', 'sala-cabecera');
  const titulo = el('h2', 'sala-titulo');
  titulo.id = 'ranking-titulo';
  caja.setAttribute('aria-labelledby', titulo.id);
  const cerrar = el('button', 'sala-cerrar', '✕');
  cerrar.type = 'button';
  cabecera.append(titulo, cerrar);
  const cuenta = el('div', 'rk-cuenta'); // la pone `auth-ui.js`
  cuenta.hidden = true;
  const intro = el('p', 'rk-intro');
  const cuerpo = el('div', 'rk-cuerpo');
  caja.append(cabecera, cuenta, intro, cuerpo);
  fondo.append(caja);
  document.body.append(fondo);
  let mundial = null; // [{ name, r, rd, games, uid }] o null (aún no ha llegado)
  let mundialCategoria = 'cpu';

  function tarjeta(categoria, entry) {
    const carta = el('div', 'rk-carta');
    carta.dataset.cat = categoria;
    const cabeza = el('div', 'rk-cabeza');
    const icono = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icono.setAttribute('viewBox', '0 0 24 24');
    icono.setAttribute('aria-hidden', 'true');
    icono.innerHTML = ICONOS[categoria];
    cabeza.append(icono, el('span', 'rk-nombre', nombre(categoria)));
    const puntos = el('div', 'rk-puntos', String(Math.round(entry.r)));
    if (isProvisional(entry)) {
      const prov = el('span', 'rk-prov', '?');
      prov.title = t('ranking.provisional');
      puntos.append(prov);
    }
    const datos = el('div', 'rk-datos');
    datos.textContent = entry.games
      ? `${t(entry.games === 1 ? 'ranking.partida1' : 'ranking.partidas', { n: entry.games })} · ${t('ranking.balance', { g: entry.win, p: entry.loss, t: entry.draw })}`
      : t('ranking.ninguna');
    carta.append(cabeza, puntos, datos, grafica(entry.history));
    if (entry.best) carta.append(el('div', 'rk-mejor', t('ranking.mejor', { r: entry.best })));
    return carta;
  }

  function tabla(filas, { yo = null } = {}) {
    const lista = el('ol', 'rk-tabla');
    filas.forEach((fila, i) => {
      const li = el('li', yo && fila.uid === yo ? 'rk-fila yo' : 'rk-fila');
      li.append(
        el('span', 'rk-pos', `${i + 1}`),
        el('span', 'rk-quien', fila.name),
        el('span', 'rk-r', shown(fila)),
        el('span', 'rk-n', t(fila.games === 1 ? 'ranking.partida1' : 'ranking.partidas', { n: fila.games ?? 0 })),
      );
      lista.append(li);
    });
    return lista;
  }

  function pinta() {
    titulo.textContent = t('ranking.titulo');
    cerrar.title = t('ajustes.cerrar');
    cerrar.setAttribute('aria-label', t('ajustes.cerrar'));
    intro.textContent = t('ranking.intro');
    const todas = ratings.all();
    const tarjetas = el('div', 'rk-tarjetas');
    for (const c of CATEGORIES) tarjetas.append(tarjeta(c, todas[c]));
    const local = ratings.local.list();
    const seccionLocal = el('section', 'rk-seccion');
    seccionLocal.append(el('h3', 'rk-subtitulo', t('ranking.local')));
    seccionLocal.append(local.length ? tabla(local) : el('p', 'rk-vacio', t('ranking.local.vacio')));
    const seccionMundial = el('section', 'rk-seccion');
    seccionMundial.hidden = !world;
    seccionMundial.append(el('h3', 'rk-subtitulo', t('ranking.mundial')));
    if (!api.meUid) seccionMundial.append(el('p', 'rk-vacio', t('ranking.mundial.entra')));
    {
      const pestanas = el('div', 'rk-pestanas');
      for (const c of CATEGORIES) {
        const b = el('button', c === mundialCategoria ? 'rk-pestana activa' : 'rk-pestana', nombre(c));
        b.type = 'button';
        b.addEventListener('click', () => {
          mundialCategoria = c;
          api.onWorld?.(c);
          pinta();
        });
        pestanas.append(b);
      }
      seccionMundial.append(pestanas);
      if (mundial) seccionMundial.append(mundial.length ? tabla(mundial, { yo: api.meUid }) : el('p', 'rk-vacio', t('ranking.mundial.vacio')));
    }
    cuerpo.replaceChildren(tarjetas, seccionLocal, seccionMundial);
    pintaBoton();
  }

  function pintaBoton() {
    if (!button) return;
    const todas = ratings.all();
    const c = mainCategory(todas);
    const texto = shown(todas[c]);
    const puntos = button.querySelector('.ranking-puntos');
    if (puntos && puntos.textContent !== texto) puntos.textContent = texto;
    const etiqueta = `${t('ranking.abrir')} · ${nombre(c)} ${texto}`;
    button.title = etiqueta;
    button.setAttribute('aria-label', etiqueta);
  }

  function open() {
    pinta();
    fondo.hidden = false;
    fondo.classList.remove('entra');
    void fondo.offsetWidth;
    fondo.classList.add('entra');
    api.onOpen?.();
  }
  function close() {
    fondo.hidden = true;
  }

  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    open();
  });
  cerrar.addEventListener('click', close);
  fondo.addEventListener('click', (event) => {
    if (event.target === fondo) close();
  });
  fondo.addEventListener('pointerup', (event) => event.stopPropagation());
  ratings.onChange(() => (fondo.hidden ? pintaBoton() : pinta()));
  onLanguage(() => (fondo.hidden ? pintaBoton() : pinta()));
  pintaBoton();

  const api = {
    open,
    close,
    refresh: () => (fondo.hidden ? pintaBoton() : pinta()),
    // La zona de la cuenta, para `auth-ui.js`.
    accountArea: cuenta,
    // El ranking mundial de una categoría ([{ name, r, rd, games, uid }]) y quién soy en él (`meUid`; null,
    // sin cuenta).
    setWorld(lista, categoria = mundialCategoria) {
      mundial = lista;
      mundialCategoria = categoria;
      if (!fondo.hidden) pinta();
    },
    get worldCategory() {
      return mundialCategoria;
    },
    meUid: null,
    onWorld: null, // (categoría) => pide el ranking mundial de esa categoría
    onOpen: null,
  };
  return api;
}
