// The native desk's evidence and answer rules, through the real handlers:
//   · stocks read Yahoo 1mo at 1h through the real /api/stock-candles handler,
//     fed Yahoo-shaped payloads (7 hourly bars per regular session plus a
//     closing/live point): closed week, live session, half-day, a null bar;
//   · evidence needs ≥ 59 bars (a real 50-EMA) for stocks and crypto, and a
//     rising chart is no longer forced to 'lateral';
//   · a daily chart asked for by name reads Yahoo 3mo at 1d through the same
//     handler, beside the hourly evidence, and leads the read (the detector and
//     every other path: scripts/test-desk-timeframe.mts);
//   · post-generation check: guarantee / risk-free / personal buy-sell claims
//     (six languages) and verdicts contradicting the CIO fail the analysis —
//     while the desk's ordinary disclaimers pass; every pattern stays linear;
//   · the question limit is measured in code points, with its own 400 code;
//     an exhausted quota is a distinct 429 'daily_limit' (EN/ES);
//   · quota identities: an IPv4 address or IPv6 /64 per caller, the /24 or
//     /48 around it per network, both salted hashes, never an address.
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-model';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
const { loadDeskEvidence, loadDeskEvidenceFor, timeframeRequestOf, runDeskDebate, reviewDeskOutput, publicTextViolation, DeskOutputRejected, GUARD_PATTERNS, MIN_DESK_BARS, DESK_QUESTION_MAX } = await import('../api/_lib/desk-debate.ts');
const { default: deskHandler } = await import('../api/desk-debate.ts');
const { default: stockCandles } = await import('../api/stock-candles.ts');
const { getClientQuotaKeys, getClientIpKey } = await import('../api/_lib/rate-limit.ts');

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
/** Yahoo at 1d: one bar per session, stamped at the session's open; the last session closed 2 h ago. */
function yahooDaily(sessions: number, symbol = 'NVDA') {
  const lastOpen = Math.floor(Date.now() / 1000) - 8.5 * H;
  const timestamp = Array.from({ length: sessions }, (_, i) => lastOpen - (sessions - 1 - i) * DAY);
  const close = timestamp.map((_, i) => 400 + i * 1.5);
  const quote = { close, open: close.map(c => c - 1), high: close.map(c => c + 2), low: close.map(c => c - 2), volume: close.map(() => 1_000_000) };
  return { chart: { result: [{ meta: { symbol, currency: 'USD', fullExchangeName: 'NasdaqGS' }, timestamp, indicators: { quote: [quote] } }] } };
}

/** fetch: the desk → the real stock-candles handler → a Yahoo fixture (`daily` answers the 1d interval). */
function yahooWorld(chart: unknown, daily: unknown = chart) {
  const seen: { desk: string[]; yahoo: string[] } = { desk: [], yahoo: [] };
  globalThis.fetch = (async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'query1.finance.yahoo.com') { seen.yahoo.push(url.pathname + url.search); return json(url.searchParams.get('interval') === '1d' ? daily : chart); }
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
  // A daily chart asked for by name: 3mo at 1d through the same handler, beside the hourly evidence.
  {
    eq(timeframeRequestOf('¿Cómo ves NVDA en diario?'), ['1D'], 'the question names the daily chart');
    const seen = yahooWorld(yahooChart(week(22)), yahooDaily(63));
    const hourly = await loadDeskEvidence('NVDA', 'equity');
    const evidence = await loadDeskEvidenceFor('NVDA', 'equity', 'v1', ['1D']);
    eq(seen.desk.slice(1), ['/api/stock-candles?symbol=NVDA&range=30d&interval=1h', '/api/stock-candles?symbol=NVDA&range=90d&interval=1d'], 'the desk asks for 90d at 1d beside 30d at 1h');
    eq(seen.yahoo.slice(1), ['/v8/finance/chart/NVDA?range=1mo&interval=1h', '/v8/finance/chart/NVDA?range=3mo&interval=1d'], 'stock-candles maps it to Yahoo 3mo/1d');
    eq([evidence.provenance.provider, evidence.provenance.instrument, evidence.provenance.timeframe, evidence.provenance.currency, evidence.provenance.exchange], ['Yahoo Finance', 'NVDA', '1D', hourly.provenance.currency, hourly.provenance.exchange], 'the same instrument, named as daily');
    eq([evidence.technicals.price, evidence.technicals.support, evidence.technicals.resistance, evidence.technicals.trend], [493, 447.5, 495, 'alcista'], 'price, support, resistance and trend are the daily block\'s');
    // The session's bar is stamped at its open, 8.5 h ago; its numbers are as recent as the hourly evidence.
    eq(evidence.provenance.asOf, hourly.provenance.asOf, 'asOf is the last point of that session, not its open');
    eq((evidence as any).timeframes['1H'], hourly.technicals, 'the hourly block stays as context');
    // Another listing's daily bars are never read as this instrument's.
    yahooWorld(yahooChart(week(22)), yahooDaily(63, 'NVDL'));
    eq((await loadDeskEvidenceFor('NVDA', 'equity', 'v1', ['1D'])).provenance.timeframe, '1H', 'a mismatched daily series is refused: the hourly evidence leads');
    // 3mo can hold fewer sessions than a 50-EMA trend needs: the block says so, never 'lateral'.
    yahooWorld(yahooChart(week(22)), yahooDaily(55));
    const thin = await loadDeskEvidenceFor('NVDA', 'equity', 'v1', ['1D']);
    eq([thin.provenance.timeframe, thin.technicals.trend, (thin.technicals as any).bars], ['1D', 'insufficient_history', 55], '55 daily bars: insufficient history, not a sideways trend');
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
  // Six languages: ordinary risk disclaimers pass, "no risk" promises do not (review VOICE-5).
  for (const disclaimer of [
    "Cette entrée est loin d'être sans risque.", "Rien n'est sans risque.", 'Cette analyse est sans gains garantis.', 'Le taux sans risque reste élevé.', "Aucun investissement n'est sans risque.",
    'Ein Einstieg hier ist nie ohne Risiko.', 'Das ist keineswegs risikofrei.', 'Das ist alles andere als risikofrei.', 'Keiner dieser Einstiege ist risikofrei.',
    "Questa entrata è tutt'altro che senza rischio.", 'Nessun investimento è senza rischio.', 'Non esiste mai un guadagno senza rischi.',
    'Nenhum investimento é sem risco.', 'Não há mais lucros garantidos.', 'Lucros garantidos não existem.', 'Esta entrada está longe de ser sem risco.',
  ]) passes({ red: disclaimer }, `disclaimer passes: ${disclaimer}`);
  for (const promise of [
    'Cet achat est sans aucun risque.', 'Cet achat est sans risque.', 'Des gains sans risques.',
    'Dieser Einstieg ist ohne Risiko.', 'Dieser Kauf ist risikofrei.', 'Ein Kauf ohne jegliches Risiko.',
    'Questo acquisto è senza rischio.', 'Un guadagno senza rischi.', 'Un acquisto senza nessun rischio.',
    'Esta compra é sem risco.', 'Uma compra sem nenhum risco.', 'Ganhos sem riscos.', 'Esta compra es sin ningún riesgo.',
  ]) rejected({ alpha: promise }, 'guarantee', `no-risk promise rejected: ${promise}`);
  rejected({ alpha: 'Achète aujourd’hui.' }, 'advice', 'FR imperative with the real spelling of aujourd’hui');
  // The added languages never change an English answer: "car" is a noun here, not the French conjunction.
  passes({ red: 'No car maker is risk-free.' }, 'EN disclaimer about car makers stays a disclaimer');
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
  passes({ alpha: 'There is no guarantee this level holds, and no trade is risk-free.' }, 'EN disclaimers pass');
  passes({ red: 'Nothing here guarantees profits, and past moves do not guarantee future returns.' }, 'EN negated guarantees pass');
  passes({ cio: 'Whether you should buy depends on your own plan; this desk gives no personal advice. A long needs confirmation.' }, 'EN whether-you-should passes');
  passes({ alpha: 'Compared with the risk-free rate the move is small, but the uptrend is intact.' }, 'risk-free rate is a finance term');
  passes({ red: 'No hay garantía de ganancias; ninguna operación es sin riesgo.' }, 'ES disclaimers pass');
  passes({ red: 'Operar sin riesgo definido es peligroso: el stop debe ir bajo el soporte.' }, 'ES sin riesgo definido passes');
  passes({ cio: 'No deberías comprar solo por este análisis; la tesis larga necesita confirmación.' }, 'ES negated advice passes');
  passes({ cio: 'The short-term trend is bearish, but the long-term structure is bullish enough for a conditional long review.' }, 'mixed wording with the same-side term passes');
  passes({ cio: 'The verdict is to review the conditional long once volume confirms.' }, 'verdict wording that agrees passes');
  // Ordinary wording that must never cost a quota unit and three model calls
  // (review of 2386571: each of these returned 503 analysis_failed).
  passes({ alpha: 'Sugiero comprobar si el volumen confirma la ruptura antes de sacar conclusiones.' }, 'ES sugiero comprobar is not advice');
  passes({ red: 'Recomiendo comprobar el contexto macro; el RSI solo no basta.' }, 'ES recomiendo comprobar is not advice');
  passes({ cio: 'Te recomiendo comprender que el RSI no es una señal por sí solo; la tesis larga necesita volumen.' }, 'ES te recomiendo comprender is not advice');
  passes({ red: 'I suggest short-term caution until volume confirms the breakout.' }, 'EN I suggest short-term caution is not advice');
  passes({ red: 'Sell volume today exceeded buy volume. That weakens the breakout.' }, 'EN "Sell volume today…" is data, not an order');
  passes({ alpha: 'Compra neta hoy superó a la venta, lo que apoya la ruptura.' }, 'ES "Compra neta hoy…" is data, not an order');
  passes({ red: 'Guaranteed returns do not exist in markets, and this setup is no exception.' }, 'EN guaranteed returns negated afterwards');
  passes({ red: 'A risk-free entry does not exist here; the stop must sit below support.' }, 'EN risk-free negated afterwards');
  passes({ red: 'Las ganancias garantizadas no existen; el stop debe ir bajo el soporte.' }, 'ES ganancias garantizadas negated afterwards');
  passes({ red: 'No indicator, however strong, guarantees returns.' }, 'a negation before a comma still negates');
  passes({ cio: 'Esperar permite observar sin riesgo de quedar atrapado en una ruptura falsa, así que una tesis larga merece revisión.' }, 'ES sin riesgo de quedar atrapado is not a claim');
  passes({ cio: "The Red Team's bearish points on fading volume are fair, but price holds above both averages, so a conditional upside idea merits review." }, "a long review may cite the Red Team's bearish points");
  passes({ cio: "The Red Team's bearish case is fair, but price holds above both averages, so the idea merits review." }, "another agent's bearish case is not the CIO's thesis");
  passes({ cio: 'El precio se mantuvo débil a lo largo de la semana, así que una tesis corta merece revisión.', direction: 'short' }, 'ES "a lo largo de" is not a long thesis');
  passes({ cio: 'As long as price stays under the 50-EMA, the short thesis merits review.', direction: 'short' }, 'EN "as long as" is not a long thesis');
  passes({ cio: 'The rally falls short of resistance, so a short thesis merits review.', direction: 'short' }, 'EN "falls short" next to a short thesis');
  passes({ cio: 'A short thesis is not supported by this evidence; the conditional long merits review.' }, 'a negated opposite thesis passes');
  rejected({ alpha: 'Nothing is certain, but this is a guaranteed return if support holds.' }, 'guarantee', 'a negation does not reach across "but"');
  rejected({ alpha: 'It is a guaranteed return, not a gamble.' }, 'guarantee', 'a negation after the clause does not negate the claim');
  rejected({ red: 'Entrar aquí es sin riesgo de pérdida porque el soporte aguanta.' }, 'guarantee', 'ES sin riesgo de pérdida is still a claim');
  rejected({ alpha: 'Sugiero comprar antes del cierre si el volumen acompaña.' }, 'advice', 'ES sugiero comprar is advice');
  rejected({ alpha: 'Te recomiendo que vendas si pierde el soporte.' }, 'advice', 'ES te recomiendo que vendas is advice');
  rejected({ alpha: 'The trend is intact. Sell NVDA today before the close.' }, 'advice', 'EN imperative with a ticker');
  rejected({ alpha: 'The trend is intact. Buy the dip now.' }, 'advice', 'EN imperative buy the dip now');
  rejected({ red: 'I suggest shorting into strength.' }, 'advice', 'EN I suggest shorting');

  // Preflight of claude/build34 (probe guard-probe*.mts): ordinary weighing and
  // hedged disclaimers that the guard must never turn into analysis_failed.
  passes({ cio: 'Red Team makes a fair bearish case about fading volume, but price holds above both averages, so the idea merits review.' }, 'CIO names the bearish case, long review');
  passes({ cio: 'The bearish case rests on fading volume, but the upside idea merits review if 65,000 breaks.' }, 'bearish case named, upside idea');
  passes({ cio: 'Alpha makes a bullish case, but lower highs dominate; a downside scenario merits review below 63,800.', direction: 'short' }, 'bullish case named, short review');
  passes({ cio: 'El Red Team plantea una tesis bajista, pero el precio respeta ambas medias; la idea merece revisión si rompe 65,000.' }, 'ES tesis bajista named, long review');
  passes({ cio: 'Alpha plantea una tesis alcista, pero los máximos decrecientes pesan más; el escenario a la baja merece revisión.', direction: 'short' }, 'ES tesis alcista named, short review');
  passes({ cio: 'Weighing both, the bearish case is overstated; the uptrend deserves review with a stop under 63,800.' }, 'bearish case overstated, long review');
  passes({ alpha: 'Holding above the 50 EMA guarantees no gains; it only improves the odds.' }, 'guarantees no gains');
  passes({ red: 'Past performance guarantees no future returns.' }, 'guarantees no future returns');
  passes({ red: 'This setup is far from a sure bet.' }, 'far from a sure bet');
  passes({ red: 'It would be a mistake to call this a sure thing.' }, 'a mistake to call this a sure thing');
  passes({ red: 'Calling this risk-free would be wrong.' }, 'calling this risk-free would be wrong');
  passes({ alpha: 'Relative to Treasury yields, often treated as a risk-free benchmark, the move is modest.' }, 'risk-free benchmark is a finance term');
  passes({ cio: 'Esperar permite observar sin riesgos adicionales mientras el volumen confirma.' }, 'ES sin riesgos adicionales');
  passes({ red: 'Esto está lejos de ser una apuesta segura.' }, 'ES lejos de ser una apuesta segura');
  rejected({ alpha: 'This is a sure bet, far better than bonds.' }, 'guarantee', 'a sure bet with "far" elsewhere is still a claim');
  rejected({ alpha: 'Holding above the 50 EMA guarantees gains for the next session.' }, 'guarantee', 'guarantees gains is still a claim');

  // Two reviews of 2026-10-03: personal instructions and guarantees got through in French, Portuguese,
  // German and Italian (and one English form), in any role. A rejected answer fails the read, so the
  // same languages' disclaimers and ordinary analysis are pinned next to them.
  const roles = ['alpha', 'red', 'cio'] as const;
  [
    "Je te recommande d'acheter BTC maintenant", "Je vous conseille d'acheter BTC aujourd'hui", 'Tu dois acheter BTC',
    'Deves comprar BTC agora', 'Recomendo que compres BTC agora', 'Du solltest jetzt BTC kaufen', 'Ich empfehle dir, BTC zu kaufen',
    'Devi comprare BTC adesso', 'Ti consiglio di comprare BTC',
    // A negation or a hedge in another clause excuses nothing; "no doubt" is emphasis, not a negation.
    'Sans hésitation, tu dois acheter BTC', 'Senza dubbio, devi comprare BTC', 'Sans hésitation, vraiment, tu dois acheter BTC',
    "Rien n'est sûr mais tu dois acheter BTC.", 'Sem dúvida, deves comprar BTC.', 'Kein Zweifel, du solltest BTC kaufen.', 'No doubt you should buy BTC.',
    'It would be wrong to say otherwise, you should buy BTC now.', 'Not financial advice, you should buy BTC now.', 'No es consejo, deberías comprar BTC ya.',
    // Other forms of the same instruction: "de" + verb, an adverb, Portuguese tu.
    'Je te conseille de vendre BTC.', 'Tu devrais vraiment acheter.', 'Tens de comprar BTC agora.', 'Aconselho-te a comprar BTC.', 'Compra BTC agora.',
    // Any adverb before the verb, and Italian "acquistare" (the usual verb in this register).
    "Je vous recommande vivement d'acheter.", 'Je te recommande fortement de vendre.', 'Ti consiglio vivamente di comprare ETH.', 'Devi assolutamente comprare.', 'Dovresti acquistare BTC adesso.', 'Ti consiglio di acquistare ETH.',
  ].forEach((instruction, i) => rejected({ [roles[i % 3]]: instruction }, 'advice', `personal instruction rejected: ${instruction}`));
  [
    'Aucun doute, mais cet achat est sans risque', 'Ohne Zweifel ist das risikofrei',
    "Rien n'est sûr mais cet achat est sans risque.", 'Nichts ist sicher, aber das ist risikofrei.', 'Niente è certo, però questo è senza rischio.',
    'Keine Sorge, das ist risikofrei.', 'Sin duda es una apuesta segura.', 'No doubt this is risk-free.', 'Nothing is certain, this is risk-free.',
    "Il n'y a aucun doute que cet achat est sans risque.", 'No hay duda de que es una apuesta segura.', 'Non c’è dubbio che sia senza rischio.',
    'Não há dúvida de que é sem risco.', 'Es gibt keinen Zweifel, dass das risikofrei ist.',
    // Active and passive guarantees.
    'Cette stratégie garantit des profits', 'I rendimenti sono garantiti', 'Deine Gewinne sind garantiert', 'Os lucros estão garantidos', 'Gewinne garantiert', 'profit garanti',
    'Je vous garantis des profits.', 'Garantie totale sur vos gains.', 'Die Gewinne sind garantiert.', 'Garantierte Rendite.', 'Ohne Risiken.',
    'Il profitto è garantito.', 'Guadagno sicuro.', 'Questa strategia garantisce profitti.', 'Esta estratégia garante lucros.',
    'Votre capital est protégé.', 'Ihr Kapital ist geschützt.', 'Il tuo capitale è protetto.', 'Seu capital está protegido.', 'O teu capital está protegido.',
    // English: a hyphenated prefix is not a negation of the guarantee.
    'a non-negotiable, guaranteed profit', 'no-brainer: guaranteed returns', 'Guaranteed non-stop returns.', 'A no-loss setup with guaranteed returns.', "A can't-miss guaranteed profit.",
    // German attributive forms, and the Portuguese enclitic pronoun (pt-PT).
    'Das ist ein risikofreier Trade.', 'Eine risikolose Wette.', 'Esta operação garante-te lucro.', 'Garanto-te lucros com esta entrada.',
  ].forEach((promise, i) => rejected({ [roles[i % 3]]: promise }, 'guarantee', `guarantee rejected: ${promise}`));
  [
    "Ce n'est pas un conseil financier.", "Rien n'est garanti.", "Aucun rendement n'est garanti.", 'Keine Gewinne sind garantiert.', 'Nichts ist garantiert.',
    'Nessun rendimento è garantito.', 'Non è una raccomandazione.', 'Nenhum lucro está garantido.', 'Isto não é aconselhamento financeiro.',
    'No car maker is risk-free.', 'Nothing here is guaranteed.', 'Far from a sure bet.', 'No es una recomendación de compra.',
    'Les acheteurs défendent le support', 'Der Kurs könnte steigen, wenn das Volumen zunimmt',
    // The usual disclaimers of each language, next to the forms they must not be confused with.
    'Les rendements passés ne garantissent pas les rendements futurs.', 'Personne ne peut garantir des gains.', 'Aucune stratégie ne garantit des profits.',
    "Je ne te recommande pas d'acheter.", "Je te déconseille d'acheter maintenant.", "Ton capital n'est pas protégé.", 'Les acheteurs reprennent la main, mais le volume reste faible.',
    'I rendimenti passati non garantiscono rendimenti futuri.', 'Il rendimento non è garantito.', 'Non ti consiglio di comprare.', 'Il tuo capitale non è protetto.',
    'Vergangene Gewinne garantieren keine künftigen Gewinne.', 'Gewinne garantiert dir niemand.', 'Gewinne sind nicht garantiert.', 'Dein Kapital ist nicht geschützt.',
    // German sets a comma before a subordinate clause; the main clause's negation still governs it.
    'Es gibt keine Strategie, die Gewinne garantiert.', 'Das heißt nicht, dass dieser Einstieg risikofrei ist.',
    'Retornos passados não garantem retornos futuros.', 'O lucro não está garantido.', 'Não deves comprar apenas por esta análise.', 'O teu capital não está protegido.',
    // Portuguese "mais" is "more", not the French "but".
    'Mais uma vez não há lucro garantido.',
    // A comma-delimited aside does not end the clause, a thousands separator is no comma, and a prefix
    // hyphenated onto the claim itself does negate it.
    'No setup, however clean, is risk-free.', 'This is not, in any sense, a sure bet.', 'This is not a guarantee, or a sure bet.', 'No close above 65,000 is risk-free.', 'These are non-guaranteed returns.',
    'A non-zero risk remains on every entry.', 'No-one can promise guaranteed returns.', 'Risk-free trades are non-existent.', 'There is no question of guaranteed returns here.',
    'Sin duda no es una apuesta segura.', 'Nadie puede decir que la subida está garantizada.',
    // The risk-free rate is a term, not a promise; a negated attributive form or instruction is a disclaimer.
    'Der risikofreie Zins liegt bei 3 %.', 'Risikofreie Staatsanleihen rentieren mit 3 %.', 'Das ist kein risikofreier Einstieg.', 'Ninguém te garante lucros.', 'Não te garanto lucros.',
    "Je ne vous recommande vraiment pas d'acheter.", 'Non ti consiglio assolutamente di comprare.', 'Non dovresti acquistare solo per questo segnale.',
  ].forEach((fine, i) => passes({ [roles[i % 3]]: fine }, `disclaimer or analysis passes: ${fine}`));

  // Every guard pattern is linear. 2,000 adversarial characters take microseconds; the best of three runs is
  // asserted, so the limit measures the pattern and not a busy runner.
  {
    const fill = (unit: string, head = '') => (head + unit.repeat(Math.ceil(2000 / unit.length))).slice(0, 2000);
    const adversarial = [
      ...['a', ' ', 'a ', "d'", 'non-', ', ', 'garanti', 'garanti a a a ', 'garantit des ', 'garantiert dir ', 'garanzia di ', 'Gewinne sind ', 'rendimenti sono ', 'lucros estão ',
        'ton capital est ', 'dein Kapital ist ', 'il tuo capitale è ', 'o teu capital está ', 'je te ', 'je vous recommande de ', 'tu dois ', 'tens de ', 'recomendo que tu a ', 'Compra BTC ',
        'sans aucun ', 'without a ', 'no ', 'ohne zu ', 'du solltest ', 'far from a ', 'guaranteed x y ', 'profit garanti, ', 'no gains garantis '].map(unit => fill(unit)),
      fill(' ', 'garanti'), fill(' ', 'sans'), fill('a', 'garanti '), fill(' ', 'je te recommande'), fill(' ', 'Gewinne'), fill(' ', 'recomendo'),
    ];
    const bestOf3 = (run: () => unknown) => Math.min(...[0, 1, 2].map(() => { const started = performance.now(); run(); return performance.now() - started; }));
    ok(adversarial.every(text => text.length === 2000) && GUARD_PATTERNS.length > 0, 'fixture: 2,000-character strings against every guard pattern');
    for (const pattern of GUARD_PATTERNS) {
      const slowest = Math.max(...adversarial.map(text => bestOf3(() => text.match(pattern))));
      ok(slowest < 50, `linear pattern (${slowest.toFixed(2)} ms): ${pattern.source.slice(0, 70)}`);
    }
    const guard = Math.max(...adversarial.map(text => bestOf3(() => publicTextViolation(text))));
    ok(guard < 50, `the whole guard on 2,000 adversarial characters (${guard.toFixed(2)} ms)`);
    // One long clause of French "mais" before many claims: the turn scan is one pass per clause. It was quadratic
    // per match (about 0.6 s here and 39 s at 32,000 characters) while every single pattern stayed linear.
    const turns = ('mais '.repeat(800) + 'sans risque '.repeat(400)).slice(0, 8000);
    const turned = bestOf3(() => publicTextViolation(turns));
    ok(turns.length === 8000 && publicTextViolation(turns) === 'guarantee' && turned < 250, `8,000 characters of "mais" before claims (${turned.toFixed(1)} ms)`);
  }

  // runDeskDebate: 'wait' carries no direction; a rejected answer is no answer.
  const evidence = { symbol: 'BTC', technicals: { price: 100 }, provenance: { provider: 'OKX', instrument: 'BTC-USDT', assetType: 'crypto', timeframe: '1H', asOf: new Date().toISOString() } } as never;
  // The CIO's synthesis is part of its contract since 2026-09-29 (the reader sees it first).
  const synthesis = { headline: 'Not yet: the trend still needs confirmation.', why: 'Support held but volume is thin.', risk: 'A close below support breaks the case.', watch: 'A 1H close above resistance.', watchLevel: 0, followUp: 'What would confirm the BTC trend?' };
  const model = (cio: Record<string, unknown>) => {
    let n = 0;
    globalThis.fetch = (async () => json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(++n === 3 ? { synthesis, ...cio } : { analysis: n === 1 ? base.alpha : base.red }) } }] })) as typeof fetch;
  };
  model({ analysis: 'The evidence does not support a clear case yet; wait for confirmation.', verdict: 'wait', direction: 'long' });
  eq((await runDeskDebate('Is this trend real?', evidence, 'en')).agents.direction, 'none', "'wait' is returned with direction none");
  model({ analysis: 'The trend is strong and the return is guaranteed if support holds, so a long merits review.', verdict: 'review', direction: 'long' });
  await assert.rejects(runDeskDebate('Is this trend real?', evidence, 'en'), (error: unknown) => error instanceof DeskOutputRejected, 'a guarantee in the CIO fails the debate'); checks++;

  // ---------- handler: codes, length in code points, quota ----------
  const request = (body: Record<string, unknown>, ip: string) => ({ method: 'POST', headers: { origin: 'https://bobbyprotocol.xyz', 'x-forwarded-for': ip, 'x-bobby-device': 'device-1234567890abcdef' }, body });
  async function post(body: Record<string, unknown>, ip = '10.8.0.1') {
    const res = { statusCode: 200, body: null as any, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; return this; } };
    await deskHandler(request(body, ip) as never, res as never);
    return res;
  }
  // ---------- quota identities ----------
  const keysFor = (ip?: string) => getClientQuotaKeys({ headers: ip === undefined ? {} : { 'x-forwarded-for': ip } } as never);
  {
    const a = keysFor('203.0.113.7')!, b = keysFor('203.0.113.200')!, c = keysFor('203.0.114.7')!;
    ok(a.caller !== b.caller && a.network === b.network, 'IPv4: one caller per address, one network per /24');
    ok(a.network !== c.network, 'IPv4: another /24 is another network');
    eq(a.caller, getClientIpKey({ headers: { 'x-forwarded-for': '203.0.113.7' } } as never), 'IPv4 caller key is the existing per-address key');
    eq(keysFor('203.0.113.7, 10.0.0.1'), a, 'the first forwarded address is the client');
    eq(keysFor('::ffff:203.0.113.7'), a, 'IPv4-mapped IPv6 is the IPv4 caller');
    const v6 = keysFor('2001:db8:1:2::1')!;
    eq(keysFor('2001:db8:1:2:ffff:ffff:ffff:ffff'), v6, 'IPv6: every address in a /64 is one caller (no rotation)');
    eq(keysFor('2001:0DB8:0001:0002:0000:0000:0000:0009%en0'), v6, 'IPv6: expanded, upper-case and zoned forms are the same caller');
    const sibling = keysFor('2001:db8:1:3::1')!, far = keysFor('2001:db8:2:2::1')!;
    ok(sibling.caller !== v6.caller && sibling.network === v6.network, 'IPv6: another /64 in the same /48 is another caller on the same network');
    ok(far.network !== v6.network, 'IPv6: another /48 is another network');
    for (const key of [a.caller, a.network, v6.caller, v6.network]) ok(/^[0-9a-f]{24}$/.test(key), 'quota keys are 24-hex salted hashes');
    for (const bad of [undefined, 'unknown', 'not-an-ip', '203.0.113', '2001:db8::1::2', '']) eq(keysFor(bad), null, `no usable address (${JSON.stringify(bad)}) → null`);
  }

  let quotaCalls = 0;
  const quotaBodies: Array<Record<string, unknown>> = [];
  const quotaAnswer = { value: false as unknown, rows: [] as unknown[] };
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('rpc/bobby_consume_desk_quota')) { quotaCalls++; quotaBodies.push(JSON.parse(String(init?.body))); return json(quotaAnswer.value); }
    if (url.includes('bobby_desk_quotas?')) return json(quotaAnswer.rows);
    // The reader's own meter runs first; a daily-limit refusal gives that read back.
    if (url.includes('rpc/bobby_consume_read')) return json({ allowed: true, readId: 7, tier: 'anon', used: 1, limit: 3 });
    if (url.includes('bobby_reads?id=eq.')) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
  eq(DESK_QUESTION_MAX, 1200, 'the app and the server share one limit');
  const emoji = '📈'.repeat(700);
  ok(emoji.length > DESK_QUESTION_MAX && Array.from(emoji).length === 700, 'fixture: 700 code points, 1400 UTF-16 units');
  const allowed = await post({ symbol: 'NVDA', question: emoji });
  eq([allowed.statusCode, allowed.body.code, quotaCalls], [429, 'daily_limit', 1], '700 emoji pass the length check (then meet the exhausted quota)');
  eq(quotaBodies[0], { p_caller: keysFor('10.8.0.1')!.caller, p_network: keysFor('10.8.0.1')!.network }, 'the quota RPC gets caller + network hashes');
  ok(!JSON.stringify(quotaBodies[0]).includes('10.8.0'), 'no address reaches the database');
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
  const before = quotaCalls, anonymous = await post({ symbol: 'NVDA', question: 'Is this real?' }, 'unknown');
  eq([anonymous.statusCode, anonymous.body.code, quotaCalls], [503, 'desk_unavailable', before], 'no client address: fail closed before the quota and the model');

  quotaAnswer.rows = [{ key: 'global', hits: 601, expires_at: new Date(Date.now() + 5 * H * 1000).toISOString() }, { key: 'caller:x', hits: 3, expires_at: new Date(Date.now() + 20 * H * 1000).toISOString() }];
  const en = await post({ symbol: 'NVDA', question: 'Is this real?' });
  eq([en.statusCode, en.body.code, en.body.error], [429, 'daily_limit', "Bobby reached today's analysis limit. Try again tomorrow."], 'EN daily-limit message');
  ok(Math.abs(Number(en.headers['retry-after']) - 5 * H) < 5, 'Retry-After is the exhausted window, not an hour');
  quotaAnswer.rows = [{ key: 'net:x', hits: 60, expires_at: new Date(Date.now() + 7 * H * 1000).toISOString() }, { key: 'caller:x', hits: 29, expires_at: new Date(Date.now() + 20 * H * 1000).toISOString() }, { key: 'global', hits: 12, expires_at: new Date(Date.now() + 2 * H * 1000).toISOString() }];
  const network = await post({ symbol: 'NVDA', question: 'Is this real?' });
  ok(network.statusCode === 429 && Math.abs(Number(network.headers['retry-after']) - 7 * H) < 5, 'a network at exactly its ceiling is the exhausted window (refusals consume nothing)');
  const es = await post({ symbol: 'NVDA', question: '¿Es real?', language: 'es' });
  eq(es.body.error, 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.', 'ES daily-limit message');
  ok(!('agents' in es.body), 'no verdict on a refused request');

  quotaAnswer.value = true;
  model({ analysis: 'Deberías comprar ya: la tendencia larga sigue.', verdict: 'review', direction: 'long' });
  const quotaOk = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('rpc/bobby_consume_desk_quota')) return json(true);
    if (url.includes('rpc/bobby_consume_read')) return json({ allowed: true, readId: 88, tier: 'anon', used: 1, limit: 3, remaining: 2 });
    if (url.includes('bobby_reads?id=eq.') && init?.method === 'DELETE') return json([]);
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
  // The public-cycle guard (same patterns): the 2026-09-28 transcript that reached /protocol.
  for (const [text, want, what] of [
    ['Tras analizar el pulso, la mejor operación en este momento es abrir una posición corta (short) en BTC.', 'advice', 'a "best trade is to open" recommendation'],
    ['Utilizando un apalancamiento de **3x**, asegúrate de gestionar el riesgo.', 'advice', 'leverage, even in markdown'],
    ['Todo apunta abajo. Aprovecha esta oportunidad mientras dure.', 'advice', 'a sentence-initial call to act'],
    ['Você deveria comprar agora.', 'advice', 'Portuguese personal instruction'],
    ['Lucro garantido nessa entrada.', 'guarantee', 'Portuguese guarantee'],
    ['Não há lucro garantido; a tese é condicional.', null, 'a Portuguese disclaimer passes'],
    ['Una tesis bajista condicional: entrada de referencia 83,091, invalidación sobre 85,292.', null, 'a conditional thesis with levels passes'],
    ['A leverage flush could trigger a liquidity sweep below support.', null, 'market vocabulary is not sizing advice'],
    ['Mantén el capital a salvo y resiste la tentación de operar en medio de esta confusión.', null, 'a CIO abstention passes'],
  ] as const) eq(publicTextViolation(text), want, what);
  console.log(`desk-debate: ${checks} checks passed`);
} finally {
  globalThis.fetch = original;
}
