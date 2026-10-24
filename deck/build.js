// Isotopia presentation for the Saskatoon Engineering Competition 2026.
const path = require('path');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/a7d31947-9afa-4634-915c-2db1ffe076d7_4ceeaf26-ff43-417a-b9e7-ea503ce31811/pptx/scripts/apply_theme.js');

const IMG = '/home/user/kingsfold/deck/img/';
const OUT = '/home/user/kingsfold/deck/Isotopia-SEC-2026.pptx';

const THEME = {
  name: 'Isotopia',
  headFontFace: 'Arial',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '1F2433', lt1: 'FFFFFF', dk2: '1B2559', lt2: 'EEF2F8',
    accent1: '4FA33F', accent2: 'F2C230', accent3: 'D9493A', accent4: '3E6FD8', accent5: '8C93A8', accent6: 'F7E27A',
    hlink: '3E6FD8', folHlink: '6C4BB0',
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_16x9';      // 10 x 5.625 in
pres.title = 'Isotopia';
pres.author = 'SEC 2026 team';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

/* ---------- layouts ---------- */
pres.defineSlideMaster({
  title: 'TITLE', background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.35, w: 4.6, h: 1.0, fontSize: 48, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 2.45, w: 4.4, h: 0.9, fontSize: 20, color: C.accent2, valign: 'top', align: 'left', margin: 0 }, text: '' } },
  ],
});
pres.defineSlideMaster({
  title: 'SECTION', background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 1.2, w: 5.0, h: 1.0, fontSize: 44, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
    { placeholder: { options: { name: 'body', type: 'body', x: 0.6, y: 2.35, w: 5.0, h: 1.8, fontSize: 20, color: C.background1, valign: 'top', align: 'left', margin: 0 }, text: '' } },
  ],
  slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5, align: 'right' },
});
pres.defineSlideMaster({
  title: 'CONTENT', background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.5, y: 0.3, w: 9.0, h: 0.75, fontSize: 32, bold: true, color: C.text2, valign: 'middle', align: 'left', margin: 0 }, text: '' } },
  ],
  slideNumber: { x: 9.2, y: 5.2, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5, align: 'right' },
});

const shot = (slide, file, x, y, w, name) => {
  const h = w * 720 / 1200;
  slide.addImage({ path: IMG + file, x, y, w, h, objectName: name, altText: name });
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { type: 'none' }, line: { color: C.text2, width: 1 }, objectName: name + ' frame' });
  return h;
};
const bullets = (items, size = 16) => items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 8, fontSize: size } }));

/* ---------- 1. title ---------- */
pres.addSection({ title: 'Intro' });
let s = pres.addSlide({ masterName: 'TITLE', sectionTitle: 'Intro' });
s.addText('Isotopia', { placeholder: 'title' });
s.addText('Our Catan remake, set in the atomic age', { placeholder: 'body' });
s.addText([
  { text: 'Saskatoon Engineering Competition 2026', options: { breakLine: true } },
  { text: 'Team: add your names here' },
], { x: 0.6, y: 4.2, w: 4.4, h: 0.7, fontSize: 14, color: C.background2, margin: 0, isTextBox: true, objectName: 'event and team' });
shot(s, 'iso-1-title.png', 5.3, 1.3, 4.2, 'Title screen of the game');
s.addNotes("Hi everyone! We're [team]. This morning we built Isotopia: it's Catan, but set on a 1950s island where you can collect uranium and, well, drop a bomb. We'll quickly cover what Catan is, how we got from a blank whiteboard to this, then show it live.");

/* ---------- 2. what is Catan ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Intro' });
s.addText('First, what is Catan?', { placeholder: 'title' });
s.addText(bullets([
  'A board game from 1995 by Klaus Teuber, one of the best-selling board games ever',
  'The board is an island of hexagon tiles: forest, hills, fields and more',
  'Each tile has a number. Roll the dice, and tiles with that number pay resources',
  'Spend resources on roads, settlements and cities. First to 10 points wins',
]), { x: 0.5, y: 1.3, w: 4.6, h: 3.6, color: C.text1, valign: 'top', isTextBox: true, objectName: 'catan basics' });
// the turn, as a loop
const loop = [['Roll', 7.35, 1.3], ['Collect', 8.65, 2.55], ['Trade', 7.35, 3.8], ['Build', 6.05, 2.55]];
const D = 1.1;
loop.forEach(([label, x, y], i) => {
  s.addShape(pres.shapes.OVAL, { x, y, w: D, h: D, fill: { color: i === 0 ? C.accent2 : C.background2 }, line: { color: C.text2, width: 1.5 }, objectName: label + ' circle' });
  s.addText(label, { x, y, w: D, h: D, align: 'center', valign: 'middle', fontSize: 16, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: label + ' label' });
});
const arrow = (x1, y1, x2, y2, name) => s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), flipH: x2 < x1, flipV: y2 < y1, line: { color: C.text2, width: 1.5, endArrowType: 'triangle' }, objectName: name });
arrow(8.35, 2.2, 8.75, 2.6, 'roll to collect');
arrow(8.75, 3.55, 8.35, 3.95, 'collect to trade');
arrow(7.25, 3.95, 6.85, 3.55, 'trade to build');
arrow(6.85, 2.6, 7.25, 2.2, 'build to roll');
s.addText("Every turn: roll, collect, trade, build", { x: 5.6, y: 4.95, w: 4.0, h: 0.35, fontSize: 12, italic: true, color: C.accent5, align: 'center', margin: 0, isTextBox: true, objectName: 'loop caption' });
s.addNotes("Quick Catan recap for anyone who hasn't played. The whole game is this loop: roll the dice, every tile with that number pays the people living next to it, you trade for what you're missing, and you build. Roads let you expand, settlements give points, and first to 10 wins.");

/* ---------- 3. problem ---------- */
pres.addSection({ title: 'Design process' });
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('The problem we picked', { placeholder: 'title' });
const pains = [
  ['Long games', 'A full game easily runs over an hour.'],
  ['Rules first', 'New players read a rulebook before their first roll.'],
  ['Same table', 'Everyone has to be in the same room.'],
];
pains.forEach(([head, body], i) => {
  const x = 0.5 + i * 3.05;
  s.addShape(pres.shapes.RECTANGLE, { x, y: 1.3, w: 2.85, h: 1.5, fill: { color: C.background2 }, line: { type: 'none' }, objectName: head + ' box' });
  s.addText(head, { x: x + 0.2, y: 1.45, w: 2.45, h: 0.5, fontSize: 22, bold: true, color: C.accent3, margin: 0, isTextBox: true, objectName: head + ' title' });
  s.addText(body, { x: x + 0.2, y: 1.95, w: 2.45, h: 0.75, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: head + ' text' });
});
s.addText([
  { text: 'Problem statement', options: { bold: true, color: C.text2, breakLine: true, fontSize: 16 } },
  { text: 'Make a Catan-style game that someone can learn in a few minutes, finish in about half an hour, and play with friends online.', options: { fontSize: 20, color: C.text1 } },
], { x: 0.5, y: 3.25, w: 9.0, h: 1.5, valign: 'top', margin: 0, isTextBox: true, objectName: 'problem statement' });
s.addNotes("We all like Catan, but we noticed the same three complaints every time we play: it takes forever, someone new always has to sit through the rules, and you can't really play it with friends who aren't in the room. So that became our problem statement.");

/* ---------- 4. brainstorm ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Saturday morning brainstorm', { placeholder: 'title' });
const notes = [
  ['Medieval kingdom', 'F7E27A', -3, false, false], ['Wasteland rebuild', 'F7E27A', 2, false, true], ['Power grid tycoon', 'F7E27A', -1, false, true], ['Atomic Age 1950s', 'F7E27A', 3, true, false],
  ['Reactors make double', 'F6B9C9', 2, false, true], ['Meltdown on a 7?', 'F6B9C9', -2, false, true], ['Uranium bomb wipes out a land', 'F6B9C9', -3, true, false], ['Fallout shelters', 'F6B9C9', 1, true, false],
  ['Seasons change the map', 'BFE6B0', -2, false, true], ['Bots for empty seats', 'BFE6B0', 3, true, false], ['Play online with a link', 'BFE6B0', -1, true, false], ['Shorter game: 8 points', 'BFE6B0', 2, true, false],
];
notes.forEach(([label, color, rot, picked, cut], i) => {
  const x = 0.6 + (i % 4) * 2.25, y = 1.25 + Math.floor(i / 4) * 1.15;
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 1.95, h: 0.95, fill: { color }, line: { type: 'none' }, rotate: rot, shadow: { type: 'outer', color: '000000', opacity: 0.2, blur: 3, offset: 2, angle: 45 }, objectName: 'sticky ' + label });
  s.addText((picked ? '✓ ' : '') + label, { x: x + 0.1, y: y + 0.05, w: 1.75, h: 0.85, fontSize: 14, color: '333333', align: 'center', valign: 'middle', rotate: rot, strike: cut ? 'sngStrike' : undefined, bold: picked, margin: 0, isTextBox: true, objectName: 'sticky text ' + label });
});
s.addText('Yellow: themes. Pink: the twist. Green: ways to make it easier. Then everyone got three votes.', { x: 0.5, y: 4.85, w: 9.0, h: 0.4, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true, objectName: 'brainstorm caption' });
s.addNotes("This was pretty much our whiteboard at 9am. We threw out a bunch of themes and twists, no idea too dumb, then everyone got three votes. The crossed out ones lost. The bomb idea won the twist vote by a mile.");

/* ---------- 5. decision matrix ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Picking a theme', { placeholder: 'title' });
const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 }, align: 'center' } });
const cell = (t, opts = {}) => ({ text: String(t), options: { align: 'center', ...opts } });
const crit = [['Fun', 0.3], ['Easy to learn', 0.3], ['Fits pixel art', 0.2], ['Original', 0.2]];
const options = [['Medieval kingdom', [4, 4, 5, 2]], ['Wasteland rebuild', [4, 3, 4, 3]], ['Power grid tycoon', [3, 3, 3, 4]], ['Atomic Age 1950s', [5, 4, 5, 5]]];
const rows = [[hdr('Theme'), ...crit.map(([n, w]) => hdr(`${n} (${w * 100}%)`)), hdr('Score')]];
options.forEach(([name, sc]) => {
  const total = sc.reduce((a, v, i) => a + v * crit[i][1], 0).toFixed(1);
  const win = name.startsWith('Atomic');
  const fill = win ? { fill: { color: 'DDF0D6' } } : {};
  rows.push([{ text: name, options: { bold: win, ...fill } }, ...sc.map(v => cell(v, fill)), cell(total, { bold: true, ...fill })]);
});
s.addTable(rows, { x: 0.5, y: 1.3, w: 9.0, colW: [2.3, 1.35, 1.45, 1.45, 1.25, 1.2], fontSize: 14, color: C.text1, border: { type: 'solid', pt: 0.75, color: 'C9CFDC' }, rowH: 0.45, objectName: 'decision matrix' });
s.addText('Scores out of 5, weighted. Atomic Age won on fun and originality, and it gave us uranium.', { x: 0.5, y: 3.85, w: 9.0, h: 0.4, fontSize: 14, color: C.text1, margin: 0, isTextBox: true, objectName: 'matrix caption' });
s.addNotes("To settle the theme argument we did a quick weighted decision matrix. We weighted fun and easy-to-learn highest because those were our objectives. Medieval was safe, but Atomic Age was more original and naturally gave us a new resource.");

/* ---------- 6. objectives / constraints / functions ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Objectives, constraints, functions', { placeholder: 'title' });
const cols = [
  ['Objectives', 'What we wanted', C.accent1, ['Easy for a first-timer', 'Games around 20 to 25 min', 'Fun to replay', 'Looks good']],
  ['Constraints', 'What we had to stick to', C.accent3, ['Python + pygame', 'Runs in a browser, no install', '2 to 4 players', 'Free: no servers to pay for']],
  ['Functions', 'What it has to do', C.accent4, ['New random board each game', 'Roll dice and pay out', 'Check every rule', 'Bots and online play']],
];
cols.forEach(([head, sub, color, items], i) => {
  const x = 0.5 + i * 3.05;
  s.addShape(pres.shapes.RECTANGLE, { x, y: 1.25, w: 2.85, h: 3.7, fill: { color: C.background2 }, line: { type: 'none' }, objectName: head + ' column' });
  s.addText(head, { x: x + 0.2, y: 1.4, w: 2.45, h: 0.45, fontSize: 22, bold: true, color, margin: 0, isTextBox: true, objectName: head + ' heading' });
  s.addText(sub, { x: x + 0.2, y: 1.85, w: 2.45, h: 0.3, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true, objectName: head + ' sub' });
  s.addText(bullets(items, 15), { x: x + 0.2, y: 2.3, w: 2.5, h: 2.5, color: C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: head + ' list' });
});
s.addNotes("Standard engineering design stuff. Objectives are the things we wanted to maximize. Constraints were hard limits: we had to use Python and pygame, it had to run in a browser so friends don't install anything, and it couldn't cost money. Functions are what the game actually has to do.");

/* ---------- 7. changes from Catan ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('What we changed from Catan', { placeholder: 'title' });
const cmp = [
  [hdr('Catan'), hdr('Isotopia'), hdr('Why')],
  ['10 points to win', '8 points to win', 'Shorter games'],
  ['5 resources', '4 resources + Uranium', 'Uranium is rare: only 2 mines'],
  ['The robber', 'A radiation cloud', 'Same rule, fits the theme'],
  ['Development cards', 'Cut', 'Less to explain'],
  ['Nothing like it', 'The Bomb: 5 Uranium wipes out a land', 'Big moments, one per player'],
  ['Nothing like it', 'Fallout shelter', 'A way to defend yourself'],
].map((r, i) => i === 0 ? r : r.map((t, j) => ({ text: t, options: { bold: j === 1, color: j === 2 ? C.accent5 : C.text1 } })));
s.addTable(cmp, { x: 0.5, y: 1.25, w: 9.0, colW: [2.6, 3.5, 2.9], fontSize: 14, border: { type: 'solid', pt: 0.75, color: 'C9CFDC' }, rowH: 0.47, objectName: 'catan vs isotopia' });
s.addNotes("Here's everything we changed. Mostly we cut stuff to make it faster and easier, then added one big new idea: the bomb. Collect five uranium and you can turn any land into a crater, destroying every building on it, unless it has a fallout shelter.");

/* ---------- 8. version 1 to version 2 ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Version 1 to version 2', { placeholder: 'title' });
s.addText('Morning: version 1', { x: 0.5, y: 1.2, w: 4.2, h: 0.4, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'v1 heading' });
s.addText('def roll_two_die():\n    dice_1 = random.randint(1, 6)\n    dice_2 = random.randint(1, 6)\n    return dice_1 + dice_2', { x: 0.5, y: 1.7, w: 4.2, h: 1.25, fontFace: 'Courier New', fontSize: 12, color: 'E8ECF6', fill: { color: '22283A' }, margin: 8, valign: 'top', isTextBox: true, objectName: 'v1 dice code' });
s.addText(bullets(['Board as a grid of dots and edges (backend.py)', 'SPACE to roll, E to end your turn', 'Dice auto-roll after 10 seconds', 'Everything printed in the terminal'], 14), { x: 0.5, y: 3.1, w: 4.2, h: 1.9, color: C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: 'v1 list' });
s.addText('Afternoon: version 2', { x: 5.2, y: 1.2, w: 4.3, h: 0.4, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'v2 heading' });
shot(s, 'iso-3-game-solo.png', 5.2, 1.7, 4.3, 'Version 2 game screen');
s.addText('Clickable map, pixel art, bots, tips, online play', { x: 5.2, y: 4.4, w: 4.3, h: 0.4, fontSize: 14, color: C.text1, margin: 0, isTextBox: true, objectName: 'v2 caption' });
s.addNotes("Our first version this morning was all keyboard and terminal: SPACE to roll, E to end the turn, and the dice roll themselves after 10 seconds so nobody stalls. Once the rules worked, we rebuilt the screen so you just click on the map.");

/* ---------- 9. how it's built ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText("How it's built", { placeholder: 'title' });
const box = (x, y, w, h, head, body, fill, name) => {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: C.text2, width: 1 }, objectName: name + ' box' });
  s.addText([{ text: head, options: { bold: true, fontSize: 15, color: C.text2, breakLine: true } }, { text: body, options: { fontSize: 12, color: C.text1 } }],
    { x: x + 0.12, y, w: w - 0.24, h, valign: 'middle', margin: 0, isTextBox: true, objectName: name + ' text' });
};
box(0.5, 1.3, 2.5, 1.1, 'app.py + view.py', 'The pixel screens, drawn with pygame', C.background2, 'screens');
box(3.6, 1.3, 2.5, 1.1, 'rules.py', 'Every rule of the game. No graphics', 'FFF3C4', 'rules');
box(3.6, 2.95, 2.5, 1.0, 'bot.py', 'The bots for empty seats', C.background2, 'bots');
box(6.7, 1.3, 2.8, 1.1, 'online.py', "Host's browser runs the game, sends each player their view", C.background2, 'online');
box(6.7, 2.95, 2.8, 1.0, "Friends' browsers", 'Connect through PeerJS', 'DDF0D6', 'friends');
const line = (x, y, w, h, name, two) => s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color: C.text2, width: 1.5, endArrowType: 'triangle', beginArrowType: two ? 'triangle' : undefined }, objectName: name });
line(3.0, 1.85, 0.6, 0, 'screens to rules', true);
line(6.1, 1.85, 0.6, 0, 'rules to online', true);
line(4.85, 2.4, 0, 0.55, 'rules to bots', true);
line(8.1, 2.4, 0, 0.55, 'online to friends', true);
s.addText('pygbag turns the pygame code into a web page, and GitHub Pages hosts it for free.', { x: 0.5, y: 4.4, w: 9.0, h: 0.5, fontSize: 15, color: C.text1, margin: 0, isTextBox: true, objectName: 'hosting line' });
s.addNotes("The key decision was keeping all the rules in one file with no graphics. That made it easy to test, and the bots and online play just use the same rules. For online, one friend's browser runs the actual game and sends everyone their own view, so you can't see other people's cards.");

/* ---------- 10. testing ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Testing, and the bug that broke it', { placeholder: 'title' });
const stats = [['200', 'bot games every time we change a rule'], ['460', 'rounds in our longest broken game'], ['45', 'rounds in the longest game after the fix']];
stats.forEach(([n, label], i) => {
  const x = 0.5 + i * 3.05;
  s.addText(n, { x, y: 1.3, w: 2.85, h: 0.95, fontSize: 60, bold: true, color: i === 1 ? C.accent3 : C.accent1, margin: 0, isTextBox: true, objectName: 'stat ' + n });
  s.addText(label, { x, y: 2.25, w: 2.6, h: 0.6, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: 'stat label ' + n });
});
s.addText([
  { text: 'What happened: ', options: { bold: true } },
  { text: 'with unlimited bombs, the bots kept nuking the island until it was all craters and nobody could earn anything. ' },
  { text: 'The fix: ', options: { bold: true } },
  { text: 'one bomb per player. Now a typical game is about 17 rounds.' },
], { x: 0.5, y: 3.3, w: 9.0, h: 1.2, fontSize: 16, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: 'bug story' });
s.addNotes("Our favourite bug. We let the bots play 200 games, and one game lasted 460 rounds. Turns out with unlimited bombs they turned the whole island into craters, so nobody could ever win. Limiting it to one bomb each fixed it, and the longest game dropped to 45 rounds.");

/* ---------- 11. demo ---------- */
pres.addSection({ title: 'Demo' });
s = pres.addSlide({ masterName: 'SECTION', sectionTitle: 'Demo' });
s.addText('Live demo', { placeholder: 'title' });
s.addText([
  { text: 'Play along on your phone or laptop:', options: { breakLine: true } },
  { text: 'memara719.github.io/kingsfold/isotopia', options: { bold: true, color: C.accent2 } },
], { placeholder: 'body' });
s.addShape(pres.shapes.RECTANGLE, { x: 6.55, y: 1.15, w: 2.9, h: 2.9, fill: { color: C.background1 }, line: { type: 'none' }, objectName: 'qr background' });
s.addImage({ path: IMG + 'qr-isotopia.png', x: 6.65, y: 1.25, w: 2.7, h: 2.7, objectName: 'QR code to the game', altText: 'QR code linking to the game' });
s.addText('Scan to play', { x: 6.55, y: 4.15, w: 2.9, h: 0.35, fontSize: 14, color: C.background1, align: 'center', margin: 0, isTextBox: true, objectName: 'qr caption' });
s.addNotes("Demo plan: 1) host a table and show the invite link. 2) Someone joins from their phone. 3) Place houses, roll, build. 4) If someone has 5 uranium, drop the bomb. If the Wi-Fi dies, flip to the next slide.");

/* ---------- 12. demo backup ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Demo' });
s.addText('In case the Wi-Fi gives up', { placeholder: 'title' });
[['online-lobby.png', 'Host a table, send the link'], ['iso-4-bomb-confirm.png', 'Pick a land to bomb'], ['iso-5-boom-by-hand.png', 'Boom: a crater forever']].forEach(([f, cap], i) => {
  const x = 0.5 + i * 3.05;
  shot(s, f, x, 1.4, 2.85, cap);
  s.addText(cap, { x, y: 3.2, w: 2.85, h: 0.4, fontSize: 14, color: C.text1, margin: 0, isTextBox: true, objectName: 'caption ' + cap });
});
s.addNotes("Backup screenshots: the online lobby with the invite link, the bomb confirmation that tells you exactly what gets destroyed, and the explosion.");

/* ---------- 13. future ---------- */
pres.addSection({ title: 'Wrap-up' });
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Wrap-up' });
s.addText("What we'd do next", { placeholder: 'title' });
const next = [
  ['Player trading', 'Right now you can only trade with the bank'],
  ['Smarter bots', 'Easy, normal and hard'],
  ['Phone layout', 'Play holding your phone upright'],
  ['Music', 'A proper chiptune soundtrack'],
  ['Save and resume', 'Pick a game back up later'],
  ['Colour-blind mode', 'Patterns on top of player colours'],
];
next.forEach(([head, body], i) => {
  const x = 0.5 + (i % 3) * 3.05, y = 1.3 + Math.floor(i / 3) * 1.75;
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.85, h: 1.5, fill: { color: C.background2 }, line: { type: 'none' }, objectName: head + ' card' });
  s.addText(head, { x: x + 0.2, y: y + 0.18, w: 2.45, h: 0.45, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: head + ' title' });
  s.addText(body, { x: x + 0.2, y: y + 0.65, w: 2.45, h: 0.7, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: head + ' text' });
});
s.addNotes("If we had another Saturday: trading between players online is the big one, then bot difficulty levels, a portrait layout for phones, and a colour-blind friendly mode since player colours matter a lot.");

/* ---------- 14. questions ---------- */
s = pres.addSlide({ masterName: 'SECTION', sectionTitle: 'Wrap-up' });
s.addText('Questions?', { placeholder: 'title' });
s.addText([
  { text: 'Thanks for listening!', options: { breakLine: true } },
  { text: 'memara719.github.io/kingsfold/isotopia', options: { color: C.accent2 } },
], { placeholder: 'body' });
shot(s, 'iso-5-boom-solo.png', 5.5, 1.3, 4.0, 'The bomb going off');
s.addNotes("That's it, thanks! Happy to take questions about the game, the code, or why we thought adding nukes to Catan was a good idea.");

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
void HEX;
