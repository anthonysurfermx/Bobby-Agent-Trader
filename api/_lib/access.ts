// ============================================================
// Metered access to the desk read, shared by the web and iOS (bobby_consume_read,
// migration 20260927120000):
//   · anonymous device (sends x-bobby-device): 3 reads → then sign-in is required;
//   · signed in: 10 reads per rolling 7 days → then Bobby Pro, while BOBBY_PAYWALL=on;
//   · Bobby Pro (Stripe on the web, Apple on iOS): no cap.
// A client that sends no device id (iOS ≤ 1.5 build 42) is served as before.
// Devices and networks are salted hashes; nothing readable is stored.
// The meter never takes the desk down: if the database is unreachable the read is served.
// ============================================================
import type { VercelRequest } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { getClientQuotaKeys, saltedKey } from './rate-limit.js';
import { resolveIdentity, type Identity } from './user-identity.js';

export type Tier = 'anon' | 'free' | 'pro';
export interface Access { tier: Tier; used: number | null; limit: number | null; remaining: number | null; resetsAt: string | null; paywall: boolean }
export interface ReadGate { allowed: boolean; code: 'signin_required' | 'subscription_required' | null; readId: number | null; access: Access; identity: Identity | null }

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
  return {
    tier, used, limit,
    remaining: used !== null && limit !== null ? Math.max(0, limit - used) : null,
    resetsAt: typeof row.resetsAt === 'string' ? new Date(row.resetsAt).toISOString() : null,
    // Anonymous reads always stop at the sign-in; the weekly cap only binds while the paywall is on.
    paywall: tier === 'free' ? paywallOn() : tier === 'anon' && limit !== null,
  };
}

const OPEN: Access = { tier: 'anon', used: null, limit: null, remaining: null, resetsAt: null, paywall: false };

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
export async function consumeRead(req: VercelRequest, symbol: string): Promise<ReadGate> {
  const identity = await who(req);
  const device = identity ? null : deviceHash(req);
  let network: string | null = null;
  try { network = device ? getClientQuotaKeys(req)?.network ?? null : null; } catch { network = null; }
  const row = await rpc('bobby_consume_read', {
    p_identity: identity?.id ?? null, p_device: device, p_network: network,
    p_platform: clientPlatform(req), p_symbol: symbol.slice(0, 24) || null, p_paywall: paywallOn(),
  });
  if (!row) return { allowed: true, code: null, readId: null, access: OPEN, identity };
  const code = row.code === 'signin_required' || row.code === 'subscription_required' ? row.code : null;
  return { allowed: row.allowed !== false, code, readId: typeof row.readId === 'number' ? row.readId : null, access: shape(row), identity };
}

/** Give a read back when the analysis itself failed (the user got nothing). */
export async function refundRead(readId: number | null): Promise<void> {
  if (!readId) return;
  try {
    await fetch(bobbyRest(`bobby_reads?id=eq.${readId}`), { method: 'DELETE', headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(3000) });
  } catch { /* best effort */ }
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
