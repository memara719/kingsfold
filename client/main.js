// Kingsfold in the browser: title, lobby and the table. Talks to the server, or runs a local game against bots.

import { GEO, CENTER, RES, RES_NAME, TERRAIN_RES } from '/shared/board.js';
import {
  COSTS, WORKSHOPS, HOUSES, HOUSE_IDS, NEWS, QUESTS, CARD_INFO, LIMITS, WIN_CROWNS,
  canPay, handSize, legalSpots, workshopFits, workshopCost, bankRate, roadCost, viewFor,
} from '/shared/game.js';
import { Host } from '/shared/host.js';
import { S, PAL, paint, make, icon, banner, dieFace, drawLogo, KING, KING_PAL, WORKSHOP_SPRITE, CARD_SPRITE } from './sprites.js';
import { BoardView, W, H, VPOS, EPOS, HPOS } from './board-view.js';
import { sfx, setMusic, setSound, audioState, unlock } from './audio.js';

const $ = id => document.getElementById(id);
const OFFLINE = !!window.KF_OFFLINE;   // single-file build without a server: bots only
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};
const TERRAIN_NAME = { forest: 'Forest', hills: 'Hills', pasture: 'Pasture', fields: 'Fields', mountains: 'Mountains' };

let conn = null;          // current connection: online or local
let view = null;          // what this player can see of the game
let room = null;          // lobby info
let deadlineAt = 0;
let lastSeq = 0, freshGame = true;
const ui = { mode: null, wsKind: null, targets: null, hover: null, modal: null, draft: null, chat: [], rolling: 0, tipKey: null };
const board = new BoardView($('board'));

/* ---------- static art ---------- */

document.querySelectorAll('canvas[data-sprite]').forEach(c => paint(c, S[c.dataset.sprite]));
paint($('tipKing'), KING, KING_PAL);
const drawLogos = () => { drawLogo($('logo')); document.querySelectorAll('[data-logo]').forEach(c => drawLogo(c)); };
if (document.fonts && document.fonts.load) document.fonts.load('32px "Jersey 10"').then(drawLogos, drawLogos); else drawLogos();
const bannerCache = {};
const houseBanner = h => { const c = bannerCache[h] || (bannerCache[h] = banner(HOUSES[h])); const copy = make([' ']); copy.width = c.width; copy.height = c.height; copy.getContext('2d').drawImage(c, 0, 0); return copy; };
paint($('die1'), dieFace(1)); paint($('die2'), dieFace(1));

function show(id) { for (const s of ['title', 'lobby', 'game']) $(s).hidden = s !== id; if (id === 'game') requestAnimationFrame(fitBoard); }

/* ---------- connections ---------- */

function connectOnline(first) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  let ws = null, closing = false, tries = 0;
  const c = {
    kind: 'online',
    send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    act(action) { c.send({ t: 'act', action }); },
    leave() { closing = true; if (ws) ws.close(); },
  };
  const open = msg => {
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { tries = 0; c.send(msg); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
      if (closing || conn !== c) return;
      const seat = store.get('kf_seat', null);
      if (!seat) return backToTitle('Lost the connection to the server.');
      tries++;
      if (tries === 1) toast('Connection lost. Reconnecting...');
      setTimeout(() => { if (conn === c) open({ t: 'join', code: seat.code, token: seat.token, name: myName() }); }, Math.min(8000, 500 * 2 ** tries));
    };
  };
  open(first);
  return c;
}

function onMessage(m) {
  switch (m.t) {
    case 'token':
      store.set('kf_seat', { code: m.code, token: m.token });
      if (location.pathname !== '/room/' + m.code) history.replaceState(null, '', '/room/' + m.code);
      break;
    case 'room':
      room = m;
      if (!m.started) { view = null; freshGame = true; closeModal(); show('lobby'); renderLobby(); }
      else if (view) renderPlayers();
      break;
    case 'state':
      view = m.view;
      deadlineAt = m.remaining > 0 ? Date.now() + m.remaining : 0;
      onView();
      break;
    case 'error':
      if (m.fatal) { store.del('kf_seat'); return backToTitle(m.msg); }
      if (!$('title').hidden) return titleError(m.msg);
      toast(m.msg); sfx('error');
      break;
    case 'chat':
      ui.chat.push(m); if (ui.chat.length > 30) ui.chat.shift();
      renderChat();
      if (m.seat !== room?.you) sfx('click');
      break;
  }
}

function startLocal(myHouse, bots) {
  const others = HOUSE_IDS.filter(h => h !== myHouse).sort(() => Math.random() - 0.5);
  const names = ['Sir Bramble', 'Lady Wren', 'Old Tom', 'Mistress Fen', 'Brother Ash'];
  const seats = [{ name: myName(), house: myHouse, bot: false }];
  for (let i = 0; i < bots; i++) seats.push({ name: names[i], house: others[i], bot: true });
  seats.sort(() => Math.random() - 0.5);
  const me = seats.findIndex(s => !s.bot);
  let host = null;
  const push = h => {
    view = viewFor(h.state, me);
    deadlineAt = 0;
    onView();
  };
  conn = {
    kind: 'local', me, settings: { myHouse, bots },
    act(action) { const err = host.act(me, action); if (err) { toast(err); sfx('error'); } },
    leave() { host.stop(); },
  };
  room = { you: me, seats: seats.map((s, i) => ({ seat: i, name: s.name, house: s.house, bot: s.bot, connected: true })) };
  freshGame = true; lastSeq = 0;
  host = new Host({ players: seats, seed: (Math.random() * 2 ** 31) | 0, timers: false, botDelay: 650, onChange: push });
  conn.host = host;
}

function backToTitle(msg) {
  if (conn) { const c = conn; conn = null; c.leave(); }
  view = null; room = null; ui.mode = null; closeModal(); hideTip();
  if (!OFFLINE) history.replaceState(null, '', '/');
  show('title');
  if (msg) titleError(msg);
}

/* ---------- title screen ---------- */

const myName = () => ($('nameInput').value.trim() || 'Traveler').slice(0, 16);
$('nameInput').value = store.get('kf_name', '');
$('nameInput').addEventListener('change', () => store.set('kf_name', $('nameInput').value.trim()));
function titleError(msg) { $('titleError').textContent = msg; $('titleError').hidden = !msg; }

$('createBtn').addEventListener('click', () => {
  unlock(); titleError('');
  store.set('kf_name', $('nameInput').value.trim());
  conn = connectOnline({ t: 'create', name: myName() });
});
function joinCode(code) {
  unlock(); titleError('');
  code = code.toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) return titleError('Room codes are 4 letters.');
  store.set('kf_name', $('nameInput').value.trim());
  const seat = store.get('kf_seat', null);
  conn = connectOnline({ t: 'join', code, name: myName(), token: seat && seat.code === code ? seat.token : undefined });
}
$('joinBtn').addEventListener('click', () => joinCode($('codeInput').value));
$('codeInput').addEventListener('keydown', e => { if (e.key === 'Enter') joinCode($('codeInput').value); });
$('botsBtn').addEventListener('click', () => { unlock(); store.set('kf_name', $('nameInput').value.trim()); openModal({ kind: 'bots', house: store.get('kf_house', 'lions'), bots: 3 }); });

if (OFFLINE) {
  $('createBtn').hidden = true;
  $('joinBtn').parentElement.hidden = true;
  const note = el('p', 'soft', 'This copy plays against bots. Online rooms with friends need the Kingsfold server.');
  $('botsBtn').after(note);
}

// arriving through an invite link
const linkCode = (location.pathname.match(/^\/room\/([A-Za-z]{4})$/) || [])[1];
if (linkCode) {
  $('codeInput').value = linkCode.toUpperCase();
  const seat = store.get('kf_seat', null);
  if (seat && seat.code === linkCode.toUpperCase()) joinCode(linkCode);
  else setTimeout(() => $('nameInput').focus(), 50);
}

/* ---------- lobby ---------- */

function renderLobby() {
  $('roomCode').textContent = room.code;
  $('shareLink').value = location.origin + '/room/' + room.code;
  const list = $('seats');
  list.replaceChildren();
  room.seats.forEach(s => {
    const li = el('li');
    li.appendChild(houseBanner(s.house));
    const who = el('div', 'who');
    who.appendChild(el('b', '', s.name + (s.seat === room.you ? ' (you)' : '')));
    who.appendChild(el('span', '', HOUSES[s.house].name + (s.bot ? ' · bot' : '') + (s.host ? ' · host' : '') + (!s.connected ? ' · away' : '')));
    li.appendChild(who);
    if (room.isHost && s.seat !== room.you) {
      const x = el('button', 'btn small white', 'REMOVE'); x.type = 'button';
      x.addEventListener('click', () => conn.send({ t: 'removeSeat', seat: s.seat }));
      li.appendChild(x);
    } else li.appendChild(el('span'));
    list.appendChild(li);
  });
  const mine = room.seats[room.you];
  const pick = $('housePick');
  pick.replaceChildren();
  HOUSE_IDS.forEach(h => {
    const taken = room.seats.some(s => s.seat !== room.you && s.house === h);
    const b = houseOption(h, mine && mine.house === h, taken);
    b.addEventListener('click', () => { store.set('kf_house', h); conn.send({ t: 'house', house: h }); sfx('click'); });
    pick.appendChild(b);
  });
  $('addBotBtn').hidden = !room.isHost;
  $('addBotBtn').disabled = room.seats.length >= 6;
  $('startBtn').hidden = !room.isHost;
  $('startBtn').disabled = room.seats.length < 2;
  $('waitHost').hidden = !!room.isHost;
}
function houseOption(h, pressed, taken) {
  const b = el('button', 'house-opt'); b.type = 'button';
  b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  b.disabled = taken;
  b.appendChild(houseBanner(h));
  b.appendChild(el('b', '', HOUSES[h].name.toUpperCase()));
  b.appendChild(el('span', '', taken ? 'Taken' : HOUSES[h].power));
  return b;
}
$('addBotBtn').addEventListener('click', () => conn.send({ t: 'addBot' }));
$('startBtn').addEventListener('click', () => { unlock(); conn.send({ t: 'start' }); });
$('leaveLobby').addEventListener('click', () => { store.del('kf_seat'); backToTitle(); });
$('copyBtn').addEventListener('click', () => {
  const link = $('shareLink').value;
  const done = () => { $('copyBtn').textContent = 'COPIED!'; setTimeout(() => { $('copyBtn').textContent = 'COPY LINK'; }, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => { $('shareLink').select(); });
  else $('shareLink').select();
});

/* ---------- game: one update ---------- */

const me = () => view.you;
const mine = () => view && view.turn === view.you && view.phase !== 'over';
const myP = () => view.players[view.you];
const pname = pid => (pid === view.you ? 'You' : view.players[pid].name);

function onView() {
  if ($('game').hidden) show('game');
  board.setBoard(view.hexes);
  processEvents();
  if (view.phase !== 'main' || !mine()) { ui.mode = null; }
  if (mine() && view.phase === 'main' && view.freeRoads > 0) ui.mode = 'road';
  updateTargets();
  renderTop(); renderPlayers(); renderQuests(); renderLog(); renderDock(); renderOffer(); renderForced();
  if (ui.modal) renderModal();
  maybeTip();
  $('chatForm').hidden = conn.kind !== 'online';
  $('emotes').hidden = conn.kind !== 'online';
}

function processEvents() {
  const evs = view.events.filter(e => e.seq > lastSeq);
  if (freshGame) { freshGame = false; lastSeq = view.eventSeq; return; }
  lastSeq = view.eventSeq;
  for (const e of evs) {
    switch (e.type) {
      case 'roll': {
        rollDice(e.dice);
        const sum = e.dice[0] + e.dice[1];
        setTimeout(() => {
          e.gains.forEach((g, k) => { for (let a = 0; a < g.amt; a++) board.float(g.hex, g.res, k * 60 + a * 120); });
          const mineGot = e.gains.filter(g => g.pid === view.you);
          if (mineGot.length) { sfx('coin'); bumpCards(mineGot.map(g => g.res)); }
          if (sum === 7) toast('SEVEN! THE BANDITS ARE OUT!', true);
        }, 550);
        break;
      }
      case 'build': sfx('build'); break;
      case 'steal':
        sfx('steal');
        if (e.to === view.you) toast('You stole 1 ' + RES_NAME[e.res] + ' from ' + view.players[e.from].name + '.');
        else if (e.from === view.you) toast(view.players[e.to].name + ' stole 1 ' + RES_NAME[e.res] + ' from you!');
        else toast(view.players[e.to].name + ' stole a card from ' + view.players[e.from].name + '.');
        break;
      case 'quest': sfx('quest'); toast(pname(e.pid) + ' finished ' + QUESTS[e.quest].name + '! +1 crown', true); break;
      case 'news': sfx('news'); $('newsBox').classList.remove('flash'); void $('newsBox').offsetWidth; $('newsBox').classList.add('flash'); toast('NEWS: ' + NEWS[e.news].name, true); break;
      case 'turn': if (e.pid === view.you) { sfx('turn'); toast('YOUR TURN!', true); } break;
      case 'title': toast(pname(e.pid) + (e.pid === view.you ? ' now have ' : ' now has ') + (e.title === 'longest' ? 'the longest road' : 'the most knights') + ': +2 crowns!'); sfx('quest'); break;
      case 'trade': sfx('coin'); toast(pname(e.to) + ' traded with ' + (e.from === view.you ? 'you' : view.players[e.from].name) + '.'); break;
      case 'bank': if (e.pid === view.you) sfx('coin'); break;
      case 'play': toast(pname(e.pid) + ' played ' + CARD_INFO[e.kind].name + '.'); break;
      case 'card': if (e.pid === view.you && e.kind) toast("King's card: " + CARD_INFO[e.kind].name + '! ' + CARD_INFO[e.kind].text); break;
      case 'win': sfx('win'); break;
    }
  }
}

function rollDice(d) {
  const box = $('die1').parentElement;
  box.classList.add('rolling');
  sfx('roll');
  let n = 0;
  clearInterval(ui.rolling);
  ui.rolling = setInterval(() => {
    paint($('die1'), dieFace(1 + Math.floor(Math.random() * 6)));
    paint($('die2'), dieFace(1 + Math.floor(Math.random() * 6)));
    if (++n >= 6) { clearInterval(ui.rolling); ui.rolling = 0; box.classList.remove('rolling'); paint($('die1'), dieFace(d[0])); paint($('die2'), dieFace(d[1])); }
  }, 80);
}

function bumpCards(list) {
  setTimeout(() => list.forEach(r => { const c = document.querySelector(`.res-card[data-res="${r}"]`); if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }), 50);
}

/* ---------- board targets ---------- */

function updateTargets() {
  ui.targets = null;
  if (!view || !mine()) return finishTargets();
  const spots = legalSpots(view, me());
  if (view.phase === 'setupVillage') ui.targets = { kind: 'vertex', ids: spots.villages, act: v => ({ type: 'placeVillage', v }) };
  else if (view.phase === 'setupRoad') ui.targets = { kind: 'edge', ids: spots.roads, act: e => ({ type: 'placeRoad', e }) };
  else if (view.phase === 'robber') ui.targets = { kind: 'hex', ids: GEO.hexes.map(h => h.id).filter(h => h !== view.bandit), act: hex => ({ type: 'moveBandit', hex }) };
  else if (view.phase === 'main' && ui.mode) {
    if (ui.mode === 'road') ui.targets = { kind: 'edge', ids: spots.roads, act: e => ({ type: 'build', what: 'road', e }) };
    if (ui.mode === 'village') ui.targets = { kind: 'vertex', ids: spots.villages, act: v => ({ type: 'build', what: 'village', v }) };
    if (ui.mode === 'town') ui.targets = { kind: 'vertex', ids: spots.towns, act: v => ({ type: 'build', what: 'town', v }) };
    if (ui.mode === 'workshop') ui.targets = { kind: 'vertex', ids: spots.workshops.filter(v => workshopFits(ui.wsKind, v)), act: v => ({ type: 'build', what: 'workshop', v, kind: ui.wsKind }) };
  }
  finishTargets();
}
function finishTargets() {
  $('board').classList.toggle('aim', !!ui.targets);
  const bar = $('modeBar');
  if (ui.mode && ui.targets) {
    const what = ui.mode === 'workshop' ? WORKSHOPS[ui.wsKind].name : { road: 'road', village: 'village', town: 'town' }[ui.mode];
    let text = ui.targets.ids.length ? 'Tap a glowing spot to build a ' + what + '.' : 'There is no spot for a ' + what + ' right now.';
    if (ui.mode === 'road' && view.freeRoads > 0) text = 'Builders! Place ' + view.freeRoads + ' free road' + (view.freeRoads > 1 ? 's' : '') + '.';
    $('modeText').textContent = text;
    $('modeCancel').hidden = ui.mode === 'road' && view.freeRoads > 0;
    bar.hidden = false;
  } else bar.hidden = true;
}
$('modeCancel').addEventListener('click', () => { ui.mode = null; updateTargets(); renderDock(); });

function boardPoint(e) {
  const r = $('board').getBoundingClientRect();
  return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
}
function targetAt(x, y) {
  const t = ui.targets;
  if (!t) return null;
  if (t.kind === 'vertex') return board.vertexAt(x, y, t.ids);
  if (t.kind === 'edge') return board.edgeAt(x, y, t.ids);
  const h = board.hexAt(x, y);
  return t.ids.includes(h) ? h : null;
}
$('board').addEventListener('pointermove', e => { const [x, y] = boardPoint(e); ui.hover = targetAt(x, y); });
$('board').addEventListener('pointerleave', () => { ui.hover = null; });
$('board').addEventListener('click', e => {
  unlock();
  const [x, y] = boardPoint(e);
  if (ui.targets) {
    const id = targetAt(x, y);
    if (id === null) return;
    sfx('click');
    const action = ui.targets.act(id);
    if (ui.mode && !(ui.mode === 'road' && view.freeRoads > 1)) ui.mode = null;
    ui.hover = null;
    conn.act(action);
    return;
  }
  const h = board.hexAt(x, y);
  if (h >= 0) landInfo(h);
});

function landInfo(h) {
  const hx = view.hexes[h];
  if (h === CENTER) return toast(view.bandit === CENTER ? 'The castle. The bandits are hiding in the slum by its west wall.' : 'The castle of King Aldric. It pays nothing, but roads that touch it count for the Royal Road quest.');
  const owners = [];
  GEO.hexes[h].vertices.forEach(v => { const b = view.buildings[v]; if (b) owners.push(pname(b.owner) + (b.kind === 'town' ? ' (town)' : '')); });
  let text = TERRAIN_NAME[hx.terrain] + ' on ' + hx.number + ': pays ' + RES_NAME[TERRAIN_RES[hx.terrain]];
  text += owners.length ? ' to ' + owners.join(', ') + '.' : '. Nobody lives here yet.';
  if (view.bandit === h) text += ' The bandits are here, so it pays nothing.';
  toast(text);
}

/* ---------- top bar ---------- */

function phaseText() {
  const p = view.players[view.turn], n = p.name, my = mine();
  switch (view.phase) {
    case 'setupVillage': return my ? ['Place a village', 'Tap a glowing spot on the map.'] : [n + ' is settling', 'Picking a spot for a village...'];
    case 'setupRoad': return my ? ['Place a road', 'It must touch your new village.'] : [n + ' is settling', 'Placing a road...'];
    case 'roll': return my ? ['Your turn!', 'Roll the dice.'] : [n + "'s turn", 'About to roll...'];
    case 'main': return my ? ['Your turn!', 'Build, trade, or end your turn.'] : [n + "'s turn", 'Building and trading...'];
    case 'discard': return view.discards[view.you] ? ['Too many cards!', 'Drop ' + view.discards[view.you] + ' of them.'] : ['Bandits!', 'Waiting for players to drop cards...'];
    case 'robber': return my ? ['Move the bandits', 'Tap a land to send them there.'] : [n + ' has the bandits', 'Choosing where they go...'];
    case 'steal': return my ? ['Rob someone', 'Pick who to steal from.'] : [n + ' is stealing', '...'];
    case 'over': return ['Long live ' + view.players[view.winner].name + '!', 'The game is over.'];
  }
  return ['', ''];
}

function renderTop() {
  const [a, b] = phaseText();
  $('turnText').textContent = a;
  $('turnHint').textContent = b;
  $('turnBox').classList.toggle('mine', mine());
  $('turnDot').style.background = HOUSES[view.players[view.turn].house].color;
  const n = NEWS[view.news] || { name: '', text: '' };
  $('newsBox').hidden = !view.news;
  $('newsName').textContent = n.name;
  $('newsText').textContent = n.text;
}

function tickTimer() {
  const box = $('timerBox');
  if (!view || !deadlineAt || view.phase === 'over') { box.hidden = true; return; }
  const secs = Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000));
  box.hidden = false;
  if ($('timerText').textContent !== String(secs)) $('timerText').textContent = secs;
  box.classList.toggle('low', secs <= 10 && pendingMe());
}
const pendingMe = () => view && (view.phase === 'discard' ? !!view.discards[view.you] : view.turn === view.you);

/* ---------- side panels ---------- */

function renderPlayers() {
  const list = $('players');
  list.replaceChildren();
  view.players.forEach(p => {
    const li = el('li', p.id === view.turn && view.phase !== 'over' ? 'now' : '');
    const bn = houseBanner(p.house); bn.classList.add('banner'); li.appendChild(bn);
    const nm = el('div', 'pname');
    const title = el('b', '', p.name);
    if (p.id === view.you) title.appendChild(el('span', 'tag', 'YOU'));
    if (p.bot) title.appendChild(el('span', 'tag', 'BOT'));
    nm.appendChild(title);
    const st = el('div', 'stats');
    const stat = (sprite, n, label) => { const s = el('span'); s.title = label; s.appendChild(icon(sprite)); s.appendChild(document.createTextNode(n)); st.appendChild(s); };
    stat('card', p.handCount, 'Cards in hand');
    stat('scroll', p.cardCount, "King's cards");
    stat('knight', p.knights, 'Knights played');
    stat('longroad', p.roadLength, 'Longest road');
    if (view.longest === p.id) st.appendChild(el('span', 'tag', 'ROAD +2'));
    if (view.army === p.id) st.appendChild(el('span', 'tag', 'KNIGHTS +2'));
    const seat = room && room.seats && room.seats[p.id];
    if (seat && !seat.bot && seat.connected === false) st.appendChild(el('span', 'away', 'away'));
    nm.appendChild(st);
    li.appendChild(nm);
    const cr = el('div', 'crowns');
    cr.appendChild(icon('crown'));
    let n = String(p.totalCrowns !== undefined ? p.totalCrowns : p.crowns);
    if (p.id === view.you && p.totalCrowns === undefined) { const hidden = p.cards.filter(c => c.kind === 'crown').length; if (hidden) n += '+' + hidden; }
    cr.appendChild(document.createTextNode(n));
    cr.title = 'Crowns (' + WIN_CROWNS + ' to win)';
    li.appendChild(cr);
    list.appendChild(li);
  });
}

function renderQuests() {
  const box = $('quests');
  box.replaceChildren();
  view.quests.forEach(inst => {
    const q = QUESTS[inst.id];
    const d = el('div', 'quest');
    d.appendChild(el('b', '', q.name));
    d.appendChild(el('span', '', q.text));
    const row = el('div', 'row');
    const reward = el('span', 'prog'); reward.appendChild(icon('crown')); reward.lastChild.style.width = '14px'; reward.appendChild(document.createTextNode(' +1 crown'));
    row.appendChild(reward);
    if (q.pay) {
      const b = el('button', 'btn small', 'PAY'); b.type = 'button';
      b.disabled = !(mine() && view.phase === 'main' && canPay(myP().hand, q.pay));
      b.addEventListener('click', () => conn.act({ type: 'payQuest', quest: inst.id }));
      row.appendChild(b);
    } else {
      const have = Math.max(0, q.metric(view, me()) - inst.base[me()]);
      row.appendChild(el('span', 'prog', 'You: ' + Math.min(have, q.target) + '/' + q.target));
    }
    d.appendChild(row);
    box.appendChild(d);
  });
}

function renderLog() {
  const list = $('log');
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
  list.replaceChildren(...view.log.slice(-40).map(t => el('li', '', t)));
  if (atBottom) list.scrollTop = list.scrollHeight;
}
function renderChat() {
  let list = $('chatLog');
  if (!list) { list = el('ol', 'log'); list.id = 'chatLog'; $('chatForm').before(list); }
  list.replaceChildren(...ui.chat.map(m => { const li = el('li', 'chat'); const b = el('b', '', m.name + ': '); b.style.color = HOUSES[m.house].shade; li.append(b, m.text); return li; }));
  list.scrollTop = list.scrollHeight;
}
$('chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const text = $('chatInput').value.trim();
  if (text && conn && conn.kind === 'online') conn.send({ t: 'chat', text });
  $('chatInput').value = '';
});
['Nice!', 'Trade?', 'Hmm...', 'Ouch!', 'Good game!'].forEach(t => {
  const b = el('button', 'btn small white', t); b.type = 'button';
  b.addEventListener('click', () => conn && conn.kind === 'online' && conn.send({ t: 'chat', text: t }));
  $('emotes').appendChild(b);
});

/* ---------- the dock ---------- */

function costIcons(cost, hand) {
  const box = el('span', 'cost');
  const have = { ...hand };
  RES.forEach(r => {
    for (let i = 0; i < (cost[r] || 0); i++) {
      const c = icon(r);
      if (have[r] > 0) have[r]--; else c.classList.add('miss');
      box.appendChild(c);
    }
  });
  if (!handSize(cost)) box.appendChild(el('span', 'free', 'FREE'));
  return box;
}

function actionButton(label, cost, enabled, why, onClick, extraCls) {
  const b = el('button', 'btn act' + (extraCls ? ' ' + extraCls : '')); b.type = 'button';
  b.appendChild(el('span', 'lbl', label));
  if (cost) b.appendChild(cost);
  b.disabled = !enabled;
  if (why) b.title = why;
  b.addEventListener('click', () => { unlock(); sfx('click'); onClick(); });
  return b;
}

function renderDock() {
  const p = myP(), hand = p.hand, myTurn = mine(), main = myTurn && view.phase === 'main';
  // dice
  if (!ui.rolling) {
    paint($('die1'), dieFace(view.dice ? view.dice[0] : 1));
    paint($('die2'), dieFace(view.dice ? view.dice[1] : 1));
    $('die1').style.opacity = $('die2').style.opacity = view.dice ? 1 : 0.5;
  }
  $('rollBtn').disabled = !(myTurn && view.phase === 'roll');

  // hand: cards become buttons while you have free picks
  const handBox = $('hand');
  handBox.replaceChildren();
  $('pickNote').hidden = !(p.picks > 0);
  RES.forEach(r => {
    const card = el(p.picks > 0 ? 'button' : 'div', 'res-card' + (hand[r] ? '' : ' zero'));
    card.dataset.res = r;
    card.appendChild(icon(r));
    card.appendChild(el('b', '', String(hand[r])));
    card.appendChild(el('span', '', RES_NAME[r]));
    if (p.picks > 0) { card.type = 'button'; card.className = 'res-card'; card.addEventListener('click', () => { sfx('coin'); conn.act({ type: 'pick', res: r }); }); }
    handBox.appendChild(card);
  });

  // king's cards
  const kc = $('kcards');
  kc.replaceChildren();
  const groups = {};
  p.cards.forEach(c => { (groups[c.kind] = groups[c.kind] || []).push(c); });
  Object.keys(groups).forEach(kind => {
    const chip = el('div', 'kcard');
    chip.title = CARD_INFO[kind].text;
    chip.appendChild(icon(CARD_SPRITE[kind]));
    chip.appendChild(el('b', '', CARD_INFO[kind].name + (groups[kind].length > 1 ? ' x' + groups[kind].length : '')));
    if (kind === 'crown') chip.appendChild(el('span', 'soft', '+1 crown, secret'));
    else {
      const ready = groups[kind].some(c => c.turn < view.turnCount);
      const okPhase = kind === 'builder' ? view.phase === 'main' : (view.phase === 'main' || view.phase === 'roll');
      const b = el('button', 'btn small', 'PLAY'); b.type = 'button';
      b.disabled = !(myTurn && okPhase && ready && !view.cardPlayed);
      b.title = !ready ? 'New cards can be played from your next turn.' : view.cardPlayed ? 'One card per turn.' : CARD_INFO[kind].text;
      b.addEventListener('click', () => { sfx('click'); conn.act({ type: 'playCard', kind }); });
      chip.appendChild(b);
    }
    kc.appendChild(chip);
  });

  // actions
  const spots = legalSpots(view, me());
  const box = $('actions');
  box.replaceChildren();
  const rc = view.freeRoads > 0 ? {} : roadCost(view);
  const build = (mode, label, cost, legal, limit) => {
    const can = main && canPay(hand, cost) && legal && limit;
    const why = !myTurn ? 'Wait for your turn.' : view.phase !== 'main' ? 'Roll first.' : !canPay(hand, cost) ? 'Not enough cards: faded icons are missing.' : !legal ? 'No spot for it right now.' : !limit ? 'You have none left.' : '';
    const b = actionButton(label, costIcons(cost, hand), can, why, () => { ui.mode = ui.mode === mode ? null : mode; updateTargets(); renderDock(); }, ui.mode === mode ? 'on' : '');
    box.appendChild(b);
  };
  build('road', 'ROAD', rc, spots.roads.length > 0, p.roads < LIMITS.road);
  build('village', 'VILLAGE', COSTS.village, spots.villages.length > 0, p.villages < LIMITS.village);
  build('town', 'TOWN', COSTS.town, spots.towns.length > 0, p.towns < LIMITS.town);
  const wsIcons = el('span', 'cost');
  Object.keys(WORKSHOPS).forEach(k => wsIcons.appendChild(icon(WORKSHOP_SPRITE[k])));
  box.appendChild(actionButton('WORKSHOP', wsIcons, main && spots.workshops.length > 0, spots.workshops.length ? '' : 'Build a village first.', () => openModal({ kind: 'workshop' }), ui.mode === 'workshop' ? 'on' : ''));
  box.appendChild(actionButton("KING'S CARD", costIcons(COSTS.card, hand), main && canPay(hand, COSTS.card) && view.deck > 0, 'A surprise: Knight, Builders, Harvest or a secret crown.', () => conn.act({ type: 'buyCard' })));
  const tr = el('span', 'cost'); tr.appendChild(icon('trade'));
  box.appendChild(actionButton('TRADE', tr, main && handSize(hand) > 0, 'Trade with players or the bank.', () => openModal({ kind: 'trade', give: {}, get: {}, bankGive: null, bankGet: null })));
  if (main && view.undo > 0) box.appendChild(actionButton('UNDO', null, true, 'Take back your last build.', () => conn.act({ type: 'undo' })));
  box.appendChild(actionButton('END TURN', null, main && !(view.freeRoads > 0 && spots.roads.length), '', () => { ui.mode = null; conn.act({ type: 'endTurn' }); }, 'end red'));
}
$('rollBtn').addEventListener('click', () => { unlock(); conn.act({ type: 'roll' }); });

/* ---------- trade offers on the board ---------- */

function dealIcons(c) {
  const s = el('span', 'deal');
  RES.forEach(r => { for (let i = 0; i < (c[r] || 0); i++) s.appendChild(icon(r)); });
  return s;
}
function renderOffer() {
  const bar = $('offerBar'), o = view.offer;
  if (!o) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.replaceChildren();
  const text = el('span', 'deal');
  const btns = el('div', 'btns');
  if (o.from === view.you) {
    text.append('You offer ', dealIcons(o.give), ' for ', dealIcons(o.get), o.declined.length ? '. No thanks from ' + o.declined.map(i => view.players[i].name).join(', ') + '.' : '. Waiting...');
    const c = el('button', 'btn small white', 'CANCEL'); c.type = 'button';
    c.addEventListener('click', () => conn.act({ type: 'cancelOffer' }));
    btns.appendChild(c);
  } else {
    text.append(view.players[o.from].name + ' gives ', dealIcons(o.give), ' for your ', dealIcons(o.get));
    if (o.declined.includes(view.you)) btns.appendChild(el('span', 'soft', 'You said no.'));
    else {
      const a = el('button', 'btn small green', 'ACCEPT'); a.type = 'button';
      a.disabled = !canPay(myP().hand, o.get);
      if (a.disabled) a.title = "You don't have those cards.";
      a.addEventListener('click', () => conn.act({ type: 'acceptOffer', id: o.id }));
      const n = el('button', 'btn small white', 'NO THANKS'); n.type = 'button';
      n.addEventListener('click', () => conn.act({ type: 'declineOffer', id: o.id }));
      btns.append(a, n);
    }
  }
  bar.append(text, btns);
}

/* ---------- modals ---------- */

function openModal(m) { ui.modal = m; renderModal(); }
function closeModal() { ui.modal = null; $('modal').hidden = true; }
$('modal').addEventListener('click', e => { if (e.target === $('modal') && ui.modal && !ui.modal.forced) closeModal(); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (ui.modal && !ui.modal.forced) closeModal();
  else if (ui.mode) { ui.mode = null; updateTargets(); renderDock(); }
});

function renderForced() {
  const p = myP();
  if (view.phase === 'over') { if (!ui.modal || ui.modal.kind !== 'over') openModal({ kind: 'over', forced: true }); return; }
  if (view.phase === 'discard' && view.discards[view.you]) {
    if (!ui.modal || ui.modal.kind !== 'discard') openModal({ kind: 'discard', forced: true, cards: {} });
    return;
  }
  if (view.phase === 'steal' && mine()) { if (!ui.modal || ui.modal.kind !== 'steal') openModal({ kind: 'steal', forced: true }); return; }
  if (ui.modal && ui.modal.forced) closeModal();
  if (ui.modal && (ui.modal.kind === 'trade' || ui.modal.kind === 'workshop') && !(mine() && view.phase === 'main')) closeModal();
  void p;
}

function stepper(r, value, max, onChange, haveText) {
  const row = el('div', 'stepper');
  row.appendChild(icon(r));
  row.appendChild(el('span', '', RES_NAME[r]));
  const minus = el('button', 'btn small white', '−'); minus.type = 'button';
  const n = el('span', 'n', String(value));
  const plus = el('button', 'btn small white', '+'); plus.type = 'button';
  minus.disabled = value <= 0; plus.disabled = value >= max;
  minus.addEventListener('click', () => onChange(value - 1));
  plus.addEventListener('click', () => onChange(value + 1));
  const ctl = el('span'); ctl.style.display = 'flex'; ctl.style.gap = '6px'; ctl.style.alignItems = 'center';
  ctl.append(minus, n, plus);
  row.appendChild(ctl);
  row.appendChild(el('span', 'have', haveText || ''));
  return row;
}

function renderModal() {
  const m = ui.modal;
  if (!m) return;
  const body = $('modalBody');
  body.replaceChildren();
  $('modal').hidden = false;
  const title = t => { $('modalTitle').textContent = t; };
  const actions = el('div', 'modal-actions');

  if (m.kind === 'bots') {
    title('PLAY VS BOTS');
    body.appendChild(el('p', '', 'Pick your house and how many bots to play against.'));
    const pick = el('div', 'house-pick');
    HOUSE_IDS.forEach(h => { const b = houseOption(h, m.house === h, false); b.addEventListener('click', () => { m.house = h; store.set('kf_house', h); renderModal(); }); pick.appendChild(b); });
    body.appendChild(pick);
    const row = el('div', 'stepper');
    row.style.gridTemplateColumns = '1fr auto';
    const lbl = el('span', '', 'Bots: ' + m.bots);
    const ctl = el('span'); ctl.style.display = 'flex'; ctl.style.gap = '6px';
    const minus = el('button', 'btn small white', '−'); minus.type = 'button'; minus.disabled = m.bots <= 1;
    const plus = el('button', 'btn small white', '+'); plus.type = 'button'; plus.disabled = m.bots >= 5;
    minus.addEventListener('click', () => { m.bots--; renderModal(); });
    plus.addEventListener('click', () => { m.bots++; renderModal(); });
    ctl.append(minus, plus); row.append(lbl, ctl);
    body.appendChild(row);
    const cancel = el('button', 'btn white', 'BACK'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    const go = el('button', 'btn big green', 'START'); go.type = 'button';
    go.addEventListener('click', () => { closeModal(); startLocal(m.house, m.bots); });
    actions.append(cancel, go);
  }

  if (m.kind === 'discard') {
    const need = view.discards[view.you], hand = myP().hand;
    const chosen = RES.reduce((n, r) => n + (m.cards[r] || 0), 0);
    title('DROP ' + need + ' CARDS');
    body.appendChild(el('p', '', 'A 7 was rolled while you held more than 7 cards. Pick ' + need + ' to drop.'));
    const rows = el('div', 'rows');
    RES.forEach(r => rows.appendChild(stepper(r, m.cards[r] || 0, Math.min(hand[r], (m.cards[r] || 0) + need - chosen), v => { m.cards[r] = v; renderModal(); }, 'have ' + hand[r])));
    body.appendChild(rows);
    const go = el('button', 'btn big red', 'DROP ' + chosen + '/' + need); go.type = 'button';
    go.disabled = chosen !== need;
    go.addEventListener('click', () => conn.act({ type: 'discard', cards: m.cards }));
    actions.appendChild(go);
  }

  if (m.kind === 'steal') {
    title('ROB SOMEONE');
    body.appendChild(el('p', '', 'More than one player lives next to the bandits. Who do you rob?'));
    const rows = el('div', 'rows');
    view.stealTargets.forEach(t => {
      const p = view.players[t];
      const b = el('button', 'btn white'); b.type = 'button'; b.style.justifyContent = 'flex-start';
      const bn = houseBanner(p.house); bn.style.width = '22px';
      b.append(bn, p.name + ' (' + p.handCount + ' cards)');
      b.addEventListener('click', () => conn.act({ type: 'steal', target: t }));
      rows.appendChild(b);
    });
    body.appendChild(rows);
  }

  if (m.kind === 'workshop') {
    title('WORKSHOPS');
    body.appendChild(el('p', '', 'One workshop per village or town. Pick one, then tap where it goes.'));
    const grid = el('div', 'wshops');
    const spots = legalSpots(view, me());
    Object.keys(WORKSHOPS).forEach(k => {
      const w = WORKSHOPS[k], cost = workshopCost(view, me(), k);
      const fits = spots.workshops.some(v => workshopFits(k, v));
      const b = el('button', 'wshop'); b.type = 'button';
      const ic = icon(WORKSHOP_SPRITE[k]); ic.classList.add('ic');
      const head = el('div', 'row'); head.style.display = 'flex'; head.style.gap = '8px'; head.style.alignItems = 'center';
      head.append(ic, el('b', '', w.name));
      b.append(head, costIcons(cost, myP().hand), el('span', '', w.text));
      if (!fits) b.appendChild(el('span', 'soft', k === 'hut' ? 'Needs a place on the river or coast.' : 'No free place for it.'));
      b.disabled = !fits || !canPay(myP().hand, cost);
      b.addEventListener('click', () => { ui.mode = 'workshop'; ui.wsKind = k; closeModal(); updateTargets(); renderDock(); });
      grid.appendChild(b);
    });
    body.appendChild(grid);
    const cancel = el('button', 'btn white', 'CLOSE'); cancel.type = 'button'; cancel.addEventListener('click', closeModal);
    actions.appendChild(cancel);
  }

  if (m.kind === 'trade') {
    title('TRADE');
    const hand = myP().hand, rate = bankRate(view, me());
    body.appendChild(el('h3', '', 'WITH THE BANK: ' + rate + ' FOR 1'));
    const giveRow = el('div', 'picker');
    RES.forEach(r => {
      const b = el('button'); b.type = 'button';
      b.append(icon(r), rate + ' ' + RES_NAME[r]);
      b.disabled = hand[r] < rate;
      b.setAttribute('aria-pressed', m.bankGive === r ? 'true' : 'false');
      b.addEventListener('click', () => { m.bankGive = r; renderModal(); });
      giveRow.appendChild(b);
    });
    const getRow = el('div', 'picker');
    RES.forEach(r => {
      const b = el('button'); b.type = 'button';
      b.append(icon(r), '1 ' + RES_NAME[r]);
      b.disabled = r === m.bankGive;
      b.setAttribute('aria-pressed', m.bankGet === r ? 'true' : 'false');
      b.addEventListener('click', () => { m.bankGet = r; renderModal(); });
      getRow.appendChild(b);
    });
    const bankGo = el('button', 'btn', 'TRADE WITH BANK'); bankGo.type = 'button';
    bankGo.disabled = !(m.bankGive && m.bankGet && m.bankGive !== m.bankGet && hand[m.bankGive] >= rate);
    bankGo.addEventListener('click', () => { conn.act({ type: 'bankTrade', give: m.bankGive, get: m.bankGet }); m.bankGive = null; m.bankGet = null; });
    body.append(el('span', 'soft', 'Give:'), giveRow, el('span', 'soft', 'Get:'), getRow);
    const bankRow = el('div', 'modal-actions'); bankRow.appendChild(bankGo); body.appendChild(bankRow);

    body.appendChild(el('h3', '', 'WITH PLAYERS'));
    const rows = el('div', 'rows');
    rows.appendChild(el('span', 'soft', 'You give:'));
    RES.forEach(r => rows.appendChild(stepper(r, m.give[r] || 0, hand[r], v => { m.give[r] = v; if (v) m.get[r] = 0; renderModal(); }, 'have ' + hand[r])));
    rows.appendChild(el('span', 'soft', 'You want:'));
    RES.forEach(r => rows.appendChild(stepper(r, m.get[r] || 0, 9, v => { m.get[r] = v; if (v) m.give[r] = 0; renderModal(); })));
    body.appendChild(rows);
    const ask = el('button', 'btn red', 'ASK EVERYONE'); ask.type = 'button';
    ask.disabled = !(handSize(m.give) > 0 && handSize(m.get) > 0) || !!view.offer;
    if (view.offer) ask.title = 'You already have an offer out.';
    ask.addEventListener('click', () => { conn.act({ type: 'offer', give: m.give, get: m.get }); closeModal(); });
    const close = el('button', 'btn white', 'CLOSE'); close.type = 'button'; close.addEventListener('click', closeModal);
    actions.append(close, ask);
  }

  if (m.kind === 'over') {
    const w = view.players[view.winner];
    title('LONG LIVE ' + w.name.toUpperCase() + '!');
    body.appendChild(el('p', '', (w.id === view.you ? 'You are' : w.name + ' is') + ' named heir to the throne of Kingsfold.'));
    const list = el('ol', 'final');
    view.players.slice().sort((a, b) => b.totalCrowns - a.totalCrowns).forEach(p => {
      const li = el('li', p.id === view.winner ? 'win' : '');
      li.append(houseBanner(p.house), el('b', '', p.name));
      const c = el('span', 'crowns'); c.style.display = 'flex'; c.style.gap = '4px'; c.style.alignItems = 'center';
      const ci = icon('crown'); ci.style.width = '18px'; c.append(ci, String(p.totalCrowns));
      li.appendChild(c);
      list.appendChild(li);
    });
    body.appendChild(list);
    const menu = el('button', 'btn white', 'MAIN MENU'); menu.type = 'button';
    menu.addEventListener('click', () => { store.del('kf_seat'); backToTitle(); });
    actions.appendChild(menu);
    if (conn.kind === 'local') {
      const again = el('button', 'btn big green', 'PLAY AGAIN'); again.type = 'button';
      again.addEventListener('click', () => { closeModal(); const s = conn.settings; conn.leave(); startLocal(s.myHouse, s.bots); });
      actions.appendChild(again);
    } else if (room && room.isHost) {
      const again = el('button', 'btn big green', 'PLAY AGAIN'); again.type = 'button';
      again.addEventListener('click', () => conn.send({ t: 'rematch' }));
      actions.appendChild(again);
    } else actions.appendChild(el('span', 'soft', 'The host can start a new game.'));
  }

  if (m.kind === 'menu') {
    title('MENU');
    const ol = el('ul', 'rules');
    ['On your turn: roll, trade, then build. Tap END TURN when done.',
      'Villages are worth 1 crown, towns 2. First to ' + WIN_CROWNS + ' crowns wins.',
      'Longest road (5+) and most knights (3+) are worth 2 crowns each.',
      'Roll a 7 and the bandits come out. Anyone with more than 7 cards drops half.',
      'Quests on the board are worth 1 crown. The King\'s news changes each round.',
      'Tap any land to see what it pays and who lives there.'].forEach(t => ol.appendChild(el('li', '', t)));
    body.appendChild(ol);
    const list = el('div', 'menu-list');
    const tips = el('button', 'btn white', store.get('kf_tips', true) ? 'KING\'S TIPS: ON' : 'KING\'S TIPS: OFF'); tips.type = 'button';
    tips.addEventListener('click', () => { const on = !store.get('kf_tips', true); store.set('kf_tips', on); if (on) store.set('kf_seen', []); renderModal(); });
    const leave = el('button', 'btn red', 'LEAVE GAME'); leave.type = 'button';
    leave.addEventListener('click', () => { store.del('kf_seat'); backToTitle(); });
    const back = el('button', 'btn big', 'BACK TO GAME'); back.type = 'button'; back.addEventListener('click', closeModal);
    list.append(back, tips, leave);
    if (conn && conn.kind === 'online' && room) list.appendChild(el('p', 'soft', 'Room code: ' + room.code + '. Friends who drop out can rejoin with the same link.'));
    body.appendChild(list);
  }

  if (actions.childNodes.length) body.appendChild(actions);
}
$('menuBtn').addEventListener('click', () => openModal({ kind: 'menu' }));

/* ---------- the King's tips ---------- */

const TIPS = {
  setupVillage: 'Pick a glowing spot for your village. Spots touching big numbers like 6 and 8 pay out more often.',
  setupRoad: 'Now put a road next to it. Roads lead the way to new village spots.',
  roll: 'Your turn! Tap ROLL. Every land showing that number pays the villages next to it.',
  main: "Now spend your cards. Every button shows its price, and faded icons are cards you're missing. Tap END TURN when you're done.",
  trade: 'Short on something? Tap TRADE to ask the others, or swap 4 of one card with the bank.',
  robber: 'Tap a land to send the bandits there. It stops paying, and you steal a card from someone who lives there.',
  discard: 'You held more than 7 cards when a 7 was rolled. Pick which half to drop.',
  picks: 'You have a free card! Tap the card you want in your hand.',
  offer: 'Someone wants to trade with you. Tap ACCEPT if it looks like a good deal.',
  quest: 'Quests on the board are worth a crown each. Some only need cards paid to the castle.',
};
function maybeTip() {
  if (!store.get('kf_tips', true) || !view || view.phase === 'over') { if (ui.tipKey) hideTip(); return; }
  const seen = store.get('kf_seen', []);
  const p = myP();
  let key = null;
  if (p.picks > 0) key = 'picks';
  else if (view.phase === 'discard' && view.discards[view.you]) key = 'discard';
  else if (view.offer && view.offer.from !== view.you && !view.offer.declined.includes(view.you)) key = 'offer';
  else if (mine()) {
    if (view.phase === 'setupVillage') key = 'setupVillage';
    else if (view.phase === 'setupRoad') key = 'setupRoad';
    else if (view.phase === 'roll') key = 'roll';
    else if (view.phase === 'robber') key = 'robber';
    else if (view.phase === 'main') key = !seen.includes('main') ? 'main' : view.turnCount > view.players.length * 2 ? (!seen.includes('trade') ? 'trade' : 'quest') : null;
  }
  if (!key || seen.includes(key)) { if (ui.tipKey && ui.tipKey !== key) hideTip(); return; }
  if (ui.tipKey === key) return;
  ui.tipKey = key;
  $('tipText').textContent = TIPS[key];
  $('tip').hidden = false;
}
function hideTip() { $('tip').hidden = true; ui.tipKey = null; }
$('tipOk').addEventListener('click', () => {
  const seen = store.get('kf_seen', []);
  if (ui.tipKey && !seen.includes(ui.tipKey)) { seen.push(ui.tipKey); store.set('kf_seen', seen); }
  hideTip();
  maybeTip();
});

/* ---------- toasts, sound buttons, layout ---------- */

function toast(text, big) {
  const t = el('div', 'toast' + (big ? ' big' : ''), text);
  $('toasts').appendChild(t);
  $('live').textContent = text;
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), big ? 2600 : 4000);
}

function renderSoundButtons() {
  const a = audioState();
  $('musicBtn').replaceChildren(icon('note')); $('musicBtn').classList.toggle('off', !a.music);
  $('musicBtn').setAttribute('aria-pressed', String(a.music));
  $('soundBtn').replaceChildren(icon(a.sound ? 'speaker' : 'mute')); $('soundBtn').classList.toggle('off', !a.sound);
  $('soundBtn').setAttribute('aria-pressed', String(a.sound));
}
$('musicBtn').addEventListener('click', () => { setMusic(!audioState().music); renderSoundButtons(); });
$('soundBtn').addEventListener('click', () => { setSound(!audioState().sound); renderSoundButtons(); sfx('click'); });
renderSoundButtons();

function fitBoard() {
  const frame = $('boardFrame'), area = frame.parentElement, cv = $('board');
  const wide = window.matchMedia('(min-width: 901px)').matches;
  const aw = area.clientWidth - 12;
  if (wide) {
    let s = Math.min(aw / W, (area.clientHeight - 12) / H);
    if (s >= 2) s = Math.floor(s * 2) / 2;
    s = Math.max(1, s);
    frame.style.width = frame.style.height = '';
    cv.style.marginLeft = '';
    cv.style.width = Math.floor(W * s) + 'px';
    cv.style.height = Math.floor(H * s) + 'px';
    return;
  }
  // narrow screens: crop the open sea at the sides so the island fills the width
  const view = 196, s = Math.min(aw / view, 3);
  frame.style.width = Math.floor(view * s) + 'px';
  frame.style.height = Math.floor(H * s) + 'px';
  cv.style.width = Math.floor(W * s) + 'px';
  cv.style.height = Math.floor(H * s) + 'px';
  cv.style.marginLeft = -Math.floor((W - view) / 2 * s) + 'px';
}
window.addEventListener('resize', fitBoard);
new ResizeObserver(() => { if (!$('game').hidden) fitBoard(); }).observe($('game'));

let frame = 0, last = 0;
function loop(now) {
  if (now - last >= 33) {
    last = now; frame += 2;
    if (!$('game').hidden) {
      board.render(view, ui, frame);
      tickTimer();
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

show('title');

// read-only handle for automated browser tests
window.kingsfold = { get view() { return view; }, get ui() { return ui; }, get room() { return room; }, get host() { return conn && conn.host; }, VPOS, EPOS, HPOS, W, H };
