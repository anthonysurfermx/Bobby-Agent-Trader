// ============================================================
// /api/trader-land — the world of the signed-in identity.
//   GET  → { land, inventory (with item), placements, route: { index, next, total }, catalog, capabilities }
//   POST { action: 'place', inventoryId, x, y, rotation } → placed
//   POST { action: 'move', placementId, x, y, rotation }  → moved
//   POST { action: 'remove', placementId }                → removed
//   POST { action: 'publish', title? }                     → island public + share code
//   POST { action: 'unpublish' }                           → island private (code kept)
//   POST { action: 'close', inventoryId, tzOffsetMin?, platform? } → a seed is
//        reviewed against the public price, blooms and pays thesis_closed;
//        a thesis the wallet executed on Base also pays the execution bonus
//        and the next season piece (closed.executed / closed.season)
// Placement rules (v1): the piece must belong to the caller, be bloomed, fit
// inside the 8×8 grid with its footprint, and not overlap another piece.
// Every seed carries `review`: the thesis it was read with, when it can be
// reviewed and whether that moment has come. capabilities.close advertises
// the action; capabilities.move tells clients that moves are arbitrated
// atomically by the database (tl_placement_cells trigger, migration
// 20260904222250); clients built against older servers keep those buttons
// disabled until they see it.
// Auth: wallet session or Supabase access token (same as /api/progress).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { THESIS_REVIEW_HOURS, catalog, cleanTitle, closeSeed, ensureLand, newShareCode, seasonProgress, seedReviews } from './_lib/trader-land.js';
import { requireIdentity, type Identity } from './_lib/user-identity.js';
import { guardWrite } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('place'), inventoryId: z.string().uuid(), x: z.number().int().min(0).max(15), y: z.number().int().min(0).max(15), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0) }),
  z.object({ action: z.literal('move'), placementId: z.string().uuid(), x: z.number().int().min(0).max(15), y: z.number().int().min(0).max(15), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0) }),
  z.object({ action: z.literal('remove'), placementId: z.string().uuid() }),
  z.object({ action: z.literal('publish'), title: z.string().max(80).optional() }),
  z.object({ action: z.literal('unpublish') }),
  z.object({ action: z.literal('close'), inventoryId: z.string().uuid(), tzOffsetMin: z.number().int().min(-840).max(840).default(0), platform: z.enum(['ios', 'web']).default('web') }),
]);

interface Inv { id: string; item_id: string; state: 'seed' | 'bloomed'; source: string; seeded_at: string; bloomed_at: string | null; event_id: string | null }
interface Placement { id: string; inventory_id: string; x: number; y: number; rotation: number; placed_at: string }

async function world(identity: Identity) {
  const [land, items, invR, plR, progR] = await Promise.all([
    ensureLand(identity.id),
    catalog(),
    fetch(bobbyRest(`tl_inventory?identity_id=eq.${identity.id}&order=seeded_at.asc&select=id,item_id,state,source,seeded_at,bloomed_at,event_id`), { headers: bobbyServiceHeaders() }),
    fetch(bobbyRest(`tl_placements?identity_id=eq.${identity.id}&select=id,inventory_id,x,y,rotation,placed_at`), { headers: bobbyServiceHeaders() }),
    fetch(bobbyRest(`bobby_progress?identity_id=eq.${identity.id}&select=xp,aura,route_index&limit=1`), { headers: bobbyServiceHeaders() }),
  ]);
  // Missing state must never look like an empty board during validation.
  if (!invR.ok || !plR.ok || !progR.ok || !items.length) throw new Error('Incomplete world read');
  const inventory = (await invR.json()) as Inv[];
  const placements = (await plR.json()) as Placement[];
  const prog = ((progR.ok ? await progR.json() : []) as Array<{ xp: number; aura: number; route_index: number }>)[0] ?? { xp: 0, aura: 0, route_index: 0 };
  const byId = new Map(items.map((i) => [i.id, i]));
  if (placements.some((p) => !byId.has(inventory.find((i) => i.id === p.inventory_id)?.item_id ?? ''))) {
    throw new Error('Placement metadata is incomplete');
  }
  const route = items.filter((i) => i.route_index !== null).sort((a, b) => (a.route_index! - b.route_index!));
  const next = route.find((i) => i.route_index === prog.route_index + 1) ?? null;
  // What each seed is waiting on: its thesis and the moment it can be reviewed.
  const reviews = await seedReviews(inventory.filter((r) => r.state === 'seed'));
  let ready = 0;
  for (const review of reviews.values()) if (review.ready) ready += 1;
  return {
    land,
    xp: prog.xp, aura: prog.aura,
    route: { index: prog.route_index, total: route.length, next: next ? { id: next.id, world: next.world, attribution: next.attribution, kind: next.kind, footprint: [next.footprint_w, next.footprint_h] } : null, complete: prog.route_index >= route.length },
    review: { windowHours: THESIS_REVIEW_HOURS, ready },
    // The season collection: earned only by reviewed theses executed on Base.
    season: seasonProgress(inventory),
    inventory: inventory.map(({ event_id: _eventId, ...r }) => ({ ...r, item: byId.get(r.item_id) ?? null, placed: placements.some((p) => p.inventory_id === r.id), review: reviews.get(r.id) ?? null })),
    placements,
    catalog: items,
    capabilities: { move: true, close: true },
    share: { public: land.visibility === 'public', code: land.share_code, title: land.title, publishedAt: land.published_at },
  };
}

function cells(x: number, y: number, w: number, h: number, rot: number): Array<[number, number]> {
  const [fw, fh] = rot === 90 || rot === 270 ? [h, w] : [w, h];
  const out: Array<[number, number]> = [];
  for (let dx = 0; dx < fw; dx++) for (let dy = 0; dy < fh; dy++) out.push([x + dx, y + dy]);
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const identity = await requireIdentity(req, res);
    if (!identity) return;
    try { res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, ...(await world(identity)) }); } catch (error) { console.error('[trader-land] get', error); return res.status(500).json({ error: 'World read failed' }); }
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
      return res.status(200).json({ ok: true, unpublished: true, ...(await world(identity)) });
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
        return res.status(200).json({ ok: true, published: code, ...(await world(identity)) });
      }
      return res.status(502).json({ error: 'Could not publish the island' });
    }
    if (body.action === 'remove') {
      const r = await fetch(bobbyRest(`tl_placements?id=eq.${body.placementId}&identity_id=eq.${identity.id}`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }) });
      if (!r.ok) return res.status(502).json({ error: 'Could not store the piece. Reload the island before retrying.' });
      const rows = (await r.json()) as unknown[];
      if (!rows.length) return res.status(404).json({ error: 'Placement not found' });
      return res.status(200).json({ ok: true, removed: body.placementId, ...(await world(identity)) });
    }
    if (body.action === 'close') {
      const result = await closeSeed({ id: identity.id, wallet: identity.wallet }, body.inventoryId, { platform: body.platform, tzOffsetMin: body.tzOffsetMin });
      if (result.ok === false) return res.status(result.status).json({ error: result.error, ...(result.reviewAt ? { reviewAt: result.reviewAt } : {}) });
      return res.status(200).json({ ok: true, closed: result.closed, ...(await world(identity)) });
    }
    const w = await world(identity);
    if (body.action === 'move') {
      const placement = w.placements.find((candidate) => candidate.id === body.placementId);
      if (!placement) return res.status(404).json({ error: 'Placement not found' });
      const piece = w.inventory.find((candidate) => candidate.id === placement.inventory_id);
      if (!piece?.item) return res.status(404).json({ error: 'Piece not in your inventory' });
      const mine = cells(body.x, body.y, piece.item.footprint_w, piece.item.footprint_h, body.rotation);
      if (mine.some(([cx, cy]) => cx >= w.land.size || cy >= w.land.size)) return res.status(400).json({ error: `Outside the ${w.land.size}×${w.land.size} land` });
      const occupied = new Set<string>(['3,3', '3,4', '4,3', '4,4']);
      for (const existing of w.placements) {
        if (existing.id === placement.id) continue;
        const inv = w.inventory.find((candidate) => candidate.id === existing.inventory_id);
        if (!inv?.item) continue;
        for (const [cx, cy] of cells(existing.x, existing.y, inv.item.footprint_w, inv.item.footprint_h, existing.rotation)) occupied.add(`${cx},${cy}`);
      }
      if (mine.some(([cx, cy]) => occupied.has(`${cx},${cy}`))) return res.status(409).json({ error: 'Overlaps another piece' });
      const moved = await fetch(bobbyRest(`tl_placements?id=eq.${placement.id}&identity_id=eq.${identity.id}`), {
        method: 'PATCH',
        headers: bobbyServiceHeaders({ Prefer: 'return=representation' }),
        body: JSON.stringify({ x: body.x, y: body.y, rotation: body.rotation }),
      });
      if (moved.status === 409) return res.status(409).json({ error: 'The island changed. Reload before trying again.' });
      const rows = moved.ok ? ((await moved.json()) as Array<{ id: string }>) : [];
      if (!rows.length) return res.status(502).json({ error: 'Could not move the piece' });
      return res.status(200).json({ ok: true, moved: placement.id, ...(await world(identity)) });
    }
    const piece = w.inventory.find((i) => i.id === body.inventoryId);
    if (!piece || !piece.item) return res.status(404).json({ error: 'Piece not in your inventory' });
    if (piece.state !== 'bloomed') return res.status(409).json({ error: 'A seed cannot be placed until it blooms' });
    if (piece.placed) return res.status(409).json({ error: 'Piece already placed' });
    const mine = cells(body.x, body.y, piece.item.footprint_w, piece.item.footprint_h, body.rotation);
    if (mine.some(([cx, cy]) => cx >= w.land.size || cy >= w.land.size)) return res.status(400).json({ error: `Outside the ${w.land.size}×${w.land.size} land` });
    // The Aura Core is part of every land even though it is not an inventory
    // placement. Reserve its 2x2 footprint on the server as well as in both
    // clients so web and iOS cannot persist a piece underneath it.
    const occupied = new Set<string>(['3,3', '3,4', '4,3', '4,4']);
    for (const p of w.placements) {
      const inv = w.inventory.find((i) => i.id === p.inventory_id); if (!inv?.item) continue;
      for (const [cx, cy] of cells(p.x, p.y, inv.item.footprint_w, inv.item.footprint_h, p.rotation)) occupied.add(`${cx},${cy}`);
    }
    if (mine.some(([cx, cy]) => occupied.has(`${cx},${cy}`))) return res.status(409).json({ error: 'Overlaps another piece' });
    const ins = await fetch(bobbyRest('tl_placements?select=id'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ identity_id: identity.id, inventory_id: piece.id, x: body.x, y: body.y, rotation: body.rotation }) });
    if (ins.status === 409) return res.status(409).json({ error: 'The island changed. Reload before trying again.' });
    if (!ins.ok) return res.status(502).json({ error: 'Could not place the piece' });
    return res.status(200).json({ ok: true, placed: ((await ins.json()) as Array<{ id: string }>)[0]?.id, ...(await world(identity)) });
  } catch (error) {
    console.error('[trader-land] post', error);
    return res.status(500).json({ error: 'World update failed' });
  }
}
