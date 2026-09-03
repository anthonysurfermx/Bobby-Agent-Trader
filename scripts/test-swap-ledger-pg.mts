// Real-Postgres test of the swap ledger functions in migration
// 20260903000009 — the PL/pgSQL, not its TypeScript spec: FIFO in chain
// order, partial sells, out-of-order receipts, idempotent confirm, and
// concurrent confirms that must never over-consume a lot.
//
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
//     npx tsx scripts/test-swap-ledger-pg.mts
//
// Needs a scratch database (supabase start, or any Postgres 15+). It creates
// minimal stand-ins for agent_cycles / agent_trades / bobby_identities when
// they are missing, applies the migration, runs, and rolls everything back
// inside one transaction per scenario (the concurrency scenario commits into
// a throwaway schema and drops it).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.log('test-swap-ledger-pg: skipped (set DATABASE_URL to a scratch Postgres)');
  process.exit(0);
}
const pool = new pg.Pool({ connectionString: url, max: 4 });
const migration = readFileSync('supabase/bobby-protocol/supabase/migrations/20260903000009_swap_receipts.sql', 'utf8');
const schema = `ledger_test_${Date.now()}`;

const FIXTURE = `
create table if not exists public.bobby_identities (id uuid primary key default gen_random_uuid());
create table if not exists public.agent_cycles (id uuid primary key default gen_random_uuid(), trades_executed integer default 0, total_usd_deployed numeric default 0);
create table if not exists public.agent_trades (
  id uuid primary key default gen_random_uuid(), cycle_id uuid, chain text, token_address text, token_symbol text, direction text,
  amount_usd numeric, entry_price numeric, exit_price numeric, tx_hash text, status text, llm_reasoning text, confidence numeric,
  signal_sources text[], created_at timestamptz default now(), stop_price numeric, target_price numeric, outcome text,
  realized_pnl_pct numeric, settled_at timestamptz, expires_at timestamptz, user_id uuid, owner_address text, idempotency_key text
);
create unique index if not exists agent_trades_idem_uidx on public.agent_trades (idempotency_key) where idempotency_key is not null;
`;

async function withClient<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try { return await fn(c); } finally { c.release(); }
}

const wallet = '0x' + 'ab'.repeat(20);
async function built(c: pg.PoolClient, calldataHash: string, tokenIn: string, tokenOut: string) {
  await c.query(`insert into public.bobby_swap_receipts (wallet_address, router_address, token_in_address, token_out_address, token_in_symbol, token_out_symbol, amount_in_raw, quoted_out_raw, min_amount_out_raw, route, calldata_hash, deadline)
    values ($1,'0xrouter','0xin','0xout',$2,$3,1,1,1,'direct',$4, now() + interval '20 minutes')`, [wallet, tokenIn, tokenOut, calldataHash]);
}
async function confirm(c: pg.PoolClient, o: { hash: string; calldata: string; direction: 'BUY' | 'SELL'; symbol: string; usd: number; price: number; units: number; block: number; idx: number }) {
  const r = await c.query(`select public.confirm_swap_receipt($1,$2,$3,$4,now(),1,1,null,'web',$5,'0xtoken',$6,$7,$8,$9,$10) as out`,
    [wallet, o.calldata, o.hash, o.block, o.symbol, o.direction, o.usd, o.price, o.units, o.idx]);
  return r.rows[0].out as { outcome: string; trade_id?: string };
}
async function lots(c: pg.PoolClient, symbol: string) {
  const r = await c.query(`select id, direction, units, units_remaining, entry_price, exit_price, realized_pnl_pct, outcome, settled_at, block_number, tx_index from public.agent_trades where owner_address=$1 and token_symbol=$2 order by block_number, tx_index`, [wallet, symbol]);
  return r.rows;
}

await withClient(async (c) => {
  await c.query(`create schema ${schema}`);
  await c.query(`set search_path to ${schema}, public`);
});

try {
  // Scenario 1: two 1-unit lots, one 1-unit sell → only the oldest lot closes; sell fully matched; no double counting.
  await withClient(async (c) => {
    await c.query('begin'); await c.query(`set local search_path to ${schema}`);
    await c.query(FIXTURE.replaceAll('public.', `${schema}.`)); await c.query(migration.replaceAll('public.', `${schema}.`));
    await built(c, 'c1', 'USDC', 'NVDAc'); await built(c, 'c2', 'USDC', 'NVDAc'); await built(c, 'c3', 'NVDAc', 'USDC');
    assert.equal((await confirm(c, { hash: '0x01', calldata: 'c1', direction: 'BUY', symbol: 'NVDAc', usd: 100, price: 100, units: 1, block: 10, idx: 0 })).outcome, 'confirmed');
    assert.equal((await confirm(c, { hash: '0x02', calldata: 'c2', direction: 'BUY', symbol: 'NVDAc', usd: 120, price: 120, units: 1, block: 11, idx: 0 })).outcome, 'confirmed');
    assert.equal((await confirm(c, { hash: '0x03', calldata: 'c3', direction: 'SELL', symbol: 'NVDAc', usd: 110, price: 110, units: 1, block: 12, idx: 0 })).outcome, 'confirmed');
    const rows = await lots(c, 'NVDAc');
    const [a, b, s] = rows;
    assert.equal(Number(a.units_remaining), 0, 'oldest lot consumed'); assert.equal(a.outcome, 'win');
    assert.equal(Number(b.units_remaining), 1, 'second lot untouched'); assert.equal(b.outcome, null);
    assert.equal(Number(s.units_remaining), 0, 'sell fully matched'); assert.equal(Number(s.entry_price), 100); assert.equal(s.outcome, 'win');
    const fills = await c.query(`select count(*)::int as n from ${schema}.bobby_lot_fills`); assert.equal(fills.rows[0].n, 1);
    // idempotent re-confirm
    assert.equal((await confirm(c, { hash: '0x03', calldata: 'c3', direction: 'SELL', symbol: 'NVDAc', usd: 110, price: 110, units: 1, block: 12, idx: 0 })).outcome, 'already');
    assert.equal((await c.query(`select count(*)::int as n from ${schema}.bobby_lot_fills`)).rows[0].n, 1, 'replay adds nothing');
    await c.query('rollback');
    console.log('scenario 1 ok: one sell settles one lot, idempotent');
  });

  // Scenario 2: out-of-order receipts — SELL confirmed before its earlier-on-chain BUY.
  await withClient(async (c) => {
    await c.query('begin'); await c.query(`set local search_path to ${schema}`);
    await c.query(FIXTURE.replaceAll('public.', `${schema}.`)); await c.query(migration.replaceAll('public.', `${schema}.`));
    await built(c, 'c1', 'USDC', 'NVDAc'); await built(c, 'c2', 'NVDAc', 'USDC');
    await confirm(c, { hash: '0x02', calldata: 'c2', direction: 'SELL', symbol: 'NVDAc', usd: 55, price: 110, units: 0.5, block: 20, idx: 3 });
    let rows = await lots(c, 'NVDAc');
    assert.equal(Number(rows[0].units_remaining), 0.5, 'sell unmatched while the buy receipt is missing');
    await confirm(c, { hash: '0x01', calldata: 'c1', direction: 'BUY', symbol: 'NVDAc', usd: 100, price: 100, units: 1, block: 10, idx: 0 });
    rows = await lots(c, 'NVDAc');
    const buy = rows.find((r) => r.direction === 'BUY')!; const sell = rows.find((r) => r.direction === 'SELL')!;
    assert.equal(Number(buy.units_remaining), 0.5, 'late buy consumed by the earlier-recorded sell (partial)');
    assert.equal(buy.outcome, null, 'partially consumed lot is still open');
    assert.equal(Number(sell.units_remaining), 0); assert.equal(sell.outcome, 'win'); assert.equal(Number(sell.entry_price), 100);
    // A sell EARLIER on-chain than every lot never matches.
    await built(c, 'c3', 'NVDAc', 'USDC');
    await confirm(c, { hash: '0x03', calldata: 'c3', direction: 'SELL', symbol: 'NVDAc', usd: 10, price: 100, units: 0.1, block: 5, idx: 0 });
    rows = await lots(c, 'NVDAc');
    assert.equal(Number(rows[0].units_remaining), 0.1, 'sell before any lot stays unmatched'); assert.equal(rows[0].outcome, null);
    await c.query('rollback');
    console.log('scenario 2 ok: out-of-order receipts converge, chain order respected');
  });

  // Scenario 3: concurrency — two sells confirmed at once against one 1-unit lot; matched total must not exceed the lot.
  await withClient(async (setup) => {
    await setup.query(`set search_path to ${schema}`);
    await setup.query(FIXTURE.replaceAll('public.', `${schema}.`)); await setup.query(migration.replaceAll('public.', `${schema}.`));
    await built(setup, 'c1', 'USDC', 'NVDAc'); await built(setup, 'c2', 'NVDAc', 'USDC'); await built(setup, 'c3', 'NVDAc', 'USDC');
    await confirm(setup, { hash: '0x01', calldata: 'c1', direction: 'BUY', symbol: 'NVDAc', usd: 100, price: 100, units: 1, block: 10, idx: 0 });
  });
  await Promise.all([
    withClient(async (c) => { await c.query(`set search_path to ${schema}`); await confirm(c, { hash: '0x02', calldata: 'c2', direction: 'SELL', symbol: 'NVDAc', usd: 77, price: 110, units: 0.7, block: 11, idx: 0 }); }),
    withClient(async (c) => { await c.query(`set search_path to ${schema}`); await confirm(c, { hash: '0x03', calldata: 'c3', direction: 'SELL', symbol: 'NVDAc', usd: 77, price: 110, units: 0.7, block: 12, idx: 0 }); }),
  ]);
  await withClient(async (c) => {
    await c.query(`set search_path to ${schema}`);
    const rows = await lots(c, 'NVDAc');
    const matched = (await c.query(`select coalesce(sum(units),0)::float as u from ${schema}.bobby_lot_fills`)).rows[0].u;
    assert.equal(matched, 1, 'concurrent sells matched exactly the lot, never more');
    const unmatched = rows.filter((r) => r.direction === 'SELL').reduce((s, r) => s + Number(r.units_remaining), 0);
    assert.equal(Number(unmatched.toFixed(9)), 0.4, 'the remainder stays unmatched');
    console.log('scenario 3 ok: concurrent confirms never over-consume a lot');
  });
  console.log('swap ledger (Postgres) tests passed');
} finally {
  await withClient(async (c) => { await c.query(`drop schema if exists ${schema} cascade`); });
  await pool.end();
}
