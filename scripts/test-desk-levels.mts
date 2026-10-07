// The desk's analysis levels and the invite system, without a network or a database:
//   · the per-model adapter sends each family its own request shape (GPT-6: max_completion_tokens,
//     no temperature; GPT-4o: max_tokens + temperature; Claude: output_config effort + json_schema),
//     treats a token-limited answer as a failure and records tokens and cost;
//   · Rápido / Profundo / Máximo route to the planned models, Máximo adds the second round and the
//     scenarios, the guard covers them, and the horizon-sufficiency note reaches every role;
//   · the endpoint spends a premium allowance before any model call, refuses with a stable code and the
//     meter, gives the allowance back when the analysis fails, and writes only numbers to the cost ledger;
//   · the invite code format, creation and claim parameters, and the shape of the link every client shares;
//   · the next question (synthesis.followUp): it asks what or why, never whether or when to act, in six
//     languages; one that breaks the rule or the guard is replaced by a fixed question in the reply's language
//     and the read is served as it was, with the replacement logged by its class and never by a text.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
process.env.RATE_LIMIT_SALT = 'test-salt';
delete process.env.BOBBY_DESK_MODEL;
delete process.env.BOBBY_APP_TEXT_MODEL;
// The suite below pins the OpenAI-first plans; the Haiku-first default is checked in its own block at the end.
process.env.BOBBY_LLM_PRIMARY = 'openai';

const { completeJson, LlmIncompleteError } = await import('../api/_lib/llm.ts');
const { runDeskDebate, DeskOutputRejected, sufficiencyOf, servedFollowUp, publicTextViolation } = await import('../api/_lib/desk-debate.ts');
const { nextQuestionViolation, nextQuestionFallback, nextQuestionSecond, repeatsQuestion, NEXT_QUESTION_RULE, FOLLOW_UP_MIN, FOLLOW_UP_MAX } = await import('../api/_lib/desk-next-question.ts');
const { LEVEL_LIMITS, REFERRAL, levelPlan } = await import('../api/_lib/desk-levels.ts');
const { resetLlmSpendCache } = await import('../api/_lib/llm-usage.ts');
const { default: deskHandler } = await import('../api/desk-debate.ts');
const { isReferralCode, referralCode, claimReferral, referralStatus, inviteUrl } = await import('../api/_lib/referrals.ts');

const original = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const H = 3600_000;
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return ''; } };

interface Call { url: string; body: any; headers: Record<string, string>; method: string }
let calls: Call[] = [];
type Reply = (call: Call) => Response | Promise<Response>;
function mock(reply: Reply) {
  calls = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const call: Call = { url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null, headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])), method: init?.method ?? 'GET' };
    calls.push(call);
    return reply(call);
  }) as typeof fetch;
}
const openai = (content: unknown, finish = 'stop') => json({ choices: [{ finish_reason: finish, message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens_details: { reasoning_tokens: 50 } } });
const claude = (content: unknown, stop = 'end_turn') => json({ stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(content) }], usage: { input_tokens: 2000, output_tokens: 500, cache_read_input_tokens: 0, output_tokens_details: { thinking_tokens: 120 } } });
const schema = { name: 'x', schema: { type: 'object', properties: { analysis: { type: 'string' } }, required: ['analysis'], additionalProperties: false } };

try {
  // ---------- the adapter: one request shape per model family ----------
  {
    const usage: any[] = [];
    mock(() => openai({ analysis: 'ok' }));
    eq(await completeJson({ provider: 'openai', model: 'gpt-6-luna', maxTokens: 1600, timeoutMs: 10_000, effort: 'low' }, 'sys', 'user', schema, { endpoint: 't', role: 'alpha', usage }), { analysis: 'ok' }, 'GPT-6 answer parsed');
    const body = calls[0].body;
    eq([body.max_completion_tokens, 'max_tokens' in body, 'temperature' in body, body.reasoning_effort], [1600, false, false, 'low'], 'GPT-6: max_completion_tokens, no max_tokens, no temperature');
    eq([body.response_format.type, body.response_format.json_schema.strict], ['json_schema', true], 'GPT-6: strict JSON schema');
    eq(body.messages.map((m: any) => m.role), ['system', 'user'], 'system + user messages');
    eq([usage[0].model, usage[0].tokensIn, usage[0].tokensOut, usage[0].tokensReasoning, usage[0].ok, usage[0].role], ['gpt-6-luna', 1000, 200, 50, true, 'alpha'], 'usage recorded');
    ok(Math.abs(usage[0].usd - (1000 * 0.10 + 200 * 0.50) / 1e6) < 1e-12, 'cost at list price');

    mock(() => openai({ analysis: 'ok' }));
    await completeJson({ provider: 'openai', model: 'gpt-4o-mini', maxTokens: 650, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' });
    eq([calls[0].body.max_tokens, calls[0].body.temperature, 'max_completion_tokens' in calls[0].body], [650, 0.2, false], 'GPT-4o keeps max_tokens + temperature');

    mock(() => claude({ analysis: 'ok' }));
    await completeJson({ provider: 'anthropic', model: 'claude-haiku-5-5', effort: 'high', maxTokens: 6000, timeoutMs: 10_000 }, 'sys', 'user', schema, { endpoint: 't' });
    const c = calls[0];
    eq([c.url, c.headers['x-api-key'], c.headers['anthropic-version']], ['https://api.anthropic.com/v1/messages', 'test-anthropic', '2023-06-01'], 'Claude: endpoint and headers');
    eq([c.body.max_tokens, c.body.system, c.body.output_config.effort, c.body.output_config.format.type], [6000, 'sys', 'high', 'json_schema'], 'Claude: effort + json_schema in output_config');
    ok(!('temperature' in c.body), 'Claude: no temperature');

    const cut: any[] = [];
    mock(() => claude({ analysis: 'partial' }, 'max_tokens'));
    await assert.rejects(completeJson({ provider: 'anthropic', model: 'claude-haiku-5-5', maxTokens: 10, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't', usage: cut }), LlmIncompleteError); checks++;
    eq([cut[0].ok, cut[0].stop, cut[0].tokensOut], [false, 'max_tokens', 500], 'a token-limited answer is a failure, still billed in the ledger');
    mock(() => openai({ analysis: 'partial' }, 'length'));
    await assert.rejects(completeJson({ provider: 'openai', model: 'gpt-6-luna', maxTokens: 10, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' }), LlmIncompleteError); checks++;

    let n = 0;
    mock(() => (++n === 1 ? json({ error: 'overloaded' }, 529) : claude({ analysis: 'after retry' })));
    eq(await completeJson({ provider: 'anthropic', model: 'claude-haiku-5-5', maxTokens: 100, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' }), { analysis: 'after retry' }, 'one retry on 529');
    mock(() => json({ error: 'bad request' }, 400));
    await assert.rejects(completeJson({ provider: 'openai', model: 'gpt-6-luna', maxTokens: 100, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' })); checks++;
    eq(calls.filter((c) => hostOf(c.url) === 'api.openai.com').length, 1, 'a 400 is not retried');
    mock(() => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n{"analysis":"fenced"}\n```' }], usage: {} }));
    eq(await completeJson({ provider: 'anthropic', model: 'claude-haiku-5-5', maxTokens: 100, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' }), { analysis: 'fenced' }, 'a stray code fence around valid JSON is tolerated');
  }

  // ---------- levels ----------
  const evidence = { symbol: 'BTC', technicals: { price: 100, trend: 'lateral' }, provenance: { provider: 'OKX', instrument: 'BTC-USDT', assetType: 'crypto', timeframe: '1H', asOf: new Date().toISOString() } } as any;
  const v2 = { ...evidence, timeframes: { '1H': evidence.technicals, '4H': { price: 100 }, '1D': { price: 100 } }, derivatives: { fundingRatePct: 0.01, nextFundingAt: null, openInterest: 5 }, record: { resolvedCalls: 10, wins: 6, losses: 3, breakEven: 1, lastResolved: [], latestCall: null } };
  const ALPHA = 'The recent structure supports a conditional long if the range breaks.';
  const RED = 'The break has not happened and the higher timeframes are still flat.';
  const REBUTTAL = 'Red Team is right that the break is unconfirmed; the case only holds above the range.';
  const SYN = { headline: 'Not yet: BTC is still inside its range.', why: 'Alpha needs a break the chart has not shown.', risk: 'The weekly view is flat, so a break can fail.', watch: 'A 4H close above the range high.', watchLevel: 104, followUp: 'What if BTC loses the range low?' };
  const CIO = { analysis: 'The evidence does not support a clear case yet; wait for the range to resolve.', verdict: 'wait', direction: 'none', synthesis: SYN };
  const SCEN = { confirm: 'A daily close above the range high with rising volume.', invalidate: 'A 4H close back below the range low.' };
  const byRole = (c: Call) => {
    const text = c.url.includes('anthropic') ? c.body.system : c.body.messages[0].content;
    return /second round/.test(text) ? 'rebuttal' : /Your role is CIO/.test(text) ? 'cio' : /Red Team: challenge/.test(text) ? 'red' : 'alpha';
  };
  const debateMock = (scenarios: unknown = SCEN) => mock((c) => {
    const r = byRole(c);
    const content = r === 'alpha' ? { analysis: ALPHA } : r === 'red' ? { analysis: RED } : r === 'rebuttal' ? { analysis: REBUTTAL } : c.body.output_config?.format?.schema?.properties?.scenarios ? { ...CIO, scenarios } : CIO;
    return hostOf(c.url) === 'api.anthropic.com' ? claude(content) : openai(content);
  });

  debateMock();
  const quick = await runDeskDebate('¿Conviene entrar a BTC esta semana?', evidence, 'es');
  eq(calls.map((c) => [byRole(c), c.body.model]), [['alpha', 'gpt-6-luna'], ['red', 'gpt-6-luna'], ['cio', 'gpt-6-luna']], 'Rápido: gpt-6-luna ×3');
  eq([quick.level, quick.sufficiency.horizon, quick.sufficiency.sufficient, quick.sufficiency.missing], ['rapido', 'week', false, ['4H', '1D']], 'Rápido: the weekly question is flagged as missing 4H and 1D');
  ok(calls.every((c) => JSON.parse(c.body.messages[1].content).sufficiency.horizon === 'week'), 'every role receives the sufficiency note');
  ok(calls.every((c) => /Never name the data vendor or exchange/.test(c.body.messages[0].content)), 'no vendor names in answers');
  const { pricePosition } = await import('../api/_lib/desk-debate.ts');
  eq(pricePosition({ price: 357.5, ema50: 362.1, resistance: 345.3 }), { ema20: null, ema50: { level: 362.1, where: 'above price', pctOfPrice: 1.29 }, support: null, resistance: { level: 345.3, where: 'below price', pctOfPrice: 3.41 } }, 'each level\'s place against the price is computed, never left to the model');
  eq(pricePosition({ price: 715.6, support: 537.3 })!.support, { level: 537.3, where: 'below price', pctOfPrice: 24.92 }, 'distances are in % of the price, not of the level');
  ok(calls.every((c) => JSON.parse(c.body.messages[1].content).evidence.technicals.position !== undefined), 'every role receives the computed position');
  eq(quick.agents.direction, 'none', "'wait' keeps direction none");
  eq(quick.agents.synthesis, { ...SYN, followUp: '¿Qué tendría que cambiar en BTC para que cambie esta lectura?' }, 'the CIO returns the synthesis the reader sees first (its English next question, in a Spanish reply, is replaced)');
  debateMock();
  eq((await runDeskDebate('Is BTC worth a look this week?', evidence, 'en')).agents.synthesis, SYN, 'an English reply keeps the CIO\'s own next question, untouched');
  mock((c) => openai(byRole(c) === 'cio' ? { ...CIO, synthesis: { ...SYN, watchLevel: 5000 } } : { analysis: byRole(c) === 'alpha' ? ALPHA : RED }));
  eq((await runDeskDebate('Is this real?', evidence, 'en')).agents.synthesis.watchLevel, null, 'a watch level far from the price is never drawn');
  mock((c) => openai(byRole(c) === 'cio' ? { ...CIO, synthesis: { ...SYN, watchLevel: 0 } } : { analysis: byRole(c) === 'alpha' ? ALPHA : RED }));
  eq((await runDeskDebate('Is this real?', evidence, 'en')).agents.synthesis.watchLevel, null, '0 means no level to watch');
  ok(/"synthesis"/.test(JSON.stringify(calls[2].body.response_format.json_schema.schema.required)), 'the synthesis is required by the structured output');

  // The live desk: each argument is emitted once it passed the guard, in the debate's order.
  debateMock();
  const heard: any[] = [];
  await runDeskDebate('Is this real?', evidence, 'en', { onEvent: (e) => heard.push(e) });
  eq(heard.map((e) => e.type === 'agent' ? e.role : e.type), ['evidence', 'alpha', 'red'], 'live events: evidence, Alpha, Red Team');
  eq(heard[1].text, ALPHA, 'the live argument is the model text');
  mock((c) => openai(byRole(c) === 'alpha' ? { analysis: 'Buy BTC now, this setup is a sure thing for the week ahead.' } : byRole(c) === 'cio' ? CIO : { analysis: RED }));
  const blocked: any[] = [];
  await assert.rejects(runDeskDebate('Is this real?', evidence, 'en', { onEvent: (e) => blocked.push(e) }), (e: unknown) => e instanceof DeskOutputRejected, 'an argument that breaks the guard fails the debate'); checks++;
  ok(!blocked.some((e) => e.type === 'agent'), 'and it is never streamed to the reader');
  ok(!calls.some((c) => byRole(c) === 'red'), 'nor paid for past it');
  mock((c) => openai(byRole(c) === 'cio' ? { ...CIO, synthesis: { ...SYN, why: 'This breakout offers guaranteed profits for patient holders.' } } : { analysis: byRole(c) === 'alpha' ? ALPHA : RED }));
  await assert.rejects(runDeskDebate('Is this real?', evidence, 'en'), (e: unknown) => e instanceof DeskOutputRejected, 'a guarantee inside the synthesis fails the debate'); checks++;
  // ---------- the next question: what it may ask, and what is served when it asks something else ----------
  {
    const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'] as const;
    const FALLBACK: Record<(typeof LANGS)[number], string> = {
      en: 'What would have to change in BTC for this read to change?',
      es: '¿Qué tendría que cambiar en BTC para que cambie esta lectura?',
      fr: 'Qu’est-ce qui devrait changer sur BTC pour que cette analyse change ?',
      pt: 'O que teria de mudar em BTC para esta análise mudar?',
      it: 'Che cosa dovrebbe cambiare in BTC perché questa analisi cambi?',
      de: 'Was müsste sich bei BTC ändern, damit sich diese Analyse ändert?',
    };
    // The second fixed question: served when the first is the question the reader just asked.
    const SECOND: Record<(typeof LANGS)[number], string> = {
      en: 'What is behind the latest move in BTC?',
      es: '¿Qué hay detrás del último movimiento de BTC?',
      fr: 'Qu’est-ce qui explique le dernier mouvement de BTC ?',
      pt: 'O que explica o último movimento de BTC?',
      it: 'Che cosa spiega l’ultimo movimento di BTC?',
      de: 'Was steckt hinter der jüngsten Bewegung bei BTC?',
    };
    // The words Bobby's copy never uses (buy, sell, profit, guaranteed, returns, advice, signal, alert), by their stems in the six languages.
    const FORBIDDEN = /\b(?:buy|sell|sold|bought|profit|gain|guarant|return|advi[cs]e|recommend|signal|alert|compr[aáoeé]|vend|venta|ganancia|beneficio|lucro|garant|retorno|rendim|consejo|asesor|recom[ei]|señal|alerta|achet|achat|vente|bénéfice|rendement|conseil|signaux|alerte|ganho|conselho|sina[li]|acquist|vendit|profitt|guadagn|garanz|consigli|segnal|allert|kauf|gewinn|rendite|ertrag|empfehl|beratung|alarm)/iu;
    const silent = <T,>(run: () => T): { value: T; lines: string[] } => {
      const lines: string[] = [], saved = console.error;
      console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
      try { return { value: run(), lines }; } finally { console.error = saved; }
    };
    const quiet = async <T,>(run: () => Promise<T>): Promise<{ value: T; lines: string[] }> => {
      const lines: string[] = [], saved = console.error;
      console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
      try { return { value: await run(), lines }; } finally { console.error = saved; }
    };

    // The six fixed questions: pinned, inside the wire bounds, one question each, and clean under both checks for any symbol.
    for (const lang of LANGS) {
      eq([nextQuestionFallback(lang, 'BTC'), nextQuestionSecond(lang, 'BTC')], [FALLBACK[lang], SECOND[lang]], `${lang}: the two fixed next questions`);
      for (const symbol of ['BTC', 'NVDA', 'MC.PA', '7203.T', '1INCH', 'BRK-B', 'NOW', 'ADD', 'HOLD', 'BUY', 'SELL', 'ME', 'I', 'A', 'ABCDEFGHIJ0123456789']) {
        for (const [which, fixed] of [['first', nextQuestionFallback(lang, symbol)], ['second', nextQuestionSecond(lang, symbol)]] as const) {
          eq([nextQuestionViolation(fixed, lang, symbol), publicTextViolation(fixed)], [null, null], `${lang} ${symbol}: the ${which} fixed question passes the next-question rule and the output guard`);
          ok(fixed.length >= FOLLOW_UP_MIN && fixed.length <= FOLLOW_UP_MAX && fixed.includes(symbol) && fixed.split('?').length === 2 && !/[.!;:\n]/.test(fixed.replace(symbol, '')), `${lang} ${symbol}: the ${which} is one sentence naming the symbol, inside the bounds every client decodes`);
        }
        ok(!repeatsQuestion(nextQuestionSecond(lang, symbol), nextQuestionFallback(lang, symbol), symbol), `${lang} ${symbol}: the two fixed questions are two questions`);
      }
      ok(!FORBIDDEN.test(nextQuestionFallback(lang, 'XYZ')) && !FORBIDDEN.test(nextQuestionSecond(lang, 'XYZ')), `${lang}: the fixed questions use none of the forbidden words`);
    }
    eq([FOLLOW_UP_MIN, FOLLOW_UP_MAX], [6, 160], 'the wire bounds are the ones the contract always had');

    // Good questions pass untouched. The English and Spanish ones were written by the models (the paired eval of
    // 2026-09-29, docs/ai/data) or are this repository's own fixtures; the other four languages are in their shape.
    const GOOD: Record<(typeof LANGS)[number], Array<[string, string]>> = {
      en: [['BTC', 'What if BTC loses the range low?'], ['BTC', 'What would confirm the BTC trend?'], ['MC.PA', 'What is missing for MC.PA?'], ['NVDA', 'What would confirm a NVDA breakout?'],
        ['NVDA', 'What would invalidate the bullish case for NVDA?'], ['AAPL', 'How would a weekly chart change the AAPL outlook?'], ['AAPL', 'What do AAPL’s daily and weekly charts show?'],
        ['MSFT', "What would make MSFT's uptrend fail over the next month?"], ['BTC', 'Why is BTC trading inside its range?'], ['BTC', 'What does the 4H chart say about BTC?'], ['NVDA', 'How does NVDA look?']],
      es: [['SOL', '¿Qué confirmaría una ruptura de SOL?'], ['TSLA', '¿Qué tendría que cambiar en TSLA para confirmar un rebote?'], ['TSLA', '¿Qué dice el gráfico semanal de TSLA sobre su tendencia?'],
        ['DOGE', '¿Qué le falta a DOGE para confirmar una tendencia en 4H?'], ['DOGE', '¿Qué nivel de soporte mantiene el sesgo alcista diario de DOGE?'], ['SOL', '¿Qué significa que SOL esté sobrecomprado en el gráfico diario?'],
        ['BTC', '¿Por qué pierde fuerza la tendencia de BTC?'], ['BTC', '¿Y si BTC pierde el mínimo del rango?'], ['BTC', '¿De qué depende la tendencia de BTC?']],
      fr: [['BTC', 'Qu’est-ce qui confirmerait une cassure de BTC ?'], ['NVDA', 'Pourquoi la tendance de NVDA faiblit-elle ?'], ['NVDA', 'Que montre le graphique hebdomadaire de NVDA ?'], ['BTC', 'Et si BTC perdait le bas de son range ?'], ['MC.PA', 'À quoi tient la tendance de MC.PA ?']],
      pt: [['BTC', 'O que confirmaria um rompimento de BTC?'], ['NVDA', 'Por que a tendência de NVDA perdeu força?'], ['NVDA', 'O que mostra o gráfico semanal de NVDA?'], ['BTC', 'E se BTC perder o suporte?'], ['BTC', 'Qual é o principal risco para BTC?']],
      it: [['BTC', 'Che cosa confermerebbe una rottura di BTC?'], ['NVDA', 'Perché il trend di NVDA si è indebolito?'], ['NVDA', 'Cosa mostra il grafico settimanale di NVDA?'], ['BTC', 'E se BTC perdesse il supporto?'], ['BTC', 'Da cosa dipende il trend di BTC?']],
      de: [['BTC', 'Was würde einen Ausbruch bei BTC bestätigen?'], ['NVDA', 'Warum verliert der Trend von NVDA an Kraft?'], ['NVDA', 'Was zeigt der Wochenchart von NVDA?'], ['BTC', 'Wie würde ein Bruch der Unterstützung das Bild bei BTC ändern?'], ['BTC', 'Unter welchen Bedingungen dreht der Trend bei BTC?']],
    };
    // Plain what-happened and why questions an earlier version of the check refused: a word that acts in one
    // language and is ordinary in another (Spanish "salir" and Italian "salire", Italian "leva" and Portuguese
    // "leva", German "Chance" and the English one), a range breakout named by its exit noun, the people who invest,
    // the Italian elisions "cos’" and "com’", and a question of three words once its ticker is counted.
    const PLAIN: Record<(typeof LANGS)[number], Array<[string, string]>> = {
      en: [['NVDA', 'What moved NVDA?'], ['NVDA', 'What are investors missing about NVDA?'], ['NVDA', 'What chance does NVDA have of breaking out?'], ['NVDA', 'Why is NVDA weak at the moment?'],
        ['NVDA', 'What do NVDA’s own charts show?'], ['NVDA', 'Why would a trader doubt this NVDA breakout?'], ['NVDA', 'What time frame matters most for NVDA?']],
      es: [['BTC', '¿Qué confirmaría una salida del rango en BTC?'], ['NVDA', '¿Qué no ven los inversionistas en NVDA?'], ['NVDA', '¿Por qué no sube NVDA?'], ['NVDA', '¿Qué frena a NVDA en este momento?'],
        ['NVDA', '¿Qué compensa la debilidad de NVDA?'], ['BTC', '¿Y si BTC pierde los mínimos?'], ['BTC', '¿Qué confirmaría una inversión de tendencia en BTC?']],
      fr: [['BTC', 'Qu’est-ce qui confirmerait une sortie de range de BTC ?'], ['NVDA', 'Pourquoi NVDA baisse ?'], ['NVDA', 'Qu’est-ce qui échappe aux investisseurs sur NVDA ?'], ['NVDA', 'Pourquoi NVDA baisse en ce moment ?'],
        ['BTC', 'Qu’est-ce qui ferait sortir BTC de son range ?'], ['NVDA', 'Quelle chance a NVDA de casser sa résistance ?'], ['BTC', 'Qu’est-ce qui confirmerait une inversion de tendance sur BTC ?']],
      pt: [['NVDA', 'O que leva NVDA a cair?'], ['BTC', 'O que confirmaria uma saída do range em BTC?'], ['NVDA', 'O que os investidores não veem em NVDA?'], ['NVDA', 'Por que NVDA cai?'], ['NVDA', 'O que trava NVDA neste momento?']],
      it: [['NVDA', 'Cos’è successo a NVDA?'], ['NVDA', 'Cos’ha spinto NVDA al ribasso?'], ['NVDA', 'Com’è cambiato il trend di NVDA?'], ['NVDA', 'Cosa farebbe salire NVDA?'], ['NVDA', 'Perché NVDA continua a salire?'],
        ['BTC', 'Cosa confermerebbe un’uscita dal range di BTC?'], ['NVDA', 'Perché NVDA scende?'], ['NVDA', 'Cosa sfugge agli investitori su NVDA?'], ['NVDA', 'Perché non sale NVDA?']],
      de: [['NVDA', 'Warum fällt NVDA?'], ['NVDA', 'Was übersehen Investoren bei NVDA?'], ['NVDA', 'Was bremst NVDA im Moment?'], ['NVDA', 'Warum steigt NVDA nicht weiter?']],
    };
    // Ordinary questions, per language: what the word list (desk-next-question-lexicon.ts) must keep letting
    // through. The first of en and es are the CIO's own from the paired eval of 2026-09-29; the rest are the same
    // kinds of question in the other four languages, with the regional tickers a model names by their root.
    const ORDINARY: Record<(typeof LANGS)[number], Array<[string, string]>> = {
      en: [
        ['NVDA', 'What would confirm a NVDA breakout?'], ['NVDA', 'What would weaken the NVDA uptrend from here?'], ['AAPL', 'How would a pullback to support change the AAPL outlook?'],
        ['MSFT', 'How would a weekly chart change the MSFT outlook?'], ['NVDA', 'What would invalidate the bullish case for NVDA?'], ['META', 'What would make a META pullback a real daily downtrend?'],
        ['AAPL', 'What do AAPL’s daily and weekly charts show?'], ['MSFT', 'What could move MSFT stock over the next month?'], ['NVDA', 'Why did NVDA fall after earnings?'], ['NVDA', 'What is driving the NVDA rally?'],
        ['BTC', 'Why is BTC lagging the rest of the market?'], ['BTC', 'What does funding say about BTC sentiment?'], ['NVDA', 'What would it take for NVDA to break resistance?'], ['TSLA', 'Why has TSLA momentum faded this week?'],
        ['NVDA', 'What does the weekly chart show for NVDA?'], ['ETH', 'What is behind the drop in ETH volume?'], ['NVDA', 'Why is NVDA holding above its average?'], ['NVDA', 'Why are investors worried about NVDA?'],
        ['NVDA', 'What moved NVDA?'], ['AAPL', 'Which timeframe matters most for the AAPL trend?'], ['SOL', 'What happens to the SOL trend if support breaks?'], ['NVDA', 'How does the daily trend differ from the weekly trend in NVDA?'],
        ['NVDA', 'What is NVDA’s chart missing for a confirmed uptrend?'], ['BTC', 'Why does volume matter for this BTC move?'], ['NVDA', 'What changed in NVDA since the last report?'], ['NVDA', 'What explains the weakness in NVDA this week?'],
      ],
      es: [
        ['BTC', '¿Qué confirmaría una ruptura de BTC?'], ['ETH', '¿Qué haría más sólida una ruptura de resistencia en ETH?'], ['TSLA', '¿Qué muestran los datos diarios y semanales de TSLA?'], ['TSLA', '¿Qué nivel confirmaría un cambio de tendencia en TSLA?'],
        ['DOGE', '¿Qué nivel de soporte mantiene el sesgo alcista diario de DOGE?'], ['BTC', '¿Qué haría más débil la tendencia alcista de BTC?'], ['SOL', '¿Qué significa que SOL esté sobrecomprado en el gráfico diario?'], ['TSLA', '¿Qué tendría que cambiar en TSLA para confirmar un rebote?'],
        ['TSLA', '¿Qué dice el gráfico semanal de TSLA sobre su tendencia?'], ['DOGE', '¿Qué le falta a DOGE para confirmar una tendencia en 4H?'], ['MSFT', '¿Qué confirmaría el setup de MSFT?'], ['NVDA', '¿Por qué cayó NVDA después de los resultados?'],
        ['NVDA', '¿Qué está impulsando la subida de NVDA?'], ['BTC', '¿Por qué BTC se queda atrás del resto del mercado?'], ['BTC', '¿Qué pasaría con BTC si pierde el soporte?'], ['NVDA', '¿Qué explica la debilidad de NVDA esta semana?'],
        ['ETH', '¿Qué hay detrás de la caída del volumen en ETH?'], ['NVDA', '¿Por qué la tendencia de NVDA perdió fuerza?'], ['NVDA', '¿Qué cambió en NVDA desde el último reporte?'], ['SOL', '¿Qué invalidaría el escenario alcista de SOL?'],
        ['NVDA', '¿Cómo cambia la lectura de NVDA en el gráfico semanal?'], ['BTC', '¿De qué depende que BTC recupere su tendencia?'], ['NVDA', '¿Qué frena a NVDA cerca de la resistencia?'], ['NVDA', '¿Por qué el volumen importa en este movimiento de NVDA?'],
      ],
      fr: [
        ['BTC', 'Qu’est-ce qui confirmerait une cassure de BTC ?'], ['NVDA', 'Pourquoi la tendance de NVDA s’est-elle affaiblie ?'], ['NVDA', 'Que montre le graphique hebdomadaire de NVDA ?'], ['NVDA', 'Pourquoi NVDA a-t-il baissé après les résultats ?'],
        ['NVDA', 'Qu’est-ce qui explique la faiblesse de NVDA cette semaine ?'], ['BTC', 'Que se passerait-il si BTC perdait son support ?'], ['NVDA', 'Qu’est-ce qui invaliderait le scénario haussier de NVDA ?'], ['ETH', 'Qu’y a-t-il derrière la baisse du volume sur ETH ?'],
        ['NVDA', 'Qu’est-ce qui pourrait faire baisser NVDA ?'], ['NVDA', 'Comment expliquer la baisse de NVDA ?'], ['BTC', 'De quoi dépend la tendance de BTC ?'], ['NVDA', 'Qu’est-ce qui a changé pour NVDA depuis le dernier rapport ?'],
        ['NVDA', 'Qu’est-ce qui freine NVDA près de la résistance ?'], ['BTC', 'Pourquoi le volume compte-t-il pour ce mouvement de BTC ?'], ['NVDA', 'Qu’est-ce qui manque à NVDA pour confirmer une tendance haussière ?'], ['NVDA', 'Qu’est-ce qui soutient la hausse de NVDA ?'],
        ['SOL', 'Pourquoi SOL est-il suracheté sur le graphique journalier ?'], ['NVDA', 'Quelle différence entre la tendance journalière et hebdomadaire de NVDA ?'], ['MC.PA', 'Qu’est-ce qui pèse sur le cours de MC.PA ?'], ['NVDA', 'Qu’est-ce qui renforce le momentum de NVDA ?'],
      ],
      pt: [
        ['BTC', 'O que confirmaria um rompimento de BTC?'], ['NVDA', 'Por que a tendência de NVDA perdeu força?'], ['NVDA', 'O que mostra o gráfico semanal de NVDA?'], ['NVDA', 'Por que NVDA caiu depois dos resultados?'],
        ['NVDA', 'O que explica a fraqueza de NVDA esta semana?'], ['BTC', 'O que aconteceria com BTC se perdesse o suporte?'], ['NVDA', 'O que invalidaria o cenário altista de NVDA?'], ['ETH', 'O que está por trás da queda do volume em ETH?'],
        ['NVDA', 'O que poderia fazer NVDA cair?'], ['NVDA', 'Como interpretar a queda de NVDA?'], ['BTC', 'De que depende a tendência de BTC?'], ['NVDA', 'O que mudou em NVDA desde o último relatório?'],
        ['NVDA', 'O que trava NVDA perto da resistência?'], ['BTC', 'Por que o volume importa neste movimento de BTC?'], ['NVDA', 'O que falta a NVDA para confirmar uma tendência de alta?'], ['NVDA', 'O que sustenta a alta de NVDA?'],
        ['PETR4.SA', 'O que confirmaria um rompimento de PETR4?'], ['VALE3.SA', 'Por que VALE3 caiu esta semana?'], ['NVDA', 'O que leva NVDA a cair hoje?'], ['NVDA', 'Qual é a diferença entre a tendência diária e a semanal de NVDA?'],
      ],
      it: [
        ['BTC', 'Che cosa confermerebbe una rottura di BTC?'], ['NVDA', 'Perché il trend di NVDA si è indebolito?'], ['NVDA', 'Cosa mostra il grafico settimanale di NVDA?'], ['NVDA', 'Perché NVDA è sceso dopo i risultati?'],
        ['NVDA', 'Cosa spiega la debolezza di NVDA questa settimana?'], ['BTC', 'Cosa succederebbe a BTC se perdesse il supporto?'], ['NVDA', 'Cosa invaliderebbe lo scenario rialzista di NVDA?'], ['ETH', 'Cosa c’è dietro il calo del volume su ETH?'],
        ['NVDA', 'Cosa potrebbe far scendere NVDA?'], ['NVDA', 'Come interpretare il calo di NVDA?'], ['BTC', 'Da cosa dipende il trend di BTC?'], ['NVDA', 'Cosa è cambiato in NVDA dall’ultima trimestrale?'],
        ['NVDA', 'Cosa frena NVDA vicino alla resistenza?'], ['BTC', 'Perché il volume conta in questo movimento di BTC?'], ['NVDA', 'Cosa manca a NVDA per confermare un trend rialzista?'], ['NVDA', 'Cosa sostiene il rialzo di NVDA?'],
        ['SOL', 'Perché SOL è ipercomprato sul grafico giornaliero?'], ['NVDA', 'Che differenza c’è tra il trend giornaliero e quello settimanale di NVDA?'], ['NVDA', 'Cos’è successo a NVDA?'], ['NVDA', 'Perché NVDA continua a salire?'],
      ],
      de: [
        ['BTC', 'Was würde einen Ausbruch bei BTC bestätigen?'], ['NVDA', 'Warum verliert der Trend von NVDA an Kraft?'], ['NVDA', 'Was zeigt der Wochenchart von NVDA?'], ['NVDA', 'Warum ist NVDA nach den Zahlen gefallen?'],
        ['NVDA', 'Was erklärt die Schwäche von NVDA in dieser Woche?'], ['BTC', 'Was passiert, wenn BTC die Unterstützung verliert?'], ['NVDA', 'Was würde das bullische Szenario bei NVDA entkräften?'], ['ETH', 'Was steckt hinter dem Rückgang des Volumens bei ETH?'],
        ['NVDA', 'Was könnte den Kurs von NVDA belasten?'], ['NVDA', 'Wie ist der Rückgang von NVDA zu erklären?'], ['BTC', 'Wovon hängt der Trend bei BTC ab?'], ['NVDA', 'Was hat sich bei NVDA seit dem letzten Bericht geändert?'],
        ['NVDA', 'Was bremst NVDA am Widerstand?'], ['BTC', 'Warum ist das Volumen bei dieser Bewegung von BTC wichtig?'], ['NVDA', 'Was fehlt NVDA für einen bestätigten Aufwärtstrend?'], ['NVDA', 'Was stützt den Anstieg von NVDA?'],
        ['SOL', 'Warum ist SOL im Tageschart überkauft?'], ['NVDA', 'Worin unterscheidet sich der Tagestrend vom Wochentrend bei NVDA?'], ['NVDA', 'Warum fällt NVDA?'], ['NVDA', 'Warum steigt NVDA nicht weiter?'],
      ],
    };
    for (const lang of LANGS) ok(ORDINARY[lang].length >= 20, `${lang}: at least twenty ordinary questions are held`);
    for (const lang of LANGS) for (const [symbol, question] of [...GOOD[lang], ...PLAIN[lang], ...ORDINARY[lang]]) {
      const { value, lines } = silent(() => servedFollowUp(`  ${question} `, lang, symbol));
      eq([nextQuestionViolation(question, lang, symbol), value, lines], [null, question, []], `${lang}: "${question}" is a what-or-why question and is served as written, with nothing logged`);
    }

    // Whether or when to act, in each language: refused, whatever the wording.
    const ACT: Record<(typeof LANGS)[number], string[]> = {
      en: ['Is now a good moment for BTC?', 'Is it too late for BTC?', 'Should I add to BTC here?', 'When should I enter BTC?', 'What is the best entry for BTC?', 'Why not hold BTC through the week?', 'What should I do with BTC now?',
        'How long should BTC be held?', 'Is BTC worth a look here?', 'What price is attractive for BTC?', 'How much BTC makes sense here?', 'Why wait on BTC?', 'What is the exit plan for BTC?', 'What would you do with BTC?',
        // The fear of being late, asked as a what or a why.
        'Why is everyone afraid of missing out on BTC?', 'How far can BTC run from here?', 'What upside is left in BTC?', 'What makes BTC attractive here?', 'Why is BTC still cheap?'],
      es: ['¿Es buen momento para BTC?', '¿Conviene entrar a BTC ahora?', '¿Es demasiado tarde para BTC?', '¿Qué hago con BTC ahora?', '¿Cuándo conviene salir de BTC?', '¿Por qué debería esperar con BTC?', '¿Qué niveles intradía de BTC conviene vigilar?',
        '¿Vale la pena mantener BTC?', '¿Qué me conviene hacer con BTC?', '¿Cómo entrar en BTC sin apuro?'],
      fr: ['Est-ce le bon moment pour BTC ?', 'Faut-il attendre sur BTC ?', 'Est-il trop tard pour BTC ?', 'Que dois-je faire avec BTC ?', 'Pourquoi ne pas renforcer BTC maintenant ?', 'Quand entrer sur BTC ?', 'Que faire avec BTC maintenant ?', 'Comment entrer sur BTC ?'],
      pt: ['É um bom momento para BTC?', 'Vale a pena entrar em BTC agora?', 'É tarde demais para BTC?', 'O que faço com BTC agora?', 'Quando devo sair de BTC?', 'Por que não esperar com BTC?', 'O que fazer com BTC agora?', 'Como entrar em BTC?'],
      it: ['È un buon momento per BTC?', 'Conviene entrare su BTC adesso?', 'È troppo tardi per BTC?', 'Cosa faccio con BTC adesso?', 'Quando dovrei uscire da BTC?', 'Perché non aspettare su BTC?', 'Che fare con BTC adesso?', 'Come entrare su BTC?'],
      de: ['Ist jetzt ein guter Zeitpunkt für BTC?', 'Lohnt sich ein Einstieg bei BTC?', 'Ist es zu spät für BTC?', 'Was soll ich mit BTC tun?', 'Wann sollte ich bei BTC aussteigen?', 'Warum nicht bei BTC abwarten?', 'Was ist jetzt bei BTC zu tun?', 'Wie lange BTC noch halten?'],
    };
    // The same asked behind an allowed opener: a suggestion ("why not", "how about", "what if" with the reader as
    // its unnamed subject), a verb of taking or getting rid of, and timing said in one word or around an adjective.
    // Every sentence here opens with a what-or-why word of its language, so only this rule can refuse it.
    const SUGGESTED: Record<(typeof LANGS)[number], string[]> = {
      en: ['Why not purchase BTC today?', 'Why not long BTC here?', 'Why not dump BTC today?', 'How about owning BTC today?', 'What about BTC today?', 'What if owning BTC works out?',
        'What makes purchasing BTC sensible here?', 'What would acquiring BTC mean this week?', 'Why are people grabbing BTC here?', 'What would it mean to long BTC here?', 'Why would anyone swap into BTC today?',
        'What is the ideal moment for BTC?', 'Which day is best for BTC?', 'How late is it for BTC?', 'What makes this moment special for BTC?', 'What is the best day this week for BTC?', 'How early is it for BTC?', 'What does timing mean for BTC?',
        'What makes today the day for BTC?', 'What is the smart move on BTC today?', 'What if someone scooped up BTC today?'],
      es: ['¿Por qué no tomar BTC ya?', '¿Qué tal adquirir BTC hoy?', '¿Qué tal BTC hoy?', '¿Y si tomamos BTC hoy?', '¿Por qué no mejor soltar BTC hoy?', '¿Qué implica adquirir BTC hoy?',
        '¿Cuál es el momento ideal para BTC?', '¿Qué tan tarde es para BTC?', '¿Qué día es mejor para BTC?', '¿Cuál es el mejor día para BTC?', '¿Qué tan pronto es para BTC?'],
      fr: ['Pourquoi ne pas prendre BTC maintenant ?', 'Pourquoi pas BTC maintenant ?', 'Et si on prenait BTC maintenant ?', 'Que diriez-vous de BTC maintenant ?', 'Pourquoi acquérir BTC maintenant ?',
        'Quel est le moment idéal pour BTC ?', 'Quel jour est le meilleur pour BTC ?', 'Pourquoi serait-il si tard pour BTC ?', 'Quel est le meilleur jour pour BTC ?'],
      pt: ['Por que não adquirir BTC hoje?', 'Que tal pegar BTC hoje?', 'E se pegarmos BTC hoje?', 'Por que não largar BTC hoje?', 'O que significa adquirir BTC hoje?',
        'Qual é o momento ideal para BTC?', 'Qual é o melhor dia para BTC?', 'Que dia é melhor para BTC?', 'Por que seria tão cedo para BTC?'],
      it: ['Perché non prendere BTC adesso?', 'E se prendessimo BTC adesso?', 'Che ne dici di BTC adesso?', 'Perché non mollare BTC adesso?', 'Cosa significa prendere BTC adesso?',
        'Qual è il momento ideale per BTC?', 'Qual è il giorno migliore per BTC?', 'Che giorno è il migliore per BTC?', 'Perché sarebbe così tardi per BTC?'],
      de: ['Warum nicht jetzt BTC erwerben?', 'Wie wäre es mit BTC?', 'Was wäre, wenn man BTC jetzt nimmt?', 'Warum nicht BTC loswerden?', 'Was bedeutet es, BTC jetzt zu nehmen?',
        'Welcher Moment ist ideal für BTC?', 'Welcher Tag ist der beste für BTC?', 'Was ist der beste Tag für BTC?', 'Warum wäre es so spät für BTC?'],
    };
    // The adversarial review of 2026-10-07: every one of these opened with an allowed word, used no listed word and
    // was served as Bobby's own chip. Kept as they were reported (the asset aside).
    const REVIEWED: Record<(typeof LANGS)[number], string[]> = {
      en: ['Why not own BTC today?', 'Why not purchase BTC today?', 'What is the best day to own BTC?', 'How about getting some BTC today?', 'What is the smartest move on BTC today?', 'Why keep BTC through earnings?',
        'Why snag BTC here?', 'Why pocket BTC now?', 'Why back BTC now?', 'What would dropping BTC change?', 'What would it mean to trade BTC here?', 'What is the case for more BTC?', 'What does it take to be in BTC?',
        'What makes BTC the stock for this week?', 'How to play BTC here?', 'What should happen to BTC?', 'What would holding BTC through earnings mean?', 'What if someone scooped up BTC today?',
        'What would it take to back BTC here?', 'What does staying in BTC mean?', 'What is the case for more shares of BTC?', 'What would it mean to be in BTC this week?',
        'Why would traders drop BTC here?', 'What makes funds follow BTC this week?', 'Why did the bulls close BTC today?'],
      es: ['¿Por qué no tomar BTC ahora?', '¿Qué día es el indicado para tomar BTC?', '¿Y si aprovechamos la caída de BTC?', '¿Y si alguien toma BTC hoy?', '¿Cómo aprovechar la caída de BTC?', '¿Por qué quedarse con BTC?',
        '¿Qué debe hacer quien tiene BTC?', '¿Por qué cambiar BTC ahora?', '¿Qué significaría cerrar BTC hoy?', '¿Qué caso hay para más BTC?', '¿Qué razones hay para cerrar BTC?', '¿Qué significa seguir en BTC?', '¿Qué lleva a cerrar BTC?'],
      fr: ['Pourquoi ne pas prendre BTC maintenant ?', 'Quel est le bon jour pour se placer sur BTC ?', 'Que devrait-on faire de BTC maintenant ?', 'Que faudrait-il faire de BTC aujourd’hui ?', 'Comment profiter de la baisse de BTC ?',
        'Pourquoi garder BTC ?', 'Que doit faire celui qui détient BTC ?', 'Pourquoi changer BTC maintenant ?', 'Que voudrait dire changer BTC maintenant ?', 'Pourquoi suivre BTC cette semaine ?', 'Que signifie rester sur BTC ?'],
      pt: ['Por que não pegar BTC agora?', 'Qual é o dia certo para pegar BTC?', 'O que deve fazer quem tem BTC?', 'Como aproveitar a queda de BTC?', 'Por que ficar com BTC?', 'Por que mudar BTC agora?', 'O que significaria fechar BTC hoje?', 'O que esperar de BTC?', 'O que significa ficar em BTC?'],
      it: ['Perché non prendere BTC adesso?', 'Qual è il giorno giusto per BTC?', 'Cosa dovrebbe fare chi possiede BTC?', 'Come sfruttare il calo di BTC?', 'Perché cambiare BTC adesso?', 'Cosa significherebbe chiudere BTC oggi?', 'Cosa aspettarsi da BTC?', 'Cosa significa restare su BTC?'],
      de: ['Warum nicht jetzt bei BTC zugreifen?', 'Was ist der beste Moment für BTC?', 'Was sollte man mit BTC jetzt machen?', 'Wie die Schwäche von BTC nutzen?', 'Was sollte ein Anleger mit BTC jetzt machen?', 'Warum BTC jetzt behalten?', 'Was spricht für mehr BTC?', 'Was tun, wenn BTC fällt?', 'Was bedeutet es, bei BTC zu bleiben?'],
    };
    // A verb, a noun or a tense nobody listed as refused: only the word list stands between these and the chip.
    const UNLISTED: Record<(typeof LANGS)[number], string[]> = {
      en: ['What makes BTC a lock this week?', 'What is the play on BTC?', 'What makes BTC so tempting this week?', 'Why is now the time for BTC?', 'Why is the BTC rally only starting?'],
      es: ['¿Qué hace tan apetecible a BTC?', '¿Por qué BTC subirá esta semana?', '¿Qué jugada ven los traders en BTC?', '¿Por qué solo sube BTC?'],
      fr: ['Qu’est-ce qui rend BTC si tentant ?', 'Pourquoi BTC montera cette semaine ?', 'Quelle aubaine représente BTC ?'],
      pt: ['O que torna BTC tão tentador?', 'Por que BTC subirá esta semana?', 'Que jogada os traders veem em BTC?'],
      it: ['Cosa rende BTC così allettante?', 'Perché BTC salirà questa settimana?', 'Che colpo rappresenta BTC?', 'Perché tenersi BTC?', 'Cosa farà BTC domani?'],
      de: ['Was macht BTC so verlockend?', 'Warum steigt BTC morgen weiter?', 'Warum BTC jetzt einsammeln?', 'Warum BTC jetzt fallen lassen?'],
    };
    for (const lang of LANGS) for (const question of UNLISTED[lang]) {
      const { value, lines } = silent(() => servedFollowUp(question, lang, 'BTC'));
      eq([nextQuestionViolation(question, lang, 'BTC'), publicTextViolation(question), value, lines.map((l) => JSON.parse(l).reason)], ['unlisted', null, FALLBACK[lang], ['unlisted']], `${lang}: "${question}" holds a word no question about a chart needs: replaced, and logged as unlisted`);
    }
    for (const lang of LANGS) for (const question of [...SUGGESTED[lang], ...REVIEWED[lang]]) {
      eq([nextQuestionViolation(question, lang, 'BTC'), publicTextViolation(question)], ['act', null], `${lang}: "${question}" suggests acting or asks when, behind an allowed opener`);
      eq(silent(() => servedFollowUp(question, lang, 'BTC')).value, FALLBACK[lang], `${lang}: …and the fixed question is served in its place`);
    }
    for (const lang of LANGS) for (const question of ACT[lang]) {
      eq(nextQuestionViolation(question, lang, 'BTC'), 'act', `${lang}: "${question}" asks whether or when to act`);
      eq(silent(() => servedFollowUp(question, lang, 'BTC')).value, FALLBACK[lang], `${lang}: …and the fixed question is served in its place`);
    }
    // The other rules, each by its class.
    for (const [question, lang, want, what] of [
      ['Could BTC retest its range low?', 'en', 'opener', 'a yes/no question'],
      ['¿Puede BTC romper su resistencia?', 'es', 'opener', 'a yes/no question in Spanish'],
      ['Est-ce que BTC reste dans son range ?', 'fr', 'opener', 'a yes/no question in French'],
      ['What if BTC loses the range low?', 'es', 'opener', 'an English question in a Spanish reply'],
      ['BTC: what would change this read?', 'en', 'shape', 'a label before the question'],
      ['BTC looks ready to break out here.', 'en', 'shape', 'a statement'],
      ['What a week for BTC', 'en', 'shape', 'no question mark'],
      ['BTC is weak. What would change that?', 'en', 'shape', 'a statement before the question'],
      ['What would change this? And why?', 'en', 'shape', 'two questions'],
      ['Why BTC?', 'en', 'shape', 'too little to be a question'],
      [`What would ${'really '.repeat(30)}change BTC?`, 'en', 'shape', 'longer than the wire allows'],
      ['Why?', 'en', 'shape', 'shorter than the wire allows'],
      ['What happens if BTC closes above 104?', 'en', 'number', 'a price'],
      ['What would take BTC to $120k?', 'en', 'number', 'a price with a currency'],
      ['What if BTC loses its EMA20?', 'en', 'number', 'a level by its number'],
      ['What if BTC drops ten percent?', 'en', 'number', 'a percentage in words'],
      ['¿Qué pasaría con BTC si pierde el soporte de 82,556?', 'es', 'number', "a model's own what-if at a price"],
      ['Was passiert, wenn BTC unter hunderttausend fällt?', 'de', 'number', 'a German compound number'],
      ['Was passiert, wenn BTC zweihundert bricht?', 'de', 'number', 'a German hundred'],
      ['Was passiert, wenn BTC unter fünfundneunzig fällt?', 'de', 'number', 'a German tens compound'],
      ['What happens if BTC breaks one fifty?', 'en', 'number', 'a price in English words'],
      ['What happens if BTC loses ninety k?', 'en', 'number', 'a price in thousands, said aloud'],
      ['¿Qué pasa si BTC rompe los doscientos?', 'es', 'number', 'a Spanish hundred'],
      ['¿Qué pasa si BTC pierde los veinticinco?', 'es', 'number', 'a Spanish compound'],
      ['Que se passe-t-il si BTC casse quatre-vingt ?', 'fr', 'number', 'a French number'],
      ['O que acontece se BTC romper duzentos?', 'pt', 'number', 'a Portuguese hundred'],
      ['Cosa succede se BTC rompe duecento?', 'it', 'number', 'an Italian hundred'],
      ['Cosa succede se BTC rompe centocinquanta?', 'it', 'number', 'an Italian compound'],
      ['Cosa succede se BTC rompe ventuno?', 'it', 'number', 'an Italian compound with the tens elided'],
      ['Cosa succede se BTC rompe trentotto?', 'it', 'number', 'an Italian compound read piece by piece'],
      ['Was passiert, wenn BTC einundzwanzig bricht?', 'de', 'number', 'a German compound read piece by piece'],
      ['Why do the two BTC charts disagree?', 'en', 'number', 'any number, as the CIO is told'],
      ['Was würde ein Ausbruch bei BTC bestätigen?', 'de', null, 'the German article "ein" is not a number'],
      ['Pourquoi BTC est très volatil ?', 'fr', null, '"très" is not the Spanish three'],
      ['O que mudou nos gráficos dos últimos dias de BTC?', 'pt', null, '"dos" is not the Spanish two'],
      ['What signals would confirm a BTC breakout?', 'en', 'word', 'the word signal'],
      ['¿Qué señales confirmarían una ruptura de BTC?', 'es', 'word', "a model's own question with señales"],
      ['What returns has BTC shown this month?', 'en', 'word', 'the word returns'],
      ['What guarantees a BTC breakout?', 'en', 'word', 'the word guarantee'],
      ['Why is BTC advice so mixed?', 'en', 'word', 'the word advice'],
      ['Quel signal confirmerait la cassure de BTC ?', 'fr', 'word', 'signal in French'],
      ['Welches Kaufsignal fehlt bei BTC?', 'de', 'word', 'a compound with Kauf'],
      // Certainty, the family of "guaranteed".
      ['Why is BTC a sure winner?', 'en', 'word', 'a sure thing'],
      ['Why can BTC only go higher?', 'en', 'word', 'only one way'],
      ['¿Por qué BTC solo puede subir?', 'es', 'word', 'only one way, in Spanish'],
      ['¿Por qué es BTC un activo ganador?', 'es', 'word', 'a winner, in Spanish'],
      ['Pourquoi BTC est-il une valeur gagnante ?', 'fr', 'word', 'a winner, in French'],
      ['Por que BTC é uma escolha vencedora?', 'pt', 'word', 'a winner, in Portuguese'],
      ['Perché BTC è una scelta sicura?', 'it', 'word', 'a sure choice, in Italian'],
      ['Warum ist BTC eine sichere Sache?', 'de', 'word', 'a sure thing, in German'],
      // A forbidden word is not let through by the way it is written.
      ['What makes traders b-u-y BTC?', 'en', 'word', 'a forbidden word spelled out with hyphens'],
      ['What makes traders b u y BTC?', 'en', 'word', 'a forbidden word spelled out with spaces'],
      ['What moves B-T-C-X today?', 'en', 'shape', 'letters set apart by hyphens are not a word'],
      ['What makes traders bυy BTC?', 'en', 'shape', 'a Greek letter inside a Latin word'],
      ['What makes traders ｂｕｙ BTC?', 'en', 'word', 'full-width letters are read as the letters they are'],
      ['Why стоит купить BTC сейчас?', 'en', 'shape', 'another script after an English opener'],
      ['Qu’y a-t-il derrière la hausse de BTC ?', 'fr', null, 'the French "y a-t-il" is not a spelled-out word'],
      ['What is new for BTC, see bobby dot xyz?', 'en', 'word', 'a link spelled out'],
      ['¿Qué hay de nuevo en BTC, mira bobby punto com?', 'es', 'word', 'a link spelled out in Spanish'],
      // The reply's language: a question that opens right and is written in another language.
      ['Was would confirm the BTC trend here?', 'de', 'language', 'English behind a German opener'],
      ['¿Qué dice el gráfico semanal de BTC sobre su tendencia?', 'fr', 'language', 'Spanish in a French reply'],
      ['¿Qué confirmaría una ruptura de BTC?', 'pt', 'language', 'Spanish in a Portuguese reply'],
      ['Que confirmaria uma ruptura de BTC?', 'es', 'language', 'Portuguese in a Spanish reply'],
      ['Como está BTC hoje?', 'es', 'language', 'Portuguese in a Spanish reply, opening with a shared word'],
      ['O que mostra o gráfico semanal de BTC?', 'es', 'opener', 'Portuguese in a Spanish reply, by its opener'],
      ['Cosa mostra il grafico settimanale di BTC?', 'es', 'opener', 'Italian in a Spanish reply'],
      ['¿Qué tal purchase BTC today?', 'es', 'act', 'a Spanish suggestion with English words'],
      ['Qué confirmaría una ruptura de BTC?', 'es', null, 'a Spanish question without its opening mark is still Spanish'],
      ['¿Qué confirmaría una ruptura de BTC?', 'fr', 'language', 'the same Spanish question in a French reply'],
      ['Como está a tendência de BTC no gráfico diário?', 'es', 'language', 'Portuguese whose every word Spanish shares, told by its accents'],
      ['Como esta a tendencia de BTC no grafico diario?', 'es', null, 'the same typed without accents is Spanish word for word (the documented limit)'],
      ['Was BTC’s rally too fast?', 'de', 'unlisted', 'English behind the German "Was", word by word'],
      ['Why is BTC’s tendência weak?', 'en', 'language', 'an accented letter English does not write'],
      // One clause, one question: what rides behind a comma is not a question.
      ['Why is BTC up, see the chart?', 'en', 'shape', 'a second clause behind a comma'],
      ['What a run for BTC this week?', 'en', 'shape', 'an exclamation with a question mark'],
      ['What a run, grab BTC before Friday?', 'en', 'act', 'an instruction behind a comma'],
      ['Why hesitate, BTC only goes up?', 'en', 'act', 'a bare verb put to the reader'],
      ['Was ist los, BTC jetzt holen?', 'de', 'shape', 'a German comma that opens no subordinate clause'],
      ['Was passiert, wenn BTC die Unterstützung verliert?', 'de', null, 'the comma German grammar requires'],
      // A forecast presupposed, a price said aloud, a venue the copy never names.
      ['Why will BTC double by Friday?', 'en', 'act', 'a forecast behind "why will"'],
      ['What will BTC do next week?', 'en', 'word', 'what the asset will do'],
      ['Why is BTC going to double?', 'en', 'word', '"going to"'],
      ['Why is BTC likely to rise next week?', 'en', 'word', '"likely to"'],
      ['¿Qué va a pasar con BTC mañana?', 'es', 'word', 'the Spanish "va a"'],
      ['Pourquoi BTC va monter cette semaine ?', 'fr', 'word', 'the French "va" before an infinitive'],
      ['O que vai acontecer com BTC amanhã?', 'pt', 'word', 'the Portuguese "vai"'],
      ['Was wird BTC morgen machen?', 'de', 'act', 'the German "wird … machen"'],
      ['What changes if BTC closes under ninety?', 'en', 'number', 'a price in tens, in words'],
      ['What if BTC drops under eighty k?', 'en', 'number', 'a price in thousands, in words'],
      ['What does bobbyvip dot com say about BTC?', 'en', 'word', 'a link said aloud'],
      ['What does OKX funding say about BTC?', 'en', 'word', 'a venue the copy never names'],
      ['What does X Layer say about BTC?', 'en', 'word', '…nor its chain'],
      ['What does OKB say about BTC?', 'en', 'word', '…nor its token'],
      ['¿Qué dice OKX sobre BTC?', 'es', 'word', '…in any language'],
      ['Why не купить BTC сегодня?', 'en', 'shape', 'Russian for "why not buy it today" behind an English opener'],
      // The verbs that move a price take the asset as their object; a person's do not.
      ['What is holding BTC back?', 'en', null, 'the asset is held back: nobody holds it'],
      ['What is keeping BTC above support?', 'en', null, 'the asset is kept up'],
      ['What does it take to move BTC?', 'en', null, 'to move a price is not to act'],
      ['Why did the market react to the BTC report?', 'en', null, '"to the" is not a verb'],
      ['Why did BTC drop after the report?', 'en', null, 'the asset drops: nobody drops it'],
      ['Why did BTC not follow the market higher?', 'en', null, 'the asset follows the market'],
      ['¿Qué podría frenar a BTC?', 'es', null, 'a helper governs the infinitive: the market acts on the asset'],
      ['¿Por qué podría caer BTC esta semana?', 'es', null, 'the asset is the subject behind its verb'],
      ['Qu’est-ce qui pourrait faire baisser BTC ?', 'fr', null, 'the French causative'],
      ['Cosa potrebbe far salire BTC?', 'it', null, 'the Italian causative'],
      ['O que pode fazer BTC cair?', 'pt', null, 'the Portuguese causative'],
      ['Comment expliquer la baisse de BTC ?', 'fr', null, 'to explain is not to act'],
      ['¿Cómo interpretar la caída de BTC?', 'es', null, 'nor to interpret'],
      ['¿Por qué ayer cayó BTC?', 'es', null, '"ayer" only looks like an infinitive'],
      ['Que montre le graphique hebdomadaire de BTC ?', 'fr', null, '"montre" only looks like one'],
    ] as const) eq(nextQuestionViolation(question, lang, 'BTC'), want, `${what}: ${want ?? 'passes'}`);
    eq([nextQuestionViolation(42, 'en', 'BTC'), nextQuestionViolation(null, 'en', 'BTC'), nextQuestionViolation(undefined, 'en', 'BTC'), nextQuestionViolation({ text: 'What?' }, 'en', 'BTC')], ['shape', 'shape', 'shape', 'shape'], 'anything but a string is refused');
    // The longest text the wire allows, built to make a pattern try every split of it, is still read at once.
    for (const [lang, unit] of [['de', 'einsein'], ['de', 'sechsech'], ['de', 'siebsieben'], ['it', 'ununo'], ['it', 'trentatre'], ['it', 'undiciotto'], ['it', 'unodue'], ['es', 'veintidieci'], ['en', 'a-b-'], ['en', 'a b '], ['es', 'y si por que no '], ['it', 'e se perche non ']] as const) {
      const longest = `Was ${unit.repeat(Math.floor((FOLLOW_UP_MAX - 6) / unit.length))}x?`;
      const started = performance.now();
      nextQuestionViolation(longest, lang, 'BTC');
      ok(longest.length <= FOLLOW_UP_MAX && performance.now() - started < 50, `${lang}: ${longest.length} characters of "${unit}" are judged without backtracking through them`);
    }
    // The ticker is set aside before any word is read: an asset called NOW, ADD or 7203.T is not a word or a number.
    eq([nextQuestionViolation('What would confirm a NOW breakout?', 'en', 'NOW'), nextQuestionViolation('What would confirm an ADD breakout?', 'en', 'ADD'), nextQuestionViolation('What would confirm a 7203.T breakout?', 'en', '7203.T'), nextQuestionViolation('What would confirm an ADD breakout?', 'en', 'BTC')],
      [null, null, null, 'act'], 'the asked asset\'s own ticker is never read as a word or a number; the same letters as a word are');

    // A listed ticker is named by the part before its dot (the pt-BR starter chips are PETR4.SA and VALE3.SA), and
    // an asset by its name: both are the asset, not a number or an unknown word.
    eq([nextQuestionViolation('O que confirmaria um rompimento de PETR4?', 'pt', 'PETR4.SA'), nextQuestionViolation('Por que VALE3 caiu esta semana?', 'pt', 'VALE3.SA'), nextQuestionViolation('What would confirm a MC breakout?', 'en', 'MC.PA'),
      nextQuestionViolation('O que confirmaria um rompimento de PETR5?', 'pt', 'PETR4.SA'), nextQuestionViolation('O que confirmaria um rompimento de PETR4?', 'pt', 'VALE3.SA')],
      [null, null, null, 'number', 'number'], 'the root of the asked ticker is set aside; another ticker\'s digits are still a number');
    eq([nextQuestionViolation('What would confirm a Nvidia breakout?', 'en', 'NVDA', ['Nvidia']), nextQuestionViolation('What would confirm a Nvidia breakout?', 'en', 'NVDA'), nextQuestionViolation('What does Louis Vuitton’s chart show?', 'en', 'MC.PA', ['LVMH', 'Louis Vuitton']),
      nextQuestionViolation('What is the Target for TGT this week?', 'en', 'TGT', ['Target']), nextQuestionViolation('Why is Best Buy the stock for BBY?', 'en', 'BBY', ['Best Buy'])],
      [null, 'unlisted', null, 'act', 'word'], 'the asked asset\'s own name is set aside as its ticker is; a name that is a refused word is read as the word');
    eq([silent(() => servedFollowUp('What is behind the drop in Bitcoin volume?', 'en', 'BTC')), silent(() => servedFollowUp('¿Qué confirmaría una ruptura de Ethereum?', 'es', 'ETH')), silent(() => servedFollowUp('Qu’est-ce qui pèse sur le cours de LVMH ?', 'fr', 'MC.PA'))],
      [{ value: 'What is behind the drop in Bitcoin volume?', lines: [] }, { value: '¿Qué confirmaría una ruptura de Ethereum?', lines: [] }, { value: 'Qu’est-ce qui pèse sur le cours de LVMH ?', lines: [] }], 'the desk hands the check the names it knows the asset by');
    eq(silent(() => servedFollowUp('What is behind the drop in Solana volume?', 'en', 'BTC')).value, FALLBACK.en, '…and only the asked asset\'s: another asset\'s name is an unknown word (Bitcoin and Ethereum are market words, listed for every asset)');

    // The 59 next questions the models wrote in the paired eval of 2026-09-29, under the old prompt: how many the
    // check serves as written, and why it refuses the rest. Pinned, so a change to a list shows up as a number.
    {
      const data = fileURLToPath(new URL('../docs/ai/data/', import.meta.url));
      const recorded = new Map<string, { lang: (typeof LANGS)[number]; symbol: string }>();
      const walk = (value: unknown, ctx: { lang?: string; symbol?: string }): void => {
        if (Array.isArray(value)) { for (const item of value) walk(item, ctx); return; }
        if (!value || typeof value !== 'object') return;
        const row = value as Record<string, unknown>;
        const own = { lang: typeof row.lang === 'string' ? row.lang : ctx.lang, symbol: typeof row.symbol === 'string' ? row.symbol : ctx.symbol };
        if (typeof row.followUp === 'string' && own.lang && own.symbol && !recorded.has(row.followUp)) recorded.set(row.followUp, { lang: own.lang as (typeof LANGS)[number], symbol: own.symbol });
        for (const inner of Object.values(row)) walk(inner, own);
      };
      for (const file of readdirSync(data).filter((name) => name.endsWith('.json')).sort()) walk(JSON.parse(readFileSync(data + file, 'utf8')), {});
      const tally: Record<string, number> = {};
      for (const [followUp, { lang, symbol }] of recorded) { const why = publicTextViolation(followUp) ?? nextQuestionViolation(followUp, lang, symbol) ?? 'served'; tally[why] = (tally[why] ?? 0) + 1; }
      eq([recorded.size, tally], [59, { word: 4, number: 17, served: 34, act: 4 }], 'of the 59 recorded next questions 34 are served as written; 17 carry a price, 4 the word signal, 4 ask to act; none is lost to the word list');
    }

    // Through the debate: each kind of bad next question, and the read is the read it would have been.
    debateMock();
    const clean = await runDeskDebate('Is BTC worth a look this week?', evidence, 'en');
    const cioCall = calls.find((c) => byRole(c) === 'cio')!;
    ok(cioCall.body.messages[0].content.includes(NEXT_QUESTION_RULE) && /followUp asks what happened, why, or what would change this read/.test(NEXT_QUESTION_RULE) && /never whether or when to act/.test(NEXT_QUESTION_RULE), 'the CIO is told the rule beside the description of followUp');
    ok(calls.filter((c) => byRole(c) !== 'cio').every((c) => !c.body.messages[0].content.includes(NEXT_QUESTION_RULE)), '…and only the CIO');
    const bad = (followUp: unknown) => mock((c) => openai(byRole(c) === 'cio' ? { ...CIO, synthesis: { ...SYN, followUp } } : { analysis: byRole(c) === 'alpha' ? ALPHA : RED }));
    for (const [followUp, lang, reason, what] of [
      ['You should buy BTC now, right?', 'en', 'advice', 'an instruction to buy (the output guard)'],
      ['Why is BTC a guaranteed profit this week?', 'en', 'guarantee', 'a guarantee (the output guard)'],
      ['BTC looks ready to break out here.', 'en', 'shape', 'a statement instead of a question'],
      ['What happens if BTC closes above 104?', 'en', 'number', 'a price'],
      [`What would ${'really '.repeat(30)}change BTC?`, 'en', 'shape', 'a question longer than the contract'],
      ['Why?', 'en', 'shape', 'a question shorter than the contract'],
      [42, 'en', 'shape', 'a number where the question belongs'],
      [null, 'en', 'shape', 'null where the question belongs'],
      ...LANGS.map((l) => [ACT[l][0], l, 'act', `when to act, in ${l}`] as const),
      ...LANGS.map((l) => [ACT[l][1], l, 'act', `whether to act, in ${l}`] as const),
    ] as const) {
      bad(followUp);
      const { value: read, lines } = await quiet(() => runDeskDebate('Is BTC worth a look this week?', evidence, lang, { level: 'rapido' }));
      const { followUp: served, ...rest } = read.agents.synthesis;
      const { followUp: _clean, ...cleanRest } = clean.agents.synthesis;
      eq([served, rest, read.agents.verdict, read.agents.direction, read.agents.cio], [FALLBACK[lang], cleanRest, clean.agents.verdict, clean.agents.direction, clean.agents.cio], `${what}: the read is served with the same verdict and synthesis, and the fixed question in ${lang}`);
      eq(lines.map((l) => JSON.parse(l)), [{ route: 'desk-debate', event: 'follow_up_replaced', reason, language: lang, level: 'rapido' }], `${what}: one log line, by class`);
      ok(typeof followUp !== 'string' || !lines.join('').includes(followUp), `${what}: the log never carries the question`);
    }
    // No followUp at all in the model's answer: still a read, still a string on the wire.
    mock((c) => { const { followUp: _none, ...withoutFollowUp } = SYN; return openai(byRole(c) === 'cio' ? { ...CIO, synthesis: withoutFollowUp } : { analysis: byRole(c) === 'alpha' ? ALPHA : RED }); });
    eq((await quiet(() => runDeskDebate('Is BTC worth a look this week?', evidence, 'pt'))).value.agents.synthesis.followUp, FALLBACK.pt, 'a synthesis without a next question is served with the fixed one');
    // The rest of the synthesis is still held to the guard: only the next question is forgiven.
    mock((c) => openai(byRole(c) === 'cio' ? { ...CIO, synthesis: { ...SYN, followUp: 'Should I buy BTC now?', watch: 'This breakout offers guaranteed profits for patient holders.' } } : { analysis: byRole(c) === 'alpha' ? ALPHA : RED }));
    await assert.rejects(quiet(() => runDeskDebate('Is this real?', evidence, 'en')), (e: unknown) => e instanceof DeskOutputRejected, 'a guarantee in another synthesis line still fails the debate'); checks++;
    // Every level, and the scenarios beside it: Máximo's CIO is the same contract.
    mock((c) => { const r = byRole(c); const content = r === 'alpha' ? { analysis: ALPHA } : r === 'red' ? { analysis: RED } : r === 'rebuttal' ? { analysis: REBUTTAL } : { ...CIO, synthesis: { ...SYN, followUp: 'Ist jetzt ein guter Zeitpunkt für BTC?' }, scenarios: SCEN }; return hostOf(c.url) === 'api.anthropic.com' ? claude(content) : openai(content); });
    const maxRead = (await quiet(() => runDeskDebate('Wie sieht BTC diese Woche aus?', v2, 'de', { level: 'maximo' })));
    eq([maxRead.value.agents.synthesis.followUp, maxRead.value.agents.scenarios, JSON.parse(maxRead.lines[0]).level], [FALLBACK.de, SCEN, 'maximo'], 'Máximo: the same replacement, the scenarios untouched, the level in the log');
    // watchLevel is a separate field and stays what it was: the next question never reads it or changes it.
    bad('What happens if BTC closes above 104?');
    eq((await quiet(() => runDeskDebate('Is this real?', evidence, 'en'))).value.agents.synthesis.watchLevel, SYN.watchLevel, 'the level to watch is untouched by a replaced next question');

    // ---------- the next question is never the question the reader just asked ----------
    // Two texts are one question whatever their case, accents, spacing and punctuation, and whether or not the
    // symbol leads them (the web sends "NVDA · …" for a next question that does not name its ticker).
    eq([repeatsQuestion('What would confirm the BTC trend?', 'what would confirm the btc trend', 'BTC'), repeatsQuestion('¿Qué confirmaría una ruptura de SOL?', '  que confirmaria una ruptura de sol ', 'SOL'),
      repeatsQuestion('What is missing for the trend?', 'NVDA · What is missing for the trend?', 'NVDA'), repeatsQuestion('What is missing for the trend?', 'MC.PA · What is missing for the trend?', 'MC.PA'),
      repeatsQuestion('Qu’est-ce qui devrait changer sur BTC pour que cette analyse change ?', "Qu'est-ce qui devrait changer sur BTC pour que cette analyse change?", 'BTC')],
      [true, true, true, true, true], 'the same question, however it was typed or sent');
    eq([repeatsQuestion('What would confirm the BTC trend?', 'What would weaken the BTC trend?', 'BTC'), repeatsQuestion('What would confirm the BTC trend?', '', 'BTC'), repeatsQuestion('', '', 'BTC'),
      repeatsQuestion('What is missing for the trend?', 'ETH · What is missing for the trend?', 'NVDA'), repeatsQuestion('What would confirm the BTC trend?', 'What would confirm the BTC trend this week?', 'BTC')],
      [false, false, false, false, false], 'another question, no question, another asset in front, or more words: not a repeat');
    for (const lang of LANGS) {
      // The reader tapped the fixed question and the CIO's next one is refused again: the other fixed question, not the one just answered.
      for (const asked of [FALLBACK[lang], `BTC · ${FALLBACK[lang]}`, FALLBACK[lang].toLowerCase()]) {
        eq(silent(() => servedFollowUp(ACT[lang][0], lang, 'BTC', 'rapido', asked)).value, SECOND[lang], `${lang}: "${asked}" was just asked and the next question is refused: the second fixed question`);
      }
      eq(silent(() => servedFollowUp(ACT[lang][0], lang, 'BTC', 'rapido', SECOND[lang])).value, FALLBACK[lang], `${lang}: after the second fixed question the first is served again, never the one just asked`);
      // The CIO's own question passes every rule and is the question just asked: replaced, and the log says why.
      const own = GOOD[lang][0];
      const echo = silent(() => servedFollowUp(own[1], lang, own[0], 'profundo', own[1].toUpperCase()));
      eq([echo.value, echo.lines.map((l) => JSON.parse(l))], [nextQuestionFallback(lang, own[0]), [{ route: 'desk-debate', event: 'follow_up_replaced', reason: 'repeat', language: lang, level: 'profundo' }]], `${lang}: the CIO's own question, when it is the one just asked, is replaced and logged as a repeat`);
      ok(!echo.lines.join('').includes(own[1]), `${lang}: …and the log carries no question`);
      eq(silent(() => servedFollowUp(own[1], lang, own[0], 'rapido', 'Is this real?')), { value: own[1], lines: [] }, `${lang}: after any other question it is served as written`);
    }
    eq(silent(() => servedFollowUp('What is missing for the trend?', 'en', 'NVDA', 'rapido', 'NVDA · What is missing for the trend?')).value, 'What would have to change in NVDA for this read to change?', 'a next question the web sent behind its symbol is recognised when it comes back');
    // Through the debate, as the handler runs it: the reader taps the chip, the CIO's next question is refused again.
    bad('Should I add to BTC here?');
    const tapped = await quiet(() => runDeskDebate(FALLBACK.en, evidence, 'en'));
    eq([tapped.value.agents.synthesis.followUp, tapped.lines.map((l) => JSON.parse(l).reason)], [SECOND.en, ['act']], 'the fixed question was asked and the next one is refused: the reply carries the second fixed question');
    bad('Should I add to BTC here?');
    eq((await quiet(() => runDeskDebate(tapped.value.agents.synthesis.followUp, evidence, 'en'))).value.agents.synthesis.followUp, FALLBACK.en, '…and a tap on that one is answered with the first again: never the question just answered');
    debateMock();
    const echoed = await quiet(() => runDeskDebate(SYN.followUp, evidence, 'en'));
    eq([echoed.value.agents.synthesis.followUp, echoed.lines.map((l) => JSON.parse(l).reason)], [FALLBACK.en, ['repeat']], 'a CIO that hands the reader\'s own question back is given the fixed one');
    debateMock();
    eq((await quiet(() => runDeskDebate(`BTC · ${SYN.followUp}`, evidence, 'en'))).value.agents.synthesis.followUp, FALLBACK.en, '…also when the question arrived behind its symbol');
  }

  const gone = new AbortController(); gone.abort();
  debateMock();
  await assert.rejects(runDeskDebate('Is this real?', evidence, 'en', { signal: gone.signal })); checks++;
  eq(calls.filter((c) => hostOf(c.url) === 'api.openai.com').length, 0, 'a reader who left costs no model call');
  ok(!('timeframes' in quick) && !('record' in quick), 'the raw v2 evidence is not echoed back');

  debateMock();
  const usage: any[] = [];
  const deep = await runDeskDebate('Is BTC good for the next few days?', v2, 'en', { level: 'profundo', usage });
  eq(calls.map((c) => [byRole(c), c.url.includes('anthropic') ? `${c.body.model}:${c.body.output_config.effort}` : c.body.model]), [['alpha', 'gpt-6-luna'], ['red', 'gpt-6-luna'], ['cio', 'claude-haiku-5-5:medium']], 'Profundo: luna debaters, Haiku medium CIO');
  eq([deep.sufficiency.sufficient, deep.evidenceUsed.timeframes, deep.evidenceUsed.derivatives, deep.evidenceUsed.record?.wins], [true, ['1H', '4H', '1D'], true, 6], 'Profundo: v2 evidence covers the weekly horizon');
  ok(/evidence\.timeframes holds/.test(calls[0].body.messages[0].content) && JSON.parse(calls[0].body.messages[1].content).evidence.record.wins === 6, 'Profundo: the roles see the timeframes and Bobby\'s record');
  eq(usage.map((u) => u.role), ['alpha', 'red', 'cio'], 'Profundo: one ledger row per call');

  debateMock();
  const max = await runDeskDebate('Is BTC good for the next few days?', v2, 'en', { level: 'maximo' });
  eq(calls.map((c) => [byRole(c), `${c.body.model}:${c.body.output_config?.effort}`]), [['alpha', 'claude-haiku-5-5:high'], ['red', 'claude-haiku-5-5:high'], ['rebuttal', 'claude-haiku-5-5:high'], ['cio', 'claude-haiku-5-5:high']], 'Máximo: Haiku high ×4 with the second round');
  eq([max.agents.rebuttal, max.agents.scenarios], [REBUTTAL, SCEN], 'Máximo: second round and scenarios returned');
  ok(JSON.parse(calls[3].body.messages[0].content).rebuttal.analysis === REBUTTAL, 'the CIO weighs the second round');
  debateMock({ confirm: 'A close above the range means guaranteed profits for the week.', invalidate: SCEN.invalidate });
  await assert.rejects(runDeskDebate('Is BTC good this week?', v2, 'en', { level: 'maximo' }), (e: unknown) => e instanceof DeskOutputRejected, 'a guarantee inside the scenarios fails the debate'); checks++;
  // Rápido survives an account without access to the primary model; premium levels never fall back.
  mock((c) => (c.body.model === 'gpt-6-luna' ? json({ error: { message: 'model not found' } }, 404) : openai(byRole(c) === 'cio' ? CIO : { analysis: byRole(c) === 'alpha' ? ALPHA : RED })));
  const originalErr = console.error; console.error = () => {};
  const fellBack = await runDeskDebate('Is this real?', evidence, 'en');
  console.error = originalErr;
  eq([fellBack.agents.verdict, calls.filter((c) => c.body.model === 'gpt-4o-mini').length], ['wait', 3], 'Rápido falls back to gpt-4o-mini on a model-access 404');
  eq(calls.find((c) => c.body.model === 'gpt-4o-mini')!.body.max_tokens, 650, 'the fallback keeps its own request shape');
  mock((c) => (c.url.includes('anthropic') ? json({ error: { message: 'invalid x-api-key' } }, 401) : openai({ analysis: byRole(c) === 'alpha' ? ALPHA : RED })));
  console.error = () => {};
  await assert.rejects(runDeskDebate('Is this real?', v2, 'en', { level: 'profundo' })); checks++;
  console.error = originalErr;
  ok(!calls.some((c) => c.url.includes('openai') && byRole(c) === 'cio'), 'Profundo never swaps its Haiku CIO for another model');
  eq(levelPlan('maximo').budgetMs <= 170_000, true, 'Máximo fits inside maxDuration');
  eq(sufficiencyOf('Long term, is SOL worth holding for years?', ['1H', '4H', '1D', '1W']).sufficient, false, 'a multi-year horizon is never covered by the evidence');

  // Credit exhaustion crosses providers once; later roles avoid the exhausted provider.
  for (const direction of ['openai', 'anthropic']) {
    const usage: any[] = [];
    mock((c) => {
      const fromOpenai = hostOf(c.url) === 'api.openai.com';
      if ((direction === 'openai') === fromOpenai) return fromOpenai
        ? json({ error: { code: 'insufficient_quota', message: 'credits exhausted' } }, 429)
        : json({ error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 400);
      const r = byRole(c); const content = r === 'alpha' ? { analysis: ALPHA } : r === 'red' ? { analysis: RED } : r === 'rebuttal' ? { analysis: REBUTTAL } : { ...CIO, scenarios: SCEN };
      return fromOpenai ? openai(content) : claude(content);
    });
    const result = await runDeskDebate('Is this real?', direction === 'openai' ? evidence : v2, 'en', { level: direction === 'openai' ? 'rapido' : 'maximo', usage });
    eq(result.agents.verdict, 'wait', 'credit failover still returns a validated verdict');
    eq(calls.filter(c => hostOf(c.url) === (direction === 'openai' ? 'api.openai.com' : 'api.anthropic.com')).length, 1, 'exhausted provider tried only once per debate');
    eq(usage.filter(u => u.ok).length, direction === 'openai' ? 3 : 4, 'all roles run on the available provider, including Max rebuttal');
    ok(calls.filter(c => hostOf(c.url) === (direction === 'openai' ? 'api.anthropic.com' : 'api.openai.com')).every(c => direction === 'openai' ? c.body.model === 'claude-haiku-5-5' : c.body.model === 'gpt-6-sol'), 'alternate model family matches the analysis level');
  }

  // ---------- the endpoint: premium allowance, refusal, refund, ledger ----------
  const candles = Array.from({ length: 100 }, (_, i) => ({ ts: Date.now() - (100 - i) * H, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 5 }));
  /** One whether-to-act question per language, for the handler-level checks. */
  const ACT_FIRST = { en: 'Is now a good moment for BTC?', es: '¿Conviene entrar a BTC ahora?', fr: 'Est-ce le bon moment pour BTC ?', pt: 'Vale a pena entrar em BTC agora?', it: 'È troppo tardi per BTC?', de: 'Lohnt sich ein Einstieg bei BTC?' } as const;
  const request = (body: Record<string, unknown>, headers: Record<string, string> = {}) => ({ method: 'POST', headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': '10.9.0.1', 'x-bobby-device': 'device-1234567890abcdef', ...headers }, body });
  const response = () => ({
    statusCode: 200, body: null as any, headers: {} as Record<string, string>, chunks: [] as string[], writableEnded: false, writableFinished: false,
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; this.writableEnded = true; this.writableFinished = true; return this; },
    on() { return this; }, flushHeaders() {}, write(c: string) { this.chunks.push(c); return true; }, end() { this.writableEnded = true; this.writableFinished = true; return this; },
    lines() { return this.chunks.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l)); },
  });
  let spend = { day: 0, month: 0 };
  let level: { allowed: boolean; code: string | null; useId: number | null } = { allowed: false, code: 'upgrade_required', useId: null };
  let modelFails = false;
  let providerRefusal: string | null = null;
  let cioReply: unknown = CIO;
  const endpointMock = () => mock((c) => {
    if (c.url.includes('rpc/bobby_consume_desk_quota')) return json(true);
    if (c.url.includes('rpc/bobby_consume_read')) return json({ allowed: true, readId: 88, tier: 'anon', used: 1, limit: 3, remaining: 2 });
    if (c.url.includes('bobby_reads?id=eq.') && c.method === 'DELETE') return json([]);
    if (c.url.includes('rpc/bobby_llm_spend')) return json(spend);
    if (c.url.includes('rpc/bobby_consume_level')) return json({ ...level, tier: 'anon', used: 1, limit: 1, resetsAt: new Date(Date.now() + 86_400_000).toISOString() });
    if (c.url.includes('bobby_level_uses?id=eq.') && c.method === 'DELETE') return json([]);
    if (c.url.includes('bobby_llm_usage')) return json(null, 201);
    if (c.url.includes('/api/okx-candles')) return json({ candles });
    if (c.url.includes('okx.com/api/v5/public')) return json({ data: [] });
    if (c.url.includes('forum_threads')) return json([]);
    if (hostOf(c.url) === 'api.openai.com' || hostOf(c.url) === 'api.anthropic.com') {
      if (providerRefusal) return json({ error: { code: providerRefusal, message: 'private question must never be logged' } }, 429);
      if (modelFails) return hostOf(c.url) === 'api.anthropic.com' ? claude({ analysis: 'x' }, 'max_tokens') : openai({ analysis: 'x' }, 'length');
      const r = byRole(c); const content = r === 'alpha' ? { analysis: ALPHA } : r === 'red' ? { analysis: RED } : cioReply;
      return hostOf(c.url) === 'api.anthropic.com' ? claude(content) : openai(content);
    }
    throw new Error(`Unexpected request ${c.url}`);
  });

  for (const reason of ['insufficient_quota', 'rate_limit_exceeded', 'unknown-private-token']) {
    providerRefusal = reason;
    endpointMock();
    const denied = response();
    const logs: string[] = [];
    const previousError = console.error;
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
    try { await deskHandler(request({ symbol: 'BTC', question: 'PRIVATE_QUESTION', language: 'es', level: 'rapido' }) as never, denied as never); }
    finally { console.error = previousError; }
    eq([denied.statusCode, denied.body.code], [503, 'analysis_failed'], 'provider refusal preserves the shipped iOS failure contract');
    ok(denied.body.error.includes('El análisis no pudo terminar') && !/proveedor|cuota|provider|quota/i.test(denied.body.error), 'readers get the plain localized failure, never provider or quota wording');
    eq(calls.filter(c => hostOf(c.url) === 'api.openai.com').length, reason === 'insufficient_quota' ? 1 : 2, 'billing exhaustion is not retried; transient throttling is bounded');
    ok(calls.some(c => c.url.includes('bobby_reads?id=eq.') && c.method === 'DELETE'), 'failed provider call refunds the general read');
    ok(!calls.some(c => c.body?.model === 'gpt-4o-mini'), '429 never bypasses quota by swapping models');
    ok(!logs.join('').includes('PRIVATE_QUESTION') && !logs.join('').includes('private question') && !logs.join('').includes('unknown-private-token'), 'failure diagnostics omit question and arbitrary provider strings');
    const diagnostic = logs.map(x => { try { return JSON.parse(x); } catch { return null; } }).find(x => x?.event === 'analysis_failed');
    eq(diagnostic?.providerStatus, 429, 'safe diagnostic records provider status');
    eq(diagnostic?.providerCode, reason === 'unknown-private-token' ? null : reason, 'only known provider diagnostic codes retained');
  }
  providerRefusal = null;
  endpointMock();
  const refused = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?', level: 'profundo' }) as never, refused as never);
  eq([refused.statusCode, refused.body.code, refused.body.level, refused.body.meter.limit], [403, 'upgrade_required', 'profundo', 1], 'an exhausted premium level: 403 upgrade_required with the meter');
  ok(!calls.some((c) => /openai|anthropic/.test(c.url)), 'no model call on a refused level');
  ok(!calls.some((c) => c.url.includes('rpc/bobby_consume_read')), 'a premium refusal does not spend a general read');
  const consumeBody = calls.find((c) => c.url.includes('rpc/bobby_consume_level'))!.body;
  eq([consumeBody.p_level, consumeBody.p_limits, consumeBody.p_identity], ['profundo', JSON.parse(JSON.stringify(LEVEL_LIMITS)), null], 'the meter gets the level, the single-source limits and no identity');
  ok(/^[0-9a-f]{24,}$/.test(consumeBody.p_device) && !JSON.stringify(consumeBody).includes('device-1234567890abcdef'), 'only the salted device hash reaches the database');

  level = { allowed: true, code: null, useId: 77 };
  endpointMock();
  const served = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is BTC good for the next few days?', level: 'profundo' }) as never, served as never);
  eq([served.statusCode, served.body.level, served.body.agents.verdict], [200, 'profundo', 'wait'], 'an allowed Profundo read is served');
  ok(calls.some((c) => c.url.includes('bar=4H')) && calls.some((c) => c.url.includes('bar=1W')), 'Profundo loads the higher timeframes');
  const ledger = calls.find((c) => c.url.includes('bobby_llm_usage'))!;
  eq([ledger.body.length, ledger.body.map((r: any) => r.level)], [3, ['profundo', 'profundo', 'profundo']], 'three ledger rows for three calls');
  ok(!JSON.stringify(ledger.body).includes('next few days') && !JSON.stringify(ledger.body).includes(ALPHA), 'the ledger holds numbers, never questions or answers');
  ok(!calls.some((c) => c.method === 'DELETE'), 'a served read is not refunded');
  eq(calls.filter(c => c.url.includes('rpc/bobby_consume_read')).length, 1, 'general read is debited once in desk');

  modelFails = true;
  endpointMock();
  const failed = response();
  const originalError = console.error;
  console.error = () => {};
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?', level: 'profundo' }) as never, failed as never);
  console.error = originalError;
  eq([failed.statusCode, failed.body.code], [503, 'analysis_failed'], 'a failed premium analysis is analysis_failed');
  ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('bobby_level_uses?id=eq.77')), 'and its allowance is given back');
  ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('bobby_reads?id=eq.88')), 'failed premium also refunds its general read');
  ok(calls.some((c) => c.url.includes('bobby_llm_usage')), 'the failed calls are still in the cost ledger');
  modelFails = false;

  endpointMock();
  const quickServed = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?' }) as never, quickServed as never);
  eq([quickServed.statusCode, quickServed.body.level], [200, 'rapido'], 'no level: Rápido, as before');
  ok(!calls.some((c) => c.url.includes('bobby_consume_level')), 'Rápido never touches the premium meter');

  // The next question over the wire: a bad one is a 200 with the fixed question, never an analysis_failed. Same
  // verdict, same synthesis otherwise, nothing given back, and the only trace is one log line without a text.
  {
    endpointMock();
    const goodRead = response();
    await deskHandler(request({ symbol: 'BTC', question: 'Is this real?' }) as never, goodRead as never);
    eq([goodRead.statusCode, goodRead.body.agents.synthesis.followUp], [200, SYN.followUp], 'a good next question reaches the client as the CIO wrote it');
    const fixed: Record<string, string> = {
      en: 'What would have to change in BTC for this read to change?', es: '¿Qué tendría que cambiar en BTC para que cambie esta lectura?',
      fr: 'Qu’est-ce qui devrait changer sur BTC pour que cette analyse change ?', pt: 'O que teria de mudar em BTC para esta análise mudar?',
      it: 'Che cosa dovrebbe cambiare in BTC perché questa analisi cambi?', de: 'Was müsste sich bei BTC ändern, damit sich diese Analyse ändert?',
    };
    for (const [followUp, language, reason, what] of [
      ['You should buy BTC now, right?', 'en', 'advice', 'an advice word'],
      ['Why is BTC a guaranteed profit this week?', 'en', 'guarantee', 'a guarantee'],
      ['BTC looks ready to break out here.', 'en', 'shape', 'a statement instead of a question'],
      ['What happens if BTC closes above 104?', 'en', 'number', 'a price'],
      ['Is now a good moment for BTC?', 'en', 'act', 'when to act (en)'],
      ['¿Conviene entrar a BTC ahora?', 'es', 'act', 'when to act (es)'],
      ['Est-ce le bon moment pour BTC ?', 'fr', 'act', 'when to act (fr)'],
      ['Vale a pena entrar em BTC agora?', 'pt', 'act', 'when to act (pt)'],
      ['È troppo tardi per BTC?', 'it', 'act', 'when to act (it)'],
      ['Lohnt sich ein Einstieg bei BTC?', 'de', 'act', 'when to act (de)'],
    ] as const) {
      cioReply = { ...CIO, synthesis: { ...SYN, followUp } };
      endpointMock();
      const res = response();
      const logs: string[] = [];
      const previousError = console.error;
      console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
      try { await deskHandler(request({ symbol: 'BTC', question: 'PRIVATE_QUESTION about BTC', language }) as never, res as never); }
      finally { console.error = previousError; }
      const { followUp: served, ...rest } = res.body.agents.synthesis;
      const { followUp: _written, ...expected } = SYN;
      eq([res.statusCode, res.body.code, res.body.agents.verdict, res.body.agents.direction, rest, served], [200, undefined, 'wait', 'none', expected, fixed[language]], `${what}: 200, the same verdict and synthesis, the fixed question in ${language}`);
      eq(Object.keys(res.body.agents.synthesis), Object.keys(goodRead.body.agents.synthesis), `${what}: the synthesis keeps its keys and their order`);
      ok(typeof served === 'string' && served.length >= 6 && served.length <= 160, `${what}: a string inside the bounds shipped clients decode, never null`);
      ok(!calls.some((c) => c.method === 'DELETE'), `${what}: nothing is given back, the read was delivered`);
      eq(calls.filter((c) => c.url.includes('rpc/bobby_record_outcome')).map((c) => c.body.p_event), ['read_done'], `${what}: the funnel records a finished read, not a failed one`);
      const replaced = logs.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter((x) => x?.event === 'follow_up_replaced');
      eq(replaced, [{ route: 'desk-debate', event: 'follow_up_replaced', reason, language, level: 'rapido' }], `${what}: logged once by its class`);
      ok(!logs.join('\n').includes(followUp) && !logs.join('\n').includes('PRIVATE_QUESTION') && !logs.join('\n').includes(SYN.headline) && !logs.some((x) => x.includes('analysis_failed') || x.includes('model output rejected')), `${what}: no question, no answer and no failure in the log`);
    }
    // The reader taps the chip: the web sends that very text back as the question (behind the symbol when the
    // question does not name it). Through the handler, the next chip is never the question just answered.
    {
      const tap = async (question: string, followUp: string, language: keyof typeof ACT_FIRST = 'en') => {
        cioReply = { ...CIO, synthesis: { ...SYN, followUp } };
        endpointMock();
        const res = response();
        const logs: string[] = [];
        const previousError = console.error;
        console.error = (...args: unknown[]) => logs.push(args.map(String).join(' '));
        try { await deskHandler(request({ symbol: 'BTC', question, language }) as never, res as never); }
        finally { console.error = previousError; }
        const reasons = logs.map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter((x) => x?.event === 'follow_up_replaced').map((x) => x.reason);
        return { status: res.statusCode, chip: res.body.agents?.synthesis?.followUp, reasons, metered: calls.filter((c) => c.url.includes('rpc/bobby_record_outcome')).map((c) => c.body.p_event) };
      };
      for (const language of Object.keys(ACT_FIRST) as Array<keyof typeof ACT_FIRST>) {
        const first = nextQuestionFallback(language, 'BTC'), second = nextQuestionSecond(language, 'BTC');
        eq(await tap(first, ACT_FIRST[language], language), { status: 200, chip: second, reasons: ['act'], metered: ['read_done'] }, `${language}: the fixed question is asked and the CIO's next one is refused: the handler serves the second fixed question`);
        eq((await tap(second, ACT_FIRST[language], language)).chip, first, `${language}: …and after the second, the first: a tap never buys the question it just answered`);
      }
      eq((await tap(`BTC · ${nextQuestionFallback('en', 'BTC')}`, 'Should I add to BTC here?')).chip, nextQuestionSecond('en', 'BTC'), 'the same when the question came back behind its symbol');
      eq(await tap('What would confirm the BTC trend?', 'What would confirm the BTC trend?'), { status: 200, chip: nextQuestionFallback('en', 'BTC'), reasons: ['repeat'], metered: ['read_done'] }, 'a CIO that echoes the question asked: the fixed question, logged as a repeat');
      eq(await tap('Is this real?', 'What would confirm the BTC trend?'), { status: 200, chip: 'What would confirm the BTC trend?', reasons: [], metered: ['read_done'] }, 'the same next question after any other question is served as written');
    }
    // The live desk carries the same body.
    cioReply = { ...CIO, synthesis: { ...SYN, followUp: 'Should I add to BTC here?' } };
    endpointMock();
    const liveRead = response();
    const savedError = console.error; console.error = () => {};
    await deskHandler(request({ symbol: 'BTC', question: 'Is this real?' }, { accept: 'application/x-ndjson' }) as never, liveRead as never);
    console.error = savedError;
    eq([liveRead.lines().at(-1).type, liveRead.lines().at(-1).data.agents.synthesis.followUp], ['final', fixed.en], 'the NDJSON final line carries the fixed question too, and no error line');
    cioReply = CIO;
  }

  // The live desk over the wire: NDJSON lines, the same final body, and an honest error line.
  level = { allowed: true, code: null, useId: 78 };
  endpointMock();
  const streamed = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is BTC good for the next few days?', level: 'profundo' }, { accept: 'application/x-ndjson' }) as never, streamed as never);
  const lines = streamed.lines();
  eq([streamed.statusCode, streamed.headers['content-type']?.startsWith('application/x-ndjson')], [200, true], 'Accept ndjson: a streamed 200');
  eq(lines.map((l: any) => l.type === 'agent' ? l.role : l.type), ['accepted', 'evidence', 'alpha', 'red', 'final'], 'accepted, evidence, Alpha, Red Team, then the final body');
  eq([lines.at(-1).data.agents.synthesis.headline, lines.at(-1).data.level], [SYN.headline, 'profundo'], 'the final line carries the same body as the JSON reply');
  modelFails = true;
  endpointMock();
  const streamFail = response();
  console.error = () => {};
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?', level: 'profundo' }, { accept: 'application/x-ndjson' }) as never, streamFail as never);
  console.error = originalError;
  eq([streamFail.lines().at(-1).type, streamFail.lines().at(-1).code, streamFail.lines().at(-1).refunded], ['error', 'analysis_failed', true], 'a failed live debate ends on an error line');
  ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('bobby_level_uses?id=eq.78')), 'and gives the allowance back');
  modelFails = false;

  // The spend guard: premium pauses above the daily cap, everything at the monthly cap, before any spend.
  resetLlmSpendCache(); spend = { day: 20, month: 20 };
  endpointMock();
  const paused = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?', level: 'maximo' }) as never, paused as never);
  eq([paused.statusCode, paused.body.code], [503, 'budget_paused'], 'above the daily cap Máximo is paused');
  ok(!calls.some((c) => c.url.includes('bobby_consume_level') || /openai|anthropic/.test(c.url)), 'before its meter or any model');
  endpointMock();
  const stillQuick = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?' }) as never, stillQuick as never);
  eq(stillQuick.statusCode, 200, 'Rápido keeps working under the daily cap');
  resetLlmSpendCache(); spend = { day: 0, month: 400 };
  endpointMock();
  const hardCap = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?' }) as never, hardCap as never);
  eq([hardCap.statusCode, hardCap.body.code], [503, 'budget_paused'], 'at the monthly hard cap the whole desk pauses');
  resetLlmSpendCache(); spend = { day: 0, month: 0 };

  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  endpointMock();
  const noKey = response();
  await deskHandler(request({ symbol: 'BTC', question: 'Is this real?', level: 'maximo' }) as never, noKey as never);
  eq([noKey.statusCode, noKey.body.code, calls.map((c) => c.url)], [503, 'desk_unavailable', ['https://db.test/rest/v1/rpc/bobby_record_outcome']], 'No provider keys records the block before any spend');
  process.env.ANTHROPIC_API_KEY = 'test-anthropic';
  process.env.OPENAI_API_KEY = 'test-openai';

  // ---------- invites ----------
  eq(['ABCDEFGH', 'K7M9QRST', 'abcdefgh', 'ABCDEFG', 'ABCDEFGI', 'ABCDEF01'].map(isReferralCode), [true, true, false, false, false, false], 'invite codes: 8 of A–Z 2–9 without I, O, 0, 1');
  let created = '';
  mock((c) => {
    if (c.method === 'POST' && c.url.includes('bobby_referral_codes')) { created = c.body.code; return json(null, 201); }
    if (c.url.includes('bobby_referral_codes')) return json(created ? [{ code: created }] : []);
    throw new Error(`Unexpected request ${c.url}`);
  });
  const codeNow = await referralCode('11111111-1111-4111-8111-111111111111');
  ok(isReferralCode(codeNow) && codeNow === created, 'a missing code is created once and read back');
  mock((c) => { if (c.url.includes('rpc/bobby_referral_claim')) return json({ ok: true, code: 'claimed' }); throw new Error('Unexpected'); });
  eq(await claimReferral('22222222-2222-4222-8222-222222222222', codeNow), 'claimed', 'a claim returns the database verdict');
  eq([calls[0].body.p_reward_days, calls[0].body.p_max, calls[0].body.p_new_account_days], [REFERRAL.rewardDays, 5, 7], 'claim parameters: reward days, five friends, new accounts only');
  eq(REFERRAL.rewardDays, 30, 'one month of Pro per friend by default');
  // The link every client shares (iOS 1.5-1.7, Android and the web print the server's string as it is).
  mock((c) => {
    if (c.url.includes('bobby_referral_codes')) return json([{ code: 'K7M9QRST' }]);
    if (c.url.includes('bobby_referrals')) return json([{ created_at: '2026-10-01T12:00:00+00:00' }]);
    if (c.url.includes('bobby_pro_grants')) return json([]);
    throw new Error(`Unexpected request ${c.url}`);
  });
  const shared = await referralStatus('11111111-1111-4111-8111-111111111111', 'https://bobbyprotocol.xyz');
  eq(shared, { code: 'K7M9QRST', url: 'https://bobbyprotocol.xyz/i/K7M9QRST', accepted: 1, max: 5, rewardDays: REFERRAL.rewardDays, proUntil: null, proSource: null, friends: [{ joinedAt: '2026-10-01T12:00:00.000Z' }] },
    'the invite link is the invitation page /i/CODE; every other field of the status keeps its shape');
  const sharedUrl = new URL(shared.url);
  eq([sharedUrl.protocol, sharedUrl.host, sharedUrl.pathname, sharedUrl.search, sharedUrl.hash], ['https:', 'bobbyprotocol.xyz', '/i/K7M9QRST', '', ''], 'shipped clients: it parses as a URL (iOS) and starts with https://bobbyprotocol.xyz/ (Android)');
  ok(shared.url.startsWith('https://bobbyprotocol.xyz/') && !shared.url.includes('/desk'), 'the shared link no longer opens the web desk');
  eq([inviteUrl('https://bobby-preview.vercel.app', 'ABCDEFGH'), inviteUrl('http://localhost:8080', 'ABCDEFGH')], ['https://bobby-preview.vercel.app/i/ABCDEFGH', 'http://localhost:8080/i/ABCDEFGH'], 'previews and local servers link to their own host');

  // ---------- Haiku by default; explicit rollback and reciprocal provider failover stay available ----------
  {
    delete process.env.BOBBY_LLM_PRIMARY;
    const models = (l: 'rapido' | 'profundo' | 'maximo') => { const p = levelPlan(l); return [p.alpha.model, p.red.model, p.cio.model]; };
    eq([models('rapido'), models('profundo'), models('maximo')], [['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-haiku-5-5'], ['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-haiku-5-5'], ['claude-haiku-5-5', 'claude-haiku-5-5', 'claude-haiku-5-5']], 'Haiku answers every role first on every level');
    eq([levelPlan('rapido').alpha.provider, levelPlan('profundo').red.provider, levelPlan('maximo').rebuttal?.provider], ['anthropic', 'anthropic', 'anthropic'], 'without a provider override every level and second round uses Anthropic');
    process.env.BOBBY_APP_TEXT_MODEL = 'claude-sonnet-5-5';
    eq([models('rapido'), models('profundo'), models('maximo'), levelPlan('maximo').rebuttal?.model], [
      ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'],
      ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'],
      ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'], 'claude-sonnet-5-5',
    ], 'explicit app text-model rollback reaches every level and the second round');
    delete process.env.BOBBY_APP_TEXT_MODEL;
    eq([levelPlan('rapido').cio.effort, levelPlan('profundo').alpha.effort, levelPlan('profundo').cio.effort, levelPlan('maximo').cio.effort], ['low', 'low', 'medium', 'high'], 'effort grows with the level');
    eq(levelPlan('rapido').fallback?.provider, 'openai', 'Rápido model-access fallback is on the other provider');

    debateMock();
    const haikuFirst = await runDeskDebate('Is BTC worth a look this week?', evidence, 'en');
    eq(calls.map((c) => [byRole(c), hostOf(c.url), c.body.model]), [['alpha', 'api.anthropic.com', 'claude-haiku-5-5'], ['red', 'api.anthropic.com', 'claude-haiku-5-5'], ['cio', 'api.anthropic.com', 'claude-haiku-5-5']], 'Rápido runs on Haiku');
    eq(calls.map((c) => c.body.output_config?.effort), ['low', 'low', 'low'], 'Rápido asks Haiku for low effort');
    eq(haikuFirst.agents.verdict, 'wait', 'Haiku-first returns a validated verdict');
    for (const stop of ['refusal', 'max_tokens']) {
      const rejectedUsage: any[] = [];
      mock(() => claude({ analysis: ALPHA }, stop));
      await assert.rejects(runDeskDebate('Is this real?', evidence, 'en', { usage: rejectedUsage }), LlmIncompleteError); checks++;
      eq(calls.filter((c) => hostOf(c.url) === 'api.anthropic.com').length, 1, `${stop}: only the original Anthropic call is spent`);
      eq(calls.filter((c) => hostOf(c.url) === 'api.openai.com').length, 0, `${stop}: a refused or incomplete answer never crosses providers`);
      eq([rejectedUsage[0].ok, rejectedUsage[0].stop, rejectedUsage[0].tokensOut], [false, stop, 500], `${stop}: unsuccessful output still records its billable tokens`);
    }

    // Haiku out of credit: the role moves to OpenAI once, the later roles start there, and the owner gets one email.
    (await import('../api/_lib/provider-alert.ts')).resetProviderAlerts();
    process.env.RESEND_API_KEY = 'test-resend';
    process.env.BOBBY_ALERT_EMAIL = 'owner@bobby.test';
    const noCredit = () => json({ type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.' } }, 400);
    const failoverMock = () => mock((c) => {
      const host = hostOf(c.url);
      if (host === 'api.anthropic.com') return noCredit();
      if (host === 'db.test') return c.method === 'GET' ? json([]) : new Response(null, { status: 201 });
      if (host === 'api.resend.com') return json({ id: 'email-1' });
      const r = byRole(c);
      return openai(r === 'alpha' ? { analysis: ALPHA } : r === 'red' ? { analysis: RED } : CIO);
    });
    failoverMock();
    const failedOver = await runDeskDebate('Is BTC worth a look this week?', evidence, 'en');
    await new Promise((r) => setTimeout(r, 50));
    const ai = calls.filter((c) => ['api.anthropic.com', 'api.openai.com'].includes(hostOf(c.url)));
    eq(ai.map((c) => [byRole(c), hostOf(c.url)]), [['alpha', 'api.anthropic.com'], ['alpha', 'api.openai.com'], ['red', 'api.openai.com'], ['cio', 'api.openai.com']], 'one refused Haiku call, then OpenAI for every role; no retry of exhausted credit');
    eq(failedOver.agents.verdict, 'wait', 'the failed-over debate still returns a validated verdict');
    const emails = calls.filter((c) => hostOf(c.url) === 'api.resend.com');
    eq(emails.length, 1, 'exhausted credit sends one alert email');
    eq([emails[0].body.to, /Anthropic/.test(emails[0].body.subject), /console\.anthropic\.com/.test(emails[0].body.text)], [['owner@bobby.test'], true, true], 'the alert names the provider and where to top it up');
    ok(!/Is BTC worth/.test(JSON.stringify(emails[0].body)), 'the alert never carries the question');
    ok(calls.some((c) => hostOf(c.url) === 'db.test' && c.method === 'POST' && c.body?.cache_key === 'provider-credit-alert:anthropic'), 'the alert window is claimed across instances');

    failoverMock();
    await runDeskDebate('Is BTC worth a look this week?', evidence, 'en');
    await new Promise((r) => setTimeout(r, 50));
    eq(calls.filter((c) => hostOf(c.url) === 'api.resend.com').length, 0, 'a second refusal inside the window sends no second email');

    delete process.env.RESEND_API_KEY; delete process.env.BOBBY_ALERT_EMAIL;
    process.env.BOBBY_LLM_PRIMARY = 'openai';
  }

  console.log(`desk-levels: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
}
