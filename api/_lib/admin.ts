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
import { llmCaps } from './llm-usage.js';
import { paywallOn } from './access.js';

const TIMEOUT = 6000;

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(bobbyRest(path), { ...init, headers: { ...bobbyServiceHeaders(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new AdminError(r.status === 409 ? 409 : r.status === 400 ? 400 : 502, r.status === 400 ? 'Invalid request.' : `storage ${r.status}`);
  return (r.status === 204 ? null : await r.json().catch(() => null)) as T;
}
export async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return rest<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
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
    return identity;
  } catch {
    res.status(503).json({ error: 'The admin check is unavailable. Try again.' });
    return null;
  }
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
  return {
    coupons: coupons ?? [],
    redemptions: (redemptions ?? []).map(({ identity, ...r }) => ({ ...r, email: identity?.email ?? null })),
  };
}

export async function actionsView() {
  const rows = await rest<Array<Record<string, unknown> & { admin?: { email?: string | null } | null }>>(
    'bobby_admin_actions?select=id,action,target,detail,created_at,admin:bobby_identities(email)&order=created_at.desc&limit=100');
  return { actions: (rows ?? []).map(({ admin, ...a }) => ({ ...a, admin_email: admin?.email ?? null })) };
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
  return { target: row.email ?? row.id, result };
}

/** The account deletion of api/account.ts, without the user's Apple authorization code (revocation is manual). */
export async function deleteUser(admin: Identity, body: Record<string, unknown>) {
  const row = await identityRow(body.identityId);
  if (row.id === admin.id) throw new AdminError(400, 'You cannot delete your own account from here.');
  const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toLowerCase() : '';
  if (confirm !== (row.email ?? row.id).toLowerCase()) throw new AdminError(400, 'Type the account email to confirm.');
  await rest(`agent_trades?user_id=eq.${row.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: null }) });
  await rest(`bobby_identities?id=eq.${row.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (row.auth_user_id) {
    const url = (process.env.BOBBY_AUTH_URL || bobbyDbUrl()).replace(/\/+$/, '');
    const key = (process.env.BOBBY_AUTH_SERVICE_ROLE_KEY || bobbyServiceKey()).trim();
    const r = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(row.auth_user_id)}`, {
      method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok && r.status !== 404) throw new AdminError(502, 'The Bobby data was deleted but the sign-in could not be. Retry.');
  }
  return { target: row.email ?? row.id };
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
  return { target: row.email ?? row.id };
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
  if (res.ok) return { status: 'ok' as const, httpStatus: res.status };
  // Class only: the provider's message is never kept.
  const error = ((await res.json().catch(() => null)) as { error?: { code?: unknown; type?: unknown; message?: unknown } } | null)?.error;
  const text = typeof error?.message === 'string' ? error.message : '';
  const noCredit = error?.code === 'insufficient_quota' || error?.code === 'billing_hard_limit_reached' || /credit balance is too low/i.test(text);
  const code = typeof error?.code === 'string' ? error.code : typeof error?.type === 'string' ? error.type : undefined;
  return { status: noCredit ? 'no_credit' as const : 'error' as const, httpStatus: res.status, code: noCredit ? 'insufficient_quota' : code?.slice(0, 40) };
}

// ---------------- integrations ----------------
type Metric = { id: string; name: string; value: number; unit?: string; period?: string };
let rcCache: { at: number; value: { configured: boolean; error?: string; metrics?: Metric[] } } | null = null;

async function revenueCatMetrics() {
  const key = process.env.REVENUECAT_V2_SECRET_KEY?.trim();
  if (!key) return { configured: false };
  if (rcCache && Date.now() - rcCache.at < 5 * 60_000) return rcCache.value;
  const get = async (path: string) => {
    const r = await fetch(`https://api.revenuecat.com/v2${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`revenuecat ${r.status}`);
    return r.json() as Promise<Record<string, unknown>>;
  };
  let value: { configured: boolean; error?: string; metrics?: Metric[] };
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
    }));
    value = { configured: true, metrics };
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
interface SalesDay { downloads: number; redownloads: number; updates: number; iap: number }

function ascToken(): string {
  const b64 = (v: string | Buffer) => Buffer.from(v).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'ES256', kid: ascKeyId(), typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: ascIssuer(), iat: now, exp: now + 1100, aud: 'appstoreconnect-v1' }));
  const key = createPrivateKey(process.env.ASC_PRIVATE_KEY!.replace(/\\n/g, '\n'));
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64(sig)}`;
}

export function parseSalesReport(tsv: string, appId: string): SalesDay {
  const out: SalesDay = { downloads: 0, redownloads: 0, updates: 0, iap: 0 };
  const lines = tsv.split(/\r?\n/).filter(Boolean);
  const cols = (lines.shift() ?? '').split('\t');
  const at = (name: string) => cols.indexOf(name);
  const [type, units, apple, parent] = [at('Product Type Identifier'), at('Units'), at('Apple Identifier'), at('Parent Identifier')];
  if (type < 0 || units < 0) return out;
  for (const line of lines) {
    const f = line.split('\t');
    const t = (f[type] ?? '').trim(); const n = Number(f[units]) || 0;
    const ours = apple >= 0 && f[apple]?.trim() === appId;
    if (/^(IA|FI)/.test(t)) { if (ours || (parent >= 0 && f[parent]?.trim())) out.iap += n; continue; }
    if (!ours) continue;
    if (/^(1|F1)/.test(t)) out.downloads += n;
    else if (/^3/.test(t)) out.redownloads += n;
    else if (/^7/.test(t)) out.updates += n;
  }
  return out;
}

async function salesDay(date: string, token: string): Promise<SalesDay | null> {
  const key = `asc-sales:${date}`;
  const cached = await rest<Array<{ payload: SalesDay }>>(`api_cache?cache_key=eq.${encodeURIComponent(key)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=payload`).catch(() => null);
  if (cached?.[0]?.payload) return cached[0].payload;
  const params = new URLSearchParams({
    'filter[frequency]': 'DAILY', 'filter[reportDate]': date, 'filter[reportSubType]': 'SUMMARY',
    'filter[reportType]': 'SALES', 'filter[vendorNumber]': ascVendor(), 'filter[version]': '1_1',
  });
  const r = await fetch(`https://api.appstoreconnect.apple.com/v1/salesReports?${params}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/a-gzip' }, signal: AbortSignal.timeout(10000) });
  let day: SalesDay;
  if (r.status === 404) day = { downloads: 0, redownloads: 0, updates: 0, iap: 0 };   // no sales that day, or not published yet
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
    for (const v of results.values()) { totals.downloads += v.downloads; totals.redownloads += v.redownloads; totals.updates += v.updates; totals.iap += v.iap; }
    return { configured: true, days, downloads: days.map((d) => results.get(d)?.downloads ?? 0), totals };
  } catch (e) {
    return { configured: true, error: e instanceof Error ? e.message : 'appstore unavailable' };
  }
}

export async function integrations(days: string[]) {
  const [revenuecat, appStore] = await Promise.all([revenueCatMetrics(), appStoreSales(days)]);
  const missing = [
    ...(process.env.REVENUECAT_V2_SECRET_KEY?.trim() ? [] : ['REVENUECAT_V2_SECRET_KEY']),
    ...(ascKeyId() ? [] : ['ASC_KEY_ID']), ...(ascIssuer() ? [] : ['ASC_ISSUER_ID']),
    ...(process.env.ASC_PRIVATE_KEY?.trim() ? [] : ['ASC_PRIVATE_KEY']), ...(ascVendor() ? [] : ['ASC_VENDOR_NUMBER']),
  ];
  return { revenuecat, appStore, llmCaps: llmCaps(), paywall: paywallOn(), missing };
}
