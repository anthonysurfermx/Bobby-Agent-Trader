-- Memory v2 (2026-09-29), after the Codex acceptance review of 20260929190000/200000:
--   · bobby_user_reads: what Bobby actually answered, per delivered read: asset, horizon, level, verdict,
--     direction and the four synthesis lines the reader saw (headline, why, risk, watch), with the price the
--     read used, that price's own timestamp and source. "Last time I said X" can only quote a row from here.
--     At most 5 per (account, asset) and 50 per account (all of them visible in the memory screen), 90 days.
--   · bobby_user_assets.last_price_at: the price and its observation time are written together. A read
--     without a price clears both, so an older price is never attributed to a newer question.
--   · bobby_user_prefs.preferred_name: the name the person asked to be called, set only by an explicit
--     correction (/api/memory PATCH: the memory screen, or a message that is only "call me Anthony"). Never
--     inferred, never taken from a market question.
--   · bobby_memory_purge(): the 90-day retention as a daily pg_cron job, not only a sweep on the next ask.
--   · Ask times are kept only for the last 90 days: recent_asks holds the ask times within the window (newest
--     100) and first_asked_at is the oldest of them. asks stays a plain counter (never a time).
--   · Every write for one account (record, forget) takes a per-account advisory lock, so concurrent reads on
--     different assets cannot race the caps.
--   · bobby_memory_forget(): also forgets the stored answers (one asset, or all) and the preferred name.
-- The 4-argument bobby_memory_record and bobby_memory_summary stay until the code that calls them is gone
-- (drop them in a later migration). Every new table and function is service-only; Supabase's default
-- privileges hand ALL on new relations to anon/authenticated, so both roles are revoked by name.

alter table public.bobby_user_assets add column if not exists last_price_at timestamptz;
alter table public.bobby_user_prefs add column if not exists preferred_name text
  check (preferred_name is null or char_length(preferred_name) between 1 and 40);

create table if not exists public.bobby_user_reads (
  id bigint generated always as identity primary key,
  identity_id uuid not null references public.bobby_identities(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.^=-]{1,20}$'),
  delivered_at timestamptz not null default now(),
  horizon text not null default 'unspecified' check (horizon in ('intraday', 'week', 'month', 'long', 'unspecified')),
  level text not null default 'rapido' check (level in ('rapido', 'profundo', 'maximo')),
  verdict text not null check (verdict in ('wait', 'review')),
  direction text not null check (direction in ('long', 'short', 'none')),
  headline text not null check (char_length(headline) between 1 and 200),
  why text not null check (char_length(why) between 1 and 260),
  risk text not null check (char_length(risk) between 1 and 260),
  watch text not null check (char_length(watch) between 1 and 260),
  language text not null default 'en' check (language in ('en', 'es', 'pt')),
  price numeric check (price > 0),
  price_at timestamptz,
  price_source text check (price_source is null or char_length(price_source) <= 40),
  platform text not null default 'web' check (platform in ('web', 'ios', 'android'))
);
create index if not exists bobby_user_reads_owner_idx on public.bobby_user_reads (identity_id, symbol, delivered_at desc);
create index if not exists bobby_user_reads_age_idx on public.bobby_user_reads (delivered_at);

alter table public.bobby_user_reads enable row level security;
revoke all on public.bobby_user_reads from public, anon, authenticated;
grant all on public.bobby_user_reads to service_role;

-- Record one delivered read. False (and nothing written) for a non-account, a paused memory or a malformed
-- symbol. p_read = {verdict, direction, headline, why, risk, watch, level, language, platform}; without a
-- valid p_read only the asset row is updated.
create or replace function public.bobby_memory_record_v2(
  p_identity uuid, p_symbol text, p_horizon text, p_price numeric default null, p_price_at timestamptz default null,
  p_price_source text default null, p_read jsonb default null)
returns boolean language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare
  h text := case when p_horizon in ('intraday', 'week', 'month', 'long') then p_horizon else 'unspecified' end;
  -- A price counts only with its own time, and never from the future.
  px numeric := case when p_price > 0 and p_price < 1e12 and p_price_at is not null and p_price_at <= now() + interval '1 minute' then p_price else null end;
  pat timestamptz := case when px is not null then p_price_at else null end;
  src text := case when px is not null then left(nullif(trim(p_price_source), ''), 40) else null end;
  lang text := case when p_read->>'language' in ('en', 'es', 'pt') then p_read->>'language' else 'en' end;
  lvl text := case when p_read->>'level' in ('rapido', 'profundo', 'maximo') then p_read->>'level' else 'rapido' end;
  plat text := case when p_read->>'platform' in ('web', 'ios', 'android') then p_read->>'platform' else 'web' end;
begin
  if p_identity is null or p_symbol is null or p_symbol !~ '^[A-Z0-9.^=-]{1,20}$' then return false; end if;
  if not exists (select 1 from bobby_identities where id = p_identity and auth_user_id is not null) then return false; end if;
  -- One writer per account at a time: the caps below stay exact under concurrent reads.
  perform pg_advisory_xact_lock(hashtextextended('bobby-memory:' || p_identity::text, 0));
  if exists (select 1 from bobby_user_prefs where identity_id = p_identity and not memory_enabled) then return false; end if;

  insert into bobby_user_assets as a (identity_id, symbol, asks, first_asked_at, last_asked_at, last_horizon, recent_asks, last_price, last_price_at)
    values (p_identity, p_symbol, 1, now(), now(), h, array[now()], px, pat)
    on conflict (identity_id, symbol) do update
      set asks = least(a.asks + 1, 1000000), last_asked_at = now(), last_horizon = excluded.last_horizon,
          -- Only the last 90 days of ask times (newest 100); asks and first_asked_at follow from them below.
          recent_asks = (array[now()] || array(select x from unnest(a.recent_asks) x where x >= now() - interval '90 days' order by x desc))[1:100],
          -- Together or not at all: a read without a price clears the old one.
          last_price = excluded.last_price, last_price_at = excluded.last_price_at;
  update bobby_user_assets
     set first_asked_at = coalesce((select min(x) from unnest(recent_asks) x), last_asked_at)
   where identity_id = p_identity and symbol = p_symbol;

  if p_read is not null
     and p_read->>'verdict' in ('wait', 'review')
     and p_read->>'direction' in ('long', 'short', 'none')
     and coalesce(trim(p_read->>'headline'), '') <> '' and coalesce(trim(p_read->>'why'), '') <> ''
     and coalesce(trim(p_read->>'risk'), '') <> '' and coalesce(trim(p_read->>'watch'), '') <> '' then
    insert into bobby_user_reads (identity_id, symbol, horizon, level, verdict, direction, headline, why, risk, watch,
                                  language, price, price_at, price_source, platform)
    values (p_identity, p_symbol, h, lvl, p_read->>'verdict',
            case when p_read->>'verdict' = 'wait' then 'none' else p_read->>'direction' end,
            left(trim(p_read->>'headline'), 200), left(trim(p_read->>'why'), 260), left(trim(p_read->>'risk'), 260),
            left(trim(p_read->>'watch'), 260), lang, px, pat, src, plat);
    -- Keep the 5 newest reads per asset and 50 per account: all of them fit the memory screen.
    delete from bobby_user_reads where id in (
      select id from bobby_user_reads where identity_id = p_identity and symbol = p_symbol
      order by delivered_at desc, id desc offset 5);
    delete from bobby_user_reads where id in (
      select id from bobby_user_reads where identity_id = p_identity
      order by delivered_at desc, id desc offset 50);
  end if;

  -- Retention for this account (the daily purge covers everyone).
  delete from bobby_user_assets where identity_id = p_identity and last_asked_at < now() - interval '90 days';
  delete from bobby_user_reads where identity_id = p_identity and delivered_at < now() - interval '90 days';

  -- Cap: the asset just asked about always stays; of the rest, the 49 with the highest decayed score.
  delete from bobby_user_assets where identity_id = p_identity and symbol in (
    select symbol from bobby_user_assets
    where identity_id = p_identity and symbol <> p_symbol
    order by asks * exp(-extract(epoch from (now() - last_asked_at)) / 86400.0 / 30.0) desc, last_asked_at desc, symbol
    offset 49);
  -- An asset dropped by the cap takes its answers with it.
  delete from bobby_user_reads r where r.identity_id = p_identity
    and not exists (select 1 from bobby_user_assets a where a.identity_id = r.identity_id and a.symbol = r.symbol);
  return true;
end;
$$;

-- The v1 recorder, still called by the code deployed before this migration, now goes through v2 without its
-- price: the ask is counted and any older price is cleared.
create or replace function public.bobby_memory_record(p_identity uuid, p_symbol text, p_horizon text, p_price numeric default null)
returns boolean language sql volatile security invoker set search_path = public, pg_temp as $$
  -- The old code has no observation time for its price, so none is kept (a made-up time would pass for a real one).
  select public.bobby_memory_record_v2(p_identity, p_symbol, p_horizon, null, null, null, null);
$$;

-- What the desk reads before answering. Adds to v1: preferredName, the price's own time, the last 20 ask times
-- (the server counts "this week" in the reader's calendar and time zone) and lastRead, the newest stored answer
-- on this asset. Nothing older than 90 days appears.
create or replace function public.bobby_memory_summary_v2(p_identity uuid, p_symbol text)
returns jsonb language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare pr record; on_ boolean; top jsonb := '[]'::jsonb; this jsonb := null; lastread jsonb := null;
begin
  select horizon, experience, risk, memory_enabled, preferred_name into pr from bobby_user_prefs where identity_id = p_identity;
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
             'recentAsks', to_jsonb(recent_asks), 'lastPrice', last_price, 'lastPriceAt', last_price_at)
      into this
      from bobby_user_assets
     where identity_id = p_identity and symbol = p_symbol and last_asked_at >= now() - interval '90 days';
    select jsonb_build_object('deliveredAt', delivered_at, 'horizon', horizon, 'level', level, 'verdict', verdict,
             'direction', direction, 'headline', headline, 'why', why, 'risk', risk, 'watch', watch, 'language', language,
             'price', price, 'priceAt', price_at)
      into lastread
      from bobby_user_reads
     where identity_id = p_identity and symbol = p_symbol and delivered_at >= now() - interval '90 days'
     order by delivered_at desc, id desc
     limit 1;
  end if;
  return jsonb_build_object(
    'enabled', on_,
    'preferredName', case when on_ then pr.preferred_name else null end,
    'prefs', jsonb_build_object('horizon', pr.horizon, 'experience', pr.experience, 'risk', pr.risk),
    'top', top,
    'thisAsset', this,
    'lastRead', lastread);
end;
$$;

-- Forget one asset (its row and its stored answers) or everything (every asset, every answer, the preferences
-- and the preferred name). A paused memory stays paused. Returns the assets removed.
create or replace function public.bobby_memory_forget(p_identity uuid, p_symbol text default null)
returns int language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare n int := 0;
begin
  if p_identity is null then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('bobby-memory:' || p_identity::text, 0));
  if p_symbol is null then
    delete from bobby_user_assets where identity_id = p_identity;
    get diagnostics n = row_count;
    delete from bobby_user_reads where identity_id = p_identity;
    delete from bobby_user_prefs where identity_id = p_identity and memory_enabled;
    update bobby_user_prefs set horizon = null, experience = null, risk = null, preferred_name = null, updated_at = now()
      where identity_id = p_identity;
  else
    delete from bobby_user_assets where identity_id = p_identity and symbol = p_symbol;
    get diagnostics n = row_count;
    delete from bobby_user_reads where identity_id = p_identity and symbol = p_symbol;
  end if;
  return n;
end;
$$;

-- The 90-day retention for everyone, daily. Returns what it removed.
create or replace function public.bobby_memory_purge()
returns jsonb language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare a int; r int;
begin
  delete from bobby_user_assets where last_asked_at < now() - interval '90 days';
  get diagnostics a = row_count;
  -- Ask times older than the window leave the assets that stay, and first_asked_at follows the oldest kept.
  update bobby_user_assets
     set recent_asks = array(select x from unnest(recent_asks) x where x >= now() - interval '90 days' order by x desc),
         first_asked_at = coalesce((select min(x) from unnest(recent_asks) x where x >= now() - interval '90 days'), last_asked_at)
   where first_asked_at < now() - interval '90 days';
  delete from bobby_user_reads where delivered_at < now() - interval '90 days';
  get diagnostics r = row_count;
  return jsonb_build_object('assets', a, 'reads', r);
end;
$$;

revoke all on function public.bobby_memory_record_v2(uuid, text, text, numeric, timestamptz, text, jsonb) from public, anon, authenticated;
revoke all on function public.bobby_memory_summary_v2(uuid, text) from public, anon, authenticated;
revoke all on function public.bobby_memory_forget(uuid, text) from public, anon, authenticated;
revoke all on function public.bobby_memory_purge() from public, anon, authenticated;
grant execute on function public.bobby_memory_record_v2(uuid, text, text, numeric, timestamptz, text, jsonb) to service_role;
grant execute on function public.bobby_memory_summary_v2(uuid, text) to service_role;
grant execute on function public.bobby_memory_forget(uuid, text) to service_role;
grant execute on function public.bobby_memory_purge() to service_role;

-- Daily at 03:17 UTC where pg_cron exists (Supabase); a scratch Postgres without it (CI) skips the schedule.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $q$select cron.unschedule(jobid) from cron.job where jobname = 'bobby-memory-purge'$q$;
    execute $q$select cron.schedule('bobby-memory-purge', '17 3 * * *', 'select public.bobby_memory_purge()')$q$;
  end if;
end;
$$;
