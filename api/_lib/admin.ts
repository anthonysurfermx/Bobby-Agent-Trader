// ============================================================
// The owner dashboard's server side (api/admin.ts, migration 20261001180000).
//   · requireAdmin: a signed-in Apple/Google account listed in bobby_admins.
//   · integrations: RevenueCat metrics (API v2 key), App Store Connect sales (downloads, ASC API key),
//     the LLM spend caps and the paywall switch. Each one reports `configured: false` until its env is set.
//   · actions: coupons, gifts, account deletion, admins, credit marks, a live provider probe; every change
//     leaves a bobby_admin_actions row.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createPrivateKey, randomInt, sign } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { bobbyDbUrl, bobbyRest, bobbyServiceHeaders, bobbyServiceKey } from './bobby-db.js';
import { requireIdentity, type Identity } from './user-identity.js';
import { llmCaps, llmSpend } from './llm-usage.js';
import { callerHash, deviceHash, getSubscription, paywallOn } from './access.js';
import { stopBillingFor } from './stripe-api.js';
import { blockCheckoutForDeletion } from './checkout-attempt.js';
import { countryCode, fromAlpha3 } from './geo.js';
import { RevenueCatError, liveSubscription, revenueCatReady, syncRevenueCat } from './revenuecat.js';
import { buildInsights } from './admin-insights.js';
import { adminBounded, adminFetch, adminReadMeta, deferAdminSources, markAdminSource, observeAdminSource, remainingAdminMs, withAdminDeadline } from './admin-read.js';

const TIMEOUT = 6000;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await adminFetch(bobbyRest(path), { ...init, headers: { ...bobbyServiceHeaders(), ...(init.headers ?? {}) } });
  if (!r.ok) throw new AdminError(r.status === 409 ? 409 : r.status === 400 ? 400 : 502, r.status === 400 ? 'Invalid request.' : `storage ${r.status}`);
  const prefer = (init.headers as Record<string, string> | undefined)?.Prefer ?? '';
  if (r.status === 204 || prefer.includes('return=minimal')) return null as T;
  const value = await adminBounded(() => r.json());
  if (value == null) throw new Error('storage_returned_no_data');
  return value as T;
}
export async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return rest<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
}

/** Exact row count of a PostgREST query (Content-Range), without reading the rows. */
async function countRows(path: string): Promise<number | null> {
  try {
    const r = await adminFetch(bobbyRest(path), { headers: { ...bobbyServiceHeaders(), Prefer: 'count=exact', Range: '0-0' } });
    if (!r.ok && r.status !== 206) return null;
    const range = r.headers.get('content-range');
    if (!range || !/^(?:\d+-\d+|\*)\/\d+$/.test(range)) return null;
    const total = Number(range.split('/')[1]);
    return Number.isFinite(total) ? total : null;
  } catch { return null; }
}

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type AdminIdentity = Identity & { internalMarkFailed: boolean };

/** The signed-in admin, or null after answering 401 / 403 / 503. */
export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<AdminIdentity | null> {
  const identity = await withAdminDeadline(6500, () => requireIdentity(req, res, { fetch: adminFetch, body: adminBounded }));
  if (!identity) return null;
  if (identity.via !== 'supabase' || !identity.authUserId) { res.status(403).json({ error: 'not_admin' }); return null; }
  try {
    const rows = await rest<Array<{ identity_id: string }>>(`bobby_admins?identity_id=eq.${identity.id}&select=identity_id`);
    if (!rows?.length) { res.status(403).json({ error: 'not_admin' }); return null; }
    // The browser and the address used for /admin are the team's own traffic: the dashboard leaves them out.
    // Awaited, not deferred: the very first view from a new browser must already exclude that browser.
    const device = deviceHash(req), network = callerHash(req);
    let internalMarkFailed = true;
    for (let attempt = 0; attempt < 2 && internalMarkFailed && (device || network); attempt++) {
      internalMarkFailed = await withAdminDeadline(1500, () => rpc('bobby_mark_admin_session', { p_device: device, p_network: network })).then(() => false, () => true);
    }
    markAdminSource('teamExclusion', { status: internalMarkFailed ? 'error' : 'ok', fetchedAt: internalMarkFailed ? null : new Date().toISOString(), ...(internalMarkFailed ? { error: 'admin_session_mark_failed' } : {}) });
    return { ...identity, internalMarkFailed };
  } catch {
    res.status(503).json({ error: 'The admin check is unavailable. Try again.' });
    return null;
  }
}

/** Every change is written before it runs: no audit row, no change. The outcome is added to the same row. */
export async function auditStart(admin: Identity, action: string, target: string | null, detail: Record<string, unknown> | null = null) {
  let rows: Array<{ id: number }> | null;
  try {
    rows = await rest<Array<{ id: number }>>('bobby_admin_actions', { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ admin_id: admin.id, action, target, detail: { ...(detail ?? {}), status: 'started' } }) });
  } catch { rows = null; }
  const id = rows?.[0]?.id;
  if (!id) throw new AdminError(503, 'The audit log is unavailable, so nothing was changed. Try again.');
  return async (status: 'ok' | 'failed', extra: Record<string, unknown> = {}) => {
    await rest(`bobby_admin_actions?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ target, detail: { ...(detail ?? {}), ...extra, status } }) }).catch((e) => console.error('[admin] audit finish failed', action, e instanceof Error ? e.message : e));
  };
}

export async function logAction(admin: Identity, action: string, target: string | null, detail: Record<string, unknown> | null = null): Promise<void> {
  try {
    await rest('bobby_admin_actions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ admin_id: admin.id, action, target, detail }) });
  } catch (e) {
    console.error('[admin] audit write failed', action, e instanceof Error ? e.message : e);
  }
}

// ---------------- coupons ----------------
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COUPON = /^[A-Z0-9][A-Z0-9-]{3,31}$/;
const int = (v: unknown, max: number): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : 0;
  if (!Number.isInteger(n) || n < 0 || n > max) throw new AdminError(400, `Value out of range (0–${max}).`);
  return n;
};

export async function createCoupon(body: Record<string, unknown>) {
  const reads = int(body.reads, 1000), profundo = int(body.profundo, 200), maximo = int(body.maximo, 100);
  if (reads + profundo + maximo === 0) throw new AdminError(400, 'A coupon must give at least one read.');
  const raw = typeof body.code === 'string' ? body.code.toUpperCase().replace(/\s+/g, '') : '';
  const code = raw || `BOBBY-${Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`;
  if (!COUPON.test(code)) throw new AdminError(400, 'Codes use A–Z, 0–9 and dashes (4–32 characters).');
  const max = body.maxRedemptions === null || body.maxRedemptions === undefined || body.maxRedemptions === '' ? null : int(body.maxRedemptions, 1_000_000);
  if (max === 0) throw new AdminError(400, 'The redemption cap must be at least 1.');
  let expires: string | null = null;
  if (typeof body.expiresAt === 'string' && body.expiresAt) {
    const at = new Date(body.expiresAt);
    if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) throw new AdminError(400, 'The expiry must be a future date.');
    expires = at.toISOString();
  }
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 200) : null;
  try {
    const rows = await rest<unknown[]>('bobby_coupons', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ code, reads, profundo, maximo, max_redemptions: max, expires_at: expires, note }),
    });
    return rows?.[0] ?? null;
  } catch (e) {
    if (e instanceof AdminError && e.status === 409) throw new AdminError(409, 'That code already exists.');
    throw e;
  }
}

export async function setCouponActive(code: unknown, active: unknown) {
  const c = typeof code === 'string' ? code.toUpperCase() : '';
  if (!COUPON.test(c) || typeof active !== 'boolean') throw new AdminError(400, 'Invalid coupon.');
  const rows = await rest<unknown[]>(`bobby_coupons?code=eq.${encodeURIComponent(c)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ active }),
  });
  if (!rows?.length) throw new AdminError(404, 'Coupon not found.');
  return rows[0];
}

export async function couponsView() {
  const [coupons, redemptions] = await Promise.all([
    rest<unknown[]>('bobby_coupons?select=*&order=created_at.desc&limit=200'),
    rest<Array<Record<string, unknown> & { identity?: { email?: string | null } | null }>>(
      'bobby_coupon_redemptions?select=code,identity_id,reads,profundo,maximo,created_at,identity:bobby_identities(email)&order=created_at.desc&limit=100'),
  ]);
  const [couponsTotal, redemptionsTotal] = await Promise.all([observeAdminSource('couponsTotal', () => countRows('bobby_coupons?select=code')), observeAdminSource('redemptionsTotal', () => countRows('bobby_coupon_redemptions?select=id'))]);
  const now = Date.now();
  return {
    coupons: ((coupons ?? []) as Array<Record<string, unknown>>).map((c) => ({
      ...c,
      // One status the dashboard can show as is: a coupon at its cap or past its date is not redeemable.
      status: !c.active ? 'inactive' : c.expires_at && new Date(String(c.expires_at)).getTime() <= now ? 'expired'
        : c.max_redemptions !== null && Number(c.redeemed) >= Number(c.max_redemptions) ? 'exhausted' : 'active',
    })),
    redemptions: (redemptions ?? []).map(({ identity, ...r }) => ({ ...r, email: identity?.email ?? null })),
    totals: { coupons: couponsTotal, redemptions: redemptionsTotal },
  };
}

export async function actionsView() {
  const rows = await rest<Array<Record<string, unknown> & { admin?: { email?: string | null } | null }>>(
    'bobby_admin_actions?select=id,action,target,detail,created_at,admin:bobby_identities(email)&order=created_at.desc&limit=100');
  return { actions: (rows ?? []).map(({ admin, ...a }) => ({ ...a, admin_email: admin?.email ?? null })), total: await observeAdminSource('actionsTotal', () => countRows('bobby_admin_actions?select=id')) };
}

export async function membersView(internal = false) {
  return rpc<{ subscriptions: unknown[]; grants: unknown[] }>('bobby_admin_members', { p_internal: internal });
}

// ---------------- accounts ----------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface IdentityRow { id: string; email: string | null; auth_user_id: string | null }

async function identityRow(id: unknown): Promise<IdentityRow> {
  if (typeof id !== 'string' || !UUID.test(id)) throw new AdminError(400, 'Invalid account id.');
  const rows = await rest<IdentityRow[]>(`bobby_identities?id=eq.${id}&select=id,email,auth_user_id`);
  if (!rows?.[0]) throw new AdminError(404, 'Account not found.');
  return rows[0];
}

export async function grant(admin: Identity, body: Record<string, unknown>) {
  const operationId = body.operationId;
  if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new AdminError(400, 'A valid grant operation id is required.');
  }
  const row = await identityRow(body.identityId);
  const gift = { p_reads: int(body.reads, 1000), p_profundo: int(body.profundo, 200), p_maximo: int(body.maximo, 100), p_pro_days: int(body.proDays, 366) };
  if (gift.p_reads + gift.p_profundo + gift.p_maximo + gift.p_pro_days === 0) throw new AdminError(400, 'Choose at least one gift.');
  const result = await rpc<{ ok: boolean; error?: string }>('bobby_admin_grant_once', { p_operation: operationId, p_admin: admin.id, p_identity: row.id, ...gift });
  if (!result?.ok) {
    if (result?.error === 'operation_conflict') throw new AdminError(409, 'This grant operation belongs to a different account, administrator or gift.');
    if (result?.error === 'not_admin') throw new AdminError(403, 'not_admin');
    if (result?.error === 'not_found') throw new AdminError(404, 'Account not found.');
    if (result?.error === 'paid_period_end_unknown') throw new AdminError(409, 'paid_period_end_unknown');
    throw new AdminError(502, 'The grant was not confirmed. Retry the same operation.');
  }
  if ((result as { operationId?: string }).operationId?.toLowerCase() !== operationId.toLowerCase()) {
    throw new AdminError(502, 'The grant was not confirmed. Retry the same operation.');
  }
  return { target: row.email || row.id, result };
}

/** The account deletion of api/account.ts, without the user's Apple authorization code (revocation is manual). */
export async function deleteUser(admin: Identity, body: Record<string, unknown>) {
  const row = await identityRow(body.identityId);
  if (row.id === admin.id) throw new AdminError(400, 'You cannot delete your own account from here.');
  const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : '';
  // Apple accounts that hide their email are confirmed by their id.
  if (confirm !== (row.email || row.id).toLowerCase()) throw new AdminError(400, 'Type the account email to confirm.');
  // Card billing stops first, as in api/account.ts: a deleted account can never reach the portal again. A charge that
  // is still possible and cannot be confirmed stopped ends the deletion with nothing changed (red team 2026-10-02).
  let billing: Awaited<ReturnType<typeof stopBillingFor>>;
  try { billing = await stopBillingFor(row.id, await getSubscription(row.id), await blockCheckoutForDeletion(row.id)); }
  catch { throw new AdminError(503, 'Stripe could not confirm the card subscription was cancelled, so nothing was deleted. Retry.'); }
  if (billing.unverified) console.error('[admin] delete: stripe unverified', row.id, billing.unverified);
  // The sign-in goes first: if it fails nothing is deleted yet, so a retry finds the account again.
  if (row.auth_user_id) {
    const url = (process.env.BOBBY_AUTH_URL || bobbyDbUrl()).replace(/\/+$/, '');
    const key = (process.env.BOBBY_AUTH_SERVICE_ROLE_KEY || bobbyServiceKey()).trim();
    const r = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(row.auth_user_id)}`, {
      method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok && r.status !== 404) throw new AdminError(502, 'The sign-in could not be deleted, so nothing was changed. Retry.');
  }
  await rest(`agent_trades?user_id=eq.${row.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: null }) });
  await rest(`bobby_identities?id=eq.${row.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  return { target: row.email || row.id, ...(billing.unverified ? { stripeUnverified: billing.unverified } : {}) };
}

/** Re-check one membership against RevenueCat. A successful store response reconciles access; an unavailable
 *  provider leaves the existing row unchanged. No secret is handled by the admin. */
export async function resyncMembership(body: Record<string, unknown>) {
  const row = await identityRow(body.identityId);
  if (!row.auth_user_id) throw new AdminError(400, 'Only Apple/Google accounts can be re-synced.');
  if (!revenueCatReady()) throw new AdminError(503, 'RevenueCat is not configured.');
  const before = await getSubscription(row.id).catch(() => null);
  let revenuecatActive: boolean;
  try {
    revenuecatActive = await syncRevenueCat(row.auth_user_id, row.id, { keepAccess: true });
  } catch (e) {
    console.error('[admin] resync-membership', e instanceof Error ? e.message : e);
    // A refused key and an unknown subscriber are answers, not silence: each one says what to fix.
    if (e instanceof RevenueCatError && e.kind === 'key_rejected') throw new AdminError(502, 'RevenueCat rejected the secret key. Nothing was changed.');
    if (e instanceof RevenueCatError && e.kind === 'not_found') throw new AdminError(404, 'RevenueCat does not know this account. Nothing was changed.');
    if (e instanceof RevenueCatError && e.status) throw new AdminError(502, `RevenueCat answered with an error (${e.status}). Nothing was changed.`);
    if (e instanceof RevenueCatError) throw new AdminError(504, 'RevenueCat did not answer. Nothing was changed.');
    throw new AdminError(502, 'The membership could not be re-synced. Nothing was changed.');
  }
  // The sync is done: a failed read-back leaves the row unreported (null), not the action "failed".
  const after = await getSubscription(row.id).catch(() => null);
  const subscription = after ? {
    status: after.status, environment: after.environment ?? 'unknown', periodType: after.period_type ?? 'unknown',
    currentPeriodEnd: after.current_period_end, storeCheckedAt: after.store_checked_at ?? null,
  } : null;
  return { revenuecatActive, accessKept: liveSubscription(before) && liveSubscription(after) && !revenuecatActive, subscription };
}

export async function setAdmin(admin: Identity, body: Record<string, unknown>) {
  const row = await identityRow(body.identityId);
  if (typeof body.admin !== 'boolean') throw new AdminError(400, 'Invalid request.');
  if (!body.admin && row.id === admin.id) throw new AdminError(400, 'You cannot remove your own admin role.');
  if (body.admin) {
    if (!row.auth_user_id) throw new AdminError(400, 'Only Apple/Google accounts can be admins.');
    await rest('bobby_admins?on_conflict=identity_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ identity_id: row.id }) });
  } else {
    await rest(`bobby_admins?identity_id=eq.${row.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  return { target: row.email || row.id };
}

// ---------------- internal traffic ----------------
/** An account the owner marks as the team's own (a test Apple ID, a colleague): left out of every metric. */
export async function setInternal(body: Record<string, unknown>) {
  const row = await identityRow(body.identityId);
  if (typeof body.internal !== 'boolean') throw new AdminError(400, 'Invalid request.');
  if (body.internal) {
    await rest('bobby_internal_marks?on_conflict=identity_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ identity_id: row.id, note: typeof body.note === 'string' ? body.note.trim().slice(0, 120) || null : null }) });
  } else {
    await rest(`bobby_internal_marks?identity_id=eq.${row.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  }
  return { target: row.email || row.id };
}

/** An install, by the 10-character prefix the installs list shows. */
export async function setDeviceInternal(body: Record<string, unknown>) {
  const prefix = typeof body.device === 'string' ? body.device : '';
  if (!/^[A-Za-z0-9_-]{10}$/.test(prefix) || typeof body.internal !== 'boolean') throw new AdminError(400, 'Invalid request.');
  const n = await rpc<number>('bobby_set_device_internal', { p_prefix: prefix, p_internal: body.internal });
  if (n !== 1) throw new AdminError(404, 'Install not found.');
  return { target: prefix };
}

export async function removeInternalNetwork(body: Record<string, unknown>) {
  const prefix = typeof body.network === 'string' ? body.network : '';
  if (!/^[A-Za-z0-9_-]{10}$/.test(prefix)) throw new AdminError(400, 'Invalid request.');
  // Kept as ignored (not deleted), so the next /admin visit from that address does not add it back.
  const n = await rpc<number>('bobby_ignore_internal_network', { p_prefix: prefix });
  if (n !== 1) throw new AdminError(404, 'Network not found.');
  return { target: prefix };
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,24}$/i;
/** The owner's own sign-in emails: their accounts are internal, also the ones created later. */
export async function setInternalEmails(body: Record<string, unknown>) {
  const list = Array.isArray(body.emails) ? body.emails : null;
  if (!list || list.length > 50) throw new AdminError(400, 'Invalid request.');
  const emails = [...new Set(list.map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : '')).filter(Boolean))];
  if (emails.some((e) => !EMAIL.test(e))) throw new AdminError(400, 'Invalid email.');
  await rest('bobby_admin_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'internal_emails', value: emails, updated_at: new Date().toISOString() }) });
  return { emails };
}

/** Installs (newest first), the networks left out and the listed emails: what "internal" means right now. */
export async function internalView() {
  const [devices, networks, emails, marks] = await Promise.all([
    rpc<unknown[]>('bobby_admin_devices', { p_limit: 200 }),
    // Prefixes only and how many installs each network leaves out (bobby_admin_internal_networks).
    rpc<unknown[]>('bobby_admin_internal_networks', {}),
    rest<Array<{ value: unknown }>>('bobby_admin_settings?key=eq.internal_emails&select=value'),
    rest<Array<{ identity_id: string; note: string | null; created_at: string; identity?: { email?: string | null; provider?: string | null } | null }>>(
      'bobby_internal_marks?select=identity_id,note,created_at,identity:bobby_identities(email,provider)&order=created_at.desc'),
  ]);
  return {
    devices: devices ?? [],
    networks: networks ?? [],
    emails: Array.isArray(emails?.[0]?.value) ? (emails![0].value as unknown[]).filter((e): e is string => typeof e === 'string') : [],
    marks: (marks ?? []).map(({ identity, ...m }) => ({ ...m, email: identity?.email || null, provider: identity?.provider ?? null })),
  };
}

// ---------------- LLM credit ----------------
export async function creditMark(body: Record<string, unknown>) {
  const provider = body.provider === 'openai' || body.provider === 'anthropic' ? body.provider : null;
  const kind = body.kind === 'balance' || body.kind === 'topup' ? body.kind : null;
  const amount = typeof body.amountUsd === 'number' ? body.amountUsd : Number(body.amountUsd);
  if (!provider || !kind || !Number.isFinite(amount) || amount < 0 || amount > 100000) throw new AdminError(400, 'Invalid amount.');
  if (kind === 'topup' && Math.round(amount * 100) <= 0) throw new AdminError(400, 'A top-up must be more than $0.');
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 120) : null;
  await rest('bobby_llm_credit_marks', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ provider, kind, amount_usd: Math.round(amount * 100) / 100, note }) });
  return { provider, kind, amount };
}

/** One live 1-token call: does this provider still have credit? */
export async function probeProvider(provider: unknown) {
  let res: Response;
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { status: 'error' as const, httpStatus: 0, code: 'not_configured' };
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
    });
  } else if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { status: 'error' as const, httpStatus: 0, code: 'not_configured' };
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
    });
  } else {
    throw new AdminError(400, 'Unknown provider.');
  }
  if (res.ok) {
    // A working provider ends any credit alert, and the successful call is evidence for the dashboard (lastOk).
    await Promise.all([
      rest(`api_cache?cache_key=eq.${encodeURIComponent(`provider-credit-alert:${provider}`)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => null),
      rest('bobby_llm_usage', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        surface: 'probe', provider, model: provider === 'anthropic' ? 'claude-haiku-4-5-20251001' : 'gpt-4o-mini', role: 'probe',
        tokens_in: 1, tokens_out: 1, tokens_cached: 0, tokens_reasoning: 0, usd: 0, latency_ms: 0, stop: 'ok', ok: true }) }).catch(() => null),
    ]);
    return { status: 'ok' as const, httpStatus: res.status };
  }
  // Class only: the provider's message is never kept.
  const error = ((await res.json().catch(() => null)) as { error?: { code?: unknown; type?: unknown; message?: unknown } } | null)?.error;
  const text = typeof error?.message === 'string' ? error.message : '';
  const noCredit = error?.code === 'insufficient_quota' || error?.code === 'billing_hard_limit_reached' || /credit balance is too low/i.test(text);
  const code = typeof error?.code === 'string' ? error.code : typeof error?.type === 'string' ? error.type : undefined;
  return { status: noCredit ? 'no_credit' as const : 'error' as const, httpStatus: res.status, code: noCredit ? 'insufficient_quota' : code?.slice(0, 40) };
}

// ---------------- integrations ----------------
type Metric = { id: string; name: string; value: number; unit?: string; period?: string; description?: string; updatedAt?: string };
let rcCache: { at: number; project: string; value: { configured: boolean; error?: string; metrics?: Metric[]; fetchedAt?: string } } | null = null;

async function revenueCatMetrics() {
  const key = process.env.REVENUECAT_V2_SECRET_KEY?.trim();
  if (!key) return { configured: false };
  const project = process.env.REVENUECAT_PROJECT_ID?.trim();
  if (!project) return { configured: true, error: 'revenuecat_project_not_configured' };
  if (rcCache && rcCache.project === project && Date.now() - rcCache.at < (rcCache.value.error ? 60_000 : 5 * 60_000)) return rcCache.value;
  const get = async (path: string) => {
    const r = await adminFetch(`https://api.revenuecat.com/v2${path}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`revenuecat ${r.status}`);
    return adminBounded(() => r.json()) as Promise<Record<string, unknown>>;
  };
  let value: { configured: boolean; error?: string; metrics?: Metric[]; fetchedAt?: string };
  try {
    const overview = await get(`/projects/${encodeURIComponent(project)}/metrics/overview`);
    if (!Array.isArray(overview.metrics)) throw new Error('revenuecat_metrics_invalid');
    if (overview.metrics.some((m) => m == null || m.value == null || !Number.isFinite(Number(m.value)))) throw new Error('revenuecat_metrics_invalid');
    const metrics = (overview.metrics as Array<Record<string, unknown>>).map((m) => ({
      id: String(m.id ?? ''), name: String(m.name ?? m.id ?? ''), value: Number(m.value ?? 0),
      unit: typeof m.unit === 'string' ? m.unit : undefined, period: typeof m.period === 'string' ? m.period : undefined,
      description: typeof m.description === 'string' ? m.description.slice(0, 80) : undefined,
      updatedAt: typeof m.last_updated_at_iso8601 === 'string' ? m.last_updated_at_iso8601 : typeof m.last_updated_at === 'number' ? new Date(m.last_updated_at).toISOString() : undefined,
    }));
    value = { configured: true, metrics, fetchedAt: new Date().toISOString() };
  } catch (e) {
    value = { configured: true, error: e instanceof Error ? e.message : 'revenuecat unavailable' };
  }
  rcCache = { at: Date.now(), project, value };
  return value;
}

// App Store Connect daily sales reports (downloads), one cached row per day in api_cache.
const APP_ID = () => process.env.ASC_APP_ID?.trim() || '6804460489';
// Values pasted from App Store Connect can carry surrounding text or line breaks: keep only the identifier.
export const ascVendor = (raw = process.env.ASC_VENDOR_NUMBER) => raw?.match(/\d{5,12}/)?.[0] ?? '';
export const ascKeyId = (raw = process.env.ASC_KEY_ID) => raw?.match(/\b[A-Z0-9]{10}\b/)?.[0] ?? '';
export const ascIssuer = (raw = process.env.ASC_ISSUER_ID) => raw?.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? '';
const ascConfigured = () => Boolean(ascKeyId() && ascIssuer() && process.env.ASC_PRIVATE_KEY?.trim() && ascVendor());
// countries: first-time downloads by storefront country (ISO alpha-2).
interface SalesDay { downloads: number; redownloads: number; updates: number; iap: number; countries?: Record<string, number>; pending?: boolean }

function ascToken(): string {
  const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'ES256', kid: ascKeyId(), typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: ascIssuer(), iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }));
  const key = createPrivateKey(process.env.ASC_PRIVATE_KEY!.replace(/\\n/g, '\n'));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64(sig)}`;
}

const IAP_IDS = () => new Set((process.env.ASC_IAP_IDS?.trim() || '6817775464').split(/[,\s]+/).filter(Boolean));
export function parseSalesReport(tsv: string, appId: string, iapIds: Set<string> = IAP_IDS()): SalesDay {
  const out: SalesDay = { downloads: 0, redownloads: 0, updates: 0, iap: 0, countries: {} };
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  const cols = (lines.shift() ?? '').split('\t');
  const at = (name: string) => cols.indexOf(name);
  const [type, units, apple, _parent, country] = [at('Product Type Identifier'), at('Units'), at('Apple Identifier'), at('Parent Identifier'), at('Country Code')];
  if (type < 0 || units < 0 || apple < 0) throw new Error('appstore report unreadable');
  for (const line of lines) {
    const f = line.split('\t');
    const t = (f[type] ?? '').trim(); const n = Number(f[units]);
    if (f[units] == null || f[units].trim() === '' || !Number.isFinite(n)) throw new Error('appstore report unreadable');
    const ours = apple >= 0 && f[apple]?.trim() === appId;
    if (/^(IA|FI)/.test(t)) { if (iapIds.has(f[apple]?.trim() ?? '')) out.iap += n; continue; }
    if (!ours) continue;
    if (/^(1|F1)/.test(t)) {
      out.downloads += n;
      const cc = countryCode(country >= 0 ? f[country] : null);
      if (cc) out.countries![cc] = (out.countries![cc] ?? 0) + n;
    }
    else if (/^3/.test(t)) out.redownloads += n;
    else if (/^7/.test(t)) out.updates += n;
  }
  return out;
}

/** External reports run separately from live first-party figures. The budget includes cache reads/writes. */
export const APPLE_BUDGET_MS = 10_000;
export const APPLE_MAX_DAYS = 90;
export interface AppleLoad { budgetMs?: number; cacheOnly?: boolean; coreOnly?: boolean }

export async function appStoreSales(days: string[], budgetMs = APPLE_BUDGET_MS, opts: { cacheOnly?: boolean } = {}) {
  if (!ascConfigured()) return { configured: false };
  return withAdminDeadline(budgetMs, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const past = [...new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d < today))].sort();
    const wanted = past.slice(-APPLE_MAX_DAYS).reverse();
    const results = new Map<string, SalesDay>();
    const stamps: string[] = [];
    const errors = new Map<string, string>();
    let cacheError: string | null = null;
    // One cache read for the entire range; warm loads no longer make 90 serial cache round trips.
    try {
      if (wanted.length) {
        const keys = wanted.map((d) => `asc-sales-v2:${d}`).join(',');
        const rows = await rest<Array<{ cache_key: string; payload: SalesDay; updated_at: string }>>(
          `api_cache?cache_key=in.(${encodeURIComponent(keys)})&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=cache_key,payload,updated_at`);
        for (const row of rows) {
          const date = row.cache_key.replace(/^asc-sales-v2:/, '');
          if (wanted.includes(date) && row.payload && typeof row.payload.downloads === 'number') {
            results.set(date, row.payload);
            if (typeof row.updated_at === 'string') stamps.push(row.updated_at);
          }
        }
      }
    } catch { cacheError = 'cache_read_unavailable'; }
    const writes: Array<Record<string, unknown>> = [];
    if (!opts.cacheOnly) {
      let token: string;
      try { token = ascToken(); } catch { return { configured: true, error: 'appstore_credentials_invalid' }; }
      const uncached = wanted.filter((d) => !results.has(d));
      for (let i = 0; i < uncached.length; i += 5) {
        try { remainingAdminMs(); } catch { break; }
        await Promise.all(uncached.slice(i, i + 5).map(async (date) => {
          try {
            const params = new URLSearchParams({
              'filter[frequency]': 'DAILY', 'filter[reportDate]': date, 'filter[reportSubType]': 'SUMMARY',
              'filter[reportType]': 'SALES', 'filter[vendorNumber]': ascVendor(), 'filter[version]': '1_1',
            });
            const response = await adminFetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' },
            }, 10_000);
            if (response.status !== 404 && !response.ok) throw new Error(`appstore_${response.status}`);
            // A missing report is unpublished/unknown. It never supplies an observed zero day.
            const day: SalesDay = response.status === 404
              ? { downloads: 0, redownloads: 0, updates: 0, iap: 0, countries: {}, pending: true }
              : parseSalesReport(gunzipSync(Buffer.from(await adminBounded(() => response.arrayBuffer()))).toString('utf8'), APP_ID());
            results.set(date, day);
            const at = new Date().toISOString();
            stamps.push(at);
            const settled = Date.now() - Date.parse(`${date}T00:00:00Z`) > 3 * 86_400_000;
            writes.push({ cache_key: `asc-sales-v2:${date}`, payload: day, updated_at: at,
              expires_at: new Date(Date.now() + (day.pending ? 0.25 : settled ? 365 : 1) * 86_400_000).toISOString() });
          } catch (e) {
            errors.set(date, e instanceof Error && /appstore_\d+/.test(e.message) ? e.message : 'report_unavailable');
          }
        }));
        // A provider auth/rate error is shared by the following days: do not hammer all 90 reports.
        if ([...errors.values()].some((e) => /appstore_(401|403|429)/.test(e))) break;
      }
    }
    // One bounded write, and only while time remains. Loaded reports remain useful if cache storage fails.
    if (writes.length) {
      try {
        await rest('api_cache?on_conflict=cache_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(writes) });
      } catch { cacheError = 'cache_write_unavailable'; }
    }
    const missingDays = past.filter((d) => !results.has(d));
    const pendingDays = [...results].filter(([, v]) => v.pending).map(([d]) => d).sort();
    const reported = [...results].filter(([, v]) => !v.pending).map(([d]) => d).sort();
    const totals = { downloads: 0, redownloads: 0, updates: 0, iap: 0 };
    const countries = new Map<string, number>();
    for (const value of results.values()) {
      if (value.pending) continue;
      totals.downloads += value.downloads; totals.redownloads += value.redownloads; totals.updates += value.updates; totals.iap += value.iap;
      for (const [country, downloads] of Object.entries(value.countries ?? {})) countries.set(country, (countries.get(country) ?? 0) + downloads);
    }
    const oldestReportAt = stamps.sort()[0] ?? null;
    const fetchedAt = new Date().toISOString();
    markAdminSource('appStoreCache', { status: cacheError ? 'error' : 'ok', fetchedAt: cacheError ? null : new Date().toISOString(), ...(cacheError ? { error: cacheError } : {}) });
    return { configured: true, days, downloads: days.map((d) => results.has(d) && !results.get(d)!.pending ? results.get(d)!.downloads : null),
      totals: reported.length ? totals : null,
      byCountry: reported.length ? [...countries].map(([country, downloads]) => ({ country, downloads })).sort((a, b) => b.downloads - a.downloads).slice(0, 40) : null,
      coveredFrom: reported[0] ?? null, coveredTo: reported.at(-1) ?? null, pendingDays, excludedToday: today,
      partial: missingDays.length > 0 || pendingDays.length > 0, missingDays, fetchedAt, oldestReportAt,
      ...(cacheError ? { cacheError } : {}),
      ...(errors.size ? { reportErrors: Object.fromEntries(errors) } : {}) };
  });
}

async function latest(path: string): Promise<string | null> {
  const rows = await rest<Array<Record<string, unknown>>>(path);
  const row = rows?.[0];
  const value = row ? Object.values(row)[0] : null;
  return typeof value === 'string' ? value : null;
}

async function observedLatest(name: string, path: string): Promise<string | null> {
  const result = await observeAdminSource(name, async () => ({ at: await latest(path) }));
  return result?.at ?? null;
}

export async function integrations(days: string[], apple: AppleLoad = {}) {
  // (Search Console is read by the lifecycle view, at the top of the web funnel.)
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since24 = new Date(Date.now() - 86_400_000).toISOString();
  const [revenuecat, appStore, spend, webhookLast, webhook30d, stripeLast, trackLast, track24h, trackHealth, readsLast] = await Promise.all([
    observeAdminSource('revenuecat', revenueCatMetrics), observeAdminSource('appStore', () => appStoreSales(days, apple.budgetMs ?? APPLE_BUDGET_MS, apple)),
    observeAdminSource('llmGuard', llmSpend),
    observedLatest('revenuecatWebhook', 'bobby_purchase_events?select=created_at&store=neq.STRIPE&order=created_at.desc&limit=1'),
    observeAdminSource('revenuecatEvents', () => countRows(`bobby_purchase_events?select=id&store=neq.STRIPE&created_at=gte.${encodeURIComponent(since30)}`)),
    observedLatest('stripeWebhook', 'bobby_purchase_events?select=created_at&store=eq.STRIPE&order=created_at.desc&limit=1'),
    observedLatest('tracking', 'bobby_events?select=created_at&event=eq.visit&order=created_at.desc&limit=1'),
    observeAdminSource('trackingEvents', () => countRows(`bobby_events?select=id&event=eq.visit&created_at=gte.${encodeURIComponent(since24)}`)),
    observeAdminSource('trackingHealth', () => rest<Array<{ payload: { lastErrorAt?: string; error?: string } }>>('api_cache?cache_key=eq.track-health&select=payload')),
    observedLatest('reads', 'bobby_reads?select=created_at&order=created_at.desc&limit=1'),
  ]);
  const missing = [
    ...(process.env.REVENUECAT_V2_SECRET_KEY?.trim() ? [] : ['REVENUECAT_V2_SECRET_KEY']),
    ...(process.env.REVENUECAT_PROJECT_ID?.trim() ? [] : ['REVENUECAT_PROJECT_ID']),
    ...(ascKeyId() ? [] : ['ASC_KEY_ID']), ...(ascIssuer() ? [] : ['ASC_ISSUER_ID']),
    ...(process.env.ASC_PRIVATE_KEY?.trim() ? [] : ['ASC_PRIVATE_KEY']), ...(ascVendor() ? [] : ['ASC_VENDOR_NUMBER']),
    ...(process.env.GSC_SERVICE_ACCOUNT_JSON?.trim() ? [] : ['GSC_SERVICE_ACCOUNT_JSON']),
  ];
  const has = (k: string) => Boolean(process.env[k]?.trim());
  missing.push(...['REVENUECAT_SECRET_KEY', 'REVENUECAT_WEBHOOK_AUTH', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'].filter((k) => !has(k)));
  // A failed read is different from a successful read with no rows. Preserve that distinction per field.
  const sourceError = (name: string) => {
    const source = adminReadMeta().sources[name];
    return source?.status === 'error' ? source.error ?? 'source_unavailable' : null;
  };
  const stripe = { configured: has('STRIPE_SECRET_KEY') && has('STRIPE_PRICE_ID'), webhook: has('STRIPE_WEBHOOK_SECRET'), lastEventAt: stripeLast,
    lastEventError: sourceError('stripeWebhook') };
  return {
    revenuecat: revenuecat ?? { configured: Boolean(process.env.REVENUECAT_V2_SECRET_KEY?.trim()), error: 'source_unavailable' },
    appStore: appStore ?? { configured: ascConfigured(), error: 'source_unavailable' }, llmCaps: llmCaps(), paywall: paywallOn(), missing,
    // The spend guard's own figures: desk only, UTC calendar day and month (what the caps are compared to).
    llmGuard: spend ? { dayUsd: spend.day, monthUsd: spend.month } : null,
    health: {
      // Configured = the secrets exist; delivery is only proven by events arriving.
      revenuecatWebhook: { configured: has('REVENUECAT_SECRET_KEY') && has('REVENUECAT_WEBHOOK_AUTH'), lastEventAt: webhookLast, events30d: webhook30d,
        lastEventError: sourceError('revenuecatWebhook'), eventsError: sourceError('revenuecatEvents') },
      stripe,
      tracking: { lastEventAt: trackLast, events24h: track24h, lastErrorAt: trackHealth?.[0]?.payload?.lastErrorAt ?? null, lastError: trackHealth?.[0]?.payload?.error ?? null, lastReadAt: readsLast,
        lastEventError: sourceError('tracking'), eventsError: sourceError('trackingEvents'), lastReadError: sourceError('reads'), healthError: sourceError('trackingHealth') },
      llmKeys: { anthropic: has('ANTHROPIC_API_KEY'), openai: has('OPENAI_API_KEY') },
      // Vercel Web Analytics has no read API here: its state is not verified by the dashboard.
      vercelAnalytics: 'unverified' as const,
    },
  };
}

// ---------------- Google Search Console (top of the web funnel) ----------------
// A service account added as a user of the property (GSC_SERVICE_ACCOUNT_JSON, GSC_SITE).
const GSC_SITE = () => process.env.GSC_SITE?.trim() || 'https://bobbyprotocol.xyz/';
let gscToken: { value: string; until: number } | null = null;
const gscCache = new Map<string, { at: number; value: unknown; failed?: boolean }>();

async function googleToken(): Promise<string> {
  if (gscToken && gscToken.until > Date.now() + 60_000) return gscToken.value;
  const creds = JSON.parse(process.env.GSC_SERVICE_ACCOUNT_JSON!) as { client_email?: string; private_key?: string };
  if (!creds.client_email || !creds.private_key) throw new Error('searchconsole credentials incomplete');
  const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: creds.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${body}`), createPrivateKey(creds.private_key.replace(/\\n/g, '\n')));
  const r = await adminFetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(TIMEOUT),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64(sig)}` }),
  });
  if (!r.ok) throw new Error(`searchconsole token ${r.status}`);
  const t = (await adminBounded(() => r.json())) as { access_token?: string; expires_in?: number };
  if (!t.access_token) throw new Error('searchconsole token missing');
  gscToken = { value: t.access_token, until: Date.now() + (t.expires_in ?? 3600) * 1000 };
  return t.access_token;
}

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
interface GscResult { rows: GscRow[]; firstIncompleteDate: string | null }
async function gscQuery(token: string, body: Record<string, unknown>): Promise<GscResult> {
  const r = await adminFetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE())}/searchAnalytics/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    // Google's machine reason (SERVICE_DISABLED, forbidden…) tells setup problems apart; it carries no secrets.
    const err = (await adminBounded(() => r.json()).catch(() => null)) as { error?: { status?: string; errors?: Array<{ reason?: string }>; details?: Array<{ reason?: string }> } } | null;
    const reason = err?.error?.details?.find((d) => d.reason)?.reason ?? err?.error?.errors?.[0]?.reason ?? err?.error?.status;
    throw new Error(`searchconsole ${r.status}${reason ? ` ${String(reason).slice(0, 40)}` : ''}`);
  }
  const data = await adminBounded(() => r.json()) as { rows?: GscRow[]; metadata?: { first_incomplete_date?: string } };
  if (!data || (data.rows != null && !Array.isArray(data.rows))) throw new Error('searchconsole_response_invalid');
  const rows = data.rows ?? [];
  if (rows.some((row) => !row || !Array.isArray(row.keys) || row.clicks == null || row.impressions == null ||
      !Number.isFinite(row.clicks) || !Number.isFinite(row.impressions))) throw new Error('searchconsole_response_invalid');
  const incomplete = data.metadata?.first_incomplete_date;
  return { rows, firstIncompleteDate: typeof incomplete === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(incomplete) ? incomplete : null };
}

export async function searchConsole(days: string[]) {
  if (!process.env.GSC_SERVICE_ACCOUNT_JSON?.trim()) return { configured: false };
  if (!days.length) return { configured: true, days, clicks: [], impressions: [] };
  const key = `${days[0]}:${days.at(-1)}`;
  const hit = gscCache.get(key);
  // A failure is retried after a minute so a fixed setup (API enabled, user added) shows up quickly.
  if (hit && Date.now() - hit.at < (hit.failed ? 60_000 : 30 * 60_000)) {
    if (hit.failed) return hit.value;
    return { ...(hit.value as Record<string, unknown>), oldestReportAt: new Date(hit.at).toISOString(), cacheTtlMs: 30 * 60_000 };
  }
  let value: unknown;
  let failed = false;
  try {
    const token = await googleToken();
    const range = { startDate: days[0], endDate: days.at(-1), dataState: 'all' };
    const [byDate, queries, pages, countries] = await Promise.all([
      gscQuery(token, { ...range, dimensions: ['date'], rowLimit: 500 }),
      gscQuery(token, { ...range, dimensions: ['query'], rowLimit: 10 }),
      gscQuery(token, { ...range, dimensions: ['page'], rowLimit: 10 }),
      gscQuery(token, { ...range, dimensions: ['country'], rowLimit: 40 }),
    ]);
    const byDay = new Map(byDate.rows.map((r) => [r.keys?.[0] ?? '', r]));
    // Google reports Pacific dates and omits dates with no available rows. Absence never proves a zero.
    const firstIncompleteDate = byDate.firstIncompleteDate;
    const missingDays = days.filter((d) => !byDay.has(d));
    const incompleteDays = firstIncompleteDate ? days.filter((d) => d >= firstIncompleteDate) : [];
    const clicks = days.map((d) => byDay.get(d)?.clicks ?? null);
    const impressions = days.map((d) => byDay.get(d)?.impressions ?? null);
    const totalClicks = byDate.rows.reduce((a, r) => a + r.clicks!, 0), totalImpressions = byDate.rows.reduce((a, r) => a + r.impressions!, 0);
    const weighted = byDate.rows.reduce((a, r) => a + (r.position ?? 0) * r.impressions!, 0);
    const covered = days.filter((d) => byDay.has(d));
    value = {
      configured: true, site: GSC_SITE(), days, clicks, impressions, fetchedAt: new Date().toISOString(), cacheTtlMs: 30 * 60_000,
      timeZone: 'America/Los_Angeles', firstIncompleteDate, incompleteDays, missingDays,
      partial: missingDays.length > 0 || incompleteDays.length > 0, coveredFrom: covered[0] ?? null, coveredTo: covered.at(-1) ?? null,
      totals: byDate.rows.length ? { clicks: totalClicks, impressions: totalImpressions, ctr: totalImpressions ? totalClicks / totalImpressions : 0, position: totalImpressions ? weighted / totalImpressions : null } : null,
      topQueries: queries.rows.map((r) => ({ query: r.keys?.[0] ?? '', clicks: r.clicks!, impressions: r.impressions!, ctr: r.ctr ?? 0, position: r.position ?? null })),
      topPages: pages.rows.map((r) => ({ page: r.keys?.[0] ?? '', clicks: r.clicks!, impressions: r.impressions! })),
      byCountry: countries.rows.flatMap((r) => { const country = fromAlpha3(r.keys?.[0]); return country ? [{ country, clicks: r.clicks!, impressions: r.impressions! }] : []; }),
    };
  } catch (e) {
    value = { configured: true, error: e instanceof Error ? e.message : 'searchconsole unavailable' };
    failed = true;
  }
  gscCache.set(key, { at: Date.now(), value, failed });
  return value;
}

// ---------------- unit economics ----------------
interface EconomicsRaw {
  days: number; since: string;
  revenue: {
    grossUsd: number; netUsd: number; refundsUsd: number; newPaying: number; payersEver?: number; payingInPeriod?: number; purchasesSince?: string | null;
    unverifiedGrossUsd?: number;
    unattributedGrossUsd?: number | null; unattributedRefundsUsd?: number | null; unattributedNetUsd?: number | null;
    unattributedEvents?: number | null; unconvertedEvents?: number | null; revenueScope?: string | null;
    initialPurchases30d: number; expirations30d: number; lastPriceUsd: number | null; takehome: number | null;
  };
  costs: { marketingUsd: number; infraUsd: number; otherUsd: number; entries?: number; byChannel: Array<{ channel: string; usd: number }> };
  // `paidVerified`: live subscriptions with a verified production charge (the only ones in MRR); `active` carries the
  // same count since the r2 migration and is the fallback for an older server.
  subscriptions: { active?: number; paidVerified?: number; unverified?: number; test?: number; sandbox?: number; live?: number; trialing?: number };
  newAccounts: number; activeReaders30d: number; activeReaders30dAll?: number; llmUsd: number; llm30dUsd: number;
  assumptions: { monthlyChurn?: number; priceUsd?: number; storeFee?: number; maxLifetimeMonths?: number };
}
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
/** Absent and malformed are unknown (null); 0 is a value. Never `||` on a number: it turns a real 0 into the default. */
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const round = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** CAC, LTV and ROI from the raw sums. Every input is returned so the dashboard can show the formula. */
export function unitEconomics(raw: EconomicsRaw) {
  const a = raw.assumptions ?? {};
  const subs = raw.subscriptions ?? {};
  const lastPrice = numOrNull(raw.revenue.lastPriceUsd), assumedPrice = numOrNull(a.priceUsd);
  const priceSource = lastPrice !== null && lastPrice > 0 ? 'observed' : assumedPrice !== null && assumedPrice > 0 ? 'assumed' : 'default';
  const priceUsd = priceSource === 'observed' ? lastPrice! : priceSource === 'assumed' ? assumedPrice! : 4.99;
  // A saved 0% fee is a real choice (a web sale with no store): only an absent value falls back to 15%.
  const storeFee = numOrNull(a.storeFee);
  const fee = storeFee !== null && storeFee >= 0 && storeFee <= 1 ? storeFee : 0.15;
  // An observed take-home of 0 is respected too (F12): only absent or out of range falls back to 1 - fee.
  const observedTakehome = numOrNull(raw.revenue.takehome);
  const takehome = observedTakehome !== null && observedTakehome >= 0 && observedTakehome <= 1 ? observedTakehome : 1 - fee;
  const payersEver = n(raw.revenue.payersEver);
  // MRR counts verified payers only: "Pro sin verificar" and "Pro de prueba" keep access but are not revenue.
  const paidSent = numOrNull(subs.paidVerified) ?? numOrNull(subs.active);
  const paidVerified = paidSent ?? 0;
  // Monthly churn: expirations in the last 30 days over the subscriptions alive at its start, once there are
  // enough of them to mean something; until then the owner's assumption (default 10%).
  const base = paidVerified + n(raw.revenue.expirations30d) - n(raw.revenue.initialPurchases30d);
  const observed = base >= 5 ? n(raw.revenue.expirations30d) / base : null;
  const assumedChurn = numOrNull(a.monthlyChurn);
  const monthlyChurn = observed ?? (assumedChurn !== null && assumedChurn > 0 ? assumedChurn : 0.1);
  const churnSource = observed !== null ? 'observed' : assumedChurn !== null && assumedChurn > 0 ? 'assumed' : 'default';
  // The ledger carries no account (the team's reads are in it): divide by every active reader, the team included.
  const readers30 = numOrNull(raw.activeReaders30dAll) ?? numOrNull(raw.activeReaders30d) ?? 0;
  const llmPerActiveReader = readers30 > 0 ? n(raw.llm30dUsd) / readers30 : 0;
  const monthlyContribution = priceUsd * takehome - llmPerActiveReader;
  const cap = numOrNull(a.maxLifetimeMonths);
  const lifetimeMonths = Math.min(1 / Math.max(monthlyChurn, 0.0001), cap !== null && cap > 0 ? cap : 36);
  const ltv = monthlyContribution * lifetimeMonths;
  const marketing = n(raw.costs.marketingUsd);
  const newPaying = n(raw.revenue.newPaying);
  const cacPerPaying = newPaying > 0 ? marketing / newPaying : null;
  const cacPerAccount = n(raw.newAccounts) > 0 ? marketing / n(raw.newAccounts) : null;
  const totalCosts = marketing + n(raw.costs.infraUsd) + n(raw.costs.otherUsd) + n(raw.llmUsd);
  const profit = n(raw.revenue.netUsd) - totalCosts;
  const purchasesSince = typeof raw.revenue.purchasesSince === 'string' ? raw.revenue.purchasesSince : null;
  return {
    days: raw.days, since: raw.since,
    revenue: {
      grossUsd: round(n(raw.revenue.grossUsd)), netUsd: round(n(raw.revenue.netUsd)), refundsUsd: round(n(raw.revenue.refundsUsd)),
      // Store money of accounts that are not verified payers (inside grossUsd); unknown on an older server.
      unverifiedGrossUsd: round(numOrNull(raw.revenue.unverifiedGrossUsd)),
      unattributedGrossUsd: round(numOrNull(raw.revenue.unattributedGrossUsd)),
      unattributedRefundsUsd: round(numOrNull(raw.revenue.unattributedRefundsUsd)), unattributedNetUsd: round(numOrNull(raw.revenue.unattributedNetUsd)),
      unattributedEvents: numOrNull(raw.revenue.unattributedEvents), unconvertedEvents: numOrNull(raw.revenue.unconvertedEvents),
      revenueScope: typeof raw.revenue.revenueScope === 'string' ? raw.revenue.revenueScope : null,
      mrrGrossUsd: paidSent === null ? null : round(paidVerified * priceUsd), mrrNetUsd: paidSent === null ? null : round(paidVerified * priceUsd * takehome),
      activeSubscriptions: paidVerified, paidVerified,
      // Counts an older server does not send stay null (unknown), never 0.
      unverifiedSubscriptions: numOrNull(subs.unverified), testSubscriptions: numOrNull(subs.test ?? subs.sandbox), liveSubscriptions: numOrNull(subs.live),
      trialing: n(subs.trialing), newPaying, payingInPeriod: numOrNull(raw.revenue.payingInPeriod), payersEver, priceUsd, takehome, priceSource,
      // When the first purchase event of any environment arrived: before it, revenue is not measured (not $0).
      purchasesSince, measured: purchasesSince !== null,
    },
    costs: {
      marketingUsd: round(marketing), infraUsd: round(n(raw.costs.infraUsd)), otherUsd: round(n(raw.costs.otherUsd)),
      llmUsd: round(n(raw.llmUsd), 4), totalUsd: round(totalCosts), byChannel: (raw.costs.byChannel ?? []).map((c) => ({ channel: c.channel, usd: round(n(c.usd)) })),
      // Only the AI ledger is recorded automatically; the rest exists once the owner enters it.
      manualEntries: n(raw.costs.entries), coverage: 'recorded_only' as const, complete: false,
    },
    acquisition: { newAccounts: n(raw.newAccounts), newPaying, cacPerAccount: round(cacPerAccount), cacPerPaying: round(cacPerPaying) },
    ltv: {
      monthlyNetPerSubUsd: round(priceUsd * takehome), monthlyLlmPerUserUsd: round(llmPerActiveReader, 4), monthlyContributionUsd: round(monthlyContribution),
      monthlyChurn: round(monthlyChurn, 4), churnSource, lifetimeMonths: round(lifetimeMonths, 1), ltvUsd: round(ltv),
      // No account has ever paid (verified): the LTV is a scenario built from the price and churn above, not an observation.
      scenario: payersEver === 0,
      ltvToCac: cacPerPaying ? round(ltv / cacPerPaying) : null,
      paybackMonths: cacPerPaying && monthlyContribution > 0 ? round(cacPerPaying / monthlyContribution, 1) : null,
    },
    roi: { profitUsd: round(profit), roi: totalCosts > 0 ? round(profit / totalCosts, 4) : null, coverage: 'recorded_only' as const },
    assumptions: { monthlyChurn: numOrNull(a.monthlyChurn), priceUsd: numOrNull(a.priceUsd), storeFee: numOrNull(a.storeFee), maxLifetimeMonths: numOrNull(a.maxLifetimeMonths) },
  };
}

// Where the audience is: web devices by country/region (first-party), iOS downloads by storefront (App Store),
// Google search by country (Search Console) and purchases by store country. Age and gender have no source yet.
export async function audienceView(days: number, internal = false) {
  const geo = await observeAdminSource('audience', () => rpc<{ since: string }>('bobby_admin_geo', { p_days: days, p_internal: internal }), true);
  deferAdminSources('appStore', 'searchConsole');
  return { geo, searchConsole: null, appStore: null };
}

/** Unmeasured client steps remain explicitly unavailable, including native paywall/render/crash telemetry. */
export const INSTRUMENTATION = { webVisits: true, webPaywall: true, iosVisits: false, iosOpens: true, iosPaywall: false, purchaseStart: false, deskOutcomes: true };

export async function lifecycleView(days: number, internal = false) {
  const raw = await observeAdminSource('lifecycle', () => rpc<EconomicsRaw>('bobby_admin_economics', { p_days: days, p_internal: internal }), true);
  deferAdminSources('appStore', 'searchConsole');
  return { economics: unitEconomics(raw!), searchConsole: null, appStore: null, instrumentation: INSTRUMENTATION };
}

export function adminDays(days: number): string[] {
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => new Date(end.getTime() - (days - i - 1) * 86_400_000).toISOString().slice(0, 10));
}

/** Shared diagnosis inputs for the panel, digest and plan. GET coreOnly avoids delayed external providers. */
export async function overviewBundle(days: number, internal: boolean, apple: AppleLoad = {}) {
  const [overview, growth, networks] = await Promise.all([
    observeAdminSource('overview', () => rpc<{ days: string[] } & Record<string, unknown>>('bobby_admin_overview', { p_days: days, p_internal: internal }), true),
    observeAdminSource('growth', () => rpc<Record<string, unknown>>('bobby_admin_growth', { p_days: days, p_internal: internal })),
    observeAdminSource('networks', () => rpc<unknown[]>('bobby_admin_internal_networks', {})),
  ]);
  let integ: Awaited<ReturnType<typeof integrations>> | null = null;
  let search: unknown = null;
  if (apple.coreOnly) deferAdminSources('appStore', 'revenuecat', 'searchConsole', 'health');
  else {
    [integ, search] = await Promise.all([
      integrations(overview!.days ?? adminDays(days), apple),
      observeAdminSource('searchConsole', () => searchConsole(overview!.days ?? adminDays(days))),
    ]);
  }
  const missing = [...(growth == null ? ['growth'] : []), ...(networks == null ? ['networks'] : [])];
  // Operational evidence remains useful when cohorts fail; the bundle identifies the incomplete diagnosis.
  const diagnosis = buildInsights({ days, overview, growth, integrations: integ, searchConsole: search, networks, includeInternal: internal });
  const insights = growth == null ? diagnosis.filter((finding) => finding.area === 'operacion') : diagnosis;
  return { overview, integrations: integ ?? { llmCaps: llmCaps(), paywall: paywallOn() }, growth, searchConsole: search, networks, insights, missing };
}

export async function providerBundle(days: number) {
  const range = adminDays(days);
  const [integ, search] = await Promise.all([
    integrations(range),
    observeAdminSource('searchConsole', () => searchConsole(range)),
  ]);
  const meta = adminReadMeta();
  markAdminSource('health', { status: Object.entries(meta.sources).some(([name, source]) => !['appStore', 'revenuecat', 'searchConsole', 'teamExclusion'].includes(name) && source.status === 'error') ? 'partial' : 'ok', fetchedAt: new Date().toISOString() });
  return { integrations: integ, searchConsole: search ?? { configured: Boolean(process.env.GSC_SERVICE_ACCOUNT_JSON?.trim()), error: 'source_unavailable' } };
}

// ---------------- costs and assumptions ----------------
export async function costsView() {
  return { costs: (await rest<unknown[]>('bobby_costs?select=*&order=spent_on.desc,id.desc&limit=200')) ?? [] };
}

export async function addCost(body: Record<string, unknown>) {
  const kind = body.kind === 'marketing' || body.kind === 'infra' || body.kind === 'other' ? body.kind : null;
  const amount = Number(body.amountUsd);
  const channel = typeof body.channel === 'string' && body.channel.trim() ? body.channel.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32) : null;
  const spentOn = typeof body.spentOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.spentOn) ? body.spentOn : new Date().toISOString().slice(0, 10);
  if (!kind || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new AdminError(400, 'Invalid cost.');
  if (spentOn > new Date().toISOString().slice(0, 10)) throw new AdminError(400, 'The date cannot be in the future (UTC).');
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 160) : null;
  const rows = await rest<unknown[]>('bobby_costs', { method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ kind, channel, amount_usd: Math.round(amount * 100) / 100, spent_on: spentOn, note }) });
  return rows?.[0] ?? null;
}

export async function deleteCost(id: unknown) {
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) throw new AdminError(400, 'Invalid cost.');
  const rows = await rest<unknown[]>(`bobby_costs?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
  if (!rows?.length) throw new AdminError(404, 'Cost not found.');
  return rows[0];
}

export async function setAssumptions(body: Record<string, unknown>) {
  // Merge: a field that is absent keeps its value; null or '' clears it (back to the server default).
  const current = await rest<Array<{ value: Record<string, number> }>>('bobby_admin_settings?key=eq.unit_economics&select=value').catch(() => null);
  const value: Record<string, number> = { ...(current?.[0]?.value ?? {}) };
  const opt = (k: string, min: number, max: number) => {
    if (!(k in body)) return;
    const v = body[k];
    if (v === null || v === undefined || v === '') { delete value[k]; return; }
    const x = Number(v);
    if (!Number.isFinite(x) || x < min || x > max) throw new AdminError(400, `Invalid ${k}.`);
    value[k] = x;
  };
  opt('monthlyChurn', 0.001, 1); opt('priceUsd', 0.5, 1000); opt('storeFee', 0, 0.5); opt('maxLifetimeMonths', 1, 120);
  await rest('bobby_admin_settings?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key: 'unit_economics', value, updated_at: new Date().toISOString() }) });
  return value;
}
