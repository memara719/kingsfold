// Kingsfold server: serves the game files and runs rooms over WebSockets.
// The server holds the real game and checks every move; players only ever see their own cards.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Host } from '../shared/host.js';
import { viewFor, HOUSE_IDS, HOUSES } from '../shared/game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const MAX_SEATS = 6;
const BOT_NAMES = ['Sir Bramble', 'Lady Wren', 'Old Tom', 'Mistress Fen', 'Brother Ash', 'Goodwife Moll'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

/* ---------- static files ---------- */

function serveFile(req, res) {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/' || url.startsWith('/room/')) url = '/client/index.html';
  if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (!url.startsWith('/client/') && !url.startsWith('/shared/')) url = '/client' + url;
  const file = path.resolve(ROOT, '.' + url);
  if (!file.startsWith(path.join(ROOT, 'client') + path.sep) && !file.startsWith(path.join(ROOT, 'shared') + path.sep)) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

/* ---------- rooms ---------- */

const rooms = new Map();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[crypto.randomInt(LETTERS.length)];
    if (!rooms.has(c)) return c;
  }
}
const cleanName = n => String(n || '').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 16) || 'Traveler';

function freeHouse(room) {
  const used = new Set(room.seats.map(s => s.house));
  return HOUSE_IDS.find(h => !used.has(h));
}

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function lobbyInfo(room) {
  return {
    t: 'room', code: room.code, started: !!room.host,
    seats: room.seats.map((s, i) => ({ seat: i, name: s.name, house: s.house, bot: s.bot, connected: s.bot || !!s.ws, host: s.token === room.hostToken })),
  };
}

function broadcastRoom(room) {
  const info = lobbyInfo(room);
  room.seats.forEach((s, i) => { if (s.ws) send(s.ws, { ...info, you: i, isHost: s.token === room.hostToken }); });
}

function broadcastState(room) {
  if (!room.host) return;
  const remaining = room.host.remaining();
  room.seats.forEach((s, i) => { if (s.ws) send(s.ws, { t: 'state', view: viewFor(room.host.state, i), remaining }); });
}

function startGame(room) {
  // shuffle the seating so the host does not always go first
  for (let i = room.seats.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [room.seats[i], room.seats[j]] = [room.seats[j], room.seats[i]];
  }
  room.host = new Host({
    players: room.seats.map(s => ({ name: s.name, house: s.house, bot: s.bot })),
    seed: crypto.randomInt(2 ** 31),
    onChange: () => broadcastState(room),
  });
  room.seats.forEach((s, i) => { if (!s.bot && !s.ws) room.host.setAway(i, true); });
  broadcastRoom(room);
  broadcastState(room);
}

function backToLobby(room) {
  if (room.host) room.host.stop();
  room.host = null;
  room.seats = room.seats.filter(s => s.bot || s.ws);
  broadcastRoom(room);
}

function seatOf(room, ws) { return room.seats.findIndex(s => s.ws === ws); }

/* ---------- messages ---------- */

function handle(ws, msg) {
  const room = ws.room;
  switch (msg.t) {
    case 'create': {
      const code = newCode();
      const token = crypto.randomUUID();
      const r = { code, seats: [], hostToken: token, host: null, lastActive: Date.now() };
      rooms.set(code, r);
      r.seats.push({ name: cleanName(msg.name), house: 'lions', bot: false, token, ws });
      ws.room = r;
      send(ws, { t: 'token', token, code });
      return broadcastRoom(r);
    }
    case 'join': {
      const r = rooms.get(String(msg.code || '').toUpperCase());
      if (!r) return send(ws, { t: 'error', msg: 'No room with that code. Check the letters and try again.' });
      const back = msg.token && r.seats.find(s => s.token === msg.token && !s.bot);
      if (back) {
        if (back.ws && back.ws !== ws) { send(back.ws, { t: 'error', msg: 'You joined from another window.', fatal: true }); back.ws.room = null; back.ws.close(); }
        back.ws = ws; ws.room = r;
        if (r.host) r.host.setAway(r.seats.indexOf(back), false);
        send(ws, { t: 'token', token: back.token, code: r.code });
        broadcastRoom(r); broadcastState(r);
        return;
      }
      if (r.host) return send(ws, { t: 'error', msg: 'That game has already started.' });
      if (r.seats.length >= MAX_SEATS) return send(ws, { t: 'error', msg: 'That room is full (6 players).' });
      const token = crypto.randomUUID();
      r.seats.push({ name: cleanName(msg.name), house: freeHouse(r), bot: false, token, ws });
      ws.room = r;
      send(ws, { t: 'token', token, code: r.code });
      return broadcastRoom(r);
    }
  }
  if (!room) return send(ws, { t: 'error', msg: 'Join a room first.' });
  room.lastActive = Date.now();
  const seat = seatOf(room, ws);
  if (seat < 0) return;
  const me = room.seats[seat];
  const isHost = me.token === room.hostToken;

  switch (msg.t) {
    case 'house': {
      if (room.host) return;
      const h = msg.house;
      if (!HOUSES[h]) return;
      if (room.seats.some((s, i) => i !== seat && s.house === h)) return send(ws, { t: 'error', msg: 'Someone already picked that house.' });
      me.house = h;
      return broadcastRoom(room);
    }
    case 'addBot': {
      if (!isHost || room.host || room.seats.length >= MAX_SEATS) return;
      const used = new Set(room.seats.map(s => s.name));
      room.seats.push({ name: BOT_NAMES.find(n => !used.has(n)) || 'Squire', house: freeHouse(room), bot: true, token: crypto.randomUUID(), ws: null });
      return broadcastRoom(room);
    }
    case 'removeSeat': {
      if (!isHost || room.host) return;
      const i = msg.seat;
      if (!Number.isInteger(i) || !room.seats[i] || i === seat) return;
      const gone = room.seats.splice(i, 1)[0];
      if (gone.ws) { send(gone.ws, { t: 'error', msg: 'The host removed you from the room.', fatal: true }); gone.ws.room = null; }
      return broadcastRoom(room);
    }
    case 'start': {
      if (!isHost || room.host) return;
      if (room.seats.length < 2) return send(ws, { t: 'error', msg: 'You need at least 2 players. Add a bot or invite a friend.' });
      return startGame(room);
    }
    case 'act': {
      if (!room.host) return;
      const err = room.host.act(seat, msg.action);
      if (err) send(ws, { t: 'error', msg: err });
      return;
    }
    case 'chat': {
      const text = String(msg.text || '').slice(0, 140).trim();
      if (!text) return;
      const now = Date.now();
      if (me.lastChat && now - me.lastChat < 700) return;
      me.lastChat = now;
      room.seats.forEach(s => send(s.ws, { t: 'chat', seat, name: me.name, house: me.house, text }));
      return;
    }
    case 'rematch': {
      if (!isHost || !room.host || room.host.state.phase !== 'over') return;
      return backToLobby(room);
    }
  }
}

function leave(ws) {
  const room = ws.room;
  if (!room) return;
  const seat = seatOf(room, ws);
  if (seat < 0) return;
  room.seats[seat].ws = null;
  if (room.host) room.host.setAway(seat, true);
  else {
    // in the lobby, give them a moment to come back before freeing the seat
    const token = room.seats[seat].token;
    setTimeout(() => {
      const i = room.seats.findIndex(s => s.token === token);
      if (i >= 0 && !room.seats[i].ws && !room.host) {
        room.seats.splice(i, 1);
        if (token === room.hostToken) { const next = room.seats.find(s => !s.bot); if (next) room.hostToken = next.token; }
        broadcastRoom(room);
      }
    }, 30000);
  }
  broadcastRoom(room);
}

/* ---------- boot ---------- */

const server = http.createServer(serveFile);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    try { handle(ws, msg); } catch (e) { console.error(e); send(ws, { t: 'error', msg: 'Something went wrong on the server.' }); }
  });
  ws.on('close', () => leave(ws));
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.seats.some(s => s.ws);
    if (!anyone && now - room.lastActive > 20 * 60 * 1000) { if (room.host) room.host.stop(); rooms.delete(code); }
  }
}, 30000);

server.listen(PORT, () => console.log(`Kingsfold is running at http://localhost:${PORT}`));
