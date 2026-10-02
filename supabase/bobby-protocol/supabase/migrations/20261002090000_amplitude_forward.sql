-- ============================================================
-- Server-side forwarding of first-party events to Amplitude (api/_lib/amplitude.ts, cron /api/admin?cron=amplitude).
-- No SDK runs in the app: the server reads bobby_events after a cursor, drops the team's own traffic (same sets the
-- dashboard uses: bobby_internal_identity_ids / bobby_internal_device_hashes) and sends the rest. Events younger
-- than 10 minutes wait, so an install that opens /admin or joins a team network right after arriving is judged first.
-- The cursor lives in bobby_admin_settings ('amplitude_cursor') and only moves after Amplitude accepts a batch.
-- ============================================================

create or replace function public.bobby_amplitude_batch(p_limit int default 500)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with cur as (
    select coalesce((select (value->>'id')::bigint from bobby_admin_settings where key = 'amplitude_cursor'), 0) as id
  ), scan as (
    select e.* from bobby_events e, cur
    where e.id > cur.id and e.created_at < now() - interval '10 minutes'
    order by e.id limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ), ii as (select bobby_internal_identity_ids() as id), dd as (select bobby_internal_device_hashes() as h)
  select jsonb_build_object(
    'cursor', (select id from cur),
    'last', (select max(id) from scan),
    'scanned', (select count(*) from scan),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'at', s.created_at, 'event', s.event, 'platform', s.platform, 'surface', s.surface,
        'device', s.device_hash, 'identity', s.identity_id, 'referrer', s.referrer, 'utm', s.utm_source,
        'country', s.country, 'region', s.region, 'detail', s.detail) order by s.id)
      from scan s
      where (s.identity_id is null or s.identity_id not in (select id from ii))
        and (s.device_hash is null or s.device_hash not in (select h from dd))
        and (s.device_hash is not null or s.identity_id is not null)), '[]'::jsonb)
  );
$$;

create or replace function public.bobby_amplitude_advance(p_from bigint, p_to bigint)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  -- Compare-and-set: two overlapping cron runs can never move the cursor backwards or skip a batch.
  insert into bobby_admin_settings (key, value) values ('amplitude_cursor', jsonb_build_object('id', 0))
    on conflict (key) do nothing;
  update bobby_admin_settings set value = jsonb_build_object('id', p_to, 'at', now()), updated_at = now()
    where key = 'amplitude_cursor' and coalesce((value->>'id')::bigint, 0) = p_from and p_to > p_from;
  return found;
end;
$$;

revoke all on function public.bobby_amplitude_batch(int) from public, anon, authenticated;
revoke all on function public.bobby_amplitude_advance(bigint, bigint) from public, anon, authenticated;
grant execute on function public.bobby_amplitude_batch(int) to service_role;
grant execute on function public.bobby_amplitude_advance(bigint, bigint) to service_role;
