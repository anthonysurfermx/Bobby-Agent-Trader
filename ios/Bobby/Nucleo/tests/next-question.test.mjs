// node --test ios/Bobby/Nucleo/tests/next-question.test.mjs
// The next question (ARCHITECTURE.md §3.5) in the read model: the CIO's question becomes the first chip only when it
// passes every check on the phone, each failed check gives the fixed chips with no trace, and a read the person did
// not start never ends on a market-movers chip. The engine side (hand-back, tap, measuring) is in bridge-boot.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = (file) => fs.readFileSync(new URL('../src/' + file, import.meta.url), 'utf8');
const fixture = (name) => JSON.parse(fs.readFileSync(new URL('../fixtures/ask/' + name + '.json', import.meta.url), 'utf8'));
const sandbox = { console };
sandbox.globalThis = sandbox; sandbox.window = sandbox;
vm.runInNewContext(source('shared/20-read-model.js'), sandbox);
const RM = sandbox.NucleoReadModel;
const plain = (value) => JSON.parse(JSON.stringify(value));

const LANGS = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const check = (text, lang = 'en', symbol = 'NVDA', asked) => plain(RM.nextQuestion(text, symbol, lang, asked));
const shown = (text, lang, symbol) => check(text, lang, symbol).text;
const reply = (extra = {}) => ({ ...fixture('nvda'), ...extra });
const withNext = (followUp, extra = {}) => reply({ synthesis: { headline: 'H.', why: 'W.', risk: 'R.', watch: 'X.', followUp }, ...extra });
const SUGG = { quickAccess: [{ symbol: 'NVDA' }, { symbol: 'BTC' }, { symbol: 'ETH' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }, { symbol: 'AAPL' }] };
const row = (model, sugg = SUGG, lang = 'en') => plain(RM.followUps(model, sugg, lang));

// One clean what/why question per language, as the desk writes them.
const CLEAN = {
  en: 'What would have to change in NVDA for this read to change?',
  es: '¿Qué tendría que cambiar en NVDA para que cambie esta lectura?',
  fr: 'Qu’est-ce qui devrait changer pour NVDA pour que cette lecture change ?',
  pt: 'O que teria de mudar em NVDA para esta leitura mudar?',
  it: 'Che cosa dovrebbe cambiare in NVDA perché questa lettura cambi?',
  de: 'Was müsste sich bei NVDA ändern, damit sich diese Einschätzung ändert?',
};

test('the model’s question is the first chip, then another question, then one asset of the person’s own', () => {
  for (const lang of ['en', 'es']) {
    const model = RM.build(withNext(CLEAN[lang], { language: lang }), { lang });
    assert.equal(model.next, CLEAN[lang]);
    const chips = row(model, SUGG, lang);
    assert.deepEqual(chips.map((chip) => chip.label), lang === 'en'
      ? [CLEAN.en, 'Another question about NVDA', 'How is BTC looking?']
      : [CLEAN.es, 'Otra pregunta sobre NVDA', '¿Cómo se ve BTC?']);
    // The tap asks it as a follow-up of THIS read: native reuses the read's asset, the page names none.
    assert.deepEqual(chips[0], { label: CLEAN[lang], style: 'ask', action: { followUpOf: model.requestId, question: CLEAN[lang], symbol: 'NVDA', next: true } });
    assert.deepEqual(chips[1].action, { followUpOf: model.requestId, symbol: 'NVDA' }, 'no question: the person types their own');
    assert.equal(chips.length, 3, 'the row never grows');
  }
});

test('a reply without the field is exactly the row of before: another question, then two real symbols', () => {
  const before = [
    { label: 'Another question about NVDA', action: { followUpOf: fixture('nvda').requestId, symbol: 'NVDA' } },
    { label: 'How is BTC looking?', action: { question: 'How is BTC looking?', symbol: 'BTC' } },
    { label: 'How is ETH looking?', action: { question: 'How is ETH looking?', symbol: 'ETH' } },
  ];
  for (const old of [reply(), reply({ synthesis: { headline: 'H.', why: 'W.', risk: 'R.', watch: 'X.' } }), reply({ synthesis: null }), reply({ synthesis: 'text' })]) {
    const model = RM.build(old, { lang: 'en' });
    assert.equal(model.next, null);
    assert.equal(model.origin, 'person');
    assert.deepEqual(row(model), before);
  }
  // Movers fill only the slots the person's own assets left empty.
  const model = RM.build(reply(), { lang: 'en' });
  assert.deepEqual(row(model, { quickAccess: [{ symbol: 'NVDA' }, { symbol: 'BTC' }], movers: SUGG.movers }).map((chip) => chip.action.symbol), ['NVDA', 'BTC', 'TSLA']);
});

test('each reason a question is not shown gives the fixed chip, and nothing else', () => {
  const cases = {
    missing: [undefined, null, 7, {}, '', '   \n '],
    long: ['What ' + 'would really '.repeat(7) + 'change for NVDA?', 'Why ' + 'x'.repeat(RM.NEXT.max) + '?'],
    number: ['What would confirm a break above $230 for NVDA?', 'Why is NVDA holding above 225?', 'What does the 50-day average say about NVDA?',
      'Why did NVDA move 3% this week?', 'Why did NVDA move three% this week?', 'What does 225,07 € mean for NVDA?', 'What is NVDA worth in £?'],
    shape: ['What is driving NVDA', 'NVDA looks strong. What is driving it?', 'What is driving NVDA? Why now?', 'What is driving NVDA?!', 'What?',
      'What is <b>driving</b> NVDA?', 'What is driving NVDA at https://example.com?', 'What is driving NVDA; why now?', 'What is driving #NVDA?'],
    opener: ['Should I wait for a pullback in NVDA?', 'Is now a good moment for NVDA?', 'When could NVDA retest its support?', 'How is NVDA looking?',
      'Can NVDA hold this level?', 'Does the volume confirm the move in NVDA?', 'Whatever happened to NVDA?', 'NVDA: what changed?'],
    word: ['What would make NVDA a buy here?', 'Why not sell NVDA into strength?', 'What signal would confirm the trend in NVDA?', 'Why did the alert on NVDA matter?',
      'What advice fits NVDA now?', 'What profit is left in NVDA?', 'What returns has NVDA delivered?', 'Why is nothing guaranteed with NVDA?'],
  };
  for (const [reason, texts] of Object.entries(cases)) {
    for (const text of texts) {
      assert.deepEqual(check(text), { text: null, reason }, JSON.stringify(text));
      if (typeof text !== 'string') continue;
      const model = RM.build(withNext(text), { lang: 'en' });
      assert.equal(model.next, null, text);
      assert.deepEqual(row(model).map((chip) => chip.label), ['Another question about NVDA', 'How is BTC looking?', 'How is ETH looking?'], text);
    }
  }
  // The question this read answered is not offered again (a tap would ask it for ever), whatever its spacing or accents.
  assert.deepEqual(check(CLEAN.en, 'en', 'NVDA', ' what would have to change in NVDA  for this read to change? '), { text: null, reason: 'same' });
  assert.deepEqual(check(CLEAN.es, 'es', 'NVDA', '¿Que tendria que cambiar en NVDA para que cambie esta lectura?'), { text: null, reason: 'same' });
  assert.equal(RM.build(withNext(CLEAN.en, { question: CLEAN.en }), { lang: 'en' }).next, null);
  assert.equal(RM.build(withNext(CLEAN.en, { question: 'Should I buy NVIDIA right now?' }), { lang: 'en' }).next, CLEAN.en);
});

test('the only digits a question may carry are the asset’s own ticker', () => {
  assert.equal(shown('O que teria de mudar em PETR4.SA para esta leitura mudar?', 'pt', 'PETR4.SA'), 'O que teria de mudar em PETR4.SA para esta leitura mudar?');
  assert.equal(shown('Por que a PETR4 continua acima do suporte?', 'pt', 'PETR4.SA'), 'Por que a PETR4 continua acima do suporte?');
  assert.equal(check('Por que a VALE3 continua acima do suporte?', 'pt', 'PETR4.SA').reason, 'number', 'another ticker’s digits are a number');
  assert.equal(check('Por que a PETR4 passou de 40?', 'pt', 'PETR4.SA').reason, 'number');
});

test('it asks what or why in the language of the reply, and whitespace is collapsed before anything is shown', () => {
  for (const lang of LANGS) assert.equal(shown(CLEAN[lang], lang), CLEAN[lang].replace(/\s+/g, ' '), lang);
  const opens = {
    en: ['Why is NVDA holding above its support?', 'Which part of the read on NVDA is weakest?', 'What’s behind the move in NVDA?'],
    es: ['¿Por qué NVDA sigue sobre su soporte?', '¿De qué depende que NVDA mantenga la tendencia?', '¿Cuál es el punto débil de esta lectura de NVDA?', 'Qué cambió en NVDA esta semana?'],
    fr: ['Pourquoi NVDA reste-t-il au-dessus de son support ?', 'Que s’est-il passé sur NVDA cette semaine ?', 'À quoi tient la tendance de NVDA ?', 'Quels éléments feraient changer cette lecture de NVDA ?'],
    pt: ['Por que a NVDA continua acima do suporte?', 'Porque está a NVDA acima do suporte?', 'De que depende a tendência da NVDA?', 'Qual é o ponto fraco desta leitura da NVDA?'],
    it: ['Perché NVDA resta sopra il supporto?', 'Cos’è cambiato in NVDA questa settimana?', 'Da cosa dipende la tendenza di NVDA?', 'Quali fattori cambierebbero questa lettura di NVDA?'],
    de: ['Warum hält sich NVDA über der Unterstützung?', 'Woran liegt die Schwäche von NVDA?', 'Welche Faktoren würden diese Einschätzung zu NVDA ändern?', 'Wodurch könnte sich das Bild bei NVDA ändern?'],
  };
  const acts = {
    en: ['Should I wait before entering NVDA?', 'When is the right moment for NVDA?', 'Is it too late for NVDA?'],
    es: ['¿Conviene esperar con NVDA?', '¿Es buen momento para NVDA?', '¿Cuándo entrar en NVDA?', '¿Debería esperar con NVDA?'],
    fr: ['Est-ce le bon moment pour NVDA ?', 'Quand entrer sur NVDA ?', 'Faut-il attendre pour NVDA ?', 'Dois-je attendre pour NVDA ?'],
    pt: ['Vale a pena esperar pela NVDA?', 'Quando entrar na NVDA?', 'É bom momento para a NVDA?', 'Devo esperar pela NVDA?'],
    it: ['Conviene aspettare con NVDA?', 'Quando entrare su NVDA?', 'È il momento giusto per NVDA?', 'Devo aspettare con NVDA?'],
    de: ['Soll ich bei NVDA abwarten?', 'Wann ist der richtige Moment bei NVDA?', 'Ist es bei NVDA zu spät?', 'Lohnt sich das Warten bei NVDA?'],
  };
  for (const lang of LANGS) {
    for (const text of opens[lang]) assert.equal(shown(text, lang), text, lang + ': ' + text);
    for (const text of acts[lang]) assert.equal(check(text, lang).reason, 'opener', lang + ': ' + text);
  }
  // A what/why word of another language does not open a question: "Was NVDA …?" is not German "Was …?".
  assert.equal(check('Was NVDA overbought last week?', 'en').reason, 'opener');
  assert.equal(shown('Was bedeutet das für NVDA?', 'de'), 'Was bedeutet das für NVDA?');
  assert.equal(shown('  What\n changed \t in NVDA? '), 'What changed in NVDA?');
  // French keeps its space before the mark, and the chip never lets the mark wrap alone.
  const french = RM.build(withNext(CLEAN.fr, { language: 'fr' }), { lang: 'fr' });
  assert.equal(row(french, SUGG, 'fr')[0].label, CLEAN.fr.replace(/ \?$/, '\u202f?'));
  assert.equal(row(french, SUGG, 'fr')[0].action.question, CLEAN.fr, 'what is asked is the plain text');
});

// The forbidden words of product copy, in every language: each of the eight, as a question that would otherwise pass.
const FORBIDDEN = {
  en: ['What would make NVDA a buy?', 'Why are funds selling NVDA?', 'What profit is left in NVDA?', 'Why is nothing guaranteed in NVDA?',
    'What returns did NVDA deliver?', 'What advice applies to NVDA?', 'What signal matters for NVDA?', 'What alert would matter for NVDA?', 'Why was NVDA sold so hard?',
    'What do advisors say about NVDA?', 'What would analysts recommend for NVDA?', 'What triggered the buyback at NVDA?', 'What triggered the sell-off in NVDA?'],
  es: ['¿Qué haría de NVDA una compra?', '¿Por qué conviene comprar NVDA?', '¿Por qué vender NVDA ahora?', '¿Qué ganancia queda en NVDA?', '¿Qué está garantizado en NVDA?',
    '¿Qué rendimiento ha dado NVDA?', '¿Qué consejo aplica a NVDA?', '¿Qué señal importa en NVDA?', '¿Qué alerta importa en NVDA?', '¿Qué explica la venta de NVDA?', '¿Qué rentabilidad ofrece NVDA?',
    '¿Qué recomiendan los analistas sobre NVDA?', '¿Por qué cómpralo sería un error con NVDA?'],
  fr: ['Pourquoi acheter NVDA maintenant ?', 'Qu’est-ce qui justifie un achat de NVDA ?', 'Pourquoi vendre NVDA maintenant ?', 'Quel profit reste-t-il sur NVDA ?', 'Quel bénéfice attendre de NVDA ?',
    'Qu’est-ce qui est garanti avec NVDA ?', 'Quel rendement NVDA a-t-il offert ?', 'Quel conseil vaut pour NVDA ?', 'Quel signal compte pour NVDA ?', 'Quels signaux comptent pour NVDA ?',
    'Quelle alerte compte pour NVDA ?', 'Pourquoi la vente de NVDA s’accélère ?', 'Que recommandent les analystes pour NVDA ?'],
  pt: ['Por que comprar NVDA agora?', 'O que justifica a compra de NVDA?', 'Por que vender NVDA agora?', 'Que lucro resta em NVDA?', 'O que está garantido em NVDA?',
    'Que retorno deu a NVDA?', 'Que rendimento deu a NVDA?', 'Que conselho vale para NVDA?', 'Que sinal importa em NVDA?', 'Quais sinais importam em NVDA?', 'Que alerta importa em NVDA?',
    'O que recomendam os analistas para NVDA?', 'O que explica a venda de NVDA?'],
  it: ['Perché comprare NVDA adesso?', 'Cosa giustifica un acquisto di NVDA?', 'Perché vendere NVDA adesso?', 'Quale profitto resta in NVDA?', 'Quale guadagno resta in NVDA?',
    'Cosa è garantito con NVDA?', 'Quale rendimento ha dato NVDA?', 'Quale consiglio vale per NVDA?', 'Quale segnale conta per NVDA?', 'Quale allerta conta per NVDA?',
    'Cosa raccomandano gli analisti su NVDA?', 'Cosa spiega la vendita di NVDA?', 'Che garanzia offre NVDA?'],
  de: ['Warum NVDA jetzt kaufen?', 'Was spricht für einen Kauf von NVDA?', 'Warum NVDA jetzt verkaufen?', 'Welcher Gewinn bleibt bei NVDA?', 'Was ist bei NVDA garantiert?',
    'Welche Rendite brachte NVDA?', 'Welcher Ertrag ist bei NVDA üblich?', 'Welcher Ratschlag gilt für NVDA?', 'Welche Empfehlung gilt für NVDA?', 'Welches Signal zählt bei NVDA?',
    'Was spricht für ein Kaufsignal bei NVDA?', 'Welcher Alarm zählt bei NVDA?', 'Was sagt die Anlageberatung zu NVDA?',
    'Was empfiehlt der Markt bei NVDA?', 'Was wurde bei NVDA gewonnen?'],
};
// Neighbours of those words that mean something else, and ordinary market vocabulary: all of it may be asked.
const INNOCENT = {
  en: ['What is driving the momentum in NVDA?', 'Why is the trend in NVDA losing strength?', 'What event could change the read on NVDA?', 'Why did NVDA’s sales growth slow?'],
  es: ['¿Qué hay que comprender del volumen de NVDA?', '¿Qué involucra la caída de NVDA?', '¿Qué evento cambiaría la lectura de NVDA?', '¿Por qué pierde fuerza la tendencia de NVDA?'],
  fr: ['Que faut-il comprendre de la baisse de NVDA ?', 'Quel événement changerait la lecture de NVDA ?', 'Pourquoi la tendance de NVDA s’essouffle ?'],
  pt: ['O que é preciso compreender no volume da NVDA?', 'Que evento mudaria a leitura da NVDA?', 'Por que a tendência da NVDA perde força?'],
  it: ['Cosa c’è da comprendere nel volume di NVDA?', 'Quale evento cambierebbe la lettura di NVDA?', 'Perché la tendenza di NVDA perde forza?'],
  de: ['Was bedeutet der neue Vertrag für NVDA?', 'Warum fällt die Gesellschaft hinter NVDA zurück?', 'Welches Ereignis würde das Bild bei NVDA ändern?'],
};
for (const lang of LANGS) {
  test(lang + ': a question with a forbidden word is not shown; a clean one is', () => {
    for (const text of FORBIDDEN[lang]) assert.deepEqual(check(text, lang), { text: null, reason: 'word' }, text);
    for (const text of [CLEAN[lang]].concat(INNOCENT[lang])) assert.equal(shown(text, lang), text.replace(/\s+/g, ' '), text);
    // Whatever the language of the reply, a forbidden word of any of the six stops the question.
    for (const other of LANGS) {
      const opener = CLEAN[lang].split(' ')[0].replace(/^¿/, '');
      for (const text of FORBIDDEN[other].slice(0, 3)) {
        const mixed = opener + ' ' + text.replace(/^¿/, '');
        assert.ok(['word', 'shape', 'opener'].includes(check(mixed, lang).reason), lang + ' ← ' + other + ': ' + mixed);
        assert.equal(shown(mixed, lang), null);
      }
    }
  });
}

test('there is one list, in the shared page source, and the fixed chips themselves pass it', () => {
  const shared = source('shared/20-read-model.js');
  assert.equal(shared.split('var NEXT_FORBIDDEN').length, 2);
  for (const file of fs.readdirSync(new URL('../src/app/', import.meta.url)).filter((name) => name.endsWith('.js'))) {
    assert.doesNotMatch(source('app/' + file), /NEXT_FORBIDDEN|NEXT_OPENS/, file + ': the checks live in the read model only');
  }
  const words = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-zßœæ0-9]+/).filter(Boolean);
  for (const lang of LANGS) {
    for (const key of ['follow.another', 'follow.how', 'follow.why']) {
      for (const word of words(RM.t(lang, key, { symbol: 'NVDA' }))) assert.ok(!RM.NEXT.forbidden.some((pattern) => pattern.test(word)), lang + '.' + key + ': ' + word);
    }
  }
});

test('a read the person did not start never ends on a mover: only their own question and their own assets', () => {
  const movers = { quickAccess: [{ symbol: 'NVDA' }], movers: [{ symbol: 'TSLA', name: 'Tesla', changePct: 4.1 }, { symbol: 'AAPL' }] };
  for (const lang of ['en', 'es']) {
    const another = RM.t(lang, 'follow.another', { symbol: 'NVDA' });
    const own = RM.build(reply(), { lang });
    assert.equal(row(own, movers, lang).length, 3, 'their own read, with no other asset of theirs: movers may fill the row');
    for (const origin of ['followUp', 'restored']) {
      const model = RM.build(reply(), { lang, origin });
      assert.equal(model.origin, origin);
      assert.deepEqual(row(model, movers, lang).map((chip) => chip.label), [another]);
      assert.deepEqual(row(model, SUGG, lang).map((chip) => chip.action.symbol), ['NVDA', 'BTC', 'ETH'], 'their own assets still follow');
      const asked = RM.build(withNext(CLEAN[lang], { language: lang }), { lang, origin });
      assert.deepEqual(row(asked, movers, lang).map((chip) => chip.label), [CLEAN[lang], another]);
      assert.deepEqual(row(asked, SUGG, lang).map((chip) => chip.action.symbol), ['NVDA', 'NVDA', 'BTC']);
    }
    // Starters that only pad quick access (native marks them `own: false`) are not their assets either.
    const padded = { quickAccess: [{ symbol: 'NVDA', own: true }, { symbol: 'BTC', own: false }, { symbol: 'ETH', own: true }, { symbol: 'TSLA', own: false }], movers: [] };
    assert.deepEqual(row(own, padded, lang).map((chip) => chip.action.symbol), ['NVDA', 'BTC', 'ETH'], 'their own read keeps the row of before');
    for (const origin of ['followUp', 'restored']) {
      assert.deepEqual(row(RM.build(reply(), { lang, origin }), padded, lang).map((chip) => chip.action.symbol), ['NVDA', 'ETH']);
    }
    // Neither template reaches such a read: not "How is X looking?" about a mover, not "Why is X moving today?".
    const model = RM.build(reply(), { lang, origin: 'followUp' });
    const labels = plain(RM.followUps(model, movers, lang, { whyForMovers: true })).map((chip) => chip.label);
    assert.ok(!labels.some((label) => /TSLA|AAPL/.test(label)));
  }
});

// ---- What the phone's own check let through (review of 2026-10-07). One line per form: each must stop the chip. ----
const STOPPED = {
  // A price said in words is still a price: a number word before a money or percent word.
  number: {
    en: ['What happens if NVDA loses two hundred dollars?', 'Why did NVDA fall ten percent this week?', 'Why did NVDA drop twenty points today?', 'What would five per cent more mean for NVDA?'],
    es: ['¿Qué pasa si NVDA pierde doscientos dólares?', '¿Por qué cayó NVDA diez por ciento esta semana?', '¿Qué pasa si NVDA baja veinte puntos?'],
    fr: ['Pourquoi NVDA a perdu dix pour cent cette semaine ?', 'Que se passe-t-il si NVDA perd cent dollars ?'],
    pt: ['Por que a NVDA caiu dez por cento esta semana?', 'O que acontece se a NVDA perder cem dólares?'],
    it: ['Perché NVDA ha perso dieci per cento questa settimana?', 'Cosa succede se NVDA perde cento dollari?'],
    de: ['Warum fiel NVDA diese Woche um zehn Prozent?', 'Was passiert, wenn NVDA hundert Dollar verliert?'],
  },
  // The eight words, in the forms the list missed, and a claim that Bobby noticed, watched or detected.
  word: {
    en: ['What return does NVDA offer here?', 'Why did the returning buyers lift NVDA?', 'What gains are left in NVDA?', 'What did Bobby notice in NVDA this week?',
      'What is Bobby watching in NVDA?', 'What did the desk detect in NVDA?', 'What is being monitored in NVDA?', 'Why is there a warning on NVDA?'],
    es: ['¿Qué pasaría si comprase NVDA hoy mismo?', '¿Qué pasa comprándolo ahora en NVDA?', '¿Qué compraríamos en NVDA esta semana?', '¿Qué notó Bobby en NVDA esta semana?',
      '¿Qué detectó Bobby en NVDA?', '¿Qué vigila Bobby en NVDA?'],
    fr: ['Quels gains attendre de NVDA ce mois-ci ?', 'Qu’est-ce que Bobby a remarqué sur NVDA ?', 'Que surveille Bobby sur NVDA ?', 'Que gagner avec NVDA cette semaine ?'],
    pt: ['O que explica os ganhos de NVDA esta semana?', 'O que comprariam os fundos em NVDA?', 'O que notou o Bobby em NVDA?', 'O que vigia o Bobby em NVDA?'],
    it: ['Cosa comprerebbe chi segue NVDA oggi?', 'Perché chi comprava NVDA ora esita?', 'Quali ritorni offre NVDA questo mese?', 'Cosa ha rilevato Bobby su NVDA?',
      'Cosa sorveglia Bobby su NVDA?'],
    de: ['Was spricht für eine Warnung bei NVDA?', 'Was rätst du mir bei NVDA?', 'Was hat Bobby bei NVDA bemerkt?', 'Was beobachtet Bobby bei NVDA?', 'Was hat Bobby bei NVDA entdeckt?'],
  },
  // Whether or when to act, dressed as a what or a why.
  act: {
    en: ['Why not get in now on NVDA?', 'Why wait on NVDA when it is cheap?', 'What is the best moment to get into NVDA?', 'What is the right entry for NVDA?',
      'Why not enter NVDA today?', 'Why is it time to look at NVDA?', 'Why is it too late for NVDA?', 'What would make me wait longer on NVDA?',
      'Why should I wait with NVDA?', 'What happens to those entering now in NVDA?', 'Why are traders getting out of NVDA?'],
    es: ['¿Por qué no entrar ya en NVDA?', '¿Cuál es el mejor momento para NVDA?', '¿Por qué esperar con NVDA si está barata?', '¿Qué entrada tiene sentido en NVDA?', '¿Por qué es hora de mirar NVDA?'],
    fr: ['Pourquoi ne pas entrer sur NVDA maintenant ?', 'Quel est le meilleur moment pour NVDA ?', 'Pourquoi attendre encore sur NVDA ?', 'Quelle entrée a du sens sur NVDA ?'],
    pt: ['Por que não entrar já na NVDA?', 'Qual é o melhor momento para a NVDA?', 'Por que esperar mais pela NVDA?', 'Que entrada faz sentido na NVDA?'],
    it: ['Perché non entrare ora su NVDA?', 'Qual è il momento migliore per NVDA?', 'Perché aspettare ancora con NVDA?', 'Quale ingresso ha senso su NVDA?'],
    de: ['Warum nicht jetzt bei NVDA einsteigen?', 'Was ist der beste Zeitpunkt für NVDA?', 'Warum bei NVDA noch warten?', 'Welcher Einstieg ergibt bei NVDA Sinn?', 'Was ist der richtige Moment bei NVDA?'],
  },
};
// What must still be asked: neighbours of the new forms, and the money or the percent as a subject, with no figure.
const STILL_ASKED = {
  en: ['What is weighing on NVDA at the moment?', 'Why did NVDA enter a correction this week?', 'What is the market waiting for from NVDA?',
    'What does the latest analyst note say about NVDA?', 'Why did NVDA get into trouble this week?', 'What does a stronger dollar mean for NVDA?', 'What are the two risks in this read of NVDA?', 'What is driving the momentum in NVDA?', 'Why does the enterprise demand matter for NVDA?',
    'What is the point of support that matters for NVDA?', 'What does the rate decision mean for NVDA?'],
  es: ['¿Qué pesa sobre NVDA en este momento?', '¿Qué significa un dólar fuerte para NVDA?', '¿Qué diferencia hay entre NVDA y el resto del sector?', '¿Qué hay que comprobar en el volumen de NVDA?', '¿Qué compromete la tendencia de NVDA?',
    '¿Qué cabe esperar de NVDA esta semana?'],
  fr: ['Que dit la dernière note des analystes sur NVDA ?', 'Que signifie un dollar fort pour NVDA ?', 'Qu’est-ce qui est compris dans cette lecture de NVDA ?', 'À quoi s’attendre pour NVDA cette semaine ?',
    'Que dirait le baissier sur NVDA en ce moment ?'],
  pt: ['O que pesa sobre a NVDA neste momento?', 'O que significa um dólar forte para a NVDA?', 'O que compromete a tendência da NVDA?', 'O que esperar da NVDA esta semana?'],
  it: ['Cosa significa un dollaro forte per NVDA?', 'Cosa è compreso in questa lettura di NVDA?', 'Cosa aspettarsi da NVDA questa settimana?',
    'Cosa ci si può aspettare da NVDA questa settimana?', 'Cosa pesa su NVDA in questo momento?'],
  de: ['Was belastet NVDA im Moment?', 'Was bedeutet ein starker Dollar für NVDA?', 'Was bedeutet das Momentum für NVDA?', 'Was ist bei NVDA diese Woche zu erwarten?'],
};
for (const lang of LANGS) {
  test(lang + ': a price in words, a missed form of a forbidden word and an act question shaped as a why are not shown', () => {
    for (const reason of Object.keys(STOPPED)) {
      for (const text of STOPPED[reason][lang]) assert.deepEqual(check(text, lang), { text: null, reason }, text);
    }
    for (const text of STILL_ASKED[lang]) assert.equal(shown(text, lang), text.replace(/\s+/g, ' '), text);
  });
}

test('the ticker is taken out as a word of its own: a price that equals a numeric ticker is still a number', () => {
  assert.equal(shown('What changed in 2330.TW this week?', 'en', '2330.TW'), 'What changed in 2330.TW this week?');
  assert.equal(check('What happens if 2330.TW breaks 2330?', 'en', '2330.TW').reason, 'number');
  assert.equal(check('What happens if 2330.TW loses 2330.TW0?', 'en', '2330.TW').reason, 'number', 'a longer token is not the ticker');
  assert.equal(check('What does 7203 mean for 7203.T?', 'en', '7203.T').reason, 'number');
  // A short form with a letter is still the ticker (PETR4 of PETR4.SA), and only as a whole word.
  assert.equal(shown('Por que a PETR4 continua acima do suporte?', 'pt', 'PETR4.SA'), 'Por que a PETR4 continua acima do suporte?');
  assert.equal(check('Por que a PETR45 continua acima do suporte?', 'pt', 'PETR4.SA').reason, 'number');
});

// ---- Bobby never invites someone into a wall: when native says the next read would be refused (`oneTap: false`),
// the row keeps only the chip that asks nothing by itself. ----
test('with no read left the row offers no one-tap question: only “another question”, which the person types', () => {
  for (const lang of ['en', 'es']) {
    const another = RM.t(lang, 'follow.another', { symbol: 'NVDA' });
    for (const origin of [undefined, 'followUp', 'restored']) {
      const walled = RM.build(withNext(CLEAN[lang], { language: lang, oneTap: false }), { lang, origin });
      assert.equal(walled.oneTap, false);
      assert.deepEqual(row(walled, SUGG, lang).map((chip) => chip.label), [another], String(origin));
      assert.deepEqual(row(walled, SUGG, lang)[0].action, { followUpOf: walled.requestId, symbol: 'NVDA' });
    }
    // Anything but an explicit no is the row of before (an older native sends no key).
    for (const value of [undefined, true, null, 'false', 0]) {
      const open = RM.build(reply({ language: lang, oneTap: value }), { lang });
      assert.equal(open.oneTap, true);
      assert.equal(row(open, SUGG, lang).length, 3, String(value));
    }
  }
});
