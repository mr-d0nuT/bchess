import json, struct, pathlib, sys, colorsys, zlib
from PIL import Image, ImageDraw, ImageFilter

# Deja a la reina mate como los peones, pero con la CORONA de plata de verdad.
#
# El truco es saber qué trozo del mapa es la corona, y eso no se ve en la textura: el mapa de esta
# malla son miles de islas sueltas y la corona no está en un rincón, está desperdigada. Se saca de
# la geometría: los triángulos que están por encima de la frente son la corona, y cada uno se pinta
# en el mapa por sus coordenadas de textura. Dentro de esa zona solo se vuelve metal lo que además
# es plata —claro y sin color—, para que el pelo rubio, que está a la misma altura, siga siendo pelo.
#
# Uso: corona.py <modelo.glb> <color.jpg> <salida.glb> [altura] [metal] [rugosidad]
modelo, color, salida = sys.argv[1], sys.argv[2], sys.argv[3]
ALTURA = float(sys.argv[4]) if len(sys.argv) > 4 else 0.905
METAL = float(sys.argv[5]) if len(sys.argv) > 5 else 0.90
RUG_CORONA = float(sys.argv[6]) if len(sys.argv) > 6 else 0.28
RUG_MATE = 0.90
SATURACION = 0.15  # por encima de esto ya no es plata, es pelo o piel

b = bytearray(pathlib.Path(modelo).read_bytes())
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(bytes(b[20:20+njson]))
off = 20 + njson
binario = bytearray(b[off+8:off+8+struct.unpack_from('<I', b, off)[0]])
TIPOS={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
CUENTA={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
def lee(i):
    acc=j['accessors'][i]; fmt,tam=TIPOS[acc['componentType']]; c=CUENTA[acc['type']]
    bv=j['bufferViews'][acc['bufferView']]; base=bv.get('byteOffset',0)+acc.get('byteOffset',0)
    paso=bv.get('byteStride') or tam*c
    return [struct.unpack_from('<'+fmt*c, bytes(binario), base+k*paso) for k in range(acc['count'])]

prim = j['meshes'][0]['primitives'][0]
pos = lee(prim['attributes']['POSITION'])
uv = lee(prim['attributes']['TEXCOORD_0'])
idx = [v[0] for v in lee(prim['indices'])]

col = Image.open(color).convert('RGB')
W, H = col.size
mascara = Image.new('L', (W, H), 0)
lapiz = ImageDraw.Draw(mascara)
pintados = 0
for k in range(0, len(idx), 3):
    tri = idx[k:k+3]
    if any(pos[v][1] < ALTURA for v in tri):
        continue
    lapiz.polygon([((uv[v][0] % 1.0) * (W - 1), (uv[v][1] % 1.0) * (H - 1)) for v in tri], fill=255)
    pintados += 1
mascara = mascara.filter(ImageFilter.MaxFilter(5))  # un par de téxeles de margen, por las costuras
print(f'{pintados} triángulos por encima de {ALTURA} (la corona)')

pc = col.load(); pm = mascara.load()
orm = Image.new('RGB', (W, H), (255, int(RUG_MATE * 255), 0))
po = orm.load()
metalicos = 0
for y in range(H):
    for x in range(W):
        if not pm[x, y]:
            continue
        r, g, bb = pc[x, y]
        _, s, v = colorsys.rgb_to_hsv(r/255, g/255, bb/255)
        if s > SATURACION or v < 0.25:
            continue  # pelo o sombra: se queda mate
        po[x, y] = (255, int(RUG_CORONA * 255), int(METAL * 255))
        metalicos += 1
print(f'{metalicos} téxeles de plata ({100*metalicos/(W*H):.2f}% del mapa)')
tmp = pathlib.Path('comp/_orm_corona.png')
orm.save(tmp)

# Se mete el mapa nuevo donde estaba el viejo y se dejan los factores a 1, que mande el mapa. Si
# el modelo venía ya desprovisto de mapa (porque pasó por `mate.py`), se le vuelve a enganchar.
mat = j['materials'][0]
pbr = mat['pbrMetallicRoughness']
if 'metallicRoughnessTexture' not in pbr:
    hueco = next(i for i, t in enumerate(j['textures'])
                 if i != pbr.get('baseColorTexture', {}).get('index'))
    pbr['metallicRoughnessTexture'] = {'index': hueco}
tex = pbr['metallicRoughnessTexture']['index']
src = j['textures'][tex].get('source')
im = j['images'][src]
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
