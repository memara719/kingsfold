// Two browsers share one table through the Node server, with a bot. One player reloads mid-game.
import { chromium, press, step, state } from './drive.mjs';
const URL = process.env.URL || 'http://localhost:8080/';
const OUT = process.env.OUT || '.';
const ROUNDS = Number(process.env.ROUNDS || 5);

const b = await chromium.launch();
const errors = [];
async function player(name, viewport) {
  const ctx = await b.newContext({ viewport });
  const page = await ctx.newPage();
  await page.addInitScript(n => localStorage.setItem('kf_name', JSON.stringify(n)), name[0].toUpperCase() + name.slice(1));
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(800);
  return page;
}
const alice = await player('alice', { width: 1280, height: 720 });
const bob = await player('bob', { width: 390, height: 844 });

await press(alice, 'b:Play with friends');
await alice.waitForTimeout(300);
await press(alice, 'b:Host a table');
await alice.waitForFunction(() => window.kingsfold.lobby && window.kingsfold.lobby.code);
const code = await alice.evaluate(() => window.kingsfold.lobby.code);
await press(bob, 'b:Play with friends');
await bob.waitForTimeout(3500);           // the open table shows up in the list
if (!(await press(bob, 'tb' + code))) throw new Error('table ' + code + ' not listed');
await bob.waitForFunction(() => window.kingsfold.lobby && window.kingsfold.lobby.you >= 0);
await press(bob, 'hpwaves');
await press(alice, 'b:+ Bot');
await alice.waitForTimeout(400);
await alice.screenshot({ path: OUT + '/online-1-lobby.png' });
await press(alice, 'b:Start');
await alice.waitForFunction(() => window.kingsfold.screen === 'game');
await bob.waitForFunction(() => window.kingsfold.screen === 'game');

let reloaded = false, shot = false, last;
for (let i = 0; i < 5000; i++) {
  const a = await step(alice, { trade: true });
  const s = await step(bob);
  last = a.phase ? a : s;
  if (last.phase === 'over' || last.round > ROUNDS) break;
  if (!reloaded && last.round === 3) {
    reloaded = true;
    await bob.reload();
    await bob.waitForFunction(() => window.kingsfold.screen === 'game', null, { timeout: 15000 });
  }
  if (!shot && last.round === 4) { shot = true; await alice.screenshot({ path: OUT + '/online-2-alice.png' }); await bob.screenshot({ path: OUT + '/online-3-bob.png' }); }
  await alice.waitForTimeout(50);
}
// both screens must show the same board once they have seen the same moves
let same = null;
for (let i = 0; i < 60 && !same; i++) {
  const snaps = await Promise.all([alice, bob].map(p => p.evaluate(() => { const v = window.kingsfold.view; return { seq: v.eventSeq, board: JSON.stringify([v.buildings, v.roads, v.bandit, v.players.map(q => q.handCount)]) }; })));
  if (snaps[0].seq === snaps[1].seq) same = snaps.map(x => x.board);
  else await alice.waitForTimeout(50);
}
same = same || ['?', '!'];
const bobName = await bob.evaluate(() => window.kingsfold.view.players[window.kingsfold.view.you].name);
console.log(JSON.stringify({ code, reloaded, bobName, round: last.round, inSync: same[0] === same[1], errors }));
await b.close();
if (errors.length || same[0] !== same[1]) process.exit(1);
