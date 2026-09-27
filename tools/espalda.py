#!/usr/bin/env python3
# Arregla la espalda del rey blanco después de teñirle la capa (`tinta.py`). Tres cosas, que el usuario
# vio desde detrás:
#
#  1. Las HOMBRERAS, medio pintadas de blanco hueso. Son placas de metal, pero su mitad de dentro cae
#     detrás de la línea de los hombros y colgada de la espalda, que es justo lo que `tinta.py` toma por
#     capa. Se distinguen por el color que tenían antes de teñir: la tela de la capa era gris violácea
#     y algo saturada; el metal de las placas, gris casi neutro. Por encima de la línea de los hombros,
#     lo teñido que era metal recupera sus téxeles originales.
#  2. El CUELLO de la capa, que se quedó gris metálico: esa tela cuelga del cuello, no de los huesos de
#     capa ni de la espalda, y el tinte no la vio. Lo que hay detrás, bajo el pelo, y era tela violácea,
#     se tiñe.
#  3. Un RECTÁNGULO AZUL en el centro de la capa: tela que cuelga de la cadera. Se tiñe.
#
# Lo teñido aquí se lleva al tono y la saturación de la capa y a su brillo medio, conservando el relieve
# de cada téxel (como `tinta.py`), para que no se note el parche.
#
# Uso: espalda.py <modelo.glb> <teñida.jpg> <original.jpg> <salida.jpg> <tono,sat,val> [marcas.json]
#   `marcas.json`, si se da, guarda qué triángulos cayeron en cada arreglo, para comprobarlo.
import colorsys, json, math, pathlib, struct, sys
from PIL import Image, ImageDraw, ImageFilter

modelo, tenida, original, salida = sys.argv[1:5]
TONO, SAT, VAL = (float(x) for x in sys.argv[5].split(','))
MARCAS = sys.argv[6] if len(sys.argv) > 6 else None

HOMBROS = 0.735      # altura (fracción de la figura) de la línea de los hombros
CUELLO_ANCHO = 0.045 # medio ancho del cuello de la capa, entre las dos hombreras
CUELLO_TOPE = 0.845  # por encima empieza el pelo
PLACA_SAT = 0.11     # saturación original por debajo de la cual era metal, no tela
RECT = (0.45, 0.72, 0.05)  # alturas y medio ancho donde está el rectángulo azul

b = pathlib.Path(modelo).read_bytes()
n = struct.unpack_from('<I', b, 12)[0]; j = json.loads(b[20:20+n]); off = 20 + n
binario = b[off+8:off+8+struct.unpack_from('<I', b, off)[0]]
TIPOS = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
CUENTA = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def lee(i):
    a = j['accessors'][i]; f, t = TIPOS[a['componentType']]; c = CUENTA[a['type']]
    bv = j['bufferViews'][a['bufferView']]; base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    paso = bv.get('byteStride') or t*c
    return [struct.unpack_from('<'+f*c, binario, base+k*paso) for k in range(a['count'])]

prim = j['meshes'][0]['primitives'][0]
pos = lee(prim['attributes']['POSITION']); uv = lee(prim['attributes']['TEXCOORD_0'])
idx = [v[0] for v in lee(prim['indices'])]
ys = [p[1] for p in pos]; bajo, alto = min(ys), max(ys)
# Hacia dónde mira: la figura sale de Tripo mirando a +Z.
FRENTE = (0.0, 0.0, 1.0)

col = Image.open(tenida).convert('RGB'); W, H = col.size; pc = col.load()
org = Image.open(original).convert('RGB'); po = org.load()
hsv = lambda c: colorsys.rgb_to_hsv(c[0]/255, c[1]/255, c[2]/255)
def hueso(c):  # ¿ya está teñido del color de la capa?
    h, s, v = hsv(c); return abs(h - TONO) < 0.05 and abs(s - SAT) < 0.08 and v > 0.3
def tela(c):  # ¿era tela de la capa (gris violáceo) antes de teñir?
    h, s, v = hsv(c); return 0.6 <= h <= 0.8 and s >= 0.06

def texel(p):
    return int((p[0] % 1.0) * (W-1)), int((p[1] % 1.0) * (H-1))

tenir, restaurar = [], []
for k in range(0, len(idx), 3):
    tri = idx[k:k+3]
    P = [pos[v] for v in tri]
    cen = [sum(p[i] for p in P)/3 for i in range(3)]
    e1 = [P[1][i]-P[0][i] for i in range(3)]; e2 = [P[2][i]-P[0][i] for i in range(3)]
    nrm = [e1[1]*e2[2]-e1[2]*e2[1], e1[2]*e2[0]-e1[0]*e2[2], e1[0]*e2[1]-e1[1]*e2[0]]
    L = math.sqrt(sum(x*x for x in nrm)) or 1
    atras = -(nrm[0]*FRENTE[0] + nrm[1]*FRENTE[1] + nrm[2]*FRENTE[2]) / L  # 1: mira justo atrás
    h = (cen[1] - bajo) / (alto - bajo)
    x = abs(cen[0])
    u = sum(uv[v][0] for v in tri)/3; w = sum(uv[v][1] for v in tri)/3
    ahora, antes = pc[texel((u, w))], po[texel((u, w))]
    if h >= HOMBROS and x >= CUELLO_ANCHO and hueso(ahora) and hsv(antes)[1] <= PLACA_SAT:
        restaurar.append(k // 3)   # 1. hombrera
    elif atras > 0.1 and x < CUELLO_ANCHO and HOMBROS <= h <= CUELLO_TOPE and not hueso(ahora) and tela(antes):
        tenir.append(k // 3)       # 2. cuello de la capa
    elif atras > 0.2 and RECT[0] <= h <= RECT[1] and x < RECT[2] and not hueso(ahora):
        hh, ss, vv = hsv(ahora)
        if 0.55 <= hh <= 0.8 and ss > 0.12:
            tenir.append(k // 3)   # 3. el rectángulo azul
print(f'{len(restaurar)} triángulos de hombrera vuelven a su metal; {len(tenir)} de capa se tiñen')
if MARCAS:
    json.dump({'restaurar': restaurar, 'tenir': tenir}, open(MARCAS, 'w'))

def mascara(tris):
    m = Image.new('L', (W, H), 0); lapiz = ImageDraw.Draw(m)
    for t in tris:
        tri = idx[t*3:t*3+3]
        lapiz.polygon([((uv[v][0] % 1.0)*(W-1), (uv[v][1] % 1.0)*(H-1)) for v in tri], fill=255)
    return m.filter(ImageFilter.MaxFilter(5)).load()  # margen, por las costuras del mapa

mr, mt = mascara(restaurar), mascara(tenir)
tocar = [(x, y) for y in range(H) for x in range(W) if mt[x, y] and not mr[x, y]]
medio = sum(hsv(po[x, y])[2] for x, y in tocar) / max(1, len(tocar))
escala = VAL / medio if medio > 0 else 1.0
for x, y in tocar:
    v = hsv(po[x, y])[2]
    r, g, bb = colorsys.hsv_to_rgb(TONO, SAT, max(0.0, min(1.0, v * escala)))
    pc[x, y] = (int(r*255+0.5), int(g*255+0.5), int(bb*255+0.5))
n = 0
for y in range(H):
    for x in range(W):
        if mr[x, y]:
            pc[x, y] = po[x, y]; n += 1
print(f'{len(tocar)//1000}k téxeles teñidos (brillo medio {medio:.2f} -> {VAL}), {n//1000}k devueltos a su metal')
col.save(salida, quality=95)
print(f'-> {salida}')
