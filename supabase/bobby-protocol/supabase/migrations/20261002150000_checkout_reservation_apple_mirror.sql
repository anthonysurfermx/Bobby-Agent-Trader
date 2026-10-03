-- Keep one durable Checkout attempt per account. The row and RPC lock make two
-- concurrent requests share the same Stripe idempotency key and exact form.
create table if not exists public.bobby_checkout_attempts (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  attempt_id uuid not null default gen_random_uuid(),
  customer_id text not null,
  price_id text not null,
  origin text not null,
  expires_at timestamptz not null,
  retry_after timestamptz not null,
  checkout_url text,
  checkout_session_id text,
  updated_at timestamptz not null default now()
);
alter table public.bobby_checkout_attempts add column if not exists checkout_session_id text;
alter table public.bobby_checkout_attempts enable row level security;
revoke all on public.bobby_checkout_attempts from public, anon, authenticated;
grant all on public.bobby_checkout_attempts to service_role;

create table if not exists public.bobby_checkout_deletion_blocks (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  blocked_until timestamptz not null
);
alter table public.bobby_checkout_deletion_blocks enable row level security;
revoke all on public.bobby_checkout_deletion_blocks from public, anon, authenticated;
grant all on public.bobby_checkout_deletion_blocks to service_role;

create or replace function public.bobby_checkout_claim(p_identity uuid, p_customer text, p_price text, p_origin text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare a public.bobby_checkout_attempts%rowtype; owner_id uuid;
begin
  if p_identity is null or p_customer !~ '^cus_[A-Za-z0-9]+$'
     or p_price !~ '^price_[A-Za-z0-9]+$'
     or p_origin !~ '^https://([a-z0-9-]+\.)*(bobbyprotocol\.xyz|vercel\.app)$'
        and p_origin !~ '^http://localhost:[0-9]{2,5}$' then
    raise exception 'invalid checkout claim';
  end if;
  -- Account deletion takes the same identity lock before expiring sessions.
  -- A claim cannot slip in between its Stripe snapshot and identity removal.
  select id into owner_id from public.bobby_identities where id = p_identity for update;
  if owner_id is null then raise exception 'checkout owner missing'; end if;
  if exists (select 1 from public.bobby_checkout_deletion_blocks
      where identity_id = p_identity and blocked_until > now()) then
    return jsonb_build_object('state', 'deleting');
  end if;
  -- Recheck local ownership under the checkout lock. Stripe's subscription
  -- and open-session preflight remains the external source of truth.
  insert into public.bobby_checkout_attempts(identity_id, customer_id, price_id, origin, expires_at, retry_after)
    -- Checkout requires at least 30 minutes to expire. The extra five minutes
    -- allow idempotent retries with the exact saved form after a timeout.
    values (p_identity, p_customer, p_price, p_origin, now() + interval '35 minutes', now() + interval '12 seconds')
    on conflict (identity_id) do nothing returning * into a;
  if found then
    if exists (select 1 from public.bobby_subscriptions s where s.identity_id = p_identity
      and ((s.provider = 'apple' and s.status in ('active', 'trialing')
              and (s.current_period_end is null or s.current_period_end > now()))
        or (s.stripe_subscription_id is not null and s.status not in ('canceled', 'incomplete_expired'))
        or (s.apple_status in ('active', 'trialing')
              and (s.apple_current_period_end is null or s.apple_current_period_end > now())))) then
      delete from public.bobby_checkout_attempts where identity_id = p_identity;
      return jsonb_build_object('state', 'blocked');
    end if;
    return jsonb_build_object('state', 'create', 'attemptId', a.attempt_id, 'customer', a.customer_id,
      'price', a.price_id, 'origin', a.origin, 'expiresAt', floor(extract(epoch from a.expires_at))::bigint);
  end if;
  select * into a from public.bobby_checkout_attempts where identity_id = p_identity for update;
  if not found then raise exception 'checkout claim missing'; end if;
  if exists (select 1 from public.bobby_subscriptions s where s.identity_id = p_identity
      and ((s.provider = 'apple' and s.status in ('active', 'trialing')
              and (s.current_period_end is null or s.current_period_end > now()))
        or (s.stripe_subscription_id is not null and s.status not in ('canceled', 'incomplete_expired'))
        or (s.apple_status in ('active', 'trialing')
              and (s.apple_current_period_end is null or s.apple_current_period_end > now())))) then
    return jsonb_build_object('state', 'blocked');
  end if;
  if now() >= a.expires_at + interval '1 minute' then
    -- Deliberately wait up to 36 minutes before a new key: an earlier Stripe
    -- create may have succeeded even when its response never reached Bobby.
    update public.bobby_checkout_attempts set attempt_id = gen_random_uuid(), customer_id = p_customer,
      price_id = p_price, origin = p_origin, expires_at = now() + interval '35 minutes',
      retry_after = now() + interval '12 seconds', checkout_url = null, checkout_session_id = null, updated_at = now()
      where identity_id = p_identity returning * into a;
    return jsonb_build_object('state', 'create', 'attemptId', a.attempt_id, 'customer', a.customer_id,
      'price', a.price_id, 'origin', a.origin, 'expiresAt', floor(extract(epoch from a.expires_at))::bigint);
  end if;
  if a.checkout_url is not null and now() < a.expires_at then
    return jsonb_build_object('state', 'ready', 'url', a.checkout_url, 'sessionId', a.checkout_session_id,
      'expiresAt', floor(extract(epoch from a.expires_at))::bigint);
  end if;
  if a.checkout_url is null and now() >= a.retry_after and now() < a.expires_at then
    update public.bobby_checkout_attempts set retry_after = now() + interval '12 seconds', updated_at = now()
      where identity_id = p_identity;
    return jsonb_build_object('state', 'create', 'attemptId', a.attempt_id, 'customer', a.customer_id,
      'price', a.price_id, 'origin', a.origin, 'expiresAt', floor(extract(epoch from a.expires_at))::bigint);
  end if;
  return jsonb_build_object('state', 'pending');
end;
$$;

create or replace function public.bobby_checkout_complete(p_identity uuid, p_attempt uuid, p_url text, p_session text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare saved_url text; owner_id uuid;
begin
  if (p_url !~ '^https://checkout\.stripe\.com/' and p_url !~ '^https://checkout\.stripe\.test/')
     or p_session !~ '^cs_[A-Za-z0-9_]+$' then
    raise exception 'invalid checkout URL';
  end if;
  select id into owner_id from public.bobby_identities where id = p_identity for update;
  if owner_id is null or exists (select 1 from public.bobby_checkout_deletion_blocks
      where identity_id = p_identity and blocked_until > now()) then return false; end if;
  update public.bobby_checkout_attempts set checkout_url = p_url, checkout_session_id = p_session, updated_at = now()
    where identity_id = p_identity and attempt_id = p_attempt
      and (checkout_url is null or checkout_url = p_url)
      and (checkout_session_id is null or checkout_session_id = p_session)
      and now() < expires_at
    returning checkout_url into saved_url;
  return coalesce(saved_url = p_url, false);
end;
$$;

create or replace function public.bobby_checkout_block_for_deletion(p_identity uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare owner_id uuid; a public.bobby_checkout_attempts%rowtype;
begin
  select id into owner_id from public.bobby_identities where id = p_identity for update;
  if owner_id is null then raise exception 'checkout owner missing'; end if;
  insert into public.bobby_checkout_deletion_blocks(identity_id, blocked_until)
    values (p_identity, now() + interval '5 minutes')
    on conflict (identity_id) do update set blocked_until = excluded.blocked_until;
  select * into a from public.bobby_checkout_attempts where identity_id = p_identity;
  return jsonb_build_object('customer', a.customer_id, 'sessionId', a.checkout_session_id);
end;
$$;
revoke all on function public.bobby_checkout_claim(uuid, text, text, text),
  public.bobby_checkout_complete(uuid, uuid, text, text),
  public.bobby_checkout_block_for_deletion(uuid) from public, anon, authenticated;
grant execute on function public.bobby_checkout_claim(uuid, text, text, text),
  public.bobby_checkout_complete(uuid, uuid, text, text),
  public.bobby_checkout_block_for_deletion(uuid) to service_role;

-- A Stripe subscription and an Apple entitlement may both be live. Preserve
-- the card references while the Apple mirror grants access independently.
alter table public.bobby_subscriptions
  add column if not exists apple_status text,
  add column if not exists apple_current_period_end timestamptz,
  add column if not exists apple_product_id text,
  add column if not exists apple_environment text check (apple_environment in ('production', 'sandbox')),
  add column if not exists apple_period_type text check (apple_period_type in ('normal', 'trial', 'intro', 'prepaid'));

-- Older syncs could leave an Apple primary with a retained Stripe id. Keep both
-- providers, with the card status conservatively requiring Stripe recheck.
update public.bobby_subscriptions set
  apple_status = status, apple_current_period_end = current_period_end,
  apple_product_id = product_id, apple_environment = environment,
  apple_period_type = period_type, provider = 'stripe', status = 'incomplete',
  product_id = null, current_period_end = null
  where provider = 'apple' and stripe_subscription_id is not null;

create or replace function public.bobby_preserve_subscription_owners()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare apple_state text; apple_end timestamptz; apple_product text; apple_env text; apple_period text;
begin
  if old.provider = 'apple' and old.stripe_subscription_id is null and new.provider = 'stripe' then
    new.apple_status := old.status;
    new.apple_current_period_end := old.current_period_end;
    new.apple_product_id := old.product_id;
    new.apple_environment := old.environment;
    new.apple_period_type := old.period_type;
  elsif old.stripe_subscription_id is not null and new.provider = 'apple' then
    apple_state := new.status; apple_end := new.current_period_end;
    apple_product := new.product_id; apple_env := new.environment; apple_period := new.period_type;
    new.provider := 'stripe'; new.status := old.status; new.current_period_end := old.current_period_end;
    new.product_id := old.product_id; new.environment := old.environment; new.period_type := old.period_type;
    new.stripe_customer_id := old.stripe_customer_id; new.stripe_subscription_id := old.stripe_subscription_id;
    new.apple_status := apple_state; new.apple_current_period_end := apple_end;
    new.apple_product_id := apple_product; new.apple_environment := apple_env; new.apple_period_type := apple_period;
  elsif new.provider = 'apple' and new.stripe_subscription_id is null then
    new.apple_status := null; new.apple_current_period_end := null;
    new.apple_product_id := null; new.apple_environment := null; new.apple_period_type := null;
  end if;
  return new;
end;
$$;
drop trigger if exists bobby_preserve_subscription_owners on public.bobby_subscriptions;
create trigger bobby_preserve_subscription_owners before update on public.bobby_subscriptions
  for each row execute function public.bobby_preserve_subscription_owners();
revoke all on function public.bobby_preserve_subscription_owners() from public, anon, authenticated;

create or replace function public.bobby_is_pro(p_identity uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from bobby_subscriptions s
    where s.identity_id = p_identity
      and ((s.status in ('active', 'trialing')
              and (s.current_period_end is null or s.current_period_end > now()))
        or (s.apple_status in ('active', 'trialing')
              and (s.apple_current_period_end is null or s.apple_current_period_end > now())))
  ) or exists (
    select 1 from bobby_pro_grants g where g.identity_id = p_identity and g.pro_until > now()
  );
$$;
