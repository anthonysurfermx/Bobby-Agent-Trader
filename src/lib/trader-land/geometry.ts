// ============================================================
// Trader Land geometry — ONE formula for every surface that draws an island
// (web studio, IslandThumb, the share card in api/_lib/trader-land-card.ts)
// and the reference for iOS (GateLayout / LandSpriteGeometry). See
// docs/trader-land/GROWTH-v1.md.
//
// Islands keep a constant on-screen extent in "island canvas units"
// (the 860×720 canvas, slab corners 62,391 · 430,207 · 798,391 · 430,575).
// A grown island (N = 10, 12, 16) packs more, smaller tiles into that
// same slab: tile = 92·8/N × 46·8/N.
// Pure: no DOM, no React — importable from api/ too.
// ============================================================

export const LAND_SIZES = [8, 10, 12, 16] as const;
export type LandSize = (typeof LAND_SIZES)[number];

/** Base tile of an 8×8 island, in canvas units. */
export const BASE_TILE = { w: 92, h: 46 } as const;
/** Centre of the island slab (iso(3.5, 3.5) of an 8×8), fixed for every size. */
export const ISLAND_CENTER = { x: 430, y: 391 } as const;
/** Slab corners, identical for every size (constant extent). */
export const SLAB = { top: { x: 430, y: 207 }, right: { x: 798, y: 391 }, bottom: { x: 430, y: 575 }, left: { x: 62, y: 391 }, depth: 22 } as const;
/** The Aura Core footprint. */
export const CORE_FOOTPRINT = { cols: 2, rows: 2 } as const;
/** A dormant core (stage 0) is drawn at this fraction of its stage-1 size. */
export const DORMANT_CORE_SCALE = 0.72;

/** Growth steps: when occupied cells (pieces + the 2×2 core) reach `threshold`, the island becomes `next`. */
export const GROWTH: Record<number, { next: LandSize; threshold: number } | undefined> = {
  8: { next: 10, threshold: 39 },
  10: { next: 12, threshold: 60 },
  12: { next: 16, threshold: 87 },
};

export function landSize(raw: unknown): LandSize {
  return (LAND_SIZES as readonly number[]).includes(Number(raw)) ? (Number(raw) as LandSize) : 8;
}

export interface LandGeometry {
  size: LandSize;
  tileW: number;
  tileH: number;
  origin: { x: number; y: number };
  /** Centre of cell (col,row) — fractional values allowed. */
  iso(col: number, row: number): { x: number; y: number };
  /** Inverse of iso: the cell under a canvas point (may be outside the island). */
  cellAt(x: number, y: number): { col: number; row: number };
  /** Diamond points (SVG `points`) of a cols×rows footprint anchored at (col,row). */
  diamond(col: number, row: number, cols?: number, rows?: number): string;
  /** Scale of fixed-size decorations (strokes, hit boxes) relative to an 8×8 tile. */
  unit: number;
}

export function landGeometry(rawSize: unknown = 8): LandGeometry {
  const size = landSize(rawSize);
  const tileW = (BASE_TILE.w * 8) / size;
  const tileH = (BASE_TILE.h * 8) / size;
  const origin = { x: ISLAND_CENTER.x, y: ISLAND_CENTER.y - ((size - 1) * tileH) / 2 };
  const iso = (col: number, row: number) => ({ x: origin.x + ((col - row) * tileW) / 2, y: origin.y + ((col + row) * tileH) / 2 });
  return {
    size,
    tileW,
    tileH,
    origin,
    iso,
    cellAt(x: number, y: number) {
      const dx = (x - origin.x) / (tileW / 2);
      const dy = (y - origin.y) / (tileH / 2);
      return { col: Math.round((dx + dy) / 2), row: Math.round((dy - dx) / 2) };
    },
    diamond(col: number, row: number, cols = 1, rows = 1) {
      const hw = tileW / 2, hh = tileH / 2;
      const top = iso(col, row), right = iso(col + cols - 1, row), bottom = iso(col + cols - 1, row + rows - 1), left = iso(col, row + rows - 1);
      return `${top.x},${top.y - hh} ${right.x + hw},${right.y} ${bottom.x},${bottom.y + hh} ${left.x - hw},${left.y}`;
    },
    unit: 8 / size,
  };
}

export interface SpriteArt { anchor: readonly number[]; contentBounds: readonly number[] }
export interface SpriteFrame {
  /** Square art frame, top-left + side, in canvas units. */
  x: number; y: number; size: number;
  /** Paint order: y of the footprint's bottom vertex. */
  depth: number;
  /** Mirror the art horizontally (a piece rotated 90/270). */
  flip: boolean;
  /** Path slabs only: the top face the light filament runs on. */
  face: { x: number; y: number; w: number; h: number } | null;
}

/**
 * Where a piece's art goes: the art's anchor (its contact point, normalized
 * in the frame) sits on the footprint's BOTTOM vertex — the same rule as iOS
 * LandSpriteGeometry. `footprint` is the catalog footprint (unrotated); a
 * rotated piece (90/270) swaps cols/rows on the ground and mirrors the art.
 */
export function spriteFrame(
  geom: LandGeometry,
  footprint: { cols: number; rows: number },
  col: number,
  row: number,
  rotation: number,
  art: SpriteArt,
  opts: { path?: boolean; scale?: number } = {},
): SpriteFrame {
  const flip = ((rotation % 360) + 360) % 180 === 90;
  const cols = flip ? footprint.rows : footprint.cols;
  const rows = flip ? footprint.cols : footprint.rows;
  const center = geom.iso(col + (cols - 1) / 2, row + (rows - 1) / 2);
  const ground = center.y + (geom.tileH * (cols + rows)) / 4;
  const [x0, y0, x1] = art.contentBounds;
  const visible = Math.max(0.2, x1 - x0);
  const size = Math.min(360 * geom.unit, ((geom.tileW * (footprint.cols + footprint.rows)) / 2) * 0.9 / visible) * (opts.scale ?? 1);
  const midX = center.x + (flip ? -1 : 1) * size * (0.5 - art.anchor[0]);
  const midY = ground + size * (0.5 - art.anchor[1]);
  const x = midX - size / 2, y = midY - size / 2;
  let face: SpriteFrame['face'] = null;
  if (opts.path) {
    const w = visible * size;
    const contentMid = (x0 + x1) / 2;
    const fx = flip ? x + size - size * contentMid : x + size * contentMid;
    face = { x: fx - w / 2, y: y + y0 * size, w, h: w / 2 };
  }
  return { x, y, size, depth: ground, flip, face };
}

/** Cells ("col:row") of a footprint at (col,row), rotation-aware. */
export function footprintCells(footprint: { cols: number; rows: number }, col: number, row: number, rotation = 0): string[] {
  const flip = ((rotation % 360) + 360) % 180 === 90;
  const cols = flip ? footprint.rows : footprint.cols;
  const rows = flip ? footprint.cols : footprint.rows;
  const cells: string[] = [];
  for (let x = 0; x < cols; x += 1) for (let y = 0; y < rows; y += 1) cells.push(`${col + x}:${row + y}`);
  return cells;
}

export function coreCells(core: { x: number; y: number } = { x: 3, y: 3 }): string[] {
  return footprintCells(CORE_FOOTPRINT, core.x, core.y);
}

/** Camera zoom limits of an 8×8 island; a grown island zooms further in (× N/8). */
export const CAMERA_ZOOM = { min: 0.7, max: 2.6 } as const;
/** Deepest zoom for an island of `rawSize`: the 8×8 limit scaled by N/8, so a 16×16 tile can reach the size an 8×8 one does. */
export function maxZoom(rawSize: unknown = 8): number {
  return (CAMERA_ZOOM.max * landSize(rawSize)) / 8;
}
/** The zoom "fit island" returns to: 1.25 from 12×12 up, so 1×1 tiles stay tappable on a phone. */
export function homeZoom(rawSize: unknown = 8): number {
  return landSize(rawSize) >= 12 ? 1.25 : 1;
}
