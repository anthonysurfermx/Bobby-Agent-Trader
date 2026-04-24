-- ============================================================
-- Bobby V3 — P0 schema migration
-- Date: 2026-04-24
-- Plan: .ai/decisions/2026-04-24_bobby-v3-plan-FINAL.md §3
--
-- Adds: ownership (user_id, owner_address), state-machine persistence,
-- idempotency keys, cost instrumentation (llm_calls), transition log,
-- and agent_memory schema (G.A.M.E-inspired).
--
-- IMPORTANT:
--   1) Do NOT apply blind. Review with team first.
--   2) RLS policies intentionally NOT changed in this migration —
--      follow-up migration adds per-user RLS after backfill of user_id/owner_address.
--   3) Safe to apply in stages — every statement is idempotent.
-- ============================================================

-- ── 1. Ownership + state + idempotency on agent_cycles ──
alter table if exists agent_cycles
  add column if not exists user_id uuid,
  add column if not exists owner_address text,
  add column if not exists state text default 'IDLE',
  add column if not exists state_version int default 1,
  add column if not exists idempotency_key text,
  add column if not exists locked_until timestamptz,
  add column if not exists cost_tokens int default 0,
  add column if not exists cost_usd numeric(12,6) default 0;

-- ── 2. Ownership + intent linkage on agent_trades ──
alter table if exists agent_trades
  add column if not exists user_id uuid,
  add column if not exists owner_address text,
  add column if not exists intent_hash text,
  add column if not exists idempotency_key text,
  add column if not exists cio_signature text,
  add column if not exists arbiter_signature text;

-- ── 3. Idempotency uniqueness (partial unique — only enforced when key set) ──
create unique index if not exists agent_cycles_idem_uidx
  on agent_cycles(idempotency_key) where idempotency_key is not null;
create unique index if not exists agent_trades_idem_uidx
  on agent_trades(idempotency_key) where idempotency_key is not null;

-- ── 4. Performance indexes ──
-- NOTE: agent_cycles has `started_at` (not `created_at`); agent_trades has `created_at`.
-- Verified via PostgREST introspection 2026-04-24 against project egpixaunlnzauztbrnuz.
create index if not exists agent_cycles_state_started_idx
  on agent_cycles(state, started_at desc);
create index if not exists agent_trades_symbol_created_idx
  on agent_trades(token_symbol, created_at desc);
create index if not exists forum_threads_dir_status_created_idx
  on forum_threads(direction, status, created_at desc);

-- ── 5. LLM cost instrumentation ──
create table if not exists llm_calls (
  id bigserial primary key,
  cycle_id uuid,
  provider text not null,               -- 'anthropic' | 'openai' | 'deepseek'
  model text not null,                   -- e.g., 'claude-sonnet-4-6', 'gpt-4o'
  agent text,                            -- 'alpha' | 'red' | 'cio' | 'arbiter' | 'reflect' | 'evolve'
  endpoint text,                         -- 'debate/cycle', 'memory/reflect', ...
  tokens_in int,
  tokens_out int,
  cached_tokens int default 0,
  cost_usd numeric(12,6),
  cache_hit boolean default false,
  latency_ms int,
  status text,                           -- 'ok' | 'error' | 'timeout'
  error text,
  created_at timestamptz default now()
);
-- NOTE: no date_trunc in index (not IMMUTABLE on timestamptz).
-- Queries grouping by day use range scan on (model, created_at) + hash aggregate.
create index if not exists llm_calls_model_created_idx
  on llm_calls(model, created_at desc);
create index if not exists llm_calls_cycle_idx
  on llm_calls(cycle_id);
create index if not exists llm_calls_agent_idx
  on llm_calls(agent, created_at desc);

-- ── 6. State transition log (for resumable cycles + audit trail) ──
create table if not exists cycle_transitions (
  id bigserial primary key,
  cycle_id uuid not null,
  from_state text,
  to_state text not null,
  payload jsonb,
  actor text,                            -- 'system' | 'cron' | 'user:<id>' | 'arbiter'
  created_at timestamptz default now()
);
create index if not exists cycle_transitions_cycle_idx
  on cycle_transitions(cycle_id, created_at);

-- ── 7. Agent memory (G.A.M.E-inspired, pgvector) ──
-- NOTE: extension must be enabled in Supabase project dashboard first.
create extension if not exists vector;

create table if not exists agent_memory (
  id bigserial primary key,
  agent text not null,                   -- 'alpha' | 'red' | 'cio' | 'arbiter' | 'system'
  user_id uuid,
  owner_address text,
  memory_type text not null check (
    memory_type in ('experience','reflection','preference','mistake','playbook','evolution','metacog')
  ),
  content text not null,
  embedding vector(1536),
  importance smallint default 5 check (importance between 1 and 10),
  source_cycle_id uuid,
  tags text[] default '{}',
  decay_after timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists agent_memory_agent_type_imp_idx
  on agent_memory(agent, memory_type, importance desc, created_at desc);
create index if not exists agent_memory_embedding_idx
  on agent_memory using ivfflat (embedding vector_cosine_ops);

-- ── 8. Intent escrow mirror (off-chain cache of on-chain state) ──
create table if not exists trade_intents (
  id bigserial primary key,
  intent_hash text unique not null,      -- keccak256 of EIP-712 struct
  cycle_id uuid,
  user_id uuid,
  owner_address text,
  chain_id int not null default 196,     -- X Layer
  symbol text not null,
  direction text not null check (direction in ('long','short')),
  size_usd numeric(16,2),
  entry_ref numeric(32,8),
  slippage_max_bps int,
  treasury text,
  nonce bigint,
  expires_at timestamptz,
  cio_signature text,
  arbiter_signature text,
  verification_status text default 'pending'
    check (verification_status in ('pending','approved','rejected','expired','executed','failed')),
  rejection_reason text,
  commit_tx_hash text,
  verify_tx_hash text,
  execute_tx_hash text,
  resolve_tx_hash text,
  attestation_id text,                   -- EAS attestation UID
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists trade_intents_status_idx on trade_intents(verification_status, created_at desc);
create index if not exists trade_intents_owner_idx on trade_intents(owner_address, created_at desc);

-- ============================================================
-- Follow-ups (separate migrations, NOT in this file):
--   - 20260425_bobby_v3_rls.sql   → per-user RLS policies after backfill
--   - 20260426_bobby_v3_backfill.sql → backfill user_id/owner_address from existing data
-- ============================================================
