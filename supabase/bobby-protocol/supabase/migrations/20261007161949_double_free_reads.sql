-- The free allowance doubles (owner's decision, 2026-10-07): people see more of Bobby before they
-- are asked for an account or for Bobby Pro.
--   · a guest (install without an account): 6 reads per 30 days (was 3) → then sign-in;
--   · a free account: 20 reads per rolling 7 days (was 10) → then Bobby Pro, while the paywall is on;
--   · the guest pool of one network: 200 reads per 7 days (was 100), so the same number of new installs
--     behind one carrier NAT or office still get their whole allowance.
-- Nothing else changes: the same signatures, locks, windows, purge, gifted reads (spent only after the
-- regular allowance and never counted toward it), Bobby Pro without a cap, and service-only privileges.
-- Both functions are 20261001230000 / 20261002140326 with the three numbers named once at the top of each;
-- api/_lib/desk-levels.ts (FREE_READS) states the same numbers and scripts/test-free-reads-pg.mts holds
-- the three places together.

create or replace function public.bobby_consume_read(p_identity uuid, p_device text, p_network text, p_platform text, p_symbol text, p_paywall boolean)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  guest_limit constant int := 6;      -- reads per install per 30 days, without an account
  free_limit constant int := 20;      -- reads per free account per rolling 7 days
  network_limit constant int := 200;  -- guest reads per network per 7 days
  used int; net_used int; oldest timestamptz; rid bigint; extra int;
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
    if p_paywall and used >= free_limit then
      update bobby_usage_bonus set reads = reads - 1, updated_at = now()
        where identity_id = p_identity and reads > 0 returning reads into extra;
      if found then
        insert into bobby_reads(identity_id, device_hash, platform, symbol, bonus) values (p_identity, p_device, p_platform, p_symbol, true) returning id into rid;
        return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'free', 'used', used, 'limit', free_limit,
          'resetsAt', oldest + interval '7 days', 'bonus', extra);
      end if;
      return jsonb_build_object('allowed', false, 'code', 'subscription_required', 'readId', null, 'tier', 'free',
        'used', used, 'limit', free_limit, 'resetsAt', oldest + interval '7 days', 'bonus', 0);
    end if;
    insert into bobby_reads(identity_id, device_hash, platform, symbol) values (p_identity, p_device, p_platform, p_symbol) returning id into rid;
    extra := coalesce((select reads from bobby_usage_bonus where identity_id = p_identity), 0);
    return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'free', 'used', used + 1, 'limit', free_limit,
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
  -- The network pool: carrier NAT, offices and App Review share one /24, and a brand-new install there
  -- must still get its whole guest allowance. Device rotation stays bounded by this pool.
  if used >= guest_limit or net_used >= network_limit then
    return jsonb_build_object('allowed', false, 'code', 'signin_required', 'readId', null, 'tier', 'anon',
      'used', greatest(used, guest_limit), 'limit', guest_limit, 'resetsAt', null);
  end if;
  insert into bobby_reads(device_hash, network_hash, platform, symbol) values (p_device, p_network, p_platform, p_symbol) returning id into rid;
  return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'anon', 'used', used + 1, 'limit', guest_limit, 'resetsAt', null);
end;
$$;

create or replace function public.bobby_read_access(p_identity uuid, p_device text, p_paywall boolean)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  guest_limit constant int := 6;  -- the same numbers as bobby_consume_read
  free_limit constant int := 20;
  used int; oldest timestamptz;
begin
  if p_identity is not null then
    if bobby_is_pro(p_identity) then
      return jsonb_build_object('tier', 'pro', 'used', null, 'limit', null, 'resetsAt', null,
        'bonus', coalesce((select reads from bobby_usage_bonus where identity_id = p_identity), 0));
    end if;
    select count(*), min(created_at) into used, oldest from bobby_reads
      where identity_id = p_identity and not bonus and created_at > now() - interval '7 days';
    return jsonb_build_object('tier', 'free', 'used', used, 'limit', free_limit,
      'resetsAt', case when used > 0 then oldest + interval '7 days' else null end,
      'bonus', coalesce((select reads from bobby_usage_bonus where identity_id = p_identity), 0));
  end if;
  if p_device is null then
    return jsonb_build_object('tier', 'anon', 'used', null, 'limit', null, 'resetsAt', null);
  end if;
  select count(*) into used from bobby_reads
    where identity_id is null and device_hash = p_device and created_at > now() - interval '30 days';
  return jsonb_build_object('tier', 'anon', 'used', used, 'limit', guest_limit, 'resetsAt', null);
end;
$$;

revoke all on function public.bobby_consume_read(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.bobby_read_access(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.bobby_consume_read(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.bobby_read_access(uuid, text, boolean) to service_role;
