import assert from 'node:assert/strict';
import technicalAnalysis from '../api/technical-analysis.js';
import { VOICE_ASSETS, matchAssetInText } from '../src/lib/voice-assets.js';
import { detectIntent, detectStocks } from '../src/lib/router/detectIntent.js';

const originalFetch = globalThis.fetch;
const timestamps = Array.from({ length: 72 }, (_, index) => 1_700_000_000 + index * 3_600);

// Deterministic Yahoo fixture. This test is about routing and symbol identity,
// not provider uptime; the production smoke matrix covers the live provider.
globalThis.fetch = async (input) => {
  const url = String(input);
  assert.match(url, /query1\.finance\.yahoo\.com/, `equity unexpectedly routed outside Yahoo: ${url}`);
  const values = timestamps.map((_, index) => 100 + index * 0.1);
  return new Response(JSON.stringify({
    chart: {
      result: [{
        timestamp: timestamps,
        indicators: { quote: [{
          open: values, high: values.map((n) => n + 1), low: values.map((n) => n - 1),
          close: values.map((n) => n + 0.25), volume: values.map(() => 1_000),
        }] },
      }],
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

try {
  const equities = VOICE_ASSETS.filter((asset) => asset.venue === 'equity');
  for (const asset of equities) {
    let status = 200;
    let payload: Record<string, unknown> = {};
    const response = {
      status(code: number) { status = code; return this; },
      json(body: Record<string, unknown>) { payload = body; return this; },
      setHeader() {},
    };
    await technicalAnalysis(
      { method: 'GET', query: { symbol: asset.symbol } } as never,
      response as never,
    );
    assert.equal(status, 200, `${asset.symbol} technical analysis returned ${status}`);
    assert.equal(payload.symbol, asset.symbol, `${asset.symbol} crossed into ${payload.symbol}`);
    assert.ok(detectStocks(`analiza ${asset.symbol}`).includes(asset.symbol), `${asset.symbol} missing from typed router`);
    assert.equal(detectIntent(asset.symbol), 'price', `${asset.symbol} bare ticker should show price`);
  }

  const speechCases: Array<[string, string | null]> = [
    ['analiza Apple', 'AAPL'],
    ['qué ves en envidia', 'NVDA'],
    ['analiza Meta', 'META'],
    ['precio de salud', 'XLV'],
    ['ETF de financieras', 'XLF'],
    ['mi meta es ahorrar', null],
    ['lo hago por salud', null],
    ['el uso de capital', null],
    ['todo el día', null],
  ];
  for (const [utterance, expected] of speechCases) {
    assert.equal(matchAssetInText(utterance), expected, utterance);
  }
  assert.deepEqual(detectStocks('mi meta es ahorrar'), []);
  assert.deepEqual(detectStocks('todo el dia'), []);
  assert.deepEqual(detectStocks('coin de solana'), []);
  assert.deepEqual(detectStocks('analiza oro'), []);
  assert.deepEqual(detectStocks('ETF de oro'), ['GLD']);

  console.log(`stock-ticker-routing: ${equities.length} equities + ${speechCases.length} speech cases passed`);
} finally {
  globalThis.fetch = originalFetch;
}
