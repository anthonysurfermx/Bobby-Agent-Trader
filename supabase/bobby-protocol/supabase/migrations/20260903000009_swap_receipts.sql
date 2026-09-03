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
  -- Single-use intent id minted by the cycle; one confirmed swap per intent
  intent_jti          text,
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

create unique index if not exists bobby_swap_receipts_intent_once
  on public.bobby_swap_receipts (wallet_address, intent_jti) where intent_jti is not null;
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

-- Confirm a receipt and everything that follows from it, in ONE transaction:
-- lock the built row, flip it, upsert the agent_trades row (idempotent on the
-- tx hash), bump the cycle's counters atomically, link the trade. Re-running
-- with the same hash repairs a missing trade and answers 'already'.
create or replace function public.confirm_swap_receipt(
  p_wallet text, p_calldata_hash text, p_tx_hash text,
  p_block_number numeric, p_block_timestamp timestamptz,
  p_amount_in_raw numeric, p_amount_out_raw numeric,
  p_identity_id uuid, p_platform text,
  p_token_symbol text, p_token_address text, p_direction text,
  p_amount_usd numeric, p_entry_price numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.bobby_swap_receipts%rowtype;
  t_id uuid;
  was_confirmed boolean;
begin
  select * into r from public.bobby_swap_receipts
   where wallet_address = lower(p_wallet) and calldata_hash = p_calldata_hash
   for update;
  if not found then
    return jsonb_build_object('outcome', 'unbuilt');
  end if;
  was_confirmed := (r.status = 'confirmed');
  if was_confirmed and r.tx_hash is distinct from lower(p_tx_hash) then
    return jsonb_build_object('outcome', 'conflict', 'id', r.id);
  end if;
  if not was_confirmed then
    update public.bobby_swap_receipts
       set status = 'confirmed', tx_hash = lower(p_tx_hash), block_number = p_block_number,
           block_timestamp = p_block_timestamp, amount_out_raw = p_amount_out_raw, confirmed_at = now(),
           identity_id = coalesce(p_identity_id, identity_id), platform = coalesce(p_platform, platform)
     where id = r.id;
  end if;
  select id into t_id from public.agent_trades where idempotency_key = 'swap:' || lower(p_tx_hash);
  if t_id is null then
    -- A SELL realizes; it is not a position to score, so it is settled at once
    -- (no outcome). Exposure is read from the wallet's on-chain balances, never from these rows.
    insert into public.agent_trades
      (cycle_id, chain, token_address, token_symbol, direction, amount_usd, entry_price, tx_hash, status,
       signal_sources, owner_address, user_id, idempotency_key, expires_at, settled_at)
    values
      (r.cycle_id, 'base', p_token_address, p_token_symbol, p_direction, p_amount_usd, p_entry_price, lower(p_tx_hash), 'confirmed',
       array['base-swap', 'uniswap-v3-swaprouter02'], lower(p_wallet), coalesce(p_identity_id, r.identity_id), 'swap:' || lower(p_tx_hash), now() + interval '48 hours',
       case when p_direction = 'SELL' then now() else null end)
    returning id into t_id;
    if r.cycle_id is not null then
      update public.agent_cycles
         set trades_executed = coalesce(trades_executed, 0) + 1,
             total_usd_deployed = coalesce(total_usd_deployed, 0) + p_amount_usd
       where id = r.cycle_id;
    end if;
  end if;
  update public.bobby_swap_receipts set agent_trade_id = t_id where id = r.id and agent_trade_id is distinct from t_id;
  return jsonb_build_object('outcome', case when was_confirmed then 'already' else 'confirmed' end, 'id', r.id, 'trade_id', t_id);
end;
$$;

revoke all on function public.confirm_swap_receipt(text, text, text, numeric, timestamptz, numeric, numeric, uuid, text, text, text, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.confirm_swap_receipt(text, text, text, numeric, timestamptz, numeric, numeric, uuid, text, text, text, text, numeric, numeric) to service_role;
