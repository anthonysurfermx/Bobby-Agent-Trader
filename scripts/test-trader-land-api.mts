// ============================================================
// scripts/test-trader-land-api.mts
// Handler tests for Trader Land Growth v1 (docs/trader-land/GROWTH-v1.md §3)
// against a stubbed PostgREST — no network, no database, no production:
//   · GET /api/trader-land: land.core / land.growth, tiers, legacy route,
//     per-seed horizon and reviewAt, capabilities, iOS-compatible fields
//   · POST extend / move_core: RPC arguments and the error mapping
//   · POST place / move / remove: core and bounds from the land, writes
//     through the land-locking RPCs, coordinates drawn on another island
//     size refused with 409, growth only with X-Trader-Land-Client: 2
//   · the core wakes at 5 pieces on the owner's read (and in public views)
//   · POST close: the bloom CAS carries the horizon it read
//   · POST /api/progress: tl_grant_piece grants, RouteGrant compatibility,
//     routeIndex capped at 8, horizon + tier preview for seeds
// The SQL behind the RPCs is covered by scripts/test-trader-land-growth.sql.
// Run: `npx tsx scripts/test-trader-land-api.mts`
// ============================================================
import { readFileSync } from 'node:fs';

const failures: string[] = [];
let passed = 0;
const assert = (cond: unknown, msg: string) => {
  if (cond) passed++;
  else { failures.push(msg); console.error('  ✗', msg); }
};
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.BOBBY_SUPABASE_ANON_KEY = 'anon-key';
delete process.env.BOBBY_CONTROL_SOURCE;

// ---------- the catalog, read from the migrations (ids, kinds, footprints, tiers) ----------
const base = readFileSync('supabase/bobby-protocol/supabase/migrations/20260903000006_trader_land.sql', 'utf8');
const growth = readFileSync('supabase/bobby-protocol/supabase/migrations/20260919120516_trader_land_growth.sql', 'utf8');
const tiers = new Map([...growth.matchAll(/\('([a-z_]+)',\s*'(common|building|landmark)',\s*(\d+)\)/g)].map((m) => [m[1], { tier: m[2], tier_index: Number(m[3]) }]));
const catalogRows = [...base.matchAll(/\('([a-z_]+)', '([a-z_]+)', '([^']+)', '([a-z]+)', (\d), (\d), '([^']+)'::jsonb, (null|\d+), '([^']+)'\)/g)].map((m) => ({
  id: m[1], world: m[2], attribution: m[3], kind: m[4], footprint_w: Number(m[5]), footprint_h: Number(m[6]), name: JSON.parse(m[7]),
  route_index: m[8] === 'null' ? null : Number(m[8]), tier: tiers.get(m[1])?.tier ?? null, tier_index: tiers.get(m[1])?.tier_index ?? null, art_url: m[9],
}));
assert(catalogRows.length === 25 && catalogRows.every((i) => i.tier), 'fixture catalog: 25 tiered items');
const tierOf = (id: string) => catalogRows.find((i) => i.id === id)?.tier ?? null;
const summary = (id: string) => { const i = catalogRows.find((row) => row.id === id)!; return { id: i.id, world: i.world, attribution: i.attribution, kind: i.kind, name: i.name, footprint: [i.footprint_w, i.footprint_h] }; };

// ---------- a stubbed PostgREST ----------
const ID = '11111111-1111-4111-8111-111111111111';
const U = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const H = 3_600_000;

interface InvRow { id: string; item_id: string; state: 'seed' | 'bloomed'; source: string; seeded_at: string; bloomed_at: string | null; event_id: string | null; horizon_hours: number }
let land = { size: 8, theme: 'night', visibility: 'private', share_code: null, title: null, published_at: null, core_x: 3, core_y: 3, core_stage: 0 };
let inventory: InvRow[] = [];
let placements: Array<{ id: string; inventory_id: string; x: number; y: number; rotation: number; placed_at: string }> = [];
let progressRow: Record<string, unknown> = {};
let ledgerRows: Array<{ id: string; client_event_id: string }> = [];
/** Events already in the ledger (the request's duplicates), with what they were awarded. */
let seenRows: Array<{ client_event_id: string; kind: string; awarded: number }> = [];
const rpcAnswers: Record<string, (args: Record<string, unknown>) => unknown> = {};
let casRows: unknown[] = [];
let calls: Array<{ method: string; url: string; body: unknown }> = [];

function reset() {
  land = { size: 8, theme: 'night', visibility: 'private', share_code: null, title: null, published_at: null, core_x: 3, core_y: 3, core_stage: 0 };
  inventory = [
    { id: U(1), item_id: 'crypto_bay_water_walkway', state: 'seed', source: 'route', seeded_at: iso(NOW - 2 * H), bloomed_at: null, event_id: U(101), horizon_hours: 24 },
    { id: U(2), item_id: 'thesis_citadel_double_gate', state: 'seed', source: 'route', seeded_at: iso(NOW - 30 * H), bloomed_at: null, event_id: U(102), horizon_hours: 72 },
    { id: U(3), item_id: 'crypto_bay_data_dock', state: 'seed', source: 'route', seeded_at: iso(NOW - 25 * H), bloomed_at: null, event_id: U(103), horizon_hours: 24 },
    { id: U(4), item_id: 'risk_reef_dual_orbit_antenna', state: 'bloomed', source: 'route', seeded_at: iso(NOW - 50 * H), bloomed_at: iso(NOW - 26 * H), event_id: U(104), horizon_hours: 24 },
    { id: U(5), item_id: 'crypto_bay_candle_tower', state: 'bloomed', source: 'season', seeded_at: iso(NOW - 40 * H), bloomed_at: iso(NOW - 40 * H), event_id: U(105), horizon_hours: 24 },
    { id: U(6), item_id: 'thesis_citadel_risk_shield', state: 'bloomed', source: 'route', seeded_at: iso(NOW - 60 * H), bloomed_at: iso(NOW - 36 * H), event_id: U(106), horizon_hours: 24 },
  ];
  placements = [{ id: U(201), inventory_id: U(4), x: 5, y: 5, rotation: 0, placed_at: iso(NOW - 20 * H) }];
  progressRow = { identity_id: ID, companion_id: null, vibe_id: 'directo', onboarded: true, risk_notice_version: 1, xp: 100, aura: 10, route_index: 5, streak: 1, last_day: null, daily_awards: 0, daily_awards_day: null, quick_access: [], last_platform: 'ios', updated_at: iso(NOW) };
  ledgerRows = [];
  seenRows = [];
  casRows = [];
  calls = [];
  for (const key of Object.keys(rpcAnswers)) delete rpcAnswers[key];
  // The placement RPCs, as a tiny database: they succeed and change the fixture.
  rpcAnswers.tl_place_piece = (args) => {
    const id = U(300 + placements.length);
    placements.push({ id, inventory_id: String(args.p_inventory), x: Number(args.p_x), y: Number(args.p_y), rotation: Number(args.p_rotation), placed_at: iso(NOW) });
    return { ok: true, placement_id: id };
  };
  rpcAnswers.tl_move_piece = (args) => {
    const row = placements.find((p) => p.id === args.p_placement);
    if (!row) return { ok: false, error: 'not_found' };
    Object.assign(row, { x: Number(args.p_x), y: Number(args.p_y), rotation: Number(args.p_rotation) });
    return { ok: true, placement_id: row.id };
  };
  rpcAnswers.tl_remove_piece = (args) => {
    const before = placements.length;
    placements = placements.filter((p) => p.id !== args.p_placement);
    return placements.length < before ? { ok: true, placement_id: args.p_placement } : { ok: false, error: 'not_found' };
  };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
  const url = String(input);
  const method = (init.method ?? 'GET').toUpperCase();
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
  calls.push({ method, url, body });
  const path = url.replace('https://db.test/rest/v1/', '');
  if (url === 'https://db.test/auth/v1/user') return json({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: null, app_metadata: { provider: 'apple' } });
  if (path.startsWith('bobby_identities')) return json([{ id: ID, auth_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', wallet_address: null }]);
  if (path.startsWith('api_cache')) return json({ message: 'not stubbed' }, 404);
  if (path.startsWith('rpc/')) {
    const fn = path.slice(4).split('?')[0];
    const answer = rpcAnswers[fn];
    return answer ? json(answer(body)) : json({ message: `no ${fn}` }, 500);
  }
  if (path.startsWith('tl_lands')) {
    if (method === 'PATCH') return json([]);
    return json([land]);
  }
  if (path.startsWith('tl_items')) return json(catalogRows);
  if (path.startsWith('tl_inventory')) {
    if (method === 'PATCH') return json(casRows);
    const byId = path.match(/[?&]id=eq\.([0-9a-f-]+)/)?.[1];
    const rows = byId ? inventory.filter((r) => r.id === byId) : inventory;
    const routeOnly = path.includes('source=eq.route');
    return json(rows.filter((r) => !routeOnly || r.source === 'route').map((r) => ({ ...r, tl_items: { tier: tierOf(r.item_id) } })));
  }
  if (path.startsWith('tl_placements')) {
    // Every write goes through the RPCs; a direct write would bypass the land lock.
    if (method !== 'GET') return json({ message: `direct ${method} on tl_placements` }, 599);
    return json(placements);
  }
  if (path.startsWith('bobby_progress_events')) {
    if (method === 'POST') return json([{ id: U(399) }], 201);
    if (path.includes('select=id,client_event_id')) return json(ledgerRows);
    if (path.includes('select=client_event_id,kind,awarded')) return json(seenRows);
    if (path.includes('select=client_event_id')) return json(seenRows.map((r) => ({ client_event_id: r.client_event_id })));
    return json([]);  // seed events: none of the fixtures carries a thesis
  }
  if (path.startsWith('bobby_progress')) {
    if (method === 'PATCH') return json([{ ...progressRow, ...body }]);
    return json([progressRow]);
  }
  return json({ message: `not stubbed: ${method} ${url}` }, 599);
}) as typeof fetch;

const { default: landHandler } = await import('../api/trader-land.ts');
const { publicWorld } = await import('../api/_lib/trader-land.ts');
const { default: progressHandler } = await import('../api/progress.ts');
type Out = { status: number; body: any };
function call(handler: unknown, method: string, body?: unknown, headers: Record<string, string> = {}): Promise<Out> {
  const out: Out = { status: 0, body: undefined };
  const res = {
    setHeader() { return res; },
    status(code: number) { out.status = code; return res; },
    json(value: unknown) { out.body = value; return res; },
    send(value: unknown) { out.body = value; return res; },
  };
  const req = { method, query: {}, body, headers: { authorization: 'Bearer supabase-access-token', 'x-forwarded-for': '203.0.113.9', ...headers } };
  return (handler as (req: unknown, res: unknown) => Promise<unknown>)(req, res).then(() => out);
}
const V2 = { 'x-trader-land-client': '2' };
const rpcCalls = (fn: string) => calls.filter((c) => c.url.endsWith(`rpc/${fn}`));

// ---------- GET world ----------
reset();
{
  const { status, body: w } = await call(landHandler, 'GET');
  assert(status === 200 && w.ok, `GET world (${status})`);
  eq(w.land.size, 8, 'land.size is still a number');
  eq(w.land.core, { x: 3, y: 3, stage: 0 }, 'land.core from the land row');
  eq(w.land.growth, { occupied: 5, threshold: 39, nextSize: 10 }, 'growth: 1 piece + 4 core cells of 39');
  assert(!('core_x' in w.land) && !('core_stage' in w.land), 'raw core columns stay out of land');
  eq(w.capabilities, { move: true, close: true, extend: true, moveCore: true, grow: true }, 'capabilities');
  eq(w.tiers.map((t: any) => [t.id, t.hours, t.footprint, t.length, t.held, t.next?.id]), [
    ['common', 24, [1, 1], 15, 4, 'evidence_mines_crystal_vein_rock'],
    ['building', 72, [2, 1], 5, 1, 'crypto_bay_candle_tower'],
    ['landmark', 168, [2, 2], 5, 0, 'crypto_bay_waiting_lighthouse'],
  ], 'tiers: held per tier (season excluded) and the next piece of each');
  eq(w.tiers[0].next, summary('evidence_mines_crystal_vein_rock'), 'tiers[].next is a PieceSummary');
  eq(w.route, { index: 4, total: 15, next: summary('evidence_mines_crystal_vein_rock'), complete: false }, 'legacy route: common held mod 15, never complete');
  eq(w.review, { windowHours: 24, ready: 1 }, 'review.windowHours stays 24; one seed is ready');
  const byId = new Map(w.inventory.map((r: any) => [r.id, r]));
  const s24 = byId.get(U(1)) as any, s72 = byId.get(U(2)) as any, ready = byId.get(U(3)) as any, season = byId.get(U(5)) as any, bloomed = byId.get(U(4)) as any;
  eq(s24.horizon, { hours: 24, tier: 'common', reviewAt: iso(NOW - 2 * H + 24 * H), extendable: true, extendTo: [72, 168] }, '24 h seed horizon');
  eq(s72.review.reviewAt, iso(NOW - 30 * H + 72 * H), 'review.reviewAt follows the seed horizon (72 h)');
  eq(s72.review.ready, false, 'a 72 h seed is not ready after 30 h');
  eq(s72.horizon.extendTo, [168], 'a 72 h seed can still go to 7 days');
  eq([ready.review.ready, ready.horizon.extendable], [true, false], 'an open review: ready, no longer extendable');
  assert(typeof s24.review.reviewAt === 'string' && typeof s24.review.ready === 'boolean', 'SeedReview keeps reviewAt:String and ready:Bool (iOS 1.1 / 31)');
  eq(season.horizon, null, 'season pieces carry no horizon');
  eq([bloomed.horizon.extendable, bloomed.review], [false, null], 'a bloomed route piece: horizon kept, no review');
  assert(w.inventory.every((r: any) => typeof r.id === 'string' && typeof r.item_id === 'string' && typeof r.state === 'string' && typeof r.placed === 'boolean'), 'inventory keeps its required fields');
  assert(w.inventory.every((r: any) => !('event_id' in r) && !('tl_items' in r) && !('horizon_hours' in r)), 'internal columns are stripped');
  eq(w.share, { public: false, code: null, title: null, publishedAt: null }, 'share unchanged');
}

// ---------- shipped iOS (no client header) on an island it would draw wrong ----------
reset();
{
  const plain = await call(landHandler, 'GET');
  assert(plain.body.ok === true && !('error' in plain.body), 'an 8x8 island with the core at 3,3 still opens on shipped iOS');
  land = { ...land, core_x: 0, core_y: 5 };
  const moved = await call(landHandler, 'GET');
  eq([moved.status, moved.body.ok, moved.body.error], [200, false, 'Update Bobby to open this island'], 'a moved core: shipped iOS gets ok:false (it shows "not supported yet")');
  assert(moved.body.land?.core?.x === 0, 'the world still rides along for readers that ignore ok');
  eq((await call(landHandler, 'GET', undefined, V2)).body.ok, true, 'a growth client opens the same island');
  land = { ...land, core_x: 3, core_y: 3, size: 10 };
  eq((await call(landHandler, 'GET')).body.ok, false, 'a grown island: shipped iOS gets ok:false');
  eq((await call(landHandler, 'GET', undefined, V2)).body.ok, true, 'a grown island opens for a growth client');
}

// ---------- extend ----------
reset();
{
  rpcAnswers.tl_extend_seed = (args) => {
    if (args.p_inventory === U(1)) return { ok: true, inventory_id: U(1), item_id: 'crypto_bay_candle_tower', tier: 'building', horizon_hours: args.p_hours, review_at: iso(NOW - 2 * H + 72 * H).replace('Z', '+00:00') };
    if (args.p_inventory === U(4)) return { ok: false, error: 'not_seed' };
    if (args.p_inventory === U(3)) return { ok: false, error: 'review_open', review_at: iso(NOW - H).replace('Z', '+00:00') };
    if (args.p_inventory === U(2)) return { ok: false, error: 'not_upward' };
    return { ok: false, error: 'not_found' };
  };
  const ok = await call(landHandler, 'POST', { action: 'extend', inventoryId: U(1), hours: 72 });
  eq(rpcCalls('tl_extend_seed')[0]?.body, { p_identity: ID, p_inventory: U(1), p_hours: 72 }, 'extend calls tl_extend_seed with the caller');
  assert(ok.status === 200 && ok.body.ok && ok.body.land && ok.body.inventory, 'extend returns the world');
  eq(ok.body.extended, { inventoryId: U(1), item: summary('crypto_bay_candle_tower'), horizon: { hours: 72, tier: 'building', reviewAt: iso(NOW - 2 * H + 72 * H), extendable: true, extendTo: [168] } }, 'extended: the new piece and horizon');
  const cases: Array<[string, number, unknown]> = [
    [U(4), 409, { error: 'This seed already bloomed' }],
    [U(3), 409, { error: 'Its review is already open', reviewAt: iso(NOW - H) }],
    [U(2), 400, { error: 'A horizon can only grow' }],
    [U(9), 404, { error: 'Piece not in your inventory' }],
  ];
  for (const [inventoryId, status, body] of cases) {
    const r = await call(landHandler, 'POST', { action: 'extend', inventoryId, hours: 168 });
    eq([r.status, r.body], [status, body], `extend refusal for ${inventoryId}`);
  }
  const low = await call(landHandler, 'POST', { action: 'extend', inventoryId: U(1), hours: 24 });
  eq(rpcCalls('tl_extend_seed').at(-1)?.body, { p_identity: ID, p_inventory: U(1), p_hours: 24 }, 'a downward horizon reaches the database, which decides');
  assert(low.status === 200 || low.status === 400, 'and is answered by it');
  const junk = await call(landHandler, 'POST', { action: 'extend', inventoryId: 'not-a-uuid', hours: 72 });
  assert(junk.status === 400 && junk.body.error === 'Invalid payload', 'a malformed extend is refused by the schema');
}

// ---------- move_core ----------
reset();
{
  rpcAnswers.tl_move_core = (args) => args.p_x === 7 ? { ok: false, error: 'outside' } : args.p_x === 4 && args.p_y === 4 ? { ok: false, error: 'occupied' } : { ok: true, core_x: args.p_x, core_y: args.p_y };
  const ok = await call(landHandler, 'POST', { action: 'move_core', x: 0, y: 5 }, V2);
  eq(rpcCalls('tl_move_core')[0]?.body, { p_identity: ID, p_x: 0, p_y: 5, p_size: null }, 'move_core calls tl_move_core (client 2 without a size: the frame is not checked)');
  assert(calls.findIndex((c) => c.url.includes('tl_lands?on_conflict')) < calls.findIndex((c) => c.url.endsWith('rpc/tl_move_core')), 'the land exists before the core moves');
  eq([ok.status, ok.body.coreMoved], [200, { x: 0, y: 5 }], 'coreMoved');
  assert(ok.body.land?.core, 'move_core returns the world');
  eq([(await call(landHandler, 'POST', { action: 'move_core', x: 7, y: 0 })).body, (await call(landHandler, 'POST', { action: 'move_core', x: 4, y: 4 })).body], [{ error: 'Outside the island' }, { error: 'The island changed. Reload before trying again.' }], 'outside / occupied messages');
  const outsideStatus = (await call(landHandler, 'POST', { action: 'move_core', x: 7, y: 0 })).status;
  const occupiedStatus = (await call(landHandler, 'POST', { action: 'move_core', x: 4, y: 4 })).status;
  eq([outsideStatus, occupiedStatus], [400, 409], 'outside 400, occupied 409');
  eq((await call(landHandler, 'POST', { action: 'move_core', x: 16, y: 0 })).status, 400, 'x beyond 15 is refused by the schema');
  // The frame the target was drawn on reaches the database, which compares it under the land lock.
  calls = [];
  await call(landHandler, 'POST', { action: 'move_core', x: 1, y: 1 });
  await call(landHandler, 'POST', { action: 'move_core', x: 1, y: 1, size: 10 }, V2);
  eq(rpcCalls('tl_move_core').map((c) => (c.body as { p_size: unknown }).p_size), [8, 10], 'an older client draws 8×8; a growth client may say its size');
  rpcAnswers.tl_move_core = () => ({ ok: false, error: 'resized', size: 10 });
  eq(await call(landHandler, 'POST', { action: 'move_core', x: 1, y: 1, size: 8 }, V2), { status: 409, body: { error: 'The island changed. Reload before trying again.' } }, 'a core target drawn on the pre-growth island is refused with 409');
  eq((await call(landHandler, 'POST', { action: 'move_core', x: 1, y: 1, size: 9 }, V2)).status, 400, 'a size that no island has is refused by the schema');
}

// ---------- place: bounds and core from the land, growth only for client 2 ----------
reset();
{
  // The same bloomed piece is placed again and again: take it back in hand after each placement.
  const inHand = () => { placements = placements.filter((p) => p.inventory_id !== U(6)); };
  rpcAnswers.tl_grow_land = () => ({ ok: true, grew: true, from: 8, to: 10, shift: 1, size: 10, core_x: 4, core_y: 4, core_stage: 1, woke: false });
  const onCore = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 4, y: 4 }, V2);
  eq([onCore.status, onCore.body.error], [409, 'Overlaps another piece'], 'the core at 3,3 blocks 4,4');
  land.core_x = 0; land.core_y = 0;
  const oldCore = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 4, y: 4 }, V2);
  eq(oldCore.status, 200, 'with the core moved to 0,0, the old core cells take pieces');
  eq(oldCore.body.grew, { from: 8, to: 10, shift: 1 }, 'client 2: the response carries grew');
  eq(rpcCalls('tl_grow_land').map((c) => c.body), [{ p_identity: ID }], 'client 2: tl_grow_land after the placement');
  inHand();
  const onMoved = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 1, y: 1 }, V2);
  eq([onMoved.status, onMoved.body.error], [409, 'Overlaps another piece'], 'the moved core blocks 1,1');
  const outside8 = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 8, y: 2 }, V2);
  eq([outside8.status, outside8.body.error], [400, 'Outside the 8×8 land'], 'an 8×8 ends at 7');
  land.size = 10;
  const inside10 = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 9, y: 9 }, V2);
  eq(inside10.status, 200, 'a 10×10 takes a piece at 9,9');
  inHand();
  rpcAnswers.tl_grow_land = () => ({ ok: true, grew: false, from: 10, to: 10, shift: 0, size: 10, core_x: 0, core_y: 0, core_stage: 0, woke: false });
  const noGrowth = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 9, y: 8 }, V2);
  assert(noGrowth.status === 200 && 'grew' in noGrowth.body && noGrowth.body.grew === null, 'client 2 without growth: grew null');
  inHand();

  eq(rpcCalls('tl_place_piece').map((c) => (c.body as { p_size: number }).p_size), [8, 10, 10], 'each placement carries the size it was validated on');

  // An older client only ever draws 8×8: its coordinates mean nothing on a 10×10.
  calls = [];
  const stale = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 7, y: 7 });
  eq([stale.status, stale.body], [409, { error: 'The island changed. Reload before trying again.' }], 'an older client on a grown island: 409, nothing written');
  eq(rpcCalls('tl_place_piece').length, 0, 'the stale placement never reaches the database');
  const staleV2 = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 7, y: 7, size: 8 }, V2);
  eq(staleV2.status, 409, 'a growth client that drew the 8×8 is refused on the 10×10');
  const fresh = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 8, y: 7, size: 10 }, V2);
  eq(fresh.status, 200, 'the same client that drew the 10×10 places');

  reset();
  calls = [];
  const old = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 7, y: 7 });
  assert(old.status === 200 && !('grew' in old.body), 'an older client on an 8×8 places, and gets no grew key');
  eq(rpcCalls('tl_place_piece')[0]?.body, { p_identity: ID, p_inventory: U(6), p_x: 7, p_y: 7, p_rotation: 0, p_size: 8 }, 'through tl_place_piece');
  eq(rpcCalls('tl_grow_land').length, 0, 'an older client never grows the island');
  eq(calls.filter((c) => c.method === 'PATCH' && c.url.includes('tl_lands')).length, 0, 'under 5 pieces the core is not woken');
  placements = [0, 1, 2, 3].map((i) => ({ id: U(210 + i), inventory_id: U(4), x: 6 + (i % 2), y: 6 + Math.floor(i / 2), rotation: 0, placed_at: iso(NOW) }));
  calls = [];
  const fifth = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 0, y: 7 });
  const wake = calls.find((c) => c.method === 'PATCH' && c.url.includes('tl_lands'));
  assert(wake && wake.url.includes(`identity_id=eq.${ID}`) && wake.url.includes('core_stage=eq.0') && (wake.body as { core_stage: number }).core_stage === 1, 'the 5th piece from an older client wakes the core, nothing else');
  eq(fifth.body.land?.core?.stage, 1, 'and the response shows it awake');
  eq(rpcCalls('tl_grow_land').length, 0, 'still no growth');

  // Every database refusal of the write is "the island changed".
  reset();
  for (const error of ['resized', 'changed', 'not_found']) {
    rpcAnswers.tl_place_piece = () => ({ ok: false, error, detail: 'x' });
    const r = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 0, y: 0 }, V2);
    eq([r.status, r.body], [409, { error: 'The island changed. Reload before trying again.' }], `place refused as ${error} → 409`);
  }
  delete rpcAnswers.tl_place_piece;  // the stub answers 500 without an answer: a transport failure
  const down = await call(landHandler, 'POST', { action: 'place', inventoryId: U(6), x: 0, y: 0 }, V2);
  eq([down.status, down.body], [502, { error: 'Could not place the piece' }], 'a failed write is still 502');
  eq(calls.filter((c) => c.url.includes('/tl_placements') && c.method !== 'GET').length, 0, 'no direct write to tl_placements');
}

// ---------- move / remove: the core from the land, writes through the RPCs ----------
reset();
{
  const toCore = await call(landHandler, 'POST', { action: 'move', placementId: U(201), x: 3, y: 4 });
  eq(toCore.status, 409, 'a piece cannot move under the core');
  eq(rpcCalls('tl_move_piece').length, 0, 'refused before the database');
  land.core_x = 6; land.core_y = 6;
  const toOld = await call(landHandler, 'POST', { action: 'move', placementId: U(201), x: 3, y: 4, rotation: 90 });
  eq([toOld.status, toOld.body.moved], [200, U(201)], 'the old core cell is free once the core moved');
  eq(rpcCalls('tl_move_piece')[0]?.body, { p_identity: ID, p_placement: U(201), p_x: 3, p_y: 4, p_rotation: 90, p_size: 8 }, 'through tl_move_piece, with the size it was validated on');
  eq((await call(landHandler, 'POST', { action: 'move', placementId: U(201), x: 7, y: 7 })).status, 409, 'the piece cannot move onto the moved core');
  land.size = 10;
  calls = [];
  eq((await call(landHandler, 'POST', { action: 'move', placementId: U(201), x: 1, y: 1 })).status, 409, 'an older client cannot move a piece on a grown island');
  eq((await call(landHandler, 'POST', { action: 'move', placementId: U(201), x: 1, y: 1, size: 8 }, V2)).status, 409, 'nor can a growth client that drew the 8×8');
  eq(rpcCalls('tl_move_piece').length, 0, 'neither reaches the database');
  rpcAnswers.tl_move_piece = () => ({ ok: false, error: 'resized', size: 12 });
  eq((await call(landHandler, 'POST', { action: 'move', placementId: U(201), x: 1, y: 1 }, V2)).body, { error: 'The island changed. Reload before trying again.' }, 'a growth that commits between the read and the write: 409');
  rpcAnswers.tl_move_piece = () => ({ ok: false, error: 'not_found' });
  eq((await call(landHandler, 'POST', { action: 'move', placementId: U(201), x: 1, y: 1 }, V2)).status, 404, 'stored meanwhile: 404');

  reset();
  const removed = await call(landHandler, 'POST', { action: 'remove', placementId: U(201) });
  eq([removed.status, removed.body.removed, removed.body.placements.length], [200, U(201), 0], 'remove stores the piece');
  eq(rpcCalls('tl_remove_piece')[0]?.body, { p_identity: ID, p_placement: U(201) }, 'through tl_remove_piece');
  eq([(await call(landHandler, 'POST', { action: 'remove', placementId: U(201) })).status], [404], 'storing it again: 404');
  delete rpcAnswers.tl_remove_piece;
  eq((await call(landHandler, 'POST', { action: 'remove', placementId: U(201) })).body, { error: 'Could not store the piece. Reload the island before retrying.' }, 'a failed store keeps its message');
}

// ---------- the core wakes at 5 pieces: on the owner's read and in public views ----------
reset();
{
  placements = [0, 1, 2, 3, 4].map((i) => ({ id: U(220 + i), inventory_id: U(4), x: i, y: 0, rotation: 0, placed_at: iso(NOW) }));
  const w = await call(landHandler, 'GET');
  const wake = calls.filter((c) => c.method === 'PATCH' && c.url.includes('tl_lands'));
  eq(wake.length, 1, 'a dormant land on 5 pieces (placed before cores woke) is woken by its owner\'s read');
  assert(wake[0]?.url.includes('core_stage=eq.0'), 'conditionally');
  eq(w.body.land.core, { x: 3, y: 3, stage: 1 }, 'and read awake');
  land.core_stage = 1;
  calls = [];
  await call(landHandler, 'GET');
  eq(calls.filter((c) => c.method === 'PATCH').length, 0, 'an awake land is not written again');
  land.core_stage = 0;
  placements = placements.slice(0, 4);
  calls = [];
  eq((await call(landHandler, 'GET')).body.land.core.stage, 0, 'four pieces: still dormant');
  eq(calls.filter((c) => c.method === 'PATCH').length, 0, 'and not written');
  const items = new Map(catalogRows.map((i) => [i.id, i]));
  const row = { identity_id: ID, size: 8, theme: 'night', title: null, published_at: null, share_code: 'abcdefghij', core_x: 0, core_y: 5, core_stage: 0 };
  const pieces = (n: number) => Array.from({ length: n }, (_, i) => ({ item_id: 'crypto_bay_data_dock', x: i, y: 0, rotation: 0 }));
  eq([publicWorld(row, pieces(4), items as never).core, publicWorld(row, pieces(5), items as never).core], [{ x: 0, y: 5, stage: 0 }, { x: 0, y: 5, stage: 1 }], 'a public island on 5 pieces is drawn awake even if its row lags');
}

// ---------- close: the CAS carries the horizon that was read ----------
reset();
{
  casRows = [];
  inventory[2] = { ...inventory[2], horizon_hours: 24 };
  const r = await (async () => {
    // The first read sees 24 h (ready); an extend lands before the CAS, the re-read sees 72 h.
    let reads = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`tl_inventory?id=eq.${U(3)}`) && (init?.method ?? 'GET') === 'GET' && ++reads > 1) {
        calls.push({ method: 'GET', url, body: undefined });
        return json([{ ...inventory[2], horizon_hours: 72 }]);
      }
      return original(input, init);
    }) as typeof fetch;
    try { return await call(landHandler, 'POST', { action: 'close', inventoryId: U(3), platform: 'ios' }); } finally { globalThis.fetch = original; }
  })();
  const cas = calls.find((c) => c.method === 'PATCH' && c.url.includes('tl_inventory'));
  assert(cas?.url.includes('state=eq.seed') && cas.url.includes('horizon_hours=eq.24'), 'the bloom CAS matches the horizon it read');
  eq([r.status, r.body], [409, { error: 'The market has not had time to answer yet', reviewAt: iso(NOW - 25 * H + 72 * H) }], 'a concurrent extend makes the close wait for the new review');
  const early = await call(landHandler, 'POST', { action: 'close', inventoryId: U(2), platform: 'ios' });
  eq([early.status, early.body], [409, { error: 'The market has not had time to answer yet', reviewAt: iso(NOW - 30 * H + 72 * H) }], 'a 72 h seed cannot close after 30 h');
}

// ---------- /api/progress: grants through tl_grant_piece ----------
reset();
{
  const e1 = 'cccccccc-cccc-4ccc-8ccc-000000000001', e2 = 'cccccccc-cccc-4ccc-8ccc-000000000002';
  ledgerRows = [{ id: U(401), client_event_id: e1 }, { id: U(402), client_event_id: e2 }];
  const seededAt = iso(NOW - 1000);
  rpcAnswers.tl_grant_piece = (args) => args.p_event === U(401)
    ? { ok: true, inventory_id: U(501), item_id: 'crypto_bay_context_buoy', tier: 'common', horizon_hours: 24, state: 'seed', held: 9, seeded_at: seededAt.replace('Z', '+00:00'), replay: false }
    : { ok: true, inventory_id: U(502), item_id: 'evidence_mines_open_tunnel', tier: 'common', horizon_hours: 24, state: 'bloomed', held: 10, seeded_at: seededAt, replay: false };
  const at = iso(NOW - 60_000);
  const r = await call(progressHandler, 'POST', { platform: 'ios', events: [{ id: e1, kind: 'read_complete', at }, { id: e2, kind: 'no_trade_respected', at: iso(NOW - 30_000) }] });
  assert(r.status === 200 && r.body.ok, `progress POST (${r.status} ${JSON.stringify(r.body).slice(0, 200)})`);
  eq(rpcCalls('tl_grant_piece').map((c) => c.body), [
    { p_identity: ID, p_event: U(401), p_state: 'seed', p_hours: 24 },
    { p_identity: ID, p_event: U(402), p_state: 'bloomed', p_hours: 24 },
  ], 'a read plants a 24 h seed, a NO TRADE blooms, keyed on the ledger row');
  const seed = r.body.results.find((x: any) => x.id === e1).world;
  const bloom = r.body.results.find((x: any) => x.id === e2).world;
  eq({ routeIndex: seed.routeIndex, item: seed.item, inventoryId: seed.inventoryId, state: seed.state, bloomedInventoryId: seed.bloomedInventoryId, routeComplete: seed.routeComplete },
    { routeIndex: 8, item: summary('crypto_bay_context_buoy'), inventoryId: U(501), state: 'seed', bloomedInventoryId: null, routeComplete: false }, 'RouteGrant keeps its shape; routeIndex = min(held_common, 8)');
  eq(seed.horizon, { hours: 24, tier: 'common', reviewAt: iso(Date.parse(seededAt) + 24 * H), extendable: true, extendTo: [72, 168] }, 'a seed carries its horizon');
  // The stub inventory holds one route building (the Double Gate; the season Candle Tower never counts).
  eq(seed.tiers, { common: summary('crypto_bay_context_buoy'), building: summary('crypto_bay_candle_tower'), landmark: summary('crypto_bay_waiting_lighthouse') }, 'tiers preview: own piece, next building, next landmark');
  eq([bloom.state, bloom.routeIndex, 'horizon' in bloom, 'tiers' in bloom], ['bloomed', 8, false, false], 'a NO TRADE: bloomed, no horizon picker');
  const patch = calls.find((c) => c.method === 'PATCH' && c.url.includes('bobby_progress?'));
  eq((patch?.body as { route_index: number }).route_index, 8, 'bobby_progress.route_index capped at 8');
  eq(r.body.progress.routeIndex, 8, 'progress.routeIndex capped at 8');
}
reset();
{
  // After an extend released a common slot, held can fall under the stored counter: it never moves back.
  const e3 = 'cccccccc-cccc-4ccc-8ccc-000000000003';
  ledgerRows = [{ id: U(403), client_event_id: e3 }];
  rpcAnswers.tl_grant_piece = () => ({ ok: true, inventory_id: U(503), item_id: 'crypto_bay_water_walkway', tier: 'common', horizon_hours: 24, state: 'seed', held: 2, seeded_at: iso(NOW), replay: false });
  const r = await call(progressHandler, 'POST', { platform: 'web', events: [{ id: e3, kind: 'read_complete', at: iso(NOW - 1000) }] });
  eq(r.body.results[0].world.routeIndex, 2, 'the grant reports min(held_common, 8)');
  eq(r.body.progress.routeIndex, 5, 'the stored counter stays at 5');
  rpcAnswers.tl_grant_piece = () => ({ ok: false, error: 'empty_tier' });
  const e4 = 'cccccccc-cccc-4ccc-8ccc-000000000004';
  ledgerRows = [{ id: U(404), client_event_id: e4 }];
  const failed = await call(progressHandler, 'POST', { platform: 'web', events: [{ id: e4, kind: 'read_complete', at: iso(NOW - 1000) }] });
  eq(failed.body.results[0].world, null, 'a refused grant is world: null, the XP still counts');
  assert(failed.body.results[0].awarded > 0, 'awarded');
}

reset();
{
  // A retry of a request whose answer was lost: the event is a duplicate. Its XP is not paid again,
  // but its piece is granted again — tl_grant_piece replays the same row.
  const e5 = 'cccccccc-cccc-4ccc-8ccc-000000000005', e6 = 'cccccccc-cccc-4ccc-8ccc-000000000006';
  seenRows = [{ client_event_id: e5, kind: 'read_complete', awarded: 10 }, { client_event_id: e6, kind: 'read_complete', awarded: 0 }];
  ledgerRows = [{ id: U(405), client_event_id: e5 }];
  rpcAnswers.tl_grant_piece = () => ({ ok: true, inventory_id: U(505), item_id: 'crypto_bay_context_buoy', tier: 'common', horizon_hours: 24, state: 'seed', held: 9, seeded_at: iso(NOW - 5000), replay: true });
  const r = await call(progressHandler, 'POST', { platform: 'ios', events: [{ id: e5, kind: 'read_complete', at: iso(NOW - 6000) }, { id: e6, kind: 'read_complete', at: iso(NOW - 6000) }] });
  const awarded = r.body.results.find((x: any) => x.id === e5), capped = r.body.results.find((x: any) => x.id === e6);
  eq([awarded.duplicate, awarded.awarded, awarded.world?.inventoryId, awarded.world?.state], [true, 0, U(505), 'seed'], 'a duplicate of an awarded read gets its piece back, no XP');
  eq(rpcCalls('tl_grant_piece').map((c) => (c.body as { p_event: string }).p_event), [U(405)], 'only the awarded duplicate is re-granted, keyed on its ledger row');
  assert(!('world' in capped), 'a duplicate of a capped read still plants nothing');
  // An awarded duplicate whose ledger row cannot be read: the grant failed, say so.
  reset();
  seenRows = [{ client_event_id: e5, kind: 'read_complete', awarded: 10 }];
  const lost = await call(progressHandler, 'POST', { platform: 'ios', events: [{ id: e5, kind: 'read_complete', at: iso(NOW - 6000) }] });
  eq(lost.body.results[0].world, null, 'no ledger id: world null (failed), not absent (nothing planted)');
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
