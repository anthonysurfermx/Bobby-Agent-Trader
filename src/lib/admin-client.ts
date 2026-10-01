// The owner dashboard's view of /api/admin. Every call carries the same Bobby credential as the rest of
// the web (accessHeaders: the Apple/Google session, the install id and the platform); the server decides
// who is an admin. Postgres numerics may arrive as numbers or numeric strings, so every response is
// normalized here and the components only ever see plain numbers.
import { accessHeaders } from '@/lib/access-client';

// ---------------------------------------------------------------- types

export type AdminPeriod = 7 | 30 | 90;
export type LlmProvider = 'anthropic' | 'openai';

export interface AdminMe { admin: true; email: string | null; identityId: string }

export interface LlmProviderStats {
  today: number; week: number; month: number; calls: number; failures: number;
  balanceMark: { amount: number; at: string } | null;
  estimatedLeft: number | null;
  lastCreditAlert: string | null;
}

export interface AdminOverview {
  days: string[];
  since: string;
  accounts: { total: number; new: number; wallets: number; active7d: number; byProvider: Record<string, number>; daily: number[] };
  activity: {
    reads: number;
    readsDaily: { web: number[]; ios: number[]; android: number[] };
    levels: { profundo: number; maximo: number };
    activeReaders7d: number;
    activation: { accounts: number; activated: number; medianMinutes: number | null };
  };
  funnel: {
    web: { visitors: number; deskVisitors: number; appStoreClicks: number; signinStarts: number; guestReaders: number; accounts: number; paywallViews: number; pro: number };
    ios: { guestReaders: number; accounts: number; paywallViews: number; pro: number };
    visitsDaily: number[];
    topSurfaces: Array<{ surface: string; visitors: number }>;
    topReferrers: Array<{ referrer: string; visitors: number }>;
  };
  subscriptions: { active: number; byStatus: Record<string, number>; byProvider: Record<string, number>; giftedPro: number };
  revenue: {
    grossUsd: number; netUsd: number; refundsUsd: number;
    newSubscriptions: number; renewals: number; cancellations: number; expirations: number; sandboxEvents: number;
    daily: number[];
  };
  llm: { providers: Record<LlmProvider, LlmProviderStats>; daily: Array<{ anthropic: number; openai: number }> };
  coupons: { active: number; redemptions: number; giftedReadsLeft: number };
}

export interface RevenueCatMetric { id: string; name: string; value: number; unit?: string; period?: string }

export interface AdminIntegrations {
  revenuecat: { configured: boolean; error?: string; metrics?: RevenueCatMetric[] };
  appStore: {
    configured: boolean; error?: string; days?: string[]; downloads?: number[];
    totals?: { downloads: number; redownloads: number; updates: number; iap: number };
  };
  llmCaps: { dayUsd: number; monthUsd: number; alertUsd: number };
  paywall: boolean;
  missing: string[];
}

export interface OverviewResponse { overview: AdminOverview; integrations: AdminIntegrations }

export interface AdminUser {
  id: string; email: string | null; provider: string | null; wallet_only: boolean;
  created_at: string; last_seen_at: string | null;
  first_read_at: string | null; last_read_at: string | null; reads: number | null; platform: string | null;
  activation_minutes: number | null;
  sub_provider: string | null; sub_status: string | null; current_period_end: string | null;
  pro_until: string | null; grant_source: string | null;
  bonus_reads: number | null; bonus_profundo: number | null; bonus_maximo: number | null;
  is_admin: boolean; pro: boolean;
}
export interface UsersResponse { total: number; users: AdminUser[] }

export interface AdminCoupon {
  code: string; reads: number; profundo: number; maximo: number;
  max_redemptions: number | null; redeemed: number; expires_at: string | null;
  active: boolean; note: string | null; created_at: string;
}
export interface AdminRedemption { code: string; identity_id: string; email: string | null; reads: number; profundo: number; maximo: number; created_at: string }
export interface CouponsResponse { coupons: AdminCoupon[]; redemptions: AdminRedemption[] }

export interface AdminActionRow { id: string; admin_email: string | null; action: string; target: string | null; detail: unknown; created_at: string }
export interface ActionsResponse { actions: AdminActionRow[] }

export type AdminPostBody =
  | { action: 'create-coupon'; code?: string; reads: number; profundo: number; maximo: number; maxRedemptions: number | null; expiresAt: string | null; note?: string }
  | { action: 'set-coupon-active'; code: string; active: boolean }
  | { action: 'grant'; identityId: string; reads?: number; profundo?: number; maximo?: number; proDays?: number }
  | { action: 'delete-user'; identityId: string; confirm: string }
  | { action: 'set-admin'; identityId: string; admin: boolean }
  | { action: 'credit-mark'; provider: LlmProvider; kind: 'balance' | 'topup'; amountUsd: number; note?: string }
  | { action: 'probe-llm'; provider: LlmProvider };

export interface ProbeResult { ok: true; status: 'ok' | 'no_credit' | 'error'; httpStatus: number; code?: string }

/** A failed call. `status` 0 means the request never reached the server. */
export class AdminError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = 'AdminError';
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------- transport

/** Dev only: /admin?mock (or ?mock=401|403|500|bare) feeds fixture data through the same components. */
export function adminMockMode(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has('mock') ? params.get('mock') || 'admin' : null;
  } catch { return null; }
}

// The server's messages (api/_lib/admin.ts) in the dashboard's language. Anything else is shown as sent.
const SERVER_ES: Array<[RegExp, string | ((m: RegExpExecArray) => string)]> = [
  [/^Invalid request\.$/, 'Solicitud inválida.'],
  [/^Value out of range \(0–(\d+)\)\.$/, (m) => `Valor fuera de rango (0–${m[1]}).`],
  [/^A coupon must give at least one read\.$/, 'El cupón debe regalar al menos un uso.'],
  [/^Codes use A–Z, 0–9 and dashes \(4–32 characters\)\.$/, 'Los códigos usan A–Z, 0–9 y guiones (4 a 32 caracteres).'],
  [/^The redemption cap must be at least 1\.$/, 'El máximo de canjes debe ser al menos 1.'],
  [/^The expiry must be a future date\.$/, 'El vencimiento debe ser una fecha futura.'],
  [/^That code already exists\.$/, 'Ese código ya existe.'],
  [/^Invalid coupon\.$/, 'Cupón inválido.'],
  [/^Coupon not found\.$/, 'No se encontró el cupón.'],
  [/^Invalid account id\.$/, 'Id de cuenta inválido.'],
  [/^Account not found\.$/, 'No se encontró la cuenta.'],
  [/^Choose at least one gift\.$/, 'Elige al menos un regalo.'],
  [/^You cannot delete your own account from here\.$/, 'No puedes borrar tu propia cuenta desde aquí.'],
  [/^Type the account email to confirm\.$/, 'Escribe el email de la cuenta para confirmar.'],
  [/^The Bobby data was deleted but the sign-in could not be\. Retry\.$/, 'Se borraron los datos de Bobby pero no el inicio de sesión. Vuelve a intentarlo.'],
  [/^You cannot remove your own admin role\.$/, 'No puedes quitarte tu propio rol de admin.'],
  [/^Only Apple\/Google accounts can be admins\.$/, 'Solo las cuentas de Apple o Google pueden ser admin.'],
  [/^Invalid amount\.$/, 'Monto inválido.'],
  [/^Unknown provider\.$/, 'Proveedor desconocido.'],
  [/^The dashboard data is temporarily unavailable\. Try again\.$/, 'Los datos del panel no están disponibles por ahora. Inténtalo de nuevo.'],
];
function translate(code: string): string | null {
  for (const [re, out] of SERVER_ES) {
    const m = re.exec(code);
    if (m) return typeof out === 'string' ? out : out(m);
  }
  return null;
}

function errorMessage(status: number, code: string | null): string {
  if (code === 'not_admin') return 'Esta cuenta no es administradora.';
  const es = code ? translate(code) : null;
  if (es) return es;
  if (status === 401) return 'Inicia sesión para continuar.';
  if (status >= 500) return `El servidor falló (HTTP ${status}${code ? ` · ${code}` : ''}). Inténtalo de nuevo.`;
  if (code && !/^[a-z0-9_]+$/.test(code)) return code; // already a human sentence
  if (code) return `El servidor rechazó la acción: ${code}`;
  return `La solicitud falló (HTTP ${status}).`;
}

async function request(method: 'GET' | 'POST', query: URLSearchParams | null, body?: AdminPostBody): Promise<unknown> {
  let r: Response;
  try {
    const mock = adminMockMode();
    if (import.meta.env.DEV && mock) {
      // Dev fixtures answer with a real Response, so errors and numeric strings take the same path as prod.
      const { mockAdminFetch } = await import('@/components/admin/bobby/mock');
      r = await mockAdminFetch(mock, method, query, body);
    } else {
      const headers: Record<string, string> = { ...(await accessHeaders()) };
      if (body) headers['Content-Type'] = 'application/json';
      r = await fetch(`/api/admin${query ? `?${query.toString()}` : ''}`, {
        method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined,
      });
    }
  } catch {
    throw new AdminError(0, 'network', 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
  }
  const data = (await r.json().catch(() => null)) as { error?: unknown } | null;
  if (!r.ok) {
    const code = typeof data?.error === 'string' ? data.error : null;
    throw new AdminError(r.status, code, errorMessage(r.status, code));
  }
  if (data == null) throw new AdminError(r.status, 'bad_response', 'El servidor respondió algo que no es JSON.');
  return data;
}

function get(view: string, params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams({ view });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  return request('GET', q);
}

// ---------------------------------------------------------------- normalizers

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number => { const n = Number(v); return v == null || v === '' || !Number.isFinite(n) ? 0 : n; };
const numOrNull = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const nums = (v: unknown, len?: number): number[] => {
  const a = Array.isArray(v) ? v.map(num) : [];
  if (len === undefined) return a;
  return a.length >= len ? a.slice(0, len) : [...a, ...Array<number>(len - a.length).fill(0)];
};
const counts = (v: unknown): Record<string, number> => Object.fromEntries(Object.entries(obj(v)).map(([k, x]) => [k, num(x)]));

function normalizeLlm(v: unknown): LlmProviderStats {
  const p = obj(v);
  const mark = obj(p.balanceMark);
  return {
    today: num(p.today), week: num(p.week), month: num(p.month), calls: num(p.calls), failures: num(p.failures),
    balanceMark: p.balanceMark ? { amount: num(mark.amount), at: str(mark.at) } : null,
    estimatedLeft: numOrNull(p.estimatedLeft),
    lastCreditAlert: strOrNull(p.lastCreditAlert),
  };
}

export function normalizeOverview(raw: unknown): OverviewResponse {
  const root = obj(raw);
  const o = obj(root.overview);
  const days = Array.isArray(o.days) ? o.days.map(str) : [];
  const n = days.length;
  const acc = obj(o.accounts);
  const act = obj(o.activity);
  const rd = obj(act.readsDaily);
  const activation = obj(act.activation);
  const levels = obj(act.levels);
  const f = obj(o.funnel);
  const fw = obj(f.web);
  const fi = obj(f.ios);
  const subs = obj(o.subscriptions);
  const rev = obj(o.revenue);
  const llm = obj(o.llm);
  const providers = obj(llm.providers);
  const llmDaily = Array.isArray(llm.daily) ? llm.daily.map((d) => ({ anthropic: num(obj(d).anthropic), openai: num(obj(d).openai) })) : [];
  while (llmDaily.length < n) llmDaily.push({ anthropic: 0, openai: 0 });
  const cp = obj(o.coupons);

  const i = obj(root.integrations);
  const rc = obj(i.revenuecat);
  const as = obj(i.appStore);
  const totals = obj(as.totals);
  const caps = obj(i.llmCaps);

  return {
    overview: {
      days,
      since: str(o.since),
      accounts: { total: num(acc.total), new: num(acc.new), wallets: num(acc.wallets), active7d: num(acc.active7d), byProvider: counts(acc.byProvider), daily: nums(acc.daily, n) },
      activity: {
        reads: num(act.reads),
        readsDaily: { web: nums(rd.web, n), ios: nums(rd.ios, n), android: nums(rd.android, n) },
        levels: { profundo: num(levels.profundo), maximo: num(levels.maximo) },
        activeReaders7d: num(act.activeReaders7d),
        activation: { accounts: num(activation.accounts), activated: num(activation.activated), medianMinutes: numOrNull(activation.medianMinutes) },
      },
      funnel: {
        web: {
          visitors: num(fw.visitors), deskVisitors: num(fw.deskVisitors), appStoreClicks: num(fw.appStoreClicks), signinStarts: num(fw.signinStarts),
          guestReaders: num(fw.guestReaders), accounts: num(fw.accounts), paywallViews: num(fw.paywallViews), pro: num(fw.pro),
        },
        ios: { guestReaders: num(fi.guestReaders), accounts: num(fi.accounts), paywallViews: num(fi.paywallViews), pro: num(fi.pro) },
        visitsDaily: nums(f.visitsDaily, n),
        topSurfaces: (Array.isArray(f.topSurfaces) ? f.topSurfaces : []).map((x) => ({ surface: str(obj(x).surface), visitors: num(obj(x).visitors) })),
        topReferrers: (Array.isArray(f.topReferrers) ? f.topReferrers : []).map((x) => ({ referrer: str(obj(x).referrer), visitors: num(obj(x).visitors) })),
      },
      subscriptions: { active: num(subs.active), byStatus: counts(subs.byStatus), byProvider: counts(subs.byProvider), giftedPro: num(subs.giftedPro) },
      revenue: {
        grossUsd: num(rev.grossUsd), netUsd: num(rev.netUsd), refundsUsd: num(rev.refundsUsd),
        newSubscriptions: num(rev.newSubscriptions), renewals: num(rev.renewals), cancellations: num(rev.cancellations),
        expirations: num(rev.expirations), sandboxEvents: num(rev.sandboxEvents), daily: nums(rev.daily, n),
      },
      llm: { providers: { anthropic: normalizeLlm(providers.anthropic), openai: normalizeLlm(providers.openai) }, daily: n ? llmDaily.slice(0, n) : llmDaily },
      coupons: { active: num(cp.active), redemptions: num(cp.redemptions), giftedReadsLeft: num(cp.giftedReadsLeft) },
    },
    integrations: {
      revenuecat: {
        configured: Boolean(rc.configured),
        error: strOrNull(rc.error) ?? undefined,
        metrics: Array.isArray(rc.metrics)
          ? rc.metrics.map((m) => { const x = obj(m); return { id: str(x.id), name: str(x.name), value: num(x.value), unit: strOrNull(x.unit) ?? undefined, period: strOrNull(x.period) ?? undefined }; })
          : undefined,
      },
      appStore: {
        configured: Boolean(as.configured),
        error: strOrNull(as.error) ?? undefined,
        days: Array.isArray(as.days) ? as.days.map(str) : undefined,
        downloads: Array.isArray(as.downloads) ? nums(as.downloads) : undefined,
        totals: as.totals ? { downloads: num(totals.downloads), redownloads: num(totals.redownloads), updates: num(totals.updates), iap: num(totals.iap) } : undefined,
      },
      llmCaps: { dayUsd: num(caps.dayUsd), monthUsd: num(caps.monthUsd), alertUsd: num(caps.alertUsd) },
      paywall: Boolean(i.paywall),
      missing: Array.isArray(i.missing) ? i.missing.map(str).filter(Boolean) : [],
    },
  };
}

function normalizeUser(v: unknown): AdminUser {
  const u = obj(v);
  return {
    id: str(u.id), email: strOrNull(u.email), provider: strOrNull(u.provider), wallet_only: Boolean(u.wallet_only),
    created_at: str(u.created_at), last_seen_at: strOrNull(u.last_seen_at),
    first_read_at: strOrNull(u.first_read_at), last_read_at: strOrNull(u.last_read_at), reads: numOrNull(u.reads), platform: strOrNull(u.platform),
    activation_minutes: numOrNull(u.activation_minutes),
    sub_provider: strOrNull(u.sub_provider), sub_status: strOrNull(u.sub_status), current_period_end: strOrNull(u.current_period_end),
    pro_until: strOrNull(u.pro_until), grant_source: strOrNull(u.grant_source),
    bonus_reads: numOrNull(u.bonus_reads), bonus_profundo: numOrNull(u.bonus_profundo), bonus_maximo: numOrNull(u.bonus_maximo),
    is_admin: Boolean(u.is_admin), pro: Boolean(u.pro),
  };
}

function normalizeCoupon(v: unknown): AdminCoupon {
  const c = obj(v);
  return {
    code: str(c.code), reads: num(c.reads), profundo: num(c.profundo), maximo: num(c.maximo),
    max_redemptions: numOrNull(c.max_redemptions), redeemed: num(c.redeemed), expires_at: strOrNull(c.expires_at),
    active: Boolean(c.active), note: strOrNull(c.note), created_at: str(c.created_at),
  };
}

// ---------------------------------------------------------------- API

export async function fetchAdminMe(): Promise<AdminMe> {
  const r = obj(await get('me'));
  return { admin: true, email: strOrNull(r.email), identityId: str(r.identityId) };
}

/** `days` is the window (the dashboard also asks for twice it, for the comparison); the server allows 1–365. */
export async function fetchAdminOverview(days: number, opts: { compare?: boolean } = {}): Promise<OverviewResponse> {
  // The comparison request skips the integrations (RevenueCat, App Store) on the server.
  return normalizeOverview(await get('overview', { days, ...(opts.compare ? { compare: 1 } : {}) }));
}

export async function fetchAdminUsers(opts: { q?: string; limit?: number; offset?: number } = {}): Promise<UsersResponse> {
  const r = obj(await get('users', { q: opts.q?.trim() || undefined, limit: opts.limit ?? 50, offset: opts.offset ?? 0 }));
  const users = Array.isArray(r.users) ? r.users.map(normalizeUser) : [];
  return { total: Math.max(num(r.total), users.length), users };
}

export async function fetchAdminCoupons(): Promise<CouponsResponse> {
  const r = obj(await get('coupons'));
  return {
    coupons: Array.isArray(r.coupons) ? r.coupons.map(normalizeCoupon) : [],
    redemptions: Array.isArray(r.redemptions)
      ? r.redemptions.map((v) => { const x = obj(v); return { code: str(x.code), identity_id: str(x.identity_id), email: strOrNull(x.email), reads: num(x.reads), profundo: num(x.profundo), maximo: num(x.maximo), created_at: str(x.created_at) }; })
      : [],
  };
}

export async function fetchAdminActions(): Promise<ActionsResponse> {
  const r = obj(await get('actions'));
  return {
    actions: Array.isArray(r.actions)
      ? r.actions.map((v) => { const x = obj(v); return { id: str(x.id), admin_email: strOrNull(x.admin_email), action: str(x.action), target: strOrNull(x.target), detail: x.detail ?? null, created_at: str(x.created_at) }; })
      : [],
  };
}

/** POST an admin action. Resolves with the server's `{ ok: true, ... }`; rejects with an AdminError carrying its message. */
export async function adminAction<T extends Record<string, unknown> = Record<string, unknown>>(body: AdminPostBody): Promise<T & { ok: true }> {
  const r = obj(await request('POST', null, body));
  if (r.ok !== true) throw new AdminError(200, typeof r.error === 'string' ? r.error : 'not_ok', typeof r.error === 'string' ? r.error : 'El servidor no confirmó la acción.');
  return r as T & { ok: true };
}

export async function createCoupon(body: Omit<Extract<AdminPostBody, { action: 'create-coupon' }>, 'action'>): Promise<AdminCoupon> {
  const r = await adminAction<{ coupon?: unknown }>({ action: 'create-coupon', ...body });
  return normalizeCoupon(r.coupon);
}

export async function probeLlm(provider: LlmProvider): Promise<ProbeResult> {
  const r = await adminAction<{ status?: unknown; httpStatus?: unknown; code?: unknown }>({ action: 'probe-llm', provider });
  const status = r.status === 'ok' || r.status === 'no_credit' ? r.status : 'error';
  return { ok: true, status, httpStatus: num(r.httpStatus), code: strOrNull(r.code) ?? undefined };
}
