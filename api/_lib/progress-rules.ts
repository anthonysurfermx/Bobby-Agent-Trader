// ============================================================
// Companion progress rules — the ONE implementation of what iOS
// (CompanionStore.awardDiscipline) and the web (progressStore) do locally:
//   · points per kind: a full read 10, respecting NO TRADE 20, closing a
//     thesis 15 (minted by the server when a seed is reviewed, never by a client)
//   · at most 3 plants per local day (grinding is pointless); a close is
//     bounded by the seeds it blooms, so it never competes with today's reads
//   · streak grows on consecutive days, one skipped day is grace (held,
//     not grown), a longer gap resets to 1
// Pure and deterministic so it can be unit-tested and replayed from the
// event ledger. Never XP for volume, frequency or P&L.
// ============================================================

export const AWARD_POINTS = {
  read_complete: 10,
  no_trade_respected: 20,
  /** the thesis of an earlier read came back and was reviewed (hit / invalidated / expired) — the seed blooms */
  thesis_closed: 15,
} as const;
/** Aura (Trader Land soft currency) per kind — SYSTEM-DESIGN v0.2 "Distribución inicial". */
export const AWARD_AURA: Record<AwardKind, number> = { read_complete: 2, no_trade_respected: 6, thesis_closed: 6 };
export type AwardKind = keyof typeof AWARD_POINTS;
export const AWARD_KINDS = Object.keys(AWARD_POINTS) as AwardKind[];
/** What a client may report. A close is minted server-side by /api/trader-land when a seed is reviewed. */
export const PLANT_KINDS = ['read_complete', 'no_trade_respected'] as const;
export type PlantKind = (typeof PLANT_KINDS)[number];
export const MAX_DAILY_AWARDS = 3;
/** Kinds the daily cap does not count: each is already limited to one per seed, after the review window. */
export const DAILY_CAP_EXEMPT: ReadonlySet<AwardKind> = new Set<AwardKind>(['thesis_closed']);
/**
 * Paid on top of thesis_closed when the thesis was EXECUTED on Base between
 * the read and the review: a confirmed swap of the thesis' asset, in its
 * direction, by the reviewer's own wallet. Process, not volume — one swap
 * executes at most one thesis and a swap without a thesis pays nothing.
 */
export const EXECUTION_BONUS = { xp: 10, aura: 4 } as const;

export interface ProgressCounters {
  xp: number;
  streak: number;
  /** YYYY-MM-DD (device-local day) of the last award. */
  lastDay: string | null;
  dailyAwards: number;
  dailyAwardsDay: string | null;
}

export interface AwardOutcome {
  state: ProgressCounters;
  points: number;
  /** What the daily cap actually granted — 0 when it said no. */
  awarded: number;
  xpBefore: number;
  xpAfter: number;
  dayKey: string;
}

/**
 * Device-local calendar day. `tzOffsetMin` follows JS `getTimezoneOffset()`
 * (minutes to ADD to local time to reach UTC, e.g. 360 for Mexico City in
 * winter). Clamped to ±14h so a bogus client cannot pick an arbitrary day.
 */
export function dayKey(at: Date, tzOffsetMin = 0): string {
  const offset = Math.max(-840, Math.min(840, Math.trunc(Number(tzOffsetMin) || 0)));
  const local = new Date(at.getTime() - offset * 60_000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function isAwardKind(value: unknown): value is AwardKind {
  return typeof value === 'string' && value in AWARD_POINTS;
}

export function applyAward(state: ProgressCounters, kind: AwardKind, at: Date, tzOffsetMin = 0): AwardOutcome {
  const points = AWARD_POINTS[kind];
  const today = dayKey(at, tzOffsetMin);
  const xpBefore = state.xp;

  const capped = !DAILY_CAP_EXEMPT.has(kind);
  let dailyAwards = state.dailyAwardsDay === today ? state.dailyAwards : 0;
  if (capped && dailyAwards >= MAX_DAILY_AWARDS) {
    return { state, points, awarded: 0, xpBefore, xpAfter: xpBefore, dayKey: today };
  }
  if (capped) dailyAwards += 1;

  let streak = state.streak;
  if (state.lastDay) {
    const gap = daysBetween(state.lastDay, today);
    if (gap === 1) streak += 1;            // consecutive day
    else if (gap === 2) { /* grace day */ }
    else if (gap > 2 || gap < 0) streak = 1; // broken (or clock went backwards)
  } else {
    streak = 1;
  }

  const xpAfter = xpBefore + points;
  return {
    state: { xp: xpAfter, streak, lastDay: today, dailyAwards, dailyAwardsDay: today },
    points,
    awarded: points,
    xpBefore,
    xpAfter,
    dayKey: today,
  };
}
