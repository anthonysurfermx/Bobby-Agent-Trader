-- One on-chain commitment may authorize at most one Bobby OKX order.
-- This is deliberately a separate append-only execution ledger: the market
-- order and the EVM commitment live in different systems and must never be
-- joined by a caller-controlled boolean or an indefinitely replayable payload.

create table if not exists public.trade_execution_claims (
  debate_hash text primary key check (debate_hash ~ '^0x[0-9a-f]{64}$'),
  chain_id integer not null check (chain_id in (196, 8453, 84532)),
  symbol text not null check (symbol ~ '^[A-Z0-9]{2,12}$'),
  direction text not null check (direction in ('long', 'short')),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  client_order_id text not null unique check (client_order_id ~ '^[A-Za-z0-9]{1,32}$'),
  claim_token uuid not null unique,
  status text not null check (status in ('claimed', 'submitted', 'failed')),
  okx_order_id text,
  last_error text,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz generated always as (
    case when status = 'submitted' then updated_at else null end
  ) stored,
  constraint submitted_claim_has_order check (status <> 'submitted' or okx_order_id is not null)
);

alter table public.trade_execution_claims enable row level security;
revoke all on table public.trade_execution_claims from anon, authenticated;
grant select, insert, update on table public.trade_execution_claims to service_role;

create index if not exists trade_execution_claims_status_idx
  on public.trade_execution_claims(status, claimed_at desc);

comment on table public.trade_execution_claims is
  'Permanent one-time consumption ledger binding a TrackRecord debate hash to one OKX order intent.';

-- Read-only from the caller's perspective: the function exercises a complete
-- insert/update/delete round trip inside one database call and leaves no row.
-- It also reports the grants/RLS posture required by the production helper.
create or replace function public.verify_trade_execution_claims_gate()
returns table (
  rls_enabled boolean,
  anon_denied boolean,
  authenticated_denied boolean,
  service_privileges boolean,
  round_trip boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  suffix text := md5(clock_timestamp()::text || random()::text);
  test_hash text := '0x' || suffix || suffix;
  payload text := suffix || suffix;
  test_client_order_id text := 'Preflight' || substring(suffix from 1 for 23);
  updated_rows integer := 0;
begin
  insert into public.trade_execution_claims (
    debate_hash, chain_id, symbol, direction, payload_hash,
    client_order_id, claim_token, status
  ) values (
    test_hash, 8453, 'BTC', 'long', payload,
    test_client_order_id, gen_random_uuid(), 'claimed'
  );

  update public.trade_execution_claims
  set status = 'submitted', okx_order_id = 'preflight', updated_at = now()
  where debate_hash = test_hash and status = 'claimed';
  get diagnostics updated_rows = row_count;

  delete from public.trade_execution_claims where debate_hash = test_hash;

  return query select
    (select relrowsecurity from pg_class where oid = 'public.trade_execution_claims'::regclass),
    not has_table_privilege('anon', 'public.trade_execution_claims', 'SELECT')
      and not has_table_privilege('anon', 'public.trade_execution_claims', 'INSERT')
      and not has_table_privilege('anon', 'public.trade_execution_claims', 'UPDATE')
      and not has_table_privilege('anon', 'public.trade_execution_claims', 'DELETE'),
    not has_table_privilege('authenticated', 'public.trade_execution_claims', 'SELECT')
      and not has_table_privilege('authenticated', 'public.trade_execution_claims', 'INSERT')
      and not has_table_privilege('authenticated', 'public.trade_execution_claims', 'UPDATE')
      and not has_table_privilege('authenticated', 'public.trade_execution_claims', 'DELETE'),
    has_table_privilege('service_role', 'public.trade_execution_claims', 'SELECT')
      and has_table_privilege('service_role', 'public.trade_execution_claims', 'INSERT')
      and has_table_privilege('service_role', 'public.trade_execution_claims', 'UPDATE'),
    updated_rows = 1 and not exists (
      select 1 from public.trade_execution_claims where debate_hash = test_hash
    );
end;
$$;

revoke all on function public.verify_trade_execution_claims_gate() from public, anon, authenticated;
grant execute on function public.verify_trade_execution_claims_gate() to service_role;
