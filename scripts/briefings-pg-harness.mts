// Local-PostgreSQL harness for the Bobby Pro briefings migration (20261002180000_pro_briefings.sql), shared by
// scripts/test-briefings-pg.mts and the worker/API/load PG tests.
//   · bootstrapBriefingsDb(url): a scratch database shaped like bobby-protocol for this feature — auth stubs,
//     api_cache, the anon/authenticated/service_role roles, Supabase's default ACLs (ALL to anon/authenticated while
//     the migrations run, so the feature's revokes are what a test sees), the minimal chain of real migrations that
//     provides bobby_identities, bobby_subscriptions, bobby_pro_grants, bobby_is_pro, bobby_user_prefs and
//     bobby_user_assets, then the briefings migration applied TWICE (idempotency).
//   · pgRpcTransport(pool): an RpcFn (api/_lib/briefings/db.ts) that calls the SQL functions the way PostgREST
//     does: named arguments, jsonb bodies JSON-encoded, arrays passed as arrays, the function's value returned
//     (a scalar boolean for bobby_is_pro, an object for jsonb). A database error becomes BriefingStorageError, as
//     a non-2xx PostgREST answer would.
// Local scratch databases only (127.0.0.1 / localhost / ::1): never a remote or production database.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { BriefingStorageError, type RpcFn } from '../api/_lib/briefings/db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase/bobby-protocol/supabase/migrations');
export const BRIEFINGS_MIGRATION = join(MIGRATIONS_DIR, '20261002180000_pro_briefings.sql');
export const BRIEFINGS_DEVICE_MIGRATION = join(MIGRATIONS_DIR, '20261002183000_brief_device_atomic.sql');
export const BRIEFINGS_SOURCE_GUARD_MIGRATION = join(MIGRATIONS_DIR, '20261002184500_brief_paid_source_guard.sql');
/**
 * The smallest chain of real migrations the briefings migration depends on, each with the object that proves it is
 * already applied (a shared cluster, e.g. CI after scripts/test-trader-land-growth.sql, may hold part of the chain).
 */
export const BASE_MIGRATIONS: ReadonlyArray<{ file: string; present: string }> = [
  { file: '20260903000005_bobby_progress.sql', present: "to_regclass('public.bobby_identities') is not null" },
  { file: '20260927120000_access_reads_subscriptions.sql', present: "to_regclass('public.bobby_subscriptions') is not null" },
  { file: '20260929150000_levels_referrals_usage.sql', present: "to_regclass('public.bobby_pro_grants') is not null" },
  { file: '20260929190000_user_memory.sql', present: "to_regclass('public.bobby_user_assets') is not null" },
  { file: '20260929200000_user_memory_price.sql',
    present: "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bobby_user_assets' and column_name = 'last_price')" },
];

export function assertLocalUrl(url: string): void {
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname)) {
    throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');
  }
}

/** A pool whose sessions run in UTC (like PostgREST), so timestamps serialize the same way. */
export function briefingsPool(url: string, max = 16): pg.Pool {
  assertLocalUrl(url);
  return new pg.Pool({ connectionString: url, max, options: '-c timezone=UTC' });
}

const createRole = (name: string, attrs = '') => `do $$ begin create role ${name} ${attrs};
  exception when duplicate_object or unique_violation then null; end $$;`;

/** Prepare (or re-prepare) the scratch database at `url` and return a pool on it. Safe to call concurrently. */
export async function bootstrapBriefingsDb(url: string): Promise<pg.Pool> {
  const pool = briefingsPool(url);
  const c = await pool.connect();
  try {
    // One bootstrap at a time per database (several test processes may share it).
    await c.query('select pg_advisory_lock(hashtext($1))', ['bobby_briefings_harness']);
    await c.query('set client_min_messages = warning');
    // Roles are cluster-wide; production's service_role bypasses RLS.
    await c.query(createRole('anon'));
    await c.query(createRole('authenticated'));
    await c.query(createRole('service_role', 'bypassrls'));
    await c.query(`create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key, created_at timestamptz not null default now());
      create table if not exists auth.identities (user_id uuid not null references auth.users(id), provider text not null);
      create table if not exists public.api_cache (cache_key text primary key, payload jsonb, expires_at timestamptz, updated_at timestamptz default now());`);
    // Supabase's default ACLs: every new table/function is granted to anon and authenticated.
    await c.query(`alter default privileges in schema public grant all on tables to anon, authenticated;
      alter default privileges in schema public grant all on functions to anon, authenticated;
      alter default privileges in schema public grant all on sequences to anon, authenticated;`);
    try {
      for (const m of BASE_MIGRATIONS) {
        const { rows } = await c.query(`select ${m.present} as present`);
        if (!rows[0].present) await c.query(readFileSync(join(MIGRATIONS_DIR, m.file), 'utf8'));
      }
      // Supabase grants table access to service_role; RLS (and our revokes) do the rest.
      await c.query('grant usage on schema public to service_role; grant all on all tables in schema public to service_role;');
      const sql = readFileSync(BRIEFINGS_MIGRATION, 'utf8');
      await c.query(sql);
      await c.query(sql); // idempotent
      const deviceSql = readFileSync(BRIEFINGS_DEVICE_MIGRATION, 'utf8');
      await c.query(deviceSql);
      await c.query(deviceSql); // idempotent
      const sourceGuardSql = readFileSync(BRIEFINGS_SOURCE_GUARD_MIGRATION, 'utf8');
      await c.query(sourceGuardSql);
      await c.query(sourceGuardSql); // idempotent
    } finally {
      await c.query(`alter default privileges in schema public revoke all on tables from anon, authenticated;
        alter default privileges in schema public revoke all on functions from anon, authenticated;
        alter default privileges in schema public revoke all on sequences from anon, authenticated;`);
    }
  } finally {
    await c.query('select pg_advisory_unlock(hashtext($1))', ['bobby_briefings_harness']).catch(() => {});
    c.release();
  }
  return pool;
}

interface Signature { args: Array<{ name: string; type: string }> }

async function loadSignatures(pool: pg.Pool): Promise<Map<string, Signature>> {
  const { rows } = await pool.query(`
    select p.proname as name,
           coalesce(array(select a.n from unnest(p.proargnames) with ordinality a(n, i) order by i), '{}') as names,
           coalesce(array(select format_type(t.oid, null) from unnest(p.proargtypes::oid[]) with ordinality t(oid, i) order by i), '{}') as types
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (p.proname like 'bobby\\_brief\\_%' or p.proname like 'bobby\\_push\\_device\\_%' or p.proname = 'bobby_is_pro')`);
  const map = new Map<string, Signature>();
  for (const r of rows as Array<{ name: string; names: string[]; types: string[] }>) {
    if (map.has(r.name)) throw new Error(`overloaded function ${r.name}: the transport needs one signature per name`);
    map.set(r.name, { args: r.types.map((type, i) => ({ name: r.names[i], type })) });
  }
  return map;
}

const sigCache = new WeakMap<pg.Pool, Promise<Map<string, Signature>>>();

/** PostgREST-like rpc transport over a local pool. Unknown function or argument → throws (as PostgREST answers 404). */
export function pgRpcTransport(pool: pg.Pool): RpcFn {
  return async (name, body) => {
    let sigs = sigCache.get(pool);
    if (!sigs) { sigs = loadSignatures(pool); sigCache.set(pool, sigs); }
    const sig = (await sigs).get(name);
    if (!sig) throw new BriefingStorageError(name, 404);
    const known = new Set(sig.args.map((a) => a.name));
    for (const key of Object.keys(body)) if (!known.has(key)) throw new BriefingStorageError(name, 404);
    const parts: string[] = [];
    const values: unknown[] = [];
    for (const a of sig.args) {
      if (!(a.name in body)) continue; // a default (or PG's "missing argument" error, like PostgREST)
      const v = body[a.name];
      values.push(a.type === 'jsonb' || a.type === 'json' ? (v === null || v === undefined ? null : JSON.stringify(v)) : v ?? null);
      parts.push(`${a.name} => $${values.length}::${a.type}`);
    }
    try {
      const { rows } = await pool.query(`select public.${name}(${parts.join(', ')}) as r`, values);
      return rows[0]?.r ?? null;
    } catch (e) {
      const code = String((e as { code?: string }).code ?? '');
      throw Object.assign(new BriefingStorageError(name, code.startsWith('22') ? 400 : code.startsWith('23') ? 409 : 500), { cause: e });
    }
  };
}

/** A Supabase account identity; paid Pro uses SYNTHETIC local subscription/payment evidence when asked. */
export async function makeIdentity(pool: pg.Pool, opts: { pro?: boolean } = {}): Promise<string> {
  const { rows } = await pool.query('insert into public.bobby_identities (auth_user_id) values (gen_random_uuid()) returning id');
  const id = rows[0].id as string;
  if (opts.pro) await setPro(pool, id, true);
  return id;
}

/** Pro on: synthetic active paid production period. Fixtures are not proof of any real billing integration. */
export async function setPro(pool: pg.Pool, identityId: string, pro: boolean): Promise<void> {
  if (pro) {
    await pool.query(`insert into public.bobby_subscriptions (identity_id, provider, status, product_id, current_period_end)
      values ($1, 'apple', 'active', 'qa.synthetic.pro.monthly', now() + interval '30 days')
      on conflict (identity_id) do update set provider = excluded.provider, status = excluded.status,
        product_id = excluded.product_id, current_period_end = excluded.current_period_end, updated_at = now()`, [identityId]);
    await pool.query(`insert into public.bobby_brief_paid_periods
      (identity_id, provider, product_id, period_start, period_end, environment, period_type, paid_amount, currency,
       proof_source, proof_id, proof_sha256, verification_state, verified_at)
      select identity_id, provider, product_id, now() - interval '1 hour', current_period_end,
        'production', 'normal', 4.99, 'USD', 'revenuecat', 'qa.synthetic.payment', repeat('a', 64), 'confirmed', now()
      from public.bobby_subscriptions where identity_id = $1
      on conflict (identity_id) do update set provider = excluded.provider, product_id = excluded.product_id,
        period_start = excluded.period_start, period_end = excluded.period_end, environment = excluded.environment,
        period_type = excluded.period_type, paid_amount = excluded.paid_amount, currency = excluded.currency,
        proof_source = excluded.proof_source, proof_id = excluded.proof_id, proof_sha256 = excluded.proof_sha256,
        verification_state = excluded.verification_state, verified_at = excluded.verified_at, updated_at = now()`, [identityId]);
  } else {
    await pool.query('delete from public.bobby_brief_paid_periods where identity_id = $1', [identityId]);
    await pool.query('delete from public.bobby_pro_grants where identity_id = $1', [identityId]);
    await pool.query('delete from public.bobby_subscriptions where identity_id = $1', [identityId]);
  }
}
