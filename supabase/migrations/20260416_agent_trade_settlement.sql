-- ============================================================
-- agent_trade settlement — outcome + realized PnL per trade.
-- Paired with /api/settle-trades (runs on cron) which pulls the current
-- OKX mid, compares vs entry/stop/target, and flips status to 'closed'.
-- This replaces the circuit-breaker's proxy check (which relied on
-- trades_successful never being written) with real on-chain outcomes.
-- ============================================================

-- Stop/target carried from the underlying forum_threads thesis, so
-- settle-trades can decide a winner without joining across tables.
ALTER TABLE agent_trades
  ADD COLUMN IF NOT EXISTS stop_price        numeric,
  ADD COLUMN IF NOT EXISTS target_price      numeric,
  ADD COLUMN IF NOT EXISTS exit_price        numeric,
  ADD COLUMN IF NOT EXISTS outcome           text,          -- 'win' | 'loss' | 'break_even' | null
  ADD COLUMN IF NOT EXISTS realized_pnl_pct  numeric(6,2),
  ADD COLUMN IF NOT EXISTS settled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at        timestamptz;

-- Index the hot path: settlement scans WHERE status = 'open'.
CREATE INDEX IF NOT EXISTS agent_trades_status_open_idx
  ON agent_trades (status)
  WHERE status = 'open';

-- Index for circuit-breaker lookups by cycle.
CREATE INDEX IF NOT EXISTS agent_trades_cycle_id_idx
  ON agent_trades (cycle_id);
