// ============================================================
// Watches: an errand that ends by itself. A person says "tell me if this moves that much"; Bobby looks at every
// new daily close and, the day it happens, reads the asset, writes what it found and sends a notification.
// Off unless BOBBY_AGENT_WATCHES=on, and then only for whom the agent engine exists (BOBBY_AGENT_ENGINE).
//
// This file is the vocabulary and everything that needs no network: what a watch is, when it is met, and the
// words a person reads. Rules the rest keeps:
//   · No model is ever called for a watch. The condition is a choice among fixed values, the check is arithmetic
//     on closes the strict reader accepted (tools.ts, readDaily), and the answer is written by code (present.ts,
//     composeByCode). A watch costs no provider money and no word of a model reaches a person through it.
//   · A watch holds no text of the person's: an asset of the engine's universe, a direction, a size and a length.
//   · It is measured from one close, read when the watch was made and kept with it (`reference`). A source that
//     later shows another close for that day (a split, a restated bar) makes the watch unreadable, never met.
//   · Met means a completed daily close, never a price inside a day. The card says so in its own words.
//   · A watch belongs to an account the server resolved. It needs one because the notification does.
//   · The lock screen never carries an asset, a number or a direction (the briefings' rule).
// ============================================================
import { appLocale, type AppLanguage } from '../../../src/lib/app-language.js';
import type { DailyBar } from '../harness/bars.js';
import { composeByCode, formatDay } from './present.js';
import { spokenName } from './tools.js';
import type { Analysis, Presentation, TaskResult } from './types.js';

export const WATCH_VERSION = 1;
export const WATCH_DIRECTIONS = ['falls', 'rises', 'moves'] as const;
export const WATCH_PERCENTS = [3, 5, 10] as const;
export const WATCH_DAYS = [7, 30] as const;
export type WatchDirection = typeof WATCH_DIRECTIONS[number];
export type WatchState = 'active' | 'met' | 'expired' | 'cancelled';
/** The notification of a met watch: owed, being sent (never sent twice from here on), sent, or not sendable. */
export type WatchPush = 'none' | 'pending' | 'sending' | 'sent' | 'failed';

/** How many watches an account may have looking at once. */
export const WATCH_LIMIT = { free: 3, pro: 10 } as const;
/** How long an ended watch (met, expired or cancelled) stays readable before it is removed, in days. */
export const WATCH_KEEP_DAYS = 7;
/** A restated close further than this from the one the watch was made with is another close. */
const REFERENCE_TOLERANCE = 0.005;

export interface WatchReference { day: string; close: number; currency: string }
export interface WatchMet { day: string; close: number; changePct: number }
export interface Watch {
  id: string;
  /** The account, resolved by the server. Never a body field. */
  identity: string;
  requestId: string; bodyDigest: string;
  symbol: string; direction: WatchDirection; percent: number; days: number;
  language: AppLanguage; locale: string | null;
  reference: WatchReference;
  createdAt: string; expiresAt: string;
  state: WatchState; endedAt: string | null;
  /** The last completed day the condition was checked on. */
  checkedThrough: string | null;
  /** True when the last look could not read the series: an expired watch then says it could not be followed to the end. */
  unreadable: boolean;
  met: WatchMet | null;
  /** What Bobby wrote the day it was met. */
  result: TaskResult | null;
  seenAt: string | null;
  push: WatchPush;
}

export type WatchCheck = { kind: 'met'; met: WatchMet } | { kind: 'quiet'; through: string } | { kind: 'unreadable' };

/**
 * Whether a watch is met on the closes given: the first completed day after its reference whose close is far
 * enough from the reference close, in the direction asked. Percent is percent.
 */
export function checkWatch(watch: Pick<Watch, 'reference' | 'direction' | 'percent'>, bars: readonly DailyBar[] | null): WatchCheck {
  if (!bars?.length) return { kind: 'unreadable' };
  const from = bars.find((bar) => bar.day === watch.reference.day);
  if (!from || !(watch.reference.close > 0) || Math.abs(from.close / watch.reference.close - 1) > REFERENCE_TOLERANCE) return { kind: 'unreadable' };
  for (const bar of bars) {
    if (bar.day <= from.day) continue;
    if (!(bar.close > 0) || !Number.isFinite(bar.close)) return { kind: 'unreadable' };
    const changePct = 100 * (bar.close / watch.reference.close - 1);
    const met = watch.direction === 'falls' ? changePct <= -watch.percent : watch.direction === 'rises' ? changePct >= watch.percent : Math.abs(changePct) >= watch.percent;
    if (met) return { kind: 'met', met: { day: bar.day, close: bar.close, changePct } };
  }
  return { kind: 'quiet', through: bars.at(-1)!.day };
}

// ---------- the words ----------
const percentOf = (value: number, language: AppLanguage, locale: string | null, signed: boolean) =>
  new Intl.NumberFormat(appLocale(language, locale ?? undefined), { style: 'percent', minimumFractionDigits: signed ? 1 : 0, maximumFractionDigits: signed ? 1 : 0, signDisplay: signed ? 'exceptZero' : 'auto' }).format(value / 100);

/** The card's one line, as a verb and a size: "falls 5%". Always about a day's close. */
const CONDITION: Record<AppLanguage, Record<WatchDirection, (size: string) => string>> = {
  en: { falls: (s) => `closes ${s} lower`, rises: (s) => `closes ${s} higher`, moves: (s) => `closes ${s} away` },
  es: { falls: (s) => `cierra ${s} abajo`, rises: (s) => `cierra ${s} arriba`, moves: (s) => `cierra a ${s} de distancia` },
  fr: { falls: (s) => `clôture ${s} plus bas`, rises: (s) => `clôture ${s} plus haut`, moves: (s) => `clôture à ${s} d’écart` },
  pt: { falls: (s) => `fecha ${s} abaixo`, rises: (s) => `fecha ${s} acima`, moves: (s) => `fecha a ${s} de distância` },
  it: { falls: (s) => `chiude ${s} più in basso`, rises: (s) => `chiude ${s} più in alto`, moves: (s) => `chiude a ${s} di distanza` },
  de: { falls: (s) => `schließt ${s} tiefer`, rises: (s) => `schließt ${s} höher`, moves: (s) => `schließt ${s} entfernt` },
};
const UNTIL: Record<AppLanguage, (day: string) => string> = {
  en: (d) => `until ${d}`, es: (d) => `hasta el ${d}`, fr: (d) => `jusqu’au ${d}`, pt: (d) => `até ${d}`, it: (d) => `fino ${italianTo(d)}`, de: (d) => `bis zum ${d}`,
};
/** "al 14 novembre", "all’8 novembre", "all’11 novembre": the article follows how the number is said. */
const italianTo = (day: string) => (/^(8|11)(?!\d)/.test(day) ? `all’${day}` : `al ${day}`);
const italianOf = (day: string) => (/^(8|11)(?!\d)/.test(day) ? `dell’${day}` : `del ${day}`);

/** What a person reads on the card and in the list: the asset, the condition, the last day. No sentence. */
export function watchLabel(watch: Pick<Watch, 'symbol' | 'direction' | 'percent' | 'expiresAt' | 'language' | 'locale'>): string {
  const day = formatDay(watch.expiresAt.slice(0, 10), watch.language, watch.locale);
  return `${spokenName(watch.symbol)} · ${CONDITION[watch.language][watch.direction](percentOf(watch.percent, watch.language, watch.locale, false))} · ${UNTIL[watch.language](day)}`;
}

/** The first sentences of a met watch: how far the close is from the one it was measured from, and which two closes. */
const MET: Record<AppLanguage, (name: string, change: string, day: string, from: string) => string> = {
  en: (n, c, d, f) => `${n}: ${c} from the close I started watching at. Close of ${d} against the close of ${f}.`,
  es: (n, c, d, f) => `${n}: ${c} desde el cierre en que empecé a vigilar. Cierre del ${d} frente al del ${f}.`,
  fr: (n, c, d, f) => `${n} : ${c} depuis la clôture où j’ai commencé à surveiller. Clôture du ${d} face à celle du ${f}.`,
  pt: (n, c, d, f) => `${n}: ${c} desde que comecei a vigiar. Preço final de ${d} face ao de ${f}.`,
  it: (n, c, d, f) => `${n}: ${c} dalla chiusura da cui ho iniziato a seguire. Chiusura ${italianOf(d)} rispetto a quella ${italianOf(f)}.`,
  de: (n, c, d, f) => `${n}: ${c} seit dem Schlusskurs, ab dem ich beobachte. Schlusskurs vom ${d} gegenüber dem vom ${f}.`,
};
/** Said for a watch whose last day passed without its condition. */
const EXPIRED: Record<AppLanguage, (label: string) => string> = {
  en: (l) => `It did not happen: ${l}.`, es: (l) => `No pasó: ${l}.`, fr: (l) => `Ce n’est pas arrivé : ${l}.`,
  pt: (l) => `Não aconteceu: ${l}.`, it: (l) => `Non è successo: ${l}.`, de: (l) => `Nicht eingetreten: ${l}.`,
};
/** Said instead when the series could not be read at the end: Bobby does not know, and says so. */
const UNFOLLOWED: Record<AppLanguage, (label: string) => string> = {
  en: (l) => `I could not follow it to the end: ${l}.`, es: (l) => `No pude seguirlo hasta el final: ${l}.`, fr: (l) => `Je n’ai pas pu le suivre jusqu’au bout : ${l}.`,
  pt: (l) => `Não consegui acompanhar tudo: ${l}.`, it: (l) => `Non sono riuscito a seguirlo fino alla fine: ${l}.`, de: (l) => `Ich konnte es nicht bis zum Ende verfolgen: ${l}.`,
};

/**
 * What Bobby writes the day a watch is met, by code alone: the two closes and the distance between them, then
 * the plain reading of the asset's last thirty days when that read came back.
 */
export function watchResult(watch: Pick<Watch, 'symbol' | 'language' | 'locale' | 'reference'>, met: WatchMet, analysis: Analysis | null): TaskResult {
  const said = MET[watch.language](spokenName(watch.symbol), percentOf(met.changePct, watch.language, watch.locale, true),
    formatDay(met.day, watch.language, watch.locale), formatDay(watch.reference.day, watch.language, watch.locale));
  const read = analysis ? composeByCode(analysis, watch.language, watch.locale) : null;
  const told = read?.kind === 'analysis' ? read : null;
  const presentation: Presentation = {
    kind: 'analysis', gist: said.slice(0, said.indexOf('. ') + 1) || said, text: told ? `${said} ${told.text}` : said,
    figures: told?.figures ?? [], references: told?.references ?? [], limitations: told?.limitations ?? [], next: null, composedByCode: true,
  };
  return { presentation, analysis: told ? analysis : null };
}

/** The notification's words. Generic on purpose: no asset, no number, no direction ever reaches a lock screen. */
export function watchPushCopy(language: AppLanguage, locale: string | null): { title: string; body: string } {
  const body: Record<AppLanguage, string> = {
    en: 'Something you asked Bobby to watch happened', es: 'Pasó algo que le pediste vigilar a Bobby',
    fr: 'Ce que tu as demandé à Bobby de surveiller est arrivé', pt: 'Aconteceu algo que pediste ao Bobby para vigiar',
    it: 'È successo qualcosa che hai chiesto a Bobby di seguire', de: 'Etwas, das Bobby für dich beobachten sollte, ist eingetreten',
  };
  return { title: 'Bobby', body: language === 'pt' && appLocale(language, locale ?? undefined) === 'pt-BR' ? 'Aconteceu algo que você pediu ao Bobby para vigiar' : body[language] };
}
export function watchPayload(watch: Pick<Watch, 'id' | 'language' | 'locale'>): Record<string, unknown> {
  const copy = watchPushCopy(watch.language, watch.locale);
  return { aps: { alert: { title: copy.title, body: copy.body }, sound: 'default', 'thread-id': 'bobby-watch' }, watchId: watch.id, language: watch.language, screen: 'watch' };
}

/** What a client is told of a watch. The account it belongs to is not in it. */
export function watchView(watch: Watch) {
  const label = watchLabel(watch);
  return {
    id: watch.id, symbol: watch.symbol, name: spokenName(watch.symbol), direction: watch.direction, percent: watch.percent, days: watch.days,
    state: watch.state, label,
    createdAt: watch.createdAt, expiresAt: watch.expiresAt, endedAt: watch.endedAt,
    reference: watch.reference, met: watch.met,
    // One plain sentence for a watch that ended without its condition: a person is never left with a bare state.
    notice: watch.state === 'expired' ? (watch.unreadable ? UNFOLLOWED : EXPIRED)[watch.language](label) : null,
    result: watch.result ? { ...watch.result.presentation, analysis: watch.result.analysis ? { subjects: watch.result.analysis.subjects, windowDays: watch.result.analysis.windowDays, figures: watch.result.analysis.figures, evidence: watch.result.analysis.evidence } : null } : null,
    seen: watch.seenAt !== null,
  };
}
