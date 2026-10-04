// Los nombres de los jugadores (1 contra 1 y online), tal como se enseñan: sin caracteres de control, sin
// espacios de más y como mucho 16 letras. El del rival online llega de la red, así que pasa por aquí
// antes de pintarse (y se pinta siempre como texto, nunca como HTML).
export const NAME_MAX = 16;
export const cleanName = (s) => Array.from(String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('');
