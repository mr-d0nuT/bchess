from PIL import Image
import colorsys, sys

# Quita el tinte rosado de la tela clara. La corrección de la piel trabaja con un peso suave, y la
# tela de la capa —blanco roto, poca saturación— cae en el borde de esa máscara: se lleva parte del
# tono de la piel y acaba rosácea. Aquí se le devuelve lo suyo: lo que es claro y casi sin color no
# es carne, es plata, y la plata no tiene tono. Se le baja la saturación casi a cero y se queda
# blanco grisáceo.
#
# El forro azul y los zafiros no se tocan (tienen saturación de sobra) y la piel tampoco (su peso la
# protege), así que solo se destiñe lo que ya era casi blanco.
#
# Uso: plata.py <entrada.jpg> <salida.jpg> [cuánto] [gris]
entrada, salida = sys.argv[1], sys.argv[2]
DESTIÑE = float(sys.argv[3]) if len(sys.argv) > 3 else 0.85
GRIS = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0  # cuánto se apaga, para que no deslumbre

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
        s2 = s * (1 - DESTIÑE * plata)
        v2 = v * (1 - GRIS * plata)
        r2, g2, b2 = colorsys.hsv_to_rgb(hh, s2, v2)
        px[x, y] = (int(r2*255+0.5), int(g2*255+0.5), int(b2*255+0.5))
im.save(salida, quality=95)
print(f'{tocados/1000:.0f}k téxeles de tela desteñidos -> {salida}')
