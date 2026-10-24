"""Draw-every-frame UI on the pixel screen: RPG windows, bevelled buttons and a pointing glove.
Each frame, widgets register the screen areas they own; a click goes to the topmost one."""

import pygame
from font import text, width, fit, wrap, LINE
from art import sprite, icon, INK

C = {
    'white': (255, 255, 255), 'soft': (184, 196, 248), 'dim': (124, 136, 200), 'gold': (248, 208, 72),
    'red': (255, 122, 100), 'green': (140, 248, 72), 'parch': (244, 232, 200), 'parch_shade': (216, 196, 156),
    'parch_ink': (58, 42, 24), 'out': (8, 8, 24), 'border': (240, 240, 248), 'border_shade': (144, 152, 192),
}
# windows go from teal to deep navy: atomic-age blue
WIN_TOP, WIN_BOT = (46, 92, 176), (16, 28, 96)
BTN = {
    'blue': ((76, 116, 212), (124, 156, 244), (36, 56, 140), (255, 255, 255)),
    'red': ((204, 60, 44), (248, 128, 108), (120, 24, 16), (255, 255, 255)),
    'green': ((60, 168, 64), (130, 228, 110), (20, 90, 28), (255, 255, 255)),
    'gold': ((240, 192, 64), (255, 244, 168), (160, 108, 16), (58, 36, 8)),
    'off': ((42, 52, 120), (58, 70, 144), (22, 28, 80), (108, 120, 184)),
}
GLOVE = ['  kkkk      ', 'kkWWWWkkkkk ', 'kWWWWWWWWWWk', 'kWWWWWkkkkk ', 'kWWWWWWk    ', 'kWWWWWWk    ', 'kgWWWWgk    ', ' kkkkkk     ']


def mix(a, b, f):
    return tuple(round(a[i] + (b[i] - a[i]) * f) for i in range(3))


class UI:
    def __init__(self, surface):
        self.s = surface
        self.regions, self.prev = [], []
        self.mx = self.my = -1
        self.down = False
        self.hover_key = None
        self.t = 0
        self.glove = sprite(GLOVE, {'k': (16, 16, 24), 'W': (255, 255, 255), 'g': (184, 184, 200)}, None)

    def begin(self, t):
        self.t = t
        self.prev, self.regions = self.regions, []
        top = self.top_at(self.prev, self.mx, self.my)
        self.hover_key = top['key'] if top else None

    @staticmethod
    def top_at(regions, x, y):
        for r in reversed(regions):
            if r['x'] <= x < r['x'] + r['w'] and r['y'] <= y < r['y'] + r['h']:
                return r
        return None

    def hit(self, x, y, w, h, fn=None, key=None, xy=False):
        """Own a screen area this frame. fn() runs on click; with xy=True it gets fn(x, y)."""
        r = {'x': x, 'y': y, 'w': w, 'h': h, 'fn': fn, 'xy': xy, 'key': key or f'{x},{y},{w},{h}'}
        self.regions.append(r)
        return self.hover_key == r['key']

    def block(self, x, y, w, h):
        self.hit(x, y, w, h, None, f'block{x},{y}')

    def click(self, x, y):
        r = self.top_at(self.regions, x, y)
        if r and r['fn']:
            r['fn'](x, y) if r['xy'] else r['fn']()
            return True
        return False

    def window(self, x, y, w, h):
        s = self.s
        s.fill(C['out'], (x + 1, y, w - 2, h))
        s.fill(C['out'], (x, y + 1, w, h - 2))
        s.fill(C['border'], (x + 2, y + 1, w - 4, h - 2))
        s.fill(C['border'], (x + 1, y + 2, w - 2, h - 4))
        s.fill(C['border_shade'], (x + 3, y + h - 3, w - 5, 1))
        s.fill(C['border_shade'], (x + w - 3, y + 3, 1, h - 5))
        ix, iy, iw, ih, bands = x + 3, y + 3, w - 6, h - 6, 8
        for i in range(bands):
            y0, y1 = iy + ih * i // bands, iy + ih * (i + 1) // bands
            s.fill(mix(WIN_TOP, WIN_BOT, i / (bands - 1)), (ix, y0, iw, y1 - y0))
        for cx, cy in ((ix, iy), (ix + iw - 1, iy), (ix, iy + ih - 1), (ix + iw - 1, iy + ih - 1)):
            s.set_at((cx, cy), C['out'])

    def button(self, x, y, w, h, label, fn, kind='blue', enabled=True, selected=False, key=None, glove=True, content=None, align='center', label_color=None):
        face, hi, lo, ink = BTN['off' if not enabled else 'gold' if selected else kind]
        hot = self.hit(x, y, w, h, fn if enabled else None, key or f'b:{label}:{x},{y}')
        pressed = hot and enabled and self.down
        s = self.s
        s.fill(C['out'], (x + 1, y, w - 2, h))
        s.fill(C['out'], (x, y + 1, w, h - 2))
        s.fill(lo if pressed else hi, (x + 1, y + 1, w - 2, h - 2))
        s.fill(hi if pressed else lo, (x + 2, y + 2, w - 3, h - 3))
        s.fill(mix(face, (255, 255, 255), 0.18) if hot and enabled and not selected else face, (x + 2, y + 2, w - 4, h - 4))
        ty = y + (h - 7) // 2 + (1 if pressed else 0)
        shadow = None if selected or kind == 'gold' and enabled else (16, 16, 48)
        if label:
            col = label_color or ink
            if align == 'left':
                text(s, label, x + 5, ty, col, shadow)
            else:
                text(s, label, x + w / 2, ty, col, shadow, align='center')
        if content:
            content(x, y, pressed)
        if hot and enabled and glove:
            s.blit(self.glove, (x - 11 + (self.t // 8) % 2, y + (h - 8) // 2))
        return hot

    def label(self, s, x, y, color=C['white'], **kw):
        return text(self.s, s, x, y, color, **kw)


__all__ = ['UI', 'C', 'text', 'width', 'fit', 'wrap', 'LINE', 'icon', 'INK']
