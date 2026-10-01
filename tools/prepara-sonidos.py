#!/usr/bin/env python3
"""Prepara los efectos de sonido del juego a partir de los originales de raw/sonidos/ (que no se publican).

Cada uno se recorta para que el golpe caiga al principio (el juego lo hace sonar en el instante del
impacto), con entrada y salida suaves, sin los graves que un móvil no reproduce, a −1 dB de pico, en mono
y en MP3 (diez veces menos que en WAV). Uso: python3 tools/prepara-sonidos.py
"""
import subprocess, sys
from pathlib import Path
import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / 'raw' / 'sonidos'
DESTINO = RAIZ / 'assets' / 'audio' / 'efectos'
SR = 44100

# clave: (original, desde s, hasta s, entrada s, salida s). Las claves con «-1», «-2»… son variantes de un
# mismo sonido (el juego elige una cada vez). Las mezclas, en `MEZCLAS`.
SONIDOS = {
    'espadas':        ('WEAPSwrd_Sword (ID 0129)_BigSoundBank.com.wav', 0.126, 0.92, 0.004, 0.17),
    'escudo':         ('pixabay/escudo/6963-shield-guard.mp3', 0.04, 0.85, 0.003, 0.15),
    'embestida':      ('pixabay/escudo/143940-shield-block-shortsword.mp3', 0.0, 1.6, 0.003, 0.5),
    'casco':          ('pixabay/casco/7118-metal-hit-cartoon.mp3', 0.05, 1.1, 0.003, 0.25),
    'corte':          ('pixabay/corte/393847-sword-slice.mp3', 0.19, 1.0, 0.01, 0.3),
    'punetazo':       ('pixabay/punetazo/352711-classic-punch.mp3', 0.07, 0.6, 0.003, 0.15),
    'caida':          ('pixabay/caida/259680-body-fall-uf.mp3', 0.07, 0.8, 0.003, 0.2),
    'caida_armadura': ('pixabay/caida/352446-heavy-body-fall.mp3', 0.33, 1.9, 0.005, 0.4),
    'explosion':      ('pixabay/explosion/567193-cartoon-explosion.mp3', 0.03, 1.4, 0.003, 0.4),
    'mecha':          ('pixabay/mecha/80913-fuse.mp3', 0.1, 2.6, 0.05, 0.3),
    'bomba_vuela':    ('pixabay/bomba_vuela/176647-slide-whistle-down-1.mp3', 0.0, 0.9, 0.01, 0.25),
    'relincho':       ('pixabay/caballo/390297-horse-neigh-ds.mp3', 0.05, 1.55, 0.01, 0.2),
    'hielo':          ('pixabay/magia/445024-ice-freezing.mp3', 0.15, 2.4, 0.1, 0.3),
    'hielo_rompe':    ('pixabay/magia/454251-shattering-ice.mp3', 0.0, 2.2, 0.003, 0.6),
    'fuego':          ('pixabay/magia/179125-fireball-whoosh-1.mp3', 0.08, 1.3, 0.01, 0.4),
    'rayo':           ('pixabay/magia/386161-lightning-strike.mp3', 0.1, 1.1, 0.003, 0.3),
    'hechizo':        ('pixabay/magia/386163-lightning-spell.mp3', 0.12, 1.1, 0.005, 0.3),
    'conjuro':        ('pixabay/magia/229208-spell-casting.mp3', 0.14, 2.2, 0.1, 0.5),
    'puf':            ('pixabay/magia/80161-poof.mp3', 0.48, 1.0, 0.003, 0.15),
    'piedra_rompe':   ('pixabay/piedra/6409-rock-destroy.mp3', 0.02, 1.6, 0.003, 0.5),
    'piedra_cruje':   ('pixabay/piedra/38491-flint-strike.mp3', 0.0, 0.5, 0.002, 0.15),
    'silbido':        ('pixabay/silbido/14678-whoosh-blow-flutter.mp3', 0.18, 0.8, 0.01, 0.15),
    # Pasos sobre la madera del tablero: tres pisadas de la misma grabación.
    'paso-1':         ('pixabay/pasos/397989-footsteps-on-wood.mp3', 0.585, 1.0, 0.003, 0.15),
    'paso-2':         ('pixabay/pasos/397989-footsteps-on-wood.mp3', 1.70, 2.12, 0.003, 0.15),
    'paso-3':         ('pixabay/pasos/397989-footsteps-on-wood.mp3', 2.745, 3.16, 0.003, 0.15),
    # Cascos del caballo, al paso.
    'casco_caballo-1': ('pixabay/cascos/123782-horse-walking.mp3', 2.31, 2.53, 0.002, 0.07),
    'casco_caballo-2': ('pixabay/cascos/123782-horse-walking.mp3', 2.82, 3.04, 0.002, 0.07),
    'casco_caballo-3': ('pixabay/cascos/123782-horse-walking.mp3', 3.82, 4.04, 0.002, 0.07),
    'casco_caballo-4': ('pixabay/cascos/123782-horse-walking.mp3', 4.06, 4.28, 0.002, 0.07),
    # La partida: tocar una pieza, los botones, el reloj, el jaque, el final y la coronación.
    'pieza':          ('pixabay/pieza/99336-chess-pieces-hitting-wooden-board.mp3', 0.03, 0.2, 0.002, 0.08),
    'clic':           ('pixabay/boton/43196-ui-click.mp3', 0.225, 0.31, 0.001, 0.03),
    'jugar':          ('pixabay/boton/6428-swoosh.mp3', 0.6, 1.95, 0.05, 0.4),
    'reloj':          ('pixabay/reloj/359987-cassette-stop-button-click.mp3', 0.09, 0.58, 0.002, 0.1),
    'tic':            ('pixabay/reloj/76043-clock-tick-tik-tak.mp3', 0.04, 0.3, 0.002, 0.08),
    'jaque':          ('pixabay/jaque/240475-orchestra-hit.mp3', 0.0, 1.6, 0.003, 0.5),
    'victoria':       ('pixabay/final/6826-medieval-fanfare.mp3', 0.0, 5.6, 0.01, 1.2),
    'derrota':        ('pixabay/final/6347-wah-wah-sad-trombone.mp3', 0.25, 5.0, 0.01, 0.6),
    'tablas':         ('pixabay/final/6185-success-fanfare-trumpets.mp3', 0.0, 3.6, 0.01, 0.8),
    'torre':          ('pixabay/torre/304550-rock-stone-slide.mp3', 0.05, 1.44, 0.01, 0.3),
    'corona':         ('pixabay/corona/191997-level-up.mp3', 0.04, 1.5, 0.003, 0.4),
}

# Sonidos hechos de varias capas: (original, desde, hasta, ganancia, tono). `tono` > 1, más agudo y corto.
MEZCLAS = {
    # El caballero a pie: su paso, más grave, con el tintineo de la armadura.
    'paso_armadura-1': ([('pixabay/pasos/397989-footsteps-on-wood.mp3', 0.585, 1.0, 1.0, 0.85),
                         ('pixabay/armadura/6890-armor.mp3', 1.875, 2.25, 0.45, 1.0)], 0.003, 0.15),
    'paso_armadura-2': ([('pixabay/pasos/397989-footsteps-on-wood.mp3', 1.70, 2.12, 1.0, 0.85),
                         ('pixabay/armadura/6890-armor.mp3', 15.03, 15.4, 0.45, 1.0)], 0.003, 0.15),
    'paso_armadura-3': ([('pixabay/pasos/397989-footsteps-on-wood.mp3', 2.745, 3.16, 1.0, 0.85),
                         ('pixabay/armadura/6890-armor.mp3', 19.77, 20.14, 0.45, 1.0)], 0.003, 0.15),
    # El gigante de piedra: un pisotón de monstruo con el crujido de una piedra encima.
    'paso_gigante-1': ([('pixabay/gigante/162883-monster-footstep.mp3', 0.07, 0.9, 1.0, 1.0),
                        ('pixabay/gigante/6748-stone-steps.mp3', 6.77, 7.25, 0.5, 0.8)], 0.003, 0.3),
    'paso_gigante-2': ([('pixabay/gigante/162883-monster-footstep.mp3', 4.03, 4.86, 1.0, 1.0),
                        ('pixabay/gigante/6748-stone-steps.mp3', 7.29, 7.77, 0.5, 0.8)], 0.003, 0.3),
    'paso_gigante-3': ([('pixabay/gigante/162883-monster-footstep.mp3', 6.11, 6.94, 1.0, 1.0),
                        ('pixabay/gigante/6748-stone-steps.mp3', 7.78, 7.9, 0.5, 0.8)], 0.003, 0.3),
}

def carga(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(SR),
                          '-af', 'highpass=f=50', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)

def tono(x, factor):
    # Más agudo y corto (factor > 1) o más grave y largo, como el `playbackRate` del navegador.
    if factor == 1:
        return x
    donde = np.arange(0, len(x) - 1, factor)
    return np.interp(donde, np.arange(len(x)), x)

def capas(lista):
    trozos = []
    for origen, desde, hasta, ganancia, factor in lista:
        x = carga(ORIGEN / origen)[int(desde * SR):int(hasta * SR)]
        trozos.append(tono(x, factor) * ganancia)
    largo = max(len(t) for t in trozos)
    mezcla = np.zeros(largo)
    for t in trozos:
        mezcla[:len(t)] += t
    return mezcla

def prepara(clave, origen, desde, hasta, entrada, salida, x=None):
    if x is None:
        x = carga(ORIGEN / origen)
        x = x[int(desde * SR):int(hasta * SR)].copy()
    n_in, n_out = max(1, int(entrada * SR)), max(1, int(salida * SR))
    x[:n_in] *= np.linspace(0, 1, n_in)
    x[-n_out:] *= np.linspace(1, 0, n_out) ** 2
    pico = np.abs(x).max()
    x *= 10 ** (-1 / 20) / pico  # a −1 dB
    destino = DESTINO / f'{clave}.mp3'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-c:a', 'libmp3lame', '-b:a', '112k', str(destino)],
                   input=x.astype(np.float32).tobytes(), check=True)
    return len(x) / SR, destino.stat().st_size

if __name__ == '__main__':
    DESTINO.mkdir(parents=True, exist_ok=True)
    total = 0
    pedidos = sys.argv[1:]
    for clave, (origen, desde, hasta, entrada, salida) in SONIDOS.items():
        if pedidos and clave not in pedidos:
            continue
        dur, peso = prepara(clave, origen, desde, hasta, entrada, salida)
        total += peso
        print(f'{clave:15s} {dur:4.2f} s  {peso / 1024:5.1f} KB')
    for clave, (lista, entrada, salida) in MEZCLAS.items():
        if pedidos and clave not in pedidos:
            continue
        dur, peso = prepara(clave, None, 0, 0, entrada, salida, x=capas(lista))
        total += peso
        print(f'{clave:15s} {dur:4.2f} s  {peso / 1024:5.1f} KB')
    print(f'en total {total / 1024:.0f} KB')
