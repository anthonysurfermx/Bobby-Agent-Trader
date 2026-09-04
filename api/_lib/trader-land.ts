// ============================================================
// Trader Land — server rules for the world (SYSTEM-DESIGN v0.2):
//   · pieces come from a deterministic Discovery Route (tl_items.route_index),
//     one per awarded discipline event, never random
//   · a read plants a SEED; a respected NO TRADE arrives already BLOOMED
//   · a seed BLOOMS when its thesis is reviewed against the public price
//     after THESIS_REVIEW_HOURS (closeSeed) — that close pays thesis_closed
//     and is minted here, never accepted from a client
//   · after the route ends, awards keep giving XP/Aura but no piece (v1)
//   · every land is 8×8, one per identity, created on first touch
// All writes go through the service role; callers are /api/progress and
// /api/trader-land, which already proved the identity.
// ============================================================
import { randomInt, randomUUID } from 'node:crypto';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { AWARD_AURA, applyAward, type PlantKind, type ProgressCounters } from './progress-rules.js';
import { publicLastPrice } from './public-price.js';
import { resolveThesis, reviewAt, thesisFrom, type Thesis, type ThesisOutcome } from './thesis-rules.js';

export { THESIS_REVIEW_HOURS, ThesisSchema, resolveThesis, reviewAt, thesisFrom, type Thesis, type ThesisOutcome } from './thesis-rules.js';

export interface RouteGrant {
  routeIndex: number;
  /** piece planted or bloomed by this event, null when the route is complete */
  item: { id: string; world: string; attribution: string; kind: string; name: unknown; footprint: [number, number] } | null;
  inventoryId: string | null;
  state: 'seed' | 'bloomed' | null;
  /** kept for older clients; a plant never blooms another seed any more (closes do, see closeSeed) */
  bloomedInventoryId: null;
  routeComplete: boolean;
}

export interface Item { id: string; world: string; attribution: string; kind: string; footprint_w: number; footprint_h: number; name: unknown; route_index: number | null; art_url: string | null }

export async function catalog(): Promise<Item[]> {
  const r = await fetch(bobbyRest('tl_items?active=eq.true&order=route_index.asc.nullslast,world.asc,id.asc&select=id,world,attribution,kind,footprint_w,footprint_h,name,route_index,art_url'), { headers: bobbyServiceHeaders() });
  return r.ok ? ((await r.json()) as Item[]) : [];
}

export interface Land { size: number; theme: string; visibility: 'private' | 'public'; share_code: string | null; title: string | null; published_at: string | null }
const LAND_COLUMNS = 'size,theme,visibility,share_code,title,published_at';

export async function ensureLand(identityId: string): Promise<Land> {
  const r = await fetch(bobbyRest(`tl_lands?on_conflict=identity_id&select=${LAND_COLUMNS}`), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }), body: JSON.stringify({ identity_id: identityId }) });
  const rows = r.ok ? ((await r.json()) as Land[]) : [];
  if (rows[0]) return rows[0];
  const g = await fetch(bobbyRest(`tl_lands?identity_id=eq.${identityId}&select=${LAND_COLUMNS}&limit=1`), { headers: bobbyServiceHeaders() });
  if (!g.ok) throw new Error('Land read failed');
  const land = ((await g.json()) as Land[])[0];
  if (!land) throw new Error('Land could not be initialized');
  return land;
}

// ---------- shared worlds ----------
// A published island is reachable by a 10-char share code. The code is minted
// once per land and kept through unpublish/republish so a link that was
// already shared keeps working; uniqueness is enforced by the database.
const SHARE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const SHARE_CODE = /^[a-z0-9]{10}$/;
export function newShareCode(): string {
  return Array.from({ length: 10 }, () => SHARE_ALPHABET[randomInt(SHARE_ALPHABET.length)]).join('');
}
/** Builder-chosen island title: plain text, single-spaced, at most 40 chars, or null. */
export function cleanTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const title = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return title.length ? title : null;
}

export interface PublicPlacement { item_id: string; x: number; y: number; rotation: number }
export interface PublicLandRow { identity_id: string; size: number; theme: string; title: string | null; published_at: string | null; share_code: string | null }
export const PUBLIC_LAND_COLUMNS = 'identity_id,size,theme,title,published_at,share_code';

/** Placements of several lands in one read, keyed by identity (ids come from our own rows). */
export async function placementsFor(identityIds: string[]): Promise<Map<string, PublicPlacement[]>> {
  const out = new Map<string, PublicPlacement[]>();
  if (!identityIds.length) return out;
  const r = await fetch(bobbyRest(`tl_placements?identity_id=in.(${identityIds.join(',')})&select=identity_id,x,y,rotation,tl_inventory(item_id)&order=y.asc,x.asc`), { headers: bobbyServiceHeaders() });
  if (!r.ok) throw new Error('Placements read failed');
  const rows = (await r.json()) as Array<{ identity_id: string; x: number; y: number; rotation: number; tl_inventory: { item_id: string } | null }>;
  for (const row of rows) {
    if (!row.tl_inventory) continue;
    const list = out.get(row.identity_id) ?? [];
    list.push({ item_id: row.tl_inventory.item_id, x: row.x, y: row.y, rotation: row.rotation });
    out.set(row.identity_id, list);
  }
  return out;
}

export function worldStats(placements: PublicPlacement[], items: Map<string, Item>) {
  const districts = new Set<string>();
  for (const p of placements) { const item = items.get(p.item_id); if (item) districts.add(item.world); }
  return { pieces: placements.length, districts: [...districts].sort() };
}

/** What a visitor may see: the builder's title and the art positions, never who built it. */
export function publicWorld(row: PublicLandRow, placements: PublicPlacement[], items: Map<string, Item>) {
  return { code: row.share_code, title: row.title, size: row.size, theme: row.theme, publishedAt: row.published_at, placements, stats: worldStats(placements, items) };
}

// ---------- planting ----------
export async function grantRoutePiece(identityId: string, ledgerEventId: string, kind: PlantKind, routeIndex: number): Promise<RouteGrant | null> {
  try {
    await ensureLand(identityId);
    const next = await fetch(bobbyRest(`tl_items?active=eq.true&route_index=eq.${routeIndex + 1}&select=id,world,attribution,kind,footprint_w,footprint_h,name&limit=1`), { headers: bobbyServiceHeaders() });
    const item = ((next.ok ? await next.json() : []) as Item[])[0];
    if (!item) return { routeIndex, item: null, inventoryId: null, state: null, bloomedInventoryId: null, routeComplete: true };
    const state: 'seed' | 'bloomed' = kind === 'read_complete' ? 'seed' : 'bloomed';
    const ins = await fetch(bobbyRest('tl_inventory?select=id'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ identity_id: identityId, item_id: item.id, state, source: 'route', event_id: ledgerEventId, bloomed_at: state === 'bloomed' ? new Date().toISOString() : null }) });
    if (!ins.ok) { console.error('[trader-land] grant', ins.status, await ins.text().catch(() => '')); return null; }
    const inventoryId = ((await ins.json()) as Array<{ id: string }>)[0]?.id ?? null;
    return { routeIndex: routeIndex + 1, item: { id: item.id, world: item.world, attribution: item.attribution, kind: item.kind, name: item.name, footprint: [item.footprint_w, item.footprint_h] }, inventoryId, state, bloomedInventoryId: null, routeComplete: false };
  } catch (error) {
    console.error('[trader-land] grantRoutePiece', error);
    return null;
  }
}

// ---------- reviewing a seed ----------
export interface SeedRow { id: string; item_id: string; state: 'seed' | 'bloomed'; seeded_at: string; event_id: string | null }
export interface SeedReview { thesis: Thesis | null; readAt: string | null; reviewAt: string; ready: boolean }

/** The plant events behind the caller's seeds, so the studio can say what each seed is waiting on. */
export async function seedReviews(seeds: Array<Pick<SeedRow, 'id' | 'seeded_at' | 'event_id'>>, now = Date.now()): Promise<Map<string, SeedReview>> {
  const out = new Map<string, SeedReview>();
  if (!seeds.length) return out;
  const ids = seeds.map((s) => s.event_id).filter((id): id is string => Boolean(id));
  const byEvent = new Map<string, { meta: unknown; occurred_at: string }>();
  if (ids.length) {
    const r = await fetch(bobbyRest(`bobby_progress_events?id=in.(${ids.join(',')})&select=id,meta,occurred_at`), { headers: bobbyServiceHeaders() });
    if (!r.ok) throw new Error('Seed events read failed');
    for (const row of (await r.json()) as Array<{ id: string; meta: unknown; occurred_at: string }>) byEvent.set(row.id, row);
  }
  for (const seed of seeds) {
    const event = seed.event_id ? byEvent.get(seed.event_id) : undefined;
    const at = reviewAt(seed.seeded_at);
    out.set(seed.id, { thesis: thesisFrom(event?.meta), readAt: event?.occurred_at ?? null, reviewAt: at, ready: Date.parse(at) <= now });
  }
  return out;
}

export interface ClosedThesis {
  inventoryId: string; itemId: string; outcome: ThesisOutcome;
  symbol: string | null; direction: string | null; referencePx: number | null; closePx: number | null; movePct: number | null;
  xp: number; aura: number; xpAfter: number; ledgerEventId: string | null;
}
export type CloseResult = { ok: true; closed: ClosedThesis } | { ok: false; status: number; error: string; reviewAt?: string };

/**
 * Review a seed: after the window, compare its thesis with the public price,
 * bloom the seed and pay the close. The bloom is a compare-and-set on
 * state='seed', so a seed pays exactly once however many requests race; XP
 * is only written by the request that flipped it.
 */
export async function closeSeed(identityId: string, inventoryId: string, opts: { platform: 'ios' | 'web'; tzOffsetMin: number; now?: Date }): Promise<CloseResult> {
  const now = opts.now ?? new Date();
  const r = await fetch(bobbyRest(`tl_inventory?id=eq.${inventoryId}&identity_id=eq.${identityId}&select=id,item_id,state,seeded_at,event_id&limit=1`), { headers: bobbyServiceHeaders() });
  if (!r.ok) throw new Error('Seed read failed');
  const seed = ((await r.json()) as SeedRow[])[0];
  if (!seed) return { ok: false, status: 404, error: 'Piece not in your inventory' };
  if (seed.state !== 'seed') return { ok: false, status: 409, error: 'This piece already bloomed' };
  const review = (await seedReviews([seed], now.getTime())).get(seed.id)!;
  if (!review.ready) return { ok: false, status: 409, error: 'The market has not had time to answer yet', reviewAt: review.reviewAt };

  // A thesis is judged against the venue it was read from. No price, no verdict.
  let closePx: number | null = null;
  if (review.thesis) {
    closePx = await publicLastPrice(review.thesis.symbol, review.thesis.isEquity);
    if (!closePx) return { ok: false, status: 503, error: 'No public price right now. Try again in a moment.' };
  }
  const verdict = resolveThesis(review.thesis, closePx);

  const prog = await fetch(bobbyRest(`bobby_progress?identity_id=eq.${identityId}&select=xp,aura,streak,last_day,daily_awards,daily_awards_day&limit=1`), { headers: bobbyServiceHeaders() });
  const row = ((prog.ok ? await prog.json() : []) as Array<{ xp: number; aura: number; streak: number; last_day: string | null; daily_awards: number; daily_awards_day: string | null }>)[0];
  if (!row) return { ok: false, status: 502, error: 'Could not load progress' };

  const bloomedAt = now.toISOString();
  const cas = await fetch(bobbyRest(`tl_inventory?id=eq.${seed.id}&identity_id=eq.${identityId}&state=eq.seed&select=id`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ state: 'bloomed', bloomed_at: bloomedAt }) });
  if (!cas.ok) throw new Error('Bloom write failed');
  if (!((await cas.json()) as unknown[]).length) return { ok: false, status: 409, error: 'This piece already bloomed' };

  const counters: ProgressCounters = { xp: row.xp, streak: row.streak, lastDay: row.last_day, dailyAwards: row.daily_awards, dailyAwardsDay: row.daily_awards_day };
  const award = applyAward(counters, 'thesis_closed', now, opts.tzOffsetMin);
  const aura = AWARD_AURA.thesis_closed;
  const closed: Omit<ClosedThesis, 'xp' | 'aura' | 'xpAfter' | 'ledgerEventId'> = {
    inventoryId: seed.id, itemId: seed.item_id, outcome: verdict.outcome,
    symbol: review.thesis?.symbol ?? null, direction: review.thesis?.direction ?? null,
    referencePx: verdict.referencePx, closePx, movePct: verdict.movePct,
  };
  const ledger = await fetch(bobbyRest('bobby_progress_events?select=id'), {
    method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      identity_id: identityId, client_event_id: randomUUID(), kind: 'thesis_closed',
      points: award.points, awarded: award.awarded, aura, xp_after: award.xpAfter, platform: opts.platform,
      occurred_at: bloomedAt, day_key: award.dayKey,
      meta: { thesis_close: { ...closed, plantEventId: seed.event_id, reviewedAt: bloomedAt } },
    }),
  });
  if (!ledger.ok) { console.error('[trader-land] close ledger', ledger.status, await ledger.text().catch(() => '')); throw new Error('Close could not be recorded'); }
  const ledgerEventId = ((await ledger.json()) as Array<{ id: string }>)[0]?.id ?? null;
  const upd = await fetch(bobbyRest(`bobby_progress?identity_id=eq.${identityId}`), {
    method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ xp: award.state.xp, aura: (row.aura ?? 0) + aura, streak: award.state.streak, last_day: award.state.lastDay, daily_awards: award.state.dailyAwards, daily_awards_day: award.state.dailyAwardsDay, last_platform: opts.platform, updated_at: bloomedAt }),
  });
  if (!upd.ok) throw new Error('Progress could not be saved');
  return { ok: true, closed: { ...closed, xp: award.awarded, aura, xpAfter: award.xpAfter, ledgerEventId } };
}
