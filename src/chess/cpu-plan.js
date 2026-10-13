import { cpuRating } from '../rating/ratings.js';
import { levelSettings } from './engine.js';
import { ELO_MAX, ELO_MIN } from './stockfish.js';

// QUÉ MOTOR JUEGA EN CADA NIVEL (1-100). Lo pidió el usuario: viendo una partida de la CPU contra sí misma no veía
// ni jugadas geniales ni de libro, solo que no la comieran (el motor propio solo sabe contar piezas y casillas). Ahora
// juega siempre Stockfish, y antes de pensar, el libro de aperturas (`book.js`): aperturas de verdad, y no siempre
// la misma.
//
// - Desde 1320 de puntuación (`cpuRating`), con su fuerza limitada a esa puntuación (`UCI_Elo`, de 1320 a 3190,
//   como lo calibran sus autores), y en el nivel 100, a toda su fuerza.
// - Por debajo, Stockfish no sabe jugar tan flojo, y aquí se le ayuda: puntúa a fondo TODAS las jugadas y se elige
//   entre ellas como una persona de ese nivel (`pickLikeAPerson`): casi siempre una buena, muchas veces la mejor
//   (también las brillantes: también la gente que empieza se merece un rival que las haga, lo dijo el usuario, «si no,
//   no se aprende») y de vez en cuando un error, más a menudo cuanto más flojo el nivel. Es la «temperatura»: lo que
//   tiene que perder una jugada respecto a la mejor para salir e veces menos.
//
// El motor propio (`engine.js`) solo juega si Stockfish no puede (un navegador sin WebAssembly).

const STOCKFISH_MIN_MS = 300; // lo menos que piensa Stockfish sin reloj
const PERSONA_MS = 450; // lo que piensa para puntuar todas las jugadas
const PERSONA_JUGADAS = 50; // cuántas puntúa: todas (en una posición normal hay menos de 50)
// La temperatura (centipeones) de cada puntuación, CALIBRADA con partidas de verdad (2026-10-14): contra Stockfish con
// UCI_Elo 1320 (lo más flojo que juega), la persona con 80 de temperatura sacó el 45 % (unos 1290) y con 37, el 91 %
// (unos 1700): cada vez que la temperatura se multiplica por e (2,7), unos 530 puntos menos. Comprobado en medio: con 138
// (unos 1000) le sacó el 17 % a la de 80, lo que tocaba por esa diferencia (16 %). Antes, el nivel justo por debajo de
// 1320 jugaba con 37 y era como uno de 1700 diciendo 1290.
const CALIBRADA = { rating: 1290, temperature: 80, porE: 530 };

export function personaTemperature(rating) {
  return Math.round(CALIBRADA.temperature * Math.exp((CALIBRADA.rating - rating) / CALIBRADA.porE));
}

// { engine: 'stockfish', rating, book (jugadas de libro que sigue), movetime (lo que piensa sin reloj), y o bien
// elo (su fuerza; null, toda) o bien persona: { temperature, multipv } }.
export function cpuPlan(level) {
  const nivel = Math.max(1, Math.min(100, Math.round(level)));
  const { r } = cpuRating(nivel);
  const { book, timeMs } = levelSettings(nivel);
  if (r < ELO_MIN) {
    return { engine: 'stockfish', rating: r, book, movetime: PERSONA_MS, elo: null, persona: { temperature: personaTemperature(r), multipv: PERSONA_JUGADAS } };
  }
  return { engine: 'stockfish', rating: r, book, movetime: Math.max(STOCKFISH_MIN_MS, timeMs), elo: nivel >= 100 ? null : Math.min(ELO_MAX, r), persona: null };
}
