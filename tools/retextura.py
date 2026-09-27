#!/usr/bin/env python3
"""Cambia la textura de un GLB por la de otro.

    python3 tools/retextura.py <modelo.glb> <de-donde.glb> <salida.glb>

Los dos caballos del juego son el MISMO modelo de Tripo con dos pinturas distintas, así que cuando
hay que rehacer uno —por ejemplo para cambiarle el esqueleto— el otro sale de aquí: se le pone al
modelo nuevo la imagen que ya tenía el viejo. Las coordenadas de textura no cambian al reaparejar,
de modo que la pintura cae donde debe sin retocar nada.

Se da por hecho que los dos traen una sola imagen, que es como salen de Tripo.
"""

import json
import struct
import sys
from pathlib import Path

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def leer(path):
    datos = Path(path).read_bytes()
    if datos[:4] != b'glTF':
        raise SystemExit(f'{path} no es un GLB')
    trozos = {}
    off = 12
    while off < len(datos):
        largo, tipo = struct.unpack_from('<II', datos, off)
        trozos[tipo] = datos[off + 8:off + 8 + largo]
        off += 8 + largo
    return json.loads(trozos[JSON_CHUNK]), bytearray(trozos.get(BIN_CHUNK, b''))


def imagen(gltf, binario):
    if not gltf.get('images'):
        raise SystemExit('ese GLB no trae ninguna imagen')
    img = gltf['images'][0]
    vista = gltf['bufferViews'][img['bufferView']]
    desde = vista.get('byteOffset', 0)
    return bytes(binario[desde:desde + vista['byteLength']]), img.get('mimeType', 'image/png')


def escribir(path, gltf, binario):
    texto = json.dumps(gltf, separators=(',', ':')).encode()
    texto += b' ' * (-len(texto) % 4)
    binario += b'\0' * (-len(binario) % 4)
    cuerpo = (struct.pack('<II', len(texto), JSON_CHUNK) + texto
              + struct.pack('<II', len(binario), BIN_CHUNK) + bytes(binario))
    Path(path).write_bytes(b'glTF' + struct.pack('<II', 2, 12 + len(cuerpo)) + cuerpo)


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    destino, origen, salida = sys.argv[1:]
    gltf, binario = leer(destino)
    pintura, mime = imagen(*leer(origen))

    # La imagen nueva se añade al final del binario y la vista pasa a apuntar ahí. Lo que había
    # antes se queda dentro sin que nadie lo mire; el optimizador, que es quien pasa después, lo
    # tira al recomponer el fichero.
    img = gltf['images'][0]
    gltf['bufferViews'][img['bufferView']] = {
        'buffer': 0,
        'byteOffset': len(binario),
        'byteLength': len(pintura),
    }
    img['mimeType'] = mime
    binario += pintura
    gltf['buffers'][0]['byteLength'] = len(binario) + (-len(binario) % 4)
    escribir(salida, gltf, binario)
    print(f'{salida}: textura de {Path(origen).name} ({len(pintura) // 1024} KB, {mime})')


if __name__ == '__main__':
    main()
