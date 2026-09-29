// Actual PostgreSQL regressions for 20260929190000_user_memory.sql: service-only privileges (with Supabase's
// default ACLs simulated), recording only for Apple/Google accounts with memory on, 90-day retention, the
// 50-asset cap by decayed score, the summary's ranking and its exclusion of stale rows, forgetting one asset
// or everything, the cascade when an identity is deleted, and an idempotent migration.
// Needs the schema prepared by scripts/test-trader-land-growth.sql (as in CI). Local scratch Postgres only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('user-memory-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');

const pool = new pg.Pool({ connectionString: url, max: 12 });
let checks = 0;
const eq = (got: unknown, want: unknown, what: string) => { assert.deepEqual(got, want, what); checks++; };
const ok = (v: unknown, what: string) => { assert.ok(v, what); checks++; };
const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows;

const TABLES = ['bobby_user_assets', 'bobby_user_prefs'];
const FUNCTIONS = ['public.bobby_memory_record(uuid, text, text)', 'public.bobby_memory_summary(uuid, text)', 'public.bobby_memory_forget(uuid, text)'];

const account = async () => (await q('insert into public.bobby_identities(auth_user_id) values ($1) returning id', [randomUUID()]))[0].id as string;
const wallet = async () => (await q("insert into public.bobby_identities(wallet_address) values ('0x' || md5(gen_random_uuid()::text)) returning id"))[0].id as string;
const record = async (identity: string | null, symbol: string | null, horizon: string | null = 'unspecified') =>
  (await q('select public.bobby_memory_record($1, $2, $3) as r', [identity, symbol, horizon]))[0].r as boolean;
const summary = async (identity: string | null, symbol: string | null) => (await q('select public.bobby_memory_summary($1, $2) as r', [identity, symbol]))[0].r;
const forget = async (identity: string, symbol: string | null = null) =>
  (await q(symbol === null ? 'select public.bobby_memory_forget($1) as r' : 'select public.bobby_memory_forget($1, $2) as r', symbol === null ? [identity] : [identity, symbol]))[0].r as number;
const rows = async (identity: string) => q('select symbol, asks, first_asked_at, last_asked_at, last_horizon from public.bobby_user_assets where identity_id = $1 order by symbol', [identity]);
const row = async (identity: string, symbol: string) => (await q('select * from public.bobby_user_assets where identity_id = $1 and symbol = $2', [identity, symbol]))[0];
/** Insert a remembered asset directly: `asks` times, last asked `days` ago. */
const seed = (identity: string, symbol: string, asks: number, days: number, horizon = 'unspecified') =>
  q(`insert into public.bobby_user_assets(identity_id, symbol, asks, first_asked_at, last_asked_at, last_horizon)
     values ($1, $2, $3, now() - make_interval(days => $4 + 1), now() - make_interval(days => $4), $5)`, [identity, symbol, asks, days, horizon]);
const count = async (identity: string) => Number((await q('select count(*) from public.bobby_user_assets where identity_id = $1', [identity]))[0].count);

const migration = readFileSync('supabase/bobby-protocol/supabase/migrations/20260929190000_user_memory.sql', 'utf8');

try {
  // A clean slate in the scratch database, then Supabase's default ACLs (ALL on every new table and function
  // to anon and authenticated) while the migration runs, so its revokes are what is tested.
  await q(`drop table if exists public.bobby_user_assets, public.bobby_user_prefs cascade;
    drop function if exists public.bobby_memory_record(uuid, text, text);
    drop function if exists public.bobby_memory_summary(uuid, text);
    drop function if exists public.bobby_memory_forget(uuid, text);`);
  await q(`alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on functions to anon, authenticated;`);
  try {
    await q(migration);
    await q(migration); // idempotent
  } finally {
    await q(`alter default privileges in schema public revoke all on tables from anon, authenticated;
      alter default privileges in schema public revoke all on functions from anon, authenticated;`);
  }

  // ---------- privileges: service-only ----------
  for (const table of TABLES) {
    for (const role of ['anon', 'authenticated']) {
      for (const priv of ['select', 'insert', 'update', 'delete']) {
        eq((await q('select has_table_privilege($1, $2, $3) as r', [role, `public.${table}`, priv]))[0].r, false, `${role} has no ${priv} on ${table}`);
      }
    }
    eq((await q('select has_table_privilege($1, $2, $3) as r', ['service_role', `public.${table}`, 'insert']))[0].r, true, `service_role inserts into ${table}`);
    eq((await q('select relrowsecurity as r from pg_class where oid = $1::regclass', [`public.${table}`]))[0].r, true, `RLS on ${table}`);
  }
  for (const fn of FUNCTIONS) {
    for (const role of ['anon', 'authenticated']) eq((await q('select has_function_privilege($1, $2, $3) as r', [role, fn, 'execute']))[0].r, false, `${role} cannot execute ${fn}`);
    eq((await q('select has_function_privilege($1, $2, $3) as r', ['service_role', fn, 'execute']))[0].r, true, `service_role executes ${fn}`);
  }
  // …and an actual attempt as anon fails, not just the catalog answer.
  for (const attempt of ['select * from public.bobby_user_assets', `select public.bobby_memory_summary('${randomUUID()}', 'NVDA')`]) {
    const client = await pool.connect();
    try {
      await client.query('begin; set local role anon;');
      await assert.rejects(client.query(attempt), /permission denied/); checks++;
    } finally {
      await client.query('rollback').catch(() => {});
      client.release();
    }
  }

  // ---------- recording ----------
  const me = await account();
  eq(await record(me, 'NVDA', 'week'), true, 'an Apple/Google account records its first ask');
  const first = await row(me, 'NVDA');
  eq([first.asks, first.last_horizon], [1, 'week'], 'one ask, with the horizon the question named');
  eq(await record(me, 'NVDA', 'unspecified'), true, 'a second ask');
  const second = await row(me, 'NVDA');
  eq([second.asks, second.last_horizon], [2, 'unspecified'], 'asks + 1 and the last horizon replaced');
  eq(second.first_asked_at.getTime(), first.first_asked_at.getTime(), 'first_asked_at never moves');
  ok(second.last_asked_at.getTime() >= first.last_asked_at.getTime(), 'last_asked_at moves forward');
  eq(await record(me, 'BTC', 'sometime'), true, 'an unknown horizon is stored as unspecified');
  eq((await row(me, 'BTC')).last_horizon, 'unspecified', '…unspecified');
  const racer = await account();
  await Promise.all(Array.from({ length: 10 }, () => record(racer, 'ETH', 'intraday')));
  eq((await row(racer, 'ETH')).asks, 10, 'ten parallel asks count ten');

  // ---------- no memory without an account, or with it paused ----------
  const w = await wallet();
  eq(await record(w, 'NVDA', 'week'), false, 'a wallet-only identity is never recorded');
  eq(await count(w), 0, '…and has no rows');
  eq((await summary(w, 'NVDA')).enabled, false, 'a wallet-only identity has no memory');
  eq(await record(null, 'NVDA', 'week'), false, 'no identity: nothing');
  eq(await record(randomUUID(), 'NVDA', 'week'), false, 'an unknown identity: nothing');
  eq((await summary(null, 'NVDA')).enabled, false, 'no identity: memory off');
  for (const bad of ['nvda', 'NVDA; drop table x', 'A'.repeat(21), '']) eq(await record(me, bad, 'week'), false, `a malformed symbol is refused: ${JSON.stringify(bad)}`);
  eq(await count(me), 2, 'only the two real assets are stored');

  await q('insert into public.bobby_user_prefs(identity_id, memory_enabled) values ($1, false)', [me]);
  eq(await record(me, 'NVDA', 'long'), false, 'a paused memory records nothing');
  eq((await row(me, 'NVDA')).asks, 2, '…the count does not move');
  const paused = await summary(me, 'NVDA');
  eq([paused.enabled, paused.top, paused.thisAsset], [false, [], null], 'a paused memory is not read either');
  await q('update public.bobby_user_prefs set memory_enabled = true where identity_id = $1', [me]);
  eq(await record(me, 'NVDA', 'long'), true, 'switched back on, it records again');
  eq((await row(me, 'NVDA')).asks, 3, '…from where it was');

  // ---------- retention: 90 days ----------
  const old = await account();
  const other = await account();
  await seed(old, 'OLD', 9, 91);
  await seed(other, 'GONE', 4, 120);
  await seed(old, 'KEEP', 1, 89);
  const staleView = await summary(old, 'OLD');
  eq([staleView.thisAsset, staleView.top.map((a: any) => a.symbol)], [null, ['KEEP']], 'the summary never shows a row older than 90 days');
  eq(await record(old, 'NEW', 'week'), true, 'a new ask…');
  eq((await rows(old)).map((r) => r.symbol), ['KEEP', 'NEW'], '…sweeps this account\'s stale rows');
  eq(await count(other), 0, '…and stale rows of other accounts (bounded sweep)');

  // ---------- the cap: 50 per account, lowest decayed score first ----------
  const heavy = await account();
  for (let i = 1; i <= 55; i++) await seed(heavy, `S${String(i).padStart(2, '0')}`, i, 0);
  eq(await record(heavy, 'FRESH', 'week'), true, 'an ask over the cap');
  eq(await count(heavy), 50, 'never more than 50 assets');
  const kept = (await rows(heavy)).map((r) => r.symbol);
  ok(kept.includes('FRESH'), 'the asset just asked about always stays');
  eq(['S01', 'S02', 'S03', 'S04', 'S05', 'S06'].filter((s) => kept.includes(s)), [], 'the six least-asked go');
  ok(kept.includes('S07') && kept.includes('S55'), 'the rest stay');
  const decay = await account();
  for (let i = 1; i <= 48; i++) await seed(decay, `D${String(i).padStart(2, '0')}`, 5, 0);
  await seed(decay, 'STALE', 10, 80); // 10·e^(−80/30) ≈ 0.69
  await seed(decay, 'RARE', 1, 0); // 1·e^0 = 1
  eq(await record(decay, 'NOW', 'week'), true, 'an ask over the cap, with decay');
  const afterDecay = (await rows(decay)).map((r) => r.symbol);
  eq([afterDecay.length, afterDecay.includes('STALE'), afterDecay.includes('RARE')], [50, false, true], 'a frequent asset untouched for 80 days goes before a rare one asked today');

  // ---------- the summary ----------
  const reader = await account();
  await seed(reader, 'NVDA', 6, 1, 'week'); // 5.80
  await seed(reader, 'BTC', 10, 40); // 2.64
  await seed(reader, 'ETH', 3, 0, 'intraday'); // 3
  await seed(reader, 'SOL', 1, 0); // 1
  await seed(reader, 'AAPL', 2, 0); // 2
  await seed(reader, 'MSFT', 1, 10); // 0.72
  await seed(reader, 'TSLA', 40, 95); // stale
  await q("insert into public.bobby_user_prefs(identity_id, horizon, experience) values ($1, 'month', 'new')", [reader]);
  const s = await summary(reader, 'NVDA');
  eq(s.enabled, true, 'memory on by default');
  eq(s.prefs, { horizon: 'month', experience: 'new', risk: null }, 'only the preferences the person set');
  eq(s.top.map((a: any) => [a.symbol, a.asks]), [['NVDA', 6], ['ETH', 3], ['BTC', 10], ['AAPL', 2], ['SOL', 1]], 'top 5 by asks·e^(−days/30), stale rows out');
  ok(s.top.every((a: any) => typeof a.lastAskedAt === 'string' && typeof a.lastHorizon === 'string'), 'each with its last date and horizon');
  eq([s.thisAsset.asks, s.thisAsset.lastHorizon], [6, 'week'], 'the asked asset\'s own row');
  eq((await summary(reader, 'TSLA')).thisAsset, null, 'a stale asset is not "asked before"');
  eq((await summary(reader, 'DOGE')).thisAsset, null, 'a never-asked asset is null');
  const fresh = await summary(await account(), 'NVDA');
  eq([fresh.enabled, fresh.prefs, fresh.top, fresh.thisAsset], [true, { horizon: null, experience: null, risk: null }, [], null], 'a new account: memory on, nothing remembered');
  await assert.rejects(q("insert into public.bobby_user_prefs(identity_id, risk) values ($1, 'reckless')", [await account()])); checks++;
  await assert.rejects(q("insert into public.bobby_user_prefs(identity_id, horizon) values ($1, 'unspecified')", [await account()])); checks++;

  // ---------- forgetting ----------
  eq(await forget(reader, 'NVDA'), 1, 'forget one asset');
  eq((await rows(reader)).map((r) => r.symbol).includes('NVDA'), false, '…it is gone');
  eq(await count(reader), 6, '…the others stay');
  eq(await forget(reader, 'DOGE'), 0, 'forgetting an asset never asked about is a no-op');
  eq(await forget(reader), 6, 'forget everything');
  // "Second time this week": recorded asks keep their times (newest 20), the summary counts the last 7 days.
  const weekly = await account();
  await q("select public.bobby_memory_record($1, 'AMD', 'unspecified')", [weekly]);
  await q("select public.bobby_memory_record($1, 'AMD', 'week')", [weekly]);
  await q("update public.bobby_user_assets set recent_asks = recent_asks || (now() - interval '9 days') where identity_id = $1", [weekly]);
  const weekView = await summary(weekly, 'AMD');
  eq([weekView.thisAsset.asks, weekView.thisAsset.asksThisWeek], [2, 2], 'two asks this week; an older time is not counted');
  for (let i = 0; i < 25; i++) await q("select public.bobby_memory_record($1, 'AMD', 'unspecified')", [weekly]);
  eq((await q("select cardinality(recent_asks) as n from public.bobby_user_assets where identity_id = $1 and symbol = 'AMD'", [weekly]))[0].n, 20, 'at most 20 ask times are kept');
  eq([await count(reader), (await q('select count(*) from public.bobby_user_prefs where identity_id = $1', [reader]))[0].count], [0, '0'], '…assets and preferences');
  const pausedForget = await account();
  await seed(pausedForget, 'NVDA', 3, 0);
  await q("insert into public.bobby_user_prefs(identity_id, horizon, risk, memory_enabled) values ($1, 'long', 'low', false)", [pausedForget]);
  await forget(pausedForget);
  const keptSwitch = (await q('select horizon, experience, risk, memory_enabled from public.bobby_user_prefs where identity_id = $1', [pausedForget]))[0];
  eq([await count(pausedForget), keptSwitch], [0, { horizon: null, experience: null, risk: null, memory_enabled: false }], 'a paused memory stays paused after "forget everything", with nothing else kept');

  // ---------- deleting the identity (/api/account) ----------
  const leaving = await account();
  await record(leaving, 'NVDA', 'week');
  await q("insert into public.bobby_user_prefs(identity_id, horizon) values ($1, 'week')", [leaving]);
  await q('delete from public.bobby_identities where id = $1', [leaving]);
  eq([await count(leaving), (await q('select count(*) from public.bobby_user_prefs where identity_id = $1', [leaving]))[0].count], [0, '0'], 'deleting the identity deletes its memory');

  // ---------- idempotent over live data ----------
  const before = await count(me);
  await q(migration);
  eq(await count(me), before, 'a third run of the migration keeps every row');

  console.log(`user-memory-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
