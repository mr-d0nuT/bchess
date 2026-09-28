import colorsys, json, math, pathlib, struct, sys
from PIL import Image, ImageDraw, ImageFilter

# Pinta de piel la parte de atrás de las piernas de las reinas.
#
# Tripo pinta lo que ve en las imágenes de referencia, y la parte de atrás de los muslos no se ve en
# ninguna: queda tapada por la capa. Así que la rellenó con lo que tenía más a mano, que era el forro
# —azul en la blanca, rojo en la negra, que luego `trasera.py` oscureció al pintarle la espalda—.
# Con la capa quieta no se veía; en cuanto la capa se abre, o de perfil por delante, la reina tiene
# los muslos de dos colores.
#
# Se buscan los triángulos que son PIEL DE PIERNA, y no lo que cuelga a su lado: por el peso no se
# puede, porque las tiras de forro que caen junto a los muslos también están cosidas a ellos. Por
# sitio sí: la pierna es un tubo, y su piel está a un radio del eje que depende de la altura (la
# tira de forro cae más afuera) y mira hacia fuera. Arriba se añaden las nalgas: detrás del eje de
# cada pierna, mirando atrás y entre las dos caderas. Ahí sí hace falta mirar el peso, porque la
# capa va pegada a la cadera y por sitio no se distingue de la nalga: lo que cuelga de los huesos
# de la capa (`capa.py`) es capa, y no se toca.
#
# Dentro de esa máscara solo se toca lo que NO es color de piel (el azul, el rojo o el gris del
# forro), y se le pone el tono medio de la piel de esas mismas piernas, con un poco del claroscuro
# que ya tenía. Lo blanquecino —las tiras de las sandalias, el borde del body— se respeta.
#
# Uso: piernas.py <modelo.glb> <color.jpg> <salida.jpg> [--sin-nalgas] [--marcas m.json]
modelo, color, salida = sys.argv[1], sys.argv[2], sys.argv[3]
NALGAS = '--sin-nalgas' not in sys.argv
MARCAS = sys.argv[sys.argv.index('--marcas') + 1] if '--marcas' in sys.argv else None

b = pathlib.Path(modelo).read_bytes()
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(b[20:20 + njson])
BIN = 20 + njson + 8
TIPOS = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
CUENTA = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def lee(i):
    acc = j['accessors'][i]
    fmt, tam = TIPOS[acc['componentType']]
    n = CUENTA[acc['type']]
    bv = j['bufferViews'][acc['bufferView']]
    base = BIN + bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    paso = bv.get('byteStride') or tam * n
    return [struct.unpack_from('<' + fmt * n, b, base + k * paso) for k in range(acc['count'])]


def origen(m):
    a = [[m[c * 4 + f] for c in range(4)] for f in range(4)]
    aug = [a[i][:] + [1.0 if i == k else 0.0 for k in range(4)] for i in range(4)]
    for col in range(4):
        piv = max(range(col, 4), key=lambda r: abs(aug[r][col]))
        aug[col], aug[piv] = aug[piv], aug[col]
        d = aug[col][col]
        aug[col] = [x / d for x in aug[col]]
        for r in range(4):
            if r != col and aug[r][col]:
                f = aug[r][col]
                aug[r] = [x - f * y for x, y in zip(aug[r], aug[col])]
    return tuple(aug[i][7] for i in range(3))


sk = j['skins'][0]
nombres = [(j['nodes'][n].get('name') or '').split(':')[-1] for n in sk['joints']]
sitio = [origen(m) for m in lee(sk['inverseBindMatrices'])]
prim = j['meshes'][0]['primitives'][0]
pos = lee(prim['attributes']['POSITION'])
nor = lee(prim['attributes']['NORMAL'])
uv = lee(prim['attributes']['TEXCOORD_0'])
idx = [v[0] for v in lee(prim['indices'])]
tris = [tuple(idx[k:k + 3]) for k in range(0, len(idx), 3)]

# Las medidas de la pierna, para que los radios y las alturas no dependan de la figura.
cadenas = [[sitio[nombres.index(lado + p)] for p in ('UpLeg', 'Leg', 'Foot')] for lado in ('Left', 'Right')]
cadera, rodilla, tobillo = (sum(c[k][1] for c in cadenas) / 2 for k in range(3))
largo = cadera - tobillo
DESDE = tobillo + 0.25 * (rodilla - tobillo)  # por debajo, las tiras de las sandalias
MEDIO = rodilla + 0.55 * (cadera - rodilla)  # de aquí arriba el muslo engorda hasta la nalga
HASTA = cadera + 0.015 * largo
R_MUSLO = 0.12 * largo  # radio de la piel hasta medio muslo; la tira de forro cae más afuera
R_NALGA = 0.16 * largo  # y arriba del todo, donde el muslo se hace nalga
R_ATRAS = 0.197 * largo  # hasta dónde llegan las nalgas por detrás
ANCHO = 0.22 * largo  # y a los lados


def radio_max(y):
    if y <= MEDIO:
        return R_MUSLO
    return R_MUSLO + (min(y, HASTA) - MEDIO) / (HASTA - MEDIO) * (R_NALGA - R_MUSLO)


def es_piel(p, n, de_capa):
    mejor = None
    for cad in cadenas:
        for a, q in zip(cad, cad[1:]):
            ab = [q[k] - a[k] for k in range(3)]
            ap = [p[k] - a[k] for k in range(3)]
            ll = sum(x * x for x in ab)
            t = 0.0 if ll == 0 else max(0.0, min(1.0, sum(ap[k] * ab[k] for k in range(3)) / ll))
            c = [a[k] + ab[k] * t for k in range(3)]
            d = math.dist(p, c)
            if mejor is None or d < mejor[0]:
                mejor = (d, c)
    d, c = mejor
    radial = [p[k] - c[k] for k in range(3)]
    largo_r = math.sqrt(sum(x * x for x in radial)) or 1.0
    fuera = sum(n[k] * radial[k] / largo_r for k in range(3))
    anillo = DESDE <= p[1] <= HASTA and d <= radio_max(p[1]) and fuera >= 0.2
    nalga = NALGAS and MEDIO <= p[1] <= HASTA + 0.02 * largo and d <= R_ATRAS and abs(p[0]) <= ANCHO \
        and p[2] < c[2] and n[2] < -0.2 and de_capa < 0.3
    return anillo or nalga


capa = {i for i, n in enumerate(nombres) if n.startswith('Capa')}
de_capa = [sum(w for jx, w in zip(jj, ww) if jx in capa)
           for jj, ww in zip(lee(prim['attributes']['JOINTS_0']), lee(prim['attributes']['WEIGHTS_0']))]
piel = [es_piel(p, n, c) for p, n, c in zip(pos, nor, de_capa)]
elegidos = [t for t, (a, bb, c) in enumerate(tris) if piel[a] and piel[bb] and piel[c]]
print(f'{len(elegidos)} triángulos de piel de pierna (cadera {cadera:.3f}, rodilla {rodilla:.3f}, tobillo {tobillo:.3f})')
if MARCAS:
    json.dump(elegidos, open(MARCAS, 'w'))

im = Image.open(color).convert('RGB')
W, H = im.size
mascara = Image.new('L', (W, H), 0)
dibujo = ImageDraw.Draw(mascara)
for t in elegidos:
    dibujo.polygon([((uv[v][0] % 1.0) * W, (uv[v][1] % 1.0) * H) for v in tris[t]], fill=255)
# Un poco más ancha que los triángulos: al reducir la textura, los téxeles del borde se mezclan con
# los de fuera y dejarían un filo del color viejo.
mascara = mascara.filter(ImageFilter.MaxFilter(5))
px = im.load()
mk = mascara.load()
dentro = [(x, y) for y in range(H) for x in range(W) if mk[x, y]]


def parecido_a_piel(r, g, bl):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, bl / 255)
    dh = min(abs(h - 0.05), 1 - abs(h - 0.05))
    tono = max(0.0, min(1.0, (0.12 - dh) / 0.06))
    sat = max(0.0, min(1.0, (s - 0.10) / 0.08, (0.78 - s) / 0.08))
    luz = max(0.0, min(1.0, (v - 0.20) / 0.10))
    blanco = s < 0.18 and v > 0.55
    return tono * sat * luz, blanco


def brillo(r, g, bl):
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl


# El tono de la piel de estas mismas piernas: la media de lo que ya es piel dentro de la máscara.
suma = [0.0, 0.0, 0.0]
peso = 0.0
malos = []
for x, y in dentro:
    r, g, bl = px[x, y]
    parecido, blanco = parecido_a_piel(r, g, bl)
    if parecido > 0.9:
        suma = [suma[0] + r, suma[1] + g, suma[2] + bl]
        peso += 1
    elif not blanco:
        malos.append((x, y, 1.0 - parecido))
tono = [c / peso for c in suma]
luz_piel = brillo(*tono)
luz_mala = sum(brillo(*px[x, y]) for x, y, _ in malos) / max(1, len(malos))
print(f'piel media {tuple(round(c) for c in tono)}; {len(malos)} téxeles que no lo son, de {len(dentro)}')
for x, y, k in malos:
    viejo = px[x, y]
    # El claroscuro que ya tenía, pero poco: lo oscuro del forro no es sombra de pierna.
    sombra = max(0.80, min(1.04, 0.94 + 0.25 * (brillo(*viejo) - luz_mala) / max(1.0, luz_mala)))
    nuevo = [c * sombra for c in tono]
    px[x, y] = tuple(int(round(max(0, min(255, o * (1 - k) + n * k)))) for o, n in zip(viejo, nuevo))
im.save(salida, quality=92)
print('->', salida)
