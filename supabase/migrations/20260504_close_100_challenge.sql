-- ============================================================
-- Bobby $100 Challenge — Formal Closure
-- Date: 2026-05-04
-- Window: 2026-03-24 19:00:00 UTC → 2026-05-04 00:00:00 UTC
--
-- Purpose: persist a single, queryable row that marks the
-- $100 Challenge as concluded so the UI, MCP tools, and any
-- agent reading the protocol state can detect the pivot.
--
-- Pivot target: OnchainOS Payments (x402) + V3 Intent Escrow.
-- ============================================================

create table if not exists protocol_milestones (
  id            text primary key,
  status        text not null,
  started_at    timestamptz,
  ended_at      timestamptz,
  outcome       text,
  next_chapter  text,
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

insert into protocol_milestones (id, status, started_at, ended_at, outcome, next_chapter, metadata)
values (
  '100_challenge',
  'concluded',
  '2026-03-24T19:00:00Z',
  '2026-05-04T00:00:00Z',
  'Capital reduced to $0.0019 from $100. 0 trades executed during the 41-day window after pre-challenge wipeout. Protocol pivots to verifiable payments and verification-as-a-service.',
  'OnchainOS Payments (x402) + V3 Intent Escrow on X Layer',
  jsonb_build_object(
    'starting_capital_usd', 100,
    'ending_equity_usd',   0.0019124531494389,
    'pre_challenge_trades', 15,
    'challenge_trades',     0,
    'reason_for_closure',   'pivot_to_verifiable_payments_rail'
  )
)
on conflict (id) do update set
  status        = excluded.status,
  ended_at      = excluded.ended_at,
  outcome       = excluded.outcome,
  next_chapter  = excluded.next_chapter,
  metadata      = excluded.metadata,
  updated_at    = now();
