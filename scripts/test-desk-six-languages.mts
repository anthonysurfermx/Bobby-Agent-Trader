// Real handler and model adapter with local-only HTTP doubles. No provider or backend request escapes.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'fixture-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'fixture-service';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
process.env.OPENAI_API_KEY = 'fixture-model';
process.env.ANTHROPIC_API_KEY = 'fixture-model';
process.env.BOBBY_MEMORY = 'off';
const { default: handler } = await import('../api/desk-debate.ts');
const { APP_LANGUAGES: DESK_LANGUAGES, appLocale, languageName } = await import('../src/lib/app-language.ts');
const DESK_LOCALES = Object.fromEntries(DESK_LANGUAGES.map(language => [language, appLocale(language)]));
const DESK_LANGUAGE_NAMES = Object.fromEntries(DESK_LANGUAGES.map(language => [language, languageName(language)]));
const { deskErrorCopy } = await import('../api/_lib/desk-localization.ts');
const DESK_MESSAGES = { method: ['Method not allowed', 'Método no permitido', 'Método não permitido'], origin: ['Origin not allowed', 'Origen no permitido', 'Origem não permitida'], invalid: ['Choose an asset and type a question.', 'Elige un activo y escribe una pregunta.', 'Escolha um ativo e escreva uma pergunta.'], tooLong: ['Your question is too long. Keep it to 1,200 characters or fewer.', 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.', 'Sua pergunta é longa demais. Use no máximo 1.200 caracteres.'], unavailable: ['The analysis desk is temporarily unavailable.', 'La mesa de análisis no está disponible por ahora.', 'A mesa de análise está temporariamente indisponível.'], failed: ['The analysis could not finish. Please retry. No verdict was issued.', 'El análisis no pudo terminar. Inténtalo de nuevo. No se emitió ningún veredicto.', 'A análise não pôde ser concluída. Tente novamente. Nenhum veredito foi emitido.'], paused: ['The desk is paused for now. Try again later.', 'El desk está en pausa por ahora. Inténtalo más tarde.', 'A mesa está pausada por enquanto. Tente novamente mais tarde.'], premiumPaused: ['Deep and Max are paused for today. Quick still works.', 'Profundo y Máximo están en pausa por hoy. Rápido sigue disponible.', 'Profundo e Máximo estão pausados hoje. Rápido continua disponível.'], signinLevel: ['Create your free account to use this level.', 'Crea tu cuenta gratis para usar este nivel.', 'Crie sua conta gratuita para usar este nível.'], upgrade: ['You used this level for now. Get Bobby Pro or invite a friend.', 'Ya usaste este nivel por ahora. Obtén Bobby Pro o invita a un amigo.', 'Você já usou este nível por enquanto. Assine Bobby Pro ou convide um amigo.'], exhausted: ['You used this level for this month.', 'Ya usaste este nivel este mes.', 'Você já usou este nível neste mês.'], signinRead: ['Create your free account to keep reading.', 'Crea tu cuenta gratis para seguir leyendo.', 'Crie sua conta gratuita para continuar lendo.'], readsUsed: ['Your general read allowance is used for now.', 'Tu cupo de lecturas generales se agotó por ahora.', 'Seu limite de leituras gerais foi usado por enquanto.'], daily: ["Bobby reached today's analysis limit. Try again tomorrow.", 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.', 'Bobby atingiu o limite de análises de hoje. Tente novamente amanhã.'] } as const;
const deskCopy = (language: Language, key: keyof typeof DESK_MESSAGES) => deskErrorCopy(language, DESK_MESSAGES[key][0], DESK_MESSAGES[key][1]);
const { runDeskDebate, publicTextViolation, horizonOf, reviewDeskOutput, DeskOutputRejected } = await import('../api/_lib/desk-debate.ts');
const { readerContext } = await import('../api/_lib/user-memory.ts');
const { resetLlmSpendCache } = await import('../api/_lib/llm-usage.ts');
type Language = typeof DESK_LANGUAGES[number];
const originalFetch = globalThis.fetch;
let checks = 0;
const eq = (a: unknown, b: unknown, message: string) => { assert.deepEqual(a, b, message); checks++; };
const ok = (a: unknown, message: string) => { assert.ok(a, message); checks++; };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const phrases: Record<Language, { analysis: string; headline: string; why: string; risk: string; watch: string; followUp: string }> = {
  en: { analysis: 'The trend is conditional and still needs confirmation from volume.', headline: 'The trend still needs confirmation.', why: 'Volume is not yet convincing.', risk: 'Support could fail.', watch: 'Watch the close above resistance.', followUp: 'What would confirm the BTC trend?' },
  es: { analysis: 'La tendencia es condicional y aún necesita confirmación del volumen.', headline: 'La tendencia aún necesita confirmación.', why: 'El volumen todavía no convence.', risk: 'El soporte podría fallar.', watch: 'Observa el cierre sobre la resistencia.', followUp: '¿Qué confirmaría la tendencia de BTC?' },
  pt: { analysis: 'A tendência é condicional e ainda precisa de confirmação do volume.', headline: 'A tendência ainda precisa de confirmação.', why: 'O volume ainda não convence.', risk: 'O suporte pode falhar.', watch: 'Observe o fechamento acima da resistência.', followUp: 'O que confirmaria a tendência do BTC?' },
  fr: { analysis: 'La tendance reste conditionnelle et nécessite une confirmation du volume.', headline: 'La tendance nécessite encore une confirmation.', why: 'Le volume reste peu convaincant.', risk: 'Le support pourrait céder.', watch: 'Observez la clôture au-dessus de la résistance.', followUp: 'Qu’est-ce qui confirmerait la tendance du BTC ?' },
  it: { analysis: 'La tendenza resta condizionata e richiede ancora una conferma dei volumi.', headline: 'La tendenza richiede ancora una conferma.', why: 'Il volume non convince ancora.', risk: 'Il supporto potrebbe cedere.', watch: 'Osserva la chiusura sopra la resistenza.', followUp: 'Cosa confermerebbe la tendenza di BTC?' },
  de: { analysis: 'Der Trend bleibt bedingt und braucht noch eine Bestätigung durch das Volumen.', headline: 'Der Trend braucht noch eine Bestätigung.', why: 'Das Volumen überzeugt noch nicht.', risk: 'Die Unterstützung könnte brechen.', watch: 'Beobachte den Schluss über dem Widerstand.', followUp: 'Was würde den BTC-Trend bestätigen?' },
};
let language: Language = 'en';
let gate: 'allow' | 'daily' | 'signinRead' | 'readsUsed' | 'signinLevel' | 'upgrade' | 'exhausted' | 'paused' | 'premiumPaused' | 'failed' = 'allow';
let providerCalls: Array<{ host: string; system: string; input: any }> = [];
const unexpected: string[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.hostname === 'db.test') {
    if (url.pathname.endsWith('/rpc/bobby_llm_spend')) return json({ day: gate === 'premiumPaused' ? 99 : 0, month: gate === 'paused' ? 999 : 0 });
    if (url.pathname.endsWith('/rpc/bobby_consume_read')) return json({ allowed: gate !== 'signinRead' && gate !== 'readsUsed', code: gate === 'signinRead' ? 'signin_required' : gate === 'readsUsed' ? 'subscription_required' : null, readId: 7, tier: 'free', used: 1, limit: 10 });
    if (url.pathname.endsWith('/rpc/bobby_consume_level')) return json({ allowed: !['signinLevel', 'upgrade', 'exhausted'].includes(gate), code: gate === 'signinLevel' ? 'signin_required' : gate === 'upgrade' ? 'upgrade_required' : 'level_exhausted', useId: 8, tier: 'free', used: 1, limit: 3 });
    if (url.pathname.endsWith('/rpc/bobby_consume_desk_quota')) return json(gate !== 'daily');
    if (url.pathname.endsWith('/bobby_desk_quotas')) return json([]);
    if (url.pathname.endsWith('/rpc/bobby_record_outcome')) return json({});
    if (url.pathname.endsWith('/bobby_reads') || url.pathname.endsWith('/bobby_level_uses')) return json([]);
    if (url.pathname.endsWith('/bobby_llm_usage') && init?.method === 'POST') return json({});
    if (url.pathname.endsWith('/forum_threads')) return json([]);
  }
  if (url.hostname === 'bobby.test' && url.pathname === '/api/okx-candles') return json({ candles: Array.from({ length: 100 }, (_, i) => ({ ts: Date.now() - (100 - i) * 3_600_000, open: 100 + i, close: 101 + i, low: 99 + i, high: 102 + i, volume: 10 })) });
  if (url.hostname === 'www.okx.com' && url.pathname.startsWith('/api/v5/public/')) return json({ data: [] });
  if ((url.hostname === 'api.openai.com' && url.pathname === '/v1/chat/completions') || (url.hostname === 'api.anthropic.com' && url.pathname === '/v1/messages')) {
    const system = url.hostname === 'api.openai.com' ? body.messages[0].content : body.system;
    const user = url.hostname === 'api.openai.com' ? body.messages[1].content : body.messages[0].content;
    providerCalls.push({ host: url.hostname, system, input: JSON.parse(user) });
    const p = phrases[language];
    const answer = system.includes('Your role is CIO:') ? { analysis: p.analysis, verdict: 'wait', direction: 'none', synthesis: { headline: p.headline, why: p.why, risk: p.risk, watch: p.watch, followUp: p.followUp, watchLevel: 0 }, ...(system.includes('Also return scenarios:') ? { scenarios: { confirm: p.analysis, invalidate: p.analysis } } : {}) } : { analysis: gate === 'failed' ? ({ en: 'You should buy now.', es: 'Debes comprar ahora.', pt: 'Você deveria comprar agora.', fr: 'Vous devriez acheter maintenant.', it: 'Dovresti comprare adesso.', de: 'Du solltest jetzt kaufen.' }[language]) : p.analysis };
    return json(url.hostname === 'api.openai.com' ? { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(answer) } }] } : { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(answer) }] });
  }
  unexpected.push(url.hostname + url.pathname);
  throw new Error('Unexpected local fixture request');
}) as typeof fetch;

async function post(body: Record<string, unknown>, stream = false, method = 'POST', origin = 'https://bobbyprotocol.xyz') {
  resetLlmSpendCache(); providerCalls = [];
  const response = { statusCode: 200, body: null as any, headers: {} as Record<string, string>, lines: '' , writableEnded: false, writableFinished: false,
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; },
    json(v: unknown) { this.body = v; this.writableEnded = true; this.writableFinished = true; return this; }, write(s: string) { this.lines += s; }, end() { this.writableEnded = true; this.writableFinished = true; }, on() {}, flushHeaders() {},
  };
  await handler({ method, body, headers: { origin, 'x-forwarded-for': '203.0.113.42', 'x-bobby-device': 'fixture-device-1234567890', 'x-bobby-platform': 'android', ...(stream ? { accept: 'application/x-ndjson' } : {}) } } as never, response as never);
  await Promise.resolve();
  return response;
}

try {
  for (language of DESK_LANGUAGES) {
    for (const primary of ['openai', 'anthropic']) {
      process.env.BOBBY_LLM_PRIMARY = primary;
      gate = 'allow';
      const r = await post({ symbol: 'BTC', question: 'A question in another language must not override the selected locale.', language });
      eq(r.statusCode, 200, `${language}/${primary}: actual handler accepts the language`);
      eq(appLocale(language), DESK_LOCALES[language], `${language}: canonical regional default`);
      eq(r.body.agents.synthesis.headline, phrases[language].headline, `${language}: exact localized fixture reaches the response`);
      eq(providerCalls.length, 3, `${language}: all three roles called`);
      ok(providerCalls.every(call => call.system.includes(`Write in ${DESK_LANGUAGE_NAMES[language]}.`)), `${language}: every provider prompt carries the selected language`);
    }
    const stream = await post({ symbol: 'BTC', question: 'Question', language }, true);
    const lines = stream.lines.trim().split('\n').map(line => JSON.parse(line));
    eq(lines.map(line => line.type), ['accepted', 'evidence', 'agent', 'agent', 'final'], `${language}: real NDJSON sequence`);
    eq(lines.at(-1).data.agents.synthesis.headline, phrases[language].headline, `${language}: stream keeps localized final text`);
    for (const [fixture, status, code, key, level] of [
      ['daily', 429, 'daily_limit', 'daily', 'rapido'], ['signinRead', 401, 'signin_required', 'signinRead', 'rapido'],
      ['readsUsed', 402, 'subscription_required', 'readsUsed', 'rapido'], ['signinLevel', 403, 'signin_required', 'signinLevel', 'profundo'],
      ['upgrade', 403, 'upgrade_required', 'upgrade', 'profundo'], ['exhausted', 403, 'level_exhausted', 'exhausted', 'profundo'],
      ['paused', 503, 'budget_paused', 'paused', 'rapido'], ['premiumPaused', 503, 'budget_paused', 'premiumPaused', 'profundo'],
    ] as const) {
      gate = fixture;
      const r = await post({ symbol: 'BTC', question: 'Question', language, level });
      eq([r.statusCode, r.body.code, r.body.error], [status, code, deskCopy(language, key)], `${language}: ${fixture} stays localized`);
      eq(providerCalls.length, 0, `${language}: refusal never calls a provider`);
    }
    gate = 'allow';
    for (const [body, code, key] of [
      [{ symbol: 'bad!', question: 'Question', language }, 'invalid_request', 'invalid'],
      [{ symbol: 'BTC', question: 'x'.repeat(1201), language }, 'question_too_long', 'tooLong'],
    ] as const) {
      const r = await post(body);
      eq([r.statusCode, r.body.code, r.body.error, providerCalls.length], [400, code, deskCopy(language, key), 0], `${language}: validation is localized before spending`);
    }
    const blockedOrigin = await post({ language }, false, 'POST', 'https://evil.test');
    eq([blockedOrigin.statusCode, blockedOrigin.body.error], [403, 'Origin not allowed'], `${language}: origin refusal is localized`);
    const blockedMethod = await post({ language }, false, 'DELETE');
    eq([blockedMethod.statusCode, blockedMethod.body.error], [405, 'Method not allowed'], `${language}: method refusal is localized`);
    const modelKey = process.env.OPENAI_API_KEY; const anthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    const unavailable = await post({ symbol: 'BTC', question: 'Question', language });
    eq([unavailable.statusCode, unavailable.body.error, providerCalls.length], [503, deskCopy(language, 'unavailable'), 0], `${language}: missing configuration is localized`);
    process.env.OPENAI_API_KEY = modelKey; process.env.ANTHROPIC_API_KEY = anthropicKey;
    gate = 'failed';
    const errorLog = console.error; console.error = () => {};
    try {
      const r = await post({ symbol: 'BTC', question: 'Question', language });
      eq([r.statusCode, r.body.code, r.body.error, 'agents' in r.body], [503, 'analysis_failed', deskCopy(language, 'failed'), false], `${language}: rejected output never publishes a verdict`);
    } finally { console.error = errorLog; }
    gate = 'allow';
    const now = Date.parse('2026-10-07T12:00:00Z');
    const ctx = readerContext({ enabled: true, prefs: {}, thisAsset: { asks: 2, asksThisWeek: 1, lastAskedAt: '2026-10-05T12:00:00Z', lastHorizon: null }, top: [] } as never, 'BTC', now, null, null, language);
    eq(ctx?.thisAsset?.lastAskedOn, new Intl.DateTimeFormat(DESK_LOCALES[language], { weekday: 'long', timeZone: 'UTC' }).format(new Date('2026-10-05T12:00:00Z')), `${language}: memory weekday uses the same locale`);
  }
  gate = 'allow';
  const unknown = await post({ symbol: 'BTC', question: 'Question', language: 'ja' });
  eq([unknown.statusCode, unknown.body.code, providerCalls.length], [400, 'invalid_request', 0], 'unknown languages are rejected, never silently answered in English');
  const defaultLanguage = await post({ symbol: 'BTC', question: 'Question' });
  eq([defaultLanguage.statusCode, providerCalls.every(c => c.system.includes('Write in English.'))], [200, true], 'omitted language preserves the English default');
  const evidence = { symbol: 'BTC', technicals: { price: 100 }, provenance: { provider: 'OKX', instrument: 'BTC-USDT', assetType: 'crypto', timeframe: '1H', asOf: new Date().toISOString() }, timeframes: { '1H': { price: 100 }, '4H': { price: 100 }, '1D': { price: 100 } } } as never;
  for (language of ['fr', 'it', 'de'] as const) {
    providerCalls = [];
    const result = await runDeskDebate('Question', evidence, language, { level: 'maximo' });
    eq(providerCalls.length, 4, `${language}: Maximum includes localized rebuttal`);
    eq(result.agents.scenarios?.confirm, phrases[language].analysis, `${language}: scenarios use the fixture language`);
    ok(providerCalls.every(c => c.system.includes(`Write in ${DESK_LANGUAGE_NAMES[language]}.`)), `${language}: every Maximum role carries the locale`);
  }
  for (const [question, horizon] of [
    ["Et aujourd’hui ?", 'intraday'], ['Et la semaine prochaine ?', 'week'], ['Ce mois-ci ?', 'month'], ['Sur plusieurs années ?', 'long'],
    ['E oggi?', 'intraday'], ['La prossima settimana?', 'week'], ['Questo mese?', 'month'], ['Nei prossimi anni?', 'long'],
    ['Und heute?', 'intraday'], ['Nächste Woche?', 'week'], ['Diesen Monat?', 'month'], ['In den nächsten Jahren?', 'long'],
  ] as const) eq(horizonOf(question.replace('’', "'"), question.startsWith('Et ') || question.startsWith('Ce ') || question.startsWith('Sur ') ? 'fr' : question.startsWith('E ') || question.startsWith('La ') || question.startsWith('Questo ') || question.startsWith('Nei ') ? 'it' : 'de'), horizon, `${question}: horizon recognition`);
  for (const [text, violation] of [
    ['Les rendements sont garantis.', 'guarantee'], ['Un rendement garanti avec cette entrée.', 'guarantee'], ['Cette entrée est sans risque.', 'guarantee'],
    ['Vous devriez acheter maintenant.', 'advice'], ['Je recommande d’acheter BTC.', 'advice'], ['Achetez BTC maintenant.', 'advice'],
    ['Les rendements garantis n’existent pas.', null], ['Il ne faut pas acheter ici; la thèse reste conditionnelle.', null],
    ['Les profits ne sont pas garantis, mais cette entrée est sans risque.', 'guarantee'],
    ['Profitti garantiti con questa entrata.', 'guarantee'], ['È senza rischio.', 'guarantee'], ['Dovresti comprare ora.', 'advice'], ['Ti consiglio di vendere BTC.', 'advice'], ['Compra BTC adesso.', 'advice'],
    ['Non ci sono profitti garantiti.', null], ['I profitti garantiti non esistono.', null], ['Non dovresti comprare soltanto per questa analisi.', null],
    ['Garantierte Gewinne mit diesem Einstieg.', 'guarantee'], ['Der Einstieg ist risikofrei.', 'guarantee'], ['Du solltest jetzt kaufen.', 'advice'], ['Ich empfehle dir, BTC zu verkaufen.', 'advice'], ['Kaufen Sie BTC jetzt.', 'advice'],
    ['Garantierte Gewinne gibt es nicht.', null], ['Du solltest nicht kaufen.', null], ['Der risikofreie Zinssatz ist eine Referenz.', null],
    ['Un levier de 3x.', 'advice'], ['Una leva di 3x.', 'advice'], ['Ein Hebel von 3x.', 'advice'],
  ] as const) eq(publicTextViolation(text), violation, `bounded output guard: ${text}`);
  for (const text of ['Le verdict est attendre.', 'Il verdetto è attendere.', 'Das Urteil ist warten.', 'O veredito é esperar.']) {
    reviewDeskOutput({ alpha: phrases.en.analysis, red: phrases.en.analysis, cio: text, verdict: 'wait', direction: 'none' }); checks++;
    assert.throws(() => reviewDeskOutput({ alpha: phrases.en.analysis, red: phrases.en.analysis, cio: text, verdict: 'review', direction: 'long' }), DeskOutputRejected); checks++;
  }
  eq(unexpected, [], 'every request stayed inside the declared HTTP doubles');
  console.log(`desk-six-languages: ${checks} checks passed`);
} finally { globalThis.fetch = originalFetch; }
