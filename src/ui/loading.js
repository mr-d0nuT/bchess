// La pantalla de carga: la portada (vertical en el teléfono, horizontal en el ordenador, la elige el
// propio <picture> del HTML) y una barra que avanza con lo que se va cargando. Está en el HTML para
// que se vea desde el primer instante, antes de que llegue ni una línea de JavaScript; aquí solo se
// mueve la barra y, al acabar, se funde.

import { t } from '../i18n.js';

const FADE_MS = 900; // lo que tarda en fundirse (igual que en style.css)

export function createLoading() {
  const root = document.getElementById('carga');
  const fill = root?.querySelector('#carga-barra span');
  const bar = root?.querySelector('#carga-barra');
  const text = root?.querySelector('#carga-texto');
  const sound = root?.querySelector('#carga-sonido');
  let shown = 0;
  if (text) {
    text.dataset.label = t('carga.preparando');
    text.textContent = `${text.dataset.label}… 0%`;
  }

  return {
    // `fraction` de 0 a 1; nunca va hacia atrás.
    progress(fraction, label) {
      if (!root) return;
      shown = Math.max(shown, Math.min(1, fraction));
      const pct = Math.round(shown * 100);
      fill.style.width = `${pct}%`;
      bar.setAttribute('aria-valuenow', String(pct));
      if (label !== undefined) text.dataset.label = label;
      text.textContent = `${text.dataset.label ?? t('carga.cargando')}… ${pct}%`;
    },
    // Aviso de que la música necesita un toque (los navegadores no dejan que suene sola).
    askForSound(on) {
      if (sound) sound.hidden = !on;
    },
    async finish() {
      if (!root) return;
      this.progress(1, t('carga.listo'));
      root.classList.add('fuera');
      await new Promise((resolve) => setTimeout(resolve, FADE_MS));
      root.remove();
    },
  };
}
