// ============================================================
// /api/trader-land — the world of the signed-in identity.
//   GET  → { land, inventory (with item), placements, route: { index, next, total }, catalog }
//   POST { action: 'place', inventoryId, x, y, rotation } → placed
//   POST { action: 'remove', placementId }                → removed
// Placement rules (v1): the piece must belong to the caller, be bloomed, fit
// inside the 8×8 grid with its footprint, and not overlap another piece.
// Auth: wallet session or Supabase access token (same as /api/progress).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { catalog, ensureLand } from './_lib/trader-land.js';
import { requireIdentity, type Identity } from './_lib/user-identity.js';
import { guardWrite } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('place'), inventoryId: z.string().uuid(), x: z.number().int().min(0).max(15), y: z.number().int().min(0).max(15), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0) }),
  z.object({ action: z.literal('remove'), placementId: z.string().uuid() }),
]);

interface Inv { id: string; item_id: string; state: 'seed' | 'bloomed'; source: string; seeded_at: string; bloomed_at: string | null }
interface Placement { id: string; inventory_id: string; x: number; y: number; rotation: number; placed_at: string }

async function world(identity: Identity) {
  const [land, items, invR, plR, progR] = await Promise.all([
    ensureLand(identity.id),
    catalog(),
    fetch(bobbyRest(`tl_inventory?identity_id=eq.${identity.id}&order=seeded_at.asc&select=id,item_id,state,source,seeded_at,bloomed_at`), { headers: bobbyServiceHeaders() }),
    fetch(bobbyRest(`tl_placements?identity_id=eq.${identity.id}&select=id,inventory_id,x,y,rotation,placed_at`), { headers: bobbyServiceHeaders() }),
    fetch(bobbyRest(`bobby_progress?identity_id=eq.${identity.id}&select=xp,aura,route_index&limit=1`), { headers: bobbyServiceHeaders() }),
  ]);
  const inventory = invR.ok ? ((await invR.json()) as Inv[]) : [];
  const placements = plR.ok ? ((await plR.json()) as Placement[]) : [];
  const prog = ((progR.ok ? await progR.json() : []) as Array<{ xp: number; aura: number; route_index: number }>)[0] ?? { xp: 0, aura: 0, route_index: 0 };
  const byId = new Map(items.map((i) => [i.id, i]));
  const route = items.filter((i) => i.route_index !== null).sort((a, b) => (a.route_index! - b.route_index!));
  const next = route.find((i) => i.route_index === prog.route_index + 1) ?? null;
  return {
    land,
    xp: prog.xp, aura: prog.aura,
    route: { index: prog.route_index, total: route.length, next: next ? { id: next.id, world: next.world, attribution: next.attribution, kind: next.kind, footprint: [next.footprint_w, next.footprint_h] } : null, complete: prog.route_index >= route.length },
    inventory: inventory.map((r) => ({ ...r, item: byId.get(r.item_id) ?? null, placed: placements.some((p) => p.inventory_id === r.id) })),
    placements,
    catalog: items,
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
    if (body.action === 'remove') {
      const r = await fetch(bobbyRest(`tl_placements?id=eq.${body.placementId}&identity_id=eq.${identity.id}`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }) });
      const rows = r.ok ? ((await r.json()) as unknown[]) : [];
      if (!rows.length) return res.status(404).json({ error: 'Placement not found' });
      return res.status(200).json({ ok: true, removed: body.placementId, ...(await world(identity)) });
    }
    const w = await world(identity);
    const piece = w.inventory.find((i) => i.id === body.inventoryId);
    if (!piece || !piece.item) return res.status(404).json({ error: 'Piece not in your inventory' });
    if (piece.state !== 'bloomed') return res.status(409).json({ error: 'A seed cannot be placed until it blooms' });
    if (piece.placed) return res.status(409).json({ error: 'Piece already placed' });
    const mine = cells(body.x, body.y, piece.item.footprint_w, piece.item.footprint_h, body.rotation);
    if (mine.some(([cx, cy]) => cx >= w.land.size || cy >= w.land.size)) return res.status(400).json({ error: `Outside the ${w.land.size}×${w.land.size} land` });
    const occupied = new Set<string>();
    for (const p of w.placements) {
      const inv = w.inventory.find((i) => i.id === p.inventory_id); if (!inv?.item) continue;
      for (const [cx, cy] of cells(p.x, p.y, inv.item.footprint_w, inv.item.footprint_h, p.rotation)) occupied.add(`${cx},${cy}`);
    }
    if (mine.some(([cx, cy]) => occupied.has(`${cx},${cy}`))) return res.status(409).json({ error: 'Overlaps another piece' });
    const ins = await fetch(bobbyRest('tl_placements?select=id'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ identity_id: identity.id, inventory_id: piece.id, x: body.x, y: body.y, rotation: body.rotation }) });
    if (!ins.ok) return res.status(502).json({ error: 'Could not place the piece' });
    return res.status(200).json({ ok: true, placed: ((await ins.json()) as Array<{ id: string }>)[0]?.id, ...(await world(identity)) });
  } catch (error) {
    console.error('[trader-land] post', error);
    return res.status(500).json({ error: 'World update failed' });
  }
}
