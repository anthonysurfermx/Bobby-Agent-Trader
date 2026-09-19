// Trader Land Growth v1 — the web studio and desk rules that do not need a
// browser: geometry-driven hit testing at every island size, the core, draft
// validity and spawn, land-change detection, the seed card's horizon choice
// and the extend request (docs/trader-land/GROWTH-v1.md §3–§4).
import assert from 'node:assert/strict';
import { canvasPoint, draggedGridPosition, SCENE_CENTER } from '../src/lib/trader-land-gestures';
import { CORE_FOOTPRINT, coreCells, footprintCells, homeZoom, landGeometry, maxZoom, spriteFrame } from '../src/lib/trader-land/geometry';
import { CORE_UID, FALLBACK_CORE, TRADER_LAND_CLIENT_HEADER, draftFits, extendChoices, extendErrorMessage, findSpawn, growthLabel, horizonOptionLabel, landChanged, landCore, occupiedCells, type TierInfo } from '../src/lib/trader-land/growth';
import { applyExtended, extendSeed, grantsFromResults, parseGrant, seedCardReducer, seedOptions, type SeedCardState } from '../src/lib/trader-land/seed';

let cases = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); cases += 1; };
const eq = <T,>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); cases += 1; };

// ---------- hit testing: screen → canvas → cell, at 8/10/12/16 ----------
// The studio places the scene at viewport/2 + camera and scales it by base × zoom
// around (430, 335); a tap resolves through canvasPoint + geometry.cellAt.
const rect = { left: 0, top: 64 }, viewport = { width: 390, height: 700 };
const baseScale = Math.min(viewport.width / 830, viewport.height / 640, 1.5);
const toScreen = (x: number, y: number, camera: { x: number; y: number; scale: number }) => ({
  x: rect.left + viewport.width / 2 + camera.x + (x - SCENE_CENTER.x) * baseScale * camera.scale,
  y: rect.top + viewport.height / 2 + camera.y + (y - SCENE_CENTER.y) * baseScale * camera.scale,
});
for (const size of [8, 10, 12, 16]) {
  const geom = landGeometry(size);
  eq(geom.size, size, `landGeometry(${size})`);
  // Constant extent: the four slab corners are the same at every size.
  const top = geom.iso(-0.5, -0.5), right = geom.iso(size - 0.5, -0.5), bottom = geom.iso(size - 0.5, size - 0.5), left = geom.iso(-0.5, size - 0.5);
  ok(Math.abs(top.y - 207) < 1e-9 && Math.abs(bottom.y - 575) < 1e-9 && Math.abs(left.x - 62) < 1e-9 && Math.abs(right.x - 798) < 1e-9, `N=${size} keeps the 8×8 slab corners`);
  for (const camera of [{ x: 0, y: 0, scale: homeZoom(size) }, { x: -80, y: 40, scale: maxZoom(size) }, { x: 30, y: -20, scale: 0.7 }]) {
    for (let col = 0; col < size; col += 1) {
      for (let row = 0; row < size; row += 1) {
        const c = geom.iso(col, row);
        // The centre and four points 40 % of the way to each diamond corner all land on this cell.
        for (const [fx, fy] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
          const s = toScreen(c.x + fx * geom.tileW / 2, c.y + fy * geom.tileH / 2, camera);
          const p = canvasPoint(s.x, s.y, rect, viewport, camera, baseScale);
          // (+ 0 folds Math.round's -0 into 0; the studio only compares and stringifies cells)
          const hit = geom.cellAt(p.x, p.y), cell = { col: hit.col + 0, row: hit.row + 0 };
          assert.deepEqual(cell, { col, row }, `N=${size} zoom ${camera.scale} tap on ${col},${row} (+${fx},${fy})`);
          cases += 1;
        }
      }
    }
  }
  // Just outside the island resolves to an off-island cell the studio ignores.
  const outside = geom.cellAt(geom.iso(-1, 0).x, geom.iso(-1, 0).y);
  ok(outside.col < 0, `N=${size} a tap left of the slab is off the island`);
  // Drag with the island's own tile: one tile of screen movement is one cell.
  const s = baseScale * maxZoom(size);
  eq(draggedGridPosition({ col: 1, row: 1 }, geom.tileW / 2 * s, geom.tileH / 2 * s, s, geom), { col: 2, row: 1 }, `N=${size} drag one cell east`);
  // Zoom: the deepest zoom scales with N/8, home is 1.25 from 12×12 up.
  eq(maxZoom(size), 2.6 * size / 8, `N=${size} max zoom`);
  eq(homeZoom(size), size >= 12 ? 1.25 : 1, `N=${size} home zoom`);
  // A 1×1 tile at the deepest zoom is as big on screen as an 8×8 tile at 2.6.
  ok(Math.abs(geom.tileW * maxZoom(size) - 92 * 2.6) < 1e-9, `N=${size} deepest-zoom tile matches the 8×8 one`);
}

// ---------- sprites sit on the footprint's bottom vertex ----------
{
  const geom = landGeometry(10);
  const art = { anchor: [0.5, 0.9], contentBounds: [0.2, 0.1, 0.8, 0.9] };
  const frame = spriteFrame(geom, { cols: 1, rows: 1 }, 4, 5, 0, art);
  const bottomVertex = geom.iso(4, 5).y + geom.tileH / 2;
  ok(Math.abs(frame.y + frame.size * 0.9 - bottomVertex) < 1e-9 && Math.abs(frame.depth - bottomVertex) < 1e-9, 'the art anchor sits on the bottom vertex');
  ok(Math.abs(frame.x + frame.size * 0.5 - geom.iso(4, 5).x) < 1e-9, 'the art anchor is centred on the footprint');
  const dormant = spriteFrame(geom, CORE_FOOTPRINT, 3, 3, 0, art, { scale: 0.72 });
  const awake = spriteFrame(geom, CORE_FOOTPRINT, 3, 3, 0, art);
  ok(Math.abs(dormant.size - awake.size * 0.72) < 1e-9 && Math.abs(dormant.depth - awake.depth) < 1e-9, 'a dormant core is 72 % of the awake one, same ground');
  const flipped = spriteFrame(geom, { cols: 2, rows: 1 }, 2, 2, 90, { anchor: [0.4, 0.9], contentBounds: [0.1, 0.1, 0.9, 0.9] });
  ok(flipped.flip && Math.abs(flipped.x + flipped.size * (1 - 0.4) - geom.iso(2, 2.5).x) < 1e-9, 'a rotated piece mirrors around its anchor');
}

// ---------- the core, occupancy, drafts, spawn ----------
eq(landCore(undefined), FALLBACK_CORE, 'no core from an older server = 3,3 awake');
eq(landCore({ x: 6, y: 1, stage: 0 }, 10), { x: 6, y: 1, stage: 0 }, 'a moved dormant core is kept');
eq(landCore({ x: 7, y: 1, stage: 1 }, 8), FALLBACK_CORE, 'a core that would leave an 8×8 falls back');
eq(landCore({ x: 14, y: 14, stage: 1 }, 16), { x: 14, y: 14, stage: 1 }, 'a 16×16 core can sit in the far corner');
eq(coreCells({ x: 5, y: 2 }), ['5:2', '5:3', '6:2', '6:3'], 'core cells follow the core');
{
  const pieces = [{ footprint: { cols: 2, rows: 1 }, col: 0, row: 0, rotation: 0 }, { footprint: { cols: 2, rows: 1 }, col: 9, row: 0, rotation: 90 }];
  const withCore = occupiedCells(pieces, { x: 4, y: 4, stage: 1 });
  eq([...withCore].sort(), ['0:0', '1:0', '4:4', '4:5', '5:4', '5:5', '9:0', '9:1'], 'occupied = pieces (rotation-aware) + the core');
  const coreMoving = occupiedCells(pieces, null);
  ok(!coreMoving.has('4:4'), 'while the core is the draft its own cells are free');
  ok(draftFits(coreCells({ x: 4, y: 5 }), 10, coreMoving), 'the core can slide onto its own old cells');
  ok(draftFits(footprintCells({ cols: 2, rows: 2 }, 8, 8), 10, withCore), 'a 2×2 at 8,8 fits a 10×10');
  ok(!draftFits(footprintCells({ cols: 2, rows: 2 }, 9, 8), 10, withCore), 'a 2×2 at 9,8 hangs off a 10×10');
  ok(!draftFits(footprintCells({ cols: 1, rows: 1 }, 8, 0), 8, new Set()), 'column 8 is off an 8×8');
  ok(draftFits(footprintCells({ cols: 1, rows: 1 }, 8, 0), 10, new Set()), 'column 8 is on a 10×10');
  ok(!draftFits(['1:0'], 10, withCore), 'a taken cell is invalid');
}
eq(findSpawn(8, { cols: 1, rows: 1 }, new Set(coreCells())), { col: 1, row: 5 }, 'an 8×8 spawns at 1,5 like before');
eq(findSpawn(16, { cols: 1, rows: 1 }, new Set(coreCells())), { col: 2, row: 10 }, 'a 16×16 spawns in the same quarter');
{
  const full = new Set(Array.from({ length: 64 }, (_, i) => `${i % 8}:${Math.floor(i / 8)}`));
  full.delete('7:7');
  eq(findSpawn(8, { cols: 1, rows: 1 }, full), { col: 7, row: 7 }, 'the last free cell is found');
  eq(findSpawn(8, { cols: 2, rows: 1 }, full), null, 'nothing fits: no spawn');
}

// ---------- land changes clear draft/undo; growth copy ----------
ok(!landChanged({ size: 8, core: { x: 3, y: 3, stage: 0 } }, { size: 8, core: { x: 3, y: 3, stage: 0 } }), 'same land');
ok(landChanged({ size: 8, core: { x: 3, y: 3, stage: 0 } }, { size: 10, core: { x: 4, y: 4, stage: 0 } }), 'grown land');
ok(landChanged({ size: 10, core: { x: 4, y: 4, stage: 1 } }, { size: 10, core: { x: 6, y: 1, stage: 1 } }), 'moved core');
ok(landChanged({ size: 8, core: { x: 3, y: 3, stage: 0 } }, { size: 8, core: { x: 3, y: 3, stage: 1 } }), 'woken core (land.core changed)');
ok(!landChanged({ size: 8 }, { size: 8 }), 'an older server never reports a change');
ok(!landChanged(null, { size: 10 }), 'the first read is not a change');
eq(growthLabel(10, { occupied: 22, threshold: 60, nextSize: 12 }), '10×10 · 22/60', 'growth label');
eq(growthLabel(16, { occupied: 120, threshold: null, nextSize: null }), '16×16 · full size', 'a 16×16 is full size');
eq(growthLabel(8, null), '8×8', 'no growth info');

// ---------- the studio's extend options ----------
const piece = (id: string, kind = 'decor', footprint: [number, number] = [1, 1]) => ({ id, world: id.split('_').slice(0, 2).join('_'), attribution: '', kind, name: { en: id, es: `es:${id}` }, footprint });
const tiers: TierInfo[] = [
  { id: 'common', hours: 24, footprint: [1, 1], length: 15, held: 3, next: piece('thesis_citadel_risk_shield') },
  { id: 'building', hours: 72, footprint: [2, 1], length: 5, held: 0, next: piece('thesis_citadel_double_gate', 'building', [2, 1]) },
  { id: 'landmark', hours: 168, footprint: [2, 2], length: 5, held: 0, next: piece('crypto_bay_waiting_lighthouse', 'landmark', [2, 2]) },
];
{
  const fresh = { hours: 24 as const, tier: 'common' as const, reviewAt: '2026-09-20T10:00:00Z', extendable: true, extendTo: [72, 168] };
  eq(extendChoices(fresh, tiers).map((c) => [c.hours, c.piece?.id]), [[72, 'thesis_citadel_double_gate'], [168, 'crypto_bay_waiting_lighthouse']], 'a 24 h seed offers 3 and 7 days with the next piece of each tier');
  eq(extendChoices({ ...fresh, hours: 72, tier: 'building', extendTo: [168] }, tiers).map((c) => c.hours), [168], 'a 3-day seed can only go to 7 days');
  eq(extendChoices({ ...fresh, extendable: false }, tiers), [], 'an open review offers nothing');
  eq(extendChoices({ ...fresh, extendTo: [24, 72] }, tiers).map((c) => c.hours), [72], 'never shorter or equal');
  eq(horizonOptionLabel(72), '3 days · building 2×1', 'option copy');
  eq(horizonOptionLabel(168), '7 days · landmark 2×2', 'option copy');
}

// ---------- the desk: grants, the seed card, extend ----------
const seedWorld = {
  routeIndex: 3, item: piece('thesis_citadel_risk_shield'), inventoryId: 'inv-1', state: 'seed', bloomedInventoryId: null, routeComplete: false,
  horizon: { hours: 24, tier: 'common', reviewAt: '2026-09-20T10:00:00Z', extendable: true, extendTo: [72, 168] },
  tiers: { common: piece('thesis_citadel_risk_shield'), building: piece('thesis_citadel_double_gate', 'building', [2, 1]), landmark: piece('crypto_bay_waiting_lighthouse', 'landmark', [2, 2]) },
};
{
  const grants = grantsFromResults([
    { id: 'e1', awarded: 10, world: seedWorld },
    { id: 'e2', awarded: 20, world: { ...seedWorld, inventoryId: 'inv-2', state: 'bloomed', horizon: undefined, tiers: undefined } },
    { id: 'e3', awarded: 0 },
    { id: 'e4', awarded: 10, world: null },
    { id: 'e5', duplicate: true, world: { routeIndex: 8, item: null, inventoryId: null, state: null, bloomedInventoryId: null, routeComplete: true } },
  ]);
  eq(grants.map(([id, g]) => [id, g.state]), [['e1', 'seed'], ['e2', 'bloomed']], 'only real plants become grants (capped, failed and exhausted results do not)');
  eq(grants[1][1].horizon, null, 'a bloomed NO TRADE piece has no horizon');
  eq(parseGrant({ ...seedWorld, horizon: { ...seedWorld.horizon, extendTo: [24, 72, 999] } })?.horizon?.extendTo, [72], 'extendTo keeps only 72/168');
}
const grant = parseGrant(seedWorld)!;
{
  const options = seedOptions(grant);
  eq(options.map((o) => [o.hours, o.piece?.id, o.current, o.available]), [
    [24, 'thesis_citadel_risk_shield', true, false],
    [72, 'thesis_citadel_double_gate', false, true],
    [168, 'crypto_bay_waiting_lighthouse', false, true],
  ], 'after a read: 24 h selected, 3 days · building and 7 days · landmark offered with their pieces');
  eq(seedOptions(parseGrant({ ...seedWorld, state: 'bloomed' })!), [], 'NO TRADE: no picker');

  let state: SeedCardState = { phase: 'choose' };
  state = seedCardReducer(state, { type: 'pick', hours: 24, options });
  eq(state, { phase: 'choose' }, 'picking the current horizon does nothing');
  state = seedCardReducer(state, { type: 'pick', hours: 168, options });
  eq(state, { phase: 'confirm', hours: 168 }, 'a longer horizon asks to confirm first');
  eq(seedCardReducer(state, { type: 'cancel' }), { phase: 'choose' }, 'cancel returns to the choice');
  state = seedCardReducer(state, { type: 'submit' });
  eq(state, { phase: 'saving', hours: 168 }, 'confirm saves');
  eq(seedCardReducer(state, { type: 'pick', hours: 72, options }), state, 'no new pick while saving');
  eq(seedCardReducer(state, { type: 'failure', message: 'Its review is already open.' }), { phase: 'error', hours: 168, message: 'Its review is already open.' }, 'a refusal is shown on the confirm step');
  eq(seedCardReducer({ phase: 'error', hours: 168, message: 'x' }, { type: 'submit' }), { phase: 'saving', hours: 168 }, 'retry from the error');
  eq(seedCardReducer(state, { type: 'success' }), { phase: 'choose' }, 'success returns to the choice');

  const extended = applyExtended(grant, { inventoryId: 'inv-1', item: piece('thesis_citadel_double_gate', 'building', [2, 1]), horizon: { hours: 72, tier: 'building', reviewAt: '2026-09-22T10:00:00Z', extendable: true, extendTo: [168] } });
  eq(seedOptions(extended).map((o) => [o.hours, o.piece?.id, o.current, o.available]), [
    [24, 'thesis_citadel_risk_shield', false, false],
    [72, 'thesis_citadel_double_gate', true, false],
    [168, 'crypto_bay_waiting_lighthouse', false, true],
  ], 'after extending to 3 days: it cannot go back to 24 h, 7 days is still open');
}
{
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const reply = (status: number, body: unknown) => (async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return Response.json(body, { status }); }) as typeof fetch;
  const good = await extendSeed({ 'x-bobby-session': 'tok' }, 'inv-1', 72, reply(200, { ok: true, extended: { inventoryId: 'inv-1', item: piece('thesis_citadel_double_gate', 'building', [2, 1]), horizon: { hours: 72, tier: 'building', reviewAt: '2026-09-22T10:00:00Z', extendable: true, extendTo: [168] } }, inventory: [], placements: [] }));
  ok(good.ok && good.extended?.item.id === 'thesis_citadel_double_gate' && good.extended?.horizon.hours === 72, 'extend returns the new piece and horizon');
  const sent = calls[0];
  eq(sent.url, '/api/trader-land', 'extend posts to /api/trader-land');
  eq(JSON.parse(String(sent.init.body)), { action: 'extend', inventoryId: 'inv-1', hours: 72 }, 'extend body is the contract body');
  const headers = sent.init.headers as Record<string, string>;
  eq([headers['X-Trader-Land-Client'], headers['x-bobby-session'], headers['Content-Type']], ['2', 'tok', 'application/json'], 'extend declares the Growth v1 client and carries the credential');
  eq(TRADER_LAND_CLIENT_HEADER, { 'X-Trader-Land-Client': '2' }, 'the client header is version 2');
  const late = await extendSeed({}, 'inv-1', 168, reply(409, { error: 'Its review is already open', reviewAt: '2026-09-20T10:00:00Z' }));
  ok(!late.ok && late.status === 409 && /review is already open/.test(late.message), 'review_open refusal');
  const bloomed = await extendSeed({}, 'inv-1', 168, reply(409, { error: 'This seed already bloomed' }));
  ok(!bloomed.ok && /already bloomed/.test(bloomed.message), 'not_seed refusal');
  const down = await extendSeed({}, 'inv-1', 168, (async () => { throw new Error('offline'); }) as typeof fetch);
  ok(!down.ok && down.status === 0, 'a network failure is a refusal, not a throw');
  eq(extendErrorMessage(400, 'A horizon can only grow'), 'A horizon can only grow.', 'not_upward copy');
  eq(extendErrorMessage(404, 'not_found'), 'This seed is no longer on your island.', 'not_found copy');
}
eq(CORE_UID, 'aura-core', 'the core draft uid');

console.log(`PASS: ${cases} studio + desk cases — hit testing at 8/10/12/16 over three zooms, bottom-vertex sprites, core/occupancy/spawn, land changes, extend options, grants, seed card states and the extend request`);
