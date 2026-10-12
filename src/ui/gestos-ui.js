import { t, onLanguage } from '../i18n.js';

// LAS REACCIONES de la partida online: un botón (bajo el altavoz) abre seis emojis —se entienden en cualquiera de los
// siete idiomas— y el que se toca le llega al rival (`session.gesto`). El suyo sale en grande, arriba, con su nombre;
// el mío, un momento, para saber que ha salido. Como mucho uno cada `CADA_MS`, que no se convierta en un bombardeo.

const CADA_MS = 1500;
const DURA_MS = 2600; // lo que se queda a la vista una reacción
const CIERRA_MS = 5000; // el panel, si no se toca

// `gestos`: los emojis (los de `net/online.js`). `onSend(e)`: mandarlo al rival.
export function createGestosUi({ gestos, onSend }) {
  const boton = document.createElement('button');
  boton.id = 'gestos';
  boton.className = 'boton';
  boton.type = 'button';
  boton.hidden = true;
  boton.setAttribute('aria-haspopup', 'true');
  boton.setAttribute('aria-expanded', 'false');
  boton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H10l-4.5 3.5V15.5H4z"/><circle cx="9" cy="10.5" r=".6"/><circle cx="12" cy="10.5" r=".6"/><circle cx="15" cy="10.5" r=".6"/></svg>';
  const panel = document.createElement('div');
  panel.id = 'gestos-panel';
  panel.hidden = true;
  for (const e of gestos) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gesto';
    b.textContent = e;
    b.addEventListener('click', (event) => {
      event.stopPropagation();
      manda(e);
    });
    panel.append(b);
  }
  const hud = document.getElementById('hud') ?? document.body;
  hud.append(boton, panel);

  let ultimo = 0;
  let cierra = 0;
  function abre(abrir) {
    clearTimeout(cierra);
    panel.hidden = !abrir;
    boton.setAttribute('aria-expanded', String(abrir));
    if (abrir) cierra = setTimeout(() => abre(false), CIERRA_MS);
  }
  function manda(e) {
    abre(false);
    if (Date.now() - ultimo < CADA_MS) return;
    ultimo = Date.now();
    onSend(e);
    globo({ e, propio: true });
  }
  boton.addEventListener('click', (event) => {
    event.stopPropagation();
    abre(panel.hidden);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !boton.contains(event.target)) abre(false);
  });

  // Una reacción a la vista: grande, arriba; la del rival, con su nombre.
  function globo({ e, nombre = '', propio = false }) {
    const g = document.createElement('div');
    g.className = propio ? 'gesto-globo propio' : 'gesto-globo';
    const cara = document.createElement('span');
    cara.className = 'gesto-cara';
    cara.textContent = e;
    g.append(cara);
    if (!propio) {
      const quien = document.createElement('span');
      quien.className = 'gesto-quien';
      quien.textContent = nombre || t('sala.anonimo');
      g.append(quien);
    }
    hud.append(g);
    setTimeout(() => g.remove(), DURA_MS);
  }

  function rotula() {
    const texto = t('gestos.abrir');
    boton.title = texto;
    boton.setAttribute('aria-label', texto);
  }
  onLanguage(rotula);
  rotula();

  return {
    // Solo en las partidas online, mientras se juegan.
    visible(on) {
      if (boton.hidden === !on) return;
      boton.hidden = !on;
      if (!on) abre(false);
    },
    // Ha llegado una del rival.
    llega({ e, nombre }) {
      if (gestos.includes(e)) globo({ e, nombre });
    },
  };
}
