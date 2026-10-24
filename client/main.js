// Kingsfold in the browser. Everything is drawn on one small pixel screen (400x240 wide, 200x404 on phones)
// that is scaled up to fit the window, the way a 16-bit console drew its picture.

import { GEO, CENTER, RES, RES_NAME, TERRAIN_RES } from '/shared/board.js';
import {
  COSTS, WORKSHOPS, HOUSES, HOUSE_IDS, NEWS, CARD_INFO, LIMITS, WIN_CROWNS,
  canPay, handSize, legalSpots, workshopFits, workshopCost, bankRate, roadCost, viewFor,
} from '/shared/game.js';
import { Host } from '/shared/host.js';
import { PAL, INK, make, banner, dieFace, drawLogo, KING, KING_PAL, WORKSHOP_SPRITE, CARD_SPRITE } from './sprites.js';
import { BoardView, VX, VY, VW, VH, VPOS, EPOS, HPOS } from './board-view.js';
import { sfx, setMusic, setSound, audioState, unlock } from './audio.js';
import { UI, C, text, textWidth, LINE, fit, wrap } from './ui.js';
import { ServerNet, ServerTables, LocalNet, RoomNet, RoomTables, roomAvailable } from './net.js';

const SINGLE = !!window.KF_SINGLE;      // the one-file claude.ai page (no Node server)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const TERRAIN_NAME = { forest: 'Forest', hills: 'Hills', pasture: 'Pasture', fields: 'Fields', mountains: 'Mountains' };

/* ---------- screen and layout ---------- */

const LAND = {
  W: 400, H: 240, cols: 2,
  status: { x: 200, y: 3, w: 197, h: 45 }, players: { x: 200, y: 51, w: 197, h: 74 },
  board: { x: 3, y: 3, w: 194, h: 174 }, hand: { x: 3, y: 180, w: 194, h: 57 }, actions: { x: 200, y: 128, w: 197, h: 109 },
};
const PORT = {
  W: 200, H: 404, cols: 3,
  status: { x: 3, y: 3, w: 194, h: 42 }, players: { x: 3, y: 47, w: 194, h: 18 },
  board: { x: 3, y: 67, w: 194, h: 174 }, hand: { x: 3, y: 243, w: 194, h: 44 }, actions: { x: 3, y: 290, w: 194, h: 111 },
};
let L = LAND;
const cv = document.getElementById('screen');
const ui = new UI(cv);
const c = ui.c;
const T = (s, x, y, col = C.white, o) => text(c, s, x, y, col, o);

function resize() {
  const iw = window.innerWidth, ih = window.innerHeight;
  L = ih > iw * 1.15 ? PORT : LAND;
  cv.width = L.W; cv.height = L.H;
  let s = Math.min(iw / L.W, ih / L.H);
  if (s >= 2 && Math.floor(s) / s >= 0.85) s = Math.floor(s);
  cv.style.width = Math.floor(L.W * s) + 'px';
  cv.style.height = Math.floor(L.H * s) + 'px';
  ui.c.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);
resize();

/* ---------- state ---------- */

let screen = 'title';
let net = null, view = null, lobby = null, deadlineAt = 0;
let lastSeq = 0, fresh = true;
let modal = null, mode = null, wsKind = null, targets = null, boardHover = null;
let toasts = [], banners = [], tip = null, notice = null;
let rollUntil = 0, bumps = {};
let tables = [], tablesWatch = null, friendsNote = '';
let myName = store.get('kf_name', '') || 'Traveler';
let myHouse = store.get('kf_house', 'lions');
let nameEdit = null;     // { value }
const board = new BoardView(document.createElement('canvas'));
const titleBoard = new BoardView(document.createElement('canvas'));
let titleHost = null, titleView = null;
const sprites = new Map();
const spr = (key, rows, pal, ol = INK) => { let s = sprites.get(key); if (!s) { s = make(rows, pal, ol); sprites.set(key, s); } return s; };
const bannerOf = h => { let s = sprites.get('ban:' + h); if (!s) { s = banner(HOUSES[h]); sprites.set('ban:' + h, s); } return s; };
const logo = document.createElement('canvas');
const drawLogos = () => drawLogo(logo);
if (document.fonts && document.fonts.load) document.fonts.load('32px "Jersey 10"').then(drawLogos, drawLogos); else drawLogos();

/* ---------- title: bots play a demo game behind the menu ---------- */

function startAttract() {
  if (titleHost) return;
  const houses = HOUSE_IDS.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  titleHost = new Host({
    players: houses.map((h, i) => ({ name: ['Sir Bramble', 'Lady Wren', 'Old Tom', 'Mistress Fen'][i], house: h, bot: true })),
    seed: (Math.random() * 2 ** 31) | 0, timers: false, botDelay: 450,
    onChange: h => {
      titleView = viewFor(h.state, 0);
      titleBoard.setBoard(titleView.hexes);
      if (h.state.phase === 'over') setTimeout(() => { stopAttract(); if (screen === 'title') startAttract(); }, 4000);
    },
  });
}
function stopAttract() { if (titleHost) { titleHost.stop(); titleHost = null; } }

/* ---------- connecting ---------- */

function go(next) {
  if (screen === 'friends' && next !== 'friends' && tablesWatch) { tablesWatch.close(); tablesWatch = null; }
  screen = next;
  if (next === 'title') startAttract(); else stopAttract();
  if (next === 'friends') watchTables();
}

function attach(n) {
  net = n;
  view = null; lobby = null; fresh = true; lastSeq = 0; modal = null; mode = null; tip = null; toasts = []; banners = [];
  n.onLobby = lb => { lobby = lb; if (!lb.started) { view = null; fresh = true; modal = null; go('lobby'); } };
  n.onView = (v, rem) => { view = v; deadlineAt = rem > 0 ? Date.now() + rem : 0; if (screen !== 'game') go('game'); onView(); };
  n.onError = (msg, fatal) => { if (fatal) leaveTable(msg); else { toast(msg); sfx('error'); } };
  go('lobby');
}

function leaveTable(msg) {
  if (net) { const n = net; net = null; n.leave(); }
  view = null; lobby = null; modal = null; mode = null; tip = null;
  go('title');
  if (msg) notice = msg;
}

async function watchTables() {
  tables = []; friendsNote = '';
  if (!SINGLE) { tablesWatch = new ServerTables(list => { tables = list; }); return; }
  const room = await roomAvailable();
  if (screen !== 'friends') return;
  if (!room) { friendsNote = 'Playing with friends works on the claude.ai page while signed in, or on the Kingsfold server.'; return; }
  tablesWatch = new RoomTables(list => { tables = list; });
}

function hostTable() {
  unlock();
  if (!SINGLE) { const n = new ServerNet({ t: 'create', name: myName }); n.name = myName; return attach(n); }
  roomAvailable().then(room => { if (room) attach(new RoomNet({ host: true, name: myName, house: myHouse })); });
}
function joinTable(code) {
  unlock();
  code = String(code).toUpperCase();
  if (!SINGLE) {
    const seat = store.get('kf_seat', null);
    const n = new ServerNet({ t: 'join', code, name: myName, token: seat && seat.code === code ? seat.token : undefined });
    n.name = myName;
    return attach(n);
  }
  roomAvailable().then(room => { if (room) attach(new RoomNet({ code, name: myName, house: myHouse })); });
}

// arriving through a server invite link
const linkCode = !SINGLE && (location.pathname.match(/^\/room\/([A-Za-z]{4})$/) || [])[1];
if (linkCode) setTimeout(() => joinTable(linkCode), 0);
// on the claude.ai page, a reload goes back to the table this tab was at
let backTo = null;
try { backTo = SINGLE && sessionStorage.getItem('kf_table'); } catch { /* private mode */ }
if (backTo) setTimeout(() => joinTable(backTo), 0);

/* ---------- game updates ---------- */

const me = () => view.you;
const mine = () => view && view.turn === view.you && view.phase !== 'over';
const myP = () => view.players[view.you];
const pname = pid => (pid === view.you ? 'You' : view.players[pid].name);

function onView() {
  board.setBoard(view.hexes);
  processEvents();
  if (view.phase !== 'main' || !mine()) mode = null;
  if (mine() && view.phase === 'main' && view.freeRoads > 0) mode = 'road';
  updateTargets();
  forcedModals();
  maybeTip();
}

function processEvents() {
  const evs = view.events.filter(e => e.seq > lastSeq);
  if (fresh) { fresh = false; lastSeq = view.eventSeq; return; }
  lastSeq = view.eventSeq;
  for (const e of evs) {
    switch (e.type) {
      case 'roll': {
        rollUntil = performance.now() + 520;
        sfx('roll');
        const sum = e.dice[0] + e.dice[1];
        setTimeout(() => {
          if (!view) return;
          e.gains.forEach((g, k) => { for (let a = 0; a < g.amt; a++) board.float(g.hex, g.res, k * 60 + a * 120); });
          const got = e.gains.filter(g => g.pid === view.you);
          if (got.length) { sfx('coin'); got.forEach(g => { bumps[g.res] = performance.now(); }); }
          toast(pname(e.pid) + ' rolled ' + sum + '.');
          if (sum === 7) banner2('Seven! Bandits!');
        }, 520);
        break;
      }
      case 'build': sfx('build'); break;
      case 'steal':
        sfx('steal');
        if (e.to === view.you) toast('You stole 1 ' + RES_NAME[e.res] + ' from ' + view.players[e.from].name + '.');
        else if (e.from === view.you) toast(view.players[e.to].name + ' stole 1 ' + RES_NAME[e.res] + ' from you!');
        else toast(view.players[e.to].name + ' robbed ' + view.players[e.from].name + '.');
        break;
      case 'news': sfx('news'); banner2(NEWS[e.news].name.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase())); toast('News: ' + NEWS[e.news].text); break;
      case 'turn': if (e.pid === view.you) { sfx('turn'); banner2('Your turn!'); } break;
      case 'title': toast(pname(e.pid) + (e.pid === view.you ? ' have ' : ' has ') + (e.title === 'longest' ? 'the longest road' : 'the most knights') + '. +2 crowns!'); sfx('quest'); break;
      case 'trade': sfx('coin'); toast(pname(e.to) + ' traded with ' + (e.from === view.you ? 'you' : view.players[e.from].name) + '.'); break;
      case 'bank': if (e.pid === view.you) sfx('coin'); break;
      case 'play': toast(pname(e.pid) + ' played ' + CARD_INFO[e.kind].name + '.'); break;
      case 'card': if (e.pid === view.you && e.kind) toast("King's card: " + CARD_INFO[e.kind].name + '! ' + CARD_INFO[e.kind].text); break;
      case 'win': sfx('win'); break;
    }
  }
}

function toast(textStr) { toasts.push({ text: textStr, t0: performance.now() }); if (toasts.length > 3) toasts.shift(); const lv = document.getElementById('live'); if (lv) lv.textContent = textStr; }
function banner2(textStr) { banners = [{ text: textStr, t0: performance.now() }]; }

function updateTargets() {
  targets = null;
  if (!view || !mine()) return;
  const spots = legalSpots(view, me());
  if (view.phase === 'setupVillage') targets = { kind: 'vertex', ids: spots.villages, act: v => ({ type: 'placeVillage', v }) };
  else if (view.phase === 'setupRoad') targets = { kind: 'edge', ids: spots.roads, act: e => ({ type: 'placeRoad', e }) };
  else if (view.phase === 'robber') targets = { kind: 'hex', ids: GEO.hexes.map(h => h.id).filter(h => h !== view.bandit), act: hex => ({ type: 'moveBandit', hex }) };
  else if (view.phase === 'main' && mode) {
    if (mode === 'road') targets = { kind: 'edge', ids: spots.roads, act: e => ({ type: 'build', what: 'road', e }) };
    if (mode === 'village') targets = { kind: 'vertex', ids: spots.villages, act: v => ({ type: 'build', what: 'village', v }) };
    if (mode === 'town') targets = { kind: 'vertex', ids: spots.towns, act: v => ({ type: 'build', what: 'town', v }) };
    if (mode === 'workshop') targets = { kind: 'vertex', ids: spots.workshops.filter(v => workshopFits(wsKind, v)), act: v => ({ type: 'build', what: 'workshop', v, kind: wsKind }) };
  }
}
function setMode(m) { mode = m; updateTargets(); }

function targetAt(x, y) {
  if (!targets) return null;
  if (targets.kind === 'vertex') return board.vertexAt(x, y, targets.ids);
  if (targets.kind === 'edge') return board.edgeAt(x, y, targets.ids);
  const h = board.hexAt(x, y);
  return targets.ids.includes(h) ? h : null;
}

function boardClick(x, y) {
  unlock();
  if (targets) {
    const id = targetAt(x, y);
    if (id === null) return;
    sfx('click');
    const a = targets.act(id);
    if (mode && !(mode === 'road' && view.freeRoads > 1)) mode = null;
    net.act(a);
    return;
  }
  const h = board.hexAt(x, y);
  if (h >= 0) landInfo(h);
}

function landInfo(h) {
  const hx = view.hexes[h];
  if (h === CENTER) return toast('The castle of King Aldric. The bandits hide in the slum by its west wall.');
  const owners = [];
  GEO.hexes[h].vertices.forEach(v => { const b = view.buildings[v]; if (b) owners.push(pname(b.owner)); });
  let s = TERRAIN_NAME[hx.terrain] + ' on ' + hx.number + ' pays ' + RES_NAME[TERRAIN_RES[hx.terrain]];
  s += owners.length ? ' to ' + [...new Set(owners)].join(', ') + '.' : '. Nobody lives here yet.';
  if (view.bandit === h) s += ' Bandits block it.';
  toast(s);
}

function forcedModals() {
  if (view.phase === 'over') { if (!modal || modal.kind !== 'over') modal = { kind: 'over' }; return; }
  if (view.phase === 'discard' && view.discards[view.you]) { if (!modal || modal.kind !== 'discard') modal = { kind: 'discard', cards: {} }; return; }
  if (view.phase === 'steal' && mine()) { if (!modal || modal.kind !== 'steal') modal = { kind: 'steal' }; return; }
  if (modal && ['over', 'discard', 'steal'].includes(modal.kind)) modal = null;
  if (modal && ['trade', 'workshop'].includes(modal.kind) && !(mine() && view.phase === 'main')) modal = null;
}

/* ---------- the King's tips ---------- */

const TIPS = {
  setupVillage: 'Pick a glowing spot for your first village. Lands with 6 and 8 pay out most often.',
  setupRoad: 'Now a road next to it. Roads lead to new places to build.',
  roll: 'Your turn! Press ROLL. Every land showing that number pays the villages next to it.',
  main: 'Spend your cards. Faded icons on a button are cards you are missing. Press End when done.',
  trade: 'Short on something? Trade lets you ask the others, or swap 4 of a kind with the bank.',
  robber: 'Tap a land to send the bandits there. It stops paying and you steal a card.',
  discard: 'A 7 was rolled while you held more than 7 cards. Pick half to drop.',
  picks: 'A free card! Tap the card you want in your hand.',
  offer: 'Someone wants to trade. Press Yes if it is a good deal.',
};
function maybeTip() {
  if (!store.get('kf_tips', true) || !view || view.phase === 'over') { tip = null; return; }
  const seen = store.get('kf_seen', []);
  const p = myP();
  let key = null;
  if (p.picks > 0) key = 'picks';
  else if (view.phase === 'discard' && view.discards[view.you]) key = 'discard';
  else if (view.offer && view.offer.from !== view.you && !view.offer.declined.includes(view.you)) key = 'offer';
  else if (mine()) {
    if (['setupVillage', 'setupRoad', 'roll', 'robber'].includes(view.phase)) key = view.phase;
    else if (view.phase === 'main') key = !seen.includes('main') ? 'main' : view.turnCount > view.players.length * 2 ? 'trade' : null;
  }
  if (!key || seen.includes(key)) { if (tip && tip !== key) tip = null; return; }
  tip = key;
}
function dismissTip() {
  const seen = store.get('kf_seen', []);
  if (tip && !seen.includes(tip)) { seen.push(tip); store.set('kf_seen', seen); }
  tip = null;
  maybeTip();
}

/* ---------- small drawing helpers ---------- */

function costRow(cost, hand, x, y) {
  const have = hand ? { ...hand } : null;
  let cx = x;
  if (!handSize(cost)) return T('free', x, y, C.green);
  for (const r of RES) for (let i = 0; i < (cost[r] || 0); i++) {
    let alpha = 1;
    if (have) { if (have[r] > 0) have[r]--; else alpha = 0.3; }
    cx += ui.icon(r, cx, y + 8 - ui.iconSize(r)[1], 1, alpha) - 1;
  }
  return cx - x;
}
function costWidth(cost) { let w = 0; for (const r of RES) w += (cost[r] || 0) * (ui.iconSize(r)[0] - 1); return w || textWidth('free'); }

function flag(house, x, y) {
  const h = HOUSES[house];
  c.fillStyle = INK; c.fillRect(x, y, 8, 10);
  c.fillStyle = h.color; c.fillRect(x + 1, y + 1, 6, 8);
  c.fillStyle = h.shade; c.fillRect(x + 6, y + 1, 1, 8);
  c.fillStyle = '#f6c02c'; c.fillRect(x + 1, y + 1, 6, 1); c.fillRect(x + 3, y + 4, 2, 2);
}

function dieCanvas(n) { return spr('die' + n, dieFace(n), PAL); }

function stepper(x, y, value, max, onChange, keyBase) {
  ui.button(x, y, 12, 12, '-', () => onChange(value - 1), { enabled: value > 0, glove: false, key: keyBase + '-' });
  T(String(value), x + 22, y + 3, C.white, { align: 'center' });
  ui.button(x + 32, y, 12, 12, '+', () => onChange(value + 1), { enabled: value < max, glove: false, key: keyBase + '+' });
}

function modalBox(w, h, title) {
  ui.block(0, 0, L.W, L.H);
  c.fillStyle = 'rgba(8,8,24,0.55)'; c.fillRect(0, 0, L.W, L.H);
  w = Math.min(w, L.W - 6); h = Math.min(h, L.H - 6);
  const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
  ui.window(x, y, w, h);
  if (title) T(title, x + 8, y + 7, C.gold);
  return { x, y, w, h, ix: x + 8, iy: y + 20, iw: w - 16 };
}

/* ---------- screens: title ---------- */

function drawTitle(t) {
  c.fillStyle = '#163c84'; c.fillRect(0, 0, L.W, L.H);
  const land = L === LAND;
  const bx = 6, by = land ? 62 : 50;
  if (titleView) titleBoard.render(titleView, null, t);
  c.drawImage(titleBoard.cv, bx, by);
  const lw = land ? 230 : 188, lh = Math.round(logo.height * lw / Math.max(1, logo.width));
  if (logo.width > 1) c.drawImage(logo, Math.floor((L.W - lw) / 2), 6, lw, lh);
  const mx = land ? 206 : 6, my = land ? 72 : 224, mw = 188;
  ui.window(mx, my, mw, 126);
  const opts = [
    ['Play with friends', () => { unlock(); if (!store.get('kf_name', '')) { nameEdit = { value: '', then: 'friends' }; go('name'); } else go('friends'); }],
    ['Play vs bots', () => { unlock(); go('bots'); }],
    ['How to play', () => { modal = { kind: 'rules' }; }],
  ];
  opts.forEach(([label, fn], i) => ui.button(mx + 18, my + 10 + i * 22, mw - 30, 18, label, fn, { align: 'left' }));
  T('Name:', mx + 12, my + 82, C.soft);
  T(fit(myName, 80), mx + 44, my + 82, C.white);
  ui.button(mx + mw - 58, my + 78, 48, 15, 'Change', () => { nameEdit = { value: myName }; go('name'); }, { glove: false });
  T('First to 8 crowns wins', mx + mw / 2, my + 104, C.dim, { align: 'center' });
  if (notice) {
    const lines = wrap(notice, L.W - 40);
    const h = lines.length * LINE + 12;
    ui.window(10, L.H - h - 6, L.W - 20, h);
    lines.forEach((l, i) => T(l, 18, L.H - h + i * LINE, C.gold));
    ui.hit(10, L.H - h - 6, L.W - 20, h, () => { notice = null; });
  }
}

/* ---------- screens: name and code entry on an old-school letter grid ---------- */

const NAME_ROWS = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', "0123456789 -'"];
const CODE_ROWS = ['ABCDEFGHJKLM', 'NPQRSTUVWXYZ'];
function drawLetterGrid(title, value, rows, maxLen, ops, onBack) {
  c.fillStyle = '#101848'; c.fillRect(0, 0, L.W, L.H);
  const cell = 13, gw = rows[0].length * cell;
  const w = Math.min(L.W - 6, Math.max(gw + 24, 180)), h = 60 + rows.length * cell + 36;
  const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
  ui.window(x, y, w, h);
  T(title, x + 10, y + 8, C.gold);
  const shown = value + (Math.floor(ui.t / 12) % 2 && value.length < maxLen ? '_' : ' ');
  c.fillStyle = '#0c1240'; c.fillRect(x + 10, y + 22, w - 20, 16);
  T(shown, x + 15, y + 26, C.white);
  const gx = x + Math.floor((w - gw) / 2), gy = y + 46;
  rows.forEach((row, r) => [...row].forEach((ch, i) => {
    const cx = gx + i * cell, cy = gy + r * cell;
    const hot = ui.hit(cx, cy, cell, cell, () => { if (value.length < maxLen) { sfx('click'); ops.type(ch); } }, 'k' + r + ':' + i);
    if (hot) { c.fillStyle = '#5068d8'; c.fillRect(cx, cy, cell - 1, cell - 1); }
    T(ch === ' ' ? '_' : ch, cx + 6, cy + 3, ch === ' ' ? C.dim : C.white, { align: 'center' });
  }));
  const by = gy + rows.length * cell + 8;
  ui.button(x + 10, by, 46, 16, 'Back', onBack, { glove: false });
  ui.button(x + 62, by, 40, 16, 'Del', () => ops.del(), { glove: false });
  ui.button(x + w - 60, by, 50, 16, 'OK', () => ops.ok(), { kind: 'red', enabled: !!value.trim(), glove: false });
}

function saveName() {
  if (!nameEdit.value.trim()) return;
  const then = nameEdit.then;
  myName = nameEdit.value.trim().slice(0, 12);
  store.set('kf_name', myName);
  nameEdit = null;
  go(then || 'title');
}
function drawName() {
  const ed = nameEdit;
  drawLetterGrid(ed.then ? 'Your name, for your friends' : 'Your name', ed.value, NAME_ROWS, 12, {
    type: ch => { ed.value += ch; },
    del: () => { ed.value = ed.value.slice(0, -1); },
    ok: saveName,
  }, () => { nameEdit = null; go('title'); });
}

let codeEdit = '';
function drawCode() {
  drawLetterGrid('Table code', codeEdit, CODE_ROWS, 4, {
    type: ch => { codeEdit += ch; },
    del: () => { codeEdit = codeEdit.slice(0, -1); },
    ok: () => { if (codeEdit.length === 4) { const code = codeEdit; codeEdit = ''; joinTable(code); } },
  }, () => { codeEdit = ''; go('friends'); });
}

/* ---------- screens: friends (open tables) ---------- */

function drawTitleBackdrop(t) {
  c.fillStyle = '#163c84'; c.fillRect(0, 0, L.W, L.H);
  if (titleView) { titleBoard.render(titleView, null, t); c.globalAlpha = 0.5; c.drawImage(titleBoard.cv, Math.floor((L.W - VW) / 2), Math.floor((L.H - VH) / 2)); c.globalAlpha = 1; }
}

function drawFriends(t) {
  drawTitleBackdrop(t);
  const w = Math.min(L.W - 10, 300), h = Math.min(L.H - 10, 200);
  const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
  ui.window(x, y, w, h);
  T('Play with friends', x + 10, y + 8, C.gold);
  let cy = y + 24;
  if (friendsNote) wrap(friendsNote, w - 20).forEach((l, i) => T(l, x + 10, cy + i * LINE, C.soft));
  else {
    if (tables.length) T('Open tables:', x + 10, cy, C.soft);
    else wrap('No open tables yet. Host one, then ask your friends to open this page.', w - 20).forEach((l, i) => T(l, x + 10, cy + i * LINE, C.soft));
    cy += (tables.length ? 1 : 2) * LINE + 4;
    tables.slice(0, 5).forEach((tb, i) => {
      const ry = cy + i * 20;
      ui.button(x + 20, ry, w - 30, 17, '', () => joinTable(tb.code), {
        enabled: !tb.started && tb.n < 6, key: 'tb' + tb.code,
        content: (bx, by2) => {
          T(fit(tb.title, w - 120), bx + 6, by2 + 5, C.white);
          T(tb.started ? 'playing' : tb.n + '/6', bx + w - 70, by2 + 5, C.soft, { align: 'right' });
          T(tb.code, bx + w - 36, by2 + 5, C.gold, { align: 'right' });
        },
      });
    });
  }
  const by = y + h - 24;
  ui.button(x + 10, by, 50, 17, 'Back', () => go('title'), { glove: false });
  if (!SINGLE) ui.button(x + 66, by, 74, 17, 'Enter code', () => { codeEdit = ''; go('code'); }, { glove: false });
  ui.button(x + w - 104, by, 94, 17, 'Host a table', hostTable, { kind: 'red', enabled: !friendsNote, glove: false });
}

/* ---------- screens: house picker, lobby, bots setup ---------- */

function housePicker(x, y, w, selected, takenFn, onPick) {
  const slot = Math.floor(w / 6);
  let shown = selected;
  HOUSE_IDS.forEach((h, i) => {
    const sx = x + i * slot, taken = takenFn(h);
    const hot = ui.hit(sx, y, slot, 26, taken ? null : () => { sfx('click'); onPick(h); }, 'hp' + h);
    if (hot && !taken) shown = h;
    if (h === selected) { c.fillStyle = C.gold; c.fillRect(sx + 1, y, slot - 2, 26); c.fillStyle = '#1c2470'; c.fillRect(sx + 2, y + 1, slot - 4, 24); }
    const b = bannerOf(h);
    if (taken) c.globalAlpha = 0.3;
    c.drawImage(b, sx + Math.floor((slot - b.width) / 2), y + 3 - (h === selected ? Math.floor(ui.t / 10) % 2 : 0));
    c.globalAlpha = 1;
  });
  const H2 = HOUSES[shown];
  T(H2.name, x, y + 30, C.gold);
  wrap(H2.power, w).slice(0, 2).forEach((l, i) => T(l, x, y + 41 + i * LINE, C.white));
}

function drawLobby(t) {
  drawTitleBackdrop(t);
  if (!lobby) { T('Opening the table...', L.W / 2, L.H / 2, C.white, { align: 'center' }); return; }
  const land = L === LAND;
  const w = land ? 390 : 194, h = land ? 230 : 396;
  const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
  ui.window(x, y, w, h);
  T(fit(lobby.title, w - 90), x + 10, y + 8, C.gold);
  if (lobby.code) { T('Code', x + w - 42, y + 8, C.dim, { align: 'right' }); T(lobby.code, x + w - 12, y + 8, C.white, { align: 'right' }); }
  const colW = land ? 180 : w - 20;
  let cy = y + 24;
  T('At the table', x + 10, cy, C.soft); cy += 13;
  lobby.seats.forEach(s => {
    flag(s.house, x + 12, cy);
    T(fit(s.name + (s.seat === lobby.you ? ' (you)' : ''), colW - 70), x + 24, cy + 1, s.connected ? C.white : C.dim);
    const tag = s.bot ? 'bot' : s.host ? 'host' : !s.connected ? 'away' : '';
    if (tag) T(tag, x + colW - 10, cy + 1, C.dim, { align: 'right' });
    if (lobby.isHost && s.seat !== lobby.you) ui.button(x + colW - 4, cy - 1, 12, 11, 'x', () => net.removeSeat(s.seat), { glove: false, key: 'rm' + s.seat });
    cy += 14;
  });
  for (let i = lobby.seats.length; i < 6; i++) { T('- empty seat -', x + 24, cy + 1, '#5a66b0'); cy += 14; }
  const px = land ? x + 200 : x + 10, py = land ? y + 24 : cy + 6;
  T('Pick your house', px, py, C.soft);
  const mineSeat = lobby.seats[lobby.you];
  housePicker(px, py + 13, land ? 180 : w - 20, mineSeat ? mineSeat.house : myHouse,
    h2 => lobby.seats.some(s => s.seat !== lobby.you && s.house === h2),
    h2 => { myHouse = h2; store.set('kf_house', h2); net.setHouse(h2); });
  const by = y + h - 24;
  ui.button(x + 10, by, 50, 17, 'Leave', () => leaveTable(), { glove: false });
  if (lobby.isHost) {
    ui.button(x + 66, by, 62, 17, '+ Bot', () => net.addBot(), { enabled: lobby.seats.length < 6, glove: false });
    ui.button(x + w - 80, by, 70, 17, 'Start', () => { unlock(); net.start(); }, { kind: 'red', enabled: lobby.seats.length >= 2, glove: false });
    if (lobby.seats.length < 2) T(land ? 'Waiting for friends to sit down...' : 'Waiting for friends...', x + 10, by - 14, C.dim);
  } else T('The host starts the game.', x + w - 12, by + 5, C.soft, { align: 'right' });
}

let botsCount = 3;
function drawBots(t) {
  drawTitleBackdrop(t);
  const w = Math.min(L.W - 10, 280), h = 150;
  const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
  ui.window(x, y, w, h);
  T('Play vs bots', x + 10, y + 8, C.gold);
  T('Pick your house', x + 10, y + 24, C.soft);
  housePicker(x + 10, y + 37, w - 20, myHouse, () => false, h2 => { myHouse = h2; store.set('kf_house', h2); });
  T('Bots: ' + botsCount, x + 10, y + 105, C.white);
  ui.button(x + 64, y + 101, 14, 14, '-', () => { botsCount = Math.max(1, botsCount - 1); }, { enabled: botsCount > 1, glove: false });
  ui.button(x + 82, y + 101, 14, 14, '+', () => { botsCount = Math.min(5, botsCount + 1); }, { enabled: botsCount < 5, glove: false });
  const by = y + h - 24;
  ui.button(x + 10, by, 50, 17, 'Back', () => go('title'), { glove: false });
  ui.button(x + w - 80, by, 70, 17, 'Start', () => { unlock(); attach(new LocalNet({ name: myName, house: myHouse, bots: botsCount })); }, { kind: 'red', glove: false });
}

/* ---------- the game screen ---------- */

function phaseText() {
  const p = view.players[view.turn], n = p.name, my = mine();
  switch (view.phase) {
    case 'setupVillage': return my ? ['Place a village', 'Tap a glowing spot on the map.'] : [n + ' is settling', 'Picking a spot...'];
    case 'setupRoad': return my ? ['Place a road', 'It must touch your new village.'] : [n + ' is settling', 'Placing a road...'];
    case 'roll': return my ? ['Your turn!', 'Roll the dice.'] : [n + "'s turn", 'About to roll...'];
    case 'main': return my ? ['Your turn!', 'Build, trade, then press End.'] : [n + "'s turn", 'Building and trading...'];
    case 'discard': return view.discards[view.you] ? ['Too many cards!', 'Drop ' + view.discards[view.you] + ' of them.'] : ['Bandits!', 'Others are dropping cards...'];
    case 'robber': return my ? ['Move the bandits', 'Tap a land to send them there.'] : [n + ' has the bandits', 'Choosing where they go...'];
    case 'steal': return my ? ['Rob someone', 'Pick who to steal from.'] : [n + ' is stealing', '...'];
    case 'over': return ['Long live ' + view.players[view.winner].name + '!', 'The game is over.'];
  }
  return ['', ''];
}

function drawStatus(r) {
  ui.window(r.x, r.y, r.w, r.h);
  const x = r.x + 7, y = r.y + 6;
  let [a, b] = phaseText();
  if (myP().picks > 0) b = 'Free card! Tap one in your hand.';
  ui.button(r.x + r.w - 21, r.y + 4, 15, 13, '', () => { modal = { kind: 'menu' }; }, {
    glove: false, key: 'menu',
    content: (bx, by) => { c.fillStyle = '#ffffff'; for (let i = 0; i < 3; i++) c.fillRect(bx + 4, by + 3 + i * 3, 7, 1); },
  });
  let right = r.x + r.w - 26;
  if (deadlineAt && view.phase !== 'over') {
    const secs = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
    const low = secs <= 10 && (view.phase === 'discard' ? !!view.discards[view.you] : mine());
    const w = T(String(secs), right, y, low && Math.floor(ui.t / 8) % 2 ? C.red : C.white, { align: 'right' });
    ui.icon('hourglass', right - w - 11, y - 1);
    right -= w + 14;
  }
  T(fit(a, right - x - 4), x, y, mine() ? C.gold : C.white);
  T(fit(b, r.w - 14), x, y + LINE, C.soft);
  if (view.news) {
    const n = NEWS[view.news];
    ui.hit(r.x, y + 2 * LINE - 2, r.w, LINE, () => toast(n.name + ': ' + n.text), 'news');
    T(fit(n.text, r.w - 14), x, y + 2 * LINE, '#f8a858');
  }
}

function drawPlayers(r) {
  ui.window(r.x, r.y, r.w, r.h);
  if (r.h < 30) {
    // phones: one row of flags and crowns; tap for details
    const n = view.players.length, cw = Math.floor((r.w - 6) / n);
    view.players.forEach((p, i) => {
      const x = r.x + 3 + i * cw, y = r.y + 3;
      if (p.id === view.turn && view.phase !== 'over') { c.fillStyle = C.gold; c.fillRect(x, y, cw - 1, 12); c.fillStyle = '#1c2470'; c.fillRect(x + 1, y + 1, cw - 3, 10); }
      flag(p.house, x + 2, y + 1);
      ui.icon('crown', x + 12, y + 3);
      T(String(p.totalCrowns !== undefined ? p.totalCrowns : p.crowns), x + 22, y + 3, p.id === view.you ? C.gold : C.white);
    });
    ui.hit(r.x, r.y, r.w, r.h, () => { modal = { kind: 'players' }; }, 'strip');
    return;
  }
  view.players.forEach((p, i) => {
    const x = r.x + 7, y = r.y + 6 + i * 11;
    if (p.id === view.turn && view.phase !== 'over') c.drawImage(ui.glove, x - 4 + (Math.floor(ui.t / 8) % 2), y);
    flag(p.house, x + 9, y - 1);
    T(fit(p.name, 70), x + 21, y, p.id === view.you ? C.gold : C.white);
    let rx = r.x + r.w - 8;
    const crowns = p.totalCrowns !== undefined ? p.totalCrowns : p.crowns;
    rx -= T(String(crowns), rx, y, C.white, { align: 'right' }) + 10;
    ui.icon('crown', rx, y);
    rx -= 4;
    rx -= T(String(p.handCount), rx, y, C.soft, { align: 'right' }) + 10;
    ui.icon('card', rx, y - 2);
    if (view.army === p.id) { rx -= 9; ui.icon('knight', rx, y - 1); }
    if (view.longest === p.id) { rx -= 10; ui.icon('longroad', rx, y); }
    if (lobby && lobby.seats[p.id] && !lobby.seats[p.id].bot && lobby.seats[p.id].connected === false) T('away', rx - 4, y, C.red, { align: 'right' });
  });
}

function drawBoardArea(r, t) {
  ui.window(r.x, r.y, r.w, r.h);
  const bx = r.x + 3, by = r.y + 3;
  boardHover = ui.mx >= bx && ui.my >= by && ui.mx < bx + VW && ui.my < by + VH ? targetAt(ui.mx - bx + VX, ui.my - by + VY) : null;
  board.render(view, { targets, hover: boardHover }, t);
  c.drawImage(board.cv, bx, by);
  ui.hit(bx, by, VW, VH, (x, y) => boardClick(x - bx + VX, y - by + VY), 'board');

  // a trade offer sits at the top of the map
  const o = view.offer;
  if (o) {
    const h = 32, oy = by + 3;
    ui.window(bx + 2, oy, VW - 4, h);
    ui.block(bx + 2, oy, VW - 4, h);
    const ix = bx + 8, iy = oy + 6;
    const who = o.from === view.you ? 'You' : view.players[o.from].name;
    let cx = ix + T(fit(who, 60) + ':', ix, iy, C.gold) + 4;
    cx += costRow(o.give, null, cx, iy) + 4;
    cx += T('for', cx, iy, C.soft) + 4;
    costRow(o.get, null, cx, iy);
    const ry = iy + 11;
    if (o.from === view.you) {
      T(o.declined.length ? o.declined.length + ' said no' : 'Waiting...', ix, ry + 2, C.soft);
      ui.button(bx + VW - 56, ry, 46, 12, 'Cancel', () => net.act({ type: 'cancelOffer' }), { glove: false });
    } else if (o.declined.includes(view.you)) T('You said no.', ix, ry + 2, C.soft);
    else {
      const can = canPay(myP().hand, o.get);
      if (!can) T("You don't have those.", ix, ry + 2, C.soft);
      ui.button(bx + VW - 100, ry, 40, 12, 'Yes', () => net.act({ type: 'acceptOffer', id: o.id }), { kind: 'green', enabled: can, glove: false });
      ui.button(bx + VW - 56, ry, 46, 12, 'No', () => net.act({ type: 'declineOffer', id: o.id }), { glove: false });
    }
  }

  // what the glowing spots are for
  let bottomY = by + VH - 3;
  if (mode && targets) {
    const what = mode === 'workshop' ? WORKSHOPS[wsKind].name : mode;
    let s = targets.ids.length ? 'Tap a glowing spot for your ' + what + '.' : 'No spot for a ' + what + ' right now.';
    if (mode === 'road' && view.freeRoads > 0) s = 'Builders: place ' + view.freeRoads + ' free road' + (view.freeRoads > 1 ? 's' : '') + '.';
    const h = 20;
    ui.window(bx + 2, bottomY - h, VW - 4, h);
    ui.block(bx + 2, bottomY - h, VW - 4, h);
    T(fit(s, VW - 66), bx + 8, bottomY - h + 7, C.white);
    if (!(mode === 'road' && view.freeRoads > 0)) ui.button(bx + VW - 52, bottomY - h + 4, 44, 12, 'Cancel', () => setMode(null), { glove: false });
    bottomY -= h + 2;
  }

  // messages, newest at the bottom
  const now = performance.now();
  toasts = toasts.filter(m => now - m.t0 < 4200);
  toasts.slice(-1).forEach(m => {
    const lines = wrap(m.text, VW - 20).slice(0, 2);
    const h = lines.length * LINE + 8;
    bottomY -= h;
    ui.window(bx + 2, bottomY, VW - 4, h);
    lines.forEach((l, i) => T(l, bx + 9, bottomY + 5 + i * LINE, C.white));
    bottomY -= 2;
  });
  // big announcements across the middle
  banners = banners.filter(m => now - m.t0 < 1800);
  banners.forEach(m => {
    const w = Math.min(VW - 8, textWidth(m.text) * 2 + 24);
    const y = by + Math.floor(VH / 2) - 16 - Math.min(10, Math.floor((now - m.t0) / 20));
    ui.window(bx + Math.floor((VW - w) / 2), y, w, 26);
    T(m.text, bx + VW / 2, y + 6, C.gold, { align: 'center', scale: 2 });
  });
}

function drawHand(r) {
  ui.window(r.x, r.y, r.w, r.h);
  const p = myP(), picks = p.picks > 0;
  const cw = 34, gap = 4, x0 = r.x + 4, y0 = r.y + 4, ch = r.h - 8;
  const now = performance.now();
  RES.forEach((res, i) => {
    const x = x0 + i * (cw + gap), y = y0;
    const n = p.hand[res];
    const bump = bumps[res] && now - bumps[res] < 500;
    const hot = ui.hit(x, y, cw, ch, picks ? () => { sfx('coin'); net.act({ type: 'pick', res }); } : null, 'card' + res);
    const glow = picks && Math.floor(ui.t / 8) % 2;
    c.fillStyle = INK; c.fillRect(x, y, cw, ch);
    c.fillStyle = bump || glow || (picks && hot) ? '#fff0a0' : n ? C.parch : '#b8ac90'; c.fillRect(x + 1, y + 1, cw - 2, ch - 2);
    c.fillStyle = n ? C.parchShade : '#9c9078'; c.fillRect(x + 1, y + ch - 3, cw - 2, 2);
    const [iw, ih] = ui.iconSize(res);
    ui.icon(res, x + Math.floor((cw - iw * 2) / 2), y + 3 + (bump ? -2 : 0) + (8 - ih), 2, n ? 1 : 0.45);
    T(String(n), x + cw / 2, y + 20, n ? C.parchInk : '#7a705c', { align: 'center', scale: 2, shadow: null });
    if (ch > 40) T(RES_NAME[res], x + cw / 2, y + 38, n ? '#7a5a30' : '#857a64', { align: 'center', shadow: null });
    if (picks && hot) c.drawImage(ui.glove, x - 6, y + 2);
  });
}

function drawActions(r) {
  ui.window(r.x, r.y, r.w, r.h);
  const p = myP(), hand = p.hand, my = mine(), main = my && view.phase === 'main';
  const x0 = r.x + 7, y0 = r.y + 6, iw = r.w - 14;
  const rolling = performance.now() < rollUntil;
  const faces = rolling ? [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)] : view.dice || [1, 1];
  c.globalAlpha = view.dice || rolling ? 1 : 0.5;
  c.drawImage(dieCanvas(faces[0]), x0, y0 + (rolling ? Math.floor(Math.random() * 2) : 0), 18, 18);
  c.drawImage(dieCanvas(faces[1]), x0 + 21, y0 + (rolling ? Math.floor(Math.random() * 2) : 0), 18, 18);
  c.globalAlpha = 1;
  ui.button(x0 + 46, y0, iw - 46, 18, 'ROLL', () => { unlock(); net.act({ type: 'roll' }); }, { kind: 'red', enabled: my && view.phase === 'roll', key: 'roll' });

  const spots = legalSpots(view, me());
  const cols = L.cols, gap = 4, tall = cols === 3;
  const bw = Math.floor((iw - gap * (cols - 1)) / cols), bh = tall ? 24 : 16;
  const rowY = i => y0 + 22 + i * (bh + 3);
  const cell = i => ({ x: x0 + (i % cols) * (bw + gap), y: rowY(Math.floor(i / cols)) });
  const rc = view.freeRoads > 0 ? {} : roadCost(view);
  const items = [
    { label: 'Road', cost: rc, ok: main && canPay(hand, rc) && spots.roads.length > 0 && p.roads < LIMITS.road, on: mode === 'road', fn: () => setMode(mode === 'road' ? null : 'road') },
    { label: 'Village', cost: COSTS.village, ok: main && canPay(hand, COSTS.village) && spots.villages.length > 0 && p.villages < LIMITS.village, on: mode === 'village', fn: () => setMode(mode === 'village' ? null : 'village') },
    { label: 'Town', cost: COSTS.town, ok: main && canPay(hand, COSTS.town) && spots.towns.length > 0 && p.towns < LIMITS.town, on: mode === 'town', fn: () => setMode(mode === 'town' ? null : 'town') },
    { label: 'Workshop', ok: main && spots.workshops.length > 0, on: mode === 'workshop', fn: () => { modal = { kind: 'workshop' }; } },
    { label: tall ? 'K.Card' : "King's card", cost: COSTS.card, ok: main && canPay(hand, COSTS.card) && view.deck > 0, fn: () => net.act({ type: 'buyCard' }) },
    { label: 'Trade', ok: main && handSize(hand) > 0, fn: () => { modal = { kind: 'trade', tab: 'bank', give: {}, get: {}, bankGive: null, bankGet: null }; } },
  ];
  items.forEach((it, i) => {
    const { x, y } = cell(i);
    ui.button(x, y, bw, bh, tall ? '' : it.label, () => { sfx('click'); it.fn(); }, {
      enabled: it.ok, selected: it.on, align: 'left', key: 'act' + i,
      content: (bx, by2, pressed) => {
        const d = pressed ? 1 : 0;
        if (tall) {
          T(it.label, bx + bw / 2, by2 + 4 + d, it.ok ? (it.on ? '#3a2408' : C.white) : '#6c78b8', { align: 'center', shadow: it.on ? null : '#101030' });
          if (it.cost) costRow(it.cost, hand, bx + Math.floor((bw - costWidth(it.cost)) / 2), by2 + 13 + d);
        } else if (it.cost) costRow(it.cost, hand, bx + bw - 5 - costWidth(it.cost), by2 + 4 + d);
      },
    });
  });
  // last row: King's cards in hand, undo, end turn
  const ly = rowY(Math.ceil(items.length / cols));
  const cwid = tall ? bw : 52, uwid = tall ? bw : 34;
  ui.button(x0, ly, cwid, bh, 'Cards ' + p.cards.length, () => { modal = { kind: 'cards' }; }, { enabled: p.cards.length > 0, glove: !tall, key: 'cards' });
  ui.button(x0 + cwid + gap, ly, uwid, bh, 'Undo', () => net.act({ type: 'undo' }), { enabled: main && view.undo > 0, glove: false, key: 'undo' });
  const ex = x0 + cwid + uwid + gap * 2;
  ui.button(ex, ly, x0 + iw - ex, bh, 'End', () => { setMode(null); net.act({ type: 'endTurn' }); }, { kind: 'red', enabled: main && !(view.freeRoads > 0 && spots.roads.length), key: 'end' });
}

function drawGame(t) {
  c.fillStyle = '#0c1036'; c.fillRect(0, 0, L.W, L.H);
  if (!view) { T('Setting up the board...', L.W / 2, L.H / 2, C.white, { align: 'center' }); return; }
  drawBoardArea(L.board, t);
  drawHand(L.hand);
  drawStatus(L.status);
  drawPlayers(L.players);
  drawActions(L.actions);
}

/* ---------- pop-up windows ---------- */

function drawModal() {
  const m = modal;
  if (!m) return;
  const close = () => { modal = null; };
  if (m.kind === 'rules') {
    const b = modalBox(300, 214, 'How to play');
    const lines = [
      'Roll the dice. Every land showing that number pays the villages next to it. Towns get 2.',
      'Trade with friends, or give the bank 4 of a kind for 1.',
      'Build roads, villages and towns. Spots you can build on glow.',
      'Village 1 crown, town 2. Longest road (5+) and most knights (3+) give 2 more.',
      'A 7 lets the bandits out. Holding over 7 cards? Drop half.',
      'First to 8 crowns wins!',
    ];
    let y = b.iy;
    lines.forEach(s => { const ls = wrap(s, b.iw); ls.forEach((l, i) => T(l, b.ix, y + i * LINE, C.white)); y += ls.length * LINE + 3; });
    ui.button(b.x + b.w - 58, b.y + b.h - 22, 50, 15, 'OK', close, { glove: false });
    return;
  }
  if (m.kind === 'menu') {
    const b = modalBox(180, 150, 'Menu');
    const a = audioState();
    const rows = [
      ['Music: ' + (a.music ? 'on' : 'off'), () => setMusic(!a.music)],
      ['Sound: ' + (a.sound ? 'on' : 'off'), () => { setSound(!a.sound); sfx('click'); }],
      ["King's tips: " + (store.get('kf_tips', true) ? 'on' : 'off'), () => { const on = !store.get('kf_tips', true); store.set('kf_tips', on); if (on) store.set('kf_seen', []); maybeTip(); }],
      ['How to play', () => { modal = { kind: 'rules' }; }],
      ['Leave game', () => leaveTable()],
    ];
    rows.forEach(([label, fn], i) => ui.button(b.ix + 10, b.iy + i * 20, b.iw - 10, 16, label, fn, { align: 'left', key: 'menu' + i }));
    ui.button(b.x + b.w - 58, b.y + b.h - 20, 50, 14, 'Back', close, { glove: false });
    return;
  }
  if (!view) { modal = null; return; }

  if (m.kind === 'players') {
    const b = modalBox(190, 30 + view.players.length * 13 + 24, 'First to ' + WIN_CROWNS + ' crowns');
    view.players.forEach((p, i) => {
      const y = b.iy + i * 13;
      flag(p.house, b.ix, y - 1);
      T(fit(p.name, 80), b.ix + 12, y, p.id === view.you ? C.gold : C.white);
      T(p.handCount + ' cards', b.ix + 132, y, C.soft, { align: 'right' });
      ui.icon('crown', b.ix + 140, y);
      T(String(p.totalCrowns !== undefined ? p.totalCrowns : p.crowns), b.ix + b.iw, y, C.white, { align: 'right' });
    });
    ui.button(b.x + b.w - 58, b.y + b.h - 20, 50, 14, 'OK', close, { glove: false });
    return;
  }

  if (m.kind === 'discard') {
    const need = view.discards[view.you], hand = myP().hand;
    const chosen = RES.reduce((n, r) => n + (m.cards[r] || 0), 0);
    const b = modalBox(200, 130, 'Drop ' + need + ' cards');
    RES.forEach((r, i) => {
      const y = b.iy + 2 + i * 16;
      ui.icon(r, b.ix, y + 1);
      T(RES_NAME[r], b.ix + 16, y + 3, C.white);
      T('have ' + hand[r], b.ix + 66, y + 3, C.soft);
      stepper(b.ix + 120, y, m.cards[r] || 0, Math.min(hand[r], (m.cards[r] || 0) + need - chosen), v => { m.cards[r] = v; }, 'dc' + r);
    });
    ui.button(b.x + b.w - 80, b.y + b.h - 22, 72, 16, 'Drop ' + chosen + '/' + need, () => net.act({ type: 'discard', cards: m.cards }), { kind: 'red', enabled: chosen === need, glove: false });
    return;
  }

  if (m.kind === 'steal') {
    const b = modalBox(190, 34 + view.stealTargets.length * 20 + 6, 'Rob someone');
    view.stealTargets.forEach((pid, i) => {
      const p = view.players[pid];
      ui.button(b.ix + 10, b.iy + i * 20, b.iw - 10, 16, '', () => net.act({ type: 'steal', target: pid }), {
        key: 'st' + pid, content: (bx, by) => { flag(p.house, bx + 4, by + 3); T(fit(p.name, 90) + ' (' + p.handCount + ')', bx + 16, by + 5); },
      });
    });
    return;
  }

  if (m.kind === 'workshop') {
    const land = L === LAND;
    const b = modalBox(land ? 300 : 194, land ? 196 : 260, 'Workshops');
    const spots = legalSpots(view, me());
    const rowH = land ? 36 : 50;
    Object.keys(WORKSHOPS).forEach((k, i) => {
      const w = WORKSHOPS[k], cost = workshopCost(view, me(), k);
      const fits = spots.workshops.some(v => workshopFits(k, v));
      const ok = fits && canPay(myP().hand, cost);
      const y = b.iy + i * (rowH + 2);
      ui.button(b.ix + 6, y, b.iw - 6, rowH, '', () => { wsKind = k; modal = null; setMode('workshop'); }, {
        enabled: ok, key: 'ws' + k,
        content: (bx, by) => {
          ui.icon(WORKSHOP_SPRITE[k], bx + 5, by + 5);
          T(w.name, bx + 22, by + 5, ok ? C.gold : '#8c96c8');
          costRow(cost, myP().hand, bx + b.iw - 14 - costWidth(cost), by + 4);
          const txt = !fits ? (k === 'hut' ? 'Needs a place on the river or coast.' : 'No free place for it.') : w.text;
          wrap(txt, b.iw - 34).slice(0, land ? 2 : 3).forEach((l, j) => T(l, bx + 22, by + 16 + j * LINE, ok ? C.white : '#8c96c8'));
        },
      });
    });
    ui.button(b.x + b.w - 58, b.y + b.h - 20, 50, 14, 'Close', close, { glove: false });
    return;
  }

  if (m.kind === 'cards') {
    const p = myP();
    const groups = {};
    p.cards.forEach(k => { (groups[k.kind] = groups[k.kind] || []).push(k); });
    const kinds = Object.keys(groups);
    const b = modalBox(L === LAND ? 280 : 194, 40 + kinds.length * 36 + 20, "King's cards");
    kinds.forEach((kind, i) => {
      const y = b.iy + i * 36;
      ui.icon(CARD_SPRITE[kind], b.ix, y + 1);
      T(CARD_INFO[kind].name + (groups[kind].length > 1 ? ' x' + groups[kind].length : ''), b.ix + 14, y + 2, C.gold);
      wrap(CARD_INFO[kind].text, b.iw - 64).slice(0, 2).forEach((l, j) => T(l, b.ix + 14, y + 13 + j * LINE, C.white));
      if (kind !== 'crown') {
        const ready = groups[kind].some(k => k.turn < view.turnCount);
        const okPhase = kind === 'builder' ? view.phase === 'main' : view.phase === 'main' || view.phase === 'roll';
        const can = mine() && okPhase && ready && !view.cardPlayed;
        ui.button(b.x + b.w - 52, y, 44, 14, 'Play', () => { modal = null; sfx('click'); net.act({ type: 'playCard', kind }); }, { kind: 'green', enabled: can, glove: false, key: 'pc' + kind });
        if (!ready) T('next turn', b.x + b.w - 30, y + 17, C.dim, { align: 'center' });
      } else T('secret', b.x + b.w - 30, y + 3, C.dim, { align: 'center' });
    });
    ui.button(b.x + b.w - 58, b.y + b.h - 20, 50, 14, 'Close', close, { glove: false });
    return;
  }

  if (m.kind === 'trade') {
    const hand = myP().hand, rate = bankRate(view, me());
    const b = modalBox(L === LAND ? 300 : 194, L === LAND ? 206 : 250, 'Trade');
    ui.button(b.x + b.w - 120, b.y + 5, 52, 13, 'Bank', () => { m.tab = 'bank'; }, { selected: m.tab === 'bank', glove: false });
    ui.button(b.x + b.w - 64, b.y + 5, 56, 13, 'Players', () => { m.tab = 'players'; }, { selected: m.tab === 'players', glove: false });
    const slot = Math.floor(b.iw / 5);
    if (m.tab === 'bank') {
      T('Give ' + rate + ' of:', b.ix, b.iy + 2, C.soft);
      RES.forEach((r, i) => {
        ui.button(b.ix + i * slot, b.iy + 14, slot - 3, 24, '', () => { m.bankGive = r; }, {
          enabled: hand[r] >= rate, selected: m.bankGive === r, glove: false, key: 'bg' + r,
          content: (bx, by) => {
            ui.icon(r, bx + Math.floor((slot - 3 - ui.iconSize(r)[0]) / 2), by + 4);
            T(String(hand[r]), bx + (slot - 3) / 2, by + 14, m.bankGive === r ? '#3a2408' : C.white, { align: 'center', shadow: m.bankGive === r ? null : '#101030' });
          },
        });
      });
      T('Get 1:', b.ix, b.iy + 46, C.soft);
      RES.forEach((r, i) => {
        ui.button(b.ix + i * slot, b.iy + 58, slot - 3, 20, '', () => { m.bankGet = r; }, {
          enabled: r !== m.bankGive, selected: m.bankGet === r, glove: false, key: 'bt' + r,
          content: (bx, by) => ui.icon(r, bx + Math.floor((slot - 3 - ui.iconSize(r)[0]) / 2), by + 6),
        });
      });
      const ok = m.bankGive && m.bankGet && m.bankGive !== m.bankGet && hand[m.bankGive] >= rate;
      ui.button(b.ix, b.iy + 88, b.iw, 18, 'Trade with the bank', () => { net.act({ type: 'bankTrade', give: m.bankGive, get: m.bankGet }); m.bankGive = null; m.bankGet = null; }, { kind: 'red', enabled: !!ok });
    } else {
      const colW = Math.floor(b.iw / 2);
      T('You give', b.ix, b.iy + 2, C.soft); T('You want', b.ix + colW, b.iy + 2, C.soft);
      RES.forEach((r, i) => {
        const y = b.iy + 14 + i * 17;
        ui.icon(r, b.ix, y + 1);
        stepper(b.ix + 16, y, m.give[r] || 0, hand[r], v => { m.give[r] = v; if (v) m.get[r] = 0; }, 'tg' + r);
        ui.icon(r, b.ix + colW, y + 1);
        stepper(b.ix + colW + 16, y, m.get[r] || 0, 9, v => { m.get[r] = v; if (v) m.give[r] = 0; }, 'tw' + r);
      });
      const ok = handSize(m.give) > 0 && handSize(m.get) > 0 && !view.offer;
      ui.button(b.ix, b.iy + 102, b.iw, 18, view.offer ? 'Offer already out' : 'Ask everyone', () => { net.act({ type: 'offer', give: m.give, get: m.get }); modal = null; }, { kind: 'red', enabled: ok });
    }
    ui.button(b.x + b.w - 58, b.y + b.h - 20, 50, 14, 'Close', close, { glove: false });
    return;
  }

  if (m.kind === 'over') {
    const w = view.players[view.winner];
    const list = view.players.slice().sort((a, b2) => b2.totalCrowns - a.totalCrowns);
    const b = modalBox(220, 52 + list.length * 14 + 26, 'Long live ' + fit(w.name, 120) + '!');
    T((w.id === view.you ? 'You are' : fit(w.name, 100) + ' is') + ' heir to the throne.', b.ix, b.iy, C.white);
    list.forEach((p, i) => {
      const y = b.iy + 16 + i * 14;
      if (p.id === view.winner) { c.fillStyle = '#6a5010'; c.fillRect(b.ix - 2, y - 2, b.iw + 4, 12); }
      flag(p.house, b.ix, y - 1);
      T(fit(p.name, 120), b.ix + 12, y, p.id === view.winner ? C.gold : C.white);
      ui.icon('crown', b.ix + b.iw - 22, y);
      T(String(p.totalCrowns), b.ix + b.iw, y, C.white, { align: 'right' });
    });
    const by = b.y + b.h - 22;
    ui.button(b.ix, by, 70, 15, 'Main menu', () => leaveTable(), { glove: false });
    if (net && (net.kind === 'local' || (lobby && lobby.isHost))) ui.button(b.x + b.w - 88, by, 80, 15, 'Play again', () => net.rematch(), { kind: 'green', glove: false });
    else T('The host can restart.', b.x + b.w - 8, by + 4, C.soft, { align: 'right' });
  }
}

function drawTip() {
  if (!tip || modal || screen !== 'game' || !view) return;
  const land = L === LAND;
  const w = land ? 300 : 194;
  const lines = wrap(TIPS[tip], w - 52);
  const h = Math.max(42, lines.length * LINE + 28);
  const x = land ? 4 : 3, y = L.H - h - 3;
  ui.window(x, y, w, h);
  ui.block(x, y, w, h);
  c.drawImage(spr('king', KING, KING_PAL), x + 7, y + 7, 28, 30);
  T('King Aldric', x + 42, y + 6, C.gold);
  lines.forEach((l, i) => T(l, x + 42, y + 17 + i * LINE, C.white));
  ui.button(x + w - 40, y + h - 18, 32, 13, 'OK', dismissTip, { glove: false, key: 'tipok' });
}

/* ---------- input ---------- */

function toCanvas(e) {
  const r = cv.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) * L.W / r.width), Math.floor((e.clientY - r.top) * L.H / r.height)];
}
cv.addEventListener('pointermove', e => { [ui.mx, ui.my] = toCanvas(e); });
cv.addEventListener('pointerleave', () => { ui.mx = ui.my = -1; ui.down = false; });
cv.addEventListener('pointerdown', e => { [ui.mx, ui.my] = toCanvas(e); ui.down = true; unlock(); });
cv.addEventListener('pointerup', e => {
  const [x, y] = toCanvas(e);
  ui.down = false;
  ui.click(x, y);
  if (e.pointerType !== 'mouse') setTimeout(() => { ui.mx = ui.my = -1; }, 250);
});
document.addEventListener('keydown', e => {
  if (screen === 'name' && nameEdit) {
    if (e.key === 'Backspace') { nameEdit.value = nameEdit.value.slice(0, -1); e.preventDefault(); }
    else if (e.key === 'Enter') saveName();
    else if (e.key.length === 1 && /[\p{L}\p{N} '-]/u.test(e.key) && nameEdit.value.length < 12) nameEdit.value += e.key;
    return;
  }
  if (screen === 'code') {
    if (e.key === 'Backspace') codeEdit = codeEdit.slice(0, -1);
    else if (e.key === 'Enter' && codeEdit.length === 4) { const code = codeEdit; codeEdit = ''; joinTable(code); }
    else if (/^[a-z]$/i.test(e.key) && codeEdit.length < 4) codeEdit += e.key.toUpperCase();
    return;
  }
  if (e.key === 'Escape') {
    if (modal && !['over', 'discard', 'steal'].includes(modal.kind)) modal = null;
    else if (mode) setMode(null);
  }
});

/* ---------- main loop ---------- */

let frame = 0, last = 0;
function loop(now) {
  requestAnimationFrame(loop);
  if (now - last < 33) return;
  last = now; frame += 2;
  ui.begin(frame);
  if (screen === 'title') drawTitle(frame);
  else if (screen === 'name') drawName();
  else if (screen === 'code') drawCode();
  else if (screen === 'friends') drawFriends(frame);
  else if (screen === 'lobby') drawLobby(frame);
  else if (screen === 'bots') drawBots(frame);
  else if (screen === 'game') drawGame(frame);
  drawModal();
  drawTip();
  cv.style.cursor = ui.pointerCursor() ? 'pointer' : 'default';
}
startAttract();
requestAnimationFrame(loop);

// read-only handle for automated browser tests
window.kingsfold = {
  get view() { return view; }, get screen() { return screen; }, get lobby() { return lobby; }, get modal() { return modal; },
  get tip() { return tip; }, get targets() { return targets; }, get layout() { return L; }, get notice() { return notice; },
  regions: () => ui.regions.map(r => ({ key: r.key, x: r.x, y: r.y, w: r.w, h: r.h, on: !!r.fn })),
  VPOS, EPOS, HPOS, VX, VY, VW, VH,
};
