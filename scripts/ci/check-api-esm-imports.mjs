// Every Vercel function runs as native Node ESM, where a relative import must name the file extension. tsc, tsx and
// Vite all resolve `./module` without one, so a missing `.js` passes type checks, tests and the web build and then
// crashes the function at load in production (ERR_MODULE_NOT_FOUND). This happened on 2026-10-03: /api/desk-debate
// answered 500 for every request because src/lib/voice-assets.ts imported './regional-stocks'.
// This walks the import graph from every api/**/*.ts entry (including what it reaches under src/ and shared/) and
// fails when a relative, non-type import has no runtime extension. It runs inside `npm run check:api`, so both CI and
// the Vercel build stop before such a deployment exists.
// The same walk refuses `zod/v3`: inside zod 4 it is still zod 3's code, which walks every element of an oversized
// array (GHSA-mrhx-c7xc-m3w5). The audit gate excepts that advisory only because no function validates with it.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const RUNTIME_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.json']);
const ZOD_V3 = /^zod\/v3(?:\/|$)/;
const IMPORT = /(?:^|\n)[ \t]*(?:import|export)\s+(type\s+)?(?:[^'"\n;]*?from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const entries = [];
(function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (/\.ts$/.test(item.name) && !/\.d\.ts$/.test(item.name)) entries.push(full);
  }
})(path.join(root, 'api'));

const seen = new Set();
const unresolvable = [];
const zodV3 = [];
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(IMPORT)) {
    const typeOnly = Boolean(match[1]);
    const specifier = match[2] ?? match[3];
    if (specifier && !typeOnly && ZOD_V3.test(specifier)) zodV3.push(`${path.relative(root, file)}: '${specifier}'`);
    if (!specifier || !specifier.startsWith('.') || typeOnly) continue; // type-only imports are erased
    if (!RUNTIME_EXTENSIONS.has(path.extname(specifier))) unresolvable.push(`${path.relative(root, file)}: '${specifier}'`);
    const base = path.resolve(path.dirname(file), specifier.replace(/\.(?:js|mjs|cjs)$/, ''));
    const target = [`${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, 'index.ts')].find((candidate) => fs.existsSync(candidate));
    if (target) visit(target);
  }
}
entries.forEach(visit);

if (unresolvable.length) {
  console.error(`api-esm-imports: ${unresolvable.length} relative import(s) without a runtime extension (add ".js"):`);
  for (const line of unresolvable) console.error(`  ${line}`);
  process.exit(1);
}
if (zodV3.length) {
  console.error(`api-esm-imports: ${zodV3.length} import(s) of zod/v3 in the API graph (GHSA-mrhx-c7xc-m3w5; import 'zod'):`);
  for (const line of zodV3) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`api-esm-imports: ${entries.length} API entries, ${seen.size} modules, every relative import names its extension`);
