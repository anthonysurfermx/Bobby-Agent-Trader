// ============================================================
// POST /api/harness-migrate — Create agent_events table
// Run once to set up the harness event store. Requires
// SUPABASE_SERVICE_KEY in env (available on Vercel).
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 10 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS agent_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id text NOT NULL,
  thread_id text,
  agent text NOT NULL,
  event_type text NOT NULL,
  tool text,
  symbol text,
  direction text,
  decision text,
  conviction real,
  risk_score real,
  policy_hits jsonb,
  reason text,
  payment_tx text,
  trade_tx text,
  latency_ms integer,
  tokens_in integer,
  tokens_out integer,
  meta jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_run_id ON agent_events(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON agent_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_event_type ON agent_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent);

CREATE TABLE IF NOT EXISTS memory_objects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  thread_id text,
  symbol text,
  direction text,
  regime text,
  conviction real,
  outcome text,
  pnl_pct real,
  lesson text NOT NULL,
  tags jsonb,
  source_events jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_objects_kind ON memory_objects(kind);
CREATE INDEX IF NOT EXISTS idx_memory_objects_symbol ON memory_objects(symbol);
CREATE INDEX IF NOT EXISTS idx_memory_objects_created_at ON memory_objects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_objects_outcome ON memory_objects(outcome);
`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const cronSecret = process.env.CRON_SECRET || process.env.BOBBY_CYCLE_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!SB_SERVICE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_KEY not configured' });
  }

  try {
    const response = await fetch(`${SB_URL}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    });

    // Fallback: try direct SQL via management API
    if (!response.ok) {
      // Use the Supabase SQL endpoint
      const sqlRes = await fetch(`${SB_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_SERVICE_KEY,
          Authorization: `Bearer ${SB_SERVICE_KEY}`,
        },
        body: JSON.stringify({ sql: MIGRATION_SQL }),
      });

      if (!sqlRes.ok) {
        // Last resort: try inserting a dummy row to check if table exists
        const checkRes = await fetch(`${SB_URL}/rest/v1/agent_events?limit=0`, {
          headers: {
            apikey: SB_SERVICE_KEY,
            Authorization: `Bearer ${SB_SERVICE_KEY}`,
          },
        });

        if (checkRes.ok) {
          return res.status(200).json({
            ok: true,
            message: 'Table agent_events already exists',
            migration: 'skipped',
          });
        }

        return res.status(500).json({
          error: 'Could not create table. Run the SQL manually in Supabase dashboard.',
          sql: MIGRATION_SQL,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      message: 'agent_events table created',
      migration: 'applied',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: msg, sql: MIGRATION_SQL });
  }
}
