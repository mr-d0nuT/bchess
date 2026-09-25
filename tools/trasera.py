import json, struct, pathlib, sys, colorsys, math
from PIL import Image, ImageDraw, ImageFilter

# Pinta la ESPALDA de una prenda de otro color, dejando sus adornos como están.
#
# La reina negra salió con la capa gris acero por delante y roja por detrás: Tripo pintó cada cara
# por su lado y no se pusieron de acuerdo. Desde atrás quedaba una masa roja plana, porque el forro
# de dentro también es rojo, y encima la dejaba fuera de su bando (sus peones son gris carbón con
# el rojo de detalle, no al revés).
#
# Distinguir el fuera del dentro no se puede hacer por color —los dos son rojos— ni por sitio: hay
# que mirar hacia dónde MIRA cada triángulo. Los que dan la espalda son la cara de fuera; los que
# miran al frente son el forro. De ahí sale una máscara en el mapa, y dentro de ella solo se toca
# lo rojo: la filigrana dorada tiene otro tono y no se entera.
#
# El brillo de cada téxel se respeta y solo se reescala, para que los pliegues y el relieve sigan
# ahí en vez de quedar una mancha plana.
#
# Uso: trasera.py <modelo.glb> <color.jpg> <salida.jpg> <tono,sat,val> [techo] [--todo]
#   sin --todo, solo se repinta lo ROJO de la espalda (el caso de la reina negra);
#   con --todo, se repinta toda la espalda salvo la piel, el pelo y los adornos dorados, que es lo
#   que hace falta cuando la prenda ya es del color que sea y solo hay que cambiárselo.
modelo, color, salida = sys.argv[1], sys.argv[2], sys.argv[3]
TONO, SAT, VAL = (float(x) for x in sys.argv[4].split(','))
TECHO = float(sys.argv[5]) if len(sys.argv) > 5 else 0.90  # por encima de esto es la corona: no se toca
TODO = '--todo' in sys.argv

b = pathlib.Path(modelo).read_bytes()
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(b[20:20+njson]); off = 20 + njson
binario = b[off+8:off+8+struct.unpack_from('<I', b, off)[0]]
TIPOS={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
CUENTA={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def lee(i):
    acc=j['accessors'][i]; fmt,tam=TIPOS[acc['componentType']]; c=CUENTA[acc['type']]
    bv=j['bufferViews'][acc['bufferView']]; base=bv.get('byteOffset',0)+acc.get('byteOffset',0)
    paso=bv.get('byteStride') or tam*c
    return [struct.unpack_from('<'+fmt*c, binario, base+k*paso) for k in range(acc['count'])]

prim = j['meshes'][0]['primitives'][0]
pos = lee(prim['attributes']['POSITION'])
nor = lee(prim['attributes']['NORMAL'])
uv = lee(prim['attributes']['TEXCOORD_0'])
idx = [v[0] for v in lee(prim['indices'])]

# Hacia dónde mira la figura: se lo preguntamos a sus pies, que los dedos van delante del tobillo.
def inversa(m):
    a=[[m[c*4+f] for c in range(4)] for f in range(4)]
    aug=[a[i][:]+[1.0 if i==k else 0.0 for k in range(4)] for i in range(4)]
    for col in range(4):
        piv=max(range(col,4), key=lambda r: abs(aug[r][col])); aug[col],aug[piv]=aug[piv],aug[col]
        d=aug[col][col]; aug[col]=[x/d for x in aug[col]]
        for r in range(4):
            if r!=col and aug[r][col]:
                f=aug[r][col]; aug[r]=[x-f*y for x,y in zip(aug[r],aug[col])]
    return [[aug[i][4+k] for k in range(4)] for i in range(4)]
sk=j['skins'][0]
nombres={i:(j['nodes'][nj].get('name') or '') for i,nj in enumerate(sk['joints'])}
ibm=lee(sk['inverseBindMatrices'])
sitio={i:(lambda inv:(inv[0][3],inv[1][3],inv[2][3]))(inversa(m)) for i,m in enumerate(ibm)}
def hueso(sufijo):
    return sitio[next(i for i,n in nombres.items() if n.endswith(sufijo))]
dedo, tobillo = hueso('LeftToe_End'), hueso('LeftFoot')
frente = [dedo[0]-tobillo[0], 0.0, dedo[2]-tobillo[2]]
largo = math.hypot(frente[0], frente[2]) or 1.0
frente = [frente[0]/largo, 0.0, frente[2]/largo]
print(f'mira hacia ({frente[0]:+.2f}, {frente[2]:+.2f})')

col = Image.open(color).convert('RGB')
W, H = col.size
mascara = Image.new('L', (W, H), 0)
lapiz = ImageDraw.Draw(mascara)
pintados = 0
for k in range(0, len(idx), 3):
    tri = idx[k:k+3]
    if max(pos[v][1] for v in tri) > TECHO:
        continue
    n = [sum(nor[v][c] for v in tri)/3 for c in range(3)]
    if n[0]*frente[0] + n[2]*frente[2] > -0.25:  # no da la espalda: es forro o costado
        continue
    lapiz.polygon([((uv[v][0] % 1.0)*(W-1), (uv[v][1] % 1.0)*(H-1)) for v in tri], fill=255)
    pintados += 1
mascara = mascara.filter(ImageFilter.MaxFilter(5))
print(f'{pintados} triángulos de espalda')

pc = col.load(); pm = mascara.load()
rojos = []
for y in range(H):
    for x in range(W):
        if not pm[x, y]: continue
        r, g, bb = pc[x, y]
        h, s, v = colorsys.rgb_to_hsv(r/255, g/255, bb/255)
        if TODO:
            piel = h < 0.09 and 0.12 < s < 0.58 and v > 0.10
            oro = 0.06 < h < 0.18 and s > 0.30 and v > 0.22
            if not piel and not oro and v > 0.04:
                rojos.append((x, y, v))
        elif (h < 0.045 or h > 0.93) and s > 0.28 and v > 0.05:
            rojos.append((x, y, v))
if not rojos:
    raise SystemExit('en la espalda no hay nada que cambiar')
medio = sum(v for _, _, v in rojos)/len(rojos)
escala = VAL/medio
print(f'{len(rojos)/1000:.0f}k téxeles de espalda, brillo medio {medio:.3f} -> {VAL:.3f}')
for x, y, v in rojos:
    r2, g2, b2 = colorsys.hsv_to_rgb(TONO, SAT, max(0.0, min(1.0, v*escala)))
    pc[x, y] = (int(r2*255+0.5), int(g2*255+0.5), int(b2*255+0.5))
col.save(salida, quality=95)
print(f'-> {salida}')
