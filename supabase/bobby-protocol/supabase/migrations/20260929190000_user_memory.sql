-- Per-user memory (2026-09-29): what an Apple/Google account asked about, and the preferences it set itself.
--   · bobby_user_assets: one row per (account, asset symbol): how many times it was asked about, when first and
--     last, and the horizon the last question named (detected from its words, 'unspecified' when none).
--     Never the question itself, never an answer, never a price or a position.
--   · bobby_user_prefs: horizon / experience / risk, ONLY as the person set them in the profile (null = not
--     set; nothing here is ever inferred), and memory_enabled, the switch that pauses recording and use.
-- Only identities with an auth_user_id (an Apple/Google account) are ever recorded; wallet-only identities and
-- anonymous devices have no memory. Retention: rows untouched for 90 days are excluded from every read and
-- swept on every recorded ask (like bobby_reads); at most 50 assets per account, the lowest decayed score
-- asks·e^(−days/30) dropped first. Deleting the identity (/api/account) cascades both tables.
-- Every table and function is service-only. Supabase's default privileges hand ALL on new relations to anon and
-- authenticated, and `revoke ... from public` does not remove them (20260928210000), so both roles are revoked
-- by name.

create table if not exists public.bobby_user_assets (
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.^=-]{1,20}$'),
  asks int not null default 1 check (asks > 0),
  first_asked_at timestamptz not null default now(),
  last_asked_at timestamptz not null default now(),
  last_horizon text not null default 'unspecified' check (last_horizon in ('intraday', 'week', 'month', 'long', 'unspecified')),
  -- The last 20 ask times, newest first: enough to say "second time this week", nothing more.
  recent_asks timestamptz[] not null default '{}',
  primary key (identity_id, symbol)
);
alter table public.bobby_user_assets add column if not exists recent_asks timestamptz[] not null default '{}';
create index if not exists bobby_user_assets_last_idx on public.bobby_user_assets (last_asked_at);

create table if not exists public.bobby_user_prefs (
  identity_id uuid primary key references public.bobby_identities(id) on delete cascade,
  horizon text check (horizon in ('intraday', 'week', 'month', 'long')),
  experience text check (experience in ('new', 'some', 'experienced')),
  risk text check (risk in ('low', 'medium', 'high')),
  memory_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.bobby_user_assets enable row level security;
alter table public.bobby_user_prefs enable row level security;
revoke all on public.bobby_user_assets, public.bobby_user_prefs from public, anon, authenticated;
grant all on public.bobby_user_assets, public.bobby_user_prefs to service_role;

-- Record one answered ask (called after a successful desk read, never before). A no-op, returning false, for an
-- identity without an Apple/Google account, a paused memory or a malformed symbol.
create or replace function public.bobby_memory_record(p_identity uuid, p_symbol text, p_horizon text)
returns boolean language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare h text := case when p_horizon in ('intraday', 'week', 'month', 'long') then p_horizon else 'unspecified' end;
begin
  if p_identity is null or p_symbol is null or p_symbol !~ '^[A-Z0-9.^=-]{1,20}$' then return false; end if;
  if not exists (select 1 from bobby_identities where id = p_identity and auth_user_id is not null) then return false; end if;
  if exists (select 1 from bobby_user_prefs where identity_id = p_identity and not memory_enabled) then return false; end if;

  insert into bobby_user_assets as a (identity_id, symbol, asks, first_asked_at, last_asked_at, last_horizon, recent_asks)
    values (p_identity, p_symbol, 1, now(), now(), h, array[now()])
    on conflict (identity_id, symbol) do update
      set asks = least(a.asks + 1, 1000000), last_asked_at = now(), last_horizon = excluded.last_horizon,
          recent_asks = (array[now()] || a.recent_asks)[1:20];

  -- Retention: this account's stale rows, plus a bounded sweep of everyone's.
  delete from bobby_user_assets where identity_id = p_identity and last_asked_at < now() - interval '90 days';
  delete from bobby_user_assets where (identity_id, symbol) in (
    select identity_id, symbol from bobby_user_assets where last_asked_at < now() - interval '90 days'
    limit 500 for update skip locked);

  -- Cap: the asset just asked about always stays; of the rest, the 49 with the highest decayed score.
  delete from bobby_user_assets where identity_id = p_identity and symbol in (
    select symbol from bobby_user_assets
    where identity_id = p_identity and symbol <> p_symbol
    order by asks * exp(-extract(epoch from (now() - last_asked_at)) / 86400.0 / 30.0) desc, last_asked_at desc, symbol
    offset 49);
  return true;
end;
$$;

-- What the desk reads before answering: {enabled, prefs{horizon,experience,risk}, top: up to 5 assets by
-- decayed score, thisAsset: the asked asset's row or null}. Rows older than 90 days never appear.
create or replace function public.bobby_memory_summary(p_identity uuid, p_symbol text)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare pr record; on_ boolean; top jsonb := '[]'::jsonb; this jsonb := null;
begin
  select horizon, experience, risk, memory_enabled into pr from bobby_user_prefs where identity_id = p_identity;
  on_ := p_identity is not null
    and coalesce(pr.memory_enabled, true)
    and exists (select 1 from bobby_identities where id = p_identity and auth_user_id is not null);
  if on_ then
    select coalesce(jsonb_agg(jsonb_build_object('symbol', t.symbol, 'asks', t.asks, 'lastAskedAt', t.last_asked_at, 'lastHorizon', t.last_horizon)
        order by t.score desc, t.last_asked_at desc, t.symbol), '[]'::jsonb)
      into top
      from (select symbol, asks, last_asked_at, last_horizon,
                   asks * exp(-extract(epoch from (now() - last_asked_at)) / 86400.0 / 30.0) as score
              from bobby_user_assets
             where identity_id = p_identity and last_asked_at >= now() - interval '90 days'
             order by score desc, last_asked_at desc, symbol
             limit 5) t;
    select jsonb_build_object('asks', asks, 'lastAskedAt', last_asked_at, 'lastHorizon', last_horizon,
             'asksThisWeek', (select count(*) from unnest(recent_asks) x where x >= now() - interval '7 days'))
      into this
      from bobby_user_assets
     where identity_id = p_identity and symbol = p_symbol and last_asked_at >= now() - interval '90 days';
  end if;
  return jsonb_build_object(
    'enabled', on_,
    'prefs', jsonb_build_object('horizon', pr.horizon, 'experience', pr.experience, 'risk', pr.risk),
    'top', top,
    'thisAsset', this);
end;
$$;

-- Forget one asset, or everything (every asset and the preferences). A paused memory stays paused after
-- "forget everything": the switch is the person's choice, not remembered data. Returns the assets removed.
create or replace function public.bobby_memory_forget(p_identity uuid, p_symbol text default null)
returns int language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare n int := 0;
begin
  if p_identity is null then return 0; end if;
  if p_symbol is null then
    delete from bobby_user_assets where identity_id = p_identity;
    get diagnostics n = row_count;
    delete from bobby_user_prefs where identity_id = p_identity and memory_enabled;
    update bobby_user_prefs set horizon = null, experience = null, risk = null, updated_at = now()
      where identity_id = p_identity;
  else
    delete from bobby_user_assets where identity_id = p_identity and symbol = p_symbol;
    get diagnostics n = row_count;
  end if;
  return n;
end;
$$;

revoke all on function public.bobby_memory_record(uuid, text, text) from public, anon, authenticated;
revoke all on function public.bobby_memory_summary(uuid, text) from public, anon, authenticated;
revoke all on function public.bobby_memory_forget(uuid, text) from public, anon, authenticated;
grant execute on function public.bobby_memory_record(uuid, text, text) to service_role;
grant execute on function public.bobby_memory_summary(uuid, text) to service_role;
grant execute on function public.bobby_memory_forget(uuid, text) to service_role;
