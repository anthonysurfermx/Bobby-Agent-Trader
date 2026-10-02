import assert from 'node:assert/strict';

// All providers are intercepted before importing the handler; no model or database is called.
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service';

const originalFetch = globalThis.fetch;
const requests: string[] = [];
let withCandles = false;
const price = 12_345.6;
const candles = Array.from({ length: 72 }, (_, index) => ({
  ts: 1_700_000_000_000 + index * 3_600_000,
  open: price - 1, high: price + 2, low: price - 2, close: price, volume: 1_000,
}));

globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url.href);
  assert.ok(['bobby.test', 'db.test'].includes(url.hostname), `Unexpected provider: ${url.href}`);
  let body: unknown;
  if (url.hostname === 'db.test') body = [];
  else if (url.pathname === '/api/stock-price') body = { quotes: [{ symbol: 'PETR4.SA', currency: 'BRL', price }] };
  else if (url.pathname === '/api/stock-candles') body = { candles: withCandles ? candles : [] };
  else if (url.pathname === '/api/bobby-intel') body = {};
  else throw new Error(`Unexpected path: ${url.pathname}`);
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};

try {
  const { default: voiceTool } = await import('../api/voice-tool.ts');
  let cases = 0;
  async function call(args: Record<string, unknown>) {
    const response = {
      statusCode: 0, body: null as any, setHeader() {},
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    await voiceTool({ method: 'POST', headers: {}, body: { tool: 'run_debate', args: { symbol: 'PETR4.SA', ...args } } } as never, response as never);
    return response;
  }
  async function read(args: Record<string, unknown>) {
    const response = await call(args);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.error, undefined);
    assert.equal(response.body.quick_brief.symbol, 'PETR4.SA');
    assert.equal(response.body.quick_brief.price, price);
    assert.equal(response.body.market.currency, 'BRL', 'Language must not change the selected asset or currency');
    assert.equal(response.body.quick_brief.assetType, 'equity');
    assert.equal(response.body.note, 'Analysis only. Bobby does not execute trades.');
    return response.body.quick_brief;
  }
  const locales = [
    ['fr', 'fr-FR', /Les données ne suffisent pas/, /structure latérale/, /Structure non confirmée/, /Le mouvement dans/],
    ['en', 'en-US', /not enough candles/, /range-bound/, /No confirmed structure/, /Inside the range/],
    ['es', 'es-MX', /no hay suficientes velas/, /sigue lateral/, /Sin estructura confirmada/, /Dentro del rango/],
    ['pt', 'pt-PT', /Não há dados suficientes/, /estrutura lateral/, /Estrutura não confirmada/, /O movimento dentro/],
    ['pt', 'pt-BR', /Não há dados suficientes/, /estrutura lateral/, /Estrutura não confirmada/, /O movimento dentro/],
    ['it', 'it-IT', /dati non bastano/, /struttura laterale/, /Struttura non confermata/, /Il movimento nell/],
    ['de', 'de-DE', /Daten reichen nicht/, /Seitwärtsstruktur/, /Keine bestätigte Struktur/, /Die Bewegung innerhalb/],
  ] as const;
  for (const [language, locale, absent, neutral, absentRisk, neutralRisk] of locales) {
    for (const field of ['language', 'lang']) {
      for (const complete of [false, true]) {
        withCandles = complete;
        const brief = await read({ [field]: language, locale });
        assert.match(brief.summary, complete ? neutral : absent, `${field}=${language} must select the actual brief language`);
        assert.match(brief.risk, complete ? neutralRisk : absentRisk, `${field}=${language} must localize the risk explanation`);
        assert.ok(brief.summary.includes(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(price)), `Handler lost ${locale} formatting`);
        assert.equal(brief.bias, 'neutral');
        assert.equal(brief.source, 'live-candles');
        cases++;
      }
    }
  }
  withCandles = false;
  // Both BCP47 alias forms carry their region even when there is no separate locale.
  for (const field of ['language', 'lang']) {
    for (const locale of ['pt-PT', 'pt-BR']) {
      const brief = await read({ [field]: locale });
      assert.match(brief.summary, /Não há dados suficientes/);
      assert.ok(brief.summary.includes(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(price)));
      cases++;
    }
  }
  // The current client's explicit language wins when an older alias is also present.
  const explicit = await read({ language: 'fr', lang: 'es', locale: 'fr-FR' });
  assert.match(explicit.summary, /Les données ne suffisent pas/);
  cases++;
  for (const args of [{}, { language: 'ja' }, { lang: 'invalid' }]) {
    assert.match((await read(args)).summary, /no hay suficientes velas/, 'Legacy Spanish default remains unchanged');
    cases++;
  }
  for (const locale of ['en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IE', 'es-MX', 'es-ES', 'es-US']) {
    const language = locale.split('-')[0];
    const brief = await read({ language, locale });
    assert.match(brief.summary, language === 'en' ? /not enough candles/ : /no hay suficientes velas/);
    assert.ok(brief.summary.includes(new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(price)), `Native locale ${locale} must survive`);
    cases++;
  }
  for (const args of [
    { language: 'fr', locale: 'pt-BR' }, { lang: 'pt', locale: 'fr-FR' },
    { language: 'de', locale: 'en-GB' }, { language: 'fr', locale: 'fr-CA' },
    { language: 'en', locale: 'en-ZZ' }, { language: 'fr', locale: '' },
    { language: 'fr', locale: null }, { language: 'fr', locale: ['fr-FR'] },
  ]) {
    const before = requests.length;
    const invalid = await call(args);
    assert.equal(invalid.statusCode, 400, 'A mismatched or unsupported explicit locale must fail before evidence');
    assert.deepEqual(invalid.body, { error: 'invalid_request' });
    assert.ok(requests.slice(before).every((url) => new URL(url).hostname === 'db.test'), 'Invalid locale must not fetch market evidence');
    cases++;
  }
  assert.ok(requests.length > 0);
  assert.ok(requests.every((url) => !/openai|anthropic|okx/.test(url)), 'No paid AI or alternate instrument requests');
  console.log(`voice-tool language: ${cases} mocked handler cases passed across six languages, Portuguese and native EN/ES regions; aliases, legacy defaults and locale refusals verified`);
} finally {
  globalThis.fetch = originalFetch;
}
