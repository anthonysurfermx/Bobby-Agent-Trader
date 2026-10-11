// ============================================================
// The agent engine: from the full analysis to what a person reads and hears, without changing a number.
//
// The model writes sentences; code writes numbers and dates. In the model's text a figure is a placeholder,
// {{f:id}}; the day of a one-day figure is {{d:id}}; the first and last day a figure covers are {{from:id}} and
// {{to:id}}; the window's length is {{days}}. This file:
//   1. refuses a text that names a figure that does not exist or has no value, that states a number or a
//      percentage of its own (a name such as "S&P 500" or "24/7" is a name; the person's own numbers are theirs
//      to hear back), or whose stated orderings ("the larger fall was X") contradict the figures;
//   2. writes each figure in the person's language, with its unit, from the canonical value;
//   3. when the model's text cannot be shown, composes a plain one from the figures, by code, in six languages.
// The analysis itself is never edited here: the presentation is a reading of it.
// ============================================================
import { appLocale, type AppLanguage } from '../../../src/lib/app-language.js';
import { NUMBER_WORD, fold } from '../companion-review.js';
import { DATE_MARK, FIGURE_MARK } from './reader.js';
import { UNIVERSE, WINDOWS, instrumentName, resolveMention } from './tools.js';
import type { Analysis, Figure, Presentation } from './types.js';

export interface Draft { kind: Presentation['kind']; gist: string; text: string; limitations: string[]; next: string; claims: Array<{ metric: string; top: string }> }
/** A draft as its author wrote it, with every number and date of code's replaced by a mark. */
export interface OwnWords { text: string; limitations: string[]; next: string | null }
export type Refusal = { code: 'unknown_figure' | 'figure_without_value' | 'typed_number' | 'bad_placeholder' | 'claim_contradicts_figures' | 'claim_cannot_be_checked' | 'too_long' | 'empty'; detail: string };

const PLACEHOLDER = /\{\{((?:f|d|from|to):[A-Za-z0-9_~]+|days)\}\}/g;
/** Written with its sign, so no dash before it can be read as one. */
const SIGNED = new Set(['return', 'drawdown', 'worst', 'best', 'correlation']);

/** One figure as a person reads it: 12.3 → "+12.3%" (en-US), "+12,3 %" (de-DE). The value is never rounded elsewhere. */
export function formatFigure(figure: Figure, language: AppLanguage, locale?: string | null): string {
  const tag = appLocale(language, locale ?? undefined);
  if (figure.value === null) return '';
  if (figure.unit === 'percent') return new Intl.NumberFormat(tag, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: SIGNED.has(figure.metric) ? 'exceptZero' : 'auto' }).format(figure.value / 100);
  if (figure.unit === 'price') return `${new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: figure.value < 1 ? 6 : 2 }).format(figure.value)}${figure.currency ? ` ${figure.currency}` : ''}`;
  return new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: SIGNED.has(figure.metric) ? 'exceptZero' : 'auto' }).format(figure.value);
}

/** A day as a person reads it: "15 de septiembre", "September 15". The year is the window's and is not repeated. */
export const formatDay = (day: string, language: AppLanguage, locale?: string | null) => new Intl.DateTimeFormat(appLocale(language, locale ?? undefined), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

// ---------- what the model may not write ----------
// Everything below reads FOLDED text (lower case, no accents, look-alike digits as digits, one space between words):
// the same folding as the companion's own reader, whose list of number words is reused. The names that hold a number are
// the engine's own list: the companion's is looser on purpose (it has a second reader for every text; here code is the promise).
/** Stands where code will write a figure or a date. */
const MARK = '\uFFFC';
/** Stands where code will write the window's length, which is a count of days and nothing else. */
const COUNT = '\uE000';
const MARKS = `${MARK}${COUNT}`;
const marksShown = (text: string) => text.replace(new RegExp(`[${MARKS}]`, 'g'), '{{…}}');
/** Characters nobody sees (a zero-width space, a soft hyphen, a joiner) separate nothing: they are dropped before anything is looked for. */
const read = (text: string) => fold(text).replace(/\p{Cf}/gu, '').replace(/[‐‑]/g, '-').replace(/\s+/g, ' ');
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * A name's number is not a name's when something follows that makes it a quantity: "Dow 30 mil puntos", "IBEX 35 por
 * ciento", "Russell 2000 dólares", "S&P 500 k". Folded text.
 */
const AFTER_A_NAME = '(?!\\s?[%‰‱٪]|[\\s-]+(?:k|mil|miles|millon(?:es)?|thousand|millions?|billions?|mille|milliers?|milliards?|mila|milion[ei]|miliard[oi]|tausend|millionen|milliarden?|milhao|milhoes|bilhoes|por\\s?cien(?:to)?|percent|per[\\s-]?cent|pour[\\s-]?cent|prozent|per\\s?cento|por\\s?cento|pct|dolar(?:es)?|dollars?|dollar[io]|pesos?|euros?|usd|eur|mxn|usdt|puntos?|points?(?!\\s+(?:to|out|at)(?![a-z]))|punkte?n?|punt[oi]|pontos?|veces|times|fois|volte|vezes)(?![a-z]))';
/** The engine's instruments whose name holds a number, in any spelling of the spaces: "S&P 500", "S&P-500-ETF", "Nasdaq‑100". */
const INSTRUMENT_NAMES = [...new Set(UNIVERSE.flatMap((instrument) => [instrument.name, ...instrument.aliases]).filter((name) => /\d/.test(name)).map(read))]
  .sort((a, b) => b.length - a.length).map((name) => new RegExp(`(?<![a-z0-9])${name.split(/[\s-]+/).map(escaped).join('[\\s-]*')}(?![a-z0-9])${/\d$/.test(name) ? AFTER_A_NAME : ''}`, 'g'));
/**
 * Names that hold a number, each with ITS number: an index is "DAX 40", never "DAX 9000"; "paso 12" is no name at
 * all (folded, the verb "pasó" is the same word).
 */
const NAMES = new RegExp(`(?<![a-z0-9])(?:(?:s&p\\s*500|nasdaq[\\s-]*100|russell[\\s-]*[123]000|dax[\\s-]*40|cac[\\s-]*40|ftse[\\s-]*(?:100|250)|ibex[\\s-]*35|(?:euro\\s*)?stoxx[\\s-]*(?:50|600)|nikkei[\\s-]*225|dow(?:\\s+jones)?[\\s-]*30|401k|403b|web\\s?3|24\\s*\\/\\s*7|24\\s*(?:ore|heures|h)\\s*(?:su|sur|\\/)\\s*24)(?![a-z0-9])${AFTER_A_NAME}|(?:401\\s?\\(k\\)s?|403\\s?\\(b\\)s?)(?![a-z0-9]))`, 'g');
/** Names an explanation may need and an analysis has no use for: beside figures, "60/40" or "24 horas" would read as a result or a period. */
const NAMES_OF_AN_EXPLANATION = new RegExp(`(?<![a-z0-9])(?:covid[\\s-]?19|t\\+[0-3]|60\\/40|magnificent\\s+7|24\\s*(?:horas|hours|heures|ore|stunden))(?![a-z0-9])${AFTER_A_NAME}`, 'g');
/** A name is a name: an instrument, an index, "24/7", "Web3". What is left holds only numbers somebody is stating. */
const withoutNames = (folded: string, explaining = true) => { const left = INSTRUMENT_NAMES.reduce((rest, name) => rest.replace(name, ' '), folded).replace(NAMES, ' '); return explaining ? left.replace(NAMES_OF_AN_EXPLANATION, ' ') : left; };

const LENGTHS = new Set<string>(WINDOWS.map(String));
const A_LENGTH = `(?:${[...LENGTHS].join('|')}|${COUNT})`;
const OR = '(?:,|o|or|ou|oder|e|y|and|und|et)';
// The window is in CALENDAR days: a word for sessions or trading days after its length would state a wrong count
// (thirty calendar days hold about twenty-two sessions).
// The same holds for a qualifier AFTER the plain word ("30 días hábiles", "jours de bourse", "giorni di borsa").
const DAY_WORD = '(?:(?:derniers|dernieres|premiers|prochains|calendar)\\s+)?(?:(?:kalender)?tag(?:e[ns]?|ig[a-z]*)?|dias?|days?|jours?|giorn[io])(?![a-z])(?!\\s+(?:habiles|laborables|bursatiles|uteis|ouvres|ouvrables|ouvrees|lavorativi|de\\s+(?:bolsa|mercado|negociacion|cotizacion|bourse|cotation|pregao|negociacao)|di\\s+(?:borsa|mercato|contrattazione)|of\\s+trading|an\\s+der\\s+borse)(?![a-z]))';
const DAYS_AFTER = new RegExp(`^(?:\\s*${OR}\\s*${A_LENGTH})*[\\s-]*${DAY_WORD}`);
// "30 días o 60": only an "or"/"and" between them (never a comma: "En los últimos 30 días, 60 mil…"), and the second ends the phrase.
const DAYS_BEFORE = new RegExp(`${A_LENGTH}[\\s-]*${DAY_WORD}\\s*(?:o|or|ou|oder|e|y|and|und|et)\\s*$`);
const ENDS_THERE = /^\s*(?:[.,;:!?)\]»”"']|$)/;
/** A window length is one only where it counts days: "60 días", "30-day", "30 or 60 days", "30 días o 60". Never "60 mil", "un 60". */
const countsDays = (folded: string, at: number, length: number) => DAYS_AFTER.test(folded.slice(at + length)) || (DAYS_BEFORE.test(folded.slice(0, at)) && ENDS_THERE.test(folded.slice(at + length)));

const PERCENT_WORD = 'por\\s?cien(?:to)?|percent|per[\\s-]?cent|pour[\\s-]?cent|prozent(?:ig[a-z]*)?|per\\s?cento|por\\s?cento|pct|puntos?\\s+porcentual(?:es)?|percentage\\s+points?|prozentpunkte?n?|punt[oi]\\s+percentual[ei]|points?\\s+de\\s+pourcentage|pontos?\\s+percentua(?:l|is)';
/**
 * Number words that can stand before a percent word, beyond the companion's list (which starts at two and has few teens):
 * one, a half, the teens, the tens and their compounds, a hundred, in the six languages (folded). Used ONLY in front of a
 * percent word, where "once", "cent" or "sei" cannot be anything else. An article ("un por ciento", "a percent") is not
 * here on purpose: the same word opens "Un punto porcentual es…"; that one is the second reader's.
 */
const SMALL_NUMBER = ['zero', 'cero', 'null', 'dici[a-z]+', '(?:vent|trent|quarant|cinquant|sessant|settant|ottant|novant)(?:uno|otto)', 'vingts', '[a-z]+einhalb', 'anderthalb', 'one', 'half(?: an?)?', 'eleven', 'twelve', '[a-z]+teen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred',
  'uno', 'medio', 'media', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieci[a-z]+', 'veint[a-z]+', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa', 'cien', 'ciento',
  'demi', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'cent',
  'mezzo', 'undici', '[a-z]+dici', 'venti[a-z]*', 'trenta[a-z]*', 'quaranta[a-z]*', 'cinquanta[a-z]*', 'sessanta[a-z]*', 'settanta[a-z]*', 'ottanta[a-z]*', 'novanta[a-z]*', 'cento',
  'meio', 'meia', 'doze', 'treze', 'catorze', 'dez[a-z]+', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'cem',
  'eins', 'halb[a-z]*', 'elf', 'zwolf', '[a-z]*zehn', '[a-z]*zig', '[a-z]*ssig', 'hundert'].join('|');
/** A percentage OF something: a number, a placeholder or a number in words, then the sign or the word. The bare word ("a percentage of what you hold") is not one. */
const WITH_PERCENT = new RegExp(`(\\p{N}+(?:[.,]\\p{N}+)*|[${MARKS}]|(?<![a-z])(?:${NUMBER_WORD}|${SMALL_NUMBER})(?![a-z]))(?:\\s?[%‰‱٪]|[\\s-]*(?:${PERCENT_WORD})(?![a-z]))`, 'gu');
/** Words that scale the number before them. */
const SCALE = 'k|m|bn|mm|mio|mrd|mil|miles|cientos?|hundreds?|millon(?:es)?|billon(?:es)?|trillon(?:es)?|thousand|millions?|billions?|trillions?|mille|milliers?|milliards?|mila|milion[ei]|miliard[oi]|tausend|millionen|milliarden?|billionen?|milhao|milhoes|bilhoes|veces|times|fois|volte|vezes';
/**
 * A whole number and the word that scales it are one number: "10 mil" is 10000, "2 millones" is 2000000, "40 mil
 * millones" is 40000000000. Read that way in the question and in the draft alike, so "tus 10 mil" is their 10,000 and
 * "60 mil" is nobody's 60. ASCII digits only: a digit of another script stays a number (refused below), never arithmetic.
 */
const SCALED: Array<[RegExp, number]> = [
  [/(?<![\p{N}.,])([0-9]{1,9})\s?(?:k|mil|thousand|mille|mila|tausend)(?![a-z'’])/gu, 1e3],
  [/(?<![\p{N}.,])([0-9]{1,9})\s*(?:millon(?:es)?|millions?|millionen|milion[ei]|milhao|milhoes)(?![a-z])/gu, 1e6],
  [/(?<![\p{N}.,])([0-9]{1,9})\s*(?:bn|billions?|milliards?|milliarden?|miliard[oi]|bilhoes)(?![a-z])/gu, 1e9],
];
const unscaled = (folded: string) => SCALED.reduce((text, [pattern, times]) => text.replace(pattern, (_, n: string) => ` ${Number(n) * times} `), folded);
/** "1 000" (the French way) is one number. */
const NUMBER = /\p{N}{1,3}(?: \p{N}{3})+(?!\p{N})|\p{N}+(?:[.,]\p{N}+)*/gu;
const wholeOf = (n: string) => (/^\p{N}{1,3}(?:[., ]\p{N}{3})+$/u.test(n) ? n.replace(/[., ]/g, '') : /^\p{N}+$/u.test(n) ? n : null);
const decimalOf = (n: string) => (/^\p{N}+[.,](?:\p{N}{1,2}|\p{N}{4,})$/u.test(n) ? n.replace(',', '.') : null);

/**
 * Checks one string of a draft. Null when it can be shown. What is read is the model's OWN words: each placeholder
 * is replaced by a mark and the text is folded. Then:
 *   · nothing may be glued to a placeholder (a letter, a digit, a sign), and two placeholders may not join into one
 *     number: "60{{f:x}}", "{{days}}{{days}}", "60.{{days}}";
 *   · {{days}} and a typed window length count calendar days and nothing else: "60 días" yes, "60 mil dólares" and
 *     "60 sesiones" and "60 días hábiles" no; in the answer itself a typed length is the window that was read and no
 *     other, whoever wrote the number first (`aside` lifts that for a limitation and the next question, and
 *     `explaining` for a text that is no analysis: what a draft IS decides, not whether its thread holds figures);
 *   · a percentage is code's to write. The model may say back a percentage the person wrote ("your 10%") and may
 *     use the bare word ("a percentage of what you hold"); it may not state one of its own, in digits or in words;
 *   · any other number is allowed only when it is part of a name ("S&P 500", "24/7") or is a number the person
 *     wrote, as a whole number of theirs: their 1000 lets 1,000 through, never 100 nor 10.00; a name in their
 *     question ("Nasdaq 100") lends no number at all.
 */
function refuse(text: string, figures: Map<string, Figure>, question: string, days: number | null, aside = false, explaining = days === null): Refusal | null {
  // The marks code puts in place of a number (here, and for the second reader) are code's: a draft that types one is refused.
  if (new RegExp(`[${MARKS}\u27E6\u27E7]`).test(text)) return { code: 'bad_placeholder', detail: 'a character only the app writes' };
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match[1] === 'days') { if (days === null) return { code: 'bad_placeholder', detail: '{{days}} with no window read' }; continue; }
    const [kind, id] = match[1].split(':'), figure = figures.get(id);
    if (!figure) return { code: 'unknown_figure', detail: id };
    if (kind === 'f' ? figure.value === null : kind === 'd' ? !figure.day : !figure[kind as 'from' | 'to']) return { code: 'figure_without_value', detail: figure.id };
  }
  // Characters that reorder what follows: what a person sees would not be what was checked.
  if (/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]/.test(text)) return { code: 'bad_placeholder', detail: 'a character that reorders text' };
  // Read on the text as written, before folding hides them: a keycap's enclosing mark, and a number that is a letter (Ⅻ).
  if (/\u20E3/.test(text)) return { code: 'typed_number', detail: 'an emoji' };
  const lettered = /\p{Nl}/u.exec(text);
  if (lettered) return { code: 'typed_number', detail: lettered[0] };
  let own = read(text.replace(PLACEHOLDER, (_, key: string) => (key === 'days' ? COUNT : MARK)));
  if (/\{\{|\}\}/.test(own)) return { code: 'bad_placeholder', detail: own.match(/\{\{[^}]{0,30}|[^{]{0,30}\}\}/)?.[0] ?? '' };
  const glued = new RegExp(`[\\p{L}\\p{N}%+\\-−$€£¥₿][${MARKS}]|[${MARKS}][\\p{L}\\p{N}%]`, 'u').exec(own);
  if (glued) return { code: 'bad_placeholder', detail: `glued: ${marksShown(glued[0])}` };
  // A figure is whole as code writes it: a word after it that scales it ("millones", "k") makes another number.
  const scaled = new RegExp(`[${MARKS}]\\s?(?:${SCALE})(?![a-z'’])`).exec(own);
  if (scaled) return { code: 'bad_placeholder', detail: `scaled: ${marksShown(scaled[0])}` };
  const joined = new RegExp(`[${MARKS}][.,]?[${MARKS}]|\\p{N}[.,][${MARKS}]|[${MARKS}][.,]\\p{N}`, 'u').exec(own);
  if (joined) return { code: 'bad_placeholder', detail: `joined: ${marksShown(joined[0])}` };
  for (const match of own.matchAll(new RegExp(COUNT, 'g'))) if (!countsDays(own, match.index!, 1)) return { code: 'bad_placeholder', detail: '{{days}} counts days: write the word for days after it' };
  // No emoji (the instructions say so): a counting sign or a flag is not a word.
  const picture = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.exec(own);
  if (picture) return { code: 'typed_number', detail: 'an emoji' };
  own = withoutNames(own, explaining);
  let asked = withoutNames(read(question.replace(new RegExp(`[${MARKS}]`, 'g'), ' ')));
  const sameQuantity = (quantity: string) => quantity.replace(',', '.');
  const theirPercents = new Set([...asked.matchAll(WITH_PERCENT)].map((match) => sameQuantity(match[1])));
  for (const match of own.matchAll(WITH_PERCENT)) if (!theirPercents.has(sameQuantity(match[1]))) return { code: 'typed_number', detail: marksShown(match[0]) };
  own = own.replace(WITH_PERCENT, ' '); asked = asked.replace(WITH_PERCENT, ' ');
  if (/[%‰‱٪]/.test(own)) return { code: 'typed_number', detail: '%' };
  // A number and its scale word are one number, on both sides: their "10 mil" is 10000 and lends no bare 10.
  asked = unscaled(asked); own = unscaled(own);
  const said = [...asked.matchAll(NUMBER)].map((match) => match[0]);
  const theirs = new Set(said), wholes = new Set(said.map(wholeOf)), decimals = new Set(said.map(decimalOf));
  const stillScaled = new RegExp(`^\\s*(${SCALE})(?![a-z'’])`);
  const theirScaled = new Set([...asked.matchAll(new RegExp(`(\\p{N}+(?:[.,]\\p{N}+)*)\\s?(${SCALE})(?![a-z'’])`, 'gu'))].map((pair) => `${pair[1].replace(',', '.')} ${pair[2]}`));
  for (const match of own.matchAll(NUMBER)) {
    const typed = match[0], whole = wholeOf(typed), decimal = decimalOf(typed);
    // A scale word that is still there follows a number that is not a whole one ("1,5 millones"): that is another number, nobody's.
    const scale = stillScaled.exec(own.slice(match.index! + typed.length));
    if (scale && !theirScaled.has(`${typed.replace(',', '.')} ${scale[1]}`)) return { code: 'typed_number', detail: `${typed} and its scale` };
    // A typed length that counts days is a statement about a window. In the answer itself it is the window that was
    // read and no other: "en los últimos 60 días" over a 30-day read is false whoever wrote the 60 first, and a list of
    // both ("en 30 y 60 días Bitcoin ganó") is no better. A limitation or the next question may name either, or both.
    if (LENGTHS.has(typed) && countsDays(own, match.index!, typed.length)) {
      if (aside || explaining || typed === String(days)) continue;
      return { code: 'typed_number', detail: `${typed}: the window that was read is ${days} days (write it with {{days}}; name another length only in a limitation or in next)` };
    }
    if (theirs.has(typed) || (whole !== null && wholes.has(whole)) || (decimal !== null && decimals.has(decimal))) continue;
    return { code: 'typed_number', detail: typed };
  }
  return null;
}

/**
 * The orderings a draft commits to ("the larger fall was X"), checked against the figures. A claim about something
 * that is not a subject, or about a metric with fewer than two values, cannot be checked: that refuses it too.
 */
function claimHolds(claim: { metric: string; top: string }, figures: Map<string, Figure>): boolean {
  const same = [...figures.values()].filter((figure) => figure.metric === claim.metric && figure.value !== null);
  const mine = same.find((figure) => figure.subject === claim.top);
  if (!mine || same.length < 2) return false;
  // The larger fall, and the worse worst day, are the most negative; everything else is the largest.
  const rank = (figure: Figure) => (claim.metric === 'drawdown' || claim.metric === 'worst' ? -figure.value! : figure.value!);
  return same.every((figure) => figure === mine || rank(mine) > rank(figure));
}

const write = (text: string, figures: Map<string, Figure>, days: number | null, language: AppLanguage, locale?: string | null) =>
  // Plain white space is collapsed; the non-breaking space a language puts between a number and its unit is kept.
  text.replace(PLACEHOLDER, (_, key: string) => {
    if (key === 'days') return String(days ?? '');
    const [kind, id] = key.split(':'), figure = figures.get(id)!;
    return kind === 'f' ? formatFigure(figure, language, locale) : formatDay((kind === 'd' ? figure.day : kind === 'from' ? figure.from : figure.to)!, language, locale);
  }).replace(/[ \t\r\n]+/g, ' ').trim();

const LIMITATION: Record<string, Record<AppLanguage, (subject: string) => string>> = {
  mixed_calendars: {
    en: () => 'They trade on different calendars, so they are compared only on the days both traded.', es: () => 'Cotizan en calendarios distintos: se comparan solo los días en que ambos operaron.',
    fr: () => 'Ils ne cotent pas les mêmes jours : la comparaison porte sur les jours où les deux ont coté.', pt: () => 'Negociam em calendários diferentes: a comparação usa só os dias em que ambos negociaram.',
    it: () => 'Hanno calendari diversi: il confronto usa solo i giorni in cui entrambi hanno scambiato.', de: () => 'Sie werden an unterschiedlichen Tagen gehandelt: verglichen werden nur die Tage, an denen beide gehandelt wurden.',
  },
  no_series: {
    en: (s) => `I could not read a reliable series for ${s}.`, es: (s) => `No pude leer una serie fiable de ${s}.`, fr: (s) => `Je n’ai pas pu lire une série fiable pour ${s}.`,
    pt: (s) => `Não consegui ler uma série fiável de ${s}.`, it: (s) => `Non sono riuscito a leggere una serie affidabile per ${s}.`, de: (s) => `Für ${s} konnte ich keine verlässliche Reihe lesen.`,
  },
  past_window_only: {
    en: () => 'This is what happened in that window; it does not say what comes next.', es: () => 'Es lo que pasó en ese periodo; no dice lo que viene.',
    fr: () => 'C’est ce qui s’est passé sur cette période ; cela ne dit pas la suite.', pt: () => 'Foi o que aconteceu nesse período; não diz o que vem depois.',
    it: () => 'È quello che è successo in quel periodo; non dice cosa verrà.', de: () => 'Das ist in diesem Zeitraum passiert; es sagt nichts über das, was kommt.',
  },
};
/** The analysis's own limitations, in words, written by code: they are on the answer whatever the model wrote. */
export function limitationsInWords(analysis: Analysis | null, language: AppLanguage): string[] {
  if (!analysis) return [];
  return analysis.limitations.map((entry) => { const [code, subject] = entry.split(':'); return LIMITATION[code]?.[language](subject ? instrumentName(subject) : '') ?? null; }).filter((line): line is string => line !== null);
}

const COMPOSED: Record<AppLanguage, (a: string, b: string) => string> = {
  en: (a, b) => `Over the last {{days}} days, ${a} changed {{f:return_A}} and ${b} changed {{f:return_B}}. The largest fall from a high was {{f:drawdown_A}} for ${a} and {{f:drawdown_B}} for ${b}.`,
  es: (a, b) => `En los últimos {{days}} días, ${a} cambió {{f:return_A}} y ${b} cambió {{f:return_B}}. La mayor caída desde un máximo fue de {{f:drawdown_A}} en ${a} y de {{f:drawdown_B}} en ${b}.`,
  fr: (a, b) => `Sur les {{days}} derniers jours, ${a} a varié de {{f:return_A}} et ${b} de {{f:return_B}}. La plus forte baisse depuis un sommet a été de {{f:drawdown_A}} pour ${a} et de {{f:drawdown_B}} pour ${b}.`,
  pt: (a, b) => `Nos últimos {{days}} dias, ${a} variou {{f:return_A}} e ${b} variou {{f:return_B}}. A maior queda desde um máximo foi de {{f:drawdown_A}} em ${a} e de {{f:drawdown_B}} em ${b}.`,
  it: (a, b) => `Negli ultimi {{days}} giorni, ${a} è variato del {{f:return_A}} e ${b} del {{f:return_B}}. Il calo più ampio da un massimo è stato del {{f:drawdown_A}} per ${a} e del {{f:drawdown_B}} per ${b}.`,
  de: (a, b) => `In den letzten {{days}} Tagen hat sich ${a} um {{f:return_A}} verändert und ${b} um {{f:return_B}}. Der größte Rückgang von einem Hoch betrug {{f:drawdown_A}} bei ${a} und {{f:drawdown_B}} bei ${b}.`,
};
const COMPOSED_ONE: Record<AppLanguage, (a: string) => string> = {
  en: (a) => `Over the last {{days}} days, ${a} changed {{f:return_A}}. Its largest fall from a high was {{f:drawdown_A}}.`,
  es: (a) => `En los últimos {{days}} días, ${a} cambió {{f:return_A}}. Su mayor caída desde un máximo fue de {{f:drawdown_A}}.`,
  fr: (a) => `Sur les {{days}} derniers jours, ${a} a varié de {{f:return_A}}. Sa plus forte baisse depuis un sommet a été de {{f:drawdown_A}}.`,
  pt: (a) => `Nos últimos {{days}} dias, ${a} variou {{f:return_A}}. A sua maior queda desde um máximo foi de {{f:drawdown_A}}.`,
  it: (a) => `Negli ultimi {{days}} giorni, ${a} è variato del {{f:return_A}}. Il suo calo più ampio da un massimo è stato del {{f:drawdown_A}}.`,
  de: (a) => `In den letzten {{days}} Tagen hat sich ${a} um {{f:return_A}} verändert. Der größte Rückgang von einem Hoch betrug {{f:drawdown_A}}.`,
};
/** Three read, three told: the same two sentences as a list. */
const AND: Record<AppLanguage, string> = { en: 'and', es: 'y', fr: 'et', pt: 'e', it: 'e', de: 'und' };
const listed = (parts: string[], language: AppLanguage) => `${parts.slice(0, -1).join(', ')} ${AND[language]} ${parts.at(-1)}`;
const COMPOSED_MANY: Record<AppLanguage, { changes: (items: string) => string; change: (name: string, symbol: string) => string; falls: (items: string) => string; fall: (name: string, symbol: string) => string }> = {
  en: { changes: (items) => `Over the last {{days}} days, ${items}.`, change: (name, s) => `${name} changed {{f:return_${s}}}`, falls: (items) => `The largest fall from a high was ${items}.`, fall: (name, s) => `{{f:drawdown_${s}}} for ${name}` },
  es: { changes: (items) => `En los últimos {{days}} días, ${items}.`, change: (name, s) => `${name} cambió {{f:return_${s}}}`, falls: (items) => `La mayor caída desde un máximo fue ${items}.`, fall: (name, s) => `de {{f:drawdown_${s}}} en ${name}` },
  fr: { changes: (items) => `Sur les {{days}} derniers jours, ${items}.`, change: (name, s) => `${name} a varié de {{f:return_${s}}}`, falls: (items) => `La plus forte baisse depuis un sommet a été ${items}.`, fall: (name, s) => `de {{f:drawdown_${s}}} pour ${name}` },
  pt: { changes: (items) => `Nos últimos {{days}} dias, ${items}.`, change: (name, s) => `${name} variou {{f:return_${s}}}`, falls: (items) => `A maior queda desde um máximo foi ${items}.`, fall: (name, s) => `de {{f:drawdown_${s}}} em ${name}` },
  it: { changes: (items) => `Negli ultimi {{days}} giorni, ${items}.`, change: (name, s) => `${name} è variato del {{f:return_${s}}}`, falls: (items) => `Il calo più ampio da un massimo è stato ${items}.`, fall: (name, s) => `del {{f:drawdown_${s}}} per ${name}` },
  de: { changes: (items) => `In den letzten {{days}} Tagen: ${items}.`, change: (name, s) => `${name} {{f:return_${s}}}`, falls: (items) => `Der größte Rückgang von einem Hoch betrug ${items}.`, fall: (name, s) => `{{f:drawdown_${s}}} bei ${name}` },
};
export const UNAVAILABLE: Record<AppLanguage, string> = {
  en: 'I could not gather reliable data to answer that. Your question is still here.', es: 'No pude reunir datos fiables para responder eso. Tu pregunta sigue aquí.',
  fr: 'Je n’ai pas pu réunir des données fiables pour répondre. Ta question est toujours là.', pt: 'Não consegui reunir dados fiáveis para responder. A tua pergunta continua aqui.',
  it: 'Non sono riuscito a raccogliere dati affidabili per rispondere. La tua domanda è ancora qui.', de: 'Ich konnte keine verlässlichen Daten dafür sammeln. Deine Frage ist noch da.',
};
/** For an answer that needed no data and whose words could not be shown: it does not blame data that was never asked for. */
export const UNANSWERED: Record<AppLanguage, string> = {
  en: 'I could not answer that with the care it needs this time. Your question is still here.', es: 'Esta vez no logré responder eso con el cuidado que pide. Tu pregunta sigue aquí.',
  fr: 'Cette fois, je n’ai pas réussi à répondre avec le soin qu’il faut. Ta question est toujours là.', pt: 'Desta vez não consegui responder com o cuidado que isso pede. A tua pergunta continua aqui.',
  it: 'Questa volta non sono riuscito a rispondere con la cura che serve. La tua domanda è ancora qui.', de: 'Diesmal konnte ich das nicht mit der nötigen Sorgfalt beantworten. Deine Frage ist noch da.',
};
/** What is served when the model's words cannot be shown and there are no figures to tell instead. */
export const unanswered = (language: AppLanguage): Presentation => ({ kind: 'unavailable', gist: UNANSWERED[language], text: UNANSWERED[language], figures: [], references: [], limitations: [], next: null, composedByCode: true });

function references(analysis: Analysis | null, used: string[]): Presentation['references'] {
  if (!analysis) return [];
  const cited = new Set(analysis.figures.filter((figure) => used.includes(figure.id)).flatMap((figure) => figure.evidence));
  return analysis.evidence.filter((item) => cited.has(item.id) || item.quality !== 'valid').map((item) => ({ evidence: item.id, source: item.source, url: item.url, instrument: item.instrument, asOf: item.asOf, quality: item.quality }));
}

/** A plain reading of the analysis written by code: what is served when the model's text cannot be shown. */
export function composeByCode(analysis: Analysis | null, language: AppLanguage, locale?: string | null): Presentation {
  const figures = new Map((analysis?.figures ?? []).map((figure) => [figure.id, figure]));
  const ready = (analysis?.subjects ?? []).filter((symbol) => figures.get(`return_${symbol}`)?.value != null && figures.get(`drawdown_${symbol}`)?.value != null);
  // Whatever could be read is told: two against each other, or the one that came back, with the other named as a limit.
  if (!analysis || !ready.length) return { kind: 'unavailable', gist: UNAVAILABLE[language], text: UNAVAILABLE[language], figures: [], references: references(analysis, []), limitations: limitationsInWords(analysis, language).filter((_, n) => analysis?.limitations[n] !== 'past_window_only'), next: null, composedByCode: true };
  if (ready.length > 2) {
    const many = COMPOSED_MANY[language];
    const text = write(`${many.changes(listed(ready.map((symbol) => many.change(instrumentName(symbol), symbol)), language))} ${many.falls(listed(ready.map((symbol) => many.fall(instrumentName(symbol), symbol)), language))}`, figures, analysis.windowDays, language, locale);
    const used = [...ready.map((symbol) => `return_${symbol}`), ...ready.map((symbol) => `drawdown_${symbol}`)];
    return { kind: 'analysis', gist: text.slice(0, text.indexOf('. ') + 1) || text, text, figures: used, references: references(analysis, used), limitations: limitationsInWords(analysis, language), next: null, composedByCode: true };
  }
  const [a, b] = ready;
  const draft = (b ? COMPOSED[language](instrumentName(a), instrumentName(b)) : COMPOSED_ONE[language](instrumentName(a))).replace(/_A\}\}/g, `_${a}}}`).replace(/_B\}\}/g, `_${b}}}`);
  const text = write(draft, figures, analysis.windowDays, language, locale);
  const used = b ? [`return_${a}`, `return_${b}`, `drawdown_${a}`, `drawdown_${b}`] : [`return_${a}`, `drawdown_${a}`];
  return { kind: 'analysis', gist: text.slice(0, text.indexOf('. ') + 1) || text, text, figures: used, references: references(analysis, used), limitations: limitationsInWords(analysis, language), next: null, composedByCode: true };
}

/**
 * The model's draft, checked and written out. A refusal says what to repair; the caller may ask the model once
 * more and then falls back to composeByCode.
 */
export function present(draft: Draft, analysis: Analysis | null, question: string, language: AppLanguage, locale?: string | null): { ok: true; presentation: Presentation; own: OwnWords } | { ok: false; refusal: Refusal } {
  const figures = new Map((analysis?.figures ?? []).map((figure) => [figure.id, figure]));
  const gist = draft.gist.trim(), text = draft.text.trim(), next = draft.next.trim();
  if (!gist || !text) return { ok: false, refusal: { code: 'empty', detail: '' } };
  const days = analysis?.windowDays ?? null;
  for (const [n, part] of [gist, text, next, ...draft.limitations].entries()) { const refusal = refuse(part, figures, question, days, n > 1, days === null || draft.kind !== 'analysis'); if (refusal) return { ok: false, refusal }; }
  for (const claim of draft.claims) {
    // The model may name the subject by its name: code turns it into the symbol, as for a tool.
    const top = resolveMention(claim.top)?.symbol ?? claim.top;
    if (!analysis?.subjects.includes(top) || [...figures.values()].filter((figure) => figure.metric === claim.metric && figure.value !== null).length < 2) return { ok: false, refusal: { code: 'claim_cannot_be_checked', detail: `${claim.metric}:${claim.top}` } };
    if (!claimHolds({ metric: claim.metric, top }, figures)) return { ok: false, refusal: { code: 'claim_contradicts_figures', detail: `${claim.metric}:${claim.top}` } };
  }
  const written = write(text, figures, days, language, locale), front = write(gist, figures, days, language, locale);
  if (front.length > 200 || written.length > 1100) return { ok: false, refusal: { code: 'too_long', detail: `${front.length}/${written.length}` } };
  // Every figure a person will read is listed and referenced, wherever the model put it: in the text, in a limitation
  // or in the next question. (The sentence in front is always part of the text.)
  const used = [...new Set([...[text, next, ...draft.limitations].join(' ').matchAll(PLACEHOLDER)].filter((match) => match[1] !== 'days').map((match) => match[1].split(':')[1]))];
  // The analysis's own limits are always on the answer, in code's words; the model's come after them.
  const fixed = draft.kind === 'analysis' ? limitationsInWords(analysis, language) : [];
  const limitations = [...fixed, ...draft.limitations.map((line) => write(line, figures, days, language, locale)).filter((line) => line && !fixed.includes(line))].slice(0, 5);
  // The sentence in front is always the exact start of the text, as in the companion's contract. When the model's
  // gist is not how its text begins, the text's own first sentence stands in front: nothing is said twice.
  // The first sentence is found in the DRAFT, where a date is still a placeholder and no decimal exists: there a full
  // stop after a digit ends a sentence ("…que el S&P 500."), which in the written text it may not ("16. September").
  // A full stop after a single letter ("U.S.") never does. A text is never cut to make a sentence: if none ends within
  // 200 characters as written, the draft goes back.
  const first = new RegExp(`^.{12,}?(?<!(?<!\\p{L})\\p{L}${language === 'de' ? '|(?<!\\p{N})\\p{N}{1,2}' : ''})[.!?…](?=\\s|$)`, 'su').exec(text)?.[0] ?? text;
  const ownFirst = write(first, figures, days, language, locale);
  const opening = written.startsWith(front) ? front : (ownFirst.length <= 200 && written.startsWith(ownFirst) ? ownFirst : null);
  if (opening === null) return { ok: false, refusal: { code: 'too_long', detail: 'gist is not the exact start of text: begin text with the gist sentence, word for word' } };
  // The model's own words, for the second reader of an analysis: what code wrote is a mark, so any quantity left is the model's.
  const marked = (part: string) => part.replace(PLACEHOLDER, (_, key: string) => (key === 'days' ? String(days ?? '') : key.startsWith('f:') ? FIGURE_MARK : DATE_MARK)).replace(/[ \t\r\n]+/g, ' ').trim();
  const own: OwnWords = { text: marked(text), limitations: draft.limitations.map(marked).filter(Boolean), next: next ? marked(next) : null };
  return { ok: true, own, presentation: { kind: draft.kind, gist: opening, text: written, figures: used, references: draft.kind === 'analysis' ? references(analysis, used) : [], limitations, next: next ? write(next, figures, days, language, locale) : null, composedByCode: false } };
}
