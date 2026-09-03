-- Base swap receipts — every swap Bobby BUILT for a wallet (never signed):
-- quote, minimum, router, calldata hash, deadline; then, once the wallet
-- broadcast it, the receipt /api/swap-receipt verified on-chain. One row per
-- (wallet, calldata) — re-quotes produce new calldata (new deadline) and so
-- new rows; a confirmed tx_hash can appear once. Service-role only; every
-- read and write goes through /api.
create table if not exists public.swap_receipts (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null check (wallet_address = lower(wallet_address)),
  chain_id        integer not null default 8453 check (chain_id = 8453),
  engine          text not null default 'uniswap-v3-swaprouter02',
  token_in        text not null,
  token_out       text not null,
  amount_in       numeric not null,
  quoted_out      numeric not null,
  min_out         numeric not null,
  route           text not null,
  router          text not null,
  calldata_hash   text not null,
  deadline        timestamptz not null,
  status          text not null default 'built' check (status in ('built', 'confirmed', 'failed', 'expired')),
  tx_hash         text unique,
  block_number    bigint,
  amount_in_raw   numeric,
  amount_out_raw  numeric,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (wallet_address, calldata_hash)
);
create index if not exists swap_receipts_wallet_created on public.swap_receipts (wallet_address, created_at desc);
alter table public.swap_receipts enable row level security;
drop policy if exists swap_receipts_service_all on public.swap_receipts;
create policy swap_receipts_service_all on public.swap_receipts for all to service_role using (true) with check (true);
