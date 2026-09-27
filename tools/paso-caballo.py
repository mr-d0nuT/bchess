#!/usr/bin/env python3
"""Paso del caballo: escribe en un caballo aparejado su paseo («walk») y su postura de quieto («idle»).

    python3 tools/paso-caballo.py <caballo-aparejado.glb> <salida.glb>

El paseo que Tripo le pone de serie a su cuadrúpedo no sirve para este caballo. Su aparejador bautiza
los huesos por el orden en que los encuentra y no por lo que son —a la mano derecha la llamó «columna»
(Spine_4…6), a la pata trasera izquierda «mano izquierda» y a la cola «pata trasera izquierda»—, y como
su animación mueve los huesos por el nombre, la mano derecha va tiesa, la cola se mueve como una pata y
las demás pisan a destiempo y abriéndose hacia los lados.

Aquí el paseo se compone de cero a partir de lo que el esqueleto ES: las patas se reconocen por su sitio
(igual que en `src/pieces/horse-bones.js`) y cada una sigue el ciclo del caballo al paso, a cuatro
tiempos —trasera izquierda, mano izquierda, trasera derecha, mano derecha—, con cinemática inversa para
que el casco, mientras apoya, se quede clavado en el suelo y de plano, y al final ruede sobre la punta.

El caballo avanza dentro de la animación (la raíz se desplaza): el juego lo quita al cargarla y usa lo
que avanza para fijar la velocidad del paseo, así que los cascos no patinan sobre el tablero.

La postura de quieto es la del modelo, con los cuatro cascos al mismo suelo.
"""

import math
import struct
import sys

import numpy as np

from retextura import escribir, leer

# Los aires. Para cada uno: lo que dura un ciclo (cada pata pisa una vez), lo que avanza el caballo en
# él (en alturas del caballo), la fracción del ciclo que cada casco pasa en el suelo, cuándo pisa cada
# pata, lo que sube la punta del casco en el vuelo (en alturas), lo que la pata se dobla respecto a lo
# del paso, y el movimiento del cuerpo: cuánto sube y baja (en alturas), cuánto cabecea el tronco
# (grados, positivo el hocico abajo), con cuántas oscilaciones por ciclo y en qué punto del ciclo cae
# lo más bajo del cuerpo y lo más bajo del hocico; y cuánto cabecea el cuello.
AIRES = {
    # Al paso, a cuatro tiempos: trasera izquierda, mano izquierda, trasera derecha, mano derecha.
    # Siempre hay dos o tres cascos en el suelo.
    'walk': {
        'ciclo': 0.9, 'zancada': 0.6, 'apoyo': 0.62,
        'pisadas': {'backLeft': 0.0, 'frontLeft': 0.25, 'backRight': 0.5, 'frontRight': 0.75},
        'alzada': {'front': 0.055, 'back': 0.045}, 'pliegue': 1.0,
        'vaiven': (0.003, 2, 0.25), 'tronco': (0, 1, 0), 'cuello': (1.0, 2, 0.3),
    },
    # Al trote, a dos tiempos: pisan juntas las diagonales (trasera izquierda con mano derecha, y
    # trasera derecha con mano izquierda), y entre una y otra el caballo va un instante en el aire. El
    # cuerpo sube al despegar y baja en mitad del apoyo; la cabeza, casi quieta.
    'trot': {
        'ciclo': 0.62, 'zancada': 0.73, 'apoyo': 0.42,
        'pisadas': {'backLeft': 0.0, 'frontRight': 0.0, 'backRight': 0.5, 'frontLeft': 0.5},
        'alzada': {'front': 0.1, 'back': 0.075}, 'pliegue': 1.25,
        'vaiven': (0.012, 2, 0.21), 'tronco': (0, 1, 0), 'cuello': (0.3, 2, 0.21),
    },
    # Al galope corto, a tres tiempos y a mano derecha: trasera izquierda; luego trasera derecha y mano
    # izquierda casi a la vez; luego la mano derecha, que va por delante; y un tramo en el aire. El
    # cuerpo se mece: el hocico sube mientras apoyan las traseras y baja cuando apoyan las manos.
    'gallop': {
        'ciclo': 0.6, 'zancada': 1.1, 'apoyo': 0.38,
        'pisadas': {'backLeft': 0.0, 'backRight': 0.18, 'frontLeft': 0.22, 'frontRight': 0.42},
        'alzada': {'front': 0.12, 'back': 0.08}, 'pliegue': 1.3,
        'vaiven': (0.02, 1, 0.45), 'tronco': (6, 1, 0.65), 'cuello': (1.3, 1, 0.65),
    },
}
FPS = 60
DESPEGUE = 0.19  # fracción del apoyo, al final, en que el casco rueda sobre la punta
GIRO_DESPEGUE = 25  # grados que sube el talón antes de que la punta deje el suelo
# Dónde queda el centro del apoyo respecto al casco en reposo, en alturas (positivo, hacia delante):
# las manos pisan algo más atrás y las traseras algo más adelante, que si no, al final del apoyo, la
# pata tendría que estirarse más de lo que da de sí.
CENTRO = {'front': -0.05, 'back': 0.075}
CABECEO = [3, 1.5, -1.5]  # grados que baja la cabeza cada hueso del cuello en el paso (el aire los escala)
COLA = [4, 3, 2.5, 2, 1.5, 1]  # grados del vaivén de lado de la cola, del nacimiento a la punta
PIVOTE = 0.6  # a qué altura del caballo (en alturas) está el punto sobre el que se mece el cuerpo

# Cada pata tiene cinco huesos, de arriba abajo. Delante: escápula, hombro, codo, rodilla (carpo) y
# menudillo, que lleva la cuartilla y el casco. Detrás: cadera, babilla, corvejón, menudillo y casco.
# Para cada hueso: ángulo preferido y peso en el apoyo, peso en el vuelo, lo que se dobla en mitad del
# vuelo y sus topes. Los ángulos son de giro de lado (en el plano de la pata): positivo, la punta de lo
# que cuelga del hueso va hacia atrás. La rodilla de delante se dobla hacia atrás (+) y el corvejón,
# hacia delante (−); la babilla y el corvejón se mueven a la vez (el aparato recíproco del caballo).
PATAS = {
    'front': {
        'peso_apoyo': [1, 1.5, 1.5, 30, 0.3],
        'peso_vuelo': [1, 1.5, 1.5, 8, 1],
        'pliegue': [0, 0, 0, 70, 30],
        'topes': [(-35, 35), (-40, 40), (-80, 40), (-1, 110), (-60, 110)],
        # Ángulo del casco en el vuelo: sale rodado sobre la punta, se recoge con la suela mirando
        # atrás, se estira por delante y baja de plano.
        'casco': [(0, GIRO_DESPEGUE), (0.35, 85), (0.8, -5), (1, 0)],
        'recíproco': 0,
    },
    'back': {
        'peso_apoyo': [1, 1.5, 1.5, 0.3, 10],
        'peso_vuelo': [1, 3, 3, 1, 10],
        'pliegue': [0, 35, -45, 25, 0],
        'topes': [(-45, 45), (-20, 80), (-90, 30), (-60, 110), (-45, 60)],
        'casco': [(0, GIRO_DESPEGUE), (0.35, 65), (0.8, -5), (1, 0)],
        'recíproco': 2,
    },
}
PICO_PLIEGUE = 0.4  # en qué punto del vuelo está más doblada la pata
PESO_PUNTA = 2000  # la punta del casco va siempre por su camino
PESO_CASCO = 2000  # y el casco, de plano en el apoyo
PESO_CASCO_VUELO = 6  # en el vuelo, solo se le sugiere el ángulo
RAMPA = 0.25  # fracción del vuelo en que se pasa de lo del apoyo a lo del vuelo, a cada extremo

GRADOS = math.pi / 180


# --- El modelo -----------------------------------------------------------------------------------

def accesor(gltf, binario, i):
    a = gltf['accessors'][i]
    vista = gltf['bufferViews'][a['bufferView']]
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
    tipo, largo = {5126: ('f', 4), 5121: ('B', 1), 5123: ('H', 2), 5125: ('I', 4)}[a['componentType']]
    desde = vista.get('byteOffset', 0) + a.get('byteOffset', 0)
    paso = vista.get('byteStride', n * largo)
    datos = np.array([struct.unpack_from('<' + tipo * n, binario, desde + k * paso) for k in range(a['count'])], float)
    if a.get('normalized'):
        datos /= {5121: 255, 5123: 65535}[a['componentType']]
    return datos


def matriz(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def cuaternion(m):
    traza = m[0, 0] + m[1, 1] + m[2, 2]
    if traza > 0:
        s = math.sqrt(traza + 1) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, s / 4]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [s / 4, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, s / 4, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, s / 4, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q)
    return q / np.linalg.norm(q)


def giro(eje, angulo):
    x, y, z = eje / np.linalg.norm(eje)
    c, s = math.cos(angulo), math.sin(angulo)
    k = 1 - c
    return np.array([
        [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
        [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
        [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
    ])


class Esqueleto:
    def __init__(self, gltf, binario):
        self.gltf = gltf
        nodos = gltf['nodes']
        self.nombre = {i: n.get('name', str(i)) for i, n in enumerate(nodos)}
        self.padre = {c: i for i, n in enumerate(nodos) for c in n.get('children', [])}
        self.huesos = gltf['skins'][0]['joints']
        self.T = {i: np.array(n.get('translation', [0, 0, 0]), float) for i, n in enumerate(nodos)}
        self.R = {i: matriz(n.get('rotation', [0, 0, 0, 1])) for i, n in enumerate(nodos)}
        for i, n in enumerate(nodos):
            if 'matrix' in n or max(abs(s - 1) for s in n.get('scale', [1, 1, 1])) > 1e-4:
                raise SystemExit(f'el nodo {self.nombre[i]} viene escalado o con matriz: este script no lo sabe tratar')
        self.mundo = {}  # giro y posición de cada nodo en reposo, en el espacio del modelo
        for i in range(len(nodos)):
            self._mundo(i)
        self.pos = {i: self.mundo[i][1] for i in self.huesos}
        inversas = accesor(gltf, binario, gltf['skins'][0]['inverseBindMatrices'])
        self.inversas = [m.reshape(4, 4).T for m in inversas]
        error = max(np.abs(self.matriz_mundo(j) @ self.inversas[k] - np.eye(4)).max() for k, j in enumerate(self.huesos))
        if error > 1e-4:
            raise SystemExit(f'la postura de reposo no es la de enlace (error {error:.2g}): el paso saldría torcido')

    def _mundo(self, i):
        if i in self.mundo:
            return self.mundo[i]
        if i in self.padre:
            R, T = self._mundo(self.padre[i])
            self.mundo[i] = (R @ self.R[i], T + R @ self.T[i])
        else:
            self.mundo[i] = (self.R[i], self.T[i])
        return self.mundo[i]

    def matriz_mundo(self, i):
        M = np.eye(4)
        M[:3, :3], M[:3, 3] = self.mundo[i]
        return M

    def ancestros(self, i):
        cadena = []
        while i is not None:
            cadena.append(i)
            i = self.padre.get(i)
        return cadena


# Las patas, la cabeza y la cola, por su sitio: lo mismo que `findHorseBones` en el juego.
def partes(esq):
    hijos = {esq.padre[h] for h in esq.huesos if h in esq.padre}
    hojas = [h for h in esq.huesos if h not in hijos]
    cascos = sorted(hojas, key=lambda h: esq.pos[h][1])[:4]
    cabeza = max(esq.huesos, key=lambda h: esq.pos[h][1])
    centro = np.mean([esq.pos[h] for h in cascos], axis=0)
    delante = esq.pos[cabeza] - centro
    delante[1] = 0
    delante /= np.linalg.norm(delante)
    arriba = np.array([0.0, 1.0, 0.0])
    izquierda = np.cross(arriba, delante)

    def pareja(a, b):
        comun = next(h for h in esq.ancestros(a) if h in set(esq.ancestros(b)))
        pata = lambda casco: list(reversed(esq.ancestros(casco)[:esq.ancestros(casco).index(comun)]))
        return pata(a), pata(b)

    por_delante = sorted(cascos, key=lambda h: -esq.pos[h] @ delante)
    por_izquierda = lambda par: sorted(par, key=lambda h: -esq.pos[h] @ izquierda)
    patas = {}
    patas['frontLeft'], patas['frontRight'] = pareja(*por_izquierda(por_delante[:2]))
    patas['backLeft'], patas['backRight'] = pareja(*por_izquierda(por_delante[2:]))
    tronco = {a for pata in patas.values() for a in esq.ancestros(pata[0])[1:]}
    cuello = [h for h in reversed(esq.ancestros(cabeza)) if h not in tronco]
    atras = min(esq.pos[p[0]] @ delante for p in (patas['backLeft'], patas['backRight']))
    colas = [h for h in hojas if h not in cascos and esq.pos[h] @ delante < atras]
    punta = min(colas, key=lambda h: esq.pos[h] @ delante) if colas else None
    cola = [h for h in reversed(esq.ancestros(punta)) if h not in tronco] if punta is not None else []
    raiz = esq.ancestros(patas['frontLeft'][0])[-1]
    while raiz not in esq.huesos:  # la raíz del esqueleto, no la del archivo (la «Armature»)
        raiz = next(h for h in esq.huesos if esq.padre.get(h) == raiz)
    return {'delante': delante, 'izquierda': izquierda, 'patas': patas, 'cuello': cuello, 'cola': cola, 'raiz': raiz}


# Suela y punta de cada casco: los vértices que manda el último hueso de la pata. La punta es el de la
# suela que queda más adelante; el suelo, la suela más baja de las cuatro.
def cascos(gltf, binario, esq, cuerpo):
    malla = next(n for n in gltf['nodes'] if 'mesh' in n and 'skin' in n)
    primitiva = gltf['meshes'][malla['mesh']]['primitives'][0]
    P = accesor(gltf, binario, primitiva['attributes']['POSITION'])
    J = accesor(gltf, binario, primitiva['attributes']['JOINTS_0']).astype(int)
    W = accesor(gltf, binario, primitiva['attributes']['WEIGHTS_0'])
    manda = np.array(esq.huesos)[J[np.arange(len(P)), W.argmax(axis=1)]]
    datos = {}
    for nombre, pata in cuerpo['patas'].items():
        casco = P[manda == pata[-1]]
        if not len(casco):
            raise SystemExit(f'ningún vértice lo manda el casco de {nombre}')
        suela = casco[casco[:, 1] < casco[:, 1].min() + 0.004]
        punta = suela[np.argmax(suela @ cuerpo['delante'])]
        # La suela: lo que pisa. Es lo que no puede moverse mientras apoya (lo de más arriba se dobla
        # con el menudillo, como debe).
        indices = np.flatnonzero(manda == pata[-1])
        pisa = indices[P[indices, 1] < casco[:, 1].min() + 0.01]
        datos[nombre] = {'punta': punta, 'suela': casco[:, 1].min(), 'vertices': indices, 'pisa': pisa}
    return datos, {'P': P, 'J': J, 'W': W, 'alto': P[:, 1].max() - P[:, 1].min()}


# Pesos de la piel. El aparejador de Tripo ató a la punta de la cola vértices de todo el caballo —hasta
# las suelas de las manos, a un metro de ella—, con poco peso cada uno, pero lo bastante para que el
# casco se tuerza cuando la cola se mueve. Aquí la cola manda solo en la cola, y la suela de cada casco
# va entera con su casco: es de cuerno, no se dobla.
COLA_ALCANCE = 0.25  # lo lejos de la cola que puede quedar un vértice que la cola mueva


def limpia_pesos(gltf, binario, esq, cuerpo, datos, malla):
    J, W, P = malla['J'], malla['W'].copy(), malla['P']
    cola = [esq.pos[h] for h in cuerpo['cola']]
    lejos = np.full(len(P), np.inf)
    for a, b in zip(cola, cola[1:]):
        ab = b - a
        t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
        lejos = np.minimum(lejos, np.linalg.norm(P - (a + t[:, None] * ab), axis=1))
    de_cola = np.isin(np.array(esq.huesos)[J], cuerpo['cola'])
    sueltos = de_cola & (lejos[:, None] > COLA_ALCANCE) & (W > 0)
    W[sueltos] = 0
    for nombre, d in datos.items():
        casco = esq.huesos.index(cuerpo['patas'][nombre][-1])
        suela = d['pisa']
        W[suela] = np.where(J[suela] == casco, 1.0, 0.0)
    W /= W.sum(axis=1, keepdims=True)
    primitiva = gltf['meshes'][next(n for n in gltf['nodes'] if 'mesh' in n and 'skin' in n)['mesh']]['primitives'][0]
    primitiva['attributes']['WEIGHTS_0'] = anade(gltf, binario, W, 'VEC4')
    malla['W'] = W
    return int(sueltos.any(axis=1).sum())


# --- Cinemática inversa de una pata, en su plano ----------------------------------------------------

def en_plano(p, delante):
    return np.array([p @ delante, p[1]])


def gira2(v, a):  # positivo: lo que cuelga va hacia atrás (y sube); el hocico, abajo
    c, sn = math.cos(a), math.sin(a)
    return np.array([c * v[0] + sn * v[1], -sn * v[0] + c * v[1]])


class Pata:
    def __init__(self, esq, huesos, punta, delante, clase):
        self.huesos = huesos
        self.clase = clase
        self.spec = PATAS[clase]
        if len(huesos) != 5:
            raise SystemExit(f'una pata con {len(huesos)} huesos: este paso está hecho para patas de cinco')
        puntos = [en_plano(esq.pos[h], delante) for h in huesos] + [en_plano(punta, delante)]
        self.tramos = [puntos[k + 1] - puntos[k] for k in range(5)]
        self.origen = puntos[0]
        self.punta = puntos[-1]
        self.topes = np.array(self.spec['topes'], float) * GRADOS

    def extremo(self, alpha):
        p = self.origen.copy()
        giro_total = 0.0
        for k in range(5):
            giro_total += alpha[k]
            p = p + gira2(self.tramos[k], giro_total)
        return p, giro_total

    def residuos(self, alpha, obj):
        punta, casco = self.extremo(alpha)
        r = [PESO_PUNTA * (punta[0] - obj['punta'][0]), PESO_PUNTA * (punta[1] - obj['punta'][1]),
             obj['peso_casco'] * (casco - obj['casco'])]
        r += [math.sqrt(w) * (a - p) for a, p, w in zip(alpha, obj['preferido'], obj['pesos'])]
        if self.spec['recíproco']:
            r.append(math.sqrt(self.spec['recíproco']) * (alpha[1] + alpha[2]))
        return np.array(r)

    def resuelve(self, obj, alpha):
        alpha = np.clip(alpha.copy(), self.topes[:, 0], self.topes[:, 1])
        r = self.residuos(alpha, obj)
        coste = r @ r
        lam = 1e-3
        for _ in range(400):
            J = np.empty((len(r), 5))
            for k in range(5):
                d = np.zeros(5)
                d[k] = 1e-6
                J[:, k] = (self.residuos(alpha + d, obj) - self.residuos(alpha - d, obj)) / 2e-6
            H = J.T @ J
            paso = np.linalg.solve(H + lam * (np.diag(np.diag(H)) + 1e-9 * np.eye(5)), -J.T @ r)
            nuevo = np.clip(alpha + paso, self.topes[:, 0], self.topes[:, 1])
            rn = self.residuos(nuevo, obj)
            if rn @ rn < coste:
                alpha, r, coste = nuevo, rn, rn @ rn
                lam = max(lam / 3, 1e-12)
                if np.abs(paso).max() < 1e-11:
                    break
            else:
                lam *= 4
                if lam > 1e12:
                    break
        return alpha


def suave(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def joroba(s, pico=PICO_PLIEGUE):  # 0 en los extremos del vuelo, 1 en el pico, sin tirones
    k = math.log(0.5) / math.log(pico)
    return math.sin(math.pi * s ** k) ** 2


def tramos(claves, s):  # interpola entre (posición, grados) suavemente
    for (a, va), (b, vb) in zip(claves, claves[1:]):
        if s <= b:
            f = 0.5 - 0.5 * math.cos(math.pi * (s - a) / (b - a))
            return (va + (vb - va) * f) * GRADOS
    return claves[-1][1] * GRADOS


# Lo que se pide a una pata en el punto `s` (0..1) de su ciclo, que empieza al pisar, en el espacio del
# cuerpo sin mecerse (el que avanza y sube y baja, pero no cabecea): dónde va la punta del casco y
# con qué ángulo, y lo que se prefiere para cada hueso.
def objetivo(pata, s, aire, suelo, vaiven):
    spec = pata.spec
    alto_caballo = pata.alto_caballo
    apoyo = aire['apoyo']
    avance = aire['zancada'] * alto_caballo
    recorrido = avance * apoyo  # lo que se desplaza el casco respecto al cuerpo mientras apoya
    centro = pata.punta[0] + CENTRO[pata.clase] * alto_caballo
    u0 = centro + recorrido / 2  # donde pisa
    u1 = centro - recorrido / 2  # donde despega
    alto = suelo - vaiven
    if s < apoyo:
        rueda = suave((s / apoyo - (1 - DESPEGUE)) / DESPEGUE)
        return {
            'punta': np.array([u0 - recorrido * s / apoyo, alto]),
            'casco': GIRO_DESPEGUE * GRADOS * rueda,
            'peso_casco': PESO_CASCO,
            'preferido': [0] * 5,
            'pesos': spec['peso_apoyo'],
        }
    v = (s - apoyo) / (1 - apoyo)
    # Del despegue a la pisada, con la velocidad del apoyo en los dos extremos: el casco sigue un pelo
    # hacia atrás al soltarse y llega frenando, quieto respecto al suelo, en vez de dar un pisotón.
    m = -avance * (1 - apoyo)
    h00, h10, h01, h11 = 2 * v**3 - 3 * v**2 + 1, v**3 - 2 * v**2 + v, -2 * v**3 + 3 * v**2, v**3 - v**2
    u = h00 * u1 + h10 * m + h01 * u0 + h11 * m
    rampa = suave(v / RAMPA) * suave((1 - v) / RAMPA)
    return {
        'punta': np.array([u, alto + aire['alzada'][pata.clase] * alto_caballo * math.sin(math.pi * v)]),
        'casco': tramos(spec['casco'], v),
        'peso_casco': PESO_CASCO + (PESO_CASCO_VUELO - PESO_CASCO) * rampa,
        'preferido': [p * aire['pliegue'] * GRADOS * joroba(v) for p in spec['pliegue']],
        'pesos': [a + (b - a) * rampa for a, b in zip(spec['peso_apoyo'], spec['peso_vuelo'])],
    }


def onda(amplitud_ciclos_bajo, fase):  # cos con su mínimo en el punto dado del ciclo
    amplitud, ciclos, bajo = amplitud_ciclos_bajo
    return -amplitud * math.cos(2 * math.pi * ciclos * (fase - bajo))


# --- El archivo ------------------------------------------------------------------------------------

def anade(gltf, binario, datos, tipo, limites=False):
    datos = np.ascontiguousarray(datos, dtype='<f4')
    binario += b'\0' * (-len(binario) % 4)
    gltf['bufferViews'].append({'buffer': 0, 'byteOffset': len(binario), 'byteLength': datos.nbytes})
    binario += datos.tobytes()
    acc = {'bufferView': len(gltf['bufferViews']) - 1, 'componentType': 5126, 'count': len(datos), 'type': tipo}
    if limites:
        acc['min'] = [float(datos.min())]
        acc['max'] = [float(datos.max())]
    gltf['accessors'].append(acc)
    return len(gltf['accessors']) - 1


def clip(gltf, binario, nombre, tiempos, giros, raiz, posiciones):
    muestras, canales = [], []
    entrada = anade(gltf, binario, tiempos, 'SCALAR', limites=True)
    for nodo, qs in giros.items():
        qs = np.array(qs)
        for k in range(1, len(qs)):  # el mismo giro, por el camino corto
            if qs[k] @ qs[k - 1] < 0:
                qs[k] = -qs[k]
        muestras.append({'input': entrada, 'output': anade(gltf, binario, qs, 'VEC4'), 'interpolation': 'LINEAR'})
        canales.append({'sampler': len(muestras) - 1, 'target': {'node': nodo, 'path': 'rotation'}})
    muestras.append({'input': entrada, 'output': anade(gltf, binario, posiciones, 'VEC3'), 'interpolation': 'LINEAR'})
    canales.append({'sampler': len(muestras) - 1, 'target': {'node': raiz, 'path': 'translation'}})
    return {'name': nombre, 'samplers': muestras, 'channels': canales}


# --- Los aires ---------------------------------------------------------------------------------------

def prepara(esq, cuerpo, datos, malla):
    alto = malla['alto']
    patas = {}
    for nombre, huesos in cuerpo['patas'].items():
        pata = Pata(esq, huesos, datos[nombre]['punta'], cuerpo['delante'], 'front' if nombre.startswith('front') else 'back')
        pata.alto_caballo = alto
        patas[nombre] = pata
    suelo = min(d['suela'] for d in datos.values())
    # El punto sobre el que se mece el cuerpo: a media altura, entre las cuatro patas.
    medio = np.mean([p.origen for p in patas.values()], axis=0)
    pivote = np.array([medio[0], PIVOTE * alto])
    return patas, suelo, pivote


def local(esq, hueso, giro_mundo):  # giro local de un hueso girado `giro_mundo` en el espacio del cuerpo
    R = esq.mundo[hueso][0]
    Rp = esq.mundo[esq.padre[hueso]][0] if hueso in esq.padre else np.eye(3)
    return cuaternion(Rp.T @ giro_mundo @ R)


def compone(esq, cuerpo, patas, suelo, pivote, alto, aire):
    delante, izquierda = cuerpo['delante'], cuerpo['izquierda']
    avance = aire['zancada'] * alto
    n = round(aire['ciclo'] * FPS)
    tiempos = np.linspace(0, aire['ciclo'], n + 1)  # el último, justo al cerrar el ciclo
    fase = tiempos / aire['ciclo']
    vaiven = np.array([onda(aire['vaiven'], f) * alto for f in fase])
    tronco = np.array([-onda(aire['tronco'], f) * GRADOS for f in fase])  # el hocico, abajo en su punto

    # Cada pata, fotograma a fotograma, en el espacio del cuerpo que cabecea: dos vueltas al ciclo, que
    # la segunda arranque de la primera y así el final empalme con el principio.
    angulos = {}
    for nombre, pata in patas.items():
        alpha = np.zeros(5)
        for vuelta in range(2):
            fila = []
            for k in range(n + 1):
                s = (fase[k] - aire['pisadas'][nombre]) % 1
                obj = objetivo(pata, s, aire, suelo, vaiven[k])
                obj['punta'] = pivote + gira2(obj['punta'] - pivote, -tronco[k])
                obj['casco'] -= tronco[k]
                alpha = pata.resuelve(obj, alpha)
                fila.append(alpha.copy())
        angulos[nombre] = np.array(fila)

    giros = {h: [] for h in esq.huesos}
    raiz = cuerpo['raiz']
    marcha = []
    cabeceo_cuello = aire['cuello']
    for k in range(n + 1):
        movidos = {}
        for nombre, huesos in cuerpo['patas'].items():
            for h, a in zip(huesos, angulos[nombre][k]):
                movidos[h] = giro(izquierda, a)
        # El cuello: la cabeza baja con cada pisada de las manos y, en el galope, con el tronco.
        nod = onda((1, cabeceo_cuello[1], cabeceo_cuello[2]), fase[k])
        for h, g in zip(cuerpo['cuello'], CABECEO):
            movidos[h] = giro(izquierda, -g * cabeceo_cuello[0] * GRADOS * nod)
        for i, (h, g) in enumerate(zip(cuerpo['cola'], COLA)):
            movidos[h] = giro(delante, g * GRADOS * math.sin(2 * math.pi * (fase[k] - 0.08 * i)))
        # La raíz lleva el cuerpo: avanza, sube y baja, y cabecea alrededor del pivote.
        cabeceo = giro(izquierda, tronco[k])
        movidos[raiz] = cabeceo @ movidos.get(raiz, np.eye(3))
        for h in esq.huesos:
            giros[h].append(local(esq, h, movidos.get(h, np.eye(3))))
        p3 = np.array([0.0, pivote[1], 0.0]) + delante * pivote[0]
        base = esq.T[raiz]
        marcha.append(cabeceo @ (base - p3) + p3 + delante * avance * fase[k] + np.array([0, vaiven[k], 0]))
    return {'tiempos': tiempos, 'giros': giros, 'marcha': np.array(marcha), 'raiz': raiz, 'angulos': angulos, 'avance': avance}


# Quieto: los cuatro cascos de plano en el mismo suelo, bajo su sitio de reposo.
def reposo(esq, cuerpo, patas, suelo):
    giros = {}
    for nombre, pata in patas.items():
        obj = {'punta': np.array([pata.punta[0], suelo]), 'casco': 0.0, 'peso_casco': PESO_CASCO,
               'preferido': [0] * 5, 'pesos': pata.spec['peso_apoyo']}
        for h, a in zip(cuerpo['patas'][nombre], pata.resuelve(obj, np.zeros(5))):
            giros[h] = giro(cuerpo['izquierda'], a)
    return {h: [local(esq, h, giros.get(h, np.eye(3)))] * 2 for h in esq.huesos}


# --- La prueba: se deforma la malla de verdad y se mira dónde quedan los cascos ---------------------

def comprueba(esq, cuerpo, datos, malla, paso, aire, suelo):
    n = len(paso['tiempos'])
    P = np.c_[malla['P'], np.ones(len(malla['P']))]
    J, W = malla['J'], malla['W']
    delante = cuerpo['delante']
    apoyo = aire['apoyo']
    fase = paso['tiempos'] / aire['ciclo']
    huella = {nombre: [] for nombre in datos}
    minimo = []
    for k in range(n):
        mundo = {}

        def m(i):
            if i in mundo:
                return mundo[i]
            L = np.eye(4)
            L[:3, :3] = matriz(paso['giros'][i][k]) if i in paso['giros'] else esq.R[i]
            L[:3, 3] = paso['marcha'][k] if i == paso['raiz'] else esq.T[i]
            mundo[i] = (m(esq.padre[i]) @ L) if i in esq.padre else L
            return mundo[i]

        piel = np.array([m(j) @ esq.inversas[a] for a, j in enumerate(esq.huesos)])
        V = np.einsum('vk,vkij,vj->vi', W, piel[J], P)[:, :3]
        minimo.append(V[:, 1].min() - suelo)
        for nombre, d in datos.items():
            huella[nombre].append((V[d['pisa']], V[d['vertices']]))

    # En el suelo: con algún casco apoyado de plano, lo más bajo del caballo ha de estar justo en el
    # suelo; y nunca por debajo.
    apoyado = [any(((fase[k] - aire['pisadas'][p]) % 1) < apoyo * (1 - DESPEGUE) for p in datos) for k in range(n)]
    informe = {'hundido_max': -min(minimo), 'flotando_max': max(m for m, a in zip(minimo, apoyado) if a)}
    for nombre, filas in huella.items():
        s = (fase - aire['pisadas'][nombre]) % 1
        plano = [k for k in range(n - 1) if s[k] < apoyo * (1 - DESPEGUE)]
        atras = paso['avance'] * delante  # el apoyo que empezó en el ciclo anterior, traído a este
        pos = np.array([filas[k][0] + (atras if fase[k] < aire['pisadas'][nombre] else 0) for k in plano])
        altura = np.array([f[1][:, 1].min() - suelo for f in filas])
        vuelo = [k for k in range(n) if apoyo + 0.1 * (1 - apoyo) < s[k] < 1 - 0.1 * (1 - apoyo)]
        informe[nombre] = {
            'patina_apoyo': np.abs(pos - pos[0]).max(),
            'suela_apoyo': (altura[plano].min(), altura[plano].max()),
            'alzada_max': altura.max(),
            'vuelo_min': altura[vuelo].min() if vuelo else None,
        }
    return informe


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    entrada, salida = sys.argv[1:]
    gltf, binario = leer(entrada)
    esq = Esqueleto(gltf, binario)
    cuerpo = partes(esq)
    datos, malla = cascos(gltf, binario, esq, cuerpo)
    nombre = esq.nombre
    for parte, huesos in cuerpo['patas'].items():
        print(f'{parte:11s}', ' > '.join(nombre[h] for h in huesos))
    print('cuello     ', ' > '.join(nombre[h] for h in cuerpo['cuello']))
    print('cola       ', ' > '.join(nombre[h] for h in cuerpo['cola']))
    sueltos = limpia_pesos(gltf, binario, esq, cuerpo, datos, malla)
    print(f'pesos: {sueltos} vértices dejan de moverse con la cola; las suelas, enteras con su casco')

    alto = malla['alto']
    patas, suelo, pivote = prepara(esq, cuerpo, datos, malla)
    mm = lambda x: f'{1000 * x / alto:.1f}‰'
    animaciones = []
    for clave, aire in AIRES.items():
        paso = compone(esq, cuerpo, patas, suelo, pivote, alto, aire)
        print(f"\n{clave}: {aire['ciclo']:g} s por ciclo, avanza {paso['avance']:.3f} ({paso['avance'] / aire['ciclo']:.3f} por segundo)")
        for parte, angulos in paso['angulos'].items():
            salto = np.abs(np.diff(angulos, axis=0)).max() / GRADOS
            cierre = np.abs(angulos[-1] - angulos[0]).max() / GRADOS
            rango = ' '.join(f'[{a:+.0f},{b:+.0f}]' for a, b in zip(angulos.min(axis=0) / GRADOS, angulos.max(axis=0) / GRADOS))
            print(f'  {parte:11s} giros {rango}  salto máx {salto:.1f}°/fotograma, cierre {cierre:.3f}°')
        informe = comprueba(esq, cuerpo, datos, malla, paso, aire, suelo)
        print('  suelo: hundido', mm(informe['hundido_max']), '· flotando con algún casco apoyado', mm(informe['flotando_max']), '(de su altura)')
        for parte in cuerpo['patas']:
            i = informe[parte]
            print(f"  {parte:11s} patina {mm(i['patina_apoyo'])} · suela al apoyar {mm(i['suela_apoyo'][0])}…{mm(i['suela_apoyo'][1])}"
                  f" · sube hasta {mm(i['alzada_max'])} · en el vuelo, a {mm(i['vuelo_min'])} del suelo como poco")
        animaciones.append(clip(gltf, binario, clave, paso['tiempos'], paso['giros'], paso['raiz'], paso['marcha']))
    raiz = cuerpo['raiz']
    animaciones.append(clip(gltf, binario, 'idle', np.array([0.0, 1.0]), reposo(esq, cuerpo, patas, suelo), raiz, np.array([esq.T[raiz]] * 2)))
    gltf['animations'] = animaciones
    gltf['buffers'][0]['byteLength'] = len(binario) + (-len(binario) % 4)
    escribir(salida, gltf, binario)
    print(f"\n{salida}: {', '.join(a['name'] for a in animaciones)}")


if __name__ == '__main__':
    main()
