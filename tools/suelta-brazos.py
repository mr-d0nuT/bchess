# Suelta de los brazos la tela que el aparejo automático les había cosido.
#
# Tripo apareja por cercanía y, además, reparte el peso por la superficie: a las reinas les colgó
# el bajo de la capa de los MEÑIQUES (hasta un 40 % en la blanca) y la espalda de la capa, de los
# hombros. Con los brazos quietos no se nota; en cuanto alza las manos para el conjuro, se lleva
# media capa con ellas, la espalda se abre y asoman el culo y las piernas.
#
# El arreglo es el de `descose.py` con las piernas: el brazo es un tubo, y lo que cae fuera del
# tubo es tela. Aquí, con dos cambios:
#
#  - Entre dos radios (`dentro` y `fuera`) se suelta solo una parte, en proporción a lo lejos que
#    caiga. Con un corte seco, la costura entre lo que sigue al brazo y lo que no se ve al alzarlo.
#  - Lo que se suelta se reparte entre los huesos que el vértice YA tenía, en su proporción: el bajo
#    de la capa sigue colgando de la cadena de la capa, que es de donde tiene que colgar, y no se
#    pega a la espalda. Solo si al vértice no le queda casi nada que no sea brazo (la espalda de la
#    capa, a la altura de los hombros) se lo lleva la columna a su altura.
#
# Uso: suelta-brazos.py <entrada.glb> <salida.glb> [dentro] [fuera]
import json, math, pathlib, struct, sys

entrada, salida = sys.argv[1], sys.argv[2]
DENTRO = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05  # hasta aquí es manga o mano: no se toca
FUERA = float(sys.argv[4]) if len(sys.argv) > 4 else 0.075  # desde aquí es tela: se suelta entero
QUEDA = 0.15  # lo mínimo que ha de tener en otros huesos para repartírselo a ellos

b = bytearray(pathlib.Path(entrada).read_bytes())
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(bytes(b[20:20 + njson]))
BIN = 20 + njson + 8
TIPOS = {5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
CUENTA = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def lee(i):
    acc = j['accessors'][i]
    fmt, tam = TIPOS[acc['componentType']]
    n = CUENTA[acc['type']]
    bv = j['bufferViews'][acc['bufferView']]
    base = BIN + bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    paso = bv.get('byteStride') or tam * n
    return [(base + k * paso, struct.unpack_from('<' + fmt * n, b, base + k * paso)) for k in range(acc['count'])], fmt


def origen(m):
    # `m` es la inversa de la matriz de ligadura; su inversa lleva el sitio del hueso.
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
    return tuple(aug[i][4 + 3] for i in range(3))


sk = j['skins'][0]
nombres = [(j['nodes'][n].get('name') or '').split(':')[-1] for n in sk['joints']]
sitio = [origen(m) for _, m in lee(sk['inverseBindMatrices'])[0]]


def hueso(nombre):
    return nombres.index(nombre) if nombre in nombres else None


def dist_cadena(p, puntos):
    mejor = 1e9
    for a, q in zip(puntos, puntos[1:]):
        ab = [q[k] - a[k] for k in range(3)]
        ap = [p[k] - a[k] for k in range(3)]
        ll = sum(x * x for x in ab)
        t = 0.0 if ll == 0 else max(0.0, min(1.0, sum(ap[k] * ab[k] for k in range(3)) / ll))
        mejor = min(mejor, math.sqrt(sum((ap[k] - ab[k] * t) ** 2 for k in range(3))))
    return mejor


# Cada brazo: sus huesos (del hombro a la punta de los dedos) y su eje, del hombro al dedo corazón.
brazos = []
for lado in ('Left', 'Right'):
    huesos = {i for i, n in enumerate(nombres) if n in (lado + 'Arm', lado + 'ForeArm') or n.startswith(lado + 'Hand')}
    punta = next(h for h in (lado + 'HandMiddle4', lado + 'HandMiddle3', lado + 'HandMiddle2', lado + 'Hand') if hueso(h) is not None)
    eje = [sitio[hueso(lado + p)] for p in ('Arm', 'ForeArm', 'Hand')] + [sitio[hueso(punta)]]
    brazos.append((huesos, eje))
DE_BRAZO = set().union(*(h for h, _ in brazos))

# La columna, de abajo arriba: a quién se le da la tela que no tiene de quién más colgar.
columna = [i for i in (hueso('Hips'), hueso('Spine'), hueso('Spine1'), hueso('Spine2')) if i is not None]


def vertebra(y):
    elegido = columna[0]
    for i in columna:
        if y >= sitio[i][1] - 0.02:
            elegido = i
    return elegido


prim = j['meshes'][0]['primitives'][0]
pos, _ = lee(prim['attributes']['POSITION'])
jo, jfmt = lee(prim['attributes']['JOINTS_0'])
we, wfmt = lee(prim['attributes']['WEIGHTS_0'])
if wfmt != 'f':
    raise SystemExit('los pesos no son float; habría que desnormalizar')

tocados = sueltos = columna_usada = 0
peso_suelto = 0.0
for (_, p), (jdir, jj), (wdir, ww) in zip(pos, jo, we):
    pesos = {}
    for jx, w in zip(jj, ww):
        if w > 0:
            pesos[jx] = pesos.get(jx, 0.0) + w
    suelto = 0.0
    for huesos, eje in brazos:
        del_brazo = [jx for jx in pesos if jx in huesos]
        if not del_brazo:
            continue
        d = dist_cadena(p, eje)
        f = max(0.0, min(1.0, (d - DENTRO) / (FUERA - DENTRO)))
        if f <= 0:
            continue
        for jx in del_brazo:
            suelto += pesos[jx] * f
            pesos[jx] *= 1 - f
    if suelto <= 1e-6:
        continue
    tocados += 1
    peso_suelto += suelto
    resto = sum(w for jx, w in pesos.items() if jx not in DE_BRAZO)
    if resto >= QUEDA:
        for jx in list(pesos):
            if jx not in DE_BRAZO:
                pesos[jx] += suelto * pesos[jx] / resto
    else:
        v = vertebra(p[1])
        pesos[v] = pesos.get(v, 0.0) + suelto
        columna_usada += 1
    if all(pesos.get(jx, 0) <= 1e-6 for jx in DE_BRAZO):
        sueltos += 1
    # Cuatro huesos como mucho, los que más pesan, y que sumen uno.
    cuatro = sorted(((w, jx) for jx, w in pesos.items() if w > 1e-6), reverse=True)[:4]
    total = sum(w for w, _ in cuatro)
    nj = [jx for _, jx in cuatro] + [0] * (4 - len(cuatro))
    nw = [w / total for w, _ in cuatro] + [0.0] * (4 - len(cuatro))
    struct.pack_into('<' + jfmt * 4, b, jdir, *nj)
    struct.pack_into('<ffff', b, wdir, *nw)

print(f'{tocados} vértices con tela cosida a los brazos ({sueltos} soltados del todo); '
      f'peso soltado de media {peso_suelto / max(1, tocados):.2f}; '
      f'{columna_usada} sin otro hueso, a la columna')
pathlib.Path(salida).write_bytes(bytes(b))
print('->', salida)
