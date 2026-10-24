// Draw-every-frame UI for a pixel screen: RPG windows, bevelled buttons and a pointing glove.
// Each frame, widgets register the screen areas they own; a click goes to the topmost one.

import { text, textWidth, LINE, fit, wrap, paragraph } from './font.js';
import { S, PAL, INK, make } from './sprites.js';

export const C = {
  white: '#ffffff', soft: '#b8c4f8', dim: '#7c88c8', gold: '#f8d048', red: '#ff7a64', green: '#88e878', ink: INK,
  winTop: '#3a50c8', winBot: '#141c70', border: '#f0f0f8', borderShade: '#9098c0', out: '#080818',
  parch: '#f4e8c8', parchShade: '#d8c49c', parchInk: '#3a2a18',
};

const BTN = {
  blue: { face: '#4c64d4', hi: '#7c94f4', lo: '#24308c', ink: '#ffffff' },
  red: { face: '#cc3c2c', hi: '#f8806c', lo: '#781810', ink: '#ffffff' },
  green: { face: '#34a040', hi: '#78dc6c', lo: '#145a1c', ink: '#ffffff' },
  gold: { face: '#f0c040', hi: '#fff4a8', lo: '#a06c10', ink: '#3a2408', shadow: null },
  off: { face: '#2a3478', hi: '#3a4690', lo: '#161c50', ink: '#6c78b8' },
};

const GLOVE = ['  kkkk      ', 'kkWWWWkkkkk ', 'kWWWWWWWWWWk', 'kWWWWWkkkkk ', 'kWWWWWWk    ', 'kWWWWWWk    ', 'kgWWWWgk    ', ' kkkkkk     '];

export class UI {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.regions = [];
    this.prev = [];
    this.mx = -1; this.my = -1;
    this.hoverKey = null;
    this.t = 0;
    this.icons = new Map();
    this.glove = make(GLOVE, { k: '#101018', W: '#ffffff', g: '#b8b8c8' }, null);
  }

  begin(t) {
    this.t = t;
    this.prev = this.regions;
    this.regions = [];
    const top = this.topAt(this.prev, this.mx, this.my);
    this.hoverKey = top ? top.key : null;
    this.c.imageSmoothingEnabled = false;
  }

  topAt(list, x, y) {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h) return r;
    }
    return null;
  }

  // Register an area. fn(x, y) runs on click; a region without fn just swallows clicks.
  hit(x, y, w, h, fn, key) {
    const r = { x, y, w, h, fn, key: key || x + ',' + y + ',' + w + ',' + h };
    this.regions.push(r);
    return this.hoverKey === r.key;
  }
  block(x, y, w, h) { this.hit(x, y, w, h, null, 'block' + x + ',' + y); }

  click(x, y) {
    const r = this.topAt(this.regions, x, y);
    if (r && r.fn) { r.fn(x, y); return true; }
    return false;
  }
  pointerCursor() {
    const r = this.topAt(this.regions, this.mx, this.my);
    return !!(r && r.fn);
  }

  icon(name, x, y, scale = 1, alpha = 1) {
    let cv = this.icons.get(name);
    if (!cv) { cv = make(S[name], PAL, INK); this.icons.set(name, cv); }
    const c = this.c;
    if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(cv, x, y, cv.width * scale, cv.height * scale);
    if (alpha !== 1) c.globalAlpha = 1;
    return cv.width * scale;
  }
  iconSize(name) { const rows = S[name]; return [Math.max(...rows.map(r => r.length)) + 2, rows.length + 2]; }

  // The classic blue menu window: banded gradient, white border with a soft inner shade, clipped corners.
  window(x, y, w, h, style = 'blue') {
    const c = this.c;
    if (style === 'parch') {
      c.fillStyle = C.parchInk; c.fillRect(x + 1, y, w - 2, h); c.fillRect(x, y + 1, w, h - 2);
      c.fillStyle = C.parchShade; c.fillRect(x + 1, y + 1, w - 2, h - 2);
      c.fillStyle = C.parch; c.fillRect(x + 2, y + 2, w - 4, h - 5);
      return;
    }
    c.fillStyle = C.out; c.fillRect(x + 1, y, w - 2, h); c.fillRect(x, y + 1, w, h - 2);
    c.fillStyle = C.border; c.fillRect(x + 2, y + 1, w - 4, h - 2); c.fillRect(x + 1, y + 2, w - 2, h - 4);
    c.fillStyle = C.borderShade; c.fillRect(x + 3, y + h - 3, w - 5, 1); c.fillRect(x + w - 3, y + 3, 1, h - 5);
    const ix = x + 3, iy = y + 3, iw = w - 6, ih = h - 6, bands = 8;
    const a = hex(C.winTop), b = hex(C.winBot);
    for (let i = 0; i < bands; i++) {
      const f = i / (bands - 1);
      c.fillStyle = `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
      const y0 = iy + Math.floor(ih * i / bands), y1 = iy + Math.floor(ih * (i + 1) / bands);
      c.fillRect(ix, y0, iw, y1 - y0);
    }
    c.fillStyle = C.out; c.fillRect(ix, iy, 1, 1); c.fillRect(ix + iw - 1, iy, 1, 1); c.fillRect(ix, iy + ih - 1, 1, 1); c.fillRect(ix + iw - 1, iy + ih - 1, 1, 1);
  }

  // A bevelled button. Returns true while hovered. content(x, y) may draw icons after the label.
  button(x, y, w, h, label, fn, { kind = 'blue', enabled = true, selected = false, key, glove = true, content, align = 'center', labelColor } = {}) {
    const st = !enabled ? BTN.off : selected ? BTN.gold : BTN[kind];
    const hot = this.hit(x, y, w, h, enabled ? fn : null, key || 'b:' + label + ':' + x + ',' + y);
    const c = this.c;
    const pressed = hot && enabled && this.down;
    c.fillStyle = C.out; c.fillRect(x + 1, y, w - 2, h); c.fillRect(x, y + 1, w, h - 2);
    c.fillStyle = pressed ? st.lo : st.hi; c.fillRect(x + 1, y + 1, w - 2, h - 2);
    c.fillStyle = pressed ? st.hi : st.lo; c.fillRect(x + 2, y + 2, w - 3, h - 3);
    c.fillStyle = hot && enabled && !selected ? mix(st.face, '#ffffff', 0.18) : st.face; c.fillRect(x + 2, y + 2, w - 4, h - 4);
    const ty = y + Math.floor((h - 7) / 2) + (pressed ? 1 : 0);
    if (label) {
      const col = labelColor || st.ink;
      if (align === 'left') text(c, label, x + 5, ty, col, { shadow: st.shadow === null ? null : '#101030' });
      else text(c, label, x + w / 2, ty, col, { align: 'center', shadow: st.shadow === null ? null : '#101030' });
    }
    if (content) content(x, y, pressed);
    if (hot && enabled && glove) this.c.drawImage(this.glove, x - 11 + (Math.floor(this.t / 8) % 2), y + Math.floor((h - 8) / 2));
    return hot;
  }

  label(str, x, y, color = C.white, opts) { return text(this.c, str, x, y, color, opts); }
}

export function hex(h) { const v = parseInt(h.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255]; }
export function mix(a, b, f) {
  const A = hex(a), B = hex(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * f)},${Math.round(A[1] + (B[1] - A[1]) * f)},${Math.round(A[2] + (B[2] - A[2]) * f)})`;
}
export { text, textWidth, LINE, fit, wrap, paragraph };
