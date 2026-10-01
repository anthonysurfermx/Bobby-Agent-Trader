// The owner dashboard's view of /api/admin. Every call carries the same Bobby credential as the rest of
// the web (accessHeaders: the Apple/Google session, the install id and the platform); the server decides
// who is an admin. Postgres numerics may arrive as numbers or numeric strings, so every response is
// normalized here. A field the server did not send is never turned into a silent zero: its path goes into
// `missing`, and the components show "—" and "dato no disponible" for it.
import { accessHeaders } from '@/lib/access-client';

// ---------------------------------------------------------------- types

export type AdminPeriod = 7 | 30 | 90;
export type LlmProvider = 'anthropic' | 'openai';

export interface AdminMe { admin: true; email: string | null; identityId: string }

export interface LlmProviderStats {
  today: number; week: number; month: number; calls: number; failures: number;
  /** Spend over the selected period (the same window as calls/failures). */
  period: number;
  balanceMark: { amount: number; at: string } | null;
  estimatedLeft: number | null;
  lastCreditAlert: string | null;
  /** The alert's payload: which endpoint hit the exhausted credit and the provider's code. */
  creditAlert: { code: string | null; endpoint: string | null } | null;
  lastTopup: string | null;
  lastOk: string | null;
  lastFailure: { at: string; stop: string | null; surface: string | null } | null;
  failures24h: number; calls24h: number;
}

/** Since when each source has data (null = no rows yet), and which surfaces write the LLM ledger. */
export interface Coverage {
  eventsSince: string | null; devicesSince: string | null; readsSince: string | null; readerStatsSince: string | null;
  purchasesSince: string | null; ledgerSince: string | null; ledgerSurfaces: string[];
  activitySince: string | null; outcomesSince: string | null; locatedSince: string | null;
}

export interface LlmSurfaceSpend { surface: string; provider: string; usd: number; calls: number; failures: number }

export interface AdminOverview {
  days: string[];
  since: string;
  /** False (the default): the team's accounts, installs, networks and purchases are left out of every figure. */
  includeInternal: boolean;
  accounts: { total: number; new: number; internal: number; wallets: number; active7d: number; byProvider: Record<string, number>; daily: number[] };
  activity: {
    reads: number;
    readsInternal: number;
    readsDaily: { web: number[]; ios: number[]; android: number[] };
    levels: { profundo: number; maximo: number };
    /** People (an account and its installs once) with a read in the last 7 days. */
    activeReaders7d: number;
    activeReaders7dSplit: { accounts: number; guests: number };
    lastRead: Record<string, string>;
    /** Accounts created once first reads were recorded (measuredSince); older ones are counted in beforeCoverage. */
    activation: { accounts: number; activated: number; medianMinutes: number | null; measuredSince: string | null; beforeCoverage: number };
  };
  funnel: {
    web: { visitors: number; deskVisitors: number; appStoreClicks: number; signinStarts: number; paywallViews: number };
    ios: { paywallViews: number };
    visitsDaily: number[];
    topSurfaces: Array<{ surface: string; visitors: number }>;
    topReferrers: Array<{ referrer: string; visitors: number }>;
  };
  subscriptions: { active: number; paid: number; trialing: number; byStatus: Record<string, number>; byProvider: Record<string, number>; giftedPro: number };
  revenue: {
    grossUsd: number; netUsd: number; refundsUsd: number;
    newSubscriptions: number; newPaying: number; renewals: number; cancellations: number; expirations: number; sandboxEvents: number; internalEvents: number;
    daily: number[];
  };
  llm: {
    providers: Record<LlmProvider, LlmProviderStats>;
    daily: Array<{ anthropic: number; openai: number }>;
    bySurface: LlmSurfaceSpend[];
    /** Desk analyses in the period: one ledger batch per run; finished = the CIO answered. */
    deskRuns: { runs: number; finished: number; byDay: Array<{ day: string; runs: number; finished: number }> };
    /** The spend guard's own figures: desk only, UTC calendar day and month. */
    guard: { day: number; month: number } | null;
  };
  coupons: { active: number; redemptions: number; giftedReadsLeft: number; giftedLeft: { reads: number; profundo: number; maximo: number } };
  coverage: Coverage | null;
  /** Paths the server did not send ("revenue", "funnel.visitsDaily", …). */
  missing: string[];
}

export interface RevenueCatMetric { id: string; name: string; value: number; unit?: string; period?: string; description?: string; updatedAt?: string }

export interface IntegrationsHealth {
  revenuecatWebhook: { configured: boolean; lastEventAt: string | null; events30d: number | null };
  stripe: { configured: boolean; webhook: boolean; lastEventAt: string | null };
  /** Web visits (lastEventAt, events24h), the last failed write of /api/track, and the last read (any platform). */
  tracking: { lastEventAt: string | null; events24h: number | null; lastErrorAt: string | null; lastError: string | null; lastReadAt: string | null };
  llmKeys: { anthropic: boolean; openai: boolean };
  vercelAnalytics: string;
}

export interface AdminIntegrations {
  revenuecat: { configured: boolean; error?: string; metrics?: RevenueCatMetric[]; fetchedAt?: string };
  appStore: {
    configured: boolean; error?: string; days?: string[]; downloads?: number[];
    totals?: { downloads: number; redownloads: number; updates: number; iap: number };
    byCountry?: Array<{ country: string; downloads: number }>;
    /** First and last day with a published report; recent days Apple has not published yet (never zeros). */
    coveredFrom?: string | null; coveredTo?: string | null; pendingDays?: string[];
  };
  llmCaps: { dayUsd: number; monthUsd: number; alertUsd: number };
  /** Same as overview.llm.guard, as the caps compare it (null when the guard could not be read). */
  llmGuard: { dayUsd: number; monthUsd: number } | null;
  health: IntegrationsHealth | null;
  paywall: boolean;
  missing: string[];
}

// ---- growth (bobby_admin_growth): people, cohorts in order, retention, outcomes, acquisition ----
export interface RetentionCell { eligible: number; returned: number; read: number }
/** Installs seen arriving in the period on one platform; each step is a subset of the one before it. */
export interface GrowthCohort {
  arrived: number; home: number; deskOrRead: number; read1: number; read2: number; read3: number; wall: number; signinStart: number;
  account: number; accountNew: number; accountAfterRead: number; accountAfterWall: number; proAfterRead: number;
  delivered: number; failed: number; medianMinutesToFirstRead: number | null; medianMinutesToAccount: number | null; oldestDays: number;
  retention: { d1: RetentionCell; d7: RetentionCell; w1: RetentionCell; readersBack: RetentionCell };
}
export interface GrowthHistory { installs: number; readers: number; reads: number; read2: number; linked: number; since: string | null; until: string | null }
export type PeopleStage = 'new' | 'active' | 'recurring' | 'pro' | 'atRisk' | 'lost';
export interface AttentionAccount { identityId: string; email: string | null; provider: string | null; createdAt?: string | null; lastDay: string | null; reads?: number }
export interface Growth {
  days: number; since: string; today: string; includeInternal: boolean;
  people: {
    total: number; accounts: number; guests: number; wallets: number; excluded: { accounts: number; guests: number };
    newInPeriod: number; active7d: number; active30d: number; readers7d: number; readers: number;
    stages: Record<PeopleStage, number>; byPlatform: Record<string, number>; proInactive: number; accountsNeverRead: number;
  };
  cohorts: { web: GrowthCohort; ios: GrowthCohort };
  history: { web: GrowthHistory; ios: GrowthHistory };
  outcomes: {
    consumed: number; consumedInternal: number; consumedTotal: number; byPlatform: Record<string, number>;
    delivered: number; failed: number; wallSignin: number; wallSigninInstalls: number; wallPaywall: number; wallLevel: number;
    blocked: Record<string, number>; byLevel: Record<string, number>; outcomesSince: string | null;
  };
  acquisition: {
    sources: Array<{ source: string; installs: number; read1: number; account: number }>;
    landing: Array<{ surface: string; installs: number; read1: number }>;
    visits: number; visitors: number; visitsWithUtm: number; visitsWithReferrer: number; visitorDays: number[];
  };
  attention: { neverRead: AttentionAccount[]; quiet: AttentionAccount[] };
  coverage: {
    webObservedSince: string | null; iosObservedSince: string | null; activitySince: string | null; outcomesSince: string | null;
    observedInstalls: number; backfillInstalls: number; internalInstalls: number; internalAccounts: number;
  };
}

/** One finding of "Dónde mejorar" (api/_lib/admin-insights.ts): computed from the figures above, never invented. */
export type InsightLevel = 'critical' | 'warn' | 'opportunity' | 'info';
export type InsightArea = 'operacion' | 'medicion' | 'adquisicion' | 'activacion' | 'conversion' | 'retencion' | 'monetizacion';
export interface Insight {
  id: string; level: InsightLevel; area: InsightArea; title: string; detail: string; action: string;
  evidence: string[]; sample: number | null; tab: string; impact: number;
}

/** "Plan de la semana" (api/_lib/admin-plan.ts): Claude orders the findings above; every priority cites real finding ids. */
export interface GrowthPlan {
  generatedAt: string; model: string; summary: string; cached: boolean; usd: number;
  priorities: Array<{ title: string; why: string; steps: string[]; measure: string; findings: string[] }>;
}

export interface OverviewResponse {
  overview: AdminOverview;
  integrations: AdminIntegrations;
  /** Null on the comparison request (and if the server could not build it: then `missing` holds 'growth'). */
  growth: Growth | null;
  searchConsole: SearchConsoleData | null;
  insights: Insight[];
}

export interface AdminUser {
  id: string; email: string | null; provider: string | null; wallet_only: boolean; wallet: string | null;
  created_at: string; last_seen_at: string | null;
  first_read_at: string | null; last_read_at: string | null; reads: number | null; platform: string | null;
  /** Reads its paired installs made as a guest, before signing in. */
  guest_reads: number;
  /** The last UTC day the person used Bobby (opened it or read), not any API call. */
  last_active_day: string | null;
  /** Null for accounts created before first reads were recorded (nothing to measure). */
  activation_minutes: number | null;
  sub_provider: string | null; sub_status: string | null; current_period_end: string | null;
  pro_until: string | null; grant_source: string | null;
  bonus_reads: number | null; bonus_profundo: number | null; bonus_maximo: number | null;
  /** is_internal: marked by hand (the switch); is_team: left out of the figures for any reason (admin, mark, listed email). */
  is_admin: boolean; is_internal: boolean; is_team: boolean; installs: number; pro: boolean;
}
export interface UsersResponse { total: number; accounts: number; wallets: number; internal: number; readsSince: string | null; users: AdminUser[] }

// ---- internal traffic (view=internal) ----
export interface InstallRow {
  device: string; platform: string; source: 'observed' | 'backfill'; firstSeen: string; lastSeen: string | null;
  firstSurface: string | null; referrer: string | null; utm: string | null; country: string | null;
  /** Internal for any reason (marked, /admin, a team account, a team network); manualInternal = marked by hand. */
  internal: boolean; manualInternal: boolean; reads: number; delivered: number; account: string | null; accountId: string | null;
}
export interface InternalResponse {
  devices: InstallRow[];
  networks: Array<{ network: string; note: string | null; createdAt: string; lastSeenAt: string }>;
  emails: string[];
  marks: Array<{ identity_id: string; email: string | null; provider: string | null; note: string | null; created_at: string }>;
}

export type CouponStatus = 'active' | 'inactive' | 'expired' | 'exhausted';
export interface AdminCoupon {
  code: string; reads: number; profundo: number; maximo: number;
  max_redemptions: number | null; redeemed: number; expires_at: string | null;
  active: boolean; status: CouponStatus; note: string | null; created_at: string;
}
export interface AdminRedemption { code: string; identity_id: string; email: string | null; reads: number; profundo: number; maximo: number; created_at: string }
export interface CouponsResponse { coupons: AdminCoupon[]; redemptions: AdminRedemption[]; totals: { coupons: number | null; redemptions: number | null } }

export type ActionStatus = 'started' | 'ok' | 'failed';
export interface AdminActionRow { id: string; admin_email: string | null; action: string; target: string | null; detail: unknown; status: ActionStatus | null; created_at: string }
export interface ActionsResponse { actions: AdminActionRow[]; total: number | null }

export interface MemberSubscription {
  identityId: string; email: string | null; provider: string | null; status: string | null; productId: string | null;
  currentPeriodEnd: string | null; updatedAt: string | null; active: boolean;
}
export interface MemberGrant { identityId: string; email: string | null; source: string | null; proUntil: string | null; active: boolean }
export interface MembersResponse { subscriptions: MemberSubscription[]; grants: MemberGrant[] }

// ---- Search Console and unit economics (view=lifecycle, view=costs) ----
/** What the shipped clients report: an uninstrumented step means "not measured", never zero. */
export interface Instrumentation { webVisits: boolean; webPaywall: boolean; iosVisits: boolean; iosOpens: boolean; iosPaywall: boolean; purchaseStart: boolean; deskOutcomes: boolean }
export type ChurnSource = 'observed' | 'assumed' | 'default';
export interface Economics {
  days: number; since: string;
  revenue: {
    grossUsd: number; netUsd: number; refundsUsd: number; mrrGrossUsd: number; mrrNetUsd: number; activeSubscriptions: number; trialing: number;
    newPaying: number; payersEver: number; priceUsd: number; takehome: number; priceSource: 'observed' | 'assumed' | 'default';
  };
  costs: { marketingUsd: number; infraUsd: number; otherUsd: number; llmUsd: number; totalUsd: number; manualEntries: number; byChannel: Array<{ channel: string; usd: number }> };
  acquisition: { newAccounts: number; newPaying: number; cacPerAccount: number | null; cacPerPaying: number | null };
  ltv: {
    monthlyNetPerSubUsd: number; monthlyLlmPerUserUsd: number; monthlyContributionUsd: number; monthlyChurn: number; churnSource: ChurnSource;
    lifetimeMonths: number; ltvUsd: number; ltvToCac: number | null; paybackMonths: number | null;
    /** True while no account has ever paid: the LTV is a scenario from price and churn, not an observation. */
    scenario: boolean;
  };
  roi: { profitUsd: number; roi: number | null };
  assumptions: { monthlyChurn: number | null; priceUsd: number | null; storeFee: number | null; maxLifetimeMonths: number | null };
}
export interface SearchConsoleData {
  configured: boolean; error?: string; site?: string; days?: string[]; clicks?: number[]; impressions?: number[];
  totals?: { clicks: number; impressions: number; ctr: number; position: number | null };
  topQueries?: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number | null }>;
  topPages?: Array<{ page: string; clicks: number; impressions: number }>;
}
/** The funnel tab's economics and providers (the cohort itself is `growth`, on the overview). */
export interface LifecycleResponse {
  economics: Economics;
  searchConsole: SearchConsoleData;
  appStore: AdminIntegrations['appStore'];
  instrumentation: Instrumentation;
  missing: string[];
}
// Where the audience is (view=audience). Location is coarse: country + first-level region, web only.
export interface GeoCountry { country: string; visitors: number; readers: number; accounts: number; pro: number }
export interface GeoRegion { country: string; region: string; visitors: number; readers: number }
export interface GeoPurchase { country: string; newPaying: number; grossUsd: number }
export interface ProviderCountries<K extends string> { configured: boolean; error: string | null; countries: Array<{ country: string } & Record<K, number>> | null }
export interface AudienceResponse {
  geo: {
    since: string; days: number; locatedSince: string | null;
    /** devices: outside web installs new in the period; measurable: those that arrived once location was recorded. */
    web: { devices: number; measurable: number; located: number; beforeLocation: number };
    located: { total: number; withRegion: number };
    countries: GeoCountry[]; regions: GeoRegion[]; purchases: GeoPurchase[];
  };
  searchConsole: ProviderCountries<'clicks' | 'impressions'>;
  appStore: ProviderCountries<'downloads'>;
}
export type CostKind = 'marketing' | 'infra' | 'other';
export interface CostRow { id: number; kind: CostKind; channel: string | null; amount_usd: number; spent_on: string; note: string | null; created_at: string }

export type AdminPostBody =
  | { action: 'create-coupon'; code?: string; reads: number; profundo: number; maximo: number; maxRedemptions: number | null; expiresAt: string | null; note?: string }
  | { action: 'set-coupon-active'; code: string; active: boolean }
  | { action: 'grant'; identityId: string; reads?: number; profundo?: number; maximo?: number; proDays?: number }
  | { action: 'delete-user'; identityId: string; confirm: string }
  | { action: 'set-admin'; identityId: string; admin: boolean }
  | { action: 'credit-mark'; provider: LlmProvider; kind: 'balance' | 'topup'; amountUsd: number; note?: string }
  | { action: 'probe-llm'; provider: LlmProvider }
  | { action: 'add-cost'; kind: CostKind; channel?: string; amountUsd: number; spentOn?: string; note?: string }
  | { action: 'delete-cost'; id: number }
  // The server merges: an absent field keeps its value, null clears it back to the default.
  | { action: 'set-assumptions'; monthlyChurn?: number | null; priceUsd?: number | null; storeFee?: number | null; maxLifetimeMonths?: number | null }
  | { action: 'set-internal'; identityId: string; internal: boolean; note?: string }
  | { action: 'set-device-internal'; device: string; internal: boolean }
  | { action: 'remove-internal-network'; network: string }
  | { action: 'set-internal-emails'; emails: string[] }
  | { action: 'growth-plan'; days: number; internal: boolean; force?: boolean }
  | { action: 'preview-digest' }
  | { action: 'send-digest' };

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

/** True when `path` (or a section containing it, or any field under it) was not sent by the server. */
export function isMissing(missing: readonly string[] | undefined, path: string): boolean {
  if (!missing?.length) return false;
  return missing.some((m) => m === path || path.startsWith(`${m}.`) || m.startsWith(`${path}.`));
}

// ---------------------------------------------------------------- transport

/** Dev only: /admin?mock (or ?mock=401|403|500|bare|partial) feeds fixture data through the same components. */
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
  [/^The audit log is unavailable, so nothing was changed\. Try again\.$/, 'El registro de auditoría no está disponible, así que no se cambió nada. Inténtalo de nuevo.'],
  [/^Invalid cost\.$/, 'Costo inválido.'],
  [/^The date cannot be in the future\.$/, 'La fecha no puede ser futura.'],
  [/^Cost not found\.$/, 'No se encontró el costo.'],
  [/^Install not found\.$/, 'No se encontró la instalación.'],
  [/^Network not found\.$/, 'No se encontró la red.'],
  [/^Invalid email\.$/, 'Hay un email inválido.'],
  [/^The sign-in could not be deleted, so nothing was changed\. Retry\.$/, 'No se pudo borrar el inicio de sesión, así que no se cambió nada. Vuelve a intentarlo.'],
  [/^Invalid (monthlyChurn|priceUsd|storeFee|maxLifetimeMonths)\.$/, (m) => `Valor inválido: ${({ monthlyChurn: 'churn mensual', priceUsd: 'precio', storeFee: 'comisión de tienda', maxLifetimeMonths: 'vida máxima' } as Record<string, string>)[m[1]]}.`],
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

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = (v: unknown): Obj => (isObj(v) ? v : {});
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

/**
 * Reads a response and records every path the server did not send. Values for missing paths are zeros or
 * empty arrays only as placeholders; the UI checks `missing` (isMissing) before showing them.
 */
function reader(missing: string[]) {
  const mark = (path: string) => { if (!missing.some((m) => m === path || path.startsWith(`${m}.`))) missing.push(path); };
  const absent = (v: unknown) => v === undefined || v === null || v === '';
  return {
    mark,
    sec(parent: Obj, key: string, path: string): Obj {
      const v = parent[key];
      if (!isObj(v)) { mark(path); return {}; }
      return v;
    },
    n(o: Obj, key: string, path: string): number {
      const v = o[key];
      if (absent(v) || !Number.isFinite(Number(v))) { mark(path); return 0; }
      return Number(v);
    },
    arr(o: Obj, key: string, path: string, len?: number): number[] {
      const v = o[key];
      if (!Array.isArray(v)) { mark(path); return nums([], len); }
      return nums(v, len);
    },
    cnt(o: Obj, key: string, path: string): Record<string, number> {
      const v = o[key];
      if (!isObj(v)) { mark(path); return {}; }
      return counts(v);
    },
  };
}

function normalizeLlm(v: unknown): LlmProviderStats {
  const p = obj(v);
  const mark = obj(p.balanceMark);
  const alert = isObj(p.creditAlert) ? p.creditAlert : null;
  const fail = isObj(p.lastFailure) ? p.lastFailure : null;
  return {
    today: num(p.today), week: num(p.week), month: num(p.month), calls: num(p.calls), failures: num(p.failures), period: num(p.period),
    balanceMark: p.balanceMark ? { amount: num(mark.amount), at: str(mark.at) } : null,
    estimatedLeft: numOrNull(p.estimatedLeft),
    lastCreditAlert: strOrNull(p.lastCreditAlert),
    creditAlert: alert ? { code: strOrNull(alert.code), endpoint: strOrNull(alert.endpoint) } : null,
    lastTopup: strOrNull(p.lastTopup), lastOk: strOrNull(p.lastOk),
    lastFailure: fail ? { at: str(fail.at), stop: strOrNull(fail.stop), surface: strOrNull(fail.surface) } : null,
    failures24h: num(p.failures24h), calls24h: num(p.calls24h),
  };
}

function normalizeCoverage(v: unknown): Coverage | null {
  if (!isObj(v)) return null;
  return {
    eventsSince: strOrNull(v.eventsSince), devicesSince: strOrNull(v.devicesSince), readsSince: strOrNull(v.readsSince),
    readerStatsSince: strOrNull(v.readerStatsSince), purchasesSince: strOrNull(v.purchasesSince), ledgerSince: strOrNull(v.ledgerSince),
    ledgerSurfaces: Array.isArray(v.ledgerSurfaces) ? v.ledgerSurfaces.map(str).filter(Boolean) : [],
    activitySince: strOrNull(v.activitySince), outcomesSince: strOrNull(v.outcomesSince), locatedSince: strOrNull(v.locatedSince),
  };
}

function normalizeAppStore(v: unknown): AdminIntegrations['appStore'] {
  const as = obj(v);
  const totals = obj(as.totals);
  return {
    configured: Boolean(as.configured),
    error: strOrNull(as.error) ?? undefined,
    days: Array.isArray(as.days) ? as.days.map(str) : undefined,
    downloads: Array.isArray(as.downloads) ? nums(as.downloads) : undefined,
    totals: as.totals ? { downloads: num(totals.downloads), redownloads: num(totals.redownloads), updates: num(totals.updates), iap: num(totals.iap) } : undefined,
    byCountry: Array.isArray(as.byCountry) ? as.byCountry.map((c) => ({ country: str(obj(c).country), downloads: num(obj(c).downloads) })) : undefined,
    coveredFrom: strOrNull(as.coveredFrom), coveredTo: strOrNull(as.coveredTo),
    pendingDays: Array.isArray(as.pendingDays) ? as.pendingDays.map(str) : undefined,
  };
}

/** `integrations: null` (the comparison request) is not an error: the defaults are never shown. */
function normalizeIntegrations(raw: unknown, r: ReturnType<typeof reader>, expected: boolean): AdminIntegrations {
  if (!isObj(raw) && expected) r.mark('integrations');
  const i = obj(raw);
  const rc = obj(i.revenuecat);
  const caps = obj(i.llmCaps);
  const guard = isObj(i.llmGuard) ? i.llmGuard : null;
  const h = isObj(i.health) ? i.health : null;
  const wh = obj(h?.revenuecatWebhook), tr = obj(h?.tracking), keys = obj(h?.llmKeys), st = obj(h?.stripe);
  return {
    revenuecat: {
      configured: Boolean(rc.configured),
      error: strOrNull(rc.error) ?? undefined,
      metrics: Array.isArray(rc.metrics)
        ? rc.metrics.map((m) => {
          const x = obj(m);
          return { id: str(x.id), name: str(x.name), value: num(x.value), unit: strOrNull(x.unit) ?? undefined, period: strOrNull(x.period) ?? undefined,
            description: strOrNull(x.description) ?? undefined, updatedAt: strOrNull(x.updatedAt) ?? undefined };
        })
        : undefined,
      fetchedAt: strOrNull(rc.fetchedAt) ?? undefined,
    },
    appStore: normalizeAppStore(i.appStore),
    llmCaps: { dayUsd: num(caps.dayUsd), monthUsd: num(caps.monthUsd), alertUsd: num(caps.alertUsd) },
    llmGuard: guard ? { dayUsd: num(guard.dayUsd), monthUsd: num(guard.monthUsd) } : null,
    health: h ? {
      revenuecatWebhook: { configured: Boolean(wh.configured), lastEventAt: strOrNull(wh.lastEventAt), events30d: numOrNull(wh.events30d) },
      stripe: { configured: Boolean(st.configured), webhook: Boolean(st.webhook), lastEventAt: strOrNull(st.lastEventAt) },
      tracking: { lastEventAt: strOrNull(tr.lastEventAt), events24h: numOrNull(tr.events24h), lastErrorAt: strOrNull(tr.lastErrorAt), lastError: strOrNull(tr.lastError), lastReadAt: strOrNull(tr.lastReadAt) },
      llmKeys: { anthropic: Boolean(keys.anthropic), openai: Boolean(keys.openai) },
      vercelAnalytics: str(h.vercelAnalytics) || 'unverified',
    } : null,
    paywall: Boolean(i.paywall),
    missing: Array.isArray(i.missing) ? i.missing.map(str).filter(Boolean) : [],
  };
}

export function normalizeOverview(raw: unknown, opts: { compare?: boolean } = {}): OverviewResponse {
  const missing: string[] = [];
  const r = reader(missing);
  const root = obj(raw);
  const o = r.sec(root, 'overview', 'overview');
  const days = Array.isArray(o.days) ? o.days.map(str) : [];
  if (!Array.isArray(o.days)) r.mark('days');
  const n = days.length;

  const acc = r.sec(o, 'accounts', 'accounts');
  const act = r.sec(o, 'activity', 'activity');
  const rd = r.sec(act, 'readsDaily', 'activity.readsDaily');
  const activation = r.sec(act, 'activation', 'activity.activation');
  const levels = r.sec(act, 'levels', 'activity.levels');
  const f = r.sec(o, 'funnel', 'funnel');
  const fw = r.sec(f, 'web', 'funnel.web');
  const fi = r.sec(f, 'ios', 'funnel.ios');
  const subs = r.sec(o, 'subscriptions', 'subscriptions');
  const rev = r.sec(o, 'revenue', 'revenue');
  const llm = r.sec(o, 'llm', 'llm');
  const providers = r.sec(llm, 'providers', 'llm.providers');
  const llmDaily = Array.isArray(llm.daily) ? llm.daily.map((d) => ({ anthropic: num(obj(d).anthropic), openai: num(obj(d).openai) })) : [];
  if (!Array.isArray(llm.daily)) r.mark('llm.daily');
  while (llmDaily.length < n) llmDaily.push({ anthropic: 0, openai: 0 });
  const cp = r.sec(o, 'coupons', 'coupons');
  const guard = isObj(llm.guard) ? llm.guard : null;
  if (!opts.compare && !guard) r.mark('llm.guard');
  if (!opts.compare && !Array.isArray(llm.bySurface)) r.mark('llm.bySurface');
  const coverage = normalizeCoverage(o.coverage);
  if (!opts.compare && !coverage) r.mark('coverage');

  const split = obj(act.activeReaders7dSplit);
  const runs = obj(llm.deskRuns);
  const gifted = obj(cp.giftedLeft);
  const overview: AdminOverview = {
    days,
    since: str(o.since),
    includeInternal: o.includeInternal === true,
    accounts: {
      total: r.n(acc, 'total', 'accounts.total'), new: r.n(acc, 'new', 'accounts.new'), internal: num(acc.internal), wallets: r.n(acc, 'wallets', 'accounts.wallets'),
      active7d: r.n(acc, 'active7d', 'accounts.active7d'), byProvider: r.cnt(acc, 'byProvider', 'accounts.byProvider'), daily: r.arr(acc, 'daily', 'accounts.daily', n),
    },
    activity: {
      reads: r.n(act, 'reads', 'activity.reads'),
      readsInternal: num(act.readsInternal),
      readsDaily: { web: r.arr(rd, 'web', 'activity.readsDaily.web', n), ios: r.arr(rd, 'ios', 'activity.readsDaily.ios', n), android: r.arr(rd, 'android', 'activity.readsDaily.android', n) },
      // Levels are only present when used: an absent level is a zero, not a gap.
      levels: { profundo: num(levels.profundo), maximo: num(levels.maximo) },
      activeReaders7d: r.n(act, 'activeReaders7d', 'activity.activeReaders7d'),
      activeReaders7dSplit: { accounts: num(split.accounts), guests: num(split.guests) },
      lastRead: Object.fromEntries(Object.entries(obj(act.lastRead)).map(([k, v]) => [k, str(v)])),
      activation: {
        accounts: r.n(activation, 'accounts', 'activity.activation.accounts'), activated: r.n(activation, 'activated', 'activity.activation.activated'),
        medianMinutes: numOrNull(activation.medianMinutes), measuredSince: strOrNull(activation.measuredSince), beforeCoverage: num(activation.beforeCoverage),
      },
    },
    funnel: {
      web: {
        visitors: r.n(fw, 'visitors', 'funnel.web.visitors'), deskVisitors: r.n(fw, 'deskVisitors', 'funnel.web.deskVisitors'),
        appStoreClicks: r.n(fw, 'appStoreClicks', 'funnel.web.appStoreClicks'), signinStarts: r.n(fw, 'signinStarts', 'funnel.web.signinStarts'),
        paywallViews: r.n(fw, 'paywallViews', 'funnel.web.paywallViews'),
      },
      ios: { paywallViews: r.n(fi, 'paywallViews', 'funnel.ios.paywallViews') },
      visitsDaily: r.arr(f, 'visitsDaily', 'funnel.visitsDaily', n),
      topSurfaces: (Array.isArray(f.topSurfaces) ? f.topSurfaces : (r.mark('funnel.topSurfaces'), [])).map((x) => ({ surface: str(obj(x).surface), visitors: num(obj(x).visitors) })),
      topReferrers: (Array.isArray(f.topReferrers) ? f.topReferrers : (r.mark('funnel.topReferrers'), [])).map((x) => ({ referrer: str(obj(x).referrer), visitors: num(obj(x).visitors) })),
    },
    subscriptions: {
      active: r.n(subs, 'active', 'subscriptions.active'), paid: num(subs.paid), trialing: num(subs.trialing), byStatus: r.cnt(subs, 'byStatus', 'subscriptions.byStatus'),
      byProvider: r.cnt(subs, 'byProvider', 'subscriptions.byProvider'), giftedPro: r.n(subs, 'giftedPro', 'subscriptions.giftedPro'),
    },
    revenue: {
      grossUsd: r.n(rev, 'grossUsd', 'revenue.grossUsd'), netUsd: r.n(rev, 'netUsd', 'revenue.netUsd'), refundsUsd: r.n(rev, 'refundsUsd', 'revenue.refundsUsd'),
      newSubscriptions: r.n(rev, 'newSubscriptions', 'revenue.newSubscriptions'), newPaying: num(rev.newPaying), renewals: r.n(rev, 'renewals', 'revenue.renewals'),
      cancellations: r.n(rev, 'cancellations', 'revenue.cancellations'), expirations: r.n(rev, 'expirations', 'revenue.expirations'),
      sandboxEvents: r.n(rev, 'sandboxEvents', 'revenue.sandboxEvents'), internalEvents: num(rev.internalEvents), daily: r.arr(rev, 'daily', 'revenue.daily', n),
    },
    llm: {
      providers: { anthropic: normalizeLlm(providers.anthropic), openai: normalizeLlm(providers.openai) },
      daily: n ? llmDaily.slice(0, n) : llmDaily,
      bySurface: (Array.isArray(llm.bySurface) ? llm.bySurface : []).map((x) => {
        const s = obj(x);
        return { surface: str(s.surface) || 'otro', provider: str(s.provider), usd: num(s.usd), calls: num(s.calls), failures: num(s.failures) };
      }),
      deskRuns: {
        runs: num(runs.runs), finished: num(runs.finished),
        byDay: (Array.isArray(runs.byDay) ? runs.byDay : []).map((x) => ({ day: str(obj(x).day), runs: num(obj(x).runs), finished: num(obj(x).finished) })),
      },
      guard: guard ? { day: num(guard.day), month: num(guard.month) } : null,
    },
    coupons: {
      active: r.n(cp, 'active', 'coupons.active'), redemptions: r.n(cp, 'redemptions', 'coupons.redemptions'), giftedReadsLeft: r.n(cp, 'giftedReadsLeft', 'coupons.giftedReadsLeft'),
      giftedLeft: { reads: num(gifted.reads), profundo: num(gifted.profundo), maximo: num(gifted.maximo) },
    },
    coverage,
    missing,
  };
  const growth = opts.compare ? null : normalizeGrowth(root.growth);
  if (!opts.compare && !growth) r.mark('growth');
  return {
    overview, integrations: normalizeIntegrations(root.integrations, r, !opts.compare), growth,
    searchConsole: opts.compare || !isObj(root.searchConsole) ? null : normalizeSearchConsole(root.searchConsole),
    insights: Array.isArray(root.insights) ? root.insights.map(normalizeInsight).filter((i): i is Insight => i !== null) : [],
  };
}

const LEVELS: InsightLevel[] = ['critical', 'warn', 'opportunity', 'info'];
function normalizeInsight(v: unknown): Insight | null {
  const x = obj(v);
  if (!str(x.title)) return null;
  return {
    id: str(x.id), level: LEVELS.includes(x.level as InsightLevel) ? (x.level as InsightLevel) : 'info', area: (str(x.area) || 'medicion') as InsightArea,
    title: str(x.title), detail: str(x.detail), action: str(x.action), evidence: Array.isArray(x.evidence) ? x.evidence.map(str).filter(Boolean) : [],
    sample: numOrNull(x.sample), tab: str(x.tab) || 'resumen', impact: num(x.impact),
  };
}

function normalizeCohortV2(v: unknown): GrowthCohort {
  const c = obj(v);
  const ret = obj(c.retention);
  const cell = (x: unknown): RetentionCell => ({ eligible: num(obj(x).eligible), returned: num(obj(x).returned), read: num(obj(x).read) });
  return {
    arrived: num(c.arrived), home: num(c.home), deskOrRead: num(c.deskOrRead), read1: num(c.read1), read2: num(c.read2), read3: num(c.read3),
    wall: num(c.wall), signinStart: num(c.signinStart), account: num(c.account), accountNew: num(c.accountNew),
    accountAfterRead: num(c.accountAfterRead), accountAfterWall: num(c.accountAfterWall), proAfterRead: num(c.proAfterRead),
    delivered: num(c.delivered), failed: num(c.failed),
    medianMinutesToFirstRead: numOrNull(c.medianMinutesToFirstRead), medianMinutesToAccount: numOrNull(c.medianMinutesToAccount), oldestDays: num(c.oldestDays),
    retention: { d1: cell(ret.d1), d7: cell(ret.d7), w1: cell(ret.w1), readersBack: cell(ret.readersBack) },
  };
}
function normalizeHistory(v: unknown): GrowthHistory {
  const h = obj(v);
  return { installs: num(h.installs), readers: num(h.readers), reads: num(h.reads), read2: num(h.read2), linked: num(h.linked), since: strOrNull(h.since), until: strOrNull(h.until) };
}
function normalizeAttention(v: unknown): AttentionAccount[] {
  return (Array.isArray(v) ? v : []).map((x) => {
    const a = obj(x);
    return { identityId: str(a.identityId), email: strOrNull(a.email), provider: strOrNull(a.provider), createdAt: strOrNull(a.createdAt), lastDay: strOrNull(a.lastDay), reads: num(a.reads) };
  });
}
export function normalizeGrowth(v: unknown): Growth | null {
  if (!isObj(v) || !isObj(v.people)) return null;
  const p = obj(v.people), st = obj(p.stages), ex = obj(p.excluded), co = obj(v.cohorts), hi = obj(v.history), out = obj(v.outcomes);
  const acq = obj(v.acquisition), att = obj(v.attention), cov = obj(v.coverage);
  return {
    days: num(v.days), since: str(v.since), today: str(v.today), includeInternal: v.includeInternal === true,
    people: {
      total: num(p.total), accounts: num(p.accounts), guests: num(p.guests), wallets: num(p.wallets),
      excluded: { accounts: num(ex.accounts), guests: num(ex.guests) },
      newInPeriod: num(p.newInPeriod), active7d: num(p.active7d), active30d: num(p.active30d), readers7d: num(p.readers7d), readers: num(p.readers),
      stages: { new: num(st.new), active: num(st.active), recurring: num(st.recurring), pro: num(st.pro), atRisk: num(st.atRisk), lost: num(st.lost) },
      byPlatform: counts(p.byPlatform), proInactive: num(p.proInactive), accountsNeverRead: num(p.accountsNeverRead),
    },
    cohorts: { web: normalizeCohortV2(co.web), ios: normalizeCohortV2(co.ios) },
    history: { web: normalizeHistory(hi.web), ios: normalizeHistory(hi.ios) },
    outcomes: {
      consumed: num(out.consumed), consumedInternal: num(out.consumedInternal), consumedTotal: num(out.consumedTotal), byPlatform: counts(out.byPlatform),
      delivered: num(out.delivered), failed: num(out.failed), wallSignin: num(out.wallSignin), wallSigninInstalls: num(out.wallSigninInstalls),
      wallPaywall: num(out.wallPaywall), wallLevel: num(out.wallLevel), blocked: counts(out.blocked), byLevel: counts(out.byLevel), outcomesSince: strOrNull(out.outcomesSince),
    },
    acquisition: {
      sources: (Array.isArray(acq.sources) ? acq.sources : []).map((x) => ({ source: str(obj(x).source), installs: num(obj(x).installs), read1: num(obj(x).read1), account: num(obj(x).account) })),
      landing: (Array.isArray(acq.landing) ? acq.landing : []).map((x) => ({ surface: str(obj(x).surface), installs: num(obj(x).installs), read1: num(obj(x).read1) })),
      visits: num(acq.visits), visitors: num(acq.visitors), visitsWithUtm: num(acq.visitsWithUtm), visitsWithReferrer: num(acq.visitsWithReferrer),
      visitorDays: Array.isArray(acq.visitorDays) ? nums(acq.visitorDays) : [],
    },
    attention: { neverRead: normalizeAttention(att.neverRead), quiet: normalizeAttention(att.quiet) },
    coverage: {
      webObservedSince: strOrNull(cov.webObservedSince), iosObservedSince: strOrNull(cov.iosObservedSince), activitySince: strOrNull(cov.activitySince),
      outcomesSince: strOrNull(cov.outcomesSince), observedInstalls: num(cov.observedInstalls), backfillInstalls: num(cov.backfillInstalls),
      internalInstalls: num(cov.internalInstalls), internalAccounts: num(cov.internalAccounts),
    },
  };
}

function normalizeSearchConsole(v: unknown): SearchConsoleData {
  const g = obj(v);
  const gt = obj(g.totals);
  return {
    configured: Boolean(g.configured),
    error: strOrNull(g.error) ?? undefined,
    site: strOrNull(g.site) ?? undefined,
    days: Array.isArray(g.days) ? g.days.map(str) : undefined,
    clicks: Array.isArray(g.clicks) ? nums(g.clicks) : undefined,
    impressions: Array.isArray(g.impressions) ? nums(g.impressions) : undefined,
    totals: g.totals ? { clicks: num(gt.clicks), impressions: num(gt.impressions), ctr: num(gt.ctr), position: numOrNull(gt.position) } : undefined,
    topQueries: Array.isArray(g.topQueries)
      ? g.topQueries.map((q) => { const x = obj(q); return { query: str(x.query), clicks: num(x.clicks), impressions: num(x.impressions), ctr: num(x.ctr), position: numOrNull(x.position) }; })
      : undefined,
    topPages: Array.isArray(g.topPages) ? g.topPages.map((q) => { const x = obj(q); return { page: str(x.page), clicks: num(x.clicks), impressions: num(x.impressions) }; }) : undefined,
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
    wallet: strOrNull(u.wallet), guest_reads: num(u.guest_reads), last_active_day: strOrNull(u.last_active_day),
    is_internal: Boolean(u.is_internal), is_team: Boolean(u.is_team) || Boolean(u.is_admin) || Boolean(u.is_internal), installs: num(u.installs),
  };
}

const COUPON_STATUS: CouponStatus[] = ['active', 'inactive', 'expired', 'exhausted'];
function normalizeCoupon(v: unknown): AdminCoupon {
  const c = obj(v);
  const active = Boolean(c.active);
  const status = COUPON_STATUS.includes(c.status as CouponStatus) ? (c.status as CouponStatus) : active ? 'active' : 'inactive';
  return {
    code: str(c.code), reads: num(c.reads), profundo: num(c.profundo), maximo: num(c.maximo),
    max_redemptions: numOrNull(c.max_redemptions), redeemed: num(c.redeemed), expires_at: strOrNull(c.expires_at),
    active, status, note: strOrNull(c.note), created_at: str(c.created_at),
  };
}

const INSTRUMENTATION_DEFAULT: Instrumentation = { webVisits: true, webPaywall: true, iosVisits: false, iosOpens: true, iosPaywall: false, purchaseStart: false, deskOutcomes: true };

export function normalizeLifecycle(raw: unknown): LifecycleResponse {
  const missing: string[] = [];
  const r = reader(missing);
  const root = obj(raw);
  const e = r.sec(root, 'economics', 'economics');
  const rev = obj(e.revenue), co = obj(e.costs), acq = obj(e.acquisition), lt = obj(e.ltv), roi = obj(e.roi), asm = obj(e.assumptions);
  const ins = obj(root.instrumentation);
  const churnSource = lt.churnSource === 'observed' || lt.churnSource === 'assumed' ? lt.churnSource : 'default';
  const priceSource = rev.priceSource === 'observed' || rev.priceSource === 'assumed' ? rev.priceSource : 'default';
  return {
    economics: {
      days: num(e.days), since: str(e.since),
      revenue: {
        grossUsd: num(rev.grossUsd), netUsd: num(rev.netUsd), refundsUsd: num(rev.refundsUsd), mrrGrossUsd: num(rev.mrrGrossUsd), mrrNetUsd: num(rev.mrrNetUsd),
        activeSubscriptions: num(rev.activeSubscriptions), trialing: num(rev.trialing), newPaying: num(rev.newPaying), payersEver: num(rev.payersEver),
        priceUsd: num(rev.priceUsd), takehome: num(rev.takehome), priceSource,
      },
      costs: {
        marketingUsd: num(co.marketingUsd), infraUsd: num(co.infraUsd), otherUsd: num(co.otherUsd), llmUsd: num(co.llmUsd), totalUsd: num(co.totalUsd), manualEntries: num(co.manualEntries),
        byChannel: (Array.isArray(co.byChannel) ? co.byChannel : []).map((c) => ({ channel: str(obj(c).channel) || 'other', usd: num(obj(c).usd) })),
      },
      acquisition: { newAccounts: num(acq.newAccounts), newPaying: num(acq.newPaying), cacPerAccount: numOrNull(acq.cacPerAccount), cacPerPaying: numOrNull(acq.cacPerPaying) },
      ltv: {
        monthlyNetPerSubUsd: num(lt.monthlyNetPerSubUsd), monthlyLlmPerUserUsd: num(lt.monthlyLlmPerUserUsd), monthlyContributionUsd: num(lt.monthlyContributionUsd),
        monthlyChurn: num(lt.monthlyChurn), churnSource, lifetimeMonths: num(lt.lifetimeMonths), ltvUsd: num(lt.ltvUsd),
        ltvToCac: numOrNull(lt.ltvToCac), paybackMonths: numOrNull(lt.paybackMonths), scenario: lt.scenario !== false,
      },
      roi: { profitUsd: num(roi.profitUsd), roi: numOrNull(roi.roi) },
      assumptions: { monthlyChurn: numOrNull(asm.monthlyChurn), priceUsd: numOrNull(asm.priceUsd), storeFee: numOrNull(asm.storeFee), maxLifetimeMonths: numOrNull(asm.maxLifetimeMonths) },
    },
    searchConsole: normalizeSearchConsole(root.searchConsole),
    appStore: normalizeAppStore(root.appStore),
    instrumentation: isObj(root.instrumentation)
      ? { webVisits: Boolean(ins.webVisits), webPaywall: Boolean(ins.webPaywall), iosVisits: Boolean(ins.iosVisits), iosOpens: Boolean(ins.iosOpens),
          iosPaywall: Boolean(ins.iosPaywall), purchaseStart: Boolean(ins.purchaseStart), deskOutcomes: Boolean(ins.deskOutcomes) }
      : INSTRUMENTATION_DEFAULT,
    missing,
  };
}

function normalizeCost(v: unknown): CostRow {
  const c = obj(v);
  const kind = c.kind === 'marketing' || c.kind === 'infra' ? c.kind : 'other';
  return { id: num(c.id), kind, channel: strOrNull(c.channel), amount_usd: num(c.amount_usd), spent_on: str(c.spent_on), note: strOrNull(c.note), created_at: str(c.created_at) };
}

// ---------------------------------------------------------------- API

export async function fetchAdminMe(): Promise<AdminMe> {
  const r = obj(await get('me'));
  return { admin: true, email: strOrNull(r.email), identityId: str(r.identityId) };
}

/** `days` is the window (the dashboard also asks for twice it, for the comparison); the server allows 1–365. */
export async function fetchAdminOverview(days: number, opts: { compare?: boolean; internal?: boolean } = {}): Promise<OverviewResponse> {
  // The comparison request skips the integrations (RevenueCat, App Store), the growth view and the diagnosis.
  return normalizeOverview(await get('overview', { days, ...(opts.compare ? { compare: 1 } : {}), ...(opts.internal ? { internal: 1 } : {}) }), opts);
}

export async function fetchAdminLifecycle(days: number, internal = false): Promise<LifecycleResponse> {
  return normalizeLifecycle(await get('lifecycle', { days, ...(internal ? { internal: 1 } : {}) }));
}

export async function fetchAdminInternal(): Promise<InternalResponse> {
  const r = obj(await get('internal'));
  return {
    devices: (Array.isArray(r.devices) ? r.devices : []).map((v) => {
      const x = obj(v);
      return {
        device: str(x.device), platform: str(x.platform) || 'web', source: x.source === 'backfill' ? 'backfill' : 'observed', firstSeen: str(x.firstSeen), lastSeen: strOrNull(x.lastSeen),
        firstSurface: strOrNull(x.firstSurface), referrer: strOrNull(x.referrer), utm: strOrNull(x.utm), country: strOrNull(x.country),
        internal: Boolean(x.internal), manualInternal: Boolean(x.manualInternal), reads: num(x.reads), delivered: num(x.delivered),
        account: strOrNull(x.account), accountId: strOrNull(x.accountId),
      };
    }),
    networks: (Array.isArray(r.networks) ? r.networks : []).map((v) => { const x = obj(v); return { network: str(x.network), note: strOrNull(x.note), createdAt: str(x.createdAt), lastSeenAt: str(x.lastSeenAt) }; }),
    emails: Array.isArray(r.emails) ? r.emails.map(str).filter(Boolean) : [],
    marks: (Array.isArray(r.marks) ? r.marks : []).map((v) => { const x = obj(v); return { identity_id: str(x.identity_id), email: strOrNull(x.email), provider: strOrNull(x.provider), note: strOrNull(x.note), created_at: str(x.created_at) }; }),
  };
}

function providerCountries<K extends string>(v: unknown, keys: K[]): ProviderCountries<K> {
  const o = obj(v);
  return {
    configured: Boolean(o.configured), error: strOrNull(o.error),
    countries: Array.isArray(o.countries)
      ? o.countries.map((c) => { const x = obj(c); return { country: str(x.country), ...Object.fromEntries(keys.map((k) => [k, num(x[k])])) } as { country: string } & Record<K, number>; })
      : null,
  };
}

export async function fetchAdminAudience(days: number, internal = false): Promise<AudienceResponse> {
  const r = obj(await get('audience', { days, ...(internal ? { internal: 1 } : {}) }));
  const g = obj(r.geo);
  const list = (v: unknown) => (Array.isArray(v) ? v.map(obj) : []);
  return {
    geo: {
      since: str(g.since), days: num(g.days), locatedSince: strOrNull(g.locatedSince),
      web: { devices: num(obj(g.web).devices), measurable: num(obj(g.web).measurable), located: num(obj(g.web).located), beforeLocation: num(obj(g.web).beforeLocation) },
      located: { total: num(obj(g.located).total), withRegion: num(obj(g.located).withRegion) },
      countries: list(g.countries).map((x) => ({ country: str(x.country), visitors: num(x.visitors), readers: num(x.readers), accounts: num(x.accounts), pro: num(x.pro) })),
      regions: list(g.regions).map((x) => ({ country: str(x.country), region: str(x.region), visitors: num(x.visitors), readers: num(x.readers) })),
      purchases: list(g.purchases).map((x) => ({ country: str(x.country), newPaying: num(x.newPaying), grossUsd: num(x.grossUsd) })),
    },
    searchConsole: providerCountries(r.searchConsole, ['clicks', 'impressions']),
    appStore: providerCountries(r.appStore, ['downloads']),
  };
}

export async function fetchAdminCosts(): Promise<CostRow[]> {
  const r = obj(await get('costs'));
  return Array.isArray(r.costs) ? r.costs.map(normalizeCost) : [];
}

export async function fetchAdminMembers(): Promise<MembersResponse> {
  const r = obj(await get('members'));
  return {
    subscriptions: (Array.isArray(r.subscriptions) ? r.subscriptions : []).map((v) => {
      const x = obj(v);
      return {
        identityId: str(x.identityId), email: strOrNull(x.email), provider: strOrNull(x.provider), status: strOrNull(x.status), productId: strOrNull(x.productId),
        currentPeriodEnd: strOrNull(x.currentPeriodEnd), updatedAt: strOrNull(x.updatedAt), active: Boolean(x.active),
      };
    }),
    grants: (Array.isArray(r.grants) ? r.grants : []).map((v) => {
      const x = obj(v);
      return { identityId: str(x.identityId), email: strOrNull(x.email), source: strOrNull(x.source), proUntil: strOrNull(x.proUntil), active: Boolean(x.active) };
    }),
  };
}

export async function fetchAdminUsers(opts: { q?: string; limit?: number; offset?: number } = {}): Promise<UsersResponse> {
  const r = obj(await get('users', { q: opts.q?.trim() || undefined, limit: opts.limit ?? 50, offset: opts.offset ?? 0 }));
  const users = Array.isArray(r.users) ? r.users.map(normalizeUser) : [];
  return { total: Math.max(num(r.total), users.length), accounts: num(r.accounts), wallets: num(r.wallets), internal: num(r.internal), readsSince: strOrNull(r.readsSince), users };
}

export async function fetchAdminCoupons(): Promise<CouponsResponse> {
  const r = obj(await get('coupons'));
  const totals = obj(r.totals);
  return {
    coupons: Array.isArray(r.coupons) ? r.coupons.map(normalizeCoupon) : [],
    redemptions: Array.isArray(r.redemptions)
      ? r.redemptions.map((v) => { const x = obj(v); return { code: str(x.code), identity_id: str(x.identity_id), email: strOrNull(x.email), reads: num(x.reads), profundo: num(x.profundo), maximo: num(x.maximo), created_at: str(x.created_at) }; })
      : [],
    totals: { coupons: numOrNull(totals.coupons), redemptions: numOrNull(totals.redemptions) },
  };
}

const ACTION_STATUS: ActionStatus[] = ['started', 'ok', 'failed'];
export async function fetchAdminActions(): Promise<ActionsResponse> {
  const r = obj(await get('actions'));
  return {
    actions: Array.isArray(r.actions)
      ? r.actions.map((v) => {
        const x = obj(v);
        const st = obj(x.detail).status;
        return {
          id: str(x.id), admin_email: strOrNull(x.admin_email), action: str(x.action), target: strOrNull(x.target), detail: x.detail ?? null,
          status: ACTION_STATUS.includes(st as ActionStatus) ? (st as ActionStatus) : null, created_at: str(x.created_at),
        };
      })
      : [],
    total: numOrNull(r.total),
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
