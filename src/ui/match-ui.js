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

  // Debajo del turno, lo que pasa en la partida, uno debajo de otro: la conexión y las tablas ofrecidas.
  const avisos = el('div', 'avisos-partida');
  root.append(avisos);

  // Cómo va la conexión (online): quién no tiene red, cuánto lleva callado el rival y, pasado un rato, «Reclamar la
  // victoria» o «Esperar».
  const conexion = el('div', 'conexion');
  conexion.setAttribute('role', 'status');
  conexion.setAttribute('aria-live', 'polite');
  conexion.hidden = true;
  const conexionTexto = el('span', 'conexion-texto');
  const reclamar = el('button', 'conexion-boton principal');
  const esperar = el('button', 'conexion-boton');
  reclamar.type = 'button';
  esperar.type = 'button';
  // Los dos botones, juntos: si no caben al lado del texto, bajan los dos (antes bajaba solo «Esperar»).
  const conexionBotones = el('span', 'conexion-botones');
  conexionBotones.append(reclamar, esperar);
  conexion.append(conexionTexto, conexionBotones);
  avisos.append(conexion);
  let alReclamar = null;
  let alEsperar = null;
  reclamar.addEventListener('click', (event) => {
    event.stopPropagation();
    alReclamar?.();
  });
  esperar.addEventListener('click', (event) => {
    event.stopPropagation();
    alEsperar?.();
  });
  let ultimaConexion = null;
  const minutos = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Unas tablas ofrecidas (punto 12): «Ana ofrece tablas» con «Aceptar» y «Rechazar»; o, sin botones, cómo va la
  // mía («Has ofrecido tablas»).
  const oferta = el('div', 'oferta');
  oferta.setAttribute('role', 'status');
  oferta.setAttribute('aria-live', 'polite');
  oferta.hidden = true;
  const ofertaTexto = el('span', 'oferta-texto');
  const aceptar = el('button', 'conexion-boton principal');
  const rechazar = el('button', 'conexion-boton');
  aceptar.type = 'button';
  rechazar.type = 'button';
  const ofertaBotones = el('span', 'conexion-botones');
  ofertaBotones.append(aceptar, rechazar);
  oferta.append(ofertaTexto, ofertaBotones);
  avisos.append(oferta);
  let alAceptar = null;
  let alRechazar = null;
  aceptar.addEventListener('click', (event) => {
    event.stopPropagation();
    alAceptar?.();
  });
  rechazar.addEventListener('click', (event) => {
    event.stopPropagation();
    alRechazar?.();
  });
  let ultimaOferta = null;

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
  const otro = el('button', 'final-boton'); // online: buscar otro rival (la revancha es con el mismo)
  const menu = el('button', 'final-boton');
  revancha.type = 'button';
  otro.type = 'button';
  menu.type = 'button';
  finalBotones.append(revancha, otro, menu);
  // La puntuación que cambia (el ranking): una línea por jugador, con la cifra que sube o baja contando.
  const finalPuntos = el('div', 'final-puntos');
  // Y el resumen de la partida: jugadas, piezas comidas, duración y combates.
  const finalResumen = el('div', 'final-resumen');
  finalCaja.append(finalTitulo, finalTexto, finalPuntos, finalResumen, finalBotones);
  let cuenta = 0; // la animación de la cifra en marcha
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
  // Las respuestas pendientes del final y de la coronación: se dan también si otra cosa cierra el cartel (`closeAll`,
  // `cancelPromotion`). Antes se cerraban sin contestar y quien esperaba se quedaba esperando para siempre.
  let cierraFinal = null;
  let cierraCorona = null;

  // Lo que dice el cartel del final (al sacarlo, y si cambia con él a la vista).
  function pintaFinal({ status, winner, mode, human, flagged = null, nombres = {} }) {
    let titulo = t('final.tablas');
    let texto = t(`tablas.${status}`);
    let tipo = 'tablas';
    if (status === 'time') {
      titulo = t('final.tiempo');
      texto = winner ? t(`final.sintiempo.${flagged}`) : t('tablas.time');
    }
    if (status === 'checkmate') titulo = t('final.mate');
    if (status === 'anulada') titulo = t('final.anulada'); // online: ya no era la misma partida en los dos lados
    if (status === 'abandon' || status === 'rivalResigned') titulo = t('final.ganas'); // online: el rival se ha ido o se ha rendido
    if (status === 'abandonada') titulo = t('final.pierdes'); // online: el que se fue (y no volvió a tiempo) soy yo
    // Me he rendido (uno contra uno, el que movía: el que no gana).
    if (status === 'resign') titulo = mode === 'pvp' && winner ? t(`final.rinde.${winner === 'white' ? 'black' : 'white'}`) : t('final.rendido');
    if (winner) {
      if (mode === 'cpu' && !human) texto = t(`final.gana.${winner}`); // mirando: CPU contra CPU
      else if (mode === 'cpu') texto = winner === human ? t('final.ganaste') : t('final.perdiste');
      else if (mode === 'online' && status === 'abandon') texto = t('final.abandono');
      else if (mode === 'online' && status === 'abandonada') texto = t('final.abandonaste');
      else if (mode === 'online' && status === 'rivalResigned') texto = t('final.serinde');
      else if (mode === 'online') texto = winner === human ? t('final.ganas') : nombres[winner] ? t('final.ganaNombre', { nombre: nombres[winner] }) : t('final.pierdes');
      else {
        // 1 contra 1: «¡Gana Ana!», o «Ganan las blancas» si no hay nombre.
        const gana = nombres[winner] ? t('final.ganaNombre', { nombre: nombres[winner] }) : t(`final.gana.${winner}`);
        texto = status === 'time' ? `${t(`final.sintiempo.${flagged}`)}. ${gana}` : gana;
      }
      tipo = (mode === 'cpu' || mode === 'online') && human && winner !== human ? 'pierde' : 'gana';
    }
    finalTitulo.textContent = titulo;
    finalTexto.textContent = texto;
    final.dataset.tipo = tipo;
  }

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
      if (mode === 'cpu' && human) texto = side === human ? t('turno.tuyo') : t('turno.cpu'); // mirando (sin `human`), de quién es
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

    // Cómo cambia la puntuación de cada uno, en el cartel del final (como en chess.com): `lineas` =
    // [{ label, from, to, delta, provisional }]. La cifra va de `from` a `to` contando, cuando el cartel ya ha
    // entrado.
    showRating(lineas) {
      cancelAnimationFrame(cuenta);
      finalPuntos.replaceChildren();
      const cifras = [];
      for (const linea of lineas ?? []) {
        const fila = el('div', 'final-punto');
        const cifra = el('span', 'final-punto-cifra', String(linea.from));
        const signo = linea.delta > 0 ? 'sube' : linea.delta < 0 ? 'baja' : 'igual';
        const delta = el('span', `final-punto-delta ${signo}`, `${linea.delta > 0 ? '+' : linea.delta < 0 ? '−' : '±'}${Math.abs(linea.delta)}`);
        fila.append(el('span', 'final-punto-nombre', linea.label), cifra, delta);
        finalPuntos.append(fila);
        cifras.push({ cifra, ...linea });
      }
      if (!cifras.length) return;
      const empieza = performance.now() + 550;
      const paso = (now) => {
        const k = Math.max(0, Math.min(1, (now - empieza) / 1100));
        const suave = 1 - (1 - k) ** 3;
        for (const c of cifras) c.cifra.textContent = `${Math.round(c.from + (c.to - c.from) * suave)}${c.provisional ? '?' : ''}`;
        if (k < 1) cuenta = requestAnimationFrame(paso);
      };
      cuenta = requestAnimationFrame(paso);
    },

    // El resumen de la partida en el cartel del final: { jugadas, capturas, segundos, combates }.
    showSummary({ jugadas = 0, capturas = 0, segundos = 0, combates = 0 } = {}) {
      const h = Math.floor(segundos / 3600);
      const m = Math.floor((segundos % 3600) / 60);
      const sg = String(segundos % 60).padStart(2, '0');
      const duracion = segundos >= 86400 ? `${Math.round(segundos / 86400)} d` : h ? `${h}:${String(m).padStart(2, '0')}:${sg}` : `${m}:${sg}`;
      finalResumen.replaceChildren(...[
        [jugadas, 'resumen.jugadas'],
        [capturas, 'resumen.capturas'],
        [duracion, 'resumen.duracion'],
        [combates, 'resumen.combates'],
      ].map(([valor, clave]) => {
        const celda = el('div', 'final-dato');
        celda.append(el('strong', '', String(valor)), el('span', '', t(clave)));
        return celda;
      }));
    },

    // El final. `status`: el de `Position.status()` o 'time' (se le acabó el tiempo a `flagged`);
    // `winner`, el color que gana (o null si son tablas). Devuelve 'rematch', 'menu' o, si otra cosa lo cierra
    // (`closeAll`: se ha puesto otra partida, se ha aceptado un reto), 'cerrado'.
    // `escena`: detrás está la del jaque mate (el rey de rodillas, el confeti…): el cartel va abajo y deja verla.
    // Online, `rival`: { nombre, esta } (si sigue en la sala): «Revancha» es con él (se resuelve 'revancha'), y «Buscar
    // otro rival», con otro ('rematch', como la revancha de aquí). Si ya no está, su revancha no se puede pedir.
    gameOver({ status, winner, mode, human, flagged = null, nombres = {}, escena = false, rival = null }) {
      cierraFinal?.('cerrado');
      pintaFinal({ status, winner, mode, human, flagged, nombres });
      finalPuntos.replaceChildren();
      finalResumen.replaceChildren();
      const conRival = mode === 'online' && Boolean(rival);
      revancha.textContent = conRival && !rival.esta ? t('final.noesta', { nombre: rival.nombre }) : t('final.revancha');
      revancha.disabled = conRival && !rival.esta;
      otro.hidden = mode !== 'online';
      otro.textContent = t('final.otro');
      menu.textContent = t('final.menu');
      final.classList.toggle('con-escena', escena);
      final.hidden = false;
      final.classList.remove('entra');
      void final.offsetWidth;
      final.classList.add('entra');
      setTimeout(() => (revancha.disabled ? otro : revancha).focus({ preventScroll: true }), 400);
      return new Promise((resolve) => {
        const cerrar = (que) => {
          if (cierraFinal !== cerrar) return;
          cierraFinal = null;
          final.hidden = true;
          revancha.onclick = null;
          otro.onclick = null;
          menu.onclick = null;
          resolve(que);
        };
        cierraFinal = cerrar;
        revancha.onclick = () => cerrar(mode === 'online' ? 'revancha' : 'rematch');
        otro.onclick = () => cerrar('rematch');
        menu.onclick = () => cerrar('menu');
      });
    },

    // El final ha cambiado con el cartel a la vista (online, dos finales que se cruzan: manda el del rival).
    cambiaFinal(datos) {
      if (cierraFinal) pintaFinal(datos);
    },

    // Pregunta a qué se corona. Devuelve 'queen' | 'rook' | 'bishop' | 'knight', o null si se cierra sin elegir.
    promotion(color) {
      cierraCorona?.(null);
      coronaTitulo.textContent = t('corona.titulo');
      corona.setAttribute('aria-label', t('corona.aria'));
      coronaBotones.textContent = '';
      corona.dataset.lado = color;
      corona.hidden = false;
      return new Promise((resolve) => {
        const elige = (kind) => {
          if (cierraCorona !== elige) return;
          cierraCorona = null;
          corona.hidden = true;
          resolve(kind);
        };
        cierraCorona = elige;
        for (const [kind, simbolo] of CORONAS) {
          const boton = el('button', 'corona-boton');
          boton.type = 'button';
          boton.append(el('span', 'corona-simbolo', simbolo), el('span', 'corona-nombre', t(`pieza.${kind}`)));
          boton.addEventListener('click', () => elige(kind));
          coronaBotones.append(boton);
        }
        setTimeout(() => coronaBotones.firstChild?.focus({ preventScroll: true }), 50);
      });
    },

    // La partida se ha acabado mientras se elegía la coronación (sin tiempo, el rival se ha rendido…): fuera la
    // pregunta. Antes seguía ahí, y elegir jugaba en una partida acabada.
    cancelPromotion() {
      cierraCorona?.(null);
    },

    // Cómo va la conexión online (`estado`): 'bien' (no se ve), 'yo' (el que no tiene red soy yo), 'rival' (el rival
    // calla: `nombre`, `segundos`), 'reclamable' (lo mismo, con «Reclamar la victoria» y «Esperar»: `onReclamar`,
    // `onEsperar`) o 'reclamando' (se le ha reclamado el tiempo). Se llama cada segundo: solo cambia lo que cambia.
    conexion(datos = { estado: 'bien' }) {
      ultimaConexion = datos;
      const { estado = 'bien', nombre = '', segundos = 0, onReclamar = null, onEsperar = null } = datos;
      if (conexion.hidden !== (estado === 'bien')) conexion.hidden = estado === 'bien';
      if (estado === 'bien') return;
      conexion.dataset.estado = estado;
      const texto = estado === 'yo' ? t('online.reconectando')
        : estado === 'reclamando' ? t('online.reclamandoTiempo')
          : t('online.rivalFuera', { nombre, tiempo: minutos(segundos) });
      if (conexionTexto.textContent !== texto) conexionTexto.textContent = texto;
      const botones = estado === 'reclamable';
      if (conexionBotones.hidden !== !botones) conexionBotones.hidden = !botones; // sin ellos, ni su hueco
      if (reclamar.textContent !== t('online.reclamar')) reclamar.textContent = t('online.reclamar');
      if (esperar.textContent !== t('online.esperar')) esperar.textContent = t('online.esperar');
      alReclamar = onReclamar;
      alEsperar = onEsperar;
    },

    // Las tablas ofrecidas: null (no se ve) o { texto, onAceptar, onRechazar } (sin ellas, sin botones). Se llama a
    // menudo: solo cambia lo que cambia.
    oferta(datos = null) {
      ultimaOferta = datos;
      if (oferta.hidden !== !datos) oferta.hidden = !datos;
      if (!datos) return;
      const { texto, onAceptar = null, onRechazar = null } = datos;
      if (ofertaTexto.textContent !== texto) ofertaTexto.textContent = texto;
      const botones = Boolean(onAceptar);
      if (ofertaBotones.hidden !== !botones) ofertaBotones.hidden = !botones;
      if (aceptar.textContent !== t('tablas.aceptar')) aceptar.textContent = t('tablas.aceptar');
      if (rechazar.textContent !== t('tablas.rechazar')) rechazar.textContent = t('tablas.rechazar');
      alAceptar = onAceptar;
      alRechazar = onRechazar;
    },

    // Vuelve a escribir lo que se ve (al cambiar de idioma).
    refresh() {
      if (ultimoTurno) api.turn(ultimoTurno);
      if (ultimaConexion) api.conexion(ultimaConexion);
      if (ultimaOferta) api.oferta(ultimaOferta);
    },

    closeAll() {
      cierraFinal?.('cerrado');
      cierraCorona?.(null);
      final.hidden = true;
      corona.hidden = true;
      turno.hidden = true;
      conexion.hidden = true;
      ultimaConexion = null;
      oferta.hidden = true;
      ultimaOferta = null;
      cartel.classList.remove('sale');
    },
  };
  return api;
}
