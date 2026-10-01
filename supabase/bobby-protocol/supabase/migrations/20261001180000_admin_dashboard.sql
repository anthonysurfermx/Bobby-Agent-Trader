-- The owner dashboard (/admin, api/admin.ts), 2026-10-01.
--   · bobby_admins: the accounts allowed into /admin (seeded below with the owner's two Google accounts).
--   · bobby_admin_actions: an audit row for every change made from the dashboard.
--   · bobby_events: first-party funnel events (page visits, App Store clicks, sign-in starts, paywall views)
--     from the web and the apps. Install ids are salted hashes; no IP, no user agent, no free text.
--   · bobby_reader_stats: one row per account or guest device with its first / last read and read count, kept
--     by a trigger on bobby_reads (whose rows are pruned after 35 days), so activation and lifecycle survive.
--   · bobby_purchase_events: RevenueCat webhook events (price, store, environment), idempotent by event id.
--   · bobby_llm_credit_marks: the owner's balance snapshots and top-ups per provider; with the cost ledger
--     (bobby_llm_usage) they give an estimated remaining credit (providers expose no balance API).
--   · bobby_admin_overview / bobby_admin_users: the aggregates the dashboard reads.
-- Everything is service_role only (anon and authenticated revoked by name, as in 20260929150000).

create table if not exists public.bobby_admins (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  note text check (note is null or length(note) <= 120),
  created_at timestamptz not null default now()
);

create table if not exists public.bobby_admin_actions (
  id bigserial primary key,
  admin_id uuid references public.bobby_identities(id) on delete set null,
  action text not null check (length(action) <= 40),
  target text check (target is null or length(target) <= 120),
  detail jsonb,
  created_at timestamptz not null default now()
);
create index if not exists bobby_admin_actions_created_idx on public.bobby_admin_actions (created_at desc);

create table if not exists public.bobby_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in ('visit', 'appstore_click', 'signin_start', 'paywall_view', 'purchase_start')),
  platform text not null check (platform in ('web', 'ios', 'android')),
  surface text check (surface is null or surface ~ '^[a-z0-9_-]{1,32}$'),
  device_hash text check (device_hash is null or length(device_hash) between 8 and 128),
  identity_id uuid references public.bobby_identities(id) on delete set null,
  referrer text check (referrer is null or referrer ~ '^[a-z0-9.-]{1,80}$'),
  utm_source text check (utm_source is null or utm_source ~ '^[a-z0-9_.-]{1,40}$')
);
create index if not exists bobby_events_created_idx on public.bobby_events (created_at desc);
create index if not exists bobby_events_event_idx on public.bobby_events (event, platform, created_at desc);

create table if not exists public.bobby_reader_stats (
  reader text primary key,                       -- 'a:<identity uuid>' or 'd:<device hash>'
  identity_id uuid references public.bobby_identities(id) on delete cascade,
  device_hash text,
  platform text,                                 -- the platform of the first read
  first_read_at timestamptz not null,
  last_read_at timestamptz not null,
  reads int not null default 0
);
create index if not exists bobby_reader_stats_identity_idx on public.bobby_reader_stats (identity_id) where identity_id is not null;
create index if not exists bobby_reader_stats_first_idx on public.bobby_reader_stats (first_read_at desc);

create table if not exists public.bobby_purchase_events (
  id text primary key check (length(id) between 1 and 80),
  type text not null check (length(type) <= 40),
  environment text check (environment is null or length(environment) <= 20),
  store text check (store is null or length(store) <= 30),
  product_id text check (product_id is null or length(product_id) <= 120),
  price_usd numeric(12, 4),
  takehome numeric(5, 4),
  currency text check (currency is null or length(currency) <= 8),
  price_local numeric(14, 4),
  identity_id uuid references public.bobby_identities(id) on delete set null,
  event_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists bobby_purchase_events_at_idx on public.bobby_purchase_events (event_at desc);

create table if not exists public.bobby_llm_credit_marks (
  id bigserial primary key,
  provider text not null check (provider in ('openai', 'anthropic')),
  kind text not null check (kind in ('balance', 'topup')),
  amount_usd numeric(10, 2) not null check (amount_usd >= 0 and amount_usd <= 100000),
  note text check (note is null or length(note) <= 120),
  created_at timestamptz not null default now()
);

alter table public.bobby_admins enable row level security;
alter table public.bobby_admin_actions enable row level security;
alter table public.bobby_events enable row level security;
alter table public.bobby_reader_stats enable row level security;
alter table public.bobby_purchase_events enable row level security;
alter table public.bobby_llm_credit_marks enable row level security;
revoke all on public.bobby_admins, public.bobby_admin_actions, public.bobby_events, public.bobby_reader_stats,
  public.bobby_purchase_events, public.bobby_llm_credit_marks from public, anon, authenticated;
grant all on public.bobby_admins, public.bobby_admin_actions, public.bobby_events, public.bobby_reader_stats,
  public.bobby_purchase_events, public.bobby_llm_credit_marks to service_role;
revoke all on sequence public.bobby_admin_actions_id_seq, public.bobby_events_id_seq, public.bobby_llm_credit_marks_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.bobby_admin_actions_id_seq, public.bobby_events_id_seq, public.bobby_llm_credit_marks_id_seq
  to service_role;

-- Keep the reader stats on every read. A stats failure must never refuse a read: the block swallows errors.
create or replace function public.bobby_track_reader()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
declare key text;
begin
  if new.identity_id is null and new.device_hash is null then return new; end if;
  key := case when new.identity_id is not null then 'a:' || new.identity_id::text else 'd:' || new.device_hash end;
  begin
    insert into bobby_reader_stats as s (reader, identity_id, device_hash, platform, first_read_at, last_read_at, reads)
      values (key, new.identity_id, case when new.identity_id is null then new.device_hash end, new.platform, new.created_at, new.created_at, 1)
      on conflict (reader) do update set last_read_at = greatest(s.last_read_at, excluded.last_read_at), reads = s.reads + 1;
  exception when others then
    raise warning 'bobby_track_reader: %', sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists bobby_reads_track_reader on public.bobby_reads;
create trigger bobby_reads_track_reader after insert on public.bobby_reads
  for each row execute function public.bobby_track_reader();

-- Backfill from the reads still on record (the last 35 days).
insert into public.bobby_reader_stats (reader, identity_id, device_hash, platform, first_read_at, last_read_at, reads)
select key, identity_id, device_hash, (array_agg(platform order by created_at))[1], min(created_at), max(created_at), count(*)
from (
  select case when identity_id is not null then 'a:' || identity_id::text else 'd:' || device_hash end as key,
    identity_id, case when identity_id is null then device_hash end as device_hash, platform, created_at
  from public.bobby_reads where identity_id is not null or device_hash is not null
) r
group by key, identity_id, device_hash
on conflict (reader) do nothing;

-- The dashboard summary for the last p_days days (1–365).
create or replace function public.bobby_admin_overview(p_days int)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare
  d int := least(greatest(coalesce(p_days, 30), 1), 365);
  since timestamptz := date_trunc('day', now()) - make_interval(days => d - 1);
  days jsonb;
  accounts jsonb; activity jsonb; funnel jsonb; subs jsonb; revenue jsonb; llm jsonb; coupons jsonb;
begin
  select coalesce(jsonb_agg(to_char(g, 'YYYY-MM-DD') order by g), '[]'::jsonb) into days
    from generate_series(since, date_trunc('day', now()), interval '1 day') g;

  -- Accounts: Apple/Google sign-ins (wallet-only identities are counted apart).
  select jsonb_build_object(
    'total', count(*) filter (where auth_user_id is not null),
    'new', count(*) filter (where auth_user_id is not null and created_at >= since),
    'wallets', count(*) filter (where auth_user_id is null),
    'active7d', count(*) filter (where auth_user_id is not null and last_seen_at > now() - interval '7 days'),
    'byProvider', coalesce((select jsonb_object_agg(p, n) from (
        select coalesce(provider, 'other') p, count(*) n from bobby_identities where auth_user_id is not null group by 1) x), '{}'::jsonb),
    'daily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(*) from bobby_identities b where b.auth_user_id is not null and b.created_at >= g and b.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into accounts from bobby_identities;

  -- Activity: reads per day and platform (bobby_reads keeps 35 days), premium levels, readers.
  select jsonb_build_object(
    'reads', (select count(*) from bobby_reads where created_at >= since),
    'readsDaily', (select jsonb_build_object(
        'web', coalesce(jsonb_agg(w order by g), '[]'::jsonb), 'ios', coalesce(jsonb_agg(i order by g), '[]'::jsonb),
        'android', coalesce(jsonb_agg(a order by g), '[]'::jsonb)) from (
        select g,
          count(r.id) filter (where r.platform = 'web') w, count(r.id) filter (where r.platform = 'ios') i,
          count(r.id) filter (where r.platform = 'android') a
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join bobby_reads r on r.created_at >= g and r.created_at < g + interval '1 day' group by g) s),
    'levels', (select coalesce(jsonb_object_agg(level, n), '{}'::jsonb) from (
        select level, count(*) n from bobby_level_uses where created_at >= since group by 1) x),
    'activeReaders7d', (select count(*) from bobby_reader_stats where last_read_at > now() - interval '7 days'),
    'activation', (select jsonb_build_object(
        'accounts', count(*),
        'activated', count(s.reader),
        'medianMinutes', round((percentile_cont(0.5) within group (order by extract(epoch from (s.first_read_at - b.created_at)) / 60)
                          filter (where s.reader is not null))::numeric, 1))
      from bobby_identities b left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
      where b.auth_user_id is not null and b.created_at >= since)
  ) into activity;

  -- Funnel per platform over the window. Devices are guest installs/browsers; accounts are attributed to the
  -- platform of their first read.
  select jsonb_build_object(
    'web', jsonb_build_object(
      'visitors', (select count(distinct device_hash) from bobby_events where event = 'visit' and platform = 'web' and created_at >= since),
      'deskVisitors', (select count(distinct device_hash) from bobby_events where event = 'visit' and platform = 'web' and surface = 'desk' and created_at >= since),
      'appStoreClicks', (select count(*) from bobby_events where event = 'appstore_click' and created_at >= since),
      'signinStarts', (select count(*) from bobby_events where event = 'signin_start' and platform = 'web' and created_at >= since),
      'guestReaders', (select count(*) from bobby_reader_stats where identity_id is null and platform = 'web' and first_read_at >= since),
      'accounts', (select count(*) from bobby_reader_stats s join bobby_identities b on b.id = s.identity_id
                    where s.platform = 'web' and b.created_at >= since),
      'paywallViews', (select count(*) from bobby_events where event = 'paywall_view' and platform = 'web' and created_at >= since),
      'pro', (select count(*) from bobby_subscriptions where provider = 'stripe' and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now()))),
    'ios', jsonb_build_object(
      'guestReaders', (select count(*) from bobby_reader_stats where identity_id is null and platform = 'ios' and first_read_at >= since),
      'accounts', (select count(*) from bobby_reader_stats s join bobby_identities b on b.id = s.identity_id
                    where s.platform = 'ios' and b.created_at >= since),
      'paywallViews', (select count(*) from bobby_events where event = 'paywall_view' and platform = 'ios' and created_at >= since),
      'pro', (select count(*) from bobby_subscriptions where provider = 'apple' and status in ('active', 'trialing')
                and (current_period_end is null or current_period_end > now()))),
    'visitsDaily', (select coalesce(jsonb_agg(n order by g), '[]'::jsonb) from (
        select g, (select count(distinct e.device_hash) from bobby_events e where e.event = 'visit' and e.created_at >= g and e.created_at < g + interval '1 day') n
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s),
    'topSurfaces', (select coalesce(jsonb_agg(jsonb_build_object('surface', surface, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(surface, 'other') surface, count(distinct device_hash) n from bobby_events
        where event = 'visit' and created_at >= since group by 1 order by 2 desc limit 8) x),
    'topReferrers', (select coalesce(jsonb_agg(jsonb_build_object('referrer', referrer, 'visitors', n) order by n desc), '[]'::jsonb) from (
        select coalesce(referrer, utm_source, 'direct') referrer, count(distinct device_hash) n from bobby_events
        where event = 'visit' and created_at >= since group by 1 order by 2 desc limit 8) x)
  ) into funnel;

  -- Memberships: paid subscriptions and gifted Pro (referrals, admin grants).
  select jsonb_build_object(
    'active', count(*) filter (where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now())),
    'byStatus', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from bobby_subscriptions group by 1) x), '{}'::jsonb),
    'byProvider', coalesce((select jsonb_object_agg(provider, n) from (
        select provider, count(*) n from bobby_subscriptions
        where status in ('active', 'trialing') and (current_period_end is null or current_period_end > now()) group by 1) x), '{}'::jsonb),
    'giftedPro', (select count(*) from bobby_pro_grants where pro_until > now())
  ) into subs from bobby_subscriptions;

  -- Revenue from RevenueCat events (production only; sandbox apart for App Review tests).
  select jsonb_build_object(
    'grossUsd', coalesce(sum(price_usd) filter (where price_usd > 0 and prod), 0),
    'netUsd', coalesce(sum(price_usd * coalesce(takehome, 0.85)) filter (where price_usd > 0 and prod), 0),
    'refundsUsd', coalesce(-sum(price_usd) filter (where price_usd < 0 and prod), 0),
    'newSubscriptions', count(*) filter (where type = 'INITIAL_PURCHASE' and prod),
    'renewals', count(*) filter (where type = 'RENEWAL' and prod),
    'cancellations', count(*) filter (where type = 'CANCELLATION' and prod),
    'expirations', count(*) filter (where type = 'EXPIRATION' and prod),
    'sandboxEvents', count(*) filter (where not prod),
    'daily', (select coalesce(jsonb_agg(v order by g), '[]'::jsonb) from (
        select g, coalesce((select sum(p.price_usd) from bobby_purchase_events p
          where p.price_usd > 0 and coalesce(p.environment, 'PRODUCTION') = 'PRODUCTION' and p.event_at >= g and p.event_at < g + interval '1 day'), 0) v
        from generate_series(since, date_trunc('day', now()), interval '1 day') g) s)
  ) into revenue
  from (select *, coalesce(environment, 'PRODUCTION') = 'PRODUCTION' as prod from bobby_purchase_events where event_at >= since) p;

  -- LLM spend from the cost ledger and the estimated credit left per provider.
  select jsonb_build_object(
    'providers', (select jsonb_object_agg(p, jsonb_build_object(
        'today', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at >= date_trunc('day', now())),
        'week', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '7 days'),
        'month', (select coalesce(sum(usd), 0) from bobby_llm_usage where provider = p and created_at > now() - interval '30 days'),
        'calls', (select count(*) from bobby_llm_usage where provider = p and created_at >= since),
        'failures', (select count(*) from bobby_llm_usage where provider = p and created_at >= since and not ok),
        'balanceMark', (select jsonb_build_object('amount', amount_usd, 'at', created_at) from bobby_llm_credit_marks
                          where provider = p and kind = 'balance' order by created_at desc limit 1),
        'estimatedLeft', (select m.amount_usd
            + coalesce((select sum(t.amount_usd) from bobby_llm_credit_marks t where t.provider = p and t.kind = 'topup' and t.created_at > m.created_at), 0)
            - coalesce((select sum(u.usd) from bobby_llm_usage u where u.provider = p and u.created_at > m.created_at), 0)
            from bobby_llm_credit_marks m where m.provider = p and m.kind = 'balance' order by m.created_at desc limit 1),
        'lastCreditAlert', (select updated_at from api_cache where cache_key = 'provider-credit-alert:' || p)))
      from unnest(array['anthropic', 'openai']) p),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('anthropic', a, 'openai', o) order by g), '[]'::jsonb) from (
        select g,
          coalesce(sum(u.usd) filter (where u.provider = 'anthropic'), 0) a, coalesce(sum(u.usd) filter (where u.provider = 'openai'), 0) o
        from generate_series(since, date_trunc('day', now()), interval '1 day') g
        left join bobby_llm_usage u on u.created_at >= g and u.created_at < g + interval '1 day' group by g) s)
  ) into llm;

  select jsonb_build_object(
    'active', (select count(*) from bobby_coupons where active and (expires_at is null or expires_at > now())),
    'redemptions', (select count(*) from bobby_coupon_redemptions where created_at >= since),
    'giftedReadsLeft', (select coalesce(sum(reads), 0) from bobby_usage_bonus)
  ) into coupons;

  return jsonb_build_object('days', days, 'since', since, 'accounts', accounts, 'activity', activity, 'funnel', funnel,
    'subscriptions', subs, 'revenue', revenue, 'llm', llm, 'coupons', coupons);
end;
$$;

-- Accounts for the users table: lifecycle (created, first read, last seen), plan and gifts. p_query matches the
-- email or the id; newest first.
create or replace function public.bobby_admin_users(p_query text, p_limit int, p_offset int)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with q as (select nullif(trim(coalesce(p_query, '')), '') as q),
  rows as (
    select b.id, b.email, b.provider, b.wallet_address is not null and b.auth_user_id is null as wallet_only,
      b.created_at, b.last_seen_at,
      s.first_read_at, s.last_read_at, s.reads, s.platform,
      round(extract(epoch from (s.first_read_at - b.created_at)) / 60) as activation_minutes,
      sub.provider as sub_provider, sub.status as sub_status, sub.current_period_end,
      g.pro_until, g.source as grant_source,
      bonus.reads as bonus_reads, bonus.profundo as bonus_profundo, bonus.maximo as bonus_maximo,
      exists (select 1 from bobby_admins a where a.identity_id = b.id) as is_admin,
      bobby_is_pro(b.id) as pro
    from bobby_identities b
    left join bobby_reader_stats s on s.reader = 'a:' || b.id::text
    left join bobby_subscriptions sub on sub.identity_id = b.id
    left join bobby_pro_grants g on g.identity_id = b.id
    left join bobby_usage_bonus bonus on bonus.identity_id = b.id, q
    where q.q is null or b.email ilike '%' || q.q || '%' or b.id::text = q.q
  )
  select jsonb_build_object(
    'total', (select count(*) from rows),
    'users', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (
      select * from rows order by created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) r), '[]'::jsonb));
$$;

-- Pro days can now also come from the dashboard.
alter table public.bobby_pro_grants drop constraint if exists bobby_pro_grants_source_check;
alter table public.bobby_pro_grants add constraint bobby_pro_grants_source_check check (source in ('referral', 'admin'));

-- A gift from the dashboard to one account: extra uses (stacked on bobby_usage_bonus) and/or Bobby Pro days
-- (bobby_pro_grants, source 'admin', added after any gift still running).
create or replace function public.bobby_admin_grant(p_identity uuid, p_reads int, p_profundo int, p_maximo int, p_pro_days int)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare r int := coalesce(p_reads, 0); pf int := coalesce(p_profundo, 0); mx int := coalesce(p_maximo, 0); pd int := coalesce(p_pro_days, 0);
  b public.bobby_usage_bonus%rowtype; until timestamptz;
begin
  if r not between 0 and 1000 or pf not between 0 and 200 or mx not between 0 and 100 or pd not between 0 and 366 then
    raise exception 'grant out of range';
  end if;
  if r + pf + mx + pd = 0 then raise exception 'empty grant'; end if;
  if not exists (select 1 from bobby_identities where id = p_identity) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if r + pf + mx > 0 then
    insert into bobby_usage_bonus as u (identity_id, reads, profundo, maximo) values (p_identity, r, pf, mx)
      on conflict (identity_id) do update set reads = least(u.reads + excluded.reads, 100000),
        profundo = least(u.profundo + excluded.profundo, 100000), maximo = least(u.maximo + excluded.maximo, 100000), updated_at = now()
      returning * into b;
  end if;
  if pd > 0 then
    insert into bobby_pro_grants as g (identity_id, pro_until, source) values (p_identity, now() + make_interval(days => pd), 'admin')
      on conflict (identity_id) do update set pro_until = greatest(g.pro_until, now()) + make_interval(days => pd), updated_at = now()
      returning pro_until into until;
  end if;
  return jsonb_build_object('ok', true, 'bonus', case when b.identity_id is null then null
    else jsonb_build_object('reads', b.reads, 'profundo', b.profundo, 'maximo', b.maximo) end, 'proUntil', until);
end;
$$;

revoke all on function public.bobby_admin_grant(uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.bobby_admin_grant(uuid, int, int, int, int) to service_role;
revoke all on function public.bobby_track_reader() from public, anon, authenticated;
revoke all on function public.bobby_admin_overview(int) from public, anon, authenticated;
revoke all on function public.bobby_admin_users(text, int, int) from public, anon, authenticated;
grant execute on function public.bobby_admin_overview(int) to service_role;
grant execute on function public.bobby_admin_users(text, int, int) to service_role;

-- The owner's accounts (anthonysurfermx@ and anthochavez.ra@, both Google), when present.
insert into public.bobby_admins (identity_id, note)
select id, 'owner' from public.bobby_identities
where id in ('e2f665c2-6a6e-40b2-94c8-910a9fcd7e72', 'c82cf1fc-0b5d-4e43-acb6-99ecf315292b')
on conflict (identity_id) do nothing;
