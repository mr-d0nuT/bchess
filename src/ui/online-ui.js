import { t } from '../i18n.js';
import { findTimeControl } from '../chess/timecontrol.js';
import { timeLabel } from './menu.js';

// El ritmo de una partida, para leerlo: «Blitz · 3 | 2», o «Sin reloj».
function ritmoDe(time) {
  const control = findTimeControl(time);
  return control ? `${t(`tiempo.${control.key.split(':')[0]}`)} · ${timeLabel(control)}` : t('tiempo.sinreloj');
}

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
  let fase = '';
  // En la propuesta de un rival, los mismos dos botones son «Buscar otro» y «Aceptar».
  const propone = () => fase === 'propuesta' || fase === 'esperando';
  boton.addEventListener('click', () => alPulsar?.(propone() ? 'otro' : 'cancelar'));
  reintentar.addEventListener('click', () => alPulsar?.(fase === 'propuesta' ? 'aceptar' : 'reintentar'));

  function pinta({ phase, seekers = 0, color = null, rival = '', conectado = true, time = null }) {
    fase = phase;
    root.dataset.fase = phase;
    if (phase === 'connecting') {
      titulo.textContent = t('online.conectando');
      texto.textContent = '';
    } else if (phase === 'searching') {
      titulo.textContent = t('online.buscando');
      // Sin red mientras se busca, se dice (antes decía que no buscaba nadie más).
      texto.textContent = !conectado ? t('online.reconectando') : seekers > 0 ? t('online.hay', { n: seekers }) : t('online.solo');
    } else if (phase === 'found') {
      titulo.textContent = t('online.encontrado');
      // Con qué color, a qué ritmo (antes no se decía: el emparejamiento podía mezclarlos) y contra quién.
      const partes = [color === 'black' ? t('online.negras') : t('online.blancas')];
      if (time) partes.push(ritmoDe(time));
      if (rival) partes.push(t('online.rival', { nombre: rival }));
      texto.textContent = partes.join(' · ');
    } else if (phase === 'retando') {
      // La revancha pedida: esperando a que conteste.
      titulo.textContent = t('online.retando', { nombre: rival });
      texto.textContent = time ? `${t('online.pideRevancha')} · ${ritmoDe(time)}` : t('online.pideRevancha');
    } else if (phase === 'propuesta' || phase === 'esperando') {
      // El rival al azar, antes de empezar: quién es, a qué ritmo y con qué color. Si ya he aceptado, a esperarle.
      titulo.textContent = phase === 'propuesta' ? t('online.encontrado') : t('online.esperandoSi', { nombre: rival });
      const partes = [];
      if (phase === 'propuesta') partes.push(t('online.rival', { nombre: rival }));
      if (time) partes.push(ritmoDe(time));
      partes.push(color === 'black' ? t('online.negras') : t('online.blancas'));
      texto.textContent = partes.join(' · ');
    } else if (phase === 'error') {
      titulo.textContent = t('online.error');
      texto.textContent = '';
    }
    root.classList.toggle('encontrado', phase === 'found' || phase === 'propuesta');
    boton.textContent = phase === 'error' ? t('final.menu') : propone() ? t('online.otro') : t('online.cancelar');
    boton.hidden = phase === 'found';
    reintentar.textContent = phase === 'propuesta' ? t('online.aceptar') : t('reintentar');
    reintentar.hidden = phase !== 'error' && phase !== 'propuesta';
    if (phase === 'error' || phase === 'propuesta') setTimeout(() => reintentar.focus({ preventScroll: true }), 50);
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
