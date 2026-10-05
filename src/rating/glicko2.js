// GLICKO-2, la puntuación de los jugadores (la de lichess; la de chess.com es su hermano mayor, Glicko).
// Cada jugador tiene tres números:
// - `r`, la puntuación (1200 al empezar, como en chess.com);
// - `rd`, lo que se fía de ella (350 al empezar: aún no sabe nada; baja jugando y sube sin jugar). Mientras
//   es alta, la puntuación es provisional y cada partida la mueve mucho;
// - `vol`, lo regular que es el jugador: el que sube y baja a rachas la tiene alta.
// Ganar a alguien de más puntuación da más puntos que ganar a uno de menos, y perder con él quita menos.
//
// Es la cuenta del artículo de Mark Glickman, «Example of the Glicko-2 system» (2012), tal cual, con cada
// partida como un periodo (como lichess): la puntuación se mueve al acabar cada una. Puro.

const SCALE = 173.7178; // de la escala de siempre a la de Glicko-2
const CENTER = 1500;
export const TAU = 0.5; // lo deprisa que puede cambiar la volatilidad: el valor del artículo
const EPSILON = 0.000001;

export const RD_MIN = 45; // ni un jugador de mil partidas está más seguro que esto (como lichess)
export const RD_MAX = 350;
export const R_MIN = 100;
export const R_MAX = 3500;
// Periodos que pasan por cada día sin jugar (el de lichess): sin jugar, `rd` vuelve a subir poco a poco.
export const PERIODS_PER_DAY = 0.21436;

const g = (phi) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu, muj, phij) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)));

// La volatilidad nueva: el algoritmo de Illinois del artículo (paso 5).
function newVolatility(phi, sigma, delta, v, tau) {
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k += 1;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > EPSILON; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA /= 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

// La `rd` tras `days` días sin jugar: sube, como mucho hasta RD_MAX.
export function ageDeviation({ rd, vol }, days) {
  if (!(days > 0)) return rd;
  const phi = rd / SCALE;
  const periods = days * PERIODS_PER_DAY;
  return Math.min(RD_MAX, Math.sqrt(phi * phi + periods * vol * vol) * SCALE);
}

// Lo que se espera que saque `player` contra `opponent` (de 0 a 1): la probabilidad de ganar, contando las
// tablas como media.
export function expectedScore(player, opponent) {
  return expected((player.r - CENTER) / SCALE, (opponent.r - CENTER) / SCALE, opponent.rd / SCALE);
}

// El jugador después de un periodo con estas partidas: `games` = [{ r, rd, score }] (el rival y lo que sacó
// el jugador: 1 gana, 0,5 tablas, 0 pierde). Sin partidas, solo crece su `rd`. Devuelve { r, rd, vol }.
export function rate(player, games, { tau = TAU } = {}) {
  const mu = (player.r - CENTER) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.vol;
  if (!games.length) {
    return { r: player.r, rd: Math.min(RD_MAX, Math.sqrt(phi * phi + sigma * sigma) * SCALE), vol: sigma };
  }
  let vInverse = 0;
  let sum = 0;
  for (const game of games) {
    const muj = (game.r - CENTER) / SCALE;
    const phij = game.rd / SCALE;
    const E = expected(mu, muj, phij);
    vInverse += g(phij) * g(phij) * E * (1 - E);
    sum += g(phij) * (game.score - E);
  }
  const v = 1 / vInverse;
  const delta = v * sum;
  const sigmaNew = newVolatility(phi, sigma, delta, v, tau);
  const phiStar = Math.sqrt(phi * phi + sigmaNew * sigmaNew);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * sum;
  return {
    r: Math.min(R_MAX, Math.max(R_MIN, muNew * SCALE + CENTER)),
    rd: Math.min(RD_MAX, Math.max(RD_MIN, phiNew * SCALE)),
    vol: sigmaNew,
  };
}
