-- Confirmed Base swaps shared by the web and iOS identities.
-- Rows are written only by /api/swap-receipt after verifying the Base receipt
-- and router calldata. The wallet is retained even if two identity rows merge;
-- identity_id is reattached on the next authenticated read/write.

create table if not exists public.bobby_swap_receipts (
  id                  uuid primary key default gen_random_uuid(),
  identity_id         uuid references public.bobby_identities(id) on delete set null,
  wallet_address      text not null,
  chain_id            integer not null check (chain_id = 8453),
  tx_hash             text not null,
  router_address      text not null,
  token_in_address    text not null,
  token_out_address   text not null,
  token_in_symbol     text not null,
  token_out_symbol    text not null,
  amount_in_raw       numeric(78, 0) not null check (amount_in_raw > 0),
  min_amount_out_raw  numeric(78, 0) not null check (min_amount_out_raw > 0),
  block_number        numeric(78, 0) not null,
  block_timestamp     timestamptz not null,
  status              text not null default 'confirmed' check (status = 'confirmed'),
  platform            text not null check (platform in ('ios', 'web')),
  created_at          timestamptz not null default now(),
  constraint bobby_swap_receipts_wallet_lower check (wallet_address = lower(wallet_address)),
  constraint bobby_swap_receipts_once unique (chain_id, tx_hash)
);

create index if not exists bobby_swap_receipts_identity_time
  on public.bobby_swap_receipts (identity_id, block_timestamp desc);
create index if not exists bobby_swap_receipts_wallet_time
  on public.bobby_swap_receipts (wallet_address, block_timestamp desc);

alter table public.bobby_swap_receipts enable row level security;
drop policy if exists bobby_swap_receipts_service_all on public.bobby_swap_receipts;
create policy bobby_swap_receipts_service_all on public.bobby_swap_receipts
  for all to service_role using (true) with check (true);

revoke all on public.bobby_swap_receipts from anon, authenticated;
grant all on public.bobby_swap_receipts to service_role;
