import json, struct, pathlib, sys, colorsys, math
from PIL import Image, ImageDraw, ImageFilter

# Tiñe de otro color una PRENDA entera, no una zona de la textura.
#
# El problema de teñir por color es que en estas figuras la prenda y el cuerpo suelen ser del mismo:
# la capa del rey blanco es de plata y su armadura también, así que no hay manera de separarlas
# mirando el mapa. Por geometría sí: la capa es exactamente lo que cuelga de los huesos de capa que
# le puso `capa.py`. Se buscan sus triángulos, se pintan en el mapa por sus coordenadas de textura y
# dentro de esa máscara se cambia el color.
#
# El brillo de cada téxel se respeta y solo se reescala, así que los pliegues, las sombras y el
# damasco siguen ahí: se cambia de qué color es la tela, no cómo está iluminada.
#
# Uso: tinta.py <modelo.glb> <color.jpg> <salida.jpg> <tono,sat,val> [peso_minimo]
modelo, color, salida = sys.argv[1], sys.argv[2], sys.argv[3]
TONO, SAT, VAL = (float(x) for x in sys.argv[4].split(','))
MINIMO = float(sys.argv[5]) if len(sys.argv) > 5 else 0.4

b = pathlib.Path(modelo).read_bytes()
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(b[20:20+njson])
off = 20 + njson
binario = b[off+8:off+8+struct.unpack_from('<I', b, off)[0]]
TIPOS = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
CUENTA = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def lee(i):
    acc=j['accessors'][i]; fmt,tam=TIPOS[acc['componentType']]; c=CUENTA[acc['type']]
    bv=j['bufferViews'][acc['bufferView']]; base=bv.get('byteOffset',0)+acc.get('byteOffset',0)
    paso=bv.get('byteStride') or tam*c
    return [struct.unpack_from('<'+fmt*c, binario, base+k*paso) for k in range(acc['count'])]

sk = j['skins'][0]
nombres = [j['nodes'][x].get('name') or '' for x in sk['joints']]
capa = {i for i, n in enumerate(nombres) if n.startswith('Capa')}
if not capa:
    raise SystemExit('este modelo no tiene huesos de capa: pásalo antes por capa.py')

# La capa entera, no solo su vuelo. De los huesos de capa cuelga la parte de abajo; la de arriba, la
# que se apoya en los hombros, se queda en la espalda alta (`descose.py` la deja ahí a propósito,
# que una capa cuelga de los hombros). Si se tiñe solo lo de abajo queda una costura a media
# espalda: gris arriba y del color nuevo abajo.
def inversa(m):
    a = [[m[c*4+f] for c in range(4)] for f in range(4)]
    aug = [a[i][:] + [1.0 if i == k else 0.0 for k in range(4)] for i in range(4)]
    for col in range(4):
        piv = max(range(col, 4), key=lambda r: abs(aug[r][col]))
        aug[col], aug[piv] = aug[piv], aug[col]
        d = aug[col][col]; aug[col] = [x/d for x in aug[col]]
        for r in range(4):
            if r != col and aug[r][col]:
                f = aug[r][col]; aug[r] = [x - f*y for x, y in zip(aug[r], aug[col])]
    return [[aug[i][4+k] for k in range(4)] for i in range(4)]

ibm = lee(sk['inverseBindMatrices'])
sitio = {i: (lambda inv: (inv[0][3], inv[1][3], inv[2][3]))(inversa(m)) for i, m in enumerate(ibm)}
def hueso(sufijo):
    return sitio[next(k for k, n in enumerate(nombres) if n.endswith(sufijo))]
dedo, tobillo = hueso('LeftToe_End'), hueso('LeftFoot')
largo = math.hypot(dedo[0]-tobillo[0], dedo[2]-tobillo[2]) or 1.0
FRENTE = ((dedo[0]-tobillo[0])/largo, (dedo[2]-tobillo[2])/largo)
hombro = hueso('LeftShoulder')
DETRAS = hombro[0]*FRENTE[0] + hombro[1-1]*0 + hombro[2]*FRENTE[1]
ESPALDA = {i for i, n in enumerate(nombres) if n.endswith('Spine2') or n.endswith('Spine1')}

prim = j['meshes'][0]['primitives'][0]
pos = lee(prim['attributes']['POSITION'])
uv = lee(prim['attributes']['TEXCOORD_0'])
jo = lee(prim['attributes']['JOINTS_0'])
we = lee(prim['attributes']['WEIGHTS_0'])
idx = [v[0] for v in lee(prim['indices'])]
esCapa = []
for p3, jj, ww in zip(pos, jo, we):
    vuelo = sum(ww[k] for k in range(4) if jj[k] in capa)
    alto = sum(ww[k] for k in range(4) if jj[k] in ESPALDA)
    detras = (p3[0]*FRENTE[0] + p3[2]*FRENTE[1]) < DETRAS - 0.01
    esCapa.append(vuelo >= MINIMO or (alto >= MINIMO and detras))
print(f'{sum(esCapa)} vértices son capa, de {len(esCapa)}')

col = Image.open(color).convert('RGB')
W, H = col.size
mascara = Image.new('L', (W, H), 0)
lapiz = ImageDraw.Draw(mascara)
n = 0
for k in range(0, len(idx), 3):
    tri = idx[k:k+3]
    if not all(esCapa[v] for v in tri):
        continue
    lapiz.polygon([((uv[v][0] % 1.0)*(W-1), (uv[v][1] % 1.0)*(H-1)) for v in tri], fill=255)
    n += 1
mascara = mascara.filter(ImageFilter.MaxFilter(5))  # margen, por las costuras del mapa
print(f'{n} triángulos de capa pintados en el mapa')

pc = col.load(); pm = mascara.load()
tocar = [(x, y) for y in range(H) for x in range(W) if pm[x, y]]
if not tocar:
    raise SystemExit('la máscara ha salido vacía')
medio = 0.0
for x, y in tocar:
    r, g, bb = pc[x, y]
    medio += colorsys.rgb_to_hsv(r/255, g/255, bb/255)[2]
medio /= len(tocar)
escala = VAL / medio if medio > 0 else 1
print(f'{len(tocar)/1000:.0f}k téxeles, brillo medio {medio:.3f} -> {VAL:.3f}')
for x, y in tocar:
    r, g, bb = pc[x, y]
    v = colorsys.rgb_to_hsv(r/255, g/255, bb/255)[2]
    r2, g2, b2 = colorsys.hsv_to_rgb(TONO, SAT, max(0.0, min(1.0, v*escala)))
    pc[x, y] = (int(r2*255+0.5), int(g2*255+0.5), int(b2*255+0.5))
col.save(salida, quality=95)
print(f'-> {salida}')
