// ============================================================
// Trader Land — server rules for the world (SYSTEM-DESIGN v0.2):
//   · pieces come from a deterministic Discovery Route (tl_items.route_index),
//     one per awarded discipline event, never random
//   · a read plants a SEED; a respected NO TRADE or a closed thesis BLOOMS
//     (thesis_closed blooms the oldest seed first, then plants nothing)
//   · after the route ends, awards keep giving XP/Aura but no piece (v1)
//   · every land is 8×8, one per identity, created on first touch
// All writes go through the service role; callers are /api/progress and
// /api/trader-land, which already proved the identity.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

export interface RouteGrant {
  routeIndex: number;
  /** piece planted or bloomed by this event, null when the route is complete */
  item: { id: string; world: string; attribution: string; kind: string; name: unknown; footprint: [number, number] } | null;
  inventoryId: string | null;
  state: 'seed' | 'bloomed' | null;
  /** id of the seed that bloomed (thesis_closed), if any */
  bloomedInventoryId: string | null;
  routeComplete: boolean;
}

export interface Item { id: string; world: string; attribution: string; kind: string; footprint_w: number; footprint_h: number; name: unknown; route_index: number | null; art_url: string | null }

export async function catalog(): Promise<Item[]> {
  const r = await fetch(bobbyRest('tl_items?active=eq.true&order=route_index.asc.nullslast,world.asc,id.asc&select=id,world,attribution,kind,footprint_w,footprint_h,name,route_index,art_url'), { headers: bobbyServiceHeaders() });
  return r.ok ? ((await r.json()) as Item[]) : [];
}

export async function ensureLand(identityId: string): Promise<{ size: number; theme: string }> {
  const r = await fetch(bobbyRest(`tl_lands?on_conflict=identity_id&select=size,theme`), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }), body: JSON.stringify({ identity_id: identityId }) });
  const rows = r.ok ? ((await r.json()) as Array<{ size: number; theme: string }>) : [];
  if (rows[0]) return rows[0];
  const g = await fetch(bobbyRest(`tl_lands?identity_id=eq.${identityId}&select=size,theme&limit=1`), { headers: bobbyServiceHeaders() });
  if (!g.ok) throw new Error('Land read failed');
  const land = ((await g.json()) as Array<{ size: number; theme: string }>)[0];
  if (!land) throw new Error('Land could not be initialized');
  return land;
}

export async function grantRoutePiece(identityId: string, ledgerEventId: string, kind: 'read_complete' | 'no_trade_respected' | 'thesis_closed', routeIndex: number): Promise<RouteGrant | null> {
  try {
    await ensureLand(identityId);
    let bloomedInventoryId: string | null = null;
    if (kind === 'thesis_closed') {
      const oldest = await fetch(bobbyRest(`tl_inventory?identity_id=eq.${identityId}&state=eq.seed&order=seeded_at.asc&limit=1&select=id`), { headers: bobbyServiceHeaders() });
      const seed = ((oldest.ok ? await oldest.json() : []) as Array<{ id: string }>)[0];
      if (seed) {
        const b = await fetch(bobbyRest(`tl_inventory?id=eq.${seed.id}`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ state: 'bloomed', bloomed_at: new Date().toISOString() }) });
        if (b.ok) bloomedInventoryId = seed.id;
        return { routeIndex, item: null, inventoryId: null, state: null, bloomedInventoryId, routeComplete: false };
      }
    }
    const next = await fetch(bobbyRest(`tl_items?active=eq.true&route_index=eq.${routeIndex + 1}&select=id,world,attribution,kind,footprint_w,footprint_h,name&limit=1`), { headers: bobbyServiceHeaders() });
    const item = ((next.ok ? await next.json() : []) as Item[])[0];
    if (!item) return { routeIndex, item: null, inventoryId: null, state: null, bloomedInventoryId, routeComplete: true };
    const state: 'seed' | 'bloomed' = kind === 'read_complete' ? 'seed' : 'bloomed';
    const ins = await fetch(bobbyRest('tl_inventory?select=id'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ identity_id: identityId, item_id: item.id, state, source: 'route', event_id: ledgerEventId, bloomed_at: state === 'bloomed' ? new Date().toISOString() : null }) });
    if (!ins.ok) { console.error('[trader-land] grant', ins.status, await ins.text().catch(() => '')); return null; }
    const inventoryId = ((await ins.json()) as Array<{ id: string }>)[0]?.id ?? null;
    return { routeIndex: routeIndex + 1, item: { id: item.id, world: item.world, attribution: item.attribution, kind: item.kind, name: item.name, footprint: [item.footprint_w, item.footprint_h] }, inventoryId, state, bloomedInventoryId, routeComplete: false };
  } catch (error) {
    console.error('[trader-land] grantRoutePiece', error);
    return null;
  }
}
