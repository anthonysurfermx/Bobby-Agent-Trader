// The next question, second pass (2026-10-08): data and cases both phones run, each against its own copy of the read
// model. ios/Bobby/Nucleo/tests/next-question.test.mjs and android/nucleo/tests/next-question.test.mjs call
// nextQuestionCases({ test, assert, RM, reply }), where reply(extra) is an ok reply of their fixtures.
//
// What the phone's own check let through when 90 hostile strings were run through it (the review of the Android
// port): act-shaped questions (invest, bet, a long or a short as a position, leverage, savings, "all in"), Bobby
// saying it saw, caught or tracked something for the reader, and a question about another asset's ticker.

// ---- The show rate. 73 questions a desk could plausibly write, in the six languages: all of them are shown. ----
export const PLAUSIBLE = {
  en: ['What would have to change for this read of NVDA to flip?', 'Why does the volume matter more than the trend in NVDA?', 'What is the weakest part of the bull case for NVDA?',
    'What would the bear say about NVDA right now?', 'Why is support holding for NVDA?', 'What risk is the market ignoring in NVDA?', 'Which level would invalidate this read of NVDA?',
    'What happens to NVDA if rates stay high?', 'Why does the next earnings report matter for NVDA?', 'What would you look at next in NVDA?', 'What is the market pricing in for NVDA?',
    'Why is NVDA diverging from the sector?', 'What does the funding rate say about BTC?', 'What would make this trend in NVDA fail?', 'What are traders overlooking in NVDA?',
    'What does a weaker dollar do to BTC?', 'What stands between NVDA and a trend change?', 'Why is momentum fading in NVDA?', 'What is the main risk over the next week for NVDA?'],
  es: ['¿Qué tendría que pasar para que cambie esta lectura de NVDA?', '¿Por qué importa más el volumen que la tendencia en NVDA?', '¿Cuál es el punto más débil del caso alcista de NVDA?',
    '¿Qué riesgo está ignorando el mercado en NVDA?', '¿Qué pasa con NVDA si las tasas siguen altas?', '¿Por qué importa el próximo reporte de NVDA?', '¿Qué nivel invalidaría esta lectura de NVDA?',
    '¿Qué diría el bajista sobre NVDA ahora?', '¿Qué está descontando el mercado en NVDA?', '¿Por qué NVDA se separa del sector?', '¿Qué hay entre NVDA y un cambio de tendencia?',
    '¿Qué se puede esperar de NVDA esta semana?', '¿Cuál es el riesgo principal de NVDA a una semana?'],
  fr: ['Qu’est-ce qui ferait changer cette lecture de NVDA ?', 'Pourquoi le volume compte-t-il plus que la tendance pour NVDA ?', 'Quel est le point faible du scénario haussier de NVDA ?',
    'Quel risque le marché ignore-t-il sur NVDA ?', 'Que se passe-t-il pour NVDA si les taux restent élevés ?', 'Pourquoi les prochains résultats comptent-ils pour NVDA ?', 'Quel niveau invaliderait cette lecture de NVDA ?',
    'Que dirait le baissier sur NVDA en ce moment ?', 'Qu’est-ce que le marché anticipe pour NVDA ?', 'Pourquoi NVDA diverge-t-il du secteur ?', 'À quoi faut-il s’attendre pour NVDA cette semaine ?'],
  pt: ['O que teria de acontecer para esta leitura da NVDA mudar?', 'Por que o volume importa mais do que a tendência na NVDA?', 'Qual é o ponto mais fraco do cenário otimista da NVDA?',
    'Que risco o mercado está a ignorar na NVDA?', 'O que acontece à NVDA se os juros continuarem altos?', 'Por que os próximos resultados importam para a NVDA?', 'Que nível invalidaria esta leitura da NVDA?',
    'O que o mercado está a descontar na NVDA?', 'Por que a NVDA diverge do setor?', 'O que se pode esperar da NVDA esta semana?'],
  it: ['Cosa dovrebbe succedere perché questa lettura di NVDA cambi?', 'Perché il volume conta più della tendenza per NVDA?', 'Qual è il punto più debole dello scenario rialzista di NVDA?',
    'Quale rischio sta ignorando il mercato su NVDA?', 'Cosa succede a NVDA se i tassi restano alti?', 'Perché i prossimi risultati contano per NVDA?', 'Quale livello invaliderebbe questa lettura di NVDA?',
    'Cosa sta scontando il mercato su NVDA?', 'Perché NVDA diverge dal settore?', 'Cosa ci si può aspettare da NVDA questa settimana?'],
  de: ['Was müsste passieren, damit sich diese Einschätzung zu NVDA ändert?', 'Warum zählt das Volumen bei NVDA mehr als der Trend?', 'Was ist der schwächste Punkt im Bullen-Szenario für NVDA?',
    'Welches Risiko übersieht der Markt bei NVDA?', 'Was passiert mit NVDA, wenn die Zinsen hoch bleiben?', 'Warum sind die nächsten Zahlen für NVDA wichtig?', 'Welches Niveau würde diese Einschätzung zu NVDA entkräften?',
    'Was preist der Markt bei NVDA ein?', 'Warum weicht NVDA vom Sektor ab?', 'Was ist bei NVDA diese Woche zu erwarten?'],
};
const plausibleSymbol = (question) => (question.includes('BTC') ? 'BTC' : 'NVDA');

// ---- The 59 next questions the models wrote in the paired eval of 2026-09-29 (docs/ai/data, the same set
// scripts/test-desk-levels.mts pins for the server on the branch of the next question), by language and asset. ----
export const RECORDED = [
  ["es", "BTC", [
    "¿Qué señales de BTC confirmarían una ruptura esta semana?",
    "¿Qué pasaría con BTC si pierde el soporte de 82.556?",
    "¿Qué haría BTC si pierde el soporte de 82,556?",
    "¿Qué señales confirmarían una ruptura de BTC?",
    "¿Qué haría más débil la tendencia alcista de BTC?",
    "¿Qué pasaría con BTC si pierde el soporte de 82.557?",
]],
  ["es", "ETH", [
    "¿Qué señales diarias confirmarían una tendencia en ETH?",
    "¿Qué haría más sólida una ruptura de resistencia en ETH?",
    "¿Qué pasaría con ETH si pierde la EMA50 de 4H?",
    "¿Qué señales diarias confirmarían la tendencia de ETH?",
    "¿Qué pasaría con ETH si pierde el soporte de 2635,7?",
    "¿Qué pasaría con ETH si retrocede hacia 2.610?",
]],
  ["es", "SOL", [
    "¿Qué niveles intradía de SOL conviene vigilar?",
    "¿Qué pasaría con SOL si pierde el soporte de 116,4?",
    "¿Qué pasa con SOL si pierde el soporte de 116.4?",
    "¿Qué confirmaría una ruptura de SOL?",
    "¿Qué significa que SOL esté sobrecomprado en el gráfico diario?",
]],
  ["en", "NVDA", [
    "What would confirm a NVDA breakout?",
    "What would weaken the NVDA uptrend from here?",
    "What would a pullback in NVDA need to look like to hold?",
    "What would invalidate a bullish NVDA setup near resistance?",
    "What would confirm NVDA’s breakout above resistance?",
    "What would invalidate the bullish case on NVDA?",
    "What would a pullback toward the NVDA 1H EMA20 look like?",
    "What would confirm NVDA’s setup on a longer timeframe?",
    "What would invalidate the bullish case for NVDA?",
    "What would weaken the NVDA uptrend on the daily chart?",
]],
  ["es", "TSLA", [
    "¿Qué muestran los datos diarios y semanales de TSLA?",
    "¿Qué nivel confirmaría un cambio de tendencia en TSLA?",
    "¿Qué pasaría con TSLA si pierde el soporte de 356,8?",
    "¿Qué tendría que cambiar en TSLA para confirmar un rebote?",
    "¿Qué dice el gráfico semanal de TSLA sobre su tendencia?",
    "¿Qué mostraría el gráfico semanal de TSLA sobre su tendencia?",
]],
  ["en", "AAPL", [
    "What would confirm an AAPL rebound?",
    "How would a pullback to support change the AAPL outlook?",
    "What would make AAPL's daily uptrend look weaker?",
    "What do AAPL’s daily and weekly charts show?",
    "How would a weekly chart change the AAPL outlook?",
    "What would make AAPL's daily trend look weaker?",
]],
  ["es", "DOGE", [
    "¿Qué confirmaría una ruptura de DOGE por encima de 0,09589?",
    "¿Qué haría más sólida una ruptura de DOGE sobre 0,09589?",
    "¿Qué nivel de soporte mantiene el sesgo alcista diario de DOGE?",
    "¿Qué confirmaría una ruptura de DOGE?",
    "¿Qué invalidaría una ruptura alcista de DOGE sobre 0,09589?",
    "¿Qué le falta a DOGE para confirmar una tendencia en 4H?",
]],
  ["en", "MSFT", [
    "What daily and weekly signals should I watch for MSFT?",
    "What would weekly charts add to the MSFT monthly outlook?",
    "What would make MSFT's uptrend fail over the next month?",
    "What would confirm MSFT’s next move?",
    "What could push MSFT below its 491.2 support level?",
    "What could move MSFT stock over the next month?",
]],
  ["es", "MSFT", [
    "¿Qué pasaría con MSFT si pierde su EMA20 en 1H?",
    "¿Qué confirmaría el setup de MSFT?",
    "¿Qué pasaría con MSFT si pierde el soporte de 491,2?",
    "¿Qué pasaría con MSFT si pierde la EMA20 de 1H?",
]],
  ["en", "META", [
    "What would invalidate a bounce idea on META?",
    "What would confirm a META rebound?",
    "What would invalidate a bounce setup on META?",
    "What would make a META pullback a real daily downtrend?",
]],
];
// How many of them the phone shows, and why not the rest: the same before and after the rules of 2026-10-08.
export const RECORDED_TALLY = { shown: 33, number: 18, word: 6, opener: 2 };

// ---- Refused since 2026-10-08, one line per form: [question, the reason]. The asset is the language's own. ----
const ASSET = { en: 'NVDA', es: 'NVDA', fr: 'MC.PA', pt: 'PETR4.SA', it: 'ENEL.MI', de: 'SAP.DE' };
export const REFUSED = {
  en: [
    ['Why not go all in on NVDA?', 'act'], ['What if NVDA holders went all-in here?', 'act'], ['Why not short NVDA?', 'act'], ['Why not go long NVDA here?', 'act'],
    ['What would make NVDA a strong long?', 'act'], ['Why is everyone so long NVDA?', 'act'], ['What would trigger a short squeeze in NVDA?', 'act'], ['What stops you from shorting NVDA here?', 'word'],
    ['What leverage fits NVDA here?', 'word'], ['What if you put your savings in NVDA?', 'word'], ['Why not invest in NVDA?', 'word'], ['What makes NVDA a sound investment?', 'word'],
    ['What is worth investing in around NVDA?', 'word'], ['Why not bet on NVDA?', 'word'], ['What are traders betting on with NVDA?', 'word'],
    ['What did I catch in NVDA while you were away?', 'word'], ['What have I been tracking in NVDA for you?', 'word'], ['What did I see in your NVDA history?', 'word'],
    ['Why did I flag NVDA for you?', 'word'], ['What did I see happen to NVDA while you slept?', 'word'], ['What did Bobby spot in NVDA overnight?', 'word'],
    ['What did we see in NVDA this week?', 'word'], ['What does this read of NVDA mean for you?', 'word'], ['What have I kept an eye on in NVDA?', 'word'],
    ['What changed in TSLA since the last read?', 'asset'], ['Which is the stronger chart, NVDA or AMD?', 'asset'], ['What does the move in MC.PA mean for NVDA?', 'asset'], ['What does BTC say about NVDA?', 'asset'],
  ],
  es: [
    ['¿Por qué no invertir en NVDA?', 'act'], ['¿Qué te frena para invertir en NVDA?', 'act'], ['¿Por qué no ponerte largo en NVDA?', 'act'], ['¿Por qué no abrir cortos en NVDA?', 'act'],
    ['¿Por qué no ir all in con NVDA?', 'act'], ['¿Por qué no apostar por NVDA?', 'word'], ['¿Qué apuesta hace el mercado con NVDA?', 'word'], ['¿Qué apalancamiento tiene sentido en NVDA?', 'word'],
    ['¿Qué pasa si metes tus ahorros en NVDA?', 'word'], ['¿Qué vi en NVDA mientras no estabas?', 'word'], ['¿Qué he estado siguiendo en NVDA por ti?', 'word'],
    ['¿Qué cambió en TSLA desde la última lectura?', 'asset'],
  ],
  fr: [
    ['Pourquoi ne pas miser sur MC.PA ?', 'act'], ['Pourquoi ne pas parier sur MC.PA ?', 'act'], ['Pourquoi ne pas shorter MC.PA ?', 'act'], ['Quel effet de levier a du sens sur MC.PA ?', 'act'],
    ['Pourquoi ne pas investir dans MC.PA ?', 'word'], ['Que se passe-t-il si tu mets ton épargne sur MC.PA ?', 'word'], ['Qu’ai-je vu sur MC.PA pendant ton absence ?', 'word'],
    ['Qu’est-ce que j’ai suivi sur MC.PA pour toi ?', 'word'], ['Que dit OR.PA sur MC.PA ?', 'asset'],
  ],
  pt: [
    ['Porque não ficar short em PETR4?', 'act'], ['Porque não investir em PETR4?', 'word'], ['Porque não apostar em PETR4?', 'word'], ['Que alavancagem faz sentido em PETR4?', 'word'],
    ['O que acontece se puseres a tua poupança em PETR4?', 'word'], ['O que vi em PETR4 enquanto estavas fora?', 'word'], ['O que tenho acompanhado em PETR4 por ti?', 'word'],
    ['O que mudou na VALE desde a última leitura?', 'asset'],
  ],
  it: [
    ['Perché non puntare su ENEL.MI?', 'act'], ['Perché non andare short su ENEL.MI?', 'act'], ['Quale leva finanziaria ha senso su ENEL.MI?', 'act'], ['Perché non investire in ENEL.MI?', 'word'],
    ['Perché non scommettere su ENEL.MI?', 'word'], ['Cosa succede se metti i tuoi risparmi su ENEL.MI?', 'word'], ['Che cosa ho visto su ENEL.MI mentre eri via?', 'word'],
    ['Che cosa sto seguendo su ENEL.MI per te?', 'word'], ['Cosa dice ENI su ENEL.MI?', 'asset'],
  ],
  de: [
    ['Warum nicht auf SAP.DE setzen?', 'act'], ['Warum nicht bei SAP.DE long gehen?', 'act'], ['Warum nicht in SAP.DE investieren?', 'word'], ['Warum nicht auf SAP.DE wetten?', 'word'],
    ['Warum nicht SAP.DE shorten?', 'word'], ['Welcher Hebel passt zu SAP.DE?', 'word'], ['Was passiert, wenn du dein Erspartes in SAP.DE steckst?', 'word'],
    ['Was habe ich bei SAP.DE gesehen, während du weg warst?', 'word'], ['Was habe ich bei SAP.DE für dich verfolgt?', 'word'], ['Was sagt SIE.DE über SAP.DE?', 'asset'], ['Was sagt BMW über SAP.DE?', 'asset'],
  ],
};
// ---- Their neighbours, which must still be asked: the people who invest, an investigation, long and short where they
// measure time or a candle, the indicators and market words written in capitals, words that only look like a stem. ----
export const NEIGHBOURS = {
  en: ['What are investors missing in NVDA?', 'What does the antitrust investigation mean for NVDA?', 'What does the long-term trend say about NVDA?', 'What does the short-term trend say about NVDA?',
    'Why do short- and long-term trends disagree on NVDA?', 'Why did NVDA take so long to recover?', 'What keeps NVDA rising as long as rates fall?', 'Why did the rally in NVDA not last for long?',
    'What does the long upper wick say about NVDA?',
    'What does the RSI say about NVDA?', 'Why does the MACD matter for NVDA here?', 'What would ETF flows change for NVDA?', 'What does AI demand mean for NVDA?', 'What does the Fed decision mean for NVDA?',
    'What makes NVDA look better than last week?', 'What does the gap between NVDA and its sector say?', 'What is the main lever for margins at NVDA?', 'What does the NVIDIA guidance say about NVDA?'],
  es: ['¿Qué dice la tendencia de largo plazo sobre NVDA?', '¿Qué pasa con NVDA a corto plazo?', '¿Qué cambió a lo largo de la semana en NVDA?', '¿Qué esperan los inversores de NVDA?',
    '¿Qué confirmaría una inversión de tendencia en NVDA?', '¿Qué dice el RSI sobre NVDA?', '¿Qué significa la IA para NVDA?', '¿Qué pasa con todo el sector de NVDA?'],
  fr: ['Que dit la tendance à long terme sur NVDA ?', 'Qu’attendent les investisseurs de NVDA ?', 'Quel est le principal levier de croissance de NVDA ?', 'Que signifie la cotation à Paris pour NVDA ?',
    'Qu’est-ce qui confirmerait une inversion de tendance sur NVDA ?'],
  pt: ['O que diz a tendência de longo prazo sobre a NVDA?', 'O que esperam os investidores da NVDA?', 'O que diz o IFR sobre a NVDA?', 'O que poderia inverter a tendência da NVDA?', 'O que leva NVDA a cair?'],
  it: ['Cosa dice la tendenza di lungo termine su NVDA?', 'Cosa si aspettano gli investitori da NVDA?', 'Cosa potrebbe invertire la tendenza di NVDA?', 'Qual è la punta massima di NVDA questa settimana?'],
  de: ['Was sagt der langfristige Trend über NVDA?', 'Was erwarten Investoren von NVDA?', 'Was bedeutet der Wettbewerb für NVDA?', 'Was sagt der DAX über NVDA?', 'Was bedeutet KI für NVDA?'],
};

export function nextQuestionCases({ test, assert, RM, reply }) {
  const plain = (value) => JSON.parse(JSON.stringify(value));
  const check = (text, lang, symbol, name) => plain(RM.nextQuestion(text, symbol, lang, 'another question', name));
  const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];

  for (const lang of LANGS) {
    test(lang + ': to invest, to bet, a long or a short, leverage, savings, “all in” and “I saw it for you” are not shown; their neighbours are', () => {
      for (const [text, reason] of REFUSED[lang]) assert.deepEqual(check(text, lang, ASSET[lang]), { text: null, reason }, text);
      for (const text of NEIGHBOURS[lang]) assert.equal(check(text, lang, 'NVDA').text, text, text);
    });
  }

  test('a question about another asset is not shown: a tap would ask it about the asset of this read', () => {
    // The read's own ticker in every form it is written in: whole, by its root, by the pieces of a pair.
    for (const [symbol, text] of [['NVDA', 'What changed in NVDA this week?'], ['MC.PA', 'What changed in MC.PA this week?'], ['MC.PA', 'What changed in MC this week?'],
      ['BRK.B', 'What changed in BRK.B this week?'], ['BRK.B', 'What changed in BRK this week?'], ['BTC-USDT', 'What does BTC do when USDT demand rises?']]) {
      assert.equal(check(text, 'en', symbol).text, text, symbol + ': ' + text);
    }
    // A word of the asset's own name, written in capitals, is the asset (native sends the name with every read).
    const lvmh = 'Qu’est-ce qui pèse sur le cours de LVMH ?';
    assert.equal(check(lvmh, 'fr', 'MC.PA', 'LVMH Moët Hennessy Louis Vuitton').text, lvmh);
    assert.equal(check(lvmh, 'fr', 'MC.PA').reason, 'asset', 'without the name the phone cannot know');
    assert.equal(check(lvmh, 'fr', 'OR.PA', 'L’Oréal').reason, 'asset', 'another asset’s name does not excuse it');
    // The capitals of a chart question, and nothing else of two to five capitals.
    assert.deepEqual(Object.keys(RM.NEXT.caps).sort(), ['AI', 'ATR', 'DAX', 'DOW', 'EMA', 'ETF', 'FED', 'IA', 'IFR', 'KI', 'MACD', 'RSI', 'SMA', 'VWAP']);
    for (const word of Object.keys(RM.NEXT.caps)) assert.equal(check('What does the ' + word + ' say about NVDA?', 'en', 'NVDA').reason, null, word);
    for (const word of ['TSLA', 'AMD', 'ETH', 'SPY', 'QQQ', 'GOOGL', 'US', 'CEO', 'VALE.SA', 'SIE.DE', 'BRK.B']) {
      assert.equal(check('What does ' + word + ' say about NVDA?', 'en', 'NVDA').reason, 'asset', word);
    }
    // Longer than five capitals is a name, not a ticker; a capitalised word is a word.
    for (const text of ['What does the NASDAQ say about NVDA?', 'What does the NVIDIA guidance say about NVDA?', 'What does Tesla’s report change for NVDA?']) {
      assert.equal(check(text, 'en', 'NVDA').text, text);
    }
    // Digits are still read first: another ticker with a digit in it is a number, as before.
    assert.equal(check('Por que a VALE3 continua acima do suporte?', 'pt', 'PETR4.SA').reason, 'number');
    // Through the reply: the model takes the asset's name from the read itself, and a refused question leaves the fixed row.
    const next = (followUp, asset) => RM.build(reply({ asset: { ...reply().asset, ...asset }, synthesis: { headline: 'H.', why: 'W.', risk: 'R.', watch: 'X.', followUp } }), { lang: 'en' }).next;
    assert.equal(next('What is weighing on LVMH this week?', { symbol: 'MC.PA', name: 'LVMH Moët Hennessy' }), 'What is weighing on LVMH this week?');
    assert.equal(next('What is weighing on LVMH this week?', { symbol: 'MC.PA', name: 'Moët Hennessy' }), null);
    assert.equal(next('What changed in TSLA since the last read?', {}), null);
    assert.equal(next('What changed in NVDA since the last read?', {}), 'What changed in NVDA since the last read?');
  });

  test('the show rate is kept: 73 of 73 plausible questions, and the recorded ones exactly as before', () => {
    let total = 0, shown = 0;
    for (const lang of LANGS) for (const question of PLAUSIBLE[lang]) { total++; if (check(question, lang, plausibleSymbol(question)).text === question) shown++; else assert.fail(lang + ': ' + question + ' → ' + check(question, lang, plausibleSymbol(question)).reason); }
    assert.deepEqual([total, shown], [73, 73]);
    const tally = {}; let count = 0;
    for (const [lang, symbol, questions] of RECORDED) for (const question of questions) { count++; const why = check(question, lang, symbol).reason || 'shown'; tally[why] = (tally[why] || 0) + 1; }
    assert.equal(count, 59);
    assert.deepEqual(tally, RECORDED_TALLY, 'of the 59 recorded next questions the phone shows 33; 18 carry a figure, 6 a forbidden word, 2 do not ask what or why');
  });

  test('the longest text the check reads is judged at once, whatever it repeats', () => {
    for (const [lang, unit] of [['en', 'i have '], ['en', 'we did not '], ['en', 'all in '], ['en', 'long and short '], ['es', 'a corto y largo '], ['de', 'ich wir '], ['de', 'auf x '], ['it', 'ho gia '], ['fr', 'j ai deja '], ['pt', 'tenho estado ']]) {
      const text = 'Was ' + unit.repeat(Math.floor((RM.NEXT.max - 6) / unit.length)) + 'x?';
      const started = Date.now();
      RM.nextQuestion(text, 'NVDA', lang, null);
      assert.ok(text.length <= RM.NEXT.max && Date.now() - started < 50, lang + ': ' + JSON.stringify(unit));
    }
  });
}
