// Lo que la partida le dice al jugador: de quién es el turno, el «¡JAQUE!», el final (mate o tablas,
// con revancha o vuelta al menú) y a qué se corona un peón. Se crea aquí y no en el HTML porque no
// se ve hasta que empieza la partida.

const PIEZA = { white: '♔', black: '♚' };
const COLOR = { white: 'blancas', black: 'negras' };
const TABLAS = {
  stalemate: 'Rey ahogado',
  fifty: 'Cincuenta jugadas sin comer ni mover un peón',
  repetition: 'La misma posición, tres veces',
  material: 'No queda material para dar mate',
};
const CORONAS = [
  ['queen', '♛', 'Dama'],
  ['rook', '♜', 'Torre'],
  ['bishop', '♝', 'Alfil'],
  ['knight', '♞', 'Caballo'],
];

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
  const revancha = el('button', 'final-boton principal', 'Revancha');
  const menu = el('button', 'final-boton', 'Menú');
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
  corona.setAttribute('aria-label', 'Coronar el peón');
  corona.hidden = true;
  const coronaCaja = el('div', 'corona-caja');
  coronaCaja.append(el('p', 'corona-titulo', '¡Corona!'));
  const coronaBotones = el('div', 'corona-botones');
  coronaCaja.append(coronaBotones);
  corona.append(coronaCaja);
  document.body.append(corona);

  let cartelTimer = 0;

  return {
    // De quién es el turno. `mode` 'pvp' o 'cpu'; `human`, el color del jugador contra la CPU.
    turn({ side, mode, human, thinking = false, hidden = false }) {
      turno.hidden = hidden;
      if (hidden) return;
      turno.dataset.lado = side;
      turnoPieza.textContent = PIEZA[side];
      let texto = `Mueven las ${COLOR[side]}`;
      if (mode === 'cpu') texto = side === human ? 'Tu turno' : 'La CPU piensa';
      turno.classList.toggle('piensa', mode === 'cpu' && side !== human && thinking);
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

    // El final. `status` como lo da `Position.status()`; `winner` el color que gana (o null).
    // Devuelve una promesa con 'rematch' o 'menu'.
    gameOver({ status, winner, mode, human }) {
      let titulo = 'Tablas';
      let texto = TABLAS[status] ?? '';
      if (status === 'checkmate') {
        titulo = '¡Jaque mate!';
        if (mode === 'cpu') texto = winner === human ? '¡Has ganado a la CPU!' : 'Gana la CPU. ¿La revancha?';
        else texto = `Ganan las ${COLOR[winner]}`;
      }
      finalTitulo.textContent = titulo;
      finalTexto.textContent = texto;
      final.dataset.tipo = status === 'checkmate' ? (mode === 'cpu' && winner !== human ? 'pierde' : 'gana') : 'tablas';
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
      coronaBotones.textContent = '';
      corona.dataset.lado = color;
      corona.hidden = false;
      return new Promise((resolve) => {
        for (const [kind, simbolo, nombre] of CORONAS) {
          const boton = el('button', 'corona-boton');
          boton.type = 'button';
          boton.append(el('span', 'corona-simbolo', simbolo), el('span', 'corona-nombre', nombre));
          boton.addEventListener('click', () => {
            corona.hidden = true;
            resolve(kind);
          });
          coronaBotones.append(boton);
        }
        setTimeout(() => coronaBotones.firstChild?.focus({ preventScroll: true }), 50);
      });
    },

    closeAll() {
      final.hidden = true;
      corona.hidden = true;
      turno.hidden = true;
      cartel.classList.remove('sale');
    },
  };
}
