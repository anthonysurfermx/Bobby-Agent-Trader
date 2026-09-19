-- Bound what one network can take from the shared daily desk budget.
--
-- 20260919190000 keys callers by full client address only: 20 addresses at
-- 30 a day spend the 600 global analyses for everyone, and a single IPv6 host
-- can mint unlimited addresses inside its /64. The API now sends two salted
-- hashes (api/_lib/rate-limit.ts getClientQuotaKeys; no address reaches the
-- database):
--   · p_caller  — an IPv4 address or an IPv6 /64 ............ 30 a day
--   · p_network — the IPv4 /24 or IPv6 /48 around it ......... 60 a day
--   · global    — everyone (unchanged) ...................... 600 a day
-- Spending the global budget now takes at least 20 callers spread over at
-- least 10 networks. A refused request consumes nothing, so a user retrying
-- while their network or the global budget is spent keeps their own
-- allowance; an exhausted key therefore holds exactly its ceiling.
-- p_network defaults to null: a caller that sends only p_caller is still
-- served (caller + global, as in 20260919190000). Apply right after
-- 20260919190000, before the API that sends p_network is deployed.

drop function if exists public.bobby_consume_desk_quota(text);

create or replace function public.bobby_consume_desk_quota(p_caller text, p_network text default null)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare k text; n integer; ceiling integer; keys text[];
begin
  if p_caller is null or length(p_caller) < 8 or length(p_caller) > 128 then raise exception 'invalid caller'; end if;
  if p_network is not null and (length(p_network) < 8 or length(p_network) > 128) then raise exception 'invalid network'; end if;
  -- Narrowest first. Any refusal rolls back every increment of this call.
  keys := array['caller:' || p_caller];
  if p_network is not null then keys := keys || ('net:' || p_network); end if;
  keys := keys || 'global'::text;
  begin
    foreach k in array keys loop
      ceiling := case when k = 'global' then 600 when k like 'net:%' then 60 else 30 end;
      insert into bobby_desk_quotas(key, hits, expires_at) values (k, 1, now() + interval '24 hours')
      on conflict (key) do update set
        hits = case when bobby_desk_quotas.expires_at <= now() then 1 else bobby_desk_quotas.hits + 1 end,
        expires_at = case when bobby_desk_quotas.expires_at <= now() then now() + interval '24 hours' else bobby_desk_quotas.expires_at end
      returning hits into n;
      if n > ceiling then raise exception using errcode = 'BQ429', message = 'desk quota exhausted'; end if;
    end loop;
  exception when sqlstate 'BQ429' then
    return false;
  end;
  delete from bobby_desk_quotas where expires_at < now() - interval '1 day';
  return true;
end;
$$;
revoke all on function public.bobby_consume_desk_quota(text, text) from public, anon, authenticated;
grant execute on function public.bobby_consume_desk_quota(text, text) to service_role;
