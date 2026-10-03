-- Durable shared Google/Stripe external-charge gate. Does not enable providers or alter Apple initiation.
begin;
-- This extension composes with the actually deployed 13e Checkout/deletion and Apple sidecar schema.
do $$ begin
 if to_regclass('public.bobby_checkout_deletion_blocks') is null or
    to_regprocedure('public.bobby_checkout_block_for_deletion(uuid)') is null then
  raise exception 'Canonical Checkout/deletion migration is required before shared reservations';
 end if;
end $$;
create table if not exists public.bobby_purchase_gate (id boolean primary key default true check(id), activated boolean not null default false);
insert into public.bobby_purchase_gate(id) values(true) on conflict do nothing;
alter table public.bobby_purchase_gate enable row level security;
revoke all on public.bobby_purchase_gate from public,anon,authenticated;
grant select,update on public.bobby_purchase_gate to service_role;

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
  -- A server running the previous route cannot bypass the sticky participating protocol.
  -- Before activation, the canonical retry/key/form behavior remains unchanged.
  if exists (select 1 from public.bobby_purchase_gate where id and activated) then
    return jsonb_build_object('state', 'pending');
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
  -- A legacy provider create may return after the participating protocol was activated.
  -- Denial makes the canonical old handler expire/reconcile that session instead of exposing it.
  if exists (select 1 from public.bobby_purchase_gate where id and activated) then return false; end if;
  update public.bobby_checkout_attempts set checkout_url = p_url, checkout_session_id = p_session, updated_at = now()
    where identity_id = p_identity and attempt_id = p_attempt
      and (checkout_url is null or checkout_url = p_url)
      and (checkout_session_id is null or checkout_session_id = p_session)
      and now() < expires_at
    returning checkout_url into saved_url;
  return coalesce(saved_url = p_url, false);
end;
$$;

create table if not exists public.bobby_purchase_attempts (
 id uuid primary key default gen_random_uuid(),
 identity_id uuid references public.bobby_identities(id) on delete set null,
 owner_key text not null check(owner_key ~ '^[0-9a-f]{64}$'),
 operation_id uuid not null,
 provider text not null check(provider in ('google','stripe')),
 origin text not null default 'reserved' check(origin in ('reserved','adopted')),
 product_id text not null check(length(product_id) between 1 and 120),
 base_plan_id text check(base_plan_id is null or base_plan_id ~ '^[A-Za-z0-9._-]{1,120}$'),
 offer_id text check(offer_id is null or offer_id ~ '^[A-Za-z0-9._-]{1,120}$'),
 google_account_id text check(google_account_id is null or google_account_id ~ '^[A-Za-z0-9+/]{43}=$'),
 phase text not null default 'reserved' check(phase in ('reserved','external_started','pending','needs_reconciliation','confirmed','terminal_no_charge','closed')),
 revision bigint not null default 1,
 dispatch_operation uuid,
 dispatch_at timestamptz,
 dispatch_lease_until timestamptz,
 dispatch_payload jsonb,
 provider_reference text check(provider_reference is null or length(provider_reference) between 3 and 200),
 candidate_ciphertext text check(candidate_ciphertext is null or length(candidate_ciphertext) between 16 and 8192),
 token_fingerprint text check(token_fingerprint is null or token_fingerprint ~ '^[0-9a-f]{64}$'),
 token_ciphertext text check(token_ciphertext is null or length(token_ciphertext) between 16 and 8192),
 provider_state text check(provider_state is null or length(provider_state) between 1 and 80),
 evidence_sha256 text check(evidence_sha256 is null or evidence_sha256 ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz,
 resolution_reference text check(resolution_reference is null or length(resolution_reference) between 3 and 200),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(owner_key,operation_id),
 check((provider='google' and base_plan_id is not null and google_account_id is not null) or (provider='stripe' and base_plan_id is null and offer_id is null and google_account_id is null)),
 check((token_fingerprint is null)=(token_ciphertext is null) or phase in ('closed','terminal_no_charge') and token_fingerprint is not null and token_ciphertext is null)
);
-- confirmed is an obligation, not paid proof or permission for a second provider. It remains open during
-- grace/on-hold/paused states, even when the current entitlement period is in the past.
create unique index if not exists bobby_purchase_attempts_open_owner on public.bobby_purchase_attempts(owner_key)
 where phase not in ('terminal_no_charge','closed');
create unique index if not exists bobby_purchase_attempts_provider_ref on public.bobby_purchase_attempts(provider,provider_reference) where provider_reference is not null;
create unique index if not exists bobby_purchase_attempts_google_token on public.bobby_purchase_attempts(token_fingerprint) where token_fingerprint is not null;
create index if not exists bobby_purchase_attempts_identity on public.bobby_purchase_attempts(identity_id);
alter table public.bobby_purchase_attempts enable row level security;
revoke all on public.bobby_purchase_attempts from public,anon,authenticated;
grant select,insert,update on public.bobby_purchase_attempts to service_role;

-- The stable private key survives deletion of the product identity, preserving an unresolved financial
-- obligation and preventing ownership of the same token from being forgotten. No auth UUID is stored here.
create or replace function public.bobby_purchase_owner_key(p_identity uuid)
returns text language sql stable security invoker set search_path=public,pg_temp as $$
 select encode(pg_catalog.sha256(convert_to('bobby-purchase-owner:' || coalesce(auth_user_id::text,id::text),'UTF8')),'hex') from bobby_identities where id=p_identity;
$$;
create or replace function public.bobby_purchase_capability()
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$ select jsonb_build_object('version',1,'activated',activated) from bobby_purchase_gate where id; $$;
create or replace function public.bobby_purchase_attempt_get(p_identity uuid,p_attempt uuid default null)
returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare k text; a bobby_purchase_attempts; begin
 k:=bobby_purchase_owner_key(p_identity); if k is null then return jsonb_build_object('code','account_missing'); end if;
 select * into a from bobby_purchase_attempts where owner_key=k and (p_attempt is null and phase not in ('terminal_no_charge','closed') or id=p_attempt) order by created_at desc limit 1;
 return jsonb_build_object('attempt',case when found then to_jsonb(a) else null end);
end; $$;
create or replace function public.bobby_purchase_acquire(p_identity uuid,p_operation uuid,p_provider text,p_product text,p_base_plan text,p_offer text,p_google_account text)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare k text; a bobby_purchase_attempts; s bobby_subscriptions; begin
 if p_identity is null or p_operation is null or p_provider not in ('google','stripe') or p_provider is null
   or p_product is null or length(p_product) not between 1 and 120 then raise exception 'invalid_purchase_request' using errcode='22023'; end if;
 -- Same parent lock as the subscription provider guard, including first membership inserts.
 perform 1 from bobby_identities where id=p_identity for update;
 if not found then return jsonb_build_object('code','account_missing'); end if;
 if exists(select 1 from bobby_checkout_deletion_blocks where identity_id=p_identity and blocked_until>now()) then return jsonb_build_object('code','account_deleting'); end if;
 k:=bobby_purchase_owner_key(p_identity);
 -- Once participating initiation is allowed, disabling sales never disables outstanding-obligation checks.
 update bobby_purchase_gate set activated=true where id and not activated;
 select * into a from bobby_purchase_attempts where owner_key=k and operation_id=p_operation;
 if found then
   if a.provider<>p_provider or a.product_id<>p_product or a.base_plan_id is distinct from p_base_plan or a.offer_id is distinct from p_offer or a.google_account_id is distinct from p_google_account then return jsonb_build_object('code','operation_mismatch'); end if;
   return jsonb_build_object('state','replay','attempt',to_jsonb(a));
 end if;
 select * into a from bobby_purchase_attempts where owner_key=k and phase not in ('terminal_no_charge','closed') for update;
 if found then return jsonb_build_object('code','purchase_pending','attempt',to_jsonb(a)); end if;
 select * into s from bobby_subscriptions where identity_id=p_identity;
 if found and ((s.status in ('active','trialing') and (s.current_period_end is null or s.current_period_end>now()))
   or (s.provider='stripe' and s.stripe_subscription_id is not null and s.status not in ('canceled','incomplete_expired'))
   or (s.apple_status in ('active','trialing') and (s.apple_current_period_end is null or s.apple_current_period_end>now()))) then return jsonb_build_object('code','already_subscribed'); end if;
 -- Any legacy claim can represent an in-flight create or an already delivered payable URL.
 -- Expiry/TTL, an empty lookup and operator flags are not authoritative no-charge proof.
 if exists(select 1 from bobby_checkout_attempts where identity_id=p_identity) then return jsonb_build_object('code','purchase_legacy_reconciliation_required'); end if;
 insert into bobby_purchase_attempts(identity_id,owner_key,operation_id,provider,product_id,base_plan_id,offer_id,google_account_id)
 values(p_identity,k,p_operation,p_provider,p_product,p_base_plan,p_offer,p_google_account) returning * into a;
 return jsonb_build_object('state','new','attempt',to_jsonb(a));
end; $$;

-- A provider-verified existing Google obligation can be restored without creating a new charge.
create or replace function public.bobby_purchase_adopt_google(p_identity uuid,p_product text,p_base_plan text,p_offer text,p_google_account text,
 p_reference text,p_fingerprint text,p_ciphertext text,p_state text,p_phase text,p_evidence text)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare k text; a bobby_purchase_attempts; begin
 perform 1 from bobby_identities where id=p_identity for update;
 if not found then return jsonb_build_object('code','account_missing'); end if;
 k:=bobby_purchase_owner_key(p_identity);
 select * into a from bobby_purchase_attempts where token_fingerprint=p_fingerprint for update;
 if found then
  if a.owner_key<>k then return jsonb_build_object('code','token_owner_conflict'); end if;
  return jsonb_build_object('attempt',to_jsonb(a));
 end if;
 select * into a from bobby_purchase_attempts where owner_key=k and phase not in ('terminal_no_charge','closed') for update;
 if found then return jsonb_build_object('code','purchase_pending','attempt',to_jsonb(a)); end if;
 if p_phase not in ('pending','confirmed') or p_phase is null or p_evidence is null or p_evidence !~ '^[0-9a-f]{64}$'
   or p_reference is null or p_fingerprint is null or p_ciphertext is null then raise exception 'invalid_google_adoption' using errcode='22023'; end if;
 update bobby_purchase_gate set activated=true where id and not activated;
 insert into bobby_purchase_attempts(identity_id,owner_key,operation_id,provider,product_id,base_plan_id,offer_id,google_account_id,
   phase,provider_reference,token_fingerprint,token_ciphertext,provider_state,evidence_sha256,verified_at,origin)
 values(p_identity,k,gen_random_uuid(),'google',p_product,p_base_plan,p_offer,p_google_account,p_phase,p_reference,p_fingerprint,p_ciphertext,p_state,p_evidence,now(),'adopted') returning * into a;
 return jsonb_build_object('attempt',to_jsonb(a));
end; $$;

-- A dispatch lease can recover the SAME Stripe idempotent request within a strict 23h window. It never
-- expires the owner obligation. Google receives exactly one launch permit; lost replies cannot relaunch.
create or replace function public.bobby_purchase_dispatch(p_identity uuid,p_attempt uuid,p_operation uuid,p_payload jsonb default null)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare k text; a bobby_purchase_attempts; begin
 perform 1 from bobby_identities where id=p_identity for update;
 if not found then return jsonb_build_object('code','account_missing'); end if;
 if exists(select 1 from bobby_checkout_deletion_blocks where identity_id=p_identity and blocked_until>now()) then return jsonb_build_object('code','account_deleting'); end if;
 k:=bobby_purchase_owner_key(p_identity);
 select * into a from bobby_purchase_attempts where id=p_attempt and owner_key=k for update;
 if not found or a.identity_id is distinct from p_identity then return jsonb_build_object('code','attempt_missing'); end if;
 if p_operation is null then raise exception 'invalid_dispatch' using errcode='22023'; end if;
 if a.phase='reserved' then
   if a.provider='stripe' and (p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>16384) then raise exception 'invalid_dispatch_payload' using errcode='22023'; end if;
   update bobby_purchase_attempts set phase='external_started',dispatch_operation=p_operation,dispatch_at=now(),
    dispatch_lease_until=case when a.provider='stripe' then now()+interval '30 seconds' else null end,
    dispatch_payload=case when a.provider='stripe' then p_payload else null end,revision=revision+1,updated_at=now() where id=a.id returning * into a;
   return jsonb_build_object('dispatchAllowed',true,'attempt',to_jsonb(a));
 end if;
 if a.provider='stripe' and a.provider_reference is null and a.phase in ('external_started','needs_reconciliation')
   and a.dispatch_at is not null and a.dispatch_at<=now() and now()-a.dispatch_at<interval '23 hours'
   and a.dispatch_payload is not null and a.dispatch_lease_until<=now() then
   update bobby_purchase_attempts set dispatch_operation=p_operation,dispatch_lease_until=now()+interval '30 seconds',revision=revision+1,updated_at=now()
    where id=a.id returning * into a;
   return jsonb_build_object('dispatchAllowed',true,'attempt',to_jsonb(a));
 end if;
 return jsonb_build_object('dispatchAllowed',false,'attempt',to_jsonb(a));
end; $$;

-- Provider observations are service-only, compare revision, owner and immutable references. They never
-- accept a client cancellation flag. Confirming an obligation leaves the unique open-owner lock held.
create or replace function public.bobby_purchase_observe(p_identity uuid,p_owner_key text,p_attempt uuid,p_revision bigint,p_provider text,
 p_reference text,p_token_fingerprint text,p_token_ciphertext text,p_state text,p_phase text,p_evidence text,p_resolution text default null)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare a bobby_purchase_attempts; begin
 if p_identity is not null then perform 1 from bobby_identities where id=p_identity for update; end if;
 select * into a from bobby_purchase_attempts where id=p_attempt and owner_key=p_owner_key for update;
 if not found or (a.identity_id is not null and a.identity_id is distinct from p_identity) then return jsonb_build_object('code','attempt_missing'); end if;
 if a.revision<>p_revision or a.provider is distinct from p_provider then return jsonb_build_object('code','stale_revision'); end if;
 if a.phase in ('terminal_no_charge','closed') then return jsonb_build_object('attempt',to_jsonb(a)); end if;
 if p_phase not in ('external_started','pending','needs_reconciliation','confirmed','terminal_no_charge','closed') or p_phase is null
   or p_evidence is null or p_evidence !~ '^[0-9a-f]{64}$' or p_state is null or length(p_state) not between 1 and 80 then raise exception 'invalid_provider_observation' using errcode='22023'; end if;
 if a.provider_reference is not null and p_reference is not null and a.provider_reference<>p_reference then return jsonb_build_object('code','reference_conflict'); end if;
 if a.token_fingerprint is not null and p_token_fingerprint is not null and a.token_fingerprint<>p_token_fingerprint then return jsonb_build_object('code','reference_conflict'); end if;
 if p_phase='confirmed' and (coalesce(p_reference,a.provider_reference) is null or a.provider='google' and (coalesce(p_token_fingerprint,a.token_fingerprint) is null or coalesce(p_token_ciphertext,a.token_ciphertext) is null or p_state not in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD'))) then raise exception 'missing_confirmed_reference' using errcode='22023'; end if;
 if p_phase='terminal_no_charge' and not ((a.provider='google' and p_state='SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED') or (a.provider='stripe' and p_state='checkout_expired_no_recovery')) then raise exception 'not_terminal_evidence' using errcode='22023'; end if;
 if p_phase='closed' and not ((a.provider='google' and p_state='SUBSCRIPTION_STATE_EXPIRED') or (a.provider='stripe' and p_state='stripe_subscription_terminal')) then raise exception 'not_closed_evidence' using errcode='22023'; end if;
 if p_phase in ('terminal_no_charge','closed') and coalesce(length(p_resolution),0) not between 3 and 200 then raise exception 'missing_resolution_reference' using errcode='22023'; end if;
 update bobby_purchase_attempts set phase=p_phase,provider_reference=coalesce(p_reference,provider_reference),
  token_fingerprint=coalesce(p_token_fingerprint,token_fingerprint),token_ciphertext=case when p_phase in ('closed','terminal_no_charge') then null else coalesce(p_token_ciphertext,token_ciphertext) end,
  dispatch_payload=case when p_phase in ('closed','terminal_no_charge') then null else dispatch_payload end,
  candidate_ciphertext=case when p_token_fingerprint is not null or p_phase in ('closed','terminal_no_charge') then null else candidate_ciphertext end,
  provider_state=p_state,evidence_sha256=p_evidence,verified_at=now(),resolution_reference=p_resolution,
  revision=revision+1,updated_at=now() where id=a.id returning * into a;
 return jsonb_build_object('attempt',to_jsonb(a));
end; $$;

-- A successful SDK result is persisted before a Publisher request can time out. This candidate is
-- untrusted, has no ownership uniqueness and grants NOTHING until actual Google verification.
create or replace function public.bobby_purchase_receive_token(p_identity uuid,p_attempt uuid,p_revision bigint,p_ciphertext text)
returns jsonb language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare a bobby_purchase_attempts; k text; begin
 perform 1 from bobby_identities where id=p_identity for update;
 if not found then return jsonb_build_object('code','account_missing'); end if;
 k:=bobby_purchase_owner_key(p_identity);
 select * into a from bobby_purchase_attempts where id=p_attempt and owner_key=k for update;
 if not found or a.identity_id is distinct from p_identity or a.provider<>'google' then return jsonb_build_object('code','attempt_missing'); end if;
 if a.revision<>p_revision then return jsonb_build_object('code','stale_revision'); end if;
 if a.phase in ('reserved','terminal_no_charge','closed') then return jsonb_build_object('code','purchase_not_started'); end if;
 if a.token_fingerprint is not null then return jsonb_build_object('attempt',to_jsonb(a)); end if;
 if p_ciphertext is null or length(p_ciphertext) not between 16 and 8192 then raise exception 'invalid_candidate' using errcode='22023'; end if;
 update bobby_purchase_attempts set candidate_ciphertext=p_ciphertext,phase='pending',revision=revision+1,updated_at=now() where id=a.id returning * into a;
 return jsonb_build_object('attempt',to_jsonb(a));
end; $$;
revoke all on function public.bobby_purchase_receive_token(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.bobby_purchase_receive_token(uuid,uuid,bigint,text) to service_role;

create or replace function public.bobby_purchase_reference_get(p_attempt uuid,p_provider text)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('attempt',to_jsonb(a)) from bobby_purchase_attempts a where a.id=p_attempt and a.provider=p_provider;
$$;
revoke all on function public.bobby_purchase_reference_get(uuid,text) from public,anon,authenticated;
grant execute on function public.bobby_purchase_reference_get(uuid,text) to service_role;

revoke all on function public.bobby_purchase_owner_key(uuid),public.bobby_purchase_capability(),public.bobby_purchase_attempt_get(uuid,uuid),
 public.bobby_purchase_adopt_google(uuid,text,text,text,text,text,text,text,text,text,text),
 public.bobby_purchase_acquire(uuid,uuid,text,text,text,text,text),public.bobby_purchase_dispatch(uuid,uuid,uuid,jsonb),
 public.bobby_purchase_observe(uuid,text,uuid,bigint,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bobby_purchase_owner_key(uuid),public.bobby_purchase_capability(),public.bobby_purchase_attempt_get(uuid,uuid),
 public.bobby_purchase_adopt_google(uuid,text,text,text,text,text,text,text,text,text,text),
 public.bobby_purchase_acquire(uuid,uuid,text,text,text,text,text),public.bobby_purchase_dispatch(uuid,uuid,uuid,jsonb),
 public.bobby_purchase_observe(uuid,text,uuid,bigint,text,text,text,text,text,text,text,text) to service_role;
-- Reuse the canonical account/admin deletion fence. Capture both the legacy Checkout row and the
-- unresolved shared Stripe obligation; retain provider receipts through identity deletion.
create or replace function public.bobby_checkout_block_for_deletion(p_identity uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare owner_id uuid; legacy bobby_checkout_attempts; customers jsonb; sessions jsonb; pending_stripe boolean;
begin
 select id into owner_id from bobby_identities where id=p_identity for update;
 if owner_id is null then raise exception 'checkout owner missing'; end if;
 insert into bobby_checkout_deletion_blocks(identity_id,blocked_until) values(p_identity,now()+interval '5 minutes')
   on conflict(identity_id) do update set blocked_until=excluded.blocked_until;
 select * into legacy from bobby_checkout_attempts where identity_id=p_identity;
 select coalesce(jsonb_agg(distinct customer),'[]'::jsonb) into customers from (
  select legacy.customer_id customer where legacy.customer_id is not null
  union select dispatch_payload->>'customer' from bobby_purchase_attempts where identity_id=p_identity and provider='stripe'
   and phase not in ('closed','terminal_no_charge') and dispatch_payload->>'customer' is not null
 ) refs;
 select coalesce(jsonb_agg(distinct session_id),'[]'::jsonb) into sessions from (
  select legacy.checkout_session_id session_id where legacy.checkout_session_id is not null
  union select provider_reference from bobby_purchase_attempts where identity_id=p_identity and provider='stripe'
   and phase not in ('closed','terminal_no_charge') and provider_reference is not null
 ) refs;
 select exists(select 1 from bobby_purchase_attempts where identity_id=p_identity and provider='stripe'
  and phase in ('external_started','pending','needs_reconciliation','confirmed')) into pending_stripe;
 return jsonb_build_object('customer',legacy.customer_id,'sessionId',legacy.checkout_session_id,
   'customers',customers,'sessionIds',sessions,'pendingStripe',pending_stripe);
end $$;
revoke all on function public.bobby_checkout_block_for_deletion(uuid) from public,anon,authenticated;
grant execute on function public.bobby_checkout_block_for_deletion(uuid) to service_role;

-- A service-only caller has verified the KNOWN canonical session against current Stripe state.
-- Retain minimal terminal evidence, then remove only the exact original legacy row under the parent lock.
-- A missing session id cannot be cleared by this RPC. No timed/empty-search/flag-based release exists.
create or replace function public.bobby_purchase_close_legacy_checkout(p_identity uuid,p_legacy_attempt uuid,p_session text,p_evidence text)
returns boolean language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare legacy bobby_checkout_attempts; k text; begin
 perform 1 from bobby_identities where id=p_identity for update;
 if not found then return false; end if;
 select * into legacy from bobby_checkout_attempts where identity_id=p_identity for update;
 if not found or p_legacy_attempt is null or p_session is null or legacy.attempt_id<>p_legacy_attempt or legacy.checkout_session_id is null or legacy.checkout_session_id<>p_session or p_session !~ '^cs_[A-Za-z0-9_]+$' or p_evidence is null or p_evidence !~ '^[0-9a-f]{64}$' then return false; end if;
 k:=bobby_purchase_owner_key(p_identity);
 if exists(select 1 from bobby_purchase_attempts where provider='stripe' and provider_reference=p_session) then return false; end if;
 insert into bobby_purchase_attempts(identity_id,owner_key,operation_id,provider,origin,product_id,phase,provider_reference,provider_state,evidence_sha256,verified_at,resolution_reference)
 values(p_identity,k,legacy.attempt_id,'stripe','adopted',legacy.price_id,'closed',p_session,'legacy_checkout_terminal',p_evidence,now(),'stripe-authoritative:legacy-checkout-terminal');
 delete from bobby_checkout_attempts where identity_id=p_identity and attempt_id=p_legacy_attempt;
 update bobby_purchase_gate set activated=true where id and not activated;
 return true;
end $$;
revoke all on function public.bobby_purchase_close_legacy_checkout(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.bobby_purchase_close_legacy_checkout(uuid,uuid,text,text) to service_role;

-- After retrieving ACTUAL provider state, fence any public Checkout URL against account deletion
-- under the same parent lock. A false/unknown response is not payment/no-charge evidence.
create or replace function public.bobby_purchase_return_allowed(p_identity uuid,p_attempt uuid,p_revision bigint)
returns boolean language plpgsql volatile security invoker set search_path=public,pg_temp as $$
declare a bobby_purchase_attempts; begin
 perform 1 from bobby_identities where id=p_identity for update;
 if not found or exists(select 1 from bobby_checkout_deletion_blocks where identity_id=p_identity and blocked_until>now()) then return false; end if;
 select * into a from bobby_purchase_attempts where id=p_attempt and identity_id=p_identity for update;
 return found and a.provider='stripe' and a.revision=p_revision and a.phase='external_started' and a.provider_reference is not null;
end $$;
revoke all on function public.bobby_purchase_return_allowed(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.bobby_purchase_return_allowed(uuid,uuid,bigint) to service_role;

alter table public.bobby_brief_paid_periods add column if not exists google_token_fingerprint text;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.bobby_brief_paid_periods'::regclass and conname='bobby_brief_paid_google_owner_evidence') then
  alter table public.bobby_brief_paid_periods add constraint bobby_brief_paid_google_owner_evidence
   check(google_token_fingerprint is null or provider='google' and google_token_fingerprint ~ '^[0-9a-f]{64}$');
 end if;
end; $$;
commit;
