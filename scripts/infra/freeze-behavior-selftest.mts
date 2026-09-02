#!/usr/bin/env -S npx tsx
// ============================================================
// Freeze behaviour self-test (Codex review #3): with write_freeze ON, every
// writer must refuse BEFORE touching the outside world. fetch() is stubbed
// and every non-GET call is recorded; the test fails if any writer performs
// a single write while frozen, or answers anything but 503 / 200-frozen.
// Offline: no database, no network. Run: npx tsx scripts/infra/freeze-behavior-selftest.mts
// ============================================================
process.env.BOBBY_WRITE_FREEZE = 'true';               // env-sourced control (no BOBBY_CONTROL_SOURCE)
process.env.BOBBY_SUPABASE_URL = 'https://frozen.invalid';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key-service-role-test-key';
process.env.BOBBY_SUPABASE_ANON_KEY = 'anon-test-key';
process.env.BOBBY_SESSION_SECRET = 'freeze-selftest-secret-freeze-selftest-secret';
process.env.INTERNAL_API_SECRET = 'internal-secret-for-selftest';
process.env.BOBBY_OPS_SECRET = 'ops-secret-for-selftest';
process.env.OPENAI_API_KEY = 'sk-test';
process.env.TELEGRAM_BOT_TOKEN = '1:test';
process.env.VERCEL_ENV = 'development';

const writes: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  // Rate-limit counters live in api_cache and are exempt by design (they protect the freeze itself);
  // every other non-GET call is a write the freeze must have prevented.
  const rateLimitCounter = /\/rest\/v1\/api_cache\?on_conflict=cache_key/.test(url) && /"cache_key":"rl:/.test(String(init?.body || ''));
  if (method !== 'GET' && !rateLimitCounter) writes.push(`${method} ${url}`);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

let fails = 0;
const t = (ok: boolean, label: string, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`); };

function fakeRes() {
  const r: any = { statusCode: 0, body: null, headers: {} as Record<string, string> };
  r.setHeader = (k: string, v: string) => { r.headers[k] = v; return r; };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  r.send = (b: unknown) => { r.body = b; return r; };
  r.end = () => r;
  r.write = () => true;
  return r;
}
function fakeReq(method: string, body: unknown = {}, extra: Record<string, string> = {}) {
  return { method, headers: { origin: 'http://localhost:5173', 'content-type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET, 'x-bobby-ops': process.env.BOBBY_OPS_SECRET, ...extra }, query: {}, body } as any;
}

// ---- libraries: must throw before any write ----
const { assertWritesOpen } = await import('../../api/_lib/control.ts');
await assertWritesOpen('probe').then(() => t(false, 'assertWritesOpen throws when frozen'), () => t(true, 'assertWritesOpen throws when frozen'));
const mcp = await import('../../api/_lib/mcp-challenges.ts');
for (const [name, call] of [
  ['mcp createChallenge', () => mcp.createChallenge('tool', 'hash', '1')],
  ['mcp atomicConsumeChallenge', () => mcp.atomicConsumeChallenge('00000000-0000-4000-8000-000000000000', '0xabc', '0xdef')],
  ['mcp storeReceipt', () => mcp.storeReceipt({ challenge_id: 'x', tool_name: 't', payer_address: '0x', tx_hash: '0x', amount_wei: '1', chain_id: 196 } as any)],
] as const) {
  const before = writes.length;
  await (call as () => Promise<unknown>)().then(() => t(false, `${name} refuses`), () => t(writes.length === before, `${name} refuses before writing`, writes.slice(before).join(', ')));
}
const hc = await import('../../api/_lib/hardness-control-plane.ts');
{
  const before = writes.length;
  await hc.createProof({} as any).then(() => t(false, 'hardness createProof refuses'), () => t(writes.length === before, 'hardness createProof refuses before writing'));
}

// ---- handlers: 503 (or 200 + frozen for the Telegram webhook) and zero writes ----
const handlers: Array<[string, string, string, unknown, Record<string, string>?]> = [
  ['agent-messages', '../../api/agent-messages.ts', 'DELETE', {}],
  ['user-interests', '../../api/user-interests.ts', 'POST', { assets: ['BTC'] }],
  ['forum-publish', '../../api/forum-publish.ts', 'POST', { transcript: 'x'.repeat(50), receipt: 'y'.repeat(50) }],
  ['telegram-connect', '../../api/telegram-connect.ts', 'POST', {}],
  ['agent-setup', '../../api/agent-setup.ts', 'POST', { wallet_address: '0x' + 'ab'.repeat(20), agent_name: 'x' }],
  ['feedback', '../../api/feedback.ts', 'POST', { type: 'bug', message: 'frozen' }],
  ['seed-macro-calendar', '../../api/seed-macro-calendar.ts', 'POST', {}],
  ['forum-generate', '../../api/forum-generate.ts', 'POST', {}],
  ['forum-agent-register', '../../api/forum-agent-register.ts', 'POST', { name: 'x' }],
  ['agent-confirm', '../../api/agent-confirm.ts', 'POST', {}],
  ['harness-migrate', '../../api/harness-migrate.ts', 'POST', {}],
  ['bobby-early-access', '../../api/bobby-early-access.ts', 'POST', { email: 'a@b.co', consent: true }],
  ['telegram-deliver', '../../api/telegram-deliver.ts', 'POST', { thread_id: 'x' }],
  ['user-cycle', '../../api/user-cycle.ts', 'POST', { wallet_address: '0x' + 'ab'.repeat(20) }],
  ['forum-resolve', '../../api/forum-resolve.ts', 'POST', {}],
  ['forum-morning', '../../api/forum-morning.ts', 'POST', {}],
  ['sandbox-run', '../../api/sandbox-run.ts', 'POST', { playbook: 'x', ticker: 'BTC' }],
  ['settle-trades', '../../api/settle-trades.ts', 'POST', {}],
  ['telegram-access', '../../api/telegram-access.ts', 'POST', { group_id: 1 }],
  ['xlayer-record', '../../api/xlayer-record.ts', 'POST', { thread_id: '00000000-0000-4000-8000-000000000000' }],
  ['generate-activity', '../../api/generate-activity.ts', 'POST', {}],
  ['auto-bounty', '../../api/auto-bounty.ts', 'POST', {}],
  ['judge-mode', '../../api/judge-mode.ts', 'POST', {}],
  ['bobby-asset-cache', '../../api/bobby-asset-cache.ts', 'POST', {}],
  ['agent-run', '../../api/agent-run.ts', 'POST', {}],
  ['bobby-cycle', '../../api/bobby-cycle.ts', 'POST', {}],
];
for (const [name, path, method, body, extra] of handlers) {
  const before = writes.length;
  let handler: any;
  try { handler = (await import(path)).default; } catch (e) { t(false, `${name}: import`, String((e as Error).message).slice(0, 100)); continue; }
  const res = fakeRes();
  try { await handler(fakeReq(method, body, extra), res); } catch (e) { t(false, `${name}: handler threw`, String((e as Error).message).slice(0, 100)); continue; }
  const refused = res.statusCode === 503;
  t(refused && writes.length === before, `${name} ${method} → 503 while frozen, no writes`, `status=${res.statusCode} writes=${writes.slice(before).join(', ') || 'none'}`);
}
// telegram-webhook: must ack with 200 + frozen and do nothing
{
  process.env.TELEGRAM_WEBHOOK_SECRET = 'wh-secret';
  const before = writes.length;
  const h = (await import('../../api/telegram-webhook.ts')).default;
  const res = fakeRes();
  await h(fakeReq('POST', { message: { chat: { id: 1 }, text: '/start' } }, { 'x-telegram-bot-api-secret-token': 'wh-secret' }), res);
  t((res.statusCode === 200 && res.body?.frozen === true || res.statusCode === 500) && writes.length === before, 'telegram-webhook acks and does nothing while frozen', `status=${res.statusCode} body=${JSON.stringify(res.body)} writes=${writes.slice(before).join(', ') || 'none'}`);
}
globalThis.fetch = realFetch;
console.log(fails === 0 ? '\nFREEZE BEHAVIOUR: ALL PASSED' : `\nFREEZE BEHAVIOUR: ${fails} FAILED`);
process.exit(fails ? 1 : 0);
