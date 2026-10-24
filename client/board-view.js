// Draws the realm at 288x184 pixels: terrain, river, castle, pieces, highlights and little animations.

import { GEO, CENTER, TERRAIN_RES } from '/shared/board.js';
import { HOUSES } from '/shared/game.js';
import { S, spr, INK, PAL } from './sprites.js';

export const W = 288;
export const H = 184;
// The part of the world shown on screen: the island plus a band of sea. Open sea is cropped away.
export const VX = 50;
export const VY = 10;
export const VW = 188;
export const VH = 168;
const R = 18, S3 = Math.sqrt(3), OX = 144, OY = 92;

const TERRAIN = {
  forest: ['#1d5226', '#246630', '#2e7a38'], pasture: ['#5aa83c', '#6cbc48', '#88d060'], fields: ['#c89430', '#dcac40', '#ecc85c'],
  hills: ['#9a4628', '#b45c32', '#cc7444'], mountains: ['#625e70', '#7c788a', '#9894a4'], capital: ['#7a6e60', '#9a8e7a', '#b4a890'],
};
const SEA = ['#3a7ad0', '#2860b8', '#1c4c9c', '#163c84'];
const VIL = ['   P   ', '  PPp  ', ' PPPpp ', 'PPPPppp', ' WWWWw ', ' WkWWw ', ' WkWWw '];
const BADGE = {
  bakery: [' ooo ', 'ocooo', 'OOOOO'], lodge: ['b b b', ' bbb ', '  b  '],
  smith: ['ggggg', ' GGG ', 'GGGGG'], hut: [' uu u', 'uuuuu', ' uu u'],
};
const BADGE_PAL = { o: '#e88a3a', O: '#a8501c', c: '#f4dca8', b: '#e8dcc0', g: '#d4d8e0', G: '#6c7480', u: '#78c0f8' };
const MINI = { wood: S.wood, brick: S.brick, wool: S.wool, grain: S.grain, iron: S.iron };
const DG = { 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'], 6: ['111', '100', '111', '101', '111'], 8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'] };

function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16;
  return ((n >>> 0) % 1000) / 1000;
}
function cround(q, r) {
  let x = q, z = r, y = -x - z, rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return [rx, rz];
}
const AXIAL = {};
GEO.hexes.forEach(h => { AXIAL[h.q + ',' + h.r] = h.id; });
export function hexAt(x, y, rad = R) {
  const px = x + 0.5 - OX, py = y + 0.5 - OY;
  const [q, r] = cround((S3 / 3 * px - py / 3) / rad, (2 / 3 * py) / rad);
  const k = q + ',' + r;
  return k in AXIAL ? AXIAL[k] : -1;
}
export const VPOS = GEO.vertices.map(v => [Math.round(OX + R * v.x), Math.round(OY + R * v.y)]);
export const HPOS = GEO.hexes.map(h => [Math.round(OX + R * h.x), Math.round(OY + R * h.y)]);
export const EPOS = GEO.edges.map(e => [(VPOS[e.a][0] + VPOS[e.b][0]) / 2, (VPOS[e.a][1] + VPOS[e.b][1]) / 2]);

const px = (c, x, y, col) => { c.fillStyle = col; c.fillRect(x, y, 1, 1); };
const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };

export class BoardView {
  constructor(canvas) {
    this.cv = canvas;
    canvas.width = VW; canvas.height = VH;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.bg.width = W; this.bg.height = H;
    this.id = new Int16Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.id[y * W + x] = hexAt(x, y);
    // outline pixels of each hex, used for highlights
    this.border = GEO.hexes.map(() => []);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = this.id[y * W + x];
      if (i < 0) continue;
      if (this.id[y * W + x + 1] !== i || this.id[(y + 1) * W + x] !== i || this.id[y * W + x - 1] !== i || this.id[(y - 1) * W + x] !== i) this.border[i].push([x, y]);
    }
    this.river = [];
    const pts = GEO.riverPath.map(v => VPOS[v]);
    pts.push([pts[pts.length - 1][0], pts[pts.length - 1][1] + 7]);
    for (let i = 1; i < pts.length; i++) {
      const [a0, a1] = [pts[i - 1], pts[i]], n = Math.max(Math.abs(a1[0] - a0[0]), Math.abs(a1[1] - a0[1]));
      for (let s = 0; s < n; s++) this.river.push([Math.round(a0[0] + (a1[0] - a0[0]) * s / n), Math.round(a0[1] + (a1[1] - a0[1]) * s / n)]);
    }
    this.waves = [];
    this.floats = [];
    this.boardKey = '';
  }

  setBoard(hexes) {
    const key = hexes.map(h => h.terrain[0] + h.number).join('');
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.hexes = hexes;
    const b = this.bg.getContext('2d');
    const img = b.createImageData(W, H), D = img.data;
    this.waves = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.id[y * W + x];
      let col;
      if (i >= 0) {
        col = texture(hexes[i].terrain, x, y);
        const dn = this.id[Math.min(H - 1, y + 1) * W + x], rt = this.id[y * W + Math.min(W - 1, x + 1)];
        const up = this.id[Math.max(0, y - 1) * W + x], lf = this.id[y * W + Math.max(0, x - 1)];
        if (dn !== i || rt !== i) col = '#2a1c14';
        else if (up !== i || lf !== i) col = lighten(col);
      } else if (hexAt(x, y, R * 1.07) >= 0) col = hash(x, y) > 0.8 ? '#d8bc78' : '#ecd494';
      else if (hexAt(x, y, R * 1.12) >= 0) col = (x + y) % 2 ? '#e8f4ff' : SEA[0];
      else if (hexAt(x, y, R * 1.3) >= 0) col = SEA[0];
      else if (hexAt(x, y, R * 1.55) >= 0) col = (x + y) % 2 ? SEA[0] : SEA[1];
      else if (hexAt(x, y, R * 1.9) >= 0) col = SEA[1];
      else if (hexAt(x, y, R * 2.3) >= 0) col = (x + y) % 2 ? SEA[1] : SEA[2];
      else col = (x % 2 === 0 && y % 2 === 0) ? SEA[3] : SEA[2];
      if (i < 0 && hexAt(x, y, R * 1.25) < 0 && hash(x * 3, y * 7) > 0.9965) this.waves.push([x, y, Math.floor(hash(x, y) * 40)]);
      const v = parseInt(col.slice(1), 16), o = (y * W + x) * 4;
      D[o] = v >> 16; D[o + 1] = (v >> 8) & 255; D[o + 2] = v & 255; D[o + 3] = 255;
    }
    b.putImageData(img, 0, 0);
    this.river.forEach(([x, y]) => rect(b, x - 1, y - 1, 3, 3, '#1c4c9c'));
    this.river.forEach(([x, y]) => { rect(b, x, y - 1, 1, 3, '#3c88e0'); rect(b, x - 1, y, 3, 1, '#3c88e0'); });
    const [sx, sy] = this.river[0];
    rect(b, sx - 2, sy - 1, 4, 3, '#3c88e0'); px(b, sx - 1, sy - 1, '#bfe2ff');

    this.mill = null;
    hexes.forEach((h, i) => decorate(b, h.terrain, HPOS[i][0], HPOS[i][1], this, i));
    drawCastle(b, OX, OY);
    // lighthouse and islets
    spr(b, ['  gggg  ', ' gGGggg ', 'gGGGGgGg'], { g: '#8a8494', G: '#5a5668' }, 213, 27, '#1c1c30');
    spr(b, [' W ', 'WWw', 'rrR', 'WWw', 'rrR', 'WWw', 'rrR', 'WWw'], { W: '#f8f4e8', w: '#b8b4c0', r: '#d83c30', R: '#8a1c1c' }, 216, 18, '#1c1c30');
    spr(b, [' ggg ', 'gGGgg'], { g: '#8a8494', G: '#5a5668' }, 224, 168, '#1c1c30');
    hexes.forEach((h, i) => { if (h.number) token(b, HPOS[i][0], HPOS[i][1] + 7, h.number); });
  }

  vertexAt(x, y, list, maxD = 10) { return nearest(list, i => VPOS[i], x, y, maxD); }
  edgeAt(x, y, list, maxD = 9) { return nearest(list, i => EPOS[i], x, y, maxD); }
  hexAt(x, y) { return x >= 0 && y >= 0 && x < W && y < H ? this.id[Math.floor(y) * W + Math.floor(x)] : -1; }

  float(hex, res, delay = 0) {
    const [x, y] = HPOS[hex];
    this.floats.push({ x: x - 5 + Math.round((Math.random() - 0.5) * 8), y: y - 4, res, t0: performance.now() + delay });
  }

  render(view, ui, t) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, -VX, -VY);
    c.drawImage(this.bg, 0, 0);
    this.ambient(c, t);
    if (view) this.pieces(c, view, t);
    if (ui && ui.targets) this.highlights(c, ui, t);
    this.drawFloats(c);
  }

  ambient(c, t) {
    const river = this.river;
    for (let k = 0; k < river.length; k++) if (((k - Math.floor(t / 3)) % 9 + 9) % 9 === 0) px(c, river[k][0], river[k][1], '#d8f0ff');
    for (const [x, y, ph0] of this.waves) {
      const ph = (Math.floor(t / 5) + ph0) % 40;
      if (ph < 7) { const off = ph < 3 ? 0 : 1; rect(c, x + off, y, 3, 1, '#9ccaf4'); px(c, x + off + 1, y - 1, '#9ccaf4'); }
    }
    if (this.mill) {
      const [hx, hy] = this.mill, ang = Math.floor(t / 4) * Math.PI / 16;
      for (let a = 0; a < 4; a++) {
        const th = ang + a * Math.PI / 2;
        for (let l = 1; l <= 6; l++) px(c, Math.round(hx + Math.cos(th) * l), Math.round(hy + Math.sin(th) * l), l > 2 ? '#f4ecd8' : '#7a5030');
      }
      px(c, hx, hy, '#3a2418');
    }
    // fountain and royal flag
    const fh = 3 + (Math.floor(t / 6) % 2);
    for (let f = 0; f < fh; f++) px(c, OX, OY + 9 - f, f === fh - 1 ? '#ffffff' : '#bfe2ff');
    for (let d = 0; d < 6; d++) {
      const pp = ((t * 0.8 + d * 9) % 36) / 36, side = d % 2 ? 1 : -1;
      px(c, OX + side * Math.round(1 + pp * 3), OY + 6 + Math.round(pp * pp * 4), '#9fd0ff');
    }
    const wv = Math.floor(t / 10) % 2;
    rect(c, OX + 1, OY - 25, 4, 2, '#f8d048'); px(c, OX + 1 + (wv ? 3 : 2), OY - 25 + (wv ? 1 : 0), '#c89820'); px(c, OX + 5, OY - 25 + wv, '#f8d048');
    // boats, lighthouse and the river serpent
    const boat = ['   W  ', '   WW ', '   WWW', '   b  ', 'bbbbbbb', ' BBBBB '];
    const flip = boat.map(r => r.padEnd(7).split('').reverse().join(''));
    const bp = { W: '#f8f4e8', b: '#a0703c', B: '#5a3418' };
    spr(c, Math.cos(t * 0.004) >= 0 ? boat : flip, bp, Math.round(70 + Math.sin(t * 0.004) * 13), 24 + (Math.floor(t / 20) % 2), '#101830');
    spr(c, Math.cos(t * 0.005 + 2) >= 0 ? boat : flip, bp, Math.round(212 + Math.sin(t * 0.005 + 2) * 13), 152 + (Math.floor(t / 24) % 2), '#101830');
    if (Math.floor(t / 30) % 3 !== 0) { px(c, 217, 17, '#fff080'); for (let lb = 1; lb < 7; lb += 2) px(c, 215 - lb, 17 + (lb > 3 ? 1 : 0), '#fff6b0'); }
    const sc = t % 900;
    if (sc < 300) {
      const sx = Math.round(52 + sc * 0.07);
      for (let hm = 0; hm < 3; hm++) spr(c, [' ee ', 'eEEe'], { e: '#4cb06c', E: '#2c7040' }, sx + hm * 6, 164 + (Math.floor((t / 8 + hm * 2) % 4) < 2 ? 0 : 1), '#0c2418');
      spr(c, [' ee', 'eke', 'ee '], { e: '#4cb06c', k: '#0c0810' }, sx + 18, 162, '#0c2418');
    }
  }

  pieces(c, v, t) {
    const color = pid => HOUSES[v.players[pid].house];
    v.roads.forEach((owner, e) => {
      if (owner === null) return;
      const ed = GEO.edges[e], [ax, ay] = VPOS[ed.a], [bx, by] = VPOS[ed.b];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      const col = color(owner).color;
      for (let s = 2; s <= n - 2; s++) rect(c, Math.round(ax + (bx - ax) * s / n) - 1, Math.round(ay + (by - ay) * s / n) - 1, 3, 3, INK);
      for (let s = 2; s <= n - 2; s++) { const x = Math.round(ax + (bx - ax) * s / n), y = Math.round(ay + (by - ay) * s / n); px(c, x, y, col); px(c, x, y - 1, col); }
    });
    // bandit token dims its land
    if (v.bandit !== CENTER) {
      const [hx, hy] = HPOS[v.bandit];
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (dx * dx + dy * dy <= 20 && (dx + dy) % 2 === 0) px(c, hx + dx, hy + 7 + dy, 'rgba(20,10,20,0.75)');
    }
    const chimneys = [];
    v.buildings.forEach((b, i) => {
      if (!b) return;
      const h = color(b.owner), pal = { P: h.color, p: h.shade, W: '#f0e0c0', w: '#c8b090', k: '#3a2418' };
      const [x, y] = VPOS[i];
      if (b.kind === 'town') {
        spr(c, VIL, pal, x - 6, y - 7, INK);
        spr(c, VIL, pal, x - 2, y - 4, INK);
        px(c, x + 3, y - 4, '#3a2418'); chimneys.push([x + 3, y - 5, i]);
        px(c, x - 5, y - 7, '#3a2418');
      } else {
        spr(c, VIL, pal, x - 3, y - 4, INK);
        px(c, x + 2, y - 4, '#3a2418'); chimneys.push([x + 2, y - 5, i]);
      }
      if (b.workshop) spr(c, BADGE[b.workshop], BADGE_PAL, x + (b.kind === 'town' ? 5 : 3), y + 1, INK);
    });
    chimneys.forEach(([cx, cy, j]) => {
      for (let s = 0; s < 3; s++) {
        const ph = (t * 0.35 + j * 13 + s * 10) % 30;
        if (ph < 22) px(c, cx + Math.round(Math.sin((ph + j) * 0.3) * 1.2 + ph * 0.08), Math.round(cy - ph * 0.5), ph < 8 ? '#f0f0f0' : ph < 15 ? '#b8b8c4' : '#8c8c9c');
      }
    });
    const [bx, by] = v.bandit === CENTER ? [OX - 17, OY + 4] : [HPOS[v.bandit][0] - 3, HPOS[v.bandit][1] - 6];
    const bob = Math.floor(t / 14) % 2;
    spr(c, [' hhh ', 'hykyh', ' hhh ', 'hhhhh', ' hhh ', ' h h '], { h: '#3a2a40', y: '#f8e040', k: '#120c18' }, bx, by - bob, '#f4e8c8');
  }

  highlights(c, ui, t) {
    const on = Math.floor(t / 10) % 2 === 0;
    const tg = ui.targets, hov = ui.hover;
    const glow = on ? '#ffffff' : '#f6c02c';
    if (tg.kind === 'vertex') {
      for (const i of tg.ids) {
        const [x, y] = VPOS[i];
        if (i === hov) { rect(c, x - 3, y - 3, 7, 7, INK); rect(c, x - 2, y - 2, 5, 5, '#f6c02c'); px(c, x, y, '#fff4b0'); continue; }
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d <= 2) px(c, x + dx, y + dy, d === 2 ? INK : glow);
        }
      }
    }
    if (tg.kind === 'edge') {
      for (const i of tg.ids) {
        const ed = GEO.edges[i], [ax, ay] = VPOS[ed.a], [bx, by] = VPOS[ed.b];
        const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
        for (let s = 3; s <= n - 3; s++) {
          const x = Math.round(ax + (bx - ax) * s / n), y = Math.round(ay + (by - ay) * s / n);
          if (i === hov) { rect(c, x - 1, y - 1, 3, 3, INK); px(c, x, y, '#f6c02c'); }
          else if (s % 2 === (on ? 0 : 1)) { rect(c, x - 1, y - 1, 2, 2, INK); px(c, x, y, '#ffffff'); }
        }
      }
    }
    if (tg.kind === 'hex') {
      for (const i of tg.ids) {
        const col = i === hov ? '#f6c02c' : glow;
        if (i !== hov && !on) continue;
        for (const [x, y] of this.border[i]) px(c, x, y, col);
        if (i === hov) for (const [x, y] of this.border[i]) { px(c, x - Math.sign(x - HPOS[i][0]), y - Math.sign(y - HPOS[i][1]), col); }
      }
    }
  }

  drawFloats(c) {
    const now = performance.now();
    this.floats = this.floats.filter(f => now - f.t0 < 1600);
    for (const f of this.floats) {
      const age = now - f.t0;
      if (age < 0) continue;
      const rise = Math.min(14, Math.floor(age / 50));
      if (age > 1200 && Math.floor(age / 80) % 2) continue;
      spr(c, MINI[f.res], PAL, f.x, f.y - rise, INK);
    }
  }
}

function nearest(list, pos, x, y, maxD) {
  let best = null, bd = maxD * maxD;
  for (const i of list) {
    const [px2, py2] = pos(i), d = (px2 - x) ** 2 + (py2 - y) ** 2;
    if (d <= bd) { bd = d; best = i; }
  }
  return best;
}

function texture(k, x, y) {
  const n = hash(x, y), p = TERRAIN[k];
  switch (k) {
    case 'forest': return p[n < 0.35 ? 0 : n < 0.9 ? 1 : 2];
    case 'pasture': return p[n < 0.06 ? 0 : n > 0.88 ? 2 : 1];
    case 'fields': return y % 3 === 0 ? p[0] : p[n > 0.75 ? 2 : 1];
    case 'hills': return (x + 2 * y) % 7 === 0 ? p[0] : p[n > 0.86 ? 2 : n < 0.1 ? 0 : 1];
    case 'mountains': return ((x - y) % 5 + 5) % 5 === 0 ? p[0] : p[n > 0.9 ? 2 : 1];
    default: { const row = Math.floor(y / 3); return (y % 3 === 0 || (x + (row % 2) * 2) % 4 === 0) ? p[0] : p[n > 0.5 ? 2 : 1]; }
  }
}
function lighten(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (v >> 16) + 48), g = Math.min(255, ((v >> 8) & 255) + 48), b = Math.min(255, (v & 255) + 40);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

const TREE = ['  kkk  ', ' keeEk ', 'keeeEEk', 'keeEEEk', ' kEEEk ', '  ktk  ', '   t   '];
const TREE_PAL = { k: '#103a1c', e: '#5cb84c', E: '#2f8a36', t: '#5a3418' };
const HAY = [' BBB ', 'ByyYB', 'ByYYB', 'BBBBB'];
const HAY_PAL = { B: '#7a4e1c', y: '#f8dc70', Y: '#c89430' };
const MILL = ['  r  ', ' rrr ', ' WWw ', ' WWw ', 'WWWww', 'WkWww', 'WkWww'];

function peak(b, cx, by, h) {
  for (let k = 0; k <= h; k++) {
    const y = by - h + k, hw = Math.round(k * 0.85);
    for (let dx = -hw; dx <= hw; dx++) {
      const snow = k < Math.max(2, h * 0.28) + (hash(cx + dx, y) > 0.6 ? 1 : 0), edge = dx === -hw || dx === hw;
      px(b, cx + dx, y, edge ? '#2a2636' : dx < 0 ? (snow ? '#f8f8ff' : '#aeaabb') : (snow ? '#c4c4dc' : '#5a5668'));
    }
  }
}

function decorate(b, terrain, cx, cy, view) {
  if (terrain === 'forest') [[-7, -8], [0, -12], [7, -8], [-11, -1], [-3, -3], [10, 0], [4, -1], [-9, 6], [8, 6]].forEach(([dx, dy]) => spr(b, TREE, TREE_PAL, cx + dx - 3, cy + dy - 3));
  if (terrain === 'mountains') { peak(b, cx - 11, cy + 3, 6); peak(b, cx - 3, cy + 2, 13); peak(b, cx + 7, cy + 3, 9); }
  if (terrain === 'pasture') [[-8, -7], [3, -11], [7, -3], [-3, -2], [-10, 2]].forEach(([dx, dy]) => spr(b, [' WWWk', 'WWWWk', ' k k '], { W: '#f8f4e8', k: '#2a2430' }, cx + dx, cy + dy));
  if (terrain === 'fields') {
    if (!view.mill) {
      view.mill = [cx + 6, cy - 7];
      spr(b, MILL, { r: '#a83020', W: '#f0e8d8', w: '#b8a890', k: '#3a2418' }, cx + 4, cy - 9, '#2a1c14');
      spr(b, HAY, HAY_PAL, cx - 9, cy - 6);
    } else { spr(b, HAY, HAY_PAL, cx - 8, cy - 7); spr(b, HAY, HAY_PAL, cx + 4, cy - 4); }
  }
  if (terrain === 'hills') {
    spr(b, ['  kkk  ', ' kOOOk ', 'kOOkOOk', 'kOkrkOk', 'kkkkkkk'], { k: '#3c1c10', O: '#8a4a2a', r: '#f8a030' }, cx - 8, cy - 8);
    spr(b, ['kkkk', 'krRk', 'kkkk'], { k: '#3c1c10', r: '#e07848', R: '#a03c20' }, cx + 4, cy - 7);
    spr(b, ['kkkk', 'kRrk', 'kkkk'], { k: '#3c1c10', r: '#e07848', R: '#a03c20' }, cx + 6, cy - 2);
  }
}

function drawCastle(b, CX, CY) {
  const ST = '#b8b0a0', SL = '#d8d2c4', SD = '#7a7264', SK = '#2a221c';
  const cone = (cx, top, h, half) => {
    for (let k = 0; k < h; k++) {
      const hw = Math.round(k * half / (h - 1));
      for (let dx = -hw; dx <= hw; dx++) px(b, cx + dx, top + k, dx === -hw || dx === hw ? '#3a0c0c' : dx < 0 ? '#d84030' : dx === 0 ? '#b02c20' : '#7a1c14');
    }
  };
  rect(b, CX - 12, CY - 7, 25, 12, SK);
  rect(b, CX - 11, CY - 6, 23, 10, ST); rect(b, CX - 11, CY - 6, 1, 10, SL); rect(b, CX + 11, CY - 6, 1, 10, SD); rect(b, CX - 11, CY + 3, 23, 1, SD);
  for (let x = CX - 11; x <= CX + 11; x += 2) rect(b, x, CY - 8, 1, 2, ST);
  [CX - 9, CX + 9].forEach(tx => {
    rect(b, tx - 3, CY - 12, 7, 17, SK); rect(b, tx - 2, CY - 11, 5, 15, ST); rect(b, tx - 2, CY - 11, 1, 15, SL); rect(b, tx + 2, CY - 11, 1, 15, SD);
    cone(tx, CY - 18, 7, 3); px(b, tx, CY - 7, SK); px(b, tx, CY - 6, SK);
  });
  rect(b, CX - 4, CY - 14, 9, 19, SK); rect(b, CX - 3, CY - 13, 7, 17, ST); rect(b, CX - 3, CY - 13, 1, 17, SL); rect(b, CX + 3, CY - 13, 1, 17, SD);
  cone(CX, CY - 21, 8, 4);
  rect(b, CX, CY - 25, 1, 4, '#3a2418');
  px(b, CX - 1, CY - 9, SK); px(b, CX + 1, CY - 9, SK);
  rect(b, CX - 2, CY - 1, 5, 6, SK); px(b, CX - 2, CY - 1, ST); px(b, CX + 2, CY - 1, ST); rect(b, CX - 1, CY, 3, 4, '#4a3020');
  [CX - 6, CX + 6].forEach(bx => { rect(b, bx, CY - 5, 2, 5, '#4058d0'); px(b, bx, CY - 4, '#f8d048'); px(b, bx + 1, CY - 4, '#f8d048'); });
  rect(b, CX - 1, CY + 5, 3, 3, '#c8bca8');
  spr(b, [' sssssss ', 'sbbbbbbbs', ' sssssss '], { s: '#e0d8c8', b: '#58a8f0' }, CX - 4, CY + 9, '#3a3028');
  // the slum: crooked shacks under the west wall, where the bandits hide
  spr(b, ['  kk ', ' kBBk', 'kBBBk', 'kbkbk'], { k: '#2a1c14', B: '#6a5040', b: '#3a2a20' }, CX - 15, CY + 5);
  spr(b, [' kk ', 'kBBk', 'kbBk'], { k: '#2a1c14', B: '#7a5a44', b: '#3a2a20' }, CX - 10, CY + 7);
}

function token(b, cx, cy, n) {
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    const d = dx * dx + dy * dy;
    if (d <= 20) px(b, cx + dx, cy + dy, d > 12 && dy > 0 ? '#d8c49c' : '#f4e8c8');
    else if (d <= 30) px(b, cx + dx, cy + dy, '#3c2c1c');
  }
  const s = String(n), red = n === 6 || n === 8, w = s.length * 4 - 1, sx = cx - Math.floor(w / 2);
  for (let k = 0; k < s.length; k++) {
    const g = DG[s[k]];
    for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++) if (g[gy][gx] === '1') px(b, sx + k * 4 + gx, cy - 2 + gy, red ? '#c82020' : '#3c2c1c');
  }
}

export { TERRAIN_RES };
