-- Swap receipts — every transaction Bobby BUILT for a wallet (never signed):
-- quote, minimum, router, calldata hash, deadline, then the hash the wallet
-- broadcast. Service-role only; read through /api. One engine, one chain.
create table if not exists public.swap_receipts (
  id             uuid primary key default gen_random_uuid(),
  wallet_address text not null check (wallet_address = lower(wallet_address)),
  chain_id       integer not null default 8453 check (chain_id = 8453),
  engine         text not null default 'uniswap-v3-universal-router',
  token_in       text not null,
  token_out      text not null,
  amount_in      numeric not null,
  quoted_out     numeric not null,
  min_out        numeric not null,
  fee_tier       integer not null,
  router         text not null,
  calldata_hash  text not null,
  deadline       timestamptz not null,
  status         text not null default 'built' check (status in ('built', 'broadcast', 'confirmed', 'failed', 'expired')),
  tx_hash        text unique,
  broadcast_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists swap_receipts_wallet on public.swap_receipts (wallet_address, created_at desc);
alter table public.swap_receipts enable row level security;
drop policy if exists swap_receipts_service_all on public.swap_receipts;
create policy swap_receipts_service_all on public.swap_receipts for all to service_role using (true) with check (true);
