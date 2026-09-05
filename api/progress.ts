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
import { AWARD_AURA, PLANT_KINDS, applyAward, type ProgressCounters } from './_lib/progress-rules.js';
import { ThesisSchema, type RouteGrant } from './_lib/trader-land.js';
import { requireIdentity, type Identity } from './_lib/user-identity.js';
import { guardWrite } from './_lib/write-guard.js';

export const config = { maxDuration: 15 };

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;
const LEGACY_IMPORT_CAP = 300;
const Body = z.object({
  platform: z.enum(['ios', 'web']),
  events: z.array(z.object({
    id: z.string().uuid(),
    kind: z.enum(PLANT_KINDS),
    at: z.string().datetime({ offset: true }),
    tzOffsetMin: z.number().int().min(-840).max(840).default(0),
    meta: z.record(z.unknown()).optional(),
    thesis: ThesisSchema.optional().catch(undefined),
    thesisReadId: z.string().uuid().optional().catch(undefined),
  })).max(50).default([]),
  profile: z.object({
    companionId: z.string().regex(/^[a-z0-9_-]{1,32}$/).nullable().optional(),
    vibeId: z.string().regex(/^[a-z0-9_-]{1,32}$/).optional(),
    onboarded: z.boolean().optional(),
    riskNoticeVersion: z.number().int().min(0).max(100).optional(),
    quickAccess: z.array(z.string().regex(SYMBOL_RE)).max(6).optional(),
    /** XP earned on this device before the first sign-in. Honoured once, capped. */
    localXpClaim: z.number().int().min(1).max(100_000).optional(),
  }).optional(),
});

interface ProgressRow {
  identity_id: string;
  revision: number;
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

const SELECT = 'revision,identity_id,companion_id,vibe_id,onboarded,risk_notice_version,xp,aura,route_index,streak,last_day,daily_awards,daily_awards_day,quick_access,last_platform,updated_at';

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
    headers: bobbyServiceHeaders({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
    body: JSON.stringify({ identity_id: identity.id }),
  });
  if (!c.ok) return null;
  const created = ((await c.json()) as ProgressRow[])[0];
  if (created) return created;
  const raced = await fetch(bobbyRest(`bobby_progress?identity_id=eq.${identity.id}&select=${SELECT}&limit=1`), { headers: bobbyServiceHeaders() });
  return raced.ok ? ((await raced.json()) as ProgressRow[])[0] ?? null : null;
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
    maxBodyBytes: 32 * 1024, // Up to 50 queued snapshots plus their origin IDs.
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
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await loadOrCreate(identity);
      if (!row) return res.status(502).json({ error: 'Could not load progress' });

      // Idempotency: drop events this identity already reported.
      const uniqueEvents = [...new Map(events.map((e) => [e.id, e])).values()];
      let fresh = uniqueEvents;
      if (events.length) {
        const ids = events.map((e) => e.id).join(',');
        const seen = await fetch(bobbyRest(`bobby_progress_events?identity_id=eq.${identity.id}&client_event_id=in.(${ids})&select=client_event_id`), { headers: bobbyServiceHeaders() });
        if (!seen.ok) throw new Error('Progress event read failed');
        const seenIds = new Set(((await seen.json()) as Array<{ client_event_id: string }>).map((e) => e.client_event_id));
        fresh = uniqueEvents.filter((e) => !seenIds.has(e.id));
      }

      // Apply in chronological order with the shared rules.
      let counters: ProgressCounters = { xp: row.xp, streak: row.streak, lastDay: row.last_day, dailyAwards: row.daily_awards, dailyAwardsDay: row.daily_awards_day };
      const results: Array<{ id: string; awarded: number; aura: number; xpBefore: number; xpAfter: number; duplicate: boolean; world?: RouteGrant | null }> = [];
      let auraTotal = row.aura ?? 0;
      const ledger: Array<Record<string, unknown>> = [];
      const now = Date.now();
      // One-time import of pre-sign-in XP, decided BEFORE this request's events are
      // applied: only while the ledger is empty and xp is still 0, capped at LEGACY_IMPORT_CAP so a tampered claim buys at
      // most level 3. Recorded in the ledger like everything else.
      let legacyImported = 0;
      if (profile?.localXpClaim && row.xp === 0) {
        const any = await fetch(bobbyRest(`bobby_progress_events?identity_id=eq.${identity.id}&select=id&limit=1`), { headers: bobbyServiceHeaders() });
        if (!any.ok) throw new Error('Legacy progress read failed');
        const empty = ((await any.json()) as unknown[]).length === 0;
        if (empty) {
          legacyImported = Math.min(LEGACY_IMPORT_CAP, profile.localXpClaim);
          counters = { ...counters, xp: counters.xp + legacyImported };
          ledger.push({ identity_id: identity.id, client_event_id: crypto.randomUUID(), kind: 'legacy_import', points: legacyImported, awarded: legacyImported, xp_after: counters.xp, platform, occurred_at: new Date(now).toISOString(), day_key: new Date(now).toISOString().slice(0, 10), meta: { claimed: profile.localXpClaim } });
        }
      }

      for (const e of [...fresh].sort((a, b) => a.at.localeCompare(b.at))) {
        // Clock sanity: no awards from the future or older than 30 days.
        const atMs = Date.parse(e.at);
        const at = new Date(Math.min(Math.max(atMs, now - 30 * 86_400_000), now + 5 * 60_000));
        const out = applyAward(counters, e.kind, at, e.tzOffsetMin);
        counters = out.state;
        const aura = out.awarded > 0 ? AWARD_AURA[e.kind] : 0;
        auraTotal += aura;
        results.push({ id: e.id, awarded: out.awarded, aura, xpBefore: out.xpBefore, xpAfter: out.xpAfter, duplicate: false });
        // A submitted snapshot is not proof of a Bobby-issued verdict. Drop raw
        // meta rather than letting it impersonate a validated thesis/provenance.
        const meta = e.thesis ? { thesis: e.thesis, thesisSource: 'client_snapshot' } : null;
        // The RPC resolves this reference under the authenticated identity,
        // replacing the submitted fields only from its immutable server row.
        ledger.push({ identity_id: identity.id, client_event_id: e.id, kind: e.kind, points: out.points, awarded: out.awarded, aura, xp_after: out.xpAfter, platform, occurred_at: at.toISOString(), day_key: out.dayKey, meta, thesis_read_id: e.thesisReadId ?? null });
      }
      for (const e of uniqueEvents) if (!fresh.includes(e)) results.push({ id: e.id, awarded: 0, aura: 0, xpBefore: row.xp, xpAfter: row.xp, duplicate: true });

      const patch: Record<string, unknown> = {
        xp: counters.xp, aura: auraTotal, streak: counters.streak, last_day: counters.lastDay, daily_awards: counters.dailyAwards, daily_awards_day: counters.dailyAwardsDay,
        last_platform: platform, updated_at: new Date().toISOString(),
      };
      if (profile) {
        if (profile.companionId !== undefined) patch.companion_id = profile.companionId;
        if (profile.vibeId !== undefined) patch.vibe_id = profile.vibeId;
        if (profile.onboarded !== undefined) patch.onboarded = profile.onboarded;
        // The notice version only moves forward.
        if (profile.riskNoticeVersion !== undefined) patch.risk_notice_version = Math.max(row.risk_notice_version, profile.riskNoticeVersion);
        if (profile.quickAccess !== undefined) patch.quick_access = profile.quickAccess;
      }
      const upd = await fetch(bobbyRest('rpc/bobby_commit_progress'), {
        method: 'POST', headers: bobbyServiceHeaders(),
        body: JSON.stringify({ p_identity: identity.id, p_revision: row.revision, p_patch: patch, p_events: ledger }),
      });
      if (!upd.ok) return res.status(502).json({ error: 'Could not save progress' });
      const committed = await upd.json() as { retry?: boolean; progress: ProgressRow; grants: Record<string, RouteGrant> };
      if (committed.retry) continue; // Re-read and recompute; no partial writes occurred.
      for (const result of results) if (committed.grants[result.id]) result.world = committed.grants[result.id];
      const saved = committed.progress;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, progress: toClient(saved, identity), results, legacyImported });
    }
    return res.status(503).json({ error: 'Progress changed concurrently. Please retry.' });
  } catch (error) {
    console.error('[progress] post', error);
    return res.status(500).json({ error: 'Progress update failed' });
  }
}
