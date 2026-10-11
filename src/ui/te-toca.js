// «TE TOCA», AUNQUE NO SE ESTÉ MIRANDO (lo que pedía el plan online). Con la pestaña de fondo o la app en segundo
// plano, el título dice en cuántas partidas te toca, y la app instalada lo pone en su icono (`main.js`).

// El título con las partidas en que te toca: «(2) ¡Te toca! · mr_donut Battle Chess»; sin ninguna, el de siempre.
export function tituloConTurno(base, n, texto) {
  return n > 0 ? `(${n}) ${texto} · ${base}` : base;
}

// ¿Me toca en la partida online `p` (de `net/partida.js`)? Sí si mueve mi color tras las jugadas que lleva (con la
// que se esté animando en el tablero, `enCurso`; online se empieza siempre de la posición de salida: las blancas, las
// pares), o si su jugada ya ha llegado y aún no se ha jugado (con la pestaña de fondo, no se anima hasta volver).
export function meToca(p, enCurso = null) {
  if (p.acabada) return false;
  const n = p.jugadas(enCurso).length;
  return (n % 2 === 0 ? 'white' : 'black') === p.color || p.remote.has(n);
}
