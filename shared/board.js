// Board geometry for Kingsfold: 19 pointy-top hexes (radius 2) around the capital.
// Everything here is fixed; game.js decides which terrain and numbers go where.

export const RES = ['wood', 'brick', 'wool', 'grain', 'iron'];
export const RES_NAME = { wood: 'Wood', brick: 'Brick', wool: 'Wool', grain: 'Grain', iron: 'Iron' };
export const TERRAIN_RES = { forest: 'wood', hills: 'brick', pasture: 'wool', fields: 'grain', mountains: 'iron' };

const S3 = Math.sqrt(3);
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function hexCenter(q, r) { return [S3 * (q + r / 2), 1.5 * r]; }
export function cornerOffset(i) {
  const a = Math.PI / 180 * (60 * i - 30);
  return [Math.cos(a), Math.sin(a)];
}

function build() {
  const hexes = [];
  for (let r = -2; r <= 2; r++)
    for (let q = -2; q <= 2; q++)
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2) {
        const [x, y] = hexCenter(q, r);
        hexes.push({ id: hexes.length, q, r, x, y, vertices: [], edges: [], nbrs: [] });
      }
  const at = {};
  hexes.forEach(h => { at[h.q + ',' + h.r] = h.id; });
  hexes.forEach(h => {
    DIRS.forEach(([dq, dr]) => {
      const n = at[(h.q + dq) + ',' + (h.r + dr)];
      if (n !== undefined) h.nbrs.push(n);
    });
  });

  const vertices = [], vkey = {};
  hexes.forEach(h => {
    for (let i = 0; i < 6; i++) {
      const [ox, oy] = cornerOffset(i);
      const x = h.x + ox, y = h.y + oy;
      const k = Math.round(x * 1000) + ',' + Math.round(y * 1000);
      if (!(k in vkey)) {
        vkey[k] = vertices.length;
        vertices.push({ id: vertices.length, x, y, hexes: [], adj: [], edges: [], coast: false, river: false, capital: false });
      }
      const v = vkey[k];
      h.vertices[i] = v;
      vertices[v].hexes.push(h.id);
    }
  });

  const edges = [], ekey = {};
  hexes.forEach(h => {
    for (let i = 0; i < 6; i++) {
      const a = h.vertices[i], b = h.vertices[(i + 1) % 6];
      const k = Math.min(a, b) + '-' + Math.max(a, b);
      if (!(k in ekey)) {
        ekey[k] = edges.length;
        edges.push({ id: edges.length, a: Math.min(a, b), b: Math.max(a, b), hexes: [], river: false, capital: false });
        vertices[a].adj.push(b); vertices[b].adj.push(a);
        vertices[a].edges.push(edges.length - 1); vertices[b].edges.push(edges.length - 1);
      }
      h.edges[i] = ekey[k];
      edges[ekey[k]].hexes.push(h.id);
    }
  });
  vertices.forEach(v => { v.coast = v.hexes.length < 3; });

  const center = at['0,0'];
  hexes[center].vertices.forEach(v => { vertices[v].capital = true; });
  edges.forEach(e => { e.capital = vertices[e.a].capital || vertices[e.b].capital; });

  // The river: from a spring in the north, past the castle's east wall, down to the southern sea.
  const corner = (q, r, i) => hexes[at[q + ',' + r]].vertices[i];
  const way = [corner(1, -2, 1), corner(0, 0, 5), corner(0, 0, 0), corner(0, 0, 1), corner(0, 0, 2), corner(-1, 2, 2)];
  const path = [way[0]];
  for (let w = 1; w < way.length; w++) {
    const prev = {}, seen = { [way[w - 1]]: true }, queue = [way[w - 1]];
    while (queue.length) {
      const u = queue.shift();
      if (u === way[w]) break;
      for (const n of vertices[u].adj) if (!seen[n]) { seen[n] = true; prev[n] = u; queue.push(n); }
    }
    const seg = [way[w]];
    while (seg[0] !== way[w - 1]) seg.unshift(prev[seg[0]]);
    path.push(...seg.slice(1));
  }
  path.forEach(v => { vertices[v].river = true; });
  for (let i = 1; i < path.length; i++) {
    const k = Math.min(path[i - 1], path[i]) + '-' + Math.max(path[i - 1], path[i]);
    edges[ekey[k]].river = true;
  }

  return { hexes, vertices, edges, center, riverPath: path, edgeBetween: (a, b) => ekey[Math.min(a, b) + '-' + Math.max(a, b)] };
}

export const GEO = build();
export const CENTER = GEO.center;
