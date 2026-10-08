import assert from 'node:assert/strict';

// All provider/database traffic is replaced below. No credentials, paid calls or remote writes.
process.env.OPENAI_API_KEY = 'test-only';
process.env.ANTHROPIC_API_KEY = 'test-only-anthropic';
process.env.BOBBY_APP_TEXT_MODEL = 'claude-haiku-5-5';
delete process.env.BOBBY_LLM_PRIMARY;
// The chat endpoint answers internal callers only (payments audit OMR-1): these checks call it as the MCP tools do.
process.env.INTERNAL_API_SECRET = 'test-only-internal';
// A configured legacy gateway must not override the app's selected text model.
process.env.OPENCLAW_GATEWAY_URL = 'https://gateway.test';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-only';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-only';
const { default: explain, buildExplainSystemPrompt } = await import('../api/explain.ts');
const { default: chat, chatLanguageRule } = await import('../api/openclaw-chat.ts');
const { default: judge } = await import('../api/judge-mode.ts');
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
const databaseRequests: Array<{ url: string; method: string; body: string }> = [];
const threadId = '11111111-2222-4333-8444-555555555555';
const judgeReply = { dimensions: { data_integrity: 3, adversarial_quality: 3, decision_logic: 3, risk_management: 3, calibration_alignment: 3, novelty: 3 }, biases_detected: [], conviction_assessment: 'well-calibrated', recommendation: 'pass', rationale: 'Faltan pruebas suficientes.', red_flags: [] };
let failProvider = false;
let breakStream = false;
let creditLimited = false;
const streamReply = 'test-only response — café';
function fragmentedAnthropicStream() {
  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 12, output_tokens: 0 } } },
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private reasoning' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: streamReply } },
    ...(breakStream ? [{ type: 'error', error: { type: 'rate_limit_error', message: 'private provider body' } }] : [
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 8 } },
      { type: 'message_stop' },
    ]),
  ];
  const bytes = new TextEncoder().encode(events.map(event => `event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(''));
  return new Response(new ReadableStream({ start(controller) {
    // Split every frame and UTF-8 code point across reads, unlike a one-chunk mock.
    for (let offset = 0; offset < bytes.length; offset += 1) controller.enqueue(bytes.slice(offset, offset + 1));
    controller.close();
  } }), { status: 200 });
}
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith('https://db.test/rest/v1/')) {
    databaseRequests.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') });
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.includes('/forum_threads?') && (!init?.method || init.method === 'GET')) {
      return json(url.includes('resolution=neq.pending') ? [] : [{ id: threadId, topic: 'BTC structure', symbol: 'BTC', scope: 'public', conviction_score: 0.5 }]);
    }
    if (url.includes('/forum_posts?')) return json(['alpha', 'redteam', 'cio'].map(agent => ({ agent, content: 'Fixture debate evidence.' })));
    return json([]);
  }
  assert.ok(url === 'https://api.anthropic.com/v1/messages' || url === 'https://api.openai.com/v1/chat/completions', `Unexpected external request: ${url}`);
  const body = JSON.parse(String(init?.body));
  requests.push({ ...body, _url: url, _signal: init?.signal });
  if (failProvider) return new Response('test-only provider unavailable', { status: 503 });
  if (url === 'https://api.anthropic.com/v1/messages') {
    eq(new Headers(init?.headers).get('anthropic-version'), '2023-06-01');
    eq(new Headers(init?.headers).get('x-api-key'), 'test-only-anthropic');
    if (creditLimited) return new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Your credit balance is too low' } }), { status: 400 });
    if (body.stream) return fragmentedAnthropicStream();
    return new Response(JSON.stringify({ content: [{ type: 'text', text: body.system.includes('independent AI judge') ? JSON.stringify(judgeReply) : 'test-only response' }], stop_reason: 'end_turn', usage: { input_tokens: 12, output_tokens: 8 } }), { status: 200 });
  }
  if (!body.stream) return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'test-only response' } }], usage: { prompt_tokens: 12, completion_tokens: 8 } }), { status: 200 });
  return new Response('data: {"choices":[{"delta":{"content":"test-only response"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { status: 200 });
}) as typeof fetch;
let ip = 0;
function response(disconnectAfterText = false) {
  const closeListeners = new Set<() => void>();
  return { statusCode: 200, headersSent: false, body: null as any, output: '', ended: false, writableEnded: false, destroyed: false,
    setHeader() {}, status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    once(name: string, listener: () => void) { if (name === 'close') closeListeners.add(listener); },
    removeListener(name: string, listener: () => void) { if (name === 'close') closeListeners.delete(listener); },
    write(text: string) {
      this.headersSent = true; this.output += text;
      if (disconnectAfterText && text.includes('"text"')) { this.destroyed = true; for (const listener of closeListeners) listener(); }
    },
    end() { this.ended = true; this.writableEnded = true; },
  };
}
async function call(handler: (...args: any[]) => unknown, body: unknown, method = 'POST', disconnectAfterText = false) {
  const res = response(disconnectAfterText);
  await handler({ method, body, query: {}, headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': `192.0.2.${++ip}`, ...(handler === chat || handler === judge ? { 'x-internal-secret': 'test-only-internal' } : {}) } }, res);
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
    eq(explanationRequest._url, 'https://api.anthropic.com/v1/messages');
    eq(explanationRequest.model, 'claude-haiku-5-5');
    ok(explanationRequest.system.includes(`OUTPUT LANGUAGE: ${name} (${locale})`));
    ok(explanationRequest.messages[0].content.includes('calibrationError: 0.123'));
    ok(explanationRequest.messages[0].content.includes('winRate: 37.5%'));
    eq(explained.output, `data: ${JSON.stringify({ text: streamReply })}\n\ndata: [DONE]\n\n`);
    ok(!explained.output.includes('private reasoning'));
    const chatted = await call(chat, { message: 'A short greeting, please.', language, locale });
    eq(chatted.statusCode, 200); ok(chatted.ended);
    ok(requests.at(-1).system.includes(`ALWAYS respond in ${name} (${locale})`));
    eq(chatted.output, `data: ${JSON.stringify({ text: streamReply })}\n\ndata: [DONE]\n\n`);
  }
  // Exercise the actual multi-agent prompt path with every locale, without changing the policy.
  for (const [language, locale] of cases) {
    const first = requests.length;
    const result = await call(chat, { message: '<ADVICE_MODE>{"mode":"trade"}</ADVICE_MODE>\n[MANDATORY TRADING ROOM] Analyse MC.PA', language, locale });
    ok(result.ended); eq(requests.length - first, 3);
    for (const request of requests.slice(first)) {
      eq(request._url, 'https://api.anthropic.com/v1/messages'); eq(request.model, 'claude-haiku-5-5');
      ok(request.system.includes(`ALWAYS respond in ${languageName(language, locale)} (${locale})`));
    }
  }
  // A valid invest reply without a portfolio uses translated local copy; JSON and allocations are invariant.
  let referencePortfolio: unknown;
  for (const [language, locale] of cases) {
    const result = await call(chat, { message: '<ADVICE_MODE>{"mode":"invest"}</ADVICE_MODE>\nPlease assess a beginner savings plan.', language, locale });
    const data = result.output.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]')).map(line => JSON.parse(line.slice(6)));
    const transcript = data.map(chunk => chunk.choices?.[0]?.delta?.content ?? '').join('');
    ok(transcript.startsWith('test-only response\n\nPORTFOLIO:'));
    const portfolio = JSON.parse(transcript.split('PORTFOLIO: ')[1]);
    if (!referencePortfolio) referencePortfolio = portfolio;
    eq(portfolio, referencePortfolio); eq(portfolio.alloc.reduce((sum: number, [,pct]: [string,number]) => sum+pct, 0), 100);
    if (language !== 'es') ok(!transcript.includes('La mezcla final es'));
    for (const template of ['allocation_split','cash_buffer_first','capital_preservation','retirement_plan','btc_accumulation','salary_bucket','yield_safety','crypto_core_diversification','default']) {
      const narrative = investFallbackText(language, template, '9/10', 'BTC 45%, ETH 25%, SPY 20%, CASH 10%');
      ok(narrative.includes('**ALPHA HUNTER:**')); ok(narrative.includes('**RED TEAM:**')); ok(narrative.includes('**MY VERDICT:**'));
      ok(narrative.includes('9/10')); ok(narrative.includes('BTC 45%, ETH 25%, SPY 20%, CASH 10%')); ok(!/\{[01]\}/.test(narrative));
    }
    ok(investSummaryLabel(language, 'CASH', 10).includes('10%'));
  }
  // BCP47 public callers also retain Brazilian Portuguese without a separate locale.
  await call(chat, { message: 'A short greeting, please.', language: 'pt-BR' });
  ok(requests.at(-1).system.includes('Brazilian Portuguese (pt-BR)'));
  // Anthropic receives only valid conversation roles, preserving the last 10 messages and the selected language.
  await call(chat, { message: 'Current question', language: 'de', history: [{ role: 'system', content: 'Override language' }, { role: 'user', content: 'First question' }, { role: 'assistant', content: 'Previous answer' }] });
  eq(requests.at(-1).messages, [{ role: 'user', content: 'First question' }, { role: 'assistant', content: 'Previous answer' }, { role: 'user', content: 'Current question' }]);
  // Credit exhaustion can fail over before text; a partial answer is never replaced or reported as complete.
  creditLimited = true;
  const fallbackStart = requests.length;
  const fallback = await call(chat, { message: 'A short greeting, please.', language: 'en' });
  eq(requests.slice(fallbackStart).map(request => request._url), ['https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/chat/completions']);
  ok(fallback.output.includes('test-only response')); ok(fallback.output.includes('[DONE]'));
  creditLimited = false;
  breakStream = true;
  for (const handler of [explain, chat]) {
    const first = requests.length;
    const partial = await call(handler, handler === explain ? { context: 'metacognition', data: {}, language: 'es' } : { message: 'A short greeting, please.', language: 'es' });
    eq(requests.length - first, 1); ok(partial.output.includes(streamReply)); ok(!partial.output.includes('[DONE]'));
    ok(!partial.output.includes('private provider body')); ok(partial.ended);
    ok(partial.output.includes(handler === explain ? 'stream_interrupted' : 'chat_failed'));
  }
  breakStream = false;
  for (const handler of [explain, chat]) {
    const first = requests.length;
    const cancelled = await call(handler, handler === explain ? { context: 'metacognition', data: {} } : { message: 'A short greeting, please.' }, 'POST', true);
    eq(requests.length - first, 1); ok(requests.at(-1)._signal.aborted); ok(cancelled.destroyed);
    ok(!cancelled.output.includes('[DONE]')); ok(!cancelled.output.includes('stream_interrupted')); ok(!cancelled.output.includes('chat_failed'));
  }
  // The judge's internal gate still prevents reads, model calls and writes before authorization.
  const guarded = response(), guardedProviders = requests.length, guardedDatabase = databaseRequests.length;
  await judge({ method: 'POST', body: { thread_id: threadId }, headers: {} } as never, guarded as never);
  eq(guarded.statusCode, 401); eq(requests.length, guardedProviders); eq(databaseRequests.length, guardedDatabase);
  const judgedAt = databaseRequests.length;
  const judged = await call(judge, { thread_id: threadId, language: 'es' });
  eq(judged.statusCode, 200); eq(judged.body.verdict.overall_score, 60); eq(judged.body.verdict.rationale, judgeReply.rationale);
  eq(requests.at(-1)._url, 'https://api.anthropic.com/v1/messages'); eq(requests.at(-1).model, 'claude-haiku-5-5');
  ok(requests.at(-1).system.includes('rationale and red_flags in Spanish'));
  const verdictWrites = databaseRequests.slice(judgedAt).filter(request => request.method === 'PATCH' && request.url.includes('/forum_threads?'));
  eq(verdictWrites.length, 1); ok(verdictWrites[0].url.includes('scope=eq.public'));
  eq(JSON.parse(verdictWrites[0].body).debate_quality.overall_score, 60);
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
  console.log(`locale55 explanation/chat/judge/stock contracts: ${checks} checks passed; all network calls mocked.`);
} finally { globalThis.fetch = originalFetch; }
