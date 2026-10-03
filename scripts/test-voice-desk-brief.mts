import assert from 'node:assert/strict';
import { buildDeskBrief, type TechnicalSnapshot } from '../src/lib/voice-desk-brief.ts';
import { matchAssetInText } from '../src/lib/voice-assets.ts';
import { APP_LANGUAGES, appLocale } from '../src/lib/app-language.ts';

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

assert.equal(matchAssetInText('Quiero revisar NVIDIA'), 'NVDA');
assert.equal(matchAssetInText('¿Qué opinas de Nvidia hoy?'), 'NVDA');
assert.equal(matchAssetInText('Háblame de envidia'), 'NVDA', 'Spanish phonetic transcription must resolve NVIDIA');
assert.equal(matchAssetInText('Analyze NVDA for me'), 'NVDA');
assert.equal(matchAssetInText('MBC 뉴스 이덕영입니다.'), null, 'unexpected Korean noise must not select an asset');

const missingPrice = { en: 'price unavailable', es: 'sin precio disponible', fr: 'prix indisponible', pt: 'preço indisponível', it: 'prezzo non disponibile', de: 'Kurs nicht verfügbar' };
for (const lang of APP_LANGUAGES) {
  const missing = buildDeskBrief({ symbol: 'MC.PA', market: { assetType: 'equity', price: null }, technicals: null, lang });
  assert.equal(missing.price, null);
  assert.equal(missing.symbol, 'MC.PA');
  assert.ok(missing.summary.includes(missingPrice[lang]), `Missing price must be localized in ${lang}`);
  if (lang !== 'en') assert.doesNotMatch(missing.summary, /price unavailable/);
}
for (const locale of ['pt-PT', 'pt-BR', 'PT_br']) {
  const localized = buildDeskBrief({ symbol: 'PETR4.SA', technicals: bullish, lang: 'pt', locale });
  const formatter = new Intl.NumberFormat(appLocale('pt', locale), { maximumFractionDigits: 2 });
  assert.ok(localized.summary.includes(formatter.format(bullish.price)));
  assert.ok(localized.summary.includes(formatter.format(bullish.support!)));
  assert.ok(localized.risk.includes(formatter.format(bullish.resistance!)));
  assert.equal(localized.price, bullish.price);
  assert.equal(localized.support, bullish.support);
  assert.equal(localized.resistance, bullish.resistance);
  assert.equal(localized.symbol, 'PETR4.SA');
}

// The actual voice-tool handler must carry the browser's Portuguese region into the first brief.
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';
const { default: voiceTool } = await import('../api/voice-tool.ts');
const originalFetch = globalThis.fetch;
const requestUrls: string[] = [];
try {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    requestUrls.push(url.href);
    assert.ok(['bobby.test', 'db.test'].includes(url.hostname), `Unexpected provider URL: ${url.href}`);
    let body: unknown;
    if (url.hostname === 'db.test') body = [];
    else if (url.pathname === '/api/stock-price') body = { quotes: [{ symbol: 'PETR4.SA', currency: 'BRL', price: 12_345.67 }] };
    else if (url.pathname === '/api/stock-candles') body = { candles: [] };
    else if (url.pathname === '/api/bobby-intel') body = {};
    else throw new Error(`Unexpected test path: ${url.pathname}`);
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  for (const locale of ['pt-PT', 'pt-BR']) {
    const response = { statusCode: 200, body: null as any, setHeader() {}, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await voiceTool({ method: 'POST', headers: {}, body: { tool: 'run_debate', args: { symbol: 'PETR4.SA', lang: 'pt', locale } } } as never, response as never);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.quick_brief.symbol, 'PETR4.SA');
    assert.equal(response.body.quick_brief.price, 12_345.67);
    assert.ok(response.body.quick_brief.summary.includes(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(12_345.67)), `Handler lost ${locale}`);
  }
  assert.ok(requestUrls.length > 0);
  assert.ok(requestUrls.every((url) => !url.includes('okx') && !url.includes('openai') && !url.includes('anthropic')));
} finally {
  globalThis.fetch = originalFetch;
}
console.log('voice desk brief: legacy assertions, missing prices in six languages, Portuguese regional numbers and two mocked handler paths passed');
