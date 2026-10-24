// Plays a whole game against bots through the real UI, taking screenshots along the way.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const URL = process.env.URL || 'http://localhost:8090/';
const OUT = process.env.OUT || '.';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(URL);
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/1-title.png' });
await page.fill('#nameInput', 'Tester');
await page.click('#botsBtn');
await page.waitForTimeout(200);
await page.screenshot({ path: OUT + '/2-bots.png' });
await page.click('.modal-card .btn.green');
await page.waitForTimeout(500);

async function clickTarget() {
  const pos = await page.evaluate(() => {
    const k = window.kingsfold, t = k.ui.targets;
    if (!t || !t.ids.length) return null;
    const id = t.ids[Math.floor(Math.random() * t.ids.length)];
    const p = t.kind === 'vertex' ? k.VPOS[id] : t.kind === 'edge' ? k.EPOS[id] : k.HPOS[id];
    const r = document.getElementById('board').getBoundingClientRect();
    return [r.left + (p[0] - k.VX + 0.5) * r.width / k.W, r.top + (p[1] - k.VY + 0.5) * r.height / k.H];
  });
  if (!pos) return false;
  await page.mouse.click(pos[0], pos[1]);
  return true;
}

const safe = async fn => { try { await fn(); } catch { /* screen changed; next loop will see it */ } };
let shots = 0, steps = 0, built = 0;
while (steps++ < 3000) {
  const st = await page.evaluate(() => { const v = window.kingsfold.view; if (!v) return null; return { phase: v.phase, mine: v.turn === v.you, picks: v.players[v.you].picks, discard: v.discards[v.you] || 0, round: v.round, modal: window.kingsfold.ui.modal && window.kingsfold.ui.modal.kind, tip: !document.getElementById('tip').hidden }; });
  if (!st) { await page.waitForTimeout(100); continue; }
  if (st.tip) { await safe(() => page.click('#tipOk', { timeout: 2000 })); continue; }
  if (st.phase === 'over') break;
  if (st.picks > 0) { await safe(() => page.click('button.res-card', { timeout: 2000 })); await page.waitForTimeout(80); continue; }
  if (st.modal === 'discard') {
    for (let i = 0; i < st.discard; i++) {
      const plus = await page.$$('.stepper .btn:has-text("+"):not([disabled])');
      if (plus.length) await safe(() => plus[0].click({ timeout: 2000 }));
    }
    await safe(() => page.click('.modal-actions .btn.red', { timeout: 2000 }));
    await page.waitForTimeout(100); continue;
  }
  if (st.modal === 'steal') { await safe(() => page.click('.modal-card .rows .btn', { timeout: 2000 })); continue; }
  if (!st.mine) { await page.waitForTimeout(120); continue; }
  if (st.phase === 'setupVillage' || st.phase === 'setupRoad' || st.phase === 'robber') {
    await clickTarget(); await page.waitForTimeout(150);
    if (st.phase === 'setupRoad' && shots === 0) { shots++; }
    continue;
  }
  if (st.phase === 'roll') {
    if (st.round === 3 && shots < 2) { shots++; await page.screenshot({ path: OUT + '/3-before-roll.png' }); }
    await safe(() => page.click('#rollBtn', { timeout: 2000 })); await page.waitForTimeout(900); continue;
  }
  if (st.phase === 'main') {
    // try to build: village, town, road, then end turn
    let did = false;
    for (const label of ['VILLAGE', 'TOWN', 'ROAD']) {
      const btn = page.locator('.act:not([disabled])', { hasText: label }).first();
      if (await btn.count()) {
        await safe(() => btn.click({ timeout: 2000 })); await page.waitForTimeout(80);
        if (built === 2) await page.screenshot({ path: OUT + '/4-build-mode.png' });
        if (await clickTarget()) { built++; did = true; await page.waitForTimeout(250); break; }
      }
    }
    if (did) continue;
    if (shots === 2 && st.round >= 6) { shots++; await page.screenshot({ path: OUT + '/5-midgame.png' }); }
    await safe(() => page.click('.act.end', { timeout: 2000 })); await page.waitForTimeout(150); continue;
  }
  await page.waitForTimeout(100);
}
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + '/6-end.png' });
const end = await page.evaluate(() => { const v = window.kingsfold.view; const cv = document.getElementById('board'), fr = document.getElementById('boardFrame'); return { board: [cv.style.width, cv.style.height, cv.style.marginLeft, fr.style.width, cv.width, cv.height, JSON.stringify(cv.getBoundingClientRect()), JSON.stringify(fr.getBoundingClientRect())], phase: v.phase, round: v.round, winner: v.winner, you: v.you, crowns: v.players.map(p => p.totalCrowns) }; });
console.log(JSON.stringify({ steps, built, end, errors }, null, 1));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
await page.screenshot({ path: OUT + '/7-phone-end.png', fullPage: true });
await b.close();
