// "vs periodo anterior": the dashboard asks the server for twice the window and compares the second half of
// each daily series with the first half. Reads are pruned after 35 days, so their comparison is only honest
// while both halves fit in that history.
import type { AdminOverview } from '@/lib/admin-client';

export const READS_HISTORY_DAYS = 35;

export interface Delta { cur: number; prev: number; pct: number | null }

export interface CompareSeries {
  accounts: number[]; reads: number[]; web: number[]; ios: number[]; android: number[];
  revenue: number[]; visits: number[]; llm: number[]; anthropic: number[]; openai: number[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function compareSeries(o: AdminOverview): CompareSeries {
  const r = o.activity.readsDaily;
  return {
    accounts: o.accounts.daily,
    reads: r.web.map((v, i) => v + (r.ios[i] ?? 0) + (r.android[i] ?? 0)),
    web: r.web, ios: r.ios, android: r.android,
    revenue: o.revenue.daily,
    visits: o.funnel.visitsDaily,
    llm: o.llm.daily.map((d) => d.anthropic + d.openai),
    anthropic: o.llm.daily.map((d) => d.anthropic),
    openai: o.llm.daily.map((d) => d.openai),
  };
}

/** The last `w` days against the `w` days before them, or null when the series is too short. */
export function windowDelta(series: number[] | undefined, w: number, maxHistory = Infinity): Delta | null {
  if (!series || series.length < 2 * w || 2 * w > maxHistory) return null;
  const cur = sum(series.slice(series.length - w));
  const prev = sum(series.slice(series.length - 2 * w, series.length - w));
  return { cur, prev, pct: prev > 0 ? (cur - prev) / prev : null };
}

/** Growth chips for 7 / 30 / 90 days, only the windows the fetched history can answer. */
export function growthWindows(series: number[] | undefined, maxHistory = Infinity): Array<{ w: number; delta: Delta }> {
  return [7, 30, 90]
    .map((w) => ({ w, delta: windowDelta(series, w, maxHistory) }))
    .filter((x): x is { w: number; delta: Delta } => x.delta != null);
}
