import json, struct, pathlib, sys, math

# Descose del esqueleto la tela que el aparejo automático cosió a las piernas.
#
# Tripo apareja por cercanía: como la falda y la capa caen justo al lado de los muslos, les pone el
# peso de los muslos. Carne y tela acaban siendo lo mismo, y por eso en cuanto la reina daba un paso
# el vestido se abría en canal. No hay manera de animarla así.
#
# El arreglo es geométrico: la pierna es un tubo, y lo que está dentro del tubo es pierna. Cada
# vértice que cuelga de una pierna pero cae más lejos del eje que el grosor de una pierna (RADIO)
# es tela; su peso se pasa entero a la cadera. Las piernas se mueven por dentro y la falda cuelga.
#
# Uso: descose.py <entrada.glb> <salida.glb> [radio]
entrada, salida = sys.argv[1], sys.argv[2]
RADIO = float(sys.argv[3]) if len(sys.argv) > 3 else 0.075

b = bytearray(pathlib.Path(entrada).read_bytes())
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(bytes(b[20:20+njson]))
inicio_bin = 20 + njson + 8
TIPOS = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
CUENTA = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def sitio_de(i):
    return i

def lee(idx):
    acc=j['accessors'][idx]; fmt,tam=TIPOS[acc['componentType']]; n=CUENTA[acc['type']]
    bv=j['bufferViews'][acc['bufferView']]; base=bv.get('byteOffset',0)+acc.get('byteOffset',0)
    paso=bv.get('byteStride') or tam*n
    dir0 = inicio_bin + base
    return [(dir0+k*paso, struct.unpack_from('<'+fmt*n, b, dir0+k*paso)) for k in range(acc['count'])], fmt, n

def inversa(m):
    a=[[m[c*4+f] for c in range(4)] for f in range(4)]
    aug=[a[i][:]+[1.0 if i==k else 0.0 for k in range(4)] for i in range(4)]
    for col in range(4):
        piv=max(range(col,4), key=lambda r: abs(aug[r][col]))
        aug[col],aug[piv]=aug[piv],aug[col]
        d=aug[col][col]; aug[col]=[x/d for x in aug[col]]
        for r in range(4):
            if r!=col and aug[r][col]:
                f=aug[r][col]; aug[r]=[x-f*y for x,y in zip(aug[r],aug[col])]
    return [[aug[i][4+k] for k in range(4)] for i in range(4)]

sk=j['skins'][0]; nodos=j['nodes']
nombres={i:(nodos[nj].get('name') or '') for i,nj in enumerate(sk['joints'])}
ibm,_,_ = lee(sk['inverseBindMatrices'])
sitio={i: (lambda inv: (inv[0][3], inv[1][3], inv[2][3]))(inversa(m)) for i,(_,m) in enumerate(ibm)}
CADERA=[i for i,n in nombres.items() if n.endswith('Hips')][0]

# La cadena de cada pierna, de la cadera al dedo, como una polilínea.
def cadena(lado):
    orden=['UpLeg','Leg','Foot','ToeBase','Toe_End']
    out=[]
    for parte in orden:
        for i,n in nombres.items():
            if n.endswith(lado+parte): out.append(i)
    return out
piernas=[cadena('Left'), cadena('Right')]
DE_PIERNA={i for c in piernas for i in c}

# Los brazos, con su propia cadena y su propio destino. Las figuras se generan en cruz —es la pose
# que pide el aparejo automático— y una capa que cae por la espalda pasa justo por debajo de los
# brazos abiertos, así que se la cosen a los hombros. Al bajarlos a una pose de reposo, la capa se
# va con ellos y se parte en cuchillos. Esa tela se pasa a la espalda alta, que es de donde cuelga
# una capa de verdad.
def cadena_brazo(lado):
    out = []
    for parte in ('Shoulder', 'Arm', 'ForeArm', 'Hand'):
        for i, n in nombres.items():
            if n.endswith(lado + parte):
                out.append(i)
    return out

brazos = [cadena_brazo('Left'), cadena_brazo('Right')]
DE_BRAZO = {i for c in brazos for i in c}
ESPALDA = next((i for i, n in nombres.items() if n.endswith('Spine2')),
               next((i for i, n in nombres.items() if n.endswith('Spine1')), CADERA))
RADIO_BRAZO = RADIO * 0.8  # un brazo es más delgado que una pierna
print('brazos:', [[nombres[i] for i in c] for c in brazos])
print('piernas:', [[nombres[i] for i in c] for c in piernas])

def dist_polilinea(p, cad):
    mejor=1e9
    for a_i,b_i in zip(cad, cad[1:]):
        a,q=sitio[a_i],sitio[b_i]
        ab=[q[k]-a[k] for k in range(3)]; ap=[p[k]-a[k] for k in range(3)]
        ll=sum(x*x for x in ab)
        t=0.0 if ll==0 else max(0.0,min(1.0,sum(ap[k]*ab[k] for k in range(3))/ll))
        d=math.sqrt(sum((ap[k]-ab[k]*t)**2 for k in range(3)))
        mejor=min(mejor,d)
    return mejor

prim=j['meshes'][0]['primitives'][0]
pos,_,_ = lee(prim['attributes']['POSITION'])
jo, jfmt, _ = lee(prim['attributes']['JOINTS_0'])
we, wfmt, _ = lee(prim['attributes']['WEIGHTS_0'])
if wfmt != 'f':
    raise SystemExit('los pesos no son float; habría que desnormalizar')

def descoser(p, jj, ww, miembros, cadenas, radio, destino):
    """El peso que este vértice tiene en esos miembros se pasa a `destino`, si el vértice cae fuera
    del tubo del miembro (o sea, si es tela y no carne). Devuelve (pesos, huesos) o None."""
    if not any(ww[k] > 0 and jj[k] in miembros for k in range(4)):
        return None
    if min(dist_polilinea(p, c) for c in cadenas) <= radio:
        return None
    nj = list(jj); nw = list(ww); suelto = 0.0
    for k in range(4):
        if jj[k] in miembros and ww[k] > 0:
            suelto += ww[k]; nw[k] = 0.0; nj[k] = destino
    for k in range(4):
        if nj[k] == destino:
            nw[k] += suelto; suelto = 0.0; break
    s = sum(nw)
    return ([x/s for x in nw], nj) if s > 0 else None

tela = carne = telabrazo = 0
for (pdir, p), (jdir, jj), (wdir, ww) in zip(pos, jo, we):
    nj, nw = list(jj), list(ww)
    hecho = descoser(p, nj, nw, DE_PIERNA, piernas, RADIO, CADERA)
    if hecho:
        nw, nj = hecho
        tela += 1
    elif any(ww[k] > 0 and jj[k] in DE_PIERNA for k in range(4)):
        carne += 1
    hecho = descoser(p, nj, nw, DE_BRAZO, brazos, RADIO_BRAZO, ESPALDA)
    if hecho:
        nw, nj = hecho
        telabrazo += 1
    if nj == list(jj) and nw == list(ww):
        continue
    struct.pack_into('<' + jfmt*4, b, jdir, *nj)
    struct.pack_into('<ffff', b, wdir, *nw)
print(f'{tela} vértices de tela descosidos de las piernas ({carne} se quedan: piernas y zapatos)')
print(f'{telabrazo} vértices de tela descosidos de los brazos, a la espalda alta')
print('->', salida)
