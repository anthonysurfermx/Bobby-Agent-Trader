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
