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
const AUTH_USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const AUTH_IDENTITY_ID = '99999999-8888-4777-8666-555555555555';
let identityDeleteStatus = 200;

globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init?.method || 'GET').toUpperCase();
  calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('api.openai.com')) return json(openai);
  if (url.includes('okx.com/api/v5/market/ticker')) return json({ code: '0', data: [{ last: '125' }] }); // long from 100 → target 120 hit
  if (url.includes('/api/protocol-record')) return json({ ok: true });
  if (url.endsWith('/auth/v1/user') && method === 'GET') return json({ id: AUTH_USER_ID, email: null, app_metadata: { provider: 'apple' } });
  if (url.includes('/auth/v1/admin/users/') && method === 'DELETE') return json({});
  if (url.includes('/rest/v1/bobby_identities')) {
    if (method === 'POST') return json([{ id: AUTH_IDENTITY_ID, auth_user_id: AUTH_USER_ID, wallet_address: null }]);
    if (method === 'DELETE') return json([], identityDeleteStatus);
  }
  if (url.includes('/rest/v1/forum_threads')) {
    if (method !== 'GET') return json({});
    // Apply the symbol filter like PostgREST would: eq is case-sensitive, ilike (no wildcard) is not.
    const q = new URL(url).searchParams;
    const eq = q.get('symbol')?.startsWith('eq.') ? q.get('symbol')!.slice(3) : null;
    const il = q.get('symbol')?.startsWith('ilike.') ? q.get('symbol')!.slice(6) : null;
    let rows = threadRows() as Array<{ symbol?: string }>;
    if (eq !== null) rows = rows.filter((r) => r.symbol === eq);
    if (il !== null) {
      // Real ilike semantics (Codex r4): `_` is any single char, `%` any run — so a bypass shows up here.
      const re = new RegExp('^' + il.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
      rows = rows.filter((r) => re.test(r.symbol || ''));
    }
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

const [identityLink, harnessMemory, harnessEvents, ghostWallet, checkpoint, bobbySignals, judgeMode, quoteGuard, mcpHttp, forumResolve, account] = await Promise.all([
  import('../api/identity-link.js'), import('../api/harness-memory.js'), import('../api/harness-events.js'),
  import('../api/ghost-wallet.js'), import('../api/checkpoint.js'), import('../api/bobby-signals.js'), import('../api/judge-mode.js'),
  import('../src/lib/base-swap/quote-guard.js'), import('../api/mcp-http.js'), import('../api/forum-resolve.js'), import('../api/account.js'),
]);
const INTERNAL = { 'x-internal-secret': 'test-internal-secret' };

// ---------- App Store account deletion: authenticated, origin-bound, ordered ----------
await check('account delete rejects an untrusted origin before any fetch', async () => {
  const n = since(); const { res, state } = recorder();
  await account.default(req('DELETE', {}, {}, { origin: 'https://evil.example' }), res);
  assert.equal(state.status, 403, JSON.stringify(state.body));
  assert.equal(calls.slice(n).length, 0);
});
await check('account delete requires a Supabase bearer before destructive calls', async () => {
  const n = since(); const { res, state } = recorder();
  await account.default(req('DELETE'), res);
  assert.equal(state.status, 401, JSON.stringify(state.body));
  assert.equal(calls.slice(n).filter((c) => c.method === 'DELETE').length, 0);
});
await check('account delete removes identity before the exact authenticated Auth user', async () => {
  const n = since(); const { res, state } = recorder();
  await account.default(req('DELETE', {}, {}, { authorization: 'Bearer valid-supabase-token' }), res);
  assert.equal(state.status, 200, JSON.stringify(state.body));
  const destructive = calls.slice(n).filter((c) => c.method === 'DELETE');
  assert.equal(destructive.length, 2, JSON.stringify(destructive));
  assert.ok(destructive[0].url.includes(`/rest/v1/bobby_identities?id=eq.${AUTH_IDENTITY_ID}`), destructive[0].url);
  assert.ok(destructive[0].url.includes(`auth_user_id=eq.${AUTH_USER_ID}`), destructive[0].url);
  assert.ok(destructive[1].url.endsWith(`/auth/v1/admin/users/${AUTH_USER_ID}`), destructive[1].url);
});
await check('account delete never removes Auth while Bobby data deletion failed', async () => {
  identityDeleteStatus = 500;
  try {
    const n = since(); const { res, state } = recorder();
    await account.default(req('DELETE', {}, {}, { authorization: 'Bearer valid-supabase-token' }), res);
    assert.equal(state.status, 503, JSON.stringify(state.body));
    const destructive = calls.slice(n).filter((c) => c.method === 'DELETE');
    assert.equal(destructive.length, 1, JSON.stringify(destructive));
    assert.ok(destructive[0].url.includes('/rest/v1/bobby_identities'), destructive[0].url);
  } finally {
    identityDeleteStatus = 200;
  }
});

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
await check('P1-2 SwapExecutor decodes approval, swap and revoke before wallet submission', async () => {
  const src = await readFile(new URL('../src/components/agent-radar/SwapExecutor.tsx', import.meta.url), 'utf8');
  assert.match(src, /assertApprovalCalldata\([\s\S]{0,250}sendAndConfirm\(quote\.tx\.approve\)/);
  assert.match(src, /assertSwapCalldata\([\s\S]{0,500}sendAndConfirm\(quote\.tx\.swap\)/);
  assert.match(src, /assertRevokeCalldata\([\s\S]{0,250}sendAndConfirm\(quote\.tx\.revoke\)/);
});
await check('P1-2 SwapConfirm decodes approval, swap and revoke before wallet submission', async () => {
  const src = await readFile(new URL('../src/components/adams/SwapConfirm.tsx', import.meta.url), 'utf8');
  assert.match(src, /assertApprovalCalldata\([\s\S]{0,250}sendAndConfirm\(execution\.approveTx\)/);
  assert.match(src, /assertSwapCalldata\([\s\S]{0,500}sendAndConfirm\(execution\.swapTx\)/);
  assert.match(src, /assertRevokeCalldata\([\s\S]{0,250}sendAndConfirm\(execution\.revokeTx\)/);
});
await check('P1 product copy describes the non-custodial Base swap flow truthfully', async () => {
  const src = await readFile(new URL('../src/components/companion/RiskNotice.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /This desk does not execute trades|Este desk no ejecuta operaciones/);
  assert.match(src, /prepare Base swap transaction data/);
  assert.match(src, /Tú revisas y firmas desde tu wallet/);
  assert.match(src, /never holds your funds or keys/);
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
await check('C-03 / r4 P2: ilike wildcards `_` and `%` are refused before any query', async () => {
  for (const bad of ['___', 'NVDA_', '%', 'N%c']) {
    const n = since(); const { res, state } = recorder();
    await mcpHttp.default(rpc('bobby_recommend', { symbol: bad }), res);
    const body = state.body as { error?: { message?: string } };
    assert.ok(body?.error?.message?.includes('symbol must match'), `${bad}: ${JSON.stringify(state.body)}`);
    assert.equal(urlsSince(n).filter((u) => u.includes('forum_threads')).length, 0, `${bad} reached the database`);
  }
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
await check('C-01 repo-wide (r4): every forum_threads READ, any call form, every api/** subdirectory', async () => {
  const { readdirSync } = await import('node:fs');
  const root = new URL('../api/', import.meta.url);
  // recursive: api/agents/**, api/network/**, api/_lib/** — not only the top level
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts')).map((f) => `api/${f}`);
  assert.ok(files.some((f) => f.startsWith('api/agents/')) && files.some((f) => f.startsWith('api/network/')), 'the walk reaches the subdirectories');
  const allow: Array<[string, RegExp, string]> = [
    ['api/my-threads.ts', /forum_threads\?\$\{filter\}/, 'owner-scoped: filter is owner_wallet from the session'],
    ['api/forum-resolve.ts', /forum_threads\?resolution=eq\.pending&entry_price/, 'the sweep resolves private cycles for their owner; on-chain gated on scope'],
  ];
  const WRITER = /method:\s*'(POST|PATCH|DELETE)'|sbInsert\(|sbPatch\(|\.insert\(|\.update\(|\.delete\(/;
  const offenders: string[] = [];
  for (const f of files) {
    const lines = (await readFile(new URL(`../${f}`, import.meta.url), 'utf8')).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].replace(/\/\/.*$/, '');
      if (!line.includes('forum_threads')) continue;
      const t = line.trim();
      if (t.startsWith('*') || t.startsWith('/*')) continue;
      // Statement-level: gather from this line to the terminating `;`, max 12 lines (a
      // trailing `{` is NOT a terminator — `fetch(url, {` continues with `method:` below).
      let stmt = ''; let j = i;
      while (j < lines.length && j < i + 12) { stmt += lines[j].replace(/\/\/.*$/, '') + '\n'; if (/;\s*$/.test(lines[j])) break; j += 1; }
      // Prose (error text, logs) is not a query. Anything else must be a KNOWN query form —
      // an unknown helper touching forum_threads is an offender too, so new patterns cannot slip by.
      if (/new Error\(|console\.(log|warn|error)\(|^\s*throw /m.test(stmt) && !/\/rest\/v1\/forum_threads|forum_threads\?/.test(stmt)) continue;
      const QUERY_FORM = /\/rest\/v1\/forum_threads|forum_threads\?|sbQuery\(\s*'forum_threads'|sbGet\(`forum_threads|\.from\(\s*'forum_threads'\)|queryThreads\(|sbInsert\(\s*'forum_threads'|sbPatch\(\s*'forum_threads'/;
      if (!QUERY_FORM.test(stmt)) { offenders.push(`${f}:${i + 1}: UNCLASSIFIED form — extend the scanner: ${t.slice(0, 90)}`); continue; }
      if (WRITER.test(stmt)) continue;
      if (stmt.includes('scope=eq.public')) continue;
      if (/forum_threads\?id=eq\./.test(stmt) || /`id=eq\.\$\{/.test(stmt)) continue;
      if (allow.some(([file, re]) => file === f && re.test(stmt))) continue;
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

// ---------- BP-09: cycle provenance is decided by the authorisation, never by missing columns ----------
await check('BP-09 cycleProvenance: wallet run private+owner, cron public, manual-without-operator private', async () => {
  const { cycleProvenance, buildCycleRow } = await import('../api/_lib/cycle-provenance.js');
  assert.deepEqual(cycleProvenance(true, '0xAbC', false), { owner_address: '0xabc', visibility: 'private' });
  assert.deepEqual(cycleProvenance(true, '0xAbC', true), { owner_address: '0xabc', visibility: 'private' }, 'a wallet run is private even with operator auth');
  assert.deepEqual(cycleProvenance(false, '', true), { owner_address: null, visibility: 'public' });
  assert.deepEqual(cycleProvenance(true, '', false), { owner_address: null, visibility: 'private' });
  assert.deepEqual(cycleProvenance(true, '', true), { owner_address: null, visibility: 'public' }, 'an operator-authorised manual run is a protocol cycle');
  const row = buildCycleRow({ status: 'completed', owner_address: '0xspoof', visibility: 'public' }, cycleProvenance(true, '0xReal', false));
  assert.deepEqual([row.owner_address, row.visibility], ['0xreal', 'private'], 'provenance always wins over whatever the data carried');
});
await check('BP-09 agent-run: every cycle write passes provenance; the history read is public-only', async () => {
  const src = await readFile(new URL('../api/agent-run.ts', import.meta.url), 'utf8');
  const calls = src.match(/logToSupabase\(/g) ?? [];
  assert.equal(calls.length, 5, 'four call sites + the definition');
  assert.equal((src.match(/logToSupabase\(provenance, /g) ?? []).length, 4, 'all four call sites carry the provenance');
  assert.match(src, /async function logToSupabase\(provenance: CycleProvenance, data/);
  assert.match(src, /body: JSON\.stringify\(buildCycleRow\(data, provenance\)\)/);
  assert.match(src, /const provenance = cycleProvenance\(isManual, walletAddress, !isManual \|\| hasOperatorAuth\)/);
  assert.match(src, /agent_cycles\?visibility=eq\.public&select=llm_reasoning/);
  const cycle = await readFile(new URL('../api/bobby-cycle.ts', import.meta.url), 'utf8');
  assert.match(cycle, /sbInsert\('agent_cycles', \{\n\s+started_at: new Date\(\)\.toISOString\(\),\n\s+status: 'running',\n\s+visibility: 'public'/);
  for (const f of ['api/harness-events.ts', 'api/protocol-heartbeat.ts', 'api/bobby-intel.ts', 'api/conviction-tiers.ts']) {
    const t = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const m of t.matchAll(/agent_cycles\?[^`'"\n]*/g)) assert.ok(m[0].includes('visibility=eq.public'), `${f}: unscoped agent_cycles read: ${m[0].slice(0, 80)}`);
  }
});

// ---------- BP-04: malformed dynamic controls fail CLOSED; env freeze is additive ----------
await check('BP-04 parseControlRecord: only explicit booleans open writes', async () => {
  const { parseControlRecord } = await import('../api/_lib/control.js');
  assert.equal(parseControlRecord({ write_freeze: false, canary: false }, 'edge-config').writeFreeze, false, 'well-formed explicit false opens');
  for (const bad of [null, [], 'x', 42, {}, { write_freeze: false }, { write_freeze: 'false', canary: false }, { write_freeze: false, canary: 'no' }, { write_freeze: 0, canary: false }, { write_freeze: false, canary: false, note: 7 }]) {
    const c = parseControlRecord(bad, 'edge-config');
    assert.equal(c.writeFreeze, true, `malformed ${JSON.stringify(bad)} must freeze`);
    assert.equal(c.canary, true); assert.equal(c.source, 'error');
  }
});
await check('BP-04 getBobbyControl: dynamic source decides; env flags can only ADD a freeze', async () => {
  const control = await import('../api/_lib/control.js');
  const prev = { src: process.env.BOBBY_CONTROL_SOURCE, ec: process.env.EDGE_CONFIG, fz: process.env.PROTOCOL_CUTOVER_FREEZE };
  process.env.BOBBY_CONTROL_SOURCE = 'edge-config';
  process.env.EDGE_CONFIG = 'https://edge-config.vercel.com/ecfg_test?token=tok';
  const realFetch = globalThis.fetch;
  const withRecord = (body: unknown, status = 200) => { globalThis.fetch = (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch; control.resetBobbyControlCache(); };
  try {
    delete process.env.PROTOCOL_CUTOVER_FREEZE;
    withRecord({ write_freeze: false, canary: false }); assert.equal((await control.getBobbyControl()).writeFreeze, false, 'explicit false opens');
    withRecord({}); assert.equal((await control.getBobbyControl()).writeFreeze, true, 'missing fields freeze');
    withRecord(null); assert.equal((await control.getBobbyControl()).writeFreeze, true, 'null freezes');
    withRecord([]); assert.equal((await control.getBobbyControl()).writeFreeze, true, 'array freezes');
    withRecord({ write_freeze: 'false', canary: false }); assert.equal((await control.getBobbyControl()).writeFreeze, true, 'string-valued freezes');
    withRecord({ write_freeze: false, canary: false }, 500); assert.equal((await control.getBobbyControl()).writeFreeze, true, 'unreadable freezes');
    process.env.PROTOCOL_CUTOVER_FREEZE = 'true';
    withRecord({ write_freeze: false, canary: false }); const c = await control.getBobbyControl();
    assert.equal(c.writeFreeze, true, 'env emergency freeze overrides a well-formed open'); assert.match(String(c.note), /env emergency freeze/);
    delete process.env.PROTOCOL_CUTOVER_FREEZE;
    withRecord({ write_freeze: true, canary: false }); process.env.PROTOCOL_CUTOVER_FREEZE = 'false';
    assert.equal((await control.getBobbyControl()).writeFreeze, true, 'env "false" never opens a dynamic freeze');
  } finally {
    globalThis.fetch = realFetch; control.resetBobbyControlCache();
    if (prev.src === undefined) delete process.env.BOBBY_CONTROL_SOURCE; else process.env.BOBBY_CONTROL_SOURCE = prev.src;
    if (prev.ec === undefined) delete process.env.EDGE_CONFIG; else process.env.EDGE_CONFIG = prev.ec;
    if (prev.fz === undefined) delete process.env.PROTOCOL_CUTOVER_FREEZE; else process.env.PROTOCOL_CUTOVER_FREEZE = prev.fz;
  }
});

// ---------- BP-08: redemption bound to the client and the request, with a fulfilment lifecycle ----------
await check('BP-08 challenge lifecycle: secret + identical request claim; replay returns the stored result; failure stays retryable', async () => {
  const ch = await import('../api/_lib/mcp-challenges.js');
  const realFetch = globalThis.fetch;
  // A tiny PostgREST emulation for mcp_payment_challenges honouring the filters the library relies on.
  const rows: Record<string, any>[] = [];
  const parseFilter = (u: URL) => {
    const f: Record<string, string> = {}; for (const [k, v] of u.searchParams) f[k] = v; return f;
  };
  const matches = (row: Record<string, any>, f: Record<string, string>) => {
    for (const [k, v] of Object.entries(f)) {
      if (k === 'select' || k === 'on_conflict') continue;
      if (k === 'or') {
        const ok = (v.includes('status.eq.pending') && row.status === 'pending') || (v.includes('status.eq.retryable_failure') && row.status === 'retryable_failure')
          || (v.includes('status.eq.in_progress') && row.status === 'in_progress' && row.consumed_at < decodeURIComponent(v.match(/consumed_at\.lt\.([^)]+)/)?.[1] ?? ''));
        if (!ok) return false; continue;
      }
      const [op, ...rest] = v.split('.'); const val = decodeURIComponent(rest.join('.'));
      if (op === 'eq' && String(row[k]) !== val) return false;
      if (op === 'gt' && !(String(row[k]) > val)) return false;
    }
    return true;
  };
  globalThis.fetch = (async (input: any, init?: any) => {
    const u = new URL(typeof input === 'string' ? input : input.url); const method = (init?.method || 'GET').toUpperCase();
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
    if (!u.pathname.includes('mcp_payment_challenges')) return json([]);
    const f = parseFilter(u);
    if (method === 'POST') { const r = { challenge_id: `c${rows.length + 1}`, status: 'pending', expires_at: new Date(Date.now() + 600_000).toISOString(), attempts: 0, ...JSON.parse(init.body) }; rows.push(r); return json([r]); }
    if (method === 'PATCH') { const patch = JSON.parse(init.body); const hit = rows.filter((r) => matches(r, f)); hit.forEach((r) => Object.assign(r, patch)); return json(hit); }
    return json(rows.filter((r) => matches(r, f)));
  }) as typeof fetch;
  try {
    const args = { thread_id: 't1', language: 'en' };
    const reqHash = ch.requestHashFor('bobby_judge', args);
    assert.equal(ch.requestHashFor('bobby_judge', { language: 'en', thread_id: 't1' }), reqHash, 'canonical: key order does not matter');
    assert.notEqual(ch.requestHashFor('bobby_judge', { ...args, language: 'es' }), reqHash, 'different terms, different hash');
    const issued = await ch.createChallenge('bobby_judge', '1000', reqHash, 'agent-x');
    assert.match(issued.clientSecret, /^[a-f0-9]{64}$/); assert.equal(rows[0].client_secret_hash, ch.sha256Hex(issued.clientSecret), 'only the hash is stored');
    // an unrelated client with the (public) tx hash but not the secret cannot redeem
    assert.equal((await ch.claimChallenge(issued.challengeId, '0xtx', '0xpayer', 'a'.repeat(64), reqHash)).outcome, 'refused');
    assert.equal(rows[0].status, 'pending', 'a refused claim consumes nothing');
    // the right client, but different terms → refused
    assert.equal((await ch.claimChallenge(issued.challengeId, '0xtx', '0xpayer', issued.clientSecret, ch.requestHashFor('bobby_judge', { ...args, language: 'es' }))).outcome, 'refused');
    // the right client, same request → claimed (in_progress)
    const claim = await ch.claimChallenge(issued.challengeId, '0xtx', '0xpayer', issued.clientSecret, reqHash);
    assert.equal(claim.outcome, 'claimed'); assert.equal(rows[0].status, 'in_progress');
    // tool failed → retryable, then the same client retries and is claimed again
    await ch.failChallenge(issued.challengeId, 'upstream 502'); assert.equal(rows[0].status, 'retryable_failure');
    assert.equal((await ch.claimChallenge(issued.challengeId, '0xtx', '0xpayer', issued.clientSecret, reqHash)).outcome, 'claimed', 'a failed fulfilment does not cost a second payment');
    // tool succeeded → completed; a retry by the same client is an idempotent replay with the stored result, no re-execution
    await ch.completeChallenge(issued.challengeId, { verdict: 'ok' }); assert.equal(rows[0].status, 'completed');
    const replay = await ch.claimChallenge(issued.challengeId, '0xtx', '0xpayer', issued.clientSecret, reqHash);
    assert.deepEqual(replay, { outcome: 'replay', result: { verdict: 'ok' } });
    // a stranger cannot even replay
    assert.equal((await ch.claimChallenge(issued.challengeId, '0xtx', '0xpayer', 'b'.repeat(64), reqHash)).outcome, 'refused');
  } finally { globalThis.fetch = realFetch; }
});
await check('BP-08 transports: both issue with the request hash + secret and redeem through claim/complete/fail', async () => {
  for (const f of ['api/mcp-http.ts', 'api/mcp-bobby.ts']) {
    const src = await readFile(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('atomicConsumeChallenge'), `${f}: the unbound consume is gone`);
    assert.match(src, /requestHashFor\(toolName, /, `${f}: request hash at issuance`);
    assert.match(src, /createChallenge\(\s*toolName,\s*fee\.feeWei,\s*requestHash,/, `${f}: challenge bound to the request`);
    assert.match(src, /x-challenge-secret/, `${f}: secret header`);
    assert.match(src, /claimChallenge\(effectiveChallengeId, txHash, verifiedPayment\.payer, clientSecret, requestHash\)/, `${f}: claim`);
    assert.match(src, /claim\.outcome === 'replay'/, `${f}: replay path`);
    assert.match(src, /failChallenge\(claimedChallengeId/, `${f}: failure path`);
    assert.match(src, /completeChallenge\(claimedChallengeId, result\)/, `${f}: completion path`);
  }
});

// ---------- BP-10: a failed registry read never authorises a write; owner changes need a transfer ----------
await check('BP-10 register: storage read failure → 502 and no write; owner change → 409 and no write', async () => {
  process.env.BOBBY_SUPABASE_URL = 'https://dummy.supabase.co';
  const { default: register } = await import('../api/agents/register.js');
  const realFetch = globalThis.fetch; const writes: string[] = [];
  const body = { agentId: 'agent-1', owner: '0x1111111111111111111111111111111111111111', name: 'A' };
  try {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url; const method = (init?.method || 'GET').toUpperCase();
      if (method !== 'GET' && /hardness_agents|rpc\/hardness_/.test(url)) writes.push(`${method} ${url}`); // registry writes only (the rate limiter's api_cache counter is not one)
      if (url.includes('hardness_agents') && method === 'GET') return new Response('boom', { status: 500 });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    let { res, state } = recorder();
    await register(req('POST', {}, body, INTERNAL), res);
    assert.equal(state.status, 502, JSON.stringify(state.body)); assert.deepEqual(writes, [], 'no write after a failed read');
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url; const method = (init?.method || 'GET').toUpperCase();
      if (method !== 'GET' && /hardness_agents|rpc\/hardness_/.test(url)) writes.push(`${method} ${url}`);
      if (url.includes('hardness_agents') && method === 'GET') return new Response(JSON.stringify([{ agent_id: 'agent-1', owner_address: '0x2222222222222222222222222222222222222222', version: 3 }]), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    ({ res, state } = recorder());
    await register(req('POST', {}, body, INTERNAL), res);
    assert.equal(state.status, 409, JSON.stringify(state.body)); assert.match(String((state.body as any).error), /transfer/); assert.deepEqual(writes, [], 'an owner change through registration writes nothing');
  } finally { globalThis.fetch = realFetch; }
});


// ---------- BP-13: the final action comes from the effective policy + proof state + validated size; LLM JSON is schema-checked ----------
{
  const { default: orchestrate, finalizeAction } = await import('../api/orchestrate.js');
  const ALL5 = { data_integrity: 5, adversarial_quality: 5, decision_logic: 5, risk_management: 5, calibration_alignment: 5, novelty: 5 };
  const ALL1 = { data_integrity: 1, adversarial_quality: 1, decision_logic: 1, risk_management: 1, calibration_alignment: 1, novelty: 1 };
  const baseFetch = globalThis.fetch;
  const prediction = { symbol: 'BTC', direction: 'long', entry: 100, target: 120, stop: 90, thesis: 'structured thesis with levels' };
  /** Per-role model answers + an optional agent row; records session patches. */
  const scenario = (opts: { judge?: Record<string, number>; cio?: unknown; agent?: Record<string, unknown> | null }) => {
    const patches: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input.url; const method = (init?.method || 'GET').toUpperCase();
      const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
      if (url.includes('api.openai.com')) {
        const system = String(JSON.parse(String(init?.body)).messages[0].content);
        let out: unknown;
        if (system.includes('Alpha Hunter')) out = { thesis: 'bullish structure', evidence: ['e1'], catalyst: 'c', conviction: 8 };
        else if (system.includes('Red Team')) out = { counterpoints: ['x'], biases_detected: ['recency'], failure_modes: ['gap'] };
        else if (system.includes('Bobby CIO')) out = opts.cio ?? { recommendation: 'execute', conviction: 8, rationale: 'ok', adjusted_entry: 100, adjusted_stop: 90 };
        else out = { dimensions: opts.judge ?? ALL5, biases_detected: [], recommendation: 'execute', rationale: 'r', red_flags: [] };
        return json({ choices: [{ message: { content: JSON.stringify(out) } }] });
      }
      if (url.includes('/rest/v1/hardness_agents') && method === 'GET') return json(opts.agent ? [opts.agent] : []);
      if (url.includes('/rest/v1/hardness_agent_sessions') && method === 'PATCH') { patches.push(JSON.parse(String(init?.body))); return json([]); }
      if (url.includes('/rest/v1/hardness_agent_sessions')) return json([{ session_id: 'x' }]);
      return baseFetch(input, init);
    }) as typeof fetch;
    return patches;
  };
  const run = async (body: Record<string, unknown>) => { const { res, state } = recorder(); await orchestrate(req('POST', {}, body, INTERNAL), res); return state; };
  const agentRow = (risk_policy_json: Record<string, unknown>) => ({ agent_id: 'a1', owner_address: '0x1111111111111111111111111111111111111111', name: 'A', risk_policy_json, status: 'active', version: 1 });
  try {
    await check('BP-13 no validated size → analysis only: a top score never becomes executable advice; session is `analysis`, not `proved`', async () => {
      const patches = scenario({});
      const s = await run({ agentId: 'anonymous', prediction });
      assert.equal(s.status, 200, JSON.stringify(s.body)); const b = s.body as any;
      assert.equal(b.hardnessScore, 100); assert.equal(b.modelAction, 'execute');
      assert.equal(b.decision, 'publish_only'); assert.equal(b.sizing.executable, false); assert.equal(b.sizing.notionalUsd, null);
      assert.match(b.finalActionReasons.join(' '), /no validated quantity/);
      assert.equal(b.proofState, 'analysis'); assert.equal(patches.at(-1)?.status, 'analysis');
    });
    await check('BP-13 default policy (proof required, advisory): sized + top score → human approval, never execute', async () => {
      scenario({});
      const b = (await run({ agentId: 'anonymous', prediction: { ...prediction, quantity: 1 } })).body as any;
      assert.equal(b.sizing.executable, true); assert.equal(b.sizing.notionalUsd, 100);
      assert.equal(b.decision, 'require_human_approval'); assert.match(b.finalActionReasons.join(' '), /requires on-chain proof; proof state is analysis/);
    });
    await check('BP-13 the reproduction: the policy sees the NOTIONAL, not the entry price (BTC at 83000, 0.001 units = $83 under a $1000 cap → execute in auto mode)', async () => {
      scenario({ agent: agentRow({ mode: 'auto', requireOnchainProof: false, maxNotionalUsd: 1000 }) });
      const b = (await run({ agentId: 'a1', prediction: { ...prediction, entry: 83000, target: 95000, stop: 78000, quantity: 0.001 } })).body as any;
      assert.equal(b.policyResult, 'allowed', b.policyReason); assert.equal(b.decision, 'execute'); assert.equal(b.sizing.notionalUsd, 83);
    });
    await check('BP-13 reduction: notional above maxNotionalUsd → reduce_size with the reduced notional', async () => {
      scenario({ agent: agentRow({ mode: 'auto', requireOnchainProof: false, maxNotionalUsd: 50 }) });
      const b = (await run({ agentId: 'a1', prediction: { ...prediction, quantity: 1 } })).body as any;
      assert.equal(b.policyResult, 'allowed_with_reduction'); assert.equal(b.decision, 'reduce_size'); assert.equal(b.sizing.reducedNotionalUsd, 50);
    });
    await check('BP-13 paper mode caps at paper_only; a blocked symbol is reject regardless of score', async () => {
      scenario({ agent: agentRow({ mode: 'paper', requireOnchainProof: false }) });
      let b = (await run({ agentId: 'a1', prediction: { ...prediction, quantity: 1 } })).body as any;
      assert.equal(b.decision, 'paper_only');
      scenario({ agent: agentRow({ mode: 'auto', requireOnchainProof: false, allowedSymbols: ['ETH'] }) });
      b = (await run({ agentId: 'a1', prediction: { ...prediction, quantity: 1 } })).body as any;
      assert.equal(b.policyResult, 'blocked'); assert.equal(b.decision, 'reject');
    });
    await check('BP-13 model output outside the schema aborts the session (502) instead of steering the decision', async () => {
      const patches = scenario({ cio: { recommendation: 'yolo', conviction: 42 } });
      const s = await run({ agentId: 'anonymous', prediction: { ...prediction, quantity: 1 } });
      assert.equal(s.status, 502, JSON.stringify(s.body)); assert.match(String((s.body as any).error), /CIO output rejected/);
      assert.equal(patches.at(-1)?.status, 'failed');
      const patches2 = scenario({ judge: { ...ALL5, novelty: 9 } });
      const s2 = await run({ agentId: 'anonymous', prediction: { ...prediction, quantity: 1 } });
      assert.equal(s2.status, 502); assert.match(String((s2.body as any).error), /Judge output rejected/); assert.equal(patches2.at(-1)?.status, 'failed');
    });
    await check('BP-13 sizing validation: inconsistent quantity/notional → 400; low score with a valid policy → reject', async () => {
      scenario({});
      const s = await run({ agentId: 'anonymous', prediction: { ...prediction, quantity: 1, notionalUsd: 500 } });
      assert.equal(s.status, 400); assert.match(String((s.body as any).error), /does not equal quantity x entry/);
      scenario({ judge: ALL1, agent: agentRow({ mode: 'auto', requireOnchainProof: false }) });
      const b = (await run({ agentId: 'a1', prediction: { ...prediction, quantity: 1 } })).body as any;
      assert.equal(b.hardnessScore, 20); assert.equal(b.decision, 'reject');
    });
    await check('BP-13 finalizeAction precedence table', async () => {
      const policy = (result: string, reason: string, p: Record<string, unknown> = {}) => ({ result, reason, policy: { minHardnessScore: 60, maxNotionalUsd: 1000, allowedSymbols: [], requireJudge: true, requireOnchainProof: false, mode: 'auto', ...p } }) as any;
      assert.equal(finalizeAction({ modelAction: 'execute', policy: policy('allowed', 'policy_pass'), proofState: 'analysis', executable: true }).action, 'execute');
      assert.equal(finalizeAction({ modelAction: 'execute', policy: policy('allowed', 'policy_pass', { requireOnchainProof: true }), proofState: 'proof_submitted', executable: true }).action, 'require_human_approval', 'a submitted-but-unconfirmed hash is not a proof');
      assert.equal(finalizeAction({ modelAction: 'execute', policy: policy('allowed', 'policy_pass', { requireOnchainProof: true }), proofState: 'proof_confirmed', executable: true }).action, 'execute');
      assert.equal(finalizeAction({ modelAction: 'execute', policy: policy('allowed', 'policy_pass', { requireOnchainProof: true }), proofState: 'proof_failed', executable: true }).action, 'require_human_approval');
      assert.equal(finalizeAction({ modelAction: 'reduce_size', policy: policy('paper_only', 'paper_mode', { mode: 'paper' }), proofState: 'proof_confirmed', executable: true }).action, 'paper_only');
      assert.equal(finalizeAction({ modelAction: 'execute', policy: policy('allowed_with_reduction', 'max_notional_exceeded'), proofState: 'proof_confirmed', executable: true }).action, 'reduce_size');
      assert.equal(finalizeAction({ modelAction: 'execute', policy: policy('blocked', 'judge_required'), proofState: 'proof_confirmed', executable: true }).action, 'reject');
      assert.equal(finalizeAction({ modelAction: 'publish_only', policy: policy('allowed', 'policy_pass'), proofState: 'analysis', executable: false }).action, 'publish_only');
    });
  } finally { globalThis.fetch = baseFetch; }
}

console.log(`remediation-r2: ${passed}/${passed} checks passed`);
