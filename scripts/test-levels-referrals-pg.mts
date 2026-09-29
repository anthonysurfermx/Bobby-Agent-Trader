// Actual PostgreSQL regressions for 20260929150000_levels_referrals_usage.sql: premium-level allowances per
// plan (atomic under concurrency), the referral rules (new Apple/Google account only, once per friend, no
// self or two-way swap, at most five, stacked Pro), Pro-by-referral reaching the existing read meter, and the
// service-only privileges. Needs the schema prepared by scripts/test-trader-land-growth.sql (as in CI).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('levels-referrals-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');

// The same shape api/_lib/desk-levels.ts passes (uses, window in days).
const LIMITS = { anon: { profundo: [1, 30], maximo: [0, 30] }, free: { profundo: [3, 7], maximo: [1, 7] }, pro: { profundo: [60, 30], maximo: [10, 30] } };
const pool = new pg.Pool({ connectionString: url, max: 12 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };

// A person: a Bobby identity and, unless wallet-only, the Supabase account behind it (auth.users +
// auth.identities stand-ins), whose own creation date is the one a referral checks.
async function person(opts: { wallet?: boolean; ageDays?: number; provider?: string; identityAgeDays?: number } = {}) {
  const id = randomUUID();
  const authId = opts.wallet ? null : randomUUID();
  if (authId) {
    await pool.query('insert into auth.users(id, created_at) values ($1, now() - make_interval(days => $2))', [authId, opts.ageDays ?? 0]);
    await pool.query('insert into auth.identities(user_id, provider) values ($1, $2)', [authId, opts.provider ?? 'apple']);
  }
  await pool.query(
    `insert into public.bobby_identities(id, auth_user_id, wallet_address, created_at) values ($1, $2, $3, now() - make_interval(days => $4))`,
    [id, authId, opts.wallet ? `0x${randomUUID().replace(/-/g, '')}` : null, opts.identityAgeDays ?? 0],
  );
  return id;
}
const ageAccount = (identity: string, days: number) =>
  pool.query('update auth.users set created_at = now() - make_interval(days => $2) where id = (select auth_user_id from public.bobby_identities where id = $1)', [identity, days]);
const consume = async (identity: string | null, device: string | null, level: string) =>
  (await pool.query('select public.bobby_consume_level($1, $2, $3, $4, $5) as r', [identity, device, level, 'BTC', JSON.stringify(LIMITS)])).rows[0].r;
const state = async (identity: string | null, device: string | null) =>
  (await pool.query('select public.bobby_level_state($1, $2, $3) as r', [identity, device, JSON.stringify(LIMITS)])).rows[0].r;
const claim = async (invitee: string, code: string, max = 5) =>
  (await pool.query('select public.bobby_referral_claim($1, $2, 30, $3, 7) as r', [invitee, code, max])).rows[0].r;
const code = async (identity: string) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const c = Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  await pool.query('insert into public.bobby_referral_codes(identity_id, code) values ($1, $2)', [identity, c]);
  return c;
};
const proUntil = async (identity: string) => (await pool.query('select pro_until from public.bobby_pro_grants where identity_id = $1', [identity])).rows[0]?.pro_until as Date | undefined;
const isPro = async (identity: string) => (await pool.query('select public.bobby_is_pro($1) as r', [identity])).rows[0].r as boolean;
const days = (d?: Date) => (d ? Math.round((d.getTime() - Date.now()) / 86_400_000) : null);

try {
  // Supabase's auth schema, reduced to what the referral rules read.
  await pool.query(`create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
    create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);`);
  await pool.query(readFileSync('supabase/bobby-protocol/supabase/migrations/20260927120000_access_reads_subscriptions.sql', 'utf8'));
  const migration = readFileSync('supabase/bobby-protocol/supabase/migrations/20260929150000_levels_referrals_usage.sql', 'utf8');
  const rules = readFileSync('supabase/bobby-protocol/supabase/migrations/20260929170000_referral_rules_llm_spend.sql', 'utf8');
  await pool.query(migration);
  await pool.query(migration); // idempotent
  await pool.query(rules);
  await pool.query(rules); // idempotent
  for (const fn of ['public.bobby_referral_claim(uuid, text, int, int, int)', 'public.bobby_llm_spend()']) {
    for (const role of ['anon', 'authenticated']) eq((await pool.query('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).rows[0].r, false, `${role} cannot execute ${fn}`);
    eq((await pool.query('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).rows[0].r, true, `service_role executes ${fn}`);
  }

  // ---------- privileges: service-only ----------
  for (const table of ['bobby_level_uses', 'bobby_referral_codes', 'bobby_referrals', 'bobby_pro_grants', 'bobby_llm_usage']) {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        eq((await pool.query('select has_table_privilege($1, $2, $3) as r', [role, `public.${table}`, priv])).rows[0].r, false, `${role} has no ${priv} on ${table}`);
      }
    }
    eq((await pool.query('select has_table_privilege($1, $2, $3) as r', ['service_role', `public.${table}`, 'insert'])).rows[0].r, true, `service_role inserts into ${table}`);
    eq((await pool.query('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`])).rows[0].r, true, `RLS on ${table}`);
  }
  for (const fn of ['public.bobby_is_pro(uuid)', 'public.bobby_level_state(uuid,text,jsonb)', 'public.bobby_consume_level(uuid,text,text,text,jsonb)', 'public.bobby_referral_claim(uuid,text,integer,integer,integer)']) {
    for (const role of ['anon', 'authenticated', 'public']) {
      if (role === 'public') continue;
      eq((await pool.query('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).rows[0].r, false, `${role} cannot execute ${fn}`);
    }
    eq((await pool.query('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).rows[0].r, true, `service_role executes ${fn}`);
  }

  // ---------- premium levels per plan ----------
  const device = `dev-${randomUUID()}`;
  eq((await consume(null, device, 'profundo')).allowed, true, 'a guest device gets one Profundo');
  eq((await consume(null, device, 'profundo')).code, 'signin_required', 'the second Profundo asks for an account');
  eq((await consume(null, device, 'maximo')).code, 'signin_required', 'Máximo needs an account');
  eq((await consume(null, null, 'profundo')).code, 'signin_required', 'no account and no device: sign in');
  const guest = await state(null, device);
  eq([guest.tier, guest.levels.profundo.remaining, guest.levels.maximo.limit], ['anon', 0, 0], 'guest meter');

  const free = await person();
  for (let i = 0; i < 3; i++) eq((await consume(free, null, 'profundo')).allowed, true, `free Profundo ${i + 1}/3`);
  const out = await consume(free, null, 'profundo');
  eq([out.allowed, out.code, out.used, out.limit], [false, 'upgrade_required', 3, 3], 'the 4th Profundo offers Pro or an invitation');
  ok(out.resetsAt, 'an exhausted meter says when it comes back');
  eq((await consume(free, null, 'maximo')).allowed, true, 'free Máximo 1/1');
  eq((await consume(free, null, 'maximo')).code, 'upgrade_required', 'the second Máximo offers Pro or an invitation');
  const freeState = await state(free, null);
  eq([freeState.tier, freeState.levels.profundo.remaining, freeState.levels.maximo.remaining], ['free', 0, 0], 'free meter');
  await assert.rejects(pool.query('select public.bobby_consume_level($1, null, $2, $3, $4)', [free, 'rapido', 'BTC', JSON.stringify(LIMITS)])); checks++;

  const racer = await person();
  const race = await Promise.all(Array.from({ length: 8 }, () => consume(racer, null, 'profundo')));
  eq(race.filter((r) => r.allowed).length, 3, 'eight parallel Profundo reads: exactly three pass');

  // ---------- referrals ----------
  const inviter = await person();
  const invite = await code(inviter);
  eq((await claim(await person(), 'bad')).code, 'invalid_code', 'malformed code');
  eq((await claim(await person(), 'ZZZZZZZZ')).code, 'invalid_code', 'unknown code');
  eq((await claim(inviter, invite)).code, 'self', 'nobody invites themselves');
  eq((await claim(await person({ wallet: true }), invite)).code, 'account_required', 'a wallet-only identity is not a new account');
  eq((await claim(await person({ ageDays: 30 }), invite)).code, 'not_new', 'an existing account does not count');
  eq((await claim(await person({ ageDays: 30, identityAgeDays: 0 }), invite)).code, 'not_new', 'a fresh Bobby identity on an old account does not count: the account date decides');
  eq((await claim(await person({ provider: 'email' }), invite)).code, 'account_required', 'only an Apple or Google account counts');
  eq(await isPro(inviter), false, 'no Pro before a friend joins');

  const friend1 = await person();
  eq((await claim(friend1, invite)).code, 'claimed', 'a new friend counts');
  eq(await isPro(inviter), true, 'the inviter is Pro');
  eq(days(await proUntil(inviter)), 30, 'one friend: 30 days of Pro');
  eq((await claim(friend1, invite)).code, 'already_claimed', 'a friend counts once');
  eq((await consume(inviter, null, 'maximo')).tier, 'pro', 'Pro by referral reaches the level meter');
  const read = (await pool.query('select public.bobby_read_access($1, null, true) as r', [inviter])).rows[0].r;
  eq(read.tier, 'pro', 'Pro by referral reaches the read meter');

  const friendCode = await code(friend1);
  await ageAccount(inviter, 30);
  eq((await claim(inviter, friendCode)).code, 'not_new', 'an older inviter cannot be claimed back…');
  await ageAccount(inviter, 0);
  eq((await claim(inviter, friendCode)).code, 'self', '…and even when new, a two-way swap is refused');

  eq((await claim(await person(), invite)).code, 'claimed', 'second friend');
  eq(days(await proUntil(inviter)), 60, 'two friends: 60 days, stacked');
  eq((await claim(await person(), invite)).code, 'claimed', 'third friend');
  eq((await claim(await person(), invite)).code, 'claimed', 'fourth friend');
  const last = await Promise.all(Array.from({ length: 4 }, async () => claim(await person(), invite)));
  eq(last.filter((r) => r.code === 'claimed').length, 1, 'four friends race for the fifth slot: one wins');
  eq(last.filter((r) => r.code === 'inviter_full').length, 3, 'the rest see a full inviter');
  eq(Number((await pool.query('select count(*) from public.bobby_referrals where inviter_id = $1', [inviter])).rows[0].count), 5, 'at most five friends');
  eq(days(await proUntil(inviter)), 150, 'five friends: 150 days of Pro');

  // Two new friends claim each other at the same moment: exactly one swap direction can win.
  for (let round = 0; round < 5; round++) {
    const a = await person(); const b = await person();
    const [ca, cb] = [await code(a), await code(b)];
    const both = await Promise.all([claim(a, cb), claim(b, ca)]);
    eq(both.filter((r) => r.code === 'claimed').length, 1, `A↔B race ${round + 1}: one reward, never two`);
  }

  // A paying inviter's gift starts when the paid period ends.
  const payer = await person();
  await pool.query("insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end) values ($1, 'stripe', 'active', now() + interval '20 days')", [payer]);
  eq((await claim(await person(), await code(payer))).code, 'claimed', 'a paying inviter can invite');
  eq(days(await proUntil(payer)), 50, 'the 30 gifted days run after the 20 paid ones');

  // The spend guard's sum: today and this month, from the ledger.
  await pool.query("insert into public.bobby_llm_usage(surface, provider, model, usd, ok) values ('desk', 'openai', 'gpt-6-luna', 0.25, true), ('desk', 'anthropic', 'claude-sonnet-5-5', 0.5, true)");
  const spend = (await pool.query('select public.bobby_llm_spend() as r')).rows[0].r;
  ok(Number(spend.day) >= 0.75 && Number(spend.month) >= Number(spend.day), 'spend sums today and the month');

  // An expired grant is not Pro.
  const lapsed = await person();
  await pool.query("insert into public.bobby_pro_grants(identity_id, pro_until) values ($1, now() - interval '1 minute')", [lapsed]);
  eq(await isPro(lapsed), false, 'an expired grant is not Pro');

  console.log(`levels-referrals-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
