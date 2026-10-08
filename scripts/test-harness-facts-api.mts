// GET /api/asset-fact (the harness, layer 2a): off by default, public, the same for everyone,
// cached per asset, and silent rather than wrong when the bars cannot be trusted. No network.
import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { FACT_TTL_SECONDS, NO_FACT_TTL_SECONDS, cacheKey, createHandler, harnessFactsOn, loadAssetFact, providerUrl, validSymbol, type FactDeps, type FactReply } from '../api/asset-fact.js';

let passed = 0, failed = 0;
const pending: Array<Promise<void>> = [];
function check(name: string, fn: () => void | Promise<void>): void {
  pending.push((async () => {
    try { await fn(); passed++; console.log(`ok - ${name}`); }
    catch (error) { failed++; console.log(`not ok - ${name}`, error); }
  })());
}

const DAY = 86_400_000;
const now = new Date('2026-10-07T12:00:00.000Z');

/** OKX `1Dutc` rows, newest first, as the exchange sends them: 40 quiet days, then `lastChangePct` on the last completed one. */
function okxPayload(lastChangePct = 0.2, options: { confirmLast?: boolean; missDay?: number } = {}): unknown {
  const lastOpen = Date.parse('2026-10-06T00:00:00.000Z');
  const rows: string[][] = [];
  let close = 100;
  for (let i = 39; i >= 0; i--) {
    const ts = lastOpen - i * DAY;
    const open = close;
    close = i === 0 ? open * (1 + lastChangePct / 100) : open * (1 + (i % 2 === 0 ? 0.004 : -0.004));
    const high = Math.max(open, close) * 1.005, low = Math.min(open, close) * 0.995;
    if (options.missDay === i) continue;
    rows.push([String(ts), open.toFixed(6), high.toFixed(6), low.toFixed(6), close.toFixed(6), '10', '1000', '1000', '1']);
  }
  // The day in progress, which is never a fact.
  rows.push([String(lastOpen + DAY), close.toFixed(6), (close * 1.2).toFixed(6), (close * 0.9).toFixed(6), (close * 1.15).toFixed(6), '3', '300', '300', options.confirmLast ? '1' : '0']);
  return { code: '0', msg: '', data: rows.reverse() };
}

function deps(payload: unknown | null): FactDeps & { fetched: string[]; store: Map<string, { value: FactReply; ttl: number }> } {
  const fetched: string[] = [];
  const store = new Map<string, { value: FactReply; ttl: number }>();
  return {
    fetched, store,
    fetchJson: async (url) => { fetched.push(url); return payload; },
    now: () => now,
    cacheGet: async (key) => store.get(key)?.value ?? null,
    cacheSet: async (key, value, ttl) => { store.set(key, { value, ttl }); },
  };
}

function call(handler: ReturnType<typeof createHandler>, query: Record<string, string>, method = 'GET', headers: Record<string, string> = {}) {
  const out: { status: number; body: unknown; headers: Record<string, string> } = { status: 0, body: null, headers: {} };
  const res = {
    status(code: number) { out.status = code; return this; },
    json(body: unknown) { out.body = body; return this; },
    setHeader(name: string, value: string) { out.headers[name.toLowerCase()] = value; return this; },
  } as unknown as VercelResponse;
  const req = { method, query, headers: { 'x-forwarded-for': '203.0.113.9', ...headers } } as unknown as VercelRequest;
  return handler(req, res).then(() => out);
}

const on = () => ({ BOBBY_HARNESS_FACTS: 'on' } as NodeJS.ProcessEnv);

check('the switch is exact: only "on" turns it on', () => {
  assert.equal(harnessFactsOn({}), false);
  assert.equal(harnessFactsOn({ BOBBY_HARNESS_FACTS: 'true' }), false);
  assert.equal(harnessFactsOn({ BOBBY_HARNESS_FACTS: 'ON' }), false);
  assert.equal(harnessFactsOn({ BOBBY_HARNESS_FACTS: 'on' }), true);
});

check('off by default: 404 and nothing is fetched', async () => {
  const d = deps(okxPayload());
  const out = await call(createHandler(d, () => ({})), { symbol: 'BTC', class: 'crypto' });
  assert.equal(out.status, 404);
  assert.deepEqual(d.fetched, []);
});

check('only GET, a known class and a well-formed symbol', async () => {
  const d = deps(okxPayload());
  const handler = createHandler(d, on);
  assert.equal((await call(handler, { symbol: 'BTC', class: 'crypto' }, 'POST')).status, 405);
  assert.equal((await call(handler, { symbol: 'BTC', class: 'forex' })).status, 400);
  assert.equal((await call(handler, { symbol: 'BTC' })).status, 400);
  assert.equal((await call(handler, { symbol: 'BTC-USDT', class: 'crypto' })).status, 400);
  assert.equal((await call(handler, { symbol: '../etc', class: 'equity' })).status, 400);
  assert.deepEqual(d.fetched, [], 'a refused request never reaches a provider');
  assert.equal(validSymbol('nvda', 'equity'), 'NVDA');
  assert.equal(validSymbol('MC.PA', 'equity'), 'MC.PA');
  assert.equal(validSymbol('MC.PA', 'crypto'), null);
  assert.equal(validSymbol(7, 'equity'), null);
});

check('one provider request per asset, to the daily completed-bar source of its class', () => {
  assert.equal(providerUrl('NVDA', 'equity'), 'https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=3mo&interval=1d&events=split');
  assert.equal(providerUrl('BTC', 'crypto'), 'https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1Dutc&limit=60');
  assert.equal(cacheKey('BTC', 'crypto'), 'harness:asset:crypto:BTC', 'the key names an asset and nothing else');
});

check('a quiet completed day is a fact with nothing notable, named after the asset', async () => {
  const d = deps(okxPayload(0.2));
  const out = await call(createHandler(d, on), { symbol: 'btc', class: 'crypto' });
  assert.equal(out.status, 200);
  const body = out.body as FactReply;
  assert.ok(body.fact);
  assert.equal(body.fact.symbol, 'BTC');
  assert.equal(body.fact.currency, 'USDT', 'the pair it was read against is stated');
  assert.equal(body.fact.day, '2026-10-06', 'the last COMPLETED day, not the one in progress');
  assert.equal(body.fact.closedAt, '2026-10-07T00:00:00.000Z');
  assert.ok(Math.abs(body.fact.changePct - 0.2) < 1e-4);
  assert.equal(body.fact.unusualMove, false);
  assert.equal(body.fact.eventId, null);
  assert.match(out.headers['cache-control'], /^public, s-maxage=600/);
});

check('a day larger than the asset\'s usual day is marked, with its event id', async () => {
  const body = await loadAssetFact('BTC', 'crypto', deps(okxPayload(-6)));
  assert.ok(body.fact);
  assert.equal(body.fact.unusualMove, true);
  assert.ok(body.fact.changePct < -5.9 && body.fact.changePct > -6.1);
  assert.match(body.fact.eventId ?? '', /^BTC-USDT:2026-10-06:move/);
});

check('the answer is shared: the second reader costs no provider request', async () => {
  const d = deps(okxPayload());
  const first = await loadAssetFact('BTC', 'crypto', d);
  const second = await loadAssetFact('BTC', 'crypto', d);
  assert.deepEqual(second, first);
  assert.equal(d.fetched.length, 1);
  assert.equal(d.store.get('harness:asset:crypto:BTC')?.ttl, FACT_TTL_SECONDS);
});

check('the reply does not depend on who asks', async () => {
  const anonymous = await call(createHandler(deps(okxPayload()), on), { symbol: 'BTC', class: 'crypto' });
  const signedIn = await call(createHandler(deps(okxPayload()), on), { symbol: 'BTC', class: 'crypto' }, 'GET', { authorization: 'Bearer someone', cookie: 'a=b' });
  assert.deepEqual(signedIn.body, anonymous.body);
});

check('a source that does not answer gives no fact, and is asked again soon', async () => {
  const d = deps(null);
  const body = await loadAssetFact('BTC', 'crypto', d);
  assert.deepEqual(body, { ok: true, fact: null, reason: 'no_data' });
  assert.equal(d.store.get('harness:asset:crypto:BTC')?.ttl, NO_FACT_TTL_SECONDS);
  const out = await call(createHandler(deps(null), on), { symbol: 'ETH', class: 'crypto' });
  assert.equal(out.status, 200);
  assert.equal(out.headers['cache-control'], 'public, s-maxage=120');
});

check('bars that cannot be trusted give the reason and never a number', async () => {
  const gap = await loadAssetFact('BTC', 'crypto', deps(okxPayload(0.2, { missDay: 5 })));
  assert.deepEqual(gap, { ok: true, fact: null, reason: 'gap' });
  const garbage = await loadAssetFact('BTC', 'crypto', deps({ code: '51001', data: [] }));
  assert.deepEqual(garbage, { ok: true, fact: null, reason: 'no_data' });
  const wrongShape = await loadAssetFact('NVDA', 'equity', deps(okxPayload()));
  assert.deepEqual(wrongShape, { ok: true, fact: null, reason: 'no_data' }, 'an equity is never read from a crypto payload');
});

check('a jump too large to be a normal day is refused, not reported', async () => {
  const body = await loadAssetFact('BTC', 'crypto', deps(okxPayload(95)));
  assert.deepEqual(body, { ok: true, fact: null, reason: 'extreme_move' });
});

await Promise.all(pending);
console.log(`${passed} checks passed; ${failed} failed`);
if (failed > 0) process.exit(1);
