// How a visitor arrives at /desk with a question already in hand, and the one rule about consent the desk
// applies before anything they wrote leaves the browser. Pure: no storage, no network, no React.
//
//   /desk?ask=SYMBOL  starts the same question as tapping that starter chip. Only a symbol fits through it.
//   /desk?q=text      only fills the ask pill. It never sends by itself, so a link cannot spend anyone's read.
//
// Both are read once and then leave the address bar, so neither survives a copied link, and a reload never asks
// anything by itself. The one thing kept across a reload is a question still waiting behind the notice (changing
// the language reloads the page): it stays in this tab for a moment, unsent, and comes back waiting.

/** The desk's own limit for a question: api/_lib/desk-debate.ts DESK_QUESTION_MAX, and the cut in deskData.runAgents. */
export const DESK_QUESTION_MAX = 1200;
/** The symbols the desk API accepts (api/desk-debate.ts Body.symbol). */
const SYMBOL = /^[A-Z0-9.^=-]{1,20}$/;

export interface DeskLink {
  /** A symbol to ask about at once, or null. */
  ask: string | null;
  /** Text for the pill, or null. Never sent without the person pressing send. */
  q: string | null;
  /** True when the address carried either parameter, valid or not: it is cleaned either way. */
  present: boolean;
  /** The query string without `ask` and `q` ('' or '?…'); every other parameter keeps its place. */
  search: string;
}

export function parseDeskLink(search: string): DeskLink {
  let params: URLSearchParams;
  try { params = new URLSearchParams(search); } catch { return { ask: null, q: null, present: false, search }; }
  const present = params.has('ask') || params.has('q');
  const symbol = (params.get('ask') ?? '').trim().toUpperCase();
  // Control characters and line breaks never reach the pill (the whitespace class also covers the Unicode line
  // separators); a long text is cut where the desk would cut it.
  // eslint-disable-next-line no-control-regex
  const text = Array.from((params.get('q') ?? '').replace(/[\u0000-\u001F\u007F-\u009F]+/g, ' ').replace(/\s+/g, ' ').trim())
    .slice(0, DESK_QUESTION_MAX).join('').trim();
  const q = text || null;
  // With both, the careful reading wins: the text waits in the pill and nothing starts.
  const ask = !q && SYMBOL.test(symbol) ? symbol : null;
  params.delete('ask');
  params.delete('q');
  const rest = params.toString();
  return { ask, q, present, search: rest ? `?${rest}` : '' };
}

/** The browser's own agreement to the current notice (progress.ts): the only thing that lets a question leave. */
export function consentCurrent(progress: { aiConsentGranted: boolean; riskNoticeVersion: number }, version: number): boolean {
  return progress.aiConsentGranted === true && progress.riskNoticeVersion >= version;
}

/** What waits behind the notice: the question itself, or the control the person tapped. It runs once after they agree. */
export type HeldStep =
  /** `starter`: the words shown are a starter chip's own sentence, so they are written again after a language change. */
  | { kind: 'ask'; q: string; spoken?: string; starter?: boolean }
  | { kind: 'mic' }
  | { kind: 'profile' }
  | { kind: 'board' };

/** The words shown above the notice and put back in the pill when the person leaves it. */
export const heldQuestion = (step: HeldStep | null): string | null => (step?.kind === 'ask' ? step.spoken ?? step.q : null);

/** How long a waiting question outlives the page that held it: long enough for a reload, not for a later visit. */
export const WAITING_FRESH_MS = 10_000;

/** A question waiting behind the notice, as kept in this tab when the page goes away. Only a question is ever kept. */
export function packWaiting(step: HeldStep | null, at: number): string | null {
  if (step?.kind !== 'ask') return null;
  return JSON.stringify({ q: step.q, ...(step.starter ? { starter: true } : step.spoken ? { spoken: step.spoken } : {}), at });
}

/** Read it back: null unless it is a question, within the desk's limit, left moments ago. */
export function unpackWaiting(raw: string | null, now: number): { q: string; spoken: string | null; starter: boolean } | null {
  if (!raw) return null;
  let kept: unknown;
  try { kept = JSON.parse(raw); } catch { return null; }
  if (!kept || typeof kept !== 'object') return null;
  const { q, spoken, starter, at } = kept as Record<string, unknown>;
  if (typeof at !== 'number' || !(now - at >= 0 && now - at < WAITING_FRESH_MS)) return null;
  if (typeof q !== 'string' || !q.trim() || Array.from(q).length > DESK_QUESTION_MAX) return null;
  const words = typeof spoken === 'string' && spoken.trim() && Array.from(spoken).length <= DESK_QUESTION_MAX ? spoken : null;
  return { q, spoken: words, starter: starter === true && SYMBOL.test(q) };
}
