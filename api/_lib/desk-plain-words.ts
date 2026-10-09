// ============================================================
// Plain words: the synthesis is the first thing a reader sees, and most readers have never invested.
// Ten real Quick reads on 2026-10-09 (guest, es and en, questions such as "I've never invested. Is Micron a
// good first stock?") came back with RSI, EMA20, "sobrecomprado", "velas de 1H" and "resistencia" in the four
// lines a newcomer reads, never said what the asset is, and copied the evidence's English labels into Spanish.
// The CIO's instructions already asked for "plain words for someone new to markets"; this file says what that
// means and counts how often it is missed.
//   · Three ways of wording the same read (SPEECH): plain, terms (plain first, the term in brackets) and
//     technical (the desk as it always spoke). The person picks one on the dial and the phone sends it with each
//     question (`speech`); without it, a profile that says "experienced" reads technical and everyone else plain.
//   · The rule goes to the CIO only. It changes how the answer is worded, never the verdict, the direction or
//     the sufficiency note.
//   · chartWordsIn is the meter: the chart words left in the four lines. The desk logs the count and the words
//     (they come from the list below, never from the reader), so the rule can be measured in production.
// Nothing here calls a model, rewrites an answer or refuses a read.
// ============================================================
import type { AppLanguage } from '../../src/lib/app-language.js';
import type { Experience } from './user-memory.js';

/** A reader who chose "experienced" keeps the desk's own vocabulary. Everyone else, guests included, is new. */
export const wantsPlainWords = (experience: Experience | null | undefined) => experience !== 'experienced';

/** How Bobby words an answer. The person chooses it on the dial (1.9); the evidence and the verdict are the same in all three. */
export const SPEECH = ['plain', 'terms', 'technical'] as const;
export type Speech = typeof SPEECH[number];

/**
 * The wording of one read: what the person chose on this request, else what their profile says (only
 * "experienced" means the desk's own vocabulary), else plain. A guest who never touched the dial is new.
 */
export const speechFor = (requested: Speech | null | undefined, experience: Experience | null | undefined): Speech =>
  requested ?? (wantsPlainWords(experience) ? 'plain' : 'technical');

const ASSET_AND_LANGUAGE = " When the question says the reader is new, asks what the asset is, or asks whether it suits a beginner, headline answers that person in their own terms (what this evidence can and cannot tell someone starting out), and why opens with one stable, widely known fact about what the asset is (what the company makes, what the network is for), without any figure, date, news or opinion, and only if you are certain of it; why may then use up to 30 words. Every field is written wholly in the reader's language: position sides, trend and momentum labels in the evidence are data labels, so translate them and never copy them as they are.";
export const PLAIN_RULE = " The reader has never invested: synthesis is written for them, and so is analysis. In synthesis never use an indicator's name or a chart word (RSI, EMA, MACD, moving average, overbought, oversold, momentum, support, resistance, candle, timeframe, 1H, 4H, 1D, 1W, setup, breakout, pullback, or their equivalents in the reader's language): say what it means instead. A high RSI is 'it rose fast in the last hours'; a low one, 'it fell fast in the last hours'; an EMA is 'its average price of the last hours'; support is 'a floor near N, where the price stopped falling before'; resistance is 'a ceiling near N, where it stopped rising before'; 1H evidence is 'an hour-by-hour view of the last days', 1D 'day by day', 1W 'week by week'; a lateral trend is 'moving sideways'. Numbers stay exactly as the evidence gives them. In analysis you may name an indicator once, in brackets, after its plain meaning." + ASSET_AND_LANGUAGE;
/** The middle of the dial: the plain meaning first, then the word for it, so the reader picks the vocabulary up. */
export const TERMS_RULE = " The reader is learning the vocabulary of markets: synthesis and analysis are written for them. Say each idea in plain words first and then name its term once, in brackets: 'a ceiling near N, where it stopped rising before (resistance)', 'it rose fast in the last hours (overbought)', 'its average price of the last hours (EMA20)', 'an hour-by-hour view of the last days (1H)'. Never a term or a code by itself, and never more than one term in a line. Numbers stay exactly as the evidence gives them." + ASSET_AND_LANGUAGE;
/** The CIO's wording rule for a read. Technical adds nothing: the desk speaks as it always did. */
export const speechRule = (speech: Speech) => speech === 'plain' ? PLAIN_RULE : speech === 'terms' ? TERMS_RULE : '';

// Words that belong to a chart. Latin tickers and codes are the same in the six languages.
const CODES = /(?<![\p{L}\p{N}])(RSI\d*|EMA\d*|SMA\d*|MACD|ATR|VWAP|1H|4H|1D|1W|1M)(?![\p{L}\p{N}])/giu;
const WORDS: Record<AppLanguage, RegExp> = {
  en: /\b(overbought|oversold|momentum|resistance|candles?|candlesticks?|timeframes?|moving averages?|breakout|pullback|setup|(?:holds?|breaks?|near|above|below|at|toward|to)\s+support|support\s+(?:at|near|level|of|around|sits?)\b)/giu,
  es: /(?<![\p{L}])(sobrecompra(?:do|da)?|sobreventa|sobrevendid[oa]|momentum|resistencias?|soportes?|velas?|temporalidad(?:es)?|medias?\s+m[oó]vil(?:es)?|ruptura|retroceso)(?![\p{L}])/giu,
  fr: /(?<![\p{L}])(surachat|survente|surachet[ée]e?|survendue?|momentum|r[ée]sistances?|supports?|bougies?|unit[ée]s?\s+de\s+temps|moyennes?\s+mobiles?)(?![\p{L}])/giu,
  pt: /(?<![\p{L}])(sobrecompra(?:do|da)?|sobrevenda|sobrevendid[oa]|momentum|resist[êe]ncias?|suportes?|velas?|candles?|tempos?\s+gr[áa]ficos?|m[ée]dias?\s+m[óo]ve(?:l|is))(?![\p{L}])/giu,
  it: /(?<![\p{L}])(ipercomprat[oa]|ipervendut[oa]|ipercomprato|momentum|resistenz[ae]|support[oi]|candel[ae]|timeframe|medi[ae]\s+mobil[ei])(?![\p{L}])/giu,
  de: /(?<![\p{L}])([üu]berkauft|[üu]berverkauft|momentum|widerst[aä]nde?|unterst[üu]tzung(?:en)?|kerzen?|zeitrahmen|zeiteinheit(?:en)?|gleitende[rn]?\s+durchschnitte?)(?![\p{L}])/giu,
};

/** The chart words in a text, lower-cased and without repeats, in the order they appear. */
export function chartWordsIn(text: string, language: AppLanguage): string[] {
  const found: string[] = [];
  const add = (m: RegExpMatchArray) => { const w = m[0].toLowerCase().replace(/\s+/g, ' ').trim(); if (!found.includes(w)) found.push(w); };
  for (const m of text.matchAll(CODES)) add(m);
  for (const m of text.matchAll(WORDS[language] ?? WORDS.en)) add(m);
  return found;
}

/** The four lines a reader sees first, as one text for the meter. */
export const firstLines = (s: { headline: string; why: string; risk: string; watch: string }) => [s.headline, s.why, s.risk, s.watch].join(' · ');
