// Three browsers play Isotopia online, on the real browser build (pygbag).
// Alice hosts, Bob opens her invite link, Carol types the code, a fourth friend tries a wrong code.
// Mid-game Bob reloads, then Alice (the host) reloads; everyone must get their seat back and keep playing.
//
// Needs:  URL      the built game (isotopia/build/web) served over http
//         RUNTIME  a local copy of the pygbag runtime (github.com/pygame-web/cdn), answering for pygame-web.github.io
//         a PeerJS server (test/browser/peer-server.mjs) at PEER_PORT
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from './drive.mjs';

const URL = process.env.URL;
const RUNTIME = process.env.RUNTIME;
const OUT = process.env.OUT || '.';
const PEER = { host: '127.0.0.1', port: Number(process.env.PEER_PORT || 9000), path: '/', secure: false, config: { iceServers: [] } };
const TYPES = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.html': 'text/html' };
const CODE_ROWS = ['ABCDEFGHJKLM', 'NPQRSTUVWXYZ'];

const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];

async function player(name, url, viewport = { width: 1200, height: 760 }) {
  const ctx = await b.newContext({ viewport });
  await ctx.route(/^https:\/\/pygame-web\.github\.io\/cdn\//, route => {
    const file = path.join(RUNTIME, new globalThis.URL(route.request().url()).pathname.slice(5));
    if (fs.existsSync(file) && fs.statSync(file).isFile())
      return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
    return route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } });
  });
  await ctx.addInitScript(([peer, n]) => { window.KF_PEER = peer; window.KF_TEST = 1; localStorage.setItem('iso_name', n); }, [PEER, name]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  page.on('console', m => { if (/Traceback|Error:/.test(m.text()) && !/BrowserFS|favicon|404/.test(m.text())) errors.push(name + ': ' + m.text().slice(0, 300)); });
  await page.goto(url);
  await boot(page);
  return page;
}
async function boot(page) {
  await page.waitForTimeout(6000);
  await page.mouse.click(600, 380);            // the "click to start" that lets the browser play sound
  await page.waitForFunction(() => window.kf_state, null, { timeout: 90000 });
}
const st = async page => JSON.parse(await page.evaluate(() => window.kf_state || '{}'));

async function clickAt(page, x, y) {
  const s = await st(page);
  const box = await page.evaluate(() => { const c = document.getElementById('canvas'); const r = c.getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, cw: c.width, ch: c.height }; });
  const px = s.offset[0] + (x + 0.5) * s.scale, py = s.offset[1] + (y + 0.5) * s.scale;
  await page.mouse.click(box.l + px * box.w / box.cw, box.t + py * box.h / box.ch);
  await page.waitForTimeout(150);
}
async function press(page, prefix) {
  const s = await st(page);
  const r = (s.regions || []).filter(q => q[5] && q[0].startsWith(prefix)).pop();
  if (!r) return false;
  await clickAt(page, r[1] + Math.floor(r[3] / 2), r[2] + Math.floor(r[4] / 2));
  return true;
}
async function spot(page) {
  const s = await st(page);
  if (!s.spots || !s.spots.length) return false;
  const [, x, y] = s.spots[Math.floor(Math.random() * s.spots.length)];
  await clickAt(page, x, y);
  return true;
}
async function step(page) {
  const s = await st(page);
  if (s.scene !== 'game' || s.winner != null) return s;
  if (s.tip) { await press(page, 'tipok'); return s; }
  if (s.modal === 'bomb') { await press(page, 'drop'); return s; }
  if (s.modal && s.modal !== 'over') { (await press(page, 'b:Close')) || (await press(page, 'b:OK')) || (await press(page, 'b:Back')); return s; }
  if (!s.mine) return s;
  if (['setup_house', 'setup_road', 'cloud'].includes(s.phase)) { await spot(page); return s; }
  if (s.phase === 'roll') { await press(page, 'roll'); await page.waitForTimeout(400); return s; }
  if (s.phase === 'main') {
    if (await press(page, 'actbomb')) { await spot(page); return s; }
    for (const key of ['acttown', 'acthouse', 'actroad']) {
      if (await press(page, key)) { if (await spot(page)) return s; await press(page, 'cancel'); }
    }
    await press(page, 'end');
  }
  return s;
}
async function inSync(pages) {
  for (let i = 0; i < 120; i++) {
    const all = await Promise.all(pages.map(st));
    if (all.every(s => s.scene === 'game' && s.seq === all[0].seq)) return all.every(s => s.board === all[0].board);
    await pages[0].waitForTimeout(250);
  }
  return false;
}

const alice = await player('Alice', URL);
await press(alice, 'b:Play online'); await alice.waitForTimeout(300);
await press(alice, 'host');
await alice.waitForFunction(() => { const s = JSON.parse(window.kf_state || '{}'); return s.code && s.regions.some(r => r[0] === 'addbot'); }, null, { timeout: 30000 });
const code = (await st(alice)).code;
await alice.waitForTimeout(2000);

const bob = await player('Bob', URL + '#' + code, { width: 900, height: 600 });
await bob.waitForFunction(() => { const s = JSON.parse(window.kf_state || '{}'); return s.scene === 'lobby' && s.seats >= 2; }, null, { timeout: 60000 });

const carol = await player('Carol', URL);
await press(carol, 'b:Play online'); await carol.waitForTimeout(300);
await press(carol, 'joincode'); await carol.waitForTimeout(300);
for (const ch of code) {
  const r = CODE_ROWS.findIndex(row => row.includes(ch));
  await press(carol, `k${r}:${CODE_ROWS[r].indexOf(ch)}`);
}
await press(carol, 'nameok');
await carol.waitForFunction(() => { const s = JSON.parse(window.kf_state || '{}'); return s.scene === 'lobby' && s.seats >= 3; }, null, { timeout: 60000 })
  .catch(async e => { const s = await st(carol); console.log('carol stuck:', JSON.stringify({ scene: s.scene, code: s.code, seats: s.seats, notice: s.notice, keys: s.regions.map(r => r[0]).slice(0, 12) })); await carol.screenshot({ path: OUT + '/isonet-carol-stuck.png' }); throw e; });

const dave = await player('Dave', URL + '#ZZZQ', { width: 800, height: 500 });
await dave.waitForFunction(() => JSON.parse(window.kf_state || '{}').notice, null, { timeout: 60000 }).catch(() => {});
const daveNotice = (await st(dave)).notice;
await dave.context().close();

await press(alice, 'addbot');
await alice.waitForTimeout(1500);
await alice.screenshot({ path: OUT + '/isonet-1-lobby-host.png' });
await carol.screenshot({ path: OUT + '/isonet-2-lobby-guest.png' });
await press(alice, 'start');
const players = [alice, bob, carol];
for (const p of players) await p.waitForFunction(() => JSON.parse(window.kf_state || '{}').scene === 'game', null, { timeout: 30000 });

const checks = [];
let guestReloaded = false, hostReloaded = false, shot = false, last = {};
const deadline = Date.now() + 12 * 60 * 1000;
while (Date.now() < deadline) {
  for (const p of players) last = await step(p);
  const host = await st(alice);
  if (host.winner != null || host.round > 6) break;
  if (!guestReloaded && host.round >= 2) {
    guestReloaded = true;
    checks.push(['before guest reload', await inSync(players)]);
    await bob.reload(); await boot(bob);
    await bob.waitForFunction(() => JSON.parse(window.kf_state || '{}').scene === 'game', null, { timeout: 60000 });
    checks.push(['after guest reload', await inSync(players)]);
  }
  if (!shot && host.round >= 3) { shot = true; for (const [n, p] of [['host', alice], ['bob', bob], ['carol', carol]]) await p.screenshot({ path: `${OUT}/isonet-3-game-${n}.png` }); }
  if (!hostReloaded && host.round >= 4) {
    hostReloaded = true;
    checks.push(['before host reload', await inSync(players)]);
    await alice.reload(); await boot(alice);
    await alice.waitForFunction(() => JSON.parse(window.kf_state || '{}').scene === 'game', null, { timeout: 60000 });
    checks.push(['after host reload', await inSync(players)]);
  }
}
checks.push(['at the end', await inSync(players)]);
const guestsHidden = await Promise.all([bob, carol].map(async p => (await st(p)).hidden));
const end = await st(alice);
console.log(JSON.stringify({ code, daveNotice, round: end.round, winner: end.winner, bombs: end.bombs, guestsHidden, checks, errors: errors.slice(0, 10) }));
await b.close();
if (checks.some(c => !c[1]) || !hostReloaded || errors.length || !guestsHidden.every(Boolean)) process.exit(1);
