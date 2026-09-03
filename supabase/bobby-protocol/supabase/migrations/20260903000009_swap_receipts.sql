-- Base swap receipts, shared by the web and iOS identities.
--
-- Lifecycle: /api/base-swap POST writes a 'built' row for every swap it hands
-- a wallet (quote, minimum, router, calldata hash, deadline) BEFORE the
-- wallet sees it. /api/swap-receipt then flips that row to 'confirmed' only
-- after re-reading Base: sender = session wallet, target = SwapRouter02,
-- status success, calldata hash matches. Token movements come from receipt
-- logs. One row per (wallet, calldata); a tx hash can confirm at most one
-- row. Service-role only; every read and write goes through /api.
create table if not exists public.bobby_swap_receipts (
  id                  uuid primary key default gen_random_uuid(),
  identity_id         uuid references public.bobby_identities(id) on delete set null,
  -- The agent cycle whose recommendation produced this calldata (null for manual swaps)
  cycle_id            uuid references public.agent_cycles(id) on delete set null,
  -- The agent_trades row written when the receipt confirmed (exposure, PnL, settlement)
  agent_trade_id      uuid,
  wallet_address      text not null,
  chain_id            integer not null default 8453 check (chain_id = 8453),
  engine              text not null default 'uniswap-v3-swaprouter02',
  router_address      text not null,
  token_in_address    text not null,
  token_out_address   text not null,
  token_in_symbol     text not null,
  token_out_symbol    text not null,
  amount_in_raw       numeric(78, 0) not null check (amount_in_raw > 0),
  quoted_out_raw      numeric(78, 0) not null check (quoted_out_raw > 0),
  min_amount_out_raw  numeric(78, 0) not null check (min_amount_out_raw > 0),
  route               text not null,
  calldata_hash       text not null,
  deadline            timestamptz not null,
  status              text not null default 'built' check (status in ('built', 'confirmed', 'failed', 'expired')),
  tx_hash             text,
  block_number        numeric(78, 0),
  block_timestamp     timestamptz,
  amount_out_raw      numeric(78, 0),
  platform            text not null default 'web' check (platform in ('ios', 'web')),
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now(),
  constraint bobby_swap_receipts_wallet_lower check (wallet_address = lower(wallet_address)),
  constraint bobby_swap_receipts_built_once unique (wallet_address, calldata_hash),
  constraint bobby_swap_receipts_tx_once unique (chain_id, tx_hash)
);

create index if not exists bobby_swap_receipts_identity_time
  on public.bobby_swap_receipts (identity_id, created_at desc);
create index if not exists bobby_swap_receipts_wallet_time
  on public.bobby_swap_receipts (wallet_address, created_at desc);

alter table public.bobby_swap_receipts enable row level security;
drop policy if exists bobby_swap_receipts_service_all on public.bobby_swap_receipts;
create policy bobby_swap_receipts_service_all on public.bobby_swap_receipts
  for all to service_role using (true) with check (true);

revoke all on public.bobby_swap_receipts from anon, authenticated;
grant all on public.bobby_swap_receipts to service_role;
