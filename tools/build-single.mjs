// Bundles the game into one self-contained HTML page.
//   node tools/build-single.mjs dist/kingsfold.html room   the claude.ai page (friends meet in the artifact's room)
//   node tools/build-single.mjs site/index.html web        the website (friends connect browser to browser through PeerJS)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const order = [
  ['board', 'shared/board.js'], ['game', 'shared/game.js'], ['bot', 'shared/bot.js'], ['host', 'shared/host.js'], ['table', 'shared/table.js'],
  ['font', 'client/font.js'], ['net', 'client/net.js'],
  ['sprites', 'client/sprites.js'], ['ui', 'client/ui.js'], ['board-view', 'client/board-view.js'], ['audio', 'client/audio.js'], ['main', 'client/main.js'],
];
const modName = spec => path.basename(spec, '.js');

const exportsOf = {}, importsOf = {};

function transform(name, src) {
  const exported = exportsOf[name] = [];
  importsOf[name] = [];
  if (/^export\s+(const|let)\s+[^;=]+=[^;]*,\s*[A-Za-z_$][\w$]*\s*=/m.test(src)) throw new Error(name + ': write one export per line, the bundler cannot read "export const a = 1, b = 2".');
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm, (_, names, spec) => {
    names.split(',').map(n => n.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach(n => importsOf[name].push([modName(spec), n]));
    return `const {${names.replace(/\s+as\s+/g, ': ')}} = __m[${JSON.stringify(modName(spec))}];`;
  });
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, names) => { names.split(',').map(n => n.trim()).filter(Boolean).forEach(n => exported.push(n)); return ''; });
  src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, id) => { exported.push(id); return kw + ' ' + id; });
  return `__m[${JSON.stringify(name)}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

const out = process.argv[2] || path.join(root, 'dist/kingsfold.html');
const mode = process.argv[3] || 'room';
if (!['room', 'web'].includes(mode)) throw new Error('mode must be room or web');
const js = 'window.KF_MODE = ' + JSON.stringify(mode) + ';\n(() => {\nconst __m = {};\n' + order.map(([n, f]) => transform(n, fs.readFileSync(path.join(root, f), 'utf8'))).join('\n') + '})();\n';
for (const [mod, list] of Object.entries(importsOf))
  for (const [from, n] of list)
    if (!exportsOf[from] || !exportsOf[from].includes(n)) throw new Error(`${mod} imports ${n} from ${from}, which does not export it.`);
const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/style.css'), 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(/<link rel="stylesheet" href="\/client\/style.css">/, `<style>\n${css}\n</style>`);
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module" src="\/client\/main.js"><\/script>/, () => `<script>\n${js}</script>`);
fs.mkdirSync(path.dirname(out), { recursive: true });
if (mode === 'room') fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
else {
  // a whole web page, with the PeerJS library built in so it needs no other site to load
  const peer = fs.readFileSync(path.join(root, 'node_modules/peerjs/dist/peerjs.min.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*$/m, '');
  const page = html.replace(/<link rel="stylesheet" href="\/client\/style.css">/, () => `<style>\n${css}\n</style>`)
    .replace(/<script type="module" src="\/client\/main.js"><\/script>/, () => `<script>\n${peer}\n</script>\n<script>\n${js}</script>`);
  fs.writeFileSync(out, page);
  fs.writeFileSync(path.join(path.dirname(out), '.nojekyll'), '');
}
console.log('wrote', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
