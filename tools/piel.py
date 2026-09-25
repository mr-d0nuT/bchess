from PIL import Image
import colorsys, sys

# Deja la piel de una textura al MISMO tono que el resto de las piezas y sin el parcheo de cuadros.
#
# El parcheo no es cosa del color: la malla viene retopologizada y su mapa son miles de islas
# diminutas, cada una pintada por su cuenta. Donde dos islas se tocan en la figura, saltan de tono y
# de brillo, y eso es lo que se ve a cuadros. Aquí cada píxel de piel arrima su color (`UNIFORMA`) y
# su brillo (`APLANA`) a la media de toda la piel: las islas convergen y las costuras desaparecen.
# El brillo se arrima menos, para no dejar la piel plana como un cartón —y de todas formas la luz de
# verdad se la pone el motor, no la textura.
#
# Todo va con un peso suave (cuánto de piel es cada píxel). Nada de umbrales: un umbral parte la
# imagen en dentro y fuera, y el borde entre los dos es justo el moteado que se quiere quitar.
entrada, salida = sys.argv[1], sys.argv[2]
DESTINO = tuple(float(x) for x in sys.argv[3].split(',')) if len(sys.argv) > 3 else (138.0, 113.0, 92.0)
UNIFORMA = float(sys.argv[4]) if len(sys.argv) > 4 else 0.55
APLANA = float(sys.argv[5]) if len(sys.argv) > 5 else 0.35

def rampa(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

def peso_piel(h, s, v):
    return (rampa(h, -0.005, 0.02) * (1 - rampa(h, 0.10, 0.14))
            * rampa(s, 0.08, 0.20) * (1 - rampa(s, 0.55, 0.72))
            * rampa(v, 0.06, 0.18))

im = Image.open(entrada).convert('RGB')
px = im.load(); w, h = im.size

# Primera pasada: cómo es la piel tal como viene.
piel = {}
total = total2 = 0.0
sumas = [0.0, 0.0, 0.0]
sumas2 = [0.0, 0.0, 0.0]
sh = ss = sv = 0.0
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        hh, s, v = colorsys.rgb_to_hsv(r/255, g/255, b/255)
        p = peso_piel(hh, s, v)
        if p <= 0.002:
            continue
        piel[(x, y)] = (hh, s, v, p)
        total += p
        for i, c in enumerate((r, g, b)):
            sumas[i] += c*p
            sumas2[i] += c*p*p
        sh += (hh if hh < 0.5 else hh - 1) * p  # el tono de la piel cruza el 0: con signo
        ss += s*p
        sv += v*p
if total == 0:
    raise SystemExit('esta textura no tiene piel')
medio = [s/total for s in sumas]
tono_medio, sat_media, val_medio = sh/total, ss/total, sv/total

# La ganancia, corregida por el peso: como cada píxel recibe su parte (`p`), para que la MEDIA acabe
# en el destino hay que pedir un poco más que el cociente de medias.
ganancia = [1 + (DESTINO[i]*total - sumas[i]) / sumas2[i] for i in range(3)]
print(f'piel media {medio[0]:.1f},{medio[1]:.1f},{medio[2]:.1f} -> destino {DESTINO}')
print(f'ganancia {ganancia[0]:.3f},{ganancia[1]:.3f},{ganancia[2]:.3f}  tono {tono_medio:+.4f} sat {sat_media:.3f} val {val_medio:.3f}')

for (x, y), (hh, s, v, p) in piel.items():
    r, g, b = px[x, y]
    r = r * (1 + (ganancia[0]-1)*p)
    g = g * (1 + (ganancia[1]-1)*p)
    b = b * (1 + (ganancia[2]-1)*p)
    hh2, s2, v2 = colorsys.rgb_to_hsv(min(r,255)/255, min(g,255)/255, min(b,255)/255)
    firma = hh2 if hh2 < 0.5 else hh2 - 1
    firma += (tono_medio - firma) * UNIFORMA * p
    s2 += (sat_media - s2) * UNIFORMA * p
    v2 += (val_medio - v2) * APLANA * p
    r2, g2, b2 = colorsys.hsv_to_rgb(firma % 1.0, max(0.0, min(1.0, s2)), max(0.0, min(1.0, v2)))
    px[x, y] = (int(r2*255+0.5), int(g2*255+0.5), int(b2*255+0.5))
im.save(salida, quality=95)
print(f'-> {salida}')

# Comprobación honrada: la media de LOS MISMOS píxeles (con los mismos pesos) después de corregir.
# Medirla volviendo a clasificar engaña, porque al cambiar el color cambia también quién es piel.
sr = sg = sb = 0.0
for (x, y), (_, _, _, p) in piel.items():
    r, g, b = px[x, y]
    sr += r*p; sg += g*p; sb += b*p
print(f'comprobación: la piel queda en {sr/total:.1f},{sg/total:.1f},{sb/total:.1f}')
