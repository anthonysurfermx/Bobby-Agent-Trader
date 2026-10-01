// Actual PostgreSQL regressions for 20261001160000_coupons_bonus_usage.sql: redeeming a coupon (Apple/Google
// account only, once per account, cap and expiry, atomic at the last slot), the gifted balance spent only after
// the regular allowance and never counted toward it, gifts returned when an analysis is refunded, Pro and guests
// unchanged, and the service-only privileges. Needs the schema prepared by scripts/test-trader-land-growth.sql.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('coupons-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');

const LIMITS = { anon: { profundo: [1, 30], maximo: [0, 30] }, free: { profundo: [3, 7], maximo: [1, 7] }, pro: { profundo: [60, 30], maximo: [10, 30] } };
const MIGRATIONS = [
  '20260927120000_access_reads_subscriptions.sql',
  '20260929150000_levels_referrals_usage.sql',
  '20260929170000_referral_rules_llm_spend.sql',
  '20260930121932_serialize_guest_network_quota.sql',
  '20261001160000_coupons_bonus_usage.sql',
];
const pool = new pg.Pool({ connectionString: url, max: 24 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };

async function person(opts: { wallet?: boolean; provider?: string } = {}) {
  const id = randomUUID();
  const authId = opts.wallet ? null : randomUUID();
  if (authId) {
    await pool.query('insert into auth.users(id) values ($1)', [authId]);
    await pool.query('insert into auth.identities(user_id, provider) values ($1, $2)', [authId, opts.provider ?? 'apple']);
  }
  await pool.query('insert into public.bobby_identities(id, auth_user_id, wallet_address) values ($1, $2, $3)',
    [id, authId, opts.wallet ? `0x${randomUUID().replace(/-/g, '')}` : null]);
  return id;
}
let seq = 0;
async function coupon(fields: { reads?: number; profundo?: number; maximo?: number; max?: number | null; expires?: string | null; active?: boolean } = {}) {
  const code = `TEST-${++seq}-${randomUUID().slice(0, 6).toUpperCase()}`;
  await pool.query(
    `insert into public.bobby_coupons(code, reads, profundo, maximo, max_redemptions, expires_at, active)
     values ($1, $2, $3, $4, $5, $6::timestamptz, $7)`,
    [code, fields.reads ?? 0, fields.profundo ?? 0, fields.maximo ?? 0, fields.max ?? null, fields.expires ?? null, fields.active ?? true],
  );
  return code;
}
const redeem = async (identity: string | null, code: string | null) =>
  (await pool.query('select public.bobby_redeem_coupon($1, $2) as r', [identity, code])).rows[0].r;
const read = async (identity: string | null, device: string | null, paywall = true) =>
  (await pool.query('select public.bobby_consume_read($1, $2, null, $3, $4, $5) as r', [identity, device, 'ios', 'BTC', paywall])).rows[0].r;
const access = async (identity: string) => (await pool.query('select public.bobby_read_access($1, null, true) as r', [identity])).rows[0].r;
const level = async (identity: string | null, device: string | null, lv: string) =>
  (await pool.query('select public.bobby_consume_level($1, $2, $3, $4, $5) as r', [identity, device, lv, 'BTC', JSON.stringify(LIMITS)])).rows[0].r;
const levelState = async (identity: string) => (await pool.query('select public.bobby_level_state($1, null, $2) as r', [identity, JSON.stringify(LIMITS)])).rows[0].r;
const bonus = async (identity: string) =>
  (await pool.query('select reads, profundo, maximo from public.bobby_usage_bonus where identity_id = $1', [identity])).rows[0] ?? null;
const fillWeek = (identity: string, n: number) =>
  pool.query("insert into public.bobby_reads(identity_id, platform, symbol, created_at) select $1, 'ios', 'BTC', now() - interval '1 hour' from generate_series(1, $2)", [identity, n]);

try {
  await pool.query(`create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
    create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);`);
  for (const file of MIGRATIONS) await pool.query(readFileSync(`supabase/bobby-protocol/supabase/migrations/${file}`, 'utf8'));
  await pool.query(readFileSync(`supabase/bobby-protocol/supabase/migrations/${MIGRATIONS.at(-1)}`, 'utf8')); // idempotent

  // ---------- privileges: service-only ----------
  for (const table of ['bobby_coupons', 'bobby_coupon_redemptions', 'bobby_usage_bonus']) {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        eq((await pool.query('select has_table_privilege($1, $2, $3) as r', [role, `public.${table}`, priv])).rows[0].r, false, `${role} has no ${priv} on ${table}`);
      }
    }
    eq((await pool.query('select has_table_privilege($1, $2, $3) as r', ['service_role', `public.${table}`, 'insert'])).rows[0].r, true, `service_role writes ${table}`);
    eq((await pool.query('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`])).rows[0].r, true, `RLS on ${table}`);
  }
  for (const fn of ['public.bobby_redeem_coupon(uuid,text)', 'public.bobby_consume_read(uuid,text,text,text,text,boolean)', 'public.bobby_read_access(uuid,text,boolean)', 'public.bobby_level_state(uuid,text,jsonb)', 'public.bobby_consume_level(uuid,text,text,text,jsonb)']) {
    for (const role of ['anon', 'authenticated']) eq((await pool.query('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).rows[0].r, false, `${role} cannot execute ${fn}`);
    eq((await pool.query('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).rows[0].r, true, `service_role executes ${fn}`);
  }
  await assert.rejects(pool.query("insert into public.bobby_coupons(code, reads) values ('bad code', 5)")); checks++;
  await assert.rejects(pool.query("insert into public.bobby_coupons(code) values ('EMPTY1')")); checks++;

  // ---------- redeeming ----------
  const gift = await coupon({ reads: 5, profundo: 2, maximo: 1 });
  const alice = await person();
  eq((await redeem(null, gift)).result, 'account_required', 'no account');
  eq((await redeem(await person({ wallet: true }), gift)).result, 'account_required', 'a wallet session is not an account');
  eq((await redeem(await person({ provider: 'email' }), gift)).result, 'account_required', 'only Apple or Google accounts');
  eq((await redeem(alice, 'x')).result, 'invalid_code', 'malformed code');
  eq((await redeem(alice, null)).result, 'invalid_code', 'no code');
  eq((await redeem(alice, 'NOPE-0000')).result, 'invalid_code', 'unknown code');
  eq((await redeem(alice, await coupon({ reads: 1, active: false }))).result, 'invalid_code', 'a disabled coupon');
  eq((await redeem(alice, await coupon({ reads: 1, expires: new Date(Date.now() - 60_000).toISOString() }))).result, 'expired', 'an expired coupon');
  const first = await redeem(alice, gift);
  eq([first.result, first.granted, first.bonus], ['redeemed', { reads: 5, profundo: 2, maximo: 1 }, { reads: 5, profundo: 2, maximo: 1 }], 'redeemed');
  eq((await redeem(alice, gift)).result, 'already_redeemed', 'once per account');
  const more = await redeem(alice, await coupon({ reads: 3 }));
  eq(more.bonus, { reads: 8, profundo: 2, maximo: 1 }, 'gifts stack');
  const single = await coupon({ reads: 1, max: 1 });
  eq((await redeem(await person(), single)).result, 'redeemed', 'the only slot');
  eq((await redeem(await person(), single)).result, 'exhausted', 'a full coupon');
  const capped = await coupon({ reads: 2, max: 5 });
  const racers = await Promise.all(Array.from({ length: 16 }, () => person()));
  const race = await Promise.all(racers.map((p) => redeem(p, capped)));
  eq(race.filter((r) => r.result === 'redeemed').length, 5, 'sixteen parallel redemptions of a five-slot coupon: exactly five');
  eq((await pool.query('select redeemed from public.bobby_coupons where code = $1', [capped])).rows[0].redeemed, 5, 'the counter matches');

  // ---------- reads: spent after the weekly allowance, never counted toward it ----------
  await fillWeek(alice, 10);
  eq((await access(alice)).bonus, 8, 'the access state shows the gifted reads');
  const spent = await read(alice, null);
  eq([spent.allowed, spent.used, spent.limit, spent.bonus], [true, 10, 10, 7], 'at the weekly cap a gifted read is spent');
  eq((await access(alice)).used, 10, 'a gifted read does not count toward the week');
  eq((await read(alice, null, false)).allowed, true, 'paywall off: the week is open…');
  eq((await bonus(alice)).reads, 7, '…and no gift is spent');
  await pool.query('delete from public.bobby_reads where id = $1', [spent.readId]);
  eq((await bonus(alice)).reads, 8, 'a refunded gifted read comes back');
  const old = (await pool.query("insert into public.bobby_reads(identity_id, platform, symbol, bonus, created_at) values ($1, 'ios', 'BTC', true, now() - interval '36 days') returning id", [alice])).rows[0].id;
  await pool.query('delete from public.bobby_reads where id = $1', [old]);
  eq((await bonus(alice)).reads, 8, 'the 35-day cleanup returns nothing');

  const bob = await person();
  await pool.query("insert into public.bobby_usage_bonus(identity_id, reads) values ($1, 3)", [bob]);
  await fillWeek(bob, 10);
  const burst = await Promise.all(Array.from({ length: 8 }, () => read(bob, null)));
  eq(burst.filter((r) => r.allowed).length, 3, 'eight parallel reads at the cap with three gifts: exactly three pass');
  const refused = await read(bob, null);
  eq([refused.allowed, refused.code, refused.bonus], [false, 'subscription_required', 0], 'no gifts left: Bobby Pro');
  eq((await bonus(bob)).reads, 0, 'the balance never goes negative');

  const pro = await person();
  await pool.query("insert into public.bobby_usage_bonus(identity_id, reads, profundo) values ($1, 4, 4)", [pro]);
  await pool.query("insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end) values ($1, 'apple', 'active', now() + interval '20 days')", [pro]);
  eq((await read(pro, null)).tier, 'pro', 'Pro reads as before');
  eq((await bonus(pro)).reads, 4, 'Pro keeps its gifts untouched');
  const guest = await read(null, `dev-${randomUUID()}`);
  eq([guest.allowed, guest.tier, guest.bonus], [true, 'anon', undefined], 'guests are unchanged');

  // ---------- Profundo / Máximo ----------
  for (let i = 0; i < 3; i++) eq((await level(alice, null, 'profundo')).allowed, true, `free Profundo ${i + 1}/3`);
  const deep = await level(alice, null, 'profundo');
  eq([deep.allowed, deep.used, deep.limit, deep.bonus], [true, 3, 3, 1], 'the 4th Profundo spends a gift');
  const state = await levelState(alice);
  eq([state.levels.profundo.used, state.levels.profundo.remaining, state.levels.profundo.bonus], [3, 0, 1], 'gifted uses stay out of the window; the gift is reported apart from remaining');
  await pool.query('delete from public.bobby_level_uses where id = $1', [deep.useId]);
  eq((await bonus(alice)).profundo, 2, 'a refunded gifted Profundo comes back');
  eq((await level(alice, null, 'profundo')).allowed, true, 'gift 1');
  eq((await level(alice, null, 'profundo')).allowed, true, 'gift 2');
  eq((await level(alice, null, 'profundo')).code, 'upgrade_required', 'no Profundo gifts left');
  eq((await level(alice, null, 'maximo')).allowed, true, 'free Máximo 1/1');
  const max = await level(alice, null, 'maximo');
  eq([max.allowed, max.bonus], [true, 0], 'the 2nd Máximo spends the gift');
  eq((await level(alice, null, 'maximo')).code, 'upgrade_required', 'no Máximo gifts left');
  for (let i = 0; i < 60; i++) await level(pro, null, 'profundo');
  const proOver = await level(pro, null, 'profundo');
  eq([proOver.allowed, proOver.tier, proOver.bonus], [true, 'pro', 3], 'Pro past its Profundo window spends a gift');
  eq((await level(null, `dev-${randomUUID()}`, 'maximo')).code, 'signin_required', 'guests are unchanged');

  // ---------- account deletion ----------
  await pool.query('delete from public.bobby_identities where id = $1', [alice]);
  eq(await bonus(alice), null, 'deleting the account removes its gifts');
  eq((await pool.query('select count(*)::int as n from public.bobby_coupon_redemptions where identity_id = $1', [alice])).rows[0].n, 0, 'and its redemptions');

  console.log(`coupons-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
