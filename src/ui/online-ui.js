import { t } from '../i18n.js';

// La pantalla de «Buscando rival…» de las partidas online: un radar que late, cuántos más buscan ahora
// mismo y «Cancelar». Al encontrar rival dice con qué color se juega; si no hay conexión, lo dice y ofrece
// «Reintentar» (antes solo había un botón para volver al menú, y si la red volvía había que salir y entrar).
export function createOnlineUi() {
  const root = document.getElementById('online');
  const titulo = root.querySelector('#online-titulo');
  const texto = root.querySelector('#online-texto');
  const boton = root.querySelector('#online-cancelar');
  const reintentar = document.createElement('button');
  reintentar.type = 'button';
  reintentar.className = 'final-boton principal';
  reintentar.hidden = true;
  boton.before(reintentar, ' '); // con su espacio entre los dos, como en el HTML
  let alPulsar = null;
  boton.addEventListener('click', () => alPulsar?.('cancelar'));
  reintentar.addEventListener('click', () => alPulsar?.('reintentar'));

  function pinta({ phase, seekers = 0, color = null, rival = '' }) {
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
      const conQue = color === 'black' ? t('online.negras') : t('online.blancas');
      texto.textContent = rival ? `${conQue} · ${t('online.rival', { nombre: rival })}` : conQue;
    } else if (phase === 'error') {
      titulo.textContent = t('online.error');
      texto.textContent = '';
    }
    boton.textContent = phase === 'error' ? t('final.menu') : t('online.cancelar');
    boton.hidden = phase === 'found';
    reintentar.textContent = t('reintentar');
    reintentar.hidden = phase !== 'error';
    if (phase === 'error') setTimeout(() => reintentar.focus({ preventScroll: true }), 50);
  }

  return {
    // Enseña la pantalla; `onButton(que)` se llama al pulsar un botón: 'cancelar' (o volver al menú) o
    // 'reintentar'.
    show(onButton) {
      alPulsar = onButton;
      pinta({ phase: 'connecting' });
      root.hidden = false;
      setTimeout(() => boton.focus({ preventScroll: true }), 300);
    },
    status: pinta,
    hide() {
      root.hidden = true;
      alPulsar = null;
    },
    get open() {
      return !root.hidden;
    },
  };
}
