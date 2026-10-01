-- The owner's lifecycle funnel (2026-10-01): one row per install/browser so a visit, a guest read, an account
-- and a return visit of the same person line up.
--   · bobby_devices: salted install hash (the same one the read meter and /api/track store), platform, first and
--     last seen, active days, first-touch page and referrer, and the account it signed into (when it did).
--     Touched by /api/track (web visits), /api/bobby-access (app and desk opens, with the account) and guest reads.
--   · bobby_record_event: an event plus the device touch in one call (api/track.ts).
--   · bobby_touch_device: the device touch alone (api/bobby-access.ts).
--   · bobby_admin_lifecycle: the cohort funnel per platform, retention and lifecycle stages for /admin.
-- Service role only, as the rest of the dashboard (20261001180000).

create table if not exists public.bobby_devices (
  device_hash text primary key check (length(device_hash) between 8 and 128),
  platform text not null check (platform in ('web', 'ios', 'android')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  active_days int not null default 1 check (active_days >= 1),
  first_surface text check (first_surface is null or first_surface ~ '^[a-z0-9_-]{1,32}$'),
  referrer text check (referrer is null or referrer ~ '^[a-z0-9.-]{1,80}$'),
  utm_source text check (utm_source is null or utm_source ~ '^[a-z0-9_.-]{1,40}$'),
  identity_id uuid references public.bobby_identities(id) on delete set null,
  linked_at timestamptz
);
create index if not exists bobby_devices_first_idx on public.bobby_devices (platform, first_seen desc);
create index if not exists bobby_devices_identity_idx on public.bobby_devices (identity_id) where identity_id is not null;
create index if not exists bobby_events_device_idx on public.bobby_events (device_hash, event) where device_hash is not null;

alter table public.bobby_devices enable row level security;
revoke all on public.bobby_devices from public, anon, authenticated;
grant all on public.bobby_devices to service_role;

-- Seen now: a new device, or a later visit (a new UTC day adds an active day). The first page, referrer and
-- utm are first-touch; an account link is kept (and timed) once the device signs in.
create or replace function public.bobby_touch_device(p_device text, p_platform text, p_surface text, p_referrer text, p_utm text, p_identity uuid)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_device is null or length(p_device) not between 8 and 128 then return; end if;
  insert into bobby_devices as d (device_hash, platform, first_surface, referrer, utm_source, identity_id, linked_at)
    values (p_device, case when p_platform in ('ios', 'android') then p_platform else 'web' end,
      case when p_surface ~ '^[a-z0-9_-]{1,32}$' then p_surface end,
      case when p_referrer ~ '^[a-z0-9.-]{1,80}$' then p_referrer end,
      case when p_utm ~ '^[a-z0-9_.-]{1,40}$' then p_utm end,
      p_identity, case when p_identity is not null then now() end)
  on conflict (device_hash) do update set
    active_days = d.active_days + case when (d.last_seen at time zone 'utc')::date < (now() at time zone 'utc')::date then 1 else 0 end,
    last_seen = greatest(d.last_seen, now()),
    first_surface = coalesce(d.first_surface, excluded.first_surface),
    identity_id = coalesce(excluded.identity_id, d.identity_id),
    linked_at = case when excluded.identity_id is not null and d.identity_id is distinct from excluded.identity_id then now() else d.linked_at end;
end;
$$;

create or replace function public.bobby_record_event(p_event text, p_platform text, p_surface text, p_device text, p_referrer text, p_utm text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  insert into bobby_events (event, platform, surface, device_hash, referrer, utm_source)
    values (p_event, p_platform, p_surface, p_device, p_referrer, p_utm);
  if p_device is not null then
    perform bobby_touch_device(p_device, p_platform, case when p_event = 'visit' then p_surface end, p_referrer, p_utm, null);
  end if;
end;
$$;

-- The reader stats trigger (20261001180000) now also touches the guest device behind a read.
create or replace function public.bobby_track_reader()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare key text;
begin
  if new.identity_id is null and new.device_hash is null then return new; end if;
  key := case when new.identity_id is not null then 'a:' || new.identity_id::text else 'd:' || new.device_hash end;
  begin
    insert into bobby_reader_stats as s (reader, identity_id, device_hash, platform, first_read_at, last_read_at, reads)
      values (key, new.identity_id, case when new.identity_id is null then new.device_hash end, new.platform, new.created_at, new.created_at, 1)
      on conflict (reader) do update set last_read_at = greatest(s.last_read_at, excluded.last_read_at), reads = s.reads + 1;
    if new.identity_id is null then
      perform bobby_touch_device(new.device_hash, new.platform, null, null, null, null);
      -- A read can carry an earlier time than the touch (backfills): the device was seen by then.
      update bobby_devices set first_seen = new.created_at where device_hash = new.device_hash and first_seen > new.created_at;
    end if;
  exception when others then
    raise warning 'bobby_track_reader: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Backfill: guest devices from their reads, then the web visits recorded so far.
insert into public.bobby_devices (device_hash, platform, first_seen, last_seen, active_days)
select s.device_hash, case when s.platform in ('ios', 'android') then s.platform else 'web' end, s.first_read_at, s.last_read_at,
  greatest(1, ((s.last_read_at at time zone 'utc')::date - (s.first_read_at at time zone 'utc')::date) + 1)
from public.bobby_reader_stats s
where s.identity_id is null and s.device_hash is not null and length(s.device_hash) between 8 and 128
on conflict (device_hash) do nothing;
insert into public.bobby_devices (device_hash, platform, first_seen, last_seen, first_surface, referrer, utm_source)
select distinct on (e.device_hash) e.device_hash, e.platform, e.created_at, e.created_at, e.surface, e.referrer, e.utm_source
from public.bobby_events e
where e.device_hash is not null and e.event = 'visit'
order by e.device_hash, e.created_at
on conflict (device_hash) do update set first_seen = least(bobby_devices.first_seen, excluded.first_seen),
  first_surface = coalesce(bobby_devices.first_surface, excluded.first_surface);

-- The lifecycle for /admin: devices first seen in the window, per platform, and how far each one went; retention
-- of that cohort; and where every known person stands today (accounts, plus guest devices that never signed in).
create or replace function public.bobby_admin_lifecycle(p_days int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  pf text; funnels jsonb := '{}'::jsonb; stages jsonb;
begin
  foreach pf in array array['web', 'ios'] loop
    funnels := funnels || jsonb_build_object(pf, (
      with cohort as (
        select dv.* from bobby_devices dv where dv.platform = pf and dv.first_seen >= since
      ), facts as (
        select c.device_hash, c.first_seen, c.last_seen, c.active_days, c.identity_id, c.linked_at,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'visit' and e.surface = 'home') as home,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'visit' and e.surface = 'desk') as desk,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'appstore_click') as appstore,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'signin_start') as signin,
          exists (select 1 from bobby_events e where e.device_hash = c.device_hash and e.event = 'paywall_view') as paywall,
          coalesce(g.reads, 0) + coalesce(a.reads, 0) as reads,
          least(g.first_read_at, a.first_read_at) as first_read,
          c.identity_id is not null and bobby_is_pro(c.identity_id) as pro
        from cohort c
        left join bobby_reader_stats g on g.reader = 'd:' || c.device_hash
        left join bobby_reader_stats a on c.identity_id is not null and a.reader = 'a:' || c.identity_id::text
      )
      select jsonb_build_object(
        'devices', count(*),
        'home', count(*) filter (where home),
        'desk', count(*) filter (where desk),
        'appStoreClick', count(*) filter (where appstore),
        'read1', count(*) filter (where reads >= 1),
        'read2', count(*) filter (where reads >= 2),
        'read5', count(*) filter (where reads >= 5),
        'signinStart', count(*) filter (where signin),
        'account', count(*) filter (where identity_id is not null),
        'returned', count(*) filter (where active_days >= 2),
        'paywall', count(*) filter (where paywall),
        'pro', count(*) filter (where pro),
        'medianMinutesToFirstRead', round((percentile_cont(0.5) within group (order by extract(epoch from (first_read - first_seen)) / 60)
            filter (where first_read is not null and first_read >= first_seen))::numeric, 1),
        'medianMinutesToAccount', round((percentile_cont(0.5) within group (order by extract(epoch from (linked_at - first_seen)) / 60)
            filter (where linked_at is not null and linked_at >= first_seen))::numeric, 1),
        'retention', jsonb_build_object(
          'd1', jsonb_build_object('eligible', count(*) filter (where first_seen <= now() - interval '1 day'),
                  'returned', count(*) filter (where first_seen <= now() - interval '1 day' and last_seen >= first_seen + interval '1 day')),
          'd7', jsonb_build_object('eligible', count(*) filter (where first_seen <= now() - interval '7 days'),
                  'returned', count(*) filter (where first_seen <= now() - interval '7 days' and last_seen >= first_seen + interval '7 days')))
      ) from facts));
  end loop;

  -- People today: each account once (its reads, last activity across its devices) and each guest device that
  -- never signed in. new = no read yet (seen in the last 7 days); activated = 1–4 reads; engaged = 5+ reads;
  -- atRisk = quiet 7–30 days; lost = quiet 30+ days; Pro separately.
  with people as (
    select 'account' as kind,
      (select dv.platform from bobby_devices dv where dv.identity_id = b.id order by dv.first_seen limit 1) as platform,
      coalesce(s.reads, 0) + coalesce((select sum(g.reads) from bobby_devices dv join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
                                        where dv.identity_id = b.id), 0) as reads,
      greatest(b.last_seen_at, s.last_read_at, (select max(dv.last_seen) from bobby_devices dv where dv.identity_id = b.id)) as last_seen,
      bobby_is_pro(b.id) as pro
    from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    where b.auth_user_id is not null
    union all
    select 'guest', dv.platform, coalesce(g.reads, 0), greatest(dv.last_seen, g.last_read_at), false
    from bobby_devices dv left join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
    where dv.identity_id is null
  )
  select jsonb_build_object(
    'total', count(*),
    'accounts', count(*) filter (where kind = 'account'),
    'guests', count(*) filter (where kind = 'guest'),
    'new', count(*) filter (where not pro and reads = 0 and last_seen > now() - interval '7 days'),
    'activated', count(*) filter (where not pro and reads between 1 and 4 and last_seen > now() - interval '7 days'),
    'engaged', count(*) filter (where not pro and reads >= 5 and last_seen > now() - interval '7 days'),
    'pro', count(*) filter (where pro),
    'atRisk', count(*) filter (where not pro and last_seen <= now() - interval '7 days' and last_seen > now() - interval '30 days'),
    'lost', count(*) filter (where not pro and last_seen <= now() - interval '30 days'),
    'byPlatform', coalesce((select jsonb_object_agg(p, n) from (select coalesce(platform, 'unknown') p, count(*) n from people group by 1) x), '{}'::jsonb)
  ) into stages from people;

  return jsonb_build_object('since', since, 'web', funnels -> 'web', 'ios', funnels -> 'ios', 'stages', stages);
end;
$$;

-- Unit economics for the funnel tab: costs the owner records (marketing per channel, infrastructure, other),
-- the assumptions he can tune, and the raw sums api/_lib/admin.ts turns into CAC, LTV and ROI.
create table if not exists public.bobby_costs (
  id bigserial primary key,
  kind text not null check (kind in ('marketing', 'infra', 'other')),
  channel text check (channel is null or channel ~ '^[a-z0-9_-]{1,32}$'),
  amount_usd numeric(12, 2) not null check (amount_usd > 0 and amount_usd <= 1000000),
  spent_on date not null,
  note text check (note is null or length(note) <= 160),
  created_at timestamptz not null default now()
);
create index if not exists bobby_costs_spent_idx on public.bobby_costs (spent_on desc);
create table if not exists public.bobby_admin_settings (
  key text primary key check (key ~ '^[a-z_]{1,40}$'),
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.bobby_costs enable row level security;
alter table public.bobby_admin_settings enable row level security;
revoke all on public.bobby_costs, public.bobby_admin_settings from public, anon, authenticated;
grant all on public.bobby_costs, public.bobby_admin_settings to service_role;
revoke all on sequence public.bobby_costs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.bobby_costs_id_seq to service_role;

create or replace function public.bobby_admin_economics(p_days int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  prod_events jsonb; costs jsonb; subs jsonb;
begin
  select jsonb_build_object(
    'grossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and event_at >= since), 0),
    'netUsd', coalesce(sum(price_usd * coalesce(takehome, 0.85)) filter (where price_usd > 0 and event_at >= since), 0),
    'refundsUsd', coalesce(-sum(price_usd) filter (where price_usd < 0 and event_at >= since), 0),
    'newPaying', count(distinct identity_id) filter (where type = 'INITIAL_PURCHASE' and event_at >= since),
    'initialPurchases30d', count(*) filter (where type = 'INITIAL_PURCHASE' and event_at > now() - interval '30 days'),
    'expirations30d', count(*) filter (where type = 'EXPIRATION' and event_at > now() - interval '30 days'),
    'lastPriceUsd', (select price_usd from bobby_purchase_events where price_usd > 0 and coalesce(environment, 'PRODUCTION') = 'PRODUCTION'
                      order by event_at desc limit 1),
    'takehome', avg(takehome) filter (where takehome is not null)
  ) into prod_events
  from bobby_purchase_events where coalesce(environment, 'PRODUCTION') = 'PRODUCTION';

  select jsonb_build_object(
    'marketingUsd', coalesce(sum(amount_usd) filter (where kind = 'marketing'), 0),
    'infraUsd', coalesce(sum(amount_usd) filter (where kind = 'infra'), 0),
    'otherUsd', coalesce(sum(amount_usd) filter (where kind = 'other'), 0),
    'byChannel', coalesce((select jsonb_agg(jsonb_build_object('channel', ch, 'usd', usd) order by usd desc) from (
        select coalesce(channel, 'other') ch, sum(amount_usd) usd from bobby_costs
        where kind = 'marketing' and spent_on >= since::date group by 1) x), '[]'::jsonb)
  ) into costs from bobby_costs where spent_on >= since::date;

  select jsonb_build_object(
    'active', count(*) filter (where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()))
  ) into subs from bobby_subscriptions;

  return jsonb_build_object(
    'days', d, 'since', since,
    'revenue', prod_events,
    'costs', costs,
    'subscriptions', subs,
    'newAccounts', (select count(*) from bobby_identities where auth_user_id is not null and created_at >= since),
    'activeReaders30d', (select count(*) from bobby_reader_stats where last_read_at > now() - interval '30 days'),
    'llmUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at >= since),
    'llm30dUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at > now() - interval '30 days'),
    'assumptions', coalesce((select value from bobby_admin_settings where key = 'unit_economics'), '{}'::jsonb));
end;
$$;

revoke all on function public.bobby_admin_economics(int) from public, anon, authenticated;
grant execute on function public.bobby_admin_economics(int) to service_role;
revoke all on function public.bobby_touch_device(text, text, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.bobby_record_event(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_admin_lifecycle(int) from public, anon, authenticated;
revoke all on function public.bobby_track_reader() from public, anon, authenticated;
grant execute on function public.bobby_touch_device(text, text, text, text, text, uuid) to service_role;
grant execute on function public.bobby_record_event(text, text, text, text, text, text) to service_role;
grant execute on function public.bobby_admin_lifecycle(int) to service_role;
