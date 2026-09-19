// The native desk's evidence and answer rules, through the real handlers:
//   · stocks read Yahoo 1mo at 1h through the real /api/stock-candles handler,
//     fed Yahoo-shaped payloads (7 hourly bars per regular session plus a
//     closing/live point): closed week, live session, half-day, a null bar;
//   · evidence needs ≥ 59 bars (a real 50-EMA) for stocks and crypto, and a
//     rising chart is no longer forced to 'lateral';
//   · post-generation check: guarantee / risk-free / personal buy-sell claims
//     (EN/ES) and verdicts contradicting the CIO fail the analysis — while the
//     desk's ordinary disclaimers pass;
//   · the question limit is measured in code points, with its own 400 code;
//     an exhausted quota is a distinct 429 'daily_limit' (EN/ES).
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-model';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
const { loadDeskEvidence, runDeskDebate, reviewDeskOutput, DeskOutputRejected, MIN_DESK_BARS, DESK_QUESTION_MAX } = await import('../api/_lib/desk-debate.ts');
const { default: deskHandler } = await import('../api/desk-debate.ts');
const { default: stockCandles } = await import('../api/stock-candles.ts');

const original = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
let checks = 0;
function eq(got: unknown, want: unknown, what: string) { assert.deepEqual(got, want, what); checks++; }
function ok(value: unknown, what: string) { assert.ok(value, what); checks++; }
const H = 3600, DAY = 86_400;

// ---------- Yahoo-shaped fixtures ----------
// A regular session has hourly bars at 09:30 … 15:30 ET (7 bars; a half-day
// 5). Yahoo appends the session's closing point (16:00) to a closed window,
// or the current price as its own row while the session is live.
interface Session { bars: number; live?: number }
function yahooChart(sessions: Session[], opts: { nullAt?: number } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const timestamp: number[] = [], close: Array<number | null> = [];
  const last = sessions.length - 1;
  sessions.forEach((session, s) => {
    // Sessions end one day apart, the last one ending "now" (live) or 2 h ago (closed).
    const end = now - (last - s) * DAY - (session.live !== undefined ? 0 : 2 * H);
    const open = session.live !== undefined ? end - session.live * H - 20 * 60 : end - session.bars * H;
    for (let b = 0; b < session.bars; b++) timestamp.push(open + b * H);
    if (s === last) timestamp.push(session.live !== undefined ? now - 60 : open + 6.5 * H);
  });
  timestamp.forEach((_, i) => close.push(opts.nullAt === i ? null : 100 + i * 0.35 + Math.sin(i / 3) * 0.4));
  const quote = { close, open: close.map(c => c === null ? null : c - 0.1), high: close.map(c => c === null ? null : c + 0.5), low: close.map(c => c === null ? null : c - 0.5), volume: close.map(() => 1000) };
  return { chart: { result: [{ meta: { symbol: 'NVDA' }, timestamp, indicators: { quote: [quote] } }] } };
}
const week = (n: number, bars = 7): Session[] => Array.from({ length: n }, () => ({ bars }));

/** fetch: the desk → the real stock-candles handler → a Yahoo fixture. */
function yahooWorld(chart: unknown) {
  const seen: { desk: string[]; yahoo: string[] } = { desk: [], yahoo: [] };
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'query1.finance.yahoo.com') { seen.yahoo.push(url.pathname + url.search); return json(chart); }
    if (url.pathname === '/api/stock-candles') {
      seen.desk.push(url.pathname + url.search);
      let status = 200, body: unknown = null;
      const res = { setHeader() {}, status(n: number) { status = n; return this; }, json(v: unknown) { body = v; return this; } };
      await stockCandles({ method: 'GET', query: Object.fromEntries(url.searchParams) } as never, res as never);
      return json(body, status);
    }
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
  return seen;
}

try {
  eq(MIN_DESK_BARS, 59, 'a 50-EMA needs 59 bars for 10 points');

  // Closed week (Saturday read): 22 sessions × 7 + closing point.
  {
    const seen = yahooWorld(yahooChart(week(22)));
    const evidence = await loadDeskEvidence('NVDA', 'equity');
    eq(seen.desk, ['/api/stock-candles?symbol=NVDA&range=30d&interval=1h'], 'the desk asks for 30d at 1h');
    eq(seen.yahoo, ['/v8/finance/chart/NVDA?range=1mo&interval=1h'], 'stock-candles maps it to Yahoo 1mo/1h');
    eq([evidence.provenance.provider, evidence.provenance.instrument, evidence.provenance.timeframe], ['Yahoo Finance', 'NVDA', '1H'], 'one instrument, one timeframe');
    eq(evidence.technicals.trend, 'alcista', 'a rising chart reads as a trend, not a forced lateral');
  }
  // Live session at 13:00 ET: 21 closed sessions + 3 bars so far + the live row.
  {
    yahooWorld(yahooChart([...week(21), { bars: 4, live: 3.5 }]));
    const evidence = await loadDeskEvidence('NVDA', 'equity');
    ok(evidence.technicals.ema50 !== null, 'intraday partial session: evidence accepted');
  }
  // Right after the open: 21 closed sessions + one bar + live row.
  {
    yahooWorld(yahooChart([...week(21), { bars: 1, live: 0.3 }]));
    ok((await loadDeskEvidence('NVDA', 'equity')).technicals.price, 'first minutes of a session: evidence accepted');
  }
  // Half-day inside the window (5 bars), then normal sessions.
  {
    yahooWorld(yahooChart([...week(10), { bars: 5 }, ...week(10)]));
    ok((await loadDeskEvidence('NVDA', 'equity')).technicals.price, 'a half-day in the window: evidence accepted');
  }
  // One null bar (stock-candles drops it) does not sink the window.
  {
    yahooWorld(yahooChart(week(22), { nullAt: 40 }));
    ok((await loadDeskEvidence('NVDA', 'equity')).technicals.price, 'a null bar: evidence accepted');
  }
  // What the old 7d window could at most return — 7 × 7 + closing point = 50 —
  // and its live-session shape (6 × 7 + 4 + live = 47) are refused, not
  // analysed into a forced 'lateral'.
  for (const [what, sessions] of [['closed 7d week (50 bars)', week(7)], ['live 7d week (47 bars)', [...week(6), { bars: 4, live: 3.5 }]]] as const) {
    yahooWorld(yahooChart(sessions as Session[]));
    await assert.rejects(loadDeskEvidence('NVDA', 'equity'), /Insufficient market evidence/, what); checks++;
  }
  // Crypto (OKX, 100 bars asked): the same 59-bar floor.
  {
    const bars = (n: number) => Array.from({ length: n }, (_, i) => ({ ts: (Date.now() - (n - i) * H * 1000), open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 500 }));
    const urls: string[] = [];
    globalThis.fetch = (async (input: string | URL) => { urls.push(String(input)); return json({ candles: bars(58) }); }) as typeof fetch;
    await assert.rejects(loadDeskEvidence('BTC', 'crypto'), /Insufficient market evidence/, '58 crypto bars refused'); checks++;
    ok(urls[0].includes('/api/okx-candles?instId=BTC-USDT&bar=1H&limit=100'), 'crypto reads OKX 1H × 100');
    globalThis.fetch = (async () => json({ candles: bars(59) })) as typeof fetch;
    eq((await loadDeskEvidence('BTC', 'crypto')).technicals.trend, 'alcista', '59 crypto bars: a real 50-EMA trend');
  }

  // ---------- post-generation check ----------
  const base = { alpha: 'The recent structure supports a conditional opportunity above support.', red: 'The move could fail if volume fades; the invalidation is below support.', cio: 'The evidence is mixed, so the thesis needs confirmation before it deserves review.', verdict: 'review' as const, direction: 'long' as const };
  const rejected = (patch: Partial<typeof base>, reason: string, what: string) => {
    assert.throws(() => reviewDeskOutput({ ...base, ...patch }), (error: unknown) => error instanceof DeskOutputRejected && error.reason === reason, what); checks++;
  };
  const passes = (patch: Partial<typeof base>, what: string) => { assert.doesNotThrow(() => reviewDeskOutput({ ...base, ...patch }), what); checks++; };
  rejected({ alpha: 'This setup offers a guaranteed return of 20% if support holds.' }, 'guarantee', 'EN guaranteed return');
  rejected({ red: 'Even the downside case is risk-free because support is strong.' }, 'guarantee', 'EN risk-free claim');
  rejected({ cio: 'Your capital is protected by the strong bullish structure.' }, 'guarantee', 'EN capital protected');
  rejected({ alpha: 'It is a sure bet on the next leg higher.' }, 'guarantee', 'EN sure bet');
  rejected({ alpha: 'La tendencia garantiza ganancias en las próximas horas.' }, 'guarantee', 'ES garantiza ganancias');
  rejected({ alpha: 'Es una ganancia segura si rompe la resistencia.' }, 'guarantee', 'ES ganancia segura');
  rejected({ cio: 'Si rompe la resistencia, la ganancia está garantizada para una tesis larga.' }, 'guarantee', 'ES ganancia está garantizada');
  rejected({ red: 'Entrar aquí es sin riesgo porque el soporte aguanta.' }, 'guarantee', 'ES sin riesgo');
  rejected({ cio: 'Tu capital está protegido con esta estructura alcista.' }, 'guarantee', 'ES capital protegido');
  rejected({ alpha: 'You should buy NVDA before the close while RSI is neutral.' }, 'advice', 'EN you should buy');
  rejected({ alpha: 'The trend is intact. Buy now while momentum lasts.' }, 'advice', 'EN imperative buy now');
  rejected({ cio: 'I recommend you sell into this bullish strength.' }, 'advice', 'EN I recommend you sell');
  rejected({ alpha: 'Deberías comprar antes de la apertura, la tendencia es alcista.' }, 'advice', 'ES deberías comprar');
  rejected({ red: 'Te recomiendo vender si pierde el soporte.' }, 'advice', 'ES te recomiendo vender');
  rejected({ alpha: 'La estructura es alcista. ¡Compra ya antes de que suba!' }, 'advice', 'ES compra ya');
  rejected({ cio: 'My verdict is wait: the evidence is mixed and a long needs confirmation.' }, 'verdict', 'CIO text says wait, verdict says review');
  rejected({ cio: 'Mi veredicto es esperar; una tesis larga necesita confirmación.' }, 'verdict', 'ES veredicto esperar vs review');
  rejected({ cio: 'The structure is bearish and a short thesis is the only one the evidence supports.' }, 'verdict', 'direction long against a purely bearish CIO');
  rejected({ cio: 'La estructura es alcista y solo respalda una tesis larga.', direction: 'short' }, 'verdict', 'direction short against a purely bullish CIO');
  passes({ alpha: 'There is no guarantee this level holds, and no trade is risk-free.' }, 'EN disclaimers pass');
  passes({ red: 'Nothing here guarantees profits, and past moves do not guarantee future returns.' }, 'EN negated guarantees pass');
  passes({ cio: 'Whether you should buy depends on your own plan; this desk gives no personal advice. A long needs confirmation.' }, 'EN whether-you-should passes');
  passes({ alpha: 'Compared with the risk-free rate the move is small, but the uptrend is intact.' }, 'risk-free rate is a finance term');
  passes({ red: 'No hay garantía de ganancias; ninguna operación es sin riesgo.' }, 'ES disclaimers pass');
  passes({ red: 'Operar sin riesgo definido es peligroso: el stop debe ir bajo el soporte.' }, 'ES sin riesgo definido passes');
  passes({ cio: 'No deberías comprar solo por este análisis; la tesis larga necesita confirmación.' }, 'ES negated advice passes');
  passes({ cio: 'The short-term trend is bearish, but the long-term structure is bullish enough for a conditional long review.' }, 'mixed wording with the same-side term passes');
  passes({ cio: 'The verdict is to review the conditional long once volume confirms.' }, 'verdict wording that agrees passes');

  // runDeskDebate: 'wait' carries no direction; a rejected answer is no answer.
  const evidence = { symbol: 'BTC', technicals: { price: 100 }, provenance: { provider: 'OKX', instrument: 'BTC-USDT', assetType: 'crypto', timeframe: '1H', asOf: new Date().toISOString() } } as never;
  const model = (cio: Record<string, unknown>) => {
    let n = 0;
    globalThis.fetch = (async () => json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(++n === 3 ? cio : { analysis: n === 1 ? base.alpha : base.red }) } }] })) as typeof fetch;
  };
  model({ analysis: 'The evidence does not support a clear case yet; wait for confirmation.', verdict: 'wait', direction: 'long' });
  eq((await runDeskDebate('Is this trend real?', evidence, 'en')).agents.direction, 'none', "'wait' is returned with direction none");
  model({ analysis: 'The trend is strong and the return is guaranteed if support holds, so a long merits review.', verdict: 'review', direction: 'long' });
  await assert.rejects(runDeskDebate('Is this trend real?', evidence, 'en'), (error: unknown) => error instanceof DeskOutputRejected, 'a guarantee in the CIO fails the debate'); checks++;

  // ---------- handler: codes, length in code points, quota ----------
  const request = (body: Record<string, unknown>, ip: string) => ({ method: 'POST', headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': ip }, body });
  async function post(body: Record<string, unknown>, ip = '10.8.0.1') {
    const res = { statusCode: 200, body: null as any, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; return this; } };
    await deskHandler(request(body, ip) as never, res as never);
    return res;
  }
  let quotaCalls = 0;
  const quotaAnswer = { value: false as unknown, rows: [] as unknown[] };
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('rpc/bobby_consume_desk_quota')) { quotaCalls++; return json(quotaAnswer.value); }
    if (url.includes('bobby_desk_quotas?')) return json(quotaAnswer.rows);
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
  eq(DESK_QUESTION_MAX, 1200, 'the app and the server share one limit');
  const emoji = '📈'.repeat(700);
  ok(emoji.length > DESK_QUESTION_MAX && Array.from(emoji).length === 700, 'fixture: 700 code points, 1400 UTF-16 units');
  const allowed = await post({ symbol: 'NVDA', question: emoji });
  eq([allowed.statusCode, allowed.body.code, quotaCalls], [429, 'daily_limit', 1], '700 emoji pass the length check (then meet the exhausted quota)');
  for (const [question, what] of [['a'.repeat(1201), '1201 ASCII'], ['📈'.repeat(1201), '1201 emoji'], ['x'.repeat(50_000), '50k characters']] as const) {
    const res = await post({ symbol: 'NVDA', question, language: 'es' });
    eq([res.statusCode, res.body.code, res.body.maxLength], [400, 'question_too_long', 1200], `${what}: distinct too-long code`);
    ok(/demasiado larga/.test(res.body.error), `${what}: Spanish copy`);
  }
  eq(quotaCalls, 1, 'a too-long question never touches the quota');
  const exact = await post({ symbol: 'NVDA', question: 'é'.repeat(1200) });
  eq(exact.body.code, 'daily_limit', 'exactly 1,200 code points is allowed');
  const invalid = await post({ symbol: 'nvda!', question: 'Is this real?', language: 'es' });
  eq([invalid.statusCode, invalid.body.code], [400, 'invalid_request'], 'a malformed request keeps its own code');

  quotaAnswer.rows = [{ key: 'global', hits: 601, expires_at: new Date(Date.now() + 5 * H * 1000).toISOString() }, { key: 'caller:x', hits: 3, expires_at: new Date(Date.now() + 20 * H * 1000).toISOString() }];
  const en = await post({ symbol: 'NVDA', question: 'Is this real?' });
  eq([en.statusCode, en.body.code, en.body.error], [429, 'daily_limit', "Bobby reached today's analysis limit. Try again tomorrow."], 'EN daily-limit message');
  ok(Math.abs(Number(en.headers['retry-after']) - 5 * H) < 5, 'Retry-After is the exhausted window, not an hour');
  const es = await post({ symbol: 'NVDA', question: '¿Es real?', language: 'es' });
  eq(es.body.error, 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.', 'ES daily-limit message');
  ok(!('agents' in es.body), 'no verdict on a refused request');

  quotaAnswer.value = true;
  model({ analysis: 'Deberías comprar ya: la tendencia larga sigue.', verdict: 'review', direction: 'long' });
  const quotaOk = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('rpc/bobby_consume_desk_quota')) return json(true);
    if (url.includes('/api/okx-candles')) return json({ candles: Array.from({ length: 100 }, (_, i) => ({ ts: Date.now() - (100 - i) * H * 1000, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 5 })) });
    return quotaOk(input, init);
  }) as typeof fetch;
  const errors: string[] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };
  const failed = await post({ symbol: 'BTC', question: 'Should I buy?', language: 'es' });
  console.error = originalError;
  eq([failed.statusCode, failed.body.code, 'agents' in failed.body], [503, 'analysis_failed', false], 'a rejected model answer is a failed analysis, no verdict');
  ok(errors.some(line => line.includes('[desk-debate] model output rejected advice')) && !errors.some(line => line.includes('Deberías') || line.includes('Should I buy')), 'only the rejection class is logged');
  console.log(`desk-debate: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
}
