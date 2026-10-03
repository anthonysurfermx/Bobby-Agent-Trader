// Actual PostgreSQL regressions for 20261002231124_admin_truth_live_snapshot.sql, from the audit of 2026-10-02
// (.ai/reviews/2026-10-02-codex-admin-truth-answer.md): one block per finding with the audit's own scenario (each one
// fails on the 20261001233000 functions), the service-only privileges, an idempotent re-apply and the case of
// 2,000 paired accounts. Needs the schema prepared by scripts/test-trader-land-growth.sql; in CI it runs right after
// test-admin-truth-pg.mts on the same database (it re-applies the migrations it needs, so it also runs alone).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('admin-r2-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');

const DIR = 'supabase/bobby-protocol/supabase/migrations';
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
  '20261002090000_amplitude_forward.sql',
  '20261002102846_20261002120000_admin_codex_review.sql',
  '20261002103557_20261002124500_internal_subjects_indexed.sql',
  '20261002104708_20261002130000_admin_device_facts_join.sql',
  '20261002132106_amplitude_billing_export.sql',
  '20261002140000_subscription_environment.sql',
  '20261002150000_checkout_reservation_apple_mirror.sql',
  '20261002231124_admin_truth_live_snapshot.sql',
];
const R2 = `${DIR}/20261002231124_admin_truth_live_snapshot.sql`;
const JIT_DISABLED = new Set(['public.bobby_admin_growth(integer,boolean)', 'public.bobby_admin_overview(integer,boolean)',
  'public.bobby_admin_economics(integer,boolean)', 'public.bobby_admin_live(boolean)']);
const pool = new pg.Pool({ connectionString: url, max: 8 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
const one = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const reapply = async () => { await pool.query(readFileSync(R2, 'utf8')); };

async function account(opts: { ageDays?: number } = {}) {
  const id = randomUUID();
  const authId = randomUUID();
  await pool.query('insert into auth.users(id) values ($1)', [authId]);
  await pool.query("insert into auth.identities(user_id, provider) values ($1, 'apple')", [authId]);
  await pool.query(`insert into public.bobby_identities(id, auth_user_id, email, provider, created_at) values ($1, $2, $3, 'apple', now() - make_interval(days => $4))`,
    [id, authId, `${id.slice(0, 8)}@example.test`, opts.ageDays ?? 0]);
  return id;
}
const dev = (tag: string) => `dev-${tag}-${randomUUID().slice(0, 8)}`;
const pair = (device: string, identity: string) => pool.query("select public.bobby_touch_device($1, 'web', null, null, null, $2)", [device, identity]);
const read = (identity: string | null, device: string | null, daysAgo = 0) =>
  pool.query("insert into public.bobby_reads(identity_id, device_hash, platform, symbol, created_at) values ($1, $2, 'web', 'BTC', now() - make_interval(days => $3))", [identity, device, daysAgo]);
const ov = async (internal = false, days = 30) => (await one('select public.bobby_admin_overview($1, $2) as r', [days, internal])).r;
const growth = async (internal = false, days = 30) => (await one('select public.bobby_admin_growth($1, $2) as r', [days, internal])).r;
const econ = async (internal = false, days = 30) => (await one('select public.bobby_admin_economics($1, $2) as r', [days, internal])).r;
const geo = async (internal = false, days = 30) => (await one('select public.bobby_admin_geo($1, $2) as r', [days, internal])).r;
const members = async (internal?: boolean) => (await one(internal === undefined ? 'select public.bobby_admin_members() as r' : 'select public.bobby_admin_members($1) as r', internal === undefined ? [] : [internal])).r;
const person = async (identity: string) => one('select * from public.bobby_admin_people_facts() where identity_id = $1', [identity]);
const isTeam = async (identity: string) => (await one('select public.bobby_identity_internal($1) as r', [identity])).r;
const isTeamDevice = async (device: string) => (await one('select public.bobby_device_internal($1) as r', [device])).r;
const sub = (identity: string, status: string, env: string, period = 'normal', endDays = 20) =>
  pool.query(`insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end, environment, period_type)
    values ($1, 'apple', $2, now() + make_interval(days => $3), $4, $5)`, [identity, status, endDays, env, period]);
let ev = 0;
const purchase = (identity: string | null, env: string | null, daysAgo = 0, country: string | null = null, type = 'INITIAL_PURCHASE', price: number | null = 4.99) =>
  pool.query(`insert into public.bobby_purchase_events(id, type, environment, price_usd, takehome, identity_id, country, event_at)
    values ($1, $2, $3, $4, 0.85, $5, $6, now() - make_interval(days => $7))`, [`r2-${++ev}`, type, env, price, identity, country, daysAgo]);

async function reset() {
  await pool.query(`truncate public.bobby_events, public.bobby_purchase_events, public.bobby_llm_credit_marks, public.bobby_llm_usage,
    public.bobby_reader_stats, public.bobby_admin_actions, public.bobby_coupon_redemptions, public.bobby_usage_bonus, public.bobby_subscriptions,
    public.bobby_pro_grants, public.bobby_level_uses, public.bobby_reads restart identity cascade`);
  await pool.query('delete from public.bobby_coupons');
  await pool.query('truncate public.bobby_device_networks, public.bobby_device_accounts, public.bobby_activity_days, public.bobby_internal_marks, public.bobby_internal_networks, public.bobby_devices, public.bobby_costs restart identity');
  await pool.query('delete from public.bobby_admins');
  await pool.query('delete from public.bobby_identities');
  await pool.query("delete from public.api_cache where cache_key like 'r2test:%'");
}
const block = async (name: string, fn: () => Promise<void>) => { await reset(); await fn(); console.log(`  ✓ ${name}`); };

try {
  await pool.query(`create schema if not exists auth;
    create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
    create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);
    create table if not exists public.api_cache (cache_key text primary key, payload jsonb, expires_at timestamptz, updated_at timestamptz default now());`);
  for (const file of process.env.R2_REUSE_SCHEMA === '1' ? [] : MIGRATIONS) {
    if (file === '20261002231124_admin_truth_live_snapshot.sql') {
      const legacy = await account();
      await pool.query("insert into public.bobby_subscriptions(identity_id,provider,status,current_period_end) values($1,'apple','active',now()+interval '20 days')",[legacy]);
      eq((await one('select environment,period_type from public.bobby_subscriptions where identity_id=$1',[legacy])),{environment:null,period_type:null},'production predecessor has nullable commercial evidence');
      await pool.query(readFileSync(`${DIR}/${file}`, 'utf8'));
      eq((await one('select environment,period_type from public.bobby_subscriptions where identity_id=$1',[legacy])),{environment:'unknown',period_type:'unknown'},'migration normalizes unknown without assuming production');
      eq((await one('select public.bobby_is_pro($1) as r',[legacy])).r,true,'legacy unknown membership retains access');
      eq((await one("select commercial from public.bobby_subscription_facts() where identity_id=$1",[legacy])).commercial,'unverified','legacy access remains commercially unverified');
    } else await pool.query(readFileSync(`${DIR}/${file}`, 'utf8'));
  }
  await reapply(); // idempotent
  console.log('  PostgreSQL execution settings:', await one("select current_setting('server_version') as version, current_setting('jit') as caller_jit, pg_jit_available() as jit_available"));

  await block('privileges and shape', async () => {
    const fns = ['public.bobby_admin_live(boolean)', 'public.bobby_internal_subjects(boolean)', 'public.bobby_team_nodes(boolean)', 'public.bobby_payer_charges()', 'public.bobby_admin_users(text,integer,integer)', 'public.bobby_team_closure(boolean)', 'public.bobby_internal_identity_ids()', 'public.bobby_internal_device_hashes()',
      'public.bobby_set_team_link_ignored(text,uuid,boolean)', 'public.bobby_cache_claim(text,integer,jsonb)', 'public.bobby_first_charges()',
      'public.bobby_subscription_facts()', 'public.bobby_admin_members(boolean)', 'public.bobby_touch_device(text,text,text,text,text,uuid,text,text,text)',
      'public.bobby_track_reader()', 'public.bobby_untrack_reader()', 'public.bobby_record_outcome(text,text,text,uuid,text,text,text,text)',
      'public.bobby_record_event(text,text,text,text,text,text,text,text,text)', 'public.bobby_admin_internal_networks()', 'public.bobby_admin_people_facts_v2()',
      'public.bobby_admin_people_facts()', 'public.bobby_admin_growth(integer,boolean)', 'public.bobby_admin_overview(integer,boolean)',
      'public.bobby_admin_economics(integer,boolean)', 'public.bobby_admin_geo(integer,boolean)'];
    for (const fn of fns) {
      for (const role of ['anon', 'authenticated']) eq((await one('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute'])).r, false, `${role} cannot execute ${fn}`);
      eq((await one('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute'])).r, true, `service_role executes ${fn}`);
      eq(await one('select prosecdef, proconfig from pg_proc where oid = $1::regprocedure', [fn]), { prosecdef: false, proconfig: ['search_path=public, pg_temp', ...(JIT_DISABLED.has(fn) ? ['jit=off'] : [])] },
        `${fn}: invoker, exact search_path and bounded-query JIT setting`);
    }
    for (const table of ['bobby_subscriptions', 'bobby_activity_days', 'bobby_device_accounts', 'bobby_events', 'bobby_purchase_events']) {
      eq((await one('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`])).r, true, `RLS stays on ${table}`);
      for (const role of ['anon', 'authenticated']) eq((await one("select has_table_privilege($1, $2, 'select') as r", [role, `public.${table}`])).r, false, `${role} cannot read ${table}`);
    }
    eq((await one("select count(*)::int n from pg_proc where proname = 'bobby_admin_members'")).n, 1, 'exactly one bobby_admin_members (no ambiguous overload for PostgREST)');
    eq((await members()).includeInternal, false, 'the deployed call with no argument resolves to the default (team out)');
    const jitCaller = await pool.connect();
    try {
      await jitCaller.query('begin');
      await jitCaller.query('set local jit = on');
      await jitCaller.query('select public.bobby_admin_growth(30,false),public.bobby_admin_overview(30,false),public.bobby_admin_economics(30,false),public.bobby_admin_live(false)');
      eq((await jitCaller.query("select current_setting('jit') as value")).rows[0].value,'on','function JIT controls restore an explicitly enabled caller session setting');
    } finally { await jitCaller.query('rollback'); jitCaller.release(); }
    // The Amplitude export (20261002090000) calls these two as set-returning functions: same shape.
    eq(await one(`select pg_get_function_result('public.bobby_internal_identity_ids()'::regprocedure) i, pg_get_function_result('public.bobby_internal_device_hashes()'::regprocedure) d`),
      { i: 'SETOF uuid', d: 'SETOF text' }, 'the internal sets keep their signature and return type');
    eq((await one("select pg_get_function_result('public.bobby_admin_people_facts()'::regprocedure) r")).r,
      'TABLE(person text, kind text, identity_id uuid, email text, provider text, platform text, internal boolean, first_seen timestamp with time zone, reads integer, pro boolean, last_day date, read_days_14 integer, read_7 boolean, first_read_at timestamp with time zone, last_read_day date)',
      'people facts preserve the production 15 columns');
    await reapply();
    eq((await one("select count(*)::int n from pg_proc where proname = 'bobby_admin_members'")).n, 1, 're-applied: still one bobby_admin_members');
    ok((await one("select pg_get_constraintdef(oid) d from pg_constraint where conname = 'bobby_events_event_check'")).d.includes('read_abandoned'), 're-applied: read_abandoned accepted');
  });

  // ---------- F01: Pro access is not commercial evidence ----------
  await block('F01 memberships classified; payers and money need production evidence', async () => {
    // The audit's state: one live Apple membership, environment never read from the store, no purchase event.
    const u1 = await account();
    await pool.query("insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end) values ($1, 'apple', 'active', now() + interval '20 days')", [u1]);
    let s = (await ov()).subscriptions;
    eq([s.active, s.paid, s.paidVerified, s.unverified, s.test], [1, 0, 0, 1, 0], 'an active membership with an unknown environment is access, not a payer');
    eq(s.unverifiedReasons, { unknown_environment: 1, unknown_period: 0, no_charge: 0 }, 'unverified: unknown environment');
    eq(s.byEnvironment, { unknown: 1 }, 'live memberships by environment');
    eq((await one('select public.bobby_is_pro($1) as r', [u1])).r, true, 'the member keeps Pro');
    let e = await econ();
    eq([e.subscriptions.active, e.subscriptions.live, e.subscriptions.paidVerified, e.subscriptions.unverified], [0, 1, 0, 1], 'economics: active (what the MRR multiplies) = verified payers');
    eq([e.revenue.purchasesSince, (await geo()).purchasesSince, (await geo()).purchases], [null, null, []], 'no purchase event ever: "never measured", not an observed zero');
    // Production today: a positive PRODUCTION charge on record, but the store has not said production yet.
    await purchase(u1, 'PRODUCTION', 0, 'MX');
    s = (await ov()).subscriptions;
    eq([s.paidVerified, s.unverified, s.unverifiedReasons.unknown_environment], [0, 1, 1], 'a charge alone does not verify a membership whose environment is unknown');
    // The re-sync (RevenueCat says production, normal period) turns it into the first verified payer.
    await pool.query("update public.bobby_subscriptions set environment = 'production', period_type = 'normal', store_checked_at = now() where identity_id = $1", [u1]);
    s = (await ov()).subscriptions;
    eq([s.active, s.paid, s.paidVerified, s.unverified], [1, 1, 1, 0], 'production + a positive production charge = a verified payer');
    e = await econ();
    eq([e.subscriptions.active, e.subscriptions.paidVerified, e.revenue.payersEver], [1, 1, 1], 'economics agrees');
    eq((await growth()).people.proPaidVerified, 1, 'growth: one person with a verified paid membership');

    // Every other class.
    const [u2, u3, u4, u5, u6] = [await account(), await account(), await account(), await account(), await account()];
    await sub(u2, 'active', 'production');                 // production, no charge on record
    await sub(u3, 'active', 'sandbox');                    // TestFlight / sandbox
    await sub(u4, 'trialing', 'production');               // a store trial
    await sub(u5, 'active', 'production', 'trial');        // period type trial wins over a charge
    await sub(u6, 'active', 'production', 'normal', -1);   // expired
    await purchase(u5, 'PRODUCTION', 0, 'US');
    await purchase(u2, null, 0, 'FR');                     // environment missing: never money
    await purchase(u3, 'SANDBOX', 0, 'DE');
    s = (await ov()).subscriptions;
    eq([s.active, s.paidVerified, s.unverified, s.test, s.trialing], [5, 1, 1, 3, 1], 'live 5 = 1 paid + 1 unverified + 3 test');
    eq([s.unverifiedReasons, s.testReasons], [{ unknown_environment: 0, unknown_period: 0, no_charge: 1 }, { sandbox: 1, trial: 2 }], 'the reasons');
    eq(s.byEnvironment, { production: 4, sandbox: 1 }, 'environments of the live memberships');
    for (const u of [u2, u3, u4, u5]) eq((await one('select public.bobby_is_pro($1) as r', [u])).r, true, 'unverified and test members keep Pro');
    const m = await members(true);
    const row = (id: string) => m.subscriptions.find((x: { identityId: string }) => x.identityId === id);
    eq([row(u1).commercial, row(u1).commercialReason, row(u1).environment, row(u1).periodType], ['paid', null, 'production', 'normal'], 'members: the payer');
    ok(row(u1).firstChargeAt && row(u1).storeCheckedAt, 'members: first charge and store check carried');
    eq([row(u2).commercial, row(u2).commercialReason], ['unverified', 'no_charge'], 'members: production without a charge');
    eq([row(u3).commercial, row(u3).commercialReason, row(u3).environment], ['test', 'sandbox', 'sandbox'], 'members: sandbox');
    eq([row(u4).commercial, row(u4).commercialReason], ['test', 'trial'], 'members: trialing');
    eq([row(u5).commercial, row(u5).commercialReason, row(u5).periodType], ['test', 'trial', 'trial'], 'members: a trial period is not a payer');
    eq([row(u6).commercial, row(u6).commercialReason, row(u6).active], ['inactive', null, false], 'members: expired');
    eq(m.totals, { live: 5, paidVerified: 1, unverified: 1, test: 3 }, 'members totals');
    const r = (await ov()).revenue;
    eq([Number(r.grossUsd), Number(r.unverifiedGrossUsd), r.unknownEnvEvents, r.sandboxEvents], [9.98, 4.99, 1, 1],
      'money: PRODUCTION only (a null environment is unknown, not money); the trial account\'s charge is the unverified part');
    eq([r.newPaying, r.payingInPeriod], [1, 1], 'D1: only the verified payer is a new payer / an account with a charge; the trial (u5) is not');
    e = await econ();
    eq([e.revenue.newPaying, e.revenue.payersEver, e.revenue.payingInPeriod, Number(e.revenue.unverifiedGrossUsd)], [1, 1, 1, 4.99], 'economics: the same payers');
    eq((await geo()).purchases, [{ country: 'MX', newPaying: 1, grossUsd: 4.99 }], 'geo: verified payers only; the trial\'s US charge is not revenue by country');
    ok((await geo()).purchasesSince, 'geo says since when purchases arrive');
  });

  // The production state of 2026-10-02: one live Apple membership written by the deployed code (environment never read)
  // and one positive PRODUCTION INITIAL_PURCHASE today. Nothing about it is a verified payer yet.
  await block('F01 prod state: an unknown environment with a production charge is no payer anywhere', async () => {
    const { unitEconomics } = await import('../api/_lib/admin.ts');
    const u = await account();
    await pool.query("insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end) values ($1, 'apple', 'active', now() + interval '20 days')", [u]);
    await purchase(u, 'PRODUCTION', 0, 'FR');
    const o = await ov();
    eq([o.subscriptions.active, o.subscriptions.paidVerified, o.subscriptions.unverified], [1, 0, 1], 'overview: access 1, verified 0, unverified 1');
    eq([o.revenue.newPaying, o.revenue.payingInPeriod, Number(o.revenue.grossUsd), Number(o.revenue.unverifiedGrossUsd)], [0, 0, 4.99, 4.99],
      'overview: no new payer, no paying account; the $4.99 is store money of an unverified membership, said apart');
    const e = await econ();
    eq([e.revenue.newPaying, e.revenue.payersEver, e.revenue.payingInPeriod, Number(e.revenue.unverifiedGrossUsd), e.subscriptions.active], [0, 0, 0, 4.99, 0],
      'economics: no payer ever, no MRR base');
    eq((await geo()).purchases, [], 'geo: no payer and no revenue by country');
    const ue = unitEconomics(e);
    eq([ue.ltv.scenario, ue.revenue.newPaying, ue.revenue.payersEver, ue.revenue.mrrGrossUsd, ue.acquisition.cacPerPaying], [true, 0, 0, 0, null],
      'unit economics on that output: the LTV stays a scenario, no payer, MRR $0');
    // A trial and a sandbox membership, each with a PRODUCTION charge: still no payer.
    const t = await account(), b = await account();
    await sub(t, 'trialing', 'production', 'trial'); await sub(b, 'active', 'sandbox');
    await purchase(t, 'PRODUCTION', 0, 'US'); await purchase(b, 'PRODUCTION', 0, 'DE');
    const e2 = await econ();
    eq([e2.revenue.newPaying, e2.revenue.payersEver, (await ov()).revenue.newPaying, (await ov()).subscriptions.paidVerified], [0, 0, 0, 0], 'trial and sandbox with a production charge: no payer');
    // The owner's re-sync says production, normal period: now it is the first verified payer, everywhere at once.
    await pool.query("update public.bobby_subscriptions set environment = 'production', period_type = 'normal', store_checked_at = now() where identity_id = $1", [u]);
    const o2 = await ov(), e3 = await econ();
    eq([o2.subscriptions.paidVerified, o2.revenue.newPaying, o2.revenue.payingInPeriod, Number(o2.revenue.unverifiedGrossUsd)], [1, 1, 1, 9.98], 'after the re-sync: one verified payer (the trial and sandbox charges stay unverified)');
    eq([e3.revenue.newPaying, e3.revenue.payersEver], [1, 1], 'economics agrees');
    eq((await geo()).purchases, [{ country: 'FR', newPaying: 1, grossUsd: 4.99 }], 'geo: the payer and its money by country');
    eq(unitEconomics(e3).ltv.scenario, false, 'the LTV is no longer a scenario');
  });

  await block('F01 known production environment with unknown period is not current paid membership proof', async () => {
    const u=await account();
    await sub(u,'active','production','unknown');
    await purchase(u,'PRODUCTION',0,'MX');
    const s=(await ov()).subscriptions,e=await econ(),m=await members();
    eq([s.active,s.paidVerified,s.unverified,s.unverifiedReasons.unknown_period],[1,0,1,1],'current period not verified despite charge');
    eq([m.subscriptions[0].commercial,m.subscriptions[0].commercialReason],['unverified','unknown_period'],'membership reports missing period');
    eq([e.subscriptions.active,e.revenue.payersEver],[0,0],'no current paid membership or verified payer classification');
    eq([Number(e.revenue.grossUsd),Number(e.revenue.unverifiedGrossUsd)],[4.99,4.99],'independently verified production money retained');
    eq((await one('select public.bobby_is_pro($1) as r',[u])).r,true,'access retained');
    await pool.query("update public.bobby_subscriptions set period_type='normal',store_checked_at=now() where identity_id=$1",[u]);
    eq((await ov()).subscriptions.paidVerified,1,'store-confirmed normal period plus charge establishes classification');
  });

  await block('unowned production charges and refunds are reconciliation evidence, not customer revenue', async () => {
    const A=await account(),T=await account();
    await sub(A,'active','production'); await sub(T,'active','production');
    await pool.query('insert into public.bobby_internal_marks(identity_id) values($1)',[T]);
    await purchase(A,'PRODUCTION',0,'MX','INITIAL_PURCHASE',10);
    await purchase(T,'PRODUCTION',0,'MX','INITIAL_PURCHASE',20);
    await purchase(null,'PRODUCTION',0,'MX','INITIAL_PURCHASE',7);
    await purchase(null,'PRODUCTION',0,'MX','REFUND',-2);
    await purchase(null,'SANDBOX',0,'MX','INITIAL_PURCHASE',99);
    await purchase(null,null,0,'MX','INITIAL_PURCHASE',99);
    await purchase(null,'PRODUCTION',45,'MX','INITIAL_PURCHASE',100);
    let o=(await ov()).revenue,e=(await econ()).revenue;
    for(const [name,v] of [['overview',o],['economics',e]] as const){
      eq([Number(v.grossUsd),Number(v.netUsd),Number(v.refundsUsd),v.newPaying],[10,8.5,0,1],`${name}: only attributable external customer amounts`);
      eq([v.unattributedEvents,Number(v.unattributedGrossUsd),Number(v.unattributedRefundsUsd),Number(v.unattributedNetUsd)],[2,7,2,4.25],`${name}: unowned production ledger preserved; period/environment filters exact`);
      eq(v.scope,'attributed_external',`${name}: revenue scope explicit`);
    }
    eq(o.internalEvents,1,'unowned records not mislabeled internal');
    eq(o.daily.reduce((a:number,b:number)=>a+b,0),10,'customer series excludes unowned amounts');
    const onlyKnown=await geo();
    eq(onlyKnown.purchases,[{country:'MX',newPaying:1,grossUsd:10}],'country payers remain known accounts');
    o=(await ov(true)).revenue;e=(await econ(true)).revenue;
    for(const [name,v] of [['overview',o],['economics',e]] as const){
      eq([Number(v.grossUsd),Number(v.netUsd),Number(v.refundsUsd),v.newPaying],[37,29.75,2,2],`${name}: all recorded mode includes team plus unowned money`);
      eq([v.unattributedEvents,Number(v.unattributedGrossUsd),Number(v.unattributedRefundsUsd),Number(v.unattributedNetUsd)],[2,7,2,4.25],`${name}: reconciliation evidence independent of mode`);
      eq(v.scope,'all_recorded',`${name}: all-recorded scope explicit`);
    }
    eq(o.daily.reduce((a:number,b:number)=>a+b,0),37,'all recorded series includes unknown separately disclosed');
    await reset();
    await purchase(null,'PRODUCTION',0,'MX','INITIAL_PURCHASE',7);
    await purchase(null,'PRODUCTION',0,'MX','REFUND',-2);
    const raw=await econ();
    const {unitEconomics}=await import('../api/_lib/admin.ts');
    eq([Number(raw.revenue.grossUsd),Number(raw.revenue.netUsd),raw.revenue.newPaying],[0,0,0],'no attributable customer revenue or payer is invented');
    ok(raw.revenue.purchasesSince,'ledger receipt coverage exists despite unknown ownership');
    eq([raw.revenue.unattributedEvents,Number(raw.revenue.unattributedGrossUsd),Number(raw.revenue.unattributedRefundsUsd)],[2,7,2],'missing account is measurable reconciliation backlog');
    eq(unitEconomics(raw).revenue.measured,true,'known receipt coverage retained; owner scope remains separate');
    const resolved=await account(); await sub(resolved,'active','production');
    await pool.query("update public.bobby_purchase_events set identity_id=$1 where environment='PRODUCTION'",[resolved]);
    let reconciled=(await ov()).revenue;
    eq([reconciled.unattributedEvents,Number(reconciled.grossUsd),Number(reconciled.refundsUsd),Number(reconciled.netUsd),reconciled.newPaying],[0,7,2,4.25,1],'verified ownership clears reconciliation and attributes amounts once');
    await pool.query('insert into public.bobby_internal_marks(identity_id) values($1)',[resolved]);
    reconciled=(await ov()).revenue;
    eq([reconciled.unattributedEvents,Number(reconciled.grossUsd),Number(reconciled.netUsd),reconciled.internalEvents],[0,0,0,2],'subsequent team classification never leaves internal receipts in customers');
  });

  await block('production billing without converted USD stays explicit pending evidence', async () => {
    const A=await account(),T=await account();
    await sub(A,'active','production'); await sub(T,'active','production');
    await pool.query('insert into public.bobby_internal_marks(identity_id) values($1)',[T]);
    await purchase(A,'PRODUCTION',0,'MX','INITIAL_PURCHASE',null);
    await purchase(A,'PRODUCTION',0,'MX','RENEWAL',null);
    await purchase(A,'PRODUCTION',0,'MX','REFUND',null);
    await purchase(T,'PRODUCTION',0,'MX','INITIAL_PURCHASE',null);
    await purchase(null,'PRODUCTION',0,'MX','RENEWAL',null);
    await purchase(A,'SANDBOX',0,'MX','INITIAL_PURCHASE',null);
    await purchase(A,null,0,'MX','INITIAL_PURCHASE',null);
    await purchase(A,'PRODUCTION',45,'MX','INITIAL_PURCHASE',null);
    await purchase(A,'PRODUCTION',0,'MX','CANCELLATION',null);
    await purchase(A,'PRODUCTION',0,'MX','INITIAL_PURCHASE',10);
    for(const internal of [false,true]){
      for(const [name,v] of [['overview',(await ov(internal)).revenue],['economics',(await econ(internal)).revenue]] as const){
        eq(v.unconvertedEvents,5,`${name}/${internal}: only selected production charge/renewal/refund null USD counted, including all reconciliation scope`);
        eq([Number(v.grossUsd),Number(v.netUsd),Number(v.refundsUsd)],[10,8.5,0],`${name}/${internal}: USD subtotal contains amounts present, without guessed conversion`);
        eq([v.newPaying,v.payingInPeriod],[1,1],`${name}/${internal}: null USD alone never invents a verified payer`);
      }
    }
    await pool.query("delete from public.bobby_purchase_events where price_usd is not null");
    for(const [name,v] of [['overview',(await ov()).revenue],['economics',(await econ()).revenue]] as const){
      eq([v.unconvertedEvents,Number(v.grossUsd),v.newPaying],[5,0,0],`${name}: zero recorded USD disclosed with pending events; no paid-amount proof`);
    }
  });

  // ---------- F13: one definition of a new payer ----------
  await block('F13 new payer = first-ever verified charge in the period', async () => {
    const p = await account({ ageDays: 60 });
    await sub(p, 'active', 'production');
    await purchase(p, 'PRODUCTION', 40, 'MX');
    await purchase(p, 'PRODUCTION', 0, 'MX', 'RENEWAL');
    const o = (await ov()).revenue, e = (await econ()).revenue;
    eq([o.newPaying, o.payingInPeriod], [0, 1], 'overview: the renewal is a charge in the period, not a new payer');
    eq([e.newPaying, e.payingInPeriod, e.payersEver], [0, 1, 1], 'economics: the same definition');
    eq((await geo()).purchases, [{ country: 'MX', newPaying: 0, grossUsd: 4.99 }], 'geo: the renewal is money in the period, not a new payer');
    eq([(await ov(false, 60)).revenue.newPaying, (await econ(false, 60)).revenue.newPaying], [1, 1], 'over 60 days the first charge is in the period');
  });

  // ---------- F02: desk recovery is an order in time ----------
  await block('F02 last finished vs last unfinished desk analysis', async () => {
    // One ledger batch per run, all its rows at the same timestamp (minutes before a fixed base).
    const base = (await one("select date_trunc('second', now()) as t")).t;
    const run = (minsAgo: number, rows: [string, boolean][], surface = 'desk') => pool.query(
      `insert into public.bobby_llm_usage(created_at, surface, role, provider, model, ok)
       select $1::timestamptz - make_interval(mins => $2), $3, r, 'openai', 'gpt', o from unnest($4::text[], $5::boolean[]) as x(r, o)`,
      [base, minsAgo, surface, rows.map((r) => r[0]), rows.map((r) => r[1])]);
    const at = async (m: number) => (await one("select to_jsonb($1::timestamptz - make_interval(mins => $2)) #>> '{}' as t", [base, m])).t;
    await run(300, [['alpha', true], ['cio', true]]);     // finished
    await run(180, [['alpha', true], ['cio', false]]);    // the CIO failed
    await run(120, [['alpha', false]]);                   // failed before the CIO
    await run(60, [['probe', true]], 'probe');            // a provider probe answers after the last failure
    let d = (await ov()).llm.deskRuns;
    eq([d.runs, d.finished], [3, 1], 'three desk runs, one finished (the probe is not a desk run)');
    eq([d.lastFinishedAt, d.lastUnfinishedAt], [await at(300), await at(120)], 'the last finished run is older than the last failure');
    await run(30, [['alpha', true], ['final', true]]);
    d = (await ov()).llm.deskRuns;
    eq([d.lastFinishedAt, d.lastUnfinishedAt], [await at(30), await at(120)], 'a finished run after the last failure');
    // A run the reader abandoned before the CIO: api/desk-debate.ts writes a 'left' marker (provider 'none') with it.
    const left = (minsAgo: number) => pool.query(`insert into public.bobby_llm_usage(created_at, surface, role, provider, model, ok, stop)
      values ($1::timestamptz - make_interval(mins => $2), 'desk', 'left', 'none', 'none', false, 'left')`, [base, minsAgo]);
    await run(20, [['alpha', true]]); await left(20);
    d = (await ov()).llm.deskRuns;
    eq([d.runs, d.finished, d.abandoned, d.lastUnfinishedAt, d.lastFinishedAt], [4, 2, 1, await at(120), await at(30)],
      'an abandoned run is neither a failure nor a run: counted apart, lastUnfinishedAt unchanged');
    eq(d.byDay.length, 4, 'and it is not a run of its day');
    await run(10, [['alpha', true], ['cio', true]]); await left(10);
    d = (await ov()).llm.deskRuns;
    eq([d.runs, d.finished, d.abandoned, d.lastFinishedAt], [5, 3, 1, await at(10)], 'a run that finished before the reader left still proves the desk answered');
    const llm = (await ov()).llm;
    ok(!llm.bySurface.some((x: { provider: string }) => x.provider === 'none'), 'the marker is not spend by surface');
    eq([llm.providers.openai.calls, llm.providers.openai.failures], [11, 2], 'nor a provider call or failure');
  });

  // ---------- F04: a shared install ----------
  await block('F04 the first account inherits only the guest days of a shared install', async () => {
    const A = await account({ ageDays: 20 }), B = await account({ ageDays: 20 }), D = dev('shared');
    await read(A, D, 8);
    await pool.query("update public.bobby_device_accounts set first_at = now() - interval '9 days' where identity_id = $1", [A]);
    await read(B, D, 0);
    let a = await person(A);
    eq([a.read_7, a.read_days_14, a.reads], [false, 1, 1], "A read 8 days ago; B's read today on the same install is not A's");
    eq((await person(B)).read_7, true, 'B read today');
    await read(null, D, 3);
    a = await person(A);
    eq([a.read_7, a.read_days_14, a.reads], [true, 2, 2], "a guest read on the install is still the first account's");
    eq((await person(B)).read_days_14, 1, "B does not inherit the install's guest read");
    await reapply();
    eq([(await person(A)).read_days_14, (await person(B)).read_days_14], [2, 1], 're-applied: the shared install keeps its split');
  });

  await block('guest activity writers and backfill', async () => {
    const S = await account(), G = dev('guest');
    const day = async (device: string, ago = 0) => one(`select touches, reads, guest_touches, guest_reads from public.bobby_activity_days
      where subject = 'd:' || $1 and day = (now() at time zone 'utc')::date - $2::int`, [device, ago]);
    await read(null, G);
    eq(await day(G), { touches: 1, reads: 1, guest_touches: 1, guest_reads: 1 }, 'a guest read is guest activity');
    await read(S, G);
    eq(await day(G), { touches: 2, reads: 2, guest_touches: 1, guest_reads: 1 }, 'a signed read is not');
    const ids = await q('select id, identity_id from public.bobby_reads where device_hash = $1 order by id', [G]);
    await pool.query('delete from public.bobby_reads where id = $1', [ids[0].id]);
    eq(await day(G), { touches: 2, reads: 1, guest_touches: 1, guest_reads: 0 }, 'a refunded guest read leaves the guest reads');
    await pool.query('delete from public.bobby_reads where id = $1', [ids[1].id]);
    eq([(await day(G)).reads, (await day(G)).guest_reads], [0, 0], 'a refunded signed read leaves the guest reads alone');
    await pool.query("select public.bobby_record_event('visit', 'web', 'home', $1, null, null)", [G]);
    await pool.query("select public.bobby_record_outcome('read_done', 'web', $1, $2, 'rapido')", [G, S]);
    eq([(await day(G)).touches, (await day(G)).guest_touches], [4, 2], 'a visit is a guest open; a signed outcome is not');
    // Rows written before r2 (guest columns 0) are split by the migration.
    const L = dev('legacy'), M = dev('multi');
    await pair(L, S);
    await pool.query("insert into public.bobby_activity_days(subject, day, platform, touches, reads) values ('d:' || $1, (now() at time zone 'utc')::date - 2, 'web', 2, 1)", [L]);
    await pair(M, S); await pair(M, await account());
    await read(null, M, 1);
    await pool.query("update public.bobby_activity_days set guest_touches = 0, guest_reads = 0 where subject = 'd:' || $1", [M]);
    await reapply();
    eq(await day(L, 2), { touches: 2, reads: 1, guest_touches: 2, guest_reads: 1 }, 'one pairing: its activity becomes guest activity (what the dashboard did)');
    eq([(await day(M, 1)).guest_touches, (await day(M, 1)).guest_reads], [0, 1], 'shared install: only its reads without an account, from bobby_reads');
  });

  // ---------- F05: the team is a closure ----------
  await block('F05 a team network reaches the accounts signed in on its installs', async () => {
    const net = 'net-' + randomUUID().slice(0, 12), D = dev('net'), E = dev('admin');
    const A = await account();
    await pool.query("select public.bobby_record_event('visit', 'web', 'home', $1, null, null, 'MX', 'CMX', $2)", [D, net]);
    await pair(D, A);
    await pool.query('select public.bobby_mark_admin_session(null, $1)', [net]);
    eq([await isTeamDevice(D), await isTeam(A)], [true, true], 'the install seen on the team network and the account signed in on it are the team');
    eq(await q('select seed, seed_ref from public.bobby_team_closure() where identity_id = $1', [A]), [{ seed: 'network', seed_ref: net.slice(0, 10) }], 'provenance: which seed pulled it in');
    await read(null, D);
    await read(A, null);
    await pool.query("select public.bobby_record_outcome('read_done', 'ios', null, $1, 'rapido')", [A]);
    const a = (await ov()).activity;
    eq([a.reads, a.readsInternal], [0, 2], "the guest read and the account's signed read are both the team's");
    const g = await growth();
    eq([g.outcomes.delivered, g.people.excluded.accounts], [0, 1], 'a signed outcome with no install is the team too; the account is left out of people');
    await pool.query('select public.bobby_mark_admin_session($1, $2)', [E, net]);
    let nets = (await one('select public.bobby_admin_internal_networks() as r')).r;
    eq([nets.length, nets[0].installs, nets[0].onlyByNetwork, nets[0].accountsOnlyByNetwork], [1, 2, 1, 1], 'the network: 2 installs, 1 only by the network, 1 account only by the network');
    eq((await one('select public.bobby_ignore_internal_network($1) as n', [net.slice(0, 10)])).n, 1, 'the owner removes the network');
    eq([await isTeamDevice(D), await isTeam(A), await isTeamDevice(E)], [false, false, true], 'removing it undoes exactly what it pulled in');
    nets = (await one('select public.bobby_admin_internal_networks() as r')).r;
    eq(nets.length, 0, 'a removed network is not listed');
  });

  await block('F05 the closure chains through pairings; a link can be set aside', async () => {
    const D1 = dev('marked'), D2 = dev('second'), A = await account(), B = await account();
    await pair(D1, A); await pair(D2, A); await pair(D2, B);
    eq((await one('select public.bobby_set_device_internal($1, true) as n', [D1.slice(0, 10)])).n, 1, 'the owner marks D1');
    eq([await isTeam(A), await isTeamDevice(D2), await isTeam(B)], [true, true, true], 'D1 marked → A → D2 → B: all the team');
    eq(await q('select seed, seed_ref from public.bobby_team_closure() where identity_id = $1', [B]), [{ seed: 'install_mark', seed_ref: D1.slice(0, 10) }], "B's provenance");
    eq((await growth()).people.excluded.accounts, 2, 'both accounts left out of people');
    eq((await one('select public.bobby_set_team_link_ignored($1, $2, true) as n', [D2.slice(0, 10), A])).n, 1, 'the owner sets the A ↔ D2 link aside');
    eq([await isTeam(A), await isTeamDevice(D2), await isTeam(B)], [true, false, false], 'the chain stops at the set-aside link');
    eq((await one("select count(*)::int n from public.bobby_admin_people_facts() where person = 'd:' || $1", [D2])).n, 0, 'people are untouched: D2 is still paired, not a second person');
    eq((await one('select public.bobby_set_team_link_ignored($1, $2, false) as n', [D2.slice(0, 10), A])).n, 1, 'and brings it back');
    eq(await isTeam(B), true, 'B is the team again');
    await assert.rejects(pool.query('select public.bobby_set_team_link_ignored($1, $2, true)', ['x', A])); checks++;
    await assert.rejects(pool.query('select public.bobby_set_team_link_ignored($1, null, true)', [D2.slice(0, 10)])); checks++;
    eq((await one('select public.bobby_set_team_link_ignored($1, $2, true) as n', [D1.slice(0, 10), B])).n, 0, 'a link that does not exist changes nothing');
    // The users list says why: a chained account by its seed; an admin or a hand mark needs no reason; an account on
    // the owner's email list by its own email first.
    const T = await account(), E = await account(), D3 = dev('email');
    await pool.query('insert into public.bobby_admins(identity_id) values ($1)', [T]);
    await pair(D3, E); await pair(D3, T);
    await pool.query("insert into public.bobby_admin_settings(key, value) values ('internal_emails', $1::jsonb) on conflict (key) do update set value = excluded.value",
      [JSON.stringify([`${E.slice(0, 8)}@example.test`])]);
    const users = (await one('select public.bobby_admin_users(null, 50, 0) as r')).r.users;
    const urow = (id: string) => users.find((u: { id: string }) => u.id === id);
    eq([urow(B).is_team, urow(B).team_seed, urow(B).team_seed_ref], [true, 'install_mark', D1.slice(0, 10)], 'users: B is the team by the marked install D1');
    eq([urow(A).team_seed, urow(A).team_seed_ref], ['install_mark', D1.slice(0, 10)], 'users: A too');
    eq([urow(T).is_team, 'team_seed' in urow(T)], [true, false], 'users: an admin carries no derived reason');
    eq([urow(E).team_seed, urow(E).team_seed_ref], ['email', E], "users: E is the team by its own email, not by the admin it shares an install with");
    await pool.query("delete from public.bobby_admin_settings where key = 'internal_emails'");
  });

  // ---------- F07: only a positive top-up is a top-up ----------
  await block('F07 lastTopup = the latest positive top-up', async () => {
    const top = async () => (await ov()).llm.providers.openai.lastTopup;
    // The audit's sequence: the provider ran out of credit (alert fact), then the owner noted a $0 balance.
    await pool.query(`insert into public.api_cache(cache_key, payload, expires_at, updated_at)
      values ('provider-credit-alert:openai', '{"code":"insufficient_quota"}', now() + interval '6 hours', now() - interval '3 hours')
      on conflict (cache_key) do update set payload = excluded.payload, expires_at = excluded.expires_at, updated_at = excluded.updated_at`);
    await pool.query("insert into public.bobby_llm_credit_marks(provider, kind, amount_usd, created_at) values ('openai', 'topup', 0, now() - interval '2 hours')");
    eq(await top(), null, 'a $0 top-up is not a top-up');
    await pool.query("insert into public.bobby_llm_credit_marks(provider, kind, amount_usd) values ('openai', 'balance', 0)");
    const p = (await ov()).llm.providers.openai;
    eq([p.lastTopup, p.creditAlert, Number(p.balanceMark.amount)], [null, { code: 'insufficient_quota' }, 0], 'a $0 balance after the alert is not a top-up: nothing heals it');
    const t = (await one("insert into public.bobby_llm_credit_marks(provider, kind, amount_usd, created_at) values ('openai', 'topup', 5, now() - interval '1 hour') returning to_jsonb(created_at) #>> '{}' as t")).t;
    eq(await top(), t, 'a positive top-up is');
    await pool.query("delete from public.api_cache where cache_key = 'provider-credit-alert:openai'");
  });

  // ---------- F08: the members list follows the header ----------
  await block('F08 members leave the team out unless asked', async () => {
    const T = await account(), O = await account();
    await pool.query('insert into public.bobby_admins(identity_id) values ($1)', [T]);
    await sub(T, 'active', 'sandbox'); await sub(O, 'active', 'unknown');
    await pool.query("insert into public.bobby_pro_grants(identity_id, pro_until, source) values ($1, now() + interval '5 days', 'admin'), ($2, now() + interval '9 days', 'referral')", [T, O]);
    const out = await members(false);
    eq([out.includeInternal, out.subscriptions.map((x: { identityId: string }) => x.identityId), out.grants.map((x: { identityId: string }) => x.identityId)], [false, [O], [O]], 'team rows omitted');
    eq([out.excluded, out.totals], [{ subscriptions: 1, grants: 1 }, { live: 1, paidVerified: 0, unverified: 1, test: 0 }], 'and counted apart');
    eq(await members(), out, 'the deployed call ({}) = the default');
    const all = await members(true);
    eq([all.includeInternal, all.subscriptions.length, all.excluded, all.totals.test], [true, 2, { subscriptions: 0, grants: 0 }, 1], 'asking for the team includes it');
    eq([all.subscriptions.find((x: { identityId: string }) => x.identityId === T).internal, all.grants.find((x: { identityId: string }) => x.identityId === T).internal], [true, true], 'team rows are labelled');
    eq([(await ov()).subscriptions.active, (await ov(true)).subscriptions.active], [1, 2], 'the overview uses the same rule');
  });

  // ---------- F09: a 30-day reader read in the last 30 days ----------
  await block('F09 activeReaders30d needs a read in the window', async () => {
    const C = await account({ ageDays: 50 }), R = await account({ ageDays: 50 });
    await read(C, null, 40);
    await read(R, null, 10);
    const before = await econ();
    eq([before.activeReaders30d, before.activeReaders30dAll], [1, 1], 'only R read in the last 30 days');
    await pair(dev('open'), C);   // C opens Bobby today without reading
    const after = await econ();
    eq([after.activeReaders30d, after.activeReaders30dAll], [1, 1], 'an open is not a read: unchanged');
    const c = await one('select read_30, last_read_day, (now() at time zone \'utc\')::date - 40 as d40 from public.bobby_admin_people_facts_v2() where identity_id = $1', [C]);
    eq([c.read_30, c.last_read_day.getTime()], [false, c.d40.getTime()], 'people facts v2: last read day 40 days ago');
    eq((await growth()).people.readers, 2, 'lifetime readers unchanged');
  });

  // ---------- F11: abandoned is not failed ----------
  await block('F11 read_abandoned is an outcome of its own', async () => {
    const W = dev('reader'), E = dev('owner');
    await pool.query("select public.bobby_record_outcome('read_abandoned', 'web', $1, null, 'left')", [W]);
    let o = (await growth()).outcomes;
    eq([o.abandoned, o.failed], [1, 0], 'the reader left: abandoned, not failed');
    ok(o.outcomesSince, 'an abandoned read starts the outcome coverage');
    ok((await ov()).coverage.outcomesSince, 'overview coverage too');
    await pool.query("select public.bobby_record_outcome('read_failed', 'web', $1, null, 'provider_http')", [W]);
    await pool.query('select public.bobby_mark_admin_session($1, null)', [E]);
    await pool.query("select public.bobby_record_outcome('read_abandoned', 'web', $1, null, 'left')", [E]);
    o = (await growth()).outcomes;
    eq([o.abandoned, o.failed], [1, 1], 'failures and abandonment apart; the owner browser is out');
    eq((await growth(true)).outcomes.abandoned, 2, 'and in with the team');
    eq((await one('select failed from public.bobby_admin_device_facts() where device_hash = $1', [W])).failed, 1, 'install facts count failures only');
    await assert.rejects(pool.query("select public.bobby_record_outcome('visit', 'web', null, null, null)")); checks++;
  });

  // ---------- defense in depth: slugs ----------
  await block('bobby_record_event keeps a visit with a bad slug', async () => {
    const V = dev('slug'), W = dev('good');
    await pool.query("select public.bobby_record_event('visit', 'web', 'Bad Surface!', $1, 'Bad Ref!', 'Bad Slug!')", [V]);
    eq(await one('select surface, referrer, utm_source from public.bobby_events where device_hash = $1', [V]), { surface: null, referrer: null, utm_source: null }, 'the visit is kept, the bad values are null');
    eq(await one('select utm_source, first_surface from public.bobby_devices where device_hash = $1', [V]), { utm_source: null, first_surface: null }, 'the install is touched');
    await pool.query("select public.bobby_record_event('visit', 'web', 'home', $1, 'google.com', 'tiktok')", [W]);
    eq(await one('select surface, referrer, utm_source from public.bobby_events where device_hash = $1', [W]), { surface: 'home', referrer: 'google.com', utm_source: 'tiktok' }, 'valid slugs pass');
  });

  // ---------- claims ----------
  await block('bobby_cache_claim is atomic', async () => {
    const claim = async (key: string, ttl = 60) => (await one('select public.bobby_cache_claim($1, $2, $3) as r', [key, ttl, { state: 'sending' }])).r;
    eq(await claim('r2test:a'), true, 'a free key is claimed');
    eq(await claim('r2test:a'), false, 'a held key is not');
    eq((await one("select payload from public.api_cache where cache_key = 'r2test:a'")).payload, { state: 'sending' }, 'the payload is stored');
    await pool.query("update public.api_cache set expires_at = now() - interval '1 second' where cache_key = 'r2test:a'");
    eq(await claim('r2test:a'), true, 'an expired key is claimed again');
    const race = await Promise.all(Array.from({ length: 6 }, () => claim('r2test:race')));
    eq(race.filter(Boolean).length, 1, 'six concurrent claims: exactly one wins');
    for (const [key, ttl] of [['bad key!', 60], ['r2test:b', 0], ['r2test:b', 2592001]] as const) {
      await assert.rejects(pool.query('select public.bobby_cache_claim($1, $2)', [key, ttl])); checks++;
    }
  });

  await block('live empty means no observed recent events and unavailable coverage', async () => {
    const l = (await one('select public.bobby_admin_live(false) as r')).r;
    eq(l.includeInternal, false, 'team excluded by default');
    for (const period of ['15m', '1h', '24h']) for (const platform of ['ios', 'web']) {
      eq(l.windows[period][platform], { observedDevices: 0, observedAccounts: 0, events: 0, consumed: 0, completed: 0, failed: 0,
        abandoned: 0, wallSignin: 0, wallPaywall: 0, wallLevel: 0, blocked: {} }, `${period}/${platform} empty activity`);
    }
    for (const platform of ['ios', 'web']) eq(l.platforms[platform], { latestEventAt: null, latestOutcomeAt: null, latestCompletedAt: null,
      latestReadConsumptionAt: null }, `${platform} source timestamps unavailable`);
    eq(l.providers, [], 'no provider call telemetry');
    for (const key of ['readStarted', 'clientRendered', 'crashes', 'buildVersion', 'onlinePresence']) eq(l.coverage[key], false, `${key} explicitly unmeasured`);
    eq(l.coverage.successRate, null, 'no start denominator implies no success ratio');
    eq(l.coverage.eventCoverageSince, null, 'no fabricated event coverage');
    eq(l.coverage.outcomeCoverageSince, null, 'no fabricated outcome coverage');
  });

  await block('live windows separate consumption, completion, refusal, failure and abandonment', async () => {
    const A = await account(), B = await account(), D = dev('live-ios'), W = dev('live-web'), T = dev('live-team');
    await pool.query("select public.bobby_mark_admin_session($1,null)", [T]);
    const event = async (name: string, platform: string, device: string, identity: string | null, minutes: number, detail: string | null = null) =>
      pool.query(`insert into public.bobby_events(event,platform,device_hash,identity_id,created_at,detail)
        values($1,$2,$3,$4,now()-make_interval(mins=>$5),$6)`, [name, platform, device, identity, minutes, detail]);
    await event('read_done', 'ios', D, A, 5, 'rapido');
    await event('read_failed', 'ios', D, A, 20, 'provider_http');
    await event('read_abandoned', 'ios', D, A, 30, 'left');
    await event('read_failed', 'ios', D, A, 40, 'left');
    await event('wall_signin', 'web', W, B, 14);
    await event('wall_paywall', 'web', W, B, 120);
    await event('desk_blocked', 'web', W, B, 120, 'budget');
    await event('read_done', 'web', W, B, 2880, 'rapido');
    await event('read_done', 'web', W, B, -60, 'rapido');
    await event('read_done', 'ios', T, null, 5, 'rapido');
    await pool.query(`insert into public.bobby_reads(identity_id,device_hash,platform,symbol,created_at) values
      ($1,$2,'web','BTC',now()-interval '10 minutes'),($3,$4,'ios','BTC',now()-interval '2 hours')`, [B, W, A, D]);
    const l = (await one('select public.bobby_admin_live(false) as r')).r;
    eq([l.windows['15m'].ios.events,l.windows['15m'].ios.completed,l.windows['15m'].ios.consumed,l.windows['15m'].ios.observedDevices,l.windows['15m'].ios.observedAccounts],
      [1,1,0,1,1], '15m iOS server completion independent from consumption');
    eq([l.windows['15m'].web.events,l.windows['15m'].web.wallSignin,l.windows['15m'].web.consumed,l.windows['15m'].web.observedDevices,l.windows['15m'].web.observedAccounts],
      [1,1,1,1,1], '15m web consumption does not imply completion');
    eq([l.windows['1h'].ios.events,l.windows['1h'].ios.completed,l.windows['1h'].ios.failed,l.windows['1h'].ios.abandoned],
      [4,1,1,2], '1h classifies old left failures and new abandoned separately');
    eq([l.windows['24h'].ios.events,l.windows['24h'].ios.consumed,l.windows['24h'].web.events,l.windows['24h'].web.wallPaywall,l.windows['24h'].web.blocked],
      [4,1,3,1,{budget:1}], '24h includes separate refusal details and excludes old/future events');
    eq((await one('select public.bobby_admin_live(true) as r')).r.windows['15m'].ios.completed,2,'team only included on request');
    ok(new Date(l.platforms.web.latestCompletedAt).getTime() < Date.now()-24*3600_000,'latest completion ignores future event');
    ok(new Date(l.platforms.web.latestReadConsumptionAt).getTime() > Date.now()-15*60_000,'latest consumption timestamp retained');
    for (const period of ['15m','1h','24h']) eq(Date.parse(l.snapshotAt)-Date.parse(l.windows[period].since),l.windows[period].minutes*60_000,`${period} shares snapshot clock`);
    const wire=JSON.stringify(l);
    for (const privateValue of [A,B,D,W,T,'@example.test']) eq(wire.includes(privateValue),false,'aggregate live contract exposes no identity or device data');
    eq(l.coverage.completedScope,'server_read_done','completion scope explicit');
    eq(l.coverage.providerCostsIncludeInternal,true,'ledger team scope explicit');
    const g=(await growth()).outcomes;
    eq([g.failed,g.abandoned],[1,2],'growth agrees with live on legacy abandonment');
  });

  await block('live provider call percentiles are scoped and never user latency', async () => {
    await pool.query(`insert into public.bobby_llm_usage(surface,role,provider,model,ok,usd,latency_ms,created_at) values
      ('desk','cio','openai','live-a',true,0.01,100,now()-interval '5 minutes'),
      ('desk','alpha','openai','live-a',true,0.02,300,now()-interval '10 minutes'),
      ('desk','cio','openai','live-a',false,0,NULL,now()-interval '8 minutes'),
      ('desk','left','none','none',false,0,0,now()-interval '2 minutes'),
      ('admin','probe','anthropic','live-b',true,0.03,200,now()-interval '20 minutes'),
      ('desk','cio','openai','live-a',true,0.99,9000,now()-interval '2 days')`);
    const l=(await one('select public.bobby_admin_live(false) as r')).r;
    eq(l.providers.length,2,'all recorded provider/model groups, no abandoned marker group');
    const o=l.providers.find((p:{provider:string})=>p.provider==='openai');
    eq([o.calls24h,o.failures24h,Number(o.usd24h),o.callLatencyP50Ms,o.callLatencyP95Ms],[3,1,0.03,200,290],'provider percentile excludes null latency and calls outside window');
    ok(o.lastFailureAt && o.lastCallAt,'provider source event stamps retained');
    eq(l.coverage.latencyScope,'provider_call','cannot be mistaken for end-to-end response latency');
  });

  // ---------- it stays fast with paired accounts ----------
  await block('2,000 installs and 2,000 paired accounts', async () => {
    const pc = await pool.connect();
    try {
      await pc.query('begin');
      await pc.query(`insert into public.bobby_identities(id, auth_user_id, email, provider, created_at)
        select md5('perf-id-' || g)::uuid, gen_random_uuid(), 'perf-' || g || '@example.test', 'apple', now() - make_interval(hours => g % 900) from generate_series(1, 2000) g`);
      await pc.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen)
        select 'perf-dev-' || g, case when g % 3 = 0 then 'ios' else 'web' end, now() - make_interval(hours => g % 700), now() from generate_series(1, 2000) g`);
      // 1:1 pairings plus 200 installs shared by a second account.
      await pc.query(`insert into public.bobby_device_accounts(device_hash, identity_id, first_at, last_at)
        select 'perf-dev-' || g, md5('perf-id-' || g)::uuid, now() - make_interval(hours => g % 700), now() from generate_series(1, 2000) g
        union all select 'perf-dev-' || (g + 1000), md5('perf-id-' || g)::uuid, now(), now() from generate_series(1, 200) g`);
      await pc.query(`insert into public.bobby_reads(identity_id, device_hash, network_hash, platform, symbol, created_at)
        select case when g % 2 = 0 then md5('perf-id-' || (g % 2000 + 1))::uuid end, 'perf-dev-' || (g % 2000 + 1), 'perfnet-' || (g % 50), 'web', 'BTC',
          now() - make_interval(hours => g % 600) from generate_series(1, 6000) g`);
      await pc.query(`insert into public.bobby_events(event, platform, surface, device_hash, created_at)
        select 'visit', 'web', 'home', 'perf-dev-' || (g % 2000 + 1), now() - make_interval(hours => g % 600) from generate_series(1, 6000) g`);
      await pc.query(`insert into public.bobby_subscriptions(identity_id, provider, status, current_period_end, environment)
        select md5('perf-id-' || g)::uuid, 'apple', 'active', now() + interval '10 days', case when g % 2 = 0 then 'production' else 'unknown' end from generate_series(1, 300) g`);
      await pc.query(`insert into public.bobby_purchase_events(id, type, environment, price_usd, identity_id, event_at)
        select 'perf-ev-' || g, 'INITIAL_PURCHASE', 'PRODUCTION', 4.99, md5('perf-id-' || g)::uuid, now() - make_interval(days => g % 60) from generate_series(1, 300) g`);
      await pc.query(`insert into public.bobby_device_networks(device_hash, network_hash) select 'perf-dev-' || g, 'caller-' || (g % 300) from generate_series(1, 2000) g`);
      await pc.query("insert into public.bobby_internal_networks(network_hash, note) values ('caller-7', 'perf')");
      // Statistics of the data just loaded, as autoanalyze keeps them in production. Without it the planner can see
      // what an earlier rolled-back fixture left (0 rows on non-empty pages) and time out with any version of these
      // functions (20261001233000 included).
      await pc.query(`analyze public.bobby_identities, public.bobby_devices, public.bobby_device_accounts, public.bobby_reads, public.bobby_reader_stats,
        public.bobby_activity_days, public.bobby_events, public.bobby_subscriptions, public.bobby_purchase_events, public.bobby_device_networks, public.bobby_internal_networks`);
      const team = (await pc.query('select (select count(*) from public.bobby_internal_identity_ids())::int a, (select count(*) from public.bobby_internal_device_hashes())::int d')).rows[0];
      ok(team.a >= 7 && team.d >= 7 && team.a < 50, `the team network pulls in its ${team.d} installs and ${team.a} accounts, not the whole graph`);
      const rpcTimes: Record<string, number> = {};
      for (const name of ['growth','overview','economics']) {
        const started = Date.now();
        await pc.query(`select public.bobby_admin_${name}(30, false)`);
        rpcTimes[name] = Date.now() - started;
      }
      const ms = Object.values(rpcTimes).reduce((total, value) => total + value, 0);
      console.log('    analytics RPC times (ms):', rpcTimes);
      if (ms >= 4000) {
        for (const name of ['growth','overview','economics']) {
          const plan = (await pc.query(`explain (analyze,buffers,settings,format json) select public.bobby_admin_${name}(30,false)`)).rows;
          console.log(`    slow ${name} EXPLAIN:`, JSON.stringify(plan));
        }
      }
      ok(ms < 4000, `growth + overview + economics with 2,000 paired accounts, 200 shared installs and a team network in ${ms} ms (under 4 s)`);
      const t1 = Date.now();
      await pc.query('select public.bobby_admin_members(false), public.bobby_admin_internal_networks(), public.bobby_admin_geo(30, false)');
      const ms2 = Date.now() - t1;
      ok(ms2 < 2000, `members + networks + geo in ${ms2} ms`);
      const liveStart=Date.now();
      const live=(await pc.query('select public.bobby_admin_live(false) as r')).rows[0].r;
      const liveMs=Date.now()-liveStart;
      ok(live.windows['24h'].web.observedDevices>0,'live counts recent fixture devices');
      ok(liveMs<1000,`live snapshot with 2,000 paired accounts in ${liveMs} ms`);
      console.log(`    growth + overview + economics ${ms} ms; members + networks + geo ${ms2} ms; live ${liveMs} ms`);
    } finally { await pc.query('rollback'); pc.release(); }
  });

  // ---------- one large component with many seeds (the closure regression of r2) ----------
  await block('one component of 4,000 nodes with 150 install seeds costs what one seed costs', async () => {
    const pc = await pool.connect();
    try {
      await pc.query('begin');
      await pc.query(`insert into public.bobby_identities(id, auth_user_id, email, provider, created_at)
        select md5('comp-id-' || g)::uuid, gen_random_uuid(), 'comp-' || g || '@example.test', 'apple', now() - make_interval(hours => g % 900) from generate_series(1, 2000) g`);
      // One install opened /admin; later 153 of them (g % 13 = 0): all seeds of the same component.
      await pc.query(`insert into public.bobby_devices(device_hash, platform, first_seen, last_seen, admin_session)
        select 'comp-dev-' || g, 'web', now() - make_interval(hours => g % 700), now(), g = 13 from generate_series(1, 2000) g`);
      // A path: install g ↔ account g ↔ install g-1 ↔ … one connected component of 4,000 nodes.
      await pc.query(`insert into public.bobby_device_accounts(device_hash, identity_id, first_at, last_at)
        select 'comp-dev-' || g, md5('comp-id-' || g)::uuid, now(), now() from generate_series(1, 2000) g
        union all select 'comp-dev-' || g, md5('comp-id-' || (g + 1))::uuid, now(), now() from generate_series(1, 1999) g`);
      await pc.query(`insert into public.bobby_reads(identity_id, device_hash, platform, symbol, created_at)
        select md5('comp-id-' || (g % 2000 + 1))::uuid, 'comp-dev-' || (g % 2000 + 1), 'web', 'BTC', now() - make_interval(hours => g % 600) from generate_series(1, 4000) g`);
      await pc.query(`insert into public.bobby_events(event, platform, surface, device_hash, created_at)
        select 'visit', 'web', 'home', 'comp-dev-' || (g % 2000 + 1), now() - make_interval(hours => g % 600) from generate_series(1, 4000) g`);
      await pc.query(`analyze public.bobby_identities, public.bobby_devices, public.bobby_device_accounts, public.bobby_reads, public.bobby_reader_stats,
        public.bobby_activity_days, public.bobby_events, public.bobby_subscriptions, public.bobby_purchase_events, public.bobby_device_networks, public.bobby_internal_networks`);
      const team = async () => (await pc.query(`select (select count(*) from public.bobby_internal_identity_ids())::int a, (select count(*) from public.bobby_internal_device_hashes())::int d,
        (select count(*) from public.bobby_devices where admin_session)::int seeds`)).rows[0];
      const views = async () => { const t = Date.now(); await pc.query('select public.bobby_admin_growth(30, false), public.bobby_admin_overview(30, false), public.bobby_admin_economics(30, false)'); return Date.now() - t; };
      eq(await team(), { a: 2000, d: 2000, seeds: 1 }, 'one seed: the whole component is the team');
      await views();   // warm
      const one = await views();
      await pc.query("update public.bobby_devices set admin_session = true where device_hash like 'comp-dev-%' and substr(device_hash, 10)::int % 13 = 0");
      await pc.query('analyze public.bobby_devices');
      eq(await team(), { a: 2000, d: 2000, seeds: 153 }, '153 seeds: the same nodes, each once');
      const ms = await views();
      // The per-seed closure (each seed walking the whole component) took ~4× longer here; the node walk does not grow.
      ok(ms < 2 * one + 400, `growth + overview + economics: ${ms} ms with 153 seeds vs ${one} ms with one seed`);
      ok(ms < 4000, `and under 4 s (${ms} ms)`);
      const t1 = Date.now();
      await pc.query('select public.bobby_admin_members(false), public.bobby_admin_internal_networks(), public.bobby_admin_geo(30, false)');
      const ms2 = Date.now() - t1;
      ok(ms2 < 2000, `members + networks + geo in ${ms2} ms`);
      const t2 = Date.now();
      const page = (await pc.query('select public.bobby_admin_users(null, 50, 0) as r')).rows[0].r;
      const ms3 = Date.now() - t2;
      ok(page.users.length === 50 && page.users.every((u: { team_seed?: string }) => u.team_seed === 'admin_session'), 'users: every listed account is the team by an /admin install');
      ok(ms3 < 5000, `users with provenance in ${ms3} ms`);
      console.log(`    growth + overview + economics ${one} ms (1 seed) → ${ms} ms (153 seeds); members + networks + geo ${ms2} ms; users ${ms3} ms`);
    } finally { await pc.query('rollback'); pc.release(); }
  });

  await block('migration-first rollout: serving #130 explicit NULL writes remain compatible', async () => {
    const apple = await account();
    await pool.query(`insert into public.bobby_subscriptions(identity_id,provider,status,current_period_end,environment,period_type)
      values($1,'apple','active',now()+interval '20 days','production',null)`,[apple]);
    eq(await one('select environment,period_type from public.bobby_subscriptions where identity_id=$1',[apple]),
      {environment:'production',period_type:'unknown'},'old-main Apple INSERT with unknown period does not fail NOT NULL');
    await pool.query('update public.bobby_subscriptions set environment=null,period_type=null where identity_id=$1',[apple]);
    eq(await one('select environment,period_type from public.bobby_subscriptions where identity_id=$1',[apple]),
      {environment:'unknown',period_type:'unknown'},'old-main Apple UPDATE explicit NULL evidence becomes unknown');
    eq((await one('select bobby_is_pro($1) as pro',[apple])).pro,true,'old-main Apple sync keeps its active access');
    const card = await account();
    await pool.query(`insert into public.bobby_subscriptions(identity_id,provider,status,stripe_subscription_id,environment,period_type)
      values($1,'stripe','incomplete','sub_oldmain_nullable',null,null)`,[card]);
    eq(await one('select environment,period_type from public.bobby_subscriptions where identity_id=$1',[card]),
      {environment:'unknown',period_type:'unknown'},'old-main Stripe INSERT survives a missing mode/period');
    await pool.query("update public.bobby_subscriptions set status='active',current_period_end=now()+interval '20 days',environment=null,period_type=null where identity_id=$1",[card]);
    eq(await one('select status,environment,period_type from public.bobby_subscriptions where identity_id=$1',[card]),
      {status:'active',environment:'unknown',period_type:'unknown'},'old-main Stripe UPDATE preserves Pro with unknown evidence');
    eq((await one('select bobby_is_pro($1) as pro',[card])).pro,true,'old-main Stripe activation can grant access after migration');
  });

  await block('payments #130: unknown Apple evidence survives card checkout and the mirror counts as live', async () => {
    const id = await account();
    await sub(id, 'active', 'unknown', 'unknown');
    await pool.query(`update public.bobby_subscriptions set provider='stripe', status='canceled',
      stripe_subscription_id='sub_mirror_regression', stripe_customer_id='cus_mirror_regression',
      environment='production', period_type='normal', current_period_end=now()-interval '1 day' where identity_id=$1`, [id]);
    const row = await one('select provider,status,apple_status,apple_environment,apple_period_type from public.bobby_subscriptions where identity_id=$1',[id]);
    eq(row, { provider:'stripe', status:'canceled', apple_status:'active', apple_environment:null, apple_period_type:null },
      'Apple-to-card trigger maps unknown evidence to nullable Apple checks without rejecting checkout');
    let fact = await one('select provider,status,environment,period_type,live,commercial,reason from public.bobby_subscription_facts() where identity_id=$1',[id]);
    eq(fact, { provider:'apple', status:'active', environment:'unknown', period_type:'unknown', live:true,
      commercial:'unverified', reason:'unknown_environment' }, 'live unknown Apple mirror is visible as unverified');
    await pool.query("update public.bobby_subscriptions set apple_environment='production', apple_period_type='normal' where identity_id=$1",[id]);
    await purchase(id,'PRODUCTION');
    fact = await one('select provider,live,commercial from public.bobby_subscription_facts() where identity_id=$1',[id]);
    eq(fact, { provider:'apple', live:true, commercial:'paid' }, 'verified Apple mirror remains paid after card cancellation');
    eq((await one('select count(*)::int as n from public.bobby_payer_charges() where identity_id=$1',[id])).n,1,'mirror is one verified payer');
    eq((await members()).totals.paidVerified,1,'mirror remains inside verified member/MRR inputs');
    await pool.query("update public.bobby_subscriptions set provider='apple',status='active',current_period_end=now()+interval '20 days',environment='unknown',period_type='unknown' where identity_id=$1",[id]);
    const updated = await one('select provider,status,environment,period_type,apple_environment,apple_period_type from public.bobby_subscriptions where identity_id=$1',[id]);
    eq(updated, { provider:'stripe',status:'canceled',environment:'production',period_type:'normal',apple_environment:null,apple_period_type:null },
      'an old-style Apple write cannot replace card ownership and maps unknown only inside mirror');
    await reapply();
    eq((await one('select live from public.bobby_subscription_facts() where identity_id=$1',[id])).live,true,'migration reapply preserves mirror access');
  });

  await block('payments #130: paid Apple mirror wins over a sandbox or trial primary', async () => {
    const id = await account();
    await pool.query(`insert into public.bobby_subscriptions(identity_id,provider,status,current_period_end,environment,period_type,
      stripe_subscription_id,apple_status,apple_current_period_end,apple_environment,apple_period_type)
      values($1,'stripe','trialing',now()+interval '20 days','sandbox','trial','sub_trial_primary',
        'active',now()+interval '20 days','production','normal')`,[id]);
    await purchase(id,'PRODUCTION');
    eq(await one('select provider,live,commercial from public.bobby_subscription_facts() where identity_id=$1',[id]),
      {provider:'apple',live:true,commercial:'paid'}, 'live paid mirror supplies commercial evidence when primary is test');
    await pool.query("update public.bobby_subscriptions set apple_status='refunded' where identity_id=$1",[id]);
    eq(await one('select provider,live,commercial from public.bobby_subscription_facts() where identity_id=$1',[id]),
      {provider:'stripe',live:true,commercial:'test'}, 'refunded mirror cannot classify trial primary as paid');
  });

  console.log(`admin-r2-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
