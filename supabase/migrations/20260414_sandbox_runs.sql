-- ============================================================
-- sandbox_runs — persistent audit trail of every Sandbox pressure-test
-- Backs the public "Last 20 pressure-tests" feed + share/replay URLs.
-- ============================================================

CREATE TABLE IF NOT EXISTS sandbox_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  playbook_slug   text NOT NULL,
  ticker          text NOT NULL,

  -- Market snapshot at run time (OKX spot)
  market_snapshot jsonb,

  -- Full debate transcript
  alpha_text      text,
  red_text        text,
  cio_text        text,

  -- Structured CIO output
  cio_action      text,
  cio_conviction  numeric(4,2),

  -- Judge 6-dimension scores (jsonb of { dim_id: 1-5 })
  judge_scores    jsonb,

  -- Guardrail results (jsonb array of { id, label, status })
  guardrail_results jsonb,

  -- Final verdict
  verdict_action    text,
  guardrails_passed int,
  guardrails_failed int,
  guardrails_total  int,
  verdict_reason    text,

  -- Run health
  status          text NOT NULL DEFAULT 'completed',  -- completed | interrupted | errored
  error_phase     text,
  error_message   text,

  -- Abuse prevention / attribution
  ip_hash         text,
  user_agent      text
);

-- Indexes for the public feed + per-playbook filters
CREATE INDEX IF NOT EXISTS idx_sandbox_runs_created_desc
  ON sandbox_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_playbook_verdict
  ON sandbox_runs (playbook_slug, verdict_action);

CREATE INDEX IF NOT EXISTS idx_sandbox_runs_ip_hash_recent
  ON sandbox_runs (ip_hash, created_at DESC);

-- RLS: public can read, only service key can write
ALTER TABLE sandbox_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sandbox_runs_public_read ON sandbox_runs;
CREATE POLICY sandbox_runs_public_read
  ON sandbox_runs FOR SELECT
  USING (true);

-- Service role bypasses RLS automatically — no insert policy needed.
