// Final audit 2026-09-03 — P0-1 / P0-2 / C-04 against a real Postgres.
// Rebuilds the vulnerable policies exactly as 20260903000004 ships them,
// proves the anon read WORKS (the exploit), applies migration 0010, and
// proves it no longer does — then checks the shaped views and the merge RPC.
//
//   DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:rls-lockdown-pg
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

// Audit mode: validate the remediated schema without exercising the old exposure.
const postfixOnly = process.argv.includes('--postfix-only');
const url = process.env.DATABASE_URL;
if (!url) { console.log('test-rls-lockdown-pg: skipped (set DATABASE_URL to a scratch Postgres)'); process.exit(0); }
{
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host) && process.env.SWAP_LEDGER_PG_ALLOW_REMOTE !== '1') {
    console.error(`test-rls-lockdown-pg: refusing non-local DATABASE_URL host "${host}"`); process.exit(2);
  }
}
const pool = new pg.Pool({ connectionString: url, max: 2 });
const S = `rls_test_${Date.now()}`;
const q = (sql: string) => sql.replaceAll('public.', `${S}.`).replaceAll('set search_path = public, pg_catalog', `set search_path = ${S}, pg_catalog`).replaceAll('S.', `${S}.`).replaceAll('S__', S);
const migration = q(readFileSync('supabase/bobby-protocol/supabase/migrations/20260903000010_lock_down_public_reads.sql', 'utf8'));

// Stand-ins: the columns the views and the RPC touch, plus the identifiers the audit is about.
const FIXTURE = `
create table S.api_cache (cache_key text primary key, payload jsonb, expires_at timestamptz, updated_at timestamptz);
create table S.agent_trades (id uuid primary key default gen_random_uuid(), cycle_id uuid, chain text, token_address text, token_symbol text, direction text,
  amount_usd numeric, entry_price numeric, stop_price numeric, target_price numeric, exit_price numeric, status text, outcome text, realized_pnl_pct numeric,
  llm_reasoning text, confidence numeric, signal_sources text[], created_at timestamptz default now(), settled_at timestamptz, expires_at timestamptz,
  user_id uuid, owner_address text, tx_hash text, intent_hash text, idempotency_key text, cio_signature text, arbiter_signature text);
create table S.agent_cycles (id uuid primary key default gen_random_uuid(), started_at timestamptz default now(), completed_at timestamptz, status text, error text,
  signals_found int, signals_filtered int, llm_decisions int, trades_executed int, trades_blocked int, trades_successful int, total_usd_deployed numeric,
  latency_ms int, llm_model text, llm_reasoning text, mood text, dynamic_conviction numeric, safe_mode_active boolean, vibe_phrase text, idle_cash_usd numeric,
  yield_debate_triggered boolean, user_id uuid, owner_address text, state jsonb, idempotency_key text, cost_usd numeric);
create table S.bobby_identities (id uuid primary key default gen_random_uuid(), auth_user_id uuid, wallet_address text, email text, provider text, last_seen_at timestamptz);
create table S.bobby_progress (identity_id uuid primary key references S.bobby_identities(id) on delete cascade, xp int default 0, aura int default 0, route_index int default 0, streak int default 0, last_day date, daily_awards int default 0, daily_awards_day date, updated_at timestamptz);
create table S.bobby_progress_events (id serial primary key, identity_id uuid, awarded int default 0, aura int default 0, day_key date default current_date);
create table S.tl_items (id uuid primary key default gen_random_uuid(), route_index int);
create table S.tl_inventory (id serial primary key, identity_id uuid, item_id uuid, source text);
create table S.tl_placements (id serial primary key, identity_id uuid);
create table S.tl_lands (id serial primary key, identity_id uuid);
create table S.bobby_pre_calls (id serial primary key, identity_id uuid);
create table S.bobby_swap_receipts (id uuid primary key default gen_random_uuid(), identity_id uuid references S.bobby_identities(id) on delete set null, wallet_address text);
-- the policies exactly as 20260903000004 ships them (the vulnerable state)
alter table S.api_cache enable row level security;
create policy api_cache_anon_read on S.api_cache for select to authenticated, anon using (expires_at > now());
alter table S.agent_trades enable row level security;
create policy agent_trades_public_read on S.agent_trades for select to authenticated, anon using (true);
alter table S.agent_cycles enable row level security;
create policy agent_cycles_public_read on S.agent_cycles for select to authenticated, anon using (true);
grant usage on schema S__ to anon, authenticated, service_role;
grant select on all tables in schema S__ to anon, authenticated;
grant all on all tables in schema S__ to service_role;
grant all on all sequences in schema S__ to service_role;
`;

const c = await pool.connect();
try {
  await c.query(`do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then create role anon noinherit; end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated noinherit; end if;
    if not exists (select from pg_roles where rolname = 'service_role') then create role service_role noinherit bypassrls; end if;
  end $$;`);
  await c.query(`create schema ${S}`);
  await c.query(`set search_path to ${S}, public`);
  await c.query(q(FIXTURE));
  const keep = (await c.query(q(`insert into S.bobby_identities (wallet_address) values ('0xkeep') returning id`))).rows[0].id;
  const merge = (await c.query(q(`insert into S.bobby_identities (auth_user_id, email) values (gen_random_uuid(), 'm@x') returning id`))).rows[0].id;
  await c.query(q(`insert into S.api_cache values ('identity-link:K7QW2M', '{"identity":"${merge}","via":"apple"}', now() + interval '10 minutes', now())`));
  await c.query(q(`insert into S.agent_trades (token_symbol, direction, amount_usd, owner_address, tx_hash) values ('NVDAc','BUY',100,'0xvictim','0xhash'), ('AAPLc','BUY',50,null,null)`));
  await c.query(q(`insert into S.agent_cycles (status, owner_address, user_id) values ('completed','0xvictim',gen_random_uuid()), ('completed',null,null)`));
  await c.query(q(`insert into S.bobby_swap_receipts (identity_id, wallet_address) values ('${merge}', '0xkeep')`));

  const asAnon = async (sql: string) => { await c.query('set role anon'); try { return await c.query(q(sql)); } finally { await c.query('reset role'); } };
  // Autocommit throughout, so a refused SELECT aborts nothing — no savepoint needed.
  const denied = async (sql: string, label: string) => {
    try { await asAnon(sql); } catch (e: any) { if (e.code !== '42501' && e.code !== '42703') throw e; return e.code; }
    assert.fail(`${label}: anon read still succeeds`);
  };

  // 1. Optional historical baseline; remediation-only audits skip these reads.
  if (!postfixOnly) {
    assert.equal((await asAnon(`select cache_key, payload from S.api_cache`)).rows[0].cache_key, 'identity-link:K7QW2M', 'pre-fix: anon reads the live pairing code');
    assert.equal((await asAnon(`select owner_address from S.agent_trades where owner_address is not null`)).rows[0].owner_address, '0xvictim', 'pre-fix: anon reads owner_address + PnL rows');
    assert.equal((await asAnon(`select owner_address from S.agent_cycles where owner_address is not null`)).rows.length, 1);
    console.log('exploit reproduced on the pre-fix policies (api_cache, agent_trades, agent_cycles readable by anon)');
  }

  // 2. Apply the remediation.
  await c.query('begin');
  await c.query(migration);
  await c.query('commit');

  // Check effective privileges, including inherited PUBLIC grants, for both
  // browser roles. The privileged merge must remain service-only.
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['api_cache', 'agent_trades', 'agent_cycles']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const check = await c.query('select has_table_privilege($1, $2, $3) as allowed', [role, `${S}.${table}`, privilege]);
        assert.equal(check.rows[0].allowed, false, `${role} has ${privilege} on ${table}`);
      }
    }
    const mergeCheck = await c.query('select has_function_privilege($1, $2, $3) as allowed', [role, `${S}.bobby_link_identities(uuid,uuid)`, 'EXECUTE']);
    assert.equal(mergeCheck.rows[0].allowed, false, `${role} can execute identity merge`);
    for (const view of ['agent_trades_public', 'agent_cycles_public']) {
      const viewCheck = await c.query('select has_table_privilege($1, $2, $3) as allowed', [role, `${S}.${view}`, 'SELECT']);
      assert.equal(viewCheck.rows[0].allowed, true, `${role} cannot read ${view}`);
    }
  }
  console.log('post-migration effective privileges: both browser roles blocked from private tables and merge RPC; public views readable');

  // 3. The same reads are refused.
  assert.equal(await denied(`select cache_key from S.api_cache`, 'P0-1'), '42501');
  assert.equal(await denied(`select owner_address from S.agent_trades`, 'P0-2'), '42501');
  assert.equal(await denied(`select owner_address from S.agent_cycles`, 'agent_cycles'), '42501');
  console.log('P0-1 / P0-2: anon SELECT on api_cache, agent_trades, agent_cycles → 42501 permission denied');

  // 4. The shaped views: protocol rows only, no identifier columns.
  const tv = await asAnon(`select * from S.agent_trades_public`);
  assert.equal(tv.rows.length, 1); assert.equal(tv.rows[0].token_symbol, 'AAPLc');
  for (const col of ['owner_address', 'user_id', 'tx_hash', 'intent_hash', 'idempotency_key', 'cio_signature', 'arbiter_signature']) assert.ok(!(col in tv.rows[0]), `${col} leaked through agent_trades_public`);
  const cv = await asAnon(`select * from S.agent_cycles_public`);
  assert.equal(cv.rows.length, 1);
  for (const col of ['owner_address', 'user_id', 'state', 'idempotency_key', 'cost_usd']) assert.ok(!(col in cv.rows[0]), `${col} leaked through agent_cycles_public`);
  console.log('views: anon sees protocol rows only, and no owner_address / user_id / hashes / signatures');

  // 5. Service role still reads the base tables (the server is unaffected).
  await c.query('set role service_role');
  assert.equal((await c.query(q(`select count(*)::int as n from S.agent_trades`))).rows[0].n, 2);
  await c.query('reset role');

  // 6. C-04: the merge re-parents receipts before deleting the merged identity.
  await c.query('set role service_role');
  await c.query(q(`select S.bobby_link_identities('${keep}', '${merge}')`));
  await c.query('reset role');
  const r = await c.query(q(`select identity_id from S.bobby_swap_receipts`));
  assert.equal(r.rows[0].identity_id, keep, 'C-04: receipt follows the kept identity');
  assert.equal((await c.query(q(`select count(*)::int as n from S.bobby_identities where id = '${merge}'`))).rows[0].n, 0, 'merged identity is gone');
  console.log('C-04: bobby_link_identities re-parents bobby_swap_receipts (no orphan)');

  console.log('rls lock-down (Postgres) tests passed');
} catch (e) {
  try { await c.query('rollback'); } catch { /* nothing open */ }
  throw e;
} finally {
  try { await c.query('reset role'); } catch { /* ignore */ }
  await c.query(`drop schema if exists ${S} cascade`);
  c.release();
  await pool.end();
}
