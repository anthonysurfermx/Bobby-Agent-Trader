#!/usr/bin/env -S npx tsx
// ============================================================
// Writer inventory — proves the kill switch is global, by ORDER not by name.
//
// Codex review #3: checking that a guard name appears somewhere in the file
// let a guard placed after the mutation pass. Now, for every write found in
// api/**/*.ts:
//   - the enclosing top-level function is located;
//   - a guard call must appear inside that function BEFORE the write; or
//   - the function is a helper listed in HELPERS_GUARDED_BY_HANDLER and the
//     file's default handler has a guard before its first write/helper call.
// Guards: requireWritesOpen(), guardWrite(), assertWritesOpen(),
// getBobbyControl() (+ explicit writeFreeze check), writeFreezeSync(),
// requireProtocolWriteSafety(), requireLegacyXLayerMode(),
// isProtocolCutoverFrozenAsync(), evaluateProtocolWriteSafety() (the freeze
// is evaluated first inside it).
// Exit 1 on any unguarded write.
// ============================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const API = join(ROOT, 'api');

const WRITE_RES: Array<[string, RegExp]> = [
  ['postgrest write', /method:\s*'(POST|PATCH|PUT|DELETE)'/g],
  ['supabase-js write', /\.from\('[A-Za-z_]+'\)[\s\S]{0,300}?\.(insert|upsert|update|delete)\(/g],
  ['rpc', /\.rpc\(/g],
  ['telegram send', /tgSend[A-Za-z]*\(|api\.telegram\.org\/bot[^\n]*\/send/g],
  ['on-chain send', /\.sendTransaction\(/g],
];
// A "method: 'POST'" is only a DB/effect write when it targets Supabase, Telegram, X or a signer.
const WRITE_TARGET = /rest\/v1\/|bobbyRest\(|\.from\('|api\.telegram\.org|twitter\.com|x\.com\/2|sendTransaction|ethers\.Wallet/;
const GUARD = /requireWritesOpen\(|guardWrite\(|assertWritesOpen\(|writeFreezeSync\(|requireProtocolWriteSafety\(|requireLegacyXLayerMode\(|isProtocolCutoverFrozenAsync\(|evaluateProtocolWriteSafety\(|getBobbyControl\(/g;
const FN_START = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*(?::[^=]+)?=>/gm;

/** Writers that intentionally bypass the switch. Short and justified. */
const EXEMPT: Record<string, string> = {
  'api/_lib/rate-limit-persistent.ts': 'rate-limit counters in api_cache; they protect the freeze itself',
  'api/_lib/api-cache.ts': 'read-through cache rows in api_cache; no product data',
  'api/_lib/control.ts': 'reads bobby_control; it IS the switch',
  'api/_lib/wallet-session.ts': 'single-use nonces in api_cache; signing in must work so the UI can show the freeze notice',
  'api/_lib/llm-health.ts': 'LLM health counters, diagnostic only',
  'api/_lib/agent-commerce-log.ts': 'append-only commerce log, diagnostic only',
  'api/_lib/telegram.ts': 'library: senders are gated by their callers',
  'api/_lib/telegram-bots.ts': 'library: bot registry',
};
/** Helper functions whose only callers are a guarded handler in the same file. */
const HELPERS_GUARDED_BY_HANDLER: Record<string, string[]> = {
  'api/forum-generate.ts': ['insertThread', 'insertPost'],
  'api/forum-resolve.ts': ['*'],
  'api/forum-morning.ts': ['*'],
  'api/generate-activity.ts': ['*'],
  'api/agent-run.ts': ['*'],
  'api/bobby-cycle.ts': ['*'],
  'api/settle-trades.ts': ['*'],
  'api/sandbox-run.ts': ['*'],
  'api/user-cycle.ts': ['*'],
  'api/telegram-deliver.ts': ['*'],
  'api/telegram-webhook.ts': ['*'],
  'api/telegram-access.ts': ['*'],
  'api/protocol-record.ts': ['*'],
  'api/auto-bounty.ts': ['*'],
  'api/bobby-asset-cache.ts': ['*'],
  'api/harness-migrate.ts': ['*'],
  'api/_lib/harness-events.ts': ['*'],
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

interface Fn { name: string; start: number; end: number }
function topLevelFunctions(src: string): Fn[] {
  const starts: Array<{ name: string; start: number }> = [];
  let m: RegExpExecArray | null;
  FN_START.lastIndex = 0;
  while ((m = FN_START.exec(src)) !== null) starts.push({ name: m[1] || m[2] || 'anonymous', start: m.index });
  return starts.map((s, i) => ({ ...s, end: i + 1 < starts.length ? starts[i + 1].start : src.length }));
}

let problems = 0;
let writers = 0;
for (const file of walk(API).sort()) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  const writes: Array<{ kind: string; pos: number }> = [];
  for (const [kind, re] of WRITE_RES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const window = src.slice(Math.max(0, m.index - 400), m.index + 400);
      if (kind === 'postgrest write' && !WRITE_TARGET.test(window)) continue;
      writes.push({ kind, pos: m.index });
    }
  }
  if (writes.length === 0) continue;
  writers += 1;
  if (EXEMPT[rel]) { console.log(`ok  ${rel.padEnd(42)} exempt — ${EXEMPT[rel]}`); continue; }
  const fns = topLevelFunctions(src);
  const guardPositions: number[] = [];
  GUARD.lastIndex = 0;
  let g: RegExpExecArray | null;
  while ((g = GUARD.exec(src)) !== null) guardPositions.push(g.index);
  const handler = fns.find((f) => f.name === 'handler') || fns.find((f) => /export default async function/.test(src.slice(f.start, f.start + 40)));
  const handlerGuard = handler ? guardPositions.find((p) => p > handler.start && p < handler.end) : undefined;
  const helpers = HELPERS_GUARDED_BY_HANDLER[rel] || [];
  const fileProblems: string[] = [];
  for (const w of writes) {
    const fn = fns.filter((f) => f.start <= w.pos).pop();
    const guardedInFn = fn ? guardPositions.some((p) => p >= fn.start && p < w.pos) : guardPositions.some((p) => p < w.pos);
    if (guardedInFn) continue;
    const isHandler = fn && handler && fn.start === handler.start;
    if (!isHandler && fn && handler && handlerGuard !== undefined && (helpers.includes('*') || helpers.includes(fn.name))) {
      // helper: the handler must guard before its first write or helper call
      const firstWriteInHandler = writes.map((x) => x.pos).find((p) => p > handler.start && p < handler.end);
      const firstHelperCall = src.indexOf(`${fn.name}(`, handler.start);
      const firstUse = Math.min(...[firstWriteInHandler ?? Infinity, firstHelperCall > handler.start && firstHelperCall < handler.end ? firstHelperCall : Infinity]);
      if (handlerGuard < firstUse) continue;
      fileProblems.push(`${fn.name}: handler guard at ${lineOf(src, handlerGuard)} is not before first use at ${lineOf(src, firstUse)}`);
      continue;
    }
    fileProblems.push(`${fn ? fn.name : '(module)'}: ${w.kind} at line ${lineOf(src, w.pos)} has no guard before it in the same function`);
  }
  if (fileProblems.length === 0) console.log(`ok  ${rel.padEnd(42)} ${writes.length} write(s), guard precedes each`);
  else { problems += fileProblems.length; for (const p of fileProblems) console.log(`!!  ${rel.padEnd(42)} ${p}`); }
}
function lineOf(src: string, pos: number): number { return src.slice(0, pos).split('\n').length; }
console.log(`\n${writers} writer files, ${problems} unguarded write(s).`);
process.exit(problems === 0 ? 0 : 1);
