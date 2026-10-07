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

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-openai';
process.env.ANTHROPIC_API_KEY = 'test-anthropic';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
process.env.RATE_LIMIT_SALT = 'test-salt';
delete process.env.BOBBY_DESK_MODEL;
// The suite below pins the OpenAI-first plans; the Sonnet-first default is checked in its own block at the end.
process.env.BOBBY_LLM_PRIMARY = 'openai';

const { completeJson, LlmIncompleteError } = await import('../api/_lib/llm.ts');
const { runDeskDebate, DeskOutputRejected, sufficiencyOf, servedFollowUp, publicTextViolation } = await import('../api/_lib/desk-debate.ts');
const { nextQuestionViolation, nextQuestionFallback, NEXT_QUESTION_RULE, FOLLOW_UP_MIN, FOLLOW_UP_MAX } = await import('../api/_lib/desk-next-question.ts');
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
    await completeJson({ provider: 'anthropic', model: 'claude-sonnet-5-5', effort: 'high', maxTokens: 6000, timeoutMs: 10_000 }, 'sys', 'user', schema, { endpoint: 't' });
    const c = calls[0];
    eq([c.url, c.headers['x-api-key'], c.headers['anthropic-version']], ['https://api.anthropic.com/v1/messages', 'test-anthropic', '2023-06-01'], 'Claude: endpoint and headers');
    eq([c.body.max_tokens, c.body.system, c.body.output_config.effort, c.body.output_config.format.type], [6000, 'sys', 'high', 'json_schema'], 'Claude: effort + json_schema in output_config');
    ok(!('temperature' in c.body), 'Claude: no temperature');

    const cut: any[] = [];
    mock(() => claude({ analysis: 'partial' }, 'max_tokens'));
    await assert.rejects(completeJson({ provider: 'anthropic', model: 'claude-sonnet-5-5', maxTokens: 10, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't', usage: cut }), LlmIncompleteError); checks++;
    eq([cut[0].ok, cut[0].stop, cut[0].tokensOut], [false, 'max_tokens', 500], 'a token-limited answer is a failure, still billed in the ledger');
    mock(() => openai({ analysis: 'partial' }, 'length'));
    await assert.rejects(completeJson({ provider: 'openai', model: 'gpt-6-luna', maxTokens: 10, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' }), LlmIncompleteError); checks++;

    let n = 0;
    mock(() => (++n === 1 ? json({ error: 'overloaded' }, 529) : claude({ analysis: 'after retry' })));
    eq(await completeJson({ provider: 'anthropic', model: 'claude-sonnet-5-5', maxTokens: 100, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' }), { analysis: 'after retry' }, 'one retry on 529');
    mock(() => json({ error: 'bad request' }, 400));
    await assert.rejects(completeJson({ provider: 'openai', model: 'gpt-6-luna', maxTokens: 100, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' })); checks++;
    eq(calls.filter((c) => hostOf(c.url) === 'api.openai.com').length, 1, 'a 400 is not retried');
    mock(() => json({ stop_reason: 'end_turn', content: [{ type: 'text', text: '```json\n{"analysis":"fenced"}\n```' }], usage: {} }));
    eq(await completeJson({ provider: 'anthropic', model: 'claude-sonnet-5-5', maxTokens: 100, timeoutMs: 10_000 }, 's', 'u', schema, { endpoint: 't' }), { analysis: 'fenced' }, 'a stray code fence around valid JSON is tolerated');
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
      eq(nextQuestionFallback(lang, 'BTC'), FALLBACK[lang], `${lang}: the fixed next question`);
      for (const symbol of ['BTC', 'NVDA', 'MC.PA', '7203.T', '1INCH', 'BRK-B', 'NOW', 'ADD', 'HOLD', 'BUY', 'SELL', 'ME', 'I', 'A', 'ABCDEFGHIJ0123456789']) {
        const fixed = nextQuestionFallback(lang, symbol);
        eq([nextQuestionViolation(fixed, lang, symbol), publicTextViolation(fixed)], [null, null], `${lang} ${symbol}: the fixed question passes the next-question rule and the output guard`);
        ok(fixed.length >= FOLLOW_UP_MIN && fixed.length <= FOLLOW_UP_MAX && fixed.includes(symbol) && fixed.split('?').length === 2 && !/[.!;:\n]/.test(fixed.replace(symbol, '')), `${lang} ${symbol}: one sentence naming the symbol, inside the bounds every client decodes`);
      }
      ok(!FORBIDDEN.test(nextQuestionFallback(lang, 'XYZ')), `${lang}: the fixed question uses none of the forbidden words`);
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
    for (const lang of LANGS) for (const [symbol, question] of GOOD[lang]) {
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
      ['Was passiert, wenn BTC unter hunderttausend fällt?', 'de', null, 'a compound number word is not read (documented limit)'],
      ['What signals would confirm a BTC breakout?', 'en', 'word', 'the word signal'],
      ['¿Qué señales confirmarían una ruptura de BTC?', 'es', 'word', "a model's own question with señales"],
      ['What returns has BTC shown this month?', 'en', 'word', 'the word returns'],
      ['What guarantees a BTC breakout?', 'en', 'word', 'the word guarantee'],
      ['Why is BTC advice so mixed?', 'en', 'word', 'the word advice'],
      ['Quel signal confirmerait la cassure de BTC ?', 'fr', 'word', 'signal in French'],
      ['Welches Kaufsignal fehlt bei BTC?', 'de', 'word', 'a compound with Kauf'],
    ] as const) eq(nextQuestionViolation(question, lang, 'BTC'), want, `${what}: ${want ?? 'passes'}`);
    eq([nextQuestionViolation(42, 'en', 'BTC'), nextQuestionViolation(null, 'en', 'BTC'), nextQuestionViolation(undefined, 'en', 'BTC'), nextQuestionViolation({ text: 'What?' }, 'en', 'BTC')], ['shape', 'shape', 'shape', 'shape'], 'anything but a string is refused');
    // The ticker is set aside before any word is read: an asset called NOW, ADD or 7203.T is not a word or a number.
    eq([nextQuestionViolation('What would confirm a NOW breakout?', 'en', 'NOW'), nextQuestionViolation('What would confirm an ADD breakout?', 'en', 'ADD'), nextQuestionViolation('What would confirm a 7203.T breakout?', 'en', '7203.T'), nextQuestionViolation('What would confirm an ADD breakout?', 'en', 'BTC')],
      [null, null, null, 'act'], 'the asked asset\'s own ticker is never read as a word or a number; the same letters as a word are');

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
  }

  const gone = new AbortController(); gone.abort();
  debateMock();
  await assert.rejects(runDeskDebate('Is this real?', evidence, 'en', { signal: gone.signal })); checks++;
  eq(calls.filter((c) => hostOf(c.url) === 'api.openai.com').length, 0, 'a reader who left costs no model call');
  ok(!('timeframes' in quick) && !('record' in quick), 'the raw v2 evidence is not echoed back');

  debateMock();
  const usage: any[] = [];
  const deep = await runDeskDebate('Is BTC good for the next few days?', v2, 'en', { level: 'profundo', usage });
  eq(calls.map((c) => [byRole(c), c.url.includes('anthropic') ? `${c.body.model}:${c.body.output_config.effort}` : c.body.model]), [['alpha', 'gpt-6-luna'], ['red', 'gpt-6-luna'], ['cio', 'claude-sonnet-5-5:medium']], 'Profundo: luna debaters, Sonnet medium CIO');
  eq([deep.sufficiency.sufficient, deep.evidenceUsed.timeframes, deep.evidenceUsed.derivatives, deep.evidenceUsed.record?.wins], [true, ['1H', '4H', '1D'], true, 6], 'Profundo: v2 evidence covers the weekly horizon');
  ok(/evidence\.timeframes holds/.test(calls[0].body.messages[0].content) && JSON.parse(calls[0].body.messages[1].content).evidence.record.wins === 6, 'Profundo: the roles see the timeframes and Bobby\'s record');
  eq(usage.map((u) => u.role), ['alpha', 'red', 'cio'], 'Profundo: one ledger row per call');

  debateMock();
  const max = await runDeskDebate('Is BTC good for the next few days?', v2, 'en', { level: 'maximo' });
  eq(calls.map((c) => [byRole(c), `${c.body.model}:${c.body.output_config?.effort}`]), [['alpha', 'claude-sonnet-5-5:high'], ['red', 'claude-sonnet-5-5:high'], ['rebuttal', 'claude-sonnet-5-5:high'], ['cio', 'claude-sonnet-5-5:high']], 'Máximo: Sonnet high ×4 with the second round');
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
  ok(!calls.some((c) => c.url.includes('openai') && byRole(c) === 'cio'), 'Profundo never swaps its Sonnet CIO for another model');
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
    ok(calls.filter(c => hostOf(c.url) === (direction === 'openai' ? 'api.anthropic.com' : 'api.openai.com')).every(c => direction === 'openai' ? c.body.model === 'claude-sonnet-5-5' : c.body.model === 'gpt-6-sol'), 'alternate model family matches the analysis level');
  }

  // ---------- the endpoint: premium allowance, refusal, refund, ledger ----------
  const candles = Array.from({ length: 100 }, (_, i) => ({ ts: Date.now() - (100 - i) * H, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 5 }));
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

  // ---------- Sonnet first (owner's rule, 2026-10-01), OpenAI when Sonnet is out of credit ----------
  {
    process.env.BOBBY_LLM_PRIMARY = 'anthropic';
    const models = (l: 'rapido' | 'profundo' | 'maximo') => { const p = levelPlan(l); return [p.alpha.model, p.red.model, p.cio.model]; };
    eq([models('rapido'), models('profundo'), models('maximo')], [['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'], ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5'], ['claude-sonnet-5-5', 'claude-sonnet-5-5', 'claude-sonnet-5-5']], 'Sonnet answers every role first on every level');
    eq([levelPlan('rapido').cio.effort, levelPlan('profundo').alpha.effort, levelPlan('profundo').cio.effort, levelPlan('maximo').cio.effort], ['low', 'low', 'medium', 'high'], 'effort grows with the level');
    eq(levelPlan('rapido').fallback?.provider, 'openai', 'Rápido model-access fallback is on the other provider');

    debateMock();
    const sonnetFirst = await runDeskDebate('Is BTC worth a look this week?', evidence, 'en');
    eq(calls.map((c) => [byRole(c), hostOf(c.url), c.body.model]), [['alpha', 'api.anthropic.com', 'claude-sonnet-5-5'], ['red', 'api.anthropic.com', 'claude-sonnet-5-5'], ['cio', 'api.anthropic.com', 'claude-sonnet-5-5']], 'Rápido runs on Sonnet');
    eq(calls.map((c) => c.body.output_config?.effort), ['low', 'low', 'low'], 'Rápido asks Sonnet for low effort');
    eq(sonnetFirst.agents.verdict, 'wait', 'Sonnet-first returns a validated verdict');

    // Sonnet out of credit: the role moves to OpenAI once, the later roles start there, and the owner gets one email.
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
    eq(ai.map((c) => [byRole(c), hostOf(c.url)]), [['alpha', 'api.anthropic.com'], ['alpha', 'api.openai.com'], ['red', 'api.openai.com'], ['cio', 'api.openai.com']], 'one refused Sonnet call, then OpenAI for every role; no retry of exhausted credit');
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
