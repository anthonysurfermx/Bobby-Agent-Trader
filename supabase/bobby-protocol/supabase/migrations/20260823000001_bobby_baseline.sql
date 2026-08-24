-- ============================================================
-- bobby-protocol baseline — fresh project (qbvdqkknnuweatptjohi)
-- The four tables the app endpoints use today:
--   agent_profiles (wizard/agent-setup, user-cycle scheduler)
--   forum_threads + forum_posts (user-cycle debate output)
--   api_cache (TTL cache + persistent rate limiter)
-- RLS on everywhere; service_role does the writing, anon reads
-- only what is explicitly public.
-- ============================================================

-- ---- agent_profiles ----------------------------------------

CREATE TABLE IF NOT EXISTS agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text UNIQUE NOT NULL,
  agent_name text NOT NULL,
  voice text NOT NULL DEFAULT 'coral',
  personality text NOT NULL DEFAULT 'analytical',
  cadence_hours integer NOT NULL DEFAULT 6,
  markets jsonb NOT NULL DEFAULT '[]',
  delivery jsonb NOT NULL DEFAULT '["web"]',
  language text DEFAULT 'es',
  -- Companion chosen in the onboarding wizard:
  -- { body, eyes, accessory, avatar } — see src/lib/mascot.ts
  mascot jsonb,
  status text NOT NULL DEFAULT 'deploying',
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_profiles_next_run_idx
  ON agent_profiles (next_run_at)
  WHERE status <> 'paused';

ALTER TABLE agent_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_profiles_service_all ON agent_profiles;
CREATE POLICY agent_profiles_service_all ON agent_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---- forum_threads ------------------------------------------

CREATE TABLE IF NOT EXISTS forum_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  trigger_reason text,
  trigger_data jsonb,
  language text DEFAULT 'es',
  conviction_score real,
  price_at_creation jsonb,
  symbol text,
  direction text,
  entry_price numeric,
  stop_price numeric,
  target_price numeric,
  expires_at timestamptz,
  kind text NOT NULL DEFAULT 'public',
  scope text NOT NULL DEFAULT 'public',
  agent_profile_id uuid REFERENCES agent_profiles(id) ON DELETE SET NULL,
  owner_wallet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_threads_created_idx ON forum_threads (created_at DESC);
CREATE INDEX IF NOT EXISTS forum_threads_profile_idx ON forum_threads (agent_profile_id);

ALTER TABLE forum_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forum_threads_service_all ON forum_threads;
CREATE POLICY forum_threads_service_all ON forum_threads
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS forum_threads_anon_read_public ON forum_threads;
CREATE POLICY forum_threads_anon_read_public ON forum_threads
  FOR SELECT TO anon USING (scope = 'public');

-- ---- forum_posts --------------------------------------------

CREATE TABLE IF NOT EXISTS forum_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
  agent text NOT NULL,
  content text NOT NULL,
  data_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forum_posts_thread_idx ON forum_posts (thread_id);

ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forum_posts_service_all ON forum_posts;
CREATE POLICY forum_posts_service_all ON forum_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS forum_posts_anon_read_public ON forum_posts;
CREATE POLICY forum_posts_anon_read_public ON forum_posts
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM forum_threads t
      WHERE t.id = forum_posts.thread_id AND t.scope = 'public'
    )
  );

-- ---- api_cache (TTL cache + persistent rate limiter) --------

CREATE TABLE IF NOT EXISTS api_cache (
  cache_key   text PRIMARY KEY,
  payload     jsonb NOT NULL,
  expires_at  timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_cache_expires_at_idx ON api_cache (expires_at);

ALTER TABLE api_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_cache_service_all ON api_cache;
CREATE POLICY api_cache_service_all ON api_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS api_cache_anon_read ON api_cache;
CREATE POLICY api_cache_anon_read ON api_cache
  FOR SELECT TO anon USING (expires_at > now());
