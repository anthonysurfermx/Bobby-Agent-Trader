// Plain words (api/_lib/desk-plain-words.ts), without a network or a model:
//   · who gets the rule: everyone but a reader who chose "experienced";
//   · the meter finds the chart words real Quick reads left in the first four lines (2026-10-09, es and en),
//     and stays silent on the plain way of saying the same thing and on ordinary uses of "support";
//   · the rule keeps the numbers, the verdict and the language rule in the CIO's hands.
import assert from 'node:assert/strict';
import { PLAIN_RULE, TERMS_RULE, SPEECH, chartWordsIn, firstLines, speechFor, speechRule, wantsPlainWords } from '../api/_lib/desk-plain-words.ts';

let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };

eq(wantsPlainWords(null), true, 'a guest is new');
eq(wantsPlainWords(undefined), true, 'no profile is new');
eq(wantsPlainWords('new'), true, 'new');
eq(wantsPlainWords('some'), true, 'some experience still reads plain words');
eq(wantsPlainWords('experienced'), false, 'experienced keeps the desk vocabulary');

// The dial: what the person chose on this request wins over the profile; without it, the profile decides.
eq([...SPEECH], ['plain', 'terms', 'technical'], 'three ways of wording a read');
eq(speechFor(undefined, null), 'plain', 'a guest who never touched the dial reads plain words');
eq(speechFor(undefined, 'experienced'), 'technical', 'no choice, experienced profile: the desk vocabulary');
eq(speechFor('plain', 'experienced'), 'plain', 'an experienced reader may ask for plain words');
eq(speechFor('technical', 'new'), 'technical', 'a new reader may ask for the technical wording');
eq(speechFor('terms', null), 'terms', 'the middle of the dial');
eq(speechFor(null, 'some'), 'plain', 'null is no choice');
eq([speechRule('plain'), speechRule('terms'), speechRule('technical')], [PLAIN_RULE, TERMS_RULE, ''], 'one rule per wording; technical adds nothing');
eq(PLAIN_RULE === TERMS_RULE, false, 'two different rules');
for (const must of ["the word traders use in the reader's language", 'only inside those brackets, right after its plain meaning', 'in plain words first and then name its term once, in brackets', 'Numbers stay exactly as the evidence gives them', 'only if you are certain of it', "wholly in the reader's language"])
  eq(TERMS_RULE.includes(must), true, `terms rule says: ${must}`);
for (const never of ['verdict', 'buy', 'sell', 'recommend'])
  eq(TERMS_RULE.toLowerCase().includes(never), false, `terms rule never speaks of: ${never}`);

// Lines served by production on 2026-10-09.
eq(chartWordsIn('El precio está sobrecomprado (RSI 79.4) y la tendencia de 1H es lateral, sin señal clara.', 'es'), ['rsi', '1h', 'sobrecomprado'], 'es: BTC why');
eq(chartWordsIn('Observa si MU recupera la resistencia 1089.2 con las medias por debajo del precio.', 'es'), ['resistencia'], 'es: MU watch');
eq(chartWordsIn('La tendencia es bajista y el precio está bajo sus medias móviles de corto plazo.', 'es'), ['medias móviles'], 'es: MU why');
eq(chartWordsIn('Observar si el precio recupera la EMA20 en 234.6 con confirmación.', 'es'), ['ema20'], 'es: NVDA watch');
eq(chartWordsIn('Solo hay velas de 1 hora; faltan datos diarios y semanales.', 'es'), ['velas'], 'es: AAPL why');
eq(chartWordsIn('Momentum is overbought at RSI 79.4 while the trend is lateral, with no longer timeframe data.', 'en'), ['rsi', 'momentum', 'overbought', 'timeframe'], 'en: BTC why');
eq(chartWordsIn('Watch whether NVDA holds support at 229.9 and reclaims the EMA20 at 234.6.', 'en'), ['ema20', 'holds support'], 'en: NVDA watch');
eq(chartWordsIn('Price is only 0.26% above support at 229.9, so a small drop would break the setup.', 'en'), ['above support', 'setup'], 'en: NVDA risk');

// The plain way of saying it, and ordinary English.
eq(chartWordsIn('The evidence does not support a clear case to buy bitcoin right now.', 'en'), [], 'en: "support" as a verb');
eq(chartWordsIn('It rose fast in the last hours; there is a ceiling near 83287.6, where it stopped rising before.', 'en'), [], 'en: plain');
eq(chartWordsIn('Subió rápido en las últimas horas; hay un techo cerca de 83287.6, donde antes dejó de subir.', 'es'), [], 'es: plain');
eq(chartWordsIn('Micron fabrica chips de memoria. Una vista hora por hora de los últimos días no dice si sirve para empezar.', 'es'), [], 'es: what the asset is');
eq(chartWordsIn('Hay un piso cerca de 1011.4, donde antes dejó de caer.', 'es'), [], 'es: floor');
eq(chartWordsIn('Elle a monté vite ces dernières heures ; un plafond vers 243,4.', 'fr'), [], 'fr: plain');
eq(chartWordsIn('Der RSI zeigt überkauft, Widerstand bei 243,4.', 'de'), ['rsi', 'überkauft', 'widerstand'], 'de');
eq(chartWordsIn('RSI in ipercomprato e resistenza a 243,4 sulle candele.', 'it'), ['rsi', 'ipercomprato', 'resistenza', 'candele'], 'it');
eq(chartWordsIn('O RSI está em sobrecompra, com resistência em 243,4.', 'pt'), ['rsi', 'sobrecompra', 'resistência'], 'pt');
eq(chartWordsIn('Surachat sur le RSI, résistance à 243,4.', 'fr'), ['rsi', 'surachat', 'résistance'], 'fr');
eq(chartWordsIn('RSI RSI rsi', 'en'), ['rsi'], 'no repeats');

eq(firstLines({ headline: 'a', why: 'b', risk: 'c', watch: 'd' }), 'a · b · c · d', 'the four lines');

// The rule: wording only.
for (const must of ['Numbers stay exactly as the evidence gives them', 'only if you are certain of it', 'without any figure, date, news or opinion', "wholly in the reader's language", 'a floor near N', 'a ceiling near N'])
  eq(PLAIN_RULE.includes(must), true, `rule says: ${must}`);
for (const never of ['verdict', 'buy', 'sell', 'recommend'])
  eq(PLAIN_RULE.toLowerCase().includes(never), false, `rule never speaks of: ${never}`);

console.log(`desk plain words: ${checks} checks passed`);
