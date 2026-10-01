// ============================================================
// Metered access to the desk read, shared by the web and iOS (bobby_consume_read,
// migration 20260927120000):
//   · anonymous device (sends x-bobby-device): 3 reads → then sign-in is required;
//   · signed in: 10 reads per rolling 7 days → then Bobby Pro, while BOBBY_PAYWALL=on;
//   · Bobby Pro (Stripe on the web, Apple on iOS): no cap.
//   · coupon gifts (bobby_usage_bonus, 20261001160000): extra reads / Profundo / Máximo spent after the
//     regular allowance runs out and never counted toward it (api/_lib/coupons.ts).
// A client that sends no device id (iOS ≤ 1.5 build 42) is served as before.
// Devices and networks are salted hashes; nothing readable is stored.
// A failed or malformed meter pauses analysis; an outage is never permission for unmetered AI use.
// ============================================================
import type { VercelRequest } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { getClientQuotaKeys, saltedKey } from './rate-limit.js';
import { resolveIdentity, type Identity } from './user-identity.js';
import { LEVEL_LIMITS, type PremiumLevel } from './desk-levels.js';

export type Tier = 'anon' | 'free' | 'pro';
/** `bonus`: reads gifted by coupons (bobby_usage_bonus), spent after the weekly allowance. Not part of `remaining`:
 *  shipped clients (iOS 1.5) render `remaining` against `limit`. */
export interface Access { tier: Tier; used: number | null; limit: number | null; remaining: number | null; resetsAt: string | null; paywall: boolean; bonus: number }
export interface ReadGate { allowed: boolean; code: 'signin_required' | 'subscription_required' | 'access_unavailable' | null; readId: number | null; access: Access; identity: Identity | null }

export const paywallOn = () => process.env.BOBBY_PAYWALL === 'on';

function header(req: VercelRequest, name: string): string {
  const raw = req.headers[name];
  return (Array.isArray(raw) ? raw[0] : raw) ?? '';
}

/** The salted hash of the client's install id, or null when it sent none (or garbage). */
export function deviceHash(req: VercelRequest): string | null {
  const id = header(req, 'x-bobby-device').trim();
  if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) return null;
  try { return saltedKey(`device:${id}`); } catch { return null; }
}

export function clientPlatform(req: VercelRequest): string {
  const p = header(req, 'x-bobby-platform').trim().toLowerCase();
  return p === 'ios' || p === 'web' || p === 'android' ? p : 'web';
}

function shape(row: Record<string, unknown>): Access {
  const used = typeof row.used === 'number' ? row.used : null;
  const limit = typeof row.limit === 'number' ? row.limit : null;
  const tier = (row.tier === 'pro' || row.tier === 'free' ? row.tier : 'anon') as Tier;
  const bonus = typeof row.bonus === 'number' && row.bonus > 0 ? row.bonus : 0;
  return {
    tier, used, limit, bonus,
    remaining: used !== null && limit !== null ? Math.max(0, limit - used) : null,
    resetsAt: typeof row.resetsAt === 'string' ? new Date(row.resetsAt).toISOString() : null,
    // Anonymous reads always stop at the sign-in; the weekly cap only binds while the paywall is on.
    paywall: tier === 'free' ? paywallOn() : tier === 'anon' && limit !== null,
  };
}

const OPEN: Access = { tier: 'anon', used: null, limit: null, remaining: null, resetsAt: null, paywall: false, bonus: 0 };

async function rpc(name: string, body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(bobbyRest(`rpc/${name}`), { method: 'POST', headers: bobbyServiceHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
    if (!r.ok) { console.error('[access]', name, r.status, await r.text().catch(() => '')); return null; }
    return (await r.json()) as Record<string, unknown>;
  } catch (e) {
    console.error('[access]', name, e instanceof Error ? e.message : e);
    return null;
  }
}

/** Who is asking; an expired or bad token counts as anonymous, an auth outage too (served, never blocked). */
async function who(req: VercelRequest): Promise<Identity | null> {
  try { return await resolveIdentity(req); } catch { return null; }
}

/** Check and record one read. */
export async function consumeRead(req: VercelRequest, symbol: string, options: { strict?: boolean; identity?: Identity | null } = {}): Promise<ReadGate> {
  const identity = options.identity === undefined ? await who(req) : options.identity;
  const device = identity ? null : deviceHash(req);
  if (options.strict && !identity && !device) {
    return { allowed: false, code: 'signin_required', readId: null, access: OPEN, identity };
  }
  let network: string | null = null;
  try { network = device ? getClientQuotaKeys(req)?.network ?? null : null; } catch { network = null; }
  const row = await rpc('bobby_consume_read', {
    p_identity: identity?.id ?? null, p_device: device, p_network: network,
    p_platform: clientPlatform(req), p_symbol: symbol.slice(0, 24) || null, p_paywall: paywallOn(),
  });
  if (!row || typeof row.allowed !== 'boolean') return { allowed: !options.strict, code: options.strict ? 'access_unavailable' : null, readId: null, access: OPEN, identity };
  const code = row.code === 'signin_required' || row.code === 'subscription_required' ? row.code : null;
  return { allowed: row.allowed !== false, code, readId: typeof row.readId === 'number' ? row.readId : null, access: shape(row), identity };
}

/** The owner's lifecycle funnel (bobby_devices): this install was opened, and by which account. Never throws. */
export async function touchDevice(req: VercelRequest, identity: Identity | null): Promise<void> {
  const device = deviceHash(req);
  if (!device) return;
  await rpc('bobby_touch_device', {
    p_device: device, p_platform: clientPlatform(req), p_surface: null, p_referrer: null, p_utm: null,
    p_identity: identity?.via === 'supabase' && identity.authUserId ? identity.id : null,
  });
}

/** Give a read back when the analysis itself failed (the user got nothing). */
export async function refundRead(readId: number | null): Promise<boolean> {
  if (!readId) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(bobbyRest(`bobby_reads?id=eq.${readId}`), { method: 'DELETE', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch { /* Retry the idempotent delete once. */ }
  }
  console.error('[access] read refund unavailable');
  return false;
}

/** The access state without consuming a read. */
export async function readAccess(req: VercelRequest, identity?: Identity | null): Promise<Access> {
  const id = identity === undefined ? await who(req) : identity;
  const row = await rpc('bobby_read_access', { p_identity: id?.id ?? null, p_device: id ? null : deviceHash(req), p_paywall: paywallOn() });
  return row ? shape(row) : OPEN;
}

export interface SubscriptionRow { identity_id: string; provider: 'stripe' | 'apple'; status: string; product_id: string | null; current_period_end: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null; apple_original_transaction_id: string | null }

export async function getSubscription(identityId: string): Promise<SubscriptionRow | null> {
  const r = await fetch(bobbyRest(`bobby_subscriptions?identity_id=eq.${identityId}&select=*`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`subscriptions ${r.status}`);
  const rows = (await r.json()) as SubscriptionRow[];
  return rows[0] ?? null;
}

export async function upsertSubscription(row: Partial<SubscriptionRow> & { identity_id: string; provider: 'stripe' | 'apple'; status: string }): Promise<void> {
  const r = await fetch(bobbyRest('bobby_subscriptions?on_conflict=identity_id'), {
    method: 'POST',
    headers: bobbyServiceHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ ...row, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`subscription upsert ${r.status} ${await r.text().catch(() => '')}`);
}

export const publicSubscription = (s: SubscriptionRow | null) => s ? { provider: s.provider, status: s.status, currentPeriodEnd: s.current_period_end } : null;

// ---- premium analysis levels (Profundo, Máximo): their own meter, per account or device ----
// The allowances live in api/_lib/desk-levels.ts; bobby_consume_level (20260929150000) counts atomically.
// Unlike the read meter these fail closed: a premium read is never served uncounted.

/** `bonus`: gifted uses of this level (coupons), spent after `remaining` reaches 0 and not included in it. */
export interface LevelMeter { used: number; limit: number; remaining: number; windowDays: number; resetsAt: string | null; bonus: number }
export interface LevelState { tier: Tier; levels: Record<PremiumLevel, LevelMeter> }
export type LevelCode = 'signin_required' | 'upgrade_required' | 'level_exhausted';
export interface LevelGate { allowed: boolean; code: LevelCode | null; useId: number | null; tier: Tier; used: number; limit: number; resetsAt: string | null }

function meter(raw: unknown): LevelMeter {
  const m = (raw ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return { used: num(m.used), limit: num(m.limit), remaining: num(m.remaining), windowDays: num(m.windowDays), resetsAt: typeof m.resetsAt === 'string' ? new Date(m.resetsAt).toISOString() : null, bonus: num(m.bonus) };
}
const tierOf = (v: unknown): Tier => (v === 'pro' || v === 'free' ? v : 'anon');

/** Check and record one premium read. Null when storage is unreachable (the caller refuses the read). */
export async function consumeLevel(req: VercelRequest, level: PremiumLevel, symbol: string): Promise<(LevelGate & { identity: Identity | null }) | null> {
  const identity = await who(req);
  const row = await rpc('bobby_consume_level', {
    p_identity: identity?.id ?? null, p_device: identity ? null : deviceHash(req), p_level: level,
    p_symbol: symbol.slice(0, 24) || null, p_limits: LEVEL_LIMITS,
  });
  if (!row) return null;
  const code = row.code === 'signin_required' || row.code === 'upgrade_required' || row.code === 'level_exhausted' ? row.code : null;
  return {
    allowed: row.allowed === true, code, useId: typeof row.useId === 'number' ? row.useId : null, tier: tierOf(row.tier),
    used: typeof row.used === 'number' ? row.used : 0, limit: typeof row.limit === 'number' ? row.limit : 0,
    resetsAt: typeof row.resetsAt === 'string' ? new Date(row.resetsAt).toISOString() : null, identity,
  };
}

/** Give a premium read back when the analysis itself failed. */
export async function refundLevel(useId: number | null): Promise<boolean> {
  if (!useId) return true;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(bobbyRest(`bobby_level_uses?id=eq.${useId}`), { method: 'DELETE', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch { /* Retry the idempotent delete once. */ }
  }
  console.error('[access] level refund unavailable');
  return false;
}

/** The premium meters without consuming anything. */
export async function readLevels(req: VercelRequest, identity?: Identity | null): Promise<LevelState | null> {
  const id = identity === undefined ? await who(req) : identity;
  const row = await rpc('bobby_level_state', { p_identity: id?.id ?? null, p_device: id ? null : deviceHash(req), p_limits: LEVEL_LIMITS });
  if (!row) return null;
  const levels = (row.levels ?? {}) as Record<string, unknown>;
  return { tier: tierOf(row.tier), levels: { profundo: meter(levels.profundo), maximo: meter(levels.maximo) } };
}

