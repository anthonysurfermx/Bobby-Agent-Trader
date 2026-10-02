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
import { callerHash, deviceHash, paywallOn } from './access.js';
import { countryCode, fromAlpha3 } from './geo.js';

const TIMEOUT = 6000;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(bobbyRest(path), { ...init, headers: { ...bobbyServiceHeaders(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new AdminError(r.status === 409 ? 409 : r.status === 400 ? 400 : 502, r.status === 400 ? 'Invalid request.' : `storage ${r.status}`);
  return (r.status === 204 ? null : await r.json().catch(() => null)) as T;
}
export async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return rest<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
}

/** Exact row count of a PostgREST query (Content-Range), without reading the rows. */
async function countRows(path: string): Promise<number | null> {
  try {
    const r = await fetch(bobbyRest(path), { headers: { ...bobbyServiceHeaders(), Prefer: 'count=exact', Range: '0-0' }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok && r.status !== 206) return null;
    const total = Number((r.headers.get('content-range') ?? '').split('/')[1]);
    return Number.isFinite(total) ? total : null;
  } catch { return null; }
}

export class AdminError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** The signed-in admin, or null after answering 401 / 403 / 503. */
export async function requireAdmin(req: VercelRequest, res: VercelResponse): Promise<Identity | null> {
  const identity = await requireIdentity(req, res);
  if (!identity) return null;
  if (identity.via !== 'supabase' || !identity.authUserId) { res.status(403).json({ error: 'not_admin' }); return null; }
  try {
    const rows = await rest<Array<{ identity_id: string }>>(`bobby_admins?identity_id=eq.${identity.id}&select=identity_id`);
    if (!rows?.length) { res.status(403).json({ error: 'not_admin' }); return null; }
    // The browser and the address used for /admin are the team's own traffic: the dashboard leaves them out.
    // Awaited, not deferred: the very first view from a new browser must already exclude that browser.
    const device = deviceHash(req), network = callerHash(req);
    if (device || network) await rpc('bobby_mark_admin_session', { p_device: device, p_network: network }).catch(() => null);
    return identity;
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
  const [couponsTotal, redemptionsTotal] = await Promise.all([countRows('bobby_coupons?select=code'), countRows('bobby_coupon_redemptions?select=id')]);
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
  return { actions: (rows ?? []).map(({ admin, ...a }) => ({ ...a, admin_email: admin?.email ?? null })), total: await countRows('bobby_admin_actions?select=id') };
}

export async function membersView() {
  return rpc<{ subscriptions: unknown[]; grants: unknown[] }>('bobby_admin_members', {});
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

export async function grant(body: Record<string, unknown>) {
  const row = await identityRow(body.identityId);
  const gift = { p_reads: int(body.reads, 1000), p_profundo: int(body.profundo, 200), p_maximo: int(body.maximo, 100), p_pro_days: int(body.proDays, 366) };
  if (gift.p_reads + gift.p_profundo + gift.p_maximo + gift.p_pro_days === 0) throw new AdminError(400, 'Choose at least one gift.');
  const result = await rpc<{ ok: boolean; error?: string }>('bobby_admin_grant', { p_identity: row.id, ...gift });
  if (!result?.ok) throw new AdminError(404, 'Account not found.');
  return { target: row.email || row.id, result };
}

/** The account deletion of api/account.ts, without the user's Apple authorization code (revocation is manual). */
export async function deleteUser(admin: Identity, body: Record<string, unknown>) {
  const row = await identityRow(body.identityId);
  if (row.id === admin.id) throw new AdminError(400, 'You cannot delete your own account from here.');
  const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : '';
  // Apple accounts that hide their email are confirmed by their id.
  if (confirm !== (row.email || row.id).toLowerCase()) throw new AdminError(400, 'Type the account email to confirm.');
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
  return { target: row.email || row.id };
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
let rcCache: { at: number; value: { configured: boolean; error?: string; metrics?: Metric[]; fetchedAt?: string } } | null = null;

async function revenueCatMetrics() {
  const key = process.env.REVENUECAT_V2_SECRET_KEY?.trim();
  if (!key) return { configured: false };
  if (rcCache && Date.now() - rcCache.at < (rcCache.value.error ? 60_000 : 5 * 60_000)) return rcCache.value;
  const get = async (path: string) => {
    const r = await fetch(`https://api.revenuecat.com/v2${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`revenuecat ${r.status}`);
    return r.json() as Promise<Record<string, unknown>>;
  };
  let value: { configured: boolean; error?: string; metrics?: Metric[]; fetchedAt?: string };
  try {
    let project = process.env.REVENUECAT_PROJECT_ID?.trim();
    if (!project) {
      const list = await get('/projects');
      project = ((list.items as Array<{ id?: string }> | undefined) ?? [])[0]?.id;
      if (!project) throw new Error('revenuecat no project');
    }
    const overview = await get(`/projects/${encodeURIComponent(project)}/metrics/overview`);
    const metrics = ((overview.metrics as Array<Record<string, unknown>> | undefined) ?? []).map((m) => ({
      id: String(m.id ?? ''), name: String(m.name ?? m.id ?? ''), value: Number(m.value ?? 0),
      unit: typeof m.unit === 'string' ? m.unit : undefined, period: typeof m.period === 'string' ? m.period : undefined,
      description: typeof m.description === 'string' ? m.description.slice(0, 80) : undefined,
      updatedAt: typeof m.last_updated_at_iso8601 === 'string' ? m.last_updated_at_iso8601 : typeof m.last_updated_at === 'number' ? new Date(m.last_updated_at).toISOString() : undefined,
    }));
    value = { configured: true, metrics, fetchedAt: new Date().toISOString() };
  } catch (e) {
    value = { configured: true, error: e instanceof Error ? e.message : 'revenuecat unavailable' };
  }
  rcCache = { at: Date.now(), value };
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
  const [type, units, apple, parent, country] = [at('Product Type Identifier'), at('Units'), at('Apple Identifier'), at('Parent Identifier'), at('Country Code')];
  if (type < 0 || units < 0 || apple < 0) throw new Error('appstore report unreadable');
  for (const line of lines) {
    const f = line.split('\t');
    const t = (f[type] ?? '').trim(); const n = Number(f[units]) || 0;
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

async function salesDay(date: string, token: string): Promise<SalesDay | null> {
  const key = `asc-sales-v2:${date}`;   // v2 adds downloads by country
  const cached = await rest<Array<{ payload: SalesDay }>>(`api_cache?cache_key=eq.${encodeURIComponent(key)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=payload`).catch(() => null);
  if (cached?.[0]?.payload) return cached[0].payload;
  const params = new URLSearchParams({
    'filter[frequency]': 'DAILY', 'filter[reportDate]': date, 'filter[reportSubType]': 'SUMMARY',
    'filter[reportType]': 'SALES', 'filter[vendorNumber]': ascVendor(), 'filter[version]': '1_1',
  });
  const r = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' }, signal: AbortSignal.timeout(10000) });
  let day: SalesDay;
  // 404: no sales that day — or, for the last days, a report Apple has not published yet (pending, never a zero).
  const recent = Date.now() - new Date(`${date}T00:00:00Z`).getTime() <= 3 * 86_400_000;
  if (r.status === 404) day = { downloads: 0, redownloads: 0, updates: 0, iap: 0, countries: {}, ...(recent ? { pending: true } : {}) };
  else if (!r.ok) throw new Error(`appstore ${r.status}`);
  else day = parseSalesReport(gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'), APP_ID());
  // Settled days keep a year; the last two days are re-read (Apple publishes with a delay).
  const settled = Date.now() - new Date(`${date}T00:00:00Z`).getTime() > 3 * 86_400_000;
  const expires = new Date(Date.now() + (settled ? 365 : r.status === 404 ? 0.25 : 1) * 86_400_000).toISOString();
  await rest('api_cache?on_conflict=cache_key', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ cache_key: key, payload: day, expires_at: expires, updated_at: new Date().toISOString() }),
  }).catch(() => null);
  return day;
}

async function appStoreSales(days: string[]) {
  if (!ascConfigured()) return { configured: false };
  try {
    const token = ascToken();
    // Apple's daily reports cover days that ended in its time zone: skip today.
    const today = new Date().toISOString().slice(0, 10);
    const wanted = days.filter((d) => d < today).slice(-90);
    const results = new Map<string, SalesDay>();
    for (let i = 0; i < wanted.length; i += 5) {
      const batch = wanted.slice(i, i + 5);
      const got = await Promise.all(batch.map((d) => salesDay(d, token)));
      batch.forEach((d, j) => { if (got[j]) results.set(d, got[j]!); });
    }
    const totals = { downloads: 0, redownloads: 0, updates: 0, iap: 0 };
    const countries = new Map<string, number>();
    const pendingDays = [...results.entries()].filter(([, v]) => v.pending).map(([d]) => d);
    const reported = [...results.entries()].filter(([, v]) => !v.pending).map(([d]) => d).sort();
    for (const v of results.values()) {
      totals.downloads += v.downloads; totals.redownloads += v.redownloads; totals.updates += v.updates; totals.iap += v.iap;
      for (const [cc, n] of Object.entries(v.countries ?? {})) countries.set(cc, (countries.get(cc) ?? 0) + n);
    }
    const byCountry = [...countries].map(([country, downloads]) => ({ country, downloads })).sort((a, b) => b.downloads - a.downloads || a.country.localeCompare(b.country)).slice(0, 40);
    return { configured: true, days, downloads: days.map((d) => results.get(d)?.downloads ?? 0), totals, byCountry,
      coveredFrom: reported[0] ?? null, coveredTo: reported.at(-1) ?? null, pendingDays, excludedToday: today };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : 'appstore unavailable' };
  }
}

async function latest(path: string): Promise<string | null> {
  const rows = await rest<Array<Record<string, string>>>(path).catch(() => null);
  const row = rows?.[0];
  return row ? Object.values(row)[0] ?? null : null;
}

export async function integrations(days: string[]) {
  // (Search Console is read by the lifecycle view, at the top of the web funnel.)
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since24 = new Date(Date.now() - 86_400_000).toISOString();
  const [revenuecat, appStore, spend, webhookLast, webhook30d, stripeLast, trackLast, track24h, trackHealth, readsLast] = await Promise.all([
    revenueCatMetrics(), appStoreSales(days), llmSpend(),
    latest('bobby_purchase_events?select=created_at&store=neq.STRIPE&order=created_at.desc&limit=1'),
    countRows(`bobby_purchase_events?select=id&store=neq.STRIPE&created_at=gte.${encodeURIComponent(since30)}`),
    latest('bobby_purchase_events?select=created_at&store=eq.STRIPE&order=created_at.desc&limit=1'),
    latest('bobby_events?select=created_at&event=eq.visit&order=created_at.desc&limit=1'),
    countRows(`bobby_events?select=id&event=eq.visit&created_at=gte.${encodeURIComponent(since24)}`),
    rest<Array<{ payload: { lastErrorAt?: string; error?: string } }>>('api_cache?cache_key=eq.track-health&select=payload').catch(() => null),
    latest('bobby_reads?select=created_at&order=created_at.desc&limit=1'),
  ]);
  const missing = [
    ...(process.env.REVENUECAT_V2_SECRET_KEY?.trim() ? [] : ['REVENUECAT_V2_SECRET_KEY']),
    ...(ascKeyId() ? [] : ['ASC_KEY_ID']), ...(ascIssuer() ? [] : ['ASC_ISSUER_ID']),
    ...(process.env.ASC_PRIVATE_KEY?.trim() ? [] : ['ASC_PRIVATE_KEY']), ...(ascVendor() ? [] : ['ASC_VENDOR_NUMBER']),
    ...(process.env.GSC_SERVICE_ACCOUNT_JSON?.trim() ? [] : ['GSC_SERVICE_ACCOUNT_JSON']),
  ];
  const has = (k: string) => Boolean(process.env[k]?.trim());
  missing.push(...['REVENUECAT_SECRET_KEY', 'REVENUECAT_WEBHOOK_AUTH', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'].filter((k) => !has(k)));
  const stripe = { configured: has('STRIPE_SECRET_KEY') && has('STRIPE_PRICE_ID'), webhook: has('STRIPE_WEBHOOK_SECRET'), lastEventAt: stripeLast };
  return {
    revenuecat, appStore, llmCaps: llmCaps(), paywall: paywallOn(), missing,
    // The spend guard's own figures: desk only, UTC calendar day and month (what the caps are compared to).
    llmGuard: spend ? { dayUsd: spend.day, monthUsd: spend.month } : null,
    health: {
      // Configured = the secrets exist; delivery is only proven by events arriving.
      revenuecatWebhook: { configured: has('REVENUECAT_SECRET_KEY') && has('REVENUECAT_WEBHOOK_AUTH'), lastEventAt: webhookLast, events30d: webhook30d },
      stripe,
      tracking: { lastEventAt: trackLast, events24h: track24h, lastErrorAt: trackHealth?.[0]?.payload?.lastErrorAt ?? null, lastError: trackHealth?.[0]?.payload?.error ?? null, lastReadAt: readsLast },
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
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(TIMEOUT),
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64(sig)}` }),
  });
  if (!r.ok) throw new Error(`searchconsole token ${r.status}`);
  const t = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!t.access_token) throw new Error('searchconsole token missing');
  gscToken = { value: t.access_token, until: Date.now() + (t.expires_in ?? 3600) * 1000 };
  return t.access_token;
}

type GscRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
async function gscQuery(token: string, body: Record<string, unknown>): Promise<GscRow[]> {
  const r = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(GSC_SITE())}/searchAnalytics/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) {
    // Google's machine reason (SERVICE_DISABLED, forbidden…) tells setup problems apart; it carries no secrets.
    const err = (await r.json().catch(() => null)) as { error?: { status?: string; errors?: Array<{ reason?: string }>; details?: Array<{ reason?: string }> } } | null;
    const reason = err?.error?.details?.find((d) => d.reason)?.reason ?? err?.error?.errors?.[0]?.reason ?? err?.error?.status;
    throw new Error(`searchconsole ${r.status}${reason ? ` ${String(reason).slice(0, 40)}` : ''}`);
  }
  return ((await r.json()) as { rows?: GscRow[] }).rows ?? [];
}

export async function searchConsole(days: string[]) {
  if (!process.env.GSC_SERVICE_ACCOUNT_JSON?.trim()) return { configured: false };
  if (!days.length) return { configured: true, days, clicks: [], impressions: [] };
  const key = `${days[0]}:${days.at(-1)}`;
  const hit = gscCache.get(key);
  // A failure is retried after a minute so a fixed setup (API enabled, user added) shows up quickly.
  if (hit && Date.now() - hit.at < (hit.failed ? 60_000 : 30 * 60_000)) return hit.value;
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
    const byDay = new Map(byDate.map((r) => [r.keys?.[0] ?? '', r]));
    const clicks = days.map((d) => byDay.get(d)?.clicks ?? 0);
    const impressions = days.map((d) => byDay.get(d)?.impressions ?? 0);
    const totalClicks = clicks.reduce((a, b) => a + b, 0), totalImpressions = impressions.reduce((a, b) => a + b, 0);
    const weighted = byDate.reduce((a, r) => a + (r.position ?? 0) * (r.impressions ?? 0), 0);
    value = {
      configured: true, site: GSC_SITE(), days, clicks, impressions,
      totals: { clicks: totalClicks, impressions: totalImpressions, ctr: totalImpressions ? totalClicks / totalImpressions : 0, position: totalImpressions ? weighted / totalImpressions : null },
      topQueries: queries.map((r) => ({ query: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r.ctr ?? 0, position: r.position ?? null })),
      topPages: pages.map((r) => ({ page: r.keys?.[0] ?? '', clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 })),
      byCountry: countries.flatMap((r) => { const country = fromAlpha3(r.keys?.[0]); return country ? [{ country, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0 }] : []; }),
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
  revenue: { grossUsd: number; netUsd: number; refundsUsd: number; newPaying: number; payersEver?: number; initialPurchases30d: number; expirations30d: number; lastPriceUsd: number | null; takehome: number | null };
  costs: { marketingUsd: number; infraUsd: number; otherUsd: number; entries?: number; byChannel: Array<{ channel: string; usd: number }> };
  subscriptions: { active: number; trialing?: number }; newAccounts: number; activeReaders30d: number; activeReaders30dAll?: number; llmUsd: number; llm30dUsd: number;
  assumptions: { monthlyChurn?: number; priceUsd?: number; storeFee?: number; maxLifetimeMonths?: number };
}
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const round = (v: number | null, digits = 2) => (v === null || !Number.isFinite(v) ? null : Math.round(v * 10 ** digits) / 10 ** digits);

/** CAC, LTV and ROI from the raw sums. Every input is returned so the dashboard can show the formula. */
export function unitEconomics(raw: EconomicsRaw) {
  const a = raw.assumptions ?? {};
  const priceUsd = n(raw.revenue.lastPriceUsd) || n(a.priceUsd) || 4.99;
  // A saved 0% fee is a real choice (a web sale with no store): only an absent value falls back to 15%.
  const fee = typeof a.storeFee === 'number' && Number.isFinite(a.storeFee) ? a.storeFee : 0.15;
  const takehome = n(raw.revenue.takehome) || 1 - fee;
  const payersEver = n(raw.revenue.payersEver);
  const activeSubs = n(raw.subscriptions.active);
  // Monthly churn: expirations in the last 30 days over the subscriptions alive at its start, once there are
  // enough of them to mean something; until then the owner's assumption (default 10%).
  const base = activeSubs + n(raw.revenue.expirations30d) - n(raw.revenue.initialPurchases30d);
  const observed = base >= 5 ? n(raw.revenue.expirations30d) / base : null;
  const monthlyChurn = observed ?? (n(a.monthlyChurn) > 0 ? n(a.monthlyChurn) : 0.1);
  const churnSource = observed !== null ? 'observed' : n(a.monthlyChurn) > 0 ? 'assumed' : 'default';
  // The ledger carries no account (the team's reads are in it): divide by every active reader, the team included.
  const readers30 = n(raw.activeReaders30dAll) || n(raw.activeReaders30d);
  const llmPerActiveReader = readers30 > 0 ? n(raw.llm30dUsd) / readers30 : 0;
  const monthlyContribution = priceUsd * takehome - llmPerActiveReader;
  const lifetimeMonths = Math.min(1 / Math.max(monthlyChurn, 0.0001), n(a.maxLifetimeMonths) || 36);
  const ltv = monthlyContribution * lifetimeMonths;
  const marketing = n(raw.costs.marketingUsd);
  const cacPerPaying = n(raw.revenue.newPaying) > 0 ? marketing / n(raw.revenue.newPaying) : null;
  const cacPerAccount = n(raw.newAccounts) > 0 ? marketing / n(raw.newAccounts) : null;
  const totalCosts = marketing + n(raw.costs.infraUsd) + n(raw.costs.otherUsd) + n(raw.llmUsd);
  const profit = n(raw.revenue.netUsd) - totalCosts;
  return {
    days: raw.days, since: raw.since,
    revenue: {
      grossUsd: round(n(raw.revenue.grossUsd)), netUsd: round(n(raw.revenue.netUsd)), refundsUsd: round(n(raw.revenue.refundsUsd)),
      mrrGrossUsd: round(activeSubs * priceUsd), mrrNetUsd: round(activeSubs * priceUsd * takehome),
      activeSubscriptions: activeSubs, trialing: n(raw.subscriptions.trialing), newPaying: n(raw.revenue.newPaying), payersEver, priceUsd, takehome,
      priceSource: n(raw.revenue.lastPriceUsd) ? 'observed' : n(a.priceUsd) ? 'assumed' : 'default',
    },
    costs: {
      marketingUsd: round(marketing), infraUsd: round(n(raw.costs.infraUsd)), otherUsd: round(n(raw.costs.otherUsd)),
      llmUsd: round(n(raw.llmUsd), 4), totalUsd: round(totalCosts), byChannel: (raw.costs.byChannel ?? []).map((c) => ({ channel: c.channel, usd: round(n(c.usd)) })),
      // Only the AI ledger is recorded automatically; the rest exists once the owner enters it.
      manualEntries: n(raw.costs.entries),
    },
    acquisition: { newAccounts: n(raw.newAccounts), newPaying: n(raw.revenue.newPaying), cacPerAccount: round(cacPerAccount), cacPerPaying: round(cacPerPaying) },
    ltv: {
      monthlyNetPerSubUsd: round(priceUsd * takehome), monthlyLlmPerUserUsd: round(llmPerActiveReader, 4), monthlyContributionUsd: round(monthlyContribution),
      monthlyChurn: round(monthlyChurn, 4), churnSource, lifetimeMonths: round(lifetimeMonths, 1), ltvUsd: round(ltv),
      // No account has ever paid: the LTV is a scenario built from the price and churn above, not an observation.
      scenario: payersEver === 0,
      ltvToCac: cacPerPaying ? round(ltv / cacPerPaying) : null,
      paybackMonths: cacPerPaying && monthlyContribution > 0 ? round(cacPerPaying / monthlyContribution, 1) : null,
    },
    roi: { profitUsd: round(profit), roi: totalCosts > 0 ? round(profit / totalCosts, 4) : null },
    assumptions: { monthlyChurn: n(a.monthlyChurn) || null, priceUsd: n(a.priceUsd) || null, storeFee: typeof a.storeFee === 'number' ? a.storeFee : null, maxLifetimeMonths: n(a.maxLifetimeMonths) || null },
  };
}

const daysFrom = (since: string) => {
  const out: string[] = [];
  const start = new Date(since); start.setUTCHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= Date.now(); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

// Where the audience is: web devices by country/region (first-party), iOS downloads by storefront (App Store),
// Google search by country (Search Console) and purchases by store country. Age and gender have no source yet.
export async function audienceView(days: number, internal = false) {
  const geo = await rpc<{ since: string }>('bobby_admin_geo', { p_days: days, p_internal: internal });
  const list = daysFrom(geo.since);
  const [search, appStore] = await Promise.all([searchConsole(list), appStoreSales(list)]);
  const pick = (v: unknown, key: string) => {
    const o = (v ?? {}) as Record<string, unknown>;
    return { configured: Boolean(o.configured), error: typeof o.error === 'string' ? o.error : null, [key]: Array.isArray(o.byCountry) ? o.byCountry : null };
  };
  return { geo, searchConsole: pick(search, 'countries'), appStore: pick(appStore, 'countries') };
}

/** What the shipped clients report: a zero on an uninstrumented step means "not measured", not "nobody". The desk
 *  outcomes (delivered, walls, blocks) come from the server for every client since the 20261001230000 deploy. */
export const INSTRUMENTATION = { webVisits: true, webPaywall: true, iosVisits: false, iosOpens: true, iosPaywall: false, purchaseStart: false, deskOutcomes: true };

/** The funnel tab's unit economics (the cohort itself travels with the overview, in `growth`). */
export async function lifecycleView(days: number, internal = false) {
  const raw = await rpc<EconomicsRaw & { since: string }>('bobby_admin_economics', { p_days: days, p_internal: internal });
  const list = daysFrom(raw.since);
  const [search, appStore] = await Promise.all([searchConsole(list), appStoreSales(list)]);
  return { economics: unitEconomics(raw), searchConsole: search, appStore, instrumentation: INSTRUMENTATION };
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
  if (spentOn > new Date().toISOString().slice(0, 10)) throw new AdminError(400, 'The date cannot be in the future.');
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
