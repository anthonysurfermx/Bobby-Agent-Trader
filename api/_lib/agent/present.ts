// ============================================================
// The agent engine: from the full analysis to what a person reads and hears, without changing a number.
//
// The model writes sentences; code writes numbers. In the model's text a figure is a placeholder, {{f:id}},
// and the window is {{days}}. This file:
//   1. refuses a text that names a figure that does not exist or has no value, that types a digit of its own
//      (the person's own numbers and names such as "S&P 500" are theirs to repeat), or whose stated orderings
//      ("the larger fall was X") contradict the figures;
//   2. writes each figure in the person's language, with its unit, from the canonical value;
//   3. when the model's text cannot be shown, composes a plain one from the figures, by code, in six languages.
// The analysis itself is never edited here: the presentation is a reading of it.
// ============================================================
import { appLocale, type AppLanguage } from '../../../src/lib/app-language.js';
import { theirNumbers } from '../companion-review.js';
import { UNIVERSE, WINDOWS, instrumentName } from './tools.js';
import type { Analysis, Figure, Presentation } from './types.js';

export interface Draft { kind: Presentation['kind']; gist: string; text: string; limitations: string[]; next: string; claims: Array<{ metric: string; top: string }> }
export type Refusal = { code: 'unknown_figure' | 'figure_without_value' | 'typed_number' | 'bad_placeholder' | 'claim_contradicts_figures' | 'too_long' | 'empty' | 'gist_not_in_front'; detail: string };

const PLACEHOLDER = /\{\{(f:[A-Za-z0-9_~]+|days)\}\}/g;
/** Names a text may contain although they hold digits. */
const NAMES_WITH_DIGITS = [...new Set(UNIVERSE.flatMap((instrument) => [instrument.name, ...instrument.aliases]).filter((name) => /\d/.test(name)))].sort((a, b) => b.length - a.length);
const SIGNED = new Set(['return', 'drawdown', 'worst', 'best']);

/** One figure as a person reads it: 12.3 → "+12.3%" (en-US), "+12,3 %" (de-DE). The value is never rounded elsewhere. */
export function formatFigure(figure: Figure, language: AppLanguage, locale?: string | null): string {
  const tag = appLocale(language, locale ?? undefined);
  if (figure.value === null) return '';
  if (figure.unit === 'percent') return new Intl.NumberFormat(tag, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: SIGNED.has(figure.metric) ? 'exceptZero' : 'auto' }).format(figure.value / 100);
  if (figure.unit === 'price') return `${new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: figure.value < 1 ? 6 : 2 }).format(figure.value)}${figure.currency ? ` ${figure.currency}` : ''}`;
  return new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(figure.value);
}

/** Every digit a text typed by itself, outside placeholders and outside names that contain digits. */
function typedNumbers(text: string): string[] {
  let bare = text.replace(PLACEHOLDER, ' ');
  for (const name of NAMES_WITH_DIGITS) bare = bare.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
  return bare.match(/\d[\d.,]*/g) ?? [];
}

/** Checks one string of a draft. Null when it can be shown. */
function refuse(text: string, figures: Map<string, Figure>, theirs: Set<string>): Refusal | null {
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match[1] === 'days') continue;
    const figure = figures.get(match[1].slice(2));
    if (!figure) return { code: 'unknown_figure', detail: match[1].slice(2) };
    if (figure.value === null) return { code: 'figure_without_value', detail: figure.id };
  }
  if (/\{\{|\}\}/.test(text.replace(PLACEHOLDER, ''))) return { code: 'bad_placeholder', detail: text.replace(PLACEHOLDER, '').match(/\{\{[^}]{0,30}|[^{]{0,30}\}\}/)?.[0] ?? '' };
  // The lengths of the windows the tool offers are not market numbers: "and over 60 days?" may be written.
  for (const typed of typedNumbers(text)) if (!theirs.has(typed.replace(/[.,]/g, '')) && !theirs.has(typed) && !WINDOWS.some((days) => String(days) === typed)) return { code: 'typed_number', detail: typed };
  return null;
}

/** "The larger fall was X", "X moved more": the orderings a draft commits to, checked against the figures. */
function claimHolds(claim: { metric: string; top: string }, figures: Map<string, Figure>): boolean | null {
  const same = [...figures.values()].filter((figure) => figure.metric === claim.metric && figure.value !== null);
  const mine = same.find((figure) => figure.subject === claim.top);
  if (!mine || same.length < 2) return null;
  // The larger fall, and the worse worst day, are the most negative; everything else is the largest.
  const rank = (figure: Figure) => (claim.metric === 'drawdown' || claim.metric === 'worst' ? -figure.value! : figure.value!);
  return same.every((figure) => figure === mine || rank(mine) > rank(figure));
}

const write = (text: string, figures: Map<string, Figure>, days: number | null, language: AppLanguage, locale?: string | null) =>
  // Plain white space is collapsed; the non-breaking space a language puts between a number and its unit is kept.
  text.replace(PLACEHOLDER, (_, key: string) => (key === 'days' ? String(days ?? '') : formatFigure(figures.get(key.slice(2))!, language, locale))).replace(/[ \t\r\n]+/g, ' ').trim();

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
export const UNAVAILABLE: Record<AppLanguage, string> = {
  en: 'I could not gather reliable data to answer that. Your question is still here.', es: 'No pude reunir datos fiables para responder eso. Tu pregunta sigue aquí.',
  fr: 'Je n’ai pas pu réunir des données fiables pour répondre. Ta question est toujours là.', pt: 'Não consegui reunir dados fiáveis para responder. A tua pergunta continua aqui.',
  it: 'Non sono riuscito a raccogliere dati affidabili per rispondere. La tua domanda è ancora qui.', de: 'Ich konnte keine verlässlichen Daten dafür sammeln. Deine Frage ist noch da.',
};

function references(analysis: Analysis | null, used: string[]): Presentation['references'] {
  if (!analysis) return [];
  const cited = new Set(analysis.figures.filter((figure) => used.includes(figure.id)).flatMap((figure) => figure.evidence));
  return analysis.evidence.filter((item) => cited.has(item.id) || item.quality !== 'valid').map((item) => ({ evidence: item.id, source: item.source, url: item.url, instrument: item.instrument, asOf: item.asOf, quality: item.quality }));
}

/** A plain reading of the analysis written by code: what is served when the model's text cannot be shown. */
export function composeByCode(analysis: Analysis | null, language: AppLanguage, locale?: string | null): Presentation {
  const figures = new Map((analysis?.figures ?? []).map((figure) => [figure.id, figure]));
  const ready = (analysis?.subjects ?? []).filter((symbol) => figures.get(`return_${symbol}`)?.value != null && figures.get(`drawdown_${symbol}`)?.value != null);
  if (!analysis || ready.length < 2) return { kind: 'unavailable', gist: UNAVAILABLE[language], text: UNAVAILABLE[language], figures: [], references: references(analysis, []), limitations: limitationsInWords(analysis, language).filter((_, n) => analysis?.limitations[n] !== 'past_window_only'), next: null, composedByCode: true };
  const [a, b] = ready;
  const draft = COMPOSED[language](instrumentName(a), instrumentName(b)).replace(/_A\}\}/g, `_${a}}}`).replace(/_B\}\}/g, `_${b}}}`);
  const text = write(draft, figures, analysis.windowDays, language, locale);
  const used = [`return_${a}`, `return_${b}`, `drawdown_${a}`, `drawdown_${b}`];
  return { kind: 'analysis', gist: text.slice(0, text.indexOf('. ') + 1) || text, text, figures: used, references: references(analysis, used), limitations: limitationsInWords(analysis, language), next: null, composedByCode: true };
}

/**
 * The model's draft, checked and written out. A refusal says what to repair; the caller may ask the model once
 * more and then falls back to composeByCode.
 */
export function present(draft: Draft, analysis: Analysis | null, question: string, language: AppLanguage, locale?: string | null): { ok: true; presentation: Presentation } | { ok: false; refusal: Refusal } {
  const figures = new Map((analysis?.figures ?? []).map((figure) => [figure.id, figure]));
  const theirs = theirNumbers(question);
  const gist = draft.gist.trim(), text = draft.text.trim(), next = draft.next.trim();
  if (!gist || !text) return { ok: false, refusal: { code: 'empty', detail: '' } };
  for (const part of [gist, text, next, ...draft.limitations]) { const refusal = refuse(part, figures, theirs); if (refusal) return { ok: false, refusal }; }
  for (const claim of draft.claims) if (claimHolds(claim, figures) === false) return { ok: false, refusal: { code: 'claim_contradicts_figures', detail: `${claim.metric}:${claim.top}` } };
  const days = analysis?.windowDays ?? null;
  const written = write(text, figures, days, language, locale), front = write(gist, figures, days, language, locale);
  if (front.length > 200 || written.length > 1100) return { ok: false, refusal: { code: 'too_long', detail: `${front.length}/${written.length}` } };
  const used = [...new Set([...`${gist} ${text}`.matchAll(PLACEHOLDER)].filter((match) => match[1] !== 'days').map((match) => match[1].slice(2)))];
  // The analysis's own limits are always on the answer, in code's words; the model's come after them.
  const fixed = draft.kind === 'analysis' ? limitationsInWords(analysis, language) : [];
  const limitations = [...fixed, ...draft.limitations.map((line) => write(line, figures, days, language, locale)).filter((line) => line && !fixed.includes(line))].slice(0, 5);
  // The sentence in front is always the exact start of the text, as in the companion's contract. When the model's
  // gist is not how its text begins, the text's own first sentence stands in front: nothing is said twice.
  const opening = written.startsWith(front) ? front : (/^.{12,200}?[.!?…](?=\s|$)/su.exec(written)?.[0] ?? written.slice(0, 200));
  return { ok: true, presentation: { kind: draft.kind, gist: opening, text: written, figures: used, references: draft.kind === 'analysis' ? references(analysis, used) : [], limitations, next: next ? write(next, figures, days, language, locale) : null, composedByCode: false } };
}
