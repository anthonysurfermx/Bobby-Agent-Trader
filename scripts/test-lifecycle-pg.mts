// Actual PostgreSQL regressions for 20261001200000_lifecycle_funnel.sql: device touches (first touch kept, a new
// UTC day adds an active day, the account link is timed), events recorded with their device, guest reads touching
// the device, the cohort funnel per platform with retention, and lifecycle stages per person. Needs the schema
// prepared by scripts/test-trader-land-growth.sql.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('lifecycle-pg: SKIP (no DATABASE_URL)');
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
];
const pool = new pg.Pool({ connectionString: url, max: 8 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

const dev = () => `dev-${randomUUID()}`;
const touch = (d: string, platform: string, surface: string | null = null, identity: string | null = null, referrer: string | null = null) =>
  pool.query('select public.bobby_touch_device($1, $2, $3, $4, null, $5)', [d, platform, surface, referrer, identity]);
const record = (event: string, platform: string, surface: string | null, d: string | null, referrer: string | null = null) =>
  pool.query('select public.bobby_record_event($1, $2, $3, $4, $5, null)', [event, platform, surface, d, referrer]);
const device = async (d: string) => (await pool.query('select * from public.bobby_devices where device_hash = $1', [d])).rows[0];
const guestRead = (d: string, platform: string, minutesAgo = 0) =>
  pool.query("insert into public.bobby_reads(device_hash, platform, symbol, created_at) values ($1, $2, 'BTC', now() - make_interval(mins => $3))", [d, platform, minutesAgo]);
const accountRead = (id: string, platform: string) =>
  pool.query("insert into public.bobby_reads(identity_id, platform, symbol) values ($1, $2, 'BTC')", [id, platform]);
async function account() {
  const id = randomUUID(); const authId = randomUUID();
  await pool.query('insert into auth.users(id) values ($1)', [authId]);
  await pool.query("insert into auth.identities(user_id, provider) values ($1, 'apple')", [authId]);
  await pool.query("insert into public.bobby_identities(id, auth_user_id, email, provider) values ($1, $2, $3, 'apple')", [id, authId, `${id.slice(0, 8)}@example.test`]);
  return id;
}
const lifecycle = async (days = 30) => (await pool.query('select public.bobby_admin_lifecycle($1) as r', [days])).rows[0].r;

try {
  await pool.query(`create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
    create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);
    create table if not exists public.api_cache (cache_key text primary key, payload jsonb, expires_at timestamptz, updated_at timestamptz default now());`);
  for (const file of MIGRATIONS) await pool.query(readFileSync(`supabase/bobby-protocol/supabase/migrations/${file}`, 'utf8'));
  await pool.query(readFileSync(`supabase/bobby-protocol/supabase/migrations/${MIGRATIONS.at(-1)}`, 'utf8')); // idempotent
  await pool.query(`truncate public.bobby_devices, public.bobby_events, public.bobby_reader_stats, public.bobby_subscriptions,
    public.bobby_pro_grants, public.bobby_reads, public.bobby_coupon_redemptions, public.bobby_usage_bonus restart identity cascade`);
  await pool.query('delete from public.bobby_identities');

  // ---------- privileges ----------
  for (const role of ['anon', 'authenticated']) {
    for (const priv of ['select', 'insert', 'update', 'delete']) eq((await pool.query('select has_table_privilege($1, $2, $3) as r', [role, 'public.bobby_devices', priv])).rows[0].r, false, `${role} has no ${priv} on bobby_devices`);
    for (const fn of ['public.bobby_touch_device(text,text,text,text,text,uuid)', 'public.bobby_record_event(text,text,text,text,text,text)', 'public.bobby_admin_lifecycle(integer)']) {
      eq((await pool.query('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).rows[0].r, false, `${role} cannot execute ${fn}`);
    }
  }
  eq((await pool.query("select relrowsecurity r from pg_class where oid = 'public.bobby_devices'::regclass")).rows[0].r, true, 'RLS on bobby_devices');

  // ---------- touches ----------
  const a = dev();
  await record('visit', 'web', 'home', a, 'x.com');
  await record('visit', 'web', 'desk', a, 'google.com');
  let row = await device(a);
  eq([row.platform, row.first_surface, row.referrer, row.active_days, row.identity_id], ['web', 'home', 'x.com', 1, null], 'first touch is kept; same day');
  await pool.query("update public.bobby_devices set last_seen = now() - interval '1 day', first_seen = now() - interval '2 days' where device_hash = $1", [a]);
  await record('visit', 'web', 'desk', a);
  eq((await device(a)).active_days, 2, 'a new UTC day adds an active day');
  const ana = await account();
  await touch(a, 'web', null, ana);
  row = await device(a);
  eq(row.identity_id, ana, 'signed in: linked');
  ok(row.linked_at, 'and timed');
  const linkedAt = row.linked_at;
  await touch(a, 'web', null, null);
  eq([(await device(a)).identity_id, String((await device(a)).linked_at)], [ana, String(linkedAt)], 'a signed-out visit keeps the link');
  await touch('short', 'web');
  eq((await pool.query("select count(*)::int n from public.bobby_devices where device_hash = 'short'")).rows[0].n, 0, 'a malformed hash is ignored');

  const b = dev();
  await record('visit', 'web', 'home', b, 'news.ycombinator.com');
  await record('visit', 'web', 'desk', b);
  await record('paywall_view', 'web', 'desk', b);
  eq((await pool.query('select count(*)::int n from public.bobby_events where device_hash = $1', [b])).rows[0].n, 3, 'events recorded');
  eq([(await device(b)).first_surface, (await device(b)).referrer], ['home', 'news.ycombinator.com'], 'and the device first-touch');
  await record('visit', 'web', 'home', null);
  ok(true, 'an event without a device'); checks++;

  const i1 = dev();
  await guestRead(i1, 'ios', 5);
  eq([(await device(i1)).platform, (await device(i1)).active_days], ['ios', 1], 'a guest read touches its device');

  // ---------- cohort funnel ----------
  // web: a (home, desk, account ana with 2 reads, returned), b (home, desk, paywall, 1 guest read), c (home only)
  await guestRead(b, 'web', 1);
  await accountRead(ana, 'web');
  await accountRead(ana, 'web');
  const c = dev();
  await record('visit', 'web', 'home', c);
  // ios: i1 (1 read), i2 (5 guest reads, signs in as bo who is Pro)
  const i2 = dev();
  for (let k = 0; k < 5; k++) await guestRead(i2, 'ios', 10 - k);
  const bo = await account();
  await touch(i2, 'ios', null, bo);
  await pool.query("insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end) values ($1, 'apple', 'active', now() + interval '20 days')", [bo]);

  const lc = await lifecycle(30);
  eq([lc.web.devices, lc.web.home, lc.web.desk, lc.web.read1, lc.web.read2, lc.web.read5], [3, 3, 2, 2, 1, 0], 'web: visitors → desk → reads');
  eq([lc.web.account, lc.web.returned, lc.web.paywall, lc.web.pro], [1, 1, 1, 0], 'web: account, return, paywall, Pro');
  eq([lc.web.devices, lc.web.engaged, lc.web.read1, lc.web.accountAfterRead, lc.web.proAfterRead], [3, 2, 2, 1, 0], 'the nested web funnel never grows');
  eq([lc.ios.devices, lc.ios.engaged, lc.ios.read1, lc.ios.accountAfterRead, lc.ios.proAfterRead, lc.ios.returnedAfterRead], [2, 2, 2, 1, 1, 0], 'the nested iOS funnel');
  eq([lc.ios.devices, lc.ios.read1, lc.ios.read2, lc.ios.read5, lc.ios.account, lc.ios.pro], [2, 2, 1, 1, 1, 1], 'ios: opens → reads → account → Pro');
  eq([lc.web.retention.d1.eligible, lc.web.retention.d1.returned], [1, 1], 'D1: the device first seen two days ago came back a day later');
  eq(lc.ios.retention.d7.eligible, 0, 'nothing old enough for D7');
  ok(lc.ios.medianMinutesToFirstRead !== null, 'time to the first read');

  // ---------- stages ----------
  const st = lc.stages;
  eq([st.accounts, st.guests], [2, 3], 'people: two accounts, three guest devices that never signed in');
  eq([st.pro, st.new, st.activated], [1, 1, 3], 'pro, new (device c), activated (ana, b, i1)');
  await pool.query("update public.bobby_devices set last_seen = now() - interval '40 days' where device_hash = $1", [c]);
  eq((await lifecycle(30)).stages.lost, 1, 'a quiet guest is lost after 30 days');

  // ---------- economics ----------
  await pool.query('truncate public.bobby_costs, public.bobby_purchase_events, public.bobby_llm_usage, public.bobby_admin_settings restart identity');
  await pool.query(`insert into public.bobby_costs(kind, channel, amount_usd, spent_on) values
    ('marketing', 'tiktok', 50, current_date), ('marketing', 'meta', 30, current_date - 3), ('infra', null, 20, current_date),
    ('marketing', 'tiktok', 999, current_date - 200)`);
  await pool.query(`insert into public.bobby_purchase_events(id, type, environment, price_usd, takehome, event_at, identity_id) values
    ('p1', 'INITIAL_PURCHASE', 'PRODUCTION', 4.99, 0.85, now(), $1), ('p2', 'RENEWAL', 'PRODUCTION', 4.99, 0.85, now(), $1),
    ('p3', 'INITIAL_PURCHASE', 'SANDBOX', 4.99, 0.85, now(), null), ('p4', 'EXPIRATION', 'PRODUCTION', null, null, now(), $1)`, [bo]);
  await pool.query("insert into public.bobby_llm_usage(surface, provider, model, usd, ok) values ('desk', 'anthropic', 'claude', 1.5, true)");
  await pool.query(`insert into public.bobby_admin_settings(key, value) values ('unit_economics', '{"monthlyChurn": 0.08}')`);
  const ec = (await pool.query('select public.bobby_admin_economics(30) as r')).rows[0].r;
  eq([Number(ec.costs.marketingUsd), Number(ec.costs.infraUsd)], [80, 20], 'costs in the window only');
  eq(ec.costs.byChannel.map((c: { channel: string }) => c.channel), ['tiktok', 'meta'], 'marketing by channel, largest first');
  eq([Number(ec.revenue.grossUsd), ec.revenue.newPaying, ec.revenue.expirations30d, Number(ec.revenue.lastPriceUsd)], [9.98, 1, 1, 4.99], 'production revenue, new payers, expirations, price');
  ok(Math.abs(Number(ec.revenue.netUsd) - 9.98 * 0.85) < 1e-6, 'net after the store fee');
  eq([ec.subscriptions.active, Number(ec.llmUsd), ec.assumptions.monthlyChurn], [1, 1.5, 0.08], 'active subscriptions, LLM spend, assumptions');
  for (const role of ['anon', 'authenticated']) eq((await pool.query("select has_table_privilege($1, 'public.bobby_costs', 'select') r", [role])).rows[0].r, false, `${role} cannot read costs`);

  // ---------- cascades ----------
  await pool.query('delete from public.bobby_identities where id = $1', [ana]);
  eq((await device(a)).identity_id, null, 'deleting the account unlinks the device');

  console.log(`lifecycle-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
