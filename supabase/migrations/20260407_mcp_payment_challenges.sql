-- MCP Payment Challenges: tracks challenge lifecycle for replay-resistant payments
-- Flow: pending → consumed (success) or expired (timeout)
CREATE TABLE IF NOT EXISTS mcp_payment_challenges (
  challenge_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL,
  request_hash text,
  price_wei text NOT NULL DEFAULT '1000000000000000',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consumed', 'expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  payer_address text,
  tx_hash text UNIQUE,
  external_agent text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

-- Index for fast lookup of pending challenges
CREATE INDEX IF NOT EXISTS idx_challenges_status ON mcp_payment_challenges(status) WHERE status = 'pending';

-- Index for expiry cleanup
CREATE INDEX IF NOT EXISTS idx_challenges_expires ON mcp_payment_challenges(expires_at) WHERE status = 'pending';

-- MCP Payment Receipts: verified on-chain payment proofs
CREATE TABLE IF NOT EXISTS mcp_payment_receipts (
  tx_hash text PRIMARY KEY,
  challenge_id uuid UNIQUE NOT NULL REFERENCES mcp_payment_challenges(challenge_id),
  payer_address text NOT NULL,
  tool_name text NOT NULL,
  block_number bigint NOT NULL,
  value_wei text NOT NULL,
  value_okb text NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  response_hash text,
  explorer_url text
);

-- Enable RLS
ALTER TABLE mcp_payment_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_payment_receipts ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (backend uses service key)
CREATE POLICY "service_all_challenges" ON mcp_payment_challenges
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_all_receipts" ON mcp_payment_receipts
  FOR ALL USING (true) WITH CHECK (true);
