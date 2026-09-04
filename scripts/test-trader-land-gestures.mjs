import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/trader-land-gestures.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { draggedGridPosition } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const origin = { col: 2, row: 3 };
for (const scale of [0.3, 0.7, 1, 1.5, 2.6]) {
  for (const [dx, dy, col, row] of [[0,0,2,3],[46,23,3,3],[-46,23,2,4],[46,-23,2,2],[-46,-23,1,3],[0,46,3,4],[92,0,3,2]]) {
    assert.deepEqual(draggedGridPosition(origin, dx * scale, dy * scale, scale), { col, row });
  }
}
assert.deepEqual(draggedGridPosition(origin, 1, 1, 1), origin, 'Tiny movement must not jump the origin');
assert.deepEqual(draggedGridPosition({ col: 0, row: 0 }, -500, -500, 1), { col: 0, row: 0 });
assert.deepEqual(draggedGridPosition({ col: 7, row: 7 }, 0, 500, 1), { col: 7, row: 7 });
console.log('PASS: 38 drag geometry cases across five zoom levels, origin preservation and bounds');
