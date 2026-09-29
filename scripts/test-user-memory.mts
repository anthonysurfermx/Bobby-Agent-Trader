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

const { readerContext, memoryPersonalizationOn, MEMORY_SUMMARY_TIMEOUT_MS, preferredNameFrom, cleanName, dayPhrase } = await import('../api/_lib/user-memory.ts');
const { horizonOf, publicTextViolation } = await import('../api/_lib/desk-debate.ts');
const { asksForRelated } = await import('../api/_lib/desk-related.ts');
const { validReason, templateNote } = await import('../api/_lib/memory-note.ts');
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
const memoryCalls = () => calls.filter((c) => /rpc\/bobby_memory_|bobby_user_(assets|prefs|reads)/.test(c.url));
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
let readRows: unknown[] = [];
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
  if (c.url.includes('bobby_user_reads?identity_id=eq.')) return storageDown ? json({ message: 'down' }, 500) : json(readRows);
  return null;
}

try {
  // ---------- readerContext ----------
  const now = Date.parse('2026-09-29T12:00:00Z'); // a Tuesday
  const summary = (over: Record<string, unknown> = {}) => ({
    enabled: true, preferredName: null, prefs: { horizon: 'month', experience: 'new', risk: null },
    top: [
      { symbol: 'NVDA', asks: 7, lastAskedAt: '2026-09-28T12:00:00.000Z', lastHorizon: 'week' },
      { symbol: 'AMD', asks: 3, lastAskedAt: '2026-09-20T12:00:00.000Z', lastHorizon: 'unspecified' },
      { symbol: 'SOL', asks: 1, lastAskedAt: '2026-09-29T10:00:00.000Z', lastHorizon: 'intraday' },
    ],
    thisAsset: { asks: 7, lastAskedAt: '2026-09-26T12:00:00.000Z', lastHorizon: 'week', recentAsks: ['2026-09-26T12:00:00.000Z', '2026-09-22T12:00:00.000Z'], lastPrice: null, lastPriceAt: null },
    lastRead: null,
    ...over,
  }) as any;
  const TZ = 'America/Mexico_City';
  eq(readerContext(summary(), { symbol: 'NVDA', now, timeZone: 'UTC' }), {
    prefs: { horizon: 'month', experience: 'new' },
    thisAsset: { asks: 7, lastAskedDaysAgo: 3, lastAskedPhrase: 'on Saturday', lastHorizon: 'week', timesThisWeek: 1 },
  }, 'explicit preferences and this asset (the other assets never reach the note)');
  eq(readerContext(summary(), { symbol: 'NVDA', now })?.thisAsset, { asks: 7, lastHorizon: 'week' }, 'no time zone: no day, no weekly count, no callback');
  eq(readerContext(summary(), { symbol: 'NVDA', now, name: 'Anthony' })?.name, 'Anthony', 'the name reaches the note only with memory on');
  eq(readerContext(summary(), { symbol: 'NVDA', now, name: '<b>x</b>' })?.name, undefined, 'a name that is not a name is dropped');
  {
    // "This week" is the reader's calendar week (Monday first, their time zone), not the last 7 days.
    const week = summary({ thisAsset: { asks: 3, lastAskedAt: '2026-09-28T12:00:00.000Z', lastHorizon: 'week', recentAsks: ['2026-09-28T12:00:00.000Z', '2026-09-27T12:00:00.000Z', '2026-09-24T12:00:00.000Z'], lastPrice: null, lastPriceAt: null } });
    eq(readerContext(week, { symbol: 'NVDA', now, timeZone: 'UTC' })?.thisAsset?.timesThisWeek, 2, 'Monday counts, Sunday and last Thursday do not: second time this week');
    const full = summary({ thisAsset: { asks: 100, lastAskedAt: '2026-09-29T10:00:00.000Z', lastHorizon: 'week', recentAsks: Array.from({ length: 100 }, () => '2026-09-29T10:00:00.000Z'), lastPrice: null, lastPriceAt: null } });
    eq(readerContext(full, { symbol: 'NVDA', now, timeZone: 'UTC' })?.thisAsset?.timesThisWeek, undefined, 'every kept time is this week: the count could be incomplete, so none');
    // Monday 23:30 in Mexico City is already Tuesday in UTC: the phrase follows the reader.
    const late = summary({ thisAsset: { asks: 1, lastAskedAt: '2026-09-29T05:30:00.000Z', lastHorizon: 'week', recentAsks: ['2026-09-29T05:30:00.000Z'], lastPrice: null, lastPriceAt: null } });
    eq(readerContext(late, { symbol: 'NVDA', now, timeZone: TZ, language: 'es' })?.thisAsset?.lastAskedPhrase, 'ayer', 'Monday 23:30 in Mexico City is "ayer" on Tuesday there');
    eq(readerContext(late, { symbol: 'NVDA', now, timeZone: 'UTC' })?.thisAsset?.lastAskedPhrase, 'earlier today', '…and "earlier today" in UTC');
    eq(readerContext(late, { symbol: 'NVDA', now, timeZone: 'Not/AZone' })?.thisAsset?.lastAskedPhrase, undefined, 'an invalid time zone: no day at all, never a guess');
  }
  {
    // Day phrases carry their own preposition, per language.
    const at = (iso: string, lang: 'en' | 'es' | 'pt') => dayPhrase(Date.parse(iso), now, 'UTC', lang);
    eq([at('2026-09-26T12:00:00Z', 'en'), at('2026-09-26T12:00:00Z', 'es'), at('2026-09-26T12:00:00Z', 'pt'), at('2026-09-25T12:00:00Z', 'pt')], ['on Saturday', 'el sábado', 'no sábado', 'na sexta-feira'], 'weekday phrases');
    eq([at('2026-09-10T12:00:00Z', 'en'), at('2026-09-10T12:00:00Z', 'es'), at('2026-09-10T12:00:00Z', 'pt')], ['on September 10', 'el 10 de septiembre', 'em 10 de setembro'], 'date phrases');
  }
  {
    // Callback: the price the last read used, with its own time, against this read's price and time.
    const priced = (lastPriceAt: string | null, lastAskedAt = '2026-09-26T12:00:00.000Z') => summary({ thisAsset: { asks: 7, lastAskedAt, lastHorizon: 'week', recentAsks: [lastAskedAt], lastPrice: 200, lastPriceAt } });
    const at = (o: Record<string, unknown>) => readerContext(priced((o.thenAt as string) ?? '2026-09-26T11:00:00.000Z', o.askedAt as string | undefined), { symbol: 'NVDA', now: (o.now as number) ?? now, priceNow: (o.price as number) ?? 230, priceNowAt: o.nowAt === undefined ? '2026-09-29T11:00:00.000Z' : o.nowAt as string | null, timeZone: 'UTC' })?.thisAsset?.changeSinceLastAskPct;
    eq(at({}), 15, 'up 15% since Saturday, computed by the server from two dated prices');
    eq(at({ price: 170 }), -15, 'a fall keeps its sign');
    eq(readerContext(priced(null), { symbol: 'NVDA', now, priceNow: 230, priceNowAt: '2026-09-29T11:00:00.000Z', timeZone: 'UTC' })?.thisAsset?.changeSinceLastAskPct, undefined, 'a stored price without its time: no callback');
    eq(at({ nowAt: null }), undefined, 'no time for the new price: no callback');
    eq(at({ nowAt: '2026-09-26T10:00:00.000Z' }), undefined, 'a new price older than the stored one (stale evidence): no callback');
    eq(at({ thenAt: '2026-09-29T08:00:00.000Z', askedAt: '2026-09-29T09:00:00.000Z' }), undefined, 'same calendar day: no callback, the chart already shows it');
    eq(at({ thenAt: '2026-09-28T22:55:00.000Z', askedAt: '2026-09-28T23:00:00.000Z', now: Date.parse('2026-09-29T09:00:00Z'), nowAt: '2026-09-29T08:59:00.000Z' }), 15, 'Monday 23:00 → Tuesday 09:00: yesterday, with the callback');
  }
  {
    // The previous answer: exactly what was stored, with its horizon and level; "last time" without a time zone.
    const read = { deliveredAt: '2026-09-28T12:00:00.000Z', horizon: 'week', level: 'rapido', verdict: 'wait', direction: 'none', headline: 'Not yet.', why: 'The trend is down.', risk: 'A bounce can fail.', watch: 'The 50-day average.', language: 'en', price: 200, priceAt: '2026-09-28T11:00:00.000Z' };
    eq(readerContext(summary({ lastRead: read }), { symbol: 'NVDA', now, timeZone: 'UTC' })?.previousRead, { dayPhrase: 'yesterday', daysAgo: 1, horizon: 'week', level: 'rapido', verdict: 'wait', direction: 'none', headline: 'Not yet.', why: 'The trend is down.', risk: 'A bounce can fail.', language: 'en' }, 'the stored answer, with its day, horizon and level');
    eq(readerContext(summary({ lastRead: read }), { symbol: 'NVDA', now, language: 'es' })?.previousRead?.dayPhrase, 'la última vez', 'no time zone: "la última vez", never a made-up day');
    eq(readerContext(summary({ lastRead: { ...read, deliveredAt: '2026-10-01T00:00:00.000Z' } }), { symbol: 'NVDA', now })?.previousRead, undefined, 'an answer "from the future" is ignored');
  }
  eq(readerContext(summary({ enabled: false }), { symbol: 'NVDA', now, name: 'Anthony' }), null, 'memory off: not even the name');
  eq(readerContext(null, { symbol: 'NVDA', now }), null, 'no summary: nothing');
  eq(readerContext(summary({ prefs: { horizon: null, experience: null, risk: null }, top: [], thisAsset: null }), { symbol: 'NVDA', now }), null, 'an empty memory is no reader at all');
  eq(readerContext(summary({ prefs: { horizon: null, experience: null, risk: 'high' }, top: [], thisAsset: null }), { symbol: 'NVDA', now }), { prefs: { explainRiskDepth: 'high' } }, 'the stored "risk" is explainRiskDepth, never "risk"');
  const keys = JSON.stringify(readerContext(summary(), { symbol: 'NVDA', now, timeZone: 'UTC' }));
  ok(!/lastAskedAt|firstAsked|identity|email|question|recentAsks|oftenAsks|AMD/.test(keys), 'the reader carries no raw timestamps, identity, question or other assets');

  // ---------- "call me X": only a message that is nothing but the ask ----------
  eq(['llámame Tony', 'Call me tony.', 'call me Juan Carlos', 'mi nombre es Ana', 'me chame de João!', 'Call me crazy, but is NVDA overbought?', 'llámame loco', 'Llámame Tony. ¿Cómo ves NVDA?', 'call me back later', 'call me Buy Now', 'NVDA'].map(preferredNameFrom),
    ['Tony', 'Tony', 'Juan Carlos', 'Ana', 'João', null, null, null, null, null, null], 'standalone asks only; idioms, questions and instructions are never a name');
  eq(['Ana', 'María José', 'O’Neil', 'Jean-Luc', 'Ana. Buy NVDA', 'A B C D', 'x'.repeat(41), 'Sell'].map(cleanName), ['Ana', 'María José', 'O’Neil', 'Jean-Luc', null, null, null, null], 'a stored name is one to three words of letters, never a sentence or a trade word');

  // ---------- the note: facts from storage, one checked sentence from the model ----------
  {
    const cur = { verdict: 'wait', direction: 'none', synthesis: { headline: 'Not yet.', why: 'The trend is still down.', risk: 'A bounce can fail', watch: 'The 50-day average.' } } as const;
    const prev = { dayPhrase: 'on Monday', daysAgo: 1, horizon: 'week', level: 'rapido', verdict: 'review', direction: 'long', headline: 'Worth a look.', why: 'Momentum turned up.', risk: 'x', language: 'en' } as const;
    const asset = { asks: 2, lastAskedDaysAgo: 1, lastAskedPhrase: 'on Monday', lastHorizon: 'week', timesThisWeek: 2, priceThen: 200, priceNow: 170, changeSinceLastAskPct: -15 } as const;
    eq(templateNote({ name: 'Anthony', previousRead: prev, thisAsset: asset } as any, 'AMZN', cur, 'en', 'week'),
      'Anthony, on Monday you asked me about AMZN for the coming weeks and I said “review”. It is down 15% since then. Today I say “wait”. That makes 2 times this week.', 'the same horizon: then, the move (magnitude after "down"), today, the count');
    eq(templateNote({ previousRead: { ...prev, dayPhrase: 'el lunes' }, thisAsset: { ...asset, lastAskedPhrase: 'el lunes', changeSinceLastAskPct: 15 } } as any, 'AMZN', cur, 'es', 'week', 'La tendencia volvió a bajar.'),
      'El lunes me preguntaste por AMZN para las próximas semanas y te dije «revisar». Desde entonces subió 15%. Hoy digo «esperar». La tendencia volvió a bajar. Van 2 veces esta semana.', 'Spanish, capitalized without a name, with the checked reason');
    eq(templateNote({ previousRead: prev } as any, 'AMZN', cur, 'en', 'long'), 'On Monday you asked me about AMZN for the coming weeks and I said “review”.', 'another horizon today: the past read with its horizon, never a "now I say" contrast');
    eq(templateNote({ thisAsset: { asks: 3, lastHorizon: 'week' } } as any, 'AMZN', cur, 'en', 'week'), null, 'no day and no stored answer: nothing to say');
    eq(templateNote({ name: 'Ana', previousRead: { ...prev, verdict: 'wait', horizon: 'unspecified' }, prefs: { explainRiskDepth: 'high' } } as any, 'AMZN', cur, 'en', 'unspecified'), 'Ana, on Monday you asked me about AMZN and I said “wait”. Today I still say “wait”. The main risk: A bounce can fail.', 'a reader who wants risk explained hears the main risk');
    eq([validReason('The trend turned down below its average.'), validReason('It fell 15% so wait.'), validReason('Last time I said it would rise.'), validReason('You should buy the dip.'), validReason('Momentum is back above the average')],
      ['The trend turned down below its average.', null, null, null, 'Momentum is back above the average.'], 'the model sentence: no numbers, verdict or advice words, no claims about past answers');
  }

  // ---------- exposures: configuration only, inside the universe ----------
  {
    const { ASSET_EXPOSURES, peersOf } = await import('../src/lib/asset-exposures.ts');
    const { VOICE_ASSETS } = await import('../src/lib/voice-assets.ts');
    const universe = new Set(VOICE_ASSETS.map((a) => a.symbol));
    eq(Object.keys(ASSET_EXPOSURES).filter((sym) => !universe.has(sym)), [], 'every classified asset is in the desk universe (its data can be loaded)');
    eq(peersOf('AMZN').map((p) => [p.symbol, p.exposure]), [['WMT', 'ecommerce'], ['MSFT', 'cloud'], ['GOOGL', 'digital_ads']], 'AMZN: one peer per exposure, each defined by it');
    eq(peersOf('BTC').length <= 3 && peersOf('NOPE').length, 0, 'an unclassified asset has no peers');
  }


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
  prefsRows = [{ horizon: 'month', experience: null, risk: 'low', memory_enabled: true, preferred_name: 'Tony' }];
  assetRows = [{ symbol: 'NVDA', asks: 7, last_asked_at: '2026-09-28T12:00:00+00:00', last_horizon: 'week', last_price: '181.5', last_price_at: '2026-09-28T11:00:00+00:00' }, { symbol: 'BTC', asks: 1, last_asked_at: '2026-09-01T12:00:00+00:00', last_horizon: 'unspecified', last_price: 60000, last_price_at: null }];
  readRows = [{ symbol: 'NVDA', delivered_at: '2026-09-28T12:00:05+00:00', horizon: 'week', level: 'rapido', verdict: 'review', direction: 'long', headline: 'Worth a look above the range.', why: 'Momentum turned up.', risk: 'The range can hold.', watch: 'A close above 185.', language: 'en', price: 181.5, price_at: '2026-09-28T11:00:00+00:00' }, { symbol: 'NVDA', delivered_at: 'not a date', verdict: 'wait' }];
  memMock();
  const got = response();
  await memoryHandler(memReq('GET', SIGNED_IN) as never, got as never);
  eq(got.statusCode, 200, 'a signed-in Apple/Google account sees its memory');
  eq(got.body, {
    enabled: true, preferredName: 'Tony', prefs: { horizon: 'month', experience: null, risk: 'low' }, retentionDays: 90,
    assets: [
      { symbol: 'NVDA', asks: 7, lastAskedAt: '2026-09-28T12:00:00.000Z', lastHorizon: 'week', lastPrice: 181.5, lastPriceAt: '2026-09-28T11:00:00.000Z' },
      { symbol: 'BTC', asks: 1, lastAskedAt: '2026-09-01T12:00:00.000Z', lastHorizon: 'unspecified', lastPrice: null, lastPriceAt: null },
    ],
    reads: [{ symbol: 'NVDA', deliveredAt: '2026-09-28T12:00:05.000Z', horizon: 'week', level: 'rapido', verdict: 'review', direction: 'long', headline: 'Worth a look above the range.', why: 'Momentum turned up.', risk: 'The range can hold.', watch: 'A close above 185.', language: 'en', price: 181.5, priceAt: '2026-09-28T11:00:00.000Z' }],
  }, 'GET: everything stored, prices with their own time (a price without one is not shown), the answers as delivered (a broken row is dropped)');
  ok(calls.find((c) => c.url.includes('bobby_user_reads'))!.url.includes(`identity_id=eq.${IDENT}`), 'the answers of this account only');
  const assetsRead = calls.find((c) => c.url.includes('bobby_user_assets'))!;
  ok(assetsRead.url.includes(`identity_id=eq.${IDENT}`) && /last_asked_at=gte\./.test(assetsRead.url) && assetsRead.url.includes('limit=50'), 'only this account, only the last 90 days, at most 50');
  eq(got.headers['cache-control'], 'no-store', 'never cached');
  prefsRows = [];
  memMock();
  const empty = response();
  await memoryHandler(memReq('GET', SIGNED_IN) as never, empty as never);
  eq([empty.body.enabled, empty.body.prefs, empty.body.preferredName], [true, { horizon: null, experience: null, risk: null }, null], 'no preferences row: memory on, nothing set');
  delete process.env.BOBBY_MEMORY;
  memMock();
  const switchedOff = response();
  await memoryHandler(memReq('GET', SIGNED_IN) as never, switchedOff as never);
  eq([switchedOff.statusCode, switchedOff.body.enabled], [200, true], 'with the kill switch off, /api/memory still shows what is stored');
  memMock();
  const offDelete = response();
  await memoryHandler(memReq('DELETE', SIGNED_IN, { query: { all: '1' } }) as never, offDelete as never);
  eq([offDelete.statusCode, calls.some((c) => c.url.includes('rpc/bobby_memory_forget'))], [200, true], '…and still deletes it');
  process.env.BOBBY_MEMORY = 'on';

  for (const [body, why] of [
    [{ horizon: 'forever' }, 'an unknown horizon'], [{ risk: 'reckless' }, 'an unknown risk'], [{ experience: 'guru' }, 'an unknown experience'],
    [{ horizon: 'unspecified' }, "'unspecified' is not a preference"], [{ memoryEnabled: 'yes' }, 'a non-boolean switch'],
    [{ age: 30 }, 'an unknown field (nothing else is ever stored)'], [{}, 'an empty correction'], [null, 'no body'],
    [{ preferredName: '<script>' }, 'a name that is not a name'], [{ preferredName: 'x'.repeat(41) }, 'a name over 40 characters'], [{ preferredName: 7 }, 'a non-string name'],
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
  const named = response();
  await memoryHandler(memReq('PATCH', SIGNED_IN, { body: { preferredName: '  María José ' } }) as never, named as never);
  const nameWrite = calls.find((c) => c.method === 'POST' && c.url.includes('bobby_user_prefs?on_conflict=identity_id'))!;
  eq([named.statusCode, nameWrite.body.preferred_name, 'horizon' in nameWrite.body], [200, 'María José', false], 'the name is corrected explicitly, trimmed, nothing else touched');
  memMock();
  const unnamed = response();
  await memoryHandler(memReq('PATCH', SIGNED_IN, { body: { preferredName: null } }) as never, unnamed as never);
  eq(calls.find((c) => c.method === 'POST' && c.url.includes('bobby_user_prefs'))!.body.preferred_name, null, 'null clears it (back to the Apple/Google first name)');

  memMock();
  const one = response();
  await memoryHandler(memReq('DELETE', SIGNED_IN, { query: { symbol: 'nvda' } }) as never, one as never);
  const forgetOne = calls.find((c) => c.url.includes('rpc/bobby_memory_forget'))!;
  eq([one.statusCode, forgetOne.body], [200, { p_identity: IDENT, p_symbol: 'NVDA' }], 'DELETE ?symbol=NVDA forgets that asset only');
  memMock();
  const all = response();
  await memoryHandler(memReq('DELETE', SIGNED_IN, { query: { all: '1' } }) as never, all as never);
  eq([all.statusCode, calls.find((c) => c.url.includes('rpc/bobby_memory_forget'))!.body], [200, { p_identity: IDENT, p_symbol: null }], 'DELETE ?all=1 forgets everything');
  for (const [query, why] of [[{}, 'no parameter'], [{ symbol: '' }, 'an empty symbol'], [{ symbol: '   ' }, 'a blank symbol'], [{ all: 'true' }, 'all=true (only all=1 counts)'], [{ symbol: 'NVDA', all: '1' }, 'a symbol together with all=1']] as const) {
    memMock();
    const refusedDelete = response();
    await memoryHandler(memReq('DELETE', SIGNED_IN, { query }) as never, refusedDelete as never);
    eq([refusedDelete.statusCode, refusedDelete.body.code, calls.some((c) => c.url.includes('rpc/bobby_memory_forget'))], [400, 'invalid_request', false], `DELETE with ${why}: 400, nothing erased`);
  }
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
  const lastCandleAt = new Date(candles.at(-1)!.ts).toISOString();
  const daily = Array.from({ length: 60 }, (_, i) => ({ ts: Date.now() - (60 - i) * 24 * H, open: 50 + i, high: 51 + i, low: 49 + i, close: 50 + i, volume: 5 }));
  const ALPHA = 'The recent structure supports a conditional long if the range breaks.';
  const RED = 'The break has not happened and the higher timeframes are still flat.';
  const SYN = { headline: 'Not yet: NVDA is still inside its range.', why: 'Alpha needs a break the chart has not shown.', risk: 'The weekly view is flat, so a break can fail.', watch: 'A close above the range high.', watchLevel: 0, followUp: 'What if NVDA loses the range low?' };
  const CIO = { analysis: 'The evidence does not support a clear case yet; wait for the range to resolve.', verdict: 'wait', direction: 'none', synthesis: SYN };
  const systemOf = (c: Call) => (hostOf(c.url) === 'api.anthropic.com' ? c.body.system : c.body.messages[0].content) as string;
  const inputOf = (c: Call) => JSON.parse(hostOf(c.url) === 'api.anthropic.com' ? c.body.messages[0].content : c.body.messages[1].content);
  const byRole = (c: Call) => (/Write ONE short sentence/.test(systemOf(c)) ? 'note' : /Your role is CIO/.test(systemOf(c)) ? 'cio' : /Red Team: challenge/.test(systemOf(c)) ? 'red' : 'alpha');
  const models = () => calls.filter((c) => hostOf(c.url) === 'api.openai.com' || hostOf(c.url) === 'api.anthropic.com');
  const debateCalls = () => models().filter((c) => byRole(c) !== 'note');
  const noteCalls = () => models().filter((c) => byRole(c) === 'note');
  const openai = (content: unknown) => json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  const claude = (content: unknown) => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(content) }], usage: { input_tokens: 100, output_tokens: 20 } });
  let cioReply: unknown = CIO;
  let noteReply: unknown = { reason: 'The range still holds while momentum fades.' };
  let levelGate: Record<string, unknown> = { allowed: true, code: null, useId: 91 };
  let spend = { day: 0, month: 0 };
  const deskMock = () => mock((c) => {
    const r = backend(c); if (r) return r;
    if (c.url.includes('rpc/bobby_consume_desk_quota')) return json(true);
    if (c.url.includes('rpc/bobby_llm_spend')) return json(spend);
    if (c.url.includes('rpc/bobby_consume_level')) return json({ ...levelGate, tier: 'free', used: 1, limit: 3, resetsAt: null });
    if (c.url.includes('bobby_level_uses?id=eq.') && c.method === 'DELETE') return json([]);
    if (c.url.includes('bobby_llm_usage')) return json(null, 201);
    if ((c.url.includes('/api/stock-candles') && c.url.includes('interval=1d')) || (c.url.includes('/api/okx-candles') && c.url.includes('bar=1D'))) return json({ candles: daily });
    if (c.url.includes('/api/stock-candles') || c.url.includes('/api/okx-candles')) return json({ candles });
    if (c.url.includes('okx.com/api/v5/public')) return json({ data: [] });
    if (c.url.includes('forum_threads')) return json([]);
    if (hostOf(c.url) === 'api.openai.com' || hostOf(c.url) === 'api.anthropic.com') {
      const role = byRole(c);
      const content = role === 'alpha' ? { analysis: ALPHA } : role === 'red' ? { analysis: RED } : role === 'note' ? noteReply : cioReply;
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
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const REMEMBERED = {
    enabled: true, preferredName: null, prefs: { horizon: 'month', experience: 'new', risk: null },
    top: [{ symbol: 'NVDA', asks: 7, lastAskedAt: twoDaysAgo, lastHorizon: 'week' }, { symbol: 'AMD', asks: 4, lastAskedAt: new Date().toISOString(), lastHorizon: 'unspecified' }],
    thisAsset: { asks: 7, lastAskedAt: twoDaysAgo, lastHorizon: 'week', recentAsks: [twoDaysAgo], lastPrice: 180, lastPriceAt: new Date(Date.now() - 2 * 86_400_000 - H).toISOString() },
    lastRead: { deliveredAt: twoDaysAgo, horizon: 'unspecified', level: 'rapido', verdict: 'review', direction: 'long', headline: 'Worth a look above the range.', why: 'Momentum turned up.', risk: 'The range can hold.', watch: 'A close above 185.', language: 'en', price: 180, priceAt: twoDaysAgo },
  };

  // A signed-in reader with memory: the debate never sees it; a note written afterwards does.
  summaryReply = REMEMBERED;
  const served = await run({ question: 'Is NVDA worth a look?', tz: 'America/Mexico_City' }, SIGNED_IN);
  eq([served.statusCode, served.body.personalized, served.body.personal?.source], [200, true, 'model'], 'a personalized answer carries the note');
  eq(served.body.personal.basedOn, { previousRead: true, priceChange: true }, '…and says what it draws on');
  ok(/“review”/.test(served.body.personal.note) && /“wait”/.test(served.body.personal.note) && /up 11\.1%/.test(served.body.personal.note) && /The range still holds while momentum fades\./.test(served.body.personal.note), `the stored verdict, the computed change, today's verdict and the checked reason: ${served.body.personal.note}`);
  ok(debateCalls().every((c) => !('reader' in inputOf(c)) && !/reader\./.test(systemOf(c))), 'no debate role receives memory or a rule about it');
  eq(noteCalls().length, 1, 'one note call');
  ok(calls.indexOf(noteCalls()[0]) > calls.indexOf(debateCalls().at(-1)!), '…after the verdict was final');
  eq(inputOf(noteCalls()[0]), { then: 'Momentum turned up.', now: { headline: SYN.headline, why: SYN.why } }, 'the model sees only the two reasons: no name, no account, no memory');
  const wire = JSON.stringify(served.body);
  eq(wire.match(/"reader"|oftenAsks|thisAsset|"previousRead":\{|lastAskedDaysAgo|"experience"|Momentum turned up/g), null, 'the memory itself never reaches the client');
  const summaryCall = calls.find((c) => c.url.includes('rpc/bobby_memory_summary'))!;
  eq([summaryCall.url.endsWith('rpc/bobby_memory_summary_v2'), summaryCall.body], [true, { p_identity: IDENT, p_symbol: 'NVDA' }], 'the v2 summary is read for this account and asset');
  await settle();
  const rec = recorded();
  eq(rec.length, 1, 'the delivered answer is recorded once');
  eq([rec[0].url.endsWith('rpc/bobby_memory_record_v2'), rec[0].body], [true, {
    p_identity: IDENT, p_symbol: 'NVDA', p_horizon: 'unspecified', p_price: 200, p_price_at: lastCandleAt, p_price_source: 'Yahoo Finance',
    p_read: { verdict: 'wait', direction: 'none', headline: SYN.headline, why: SYN.why, risk: SYN.risk, watch: SYN.watch, level: 'rapido', language: 'en', platform: 'web' },
  }], 'the price with its own observation time and source, and exactly what Bobby answered');
  ok(calls.indexOf(rec[0]) > calls.indexOf(models().at(-1)!), 'after the last model call, never before');
  eq(authCalls().length, 1, 'the account is verified once');

  // Invariance: the same question with and without memory gives the debate identical inputs and the same verdict.
  const plain = await run({ question: 'Is NVDA worth a look?' });
  await settle();
  const strip = (c: Call) => ({ system: systemOf(c), input: inputOf(c) });
  const servedAgain = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  const withMemory = debateCalls().map(strip);
  await settle();
  const plainAgain = await run({ question: 'Is NVDA worth a look?' });
  const withoutMemory = debateCalls().map(strip);
  await settle();
  eq(withMemory, withoutMemory, 'every debate call (system and input) is byte-identical with and without memory');
  eq([servedAgain.body.agents.verdict, servedAgain.body.agents.direction, servedAgain.body.sufficiency], [plainAgain.body.agents.verdict, plainAgain.body.agents.direction, plainAgain.body.sufficiency], '…and so are the verdict, the direction and sufficiency');
  eq([plain.statusCode, 'personal' in plain.body], [200, false], 'without an account: no note');

  // The model sentence is checked, not trusted: numbers or claims about the past drop it; the facts stay.
  noteReply = { reason: 'It fell 40% so the call changed.' };
  const withNumber = await run({ tz: 'UTC' }, SIGNED_IN);
  await settle();
  eq([withNumber.body.personal.source, /40/.test(withNumber.body.personal.note), /up 11\.1%/.test(withNumber.body.personal.note)], ['template', false, true], 'a sentence with a number is dropped; the computed change stays');
  noteReply = { reason: 'Last time I told you it would rise.' };
  const claims = await run({ tz: 'UTC' }, SIGNED_IN);
  await settle();
  eq([claims.body.personal.source, /told you/.test(claims.body.personal.note)], ['template', false], 'a sentence about past answers is dropped');
  summaryReply = { ...REMEMBERED, lastRead: null };
  const noPast = await run({}, SIGNED_IN);
  await settle();
  eq([noteCalls().length, /said|told/.test(noPast.body.personal?.note ?? '')], [0, false], 'no stored answer: no model call and no claim about a past answer');
  summaryReply = { ...REMEMBERED, lastRead: { ...REMEMBERED.lastRead, horizon: 'long' } };
  const otherHorizon = await run({ tz: 'UTC' }, SIGNED_IN);
  await settle();
  eq([noteCalls().length, /Today I/.test(otherHorizon.body.personal.note), /for the long term/.test(otherHorizon.body.personal.note)], [0, false, true], 'a stored answer for another horizon: stated with its horizon, never compared');
  noteReply = { reason: 'The range still holds while momentum fades.' };
  summaryReply = REMEMBERED;

  // A naming phrase inside a question is never a name: nothing is written.
  await run({ question: 'Llámame Tony. ¿Cómo ves NVDA?', language: 'es' }, SIGNED_IN);
  await settle();
  eq(calls.filter((c) => c.method === 'POST' && c.url.includes('bobby_user_prefs')).length, 0, 'the desk never stores a name taken from a question');
  summaryReply = { ...REMEMBERED, preferredName: 'Tony' };
  const storedName = await run({}, SIGNED_IN);
  ok(storedName.body.personal.note.startsWith('Tony, '), 'the stored name opens the note');
  await settle();
  summaryReply = REMEMBERED;

  // A question that names its horizon keeps it.
  const today = await run({ question: '¿Cómo ves NVDA para hoy?', language: 'es' }, SIGNED_IN);
  eq(today.body.sufficiency.horizon, 'intraday', "the question's own horizon wins over the preference");
  await settle();
  eq(recorded()[0].body.p_horizon, horizonOf('¿Cómo ves NVDA para hoy?'), 'and that horizon is what is recorded');

  // Memory off: no note, nothing recorded.
  summaryReply = { ...REMEMBERED, enabled: false, top: [], thisAsset: null, lastRead: null };
  const off = await run({ question: 'Is NVDA worth a look?' }, SIGNED_IN);
  await settle();
  eq([off.statusCode, 'personalized' in off.body, noteCalls().length, recorded().length], [200, false, 0, 0], 'memory paused: a plain answer, no note call, nothing recorded');
  summaryReply = REMEMBERED;

  // Anonymous and wallet readers: not a single memory or identity call.
  for (const [who, headers] of [['anonymous', {}], ['wallet session', { 'x-bobby-session': 'bws.wallet-session-token' }], ['wallet bearer', { authorization: 'Bearer bws.wallet-session-token' }]] as const) {
    const res = await run({}, headers);
    await settle();
    eq([res.statusCode, 'personalized' in res.body, noteCalls().length], [200, false, 0], `${who}: a plain answer, no note`);
    eq([memoryCalls().length, authCalls().length, calls.some((c) => c.url.includes('bobby_identities'))], [0, 0, false], `${who}: no memory, auth or identity call`);
  }

  // The iPhone app: only a build with the memory screen (X-Bobby-Memory: 1) gets memory.
  const ios = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios' });
  await settle();
  eq([ios.statusCode, 'personalized' in ios.body, memoryCalls().length, authCalls().length], [200, false, 0, 0], 'an older iPhone build: no memory call, no note');
  const iosMemory = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'ios', 'x-bobby-memory': '1' });
  await settle();
  eq([iosMemory.body.personalized, recorded().length, recorded()[0].body.p_read.platform], [true, 1, 'ios'], 'a build with the memory screen: the same memory as the web, recorded as ios');
  const iosSpoofed = await run({}, { ...SIGNED_IN, 'x-bobby-platform': 'web', 'x-bobby-memory': '0' });
  await settle();
  eq(iosSpoofed.body.personalized, true, 'the web never needs the header');

  // Kill switch off (unset or not exactly 'on'): a signed-in web reader gets no memory call at all.
  for (const value of [undefined, 'true']) {
    if (value === undefined) delete process.env.BOBBY_MEMORY; else process.env.BOBBY_MEMORY = value;
    const killed = await run({ question: 'Is NVDA worth a look?' }, { ...SIGNED_IN, 'x-bobby-platform': 'web' });
    await settle();
    eq([killed.statusCode, 'personalized' in killed.body], [200, false], `BOBBY_MEMORY=${value ?? 'unset'}: a plain answer`);
    eq([memoryCalls().length, authCalls().length, recorded().length, noteCalls().length], [0, 0, 0, 0], `BOBBY_MEMORY=${value ?? 'unset'}: no memory read, identity lookup, record or note`);
  }
  process.env.BOBBY_MEMORY = 'on';

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

  // The note never breaks a read: a failed note call falls back to the template.
  noteReply = { nope: true };
  const noteBroken = await run({}, SIGNED_IN);
  await settle();
  eq([noteBroken.statusCode, noteBroken.body.personal?.source], [200, 'template'], 'an unusable model answer: the facts-only note, never a failed read');
  noteReply = { reason: 'The range still holds while momentum fades.' };

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
  eq([rejected.statusCode, rejected.body.code, recorded().length, noteCalls().length], [503, 'analysis_failed', 0, 0], 'a guard rejection: analysis_failed, no note, nothing recorded');
  cioReply = CIO;

  // Premium: the meter already resolved the account; memory reuses it; the Sonnet CIO still never sees memory.
  const deep = await run({ question: 'Is NVDA worth a look?', level: 'profundo' }, SIGNED_IN);
  await settle();
  eq([deep.statusCode, deep.body.personalized, deep.body.level], [200, true, 'profundo'], 'Profundo for a signed-in reader is personalized');
  eq(authCalls().length, 1, 'the account is verified once for the meter and the memory');
  ok(debateCalls().every((c) => !('reader' in inputOf(c))) && hostOf(noteCalls()[0].url) === 'api.openai.com', 'the Sonnet debate never sees memory; the note is the fast model');
  eq(recorded()[0]?.body.p_read.level, 'profundo', 'recorded with its level');

  // The live desk: the streamed lines never carry memory; the final body has the note.
  const live = await run({}, { ...SIGNED_IN, accept: 'application/x-ndjson' });
  await settle();
  const lines = live.lines();
  eq([lines.at(-1).type, lines.at(-1).data.personalized, typeof lines.at(-1).data.personal.note], ['final', true, 'string'], 'the final line carries the note');
  ok(lines.every((l: any) => !/"reader"|oftenAsks|thisAsset|"previousRead":\{/.test(JSON.stringify(l))), 'no streamed line carries memory');
  eq(recorded().length, 1, 'the streamed answer is recorded after the final line');

  // ---------- related assets: only when the question asks, with current data ----------
  eq([['¿Qué otras empresas hay en el sector de Amazon?', 'AMZN'], ['Compara Amazon con Walmart', 'AMZN'], ['AMZN vs META', 'AMZN'], ['¿Amazon o Microsoft?', 'AMZN'], ['¿Cómo ves Amazon?', 'AMZN'], ['Is the price comparable to last week?', 'AMZN'], ['¿Qué más puedo hacer?', 'AMZN'], ['en vez de esperar, ¿qué hago con NVDA?', 'NVDA']].map(([q, sym]) => asksForRelated(q, sym)),
    [true, true, true, true, false, false, false, false], 'sector and comparison phrases count; ordinary words do not');
  const sector = await run({ symbol: 'AMZN', question: '¿Qué otras empresas hay en el sector de Amazon?', language: 'es' });
  await settle();
  const peerLoads = calls.filter((c) => c.url.includes('interval=1d'));
  eq(peerLoads.map((c) => new URL(c.url).searchParams.get('symbol')).sort(), ['AMZN', 'GOOGL', 'MSFT', 'WMT'], 'AMZN and one peer per exposure (e-commerce, cloud, ads), each with daily data');
  eq(sector.body.related.exposures, ['comercio electrónico', 'nube', 'publicidad digital'], 'its exposures, in the reader\'s language');
  eq(sector.body.related.peers.map((p: any) => [p.symbol, p.sharedExposure]), [['WMT', 'comercio electrónico'], ['MSFT', 'nube'], ['GOOGL', 'publicidad digital']], 'each peer names the exposure it shares');
  ok(sector.body.related.self && typeof sector.body.related.peers[0].change1mPct === 'number' && sector.body.related.peers[0].vsEma20 === 'above', 'the same daily statistics for the asset and each peer');
  const sectorCio = debateCalls().find((c) => byRole(c) === 'cio')!;
  ok(inputOf(sectorCio).related && /Never rank them as what to buy/.test(systemOf(sectorCio)), 'the CIO gets the peers under a rule that forbids ranking or switching');
  eq(sector.body.evidenceUsed.related, ['WMT', 'MSFT', 'GOOGL'], 'and the answer says which peers it used');
  ok(!('related' in inputOf(debateCalls().find((c) => byRole(c) === 'alpha')!)) && 'related' in inputOf(debateCalls().find((c) => byRole(c) === 'red')!), 'Alpha never sees the peers; Red Team does');
  const versus = await run({ symbol: 'AMZN', question: 'AMZN vs META for the next months?' });
  await settle();
  eq(versus.body.related.peers.map((p: any) => [p.symbol, p.named, p.sharedExposure]), [['META', true, 'digital advertising'], ['WMT', false, 'e-commerce'], ['MSFT', false, 'cloud computing']], 'the asset the question named comes first, then the configured peers');
  const tsla = await run({ symbol: 'TSLA', question: 'What else is in the same sector as Tesla?' });
  await settle();
  eq(tsla.body.related.peers.map((p: any) => p.symbol), ['ARKK'], 'TSLA: its electric-vehicle exposure has a peer');
  const shop = await run({ symbol: 'SHOP', question: 'What else is in the same sector as Shopify?' });
  await settle();
  eq([shop.body.related.noPeers, shop.body.related.peers.length, calls.filter((c) => c.url.includes('interval=1d')).length], [true, 0, 0], 'an asset with no comparables set up: said as such, not as missing data, and nothing loaded');
  eq(publicTextViolation('Better to switch to MSFT now.') !== null && publicTextViolation('MSFT es mejor apuesta que AMZN.') !== null && publicTextViolation('Considere trocar para GOOGL.') !== null, true, 'rotation and ranking language is refused in en/es/pt');
  const noSector = await run({ symbol: 'AMZN', question: '¿Cómo ves Amazon?', language: 'es' });
  await settle();
  eq([calls.filter((c) => c.url.includes('interval=1d')).length, 'related' in noSector.body], [0, false], 'a plain question loads no peers');

  console.log(`user-memory: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
}
