export type GridPoint = { col: number; row: number };
/** The tile and side of the island being dragged on (see src/lib/trader-land/geometry.ts). */
export type DragGrid = { tileW: number; tileH: number; size: number };
/** An 8×8 island at the base 92×46 tile. */
const BASE_GRID: DragGrid = { tileW: 92, tileH: 46, size: 8 };

/** Move relative to the original grab, not the cell under the pointer. This
 * preserves the grab offset for tall sprites, handles and multi-cell pieces.
 * `grid` is the island's geometry: a grown island has smaller tiles and more of them. */
export function draggedGridPosition(origin: GridPoint, dx: number, dy: number, scale: number, grid: DragGrid = BASE_GRID): GridPoint {
  const safeScale = Math.max(0.001, scale);
  const across = dx / ((grid.tileW / 2) * safeScale);
  const down = dy / ((grid.tileH / 2) * safeScale);
  const last = Math.max(0, grid.size - 1);
  return {
    col: Math.min(last, Math.max(0, origin.col + Math.round((across + down) / 2))),
    row: Math.min(last, Math.max(0, origin.row + Math.round((down - across) / 2))),
  };
}

/** Scene point (island canvas units) the studio centres in its viewport. */
export const SCENE_CENTER = { x: 430, y: 335 } as const;

/**
 * A pointer position in island canvas units: the inverse of the studio's
 * `left: viewport/2 + camera, transform: scale(base·zoom) translate(-430px,-335px)`.
 */
export function canvasPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  viewport: { width: number; height: number },
  camera: { x: number; y: number; scale: number },
  baseScale: number,
): { x: number; y: number } {
  const scale = Math.max(0.001, baseScale * camera.scale);
  return {
    x: (clientX - rect.left - viewport.width / 2 - camera.x) / scale + SCENE_CENTER.x,
    y: (clientY - rect.top - viewport.height / 2 - camera.y) / scale + SCENE_CENTER.y,
  };
}
