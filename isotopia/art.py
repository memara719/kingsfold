"""Hand-placed pixel sprites for Isotopia. Each row is a string; each letter a palette colour; spaces are see-through."""

import math
import pygame

INK = (22, 18, 28)
PAL = {
    'k': INK, 'W': (255, 255, 255), 'w': (200, 196, 208), 'y': (246, 192, 44), 'Y': (184, 134, 28),
    'c': (244, 220, 168), 'b': (160, 112, 60), 'B': (90, 52, 24), 'g': (212, 216, 224), 'G': (108, 116, 128),
    'r': (216, 52, 44), 'R': (138, 28, 28), 'u': (120, 192, 248), 'U': (40, 96, 184), 'e': (108, 192, 64),
    'E': (44, 122, 44), 'n': (140, 248, 72), 'N': (56, 168, 40), 'o': (232, 138, 58), 's': (240, 200, 160),
    'p': (176, 112, 224), 'm': (96, 92, 110), 'M': (60, 56, 70), 'q': (180, 172, 160), 'Q': (140, 132, 120),
}

S = {
    'lumber': ['  bbbbbbbb ', 'bcYcbbbbbbB', 'cYcYcbbbBBB', 'bcYcbbbBBB ', ' bbbbbBBB  '],
    'concrete': ['wwwwwwwww', 'wggggggqG', 'wgkgggkqG', 'wggggggqG', 'GGGGGGGGG'],
    'food': ['y y y', ' yyy ', 'y y y', ' yyy ', '  E  ', '  E  '],
    'steel': ['ggggggggg', 'GGGGgGGGG', '   gG    ', '   gG    ', 'ggggggggg', 'GGGGGGGGG'],
    'uranium': ['  nn  ', ' nNnn ', 'nNWnNn', 'nnnNnn', ' nNnn '],
    'crown': ['y  y  y', 'yy y yy', 'yyyyyyy', 'yryyyry', 'yyyyyyy'],
    'card': ['kkkkkkk', 'kWWWWWk', 'kWnWnWk', 'kWnnnWk', 'kWWWWWk', 'kWWWWWk', 'kWrWrWk', 'kWWWWWk', 'kkkkkkk'],
    'hourglass': ['kkkkkkk', ' kyyyk ', '  kyk  ', '   k   ', '  kyk  ', ' kyyyk ', 'kkkkkkk'],
    'longroad': ['     yy', '   yyy ', ' yyy   ', 'yy     '],
    'shelter': ['  y  ', ' yky ', 'ykkky', 'yyyyy'],
    'bomb': ['    kk     ', '  kkGGkk   ', ' kGgGGGGkkk', 'kGgGGGGGGyk', 'kGGGGGGGGyk', ' kGGGGGGkkk', '  kkGGkk   ', '    kk     '],
}

HOUSE = ['   PPP   ', ' PPPPPPP ', 'PPPPPPPPP', 'WWbWWWkWW', 'WWbWWWkWW']
TOWN = ['     y     ', '    yyy    ', '     W     ', '     W     ', '   PPWPP   ', ' PPPPWPPPP ', 'PPPPPWPPPPP', 'WbWWbWbWkWW', 'WbWWbWbWkWW']
TREE = ['  kkk  ', ' keeEk ', 'keeeEEk', 'keeEEEk', ' kEEEk ', '  ktk  ', '   t   ']
TREE_PAL = {'k': (16, 58, 28), 'e': (92, 184, 76), 'E': (47, 138, 54), 't': (90, 52, 24)}
PROF = ['   wwwww    ', '  wwwwwww   ', ' wwsssssww  ', ' wsksskssw  ', ' wsssssssw  ', '  sssrsss   ',
        '   sssss    ', ' WWWWuWWWW  ', 'WWWWWuWWWWW ', 'WWkWWuWWkWW ', 'WWWWWWWWWWW ']
PROF_PAL = {'w': (232, 232, 240), 's': (240, 200, 160), 'k': INK, 'r': (200, 80, 70), 'W': (244, 244, 250), 'u': (64, 120, 232)}

_cache = {}


def sprite(rows, pal=None, outline=INK, key=None):
    """Turn rows of letters into a Surface, with a 1-pixel outline around the shape."""
    pal = pal or PAL
    k = key or (tuple(rows), tuple(sorted((a, tuple(b)) for a, b in pal.items())), outline)
    if k in _cache:
        return _cache[k]
    w = max(len(r) for r in rows)
    h = len(rows)
    pad = 1 if outline else 0
    surf = pygame.Surface((w + 2 * pad, h + 2 * pad), pygame.SRCALPHA)

    def solid(i, j):
        return 0 <= j < h and 0 <= i < len(rows[j]) and rows[j][i] != ' '
    if outline:
        for j in range(-1, h + 1):
            for i in range(-1, w + 1):
                if not solid(i, j) and (solid(i - 1, j) or solid(i + 1, j) or solid(i, j - 1) or solid(i, j + 1)):
                    surf.set_at((i + pad, j + pad), outline)
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != ' ':
                surf.set_at((i + pad, j + pad), pal.get(ch, (255, 0, 255)))
    _cache[k] = surf
    return surf


def icon(name, scale=1):
    s = sprite(S[name])
    if scale != 1:
        key = ('scaled', name, scale)
        if key not in _cache:
            _cache[key] = pygame.transform.scale(s, (s.get_width() * scale, s.get_height() * scale))
        return _cache[key]
    return s


def piece(kind, color, shade):
    rows = TOWN if kind == 'town' else HOUSE
    return sprite(rows, {**PAL, 'P': color, 'p': shade, 'W': (240, 232, 214), 'b': (104, 176, 232), 'k': (58, 36, 24)})


def die(n):
    spots = {1: [(4, 4)], 2: [(2, 2), (6, 6)], 3: [(2, 2), (4, 4), (6, 6)], 4: [(2, 2), (6, 2), (2, 6), (6, 6)],
             5: [(2, 2), (6, 2), (4, 4), (2, 6), (6, 6)], 6: [(2, 2), (6, 2), (2, 4), (6, 4), (2, 6), (6, 6)]}[n]
    g = [list('WWWWWWWWW') for _ in range(9)]
    for x, y in spots:
        g[y][x] = 'n' if n == 1 else 'k'
    return sprite([''.join(r) for r in g])


def flag(surface, color, shade, x, y):
    surface.fill(INK, (x, y, 8, 10))
    surface.fill(color, (x + 1, y + 1, 6, 8))
    surface.fill(shade, (x + 6, y + 1, 1, 8))
    surface.fill((246, 192, 44), (x + 1, y + 1, 6, 1))
    surface.fill((246, 192, 44), (x + 3, y + 4, 2, 2))


def professor():
    return sprite(PROF, PROF_PAL)


def logo(word='ISOTOPIA', scale=4):
    """The title: the pixel font blown up, slanted forward like 1950s chrome lettering, outlined and shaded."""
    from font import GLYPHS
    cols = []
    for ch in word:
        g = GLYPHS[ch]
        for i in range(len(g[0])):
            cols.append([g[r][i] == '#' if r < len(g) else False for r in range(7)])
        cols.append([False] * 7)
    w0, h0 = len(cols), 7
    W, H = w0 * scale + 7 * scale // 2 + 10, h0 * scale + 10
    mask = [[False] * W for _ in range(H)]
    for x in range(w0):
        for y in range(h0):
            if cols[x][y]:
                for dy in range(scale):
                    yy = y * scale + dy
                    slant = (h0 * scale - yy) // 2
                    for dx in range(scale):
                        mask[yy + 3][x * scale + dx + slant + 3] = True
    surf = pygame.Surface((W, H), pygame.SRCALPHA)
    on = lambda x, y: 0 <= x < W and 0 <= y < H and mask[y][x]
    th = h0 * scale
    for y in range(H):
        for x in range(W):
            if on(x - 2, y - 3) and not on(x, y):
                surf.set_at((x, y), INK)
    for y in range(H):
        for x in range(W):
            if not on(x, y) and any(on(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
                surf.set_at((x, y), INK)
    for y in range(H):
        for x in range(W):
            if on(x, y):
                f = (y - 3) / th
                c = (250, 255, 214) if not on(x, y - 1) else (214, 248, 96) if f < 0.4 else (150, 224, 64) if f < 0.7 else (70, 168, 48)
                if not on(x + 1, y) and f > 0.2:
                    c = (40, 120, 40)
                surf.set_at((x, y), c)
    return surf


def atom(surface, cx, cy, t, r=9, color=(140, 248, 72)):
    """A little atom: nucleus and three orbiting electrons."""
    for k in range(3):
        ang = k * math.pi / 3
        for s in range(0, 360, 12):
            a = math.radians(s)
            x = cx + r * math.cos(a) * math.cos(ang) - r * 0.35 * math.sin(a) * math.sin(ang)
            y = cy + r * math.cos(a) * math.sin(ang) + r * 0.35 * math.sin(a) * math.cos(ang)
            surface.set_at((round(x), round(y)), (120, 140, 200))
        a = t * 0.12 + k * 2.1
        x = cx + r * math.cos(a) * math.cos(ang) - r * 0.35 * math.sin(a) * math.sin(ang)
        y = cy + r * math.cos(a) * math.sin(ang) + r * 0.35 * math.sin(a) * math.cos(ang)
        surface.fill(color, (round(x) - 1, round(y) - 1, 2, 2))
    surface.fill((246, 192, 44), (cx - 1, cy - 1, 3, 3))
