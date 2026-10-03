import assert from 'node:assert/strict';

// All provider/database traffic is replaced below. No credentials, paid calls or remote writes.
process.env.OPENAI_API_KEY = 'test-only';
// The chat endpoint answers internal callers only (payments audit OMR-1): these checks call it as the MCP tools do.
process.env.INTERNAL_API_SECRET = 'test-only-internal';
process.env.OPENCLAW_GATEWAY_URL = '';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-only';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-only';
const { default: explain, buildExplainSystemPrompt } = await import('../api/explain.ts');
const { default: chat, chatLanguageRule } = await import('../api/openclaw-chat.ts');
const { explainError } = await import('../api/_lib/explain-localization.ts');
const { languageName } = await import('../src/lib/app-language.ts');
const { detectStocks, detectIntent } = await import('../src/lib/router/detectIntent.ts');
const { investFallbackText, investSummaryLabel } = await import('../api/_lib/invest-fallback-localization.ts');
const { REGIONAL_STOCKS } = await import('../src/lib/regional-stocks.ts');
let checks = 0;
const eq = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (v: unknown) => { assert.ok(v); checks++; };
const originalFetch = globalThis.fetch;
const requests: any[] = [];
let failProvider = false;
let emptyProvider = false;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith('https://db.test/rest/v1/api_cache')) return new Response(JSON.stringify([]), { status: 200 });
  assert.equal(url, 'https://api.openai.com/v1/chat/completions', `Unexpected external request: ${url}`);
  const body = JSON.parse(String(init?.body));
  requests.push(body);
  if (failProvider) return new Response('test-only provider unavailable', { status: 503 });
  if (!body.stream) return new Response(JSON.stringify({ choices: [{ message: { content: emptyProvider ? '' : 'test-only response' } }] }), { status: 200 });
  return new Response('data: {"choices":[{"delta":{"content":"test-only response"}}]}\n\ndata: [DONE]\n\n', { status: 200 });
}) as typeof fetch;
let ip = 0;
function response() {
  return { statusCode: 200, headersSent: false, body: null as any, output: '', ended: false,
    setHeader() {}, status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    write(text: string) { this.headersSent = true; this.output += text; }, end() { this.ended = true; },
  };
}
async function call(handler: (...args: any[]) => unknown, body: unknown, method = 'POST') {
  const res = response();
  await handler({ method, body, query: {}, headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': `192.0.2.${++ip}`, ...(handler === chat ? { 'x-internal-secret': 'test-only-internal' } : {}) } }, res);
  return res;
}
try {
  const cases = [['en','en-US'], ['es','es-MX'], ['fr','fr-FR'], ['pt','pt-PT'], ['pt','pt-BR'], ['it','it-IT'], ['de','de-DE']] as const;
  for (const [language, locale] of cases) {
    const name = languageName(language, locale);
    for (const context of ['metacognition', 'wallet']) {
      const prompt = buildExplainSystemPrompt(context, language, locale);
      ok(prompt.includes(`Respond in ${name}.`));
      ok(prompt.includes(`OUTPUT LANGUAGE: ${name} (${locale})`));
      ok(prompt.includes('exact machine marker TAGS:'));
      ok(prompt.includes('Never hallucinate numbers.'));
      if (context === 'metacognition') ok(prompt.includes('process, not trade picks'));
    }
    const rule = chatLanguageRule(language, locale);
    ok(rule.includes(`ALWAYS respond in ${name} (${locale})`));
    ok(rule.includes('PORTFOLIO with its JSON field names'));
    const missing = await call(explain, { language, locale });
    eq(missing.statusCode, 400); eq(missing.body.code, 'missing_context'); eq(missing.body.error, explainError(language, 'missing_context'));
    const invalid = await call(explain, { context: 'invalid', data: {}, language, locale });
    eq(invalid.statusCode, 400); eq(invalid.body.code, 'invalid_context'); ok(!invalid.body.error.includes('{0}'));
    const explained = await call(explain, { context: 'metacognition', data: { calibration: { calibrationError: 0.123, sampleSize: 7 }, performance: { winRate: 37.5 }, userName: 'Example', regime: 'unknown' }, language, locale });
    eq(explained.statusCode, 200); ok(explained.ended);
    const explanationRequest = requests.at(-1);
    ok(explanationRequest.messages[0].content.includes(`OUTPUT LANGUAGE: ${name} (${locale})`));
    ok(explanationRequest.messages[1].content.includes('calibrationError: 0.123'));
    ok(explanationRequest.messages[1].content.includes('winRate: 37.5%'));
    const chatted = await call(chat, { message: 'A short greeting, please.', language, locale });
    eq(chatted.statusCode, 200); ok(chatted.ended);
    ok(requests.at(-1).messages[0].content.includes(`ALWAYS respond in ${name} (${locale})`));
  }
  // Exercise the actual multi-agent prompt path with every locale, without changing the policy.
  for (const [language, locale] of cases) {
    const first = requests.length;
    const result = await call(chat, { message: '<ADVICE_MODE>{"mode":"trade"}</ADVICE_MODE>\n[MANDATORY TRADING ROOM] Analyse MC.PA', language, locale });
    ok(result.ended); eq(requests.length - first, 3);
    for (const request of requests.slice(first)) ok(request.messages[0].content.includes(`ALWAYS respond in ${languageName(language, locale)} (${locale})`));
  }
  // Empty invest output uses translated local copy; machine JSON and all allocation values are invariant.
  emptyProvider = true;
  let referencePortfolio: unknown;
  for (const [language, locale] of cases) {
    const result = await call(chat, { message: '<ADVICE_MODE>{"mode":"invest"}</ADVICE_MODE>\nPlease assess a beginner savings plan.', language, locale });
    const data = result.output.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]')).map(line => JSON.parse(line.slice(6)));
    const transcript = data.map(chunk => chunk.choices?.[0]?.delta?.content ?? '').join('');
    ok(transcript.includes('**MY VERDICT:**')); ok(transcript.includes('9/10'));
    const portfolio = JSON.parse(transcript.split('PORTFOLIO: ')[1]);
    if (!referencePortfolio) referencePortfolio = portfolio;
    eq(portfolio, referencePortfolio); eq(portfolio.alloc.reduce((sum: number, [,pct]: [string,number]) => sum+pct, 0), 100);
    ok(transcript.includes(investSummaryLabel(language, 'CASH', 10)));
    if (language !== 'es') ok(!transcript.includes('La mezcla final es'));
    for (const template of ['allocation_split','cash_buffer_first','capital_preservation','retirement_plan','btc_accumulation','salary_bucket','yield_safety','crypto_core_diversification','default']) {
      const narrative = investFallbackText(language, template, '9/10', 'BTC 45%, ETH 25%, SPY 20%, CASH 10%');
      ok(narrative.includes('**ALPHA HUNTER:**')); ok(narrative.includes('**RED TEAM:**')); ok(narrative.includes('**MY VERDICT:**'));
      ok(narrative.includes('9/10')); ok(narrative.includes('BTC 45%, ETH 25%, SPY 20%, CASH 10%')); ok(!/\{[01]\}/.test(narrative));
    }
  }
  emptyProvider = false;
  // BCP47 public callers also retain Brazilian Portuguese without a separate locale.
  await call(chat, { message: 'A short greeting, please.', language: 'pt-BR' });
  ok(requests.at(-1).messages[0].content.includes('Brazilian Portuguese (pt-BR)'));
  failProvider = true;
  const unavailable = await call(explain, { context: 'metacognition', data: {}, language: 'fr', locale: 'fr-FR' });
  eq(unavailable.statusCode, 500); eq(unavailable.body.code, 'generation_failed'); eq(unavailable.body.error, 'Impossible de générer l’explication');
  eq((await call(explain, { language: 'de' }, 'GET')).body.error, 'Methode nicht erlaubt');
  ok(explainError('it', 'daily_limit', 10).includes('10/giorno'));
  // Qualified cash-market tickers never acquire a partial US ADR alias.
  for (const stock of REGIONAL_STOCKS) eq(detectStocks(stock.symbol), [stock.symbol]);
  eq(detectStocks('Compare SAP.DE and MC.PA'), ['SAP.DE','MC.PA']);
  eq(detectStocks('ENI.MI'), ['ENI.MI']); eq(detectIntent('ENI.MI'), 'price');
  eq(detectStocks("Analyse L'Oréal"), ['OR.PA']);
  eq(detectStocks('LVMH'), ['MC.PA']); eq(detectStocks('SAP'), ['SAP']); eq(detectStocks('VALE'), ['VALE']);
  eq(detectStocks('vale a pena esperar'), []);
  eq(detectStocks('Analyse SAP.DE'), ['SAP.DE']);
  eq(detectStocks('Ma réponse est oui ou non, or signifie une alternative'), []);
  eq(detectStocks('NVIDIA'), ['NVDA']);
  console.log(`locale55 explanation/chat/stock contracts: ${checks} checks passed; all network calls mocked.`);
} finally { globalThis.fetch = originalFetch; }
