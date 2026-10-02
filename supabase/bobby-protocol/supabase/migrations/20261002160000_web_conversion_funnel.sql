-- Distinct steps let a direct /desk entry count both its site visit and its mounted Desk view.
alter table public.bobby_events drop constraint if exists bobby_events_event_check;
alter table public.bobby_events add constraint bobby_events_event_check check (event in (
  'visit', 'desk_entered', 'checkout_opened', 'appstore_click', 'signin_start', 'paywall_view', 'purchase_start',
  'read_done', 'read_failed', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked'));

-- Old callers still work with the default identity. The API obtains identity from verified credentials only.
drop function if exists public.bobby_record_event(text, text, text, text, text, text, text, text, text);
create or replace function public.bobby_record_event(p_event text, p_platform text, p_surface text, p_device text,
  p_referrer text, p_utm text, p_country text default null, p_region text default null,
  p_network text default null, p_identity uuid default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := case when p_platform = 'web' then bobby_geo_country(p_country) end;
        r text := case when p_platform = 'web' then bobby_geo_region(p_country, p_region) end;
begin
  insert into bobby_events (event, platform, surface, device_hash, identity_id, referrer, utm_source, country, region)
    values (p_event, p_platform, p_surface, p_device, p_identity, p_referrer, p_utm, c, r);
  if p_device is not null then
    perform bobby_touch_device(p_device, p_platform, case when p_event = 'visit' then p_surface end,
      p_referrer, p_utm, p_identity, c, r, p_network);
  end if;
end;
$$;
revoke all on function public.bobby_record_event(text, text, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.bobby_record_event(text, text, text, text, text, text, text, text, text, uuid) to service_role;

-- Persist session dedupe without sending Stripe session ids or URLs to Amplitude.
create table if not exists public.bobby_checkout_funnel_sessions (
  session_id text primary key,
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  opened_at timestamptz not null default now()
);
alter table public.bobby_checkout_funnel_sessions enable row level security;
revoke all on public.bobby_checkout_funnel_sessions from public, anon, authenticated;
grant select, insert on public.bobby_checkout_funnel_sessions to service_role;

create or replace function public.bobby_record_checkout_opened(p_identity uuid, p_device text, p_session text,
  p_platform text default 'web', p_country text default null, p_region text default null, p_network text default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare pf text := case when p_platform in ('ios', 'android') then p_platform else 'web' end;
        dev text := case when length(p_device) between 8 and 128 then p_device end;
        c text := case when pf = 'web' then bobby_geo_country(p_country) end;
begin
  if p_identity is null or p_session !~ '^cs_[A-Za-z0-9_]{1,240}$' then raise exception 'invalid checkout event'; end if;
  insert into bobby_checkout_funnel_sessions(session_id, identity_id) values (p_session, p_identity)
    on conflict(session_id) do nothing;
  if not found then return false; end if;
  insert into bobby_events(event, platform, surface, device_hash, identity_id, country, region)
    values ('checkout_opened', pf, 'desk', dev, p_identity, c,
      case when c is not null then bobby_geo_region(p_country, p_region) end);
  if dev is not null then
    perform bobby_touch_device(dev, pf, 'desk', null, null, p_identity, c, p_region, p_network);
  end if;
  return true;
end;
$$;
revoke all on function public.bobby_record_checkout_opened(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.bobby_record_checkout_opened(uuid, text, text, text, text, text, text) to service_role;

-- The conversion alias has no revenue fields. The original financial event is exported separately.
-- A durable identity marker excludes renewals and later re-subscriptions even after acknowledgement retries.
create table if not exists public.bobby_amplitude_first_paid_exports (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  event_id text references public.bobby_purchase_events(id) on delete set null,
  exported_at timestamptz not null default now()
);
alter table public.bobby_amplitude_first_paid_exports enable row level security;
revoke all on public.bobby_amplitude_first_paid_exports from public, anon, authenticated;
grant select, insert on public.bobby_amplitude_first_paid_exports to service_role;
create index if not exists bobby_purchase_events_stripe_paid_identity_idx
  on public.bobby_purchase_events(identity_id, event_at, id)
  where environment = 'PRODUCTION' and store = 'STRIPE'
    and type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE');

create or replace function public.bobby_first_paid_event(p_identity uuid)
returns text language sql stable security invoker set search_path = public, pg_temp as $$
  select p.id from bobby_purchase_events p
    where p.identity_id = p_identity and p.environment = 'PRODUCTION' and p.store = 'STRIPE'
      and p.type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE')
      and ((p.price_usd > 0 and p.price_usd < 'Infinity'::numeric)
        or (p.price_local > 0 and p.price_local < 'Infinity'::numeric))
      and isfinite(p.created_at) and isfinite(p.event_at) and length(p.id) between 1 and 80
    order by p.event_at, p.id limit 1;
$$;
revoke all on function public.bobby_first_paid_event(uuid) from public, anon, authenticated;
grant execute on function public.bobby_first_paid_event(uuid) to service_role;

create or replace function public.bobby_amplitude_purchase_batch(p_limit int default 500)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with pending as (
    select p.* from bobby_purchase_events p
    where p.environment = 'PRODUCTION' and p.type ~ '^[A-Z_]{1,40}$' and length(p.id) between 1 and 80
      and isfinite(p.event_at) and isfinite(p.created_at) and p.identity_id is not null
      and p.identity_id not in (select bobby_internal_identity_ids())
      and p.created_at < now() - interval '10 minutes'
      and not exists (select 1 from bobby_amplitude_purchase_exports x where x.event_id = p.id)
    order by p.created_at, p.id limit least(greatest(coalesce(p_limit, 500), 1), 500)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'type', p.type, 'environment', p.environment, 'store', p.store, 'product', p.product_id,
    'identity', p.identity_id, 'at', p.event_at, 'priceUsd', p.price_usd, 'takehome', p.takehome,
    'currency', p.currency, 'priceLocal', p.price_local,
    'firstPaid', not exists (select 1 from bobby_amplitude_first_paid_exports x where x.identity_id = p.identity_id)
      and p.id = bobby_first_paid_event(p.identity_id)) order by p.created_at, p.id), '[]'::jsonb)
  from pending p;
$$;

drop function if exists public.bobby_amplitude_purchase_ack(text[]);
create or replace function public.bobby_amplitude_purchase_ack(p_ids text[], p_first_ids text[] default '{}')
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  insert into bobby_amplitude_first_paid_exports(identity_id, event_id)
    select p.identity_id, p.id from bobby_purchase_events p
    -- Acknowledge exactly the alias sent, even if an older invoice arrived after the batch snapshot.
    -- Recomputing "earliest" here could lose the marker and emit another conversion on a later cron.
    where p.id = any(p_ids) and p.id = any(p_first_ids)
      and p.environment = 'PRODUCTION' and p.identity_id is not null and p.store = 'STRIPE'
      and p.identity_id not in (select bobby_internal_identity_ids())
      and p.type in ('INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE')
      and ((p.price_usd > 0 and p.price_usd < 'Infinity'::numeric)
        or (p.price_local > 0 and p.price_local < 'Infinity'::numeric))
      and isfinite(p.created_at) and isfinite(p.event_at) and length(p.id) between 1 and 80
    on conflict(identity_id) do nothing;
  insert into bobby_amplitude_purchase_exports(event_id)
    select p.id from bobby_purchase_events p
    where p.id = any(p_ids) and p.environment = 'PRODUCTION' and p.identity_id is not null
      and p.identity_id not in (select bobby_internal_identity_ids())
      and p.type ~ '^[A-Z_]{1,40}$' and length(p.id) between 1 and 80
      and isfinite(p.event_at) and isfinite(p.created_at)
    on conflict(event_id) do nothing;
end;
$$;
revoke all on function public.bobby_amplitude_purchase_ack(text[], text[]) from public, anon, authenticated;
grant execute on function public.bobby_amplitude_purchase_ack(text[], text[]) to service_role;
