"""Board geometry for Isotopia: 19 pointy-top hexes (radius 2) around the Atomic Lab.
Everything here is fixed; rules.py decides which land and numbers go where."""

import math

S3 = math.sqrt(3)
DIRS = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]


def hex_center(q, r):
    return S3 * (q + r / 2), 1.5 * r


def corner_offset(i):
    a = math.pi / 180 * (60 * i - 30)
    return math.cos(a), math.sin(a)


class Geo:
    def __init__(self):
        self.hexes = []
        for r in range(-2, 3):
            for q in range(-2, 3):
                if max(abs(q), abs(r), abs(q + r)) <= 2:
                    x, y = hex_center(q, r)
                    self.hexes.append({'id': len(self.hexes), 'q': q, 'r': r, 'x': x, 'y': y, 'vertices': [], 'edges': [], 'nbrs': []})
        at = {(h['q'], h['r']): h['id'] for h in self.hexes}
        for h in self.hexes:
            for dq, dr in DIRS:
                n = at.get((h['q'] + dq, h['r'] + dr))
                if n is not None:
                    h['nbrs'].append(n)
        self.center = at[(0, 0)]

        self.vertices = []
        vkey = {}
        for h in self.hexes:
            for i in range(6):
                ox, oy = corner_offset(i)
                x, y = h['x'] + ox, h['y'] + oy
                k = (round(x * 1000), round(y * 1000))
                if k not in vkey:
                    vkey[k] = len(self.vertices)
                    self.vertices.append({'id': len(self.vertices), 'x': x, 'y': y, 'hexes': [], 'adj': [], 'edges': []})
                v = vkey[k]
                h['vertices'].append(v)
                self.vertices[v]['hexes'].append(h['id'])

        self.edges = []
        ekey = {}
        for h in self.hexes:
            for i in range(6):
                a, b = h['vertices'][i], h['vertices'][(i + 1) % 6]
                k = (min(a, b), max(a, b))
                if k not in ekey:
                    ekey[k] = len(self.edges)
                    self.edges.append({'id': len(self.edges), 'a': k[0], 'b': k[1], 'hexes': []})
                    self.vertices[a]['adj'].append(b)
                    self.vertices[b]['adj'].append(a)
                    self.vertices[a]['edges'].append(ekey[k])
                    self.vertices[b]['edges'].append(ekey[k])
                h['edges'].append(ekey[k])
                self.edges[ekey[k]]['hexes'].append(h['id'])
        self._ekey = ekey

    def edge_between(self, a, b):
        return self._ekey.get((min(a, b), max(a, b)))


GEO = Geo()
CENTER = GEO.center
