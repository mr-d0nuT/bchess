import { onLanguage, t } from '../i18n.js';

// A pantalla completa. Ningún navegador deja ponerse a pantalla completa sin que el usuario toque
// algo, así que se hace en el PRIMER toque (en la pantalla de carga o en el menú, donde sea), y el
// botón del marco sirve para salir y volver a entrar. En el iPhone, Safari solo deja poner a
// pantalla completa los vídeos: allí la manera es añadir el juego a la pantalla de inicio, que
// entonces se abre sin barras (lo dicen el manifiesto y las etiquetas de Apple del HTML), y el
// botón no sale.

export function createFullscreen(button) {
  const raiz = document.documentElement;
  const pedir = raiz.requestFullscreen?.bind(raiz) ?? raiz.webkitRequestFullscreen?.bind(raiz);
  const salir = document.exitFullscreen?.bind(document) ?? document.webkitExitFullscreen?.bind(document);
  const activa = () => Boolean(document.fullscreenElement ?? document.webkitFullscreenElement);
  const puede = Boolean(pedir) && (document.fullscreenEnabled ?? document.webkitFullscreenEnabled ?? true);

  async function enter() {
    if (!puede || activa()) return;
    try {
      await pedir({ navigationUI: 'hide' });
    } catch {
      // el navegador no ha querido (sin toque, o en un marco que no lo permite): no pasa nada
    }
  }

  async function exit() {
    if (!activa()) return;
    try {
      await salir();
    } catch {
      // ya había salido
    }
  }

  function pinta() {
    if (!button) return;
    button.hidden = !puede;
    const dentro = activa();
    button.setAttribute('aria-pressed', String(dentro));
    button.title = dentro ? t('boton.pantalla.salir') : t('boton.pantalla');
    button.setAttribute('aria-label', button.title);
  }

  // Al primer toque (o tecla), a pantalla completa. Ojo con cuándo: en el móvil, el navegador solo da
  // permiso al LEVANTAR el dedo (al apoyarlo, no), así que se intenta al soltar, al hacer clic y con
  // el teclado, y se sigue intentando hasta que entre. Una vez dentro se deja de escuchar: si luego
  // sale, es que quiere, y no se le vuelve a meter.
  const GESTOS = ['pointerup', 'click', 'touchend', 'keydown'];
  const deja = () => {
    for (const gesto of GESTOS) window.removeEventListener(gesto, intenta, true);
  };
  async function intenta(event) {
    if (button?.contains(event.target)) return; // el botón ya se encarga (si no, entraría y saldría a la vez)
    if (activa()) {
      deja();
      return;
    }
    if (navigator.userActivation && !navigator.userActivation.isActive) return; // este gesto no da permiso
    await enter();
    if (activa()) deja();
  }
  if (puede) for (const gesto of GESTOS) window.addEventListener(gesto, intenta, true);
  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (activa()) exit();
    else enter();
  });
  document.addEventListener('fullscreenchange', pinta);
  document.addEventListener('webkitfullscreenchange', pinta);
  onLanguage(pinta);
  pinta();

  return { enter, exit, get active() { return activa(); }, get supported() { return puede; } };
}
