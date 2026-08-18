import assert from 'node:assert/strict';
import { buildDeskBrief, type TechnicalSnapshot } from '../src/lib/voice-desk-brief.ts';

const bullish: TechnicalSnapshot = {
  price: 64_514,
  rsi14: 66.4,
  ema20: 64_264.4,
  ema50: 64_246.7,
  support: 64_047.5,
  resistance: 64_521.1,
  atrPct: 0.17,
  trend: 'alcista',
  momentum: 'neutral',
};

const spanish = buildDeskBrief({
  symbol: 'btc',
  market: { price: 64_515, change_24h_pct: 1.6 },
  technicals: bullish,
  lang: 'es',
  latencyMs: 842,
  generatedAt: '2026-08-18T12:00:00.000Z',
});

assert.equal(spanish.symbol, 'BTC');
assert.equal(spanish.bias, 'bullish');
assert.equal(spanish.price, 64_514, 'same-candle price is the canonical technical price');
assert.equal(spanish.support, 64_047.5);
assert.match(spanish.summary, /estructura alcista/);
assert.match(spanish.risk, /64,047\.5/);
assert.equal(spanish.latencyMs, 842);

const english = buildDeskBrief({
  symbol: 'nvda',
  market: { assetType: 'equity', price: 180, change_24h_pct: -1.2 },
  technicals: { ...bullish, price: 179.4, trend: 'bajista', resistance: 184.2, support: 176.8 },
  lang: 'en',
});

assert.equal(english.assetType, 'equity');
assert.equal(english.bias, 'bearish');
assert.match(english.summary, /bearish 1H structure/);
assert.match(english.risk, /184\.2/);

const incomplete = buildDeskBrief({
  symbol: 'sol',
  market: { price: 142.1, change_24h_pct: null },
  technicals: null,
  lang: 'es',
});

assert.equal(incomplete.bias, 'neutral');
assert.equal(incomplete.change24hPct, null, 'missing 24h change must not be rendered as 0%');
assert.match(incomplete.summary, /no hay suficientes velas/);
assert.doesNotMatch(incomplete.summary, /alcista|bajista/);

console.log('voice desk brief: 13/13 assertions passed');
