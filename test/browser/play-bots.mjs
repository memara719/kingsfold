// Plays a whole game against bots through the real screen, taking screenshots along the way.
import { chromium, press, step, state } from './drive.mjs';
const URL = process.env.URL || 'http://localhost:8080/';
const OUT = process.env.OUT || '.';
const SIZE = process.env.SIZE === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 720 };

const b = await chromium.launch();
const page = await b.newPage({ viewport: SIZE });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push('console: ' + m.text()); });
await page.goto(URL);
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/bots-1-title.png' });
await press(page, 'b:Play vs bots');
await page.waitForTimeout(200);
await press(page, 'b:Start');
let shot = 0, steps = 0, st;
while (steps++ < 4000) {
  st = await step(page);
  if (st.phase === 'over') break;
  if (shot === 0 && st.round >= 4 && st.mine && st.phase === 'main') { shot++; await page.screenshot({ path: OUT + '/bots-2-midgame.png' }); }
  await page.waitForTimeout(st.mine ? 60 : 150);
}
await page.waitForTimeout(800);
await page.screenshot({ path: OUT + '/bots-3-end.png' });
st = await state(page);
console.log(JSON.stringify({ steps, end: st, errors }));
await b.close();
if (st.phase !== 'over' || errors.length) process.exit(1);
