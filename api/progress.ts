// ============================================================
// /api/progress — companion progress shared by Bobby App iOS and web.
//
//   GET  → { progress, recent }         the caller's authoritative state
//   POST { platform, events?, profile? } → apply award events (idempotent by
//        client id, server-side rules) and/or profile fields; returns the
//        new state plus what each event ACTUALLY earned.
//
// Clients keep working offline with the same rules and reconcile here; the
// server wins on xp / streak / cap counters, the client is the source for
// companion, vibe, quick access and the risk-notice version it accepted.
// Auth: wallet session (web) or Supabase access token (iOS) — see
// _lib/user-identity.ts. Guarded like every writer (freeze, limits, schema).
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { bobbyRest, bobbyServiceHeaders } from './_lib/bobby-db.js';
import { PLANT_KINDS } from './_lib/progress-rules.js';
import { ThesisSchema, catalog, heldPieces, nextPieces, pieceSummary, seedHorizon, type Item, type RouteGrant, type Tier } from './_lib/trader-land.js';
import { LEGACY_ROUTE_CAP } from './_lib/trader-land-growth.js';
import { requireIdentity, type Identity } from './_lib/user-identity.js';
import { guardWrite } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const Body = z.object({
  platform: z.enum(['ios', 'web']),
  events: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(PLANT_KINDS),
    at: z.string().datetime({ offset: true }),
    tzOffsetMin: z.number().int().min(-840).max(840).default(0),
    meta: z.record(z.unknown()).optional(),
    thesis: ThesisSchema.optional().catch(undefined),
  })).max(50).default([]),
  profile: z.object({
    companionId: z.string().regex(/^[a-z0-9_-]{1,32}$/).nullable().optional(),
    vibeId: z.string().regex(/^[a-z0-9_-]{1,32}$/).optional(),
    onboarded: z.boolean().optional(),
    riskNoticeVersion: z.number().int().min(0).max(100).optional(),
    quickAccess: z.array(z.string().regex(SYMBOL_RE)).max(6).optional(),
    /** XP earned on this device before the first sign-in. Honoured once, capped. */
    restore: z.boolean().optional(),
    localXpIncludesPending: z.boolean().optional(),
    localXpClaim: z.number().int().min(0).max(100_000).optional(),
  }).optional(),
});

interface ProgressRow {
  identity_id: string;
  companion_id: string | null;
  vibe_id: string;
  onboarded: boolean;
  risk_notice_version: number;
  xp: number;
  aura: number;
  route_index: number;
  streak: number;
  last_day: string | null;
  daily_awards: number;
  daily_awards_day: string | null;
  quick_access: string[];
  last_platform: string | null;
  updated_at: string;
}

const SELECT = 'identity_id,companion_id,vibe_id,onboarded,risk_notice_version,xp,aura,route_index,streak,last_day,daily_awards,daily_awards_day,quick_access,last_platform,updated_at';

function toClient(row: ProgressRow, identity: Identity) {
  return {
    identity: { id: identity.id, via: identity.via, wallet: identity.wallet, linkedAuth: Boolean(identity.authUserId) },
    companionId: row.companion_id,
    vibeId: row.vibe_id,
    onboarded: row.onboarded,
    riskNoticeVersion: row.risk_notice_version,
    xp: row.xp,
    aura: row.aura ?? 0,
    routeIndex: row.route_index ?? 0,
    streak: row.streak,
    lastDay: row.last_day,
    dailyAwards: row.daily_awards,
    dailyAwardsDay: row.daily_awards_day,
    quickAccess: Array.isArray(row.quick_access) ? row.quick_access : [],
    lastPlatform: row.last_platform,
    updatedAt: row.updated_at,
  };
}

async function loadOrCreate(identity: Identity): Promise<ProgressRow | null> {
  const r = await fetch(bobbyRest(`bobby_progress?identity_id=eq.${identity.id}&select=${SELECT}&limit=1`), { headers: bobbyServiceHeaders() });
  if (!r.ok) return null;
  const rows = (await r.json()) as ProgressRow[];
  if (rows[0]) return rows[0];
  const c = await fetch(bobbyRest(`bobby_progress?on_conflict=identity_id&select=${SELECT}`), {
    method: 'POST',
    headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ identity_id: identity.id }),
  });
  if (!c.ok) return null;
  return ((await c.json()) as ProgressRow[])[0] ?? null;
}

async function recentEvents(identityId: string) {
  const r = await fetch(bobbyRest(`bobby_progress_events?identity_id=eq.${identityId}&order=occurred_at.desc&limit=20&select=client_event_id,kind,awarded,xp_after,platform,occurred_at`), { headers: bobbyServiceHeaders() });
  return r.ok ? await r.json() : [];
}

async function get(req: VercelRequest, res: VercelResponse) {
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  try {
    const row = await loadOrCreate(identity);
    if (!row) return res.status(502).json({ error: 'Could not load progress' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, progress: toClient(row, identity), recent: await recentEvents(identity.id) });
  } catch (error) {
    console.error('[progress] get', error);
    return res.status(500).json({ error: 'Progress read failed' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return get(req, res);
  // auth 'none' here only means "not necessarily a wallet": the identity is
  // required right after (wallet session OR Supabase token). No Origin check
  // because the native app sends none.
  const guarded = await guardWrite(req, res, {
    methods: ['POST'],
    scope: 'progress',
    schema: Body,
    auth: 'none',
    allowNoOrigin: true,
    perIp: { limit: 60, windowSec: 60 },
    perSubject: { key: () => null, limit: 60, windowSec: 60 },
  });
  if (!guarded) return;
  const identity = await requireIdentity(req, res);
  if (!identity) return;
  const { platform, events, profile } = guarded.body;

  try {
    // The RPC locks this identity's land and progress, then commits ledger,
    // daily cap, counters and piece grants together. A retry cannot lose XP.
    const applied = await fetch(bobbyRest('rpc/bobby_apply_progress'), {
      method: 'POST', headers: bobbyServiceHeaders(),
      body: JSON.stringify({ p_identity: identity.id, p_platform: platform, p_events: events, p_profile: profile ?? {} }),
    });
    if (!applied.ok) {
      console.error('[progress] transaction failed', applied.status);
      return res.status(503).json({ error: 'Progress could not be saved. Your events remain queued; retry shortly.' });
    }
    const saved = await applied.json() as {
      progress: ProgressRow; legacyImported: number;
      results: Array<{ id: string; awarded: number; aura: number; xpBefore: number; xpAfter: number; duplicate: boolean;
        grant: { inventory_id: string; item_id: string; tier: Tier | null; held: number; state: 'seed' | 'bloomed'; seeded_at: string; horizon_hours: number } | null }>;
    };
    // Everything below is presentation of a transaction that already
    // committed: a failed read degrades the preview, never the answer (a 500
    // here would make the client retry and see its planted piece as pending).
    const grants = saved.results.flatMap(result => result.grant ? [result.grant] : []);
    let items: Item[] = [];
    let next: Record<Tier, ReturnType<typeof pieceSummary> | null> | null = null;
    if (grants.length) {
      // catalog() turns a failed read into []: one retry, so a granted piece is not reported as item:null.
      items = await catalog().catch(() => [] as Item[]);
      if (!items.length) items = await catalog().catch(() => [] as Item[]);
      if (items.length && grants.some(grant => grant.state === 'seed')) {
        try { next = nextPieces(items, await heldPieces(identity.id)); } catch (error) { console.error('[progress] tier preview', error); }
      }
    }
    const byItem = new Map(items.map(item => [item.id, item]));
    const results = saved.results.map(({ grant, ...result }) => {
      if (!grant) return result;
      const item = byItem.get(grant.item_id);
      const summary = item ? pieceSummary(item) : null;
      const world: RouteGrant = {
        // GROWTH-v1 §3: a common grant reports min(held_common, 8) at that grant;
        // any other tier keeps the caller's legacy counter.
        routeIndex: grant.tier === 'common' && Number.isFinite(grant.held) ? Math.min(grant.held, LEGACY_ROUTE_CAP) : saved.progress.route_index,
        item: summary, inventoryId: grant.inventory_id, state: grant.state, routeComplete: false, bloomedInventoryId: null,
        ...(grant.state === 'seed' ? {
          horizon: seedHorizon(grant.seeded_at, grant.horizon_hours, grant.state),
          ...(next ? { tiers: { common: summary, building: next.building, landmark: next.landmark } } : {}),
        } : {}),
      };
      return { ...result, world };
    });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, progress: toClient(saved.progress, identity), results, legacyImported: saved.legacyImported });
  } catch (error) {
    console.error('[progress] post', error);
    return res.status(500).json({ error: 'Progress update failed' });
  }
}
