// De la malla que toca el ratón a la pieza que es, y si esa malla se está viendo de verdad. Puro:
// solo mira `userData`, `visible` y `parent`, así que se prueba con objetos de mentira.

// La pieza a la que pertenece una malla: el dueño se apunta en la raíz de la pieza, así que se sube
// por los padres hasta dar con él. Tocar una crin o una peana devuelve la pieza entera; tocar algo
// marcado `noPick` (las lanzas) no devuelve nada, para que el rayo siga hasta lo que hay detrás.
export function ownerOf(object) {
  for (let o = object; o; o = o.parent) {
    if (o.userData?.noPick) return null; // lanzas y báculos: finos y cruzados, no se tocan
    if (o.userData?.owner) return o.userData.owner;
  }
  return null;
}

// Si se ve en pantalla: basta con que esté escondida ella o cualquiera de sus padres. Hace falta
// porque el rayo de Three atraviesa lo invisible, y hay piezas con partes escondidas (la torre
// mientras anda como gigante, la espada envainada del caballero).
export function onScreen(object) {
  for (let o = object; o; o = o.parent) {
    if (o.visible === false) return false;
  }
  return true;
}
