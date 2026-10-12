// Every function must be able to start.
//
// A function that cannot be loaded answers nothing at all: no status of its own, no log line of its own, only the
// platform's FUNCTION_INVOCATION_FAILED. Two ways that has happened here, neither caught by a green build:
//   · 2026-10-03: an import written without its ".js" ran everywhere a bundler or tsx resolves it, and failed to
//     load on the platform, which resolves nothing. The desk answered 500 for 21 minutes.
//   · until 2026-10-13: a shared module read the database settings when it loaded, so 44 functions crashed on every
//     preview deployment (previews have no database settings). Nobody could open a function before merging it.
// So this checks, with no network and no provider:
//   1. every file a function can reach names its relative imports the way the platform needs them (".js" or
//      ".json", pointing at a file that exists) and uses no bundler alias ("@/");
//   2. with placeholder settings, every function loads and exports a handler;
//   3. with NO settings at all, every function loads, except the ones listed below, which still read the database
//      when they load. That list may only shrink.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entries = (): string[] => {
  const found: string[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) { const full = join(dir, name); if (name.startsWith('_') || name === 'node_modules') continue; if (statSync(full).isDirectory()) walk(full); else if (/\.ts$/.test(name) && !/\.d\.ts$|\.test\.ts$/.test(name)) found.push(full); } };
  walk(join(ROOT, 'api'));
  return found.sort();
};

// ---- the child: load every function under the environment it was given, and say which could not ----
if (process.argv[2] === '--load') {
  console.error = () => {}; console.warn = () => {}; console.log = () => {};
  const failed: Record<string, string> = {};
  for (const file of entries()) {
    try { const mod = await import(pathToFileURL(file).href); if (typeof mod.default !== 'function') failed[relative(ROOT, file)] = 'no default handler'; }
    catch (error) { failed[relative(ROOT, file)] = String((error as Error).message ?? error).split('\n')[0].slice(0, 160); }
  }
  process.stdout.write(`\n@@${JSON.stringify(failed)}@@\n`);
  process.exit(0);
}

/** Read the database settings when they load, each in its own file. Legacy routes of the protocol: fix one, take it off. */
const NEEDS_DATABASE_TO_LOAD = new Set(['api/agent-setup.ts', 'api/agents/[agentId].ts', 'api/agents/[agentId]/activity.ts', 'api/agents/register.ts', 'api/agents/transfer.ts', 'api/bobby-asset-cache.ts', 'api/bobby-cycle.ts',
  'api/bobby-digest.ts', 'api/bobby-protocol-stats.ts', 'api/bobby-signals.ts', 'api/checkpoint.ts', 'api/conviction-tiers.ts', 'api/feedback.ts', 'api/forum-agent-register.ts', 'api/forum-resolve.ts', 'api/ghost-wallet.ts',
  'api/harness-events.ts', 'api/harness-memory.ts', 'api/harness-migrate.ts', 'api/judge-mode.ts', 'api/mcp-bobby.ts', 'api/mcp-http.ts', 'api/network/consensus.ts', 'api/network/overview.ts', 'api/orchestrate.ts',
  'api/protocol-heartbeat.ts', 'api/sandbox-run.ts', 'api/sandbox-runs.ts', 'api/seed-macro-calendar.ts', 'api/telegram-access.ts', 'api/telegram-deliver.ts', 'api/telegram-webhook.ts', 'api/user-cycle.ts']);
/** Exports its handler another way (the raw body is needed for the signature). */
const OTHER_SHAPE = new Set(['api/stripe-webhook.ts']);

let checks = 0;
const ok = (value: unknown, what: string) => { assert.ok(value, what); checks++; };

// ---- 1. the import graph, as the platform resolves it ----
const SPECIFIER = /(?:\bimport\s*\(\s*|\bfrom\s*|\bimport\s+)(['"])([^'"\n]+)\1/g;
const seen = new Set<string>(), faults: string[] = [];
const sourceOf = (target: string) => [target, target.replace(/\.js$/, '.ts'), target.replace(/\.js$/, '.tsx'), target.replace(/\.js$/, '.mts')].find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
const visit = (file: string) => {
  if (seen.has(file)) return;
  seen.add(file);
  // Comments are not code: an example of an import inside one is not an import.
  // …and an import of types only is erased before anything runs: it resolves nothing on the platform.
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*(?:import|export)\s+type\s[^;'"]*?from\s*['"][^'"\n]+['"];?/gm, '');
  for (const match of text.matchAll(SPECIFIER)) {
    const specifier = match[2], where = `${relative(ROOT, file)} imports "${specifier}"`;
    if (specifier.startsWith('@/')) { faults.push(`${where}: a bundler alias does not exist on the platform`); continue; }
    if (!specifier.startsWith('.')) continue;
    if (!/\.(?:js|json|mjs|cjs)$/.test(specifier)) { faults.push(`${where}: a relative import needs its ".js"`); continue; }
    const source = sourceOf(resolve(dirname(file), specifier));
    if (!source) { faults.push(`${where}: no such file`); continue; }
    if (/\.(?:ts|tsx|mts|js|mjs)$/.test(source)) visit(source);
  }
};
const all = entries();
for (const file of all) visit(file);
assert.deepEqual(faults, [], 'every import a function can reach is one the platform can resolve');
checks++;
ok(all.length > 50 && seen.size > all.length, `${all.length} functions, ${seen.size} files reachable from them`);

// ---- 2 and 3. load them: once with placeholder settings, once with none ----
const SETTINGS = /^(?:BOBBY_|SUPABASE|VITE_|NEXT_PUBLIC_|SB_|ANTHROPIC|OPENAI|RATE_LIMIT|CRON|OKX|REVENUECAT|RESEND|AMPLITUDE|APPLE|GOOGLE|TELEGRAM|BASE_|STRIPE|UPSTASH|KV_|ADMIN|PUSH|APNS|VERCEL)/;
const bare = Object.fromEntries(Object.entries(process.env).filter(([key]) => !SETTINGS.test(key)));
const load = (env: Record<string, string | undefined>): Record<string, string> => {
  const run = spawnSync(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--load'], { cwd: ROOT, env: env as NodeJS.ProcessEnv, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 240_000 });
  const found = /@@(\{.*\})@@/s.exec(run.stdout ?? '');
  assert.ok(found, `the loader did not finish: ${String(run.stderr ?? '').slice(-400)}`);
  return JSON.parse(found![1]);
};
const placeholders = { ...bare, BOBBY_SUPABASE_URL: 'https://settings.invalid', BOBBY_SUPABASE_ANON_KEY: 'placeholder', BOBBY_SUPABASE_SERVICE_ROLE_KEY: 'placeholder', RATE_LIMIT_SALT: 'placeholder-salt-placeholder-salt' };
const withSettings = load(placeholders);
assert.deepEqual(Object.fromEntries(Object.entries(withSettings).filter(([file]) => !OTHER_SHAPE.has(file))), {}, 'with settings in place every function loads and exports a handler');
checks++;
const without = load(bare);
const unexpected = Object.fromEntries(Object.entries(without).filter(([file]) => !NEEDS_DATABASE_TO_LOAD.has(file) && !OTHER_SHAPE.has(file)));
assert.deepEqual(unexpected, {}, 'with no settings at all, no function outside the listed legacy routes fails to load (a preview must be able to start it)');
checks++;
const fixed = [...NEEDS_DATABASE_TO_LOAD].filter((file) => !(file in without));
assert.deepEqual(fixed, [], 'a route that now loads with no settings comes off the list');
checks++;
for (const name of ['companion-turn', 'desk-debate', 'explain', 'briefings', 'bobby-access', 'progress', 'trader-land', 'admin']) ok(!(`api/${name}.ts` in without), `api/${name}.ts starts with no settings`);

console.log(`functions-start: ${checks} checks passed (${all.length} functions, ${Object.keys(without).length - 1} legacy routes still need the database to load)`);
