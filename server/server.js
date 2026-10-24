// Kingsfold server: serves the game files and runs rooms over WebSockets.
// The server holds the real game and checks every move; players only ever see their own cards.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Table, newCode } from '../shared/table.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
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

function send(ws, msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function handle(ws, msg) {
  if (msg.t === 'create') {
    let code = newCode();
    while (rooms.has(code)) code = newCode();
    const table = new Table(code, send);
    rooms.set(code, table);
    ws.table = table;
    return table.create(ws, msg);
  }
  if (msg.t === 'join') {
    const table = rooms.get(String(msg.code || '').toUpperCase());
    if (!table) return send(ws, { t: 'error', msg: 'No table with that code. Check the letters and try again.', fatal: true });
    ws.table = table;
    return table.join(ws, msg);
  }
  if (msg.t === 'list') {
    const tables = [...rooms.values()].filter(t => t.isOpen()).slice(0, 8)
      .map(t => ({ code: t.code, title: t.title(), n: t.seats.length, started: false }));
    return send(ws, { t: 'tables', tables });
  }
  if (ws.table) ws.table.handle(ws, msg);
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
  ws.on('close', () => { if (ws.table) ws.table.drop(ws); });
});

setInterval(() => {
  wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); });
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyone = room.seats.some(s => s.client);
    if (!anyone && now - room.lastActive > 20 * 60 * 1000) { room.stop(); rooms.delete(code); }
  }
}, 30000);

server.listen(PORT, () => console.log(`Kingsfold is running at http://localhost:${PORT}`));
