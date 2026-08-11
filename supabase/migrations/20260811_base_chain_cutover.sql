-- ============================================================
-- Base cutover: make chain explicit and default new rows to Base (8453).
--
-- Principle: history is preserved, never rewritten. Existing rows keep
-- chain_id 196 because those events genuinely happened on X Layer — the
-- protocol's whole claim is that the record is not edited in hindsight.
-- Only the DEFAULT changes, so rows written after the cutover land on Base.
--
-- Idempotent: safe to re-run.
-- ============================================================

-- ── 1. Tables that already carry chain_id: flip the default only ──

alter table if exists public.hardness_agent_proofs
  alter column chain_id set default 8453;

alter table if exists public.trade_intents
  alter column chain_id set default 8453;

-- ── 2. Tables that record on-chain activity but never tracked the chain ──
-- Backfilled to 196: every existing row predates the cutover, so labelling
-- them X Layer is the factually correct reading, not a guess.

alter table if exists public.agent_trades
  add column if not exists chain_id integer not null default 8453;

alter table if exists public.agent_cycles
  add column if not exists chain_id integer not null default 8453;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'agent_trades' and column_name = 'chain_id') then
    update public.agent_trades set chain_id = 196 where created_at < '2026-08-11'::timestamptz;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'agent_cycles' and column_name = 'chain_id') then
    update public.agent_cycles set chain_id = 196 where created_at < '2026-08-11'::timestamptz;
  end if;
end $$;

-- ── 3. Guard rail: only chains the protocol actually deploys to ──
-- 196 X Layer (legacy) · 8453 Base · 84532 Base Sepolia.
-- A typo'd chain id is otherwise indistinguishable from real data.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trade_intents_chain_id_known') then
    alter table public.trade_intents
      add constraint trade_intents_chain_id_known check (chain_id in (196, 8453, 84532));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'hardness_agent_proofs_chain_id_known') then
    alter table public.hardness_agent_proofs
      add constraint hardness_agent_proofs_chain_id_known check (chain_id in (196, 8453, 84532));
  end if;
end $$;

-- ── 4. Indexes: every dashboard query becomes chain-scoped after the cutover ──

create index if not exists trade_intents_chain_id_idx
  on public.trade_intents(chain_id, created_at desc);

create index if not exists hardness_agent_proofs_chain_id_idx
  on public.hardness_agent_proofs(chain_id, created_at desc);

comment on column public.trade_intents.chain_id is
  'EVM chain id. 196 = X Layer (pre-cutover history), 8453 = Base (current).';
