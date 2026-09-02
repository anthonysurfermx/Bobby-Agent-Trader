#!/usr/bin/env -S npx tsx
// ============================================================
// Writer inventory — proves the kill switch is global (Codex review #2).
//
// Scans api/**/*.ts for anything that writes to Supabase or produces an
// external effect, and checks that the file consults the control flags:
//   - requireWritesOpen() / getBobbyControl() / writeFreezeSync() / guardWrite()
//     (guardWrite calls requireWritesOpen), or
//   - requireProtocolWriteSafety() / requireLegacyXLayerMode() /
//     isProtocolCutoverFrozenAsync() for on-chain writers.
// Files that legitimately write without the switch must be listed in
// EXEMPT with a reason. Exit 1 when an unlisted writer is uncovered.
//
// Run: npx tsx scripts/infra/writer-inventory.mts
// ============================================================
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const API = join(ROOT, 'api');

const WRITE_PATTERNS: Array<[string, RegExp]> = [
  ['postgrest write', /rest\/v1\/[A-Za-z_]+[^\n]*\n?[^\n]*method:\s*'(POST|PATCH|PUT|DELETE)'/],
  ['postgrest write (inline)', /method:\s*'(POST|PATCH|PUT|DELETE)'[^\n]*\n?[^\n]*rest\/v1\//],
  ['bobbyRest write', /bobbyRest\([^\n]*\n?[^\n]*method:\s*'(POST|PATCH|PUT|DELETE)'|method:\s*'(POST|PATCH|PUT|DELETE)'[^\n]*\n?[^\n]*bobbyRest\(/],
  ['supabase-js write', /\.from\('[A-Za-z_]+'\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\(/],
  ['supabase rpc', /\.rpc\(/],
  ['telegram send', /api\.telegram\.org\/bot[^\n]*\/(sendMessage|sendVoice|sendPhoto|sendDocument)|tgSend[A-Za-z]*\(/],
  ['twitter/x post', /api\.(twitter|x)\.com\/2\/tweets/],
  ['on-chain signer', /new\s+(ethers\.)?Wallet\(|walletClient|sendTransaction\(|\.connect\(signer\)/],
];
const COVERAGE = /requireWritesOpen\(|getBobbyControl\(|writeFreezeSync\(|guardWrite\(|requireProtocolWriteSafety\(|requireLegacyXLayerMode\(|isProtocolCutoverFrozenAsync\(|isProtocolCutoverFrozen\(|evaluateProtocolWriteSafety\(|assertWritesOpen\(/;

/** Writers that intentionally bypass the switch. Keep this list short and justified. */
const EXEMPT: Record<string, string> = {
  'api/_lib/rate-limit-persistent.ts': 'rate-limit counters in api_cache; must keep working while frozen (they protect the freeze itself)',
  'api/_lib/api-cache.ts': 'read-through cache rows in api_cache; no product data',
  'api/_lib/control.ts': 'reads bobby_control; it IS the switch',
  'api/_lib/wallet-session.ts': 'single-use nonces in api_cache; signing in must keep working so the UI can show the freeze notice',
  'api/wallet-session.ts': 'same as _lib/wallet-session.ts',
  'api/_lib/llm-health.ts': 'LLM health counters, diagnostic only',
  'api/_lib/agent-commerce-log.ts': 'append-only commerce log, diagnostic only',
  'api/telegram-webhook.ts': 'checks getBobbyControl() inline and answers 200 while frozen (Telegram would retry a 503)',
  'api/_lib/telegram.ts': 'library: senders are gated by their callers (telegram-deliver, webhook, cycles)',
  'api/_lib/telegram-bots.ts': 'library: bot registry, no writes of its own',
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

let uncovered = 0;
const rows: Array<[string, string, string]> = [];
for (const file of walk(API).sort()) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  const kinds = WRITE_PATTERNS.filter(([, re]) => re.test(src)).map(([k]) => k);
  if (kinds.length === 0) continue;
  const covered = COVERAGE.test(src);
  const exempt = EXEMPT[rel];
  const status = covered ? 'covered' : exempt ? `exempt — ${exempt}` : 'UNCOVERED';
  if (!covered && !exempt) uncovered += 1;
  rows.push([rel, kinds.join(', '), status]);
}
for (const [f, k, s] of rows) console.log(`${s.startsWith('UNCOVERED') ? '!!' : 'ok'} ${f.padEnd(42)} ${k.padEnd(40)} ${s}`);
console.log(`\n${rows.length} writers, ${uncovered} uncovered.`);
process.exit(uncovered === 0 ? 0 : 1);
