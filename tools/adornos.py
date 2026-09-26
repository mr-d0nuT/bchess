import json, struct, pathlib, sys, colorsys
from PIL import Image, ImageDraw, ImageFilter

# Le pone metal a una figura SOLO donde toca: los adornos, la corona, la joyería. El paño, la piel y
# el pelo se quedan mates, que es como se ven.
#
# Tripo entrega un solo valor de metal y rugosidad para toda la figura (a la reina blanca le puso
# metal 0,60 de la corona a los tobillos, y por eso parecía una muñeca de plástico mojado). Aquí el
# mapa se reconstruye a partir de tres pistas, y cada una sirve para una cosa distinta:
#
#   · la ALTURA: lo que está por encima de la frente es la corona, y una corona es metal;
#   · el TONO: el oro tiene color propio y se reconoce solo, aunque esté repartido por toda la capa;
#   · el RELIEVE: la filigrana de plata es del mismo color que el paño que la rodea, así que por
#     color no hay manera. Pero SOBRESALE, y lo que sobresale le da a la luz y sale más claro que su
#     entorno. Comparando cada téxel con una versión emborronada de la textura aparece el dibujo.
#
# La piel se excluye siempre: es clara, tiene relieve (nudillos, clavículas) y saldría de latón.
#
# Uso: adornos.py <modelo.glb> <color.jpg> <salida.glb> [opciones]
#   --corona <altura>       de esa altura para arriba, todo metal (0-1 del alto del modelo)
#   --oro                   el oro (tono amarillo y saturado) es metal
#   --relieve <umbral>      lo que sobresale más de ese umbral (0-255) es metal
#   --metal <0-1>           cuánto metal (0,9 por defecto)
#   --rugoso <0-1>          rugosidad del metal (0,3: pulido a mano, no espejo)
modelo, color, salida = sys.argv[1], sys.argv[2], sys.argv[3]
op = sys.argv[4:]
def opcion(nombre, defecto=None):
    return float(op[op.index(nombre) + 1]) if nombre in op else defecto
CORONA = opcion('--corona')
ORO = '--oro' in op
RELIEVE = opcion('--relieve')
METAL = opcion('--metal', 0.90)
RUGOSO = opcion('--rugoso', 0.30)
CABEZA = tuple(float(x) for x in op[op.index('--cabeza') + 1].split(',')) if '--cabeza' in op else None
MATE = 0.90

b = bytearray(pathlib.Path(modelo).read_bytes())
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(bytes(b[20:20+njson]))
off = 20 + njson
binario = bytearray(b[off+8:off+8+struct.unpack_from('<I', b, off)[0]])
TIPOS = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
CUENTA = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def lee(i):
    acc=j['accessors'][i]; fmt,tam=TIPOS[acc['componentType']]; c=CUENTA[acc['type']]
    bv=j['bufferViews'][acc['bufferView']]; base=bv.get('byteOffset',0)+acc.get('byteOffset',0)
    paso=bv.get('byteStride') or tam*c
    return [struct.unpack_from('<'+fmt*c, bytes(binario), base+k*paso) for k in range(acc['count'])]

col = Image.open(color).convert('RGB')
W, H = col.size
pc = col.load()

# La corona: se saca de la geometría, porque en el mapa no está en un rincón sino desperdigada.
alto = Image.new('L', (W, H), 0)
if CORONA is not None:
    lapiz = ImageDraw.Draw(alto)
    prim = j['meshes'][0]['primitives'][0]
    pos = lee(prim['attributes']['POSITION'])
    uv = lee(prim['attributes']['TEXCOORD_0'])
    idx = [v[0] for v in lee(prim['indices'])]
    ys = [p[1] for p in pos]
    corte = min(ys) + (max(ys) - min(ys)) * CORONA
    n = 0
    for k in range(0, len(idx), 3):
        tri = idx[k:k+3]
        if any(pos[v][1] < corte for v in tri):
            continue
        lapiz.polygon([((uv[v][0] % 1.0)*(W-1), (uv[v][1] % 1.0)*(H-1)) for v in tri], fill=255)
        n += 1
    alto = alto.filter(ImageFilter.MaxFilter(5))
    print(f'corona: {n} triángulos por encima de {corte:.3f}')
pa = alto.load()

# La franja de la cara y el pelo, sacada de la geometría igual que la corona. Hace falta porque ahí
# el color no separa nada: el pelo de un rey cano es del mismo gris que su corona de plata, y la piel
# pálida se cuela por debajo del cerrojo de la carne. Por altura sí se separan, porque la corona está
# por encima de la cabeza y la armadura, por debajo.
cara = Image.new('L', (W, H), 0)
if CABEZA is not None:
    lapiz2 = ImageDraw.Draw(cara)
    prim2 = j['meshes'][0]['primitives'][0]
    pos2 = lee(prim2['attributes']['POSITION'])
    uv2 = lee(prim2['attributes']['TEXCOORD_0'])
    idx2 = [v[0] for v in lee(prim2['indices'])]
    ys2 = [q[1] for q in pos2]
    bajo2, alto2 = min(ys2), max(ys2)
    desde = bajo2 + (alto2 - bajo2) * CABEZA[0]
    hasta = bajo2 + (alto2 - bajo2) * CABEZA[1]
    n2 = 0
    for k2 in range(0, len(idx2), 3):
        tri2 = idx2[k2:k2+3]
        if any(pos2[v][1] < desde or pos2[v][1] > hasta for v in tri2):
            continue
        lapiz2.polygon([((uv2[v][0] % 1.0)*(W-1), (uv2[v][1] % 1.0)*(H-1)) for v in tri2], fill=255)
        n2 += 1
    cara = cara.filter(ImageFilter.MaxFilter(3))
    print(f'cara y pelo: {n2} triángulos entre {desde:.3f} y {hasta:.3f}, sin metal')
pcara = cara.load()

# El relieve: cada téxel contra su entorno emborronado. Lo que sobresale, brilla.
if RELIEVE is not None:
    gris = col.convert('L')
    pg = gris.load()
    pl = gris.filter(ImageFilter.GaussianBlur(7)).load()

def rampa(x, a, b):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)

orm = Image.new('RGB', (W, H), (255, int(MATE*255), 0))
po = orm.load()
cuenta = {'corona': 0, 'oro': 0, 'relieve': 0}
for y in range(H):
    for x in range(W):
        r, g, bb = pc[x, y]
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, bb/255)
        # La piel nunca es metal, por mucho que brille o sobresalga. Aquí la máscara se aprieta más
        # que en el resto de herramientas: la de siempre llega hasta el amarillo, y el ORO es
        # amarillo. Se queda en el naranja rojizo de la carne (por debajo del tono 0,09) y con la
        # saturación de la carne; el oro, más amarillo y más saturado, pasa de largo.
        if h < 0.09 and 0.10 < s < 0.58 and v > 0.08:
            continue
        if pcara[x, y]:
            continue  # la cara y el pelo, nunca
        cual = None
        if CORONA is not None and pa[x, y] and v > 0.18:
            cual = 'corona'
        elif ORO and 0.06 < h < 0.18 and s > 0.30 and v > 0.22:
            cual = 'oro'
        elif RELIEVE is not None and v > 0.32 and (pg[x, y] - pl[x, y]) > RELIEVE:
            cual = 'relieve'
        if not cual:
            continue
        cuenta[cual] += 1
        po[x, y] = (255, int(RUGOSO*255 + 0.5), int(METAL*255 + 0.5))
total = W * H
print('metal: ' + ', '.join(f'{k} {100*n/total:.1f}%' for k, n in cuenta.items() if n))

tmp = pathlib.Path('/tmp/_adornos_orm.png')
orm.save(tmp)
mat = j['materials'][0]
pbr = mat['pbrMetallicRoughness']
if 'metallicRoughnessTexture' not in pbr:
    hueco = next(i for i, t in enumerate(j['textures']) if i != pbr.get('baseColorTexture', {}).get('index'))
    pbr['metallicRoughnessTexture'] = {'index': hueco}
tex = pbr['metallicRoughnessTexture']['index']
im = j['images'][j['textures'][tex]['source']]
bv = j['bufferViews'][im['bufferView']]
nueva = tmp.read_bytes()
inicio, largo = bv.get('byteOffset', 0), bv['byteLength']
delta = len(nueva) - largo
binario[inicio:inicio+largo] = nueva
bv['byteLength'] = len(nueva)
im['mimeType'] = 'image/png'
for otra in j['bufferViews']:
    if otra is not bv and otra.get('byteOffset', 0) > inicio:
        otra['byteOffset'] = otra.get('byteOffset', 0) + delta
pbr['metallicFactor'] = 1
pbr['roughnessFactor'] = 1
j['buffers'][0]['byteLength'] = len(binario)

def rellena(x, relleno=b'\x00'):
    return x + relleno * ((4 - len(x) % 4) % 4)
txt = rellena(json.dumps(j, separators=(',', ':')).encode(), b' ')
bina = rellena(bytes(binario))
out = bytearray(b'glTF' + struct.pack('<II', 2, 12+8+len(txt)+8+len(bina)))
out += struct.pack('<II', len(txt), 0x4E4F534A) + txt
out += struct.pack('<II', len(bina), 0x004E4942) + bina
pathlib.Path(salida).write_bytes(bytes(out))
print(f'{salida} ({len(out)/1e6:.2f} MB)')
