import json, struct, pathlib, sys, zlib

# Deja a la reina con el mismo material que los peones: mate del todo. Tripo le había puesto un mapa
# que decía metal 0,60 y rugosidad 0,41 de la corona a los tobillos, y con eso la piel sale mojada y
# la cara, de muñeca de plástico. Los peones y el caballero no traen mapa ninguno —metal 0,
# rugosidad 0,9— y por eso se ven de carne y de tela.
#
# Se quitan los dos mapas que sobran (el de normales, que es un horneado con pérdida y ensucia la
# piel a manchas, y el de metal) dejándolos en un píxel, y se fijan los valores a mano. El de color
# se queda, que es el que pinta.
#
# Uso: mate.py <entrada.glb> <salida.glb> [rugosidad] [metal]
#   con `metal` distinto de cero deja de ser mate: sirve para los objetos que SON de metal enteros
#   (un báculo, una espada), donde no hace falta un mapa para decir qué parte brilla.
entrada, salida = sys.argv[1], sys.argv[2]
RUGOSIDAD = float(sys.argv[3]) if len(sys.argv) > 3 else 0.9
METAL = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0

def png1x1(rgb=(255, 255, 255)):
    def trozo(tipo, datos):
        c = tipo + datos
        return struct.pack('>I', len(datos)) + c + struct.pack('>I', zlib.crc32(c))
    cab = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    crudo = bytes([0]) + bytes(rgb)
    return (b'\x89PNG\r\n\x1a\n' + trozo(b'IHDR', cab)
            + trozo(b'IDAT', zlib.compress(crudo)) + trozo(b'IEND', b''))

b = pathlib.Path(entrada).read_bytes()
njson = struct.unpack_from('<I', b, 12)[0]
j = json.loads(b[20:20+njson])
off = 20 + njson
binario = bytearray(b[off+8:off+8+struct.unpack_from('<I', b, off)[0]])

mat = j['materials'][0]
pbr = mat.setdefault('pbrMetallicRoughness', {})
color = pbr.get('baseColorTexture', {}).get('index')
sobran = []
if 'metallicRoughnessTexture' in pbr:
    sobran.append(pbr.pop('metallicRoughnessTexture')['index'])
if 'normalTexture' in mat:
    sobran.append(mat.pop('normalTexture')['index'])
pbr['metallicFactor'] = METAL
pbr['roughnessFactor'] = RUGOSIDAD
print(f'color en la textura {color}; se vacían las texturas {sobran}; metal {METAL}, rugosidad {RUGOSIDAD}')

# Las texturas que sobran se quedan en un píxel: así no pesan y no hay que renumerar nada.
minimo = png1x1()
for t in sobran:
    src = j['textures'][t].get('source')
    if src is None:
        src = j['textures'][t].get('extensions', {}).get('EXT_texture_webp', {}).get('source')
    im = j['images'][src]
    bv = j['bufferViews'][im['bufferView']]
    inicio, largo = bv.get('byteOffset', 0), bv['byteLength']
    delta = len(minimo) - largo
    binario[inicio:inicio+largo] = minimo
    bv['byteLength'] = len(minimo)
    im['mimeType'] = 'image/png'
    for otra in j['bufferViews']:
        if otra is not bv and otra.get('byteOffset', 0) > inicio:
            otra['byteOffset'] = otra.get('byteOffset', 0) + delta
j['buffers'][0]['byteLength'] = len(binario)

def rellena(x, relleno=b'\x00'):
    return x + relleno * ((4 - len(x) % 4) % 4)
txt = rellena(json.dumps(j, separators=(',', ':')).encode(), b' ')
bina = rellena(bytes(binario))
total = 12 + 8 + len(txt) + 8 + len(bina)
out = bytearray(b'glTF' + struct.pack('<II', 2, total))
out += struct.pack('<II', len(txt), 0x4E4F534A) + txt
out += struct.pack('<II', len(bina), 0x004E4942) + bina
pathlib.Path(salida).write_bytes(bytes(out))
print(f'{salida} ({len(out)/1e6:.2f} MB)')
