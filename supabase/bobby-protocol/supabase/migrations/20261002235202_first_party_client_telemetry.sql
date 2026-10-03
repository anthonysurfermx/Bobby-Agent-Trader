-- First-party telemetry is a separate observed client cohort. Old clients remain unmeasured.
-- The API salts install/session identifiers and derives identity from verified auth. Read receipts are
-- HMAC-authenticated by the service before this service-only RPC is called; no client may call it directly.
create table if not exists public.bobby_client_events (
  event_id uuid primary key,
  kind text not null check (kind in ('foreground','background','read_started','read_received','read_rendered','webview_terminated')),
  platform text not null check (platform in ('ios','web')),
  install_hash text not null check (install_hash ~ '^[a-f0-9]{24}$'),
  session_hash text not null check (session_hash ~ '^[a-f0-9]{24}$'),
  sequence bigint not null check (sequence between 0 and 9007199254740991),
  occurred_at timestamptz not null,
  received_at timestamptz not null default clock_timestamp(),
  identity_id uuid references public.bobby_identities(id) on delete set null,
  verified_auth boolean not null default false,
  app_version text not null check (app_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$'),
  app_build text not null check (app_build ~ '^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$'),
  request_id uuid,
  read_receipt_id uuid,
  check ((kind in ('read_received','read_rendered')) = (read_receipt_id is not null)),
  check (read_receipt_id is null or request_id is not null)
);
alter table public.bobby_client_events add column if not exists verified_auth boolean not null default false;
create unique index if not exists bobby_client_events_receipt_kind on public.bobby_client_events(read_receipt_id,kind) where read_receipt_id is not null;
create unique index if not exists bobby_client_events_started_request on public.bobby_client_events(platform,install_hash,request_id) where kind='read_started' and request_id is not null;
create index if not exists bobby_client_events_recent on public.bobby_client_events(platform,received_at desc);
create index if not exists bobby_client_events_kind_latest on public.bobby_client_events(platform,kind,received_at desc);
create index if not exists bobby_client_events_health_latest on public.bobby_client_events(received_at desc);
create index if not exists bobby_client_events_verified_latest on public.bobby_client_events(received_at desc) where verified_auth and kind in ('read_received','read_rendered');
create index if not exists bobby_client_events_identity on public.bobby_client_events(identity_id) where identity_id is not null;
create index if not exists bobby_client_events_builds on public.bobby_client_events(platform,app_version,app_build,received_at desc);

-- One current report per install. Cross-session logical time and same-session sequence are both checked.
-- A heartbeat never opens a new session or resurrects a background session. Liveness lasts at most 90s
-- from the earlier of logical client report and server receipt, rather than from delayed delivery or a retry.
-- Up to 30s positive client clock skew is retained for ordering but never extends the presence lifetime.
create table if not exists public.bobby_client_presence (
  platform text not null check (platform in ('ios','web')),
  install_hash text not null check (install_hash ~ '^[a-f0-9]{24}$'),
  session_hash text not null check (session_hash ~ '^[a-f0-9]{24}$'),
  sequence bigint not null check (sequence between 0 and 9007199254740991),
  last_event_id uuid not null,
  foreground boolean not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  last_authenticated_received_at timestamptz,
  expires_at timestamptz not null,
  identity_id uuid references public.bobby_identities(id) on delete set null,
  verified_auth boolean not null default false,
  app_version text not null check (app_version ~ '^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$'),
  app_build text not null check (app_build ~ '^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$'),
  primary key(platform,install_hash)
);
alter table public.bobby_client_presence add column if not exists verified_auth boolean not null default false;
alter table public.bobby_client_presence add column if not exists last_authenticated_received_at timestamptz;
create index if not exists bobby_client_presence_health_latest on public.bobby_client_presence(received_at desc);
create index if not exists bobby_client_presence_authenticated_latest on public.bobby_client_presence(last_authenticated_received_at desc) where last_authenticated_received_at is not null;
create index if not exists bobby_client_presence_identity on public.bobby_client_presence(identity_id) where identity_id is not null;
create index if not exists bobby_client_presence_recent on public.bobby_client_presence(received_at);
create index if not exists bobby_client_presence_active on public.bobby_client_presence(platform,expires_at) where foreground;

-- Coverage is a bounded cohort registry, never the source of external-scope rollout claims.
-- Scoped coverage below derives from retained, team-filtered events so internal QA cannot claim coverage.
create table if not exists public.bobby_client_coverage (
  platform text not null check (platform in ('ios','web')),
  app_version text not null,
  app_build text not null,
  kind text not null check (kind in ('foreground','background','read_started','read_received','read_rendered','webview_terminated')),
  first_received_at timestamptz not null,
  last_received_at timestamptz not null,
  primary key(platform,app_version,app_build,kind)
);
create index if not exists bobby_client_coverage_recent on public.bobby_client_coverage(last_received_at);
alter table public.bobby_client_events enable row level security;
alter table public.bobby_client_presence enable row level security;
alter table public.bobby_client_coverage enable row level security;
revoke all on public.bobby_client_events,public.bobby_client_presence,public.bobby_client_coverage from public,anon,authenticated;
grant select,insert,update,delete on public.bobby_client_events,public.bobby_client_presence,public.bobby_client_coverage to service_role;

-- Hourly writer maintenance plus the authenticated daily digest keep retention moving even when idle.
-- The claim is atomic, deletes are indexed and capped, and a failed transaction rolls the claim back.
create or replace function public.bobby_prune_client_telemetry(p_force boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare events_removed int:=0; presence_removed int:=0; coverage_removed int:=0;
begin
  if not pg_try_advisory_xact_lock(746281391) then return jsonb_build_object('skipped',true); end if;
  if not coalesce(p_force,false) and not bobby_cache_claim('client-telemetry-retention',3600) then return jsonb_build_object('skipped',true); end if;
  delete from bobby_client_events where event_id in (
    select event_id from bobby_client_events where received_at<now()-interval '35 days' order by received_at limit 50000);
  get diagnostics events_removed=row_count;
  delete from bobby_client_presence where (platform,install_hash) in (
    select platform,install_hash from bobby_client_presence where received_at<now()-interval '7 days' order by received_at limit 50000);
  get diagnostics presence_removed=row_count;
  delete from bobby_client_coverage where last_received_at<now()-interval '7 days';
  get diagnostics coverage_removed=row_count;
  return jsonb_build_object('events',events_removed,'presence',presence_removed,'coverage',coverage_removed,'skipped',false);
end;
$$;
revoke all on function public.bobby_prune_client_telemetry(boolean) from public,anon,authenticated;
grant execute on function public.bobby_prune_client_telemetry(boolean) to service_role;

-- This unpublished writer gained an optional verified-auth argument. Remove only its old overload;
-- no dependent SQL callers exist, and no CASCADE is used. Old argument sets resolve via the new default.
drop function if exists public.bobby_record_client_telemetry(uuid,text,text,text,text,bigint,timestamptz,uuid,text,text,uuid,uuid);
create or replace function public.bobby_record_client_telemetry(
  p_event_id uuid,p_kind text,p_platform text,p_install_hash text,p_session_hash text,p_sequence bigint,
  p_occurred_at timestamptz,p_identity_id uuid default null,p_app_version text default null,p_app_build text default null,
  p_request_id uuid default null,p_read_receipt_id uuid default null,p_verified_auth boolean default false
) returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare
  received timestamptz:=clock_timestamp();
  occurred timestamptz:=coalesce(p_occurred_at,received);
  version text:=coalesce(p_app_version,'unknown'); build text:=coalesce(p_app_build,'unknown');
  verified boolean:=coalesce(p_verified_auth,false);
  n int:=0; changed int:=0;
begin
  if p_event_id is null or p_kind is null or p_kind not in ('heartbeat','foreground','background','read_started','read_received','read_rendered','webview_terminated')
    or p_platform is null or p_platform not in ('ios','web')
    or p_install_hash is null or p_install_hash !~ '^[a-f0-9]{24}$' or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{24}$'
    or p_sequence is null or p_sequence<0 or p_sequence>9007199254740991
    or version !~ '^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$' or build !~ '^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$'
    or (p_kind in ('heartbeat','foreground','background') and p_occurred_at is null)
    or (p_kind in ('heartbeat','foreground','background') and (occurred>received+interval '30 seconds' or occurred<received-interval '5 minutes'))
    or ((p_kind in ('read_received','read_rendered')) <> (p_read_receipt_id is not null))
    or (p_read_receipt_id is not null and p_request_id is null) then
    raise exception 'invalid client telemetry' using errcode='22023';
  end if;

  -- No free-form or noncanonical label reaches the registry, including direct service calls.
  if p_platform='web' then
    version:='web';
    if build !~ '^[a-f0-9]{40}$' then build:='unknown'; end if;
  elsif version !~ '^(0|[1-9][0-9]?)\.(0|[1-9][0-9]?)(\.(0|[1-9][0-9]?))?$' or build !~ '^[1-9][0-9]{0,3}$' then
    version:='unknown'; build:='unknown';
  end if;
  perform bobby_prune_client_telemetry(false);
  -- Serialize cohort admission. At most 100 named cohorts plus one unknown bucket per platform;
  -- many concurrent first reports cannot race past the cap. Existing cohorts remain recognizable.
  perform pg_advisory_xact_lock(746281392);
  if build<>'unknown' and not exists(select 1 from bobby_client_coverage where platform=p_platform and app_version=version and app_build=build)
    and (select count(*) from (select app_version,app_build from bobby_client_coverage where platform=p_platform and app_build<>'unknown' group by 1,2) c)>=100 then
    version:=case when p_platform='web' then 'web' else 'unknown' end; build:='unknown';
  end if;

  if p_kind='heartbeat' then
    if not exists(select 1 from bobby_client_coverage where platform=p_platform and app_version=version and app_build=build) then version:=case when p_platform='web' then 'web' else 'unknown' end; build:='unknown'; end if;
    -- No heartbeat event, coverage or activity insert. Shared bounded maintenance remains independent.
    update bobby_client_presence cp set sequence=p_sequence,last_event_id=p_event_id,occurred_at=occurred,
      received_at=received,last_authenticated_received_at=case when verified then received else cp.last_authenticated_received_at end,expires_at=least(occurred,received)+interval '90 seconds',verified_auth=verified,identity_id=p_identity_id,app_version=version,app_build=build
    where cp.platform=p_platform and cp.install_hash=p_install_hash and cp.session_hash=p_session_hash and cp.foreground
      and cp.sequence<p_sequence and cp.last_event_id<>p_event_id and cp.occurred_at<=occurred
      and not exists(select 1 from bobby_client_events e where e.event_id=p_event_id);
    get diagnostics changed=row_count;
    return jsonb_build_object('accepted',true,'duplicate',changed=0 and exists(select 1 from bobby_client_presence cp where cp.platform=p_platform and cp.install_hash=p_install_hash and cp.last_event_id=p_event_id),'presenceUpdated',changed>0);
  end if;

  insert into bobby_client_events(event_id,kind,platform,install_hash,session_hash,sequence,occurred_at,received_at,identity_id,verified_auth,app_version,app_build,request_id,read_receipt_id)
  values(p_event_id,p_kind,p_platform,p_install_hash,p_session_hash,p_sequence,occurred,received,p_identity_id,verified,version,build,p_request_id,p_read_receipt_id)
  on conflict do nothing;
  get diagnostics n=row_count;
  if n=0 then return jsonb_build_object('accepted',false,'duplicate',true,'presenceUpdated',false); end if;

  insert into bobby_client_coverage(platform,app_version,app_build,kind,first_received_at,last_received_at)
  values(p_platform,version,build,p_kind,received,received)
  on conflict(platform,app_version,app_build,kind) do update set first_received_at=least(bobby_client_coverage.first_received_at,excluded.first_received_at),last_received_at=greatest(bobby_client_coverage.last_received_at,excluded.last_received_at);

  if p_kind in ('foreground','background') then
    insert into bobby_client_presence(platform,install_hash,session_hash,sequence,last_event_id,foreground,occurred_at,received_at,last_authenticated_received_at,expires_at,identity_id,verified_auth,app_version,app_build)
    values(p_platform,p_install_hash,p_session_hash,p_sequence,p_event_id,p_kind='foreground',occurred,received,case when verified then received else null end,least(occurred,received)+interval '90 seconds',p_identity_id,verified,version,build)
    on conflict(platform,install_hash) do update set session_hash=excluded.session_hash,sequence=excluded.sequence,last_event_id=excluded.last_event_id,
      foreground=excluded.foreground,occurred_at=excluded.occurred_at,received_at=excluded.received_at,
      last_authenticated_received_at=coalesce(excluded.last_authenticated_received_at,bobby_client_presence.last_authenticated_received_at),expires_at=excluded.expires_at,
      identity_id=excluded.identity_id,verified_auth=excluded.verified_auth,app_version=excluded.app_version,app_build=excluded.app_build
    where (bobby_client_presence.session_hash=excluded.session_hash and bobby_client_presence.sequence<excluded.sequence and bobby_client_presence.occurred_at<=excluded.occurred_at)
      or (bobby_client_presence.session_hash<>excluded.session_hash and bobby_client_presence.occurred_at<excluded.occurred_at);
    get diagnostics changed=row_count;
  end if;
  return jsonb_build_object('accepted',true,'duplicate',false,'presenceUpdated',changed>0);
end;
$$;
revoke all on function public.bobby_record_client_telemetry(uuid,text,text,text,text,bigint,timestamptz,uuid,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.bobby_record_client_telemetry(uuid,text,text,text,text,bigint,timestamptz,uuid,text,text,uuid,uuid,boolean) to service_role;

-- Global endpoint health is failure evidence, not a complete uptime/success counter. Auth recovery needs
-- a server-verified receipt or a fresh presence update in an authenticated cohort (wallet or account); anonymous reports cannot prove it.
create or replace function public.bobby_client_telemetry_health()
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare
  body jsonb; failed_at timestamptz; latest timestamptz; authenticated_latest timestamptz;
  eligible timestamptz; authenticated boolean; failure text;
begin
  select max(x.ts) into latest from (
    (select received_at ts from bobby_client_events where received_at<=now() order by received_at desc limit 1)
    union all (select received_at from bobby_client_presence where received_at<=now() order by received_at desc limit 1)
  ) x;
  select payload into body from api_cache where cache_key='client-telemetry-health' and expires_at>now();
  if body is not null and jsonb_typeof(body)='object' and jsonb_typeof(body->'authenticated')='boolean'
    and body->>'error' in ('auth_unavailable','storage_unavailable','request_budget_exhausted')
    and body->>'lastErrorAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$' then
    begin failed_at:=(body->>'lastErrorAt')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then failed_at:=null;
    end;
  end if;
  if failed_at is null or failed_at>now() or failed_at<now()-interval '30 days' then
    return jsonb_build_object('status','unknown','lastErrorAt',null,'error',null,'authenticated',null,'lastReportAt',latest,'recovered',null);
  end if;
  authenticated:=(body->>'authenticated')::boolean; failure:=body->>'error';
  if authenticated then
    select max(x.ts) into authenticated_latest from (
      (select received_at ts from bobby_client_events where received_at<=now() and verified_auth and kind in ('read_received','read_rendered') order by received_at desc limit 1)
      union all (select last_authenticated_received_at from bobby_client_presence where last_authenticated_received_at<=now() order by last_authenticated_received_at desc limit 1)
    ) x;
    eligible:=authenticated_latest;
  else eligible:=latest;
  end if;
  return jsonb_build_object('status',case when eligible>failed_at then 'recovered' else 'failure_observed' end,
    'lastErrorAt',failed_at,'error',failure,'authenticated',authenticated,'lastReportAt',eligible,'recovered',coalesce(eligible>failed_at,false));
end;
$$;
revoke all on function public.bobby_client_telemetry_health() from public,anon,authenticated;
grant execute on function public.bobby_client_telemetry_health() to service_role;

create or replace function public.bobby_admin_client_live(p_internal boolean default false)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  with team_accounts as materialized(select bobby_internal_identity_ids() id),
  team_devices as materialized(select bobby_internal_device_hashes() id),
  history as not materialized(select * from bobby_client_events e where coalesce(p_internal,false) or not
    case when e.identity_id is not null then coalesce(e.identity_id in(select id from team_accounts),false)
    else coalesce(e.install_hash in(select id from team_devices),false) end),
  ev as materialized(select * from history where platform in ('ios','web') and received_at>=now()-interval '24 hours' and received_at<=now()),
  pr as materialized(select * from bobby_client_presence e where e.received_at>=now()-interval '7 days' and (coalesce(p_internal,false) or not
    case when e.identity_id is not null then coalesce(e.identity_id in(select id from team_accounts),false)
    else coalesce(e.install_hash in(select id from team_devices),false) end)),
  pf(platform) as(values('ios'),('web')),periods(label,minutes) as(values('15m',15),('1h',60),('24h',1440)),
  windows as(select p.platform,t.label,jsonb_build_object('minutes',t.minutes,'since',now()-make_interval(mins=>t.minutes),
    'foreground',count(*) filter(where e.kind='foreground'),'background',count(*) filter(where e.kind='background'),
    'started',count(*) filter(where e.kind='read_started'),'received',count(*) filter(where e.kind='read_received'),
    'rendered',count(*) filter(where e.kind='read_rendered'),'webviewTerminations',count(*) filter(where e.kind='webview_terminated'),
    'reportedInstalls',count(distinct e.install_hash),'reportedAccounts',count(distinct e.identity_id)) facts
    from pf p cross join periods t left join ev e on e.platform=p.platform and e.received_at>=now()-make_interval(mins=>t.minutes) and e.received_at<=now()
    group by p.platform,t.label,t.minutes),
  -- Historical latest values are index probes, independently of the bounded recent materialization.
  latest as(select p.platform,jsonb_build_object(
    'eventAt',(select received_at from history where platform=p.platform and received_at<=now() order by received_at desc limit 1),
    'receivedAt',(select received_at from history where platform=p.platform and kind='read_received' and received_at<=now() order by received_at desc limit 1),
    'renderedAt',(select received_at from history where platform=p.platform and kind='read_rendered' and received_at<=now() order by received_at desc limit 1),
    'webviewTerminationAt',(select received_at from history where platform=p.platform and kind='webview_terminated' and received_at<=now() order by received_at desc limit 1)) facts from pf p),
  presence as(select p.platform,jsonb_build_object('reportedForegroundInstalls',count(*) filter(where e.foreground and e.expires_at>now()),
    'reportedForegroundAccounts',count(distinct e.identity_id) filter(where e.foreground and e.expires_at>now()),
    'reportedForegroundSessions',count(distinct e.session_hash) filter(where e.foreground and e.expires_at>now()),
    'latestReportAt',max(e.received_at),'scope','client_reported_90s') facts
    from pf p left join pr e on e.platform=p.platform and e.received_at<=now() group by p.platform),
  -- Rollout claims use the same retained identity/device scope as the counts. Registry rows alone
  -- never turn an externally unmeasured platform into a measured zero after team-only QA.
  retained as materialized(select * from history where received_at>=now()-interval '35 days' and received_at<=now()),
  coverage as(select p.platform,jsonb_build_object('rolloutSince',min(c.received_at),
    'readStartedSince',min(c.received_at) filter(where c.kind='read_started'),
    'readReceivedSince',min(c.received_at) filter(where c.kind='read_received'),
    'readRenderedSince',min(c.received_at) filter(where c.kind='read_rendered'),
    'webviewTerminationSince',min(c.received_at) filter(where c.kind='webview_terminated'),
    'scope','instrumented_clients_only','legacyClients','unmeasured','crashes',false) facts
    from pf p left join retained c on c.platform=p.platform group by p.platform),
  build_reports as materialized(
    select platform,app_version,app_build,install_hash,received_at,kind,false active from retained where received_at>=now()-interval '7 days'
    union all select platform,app_version,app_build,install_hash,received_at,null,foreground and expires_at>now() from pr where received_at>=now()-interval '7 days' and received_at<=now()),
  build_groups as(select platform,app_version,app_build,
    count(distinct install_hash) filter(where received_at>=now()-interval '24 hours') reported_installs,
    count(distinct install_hash) filter(where active) foreground_installs,max(received_at) latest_at,
    min(received_at) filter(where kind is not null) coverage_since,
    min(received_at) filter(where kind='read_started') started_since,min(received_at) filter(where kind='read_received') received_since,
    min(received_at) filter(where kind='read_rendered') rendered_since,
    row_number() over(partition by platform order by max(received_at) desc,app_version,app_build) rank
    from build_reports where app_version<>'unknown' and app_build<>'unknown' group by platform,app_version,app_build),
  builds as(select platform,jsonb_build_object('appVersion',app_version,'appBuild',app_build,
    'reportedInstalls24h',reported_installs,'foregroundInstalls',foreground_installs,'latestReportAt',latest_at,
    'coverageSince',coverage_since,'readStartedSince',started_since,'readReceivedSince',received_since,'readRenderedSince',rendered_since) facts
    from build_groups where rank<=20),
  platform_facts as(select p.platform,jsonb_build_object('presence',(select facts from presence where platform=p.platform),
    'windows',(select jsonb_object_agg(label,facts) from windows where platform=p.platform),
    'latest',(select facts from latest where platform=p.platform),'coverage',(select facts from coverage where platform=p.platform),
    'builds',coalesce((select jsonb_agg(facts order by facts->>'appVersion',facts->>'appBuild') from builds where platform=p.platform),'[]'::jsonb)) facts from pf p)
  select jsonb_build_object('presenceTtlSeconds',90,'health',bobby_client_telemetry_health(),'platforms',(select jsonb_object_agg(platform,facts) from platform_facts),
    'coverage',jsonb_build_object('protocolVersion',1,'scope','instrumented_clients_only','legacyClients','unmeasured','crashes',false,'successRate',null,
      'eventTimeScope','server_received','buildLabelScope','self_reported_recent_7d_capped_20','retentionDays',35,'presenceRetentionDays',7,'presenceTimeScope','client_reported','readVerification','server_authenticated_success_receipt'));
$$;
revoke all on function public.bobby_admin_client_live(boolean) from public,anon,authenticated;
grant execute on function public.bobby_admin_client_live(boolean) to service_role;

-- Keep the immutable phase1 server snapshot implementation and all previous JSON fields.
-- Rename once; reapplication replaces only the additive wrapper, with no DROP/CASCADE.
do $$ begin
  if to_regprocedure('public.bobby_admin_server_live(boolean)') is null then
    alter function public.bobby_admin_live(boolean) rename to bobby_admin_server_live;
  end if;
end $$;
revoke all on function public.bobby_admin_server_live(boolean) from public,anon,authenticated;
grant execute on function public.bobby_admin_server_live(boolean) to service_role;
create or replace function public.bobby_admin_live(p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare server jsonb; client jsonb;
begin
  server:=bobby_admin_server_live(p_internal);
  begin client:=bobby_admin_client_live(p_internal);
  exception when others then client:=null;
  end;
  return server||jsonb_build_object('client',client);
end;
$$;
revoke all on function public.bobby_admin_live(boolean) from public,anon,authenticated;
grant execute on function public.bobby_admin_live(boolean) to service_role;
notify pgrst,'reload schema';
