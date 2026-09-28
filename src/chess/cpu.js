// La CPU vista desde la partida: se le pasa la partida (la posición de salida en FEN y las jugadas
// hechas desde ella) y el nivel, y contesta (en su hilo) con la suya, en notación UCI («e7e5»). Si el navegador no deja crear hilos, piensa en este mismo,
// y el tablero se queda quieto mientras tanto: peor, pero juega.
export function createCpu() {
  let worker = null;
  const pendientes = new Map();
  let siguiente = 1;

  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const espera = pendientes.get(data.id);
      if (!espera) return;
      pendientes.delete(data.id);
      if (data.error) espera.reject(new Error(data.error));
      else espera.resolve(data.move);
    };
    worker.onerror = (event) => {
      console.error('[BChess] El hilo de la CPU falló; piensa en el principal:', event.message ?? event);
      worker = null;
      for (const espera of pendientes.values()) espera.reject(new Error('sin hilo'));
      pendientes.clear();
    };
  } catch (err) {
    console.error('[BChess] No se pudo crear el hilo de la CPU:', err);
    worker = null;
  }

  async function enEsteHilo({ fen, moves, maxMs }, level) {
    const [{ Position }, { chooseMove }] = await Promise.all([import('./position.js'), import('./engine.js')]);
    const p = fen ? Position.fromFEN(fen) : Position.initial();
    for (const uci of moves) p.playUci(uci);
    const m = chooseMove(p, level, { maxMs });
    return m === null ? null : Position.uci(m);
  }

  return {
    // La jugada de la CPU para la partida `{ fen, moves }` en el nivel `level` (1-100).
    think(partida, level) {
      if (!worker) return enEsteHilo(partida, level);
      const id = siguiente++;
      return new Promise((resolve, reject) => {
        pendientes.set(id, { resolve, reject });
        worker.postMessage({ id, fen: partida.fen, moves: partida.moves, level, maxMs: partida.maxMs ?? null });
      }).catch(() => enEsteHilo(partida, level));
    },
    // Lo que estuviera pensando ya no importa (partida nueva): se contesta null.
    cancel() {
      for (const espera of pendientes.values()) espera.resolve(null);
      pendientes.clear();
    },
  };
}
