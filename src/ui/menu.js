import { LANGUAGES, currentLanguage, onLanguage, setLanguage, t } from '../i18n.js';
import { TIME_CONTROLS, findTimeControl } from '../chess/timecontrol.js';
import { flagSvg } from './flags.js';
import { cleanName } from '../names.js';

// El menú de después de la carga: pantalla negra, el logo, cómo se juega (uno contra uno, contra la CPU
// —con qué piezas y a qué nivel— u online, contra otro que también busque partida), cuánto dura la partida (bala, blitz, rápida, diaria o sin
// reloj), el idioma (la bandera de arriba) y JUGAR. Si hay una partida a medias, arriba del todo,
// «Continuar partida». Suena la misma melodía que en la carga; al pulsar
// JUGAR se funde (eso lo hace quien llama, que es quien sabe de música).
//
// Todo se mueve: detrás suben chispas, el logo flota, la tarjeta elegida lleva un borde de neón que
// da vueltas y JUGAR late y tiene un brillo que le cruza. Al pulsarlo, revienta en chispas y el menú
// se aleja hacia la cámara.

const STORE = 'bchess.menu';
const NIVELES = [10, 25, 45, 65, 80, 92, 100]; // hasta qué nivel llega cada nombre (nivel.1 … nivel.7)
export const levelName = (level) => t(`nivel.${NIVELES.findIndex((hasta) => level <= hasta) + 1 || NIVELES.length}`);

// Cómo se lee un ritmo en el idioma de ahora: «3 min», «3 | 2», «1 día», «Sin reloj».
export function timeLabel(option) {
  if (!option || option.id === 'libre') return t('tiempo.sinreloj');
  if (option.perMove) {
    const dias = Math.round(option.perMove / 86400000);
    return dias === 1 ? t('tiempo.dia') : t('tiempo.dias', { n: dias });
  }
  const minutos = Math.round(option.base / 60000);
  return option.inc ? `${minutos} | ${Math.round(option.inc / 1000)}` : t('tiempo.min', { n: minutos });
}

const POR_DEFECTO = { mode: 'cpu', level: 30, color: 'white', time: 'libre:libre', nombres: { white: '', black: '', yo: '' } };

// «hace 5 minutos», en el idioma de ahora.
function haceCuanto(ms) {
  try {
    const rtf = new Intl.RelativeTimeFormat(currentLanguage(), { numeric: 'auto' });
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return rtf.format(-s, 'second');
    const m = Math.round(s / 60);
    if (m < 60) return rtf.format(-m, 'minute');
    const h = Math.round(m / 60);
    if (h < 24) return rtf.format(-h, 'hour');
    return rtf.format(-Math.round(h / 24), 'day');
  } catch {
    return ''; // un navegador sin esto: se queda sin decir cuándo
  }
}

// Lo que se cuenta de la partida a medias: «1 contra CPU · nivel 42 (…) · Blitz · 3 | 2 · jugada 14 ·
// hace 5 minutos».
function describirGuardada(g) {
  const conNombres = g.mode === 'pvp' && (g.nombres?.white || g.nombres?.black);
  const pvp = conNombres ? `${g.nombres.white || t('color.white')} – ${g.nombres.black || t('color.black')}` : t('ajustes.pvp');
  const partes = [g.mode === 'cpu' ? t('ajustes.cpu', { n: g.level, nombre: levelName(g.level) }) : pvp];
  const control = findTimeControl(g.time);
  if (control) partes.push(`${t(`tiempo.${control.key.split(':')[0]}`)} · ${timeLabel(control)}`);
  partes.push(t('menu.jugada', { n: Math.floor(g.moves / 2) + 1 }));
  if (Number.isFinite(g.cuando)) partes.push(haceCuanto(Date.now() - g.cuando));
  return partes.filter(Boolean).join(' · ');
}

function leer() {
  try {
    const g = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (g && ['pvp', 'cpu', 'online'].includes(g.mode)) {
      return {
        mode: g.mode,
        level: Math.max(1, Math.min(100, Math.round(g.level ?? 30))),
        color: ['white', 'black', 'random'].includes(g.color) ? g.color : 'white',
        time: typeof g.time === 'string' ? g.time : POR_DEFECTO.time,
        // Los nombres: los de 1 contra 1 (blancas y negras) y el mío para online.
        nombres: { white: cleanName(g.nombres?.white), black: cleanName(g.nombres?.black), yo: cleanName(g.nombres?.yo) },
      };
    }
  } catch {
    // sin almacenamiento (ventana privada, bloqueado): se empieza de cero
  }
  return { ...POR_DEFECTO };
}

function guardar(eleccion) {
  try {
    localStorage.setItem(STORE, JSON.stringify(eleccion));
  } catch {
    // no pasa nada: la próxima vez se vuelve a elegir
  }
}

// Chispas que suben por el fondo, doradas y azules. En un lienzo propio, solo mientras se ve.
function createSparks(canvas) {
  const ctx = canvas.getContext('2d');
  const chispas = [];
  let ancho = 0;
  let alto = 0;
  let escala = 1;
  let vivo = false;
  let antes = 0;

  function medir() {
    escala = Math.min(2, window.devicePixelRatio || 1);
    ancho = canvas.clientWidth;
    alto = canvas.clientHeight;
    canvas.width = Math.round(ancho * escala);
    canvas.height = Math.round(alto * escala);
  }

  function nueva(x, y, fuerza = 0) {
    const azul = Math.random() < 0.35;
    const angulo = Math.random() * Math.PI * 2;
    return {
      x: x ?? Math.random() * ancho,
      y: y ?? alto + 10,
      vx: fuerza ? Math.cos(angulo) * fuerza * (0.4 + Math.random()) : (Math.random() - 0.5) * 12,
      vy: fuerza ? Math.sin(angulo) * fuerza * (0.4 + Math.random()) - fuerza * 0.3 : -(20 + Math.random() * 55),
      vida: 0,
      dura: fuerza ? 0.7 + Math.random() * 0.8 : 5 + Math.random() * 6,
      tam: fuerza ? 1.5 + Math.random() * 2.5 : 0.8 + Math.random() * 2.2,
      tono: azul ? 200 + Math.random() * 20 : 32 + Math.random() * 18,
      fase: Math.random() * 10,
    };
  }

  function paso(ahora) {
    if (!vivo) return;
    const dt = Math.min(0.05, (ahora - antes) / 1000 || 0);
    antes = ahora;
    if (canvas.clientWidth !== ancho || canvas.clientHeight !== alto) medir();
    const objetivo = Math.round((ancho * alto) / 15000); // menos que con el fondo negro: detrás ya hay escena
    while (chispas.length < objetivo) {
      const c = nueva();
      c.y = Math.random() * alto; // al empezar, repartidas por toda la pantalla
      chispas.push(c);
    }
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = chispas.length - 1; i >= 0; i--) {
      const c = chispas[i];
      c.vida += dt;
      c.x += (c.vx + Math.sin(c.fase + c.vida * 1.3) * 6) * dt;
      c.y += c.vy * dt;
      if (c.dura < 2) c.vy += 60 * dt; // las del estallido caen
      const k = c.vida / c.dura;
      if (k >= 1 || c.y < -20) {
        chispas.splice(i, 1);
        if (c.dura >= 2) chispas.push(nueva());
        continue;
      }
      const brillo = Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(c.fase * 3 + c.vida * 8));
      const r = c.tam * 3.2;
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
      g.addColorStop(0, `hsla(${c.tono}, 100%, 85%, ${brillo})`);
      g.addColorStop(0.35, `hsla(${c.tono}, 100%, 60%, ${brillo * 0.55})`);
      g.addColorStop(1, `hsla(${c.tono}, 100%, 50%, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    }
    requestAnimationFrame(paso);
  }

  return {
    start() {
      if (vivo) return;
      vivo = true;
      medir();
      antes = performance.now();
      requestAnimationFrame(paso);
    },
    stop() {
      vivo = false;
      chispas.length = 0;
    },
    // Un estallido de chispas en (x, y), en píxeles de la pantalla.
    burst(x, y, n = 90) {
      for (let i = 0; i < n; i++) chispas.push(nueva(x, y, 260 + Math.random() * 260));
    },
  };
}

// `onShow()` y `onHide()`: se avisa al enseñarlo y al esconderlo (la cámara de cine del fondo, que empieza y
// acaba con él); lo que devuelva `onHide`, se espera.
export function createMenu({ onShow = null, onHide = null } = {}) {
  const root = document.getElementById('menu');
  const chispas = createSparks(root.querySelector('#menu-chispas'));
  const modos = [...root.querySelectorAll('.modo')];
  const cpuSub = root.querySelector('#menu-cpu-sub');
  const bloqueCpu = root.querySelector('.menu-cpu');
  const bloqueNombres = root.querySelector('.menu-nombres');
  const campos = Object.fromEntries(['white', 'black', 'yo'].map((lado) => [lado, root.querySelector(`#menu-nombre-${lado}`)]));
  const colores = [...root.querySelectorAll('.pieza-op')];
  const rango = root.querySelector('#menu-nivel-rango');
  const valor = root.querySelector('#menu-nivel-valor');
  const nombre = root.querySelector('#menu-nivel-nombre');
  const categorias = root.querySelector('#menu-tiempo-categorias');
  const opciones = root.querySelector('#menu-tiempo-opciones');
  const elegido = root.querySelector('#menu-tiempo-elegido');
  const jugar = root.querySelector('#menu-jugar');
  const continuar = root.querySelector('#menu-continuar');
  const continuarSub = root.querySelector('#menu-continuar-sub');
  const logo = root.querySelector('.menu-logo');
  const idiomaBoton = root.querySelector('#menu-idioma-boton');
  const idiomas = root.querySelector('#menu-idiomas');
  logo?.addEventListener('error', () => root.classList.add('sin-logo'));
  let eleccion = leer();
  let responder = null;
  let guardada = null; // la partida a medias que se puede continuar (su resumen), o null

  const categoriaDe = (key) => TIME_CONTROLS.find((c) => c.id === String(key).split(':')[0]) ?? TIME_CONTROLS[0];
  const opcionDe = (key) => {
    const c = categoriaDe(key);
    return c.options.find((o) => o.id === String(key).split(':')[1]) ?? c.options[0];
  };

  // La duración: una pestaña por ritmo (bala, blitz…) y, debajo, sus tres tiempos.
  function pintarTiempo() {
    const cat = categoriaDe(eleccion.time);
    const opt = opcionDe(eleccion.time);
    categorias.replaceChildren(...TIME_CONTROLS.map((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tiempo-cat';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c.id === cat.id));
      b.textContent = t(`tiempo.${c.id}`);
      b.addEventListener('click', () => {
        const actual = categoriaDe(eleccion.time);
        if (actual.id === c.id) return;
        // Al cambiar de ritmo se queda con el tiempo del medio (el más típico: 3|2, 15|10, 1|1).
        const o = c.options[Math.min(1, c.options.length - 1)];
        eleccion = { ...eleccion, time: `${c.id}:${o.id}` };
        pintarTiempo();
      });
      return b;
    }));
    opciones.hidden = cat.id === 'libre';
    opciones.replaceChildren(...(cat.id === 'libre' ? [] : cat.options.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tiempo-op';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(o.id === opt.id));
      b.textContent = timeLabel(o);
      b.addEventListener('click', () => {
        eleccion = { ...eleccion, time: `${cat.id}:${o.id}` };
        pintarTiempo();
      });
      return b;
    })));
    elegido.textContent = cat.id === 'libre' ? t('tiempo.sinreloj') : `${t(`tiempo.${cat.id}`)} · ${timeLabel(opt)}`;
  }

  // La lista de idiomas, con sus banderas.
  function pintarIdiomas() {
    idiomaBoton.innerHTML = flagSvg(currentLanguage());
    idiomas.replaceChildren(...LANGUAGES.map((l) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'idioma';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(l.id === currentLanguage()));
      b.lang = l.id;
      b.dir = l.rtl ? 'rtl' : 'ltr';
      b.innerHTML = `${flagSvg(l.id)}<span></span>`;
      b.querySelector('span').textContent = l.name;
      b.addEventListener('click', () => {
        abrirIdiomas(false);
        setLanguage(l.id);
      });
      return b;
    }));
  }
  function abrirIdiomas(abrir) {
    idiomas.hidden = !abrir;
    idiomaBoton.setAttribute('aria-expanded', String(abrir));
    if (abrir) idiomas.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
  }
  idiomaBoton.addEventListener('click', (event) => {
    event.stopPropagation();
    abrirIdiomas(idiomas.hidden);
  });
  root.addEventListener('click', (event) => {
    if (!idiomas.hidden && !idiomas.contains(event.target)) abrirIdiomas(false);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !idiomas.hidden) abrirIdiomas(false);
  });

  function pintar() {
    for (const boton of modos) {
      const elegida = boton.dataset.modo === eleccion.mode;
      boton.setAttribute('aria-checked', String(elegida));
      boton.tabIndex = elegida ? 0 : -1;
    }
    for (const boton of colores) boton.setAttribute('aria-checked', String(boton.dataset.color === eleccion.color));
    cpuSub.textContent = t(`menu.cpu.${eleccion.color}`);
    const cpu = eleccion.mode === 'cpu';
    bloqueCpu.classList.toggle('abierto', cpu);
    bloqueCpu.setAttribute('aria-hidden', String(!cpu));
    rango.disabled = !cpu;
    // Los nombres: en 1 contra 1, los dos; online, el mío.
    const conNombres = eleccion.mode === 'pvp' || eleccion.mode === 'online';
    bloqueNombres.classList.toggle('abierto', conNombres);
    bloqueNombres.setAttribute('aria-hidden', String(!conNombres));
    bloqueNombres.dataset.modo = eleccion.mode;
    campos.white.parentElement.hidden = eleccion.mode !== 'pvp';
    campos.black.parentElement.hidden = eleccion.mode !== 'pvp';
    campos.yo.parentElement.hidden = eleccion.mode !== 'online';
    for (const [lado, campo] of Object.entries(campos)) {
      if (document.activeElement !== campo) campo.value = eleccion.nombres?.[lado] ?? '';
      campo.tabIndex = conNombres && !campo.parentElement.hidden ? 0 : -1;
    }
    for (const boton of colores) boton.tabIndex = cpu ? 0 : -1;
    rango.value = String(eleccion.level);
    const n = (eleccion.level - 1) / 99;
    root.style.setProperty('--nivel', `${n * 100}%`);
    root.style.setProperty('--tono-nivel', String(Math.round(190 - 190 * n))); // de cian a rojo
    valor.textContent = String(eleccion.level);
    nombre.textContent = levelName(eleccion.level);
    pintarTiempo();
    pintarIdiomas();
    if (continuar) {
      continuar.hidden = !guardada;
      if (guardada && continuarSub) continuarSub.textContent = describirGuardada(guardada);
    }
  }
  onLanguage(pintar);

  for (const boton of modos) {
    boton.addEventListener('click', () => {
      eleccion = { ...eleccion, mode: boton.dataset.modo };
      pintar();
      boton.classList.remove('toque');
      void boton.offsetWidth; // reinicia la animación del toque
      boton.classList.add('toque');
    });
    boton.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const otro = modos[(modos.indexOf(boton) + 1) % modos.length];
      otro.click();
      otro.focus();
    });
  }
  for (const [lado, campo] of Object.entries(campos)) {
    const pon = (valor) => {
      eleccion = { ...eleccion, nombres: { ...(eleccion.nombres ?? POR_DEFECTO.nombres), [lado]: valor } };
    };
    campo.addEventListener('input', () => pon(campo.value));
    campo.addEventListener('change', () => {
      campo.value = cleanName(campo.value);
      pon(campo.value);
      guardar(eleccion);
    });
    // Con Intro se cierra el teclado; y las teclas no salen del campo (los atajos del menú no las ven).
    campo.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') campo.blur();
    });
  }
  for (const boton of colores) {
    boton.addEventListener('click', () => {
      eleccion = { ...eleccion, color: boton.dataset.color };
      pintar();
    });
  }
  rango.addEventListener('input', () => {
    eleccion = { ...eleccion, level: Number(rango.value) };
    pintar();
    valor.classList.remove('salta');
    void valor.offsetWidth;
    valor.classList.add('salta');
  });
  jugar.addEventListener('click', () => {
    if (!responder) return;
    const n = eleccion.nombres ?? POR_DEFECTO.nombres;
    eleccion = { ...eleccion, nombres: { white: cleanName(n.white), black: cleanName(n.black), yo: cleanName(n.yo) } };
    guardar(eleccion);
    const caja = jugar.getBoundingClientRect();
    chispas.burst(caja.left + caja.width / 2, caja.top + caja.height / 2);
    jugar.classList.add('pulsado');
    const listo = responder;
    responder = null;
    listo({ ...eleccion });
  });
  continuar?.addEventListener('click', () => {
    if (!responder) return;
    const caja = continuar.getBoundingClientRect();
    chispas.burst(caja.left + caja.width / 2, caja.top + caja.height / 2);
    continuar.classList.add('pulsado');
    const listo = responder;
    responder = null;
    listo({ continuar: true });
  });

  return {
    // Enseña el menú y espera a JUGAR, que devuelve { mode, level, color, time }; o, si se le da una
    // partida `guardada` (su resumen: { mode, level, time, moves, cuando }), a «Continuar partida», que
    // devuelve { continuar: true }.
    show({ guardada: aMedias = null } = {}) {
      eleccion = leer();
      guardada = aMedias;
      continuar?.classList.remove('pulsado');
      pintar();
      abrirIdiomas(false);
      root.hidden = false;
      document.body.classList.add('en-menu'); // el HUD de la partida, fuera: el menú ya no tiene fondo que lo tape
      root.classList.remove('sale', 'entra');
      jugar.classList.remove('pulsado');
      void root.offsetWidth;
      root.classList.add('entra');
      chispas.start();
      onShow?.();
      setTimeout(() => (guardada ? continuar : jugar).focus({ preventScroll: true }), 900);
      return new Promise((resolve) => {
        responder = resolve;
      });
    },
    // Se aleja hacia la cámara y desaparece.
    async hide() {
      root.classList.add('sale');
      await Promise.all([new Promise((resolve) => setTimeout(resolve, 900)), onHide?.()]);
      document.body.classList.remove('en-menu');
      root.hidden = true;
      root.classList.remove('sale', 'entra');
      chispas.stop();
    },
    get choice() {
      return { ...eleccion };
    },
  };
}
