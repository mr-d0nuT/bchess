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
    'mareo':          ('voces/varios/7120-cartoon-spin.mp3', 0.06, 1.95, 0.005, 0.3),
    # La reina blanca: el rayo de escarcha que corre por el suelo (crece hasta el impacto) y el hielo que
    # encierra al rival.
    'hielo_rayo':     ('pixabay/hielo2/499662-frost-spell-impact.mp3', 0.75, 3.5, 0.02, 0.6),
    'hielo_encierra': ('pixabay/hielo2/448564-elemental-spell-impact-ice.mp3', 1.0, 3.3, 0.02, 0.6),
    # El rey: su pistola (tres disparos distintos), amartillarla, y el trueno de su rayo.
    'disparo-1':      ('pixabay/pistola/7152-9mm-pistol-shoot-short-reverb.mp3', 0.0, 1.14, 0.002, 0.35),
    'disparo-2':      ('pixabay/pistola/37187-single-pistol-gunshot-3-3.mp3', 0.03, 0.9, 0.002, 0.3),
    'disparo-3':      ('pixabay/pistola/233473-pistol-shot.mp3', 0.15, 1.19, 0.002, 0.35),
    'amartillar':     ('pixabay/pistola/6014-pistol-cock.mp3', 0.12, 0.6, 0.002, 0.08),
    'trueno-1':       ('pixabay/trueno/521194-thunder-clap.mp3', 0.56, 4.6, 0.003, 1.4),
    'trueno-2':       ('pixabay/trueno/99753-big-thunder-clap.mp3', 0.14, 4.2, 0.003, 1.4),
    # El gigante: su martillazo contra el suelo.
    'martillazo-1':   ('pixabay/suelo/487673-boulder-impact.mp3', 0.0, 1.43, 0.002, 0.4),
    'martillazo-2':   ('pixabay/suelo/352053-ground-impact.mp3', 0.18, 0.98, 0.002, 0.25),

    # LAS VOCES, sin palabras. Hombre (peones, caballeros, alfiles, reyes):
    # gritos de guerra, al empezar el combate o al cargar
    'grito_h-1':      ('voces/h_ataque/352707-epic-war-combat-scream.mp3', 0.20, 1.95, 0.01, 0.4),
    'grito_h-2':      ('voces/h_ataque/39931-middle-ages-war-cry-2.mp3', 0.08, 0.95, 0.01, 0.2),
    'grito_h-3':      ('voces/h_ataque/250239-human-roar.mp3', 0.16, 0.95, 0.01, 0.2),
    'grito_h-4':      ('voces/h_ataque/6314-kung-fu-yell.mp3', 2.09, 3.30, 0.01, 0.3),
    'grito_h-5':      ('voces/h_ataque/65945-male-grunts-and-yells.mp3', 8.93, 10.21, 0.01, 0.3),
    # gruñidos al golpear
    'ataque_h-1':     ('voces/h_ataque/544355-male-fighter-heavy-attack-grunt.mp3', 0.04, 0.6, 0.005, 0.12),
    'ataque_h-2':     ('voces/h_ataque/582547-male-fighter-2-heavy-attack-grunt.mp3', 0.06, 0.62, 0.005, 0.12),
    'ataque_h-3':     ('voces/h_ataque/520841-male-soldier-attack-grunt.mp3', 0.04, 0.45, 0.005, 0.1),
    'ataque_h-4':     ('voces/h_ataque/490291-rpg-knight-attack-grunt.mp3', 0.07, 1.1, 0.005, 0.25),
    'ataque_h-5':     ('voces/h_ataque/45747-male-attack-grunt.mp3', 0.25, 0.72, 0.005, 0.12),
    'ataque_h-6':     ('voces/h_ataque/520933-male-soldier-attack-grunt-2.mp3', 0.24, 0.65, 0.005, 0.1),
    # quejidos al recibir
    'dolor_h-1':      ('voces/h_dolor/48124-male-hurt7.mp3', 0.08, 0.7, 0.005, 0.15),
    'dolor_h-2':      ('voces/h_dolor/45746-male-grunting-in-pain.mp3', 0.12, 0.55, 0.005, 0.1),
    'dolor_h-3':      ('voces/h_dolor/47202-ough.mp3', 0.38, 0.7, 0.005, 0.1),
    'dolor_h-4':      ('voces/h_dolor/95206-male-hurt-sound.mp3', 0.18, 0.8, 0.005, 0.15),
    'dolor_h-5':      ('voces/h_dolor/43811-ouch.mp3', 0.57, 1.25, 0.005, 0.15),
    # gritos al caer o morder el polvo
    'caida_h-1':      ('voces/h_caida/123078-male-death-scream.mp3', 0.13, 1.6, 0.005, 0.35),
    'caida_h-2':      ('voces/h_caida/352706-male-death-scream-horror.mp3', 0.07, 1.27, 0.005, 0.3),
    'caida_h-3':      ('voces/h_dolor/567203-man-pain-scream.mp3', 0.04, 1.6, 0.005, 0.4),
    'caida_h-4':      ('voces/h_dolor/567205-man-pain-scream-02.mp3', 0.05, 1.6, 0.005, 0.4),
    # por los aires (el peón de la justa, el jinete que tira el caballo)
    'vuela_h':        ('voces/h_caida/326183-male-falling-scream.mp3', 0.10, 2.2, 0.005, 0.6),
    # cómicos
    'ay_comico':      ('voces/h_dolor/543564-comical-ouch-1.mp3', 0.02, 0.72, 0.003, 0.15),
    'huh-1':          ('voces/varios/88084-huh.mp3', 0.17, 0.5, 0.003, 0.08),
    'huh-2':          ('voces/varios/352694-confused-male-huh.mp3', 0.23, 0.8, 0.003, 0.12),
    'decepcion':      ('voces/h_dolor/8277-aww.mp3', 0.30, 1.66, 0.01, 0.35),
    # victorias de las blancas: ¡yahoo!, ¡woohoo!, ¡hurra! y risas
    'victoria_h-1':   ('voces/h_victoria/92956-yahoo-2.mp3', 0.58, 3.4, 0.01, 0.6),
    'victoria_h-2':   ('voces/h_victoria/108116-yahoo-1.mp3', 0.78, 3.62, 0.01, 0.6),
    'victoria_h-3':   ('voces/h_victoria/92957-yahoo-3.mp3', 0.33, 3.3, 0.01, 0.6),
    'victoria_h-4':   ('voces/h_victoria/92954-woohoo-1.mp3', 0.56, 3.45, 0.01, 0.6),
    'victoria_h-5':   ('voces/h_victoria/36461-hooray.mp3', 0.27, 1.62, 0.01, 0.3),
    'victoria_h-6':   ('voces/h_victoria/104848-yell-laugh.mp3', 0.12, 1.77, 0.01, 0.3),
    'victoria_h-7':   ('voces/h_victoria/242763-silly-laugh-man.mp3', 0.11, 1.65, 0.01, 0.3),
    # y de las negras: risas de villano
    'risa_malvada-1': ('voces/h_victoria/89423-evil-laugh.mp3', 0.14, 2.85, 0.01, 0.5),
    'risa_malvada-2': ('voces/h_victoria/83217-muahaha-evil-laughter.mp3', 0.15, 2.3, 0.01, 0.4),
    'risa_malvada-3': ('voces/h_victoria/140131-mischievous-laugh.mp3', 0.0, 2.65, 0.01, 0.5),

    # Mujer (las reinas):
    'grito_m-1':      ('voces/m_ataque/17275-female-battle-cries-v1.mp3', 2.53, 4.2, 0.01, 0.4),
    'grito_m-2':      ('voces/m_ataque/17275-female-battle-cries-v1.mp3', 32.65, 34.62, 0.01, 0.4),
    'grito_m-3':      ('voces/m_ataque/17275-female-battle-cries-v1.mp3', 72.5, 73.4, 0.01, 0.2),
    'grito_m-4':      ('voces/m_ataque/17275-female-battle-cries-v1.mp3', 92.95, 93.7, 0.01, 0.2),
    'grito_m-5':      ('voces/m_ataque/144242-angry-female.mp3', 0.13, 1.7, 0.01, 0.3),
    'ataque_m-1':     ('voces/m_ataque/481720-female-attack-grunt.mp3', 0.1, 0.46, 0.005, 0.1),
    'ataque_m-2':     ('voces/m_ataque/544351-female-fighter-heavy-attack-grunt.mp3', 0.06, 0.8, 0.005, 0.15),
    'ataque_m-3':     ('voces/m_ataque/17275-female-battle-cries-v1.mp3', 46.02, 46.5, 0.005, 0.1),
    'ataque_m-4':     ('voces/m_ataque/17275-female-battle-cries-v1.mp3', 52.1, 52.4, 0.005, 0.08),
    'dolor_m-1':      ('voces/m_dolor/38861-ow.mp3', 0.27, 0.83, 0.005, 0.15),
    'dolor_m-2':      ('voces/m_dolor/94301-female-hurt-2.mp3', 0.13, 0.5, 0.005, 0.12),
    'dolor_m-3':      ('voces/m_dolor/84687-cartoon-angry-woman-scream.mp3', 0.1, 1.15, 0.005, 0.25),
    'caida_m-1':      ('voces/m_dolor/251068-female-scream-longer.mp3', 0.87, 1.5, 0.005, 0.15),
    'caida_m-2':      ('voces/m_dolor/191977-scared-woman-scream.mp3', 0.19, 1.1, 0.005, 0.2),
    'caida_m-3':      ('voces/m_dolor/251067-female-scream-short.mp3', 0.83, 1.2, 0.005, 0.1),
    'victoria_m-1':   ('voces/m_victoria/186736-woman-says-woo.mp3', 0.03, 1.15, 0.01, 0.25),
    'victoria_m-2':   ('voces/m_victoria/186739-woman-says-woohoo.mp3', 1.23, 2.37, 0.01, 0.25),
    'victoria_m-3':   ('voces/m_victoria/149491-girl-laugh.mp3', 0.49, 2.27, 0.01, 0.4),
    'risa_bruja-1':   ('voces/m_victoria/401713-witch-laugh.mp3', 0.01, 0.95, 0.005, 0.2),
    'risa_bruja-2':   ('voces/m_victoria/140135-evil-witch-laugh.mp3', 0.04, 2.4, 0.01, 0.4),

    # El gigante de la torre:
    'rugido-1':       ('voces/gigante/199380-monster-growl-roar-2.mp3', 0.1, 1.35, 0.005, 0.3),
    'rugido-2':       ('voces/gigante/199377-monster-growl-roar-4.mp3', 0.05, 0.92, 0.005, 0.2),
    'rugido-3':       ('voces/gigante/199376-monster-growl-roar-3.mp3', 0.02, 0.48, 0.005, 0.1),
    'rugido-4':       ('voces/gigante/195717-large-monster-roar.mp3', 0.04, 1.9, 0.005, 0.4),
    'rugido-5':       ('voces/gigante/6985-monster-roar.mp3', 0.1, 1.93, 0.005, 0.4),
    'gigante_dolor-1': ('voces/gigante/199381-monster-growl-roar-6.mp3', 0.04, 1.52, 0.005, 0.4),
    'gigante_dolor-2': ('voces/gigante/199379-monster-growl-roar-1.mp3', 0.05, 1.13, 0.005, 0.3),
    'gigante_dolor-3': ('voces/gigante/97413-low-monster-roar.mp3', 0.16, 2.5, 0.01, 0.6),
    'gigante_victoria-1': ('voces/gigante/98277-dragon-shout-roar.mp3', 0.16, 2.62, 0.01, 0.5),
    'gigante_victoria-2': ('voces/gigante/104325-big-monster-shout.mp3', 0.5, 3.4, 0.01, 0.7),
    'gigante_victoria-3': ('voces/gigante/195877-monster-warrior-roar.mp3', 0.12, 2.6, 0.01, 0.6),
    # El peón que se estira en reposo: un quejido de esfuerzo al doblarse y un suspiro al erguirse.
    'esfuerzo-1':     ('voces/esfuerzo/82041-groan-crescendo.mp3', 0.62, 1.5, 0.01, 0.15),
    'esfuerzo-2':     ('voces/esfuerzo/352731-male-exertion-grunts-02.mp3', 1.06, 1.85, 0.01, 0.15),
    'esfuerzo-3':     ('voces/esfuerzo/352731-male-exertion-grunts-02.mp3', 0.3, 0.95, 0.01, 0.12),
    'esfuerzo-4':     ('voces/esfuerzo/80175-groan-by-adam.mp3', 0.2, 0.62, 0.01, 0.12),
    'alivio-1':       ('voces/esfuerzo/92290-sigh-groan.mp3', 0.9, 2.85, 0.02, 0.35),
    'alivio-2':       ('voces/esfuerzo/68824-man-sighing.mp3', 0.3, 1.32, 0.02, 0.3),
    'alivio-3':       ('voces/esfuerzo/68824-man-sighing.mp3', 13.38, 14.45, 0.02, 0.3),
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
