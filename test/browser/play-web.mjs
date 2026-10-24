// Three browsers play on the website build: Alice hosts, Bob opens her invite link, Carol types the code.
// Mid-game Bob reloads, then Alice (the host) reloads; everyone must get their seat back and keep playing.
// Needs: site/ served at URL, and a PeerJS server (test/browser/peer-server.mjs) at PEER_PORT.
import { chromium, press, step, state, clickScreen } from './drive.mjs';
const URL = process.env.URL || 'http://127.0.0.1:8092/';
const OUT = process.env.OUT || '.';
const PEER = { host: '127.0.0.1', port: Number(process.env.PEER_PORT || 9000), path: '/', secure: false, config: { iceServers: [] } };

const b = await chromium.launch();
const errors = [];
async function player(name, viewport, url = URL) {
  const ctx = await b.newContext({ viewport });       // separate browsers, like separate friends
  await ctx.addInitScript(([peer, n]) => { window.KF_PEER = peer; localStorage.setItem('kf_name', JSON.stringify(n)); }, [PEER, name]);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  await page.goto(url);
  await page.waitForTimeout(800);
  return page;
}
const lobbyOf = p => p.evaluate(() => window.kingsfold.lobby);

const alice = await player('Alice', { width: 1280, height: 720 });
await press(alice, 'b:Play with friends'); await alice.waitForTimeout(300);
await press(alice, 'b:Host a table');
await alice.waitForFunction(() => window.kingsfold.lobby && window.kingsfold.lobby.code, null, { timeout: 15000 });
const { code } = await lobbyOf(alice);
const link = await alice.evaluate(() => location.origin + location.pathname + '#' + window.kingsfold.lobby.code);
await alice.waitForTimeout(1500);   // let the host register with the matchmaking server

const bob = await player('Bob', { width: 390, height: 844 }, link);
await bob.waitForFunction(() => window.kingsfold.lobby && window.kingsfold.lobby.you >= 0, null, { timeout: 20000 });
await press(bob, 'hpwaves');

const carol = await player('Carol', { width: 1000, height: 640 });
await press(carol, 'b:Play with friends'); await carol.waitForTimeout(300);
await press(carol, 'b:Enter code');
for (const ch of code) await carol.keyboard.press(ch);
await carol.keyboard.press('Enter');
await carol.waitForFunction(() => window.kingsfold.lobby && window.kingsfold.lobby.you >= 0, null, { timeout: 20000 });

// a wrong code gets a clear message
const dave = await player('Dave', { width: 800, height: 600 }, URL + '#ZZZQ');
await dave.waitForTimeout(6000);
const daveNotice = await dave.evaluate(() => window.kingsfold.notice);

await press(alice, 'b:+ Bot');
await alice.waitForTimeout(600);
await alice.screenshot({ path: OUT + '/web-1-lobby.png' });
await bob.screenshot({ path: OUT + '/web-2-lobby-phone.png' });
const seats = (await lobbyOf(alice)).seats.map(s => s.name);
await press(alice, 'b:Start');
for (const p of [alice, bob, carol]) await p.waitForFunction(() => window.kingsfold.screen === 'game' && window.kingsfold.view, null, { timeout: 15000 });

async function inSync(pages) {
  for (let i = 0; i < 100; i++) {
    const snaps = await Promise.all(pages.map(p => p.evaluate(() => {
      const v = window.kingsfold.view;
      const others = v.players.filter(q => q.id !== v.you).every(q => q.hand === null);
      return { seq: v.eventSeq, others, board: JSON.stringify([v.buildings, v.roads, v.bandit, v.turn, v.phase, v.players.map(q => [q.handCount, q.crowns])]) };
    })));
    if (snaps.every(s => s.seq === snaps[0].seq)) return snaps.every(s => s.board === snaps[0].board && s.others);
    await pages[0].waitForTimeout(50);
  }
  return false;
}

const checks = [];
let reloadedGuest = false, reloadedHost = false, shot = false, last;
const players = [alice, bob, carol];
for (let i = 0; i < 6000; i++) {
  for (const p of players) last = await step(p, { trade: p === alice });
  if (last.phase === 'over' || last.round > 6) break;
  if (!reloadedGuest && last.round === 2) {
    reloadedGuest = true;
    checks.push(['before guest reload', await inSync(players)]);
    await bob.reload();
    await bob.waitForFunction(() => window.kingsfold.screen === 'game' && window.kingsfold.view, null, { timeout: 30000 });
    checks.push(['after guest reload', await inSync(players)]);
  }
  if (!shot && last.round === 3) { shot = true; await alice.screenshot({ path: OUT + '/web-3-host.png' }); await bob.screenshot({ path: OUT + '/web-4-phone.png' }); }
  if (!reloadedHost && last.round === 4) {
    reloadedHost = true;
    checks.push(['before host reload', await inSync(players)]);
    await alice.reload();
    await alice.waitForFunction(() => window.kingsfold.screen === 'game' && window.kingsfold.view, null, { timeout: 60000 });
    for (const p of [bob, carol]) await p.waitForFunction(() => window.kingsfold.view && window.kingsfold.lobby && window.kingsfold.lobby.seats.every(s => s.connected), null, { timeout: 90000 });
    checks.push(['after host reload', await inSync(players)]);
  }
  await alice.waitForTimeout(30);
}
checks.push(['at the end', await inSync(players)]);
console.log(JSON.stringify({ code, seats, daveNotice, round: last.round, phase: last.phase, checks, errors }));
await b.close();
if (errors.length || checks.some(c => !c[1]) || !reloadedHost || !daveNotice) process.exit(1);
void clickScreen; void state;
