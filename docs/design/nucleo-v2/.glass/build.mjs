// Builds glass-lab.html from the live shader sources and the candidate patches.
// Also verifies every patch applies exactly once to BOTH sources (nucleo-v2.html and .src-onb/p2.js),
// writes patched preview builds for one variant (--preview=ID) into .glass/preview/, and dumps
// the JS-source before/after snippets used in GLASS.md (--diff=ID).
// Never edits nucleo-v2.html or .src-onb/*.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VARIANTS } from './variants.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const arg = (k) => (process.argv.find((a) => a.startsWith('--' + k + '=')) || '').split('=')[1];

function fsBlock(text) {
  const a = text.indexOf('var FS = [');
  const b = text.indexOf("].join('\\n');", a);
  if (a < 0 || b < 0) throw new Error('FS block not found');
  return { a, b: b + "].join('\\n');".length, inner: text.slice(a + 'var FS = ['.length, b) };
}
function glslOf(inner) { return new Function('return [' + inner + "].join('\\n');")(); }
function apply(src, patches, tag) {
  let s = src;
  for (const [i, [o, n]] of (patches || []).entries()) {
    const k = s.indexOf(o);
    if (k < 0) throw new Error(`${tag}: patch ${i} not found:\n${o}`);
    if (s.indexOf(o, k + 1) >= 0) throw new Error(`${tag}: patch ${i} ambiguous`);
    s = s.slice(0, k) + n + s.slice(k + o.length);
  }
  return s;
}
const q = (line) => "'" + line.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "',";

const v2Text = fs.readFileSync(path.join(root, 'nucleo-v2.html'), 'utf8');
const onbPath = path.join(root, '.src-onb', 'p2.js');
const onbText = fs.readFileSync(onbPath, 'utf8');
const v2 = fsBlock(v2Text), onb = fsBlock(onbText);
const BASE = glslOf(v2.inner), ONB = glslOf(onb.inner);

// 1. verify every variant against both sources, and that each "before" block exists verbatim in the JS source
for (const v of VARIANTS) {
  apply(BASE, v.v2, v.id + ' v2');
  apply(ONB, v.onb, v.id + ' onb');
  for (const [o] of v.v2 || []) if (v2Text.indexOf(o.split('\n').map(q).join('\n')) < 0) throw new Error(v.id + ': v2 before-block not verbatim in nucleo-v2.html:\n' + o);
  for (const [o] of v.onb || []) if (onbText.indexOf(o.split('\n').map(q).join('\n')) < 0) throw new Error(v.id + ': onb before-block not verbatim in p2.js:\n' + o);
}

// 2. the lab
const idle = JSON.parse(fs.readFileSync(path.join(here, 'idle-fallback.json'), 'utf8'));
let lab = fs.readFileSync(path.join(here, 'lab-template.html'), 'utf8');
lab = lab.replace('/*BASE_FS*/""', JSON.stringify(BASE))
  .replace('/*ONB_FS*/""', JSON.stringify(ONB))
  .replace('/*VARIANTS*/[]', JSON.stringify(VARIANTS.map((v) => ({ id: v.id, name: v.name, v2: v.v2, onb: v.onb }))))
  .replace('/*FALLBACK*/{}', JSON.stringify(idle));
fs.writeFileSync(path.join(root, 'glass-lab.html'), lab);
console.log('glass-lab.html', lab.length, 'bytes;', VARIANTS.length, 'variants verified on v2 + onboarding');

// 3. preview builds of one variant (separate folder; sources untouched)
const pv = arg('preview');
if (pv) {
  const v = VARIANTS.find((x) => x.id === pv);
  const comp = JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'companions.json'), 'utf8'))).replace(/<\//g, '<\\/');
  const outDir = path.join(here, 'preview');
  fs.mkdirSync(outDir, { recursive: true });
  const v2Out = v2Text.slice(0, v2.a) + 'var FS = ' + JSON.stringify(apply(BASE, v.v2, pv)) + ';' + v2Text.slice(v2.b);
  fs.writeFileSync(path.join(outDir, 'nucleo-v2.html'), v2Out.replace('__COMPANIONS_JSON__', comp));
  const parts = fs.readdirSync(path.join(root, '.src-onb')).filter((f) => /^p.*\.js$/.test(f)).sort();
  const js = parts.map((f) => {
    const t = fs.readFileSync(path.join(root, '.src-onb', f), 'utf8');
    return f === 'p2.js' ? t.slice(0, onb.a) + 'var FS = ' + JSON.stringify(apply(ONB, v.onb, pv + ' onb')) + ';' + t.slice(onb.b) : t;
  }).join('\n');
  const tpl = fs.readFileSync(path.join(root, '.src-onb', 'template.html'), 'utf8');
  fs.writeFileSync(path.join(outDir, 'nucleo-onboarding.html'), tpl.replace('<!--JS-->', '<script>\n' + js + '\n</script>').replace('__COMPANIONS_JSON__', comp));
  fs.copyFileSync(path.join(root, 'companions.json'), path.join(outDir, 'companions.json'));
  console.log('preview built for', pv, '->', outDir);
}

// 4. JS-source snippets for GLASS.md
const dv = arg('diff');
if (dv) {
  const v = VARIANTS.find((x) => x.id === dv);
  const blocks = [];
  for (const [tag, list, file] of [['nucleo-v2.html', v.v2, v2Text], ['.src-onb/p2.js', v.onb, onbText]]) {
    for (const [o, n] of list || []) {
      const before = o.split('\n').map(q).join('\n');
      const lineNo = file.slice(0, file.indexOf(before)).split('\n').length;
      blocks.push(`### ${tag} line ${lineNo}\n\nBefore:\n\`\`\`js\n${before}\n\`\`\`\nAfter:\n\`\`\`js\n${n.split('\n').map(q).join('\n')}\n\`\`\`\n`);
    }
  }
  fs.writeFileSync(path.join(here, 'diff-' + dv + '.md'), blocks.join('\n'));
  console.log('diff written', path.join(here, 'diff-' + dv + '.md'));
}
