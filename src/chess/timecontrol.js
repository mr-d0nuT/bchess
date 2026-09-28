// EL RELOJ DE AJEDREZ, las cuentas. Cada bando tiene su tiempo y solo corre el del que mueve; al
// pulsar su lado del reloj, el que acaba de mover para el suyo (y se lleva el incremento, si lo hay)
// y arranca el del otro. En la «diaria» no hay bolsa de tiempo sino plazo: cada jugada ha de hacerse
// en tantos días, y al pulsar se le devuelve el plazo entero al que le toca.
//
// El reloj no mira la hora por su cuenta: se le dice qué hora es (`now`, en milisegundos) en cada
// llamada. Así se puede parar mientras dura una animación —en este ajedrez un combate dura más que
// una partida bala entera— y probarlo sin esperar.

const S = 1000;
const MIN = 60 * S;
const DIA = 24 * 60 * MIN;

// Los ritmos de juego, con sus nombres de siempre.
export const TIME_CONTROLS = [
  { id: 'libre', name: 'Sin límite', options: [{ id: 'libre', label: 'Sin reloj' }] },
  {
    id: 'bala', name: 'Bala', options: [
      { id: '1', label: '1 min', base: MIN, inc: 0 },
      { id: '1+1', label: '1 | 1', base: MIN, inc: S },
      { id: '1+2', label: '1 | 2', base: MIN, inc: 2 * S },
    ],
  },
  {
    id: 'blitz', name: 'Blitz', options: [
      { id: '3', label: '3 min', base: 3 * MIN, inc: 0 },
      { id: '3+2', label: '3 | 2', base: 3 * MIN, inc: 2 * S },
      { id: '5', label: '5 min', base: 5 * MIN, inc: 0 },
    ],
  },
  {
    id: 'rapida', name: 'Rápida', options: [
      { id: '10', label: '10 min', base: 10 * MIN, inc: 0 },
      { id: '15+10', label: '15 | 10', base: 15 * MIN, inc: 10 * S },
      { id: '30', label: '30 min', base: 30 * MIN, inc: 0 },
    ],
  },
  {
    id: 'diaria', name: 'Diaria', options: [
      { id: '1d', label: '1 día', perMove: DIA },
      { id: '3d', label: '3 días', perMove: 3 * DIA },
      { id: '7d', label: '7 días', perMove: 7 * DIA },
    ],
  },
];

// El ritmo elegido, por su identificador («blitz:3+2»), o null si es sin reloj.
export function findTimeControl(key) {
  const [cat, opt] = String(key ?? '').split(':');
  const categoria = TIME_CONTROLS.find((c) => c.id === cat);
  const opcion = categoria?.options.find((o) => o.id === opt);
  if (!categoria || !opcion || categoria.id === 'libre') return null;
  return { key: `${categoria.id}:${opcion.id}`, category: categoria.name, ...opcion };
}

export function createChessClock({ base = 0, inc = 0, perMove = 0 } = {}) {
  const inicial = perMove || base;
  const queda = { white: inicial, black: inicial };
  let corre = null; // el bando cuyo reloj corre
  let desde = 0; // desde cuándo (si no está en pausa)
  let parado = true;

  function descuenta(now) {
    if (corre && !parado) {
      queda[corre] = Math.max(0, queda[corre] - Math.max(0, now - desde));
      desde = now;
    }
  }

  return {
    // Arranca el reloj de `side` (al empezar, el de las blancas).
    start(side, now) {
      corre = side;
      desde = now;
      parado = false;
    },
    // El que ha movido pulsa: su reloj se para y arranca el del otro.
    press(side, now) {
      descuenta(now);
      if (side !== corre) return false;
      if (inc) queda[side] += inc;
      corre = side === 'white' ? 'black' : 'white';
      if (perMove) queda[corre] = perMove; // la diaria: plazo entero para la jugada nueva
      desde = now;
      return true;
    },
    // Deshacer una jugada: el turno vuelve a quien toca, sin devolverle a nadie el tiempo gastado.
    switchTo(side, now) {
      descuenta(now);
      corre = side;
      desde = now;
    },
    // Parar y seguir (las animaciones no cuentan).
    pause(now) {
      descuenta(now);
      parado = true;
    },
    resume(now) {
      if (!parado) return;
      desde = now;
      parado = false;
    },
    remaining(side, now) {
      descuenta(now);
      return queda[side];
    },
    // El bando al que se le ha acabado el tiempo, o null.
    flagged(now) {
      descuenta(now);
      if (corre && queda[corre] <= 0) return corre;
      return null;
    },
    get running() {
      return corre;
    },
    get paused() {
      return parado;
    },
  };
}

// Cómo se lee un tiempo en la pantalla del reloj: «3:00», «1:00:00», «0:09.8» (las décimas, solo por
// debajo de diez segundos, que es cuando importan) y, en la diaria, «2d 23h».
export function formatClock(ms) {
  const t = Math.max(0, ms);
  if (t >= DIA) {
    const d = Math.floor(t / DIA);
    const h = Math.floor((t % DIA) / (60 * MIN));
    return `${d}d ${String(h).padStart(2, '0')}h`;
  }
  if (t >= 60 * MIN) {
    const h = Math.floor(t / (60 * MIN));
    const m = Math.floor((t % (60 * MIN)) / MIN);
    const s = Math.floor((t % MIN) / S);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  if (t >= 10 * S) {
    const m = Math.floor(t / MIN);
    const s = Math.floor((t % MIN) / S);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const decimas = Math.floor(t / 100);
  return `0:0${Math.floor(decimas / 10)}.${decimas % 10}`;
}
