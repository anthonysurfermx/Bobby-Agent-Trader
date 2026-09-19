import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/trader-land-gestures.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { draggedGridPosition, canvasPoint, SCENE_CENTER } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const origin = { col: 2, row: 3 };
let cases = 0;
// The default grid is today's 8×8 island at the base 92×46 tile.
for (const scale of [0.3, 0.7, 1, 1.5, 2.6]) {
  for (const [dx, dy, col, row] of [[0,0,2,3],[46,23,3,3],[-46,23,2,4],[46,-23,2,2],[-46,-23,1,3],[0,46,3,4],[92,0,3,2]]) {
    assert.deepEqual(draggedGridPosition(origin, dx * scale, dy * scale, scale), { col, row });
    cases += 1;
  }
}
assert.deepEqual(draggedGridPosition(origin, 1, 1, 1), origin, 'Tiny movement must not jump the origin');
assert.deepEqual(draggedGridPosition({ col: 0, row: 0 }, -500, -500, 1), { col: 0, row: 0 });
assert.deepEqual(draggedGridPosition({ col: 7, row: 7 }, 0, 500, 1), { col: 7, row: 7 });
cases += 3;

// Growth v1: a grown island has N×N tiles of 92·8/N × 46·8/N; one tile of drag
// is one cell at every size and zoom, and the clamp is the island's last cell.
for (const size of [8, 10, 12, 16]) {
  const grid = { tileW: 92 * 8 / size, tileH: 46 * 8 / size, size };
  const hw = grid.tileW / 2, hh = grid.tileH / 2;
  for (const scale of [0.7, 1, 1.25, 2.6 * size / 8]) {
    for (const [dx, dy, col, row] of [[0,0,2,3],[hw,hh,3,3],[-hw,hh,2,4],[hw,-hh,2,2],[-hw,-hh,1,3],[0,2*hh,3,4],[2*hw,0,3,2]]) {
      assert.deepEqual(draggedGridPosition(origin, dx * scale, dy * scale, scale, grid), { col, row }, `N=${size} scale=${scale} drag ${dx},${dy}`);
      cases += 1;
    }
  }
  const last = size - 1;
  assert.deepEqual(draggedGridPosition({ col: last, row: last }, 0, 5000, 1, grid), { col: last, row: last }, `N=${size} clamps at ${last}`);
  assert.deepEqual(draggedGridPosition({ col: 0, row: 0 }, -5000, -5000, 1, grid), { col: 0, row: 0 });
  // A long drag reaches the far corner of a big island, which the 8×8 clamp used to stop at 7.
  assert.deepEqual(draggedGridPosition({ col: 0, row: 0 }, 0, 2 * hh * last, 1, grid), { col: last, row: last }, `N=${size} reaches its far corner`);
  cases += 3;
}

// canvasPoint inverts the studio transform: scene centre under the viewport centre, camera offset, base × zoom.
const rect = { left: 10, top: 20 }, viewport = { width: 800, height: 600 };
for (const camera of [{ x: 0, y: 0, scale: 1 }, { x: 120, y: -40, scale: 2 }, { x: -300, y: 90, scale: 0.7 }]) {
  for (const base of [0.5, 0.96, 1.5]) {
    const point = { x: 250, y: 470 };
    const s = base * camera.scale;
    const clientX = rect.left + viewport.width / 2 + camera.x + (point.x - SCENE_CENTER.x) * s;
    const clientY = rect.top + viewport.height / 2 + camera.y + (point.y - SCENE_CENTER.y) * s;
    const back = canvasPoint(clientX, clientY, rect, viewport, camera, base);
    assert.ok(Math.abs(back.x - point.x) < 1e-9 && Math.abs(back.y - point.y) < 1e-9, `canvasPoint round trip at zoom ${camera.scale}, base ${base}`);
    cases += 1;
  }
}
console.log(`PASS: ${cases} drag and pointer geometry cases — five zoom levels on 8×8, sizes 8/10/12/16 with their own tiles and clamps, and the screen → canvas inverse`);
