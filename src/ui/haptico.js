// VIBRAR. Donde el navegador deja (`navigator.vibrate`, en Android), lo que se pide. En el iPhone, Safari no tiene
// `vibrate`, pero desde iOS 18 marcar un interruptor (`<input type="checkbox" switch>`) da un toque háptico: se marca
// uno escondido (un toque, sin duración; y puede que solo lo dé justo después de tocar la pantalla). En el ordenador,
// nada (`puede`: false, y el ajuste de vibrar ni sale).
export function createHaptico({ nav = globalThis.navigator, doc = globalThis.document, tactil = null } = {}) {
  const nativo = typeof nav?.vibrate === 'function'
    && (tactil ?? (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches));
  const ios = !nativo && Boolean(nav) && (/iP(hone|ad|od)/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1));
  let interruptor = null;
  function toqueIos() {
    if (!interruptor) {
      interruptor = doc.createElement('label');
      interruptor.setAttribute('aria-hidden', 'true');
      interruptor.style.display = 'none';
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      interruptor.append(input);
      doc.body.append(interruptor);
    }
    interruptor.click();
  }
  return {
    puede: nativo || ios,
    // Vibra `ms` milisegundos (o un patrón: [vibra, pausa, vibra…]); en el iPhone, un toque.
    vibra(ms) {
      try {
        if (nativo) nav.vibrate(ms);
        else if (ios) toqueIos();
      } catch {
        // sin permiso aún (hasta que se toca la pantalla), o lo que sea: sin vibrar
      }
    },
  };
}
