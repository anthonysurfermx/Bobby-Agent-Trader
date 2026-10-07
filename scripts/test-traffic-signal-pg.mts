// Execute the additive traffic-signal migration on an isolated local PostgreSQL, after the admin suites.
// All fixtures and DDL roll back. psql avoids loading application/provider SDKs into this database-only test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('traffic-signal-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('Only local scratch PostgreSQL is allowed');

const migration = readFileSync('supabase/bobby-protocol/supabase/migrations/20261007110000_device_traffic_signal.sql', 'utf8');
const sql = `
begin;
set client_min_messages=warning;
set statement_timeout='20s';
truncate public.bobby_events,public.bobby_reads,public.bobby_devices,public.bobby_device_accounts,
 public.bobby_device_networks,public.bobby_activity_days,public.bobby_internal_marks,
 public.bobby_internal_networks,public.bobby_admins,public.bobby_identities restart identity cascade;
${migration}
${migration}
select public.bobby_touch_device('traffic-human','web',null,null,null,null);
select public.bobby_touch_device('traffic-hosted','web',null,null,null,null);
select public.bobby_touch_device('traffic-silent','web',null,null,null,null);
select public.bobby_touch_device('traffic-reader','web',null,null,null,null);
select public.bobby_touch_device('traffic-native','ios',null,null,null,null);
insert into public.bobby_reads(device_hash,identity_id,platform,symbol) values('traffic-reader',null,'web','BTC');
select public.bobby_mark_device_signal('traffic-human',true,false);
select public.bobby_mark_device_signal('traffic-human',false,true);
select public.bobby_mark_device_signal('traffic-hosted',false,true);
select public.bobby_mark_device_signal('traffic-reader',false,true);
select public.bobby_mark_device_signal('traffic-unknown',true,true);
do $test$
declare t jsonb:=public.bobby_admin_traffic(false); growth jsonb:=public.bobby_admin_growth(30,false); first_at timestamptz;
begin
 assert (t->>'verified7d')::int=3,'an install that interacted, a reader and a native install are people';
 assert (t->>'datacenter7d')::int=1,'a silent web install from a hosting network is its own class';
 assert (t->>'unverified7d')::int=1,'a silent web install elsewhere stays unverified';
 assert (t->>'verified7d')::int+(t->>'datacenter7d')::int+(t->>'unverified7d')::int=(growth#>>'{people,active7d}')::int,'the classes add up to active7d';
 assert t->>'signalSince' is not null,'the first signal dates the coverage';
 assert not exists(select 1 from public.bobby_devices where device_hash='traffic-unknown'),'a signal never creates an install';
 select engaged_at into first_at from public.bobby_devices where device_hash='traffic-human';
 perform public.bobby_mark_device_signal('traffic-human',true,false);
 assert first_at=(select engaged_at from public.bobby_devices where device_hash='traffic-human'),'the first interaction is kept';
end;
$test$;
select 'PASS classes, precedence, idempotence and the active7d identity';

do $test$
declare fn text; role_name text; def record;
begin
 foreach fn in array array['public.bobby_admin_traffic(boolean)','public.bobby_mark_device_signal(text,boolean,boolean)'] loop
  foreach role_name in array array['anon','authenticated'] loop
   assert not has_function_privilege(role_name,fn,'execute'),'public API roles must not reach the signal functions';
  end loop;
  assert has_function_privilege('service_role',fn,'execute'),'service role keeps access';
  select prosecdef,proconfig into def from pg_proc where oid=fn::regprocedure;
  assert not def.prosecdef,'RPCs remain invoker';
  assert 'search_path=public, pg_temp'=any(def.proconfig),'RPC search path remains fixed';
 end loop;
end;
$test$;
set role service_role;
select public.bobby_mark_device_signal('traffic-silent',true,false);
do $test$
begin
 assert (public.bobby_admin_traffic(false)->>'unverified7d')::int=0,'the real service role marks and reads under RLS';
end;
$test$;
reset role;
select 'PASS service-only privileges and execution under actual role';
rollback;
`;

const result = spawnSync('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
  input: sql, encoding: 'utf8', timeout: 90_000,
  env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
const passes = result.stdout.split('\n').filter((line) => line.startsWith('PASS '));
assert.equal(passes.length, 2, result.stdout);
console.log(passes.join('\n'));
console.log('traffic-signal-pg: 2 PostgreSQL regression groups passed (rolled back)');
