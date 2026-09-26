-- Metered access to the desk read (/api/voice-tool run_debate), shared by web and iOS.
--   · anonymous (a device that sends x-bobby-device, no account): 3 reads per 30 days, plus a
--     network backstop of 15 anonymous reads per 7 days → then sign-in is required;
--   · signed in (bobby_identities): 10 reads per rolling 7 days → then Bobby Pro, but only while
--     the paywall is switched on (p_paywall; the API reads BOBBY_PAYWALL);
--   · Bobby Pro (an active row in bobby_subscriptions, Stripe on the web or Apple on iOS): no cap.
-- Devices and networks arrive as salted hashes (api/_lib/rate-limit.ts); no address or raw device
-- id is stored. Rows older than 35 days are swept on every call.

create table if not exists public.bobby_reads (
  id bigserial primary key,
  identity_id uuid references public.bobby_identities(id) on delete cascade,
  device_hash text,
  network_hash text,
  platform text,
  symbol text,
  created_at timestamptz not null default now()
);
create index if not exists bobby_reads_identity_idx on public.bobby_reads (identity_id, created_at desc) where identity_id is not null;
create index if not exists bobby_reads_device_idx on public.bobby_reads (device_hash, created_at desc) where identity_id is null;
create index if not exists bobby_reads_network_idx on public.bobby_reads (network_hash, created_at desc) where identity_id is null;
alter table public.bobby_reads enable row level security;
revoke all on public.bobby_reads from public, anon, authenticated;
grant all on public.bobby_reads to service_role;
grant usage, select on sequence public.bobby_reads_id_seq to service_role;

create table if not exists public.bobby_subscriptions (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple')),
  status text not null,
  product_id text,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  apple_original_transaction_id text unique,
  updated_at timestamptz not null default now()
);
create index if not exists bobby_subscriptions_customer_idx on public.bobby_subscriptions (stripe_customer_id);
alter table public.bobby_subscriptions enable row level security;
revoke all on public.bobby_subscriptions from public, anon, authenticated;
grant all on public.bobby_subscriptions to service_role;

create or replace function public.bobby_is_pro(p_identity uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from bobby_subscriptions s
    where s.identity_id = p_identity
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- The access state without consuming anything (GET /api/bobby-access).
create or replace function public.bobby_read_access(p_identity uuid, p_device text, p_paywall boolean)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare used int; oldest timestamptz;
begin
  if p_identity is not null then
    if bobby_is_pro(p_identity) then
      return jsonb_build_object('tier', 'pro', 'used', null, 'limit', null, 'resetsAt', null);
    end if;
    select count(*), min(created_at) into used, oldest from bobby_reads
      where identity_id = p_identity and created_at > now() - interval '7 days';
    return jsonb_build_object('tier', 'free', 'used', used, 'limit', 10,
      'resetsAt', case when used > 0 then oldest + interval '7 days' else null end);
  end if;
  if p_device is null then
    return jsonb_build_object('tier', 'anon', 'used', null, 'limit', null, 'resetsAt', null);
  end if;
  select count(*) into used from bobby_reads
    where identity_id is null and device_hash = p_device and created_at > now() - interval '30 days';
  return jsonb_build_object('tier', 'anon', 'used', used, 'limit', 3, 'resetsAt', null);
end;
$$;

-- Check and record one read atomically. Returns the access state plus
--   allowed (bool), code ('signin_required' | 'subscription_required' | null) and readId (to refund
--   a read whose analysis then failed).
create or replace function public.bobby_consume_read(
  p_identity uuid, p_device text, p_network text, p_platform text, p_symbol text, p_paywall boolean)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
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
    -- A client that does not know about accounts yet (iOS ≤ 1.5 build 42): served as before.
    return jsonb_build_object('allowed', true, 'code', null, 'readId', null, 'tier', 'anon', 'used', null, 'limit', null, 'resetsAt', null);
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
  if used >= 3 or net_used >= 15 then
    return jsonb_build_object('allowed', false, 'code', 'signin_required', 'readId', null, 'tier', 'anon', 'used', greatest(used, 3), 'limit', 3, 'resetsAt', null);
  end if;
  insert into bobby_reads(device_hash, network_hash, platform, symbol) values (p_device, p_network, p_platform, p_symbol) returning id into rid;
  return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'anon', 'used', used + 1, 'limit', 3, 'resetsAt', null);
end;
$$;

revoke all on function public.bobby_is_pro(uuid) from public, anon, authenticated;
revoke all on function public.bobby_read_access(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.bobby_consume_read(uuid, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.bobby_is_pro(uuid) to service_role;
grant execute on function public.bobby_read_access(uuid, text, boolean) to service_role;
grant execute on function public.bobby_consume_read(uuid, text, text, text, text, boolean) to service_role;
