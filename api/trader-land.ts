// ============================================================
// /api/trader-land — the world of the signed-in identity.
//   GET  → { land (with core + growth), inventory (with item, review, horizon),
//            placements, tiers, route (legacy), review, season, catalog,
//            capabilities, share }
//   POST { action: 'place', inventoryId, x, y, rotation, size? } → placed (+ grew)
//   POST { action: 'move', placementId, x, y, rotation, size? }  → moved
//   POST { action: 'remove', placementId }                → removed
//   POST { action: 'publish', title? }                     → island public + share code
//   POST { action: 'unpublish' }                           → island private (code kept)
//   POST { action: 'close', inventoryId, tzOffsetMin?, platform? } → a seed is
//        reviewed against the public price, blooms and pays thesis_closed;
//        a thesis the wallet executed on Base also pays the execution bonus
//        and the next season piece (closed.executed / closed.season)
//   POST { action: 'extend', inventoryId, hours: 72 | 168 } → extended: the
//        seed waits longer and blooms the next building / landmark
//   POST { action: 'move_core', x, y, size? }              → coreMoved
// Placement rules: the piece must belong to the caller, be bloomed, fit
// inside the land (8, 10, 12 or 16 a side) and stay off the Aura Core and
// every other piece. Growth (docs/trader-land/GROWTH-v1.md): only a client
// that sends `X-Trader-Land-Client: 2` grows an island after a placement,
// because shipped iOS builds refuse any island that is not 8×8.
// Every seed carries `review` (its thesis, when it can be reviewed and
// whether that moment has come) and every route piece its `horizon`.
// capabilities advertise the actions; clients built against older servers
// keep those buttons disabled until they see them. Placements, moves, stores,
// core moves and growth are arbitrated by the database: every one of them is
// an RPC that locks the land row first (so none can deadlock with a growth
// step) and the tl_placement_cells trigger (migrations 20260904222250 and
// 20260919120516). Coordinates are refused with 409 when they were drawn on
// another island size than the land has now (`size`, or 8 for a client that
// never grows islands), since a growth shifts every cell by a ring.
// Auth: wallet session or Supabase access token (same as /api/progress).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { ISLAND_CHANGED, THESIS_REVIEW_HOURS, catalog, cleanTitle, closeSeed, drawnSize, ensureLand, extendSeed, growLand, growthClient, landView, moveCore, movePiece, newShareCode, nextPieces, pieceSummary, placePiece, removePiece, seasonProgress, seedHorizon, seedReviews, wakeCore, type Grew } from './_lib/trader-land.js';
import { CORE_CELLS, LEGACY_LAND_SIZE, TIER_FOOTPRINT, TIER_HOURS, TIER_ORDER, WAKE_PIECES, coreCellKeys, heldByTier, pieceCells, tierSequence } from './_lib/trader-land-growth.js';
import { requireIdentity, type Identity } from './_lib/user-identity.js';
import { guardWrite } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };

// The island size the client drew its coordinates on (optional; see drawnSize).
const DrawnSize = z.union([z.literal(8), z.literal(10), z.literal(12), z.literal(16)]).optional();
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('place'), inventoryId: z.string().uuid(), x: z.number().int().min(0).max(15), y: z.number().int().min(0).max(15), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0), size: DrawnSize }),
  z.object({ action: z.literal('move'), placementId: z.string().uuid(), x: z.number().int().min(0).max(15), y: z.number().int().min(0).max(15), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0), size: DrawnSize }),
  z.object({ action: z.literal('remove'), placementId: z.string().uuid() }),
  z.object({ action: z.literal('publish'), title: z.string().max(80).optional() }),
  z.object({ action: z.literal('unpublish') }),
  z.object({ action: z.literal('close'), inventoryId: z.string().uuid(), tzOffsetMin: z.number().int().min(-840).max(840).default(0), platform: z.enum(['ios', 'web']).default('web') }),
  // Any whole number reaches the database, which answers 'A horizon can only grow' for all but an upward 72 / 168.
  z.object({ action: z.literal('extend'), inventoryId: z.string().uuid(), hours: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal('move_core'), x: z.number().int().min(0).max(15), y: z.number().int().min(0).max(15), size: DrawnSize }),
]);

interface Inv { id: string; item_id: string; state: 'seed' | 'bloomed'; source: string; seeded_at: string; bloomed_at: string | null; event_id: string | null; horizon_hours: number; tl_items: { tier: string | null } | null }
interface Placement { id: string; inventory_id: string; x: number; y: number; rotation: number; placed_at: string }

// Shipped iOS builds (1.1 (26), 1.2 (31)) draw every island as 8×8 with the core
// at 3,3 and send no client header. An island that grew or whose core moved
// would draw wrong there, so they get ok:false and show their own "not
// supported yet" message instead (GROWTH-v1 §1.4).
const LEGACY_UNSUPPORTED = 'Update Bobby to open this island';

async function world(identity: Identity, headers?: VercelRequest['headers']) {
  const [land, items, invR, plR, progR] = await Promise.all([
    ensureLand(identity.id),
    catalog(),
    fetch(bobbyRest(`tl_inventory?identity_id=eq.${identity.id}&order=seeded_at.asc&select=id,item_id,state,source,seeded_at,bloomed_at,event_id,horizon_hours,tl_items(tier)`), { headers: bobbyServiceHeaders() }),
    fetch(bobbyRest(`tl_placements?identity_id=eq.${identity.id}&select=id,inventory_id,x,y,rotation,placed_at`), { headers: bobbyServiceHeaders() }),
    fetch(bobbyRest(`bobby_progress?identity_id=eq.${identity.id}&select=xp,aura&limit=1`), { headers: bobbyServiceHeaders() }),
  ]);
  // Missing state must never look like an empty board during validation.
  if (!invR.ok || !plR.ok || !progR.ok || !items.length) throw new Error('Incomplete world read');
  const inventory = (await invR.json()) as Inv[];
  const placements = (await plR.json()) as Placement[];
  const prog = ((progR.ok ? await progR.json() : []) as Array<{ xp: number; aura: number }>)[0] ?? { xp: 0, aura: 0 };
  // Waking is due at WAKE_PIECES and permanent: a land that crossed it without
  // waking (pieces placed before the API woke cores, or a wake that failed)
  // wakes on its owner's next read.
  if (land.core_stage === 0 && placements.length >= WAKE_PIECES && (await wakeCore(identity.id))) land.core_stage = 1;
  const byId = new Map(items.map((i) => [i.id, i]));
  const invById = new Map(inventory.map((i) => [i.id, i]));
  let occupied = CORE_CELLS;
  for (const p of placements) {
    const item = byId.get(invById.get(p.inventory_id)?.item_id ?? '');
    if (!item) throw new Error('Placement metadata is incomplete');
    occupied += item.footprint_w * item.footprint_h;
  }
  // The repeating tier sequences: how many of each the player holds and what comes next.
  const held = heldByTier(inventory.map((r) => ({ source: r.source, tier: r.tl_items?.tier ?? null })));
  const next = nextPieces(items, held);
  const tiers = TIER_ORDER.map((id) => ({ id, hours: TIER_HOURS[id], footprint: TIER_FOOTPRINT[id], length: tierSequence(items, id).length, held: held[id], next: next[id] }));
  const common = tiers[0];
  // What each seed is waiting on: its thesis and the moment its horizon lets it be reviewed.
  const now = Date.now();
  const reviews = await seedReviews(inventory.filter((r) => r.state === 'seed'), now);
  let ready = 0;
  for (const review of reviews.values()) if (review.ready) ready += 1;
  const view = landView(land, occupied, placements.length);
  const legacyBlocked = headers !== undefined && !growthClient(headers) && (view.size !== LEGACY_LAND_SIZE || view.core.x !== 3 || view.core.y !== 3);
  return {
    ...(legacyBlocked ? { ok: false as const, error: LEGACY_UNSUPPORTED } : {}),
    land: view,
    xp: prog.xp, aura: prog.aura,
    tiers,
    // Legacy (iOS release 31 reads index/total/complete): the common sequence, which repeats and never completes.
    route: { index: common.length ? common.held % common.length : 0, total: common.length, next: common.next, complete: false },
    review: { windowHours: THESIS_REVIEW_HOURS, ready },
    // The season collection: earned only by reviewed theses executed on Base.
    season: seasonProgress(inventory),
    inventory: inventory.map(({ event_id: _eventId, tl_items: _tier, horizon_hours: hours, ...r }) => ({
      ...r,
      item: byId.get(r.item_id) ?? null,
      placed: placements.some((p) => p.inventory_id === r.id),
      review: reviews.get(r.id) ?? null,
      horizon: r.source === 'route' || r.state === 'seed' ? seedHorizon(r.seeded_at, hours, r.state, now) : null,
    })),
    placements,
    catalog: items,
    capabilities: { move: true, close: true, extend: true, moveCore: true, grow: true },
    share: { public: land.visibility === 'public', code: land.share_code, title: land.title, publishedAt: land.published_at },
  };
}

type World = Awaited<ReturnType<typeof world>>;

/** Every cell taken on this land except by `skipPlacement`: the core's four and each piece's footprint. */
function occupiedCells(w: World, skipPlacement?: string): Set<string> {
  const occupied = new Set<string>(coreCellKeys(w.land.core));
  for (const p of w.placements) {
    if (p.id === skipPlacement) continue;
    const inv = w.inventory.find((i) => i.id === p.inventory_id);
    if (!inv?.item) continue;
    for (const cell of pieceCells({ w: inv.item.footprint_w, h: inv.item.footprint_h }, p.x, p.y, p.rotation)) occupied.add(cell);
  }
  return occupied;
}

function outside(cells: string[], size: number): boolean {
  return cells.some((cell) => { const [cx, cy] = cell.split(':').map(Number); return cx >= size || cy >= size; });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    try { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, ...(await world(identity, req.headers)) }); } catch (error) { console.error('[trader-land] get', error); return res.status(500).json({ error: 'World read failed' }); }
  }
  const guarded = await guardWrite(req, res, { methods: ['POST'], scope: 'trader-land', schema: Body, auth: 'none', allowNoOrigin: true, perIp: { limit: 60, windowSec: 60 }, perSubject: { key: () => null, limit: 60, windowSec: 60 } });
  if (!guarded) return;
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const body = guarded.body;
  try {
    if (body.action === 'unpublish') {
      const r = await fetch(bobbyRest(`tl_lands?identity_id=eq.${identity.id}`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ visibility: 'private' }) });
      if (!r.ok || !((await r.json()) as unknown[]).length) return res.status(502).json({ error: 'Could not hide the island' });
      return res.status(200).json({ ok: true, unpublished: true, ...(await world(identity, req.headers)) });
    }
    if (body.action === 'publish') {
      const land = await ensureLand(identity.id);
      const title = body.title === undefined ? land.title : cleanTitle(body.title);
      // The share code is minted once and survives unpublish/republish, so a
      // link that was already shared keeps working when the island comes back.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = land.share_code ?? newShareCode();
        const r = await fetch(bobbyRest(`tl_lands?identity_id=eq.${identity.id}`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ visibility: 'public', share_code: code, title, published_at: new Date().toISOString() }) });
        if (r.status === 409 && !land.share_code) continue; // another land drew the same code
        if (!r.ok || !((await r.json()) as unknown[]).length) return res.status(502).json({ error: 'Could not publish the island' });
        return res.status(200).json({ ok: true, published: code, ...(await world(identity, req.headers)) });
      }
      return res.status(502).json({ error: 'Could not publish the island' });
    }
    if (body.action === 'remove') {
      const removed = await removePiece(identity.id, body.placementId);
      if (removed.ok === false) return res.status(removed.status).json({ error: removed.error });
      return res.status(200).json({ ok: true, removed: body.placementId, ...(await world(identity, req.headers)) });
    }
    if (body.action === 'close') {
      const result = await closeSeed({ id: identity.id, wallet: identity.wallet }, body.inventoryId, { platform: body.platform, tzOffsetMin: body.tzOffsetMin });
      if (result.ok === false) return res.status(result.status).json({ error: result.error, ...(result.reviewAt ? { reviewAt: result.reviewAt } : {}) });
      return res.status(200).json({ ok: true, closed: result.closed, ...(await world(identity, req.headers)) });
    }
    if (body.action === 'extend') {
      const result = await extendSeed(identity.id, body.inventoryId, body.hours);
      if (result.ok === false) return res.status(result.status).json({ error: result.error, ...(result.reviewAt ? { reviewAt: result.reviewAt } : {}) });
      const w = await world(identity, req.headers);
      // The seed row of the same read is the fallback if the catalog moved under us.
      const item = w.catalog.find((candidate) => candidate.id === result.itemId) ?? w.inventory.find((row) => row.id === result.inventoryId)?.item ?? null;
      return res.status(200).json({ ok: true, extended: { inventoryId: result.inventoryId, item: item ? pieceSummary(item) : null, horizon: result.horizon }, ...w });
    }
    if (body.action === 'move_core') {
      await ensureLand(identity.id);
      const result = await moveCore(identity.id, body.x, body.y, drawnSize(body.size, req.headers));
      if (result.ok === false) return res.status(result.status).json({ error: result.error });
      return res.status(200).json({ ok: true, coreMoved: { x: result.x, y: result.y }, ...(await world(identity, req.headers)) });
    }
    const w = await world(identity, req.headers);
    // Coordinates drawn on another size are one ring off on this island.
    const drawn = drawnSize(body.size, req.headers);
    if (drawn !== null && drawn !== w.land.size) return res.status(409).json({ error: ISLAND_CHANGED });
    if (body.action === 'move') {
      const placement = w.placements.find((candidate) => candidate.id === body.placementId);
      if (!placement) return res.status(404).json({ error: 'Placement not found' });
      const piece = w.inventory.find((candidate) => candidate.id === placement.inventory_id);
      if (!piece?.item) return res.status(404).json({ error: 'Piece not in your inventory' });
      const mine = pieceCells({ w: piece.item.footprint_w, h: piece.item.footprint_h }, body.x, body.y, body.rotation);
      if (outside(mine, w.land.size)) return res.status(400).json({ error: `Outside the ${w.land.size}×${w.land.size} land` });
      const occupied = occupiedCells(w, placement.id);
      if (mine.some((cell) => occupied.has(cell))) return res.status(409).json({ error: 'Overlaps another piece' });
      // Validated on w.land.size: a growth that commits first makes the database refuse it.
      const moved = await movePiece(identity.id, placement.id, body.x, body.y, body.rotation, w.land.size);
      if (moved.ok === false) return res.status(moved.status).json({ error: moved.error });
      return res.status(200).json({ ok: true, moved: placement.id, ...(await world(identity, req.headers)) });
    }
    const piece = w.inventory.find((i) => i.id === body.inventoryId);
    if (!piece || !piece.item) return res.status(404).json({ error: 'Piece not in your inventory' });
    if (piece.state !== 'bloomed') return res.status(409).json({ error: 'A seed cannot be placed until it blooms' });
    if (piece.placed) return res.status(409).json({ error: 'Piece already placed' });
    const mine = pieceCells({ w: piece.item.footprint_w, h: piece.item.footprint_h }, body.x, body.y, body.rotation);
    if (outside(mine, w.land.size)) return res.status(400).json({ error: `Outside the ${w.land.size}×${w.land.size} land` });
    // The Aura Core is part of every land even though it is not an inventory
    // placement. Its 2x2 footprint sits where the land keeps it (core_x/y) and
    // is reserved here, in the database trigger and in both clients.
    const occupied = occupiedCells(w);
    if (mine.some((cell) => occupied.has(cell))) return res.status(409).json({ error: 'Overlaps another piece' });
    const ins = await placePiece(identity.id, piece.id, body.x, body.y, body.rotation, w.land.size);
    if (ins.ok === false) return res.status(ins.status).json({ error: ins.error });
    const placed = ins.placementId;
    // The piece is saved; growing (and waking the core) is best effort and
    // runs again after the next placement if it fails here. An older client
    // never grows the island; the world read below wakes its core.
    if (!growthClient(req.headers)) return res.status(200).json({ ok: true, placed, ...(await world(identity, req.headers)) });
    let grew: Grew | null = null;
    try { grew = await growLand(identity.id); } catch (error) { console.error('[trader-land] grow', error); }
    return res.status(200).json({ ok: true, placed, grew, ...(await world(identity, req.headers)) });
  } catch (error) {
    console.error('[trader-land] post', error);
    return res.status(500).json({ error: 'World update failed' });
  }
}
