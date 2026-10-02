-- A durable receipt per accepted billing event, separate from the usage-event cursor. Store webhooks can
-- arrive out of order and identities can be repaired later: neither case should skip a purchase forever.
create table if not exists public.bobby_amplitude_purchase_exports (
  event_id text primary key references public.bobby_purchase_events(id) on delete cascade,
  exported_at timestamptz not null default now()
);
alter table public.bobby_amplitude_purchase_exports enable row level security;
revoke all on public.bobby_amplitude_purchase_exports from public, anon, authenticated;
grant select, insert on public.bobby_amplitude_purchase_exports to service_role;

create or replace function public.bobby_amplitude_purchase_batch(p_limit int default 500)
returns jsonb language sql stable security invoker set search_path = public, pg_temp as $$
  with pending as (
    select p.* from bobby_purchase_events p
    where p.environment = 'PRODUCTION'
      and p.type ~ '^[A-Z_]{1,40}$'
      and length(p.id) between 1 and 80
      and isfinite(p.event_at) and isfinite(p.created_at)
      and p.identity_id is not null
      and p.identity_id not in (select bobby_internal_identity_ids())
      and p.created_at < now() - interval '10 minutes'
      and not exists (select 1 from bobby_amplitude_purchase_exports x where x.event_id = p.id)
    order by p.created_at, p.id limit least(greatest(coalesce(p_limit, 500), 1), 500)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'type', type, 'environment', environment, 'store', store, 'product', product_id,
    'identity', identity_id, 'at', event_at, 'priceUsd', price_usd, 'takehome', takehome,
    'currency', currency, 'priceLocal', price_local) order by created_at, id), '[]'::jsonb)
  from pending;
$$;

create or replace function public.bobby_amplitude_purchase_ack(p_ids text[])
returns void language sql security invoker set search_path = public, pg_temp as $$
  insert into bobby_amplitude_purchase_exports(event_id)
    select p.id from bobby_purchase_events p
    where p.id = any(p_ids) and p.environment = 'PRODUCTION' and p.identity_id is not null
      and p.identity_id not in (select bobby_internal_identity_ids())
      and p.type ~ '^[A-Z_]{1,40}$' and length(p.id) between 1 and 80
      and isfinite(p.event_at) and isfinite(p.created_at)
    on conflict(event_id) do nothing;
$$;

revoke all on function public.bobby_amplitude_purchase_batch(int) from public, anon, authenticated;
revoke all on function public.bobby_amplitude_purchase_ack(text[]) from public, anon, authenticated;
grant execute on function public.bobby_amplitude_purchase_batch(int) to service_role;
grant execute on function public.bobby_amplitude_purchase_ack(text[]) to service_role;
