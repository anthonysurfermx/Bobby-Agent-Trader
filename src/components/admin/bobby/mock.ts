// DEV ONLY — fixture backend for /admin?mock. Loaded through a dynamic import that sits behind
// `import.meta.env.DEV`, so production builds never include it. It answers with real Response objects
// shaped exactly like /api/admin (including Postgres numerics as strings) so the normalizers, the error
// handling and every tab run the same code as in production.
//   ?mock          admin with every integration connected
//   ?mock=bare     admin, nothing connected (empty states, missing env list)
//   ?mock=401      not signed in      ?mock=403   signed in, not an admin      ?mock=500   server error
import type { AdminPostBody } from '@/lib/admin-client';

// ---------------------------------------------------------------- deterministic randomness
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261001);
const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(between(lo, hi + 1));
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
const round2 = (v: number) => Math.round(v * 100) / 100;

const NOW = Date.now();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();
function localDay(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.floor(rnd() * 16);
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

// ---------------------------------------------------------------- a year of series, sliced per period
const SPAN = 365;
const ALL_DAYS = Array.from({ length: SPAN }, (_, i) => localDay(NOW - (SPAN - 1 - i) * DAY));
const ramp = (i: number) => 0.35 + 0.65 * Math.pow(i / (SPAN - 1), 2); // the app grows toward today
const SERIES = {
  accounts: ALL_DAYS.map((_, i) => Math.max(0, Math.round(between(0, 3.2) * ramp(i)))),
  // Reads are pruned after 35 days, like bobby_reads.
  web: ALL_DAYS.map((_, i) => (i < SPAN - 35 ? 0 : Math.round(between(18, 80) * ramp(i)))),
  ios: ALL_DAYS.map((_, i) => (i < SPAN - 35 ? 0 : Math.round(between(25, 130) * ramp(i)))),
  android: ALL_DAYS.map((_, i) => (i > SPAN - 20 ? int(0, 7) : 0)),
  visits: ALL_DAYS.map((_, i) => Math.round(between(60, 240) * ramp(i))),
  revenue: ALL_DAYS.map((_, i) => (rnd() < 0.35 ? 0 : round2(pick([4.99, 4.99, 9.98, 14.97, 4.99]) * ramp(i)))),
  anthropic: ALL_DAYS.map(() => round2(between(0.4, 3.1) * 1000) / 1000),
  openai: ALL_DAYS.map(() => Math.round(between(0.002, 0.42) * 10000) / 10000),
};
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const tail = <T,>(xs: T[], n: number): T[] => xs.slice(xs.length - n);

// ---------------------------------------------------------------- users
const FIRST = ['maria', 'jose', 'ana', 'luis', 'sofia', 'diego', 'valeria', 'carlos', 'fernanda', 'jorge', 'camila', 'andres', 'lucia', 'pablo', 'daniela', 'miguel', 'paula', 'ricardo', 'renata', 'emilio'];
const LAST = ['gonzalez', 'hernandez', 'lopez', 'martinez', 'garcia', 'rodriguez', 'perez', 'sanchez', 'ramirez', 'torres', 'flores', 'rivera'];

interface MockUser {
  id: string; email: string | null; provider: string | null; wallet_only: boolean; created_at: string; last_seen_at: string | null;
  first_read_at: string | null; last_read_at: string | null; reads: number | null; platform: string | null; activation_minutes: number | null;
  sub_provider: string | null; sub_status: string | null; current_period_end: string | null; pro_until: string | null; grant_source: string | null;
  bonus_reads: number | null; bonus_profundo: number | null; bonus_maximo: number | null; is_admin: boolean; pro: boolean;
}

function makeUser(createdAt: number): MockUser {
  const roll = rnd();
  const provider = roll < 0.6 ? 'apple' : roll < 0.9 ? 'google' : null;
  const wallet = provider === null;
  const name = `${pick(FIRST)}.${pick(LAST)}${rnd() < 0.4 ? int(1, 99) : ''}`;
  const email = wallet ? null
    : provider === 'apple' && rnd() < 0.45 ? `${Math.floor(rnd() * 1e12).toString(36)}@privaterelay.appleid.com`
    : provider === 'apple' ? `${name}@icloud.com` : `${name}@gmail.com`;
  const activated = rnd() < 0.74;
  const activation = activated ? Math.round(Math.exp(between(-0.5, 7.5)) * 10) / 10 : null;
  const firstRead = activation != null ? Math.min(NOW - MIN, createdAt + activation * MIN) : null;
  const lastRead = firstRead != null ? between(firstRead, NOW) : null;
  const lastSeen = Math.max(lastRead ?? createdAt, between(createdAt, NOW));
  const subRoll = rnd();
  const sub = subRoll < 0.16;
  const subStatus = sub ? pick(['active', 'active', 'active', 'trialing', 'canceled', 'expired', 'billing_issue'] as const) : null;
  const subProvider = sub ? (rnd() < 0.82 ? 'apple' : 'stripe') : null;
  const paid = subStatus === 'active' || subStatus === 'trialing';
  const gifted = !paid && rnd() < 0.12;
  const bonus = rnd() < 0.2;
  return {
    id: uuid(), email, provider, wallet_only: wallet, created_at: iso(createdAt), last_seen_at: iso(lastSeen),
    first_read_at: firstRead != null ? iso(firstRead) : null, last_read_at: lastRead != null ? iso(lastRead) : null,
    reads: activated ? int(1, 140) : 0, platform: pick(['ios', 'ios', 'ios', 'web', 'web', 'android']), activation_minutes: activation,
    sub_provider: subProvider, sub_status: subStatus,
    current_period_end: sub ? iso(NOW + (paid ? between(2, 28) : -between(2, 40)) * DAY) : null,
    pro_until: gifted ? iso(NOW + between(3, 60) * DAY) : null, grant_source: gifted ? pick(['referral', 'admin', 'coupon']) : null,
    bonus_reads: bonus ? int(5, 50) : null, bonus_profundo: bonus && rnd() < 0.5 ? int(1, 5) : null, bonus_maximo: bonus && rnd() < 0.3 ? int(1, 2) : null,
    is_admin: false, pro: paid || gifted,
  };
}

const USERS: MockUser[] = Array.from({ length: 136 }, () => makeUser(NOW - between(0.05, 85) * DAY));
const ME: MockUser = {
  ...makeUser(NOW - 88 * DAY), email: 'owner@example.com', provider: 'apple', wallet_only: false, is_admin: true, pro: true,
  sub_provider: null, sub_status: null, current_period_end: null, grant_source: 'admin', pro_until: iso(NOW + 365 * DAY),
};
USERS.push(ME);
USERS[3].is_admin = true;
Object.assign(USERS[5], { sub_provider: 'apple', sub_status: 'active', current_period_end: iso(NOW - 3 * DAY), pro: false, grant_source: null, pro_until: null });
USERS.sort((a, b) => b.created_at.localeCompare(a.created_at));

// ---------------------------------------------------------------- coupons, actions, credit
interface MockCoupon { code: string; reads: number; profundo: number; maximo: number; max_redemptions: number | null; redeemed: number; expires_at: string | null; active: boolean; note: string | null; created_at: string }
const COUPONS: MockCoupon[] = [
  { code: 'AMIGOS20', reads: 20, profundo: 0, maximo: 0, max_redemptions: 100, redeemed: 37, expires_at: null, active: true, note: 'Grupo de WhatsApp de traders', created_at: iso(NOW - 12 * DAY) },
  { code: 'LANZAMIENTO', reads: 10, profundo: 2, maximo: 0, max_redemptions: null, redeemed: 58, expires_at: iso(NOW + 20 * DAY), active: true, note: 'Post de lanzamiento en X', created_at: iso(NOW - 9 * DAY) },
  { code: 'BOBBY-7K2QX', reads: 0, profundo: 0, maximo: 1, max_redemptions: 5, redeemed: 5, expires_at: null, active: true, note: null, created_at: iso(NOW - 6 * DAY) },
  { code: 'PRENSA', reads: 50, profundo: 5, maximo: 2, max_redemptions: 10, redeemed: 2, expires_at: null, active: false, note: 'Periodistas (pausado)', created_at: iso(NOW - 30 * DAY) },
  { code: 'VERANO25', reads: 15, profundo: 1, maximo: 0, max_redemptions: 200, redeemed: 81, expires_at: iso(NOW - 3 * DAY), active: true, note: null, created_at: iso(NOW - 60 * DAY) },
];
const REDEMPTIONS = Array.from({ length: 14 }, (_, i) => {
  const u = USERS[int(0, USERS.length - 1)];
  const c = pick(COUPONS);
  return { code: c.code, identity_id: u.id, email: u.email, reads: c.reads, profundo: c.profundo, maximo: c.maximo, created_at: iso(NOW - (i * 9 + between(0, 8)) * HOUR) };
});
let ACTION_SEQ = 0;
const ACTIONS: Array<{ id: string; admin_email: string | null; action: string; target: string | null; detail: unknown; created_at: string }> = [
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'create-coupon', target: 'AMIGOS20', detail: { reads: 20, maxRedemptions: 100, status: 'ok' }, created_at: iso(NOW - 12 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'credit-mark', target: 'anthropic', detail: { kind: 'balance', amountUsd: 50, status: 'ok' }, created_at: iso(NOW - 9 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'grant', target: USERS[8].email, detail: { proDays: 30, status: 'ok' }, created_at: iso(NOW - 2 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: USERS[3].email, action: 'delete-user', target: USERS[12].id, detail: { error: 'Type the account email to confirm.', status: 'failed' }, created_at: iso(NOW - 30 * HOUR) },
  { id: String(++ACTION_SEQ), admin_email: USERS[3].email, action: 'set-coupon-active', target: 'PRENSA', detail: { active: false, status: 'ok' }, created_at: iso(NOW - 26 * HOUR) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'probe-llm', target: 'openai', detail: { result: 'no_credit', httpStatus: 429, status: 'ok' }, created_at: iso(NOW - 3 * HOUR) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'add-cost', target: 'marketing', detail: { amountUsd: 60, status: 'started' }, created_at: iso(NOW - 20 * MIN) },
].reverse();
const CREDIT: Record<'anthropic' | 'openai', { mark: { amount: number; at: string } | null; topups: number; alert: string | null; calls: number; failures: number }> = {
  anthropic: { mark: { amount: 50, at: iso(NOW - 9 * DAY) }, topups: 0, alert: null, calls: 4120, failures: 3 },
  openai: { mark: null, topups: 0, alert: iso(NOW - 2 * DAY - 5 * HOUR), calls: 986, failures: 41 },
};

// ---------------------------------------------------------------- views
function llmProvider(p: 'anthropic' | 'openai') {
  const series = SERIES[p];
  const c = CREDIT[p];
  const spentSinceMark = c.mark ? sum(series.filter((_, i) => new Date(ALL_DAYS[i]).getTime() >= new Date(c.mark!.at).getTime() - DAY)) : 0;
  return {
    today: String(series[SPAN - 1]), week: String(round2(sum(tail(series, 7)) * 1000) / 1000), month: String(round2(sum(tail(series, 30)) * 1000) / 1000),
    calls: c.calls, failures: c.failures,
    balanceMark: c.mark, estimatedLeft: c.mark ? round2(c.mark.amount + c.topups - spentSinceMark) : null, lastCreditAlert: c.alert,
  };
}

const COVERAGE = {
  eventsSince: iso(NOW - 6 * HOUR), devicesSince: iso(NOW - 6 * HOUR), readsSince: iso(NOW - 35 * DAY), readerStatsSince: iso(NOW - 6 * HOUR),
  purchasesSince: iso(NOW - 41 * DAY), ledgerSince: iso(NOW - 120 * DAY), ledgerSurfaces: ['desk', 'cycle', 'agent-run', 'explain'],
};
const BARE_COVERAGE = { ...COVERAGE, purchasesSince: null, ledgerSurfaces: ['desk'] };

function couponStatus(c: MockCoupon) {
  if (!c.active) return 'inactive';
  if (c.expires_at && new Date(c.expires_at).getTime() <= Date.now()) return 'expired';
  if (c.max_redemptions != null && c.redeemed >= c.max_redemptions) return 'exhausted';
  return 'active';
}

function overview(days: number, bare: boolean, compare = false, partial = false) {
  const n = Math.min(Math.max(Math.round(days) || 30, 1), SPAN);
  const d = tail(ALL_DAYS, n);
  const accountsDaily = tail(SERIES.accounts, n);
  const web = tail(SERIES.web, n), ios = tail(SERIES.ios, n), android = tail(SERIES.android, n);
  const reads = sum(web) + sum(ios) + sum(android);
  // bare: nothing connected yet, so the money and the web events are empty too (empty states).
  const visits = bare ? Array<number>(n).fill(0) : tail(SERIES.visits, n);
  const revenue = bare ? Array<number>(n).fill(0) : tail(SERIES.revenue, n);
  const gross = round2(sum(revenue));
  const newAccounts = sum(accountsDaily);
  const scale = n / 30;
  const visitors = Math.round(sum(visits) * 0.82);
  const active = USERS.filter((u) => (u.sub_status === 'active' || u.sub_status === 'trialing') && (!u.current_period_end || new Date(u.current_period_end).getTime() > Date.now())).length;
  const appDays = tail(ALL_DAYS, n);
  const downloads = appDays.map((_, i) => Math.round(between(4, 26) * ramp(SPAN - n + i)));
  return {
    overview: {
      days: d,
      since: d[0],
      accounts: {
        total: USERS.filter((u) => !u.wallet_only).length, new: newAccounts, wallets: USERS.filter((u) => u.wallet_only).length, active7d: 96,
        byProvider: { apple: USERS.filter((u) => u.provider === 'apple').length, google: USERS.filter((u) => u.provider === 'google').length },
        daily: accountsDaily,
      },
      activity: {
        reads: String(reads), readsDaily: { web, ios, android },
        levels: { profundo: Math.round(reads * 0.09), maximo: Math.round(reads * 0.03) },
        activeReaders7d: 143,
        activation: { accounts: newAccounts, activated: Math.round(newAccounts * 0.72), medianMinutes: '6.4' },
      },
      funnel: {
        web: {
          visitors, deskVisitors: Math.round(visitors * 0.41), appStoreClicks: Math.round(visitors * 0.04), signinStarts: Math.round(visitors * 0.062),
          guestReaders: Math.round(visitors * 0.22), accounts: Math.round(visitors * 0.031), paywallViews: Math.round(120 * scale), pro: Math.max(1, Math.round(6 * scale)),
        },
        ios: { guestReaders: Math.round(610 * scale), accounts: Math.round(140 * scale), paywallViews: Math.round(260 * scale), pro: Math.max(1, Math.round(14 * scale)) },
        visitsDaily: visits,
        topSurfaces: bare ? [] : [
          { surface: 'home', visitors: Math.round(visitors * 0.62) }, { surface: 'desk', visitors: Math.round(visitors * 0.41) },
          { surface: 'app', visitors: Math.round(visitors * 0.18) }, { surface: 'protocol', visitors: Math.round(visitors * 0.07) },
          { surface: 'redeem', visitors: Math.round(visitors * 0.05) }, { surface: 'signin', visitors: Math.round(visitors * 0.04) },
        ],
        topReferrers: bare ? [] : [
          { referrer: 'direct', visitors: Math.round(visitors * 0.44) }, { referrer: 't.co', visitors: Math.round(visitors * 0.21) },
          { referrer: 'google.com', visitors: Math.round(visitors * 0.12) }, { referrer: 'instagram.com', visitors: Math.round(visitors * 0.08) },
          { referrer: 'apps.apple.com', visitors: Math.round(visitors * 0.05) }, { referrer: 'linkedin.com', visitors: Math.round(visitors * 0.02) },
        ],
      },
      subscriptions: {
        active,
        byStatus: USERS.reduce<Record<string, number>>((acc, u) => { if (u.sub_status) acc[u.sub_status] = (acc[u.sub_status] ?? 0) + 1; return acc; }, {}),
        byProvider: USERS.reduce<Record<string, number>>((acc, u) => { if (u.sub_provider && (u.sub_status === 'active' || u.sub_status === 'trialing')) acc[u.sub_provider] = (acc[u.sub_provider] ?? 0) + 1; return acc; }, {}),
        giftedPro: USERS.filter((u) => u.grant_source && u.pro).length,
      },
      revenue: {
        grossUsd: String(gross), netUsd: String(round2(gross * 0.85 - 4.99)), refundsUsd: '4.99',
        newSubscriptions: Math.round(11 * scale), renewals: Math.round(19 * scale), cancellations: Math.round(4 * scale), expirations: Math.round(2 * scale), sandboxEvents: 7,
        daily: revenue.map(String),
      },
      llm: {
        providers: { anthropic: llmProvider('anthropic'), openai: llmProvider('openai') },
        daily: d.map((_, i) => ({ anthropic: tail(SERIES.anthropic, n)[i], openai: String(tail(SERIES.openai, n)[i]) })),
        bySurface: bare ? [{ surface: 'desk', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)))), calls: 812, failures: 2 }] : [
          { surface: 'desk', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)) * 0.72)), calls: Math.round(2900 * scale), failures: 2 },
          { surface: 'cycle', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)) * 0.2)), calls: Math.round(860 * scale), failures: 1 },
          { surface: 'explain', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)) * 0.08)), calls: Math.round(360 * scale), failures: 0 },
          { surface: 'agent-run', provider: 'openai', usd: String(round2(sum(tail(SERIES.openai, n)))), calls: Math.round(986 * scale), failures: 41 },
        ],
        guard: GUARD,
      },
      coupons: { active: COUPONS.filter((c) => couponStatus(c) === 'active').length, redemptions: REDEMPTIONS.length, giftedReadsLeft: 164 },
      coverage: bare ? BARE_COVERAGE : COVERAGE,
    },
    integrations: compare ? null : bare
      ? {
        revenuecat: { configured: false }, appStore: { configured: false },
        llmCaps: { dayUsd: 15, monthUsd: 300, alertUsd: 100 }, paywall: false,
        llmGuard: { dayUsd: GUARD.day, monthUsd: GUARD.month },
        health: {
          revenuecatWebhook: { configured: false, lastEventAt: null, events30d: 0 },
          tracking: { lastEventAt: null, events24h: 0 },
          llmKeys: { anthropic: true, openai: false }, vercelAnalytics: 'unverified',
        },
        // what api/_lib/admin.ts reports when nothing is set up
        missing: ['REVENUECAT_V2_SECRET_KEY', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER', 'GSC_SERVICE_ACCOUNT_JSON', 'REVENUECAT_SECRET_KEY', 'REVENUECAT_WEBHOOK_AUTH', 'OPENAI_API_KEY'],
      }
      : {
        revenuecat: {
          configured: true,
          metrics: [
            { id: 'mrr', name: 'MRR', value: round2(active * 4.99 * 0.85), unit: '$', period: 'P28D' },
            { id: 'active_subscriptions', name: 'Suscripciones activas', value: active },
            { id: 'active_trials', name: 'Pruebas activas', value: USERS.filter((u) => u.sub_status === 'trialing').length },
            { id: 'revenue', name: 'Ingresos', value: round2(gross * 1.1), unit: '$', period: 'P28D' },
            { id: 'new_customers', name: 'Clientes nuevos', value: 212, period: 'P28D' },
            { id: 'active_users', name: 'Usuarios activos', value: 1043, period: 'P28D' },
          ],
        },
        appStore: {
          configured: true, days: appDays, downloads,
          totals: { downloads: sum(downloads), redownloads: Math.round(sum(downloads) * 0.11), updates: Math.round(sum(downloads) * 1.7), iap: Math.round(17 * scale) },
        },
        llmCaps: { dayUsd: 15, monthUsd: 300, alertUsd: 100 }, paywall: false, missing: [],
        llmGuard: { dayUsd: GUARD.day, monthUsd: GUARD.month },
        health: partial ? undefined : {
          revenuecatWebhook: { configured: true, lastEventAt: iso(NOW - 5 * HOUR), events30d: 43 },
          tracking: { lastEventAt: iso(NOW - 3 * MIN), events24h: 1840 },
          llmKeys: { anthropic: true, openai: true }, vercelAnalytics: 'unverified',
        },
      },
  };
}

/** ?mock=partial: the server omitted whole sections; the dashboard must say so instead of drawing zeros. */
function partialOverview(days: number) {
  const full = overview(days, false, false, true) as { overview: Record<string, unknown> & { funnel: Record<string, unknown> }; integrations: unknown };
  delete full.overview.revenue;
  delete full.overview.funnel.visitsDaily;
  delete full.overview.coverage;
  return full;
}

function usersView(q: string, limit: number, offset: number) {
  const needle = q.trim().toLowerCase();
  const all = needle ? USERS.filter((u) => (u.email ?? '').toLowerCase().includes(needle) || u.id.includes(needle)) : USERS;
  // Postgres numerics arrive as strings; keep some that way on purpose.
  const users = all.slice(offset, offset + limit).map((u) => ({ ...u, reads: u.reads == null ? null : String(u.reads), activation_minutes: u.activation_minutes == null ? null : String(u.activation_minutes) }));
  return { total: all.length, users };
}

// ---------------------------------------------------------------- lifecycle, economics, costs
interface MockCost { id: number; kind: 'marketing' | 'infra' | 'other'; channel: string | null; amount_usd: number; spent_on: string; note: string | null; created_at: string }
let COST_SEQ = 0;
const cost = (kind: MockCost['kind'], channel: string | null, usd: number, daysAgo: number, note: string | null): MockCost =>
  ({ id: ++COST_SEQ, kind, channel, amount_usd: usd, spent_on: localDay(NOW - daysAgo * DAY), note, created_at: iso(NOW - daysAgo * DAY + HOUR) });
const COSTS: MockCost[] = [
  cost('other', 'apple', 99, 80, 'Apple Developer Program'),
  cost('infra', 'vercel', 20, 26, 'Vercel Pro'),
  cost('infra', 'supabase', 25, 25, null),
  cost('marketing', 'tiktok', 120, 21, 'Campaña de lanzamiento'),
  cost('marketing', 'influencer', 250, 12, 'Genera tu sueldo'),
  cost('marketing', 'meta', 60, 5, null),
];
// The spend guard's own figures (desk only, UTC calendar day and month).
const GUARD = { day: 2.18, month: 41.37 };
const LAST_PRICE_USD: number | null = 4.99;
let ASSUMPTIONS: { monthlyChurn?: number; priceUsd?: number; storeFee?: number; maxLifetimeMonths?: number } = {};

/** The server's unitEconomics (api/_lib/admin.ts), on fixture inputs. */
function economics(n: number) {
  const since = tail(ALL_DAYS, n)[0];
  const r2 = (v: number | null, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  const gross = round2(sum(tail(SERIES.revenue, n)));
  // Like the server: the last real purchase sets the price; the store fee comes from the assumption until
  // purchase events carry a take-home rate.
  const priceUsd = LAST_PRICE_USD ?? ASSUMPTIONS.priceUsd ?? 4.99;
  const takehome = 1 - (ASSUMPTIONS.storeFee ?? 0.15);
  const active = USERS.filter((u) => u.sub_status === 'active' || u.sub_status === 'trialing').length;
  const newPaying = Math.max(1, Math.round(11 * (n / 30)));
  const monthlyChurn = ASSUMPTIONS.monthlyChurn ?? 0.1;
  const churnSource = ASSUMPTIONS.monthlyChurn ? 'assumed' : 'default';
  const llm = sum(tail(SERIES.anthropic, n)) + sum(tail(SERIES.openai, n));
  const llm30 = sum(tail(SERIES.anthropic, 30)) + sum(tail(SERIES.openai, 30));
  const llmPerReader = llm30 / 940;
  const contribution = priceUsd * takehome - llmPerReader;
  const lifetime = Math.min(1 / monthlyChurn, ASSUMPTIONS.maxLifetimeMonths ?? 36);
  const ltv = contribution * lifetime;
  const inWindow = COSTS.filter((c) => c.spent_on >= since);
  const by = (k: MockCost['kind']) => inWindow.filter((c) => c.kind === k).reduce((a, c) => a + c.amount_usd, 0);
  const marketing = by('marketing');
  const channels = new Map<string, number>();
  for (const c of inWindow.filter((x) => x.kind === 'marketing')) channels.set(c.channel ?? 'other', (channels.get(c.channel ?? 'other') ?? 0) + c.amount_usd);
  const newAccounts = Math.round(26 * (n / 30));
  const cacPaying = newPaying > 0 ? marketing / newPaying : null;
  const total = marketing + by('infra') + by('other') + llm;
  const net = gross * takehome;
  return {
    days: n, since,
    revenue: { grossUsd: String(gross), netUsd: r2(net), refundsUsd: 4.99, mrrGrossUsd: r2(active * priceUsd), mrrNetUsd: r2(active * priceUsd * takehome), activeSubscriptions: active, newPaying, priceUsd, takehome },
    costs: { marketingUsd: r2(marketing), infraUsd: r2(by('infra')), otherUsd: r2(by('other')), llmUsd: r2(llm, 4), totalUsd: r2(total), byChannel: [...channels].sort((a, b) => b[1] - a[1]).map(([channel, usd]) => ({ channel, usd })) },
    acquisition: { newAccounts, newPaying, cacPerAccount: newAccounts ? r2(marketing / newAccounts) : null, cacPerPaying: r2(cacPaying) },
    ltv: {
      monthlyNetPerSubUsd: r2(priceUsd * takehome), monthlyLlmPerUserUsd: r2(llmPerReader, 4), monthlyContributionUsd: r2(contribution),
      monthlyChurn, churnSource, lifetimeMonths: r2(lifetime, 1), ltvUsd: r2(ltv),
      ltvToCac: cacPaying ? r2(ltv / cacPaying) : null, paybackMonths: cacPaying && contribution > 0 ? r2(cacPaying / contribution, 1) : null,
    },
    roi: { profitUsd: r2(net - total), roi: total > 0 ? r2((net - total) / total, 4) : null },
    assumptions: { monthlyChurn: ASSUMPTIONS.monthlyChurn ?? null, priceUsd: ASSUMPTIONS.priceUsd ?? null, storeFee: ASSUMPTIONS.storeFee ?? null, maxLifetimeMonths: ASSUMPTIONS.maxLifetimeMonths ?? null },
  };
}

function lifecycle(days: number, bare: boolean) {
  const n = Math.min(Math.max(Math.round(days) || 30, 1), SPAN);
  const k = n / 30;
  const r = (v: number) => Math.round(v * k);
  const web = {
    devices: r(3400), home: r(2150), desk: r(1480), appStoreClick: r(128), read1: r(690), read2: r(372), read5: r(141),
    signinStart: r(206), account: r(94), returned: r(262), paywall: r(108), pro: Math.max(1, r(5)),
    engaged: r(1690), accountAfterRead: r(81), proAfterRead: Math.max(1, r(4)), returnedAfterRead: r(214),
    medianMinutesToFirstRead: '4.2', medianMinutesToAccount: '38.5',
    retention: { d1: { eligible: r(3260), returned: r(560) }, d7: { eligible: r(2540), returned: r(170) } },
  };
  const ios = {
    devices: r(640), home: 0, desk: 0, appStoreClick: 0, read1: r(512), read2: r(361), read5: r(168),
    signinStart: r(151), account: r(129), returned: r(302), paywall: 0, pro: Math.max(1, r(12)),
    engaged: r(512), accountAfterRead: r(124), proAfterRead: Math.max(1, r(11)), returnedAfterRead: r(281),
    medianMinutesToFirstRead: 1.6, medianMinutesToAccount: 22,
    retention: { d1: { eligible: r(612), returned: r(221) }, d7: { eligible: r(470), returned: r(96) } },
  };
  const dayList = tail(ALL_DAYS, n);
  const clicks = dayList.map((_, i) => (bare ? 0 : Math.round(between(18, 70) * ramp(SPAN - n + i))));
  const impressions = clicks.map((c) => Math.round(c * between(16, 34)));
  const tc = sum(clicks), ti = sum(impressions);
  const downloads = dayList.map((_, i) => Math.round(between(4, 26) * ramp(SPAN - n + i)));
  return {
    lifecycle: {
      since: iso(new Date(`${dayList[0]}T00:00:00`).getTime()), web, ios,
      stages: { total: 4120, accounts: 128, guests: 3992, new: 430, activated: 975, engaged: 318, pro: 24, atRisk: 905, lost: 1402, byPlatform: { web: 3310, ios: 790, unknown: 20 } },
    },
    economics: economics(n),
    coverage: bare ? BARE_COVERAGE : COVERAGE,
    instrumentation: { webVisits: true, webPaywall: true, iosVisits: false, iosPaywall: false, purchaseStart: false },
    searchConsole: bare ? { configured: false } : {
      configured: true, site: 'https://bobbyprotocol.xyz/', days: dayList, clicks, impressions,
      totals: { clicks: tc, impressions: ti, ctr: ti ? tc / ti : 0, position: 14.6 },
      topQueries: [
        { query: 'bobby ia trading', clicks: Math.round(tc * 0.22), impressions: Math.round(ti * 0.06), ctr: 0.18, position: 2.1 },
        { query: 'bobby protocol', clicks: Math.round(tc * 0.17), impressions: Math.round(ti * 0.03), ctr: 0.31, position: 1.4 },
        { query: 'analisis nvda con ia', clicks: Math.round(tc * 0.08), impressions: Math.round(ti * 0.11), ctr: 0.03, position: 9.8 },
        { query: 'debate ia mercado', clicks: Math.round(tc * 0.05), impressions: Math.round(ti * 0.07), ctr: 0.04, position: 12.3 },
        { query: 'app para invertir con ia', clicks: Math.round(tc * 0.04), impressions: Math.round(ti * 0.19), ctr: 0.01, position: 27.5 },
      ],
      topPages: [
        { page: 'https://bobbyprotocol.xyz/', clicks: Math.round(tc * 0.58), impressions: Math.round(ti * 0.41) },
        { page: 'https://bobbyprotocol.xyz/desk', clicks: Math.round(tc * 0.21), impressions: Math.round(ti * 0.22) },
        { page: 'https://bobbyprotocol.xyz/protocol', clicks: Math.round(tc * 0.12), impressions: Math.round(ti * 0.24) },
        { page: 'https://bobbyprotocol.xyz/app', clicks: Math.round(tc * 0.06), impressions: Math.round(ti * 0.09) },
      ],
    },
    appStore: bare ? { configured: false } : {
      configured: true, days: dayList, downloads,
      totals: { downloads: sum(downloads), redownloads: Math.round(sum(downloads) * 0.11), updates: Math.round(sum(downloads) * 1.7), iap: Math.round(17 * k) },
    },
  };
}

function members() {
  const subscriptions = USERS.filter((u) => u.sub_status).map((u) => ({
    identityId: u.id, email: u.email, provider: u.sub_provider, status: u.sub_status,
    productId: u.sub_provider === 'apple' ? 'bobby_pro_monthly' : 'price_bobby_pro_monthly',
    currentPeriodEnd: u.current_period_end, updatedAt: u.last_seen_at,
    active: (u.sub_status === 'active' || u.sub_status === 'trialing') && (!u.current_period_end || new Date(u.current_period_end).getTime() > Date.now()),
  }));
  const grants = USERS.filter((u) => u.grant_source).map((u) => ({
    identityId: u.id, email: u.email, source: u.grant_source === 'coupon' ? 'admin' : u.grant_source, proUntil: u.pro_until,
    active: !!u.pro_until && new Date(u.pro_until).getTime() > Date.now(),
  }));
  return { subscriptions, grants };
}

// ---------------------------------------------------------------- actions
class Refuse extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
const log = (action: string, target: string | null, detail: unknown) => {
  ACTIONS.unshift({ id: String(++ACTION_SEQ), admin_email: ME.email, action, target, detail: { ...(detail as object), status: 'ok' }, created_at: iso(Date.now()) });
};
const findUser = (id: string) => { const u = USERS.find((x) => x.id === id); if (!u) throw new Refuse(404, 'user_not_found'); return u; };

function post(body: AdminPostBody): Record<string, unknown> {
  switch (body.action) {
    case 'create-coupon': {
      const code = body.code?.trim().toUpperCase() || `BOBBY-${Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[int(0, 31)]).join('')}`;
      if (!/^[A-Z0-9][A-Z0-9-]{3,31}$/.test(code)) throw new Refuse(400, 'invalid_code');
      if (COUPONS.some((c) => c.code === code)) throw new Refuse(409, 'That code already exists.');
      if (body.reads + body.profundo + body.maximo <= 0) throw new Refuse(400, 'empty_coupon');
      const coupon: MockCoupon = { code, reads: body.reads, profundo: body.profundo, maximo: body.maximo, max_redemptions: body.maxRedemptions, redeemed: 0, expires_at: body.expiresAt, active: true, note: body.note ?? null, created_at: iso(Date.now()) };
      COUPONS.unshift(coupon);
      log('create-coupon', code, { reads: body.reads, profundo: body.profundo, maximo: body.maximo, maxRedemptions: body.maxRedemptions });
      return { ok: true, coupon };
    }
    case 'set-coupon-active': {
      const c = COUPONS.find((x) => x.code === body.code);
      if (!c) throw new Refuse(404, 'coupon_not_found');
      c.active = body.active;
      log('set-coupon-active', c.code, { active: body.active });
      return { ok: true };
    }
    case 'grant': {
      const u = findUser(body.identityId);
      if (body.reads) u.bonus_reads = (u.bonus_reads ?? 0) + body.reads;
      if (body.profundo) u.bonus_profundo = (u.bonus_profundo ?? 0) + body.profundo;
      if (body.maximo) u.bonus_maximo = (u.bonus_maximo ?? 0) + body.maximo;
      if (body.proDays) {
        const from = Math.max(Date.now(), u.pro_until ? new Date(u.pro_until).getTime() : 0);
        u.pro_until = iso(from + body.proDays * DAY); u.pro = true; u.grant_source = u.grant_source ?? 'admin';
      }
      log('grant', u.email ?? u.id, { reads: body.reads, profundo: body.profundo, maximo: body.maximo, proDays: body.proDays });
      return { ok: true };
    }
    case 'delete-user': {
      const u = findUser(body.identityId);
      if (u.id === ME.id) throw new Refuse(400, 'You cannot delete your own account from here.');
      if (body.confirm.trim().toLowerCase() !== (u.email ?? u.id).toLowerCase()) throw new Refuse(400, 'Type the account email to confirm.');
      USERS.splice(USERS.indexOf(u), 1);
      log('delete-user', u.email ?? u.id, { provider: u.provider });
      return { ok: true };
    }
    case 'set-admin': {
      const u = findUser(body.identityId);
      if (u.id === ME.id && !body.admin) throw new Refuse(400, 'You cannot remove your own admin role.');
      u.is_admin = body.admin;
      log('set-admin', u.email ?? u.id, { admin: body.admin });
      return { ok: true };
    }
    case 'credit-mark': {
      const c = CREDIT[body.provider];
      if (body.kind === 'balance') { c.mark = { amount: body.amountUsd, at: iso(Date.now()) }; c.topups = 0; }
      else { if (!c.mark) throw new Refuse(400, 'Registra primero un saldo; la recarga se suma a él.'); c.topups += body.amountUsd; }
      log('credit-mark', body.provider, { kind: body.kind, amountUsd: body.amountUsd, note: body.note });
      return { ok: true };
    }
    case 'probe-llm': {
      const r = body.provider === 'anthropic' ? { status: 'ok', httpStatus: 200 } : { status: 'no_credit', httpStatus: 429, code: 'insufficient_quota' };
      log('probe-llm', body.provider, r);
      return { ok: true, ...r };
    }
    case 'add-cost': {
      const today = localDay(Date.now());
      const spentOn = body.spentOn && /^\d{4}-\d{2}-\d{2}$/.test(body.spentOn) ? body.spentOn : today;
      if (!['marketing', 'infra', 'other'].includes(body.kind) || !(body.amountUsd > 0) || body.amountUsd > 1_000_000) throw new Refuse(400, 'Invalid cost.');
      if (spentOn > today) throw new Refuse(400, 'The date cannot be in the future.');
      const channel = body.channel?.trim() ? body.channel.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32) : null;
      const row: MockCost = { id: ++COST_SEQ, kind: body.kind, channel, amount_usd: Math.round(body.amountUsd * 100) / 100, spent_on: spentOn, note: body.note?.trim() || null, created_at: iso(Date.now()) };
      COSTS.push(row);
      log('add-cost', body.kind, { amountUsd: body.amountUsd, channel, spentOn });
      return { ok: true, cost: row };
    }
    case 'delete-cost': {
      const i = COSTS.findIndex((c) => c.id === body.id);
      if (i < 0) throw new Refuse(404, 'Cost not found.');
      const [row] = COSTS.splice(i, 1);
      log('delete-cost', String(body.id), { cost: row });
      return { ok: true };
    }
    case 'set-assumptions': {
      // Like the server: merge. Absent = keep, null = back to the default.
      const next: typeof ASSUMPTIONS = { ...ASSUMPTIONS };
      const opt = (key: keyof typeof ASSUMPTIONS, min: number, max: number) => {
        if (!(key in body)) return;
        const v = body[key];
        if (v == null) { delete next[key]; return; }
        if (!Number.isFinite(v) || v < min || v > max) throw new Refuse(400, `Invalid ${key}.`);
        next[key] = v;
      };
      opt('monthlyChurn', 0.001, 1); opt('priceUsd', 0.5, 1000); opt('storeFee', 0, 0.5); opt('maxLifetimeMonths', 1, 120);
      ASSUMPTIONS = next;
      log('set-assumptions', 'unit_economics', next);
      return { ok: true, assumptions: next };
    }
  }
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function mockAdminFetch(mode: string, method: 'GET' | 'POST', query: URLSearchParams | null, body?: AdminPostBody): Promise<Response> {
  await wait(method === 'POST' ? 450 : 280);
  if (mode === '401') return json({ error: 'unauthorized' }, 401);
  if (mode === '403') return json({ error: 'not_admin' }, 403);
  if (mode === '500') return json({ error: 'internal_error' }, 500);
  const bare = mode === 'bare';
  const partial = mode === 'partial';
  if (method === 'POST') {
    if (!body) return json({ error: 'missing_body' }, 400);
    try { return json(post(body)); } catch (e) { return e instanceof Refuse ? json({ error: e.code }, e.status) : json({ error: 'internal_error' }, 500); }
  }
  const view = query?.get('view');
  switch (view) {
    case 'me': return json({ admin: true, email: ME.email, identityId: ME.id });
    case 'overview': {
      const days = Number(query?.get('days') ?? 30);
      const compare = query?.get('compare') === '1';
      return json(partial && !compare ? partialOverview(days) : overview(days, bare, compare));
    }
    case 'users': return json(usersView(query?.get('q') ?? '', Number(query?.get('limit') ?? 50), Number(query?.get('offset') ?? 0)));
    case 'coupons': return json({ coupons: COUPONS.map((c) => ({ ...c, status: couponStatus(c) })), redemptions: REDEMPTIONS, totals: { coupons: COUPONS.length, redemptions: REDEMPTIONS.length + 120 } });
    case 'actions': return json({ actions: ACTIONS, total: ACTIONS.length + 40 });
    case 'members': return json(members());
    case 'lifecycle': return json(lifecycle(Number(query?.get('days') ?? 30), bare));
    case 'costs': return json({ costs: [...COSTS].sort((x, y) => y.spent_on.localeCompare(x.spent_on) || y.id - x.id) });
    default: return json({ error: 'unknown_view' }, 400);
  }
}
