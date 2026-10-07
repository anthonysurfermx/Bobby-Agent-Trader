-- Traffic signal per install: which active installs are a person, which come from a hosting network, which gave
-- no sign either way. api/track.ts already drops crawlers that declare themselves; the ones that reach
-- bobby_devices carry a browser user agent, so the class comes from two facts stored as such, never the raw data:
--   engaged_at  first real interaction on the page (pointer, key, touch or scroll), sent once by the web client
--   datacenter  the visit came from a hosting provider's network (ASN matched in api/_lib/geo.ts; the ASN is not kept)
-- Additive: no existing function or figure changes.

alter table public.bobby_devices
  add column if not exists engaged_at timestamptz,
  add column if not exists datacenter boolean not null default false;

create or replace function public.bobby_mark_device_signal(p_device text, p_engaged boolean default false, p_datacenter boolean default false)
returns void language sql set search_path = public, pg_temp as $$
  update bobby_devices set
    engaged_at = case when coalesce(p_engaged, false) then coalesce(engaged_at, now()) else engaged_at end,
    datacenter = datacenter or coalesce(p_datacenter, false)
  where device_hash = p_device
    and ((coalesce(p_engaged, false) and engaged_at is null) or (coalesce(p_datacenter, false) and not datacenter));
$$;
revoke all on function public.bobby_mark_device_signal(text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.bobby_mark_device_signal(text, boolean, boolean) to service_role;

-- The people behind people.active7d (bobby_admin_growth), split by signal; the three classes add up to it.
--   verified    an account, a reader, a native app install, or a web install that interacted
--   datacenter  a web guest with no such sign, seen from a hosting network
--   unverified  a web guest with no sign either way (every web install before signalSince is here or above)
create or replace function public.bobby_admin_traffic(p_internal boolean default false)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  with p as (
    select * from bobby_admin_people_facts_v2()
    where (coalesce(p_internal, false) or not internal) and last_day > (now() at time zone 'utc')::date - 7
  ), c as (
    select case
      when p.kind = 'account' or p.reads > 0 or p.platform is distinct from 'web' or dv.engaged_at is not null then 'verified'
      when dv.datacenter then 'datacenter'
      else 'unverified' end as class
    from p left join bobby_devices dv on p.kind = 'guest' and dv.device_hash = substr(p.person, 3)
  )
  select jsonb_build_object(
    'verified7d', count(*) filter (where class = 'verified'),
    'datacenter7d', count(*) filter (where class = 'datacenter'),
    'unverified7d', count(*) filter (where class = 'unverified'),
    'signalSince', (select least(min(engaged_at), min(first_seen) filter (where datacenter)) from bobby_devices))
  from c;
$$;
revoke all on function public.bobby_admin_traffic(boolean) from public, anon, authenticated;
grant execute on function public.bobby_admin_traffic(boolean) to service_role;

notify pgrst, 'reload schema';
