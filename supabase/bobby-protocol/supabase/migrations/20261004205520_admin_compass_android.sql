-- Extend existing service-only aggregates to every platform already recorded by the server.
-- Android client presence/render reports remain unmeasured; no ingestion flag or payment state changes.
-- Recognize the explicit desk_entered source alongside legacy visit events.
-- Apply after the first-party telemetry migration that created bobby_admin_server_live.

create or replace function public.bobby_admin_server_live(p_internal boolean default false)
returns jsonb language sql stable security invoker set search_path = public, pg_temp set jit = off as $$
  with team_accounts as materialized (select bobby_internal_identity_ids() as id),
  team_devices as materialized (select bobby_internal_device_hashes() as id),
  ev as materialized (
    select e.* from bobby_events e where e.platform in ('ios', 'web', 'android') and (coalesce(p_internal,false) or not
      case when e.identity_id is not null then coalesce(e.identity_id in (select id from team_accounts),false)
      else coalesce(e.device_hash in (select id from team_devices),false) end)
  ), rd as materialized (
    select r.* from bobby_reads r where r.platform in ('ios', 'web', 'android') and (coalesce(p_internal,false) or not
      case when r.identity_id is not null then coalesce(r.identity_id in (select id from team_accounts),false)
      else coalesce(r.device_hash in (select id from team_devices),false) end)
  ), periods(label,minutes) as (values ('15m',15), ('1h',60), ('24h',1440)),
  platforms(platform) as (values ('ios'),('web'),('android')),
  touches as materialized (
    select platform,device_hash,identity_id,created_at from ev where created_at >= now()-interval '24 hours' and created_at <= now()
    union all
    select platform,device_hash,identity_id,created_at from rd where created_at >= now()-interval '24 hours' and created_at <= now()
  ), window_platform as (
    select p.label,p.minutes,pf.platform,jsonb_build_object(
      'observedDevices',(select count(distinct device_hash) from touches t where t.platform=pf.platform and t.created_at >= now()-make_interval(mins=>p.minutes)),
      'observedAccounts',(select count(distinct identity_id) from touches t where t.platform=pf.platform and t.created_at >= now()-make_interval(mins=>p.minutes)),
      'events',count(e.id),
      'consumed',(select count(*) from rd r where r.platform=pf.platform and r.created_at >= now()-make_interval(mins=>p.minutes) and r.created_at <= now()),
      'completed',count(e.id) filter(where e.event='read_done'),
      'failed',count(e.id) filter(where e.event='read_failed' and e.detail is distinct from 'left'),
      'abandoned',count(e.id) filter(where e.event='read_abandoned' or (e.event='read_failed' and e.detail='left')),
      'wallSignin',count(e.id) filter(where e.event='wall_signin'),
      'wallPaywall',count(e.id) filter(where e.event='wall_paywall'),
      'wallLevel',count(e.id) filter(where e.event='wall_level'),
      'blocked',coalesce((select jsonb_object_agg(detail,n) from (
        select coalesce(be.detail,'other') as detail,count(*) as n from ev be
        where be.platform=pf.platform and be.event='desk_blocked' and be.created_at >= now()-make_interval(mins=>p.minutes) and be.created_at <= now()
        group by 1) b),'{}'::jsonb)) as facts
    from periods p cross join platforms pf left join ev e on e.platform=pf.platform
      and e.created_at >= now()-make_interval(mins=>p.minutes) and e.created_at <= now()
    group by p.label,p.minutes,pf.platform
  ), period_facts as (
    select label,jsonb_build_object('minutes',minutes,'since',now()-make_interval(mins=>minutes)) || jsonb_object_agg(platform,facts) as facts
    from window_platform group by label,minutes
  ), latest as (
    select pf.platform,jsonb_build_object(
      'latestEventAt',max(e.created_at),
      'latestOutcomeAt',max(e.created_at) filter(where e.event in ('read_done','read_failed','read_abandoned','wall_signin','wall_paywall','wall_level','desk_blocked')),
      'latestCompletedAt',max(e.created_at) filter(where e.event='read_done'),
      'latestReadConsumptionAt',(select max(r.created_at) from rd r where r.platform=pf.platform and r.created_at <= now()))
      -- Source observation is independent of the selected team/customer population.
      -- Internal-only Android QA establishes server capture, while external counts remain zero.
      || case when pf.platform='android' then jsonb_build_object('coverage',jsonb_build_object(
        'readConsumptionCoverageSince',(select min(created_at) from bobby_reads where platform='android' and created_at<=now()),
        'outcomeCoverageSince',(select min(created_at) from bobby_events where platform='android' and created_at<=now()
          and event in ('read_done','read_failed','read_abandoned','wall_signin','wall_paywall','wall_level','desk_blocked')),
        'eventCoverageSince',(select min(created_at) from bobby_events where platform='android' and created_at<=now())))
      else '{}'::jsonb end as facts
    from platforms pf left join ev e on e.platform=pf.platform and e.created_at <= now() group by pf.platform
  ), models as (
    select provider,model,count(*) as calls,count(*) filter(where not ok) as failures,coalesce(sum(usd),0) as usd,
      percentile_cont(0.5) within group(order by latency_ms) filter(where latency_ms >= 0) as p50,
      percentile_cont(0.95) within group(order by latency_ms) filter(where latency_ms >= 0) as p95,
      max(created_at) as last_at,max(created_at) filter(where not ok) as failed_at
    from bobby_llm_usage where created_at >= now()-interval '24 hours' and created_at <= now() and provider <> 'none' and role is distinct from 'left'
    group by provider,model
  )
  select jsonb_build_object('snapshotAt',now(),'includeInternal',coalesce(p_internal,false),
    'windows',(select jsonb_object_agg(label,facts) from period_facts),
    'platforms',(select jsonb_object_agg(platform,facts) from latest),
    'providers',coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'model',model,'calls24h',calls,'failures24h',failures,
      'usd24h',usd,'callLatencyP50Ms',p50,'callLatencyP95Ms',p95,'lastCallAt',last_at,'lastFailureAt',failed_at) order by provider,model) from models),'[]'::jsonb),
    'coverage',jsonb_build_object('readStarted',false,'clientRendered',false,'crashes',false,'buildVersion',false,'onlinePresence',false,
      'eventCoverageSince',(select min(created_at) from bobby_events),
      'outcomeCoverageSince',(select min(created_at) from bobby_events where event in ('read_done','read_failed','read_abandoned','wall_signin','wall_paywall','wall_level','desk_blocked')),
      'readConsumptionCoverageSince',(select min(created_at) from bobby_reads),
      'llmLedgerCoverageSince',(select min(created_at) from bobby_llm_usage),
      'providerCostsIncludeInternal',true,'completedScope','server_read_done','latencyScope','provider_call',
      'observedActivityScope','events_and_consumed_reads','successRate',null));
$$;
revoke all on function public.bobby_admin_server_live(boolean) from public, anon, authenticated;
grant execute on function public.bobby_admin_server_live(boolean) to service_role;

create or replace function public.bobby_admin_device_facts()
returns table (
  device_hash text, platform text, source text, first_seen timestamptz, last_seen timestamptz, first_surface text,
  referrer text, utm_source text, country text, internal boolean,
  home boolean, desk boolean, signin_at timestamptz, wall_at timestamptz, delivered int, failed int, abandoned int,
  first_read_at timestamptz, reads int, link_identity uuid, link_email text, link_at timestamptz, account_new boolean, pro boolean,
  d1 boolean, d1_read boolean, d7 boolean, d7_read boolean, w1 boolean, w1_read boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  with links as (
    select distinct on (l.device_hash) l.device_hash, l.identity_id, l.first_at, b.created_at as identity_created, b.email
    from bobby_device_accounts l join bobby_identities b on b.id = l.identity_id and b.auth_user_id is not null
    order by l.device_hash, l.first_at
  ), ev as (
    select e.device_hash,
      bool_or(e.event = 'visit' and e.surface = 'home') as home,
      bool_or((e.event = 'visit' and e.surface = 'desk') or e.event = 'desk_entered') as desk,
      min(e.created_at) filter (where e.event = 'signin_start') as signin_at,
      min(e.created_at) filter (where e.event = 'wall_signin') as wall_at,
      count(*) filter (where e.event = 'read_done')::int as delivered,
      count(*) filter (where e.event = 'read_failed' and e.detail is distinct from 'left')::int as failed,
      count(*) filter (where e.event = 'read_abandoned' or (e.event = 'read_failed' and e.detail = 'left'))::int as abandoned
    from bobby_events e where e.device_hash is not null group by 1
  ), days as (
    select dv.device_hash, (dv.first_seen at time zone 'utc')::date as d0, a.day, a.reads
    from bobby_devices dv join bobby_activity_days a on a.subject = 'd:' || dv.device_hash
    union all
    select dv.device_hash, (dv.first_seen at time zone 'utc')::date, a.day, a.reads
    from bobby_devices dv join links lk on lk.device_hash = dv.device_hash join bobby_activity_days a on a.subject = 'a:' || lk.identity_id::text
  ), act as (
    select device_hash,
      bool_or(day = d0 + 1) as d1, bool_or(day = d0 + 1 and reads > 0) as d1_read,
      bool_or(day = d0 + 7) as d7, bool_or(day = d0 + 7 and reads > 0) as d7_read,
      bool_or(day between d0 + 1 and d0 + 7) as w1, bool_or(day between d0 + 1 and d0 + 7 and reads > 0) as w1_read
    from days group by device_hash
  )
  select dv.device_hash, dv.platform, dv.source, dv.first_seen, dv.last_seen, dv.first_surface, dv.referrer, dv.utm_source, dv.country,
    coalesce(dv.device_hash in (select bobby_internal_device_hashes()), false),
    coalesce(ev.home, false), coalesce(ev.desk, false), ev.signin_at, ev.wall_at, coalesce(ev.delivered, 0), coalesce(ev.failed, 0), coalesce(ev.abandoned, 0),
    dv.first_read_at, dv.reads, lk.identity_id, lk.email, lk.first_at,
    lk.identity_id is not null and lk.identity_created >= dv.first_seen - interval '2 minutes',
    lk.identity_id is not null and bobby_is_pro(lk.identity_id),
    coalesce(act.d1, false), coalesce(act.d1_read, false), coalesce(act.d7, false), coalesce(act.d7_read, false),
    coalesce(act.w1, false), coalesce(act.w1_read, false)
  from bobby_devices dv
  left join ev on ev.device_hash = dv.device_hash
  left join links lk on lk.device_hash = dv.device_hash
  left join act on act.device_hash = dv.device_hash;
$$;
revoke all on function public.bobby_admin_device_facts() from public, anon, authenticated;
grant execute on function public.bobby_admin_device_facts() to service_role;

create or replace function public.bobby_admin_growth(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp set jit = off as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  today date := (now() at time zone 'utc')::date;
  incl boolean := coalesce(p_internal, false);
  people jsonb; cohorts jsonb := '{}'::jsonb; history jsonb := '{}'::jsonb; outcomes jsonb; acquisition jsonb; coverage jsonb; attention jsonb;
  pf text;
begin
  -- People today, deduplicated (an account and its installs are one person).
  with p as (select * from bobby_admin_people_facts_v2()), v as (select * from p where incl or not internal),
  s as (
    select v.*, case
      when v.pro then 'pro'
      when v.last_day > today - 7 and v.reads = 0 then 'new'
      when v.last_day > today - 7 and v.read_days_14 >= 2 then 'recurring'
      when v.last_day > today - 7 then 'active'
      when v.last_day > today - 30 then 'atRisk'
      else 'lost' end as stage
    from v
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'accounts', (select count(*) from s where kind = 'account'),
    'guests', (select count(*) from s where kind = 'guest'),
    'wallets', (select count(*) from bobby_identities where auth_user_id is null),
    'excluded', jsonb_build_object('accounts', (select count(*) from p where internal and kind = 'account' and not incl),
                                   'guests', (select count(*) from p where internal and kind = 'guest' and not incl)),
    'newInPeriod', (select count(*) from s where first_seen >= since),
    'active7d', (select count(*) from s where last_day > today - 7),
    'active30d', (select count(*) from s where last_day > today - 30),
    'readers7d', (select count(*) from s where read_7),
    'readers', (select count(*) from s where reads > 0),
    'stages', jsonb_build_object(
      'new', (select count(*) from s where stage = 'new'), 'active', (select count(*) from s where stage = 'active'),
      'recurring', (select count(*) from s where stage = 'recurring'), 'pro', (select count(*) from s where stage = 'pro'),
      'atRisk', (select count(*) from s where stage = 'atRisk'), 'lost', (select count(*) from s where stage = 'lost')),
    'byPlatform', coalesce((select jsonb_object_agg(k, n) from (select coalesce(platform, 'unknown') k, count(*) n from s group by 1) x), '{}'::jsonb),
    'proInactive', (select count(*) from s where pro and last_day <= today - 14),
    'proPaidVerified', (select count(*) from s where paid_verified),
    'proInactivePaid', (select count(*) from s where paid_verified and last_day <= today - 14),
    'accountsNeverRead', (select count(*) from s where kind = 'account' and reads = 0)
  ) into people;

  -- Cohorts: installs seen arriving in the period, per platform, each step a subset of the one before it.
  foreach pf in array array['web', 'ios', 'android'] loop
    cohorts := cohorts || jsonb_build_object(pf, (
      with c as (
        select * from bobby_admin_device_facts() f
        where f.platform = pf and f.source = 'observed' and f.first_seen >= since and (incl or not f.internal)
      ), x as (
        select c.*, (c.first_read_at is not null and c.first_read_at >= c.first_seen - interval '5 seconds') as read1,
          (c.link_identity is not null and c.link_at >= c.first_seen - interval '2 minutes') as account,
          (c.first_seen at time zone 'utc')::date as d0
        from c
      )
      select jsonb_build_object(
        'arrived', count(*),
        'home', count(*) filter (where home),
        'deskOrRead', count(*) filter (where desk or read1),
        'read1', count(*) filter (where read1),
        'read2', count(*) filter (where read1 and reads >= 2),
        'read3', count(*) filter (where read1 and reads >= 3),
        'wall', count(*) filter (where read1 and wall_at is not null),
        'signinStart', count(*) filter (where signin_at is not null),
        'account', count(*) filter (where account),
        'accountNew', count(*) filter (where account and account_new),
        'accountAfterRead', count(*) filter (where account and read1),
        'accountAfterWall', count(*) filter (where account and read1 and wall_at is not null and link_at >= wall_at),
        'proAfterRead', count(*) filter (where account and read1 and pro),
        'delivered', coalesce(sum(delivered), 0), 'failed', coalesce(sum(failed), 0), 'abandoned', coalesce(sum(abandoned), 0),
        'medianMinutesToFirstRead', round((percentile_cont(0.5) within group (order by extract(epoch from (first_read_at - first_seen)) / 60)
            filter (where read1))::numeric, 1),
        'medianMinutesToAccount', round((percentile_cont(0.5) within group (order by extract(epoch from (link_at - first_seen)) / 60)
            filter (where account))::numeric, 1),
        'oldestDays', coalesce(max(today - d0), 0),
        'retention', jsonb_build_object(
          'd1', jsonb_build_object('eligible', count(*) filter (where d0 + 1 < today), 'returned', count(*) filter (where d0 + 1 < today and d1),
                  'read', count(*) filter (where d0 + 1 < today and d1_read)),
          'd7', jsonb_build_object('eligible', count(*) filter (where d0 + 7 < today), 'returned', count(*) filter (where d0 + 7 < today and d7),
                  'read', count(*) filter (where d0 + 7 < today and d7_read)),
          'w1', jsonb_build_object('eligible', count(*) filter (where d0 + 7 < today), 'returned', count(*) filter (where d0 + 7 < today and w1),
                  'read', count(*) filter (where d0 + 7 < today and w1_read)),
          -- Readers only: did someone who got an answer come back on a later day (within their first week so far)?
          'readersBack', jsonb_build_object('eligible', count(*) filter (where read1 and d0 + 1 < today), 'returned', count(*) filter (where read1 and d0 + 1 < today and w1),
                  'read', count(*) filter (where read1 and d0 + 1 < today and w1_read)))
      ) from x));
    -- The installs rebuilt from their reads: what they did, never mixed into a cohort.
    history := history || jsonb_build_object(pf, (
      select jsonb_build_object('installs', count(*), 'readers', count(*) filter (where reads > 0), 'reads', coalesce(sum(reads), 0),
        'read2', count(*) filter (where reads >= 2), 'linked', count(*) filter (where link_identity is not null),
        'installsInPeriod', count(*) filter (where first_seen >= since),
        'since', min(first_seen), 'until', max(first_seen))
      from bobby_admin_device_facts() f where f.platform = pf and f.source = 'backfill' and (incl or not f.internal)));
  end loop;

  -- What happened at the desk in the period (outside traffic unless asked).
  with r as (
    select r.*, (case when r.identity_id is not null then coalesce(r.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(r.device_hash in (select bobby_internal_device_hashes()), false) end) as internal from bobby_reads r where r.created_at >= since
  ), e as (
    select e.*, (case when e.identity_id is not null then coalesce(e.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(e.device_hash in (select bobby_internal_device_hashes()), false) end) as internal
    from bobby_events e where e.created_at >= since and e.event in ('read_done', 'read_failed', 'read_abandoned', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked')
  )
  select jsonb_build_object(
    'consumed', (select count(*) from r where incl or not internal),
    'consumedInternal', (select count(*) from r where internal),
    'consumedTotal', (select count(*) from r),
    'byPlatform', coalesce((select jsonb_object_agg(platform, n) from (select platform, count(*) n from r where incl or not internal group by 1) x), '{}'::jsonb),
    'delivered', (select count(*) from e where event = 'read_done' and (incl or not internal)),
    'failed', (select count(*) from e where event = 'read_failed' and detail is distinct from 'left' and (incl or not internal)),
    'failedBy', coalesce((select jsonb_object_agg(coalesce(detail,'other'),n) from (select detail,count(*) n from e where event='read_failed' and detail is distinct from 'left' and (incl or not internal) group by 1) f),'{}'::jsonb),
    'abandoned', (select count(*) from e where (event = 'read_abandoned' or (event='read_failed' and detail='left')) and (incl or not internal)),
    'wallSignin', (select count(*) from e where event = 'wall_signin' and (incl or not internal)),
    'wallSigninInstalls', (select count(distinct device_hash) from e where event = 'wall_signin' and (incl or not internal)),
    'wallPaywall', (select count(*) from e where event = 'wall_paywall' and (incl or not internal)),
    'wallLevel', (select count(*) from e where event = 'wall_level' and (incl or not internal)),
    'blocked', coalesce((select jsonb_object_agg(coalesce(detail, 'other'), n) from (select detail, count(*) n from e where event = 'desk_blocked' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'byLevel', coalesce((select jsonb_object_agg(coalesce(detail, 'rapido'), n) from (select detail, count(*) n from e where event = 'read_done' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'outcomesSince', (select min(created_at) from bobby_events where event in ('read_done', 'read_failed', 'read_abandoned', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked'))
  ) into outcomes;

  -- Where the period's new web installs came from (first touch), and how far each source got.
  with c as (
    select f.*, (f.first_read_at is not null and f.first_read_at >= f.first_seen - interval '5 seconds') as read1,
      (f.link_identity is not null and f.link_at >= f.first_seen - interval '2 minutes') as account,
      case when f.utm_source is not null then 'utm:' || f.utm_source when f.referrer is not null then f.referrer else 'direct' end as src
    from bobby_admin_device_facts() f
    where f.platform = 'web' and f.source = 'observed' and f.first_seen >= since and (incl or not f.internal)
  ), v as (
    select ev.* from bobby_events ev where ev.event = 'visit' and ev.platform = 'web' and ev.created_at >= since
      and (incl or not (case when ev.identity_id is not null then coalesce(ev.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(ev.device_hash in (select bobby_internal_device_hashes()), false) end))
  )
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', src, 'installs', n, 'read1', r1, 'account', ac) order by n desc, src) from (
        select src, count(*) n, count(*) filter (where read1) r1, count(*) filter (where account) ac from c group by src) x), '[]'::jsonb),
    'landing', coalesce((select jsonb_agg(jsonb_build_object('surface', s, 'installs', n, 'read1', r1) order by n desc, s) from (
        select coalesce(first_surface, 'unknown') s, count(*) n, count(*) filter (where read1) r1 from c group by 1) x), '[]'::jsonb),
    'visits', (select count(*) from v),
    'visitors', (select count(distinct device_hash) from v),
    'visitsWithUtm', (select count(*) from v where utm_source is not null),
    'visitsWithReferrer', (select count(*) from v where referrer is not null),
    'visitorDays', coalesce((select jsonb_agg(n order by g) from (
        select g, (select count(distinct v.device_hash) from v where v.created_at >= g and v.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) z), '[]'::jsonb)
  ) into acquisition;

  -- Accounts that need a nudge: outside accounts that never read, and outside readers gone quiet.
  with p as (select * from bobby_admin_people_facts_v2() where kind = 'account' and (incl or not internal))
  select jsonb_build_object(
    'neverRead', coalesce((select jsonb_agg(jsonb_build_object('identityId', identity_id, 'email', email, 'provider', provider, 'createdAt', first_seen, 'lastDay', last_day) order by first_seen desc)
        from (select * from p where reads = 0 order by first_seen desc limit 20) x), '[]'::jsonb),
    'quiet', coalesce((select jsonb_agg(jsonb_build_object('identityId', identity_id, 'email', email, 'provider', provider, 'reads', reads, 'lastDay', last_day) order by last_day desc)
        from (select * from p where reads > 0 and last_day <= today - 7 order by last_day desc limit 20) x), '[]'::jsonb)
  ) into attention;

  select jsonb_build_object(
    'webObservedSince', (select min(created_at) from bobby_events where platform = 'web'),
    'iosObservedSince', (select min(first_seen) from bobby_devices where platform = 'ios' and source = 'observed'),
    'androidObservedSince', (select min(first_seen) from bobby_devices where platform = 'android' and source = 'observed'),
    'activitySince', (select min(day) from bobby_activity_days),
    'outcomesSince', outcomes -> 'outcomesSince',
    'observedInstalls', (select count(*) from bobby_devices where source = 'observed'),
    'backfillInstalls', (select count(*) from bobby_devices where source = 'backfill'),
    'internalInstalls', (select count(*) from bobby_admin_device_facts() where internal),
    'internalAccounts', (select count(*) from bobby_identities b where b.auth_user_id is not null and coalesce(b.id in (select bobby_internal_identity_ids()), false))
  ) into coverage;

  return jsonb_build_object('days', d, 'since', since, 'today', today, 'includeInternal', incl, 'people', people,
    'cohorts', cohorts, 'history', history, 'outcomes', outcomes, 'acquisition', acquisition, 'attention', attention, 'coverage', coverage);
end;
$$;
revoke all on function public.bobby_admin_growth(int, boolean) from public, anon, authenticated;
grant execute on function public.bobby_admin_growth(int, boolean) to service_role;

notify pgrst, 'reload schema';
