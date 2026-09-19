// ============================================================
// Trader Land Growth v1 on the web — the shapes the API adds and the pure
// rules the studio and the desk share (docs/trader-land/GROWTH-v1.md):
//   · one question = one seed; the seed's horizon (24 h / 3 days / 7 days)
//     decides the tier of the piece it blooms into (1×1 / 2×1 / 2×2)
//   · the island grows 8 → 10 → 12 → 16 as it fills, never back
//   · the Aura Core moves like a piece and wakes once 5 pieces stand
// No React, no DOM: the web test scripts import this directly.
// ============================================================
import { t } from '@/lib/companions/i18n';
import { SLAB, coreCells, footprintCells, homeZoom, landSize, type LandGeometry, type SpriteFrame } from './geometry';

/** Every /api/trader-land request declares it implements this contract (growth is only triggered for such clients). */
export const TRADER_LAND_CLIENT_HEADER = { 'X-Trader-Land-Client': '2' } as const;
/** Selection and draft id of the Aura Core, which is a land property, not an inventory piece. */
export const CORE_UID = 'aura-core';
/** Pieces standing on the island that wake a dormant core (server rule, mirrored for copy). */
export const CORE_WAKE_PIECES = 5;

export type Tier = 'common' | 'building' | 'landmark';
export type HorizonHours = 24 | 72 | 168;
export type CoreStage = 0 | 1;
export interface LandCore { x: number; y: number; stage: CoreStage }
export interface LandGrowth { occupied: number; threshold: number | null; nextSize: number | null }
export interface Horizon { hours: HorizonHours; tier: Tier; reviewAt: string; extendable: boolean; extendTo: number[] }
export interface PieceSummary { id: string; world: string; attribution: string; kind: string; name?: unknown; footprint: [number, number] }
export interface TierInfo { id: Tier; hours: HorizonHours; footprint: [number, number]; length: number; held: number; next: PieceSummary | null }
export interface Grew { from: number; to: number; shift: number }
/** `item` is null only when the server could not name the new piece (catalog changed mid-request); the extend itself happened. */
export interface Extended { inventoryId: string; item: PieceSummary | null; horizon: Horizon }

/** The contract's horizon table: how long a thesis plays out decides the piece's tier and footprint. */
export const HORIZONS: ReadonlyArray<{ hours: HorizonHours; tier: Tier; footprint: [number, number] }> = [
  { hours: 24, tier: 'common', footprint: [1, 1] },
  { hours: 72, tier: 'building', footprint: [2, 1] },
  { hours: 168, tier: 'landmark', footprint: [2, 2] },
];
export function horizonOf(hours: number) { return HORIZONS.find((h) => h.hours === hours) ?? null; }

/** An older server sends no core: it is the fixed 3,3 core, awake. */
export const FALLBACK_CORE: LandCore = { x: 3, y: 3, stage: 1 };
export function landCore(raw: unknown, rawSize: unknown = 8): LandCore {
  const size = landSize(rawSize);
  const core = raw as Partial<LandCore> | null | undefined;
  if (!core || !Number.isInteger(core.x) || !Number.isInteger(core.y)) return FALLBACK_CORE;
  const x = core.x as number, y = core.y as number;
  if (x < 0 || y < 0 || x + 2 > size || y + 2 > size) return FALLBACK_CORE;
  return { x, y, stage: core.stage === 0 ? 0 : 1 };
}

/**
 * Did a response change the land under the client? A grown island shifted
 * every coordinate and a moved core changed what is free, so an open draft
 * and the undo step are stale (contract §4).
 */
export function landChanged(before: { size: number; core?: unknown } | null | undefined, after: { size: number; core?: unknown } | null | undefined): boolean {
  if (!before || !after) return false;
  if (landSize(before.size) !== landSize(after.size)) return true;
  const a = landCore(before.core, before.size), b = landCore(after.core, after.size);
  return a.x !== b.x || a.y !== b.y || a.stage !== b.stage;
}

/** Cells taken on the island: the core (unless it is the piece being moved) plus every other piece. */
export function occupiedCells(pieces: Array<{ footprint: { cols: number; rows: number }; col: number; row: number; rotation?: number }>, core: LandCore | null): Set<string> {
  const cells = new Set(core ? coreCells(core) : []);
  for (const p of pieces) for (const cell of footprintCells(p.footprint, p.col, p.row, p.rotation ?? 0)) cells.add(cell);
  return cells;
}

/** A draft fits when every cell is on the island and free. */
export function draftFits(cells: string[], rawSize: unknown, occupied: Set<string>): boolean {
  const size = landSize(rawSize);
  return cells.length > 0 && cells.every((cell) => {
    const [col, row] = cell.split(':').map(Number);
    return col >= 0 && row >= 0 && col < size && row < size && !occupied.has(cell);
  });
}

/**
 * Where a new piece first appears: the free spot closest to the island's
 * lower-left quarter (1,5 on an 8×8, scaled for a grown island), or null
 * when nothing fits.
 */
export function findSpawn(rawSize: unknown, footprint: { cols: number; rows: number }, occupied: Set<string>): { col: number; row: number } | null {
  const size = landSize(rawSize);
  const target = { col: size / 8, row: (5 * size) / 8 };
  const candidates = Array.from({ length: size * size }, (_, index) => ({ col: index % size, row: Math.floor(index / size) }))
    .sort((a, b) => (a.col - target.col) ** 2 + (a.row - target.row) ** 2 - ((b.col - target.col) ** 2 + (b.row - target.row) ** 2));
  for (const spot of candidates) {
    if (spot.col + footprint.cols > size || spot.row + footprint.rows > size) continue;
    if (footprintCells(footprint, spot.col, spot.row).every((cell) => !occupied.has(cell))) return spot;
  }
  return null;
}

/** "10×10 · 22/60" — the island size and how far it is from the next ring. */
export function growthLabel(rawSize: unknown, growth: LandGrowth | null | undefined): string {
  const size = landSize(rawSize);
  const side = `${size}×${size}`;
  if (!growth) return side;
  if (growth.threshold === null || growth.nextSize === null) return `${side} · ${t('full size', 'tamaño máximo')}`;
  return `${side} · ${growth.occupied}/${growth.threshold}`;
}
export function grewNotice(grew: Grew): string {
  return t(`Your island grew to ${grew.to}×${grew.to}`, `Tu isla creció a ${grew.to}×${grew.to}`);
}
export function coreStateLabel(core: LandCore, pieces: number): string {
  return core.stage === 1
    ? t('Aura Core awake', 'Aura Core despierto')
    : t(`Aura Core dormant · ${Math.min(pieces, CORE_WAKE_PIECES)}/${CORE_WAKE_PIECES} pieces to wake it`, `Aura Core dormido · ${Math.min(pieces, CORE_WAKE_PIECES)}/${CORE_WAKE_PIECES} piezas para despertarlo`);
}

export function horizonLabel(hours: number): string {
  return hours === 72 ? t('3 days', '3 días') : hours === 168 ? t('7 days', '7 días') : `${hours} h`;
}
export function tierLabel(tier: Tier): string {
  return tier === 'building' ? t('building', 'edificio') : tier === 'landmark' ? t('landmark', 'monumento') : t('common', 'común');
}
/** "3 days · building 2×1" */
export function horizonOptionLabel(hours: number): string {
  const h = horizonOf(hours);
  return h ? `${horizonLabel(hours)} · ${tierLabel(h.tier)} ${h.footprint[0]}×${h.footprint[1]}` : horizonLabel(hours);
}
export const NO_SHORTEN = () => t("You can't shorten it later.", 'No se puede acortar después.');

function prettyId(id: string, world?: string) {
  const bare = world && id.startsWith(world + '_') ? id.slice(world.length + 1) : id;
  return bare.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
/** Display name of a piece: the catalog name in the reader's language, else the id. */
export function pieceName(piece: PieceSummary | null | undefined, spanish: boolean): string {
  if (!piece) return '';
  const name = piece.name as { en?: string; es?: string } | null | undefined;
  return (spanish ? name?.es : name?.en) ?? name?.en ?? prettyId(piece.id, piece.world);
}

/**
 * Has the seed's review opened? `extendable` is the server's word at load
 * time; a studio left open past `reviewAt` must stop offering extensions
 * the server would refuse.
 */
export function reviewOpened(horizon: Pick<Horizon, 'reviewAt'> | null | undefined, now = Date.now()): boolean {
  const at = Date.parse(horizon?.reviewAt ?? '');
  return Number.isFinite(at) && at <= now;
}

/** The upward extensions a seed can still take, each with the piece it would bloom into. */
export function extendChoices(horizon: Horizon | null | undefined, tiers: TierInfo[] | null | undefined, now = Date.now()): Array<{ hours: HorizonHours; tier: Tier; footprint: [number, number]; piece: PieceSummary | null }> {
  if (!horizon?.extendable || reviewOpened(horizon, now)) return [];
  return HORIZONS.filter((h) => h.hours > horizon.hours && horizon.extendTo.includes(h.hours)).map((h) => ({
    ...h,
    piece: tiers?.find((tier) => tier.id === h.tier || tier.hours === h.hours)?.next ?? null,
  }));
}

/**
 * The statuses `extend` answers when it refuses on purpose (contract §3):
 * 400 not_upward, 404 not_found, 409 not_seed / review_open. They explain
 * themselves and leave the island intact; anything else (401, 5xx) is a
 * broken studio.
 */
export const EXTEND_REFUSALS: readonly number[] = [400, 404, 409];
export const isExtendRefusal = (status: number) => EXTEND_REFUSALS.includes(status);

/** What the builder is told once an extend lands: "Horizon set to 3 days. It will bloom as Evidence Workshop." */
export function extendedNotice(hours: number, piece: string): string {
  return t(`Horizon set to ${horizonLabel(hours)}. It will bloom as ${piece}.`, `Horizonte de ${horizonLabel(hours)}. Florecerá como ${piece}.`);
}

/** Server refusals of `extend`, in the reader's language (contract §3). */
export function extendErrorMessage(status: number, error: unknown): string {
  const text = typeof error === 'string' ? error : '';
  if (status === 404) return t('This seed is no longer on your island.', 'Esta semilla ya no está en tu isla.');
  if (/bloomed/i.test(text)) return t('This seed already bloomed.', 'Esta semilla ya floreció.');
  if (/review/i.test(text)) return t('Its review is already open.', 'Su revisión ya está abierta.');
  if (/only grow/i.test(text) || status === 400) return t('A horizon can only grow.', 'Un horizonte solo puede crecer.');
  return text || t('The seed could not be extended. Try again.', 'No se pudo extender la semilla. Inténtalo de nuevo.');
}

/** A transparent tap target over the art, in island canvas units. */
export interface HitBox { left: number; top: number; width: number; height: number; zIndex: number }
/**
 * A piece's tap target: 60×85 (× 8/N) standing on its footprint's bottom
 * vertex, stacked by that vertex like the art. `area` is the footprint as it
 * lies on the ground (rotation already applied).
 */
export function pieceHitBox(geom: LandGeometry, area: { cols: number; rows: number }, col: number, row: number): HitBox {
  const center = geom.iso(col + (area.cols - 1) / 2, row + (area.rows - 1) / 2);
  const ground = center.y + (geom.tileH * (area.cols + area.rows)) / 4, u = geom.unit;
  return { left: center.x - 30 * u, top: ground - 70 * u, width: 60 * u, height: 85 * u, zIndex: Math.round(ground) + 102 };
}
/**
 * Stack level of the Aura Core's tap target: under every piece's. A piece's
 * bottom vertex is always below the slab's top corner, so any piece — in
 * front of the core or hidden behind its tall art — wins the tap; the core
 * answers on its own tiles and wherever its art covers no piece.
 */
export const CORE_HIT_Z = Math.round(SLAB.top.y) + 102;
/** The Aura Core's tap target: the visible part of its art, down to its footprint's bottom vertex. */
export function coreHitBox(frame: SpriteFrame, contentBounds: readonly number[]): HitBox {
  const top = frame.y + frame.size * contentBounds[1];
  return { left: frame.x + frame.size * contentBounds[0], top, width: frame.size * (contentBounds[2] - contentBounds[0]), height: frame.depth - top, zIndex: CORE_HIT_Z };
}

/** "Fit island": the whole slab on screen, whatever its size. */
export const FIT_ZOOM = 1;
/**
 * The studio's home view. The builder's is `homeZoom` (1.25 from 12×12 up so
 * 1×1 tiles stay tappable); a read-only visitor taps nothing and sees the
 * whole island instead of a crop.
 */
export function studioHomeZoom(rawSize: unknown, readOnly: boolean): number {
  return readOnly ? FIT_ZOOM : homeZoom(rawSize);
}

/**
 * The credential for /api/trader-land: the wallet session first, else the
 * Apple/Google (Supabase) session — the same order as ProgressSync, and the
 * API accepts either (api/_lib/user-identity.ts). Null = signed out.
 */
export function landCredential(walletHeaders: Record<string, string>, supabaseToken: string | null | undefined): Record<string, string> | null {
  if (walletHeaders['x-bobby-session']) return walletHeaders;
  return supabaseToken ? { Authorization: `Bearer ${supabaseToken}` } : null;
}
