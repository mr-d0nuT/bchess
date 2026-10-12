#!/usr/bin/env python3
"""Saca de una fuente TrueType los contornos de las letras y números de las coordenadas del tablero (a-h, 1-8)
y los guarda en JSON para hacerlos en 3D (`src/scene/coordinates.js`). Sin dependencias: lee las tablas a mano.

Uso: python3 tools/coordenadas-fuente.py <fuente.ttf> assets/fonts/coordenadas.json
La fuente es Cormorant Garamond SemiBold (SIL Open Font License 1.1): ver assets/fonts/OFL-Cormorant.txt.
"""
import json, struct, sys

CARACTERES = 'abcdefgh12345678'


def tablas(datos):
    num = struct.unpack('>H', datos[4:6])[0]
    out = {}
    for i in range(num):
        tag, _, off, largo = struct.unpack('>4sIII', datos[12 + 16 * i:28 + 16 * i])
        out[tag.decode('latin-1')] = (off, largo)
    return out


def cmap(datos, t):
    base = t['cmap'][0]
    n = struct.unpack('>H', datos[base + 2:base + 4])[0]
    mejor = None
    for i in range(n):
        plat, enc, off = struct.unpack('>HHI', datos[base + 4 + 8 * i:base + 12 + 8 * i])
        fmt = struct.unpack('>H', datos[base + off:base + off + 2])[0]
        if (plat, enc) in ((3, 1), (0, 3), (0, 4), (3, 10)) and fmt in (4, 12):
            mejor = (base + off, fmt)
            if fmt == 4:
                break
    sub, fmt = mejor
    mapa = {}
    if fmt == 4:
        segx2 = struct.unpack('>H', datos[sub + 6:sub + 8])[0]
        seg = segx2 // 2
        ends = struct.unpack(f'>{seg}H', datos[sub + 14:sub + 14 + segx2])
        starts = struct.unpack(f'>{seg}H', datos[sub + 16 + segx2:sub + 16 + 2 * segx2])
        deltas = struct.unpack(f'>{seg}h', datos[sub + 16 + 2 * segx2:sub + 16 + 3 * segx2])
        ro_base = sub + 16 + 3 * segx2
        ros = struct.unpack(f'>{seg}H', datos[ro_base:ro_base + segx2])
        for c in CARACTERES:
            code = ord(c)
            for k in range(seg):
                if starts[k] <= code <= ends[k]:
                    if ros[k] == 0:
                        gid = (code + deltas[k]) & 0xFFFF
                    else:
                        addr = ro_base + 2 * k + ros[k] + 2 * (code - starts[k])
                        gid = struct.unpack('>H', datos[addr:addr + 2])[0]
                        if gid:
                            gid = (gid + deltas[k]) & 0xFFFF
                    mapa[c] = gid
                    break
    else:
        ngrupos = struct.unpack('>I', datos[sub + 12:sub + 16])[0]
        for k in range(ngrupos):
            a, b, g = struct.unpack('>III', datos[sub + 16 + 12 * k:sub + 28 + 12 * k])
            for c in CARACTERES:
                if a <= ord(c) <= b:
                    mapa[c] = g + ord(c) - a
    return mapa


def glifo(datos, t, loca, gid):
    base = t['glyf'][0]
    ini, fin = loca[gid], loca[gid + 1]
    if ini == fin:
        return []
    p = base + ini
    ncont, xmin, ymin, xmax, ymax = struct.unpack('>hhhhh', datos[p:p + 10])
    p += 10
    if ncont < 0:  # compuesto: sus piezas, desplazadas
        contornos = []
        while True:
            flags, sub = struct.unpack('>HH', datos[p:p + 4])
            p += 4
            if flags & 1:
                dx, dy = struct.unpack('>hh', datos[p:p + 4]); p += 4
            else:
                dx, dy = struct.unpack('>bb', datos[p:p + 2]); p += 2
            if flags & 8:
                p += 2
            elif flags & 0x40:
                p += 4
            elif flags & 0x80:
                p += 8
            for c in glifo(datos, t, loca, sub):
                contornos.append([[x + dx, y + dy, on] for x, y, on in c])
            if not flags & 0x20:
                break
        return contornos
    ends = struct.unpack(f'>{ncont}H', datos[p:p + 2 * ncont]); p += 2 * ncont
    ninstr = struct.unpack('>H', datos[p:p + 2])[0]; p += 2 + ninstr
    npts = ends[-1] + 1 if ncont else 0
    flags = []
    while len(flags) < npts:
        f = datos[p]; p += 1
        flags.append(f)
        if f & 8:
            r = datos[p]; p += 1
            flags.extend([f] * r)
    xs, ys = [], []
    v = 0
    for f in flags:
        if f & 2:
            d = datos[p]; p += 1
            v += d if f & 16 else -d
        elif not f & 16:
            v += struct.unpack('>h', datos[p:p + 2])[0]; p += 2
        xs.append(v)
    v = 0
    for f in flags:
        if f & 4:
            d = datos[p]; p += 1
            v += d if f & 32 else -d
        elif not f & 32:
            v += struct.unpack('>h', datos[p:p + 2])[0]; p += 2
        ys.append(v)
    contornos, ini = [], 0
    for e in ends:
        contornos.append([[xs[i], ys[i], 1 if flags[i] & 1 else 0] for i in range(ini, e + 1)])
        ini = e + 1
    return contornos


# Las cifras, ALINEADAS (todas de la misma altura, sobre la línea base). Las de serie de Cormorant son de texto
# (el 1 bajito, el 3 y el 4 colgando por debajo), y en el borde del tablero no quedaban parejas. Las alineadas
# no tienen código propio: se buscan por su nombre en la tabla `post` («one.lf»…).
NOMBRES_CIFRAS = {'1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight'}


def nombres_glifos(datos, t):
    off, largo = t['post']
    if struct.unpack('>I', datos[off:off + 4])[0] != 0x00020000:
        return {}
    n = struct.unpack('>H', datos[off + 32:off + 34])[0]
    idx = struct.unpack(f'>{n}H', datos[off + 34:off + 34 + 2 * n])
    p = off + 34 + 2 * n
    propios = []
    while p < off + largo:
        l = datos[p]
        propios.append(datos[p + 1:p + 1 + l].decode('latin-1'))
        p += 1 + l
    return {propios[i - 258]: gid for gid, i in enumerate(idx) if i >= 258}


def nombre(datos, t, ident):
    base = t['name'][0]
    _, n, strs = struct.unpack('>HHH', datos[base:base + 6])
    for i in range(n):
        plat, enc, lang, nid, largo, off = struct.unpack('>HHHHHH', datos[base + 6 + 12 * i:base + 18 + 12 * i])
        if nid == ident and plat == 3:
            return datos[base + strs + off:base + strs + off + largo].decode('utf-16-be')
    return None


def main(origen, destino):
    datos = open(origen, 'rb').read()
    t = tablas(datos)
    if 'glyf' not in t:
        sys.exit('No es una fuente TrueType con contornos (glyf)')
    head = t['head'][0]
    upem = struct.unpack('>H', datos[head + 18:head + 20])[0]
    largo_loca = struct.unpack('>h', datos[head + 50:head + 52])[0]
    nglifos = struct.unpack('>H', datos[t['maxp'][0] + 4:t['maxp'][0] + 6])[0]
    lb = t['loca'][0]
    if largo_loca == 0:
        loca = [2 * x for x in struct.unpack(f'>{nglifos + 1}H', datos[lb:lb + 2 * (nglifos + 1)])]
    else:
        loca = list(struct.unpack(f'>{nglifos + 1}I', datos[lb:lb + 4 * (nglifos + 1)]))
    nmetricas = struct.unpack('>H', datos[t['hhea'][0] + 34:t['hhea'][0] + 36])[0]
    hm = t['hmtx'][0]
    mapa = cmap(datos, t)
    por_nombre = nombres_glifos(datos, t)
    for cifra, nombre_cifra in NOMBRES_CIFRAS.items():
        if f'{nombre_cifra}.lf' in por_nombre:
            mapa[cifra] = por_nombre[f'{nombre_cifra}.lf']
    glifos = {}
    for c in CARACTERES:
        gid = mapa[c]
        adv = struct.unpack('>H', datos[hm + 4 * min(gid, nmetricas - 1):hm + 4 * min(gid, nmetricas - 1) + 2])[0]
        glifos[c] = {'avance': adv, 'contornos': glifo(datos, t, loca, gid)}
    salida = {
        'fuente': nombre(datos, t, 4),
        'copyright': nombre(datos, t, 0),
        'licencia': 'SIL Open Font License 1.1 (assets/fonts/OFL-Cormorant.txt)',
        'variable': 'fvar' in t,
        'unidadesPorEm': upem,
        'glifos': glifos,
    }
    with open(destino, 'w') as f:
        json.dump(salida, f, separators=(',', ':'))
    print(salida['fuente'], '|', salida['copyright'], '| variable:', salida['variable'], '| upem', upem)
    for c in CARACTERES:
        pts = sum(len(k) for k in glifos[c]['contornos'])
        print(f"  {c}: {len(glifos[c]['contornos'])} contornos, {pts} puntos, avance {glifos[c]['avance']}")


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
