// Real PostgreSQL migration + actual uploader with local HTTP interception. Never touches a store or Amplitude.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url || !['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) {
  throw new Error('DATABASE_URL must point to an empty local scratch PostgreSQL database');
}
process.env.BOBBY_SUPABASE_URL = 'https://billing-db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'billing-test-service';
process.env.AMPLITUDE_API_KEY = 'billing-test-ingestion';
const { toAmplitudePurchase, runAmplitudeBilling } = await import('../api/_lib/amplitude-billing.ts');
const { runAmplitude } = await import('../api/_lib/amplitude.ts');
const pool = new pg.Pool({ connectionString: url });
let checks = 0;
const eq = (got: unknown, want: unknown, name: string) => { assert.deepEqual(got, want, name); checks++; };
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
const rpc = async (name: string, args: unknown[] = []) => {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role service_role');
    const result = await client.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as r`, args);
    await client.query('commit');
    return result.rows[0].r;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
};
const USER = '1ac01111-0000-4000-8000-000000000001';
const AUTH_USER = 'ac011111-0000-4000-8000-000000000002';
const TEAM = '1ac01111-0000-4000-8000-000000000003';
const migrationDir = 'supabase/bobby-protocol/supabase/migrations';
const migration = readdirSync(migrationDir).find((name) => name.endsWith('_amplitude_billing_export.sql'))!;
const batch = () => rpc('bobby_amplitude_purchase_batch', [500]);
const ids = async () => (await batch()).map((row: any) => row.id);
const purchase = async (id: string, opts: { environment?: string | null; identity?: string | null; type?: string; usd?: number; age?: number; eventAge?: number } = {}) => {
  await pool.query(`insert into public.bobby_purchase_events
    (id,type,environment,identity_id,store,product_id,price_usd,takehome,currency,price_local,created_at,event_at)
    values ($1,$2,$3,$4,'APP_STORE','bobby.pro.monthly',$5,0.7,'MXN',99,
      now()-make_interval(mins=>$6),now()-make_interval(mins=>$7))`,
  [id, opts.type ?? 'INITIAL_PURCHASE', 'environment' in opts ? opts.environment : 'PRODUCTION',
    'identity' in opts ? opts.identity : USER, opts.usd ?? 5.406, opts.age ?? 20, opts.eventAge ?? 20]);
};
let uploads: Array<{ endpoint: string; payload: any }> = [];
let uploadStatus = 200, ackFails = false, storageCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const endpoint = String(input);
  const payload = JSON.parse(String(init?.body ?? '{}'));
  if (endpoint === 'https://api2.amplitude.com/batch' || endpoint === 'https://api.eu.amplitude.com/batch') {
    uploads.push({ endpoint, payload });
    return new Response(JSON.stringify({ echo: 'billing-test-ingestion' }), { status: uploadStatus });
  }
  if (!endpoint.startsWith('https://billing-db.test/rest/v1/rpc/')) throw new Error('Unexpected external request');
  storageCalls++;
  const name = endpoint.split('/').at(-1)!;
  if (name === 'bobby_amplitude_purchase_ack' && ackFails) return new Response('{}', { status: 500 });
  if (name === 'bobby_amplitude_batch') return Response.json({ cursor: 0, last: null, scanned: 0, events: [] });
  const result = await rpc(name, name === 'bobby_amplitude_purchase_ack' ? [payload.p_ids] : [payload.p_limit]);
  return result === null ? new Response(null, { status: 204 }) : Response.json(result);
}) as typeof fetch;

try {
  // Only the existing tables/columns used by the new migration; no application schema or production data.
  await pool.query(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
    end $$;
    create table public.bobby_identities(id uuid primary key, auth_user_id uuid, internal boolean not null default false);
    create table public.bobby_purchase_events(
      id text primary key, type text not null, environment text, store text, product_id text,
      price_usd numeric, takehome numeric, currency text, price_local numeric,
      identity_id uuid references public.bobby_identities(id) on delete set null,
      event_at timestamptz not null default now(), created_at timestamptz not null default now());
    create function public.bobby_internal_identity_ids() returns setof uuid language sql stable security invoker
      as $$ select id from public.bobby_identities where internal $$;
    grant select on public.bobby_identities, public.bobby_purchase_events to service_role;
    revoke all on function public.bobby_internal_identity_ids() from public, anon, authenticated;
    grant execute on function public.bobby_internal_identity_ids() to service_role;`);
  await pool.query('insert into public.bobby_identities values ($1,$2,false), ($3,null,true)', [USER, AUTH_USER, TEAM]);
  const sql = readFileSync(`${migrationDir}/${migration}`, 'utf8');
  await pool.query(sql);
  await pool.query(sql); // repeatable migration
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['select', 'insert', 'update', 'delete']) {
      eq((await q('select has_table_privilege($1,$2,$3) as r', [role, 'public.bobby_amplitude_purchase_exports', privilege]))[0].r, false, `${role} cannot ${privilege} receipts`);
    }
    for (const signature of ['public.bobby_amplitude_purchase_batch(integer)', 'public.bobby_amplitude_purchase_ack(text[])']) {
      eq((await q('select has_function_privilege($1,$2,$3) as r', [role, signature, 'execute']))[0].r, false, `${role} cannot call billing RPC`);
    }
  }
  eq((await q("select relrowsecurity as r from pg_class where oid='public.bobby_amplitude_purchase_exports'::regclass"))[0].r, true, 'receipt RLS enabled');
  eq((await q("select bool_and(not prosecdef) as r from pg_proc where proname in ('bobby_amplitude_purchase_batch','bobby_amplitude_purchase_ack')"))[0].r, true, 'RPCs retain invoker privileges');

  await pool.query(`insert into public.bobby_purchase_events(id,type,environment,identity_id,created_at,event_at)
    select 'malformed-' || i, 'invalid event', 'PRODUCTION', $1, now()-interval '1 day', now()
    from generate_series(1,501) i`, [USER]);
  await purchase('live');
  await purchase('sandbox', { environment: 'SANDBOX' });
  await purchase('unknown', { environment: null });
  await purchase('lowercase', { environment: 'production' });
  await purchase('team', { identity: TEAM });
  await purchase('unlinked', { identity: null });
  await purchase('fresh', { age: 0 });
  await purchase('invalid-type', { type: 'bad type' });
  await purchase('infinite-date');
  await pool.query("update public.bobby_purchase_events set event_at='infinity'::timestamptz where id='infinite-date'");
  await purchase('infinite-created');
  await pool.query("update public.bobby_purchase_events set created_at='-infinity'::timestamptz where id='infinite-created'");
  eq(await ids(), ['live'], 'only old, linked, external, explicit production billing exports');
  eq(await ids(), ['live'], '501 malformed rows and infinite timestamps cannot starve a later valid purchase');
  await assert.rejects(purchase('live'), /duplicate key/); checks++;

  const row = (await batch())[0];
  const event = toAmplitudePurchase(row)!;
  eq(event.user_id, USER, 'same canonical Bobby identity as usage');
  eq(event.user_id === AUTH_USER, false, 'RevenueCat auth UUID is not the analytics user');
  eq(event.revenue, 5.406, 'USD gross amount');
  eq(event.currency, 'USD', 'local MXN value is not reported as USD revenue');
  eq(event.event_properties.local_currency, 'MXN', 'local currency remains explicit');
  eq(event.time, Date.parse(row.at), 'original billing time retained');
  eq(Object.keys(event).some((name) => ['ip', 'email', 'device_id', 'idfa', 'idfv'].includes(name)), false, 'no private or invented device fields');
  eq(toAmplitudePurchase({ ...row, environment: null }), null, 'mapper independently rejects unknown env');
  eq(toAmplitudePurchase({ ...row, environment: 'SANDBOX' }), null, 'mapper independently rejects sandbox');
  eq(toAmplitudePurchase({ ...row, identity: null }), null, 'mapper rejects missing identity');
  eq(toAmplitudePurchase({ ...row, identity: 'reader@example.com' }), null, 'mapper rejects email identity');
  eq(toAmplitudePurchase({ ...row, type: 'CANCELLATION', priceUsd: 5.406 })!.revenue, undefined, 'auto-renew disabled is not another charge');
  eq(toAmplitudePurchase({ ...row, type: 'CANCELLATION', priceUsd: -5.406 })!.revenue, -5.406, 'negative cancellation amount is a refund');
  eq(toAmplitudePurchase({ ...row, type: 'REFUND', priceUsd: -2 })!.revenueType, 'refund', 'partial refund sign and classification');
  eq(toAmplitudePurchase({ ...row, type: 'EXPIRATION' })!.revenue, undefined, 'expiration price is not collected again');
  eq(toAmplitudePurchase({ ...row, type: 'PRODUCT_CHANGE' })!.revenue, undefined, 'product change price is not collected again');
  eq(toAmplitudePurchase({ ...row, priceUsd: null })!.revenue, undefined, 'unknown conversion is not invented');
  eq(toAmplitudePurchase({ ...row, priceUsd: 0 })!.revenue, undefined, 'free trial has no paid revenue');

  uploadStatus = 500;
  await assert.rejects(runAmplitudeBilling(), (error: Error) => error.message === 'amplitude billing 500'); checks++;
  eq(await ids(), ['live'], 'failed upload leaves purchase pending');
  uploadStatus = 202;
  await assert.rejects(runAmplitudeBilling(), /amplitude billing 202/); checks++;
  eq(await ids(), ['live'], 'unconfirmed asynchronous acceptance is never acknowledged');
  uploadStatus = 200; ackFails = true;
  await assert.rejects(runAmplitudeBilling()); checks++;
  const retryId = uploads.at(-1)!.payload.events[0].insert_id;
  eq(await ids(), ['live'], 'accepted upload with failed storage ack remains retryable');
  ackFails = false; process.env.AMPLITUDE_REGION = 'eu';
  eq(await runAmplitudeBilling(), 1, 'successful retry exported');
  eq(uploads.at(-1)!.endpoint, 'https://api.eu.amplitude.com/batch', 'EU region endpoint');
  eq(uploads.at(-1)!.payload.events[0].insert_id, retryId, 'retry preserves Amplitude dedupe id');
  const nUploads = uploads.length;
  eq(await runAmplitudeBilling(), 0, 'acknowledged event never replays');
  eq(uploads.length, nUploads, 'empty batch sends no request');
  await rpc('bobby_amplitude_purchase_ack', [['live', 'live', 'unknown', 'unlinked', 'team', 'invalid-type', 'infinite-date']]);
  eq((await q('select count(*)::int as n from public.bobby_amplitude_purchase_exports'))[0].n, 1, 'ack idempotent and excludes unknown, unlinked, team and malformed rows');

  // An event whose store timestamp is older than exported data, and a previously unlinked row, still export.
  await purchase('late', { eventAge: 10_000, type: 'REFUND', usd: -1.5 });
  await pool.query("update public.bobby_purchase_events set identity_id=$1 where id='unlinked'", [USER]);
  eq((await ids()).sort(), ['late', 'unlinked'], 'late or repaired purchase is not behind a cursor');
  const before = await batch();
  await rpc('bobby_amplitude_purchase_ack', [before.map((entry: any) => entry.id)]);
  await rpc('bobby_amplitude_purchase_ack', [before.map((entry: any) => entry.id)]);
  eq(await ids(), [], 'overlapping acknowledgements are safe');

  await purchase('cron-renewal', { type: 'RENEWAL' });
  const result = await runAmplitude();
  eq(result.purchasesSent, 1, 'existing cron executes billing exporter');
  eq(result.sent, 0, 'usage sent count contract preserved');
  const callsBeforeKeyRemoved = storageCalls;
  delete process.env.AMPLITUDE_API_KEY;
  eq(await runAmplitudeBilling(), 0, 'absent key skips export');
  eq(storageCalls, callsBeforeKeyRemoved, 'absent key never touches storage');
  console.log(`amplitude-billing-pg: ${checks} checks passed (real PostgreSQL; intercepted HTTP, no provider calls)`);
} finally {
  globalThis.fetch = originalFetch;
  await pool.end();
}
