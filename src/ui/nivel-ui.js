import { t } from '../i18n.js';
import { NIVELES } from '../rating/ratings.js';

// EL NIVEL DE SALIDA, preguntado (como al crear la cuenta en chess.com): la primera vez que se va a jugar una partida
// que puntúa. Cuatro botones grandes, cada uno con su puntuación de salida y una línea que lo explica. Resuelve con la
// clave elegida (de `NIVELES`); cerrado sin elegir, 'intermedio' (1200, lo de siempre).
export function preguntaNivel() {
  const fondo = document.createElement('div');
  fondo.className = 'sala nivel';
  const caja = document.createElement('div');
  caja.className = 'sala-caja nivel-caja';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  const titulo = document.createElement('h2');
  titulo.className = 'sala-titulo';
  titulo.textContent = t('nivel.titulo');
  caja.setAttribute('aria-label', titulo.textContent);
  const intro = document.createElement('p');
  intro.className = 'nivel-intro';
  intro.textContent = t('nivel.intro');
  const opciones = document.createElement('div');
  opciones.className = 'nivel-opciones';
  caja.append(titulo, intro, opciones);
  fondo.append(caja);
  document.body.append(fondo);
  return new Promise((resolve) => {
    const elige = (clave) => {
      fondo.remove();
      document.removeEventListener('keydown', tecla);
      resolve(clave);
    };
    const tecla = (event) => {
      if (event.key === 'Escape') elige('intermedio');
    };
    document.addEventListener('keydown', tecla);
    fondo.addEventListener('click', (event) => {
      if (event.target === fondo) elige('intermedio');
    });
    for (const [clave, puntos] of Object.entries(NIVELES)) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'nivel-op';
      const nombre = document.createElement('b');
      nombre.textContent = t(`nivel.${clave}`);
      const cifra = document.createElement('span');
      cifra.className = 'nivel-cifra';
      cifra.textContent = String(puntos);
      const sub = document.createElement('span');
      sub.className = 'nivel-sub';
      sub.textContent = t(`nivel.${clave}.sub`);
      boton.append(nombre, cifra, sub);
      boton.addEventListener('click', () => elige(clave));
      opciones.append(boton);
    }
    setTimeout(() => opciones.children[1]?.focus({ preventScroll: true }), 50);
  });
}
