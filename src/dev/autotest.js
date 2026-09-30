// La red de seguridad (punto 5 del plan de mejora): juega en segundo plano todos los combates —cada
// pareja de piezas y cada gag que les puede tocar— y cuenta cuáles fallan, se cuelgan o dejan el tablero
// mal. Se lanza con `bchess.autotest()` en la consola, o abriendo la web con `?autotest`; no es parte del
// juego y solo se carga cuando se pide. Antes de publicar un cambio que toque los combates, se pasa.
//
// Se hizo tras dos fallos que se colaron: uno dejó un rato sin combates a todo lo que no fueran peones
// (un error en la elección del estilo) y otro, la lanza del jinete en vertical, llegó a publicarse.

import { battleName, battlesFor, testing } from '../combat/battles.js';
import { pawnThrowsBomb } from '../combat/pawn-bomb.js';
import { FROM, TO, fenFor, pairs } from './pairs.js';

const LIMIT = 150; // segundos de juego: un combate que dura más, se ha colgado
const STEP = 0.5; // se avanza de medio en medio segundo…
const FPS = 20; // …a 20 fotogramas por segundo: basta para que todo pase por donde tiene que pasar


export async function runAutotest(b, { only = null, onProgress = () => {} } = {}) {
  const results = [];
  const gestureAt = b.gesture.at;
  const bombChance = pawnThrowsBomb.chance;
  const logged = [];
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => { logged.push(args.map(String).join(' ')); originalError(...args); };
  console.warn = (...args) => { logged.push(args.map(String).join(' ')); originalWarn(...args); };
  b.gesture.at = Infinity;
  try {
    await b.newGame({ mode: 'pvp', level: 30, color: 'white', time: 'libre:libre' });
    b.menu.hide?.();
    const list = pairs().filter((pair) => !only || only(pair));
    // Primero se cuentan las pruebas: una por cada combate que le pueda tocar a la pareja.
    const runs = [];
    for (const pair of list) {
      const fen = fenFor(pair.color, pair.attacker, pair.defender);
      await setUp(b, fen);
      const from = FROM[pair.color][pair.attacker];
      const to = TO[pair.color];
      const attacker = b.pieces.find((entry) => entry.mover.square === from);
      const defender = b.pieces.find((entry) => entry.mover.square === to);
      const options = attacker && defender ? battlesFor(attacker, defender) : [];
      const label = `${pair.color === 'white' ? '' : 'negra '}${pair.attacker} → ${pair.defender}`;
      if (pair.attacker === 'pawn' && pair.defender === 'pawn') {
        runs.push({ ...pair, fen, from, to, label: `${label} (duelo)`, gag: null, bomb: 0 });
        runs.push({ ...pair, fen, from, to, label: `${label} (bomba)`, gag: null, bomb: 1 });
      } else if (options.length) {
        for (const gag of options) runs.push({ ...pair, fen, from, to, label: `${label} (${battleName(gag)})`, gag, bomb: 0 });
      } else {
        runs.push({ ...pair, fen, from, to, label, gag: null, bomb: 0 });
      }
    }
    for (const [i, run] of runs.entries()) {
      onProgress({ done: i, total: runs.length, current: run.label });
      results.push(await playOne(b, run, logged));
    }
    onProgress({ done: runs.length, total: runs.length, current: null });
  } finally {
    testing.only = null;
    pawnThrowsBomb.chance = bombChance;
    b.gesture.at = gestureAt;
    console.error = originalError;
    console.warn = originalWarn;
  }
  return results;
}

async function setUp(b, fen) {
  for (let k = 0; k < 400 && (b.state.fighting || b.game.animating || b.state.busy); k++) await b.advance(STEP, FPS);
  b.ui.closeAll?.();
  b.state.phase = 'playing';
  b.setup(fen);
  await b.advance(0.8, FPS);
}

async function playOne(b, run, logged) {
  testing.only = run.gag;
  pawnThrowsBomb.chance = run.bomb;
  await setUp(b, run.fen);
  const started = logged.length; // lo que avisa `setup` al recolocar el tablero no cuenta
  const problems = [];
  await b.tap({ square: run.from });
  if (b.state.selected?.mover.square !== run.from) {
    return { prueba: run.label, ok: false, segundos: 0, problemas: 'no se pudo elegir la pieza' };
  }
  let done = false;
  b.tap({ square: run.to }).then(() => { done = true; }, (err) => { done = true; problems.push(`error: ${err}`); });
  let seconds = 0;
  let fought = false;
  while (seconds < LIMIT) {
    await b.advance(STEP, FPS);
    seconds += STEP;
    fought ||= b.state.fighting;
    if (done || (fought && !b.state.fighting && !b.game.animating && !b.state.busy)) break;
  }
  if (seconds >= LIMIT) problems.push(`colgado: sigue a los ${LIMIT} s`);
  for (const line of logged.slice(started)) {
    if (/combate falló|Pieza de más|Falta una pieza|Error|TypeError/i.test(line)) problems.push(line.split('\n')[0].slice(0, 160));
  }
  // El tablero, como dicen las reglas: el atacante en la casilla de la víctima, y cada pieza en su sitio.
  const winner = b.pieces.find((entry) => entry.mover.square === run.to);
  if (!winner || winner.kind !== run.attacker || winner.color !== run.color) problems.push('en la casilla no quedó el atacante');
  const expected = b.game.position.toFEN().split(' ')[0].replace(/\d/g, '').replace(/\//g, '').length;
  if (b.pieces.length !== expected) problems.push(`hay ${b.pieces.length} piezas y debería haber ${expected}`);
  for (const entry of b.pieces) {
    if (!entry.piece.object.visible) problems.push(`${entry.kind} en ${entry.mover.square} invisible`);
    if (entry.kind === 'knight' && !entry.piece.mounted) problems.push(`caballero en ${entry.mover.square} sin montar`);
  }
  return { prueba: run.label, ok: problems.length === 0, segundos: seconds, problemas: [...new Set(problems)].join(' · ') };
}

// Lo que ve quien abre la web con `?autotest`: el avance y, al final, la lista.
export function showReport(results, progress) {
  let panel = document.getElementById('autotest');
  if (!panel) {
    panel = document.createElement('pre');
    panel.id = 'autotest';
    panel.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;max-height:60vh;overflow:auto;z-index:99;'
      + 'margin:0;padding:10px 12px;background:rgba(0,0,0,.82);color:#e8f5e9;font:12px/1.45 ui-monospace,monospace;border-radius:10px;white-space:pre-wrap';
    document.body.append(panel);
  }
  if (!results) {
    panel.textContent = `Red de seguridad: ${progress.done}/${progress.total}${progress.current ? ` · ${progress.current}` : ''}`;
    return;
  }
  const fallos = results.filter((r) => !r.ok);
  panel.textContent = [
    `Red de seguridad: ${results.length - fallos.length}/${results.length} combates bien${fallos.length ? `, ${fallos.length} con problemas` : ''}.`,
    ...results.map((r) => `${r.ok ? '✔' : '✖'} ${r.prueba} · ${r.segundos} s${r.ok ? '' : ` · ${r.problemas}`}`),
  ].join('\n');
}
