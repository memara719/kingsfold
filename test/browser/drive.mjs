// Helpers for driving the canvas UI from Playwright: every click is a real mouse click on the screen.
import { createRequire } from 'node:module';
export const { chromium } = createRequire(import.meta.url)('playwright');

async function screenRect(page) {
  return page.evaluate(() => {
    const r = document.getElementById('screen').getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, L: window.kingsfold.layout };
  });
}
export async function clickScreen(page, x, y) {
  const R = await screenRect(page);
  await page.mouse.click(R.left + (x + 0.5) * R.width / R.L.W, R.top + (y + 0.5) * R.height / R.L.H);
}
// Click the topmost enabled area whose key starts with prefix. Returns false if there is none.
export async function press(page, prefix) {
  const regs = await page.evaluate(() => window.kingsfold.regions());
  const hit = regs.filter(r => r.on && r.key.startsWith(prefix)).pop();
  if (!hit) return false;
  await clickScreen(page, hit.x + Math.floor(hit.w / 2), hit.y + Math.floor(hit.h / 2));
  return true;
}
export async function has(page, prefix) {
  const regs = await page.evaluate(() => window.kingsfold.regions());
  return regs.some(r => r.on && r.key.startsWith(prefix));
}
// Click one of the glowing spots on the map.
export async function clickTarget(page) {
  const p = await page.evaluate(() => {
    const k = window.kingsfold, t = k.targets;
    if (!t || !t.ids.length) return null;
    const id = t.ids[Math.floor(Math.random() * t.ids.length)];
    const w = t.kind === 'vertex' ? k.VPOS[id] : t.kind === 'edge' ? k.EPOS[id] : k.HPOS[id];
    const b = k.layout.board;
    return [b.x + 3 + w[0] - k.VX, b.y + 3 + w[1] - k.VY];
  });
  if (!p) return false;
  await clickScreen(page, Math.round(p[0]), Math.round(p[1]));
  return true;
}
export async function state(page) {
  return page.evaluate(() => {
    const k = window.kingsfold, v = k.view;
    return {
      screen: k.screen, modal: k.modal && k.modal.kind, tip: k.tip,
      phase: v && v.phase, mine: !!v && v.turn === v.you, picks: v ? v.players[v.you].picks : 0,
      discard: v && v.discards[v.you] || 0, round: v && v.round,
      offer: !!(v && v.offer && v.offer.from !== v.you && !v.offer.declined.includes(v.you)),
    };
  });
}

// One step of a simple player: answers whatever the game is asking for.
export async function step(page, { trade = false } = {}) {
  const st = await state(page);
  if (st.screen !== 'game' || !st.phase || st.phase === 'over') return st;
  if (st.tip && await press(page, 'tipok')) return st;
  if (st.picks > 0) { await press(page, 'cardwood'); return st; }
  if (st.modal === 'discard') {
    for (let i = 0; i < st.discard; i++) for (const r of ['wood', 'brick', 'wool', 'grain', 'iron']) if (await press(page, 'dc' + r + '+')) break;
    await press(page, 'b:Drop');
    return st;
  }
  if (st.modal === 'steal') { await press(page, 'st'); return st; }
  if (st.offer) { (await press(page, 'b:Yes')) || (await press(page, 'b:No')); return st; }
  if (st.modal) { await press(page, 'b:Close') || await press(page, 'b:OK') || await press(page, 'b:Back'); return st; }
  if (!st.mine) return st;
  if (['setupVillage', 'setupRoad', 'robber'].includes(st.phase)) { await clickTarget(page); return st; }
  if (st.phase === 'roll') { await press(page, 'roll'); await page.waitForTimeout(600); return st; }
  if (st.phase === 'main') {
    for (const key of ['act1', 'act2', 'act0']) {
      if (await press(page, key)) { if (await clickTarget(page)) return st; await press(page, 'b:Cancel'); }
    }
    if (trade && Math.random() < 0.3 && await press(page, 'act5')) {
      await press(page, 'b:Players');
      for (const r of ['wood', 'brick', 'wool', 'grain', 'iron']) if (await press(page, 'tg' + r + '+')) break;
      for (const r of ['iron', 'grain', 'wool', 'brick', 'wood']) if (await press(page, 'tw' + r + '+')) break;
      if (!(await press(page, 'b:Ask everyone'))) await press(page, 'b:Close');
      await page.waitForTimeout(1200);
      await press(page, 'b:Cancel');
    }
    await press(page, 'end');
  }
  return st;
}
