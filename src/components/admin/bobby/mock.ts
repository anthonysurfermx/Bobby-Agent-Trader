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
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'credit-mark', target: 'anthropic', detail: { kind: 'balance', amountUsd: 50 }, created_at: iso(NOW - 9 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'create-coupon', target: 'AMIGOS20', detail: { reads: 20, maxRedemptions: 100 }, created_at: iso(NOW - 12 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'grant', target: USERS[8].email, detail: { proDays: 30 }, created_at: iso(NOW - 2 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: USERS[3].email, action: 'set-coupon-active', target: 'PRENSA', detail: { active: false }, created_at: iso(NOW - 26 * HOUR) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'probe-llm', target: 'openai', detail: { status: 'no_credit', httpStatus: 429 }, created_at: iso(NOW - 3 * HOUR) },
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

function overview(days: number, bare: boolean) {
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
  const active = USERS.filter((u) => u.sub_status === 'active' || u.sub_status === 'trialing').length;
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
      },
      coupons: { active: COUPONS.filter((c) => c.active).length, redemptions: REDEMPTIONS.length, giftedReadsLeft: 164 },
    },
    integrations: bare
      ? {
        revenuecat: { configured: false }, appStore: { configured: false },
        llmCaps: { dayUsd: 0, monthUsd: 0, alertUsd: 0 }, paywall: false,
        missing: ['REVENUECAT_V2_SECRET_KEY', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER'], // what api/_lib/admin.ts reports
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
        llmCaps: { dayUsd: 15, monthUsd: 250, alertUsd: 10 }, paywall: false, missing: [],
      },
  };
}

function usersView(q: string, limit: number, offset: number) {
  const needle = q.trim().toLowerCase();
  const all = needle ? USERS.filter((u) => (u.email ?? '').toLowerCase().includes(needle) || u.id.includes(needle)) : USERS;
  // Postgres numerics arrive as strings; keep some that way on purpose.
  const users = all.slice(offset, offset + limit).map((u) => ({ ...u, reads: u.reads == null ? null : String(u.reads), activation_minutes: u.activation_minutes == null ? null : String(u.activation_minutes) }));
  return { total: all.length, users };
}

// ---------------------------------------------------------------- actions
class Refuse extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
const log = (action: string, target: string | null, detail: unknown) => {
  ACTIONS.unshift({ id: String(++ACTION_SEQ), admin_email: ME.email, action, target, detail, created_at: iso(Date.now()) });
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
  if (method === 'POST') {
    if (!body) return json({ error: 'missing_body' }, 400);
    try { return json(post(body)); } catch (e) { return e instanceof Refuse ? json({ error: e.code }, e.status) : json({ error: 'internal_error' }, 500); }
  }
  const view = query?.get('view');
  switch (view) {
    case 'me': return json({ admin: true, email: ME.email, identityId: ME.id });
    case 'overview': return json(overview(Number(query?.get('days') ?? 30), bare));
    case 'users': return json(usersView(query?.get('q') ?? '', Number(query?.get('limit') ?? 50), Number(query?.get('offset') ?? 0)));
    case 'coupons': return json({ coupons: COUPONS, redemptions: REDEMPTIONS });
    case 'actions': return json({ actions: ACTIONS });
    default: return json({ error: 'unknown_view' }, 400);
  }
}
