// Three ways to reach a table, all with the same shape:
//   ServerNet  - the Node server in server/ (the GitHub / Render version)
//   RoomNet    - the claude.ai page's shared room: the host's browser runs the game,
//                every other browser replays the host's moves in step
//   LocalNet   - a game against bots in this browser
// Screens set net.onLobby, net.onView, net.onError, and call setHouse, addBot, removeSeat, start, act, rematch, leave.

import { createGame, apply, viewFor, HOUSE_IDS, HOUSES } from '/shared/game.js';
import { Host } from '/shared/host.js';

const BOT_NAMES = ['Sir Bramble', 'Lady Wren', 'Old Tom', 'Mistress Fen', 'Brother Ash', 'Goodwife Moll'];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const noop = () => {};
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const freeHouse = (seats, want) => {
  const used = new Set(seats.map(s => s.house));
  return want && !used.has(want) ? want : HOUSE_IDS.find(h => !used.has(h));
};

class Base {
  constructor() { this.onLobby = noop; this.onView = noop; this.onError = noop; this.onTables = noop; this.lobby = null; }
}

/* ---------- the Node server ---------- */

export class ServerNet extends Base {
  constructor(first) {
    super();
    this.kind = 'server';
    this.closing = false; this.tries = 0;
    this.open(first);
  }
  open(msg) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => { this.tries = 0; this.send(msg); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
    ws.onclose = () => {
      if (this.closing) return;
      const seat = store.get('kf_seat', null);
      if (!seat) return this.onError('Lost the connection to the server.', true);
      this.tries++;
      setTimeout(() => { if (!this.closing) this.open({ t: 'join', code: seat.code, token: seat.token, name: this.name }); }, Math.min(8000, 500 * 2 ** this.tries));
    };
  }
  send(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  handle(m) {
    if (m.t === 'token') { store.set('kf_seat', { code: m.code, token: m.token }); if (location.pathname !== '/room/' + m.code) history.replaceState(null, '', '/room/' + m.code); }
    if (m.t === 'room') {
      const host = m.seats.find(s => s.host);
      this.lobby = { code: m.code, title: (host ? host.name : 'A') + "'s table", seats: m.seats, you: m.you, isHost: m.isHost, started: m.started };
      this.onLobby(this.lobby);
    }
    if (m.t === 'state') this.onView(m.view, m.remaining);
    if (m.t === 'error') { if (m.fatal) store.set('kf_seat', null); this.onError(m.msg, !!m.fatal); }
    if (m.t === 'tables') this.onTables(m.tables);
  }
  setHouse(house) { this.send({ t: 'house', house }); }
  addBot() { this.send({ t: 'addBot' }); }
  removeSeat(seat) { this.send({ t: 'removeSeat', seat }); }
  start() { this.send({ t: 'start' }); }
  act(action) { this.send({ t: 'act', action }); }
  rematch() { this.send({ t: 'rematch' }); }
  leave() { this.closing = true; store.set('kf_seat', null); if (this.ws) this.ws.close(); if (location.pathname !== '/') history.replaceState(null, '', '/'); }
}

// Watches the server for open tables while the friends screen is up.
export class ServerTables {
  constructor(onTables) {
    this.onTables = onTables;
    this.net = null;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => this.poll();
    this.ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.t === 'tables') this.onTables(m.tables); } catch { /* ignore */ } };
    this.timer = setInterval(() => this.poll(), 3000);
  }
  poll() { if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'list' })); }
  close() { clearInterval(this.timer); this.ws.close(); }
}

/* ---------- a game against bots in this browser ---------- */

export class LocalNet extends Base {
  constructor({ name, house, bots }) {
    super();
    this.kind = 'local';
    this.settings = { name, house, bots };
    setTimeout(() => this.begin(), 0);
  }
  begin() {
    const others = shuffle(HOUSE_IDS.filter(h => h !== this.settings.house));
    const seats = [{ name: this.settings.name, house: this.settings.house, bot: false }];
    for (let i = 0; i < this.settings.bots; i++) seats.push({ name: BOT_NAMES[i], house: others[i], bot: true });
    shuffle(seats);
    const me = seats.findIndex(s => !s.bot);
    this.lobby = { code: '', title: 'Practice game', you: me, isHost: true, started: true, seats: seats.map((s, i) => ({ seat: i, ...s, connected: true })) };
    this.onLobby(this.lobby);
    this.host = new Host({ players: seats, seed: (Math.random() * 2 ** 31) | 0, timers: false, botDelay: 650, onChange: h => this.onView(viewFor(h.state, me), 0) });
  }
  act(action) { const err = this.host.act(this.lobby.you, action); if (err) this.onError(err, false); }
  rematch() { this.host.stop(); this.begin(); }
  leave() { if (this.host) this.host.stop(); }
  setHouse() {} addBot() {} removeSeat() {} start() {}
}

/* ---------- the claude.ai shared room ---------- */

const TOPIC = 'kf';
const CHUNK = 3000;
const b64 = s => btoa(unescape(encodeURIComponent(s)));
const unb64 = s => decodeURIComponent(escape(atob(s)));

let roomApi = null, userApi = null, roomTried = null;
export function roomAvailable() {
  if (!roomTried) {
    roomTried = (async () => {
      const cl = window.claude;
      if (!cl || typeof cl.use !== 'function') return null;
      try {
        [roomApi, userApi] = await Promise.all([cl.use('room'), cl.use('user').catch(() => null)]);
      } catch { roomApi = null; }
      return roomApi;
    })();
  }
  return roomTried;
}

async function whoAmI() {
  if (userApi) { try { const id = await userApi.id(); if (id) return id; } catch { /* fall through */ } }
  let t = store.get('kf_who', null);
  if (!t) { t = Math.random().toString(36).slice(2, 12); store.set('kf_who', t); }
  return t;
}

// Lists open tables: hosts announce theirs in their presence in the main room.
export class RoomTables {
  constructor(onTables) {
    this.onTables = onTables;
    this.off = roomApi.onPeers(ch => this.update(ch.peers));
    this.update(roomApi.peers());
  }
  update(peers) {
    this.onTables(peers.filter(p => p.presence && p.presence.table && !p.sameTab).map(p => {
      const t = p.presence.table;
      return { code: String(t.code || ''), title: String(t.title || 'A table'), n: Number(t.n) || 1, started: !!t.started };
    }).filter(t => /^[A-Z]{4}$/.test(t.code)));
  }
  close() { this.off(); }
}

export class RoomNet extends Base {
  constructor({ code, host, name, house }) {
    super();
    this.kind = 'room';
    this.code = code || Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
    this.isHost = !!host;
    this.name = name; this.house = house;
    this.state = null; this.n = 0; this.deadlineRem = 0;
    this.seats = []; this.started = false;
    this.hostPeer = null; this.myPeer = null;
    this.chunks = {}; this.lastSync = 0;
    this.closed = false;
    this.ready = this.open().catch(e => this.onError('Could not open the table: ' + (e && e.message || e), true));
  }

  async open() {
    this.who = await whoAmI();
    this.r = await roomApi.join('kf-' + this.code.toLowerCase());
    this.offMsg = this.r.on(TOPIC, m => { try { this.handle(m); } catch (e) { console.error(e); } });
    const mine = this.r.peers().find(p => p.sameTab);
    if (mine) this.myPeer = mine.peer;
    if (this.isHost) {
      this.hostPeer = this.myPeer;
      this.seats = [{ name: this.name, house: this.house || 'lions', bot: false, who: this.who, peer: this.myPeer, connected: true }];
    }
    this.offPeers = this.r.onPeers(ch => this.peersChanged(ch));
    this.r.presence({ who: this.who });
    if (this.isHost) {
      this.announce();
      this.publishLobby();
    } else {
      const hello = () => { if (!this.closed && !this.mySeatKnown()) this.emit({ k: 'hello', name: this.name, house: this.house, who: this.who }); };
      hello();
      this.helloTimer = setInterval(hello, 2000);
    }
    this.tickTimer = setInterval(() => { if (this.isHost && this.host) this.emit({ k: 'tick', n: this.n, rem: this.host.remaining() }); }, 3000);
    // a reload of this tab comes back to this table
    try { sessionStorage.setItem('kf_table', this.code); } catch { /* private mode */ }
    if (!this.isHost) this.lostTimer = setTimeout(() => { if (!this.mySeatKnown() && !this.closed) this.onError('Could not reach that table. It may have closed.', true); }, 10000);
  }

  emit(data) { if (this.r && !this.closed) this.r.emit(TOPIC, data).catch(e => { if (e && e.code === 'not_permitted') this.onError('This page needs to be shared with you as a contributor or editor to play at a table.', true); }); }
  mySeatKnown() { return this.seats.some(s => s.who === this.who); }
  you() { return this.seats.findIndex(s => s.who === this.who); }

  // the table, as the screens see it
  lobbyInfo() {
    return {
      code: this.code, title: (this.seats[0] ? this.seats[0].name : 'A') + "'s table",
      started: this.started, isHost: this.isHost, you: this.you(),
      seats: this.seats.map((s, i) => ({ seat: i, name: s.name, house: s.house, bot: s.bot, connected: s.bot || s.connected !== false, host: s.peer === this.hostPeer && !s.bot })),
    };
  }
  pushLobby() { this.lobby = this.lobbyInfo(); this.onLobby(this.lobby); }
  pushView() {
    const st = this.isHost && this.host ? this.host.state : this.state;
    const you = this.you();
    if (st && you >= 0) this.onView(viewFor(st, you), this.isHost && this.host ? this.host.remaining() : this.deadlineRem);
  }

  /* host side */
  announce() {
    roomApi.presence({ table: { code: this.code, title: this.name + "'s table", n: this.seats.length, started: this.started } }).catch(noop);
  }
  publishLobby() {
    this.emit({ k: 'lobby', code: this.code, hostPeer: this.hostPeer, started: this.started,
      seats: this.seats.map(s => ({ name: s.name, house: s.house, bot: s.bot, who: s.who, peer: s.peer, connected: s.connected })) });
    this.announce();
    this.pushLobby();
  }
  sendSnapshot(to) {
    if (!this.host) return;
    const data = b64(JSON.stringify(this.host.state));
    const id = Math.random().toString(36).slice(2, 8), of = Math.ceil(data.length / CHUNK);
    for (let i = 0; i < of; i++) this.emit({ k: 'snap', to, id, i, of, n: this.n, part: data.slice(i * CHUNK, (i + 1) * CHUNK) });
  }
  // take over a game already running (the old host left)
  startHosting(state) {
    this.host = new Host({
      state,
      onAction: (pid, a) => { this.n++; this.emit({ k: 'step', n: this.n, pid, a }); },
      onChange: () => { if (this.host) { this.pushView(); this.queueTick(); } },
    });
    this.seats.forEach((s, i) => { if (!s.bot && s.connected === false) this.host.setAway(i, true); });
    this.pushView();
  }
  hostHandle(m, d) {
    const seatByPeer = this.seats.findIndex(s => s.peer === m.peer && !s.bot);
    if (d.k === 'hello') {
      const who = m.by || String(d.who || '').slice(0, 64);
      if (!who) return;
      let i = this.seats.findIndex(s => s.who === who && !s.bot);
      if (i >= 0) {
        Object.assign(this.seats[i], { peer: m.peer, connected: true });
        if (!this.started) this.seats[i].name = clean(d.name);
        if (this.host) this.host.setAway(i, false);
      } else if (this.started) return this.emit({ k: 'err', to: m.peer, fatal: true, msg: 'That game has already started.' });
      else if (this.seats.length >= 6) return this.emit({ k: 'err', to: m.peer, fatal: true, msg: 'That table is full (6 players).' });
      else this.seats.push({ name: clean(d.name), house: freeHouse(this.seats, HOUSES[d.house] ? d.house : null), bot: false, who, peer: m.peer, connected: true });
      this.publishLobby();
      if (this.started) this.sendSnapshot(m.peer);
      return;
    }
    if (seatByPeer < 0) return;
    if (d.k === 'house' && !this.started && HOUSES[d.house] && !this.seats.some((s, i) => i !== seatByPeer && s.house === d.house)) {
      this.seats[seatByPeer].house = d.house; this.publishLobby();
    }
    if (d.k === 'act' && this.host) {
      const err = this.host.act(seatByPeer, d.a);
      if (err) this.emit({ k: 'err', to: m.peer, msg: err });
    }
    if (d.k === 'sync') this.sendSnapshot(m.peer);
    if (d.k === 'leave') this.dropSeat(seatByPeer);
  }
  dropSeat(i) {
    if (this.started) { this.seats[i].connected = false; if (this.host) this.host.setAway(i, true); }
    else this.seats.splice(i, 1);
    this.publishLobby();
  }

  /* guest side */
  guestHandle(m, d) {
    if (d.k === 'lobby') {
      if (this.hostPeer && m.peer !== this.hostPeer && this.peerHere(this.hostPeer)) return;
      if (d.hostPeer !== m.peer) return;
      this.hostPeer = m.peer;
      const wasStarted = this.started;
      this.seats = Array.isArray(d.seats) ? d.seats.slice(0, 6).map(s => ({ name: clean(s.name), house: HOUSES[s.house] ? s.house : 'lions', bot: !!s.bot, who: String(s.who || ''), peer: s.peer, connected: s.connected !== false })) : [];
      this.started = !!d.started;
      if (wasStarted && !this.started) { this.state = null; this.n = 0; }
      if (this.you() < 0 && this.helloSeen) return this.onError('The host removed you from the table.', true);
      if (this.you() >= 0) this.helloSeen = true;
      this.pushLobby();
      return;
    }
    if (m.peer !== this.hostPeer) return;
    if (d.k === 'start') {
      if (d.players && Number.isInteger(d.seed)) { this.state = createGame({ players: d.players, seed: d.seed }); this.n = 0; this.pushView(); }
      return;
    }
    if (d.k === 'step') {
      if (!this.state) return this.requestSync();
      if (d.n === this.n + 1) {
        const err = apply(this.state, d.pid, d.a);
        this.n++;
        if (err) return this.requestSync(true);
        this.pushView();
      } else if (d.n > this.n + 1) this.requestSync();
      return;
    }
    if (d.k === 'tick') {
      this.deadlineRem = Number(d.rem) || 0;
      if (d.n > this.n) this.requestSync(); else this.pushView();
      return;
    }
    if (d.k === 'snap' && d.to === this.myPeer) {
      const box = this.chunks[d.id] || (this.chunks[d.id] = { parts: [], got: 0 });
      if (!box.parts[d.i]) { box.parts[d.i] = d.part; box.got++; }
      if (box.got === d.of) {
        this.chunks = {};
        try { this.state = JSON.parse(unb64(box.parts.join(''))); this.n = d.n; this.pushView(); } catch { this.requestSync(true); }
      }
      return;
    }
  }
  requestSync(force) {
    const now = Date.now();
    if (!force && now - this.lastSync < 2500) return;
    this.lastSync = now;
    this.emit({ k: 'sync' });
  }
  peerHere(peer) { return this.r.peers().some(p => p.peer === peer); }

  handle(m) {
    if (this.closed) return;
    const d = m.data;
    if (!d || typeof d !== 'object') return;
    if (m.sameTab) { if (!this.myPeer) this.myPeer = m.peer; return; }
    if (d.k === 'err') { if (d.to === this.myPeer) this.onError(String(d.msg || 'Something went wrong.'), !!d.fatal); return; }
    if (d.k === 'kick') { if (d.to === this.myPeer) this.onError('The host removed you from the table.', true); return; }
    if (d.k === 'host') { if (this.seats.some(s => s.peer === m.peer)) { this.hostPeer = m.peer; this.pushLobby(); } return; }
    if (this.isHost) this.hostHandle(m, d); else this.guestHandle(m, d);
  }

  peersChanged(ch) {
    const mine = ch.peers.find(p => p.sameTab);
    if (mine && !this.myPeer) {
      this.myPeer = mine.peer;
      if (this.isHost && this.seats[0]) { this.hostPeer = this.myPeer; this.seats[0].peer = this.myPeer; this.publishLobby(); }
    }
    if (this.isHost) {
      let changed = false;
      for (const p of ch.left) {
        const i = this.seats.findIndex(s => s.peer === p.peer && !s.bot);
        if (i >= 0 && i !== this.you()) { this.dropSeat(i); changed = true; }
      }
      if (changed) this.pushView();
      return;
    }
    if (this.hostPeer && ch.left.some(p => p.peer === this.hostPeer)) {
      if (!this.started || !this.state) return this.onError('The host left the table.', true);
      // the host went away mid-game: the first player still here takes over, from their own copy of the game
      const here = new Set(ch.peers.map(p => p.peer));
      const next = this.seats.findIndex(s => !s.bot && s.peer !== this.hostPeer && (here.has(s.peer) || s.who === this.who));
      const oldHost = this.seats.findIndex(s => s.peer === this.hostPeer);
      if (oldHost >= 0) this.seats[oldHost].connected = false;
      if (next === this.you()) {
        this.isHost = true;
        this.hostPeer = this.myPeer;
        this.seats.forEach(s => { if (!s.bot && !here.has(s.peer) && s.who !== this.who) s.connected = false; });
        clearInterval(this.helloTimer);
        this.startHosting(this.state);
        this.emit({ k: 'host' });
        this.publishLobby();
      } else if (next >= 0) this.hostPeer = this.seats[next].peer;
    }
  }

  /* screen calls */
  setHouse(house) {
    if (this.isHost) { const me = this.you(); if (!this.seats.some((s, i) => i !== me && s.house === house)) { this.seats[me].house = house; this.publishLobby(); } }
    else this.emit({ k: 'house', house });
  }
  addBot() {
    if (!this.isHost || this.started || this.seats.length >= 6) return;
    const used = new Set(this.seats.map(s => s.name));
    this.seats.push({ name: BOT_NAMES.find(n => !used.has(n)) || 'Squire', house: freeHouse(this.seats), bot: true, who: 'bot' + Math.random(), peer: null });
    this.publishLobby();
  }
  removeSeat(i) {
    if (!this.isHost || this.started || !this.seats[i] || i === this.you()) return;
    const gone = this.seats.splice(i, 1)[0];
    if (gone.peer) this.emit({ k: 'kick', to: gone.peer });
    this.publishLobby();
  }
  start() {
    if (!this.isHost || this.started) return;
    if (this.seats.length < 2) return this.onError('You need at least 2 players. Add a bot or wait for a friend.', false);
    shuffle(this.seats);
    this.started = true;
    this.n = 0;
    this.publishLobby();
    const players = this.seats.map(s => ({ name: s.name, house: s.house, bot: s.bot }));
    const seed = (Math.random() * 2 ** 31) | 0;
    this.host = new Host({
      players, seed,
      onAction: (pid, a) => { this.n++; this.emit({ k: 'step', n: this.n, pid, a }); },
      onChange: () => { if (this.host) { this.pushView(); this.queueTick(); } },
    });
    this.emit({ k: 'start', players, seed });
    this.seats.forEach((s, i) => { if (!s.bot && s.connected === false) this.host.setAway(i, true); });
    this.pushView();
  }
  queueTick() {
    if (this.tickQueued) return;
    this.tickQueued = true;
    setTimeout(() => { this.tickQueued = false; if (this.host) this.emit({ k: 'tick', n: this.n, rem: this.host.remaining() }); }, 0);
  }
  act(a) {
    if (this.isHost) { if (!this.host) return; const err = this.host.act(this.you(), a); if (err) this.onError(err, false); }
    else this.emit({ k: 'act', a });
  }
  rematch() {
    if (!this.isHost || !this.host) return;
    this.host.stop(); this.host = null;
    this.started = false; this.n = 0;
    this.seats = this.seats.filter(s => s.bot || s.connected !== false);
    this.publishLobby();
  }
  leave() {
    if (this.closed) return;
    if (!this.isHost) this.emit({ k: 'leave' });
    this.closed = true;
    clearInterval(this.helloTimer); clearInterval(this.tickTimer); clearTimeout(this.lostTimer);
    try { sessionStorage.removeItem('kf_table'); } catch { /* private mode */ }
    if (this.host) this.host.stop();
    if (this.isHost) roomApi.presence({ table: null }).catch(noop);
    if (this.offMsg) this.offMsg();
    if (this.offPeers) this.offPeers();
    if (this.r) this.r.leave().catch(noop);
  }
}

function clean(n) { return String(n || '').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 14) || 'Traveler'; }
