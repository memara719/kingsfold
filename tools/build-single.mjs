// Bundles the client into one self-contained HTML page (bots only, no server needed).
// Usage: node tools/build-single.mjs dist/kingsfold.html
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const order = [
  ['board', 'shared/board.js'], ['game', 'shared/game.js'], ['bot', 'shared/bot.js'], ['host', 'shared/host.js'],
  ['sprites', 'client/sprites.js'], ['board-view', 'client/board-view.js'], ['audio', 'client/audio.js'], ['main', 'client/main.js'],
];
const modName = spec => path.basename(spec, '.js');

function transform(name, src) {
  const exported = [];
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'([^']+)';?\s*$/gm, (_, names, spec) =>
    `const {${names.replace(/\s+as\s+/g, ': ')}} = __m[${JSON.stringify(modName(spec))}];`);
  src = src.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (_, names) => { names.split(',').map(n => n.trim()).filter(Boolean).forEach(n => exported.push(n)); return ''; });
  src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, id) => { exported.push(id); return kw + ' ' + id; });
  return `__m[${JSON.stringify(name)}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

const js = 'window.KF_OFFLINE = true;\n(() => {\nconst __m = {};\n' + order.map(([n, f]) => transform(n, fs.readFileSync(path.join(root, f), 'utf8'))).join('\n') + '})();\n';
const html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'client/style.css'), 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(/<link rel="stylesheet" href="\/client\/style.css">/, `<style>\n${css}\n</style>`);
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script type="module" src="\/client\/main.js"><\/script>/, () => `<script>\n${js}</script>`);
const out = process.argv[2] || path.join(root, 'dist/kingsfold.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, head.trim() + '\n' + body.trim() + '\n');
console.log('wrote', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
