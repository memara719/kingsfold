"""Draws the island at 288x184 pixels: land, sea, pieces, glowing build spots and little animations.
The screen shows the middle 188x168 of it (the island plus a band of sea)."""

import math
import pygame
from board import GEO, CENTER
from rules import TERRAIN_RES
from art import sprite, piece, icon, atom, TREE, TREE_PAL, INK, S, PAL

W, H = 320, 260
R, S3, OX, OY = 22, math.sqrt(3), 160, 130
VX, VY, VW, VH = 60, 16, 200, 228
K = R / 18          # decorations were placed for 18-pixel hexes; spread them to fit

TERRAIN = {
    'forest': [(29, 82, 38), (36, 102, 48), (46, 122, 56)],
    'quarry': [(168, 150, 120), (196, 178, 146), (220, 204, 172)],
    'farm': [(200, 148, 48), (220, 172, 64), (236, 200, 92)],
    'mill': [(118, 70, 50), (146, 90, 62), (168, 110, 78)],
    'mine': [(52, 44, 64), (70, 60, 84), (92, 80, 108)],
    'lab': [(150, 160, 170), (186, 196, 204), (214, 222, 228)],
    'crater': [(34, 26, 24), (52, 40, 34), (74, 58, 46)],
}
SEA = [(58, 122, 208), (40, 96, 184), (28, 76, 156), (22, 60, 132)]
DIGITS = {'0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
          '3': ['111', '001', '011', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
          '6': ['111', '100', '111', '101', '111'], '8': ['111', '101', '111', '101', '111'], '9': ['111', '101', '111', '001', '111']}


def hash01(x, y):
    n = (x * 374761393 + y * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    n ^= n >> 16
    return (n % 1000) / 1000


def cube_round(q, r):
    x, z = q, r
    y = -x - z
    rx, ry, rz = round(x), round(y), round(z)
    dx, dy, dz = abs(rx - x), abs(ry - y), abs(rz - z)
    if dx > dy and dx > dz:
        rx = -ry - rz
    elif dy > dz:
        ry = -rx - rz
    else:
        rz = -rx - ry
    return rx, rz


AXIAL = {(h['q'], h['r']): h['id'] for h in GEO.hexes}


def hex_at(x, y, rad=R):
    px, py = x + 0.5 - OX, y + 0.5 - OY
    q, r = cube_round((S3 / 3 * px - py / 3) / rad, (2 / 3 * py) / rad)
    return AXIAL.get((q, r), -1)


VPOS = [(round(OX + R * v['x']), round(OY + R * v['y'])) for v in GEO.vertices]
HPOS = [(round(OX + R * h['x']), round(OY + R * h['y'])) for h in GEO.hexes]
EPOS = [((VPOS[e['a']][0] + VPOS[e['b']][0]) / 2, (VPOS[e['a']][1] + VPOS[e['b']][1]) / 2) for e in GEO.edges]


def texture(kind, x, y):
    n = hash01(x, y)
    p = TERRAIN[kind]
    if kind == 'forest':
        return p[0 if n < 0.35 else 1 if n < 0.9 else 2]
    if kind == 'quarry':
        row = y // 4
        return p[0] if y % 4 == 0 or (x + row * 3) % 7 == 0 else p[2 if n > 0.8 else 1]
    if kind == 'farm':
        return p[0] if y % 3 == 0 else p[2 if n > 0.75 else 1]
    if kind == 'mill':
        return p[0] if (x - y) % 6 == 0 else p[2 if n > 0.9 else 1]
    if kind == 'mine':
        return (90, 200, 70) if n > 0.985 else p[0 if n < 0.3 else 2 if n > 0.9 else 1]
    if kind == 'lab':
        return p[0] if x % 4 == 0 or y % 4 == 0 else p[2 if n > 0.6 else 1]
    if kind == 'crater':
        return (110, 220, 70) if n > 0.97 else p[0 if n < 0.4 else 2 if n > 0.85 else 1]
    return (255, 0, 255)


def lighten(c):
    return (min(255, c[0] + 44), min(255, c[1] + 44), min(255, c[2] + 38))


_shared = {}


def _maps():
    """Which land each pixel belongs to, each land's outline, and the sea. Worked out once, then shared."""
    if not _shared:
        ids = [[hex_at(x, y) for x in range(W)] for y in range(H)]
        border = [[] for _ in GEO.hexes]
        for y in range(1, H - 1):
            row = ids[y]
            for x in range(1, W - 1):
                i = row[x]
                if i >= 0 and (row[x + 1] != i or ids[y + 1][x] != i or row[x - 1] != i or ids[y - 1][x] != i):
                    border[i].append((x, y))
        _shared.update(ids=ids, border=border)
    return _shared


class BoardView:
    def __init__(self):
        self.surf = pygame.Surface((W, H))
        self.bg = pygame.Surface((W, H))
        m = _maps()
        self.id, self.border = m['ids'], m['border']
        self.sea = None
        self.waves = []
        self.key = None
        self.floats = []
        self.blast = None

    def _sea(self):
        sea = pygame.Surface((W, H))
        px = pygame.PixelArray(sea)
        self.waves = []
        for y in range(H):
            for x in range(W):
                if hex_at(x, y, R * 1.07) >= 0:
                    c = (216, 188, 120) if hash01(x, y) > 0.8 else (236, 212, 148)
                elif hex_at(x, y, R * 1.12) >= 0:
                    c = (232, 244, 255) if (x + y) % 2 else SEA[0]
                elif hex_at(x, y, R * 1.3) >= 0:
                    c = SEA[0]
                elif hex_at(x, y, R * 1.55) >= 0:
                    c = SEA[(x + y) % 2]
                elif hex_at(x, y, R * 1.9) >= 0:
                    c = SEA[1]
                elif hex_at(x, y, R * 2.3) >= 0:
                    c = SEA[1 + (x + y) % 2]
                else:
                    c = SEA[3] if x % 2 == 0 and y % 2 == 0 else SEA[2]
                px[x, y] = c
                if hex_at(x, y, R * 1.25) < 0 and hash01(x * 3, y * 7) > 0.9965:
                    self.waves.append((x, y, int(hash01(x, y) * 40)))
        del px
        return sea

    def set_board(self, hexes):
        key = tuple((h['terrain'], h['number'], h['crater']) for h in hexes)
        if key == self.key:
            return
        self.key = key
        if self.sea is None:
            if 'sea' not in _shared:
                _shared['sea'] = self._sea()
                _shared['waves'] = self.waves
            self.sea, self.waves = _shared['sea'], _shared['waves']
        b = self.bg
        b.blit(self.sea, (0, 0))
        px = pygame.PixelArray(b)
        for y in range(H):
            row = self.id[y]
            for x in range(W):
                i = row[x]
                if i < 0:
                    continue
                kind = 'crater' if hexes[i]['crater'] else hexes[i]['terrain']
                c = texture(kind, x, y)
                dn = self.id[min(H - 1, y + 1)][x]
                rt = row[min(W - 1, x + 1)]
                if dn != i or rt != i:
                    c = (42, 28, 20)
                elif self.id[max(0, y - 1)][x] != i or row[max(0, x - 1)] != i:
                    c = lighten(c)
                px[x, y] = c
        del px
        self.mines, self.mills = [], []
        for i, h in enumerate(hexes):
            cx, cy = HPOS[i]
            kind = 'crater' if h['crater'] else h['terrain']
            self.decorate(b, kind, cx, cy, i)
        for i, h in enumerate(hexes):
            if h['number'] and not h['crater']:
                self.token(b, HPOS[i][0], HPOS[i][1] + 9, h['number'])

    def decorate(self, b, kind, cx, cy, i):
        if kind == 'forest':
            for dx, dy in [(-7, -8), (0, -12), (7, -8), (-11, -1), (-3, -3), (10, 0), (4, -1), (-9, 6), (8, 6)]:
                b.blit(sprite(TREE, TREE_PAL, None), (cx + round(dx * K) - 3, cy + round(dy * K) - 3))
        elif kind == 'quarry':
            blk = {'q': (200, 192, 180), 'Q': (150, 142, 130)}
            for dx, dy in [(-10, -6), (-4, -6), (-7, -10), (5, -4)]:
                b.blit(sprite(['qqqqQ', 'qqqqQ', 'QQQQQ'], blk), (cx + round(dx * K), cy + round(dy * K)))
            # a little crane
            pygame.draw.line(b, (230, 170, 40), (cx + 9, cy - 1), (cx + 9, cy - 13))
            pygame.draw.line(b, (230, 170, 40), (cx + 9, cy - 13), (cx + 1, cy - 13))
            pygame.draw.line(b, INK, (cx + 2, cy - 13), (cx + 2, cy - 9))
        elif kind == 'farm':
            barn = ['  rrr  ', ' rrrrr ', 'rrrrrrr', 'RRWWWRR', 'RRWkWRR']
            b.blit(sprite(barn, {'r': (204, 56, 44), 'R': (150, 36, 30), 'W': (240, 232, 214), 'k': INK}), (cx - 11, cy - 10))
            b.blit(sprite([' BBB ', 'ByyYB', 'ByYYB', 'BBBBB'], {'B': (122, 78, 28), 'y': (248, 220, 112), 'Y': (200, 148, 48)}, None), (cx + 3, cy - 6))
            b.blit(sprite(['gg', 'gg', 'gg', 'gg'], {'g': (200, 200, 210)}), (cx - 2, cy - 12))
        elif kind == 'mill':
            mill = ['m  m    ', 'm  m    ', 'mm mm   ', 'MMMMMMMM', 'MoMMoMMM', 'MMMMMMMM']
            b.blit(sprite(mill, {'m': (120, 112, 120), 'M': (70, 64, 76), 'o': (248, 150, 50)}), (cx - 8, cy - 13))
            self.mills.append((cx - 7, cy - 14, i))
        elif kind == 'mine':
            frame = ['  kkk  ', ' k   k ', '  k k  ', '   k   ', '  k k  ', ' k   k ', 'kkkkkkk']
            b.blit(sprite(frame, {'k': (226, 180, 96)}), (cx - 4, cy - 15))
            b.fill((20, 16, 24), (cx - 3, cy - 8, 6, 2))
            b.blit(sprite(['nnn', 'nNn'], {'n': (140, 248, 72), 'N': (60, 170, 40)}), (cx + 5, cy - 6))
            self.mines.append((cx, cy, i))
        elif kind == 'lab':
            # the Atomic Lab: a dome with a tall antenna
            pygame.draw.circle(b, INK, (cx, cy + 1), 11)
            pygame.draw.circle(b, (214, 230, 240), (cx, cy + 1), 10)
            pygame.draw.circle(b, (170, 196, 214), (cx + 2, cy + 3), 8)
            b.fill((150, 160, 170), (cx - 13, cy + 3, 27, 10))
            b.fill(INK, (cx - 13, cy + 12, 27, 1))
            b.fill((80, 140, 210), (cx - 9, cy + 6, 3, 3))
            b.fill((80, 140, 210), (cx + 7, cy + 6, 3, 3))
            b.fill((60, 44, 30), (cx - 2, cy + 7, 4, 5))
            pygame.draw.line(b, (200, 200, 210), (cx, cy - 9), (cx, cy - 17))
        elif kind == 'crater':
            pygame.draw.circle(b, (20, 14, 14), (cx, cy - 1), 8)
            pygame.draw.circle(b, (60, 150, 50), (cx, cy - 1), 5)
            pygame.draw.circle(b, (130, 240, 80), (cx, cy - 1), 3)

    def token(self, b, cx, cy, n):
        for dy in range(-5, 6):
            for dx in range(-5, 6):
                d = dx * dx + dy * dy
                if d <= 20:
                    b.set_at((cx + dx, cy + dy), (216, 196, 156) if d > 12 and dy > 0 else (244, 232, 200))
                elif d <= 30:
                    b.set_at((cx + dx, cy + dy), (60, 44, 28))
        s = str(n)
        red = n in (6, 8)
        sx = cx - (len(s) * 4 - 1) // 2
        for k, ch in enumerate(s):
            for gy, row in enumerate(DIGITS[ch]):
                for gx, bit in enumerate(row):
                    if bit == '1':
                        b.set_at((sx + k * 4 + gx, cy - 2 + gy), (200, 32, 32) if red else (60, 44, 28))

    # ---------- per frame ----------

    def float(self, hex_id, res, delay=0):
        x, y = HPOS[hex_id]
        self.floats.append([x - 5 + (hash01(len(self.floats), hex_id) - 0.5) * 8, y - 4, res, pygame.time.get_ticks() + delay])

    def boom(self, hex_id):
        self.blast = (hex_id, pygame.time.get_ticks())

    def render(self, g, targets, hover, t, colors):
        s = self.surf
        s.blit(self.bg, (0, 0))
        self.ambient(s, t)
        if g:
            self.pieces(s, g, t, colors)
            if targets:
                self.highlights(s, targets, hover, t)
        self.draw_floats(s)
        self.draw_blast(s)
        return s

    def ambient(self, s, t):
        for x, y, ph0 in self.waves:
            ph = (t // 5 + ph0) % 40
            if ph < 7:
                off = 0 if ph < 3 else 1
                s.fill((156, 202, 244), (x + off, y, 3, 1))
        for cx, cy, i in self.mills:
            for k in range(3):
                for stack in (0, 3):
                    ph = (t * 0.4 + k * 9 + stack * 5 + i * 7) % 26
                    c = (230, 230, 230) if ph < 8 else (176, 176, 186) if ph < 16 else (130, 130, 144)
                    s.fill(c, (round(cx + stack + math.sin((ph + i) * 0.3) + ph * 0.1), round(cy - ph * 0.5), 2 if ph > 10 else 1, 1))
        for cx, cy, i in self.mines:
            glow = (140, 248, 72) if (t // 8 + i) % 3 else (220, 255, 160)
            for dx, dy in [(-8, 2), (6, 4), (-3, 6), (9, -3), (-10, -4)]:
                s.fill(glow if (dx + t // 6) % 4 else (70, 170, 50), (cx + dx, cy + dy, 2, 2))
        cx, cy = HPOS[CENTER]
        atom(s, cx, cy - 2, t, 8)
        s.fill((255, 80, 60) if (t // 10) % 2 else (120, 30, 30), (cx, cy - 18, 1, 1))
        boat = ['   W  ', '   WW ', '   WWW', '   b  ', 'bbbbbbb', ' BBBBB ']
        flip = [r.ljust(7)[::-1] for r in boat]
        bp = {'W': (248, 244, 232), 'b': (160, 112, 60), 'B': (90, 52, 24)}
        s.blit(sprite(boat if math.cos(t * 0.004) >= 0 else flip, bp), (round(VX + 18 + math.sin(t * 0.004) * 12), VY + 12 + (t // 20) % 2))
        sub = ['    yy    ', ' gggggggg ', 'gggggggggg', ' GGGGGGGG ']
        s.blit(sprite(sub, {'g': (232, 200, 64), 'G': (180, 140, 40), 'y': (200, 200, 210)}), (round(VX + VW - 36 + math.sin(t * 0.005 + 2) * 10), VY + VH - 16 + (t // 24) % 2))

    def pieces(self, s, g, t, colors):
        for e, owner in enumerate(g.roads):
            if owner is None:
                continue
            ed = GEO.edges[e]
            (ax, ay), (bx, by) = VPOS[ed['a']], VPOS[ed['b']]
            n = max(abs(bx - ax), abs(by - ay))
            col = colors[owner][0]
            for k in range(2, n - 1):
                x, y = round(ax + (bx - ax) * k / n), round(ay + (by - ay) * k / n)
                s.fill(INK, (x - 1, y - 1, 3, 3))
            for k in range(2, n - 1):
                x, y = round(ax + (bx - ax) * k / n), round(ay + (by - ay) * k / n)
                s.fill(col, (x, y - 1, 1, 2))
        if g.cloud != CENTER:
            hx, hy = HPOS[g.cloud]
            for dy in range(-5, 6):
                for dx in range(-5, 6):
                    if dx * dx + dy * dy <= 20 and (dx + dy) % 2 == 0:
                        s.set_at((hx + dx, hy + 9 + dy), (40, 60, 20))
        for v, b in enumerate(g.buildings):
            if not b:
                continue
            col, shade = colors[b['owner']]
            img = piece(b['kind'], col, shade)
            x, y = VPOS[v]
            s.blit(img, (x - img.get_width() // 2, y - img.get_height() + 3))
            if b['shelter']:
                s.blit(icon('shelter'), (x + 3, y))
        # the radiation cloud bobs over its land, or waits by the lab
        cx, cy = (HPOS[g.cloud][0] - 7, HPOS[g.cloud][1] - 12) if g.cloud != CENTER else (HPOS[CENTER][0] - 22, HPOS[CENTER][1] + 2)
        bob = (t // 14) % 2
        cloud = ['  ggg   ', ' gGGGgg ', 'gGGkGkGg', 'gGGGGGGg', ' gGgGgg ', '  g g   ']
        s.blit(sprite(cloud, {'g': (200, 240, 112), 'G': (150, 210, 64), 'k': INK}), (cx, cy - bob))

    def highlights(self, s, targets, hover, t):
        kind, ids = targets
        on = (t // 10) % 2 == 0
        glow = (255, 255, 255) if on else (140, 248, 72)
        if kind == 'vertex':
            for i in ids:
                x, y = VPOS[i]
                if i == hover:
                    s.fill(INK, (x - 3, y - 3, 7, 7))
                    s.fill((246, 192, 44), (x - 2, y - 2, 5, 5))
                    continue
                for dy in range(-2, 3):
                    for dx in range(-2, 3):
                        d = abs(dx) + abs(dy)
                        if d <= 2:
                            s.set_at((x + dx, y + dy), INK if d == 2 else glow)
        elif kind == 'edge':
            for i in ids:
                ed = GEO.edges[i]
                (ax, ay), (bx, by) = VPOS[ed['a']], VPOS[ed['b']]
                n = max(abs(bx - ax), abs(by - ay))
                for k in range(3, n - 2):
                    x, y = round(ax + (bx - ax) * k / n), round(ay + (by - ay) * k / n)
                    if i == hover:
                        s.fill(INK, (x - 1, y - 1, 3, 3))
                        s.set_at((x, y), (246, 192, 44))
                    elif k % 2 == (0 if on else 1):
                        s.fill(INK, (x - 1, y - 1, 2, 2))
                        s.set_at((x, y), (255, 255, 255))
        else:
            red = kind == 'bomb'
            for i in ids:
                col = ((255, 80, 60) if red else (246, 192, 44)) if i == hover else ((255, 140, 120) if red else glow)
                if i != hover and not on:
                    continue
                for x, y in self.border[i]:
                    s.set_at((x, y), col)
                if i == hover:
                    hx, hy = HPOS[i]
                    for x, y in self.border[i]:
                        s.set_at((x - (x > hx) + (x < hx), y - (y > hy) + (y < hy)), col)

    def draw_floats(self, s):
        now = pygame.time.get_ticks()
        self.floats = [f for f in self.floats if now - f[3] < 1600]
        for x, y, res, t0 in self.floats:
            age = now - t0
            if age < 0 or (age > 1200 and (age // 80) % 2):
                continue
            s.blit(icon(res), (round(x), round(y) - min(14, age // 50)))

    def draw_blast(self, s):
        if not self.blast:
            return
        h, t0 = self.blast
        age = pygame.time.get_ticks() - t0
        if age > 3000:
            self.blast = None
            return
        cx, cy = HPOS[h]
        if age < 160:
            s.fill((255, 255, 240))
            return
        k = min(1, age / 1400)
        ring = int(6 + 30 * k)
        if age < 1400:
            pygame.draw.circle(s, (255, 230, 140), (cx, cy), ring, 1)
        rise = int(28 * k)
        fade = max(0, 1 - max(0, age - 2000) / 1000)
        stem = (230, 120, 60) if age < 900 else (170, 150, 140)
        cap = (255, 200, 90) if age < 900 else (200, 190, 180)
        s.fill(stem, (cx - 2, cy - rise, 5, rise))
        for dx, r0 in [(-6, 6), (0, 8), (6, 6)]:
            r = max(1, int(r0 * (0.4 + 0.6 * k) * (0.6 + 0.4 * fade)))
            pygame.draw.circle(s, cap, (cx + dx, cy - rise), r)
        pygame.draw.circle(s, (255, 250, 220), (cx, cy - rise - 2), max(1, int(3 * fade)))
        pygame.draw.ellipse(s, stem, (cx - 10, cy - 2, 20, 6))

    # board positions under the pointer
    def vertex_at(self, x, y, ids, max_d=10):
        return _nearest(ids, VPOS, x, y, max_d)

    def edge_at(self, x, y, ids, max_d=9):
        return _nearest(ids, EPOS, x, y, max_d)

    def hex_at(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            return self.id[int(y)][int(x)]
        return -1


def _nearest(ids, pos, x, y, max_d):
    best, bd = None, max_d * max_d
    for i in ids:
        px, py = pos[i]
        d = (px - x) ** 2 + (py - y) ** 2
        if d <= bd:
            best, bd = i, d
    return best
