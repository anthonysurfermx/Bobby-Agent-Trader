// Actual PostgreSQL regressions for 20261007161949_double_free_reads.sql: a guest gets 6 reads per 30 days
// (was 3), a free account 20 per rolling 7 days (was 10), the guest pool of one network is 200 per 7 days
// (was 100), and everything around those three numbers is as before: gifted reads spent only at the cap and
// never counted toward it, Bobby Pro without a cap, the legacy caller without an install, atomic last slots,
// service-only privileges. The numbers the server states (FREE_READS) must be the ones the meter enforces.
// Needs the scratch schema of scripts/test-trader-land-growth.sql; runs after the other pg tests or alone.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('free-reads-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');

const { FREE_READS } = await import('../api/_lib/desk-levels.ts');
const GUEST = 6, WEEKLY = 20, NETWORK = 200;
const DIR = 'supabase/bobby-protocol/supabase/migrations';
/** What the meter stands on when this test runs alone on a fresh scratch database. */
const BASE = [
  '20260927120000_access_reads_subscriptions.sql',
  '20260929150000_levels_referrals_usage.sql',
  '20260929170000_referral_rules_llm_spend.sql',
  '20260930121932_serialize_guest_network_quota.sql',
  '20261001160000_coupons_bonus_usage.sql',
];
const MIGRATION = readFileSync(`${DIR}/20261007161949_double_free_reads.sql`, 'utf8');
const pool = new pg.Pool({ connectionString: url, max: 24 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const one = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows[0];

async function account() {
  const id = randomUUID(), authId = randomUUID();
  await pool.query('insert into auth.users(id) values ($1)', [authId]);
  await pool.query("insert into auth.identities(user_id, provider) values ($1, 'apple')", [authId]);
  await pool.query('insert into public.bobby_identities(id, auth_user_id) values ($1, $2)', [id, authId]);
  return id;
}
const device = () => `dev-${randomUUID()}`;
const network = () => `net-${randomUUID()}`;
const read = async (identity: string | null, dev: string | null, opts: { net?: string | null; paywall?: boolean } = {}) =>
  (await one('select public.bobby_consume_read($1, $2, $3, $4, $5, $6) as r', [identity, dev, opts.net ?? null, 'ios', 'BTC', opts.paywall ?? true])).r;
const access = async (identity: string | null, dev: string | null) => (await one('select public.bobby_read_access($1, $2, true) as r', [identity, dev])).r;
const bonus = async (identity: string) => (await one('select reads from public.bobby_usage_bonus where identity_id = $1', [identity]))?.reads ?? null;
const rows = async (where: string, params: unknown[]) => (await one(`select count(*)::int as n from public.bobby_reads where ${where}`, params)).n as number;
/** Reads already taken, `ago` back (a Postgres interval). */
const accountReads = (identity: string, n: number, ago = '1 hour') =>
  pool.query(`insert into public.bobby_reads(identity_id, platform, symbol, created_at) select $1, 'ios', 'BTC', now() - $3::interval from generate_series(1, $2)`, [identity, n, ago]);
const guestReads = (dev: string, n: number, ago = '1 hour', net: string | null = null) =>
  pool.query(`insert into public.bobby_reads(device_hash, network_hash, platform, symbol, created_at) select $1, $4, 'ios', 'BTC', now() - $3::interval from generate_series(1, $2)`, [dev, n, ago, net]);

try {
  if (!(await one("select to_regclass('public.bobby_reads') as t")).t) {
    await pool.query(`create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
      create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);`);
    for (const file of BASE) await pool.query(readFileSync(`${DIR}/${file}`, 'utf8'));
  }
  await pool.query(MIGRATION);
  await pool.query(MIGRATION); // idempotent

  // ---------- one set of numbers: the server's word and the meter ----------
  eq([FREE_READS.guest, FREE_READS.weekly], [GUEST, WEEKLY], 'the server states 6 and 20');
  eq((await access(null, device())).limit, FREE_READS.guest, 'the meter tells a new guest the same number');
  eq((await access(await account(), null)).limit, FREE_READS.weekly, 'and a new account the same weekly number');
  for (const name of ['bobby_consume_read', 'bobby_read_access']) {
    const src = (await one("select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1", [name])).prosrc as string;
    eq([/guest_limit constant int := 6;/.test(src), /free_limit constant int := 20;/.test(src)], [true, true], `${name} names both numbers once`);
    eq(/'limit', (3|10)\b|>= (3|10)\b|greatest\(used, 3\)/.test(src), false, `${name} keeps no earlier number`);
  }

  // ---------- privileges and shape: as before ----------
  for (const fn of ['public.bobby_consume_read(uuid,text,text,text,text,boolean)', 'public.bobby_read_access(uuid,text,boolean)']) {
    for (const role of ['anon', 'authenticated']) eq((await one('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).r, false, `${role} cannot execute ${fn}`);
    eq((await one('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).r, true, `service_role executes ${fn}`);
    const meta = await one('select prosecdef, provolatile, proconfig from pg_proc where oid = $1::regprocedure', [fn]);
    eq([meta.prosecdef, meta.proconfig], [false, ['search_path=public, pg_temp']], `${fn} stays invoker with a pinned search_path`);
    eq(meta.provolatile, fn.includes('consume') ? 'v' : 's', `${fn} keeps its volatility`);
  }
  eq((await one("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('bobby_consume_read', 'bobby_read_access')")).n, 2, 'no second signature was left behind');

  // ---------- a guest: six, then the account ----------
  const phone = device();
  for (let i = 1; i <= GUEST; i++) {
    const r = await read(null, phone);
    eq([r.allowed, r.code, r.tier, r.used, r.limit, typeof r.readId], [true, null, 'anon', i, GUEST, 'number'], `guest read ${i}/${GUEST}`);
  }
  const wall = await read(null, phone);
  eq([wall.allowed, wall.code, wall.readId, wall.used, wall.limit], [false, 'signin_required', null, GUEST, GUEST], 'the 7th asks for an account');
  eq(await rows('device_hash = $1', [phone]), GUEST, 'and records nothing');
  const shown = await access(null, phone);
  eq([shown.tier, shown.used, shown.limit], ['anon', GUEST, GUEST], 'the access state says 6 of 6');

  const earlier = device();
  await guestReads(earlier, 3);
  eq((await access(null, earlier)).used, 3, 'an install that had used its three…');
  for (let i = 4; i <= GUEST; i++) eq((await read(null, earlier)).allowed, true, `…reads again (${i}/${GUEST})`);
  eq((await read(null, earlier)).code, 'signin_required', '…until six');

  const returning = device();
  await guestReads(returning, GUEST, '31 days');
  eq([(await access(null, returning)).used, (await read(null, returning)).used], [0, 1], 'reads older than 30 days no longer count');

  const racing = device();
  const guestRace = await Promise.all(Array.from({ length: 16 }, () => read(null, racing)));
  eq(guestRace.filter((r) => r.allowed).length, GUEST, 'sixteen parallel guest reads: exactly six pass');
  eq(await rows('device_hash = $1', [racing]), GUEST, 'and exactly six are recorded');

  await assert.rejects(read(null, 'short')); checks++;
  const legacy = await read(null, null);
  eq([legacy.allowed, legacy.readId, legacy.limit], [true, null, null], 'a caller without an install is served uncounted, as before');

  // ---------- the network pool: 200 a week ----------
  const office = network();
  await guestReads(device(), 100, '1 hour', office);
  eq((await read(null, device(), { net: office })).allowed, true, 'a network with 100 guest reads this week still serves a new install');
  await guestReads(device(), NETWORK - 102, '2 hours', office);
  eq(await rows('network_hash = $1', [office]), NETWORK - 1, '199 reads on the network');
  const lastIn = device();
  eq((await read(null, lastIn, { net: office })).allowed, true, 'the 200th passes');
  const full = await read(null, lastIn, { net: office });
  eq([full.allowed, full.code, full.used, full.limit], [false, 'signin_required', GUEST, GUEST], 'a full network asks for an account and shows nothing left');
  eq((await read(null, device(), { net: network() })).allowed, true, 'another network is not affected');
  const lastWeek = network();
  await guestReads(device(), NETWORK, '8 days', lastWeek);
  eq((await read(null, device(), { net: lastWeek })).allowed, true, 'the pool is the last 7 days');
  const pooled = network();
  await guestReads(device(), NETWORK - 3, '1 hour', pooled);
  const poolRace = await Promise.all(Array.from({ length: 12 }, () => read(null, device(), { net: pooled })));
  eq(poolRace.filter((r) => r.allowed).length, 3, 'twelve installs racing for the last three places of a network: exactly three');

  // ---------- a free account: twenty a week, then Bobby Pro ----------
  const ana = await account();
  const firstRead = await read(ana, phone);
  eq([firstRead.allowed, firstRead.tier, firstRead.used, firstRead.limit, firstRead.bonus], [true, 'free', 1, WEEKLY, 0], 'an account starts its own week, apart from the guest reads of its install');
  await accountReads(ana, WEEKLY - 2);
  const last = await read(ana, null);
  eq([last.allowed, last.used, last.limit], [true, WEEKLY, WEEKLY], 'the 20th passes');
  const pay = await read(ana, null);
  eq([pay.allowed, pay.code, pay.readId, pay.used, pay.limit, pay.bonus], [false, 'subscription_required', null, WEEKLY, WEEKLY, 0], 'the 21st asks for Bobby Pro');
  const oldest = (await one('select min(created_at) + interval \'7 days\' as t from public.bobby_reads where identity_id = $1', [ana])).t as Date;
  eq(new Date(pay.resetsAt).getTime(), oldest.getTime(), 'and says when the week reopens: seven days after the oldest read');
  const state = await access(ana, null);
  eq([state.tier, state.used, state.limit, new Date(state.resetsAt).getTime()], ['free', WEEKLY, WEEKLY, oldest.getTime()], 'the access state says 20 of 20 and the same day');
  eq((await read(ana, null, { paywall: false })).allowed, true, 'with the paywall off the week stays open');

  const tenth = await account();
  await accountReads(tenth, 10);
  eq((await read(tenth, null)).used, 11, 'an account that was stopped at ten reads again');

  const rolling = await account();
  await accountReads(rolling, WEEKLY, '8 days');
  eq([(await access(rolling, null)).used, (await read(rolling, null)).used], [0, 1], 'reads older than 7 days no longer count');

  const racer = await account();
  await accountReads(racer, WEEKLY - 2);
  const accountRace = await Promise.all(Array.from({ length: 12 }, () => read(racer, null)));
  eq(accountRace.filter((r) => r.allowed).length, 2, 'twelve parallel reads with two left: exactly two pass');

  // ---------- gifted reads: only at the cap, never counted toward it ----------
  const gifted = await account();
  await pool.query('insert into public.bobby_usage_bonus(identity_id, reads) values ($1, 2)', [gifted]);
  await accountReads(gifted, 10);
  const regular = await read(gifted, null);
  eq([regular.allowed, regular.used, regular.bonus, await bonus(gifted)], [true, 11, 2, 2], 'past the earlier cap of ten a regular read is used, not a gift');
  await accountReads(gifted, WEEKLY - 11);
  const gift = await read(gifted, null);
  eq([gift.allowed, gift.used, gift.limit, gift.bonus], [true, WEEKLY, WEEKLY, 1], 'at twenty a gifted read is spent');
  eq((await one('select bonus from public.bobby_reads where id = $1', [gift.readId])).bonus, true, 'and recorded as gifted');
  eq((await access(gifted, null)).used, WEEKLY, 'it does not count toward the week');
  eq([(await read(gifted, null)).bonus, (await read(gifted, null)).code], [0, 'subscription_required'], 'the last gift, then Bobby Pro');
  eq(await bonus(gifted), 0, 'the balance never goes negative');

  // ---------- Bobby Pro: no cap ----------
  const pro = await account();
  await pool.query('insert into public.bobby_usage_bonus(identity_id, reads) values ($1, 4)', [pro]);
  await pool.query("insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end) values ($1, 'apple', 'active', now() + interval '20 days')", [pro]);
  await accountReads(pro, WEEKLY + 5);
  const proRead = await read(pro, null);
  eq([proRead.allowed, proRead.tier, proRead.used, proRead.limit], [true, 'pro', null, null], 'Pro reads past any number');
  const proState = await access(pro, null);
  eq([proState.tier, proState.limit, proState.bonus, await bonus(pro)], ['pro', null, 4, 4], 'and keeps its gifts untouched and visible');

  console.log(`free-reads-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
