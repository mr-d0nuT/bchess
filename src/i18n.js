// LOS IDIOMAS. Todo lo que el juego le dice al jugador pasa por `t(clave)`, que lo devuelve en el
// idioma elegido (o, si falta, en español). El HTML fijo lleva `data-i18n="clave"` (su texto) y
// `data-i18n-attr="title:clave;aria-label:clave"` (sus atributos), y se retraduce solo al cambiar.
// El árabe se lee de derecha a izquierda: la página entera cambia de sentido, salvo lo que tiene que
// seguir yendo de izquierda a derecha (el reloj, la barra del nivel).

const STORE = 'bchess.idioma';

export const LANGUAGES = [
  { id: 'es', name: 'Español' },
  { id: 'ca', name: 'Català' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'it', name: 'Italiano' },
  { id: 'zh', name: '中文' },
  { id: 'ar', name: 'العربية', rtl: true },
];

const NB = ' '; // el espacio que el francés pone antes de «!» y «?», sin que se parta la línea

const TEXTS = {
  es: {
    'boton.pantalla': 'Pantalla completa', 'boton.pantalla.salir': 'Salir de la pantalla completa',
    'carga.preparando': 'Preparando el tablero', 'carga.cargando': 'Cargando', 'carga.antorchas': 'Encendiendo las antorchas',
    'carga.peones': 'Formando a los peones', 'carga.caballos': 'Ensillando a los caballos', 'carga.alfiles': 'Bendiciendo a los alfiles',
    'carga.reinas': 'Peinando a las reinas', 'carga.coronas': 'Puliendo las coronas', 'carga.gigantes': 'Despertando a los gigantes',
    'carga.listo': '¡A jugar!', 'carga.sonido': 'Toca la pantalla para oír la música',
    'menu.modo': 'Modo de juego', 'menu.pvp': '1 contra 1', 'menu.pvp.sub': 'Dos jugadores, un tablero', 'menu.cpu': '1 contra CPU',
    'menu.cpu.white': 'Tú llevas las blancas', 'menu.cpu.black': 'Tú llevas las negras', 'menu.cpu.random': 'Colores al azar',
    'menu.piezas': 'Tus piezas', 'color.white': 'Blancas', 'color.black': 'Negras', 'color.random': 'Al azar',
    'menu.nivel': 'Nivel de la CPU', 'nivel.1': 'Principiante', 'nivel.2': 'Novato', 'nivel.3': 'Aficionado', 'nivel.4': 'Jugador de club',
    'nivel.5': 'Experto', 'nivel.6': 'Maestro', 'nivel.7': 'Gran maestro',
    'menu.duracion': 'Duración', 'tiempo.libre': 'Sin límite', 'tiempo.bala': 'Bala', 'tiempo.blitz': 'Blitz', 'tiempo.rapida': 'Rápida',
    'tiempo.diaria': 'Diaria', 'tiempo.sinreloj': 'Sin reloj', 'tiempo.min': '{n} min', 'tiempo.dia': '1 día', 'tiempo.dias': '{n} días',
    'menu.jugar': 'JUGAR', 'menu.idioma': 'Idioma',
    'menu.continuar': 'Continuar partida', 'menu.jugada': 'jugada {n}',
    'boton.musica': 'Quitar o poner la música', 'boton.musica.poner': 'Poner la música', 'boton.musica.quitar': 'Quitar la música',
    'boton.ajustes': 'Configuración', 'boton.girar': 'Dar la vuelta al tablero (180°)', 'boton.acercar': 'Acercarse a la pieza elegida',
    'boton.alejar': 'Volver al tablero entero', 'boton.deshacer': 'Deshacer la última jugada',
    'turno.white': 'Mueven las blancas', 'turno.black': 'Mueven las negras', 'turno.tuyo': 'Tu turno', 'turno.cpu': 'La CPU piensa',
    'turno.pulsa': 'Pulsa el reloj',
    'cartel.jaque': '¡JAQUE!', 'cartel.mate': '¡JAQUE MATE!', 'cartel.tablas': 'TABLAS', 'cartel.tiempo': '¡SIN TIEMPO!',
    'final.tablas': 'Tablas', 'final.mate': '¡Jaque mate!', 'final.tiempo': '¡Sin tiempo!',
    'final.gana.white': 'Ganan las blancas', 'final.gana.black': 'Ganan las negras',
    'final.ganaste': '¡Has ganado a la CPU!', 'final.perdiste': 'Gana la CPU. ¿La revancha?',
    'final.sintiempo.white': 'A las blancas se les ha acabado el tiempo', 'final.sintiempo.black': 'A las negras se les ha acabado el tiempo',
    'tablas.stalemate': 'Rey ahogado', 'tablas.fifty': 'Cincuenta jugadas sin comer ni mover un peón',
    'tablas.repetition': 'La misma posición, tres veces', 'tablas.material': 'No queda material para dar mate',
    'tablas.time': 'Se acabó el tiempo, pero no queda material para dar mate',
    'final.revancha': 'Revancha', 'final.menu': 'Menú',
    'corona.titulo': '¡Corona!', 'corona.aria': 'Coronar el peón',
    'pieza.queen': 'Dama', 'pieza.rook': 'Torre', 'pieza.bishop': 'Alfil', 'pieza.knight': 'Caballo',
    'ajustes.titulo': 'Configuración', 'ajustes.partida': 'Partida', 'ajustes.menu': 'Volver al menú', 'ajustes.cerrar': 'Cerrar',
    'ajustes.combates': 'Combates', 'ajustes.combates.siempre': 'Siempre', 'ajustes.combates.primera': 'La primera vez', 'ajustes.combates.nunca': 'Nunca',
    'ajustes.musica': 'Música', 'ajustes.musica.si': 'Activada', 'ajustes.musica.no': 'Silenciada',
    'ajustes.efectos': 'Efectos de sonido', 'ajustes.efectos.si': 'Activados', 'ajustes.efectos.no': 'Silenciados',
    'combate.acelerar': 'Toca para acelerar', 'combate.saltar': 'Toca otra vez para saltar', 'combate.saltando': 'Saltando…',
    'ajustes.pvp': '1 contra 1', 'ajustes.cpu': '1 contra CPU · nivel {n} ({nombre})',
    'reloj.white': 'Pulsar el reloj de las blancas', 'reloj.black': 'Pulsar el reloj de las negras',
    'error.webgl': 'Tu navegador no puede mostrar gráficos 3D (WebGL no está disponible). Prueba con Chrome, Safari o Firefox actualizados.',
    'error.piezas': 'No se pudieron cargar las piezas', 'error.pawn': 'No se pudieron cargar los peones', 'error.rook': 'No se pudieron cargar las torres',
    'error.knight': 'No se pudieron cargar los caballeros', 'error.bishop': 'No se pudieron cargar los alfiles', 'error.queen': 'No se pudieron cargar las reinas',
    'error.king': 'No se pudieron cargar los reyes', 'reintentar': 'Reintentar',
    'burbuja.basta': '¡BASTA!', 'burbuja.rasguno': '¡Solo es un rasguño!', 'burbuja.toma': '¡TOMA!',
    'creditos': 'Homenaje a Battle Chess (Interplay, 1988)', 'escena': 'Tablero de ajedrez en 3D',
  },
  ca: {
    'boton.pantalla': 'Pantalla completa', 'boton.pantalla.salir': 'Sortir de la pantalla completa',
    'carga.preparando': 'Preparant el tauler', 'carga.cargando': 'Carregant', 'carga.antorchas': 'Encenent les torxes',
    'carga.peones': 'Formant els peons', 'carga.caballos': 'Ensellant els cavalls', 'carga.alfiles': 'Beneint els alfils',
    'carga.reinas': 'Pentinant les reines', 'carga.coronas': 'Polint les corones', 'carga.gigantes': 'Despertant els gegants',
    'carga.listo': 'A jugar!', 'carga.sonido': 'Toca la pantalla per sentir la música',
    'menu.modo': 'Mode de joc', 'menu.pvp': '1 contra 1', 'menu.pvp.sub': 'Dos jugadors, un tauler', 'menu.cpu': '1 contra CPU',
    'menu.cpu.white': 'Portes les blanques', 'menu.cpu.black': 'Portes les negres', 'menu.cpu.random': "Colors a l'atzar",
    'menu.piezas': 'Les teves peces', 'color.white': 'Blanques', 'color.black': 'Negres', 'color.random': "A l'atzar",
    'menu.nivel': 'Nivell de la CPU', 'nivel.1': 'Principiant', 'nivel.2': 'Novell', 'nivel.3': 'Aficionat', 'nivel.4': 'Jugador de club',
    'nivel.5': 'Expert', 'nivel.6': 'Mestre', 'nivel.7': 'Gran mestre',
    'menu.duracion': 'Durada', 'tiempo.libre': 'Sense límit', 'tiempo.bala': 'Bala', 'tiempo.blitz': 'Blitz', 'tiempo.rapida': 'Ràpida',
    'tiempo.diaria': 'Diària', 'tiempo.sinreloj': 'Sense rellotge', 'tiempo.min': '{n} min', 'tiempo.dia': '1 dia', 'tiempo.dias': '{n} dies',
    'menu.jugar': 'JUGAR', 'menu.idioma': 'Idioma',
    'menu.continuar': 'Continuar la partida', 'menu.jugada': 'jugada {n}',
    'boton.musica': 'Treure o posar la música', 'boton.musica.poner': 'Posar la música', 'boton.musica.quitar': 'Treure la música',
    'boton.ajustes': 'Configuració', 'boton.girar': 'Girar el tauler (180°)', 'boton.acercar': 'Apropar-se a la peça triada',
    'boton.alejar': 'Tornar al tauler sencer', 'boton.deshacer': "Desfer l'última jugada",
    'turno.white': 'Mouen les blanques', 'turno.black': 'Mouen les negres', 'turno.tuyo': 'El teu torn', 'turno.cpu': 'La CPU pensa',
    'turno.pulsa': 'Prem el rellotge',
    'cartel.jaque': 'ESCAC!', 'cartel.mate': 'ESCAC I MAT!', 'cartel.tablas': 'TAULES', 'cartel.tiempo': 'SENSE TEMPS!',
    'final.tablas': 'Taules', 'final.mate': 'Escac i mat!', 'final.tiempo': 'Sense temps!',
    'final.gana.white': 'Guanyen les blanques', 'final.gana.black': 'Guanyen les negres',
    'final.ganaste': 'Has guanyat la CPU!', 'final.perdiste': 'Guanya la CPU. La revenja?',
    'final.sintiempo.white': "Les blanques s'han quedat sense temps", 'final.sintiempo.black': "Les negres s'han quedat sense temps",
    'tablas.stalemate': 'Rei ofegat', 'tablas.fifty': 'Cinquanta jugades sense capturar ni moure cap peó',
    'tablas.repetition': 'La mateixa posició, tres vegades', 'tablas.material': 'No queda material per fer mat',
    'tablas.time': "S'ha acabat el temps, però no queda material per fer mat",
    'final.revancha': 'Revenja', 'final.menu': 'Menú',
    'corona.titulo': 'Corona!', 'corona.aria': 'Coronar el peó',
    'pieza.queen': 'Dama', 'pieza.rook': 'Torre', 'pieza.bishop': 'Alfil', 'pieza.knight': 'Cavall',
    'ajustes.titulo': 'Configuració', 'ajustes.partida': 'Partida', 'ajustes.menu': 'Tornar al menú', 'ajustes.cerrar': 'Tancar',
    'ajustes.combates': 'Combats', 'ajustes.combates.siempre': 'Sempre', 'ajustes.combates.primera': 'La primera vegada', 'ajustes.combates.nunca': 'Mai',
    'ajustes.musica': 'Música', 'ajustes.musica.si': 'Activada', 'ajustes.musica.no': 'Silenciada',
    'ajustes.efectos': 'Efectes de so', 'ajustes.efectos.si': 'Activats', 'ajustes.efectos.no': 'Silenciats',
    'combate.acelerar': 'Toca per accelerar', 'combate.saltar': 'Toca un altre cop per saltar', 'combate.saltando': 'Saltant…',
    'ajustes.pvp': '1 contra 1', 'ajustes.cpu': '1 contra CPU · nivell {n} ({nombre})',
    'reloj.white': 'Prémer el rellotge de les blanques', 'reloj.black': 'Prémer el rellotge de les negres',
    'error.webgl': 'El teu navegador no pot mostrar gràfics 3D (WebGL no està disponible). Prova amb Chrome, Safari o Firefox actualitzats.',
    'error.piezas': "No s'han pogut carregar les peces", 'error.pawn': "No s'han pogut carregar els peons", 'error.rook': "No s'han pogut carregar les torres",
    'error.knight': "No s'han pogut carregar els cavallers", 'error.bishop': "No s'han pogut carregar els alfils", 'error.queen': "No s'han pogut carregar les reines",
    'error.king': "No s'han pogut carregar els reis", 'reintentar': 'Tornar-ho a provar',
    'burbuja.basta': 'PROU!', 'burbuja.rasguno': 'Només és una esgarrinxada!', 'burbuja.toma': 'TOMA!',
    'creditos': 'Homenatge a Battle Chess (Interplay, 1988)', 'escena': "Tauler d'escacs en 3D",
  },
  en: {
    'boton.pantalla': 'Full screen', 'boton.pantalla.salir': 'Exit full screen',
    'carga.preparando': 'Setting up the board', 'carga.cargando': 'Loading', 'carga.antorchas': 'Lighting the torches',
    'carga.peones': 'Lining up the pawns', 'carga.caballos': 'Saddling the horses', 'carga.alfiles': 'Blessing the bishops',
    'carga.reinas': "Brushing the queens' hair", 'carga.coronas': 'Polishing the crowns', 'carga.gigantes': 'Waking the giants',
    'carga.listo': "Let's play!", 'carga.sonido': 'Tap the screen to hear the music',
    'menu.modo': 'Game mode', 'menu.pvp': '1 vs 1', 'menu.pvp.sub': 'Two players, one board', 'menu.cpu': '1 vs CPU',
    'menu.cpu.white': 'You play White', 'menu.cpu.black': 'You play Black', 'menu.cpu.random': 'Random colours',
    'menu.piezas': 'Your pieces', 'color.white': 'White', 'color.black': 'Black', 'color.random': 'Random',
    'menu.nivel': 'CPU level', 'nivel.1': 'Beginner', 'nivel.2': 'Novice', 'nivel.3': 'Amateur', 'nivel.4': 'Club player',
    'nivel.5': 'Expert', 'nivel.6': 'Master', 'nivel.7': 'Grandmaster',
    'menu.duracion': 'Time control', 'tiempo.libre': 'No limit', 'tiempo.bala': 'Bullet', 'tiempo.blitz': 'Blitz', 'tiempo.rapida': 'Rapid',
    'tiempo.diaria': 'Daily', 'tiempo.sinreloj': 'No clock', 'tiempo.min': '{n} min', 'tiempo.dia': '1 day', 'tiempo.dias': '{n} days',
    'menu.jugar': 'PLAY', 'menu.idioma': 'Language',
    'menu.continuar': 'Continue game', 'menu.jugada': 'move {n}',
    'boton.musica': 'Turn the music on or off', 'boton.musica.poner': 'Turn the music on', 'boton.musica.quitar': 'Turn the music off',
    'boton.ajustes': 'Settings', 'boton.girar': 'Flip the board (180°)', 'boton.acercar': 'Zoom in on the selected piece',
    'boton.alejar': 'Back to the whole board', 'boton.deshacer': 'Undo the last move',
    'turno.white': 'White to move', 'turno.black': 'Black to move', 'turno.tuyo': 'Your move', 'turno.cpu': 'The CPU is thinking',
    'turno.pulsa': 'Press the clock',
    'cartel.jaque': 'CHECK!', 'cartel.mate': 'CHECKMATE!', 'cartel.tablas': 'DRAW', 'cartel.tiempo': "TIME'S UP!",
    'final.tablas': 'Draw', 'final.mate': 'Checkmate!', 'final.tiempo': "Time's up!",
    'final.gana.white': 'White wins', 'final.gana.black': 'Black wins',
    'final.ganaste': 'You beat the CPU!', 'final.perdiste': 'The CPU wins. Rematch?',
    'final.sintiempo.white': 'White ran out of time', 'final.sintiempo.black': 'Black ran out of time',
    'tablas.stalemate': 'Stalemate', 'tablas.fifty': 'Fifty moves without a capture or a pawn move',
    'tablas.repetition': 'The same position three times', 'tablas.material': 'Not enough material to checkmate',
    'tablas.time': "Time ran out, but there isn't enough material to checkmate",
    'final.revancha': 'Rematch', 'final.menu': 'Menu',
    'corona.titulo': 'Promote!', 'corona.aria': 'Promote the pawn',
    'pieza.queen': 'Queen', 'pieza.rook': 'Rook', 'pieza.bishop': 'Bishop', 'pieza.knight': 'Knight',
    'ajustes.titulo': 'Settings', 'ajustes.partida': 'Game', 'ajustes.menu': 'Back to the menu', 'ajustes.cerrar': 'Close',
    'ajustes.combates': 'Battles', 'ajustes.combates.siempre': 'Always', 'ajustes.combates.primera': 'First time only', 'ajustes.combates.nunca': 'Never',
    'ajustes.musica': 'Music', 'ajustes.musica.si': 'On', 'ajustes.musica.no': 'Muted',
    'ajustes.efectos': 'Sound effects', 'ajustes.efectos.si': 'On', 'ajustes.efectos.no': 'Muted',
    'combate.acelerar': 'Tap to speed up', 'combate.saltar': 'Tap again to skip', 'combate.saltando': 'Skipping…',
    'ajustes.pvp': '1 vs 1', 'ajustes.cpu': '1 vs CPU · level {n} ({nombre})',
    'reloj.white': "Press White's clock", 'reloj.black': "Press Black's clock",
    'error.webgl': "Your browser can't show 3D graphics (WebGL isn't available). Try an up-to-date Chrome, Safari or Firefox.",
    'error.piezas': "The pieces couldn't be loaded", 'error.pawn': "The pawns couldn't be loaded", 'error.rook': "The rooks couldn't be loaded",
    'error.knight': "The knights couldn't be loaded", 'error.bishop': "The bishops couldn't be loaded", 'error.queen': "The queens couldn't be loaded",
    'error.king': "The kings couldn't be loaded", 'reintentar': 'Try again',
    'burbuja.basta': 'ENOUGH!', 'burbuja.rasguno': "'Tis but a scratch!", 'burbuja.toma': 'TAKE THAT!',
    'creditos': 'A tribute to Battle Chess (Interplay, 1988)', 'escena': '3D chessboard',
  },
  fr: {
    'boton.pantalla': 'Plein écran', 'boton.pantalla.salir': 'Quitter le plein écran',
    'carga.preparando': "Préparation de l'échiquier", 'carga.cargando': 'Chargement', 'carga.antorchas': 'On allume les torches',
    'carga.peones': 'Les pions se mettent en rang', 'carga.caballos': 'On selle les chevaux', 'carga.alfiles': 'On bénit les fous',
    'carga.reinas': 'On coiffe les reines', 'carga.coronas': 'On polit les couronnes', 'carga.gigantes': 'On réveille les géants',
    'carga.listo': `À vous de jouer${NB}!`, 'carga.sonido': "Touchez l'écran pour entendre la musique",
    'menu.modo': 'Mode de jeu', 'menu.pvp': '1 contre 1', 'menu.pvp.sub': 'Deux joueurs, un échiquier', 'menu.cpu': '1 contre le CPU',
    'menu.cpu.white': 'Vous jouez les blancs', 'menu.cpu.black': 'Vous jouez les noirs', 'menu.cpu.random': 'Couleurs au hasard',
    'menu.piezas': 'Vos pièces', 'color.white': 'Blancs', 'color.black': 'Noirs', 'color.random': 'Au hasard',
    'menu.nivel': 'Niveau du CPU', 'nivel.1': 'Débutant', 'nivel.2': 'Novice', 'nivel.3': 'Amateur', 'nivel.4': 'Joueur de club',
    'nivel.5': 'Expert', 'nivel.6': 'Maître', 'nivel.7': 'Grand maître',
    'menu.duracion': 'Cadence', 'tiempo.libre': 'Sans limite', 'tiempo.bala': 'Bullet', 'tiempo.blitz': 'Blitz', 'tiempo.rapida': 'Rapide',
    'tiempo.diaria': 'Quotidienne', 'tiempo.sinreloj': 'Sans pendule', 'tiempo.min': '{n} min', 'tiempo.dia': '1 jour', 'tiempo.dias': '{n} jours',
    'menu.jugar': 'JOUER', 'menu.idioma': 'Langue',
    'menu.continuar': 'Reprendre la partie', 'menu.jugada': 'coup {n}',
    'boton.musica': 'Couper ou remettre la musique', 'boton.musica.poner': 'Remettre la musique', 'boton.musica.quitar': 'Couper la musique',
    'boton.ajustes': 'Réglages', 'boton.girar': "Retourner l'échiquier (180°)", 'boton.acercar': 'Zoomer sur la pièce choisie',
    'boton.alejar': "Revenir à tout l'échiquier", 'boton.deshacer': 'Annuler le dernier coup',
    'turno.white': 'Trait aux blancs', 'turno.black': 'Trait aux noirs', 'turno.tuyo': 'À vous', 'turno.cpu': 'Le CPU réfléchit',
    'turno.pulsa': 'Appuyez sur la pendule',
    'cartel.jaque': `ÉCHEC${NB}!`, 'cartel.mate': `ÉCHEC ET MAT${NB}!`, 'cartel.tablas': 'NULLE', 'cartel.tiempo': `TEMPS ÉCOULÉ${NB}!`,
    'final.tablas': 'Partie nulle', 'final.mate': `Échec et mat${NB}!`, 'final.tiempo': `Temps écoulé${NB}!`,
    'final.gana.white': 'Les blancs gagnent', 'final.gana.black': 'Les noirs gagnent',
    'final.ganaste': `Vous avez battu le CPU${NB}!`, 'final.perdiste': `Le CPU gagne. Une revanche${NB}?`,
    'final.sintiempo.white': "Les blancs n'ont plus de temps", 'final.sintiempo.black': "Les noirs n'ont plus de temps",
    'tablas.stalemate': 'Pat', 'tablas.fifty': 'Cinquante coups sans prise ni coup de pion',
    'tablas.repetition': 'La même position trois fois', 'tablas.material': 'Plus assez de matériel pour mater',
    'tablas.time': 'Temps écoulé, mais plus assez de matériel pour mater',
    'final.revancha': 'Revanche', 'final.menu': 'Menu',
    'corona.titulo': `Promotion${NB}!`, 'corona.aria': 'Promouvoir le pion',
    'pieza.queen': 'Dame', 'pieza.rook': 'Tour', 'pieza.bishop': 'Fou', 'pieza.knight': 'Cavalier',
    'ajustes.titulo': 'Réglages', 'ajustes.partida': 'Partie', 'ajustes.menu': 'Retour au menu', 'ajustes.cerrar': 'Fermer',
    'ajustes.combates': 'Combats', 'ajustes.combates.siempre': 'Toujours', 'ajustes.combates.primera': 'La première fois', 'ajustes.combates.nunca': 'Jamais',
    'ajustes.musica': 'Musique', 'ajustes.musica.si': 'Activée', 'ajustes.musica.no': 'Coupée',
    'ajustes.efectos': 'Effets sonores', 'ajustes.efectos.si': 'Activés', 'ajustes.efectos.no': 'Coupés',
    'combate.acelerar': 'Touchez pour accélérer', 'combate.saltar': 'Touchez encore pour passer', 'combate.saltando': 'On passe…',
    'ajustes.pvp': '1 contre 1', 'ajustes.cpu': '1 contre le CPU · niveau {n} ({nombre})',
    'reloj.white': 'Appuyer sur la pendule des blancs', 'reloj.black': 'Appuyer sur la pendule des noirs',
    'error.webgl': "Votre navigateur ne peut pas afficher de 3D (WebGL n'est pas disponible). Essayez un Chrome, Safari ou Firefox à jour.",
    'error.piezas': "Impossible de charger les pièces", 'error.pawn': 'Impossible de charger les pions', 'error.rook': 'Impossible de charger les tours',
    'error.knight': 'Impossible de charger les cavaliers', 'error.bishop': 'Impossible de charger les fous', 'error.queen': 'Impossible de charger les reines',
    'error.king': 'Impossible de charger les rois', 'reintentar': 'Réessayer',
    'burbuja.basta': `ASSEZ${NB}!`, 'burbuja.rasguno': `Ce n'est qu'une égratignure${NB}!`, 'burbuja.toma': `ET VLAN${NB}!`,
    'creditos': 'Hommage à Battle Chess (Interplay, 1988)', 'escena': 'Échiquier en 3D',
  },
  it: {
    'boton.pantalla': 'Schermo intero', 'boton.pantalla.salir': 'Esci dallo schermo intero',
    'carga.preparando': 'Preparazione della scacchiera', 'carga.cargando': 'Caricamento', 'carga.antorchas': 'Accendendo le torce',
    'carga.peones': 'Schierando i pedoni', 'carga.caballos': 'Sellando i cavalli', 'carga.alfiles': 'Benedicendo gli alfieri',
    'carga.reinas': 'Pettinando le regine', 'carga.coronas': 'Lucidando le corone', 'carga.gigantes': 'Svegliando i giganti',
    'carga.listo': 'Si gioca!', 'carga.sonido': 'Tocca lo schermo per sentire la musica',
    'menu.modo': 'Modalità di gioco', 'menu.pvp': '1 contro 1', 'menu.pvp.sub': 'Due giocatori, una scacchiera', 'menu.cpu': '1 contro CPU',
    'menu.cpu.white': 'Giochi con il bianco', 'menu.cpu.black': 'Giochi con il nero', 'menu.cpu.random': 'Colori a caso',
    'menu.piezas': 'I tuoi pezzi', 'color.white': 'Bianco', 'color.black': 'Nero', 'color.random': 'A caso',
    'menu.nivel': 'Livello della CPU', 'nivel.1': 'Principiante', 'nivel.2': 'Novizio', 'nivel.3': 'Dilettante', 'nivel.4': 'Giocatore di circolo',
    'nivel.5': 'Esperto', 'nivel.6': 'Maestro', 'nivel.7': 'Grande maestro',
    'menu.duracion': 'Cadenza', 'tiempo.libre': 'Senza limiti', 'tiempo.bala': 'Bullet', 'tiempo.blitz': 'Blitz', 'tiempo.rapida': 'Rapida',
    'tiempo.diaria': 'Giornaliera', 'tiempo.sinreloj': 'Senza orologio', 'tiempo.min': '{n} min', 'tiempo.dia': '1 giorno', 'tiempo.dias': '{n} giorni',
    'menu.jugar': 'GIOCA', 'menu.idioma': 'Lingua',
    'menu.continuar': 'Continua la partita', 'menu.jugada': 'mossa {n}',
    'boton.musica': 'Attiva o disattiva la musica', 'boton.musica.poner': 'Attiva la musica', 'boton.musica.quitar': 'Disattiva la musica',
    'boton.ajustes': 'Impostazioni', 'boton.girar': 'Gira la scacchiera (180°)', 'boton.acercar': 'Avvicinati al pezzo scelto',
    'boton.alejar': 'Torna alla scacchiera intera', 'boton.deshacer': "Annulla l'ultima mossa",
    'turno.white': 'Muove il bianco', 'turno.black': 'Muove il nero', 'turno.tuyo': 'Tocca a te', 'turno.cpu': 'La CPU sta pensando',
    'turno.pulsa': "Premi l'orologio",
    'cartel.jaque': 'SCACCO!', 'cartel.mate': 'SCACCO MATTO!', 'cartel.tablas': 'PATTA', 'cartel.tiempo': 'TEMPO SCADUTO!',
    'final.tablas': 'Patta', 'final.mate': 'Scacco matto!', 'final.tiempo': 'Tempo scaduto!',
    'final.gana.white': 'Vince il bianco', 'final.gana.black': 'Vince il nero',
    'final.ganaste': 'Hai battuto la CPU!', 'final.perdiste': 'Vince la CPU. La rivincita?',
    'final.sintiempo.white': 'Il bianco ha finito il tempo', 'final.sintiempo.black': 'Il nero ha finito il tempo',
    'tablas.stalemate': 'Stallo', 'tablas.fifty': 'Cinquanta mosse senza catture né mosse di pedone',
    'tablas.repetition': 'La stessa posizione tre volte', 'tablas.material': 'Non resta materiale per dare matto',
    'tablas.time': 'Tempo scaduto, ma non resta materiale per dare matto',
    'final.revancha': 'Rivincita', 'final.menu': 'Menu',
    'corona.titulo': 'Promozione!', 'corona.aria': 'Promuovi il pedone',
    'pieza.queen': 'Donna', 'pieza.rook': 'Torre', 'pieza.bishop': 'Alfiere', 'pieza.knight': 'Cavallo',
    'ajustes.titulo': 'Impostazioni', 'ajustes.partida': 'Partita', 'ajustes.menu': 'Torna al menu', 'ajustes.cerrar': 'Chiudi',
    'ajustes.combates': 'Combattimenti', 'ajustes.combates.siempre': 'Sempre', 'ajustes.combates.primera': 'Solo la prima volta', 'ajustes.combates.nunca': 'Mai',
    'ajustes.musica': 'Musica', 'ajustes.musica.si': 'Attiva', 'ajustes.musica.no': 'Silenziata',
    'ajustes.efectos': 'Effetti sonori', 'ajustes.efectos.si': 'Attivi', 'ajustes.efectos.no': 'Silenziati',
    'combate.acelerar': 'Tocca per accelerare', 'combate.saltar': 'Tocca di nuovo per saltare', 'combate.saltando': 'Salto…',
    'ajustes.pvp': '1 contro 1', 'ajustes.cpu': '1 contro CPU · livello {n} ({nombre})',
    'reloj.white': "Premi l'orologio del bianco", 'reloj.black': "Premi l'orologio del nero",
    'error.webgl': 'Il tuo browser non può mostrare grafica 3D (WebGL non è disponibile). Prova con Chrome, Safari o Firefox aggiornati.',
    'error.piezas': 'Impossibile caricare i pezzi', 'error.pawn': 'Impossibile caricare i pedoni', 'error.rook': 'Impossibile caricare le torri',
    'error.knight': 'Impossibile caricare i cavalieri', 'error.bishop': 'Impossibile caricare gli alfieri', 'error.queen': 'Impossibile caricare le regine',
    'error.king': 'Impossibile caricare i re', 'reintentar': 'Riprova',
    'burbuja.basta': 'BASTA!', 'burbuja.rasguno': 'È solo un graffio!', 'burbuja.toma': 'TIÈ!',
    'creditos': 'Omaggio a Battle Chess (Interplay, 1988)', 'escena': 'Scacchiera 3D',
  },
  zh: {
    'boton.pantalla': '全屏', 'boton.pantalla.salir': '退出全屏',
    'carga.preparando': '正在摆放棋盘', 'carga.cargando': '加载中', 'carga.antorchas': '点燃火把',
    'carga.peones': '兵卒列队', 'carga.caballos': '为战马备鞍', 'carga.alfiles': '为主教祈福',
    'carga.reinas': '为王后梳妆', 'carga.coronas': '擦亮王冠', 'carga.gigantes': '唤醒巨人',
    'carga.listo': '开战！', 'carga.sonido': '轻触屏幕以播放音乐',
    'menu.modo': '游戏模式', 'menu.pvp': '双人对战', 'menu.pvp.sub': '两位玩家，一块棋盘', 'menu.cpu': '人机对战',
    'menu.cpu.white': '你执白棋', 'menu.cpu.black': '你执黑棋', 'menu.cpu.random': '随机分色',
    'menu.piezas': '你的棋子', 'color.white': '白棋', 'color.black': '黑棋', 'color.random': '随机',
    'menu.nivel': '电脑难度', 'nivel.1': '入门', 'nivel.2': '新手', 'nivel.3': '业余', 'nivel.4': '俱乐部棋手',
    'nivel.5': '高手', 'nivel.6': '大师', 'nivel.7': '特级大师',
    'menu.duracion': '对局时长', 'tiempo.libre': '不限时', 'tiempo.bala': '子弹棋', 'tiempo.blitz': '超快棋', 'tiempo.rapida': '快棋',
    'tiempo.diaria': '每日棋', 'tiempo.sinreloj': '不计时', 'tiempo.min': '{n} 分钟', 'tiempo.dia': '1 天', 'tiempo.dias': '{n} 天',
    'menu.jugar': '开始', 'menu.idioma': '语言',
    'menu.continuar': '继续对局', 'menu.jugada': '第 {n} 步',
    'boton.musica': '开关音乐', 'boton.musica.poner': '打开音乐', 'boton.musica.quitar': '关闭音乐',
    'boton.ajustes': '设置', 'boton.girar': '翻转棋盘（180°）', 'boton.acercar': '放大所选棋子',
    'boton.alejar': '返回整个棋盘', 'boton.deshacer': '悔棋（撤销上一步）',
    'turno.white': '白方走棋', 'turno.black': '黑方走棋', 'turno.tuyo': '轮到你了', 'turno.cpu': '电脑思考中',
    'turno.pulsa': '请按棋钟',
    'cartel.jaque': '将军！', 'cartel.mate': '将死！', 'cartel.tablas': '和棋', 'cartel.tiempo': '超时！',
    'final.tablas': '和棋', 'final.mate': '将死！', 'final.tiempo': '超时！',
    'final.gana.white': '白方获胜', 'final.gana.black': '黑方获胜',
    'final.ganaste': '你战胜了电脑！', 'final.perdiste': '电脑获胜。再来一局？',
    'final.sintiempo.white': '白方超时', 'final.sintiempo.black': '黑方超时',
    'tablas.stalemate': '逼和（无子可动）', 'tablas.fifty': '五十回合内无吃子也无兵走动',
    'tablas.repetition': '同一局面出现三次', 'tablas.material': '子力不足，无法将死',
    'tablas.time': '已超时，但对方子力不足以将死',
    'final.revancha': '再来一局', 'final.menu': '菜单',
    'corona.titulo': '升变！', 'corona.aria': '兵的升变',
    'pieza.queen': '后', 'pieza.rook': '车', 'pieza.bishop': '象', 'pieza.knight': '马',
    'ajustes.titulo': '设置', 'ajustes.partida': '对局', 'ajustes.menu': '返回菜单', 'ajustes.cerrar': '关闭',
    'ajustes.combates': '战斗', 'ajustes.combates.siempre': '总是', 'ajustes.combates.primera': '仅第一次', 'ajustes.combates.nunca': '从不',
    'ajustes.musica': '音乐', 'ajustes.musica.si': '开启', 'ajustes.musica.no': '已静音',
    'ajustes.efectos': '音效', 'ajustes.efectos.si': '开启', 'ajustes.efectos.no': '已静音',
    'combate.acelerar': '点击加速', 'combate.saltar': '再点一次跳过', 'combate.saltando': '跳过中…',
    'ajustes.pvp': '双人对战', 'ajustes.cpu': '人机对战 · 难度 {n}（{nombre}）',
    'reloj.white': '按下白方棋钟', 'reloj.black': '按下黑方棋钟',
    'error.webgl': '你的浏览器无法显示 3D 图形（WebGL 不可用）。请使用最新版的 Chrome、Safari 或 Firefox。',
    'error.piezas': '无法加载棋子', 'error.pawn': '无法加载兵', 'error.rook': '无法加载车',
    'error.knight': '无法加载马', 'error.bishop': '无法加载象', 'error.queen': '无法加载后',
    'error.king': '无法加载王', 'reintentar': '重试',
    'burbuja.basta': '够了！', 'burbuja.rasguno': '只是擦破点皮！', 'burbuja.toma': '吃我一招！',
    'creditos': '致敬 Battle Chess（Interplay，1988）', 'escena': '3D 国际象棋棋盘',
  },
  ar: {
    'boton.pantalla': 'ملء الشاشة', 'boton.pantalla.salir': 'الخروج من ملء الشاشة',
    'carga.preparando': 'جارٍ تجهيز الرقعة', 'carga.cargando': 'جارٍ التحميل', 'carga.antorchas': 'إشعال المشاعل',
    'carga.peones': 'اصطفاف الجنود', 'carga.caballos': 'إسراج الخيول', 'carga.alfiles': 'مباركة الأساقفة',
    'carga.reinas': 'تصفيف شعر الملكات', 'carga.coronas': 'تلميع التيجان', 'carga.gigantes': 'إيقاظ العمالقة',
    'carga.listo': 'هيا نلعب!', 'carga.sonido': 'المس الشاشة لسماع الموسيقى',
    'menu.modo': 'نمط اللعب', 'menu.pvp': '1 ضد 1', 'menu.pvp.sub': 'لاعبان على رقعة واحدة', 'menu.cpu': '1 ضد الحاسوب',
    'menu.cpu.white': 'تلعب بالأبيض', 'menu.cpu.black': 'تلعب بالأسود', 'menu.cpu.random': 'ألوان عشوائية',
    'menu.piezas': 'قطعك', 'color.white': 'الأبيض', 'color.black': 'الأسود', 'color.random': 'عشوائي',
    'menu.nivel': 'مستوى الحاسوب', 'nivel.1': 'مبتدئ', 'nivel.2': 'مستجد', 'nivel.3': 'هاوٍ', 'nivel.4': 'لاعب نادٍ',
    'nivel.5': 'خبير', 'nivel.6': 'أستاذ', 'nivel.7': 'أستاذ كبير',
    'menu.duracion': 'مدة المباراة', 'tiempo.libre': 'بلا حدّ', 'tiempo.bala': 'رصاصي', 'tiempo.blitz': 'خاطف', 'tiempo.rapida': 'سريع',
    'tiempo.diaria': 'يومي', 'tiempo.sinreloj': 'بلا ساعة', 'tiempo.min': '{n} د', 'tiempo.dia': 'يوم واحد', 'tiempo.dias': '{n} أيام',
    'menu.jugar': 'العب', 'menu.idioma': 'اللغة',
    'menu.continuar': 'متابعة المباراة', 'menu.jugada': 'النقلة {n}',
    'boton.musica': 'تشغيل الموسيقى أو إيقافها', 'boton.musica.poner': 'تشغيل الموسيقى', 'boton.musica.quitar': 'إيقاف الموسيقى',
    'boton.ajustes': 'الإعدادات', 'boton.girar': 'قلب الرقعة (180°)', 'boton.acercar': 'تقريب القطعة المختارة',
    'boton.alejar': 'العودة إلى الرقعة كاملة', 'boton.deshacer': 'التراجع عن آخر نقلة',
    'turno.white': 'دور الأبيض', 'turno.black': 'دور الأسود', 'turno.tuyo': 'دورك', 'turno.cpu': 'الحاسوب يفكّر',
    'turno.pulsa': 'اضغط على الساعة',
    'cartel.jaque': 'كش ملك!', 'cartel.mate': 'كش مات!', 'cartel.tablas': 'تعادل', 'cartel.tiempo': 'انتهى الوقت!',
    'final.tablas': 'تعادل', 'final.mate': 'كش مات!', 'final.tiempo': 'انتهى الوقت!',
    'final.gana.white': 'فاز الأبيض', 'final.gana.black': 'فاز الأسود',
    'final.ganaste': 'لقد هزمت الحاسوب!', 'final.perdiste': 'فاز الحاسوب. مباراة ثأر؟',
    'final.sintiempo.white': 'نفد وقت الأبيض', 'final.sintiempo.black': 'نفد وقت الأسود',
    'tablas.stalemate': 'الملك محاصَر (بات)', 'tablas.fifty': 'خمسون نقلة دون أسر أو تحريك بيدق',
    'tablas.repetition': 'تكرّر الوضع نفسه ثلاث مرات', 'tablas.material': 'لا تكفي القطع لإعطاء كش مات',
    'tablas.time': 'انتهى الوقت، لكن القطع لا تكفي لإعطاء كش مات',
    'final.revancha': 'مباراة ثأر', 'final.menu': 'القائمة',
    'corona.titulo': 'ترقية!', 'corona.aria': 'ترقية البيدق',
    'pieza.queen': 'الوزير', 'pieza.rook': 'الرخ', 'pieza.bishop': 'الفيل', 'pieza.knight': 'الحصان',
    'ajustes.titulo': 'الإعدادات', 'ajustes.partida': 'المباراة', 'ajustes.menu': 'العودة إلى القائمة', 'ajustes.cerrar': 'إغلاق',
    'ajustes.combates': 'المعارك', 'ajustes.combates.siempre': 'دائمًا', 'ajustes.combates.primera': 'المرة الأولى فقط', 'ajustes.combates.nunca': 'أبدًا',
    'ajustes.musica': 'الموسيقى', 'ajustes.musica.si': 'مفعّلة', 'ajustes.musica.no': 'مكتومة',
    'ajustes.efectos': 'المؤثرات الصوتية', 'ajustes.efectos.si': 'مفعّلة', 'ajustes.efectos.no': 'مكتومة',
    'combate.acelerar': 'انقر للتسريع', 'combate.saltar': 'انقر مرة أخرى للتخطي', 'combate.saltando': 'جارٍ التخطي…',
    'ajustes.pvp': '1 ضد 1', 'ajustes.cpu': '1 ضد الحاسوب · المستوى {n} ({nombre})',
    'reloj.white': 'اضغط ساعة الأبيض', 'reloj.black': 'اضغط ساعة الأسود',
    'error.webgl': 'لا يستطيع متصفحك عرض الرسومات ثلاثية الأبعاد (WebGL غير متاح). جرّب إصدارًا حديثًا من Chrome أو Safari أو Firefox.',
    'error.piezas': 'تعذّر تحميل القطع', 'error.pawn': 'تعذّر تحميل البيادق', 'error.rook': 'تعذّر تحميل الرخاخ',
    'error.knight': 'تعذّر تحميل الأحصنة', 'error.bishop': 'تعذّر تحميل الفيلة', 'error.queen': 'تعذّر تحميل الوزراء',
    'error.king': 'تعذّر تحميل الملوك', 'reintentar': 'إعادة المحاولة',
    'burbuja.basta': 'كفى!', 'burbuja.rasguno': 'مجرد خدش!', 'burbuja.toma': 'خذ هذه!',
    'creditos': 'تحية إلى Battle Chess (Interplay، 1988)', 'escena': 'رقعة شطرنج ثلاثية الأبعاد',
  },
};

function detect() {
  try {
    const guardado = localStorage.getItem(STORE);
    if (guardado && TEXTS[guardado]) return guardado;
  } catch {
    // sin almacenamiento: se deduce del navegador
  }
  const navegador = (navigator.language || 'es').toLowerCase().split('-')[0];
  return TEXTS[navegador] ? navegador : 'es';
}

let lang = detect();
const listeners = new Set();

export function t(key, params = {}) {
  const texto = TEXTS[lang]?.[key] ?? TEXTS.es[key] ?? key;
  return texto.replace(/\{(\w+)\}/g, (_, nombre) => String(params[nombre] ?? ''));
}

export function currentLanguage() {
  return lang;
}

export function isRtl() {
  return Boolean(LANGUAGES.find((l) => l.id === lang)?.rtl);
}

// Traduce lo fijo del HTML: `data-i18n` (texto) y `data-i18n-attr` («title:clave;aria-label:clave»).
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-attr]')) {
    for (const par of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = par.split(':');
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  }
}

function applyDocument() {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
  applyStatic();
}

export function setLanguage(id) {
  if (!TEXTS[id] || id === lang) return;
  lang = id;
  try {
    localStorage.setItem(STORE, id);
  } catch {
    // se usará mientras dure la visita
  }
  applyDocument();
  for (const fn of listeners) fn(lang);
}

// Para quien pinta textos por su cuenta: se le avisa cuando cambia el idioma.
export function onLanguage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Al cargar: el idioma que se usó la última vez (o el del navegador), puesto en toda la página.
export function initLanguage() {
  applyDocument();
}
