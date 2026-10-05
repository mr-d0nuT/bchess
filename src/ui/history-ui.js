import { figurine, gameRecord } from '../chess/notation.js';
import { onLanguage, t } from '../i18n.js';

// EL HISTORIAL (punto 11 del plan de mejora): un panel plegable, bajo los botones de arriba, con las
// jugadas de la partida y lo que ha comido cada bando, con la ventaja de material (+3, −1…). Se abre y se
// cierra con su botón y se acuerda de cómo estaba. Tocar una jugada la señala en el tablero (`onPoint`):
// mejor que explicar la notación, se ve.
//
// La lista solo se calcula con el panel abierto (escribirla entera cuesta algo en una partida larga) y
// cuando cambia la partida.

const ABIERTO = 'bchess.historial';
const FIGURA = /([♔-♟]\uFE0E?)/u; // una figurita (con su selector de texto)
const FIGURA_SOLA = /^[♔-♟]\uFE0E?$/u;
const leer = () => {
  try { return localStorage.getItem(ABIERTO) === 'si'; } catch { return false; }
};
const guardar = (abierto) => {
  try { localStorage.setItem(ABIERTO, abierto ? 'si' : 'no'); } catch { /* sin almacenamiento: solo esta sesión */ }
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// `button`: el del HUD que lo abre y lo cierra. `onPoint({ from, to })`: se ha tocado una jugada.
export function createHistoryUi({ button, onPoint }) {
  const panel = el('aside', 'historial');
  panel.hidden = true;
  const cabeza = el('header', 'historial-cabeza');
  const titulo = el('h2', 'historial-titulo');
  const cerrar = el('button', 'historial-cerrar', '×');
  cerrar.type = 'button';
  cabeza.append(titulo, cerrar);
  const comidas = el('div', 'historial-comidas');
  const filas = {};
  for (const side of ['white', 'black']) {
    const fila = el('div', 'historial-bando');
    fila.dataset.bando = side;
    const nombre = el('span', 'historial-nombre');
    const piezas = el('span', 'historial-piezas');
    const ventaja = el('span', 'historial-ventaja');
    fila.append(nombre, piezas, ventaja);
    comidas.append(fila);
    filas[side] = { nombre, piezas, ventaja };
  }
  const lista = el('ol', 'historial-lista');
  const vacio = el('p', 'historial-vacio');
  panel.append(cabeza, comidas, lista, vacio);
  document.body.append(panel);

  let partida = { start: null, moves: [] };
  let pintada = null; // la clave de lo que está pintado
  let abierto = leer();
  let visto = false; // si está a la vista (fuera del menú)

  function textos() {
    titulo.textContent = t('historial.titulo');
    cerrar.title = t('historial.cerrar');
    cerrar.setAttribute('aria-label', t('historial.cerrar'));
    vacio.textContent = t('historial.vacio');
    panel.setAttribute('aria-label', t('boton.historial'));
    for (const side of ['white', 'black']) filas[side].nombre.textContent = t(`historial.${side}`);
    if (button) {
      button.title = t('boton.historial');
      button.setAttribute('aria-label', t('boton.historial'));
    }
  }

  // La notación, con las figuritas algo más grandes: la letra de reserva que las pinta las hace enanas al
  // lado de las letras.
  function escribe(node, texto) {
    for (const trozo of texto.split(FIGURA)) {
      if (!trozo) continue;
      node.append(FIGURA_SOLA.test(trozo) ? el('span', 'historial-fig', trozo) : document.createTextNode(trozo));
    }
    return node;
  }

  function jugada(movida) {
    if (!movida) return el('span', 'historial-jugada nada', '…');
    const boton = escribe(el('button', 'historial-jugada'), movida.san);
    boton.type = 'button';
    boton.title = t('historial.toca');
    boton.addEventListener('click', () => {
      for (const otro of lista.querySelectorAll('.historial-jugada.vista')) otro.classList.remove('vista');
      boton.classList.add('vista');
      onPoint?.(movida);
    });
    return boton;
  }

  function pinta() {
    const clave = `${partida.start}|${partida.moves.join(' ')}`;
    if (clave === pintada) return;
    pintada = clave;
    const record = partida.start ? gameRecord(partida.start, partida.moves) : { rows: [], captured: { white: [], black: [] }, advantage: 0 };
    // Lo comido: en la fila de cada bando, las piezas del otro que se ha llevado; y la ventaja, en el que va
    // por delante.
    for (const side of ['white', 'black']) {
      const rival = side === 'white' ? 'black' : 'white';
      filas[side].piezas.replaceChildren();
      escribe(filas[side].piezas, record.captured[side].map((kind) => figurine(rival, kind)).join(''));
      const ventaja = side === 'white' ? record.advantage : -record.advantage;
      filas[side].ventaja.textContent = ventaja > 0 ? `+${ventaja}` : '';
    }
    lista.replaceChildren(...record.rows.map((row) => {
      const li = el('li', 'historial-fila');
      li.append(el('span', 'historial-n', `${row.n}.`), jugada(row.white), jugada(row.black));
      return li;
    }));
    const ultima = lista.querySelector('li:last-child .historial-jugada:not(.nada):last-of-type');
    ultima?.classList.add('ultima');
    vacio.hidden = record.rows.length > 0;
    lista.scrollTop = lista.scrollHeight; // la última jugada, a la vista
  }

  function ponAbierto(valor) {
    abierto = valor;
    guardar(abierto);
    panel.hidden = !(abierto && visto);
    button?.setAttribute('aria-pressed', String(abierto));
    if (abierto) pinta();
  }

  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    ponAbierto(!abierto);
  });
  cerrar.addEventListener('click', () => ponAbierto(false));
  // Los toques en el panel no son toques en el tablero.
  panel.addEventListener('pointerup', (event) => event.stopPropagation());
  onLanguage(() => {
    textos();
    pintada = null;
    if (abierto) pinta();
  });
  textos();

  return {
    // La partida que se enseña: desde `start` (FEN) con `moves` (UCI).
    set(start, moves) {
      partida = { start, moves: [...moves] };
      if (abierto && !panel.hidden) pinta();
    },
    // Se enseña o no (en el menú, no). Se llama en cada fotograma: solo hace algo si cambia.
    show(visible) {
      if (visible === visto) return;
      visto = visible;
      panel.hidden = !(visible && abierto);
      if (button) button.hidden = !visible;
      if (!panel.hidden) pinta();
    },
  };
}
