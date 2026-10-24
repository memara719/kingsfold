// Catan: Cold War Edition presentation for the Saskatoon Engineering Competition 2026.
const path = require('path');
const pptxgen = require('pptxgenjs');
const { applyTheme } = require('/root/.claude/skills/synced/a7d31947-9afa-4634-915c-2db1ffe076d7_4ceeaf26-ff43-417a-b9e7-ea503ce31811/pptx/scripts/apply_theme.js');

const IMG = '/home/user/kingsfold/deck/img/';
const OUT = '/home/user/kingsfold/deck/Catan-Cold-War-SEC-2026.pptx';
const CW = path.join(__dirname, 'img/cold-war/');

const THEME = {
  name: 'Cold War Catan',
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
pres.title = 'Catan: Cold War Edition';
pres.author = 'SEC 2026 team';
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;

/* ---------- layouts ---------- */
pres.defineSlideMaster({
  title: 'TITLE', background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.9, w: 4.6, h: 1.45, fontSize: 48, bold: true, color: C.background1, valign: 'bottom', align: 'left', margin: 0 }, text: '' } },
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
  const h = w * (file.startsWith('cw-') ? 800 : 720) / 1200;
  slide.addImage({ path: (file.startsWith('cw-') ? CW : IMG) + file, x, y, w, h, objectName: name, altText: name });
  slide.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { type: 'none' }, line: { color: C.text2, width: 1 }, objectName: name + ' frame' });
  return h;
};
const bullets = (items, size = 16) => items.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 8, fontSize: size } }));

/* ---------- 1. title ---------- */
pres.addSection({ title: 'Intro' });
let s = pres.addSlide({ masterName: 'TITLE', sectionTitle: 'Intro' });
s.addText('Catan: Cold War Edition', { placeholder: 'title', fontSize: 40 });
s.addText('Our Catan remake, set in the atomic age', { placeholder: 'body' });
s.addText([
  { text: 'Saskatoon Engineering Competition 2026', options: { breakLine: true } },
  { text: 'Team: Daniyal, Mustafa, Abdullah, Taha' },
], { x: 0.6, y: 4.2, w: 4.4, h: 0.7, fontSize: 14, color: C.background2, margin: 0, isTextBox: true, objectName: 'event and team' });
shot(s, 'cw-start.png', 5.3, 1.2, 4.2, 'Start screen of the game');
s.addNotes("Hi everyone! We're [team]. We're Daniyal, Mustafa, Abdullah and Taha. This morning we built Catan: Cold War Edition. It's classic Catan set in 1953, except you can get uranium and, well, nuke a tile. We'll quickly cover what Catan is, how we got from a blank whiteboard to this, then show it live.");

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
  { text: 'Make the best version of Catan: keep the rules people already love, and add one twist that makes every game feel different.', options: { fontSize: 20, color: C.text1 } },
], { x: 0.5, y: 3.25, w: 9.0, h: 1.5, valign: 'top', margin: 0, isTextBox: true, objectName: 'problem statement' });
s.addNotes("We all like Catan, but we noticed the same three complaints every time we play: it takes forever, someone new always has to sit through the rules, and you can't really play it with friends who aren't in the room. We didn't want to throw out what makes Catan good, so our problem statement was simple: make the best version of Catan, with one twist big enough to change how people play.");

/* ---------- 4. brainstorm ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Saturday morning brainstorm', { placeholder: 'title' });
const notes = [
  ['Medieval kingdom', 'F7E27A', -3, false, false], ['Wasteland rebuild', 'F7E27A', 2, false, true], ['Power grid tycoon', 'F7E27A', -1, false, true], ['Atomic Age 1950s', 'F7E27A', 3, true, false],
  ['Reactors make double', 'F6B9C9', 2, false, true], ['Meltdown on a 7?', 'F6B9C9', -2, false, true], ['Nuke wipes out a hex for good', 'F6B9C9', -3, true, false], ['Fallout shelters', 'F6B9C9', 1, false, true],
  ['Seasons change the map', 'BFE6B0', -2, false, true], ['Keep the classic rules', 'BFE6B0', 3, true, false], ['Uranium from dev cards', 'BFE6B0', -1, true, false], ['Shorter game: 8 points', 'BFE6B0', 2, false, true],
];
notes.forEach(([label, color, rot, picked, cut], i) => {
  const x = 0.6 + (i % 4) * 2.25, y = 1.25 + Math.floor(i / 4) * 1.15;
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 1.95, h: 0.95, fill: { color }, line: { type: 'none' }, rotate: rot, shadow: { type: 'outer', color: '000000', opacity: 0.2, blur: 3, offset: 2, angle: 45 }, objectName: 'sticky ' + label });
  s.addText((picked ? '✓ ' : '') + label, { x: x + 0.1, y: y + 0.05, w: 1.75, h: 0.85, fontSize: 14, color: '333333', align: 'center', valign: 'middle', rotate: rot, strike: cut ? 'sngStrike' : undefined, bold: picked, margin: 0, isTextBox: true, objectName: 'sticky text ' + label });
});
s.addText('Yellow: themes. Pink: the twist. Green: how it fits into the rules. Then everyone got three votes.', { x: 0.5, y: 4.85, w: 9.0, h: 0.4, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true, objectName: 'brainstorm caption' });
s.addNotes("This was pretty much our whiteboard at 9am. We threw out a bunch of themes and twists, no idea too dumb, then everyone got three votes. The crossed out ones lost. The nuke idea won the twist vote by a mile, and we decided to keep everything else from classic Catan.");

/* ---------- 5. decision matrix ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Picking a theme', { placeholder: 'title' });
const hdr = (t) => ({ text: t, options: { bold: true, color: C.background1, fill: { color: C.text2 }, align: 'center' } });
const cell = (t, opts = {}) => ({ text: String(t), options: { align: 'center', ...opts } });
const crit = [['Fun', 0.3], ['Easy to learn', 0.3], ['Fits the look', 0.2], ['Original', 0.2]];
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
  ['Objectives', 'What we wanted', C.accent1, ['Easy if you know Catan', 'Nukes add drama, not chaos', 'Fun to replay', 'Looks like a 1950s war room']],
  ['Constraints', 'What we had to stick to', C.accent3, ['Python + pygame only', 'Runs on any laptop', '2 to 4 players, one screen', 'Built in one day']],
  ['Functions', 'What it has to do', C.accent4, ['New random board each game', 'Dice, robber and trading', 'Dev cards and nukes', 'Explain why a move is not allowed']],
];
cols.forEach(([head, sub, color, items], i) => {
  const x = 0.5 + i * 3.05;
  s.addShape(pres.shapes.RECTANGLE, { x, y: 1.25, w: 2.85, h: 3.7, fill: { color: C.background2 }, line: { type: 'none' }, objectName: head + ' column' });
  s.addText(head, { x: x + 0.2, y: 1.4, w: 2.45, h: 0.45, fontSize: 22, bold: true, color, margin: 0, isTextBox: true, objectName: head + ' heading' });
  s.addText(sub, { x: x + 0.2, y: 1.85, w: 2.45, h: 0.3, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true, objectName: head + ' sub' });
  s.addText(bullets(items, 15), { x: x + 0.2, y: 2.3, w: 2.5, h: 2.5, color: C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: head + ' list' });
});
s.addNotes("Standard engineering design stuff. Objectives are the things we wanted to maximize. Constraints were hard limits: we had to use Python and pygame, it had to run on any laptop with just pygame installed, and we only had one day. Functions are what the game actually has to do.");

/* ---------- 7. changes from Catan ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('What we changed from Catan', { placeholder: 'title' });
const cmp = [
  [hdr('Catan'), hdr('Cold War Edition'), hdr('Why')],
  ['5 resources', '5 resources + Uranium', 'The new twist'],
  ['Development cards', 'Uranium Shipment card: +2 uranium', 'Uranium stays rare'],
  ['Knight, Monopoly, etc.', 'Secret Agent, Embargo, Marshall Plan', 'Fits the theme'],
  ['City', 'Hotel: 2 wheat + 3 ore', 'Same rule, new look'],
  ['Nothing like it', 'Nuke: 3 uranium + 1 ore', 'Wipes out a hex for good'],
  ['10 points to win', '10 points to win', 'Kept it classic'],
].map((r, i) => i === 0 ? r : r.map((t, j) => ({ text: t, options: { bold: j === 1, color: j === 2 ? C.accent5 : C.text1 } })));
s.addTable(cmp, { x: 0.5, y: 1.25, w: 9.0, colW: [2.6, 3.5, 2.9], fontSize: 14, border: { type: 'solid', pt: 0.75, color: 'C9CFDC' }, rowH: 0.47, objectName: 'catan vs cold war' });
s.addNotes("Here's everything we changed. We kept the classic rules and just re-themed them, then added one big idea: the nuke. Uranium comes from Uranium Shipment dev cards. With 3 uranium and 1 ore you build a nuke, and next turn you can launch it at any hex. That hex never produces again, for anyone. The buildings around it survive.");

/* ---------- 8. version 1 to version 2 ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Version 1 to version 2', { placeholder: 'title' });
s.addText('Morning: version 1', { x: 0.5, y: 1.2, w: 4.2, h: 0.4, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'v1 heading' });
s.addText('def roll_two_die():\n    dice_1 = random.randint(1, 6)\n    dice_2 = random.randint(1, 6)\n    return dice_1 + dice_2', { x: 0.5, y: 1.7, w: 4.2, h: 1.25, fontFace: 'Courier New', fontSize: 12, color: 'E8ECF6', fill: { color: '22283A' }, margin: 8, valign: 'top', isTextBox: true, objectName: 'v1 dice code' });
s.addText(bullets(['Board as a grid of dots and edges', 'SPACE to roll, E to end your turn', 'Dice auto-roll after 10 seconds', 'Everything printed in the terminal'], 14), { x: 0.5, y: 3.1, w: 4.2, h: 1.9, color: C.text1, valign: 'top', margin: 0, isTextBox: true, objectName: 'v1 list' });
s.addText('Afternoon: version 2', { x: 5.2, y: 1.2, w: 4.3, h: 0.4, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: 'v2 heading' });
shot(s, 'cw-mid.png', 5.2, 1.7, 4.3, 'Version 2 game screen');
s.addText('Clickable board, side panel, dev cards and nukes', { x: 5.2, y: 4.65, w: 4.3, h: 0.4, fontSize: 14, color: C.text1, margin: 0, isTextBox: true, objectName: 'v2 caption' });
s.addNotes("Our first version this morning was all keyboard and terminal: SPACE to roll, E to end the turn, and the dice roll themselves after 10 seconds so nobody stalls. Once the rules worked, we rebuilt the screen: you click on the board to build, and the side panel shows your hand, the orders and the scoreboard.");

/* ---------- 9. how it's built ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText("How it's built", { placeholder: 'title' });
const box = (x, y, w, h, head, body, fill, name) => {
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: fill }, line: { color: C.text2, width: 1 }, objectName: name + ' box' });
  s.addText([{ text: head, options: { bold: true, fontSize: 15, color: C.text2, breakLine: true } }, { text: body, options: { fontSize: 12, color: C.text1 } }],
    { x: x + 0.12, y, w: w - 0.24, h, valign: 'middle', margin: 0, isTextBox: true, objectName: name + ' text' });
};
box(0.5, 1.3, 2.5, 1.1, 'main.py', 'Opens the window, reads clicks and keys', C.background2, 'main');
box(3.6, 1.3, 2.5, 1.1, 'backend.py', 'Every rule of the game. No graphics', 'FFF3C4', 'rules');
box(3.6, 2.95, 2.5, 1.0, 'test_backend.py', '30 tests for the rules', 'DDF0D6', 'tests');
box(6.7, 1.3, 2.8, 1.1, 'board_view.py + side_panel.py', 'Draw the board, hand and buttons', C.background2, 'drawing');
box(6.7, 2.95, 2.8, 1.0, 'board_layout.py', 'Where every hex, corner and road goes', C.background2, 'layout');
const line = (x, y, w, h, name, two) => s.addShape(pres.shapes.LINE, { x, y, w, h, line: { color: C.text2, width: 1.5, endArrowType: 'triangle', beginArrowType: two ? 'triangle' : undefined }, objectName: name });
line(3.0, 1.85, 0.6, 0, 'main to rules', true);
line(6.1, 1.85, 0.6, 0, 'rules to drawing', true);
line(4.85, 2.4, 0, 0.55, 'rules to tests', true);
line(8.1, 2.4, 0, 0.55, 'drawing to layout', true);
s.addText('If a move breaks a rule, backend.py raises a RuleError with a readable message, and the game shows it on screen.', { x: 0.5, y: 4.4, w: 9.0, h: 0.5, fontSize: 15, color: C.text1, margin: 0, isTextBox: true, objectName: 'rule error line' });
s.addNotes("The key decision was keeping all the rules in backend.py with no graphics at all. That made it easy to test, and the screen code only reads the game state and calls actions. If you try something illegal, the rules explain why instead of just ignoring your click.");
/* ---------- 10. testing ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Design process' });
s.addText('Testing, and the nuke that nobody built', { placeholder: 'title' });
const stats = [['30', 'automated tests on the rules, all passing'], ['859', 'lines of rules in backend.py'], ['3', 'uranium for a nuke (it started at 5)']];
stats.forEach(([n, label], i) => {
  const x = 0.5 + i * 3.05;
  s.addText(n, { x, y: 1.3, w: 2.85, h: 0.95, fontSize: 60, bold: true, color: i === 2 ? C.accent3 : C.accent1, margin: 0, isTextBox: true, objectName: 'stat ' + n });
  s.addText(label, { x, y: 2.25, w: 2.6, h: 0.6, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: 'stat label ' + n });
});
s.addText([
  { text: 'What happened: ', options: { bold: true } },
  { text: 'at first a nuke cost 5 uranium, and in our test games nobody ever got there. ' },
  { text: 'The fix: ', options: { bold: true } },
  { text: '3 uranium + 1 ore, uranium from Uranium Shipment cards (+2 each). Now it shows up most games.' },
], { x: 0.5, y: 3.3, w: 9.0, h: 1.2, fontSize: 16, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: 'balance story' });
s.addNotes("Every rule has a test, 30 in total, and they all pass. Our favourite balance problem: the first nuke cost 5 uranium and nobody ever built one, so the whole twist never happened. We dropped it to 3 uranium plus 1 ore and made uranium come from dev cards, and now it shows up in most games.");
/* ---------- 11. demo ---------- */
pres.addSection({ title: 'Demo' });
s = pres.addSlide({ masterName: 'SECTION', sectionTitle: 'Demo' });
s.addText('Live demo', { placeholder: 'title' });
s.addText([
  { text: 'SPACE rolls the dice, E ends your turn,', options: { breakLine: true } },
  { text: 'click the board to build.', options: { breakLine: true } },
  { text: 'python main.py', options: { bold: true, color: C.accent2 } },
], { placeholder: 'body' });
shot(s, 'cw-game.png', 5.9, 1.3, 3.6, 'Board at the start of a game');
s.addNotes("Demo plan: 1) start a 4 player game. 2) Place the setup houses and roads. 3) Roll, collect, build. 4) Buy dev cards until someone gets a Uranium Shipment, build a nuke and launch it. If the laptop acts up, flip to the next slide.");
/* ---------- 12. demo backup ---------- */
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Demo' });
s.addText('In case the demo gives up', { placeholder: 'title' });
[['cw-game.png', 'A fresh random board'], ['cw-mid.png', 'Mid-game: hand, orders, scoreboard'], ['cw-nuke.png', 'Confirm the launch']].forEach(([f, cap], i) => {
  const x = 0.5 + i * 3.05;
  shot(s, f, x, 1.4, 2.85, cap);
  s.addText(cap, { x, y: 3.45, w: 2.85, h: 0.4, fontSize: 14, color: C.text1, margin: 0, isTextBox: true, objectName: 'caption ' + cap });
});
s.addNotes("Backup screenshots: a fresh board, a game in progress with the side panel, and the launch confirmation that tells you exactly which hex you're about to nuke.");

/* ---------- 13. future ---------- */
pres.addSection({ title: 'Wrap-up' });
s = pres.addSlide({ masterName: 'CONTENT', sectionTitle: 'Wrap-up' });
s.addText("What we'd do next", { placeholder: 'title' });
const next = [
  ['Online play', 'Friends join from their own laptops'],
  ['Bots', 'Fill empty seats, easy to hard'],
  ['Sound and music', 'Sirens, Geiger counters, 50s radio'],
  ['Save and resume', 'Pick a game back up later'],
  ['Play in a browser', 'Nothing to install'],
  ['Colour-blind mode', 'Patterns on top of player colours'],
];
next.forEach(([head, body], i) => {
  const x = 0.5 + (i % 3) * 3.05, y = 1.3 + Math.floor(i / 3) * 1.75;
  s.addShape(pres.shapes.RECTANGLE, { x, y, w: 2.85, h: 1.5, fill: { color: C.background2 }, line: { type: 'none' }, objectName: head + ' card' });
  s.addText(head, { x: x + 0.2, y: y + 0.18, w: 2.45, h: 0.45, fontSize: 18, bold: true, color: C.text2, margin: 0, isTextBox: true, objectName: head + ' title' });
  s.addText(body, { x: x + 0.2, y: y + 0.65, w: 2.45, h: 0.7, fontSize: 14, color: C.text1, margin: 0, valign: 'top', isTextBox: true, objectName: head + ' text' });
});
s.addNotes("If we had another Saturday: online play is the big one, so friends don't have to share one laptop. Then bots for empty seats, sound, saving games, and a colour-blind friendly mode since player colours matter a lot.");

/* ---------- 14. questions ---------- */
s = pres.addSlide({ masterName: 'SECTION', sectionTitle: 'Wrap-up' });
s.addText('Questions?', { placeholder: 'title' });
s.addText([
  { text: 'Thanks for listening!', options: { breakLine: true } },
  { text: 'Daniyal, Mustafa, Abdullah, Taha', options: { color: C.accent2 } },
], { placeholder: 'body' });
shot(s, 'cw-nuke.png', 5.5, 1.3, 4.0, 'The bomb going off');
s.addNotes("That's it, thanks! Happy to take questions about the game, the code, or why we thought adding nukes to Catan was a good idea.");

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('wrote', OUT);
})();
void HEX;
