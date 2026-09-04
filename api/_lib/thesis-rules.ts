// ============================================================
// Thesis rules — pure, deterministic, shared by /api/progress (what a read
// plants) and /api/trader-land (how a seed is reviewed). No IO, so the unit
// test replays them without a database or a market.
//
//   · a read stores the desk's verdict as a THESIS in the plant event's meta
//   · a seed can be reviewed once THESIS_REVIEW_HOURS have passed
//   · the verdict is `hit` past the target, `invalidated` past the stop and
//     `expired` when the window closed without touching a level; XP and Aura
//     are identical for the three — the P&L never enters (SYSTEM-DESIGN v0.2)
// ============================================================
import { z } from 'zod';

/** Snapshot of the desk's verdict at read time. Tolerant on purpose: a bad
 *  level becomes null rather than blocking the XP sync it travels with. */
const px = z.number().finite().positive().nullable().catch(null);
export const ThesisSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9][A-Z0-9.-]{0,19}$/),
  isEquity: z.boolean().catch(false),
  direction: z.enum(['long', 'short', 'none']).catch('none'),
  price: px,
  entry: px,
  stop: px,
  target: px,
});
export type Thesis = z.infer<typeof ThesisSchema>;
export type ThesisOutcome = 'hit' | 'invalidated' | 'expired';

/** A seed can be reviewed once the market had time to answer. */
export const THESIS_REVIEW_HOURS = 24;
export function reviewAt(seededAt: string): string {
  return new Date(Date.parse(seededAt) + THESIS_REVIEW_HOURS * 3_600_000).toISOString();
}

/** The thesis stored in a plant event's meta, or null when the read carried none (older seeds, iOS). */
export function thesisFrom(meta: unknown): Thesis | null {
  const raw = meta && typeof meta === 'object' ? (meta as { thesis?: unknown }).thesis : undefined;
  if (!raw || typeof raw !== 'object') return null;
  const parsed = ThesisSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export interface ThesisVerdict { outcome: ThesisOutcome; referencePx: number | null; movePct: number | null }

function movePct(from: number, to: number): number {
  return Number((((to - from) / from) * 100).toFixed(2));
}

/**
 * Verdict at review time, from the public price alone. Levels on the wrong
 * side of the reference (a long whose stop sits above its entry) are ignored
 * rather than trusted, so a malformed verdict can only ever read as expired.
 */
export function resolveThesis(thesis: Thesis | null, closePx: number | null): ThesisVerdict {
  const referencePx = thesis?.entry ?? thesis?.price ?? null;
  const move = closePx && referencePx ? movePct(referencePx, closePx) : null;
  if (!thesis || !closePx || !referencePx || (thesis.direction !== 'long' && thesis.direction !== 'short')) {
    return { outcome: 'expired', referencePx, movePct: move };
  }
  const long = thesis.direction === 'long';
  const stop = thesis.stop !== null && (long ? thesis.stop < referencePx : thesis.stop > referencePx) ? thesis.stop : null;
  const target = thesis.target !== null && (long ? thesis.target > referencePx : thesis.target < referencePx) ? thesis.target : null;
  let outcome: ThesisOutcome = 'expired';
  if (stop !== null && (long ? closePx <= stop : closePx >= stop)) outcome = 'invalidated';
  else if (target !== null && (long ? closePx >= target : closePx <= target)) outcome = 'hit';
  return { outcome, referencePx, movePct: move };
}
