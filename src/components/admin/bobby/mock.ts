// DEV ONLY — fixture backend for /admin?mock. Loaded through a dynamic import that sits behind
// `import.meta.env.DEV`, so production builds never include it. It answers with real Response objects
// shaped exactly like /api/admin (including Postgres numerics as strings) so the normalizers, the error
// handling and every tab run the same code as in production.
//   ?mock          admin with every integration connected; one membership of each commercial class
//   ?mock=bare     admin, nothing connected (empty states, missing env list, no purchase event ever, no memberships)
//   ?mock=partial  the server omitted whole sections, the /admin mark failed and Apple's load ran out of time
//   ?mock=401      not signed in      ?mock=403   signed in, not an admin      ?mock=500   server error
//   ?mock=grant-lost  first gift commits to the fixture but its confirmation fails; same-key retry confirms once
import type { AdminPostBody, MemberCommercial, MemberCommercialReason } from '@/lib/admin-client';

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
// One membership of each commercial class (the rest follow their random status): see SUB_STORE below.
const liveSub = (provider: 'apple' | 'stripe', status: 'active' | 'trialing') => ({ sub_provider: provider, sub_status: status, current_period_end: iso(NOW + 20 * DAY), pro: true, grant_source: null, pro_until: null });
Object.assign(USERS[3], liveSub('apple', 'active')); // the team's tester: sandbox, left out unless "Con equipo"
for (const k of [10, 11, 13, 14]) Object.assign(USERS[k], liveSub('apple', k === 14 ? 'trialing' : 'active'));
Object.assign(USERS[12], liveSub('stripe', 'active'));
interface SubStore { environment: 'production' | 'sandbox' | 'unknown'; periodType: 'normal' | 'trial' | 'intro' | 'prepaid' | 'unknown'; storeCheckedAt: string | null; firstChargeAt: string | null; lastChargeAt: string | null; internal: boolean }
const SUB_STORE = new Map<string, SubStore>([
  [USERS[3].id, { environment: 'sandbox', periodType: 'normal', storeCheckedAt: iso(NOW - 2 * DAY), firstChargeAt: null, lastChargeAt: null, internal: true }],
  [USERS[10].id, { environment: 'production', periodType: 'normal', storeCheckedAt: iso(NOW - 6 * HOUR), firstChargeAt: iso(NOW - 41 * DAY), lastChargeAt: iso(NOW - 11 * DAY), internal: false }],
  // Like production after the r2 migration: a real charge on record, but the store's environment never read.
  [USERS[11].id, { environment: 'unknown', periodType: 'unknown', storeCheckedAt: null, firstChargeAt: iso(NOW - 2 * DAY), lastChargeAt: iso(NOW - 2 * DAY), internal: false }],
  [USERS[12].id, { environment: 'production', periodType: 'normal', storeCheckedAt: iso(NOW - DAY), firstChargeAt: null, lastChargeAt: null, internal: false }],
  [USERS[13].id, { environment: 'sandbox', periodType: 'normal', storeCheckedAt: iso(NOW - 3 * HOUR), firstChargeAt: null, lastChargeAt: null, internal: false }],
  [USERS[14].id, { environment: 'production', periodType: 'trial', storeCheckedAt: iso(NOW - 5 * HOUR), firstChargeAt: null, lastChargeAt: null, internal: false }],
]);
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
// In-memory fixtures only. The production grant receipt lives in PostgreSQL.
const GRANT_RECEIPTS = new Map<string, { payload: string; result: Record<string, unknown> }>();
const LOST_GRANT_RESPONSES = new Set<string>();
const ACTIONS: Array<{ id: string; admin_email: string | null; action: string; target: string | null; detail: unknown; created_at: string }> = [
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'create-coupon', target: 'AMIGOS20', detail: { reads: 20, maxRedemptions: 100, status: 'ok' }, created_at: iso(NOW - 12 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'credit-mark', target: 'anthropic', detail: { kind: 'balance', amountUsd: 50, status: 'ok' }, created_at: iso(NOW - 9 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'grant', target: USERS[8].email, detail: { proDays: 30, status: 'ok' }, created_at: iso(NOW - 2 * DAY) },
  { id: String(++ACTION_SEQ), admin_email: USERS[3].email, action: 'delete-user', target: USERS[12].id, detail: { error: 'Type the account email to confirm.', status: 'failed' }, created_at: iso(NOW - 30 * HOUR) },
  { id: String(++ACTION_SEQ), admin_email: USERS[3].email, action: 'set-coupon-active', target: 'PRENSA', detail: { active: false, status: 'ok' }, created_at: iso(NOW - 26 * HOUR) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'probe-llm', target: 'openai', detail: { result: 'no_credit', httpStatus: 429, status: 'ok' }, created_at: iso(NOW - 3 * HOUR) },
  { id: String(++ACTION_SEQ), admin_email: ME.email, action: 'add-cost', target: 'marketing', detail: { amountUsd: 60, status: 'started' }, created_at: iso(NOW - 20 * MIN) },
].reverse();
const CREDIT: Record<'anthropic' | 'openai', { mark: { amount: number; at: string } | null; topups: number; topupAt: string | null; alert: string | null; calls: number; failures: number }> = {
  anthropic: { mark: { amount: 50, at: iso(NOW - 9 * DAY) }, topups: 0, topupAt: null, alert: null, calls: 4120, failures: 3 },
  openai: { mark: null, topups: 0, topupAt: null, alert: iso(NOW - 2 * DAY - 5 * HOUR), calls: 986, failures: 41 },
};

// ---------------------------------------------------------------- views
function llmProvider(p: 'anthropic' | 'openai', bare: boolean) {
  const series = SERIES[p];
  const c = CREDIT[p];
  const spentSinceMark = c.mark ? sum(series.filter((_, i) => new Date(ALL_DAYS[i]).getTime() >= new Date(c.mark!.at).getTime() - DAY)) : 0;
  return {
    today: String(series[SPAN - 1]), week: String(round2(sum(tail(series, 7)) * 1000) / 1000), month: String(round2(sum(tail(series, 30)) * 1000) / 1000),
    period: String(round2(sum(tail(series, 30)) * 1000) / 1000), calls: c.calls, failures: c.failures,
    balanceMark: c.mark, estimatedLeft: c.mark ? round2(c.mark.amount + c.topups - spentSinceMark) : null, lastCreditAlert: c.alert,
    creditAlert: c.alert ? { code: 'insufficient_quota', endpoint: 'tts', email: bare ? { accepted: false, error: 'not_configured' } : { accepted: true, id: 'mock-alert-0001' } } : null,
    lastTopup: c.topupAt,
    lastOk: iso(NOW - (c.alert ? 3 * DAY : 4 * MIN)), lastFailure: c.failures ? { at: iso(NOW - 2 * DAY), stop: 'http_429', surface: 'desk' } : null,
    failures24h: c.alert ? 3 : 0, calls24h: c.alert ? 3 : 140,
  };
}

const COVERAGE = {
  eventsSince: iso(NOW - 6 * HOUR), devicesSince: iso(NOW - 6 * HOUR), readsSince: iso(NOW - 35 * DAY), readerStatsSince: iso(NOW - 6 * HOUR),
  purchasesSince: iso(NOW - 41 * DAY), ledgerSince: iso(NOW - 120 * DAY), ledgerSurfaces: ['desk', 'cycle', 'agent-run', 'explain'],
  activitySince: localDay(NOW - 40 * DAY), outcomesSince: iso(NOW - 5 * HOUR), locatedSince: iso(NOW - 4 * HOUR),
};
const BARE_COVERAGE = { ...COVERAGE, purchasesSince: null, ledgerSurfaces: ['desk'] };

// ---------------------------------------------------------------- memberships (bobby_subscription_facts)
/** The server's classification (section 2.3 of the r2 spec): access and commercial class are separate facts. */
function classify(status: string | null, periodEnd: string | null, st: SubStore): { live: boolean; commercial: MemberCommercial; reason: MemberCommercialReason | null } {
  const live = (status === 'active' || status === 'trialing') && (!periodEnd || new Date(periodEnd).getTime() > Date.now());
  if (!live) return { live, commercial: 'inactive', reason: null };
  if (st.environment === 'sandbox') return { live, commercial: 'test', reason: 'sandbox' };
  if (status === 'trialing' || st.periodType === 'trial') return { live, commercial: 'test', reason: 'trial' };
  if (st.environment === 'production' && st.periodType === 'unknown') return { live, commercial: 'unverified', reason: 'unknown_period' };
  if (st.environment === 'production' && st.firstChargeAt) return { live, commercial: 'paid', reason: null };
  if (st.environment === 'unknown') return { live, commercial: 'unverified', reason: 'unknown_environment' };
  return { live, commercial: 'unverified', reason: 'no_charge' };
}
/** Random subscribers not pinned above: production, a charge on record when they ever paid. */
function subStore(u: MockUser): SubStore {
  const pinned = SUB_STORE.get(u.id);
  if (pinned) return pinned;
  const paidOnce = u.sub_status !== 'trialing';
  const st: SubStore = {
    environment: 'production', periodType: u.sub_status === 'trialing' ? 'trial' : 'normal', storeCheckedAt: u.last_seen_at,
    firstChargeAt: paidOnce ? u.created_at : null, lastChargeAt: paidOnce ? u.last_seen_at : null, internal: false,
  };
  SUB_STORE.set(u.id, st);
  return st;
}
function subscriptionRows() {
  return USERS.filter((u) => u.sub_status).map((u) => {
    const st = subStore(u);
    const c = classify(u.sub_status, u.current_period_end, st);
    return {
      identityId: u.id, email: u.email, provider: u.sub_provider, status: u.sub_status,
      productId: u.sub_provider === 'apple' ? 'bobby_pro_monthly' : 'price_bobby_pro_monthly',
      currentPeriodEnd: u.current_period_end, updatedAt: u.last_seen_at, active: c.live,
      environment: st.environment, periodType: st.periodType, storeCheckedAt: st.storeCheckedAt,
      commercial: c.commercial, commercialReason: c.reason, firstChargeAt: st.firstChargeAt, lastChargeAt: st.lastChargeAt, internal: st.internal,
    };
  });
}
type SubRow = ReturnType<typeof subscriptionRows>[number];
function subTotals(rows: SubRow[]) {
  const n = (c: MemberCommercial, reason?: MemberCommercialReason) => rows.filter((x) => x.commercial === c && (!reason || x.commercialReason === reason)).length;
  return { live: rows.filter((x) => x.active).length, paidVerified: n('paid'), unverified: n('unverified'), test: n('test'), n };
}
/** overview.subscriptions over the same rows the Membresías table lists (the team's left out, as by default). */
function subscriptionsSummary(bare: boolean) {
  const rows = bare ? [] : subscriptionRows().filter((x) => !x.internal);
  const live = rows.filter((x) => x.active);
  const t = subTotals(rows);
  const tally = (xs: SubRow[], key: (x: SubRow) => string | null) => xs.reduce<Record<string, number>>((acc, x) => { const k = key(x); if (k) acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});
  return {
    active: t.live, paid: t.paidVerified, trialing: live.filter((x) => x.status === 'trialing').length,
    paidVerified: t.paidVerified, unverified: t.unverified, test: t.test,
    unverifiedReasons: { unknown_environment: t.n('unverified', 'unknown_environment'), no_charge: t.n('unverified', 'no_charge'), unknown_period: t.n('unverified', 'unknown_period') },
    testReasons: { sandbox: t.n('test', 'sandbox'), trial: t.n('test', 'trial') },
    byEnvironment: tally(live, (x) => x.environment),
    byStatus: tally(rows, (x) => x.status), byProvider: tally(live, (x) => x.provider),
    giftedPro: bare ? 0 : USERS.filter((u) => u.grant_source && u.pro).length,
  };
}

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
  const subs = subscriptionsSummary(bare);
  const active = subs.active;
  // partial: Apple's load ran out of its time budget before the oldest days (it loads the newest first).
  const allAppDays = tail(ALL_DAYS, n);
  const missingDays = partial ? allAppDays.slice(0, Math.min(5, n - 1)) : [];
  const appDays = allAppDays.slice(missingDays.length);
  const downloads = appDays.map((_, i) => Math.round(between(4, 26) * ramp(SPAN - appDays.length + i)));
  return {
    internalMarkFailed: partial,
    overview: {
      days: d,
      since: d[0],
      includeInternal: false,
      accounts: {
        total: USERS.filter((u) => !u.wallet_only).length, new: newAccounts, internal: 2, wallets: USERS.filter((u) => u.wallet_only).length, active7d: 96,
        byProvider: { apple: USERS.filter((u) => u.provider === 'apple').length, google: USERS.filter((u) => u.provider === 'google').length },
        daily: accountsDaily,
      },
      activity: {
        reads: String(reads), readsInternal: Math.round(reads * 0.04), readsDaily: { web, ios, android },
        levels: { profundo: Math.round(reads * 0.09), maximo: Math.round(reads * 0.03) },
        activeReaders7d: 143, activeReaders7dSplit: { accounts: 61, guests: 82 },
        lastRead: { web: iso(NOW - 7 * MIN), ios: iso(NOW - 2 * MIN) },
        activation: { accounts: newAccounts, activated: Math.round(newAccounts * 0.72), medianMinutes: '6.4', measuredSince: iso(NOW - 35 * DAY), beforeCoverage: 0 },
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
      subscriptions: subs,
      revenue: bare ? {
        grossUsd: '0', netUsd: '0', refundsUsd: '0', unverifiedGrossUsd: '0', unattributedGrossUsd: 0, unattributedEvents: 0, unattributedRefundsUsd: 0, unattributedNetUsd: 0, unconvertedEvents: 0, newSubscriptions: 0, newPaying: 0, payingInPeriod: 0, renewals: 0, cancellations: 0, expirations: 0,
        sandboxEvents: 0, unknownEnvEvents: 0, internalEvents: 0, daily: revenue.map(String),
      } : {
        // One unverified membership's production charge is store money, never a payer.
        grossUsd: String(gross), netUsd: String(round2(gross * 0.85 - 4.99)), refundsUsd: '4.99', unverifiedGrossUsd: '4.99', unattributedGrossUsd: 0, unattributedEvents: 0, unattributedRefundsUsd: 0, unattributedNetUsd: 0, unconvertedEvents: 0,
        newSubscriptions: Math.round(11 * scale), newPaying: Math.round(4 * scale), payingInPeriod: Math.round(9 * scale), renewals: Math.round(19 * scale),
        cancellations: Math.round(4 * scale), expirations: Math.round(2 * scale), sandboxEvents: 7, unknownEnvEvents: 2, internalEvents: 1,
        daily: revenue.map(String),
      },
      llm: {
        providers: { anthropic: llmProvider('anthropic', bare), openai: llmProvider('openai', bare) },
        daily: d.map((_, i) => ({ anthropic: tail(SERIES.anthropic, n)[i], openai: String(tail(SERIES.openai, n)[i]) })),
        bySurface: bare ? [{ surface: 'desk', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)))), calls: 812, failures: 2 }] : [
          { surface: 'desk', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)) * 0.72)), calls: Math.round(2900 * scale), failures: 2 },
          { surface: 'cycle', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)) * 0.2)), calls: Math.round(860 * scale), failures: 1 },
          { surface: 'explain', provider: 'anthropic', usd: String(round2(sum(tail(SERIES.anthropic, n)) * 0.08)), calls: Math.round(360 * scale), failures: 0 },
          { surface: 'agent-run', provider: 'openai', usd: String(round2(sum(tail(SERIES.openai, n)))), calls: Math.round(986 * scale), failures: 41 },
        ],
        deskRuns: {
          runs: Math.round(3100 * scale), finished: Math.round(3020 * scale), abandoned: Math.round(40 * scale), byDay: d.slice(-3).map((day) => ({ day, runs: 90, finished: 88 })),
          // The last finished read is after the last unfinished one: the desk is answering again.
          lastFinishedAt: iso(NOW - 4 * MIN), lastUnfinishedAt: iso(NOW - 3 * HOUR),
        },
        guard: GUARD,
      },
      coupons: { active: COUPONS.filter((c) => couponStatus(c) === 'active').length, redemptions: REDEMPTIONS.length, giftedReadsLeft: 164, giftedLeft: { reads: 164, profundo: 12, maximo: 3 } },
      coverage: bare ? BARE_COVERAGE : COVERAGE,
    },
    integrations: compare ? null : bare
      ? {
        revenuecat: { configured: false }, appStore: { configured: false },
        llmCaps: { dayUsd: 15, monthUsd: 300, alertUsd: 100 }, paywall: false,
        llmGuard: { dayUsd: GUARD.day, monthUsd: GUARD.month },
        health: {
          revenuecatWebhook: { configured: false, lastEventAt: null, events30d: 0 },
          stripe: { configured: false, webhook: false, lastEventAt: null },
          tracking: { lastEventAt: null, events24h: 0, lastErrorAt: null, lastError: null, lastReadAt: iso(NOW - 2 * HOUR) },
          llmKeys: { anthropic: true, openai: false }, vercelAnalytics: 'unverified',
        },
        // what api/_lib/admin.ts reports when nothing is set up
        missing: ['REVENUECAT_V2_SECRET_KEY', 'ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY', 'ASC_VENDOR_NUMBER', 'GSC_SERVICE_ACCOUNT_JSON', 'REVENUECAT_SECRET_KEY', 'REVENUECAT_WEBHOOK_AUTH', 'OPENAI_API_KEY'],
      }
      : {
        revenuecat: {
          configured: true,
          metrics: [
            { id: 'mrr', name: 'MRR', value: round2(subs.paidVerified * 4.99 * 0.85), unit: '$', period: 'P28D' },
            { id: 'active_subscriptions', name: 'Suscripciones activas', value: active },
            { id: 'active_trials', name: 'Pruebas activas', value: subs.testReasons.trial },
            { id: 'revenue', name: 'Ingresos', value: round2(gross * 1.1), unit: '$', period: 'P28D' },
            { id: 'new_customers', name: 'Clientes nuevos', value: 212, period: 'P28D' },
            { id: 'active_users', name: 'Usuarios activos', value: 1043, period: 'P28D' },
          ],
        },
        appStore: {
          configured: true, days: appDays, downloads,
          totals: { downloads: sum(downloads), redownloads: Math.round(sum(downloads) * 0.11), updates: Math.round(sum(downloads) * 1.7), iap: Math.round(17 * scale) },
          byCountry: [{ country: 'MX', downloads: Math.round(sum(downloads) * 0.46) }, { country: 'US', downloads: Math.round(sum(downloads) * 0.21) }, { country: 'FR', downloads: Math.round(sum(downloads) * 0.09) }],
          coveredFrom: appDays[0], coveredTo: appDays.at(-2) ?? null, pendingDays: appDays.slice(-1),
          partial, missingDays,
        },
        llmCaps: { dayUsd: 15, monthUsd: 300, alertUsd: 100 }, paywall: false, missing: [],
        llmGuard: { dayUsd: GUARD.day, monthUsd: GUARD.month },
        health: partial ? undefined : {
          revenuecatWebhook: { configured: true, lastEventAt: iso(NOW - 5 * HOUR), events30d: 43 },
          stripe: { configured: true, webhook: true, lastEventAt: iso(NOW - 9 * HOUR) },
          tracking: { lastEventAt: iso(NOW - 3 * MIN), events24h: 1840, lastErrorAt: null, lastError: null, lastReadAt: iso(NOW - 2 * MIN) },
          llmKeys: { anthropic: true, openai: true }, vercelAnalytics: 'unverified',
        },
      },
  };
}

// The growth view (bobby_admin_growth) for the fixture, at the fixture's scale.
function growth(n: number, bare: boolean) {
  const k = n / 30;
  const r = (v: number) => (bare ? 0 : Math.round(v * k));
  const cell = (e: number, ret: number, rd: number) => ({ eligible: r(e), returned: r(ret), read: r(rd) });
  const cohort = (arrived: number, desk: number, read1: number) => ({
    arrived: r(arrived), home: r(arrived * 0.6), deskOrRead: r(desk), read1: r(read1), read2: r(read1 * 0.52), read3: r(read1 * 0.3), wall: r(read1 * 0.24),
    signinStart: r(read1 * 0.3), account: r(read1 * 0.14), accountNew: r(read1 * 0.11), accountAfterRead: r(read1 * 0.13), accountAfterWall: r(read1 * 0.07),
    proAfterRead: r(read1 * 0.01), delivered: r(read1 * 1.9), failed: r(read1 * 0.04), medianMinutesToFirstRead: bare ? null : '3.8', medianMinutesToAccount: bare ? null : '41',
    oldestDays: n - 1,
    retention: { d1: cell(arrived * 0.95, arrived * 0.16, arrived * 0.09), d7: cell(arrived * 0.75, arrived * 0.06, arrived * 0.04), w1: cell(arrived * 0.75, arrived * 0.22, arrived * 0.12), readersBack: cell(read1 * 0.95, read1 * 0.31, read1 * 0.21) },
  });
  return {
    days: n, since: tail(ALL_DAYS, n)[0], today: ALL_DAYS[SPAN - 1], includeInternal: false,
    people: {
      total: r(4120), accounts: r(128), guests: r(3992), wallets: 3, excluded: { accounts: 2, guests: 3 },
      newInPeriod: r(3400), active7d: r(1210), active30d: r(2900), readers7d: r(640), readers: r(1700),
      stages: { new: r(430), active: r(975), recurring: r(318), pro: r(24), atRisk: r(905), lost: r(1402) },
      byPlatform: { web: r(3310), ios: r(790), android: r(20) }, proInactive: bare ? 0 : 2, accountsNeverRead: r(14),
      proPaidVerified: subscriptionsSummary(bare).paidVerified, proInactivePaid: bare ? 0 : 1,
      traffic: { verified7d: r(1210) - r(260) - r(190), datacenter7d: r(260), unverified7d: r(190), signalSince: bare ? null : iso(NOW - 6 * DAY) },
    },
    cohorts: { web: cohort(3400, 1690, 690), ios: cohort(640, 512, 512), android: { ...cohort(20, 15, 10), signinStart: 0 } },
    history: { web: { installs: 8, readers: 8, reads: 13, read2: 4, linked: 0, since: iso(NOW - 40 * DAY), until: iso(NOW - 36 * DAY) }, ios: { installs: 4, readers: 4, reads: 6, read2: 2, linked: 0, since: iso(NOW - 39 * DAY), until: iso(NOW - 36 * DAY) }, android: { installs: 0, readers: 0, reads: 0, read2: 0, linked: 0, since: null, until: null } },
    outcomes: {
      consumed: r(2770), consumedInternal: r(110), consumedTotal: r(2880), byPlatform: { web: r(1500), ios: r(1200), android: r(70) }, delivered: r(2660), failed: r(42),
      wallSignin: r(210), wallSigninInstalls: r(170), wallPaywall: r(12), wallLevel: r(66), abandoned: r(25),
      blocked: bare ? {} : { daily_limit: r(4), no_address: r(1) }, byLevel: { rapido: r(2300), profundo: r(220), maximo: r(80) },
      outcomesSince: bare ? null : iso(NOW - 5 * HOUR),
    },
    acquisition: {
      sources: bare ? [] : [
        { source: 'direct', installs: r(1500), read1: r(280), account: r(30) }, { source: 't.co', installs: r(700), read1: r(170), account: r(19) },
        { source: 'utm:tiktok', installs: r(520), read1: r(150), account: r(21) }, { source: 'google.com', installs: r(410), read1: r(62), account: r(6) },
      ],
      landing: bare ? [] : [{ surface: 'home', installs: r(2050), read1: r(380) }, { surface: 'desk', installs: r(1010), read1: r(270) }, { surface: 'protocol', installs: r(240), read1: r(30) }],
      visits: r(5200), visitors: r(3400), visitsWithUtm: r(700), visitsWithReferrer: r(1900), visitorDays: tail(SERIES.visits, n).map((v) => (bare ? 0 : Math.round(v * 0.8))),
    },
    attention: {
      neverRead: bare ? [] : USERS.filter((u) => !u.reads && !u.wallet_only).slice(0, 6).map((u) => ({ identityId: u.id, email: u.email, provider: u.provider, createdAt: u.created_at, lastDay: localDay(NOW - 3 * DAY) })),
      quiet: bare ? [] : USERS.filter((u) => (u.reads ?? 0) > 2).slice(0, 4).map((u) => ({ identityId: u.id, email: u.email, provider: u.provider, reads: u.reads, lastDay: localDay(NOW - 12 * DAY) })),
    },
    coverage: { webObservedSince: iso(NOW - 6 * HOUR), iosObservedSince: iso(NOW - 4 * HOUR), androidObservedSince: bare ? null : iso(NOW - 3 * HOUR), activitySince: localDay(NOW - 40 * DAY), outcomesSince: bare ? null : iso(NOW - 5 * HOUR), observedInstalls: r(4060), backfillInstalls: 12, internalInstalls: 3, internalAccounts: 2 },
  };
}

async function withGrowth(res: ReturnType<typeof overview>, days: number, bare: boolean) {
  const n = Math.min(Math.max(Math.round(days) || 30, 1), SPAN);
  const g = growth(n, bare);
  const life = lifecycle(n, bare);
  // The same diagnosis engine the server runs (pure TypeScript), fed with the fixture and the same networks.
  const { buildInsights } = await import('../../../../shared/admin-insights');
  const insights = buildInsights({ days: n, overview: res.overview, growth: g, integrations: res.integrations, searchConsole: life.searchConsole, networks: internalView().networks });
  return { ...res, growth: g, searchConsole: life.searchConsole, insights };
}

/** ?mock=partial: the server omitted whole sections, could not mark the browser and cut Apple's load short; the dashboard must say so instead of drawing zeros. */
function partialOverview(days: number) {
  const full = overview(days, false, false, true) as { overview: Record<string, unknown> & { funnel: Record<string, unknown> }; integrations: unknown };
  delete full.overview.revenue;
  delete full.overview.funnel.visitsDaily;
  delete full.overview.coverage;
  return full;
}

function usersView(q: string, limit: number, offset: number) {
  const needle = q.trim().toLowerCase();
  const all = needle ? USERS.filter((u) => (u.email ?? '').toLowerCase().includes(needle) || u.id.startsWith(needle)) : USERS;
  // Postgres numerics arrive as strings; keep some that way on purpose.
  const users = all.slice(offset, offset + limit).map((u, i) => ({
    ...u, reads: u.reads == null ? null : String(u.reads), activation_minutes: u.activation_minutes == null ? null : String(u.activation_minutes),
    wallet: u.wallet_only ? '0x8f3a…91c2' : null, guest_reads: i % 3 === 0 ? 2 : 0, last_active_day: u.last_read_at ? u.last_read_at.slice(0, 10) : u.created_at.slice(0, 10),
    is_internal: false, installs: u.wallet_only ? 0 : 1,
    // One account the team rule reaches through an /admin install it signed in on (the D2 chain), with its reason.
    ...(u === USERS[7] ? { is_team: true, team_seed: 'admin_session', team_seed_ref: 'd02abcdef1' } : {}),
  }));
  return { total: all.length, accounts: all.filter((u) => !u.wallet_only).length, wallets: all.filter((u) => u.wallet_only).length, internal: 1, readsSince: iso(NOW - 35 * DAY), users };
}

const INTERNAL_EMAILS = ['owner@example.com', 'owner.second@example.com'];
const INSTALLS = Array.from({ length: 14 }, (_, i) => ({
  device: `d${String(i).padStart(2, '0')}abcdef1`.slice(0, 10), platform: i % 3 === 0 ? 'ios' : 'web', source: i < 4 ? 'backfill' : 'observed',
  firstSeen: iso(NOW - (i + 1) * 9 * HOUR), lastSeen: iso(NOW - i * 2 * HOUR), firstSurface: i % 2 ? 'desk' : 'home', referrer: i % 4 === 1 ? 't.co' : null,
  utm: i % 5 === 2 ? 'tiktok' : null, country: i % 3 === 0 ? null : 'MX', internal: i === 0 || i === 5, manualInternal: i === 5, reads: i % 4, delivered: i % 4,
  account: i === 0 ? ME.email : null, accountId: i === 0 ? ME.id : null, adminSession: i === 0, teamNetwork: i === 1,
}));
function internalView() {
  return {
    devices: INSTALLS,
    networks: [{ network: 'a1b2c3d4e5', note: 'admin session', createdAt: iso(NOW - 2 * DAY), lastSeenAt: iso(NOW - 5 * MIN), installs: 3, onlyByNetwork: 1, accountsOnlyByNetwork: 1 }],
    emails: INTERNAL_EMAILS,
    marks: [{ identity_id: USERS[3].id, email: null, provider: 'apple', note: 'iPhone de pruebas', created_at: iso(NOW - DAY) }],
  };
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

/** The server's unitEconomics (api/_lib/admin.ts), on fixture inputs. MRR and churn count verified payers only. */
function economics(n: number, bare: boolean) {
  const since = tail(ALL_DAYS, n)[0];
  const r2 = (v: number | null, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  const gross = bare ? 0 : round2(sum(tail(SERIES.revenue, n)));
  const subs = subscriptionsSummary(bare);
  // Like the server: the last real purchase sets the price; the store fee comes from the assumption until
  // purchase events carry a take-home rate.
  const priceUsd = (bare ? null : LAST_PRICE_USD) ?? ASSUMPTIONS.priceUsd ?? 4.99;
  const takehome = 1 - (ASSUMPTIONS.storeFee ?? 0.15);
  const paidVerified = subs.paidVerified;
  const newPaying = bare ? 0 : Math.max(1, Math.round(4 * (n / 30)));
  const payersEver = bare ? 0 : newPaying + 20;
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
    revenue: {
      grossUsd: String(gross), netUsd: r2(net), refundsUsd: bare ? 0 : 4.99, unverifiedGrossUsd: bare ? 0 : 4.99, unconvertedEvents: 0, mrrGrossUsd: r2(paidVerified * priceUsd), mrrNetUsd: r2(paidVerified * priceUsd * takehome),
      activeSubscriptions: paidVerified, paidVerified, unverifiedSubscriptions: subs.unverified, testSubscriptions: subs.test, liveSubscriptions: subs.active,
      trialing: subs.trialing, newPaying, payingInPeriod: bare ? 0 : Math.round(9 * (n / 30)), payersEver, priceUsd, takehome,
      priceSource: LAST_PRICE_USD && !bare ? 'observed' : 'default',
      purchasesSince: bare ? null : COVERAGE.purchasesSince, measured: !bare,
    },
    costs: { marketingUsd: r2(marketing), infraUsd: r2(by('infra')), otherUsd: r2(by('other')), llmUsd: r2(llm, 4), totalUsd: r2(total), manualEntries: inWindow.length, byChannel: [...channels].sort((a, b) => b[1] - a[1]).map(([channel, usd]) => ({ channel, usd })) },
    acquisition: { newAccounts, newPaying, cacPerAccount: newAccounts ? r2(marketing / newAccounts) : null, cacPerPaying: r2(cacPaying) },
    ltv: {
      monthlyNetPerSubUsd: r2(priceUsd * takehome), monthlyLlmPerUserUsd: r2(llmPerReader, 4), monthlyContributionUsd: r2(contribution),
      monthlyChurn, churnSource, lifetimeMonths: r2(lifetime, 1), ltvUsd: r2(ltv),
      ltvToCac: cacPaying ? r2(ltv / cacPaying) : null, paybackMonths: cacPaying && contribution > 0 ? r2(cacPaying / contribution, 1) : null,
      scenario: payersEver === 0,
    },
    roi: { profitUsd: r2(net - total), roi: total > 0 ? r2((net - total) / total, 4) : null },
    assumptions: { monthlyChurn: ASSUMPTIONS.monthlyChurn ?? null, priceUsd: ASSUMPTIONS.priceUsd ?? null, storeFee: ASSUMPTIONS.storeFee ?? null, maxLifetimeMonths: ASSUMPTIONS.maxLifetimeMonths ?? null },
  };
}

function lifecycle(days: number, bare: boolean, partial = false) {
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
  const missingDays = partial ? dayList.slice(0, Math.min(5, n - 1)) : [];
  const appDays = dayList.slice(missingDays.length);
  const downloads = appDays.map((_, i) => Math.round(between(4, 26) * ramp(SPAN - appDays.length + i)));
  void web; void ios;
  return {
    internalMarkFailed: partial,
    economics: economics(n, bare),
    instrumentation: { webVisits: true, webPaywall: true, iosVisits: false, iosOpens: true, iosPaywall: false, purchaseStart: false, deskOutcomes: true },
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
      configured: true, days: appDays, downloads,
      totals: { downloads: sum(downloads), redownloads: Math.round(sum(downloads) * 0.11), updates: Math.round(sum(downloads) * 1.7), iap: Math.round(17 * k) },
      coveredFrom: appDays[0], coveredTo: appDays.at(-1) ?? null, pendingDays: [], partial, missingDays,
    },
  };
}

function audience(days: number, bare: boolean) {
  const n = Math.min(Math.max(Math.round(days) || 30, 1), SPAN);
  const k = n / 30;
  const r = (v: number) => Math.round(v * k);
  const since = iso(new Date(`${tail(ALL_DAYS, n)[0]}T00:00:00`).getTime());
  if (bare) {
    return {
      internalMarkFailed: false,
      geo: { since, days: n, locatedSince: null, web: { devices: 0, measurable: 0, located: 0, beforeLocation: 0 }, located: { total: 0, withRegion: 0 }, countries: [], regions: [], purchases: [], purchasesSince: null },
      searchConsole: { configured: false, error: null, countries: null }, appStore: { configured: false, error: null, countries: null, partial: false, missingDays: [] },
    };
  }
  const countries = [
    { country: 'MX', visitors: r(1840), readers: r(402), accounts: r(58), pro: Math.max(1, r(3)) },
    { country: 'US', visitors: r(520), readers: r(96), accounts: r(14), pro: Math.max(1, r(1)) },
    { country: 'CO', visitors: r(310), readers: r(61), accounts: r(7), pro: 0 },
    { country: 'AR', visitors: r(212), readers: r(38), accounts: r(5), pro: 0 },
    { country: 'ES', visitors: r(168), readers: r(31), accounts: r(4), pro: 0 },
    { country: 'CL', visitors: r(94), readers: r(17), accounts: r(2), pro: 0 },
    { country: 'PE', visitors: r(71), readers: r(12), accounts: r(1), pro: 0 },
  ];
  const located = sum(countries.map((c) => c.visitors));
  const regions = [
    { country: 'MX', region: 'CMX', visitors: r(712), readers: r(164) }, { country: 'MX', region: 'JAL', visitors: r(301), readers: r(70) },
    { country: 'MX', region: 'NLE', visitors: r(244), readers: r(51) }, { country: 'MX', region: 'MEX', visitors: r(198), readers: r(39) },
    { country: 'US', region: 'TX', visitors: r(141), readers: r(27) }, { country: 'MX', region: 'PUE', visitors: r(96), readers: r(18) },
    { country: 'US', region: 'CA', visitors: r(88), readers: r(15) }, { country: 'CO', region: 'DC', visitors: r(84), readers: r(16) },
  ];
  return {
    internalMarkFailed: false,
    geo: {
      since, days: n, locatedSince: '2026-10-01T21:00:00Z',
      web: { devices: r(3400), measurable: r(3300), located, beforeLocation: r(100) },
      located: { total: located, withRegion: sum(regions.map((x) => x.visitors)) },
      countries, regions,
      purchases: [{ country: 'MX', newPaying: Math.max(1, r(2)), grossUsd: r(64.87) }, { country: 'US', newPaying: Math.max(1, r(1)), grossUsd: r(24.95) }, { country: '??', newPaying: 1, grossUsd: 4.99 }],
      purchasesSince: COVERAGE.purchasesSince,
    },
    searchConsole: { configured: true, error: null, countries: [
      { country: 'MX', clicks: r(702), impressions: r(17640) }, { country: 'US', clicks: r(198), impressions: r(6120) },
      { country: 'CO', clicks: r(121), impressions: r(3310) }, { country: 'ES', clicks: r(77), impressions: r(2804) }, { country: 'ARG', clicks: r(12), impressions: r(390) },
    ] },
    appStore: { configured: true, error: null, partial: false, missingDays: [], countries: [
      { country: 'MX', downloads: r(241) }, { country: 'US', downloads: r(88) }, { country: 'CO', downloads: r(31) }, { country: 'ES', downloads: r(19) },
    ] },
  };
}

/** view=members: the team's rows only with internal=1 (otherwise counted in `excluded`), like bobby_admin_members. */
function members(internal: boolean, bare: boolean, partial: boolean) {
  const all = bare ? [] : subscriptionRows();
  const allGrants = bare ? [] : USERS.filter((u) => u.grant_source).map((u) => ({
    identityId: u.id, email: u.email, source: u.grant_source === 'coupon' ? 'admin' : u.grant_source, proUntil: u.pro_until,
    active: !!u.pro_until && new Date(u.pro_until).getTime() > Date.now(), internal: u.id === ME.id || u.is_admin,
  }));
  const subscriptions = all.filter((x) => internal || !x.internal);
  const grants = allGrants.filter((g) => internal || !g.internal);
  const t = subTotals(subscriptions);
  return {
    includeInternal: internal, subscriptions, grants,
    excluded: { subscriptions: all.length - subscriptions.length, grants: allGrants.length - grants.length },
    totals: { live: t.live, paidVerified: t.paidVerified, unverified: t.unverified, test: t.test },
    internalMarkFailed: partial,
  };
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

function post(body: AdminPostBody, bare: boolean): Record<string, unknown> {
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
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.operationId)) throw new Refuse(400, 'A valid grant operation id is required.');
      const payload = JSON.stringify({ adminId: ME.id, identityId: body.identityId, reads: body.reads ?? 0,
        profundo: body.profundo ?? 0, maximo: body.maximo ?? 0, proDays: body.proDays ?? 0 });
      const prior = GRANT_RECEIPTS.get(body.operationId);
      if (prior) {
        if (prior.payload !== payload) throw new Refuse(409, 'This grant operation belongs to a different account, administrator or gift.');
        return prior.result;
      }
      const u = findUser(body.identityId);
      if (body.reads) u.bonus_reads = (u.bonus_reads ?? 0) + body.reads;
      if (body.profundo) u.bonus_profundo = (u.bonus_profundo ?? 0) + body.profundo;
      if (body.maximo) u.bonus_maximo = (u.bonus_maximo ?? 0) + body.maximo;
      if (body.proDays) {
        const from = Math.max(Date.now(), u.pro_until ? new Date(u.pro_until).getTime() : 0);
        u.pro_until = iso(from + body.proDays * DAY); u.pro = true; u.grant_source = u.grant_source ?? 'admin';
      }
      log('grant', u.email ?? u.id, { operationId: body.operationId, reads: body.reads, profundo: body.profundo, maximo: body.maximo, proDays: body.proDays });
      const result = { ok: true, operationId: body.operationId, bonus: { reads: u.bonus_reads, profundo: u.bonus_profundo, maximo: u.bonus_maximo }, proUntil: u.pro_until };
      GRANT_RECEIPTS.set(body.operationId, { payload, result });
      return result;
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
      else {
        if (!(body.amountUsd > 0)) throw new Refuse(400, 'A top-up must be more than $0.');
        if (!c.mark) throw new Refuse(400, 'Registra primero un saldo; la recarga se suma a él.');
        c.topups += body.amountUsd; c.topupAt = iso(Date.now());
      }
      log('credit-mark', body.provider, { kind: body.kind, amountUsd: body.amountUsd, note: body.note });
      return { ok: true };
    }
    case 'probe-llm': {
      const r = body.provider === 'anthropic' ? { status: 'ok', httpStatus: 200 } : { status: 'no_credit', httpStatus: 429, code: 'insufficient_quota' };
      log('probe-llm', body.provider, r);
      return { ok: true, ...r };
    }
    case 'add-cost': {
      // Like the server: costs are dated in UTC.
      const today = new Date().toISOString().slice(0, 10);
      const spentOn = body.spentOn && /^\d{4}-\d{2}-\d{2}$/.test(body.spentOn) ? body.spentOn : today;
      if (!['marketing', 'infra', 'other'].includes(body.kind) || !(body.amountUsd > 0) || body.amountUsd > 1_000_000) throw new Refuse(400, 'Invalid cost.');
      if (spentOn > today) throw new Refuse(400, 'The date cannot be in the future (UTC).');
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
    case 'set-internal': log('set-internal', body.identityId, { internal: body.internal }); return { ok: true };
    case 'set-device-internal': {
      const d = INSTALLS.find((x) => x.device === body.device);
      if (!d) throw new Refuse(404, 'Install not found.');
      d.manualInternal = body.internal; d.internal = body.internal || d.account === ME.email;
      return { ok: true };
    }
    case 'remove-internal-network': return { ok: true };
    case 'growth-plan': return { ok: true, plan: { generatedAt: iso(NOW), model: 'claude-sonnet-5-5', summary: 'Fixture de desarrollo: el plan real lo escribe Claude en el servidor.', cached: false, usd: 0.012,
      priorities: [{ title: 'Recargar OpenAI', why: 'Fixture.', steps: ['Recargar crédito'], measure: 'Fallos 24h en IA', findings: ['credit-openai'] }] } };
    case 'preview-digest': return { ok: true, subject: 'Bobby: 1 urgente — OpenAI sin crédito', text: 'Vista previa del resumen (fixture de desarrollo).', fresh: 1, urgent: 2, weekly: false };
    // Accepted by Resend is not delivered: the fixture answers like the server (bare: no recipient configured).
    case 'send-digest': return bare
      ? { ok: true, subject: 'Bobby: 1 urgente — OpenAI sin crédito', accepted: false, emailId: null, emailError: 'not_configured' }
      : { ok: true, subject: 'Bobby: 1 urgente — OpenAI sin crédito', accepted: true, emailId: 'mock-email-0001', emailError: null };
    case 'resync-membership': {
      if (bare) throw new Refuse(503, 'RevenueCat is not configured.');
      const u = USERS.find((x) => x.id === body.identityId && x.sub_status);
      if (!u) throw new Refuse(404, 'Account not found.');
      if (u.wallet_only) throw new Refuse(400, 'Only Apple/Google accounts can be re-synced.');
      const st = subStore(u);
      const wasLive = classify(u.sub_status, u.current_period_end, st).live;
      // What RevenueCat would say: a live row is confirmed (an unknown environment turns out to be production);
      // a lapsed one has no entitlement, and the row is only stamped as checked (access is never lowered).
      if (wasLive && st.environment === 'unknown') { st.environment = 'production'; st.periodType = 'normal'; }
      st.storeCheckedAt = iso(Date.now());
      const subscription = { status: u.sub_status, environment: st.environment, periodType: st.periodType, currentPeriodEnd: u.current_period_end, storeCheckedAt: st.storeCheckedAt };
      log('resync-membership', u.email ?? u.id, { revenuecatActive: wasLive, environment: st.environment, periodType: st.periodType });
      return { ok: true, revenuecatActive: wasLive, accessKept: false, subscription };
    }
    case 'set-internal-emails': INTERNAL_EMAILS.splice(0, INTERNAL_EMAILS.length, ...body.emails.map((e) => e.trim().toLowerCase())); return { ok: true, emails: INTERNAL_EMAILS };
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

function fixtureMeta(names: string[], partial = false, bare = false) {
  const at = iso(Date.now());
  return { generatedAt: at, durationMs: 280, partial, sources: Object.fromEntries(names.map((name) => [name, {
    status: bare && ['appStore', 'revenuecat', 'searchConsole'].includes(name) ? 'not_configured' : partial && name === 'appStore' ? 'partial' : 'ok',
    fetchedAt: at, ...(partial && name === 'appStore' ? { missingDays: [localDay(NOW - 20 * DAY)] } : {}),
  }])) };
}

function liveFixture(bare: boolean, internal: boolean, partial: boolean) {
  const at = Date.now();
  const platform = (scale: number, ios: boolean) => ({ observedDevices: bare ? 0 : Math.round((ios ? 5 : 12) * scale),
    observedAccounts: bare ? 0 : Math.round((ios ? 3 : 4) * scale), events: bare ? 0 : Math.round((ios ? 4 : 30) * scale),
    consumed: bare ? 0 : Math.round((ios ? 6 : 13) * scale), completed: bare ? 0 : Math.round((ios ? 5 : 10) * scale),
    failed: bare ? 0 : Math.round((ios ? 0 : 1) * scale), abandoned: bare ? 0 : Math.round((ios ? 1 : 2) * scale),
    wallSignin: bare ? 0 : Math.round(2 * scale), wallPaywall: bare ? 0 : Math.round(scale), wallLevel: bare ? 0 : Math.round(scale),
    blocked: bare ? {} : { daily_limit: Math.round(scale) } });
  const times = { latestEventAt: bare ? null : iso(at - 2 * MIN), latestOutcomeAt: bare ? null : iso(at - MIN),
    latestCompletedAt: bare ? null : iso(at - MIN), latestReadConsumptionAt: bare ? null : iso(at - MIN) };
  const clientPlatform = (ios: boolean) => {
    const measuredAt = bare ? null : iso(at - 2 * HOUR), renderedAt = bare || (partial && ios) ? null : measuredAt;
    const signalAt = bare ? null : iso(at - 20_000);
    return { presence: { reportedForegroundInstalls: bare ? 0 : ios ? 2 : 4, reportedForegroundAccounts: bare ? 0 : 1,
      reportedForegroundSessions: bare ? 0 : ios ? 2 : 4, latestReportAt: signalAt },
      windows: Object.fromEntries([['15m', 15, 1], ['1h', 60, 3], ['24h', 1440, 8]].map(([id, minutes, scale]) => [id, {
        minutes, since: iso(at - Number(minutes) * MIN), foreground: bare ? 0 : 2 * Number(scale), background: bare ? 0 : Number(scale),
        started: bare ? 0 : 3 * Number(scale), received: bare ? 0 : 2 * Number(scale), rendered: renderedAt ? 2 * Number(scale) : 0,
        webviewTerminations: 0, reportedInstalls: bare ? 0 : 3 * Number(scale), reportedAccounts: bare ? 0 : Number(scale),
      }])), latest: { eventAt: signalAt, receivedAt: bare ? null : iso(at - MIN), renderedAt: renderedAt ? iso(at - MIN) : null, webviewTerminationAt: null },
      coverage: { rolloutSince: measuredAt, readStartedSince: measuredAt, readReceivedSince: measuredAt, readRenderedSince: renderedAt, webviewTerminationSince: null },
      builds: bare ? [] : [{ appVersion: 'fixture-version', appBuild: ios ? 'fixture-ios-build' : 'fixture-web-build', reportedInstalls24h: 6,
        foregroundInstalls: ios ? 2 : 4, latestReportAt: signalAt, coverageSince: measuredAt, readStartedSince: measuredAt,
        readReceivedSince: measuredAt, readRenderedSince: renderedAt }],
    };
  };
  return { live: { snapshotAt: iso(at), includeInternal: internal,
    windows: Object.fromEntries([['15m', 15, 1], ['1h', 60, 3], ['24h', 1440, 12]].map(([id, minutes, scale]) => [id,
      { minutes, since: iso(at - Number(minutes) * MIN), ios: platform(Number(scale), true), web: platform(Number(scale), false),
        android: platform(bare ? 0 : Number(scale) / 2, true) }])),
    platforms: { ios: times, web: times, android: { ...times, coverage: {
      eventCoverageSince: bare ? null : COVERAGE.eventsSince, outcomeCoverageSince: bare ? null : COVERAGE.outcomesSince,
      readConsumptionCoverageSince: bare ? null : COVERAGE.readsSince } } },
    providers: bare ? [] : [{ provider: 'anthropic', model: 'fixture-model', calls24h: 120, failures24h: 1, usd24h: 0.41,
      callLatencyP50Ms: 1450, callLatencyP95Ms: 3400, lastCallAt: iso(at - MIN), lastFailureAt: iso(at - HOUR) }],
    client: { presenceTtlSeconds: 90, coverage: { protocolVersion: 1, scope: 'instrumented_clients_only', legacyClients: 'unmeasured', crashes: false, successRate: null },
      platforms: { ios: clientPlatform(true), web: clientPlatform(false) },
      health: { status: bare ? 'unknown' : partial ? 'failure_observed' : 'recovered', lastErrorAt: bare ? null : iso(at - 10 * MIN),
        error: bare ? null : 'storage_unavailable', authenticated: bare ? null : true, lastReportAt: bare ? null : iso(at - (partial ? 15 * MIN : 20_000)), recovered: bare ? null : !partial } },
    coverage: { readStarted: false, clientRendered: false, crashes: false, buildVersion: false, onlinePresence: false, clientIngestionEnabled: true,
      eventCoverageSince: bare ? null : COVERAGE.eventsSince, outcomeCoverageSince: bare ? null : COVERAGE.outcomesSince,
      readConsumptionCoverageSince: bare ? null : COVERAGE.readsSince, llmLedgerCoverageSince: bare ? null : COVERAGE.ledgerSince } },
    internalMarkFailed: partial, meta: fixtureMeta(['live'], partial) };
}

export async function mockAdminFetch(mode: string, method: 'GET' | 'POST', query: URLSearchParams | null, body?: AdminPostBody): Promise<Response> {
  await wait(method === 'POST' ? 450 : 280);
  if (mode === '401') return json({ error: 'unauthorized' }, 401);
  if (mode === '403') return json({ error: 'not_admin' }, 403);
  if (mode === '500') return json({ error: 'internal_error' }, 500);
  const bare = mode === 'bare';
  const partial = mode === 'partial';
  if (method === 'POST') {
    if (!body) return json({ error: 'missing_body' }, 400);
    try {
      const result = post(body, bare);
      // Dev-only fault: commit the fixture gift, then lose the first confirmation. Reopening the
      // dialog must reuse its saved operation and confirm exactly one addition/audit.
      if (mode === 'grant-lost' && body.action === 'grant' && !LOST_GRANT_RESPONSES.has(body.operationId)) {
        LOST_GRANT_RESPONSES.add(body.operationId);
        return json({ error: 'The grant was not confirmed. Retry the same operation.' }, 502);
      }
      return json(result);
    } catch (e) { return e instanceof Refuse ? json({ error: e.code }, e.status) : json({ error: 'internal_error' }, 500); }
  }
  const view = query?.get('view');
  switch (view) {
    case 'me': return json({ admin: true, email: ME.email, identityId: ME.id });
    case 'overview': {
      const days = Number(query?.get('days') ?? 30);
      const compare = query?.get('compare') === '1';
      if (compare) return json({ ...overview(days, bare, true), meta: fixtureMeta(['overview']) });
      const r = partial ? partialOverview(days) : await withGrowth(overview(days, bare), days, bare);
      if (r.overview) r.overview.includeInternal = query?.get('internal') === '1';
      if ('growth' in r && r.growth) r.growth.includeInternal = query?.get('internal') === '1';
      return json({ ...r, integrations: null, searchConsole: null, meta: fixtureMeta(['overview', 'growth', 'networks']) });
    }
    case 'live': return json(liveFixture(bare, query?.get('internal') === '1', partial));
    case 'integrations': {
      const r = overview(Number(query?.get('days') ?? 30), bare, false, partial);
      const geo = audience(Number(query?.get('days') ?? 30), bare);
      const sc = lifecycle(Number(query?.get('days') ?? 30), bare).searchConsole;
      return json({ integrations: r.integrations, searchConsole: sc ? { ...sc, byCountry: geo.searchConsole.countries } : null,
        meta: fixtureMeta(['appStore', 'revenuecat', 'searchConsole', 'health'], partial, bare) });
    }
    case 'users': return json(usersView(query?.get('q') ?? '', Number(query?.get('limit') ?? 50), Number(query?.get('offset') ?? 0)));
    case 'coupons': return json({ coupons: COUPONS.map((c) => ({ ...c, status: couponStatus(c) })), redemptions: REDEMPTIONS, totals: { coupons: COUPONS.length, redemptions: REDEMPTIONS.length + 120 } });
    case 'actions': return json({ actions: ACTIONS, total: ACTIONS.length + 40 });
    case 'members': return json(members(query?.get('internal') === '1', bare, partial));
    case 'lifecycle': return json(lifecycle(Number(query?.get('days') ?? 30), bare, partial));
    case 'audience': return json(partial
      ? { ...audience(Number(query?.get('days') ?? 30), false), internalMarkFailed: true, appStore: { configured: true, error: 'appstore 401', countries: null, partial: false, missingDays: [] } }
      : audience(Number(query?.get('days') ?? 30), bare));
    case 'costs': return json({ costs: [...COSTS].sort((x, y) => y.spent_on.localeCompare(x.spent_on) || y.id - x.id) });
    case 'internal': return json(internalView());
    default: return json({ error: 'unknown_view' }, 400);
  }
}
