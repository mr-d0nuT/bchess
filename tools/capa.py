import json, struct, pathlib, sys, math

# Le pone a la capa huesos propios, que es lo único que permite que se mueva como tela.
#
# El aparejo de Tripo la había cosido a las piernas (ver `descose.py`): eso la rompía. Descosida y
# colgada de la cadera ya no se rompe, pero va tiesa, como una plancha pegada al culo. Para que se
# mueva de verdad hace falta que tenga de dónde: una cadena de tres huesos que baja por detrás, de
# la cadera al suelo. Girando el primero se mueve toda; girando también los de abajo, la capa se
# curva en vez de bascular en bloque. El vaivén se lo pone luego el juego, con un muelle.
#
# Cada vértice de la capa reparte su peso entre los DOS huesos más cercanos de la cadena, según a
# qué altura esté: si se colgara de uno solo, se vería el pliegue donde acaba uno y empieza el otro.
#
# Y se lleva SOLO la tela, no todo lo que cuelgue de la cadera. Esto no es un detalle: hay figuras a
# las que el aparejo automático no les cosió la capa a las piernas —se la dejó en la columna—, y en
# esas `descose.py` no tiene nada que soltar. Si aquí se cogiera todo lo de la cadera, lo que se
# subiría a los huesos de capa sería el peto y el faldón de la armadura, que se quedarían colgando
# de una capa que no llevan. Pasó con el rey negro y se veía: la capa partida en cuchillos.
#
# La tela se reconoce igual que en `descose.py`: es lo que cae LEJOS del eje de las piernas. Un peto
# está pegado al cuerpo; una capa, no.
#
# Y se la quita a quien la tenga, no solo a la cadera. Cada figura viene cosida a su manera: al rey
# blanco le colgaron la capa de las piernas y al negro, de la columna. Mirando solo la cadera, al
# negro no se le tocaba la capa y en cambio sí su faldón, que es lo contrario de lo que hace falta.
#
# Solo la parte de abajo, eso sí: de la cintura para arriba la capa tiene que seguir colgando de los
# hombros, que es de donde cuelga una capa. Lo que se sube a la cadena es el vuelo.
#
# Uso: capa.py <entrada.glb> <salida.glb> [radio_pierna]
#   `radio_pierna`: lo que mide de gordo una pierna. Lo que cuelga de la cadera y cae más lejos que
#   eso del eje de las piernas es tela; lo que cae más cerca, cuerpo o armadura, y se queda.
entrada, salida = sys.argv[1], sys.argv[2]
RADIO = float(sys.argv[3]) if len(sys.argv) > 3 else 0.075
ALTURAS = [0.52, 0.35, 0.18]  # dónde está el eje de cada hueso, de arriba abajo

b = pathlib.Path(entrada).read_bytes()
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(b[20:20+njson])
off = 20 + njson
binario = bytearray(b[off+8:off+8+struct.unpack_from('<I', b, off)[0]])
TIPOS = {5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}
CUENTA = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}

def sitio_acc(idx):
    acc = j['accessors'][idx]; fmt, tam = TIPOS[acc['componentType']]; c = CUENTA[acc['type']]
    bv = j['bufferViews'][acc['bufferView']]
    base = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    paso = bv.get('byteStride') or tam * c
    return base, paso, fmt, c, acc['count']

def lee(idx):
    base, paso, fmt, c, n = sitio_acc(idx)
    return [(base + k*paso, struct.unpack_from('<'+fmt*c, bytes(binario), base + k*paso)) for k in range(n)]

def inversa(m):  # m viene por columnas, como en glTF
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

def por_columnas(fil):  # de filas a la lista por columnas que quiere glTF
    return [fil[f][c] for c in range(4) for f in range(4)]

sk = j['skins'][0]
nodos = j['nodes']
nombres = {i: (nodos[nj].get('name') or '') for i, nj in enumerate(sk['joints'])}
ibm = [m for _, m in lee(sk['inverseBindMatrices'])]
mundo = [inversa(m) for m in ibm]  # matriz de enlace de cada hueso, en el espacio de la malla
CADERA = next(i for i, n in nombres.items() if n.endswith('Hips'))
cadera_nodo = sk['joints'][CADERA]
cx, cz = mundo[CADERA][0][3], mundo[CADERA][2][3]
print(f'cadera en x={cx:.3f} z={cz:.3f}, y={mundo[CADERA][1][3]:.3f}')

# Los tres huesos nuevos, en cadena, cada uno colgando del anterior. Se colocan sin girar (ejes del
# modelo), y su transformación local sale de descontar la del padre.
nuevos = []
padre_mundo = mundo[CADERA]
padre_nodo = cadera_nodo
for k, y in enumerate(ALTURAS):
    hijo = [[1.0 if f == c else 0.0 for c in range(4)] for f in range(4)]
    hijo[0][3], hijo[1][3], hijo[2][3] = cx, y, cz
    local = [[sum(inversa(por_columnas(padre_mundo))[f][t] * hijo[t][c] for t in range(4)) for c in range(4)] for f in range(4)]
    nodos.append({'name': f'Capa{k+1}', 'matrix': por_columnas(local)})
    indice = len(nodos) - 1
    nodos[padre_nodo].setdefault('children', []).append(indice)
    sk['joints'].append(indice)
    ibm.append(por_columnas(inversa(por_columnas(hijo))))
    mundo.append(hijo)
    nuevos.append(len(sk['joints']) - 1)
    padre_mundo, padre_nodo = hijo, indice
print('huesos nuevos:', [nodos[sk["joints"][i]]["name"] for i in nuevos], '->', nuevos)

# Las matrices de enlace ya no caben donde estaban: se escriben al final del búfer, en su sitio nuevo.
while len(binario) % 4:
    binario.append(0)
inicio_ibm = len(binario)
for m in ibm:
    binario += struct.pack('<16f', *m)
j['bufferViews'].append({'buffer': 0, 'byteOffset': inicio_ibm, 'byteLength': len(ibm)*64})
j['accessors'].append({'bufferView': len(j['bufferViews'])-1, 'componentType': 5126,
                       'count': len(ibm), 'type': 'MAT4'})
sk['inverseBindMatrices'] = len(j['accessors']) - 1

# La cadena de cada pierna, de la cadera al dedo, como una polilínea; y la distancia de un punto a
# ella. Es la misma medida con la que `descose.py` distingue la tela del cuerpo.
def cadena(lado):
    out = []
    for parte in ('UpLeg', 'Leg', 'Foot', 'ToeBase', 'Toe_End'):
        for i, n in nombres.items():
            if n.endswith(lado + parte):
                out.append(i)
    return out

piernas = [cadena('Left'), cadena('Right')]

# Dónde está un hueso en la postura de enlace: la traslación de su matriz.
def donde(i):
    m = mundo[i]
    return (m[0][3], m[1][3], m[2][3])

def dist_polilinea(p, cad):
    mejor = 1e9
    for a_i, b_i in zip(cad, cad[1:]):
        a, q = donde(a_i), donde(b_i)
        ab = [q[k]-a[k] for k in range(3)]
        ap = [p[k]-a[k] for k in range(3)]
        ll = sum(x*x for x in ab)
        t = 0.0 if ll == 0 else max(0.0, min(1.0, sum(ap[k]*ab[k] for k in range(3))/ll))
        mejor = min(mejor, math.sqrt(sum((ap[k]-ab[k]*t)**2 for k in range(3))))
    return mejor

# Y ahora el reparto: cada vértice de la capa cuelga de los dos huesos entre los que cae.
prim = j['meshes'][0]['primitives'][0]
pos = lee(prim['attributes']['POSITION'])
jo = lee(prim['attributes']['JOINTS_0'])
we = lee(prim['attributes']['WEIGHTS_0'])
jfmt = TIPOS[j['accessors'][prim['attributes']['JOINTS_0']]['componentType']][0]
arriba, abajo = ALTURAS[0], ALTURAS[-1]
paso = (arriba - abajo) / (len(ALTURAS) - 1)
repartidos = 0
# De quién se le puede quitar: la cadera y el tronco. De los brazos y la cabeza, no.
TRONCO = {i for i, n in nombres.items()
          if n.endswith('Hips') or n.endswith('Spine') or n.endswith('Spine1') or n.endswith('Spine2')}
ARRIBA = ALTURAS[0]  # de aquí para arriba la capa sigue colgando de los hombros

descartados = 0
for (_, p), (jdir, jj), (wdir, ww) in zip(pos, jo, we):
    suelto = sum(ww[k] for k in range(4) if jj[k] in TRONCO)
    if suelto <= 0.001:
        continue
    if p[1] > ARRIBA or min(dist_polilinea(p, c) for c in piernas) <= RADIO:
        descartados += 1  # pegado al cuerpo, o por encima de la cintura: no es vuelo de capa
        continue
    u = max(0.0, min(len(ALTURAS) - 1.0001, (arriba - p[1]) / paso))
    i = int(u); f = u - i
    reparto = {nuevos[i]: suelto * (1 - f)}
    if f > 0:
        reparto[nuevos[i+1]] = suelto * f
    nj = list(jj); nw = list(ww)
    for k in range(4):
        if jj[k] in TRONCO:
            nw[k] = 0.0
    for hueso, peso in reparto.items():
        hecho = False
        for k in range(4):
            if nw[k] <= 0.0:
                nj[k] = hueso; nw[k] = peso; hecho = True; break
        if not hecho:  # no cabe: se lo come el más flojo
            k = min(range(4), key=lambda q: nw[q])
            nj[k] = hueso; nw[k] = peso
    s = sum(nw)
    if s > 0:
        nw = [x/s for x in nw]
    struct.pack_into('<'+jfmt*4, binario, jdir, *nj)
    struct.pack_into('<ffff', binario, wdir, *nw)
    repartidos += 1
print(f'{repartidos} vértices de capa repartidos entre los tres huesos'
      f' ({descartados} se quedan en la cadera: están pegados al cuerpo)')

j['buffers'][0]['byteLength'] = len(binario)
def rellena(x, relleno=b'\x00'):
    return x + relleno * ((4 - len(x) % 4) % 4)
txt = rellena(json.dumps(j, separators=(',', ':')).encode(), b' ')
bina = rellena(bytes(binario))
out = bytearray(b'glTF' + struct.pack('<II', 2, 12+8+len(txt)+8+len(bina)))
out += struct.pack('<II', len(txt), 0x4E4F534A) + txt
out += struct.pack('<II', len(bina), 0x004E4942) + bina
pathlib.Path(salida).write_bytes(bytes(out))
print(f'{salida} ({len(out)/1e6:.2f} MB, {len(sk["joints"])} huesos)')
