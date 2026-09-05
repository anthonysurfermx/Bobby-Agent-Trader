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
//   · a thesis is EXECUTED when the reviewer's wallet swapped its asset on
//     Base, in its direction, between the read and the review (one swap, one
//     thesis) — that pays EXECUTION_BONUS and a season piece, never volume
// ============================================================
import { z } from 'zod';
import { findBaseToken } from '../../src/lib/base-swap/tokens.js';

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

// ---------- execution on Base ----------
/** A confirmed Base swap as the receipts table records it. */
export interface SwapCandidate { id: string; txHash: string | null; tokenIn: string; tokenOut: string; at: string | null }
export interface SwapAsset { symbol: string; address: string; side: 'BUY' | 'SELL' }

/**
 * Which asset a swap moved and which way: stable → asset is a BUY, asset →
 * stable a SELL. Neither leg a stablecoin, or an unknown token, is not an
 * execution of anything.
 */
export function swapAsset(swap: Pick<SwapCandidate, 'tokenIn' | 'tokenOut'>): SwapAsset | null {
  const tokenIn = findBaseToken(swap.tokenIn);
  const tokenOut = findBaseToken(swap.tokenOut);
  if (!tokenIn || !tokenOut) return null;
  if (tokenIn.stable && !tokenOut.stable) return { symbol: tokenOut.symbol, address: tokenOut.address.toLowerCase(), side: 'BUY' };
  if (!tokenIn.stable && tokenOut.stable) return { symbol: tokenIn.symbol, address: tokenIn.address.toLowerCase(), side: 'SELL' };
  return null;
}

/**
 * A swap executes a thesis when it moved the thesis' asset (matched by
 * contract, so ETH ≡ WETH and BTC ≡ cbBTC, NVDA ≡ NVDAc) in the thesis'
 * direction, between the read and the review. The caller keeps swaps that
 * already paid a review out of the candidates: one swap, one thesis.
 */
export function swapExecutesThesis(thesis: Thesis, swap: SwapCandidate, readAt: string, closeAt: string): boolean {
  if (thesis.direction !== 'long' && thesis.direction !== 'short') return false;
  const asset = findBaseToken(thesis.symbol);
  if (!asset || asset.stable) return false;
  const moved = swapAsset(swap);
  if (!moved || moved.address !== asset.address.toLowerCase()) return false;
  if (moved.side !== (thesis.direction === 'long' ? 'BUY' : 'SELL')) return false;
  const at = swap.at ? Date.parse(swap.at) : NaN;
  return Number.isFinite(at) && at >= Date.parse(readAt) && at <= Date.parse(closeAt);
}
