-- Serialize shared anonymous network quotas; preserve the deployed access rules and grants.
CREATE OR REPLACE FUNCTION public.bobby_consume_read(p_identity uuid, p_device text, p_network text, p_platform text, p_symbol text, p_paywall boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare used int; net_used int; oldest timestamptz; rid bigint;
begin
  if p_device is not null and (length(p_device) < 8 or length(p_device) > 128) then raise exception 'invalid device'; end if;
  if p_network is not null and (length(p_network) < 8 or length(p_network) > 128) then raise exception 'invalid network'; end if;
  delete from bobby_reads where id in (
    select id from bobby_reads where created_at < now() - interval '35 days' limit 500 for update skip locked);

  if p_identity is not null then
    perform pg_advisory_xact_lock(hashtext('bobby_read:' || p_identity::text));
    if bobby_is_pro(p_identity) then
      insert into bobby_reads(identity_id, platform, symbol) values (p_identity, p_platform, p_symbol) returning id into rid;
      return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'pro', 'used', null, 'limit', null, 'resetsAt', null);
    end if;
    select count(*), min(created_at) into used, oldest from bobby_reads
      where identity_id = p_identity and created_at > now() - interval '7 days';
    if p_paywall and used >= 10 then
      return jsonb_build_object('allowed', false, 'code', 'subscription_required', 'readId', null, 'tier', 'free',
        'used', used, 'limit', 10, 'resetsAt', oldest + interval '7 days');
    end if;
    insert into bobby_reads(identity_id, platform, symbol) values (p_identity, p_platform, p_symbol) returning id into rid;
    return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'free', 'used', used + 1, 'limit', 10,
      'resetsAt', coalesce(oldest, now()) + interval '7 days');
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
$function$
;

revoke all on function public.bobby_consume_read(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bobby_consume_read(uuid, text, text, text, text, boolean) to service_role;
