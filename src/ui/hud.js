// Interfaz: contador de fluidez, botones de acciones, avisos y el destello blanco del combate.

export function createHud() {
  const fpsEl = document.getElementById('fps');
  const aviso = document.getElementById('aviso');
  const buttons = [...document.querySelectorAll('#acciones button')];
  const flashEl = document.createElement('div');
  flashEl.id = 'destello';
  document.body.append(flashEl);

  let frames = 0;
  let last = performance.now();

  function tickFps(now) {
    frames++;
    if (now - last >= 500) {
      fpsEl.textContent = `${Math.round((frames * 1000) / (now - last))} fps`;
      frames = 0;
      last = now;
    }
  }

  function onAction(handler) {
    for (const button of buttons) {
      button.addEventListener('click', () => handler(button.dataset.accion));
    }
  }

  function setBusy(busy) {
    for (const button of buttons) button.disabled = busy;
  }

  function hideAction(action) {
    const button = buttons.find((b) => b.dataset.accion === action);
    if (button) button.hidden = true;
  }

  function hideMessage() {
    aviso.hidden = true;
    aviso.replaceChildren();
  }

  function showMessage(text, { retry } = {}) {
    const p = document.createElement('p');
    p.textContent = text;
    aviso.replaceChildren(p);
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Reintentar';
      button.addEventListener('click', () => {
        hideMessage();
        retry();
      });
      aviso.append(button);
    }
    aviso.hidden = false;
  }

  // Destello blanco a pantalla completa (golpe final del combate). Es una animación CSS que
  // se desvanece sola, sin depender de los fotogramas del navegador.
  function flash() {
    flashEl.classList.remove('encendido');
    void flashEl.offsetWidth; // reinicia la animación aunque ya se hubiera usado
    flashEl.classList.add('encendido');
  }

  return { tickFps, onAction, setBusy, hideAction, showMessage, hideMessage, flash };
}
