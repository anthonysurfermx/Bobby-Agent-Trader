// Actual tracker/checkout recorder -> disposable PostgreSQL -> actual Amplitude exporter, provider HTTP mocked.
// No live user, payment, identity, credential or analytics service is contacted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url || !['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('Use an empty local scratch database');
process.env.BOBBY_SUPABASE_URL = 'https://funnel-db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'funnel-test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'funnel-test-service';
process.env.AMPLITUDE_API_KEY = 'funnel-test-ingestion';
process.env.RATE_LIMIT_SALT = 'funnel-test-salt';
delete process.env.BOBBY_AUTH_URL;
delete process.env.AMPLITUDE_REGION;
const { default: trackHandler } = await import('../api/track.ts');
const { recordCheckoutOpened } = await import('../api/_lib/funnel.ts');
const { runAmplitude, toAmplitude } = await import('../api/_lib/amplitude.ts');
const { runAmplitudeBilling, toAmplitudeFirstPaid } = await import('../api/_lib/amplitude-billing.ts');
const pool = new pg.Pool({ connectionString: url });
const USER = 'f0111111-0000-4000-8000-000000000001';
const AUTH = 'a0111111-0000-4000-8000-000000000001';
const OTHER = 'f0111111-0000-4000-8000-000000000002';
const TRIAL = 'f0111111-0000-4000-8000-000000000003';
const LATE = 'f0111111-0000-4000-8000-000000000004';
const TEAM = 'f0111111-0000-4000-8000-000000000005';
const DEVICE = 'd0111111-0000-4000-8000-000000000001';
const dir = 'supabase/bobby-protocol/supabase/migrations';
let checks = 0;
const eq = (got: unknown, want: unknown, name: string) => { assert.deepEqual(got, want, name); checks++; };
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
const rpc = async (name: string, body: Record<string, unknown>) => {
  const names = Object.keys(body);
  const client = await pool.connect();
  try {
    await client.query('begin'); await client.query('set local role service_role');
    const result = await client.query(`select public.${name}(${names.map((name, i) => `${name} => $${i + 1}`).join(',')}) as r`, Object.values(body));
    await client.query('commit'); return result.rows[0].r;
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
};
const batch = () => rpc('bobby_amplitude_purchase_batch', { p_limit: 500 });
const ack = (ids: string[], first: string[] = []) => rpc('bobby_amplitude_purchase_ack', { p_ids: ids, p_first_ids: first });
let uploads: any[] = [], ackFails = false, uploadStatus = 200, authStatus = 200;
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
  const endpoint = String(input), body = JSON.parse(String(init?.body ?? '{}'));
  if (endpoint === 'https://api2.amplitude.com/batch') { uploads.push(body); return Response.json({ echo: 'funnel-test-ingestion', identity: USER }, { status: uploadStatus }); }
  if (!endpoint.startsWith('https://funnel-db.test/')) throw new Error('Unexpected external request');
  if (endpoint.endsWith('/auth/v1/user')) return Response.json({ id: AUTH, email: 'fixture@example.test' }, { status: authStatus });
  if (endpoint.includes('bobby_identities?on_conflict=auth_user_id')) return Response.json([{ id: USER, auth_user_id: AUTH, wallet_address: null }]);
  if (endpoint.includes('/rpc/')) {
    if (endpoint.endsWith('/bobby_amplitude_purchase_ack') && ackFails) return Response.json({}, { status: 500 });
    try {
      const result = await rpc(endpoint.split('/').at(-1)!, body);
      return result == null ? new Response(null, { status: 204 }) : Response.json(result);
    } catch { return Response.json({}, { status: 500 }); }
  }
  if (endpoint.includes('api_cache')) return new Response(null, { status: 201 });
  throw new Error('Unexpected storage request');
}) as typeof fetch;
let ip = 1;
const request = (auth = false) => ({ method: 'POST', headers: {
  'user-agent': 'Mozilla/5.0 Chrome/129.0 Safari/537.36', 'x-forwarded-for': `10.19.0.${ip++}`,
  'x-bobby-device': DEVICE, 'x-bobby-platform': 'web', ...(auth ? { authorization: 'Bearer fixture-token' } : {}),
} });
const track = async (event: string, surface: string, auth = false, extra = {}) => {
  const res = { statusCode: 200, setHeader() {}, status(n: number) { this.statusCode = n; return this; }, json() { return this; }, end() { return this; } };
  await trackHandler({ ...request(auth), body: JSON.stringify({ event, surface, device: DEVICE, platform: 'web', ...extra }) } as never, res as never);
  return res.statusCode;
};
const purchase = async (id: string, identity: string, type: string, amount: number, eventAge: number, opts: { store?: string; environment?: string; createdAge?: number } = {}) => {
  await q(`insert into bobby_purchase_events(id,type,identity_id,store,environment,price_usd,price_local,currency,takehome,event_at,created_at)
    values($1,$2,$3,$4,$5,$6,$6,'USD',0.9,now()-make_interval(mins=>$7),now()-make_interval(mins=>$8))`,
  [id, type, identity, opts.store ?? 'STRIPE', opts.environment ?? 'PRODUCTION', amount, eventAge, opts.createdAge ?? 20]);
};
try {
  await q(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
    end $$;
    create table bobby_identities(id uuid primary key, auth_user_id uuid, internal boolean not null default false);
    create table bobby_purchase_events(id text primary key,type text not null,environment text,store text,product_id text,
      price_usd numeric,takehome numeric,currency text,price_local numeric,identity_id uuid references bobby_identities(id) on delete set null,
      event_at timestamptz not null default now(),created_at timestamptz not null default now());
    create table bobby_events(id bigserial primary key,event text not null,platform text,surface text,device_hash text,
      identity_id uuid references bobby_identities(id) on delete set null,created_at timestamptz not null default now(),
      referrer text,utm_source text,country text,region text,detail text);
    create table bobby_admin_settings(key text primary key,value jsonb,updated_at timestamptz not null default now());
    create table bobby_device_accounts(device_hash text,identity_id uuid,primary key(device_hash,identity_id));
    create function bobby_internal_identity_ids() returns setof uuid language sql stable security invoker
      as $$ select id from bobby_identities where internal $$;
    create function bobby_internal_device_hashes() returns setof text language sql stable security invoker
      as $$ select device_hash from bobby_device_accounts where identity_id in (select bobby_internal_identity_ids()) $$;
    create function bobby_geo_country(text) returns text language sql immutable as $$ select case when $1 ~ '^[A-Z]{2}$' then $1 end $$;
    create function bobby_geo_region(text,text) returns text language sql immutable as $$ select case when $1 is not null then $2 end $$;
    create function bobby_touch_device(text,text,text,text,text,uuid,text,text,text) returns void language sql security invoker
      as $$ insert into bobby_device_accounts(device_hash,identity_id) select $1,$6 where $6 is not null on conflict do nothing $$;
    grant select,insert,update on all tables in schema public to service_role;
    grant usage,select on all sequences in schema public to service_role;`);
  await q('insert into bobby_identities(id,auth_user_id,internal) values ($1,$2,false),($3,null,false),($4,null,false),($5,null,false),($6,null,true)', [USER, AUTH, OTHER, TRIAL, LATE, TEAM]);
  await q(readFileSync(`${dir}/20261002090000_amplitude_forward.sql`, 'utf8'));
  await q(readFileSync(`${dir}/20261002132106_amplitude_billing_export.sql`, 'utf8'));
  const migration = readFileSync(`${dir}/20261002160000_web_conversion_funnel.sql`, 'utf8');
  await q(migration); await q(migration);
  const roles = await q(`select proname,prosecdef,has_function_privilege('anon',p.oid,'execute') anon,
    has_function_privilege('authenticated',p.oid,'execute') auth,has_function_privilege('service_role',p.oid,'execute') svc
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and proname in ('bobby_record_event','bobby_record_checkout_opened','bobby_first_paid_event','bobby_amplitude_purchase_ack')`);
  eq(roles.length, 4, 'no ambiguous old function overloads');
  eq(roles.every(r => !r.prosecdef && !r.anon && !r.auth && r.svc), true, 'new RPCs service-only and security invoker');
  eq((await q(`select relrowsecurity from pg_class where relname in ('bobby_checkout_funnel_sessions','bobby_amplitude_first_paid_exports')`)).every(r => r.relrowsecurity), true, 'dedupe tables retain RLS');

  eq(await track('visit', 'home', false, { identity: OTHER, identity_id: OTHER }), 204, 'anonymous static home beacon accepted');
  eq(await track('desk_entered', 'desk'), 204, 'anonymous mounted Desk accepted');
  eq(await track('purchase_start', 'desk', true, { identity: OTHER, identity_id: OTHER }), 204, 'signed-in intent accepted');
  const rows = await q('select * from bobby_events order by id');
  eq(rows.map(r => r.identity_id), [null, null, USER], 'client identity ignored; verified auth maps to canonical Bobby UUID');
  eq(rows[0].device_hash, rows[2].device_hash, 'anonymous home and signed-in event retain same salted install');
  eq(rows[0].device_hash.includes(DEVICE), false, 'raw install not stored');
  eq((await q('select identity_id from bobby_device_accounts'))[0].identity_id, USER, 'identified touch links the device');
  eq(await track('checkout_opened', 'desk', true), 400, 'client cannot manufacture authoritative checkout step');
  authStatus = 503;
  eq(await track('desk_entered', 'desk', true), 503, 'auth outage does not silently store identified event as anonymous');
  authStatus = 200;
  const identity = { id: USER, authUserId: AUTH, via: 'supabase' as const, wallet: null };
  await recordCheckoutOpened(request(true) as never, identity, 'cs_test_fixture');
  await recordCheckoutOpened(request(true) as never, identity, 'cs_test_fixture');
  eq((await q("select * from bobby_events where event='checkout_opened'")).length, 1, 'reuse/retry of a Stripe session records one checkout step');
  const concurrent = await Promise.all([rpc('bobby_record_checkout_opened', { p_identity: OTHER, p_device: 'device-other-fixture', p_session: 'cs_test_concurrent' }),
    rpc('bobby_record_checkout_opened', { p_identity: OTHER, p_device: 'device-other-fixture', p_session: 'cs_test_concurrent' })]);
  eq(concurrent.sort(), [false,true], 'concurrent session recording has one atomic winner');
  eq((await q("select count(*)::int n from bobby_events where identity_id=$1 and event='checkout_opened'", [OTHER]))[0].n, 1, 'one stored event after concurrent calls');

  await purchase('invoice-first', USER, 'INITIAL_PURCHASE', 4.9, 15);
  await q("update bobby_events set created_at=created_at-interval '20 minutes'");
  uploads = [];
  eq((await runAmplitude()).purchasesSent, 1, 'existing cron includes billing after usage');
  const exported = uploads.flatMap(u => u.events);
  const stages = exported.filter(e => ['visit','desk_entered','checkout_opened','billing_first_paid'].includes(e.event_type) && (e.user_id === USER || e.device_id === rows[0].device_hash));
  eq(stages.map(e => e.event_type), ['visit','desk_entered','checkout_opened','billing_first_paid'], 'anonymous -> Desk -> authoritative checkout -> first paid sequence');
  eq(stages.map(e => e.event_properties.platform), ['web','web','web','web'], 'stable event platform on every step');
  eq(stages[2].device_id, stages[0].device_id, 'checkout bridges same anonymous device');
  eq(stages[2].user_id, stages[3].user_id, 'checkout and confirmed billing share canonical person');
  eq('device_id' in stages[3], false, 'billing invents no browser device');
  eq('revenue' in stages[3], false, 'conversion alias has no revenue');
  eq(exported.filter(e => 'revenue' in e).length, 1, 'only original charge contributes monetary revenue');
  eq(stages[3].time, exported.find(e => e.event_type === 'billing_initial_purchase').time, 'alias preserves original payment timestamp');
  eq(JSON.stringify(exported).includes('fixture@example.test') || JSON.stringify(exported).includes('fixture-token') || JSON.stringify(exported).includes('cs_test_') || JSON.stringify(exported).includes(AUTH), false, 'no email, token, auth UUID or Stripe session exported');
  await purchase('resubscription', USER, 'INITIAL_PURCHASE', 4.9, 10);
  uploads = []; await runAmplitudeBilling();
  eq(uploads[0].events.some((e: any) => e.event_type === 'billing_first_paid'), false, 're-subscription never creates another new payer');

  await purchase('trial-free', TRIAL, 'INITIAL_PURCHASE', 0, 60);
  await purchase('trial-paid', TRIAL, 'RENEWAL', 4.9, 30);
  await purchase('trial-refund', TRIAL, 'REFUND', -4.9, 20);
  const trial = (await batch()).filter((r: any) => r.identity === TRIAL);
  eq(trial.filter((r: any) => r.firstPaid).map((r: any) => r.id), ['trial-paid'], 'first paid renewal after trial/100% coupon counts');
  eq(toAmplitudeFirstPaid(trial.find((r: any) => r.id === 'trial-paid'))!.time, Date.parse(trial.find((r: any) => r.id === 'trial-paid').at), 'renewal alias retains payment time');
  await purchase('apple-first', OTHER, 'INITIAL_PURCHASE', 4.9, 40, { store: 'APP_STORE' });
  await purchase('sandbox-first', OTHER, 'INITIAL_PURCHASE', 4.9, 50, { environment: 'SANDBOX' });
  eq((await batch()).filter((r: any) => r.identity === OTHER).some((r: any) => r.firstPaid), false, 'Apple/sandbox purchases do not count as paid web conversion');

  await purchase('late-renewal', LATE, 'RENEWAL', 4.9, 30);
  const snapshot = (await batch()).find((r: any) => r.id === 'late-renewal');
  await purchase('late-initial', LATE, 'INITIAL_PURCHASE', 4.9, 80);
  eq((await batch()).filter((r: any) => r.identity === LATE && r.firstPaid).map((r: any) => r.id), ['late-initial'], 'out-of-order pending invoices select original earlier payment');
  eq(toAmplitudeFirstPaid(snapshot)!.insert_id, toAmplitudeFirstPaid((await batch()).find((r: any) => r.id === 'late-initial'))!.insert_id, 'concurrent snapshots retain one person dedupe ID');
  await Promise.all([ack(['late-renewal'], ['late-renewal']), ack(['late-renewal'], ['late-renewal'])]);
  eq((await q('select count(*)::int n from bobby_amplitude_first_paid_exports where identity_id=$1', [LATE]))[0].n, 1, 'overlapping ack has one persistent person marker');
  eq((await batch()).filter((r: any) => r.identity === LATE).some((r: any) => r.firstPaid), false, 'older invoice arriving between upload and ack does not create another conversion');

  ackFails = true; uploads = [];
  await assert.rejects(runAmplitudeBilling()); checks++;
  const aliasId = uploads[0].events.find((e: any) => e.user_id === TRIAL && e.event_type === 'billing_first_paid').insert_id;
  eq((await q('select count(*)::int n from bobby_amplitude_first_paid_exports where identity_id=$1', [TRIAL]))[0].n, 0, 'failed acknowledgement preserves alias retry');
  ackFails = false; uploads = []; await runAmplitudeBilling();
  eq(uploads[0].events.find((e: any) => e.user_id === TRIAL && e.event_type === 'billing_first_paid').insert_id, aliasId, 'retry alias has stable identity-level insert id');
  await purchase('still-later-initial', LATE, 'INITIAL_PURCHASE', 4.9, 100);
  eq((await batch()).some((r: any) => r.id === 'still-later-initial' && r.firstPaid), false, 'late history after accepted first recorded payment cannot emit another alias');
  await purchase('internal-first', TEAM, 'INITIAL_PURCHASE', 4.9, 100);
  eq((await batch()).some((r: any) => r.identity === TEAM), false, 'internal first payment is excluded');
  await q("insert into bobby_purchase_events(id,type,store,environment,identity_id,price_usd,price_local,event_at,created_at) values('nan-amount','INITIAL_PURCHASE','STRIPE','PRODUCTION',$1,'NaN',null,now()-interval '4 hours',now()-interval '20 minutes')", [OTHER]);
  await purchase('foreign-paid', OTHER, 'RENEWAL', 99, 20);
  await q("update bobby_purchase_events set price_usd=null,currency='MXN' where id='foreign-paid'");
  const foreign = (await batch()).find((r: any) => r.id === 'foreign-paid');
  eq(foreign.firstPaid, true, 'confirmed positive local currency counts without inventing USD conversion');
  eq('revenue' in toAmplitudeFirstPaid(foreign)!, false, 'foreign-currency conversion alias also has no revenue');
  eq((await batch()).find((r: any) => r.id === 'nan-amount').firstPaid, false, 'invalid monetary value does not hide a later confirmed payment');
  await ack(['still-later-initial'], ['foreign-paid']);
  eq((await q('select count(*)::int n from bobby_amplitude_first_paid_exports where identity_id=$1', [OTHER]))[0].n, 0, 'ACK cannot mark an alias outside its accepted source rows');
  await track('visit', 'desk');
  await q("update bobby_events set created_at=created_at-interval '20 minutes' where id=(select max(id) from bobby_events)");
  const cursorBefore = (await q("select value from bobby_admin_settings where key='amplitude_cursor'"))[0].value;
  uploadStatus = 202;
  await assert.rejects(runAmplitude(), (error: Error) => error.message === 'amplitude 202'); checks++;
  eq((await q("select value from bobby_admin_settings where key='amplitude_cursor'"))[0].value, cursorBefore, 'usage 202 leaves its cursor unacknowledged');
  uploadStatus = 500;
  await assert.rejects(runAmplitude(), (error: Error) => error.message === 'amplitude 500'); checks++;
  eq((await q("select value from bobby_admin_settings where key='amplitude_cursor'"))[0].value, cursorBefore, 'usage error also retains cursor and does not echo key/body');
  uploadStatus = 200;
  eq((await runAmplitude()).sent, 1, 'usage resumes after failed telemetry uploads');
  eq(toAmplitude({ id: 99, at: new Date().toISOString(), event:'desk_entered',platform:'web',surface:'desk',device:'fixturedevicehash',identity:null,referrer:null,utm:null,country:null,region:null,detail:null }).event_properties.platform, 'web', 'direct Desk step has explicit event platform');
  console.log(`web funnel: ${checks} checks passed (local PostgreSQL, mocked provider HTTP)`);
} finally { globalThis.fetch = originalFetch; await pool.end(); }
