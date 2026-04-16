-- ============================================================
-- api_cache — simple TTL key/value cache for external API responses
-- Used first for Polymarket leaderboard/consensus, which is otherwise
-- refetched on every cycle and on every public dashboard refresh.
-- ============================================================

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key   text PRIMARY KEY,
  payload     jsonb NOT NULL,
  expires_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_cache_expires_at_idx
  ON api_cache (expires_at);

-- Service role writes; anon reads allowed so public dashboards can benefit
-- from the same cached payloads without hitting Polymarket directly.
ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_cache_service_all ON api_cache;
CREATE POLICY api_cache_service_all ON api_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_cache_anon_read ON api_cache;
CREATE POLICY api_cache_anon_read ON api_cache
  FOR SELECT TO anon
  USING (expires_at > now());
