-- Paid model calls must be bounded across all server instances.
create table if not exists public.bobby_desk_quotas (
  key text primary key,
  hits integer not null,
  expires_at timestamptz not null
);
alter table public.bobby_desk_quotas enable row level security;
revoke all on public.bobby_desk_quotas from public, anon, authenticated;
grant all on public.bobby_desk_quotas to service_role;

create or replace function public.bobby_consume_desk_quota(p_caller text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare k text; n integer; ceiling integer;
begin
  if length(p_caller) < 8 or length(p_caller) > 128 then raise exception 'invalid caller'; end if;
  -- Caller first prevents a blocked caller from consuming the global budget.
  foreach k in array array['caller:' || p_caller, 'global'] loop
    ceiling := case when k = 'global' then 600 else 30 end;
    insert into bobby_desk_quotas(key,hits,expires_at) values(k,1,now()+interval '24 hours')
    on conflict(key) do update set
      hits = case when bobby_desk_quotas.expires_at <= now() then 1 else least(ceiling+1,bobby_desk_quotas.hits+1) end,
      expires_at = case when bobby_desk_quotas.expires_at <= now() then now()+interval '24 hours' else bobby_desk_quotas.expires_at end
    returning hits into n;
    if n > ceiling then return false; end if;
  end loop;
  delete from bobby_desk_quotas where expires_at < now()-interval '1 day';
  return true;
end;
$$;
revoke all on function public.bobby_consume_desk_quota(text) from public, anon, authenticated;
grant execute on function public.bobby_consume_desk_quota(text) to service_role;
