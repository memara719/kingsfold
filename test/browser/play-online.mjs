// Two real browsers play an online room together (plus one bot), through the server.
// One player reloads the page mid-game to check they get their seat back.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.URL || 'http://localhost:8090/';
const OUT = process.env.OUT || '.';
const ROUNDS = Number(process.env.ROUNDS || 6);

const b = await chromium.launch();
const errors = [];
async function player(name, size) {
  const ctx = await b.newContext({ viewport: size });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(name + ' console: ' + m.text()); });
  return page;
}
const safe = async fn => { try { await fn(); } catch { /* the screen moved on; next loop sees it */ } };

const alice = await player('alice', { width: 1280, height: 860 });
const bob = await player('bob', { width: 390, height: 844 });

await alice.goto(URL);
await alice.fill('#nameInput', 'Alice');
await alice.click('#createBtn');
await alice.waitForSelector('#lobby:not([hidden])');
const code = (await alice.textContent('#roomCode')).trim();
const link = await alice.inputValue('#shareLink');

await bob.goto(link);
await bob.fill('#nameInput', 'Bob');
await bob.click('#joinBtn');
await bob.waitForSelector('#lobby:not([hidden])');
await bob.click('.house-opt:has-text("WAVES")');
await alice.click('#addBotBtn');
await alice.waitForTimeout(300);
await alice.screenshot({ path: OUT + '/on-1-lobby-host.png' });
await bob.screenshot({ path: OUT + '/on-2-lobby-phone.png' });
await alice.click('#startBtn');
await alice.waitForSelector('#game:not([hidden])');
await bob.waitForSelector('#game:not([hidden])');

async function clickTarget(page) {
  const pos = await page.evaluate(() => {
    const k = window.kingsfold, t = k.ui.targets;
    if (!t || !t.ids.length) return null;
    const id = t.ids[Math.floor(Math.random() * t.ids.length)];
    const p = t.kind === 'vertex' ? k.VPOS[id] : t.kind === 'edge' ? k.EPOS[id] : k.HPOS[id];
    const r = document.getElementById('board').getBoundingClientRect();
    return [r.left + (p[0] + 0.5) * r.width / k.W, r.top + (p[1] + 0.5) * r.height / k.H];
  });
  if (!pos) return false;
  await page.mouse.click(pos[0], pos[1]);
  return true;
}

async function step(page, who) {
  const st = await page.evaluate(() => {
    const k = window.kingsfold, v = k.view;
    if (!v) return null;
    return { phase: v.phase, mine: v.turn === v.you, picks: v.players[v.you].picks, discard: v.discards[v.you] || 0, round: v.round,
      modal: k.ui.modal && k.ui.modal.kind, tip: !document.getElementById('tip').hidden,
      offer: v.offer && v.offer.from !== v.you && !v.offer.declined.includes(v.you) };
  });
  if (!st || st.phase === 'over') return st;
  if (st.tip) return safe(() => page.click('#tipOk', { timeout: 1000 })).then(() => st);
  if (st.picks > 0) { await safe(() => page.click('button.res-card', { timeout: 1000 })); return st; }
  if (st.modal === 'discard') {
    for (let i = 0; i < st.discard; i++) await safe(() => page.locator('.stepper .btn:has-text("+"):not([disabled])').first().click({ timeout: 1000 }));
    await safe(() => page.click('.modal-actions .btn.red', { timeout: 1000 }));
    return st;
  }
  if (st.modal === 'steal') { await safe(() => page.click('.modal-card .rows .btn', { timeout: 1000 })); return st; }
  if (st.offer) { await safe(() => page.click('.offer-bar .btn.green:not([disabled]), .offer-bar .btn:has-text("NO THANKS")', { timeout: 1000 })); return st; }
  if (!st.mine) return st;
  if (['setupVillage', 'setupRoad', 'robber'].includes(st.phase)) { await safe(() => clickTarget(page)); return st; }
  if (st.phase === 'roll') { await safe(() => page.click('#rollBtn', { timeout: 1000 })); await page.waitForTimeout(700); return st; }
  if (st.phase === 'main') {
    for (const label of ['VILLAGE', 'TOWN', 'ROAD']) {
      const btn = page.locator('.act:not([disabled])', { hasText: label }).first();
      if (await btn.count()) { await safe(() => btn.click({ timeout: 1000 })); if (await clickTarget(page)) return st; }
    }
    // try a player trade now and then
    if (who === 'alice' && Math.random() < 0.3 && !(await page.evaluate(() => !!window.kingsfold.view.offer))) {
      await safe(async () => {
        await page.click('.act:has-text("TRADE")', { timeout: 1000 });
        const give = page.locator('.rows .stepper .btn:has-text("+"):not([disabled])');
        if (await give.count() > 6) {
          await give.first().click();
          await page.locator('.rows .stepper').nth(9).locator('.btn:has-text("+")').click();
          await page.click('.modal-actions .btn.red', { timeout: 1000 });
          await page.waitForTimeout(1500);
          return;
        }
        await page.click('.modal-actions .btn.white', { timeout: 1000 });
      });
      await safe(() => page.click('.offer-bar .btn:has-text("CANCEL")', { timeout: 500 }));
    }
    await safe(() => page.click('.act.end', { timeout: 1000 }));
  }
  return st;
}

let reloaded = false, shots = 0, loops = 0, last = null;
while (loops++ < 4000) {
  const a = await step(alice, 'alice');
  const s = await step(bob, 'bob');
  last = a || s;
  if (!last) { await alice.waitForTimeout(100); continue; }
  if (last.phase === 'over' || last.round > ROUNDS) break;
  if (!reloaded && last.round === 3) {
    reloaded = true;
    await bob.reload();
    await bob.waitForSelector('#game:not([hidden])', { timeout: 10000 });
  }
  if (shots === 0 && last.round === 4) { shots++; await alice.screenshot({ path: OUT + '/on-3-alice.png' }); await bob.screenshot({ path: OUT + '/on-4-bob-phone.png', fullPage: true }); }
  await alice.waitForTimeout(60);
}
const summary = await alice.evaluate(() => {
  const v = window.kingsfold.view;
  return { code: v && window.kingsfold.room.code, phase: v.phase, round: v.round, players: v.players.map(p => p.name + ':' + p.crowns), log: v.log.slice(-4) };
});
const bobSeat = await bob.evaluate(() => window.kingsfold.view && window.kingsfold.view.players[window.kingsfold.view.you].name);
console.log(JSON.stringify({ code, reloaded, bobSeat, summary, errors }, null, 1));
await b.close();
