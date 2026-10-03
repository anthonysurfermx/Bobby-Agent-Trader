alter table public.bobby_subscriptions add column if not exists environment text check (environment in ('production', 'sandbox'));
alter table public.bobby_subscriptions add column if not exists period_type text check (period_type in ('normal', 'trial', 'intro', 'prepaid'));

alter table public.bobby_activity_days add column if not exists anon_touches int not null default 0 check (anon_touches >= 0);
alter table public.bobby_activity_days add column if not exists anon_reads int not null default 0 check (anon_reads >= 0);
update public.bobby_activity_days a set anon_reads = greatest(a.reads - coalesce((
    select count(*) from public.bobby_reads r
    where r.identity_id is not null and 'd:' || r.device_hash = a.subject and (r.created_at at time zone 'utc')::date = a.day), 0), 0)
  where a.subject like 'd:%';
update public.bobby_activity_days a set anon_touches = case
    when a.day < date '2026-10-01' then a.touches
    when exists (select 1 from public.bobby_device_accounts l join public.bobby_activity_days x on x.subject = 'a:' || l.identity_id::text and x.day = a.day
                 where 'd:' || l.device_hash = a.subject and x.touches > 0) then 0
    else a.touches end
  where a.subject like 'd:%';

create or replace function public.bobby_internal_subjects(p_with_networks boolean default true)
returns table (kind text, id text) language sql stable security invoker set search_path = public, pg_temp as $$
  with recursive seeds(kind, id) as (
    select 'a'::text, identity_id::text from bobby_admins
    union select 'a', identity_id::text from bobby_internal_marks
    union select 'a', b.id::text from bobby_identities b join bobby_admin_settings s on s.key = 'internal_emails'
      where nullif(b.email, '') is not null and s.value ? lower(b.email)
    union select 'd', device_hash from bobby_devices where internal or admin_session
    union select 'd', dn.device_hash from bobby_device_networks dn
      join bobby_internal_networks n on n.network_hash = dn.network_hash and not n.ignored
      where coalesce(p_with_networks, true)
  ), walk(kind, id) as (
    select kind, id from seeds
    union
    select case when w.kind = 'a' then 'd' else 'a' end, case when w.kind = 'a' then l.device_hash else l.identity_id::text end
    from walk w join bobby_device_accounts l on case when w.kind = 'a' then l.identity_id::text = w.id else l.device_hash = w.id end
  )
  select kind, id from walk;
$$;

create or replace function public.bobby_internal_identity_ids()
returns setof uuid language sql stable security invoker set search_path = public, pg_temp as $$
  select id::uuid from bobby_internal_subjects(true) where kind = 'a';
$$;

create or replace function public.bobby_internal_device_hashes()
returns setof text language sql stable security invoker set search_path = public, pg_temp as $$
  select id from bobby_internal_subjects(true) where kind = 'd';
$$;

create or replace function public.bobby_touch_device(p_device text, p_platform text, p_surface text, p_referrer text, p_utm text, p_identity uuid,
  p_country text default null, p_region text default null, p_network text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := bobby_geo_country(p_country); r text := bobby_geo_region(p_country, p_region);
        pf text := case when p_platform in ('ios', 'android') then p_platform else 'web' end;
        today date := (now() at time zone 'utc')::date;
        net text := case when length(p_network) between 8 and 128 then p_network end;
begin
  if p_device is null or length(p_device) not between 8 and 128 then return; end if;
  insert into bobby_devices as d (device_hash, platform, first_surface, referrer, utm_source, identity_id, linked_at, country, region, network_hash)
    values (p_device, pf,
      case when p_surface ~ '^[a-z0-9_-]{1,32}$' then p_surface end,
      case when p_referrer ~ '^[a-z0-9.-]{1,80}$' then p_referrer end,
      case when p_utm ~ '^[a-z0-9_.-]{1,40}$' then p_utm end,
      p_identity, case when p_identity is not null then now() end, c, r, net)
  on conflict (device_hash) do update set
    active_days = d.active_days + case when (d.last_seen at time zone 'utc')::date < today then 1 else 0 end,
    last_seen = greatest(d.last_seen, now()),
    first_surface = coalesce(d.first_surface, excluded.first_surface),
    identity_id = coalesce(excluded.identity_id, d.identity_id),
    linked_at = case when excluded.identity_id is not null and d.identity_id is distinct from excluded.identity_id then now() else d.linked_at end,
    country = coalesce(excluded.country, d.country),
    region = case when excluded.country is not null then excluded.region else d.region end,
    network_hash = coalesce(excluded.network_hash, d.network_hash);
  if net is not null then
    insert into bobby_device_networks as dn (device_hash, network_hash) values (p_device, net)
      on conflict (device_hash, network_hash) do update set last_at = now();
  end if;
  if p_identity is not null then
    insert into bobby_device_accounts as l (device_hash, identity_id) values (p_device, p_identity)
      on conflict (device_hash, identity_id) do update set last_at = now();
    insert into bobby_activity_days as a (subject, day, platform, touches) values ('a:' || p_identity::text, today, pf, 1)
      on conflict (subject, day) do update set touches = a.touches + 1;
  end if;
  insert into bobby_activity_days as a (subject, day, platform, touches, anon_touches)
    values ('d:' || p_device, today, pf, 1, case when p_identity is null then 1 else 0 end)
    on conflict (subject, day) do update set touches = a.touches + 1, anon_touches = a.anon_touches + excluded.anon_touches;
end;
$$;

create or replace function public.bobby_track_reader()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare key text; dday date := (new.created_at at time zone 'utc')::date;
begin
  if new.identity_id is null and new.device_hash is null then return new; end if;
  key := case when new.identity_id is not null then 'a:' || new.identity_id::text else 'd:' || new.device_hash end;
  begin
    insert into bobby_reader_stats as s (reader, identity_id, device_hash, platform, first_read_at, last_read_at, reads)
      values (key, new.identity_id, case when new.identity_id is null then new.device_hash end, new.platform, new.created_at, new.created_at, 1)
      on conflict (reader) do update set last_read_at = greatest(s.last_read_at, excluded.last_read_at), reads = s.reads + 1;
    if new.device_hash is not null then
      perform bobby_touch_device(new.device_hash, new.platform, null, null, null, new.identity_id);
      update bobby_devices set first_seen = least(first_seen, new.created_at),
        first_read_at = least(coalesce(first_read_at, new.created_at), new.created_at), reads = reads + 1
        where device_hash = new.device_hash;
      insert into bobby_activity_days as a (subject, day, platform, reads, anon_reads)
        values ('d:' || new.device_hash, dday, new.platform, 1, case when new.identity_id is null then 1 else 0 end)
        on conflict (subject, day) do update set reads = a.reads + 1, anon_reads = a.anon_reads + excluded.anon_reads;
    end if;
    if new.identity_id is not null then
      insert into bobby_activity_days as a (subject, day, platform, reads) values ('a:' || new.identity_id::text, dday, new.platform, 1)
        on conflict (subject, day) do update set reads = a.reads + 1;
    end if;
  exception when others then
    raise warning 'bobby_track_reader: %', sqlerrm;
  end;
  return new;
end;
$$;

create or replace function public.bobby_admin_internal_networks()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with strong as (select * from bobby_internal_subjects(false))
  select coalesce(jsonb_agg(jsonb_build_object(
      'network', left(n.network_hash, 10), 'note', n.note, 'createdAt', n.created_at, 'lastSeenAt', n.last_seen_at,
      'installs', x.installs, 'onlyByNetwork', x.only_by_network, 'accountsOnlyByNetwork', x.accounts_only) order by n.last_seen_at desc), '[]'::jsonb)
  from bobby_internal_networks n
  cross join lateral (
    select count(*) as installs,
      count(*) filter (where dn.device_hash not in (select id from strong where kind = 'd')) as only_by_network,
      (select count(distinct l.identity_id) from bobby_device_accounts l join bobby_device_networks dn2 on dn2.device_hash = l.device_hash
        where dn2.network_hash = n.network_hash and l.identity_id::text not in (select id from strong where kind = 'a')) as accounts_only
    from bobby_device_networks dn
    where dn.network_hash = n.network_hash
  ) x
  where not n.ignored;
$$;

drop function if exists public.bobby_admin_device_facts();
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
      bool_or(e.event = 'visit' and e.surface = 'desk') as desk,
      min(e.created_at) filter (where e.event = 'signin_start') as signin_at,
      min(e.created_at) filter (where e.event = 'wall_signin') as wall_at,
      count(*) filter (where e.event = 'read_done')::int as delivered,
      count(*) filter (where e.event = 'read_failed' and e.detail is distinct from 'left')::int as failed,
      count(*) filter (where e.event = 'read_failed' and e.detail = 'left')::int as abandoned
    from bobby_events e where e.device_hash is not null group by 1
  ), act as (
    select dv.device_hash,
      bool_or(a.day = f.d0 + 1) as d1, bool_or(a.day = f.d0 + 1 and a.reads > 0) as d1_read,
      bool_or(a.day = f.d0 + 7) as d7, bool_or(a.day = f.d0 + 7 and a.reads > 0) as d7_read,
      bool_or(a.day between f.d0 + 1 and f.d0 + 7) as w1, bool_or(a.day between f.d0 + 1 and f.d0 + 7 and a.reads > 0) as w1_read
    from bobby_devices dv
    cross join lateral (select (dv.first_seen at time zone 'utc')::date as d0) f
    left join links lk on lk.device_hash = dv.device_hash
    join bobby_activity_days a on a.subject = 'd:' || dv.device_hash or (lk.identity_id is not null and a.subject = 'a:' || lk.identity_id::text)
    group by dv.device_hash
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

drop function if exists public.bobby_admin_people_facts();
create or replace function public.bobby_admin_people_facts()
returns table (
  person text, kind text, identity_id uuid, email text, provider text, platform text, internal boolean,
  first_seen timestamptz, reads int, pro boolean, last_day date, read_days_14 int, read_7 boolean, first_read_at timestamptz, last_read_day date)
language sql stable security invoker set search_path = public, pg_temp as $$
  with paired as (
    select distinct on (l.device_hash) l.device_hash, l.identity_id
    from bobby_device_accounts l join bobby_identities b on b.id = l.identity_id and b.auth_user_id is not null
    order by l.device_hash, l.first_at
  ), people as (
    select 'a:' || b.id::text as person, 'account'::text as kind, b.id as identity_id, b.email, b.provider,
      coalesce((select dv.platform from paired p join bobby_devices dv on dv.device_hash = p.device_hash where p.identity_id = b.id order by dv.first_seen limit 1), s.platform) as platform,
      coalesce(b.id in (select bobby_internal_identity_ids()), false) as internal, b.created_at as first_seen,
      (coalesce(s.reads, 0) + coalesce((select sum(g.reads) from paired p join bobby_reader_stats g on g.reader = 'd:' || p.device_hash where p.identity_id = b.id), 0))::int as reads,
      bobby_is_pro(b.id) as pro,
      least(s.first_read_at, (select min(g.first_read_at) from paired p join bobby_reader_stats g on g.reader = 'd:' || p.device_hash where p.identity_id = b.id)) as first_read_at
    from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    where b.auth_user_id is not null
    union all
    select 'd:' || dv.device_hash, 'guest', null, null, null, dv.platform, coalesce(dv.device_hash in (select bobby_internal_device_hashes()), false), dv.first_seen, coalesce(g.reads, 0), false, g.first_read_at
    from bobby_devices dv left join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
    where not exists (select 1 from paired p where p.device_hash = dv.device_hash)
  ), days as (
    select p.person, a.day, a.reads from people p join bobby_activity_days a on a.subject = p.person
    union all
    select 'a:' || pr.identity_id::text, a.day, a.anon_reads from paired pr join bobby_activity_days a on a.subject = 'd:' || pr.device_hash
    where a.anon_touches > 0 or a.anon_reads > 0
  ), agg as (
    select person, max(day) as last_day,
      count(distinct day) filter (where reads > 0 and day > (now() at time zone 'utc')::date - 14)::int as read_days_14,
      bool_or(reads > 0 and day > (now() at time zone 'utc')::date - 7) as read_7,
      max(day) filter (where reads > 0) as last_read_day
    from days group by person
  )
  select p.person, p.kind, p.identity_id, p.email, p.provider, p.platform, p.internal, p.first_seen, p.reads, p.pro,
    greatest(agg.last_day, (p.first_seen at time zone 'utc')::date), coalesce(agg.read_days_14, 0), coalesce(agg.read_7, false), p.first_read_at,
    greatest(agg.last_read_day, (p.first_read_at at time zone 'utc')::date)
  from people p left join agg on agg.person = p.person;
$$;

create or replace function public.bobby_admin_growth(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  today date := (now() at time zone 'utc')::date;
  incl boolean := coalesce(p_internal, false);
  people jsonb; cohorts jsonb := '{}'::jsonb; history jsonb := '{}'::jsonb; outcomes jsonb; acquisition jsonb; coverage jsonb; attention jsonb;
  pf text;
begin
  with p as (select * from bobby_admin_people_facts()), v as (select * from p where incl or not internal),
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
    'accountsNeverRead', (select count(*) from s where kind = 'account' and reads = 0)
  ) into people;

  foreach pf in array array['web', 'ios'] loop
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
          'readersBack', jsonb_build_object('eligible', count(*) filter (where read1 and d0 + 1 < today), 'returned', count(*) filter (where read1 and d0 + 1 < today and w1),
                  'read', count(*) filter (where read1 and d0 + 1 < today and w1_read)))
      ) from x));
    history := history || jsonb_build_object(pf, (
      select jsonb_build_object('installs', count(*), 'readers', count(*) filter (where reads > 0), 'reads', coalesce(sum(reads), 0),
        'read2', count(*) filter (where reads >= 2), 'linked', count(*) filter (where link_identity is not null),
        'installsInPeriod', count(*) filter (where first_seen >= since),
        'since', min(first_seen), 'until', max(first_seen))
      from bobby_admin_device_facts() f where f.platform = pf and f.source = 'backfill' and (incl or not f.internal)));
  end loop;

  with r as (
    select r.*, (case when r.identity_id is not null then coalesce(r.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(r.device_hash in (select bobby_internal_device_hashes()), false) end) as internal from bobby_reads r where r.created_at >= since
  ), e as (
    select e.*, (case when e.identity_id is not null then coalesce(e.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(e.device_hash in (select bobby_internal_device_hashes()), false) end) as internal
    from bobby_events e where e.created_at >= since and e.event in ('read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked')
  )
  select jsonb_build_object(
    'consumed', (select count(*) from r where incl or not internal),
    'consumedInternal', (select count(*) from r where internal),
    'consumedTotal', (select count(*) from r),
    'byPlatform', coalesce((select jsonb_object_agg(platform, n) from (select platform, count(*) n from r where incl or not internal group by 1) x), '{}'::jsonb),
    'delivered', (select count(*) from e where event = 'read_done' and (incl or not internal)),
    'failed', (select count(*) from e where event = 'read_failed' and detail is distinct from 'left' and (incl or not internal)),
    'abandoned', (select count(*) from e where event = 'read_failed' and detail = 'left' and (incl or not internal)),
    'failedBy', coalesce((select jsonb_object_agg(coalesce(detail, 'other'), n) from (select detail, count(*) n from e where event = 'read_failed' and detail is distinct from 'left' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'wallSignin', (select count(*) from e where event = 'wall_signin' and (incl or not internal)),
    'wallSigninInstalls', (select count(distinct device_hash) from e where event = 'wall_signin' and (incl or not internal)),
    'wallPaywall', (select count(*) from e where event = 'wall_paywall' and (incl or not internal)),
    'wallLevel', (select count(*) from e where event = 'wall_level' and (incl or not internal)),
    'blocked', coalesce((select jsonb_object_agg(coalesce(detail, 'other'), n) from (select detail, count(*) n from e where event = 'desk_blocked' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'byLevel', coalesce((select jsonb_object_agg(coalesce(detail, 'rapido'), n) from (select detail, count(*) n from e where event = 'read_done' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'outcomesSince', (select min(created_at) from bobby_events where event in ('read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked'))
  ) into outcomes;

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

  with p as (select * from bobby_admin_people_facts() where kind = 'account' and (incl or not internal))
  select jsonb_build_object(
    'neverRead', coalesce((select jsonb_agg(jsonb_build_object('identityId', identity_id, 'email', email, 'provider', provider, 'createdAt', first_seen, 'lastDay', last_day) order by first_seen desc)
        from (select * from p where reads = 0 order by first_seen desc limit 20) x), '[]'::jsonb),
    'quiet', coalesce((select jsonb_agg(jsonb_build_object('identityId', identity_id, 'email', email, 'provider', provider, 'reads', reads, 'lastDay', last_day) order by last_day desc)
        from (select * from p where reads > 0 and last_day <= today - 7 order by last_day desc limit 20) x), '[]'::jsonb)
  ) into attention;

  select jsonb_build_object(
    'webObservedSince', (select min(created_at) from bobby_events where platform = 'web'),
    'iosObservedSince', timestamptz '2026-10-01 20:45:03+00',
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

create or replace function public.bobby_admin_overview(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  incl boolean := coalesce(p_internal, false);
  reads_since timestamptz := (select min(first_read_at) from bobby_reader_stats);
  days jsonb;
  accounts jsonb; activity jsonb; funnel jsonb; subs jsonb; revenue jsonb; llm jsonb; coupons jsonb;
begin
  select coalesce(jsonb_agg(to_char(g, 'YYYY-MM-DD') order by g), '[]'::jsonb) into days
    from generate_series(since, date_trunc('day', now()), interval '1 day') g;

  with b as (select b.*, coalesce(b.id in (select bobby_internal_identity_ids()), false) as internal from bobby_identities b where b.auth_user_id is not null),
  v as (select * from b where incl or not internal)
  select jsonb_build_object(
    'total', (select count(*) from v),
    'new', (select count(*) from v where created_at >= since),
    'internal', (select count(*) from b where internal),
    'wallets', (select count(*) from bobby_identities where auth_user_id is null),
    'active7d', (select count(*) from v where exists (select 1 from bobby_reader_stats s where s.reader = 'a:' || v.id::text and s.last_read_at > now() - interval '7 days')),
    'byProvider', coalesce((select jsonb_object_agg(p, n) from (select coalesce(provider, 'other') p, count(*) n from v group by 1) x), '{}'::jsonb),
    'daily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(*) from v where v.created_at >= g and v.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into accounts;

  with r as (select * from bobby_reads r where r.created_at >= since and (incl or not (case when r.identity_id is not null then coalesce(r.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(r.device_hash in (select bobby_internal_device_hashes()), false) end))),
  pf as (select * from bobby_admin_people_facts() where incl or not internal)
  select jsonb_build_object(
    'reads', (select count(*) from r),
    'readsInternal', (select count(*) from bobby_reads x where x.created_at >= since and (case when x.identity_id is not null then coalesce(x.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(x.device_hash in (select bobby_internal_device_hashes()), false) end)),
    'readsDaily', (select jsonb_build_object(
        'web', coalesce(jsonb_agg(w order by g), '[]'::jsonb), 'ios', coalesce(jsonb_agg(i order by g), '[]'::jsonb),
        'android', coalesce(jsonb_agg(a order by g), '[]'::jsonb)) from (
        select g,
          count(r.id) filter (where r.platform = 'web') w, count(r.id) filter (where r.platform = 'ios') i,
          count(r.id) filter (where r.platform = 'android') a
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join r on r.created_at >= g and r.created_at < g + interval '1 day' group by g) s),
    'levels', (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb) from (
        select level, count(*) n from bobby_level_uses u where u.created_at >= since and (incl or not (case when u.identity_id is not null then coalesce(u.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(u.device_hash in (select bobby_internal_device_hashes()), false) end)) group by 1) x),
    'activeReaders7d', (select count(*) from pf where read_7),
    'activeReaders7dSplit', jsonb_build_object('accounts', (select count(*) from pf where read_7 and kind = 'account'), 'guests', (select count(*) from pf where read_7 and kind = 'guest')),
    'lastRead', (select jsonb_object_agg(platform, at) from (select platform, max(created_at) at from bobby_reads x where incl or not (case when x.identity_id is not null then coalesce(x.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(x.device_hash in (select bobby_internal_device_hashes()), false) end) group by 1) z),
    'activation', (select jsonb_build_object(
        'accounts', count(*),
        'activated', count(s.reader),
        'medianMinutes', case when count(s.reader) >= 3 then round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_read_at - b.created_at)) / 60)
                          filter (where s.reader is not null))::numeric, 1) end,
        'measuredSince', reads_since,
        'beforeCoverage', (select count(*) from bobby_identities x where x.auth_user_id is not null and x.created_at >= since and x.created_at < coalesce(reads_since, now())
                            and (incl or not coalesce(x.id in (select bobby_internal_identity_ids()), false))))
      from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
      where b.auth_user_id is not null and b.created_at >= greatest(since, coalesce(reads_since, now())) and (incl or not coalesce(b.id in (select bobby_internal_identity_ids()), false)))
  ) into activity;

  with e as (select * from bobby_events e where e.created_at >= since and (incl or not (case when e.identity_id is not null then coalesce(e.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(e.device_hash in (select bobby_internal_device_hashes()), false) end)))
  select jsonb_build_object(
    'web', jsonb_build_object(
      'visitors', (select count(distinct device_hash) from e where event = 'visit' and platform = 'web'),
      'deskVisitors', (select count(distinct device_hash) from e where event = 'visit' and platform = 'web' and surface = 'desk'),
      'appStoreClicks', (select count(*) from e where event = 'appstore_click'),
      'signinStarts', (select count(*) from e where event = 'signin_start' and platform = 'web'),
      'paywallViews', (select count(*) from e where event = 'paywall_view' and platform = 'web')),
    'ios', jsonb_build_object(
      'paywallViews', (select count(*) from e where event = 'paywall_view' and platform = 'ios')),
    'visitsDaily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(distinct e.device_hash) from e where e.event = 'visit' and e.platform = 'web' and e.created_at >= g and e.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s),
    'topSurfaces', (select coalesce(jsonb_agg(jsonb_build_object('surface', surface, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(surface, 'other') surface, count(distinct device_hash) n from e
        where event = 'visit' and platform = 'web' group by 1 order by 2 desc limit 8) x),
    'topReferrers', (select coalesce(jsonb_agg(jsonb_build_object('referrer', referrer, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(referrer, case when utm_source is not null then 'utm:' || utm_source end, 'direct') referrer, count(distinct device_hash) n from e
        where event = 'visit' and platform = 'web' group by 1 order by 2 desc limit 8) x)
  ) into funnel;

  with sb as (select * from bobby_subscriptions s where incl or not coalesce(s.identity_id in (select bobby_internal_identity_ids()), false)),
  live as (select * from sb where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()))
  select jsonb_build_object(
    'active', (select count(*) from live),
    'paid', (select count(*) from live where status = 'active' and environment = 'production' and coalesce(period_type, 'normal') <> 'trial'),
    'unverified', (select count(*) from live where status = 'active' and environment is null),
    'sandbox', (select count(*) from live where environment = 'sandbox'),
    'trialing', (select count(*) from live where status = 'trialing' or (environment is distinct from 'sandbox' and period_type = 'trial')),
    'byStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from sb group by 1) x), '{}'::jsonb),
    'byProvider', coalesce((select jsonb_object_agg(provider, n) from (select provider, count(*) n from live group by 1) x), '{}'::jsonb),
    'giftedPro', (select count(*) from bobby_pro_grants g where g.pro_until > now() and (incl or not coalesce(g.identity_id in (select bobby_internal_identity_ids()), false)))
  ) into subs;

  select jsonb_build_object(
    'grossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and prod and ext), 0),
    'netUsd', coalesce(sum(price_usd * bobby_net_share(commission_pct, tax_pct, takehome)) filter (where price_usd is not null and prod and ext), 0),
    'refundsUsd', coalesce(-sum(price_usd) filter (where price_usd < 0 and prod and ext), 0),
    'newSubscriptions', count(*) filter (where type = 'INITIAL_PURCHASE' and prod and ext),
    'newPaying', (select count(*) from (select x.identity_id, min(x.event_at) at from bobby_purchase_events x
        where x.price_usd > 0 and coalesce(x.environment, 'PRODUCTION') = 'PRODUCTION' and x.identity_id is not null
          and (incl or not coalesce(x.identity_id in (select bobby_internal_identity_ids()), false)) group by 1) f where f.at >= since),
    'renewals', count(*) filter (where type = 'RENEWAL' and prod and ext),
    'cancellations', count(*) filter (where type = 'CANCELLATION' and prod and ext),
    'expirations', count(*) filter (where type = 'EXPIRATION' and prod and ext),
    'sandboxEvents', count(*) filter (where not prod),
    'internalEvents', count(*) filter (where prod and not ext),
    'daily', (select coalesce(jsonb_agg(v order by g), '[]'::jsonb) from (
        select g, coalesce((select sum(x.price_usd) from bobby_purchase_events x
          where x.price_usd > 0 and coalesce(x.environment, 'PRODUCTION') = 'PRODUCTION' and x.event_at >= g and x.event_at < g + interval '1 day'
            and (incl or not coalesce(x.identity_id in (select bobby_internal_identity_ids()), false))), 0) v
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into revenue
  from (select *, coalesce(environment, 'PRODUCTION') = 'PRODUCTION' as prod, incl or not coalesce(identity_id in (select bobby_internal_identity_ids()), false) as ext
        from bobby_purchase_events where event_at >= since) p;

  select jsonb_build_object(
    'providers', (select jsonb_object_agg(p, jsonb_build_object(
        'today', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at >= date_trunc('day', now())),
        'week', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '7 days'),
        'month', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '30 days'),
        'period', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at >= since),
        'calls', (select count(*) from bobby_llm_usage where provider = p and created_at >= since),
        'failures', (select count(*) from bobby_llm_usage where provider = p and created_at >= since and not ok),
        'lastOk', (select max(created_at) from bobby_llm_usage where provider = p and ok),
        'lastFailure', (select jsonb_build_object('at', created_at, 'stop', stop, 'surface', surface) from bobby_llm_usage where provider = p and not ok order by created_at desc limit 1),
        'failures24h', (select count(*) from bobby_llm_usage where provider = p and not ok and created_at > now() - interval '24 hours'),
        'calls24h', (select count(*) from bobby_llm_usage where provider = p and created_at > now() - interval '24 hours'),
        'balanceMark', (select jsonb_build_object('amount', amount_usd, 'at', created_at) from bobby_llm_credit_marks
                          where provider = p and kind = 'balance' order by created_at desc limit 1),
        'estimatedLeft', (select m.amount_usd
            + coalesce((select sum(t.amount_usd) from bobby_llm_credit_marks t where t.provider = p and t.kind = 'topup' and t.created_at > m.created_at), 0)
            - coalesce((select sum(u.usd) from bobby_llm_usage u where u.provider = p and u.created_at > m.created_at), 0)
            from bobby_llm_credit_marks m where m.provider = p and m.kind = 'balance' order by m.created_at desc limit 1),
        'lastTopup', (select max(created_at) from bobby_llm_credit_marks where provider = p and amount_usd > 0),
        'lastCreditAlert', (select updated_at from api_cache where cache_key = 'provider-credit-alert:' || p),
        'creditAlert', (select payload from api_cache where cache_key = 'provider-credit-alert:' || p)))
      from unnest(array['anthropic', 'openai']) p),
    'bySurface', coalesce((select jsonb_agg(jsonb_build_object('surface', surface, 'provider', provider, 'usd', usd, 'calls', calls, 'failures', failures) order by usd desc) from (
        select surface, provider, sum(usd) usd, count(*) calls, count(*) filter (where not ok) failures from bobby_llm_usage
        where created_at >= since group by 1, 2) x), '[]'::jsonb),
    'deskRuns', (select jsonb_build_object('runs', count(*), 'finished', count(*) filter (where finished),
        'lastFinishedAt', max(created_at) filter (where finished), 'lastUnfinishedAt', max(created_at) filter (where not finished),
        'byDay', coalesce(jsonb_agg(jsonb_build_object('day', day, 'runs', 1, 'finished', finished::int)), '[]'::jsonb))
        from (select created_at, (created_at at time zone 'utc')::date as day, bool_or(ok and role in ('cio', 'final', 'judge')) as finished
              from bobby_llm_usage where surface = 'desk' and created_at >= since group by created_at) runs),
    'guard', bobby_llm_spend(),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('anthropic', a, 'openai', o) order by g), '[]'::jsonb) from (
        select g,
          coalesce(sum(u.usd) filter (where u.provider = 'anthropic'), 0) a, coalesce(sum(u.usd) filter (where u.provider = 'openai'), 0) o
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join bobby_llm_usage u on u.created_at >= g and u.created_at < g + interval '1 day' group by g) s)
  ) into llm;

  select jsonb_build_object(
    'active', (select count(*) from bobby_coupons where active and (expires_at is null or expires_at > now())
                and (max_redemptions is null or redeemed < max_redemptions)),
    'redemptions', (select count(*) from bobby_coupon_redemptions c where c.created_at >= since and (incl or not coalesce(c.identity_id in (select bobby_internal_identity_ids()), false))),
    'giftedReadsLeft', (select coalesce(sum(reads), 0) from bobby_usage_bonus),
    'giftedLeft', (select jsonb_build_object('reads', coalesce(sum(reads), 0), 'profundo', coalesce(sum(profundo), 0), 'maximo', coalesce(sum(maximo), 0)) from bobby_usage_bonus)
  ) into coupons;

  return jsonb_build_object('days', days, 'since', since, 'includeInternal', incl, 'accounts', accounts, 'activity', activity, 'funnel', funnel,
    'subscriptions', subs, 'revenue', revenue, 'llm', llm, 'coupons', coupons, 'coverage', bobby_admin_coverage() || jsonb_build_object(
      'activitySince', (select min(day) from bobby_activity_days),
      'outcomesSince', (select min(created_at) from bobby_events where event in ('read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked')),
      'locatedSince', (select min(created_at) from bobby_events where country is not null)));
end;
$$;

create or replace function public.bobby_admin_economics(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  incl boolean := coalesce(p_internal, false);
  prod_events jsonb; costs jsonb; subs jsonb;
begin
  with ev as (
    select * from bobby_purchase_events where coalesce(environment, 'PRODUCTION') = 'PRODUCTION' and (incl or not coalesce(identity_id in (select bobby_internal_identity_ids()), false))
  ), first_paid as (
    select identity_id, min(event_at) as at from ev where price_usd > 0 and identity_id is not null group by 1
  )
  select jsonb_build_object(
    'grossUsd', coalesce((select sum(price_usd) from ev where price_usd > 0 and event_at >= since), 0),
    'netUsd', coalesce((select sum(price_usd * bobby_net_share(commission_pct, tax_pct, takehome)) from ev where price_usd is not null and event_at >= since), 0),
    'refundsUsd', coalesce((select -sum(price_usd) from ev where price_usd < 0 and event_at >= since), 0),
    'newPaying', (select count(*) from first_paid where at >= since),
    'payersEver', (select count(*) from first_paid),
    'initialPurchases30d', (select count(*) from ev where type = 'INITIAL_PURCHASE' and event_at > now() - interval '30 days'),
    'expirations30d', (select count(*) from ev where type = 'EXPIRATION' and event_at > now() - interval '30 days'),
    'lastPriceUsd', (select price_usd from ev where price_usd > 0 order by event_at desc limit 1),
    'takehome', (select avg(bobby_net_share(commission_pct, tax_pct, takehome)) from ev where commission_pct is not null or takehome is not null)
  ) into prod_events;

  select jsonb_build_object(
    'marketingUsd', coalesce(sum(amount_usd) filter (where kind = 'marketing'), 0),
    'infraUsd', coalesce(sum(amount_usd) filter (where kind = 'infra'), 0),
    'otherUsd', coalesce(sum(amount_usd) filter (where kind = 'other'), 0),
    'entries', count(*),
    'byChannel', coalesce((select jsonb_agg(jsonb_build_object('channel', ch, 'usd', usd) order by usd desc) from (
        select coalesce(channel, 'other') ch, sum(amount_usd) usd from bobby_costs
        where kind = 'marketing' and spent_on >= since::date group by 1) x), '[]'::jsonb)
  ) into costs from bobby_costs where spent_on >= since::date;

  with live as (
    select * from bobby_subscriptions where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now())
      and (incl or not coalesce(identity_id in (select bobby_internal_identity_ids()), false))
  )
  select jsonb_build_object(
    'active', count(*) filter (where status = 'active' and environment = 'production' and coalesce(period_type, 'normal') <> 'trial'),
    'unverified', count(*) filter (where status = 'active' and environment is null),
    'sandbox', count(*) filter (where environment = 'sandbox'),
    'trialing', count(*) filter (where status = 'trialing' or (environment is distinct from 'sandbox' and period_type = 'trial'))) into subs from live;

  return jsonb_build_object(
    'days', d, 'since', since,
    'revenue', prod_events,
    'costs', costs,
    'subscriptions', subs,
    'newAccounts', (select count(*) from bobby_identities b where b.auth_user_id is not null and b.created_at >= since and (incl or not coalesce(b.id in (select bobby_internal_identity_ids()), false))),
    'activeReaders30d', (select count(*) from bobby_admin_people_facts() f where (incl or not f.internal) and f.last_read_day > (now() at time zone 'utc')::date - 30),
    'activeReaders30dAll', (select count(*) from bobby_admin_people_facts() f where f.last_read_day > (now() at time zone 'utc')::date - 30),
    'llmUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at >= since),
    'llm30dUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at > now() - interval '30 days'),
    'assumptions', coalesce((select value from bobby_admin_settings where key = 'unit_economics'), '{}'::jsonb));
end;
$$;

drop function if exists public.bobby_admin_members();
create or replace function public.bobby_admin_members(p_internal boolean default true)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with team as (select bobby_internal_identity_ids() as id)
  select jsonb_build_object(
    'includeInternal', coalesce(p_internal, true),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('identityId', s.identity_id, 'email', b.email, 'provider', s.provider,
        'status', s.status, 'productId', s.product_id, 'currentPeriodEnd', s.current_period_end, 'updatedAt', s.updated_at,
        'environment', s.environment, 'periodType', s.period_type, 'internal', s.identity_id in (select id from team),
        'active', s.status in ('active', 'trialing') and (s.current_period_end is null or s.current_period_end > now()))
        order by s.updated_at desc) from bobby_subscriptions s left join bobby_identities b on b.id = s.identity_id
        where coalesce(p_internal, true) or s.identity_id not in (select id from team)), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('identityId', g.identity_id, 'email', b.email, 'source', g.source,
        'proUntil', g.pro_until, 'active', g.pro_until > now(), 'internal', g.identity_id in (select id from team)) order by g.pro_until desc)
        from bobby_pro_grants g left join bobby_identities b on b.id = g.identity_id
        where coalesce(p_internal, true) or g.identity_id not in (select id from team)), '[]'::jsonb));
$$;

create table if not exists public.bobby_bot_days (
  day date not null, reason text not null check (reason ~ '^[a-z_]{1,20}$'), hits int not null default 0 check (hits >= 0),
  primary key (day, reason)
);
alter table public.bobby_bot_days enable row level security;
revoke all on public.bobby_bot_days from public, anon, authenticated;
grant all on public.bobby_bot_days to service_role;

create or replace function public.bobby_count_bot(p_reason text)
returns void language sql security invoker set search_path = public, pg_temp as $$
  insert into bobby_bot_days as b (day, reason, hits)
    values ((now() at time zone 'utc')::date, case when p_reason ~ '^[a-z_]{1,20}$' then p_reason else 'other' end, 1)
    on conflict (day, reason) do update set hits = b.hits + 1;
$$;

revoke all on function public.bobby_internal_subjects(boolean) from public, anon, authenticated;
revoke all on function public.bobby_internal_identity_ids() from public, anon, authenticated;
revoke all on function public.bobby_internal_device_hashes() from public, anon, authenticated;
revoke all on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_track_reader() from public, anon, authenticated;
revoke all on function public.bobby_admin_internal_networks() from public, anon, authenticated;
revoke all on function public.bobby_admin_device_facts() from public, anon, authenticated;
revoke all on function public.bobby_admin_people_facts() from public, anon, authenticated;
revoke all on function public.bobby_admin_growth(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_overview(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_economics(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_members(boolean) from public, anon, authenticated;
revoke all on function public.bobby_count_bot(text) from public, anon, authenticated;
grant execute on function public.bobby_internal_subjects(boolean) to service_role;
grant execute on function public.bobby_internal_identity_ids() to service_role;
grant execute on function public.bobby_internal_device_hashes() to service_role;
grant execute on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text, text) to service_role;
grant execute on function public.bobby_admin_internal_networks() to service_role;
grant execute on function public.bobby_admin_device_facts() to service_role;
grant execute on function public.bobby_admin_people_facts() to service_role;
grant execute on function public.bobby_admin_growth(int, boolean) to service_role;
grant execute on function public.bobby_admin_overview(int, boolean) to service_role;
grant execute on function public.bobby_admin_economics(int, boolean) to service_role;
grant execute on function public.bobby_admin_members(boolean) to service_role;
grant execute on function public.bobby_count_bot(text) to service_role;
