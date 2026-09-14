// Física de una roca de dibujos animados, pura y en casillas: cae con gravedad, rebota una vez
// en el tablero y rebota en las piezas en vez de atravesarlas.

export const GRAVITY = 9;
const BOUNCE = 0.35; // velocidad vertical que conserva al rebotar en el tablero
const FRICTION = 0.5; // velocidad horizontal que conserva al rebotar en el tablero
const WALL_BOUNCE = 0.3; // velocidad que conserva al rebotar en una pieza
const MIN_BOUNCE = 0.5; // más despacio que esto, ya no rebota

// Un fotograma de una roca { position, velocity, radius, bounces, resting }, que se modifica.
// `obstacles`: cilindros de las piezas { x, z, radius, height }.
export function rockStep(rock, dt, obstacles = []) {
  if (rock.resting) return rock;
  const { position, velocity } = rock;
  velocity.y -= GRAVITY * dt;
  position.x += velocity.x * dt;
  position.y += velocity.y * dt;
  position.z += velocity.z * dt;
  for (const obstacle of obstacles) {
    if (position.y - rock.radius > obstacle.height) continue;
    const dx = position.x - obstacle.x;
    const dz = position.z - obstacle.z;
    const distance = Math.hypot(dx, dz);
    const minimum = obstacle.radius + rock.radius;
    if (distance >= minimum || distance < 1e-6) continue;
    const nx = dx / distance;
    const nz = dz / distance;
    position.x = obstacle.x + nx * minimum;
    position.z = obstacle.z + nz * minimum;
    const along = velocity.x * nx + velocity.z * nz;
    if (along < 0) {
      velocity.x -= (1 + WALL_BOUNCE) * along * nx;
      velocity.z -= (1 + WALL_BOUNCE) * along * nz;
    }
  }
  if (position.y <= rock.radius) {
    position.y = rock.radius;
    if (rock.bounces === 0 && velocity.y < -MIN_BOUNCE) {
      velocity.y *= -BOUNCE;
      velocity.x *= FRICTION;
      velocity.z *= FRICTION;
      rock.bounces = 1;
    } else {
      velocity.x = 0;
      velocity.y = 0;
      velocity.z = 0;
      rock.resting = true;
    }
  }
  return rock;
}
