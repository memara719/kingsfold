"""Chiptune sound effects made on the fly from square waves and noise. No sound files.
If the computer or browser has no sound, everything here quietly does nothing."""

import array
import math
import random

import pygame

RATE = 22050
_sounds = {}
enabled = True


def _tone(notes, vol=0.25, noise=False, slide=0):
    """notes: list of (midi note or None for noise, seconds)."""
    buf = array.array('h')
    for note, dur in notes:
        n = int(RATE * dur)
        f = 440 * 2 ** ((note - 69) / 12) if note else 0
        for i in range(n):
            env = 1 - i / n
            if noise or not note:
                v = random.uniform(-1, 1)
            else:
                ff = f * (1 + slide * i / n)
                v = 1 if math.sin(2 * math.pi * ff * i / RATE) >= 0 else -1
            buf.append(int(v * env * vol * 32767))
    return buf


def init():
    global enabled
    try:
        pygame.mixer.init(RATE, -16, 1, 512)
        make = lambda b: pygame.mixer.Sound(buffer=b.tobytes())
        _sounds['click'] = make(_tone([(84, 0.03)], 0.15))
        _sounds['roll'] = make(_tone([(None, 0.05), (None, 0.05), (None, 0.05), (None, 0.05), (72, 0.06)], 0.18))
        _sounds['coin'] = make(_tone([(83, 0.05), (88, 0.14)], 0.18))
        _sounds['build'] = make(_tone([(55, 0.06), (60, 0.07)], 0.25))
        _sounds['turn'] = make(_tone([(67, 0.08), (72, 0.08), (76, 0.08), (79, 0.12)], 0.16))
        _sounds['error'] = make(_tone([(45, 0.16)], 0.18, slide=-0.2))
        _sounds['steal'] = make(_tone([(76, 0.22)], 0.16, slide=-0.5))
        _sounds['siren'] = make(_tone([(70, 0.25), (75, 0.25), (70, 0.25), (75, 0.25)], 0.14))
        _sounds['boom'] = make(_tone([(None, 1.2)], 0.45))
        _sounds['win'] = make(_tone([(60, 0.1), (64, 0.1), (67, 0.1), (72, 0.1), (76, 0.1), (79, 0.1), (84, 0.4)], 0.18))
    except Exception:
        enabled = False


def play(name):
    if enabled and name in _sounds:
        try:
            _sounds[name].play()
        except Exception:
            pass
