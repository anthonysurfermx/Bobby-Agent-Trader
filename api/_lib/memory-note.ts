// ============================================================
// The personal note: what Bobby says before the answer when it remembers this reader, e.g.
//   "Anthony, on Monday you asked me about AMZN and I said “wait”. It is up 15% since then. Today I say
//    “review”: momentum turned up above the 50-day average."
// Written AFTER the debate, from the finished verdict and the stored memory, so memory can never move the
// verdict: the debate never sees it (api/desk-debate.ts). No model writes any of it: every part comes from a
// stored field or from today's structured answer (its verdict and the CIO's own reason, already through the
// public-text guard). Memory is therefore never sent to an AI provider.
// ============================================================
import { publicTextViolation } from './desk-debate.js';
import type { AskedHorizon, Lang, ReaderContext } from './user-memory.js';

export interface CurrentRead {
  verdict: 'wait' | 'review'; direction: 'long' | 'short' | 'none';
  synthesis: { headline: string; why: string; risk: string; watch: string };
}
export interface PersonalNote {
  note: string;
  /** What the note draws on, so the client can say "from your read on Monday". */
  basedOn: { previousRead: boolean; priceChange: boolean };
}

/** The longest note: optional sentences (count, risk, today's reason) are dropped whole to fit, never cut. */
export const NOTE_MAX = 480;

const VERDICT_WORD: Record<Lang, Record<'wait' | 'review', string>> = {
  en: { wait: 'wait', review: 'review' },
  es: { wait: 'esperar', review: 'revisar' },
  pt: { wait: 'esperar', review: 'revisar' },
};
const QUOTE: Record<Lang, [string, string]> = { en: ['“', '”'], es: ['«', '»'], pt: ['“', '”'] };
const quoted = (w: string, lang: Lang) => `${QUOTE[lang][0]}${w}${QUOTE[lang][1]}`;

const HORIZON_PHRASE: Record<Lang, Record<Exclude<AskedHorizon, 'unspecified'>, string>> = {
  en: { intraday: ' for today', week: ' for the coming weeks', month: ' for the coming months', long: ' for the long term' },
  es: { intraday: ' para hoy', week: ' para las próximas semanas', month: ' para los próximos meses', long: ' a largo plazo' },
  pt: { intraday: ' para hoje', week: ' para as próximas semanas', month: ' para os próximos meses', long: ' no longo prazo' },
};
const horizonPhrase = (h: AskedHorizon, lang: Lang) => (h === 'unspecified' ? '' : HORIZON_PHRASE[lang][h]);
const pct = (n: number, lang: Lang) => `${Math.abs(n).toLocaleString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-MX' : 'pt-BR', { maximumFractionDigits: 1 })}%`;
const capFirst = (s: string) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s ? s[0].toLocaleLowerCase() + s.slice(1) : s);
const sentence = (s: string) => s.trim().replace(/([^.!?…])$/, '$1.');

/**
 * The note from stored fields and today's finished answer. `askedHorizon` is today's question's horizon:
 * today's verdict is set against the stored one only when both questions had the same horizon (otherwise the
 * question changed, not the market). Null when there is nothing to recall.
 */
export function templateNote(reader: ReaderContext, symbol: string, current: CurrentRead, lang: Lang, askedHorizon: AskedHorizon): string | null {
  const L = (en: string, es: string, pt: string) => (lang === 'es' ? es : lang === 'pt' ? pt : en);
  const t = reader.thisAsset;
  const p = reader.previousRead;
  // Required sentences first; optional ones are dropped from the end to fit NOTE_MAX.
  const required: string[] = [];
  const optional: string[] = [];
  if (p) {
    const then = quoted(VERDICT_WORD[lang][p.verdict], lang);
    const hz = horizonPhrase(p.horizon, lang);
    required.push(L(`${p.dayPhrase} you asked me about ${symbol}${hz} and I said ${then}.`, `${p.dayPhrase} me preguntaste por ${symbol}${hz} y te dije ${then}.`, `${p.dayPhrase} você me perguntou sobre ${symbol}${hz} e eu disse ${then}.`));
  } else if (t?.lastAskedPhrase && t.lastAskedDaysAgo !== undefined && t.lastAskedDaysAgo >= 1) {
    required.push(L(`${t.lastAskedPhrase} you asked me about ${symbol}.`, `${t.lastAskedPhrase} me preguntaste por ${symbol}.`, `${t.lastAskedPhrase} você me perguntou sobre ${symbol}.`));
  }
  if (t?.changeSinceLastAskPct !== undefined && required.length) {
    const c = t.changeSinceLastAskPct;
    required.push(c === 0
      ? L('the price is where it was.', 'el precio está donde estaba.', 'o preço está onde estava.')
      : L(`it is ${c > 0 ? 'up' : 'down'} ${pct(c, lang)} since then.`, `desde entonces ${c > 0 ? 'subió' : 'bajó'} ${pct(c, lang)}.`, `desde então ${c > 0 ? 'subiu' : 'caiu'} ${pct(c, lang)}.`));
  }
  if (p && p.horizon === askedHorizon) {
    const now = quoted(VERDICT_WORD[lang][current.verdict], lang);
    const verdict = p.verdict === current.verdict
      ? L(`today I still say ${now}`, `hoy sigo diciendo ${now}`, `hoje continuo dizendo ${now}`)
      : L(`today I say ${now}`, `hoy digo ${now}`, `hoje digo ${now}`);
    required.push(`${verdict}.`);
    // Today's reason is the CIO's own line, already through the public-text guard.
    optional.push(sentence(current.synthesis.why));
  }
  if (!required.length) return null;
  if (reader.prefs?.explainRiskDepth === 'high') {
    optional.push(sentence(L(`the main risk: ${current.synthesis.risk}`, `el riesgo principal: ${current.synthesis.risk}`, `o principal risco: ${current.synthesis.risk}`)));
  }
  if (t?.timesThisWeek !== undefined && t.timesThisWeek >= 2) {
    optional.push(L(`that makes ${t.timesThisWeek} times this week.`, `van ${t.timesThisWeek} veces esta semana.`, `são ${t.timesThisWeek} vezes nesta semana.`));
  }
  const build = (parts: string[]) => {
    // Our own sentences start lower case: the first one follows the name (or is capitalized without one);
    // every later one is capitalized. A reason from the answer keeps its own first letter.
    const [first, ...rest] = parts;
    const head = reader.name ? `${reader.name}, ${lowerFirst(first)}` : capFirst(first);
    return [head, ...rest.map(capFirst)].join(' ');
  };
  let parts = [...required, ...optional];
  while (parts.length > required.length && build(parts).length > NOTE_MAX) parts = parts.slice(0, -1);
  const text = build(parts);
  return text.length <= NOTE_MAX ? text : null;
}

/** The note for this read, or null when there is nothing to recall. Synchronous, no network. */
export function personalNote(reader: ReaderContext, symbol: string, current: CurrentRead, lang: Lang, askedHorizon: AskedHorizon): PersonalNote | null {
  const note = templateNote(reader, symbol, current, lang, askedHorizon);
  if (!note || publicTextViolation(note)) return null;
  return { note, basedOn: { previousRead: !!reader.previousRead, priceChange: reader.thisAsset?.changeSinceLastAskPct !== undefined } };
}
