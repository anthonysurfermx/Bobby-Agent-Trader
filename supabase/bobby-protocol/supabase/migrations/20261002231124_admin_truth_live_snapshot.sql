-- Reconcile the actual production chain before applying the reviewed R2 changes.
-- These named constraints were verified through pg_constraint on 2026-10-03.
-- Keep existing anon_* columns and indexed helpers for compatibility; no CASCADE or data deletion.
-- Keep the #130 Apple mirror compatible with unknown primary commercial evidence.
-- A production-ordered database already has these columns; old scratch chains need them too.
alter table public.bobby_subscriptions
  add column if not exists apple_status text,
  add column if not exists apple_current_period_end timestamptz,
  add column if not exists apple_product_id text,
  add column if not exists apple_environment text check (apple_environment in ('production', 'sandbox')),
  add column if not exists apple_period_type text check (apple_period_type in ('normal', 'trial', 'intro', 'prepaid'));

create or replace function public.bobby_preserve_subscription_owners()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare apple_state text; apple_end timestamptz; apple_product text; apple_env text; apple_period text;
begin
  -- The currently serving #130 code can still send explicit NULL during migration-first rollout.
  -- Normalize primary evidence on INSERT as well as UPDATE before NOT NULL/CHECK validation.
  if tg_op = 'UPDATE' then
  if old.provider = 'apple' and old.stripe_subscription_id is null and new.provider = 'stripe' then
    new.apple_status := old.status; new.apple_current_period_end := old.current_period_end;
    new.apple_product_id := old.product_id;
    new.apple_environment := nullif(old.environment, 'unknown');
    new.apple_period_type := nullif(old.period_type, 'unknown');
  elsif old.stripe_subscription_id is not null and new.provider = 'apple' then
    apple_state := new.status; apple_end := new.current_period_end;
    apple_product := new.product_id; apple_env := nullif(new.environment, 'unknown');
    apple_period := nullif(new.period_type, 'unknown');
    new.provider := 'stripe'; new.status := old.status; new.current_period_end := old.current_period_end;
    new.product_id := old.product_id; new.environment := old.environment; new.period_type := old.period_type;
    new.stripe_customer_id := old.stripe_customer_id; new.stripe_subscription_id := old.stripe_subscription_id;
    new.apple_status := apple_state; new.apple_current_period_end := apple_end;
    new.apple_product_id := apple_product; new.apple_environment := apple_env; new.apple_period_type := apple_period;
  elsif new.provider = 'apple' and new.stripe_subscription_id is null then
    new.apple_status := null; new.apple_current_period_end := null; new.apple_product_id := null;
    new.apple_environment := null; new.apple_period_type := null;
  end if;
  end if;
  new.environment := coalesce(new.environment, 'unknown');
  new.period_type := coalesce(new.period_type, 'unknown');
  return new;
end;
$$;
drop trigger if exists bobby_preserve_subscription_owners on public.bobby_subscriptions;
create trigger bobby_preserve_subscription_owners before insert or update on public.bobby_subscriptions
  for each row execute function public.bobby_preserve_subscription_owners();
revoke all on function public.bobby_preserve_subscription_owners() from public, anon, authenticated;

alter table public.bobby_subscriptions drop constraint if exists bobby_subscriptions_environment_check;
alter table public.bobby_subscriptions drop constraint if exists bobby_subscriptions_period_type_check;
update public.bobby_subscriptions set environment='unknown' where environment is null;
update public.bobby_subscriptions set period_type='unknown' where period_type is null;
alter table public.bobby_subscriptions alter column environment set default 'unknown', alter column environment set not null;
alter table public.bobby_subscriptions alter column period_type set default 'unknown', alter column period_type set not null;
alter table public.bobby_subscriptions add constraint bobby_subscriptions_environment_check check(environment in ('production','sandbox','unknown'));
alter table public.bobby_subscriptions add constraint bobby_subscriptions_period_type_check check(period_type in ('normal','trial','intro','prepaid','unknown'));

-- Admin truth r2 (2026-10-02), from the independent audit of 2026-10-02 (Codex,
-- .ai/reviews/2026-10-02-codex-admin-truth-answer.md; spec .ai/reviews/2026-10-02-admin-truth-r2-spec.md):
--   · F01 Pro access and commercial evidence are two things. bobby_subscriptions keeps the store's environment and
--     period type (written by api/_lib/revenuecat.ts and the Stripe webhook; 'unknown' until a store read says so);
--     bobby_subscription_facts classifies every membership as paid (production + a positive PRODUCTION charge on
--     record), unverified (unknown environment, or no charge on record), test (sandbox or trial) or inactive.
--     Payers, MRR inputs, new payers, payers ever, accounts with a charge in the period, revenue by country and the
--     members totals count verified payers only (bobby_payer_charges: production membership, not a trial, with a
--     verified charge); the production money of any other account is reported apart (unverifiedGrossUsd). Access
--     (bobby_is_pro) is untouched: a tester or an unverified member keeps Pro. Money is strictly environment
--     PRODUCTION; SANDBOX and unknown-environment events are counted apart.
--   · F13 One "new payer": a verified payer's first-ever verified charge falls in the period, in the overview, the
--     economics and the geo view. "Verified payers with a charge in the period" is payingInPeriod.
--   · F05 The team is the transitive closure of every direct seed over the install ↔ account pairings
--     (bobby_team_nodes, one walk from all seeds), behind the unchanged bobby_internal_identity_ids /
--     bobby_internal_device_hashes, so people, reads, outcomes, every bobby_admin_* and the Amplitude export use one
--     rule. bobby_team_closure keeps the provenance (which seed) for the users list. One link can be set aside for
--     the team rule only (bobby_device_accounts.team_ignored, bobby_set_team_link_ignored).
--   · F04 bobby_activity_days keeps the install's guest activity apart (guest_touches, guest_reads): the first
--     account of a shared install inherits only its guest days, never the days another account signed in on it.
--   · F09 People facts v2 add read_30 / last_read_day: a 30-day reader read in the last 30 days.
--   · F02 The desk runs give the last finished and the last unfinished analysis, so "recovered" is an order in time;
--     a run the reader abandoned (a 'left' ledger marker) is counted apart, never as unfinished.
--   · F07 lastTopup = the latest positive top-up; a balance mark (of any amount) never stands for one.
--   · F08 bobby_admin_members(p_internal) leaves the team out unless asked and says how many rows it left out.
--   · F11 read_abandoned (the reader left before the answer) is an outcome of its own, never a failure.
--   · bobby_cache_claim: an atomic claim on api_cache (the digest's per-finding dedup, the plan lock).
--   · bobby_record_event stores a surface / referrer / utm that is not a slug as null instead of losing the visit.
-- Every replaced function keeps its signature and return type, except bobby_admin_members (dropped and recreated
-- with p_internal boolean default false; the deployed call with {} resolves to it). Service role only, as the rest
-- of the dashboard.

-- ---------------------------------------------------------------- schema
alter table public.bobby_subscriptions add column if not exists environment text not null default 'unknown'
  check (environment in ('production', 'sandbox', 'unknown'));
alter table public.bobby_subscriptions add column if not exists period_type text not null default 'unknown'
  check (period_type in ('normal', 'trial', 'intro', 'prepaid', 'unknown'));
-- null = never confirmed by a store read.
alter table public.bobby_subscriptions add column if not exists store_checked_at timestamptz;

alter table public.bobby_activity_days add column if not exists guest_touches int not null default 0 check (guest_touches >= 0);
alter table public.bobby_activity_days add column if not exists guest_reads int not null default 0 check (guest_reads >= 0);

-- The owner set this link aside for the team rule only (people, their dedup and the cohorts still use it).
alter table public.bobby_device_accounts add column if not exists team_ignored boolean not null default false;

-- Keep desk_entered and checkout_opened: the web conversion funnel (20261002160000) added them and the live site
-- records both (api/track.ts, bobby_record_checkout_opened). This list only adds read_abandoned.
alter table public.bobby_events drop constraint if exists bobby_events_event_check;
alter table public.bobby_events add constraint bobby_events_event_check check (event in (
  'visit', 'desk_entered', 'checkout_opened', 'appstore_click', 'signin_start', 'paywall_view', 'purchase_start',
  'read_done', 'read_failed', 'read_abandoned', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked'));

-- Guest activity so far. An install with at most one pairing: its activity is the guest's or that one account's,
-- and giving it to that account is what the dashboard did until now. An install shared by several accounts: only
-- its reads without an account are known to be the guest's (bobby_reads keeps 35 days); its opens stay
-- unattributed. Only rows whose guest columns are still 0 are touched, with the same rule, so re-applying it is
-- harmless (on a one-pairing install the signed days are that account's own days anyway).
update public.bobby_activity_days a set guest_touches = a.touches, guest_reads = a.reads
where a.subject like 'd:%' and a.guest_touches = 0 and a.guest_reads = 0 and (a.touches > 0 or a.reads > 0)
  and (select count(*) from public.bobby_device_accounts l where l.device_hash = substr(a.subject, 3)) <= 1;
update public.bobby_activity_days a set guest_reads = x.n
from (select r.device_hash, (r.created_at at time zone 'utc')::date as day, count(*)::int as n
      from public.bobby_reads r where r.identity_id is null and r.device_hash is not null group by 1, 2) x
where a.subject = 'd:' || x.device_hash and a.day = x.day and a.guest_reads = 0
  and (select count(*) from public.bobby_device_accounts l where l.device_hash = x.device_hash) > 1;

-- ---------------------------------------------------------------- the team (D2)
-- Every account and install reached from a direct seed through the install ↔ account pairings, in both directions
-- and as many times as it takes, except the links set aside (team_ignored). One row per node; exactly one of
-- identity_id / device_hash is set. Every seed starts the same walk, so each node is visited once whatever the number
-- of seeds (a carrier network or many /admin installs in one large component stay linear). p_networks = false leaves
-- the network seeds out: what the networks list uses to tell what only a network ties to the team. UNION drops
-- repeated rows, so a cycle of pairings ends.
create or replace function public.bobby_team_nodes(p_networks boolean default true)
returns table (identity_id uuid, device_hash text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with recursive seeds as (
    select a.identity_id, null::text as device_hash from bobby_admins a
    union select m.identity_id, null from bobby_internal_marks m
    union select b.id, null from bobby_identities b join bobby_admin_settings s on s.key = 'internal_emails'
      where nullif(b.email, '') is not null and s.value ? lower(b.email)
    union select null, dv.device_hash from bobby_devices dv where dv.internal or dv.admin_session
    union select null, dn.device_hash
      from bobby_device_networks dn join bobby_internal_networks n on n.network_hash = dn.network_hash and not n.ignored
      where coalesce(p_networks, true)
  ), walk as (
    select * from seeds
    union
    select x.identity_id, x.device_hash from walk w cross join lateral (
      select l.identity_id, null::text as device_hash from bobby_device_accounts l
        where w.device_hash is not null and l.device_hash = w.device_hash and not l.team_ignored
      union all
      select null::uuid, l.device_hash from bobby_device_accounts l
        where w.identity_id is not null and l.identity_id = w.identity_id and not l.team_ignored) x
  )
  select w.identity_id, w.device_hash from walk w;
$$;

-- The same closure with its provenance, for the people lists only ("why is this account the team's"): one row per
-- (node, seed). seed = why it is the team's (admin, mark, email, install_mark, admin_session, network) and seed_ref
-- names that seed (the account id, or the 10-character prefix of the install or network hash). Its cost grows with
-- the number of seeds in a component, so no figure reads it: the figures read bobby_team_nodes.
create or replace function public.bobby_team_closure(p_networks boolean default true)
returns table (identity_id uuid, device_hash text, seed text, seed_ref text)
language sql stable security invoker set search_path = public, pg_temp as $$
  with recursive seeds as (
    select a.identity_id, null::text as device_hash, 'admin'::text as seed, a.identity_id::text as seed_ref from bobby_admins a
    union select m.identity_id, null, 'mark', m.identity_id::text from bobby_internal_marks m
    union select b.id, null, 'email', b.id::text from bobby_identities b join bobby_admin_settings s on s.key = 'internal_emails'
      where nullif(b.email, '') is not null and s.value ? lower(b.email)
    union select null, dv.device_hash, case when dv.internal then 'install_mark' else 'admin_session' end, left(dv.device_hash, 10)
      from bobby_devices dv where dv.internal or dv.admin_session
    union select null, dn.device_hash, 'network', left(n.network_hash, 10)
      from bobby_device_networks dn join bobby_internal_networks n on n.network_hash = dn.network_hash and not n.ignored
      where coalesce(p_networks, true)
  ), walk as (
    select * from seeds
    union
    select case when w.identity_id is null then l.identity_id end, case when w.identity_id is not null then l.device_hash end, w.seed, w.seed_ref
    from walk w join bobby_device_accounts l on not l.team_ignored and (l.identity_id = w.identity_id or l.device_hash = w.device_hash)
  )
  select w.identity_id, w.device_hash, w.seed, w.seed_ref from walk w;
$$;

-- The team's accounts and installs: the closure's nodes (signatures and return types unchanged; the Amplitude export
-- of 20261002090000 and every bobby_admin_* read them).
create or replace function public.bobby_internal_identity_ids()
returns setof uuid language sql stable security invoker set search_path = public, pg_temp as $$
  select n.identity_id from bobby_team_nodes(true) n where n.identity_id is not null;
$$;

create or replace function public.bobby_internal_device_hashes()
returns setof text language sql stable security invoker set search_path = public, pg_temp as $$
  select n.device_hash from bobby_team_nodes(true) n where n.device_hash is not null;
$$;

-- The owner sets one install ↔ account link aside for the team rule, or brings it back (by the install prefix the
-- lists show and the account id). SQL only for now: docs/admin/2026-10-01-dashboard-truth.md has the recipe.
create or replace function public.bobby_set_team_link_ignored(p_prefix text, p_identity uuid, p_ignored boolean)
returns int language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if p_prefix is null or p_prefix !~ '^[A-Za-z0-9_-]{10}$' or p_identity is null then raise exception 'invalid link'; end if;
  if (select count(*) from bobby_device_accounts where left(device_hash, 10) = p_prefix and identity_id = p_identity) <> 1 then return 0; end if;
  update bobby_device_accounts set team_ignored = coalesce(p_ignored, false) where left(device_hash, 10) = p_prefix and identity_id = p_identity;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------- claims
-- An atomic claim on api_cache: true when the key was free (absent or expired) and is now held until the TTL;
-- false while someone else holds it. Two concurrent claims of a free key: exactly one gets true.
create or replace function public.bobby_cache_claim(p_key text, p_ttl_seconds int, p_payload jsonb default '{}'::jsonb)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare n int;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9:._-]{1,200}$' or p_ttl_seconds is null or p_ttl_seconds not between 1 and 2592000 then
    raise exception 'invalid claim';
  end if;
  insert into api_cache as c (cache_key, payload, expires_at, updated_at)
    values (p_key, coalesce(p_payload, '{}'::jsonb), now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (cache_key) do update set payload = excluded.payload, expires_at = excluded.expires_at, updated_at = now()
    where c.expires_at <= now();
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- ---------------------------------------------------------------- memberships (F01, F13)
-- Verified charges per account: purchase events of environment PRODUCTION with a positive price (a Stripe live
-- invoice.paid is recorded the same way). first_at = the account's first-ever verified charge, country = that
-- charge's store country.
create or replace function public.bobby_first_charges()
returns table (identity_id uuid, first_at timestamptz, last_at timestamptz, country text, charges int, internal boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  with c as (
    select p.identity_id, min(p.event_at) as first_at, max(p.event_at) as last_at,
      (array_agg(p.country order by p.event_at, p.id))[1] as country, count(*)::int as charges
    from bobby_purchase_events p
    where upper(coalesce(p.environment, '')) = 'PRODUCTION' and p.price_usd > 0 and p.identity_id is not null
    group by p.identity_id
  )
  select c.identity_id, c.first_at, c.last_at, c.country, c.charges, coalesce(c.identity_id in (select bobby_internal_identity_ids()), false)
  from c;
$$;

-- Verified payers (D1): the accounts of bobby_first_charges whose membership the store confirmed as production and
-- not a trial, live or not (a payer who later cancelled did pay). A verified charge of an account whose membership is
-- not verified (unknown environment, sandbox, a trial, no membership row) never makes a payer: new payers, payers ever,
-- accounts with a charge in the period and revenue by country read this; that money is reported apart
-- (unverifiedGrossUsd).
create or replace function public.bobby_payer_charges()
returns table (identity_id uuid, first_at timestamptz, last_at timestamptz, country text, charges int, internal boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  select fc.identity_id, fc.first_at, fc.last_at, fc.country, fc.charges, fc.internal
  from bobby_first_charges() fc join bobby_subscriptions s on s.identity_id = fc.identity_id
  where (s.environment = 'production' and s.status <> 'trialing' and s.period_type in ('normal','intro','prepaid'))
     or (s.apple_environment = 'production' and s.apple_status <> 'trialing' and s.apple_period_type in ('normal','intro','prepaid'));
$$;

-- One row per membership with its access (live) and its commercial class, the single definition every figure uses:
--   inactive                 not live
--   test       sandbox       the store says sandbox
--   test       trial         a trial (status trialing or period type trial)
--   paid                     production, and the account has a verified charge (bobby_first_charges)
--   unverified unknown_environment   no store read has said production or sandbox yet
--   unverified unknown_period      production environment but current period type is not confirmed
--   unverified no_charge     production, but no verified charge on record
create or replace function public.bobby_subscription_facts()
returns table (
  identity_id uuid, provider text, status text, product_id text, current_period_end timestamptz, updated_at timestamptz,
  environment text, period_type text, store_checked_at timestamptz, live boolean, commercial text, reason text,
  first_charge_at timestamptz, last_charge_at timestamptz, internal boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  with candidates as (
    select s.*,
      s.status in ('active', 'trialing') and (s.current_period_end is null or s.current_period_end > now()) as primary_live,
      coalesce(s.apple_status in ('active', 'trialing') and (s.apple_current_period_end is null or s.apple_current_period_end > now()), false) as mirror_live
    from bobby_subscriptions s
  ), selected as (
    select s.*, s.mirror_live and (not s.primary_live or
      (s.apple_environment = 'production' and s.apple_status <> 'trialing' and s.apple_period_type in ('normal','intro','prepaid') and
       not (s.environment = 'production' and s.status <> 'trialing' and s.period_type in ('normal','intro','prepaid')))) as use_mirror
    from candidates s
  ), subs as (
    select s.identity_id, case when use_mirror then 'apple' else s.provider end as provider,
      case when use_mirror then s.apple_status else s.status end as status,
      case when use_mirror then s.apple_product_id else s.product_id end as product_id,
      case when use_mirror then s.apple_current_period_end else s.current_period_end end as current_period_end,
      s.updated_at, case when use_mirror then coalesce(s.apple_environment,'unknown') else s.environment end as environment,
      case when use_mirror then coalesce(s.apple_period_type,'unknown') else s.period_type end as period_type,
      s.store_checked_at, s.primary_live or s.mirror_live as live
    from selected s
  ), k as (
    select s.*, fc.first_at, fc.last_at, case
        when not s.live then 'inactive'
        when s.environment = 'sandbox' then 'test'
        when s.status = 'trialing' or s.period_type = 'trial' then 'test'
        when s.environment = 'production' and s.period_type in ('normal','intro','prepaid') and fc.identity_id is not null then 'paid'
        else 'unverified' end as commercial,
      case
        when not s.live then null
        when s.environment = 'sandbox' then 'sandbox'
        when s.status = 'trialing' or s.period_type = 'trial' then 'trial'
        when s.environment = 'production' and s.period_type in ('normal','intro','prepaid') and fc.identity_id is not null then null
        when s.environment = 'unknown' then 'unknown_environment'
        when s.period_type = 'unknown' then 'unknown_period'
        else 'no_charge' end as reason
    from subs s left join bobby_first_charges() fc on fc.identity_id = s.identity_id
  )
  select k.identity_id, k.provider, k.status, k.product_id, k.current_period_end, k.updated_at, k.environment, k.period_type,
    k.store_checked_at, k.live, k.commercial, k.reason, k.first_at, k.last_at,
    coalesce(k.identity_id in (select bobby_internal_identity_ids()), false)
  from k;
$$;

-- Every membership and gifted Pro with its commercial class (20261001210000), the team left out unless p_internal
-- (excluded says how many rows were left out); totals are over the rows returned.
drop function if exists public.bobby_admin_members();
create or replace function public.bobby_admin_members(p_internal boolean default false)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with team as (select bobby_internal_identity_ids() as id),
  sf as (select * from bobby_subscription_facts()),
  gr as (select g.*, coalesce(g.identity_id in (select id from team), false) as internal from bobby_pro_grants g),
  vs as (select * from sf where coalesce(p_internal, false) or not sf.internal),
  vg as (select * from gr where coalesce(p_internal, false) or not gr.internal)
  select jsonb_build_object(
    'includeInternal', coalesce(p_internal, false),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('identityId', s.identity_id, 'email', b.email, 'provider', s.provider,
        'status', s.status, 'productId', s.product_id, 'currentPeriodEnd', s.current_period_end, 'updatedAt', s.updated_at, 'active', s.live,
        'environment', s.environment, 'periodType', s.period_type, 'storeCheckedAt', s.store_checked_at,
        'commercial', s.commercial, 'commercialReason', s.reason, 'firstChargeAt', s.first_charge_at, 'lastChargeAt', s.last_charge_at,
        'internal', s.internal)
        order by s.updated_at desc) from vs s left join bobby_identities b on b.id = s.identity_id), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('identityId', g.identity_id, 'email', b.email, 'source', g.source,
        'proUntil', g.pro_until, 'active', g.pro_until > now(), 'internal', g.internal) order by g.pro_until desc)
        from vg g left join bobby_identities b on b.id = g.identity_id), '[]'::jsonb),
    'excluded', jsonb_build_object(
        'subscriptions', (select count(*) from sf where not coalesce(p_internal, false) and sf.internal),
        'grants', (select count(*) from gr where not coalesce(p_internal, false) and gr.internal)),
    'totals', jsonb_build_object(
        'live', (select count(*) from vs where live), 'paidVerified', (select count(*) from vs where commercial = 'paid'),
        'unverified', (select count(*) from vs where commercial = 'unverified'), 'test', (select count(*) from vs where commercial = 'test')));
$$;

-- ---------------------------------------------------------------- writers
-- Seen now (20261001233000), plus the install's guest opens (no account on the call).
create or replace function public.bobby_touch_device(p_device text, p_platform text, p_surface text, p_referrer text, p_utm text, p_identity uuid,
  p_country text default null, p_region text default null, p_network text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := bobby_geo_country(p_country); r text := bobby_geo_region(p_country, p_region);
        pf text := case when p_platform in ('ios', 'android') then p_platform else 'web' end;
        today date := (now() at time zone 'utc')::date;
        net text := case when length(p_network) between 8 and 128 then p_network end;
begin
  if p_device is null or length(p_device) not between 8 and 128 then return; end if;
  insert into bobby_devices as d (device_hash, platform, first_surface, referrer, utm_source, identity_id, linked_at, country, region, network_hash)
    values (p_device, pf,
      case when p_surface ~ '^[a-z0-9_-]{1,32}$' then p_surface end,
      case when p_referrer ~ '^[a-z0-9.-]{1,80}$' then p_referrer end,
      case when p_utm ~ '^[a-z0-9_.-]{1,40}$' then p_utm end,
      p_identity, case when p_identity is not null then now() end, c, r, net)
  on conflict (device_hash) do update set
    active_days = d.active_days + case when (d.last_seen at time zone 'utc')::date < today then 1 else 0 end,
    last_seen = greatest(d.last_seen, now()),
    first_surface = coalesce(d.first_surface, excluded.first_surface),
    identity_id = coalesce(excluded.identity_id, d.identity_id),
    linked_at = case when excluded.identity_id is not null and d.identity_id is distinct from excluded.identity_id then now() else d.linked_at end,
    country = coalesce(excluded.country, d.country),
    region = case when excluded.country is not null then excluded.region else d.region end,
    network_hash = coalesce(excluded.network_hash, d.network_hash);
  if net is not null then
    insert into bobby_device_networks as dn (device_hash, network_hash) values (p_device, net)
      on conflict (device_hash, network_hash) do update set last_at = now();
  end if;
  if p_identity is not null then
    insert into bobby_device_accounts as l (device_hash, identity_id) values (p_device, p_identity)
      on conflict (device_hash, identity_id) do update set last_at = now();
    insert into bobby_activity_days as a (subject, day, platform, touches) values ('a:' || p_identity::text, today, pf, 1)
      on conflict (subject, day) do update set touches = a.touches + 1;
  end if;
  insert into bobby_activity_days as a (subject, day, platform, touches, guest_touches)
    values ('d:' || p_device, today, pf, 1, case when p_identity is null then 1 else 0 end)
    on conflict (subject, day) do update set touches = a.touches + 1, guest_touches = a.guest_touches + excluded.guest_touches;
end;
$$;

-- Reader stats (20261001233000) plus the install's guest reads (a read without an account).
create or replace function public.bobby_track_reader()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare key text; dday date := (new.created_at at time zone 'utc')::date;
begin
  if new.identity_id is null and new.device_hash is null then return new; end if;
  key := case when new.identity_id is not null then 'a:' || new.identity_id::text else 'd:' || new.device_hash end;
  begin
    insert into bobby_reader_stats as s (reader, identity_id, device_hash, platform, first_read_at, last_read_at, reads)
      values (key, new.identity_id, case when new.identity_id is null then new.device_hash end, new.platform, new.created_at, new.created_at, 1)
      on conflict (reader) do update set last_read_at = greatest(s.last_read_at, excluded.last_read_at), reads = s.reads + 1;
    if new.device_hash is not null then
      perform bobby_touch_device(new.device_hash, new.platform, null, null, null, new.identity_id);
      update bobby_devices set first_seen = least(first_seen, new.created_at),
        first_read_at = least(coalesce(first_read_at, new.created_at), new.created_at), reads = reads + 1
        where device_hash = new.device_hash;
      insert into bobby_activity_days as a (subject, day, platform, reads, guest_reads)
        values ('d:' || new.device_hash, dday, new.platform, 1, case when new.identity_id is null then 1 else 0 end)
        on conflict (subject, day) do update set reads = a.reads + 1, guest_reads = a.guest_reads + excluded.guest_reads;
    end if;
    if new.identity_id is not null then
      insert into bobby_activity_days as a (subject, day, platform, reads) values ('a:' || new.identity_id::text, dday, new.platform, 1)
        on conflict (subject, day) do update set reads = a.reads + 1;
    end if;
  exception when others then
    raise warning 'bobby_track_reader: %', sqlerrm;
  end;
  return new;
end;
$$;

-- A refunded read (deleted within 15 minutes, 20261001210000) also leaves the install and the activity day, and
-- a refunded guest read leaves the install's guest reads.
create or replace function public.bobby_untrack_reader()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare key text; dday date := (old.created_at at time zone 'utc')::date;
begin
  if old.created_at <= now() - interval '15 minutes' or (old.identity_id is null and old.device_hash is null) then return old; end if;
  key := case when old.identity_id is not null then 'a:' || old.identity_id::text else 'd:' || old.device_hash end;
  begin
    update bobby_reader_stats set reads = greatest(reads - 1, 0) where reader = key;
    delete from bobby_reader_stats where reader = key and reads = 0;
    if old.device_hash is not null then
      update bobby_devices set reads = greatest(reads - 1, 0), first_read_at = case when reads <= 1 then null else first_read_at end
        where device_hash = old.device_hash;
      update bobby_activity_days set reads = greatest(reads - 1, 0),
          guest_reads = case when old.identity_id is null then greatest(guest_reads - 1, 0) else guest_reads end
        where subject = 'd:' || old.device_hash and day = dday;
    end if;
    if old.identity_id is not null then
      update bobby_activity_days set reads = greatest(reads - 1, 0) where subject = 'a:' || old.identity_id::text and day = dday;
    end if;
  exception when others then
    raise warning 'bobby_untrack_reader: %', sqlerrm;
  end;
  return old;
end;
$$;

-- What the server saw happen at the desk (20261001230000), plus read_abandoned: the reader left before the answer.
create or replace function public.bobby_record_outcome(p_event text, p_platform text, p_device text, p_identity uuid, p_detail text,
  p_country text default null, p_region text default null, p_network text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare pf text := case when p_platform in ('ios', 'android') then p_platform else 'web' end;
        dev text := case when length(p_device) between 8 and 128 then p_device end;
        c text := case when pf = 'web' then bobby_geo_country(p_country) end;
begin
  if p_event not in ('read_done', 'read_failed', 'read_abandoned', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked') then
    raise exception 'unknown outcome';
  end if;
  insert into bobby_events (event, platform, surface, device_hash, identity_id, detail, country, region)
    values (p_event, pf, 'desk', dev, p_identity, case when p_detail ~ '^[a-z0-9_-]{1,32}$' then p_detail end,
      c, case when c is not null then bobby_geo_region(p_country, p_region) end);
  if dev is not null then
    perform bobby_touch_device(dev, pf, null, null, null, p_identity, c, case when c is not null then p_region end, p_network);
  end if;
end;
$$;

-- The web event of 20261001230000. A surface, referrer or utm that is not a slug is stored as null (the API already
-- validates them; the table's CHECK would otherwise refuse the whole visit).
create or replace function public.bobby_record_event(p_event text, p_platform text, p_surface text, p_device text, p_referrer text, p_utm text,
  p_country text default null, p_region text default null, p_network text default null)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare c text := case when p_platform = 'web' then bobby_geo_country(p_country) end;
        r text := case when p_platform = 'web' then bobby_geo_region(p_country, p_region) end;
        sf text := case when p_surface ~ '^[a-z0-9_-]{1,32}$' then p_surface end;
        rf text := case when p_referrer ~ '^[a-z0-9.-]{1,80}$' then p_referrer end;
        ut text := case when p_utm ~ '^[a-z0-9_.-]{1,40}$' then p_utm end;
begin
  insert into bobby_events (event, platform, surface, device_hash, referrer, utm_source, country, region)
    values (p_event, p_platform, sf, p_device, rf, ut, c, r);
  if p_device is not null then
    perform bobby_touch_device(p_device, p_platform, case when p_event = 'visit' then sf end, rf, ut, null, c, r, p_network);
  end if;
end;
$$;

-- ---------------------------------------------------------------- facts and views
-- People facts (20261001233000) with two changes. F04: the first account of a shared install inherits only the
-- install's guest days (a day another account signed in on it stays that account's). F09: read_30 / last_read_day,
-- a read on a UTC day in the last 30. paid_verified: the account has a verified paid membership
-- (bobby_subscription_facts). What an account inherits from its installs is aggregated once (same result as the
-- per-account subqueries of 20261001233000, which grew with accounts × pairings).
create or replace function public.bobby_admin_people_facts_v2()
returns table (
  person text, kind text, identity_id uuid, email text, provider text, platform text, internal boolean,
  first_seen timestamptz, reads int, pro boolean, last_day date, read_days_14 int, read_7 boolean, first_read_at timestamptz,
  read_30 boolean, last_read_day date, paid_verified boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  with paired as (
    -- An install shared by two accounts belongs to the first one that used it, so its guest reads count once.
    select distinct on (l.device_hash) l.device_hash, l.identity_id
    from bobby_device_accounts l join bobby_identities b on b.id = l.identity_id and b.auth_user_id is not null
    order by l.device_hash, l.first_at
  ), inherited as (
    -- What each account takes from the installs it was first on: their guest reads and the platform of the oldest.
    select p.identity_id, (array_agg(dv.platform order by dv.first_seen))[1] as platform, sum(g.reads) as reads, min(g.first_read_at) as first_read_at
    from paired p join bobby_devices dv on dv.device_hash = p.device_hash left join bobby_reader_stats g on g.reader = 'd:' || p.device_hash
    group by p.identity_id
  ), people as (
    select 'a:' || b.id::text as person, 'account'::text as kind, b.id as identity_id, b.email, b.provider,
      coalesce(i.platform, s.platform) as platform,
      coalesce(b.id in (select bobby_internal_identity_ids()), false) as internal, b.created_at as first_seen,
      (coalesce(s.reads, 0) + coalesce(i.reads, 0))::int as reads,
      bobby_is_pro(b.id) as pro,
      least(s.first_read_at, i.first_read_at) as first_read_at
    from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text left join inherited i on i.identity_id = b.id
    where b.auth_user_id is not null
    union all
    select 'd:' || dv.device_hash, 'guest', null, null, null, dv.platform, coalesce(dv.device_hash in (select bobby_internal_device_hashes()), false), dv.first_seen, coalesce(g.reads, 0), false, g.first_read_at
    from bobby_devices dv left join bobby_reader_stats g on g.reader = 'd:' || dv.device_hash
    where not exists (select 1 from paired p where p.device_hash = dv.device_hash)
  ), days as (
    select p.person, a.day, a.reads, true as active from people p join bobby_activity_days a on a.subject = p.person
    union all
    -- The install's guest days only (a day with no guest activity is not the account's). The condition is applied in
    -- agg, not here, so a stale estimate of it never turns this join into a nested loop.
    select 'a:' || pr.identity_id::text, a.day, a.guest_reads, a.guest_touches > 0 or a.guest_reads > 0
    from paired pr join bobby_activity_days a on a.subject = 'd:' || pr.device_hash
  ), agg as (
    select person, max(day) filter (where active) as last_day,
      count(distinct day) filter (where reads > 0 and day > (now() at time zone 'utc')::date - 14)::int as read_days_14,
      bool_or(reads > 0 and day > (now() at time zone 'utc')::date - 7) as read_7,
      bool_or(reads > 0 and day > (now() at time zone 'utc')::date - 30) as read_30,
      max(day) filter (where reads > 0) as last_read_day
    from days group by person
  ), paid as (
    select f.identity_id from bobby_subscription_facts() f where f.commercial = 'paid'
  )
  select p.person, p.kind, p.identity_id, p.email, p.provider, p.platform, p.internal, p.first_seen, p.reads, p.pro,
    greatest(agg.last_day, (p.first_seen at time zone 'utc')::date), coalesce(agg.read_days_14, 0), coalesce(agg.read_7, false), p.first_read_at,
    coalesce(agg.read_30, false), agg.last_read_day, p.kind = 'account' and coalesce(p.identity_id in (select identity_id from paid), false)
  from people p left join agg on agg.person = p.person;
$$;

-- Preserve the 15-column production signature, including last_read_day, through the v2 facts.
create or replace function public.bobby_admin_people_facts()
returns table (
  person text, kind text, identity_id uuid, email text, provider text, platform text, internal boolean,
  first_seen timestamptz, reads int, pro boolean, last_day date, read_days_14 int, read_7 boolean, first_read_at timestamptz, last_read_day date)
language sql stable security invoker set search_path = public, pg_temp as $$
  select f.person, f.kind, f.identity_id, f.email, f.provider, f.platform, f.internal, f.first_seen, f.reads, f.pro, f.last_day,
    f.read_days_14, f.read_7, f.first_read_at, f.last_read_day
  from bobby_admin_people_facts_v2() f;
$$;

-- Each team network (not removed) with the installs seen there, how many of those only the network ties to the
-- team (not in the closure without network seeds: no hand mark, no /admin, no chain to a team account), and the
-- accounts the network pulls in that nothing else ties to the team (F05: the closure now reaches them). What each
-- network reaches is walked from that network's installs only (one walk per network, not per install).
create or replace function public.bobby_admin_internal_networks()
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with recursive direct as materialized (select * from bobby_team_nodes(false)),
  reached as (
    select null::uuid as identity_id, dn.device_hash, left(n.network_hash, 10) as seed_ref
    from bobby_device_networks dn join bobby_internal_networks n on n.network_hash = dn.network_hash and not n.ignored
    union
    select x.identity_id, x.device_hash, r.seed_ref from reached r cross join lateral (
      select l.identity_id, null::text as device_hash from bobby_device_accounts l
        where r.device_hash is not null and l.device_hash = r.device_hash and not l.team_ignored
      union all
      select null::uuid, l.device_hash from bobby_device_accounts l
        where r.identity_id is not null and l.identity_id = r.identity_id and not l.team_ignored) x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'network', left(n.network_hash, 10), 'note', n.note, 'createdAt', n.created_at, 'lastSeenAt', n.last_seen_at,
      'installs', x.installs, 'onlyByNetwork', x.only_by_network, 'accountsOnlyByNetwork', y.accounts) order by n.last_seen_at desc), '[]'::jsonb)
  from bobby_internal_networks n
  cross join lateral (
    select count(*) as installs,
      count(*) filter (where dn.device_hash not in (select d.device_hash from direct d where d.device_hash is not null)) as only_by_network
    from bobby_device_networks dn
    where dn.network_hash = n.network_hash
  ) x
  cross join lateral (
    select count(distinct r.identity_id) as accounts from reached r
    where r.seed_ref = left(n.network_hash, 10) and r.identity_id is not null
      and r.identity_id not in (select d.identity_id from direct d where d.identity_id is not null)
  ) y
  where not n.ignored;
$$;

-- The users list (20261001233000) plus, for a team account that is neither an admin nor marked by hand, why the D2 rule
-- makes it the team's: team_seed (email, install_mark, admin_session, network, admin, mark) and team_seed_ref (the
-- account id, or the 10-character prefix of the install or network). Its own email first, then the nearest kind.
-- The displayed plan uses the same effective membership as members/metrics, including an active Apple mirror.
create or replace function public.bobby_admin_users(p_query text, p_limit int, p_offset int)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as q),
  esc as (select replace(replace(replace(q.q, '\', '\\'), '%', '\%'), '_', '\_') as e, q.q from q),
  reads_since as (select min(first_read_at) as at from bobby_reader_stats),
  pf as (select * from bobby_admin_people_facts() where kind = 'account'),
  -- Provenance (bobby_team_closure) only for a listed team account that is not an admin or hand-marked: read on
  -- first use, never when no such row is on the page.
  why as materialized (select c.identity_id, c.seed, c.seed_ref from bobby_team_closure(true) c where c.identity_id is not null),
  rows as (
    select b.id, nullif(b.email, '') as email, b.provider, b.wallet_address is not null and b.auth_user_id is null as wallet_only,
      case when b.wallet_address is not null then left(b.wallet_address, 6) || '…' || right(b.wallet_address, 4) end as wallet,
      b.created_at, b.last_seen_at,
      s.first_read_at, s.last_read_at, s.reads, s.platform,
      coalesce(pf.reads, 0) - coalesce(s.reads, 0) as guest_reads,
      pf.last_day as last_active_day,
      case when s.first_read_at is not null and b.created_at >= (select at from reads_since)
           then round(extract(epoch from (s.first_read_at - b.created_at)) / 60) end as activation_minutes,
      sub.provider as sub_provider, sub.status as sub_status, sub.current_period_end,
      g.pro_until, g.source as grant_source,
      bonus.reads as bonus_reads, bonus.profundo as bonus_profundo, bonus.maximo as bonus_maximo,
      exists (select 1 from bobby_admins a where a.identity_id = b.id) as is_admin,
      exists (select 1 from bobby_internal_marks m where m.identity_id = b.id) as is_internal,
      coalesce(b.id in (select bobby_internal_identity_ids()), false) as is_team,
      (select count(*) from bobby_device_accounts l where l.identity_id = b.id)::int as installs,
      bobby_is_pro(b.id) as pro
    from bobby_identities b
    left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    left join pf on pf.identity_id = b.id
    left join bobby_subscription_facts() sub on sub.identity_id = b.id
    left join bobby_pro_grants g on g.identity_id = b.id
    left join bobby_usage_bonus bonus on bonus.identity_id = b.id, esc
    where esc.q is null or b.email ilike '%' || esc.e || '%' or b.id::text ilike esc.e || '%' or b.wallet_address ilike '%' || esc.e || '%'
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'accounts', (select count(*) from rows where not wallet_only),
    'wallets', (select count(*) from rows where wallet_only),
    'internal', (select count(*) from rows where is_team),
    'readsSince', (select at from reads_since),
    'users', coalesce((select jsonb_agg(to_jsonb(r) || case when r.is_team and not r.is_admin and not r.is_internal then coalesce((
        select jsonb_build_object('team_seed', c.seed, 'team_seed_ref', c.seed_ref) from why c where c.identity_id = r.id
        order by (c.seed_ref = r.id::text) desc, array_position(array['email', 'install_mark', 'admin_session', 'network', 'admin', 'mark'], c.seed), c.seed_ref
        limit 1), '{}'::jsonb) else '{}'::jsonb end order by r.created_at desc) from (
      select * from rows order by created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb));
$$;

-- These latency-bounded analytics calls opt out of JIT compilation. Their nested multi-CTE
-- plans run for short dashboard reads; LLVM startup cost must not consume the API request budget.
-- Other application queries retain the database's JIT setting.
-- Growth (20261001233000): people from the v2 facts (F04 attribution) with the verified payers apart from Pro
-- access; the outcomes count read_abandoned apart from read_failed (F11).
create or replace function public.bobby_admin_growth(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp set jit = off as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  today date := (now() at time zone 'utc')::date;
  incl boolean := coalesce(p_internal, false);
  people jsonb; cohorts jsonb := '{}'::jsonb; history jsonb := '{}'::jsonb; outcomes jsonb; acquisition jsonb; coverage jsonb; attention jsonb;
  pf text;
begin
  -- People today, deduplicated (an account and its installs are one person).
  with p as (select * from bobby_admin_people_facts_v2()), v as (select * from p where incl or not internal),
  s as (
    select v.*, case
      when v.pro then 'pro'
      when v.last_day > today - 7 and v.reads = 0 then 'new'
      when v.last_day > today - 7 and v.read_days_14 >= 2 then 'recurring'
      when v.last_day > today - 7 then 'active'
      when v.last_day > today - 30 then 'atRisk'
      else 'lost' end as stage
    from v
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'accounts', (select count(*) from s where kind = 'account'),
    'guests', (select count(*) from s where kind = 'guest'),
    'wallets', (select count(*) from bobby_identities where auth_user_id is null),
    'excluded', jsonb_build_object('accounts', (select count(*) from p where internal and kind = 'account' and not incl),
                                   'guests', (select count(*) from p where internal and kind = 'guest' and not incl)),
    'newInPeriod', (select count(*) from s where first_seen >= since),
    'active7d', (select count(*) from s where last_day > today - 7),
    'active30d', (select count(*) from s where last_day > today - 30),
    'readers7d', (select count(*) from s where read_7),
    'readers', (select count(*) from s where reads > 0),
    'stages', jsonb_build_object(
      'new', (select count(*) from s where stage = 'new'), 'active', (select count(*) from s where stage = 'active'),
      'recurring', (select count(*) from s where stage = 'recurring'), 'pro', (select count(*) from s where stage = 'pro'),
      'atRisk', (select count(*) from s where stage = 'atRisk'), 'lost', (select count(*) from s where stage = 'lost')),
    'byPlatform', coalesce((select jsonb_object_agg(k, n) from (select coalesce(platform, 'unknown') k, count(*) n from s group by 1) x), '{}'::jsonb),
    'proInactive', (select count(*) from s where pro and last_day <= today - 14),
    'proPaidVerified', (select count(*) from s where paid_verified),
    'proInactivePaid', (select count(*) from s where paid_verified and last_day <= today - 14),
    'accountsNeverRead', (select count(*) from s where kind = 'account' and reads = 0)
  ) into people;

  -- Cohorts: installs seen arriving in the period, per platform, each step a subset of the one before it.
  foreach pf in array array['web', 'ios'] loop
    cohorts := cohorts || jsonb_build_object(pf, (
      with c as (
        select * from bobby_admin_device_facts() f
        where f.platform = pf and f.source = 'observed' and f.first_seen >= since and (incl or not f.internal)
      ), x as (
        select c.*, (c.first_read_at is not null and c.first_read_at >= c.first_seen - interval '5 seconds') as read1,
          (c.link_identity is not null and c.link_at >= c.first_seen - interval '2 minutes') as account,
          (c.first_seen at time zone 'utc')::date as d0
        from c
      )
      select jsonb_build_object(
        'arrived', count(*),
        'home', count(*) filter (where home),
        'deskOrRead', count(*) filter (where desk or read1),
        'read1', count(*) filter (where read1),
        'read2', count(*) filter (where read1 and reads >= 2),
        'read3', count(*) filter (where read1 and reads >= 3),
        'wall', count(*) filter (where read1 and wall_at is not null),
        'signinStart', count(*) filter (where signin_at is not null),
        'account', count(*) filter (where account),
        'accountNew', count(*) filter (where account and account_new),
        'accountAfterRead', count(*) filter (where account and read1),
        'accountAfterWall', count(*) filter (where account and read1 and wall_at is not null and link_at >= wall_at),
        'proAfterRead', count(*) filter (where account and read1 and pro),
        'delivered', coalesce(sum(delivered), 0), 'failed', coalesce(sum(failed), 0), 'abandoned', coalesce(sum(abandoned), 0),
        'medianMinutesToFirstRead', round((percentile_cont(0.5) within group (order by extract(epoch from (first_read_at - first_seen)) / 60)
            filter (where read1))::numeric, 1),
        'medianMinutesToAccount', round((percentile_cont(0.5) within group (order by extract(epoch from (link_at - first_seen)) / 60)
            filter (where account))::numeric, 1),
        'oldestDays', coalesce(max(today - d0), 0),
        'retention', jsonb_build_object(
          'd1', jsonb_build_object('eligible', count(*) filter (where d0 + 1 < today), 'returned', count(*) filter (where d0 + 1 < today and d1),
                  'read', count(*) filter (where d0 + 1 < today and d1_read)),
          'd7', jsonb_build_object('eligible', count(*) filter (where d0 + 7 < today), 'returned', count(*) filter (where d0 + 7 < today and d7),
                  'read', count(*) filter (where d0 + 7 < today and d7_read)),
          'w1', jsonb_build_object('eligible', count(*) filter (where d0 + 7 < today), 'returned', count(*) filter (where d0 + 7 < today and w1),
                  'read', count(*) filter (where d0 + 7 < today and w1_read)),
          -- Readers only: did someone who got an answer come back on a later day (within their first week so far)?
          'readersBack', jsonb_build_object('eligible', count(*) filter (where read1 and d0 + 1 < today), 'returned', count(*) filter (where read1 and d0 + 1 < today and w1),
                  'read', count(*) filter (where read1 and d0 + 1 < today and w1_read)))
      ) from x));
    -- The installs rebuilt from their reads: what they did, never mixed into a cohort.
    history := history || jsonb_build_object(pf, (
      select jsonb_build_object('installs', count(*), 'readers', count(*) filter (where reads > 0), 'reads', coalesce(sum(reads), 0),
        'read2', count(*) filter (where reads >= 2), 'linked', count(*) filter (where link_identity is not null),
        'installsInPeriod', count(*) filter (where first_seen >= since),
        'since', min(first_seen), 'until', max(first_seen))
      from bobby_admin_device_facts() f where f.platform = pf and f.source = 'backfill' and (incl or not f.internal)));
  end loop;

  -- What happened at the desk in the period (outside traffic unless asked).
  with r as (
    select r.*, (case when r.identity_id is not null then coalesce(r.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(r.device_hash in (select bobby_internal_device_hashes()), false) end) as internal from bobby_reads r where r.created_at >= since
  ), e as (
    select e.*, (case when e.identity_id is not null then coalesce(e.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(e.device_hash in (select bobby_internal_device_hashes()), false) end) as internal
    from bobby_events e where e.created_at >= since and e.event in ('read_done', 'read_failed', 'read_abandoned', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked')
  )
  select jsonb_build_object(
    'consumed', (select count(*) from r where incl or not internal),
    'consumedInternal', (select count(*) from r where internal),
    'consumedTotal', (select count(*) from r),
    'byPlatform', coalesce((select jsonb_object_agg(platform, n) from (select platform, count(*) n from r where incl or not internal group by 1) x), '{}'::jsonb),
    'delivered', (select count(*) from e where event = 'read_done' and (incl or not internal)),
    'failed', (select count(*) from e where event = 'read_failed' and detail is distinct from 'left' and (incl or not internal)),
    'failedBy', coalesce((select jsonb_object_agg(coalesce(detail,'other'),n) from (select detail,count(*) n from e where event='read_failed' and detail is distinct from 'left' and (incl or not internal) group by 1) f),'{}'::jsonb),
    'abandoned', (select count(*) from e where (event = 'read_abandoned' or (event='read_failed' and detail='left')) and (incl or not internal)),
    'wallSignin', (select count(*) from e where event = 'wall_signin' and (incl or not internal)),
    'wallSigninInstalls', (select count(distinct device_hash) from e where event = 'wall_signin' and (incl or not internal)),
    'wallPaywall', (select count(*) from e where event = 'wall_paywall' and (incl or not internal)),
    'wallLevel', (select count(*) from e where event = 'wall_level' and (incl or not internal)),
    'blocked', coalesce((select jsonb_object_agg(coalesce(detail, 'other'), n) from (select detail, count(*) n from e where event = 'desk_blocked' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'byLevel', coalesce((select jsonb_object_agg(coalesce(detail, 'rapido'), n) from (select detail, count(*) n from e where event = 'read_done' and (incl or not internal) group by 1) x), '{}'::jsonb),
    'outcomesSince', (select min(created_at) from bobby_events where event in ('read_done', 'read_failed', 'read_abandoned', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked'))
  ) into outcomes;

  -- Where the period's new web installs came from (first touch), and how far each source got.
  with c as (
    select f.*, (f.first_read_at is not null and f.first_read_at >= f.first_seen - interval '5 seconds') as read1,
      (f.link_identity is not null and f.link_at >= f.first_seen - interval '2 minutes') as account,
      case when f.utm_source is not null then 'utm:' || f.utm_source when f.referrer is not null then f.referrer else 'direct' end as src
    from bobby_admin_device_facts() f
    where f.platform = 'web' and f.source = 'observed' and f.first_seen >= since and (incl or not f.internal)
  ), v as (
    select ev.* from bobby_events ev where ev.event = 'visit' and ev.platform = 'web' and ev.created_at >= since
      and (incl or not (case when ev.identity_id is not null then coalesce(ev.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(ev.device_hash in (select bobby_internal_device_hashes()), false) end))
  )
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object('source', src, 'installs', n, 'read1', r1, 'account', ac) order by n desc, src) from (
        select src, count(*) n, count(*) filter (where read1) r1, count(*) filter (where account) ac from c group by src) x), '[]'::jsonb),
    'landing', coalesce((select jsonb_agg(jsonb_build_object('surface', s, 'installs', n, 'read1', r1) order by n desc, s) from (
        select coalesce(first_surface, 'unknown') s, count(*) n, count(*) filter (where read1) r1 from c group by 1) x), '[]'::jsonb),
    'visits', (select count(*) from v),
    'visitors', (select count(distinct device_hash) from v),
    'visitsWithUtm', (select count(*) from v where utm_source is not null),
    'visitsWithReferrer', (select count(*) from v where referrer is not null),
    'visitorDays', coalesce((select jsonb_agg(n order by g) from (
        select g, (select count(distinct v.device_hash) from v where v.created_at >= g and v.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) z), '[]'::jsonb)
  ) into acquisition;

  -- Accounts that need a nudge: outside accounts that never read, and outside readers gone quiet.
  with p as (select * from bobby_admin_people_facts_v2() where kind = 'account' and (incl or not internal))
  select jsonb_build_object(
    'neverRead', coalesce((select jsonb_agg(jsonb_build_object('identityId', identity_id, 'email', email, 'provider', provider, 'createdAt', first_seen, 'lastDay', last_day) order by first_seen desc)
        from (select * from p where reads = 0 order by first_seen desc limit 20) x), '[]'::jsonb),
    'quiet', coalesce((select jsonb_agg(jsonb_build_object('identityId', identity_id, 'email', email, 'provider', provider, 'reads', reads, 'lastDay', last_day) order by last_day desc)
        from (select * from p where reads > 0 and last_day <= today - 7 order by last_day desc limit 20) x), '[]'::jsonb)
  ) into attention;

  select jsonb_build_object(
    'webObservedSince', (select min(created_at) from bobby_events where platform = 'web'),
    'iosObservedSince', timestamptz '2026-10-01 20:45:03+00',
    'activitySince', (select min(day) from bobby_activity_days),
    'outcomesSince', outcomes -> 'outcomesSince',
    'observedInstalls', (select count(*) from bobby_devices where source = 'observed'),
    'backfillInstalls', (select count(*) from bobby_devices where source = 'backfill'),
    'internalInstalls', (select count(*) from bobby_admin_device_facts() where internal),
    'internalAccounts', (select count(*) from bobby_identities b where b.auth_user_id is not null and coalesce(b.id in (select bobby_internal_identity_ids()), false))
  ) into coverage;

  return jsonb_build_object('days', d, 'since', since, 'today', today, 'includeInternal', incl, 'people', people,
    'cohorts', cohorts, 'history', history, 'outcomes', outcomes, 'acquisition', acquisition, 'attention', attention, 'coverage', coverage);
end;
$$;

-- Overview (20261001233000) with: memberships classified (F01: subscriptions.paid now = verified payers, the
-- unverified and test ones apart, access counts unchanged); revenue strictly from PRODUCTION events, newPaying = the
-- first-ever verified charge in the period (F13) and payingInPeriod for the old meaning; lastTopup = a positive
-- top-up (F07); the last finished and unfinished desk analysis (F02); read_abandoned in the outcome coverage (F11).
create or replace function public.bobby_admin_overview(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp set jit = off as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  incl boolean := coalesce(p_internal, false);
  reads_since timestamptz := (select min(first_read_at) from bobby_reader_stats);
  days jsonb;
  accounts jsonb; activity jsonb; funnel jsonb; subs jsonb; revenue jsonb; llm jsonb; coupons jsonb;
begin
  select coalesce(jsonb_agg(to_char(g, 'YYYY-MM-DD') order by g), '[]'::jsonb) into days
    from generate_series(since, date_trunc('day', now()), interval '1 day') g;

  -- Accounts: Apple/Google sign-ins (wallet-only identities are counted apart).
  with b as (select b.*, coalesce(b.id in (select bobby_internal_identity_ids()), false) as internal from bobby_identities b where b.auth_user_id is not null),
  v as (select * from b where incl or not internal)
  select jsonb_build_object(
    'total', (select count(*) from v),
    'new', (select count(*) from v where created_at >= since),
    'internal', (select count(*) from b where internal),
    'wallets', (select count(*) from bobby_identities where auth_user_id is null),
    'active7d', (select count(*) from v where exists (select 1 from bobby_reader_stats s where s.reader = 'a:' || v.id::text and s.last_read_at > now() - interval '7 days')),
    'byProvider', coalesce((select jsonb_object_agg(p, n) from (select coalesce(provider, 'other') p, count(*) n from v group by 1) x), '{}'::jsonb),
    'daily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(*) from v where v.created_at >= g and v.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into accounts;

  -- Activity: reads per day and platform (bobby_reads keeps 35 days), premium levels, readers by person.
  with r as (select * from bobby_reads r where r.created_at >= since and (incl or not (case when r.identity_id is not null then coalesce(r.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(r.device_hash in (select bobby_internal_device_hashes()), false) end))),
  pf as (select * from bobby_admin_people_facts_v2() where incl or not internal)
  select jsonb_build_object(
    'reads', (select count(*) from r),
    'readsInternal', (select count(*) from bobby_reads x where x.created_at >= since and (case when x.identity_id is not null then coalesce(x.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(x.device_hash in (select bobby_internal_device_hashes()), false) end)),
    'readsDaily', (select jsonb_build_object(
        'web', coalesce(jsonb_agg(w order by g), '[]'::jsonb), 'ios', coalesce(jsonb_agg(i order by g), '[]'::jsonb),
        'android', coalesce(jsonb_agg(a order by g), '[]'::jsonb)) from (
        select g,
          count(r.id) filter (where r.platform = 'web') w, count(r.id) filter (where r.platform = 'ios') i,
          count(r.id) filter (where r.platform = 'android') a
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join r on r.created_at >= g and r.created_at < g + interval '1 day' group by g) s),
    'levels', (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb) from (
        select level, count(*) n from bobby_level_uses u where u.created_at >= since and (incl or not (case when u.identity_id is not null then coalesce(u.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(u.device_hash in (select bobby_internal_device_hashes()), false) end)) group by 1) x),
    'activeReaders7d', (select count(*) from pf where read_7),
    'activeReaders7dSplit', jsonb_build_object('accounts', (select count(*) from pf where read_7 and kind = 'account'), 'guests', (select count(*) from pf where read_7 and kind = 'guest')),
    'lastRead', (select jsonb_object_agg(platform, at) from (select platform, max(created_at) at from bobby_reads x where incl or not (case when x.identity_id is not null then coalesce(x.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(x.device_hash in (select bobby_internal_device_hashes()), false) end) group by 1) z),
    'activation', (select jsonb_build_object(
        'accounts', count(*),
        'activated', count(s.reader),
        'medianMinutes', case when count(s.reader) >= 3 then round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_read_at - b.created_at)) / 60)
                          filter (where s.reader is not null))::numeric, 1) end,
        'measuredSince', reads_since,
        'beforeCoverage', (select count(*) from bobby_identities x where x.auth_user_id is not null and x.created_at >= since and x.created_at < coalesce(reads_since, now())
                            and (incl or not coalesce(x.id in (select bobby_internal_identity_ids()), false))))
      from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
      where b.auth_user_id is not null and b.created_at >= greatest(since, coalesce(reads_since, now())) and (incl or not coalesce(b.id in (select bobby_internal_identity_ids()), false)))
  ) into activity;

  -- Funnel figures kept for the comparison series and the traffic cards (the cohort lives in bobby_admin_growth).
  with e as (select * from bobby_events e where e.created_at >= since and (incl or not (case when e.identity_id is not null then coalesce(e.identity_id in (select bobby_internal_identity_ids()), false) else coalesce(e.device_hash in (select bobby_internal_device_hashes()), false) end)))
  select jsonb_build_object(
    'web', jsonb_build_object(
      'visitors', (select count(distinct device_hash) from e where event = 'visit' and platform = 'web'),
      'deskVisitors', (select count(distinct device_hash) from e where event = 'visit' and platform = 'web' and surface = 'desk'),
      'appStoreClicks', (select count(*) from e where event = 'appstore_click'),
      'signinStarts', (select count(*) from e where event = 'signin_start' and platform = 'web'),
      'paywallViews', (select count(*) from e where event = 'paywall_view' and platform = 'web')),
    'ios', jsonb_build_object(
      'paywallViews', (select count(*) from e where event = 'paywall_view' and platform = 'ios')),
    'visitsDaily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(distinct e.device_hash) from e where e.event = 'visit' and e.platform = 'web' and e.created_at >= g and e.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s),
    'topSurfaces', (select coalesce(jsonb_agg(jsonb_build_object('surface', surface, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(surface, 'other') surface, count(distinct device_hash) n from e
        where event = 'visit' and platform = 'web' group by 1 order by 2 desc limit 8) x),
    'topReferrers', (select coalesce(jsonb_agg(jsonb_build_object('referrer', referrer, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(referrer, case when utm_source is not null then 'utm:' || utm_source end, 'direct') referrer, count(distinct device_hash) n from e
        where event = 'visit' and platform = 'web' group by 1 order by 2 desc limit 8) x)
  ) into funnel;

  -- Memberships, outside accounts: access (live) apart from commercial evidence (paid = verified payers; unverified
  -- and test keep their Pro but are not payers), and gifted Pro (referrals, admin grants).
  with sb as (select * from bobby_subscription_facts() f where incl or not f.internal),
  live as (select * from sb where sb.live)
  select jsonb_build_object(
    'active', (select count(*) from live),
    'paid', (select count(*) from live where commercial = 'paid'),
    'trialing', (select count(*) from live where status = 'trialing'),
    'paidVerified', (select count(*) from live where commercial = 'paid'),
    'unverified', (select count(*) from live where commercial = 'unverified'),
    'unverifiedReasons', jsonb_build_object('unknown_environment', (select count(*) from live where commercial = 'unverified' and reason = 'unknown_environment'),
                                            'unknown_period', (select count(*) from live where commercial = 'unverified' and reason = 'unknown_period'),
                                            'no_charge', (select count(*) from live where commercial = 'unverified' and reason = 'no_charge')),
    'test', (select count(*) from live where commercial = 'test'),
    'testReasons', jsonb_build_object('sandbox', (select count(*) from live where commercial = 'test' and reason = 'sandbox'),
                                      'trial', (select count(*) from live where commercial = 'test' and reason = 'trial')),
    'byEnvironment', coalesce((select jsonb_object_agg(environment, n) from (select environment, count(*) n from live group by 1) x), '{}'::jsonb),
    'byStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from sb group by 1) x), '{}'::jsonb),
    'byProvider', coalesce((select jsonb_object_agg(provider, n) from (select provider, count(*) n from live group by 1) x), '{}'::jsonb),
    'giftedPro', (select count(*) from bobby_pro_grants g where g.pro_until > now() and (incl or not coalesce(g.identity_id in (select bobby_internal_identity_ids()), false)))
  ) into subs;

  -- Unowned production receipts remain independently verified money but have unknown team/customer scope.
  -- Default customer revenue/series includes only attributable external accounts; unattributed fields always remain visible.
  -- includeInternal=true shows all recorded production money, including unowned, with explicit scope.
  -- A production billing event without price_usd is pending conversion, not a measured USD zero.
  -- unconvertedEvents always covers the selected production ledger period, independently of team/customer scope.
  -- Revenue from purchase events whose environment is PRODUCTION (sandbox and unknown environments are counted apart,
  -- never as money). Net = price × (1 − store commission − tax) when the event carries them, else its take-home share,
  -- else 85%; refunds subtract. Team purchases apart. newPaying = verified payers (bobby_payer_charges) whose first-ever
  -- verified charge falls in the period (the economics' definition); payingInPeriod = verified payers with a charge in
  -- the period. unverifiedGrossUsd = the part of grossUsd whose account is not a verified payer (D1: never a payer).
  select jsonb_build_object(
    'grossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and prod and ext), 0),
    'netUsd', coalesce(sum(price_usd * bobby_net_share(commission_pct, tax_pct, takehome)) filter (where price_usd is not null and prod and ext), 0),
    'refundsUsd', coalesce(-sum(price_usd) filter (where price_usd < 0 and prod and ext), 0),
    'newSubscriptions', count(*) filter (where type = 'INITIAL_PURCHASE' and prod and ext),
    'newPaying', (select count(*) from bobby_payer_charges() fc where fc.first_at >= since and (incl or not fc.internal)),
    'payingInPeriod', count(distinct identity_id) filter (where price_usd > 0 and prod and ext and payer),
    'unverifiedGrossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and prod and ext and not payer), 0),
    'renewals', count(*) filter (where type = 'RENEWAL' and prod and ext),
    'cancellations', count(*) filter (where type = 'CANCELLATION' and prod and ext),
    'expirations', count(*) filter (where type = 'EXPIRATION' and prod and ext),
    'sandboxEvents', count(*) filter (where env = 'SANDBOX'),
    'unknownEnvEvents', count(*) filter (where env not in ('PRODUCTION', 'SANDBOX')),
    'internalEvents', count(*) filter (where prod and identity_id is not null and not ext),
    'unconvertedEvents', count(*) filter (where prod and price_usd is null and type in ('INITIAL_PURCHASE', 'RENEWAL', 'REFUND')),
    'unattributedEvents', count(*) filter (where prod and identity_id is null),
    'unattributedGrossUsd', coalesce(sum(price_usd) filter (where prod and identity_id is null and price_usd > 0), 0),
    'unattributedRefundsUsd', coalesce(-sum(price_usd) filter (where prod and identity_id is null and price_usd < 0), 0),
    'unattributedNetUsd', coalesce(sum(price_usd * bobby_net_share(commission_pct,tax_pct,takehome)) filter (where prod and identity_id is null and price_usd is not null), 0),
    'scope', case when incl then 'all_recorded' else 'attributed_external' end,
    'daily', (select coalesce(jsonb_agg(v order by g), '[]'::jsonb) from (
        select g, coalesce((select sum(x.price_usd) from bobby_purchase_events x
          where x.price_usd > 0 and upper(coalesce(x.environment, '')) = 'PRODUCTION' and x.event_at >= g and x.event_at < g + interval '1 day'
            and (incl or (x.identity_id is not null and not coalesce(x.identity_id in (select bobby_internal_identity_ids()), false)))), 0) v
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into revenue
  from (select *, upper(coalesce(environment, '')) as env, upper(coalesce(environment, '')) = 'PRODUCTION' as prod,
          incl or (identity_id is not null and not coalesce(identity_id in (select bobby_internal_identity_ids()), false)) as ext,
          coalesce(identity_id in (select pc.identity_id from bobby_payer_charges() pc), false) as payer
        from bobby_purchase_events where event_at >= since) p;

  -- LLM spend from the cost ledger (it carries no account: the team's own reads are inside) and the credit left.
  select jsonb_build_object(
    'providers', (select jsonb_object_agg(p, jsonb_build_object(
        'today', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at >= date_trunc('day', now())),
        'week', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '7 days'),
        'month', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '30 days'),
        'period', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at >= since),
        'calls', (select count(*) from bobby_llm_usage where provider = p and created_at >= since),
        'failures', (select count(*) from bobby_llm_usage where provider = p and created_at >= since and not ok),
        'lastOk', (select max(created_at) from bobby_llm_usage where provider = p and ok),
        'lastFailure', (select jsonb_build_object('at', created_at, 'stop', stop, 'surface', surface) from bobby_llm_usage where provider = p and not ok order by created_at desc limit 1),
        'failures24h', (select count(*) from bobby_llm_usage where provider = p and not ok and created_at > now() - interval '24 hours'),
        'calls24h', (select count(*) from bobby_llm_usage where provider = p and created_at > now() - interval '24 hours'),
        'balanceMark', (select jsonb_build_object('amount', amount_usd, 'at', created_at) from bobby_llm_credit_marks
                          where provider = p and kind = 'balance' order by created_at desc limit 1),
        'estimatedLeft', (select m.amount_usd
            + coalesce((select sum(t.amount_usd) from bobby_llm_credit_marks t where t.provider = p and t.kind = 'topup' and t.created_at > m.created_at), 0)
            - coalesce((select sum(u.usd) from bobby_llm_usage u where u.provider = p and u.created_at > m.created_at), 0)
            from bobby_llm_credit_marks m where m.provider = p and m.kind = 'balance' order by m.created_at desc limit 1),
        'lastTopup', (select max(created_at) from bobby_llm_credit_marks where provider = p and kind = 'topup' and amount_usd > 0),
        'lastCreditAlert', (select updated_at from api_cache where cache_key = 'provider-credit-alert:' || p),
        'creditAlert', (select payload from api_cache where cache_key = 'provider-credit-alert:' || p)))
      from unnest(array['anthropic', 'openai']) p),
    'bySurface', coalesce((select jsonb_agg(jsonb_build_object('surface', surface, 'provider', provider, 'usd', usd, 'calls', calls, 'failures', failures) order by usd desc) from (
        select surface, provider, sum(usd) usd, count(*) calls, count(*) filter (where not ok) failures from bobby_llm_usage
        where created_at >= since and role is distinct from 'left' group by 1, 2) x), '[]'::jsonb),
    -- Desk analyses (one ledger batch per run, by its timestamp): finished = the run has a successful CIO/final row.
    -- lastFinishedAt / lastUnfinishedAt: the latest of each, so "recovered" is an order in time, never an average.
    -- A run the reader abandoned before the CIO (api/desk-debate.ts writes a 'left' marker row, provider 'none', with
    -- its batch) is neither a run that failed nor a finished one: it is counted apart (abandoned) and never moves
    -- lastUnfinishedAt. A run that finished and was then abandoned still proves the desk answered.
    'deskRuns', (select jsonb_build_object('runs', count(*) filter (where finished or not left_run), 'finished', count(*) filter (where finished),
        'abandoned', count(*) filter (where left_run and not finished),
        'lastFinishedAt', max(created_at) filter (where finished), 'lastUnfinishedAt', max(created_at) filter (where not finished and not left_run),
        'byDay', coalesce(jsonb_agg(jsonb_build_object('day', day, 'runs', 1, 'finished', finished::int)) filter (where finished or not left_run), '[]'::jsonb))
        from (select created_at, (created_at at time zone 'utc')::date as day, bool_or(ok and role in ('cio', 'final', 'judge')) as finished,
                bool_or(role = 'left') as left_run
              from bobby_llm_usage where surface = 'desk' and created_at >= since group by created_at) runs),
    'guard', bobby_llm_spend(),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('anthropic', a, 'openai', o) order by g), '[]'::jsonb) from (
        select g,
          coalesce(sum(u.usd) filter (where u.provider = 'anthropic'), 0) a, coalesce(sum(u.usd) filter (where u.provider = 'openai'), 0) o
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join bobby_llm_usage u on u.created_at >= g and u.created_at < g + interval '1 day' group by g) s)
  ) into llm;

  select jsonb_build_object(
    'active', (select count(*) from bobby_coupons where active and (expires_at is null or expires_at > now())
                and (max_redemptions is null or redeemed < max_redemptions)),
    'redemptions', (select count(*) from bobby_coupon_redemptions c where c.created_at >= since and (incl or not coalesce(c.identity_id in (select bobby_internal_identity_ids()), false))),
    'giftedReadsLeft', (select coalesce(sum(reads), 0) from bobby_usage_bonus),
    'giftedLeft', (select jsonb_build_object('reads', coalesce(sum(reads), 0), 'profundo', coalesce(sum(profundo), 0), 'maximo', coalesce(sum(maximo), 0)) from bobby_usage_bonus)
  ) into coupons;

  return jsonb_build_object('days', days, 'since', since, 'includeInternal', incl, 'accounts', accounts, 'activity', activity, 'funnel', funnel,
    'subscriptions', subs, 'revenue', revenue, 'llm', llm, 'coupons', coupons, 'coverage', bobby_admin_coverage() || jsonb_build_object(
      'activitySince', (select min(day) from bobby_activity_days),
      'outcomesSince', (select min(created_at) from bobby_events where event in ('read_done', 'read_failed', 'read_abandoned', 'wall_signin', 'wall_paywall', 'wall_level', 'desk_blocked')),
      'locatedSince', (select min(created_at) from bobby_events where country is not null)));
end;
$$;

-- Economics (20261001233000) with: revenue strictly from PRODUCTION events; new payers and payers ever = verified
-- payers by their first verified charge (F13, D1, the overview's definition); purchasesSince (has any purchase event ever arrived?);
-- subscriptions.active = verified payers (what the MRR multiplies), the other classes apart (F01); 30-day readers
-- = people with a read in the last 30 days, not lifetime readers who only opened (F09).
create or replace function public.bobby_admin_economics(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp set jit = off as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  incl boolean := coalesce(p_internal, false);
  prod_events jsonb; costs jsonb; subs jsonb;
begin
  with ev as (
    select * from bobby_purchase_events where upper(coalesce(environment, '')) = 'PRODUCTION' and (incl or (identity_id is not null and not coalesce(identity_id in (select bobby_internal_identity_ids()), false)))
  ), first_paid as (
    select * from bobby_payer_charges() fc where incl or not fc.internal
  )
  select jsonb_build_object(
    'grossUsd', coalesce((select sum(price_usd) from ev where price_usd > 0 and event_at >= since), 0),
    'netUsd', coalesce((select sum(price_usd * bobby_net_share(commission_pct, tax_pct, takehome)) from ev where price_usd is not null and event_at >= since), 0),
    'refundsUsd', coalesce((select -sum(price_usd) from ev where price_usd < 0 and event_at >= since), 0),
    'newPaying', (select count(*) from first_paid where first_at >= since),
    'payersEver', (select count(*) from first_paid),
    'payingInPeriod', (select count(distinct identity_id) from ev where price_usd > 0 and event_at >= since and identity_id in (select identity_id from first_paid)),
    'unverifiedGrossUsd', coalesce((select sum(price_usd) from ev where price_usd > 0 and event_at >= since
        and not coalesce(identity_id in (select identity_id from first_paid), false)), 0),
    'unconvertedEvents', (select count(*) from bobby_purchase_events where upper(coalesce(environment,''))='PRODUCTION' and event_at>=since and price_usd is null and type in ('INITIAL_PURCHASE', 'RENEWAL', 'REFUND')),
    'unattributedEvents', (select count(*) from bobby_purchase_events where identity_id is null and upper(coalesce(environment,''))='PRODUCTION' and event_at>=since),
    'unattributedGrossUsd', coalesce((select sum(price_usd) from bobby_purchase_events where identity_id is null and upper(coalesce(environment,''))='PRODUCTION' and event_at>=since and price_usd>0),0),
    'unattributedRefundsUsd', coalesce((select -sum(price_usd) from bobby_purchase_events where identity_id is null and upper(coalesce(environment,''))='PRODUCTION' and event_at>=since and price_usd<0),0),
    'unattributedNetUsd', coalesce((select sum(price_usd*bobby_net_share(commission_pct,tax_pct,takehome)) from bobby_purchase_events where identity_id is null and upper(coalesce(environment,''))='PRODUCTION' and event_at>=since and price_usd is not null),0),
    'scope', case when incl then 'all_recorded' else 'attributed_external' end,
    'purchasesSince', (select min(event_at) from bobby_purchase_events),
    'initialPurchases30d', (select count(*) from ev where type = 'INITIAL_PURCHASE' and event_at > now() - interval '30 days'),
    'expirations30d', (select count(*) from ev where type = 'EXPIRATION' and event_at > now() - interval '30 days'),
    'lastPriceUsd', (select price_usd from ev where price_usd > 0 order by event_at desc limit 1),
    'takehome', (select avg(bobby_net_share(commission_pct, tax_pct, takehome)) from ev where commission_pct is not null or takehome is not null)
  ) into prod_events;

  select jsonb_build_object(
    'marketingUsd', coalesce(sum(amount_usd) filter (where kind = 'marketing'), 0),
    'infraUsd', coalesce(sum(amount_usd) filter (where kind = 'infra'), 0),
    'otherUsd', coalesce(sum(amount_usd) filter (where kind = 'other'), 0),
    'entries', count(*),
    'byChannel', coalesce((select jsonb_agg(jsonb_build_object('channel', ch, 'usd', usd) order by usd desc) from (
        select coalesce(channel, 'other') ch, sum(amount_usd) usd from bobby_costs
        where kind = 'marketing' and spent_on >= since::date group by 1) x), '[]'::jsonb)
  ) into costs from bobby_costs where spent_on >= since::date;

  -- active = verified payers (the deployed unitEconomics multiplies it by the price); access counts apart.
  with live as (
    select * from bobby_subscription_facts() f where f.live and (incl or not f.internal)
  )
  select jsonb_build_object('active', count(*) filter (where commercial = 'paid'), 'trialing', count(*) filter (where status = 'trialing'),
    'live', count(*), 'paidVerified', count(*) filter (where commercial = 'paid'),
    'unverified', count(*) filter (where commercial = 'unverified'), 'test', count(*) filter (where commercial = 'test')) into subs from live;

  return jsonb_build_object(
    'days', d, 'since', since,
    'revenue', prod_events,
    'costs', costs,
    'subscriptions', subs,
    'newAccounts', (select count(*) from bobby_identities b where b.auth_user_id is not null and b.created_at >= since and (incl or not coalesce(b.id in (select bobby_internal_identity_ids()), false))),
    'activeReaders30d', (select count(*) from bobby_admin_people_facts_v2() f where (incl or not f.internal) and f.read_30),
    -- The ledger carries no account: its spend is divided by every active reader, the team included.
    'activeReaders30dAll', (select count(*) from bobby_admin_people_facts_v2() f where f.read_30),
    'llmUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at >= since),
    'llm30dUsd', (select coalesce(sum(usd), 0) from bobby_llm_usage where created_at > now() - interval '30 days'),
    'assumptions', coalesce((select value from bobby_admin_settings where key = 'unit_economics'), '{}'::jsonb));
end;
$$;

-- Geo (20261001233000) with purchases of verified payers only (D1, bobby_payer_charges): newPaying = verified payers
-- whose first verified charge falls in the period, by that charge's store country (F13); grossUsd = their production
-- charges of the period by the charge's country (a charge of an unverified membership is not revenue by country);
-- purchasesSince says whether any purchase event ever arrived (absence is not an observed zero).
create or replace function public.bobby_admin_geo(p_days int, p_internal boolean default false)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  incl boolean := coalesce(p_internal, false);
  located_since timestamptz := (select min(created_at) from bobby_events where country is not null);
begin
  return (
    with base as (
      select f.* from bobby_admin_device_facts() f
      where f.platform = 'web' and f.first_seen >= since and (incl or not f.internal)
    ), cohort as (
      select b.country, (select dv.region from bobby_devices dv where dv.device_hash = b.device_hash) as region, b.link_identity,
        exists (select 1 from bobby_reads r where r.created_at >= since and (r.device_hash = b.device_hash
          or (b.link_identity is not null and r.identity_id = b.link_identity and r.created_at >= b.first_seen))) as reader,
        b.link_identity is not null and b.link_at >= b.first_seen - interval '2 minutes' as account, b.pro
      from base b where located_since is not null and b.first_seen >= located_since
    )
    select jsonb_build_object(
      'since', since,
      'days', d,
      'locatedSince', located_since,
      'web', jsonb_build_object('devices', (select count(*) from base), 'measurable', (select count(*) from cohort),
                                'located', (select count(*) from cohort where country is not null),
                                'beforeLocation', (select count(*) from base where located_since is null or first_seen < located_since)),
      'countries', coalesce((select jsonb_agg(x order by (x->>'visitors')::int desc, x->>'country') from (
          select jsonb_build_object('country', country, 'visitors', count(*), 'readers', count(*) filter (where reader),
            'accounts', count(*) filter (where account), 'pro', count(*) filter (where pro)) as x
          from cohort where country is not null group by country order by count(*) desc, country limit 40) t), '[]'::jsonb),
      'regions', coalesce((select jsonb_agg(x order by (x->>'visitors')::int desc, x->>'country', x->>'region') from (
          select jsonb_build_object('country', country, 'region', region, 'visitors', count(*), 'readers', count(*) filter (where reader)) as x
          from cohort where region is not null group by country, region order by count(*) desc, country, region limit 40) t), '[]'::jsonb),
      'located', jsonb_build_object('total', (select count(*) from cohort where country is not null), 'withRegion', (select count(*) from cohort where region is not null)),
      'purchases', coalesce((select jsonb_agg(x order by (x->>'newPaying')::int desc, x->>'country') from (
          select jsonb_build_object('country', country, 'newPaying', sum(payers)::int, 'grossUsd', round(sum(usd)::numeric, 2)) as x
          from (
            select coalesce(fc.country, '??') as country, 1 as payers, 0::numeric as usd
            from bobby_payer_charges() fc where fc.first_at >= since and (incl or not fc.internal)
            union all
            select coalesce(pe.country, '??'), 0, pe.price_usd
            from bobby_purchase_events pe
            where pe.event_at >= since and pe.price_usd > 0 and upper(coalesce(pe.environment, '')) = 'PRODUCTION'
              and pe.identity_id in (select pc.identity_id from bobby_payer_charges() pc where incl or not pc.internal)
          ) u
          group by country having sum(payers) > 0 or sum(usd) > 0) t), '[]'::jsonb),
      'purchasesSince', (select min(event_at) from bobby_purchase_events)
    ));
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke all on function public.bobby_team_nodes(boolean) from public, anon, authenticated;
revoke all on function public.bobby_team_closure(boolean) from public, anon, authenticated;
revoke all on function public.bobby_internal_identity_ids() from public, anon, authenticated;
revoke all on function public.bobby_internal_device_hashes() from public, anon, authenticated;
revoke all on function public.bobby_set_team_link_ignored(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.bobby_cache_claim(text, int, jsonb) from public, anon, authenticated;
revoke all on function public.bobby_first_charges() from public, anon, authenticated;
revoke all on function public.bobby_payer_charges() from public, anon, authenticated;
revoke all on function public.bobby_subscription_facts() from public, anon, authenticated;
revoke all on function public.bobby_admin_members(boolean) from public, anon, authenticated;
revoke all on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_track_reader() from public, anon, authenticated;
revoke all on function public.bobby_untrack_reader() from public, anon, authenticated;
revoke all on function public.bobby_record_outcome(text, text, text, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_record_event(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.bobby_admin_internal_networks() from public, anon, authenticated;
revoke all on function public.bobby_admin_users(text, int, int) from public, anon, authenticated;
revoke all on function public.bobby_admin_people_facts_v2() from public, anon, authenticated;
revoke all on function public.bobby_admin_people_facts() from public, anon, authenticated;
revoke all on function public.bobby_admin_growth(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_overview(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_economics(int, boolean) from public, anon, authenticated;
revoke all on function public.bobby_admin_geo(int, boolean) from public, anon, authenticated;
grant execute on function public.bobby_team_nodes(boolean) to service_role;
grant execute on function public.bobby_team_closure(boolean) to service_role;
grant execute on function public.bobby_internal_identity_ids() to service_role;
grant execute on function public.bobby_internal_device_hashes() to service_role;
grant execute on function public.bobby_set_team_link_ignored(text, uuid, boolean) to service_role;
grant execute on function public.bobby_cache_claim(text, int, jsonb) to service_role;
grant execute on function public.bobby_first_charges() to service_role;
grant execute on function public.bobby_payer_charges() to service_role;
grant execute on function public.bobby_subscription_facts() to service_role;
grant execute on function public.bobby_admin_members(boolean) to service_role;
grant execute on function public.bobby_touch_device(text, text, text, text, text, uuid, text, text, text) to service_role;
grant execute on function public.bobby_track_reader() to service_role;
grant execute on function public.bobby_untrack_reader() to service_role;
grant execute on function public.bobby_record_outcome(text, text, text, uuid, text, text, text, text) to service_role;
grant execute on function public.bobby_record_event(text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.bobby_admin_internal_networks() to service_role;
grant execute on function public.bobby_admin_users(text, int, int) to service_role;
grant execute on function public.bobby_admin_people_facts_v2() to service_role;
grant execute on function public.bobby_admin_people_facts() to service_role;
grant execute on function public.bobby_admin_growth(int, boolean) to service_role;
grant execute on function public.bobby_admin_overview(int, boolean) to service_role;
grant execute on function public.bobby_admin_economics(int, boolean) to service_role;
grant execute on function public.bobby_admin_geo(int, boolean) to service_role;

notify pgrst, 'reload schema';

-- Preserve production aggregate joins while supporting explicit abandonment.
create or replace function public.bobby_admin_device_facts()
returns table (
  device_hash text, platform text, source text, first_seen timestamptz, last_seen timestamptz, first_surface text,
  referrer text, utm_source text, country text, internal boolean,
  home boolean, desk boolean, signin_at timestamptz, wall_at timestamptz, delivered int, failed int, abandoned int,
  first_read_at timestamptz, reads int, link_identity uuid, link_email text, link_at timestamptz, account_new boolean, pro boolean,
  d1 boolean, d1_read boolean, d7 boolean, d7_read boolean, w1 boolean, w1_read boolean)
language sql stable security invoker set search_path = public, pg_temp as $$
  with links as (
    select distinct on (l.device_hash) l.device_hash, l.identity_id, l.first_at, b.created_at as identity_created, b.email
    from bobby_device_accounts l join bobby_identities b on b.id = l.identity_id and b.auth_user_id is not null
    order by l.device_hash, l.first_at
  ), ev as (
    select e.device_hash,
      bool_or(e.event = 'visit' and e.surface = 'home') as home,
      bool_or(e.event = 'visit' and e.surface = 'desk') as desk,
      min(e.created_at) filter (where e.event = 'signin_start') as signin_at,
      min(e.created_at) filter (where e.event = 'wall_signin') as wall_at,
      count(*) filter (where e.event = 'read_done')::int as delivered,
      count(*) filter (where e.event = 'read_failed' and e.detail is distinct from 'left')::int as failed,
      count(*) filter (where e.event = 'read_abandoned' or (e.event = 'read_failed' and e.detail = 'left'))::int as abandoned
    from bobby_events e where e.device_hash is not null group by 1
  ), days as (
    select dv.device_hash, (dv.first_seen at time zone 'utc')::date as d0, a.day, a.reads
    from bobby_devices dv join bobby_activity_days a on a.subject = 'd:' || dv.device_hash
    union all
    select dv.device_hash, (dv.first_seen at time zone 'utc')::date, a.day, a.reads
    from bobby_devices dv join links lk on lk.device_hash = dv.device_hash join bobby_activity_days a on a.subject = 'a:' || lk.identity_id::text
  ), act as (
    select device_hash,
      bool_or(day = d0 + 1) as d1, bool_or(day = d0 + 1 and reads > 0) as d1_read,
      bool_or(day = d0 + 7) as d7, bool_or(day = d0 + 7 and reads > 0) as d7_read,
      bool_or(day between d0 + 1 and d0 + 7) as w1, bool_or(day between d0 + 1 and d0 + 7 and reads > 0) as w1_read
    from days group by device_hash
  )
  select dv.device_hash, dv.platform, dv.source, dv.first_seen, dv.last_seen, dv.first_surface, dv.referrer, dv.utm_source, dv.country,
    coalesce(dv.device_hash in (select bobby_internal_device_hashes()), false),
    coalesce(ev.home, false), coalesce(ev.desk, false), ev.signin_at, ev.wall_at, coalesce(ev.delivered, 0), coalesce(ev.failed, 0), coalesce(ev.abandoned, 0),
    dv.first_read_at, dv.reads, lk.identity_id, lk.email, lk.first_at,
    lk.identity_id is not null and lk.identity_created >= dv.first_seen - interval '2 minutes',
    lk.identity_id is not null and bobby_is_pro(lk.identity_id),
    coalesce(act.d1, false), coalesce(act.d1_read, false), coalesce(act.d7, false), coalesce(act.d7_read, false),
    coalesce(act.w1, false), coalesce(act.w1_read, false)
  from bobby_devices dv
  left join ev on ev.device_hash = dv.device_hash
  left join links lk on lk.device_hash = dv.device_hash
  left join act on act.device_hash = dv.device_hash;
$$;
revoke all on function public.bobby_admin_device_facts() from public, anon, authenticated;
grant execute on function public.bobby_admin_device_facts() to service_role;

-- Retain the indexed production compatibility helper, routed through the same tombstone-aware team graph.
create or replace function public.bobby_internal_subjects(p_with_networks boolean default true)
returns table(kind text,id text) language sql stable security invoker set search_path=public,pg_temp as $$
select case when identity_id is not null then 'a' else 'd' end,coalesce(identity_id::text,device_hash)
from bobby_team_nodes(p_with_networks);
$$;
revoke all on function public.bobby_internal_subjects(boolean) from public,anon,authenticated;
grant execute on function public.bobby_internal_subjects(boolean) to service_role;

-- Recent server-observed activity. This does not establish an online session, client rendering or crash health.
create or replace function public.bobby_admin_live(p_internal boolean default false)
returns jsonb language sql stable security invoker set search_path = public, pg_temp set jit = off as $$
  with team_accounts as materialized (select bobby_internal_identity_ids() as id),
  team_devices as materialized (select bobby_internal_device_hashes() as id),
  ev as materialized (
    select e.* from bobby_events e where e.platform in ('ios', 'web') and (coalesce(p_internal,false) or not
      case when e.identity_id is not null then coalesce(e.identity_id in (select id from team_accounts),false)
      else coalesce(e.device_hash in (select id from team_devices),false) end)
  ), rd as materialized (
    select r.* from bobby_reads r where r.platform in ('ios', 'web') and (coalesce(p_internal,false) or not
      case when r.identity_id is not null then coalesce(r.identity_id in (select id from team_accounts),false)
      else coalesce(r.device_hash in (select id from team_devices),false) end)
  ), periods(label,minutes) as (values ('15m',15), ('1h',60), ('24h',1440)),
  platforms(platform) as (values ('ios'),('web')),
  touches as materialized (
    select platform,device_hash,identity_id,created_at from ev where created_at >= now()-interval '24 hours' and created_at <= now()
    union all
    select platform,device_hash,identity_id,created_at from rd where created_at >= now()-interval '24 hours' and created_at <= now()
  ), window_platform as (
    select p.label,p.minutes,pf.platform,jsonb_build_object(
      'observedDevices',(select count(distinct device_hash) from touches t where t.platform=pf.platform and t.created_at >= now()-make_interval(mins=>p.minutes)),
      'observedAccounts',(select count(distinct identity_id) from touches t where t.platform=pf.platform and t.created_at >= now()-make_interval(mins=>p.minutes)),
      'events',count(e.id),
      'consumed',(select count(*) from rd r where r.platform=pf.platform and r.created_at >= now()-make_interval(mins=>p.minutes) and r.created_at <= now()),
      'completed',count(e.id) filter(where e.event='read_done'),
      'failed',count(e.id) filter(where e.event='read_failed' and e.detail is distinct from 'left'),
      'abandoned',count(e.id) filter(where e.event='read_abandoned' or (e.event='read_failed' and e.detail='left')),
      'wallSignin',count(e.id) filter(where e.event='wall_signin'),
      'wallPaywall',count(e.id) filter(where e.event='wall_paywall'),
      'wallLevel',count(e.id) filter(where e.event='wall_level'),
      'blocked',coalesce((select jsonb_object_agg(detail,n) from (
        select coalesce(be.detail,'other') as detail,count(*) as n from ev be
        where be.platform=pf.platform and be.event='desk_blocked' and be.created_at >= now()-make_interval(mins=>p.minutes) and be.created_at <= now()
        group by 1) b),'{}'::jsonb)) as facts
    from periods p cross join platforms pf left join ev e on e.platform=pf.platform
      and e.created_at >= now()-make_interval(mins=>p.minutes) and e.created_at <= now()
    group by p.label,p.minutes,pf.platform
  ), period_facts as (
    select label,jsonb_build_object('minutes',minutes,'since',now()-make_interval(mins=>minutes)) || jsonb_object_agg(platform,facts) as facts
    from window_platform group by label,minutes
  ), latest as (
    select pf.platform,jsonb_build_object(
      'latestEventAt',max(e.created_at),
      'latestOutcomeAt',max(e.created_at) filter(where e.event in ('read_done','read_failed','read_abandoned','wall_signin','wall_paywall','wall_level','desk_blocked')),
      'latestCompletedAt',max(e.created_at) filter(where e.event='read_done'),
      'latestReadConsumptionAt',(select max(r.created_at) from rd r where r.platform=pf.platform and r.created_at <= now())) as facts
    from platforms pf left join ev e on e.platform=pf.platform and e.created_at <= now() group by pf.platform
  ), models as (
    select provider,model,count(*) as calls,count(*) filter(where not ok) as failures,coalesce(sum(usd),0) as usd,
      percentile_cont(0.5) within group(order by latency_ms) filter(where latency_ms >= 0) as p50,
      percentile_cont(0.95) within group(order by latency_ms) filter(where latency_ms >= 0) as p95,
      max(created_at) as last_at,max(created_at) filter(where not ok) as failed_at
    from bobby_llm_usage where created_at >= now()-interval '24 hours' and created_at <= now() and provider <> 'none' and role is distinct from 'left'
    group by provider,model
  )
  select jsonb_build_object('snapshotAt',now(),'includeInternal',coalesce(p_internal,false),
    'windows',(select jsonb_object_agg(label,facts) from period_facts),
    'platforms',(select jsonb_object_agg(platform,facts) from latest),
    'providers',coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'model',model,'calls24h',calls,'failures24h',failures,
      'usd24h',usd,'callLatencyP50Ms',p50,'callLatencyP95Ms',p95,'lastCallAt',last_at,'lastFailureAt',failed_at) order by provider,model) from models),'[]'::jsonb),
    'coverage',jsonb_build_object('readStarted',false,'clientRendered',false,'crashes',false,'buildVersion',false,'onlinePresence',false,
      'eventCoverageSince',(select min(created_at) from bobby_events),
      'outcomeCoverageSince',(select min(created_at) from bobby_events where event in ('read_done','read_failed','read_abandoned','wall_signin','wall_paywall','wall_level','desk_blocked')),
      'readConsumptionCoverageSince',(select min(created_at) from bobby_reads),
      'llmLedgerCoverageSince',(select min(created_at) from bobby_llm_usage),
      'providerCostsIncludeInternal',true,'completedScope','server_read_done','latencyScope','provider_call',
      'observedActivityScope','events_and_consumed_reads','successRate',null));
$$;
revoke all on function public.bobby_admin_live(boolean) from public, anon, authenticated;
grant execute on function public.bobby_admin_live(boolean) to service_role;

notify pgrst, 'reload schema';
