import { t } from '../i18n.js';
import { TIME_CONTROLS } from '../chess/timecontrol.js';
import { timeLabel } from './menu.js';

// LA SALA, A LA VISTA. Lo pidió el usuario: que se vea cuándo hay gente para jugar online, una lista de los
// que hay para buscarlos por nombre y retar a uno en concreto, y que el reto le llegue al otro.
//
// - En el menú, la tarjeta «Online» se ilumina y late en verde cuando hay alguien disponible, y en su
//   esquina va una píldora con cuántos hay, que abre la sala.
// - La sala: los conectados (disponibles primero), cada uno con su inicial, su nombre y qué hace; un
//   buscador por nombre; «Retar» en cada uno, y abajo «Buscar rival al azar».
// - Los retos que llegan salen arriba, encima de todo (en el menú o jugando): quién reta, con qué reloj,
//   «Aceptar» o «Rechazar» y una barra con lo que le queda antes de caducar.
//
// `lobby`: la sala de `net/online.js`. `canChallenge()`: si ahora se puede retar o aceptar (no a media
// partida online). `onMatch(info)`: un reto aceptado (por mí o por el otro), con el emparejamiento.
// `onQuick()`: «Buscar rival al azar». `time()`: el reloj elegido en el menú.
export function createLobbyUi({ lobby, time, canChallenge = () => true, onMatch, onQuick }) {
  const pildora = document.getElementById('menu-sala');
  const numero = document.getElementById('menu-sala-n');
  const tarjeta = document.querySelector('.modo[data-modo="online"]');
  const root = document.getElementById('sala');
  const lista = root.querySelector('#sala-lista');
  const vacia = root.querySelector('#sala-vacia');
  const filtro = root.querySelector('#sala-filtro');
  const yoTexto = root.querySelector('#sala-yo');
  const retosCaja = document.getElementById('retos');
  let jugadores = [];
  let miNombre = '';
  const retando = new Map(); // id → { reto, estado: 'esperando' | 'rechaza' | 'nocontesta', hasta }

  const nombreDe = (p) => p.name || t('sala.anonimo');
  const relojDe = (key) => {
    const [cat, op] = String(key).split(':');
    const c = TIME_CONTROLS.find((x) => x.id === cat);
    const o = c?.options.find((x) => x.id === op);
    return !c || cat === 'libre' ? t('tiempo.sinreloj') : `${t(`tiempo.${cat}`)} · ${timeLabel(o)}`;
  };
  // Un tono por persona, siempre el mismo: del nombre (o del identificador).
  const tono = (p) => {
    let h = 0;
    for (const ch of p.name || p.id) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  };
  const disponible = (p) => p.status !== 'playing';

  // ---- La píldora y la tarjeta del menú ----
  function pintaMenu() {
    const n = jugadores.filter(disponible).length;
    if (numero) numero.textContent = String(jugadores.length);
    pildora?.classList.toggle('hay', n > 0);
    tarjeta?.classList.toggle('hay-gente', n > 0);
    if (pildora) {
      const titulo = n === 1 ? t('sala.hay1') : n > 0 ? t('sala.hay', { n }) : t('sala.abrir');
      pildora.title = titulo;
      pildora.setAttribute('aria-label', titulo);
    }
  }

  // ---- La lista ----
  function estadoTexto(p) {
    const r = retando.get(p.id);
    if (r?.estado === 'rechaza') return t('sala.rechaza');
    if (r?.estado === 'nocontesta') return t('sala.nocontesta');
    if (p.status === 'seeking') return t('sala.estado.seeking');
    if (p.status === 'playing') return t('sala.estado.playing');
    return t('sala.estado.menu');
  }
  function pintaLista() {
    const q = filtro.value.trim().toLocaleLowerCase();
    const orden = (p) => (p.status === 'seeking' ? 0 : p.status === 'menu' ? 1 : 2);
    const vistos = jugadores
      .filter((p) => !q || nombreDe(p).toLocaleLowerCase().includes(q))
      .sort((a, b) => orden(a) - orden(b));
    lista.replaceChildren(...vistos.map((p) => {
      const li = document.createElement('li');
      li.className = 'sala-jugador';
      li.dataset.estado = p.status;
      const avatar = document.createElement('span');
      avatar.className = 'sala-avatar';
      avatar.style.setProperty('--tono', String(tono(p)));
      avatar.textContent = (p.name || '?').slice(0, 1).toLocaleUpperCase();
      const datos = document.createElement('span');
      datos.className = 'sala-datos';
      const nombre = document.createElement('span');
      nombre.className = 'sala-nombre';
      nombre.textContent = nombreDe(p);
      const estado = document.createElement('span');
      estado.className = 'sala-estado';
      estado.textContent = estadoTexto(p);
      datos.append(nombre, estado);
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'sala-retar';
      const r = retando.get(p.id);
      if (r?.estado === 'esperando') {
        boton.classList.add('esperando');
        boton.textContent = t('sala.esperando');
        boton.title = t('sala.cancelar');
        boton.addEventListener('click', () => r.reto.cancel());
      } else {
        boton.textContent = t('sala.retar');
        boton.disabled = !disponible(p) || !canChallenge();
        boton.addEventListener('click', () => reta(p));
      }
      li.append(avatar, datos, boton);
      return li;
    }));
    vacia.hidden = vistos.length > 0;
    vacia.textContent = jugadores.length ? t('sala.nadie') : t('sala.vacia');
    yoTexto.textContent = miNombre ? t('sala.yo', { nombre: miNombre }) : t('sala.sinnombre');
  }

  async function reta(p) {
    if (!canChallenge()) return;
    const reto = lobby.invite(p.id, { time: time() });
    retando.set(p.id, { reto, estado: 'esperando' });
    pintaLista();
    const r = await reto.promise;
    if (r?.game) {
      retando.delete(p.id);
      cerrar();
      onMatch(r);
      return;
    }
    if (r?.canceled) retando.delete(p.id);
    else retando.set(p.id, { estado: r?.declined ? 'rechaza' : 'nocontesta' });
    pintaLista();
    if (!r?.canceled) {
      setTimeout(() => {
        if (retando.get(p.id)?.estado !== 'esperando') retando.delete(p.id);
        pintaLista();
      }, 3500);
    }
  }

  function abrir() {
    root.hidden = false;
    root.classList.remove('entra');
    void root.offsetWidth;
    root.classList.add('entra');
    pintaLista();
    setTimeout(() => filtro.focus({ preventScroll: true }), 250);
  }
  function cerrar() {
    root.hidden = true;
    // Los retos que dejo sin contestar al cerrar, se retiran.
    for (const r of retando.values()) if (r.estado === 'esperando') r.reto.cancel();
  }
  pildora?.addEventListener('click', (event) => {
    event.stopPropagation();
    abrir();
  });
  root.querySelector('#sala-cerrar').addEventListener('click', cerrar);
  root.addEventListener('click', (event) => {
    if (event.target === root) cerrar();
  });
  root.addEventListener('keydown', (event) => {
    event.stopPropagation();
    if (event.key === 'Escape') cerrar();
  });
  filtro.addEventListener('input', pintaLista);
  root.querySelector('#sala-azar').addEventListener('click', () => {
    cerrar();
    onQuick?.();
  });

  lobby.onPlayers((l) => {
    jugadores = l;
    pintaMenu();
    if (!root.hidden) pintaLista();
  });

  // ---- Los retos que llegan ----
  const avisos = new Map(); // game → elemento
  function quitaAviso(game) {
    const el = avisos.get(game);
    if (!el) return;
    avisos.delete(game);
    el.classList.add('sale');
    setTimeout(() => el.remove(), 300);
  }
  lobby.onInvite((reto) => {
    if (reto.gone) {
      quitaAviso(reto.game);
      return;
    }
    // A media partida online no se puede: se le dice que no, sin molestar.
    if (!canChallenge()) {
      lobby.declineInvite(reto.game);
      return;
    }
    const el = document.createElement('div');
    el.className = 'reto';
    el.setAttribute('role', 'alertdialog');
    const icono = document.createElement('span');
    icono.className = 'reto-icono';
    icono.setAttribute('aria-hidden', 'true');
    icono.textContent = '⚔';
    const textos = document.createElement('span');
    textos.className = 'reto-textos';
    const quien = document.createElement('b');
    quien.textContent = reto.name || t('reto.anonimo');
    const que = document.createElement('span');
    que.textContent = `${t('reto.te')} · ${relojDe(reto.time)}`;
    textos.append(quien, que);
    const si = document.createElement('button');
    si.type = 'button';
    si.className = 'reto-si';
    si.textContent = t('reto.aceptar');
    const no = document.createElement('button');
    no.type = 'button';
    no.className = 'reto-no';
    no.textContent = t('reto.rechazar');
    const barra = document.createElement('span');
    barra.className = 'reto-tiempo';
    barra.style.setProperty('--dura', `${Math.max(0, reto.expires - Date.now()) / 1000}s`);
    el.append(icono, textos, si, no, barra);
    si.addEventListener('click', async () => {
      si.disabled = true;
      no.disabled = true;
      quitaAviso(reto.game);
      const info = await lobby.acceptInvite(reto.game);
      if (info) onMatch(info);
    });
    no.addEventListener('click', () => {
      lobby.declineInvite(reto.game);
      quitaAviso(reto.game);
    });
    avisos.set(reto.game, el);
    retosCaja.append(el);
    setTimeout(() => si.focus({ preventScroll: true }), 50);
  });

  return {
    // El nombre con el que se aparece en la sala.
    setName(nombre) {
      miNombre = nombre;
      if (!root.hidden) pintaLista();
    },
    open: abrir,
    close: cerrar,
    // Se ha empezado una partida (o vuelto al menú): los retos pendientes ya no.
    clearInvites() {
      for (const game of [...avisos.keys()]) {
        lobby.declineInvite(game);
        quitaAviso(game);
      }
    },
    refresh() {
      pintaMenu();
      if (!root.hidden) pintaLista();
    },
  };
}
