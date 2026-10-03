import assert from 'node:assert/strict';
import technicalAnalysis from '../api/technical-analysis.js';

const originalFetch = globalThis.fetch;
const timestamps = Array.from({ length: 72 }, (_, index) => 1_700_000_000 + index * 3_600);
const values = timestamps.map((_, index) => 100 + index * 0.1);
const marketTime = timestamps.at(-1)! + 300;
let metadata: Record<string, unknown> | undefined;
let calls = 0;

globalThis.fetch = async (input) => {
  assert.match(String(input), /^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\//);
  calls++;
  return new Response(JSON.stringify({
    chart: { result: [{
      ...(metadata ? { meta: metadata } : {}),
      timestamp: timestamps,
      indicators: { quote: [{
        open: values, high: values.map((n) => n + 1), low: values.map((n) => n - 1),
        close: values.map((n) => n + 0.25), volume: values.map(() => 1_000),
      }] },
    }] },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

async function read(symbol: string, meta?: Record<string, unknown>) {
  metadata = meta;
  let status = 0;
  let payload: Record<string, any> = {};
  const response = {
    status(code: number) { status = code; return this; },
    json(body: Record<string, any>) { payload = body; return this; },
    setHeader() {},
  };
  await technicalAnalysis({ method: 'GET', query: { symbol } } as never, response as never);
  return { status, payload };
}

try {
  const baseline = await read('MC.PA');
  assert.equal(baseline.status, 200);
  assert.equal(baseline.payload.currency, null, 'No regional currency inference without provider metadata');
  assert.equal(baseline.payload.exchange, null);
  assert.equal(baseline.payload.asOf, null);

  const paris = await read('MC.PA', {
    symbol: 'MC.PA', currency: 'EUR', exchangeName: 'PAR', fullExchangeName: 'Paris', regularMarketTime: marketTime,
  });
  assert.equal(paris.status, 200);
  assert.equal(paris.payload.currency, 'EUR');
  assert.equal(paris.payload.exchange, 'Paris');
  assert.equal(paris.payload.asOf, new Date(marketTime * 1000).toISOString());
  for (const field of ['candles', 'indicators', 'summary', 'support', 'resistance']) {
    assert.deepEqual(paris.payload[field], baseline.payload[field], `Metadata must not alter ${field}`);
  }

  const brazil = await read('PETR4.SA', {
    symbol: 'PETR4.SA', currency: 'BRL', exchangeName: 'SAO', regularMarketTime: marketTime,
  });
  assert.equal(brazil.status, 200);
  assert.equal(brazil.payload.symbol, 'PETR4.SA');
  assert.equal(brazil.payload.currency, 'BRL');
  assert.equal(brazil.payload.exchange, 'SAO');
  assert.deepEqual(brazil.payload.candles, baseline.payload.candles);
  assert.deepEqual(brazil.payload.indicators, baseline.payload.indicators);

  const missingCurrency = await read('MC.PA', { symbol: 'MC.PA', exchangeName: 'PAR', regularMarketTime: marketTime });
  assert.equal(missingCurrency.status, 200);
  assert.equal(missingCurrency.payload.currency, null);
  assert.equal(missingCurrency.payload.exchange, 'PAR');
  assert.equal(missingCurrency.payload.asOf, paris.payload.asOf);

  const futureTime = await read('MC.PA', { symbol: 'MC.PA', currency: 'EUR', regularMarketTime: Date.now() / 1000 + 3600 });
  assert.equal(futureTime.status, 200);
  assert.equal(futureTime.payload.asOf, null, 'Future provider timestamps are not reported as current observations');
  assert.deepEqual(futureTime.payload.candles, baseline.payload.candles);

  const mismatch = await read('MC.PA', { symbol: 'LVMUY', currency: 'USD' });
  assert.equal(mismatch.status, 404);
  assert.equal(calls, 6, 'Each equity request must use exactly one Yahoo request and no alternate instrument');
  console.log('technical-meta: 6 mocked snapshots passed; currencies retained, absent metadata stays null, OHLC/indicators unchanged');
} finally {
  globalThis.fetch = originalFetch;
}
