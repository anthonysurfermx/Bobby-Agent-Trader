// ============================================================
// Trader Land — server rules for the world (SYSTEM-DESIGN v0.2, GROWTH-v1):
//   · one awarded read = one seed; pieces come from fixed, repeating tier
//     sequences (tl_items.tier / tier_index), never random — tl_grant_piece
//   · a read plants a 24 h common SEED; a respected NO TRADE blooms the next
//     common piece at once
//   · the builder may EXTEND a seed to 72 h (building) or 168 h (landmark),
//     upward only, before its review opens — tl_extend_seed
//   · a seed BLOOMS when its thesis is reviewed against the public price
//     after its horizon (closeSeed) — that close pays thesis_closed and is
//     minted here, never accepted from a client; patience earns the piece,
//     the verdict never does
//   · a reviewed thesis the reviewer EXECUTED on Base (own wallet, asset and
//     direction of the thesis, between read and review) pays EXECUTION_BONUS
//     and the next piece of the season collection (trader-land-season.ts)
//   · one land per identity, created on first touch: 8×8 that grows to
//     10/12/16 as it fills (tl_grow_land, only for clients that declare
//     support), with a movable Aura Core that wakes at 5 pieces
// All writes go through the service role; callers are /api/progress and
// /api/trader-land, which already proved the identity. The land-shaping
// writes are RPCs that lock the land row (migration 20260919120516).
// ============================================================
import { randomInt } from 'node:crypto';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { EXECUTION_BONUS, type PlantKind } from './progress-rules.js';
import { publicLastPrice } from './public-price.js';
import { horizonAt, horizonHours, resolveThesis, reviewAt, seedHorizon, swapExecutesThesis, thesisFrom, type SeedHorizon, type SwapCandidate, type Thesis, type ThesisOutcome, type Tier } from './thesis-rules.js';
import { LEGACY_LAND_SIZE, LEGACY_ROUTE_CAP, TIER_ORDER, coreOf, growthOf, heldByTier, nextInTier, tierSequence, type Core, type Growth } from './trader-land-growth.js';
import { SEASON, seasonProgress, type SeasonProgress } from './trader-land-season.js';

export { THESIS_REVIEW_HOURS, ThesisSchema, resolveThesis, reviewAt, seedHorizon, thesisFrom, type SeedHorizon, type Thesis, type ThesisOutcome, type Tier } from './thesis-rules.js';
export { SEASON, seasonProgress, type SeasonProgress } from './trader-land-season.js';

/**
 * What /api/progress returns per planted event (`results[i].world`). Every
 * field keeps its pre-growth meaning and type: iOS release 31 parses it
 * strictly and iOS 1.1 shows the progress `routeIndex` as `n/8`.
 */
export interface RouteGrant {
  /** common pieces held after this grant, capped at LEGACY_ROUTE_CAP (8) */
  routeIndex: number;
  /** piece planted or bloomed by this event; null only if it left the catalog */
  item: PieceSummary | null;
  inventoryId: string | null;
  state: 'seed' | 'bloomed' | null;
  /** kept for older clients; a plant never blooms another seed any more (closes do, see closeSeed) */
  bloomedInventoryId: null;
  /** kept for older clients: the sequences repeat, so a grant never completes a route */
  routeComplete: false;
  /** seeds only: its 24 h horizon and what an extend would turn it into (GROWTH-v1 §3) */
  horizon?: SeedHorizon;
  tiers?: Record<Tier, PieceSummary | null>;
}

export interface Item { id: string; world: string; attribution: string; kind: string; footprint_w: number; footprint_h: number; name: unknown; route_index: number | null; tier: string | null; tier_index: number | null; art_url: string | null }
export interface PieceSummary { id: string; world: string; attribution: string; kind: string; name: unknown; footprint: [number, number] }
export function pieceSummary(item: Item): PieceSummary {
  return { id: item.id, world: item.world, attribution: item.attribution, kind: item.kind, name: item.name, footprint: [item.footprint_w, item.footprint_h] };
}

export async function catalog(): Promise<Item[]> {
  const r = await fetch(bobbyRest('tl_items?active=eq.true&order=route_index.asc.nullslast,world.asc,id.asc&select=id,world,attribution,kind,footprint_w,footprint_h,name,route_index,tier,tier_index,art_url'), { headers: bobbyServiceHeaders() });
  return r.ok ? ((await r.json()) as Item[]) : [];
}

/** The next piece of every tier for a player holding `held` (sequence[n mod len] among the active catalog). */
export function nextPieces(items: Item[], held: Record<Tier, number>): Record<Tier, PieceSummary | null> {
  const out = {} as Record<Tier, PieceSummary | null>;
  for (const tier of TIER_ORDER) {
    const next = nextInTier(tierSequence(items, tier), held[tier]);
    out[tier] = next ? pieceSummary(next) : null;
  }
  return out;
}

/** n per tier for an identity: its route pieces by the tier of their current item. */
export async function heldPieces(identityId: string): Promise<Record<Tier, number>> {
  const r = await fetch(bobbyRest(`tl_inventory?identity_id=eq.${identityId}&source=eq.route&select=source,tl_items(tier)`), { headers: bobbyServiceHeaders() });
  if (!r.ok) throw new Error('Inventory read failed');
  const rows = (await r.json()) as Array<{ source: string; tl_items: { tier: string | null } | null }>;
  return heldByTier(rows.map((row) => ({ source: row.source, tier: row.tl_items?.tier ?? null })));
}

export interface Land { size: number; theme: string; visibility: 'private' | 'public'; share_code: string | null; title: string | null; published_at: string | null; core_x: number; core_y: number; core_stage: number; moderation_status?: string; community_blocked?: boolean }
const LAND_COLUMNS = 'size,theme,visibility,share_code,title,published_at,core_x,core_y,core_stage,moderation_status,community_blocked';

/** The land as clients read it: the stored fields plus the core and how far the island is from growing. */
export interface LandView { size: number; theme: string; visibility: 'private' | 'public'; share_code: string | null; title: string | null; published_at: string | null; core: Core; growth: Growth }
export function landView(land: Land, occupied: number, pieces: number): LandView {
  return { size: land.size, theme: land.theme, visibility: land.visibility, share_code: land.share_code, title: land.title, published_at: land.published_at, core: coreOf(land, pieces), growth: growthOf(land.size, occupied) };
}

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
export interface PublicLandRow { identity_id: string; size: number; theme: string; title: string | null; published_at: string | null; share_code: string | null; core_x?: number | null; core_y?: number | null; core_stage?: number | null }
export const PUBLIC_LAND_COLUMNS = 'identity_id,size,theme,title,published_at,share_code,core_x,core_y,core_stage';

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

/** What a visitor may see: the builder's title and the art positions (the core's too), never who built it. */
export function publicWorld(row: PublicLandRow, placements: PublicPlacement[], items: Map<string, Item>) {
  return { code: row.share_code, title: row.title, size: row.size, theme: row.theme, publishedAt: row.published_at, core: coreOf(row, placements.length), placements, stats: worldStats(placements, items) };
}

// ---------- land-shaping RPCs (service role, migration 20260919120516) ----------
// Each one locks the identity's land row first, so concurrent requests of the
// same player serialize in the database. Expected refusals come back as
// { ok: false, error: '<code>' }; a transport or SQL failure throws.
type RpcRefusal = { ok: false; error: string; review_at?: string };
async function rpc<T extends { ok: true }>(fn: string, args: Record<string, unknown>): Promise<T | RpcRefusal> {
  const r = await fetch(bobbyRest(`rpc/${fn}`), { method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} failed (${r.status}): ${(await r.text().catch(() => '')).slice(0, 200)}`);
  return (await r.json()) as T | RpcRefusal;
}
const iso = (value: string) => new Date(value).toISOString();

// ---------- planting ----------
interface GrantRow { ok: true; inventory_id: string; item_id: string; tier: Tier; horizon_hours: number; state: 'seed' | 'bloomed'; held: number; seeded_at: string; replay: boolean }

/**
 * One awarded event → the next piece of its tier (a read: a 24 h common
 * seed; a NO TRADE: the next common piece, bloomed). Idempotent on the
 * ledger event. `routeIndex` is the caller's legacy counter, kept when the
 * grant is not a common piece (a replay of a seed that was extended since).
 * Returns null when the grant could not be made; the event keeps its XP.
 */
export async function grantPiece(identityId: string, ledgerEventId: string, kind: PlantKind, routeIndex: number, items: Map<string, Item>, now = Date.now()): Promise<RouteGrant | null> {
  try {
    const out = await rpc<GrantRow>('tl_grant_piece', { p_identity: identityId, p_event: ledgerEventId, p_state: kind === 'read_complete' ? 'seed' : 'bloomed', p_hours: 24 });
    if (out.ok === false) { console.error('[trader-land] grant refused', out.error); return null; }
    const item = items.get(out.item_id);
    if (!item) console.error('[trader-land] granted piece missing from the active catalog', out.item_id);
    const grant: RouteGrant = {
      routeIndex: out.tier === 'common' ? Math.min(out.held, LEGACY_ROUTE_CAP) : routeIndex,
      item: item ? pieceSummary(item) : null,
      inventoryId: out.inventory_id,
      state: out.state,
      bloomedInventoryId: null,
      routeComplete: false,
    };
    if (out.state === 'seed') grant.horizon = seedHorizon(out.seeded_at, out.horizon_hours, 'seed', now);
    return grant;
  } catch (error) {
    console.error('[trader-land] grantPiece', error);
    return null;
  }
}

// ---------- extending a seed ----------
interface ExtendRow { ok: true; inventory_id: string; item_id: string; tier: Tier; horizon_hours: number; review_at: string }
export type ExtendResult =
  | { ok: true; inventoryId: string; itemId: string; horizon: SeedHorizon }
  | { ok: false; status: number; error: string; reviewAt?: string };

/** Give a seed more time: 72 h → the next building, 168 h → the next landmark. */
export async function extendSeed(identityId: string, inventoryId: string, hours: number, now = Date.now()): Promise<ExtendResult> {
  const out = await rpc<ExtendRow>('tl_extend_seed', { p_identity: identityId, p_inventory: inventoryId, p_hours: hours });
  if (out.ok === false) {
    if (out.error === 'not_found') return { ok: false, status: 404, error: 'Piece not in your inventory' };
    if (out.error === 'not_seed') return { ok: false, status: 409, error: 'This seed already bloomed' };
    if (out.error === 'review_open') return { ok: false, status: 409, error: 'Its review is already open', ...(out.review_at ? { reviewAt: iso(out.review_at) } : {}) };
    if (out.error === 'not_upward') return { ok: false, status: 400, error: 'A horizon can only grow' };
    console.error('[trader-land] extend refused', out.error);
    return { ok: false, status: 502, error: 'Could not extend the seed' };
  }
  return { ok: true, inventoryId: out.inventory_id, itemId: out.item_id, horizon: horizonAt(out.horizon_hours, iso(out.review_at), 'seed', now) };
}

// ---------- the Aura Core and the island's size ----------
/**
 * Clients that implement GROWTH-v1 send `X-Trader-Land-Client: 2`. Only they
 * may grow an island: every shipped iOS build (1.1 (26), 1.2 (31)) refuses
 * an island that is not 8×8.
 */
export function growthClient(headers: Record<string, string | string[] | undefined>): boolean {
  const raw = headers['x-trader-land-client'];
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value >= 2;
}

/**
 * The island size a request's coordinates were drawn on. A growth shifts
 * every cell by a ring, so coordinates from another size must be refused,
 * not applied one ring off. A client may say it (`size`); one without
 * `X-Trader-Land-Client: 2` only ever draws 8×8; otherwise it is unknown.
 */
export function drawnSize(size: number | undefined, headers: Record<string, string | string[] | undefined>): number | null {
  if (size !== undefined) return size;
  return growthClient(headers) ? null : LEGACY_LAND_SIZE;
}

/** The same words as a placement collision: the cells were taken since the client last read the island. */
export const ISLAND_CHANGED = 'The island changed. Reload before trying again.';

// ---------- placement writes (tl_place_piece / tl_move_piece / tl_remove_piece) ----------
// The RPCs lock the land row before the placement, the order tl_grow_land
// uses, so a write can never deadlock with a growth step. `size` is the island
// size the caller validated the coordinates on; a growth that commits first
// makes the write come back 'resized'. The API checked everything against a
// fresh read, so any refusal ('resized', or 'changed': a key or trigger said
// no) means the island changed under the request.
interface PlacementRow { ok: true; placement_id: string }
export type PlacementResult = { ok: true; placementId: string } | { ok: false; status: number; error: string };

async function placementWrite(fn: string, args: Record<string, unknown>, failed: string): Promise<PlacementResult> {
  let out: PlacementRow | RpcRefusal;
  try { out = await rpc<PlacementRow>(fn, args); } catch (error) { console.error(`[trader-land] ${fn}`, error); return { ok: false, status: 502, error: failed }; }
  if (out.ok !== false) return { ok: true, placementId: out.placement_id };
  // move/remove: the placement is gone; place: the land is (only a placement is addressed by id).
  if (out.error === 'not_found' && fn !== 'tl_place_piece') return { ok: false, status: 404, error: 'Placement not found' };
  if (out.error !== 'resized' && out.error !== 'changed' && out.error !== 'not_found') console.error(`[trader-land] ${fn} refused`, out.error);
  return { ok: false, status: 409, error: ISLAND_CHANGED };
}

export function placePiece(identityId: string, inventoryId: string, x: number, y: number, rotation: number, size: number): Promise<PlacementResult> {
  return placementWrite('tl_place_piece', { p_identity: identityId, p_inventory: inventoryId, p_x: x, p_y: y, p_rotation: rotation, p_size: size }, 'Could not place the piece');
}

export function movePiece(identityId: string, placementId: string, x: number, y: number, rotation: number, size: number): Promise<PlacementResult> {
  return placementWrite('tl_move_piece', { p_identity: identityId, p_placement: placementId, p_x: x, p_y: y, p_rotation: rotation, p_size: size }, 'Could not move the piece');
}

/** Store a placed piece back in the inventory (addressed by id: no frame to check). */
export function removePiece(identityId: string, placementId: string): Promise<PlacementResult> {
  return placementWrite('tl_remove_piece', { p_identity: identityId, p_placement: placementId }, 'Could not store the piece. Reload the island before retrying.');
}

interface CoreRow { ok: true; core_x: number; core_y: number }
export type MoveCoreResult = { ok: true; x: number; y: number } | { ok: false; status: number; error: string };

/** `size`: the island size the target was drawn on (null = unknown); another size is refused as a change. */
export async function moveCore(identityId: string, x: number, y: number, size: number | null): Promise<MoveCoreResult> {
  const out = await rpc<CoreRow>('tl_move_core', { p_identity: identityId, p_x: x, p_y: y, p_size: size });
  if (out.ok === false) {
    if (out.error === 'outside') return { ok: false, status: 400, error: 'Outside the island' };
    if (out.error === 'occupied' || out.error === 'resized') return { ok: false, status: 409, error: ISLAND_CHANGED };
    if (out.error === 'not_found') return { ok: false, status: 404, error: 'Island not found' };
    console.error('[trader-land] move_core refused', out.error);
    return { ok: false, status: 502, error: 'Could not move the core' };
  }
  return { ok: true, x: out.core_x, y: out.core_y };
}

interface GrowRow { ok: true; grew: boolean; from: number; to: number; shift: number; size: number; core_x: number; core_y: number; core_stage: number; woke: boolean }
export interface Grew { from: number; to: number; shift: number }

/** After a placement: wake the core at 5 pieces and add rings once the island is full enough. */
export async function growLand(identityId: string): Promise<Grew | null> {
  const out = await rpc<GrowRow>('tl_grow_land', { p_identity: identityId });
  if (out.ok === false) { console.error('[trader-land] grow refused', out.error); return null; }
  return out.grew ? { from: out.from, to: out.to, shift: out.shift } : null;
}

/**
 * Wake the core of a land that already stands on WAKE_PIECES pieces. Growth
 * clients get it from tl_grow_land after each placement; every other land
 * (pieces placed by an older client, or before the API woke cores) wakes on
 * its owner's next world read. Waking is permanent and changes nothing an
 * older client draws, so a conditional PATCH is enough. True when the land
 * is awake afterwards.
 */
export async function wakeCore(identityId: string): Promise<boolean> {
  try {
    const r = await fetch(bobbyRest(`tl_lands?identity_id=eq.${identityId}&core_stage=eq.0`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), body: JSON.stringify({ core_stage: 1, updated_at: new Date().toISOString() }) });
    if (!r.ok) console.error('[trader-land] wake core', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (error) {
    console.error('[trader-land] wake core', error);
    return false;
  }
}

// ---------- reviewing a seed ----------
export interface SeedRow { id: string; item_id: string; state: 'seed' | 'bloomed'; seeded_at: string; event_id: string | null; horizon_hours: number }
/** reviewAt stays a non-null string: iOS 1.1 / release 31 decode it as required. */
export interface SeedReview { thesis: Thesis | null; readAt: string | null; reviewAt: string; ready: boolean }

/** The plant events behind the caller's seeds, so the studio can say what each seed is waiting on. */
export async function seedReviews(seeds: Array<Pick<SeedRow, 'id' | 'seeded_at' | 'event_id'> & { horizon_hours?: number | null }>, now = Date.now()): Promise<Map<string, SeedReview>> {
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
    const at = reviewAt(seed.seeded_at, horizonHours(seed.horizon_hours));
    out.set(seed.id, { thesis: thesisFrom(event?.meta), readAt: event?.occurred_at ?? null, reviewAt: at, ready: Date.parse(at) <= now });
  }
  return out;
}

// ---------- execution on Base ----------
export interface Execution { receiptId: string; txHash: string | null; tokenIn: string; tokenOut: string; at: string | null; xp: number; aura: number }

/**
 * The first confirmed Base swap of this wallet that executes the thesis and
 * has not already paid another review. Receipts are the rows Bobby built and
 * then verified on-chain (swap-receipts.ts); nothing here trusts a client.
 */
export async function findExecutingSwap(identityId: string, wallet: string, thesis: Thesis, readAt: string, closeAt: string): Promise<SwapCandidate | null> {
  const headers = bobbyServiceHeaders();
  const [receipts, spent] = await Promise.all([
    fetch(bobbyRest(`bobby_swap_receipts?wallet_address=eq.${wallet.toLowerCase()}&status=eq.confirmed&select=id,tx_hash,token_in_symbol,token_out_symbol,block_timestamp,confirmed_at&order=confirmed_at.asc&limit=100`), { headers }),
    fetch(bobbyRest(`bobby_progress_events?identity_id=eq.${identityId}&kind=eq.thesis_closed&meta->thesis_close->executed=not.is.null&select=meta`), { headers }),
  ]);
  if (!receipts.ok || !spent.ok) throw new Error('Swap history read failed');
  const used = new Set(((await spent.json()) as Array<{ meta?: { thesis_close?: { executed?: { receiptId?: string } } } }>).map((row) => row.meta?.thesis_close?.executed?.receiptId).filter((id): id is string => Boolean(id)));
  const rows = (await receipts.json()) as Array<{ id: string; tx_hash: string | null; token_in_symbol: string; token_out_symbol: string; block_timestamp: string | null; confirmed_at: string | null }>;
  for (const row of rows) {
    if (used.has(row.id)) continue;
    const swap: SwapCandidate = { id: row.id, txHash: row.tx_hash, tokenIn: row.token_in_symbol, tokenOut: row.token_out_symbol, at: row.block_timestamp ?? row.confirmed_at };
    if (swapExecutesThesis(thesis, swap, readAt, closeAt)) return swap;
  }
  return null;
}

export interface SeasonGrant { piece: PieceSummary | null; progress: SeasonProgress }

export interface ClosedThesis {
  inventoryId: string; itemId: string; outcome: ThesisOutcome;
  symbol: string | null; direction: string | null; referencePx: number | null; closePx: number | null; movePct: number | null;
  xp: number; aura: number; xpAfter: number; ledgerEventId: string | null;
  /** the Base swap that executed this thesis and the bonus it paid, null when the thesis stayed on paper */
  executed: Execution | null;
  /** the season piece an executed review earned, null when nothing was executed */
  season: SeasonGrant | null;
}
export type CloseResult = { ok: true; closed: ClosedThesis } | { ok: false; status: number; error: string; reviewAt?: string };

/**
 * Review a seed: after the window, compare its thesis with the public price,
 * then commit bloom, counters, ledger and season piece in one transaction.
 * Retries return the stored review; concurrent clients cannot claim it twice.
 */
export async function closeSeed(identity: { id: string; wallet: string | null }, inventoryId: string, opts: { platform: 'ios' | 'web'; tzOffsetMin: number; now?: Date }): Promise<CloseResult> {
  const now = opts.now ?? new Date();
  const r = await fetch(bobbyRest(`tl_inventory?id=eq.${inventoryId}&identity_id=eq.${identity.id}&select=id,item_id,state,seeded_at,event_id,horizon_hours&limit=1`), { headers: bobbyServiceHeaders() });
  if (!r.ok) throw new Error('Seed read failed');
  const seed = ((await r.json()) as SeedRow[])[0];
  if (!seed) return { ok: false, status: 404, error: 'Piece not in your inventory' };
  if (seed.state !== 'seed') return commitSeedReview(identity.id, seed, opts, {});
  const review = (await seedReviews([seed], now.getTime())).get(seed.id)!;
  if (!review.ready) return { ok: false, status: 409, error: 'The market has not had time to answer yet', reviewAt: review.reviewAt };

  // A thesis is judged against the venue it was read from. No price, no verdict.
  let closePx: number | null = null;
  if (review.thesis) {
    closePx = await publicLastPrice(review.thesis.symbol, review.thesis.isEquity);
    if (!closePx) return { ok: false, status: 503, error: 'No public price right now. Try again in a moment.' };
  }
  const verdict = resolveThesis(review.thesis, closePx);
  const bloomedAt = now.toISOString();
  const readAt = review.readAt ?? seed.seeded_at;
  const swap = review.thesis && identity.wallet ? await findExecutingSwap(identity.id, identity.wallet, review.thesis, readAt, bloomedAt) : null;

  const executed: Execution | null = swap ? { receiptId: swap.id, txHash: swap.txHash, tokenIn: swap.tokenIn, tokenOut: swap.tokenOut, at: swap.at, xp: EXECUTION_BONUS.xp, aura: EXECUTION_BONUS.aura } : null;
  return commitSeedReview(identity.id, seed, opts, {
    inventoryId: seed.id, itemId: seed.item_id, outcome: verdict.outcome,
    symbol: review.thesis?.symbol ?? null, direction: review.thesis?.direction ?? null,
    referencePx: verdict.referencePx, closePx, movePct: verdict.movePct, executed,
  });
}

/** What a stored thesis_closed ledger row paid, in ClosedThesis field names. */
async function closedLedgerFields(identityId: string, inventoryId: string): Promise<Pick<ClosedThesis, 'xp' | 'aura' | 'xpAfter' | 'ledgerEventId'>> {
  const r = await fetch(bobbyRest(`bobby_progress_events?identity_id=eq.${identityId}&kind=eq.thesis_closed&meta->thesis_close->>inventoryId=eq.${inventoryId}&select=id,awarded,aura,xp_after&limit=1`), { headers: bobbyServiceHeaders() });
  if (!r.ok) throw new Error('Review ledger read failed');
  const row = ((await r.json()) as Array<{ id: string; awarded: number; aura: number | null; xp_after: number }>)[0];
  if (!row) throw new Error('Review ledger row missing');
  return { xp: row.awarded, aura: row.aura ?? 0, xpAfter: row.xp_after, ledgerEventId: row.id };
}

async function commitSeedReview(identityId: string, seed: SeedRow, opts: { platform: 'ios' | 'web'; tzOffsetMin: number }, closed: Record<string, unknown>): Promise<CloseResult> {
  const result = await rpc<{ ok: true; replay?: boolean; closed: ClosedThesis & { seasonItemId?: string | null } }>('bobby_close_seed', {
    p_identity: identityId, p_inventory: seed.id, p_hours: horizonHours(seed.horizon_hours),
    p_platform: opts.platform, p_tz: opts.tzOffsetMin, p_closed: closed, p_season: SEASON.pieces,
  });
  if (result.ok === false) {
    const status = result.error === 'not_found' ? 404 : result.error === 'progress_unavailable' ? 503 : 409;
    return { ok: false, status, error: result.error === 'review_not_ready' ? 'The review window or horizon changed. Reload the island.' : 'The seed could not be reviewed. Reload the island and retry.' };
  }
  let value = result.closed;
  // A retry of a close stored before the atomic review (Growth v1) replays
  // meta without xp/aura/xpAfter/ledgerEventId; every shipped iOS build
  // decodes xp and aura as required Ints. The ledger row has them.
  if (result.replay && (typeof value.xp !== 'number' || typeof value.aura !== 'number' || typeof value.xpAfter !== 'number' || typeof value.ledgerEventId !== 'string')) {
    value = { ...value, ...await closedLedgerFields(identityId, seed.id) };
  }
  let season: SeasonGrant | null = null;
  if (value.executed) {
    const items = await catalog();
    const inventory = await fetch(bobbyRest(`tl_inventory?identity_id=eq.${identityId}&source=eq.season&select=item_id,source`), { headers: bobbyServiceHeaders() });
    if (!inventory.ok) throw new Error('Season inventory unavailable');
    const held = await inventory.json() as Array<{ item_id: string; source: string }>;
    const item = items.find(item => item.id === value.seasonItemId);
    season = { piece: item ? pieceSummary(item) : null, progress: seasonProgress(held) };
  }
  return { ok: true, closed: { ...value, season } };
}
