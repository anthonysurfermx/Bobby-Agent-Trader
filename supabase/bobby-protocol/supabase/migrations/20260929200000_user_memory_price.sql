-- Memory callbacks (2026-09-29): the asset's price at the last ask, so Bobby can say "you asked me about AMZN on
-- Monday; since then it is up 15%". The server computes the change from this price and the evidence's price;
-- the model only quotes it. A market price is not personal data; the rest of 20260929190000 is unchanged.
alter table public.bobby_user_assets add column if not exists last_price numeric check (last_price > 0);

drop function if exists public.bobby_memory_record(uuid, text, text);
create or replace function public.bobby_memory_record(p_identity uuid, p_symbol text, p_horizon text, p_price numeric default null)
returns boolean language plpgsql volatile security invoker set search_path = public, pg_temp as $$
declare h text := case when p_horizon in ('intraday', 'week', 'month', 'long') then p_horizon else 'unspecified' end;
  px numeric := case when p_price > 0 and p_price < 1e12 then p_price else null end;
begin
  if p_identity is null or p_symbol is null or p_symbol !~ '^[A-Z0-9.^=-]{1,20}$' then return false; end if;
  if not exists (select 1 from bobby_identities where id = p_identity and auth_user_id is not null) then return false; end if;
  if exists (select 1 from bobby_user_prefs where identity_id = p_identity and not memory_enabled) then return false; end if;

  insert into bobby_user_assets as a (identity_id, symbol, asks, first_asked_at, last_asked_at, last_horizon, recent_asks, last_price)
    values (p_identity, p_symbol, 1, now(), now(), h, array[now()], px)
    on conflict (identity_id, symbol) do update
      set asks = least(a.asks + 1, 1000000), last_asked_at = now(), last_horizon = excluded.last_horizon,
          recent_asks = (array[now()] || a.recent_asks)[1:20], last_price = coalesce(excluded.last_price, a.last_price);

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
             'asksThisWeek', (select count(*) from unnest(recent_asks) x where x >= now() - interval '7 days'),
             'lastPrice', last_price)
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


revoke all on function public.bobby_memory_record(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.bobby_memory_record(uuid, text, text, numeric) to service_role;
revoke all on function public.bobby_memory_summary(uuid, text) from public, anon, authenticated;
grant execute on function public.bobby_memory_summary(uuid, text) to service_role;
