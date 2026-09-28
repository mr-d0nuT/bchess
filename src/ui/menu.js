// El menú de después de la carga: pantalla negra, el logo, cómo se juega (uno contra uno o contra la
// CPU), el nivel de la CPU del 1 al 100 y JUGAR. Suena la misma melodía que en la carga; al pulsar
// JUGAR se funde (eso lo hace quien llama, que es quien sabe de música).
//
// Todo se mueve: detrás suben chispas, el logo flota, la tarjeta elegida lleva un borde de neón que
// da vueltas y JUGAR late y tiene un brillo que le cruza. Al pulsarlo, revienta en chispas y el menú
// se aleja hacia la cámara.

const STORE = 'bchess.menu';
const NIVELES = [
  [10, 'Principiante'],
  [25, 'Novato'],
  [45, 'Aficionado'],
  [65, 'Jugador de club'],
  [80, 'Experto'],
  [92, 'Maestro'],
  [100, 'Gran maestro'],
];
export const levelName = (level) => NIVELES.find(([hasta]) => level <= hasta)?.[1] ?? 'Gran maestro';

function leer() {
  try {
    const guardado = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (guardado && (guardado.mode === 'pvp' || guardado.mode === 'cpu')) {
      return { mode: guardado.mode, level: Math.max(1, Math.min(100, Math.round(guardado.level ?? 30))) };
    }
  } catch {
    // sin almacenamiento (ventana privada, bloqueado): se empieza de cero
  }
  return { mode: 'cpu', level: 30 };
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
    const objetivo = Math.round((ancho * alto) / 9000);
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

export function createMenu() {
  const root = document.getElementById('menu');
  const chispas = createSparks(root.querySelector('#menu-chispas'));
  const modos = [...root.querySelectorAll('.modo')];
  const nivel = root.querySelector('.menu-nivel');
  const rango = root.querySelector('#menu-nivel-rango');
  const valor = root.querySelector('#menu-nivel-valor');
  const nombre = root.querySelector('#menu-nivel-nombre');
  const jugar = root.querySelector('#menu-jugar');
  const logo = root.querySelector('.menu-logo');
  logo?.addEventListener('error', () => root.classList.add('sin-logo'));
  let eleccion = leer();
  let responder = null;

  function pintar() {
    for (const boton of modos) {
      const elegido = boton.dataset.modo === eleccion.mode;
      boton.setAttribute('aria-checked', String(elegido));
      boton.tabIndex = elegido ? 0 : -1;
    }
    nivel.classList.toggle('abierto', eleccion.mode === 'cpu');
    nivel.setAttribute('aria-hidden', String(eleccion.mode !== 'cpu'));
    rango.disabled = eleccion.mode !== 'cpu';
    rango.value = String(eleccion.level);
    const n = (eleccion.level - 1) / 99;
    root.style.setProperty('--nivel', `${n * 100}%`);
    root.style.setProperty('--tono-nivel', String(Math.round(190 - 190 * n))); // de cian a rojo
    valor.textContent = String(eleccion.level);
    nombre.textContent = levelName(eleccion.level);
  }

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
  rango.addEventListener('input', () => {
    eleccion = { ...eleccion, level: Number(rango.value) };
    pintar();
    valor.classList.remove('salta');
    void valor.offsetWidth;
    valor.classList.add('salta');
  });
  jugar.addEventListener('click', () => {
    if (!responder) return;
    guardar(eleccion);
    const caja = jugar.getBoundingClientRect();
    chispas.burst(caja.left + caja.width / 2, caja.top + caja.height / 2);
    jugar.classList.add('pulsado');
    const listo = responder;
    responder = null;
    listo({ ...eleccion });
  });

  return {
    // Enseña el menú y espera a JUGAR. Devuelve { mode: 'pvp' | 'cpu', level }.
    show() {
      eleccion = leer();
      pintar();
      root.hidden = false;
      root.classList.remove('sale', 'entra');
      jugar.classList.remove('pulsado');
      void root.offsetWidth;
      root.classList.add('entra');
      chispas.start();
      setTimeout(() => (eleccion.mode === 'cpu' ? rango : jugar).focus({ preventScroll: true }), 900);
      return new Promise((resolve) => {
        responder = resolve;
      });
    },
    // Se aleja hacia la cámara y desaparece.
    async hide() {
      root.classList.add('sale');
      await new Promise((resolve) => setTimeout(resolve, 900));
      root.hidden = true;
      root.classList.remove('sale', 'entra');
      chispas.stop();
    },
    get choice() {
      return { ...eleccion };
    },
  };
}
