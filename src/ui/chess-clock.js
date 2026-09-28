import { formatClock } from '../chess/timecontrol.js';
import { t } from '../i18n.js';

// El reloj de ajedrez en la pantalla, como uno de verdad: una caja con dos pantallas y dos
// pulsadores encima. El pulsador del bando al que le corre el tiempo está arriba; el otro, hundido.
// Quien acaba de mover pulsa el suyo —se hunde, el del otro salta— y así para su tiempo y arranca el
// del rival. Contra la CPU, ella pulsa el suyo sola.
//
// Las cifras son de siete segmentos, dibujadas aquí mismo: los segmentos apagados se ven al fondo,
// muy tenues, como en las pantallas de los relojes de torneo.

const SEGMENTOS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  d: 'bcdeg', h: 'cefg', ' ': '',
};
// Cada segmento, en una celda de 14 × 24: rectángulos con las puntas redondeadas.
const FORMA = {
  a: [2.4, 0.4, 9.2, 2.4],
  b: [11.6, 2.5, 2.4, 8.8],
  c: [11.6, 12.7, 2.4, 8.8],
  d: [2.4, 21.2, 9.2, 2.4],
  e: [0, 12.7, 2.4, 8.8],
  f: [0, 2.5, 2.4, 8.8],
  g: [2.4, 10.8, 9.2, 2.4],
};

function cifras(texto) {
  let x = 0;
  let svg = '';
  for (const ch of texto) {
    if (ch === ':') {
      svg += `<rect class="on dos-puntos" x="${x + 1.2}" y="6.4" width="2.6" height="2.6" rx="1"/><rect class="on dos-puntos" x="${x + 0.2}" y="15" width="2.6" height="2.6" rx="1"/>`;
      x += 6;
      continue;
    }
    if (ch === '.') {
      svg += `<rect class="on" x="${x + 0.6}" y="21.2" width="2.6" height="2.6" rx="1"/>`;
      x += 5;
      continue;
    }
    const encendidos = SEGMENTOS[ch] ?? '';
    svg += `<g transform="translate(${x} 0) skewX(-7)">`;
    for (const [s, [sx, sy, w, h]] of Object.entries(FORMA)) {
      svg += `<rect class="${encendidos.includes(s) ? 'on' : 'off'}" x="${sx}" y="${sy}" width="${w}" height="${h}" rx="1.2"/>`;
    }
    svg += '</g>';
    x += ch === ' ' ? 8 : 17;
  }
  return `<svg viewBox="-2 -1 ${x + 3} 26" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${svg}</svg>`;
}

export function createChessClockUi(root = document.body) {
  const reloj = document.createElement('div');
  reloj.className = 'reloj';
  reloj.hidden = true;
  reloj.innerHTML = `
    <div class="reloj-caja">
      <button class="pulsador" type="button" data-lado="white"><span></span></button>
      <button class="pulsador" type="button" data-lado="black"><span></span></button>
      <div class="reloj-frente">
        <div class="reloj-cara" data-lado="white"><span class="reloj-pieza">♔</span><span class="reloj-cifras"></span></div>
        <div class="reloj-marca"><span>BATTLE</span><span>CHESS</span></div>
        <div class="reloj-cara" data-lado="black"><span class="reloj-pieza">♚</span><span class="reloj-cifras"></span></div>
      </div>
      <div class="reloj-ritmo"></div>
    </div>`;
  root.append(reloj);
  const botones = Object.fromEntries([...reloj.querySelectorAll('.pulsador')].map((b) => [b.dataset.lado, b]));
  const caras = Object.fromEntries([...reloj.querySelectorAll('.reloj-cara')].map((c) => [c.dataset.lado, c]));
  const textos = { white: '', black: '' };
  let espera = null; // { side, resolve }: el bando que ha de pulsar para acabar su jugada

  function hunde(side) {
    const boton = botones[side];
    boton.classList.remove('golpe');
    void boton.offsetWidth;
    boton.classList.add('golpe');
  }

  function pulsa(side) {
    if (espera?.side !== side) {
      // No le toca: el pulsador se resiste.
      const boton = botones[side];
      boton.classList.remove('niega');
      void boton.offsetWidth;
      boton.classList.add('niega');
      return;
    }
    hunde(side);
    const { resolve } = espera;
    espera = null;
    reloj.dataset.espera = '';
    resolve();
  }

  for (const [side, boton] of Object.entries(botones)) {
    boton.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      pulsa(side);
    });
    boton.addEventListener('click', (event) => {
      event.stopPropagation();
      if (event.detail === 0) pulsa(side); // con el teclado (Intro o espacio)
    });
  }
  // Con teclado, la barra espaciadora pulsa el reloj del que ha de pulsar.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || !espera || reloj.hidden) return;
    const activo = document.activeElement;
    if (activo && activo !== document.body && activo.tagName !== 'CANVAS' && !activo.classList.contains('pulsador')) return;
    event.preventDefault();
    pulsa(espera.side);
  });

  let ritmo = '';
  function rotula() {
    for (const [side, boton] of Object.entries(botones)) boton.setAttribute('aria-label', t(`reloj.${side}`));
    reloj.querySelector('.reloj-ritmo').textContent = typeof ritmo === 'function' ? ritmo() : ritmo;
  }

  return {
    // Enseña el reloj para un ritmo, o lo esconde con null. `label` es su nombre («Blitz · 3 | 2»),
    // o una función que lo devuelve en el idioma de ahora.
    show(control, label = '') {
      reloj.hidden = !control;
      ritmo = label;
      rotula();
    },
    // Vuelve a escribir los rótulos (al cambiar de idioma).
    refresh: rotula,
    // Lo que marca cada pantalla y cuál corre.
    render({ white, black, running, paused }) {
      for (const [side, ms] of [['white', white], ['black', black]]) {
        const texto = formatClock(ms);
        if (texto !== textos[side]) {
          textos[side] = texto;
          caras[side].querySelector('.reloj-cifras').innerHTML = cifras(texto);
        }
        caras[side].classList.toggle('activa', running === side);
        caras[side].classList.toggle('apurado', running === side && ms < 10000);
        caras[side].classList.toggle('agotado', ms <= 0);
      }
      reloj.dataset.corre = running ?? '';
      reloj.classList.toggle('en-pausa', Boolean(paused));
    },
    // Espera a que `side` pulse su lado (tras mover). Su pulsador brilla mientras tanto.
    awaitPress(side) {
      espera?.resolve();
      reloj.dataset.espera = side;
      return new Promise((resolve) => {
        espera = { side, resolve };
      });
    },
    // Pulsa por un bando (la CPU), con su golpe.
    press(side) {
      hunde(side);
    },
    // Ya no se espera a nadie (partida nueva, deshacer…).
    cancel() {
      const pendiente = espera;
      espera = null;
      reloj.dataset.espera = '';
      pendiente?.resolve(false);
    },
    get waiting() {
      return espera?.side ?? null;
    },
  };
}
