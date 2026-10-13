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
// La temperatura (centipeones) en lo más flojo (100 de puntuación) y justo por debajo de 1320, y entre medias, a
// partes iguales en proporción.
const TEMPERATURA = { floja: 220, fuerte: 35 };

export function personaTemperature(rating) {
  const k = Math.min(1, Math.max(0, (rating - 100) / (ELO_MIN - 100)));
  return Math.round(TEMPERATURA.floja * (TEMPERATURA.fuerte / TEMPERATURA.floja) ** k);
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
