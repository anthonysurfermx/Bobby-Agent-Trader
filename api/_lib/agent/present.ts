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
import { NAMED_NUMBER, NUMBER_WORD, fold } from '../companion-review.js';
import { UNIVERSE, WINDOWS, instrumentName, resolveMention } from './tools.js';
import type { Analysis, Figure, Presentation } from './types.js';

export interface Draft { kind: Presentation['kind']; gist: string; text: string; limitations: string[]; next: string; claims: Array<{ metric: string; top: string }> }
export type Refusal = { code: 'unknown_figure' | 'figure_without_value' | 'typed_number' | 'bad_placeholder' | 'claim_contradicts_figures' | 'claim_cannot_be_checked' | 'too_long' | 'empty'; detail: string };

const PLACEHOLDER = /\{\{((?:f|d|from|to):[A-Za-z0-9_~]+|days)\}\}/g;
const SIGNED = new Set(['return', 'drawdown', 'worst', 'best']);

/** One figure as a person reads it: 12.3 → "+12.3%" (en-US), "+12,3 %" (de-DE). The value is never rounded elsewhere. */
export function formatFigure(figure: Figure, language: AppLanguage, locale?: string | null): string {
  const tag = appLocale(language, locale ?? undefined);
  if (figure.value === null) return '';
  if (figure.unit === 'percent') return new Intl.NumberFormat(tag, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: SIGNED.has(figure.metric) ? 'exceptZero' : 'auto' }).format(figure.value / 100);
  if (figure.unit === 'price') return `${new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: figure.value < 1 ? 6 : 2 }).format(figure.value)}${figure.currency ? ` ${figure.currency}` : ''}`;
  return new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(figure.value);
}

/** A day as a person reads it: "15 de septiembre", "September 15". The year is the window's and is not repeated. */
export const formatDay = (day: string, language: AppLanguage, locale?: string | null) => new Intl.DateTimeFormat(appLocale(language, locale ?? undefined), { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

// ---------- what the model may not write ----------
// Everything below reads FOLDED text (lower case, no accents, look-alike digits as digits, one space between words):
// the same folding as the companion's own reader, whose lists of number words and of names that hold a number are reused.
/** Stands where code will write a figure or a date. */
const MARK = '\uFFFC';
/** Stands where code will write the window's length, which is a count of days and nothing else. */
const COUNT = '\uE000';
const MARKS = `${MARK}${COUNT}`;
const marksShown = (text: string) => text.replace(new RegExp(`[${MARKS}]`, 'g'), '{{…}}');
const read = (text: string) => fold(text).replace(/[‐‑]/g, '-').replace(/\s+/g, ' ');
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The engine's instruments whose name holds a number, in any spelling of the spaces: "S&P 500", "S&P-500-ETF", "Nasdaq‑100". */
const INSTRUMENT_NAMES = [...new Set(UNIVERSE.flatMap((instrument) => [instrument.name, ...instrument.aliases]).filter((name) => /\d/.test(name)).map(read))]
  .sort((a, b) => b.length - a.length).map((name) => new RegExp(`(?<![a-z0-9])${name.split(/[\s-]+/).map(escaped).join('[\\s-]*')}(?![a-z0-9])`, 'g'));
/** A name is a name: an instrument, an index, "24/7", "Web3". What is left holds only numbers somebody is stating. */
const withoutNames = (folded: string) => INSTRUMENT_NAMES.reduce((left, name) => left.replace(name, ' '), folded).replace(NAMED_NUMBER, ' ');

const LENGTHS = new Set<string>(WINDOWS.map(String));
const A_LENGTH = `(?:${[...LENGTHS].join('|')}|${COUNT})`;
const OR = '(?:,|o|or|ou|oder|e|y|and|und|et)';
const DAY_WORD = '(?:(?:derniers|dernieres|premiers|prochains|trading|calendar|business|market)\\s+)?(?:(?:handels|kalender|borsen)?tag(?:e[ns]?|ig[a-z]*)?|dias?|days?|jours?|giorn[io]|sesiones|sessions?|sedute|sessoes)(?![a-z])';
const DAYS_AFTER = new RegExp(`^(?:\\s*${OR}\\s*${A_LENGTH})*[\\s-]*${DAY_WORD}`);
const DAYS_BEFORE = new RegExp(`${A_LENGTH}[\\s-]*${DAY_WORD}\\s*${OR}\\s*$`);
/** A window length is one only where it counts days: "60 días", "30-day", "30 or 60 days", "30 días o 60". Never "60 mil", "un 60". */
const countsDays = (folded: string, at: number, length: number) => DAYS_AFTER.test(folded.slice(at + length)) || DAYS_BEFORE.test(folded.slice(0, at));

const PERCENT_WORD = 'por\\s?cien(?:to)?|percent|per[\\s-]?cent|pour[\\s-]?cent|prozent(?:ig[a-z]*)?|per\\s?cento|por\\s?cento|pct|puntos?\\s+porcentuales|percentage\\s+points?|prozentpunkte?n?|punti\\s+percentuali|points?\\s+de\\s+pourcentage|pontos?\\s+percentuais';
/** A percentage OF something: a number, a placeholder or a number in words, then the sign or the word. The bare word ("a percentage of what you hold") is not one. */
const WITH_PERCENT = new RegExp(`(\\p{N}+(?:[.,]\\p{N}+)*|[${MARKS}]|(?<![a-z])${NUMBER_WORD}(?![a-z]))(?:\\s?[%‰٪]|[\\s-]*(?:${PERCENT_WORD})(?![a-z]))`, 'gu');
/** "1 000" (the French way) is one number. */
const NUMBER = /\p{N}{1,3}(?: \p{N}{3})+(?!\p{N})|\p{N}+(?:[.,]\p{N}+)*/gu;
const wholeOf = (n: string) => (/^\p{N}{1,3}(?:[., ]\p{N}{3})+$/u.test(n) ? n.replace(/[., ]/g, '') : /^\p{N}+$/u.test(n) ? n : null);
const decimalOf = (n: string) => (/^\p{N}+[.,](?:\p{N}{1,2}|\p{N}{4,})$/u.test(n) ? n.replace(',', '.') : null);

/**
 * Checks one string of a draft. Null when it can be shown. What is read is the model's OWN words: each placeholder
 * is replaced by a mark and the text is folded. Then:
 *   · nothing may be glued to a placeholder (a letter, a digit, a sign), and two placeholders may not join into one
 *     number: "60{{f:x}}", "{{days}}{{days}}", "60.{{days}}";
 *   · {{days}} and a typed window length count days and nothing else: "60 días" yes, "60 mil dólares" no;
 *   · a percentage is code's to write. The model may say back a percentage the person wrote ("your 10%") and may
 *     use the bare word ("a percentage of what you hold"); it may not state one of its own, in digits or in words;
 *   · any other number is allowed only when it is part of a name ("S&P 500", "24/7") or is a number the person
 *     wrote, as a whole number of theirs: their 1000 lets 1,000 through, never 100 nor 10.00; a name in their
 *     question ("Nasdaq 100") lends no number at all.
 */
function refuse(text: string, figures: Map<string, Figure>, question: string, days: number | null): Refusal | null {
  if (new RegExp(`[${MARKS}]`).test(text)) return { code: 'bad_placeholder', detail: 'a character only the app writes' };
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match[1] === 'days') { if (days === null) return { code: 'bad_placeholder', detail: '{{days}} with no window read' }; continue; }
    const [kind, id] = match[1].split(':'), figure = figures.get(id);
    if (!figure) return { code: 'unknown_figure', detail: id };
    if (kind === 'f' ? figure.value === null : kind === 'd' ? !figure.day : !figure[kind as 'from' | 'to']) return { code: 'figure_without_value', detail: figure.id };
  }
  let own = read(text.replace(PLACEHOLDER, (_, key: string) => (key === 'days' ? COUNT : MARK)));
  if (/\{\{|\}\}/.test(own)) return { code: 'bad_placeholder', detail: own.match(/\{\{[^}]{0,30}|[^{]{0,30}\}\}/)?.[0] ?? '' };
  const glued = new RegExp(`[\\p{L}\\p{N}%+\\-−][${MARKS}]|[${MARKS}][\\p{L}\\p{N}%]`, 'u').exec(own);
  if (glued) return { code: 'bad_placeholder', detail: `glued: ${marksShown(glued[0])}` };
  const joined = new RegExp(`[${MARKS}][.,]?[${MARKS}]|\\p{N}[.,][${MARKS}]|[${MARKS}][.,]\\p{N}`, 'u').exec(own);
  if (joined) return { code: 'bad_placeholder', detail: `joined: ${marksShown(joined[0])}` };
  for (const match of own.matchAll(new RegExp(COUNT, 'g'))) if (!countsDays(own, match.index!, 1)) return { code: 'bad_placeholder', detail: '{{days}} counts days: write the word for days after it' };
  // No emoji (the instructions say so): a keycap or a counting sign is a number too.
  const picture = /\p{Extended_Pictographic}|\u20E3/u.exec(own);
  if (picture) return { code: 'typed_number', detail: 'an emoji' };
  own = withoutNames(own);
  let asked = withoutNames(read(question.replace(new RegExp(`[${MARKS}]`, 'g'), ' ')));
  const sameQuantity = (quantity: string) => quantity.replace(',', '.');
  const theirPercents = new Set([...asked.matchAll(WITH_PERCENT)].map((match) => sameQuantity(match[1])));
  for (const match of own.matchAll(WITH_PERCENT)) if (!theirPercents.has(sameQuantity(match[1]))) return { code: 'typed_number', detail: marksShown(match[0]) };
  own = own.replace(WITH_PERCENT, ' '); asked = asked.replace(WITH_PERCENT, ' ');
  if (/[%‰٪]/.test(own)) return { code: 'typed_number', detail: '%' };
  const said = [...asked.matchAll(NUMBER)].map((match) => match[0]);
  const theirs = new Set(said), wholes = new Set(said.map(wholeOf)), decimals = new Set(said.map(decimalOf));
  for (const match of own.matchAll(NUMBER)) {
    const typed = match[0], whole = wholeOf(typed), decimal = decimalOf(typed);
    if (LENGTHS.has(typed) && countsDays(own, match.index!, typed.length)) continue;
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
export function present(draft: Draft, analysis: Analysis | null, question: string, language: AppLanguage, locale?: string | null): { ok: true; presentation: Presentation } | { ok: false; refusal: Refusal } {
  const figures = new Map((analysis?.figures ?? []).map((figure) => [figure.id, figure]));
  const gist = draft.gist.trim(), text = draft.text.trim(), next = draft.next.trim();
  if (!gist || !text) return { ok: false, refusal: { code: 'empty', detail: '' } };
  const days = analysis?.windowDays ?? null;
  for (const part of [gist, text, next, ...draft.limitations]) { const refusal = refuse(part, figures, question, days); if (refusal) return { ok: false, refusal }; }
  for (const claim of draft.claims) {
    // The model may name the subject by its name: code turns it into the symbol, as for a tool.
    const top = resolveMention(claim.top)?.symbol ?? claim.top;
    if (!analysis?.subjects.includes(top) || [...figures.values()].filter((figure) => figure.metric === claim.metric && figure.value !== null).length < 2) return { ok: false, refusal: { code: 'claim_cannot_be_checked', detail: `${claim.metric}:${claim.top}` } };
    if (!claimHolds({ metric: claim.metric, top }, figures)) return { ok: false, refusal: { code: 'claim_contradicts_figures', detail: `${claim.metric}:${claim.top}` } };
  }
  const written = write(text, figures, days, language, locale), front = write(gist, figures, days, language, locale);
  if (front.length > 200 || written.length > 1100) return { ok: false, refusal: { code: 'too_long', detail: `${front.length}/${written.length}` } };
  const used = [...new Set([...`${gist} ${text}`.matchAll(PLACEHOLDER)].filter((match) => match[1] !== 'days').map((match) => match[1].split(':')[1]))];
  // The analysis's own limits are always on the answer, in code's words; the model's come after them.
  const fixed = draft.kind === 'analysis' ? limitationsInWords(analysis, language) : [];
  const limitations = [...fixed, ...draft.limitations.map((line) => write(line, figures, days, language, locale)).filter((line) => line && !fixed.includes(line))].slice(0, 5);
  // The sentence in front is always the exact start of the text, as in the companion's contract. When the model's
  // gist is not how its text begins, the text's own first sentence stands in front: nothing is said twice.
  // A full stop after a digit ("16. September") or after a single letter ("U.S.") does not end a sentence.
  const opening = written.startsWith(front) ? front : (/^.{12,200}?(?<!\p{N}|(?<!\p{L})\p{L})[.!?…](?=\s|$)/su.exec(written)?.[0] ?? written.slice(0, 200));
  return { ok: true, presentation: { kind: draft.kind, gist: opening, text: written, figures: used, references: draft.kind === 'analysis' ? references(analysis, used) : [], limitations, next: next ? write(next, figures, days, language, locale) : null, composedByCode: false } };
}
