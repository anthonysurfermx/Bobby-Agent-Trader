-- Coupons that gift extra usage (2026-10-01).
--   · bobby_coupons: a code the owner creates (by SQL) with the reads / Profundo / Máximo it gives, an optional
--     redemption cap and expiry. bobby_coupon_redemptions: once per account per code.
--   · bobby_usage_bonus: the account's balance of gifted uses. It is spent only after the regular allowance
--     runs out (weekly free reads while the paywall is on; the Profundo / Máximo windows), and a gifted use
--     never counts toward that allowance (bobby_reads.bonus / bobby_level_uses.bonus).
--   · A refunded analysis (the row deleted seconds later by refundRead / refundLevel) gives the gift back.
-- Redemption needs an Apple/Google account (like referrals) and runs on the web; the iOS app only spends it.
-- Same privilege rule as 20260929150000: service_role only, anon and authenticated revoked by name.

create table if not exists public.bobby_coupons (
  code text primary key check (code ~ '^[A-Z0-9][A-Z0-9-]{3,31}$'),
  reads int not null default 0 check (reads between 0 and 1000),
  profundo int not null default 0 check (profundo between 0 and 200),
  maximo int not null default 0 check (maximo between 0 and 100),
  max_redemptions int check (max_redemptions is null or max_redemptions > 0),
  redeemed int not null default 0 check (redeemed >= 0),
  expires_at timestamptz,
  active boolean not null default true,
  note text check (note is null or length(note) <= 200),
  created_at timestamptz not null default now(),
  check (reads + profundo + maximo > 0)
);

create table if not exists public.bobby_coupon_redemptions (
  id bigserial primary key,
  code text not null references public.bobby_coupons(code) on delete cascade,
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  reads int not null,
  profundo int not null,
  maximo int not null,
  created_at timestamptz not null default now(),
  unique (code, identity_id)
);
create index if not exists bobby_coupon_redemptions_identity_idx on public.bobby_coupon_redemptions (identity_id);

create table if not exists public.bobby_usage_bonus (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  reads int not null default 0 check (reads between 0 and 100000),
  profundo int not null default 0 check (profundo between 0 and 100000),
  maximo int not null default 0 check (maximo between 0 and 100000),
  updated_at timestamptz not null default now()
);

alter table public.bobby_reads add column if not exists bonus boolean not null default false;
alter table public.bobby_level_uses add column if not exists bonus boolean not null default false;

alter table public.bobby_coupons enable row level security;
alter table public.bobby_coupon_redemptions enable row level security;
alter table public.bobby_usage_bonus enable row level security;
revoke all on public.bobby_coupons, public.bobby_coupon_redemptions, public.bobby_usage_bonus from public, anon, authenticated;
grant all on public.bobby_coupons, public.bobby_coupon_redemptions, public.bobby_usage_bonus to service_role;
revoke all on sequence public.bobby_coupon_redemptions_id_seq from public, anon, authenticated;
grant usage, select on sequence public.bobby_coupon_redemptions_id_seq to service_role;

-- Redeem a coupon for an Apple/Google account. result: redeemed | invalid_code | expired | exhausted |
-- already_redeemed | account_required. Security definer only to read auth.identities (as bobby_referral_claim).
create or replace function public.bobby_redeem_coupon(p_identity uuid, p_code text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.bobby_coupons%rowtype; auth_id uuid; b public.bobby_usage_bonus%rowtype;
begin
  if p_identity is null then return jsonb_build_object('result', 'account_required'); end if;
  if p_code is null or p_code !~ '^[A-Z0-9][A-Z0-9-]{3,31}$' then return jsonb_build_object('result', 'invalid_code'); end if;
  select auth_user_id into auth_id from bobby_identities where id = p_identity;
  if auth_id is null or not exists (
    select 1 from auth.identities i where i.user_id = auth_id and i.provider in ('apple', 'google')
  ) then
    return jsonb_build_object('result', 'account_required');
  end if;
  select * into c from bobby_coupons where code = p_code for update;
  if not found or not c.active then return jsonb_build_object('result', 'invalid_code'); end if;
  if c.expires_at is not null and c.expires_at <= now() then return jsonb_build_object('result', 'expired'); end if;
  if exists (select 1 from bobby_coupon_redemptions r where r.code = p_code and r.identity_id = p_identity) then
    return jsonb_build_object('result', 'already_redeemed');
  end if;
  if c.max_redemptions is not null and c.redeemed >= c.max_redemptions then return jsonb_build_object('result', 'exhausted'); end if;
  insert into bobby_coupon_redemptions(code, identity_id, reads, profundo, maximo) values (p_code, p_identity, c.reads, c.profundo, c.maximo);
  update bobby_coupons set redeemed = redeemed + 1 where code = p_code;
  insert into bobby_usage_bonus as u (identity_id, reads, profundo, maximo) values (p_identity, c.reads, c.profundo, c.maximo)
    on conflict (identity_id) do update set
      reads = least(u.reads + excluded.reads, 100000),
      profundo = least(u.profundo + excluded.profundo, 100000),
      maximo = least(u.maximo + excluded.maximo, 100000),
      updated_at = now()
    returning * into b;
  return jsonb_build_object('result', 'redeemed',
    'granted', jsonb_build_object('reads', c.reads, 'profundo', c.profundo, 'maximo', c.maximo),
    'bonus', jsonb_build_object('reads', b.reads, 'profundo', b.profundo, 'maximo', b.maximo));
end;
$$;

-- The read meter (20260930121932) with the gifted balance: a free account at its weekly cap spends one gifted
-- read instead of being refused, and gifted reads stay out of the weekly count. Pro and guests are unchanged.
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
      insert into bobby_reads(identity_id, platform, symbol) values (p_identity, p_platform, p_symbol) returning id into rid;
      return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'pro', 'used', null, 'limit', null, 'resetsAt', null);
    end if;
    select count(*), min(created_at) into used, oldest from bobby_reads
      where identity_id = p_identity and not bonus and created_at > now() - interval '7 days';
    if p_paywall and used >= 10 then
      update bobby_usage_bonus set reads = reads - 1, updated_at = now()
        where identity_id = p_identity and reads > 0 returning reads into extra;
      if found then
        insert into bobby_reads(identity_id, platform, symbol, bonus) values (p_identity, p_platform, p_symbol, true) returning id into rid;
        return jsonb_build_object('allowed', true, 'code', null, 'readId', rid, 'tier', 'free', 'used', used, 'limit', 10,
          'resetsAt', oldest + interval '7 days', 'bonus', extra);
      end if;
      return jsonb_build_object('allowed', false, 'code', 'subscription_required', 'readId', null, 'tier', 'free',
        'used', used, 'limit', 10, 'resetsAt', oldest + interval '7 days', 'bonus', 0);
    end if;
    insert into bobby_reads(identity_id, platform, symbol) values (p_identity, p_platform, p_symbol) returning id into rid;
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

create or replace function public.bobby_read_access(p_identity uuid, p_device text, p_paywall boolean)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare used int; oldest timestamptz;
begin
  if p_identity is not null then
    if bobby_is_pro(p_identity) then
      return jsonb_build_object('tier', 'pro', 'used', null, 'limit', null, 'resetsAt', null);
    end if;
    select count(*), min(created_at) into used, oldest from bobby_reads
      where identity_id = p_identity and not bonus and created_at > now() - interval '7 days';
    return jsonb_build_object('tier', 'free', 'used', used, 'limit', 10,
      'resetsAt', case when used > 0 then oldest + interval '7 days' else null end,
      'bonus', coalesce((select reads from bobby_usage_bonus where identity_id = p_identity), 0));
  end if;
  if p_device is null then
    return jsonb_build_object('tier', 'anon', 'used', null, 'limit', null, 'resetsAt', null);
  end if;
  select count(*) into used from bobby_reads
    where identity_id is null and device_hash = p_device and created_at > now() - interval '30 days';
  return jsonb_build_object('tier', 'anon', 'used', used, 'limit', 3, 'resetsAt', null);
end;
$$;

-- The premium meters (20260929150000) with the gifted balance per level: `remaining` includes it.
create or replace function public.bobby_level_state(p_identity uuid, p_device text, p_limits jsonb)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare tier text := bobby_level_tier(p_identity); lv text; lim int; win int; used int; oldest timestamptz; extra int;
  gift public.bobby_usage_bonus%rowtype; levels jsonb := '{}'::jsonb;
begin
  if p_identity is not null then select * into gift from bobby_usage_bonus where identity_id = p_identity; end if;
  foreach lv in array array['profundo', 'maximo'] loop
    lim := greatest(coalesce((p_limits -> tier -> lv ->> 0)::int, 0), 0);
    win := greatest(coalesce((p_limits -> tier -> lv ->> 1)::int, 7), 1);
    used := 0; oldest := null;
    extra := coalesce(case lv when 'profundo' then gift.profundo else gift.maximo end, 0);
    if p_identity is not null then
      select count(*), min(created_at) into used, oldest from bobby_level_uses
        where identity_id = p_identity and level = lv and not bonus and created_at > now() - make_interval(days => win);
    elsif p_device is not null then
      select count(*), min(created_at) into used, oldest from bobby_level_uses
        where identity_id is null and device_hash = p_device and level = lv and created_at > now() - make_interval(days => win);
    end if;
    levels := levels || jsonb_build_object(lv, jsonb_build_object('used', used, 'limit', lim, 'remaining', greatest(lim - used, 0) + extra,
      'windowDays', win, 'resetsAt', case when used > 0 then oldest + make_interval(days => win) else null end, 'bonus', extra));
  end loop;
  return jsonb_build_object('tier', tier, 'levels', levels);
end;
$$;

create or replace function public.bobby_consume_level(p_identity uuid, p_device text, p_level text, p_symbol text, p_limits jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare tier text; lim int; win int; used int; oldest timestamptz; uid bigint; extra int;
begin
  if p_level is null or p_level not in ('profundo', 'maximo') then raise exception 'invalid level'; end if;
  if p_device is not null and (length(p_device) < 8 or length(p_device) > 128) then raise exception 'invalid device'; end if;
  delete from bobby_level_uses where id in (
    select id from bobby_level_uses where created_at < now() - interval '35 days' limit 500 for update skip locked);
  if p_identity is null and p_device is null then
    return jsonb_build_object('allowed', false, 'code', 'signin_required', 'useId', null, 'tier', 'anon', 'used', 0, 'limit', 0, 'resetsAt', null);
  end if;
  perform pg_advisory_xact_lock(hashtext('bobby_level:' || coalesce(p_identity::text, p_device)));
  tier := bobby_level_tier(p_identity);
  lim := greatest(coalesce((p_limits -> tier -> p_level ->> 0)::int, 0), 0);
  win := greatest(coalesce((p_limits -> tier -> p_level ->> 1)::int, 7), 1);
  if p_identity is not null then
    select count(*), min(created_at) into used, oldest from bobby_level_uses
      where identity_id = p_identity and level = p_level and not bonus and created_at > now() - make_interval(days => win);
  else
    select count(*), min(created_at) into used, oldest from bobby_level_uses
      where identity_id is null and device_hash = p_device and level = p_level and created_at > now() - make_interval(days => win);
  end if;
  if used >= lim then
    if p_identity is not null then
      if p_level = 'profundo' then
        update bobby_usage_bonus set profundo = profundo - 1, updated_at = now()
          where identity_id = p_identity and profundo > 0 returning profundo into extra;
      else
        update bobby_usage_bonus set maximo = maximo - 1, updated_at = now()
          where identity_id = p_identity and maximo > 0 returning maximo into extra;
      end if;
      if extra is not null then
        insert into bobby_level_uses(identity_id, device_hash, level, symbol, bonus)
          values (p_identity, null, p_level, left(p_symbol, 24), true) returning id into uid;
        return jsonb_build_object('allowed', true, 'code', null, 'useId', uid, 'tier', tier, 'used', used, 'limit', lim,
          'resetsAt', case when oldest is not null then oldest + make_interval(days => win) else null end, 'bonus', extra);
      end if;
    end if;
    return jsonb_build_object('allowed', false,
      'code', case tier when 'anon' then 'signin_required' when 'free' then 'upgrade_required' else 'level_exhausted' end,
      'useId', null, 'tier', tier, 'used', used, 'limit', lim,
      'resetsAt', case when oldest is not null then oldest + make_interval(days => win) else null end);
  end if;
  insert into bobby_level_uses(identity_id, device_hash, level, symbol)
    values (p_identity, case when p_identity is null then p_device else null end, p_level, left(p_symbol, 24))
    returning id into uid;
  return jsonb_build_object('allowed', true, 'code', null, 'useId', uid, 'tier', tier, 'used', used + 1, 'limit', lim,
    'resetsAt', coalesce(oldest, now()) + make_interval(days => win));
end;
$$;

-- A failed analysis is refunded by deleting its row within seconds (refundRead / refundLevel); a gifted use
-- goes back to the balance then. The 35-day cleanup and account deletion are far outside the window.
create or replace function public.bobby_return_bonus_read()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.identity_id is not null and old.created_at > now() - interval '15 minutes' then
    update bobby_usage_bonus set reads = least(reads + 1, 100000), updated_at = now() where identity_id = old.identity_id;
  end if;
  return old;
end;
$$;

create or replace function public.bobby_return_bonus_level()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if old.identity_id is not null and old.created_at > now() - interval '15 minutes' then
    if old.level = 'profundo' then
      update bobby_usage_bonus set profundo = least(profundo + 1, 100000), updated_at = now() where identity_id = old.identity_id;
    else
      update bobby_usage_bonus set maximo = least(maximo + 1, 100000), updated_at = now() where identity_id = old.identity_id;
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists bobby_reads_return_bonus on public.bobby_reads;
create trigger bobby_reads_return_bonus after delete on public.bobby_reads
  for each row when (old.bonus) execute function public.bobby_return_bonus_read();
drop trigger if exists bobby_level_uses_return_bonus on public.bobby_level_uses;
create trigger bobby_level_uses_return_bonus after delete on public.bobby_level_uses
  for each row when (old.bonus) execute function public.bobby_return_bonus_level();

revoke all on function public.bobby_redeem_coupon(uuid, text) from public, anon, authenticated;
revoke all on function public.bobby_consume_read(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.bobby_read_access(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.bobby_level_state(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.bobby_consume_level(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.bobby_return_bonus_read() from public, anon, authenticated;
revoke all on function public.bobby_return_bonus_level() from public, anon, authenticated;
grant execute on function public.bobby_redeem_coupon(uuid, text) to service_role;
grant execute on function public.bobby_consume_read(uuid, text, text, text, text, boolean) to service_role;
grant execute on function public.bobby_read_access(uuid, text, boolean) to service_role;
grant execute on function public.bobby_level_state(uuid, text, jsonb) to service_role;
grant execute on function public.bobby_consume_level(uuid, text, text, text, jsonb) to service_role;
