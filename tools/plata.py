from PIL import Image
import colorsys, sys

# Pone la tela clara en su color. Hacen falta dos cosas, y las dos por el mismo sitio:
#
#  1. Quitarle el rosa. La corrección de la piel trabaja con un peso suave, y la tela de la capa
#     —blanco roto, poca saturación— cae en el borde de esa máscara: se lleva parte del tono de la
#     carne y acaba rosácea.
#  2. Dejarla en MARFIL y no en blanco de folio. Una tela blanca de verdad, a la luz, tira a crema;
#     el blanco puro solo existe en las pantallas, y sobre el tablero canta.
#
# Las dos se hacen igual: se lleva el tono y la saturación de cada téxel de tela a los de destino,
# en la medida en que sea tela (nada de umbrales, que recortan la capa con tijera). El forro de
# color y las joyas no se enteran, que tienen saturación de sobra, y la piel tampoco.
#
# Uso: plata.py <entrada.jpg> <salida.jpg> [tono] [saturación] [gris]
entrada, salida = sys.argv[1], sys.argv[2]
TONO = float(sys.argv[3]) if len(sys.argv) > 3 else 0.115  # marfil: un amarillo muy de lejos
SATURACION = float(sys.argv[4]) if len(sys.argv) > 4 else 0.10
GRIS = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0  # cuánto se apaga, para que no deslumbre

def rampa(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

im = Image.open(entrada).convert('RGB')
px = im.load(); w, h = im.size
tocados = 0
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        hh, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
        piel = (rampa(hh, -0.005, 0.02) * (1 - rampa(hh, 0.10, 0.14))
                * rampa(s, 0.08, 0.20) * (1 - rampa(s, 0.55, 0.72)) * rampa(v, 0.06, 0.18))
        plata = (1 - piel) * rampa(v, 0.30, 0.50) * (1 - rampa(s, 0.09, 0.26))
        if plata <= 0.01:
            continue
        tocados += 1
        h2 = hh + (TONO - (hh if hh < 0.5 else hh - 1)) * plata
        s2 = s + (SATURACION - s) * plata
        v2 = v * (1 - GRIS * plata)
        r2, g2, b2 = colorsys.hsv_to_rgb(h2 % 1.0, max(0.0, min(1.0, s2)), v2)
        px[x, y] = (int(r2*255+0.5), int(g2*255+0.5), int(b2*255+0.5))
im.save(salida, quality=95)
print(f'{tocados/1000:.0f}k téxeles de tela desteñidos -> {salida}')
