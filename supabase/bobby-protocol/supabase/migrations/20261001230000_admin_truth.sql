-- The owner dashboard tells the truth (2026-10-01), from the funnel audit of 2026-10-01:
--   · bobby_events also keeps what the server saw happen at the desk, for every client (web and iOS, no app
--     update needed): read_done (an answer was delivered), read_failed, wall_signin (a guest who used the 3 free
--     reads asked for a 4th), wall_paywall, wall_level (a premium level refused) and desk_blocked (the spend
--     guard or the daily quota said no). `detail` carries the level or the reason.
--   · bobby_devices.source: 'observed' when the install was seen arriving, 'backfill' when it was rebuilt from its
--     reads (20261001200000). Only observed installs form a cohort; the rebuilt ones are history.
--   · Internal traffic: the admins, accounts the owner marks (bobby_internal_marks) or lists by email (setting
--     internal_emails, also for accounts not created yet), installs that opened /admin, installs paired with any of
--     those accounts, and installs seen from a network an admin used (bobby_internal_networks: the salted /24 or /48
--     hash the rate limiter already computes; no IP is stored). The dashboard leaves them out unless asked.
--   · bobby_device_accounts: every install ↔ account pairing with its first and last time, so switching accounts
--     no longer rewrites history. Signed-in reads now keep the install too (bobby_consume_read).
--   · bobby_devices.first_read_at / reads: the install's own reads (as a guest or signed in).
--   · bobby_activity_days: one row per install or account per UTC day it was active (opened Bobby, read), kept
--     forever, so retention is measured on the exact day and "came back" means a later day, not a counter.
--   · bobby_admin_growth: the people, cohorts, retention, outcomes and acquisition the dashboard draws.
-- Service role only, as the rest of the dashboard.

-- ---------------------------------------------------------------- events
alter table public.bobby_events drop constraint if exists bobby_events_event_check;
alter table public.bobby_events add constraint bobby_events_event_check check (event in (
  'visit', 'appstore_click', 'signin_start', 'paywall_view', 'purchase_start',
  'read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked'));
alter table public.bobby_events add column if not exists detail text check (detail is null or detail ~ '^[a-z0-9_-]{1,32}$');
create index if not exists bobby_events_identity_idx on public.bobby_events (identity_id, event) where identity_id is not null;

-- ---------------------------------------------------------------- devices
alter table public.bobby_devices add column if not exists source text not null default 'observed' check (source in ('observed', 'backfill'));
alter table public.bobby_devices add column if not exists internal boolean not null default false;
alter table public.bobby_devices add column if not exists first_read_at timestamptz;
alter table public.bobby_devices add column if not exists reads int not null default 0 check (reads >= 0);
alter table public.bobby_devices add column if not exists network_hash text check (network_hash is null or length(network_hash) between 8 and 128);

-- Seen arriving = an event at (or before) its first sighting, or a first sighting after the desk and the app
-- started touching installs on open (prod served 8b50cc7 at 2026-10-01 20:45:03 UTC). Everything else was
-- rebuilt from its reads: its "first seen" is its first read, so it says nothing about arrivals.
update public.bobby_devices d set source = 'backfill'
where d.source = 'observed' and d.first_seen < timestamptz '2026-10-01 20:45:03+00'
  and not exists (select 1 from public.bobby_events e where e.device_hash = d.device_hash and e.created_at <= d.first_seen + interval '5 seconds');

-- The install's own reads so far (guest reads; signed-in reads never kept the install before today).
update public.bobby_devices d set first_read_at = s.first_read_at, reads = s.reads
from public.bobby_reader_stats s where s.reader = 'd:' || d.device_hash and d.reads = 0;

-- ---------------------------------------------------------------- internal traffic
create table if not exists public.bobby_internal_marks (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  note text check (note is null or length(note) <= 120),
  created_at timestamptz not null default now()
);
alter table public.bobby_internal_marks enable row level security;
revoke all on public.bobby_internal_marks from public, anon, authenticated;
grant all on public.bobby_internal_marks to service_role;

create table if not exists public.bobby_internal_networks (
  network_hash text primary key check (length(network_hash) between 8 and 128),
  note text check (note is null or length(note) <= 120),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.bobby_internal_networks enable row level security;
revoke all on public.bobby_internal_networks from public, anon, authenticated;
grant all on public.bobby_internal_networks to service_role;

-- The owner's own sign-in emails (2026-10-01): their sessions are internal even before the account exists.
insert into public.bobby_admin_settings (key, value) values ('internal_emails',
  '["guillermos22@gmail.com", "guillermochavez.ra@gmail.com", "anthochavez.ra@gmail.com", "anthony@rizoma.boutique"]'::jsonb)
on conflict (key) do update set value = (select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
  from jsonb_array_elements_text(public.bobby_admin_settings.value || excluded.value) e), updated_at = now();

create or replace function public.bobby_identity_internal(p_identity uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select p_identity is not null and (exists (select 1 from bobby_admins where identity_id = p_identity)
    or exists (select 1 from bobby_internal_marks where identity_id = p_identity)
    or exists (select 1 from bobby_identities b join bobby_admin_settings s on s.key = 'internal_emails'
               where b.id = p_identity and nullif(b.email, '') is not null and s.value ? lower(b.email)));
$$;

-- ---------------------------------------------------------------- install ↔ account
create table if not exists public.bobby_device_accounts (
  device_hash text not null references public.bobby_devices(device_hash) on delete cascade,
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (device_hash, identity_id)
);
create index if not exists bobby_device_accounts_identity_idx on public.bobby_device_accounts (identity_id);
alter table public.bobby_device_accounts enable row level security;
revoke all on public.bobby_device_accounts from public, anon, authenticated;
grant all on public.bobby_device_accounts to service_role;

insert into public.bobby_device_accounts (device_hash, identity_id, first_at, last_at)
select device_hash, identity_id, coalesce(linked_at, first_seen), greatest(coalesce(linked_at, first_seen), last_seen)
from public.bobby_devices where identity_id is not null
on conflict (device_hash, identity_id) do nothing;

-- Internal traffic: a team account, an install the owner marked or used for /admin, or an install paired with a
-- team account.
create or replace function public.bobby_device_internal(p_device text)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select p_device is not null and (
    exists (select 1 from bobby_devices where device_hash = p_device and internal)
    or exists (select 1 from bobby_devices dv join bobby_internal_networks n on n.network_hash = dv.network_hash where dv.device_hash = p_device)
    or exists (select 1 from bobby_reads r join bobby_internal_networks n on n.network_hash = r.network_hash where r.device_hash = p_device)
    or exists (select 1 from bobby_device_accounts l where l.device_hash = p_device and bobby_identity_internal(l.identity_id)));
$$;

create or replace function public.bobby_traffic_internal(p_identity uuid, p_device text)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select bobby_identity_internal(p_identity) or bobby_device_internal(p_device);
$$;

-- ---------------------------------------------------------------- activity days
create table if not exists public.bobby_activity_days (
  subject text not null check (subject ~ '^[ad]:.{8,128}$'),   -- 'd:<device hash>' or 'a:<identity uuid>'
  day date not null,
  platform text,
  touches int not null default 0 check (touches >= 0),         -- Bobby opened (the desk, the app, a tracked page)
  reads int not null default 0 check (reads >= 0),
  primary key (subject, day)
);
create index if not exists bobby_activity_days_day_idx on public.bobby_activity_days (day);
alter table public.bobby_activity_days enable row level security;
revoke all on public.bobby_activity_days from public, anon, authenticated;
grant all on public.bobby_activity_days to service_role;

-- Backfill from what was observed: reads (35 days on record), events, installs' first and last sightings,
-- sign-up days, and outside accounts' last activity (an admin's is refreshed by /admin itself, so not theirs).
insert into public.bobby_activity_days (subject, day, platform, touches, reads)
select subject, day, max(platform), sum(touches), sum(reads) from (
  select case when r.identity_id is not null then 'a:' || r.identity_id::text else 'd:' || r.device_hash end as subject,
    (r.created_at at time zone 'utc')::date as day, r.platform, 0 as touches, 1 as reads
  from public.bobby_reads r where r.identity_id is not null or r.device_hash is not null
  union all
  select 'd:' || e.device_hash, (e.created_at at time zone 'utc')::date, e.platform, 1, 0 from public.bobby_events e where e.device_hash is not null
  union all
  select 'd:' || dv.device_hash, (dv.first_seen at time zone 'utc')::date, dv.platform, 1, 0 from public.bobby_devices dv
  union all
  select 'd:' || dv.device_hash, (dv.last_seen at time zone 'utc')::date, dv.platform, 1, 0 from public.bobby_devices dv
  union all
  select 'a:' || b.id::text, (b.created_at at time zone 'utc')::date, null, 1, 0 from public.bobby_identities b where b.auth_user_id is not null
  union all
  select 'a:' || b.id::text, (b.last_seen_at at time zone 'utc')::date, null, 1, 0 from public.bobby_identities b
  where b.auth_user_id is not null and b.last_seen_at is not null and not public.bobby_identity_internal(b.id)
) x
group by subject, day
on conflict (subject, day) do nothing;

-- ---------------------------------------------------------------- writers
-- Seen now (20261001220000), plus the account pairing, the day of activity and the latest network hash.
drop function if exists public.bobby_touch_device(text, text, text, text, text, uuid, text, text);
create or replace function public.bobby_touch_device(p_device text, p_platform text, p_surface text, p_referrer text, p_utm text, p_identity uuid,
  p_country text default null, p_region text default null, p_network text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := bobby_geo_country(p_country); r text := bobby_geo_region(p_country, p_region);
        pf text := case when p_platform in ('ios', 'android') then p_platform else 'web' end;
        today date := (now() at time zone 'utc')::date;
begin
  if p_device is null or length(p_device) not between 8 and 128 then return; end if;
  insert into bobby_devices as d (device_hash, platform, first_surface, referrer, utm_source, identity_id, linked_at, country, region, network_hash)
    values (p_device, pf,
      case when p_surface ~ '^[a-z0-9_-]{1,32}$' then p_surface end,
      case when p_referrer ~ '^[a-z0-9.-]{1,80}$' then p_referrer end,
      case when p_utm ~ '^[a-z0-9_.-]{1,40}$' then p_utm end,
      p_identity, case when p_identity is not null then now() end, c, r,
      case when length(p_network) between 8 and 128 then p_network end)
  on conflict (device_hash) do update set
    active_days = d.active_days + case when (d.last_seen at time zone 'utc')::date < today then 1 else 0 end,
    last_seen = greatest(d.last_seen, now()),
    first_surface = coalesce(d.first_surface, excluded.first_surface),
    identity_id = coalesce(excluded.identity_id, d.identity_id),
    linked_at = case when excluded.identity_id is not null and d.identity_id is distinct from excluded.identity_id then now() else d.linked_at end,
    country = coalesce(excluded.country, d.country),
    region = case when excluded.country is not null then excluded.region else d.region end,
    network_hash = coalesce(excluded.network_hash, d.network_hash);
  if p_identity is not null then
    insert into bobby_device_accounts as l (device_hash, identity_id) values (p_device, p_identity)
      on conflict (device_hash, identity_id) do update set last_at = now();
    insert into bobby_activity_days as a (subject, day, platform, touches) values ('a:' || p_identity::text, today, pf, 1)
      on conflict (subject, day) do update set touches = a.touches + 1;
  end if;
  insert into bobby_activity_days as a (subject, day, platform, touches) values ('d:' || p_device, today, pf, 1)
    on conflict (subject, day) do update set touches = a.touches + 1;
end;
$$;

-- What the server saw happen at the desk (api/_lib/access.ts recordOutcome). The install, when known, is touched.
drop function if exists public.bobby_record_outcome(text, text, text, uuid, text, text, text);
drop function if exists public.bobby_mark_internal_device(text);
create or replace function public.bobby_record_outcome(p_event text, p_platform text, p_device text, p_identity uuid, p_detail text,
  p_country text default null, p_region text default null, p_network text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare pf text := case when p_platform in ('ios', 'android') then p_platform else 'web' end;
        dev text := case when length(p_device) between 8 and 128 then p_device end;
        c text := case when pf = 'web' then bobby_geo_country(p_country) end;
begin
  if p_event not in ('read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked') then
    raise exception 'unknown outcome';
  end if;
  insert into bobby_events (event, platform, surface, device_hash, identity_id, detail, country, region)
    values (p_event, pf, 'desk', dev, p_identity, case when p_detail ~ '^[a-z0-9_-]{1,32}$' then p_detail end,
      c, case when c is not null then bobby_geo_region(p_country, p_region) end);
  if dev is not null then
    perform bobby_touch_device(dev, pf, null, null, null, p_identity, c, case when c is not null then p_region end, p_network);
  end if;
end;
$$;

-- An /admin session: its install and its network belong to the team.
create or replace function public.bobby_mark_admin_session(p_device text, p_network text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if length(p_device) between 8 and 128 then
    insert into bobby_devices (device_hash, platform, internal, network_hash) values (p_device, 'web', true, case when length(p_network) between 8 and 128 then p_network end)
      on conflict (device_hash) do update set internal = true where not bobby_devices.internal;
  end if;
  if length(p_network) between 8 and 128 then
    insert into bobby_internal_networks as n (network_hash, note) values (p_network, 'admin session')
      on conflict (network_hash) do update set last_seen_at = now();
  end if;
end;
$$;

-- The web event of 20261001220000, plus the network hash on the install.
drop function if exists public.bobby_record_event(text, text, text, text, text, text, text, text);
create or replace function public.bobby_record_event(p_event text, p_platform text, p_surface text, p_device text, p_referrer text, p_utm text,
  p_country text default null, p_region text default null, p_network text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := case when p_platform = 'web' then bobby_geo_country(p_country) end;
        r text := case when p_platform = 'web' then bobby_geo_region(p_country, p_region) end;
begin
  insert into bobby_events (event, platform, surface, device_hash, referrer, utm_source, country, region)
    values (p_event, p_platform, p_surface, p_device, p_referrer, p_utm, c, r);
  if p_device is not null then
    perform bobby_touch_device(p_device, p_platform, case when p_event = 'visit' then p_surface end, p_referrer, p_utm, null, c, r, p_network);
  end if;
end;
$$;

-- Reader stats (20261001200000) plus the install's own reads and the activity day. A signed-in read now keeps
-- its install, which also pairs the install with the account.
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
      perform bobby_touch_device(new.device_hash, new.platform, null, null, null, new.identity_id, null, null, new.network_hash);
      update bobby_devices set first_seen = least(first_seen, new.created_at),
        first_read_at = least(coalesce(first_read_at, new.created_at), new.created_at), reads = reads + 1
        where device_hash = new.device_hash;
      insert into bobby_activity_days as a (subject, day, platform, reads) values ('d:' || new.device_hash, dday, new.platform, 1)
        on conflict (subject, day) do update set reads = a.reads + 1;
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

-- A refunded read (deleted within 15 minutes, 20261001210000) also leaves the install and the activity day.
create or replace function public.bobby_untrack_reader()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare key text; dday date := (old.created_at at time zone 'utc')::date;
begin
  if old.created_at <= now() - interval '15 minutes' or (old.identity_id is null and old.device_hash is null) then return old; end if;
  key := case when old.identity_id is not null then 'a:' || old.identity_id::text else 'd:' || old.device_hash end;
  begin
    update bobby_reader_stats set reads = greatest(reads - 1, 0) where reader = key;
    delete from bobby_reader_stats where reader = key and reads = 0;
    if old.device_hash is not null then
      update bobby_devices set reads = greatest(reads - 1, 0), first_read_at = case when reads <= 1 then null else first_read_at end
        where device_hash = old.device_hash;
      update bobby_activity_days set reads = greatest(reads - 1, 0) where subject = 'd:' || old.device_hash and day = dday;
    end if;
    if old.identity_id is not null then
      update bobby_activity_days set reads = greatest(reads - 1, 0) where subject = 'a:' || old.identity_id::text and day = dday;
    end if;
  exception when others then
    raise warning 'bobby_untrack_reader: %', sqlerrm;
  end;
  return old;
end;
$$;

-- The read meter of 20261001160000, unchanged except that a signed-in read keeps the install it came from.
-- Metering is untouched: accounts count by identity_id, guests by device with identity_id null.
create or replace function public.bobby_consume_read(p_identity uuid, p_device text, p_network text, p_platform text, p_symbol text, p_paywall boolean)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare used int; net_used int; oldest timestamptz; rid bigint; extra int;
begin
  if p_device is not null and (length(p_device) < 8 or length(p_device) > 128) then raise exception 'invalid device'; end if;
  if p_network is not null and (length(p_network) < 8 or length(p_network) > 128) then raise exception 'invalid network'; end if;
  delete from bobby_reads where id in (
    select id from bobby_reads where created_at < now() - interval '35 days' limit 500 for update skip locked);

  if p_identity is not null then
    perform pg_advisory_xact_lock(hashtext('bobby_read:' || p_identity::text));
    if bobby_is_pro(p_identity) then
      insert into bobby_reads(identity_id, device_hash, platform, symbol) values (p_identity, p_device, p_platform, p_symbol) returning id into rid;
      return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'pro', 'used', null, 'limit', null, 'resetsAt', null);
    end if;
    select count(*), min(created_at) into used, oldest from bobby_reads
      where identity_id = p_identity and not bonus and created_at > now() - interval '7 days';
    if p_paywall and used >= 10 then
      update bobby_usage_bonus set reads = reads - 1, updated_at = now()
        where identity_id = p_identity and reads > 0 returning reads into extra;
      if found then
        insert into bobby_reads(identity_id, device_hash, platform, symbol, bonus) values (p_identity, p_device, p_platform, p_symbol, true) returning id into rid;
        return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'free', 'used', used, 'limit', 10,
          'resetsAt', oldest + interval '7 days', 'bonus', extra);
      end if;
      return jsonb_build_object('allowed', false, 'code', 'subscription_required', 'readId', null, 'tier', 'free',
        'used', used, 'limit', 10, 'resetsAt', oldest + interval '7 days', 'bonus', 0);
    end if;
    insert into bobby_reads(identity_id, device_hash, platform, symbol) values (p_identity, p_device, p_platform, p_symbol) returning id into rid;
    extra := coalesce((select reads from bobby_usage_bonus where identity_id = p_identity), 0);
    return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'free', 'used', used + 1, 'limit', 10,
      'resetsAt', coalesce(oldest, now()) + interval '7 days', 'bonus', extra);
  end if;

  if p_device is null then
    return jsonb_build_object('allowed', true, 'code', null, 'readId', null, 'tier', 'anon', 'used', null, 'limit', null, 'resetsAt', null);
  end if;

  -- Lock the shared network pool before the device, consistently across all callers.
  -- A two-part key keeps network locks separate from the existing device/identity namespace.
  if p_network is not null then
    perform pg_advisory_xact_lock(196, hashtext('bobby_read_network:' || p_network));
  end if;
  perform pg_advisory_xact_lock(hashtext('bobby_read:' || p_device));
  select count(*) into used from bobby_reads
    where identity_id is null and device_hash = p_device and created_at > now() - interval '30 days';
  if p_network is not null then
    select count(*) into net_used from bobby_reads
      where identity_id is null and network_hash = p_network and created_at > now() - interval '7 days';
  else
    net_used := 0;
  end if;
  -- 100 guest reads per network per week (was 15): carrier NAT, offices and App Review share one /24, and a
  -- brand-new install there must still get its 3 free reads. Device rotation stays bounded by this pool.
  if used >= 3 or net_used >= 100 then
    return jsonb_build_object('allowed', false, 'code', 'signin_required', 'readId', null, 'tier', 'anon', 'used', greatest(used, 3), 'limit', 3, 'resetsAt', null);
  end if;
  insert into bobby_reads(device_hash, network_hash, platform, symbol) values (p_device, p_network, p_platform, p_symbol) returning id into rid;
  return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'anon', 'used', used + 1, 'limit', 3, 'resetsAt', null);
end;
$$;

-- ---------------------------------------------------------------- facts
-- One row per install: how far it went, in order, and whether it came back on the exact day after.
create or replace function public.bobby_admin_device_facts()
returns table (
  device_hash text, platform text, source text, first_seen timestamptz, last_seen timestamptz, first_surface text,
  referrer text, utm_source text, country text, internal boolean,
  home boolean, desk boolean, signin_at timestamptz, wall_at timestamptz, delivered int, failed int,
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
      count(*) filter (where e.event = 'read_failed')::int as failed
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
    bobby_device_internal(dv.device_hash),
    coalesce(ev.home, false), coalesce(ev.desk, false), ev.signin_at, ev.wall_at, coalesce(ev.delivered, 0), coalesce(ev.failed, 0),
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

-- One row per person Bobby knows: each Apple/Google account once (with the installs paired to it), and each
-- install never paired with an account. Wallet-only identities are counted apart, never as people.
create or replace function public.bobby_admin_people_facts()
returns table (
  person text, kind text, identity_id uuid, email text, provider text, platform text, internal boolean,
  first_seen timestamptz, reads int, pro boolean, last_day date, read_days_14 int, read_7 boolean, first_read_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  with paired as (
    -- An install shared by two accounts belongs to the first one that used it, so its guest reads count once.
    select distinct on (l.device_hash) l.device_hash, l.identity_id
    from bobby_device_accounts l join bobby_identities b on b.id = l.identity_id and b.auth_user_id is not null
    order by l.device_hash, l.first_at
  ), people as (
    select 'a:' || b.id::text as person, 'account'::text as kind, b.id as identity_id, b.email, b.provider,
      coalesce((select dv.platform from paired p join bobby_devices dv on dv.device_hash = p.device_hash where p.identity_id = b.id order by dv.first_seen limit 1), s.platform) as platform,
      bobby_identity_internal(b.id) as internal, b.created_at as first_seen,
      (coalesce(s.reads, 0) + coalesce((select sum(g.reads) from paired p join bobby_reader_stats g on g.reader = 'd:' || p.device_hash where p.identity_id = b.id), 0))::int as reads,
      bobby_is_pro(b.id) as pro,
      least(s.first_read_at, (select min(g.first_read_at) from paired p join bobby_reader_stats g on g.reader = 'd:' || p.device_hash where p.identity_id = b.id)) as first_read_at
    from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    where b.auth_user_id is not null
    union all
    select 'd:' || dv.device_hash, 'guest', null, null, null, dv.platform, bobby_device_internal(dv.device_hash), dv.first_seen, coalesce(g.reads, 0), false, g.first_read_at
    from bobby_devices dv left join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
    where not exists (select 1 from paired p where p.device_hash = dv.device_hash)
  ), days as (
    select p.person, a.day, a.reads from people p join bobby_activity_days a on a.subject = p.person
    union all
    select 'a:' || pr.identity_id::text, a.day, a.reads from paired pr join bobby_activity_days a on a.subject = 'd:' || pr.device_hash
  ), agg as (
    select person, max(day) as last_day,
      count(distinct day) filter (where reads > 0 and day > (now() at time zone 'utc')::date - 14)::int as read_days_14,
      bool_or(reads > 0 and day > (now() at time zone 'utc')::date - 7) as read_7
    from days group by person
  )
  select p.person, p.kind, p.identity_id, p.email, p.provider, p.platform, p.internal, p.first_seen, p.reads, p.pro,
    greatest(agg.last_day, (p.first_seen at time zone 'utc')::date), coalesce(agg.read_days_14, 0), coalesce(agg.read_7, false), p.first_read_at
  from people p left join agg on agg.person = p.person;
$$;

-- ---------------------------------------------------------------- the dashboard's growth view
-- p_internal: include the team's own accounts and installs (default: leave them out, and say how many).
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
  -- People today, deduplicated (an account and its installs are one person).
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

  -- Cohorts: installs seen arriving in the period, per platform, each step a subset of the one before it.
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
        'wall', count(*) filter (where wall_at is not null),
        'signinStart', count(*) filter (where signin_at is not null),
        'account', count(*) filter (where account),
        'accountNew', count(*) filter (where account and account_new),
        'accountAfterRead', count(*) filter (where account and read1),
        'accountAfterWall', count(*) filter (where account and wall_at is not null and link_at >= wall_at),
        'proAfterRead', count(*) filter (where account and read1 and pro),
        'delivered', coalesce(sum(delivered), 0), 'failed', coalesce(sum(failed), 0),
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
        'since', min(first_seen), 'until', max(first_seen))
      from bobby_admin_device_facts() f where f.platform = pf and f.source = 'backfill' and (incl or not f.internal)));
  end loop;

  -- What happened at the desk in the period (outside traffic unless asked).
  with r as (
    select r.*, bobby_traffic_internal(r.identity_id, r.device_hash) as internal from bobby_reads r where r.created_at >= since
  ), e as (
    select e.*, bobby_traffic_internal(e.identity_id, e.device_hash) as internal
    from bobby_events e where e.created_at >= since and e.event in ('read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked')
  )
  select jsonb_build_object(
    'consumed', (select count(*) from r where incl or not internal),
    'consumedInternal', (select count(*) from r where internal),
    'consumedTotal', (select count(*) from r),
    'byPlatform', coalesce((select jsonb_object_agg(platform, n) from (select platform, count(*) n from r where incl or not internal group by 1) x), '{}'::jsonb),
    'delivered', (select count(*) from e where event = 'read_done' and (incl or not internal)),
    'failed', (select count(*) from e where event = 'read_failed' and (incl or not internal)),
    'wallSignin', (select count(*) from e where event = 'wall_signin' and (incl or not internal)),
    'wallSigninInstalls', (select count(distinct device_hash) from e where event = 'wall_signin' and (incl or not internal)),
    'wallPaywall', (select count(*) from e where event = 'wall_paywall' and (incl or not internal)),
    'wallLevel', (select count(*) from e where event = 'wall_level' and (incl or not internal)),
    'blocked', coalesce((select jsonb_object_agg(coalesce(detail, 'other'), n) from (select detail, count(*) n from e where event = 'desk_blocked' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'byLevel', coalesce((select jsonb_object_agg(coalesce(detail, 'rapido'), n) from (select detail, count(*) n from e where event = 'read_done' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'outcomesSince', (select min(created_at) from bobby_events where event in ('read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked'))
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
      and (incl or not bobby_traffic_internal(ev.identity_id, ev.device_hash))
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
    'internalAccounts', (select count(*) from bobby_identities b where b.auth_user_id is not null and bobby_identity_internal(b.id))
  ) into coverage;

  return jsonb_build_object('days', d, 'since', since, 'today', today, 'includeInternal', incl, 'people', people,
    'cohorts', cohorts, 'history', history, 'outcomes', outcomes, 'acquisition', acquisition, 'attention', attention, 'coverage', coverage);
end;
$$;

-- The installs list for /admin (the owner can recognize and mark his own test installs).
create or replace function public.bobby_admin_devices(p_limit int default 100)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'device', left(f.device_hash, 10), 'platform', f.platform, 'source', f.source, 'firstSeen', f.first_seen, 'lastSeen', f.last_seen,
      'firstSurface', f.first_surface, 'referrer', f.referrer, 'utm', f.utm_source, 'country', f.country, 'internal', f.internal,
      'manualInternal', dv.internal, 'reads', f.reads, 'delivered', f.delivered, 'account', f.link_email, 'accountId', f.link_identity)
    order by f.first_seen desc), '[]'::jsonb)
  from (select * from bobby_admin_device_facts() order by first_seen desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) f
  join bobby_devices dv on dv.device_hash = f.device_hash;
$$;

-- The owner marks an install (by the prefix the list shows) or an account as internal, or clears it.
create or replace function public.bobby_set_device_internal(p_prefix text, p_internal boolean)
returns int language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if p_prefix is null or p_prefix !~ '^[A-Za-z0-9_-]{10}$' then raise exception 'invalid device'; end if;
  if (select count(*) from bobby_devices where left(device_hash, 10) = p_prefix) <> 1 then return 0; end if;
  update bobby_devices set internal = coalesce(p_internal, false) where left(device_hash, 10) = p_prefix;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------- the overview, outside traffic only
-- 20261001210000's overview with: the team's accounts, installs and purchases left out unless p_internal; active
-- accounts = accounts that read in 7 days (not any API call, which /admin itself makes); readers deduplicated by
-- person; activation only for accounts created once first reads were recorded; web visits from the web only.
drop function if exists public.bobby_admin_overview(int);
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

  -- Accounts: Apple/Google sign-ins (wallet-only identities are counted apart).
  with b as (select b.*, bobby_identity_internal(b.id) as internal from bobby_identities b where b.auth_user_id is not null),
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

  -- Activity: reads per day and platform (bobby_reads keeps 35 days), premium levels, readers by person.
  with r as (select * from bobby_reads r where r.created_at >= since and (incl or not bobby_traffic_internal(r.identity_id, r.device_hash))),
  pf as (select * from bobby_admin_people_facts() where incl or not internal)
  select jsonb_build_object(
    'reads', (select count(*) from r),
    'readsInternal', (select count(*) from bobby_reads x where x.created_at >= since and bobby_traffic_internal(x.identity_id, x.device_hash)),
    'readsDaily', (select jsonb_build_object(
        'web', coalesce(jsonb_agg(w order by g), '[]'::jsonb), 'ios', coalesce(jsonb_agg(i order by g), '[]'::jsonb),
        'android', coalesce(jsonb_agg(a order by g), '[]'::jsonb)) from (
        select g,
          count(r.id) filter (where r.platform = 'web') w, count(r.id) filter (where r.platform = 'ios') i,
          count(r.id) filter (where r.platform = 'android') a
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join r on r.created_at >= g and r.created_at < g + interval '1 day' group by g) s),
    'levels', (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb) from (
        select level, count(*) n from bobby_level_uses u where u.created_at >= since and (incl or not bobby_traffic_internal(u.identity_id, u.device_hash)) group by 1) x),
    'activeReaders7d', (select count(*) from pf where read_7),
    'activeReaders7dSplit', jsonb_build_object('accounts', (select count(*) from pf where read_7 and kind = 'account'), 'guests', (select count(*) from pf where read_7 and kind = 'guest')),
    'lastRead', (select jsonb_object_agg(platform, at) from (select platform, max(created_at) at from bobby_reads x where incl or not bobby_traffic_internal(x.identity_id, x.device_hash) group by 1) z),
    'activation', (select jsonb_build_object(
        'accounts', count(*),
        'activated', count(s.reader),
        'medianMinutes', case when count(s.reader) >= 3 then round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_read_at - b.created_at)) / 60)
                          filter (where s.reader is not null))::numeric, 1) end,
        'measuredSince', reads_since,
        'beforeCoverage', (select count(*) from bobby_identities x where x.auth_user_id is not null and x.created_at >= since and x.created_at < coalesce(reads_since, now())
                            and (incl or not bobby_identity_internal(x.id))))
      from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
      where b.auth_user_id is not null and b.created_at >= greatest(since, coalesce(reads_since, now())) and (incl or not bobby_identity_internal(b.id)))
  ) into activity;

  -- Funnel figures kept for the comparison series and the traffic cards (the cohort lives in bobby_admin_growth).
  with e as (select * from bobby_events e where e.created_at >= since and (incl or not bobby_traffic_internal(e.identity_id, e.device_hash)))
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

  -- Memberships: paid subscriptions (trials apart) and gifted Pro (referrals, admin grants), outside accounts.
  with sb as (select * from bobby_subscriptions s where incl or not bobby_identity_internal(s.identity_id)),
  live as (select * from sb where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()))
  select jsonb_build_object(
    'active', (select count(*) from live),
    'paid', (select count(*) from live where status = 'active'),
    'trialing', (select count(*) from live where status = 'trialing'),
    'byStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from sb group by 1) x), '{}'::jsonb),
    'byProvider', coalesce((select jsonb_object_agg(provider, n) from (select provider, count(*) n from live group by 1) x), '{}'::jsonb),
    'giftedPro', (select count(*) from bobby_pro_grants g where g.pro_until > now() and (incl or not bobby_identity_internal(g.identity_id)))
  ) into subs;

  -- Revenue from purchase events (production only; sandbox apart). Net = price × (1 − store commission − tax) when
  -- the event carries them, else its take-home share, else 85%; refunds subtract. Team purchases apart.
  select jsonb_build_object(
    'grossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and prod and ext), 0),
    'netUsd', coalesce(sum(price_usd * bobby_net_share(commission_pct, tax_pct, takehome)) filter (where price_usd is not null and prod and ext), 0),
    'refundsUsd', coalesce(-sum(price_usd) filter (where price_usd < 0 and prod and ext), 0),
    'newSubscriptions', count(*) filter (where type = 'INITIAL_PURCHASE' and prod and ext),
    'newPaying', count(distinct identity_id) filter (where type in ('INITIAL_PURCHASE', 'RENEWAL') and price_usd > 0 and prod and ext),
    'renewals', count(*) filter (where type = 'RENEWAL' and prod and ext),
    'cancellations', count(*) filter (where type = 'CANCELLATION' and prod and ext),
    'expirations', count(*) filter (where type = 'EXPIRATION' and prod and ext),
    'sandboxEvents', count(*) filter (where not prod),
    'internalEvents', count(*) filter (where prod and not ext),
    'daily', (select coalesce(jsonb_agg(v order by g), '[]'::jsonb) from (
        select g, coalesce((select sum(x.price_usd) from bobby_purchase_events x
          where x.price_usd > 0 and coalesce(x.environment, 'PRODUCTION') = 'PRODUCTION' and x.event_at >= g and x.event_at < g + interval '1 day'
            and (incl or not bobby_identity_internal(x.identity_id))), 0) v
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into revenue
  from (select *, coalesce(environment, 'PRODUCTION') = 'PRODUCTION' as prod, incl or not bobby_identity_internal(identity_id) as ext
        from bobby_purchase_events where event_at >= since) p;

  -- LLM spend from the cost ledger (it carries no account: the team's own reads are inside) and the credit left.
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
        'lastTopup', (select max(created_at) from bobby_llm_credit_marks where provider = p),
        'lastCreditAlert', (select updated_at from api_cache where cache_key = 'provider-credit-alert:' || p),
        'creditAlert', (select payload from api_cache where cache_key = 'provider-credit-alert:' || p)))
      from unnest(array['anthropic', 'openai']) p),
    'bySurface', coalesce((select jsonb_agg(jsonb_build_object('surface', surface, 'provider', provider, 'usd', usd, 'calls', calls, 'failures', failures) order by usd desc) from (
        select surface, provider, sum(usd) usd, count(*) calls, count(*) filter (where not ok) failures from bobby_llm_usage
        where created_at >= since group by 1, 2) x), '[]'::jsonb),
    -- Desk analyses (one ledger batch per run, by its timestamp): finished = the run has a successful CIO/final row.
    'deskRuns', (select jsonb_build_object('runs', count(*), 'finished', count(*) filter (where finished), 'byDay', coalesce(jsonb_agg(jsonb_build_object('day', day, 'runs', 1, 'finished', finished::int)), '[]'::jsonb))
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
    'redemptions', (select count(*) from bobby_coupon_redemptions c where c.created_at >= since and (incl or not bobby_identity_internal(c.identity_id))),
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

-- ---------------------------------------------------------------- users, economics, audience
-- Apple accounts that hide their email were stored with '' (user-identity.ts now writes null).
update public.bobby_identities set email = null where email = '';

-- The users table (20261001180000) with: internal marks, the reads of paired installs before sign-in, the last
-- day the person actually used Bobby (not any API call), activation only when first reads were already recorded,
-- search by id prefix and wallet (LIKE metacharacters escaped), and the totals split.
create or replace function public.bobby_admin_users(p_query text, p_limit int, p_offset int)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as q),
  esc as (select replace(replace(replace(q.q, '\', '\\'), '%', '\%'), '_', '\_') as e, q.q from q),
  reads_since as (select min(first_read_at) as at from bobby_reader_stats),
  pf as (select * from bobby_admin_people_facts() where kind = 'account'),
  rows as (
    select b.id, nullif(b.email, '') as email, b.provider, b.wallet_address is not null and b.auth_user_id is null as wallet_only,
      case when b.wallet_address is not null then left(b.wallet_address, 6) || '…' || right(b.wallet_address, 4) end as wallet,
      b.created_at, b.last_seen_at,
      s.first_read_at, s.last_read_at, s.reads, s.platform,
      coalesce(pf.reads, 0) - coalesce(s.reads, 0) as guest_reads,
      pf.last_day as last_active_day,
      case when s.first_read_at is not null and b.created_at >= (select at from reads_since)
           then round(extract(epoch from (s.first_read_at - b.created_at)) / 60) end as activation_minutes,
      sub.provider as sub_provider, sub.status as sub_status, sub.current_period_end,
      g.pro_until, g.source as grant_source,
      bonus.reads as bonus_reads, bonus.profundo as bonus_profundo, bonus.maximo as bonus_maximo,
      exists (select 1 from bobby_admins a where a.identity_id = b.id) as is_admin,
      exists (select 1 from bobby_internal_marks m where m.identity_id = b.id) as is_internal,
      (select count(*) from bobby_device_accounts l where l.identity_id = b.id)::int as installs,
      bobby_is_pro(b.id) as pro
    from bobby_identities b
    left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    left join pf on pf.identity_id = b.id
    left join bobby_subscriptions sub on sub.identity_id = b.id
    left join bobby_pro_grants g on g.identity_id = b.id
    left join bobby_usage_bonus bonus on bonus.identity_id = b.id, esc
    where esc.q is null or b.email ilike '%' || esc.e || '%' or b.id::text ilike esc.e || '%' or b.wallet_address ilike '%' || esc.e || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'accounts', (select count(*) from rows where not wallet_only),
    'wallets', (select count(*) from rows where wallet_only),
    'internal', (select count(*) from rows where is_admin or is_internal),
    'readsSince', (select at from reads_since),
    'users', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
      select * from rows order by created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb));
$$;

-- Economics (20261001210000) for outside accounts: a payer is an account with a positive production charge
-- (a free trial start is not), MRR counts paid subscriptions only (trials apart), monthly readers are people.
drop function if exists public.bobby_admin_economics(int);
create or replace function public.bobby_admin_economics(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  incl boolean := coalesce(p_internal, false);
  prod_events jsonb; costs jsonb; subs jsonb;
begin
  with ev as (
    select * from bobby_purchase_events where coalesce(environment, 'PRODUCTION') = 'PRODUCTION' and (incl or not bobby_identity_internal(identity_id))
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
      and (incl or not bobby_identity_internal(identity_id))
  )
  select jsonb_build_object('active', count(*) filter (where status = 'active'), 'trialing', count(*) filter (where status = 'trialing')) into subs from live;

  return jsonb_build_object(
    'days', d, 'since', since,
    'revenue', prod_events,
    'costs', costs,
    'subscriptions', subs,
    'newAccounts', (select count(*) from bobby_identities b where b.auth_user_id is not null and b.created_at >= since and (incl or not bobby_identity_internal(b.id))),
    'activeReaders30d', (select count(*) from bobby_admin_people_facts() f where (incl or not f.internal) and f.reads > 0 and f.last_day > (now() at time zone 'utc')::date - 30),
    'llmUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at >= since),
    'llm30dUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at > now() - interval '30 days'),
    'assumptions', coalesce((select value from bobby_admin_settings where key = 'unit_economics'), '{}'::jsonb));
end;
$$;

-- Audience (20261001220000) for outside installs seen arriving once location was recorded; a reader read in the
-- period from that install (or from its account after the install arrived).
drop function if exists public.bobby_admin_geo(int);
create or replace function public.bobby_admin_geo(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  incl boolean := coalesce(p_internal, false);
  located_since timestamptz := (select min(created_at) from bobby_events where country is not null);
begin
  return (
    with base as (
      select f.* from bobby_admin_device_facts() f
      where f.platform = 'web' and f.first_seen >= since and (incl or not f.internal)
    ), cohort as (
      select b.country, (select dv.region from bobby_devices dv where dv.device_hash = b.device_hash) as region, b.link_identity,
        exists (select 1 from bobby_reads r where r.created_at >= since and (r.device_hash = b.device_hash
          or (b.link_identity is not null and r.identity_id = b.link_identity and r.created_at >= b.first_seen))) as reader,
        b.link_identity is not null and b.link_at >= b.first_seen - interval '2 minutes' as account, b.pro
      from base b where located_since is not null and b.first_seen >= located_since
    )
    select jsonb_build_object(
      'since', since,
      'days', d,
      'locatedSince', located_since,
      'web', jsonb_build_object('devices', (select count(*) from base), 'measurable', (select count(*) from cohort),
                                'located', (select count(*) from cohort where country is not null),
                                'beforeLocation', (select count(*) from base where located_since is null or first_seen < located_since)),
      'countries', coalesce((select jsonb_agg(x order by (x->>'visitors')::int desc, x->>'country') from (
          select jsonb_build_object('country', country, 'visitors', count(*), 'readers', count(*) filter (where reader),
            'accounts', count(*) filter (where account), 'pro', count(*) filter (where pro)) as x
          from cohort where country is not null group by country order by count(*) desc, country limit 40) t), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(x order by (x->>'visitors')::int desc, x->>'country', x->>'region') from (
          select jsonb_build_object('country', country, 'region', region, 'visitors', count(*), 'readers', count(*) filter (where reader)) as x
          from cohort where region is not null group by country, region order by count(*) desc, country, region limit 40) t), '[]'::jsonb),
      'located', jsonb_build_object('total', (select count(*) from cohort where country is not null), 'withRegion', (select count(*) from cohort where region is not null)),
      'purchases', coalesce((select jsonb_agg(x order by (x->>'newPaying')::int desc, x->>'country') from (
          select jsonb_build_object('country', coalesce(country, '??'),
            'newPaying', count(distinct identity_id) filter (where price_usd > 0),
            'grossUsd', round(coalesce(sum(price_usd) filter (where price_usd > 0), 0)::numeric, 2)) as x
          from bobby_purchase_events
          where event_at >= since and coalesce(environment, 'PRODUCTION') = 'PRODUCTION' and (incl or not bobby_identity_internal(identity_id))
          group by country) t), '[]'::jsonb)
    ));
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.bobby_identity_internal(uuid) from public, anon, authenticated;
revoke all on function public.bobby_traffic_internal(uuid, text) from public, anon, authenticated;
revoke all on function public.bobby_admin_users(text, int, int) from public, anon, authenticated;
revoke all on function public.bobby_admin_economics(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_geo(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_overview(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_record_event(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_device_internal(text) from public, anon, authenticated;
revoke all on function public.bobby_record_outcome(text, text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_mark_admin_session(text, text) from public, anon, authenticated;
revoke all on function public.bobby_track_reader() from public, anon, authenticated;
revoke all on function public.bobby_untrack_reader() from public, anon, authenticated;
revoke all on function public.bobby_consume_read(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_device_facts() from public, anon, authenticated;
revoke all on function public.bobby_admin_people_facts() from public, anon, authenticated;
revoke all on function public.bobby_admin_growth(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_devices(int) from public, anon, authenticated;
revoke all on function public.bobby_set_device_internal(text, boolean) from public, anon, authenticated;
grant execute on function public.bobby_identity_internal(uuid) to service_role;
grant execute on function public.bobby_traffic_internal(uuid, text) to service_role;
grant execute on function public.bobby_admin_users(text, int, int) to service_role;
grant execute on function public.bobby_admin_economics(int, boolean) to service_role;
grant execute on function public.bobby_admin_geo(int, boolean) to service_role;
grant execute on function public.bobby_admin_overview(int, boolean) to service_role;
grant execute on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text, text) to service_role;
grant execute on function public.bobby_record_event(text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.bobby_device_internal(text) to service_role;
grant execute on function public.bobby_record_outcome(text, text, text, uuid, text, text, text, text) to service_role;
grant execute on function public.bobby_mark_admin_session(text, text) to service_role;
grant execute on function public.bobby_consume_read(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.bobby_admin_device_facts() to service_role;
grant execute on function public.bobby_admin_people_facts() to service_role;
grant execute on function public.bobby_admin_growth(int, boolean) to service_role;
grant execute on function public.bobby_admin_devices(int) to service_role;
grant execute on function public.bobby_set_device_internal(text, boolean) to service_role;
