// Execute the actual additive migration on an isolated local PostgreSQL, after
// test-admin-r2-pg and first-party telemetry. All fixtures and DDL roll back.
// psql avoids loading application/provider SDKs into this database-only test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.CI) throw new Error('DATABASE_URL is required in CI');
  console.log('admin-compass-pg: SKIP (no DATABASE_URL)');
  process.exit(0);
}
if (!['127.0.0.1', 'localhost', '::1'].includes(new URL(url).hostname)) throw new Error('Only local scratch PostgreSQL is allowed');

const migration = readFileSync('supabase/bobby-protocol/supabase/migrations/20261004205520_admin_compass_android.sql', 'utf8');
const sql = `
begin;
set client_min_messages=warning;
set statement_timeout='20s';
truncate public.bobby_events,public.bobby_reads,public.bobby_devices,public.bobby_device_accounts,
 public.bobby_device_networks,public.bobby_activity_days,public.bobby_internal_marks,
 public.bobby_internal_networks,public.bobby_admins,public.bobby_identities,
 public.bobby_client_events,public.bobby_client_presence,public.bobby_client_coverage restart identity cascade;
delete from public.api_cache where cache_key='client-telemetry-health';
grant select,insert,update on public.api_cache to service_role;
insert into auth.users(id) values('00000000-0000-4000-8000-00000000c001'),('00000000-0000-4000-8000-00000000c002');
insert into public.bobby_identities(id,auth_user_id,provider) values
 ('00000000-0000-4000-8000-00000000c011','00000000-0000-4000-8000-00000000c001','apple'),
 ('00000000-0000-4000-8000-00000000c012','00000000-0000-4000-8000-00000000c002','apple');
insert into public.bobby_admins(identity_id) values('00000000-0000-4000-8000-00000000c012');
select public.bobby_touch_device('compass-web','web',null,null,null,null);
select public.bobby_touch_device('compass-ios','ios',null,null,null,null);
select public.bobby_touch_device('compass-android-external','android',null,null,null,'00000000-0000-4000-8000-00000000c011');
select public.bobby_touch_device('compass-android-team','android',null,null,null,'00000000-0000-4000-8000-00000000c012');
insert into public.bobby_reads(device_hash,identity_id,platform,symbol) values
 ('compass-web',null,'web','BTC'),('compass-ios',null,'ios','BTC'),
 ('compass-android-external','00000000-0000-4000-8000-00000000c011','android','BTC'),
 ('compass-android-team','00000000-0000-4000-8000-00000000c012','android','BTC');
insert into public.bobby_events(event,platform,device_hash,identity_id) values
 ('read_done','web','compass-web',null),('read_done','ios','compass-ios',null),
 ('read_done','android','compass-android-external','00000000-0000-4000-8000-00000000c011'),
 ('read_done','android','compass-android-team','00000000-0000-4000-8000-00000000c012');
create temporary table compass_before as select public.bobby_admin_server_live(false) live,public.bobby_admin_growth(30,false) growth;
${migration}
${migration}
do $test$
declare live jsonb:=public.bobby_admin_server_live(false); all_live jsonb:=public.bobby_admin_server_live(true);
 growth jsonb:=public.bobby_admin_growth(30,false); all_growth jsonb:=public.bobby_admin_growth(30,true);
 before_live jsonb; before_growth jsonb; period text; platform text;
begin
 select b.live,b.growth into before_live,before_growth from compass_before b;
 assert (live#>>'{windows,15m,android,completed}')::int=1,'external Android server completion is counted';
 assert (live#>>'{windows,15m,android,consumed}')::int=1,'external Android consumption is counted';
 assert (live#>>'{windows,15m,android,observedDevices}')::int=1,'Android observed install is counted once';
 assert (live#>>'{windows,15m,android,observedAccounts}')::int=1,'Android authenticated account is counted once';
 assert (all_live#>>'{windows,15m,android,completed}')::int=2,'includeInternal adds team Android completion';
 assert (all_live#>>'{windows,15m,android,consumed}')::int=2,'includeInternal adds team Android consumption';
 assert live#>>'{platforms,android,latestCompletedAt}' is not null,'Android last-completion timestamp exists';
 assert (growth#>>'{cohorts,android,arrived}')::int=1,'Android observed cohort excludes team';
 assert (all_growth#>>'{cohorts,android,arrived}')::int=2,'Android observed cohort includes team on request';
 assert (growth#>>'{cohorts,android,read1}')::int=1,'Android first-read cohort remains measured';
 assert growth#>'{history,android}' is not null,'Android reconstructed history is explicit';
 assert public.bobby_admin_live(false)#>'{windows,15m,android}'=live#>'{windows,15m,android}','compatibility RPC includes same Android server facts';
 assert not (public.bobby_admin_live(false)#>'{client,platforms}' ? 'android'),'server data never invent Android client instrumentation';
 assert live#>'{coverage,successRate}'='null'::jsonb,'server completions cannot establish success rate';
 foreach period in array array['15m','1h','24h'] loop
  foreach platform in array array['ios','web'] loop
   assert live#>array['windows',period,platform]=before_live#>array['windows',period,platform],'existing iOS/web windows stay identical';
  end loop;
 end loop;
 foreach platform in array array['ios','web'] loop
  assert live#>array['platforms',platform]=before_live#>array['platforms',platform],'existing last-observation timestamps stay identical';
  assert growth#>array['cohorts',platform]=before_growth#>array['cohorts',platform],'existing cohorts stay identical';
 end loop;
end;
$test$;
select 'PASS Android counts, team filtering, idempotence, legacy platforms and honest client coverage';

-- Direct /desk entry emits desk_entered independently of the site visit.
-- A mount without a reading must still advance the activation funnel.
select public.bobby_touch_device('compass-mounted-only','web',null,null,null,null);
insert into public.bobby_events(event,platform,device_hash) values('desk_entered','web','compass-mounted-only');
do $test$
declare f record; growth jsonb:=public.bobby_admin_growth(30,false);
begin
 select * into f from public.bobby_admin_device_facts() where device_hash='compass-mounted-only';
 assert f.desk and f.reads=0,'desk_entered is recognized without a read or legacy visit';
 assert (growth#>>'{cohorts,web,deskOrRead}')::int=2,'mounted-only web installation advances the cohort';
 assert (growth#>>'{cohorts,web,read1}')::int=1,'a desk mount never becomes a successful first read';
end;
$test$;
select 'PASS explicit desk mount and first-read denominator';

do $test$
declare fn text; role_name text; def record;
begin
 foreach fn in array array['public.bobby_admin_server_live(boolean)','public.bobby_admin_device_facts()',
  'public.bobby_admin_growth(integer,boolean)'] loop
  foreach role_name in array array['anon','authenticated'] loop
   assert not has_function_privilege(role_name,fn,'execute'),'public API roles must not read private dashboard';
  end loop;
  assert has_function_privilege('service_role',fn,'execute'),'service role retains private dashboard access';
  select prosecdef,proconfig into def from pg_proc where oid=fn::regprocedure;
  assert not def.prosecdef,'RPCs remain invoker, never bypass RLS with definer';
  assert 'search_path=public, pg_temp'=any(def.proconfig),'RPC search path remains fixed';
 end loop;
end;
$test$;
set role service_role;
do $test$
begin
 assert (public.bobby_admin_server_live(false)#>>'{windows,15m,android,completed}')::int=1,'real service role executes the aggregate under RLS';
 assert (public.bobby_admin_growth(30,false)#>>'{cohorts,android,arrived}')::int=1,'real service role executes growth under RLS';
end;
$test$;
reset role;
select 'PASS service-only privileges and execution under actual role';

-- Capture coverage comes from all Android rows, while activity and timestamps
-- retain the selected external population. Internal QA must not disappear as unknown.
delete from public.bobby_reads where device_hash='compass-android-external';
delete from public.bobby_events where device_hash='compass-android-external';
do $test$
declare live jsonb:=public.bobby_admin_server_live(false); all_live jsonb:=public.bobby_admin_server_live(true); period text;
begin
 assert live#>>'{platforms,android,latestReadConsumptionAt}' is null,'internal-only source does not create an external last-read timestamp';
 assert live#>>'{platforms,android,latestOutcomeAt}' is null,'internal-only source does not create an external outcome timestamp';
 assert live#>>'{platforms,android,coverage,readConsumptionCoverageSince}' is not null,'internal reads establish independent Android capture coverage';
 assert live#>>'{platforms,android,coverage,outcomeCoverageSince}' is not null,'internal outcomes establish independent Android outcome coverage';
 assert live#>>'{platforms,android,coverage,eventCoverageSince}' is not null,'internal events establish independent Android event coverage';
 assert live#>'{platforms,android,coverage}'=all_live#>'{platforms,android,coverage}','capture coverage is invariant under the internal-traffic switch';
 assert not (live#>'{platforms,ios}' ? 'coverage') and not (live#>'{platforms,web}' ? 'coverage'),'additional capture metadata never changes iOS/web payloads';
 foreach period in array array['15m','1h','24h'] loop
  assert (live#>>array['windows',period,'android','consumed'])::int=0,'external Android reads remain measured zero with internal-only capture';
  assert (live#>>array['windows',period,'android','completed'])::int=0,'external Android completions remain measured zero with internal-only capture';
  assert (all_live#>>array['windows',period,'android','completed'])::int=1,'internal Android completion remains counted in the all-traffic view';
 end loop;
end;
$test$;
select 'PASS internal-only Android capture with measured external zeros';
rollback;
`;

const result = spawnSync('psql', [url, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
  input: sql, encoding: 'utf8', timeout: 90_000,
  env: { ...process.env, PGCONNECT_TIMEOUT: '5' },
});
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
const passes = result.stdout.split('\n').filter((line) => line.startsWith('PASS '));
assert.equal(passes.length, 4, result.stdout);
console.log(passes.join('\n'));
console.log('admin-compass-pg: 4 PostgreSQL regression groups passed (rolled back)');
