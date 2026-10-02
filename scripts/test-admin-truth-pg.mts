// Actual PostgreSQL regressions for 20261001230000_admin_truth.sql: signed-in reads keep their install (metering
// untouched), install ↔ account pairings, the desk outcomes, internal traffic, observed vs rebuilt installs, the
// nested cohort in order, exact-day retention, deduplicated people, refunds and the service-only privileges.
// Needs the schema prepared by scripts/test-trader-land-growth.sql (same cluster as test-admin-pg.mts).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('admin-truth-pg: SKIP (no DATABASE_URL)');
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
  '20261001230000_admin_truth.sql',
  '20261001233000_admin_truth_review.sql',
  '20261002120000_admin_codex_review.sql',
  '20261002130000_admin_device_facts_join.sql',
];
const TRUTH = 'supabase/bobby-protocol/supabase/migrations/20261001230000_admin_truth.sql';
const REVIEW = 'supabase/bobby-protocol/supabase/migrations/20261001233000_admin_truth_review.sql';
// Re-applying the first migration (to test its idempotent backfill) brings back its functions: the review goes on top.
const CODEX = 'supabase/bobby-protocol/supabase/migrations/20261002120000_admin_codex_review.sql';
// The Codex-review migration changes three return types: drop them before the older files recreate them.
const DROP_NEW = 'drop function if exists public.bobby_admin_people_facts(); drop function if exists public.bobby_admin_device_facts(); drop function if exists public.bobby_admin_members(boolean);';
const reapply = async () => {
  await pool.query(DROP_NEW);
  await pool.query(readFileSync(TRUTH, 'utf8')); await pool.query(readFileSync(REVIEW, 'utf8')); await pool.query(readFileSync(CODEX, 'utf8'));
  await pool.query(readFileSync('supabase/bobby-protocol/supabase/migrations/20261002130000_admin_device_facts_join.sql', 'utf8'));
};
const pool = new pg.Pool({ connectionString: url, max: 8 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
const one = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];

async function account(opts: { email?: string; provider?: string; ageMinutes?: number } = {}) {
  const id = randomUUID();
  const authId = randomUUID();
  await pool.query('insert into auth.users(id) values ($1)', [authId]);
  await pool.query('insert into auth.identities(user_id, provider) values ($1, $2)', [authId, opts.provider ?? 'apple']);
  await pool.query(`insert into public.bobby_identities(id, auth_user_id, email, provider, created_at) values ($1, $2, $3, $4, now() - make_interval(mins => $5))`,
    [id, authId, opts.email ?? `${id.slice(0, 8)}@example.test`, opts.provider ?? 'apple', opts.ageMinutes ?? 0]);
  return id;
}
const dev = (tag: string) => `dev-${tag}-${randomUUID().slice(0, 8)}`;
const consume = async (identity: string | null, device: string | null, platform = 'web') =>
  (await one('select public.bobby_consume_read($1, $2, null, $3, $4, false) as r', [identity, device, platform, 'BTC'])).r;
const growth = async (days = 30, internal = false) => (await one('select public.bobby_admin_growth($1, $2) as r', [days, internal])).r;
const minsAgo = (m: number) => `now() - make_interval(mins => ${m})`;
const DAY = 24 * 60;

try {
  await pool.query(`create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
    create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);
    create table if not exists public.api_cache (cache_key text primary key, payload jsonb, expires_at timestamptz, updated_at timestamptz default now());`);
  await pool.query(DROP_NEW);
  for (const file of MIGRATIONS) await pool.query(readFileSync(`supabase/bobby-protocol/supabase/migrations/${file}`, 'utf8'));
  await reapply(); // idempotent
  await pool.query(`truncate public.bobby_events, public.bobby_purchase_events, public.bobby_llm_credit_marks, public.bobby_llm_usage,
    public.bobby_reader_stats, public.bobby_admin_actions, public.bobby_coupon_redemptions, public.bobby_usage_bonus, public.bobby_subscriptions,
    public.bobby_pro_grants, public.bobby_level_uses, public.bobby_reads restart identity cascade`);
  await pool.query('delete from public.bobby_coupons');
  await pool.query('truncate public.bobby_device_networks, public.bobby_device_accounts, public.bobby_activity_days, public.bobby_internal_marks, public.bobby_internal_networks, public.bobby_devices, public.bobby_costs restart identity');
  await pool.query('delete from public.bobby_admins');
  await pool.query('delete from public.bobby_identities');

  // ---------- privileges ----------
  for (const table of ['bobby_device_accounts', 'bobby_activity_days', 'bobby_internal_marks', 'bobby_internal_networks', 'bobby_device_networks']) {
    for (const role of ['anon', 'authenticated']) for (const priv of ['select', 'insert', 'update', 'delete']) {
      eq((await one('select has_table_privilege($1, $2, $3) as r', [role, `public.${table}`, priv])).r, false, `${role} has no ${priv} on ${table}`);
    }
    eq((await one('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`])).r, true, `RLS on ${table}`);
  }
  for (const fn of ['public.bobby_admin_growth(integer,boolean)', 'public.bobby_admin_device_facts()', 'public.bobby_admin_people_facts()',
    'public.bobby_record_outcome(text,text,text,uuid,text,text,text,text)', 'public.bobby_mark_admin_session(text,text)', 'public.bobby_identity_internal(uuid)',
    'public.bobby_device_internal(text)', 'public.bobby_traffic_internal(uuid,text)', 'public.bobby_touch_device(text,text,text,text,text,uuid,text,text,text)',
    'public.bobby_internal_identity_ids()', 'public.bobby_internal_device_hashes()', 'public.bobby_ignore_internal_network(text)', 'public.bobby_admin_internal_networks()',
    'public.bobby_admin_devices(integer)', 'public.bobby_set_device_internal(text,boolean)']) {
    for (const role of ['anon', 'authenticated']) eq((await one('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).r, false, `${role} cannot execute ${fn}`);
    eq((await one('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).r, true, `service_role executes ${fn}`);
  }
  await assert.rejects(pool.query("insert into public.bobby_events(event, platform) values ('hack', 'web')")); checks++;
  await assert.rejects(pool.query("insert into public.bobby_events(event, platform, detail) values ('read_done', 'web', 'Not Valid!')")); checks++;
  await assert.rejects(pool.query("select public.bobby_record_outcome('visit', 'web', null, null, null)")); checks++;

  // ---------- observed vs rebuilt (the classification runs when the migration is applied) ----------
  const rebuilt = dev('rebuilt'), seenOld = dev('seenold');
  await pool.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen) values ($1, 'web', timestamptz '2026-09-27 00:13:00+00', timestamptz '2026-09-27 00:20:00+00'),
    ($2, 'web', timestamptz '2026-10-01 19:01:11+00', timestamptz '2026-10-01 19:01:11+00')`, [rebuilt, seenOld]);
  await pool.query("insert into public.bobby_events(event, platform, surface, device_hash, created_at) values ('visit', 'web', 'auth', $1, timestamptz '2026-10-01 19:01:11+00')", [seenOld]);
  await reapply();
  eq((await one('select source from public.bobby_devices where device_hash = $1', [rebuilt])).source, 'backfill', 'an install first seen at its first read (before the cutoff) was rebuilt');
  eq((await one('select source from public.bobby_devices where device_hash = $1', [seenOld])).source, 'observed', 'an install with an event at its first sighting was seen arriving');
  await pool.query('delete from public.bobby_events');
  await pool.query('delete from public.bobby_devices');
  await pool.query('delete from public.bobby_activity_days');

  // ---------- a signed-in read keeps its install; metering is untouched ----------
  const ana = await account({ email: 'ana@example.test', ageMinutes: 60 });
  const phone = dev('phone');
  for (let i = 0; i < 3; i++) eq((await consume(null, phone, 'ios')).allowed, true, `guest read ${i + 1} of 3`);
  eq((await consume(null, phone, 'ios')).code, 'signin_required', 'the 4th guest read asks for an account');
  const signed = await consume(ana, phone, 'ios');
  eq([signed.allowed, signed.tier, signed.used], [true, 'free', 1], 'signed in on the same phone: an account read, counted by account');
  eq((await one('select identity_id, device_hash from public.bobby_reads where id = $1', [signed.readId])), { identity_id: ana, device_hash: phone }, 'the read keeps the install');
  eq((await consume(null, phone, 'ios')).code, 'signin_required', 'the account read never refills the guest allowance');
  eq((await one("select reads from public.bobby_reader_stats where reader = 'a:' || $1", [ana])).reads, 1, 'account stats: 1');
  eq((await one("select reads from public.bobby_reader_stats where reader = 'd:' || $1", [phone])).reads, 3, 'guest stats stay guest-only: 3');
  eq((await one('select reads, platform from public.bobby_devices where device_hash = $1', [phone])), { reads: 4, platform: 'ios' }, 'the install counts all 4 of its reads');
  ok((await one('select count(*)::int n from public.bobby_device_accounts where device_hash = $1 and identity_id = $2', [phone, ana])).n === 1, 'the install is paired with the account');
  eq((await one("select reads from public.bobby_activity_days where subject = 'a:' || $1 and day = (now() at time zone 'utc')::date", [ana])).reads, 1, 'account activity today');
  eq((await one("select reads from public.bobby_activity_days where subject = 'd:' || $1 and day = (now() at time zone 'utc')::date", [phone])).reads, 4, 'install activity today');
  eq((await consume(ana, null, 'web')).allowed, true, 'a read with no install still works');

  // A switch of accounts on the same install keeps both pairings.
  const ben = await account({ email: 'ben@example.test' });
  await pool.query("select public.bobby_touch_device($1, 'ios', null, null, null, $2)", [phone, ben]);
  eq((await one('select count(*)::int n from public.bobby_device_accounts where device_hash = $1', [phone])).n, 2, 'both accounts stay paired');
  eq((await one('select identity_id from public.bobby_devices where device_hash = $1', [phone])).identity_id, ben, 'the latest account on the install');

  // A refunded read leaves the install and the day as they were.
  const before = await one('select reads from public.bobby_devices where device_hash = $1', [phone]);
  const refund = await consume(ana, phone, 'ios');
  await pool.query('delete from public.bobby_reads where id = $1', [refund.readId]);
  eq((await one('select reads from public.bobby_devices where device_hash = $1', [phone])).reads, before.reads, 'refund: install reads');
  eq((await one("select reads from public.bobby_activity_days where subject = 'a:' || $1 and day = (now() at time zone 'utc')::date", [ana])).reads, 2, 'refund: account day');

  // ---------- desk outcomes ----------
  await pool.query("select public.bobby_record_outcome('read_done', 'ios', $1, $2, 'profundo')", [phone, ana]);
  await pool.query("select public.bobby_record_outcome('desk_blocked', 'web', null, null, 'daily_limit', 'MX', 'CMX')");
  eq(await one("select event, detail, surface, platform, country from public.bobby_events where event = 'read_done'"),
    { event: 'read_done', detail: 'profundo', surface: 'desk', platform: 'ios', country: null }, 'an outcome: level, desk, no location on iOS');
  eq(await one("select country, region from public.bobby_events where event = 'desk_blocked'"), { country: 'MX', region: 'CMX' }, 'web outcomes keep the coarse location');

  // ---------- the cohort, in order ----------
  await pool.query('truncate public.bobby_events, public.bobby_reads, public.bobby_reader_stats restart identity');
  await pool.query('truncate public.bobby_device_networks, public.bobby_device_accounts, public.bobby_activity_days, public.bobby_devices');
  const A = dev('a'), B = dev('b'), E = dev('e'), G = dev('g'), OLD = dev('old');
  // A arrives on the web 3 days ago, opens the desk, reads 3 times, hits the wall and creates an account.
  await pool.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen, first_surface) values ($1, 'web', ${minsAgo(3 * DAY)}, ${minsAgo(3 * DAY)}, 'home')`, [A]);
  await pool.query(`insert into public.bobby_events(event, platform, surface, device_hash, created_at) values
    ('visit', 'web', 'home', $1, ${minsAgo(3 * DAY)}), ('visit', 'web', 'desk', $1, ${minsAgo(3 * DAY - 1)}), ('wall_signin', 'web', 'desk', $1, ${minsAgo(3 * DAY - 30)})`, [A]);
  for (const m of [5, 10, 15]) await pool.query(`insert into public.bobby_reads(device_hash, platform, symbol, created_at) values ($1, 'web', 'BTC', ${minsAgo(3 * DAY - m)})`, [A]);
  const cy = await account({ email: 'cy@example.test', ageMinutes: DAY });
  await pool.query("select public.bobby_touch_device($1, 'web', null, null, null, $2)", [A, cy]);
  // B arrives 2 days ago and never reads.
  await pool.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen, first_surface) values ($1, 'web', ${minsAgo(2 * DAY)}, ${minsAgo(2 * DAY)}, 'desk')`, [B]);
  await pool.query(`insert into public.bobby_events(event, platform, surface, device_hash, utm_source, created_at) values ('visit', 'web', 'desk', $1, 'tiktok', ${minsAgo(2 * DAY)})`, [B]);
  await pool.query("update public.bobby_devices set utm_source = 'tiktok' where device_hash = $1", [B]);
  // E is the owner's browser (opened /admin); G is paired with an admin account; OLD was rebuilt from reads.
  await pool.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen) values ($1, 'web', ${minsAgo(DAY)}, ${minsAgo(DAY)}), ($2, 'web', ${minsAgo(DAY)}, ${minsAgo(DAY)})`, [E, G]);
  await pool.query("select public.bobby_mark_admin_session($1, null)", [E]);
  const boss = await account({ email: 'boss@example.test', provider: 'google', ageMinutes: 10 * DAY });
  await pool.query('insert into public.bobby_admins(identity_id) values ($1)', [boss]);
  await pool.query("select public.bobby_touch_device($1, 'web', null, null, null, $2)", [G, boss]);
  await pool.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen, source, reads, first_read_at) values ($1, 'web', ${minsAgo(4 * DAY)}, ${minsAgo(4 * DAY)}, 'backfill', 2, ${minsAgo(4 * DAY)})`, [OLD]);
  // An iPhone 9 days ago: one read that day, opens the app the next day, nothing on day 7.
  await pool.query(`insert into public.bobby_reads(device_hash, platform, symbol, created_at) values ($1, 'ios', 'ETH', ${minsAgo(9 * DAY)})`, [phone]);
  await pool.query(`insert into public.bobby_activity_days(subject, day, platform, touches) values ('d:' || $1, (now() at time zone 'utc')::date - 8, 'ios', 1)`, [phone]);
  await pool.query("select public.bobby_record_outcome('read_done', 'web', $1, null, 'rapido')", [A]);
  await pool.query("select public.bobby_record_outcome('read_done', 'web', $1, $2, 'rapido')", [G, boss]);

  const g = await growth(30);
  const w = g.cohorts.web, i = g.cohorts.ios;
  eq([w.arrived, w.home, w.deskOrRead, w.read1, w.read2, w.read3, w.wall], [2, 1, 2, 1, 1, 1, 1], 'web cohort: outside installs seen arriving, nested');
  eq([w.account, w.accountNew, w.accountAfterRead, w.accountAfterWall, w.proAfterRead], [1, 1, 1, 1, 0], 'web: the account came after the read and the wall');
  eq(Number(w.medianMinutesToFirstRead), 5, 'minutes from arrival to the first read');
  eq(w.delivered, 1, 'answers delivered to the cohort (the admin-paired install is left out)');
  eq(w.retention.d1, { eligible: 2, returned: 0, read: 0 }, 'D1 on the exact day after');
  eq([i.arrived, i.read1], [1, 1], 'iOS cohort');
  eq([i.retention.d1, i.retention.d7.returned, i.retention.w1.returned, i.retention.w1.read], [{ eligible: 1, returned: 1, read: 0 }, 0, 1, 0], 'iOS: came back the next day without reading; nothing on day 7');
  eq([g.history.web.installs, g.history.web.reads], [1, 2], 'rebuilt installs are history, never cohort');
  eq(g.people.excluded, { accounts: 1, guests: 1 }, 'the admin account and the owner browser are left out');
  eq((await growth(30, true)).cohorts.web.arrived, 4, 'asking for internal traffic includes them');
  const src = Object.fromEntries(g.acquisition.sources.map((s: { source: string; installs: number; read1: number }) => [s.source, [s.installs, s.read1]]));
  eq(src, { direct: [1, 1], 'utm:tiktok': [1, 0] }, 'first-touch source with how far it got');
  eq([g.outcomes.delivered, g.outcomes.wallSignin, g.outcomes.wallSigninInstalls], [1, 1, 1], 'outcomes, outside traffic only');
  ok(g.outcomes.consumedTotal === g.outcomes.consumed + g.outcomes.consumedInternal, 'consumed reads split into outside + internal');

  // People: cy and the install A are one person (A's guest reads count for cy); the guest B and the iPhone (its
  // pairings were cleared above) are guests; ana and ben have not read since.
  const people = await q('select * from public.bobby_admin_people_facts() where not internal order by person');
  const cyRow = people.find((p) => p.identity_id === cy);
  eq([cyRow.reads, cyRow.kind], [3, 'account'], 'an account carries the guest reads of its install');
  ok(!people.some((p) => p.person === `d:${A}`), 'a paired install is not a second person');
  eq(g.people.accountsNeverRead, 2, 'outside accounts that never read (ana, ben)');
  eq(g.attention.neverRead.map((x: { email: string }) => x.email), ['ben@example.test', 'ana@example.test'], 'who to nudge, newest first');

  // ---------- the owner marks an install ----------
  const prefix = B.slice(0, 10);
  eq((await one('select public.bobby_set_device_internal($1, true) as n', [prefix])).n, 1, 'mark by prefix');
  eq((await growth(30)).cohorts.web.arrived, 1, 'a marked install leaves the cohort');
  eq((await one('select public.bobby_set_device_internal($1, false) as n', [prefix])).n, 1, 'and comes back');
  await assert.rejects(pool.query("select public.bobby_set_device_internal('x', true)")); checks++;
  const list = (await one('select public.bobby_admin_devices(50) as r')).r;
  ok(list.length >= 5 && list.every((d: { device: string }) => d.device.length === 10), 'the installs list never exposes the full hash');

  // ---------- the owner's emails and networks ----------
  const listed = await account({ email: 'Guillermos22@gmail.com', provider: 'google' });
  eq((await one('select public.bobby_identity_internal($1) as r', [listed])).r, true, 'a listed email is internal (case-insensitive), even for a new account');
  eq((await one('select public.bobby_identity_internal($1) as r', [cy])).r, false, 'an outside account is not');
  const cafe = dev('cafe'), net = 'net-' + randomUUID().slice(0, 12), net2 = 'net-' + randomUUID().slice(0, 12);
  await pool.query("select public.bobby_record_event('visit', 'web', 'home', $1, null, null, 'MX', 'CMX', $2)", [cafe, net]);
  eq((await one('select public.bobby_device_internal($1) as r', [cafe])).r, false, 'an install on an address nobody marked is outside');
  await pool.query('select public.bobby_mark_admin_session(null, $1)', [net]);
  eq((await one('select public.bobby_device_internal($1) as r', [cafe])).r, true, 'once an admin uses that address, installs seen there before are internal too');
  await pool.query("select public.bobby_record_event('visit', 'web', 'home', $1, null, null, 'MX', 'CMX', $2)", [cafe, net2]);
  eq((await one('select public.bobby_device_internal($1) as r', [cafe])).r, true, 'and stay internal on another network (history, not the latest address)');
  const later = dev('later');
  await pool.query("select public.bobby_record_event('visit', 'web', 'home', $1, null, null, 'MX', 'CMX', $2)", [later, net]);
  eq((await one('select public.bobby_device_internal($1) as r', [later])).r, true, 'an install seen on that address later is internal');
  const nets = (await one('select public.bobby_admin_internal_networks() as r')).r;
  eq([nets.length, nets[0].installs, nets[0].onlyByNetwork, nets[0].network.length], [1, 2, 2, 10], 'the network list: prefix only, installs it leaves out');
  const reads = "insert into public.bobby_reads(device_hash, network_hash, platform, symbol) values ($1, $2, 'web', 'BTC')";
  const guest = dev('guest');
  await pool.query(reads, [guest, net]);
  eq((await one('select public.bobby_device_internal($1) as r', [guest])).r, false, "a read's /24 metering network never makes an install internal");
  eq((await one('select public.bobby_ignore_internal_network($1) as n', [nets[0].network])).n, 1, 'the owner removes the network');
  eq((await one('select public.bobby_device_internal($1) as r', [cafe])).r, false, 'removing it undoes exactly what it caused');
  await pool.query('select public.bobby_mark_admin_session(null, $1)', [net]);
  eq((await one('select public.bobby_device_internal($1) as r', [later])).r, false, 'and the next /admin visit does not add it back');
  eq((await one('select public.bobby_admin_internal_networks() as r')).r.length, 0, 'a removed network is not listed');
  // An account signed in on an install the owner uses for /admin is the team's, even without a listed email.
  const owner = dev('owner'), apple = await account({ provider: 'apple' });
  await pool.query('select public.bobby_mark_admin_session($1, null)', [owner]);
  eq((await one('select public.bobby_identity_internal($1) as r', [apple])).r, false, 'an outside Apple account');
  await pool.query("select public.bobby_touch_device($1, 'web', null, null, null, $2)", [owner, apple]);
  eq((await one('select public.bobby_identity_internal($1) as r', [apple])).r, true, 'signed in on the /admin install: the team');
  await pool.query('delete from public.bobby_internal_networks');
  await pool.query('delete from public.bobby_identities where id = any($1)', [[listed, apple]]);
  await pool.query('delete from public.bobby_reads where device_hash = any($1)', [[guest]]);
  await pool.query('delete from public.bobby_events where device_hash = any($1)', [[cafe, later]]);
  await pool.query('delete from public.bobby_devices where device_hash = any($1)', [[cafe, later, guest, owner]]);

  // ---------- the overview, outside traffic only ----------
  const ov = async (internal = false) => (await one('select public.bobby_admin_overview(30, $1) as r', [internal])).r;
  await pool.query("insert into public.bobby_reads(identity_id, device_hash, platform, symbol) values ($1, $2, 'web', 'BTC')", [boss, G]);
  await pool.query("insert into public.bobby_events(event, platform, surface, device_hash) values ('visit', 'ios', 'home', $1), ('visit', 'web', 'home', $2)", [phone, E]);
  await pool.query(`insert into public.bobby_purchase_events(id, type, environment, price_usd, takehome, identity_id, event_at) values
    ('t1', 'INITIAL_PURCHASE', 'PRODUCTION', 4.99, 0.85, $1, now()), ('t2', 'INITIAL_PURCHASE', 'PRODUCTION', 4.99, 0.85, $2, now()),
    ('t3', 'INITIAL_PURCHASE', 'PRODUCTION', 0, 0.85, $3, now())`, [cy, boss, ana]);
  const o = await ov();
  eq([o.accounts.total, o.accounts.internal], [3, 1], 'accounts: the admin is left out and counted apart');
  eq(o.accounts.active7d, 0, 'active accounts read in the last 7 days (an API call is not activity)');
  eq([o.activity.reads, o.activity.readsInternal], [4, 1], 'reads: the admin read is apart');
  eq(o.activity.activeReaders7d, Number((await growth(30)).people.readers7d), 'readers: one number, by person, on both views');
  eq(o.funnel.web.visitors, 2, 'web visitors: outside installs only (the owner browser is out)');
  eq(o.funnel.visitsDaily.reduce((a: number, b: number) => a + b, 0), 2, 'visits per day count web visits only');
  eq([Number(o.revenue.grossUsd), o.revenue.newPaying, o.revenue.internalEvents], [4.99, 1, 1], 'revenue: a team purchase is apart; a free start is not a payer');
  ok(o.activity.activation.measuredSince, 'activation says since when first reads exist');
  eq((await ov(true)).accounts.total, 4, 'asking for internal traffic includes the admin');
  for (const role of ['anon', 'authenticated']) eq((await one("select has_function_privilege($1, 'public.bobby_admin_overview(integer,boolean)', 'execute') as r", [role])).r, false, `${role} cannot read the overview`);
  eq((await one("select count(*)::int n from pg_proc where proname = 'bobby_admin_overview'")).n, 1, 'one overview signature (no ambiguous overload)');

  // ---------- the users list agrees with the figures ----------
  await reapply();
  const teamMate = await account({ email: 'anthony@rizoma.boutique', provider: 'google' });
  const ul = (await one('select public.bobby_admin_users(null, 200, 0) as r')).r;
  const row = (id: string) => ul.users.find((u: { id: string }) => u.id === id);
  eq([row(teamMate).is_team, row(teamMate).is_internal], [true, false], 'a listed email is team, not hand-marked');
  eq([row(boss).is_team, row(cy).is_team], [true, false], 'an admin is team; an outside account is not');
  eq(ul.internal, ul.users.filter((u: { is_team: boolean }) => u.is_team).length, 'the internas count is the same rule');

  // ---------- it stays fast as the data grows ----------
  const pc = await pool.connect();
  try {
    await pc.query('begin');
    await pc.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen, reads, first_read_at)
      select 'perf-dev-' || g, case when g % 3 = 0 then 'ios' else 'web' end, now() - make_interval(hours => g % 700), now(), g % 4, case when g % 4 > 0 then now() - make_interval(hours => g % 700) end
      from generate_series(1, 2000) g`);
    await pc.query(`insert into public.bobby_reads(device_hash, network_hash, platform, symbol, created_at)
      select 'perf-dev-' || (g % 2000 + 1), 'perfnet-' || (g % 50), 'web', 'BTC', now() - make_interval(hours => g % 600) from generate_series(1, 6000) g`);
    await pc.query(`insert into public.bobby_events(event, platform, surface, device_hash, created_at)
      select 'visit', 'web', 'home', 'perf-dev-' || (g % 2000 + 1), now() - make_interval(hours => g % 600) from generate_series(1, 6000) g`);
    await pc.query(`insert into public.bobby_device_networks(device_hash, network_hash) select 'perf-dev-' || g, 'caller-' || (g % 300) from generate_series(1, 2000) g`);
    await pc.query("insert into public.bobby_internal_networks(network_hash, note) values ('caller-7', 'perf')");
    const t0 = Date.now();
    await pc.query('select public.bobby_admin_growth(30, false), public.bobby_admin_overview(30, false)');
    const ms = Date.now() - t0;
    ok(ms < 4000, `growth + overview with 2,000 installs, 6,000 reads and 6,000 events in ${ms} ms (under 4 s; the API aborts at 6 s)`);
  } finally { await pc.query('rollback'); pc.release(); }

  // ---------- Codex review (20261002120000) ----------
  {
    const facts = async (id: string) => one("select * from public.bobby_admin_people_facts() where person = 'a:' || $1", [id]);
    // F05: an account signed in on an install seen on a team network is the team's, and so is its other install.
    const netA = dev('neta'), netB = dev('netb'), acct = await account();
    await pool.query("insert into public.bobby_internal_networks (network_hash, note) values ('codex-net-hash-1', 'test') on conflict do nothing");
    await pool.query("select public.bobby_touch_device($1, 'web', null, null, null, null, null, null, 'codex-net-hash-1')", [netA]);
    await pool.query("select public.bobby_touch_device($1, 'web', null, null, null, $2)", [netA, acct]);
    await pool.query("select public.bobby_touch_device($1, 'ios', null, null, null, $2)", [netB, acct]);
    eq([(await facts(acct)).internal, (await one('select public.bobby_device_internal($1) r', [netB])).r], [true, true], 'F05: the whole person follows the team network');
    const nets = (await one('select public.bobby_admin_internal_networks() r')).r.find((n: { network: string }) => n.network === 'codex-net-');
    eq([nets.onlyByNetwork, nets.accountsOnlyByNetwork], [1, 1], 'F05: the network view says what it pulls in by itself');
    await pool.query("update public.bobby_internal_networks set ignored = true where network_hash = 'codex-net-hash-1'");
    eq((await facts(acct)).internal, false, 'F05: removing the network releases the person');
    // F04: B reading on A's install today does not make A a reader this week.
    const shared = dev('shared'), first = await account(), second = await account();
    await pool.query("select public.bobby_touch_device($1, 'web', null, null, null, $2)", [shared, first]);
    await pool.query("update public.bobby_activity_days set day = day - 8 where subject in ('d:' || $1, 'a:' || $2)", [shared, first]);
    await pool.query("update public.bobby_device_accounts set first_at = now() - interval '8 days' where device_hash = $1", [shared]);
    await consume(second, shared);
    eq([(await facts(first)).read_7, (await facts(second)).read_7], [false, true], 'F04: another account\'s read stays with that account');
    // F09: read 40 days ago and opened today is not an active reader.
    const old = dev('old'); await consume(null, old);
    await pool.query("update public.bobby_activity_days set day = day - 40 where subject = 'd:' || $1", [old]);
    await pool.query("update public.bobby_reader_stats set first_read_at = first_read_at - interval '40 days', last_read_at = last_read_at - interval '40 days' where reader = 'd:' || $1", [old]);
    await pool.query("select public.bobby_touch_device($1, 'web', null, null, null, null)", [old]);
    const oldFacts = await one("select last_read_day, last_day from public.bobby_admin_people_facts() where person = 'd:' || $1", [old]);
    ok(oldFacts.last_read_day < oldFacts.last_day, 'F09: last read day is not the last open');
    // F01: an active subscription with an unknown environment is unverified, never paid; sandbox apart.
    const buyer = await account(), tester = await account();
    await pool.query("insert into public.bobby_subscriptions (identity_id, provider, status, current_period_end) values ($1, 'apple', 'active', now() + interval '30 days')", [buyer]);
    await pool.query("insert into public.bobby_subscriptions (identity_id, provider, status, current_period_end, environment) values ($1, 'apple', 'active', now() + interval '30 days', 'sandbox')", [tester]);
    const subs = (await one('select public.bobby_admin_overview(30, false) r')).r.subscriptions;
    const paidBefore = subs.paid;
    eq([subs.unverified >= 1, subs.sandbox >= 1], [true, true], 'F01: unknown and sandbox are counted apart');
    await pool.query("update public.bobby_subscriptions set environment = 'production', period_type = 'normal' where identity_id = $1", [buyer]);
    eq((await one('select public.bobby_admin_overview(30, false) r')).r.subscriptions.paid, paidBefore + 1, 'F01: verified production counts as paid');
    const econ = (await one('select public.bobby_admin_economics(30, false) r')).r.subscriptions;
    ok(econ.active >= 1 && econ.sandbox >= 1, 'F01: economics counts verified production only');
    // F07: a balance of 0 never clears a credit alert.
    await pool.query("insert into public.bobby_llm_credit_marks (provider, kind, amount_usd) values ('openai', 'balance', 0)");
    const llm = (await one('select public.bobby_admin_overview(30, false) r')).r.llm.providers.openai;
    eq(llm.lastTopup, null, 'F07: a zero balance is not a top-up');
  }

  console.log(`admin-truth-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
