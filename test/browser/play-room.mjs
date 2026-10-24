// Three tabs play at one table through the claude.ai room (the stand-in from mock-room.js), using the one-file page.
// Checks: the table shows up for friends, moves replay identically everywhere, a reload rejoins,
// and when the host closes their tab another player takes over and the game goes on.
import fs from 'node:fs';
import { chromium, press, step, state } from './drive.mjs';
const PAGE = process.env.URL;              // the one-file page served over http
const OUT = process.env.OUT || '.';
const mock = fs.readFileSync(new URL('./mock-room.js', import.meta.url), 'utf8');

const b = await chromium.launch();
const ctx = await b.newContext();          // one browser profile, like one person's tabs; BroadcastChannel links them
await ctx.addInitScript(mock);
const errors = [];
async function player(name, viewport) {
  const page = await ctx.newPage();
  await page.addInitScript(n => { if (!sessionStorage.getItem('named')) { localStorage.setItem('kf_name', JSON.stringify(n)); sessionStorage.setItem('named', '1'); } }, name[0].toUpperCase() + name.slice(1));
  await page.setViewportSize(viewport);
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  await page.goto(PAGE);
  await page.waitForTimeout(800);
  return page;
}
const alice = await player('alice', { width: 1280, height: 720 });
const bob = await player('bob', { width: 390, height: 844 });
const carol = await player('carol', { width: 1000, height: 640 });

await press(alice, 'b:Play with friends'); await alice.waitForTimeout(300);
await press(alice, 'b:Host a table');
await alice.waitForFunction(() => window.kingsfold.lobby && window.kingsfold.lobby.code);
const code = await alice.evaluate(() => window.kingsfold.lobby.code);
for (const p of [bob, carol]) {
  await press(p, 'b:Play with friends');
  await p.waitForTimeout(800);
  if (!(await press(p, 'tb' + code))) throw new Error('table not listed for a friend');
  await p.waitForFunction(() => window.kingsfold.lobby && window.kingsfold.lobby.you >= 0, null, { timeout: 10000 });
}
await press(bob, 'hpwaves');
await alice.waitForTimeout(500);
await alice.screenshot({ path: OUT + '/room-1-lobby.png' });
await press(alice, 'b:Start');
for (const p of [alice, bob, carol]) await p.waitForFunction(() => window.kingsfold.screen === 'game' && window.kingsfold.view, null, { timeout: 10000 });

async function inSync(pages) {
  for (let i = 0; i < 80; i++) {
    const snaps = await Promise.all(pages.map(p => p.evaluate(() => { const v = window.kingsfold.view; return { seq: v.eventSeq, board: JSON.stringify([v.buildings, v.roads, v.bandit, v.turn, v.phase, v.players.map(q => [q.handCount, q.crowns])]) }; })));
    if (snaps.every(s => s.seq === snaps[0].seq)) return snaps.every(s => s.board === snaps[0].board);
    await pages[0].waitForTimeout(50);
  }
  return false;
}

let players = [alice, bob, carol], reloaded = false, hostGone = false, shot = false, last, syncChecks = [];
for (let i = 0; i < 6000; i++) {
  for (const p of players) last = await step(p, { trade: p === alice });
  if (last.phase === 'over' || last.round > 7) break;
  if (!reloaded && last.round === 2) {
    reloaded = true;
    syncChecks.push(['before reload', await inSync(players)]);
    await bob.reload();
    await bob.waitForFunction(() => window.kingsfold.screen === 'game' && window.kingsfold.view, null, { timeout: 15000 });
    syncChecks.push(['after reload', await inSync(players)]);
  }
  if (!shot && last.round === 3) { shot = true; await alice.screenshot({ path: OUT + '/room-2-host.png' }); await bob.screenshot({ path: OUT + '/room-3-phone.png' }); }
  if (!hostGone && last.round === 4) {
    hostGone = true;
    syncChecks.push(['before host left', await inSync(players)]);
    await alice.close({ runBeforeUnload: true });
    players = [bob, carol];
    await bob.waitForTimeout(1500);
    syncChecks.push(['after host left', await inSync(players)]);
  }
  await bob.waitForTimeout(40);
}
syncChecks.push(['at the end', await inSync(players)]);
const hosts = await Promise.all(players.map(p => p.evaluate(() => window.kingsfold.lobby && window.kingsfold.lobby.isHost)));
console.log(JSON.stringify({ code, round: last.round, phase: last.phase, syncChecks, newHost: hosts, errors }));
await b.close();
if (errors.length || syncChecks.some(s => !s[1]) || last.round < 6) process.exit(1);
