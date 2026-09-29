// Per-user memory without a network or a database (api/_lib/user-memory.ts, api/memory.ts, api/desk-debate.ts):
//   · readerContext keeps only explicit preferences and ask counts, and nothing when memory is off;
//   · /api/memory answers 401 to anonymous and wallet callers, validates every correction, and forgets one
//     asset or everything through the right RPC; storage failures are a JSON 503 whose logs never pair a
//     symbol with an identity;
//   · the desk gives the reader to the CIO only, for a signed-in Apple/Google account, never to the client
//     (only `personalized: true`); a stored horizon never changes sufficiency (nor the verdict); the stored
//     "risk" reaches the CIO only as explainRiskDepth, under a rule that forbids suitability and sizing; the ask is
//     recorded only after a delivered answer, never on a refusal, an outage or a guard rejection; anonymous
//     and wallet requests make no memory call at all, nor the iPhone app until it can show and delete memory;
//   · kill switch: without BOBBY_MEMORY=on the desk makes no memory call at all, while /api/memory still works.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
process.env.RATE_LIMIT_SALT = 'test-salt';
delete process.env.BOBBY_DESK_MODEL;
delete process.env.BOBBY_AUTH_URL;
process.env.BOBBY_MEMORY = 'on';

// waitUntil (@vercel/functions) reads the request context from this symbol: capture what the handler defers.
const deferred: Promise<unknown>[] = [];
(globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = { get: () => ({ waitUntil: (p: Promise<unknown>) => { deferred.push(p); } }) };
const settle = async () => { await Promise.all(deferred.splice(0)); };

const { readerContext, memoryPersonalizationOn, MEMORY_SUMMARY_TIMEOUT_MS } = await import('../api/_lib/user-memory.ts');
const { READER_RULE, horizonOf } = await import('../api/_lib/desk-debate.ts');
const { resetLlmSpendCache } = await import('../api/_lib/llm-usage.ts');
const { default: memoryHandler } = await import('../api/memory.ts');
const { default: deskHandler } = await import('../api/desk-debate.ts');

const original = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };
const H = 3600_000;
const IDENT = '0b8f0a52-0000-4000-8000-00000000c0de';
const AUTH_USER = 'a11ce000-0000-4000-8000-000000000001';

interface Call { url: string; body: any; headers: Record<string, string>; method: string }
let calls: Call[] = [];
type Reply = (call: Call) => Response | Promise<Response>;
function mock(reply: Reply) {
  calls = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const raw = init?.body ? String(init.body) : '';
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    const call: Call = { url: String(input), body, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])), method: init?.method ?? 'GET' };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
}
const memoryCalls = () => calls.filter((c) => /rpc\/bobby_memory_|bobby_user_(assets|prefs)/.test(c.url));
const authCalls = () => calls.filter((c) => c.url.includes('/auth/v1/user'));

const response = () => ({
  statusCode: 200, body: null as any, headers: {} as Record<string, string>, chunks: [] as string[], writableEnded: false, writableFinished: false,
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; this.writableEnded = true; this.writableFinished = true; return this; },
  on() { return this; }, flushHeaders() {}, write(c: string) { this.chunks.push(c); return true; }, end() { this.writableEnded = true; this.writableFinished = true; return this; },
  lines() { return this.chunks.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)); },
});
const SIGNED_IN = { authorization: 'Bearer good-apple-token' };

// ---- shared backend: identity, memory storage, rate limiter ----
let summaryReply: unknown = null;
let summaryDelayMs = 0;
let prefsRows: unknown[] = [];
let assetRows: unknown[] = [];
let storageDown = false;
function backend(c: Call): Response | Promise<Response> | null {
  if (c.url.includes('/rest/v1/api_cache')) return c.method === 'POST' ? json(null, 201) : json([]);
  if (c.url.includes('/auth/v1/user')) {
    return c.headers.authorization === SIGNED_IN.authorization
      ? json({ id: AUTH_USER, email: 'reader@example.com', app_metadata: { provider: 'apple' } })
      : json({ msg: 'bad token' }, 401);
  }
  if (c.url.includes('bobby_identities?on_conflict=auth_user_id')) return json([{ id: IDENT, auth_user_id: AUTH_USER, wallet_address: null }]);
  if (c.url.includes('bobby_identities?on_conflict=wallet_address')) return json([{ id: 'wallet-ident', auth_user_id: null, wallet_address: '0xabc' }]);
  if (c.url.includes('rpc/bobby_memory_summary')) {
    if (storageDown) return json({ message: 'down' }, 500);
    return summaryDelayMs ? new Promise((resolve) => setTimeout(() => resolve(json(summaryReply)), summaryDelayMs)) : json(summaryReply);
  }
  if (c.url.includes('rpc/bobby_memory_record')) return json(true);
  if (c.url.includes('rpc/bobby_memory_forget')) return storageDown ? json({ message: 'down' }, 500) : json(3);
  if (c.url.includes('bobby_user_prefs?on_conflict=identity_id')) return storageDown ? json({ message: 'down' }, 500) : new Response('', { status: 201 });
  if (c.url.includes('bobby_user_prefs?identity_id=eq.')) return storageDown ? json({ message: 'down' }, 500) : json(prefsRows);
  if (c.url.includes('bobby_user_assets?identity_id=eq.')) return storageDown ? json({ message: 'down' }, 500) : json(assetRows);
  return null;
}

try {
  // ---------- readerContext ----------
  const now = Date.parse('2026-09-29T12:00:00Z');
  const summary = (over: Record<string, unknown> = {}) => ({
    enabled: true, prefs: { horizon: 'month', experience: 'new', risk: null },
    top: [
      { symbol: 'NVDA', asks: 7, lastAskedAt: '2026-09-28T12:00:00.000Z', lastHorizon: 'week' },
      { symbol: 'BTC', asks: 3, lastAskedAt: '2026-09-20T12:00:00.000Z', lastHorizon: 'unspecified' },
      { symbol: 'SOL', asks: 1, lastAskedAt: '2026-09-29T10:00:00.000Z', lastHorizon: 'intraday' },
    ],
    thisAsset: { asks: 7, lastAskedAt: '2026-09-26T12:00:00.000Z', lastHorizon: 'week', asksThisWeek: 1 },
    ...over,
  }) as any;
  eq(readerContext(summary(), 'NVDA', now), {
    prefs: { horizon: 'month', experience: 'new' },
    thisAsset: { asks: 7, lastAskedDaysAgo: 3, lastHorizon: 'week', timesThisWeek: 2 },
    oftenAsks: [{ symbol: 'BTC', asks: 3 }],
  }, 'explicit preferences, this asset, and the others asked at least twice (not the asked one again)');
  eq(readerContext(summary(), 'NVDA', now, 'Anthony')?.firstName, 'Anthony', 'the first name reaches the CIO only with memory on');
  eq(readerContext(summary({ enabled: false }), 'NVDA', now, 'Anthony'), null, 'memory off: not even the name');
  eq(readerContext(summary({ thisAsset: { asks: 1, lastAskedAt: '2026-09-28T12:00:00.000Z', lastHorizon: 'unspecified' } }), 'NVDA', now)?.thisAsset?.timesThisWeek, 1, 'a summary without the weekly count reads as this question only');
  eq(readerContext(summary(), 'AMD', now)?.oftenAsks, [{ symbol: 'NVDA', asks: 7 }, { symbol: 'BTC', asks: 3 }], 'asking about another asset: NVDA is one they often look at');
  eq(readerContext(summary({ enabled: false }), 'NVDA', now), null, 'memory off: nothing reaches the model');
  eq(readerContext(null, 'NVDA', now), null, 'no summary: nothing');
  eq(readerContext(summary({ prefs: { horizon: null, experience: null, risk: null }, top: [], thisAsset: null }), 'NVDA', now), null, 'an empty memory is no reader at all');
  eq(readerContext(summary({ prefs: { horizon: null, experience: null, risk: 'high' }, top: [], thisAsset: null }), 'NVDA', now), { prefs: { explainRiskDepth: 'high' } }, 'the stored "risk" reaches the model as explainRiskDepth, never as "risk"');
  const keys = JSON.stringify(readerContext(summary(), 'NVDA', now));
  ok(!/lastAskedAt|firstAsked|identity|email|question/.test(keys), 'the reader carries no timestamps, identity or question');

  // ---------- kill switch ----------
  eq([memoryPersonalizationOn({ BOBBY_MEMORY: 'on' } as never), memoryPersonalizationOn({} as never), memoryPersonalizationOn({ BOBBY_MEMORY: 'true' } as never), memoryPersonalizationOn({ BOBBY_MEMORY: 'ON' } as never)], [true, false, false, false], "memory personalization is on only for BOBBY_MEMORY === 'on'");

  // ---------- /api/memory ----------
  const memReq = (method: string, headers: Record<string, string> = {}, extra: Record<string, unknown> = {}) =>
    ({ method, headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.7.0.1', ...headers }, query: {}, body: undefined, ...extra });
  const memMock = () => mock((c) => { const r = backend(c); if (r) return r; throw new Error(`Unexpected request ${c.url}`); });

  memMock();
  const anon = response();
  await memoryHandler(memReq('GET') as never, anon as never);
  eq([anon.statusCode, anon.body.code], [401, 'signin_required'], 'no account: 401');
  eq([authCalls().length, memoryCalls().length], [0, 0], '…without an identity or memory lookup');
  memMock();
  const walletRes = response();
  await memoryHandler(memReq('GET', { 'x-bobby-session': 'bws.wallet-session-token' }) as never, walletRes as never);
  eq([walletRes.statusCode, memoryCalls().length, calls.some((c) => c.url.includes('bobby_identities'))], [401, 0, false], 'a wallet session has no memory: 401, no lookup');
  memMock();
  const walletBearer = response();
  await memoryHandler(memReq('DELETE', { authorization: 'Bearer bws.wallet-session-token' }) as never, walletBearer as never);
  eq([walletBearer.statusCode, memoryCalls().length], [401, 0], 'a wallet bearer cannot delete anything');
  memMock();
  const badToken = response();
  await memoryHandler(memReq('GET', { authorization: 'Bearer expired' }) as never, badToken as never);
  eq([badToken.statusCode, memoryCalls().length], [401, 0], 'an expired account token: 401');
  memMock();
  const noOrigin = response();
  await memoryHandler({ method: 'DELETE', headers: { ...SIGNED_IN, origin: 'https://evil.example' }, query: {} } as never, noOrigin as never);
  eq([noOrigin.statusCode, memoryCalls().length], [403, 0], 'a write from an unknown origin is refused');
  memMock();
  const bareGet = response();
  prefsRows = []; assetRows = [];
  await memoryHandler({ method: 'GET', headers: { ...SIGNED_IN, 'x-forwarded-for': '10.7.0.3' }, query: {} } as never, bareGet as never);
  eq(bareGet.statusCode, 200, 'a same-origin GET without Origin or Referer still reads');
  memMock();
  const post = response();
  await memoryHandler(memReq('POST', SIGNED_IN) as never, post as never);
  eq(post.statusCode, 405, 'POST is not a method here');

  prefsRows = [{ horizon: 'month', experience: null, risk: 'low', memory_enabled: true }];
  assetRows = [{ symbol: 'NVDA', asks: 7, last_asked_at: '2026-09-28T12:00:00+00:00', last_horizon: 'week' }, { symbol: 'BTC', asks: 1, last_asked_at: '2026-09-01T12:00:00+00:00', last_horizon: 'unspecified' }];
  memMock();
  const got = response();
  await memoryHandler(memReq('GET', SIGNED_IN) as never, got as never);
  eq(got.statusCode, 200, 'a signed-in Apple/Google account sees its memory');
  eq(got.body, {
    enabled: true, prefs: { horizon: 'month', experience: null, risk: 'low' }, retentionDays: 90,
    assets: [{ symbol: 'NVDA', asks: 7, lastAskedAt: '2026-09-28T12:00:00.000Z', lastHorizon: 'week' }, { symbol: 'BTC', asks: 1, lastAskedAt: '2026-09-01T12:00:00.000Z', lastHorizon: 'unspecified' }],
  }, 'GET: enabled, preferences and every remembered asset');
  const assetsRead = calls.find((c) => c.url.includes('bobby_user_assets'))!;
  ok(assetsRead.url.includes(`identity_id=eq.${IDENT}`) && /last_asked_at=gte\./.test(assetsRead.url) && assetsRead.url.includes('limit=50'), 'only this account, only the last 90 days, at most 50');
  eq(got.headers['cache-control'], 'no-store', 'never cached');
  prefsRows = [];
  memMock();
  const empty = response();
  await memoryHandler(memReq('GET', SIGNED_IN) as never, empty as never);
  eq([empty.body.enabled, empty.body.prefs], [true, { horizon: null, experience: null, risk: null }], 'no preferences row: memory on, nothing set');
  delete process.env.BOBBY_MEMORY;
  memMock();
  const switchedOff = response();
  await memoryHandler(memReq('GET', SIGNED_IN) as never, switchedOff as never);
  eq([switchedOff.statusCode, switchedOff.body.enabled], [200, true], 'with the kill switch off, /api/memory still shows what is stored');
  memMock();
  const offDelete = response();
  await memoryHandler(memReq('DELETE', SIGNED_IN) as never, offDelete as never);
  eq([offDelete.statusCode, calls.some((c) => c.url.includes('rpc/bobby_memory_forget'))], [200, true], '…and still deletes it');
  process.env.BOBBY_MEMORY = 'on';

  for (const [body, why] of [
    [{ horizon: 'forever' }, 'an unknown horizon'], [{ risk: 'reckless' }, 'an unknown risk'], [{ experience: 'guru' }, 'an unknown experience'],
    [{ horizon: 'unspecified' }, "'unspecified' is not a preference"], [{ memoryEnabled: 'yes' }, 'a non-boolean switch'],
    [{ age: 30 }, 'an unknown field (nothing else is ever stored)'], [{}, 'an empty correction'], [null, 'no body'],
  ] as const) {
    memMock();
    const bad = response();
    await memoryHandler(memReq('PATCH', SIGNED_IN, { body: body }) as never, bad as never);
    eq([bad.statusCode, bad.body.code], [400, 'invalid_request'], `PATCH refuses ${why}`);
    ok(!calls.some((c) => c.method === 'POST' && c.url.includes('bobby_user_prefs')), `…and writes nothing (${why})`);
  }
  memMock();
  const patched = response();
  await memoryHandler(memReq('PATCH', SIGNED_IN, { body: { horizon: 'week', risk: null, memoryEnabled: false } }) as never, patched as never);
  eq(patched.statusCode, 200, 'a valid correction');
  const write = calls.find((c) => c.method === 'POST' && c.url.includes('bobby_user_prefs?on_conflict=identity_id'))!;
  ok(/resolution=merge-duplicates/.test(write.headers.prefer), 'an upsert that only touches the fields sent');
  eq([write.body.identity_id, write.body.horizon, write.body.risk, write.body.memory_enabled, 'experience' in write.body], [IDENT, 'week', null, false, false], 'horizon set, risk cleared, memory paused, experience untouched');
  ok(patched.body && Array.isArray(patched.body.assets), 'PATCH answers the memory after the change');

  memMock();
  const one = response();
  await memoryHandler(memReq('DELETE', SIGNED_IN, { query: { symbol: 'nvda' } }) as never, one as never);
  const forgetOne = calls.find((c) => c.url.includes('rpc/bobby_memory_forget'))!;
  eq([one.statusCode, forgetOne.body], [200, { p_identity: IDENT, p_symbol: 'NVDA' }], 'DELETE ?symbol=NVDA forgets that asset only');
  memMock();
  const all = response();
  await memoryHandler(memReq('DELETE', SIGNED_IN) as never, all as never);
  eq([all.statusCode, calls.find((c) => c.url.includes('rpc/bobby_memory_forget'))!.body], [200, { p_identity: IDENT, p_symbol: null }], 'DELETE without a symbol forgets everything');
  memMock();
  const badSymbol = response();
  await memoryHandler(memReq('DELETE', SIGNED_IN, { query: { symbol: 'NVDA;DROP' } }) as never, badSymbol as never);
  eq([badSymbol.statusCode, calls.some((c) => c.url.includes('rpc/bobby_memory_forget'))], [400, false], 'a malformed symbol forgets nothing');

  storageDown = true;
  const logged: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  for (const [method, extra] of [['GET', {}], ['DELETE', { query: { symbol: 'NVDA' } }], ['PATCH', { body: { horizon: 'long' } }]] as const) {
    memMock();
    const down = response();
    await memoryHandler(memReq(method, SIGNED_IN, extra) as never, down as never);
    eq([down.statusCode, down.body.code, typeof down.body.error], [503, 'memory_unavailable', 'string'], `${method} with storage down: a JSON 503`);
  }
  console.error = originalError;
  storageDown = false;
  ok(logged.length > 0 && logged.every((line) => !line.includes('NVDA') && !line.includes(IDENT)), 'the logs never carry a symbol or the identity');

  // ---------- the desk ----------
  const candles = Array.from({ length: 100 }, (_, i) => ({ ts: Date.now() - (100 - i) * H, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 5 }));
  const ALPHA = 'The recent structure supports a conditional long if the range breaks.';
  const RED = 'The break has not happened and the higher timeframes are still flat.';
  const SYN = { headline: 'Not yet: NVDA is still inside its range.', why: 'Alpha needs a break the chart has not shown.', risk: 'The weekly view is flat, so a break can fail.', watch: 'A close above the range high.', watchLevel: 0, followUp: 'What if NVDA loses the range low?' };
  const CIO = { analysis: 'The evidence does not support a clear case yet; wait for the range to resolve.', verdict: 'wait', direction: 'none', synthesis: SYN };
  const systemOf = (c: Call) => (hostOf(c.url) === 'api.anthropic.com' ? c.body.system : c.body.messages[0].content) as string;
  const inputOf = (c: Call) => JSON.parse(hostOf(c.url) === 'api.anthropic.com' ? c.body.messages[0].content : c.body.messages[1].content);
  const byRole = (c: Call) => (/Your role is CIO/.test(systemOf(c)) ? 'cio' : /Red Team: challenge/.test(systemOf(c)) ? 'red' : 'alpha');
  const models = () => calls.filter((c) => hostOf(c.url) === 'api.openai.com' || hostOf(c.url) === 'api.anthropic.com');
  const openai = (content: unknown) => json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  const claude = (content: unknown) => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(content) }], usage: { input_tokens: 100, output_tokens: 20 } });
  let cioReply: unknown = CIO;
  let levelGate: Record<string, unknown> = { allowed: true, code: null, useId: 91 };
  let spend = { day: 0, month: 0 };
  const deskMock = () => mock((c) => {
    const r = backend(c); if (r) return r;
    if (c.url.includes('rpc/bobby_consume_desk_quota')) return json(true);
    if (c.url.includes('rpc/bobby_llm_spend')) return json(spend);
    if (c.url.includes('rpc/bobby_consume_level')) return json({ ...levelGate, tier: 'free', used: 1, limit: 3, resetsAt: null });
    if (c.url.includes('bobby_level_uses?id=eq.') && c.method === 'DELETE') return json([]);
    if (c.url.includes('bobby_llm_usage')) return json(null, 201);
    if (c.url.includes('/api/stock-candles') || c.url.includes('/api/okx-candles')) return json({ candles });
    if (c.url.includes('okx.com/api/v5/public')) return json({ data: [] });
    if (c.url.includes('forum_threads')) return json([]);
    if (hostOf(c.url) === 'api.openai.com' || hostOf(c.url) === 'api.anthropic.com') {
      const role = byRole(c);
      const content = role === 'alpha' ? { analysis: ALPHA } : role === 'red' ? { analysis: RED } : cioReply;
      return hostOf(c.url) === 'api.anthropic.com' ? claude(content) : openai(content);
    }
    throw new Error(`Unexpected request ${c.url}`);
  });
  const deskReq = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    ({ method: 'POST', headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.9.0.2', 'x-bobby-device': 'device-1234567890abcdef', ...headers }, body });
  const run = async (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
    deskMock();
    const res = response();
    await deskHandler(deskReq({ symbol: 'NVDA', assetType: 'equity', question: 'Is NVDA worth a look?', ...body }, headers) as never, res as never);
    return res;
  };
  const recorded = () => calls.filter((c) => c.url.includes('rpc/bobby_memory_record'));
  const REMEMBERED = {
    enabled: true, prefs: { horizon: 'month', experience: 'new', risk: null },
    top: [{ symbol: 'NVDA', asks: 7, lastAskedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), lastHorizon: 'week' }, { symbol: 'BTC', asks: 4, lastAskedAt: new Date().toISOString(), lastHorizon: 'unspecified' }],
    thisAsset: { asks: 7, lastAskedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(), lastHorizon: 'week' },
  };

  // A signed-in reader with memory: the reader reaches the CIO only, the client sees only `personalized`.
  summaryReply = REMEMBERED;
  const served = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  eq([served.statusCode, served.body.personalized], [200, true], 'a personalized answer says so');
  const byRoleCalls = Object.fromEntries(models().map((c) => [byRole(c), c]));
  eq(inputOf(byRoleCalls.cio).reader, { prefs: { horizon: 'month', experience: 'new' }, thisAsset: { asks: 7, lastAskedDaysAgo: 2, lastHorizon: 'week', timesThisWeek: 1 }, oftenAsks: [{ symbol: 'BTC', asks: 4 }] }, 'the CIO receives the compact reader');
  ok(systemOf(byRoleCalls.cio).includes(READER_RULE), 'with the rule: frame only, never change the verdict or judge suitability');
  ok(/explainRiskDepth/.test(READER_RULE) && /how much the answer explains risk/.test(READER_RULE) && /never sets suitability, position sizing or a recommendation/.test(READER_RULE), 'the rule says explainRiskDepth sets only how much risk is explained, never suitability, sizing or recommendations');
  ok(!('reader' in inputOf(byRoleCalls.alpha)) && !('reader' in inputOf(byRoleCalls.red)), 'Alpha and Red Team never see the reader');
  ok(!systemOf(byRoleCalls.alpha).includes('reader is this reader') && !systemOf(byRoleCalls.red).includes('reader is this reader'), '…nor its rule');
  const wire = JSON.stringify(served.body);
  ok(!/"reader"|oftenAsks|thisAsset|lastAskedDaysAgo|"experience"/.test(wire), 'the reader never reaches the client');
  eq(served.body.sufficiency.horizon, 'unspecified', 'a stored horizon preference never changes sufficiency');
  eq([inputOf(byRoleCalls.alpha).sufficiency.horizon, inputOf(byRoleCalls.red).sufficiency.horizon, inputOf(byRoleCalls.cio).sufficiency.horizon], ['unspecified', 'unspecified', 'unspecified'], '…for any role');
  eq([inputOf(byRoleCalls.alpha).reader, inputOf(byRoleCalls.red).reader], [undefined, undefined], 'alpha and red inputs carry no reader');
  const servedAlpha = inputOf(byRoleCalls.alpha);
  const servedAlphaSystem = systemOf(byRoleCalls.alpha);
  const summaryCall = calls.find((c) => c.url.includes('rpc/bobby_memory_summary'))!;
  eq(summaryCall.body, { p_identity: IDENT, p_symbol: 'NVDA' }, 'the summary is read for this account and asset');
  await settle();
  const rec = recorded();
  eq(rec.length, 1, 'the delivered answer is recorded once');
  eq(rec[0].body, { p_identity: IDENT, p_symbol: 'NVDA', p_horizon: 'unspecified' }, 'with the horizon the question named (none), not the preference');
  ok(calls.indexOf(rec[0]) > calls.indexOf(models().at(-1)!), 'after the last model call, never before');
  eq(authCalls().length, 1, 'the account is verified once');

  // The same question without memory: sufficiency and the Alpha/Red inputs are the same as with it.
  const plain = await run({ question: 'Is NVDA worth a look?' });
  await settle();
  const plainAlpha = models().find((c) => byRole(c) === 'alpha')!;
  eq(plain.body.sufficiency, served.body.sufficiency, 'sufficiency is identical with and without a reader');
  eq([inputOf(plainAlpha).question, inputOf(plainAlpha).sufficiency, systemOf(plainAlpha)], [servedAlpha.question, servedAlpha.sufficiency, servedAlphaSystem], 'Alpha gets the same question, sufficiency and prompt with and without a reader');

  // A question that names its horizon keeps it.
  const today = await run({ question: '¿Cómo ves NVDA para hoy?', language: 'es' }, SIGNED_IN);
  eq(today.body.sufficiency.horizon, 'intraday', 'the question\'s own horizon wins over the preference');
  await settle();
  eq(recorded()[0].body.p_horizon, horizonOf('¿Cómo ves NVDA para hoy?'), 'and that horizon is what is recorded');

  // Memory off: no reader, no personalization, nothing recorded.
  summaryReply = { ...REMEMBERED, enabled: false, top: [], thisAsset: null };
  const off = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  eq([off.statusCode, 'personalized' in off.body, off.body.sufficiency.horizon], [200, false, 'unspecified'], 'memory paused: a plain answer, the preference unused');
  ok(!models().some((c) => 'reader' in inputOf(c)), '…no reader for any role');
  eq(recorded().length, 0, '…and nothing recorded');
  summaryReply = REMEMBERED;

  // Anonymous and wallet readers: not a single memory or identity call.
  for (const [who, headers] of [['anonymous', {}], ['wallet session', { 'x-bobby-session': 'bws.wallet-session-token' }], ['wallet bearer', { authorization: 'Bearer bws.wallet-session-token' }]] as const) {
    const res = await run({}, headers);
    await settle();
    eq([res.statusCode, 'personalized' in res.body], [200, false], `${who}: a plain answer`);
    eq([memoryCalls().length, authCalls().length, calls.some((c) => c.url.includes('bobby_identities'))], [0, 0, false], `${who}: no memory, auth or identity call`);
    ok(!models().some((c) => 'reader' in inputOf(c)), `${who}: no reader`);
  }

  // The iPhone app sends its account token too, but cannot show or delete memory yet: nothing for it.
  const ios = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios' });
  await settle();
  eq([ios.statusCode, 'personalized' in ios.body, memoryCalls().length, authCalls().length], [200, false, 0, 0], 'an iPhone read: no memory call, no personalization (MEMORY_PLATFORMS)');
  const web = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'web' });
  await settle();
  eq([web.body.personalized, recorded().length], [true, 1], 'the same account on the web: personalized and recorded');

  // Kill switch off (unset or not exactly 'on'): a signed-in web reader gets no memory call at all.
  for (const value of [undefined, 'true']) {
    if (value === undefined) delete process.env.BOBBY_MEMORY; else process.env.BOBBY_MEMORY = value;
    const killed = await run({ question: 'Is NVDA worth a look?' }, { ...SIGNED_IN, 'x-bobby-platform': 'web' });
    await settle();
    eq([killed.statusCode, 'personalized' in killed.body], [200, false], `BOBBY_MEMORY=${value ?? 'unset'}: a plain answer`);
    eq([memoryCalls().length, authCalls().length, recorded().length], [0, 0, 0], `BOBBY_MEMORY=${value ?? 'unset'}: no memory read, no identity lookup, nothing recorded`);
    ok(!models().some((c) => 'reader' in inputOf(c)), `BOBBY_MEMORY=${value ?? 'unset'}: no reader for any role`);
  }
  process.env.BOBBY_MEMORY = 'on';
  const backOn = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  eq([backOn.body.personalized, recorded().length], [true, 1], "BOBBY_MEMORY=on: personalized and recorded again");

  // Storage down or slow: the read runs without memory, in time.
  storageDown = true;
  const quiet = console.error; console.error = () => {};
  const down = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  storageDown = false;
  console.error = quiet;
  await settle();
  eq([down.statusCode, 'personalized' in down.body], [200, false], 'memory storage down: the answer is served without memory');
  eq(recorded().length, 1, '…and the database still decides whether to record the delivered answer');
  summaryDelayMs = MEMORY_SUMMARY_TIMEOUT_MS + 1200;
  const started = Date.now();
  const slow = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  const took = Date.now() - started;
  summaryDelayMs = 0;
  eq([slow.statusCode, 'personalized' in slow.body], [200, false], 'a slow summary is skipped');
  ok(took < MEMORY_SUMMARY_TIMEOUT_MS + 1000, `…the answer is not held for it (${took} ms)`);
  await settle();

  // Refusals, outages and guard rejections record nothing.
  levelGate = { allowed: false, code: 'upgrade_required', useId: null };
  const refused = await run({ question: 'Is NVDA worth a look?', level: 'profundo' }, SIGNED_IN);
  await settle();
  eq([refused.statusCode, refused.body.code, memoryCalls().length], [403, 'upgrade_required', 0], 'a refused premium read: 403, no memory read or write');
  levelGate = { allowed: true, code: null, useId: 91 };
  resetLlmSpendCache(); spend = { day: 0, month: 400 };
  const paused = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  eq([paused.statusCode, paused.body.code, memoryCalls().length], [503, 'budget_paused', 0], 'a paused desk: 503, no memory call');
  resetLlmSpendCache(); spend = { day: 0, month: 0 };
  cioReply = { ...CIO, synthesis: { ...SYN, why: 'This breakout offers guaranteed profits for patient holders.' } };
  const errorLog = console.error; console.error = () => {};
  const rejected = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  console.error = errorLog;
  eq([rejected.statusCode, rejected.body.code, recorded().length], [503, 'analysis_failed', 0], 'a guard rejection: analysis_failed and nothing recorded');
  cioReply = CIO;

  // Premium: the meter already resolved the account; memory reuses it, and the Sonnet CIO gets the reader.
  const deep = await run({ question: 'Is NVDA worth a look?', level: 'profundo' }, SIGNED_IN);
  await settle();
  eq([deep.statusCode, deep.body.personalized, deep.body.level], [200, true, 'profundo'], 'Profundo for a signed-in reader is personalized');
  eq(authCalls().length, 1, 'the account is verified once for the meter and the memory');
  const deepCio = models().find((c) => byRole(c) === 'cio')!;
  ok(hostOf(deepCio.url) === 'api.anthropic.com' && inputOf(deepCio).reader && !models().filter((c) => c !== deepCio).some((c) => 'reader' in inputOf(c)), 'the Sonnet CIO alone sees the reader');
  eq(recorded().length, 1, 'recorded after the delivered Profundo answer');

  // The live desk: the streamed lines never carry the reader; the final body says personalized.
  const live = await run({}, { ...SIGNED_IN, accept: 'application/x-ndjson' });
  await settle();
  const lines = live.lines();
  eq([lines.at(-1).type, lines.at(-1).data.personalized], ['final', true], 'the final line says personalized');
  ok(lines.every((l: any) => !/"reader"|oftenAsks|thisAsset/.test(JSON.stringify(l))), 'no streamed line carries the reader');
  eq(recorded().length, 1, 'the streamed answer is recorded after the final line');

  console.log(`user-memory: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
}
