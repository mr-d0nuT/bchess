import { t } from '../i18n.js';

// Lo que la partida le dice al jugador: de quién es el turno, el «¡JAQUE!», el final (mate, tablas o
// tiempo, con revancha o vuelta al menú) y a qué se corona un peón. Se crea aquí y no en el HTML
// porque no se ve hasta que empieza la partida. Todo en el idioma elegido.

const PIEZA = { white: '♔', black: '♚' };
const CORONAS = [['queen', '♛'], ['rook', '♜'], ['bishop', '♝'], ['knight', '♞']];

function el(tag, clase, texto) {
  const e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function createMatchUi(root = document.getElementById('hud')) {
  // El turno, arriba en el centro.
  const turno = el('div', 'turno');
  turno.setAttribute('role', 'status');
  turno.setAttribute('aria-live', 'polite');
  turno.hidden = true;
  const turnoPieza = el('span', 'turno-pieza');
  const turnoTexto = el('span', 'turno-texto');
  turno.append(turnoPieza, turnoTexto);
  root.append(turno);

  // El cartel del jaque, en medio.
  const cartel = el('div', 'cartel');
  cartel.setAttribute('aria-live', 'assertive');
  root.append(cartel);

  // El final de la partida.
  const final = el('div', 'final');
  final.setAttribute('role', 'dialog');
  final.setAttribute('aria-modal', 'true');
  final.hidden = true;
  const finalCaja = el('div', 'final-caja');
  const finalTitulo = el('h2', 'final-titulo');
  const finalTexto = el('p', 'final-texto');
  const finalBotones = el('div', 'final-botones');
  const revancha = el('button', 'final-boton principal');
  const menu = el('button', 'final-boton');
  revancha.type = 'button';
  menu.type = 'button';
  finalBotones.append(revancha, menu);
  finalCaja.append(finalTitulo, finalTexto, finalBotones);
  final.append(finalCaja);
  document.body.append(final);

  // A qué se corona.
  const corona = el('div', 'corona');
  corona.setAttribute('role', 'dialog');
  corona.setAttribute('aria-modal', 'true');
  corona.hidden = true;
  const coronaCaja = el('div', 'corona-caja');
  const coronaTitulo = el('p', 'corona-titulo');
  const coronaBotones = el('div', 'corona-botones');
  coronaCaja.append(coronaTitulo, coronaBotones);
  corona.append(coronaCaja);
  document.body.append(corona);

  let cartelTimer = 0;
  let ultimoTurno = null;

  const api = {
    // De quién es el turno. `mode` 'pvp' o 'cpu'; `human`, el color del jugador contra la CPU;
    // `press`, que el que acaba de mover tiene que pulsar el reloj.
    turn(estado) {
      ultimoTurno = estado;
      const { side, mode, human, thinking = false, hidden = false, press = null, nombres = {} } = estado;
      turno.hidden = hidden;
      if (hidden) return;
      const lado = press ?? side;
      turno.dataset.lado = lado;
      turnoPieza.textContent = PIEZA[lado];
      // Con nombre, el suyo: «Mueve Ana»; online, «Turno de Bruno».
      let texto = nombres[side] ? t('turno.de', { nombre: nombres[side] }) : t(`turno.${side}`);
      if (mode === 'cpu') texto = side === human ? t('turno.tuyo') : t('turno.cpu');
      if (mode === 'online') texto = side === human ? t('turno.tuyo') : nombres[side] ? t('turno.rivalDe', { nombre: nombres[side] }) : t('turno.rival');
      if (press) texto = t('turno.pulsa');
      turno.classList.toggle('piensa', (mode === 'cpu' || mode === 'online') && side !== human && thinking && !press);
      turno.classList.toggle('pulsa', Boolean(press));
      if (turnoTexto.textContent !== texto) {
        turnoTexto.textContent = texto;
        turno.classList.remove('cambia');
        void turno.offsetWidth;
        turno.classList.add('cambia');
      }
    },

    // Un cartel grande que entra y se va solo: «¡JAQUE!».
    banner(texto, { tipo = 'jaque', ms = 1500 } = {}) {
      clearTimeout(cartelTimer);
      cartel.textContent = texto;
      cartel.dataset.tipo = tipo;
      cartel.classList.remove('sale');
      void cartel.offsetWidth;
      cartel.classList.add('sale');
      cartelTimer = setTimeout(() => cartel.classList.remove('sale'), ms);
    },

    // El final. `status`: el de `Position.status()` o 'time' (se le acabó el tiempo a `flagged`);
    // `winner`, el color que gana (o null si son tablas). Devuelve 'rematch' o 'menu'.
    // `escena`: detrás está la del jaque mate (el rey de rodillas, el confeti…): el cartel va abajo y deja verla.
    gameOver({ status, winner, mode, human, flagged = null, nombres = {}, escena = false }) {
      let titulo = t('final.tablas');
      let texto = t(`tablas.${status}`);
      let tipo = 'tablas';
      if (status === 'time') {
        titulo = t('final.tiempo');
        texto = winner ? t(`final.sintiempo.${flagged}`) : t('tablas.time');
      }
      if (status === 'checkmate') titulo = t('final.mate');
      if (status === 'abandon' || status === 'rivalResigned') titulo = t('final.ganas'); // online: el rival se ha ido o se ha rendido
      // Me he rendido (uno contra uno, el que movía: el que no gana).
      if (status === 'resign') titulo = mode === 'pvp' && winner ? t(`final.rinde.${winner === 'white' ? 'black' : 'white'}`) : t('final.rendido');
      if (winner) {
        if (mode === 'cpu') texto = winner === human ? t('final.ganaste') : t('final.perdiste');
        else if (mode === 'online' && status === 'abandon') texto = t('final.abandono');
        else if (mode === 'online' && status === 'rivalResigned') texto = t('final.serinde');
        else if (mode === 'online') texto = winner === human ? t('final.ganas') : nombres[winner] ? t('final.ganaNombre', { nombre: nombres[winner] }) : t('final.pierdes');
        else {
          // 1 contra 1: «¡Gana Ana!», o «Ganan las blancas» si no hay nombre.
          const gana = nombres[winner] ? t('final.ganaNombre', { nombre: nombres[winner] }) : t(`final.gana.${winner}`);
          texto = status === 'time' ? `${t(`final.sintiempo.${flagged}`)}. ${gana}` : gana;
        }
        tipo = (mode === 'cpu' || mode === 'online') && winner !== human ? 'pierde' : 'gana';
      }
      finalTitulo.textContent = titulo;
      finalTexto.textContent = texto;
      revancha.textContent = mode === 'online' ? t('final.otro') : t('final.revancha'); // online, otro rival
      menu.textContent = t('final.menu');
      final.dataset.tipo = tipo;
      final.classList.toggle('con-escena', escena);
      final.hidden = false;
      final.classList.remove('entra');
      void final.offsetWidth;
      final.classList.add('entra');
      setTimeout(() => revancha.focus({ preventScroll: true }), 400);
      return new Promise((resolve) => {
        const cerrar = (que) => {
          final.hidden = true;
          revancha.onclick = null;
          menu.onclick = null;
          resolve(que);
        };
        revancha.onclick = () => cerrar('rematch');
        menu.onclick = () => cerrar('menu');
      });
    },

    // Pregunta a qué se corona. Devuelve 'queen' | 'rook' | 'bishop' | 'knight'.
    promotion(color) {
      coronaTitulo.textContent = t('corona.titulo');
      corona.setAttribute('aria-label', t('corona.aria'));
      coronaBotones.textContent = '';
      corona.dataset.lado = color;
      corona.hidden = false;
      return new Promise((resolve) => {
        for (const [kind, simbolo] of CORONAS) {
          const boton = el('button', 'corona-boton');
          boton.type = 'button';
          boton.append(el('span', 'corona-simbolo', simbolo), el('span', 'corona-nombre', t(`pieza.${kind}`)));
          boton.addEventListener('click', () => {
            corona.hidden = true;
            resolve(kind);
          });
          coronaBotones.append(boton);
        }
        setTimeout(() => coronaBotones.firstChild?.focus({ preventScroll: true }), 50);
      });
    },

    // Vuelve a escribir lo que se ve (al cambiar de idioma).
    refresh() {
      if (ultimoTurno) api.turn(ultimoTurno);
    },

    closeAll() {
      final.hidden = true;
      corona.hidden = true;
      turno.hidden = true;
      cartel.classList.remove('sale');
    },
  };
  return api;
}
