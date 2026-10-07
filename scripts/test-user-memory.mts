// Per-user memory without a network or a database (api/_lib/user-memory.ts, api/memory.ts, api/desk-debate.ts):
//   · readerContext keeps only explicit preferences and ask counts, and nothing when memory is off;
//   · /api/memory answers 401 to anonymous and wallet callers, validates every correction, and forgets one
//     asset or everything through the right RPC; storage failures are a JSON 503 whose logs never pair a
//     symbol with an identity;
//   · the desk gives the reader to the CIO only, for a signed-in Apple/Google account, never to the client
//     (only `personalized: true`); a stored horizon never changes sufficiency (nor the verdict); the stored
//     "risk" reaches the CIO only as explainRiskDepth, under a rule that forbids suitability and sizing; the ask is
//     recorded only once the answer is complete, never on a refusal, an outage, a guard rejection or an abandoned
//     read; anonymous and wallet requests make no memory call at all; iPhone and Android asks need a separate
//     per-request opt-in;
//   · the reply says what memory kept (1.8): `memory: { recorded, asks, lastAskedDaysAgo, changeSinceLastAskPct }`
//     with the numbers the CIO's reader carried. The write is awaited before the reply is built (at most
//     MEMORY_RECORD_TIMEOUT_MS), so `recorded` is true only when the database confirmed it: false when it
//     refused, failed or was too slow, and then `asks` does not count this question. `asks` is null when the
//     count was not read (memory paused, summary unavailable), never a zero; no key at all when memory does not
//     apply;
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

const { readerContext, readerForModel, changeSinceLastAsk, CALLBACK_MOVE_BOUND, memoryReceipt, memoryPersonalizationOn, memoryDeskAllowed, MEMORY_PLATFORMS, MEMORY_SUMMARY_TIMEOUT_MS, MEMORY_RECORD_TIMEOUT_MS } = await import('../api/_lib/user-memory.ts');
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
const IDENT_B = '0b8f0a52-0000-4000-8000-00000000b0bb';
const AUTH_USER_B = 'a11ce000-0000-4000-8000-000000000002';

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
  closeListener: null as null | (() => void),
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; this.writableEnded = true; this.writableFinished = true; return this; },
  on(event: string, listener: () => void) { if (event === 'close') this.closeListener = listener; return this; },
  close() { this.closeListener?.(); }, flushHeaders() {}, write(c: string) { this.chunks.push(c); return true; }, end() { this.writableEnded = true; this.writableFinished = true; return this; },
  lines() { return this.chunks.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)); },
});
const SIGNED_IN = { authorization: 'Bearer good-apple-token' };
const SIGNED_IN_B = { authorization: 'Bearer good-google-token' };

// ---- shared backend: identity, memory storage, rate limiter ----
let summaryReply: unknown = null;
let summaryDelayMs = 0;
let prefsRows: unknown[] = [];
let assetRows: unknown[] = [];
let storageDown = false;
/** What bobby_memory_record answers, and what the reader had been sent when it was asked. */
let recordReply: () => Response | Promise<Response> = () => json(true);
let answeredBeforeRecord: boolean[] = [];
let currentResponse: { body: unknown; chunks: string[]; writableEnded: boolean; close(): void } | null = null;
function backend(c: Call): Response | Promise<Response> | null {
  if (c.url.includes('/rest/v1/api_cache')) return c.method === 'POST' ? json(null, 201) : json([]);
  if (c.url.includes('/auth/v1/user')) {
    if (c.headers.authorization === SIGNED_IN.authorization) return json({ id: AUTH_USER, email: 'reader@example.com', app_metadata: { provider: 'apple' } });
    if (c.headers.authorization === SIGNED_IN_B.authorization) return json({ id: AUTH_USER_B, email: 'second@example.com', app_metadata: { provider: 'google' } });
    return json({ msg: 'bad token' }, 401);
  }
  if (c.url.includes('bobby_identities?on_conflict=auth_user_id')) {
    const second = c.body?.auth_user_id === AUTH_USER_B;
    return json([{ id: second ? IDENT_B : IDENT, auth_user_id: second ? AUTH_USER_B : AUTH_USER, wallet_address: null }]);
  }
  if (c.url.includes('bobby_identities?on_conflict=wallet_address')) return json([{ id: 'wallet-ident', auth_user_id: null, wallet_address: '0xabc' }]);
  if (c.url.includes('rpc/bobby_memory_summary')) {
    if (storageDown) return json({ message: 'down' }, 500);
    return summaryDelayMs ? new Promise((resolve) => setTimeout(() => resolve(json(summaryReply)), summaryDelayMs)) : json(summaryReply);
  }
  if (c.url.includes('rpc/bobby_memory_record')) {
    answeredBeforeRecord.push(!!currentResponse && (currentResponse.body !== null || currentResponse.writableEnded || currentResponse.chunks.some((line) => line.includes('"final"'))));
    return recordReply();
  }
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
    thisAsset: { asks: 7, lastAskedDaysAgo: 3, lastHorizon: 'week', timesThisWeek: 2, lastAskedOn: 'Saturday' },
    oftenAsks: [{ symbol: 'BTC', asks: 3 }],
  }, 'explicit preferences, this asset, and the others asked at least twice (not the asked one again)');
  eq(readerContext(summary(), 'NVDA', now, 'Anthony')?.firstName, 'Anthony', 'the first name reaches the CIO only with memory on');
  {
    // Callback: price at the last ask (2026-09-26, a Saturday in UTC) vs the evidence price now, computed here.
    const withPrice = summary({ thisAsset: { asks: 7, lastAskedAt: '2026-09-26T12:00:00.000Z', lastHorizon: 'week', asksThisWeek: 1, lastPrice: 200 } });
    const es = readerContext(withPrice, 'NVDA', now, null, 230, 'es')?.thisAsset;
    eq([es?.changeSinceLastAskPct, es?.lastAskedOn, es?.sinceLastAsk], [15, 'sábado', { change: '+15%', since: 'sábado' }], 'up 15% since Saturday: the figure and its day, finished by the server');
    ok(!('priceThen' in (es ?? {})), 'the stored price itself is no longer part of the reader: there is nothing to compute another figure from');
    eq(readerContext(withPrice, 'NVDA', now, null, 170, 'en')?.thisAsset?.sinceLastAsk, { change: '-15%', since: 'Saturday' }, 'a fall keeps its sign');
    eq(readerContext(withPrice, 'NVDA', now, null, 206.4, 'en')?.thisAsset?.sinceLastAsk, { change: '+3.2%', since: 'Saturday' }, 'one decimal when there is one');
    eq(readerContext(withPrice, 'NVDA', now, null, 200, 'en')?.thisAsset?.sinceLastAsk, { change: '0%', since: 'Saturday' }, 'unchanged is said without a sign');
    // The figure is written in the answer's locale, so the CIO quotes it as it stands.
    eq((['en', 'es', 'fr', 'pt', 'it', 'de'] as const).map((l) => readerContext(withPrice, 'NVDA', now, null, 206.4, l)?.thisAsset?.sinceLastAsk?.change),
      (['en-US', 'es-MX', 'fr-FR', 'pt-PT', 'it-IT', 'de-DE'] as const).map((l) => new Intl.NumberFormat(l, { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 }).format(0.032)), 'the figure is written out in each language\'s own number format');
    ok(/^\+3[.,]2\s?%$/.test(readerContext(withPrice, 'NVDA', now, null, 206.4, 'de')?.thisAsset?.sinceLastAsk?.change ?? ''), '…always sign, digits, percent');
    // From a week on there is no weekday: the day is counted, in the answer's language.
    const older = summary({ thisAsset: { asks: 7, lastAskedAt: '2026-09-17T12:00:00.000Z', lastHorizon: 'week', asksThisWeek: 0, lastPrice: 200 } });
    eq([readerContext(older, 'NVDA', now, null, 230, 'en')?.thisAsset?.sinceLastAsk, readerContext(older, 'NVDA', now, null, 230, 'es')?.thisAsset?.sinceLastAsk?.since, readerContext(older, 'NVDA', now, null, 230, 'de')?.thisAsset?.sinceLastAsk?.since],
      [{ change: '+15%', since: '12 days ago' }, 'hace 12 días', 'vor 12 Tagen'], 'twelve days later: "12 days ago", never a weekday that could be any week');
    eq(readerContext(withPrice, 'NVDA', now, null, null, 'en')?.thisAsset?.sinceLastAsk, undefined, 'no price now: no callback');
    const sameDay = summary({ thisAsset: { asks: 2, lastAskedAt: '2026-09-29T09:00:00.000Z', lastHorizon: 'week', asksThisWeek: 1, lastPrice: 200 } });
    eq([readerContext(sameDay, 'NVDA', now, null, 230, 'en')?.thisAsset?.sinceLastAsk, readerContext(sameDay, 'NVDA', now, null, 230, 'en')?.thisAsset?.changeSinceLastAskPct], [undefined, undefined], 'same day: no callback, the chart already shows it');

    // ---------- the figure is given only when both prices can be trusted ----------
    eq([changeSinceLastAsk(200, 230), changeSinceLastAsk(200, 170), changeSinceLastAsk(200, 206.4), changeSinceLastAsk(200, 200)], [15, -15, 3.2, 0], 'an ordinary move: one decimal, with its sign');
    for (const [then, price, what] of [[null, 230, 'no stored price'], [undefined, 230, 'no stored price'], [0, 230, 'a stored zero'], [-5, 230, 'a negative price'], [NaN, 230, 'not a number'], [Infinity, 230, 'not finite'], ['abc', 230, 'not a number'],
      [200, null, 'no price now'], [200, 0, 'a zero now'], [200, NaN, 'not a number now'], [200, Infinity, 'not finite now'], [200, 1e13, 'an absurd price']] as const) {
      eq([changeSinceLastAsk(then, price, 'equity'), changeSinceLastAsk(then, price, 'crypto')], [null, null], `${what}: no figure`);
    }
    eq(CALLBACK_MOVE_BOUND, { equity: { down: 25, up: 25 }, crypto: { down: 60, up: 150 } }, 'the bounds, per asset class');
    // A stock: a split leaves the stored price on the old share count, and reads as a crash or a rally.
    for (const [then, price, what] of [[1000, 100, 'a 10-for-1 split (-90%)'], [300, 100, 'a 3-for-1 split (-66.7%)'], [200, 100, 'a 2-for-1 split (-50%)'], [150, 100, 'a 3-for-2 split (-33.3%)'],
      [150, 110, 'a 3-for-2 split and a 10% rise (-26.7%)'], [100, 200, 'a 1-for-2 reverse split (+100%)'], [100, 1000, 'a 1-for-10 reverse split (+900%)'], [200, 150, 'exactly -25%'], [200, 250, 'exactly +25%']] as const) {
      eq(changeSinceLastAsk(then, price, 'equity'), null, `a stock, ${what}: no figure`);
      const split = summary({ thisAsset: { asks: 7, lastAskedAt: '2026-09-26T12:00:00.000Z', lastHorizon: 'week', asksThisWeek: 1, lastPrice: then } });
      const reader = readerContext(split, 'NVDA', now, null, price, 'en', undefined, 'equity');
      eq([reader?.thisAsset?.sinceLastAsk, reader?.thisAsset?.changeSinceLastAskPct, memoryReceipt(split, reader, true).changeSinceLastAskPct], [undefined, undefined, null], `a stock, ${what}: nothing for the CIO to quote, and null in the receipt`);
      ok(!JSON.stringify(readerForModel(reader!)).includes(String(then)), `a stock, ${what}: the stored price is not in what the model sees either`);
    }
    eq([changeSinceLastAsk(200, 151, 'equity'), changeSinceLastAsk(200, 249, 'equity')], [-24.5, 24.5], 'a stock just inside the bound keeps its figure');
    // Crypto has no splits; the bound there is for a change of unit or another instrument, and real moves are larger.
    eq([changeSinceLastAsk(100, 45, 'crypto'), changeSinceLastAsk(100, 240, 'crypto'), changeSinceLastAsk(100, 70, 'crypto')], [-55, 140, -30], 'crypto: a large genuine move is still quoted');
    eq([changeSinceLastAsk(100, 40, 'crypto'), changeSinceLastAsk(100, 250, 'crypto'), changeSinceLastAsk(1000, 1, 'crypto'), changeSinceLastAsk(1, 1000, 'crypto')], [null, null, null, null], 'crypto: at or beyond a factor of 2.5, and a redenomination, give none');
    eq([changeSinceLastAsk(100, 140), changeSinceLastAsk(100, 140, 'bond' as never)], [null, null], 'an unknown asset class is held to the stricter bound');
    const cryptoReader = readerContext(summary({ thisAsset: { asks: 3, lastAskedAt: '2026-09-26T12:00:00.000Z', lastHorizon: 'week', asksThisWeek: 1, lastPrice: 100 } }), 'BTC', now, null, 140, 'en', undefined, 'crypto');
    eq([cryptoReader?.thisAsset?.sinceLastAsk, readerContext(summary({ thisAsset: { asks: 3, lastAskedAt: '2026-09-26T12:00:00.000Z', lastHorizon: 'week', asksThisWeek: 1, lastPrice: 100 } }), 'NVDA', now, null, 140, 'en')?.thisAsset?.sinceLastAsk],
      [{ change: '+40%', since: 'Saturday' }, undefined], 'the same +40% is quoted for a crypto asset and not for a stock');

    // ---------- what the model is handed: the finished figure, no number to work on ----------
    const full = readerContext(withPrice, 'NVDA', now, 'Anthony', 230, 'en')!;
    const seen = readerForModel(full);
    eq(seen, { firstName: 'Anthony', prefs: { horizon: 'month', experience: 'new' }, thisAsset: { asks: 7, lastAskedDaysAgo: 3, lastHorizon: 'week', timesThisWeek: 2, lastAskedOn: 'Saturday', sinceLastAsk: { change: '+15%', since: 'Saturday' } }, oftenAsks: [{ symbol: 'BTC', asks: 3 }] }, 'the model sees the reader with the finished figure');
    ok(!/changeSinceLastAskPct|priceThen|lastPrice|"200"|:200\b|:230\b/.test(JSON.stringify(seen)), '…and neither the raw change nor either price');
    eq(full.thisAsset?.changeSinceLastAskPct, 15, '…while the server keeps the number for the receipt');
    eq(readerForModel(readerContext(summary(), 'NVDA', now)!), readerContext(summary(), 'NVDA', now), 'a reader without a figure is handed over as it is');
  }
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
  eq([memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': '1' } } as never, 'ios', { BOBBY_MEMORY: 'on' } as never),
      memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': 'true' } } as never, 'ios', { BOBBY_MEMORY: 'on' } as never),
      memoryDeskAllowed({ headers: {} } as never, 'ios', { BOBBY_MEMORY: 'on' } as never),
      memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': '1' } } as never, 'ios', {} as never)],
     [true, false, false, false], 'iOS needs exact affirmation and the global kill switch');
  // Android (1.8) follows the iPhone's rule; the web needs no header; an unknown platform has no memory.
  eq([...MEMORY_PLATFORMS].sort(), ['android', 'ios', 'web'], 'memory platforms: the web and both native apps');
  eq([memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': '1' } } as never, 'android', { BOBBY_MEMORY: 'on' } as never),
      memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': 'true' } } as never, 'android', { BOBBY_MEMORY: 'on' } as never),
      memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': ['1', '1'] } } as never, 'android', { BOBBY_MEMORY: 'on' } as never),
      memoryDeskAllowed({ headers: {} } as never, 'android', { BOBBY_MEMORY: 'on' } as never),
      memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': '1' } } as never, 'android', {} as never)],
     [true, false, false, false, false], 'Android needs the same exact affirmation and the global kill switch');
  eq([memoryDeskAllowed({ headers: {} } as never, 'web', { BOBBY_MEMORY: 'on' } as never), memoryDeskAllowed({ headers: { 'x-bobby-memory-opt-in': '1' } } as never, 'tvos', { BOBBY_MEMORY: 'on' } as never)],
     [true, false], 'the web needs no header; a platform that is not listed has no memory even with one');

  // ---------- the receipt: what memory kept, from the summary, the reader built from it and the write's own answer ----------
  {
    const priced = summary({ thisAsset: { asks: 7, lastAskedAt: '2026-09-26T12:00:00.000Z', lastHorizon: 'week', asksThisWeek: 1, lastPrice: 200 } });
    const reader = readerContext(priced, 'NVDA', now, null, 230, 'en');
    eq(memoryReceipt(priced, reader, true), { recorded: true, asks: 8, lastAskedDaysAgo: 3, changeSinceLastAskPct: 15 }, 'asked 7 times before and this one was written: the 8th, 3 days after the last, up 15%');
    eq(memoryReceipt(priced, reader, false), { recorded: false, asks: 7, lastAskedDaysAgo: 3, changeSinceLastAskPct: 15 }, 'the write did not happen: not recorded, and this question is not counted');
    eq([memoryReceipt(priced, reader, true).lastAskedDaysAgo, memoryReceipt(priced, reader, true).changeSinceLastAskPct], [reader!.thisAsset!.lastAskedDaysAgo, reader!.thisAsset!.changeSinceLastAskPct], '…the reader\'s own numbers');
    eq(reader!.thisAsset!.sinceLastAsk?.change, '+15%', '…and the change is the figure the CIO was handed, as a number');
    eq(memoryReceipt(summary(), readerContext(summary(), 'NVDA', now), true), { recorded: true, asks: 8, lastAskedDaysAgo: 3, changeSinceLastAskPct: null }, 'no stored price: no change, never a zero');
    const first = summary({ top: [], thisAsset: null });
    eq(memoryReceipt(first, readerContext(first, 'NVDA', now), true), { recorded: true, asks: 1, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, 'a first ask counts itself and has no last time');
    eq(memoryReceipt(first, readerContext(first, 'NVDA', now), false), { recorded: false, asks: 0, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, 'a first ask that was not written: memory was read and holds no ask of this asset, a true zero');
    const empty = summary({ prefs: { horizon: null, experience: null, risk: null }, top: [], thisAsset: null });
    eq(memoryReceipt(empty, readerContext(empty, 'NVDA', now), true), { recorded: true, asks: 1, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, 'an empty memory has no reader and still records this first ask');
    const paused = summary({ enabled: false });
    eq([memoryReceipt(paused, readerContext(paused, 'NVDA', now), false), memoryReceipt(paused, null, true)], Array.from({ length: 2 }, () => ({ recorded: false, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null })), 'a paused memory records nothing and its count was not read: null, never a zero, whatever the rows hold');
    eq([memoryReceipt(null, null, true), memoryReceipt(null, null, false)], [{ recorded: true, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, { recorded: false, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }], 'the summary could not be read: only whether the write happened is known');
    eq(Object.keys(memoryReceipt(priced, reader, true)), ['recorded', 'asks', 'lastAskedDaysAgo', 'changeSinceLastAskPct'], 'four facts: no text, no symbol list');
  }

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
  let cancelAtCio = false;
  const deskMock = () => mock((c) => {
    const r = backend(c); if (r) return r;
    if (c.url.includes('rpc/bobby_consume_desk_quota')) return json(true);
    if (c.url.includes('rpc/bobby_consume_read')) return json({ allowed: true, code: null, readId: 1, tier: 'free', used: 1, limit: 10 });
    if (c.url.includes('bobby_reads?id=eq.') && c.method === 'DELETE') return json([]);
    if (c.url.includes('rpc/bobby_llm_spend')) return json(spend);
    if (c.url.includes('rpc/bobby_consume_level')) return json({ ...levelGate, tier: 'free', used: 1, limit: 3, resetsAt: null });
    if (c.url.includes('bobby_level_uses?id=eq.') && c.method === 'DELETE') return json([]);
    if (c.url.includes('bobby_llm_usage')) return json(null, 201);
    if (c.url.includes('/api/stock-candles') || c.url.includes('/api/okx-candles')) return json({ candles });
    if (c.url.includes('okx.com/api/v5/public')) return json({ data: [] });
    if (c.url.includes('forum_threads')) return json([]);
    if (hostOf(c.url) === 'api.openai.com' || hostOf(c.url) === 'api.anthropic.com') {
      const role = byRole(c);
      if (role === 'cio' && cancelAtCio) currentResponse?.close();
      const content = role === 'alpha' ? { analysis: ALPHA } : role === 'red' ? { analysis: RED } : cioReply;
      return hostOf(c.url) === 'api.anthropic.com' ? claude(content) : openai(content);
    }
    throw new Error(`Unexpected request ${c.url}`);
  });
  const deskReq = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
    ({ method: 'POST', headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.9.0.2', 'x-bobby-device': 'device-1234567890abcdef', ...headers }, body });
  const run = async (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
    deskMock();
    answeredBeforeRecord = [];
    const res = response();
    currentResponse = res;
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
  {
    const { lastAskedOn, ...rest } = inputOf(byRoleCalls.cio).reader.thisAsset;
    eq({ ...inputOf(byRoleCalls.cio).reader, thisAsset: rest }, { prefs: { horizon: 'month', experience: 'new' }, thisAsset: { asks: 7, lastAskedDaysAgo: 2, lastHorizon: 'week', timesThisWeek: 1 }, oftenAsks: [{ symbol: 'BTC', asks: 4 }] }, 'the CIO receives the compact reader');
    ok(typeof lastAskedOn === 'string' && lastAskedOn.length > 0, '…with the weekday of the last ask');
  }
  ok(systemOf(byRoleCalls.cio).includes(READER_RULE), 'with the rule: frame only, never change the verdict or judge suitability');
  ok(/explainRiskDepth/.test(READER_RULE) && /how much the answer explains risk/.test(READER_RULE) && /never sets suitability, position sizing or a recommendation/.test(READER_RULE), 'the rule says explainRiskDepth sets only how much risk is explained, never suitability, sizing or recommendations');
  ok(!('reader' in inputOf(byRoleCalls.alpha)) && !('reader' in inputOf(byRoleCalls.red)), 'Alpha and Red Team never see the reader');
  ok(!systemOf(byRoleCalls.alpha).includes('reader is this reader') && !systemOf(byRoleCalls.red).includes('reader is this reader'), '…nor its rule');
  // 1.8: the reply also says what memory kept. Its four numbers are the only memory-derived values on the wire;
  // `lastAskedDaysAgo` is one of them, so the reader check below looks at the body without the receipt.
  eq(served.body.memory, { recorded: true, asks: 8, lastAskedDaysAgo: 2, changeSinceLastAskPct: null }, 'the receipt: recorded, the 8th ask, 2 days after the last, no stored price to compare');
  // `recorded: true` is the database's own answer, already in hand when the reply was built: the write is not
  // left for after the response (nothing to settle), and it was asked before anything was sent to the reader.
  eq([recorded().length, answeredBeforeRecord], [1, [false]], 'the ask was written before the reply left, not after it');
  const { memory: _receipt, ...withoutReceipt } = served.body;
  const wire = JSON.stringify(withoutReceipt);
  ok(!/"reader"|oftenAsks|thisAsset|lastAskedDaysAgo|"experience"/.test(wire), 'the reader never reaches the client');
  ok(!/"reader"|oftenAsks|thisAsset|"experience"|"prefs"|explainRiskDepth|lastHorizon|timesThisWeek|lastAskedOn|priceThen|firstName|BTC/.test(JSON.stringify(served.body)), '…and the receipt carries none of it: no preferences, no name, no other asset');
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
  eq(rec[0].body, { p_identity: IDENT, p_symbol: 'NVDA', p_horizon: 'unspecified', p_price: 200 }, 'with the horizon the question named (none), not the preference, and the evidence price');
  ok(calls.indexOf(rec[0]) > calls.indexOf(models().at(-1)!), 'after the last model call, never before');
  eq(authCalls().length, 1, 'the account is verified once');

  // The same question without memory: sufficiency and the Alpha/Red inputs are the same as with it.
  const plain = await run({ question: 'Is NVDA worth a look?' });
  await settle();
  const plainAlpha = models().find((c) => byRole(c) === 'alpha')!;
  eq(plain.body.sufficiency, served.body.sufficiency, 'sufficiency is identical with and without a reader');
  eq([inputOf(plainAlpha).question, inputOf(plainAlpha).sufficiency, systemOf(plainAlpha)], [servedAlpha.question, servedAlpha.sufficiency, servedAlphaSystem], 'Alpha gets the same question, sufficiency and prompt with and without a reader');
  eq(['memory' in plain.body, 'personalized' in plain.body], [false, false], 'memory does not apply to a guest: no receipt key at all');
  // Without the receipt, the personalized body has exactly the keys a 1.7 reply had.
  eq(Object.keys(withoutReceipt).sort(), [...Object.keys(plain.body), 'personalized'].sort(), 'the receipt is the only key memory adds beside `personalized`');

  // A stored price and a change since: the receipt quotes what the CIO's reader carried, computed once.
  summaryReply = { ...REMEMBERED, thisAsset: { ...REMEMBERED.thisAsset, lastPrice: 185 } };
  const priced = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  const pricedCio = models().find((c) => byRole(c) === 'cio')!;
  const pricedReader = inputOf(pricedCio).reader.thisAsset;
  eq(priced.body.memory, { recorded: true, asks: 8, lastAskedDaysAgo: 2, changeSinceLastAskPct: 8.1 }, 'from 185 to 200 since the last ask: +8.1%');
  eq([pricedReader.sinceLastAsk.change, pricedReader.sinceLastAsk.since, pricedReader.lastAskedDaysAgo, pricedReader.asks + 1], ['+8.1%', pricedReader.lastAskedOn, priced.body.memory.lastAskedDaysAgo, priced.body.memory.asks], '…the figure the CIO was handed, finished, beside its day, with this ask counted');
  // S4: the model never does arithmetic on a reader's history. It gets the finished figure and no operand.
  ok(!('changeSinceLastAskPct' in pricedReader) && !('priceThen' in pricedReader) && !/185|8\.1(?!%)/.test(JSON.stringify(inputOf(pricedCio).reader)), 'the CIO gets neither the stored price nor the raw change: only "+8.1%" and its day');
  ok(/quotes change exactly as written/.test(READER_RULE) && /or leave the callback out/.test(READER_RULE) && /never compute, round, convert or reword that figure/.test(READER_RULE) && /never state any other price, change or percentage about this reader's earlier questions/.test(READER_RULE), 'the rule: quote the figure as given or leave it out; never compute, round or restate another');
  ok(!/changeSinceLastAskPct|priceThen/.test(READER_RULE), '…and it names no field a figure could be computed from');
  ok(/timesThisWeek is 2 or more/.test(READER_RULE), 'the count callback is the one the owner approved, unchanged');
  // A split-sized move since the last ask: the read is served, and no figure reaches the prompt or the receipt.
  summaryReply = { ...REMEMBERED, thisAsset: { ...REMEMBERED.thisAsset, lastPrice: 2000 } };
  const afterSplit = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  const splitCio = models().find((c) => byRole(c) === 'cio')!;
  eq([afterSplit.statusCode, afterSplit.body.personalized, afterSplit.body.memory], [200, true, { recorded: true, asks: 8, lastAskedDaysAgo: 2, changeSinceLastAskPct: null }], 'NVDA stored at 2000, now 200 (a 10-for-1 split): served, with no change in the receipt');
  ok(!('sinceLastAsk' in inputOf(splitCio).reader.thisAsset) && !/2000|90/.test(JSON.stringify(inputOf(splitCio).reader)), '…and nothing about that move in what the CIO is handed: no "-90%" to say');
  eq(inputOf(splitCio).reader.thisAsset.timesThisWeek, 1, '…the rest of the reader is as before');
  eq(calls.filter((c) => c.url.includes('rpc/bobby_memory_summary')).length, 1, '…from one summary read, not a second query');
  eq(recorded().length, 1, '…and `recorded: true` is a request that records');
  // A first ask about an asset: it counts itself, and there is no last time to speak of.
  summaryReply = { ...REMEMBERED, thisAsset: null };
  const firstAsk = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  eq([firstAsk.body.memory, recorded().length], [{ recorded: true, asks: 1, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, 1], 'a first ask: asks 1, nulls for what does not exist');
  summaryReply = REMEMBERED;

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
  eq(off.body.memory, { recorded: false, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, '…and the receipt says so: paused, nothing kept, and no count (it was not read), never a zero');
  // A paused memory tells nothing even if the database were to return counts with it.
  summaryReply = { ...REMEMBERED, enabled: false };
  const pausedWithRows = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  eq([pausedWithRows.body.memory, 'personalized' in pausedWithRows.body, recorded().length], [{ recorded: false, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, false, 0], 'paused: no stored count leaves the server, nothing recorded');
  summaryReply = REMEMBERED;

  // The write did not happen: the read is still delivered, the receipt says `recorded: false`, and this
  // question is not counted (7 asks before, 7 now).
  {
    const quietRecord = console.error; console.error = () => {};
    for (const [what, reply] of [
      ['the database refuses the ask (memory paused from another device meanwhile)', () => json(false)],
      ['the database answers 500', () => json({ message: 'down' }, 500)],
      ['the database answers something that is not true', () => json({ recorded: true })],
      ['the request fails', () => { throw new TypeError('fetch failed'); }],
    ] as const) {
      recordReply = reply;
      const res = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
      eq([res.statusCode, res.body.memory, res.body.personalized], [200, { recorded: false, asks: 7, lastAskedDaysAgo: 2, changeSinceLastAskPct: null }, true], `${what}: the answer is served, not recorded, asks stays 7`);
      eq([recorded().length, calls.some((c) => c.method === 'DELETE')], [1, false], `${what}: asked once, never again, and nothing is refunded`);
    }
    // Slower than the cap: the reader is not kept waiting, and an ask without a confirmation is not claimed.
    recordReply = () => new Promise((resolve) => setTimeout(() => resolve(json(true)), MEMORY_RECORD_TIMEOUT_MS + 2500));
    const began = Date.now();
    const slowWrite = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
    const waited = Date.now() - began;
    recordReply = () => json(true);
    console.error = quietRecord;
    eq([slowWrite.statusCode, slowWrite.body.memory], [200, { recorded: false, asks: 7, lastAskedDaysAgo: 2, changeSinceLastAskPct: null }], 'the write is slower than its cap: the answer is served with recorded false');
    ok(waited >= MEMORY_RECORD_TIMEOUT_MS - 50 && waited < MEMORY_RECORD_TIMEOUT_MS + 2000, `…after the cap, not the write's own time (${waited} ms)`);
    eq(MEMORY_RECORD_TIMEOUT_MS, MEMORY_SUMMARY_TIMEOUT_MS, "the cap is the summary read's: 800 ms");
    // A first ask whose write fails: memory was read and holds nothing of this asset.
    summaryReply = { ...REMEMBERED, thisAsset: null };
    recordReply = () => json(false);
    const firstUnwritten = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
    recordReply = () => json(true);
    eq(firstUnwritten.body.memory, { recorded: false, asks: 0, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, 'a first ask that was not written: asks 0 is what memory holds');
    summaryReply = REMEMBERED;
  }

  // Anonymous and wallet readers: not a single memory or identity call.
  for (const [who, headers] of [['anonymous', {}], ['wallet session', { 'x-bobby-session': 'bws.wallet-session-token' }], ['wallet bearer', { authorization: 'Bearer bws.wallet-session-token' }]] as const) {
    const res = await run({}, headers);
    await settle();
    eq([res.statusCode, 'personalized' in res.body, 'memory' in res.body], [200, false, false], `${who}: a plain answer, no receipt`);
    eq([memoryCalls().length, authCalls().length, calls.some((c) => c.url.includes('bobby_identities'))], [0, 0, false], `${who}: no memory, auth or identity call`);
    ok(!models().some((c) => 'reader' in inputOf(c)), `${who}: no reader`);
  }

  // A web memory preference never opts an iPhone in. Invalid header values also fail closed.
  const ios = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios' });
  await settle();
  eq([ios.statusCode, 'personalized' in ios.body, memoryCalls().length, authCalls().length], [200, false, 0, 1], 'iPhone default off: no memory call or personalization; only the read meter resolves the account');
  eq('memory' in ios.body, false, '…and no receipt: memory does not apply without the opt-in');
  const invalidIos = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios', 'x-bobby-memory-opt-in': 'true' });
  await settle();
  eq([invalidIos.statusCode, memoryCalls().length, recorded().length], [200, 0, 0], 'non-exact iPhone affirmation records nothing');
  const optedIos = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios', 'x-bobby-memory-opt-in': '1' });
  await settle();
  eq([optedIos.body.personalized, recorded().length, authCalls().length], [true, 1, 1], 'opted-in iPhone: personalized and recorded for its verified account');
  eq(optedIos.body.memory, { recorded: true, asks: 8, lastAskedDaysAgo: 2, changeSinceLastAskPct: null }, '…with the receipt');
  eq(recorded()[0].body.p_identity, IDENT, 'native record belongs to the bearer account');
  const secondIos = await run({}, { ...SIGNED_IN_B, 'x-bobby-platform': 'ios', 'x-bobby-memory-opt-in': '1' });
  await settle();
  eq([secondIos.body.personalized, recorded()[0].body.p_identity], [true, IDENT_B], 'another account cannot inherit the first account identity');
  summaryReply = { ...REMEMBERED, enabled: false };
  const pausedIos = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios', 'x-bobby-memory-opt-in': '1' });
  await settle();
  eq([pausedIos.statusCode, 'personalized' in pausedIos.body, recorded().length], [200, false, 0], 'server-side pause blocks iPhone personalization and recording even with a header');
  eq(pausedIos.body.memory.recorded, false, '…and the receipt says nothing was recorded');
  summaryReply = REMEMBERED;

  // Android (1.8) may use memory under the iPhone's rule: only with the per-request opt-in its app sends after
  // its own consent. Without the header, or with any other value, the desk makes no memory call at all.
  const android = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'android' });
  await settle();
  eq([android.statusCode, 'personalized' in android.body, 'memory' in android.body, memoryCalls().length, authCalls().length], [200, false, false, 0, 1], 'Android without the opt-in header: no memory call, no personalization, no receipt');
  ok(!models().some((c) => 'reader' in inputOf(c)), '…and no reader for any role');
  const invalidAndroid = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'android', 'x-bobby-memory-opt-in': 'yes' });
  await settle();
  eq([invalidAndroid.statusCode, memoryCalls().length, recorded().length, 'memory' in invalidAndroid.body], [200, 0, 0, false], 'a non-exact Android affirmation fails closed');
  const optedAndroid = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'android', 'x-bobby-memory-opt-in': '1' });
  await settle();
  eq([optedAndroid.body.personalized, optedAndroid.body.memory, authCalls().length], [true, { recorded: true, asks: 8, lastAskedDaysAgo: 2, changeSinceLastAskPct: null }, 1], 'opted-in Android: personalized, with the receipt, for its verified account');
  eq([calls.filter((c) => c.url.includes('rpc/bobby_memory_summary')).length, recorded().length, recorded()[0].body.p_identity], [1, 1, IDENT], '…one summary read and one record, for the bearer account');
  ok('reader' in inputOf(models().find((c) => byRole(c) === 'cio')!) && !models().filter((c) => byRole(c) !== 'cio').some((c) => 'reader' in inputOf(c)), '…and the reader reaches the CIO only, as on the other platforms');
  const guestAndroid = await run({}, { 'x-bobby-platform': 'android', 'x-bobby-memory-opt-in': '1' });
  await settle();
  eq([guestAndroid.statusCode, memoryCalls().length, recorded().length, 'memory' in guestAndroid.body], [200, 0, 0, false], 'an Android guest cannot opt in by sending a header');
  summaryReply = { ...REMEMBERED, enabled: false };
  const pausedAndroid = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'android', 'x-bobby-memory-opt-in': '1' });
  await settle();
  eq([pausedAndroid.body.memory, 'personalized' in pausedAndroid.body, recorded().length], [{ recorded: false, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, false, 0], 'a server-side pause holds on Android too');
  summaryReply = REMEMBERED;
  const guestIos = await run({}, { 'x-bobby-platform': 'ios', 'x-bobby-memory-opt-in': '1' });
  await settle();
  eq([guestIos.statusCode, memoryCalls().length, recorded().length], [200, 0, 0], 'a guest cannot opt in by sending a header');
  const web = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'web' });
  await settle();
  eq([web.body.personalized, recorded().length], [true, 1], 'the same account on the web: personalized and recorded');

  // Kill switch off (unset or not exactly 'on'): a signed-in web reader gets no memory call at all.
  for (const value of [undefined, 'true']) {
    if (value === undefined) delete process.env.BOBBY_MEMORY; else process.env.BOBBY_MEMORY = value;
    const killed = await run({ question: 'Is NVDA worth a look?' }, { ...SIGNED_IN, 'x-bobby-platform': 'web' });
    await settle();
    eq([killed.statusCode, 'personalized' in killed.body, 'memory' in killed.body], [200, false, false], `BOBBY_MEMORY=${value ?? 'unset'}: a plain answer, no receipt`);
    // The single auth lookup is the account's read meter; memory adds none.
    eq([memoryCalls().length, authCalls().length, recorded().length], [0, 1, 0], `BOBBY_MEMORY=${value ?? 'unset'}: no memory read, only the meter's identity lookup, nothing recorded`);
    ok(!models().some((c) => 'reader' in inputOf(c)), `BOBBY_MEMORY=${value ?? 'unset'}: no reader for any role`);
    const killedAndroid = await run({ question: 'Is NVDA worth a look?' }, { ...SIGNED_IN, 'x-bobby-platform': 'android', 'x-bobby-memory-opt-in': '1' });
    await settle();
    eq([killedAndroid.statusCode, 'memory' in killedAndroid.body, memoryCalls().length], [200, false, 0], `BOBBY_MEMORY=${value ?? 'unset'}: the Android opt-in changes nothing`);
  }
  process.env.BOBBY_MEMORY = 'on';
  const backOn = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  eq([backOn.body.personalized, recorded().length], [true, 1], "BOBBY_MEMORY=on: personalized and recorded again");

  cancelAtCio = true;
  const cancelledIos = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios', 'x-bobby-memory-opt-in': '1' });
  cancelAtCio = false;
  await settle();
  eq([cancelledIos.body, recorded().length], [null, 0], 'a native reader that closes before delivery records nothing');
  cancelAtCio = true;
  const cancelledWeb = await run({}, { ...SIGNED_IN, accept: 'application/x-ndjson' });
  cancelAtCio = false;
  await settle();
  eq([cancelledWeb.lines().some((l: any) => l.type === 'final'), recorded().length], [false, 0], 'an abandoned live read records nothing either: the write waits for a complete answer whose reader is still there');

  // Storage down or slow: the read runs without memory, in time.
  storageDown = true;
  const quiet = console.error; console.error = () => {};
  const down = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  storageDown = false;
  console.error = quiet;
  await settle();
  eq([down.statusCode, 'personalized' in down.body], [200, false], 'memory storage down: the answer is served without memory');
  eq(recorded().length, 1, '…and the database still decides whether to record the delivered answer');
  eq(down.body.memory, { recorded: true, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }, '…and the receipt says what is known: the write was confirmed, the counts could not be read (null, not zero)');
  // Storage down for the write too: nothing recorded, nothing claimed.
  storageDown = true; recordReply = () => json({ message: 'down' }, 500); console.error = () => {};
  const allDown = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  storageDown = false; recordReply = () => json(true); console.error = quiet;
  eq([allDown.statusCode, allDown.body.memory], [200, { recorded: false, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }], 'summary and write both down: the answer is served; not recorded, no counts');
  summaryDelayMs = MEMORY_SUMMARY_TIMEOUT_MS + 1200;
  const started = Date.now();
  const slow = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  const took = Date.now() - started;
  summaryDelayMs = 0;
  eq([slow.statusCode, 'personalized' in slow.body, slow.body.memory], [200, false, { recorded: true, asks: null, lastAskedDaysAgo: null, changeSinceLastAskPct: null }], 'a slow summary is skipped: no personalization, and a receipt with the write\'s answer and no counts');
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
  eq([rejected.statusCode, rejected.body.code, recorded().length, 'memory' in rejected.body], [503, 'analysis_failed', 0, false], 'a guard rejection: analysis_failed, nothing recorded and no receipt');
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
  eq(lines.at(-1).data.memory, { recorded: true, asks: 8, lastAskedDaysAgo: 2, changeSinceLastAskPct: null }, 'the final line carries the receipt');
  ok(lines.slice(0, -1).every((l: any) => !('memory' in l) && !/"memory"|lastAskedDaysAgo/.test(JSON.stringify(l))), '…and no earlier line does');
  eq([recorded().length, answeredBeforeRecord], [1, [false]], 'the streamed answer is recorded once it is complete, before the final line that says so');

  console.log(`user-memory: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
}
