import { t } from '../i18n.js';

// La pantalla de «Buscando rival…» de las partidas online: un radar que late, cuántos más buscan ahora
// mismo y «Cancelar». Al encontrar rival dice con qué color se juega; si no hay conexión, lo dice y el
// botón vuelve al menú.
export function createOnlineUi() {
  const root = document.getElementById('online');
  const titulo = root.querySelector('#online-titulo');
  const texto = root.querySelector('#online-texto');
  const boton = root.querySelector('#online-cancelar');
  let alCancelar = null;
  boton.addEventListener('click', () => alCancelar?.());

  function pinta({ phase, seekers = 0, color = null }) {
    root.dataset.fase = phase;
    root.classList.toggle('encontrado', phase === 'found');
    if (phase === 'connecting') {
      titulo.textContent = t('online.conectando');
      texto.textContent = '';
    } else if (phase === 'searching') {
      titulo.textContent = t('online.buscando');
      texto.textContent = seekers > 0 ? t('online.hay', { n: seekers }) : t('online.solo');
    } else if (phase === 'found') {
      titulo.textContent = t('online.encontrado');
      texto.textContent = color === 'black' ? t('online.negras') : t('online.blancas');
    } else if (phase === 'error') {
      titulo.textContent = t('online.error');
      texto.textContent = '';
    }
    boton.textContent = phase === 'error' ? t('final.menu') : t('online.cancelar');
    boton.hidden = phase === 'found';
  }

  return {
    // Enseña la pantalla; `onCancel` se llama al pulsar el botón.
    show(onCancel) {
      alCancelar = onCancel;
      pinta({ phase: 'connecting' });
      root.hidden = false;
      setTimeout(() => boton.focus({ preventScroll: true }), 300);
    },
    status: pinta,
    hide() {
      root.hidden = true;
      alCancelar = null;
    },
    get open() {
      return !root.hidden;
    },
  };
}
