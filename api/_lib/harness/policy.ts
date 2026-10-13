// ============================================================
// The harness, layers 2b and 3 (README.md in this folder): the estimates and the choice.
// Deterministic on purpose. With little traffic, randomising who gets what in order to learn is
// waste that feels like spam, so the only things estimated are how often each kind of follow-up
// earns a useful return, and at what time of day the person tends to make one.
//   · The population prior is Beta(1, 9): a stated weak assumption, not a measured rate.
//   · Personal evidence decays (30-day half-life); the prior never does.
//   · An estimate may suppress a kind. It can never add a follow-up: frequency is a rule elsewhere.
//   · A market fact may replace the candidate of a permitted slot; it never creates a slot.
// Pure, and mirrored by the phone ports through shared/harness/golden.json.
// ============================================================
export const POPULATION_PRIOR = { alpha: 1, beta: 9 } as const;
export type Kind = 'asset' | 'sector' | 'week';
export interface Outcome { kind: Kind; useful: boolean; at: Date }
const DAY = 86_400_000;
const probability = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 1;

export function pooledMean(successes: number, failures: number): number | null {
  if (![successes, failures].every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  const total = 10 + successes + failures;
  return Number.isSafeInteger(total) ? (1 + successes) / total : null;
}

function evidence(kind: Kind, outcomes: Outcome[], now: Date): { successes: number; failures: number; count: number } | null {
  if (!Number.isFinite(now.getTime())) return null;
  let successes = 0, failures = 0, count = 0;
  for (const outcome of outcomes) {
    if (outcome.kind !== kind) continue;
    const age = now.getTime() - outcome.at.getTime();
    if (!Number.isFinite(age) || age < 0 || typeof outcome.useful !== 'boolean') return null;
    // Acceptance needs three days before an absent response becomes evidence.
    if (age < 3 * DAY) continue;
    const weight = 2 ** (-age / (30 * DAY));
    if (outcome.useful) successes += weight; else failures += weight;
    count++;
  }
  return { successes, failures, count };
}

export function personalEstimate(kind: Kind, pooled: number, outcomes: Outcome[], now: Date): number | null {
  const e = evidence(kind, outcomes, now);
  if (!probability(pooled) || !e) return null;
  return (10 * pooled + e.successes) / (10 + e.successes + e.failures);
}

export function shouldSuppress(kind: Kind, pooled: number, outcomes: Outcome[], now: Date): boolean {
  const e = evidence(kind, outcomes, now);
  const p = personalEstimate(kind, pooled, outcomes, now);
  return e !== null && e.count >= 5 && p !== null && p < 0.5 * pooled;
}

export interface ScoreInput { interest: number; maxInterest: number; variant: 'market' | Kind; p: number }
const VALUE = { market: 2, asset: 1, sector: 0.7, week: 0.6 } as const;
export function score(input: ScoreInput): number | null {
  const { interest, maxInterest, variant, p } = input;
  if (!Number.isFinite(interest) || !Number.isFinite(maxInterest) || interest < 0 || maxInterest <= 0 || interest > maxInterest || !probability(p) || !(variant in VALUE)) return null;
  return (interest / maxInterest) * VALUE[variant] * (0.5 + p);
}

interface CandidateBase { id: string; interest: number; maxInterest: number; p: number; askedAt: Date }
export interface ChainCandidate extends CandidateBase { origin: 'chain'; variant: Kind }
export interface MarketCandidate extends CandidateBase { origin: 'market'; variant: 'market' }
export type Candidate = ChainCandidate | MarketCandidate;
// A replacement is inseparable from its permitted chain slot; there is no market-only input.
export function choose(candidates: readonly [ChainCandidate, MarketCandidate?]): Candidate | null {
  if (candidates.length < 1 || candidates.length > 2 || candidates[0]?.origin !== 'chain' || candidates[0]?.variant === ('market' as string) || (candidates[1] && (candidates[1].origin !== 'market' || candidates[1].variant !== 'market'))) return null;
  let best: Candidate | null = null, bestScore = -Infinity;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!Number.isFinite(candidate.askedAt.getTime())) return null;
    const value = score(candidate);
    if (value === null) return null;
    if (value > bestScore || (value === bestScore && best && (candidate.origin === 'chain' && best.origin !== 'chain' || candidate.origin === best.origin && candidate.askedAt > best.askedAt))) {
      best = candidate; bestScore = value;
    }
  }
  return best;
}

export interface TimeWindow { window: '09-12' | '12-17' | '17-21'; hour: number }
export function timeWindow(usefulVisits: Date[], tz: string): TimeWindow | null {
  try {
    if (!tz || /^[+-]/.test(tz)) return null;
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
    const groups: number[][] = [[], [], []];
    const days = new Set<string>(), seen = new Set<number>();
    for (const visit of usefulVisits) {
      if (!Number.isFinite(visit.getTime())) return null;
      if (seen.has(visit.getTime())) continue;
      seen.add(visit.getTime());
      const parts = format.formatToParts(visit);
      const part = (type: string) => parts.find(p => p.type === type)?.value;
      const hour = Number(part('hour'));
      // Half-open windows keep noon, 17:00 and 21:00 unambiguous across ports.
      const index = hour >= 9 && hour < 12 ? 0 : hour >= 12 && hour < 17 ? 1 : hour >= 17 && hour < 21 ? 2 : -1;
      if (index < 0) continue;
      days.add(`${part('year')}-${part('month')}-${part('day')}`);
      groups[index].push(hour);
    }
    if (days.size < 3) return null;
    const max = Math.max(...groups.map(g => g.length));
    const winners = groups.map((g, i) => g.length === max ? i : -1).filter(i => i >= 0);
    // A tie cannot retain a previous choice when none was supplied; keep the caller's fallback.
    if (winners.length !== 1) return null;
    const index = winners[0], hours = groups[index].sort((a, b) => a - b), mid = Math.floor(hours.length / 2);
    return { window: (['09-12', '12-17', '17-21'] as const)[index], hour: hours.length % 2 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2 };
  } catch { return null; }
}
