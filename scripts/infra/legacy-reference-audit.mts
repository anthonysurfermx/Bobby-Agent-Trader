#!/usr/bin/env -S npx tsx
// ============================================================
// Legacy reference audit — cut-over criterion "zero DeFi México in code and
// configuration". Scans src/, api/, vercel.json, .env.example, index.html
// for the legacy Supabase ref, defimexico domains, shared tables and the
// brand, grouped by file. Exit 1 while anything remains.
// Run: npx tsx scripts/infra/legacy-reference-audit.mts [--allow docs/infra/legacy-allowlist.txt]
// ============================================================
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const PATTERNS: Array<[string, RegExp]> = [
  ['legacy supabase ref', /egpixaunlnzauztbrnuz/],
  ['defimexico domain', /defimexico\.(org|forum)/i],
  ['shared table', /\b(newsletter_subscribers|startups|communities|blog_posts|fintech_funds|defi_advocates|jobs|courses|course_enrollments|video_tutorials|proposals|referents)\b/],
  ['brand', /DeFi\s*M[eé]xico|defi-mexico-hub/i],
];
const TARGETS = ['src', 'api', 'vercel.json', '.env.example', 'index.html'];
const allowFile = process.argv.includes('--allow') ? process.argv[process.argv.indexOf('--allow') + 1] : '';
const allow = allowFile && existsSync(join(ROOT, allowFile)) ? new Set(readFileSync(join(ROOT, allowFile), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))) : new Set<string>();

function walk(p: string): string[] {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return [p];
  const out: string[] = [];
  for (const n of readdirSync(p)) {
    if (n === 'node_modules' || n === 'dist') continue;
    out.push(...walk(join(p, n)));
  }
  return out.filter((f) => /\.(ts|tsx|js|json|html|md)$/.test(f));
}

const byFile = new Map<string, Array<{ kind: string; line: number; text: string }>>();
for (const t of TARGETS) for (const f of walk(join(ROOT, t))) {
  const rel = relative(ROOT, f);
  if (allow.has(rel)) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const [kind, re] of PATTERNS) if (re.test(text)) { const arr = byFile.get(rel) || []; arr.push({ kind, line: i + 1, text: text.trim().slice(0, 100) }); byFile.set(rel, arr); }
  });
}
let total = 0;
for (const [file, hits] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  total += hits.length;
  console.log(`${String(hits.length).padStart(3)}  ${file}  [${[...new Set(hits.map((h) => h.kind))].join(', ')}]`);
  if (process.argv.includes('-v')) for (const h of hits) console.log(`       L${h.line} ${h.text}`);
}
console.log(`\n${byFile.size} file(s), ${total} reference(s)${allow.size ? `, ${allow.size} allow-listed file(s)` : ''}.`);
process.exit(total === 0 ? 0 : 1);
