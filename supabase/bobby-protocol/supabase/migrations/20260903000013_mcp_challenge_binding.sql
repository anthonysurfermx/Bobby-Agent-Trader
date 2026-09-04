-- ============================================================
-- BP-08 (2026-09-04 review): a public transaction hash is payment EVIDENCE,
-- not a private redemption credential. A challenge is now bound to the client
-- that obtained it (a secret returned once, stored hashed) and to the exact
-- request it was issued for (canonical hash of tool + arguments), and it
-- carries a fulfilment lifecycle so a tool failure never costs a second payment.
-- ============================================================

alter table public.mcp_payment_challenges add column if not exists client_secret_hash text;
alter table public.mcp_payment_challenges add column if not exists result_json jsonb;
alter table public.mcp_payment_challenges add column if not exists error text;
alter table public.mcp_payment_challenges add column if not exists attempts integer not null default 0;
alter table public.mcp_payment_challenges add column if not exists completed_at timestamptz;

-- pending → in_progress (claimed by the bound client) → completed | retryable_failure (→ in_progress again on retry)
alter table public.mcp_payment_challenges drop constraint if exists mcp_payment_challenges_status_check;
alter table public.mcp_payment_challenges add constraint mcp_payment_challenges_status_check
  check (status in ('pending', 'consumed', 'expired', 'in_progress', 'completed', 'retryable_failure'));

create index if not exists idx_challenges_in_progress on public.mcp_payment_challenges (consumed_at) where status = 'in_progress';
