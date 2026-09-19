// ============================================================
// Trader Land growth — pure rules shared by /api/trader-land, /api/progress
// and their tests (docs/trader-land/GROWTH-v1.md):
//   · tier sequences: common 1×1 · building 2×1 · landmark 2×2, each a
//     fixed visible order (tl_items.tier_index) that repeats; a player's next
//     piece of a tier is sequence[n mod len], n = its 'route' pieces whose
//     item is in that tier, in any state (season pieces never count)
//   · occupied cells (placements + the 2×2 core), the growth threshold and
//     the next size, from the shared island geometry
//   · the Aura Core as the land stores it
// The database decides (tl_grant_piece, tl_extend_seed, tl_grow_land); these
// mirror it so a response can preview the same answer without writing.
// ============================================================
import { CORE_FOOTPRINT, GROWTH, coreCells, footprintCells } from '../../src/lib/trader-land/geometry.js';
import type { HorizonHours, Tier } from './thesis-rules.js';

export const TIER_ORDER: readonly Tier[] = ['common', 'building', 'landmark'];
export const TIER_HOURS: Record<Tier, HorizonHours> = { common: 24, building: 72, landmark: 168 };
export const TIER_FOOTPRINT: Record<Tier, [number, number]> = { common: [1, 1], building: [2, 1], landmark: [2, 2] };
/** iOS 1.1 shows `routeIndex/8`: the legacy counter never passes the old Discovery Route's length. */
export const LEGACY_ROUTE_CAP = 8;

export interface TierItem { id: string; tier: string | null; tier_index: number | null }

/** The tier's pieces in their visible order (the caller passes active items only). */
export function tierSequence<T extends TierItem>(items: T[], tier: Tier): T[] {
  return items.filter((item) => item.tier === tier && item.tier_index !== null).sort((a, b) => a.tier_index! - b.tier_index!);
}

/** sequence[n mod len]: the piece a player who already holds `held` of this tier gets next. */
export function nextInTier<T>(sequence: T[], held: number): T | null {
  return sequence.length ? sequence[held % sequence.length] : null;
}

/** n per tier, counted by the tier of each row's current item (an extended seed left its common slot). */
export function heldByTier(rows: Array<{ source: string; tier: string | null | undefined }>): Record<Tier, number> {
  const held: Record<Tier, number> = { common: 0, building: 0, landmark: 0 };
  for (const row of rows) if (row.source === 'route' && row.tier && row.tier in held) held[row.tier as Tier] += 1;
  return held;
}

// ---------- the island ----------
export interface Core { x: number; y: number; stage: 0 | 1 }
/** The core wakes once this many pieces stand on the island, and never sleeps again (GROWTH-v1 §1.5). */
export const WAKE_PIECES = 5;
/**
 * The only size a client without `X-Trader-Land-Client: 2` ever draws: every
 * shipped iOS build refuses any other, and the pre-growth web was 8×8 only.
 */
export const LEGACY_LAND_SIZE = 8;

/**
 * The core as the land stores it; an older row (or server) without it is
 * today's rule: 3,3, awake. `pieces` placed on the island wake it by the rule
 * even when the stored stage lags (placed before the API woke cores).
 */
export function coreOf(land: { core_x?: number | null; core_y?: number | null; core_stage?: number | null }, pieces = 0): Core {
  if (land.core_x == null || land.core_y == null) return { x: 3, y: 3, stage: 1 };
  return { x: land.core_x, y: land.core_y, stage: land.core_stage === 0 && pieces < WAKE_PIECES ? 0 : 1 };
}

/** Cells a piece covers ("x:y", rotation-aware), the same keys as the web geometry. */
export function pieceCells(footprint: { w: number; h: number }, x: number, y: number, rotation = 0): string[] {
  return footprintCells({ cols: footprint.w, rows: footprint.h }, x, y, rotation);
}

export function coreCellKeys(core: Pick<Core, 'x' | 'y'>): string[] {
  return coreCells(core);
}

export interface Growth { occupied: number; threshold: number | null; nextSize: number | null }

/** Occupied cells (every placement cell + the 4 core cells) against the next growth step; null at 16×16. */
export function growthOf(size: number, occupied: number): Growth {
  const step = GROWTH[size];
  return { occupied, threshold: step?.threshold ?? null, nextSize: step?.next ?? null };
}

export const CORE_CELLS = CORE_FOOTPRINT.cols * CORE_FOOTPRINT.rows;
