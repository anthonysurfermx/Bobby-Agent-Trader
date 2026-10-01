// "vs periodo anterior": the dashboard asks the server for twice the window and compares the second half of
// each daily series with the first half. A comparison is only shown when both halves are covered by the source
// (reads since the first recorded read and at most 35 days back, visits since the first event, LLM spend since the
// ledger started, revenue since the first purchase event): days before a source existed are NaN, never zeros.
// Under MIN_BASE in the previous window a percentage is noise, so the delta carries the counts instead.
import type { AdminOverview } from '@/lib/admin-client';

export const READS_HISTORY_DAYS = 35;
export const MIN_BASE = 5;

export interface Delta { cur: number; prev: number; pct: number | null; small?: boolean }

export interface CompareSeries {
  accounts: number[]; reads: number[]; web: number[]; ios: number[]; android: number[];
  revenue: number[]; visits: number[]; llm: number[]; anthropic: number[]; openai: number[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Days before `since` (a source with no data yet) become NaN. A null `since` means the source has no rows at all. */
function covered(series: number[], days: string[], since: string | null | undefined, maxDays = Infinity): number[] {
  const first = since === undefined ? '' : since === null ? '9999-12-31' : since.slice(0, 10);
  const oldest = Number.isFinite(maxDays) ? days[Math.max(0, days.length - maxDays)] ?? '' : '';
  return series.map((v, i) => ((days[i] ?? '') < first || (days[i] ?? '') < oldest ? NaN : v));
}

export function compareSeries(o: AdminOverview): CompareSeries {
  const r = o.activity.readsDaily;
  const c = o.coverage;
  const reads = (xs: number[]) => covered(xs, o.days, c?.readsSince, READS_HISTORY_DAYS);
  const llm = (xs: number[]) => covered(xs, o.days, c?.ledgerSince);
  return {
    accounts: o.accounts.daily,
    reads: reads(r.web.map((v, i) => v + (r.ios[i] ?? 0) + (r.android[i] ?? 0))),
    web: reads(r.web), ios: reads(r.ios), android: reads(r.android),
    revenue: covered(o.revenue.daily, o.days, c?.purchasesSince),
    visits: covered(o.funnel.visitsDaily, o.days, c?.eventsSince),
    llm: llm(o.llm.daily.map((d) => d.anthropic + d.openai)),
    anthropic: llm(o.llm.daily.map((d) => d.anthropic)),
    openai: llm(o.llm.daily.map((d) => d.openai)),
  };
}

/** The last `w` days against the `w` days before them, or null when the series is too short or not covered. */
export function windowDelta(series: number[] | undefined, w: number, maxHistory = Infinity, minBase = MIN_BASE): Delta | null {
  if (!series || series.length < 2 * w || 2 * w > maxHistory) return null;
  const curPart = series.slice(series.length - w), prevPart = series.slice(series.length - 2 * w, series.length - w);
  if ([...curPart, ...prevPart].some((v) => !Number.isFinite(v))) return null;
  const cur = sum(curPart), prev = sum(prevPart);
  if (prev < minBase) return { cur, prev, pct: null, small: true };
  return { cur, prev, pct: (cur - prev) / prev };
}

/** Growth chips for 7 / 30 / 90 days, only the windows the fetched (and covered) history can answer. */
export function growthWindows(series: number[] | undefined, maxHistory = Infinity): Array<{ w: number; delta: Delta }> {
  return [7, 30, 90]
    .map((w) => ({ w, delta: windowDelta(series, w, maxHistory) }))
    .filter((x): x is { w: number; delta: Delta } => x.delta != null);
}
