// Actual PostgreSQL regressions for 20261001180000_admin_dashboard.sql: reader stats kept by the bobby_reads
// trigger (and never refusing a read when they fail), the dashboard aggregates (accounts, activation, funnel,
// revenue production vs sandbox, LLM spend and estimated credit, coupons), the users table, cascades, and the
// service-only privileges. Needs the schema prepared by scripts/test-trader-land-growth.sql.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('admin-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');

const MIGRATIONS = [
  '20260927120000_access_reads_subscriptions.sql',
  '20260929150000_levels_referrals_usage.sql',
  '20260929170000_referral_rules_llm_spend.sql',
  '20260930121932_serialize_guest_network_quota.sql',
  '20261001160000_coupons_bonus_usage.sql',
  '20261001180000_admin_dashboard.sql',
  '20261001200000_lifecycle_funnel.sql',
  '20261001210000_admin_audit_fixes.sql',
  '20261001220000_audience_geo.sql',
];
const pool = new pg.Pool({ connectionString: url, max: 8 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

async function account(opts: { email?: string; provider?: string; ageMinutes?: number } = {}) {
  const id = randomUUID();
  const authId = randomUUID();
  await pool.query('insert into auth.users(id) values ($1)', [authId]);
  await pool.query('insert into auth.identities(user_id, provider) values ($1, $2)', [authId, opts.provider ?? 'apple']);
  await pool.query(`insert into public.bobby_identities(id, auth_user_id, email, provider, created_at) values ($1, $2, $3, $4, now() - make_interval(mins => $5))`,
    [id, authId, opts.email ?? `${id.slice(0, 8)}@example.test`, opts.provider ?? 'apple', opts.ageMinutes ?? 0]);
  return id;
}
const read = (identity: string | null, device: string | null, platform: string, minutesAgo = 0) =>
  pool.query("insert into public.bobby_reads(identity_id, device_hash, platform, symbol, created_at) values ($1, $2, $3, 'BTC', now() - make_interval(mins => $4))",
    [identity, device, platform, minutesAgo]);
const stats = async (reader: string) => (await pool.query('select * from public.bobby_reader_stats where reader = $1', [reader])).rows[0];
const overview = async (days = 30) => (await pool.query('select public.bobby_admin_overview($1) as r', [days])).rows[0].r;
const users = async (q: string | null, limit = 50, offset = 0) => (await pool.query('select public.bobby_admin_users($1, $2, $3) as r', [q, limit, offset])).rows[0].r;
const near = (a: number, b: number, what: string) => { assert.ok(Math.abs(Number(a) - b) < 1e-6, `${what}: ${a} vs ${b}`); checks++; };

try {
  await pool.query(`create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
    create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);
    create table if not exists public.api_cache (cache_key text primary key, payload jsonb, expires_at timestamptz, updated_at timestamptz default now());`);
  for (const file of MIGRATIONS) await pool.query(readFileSync(`supabase/bobby-protocol/supabase/migrations/${file}`, 'utf8'));
  await pool.query(readFileSync(`supabase/bobby-protocol/supabase/migrations/${MIGRATIONS.at(-1)}`, 'utf8')); // idempotent
  // A clean slate for the aggregates (earlier pg suites share this cluster).
  await pool.query(`truncate public.bobby_events, public.bobby_purchase_events, public.bobby_llm_credit_marks, public.bobby_llm_usage,
    public.bobby_reader_stats, public.bobby_admin_actions, public.bobby_coupon_redemptions, public.bobby_usage_bonus, public.bobby_subscriptions,
    public.bobby_pro_grants, public.bobby_level_uses, public.bobby_reads restart identity cascade`);
  await pool.query('delete from public.bobby_coupons');
  await pool.query('truncate public.bobby_devices, public.bobby_costs restart identity');
  await pool.query('delete from public.bobby_identities');

  // ---------- privileges ----------
  for (const table of ['bobby_admins', 'bobby_admin_actions', 'bobby_events', 'bobby_reader_stats', 'bobby_purchase_events', 'bobby_llm_credit_marks']) {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        eq((await pool.query('select has_table_privilege($1, $2, $3) as r', [role, `public.${table}`, priv])).rows[0].r, false, `${role} has no ${priv} on ${table}`);
      }
    }
    eq((await pool.query('select has_table_privilege($1, $2, $3) as r', ['service_role', `public.${table}`, 'insert'])).rows[0].r, true, `service_role writes ${table}`);
    eq((await pool.query('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`])).rows[0].r, true, `RLS on ${table}`);
  }
  for (const fn of ['public.bobby_admin_overview(integer)', 'public.bobby_admin_users(text,integer,integer)']) {
    for (const role of ['anon', 'authenticated']) eq((await pool.query('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).rows[0].r, false, `${role} cannot execute ${fn}`);
    eq((await pool.query('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).rows[0].r, true, `service_role executes ${fn}`);
  }
  await assert.rejects(pool.query("insert into public.bobby_events(event, platform) values ('hack', 'web')")); checks++;
  await assert.rejects(pool.query("insert into public.bobby_events(event, platform, referrer) values ('visit', 'web', 'https://x.com/a?b')")); checks++;

  // ---------- reader stats ----------
  const ana = await account({ email: 'ana@example.test', provider: 'google', ageMinutes: 90 });
  await read(ana, null, 'ios', 60);
  await read(ana, null, 'web', 5);
  const s = await stats(`a:${ana}`);
  eq([s.reads, s.platform, s.identity_id], [2, 'ios', ana], 'an account: two reads, first on iOS');
  ok(new Date(s.last_read_at) > new Date(s.first_read_at), 'first and last read');
  const dev = `dev-${randomUUID()}`;
  await read(null, dev, 'web', 10);
  eq((await stats(`d:${dev}`)).reads, 1, 'a guest device');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('alter table public.bobby_reader_stats rename to bobby_reader_stats_off');
    await client.query("insert into public.bobby_reads(device_hash, platform, symbol) values ('dev-trigger-down', 'web', 'BTC')");
    checks++; // a read is never refused because its stats could not be written
    await client.query('rollback');
  } finally { client.release(); }

  // ---------- overview ----------
  const bo = await account({ email: 'bo@example.test', ageMinutes: 30 });
  await account({ email: 'cy@example.test', provider: 'google', ageMinutes: 60 * 24 * 40 }); // older than the window, never read
  await read(bo, null, 'web', 20);
  for (const [event, platform, surface, device, referrer] of [
    ['visit', 'web', 'home', 'v1', 'x.com'], ['visit', 'web', 'home', 'v2', null], ['visit', 'web', 'desk', 'v1', 'x.com'],
    ['visit', 'web', 'home', 'v1', 'x.com'], ['appstore_click', 'web', 'home', 'v2', null], ['signin_start', 'web', 'desk', 'v1', null],
    ['paywall_view', 'ios', null, 'i1', null],
  ]) await pool.query('insert into public.bobby_events(event, platform, surface, device_hash, referrer) values ($1, $2, $3, $4, $5)', [event, platform, surface, `dev-${device}-0000`, referrer]);
  await pool.query(`insert into public.bobby_purchase_events(id, type, environment, store, product_id, price_usd, takehome, event_at, identity_id) values
    ('e1', 'INITIAL_PURCHASE', 'PRODUCTION', 'APP_STORE', 'pro', 4.99, 0.85, now(), $1),
    ('e2', 'RENEWAL', 'PRODUCTION', 'APP_STORE', 'pro', 4.99, 0.85, now(), $1),
    ('e3', 'CANCELLATION', 'PRODUCTION', 'APP_STORE', 'pro', -4.99, 0.85, now(), $1),
    ('e4', 'INITIAL_PURCHASE', 'SANDBOX', 'APP_STORE', 'pro', 4.99, 0.85, now(), null)`, [ana]);
  await pool.query("insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end) values ($1, 'apple', 'active', now() + interval '20 days')", [ana]);
  await pool.query(`insert into public.bobby_llm_credit_marks(provider, kind, amount_usd, created_at) values
    ('openai', 'balance', 20, now() - interval '2 days'), ('openai', 'topup', 15, now() - interval '1 day'), ('openai', 'balance', 1, now() - interval '9 days')`);
  await pool.query(`insert into public.bobby_llm_usage(surface, provider, model, usd, ok, created_at) values
    ('desk', 'openai', 'gpt', 0.5, true, now() - interval '3 days'), ('desk', 'openai', 'gpt', 1.25, true, now() - interval '1 hour'),
    ('desk', 'anthropic', 'claude', 2, false, now())`);
  await pool.query(`insert into public.api_cache(cache_key, payload, expires_at, updated_at) values ('provider-credit-alert:openai', '{}', now() + interval '6 hours', now())
    on conflict (cache_key) do update set updated_at = now()`);
  await pool.query("insert into public.bobby_coupons(code, reads, max_redemptions) values ('ADMIN-TEST1', 5, 10)");
  await pool.query("insert into public.bobby_usage_bonus(identity_id, reads) values ($1, 7)", [bo]);

  const o = await overview(30);
  eq(o.days.length, 30, 'thirty days');
  eq([o.accounts.total, o.accounts.new, o.accounts.byProvider], [3, 2, { apple: 1, google: 2 }], 'accounts');
  eq(o.accounts.daily.length, 30, 'a value per day');
  eq(o.accounts.daily.at(-1), 2, 'two accounts today');
  eq(o.activity.reads, 4, 'reads in the window');
  eq([o.activity.readsDaily.web.at(-1), o.activity.readsDaily.ios.at(-1)], [3, 1], 'reads per platform today');
  eq([o.activity.activation.accounts, o.activity.activation.activated], [2, 2], 'both new accounts activated');
  near(o.activity.activation.medianMinutes, 20, 'median minutes to the first read (30 and 10)');
  eq([o.funnel.web.visitors, o.funnel.web.deskVisitors, o.funnel.web.appStoreClicks, o.funnel.web.signinStarts], [2, 1, 1, 1], 'web funnel');
  eq([o.funnel.web.guestReaders, o.funnel.web.accounts, o.funnel.ios.accounts, o.funnel.ios.paywallViews, o.funnel.ios.pro], [1, 1, 1, 1, 1], 'funnel by platform');
  eq([...o.funnel.topReferrers].sort((a: { referrer: string }, b: { referrer: string }) => a.referrer.localeCompare(b.referrer)),
    [{ referrer: 'direct', visitors: 1 }, { referrer: 'x.com', visitors: 1 }], 'referrers by distinct visitor');
  eq([o.subscriptions.active, o.subscriptions.byProvider], [1, { apple: 1 }], 'memberships');
  near(o.revenue.grossUsd, 9.98, 'gross revenue, production only');
  near(o.revenue.netUsd, (9.98 - 4.99) * 0.85, 'net revenue: refunds subtract');
  near(o.revenue.refundsUsd, 4.99, 'refunds');
  eq([o.revenue.newSubscriptions, o.revenue.renewals, o.revenue.sandboxEvents], [1, 1, 1], 'revenue events');
  near(o.llm.providers.openai.estimatedLeft, 20 + 15 - 1.25, 'openai credit: last balance + top-ups - spend since');
  near(o.llm.providers.openai.month, 1.75, 'openai spend over 30 days');
  eq(o.llm.providers.anthropic.estimatedLeft, null, 'no balance recorded: unknown');
  eq(o.llm.providers.anthropic.failures, 1, 'failed calls');
  ok(o.llm.providers.openai.lastCreditAlert, 'the last credit alert');
  eq([o.coupons.active, o.coupons.giftedReadsLeft], [1, 7], 'coupons');
  eq((await overview(9999)).days.length, 365, 'the window is capped at a year');

  // ---------- audit fixes ----------
  await pool.query("insert into public.bobby_coupons(code, reads, max_redemptions, redeemed) values ('ADMIN-FULL1', 5, 2, 2)");
  eq((await overview(30)).coupons.active, 1, 'a coupon at its cap is not active');
  await pool.query(`insert into public.bobby_purchase_events(id, type, environment, price_usd, takehome, commission_pct, tax_pct, event_at) values
    ('e5', 'RENEWAL', 'PRODUCTION', 10, 0.85, 0.15, 0.10, now())`);
  near((await overview(30)).revenue.netUsd, (9.98 - 4.99) * 0.85 + 10 * 0.75, 'commission and tax from the event');
  await pool.query("insert into public.bobby_llm_usage(surface, provider, model, usd, ok) values ('bobby-cycle', 'openai', 'gpt', 3, true)");
  const g = (await overview(30)).llm;
  ok(g.bySurface.some((x: { surface: string; usd: number }) => x.surface === 'bobby-cycle' && Number(x.usd) === 3), 'spend per surface');
  const deskMonth = Number((await pool.query("select coalesce(sum(usd), 0) s from public.bobby_llm_usage where surface = 'desk' and created_at >= date_trunc('month', now())")).rows[0].s);
  near(Number((await pool.query('select public.bobby_llm_spend() as r')).rows[0].r.month), deskMonth, 'the guard sums the desk only (the cycle spend stays out)');
  ok(g.guard && 'month' in g.guard, 'the guard figure travels with the overview');
  const cov = (await overview(30)).coverage;
  ok(cov.readsSince && cov.eventsSince && cov.purchasesSince && cov.ledgerSurfaces.includes('bobby-cycle'), 'coverage per source');
  const before = (await pool.query("select reads from public.bobby_reader_stats where reader = 'a:' || $1", [ana])).rows[0].reads;
  const rid = (await pool.query("insert into public.bobby_reads(identity_id, platform, symbol) values ($1, 'web', 'BTC') returning id", [ana])).rows[0].id;
  await pool.query('delete from public.bobby_reads where id = $1', [rid]);
  eq((await pool.query("select reads from public.bobby_reader_stats where reader = 'a:' || $1", [ana])).rows[0].reads, before, 'a refunded read leaves the stats as they were');
  const lone = `dev-${randomUUID()}`;
  const lr = (await pool.query("insert into public.bobby_reads(device_hash, platform, symbol) values ($1, 'web', 'BTC') returning id", [lone])).rows[0].id;
  await pool.query('delete from public.bobby_reads where id = $1', [lr]);
  eq((await pool.query("select count(*)::int n from public.bobby_reader_stats where reader = 'd:' || $1", [lone])).rows[0].n, 0, 'a device whose only read was refunded has no stats');
  const m = (await pool.query('select public.bobby_admin_members() as r')).rows[0].r;
  eq([m.subscriptions.length, m.subscriptions[0].email, m.subscriptions[0].active], [1, 'ana@example.test', true], 'members: every subscription with its account');
  for (const role of ['anon', 'authenticated']) for (const fn of ['public.bobby_admin_members()', 'public.bobby_admin_coverage()', 'public.bobby_llm_spend()']) {
    eq((await pool.query('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).rows[0].r, false, `${role} cannot execute ${fn}`);
  }

  // ---------- users ----------
  const all = await users(null);
  eq([all.total, all.users.length, all.users[0].email], [3, 3, 'bo@example.test'], 'newest first');
  const one = (await users('ana@')).users;
  eq([one.length, one[0].reads, one[0].platform, one[0].sub_status, one[0].pro], [1, 2, 'ios', 'active', true], 'lifecycle of one account');
  eq(Number(one[0].activation_minutes), 30, 'minutes from sign-up to the first read');
  eq((await users(null, 1, 1)).users.length, 1, 'pagination');
  eq((await users(bo)).users[0].bonus_reads, 7, 'search by id; gifted reads');

  // ---------- grants from the dashboard ----------
  const grant = async (id: string, r: number, pf: number, mx: number, pd: number) =>
    (await pool.query('select public.bobby_admin_grant($1, $2, $3, $4, $5) as r', [id, r, pf, mx, pd])).rows[0].r;
  const g1 = await grant(bo, 5, 1, 0, 0);
  eq([g1.ok, g1.bonus], [true, { reads: 12, profundo: 1, maximo: 0 }], 'a gift stacks on the coupon balance');
  const g2 = await grant(bo, 0, 0, 0, 7);
  ok(Math.round((new Date(g2.proUntil).getTime() - Date.now()) / 86_400_000) === 7, 'seven days of Pro');
  eq((await pool.query("select source from public.bobby_pro_grants where identity_id = $1", [bo])).rows[0].source, 'admin', 'an admin grant');
  const g3 = await grant(bo, 0, 0, 0, 3);
  ok(Math.round((new Date(g3.proUntil).getTime() - Date.now()) / 86_400_000) === 10, 'Pro days stack');
  eq((await grant(randomUUID(), 1, 0, 0, 0)).error, 'not_found', 'an unknown account');
  await assert.rejects(grant(bo, 0, 0, 0, 0)); checks++;
  await assert.rejects(grant(bo, 5000, 0, 0, 0)); checks++;
  for (const role of ['anon', 'authenticated']) eq((await pool.query("select has_function_privilege($1, 'public.bobby_admin_grant(uuid,int,int,int,int)', 'execute') as r", [role])).rows[0].r, false, `${role} cannot grant`);

  // A dashboard gift is the same server-side balance spent by iOS requests; no AI/provider calls.
  const receiver = await account({ email: 'grant-consumer@example.test' });
  await grant(receiver, 1, 1, 1, 0);
  const balance = async () => (await pool.query('select reads, profundo, maximo from public.bobby_usage_bonus where identity_id=$1', [receiver])).rows[0];
  eq(await balance(), { reads: 1, profundo: 1, maximo: 1 }, 'persisted in the selected identity');
  eq((await pool.query('select count(*)::int n from public.bobby_usage_bonus where identity_id=$1', [ana])).rows[0].n, 0, 'another identity receives no gift');
  const consume = async (paywall = true) => (await pool.query("select public.bobby_consume_read($1,null,null,'ios','NVDA',$2) r", [receiver, paywall])).rows[0].r;
  for (let i = 0; i < 10; i++) eq((await consume()).allowed, true, 'base allowance is consumed first');
  eq((await balance()).reads, 1, 'base reads leave the gift intact');
  const paidByGift = await consume();
  eq([paidByGift.allowed, paidByGift.bonus], [true, 0], 'iOS at its cap spends one gifted read');
  eq((await consume()).allowed, false, 'no reads after base and gift are exhausted');
  await pool.query('delete from public.bobby_reads where id=$1', [paidByGift.readId]);
  eq((await balance()).reads, 1, 'a failed gifted analysis is refunded');
  eq((await consume(false)).allowed, true, 'paywall off permits another ordinary read');
  eq((await balance()).reads, 1, 'paywall off does not spend gifted reads');
  const zeroLimits = { anon: { profundo: [0, 7], maximo: [0, 7] }, free: { profundo: [0, 7], maximo: [0, 7] }, pro: { profundo: [0, 7], maximo: [0, 7] } };
  for (const level of ['profundo', 'maximo']) {
    const lv = (await pool.query("select public.bobby_consume_level($1,null,$2,'NVDA',$3::jsonb) r", [receiver, level, JSON.stringify(zeroLimits)])).rows[0].r;
    eq([lv.allowed, lv.bonus], [true, 0], `gift permits ${level} even with zero base allowance`);
    await pool.query('delete from public.bobby_level_uses where id=$1', [lv.useId]);
    eq((await balance())[level], 1, `${level} failure returns the gift`);
  }
  const race = await Promise.all([consume(), consume()]);
  eq(race.filter((r) => r.allowed).length, 1, 'two simultaneous iOS calls cannot spend one gift twice');
  // Characterize the open retry defect: admin grants have no operation key and repeat their addition.
  await grant(receiver, 5, 0, 0, 0);
  await grant(receiver, 5, 0, 0, 0);
  eq((await balance()).reads, 10, 'a repeated admin grant currently adds twice (not idempotent)');

  // ---------- cascades ----------
  await pool.query("insert into public.bobby_admins(identity_id) values ($1)", [bo]);
  await pool.query("insert into public.bobby_events(event, platform, identity_id) values ('visit', 'web', $1)", [bo]);
  await pool.query('delete from public.bobby_identities where id = $1', [bo]);
  eq(await stats(`a:${bo}`), undefined, 'deleting an account removes its reader stats');
  eq((await pool.query('select count(*)::int n from public.bobby_admins where identity_id = $1', [bo])).rows[0].n, 0, 'and its admin role');
  eq((await pool.query('select count(*)::int n from public.bobby_events where event = $1 and identity_id is null and device_hash is null', ['visit'])).rows[0].n, 1, 'its events stay, anonymous');

  console.log(`admin-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
