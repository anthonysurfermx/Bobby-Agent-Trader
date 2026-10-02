// Bobby Pro briefings content pipeline without a network or a database (api/_lib/market-snapshot.ts,
// api/_lib/briefings/evidence.ts, narrative.ts, compose.ts):
//   · the market snapshot keeps provider as-of times while the bobby-intel fetchers return their original shapes;
//   · evidence freshness: weekend morning (equities closed, as of Friday), holiday, in-session live/delayed/stale,
//     stale crypto, missing sources, agenda from the stored calendar only (unavailable ⇒ empty + degraded);
//   · weekly: only dated daily closes give a 7d change; without them the quote is missing and degraded;
//   · the narrative schema is strict, the validator rejects invented numbers, links, unknown symbols, overlong
//     text, extra keys and advice, and facts always come from evidence; the facts-only text is grounded (es/en);
//   · composition: ordering, memory only when allowed, exact memoryAssets, cold start, narration bounds,
//     identical audio keys for identical blocks, no name, the 24 KiB guard.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';

const snapshotMod = await import('../api/_lib/market-snapshot.ts');
const { loadGlobalMarketSnapshot, fetchTopStocks, fetchTopStockQuotes, fetchFearGreed, fetchDXY, detectRegime } = snapshotMod;
type GlobalMarketSnapshot = import('../api/_lib/market-snapshot.ts').GlobalMarketSnapshot;
const cal = await import('../api/_lib/briefings/calendar.ts');
const { buildEvidence, fetchDailyCloses, readMacroAgenda, MARKET_HOURS_TITLES } = await import('../api/_lib/briefings/evidence.ts');
const { narrativeRequest, validateNarrative, factsOnlyNarrative, ungroundedNumbers, assetFacts } = await import('../api/_lib/briefings/narrative.ts');
const { composeReport, validateContent, audioCacheKey } = await import('../api/_lib/briefings/compose.ts');
const config = await import('../api/_lib/briefings/config.ts');
type BriefEvidence = import('../api/_lib/briefings/types.ts').BriefEvidence;
type FrozenSettings = import('../api/_lib/briefings/types.ts').FrozenSettings;
type SharedNarrative = import('../api/_lib/briefings/types.ts').SharedNarrative;

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

const policy = { adopted: new Set(['morning', 'close', 'weekly'] as const), morningDays: 'all' as const } as unknown as import('../api/_lib/briefings/calendar.ts').SchedulePolicy;
const ny = (date: string, time: string) => cal.nyLocalToUtc(date, time);
const iso = (d: Date) => d.toISOString();
const MIN = 60_000;

function snapshot(at: Date, over: Partial<GlobalMarketSnapshot> = {}): GlobalMarketSnapshot {
  const fetchedAt = iso(at);
  const fridayClose = iso(ny('2026-10-02', '16:00'));
  return {
    prices: [
      { symbol: 'BTC', price: 67450.12, change24h: 1.23, asOf: fetchedAt },
      { symbol: 'ETH', price: 2450.5, change24h: -0.84, asOf: fetchedAt },
      { symbol: 'OKB', price: 51.2, change24h: 0.1, asOf: fetchedAt },
      { symbol: 'XAUT', price: 3890.4, change24h: 0.31, asOf: fetchedAt },
    ],
    stocks: [
      { symbol: 'SPY', price: 571.32, change24h: 0.45, asOf: fridayClose, prevClose: 568.76 },
      { symbol: 'NVDA', price: 181.2, change24h: -1.1, asOf: fridayClose, prevClose: 183.22 },
      { symbol: 'AAPL', price: 254.1, change24h: 0, asOf: fridayClose, prevClose: null },
    ],
    funding: [{ symbol: 'BTC', rate: 0.0001, annualized: 11, nextFundingTime: '0' }, { symbol: 'ETH', rate: -0.000025, annualized: -2.7, nextFundingTime: '0' }],
    fearGreed: { value: 54, classification: 'Neutral', asOf: iso(new Date(at.getTime() - 8 * 3600_000)) },
    dxy: { dxy: 98.12, asOf: '2026-10-02' },
    regime: detectRegime(1.23),
    fetchedAt,
    sources: [
      { name: 'okx_spot', ok: true }, { name: 'yahoo_equities', ok: true }, { name: 'okx_funding', ok: true },
      { name: 'fear_greed', ok: true }, { name: 'dxy_ecb', ok: true },
    ],
    ...over,
  };
}
const q = (e: BriefEvidence, s: string) => e.quotes.find((x) => x.symbol === s)!;

// =============== 1. market snapshot ===============
{
  const at = ny('2026-10-03', '07:30');
  const s = await loadGlobalMarketSnapshot({
    now: () => at,
    livePrices: async () => [{ symbol: 'BTC', price: 67000, change24h: 6.2 }, { symbol: 'XAG', price: 47.1, change24h: -0.4 }],
    stocks: async () => [{ symbol: 'SPY', price: 571.32, change24h: 0.45, prevClose: 568.76, asOf: iso(ny('2026-10-02', '16:00')) }],
    funding: async () => { throw new Error('down'); },
    fearGreed: async () => null,
    dxy: async () => ({ dxy: 98.1, asOf: '2026-10-02' }),
  });
  eq(s.prices.map((p) => p.asOf), [iso(at), iso(at)], 'crypto asOf = fetch time');
  eq(s.stocks[0].asOf, iso(ny('2026-10-02', '16:00')), 'stock asOf = provider regularMarketTime');
  eq(s.regime?.regime, 'high_vol', 'regime from BTC 24h change');
  eq(s.sources, [{ name: 'okx_spot', ok: true }, { name: 'yahoo_equities', ok: true }, { name: 'okx_funding', ok: false }, { name: 'fear_greed', ok: false }, { name: 'dxy_ecb', ok: true }], 'per-source outcome');
  const noBtc = await loadGlobalMarketSnapshot({ now: () => at, livePrices: async () => [], stocks: async () => [], funding: async () => [], fearGreed: async () => null, dxy: async () => null });
  eq(noBtc.regime, null, 'no BTC ⇒ no regime (never a default 0%)');
  const stalled = await loadGlobalMarketSnapshot({
    now: () => at,
    sourceTimeoutMs: 20,
    livePrices: async () => new Promise<never>(() => {}),
    stocks: async () => [{ symbol: 'SPY', price: 571, change24h: 0.2, prevClose: 570, asOf: iso(at) }],
    funding: async () => [], fearGreed: async () => null, dxy: async () => null,
  });
  eq([stalled.sources[0].ok, stalled.sources[1].ok, stalled.stocks.length], [false, true, 1],
    'a stalled public source times out while the usable sources survive');

  // The bobby-intel fetchers keep their exact output shape; the detailed variants add the as-of.
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('finance/spark')) {
      return new Response(JSON.stringify({ spark: { result: [
        { symbol: 'NVDA', response: [{ meta: { regularMarketPrice: 181.2, chartPreviousClose: 183.22, regularMarketTime: 1759435200 } }] },
        { symbol: 'AAPL', response: [{ meta: { regularMarketPrice: 254.1 } }] },
      ] } }), { status: 200 });
    }
    if (url.includes('alternative.me')) return new Response(JSON.stringify({ data: [{ value: '54', value_classification: 'Neutral', timestamp: '1759363200' }] }), { status: 200 });
    if (url.includes('frankfurter')) return new Response(JSON.stringify({ date: '2026-10-02', rates: { EUR: 0.85, JPY: 147, GBP: 0.74, CAD: 1.39, SEK: 9.4, CHF: 0.8 } }), { status: 200 });
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
  try {
    const stocks = await fetchTopStocks();
    eq(stocks, [{ symbol: 'NVDA', price: 181.2, change24h: -1.1 }, { symbol: 'AAPL', price: 254.1, change24h: 0 }], 'fetchTopStocks output unchanged (keys and values)');
    eq(stocks.map((x) => Object.keys(x)), [['symbol', 'price', 'change24h'], ['symbol', 'price', 'change24h']], 'fetchTopStocks key order unchanged');
    const detailed = await fetchTopStockQuotes();
    eq([detailed[0].asOf, detailed[0].prevClose, detailed[1].prevClose, detailed[1].asOf], ['2025-10-02T20:00:00.000Z', 183.22, null, null], 'detailed quotes keep regularMarketTime / prev close');
    eq(await fetchFearGreed(), { value: 54, classification: 'Neutral' }, 'fetchFearGreed output unchanged');
    const dxy = await fetchDXY();
    eq(Object.keys(dxy ?? {}), ['dxy'], 'fetchDXY output unchanged');
  } finally {
    globalThis.fetch = original;
  }
}

// =============== 2. evidence freshness ===============
const noAgenda = async () => [] as BriefEvidence['agenda'];
const noHistory = async () => [] as NonNullable<BriefEvidence['history']>;
{
  // Saturday morning: equities closed as of Friday's close, crypto live.
  const period = cal.periodForDate('morning', '2026-10-03', policy)!;
  const now = ny('2026-10-03', '07:35');
  const e = await buildEvidence(period, ['btc', 'SPY', 'NVDA', 'XAUT', 'DOGE', 'SPY'], { now: () => now, snapshot: async () => snapshot(new Date(now.getTime() - MIN)), agenda: noAgenda, dailyCloses: noHistory });
  eq(e.quotes.map((x) => x.symbol), ['BTC', 'SPY', 'NVDA', 'XAUT'], 'supported, upper-cased, de-duplicated symbols only');
  eq([q(e, 'BTC').freshness, q(e, 'BTC').changeBasis, q(e, 'BTC').changePct], ['live', '24h', 1.23], 'crypto live over 24h');
  eq([q(e, 'XAUT').freshness, q(e, 'XAUT').kind], ['live', 'metal'], 'metal live');
  eq([q(e, 'SPY').freshness, q(e, 'SPY').changeBasis, q(e, 'SPY').asOf], ['closed', 'prev_close', iso(ny('2026-10-02', '16:00'))], 'weekend: SPY closed, as of Friday close');
  eq([e.equitySession.state, e.equitySession.lastSessionDate], ['closed_weekend', '2026-10-02'], 'equity session label: weekend, last session Friday');
  eq(e.degraded, false, 'all fresh ⇒ not degraded');
  eq(e.dataAsOf, iso(ny('2026-10-02', '16:00')), 'dataAsOf = oldest quote as-of (Friday close)');
  eq(e.macro.dxy?.freshness, 'delayed', 'DXY from the ECB fix is delayed, never live');
  eq(e.macro.fearGreed?.freshness, 'delayed', 'Fear & Greed daily index is delayed');
  eq(e.macro.funding.map((f) => f.ratePct), [0.01, -0.0025], 'funding as % (rate × 100)');
  eq(e.agenda, [], 'weekend window: no session items, no invented events');
  ok(e.sources.find((s) => s.name === 'yahoo_equities')?.freshness === 'closed', 'equity source freshness closed');
  eq(e.history, undefined, 'daily cadence carries no history');

  // A Thursday close on a Saturday is stale; a symbol the source did not return is missing.
  const old = snapshot(now, { stocks: [{ symbol: 'SPY', price: 570, change24h: 0.1, asOf: iso(ny('2026-10-01', '16:00')), prevClose: 569.4 }] });
  const e2 = await buildEvidence(period, ['SPY', 'NVDA'], { now: () => now, snapshot: async () => old, agenda: noAgenda });
  eq([q(e2, 'SPY').freshness, q(e2, 'NVDA').freshness, q(e2, 'NVDA').price, q(e2, 'NVDA').changePct], ['stale', 'missing', null, null], 'older than the last session ⇒ stale; absent ⇒ missing');
  eq(e2.degraded, true, 'stale/missing ⇒ degraded');

  // Yahoo without a previous close: the change is unknown, not 0%.
  const e3 = await buildEvidence(period, ['AAPL'], { now: () => now, snapshot: async () => snapshot(now), agenda: noAgenda });
  eq([q(e3, 'AAPL').changePct, q(e3, 'AAPL').freshness], [null, 'closed'], 'no previous close ⇒ change null');

  // Crypto fetched an hour ago is stale; a failed snapshot leaves everything missing.
  const e4 = await buildEvidence(period, ['BTC'], { now: () => now, snapshot: async () => snapshot(new Date(now.getTime() - 60 * MIN)), agenda: noAgenda });
  eq([q(e4, 'BTC').freshness, e4.degraded, e4.macro.funding[0].freshness], ['stale', true, 'stale'], 'old crypto fetch ⇒ stale');
  const e5 = await buildEvidence(period, ['BTC', 'SPY'], { now: () => now, snapshot: async () => { throw new Error('down'); }, agenda: noAgenda });
  eq([q(e5, 'BTC').freshness, q(e5, 'SPY').freshness, e5.macro.fearGreed, e5.degraded, e5.dataAsOf], ['missing', 'missing', null, true, iso(now)], 'snapshot down ⇒ missing everywhere, dataAsOf = capture time');
  eq(e5.sources.find((s) => s.name === 'okx_spot')?.ok, false, 'failed source reported');

  // Agenda: stored events only, inside the look-ahead window; unavailable table ⇒ empty + degraded.
  const e6 = await buildEvidence(period, ['BTC'], {
    now: () => now, snapshot: async () => snapshot(now),
    agenda: async (from, to) => {
      eq([from, to], [period.scheduledAt, iso(new Date(Date.parse(period.scheduledAt) + 24 * 3600_000))], 'agenda window = scheduledAt + 24h');
      return [{ title: 'Fed speaker', at: iso(ny('2026-10-03', '12:00')), kind: 'macro', severity: 2 }, { title: 'Out of window', at: iso(ny('2026-10-05', '08:30')), kind: 'macro', severity: 3 }];
    },
  });
  eq(e6.agenda.map((a) => a.title), ['Fed speaker'], 'only events inside the window');
  const e7 = await buildEvidence(period, ['BTC'], { now: () => now, snapshot: async () => snapshot(now), agenda: async () => { throw new Error('503'); } });
  eq([e7.agenda, e7.degraded, e7.sources.find((s) => s.name === 'macro_calendar')?.ok], [[], true, false], 'calendar unavailable ⇒ empty agenda, degraded, failed source');

  // readMacroAgenda: read-only PostgREST GET with read headers; drops cancelled / URL titles; throws on HTTP error.
  let seen = '';
  let method = '';
  const rows = await readMacroAgenda('2026-10-05T12:00:00.000Z', '2026-10-06T12:00:00.000Z', (async (url: string | URL, init?: RequestInit) => {
    seen = String(url);
    method = init?.method ?? 'GET';
    return new Response(JSON.stringify([
      { title: 'CPI (Sep)', scheduled_at: '2026-10-05T12:30:00+00:00', severity: 5, state: 'upcoming' },
      { title: 'Cancelled thing', scheduled_at: '2026-10-05T13:00:00+00:00', severity: 1, state: 'cancelled' },
      { title: 'see https://x.test', scheduled_at: '2026-10-05T14:00:00+00:00', severity: 1, state: 'upcoming' },
    ]), { status: 200 });
  }) as typeof fetch);
  ok(seen.startsWith('https://db.test/rest/v1/agent_macro_events?select=title,scheduled_at,severity,state') && method === 'GET', 'agenda reads agent_macro_events (GET)');
  eq(rows, [{ title: 'CPI (Sep)', at: '2026-10-05T12:30:00.000Z', kind: 'macro', severity: 5 }], 'agenda rows sanitized');
  await assert.rejects(readMacroAgenda('a', 'b', (async () => new Response('x', { status: 500 })) as typeof fetch), 'HTTP error throws');
  checks++;
}
{
  // Weekday morning: market-hours items from the NYSE calendar; equities pre-market are closed as of the prior session.
  const period = cal.periodForDate('morning', '2026-10-05', policy)!;
  const now = ny('2026-10-05', '07:35');
  const snap = snapshot(now);
  const e = await buildEvidence(period, ['SPY'], { now: () => now, snapshot: async () => snap, agenda: noAgenda });
  eq(e.agenda.map((a) => [a.title, a.at]), [[MARKET_HOURS_TITLES.open, iso(ny('2026-10-05', '09:30'))], [MARKET_HOURS_TITLES.close, iso(ny('2026-10-05', '16:00'))]], 'session open/close items');
  eq([e.equitySession.state, q(e, 'SPY').freshness], ['pre_market', 'closed'], 'pre-market Monday: Friday close is "closed"');

  // In session: live ≤ 2 min, delayed ≤ 20 min, stale beyond.
  const inSession = ny('2026-10-05', '10:00');
  const at = (minutesAgo: number) => snapshot(inSession, { stocks: [{ symbol: 'SPY', price: 572, change24h: 0.12, asOf: iso(new Date(inSession.getTime() - minutesAgo * MIN)), prevClose: 571.32 }] });
  for (const [m, want] of [[1, 'live'], [10, 'delayed'], [60, 'stale']] as const) {
    const ev = await buildEvidence(period, ['SPY'], { now: () => inSession, snapshot: async () => at(m), agenda: noAgenda });
    eq(q(ev, 'SPY').freshness, want, `in session, ${m} min old ⇒ ${want}`);
  }
}
{
  // Thanksgiving: holiday label, prices as of the Wednesday close; the weekly agenda shows the holiday and early close.
  const period = cal.periodForDate('morning', '2026-11-26', policy)!;
  const now = ny('2026-11-26', '07:35');
  const snap = snapshot(now, { stocks: [{ symbol: 'SPY', price: 600, change24h: 0.2, asOf: iso(ny('2026-11-25', '16:00')), prevClose: 598.8 }] });
  const e = await buildEvidence(period, ['SPY', 'BTC'], { now: () => now, snapshot: async () => snap, agenda: noAgenda });
  eq([e.equitySession.state, e.equitySession.holidayName, e.equitySession.lastSessionDate, q(e, 'SPY').freshness], ['closed_holiday', 'Thanksgiving Day', '2026-11-25', 'closed'], 'holiday: closed as of Wednesday');
  const weekly = cal.periodForDate('weekly', '2026-11-23', policy)!;
  const ew = await buildEvidence(weekly, ['SPY'], { now: () => ny('2026-11-23', '07:35'), snapshot: async () => snap, agenda: noAgenda, dailyCloses: noHistory });
  eq(ew.agenda.map((a) => a.title), [`${MARKET_HOURS_TITLES.holidayPrefix}Thanksgiving Day`, MARKET_HOURS_TITLES.earlyClose], 'weekly look-ahead: holiday + early close only');
}

// =============== 3. weekly history ===============
const weekly = cal.periodForDate('weekly', '2026-10-05', policy)!;
const weeklyNow = ny('2026-10-05', '07:35');
const realHistory: NonNullable<BriefEvidence['history']> = [
  { symbol: 'SPY', from: { at: iso(ny('2026-09-25', '16:00')), price: 560 }, to: { at: iso(ny('2026-10-02', '16:00')), price: 571.32 } },
  { symbol: 'BTC', from: { at: '2026-09-27T00:00:00.000Z', price: 65000 }, to: { at: '2026-10-04T00:00:00.000Z', price: 67450.12 } },
];
{
  const e = await buildEvidence(weekly, ['SPY', 'BTC'], { now: () => weeklyNow, snapshot: async () => snapshot(weeklyNow), agenda: noAgenda, dailyCloses: noHistory });
  eq(e.quotes.map((x) => [x.symbol, x.price, x.changePct, x.changeBasis, x.freshness]), [['SPY', null, null, '7d', 'missing'], ['BTC', null, null, '7d', 'missing']], 'no history ⇒ no 7d change, never the current snapshot');
  eq([e.degraded, e.history, e.sources.find((s) => s.name === 'daily_history')?.ok], [true, [], false], 'weekly without history is degraded');

  let asked: unknown[] = [];
  const e2 = await buildEvidence(weekly, ['SPY', 'BTC', 'ETH'], {
    now: () => weeklyNow, snapshot: async () => snapshot(weeklyNow), agenda: noAgenda,
    dailyCloses: async (symbols, from, to) => { asked = [symbols, from, to]; return [...realHistory, { symbol: 'ETH', from: { at: '2026-10-02T00:00:00.000Z', price: 2400 }, to: { at: '2026-10-03T00:00:00.000Z', price: 2450 } }]; },
  });
  eq(asked, [['SPY', 'BTC', 'ETH'], weekly.periodStart, weekly.periodEnd], 'history requested for the exact interval');
  eq([q(e2, 'SPY').changePct, q(e2, 'SPY').freshness, q(e2, 'SPY').asOf, q(e2, 'SPY').price], [2.02, 'closed', iso(ny('2026-10-02', '16:00')), 571.32], '7d change from dated closes');
  eq([q(e2, 'BTC').changePct, q(e2, 'BTC').changeBasis], [3.77, '7d'], 'crypto 7d from daily candles');
  eq([q(e2, 'ETH').freshness, q(e2, 'ETH').changePct], ['missing', null], 'a 1-day span is not a weekly comparison');
  eq([e2.history?.map((h) => h.symbol), e2.degraded], [['SPY', 'BTC'], true], 'only valid history is kept');

  // fetchDailyCloses: OKX confirmed 1Dutc candles and Yahoo daily bars, picked at the interval bounds.
  const day = 86_400_000;
  const okxRows: string[][] = [];
  for (let t = Date.parse('2026-10-04T00:00:00Z'); t >= Date.parse('2026-09-20T00:00:00Z'); t -= day) {
    const close = String(60000 + (t - Date.parse('2026-09-20T00:00:00Z')) / day * 100);
    okxRows.push([String(t), '0', '0', '0', close, '0', '0', '0', t === Date.parse('2026-10-04T00:00:00Z') ? '0' : '1']);
  }
  const yahooTs: number[] = [];
  const yahooClose: number[] = [];
  for (const d of ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']) {
    yahooTs.push(ny(d, '09:30').getTime() / 1000);
    yahooClose.push(500 + Number(d.slice(-2)));
  }
  const urls: string[] = [];
  const hist = await fetchDailyCloses(['BTC', 'SPY', 'XAG'], weekly.periodStart, weekly.periodEnd, {
    now: weeklyNow,
    fetchImpl: (async (input: string | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes('instId=BTC-USDT&')) return new Response(JSON.stringify({ code: '0', data: okxRows }), { status: 200 });
      if (url.includes('/chart/SPY')) return new Response(JSON.stringify({ chart: { result: [{ timestamp: yahooTs, indicators: { quote: [{ close: yahooClose }] } }] } }), { status: 200 });
      return new Response('{}', { status: 500 });
    }) as typeof fetch,
  });
  ok(urls.some((u) => u.includes('market/history-candles?instId=BTC-USDT&bar=1Dutc')) && urls.some((u) => u.includes('chart/SPY?range=1mo&interval=1d')), 'provider daily candle endpoints');
  eq(hist, [
    { symbol: 'BTC', from: { at: '2026-09-28T00:00:00.000Z', price: 60700 }, to: { at: '2026-10-04T00:00:00.000Z', price: 61300 } },
    { symbol: 'SPY', from: { at: iso(ny('2026-09-25', '16:00')), price: 525 }, to: { at: iso(ny('2026-10-02', '16:00')), price: 502 } },
  ], 'closes picked at the interval bounds; failed symbol omitted; unconfirmed candle ignored');
}

// =============== 4. narrative ===============
const morning = cal.periodForDate('morning', '2026-10-03', policy)!;
const mNow = ny('2026-10-03', '07:35');
const ev: BriefEvidence = await buildEvidence(morning, ['BTC', 'ETH', 'SPY', 'NVDA'], {
  now: () => mNow, snapshot: async () => snapshot(new Date(mNow.getTime() - MIN)), agenda: noAgenda,
});
{
  const req = narrativeRequest(ev, 'es', ['BTC', 'ETH', 'SPY', 'NVDA', 'DOGE']);
  const walk = (node: any, path: string) => {
    if (node && typeof node === 'object' && node.type === 'object') {
      eq(node.additionalProperties, false, `${path}: additionalProperties false`);
      eq([...node.required].sort(), Object.keys(node.properties).sort(), `${path}: every property required`);
      for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.${k}`);
    }
    if (node && node.type === 'array') walk(node.items, `${path}[]`);
  };
  walk(req.schema.schema, 'root');
  eq(Object.keys((req.schema.schema as any).properties), ['opening', 'market', 'assets', 'risks', 'agenda'], 'daily schema has no week');
  eq((req.schema.schema as any).properties.assets.items.properties.symbol.enum, ['BTC', 'ETH', 'SPY', 'NVDA'], 'asset symbols constrained to requested ∩ supported');
  ok(req.system.includes('Mexican Spanish') && /Never describe US equities as trading live/.test(req.system), 'language + closed-session rule');
  const block = JSON.parse(req.user.slice(req.user.indexOf('{'), req.user.lastIndexOf('}') + 1));
  eq(Object.keys(block), ['cadence', 'period', 'capturedAt', 'dataAsOf', 'usEquitySession', 'quotes', 'macro', 'agenda', 'sourcesUnavailable'], 'model sees evidence only');
  eq(block.quotes.find((x: any) => x.symbol === 'SPY'), { symbol: 'SPY', kind: 'etf', freshness: 'closed', asOf: '2026-10-02 16:00 ET', price: 571.32, changePct: 0.45, changeBasis: 'prev_close' }, 'freshness + as-of in the block');
  const wReq = narrativeRequest({ ...ev, cadence: 'weekly', history: [] }, 'en', ['BTC']);
  ok(Object.keys((wReq.schema.schema as any).properties).includes('week') && (wReq.schema.schema as any).required.includes('week'), 'weekly schema requires week');
}

const grounded = {
  opening: 'Así amanece el mercado este sábado.',
  market: { title: 'Panorama', body: 'Bitcoin cotiza en 67,450 USD, arriba 1.2% en 24 h. Las acciones de EE. UU. están cerradas por fin de semana; el S&P 500 (SPY) quedó en 571.32 al cierre del viernes 2 de octubre a las 16:00 ET.' },
  assets: [
    { symbol: 'BTC', title: 'Bitcoin', body: 'BTC sube 1.23% en 24 h y está cerca de 67.5 mil dólares.', explainer: 'El cambio en 24 horas compara el precio actual con el de hace un día.' },
    { symbol: 'SPY', title: 'S&P 500', body: 'SPY cerró el viernes en 571.32, 0.45% arriba del cierre anterior. El mercado reabre el lunes.', explainer: '' },
  ],
  risks: { title: 'Riesgos', body: 'El índice de miedo y codicia está en 54 (neutral). La tasa de financiamiento de BTC es 0.0100%.' },
  agenda: { title: 'Agenda', body: 'No hay eventos registrados en el calendario para hoy.' },
};
const SYMS = ['BTC', 'ETH', 'SPY', 'NVDA'];
let modelNarrative: SharedNarrative;
{
  const n = validateNarrative(JSON.stringify(grounded), ev, 'es', SYMS, 'claude-sonnet-5-5');
  ok(n, 'grounded sample accepted');
  modelNarrative = n!;
  eq([n!.source, n!.model, Object.keys(n!.assets)], ['model', 'claude-sonnet-5-5', ['BTC', 'SPY']], 'model narrative');
  eq(n!.assets.BTC.facts, assetFacts(q(ev, 'BTC'), 'es'), 'asset facts copied from evidence');
  eq(n!.assets.SPY.facts?.[0], { label: 'Precio', value: '571.32 USD' }, 'price fact from evidence');
  eq([n!.assets.SPY.status, n!.assets.SPY.asOf, n!.assets.BTC.status], ['closed', iso(ny('2026-10-02', '16:00')), 'live'], 'status/asOf from evidence freshness');
  eq(n!.assets.SPY.explainer, undefined, 'empty explainer dropped');
  eq(n!.risks.facts, [{ label: 'Financiamiento BTC', value: '+0.0100%' }, { label: 'Financiamiento ETH', value: '−0.0025%' }], 'risk facts = funding from evidence');

  const bad = (mut: (g: any) => void, what: string, lang: 'es' | 'en' = 'es') => {
    const g = structuredClone(grounded) as any;
    mut(g);
    eq(validateNarrative(g, ev, lang, SYMS, 'm'), null, what);
  };
  bad((g) => { g.market.body = g.market.body.replace('67,450', '68,900'); }, 'invented price rejected');
  bad((g) => { g.assets[0].body = 'BTC subió 820 dólares desde ayer.'; }, 'computed difference rejected');
  bad((g) => { g.risks.body = 'La volatilidad podría llevar a BTC a 75,000.'; }, 'invented target rejected');
  bad((g) => { g.agenda.body = 'Mira https://example.com para más.'; }, 'URL rejected');
  bad((g) => { g.agenda.body = 'Detalles en [aquí](x).'; }, 'markdown link rejected');
  bad((g) => { g.assets.push({ symbol: 'DOGE', title: 'Doge', body: 'Sin datos.', explainer: '' }); }, 'unknown symbol rejected');
  bad((g) => { g.assets.push({ symbol: 'BTC', title: 'Otra vez', body: 'Sin datos.', explainer: '' }); }, 'duplicate symbol rejected');
  bad((g) => { g.market.body = 'a'.repeat(421); }, 'overlong body rejected');
  bad((g) => { g.assets[0].explainer = 'b'.repeat(161); }, 'overlong explainer rejected');
  bad((g) => { g.opening = ''; }, 'empty opening rejected');
  bad((g) => { g.extra = 'x'; }, 'extra top-level key rejected');
  bad((g) => { g.assets[0].facts = [{ label: 'Precio', value: '1 USD' }]; }, 'model-supplied facts rejected');
  bad((g) => { g.week = { title: 'x', body: 'y' }; }, 'week on a daily cadence rejected');
  bad((g) => { g.risks.body = 'Te recomiendo comprar ahora.'; }, 'advice rejected (es)');
  bad((g) => { g.risks.body = 'You should buy it.'; }, 'advice rejected (en)', 'en');
  eq(validateNarrative('not json', ev, 'es', SYMS, 'm'), null, 'unparseable rejected');
  ok(validateNarrative({ ...grounded, week: { title: 'Semana', body: 'Sin historial suficiente.' } }, { ...ev, cadence: 'weekly', history: [] }, 'es', SYMS, 'm'), 'weekly with week accepted');
  const weeklyMissingWeek = validateNarrative(grounded, { ...ev, cadence: 'weekly', history: [] }, 'es', SYMS, 'm');
  eq(weeklyMissingWeek, null, 'weekly without week rejected');

  eq(ungroundedNumbers('BTC en 67,450.12 y 1.23% el 2026-10-03 a las 10:45 ET; S&P 500; 3 eventos', ev), [], 'grounding allows evidence values, dates, times, index names');
  eq(ungroundedNumbers('subió 4.7% y 1,234', ev), ['4.7', '1,234'], 'grounding flags unknown numbers');
}
{
  for (const lang of ['es', 'en'] as const) {
    const f = factsOnlyNarrative(ev, lang, [...SYMS, 'SOL']);
    eq(f.source, 'facts_only', `${lang}: facts-only source`);
    eq(Object.keys(f.assets), [...SYMS, 'SOL'], `${lang}: one section per requested symbol`);
    const texts = [f.opening, f.market.body, f.risks.body, f.agenda.body, ...Object.values(f.assets).map((s) => s.body)];
    eq(texts.flatMap((t) => ungroundedNumbers(t, ev)), [], `${lang}: every number in the facts-only text comes from evidence`);
    ok(texts.every((t) => t.length <= 420), `${lang}: bounded bodies`);
    eq(f.assets.SOL.status, 'missing', `${lang}: unknown symbol → missing`);
    ok(lang === 'es' ? f.market.body.includes('cerrado por fin de semana') && f.assets.SPY.body.includes('al cierre') : f.market.body.includes('closed for the weekend') && f.assets.SPY.body.includes('at close'), `${lang}: closed session labelled`);
  }
  const fw = factsOnlyNarrative(await buildEvidence(weekly, ['SPY', 'BTC'], { now: () => weeklyNow, snapshot: async () => snapshot(weeklyNow), agenda: noAgenda, dailyCloses: async () => realHistory }), 'en', ['SPY', 'BTC']);
  ok(fw.week && /SPY \+2\.02% over 7 days/.test(fw.week.body), 'weekly facts-only lists dated 7d changes');
  const fwNo = factsOnlyNarrative(await buildEvidence(weekly, ['SPY'], { now: () => weeklyNow, snapshot: async () => snapshot(weeklyNow), agenda: noAgenda, dailyCloses: noHistory }), 'es', ['SPY']);
  eq(fwNo.week?.body, 'No hay historial diario suficiente para comparar la semana.', 'weekly facts-only without history says so');
}

// =============== 5. composition ===============
const frozen = (over: Partial<FrozenSettings> = {}): FrozenSettings => ({
  settingsRevision: 3, privacyEpoch: 1, language: 'es', companionId: 'kora', voice: 'coral', assets: [], analysisConsent: true, analysisConsentVersion: 1, audioConsent: true, ...over,
});
const memory = { experience: 'new' as const, explainRiskDepth: 'high' as const, frequentAssets: ['NVDA', 'BTC', 'DOGE', 'ETH'] };
{
  const r = composeReport({ period: morning, frozen: frozen({ assets: ['spy', 'BTC', 'FAKE'] }), memory, memoryAllowed: true, narrative: modelNarrative, evidence: ev });
  const assetOrder = r.content.sections.filter((s) => s.kind === 'asset').map((s) => s.symbol);
  eq(assetOrder, ['SPY', 'BTC', 'NVDA', 'ETH'], 'followed first, then memory (deduped, supported)');
  eq([r.usesMemory, r.memoryAssets], [true, ['NVDA', 'ETH']], 'memoryAssets = memory-derived symbols included');
  eq(r.content.sections.map((s) => s.kind), ['market', 'asset', 'asset', 'asset', 'asset', 'risks', 'agenda'], 'section order');
  eq(r.content.sections.find((s) => s.symbol === 'BTC')?.explainer, grounded.assets[0].explainer, 'beginner explainer attached for experience new');
  ok(r.content.sections.find((s) => s.kind === 'risks')?.explainer?.includes('Financiamiento: BTC +0.0100%'), 'risk detail from evidence for depth high');
  eq(r.quality, 'partial', 'NVDA/ETH fell back to facts-only sections ⇒ partial');
  eq(r.content.sections.find((s) => s.symbol === 'NVDA')?.body.startsWith('Precio: 181.20 USD'), true, 'fallback section formatted from evidence');
  eq(validateContent(r.content), null, 'composed content valid');

  const off = composeReport({ period: morning, frozen: frozen({ assets: ['SPY', 'BTC'] }), memory, memoryAllowed: false, narrative: modelNarrative, evidence: ev });
  eq([off.usesMemory, off.memoryAssets, off.content.sections.filter((s) => s.kind === 'asset').map((s) => s.symbol)], [false, [], ['SPY', 'BTC']], 'memory ignored when not allowed');
  ok(off.content.sections.every((s) => s.explainer === undefined), 'no explainers without memory');
  eq(off.quality, 'full', 'all shared sections present ⇒ full');

  const quiet = composeReport({ period: morning, frozen: frozen({ assets: ['SPY'] }), memory: { experience: 'experienced', explainRiskDepth: 'low', frequentAssets: ['SPY'] }, memoryAllowed: true, narrative: modelNarrative, evidence: ev });
  eq([quiet.usesMemory, quiet.memoryAssets], [false, []], 'memory that changes nothing is not flagged');

  const cold = composeReport({ period: morning, frozen: frozen(), memory: null, memoryAllowed: false, narrative: modelNarrative, evidence: ev });
  eq(cold.content.sections.filter((s) => s.kind === 'asset').map((s) => s.symbol), [...config.DEFAULT_ASSETS], 'cold start ⇒ DEFAULT_ASSETS');
  const many = composeReport({ period: morning, frozen: frozen({ assets: ['BTC', 'ETH', 'SOL', 'SPY', 'NVDA', 'AAPL', 'TSLA'] }), memory, memoryAllowed: true, narrative: modelNarrative, evidence: ev });
  eq([many.content.sections.filter((s) => s.kind === 'asset').length, many.memoryAssets], [6, []], '≤ 6 assets, memory adds nothing when full');

  const facts = composeReport({ period: morning, frozen: frozen({ assets: ['SPY'] }), memory: null, memoryAllowed: false, narrative: factsOnlyNarrative(ev, 'es', SYMS), evidence: ev });
  eq(facts.quality, 'facts_only', 'facts-only narrative ⇒ facts_only quality');
  const degraded = composeReport({ period: morning, frozen: frozen({ assets: ['SPY'] }), memory: null, memoryAllowed: false, narrative: modelNarrative, evidence: { ...ev, degraded: true } });
  eq(degraded.quality, 'partial', 'degraded evidence ⇒ partial');

  // Narration: bounded whole blocks; identical blocks ⇒ identical audio keys across readers; never a name.
  for (const c of [r, off, cold, many, facts]) {
    const seg = c.content.narrationSegments;
    ok(seg.length >= 1 && seg.length <= 4 && seg.every((t) => t.length <= 800) && seg.join('').length <= 2400, 'segment bounds');
  }
  eq(off.content.narrationSegments[0], `${grounded.opening} ${grounded.market.body}`, 'segment 1 = opening + market (whole blocks)');
  eq(off.content.narrationSegments[1], `S&P 500. ${grounded.assets[1].body} Bitcoin. ${grounded.assets[0].body}`, 'segment 2 = first two asset sections');
  eq(off.content.narrationSegments[2], `${grounded.risks.body} ${grounded.agenda.body}`, 'segment 3 = risks + agenda');
  const readerA = composeReport({ period: morning, frozen: frozen({ assets: ['SPY', 'BTC'], settingsRevision: 9 }), memory: null, memoryAllowed: false, narrative: modelNarrative, evidence: ev });
  const readerB = composeReport({ period: morning, frozen: frozen({ assets: ['SPY', 'BTC', 'ETH'], privacyEpoch: 4, ...({ displayName: 'Valentina' } as object) }), memory, memoryAllowed: true, narrative: modelNarrative, evidence: ev });
  const keys = (c: typeof readerA, voice: string) => c.content.narrationSegments.map((t) => audioCacheKey(t, voice, 'es', config.BRIEF_VIBE, 'gpt-4o-mini-tts'));
  eq(keys(readerA, 'coral'), keys(readerB, 'coral'), 'two readers with the same blocks share audio keys');
  ok(keys(readerA, 'coral')[0] !== keys(readerA, 'ash')[0], 'a different voice is a different key');
  ok(/^[0-9a-f]{64}$/.test(keys(readerA, 'coral')[0]), 'sha256 hex');
  eq(audioCacheKey('x', 'v', 'en', 'analytical', 'm'), audioCacheKey('x', 'v', 'en', 'analytical', 'm'), 'deterministic key');
  ok(audioCacheKey('x', 'v', 'en', 'analytical', 'm') !== audioCacheKey('x', 'v', 'es', 'analytical', 'm'), 'language is part of the key');
  ok(!JSON.stringify(readerB.content).includes('Valentina'), 'no name anywhere in the content');

  // 24 KiB guard and other limits.
  const huge = structuredClone(r.content);
  huge.sections = Array.from({ length: 14 }, () => ({ ...huge.sections[0], facts: Array.from({ length: 8 }, () => ({ label: 'x'.repeat(80), value: 'y'.repeat(120) })), body: 'z'.repeat(420) }));
  eq(validateContent(huge), 'too_large', '24 KiB guard');
  eq(validateContent({ ...r.content, narrationSegments: ['a'.repeat(801)] }), 'bad_narration', 'segment > 800 rejected');
  eq(validateContent({ ...r.content, narrationSegments: ['a', 'b', 'c', 'd', 'e'] }), 'bad_narration', '> 4 segments rejected');
  eq(validateContent({ ...r.content, narrationSegments: ['a'.repeat(800), 'a'.repeat(800), 'a'.repeat(800), 'a'] }), 'bad_narration', '> 2,400 chars rejected');
  eq(validateContent({ ...r.content, sections: r.content.sections.filter((s) => s.kind !== 'market') }), 'missing_market', 'market required');
  eq(validateContent({ ...r.content, sections: [...r.content.sections, { ...r.content.sections[1], symbol: 'DOGE' }] }), 'bad_section_symbol', 'unsupported asset rejected');
  eq(validateContent({ ...r.content, title: '' }), 'bad_header', 'title required');
}
{
  // Weekly composition: upcoming agenda before explicitly labelled historical context.
  const ew = await buildEvidence(weekly, ['SPY', 'BTC'], { now: () => weeklyNow, snapshot: async () => snapshot(weeklyNow), agenda: noAgenda, dailyCloses: async () => realHistory });
  const fw = factsOnlyNarrative(ew, 'en', ['SPY', 'BTC']);
  const c = composeReport({ period: weekly, frozen: frozen({ language: 'en', assets: ['SPY', 'BTC'] }), memory: null, memoryAllowed: false, narrative: fw, evidence: ew });
  eq(c.content.sections.map((s) => s.kind), ['asset', 'asset', 'market', 'risks', 'agenda'], 'personal retrospective before common upcoming-week context');
  ok(c.content.narrationSegments[0].includes(c.content.sections[0].body), 'personal retrospective first in voice');
  ok(c.content.narrationSegments[1].includes(c.content.sections.find(s => s.kind === 'agenda')!.body), 'common upcoming agenda second in voice');
  ok(c.content.sections[0].title.includes('Previous week'), 'historical asset explicitly labelled');
  ok(c.content.narrationSegments.length <= 3 && c.content.narrationSegments.join('').length <= 1200, 'weekly voice is light: max3 segments/1200chars');
  ok(c.content.sections.every(s => s.body.length <= 220), 'weekly prose sections compact');
  eq(c.content.title, 'Weekly briefing · 2026-09-28 – 2026-10-05', 'weekly title');
  eq(validateContent(c.content), null, 'weekly content valid');
}

// Weekly queries are interests, never holdings. Consent gates selection; real history gates the figures.
{
  const dated = [{ symbol: 'NVDA', from: { at: iso(ny('2026-09-25', '16:00')), price: 160 }, to: { at: iso(ny('2026-10-02', '16:00')), price: 180 } }, ...realHistory];
  const e = await buildEvidence(weekly, ['NVDA', 'SPY', 'BTC'], {
    now: () => weeklyNow, snapshot: async () => snapshot(weeklyNow), dailyCloses: async () => dated,
    agenda: async () => [{ title: 'Recorded economic release', at: iso(ny('2026-10-07', '08:30')), kind: 'macro', severity: 4 }],
  });
  const n = factsOnlyNarrative(e, 'en', ['NVDA', 'SPY', 'BTC']);
  const asked = { experience: null, explainRiskDepth: null, frequentAssets: ['NVDA'] };
  const make = (allowed: boolean, assets: string[] = ['SPY']) => composeReport({ period: weekly, frozen: frozen({ language: 'en', assets }), memory: asked, memoryAllowed: allowed, narrative: n, evidence: e });
  const personal = make(true);
  eq([personal.content.personalBasis, personal.content.sections[0].symbol, personal.memoryAssets], ['asked_assets', 'NVDA', ['NVDA']], 'consented asked assets before explicit interests');
  ok(personal.content.sections[0].body.includes('+12.50%') && personal.content.sections[0].body.includes('over 7 days'), 'NVDA uses dated160→180 history, not spot24h');
  ok(personal.content.narrationSegments[0].includes('NVDA') && personal.content.narrationSegments[1].includes('Recorded economic release'), 'personal retrospective before dated coming-week agenda');
  ok(!/holding|position|portfolio/i.test(personal.content.sections[0].body), 'asked does not imply ownership');
  const large = { ...n, opening: 'h'.repeat(140), assets: Object.fromEntries(Object.entries(n.assets).map(([symbol, section]) => [symbol, { ...section, body: 'p'.repeat(220) }])), market: { ...n.market, body: 'm'.repeat(220) }, agenda: { ...n.agenda, body: 'a'.repeat(220) }, risks: { ...n.risks, body: 'r'.repeat(220) } };
  const two = composeReport({ period: weekly, frozen: frozen({ language: 'en', assets: [] }), memory: { ...asked, frequentAssets: ['NVDA', 'SPY'] }, memoryAllowed: true, narrative: large, evidence: e });
  ok(two.content.narrationSegments[0].includes('NVDA') && two.content.narrationSegments[0].includes('SPY'), 'first two asked assets narrated');
  ok(two.content.narrationSegments[1].includes('m'.repeat(220)) && two.content.narrationSegments[1].includes('a'.repeat(220)), 'maximum personal block preserves common outlook and agenda');
  ok(two.content.narrationSegments.join('').length <= 1200, 'large personal blocks respect lightweight limit');
  const off = make(false);
  eq([off.content.personalBasis, off.content.sections[0].symbol, off.usesMemory], ['explicit_interests', 'SPY', false], 'consent off uses declared interests, not asked history');
  eq(make(false, []).content.personalBasis, 'general', 'no consented queries or declared interests gives honest general basis');
  const spot = { ...e, history: e.history!.filter(h => h.symbol !== 'NVDA'), quotes: e.quotes.map(q => q.symbol === 'NVDA' ? { ...q, changeBasis: '24h' as const } : q) };
  const missing = composeReport({ period: weekly, frozen: frozen({ language: 'en', assets: ['NVDA'] }), memory: null, memoryAllowed: false, narrative: n, evidence: spot });
  eq(missing.content.sections[0].status, 'missing', 'spot24h never masquerades as personal weekly history');
  ok(missing.content.sections[0].body.includes('No data available'), 'unavailable retrospective is stated honestly');
}

console.log(`briefings-content: ${checks} checks passed`);
