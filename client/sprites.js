// Hand-placed pixel sprites. Each row is a string; each letter is a palette color, spaces are see-through.

export const INK = '#16121c';
export const PAL = {
  k: INK, W: '#ffffff', w: '#c8c4d0', y: '#f6c02c', Y: '#b8861c', c: '#f4dca8', b: '#a0703c', B: '#5a3418',
  g: '#d4d8e0', G: '#6c7480', r: '#d8342c', R: '#8a1c1c', u: '#78c0f8', U: '#2860b8', e: '#6cc040', E: '#2c7a2c',
  o: '#e88a3a', O: '#a8501c', s: '#f0c8a0', p: '#b070e0', P: '#6030a0',
};

export const S = {
  die: ['WWWWWWWWW', 'WkkWWWkkW', 'WkkWWWkkW', 'WWWWWWWWW', 'WWWWkWWWW', 'WWWWWWWWW', 'WkkWWWkkW', 'WkkWWWkkW', 'WWWWWWWWW'],
  trade: ['      y   ', '      yy  ', 'yyyyyyyyy ', '      yy  ', '      y   ', '   u      ', '  uu      ', ' uuuuuuuuu', '  uu      ', '   u      '],
  hammer: ['kgggggk  ', 'kgGGGGgk ', 'kgGGGGk  ', 'kkkbkkk  ', '   b     ', '   b     ', '   b     ', '   B     ', '   B     '],
  wood: ['  bbbbbbbb ', 'bcYcbbbbbbB', 'cYcYcbbbBBB', 'bcYcbbbBBB ', ' bbbbbBBB  '],
  brick: ['rrrRkrrrrR', 'RRRRkRRRRR', 'kkkkkkkkkk', 'rrkrrrrRkr', 'RRkRRRRRkR'],
  wool: [' WWW   ', 'WWWWWkk', 'WWWWWkW', 'WWWWWk ', 'w  w   '],
  grain: ['y y y', ' yyy ', 'y y y', ' yyy ', '  E  ', '  E  '],
  iron: ['  gg  ', ' gGgg ', 'gGGgGG', 'GgGGGG', ' GGGG '],
  crown: ['y  y  y', 'yy y yy', 'yyyyyyy', 'yryyyry', 'yyyyyyy'],
  check: ['       ee', '      eeE', 'e    eeE ', 'Ee  eeE  ', ' EeeeE   ', '  EEE    '],
  road: ['      rrr', '    rrrR ', '  rrrR   ', 'rrrR     ', 'rR       '],
  village: ['   r   ', '  rrR  ', ' rrrRR ', 'rrrrRRR', ' WWWWw ', ' WkWWw ', ' WkWWw '],
  town: ['   r       ', '  rrR      ', ' rrrRR r   ', 'rrrrRRrrR  ', ' WWWWrrrRR ', ' WkWrrrrRRR', ' WkWWWWWWw ', '    WkWWWw ', '    WkWWWw '],
  card: ['kkkkkkk', 'kWWWWWk', 'kWyWyWk', 'kWyyyWk', 'kWWWWWk', 'kWWWWWk', 'kWrWrWk', 'kWWWWWk', 'kkkkkkk'],
  bread: ['  kkkkkk  ', ' kyoooook ', 'kyocoocook', 'kooooooook', 'kOOOOOOOOk', ' kkkkkkkk '],
  antler: ['k  k  k  k', 'kcck  kcck', ' kcckkcck ', '  kbbbbk  ', '  kbkkbk  ', '  kBBBBk  ', '  kkkkkk  '],
  anvil: [' o   y  o ', 'kkkkkkkkk ', 'kgggggggkk', 'kGGGGGGGGk', ' kkGGGGkk ', '  kGGGGk  ', ' kGGGGGGk ', ' kkkkkkkk '],
  fish: ['  kkkk    ', ' kuuuuk kk', 'kuWkuuukuk', 'kuuuuuuuk ', 'kUUUUUUkUk', ' kUUUUk kk', '  kkkk    '],
  knight: ['  r  ', ' ggg ', ' gkg ', 'gGgGg', ' ggg ', ' g g '],
  bandit: [' kkk ', 'kyky ', ' kkk ', 'kkkkk', ' kkk ', ' k k '],
  hourglass: ['kkkkkkk', ' kyyyk ', '  kyk  ', '   k   ', '  kyk  ', ' kyyyk ', 'kkkkkkk'],
  scroll: [' kkkkkkk ', 'kcWWWWWck', ' kWkkkWk ', ' kWWWWWk ', ' kWkkWWk ', ' kWWWWWk ', 'kcWWWWWck', ' kkkkkkk '],
  note: [' kkkk', 'kk  k', 'k   k', 'k  kk', 'k kkk', 'kkkk '],
  speaker: ['   k ', '  kk ', 'kkkk ', 'kkkk ', 'kkkk ', '  kk ', '   k '],
  mute: ['   k     ', '  kk  r r', 'kkkk   r ', 'kkkk  r r', 'kkkk     ', '  kk     ', '   k     '],
  army: ['  y  ', ' yWy ', 'yWWWy', ' yWy ', '  y  '],
  longroad: ['     yy', '   yyy ', ' yyy   ', 'yy     '],
};
export const WORKSHOP_SPRITE = { bakery: 'bread', lodge: 'antler', smith: 'anvil', hut: 'fish' };
export const CARD_SPRITE = { knight: 'knight', builder: 'hammer', harvest: 'grain', crown: 'crown' };

export function spr(c, rows, pal, x, y, ol) {
  const h = rows.length;
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  const op = (i, j) => j >= 0 && j < h && i >= 0 && i < rows[j].length && rows[j][i] !== ' ';
  if (ol) {
    c.fillStyle = ol;
    for (let j = -1; j <= h; j++) for (let i = -1; i <= w; i++)
      if (!op(i, j) && (op(i - 1, j) || op(i + 1, j) || op(i, j - 1) || op(i, j + 1))) c.fillRect(x + i, y + j, 1, 1);
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch !== ' ') { c.fillStyle = pal[ch] || '#f0f'; c.fillRect(x + i, y + j, 1, 1); }
  }
}

export function paint(cv, rows, pal = PAL, ol = INK) {
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  const pad = ol ? 1 : 0;
  cv.width = w + pad * 2; cv.height = rows.length + pad * 2;
  spr(cv.getContext('2d'), rows, pal, pad, pad, ol);
  cv.setAttribute('aria-hidden', 'true');
  cv.classList.add('px');
  return cv;
}
export const make = (rows, pal, ol) => paint(document.createElement('canvas'), rows, pal, ol);
export const icon = (name, cls) => { const c = make(S[name]); if (cls) c.className += ' ' + cls; return c; };

export function dieFace(n) {
  const spots = { 1: [[4, 4]], 2: [[2, 2], [6, 6]], 3: [[2, 2], [4, 4], [6, 6]], 4: [[2, 2], [6, 2], [2, 6], [6, 6]], 5: [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]], 6: [[2, 2], [6, 2], [2, 4], [6, 4], [2, 6], [6, 6]] }[n];
  const g = Array.from({ length: 9 }, () => 'WWWWWWWWW'.split(''));
  for (const [x, y] of spots) { g[y][x] = n === 1 ? 'r' : 'k'; }
  return g.map(r => r.join(''));
}

const EMB = {
  sword: ['  y  ', '  y  ', '  y  ', 'yyyyy', '  y  '], coin: [' yyy ', 'y   y', 'y y y', 'y   y', ' yyy '],
  wheat: ['y y y', ' yyy ', 'y y y', ' yyy ', '  y  '], tree: ['  y  ', ' yyy ', 'yyyyy', '  y  ', '  y  '],
  wave: [' yy  ', 'y  yy', '     ', ' yy  ', 'y  yy'], anvil: ['yyyyy', ' yyy ', '  y  ', ' yyy ', 'yyyyy'],
};
export function banner(house) {
  const rows = [];
  for (let y = 0; y < 19; y++) {
    let s = '';
    for (let x = 0; x < 14; x++) {
      let ch = ' ';
      if (y === 1 && x >= 1 && x <= 12) ch = 'b';
      if (y <= 1 && (x === 0 || x === 13)) ch = 'y';
      if (y >= 2 && y <= 16 && x >= 2 && x <= 11) ch = x === 11 ? 'S' : 'C';
      if (y === 3 && x >= 3 && x <= 10) ch = 'y';
      if (y === 17 && ((x >= 2 && x <= 5) || (x >= 8 && x <= 11))) ch = (x === 11 || x === 5) ? 'S' : 'C';
      if (y === 18 && ((x >= 2 && x <= 3) || (x >= 10 && x <= 11))) ch = 'C';
      if (y >= 7 && y <= 11 && x >= 4 && x <= 8 && EMB[house.emblem][y - 7][x - 4] === 'y') ch = 'y';
      s += ch;
    }
    rows.push(s);
  }
  return make(rows, { b: '#8a5a2c', y: '#f6c02c', C: house.color, S: house.shade });
}

export const KING = ['  y  yy  y  ', '  yyyyyyyy  ', '  yryyyyry  ', '  ssssssss  ', '  sksssks   ', '  ssssssss  ', ' WsWWWWWsW  ', ' WWWWWWWWWW ', '  WWWWWWWW  ', ' ppWWWWWWpp ', 'ppppWWWWpppp', 'ppyppWWppypp', 'pppppppppppp'];
export const KING_PAL = { y: '#f6c02c', r: '#d8342c', s: '#f0c8a0', k: INK, W: '#f4f4fa', p: '#7030b0' };

// Pixel logo: draw the word small in a chunky font, then outline and shade it pixel by pixel.
export function drawLogo(L, word = 'KINGSFOLD', px = 32) {
  const t = document.createElement('canvas'), tc = t.getContext('2d');
  const font = px + 'px "Jersey 10", "Arial Black", sans-serif';
  tc.font = font;
  const tw = Math.ceil(tc.measureText(word).width) + 2, th = Math.ceil(px * 0.95);
  t.width = tw; t.height = th;
  tc.font = font; tc.textBaseline = 'top'; tc.fillStyle = '#000'; tc.fillText(word, 1, 0);
  const data = tc.getImageData(0, 0, tw, th).data;
  let top = th, bot = 0;
  const m = [];
  for (let y = 0; y < th; y++) {
    m[y] = [];
    for (let x = 0; x < tw; x++) { const on = data[(y * tw + x) * 4 + 3] > 120; m[y][x] = on; if (on) { top = Math.min(top, y); bot = Math.max(bot, y); } }
  }
  const h = bot - top + 1;
  L.width = tw + 6; L.height = h + 7;
  const c = L.getContext('2d');
  const at = (x, y) => { y += top; return y >= 0 && y < th && x >= 0 && x < tw && m[y][x]; };
  for (let pass = 0; pass < 3; pass++) {
    for (let y = -2; y < h + 3; y++) for (let x = -2; x < tw + 3; x++) {
      const X = x + 2, Y = y + 2;
      if (pass === 0 && at(x - 2, y - 3)) { c.fillStyle = INK; c.fillRect(X, Y, 1, 1); }
      if (pass === 1 && !at(x, y) && [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [1, -1], [-1, 1]].some(([dx, dy]) => at(x + dx, y + dy))) { c.fillStyle = INK; c.fillRect(X, Y, 1, 1); }
      if (pass === 2 && at(x, y)) {
        const f = y / h;
        c.fillStyle = !at(x, y - 1) ? '#fff4b0' : f < 0.45 ? '#f6c02c' : f < 0.75 ? '#e89a1c' : '#c06a10';
        if (!at(x + 1, y) && f > 0.2) c.fillStyle = '#a85a10';
        c.fillRect(X, Y, 1, 1);
      }
    }
  }
}
