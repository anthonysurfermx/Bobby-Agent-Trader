export type GridPoint = { col: number; row: number };

/** Move relative to the original grab, not the cell under the pointer. This
 * preserves the grab offset for tall sprites, handles and multi-cell pieces. */
export function draggedGridPosition(origin: GridPoint, dx: number, dy: number, scale: number): GridPoint {
  const safeScale = Math.max(0.001, scale);
  const across = dx / (46 * safeScale);
  const down = dy / (23 * safeScale);
  return {
    col: Math.min(7, Math.max(0, origin.col + Math.round((across + down) / 2))),
    row: Math.min(7, Math.max(0, origin.row + Math.round((down - across) / 2))),
  };
}
