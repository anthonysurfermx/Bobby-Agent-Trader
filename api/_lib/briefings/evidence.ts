// ============================================================
// Bobby Pro market briefings — shared evidence for one (cadence, period). Spec §8 (evidence.ts), design §Generation.
// Evidence is the only thing the shared narrative may talk about and the only source of the numbers a report shows.
// It is global (no account data) and identical for every reader of the period.
//
// Freshness rules (never label missing or old data as live):
//   · crypto + metals (OKX, trade 24/7): 'live' with asOf = the snapshot fetch time; 'stale' when that fetch is
//     older than RULES.cryptoStaleMs at `now`. Change basis '24h' (rolling, vs OKX open24h).
//   · equities/ETFs (Yahoo regular market): change basis 'prev_close'. Inside the NYSE core session (calendar
//     state 'open') a quote is 'live' when asOf ≤ RULES.equityLiveMs old, 'delayed' when ≤ RULES.equityDelayedMs,
//     else 'stale'. Outside it the quote is 'closed' when its asOf belongs to the last completed session (or today's
//     session after the close), else 'stale' — a weekend morning reads "closed, as of Friday". Outside calendar
//     coverage it is 'closed' when ≤ RULES.closedUnknownMaxDays old, else 'stale'. No asOf ⇒ 'stale'.
//   · a symbol the source did not return (or with no positive price) ⇒ 'missing', price and change null.
//   · weekly: quotes come ONLY from dated provider daily closes for the interval (history), change basis '7d',
//     freshness 'closed', asOf = the closing instant of the last completed daily candle. Without real history the
//     quote is 'missing' and the evidence degraded — the current snapshot is never relabelled as a weekly change.
//   · macro: Fear & Greed (daily index) 'delayed' when ≤ RULES.fearGreedStaleMs old, else 'stale'; DXY (estimated
//     from the ECB daily fix) 'delayed' when the fix date is ≤ RULES.dxyStaleDays old, else 'stale'; funding 'live'
//     unless the snapshot is stale.
//   · agenda: macro events only from the stored calendar (agent_macro_events, read-only) inside the cadence's
//     look-ahead window, plus market-hours items computed from the NYSE calendar module. An unreadable table gives
//     an empty agenda and a failed source (degraded) — nothing is ever invented.
// `degraded` is true when any requested quote is stale/missing, a shown macro item is stale, or the agenda source
// failed. All network/DB access is injectable (EvidenceDeps); the defaults are read-only public endpoints and a
// PostgREST GET. Logs carry source names and statuses only.
// ============================================================
import { bobbyReadHeaders, bobbyRest } from '../bobby-db.js';
import { loadGlobalMarketSnapshot, type GlobalMarketSnapshot } from '../market-snapshot.js';
import { equitySession, isSessionDay, nyLocalToUtc, nyParts, sessionHours, addDays, weekdayOf } from './calendar.js';
import { LIMITS, SUPPORTED_ASSETS, isSupportedAsset } from './config.js';
import type { AssetQuote, BriefEvidence, Cadence, Freshness, Period } from './types.js';

export const FRESHNESS_RULES = {
  cryptoStaleMs: 15 * 60_000,
  equityLiveMs: 2 * 60_000,
  equityDelayedMs: 20 * 60_000,
  closedUnknownMaxDays: 4,
  fearGreedStaleMs: 36 * 3600_000,
  dxyStaleDays: 4,
  /** A weekly comparison must span roughly a week of daily closes (holidays can shorten it by a day or two). */
  weeklyMinSpanDays: 5,
  weeklyMaxSpanDays: 9,
} as const;

/** How far ahead of `scheduledAt` the agenda looks. */
export const AGENDA_LOOKAHEAD_HOURS: Readonly<Record<Cadence, number>> = { morning: 24, close: 24, weekly: 168 };
export const AGENDA_MAX = 10;
const AGENDA_TITLE_MAX = 120;

/**
 * Market-hours agenda titles (canonical English; evidence is language-neutral). narrative.ts translates them for
 * the facts-only text by matching these exact strings / prefixes.
 */
export const MARKET_HOURS_TITLES = {
  open: 'US equity session opens',
  close: 'US equity session closes',
  earlyClose: 'US equity session closes early',
  holidayPrefix: 'US equity markets closed: ',
} as const;

export type DailyHistory = NonNullable<BriefEvidence['history']>;

export interface EvidenceDeps {
  snapshot(): Promise<GlobalMarketSnapshot>;
  dailyCloses(symbols: string[], fromIso: string, toIso: string): Promise<BriefEvidence['history']>;
  agenda(fromIso: string, toIso: string): Promise<BriefEvidence['agenda']>;
  now(): Date;
}

const DAY_MS = 86_400_000;
const isoOf = (ms: number): string => new Date(ms).toISOString();
const ms = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);
const round = (v: number, d: number): number => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

/** Supported, upper-cased, de-duplicated, order-preserving, bounded to the shared section cap. */
export function normalizeSymbols(symbols: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of symbols) {
    const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (s && isSupportedAsset(s) && !out.includes(s)) out.push(s);
    if (out.length >= LIMITS.sharedAssetSections) break;
  }
  return out;
}

const missingQuote = (symbol: string, kind: AssetQuote['kind'], basis: AssetQuote['changeBasis']): AssetQuote =>
  ({ symbol, kind, price: null, changePct: null, changeBasis: basis, asOf: null, freshness: 'missing' });

function cryptoQuote(symbol: string, kind: AssetQuote['kind'], snap: GlobalMarketSnapshot, now: Date): AssetQuote {
  const q = snap.prices.find((p) => p.symbol === symbol);
  if (!q || !Number.isFinite(q.price) || q.price <= 0) return missingQuote(symbol, kind, '24h');
  const asOf = q.asOf ?? snap.fetchedAt;
  const age = now.getTime() - ms(asOf);
  const freshness: Freshness = Number.isFinite(age) && age <= FRESHNESS_RULES.cryptoStaleMs ? 'live' : 'stale';
  return { symbol, kind, price: q.price, changePct: Number.isFinite(q.change24h) ? q.change24h : null, changeBasis: '24h', asOf, freshness };
}

function equityQuote(symbol: string, kind: AssetQuote['kind'], snap: GlobalMarketSnapshot, now: Date): AssetQuote {
  const q = snap.stocks.find((p) => p.symbol === symbol);
  if (!q || !Number.isFinite(q.price) || q.price <= 0) return missingQuote(symbol, kind, 'prev_close');
  // Yahoo reports change 0 when it has no previous close: that is "unknown", not "flat".
  const changePct = q.prevClose === null ? null : Number.isFinite(q.change24h) ? q.change24h : null;
  const base = { symbol, kind, price: q.price, changePct, changeBasis: 'prev_close' as const, asOf: q.asOf };
  const asOfMs = ms(q.asOf);
  if (!Number.isFinite(asOfMs)) return { ...base, freshness: 'stale' };
  const age = now.getTime() - asOfMs;
  const session = equitySession(nyParts(now).date, now);
  if (session.state === 'open') {
    const freshness: Freshness = age <= FRESHNESS_RULES.equityLiveMs ? 'live' : age <= FRESHNESS_RULES.equityDelayedMs ? 'delayed' : 'stale';
    return { ...base, freshness };
  }
  const expected = session.state === 'after_close' ? session.date : session.lastSessionDate;
  if (session.state === 'unknown' || !expected) {
    return { ...base, freshness: age <= FRESHNESS_RULES.closedUnknownMaxDays * DAY_MS ? 'closed' : 'stale' };
  }
  return { ...base, freshness: nyParts(new Date(asOfMs)).date >= expected ? 'closed' : 'stale' };
}

function weeklyQuote(symbol: string, kind: AssetQuote['kind'], history: DailyHistory, period: Period): { quote: AssetQuote; used: DailyHistory[number] | null } {
  const h = history.find((e) => e.symbol === symbol);
  const startMs = ms(period.periodStart);
  const endMs = ms(period.periodEnd);
  if (h) {
    const fromMs = ms(h.from.at);
    const toMs = ms(h.to.at);
    const span = (toMs - fromMs) / DAY_MS;
    const valid = h.from.price > 0 && h.to.price > 0 && Number.isFinite(h.from.price) && Number.isFinite(h.to.price)
      && fromMs <= startMs && toMs > startMs && toMs <= endMs
      && span >= FRESHNESS_RULES.weeklyMinSpanDays && span <= FRESHNESS_RULES.weeklyMaxSpanDays;
    if (valid) {
      return {
        quote: { symbol, kind, price: h.to.price, changePct: round(((h.to.price - h.from.price) / h.from.price) * 100, 2), changeBasis: '7d', asOf: isoOf(toMs), freshness: 'closed' },
        used: { symbol, from: { at: isoOf(fromMs), price: h.from.price }, to: { at: isoOf(toMs), price: h.to.price } },
      };
    }
  }
  return { quote: missingQuote(symbol, kind, '7d'), used: null };
}

/** Market-hours items for NY dates touched by [fromMs, toMs). Weekly windows keep only exceptions (holidays, early closes). */
export function marketHoursAgenda(cadence: Cadence, fromMs: number, toMs: number): BriefEvidence['agenda'] {
  const items: BriefEvidence['agenda'] = [];
  const inWindow = (t: number) => t >= fromMs && t < toMs;
  const last = nyParts(new Date(toMs - 1)).date;
  for (let d = nyParts(new Date(fromMs)).date; d <= last; d = addDays(d, 1)) {
    const hours = sessionHours(d);
    if (hours) {
      const open = hours.openAt.getTime();
      const close = hours.closeAt.getTime();
      if (cadence !== 'weekly' && inWindow(open)) items.push({ title: MARKET_HOURS_TITLES.open, at: isoOf(open), kind: 'market_hours', severity: null });
      if ((cadence !== 'weekly' || hours.earlyClose) && inWindow(close)) {
        items.push({ title: hours.earlyClose ? MARKET_HOURS_TITLES.earlyClose : MARKET_HOURS_TITLES.close, at: isoOf(close), kind: 'market_hours', severity: null });
      }
      continue;
    }
    const wd = weekdayOf(d);
    if (isSessionDay(d) === false && wd !== 0 && wd !== 6) {
      const at = nyLocalToUtc(d, '09:30').getTime();
      const name = equitySession(d).holidayName ?? 'holiday';
      if (inWindow(at)) items.push({ title: `${MARKET_HOURS_TITLES.holidayPrefix}${name}`, at: isoOf(at), kind: 'market_hours', severity: null });
    }
  }
  return items;
}

const cleanTitle = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > AGENDA_TITLE_MAX || /https?:\/\/|www\./i.test(t)) return null;
  return t;
};

/** Default agenda source: read-only PostgREST GET of agent_macro_events inside [fromIso, toIso). Throws on failure. */
export async function readMacroAgenda(fromIso: string, toIso: string, fetchImpl: typeof fetch = fetch): Promise<BriefEvidence['agenda']> {
  const path = `agent_macro_events?select=title,scheduled_at,severity,state&scheduled_at=gte.${encodeURIComponent(fromIso)}`
    + `&scheduled_at=lt.${encodeURIComponent(toIso)}&order=scheduled_at.asc&limit=${AGENDA_MAX}`;
  const r = await fetchImpl(bobbyRest(path), { headers: bobbyReadHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) {
    console.error('[briefings-evidence]', 'agenda', r.status);
    throw new Error(`agenda ${r.status}`);
  }
  const rows = (await r.json()) as unknown;
  if (!Array.isArray(rows)) throw new Error('agenda shape');
  const out: BriefEvidence['agenda'] = [];
  for (const row of rows as Array<Record<string, unknown>>) {
    const title = cleanTitle(row?.title);
    const at = Date.parse(String(row?.scheduled_at ?? ''));
    if (!title || !Number.isFinite(at)) continue;
    if (typeof row.state === 'string' && /^cancel/i.test(row.state)) continue;
    const sev = Number(row.severity);
    out.push({ title, at: isoOf(at), kind: 'macro', severity: row.severity === null || row.severity === undefined || !Number.isFinite(sev) ? null : sev });
  }
  return out;
}

const OKX_DAILY_INST: Readonly<Record<string, string>> = { BTC: 'BTC-USDT', ETH: 'ETH-USDT', SOL: 'SOL-USDT', XAUT: 'XAUT-USDT', XAG: 'XAG-USDT-SWAP' };

/**
 * Default weekly history: dated provider daily closes. For each symbol, `from` = the last daily candle completed at
 * or before fromIso and `to` = the last completed at or before toIso (and before `now`). Crypto/metals: OKX public
 * 1Dutc candles (close instant = candle open + 24h, confirmed only). Equities: Yahoo chart range=1mo interval=1d
 * (close instant = that session's official close from the NYSE calendar). Symbols without both points are omitted.
 */
export async function fetchDailyCloses(
  symbols: string[], fromIso: string, toIso: string,
  opts: { fetchImpl?: typeof fetch; now?: Date; timeoutMs?: number } = {},
): Promise<DailyHistory> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const nowMs = (opts.now ?? new Date()).getTime();
  const timeoutMs = opts.timeoutMs ?? 6000;
  const fromMs = ms(fromIso);
  const toMs = ms(toIso);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];

  const pick = (closes: Array<{ at: number; price: number }>, boundary: number) => {
    let best: { at: number; price: number } | null = null;
    for (const c of closes) if (c.at <= boundary && c.at <= nowMs && c.price > 0 && (!best || c.at > best.at)) best = c;
    return best;
  };

  const one = async (symbol: string): Promise<DailyHistory[number] | null> => {
    let closes: Array<{ at: number; price: number }> = [];
    try {
      const kind = SUPPORTED_ASSETS[symbol];
      if (kind === 'crypto' || kind === 'metal') {
        const inst = OKX_DAILY_INST[symbol];
        if (!inst) return null;
        const url = `https://www.okx.com/api/v5/market/history-candles?instId=${inst}&bar=1Dutc&after=${toMs + DAY_MS}&limit=20`;
        const r = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) return null;
        const json = (await r.json()) as { code?: string; data?: string[][] };
        if (json.code !== '0' || !Array.isArray(json.data)) return null;
        closes = json.data
          .filter((row) => Array.isArray(row) && (row.length < 9 || row[8] === '1'))
          .map((row) => ({ at: Number(row[0]) + DAY_MS, price: Number(row[4]) }))
          .filter((c) => Number.isFinite(c.at) && Number.isFinite(c.price));
      } else if (kind === 'equity' || kind === 'etf') {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
        const r = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) return null;
        const json = (await r.json()) as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> } };
        const res = json.chart?.result?.[0];
        const ts = res?.timestamp ?? [];
        const cl = res?.indicators?.quote?.[0]?.close ?? [];
        for (let i = 0; i < ts.length; i++) {
          const price = Number(cl[i]);
          if (!Number.isFinite(ts[i]) || !Number.isFinite(price)) continue;
          const day = nyParts(new Date(ts[i] * 1000)).date;
          const hours = sessionHours(day);
          // Outside calendar coverage use the core close; a date the calendar says is closed is a bad row.
          const closeAt = hours ? hours.closeAt.getTime() : isSessionDay(day) === null ? nyLocalToUtc(day, '16:00').getTime() : NaN;
          if (Number.isFinite(closeAt)) closes.push({ at: closeAt, price });
        }
      } else {
        return null;
      }
    } catch {
      return null;
    }
    const from = pick(closes, fromMs);
    const to = pick(closes, toMs);
    if (!from || !to || to.at <= from.at) return null;
    return { symbol, from: { at: isoOf(from.at), price: from.price }, to: { at: isoOf(to.at), price: to.price } };
  };

  // Batches of 5 (repo rule for external APIs).
  const out: DailyHistory = [];
  for (let i = 0; i < symbols.length; i += 5) {
    const batch = await Promise.all(symbols.slice(i, i + 5).map(one));
    for (const h of batch) if (h) out.push(h);
  }
  return out;
}

const DEFAULT_DEPS: EvidenceDeps = {
  snapshot: () => loadGlobalMarketSnapshot(),
  dailyCloses: (symbols, fromIso, toIso) => fetchDailyCloses(symbols, fromIso, toIso),
  agenda: (fromIso, toIso) => readMacroAgenda(fromIso, toIso),
  now: () => new Date(),
};

const FRESH_RANK: Record<Freshness, number> = { live: 0, '24_7': 0, delayed: 1, closed: 2, stale: 3, missing: 4 };
/** The least fresh of a list (missing beats stale beats closed …); 'missing' for an empty list. */
export function worstFreshness(list: readonly Freshness[]): Freshness {
  let worst: Freshness | null = null;
  for (const f of list) if (worst === null || FRESH_RANK[f] > FRESH_RANK[worst]) worst = f;
  return worst ?? 'missing';
}

export async function buildEvidence(period: Period, symbols: string[], deps: Partial<EvidenceDeps> = {}): Promise<BriefEvidence> {
  const d: EvidenceDeps = { ...DEFAULT_DEPS, ...deps };
  const now = d.now();
  const capturedAt = now.toISOString();
  const wanted = normalizeSymbols(symbols);
  const weekly = period.cadence === 'weekly';

  const scheduledMs = ms(period.scheduledAt);
  const agendaFrom = isoOf(scheduledMs);
  const agendaTo = isoOf(scheduledMs + AGENDA_LOOKAHEAD_HOURS[period.cadence] * 3600_000);

  const [snapR, histR, agendaR] = await Promise.allSettled([
    d.snapshot(),
    weekly && wanted.length ? d.dailyCloses(wanted, period.periodStart, period.periodEnd) : Promise.resolve([] as DailyHistory),
    d.agenda(agendaFrom, agendaTo),
  ]);
  const snap: GlobalMarketSnapshot = snapR.status === 'fulfilled' && snapR.value
    ? snapR.value
    : { prices: [], stocks: [], funding: [], fearGreed: null, dxy: null, regime: null, fetchedAt: capturedAt, sources: [] };
  if (snapR.status === 'rejected') console.error('[briefings-evidence]', 'snapshot', 'failed');
  const historyRaw: DailyHistory = histR.status === 'fulfilled' && Array.isArray(histR.value) ? histR.value : [];
  const historyOk = histR.status === 'fulfilled';
  const agendaOk = agendaR.status === 'fulfilled' && Array.isArray(agendaR.value);
  if (!agendaOk) console.error('[briefings-evidence]', 'agenda', 'unavailable');

  // ---- quotes ----
  const quotes: AssetQuote[] = [];
  const history: DailyHistory = [];
  for (const symbol of wanted) {
    const kind = SUPPORTED_ASSETS[symbol];
    if (weekly) {
      const { quote, used } = weeklyQuote(symbol, kind, historyRaw, period);
      quotes.push(quote);
      if (used) history.push(used);
    } else if (kind === 'crypto' || kind === 'metal') {
      quotes.push(cryptoQuote(symbol, kind, snap, now));
    } else {
      quotes.push(equityQuote(symbol, kind, snap, now));
    }
  }

  // ---- macro ----
  const snapAge = now.getTime() - ms(snap.fetchedAt);
  const snapFresh = Number.isFinite(snapAge) && snapAge <= FRESHNESS_RULES.cryptoStaleMs;
  let fearGreed: BriefEvidence['macro']['fearGreed'] = null;
  if (snap.fearGreed && Number.isFinite(snap.fearGreed.value)) {
    const age = now.getTime() - ms(snap.fearGreed.asOf);
    fearGreed = {
      value: snap.fearGreed.value,
      classification: String(snap.fearGreed.classification ?? '').slice(0, 40),
      asOf: snap.fearGreed.asOf,
      freshness: Number.isFinite(age) && age <= FRESHNESS_RULES.fearGreedStaleMs ? 'delayed' : 'stale',
    };
  }
  let dxy: BriefEvidence['macro']['dxy'] = null;
  if (snap.dxy && Number.isFinite(snap.dxy.dxy)) {
    // Calendar days between the ECB fix date and today's NY date (a Friday fix read on Monday is 3 days old).
    const days = (Date.parse(`${nyParts(now).date}T00:00:00Z`) - Date.parse(`${snap.dxy.asOf ?? ''}T00:00:00Z`)) / DAY_MS;
    dxy = { value: snap.dxy.dxy, asOf: snap.dxy.asOf, freshness: Number.isFinite(days) && days >= 0 && days <= FRESHNESS_RULES.dxyStaleDays ? 'delayed' : 'stale' };
  }
  const btcSnap = snap.prices.find((p) => p.symbol === 'BTC');
  const btcAge = now.getTime() - ms(btcSnap?.asOf ?? snap.fetchedAt);
  const regime = snap.regime
    ? { label: snap.regime.label, freshness: (Number.isFinite(btcAge) && btcAge <= FRESHNESS_RULES.cryptoStaleMs ? 'live' : 'stale') as Freshness }
    : null;
  const funding = snap.funding
    .filter((f) => f && typeof f.symbol === 'string' && Number.isFinite(f.rate))
    .map((f) => ({ symbol: f.symbol, ratePct: round(f.rate * 100, 4), freshness: (snapFresh ? 'live' : 'stale') as Freshness }));

  // ---- agenda ----
  const macroAgenda = agendaOk ? (agendaR as PromiseFulfilledResult<BriefEvidence['agenda']>).value : [];
  const fromMs = ms(agendaFrom);
  const toMs = ms(agendaTo);
  const agenda = [...macroAgenda.filter((a) => { const t = ms(a.at); return t >= fromMs && t < toMs; }), ...marketHoursAgenda(period.cadence, fromMs, toMs)]
    .sort((a, b) => ms(a.at) - ms(b.at) || a.title.localeCompare(b.title))
    .slice(0, AGENDA_MAX);

  // ---- sources ----
  const srcOk = (name: string) => snap.sources.find((s) => s.name === name)?.ok ?? false;
  const kindsWanted = new Set(wanted.map((s) => SUPPORTED_ASSETS[s]));
  const freshOf = (pred: (q: AssetQuote) => boolean) => worstFreshness(quotes.filter(pred).map((q) => q.freshness));
  const sources: BriefEvidence['sources'] = [];
  if (weekly) {
    const allHistory = wanted.length > 0 && history.length === wanted.length;
    sources.push({ name: 'daily_history', ok: historyOk && allHistory, freshness: history.length ? 'closed' : 'missing' });
  } else {
    if (kindsWanted.has('crypto') || kindsWanted.has('metal')) {
      sources.push({ name: 'okx_spot', ok: srcOk('okx_spot'), freshness: freshOf((q) => q.kind === 'crypto' || q.kind === 'metal') });
    }
    if (kindsWanted.has('equity') || kindsWanted.has('etf')) {
      sources.push({ name: 'yahoo_equities', ok: srcOk('yahoo_equities'), freshness: freshOf((q) => q.kind === 'equity' || q.kind === 'etf') });
    }
  }
  sources.push({ name: 'okx_funding', ok: srcOk('okx_funding') && funding.length > 0, freshness: funding.length ? funding[0].freshness : 'missing' });
  sources.push({ name: 'fear_greed', ok: fearGreed !== null, freshness: fearGreed?.freshness ?? 'missing' });
  sources.push({ name: 'dxy_ecb', ok: dxy !== null, freshness: dxy?.freshness ?? 'missing' });
  sources.push({ name: 'macro_calendar', ok: agendaOk, freshness: agendaOk ? 'live' : 'missing' });

  // ---- dataAsOf: the oldest quote the report relies on ----
  let oldest = Number.POSITIVE_INFINITY;
  for (const q of quotes) {
    const t = ms(q.asOf);
    if (q.freshness !== 'missing' && Number.isFinite(t) && t < oldest) oldest = t;
  }
  const dataAsOf = Number.isFinite(oldest) ? isoOf(oldest) : capturedAt;

  const degraded = quotes.some((q) => q.freshness === 'stale' || q.freshness === 'missing')
    || fearGreed?.freshness === 'stale' || dxy?.freshness === 'stale'
    || !agendaOk;

  const evidence: BriefEvidence = {
    cadence: period.cadence,
    periodKey: period.periodKey,
    capturedAt,
    dataAsOf,
    quotes,
    macro: { dxy, fearGreed, regime, funding },
    agenda,
    equitySession: period.equitySession,
    sources,
    degraded,
  };
  if (weekly) evidence.history = history;
  return evidence;
}
