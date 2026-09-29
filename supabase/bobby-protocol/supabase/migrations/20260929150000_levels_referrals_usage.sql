-- Analysis levels, referrals and LLM usage (2026-09-29, docs/ai/2026-09-29-bobby-intelligence-brief.md §4b).
--   · bobby_level_uses: one row per premium read (Profundo / Máximo), by account or, without one, by device.
--     The allowances are passed in by the API (api/_lib/desk-levels.ts is the single source); these
--     functions only count atomically. Rápido stays on the read meter (bobby_consume_read).
--   · bobby_referral_codes / bobby_referrals / bobby_pro_grants: invite a friend. Each friend who creates
--     a new Apple/Google account through the link gives the inviter N days of Bobby Pro, at most M friends.
--     bobby_is_pro() now also honours an unexpired grant, so every existing meter sees the Pro tier.
--   · bobby_llm_usage: tokens, cost and latency per model call, reconciled against the provider consoles.
-- Every table is service-only. Supabase's default privileges hand ALL on new relations to anon and
-- authenticated, and `revoke ... from public` does not remove them (20260928210000), so both roles are
-- revoked by name.

create table if not exists public.bobby_level_uses (
  id bigserial primary key,
  identity_id uuid references public.bobby_identities(id) on delete cascade,
  device_hash text,
  level text not null check (level in ('profundo', 'maximo')),
  symbol text,
  created_at timestamptz not null default now(),
  check (identity_id is not null or device_hash is not null)
);
create index if not exists bobby_level_uses_identity_idx on public.bobby_level_uses (identity_id, level, created_at desc) where identity_id is not null;
create index if not exists bobby_level_uses_device_idx on public.bobby_level_uses (device_hash, level, created_at desc) where identity_id is null;

create table if not exists public.bobby_referral_codes (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.bobby_referrals (
  id bigserial primary key,
  inviter_id uuid not null references public.bobby_identities(id) on delete cascade,
  invitee_id uuid not null unique references public.bobby_identities(id) on delete cascade,
  reward_days int not null check (reward_days between 0 and 366),
  created_at timestamptz not null default now(),
  check (inviter_id <> invitee_id)
);
create index if not exists bobby_referrals_inviter_idx on public.bobby_referrals (inviter_id, created_at);

create table if not exists public.bobby_pro_grants (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  pro_until timestamptz not null,
  source text not null default 'referral' check (source in ('referral')),
  updated_at timestamptz not null default now()
);

create table if not exists public.bobby_llm_usage (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  surface text not null,
  level text,
  role text,
  provider text not null,
  model text not null,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  tokens_cached int not null default 0,
  tokens_reasoning int not null default 0,
  usd numeric(12, 6) not null default 0,
  latency_ms int,
  stop text,
  ok boolean not null default true
);
create index if not exists bobby_llm_usage_created_idx on public.bobby_llm_usage (created_at desc);

alter table public.bobby_level_uses enable row level security;
alter table public.bobby_referral_codes enable row level security;
alter table public.bobby_referrals enable row level security;
alter table public.bobby_pro_grants enable row level security;
alter table public.bobby_llm_usage enable row level security;
revoke all on public.bobby_level_uses, public.bobby_referral_codes, public.bobby_referrals, public.bobby_pro_grants, public.bobby_llm_usage
  from public, anon, authenticated;
grant all on public.bobby_level_uses, public.bobby_referral_codes, public.bobby_referrals, public.bobby_pro_grants, public.bobby_llm_usage
  to service_role;
revoke all on sequence public.bobby_level_uses_id_seq, public.bobby_referrals_id_seq, public.bobby_llm_usage_id_seq from public, anon, authenticated;
grant usage, select on sequence public.bobby_level_uses_id_seq, public.bobby_referrals_id_seq, public.bobby_llm_usage_id_seq to service_role;

-- Pro: a live subscription (Stripe / Apple) or an unexpired referral grant.
create or replace function public.bobby_is_pro(p_identity uuid)
returns boolean language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from bobby_subscriptions s
    where s.identity_id = p_identity
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  ) or exists (
    select 1 from bobby_pro_grants g where g.identity_id = p_identity and g.pro_until > now()
  );
$$;

-- p_limits: {"anon":{"profundo":[uses, windowDays],"maximo":[…]},"free":{…},"pro":{…}}
create or replace function public.bobby_level_tier(p_identity uuid)
returns text language sql stable security invoker set search_path = public, pg_temp as $$
  select case when p_identity is null then 'anon' when bobby_is_pro(p_identity) then 'pro' else 'free' end;
$$;

-- The premium-level meters without consuming anything (GET /api/bobby-access).
create or replace function public.bobby_level_state(p_identity uuid, p_device text, p_limits jsonb)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare tier text := bobby_level_tier(p_identity); lv text; lim int; win int; used int; oldest timestamptz; levels jsonb := '{}'::jsonb;
begin
  foreach lv in array array['profundo', 'maximo'] loop
    lim := greatest(coalesce((p_limits -> tier -> lv ->> 0)::int, 0), 0);
    win := greatest(coalesce((p_limits -> tier -> lv ->> 1)::int, 7), 1);
    used := 0; oldest := null;
    if p_identity is not null then
      select count(*), min(created_at) into used, oldest from bobby_level_uses
        where identity_id = p_identity and level = lv and created_at > now() - make_interval(days => win);
    elsif p_device is not null then
      select count(*), min(created_at) into used, oldest from bobby_level_uses
        where identity_id is null and device_hash = p_device and level = lv and created_at > now() - make_interval(days => win);
    end if;
    levels := levels || jsonb_build_object(lv, jsonb_build_object('used', used, 'limit', lim, 'remaining', greatest(lim - used, 0),
      'windowDays', win, 'resetsAt', case when used > 0 then oldest + make_interval(days => win) else null end));
  end loop;
  return jsonb_build_object('tier', tier, 'levels', levels);
end;
$$;

-- Check and record one premium read atomically. code: signin_required (no account) | upgrade_required
-- (free account out of this level) | level_exhausted (Pro out of this level) | null when allowed.
create or replace function public.bobby_consume_level(p_identity uuid, p_device text, p_level text, p_symbol text, p_limits jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare tier text; lim int; win int; used int; oldest timestamptz; uid bigint;
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
      where identity_id = p_identity and level = p_level and created_at > now() - make_interval(days => win);
  else
    select count(*), min(created_at) into used, oldest from bobby_level_uses
      where identity_id is null and device_hash = p_device and level = p_level and created_at > now() - make_interval(days => win);
  end if;
  if used >= lim then
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

-- A friend accepts an invitation. Counts only for a new Apple/Google account (created within
-- p_new_account_days), once per friend ever, never for oneself or a two-way swap, and at most p_max
-- friends per inviter. Each accepted friend extends the inviter's Pro by p_reward_days (stacked).
create or replace function public.bobby_referral_claim(p_invitee uuid, p_code text, p_reward_days int, p_max int, p_new_account_days int)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare inviter uuid; invitee_created timestamptz; invitee_auth uuid; accepted int; until timestamptz;
begin
  if p_invitee is null or p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{8}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_code');
  end if;
  select identity_id into inviter from bobby_referral_codes where code = p_code;
  if inviter is null then return jsonb_build_object('ok', false, 'code', 'invalid_code'); end if;
  if inviter = p_invitee then return jsonb_build_object('ok', false, 'code', 'self'); end if;
  select created_at, auth_user_id into invitee_created, invitee_auth from bobby_identities where id = p_invitee;
  if invitee_created is null then return jsonb_build_object('ok', false, 'code', 'invalid_invitee'); end if;
  if invitee_auth is null then return jsonb_build_object('ok', false, 'code', 'account_required'); end if;
  if invitee_created < now() - make_interval(days => greatest(p_new_account_days, 1)) then
    return jsonb_build_object('ok', false, 'code', 'not_new');
  end if;
  if exists (select 1 from bobby_referrals where invitee_id = p_invitee) then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end if;
  if exists (select 1 from bobby_referrals where inviter_id = p_invitee and invitee_id = inviter) then
    return jsonb_build_object('ok', false, 'code', 'self');
  end if;
  perform pg_advisory_xact_lock(hashtext('bobby_referral:' || inviter::text));
  select count(*) into accepted from bobby_referrals where inviter_id = inviter;
  if accepted >= greatest(p_max, 0) then return jsonb_build_object('ok', false, 'code', 'inviter_full'); end if;
  begin
    insert into bobby_referrals(inviter_id, invitee_id, reward_days) values (inviter, p_invitee, p_reward_days);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'already_claimed');
  end;
  if p_reward_days > 0 then
    insert into bobby_pro_grants(identity_id, pro_until, source) values (inviter, now() + make_interval(days => p_reward_days), 'referral')
      on conflict (identity_id) do update
        set pro_until = greatest(bobby_pro_grants.pro_until, now()) + make_interval(days => p_reward_days), updated_at = now()
      returning pro_until into until;
  end if;
  return jsonb_build_object('ok', true, 'code', 'claimed', 'inviterAccepted', accepted + 1);
end;
$$;

revoke all on function public.bobby_is_pro(uuid) from public, anon, authenticated;
revoke all on function public.bobby_level_tier(uuid) from public, anon, authenticated;
revoke all on function public.bobby_level_state(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.bobby_consume_level(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.bobby_referral_claim(uuid, text, int, int, int) from public, anon, authenticated;
grant execute on function public.bobby_is_pro(uuid) to service_role;
grant execute on function public.bobby_level_tier(uuid) to service_role;
grant execute on function public.bobby_level_state(uuid, text, jsonb) to service_role;
grant execute on function public.bobby_consume_level(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.bobby_referral_claim(uuid, text, int, int, int) to service_role;
