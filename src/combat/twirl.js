// EL MOLINETE: el palo dando vueltas de campana sobre el puño antes de entrar a matar.
//
// No hace falta un solo hueso. `setSpearSpin` compone el giro en el sistema del propio palo, y como
// el origen de un palo está en su agarre, las vueltas salen alrededor del puño: exactamente el gesto
// de quien hace girar una lanza sujetándola por el medio. Sirve igual para el báculo de un rey que
// para la lanza de un peón, porque lo que gira es el palo y no quien lo lleva.
//
// Las vueltas son ENTERAS a propósito: al acabar, el palo está donde estaba, y soltar el molinete no
// da ningún tirón.

export const EMBALA = (t) => t * t; // arranca pesado y acaba lanzado
export const FRENA = (t) => 1 - (1 - t) * (1 - t); // sale disparado y se va parando

export function twirl(piece, { clock, turns = 4, seconds = 0.85, ease = EMBALA } = {}) {
  const vueltas = Math.round(turns) * Math.PI * 2;
  return clock
    .tween(seconds, (t) => piece.setSpearSpin(ease(t) * vueltas))
    .finally(() => piece.setSpearSpin(0));
}
