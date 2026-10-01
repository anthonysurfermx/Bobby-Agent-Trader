-- Audience location for the owner dashboard (coarse only).
-- Web events and web devices keep the country (ISO 3166-1 alpha-2) and region (ISO 3166-2 subdivision, e.g. CMX)
-- that Vercel derives from the request IP; the IP itself is never stored, and the iOS app reports no location
-- (its privacy label declares none). Purchases keep the store country RevenueCat / Stripe report.

alter table public.bobby_events add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
alter table public.bobby_events add column if not exists region text check (region is null or region ~ '^[A-Z0-9]{1,3}$');
alter table public.bobby_devices add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
alter table public.bobby_devices add column if not exists region text check (region is null or region ~ '^[A-Z0-9]{1,3}$');
alter table public.bobby_purchase_events add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$');
create index if not exists bobby_devices_country_idx on public.bobby_devices (country, first_seen desc) where country is not null;

create or replace function public.bobby_geo_country(p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when upper(p) ~ '^[A-Z]{2}$' and upper(p) not in ('XX', 'T1', 'ZZ') then upper(p) end;
$$;

create or replace function public.bobby_geo_region(p_country text, p text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when bobby_geo_country(p_country) is not null and upper(p) ~ '^[A-Z0-9]{1,3}$' then upper(p) end;
$$;

-- Same behavior as 20261001200000, plus the location: the latest known one wins (people travel and move).
drop function if exists public.bobby_touch_device(text, text, text, text, text, uuid);
create or replace function public.bobby_touch_device(p_device text, p_platform text, p_surface text, p_referrer text, p_utm text, p_identity uuid,
  p_country text default null, p_region text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := bobby_geo_country(p_country); r text := bobby_geo_region(p_country, p_region);
begin
  if p_device is null or length(p_device) not between 8 and 128 then return; end if;
  insert into bobby_devices as d (device_hash, platform, first_surface, referrer, utm_source, identity_id, linked_at, country, region)
    values (p_device, case when p_platform in ('ios', 'android') then p_platform else 'web' end,
      case when p_surface ~ '^[a-z0-9_-]{1,32}$' then p_surface end,
      case when p_referrer ~ '^[a-z0-9.-]{1,80}$' then p_referrer end,
      case when p_utm ~ '^[a-z0-9_.-]{1,40}$' then p_utm end,
      p_identity, case when p_identity is not null then now() end, c, r)
  on conflict (device_hash) do update set
    active_days = d.active_days + case when (d.last_seen at time zone 'utc')::date < (now() at time zone 'utc')::date then 1 else 0 end,
    last_seen = greatest(d.last_seen, now()),
    first_surface = coalesce(d.first_surface, excluded.first_surface),
    identity_id = coalesce(excluded.identity_id, d.identity_id),
    linked_at = case when excluded.identity_id is not null and d.identity_id is distinct from excluded.identity_id then now() else d.linked_at end,
    country = coalesce(excluded.country, d.country),
    region = case when excluded.country is not null then excluded.region else d.region end;
end;
$$;

drop function if exists public.bobby_record_event(text, text, text, text, text, text);
create or replace function public.bobby_record_event(p_event text, p_platform text, p_surface text, p_device text, p_referrer text, p_utm text,
  p_country text default null, p_region text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := case when p_platform = 'web' then bobby_geo_country(p_country) end;
        r text := case when p_platform = 'web' then bobby_geo_region(p_country, p_region) end;
begin
  insert into bobby_events (event, platform, surface, device_hash, referrer, utm_source, country, region)
    values (p_event, p_platform, p_surface, p_device, p_referrer, p_utm, c, r);
  if p_device is not null then
    perform bobby_touch_device(p_device, p_platform, case when p_event = 'visit' then p_surface end, p_referrer, p_utm, null, c, r);
  end if;
end;
$$;

-- Where the audience is, for the period's new web devices (the same cohort as the web funnel), plus purchases
-- by store country. Devices seen before location was recorded count as "unlocated", never as a country.
create or replace function public.bobby_admin_geo(p_days int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
begin
  return (
    with cohort as (
      select dv.country, dv.region, dv.identity_id,
        coalesce(g.reads, 0) + coalesce(a.reads, 0) as reads,
        dv.identity_id is not null and bobby_is_pro(dv.identity_id) as pro
      from bobby_devices dv
      left join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
      left join bobby_reader_stats a on dv.identity_id is not null and a.reader = 'a:' || dv.identity_id::text
      where dv.platform = 'web' and dv.first_seen >= since
    )
    select jsonb_build_object(
      'since', since,
      'days', d,
      'locatedSince', (select min(created_at) from bobby_events where country is not null),
      'web', jsonb_build_object('devices', (select count(*) from cohort), 'located', (select count(*) from cohort where country is not null)),
      'countries', coalesce((select jsonb_agg(x order by (x->>'visitors')::int desc, x->>'country') from (
          select jsonb_build_object('country', country, 'visitors', count(*), 'readers', count(*) filter (where reads >= 1),
            'accounts', count(*) filter (where identity_id is not null), 'pro', count(*) filter (where pro)) as x
          from cohort where country is not null group by country order by count(*) desc, country limit 40) t), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(x order by (x->>'visitors')::int desc, x->>'country', x->>'region') from (
          select jsonb_build_object('country', country, 'region', region, 'visitors', count(*), 'readers', count(*) filter (where reads >= 1)) as x
          from cohort where region is not null group by country, region order by count(*) desc, country, region limit 40) t), '[]'::jsonb),
      'purchases', coalesce((select jsonb_agg(x order by (x->>'newPaying')::int desc, x->>'country') from (
          select jsonb_build_object('country', coalesce(country, '??'),
            'newPaying', count(*) filter (where type = 'INITIAL_PURCHASE'),
            'grossUsd', round(coalesce(sum(price_usd) filter (where price_usd > 0), 0)::numeric, 2)) as x
          from bobby_purchase_events
          where event_at >= since and coalesce(environment, 'PRODUCTION') = 'PRODUCTION'
          group by country) t), '[]'::jsonb)
    ));
end;
$$;

revoke all on function public.bobby_geo_country(text) from public, anon, authenticated;
revoke all on function public.bobby_geo_region(text, text) from public, anon, authenticated;
revoke all on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.bobby_record_event(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_admin_geo(int) from public, anon, authenticated;
grant execute on function public.bobby_geo_country(text) to service_role;
grant execute on function public.bobby_geo_region(text, text) to service_role;
grant execute on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text) to service_role;
grant execute on function public.bobby_record_event(text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.bobby_admin_geo(int) to service_role;
