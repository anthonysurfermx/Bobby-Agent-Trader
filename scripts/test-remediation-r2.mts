// Final audit 2026-09-03 — remediation round 2, exploit-to-regression.
// Every case below is a request that SUCCEEDED as an attack against e20d2b8
// and must now be refused, plus the honest path next to it so the fix is not
// a tombstone. fetch is replaced with a recorder: no network, no database.
//
//   npm run test:remediation-r2
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { VercelRequest, VercelResponse } from '@vercel/node';

process.env.BOBBY_SUPABASE_URL = 'https://dummy.supabase.co';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-key';
process.env.BOBBY_SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.OPENAI_API_KEY = 'dummy-openai';
process.env.INTERNAL_API_SECRET = 'test-internal-secret';
process.env.XLAYER_RECORD_SECRET = 'test-record-secret'; // forum-resolve is guarded by requireRecordAuth
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://dummy.bobby';
delete process.env.PROTOCOL_CUTOVER_FREEZE;
delete process.env.BOBBY_WRITE_FREEZE;
delete process.env.BOBBY_CONTROL_SOURCE;

type Rec = { url: string; method: string; body?: string };
const calls: Rec[] = [];
const THREAD_ID = '11111111-2222-4333-8444-555555555555';
const thread = { id: THREAD_ID, scope: 'public', symbol: 'NVDAc', direction: 'long', conviction_score: 0.7, status: 'open', resolution: 'pending', entry_price: 100, stop_price: 90, target_price: 120, resolution_pnl_pct: null, created_at: new Date().toISOString(), trigger_reason: 'test', debate_quality: null, trigger_data: { technical: { rsi: 50 } } };
let threadRows: () => unknown[] = () => [thread];
const posts = ['alpha', 'redteam', 'cio'].map((agent, i) => ({ id: `p${i}`, thread_id: THREAD_ID, agent, agent_type: agent, agent_name: agent, role: agent, content: `${agent} says something`, body: `${agent} says something`, created_at: new Date().toISOString() }));
const openai = { choices: [{ message: { content: JSON.stringify({ dimensions: { data_integrity: 3, adversarial_quality: 3, decision_logic: 3, risk_management: 3, calibration_alignment: 3, novelty: 3 }, biases_detected: [], conviction_assessment: 'reasonable', recommendation: 'pass', rationale: 'fine', red_flags: [] }) } }] };

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init?.method || 'GET').toUpperCase();
  calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('api.openai.com')) return json(openai);
  if (url.includes('okx.com/api/v5/market/ticker')) return json({ code: '0', data: [{ last: '125' }] }); // long from 100 → target 120 hit
  if (url.includes('/api/protocol-record')) return json({ ok: true });
  if (url.includes('/rest/v1/forum_threads')) {
    if (method !== 'GET') return json({});
    // Apply the symbol filter like PostgREST would: eq is case-sensitive, ilike (no wildcard) is not.
    const q = new URL(url).searchParams;
    const eq = q.get('symbol')?.startsWith('eq.') ? q.get('symbol')!.slice(3) : null;
    const il = q.get('symbol')?.startsWith('ilike.') ? q.get('symbol')!.slice(6) : null;
    let rows = threadRows() as Array<{ symbol?: string }>;
    if (eq !== null) rows = rows.filter((r) => r.symbol === eq);
    if (il !== null) rows = rows.filter((r) => (r.symbol || '').toLowerCase() === il.toLowerCase());
    return json(rows);
  }
  if (url.includes('/rest/v1/forum_posts')) return json(posts);
  if (url.includes('/api/bobby-protocol-stats')) return json({ error: 'unavailable in test' }, 503); // checkpoint treats !ok as null
  return json([]); // agent_events / agent_cycles / memory_objects / api_cache / stats → empty, honest
}) as typeof fetch;

function recorder() {
  const state: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    status(c: number) { state.status = c; return res; },
    json(b: unknown) { state.body = b; return res; },
    send(b: unknown) { state.body = b; return res; },
    end() { return res; },
    setHeader(k: string, v: string | number) { state.headers[k.toLowerCase()] = String(v); return res; },
    getHeader(k: string) { return state.headers[k.toLowerCase()]; },
  } as unknown as VercelResponse;
  return { res, state };
}
function req(method: string, query: Record<string, string> = {}, body: Record<string, unknown> = {}, headers: Record<string, string> = {}): VercelRequest {
  return { method, query, body, headers: { 'x-forwarded-for': '203.0.113.10', origin: 'https://bobbyprotocol.xyz', ...headers }, url: '/' } as unknown as VercelRequest;
}
const since = () => calls.length;
const urlsSince = (n: number) => calls.slice(n).map((c) => c.url);

let passed = 0;
const check = (name: string, fn: () => void | Promise<void>) => Promise.resolve().then(fn).then(() => { passed += 1; console.log(`ok  ${name}`); });

const [identityLink, harnessMemory, harnessEvents, ghostWallet, checkpoint, bobbySignals, judgeMode, quoteGuard, mcpHttp, forumResolve] = await Promise.all([
  import('../api/identity-link.js'), import('../api/harness-memory.js'), import('../api/harness-events.js'),
  import('../api/ghost-wallet.js'), import('../api/checkpoint.js'), import('../api/bobby-signals.js'), import('../api/judge-mode.js'),
  import('../src/lib/base-swap/quote-guard.js'), import('../api/mcp-http.js'), import('../api/forum-resolve.js'),
]);
const INTERNAL = { 'x-internal-secret': 'test-internal-secret' };

// ---------- P0-1 / C-05: the pairing endpoint no longer issues or accepts codes ----------
await check('P0-1 identity-link issue → 410, no api_cache write', async () => {
  const n = since(); const { res, state } = recorder();
  await identityLink.default(req('POST', {}, { action: 'issue' }), res);
  assert.equal(state.status, 410);
  assert.equal(urlsSince(n).filter((u) => u.includes('api_cache')).length, 0);
});
await check('P0-1 identity-link claim → 410, no merge RPC', async () => {
  const n = since(); const { res, state } = recorder();
  await identityLink.default(req('POST', {}, { action: 'claim', code: 'K7QW2M' }), res);
  assert.equal(state.status, 410);
  assert.equal(urlsSince(n).filter((u) => u.includes('bobby_link_identities')).length, 0);
});

// ---------- C-03: PostgREST injection through harness filters ----------
await check('C-03 harness-memory refuses `kind=episode&select=id`', async () => {
  const n = since(); const { res, state } = recorder();
  await harnessMemory.default(req('GET', { kind: 'episode&select=id' }), res);
  assert.equal(state.status, 400);
  assert.equal(urlsSince(n).length, 0, 'no query was sent');
});
await check('C-03 harness-memory honest filter is encoded, never raw', async () => {
  const n = since(); const { res, state } = recorder();
  await harnessMemory.default(req('GET', { kind: 'episode', symbol: 'BTC-USD' }), res);
  assert.equal(state.status, 200);
  const [u] = urlsSince(n);
  assert.match(u, /memory_objects\?/);
  assert.match(u, /&kind=eq\.episode&symbol=eq\.BTC-USD/);
});
await check('C-03 harness-events refuses `type=x&select=id`', async () => {
  const n = since(); const { res, state } = recorder();
  await harnessEvents.default(req('GET', { type: 'cycle&select=id' }), res);
  assert.equal(state.status, 400);
  assert.equal(urlsSince(n).length, 0);
});

// ---------- P1-3 / C-01: every public forum_threads read is pinned to public scope ----------
const scoped = (n: number) => {
  const reads = calls.slice(n).filter((c) => c.url.includes('/rest/v1/forum_threads'));
  assert.ok(reads.length > 0, 'the handler read forum_threads');
  for (const c of reads) assert.ok(c.url.includes('scope=eq.public'), `unscoped read: ${c.url}`);
};
await check('C-01 ghost-wallet', async () => { const n = since(); const { res } = recorder(); await ghostWallet.default(req('GET'), res); scoped(n); });
await check('C-01 checkpoint', async () => { const n = since(); const { res } = recorder(); await checkpoint.default(req('GET'), res); scoped(n); });
await check('C-01 bobby-signals', async () => { const n = since(); const { res } = recorder(); await bobbySignals.default(req('GET'), res); scoped(n); });
await check('C-01 harness-events fallback', async () => { const n = since(); const { res } = recorder(); await harnessEvents.default(req('GET'), res); scoped(n); });
await check('C-01 judge-mode latest + by id (internal caller)', async () => {
  const n = since();
  await judgeMode.default(req('POST', {}, {}, INTERNAL), recorder().res);
  await judgeMode.default(req('POST', {}, { thread_id: THREAD_ID }, INTERNAL), recorder().res);
  scoped(n);
});
await check('C-01 mcp-http source: every forum_threads literal carries scope=eq.public', async () => {
  const src = await readFile(new URL('../api/mcp-http.ts', import.meta.url), 'utf8');
  const literals = src.match(/forum_threads\?[^`'"]*/g) ?? [];
  assert.ok(literals.length >= 2);
  for (const l of literals) assert.ok(l.includes('scope=eq.public'), `unscoped literal in mcp-http.ts: ${l}`);
});

// ---------- P1-3: judge-mode persists only for internal callers ----------
await check('P1-3 / Codex r2 #3: public judge-mode → 401, no model call, no write', async () => {
  const n = since(); const { res, state } = recorder();
  await judgeMode.default(req('POST', {}, { thread_id: THREAD_ID }), res);
  assert.equal(state.status, 401, JSON.stringify(state.body));
  assert.equal(calls.slice(n).length, 0, 'nothing was fetched — no OpenAI, no Supabase');
});
await check('P1-3 internal judge-mode persists, and only to a public thread', async () => {
  const n = since(); const { res, state } = recorder();
  await judgeMode.default(req('POST', {}, { thread_id: THREAD_ID }, { 'x-internal-secret': 'test-internal-secret' }), res);
  assert.equal(state.status, 200, JSON.stringify(state.body));
  const patches = calls.slice(n).filter((c) => c.method === 'PATCH');
  assert.equal(patches.length, 1);
  assert.ok(patches[0].url.includes('forum_threads') && patches[0].url.includes('scope=eq.public'), patches[0].url);
});

// ---------- P1-1: the swap card cannot sign a quote built for another amount ----------
await check('P1-1 quoteMatchesAmount', () => {
  const { quoteMatchesAmount } = quoteGuard;
  assert.equal(quoteMatchesAmount('25', '25'), true);
  assert.equal(quoteMatchesAmount('25', '25.0'), true);
  assert.equal(quoteMatchesAmount('25', ' 25 '), true);
  assert.equal(quoteMatchesAmount('25', '5'), false, 'the round-1 exploit: quote 25, type 5');
  assert.equal(quoteMatchesAmount('25', ''), false);
  assert.equal(quoteMatchesAmount('25', '0'), false);
  assert.equal(quoteMatchesAmount(null, '25'), false);
  assert.equal(quoteMatchesAmount('25', 'abc'), false);
});
await check('P1-1 SwapExecutor: amount edit resets the quote and executeSwap checks the guard', async () => {
  const src = await readFile(new URL('../src/components/agent-radar/SwapExecutor.tsx', import.meta.url), 'utf8');
  assert.match(src, /value=\{amount\} onChange=\{e => \{ setAmount\(e\.target\.value\); if \(step === 'quoted'\) reset\(\); \}\}/);
  assert.match(src, /if \(!quoteMatchesAmount\(quote\.amountIn, amount\)\)/);
});

// ---------- Codex r2 #4: mcp-http args.symbol injection ----------
const rpc = (name: string, args: Record<string, unknown>) => req('POST', {}, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { 'content-type': 'application/json' });
await check('C-03 mcp-http bobby_recommend refuses `symbol=NVDAc&select=id`', async () => {
  const n = since(); const { res, state } = recorder();
  await mcpHttp.default(rpc('bobby_recommend', { symbol: 'NVDAc&select=id' }), res);
  const body = state.body as { error?: { message?: string } };
  assert.ok(body?.error?.message?.includes('symbol must match'), JSON.stringify(state.body));
  assert.equal(urlsSince(n).filter((u) => u.includes('forum_threads')).length, 0, 'no thread query was sent');
});
await check('C-03 / r3 P2: `nvdac` finds the mixed-case NVDAc thread (ilike, no upper-casing)', async () => {
  const n = since(); const { res, state } = recorder();
  await mcpHttp.default(rpc('bobby_recommend', { symbol: 'nvdac' }), res);
  const reads = urlsSince(n).filter((u) => u.includes('forum_threads'));
  assert.ok(reads.length >= 1);
  for (const u of reads) { assert.ok(u.includes('symbol=ilike.nvdac'), u); assert.ok(!u.includes('NVDAC'), u); assert.ok(u.includes('scope=eq.public'), u); }
  const text = (state.body as { result?: { content?: Array<{ text?: string }> } })?.result?.content?.[0]?.text || '';
  assert.ok(text.includes('NVDAc'), `the tool answered with the thread, not an empty lookup: ${text.slice(0, 120)}`);
});
await check('C-03 mcp-http bobby_brief takes the same guard', async () => {
  const n = since(); const { res, state } = recorder();
  await mcpHttp.default(rpc('bobby_brief', { symbol: 'x%26select=id' }), res);
  const body = state.body as { error?: { message?: string } };
  assert.ok(body?.error?.message?.includes('symbol must match'), JSON.stringify(state.body));
  assert.equal(urlsSince(n).filter((u) => u.includes('forum_threads')).length, 0);
});

// ---------- Codex r2 #1: forum-resolve resolves private threads but never records them on-chain ----------
await check('C-01 forum-resolve: private cycle resolved off-chain only, public one recorded', async () => {
  const pub = { ...thread, id: '11111111-2222-4333-8444-aaaaaaaaaaaa', scope: 'public', symbol: 'BTC', direction: 'long', entry_price: 100, target_price: 120, stop_price: 90, expires_at: new Date(Date.now() + 86_400_000).toISOString() };
  const priv = { ...pub, id: '11111111-2222-4333-8444-bbbbbbbbbbbb', scope: 'private' };
  threadRows = () => [pub, priv];
  try {
    const n = since(); const { res, state } = recorder();
    await forumResolve.default(req('POST', {}, {}, { 'x-record-secret': 'test-record-secret' }), res);
    assert.equal(state.status, 200, JSON.stringify(state.body));
    const patches = calls.slice(n).filter((c) => c.method === 'PATCH' && c.url.includes('forum_threads'));
    assert.equal(patches.length, 2, 'both threads were resolved (status written) — the user still gets the outcome');
    const records = calls.slice(n).filter((c) => c.url.includes('/api/protocol-record'));
    assert.equal(records.length, 1, 'exactly one on-chain record');
    assert.ok(records[0].body?.includes(pub.id), 'the recorded thread is the public one');
    assert.ok(!records[0].body?.includes(priv.id));
    // and the track record it computes is pinned to public threads
    const trackReads = calls.slice(n).filter((c) => c.method === 'GET' && c.url.includes('resolution=neq.pending'));
    for (const c of trackReads) assert.ok(c.url.includes('scope=eq.public'), c.url);
  } finally { threadRows = () => [thread]; }
});

// ---------- Codex r2 #1: repo-wide — every forum_threads read on a public path is pinned ----------
await check('C-01 repo-wide (r3): every forum_threads READ in any call form is scoped', async () => {
  const { readdirSync } = await import('node:fs');
  const root = new URL('../api/', import.meta.url);
  const files = [...readdirSync(root).filter((f) => f.endsWith('.ts')).map((f) => `api/${f}`), ...readdirSync(new URL('_lib/', root)).filter((f) => f.endsWith('.ts')).map((f) => `api/_lib/${f}`)];
  // Reads that legitimately touch private rows — file + a reason. Anything else must be scoped.
  const allow: Array<[string, RegExp, string]> = [
    ['api/my-threads.ts', /forum_threads\?\$\{filter\}/, 'owner-scoped: filter is owner_wallet from the session'],
    ['api/forum-resolve.ts', /forum_threads\?resolution=eq\.pending&entry_price/, 'the sweep resolves private cycles for their owner; on-chain gated on scope'],
  ];
  const WRITER = /method:\s*'(POST|PATCH|DELETE)'|sbInsert\(|sbPatch\(|\.insert\(|\.update\(|\.delete\(/;
  const offenders: string[] = [];
  for (const f of files) {
    const lines = (await readFile(new URL(`../${f}`, import.meta.url), 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\/\/.*$/, '');                                          // drop trailing comments
      if (!line.includes('forum_threads')) continue;
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('/*')) continue;                                  // block comments
      if (/forum_threads\.(id|trigger_data)|forum_threads\/forum_posts|forum_threads insert/.test(line)) continue; // prose / error strings
      const window = lines.slice(i, i + 4).join('\n');                                       // helper calls put the query on the next line
      if (WRITER.test(window)) continue;                                                       // inserts / patches are not reads
      if (window.includes('scope=eq.public')) continue;
      if (/forum_threads\?id=eq\./.test(window) || /`id=eq\.\$\{/.test(window)) continue;       // single row by id
      if (allow.some(([file, re]) => file === f && re.test(window))) continue;
      offenders.push(`${f}:${i + 1}: ${t.slice(0, 100)}`);
    }
  }
  assert.deepEqual(offenders, [], `unscoped forum_threads reads:\n  ${offenders.join('\n  ')}`);
});

// ---------- Codex r3 P2: hardness-test refuses incoherent levels before spending model calls ----------
await check('r3 P2 hardness-test: long with stop above entry → 400, zero fetches', async () => {
  const { default: hardnessTest } = await import('../api/hardness-test.js');
  const n = since(); const { res, state } = recorder();
  await hardnessTest(req('POST', {}, { prediction: { symbol: 'BTC', direction: 'long', entry: 100, target: 110, stop: 120, thesis: 'x' }, commitOnchain: true }, INTERNAL), res);
  assert.equal(state.status, 400, JSON.stringify(state.body));
  // the persistent rate limiter may touch api_cache; what must NOT happen is any model or chain call
  const spent = calls.slice(n).filter((c) => c.url.includes('api.openai.com') || c.url.includes('/api/protocol-record') || c.url.includes('rpc'));
  assert.deepEqual(spent, [], 'no model call, no on-chain call for a rejected geometry');
});
await check('r3 P2 hardness-test: levelGeometryError is the same rule the registry enforces', async () => {
  const { levelGeometryError } = await import('../api/hardness-test.js');
  assert.equal(levelGeometryError('long', 100, 110, 90), null);
  assert.equal(levelGeometryError('short', 100, 90, 110), null);
  assert.match(levelGeometryError('long', 100, 110, 120) || '', /target > entry > stop/);
  assert.match(levelGeometryError('short', 100, 90, 80) || '', /target < entry < stop/);
  assert.match(levelGeometryError('long', 100, 100, 90) || '', /target > entry > stop/);
  assert.match(levelGeometryError('sideways', 100, 110, 90) || '', /long or short/);
});

console.log(`remediation-r2: ${passed}/${passed} checks passed`);
