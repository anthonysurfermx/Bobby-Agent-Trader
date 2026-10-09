import assert from 'node:assert/strict';
import test from 'node:test';
import { providerTime } from '../api/_lib/market-provenance.js';

test('provider time is preserved from numeric and numeric-string transport values', () => {
  const provider = 1791440400000;
  assert.equal(providerTime(provider), new Date(provider).toISOString());
  assert.equal(providerTime(String(provider)), new Date(provider).toISOString());
});

test('missing, malformed, negative and out-of-range time never becomes a fresh quote', () => {
  for (const invalid of [null, undefined, '', 'invalid', '2026-10-08', -1, 0, Infinity, NaN, 8.64e15, {}, []]) {
    assert.equal(providerTime(invalid), null);
  }
});

test('get_market carries actual provider provenance without creating fetch-time evidence', async (t) => {
  const names = ['BOBBY_PROTOCOL_BASE_URL', 'BOBBY_SUPABASE_URL', 'BOBBY_SUPABASE_ANON_KEY',
    'BOBBY_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;
  const env = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
  process.env.BOBBY_SUPABASE_URL = process.env.SUPABASE_URL = 'https://db.test';
  process.env.BOBBY_SUPABASE_ANON_KEY = 'fixture-anon';
  process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service';
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  let stock: Record<string, unknown> = {};
  let ticker: Record<string, unknown> = {};
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requests.push(url);
    assert.ok(['bobby.test', 'db.test'].includes(url.hostname), `Unmocked provider: ${url.href}`);
    const body = url.hostname === 'db.test' ? []
      : url.pathname === '/api/stock-price' ? stock
      : url.pathname === '/api/okx-market' ? { ticker }
      : assert.fail(`Unmocked path: ${url.pathname}`);
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  try {
    // Seed the real registry normalizer: no catalog, model, or database reaches the network.
    const { __setTestCatalog } = await import('../src/lib/okx-asset-search.js');
    __setTestCatalog([{ instId: 'BTC-USDT', instType: 'SPOT', baseCcy: 'BTC', quoteCcy: 'USDT', state: 'live' }]);
    const { default: handler } = await import('../api/voice-tool.ts');
    async function market(symbol: string) {
      const response = {
        statusCode: 0, body: null as Record<string, unknown> | null, setHeader() {},
        status(code: number) { this.statusCode = code; return this; },
        json(body: Record<string, unknown>) { this.body = body; return this; },
      };
      await handler({ method: 'POST', headers: {}, body: { tool: 'get_market', args: { symbol } } } as never, response as never);
      assert.equal(response.statusCode, 200);
      assert.ok(response.body);
      return response.body;
    }
    await t.test('regional equity preserves its source date, listing currency and exchange', async () => {
      const asOf = '2026-10-07T19:52:03.000Z';
      stock = { quotes: [{ symbol: 'PETR4.SA', price: 34.25, currency: 'BRL', exchange: 'SAO', asOf }] };
      const result = await market('PETR4.SA');
      assert.equal(result.provider, 'Yahoo Finance');
      assert.equal(result.asOf, asOf);
      assert.equal(result.currency, 'BRL');
      assert.equal(result.exchange, 'SAO');
      assert.equal(result.price, 34.25);
      assert.equal(result.assetType, 'equity');
      assert.equal(result.available, true);
      assert.equal(requests.filter((url) => url.pathname === '/api/stock-price').at(-1)?.searchParams.get('symbols'), 'PETR4.SA');
    });
    await t.test('equity with no provider timestamp keeps the date unknown', async () => {
      stock = { quotes: [{ symbol: 'PETR4.SA', price: 34.25, currency: 'BRL' }] };
      const result = await market('PETR4.SA');
      assert.equal(result.provider, 'Yahoo Finance');
      assert.equal(result.asOf, null);
      assert.equal(result.exchange, null);
    });
    await t.test('unavailable equity cannot invent market provenance', async () => {
      stock = { quotes: [] };
      const result = await market('PETR4.SA');
      assert.equal(result.available, false);
      assert.equal(result.price, null);
      assert.equal(result.provider, undefined);
      assert.equal(result.asOf, undefined);
    });
    for (const timestamp of [1791440400000, '1791440400000']) {
      await t.test(`crypto preserves the ${typeof timestamp} provider timestamp`, async () => {
        ticker = { last: '68123.5', ts: timestamp, open24h: '68000' };
        const result = await market('BTC');
        assert.equal(result.provider, 'OKX');
        assert.equal(result.asOf, '2026-10-08T06:20:00.000Z');
        assert.equal(result.price, 68123.5);
        assert.equal(result.available, true);
      });
    }
    await t.test('crypto missing and malformed timestamps never become request time', async () => {
      for (const timestamp of [undefined, '', 'invalid', 0, -1, Infinity, 8.64e15]) {
        ticker = { last: '68123.5', ts: timestamp };
        assert.equal((await market('BTC')).asOf, null);
      }
    });
    await t.test('future provider dates remain attributable instead of being replaced by now', async () => {
      const future = '2099-01-01T00:00:00.000Z';
      ticker = { last: '68123.5', ts: String(Date.parse(future)) };
      assert.equal((await market('BTC')).asOf, future,
        'The native opportunity gate rejects future observations; transport must preserve the actual date');
    });
    assert.ok(requests.some((url) => url.pathname === '/api/stock-price'));
    assert.ok(requests.some((url) => url.pathname === '/api/okx-market'));
    assert.ok(requests.every((url) => !url.pathname.includes('debate') && !url.hostname.includes('anthropic')));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (env[name] === undefined) delete process.env[name];
      else process.env[name] = env[name];
    }
  }
});
