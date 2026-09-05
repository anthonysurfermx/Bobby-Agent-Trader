// ============================================================
// Trader Land — server rules for the world (SYSTEM-DESIGN v0.2):
//   · pieces come from a deterministic Discovery Route (tl_items.route_index),
//     one per awarded discipline event, never random
//   · a read plants a SEED; a respected NO TRADE arrives already BLOOMED
//   · a seed BLOOMS when its thesis is reviewed against the public price
//     after THESIS_REVIEW_HOURS (closeSeed) — that close pays thesis_closed
//     and is minted here, never accepted from a client
//   · a reviewed thesis the reviewer EXECUTED on Base (own wallet, asset and
//     direction of the thesis, between read and review) pays EXECUTION_BONUS
//     and the next piece of the season collection (trader-land-season.ts)
//   · after the route ends, awards keep giving XP/Aura but no piece (v1)
//   · every land is 8×8, one per identity, created on first touch
// All writes go through the service role; callers are /api/progress and
// /api/trader-land, which already proved the identity.
// ============================================================
import { randomInt, randomUUID } from 'node:crypto';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { AWARD_AURA, EXECUTION_BONUS, applyAward, type PlantKind, type ProgressCounters } from './progress-rules.js';
import { publicLastPrice } from './public-price.js';
import { resolveThesis, reviewAt, swapExecutesThesis, thesisFrom, type SwapCandidate, type Thesis, type ThesisOutcome } from './thesis-rules.js';
import { seasonProgress, type SeasonProgress } from './trader-land-season.js';

export { THESIS_REVIEW_HOURS, ThesisSchema, resolveThesis, reviewAt, thesisFrom, type Thesis, type ThesisOutcome } from './thesis-rules.js';
export { SEASON, seasonProgress, type SeasonProgress } from './trader-land-season.js';

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
export interface PieceSummary { id: string; world: string; attribution: string; kind: string; name: unknown; footprint: [number, number] }
const PIECE_COLUMNS = 'id,world,attribution,kind,footprint_w,footprint_h,name';
function pieceSummary(item: Item): PieceSummary {
  return { id: item.id, world: item.world, attribution: item.attribution, kind: item.kind, name: item.name, footprint: [item.footprint_w, item.footprint_h] };
}

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
    const next = await fetch(bobbyRest(`tl_items?active=eq.true&route_index=eq.${routeIndex + 1}&select=${PIECE_COLUMNS}&limit=1`), { headers: bobbyServiceHeaders() });
    const item = ((next.ok ? await next.json() : []) as Item[])[0];
    if (!item) return { routeIndex, item: null, inventoryId: null, state: null, bloomedInventoryId: null, routeComplete: true };
    const state: 'seed' | 'bloomed' = kind === 'read_complete' ? 'seed' : 'bloomed';
    const ins = await fetch(bobbyRest('tl_inventory?select=id'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ identity_id: identityId, item_id: item.id, state, source: 'route', event_id: ledgerEventId, bloomed_at: state === 'bloomed' ? new Date().toISOString() : null }) });
    if (!ins.ok) { console.error('[trader-land] grant', ins.status, await ins.text().catch(() => '')); return null; }
    const inventoryId = ((await ins.json()) as Array<{ id: string }>)[0]?.id ?? null;
    return { routeIndex: routeIndex + 1, item: pieceSummary(item), inventoryId, state, bloomedInventoryId: null, routeComplete: false };
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

/** The next season piece for this identity, tied to the executed review's ledger row (one piece per event). */
async function grantSeasonPiece(identityId: string, ledgerEventId: string, at: string): Promise<SeasonGrant> {
  const inv = await fetch(bobbyRest(`tl_inventory?identity_id=eq.${identityId}&source=eq.season&select=item_id,source`), { headers: bobbyServiceHeaders() });
  const held = (inv.ok ? await inv.json() : []) as Array<{ item_id: string; source: string }>;
  const progress = seasonProgress(held);
  if (!progress.next) return { piece: null, progress };
  const itemR = await fetch(bobbyRest(`tl_items?id=eq.${progress.next}&active=eq.true&select=${PIECE_COLUMNS}&limit=1`), { headers: bobbyServiceHeaders() });
  const item = ((itemR.ok ? await itemR.json() : []) as Item[])[0];
  if (!item) { console.error('[trader-land] season piece missing from catalog', progress.next); return { piece: null, progress }; }
  const ins = await fetch(bobbyRest('tl_inventory?select=id'), { method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ identity_id: identityId, item_id: item.id, state: 'bloomed', source: 'season', event_id: ledgerEventId, bloomed_at: at }) });
  if (!ins.ok) { console.error('[trader-land] season grant', ins.status, await ins.text().catch(() => '')); return { piece: null, progress }; }
  return { piece: pieceSummary(item), progress: seasonProgress([...held, { item_id: item.id, source: 'season' }]) };
}

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
 * bloom the seed and pay the close. The bloom is a compare-and-set on
 * state='seed', so a seed pays exactly once however many requests race; XP
 * is only written by the request that flipped it. Everything that can fail
 * for reasons outside the user (prices, swap history) is read BEFORE the
 * flip, so a retry never finds a bloomed seed that was never paid.
 */
export async function closeSeed(identity: { id: string; wallet: string | null }, inventoryId: string, opts: { platform: 'ios' | 'web'; tzOffsetMin: number; now?: Date }): Promise<CloseResult> {
  const now = opts.now ?? new Date();
  const r = await fetch(bobbyRest(`tl_inventory?id=eq.${inventoryId}&identity_id=eq.${identity.id}&select=id,item_id,state,seeded_at,event_id&limit=1`), { headers: bobbyServiceHeaders() });
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
  const bloomedAt = now.toISOString();
  const readAt = review.readAt ?? seed.seeded_at;
  const swap = review.thesis && identity.wallet ? await findExecutingSwap(identity.id, identity.wallet, review.thesis, readAt, bloomedAt) : null;

  const prog = await fetch(bobbyRest(`bobby_progress?identity_id=eq.${identity.id}&select=xp,aura,streak,last_day,daily_awards,daily_awards_day&limit=1`), { headers: bobbyServiceHeaders() });
  const row = ((prog.ok ? await prog.json() : []) as Array<{ xp: number; aura: number; streak: number; last_day: string | null; daily_awards: number; daily_awards_day: string | null }>)[0];
  if (!row) return { ok: false, status: 502, error: 'Could not load progress' };

  const cas = await fetch(bobbyRest(`tl_inventory?id=eq.${seed.id}&identity_id=eq.${identity.id}&state=eq.seed&select=id`), { method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }), body: JSON.stringify({ state: 'bloomed', bloomed_at: bloomedAt }) });
  if (!cas.ok) throw new Error('Bloom write failed');
  if (!((await cas.json()) as unknown[]).length) return { ok: false, status: 409, error: 'This piece already bloomed' };

  const counters: ProgressCounters = { xp: row.xp, streak: row.streak, lastDay: row.last_day, dailyAwards: row.daily_awards, dailyAwardsDay: row.daily_awards_day };
  const award = applyAward(counters, 'thesis_closed', now, opts.tzOffsetMin);
  const executed: Execution | null = swap ? { receiptId: swap.id, txHash: swap.txHash, tokenIn: swap.tokenIn, tokenOut: swap.tokenOut, at: swap.at, xp: EXECUTION_BONUS.xp, aura: EXECUTION_BONUS.aura } : null;
  const xp = award.awarded + (executed?.xp ?? 0);
  const aura = AWARD_AURA.thesis_closed + (executed?.aura ?? 0);
  const xpAfter = award.xpAfter + (executed?.xp ?? 0);
  const closed: Omit<ClosedThesis, 'xp' | 'aura' | 'xpAfter' | 'ledgerEventId' | 'season'> = {
    inventoryId: seed.id, itemId: seed.item_id, outcome: verdict.outcome,
    symbol: review.thesis?.symbol ?? null, direction: review.thesis?.direction ?? null,
    referencePx: verdict.referencePx, closePx, movePct: verdict.movePct,
    executed,
  };
  const ledger = await fetch(bobbyRest('bobby_progress_events?select=id'), {
    method: 'POST', headers: bobbyServiceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      identity_id: identity.id, client_event_id: randomUUID(), kind: 'thesis_closed',
      points: award.points + (executed?.xp ?? 0), awarded: xp, aura, xp_after: xpAfter, platform: opts.platform,
      occurred_at: bloomedAt, day_key: award.dayKey,
      meta: { thesis_close: { ...closed, plantEventId: seed.event_id, reviewedAt: bloomedAt } },
    }),
  });
  if (!ledger.ok) { console.error('[trader-land] close ledger', ledger.status, await ledger.text().catch(() => '')); throw new Error('Close could not be recorded'); }
  const ledgerEventId = ((await ledger.json()) as Array<{ id: string }>)[0]?.id ?? null;
  const season = executed && ledgerEventId ? await grantSeasonPiece(identity.id, ledgerEventId, bloomedAt) : null;
  const upd = await fetch(bobbyRest(`bobby_progress?identity_id=eq.${identity.id}`), {
    method: 'PATCH', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ xp: xpAfter, aura: (row.aura ?? 0) + aura, streak: award.state.streak, last_day: award.state.lastDay, daily_awards: award.state.dailyAwards, daily_awards_day: award.state.dailyAwardsDay, last_platform: opts.platform, updated_at: bloomedAt }),
  });
  if (!upd.ok) throw new Error('Progress could not be saved');
  return { ok: true, closed: { ...closed, xp, aura, xpAfter, ledgerEventId, season } };
}
