/**
 * MCP Payment Challenge Manager
 * Handles creation, atomic consumption, and expiry of payment challenges.
 * Uses Supabase with atomic UPDATE to prevent double fulfillment (Codex R1 P0).
 */

const SB_URL = process.env.SB_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';

interface Challenge {
  challenge_id: string;
  tool_name: string;
  request_hash: string | null;
  price_wei: string;
  status: 'pending' | 'consumed' | 'expired';
  expires_at: string;
  payer_address: string | null;
  tx_hash: string | null;
  external_agent: string | null;
}

/**
 * Create a new payment challenge for a premium MCP tool call.
 * Returns the challenge_id that the caller must include in their payMCPCall tx.
 */
export async function createChallenge(
  toolName: string,
  priceWei: string,
  requestHash?: string,
  externalAgent?: string,
): Promise<{ challengeId: string; expiresAt: string }> {
  const res = await fetch(`${SB_URL}/rest/v1/mcp_payment_challenges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      tool_name: toolName,
      price_wei: priceWei,
      request_hash: requestHash || null,
      external_agent: externalAgent || null,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown');
    throw new Error(`Failed to create challenge: ${err}`);
  }

  const rows = await res.json() as Challenge[];
  if (!rows.length) throw new Error('Challenge creation returned no rows');

  return {
    challengeId: rows[0].challenge_id,
    expiresAt: rows[0].expires_at,
  };
}

/**
 * Atomically consume a pending challenge. Returns true if consumed, false if already consumed/expired.
 * This is the critical anti-replay gate (Codex R1 P0): only ONE request can consume a challenge.
 */
export async function atomicConsumeChallenge(
  challengeId: string,
  txHash: string,
  payerAddress: string,
): Promise<{ consumed: boolean; challenge: Challenge | null }> {
  // Atomic UPDATE: only succeeds if status is still 'pending' and not expired
  const res = await fetch(
    `${SB_URL}/rest/v1/mcp_payment_challenges?challenge_id=eq.${challengeId}&status=eq.pending&expires_at=gt.${new Date().toISOString()}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: 'consumed',
        consumed_at: new Date().toISOString(),
        tx_hash: txHash,
        payer_address: payerAddress,
      }),
    },
  );

  if (!res.ok) {
    console.error('[atomicConsumeChallenge]', await res.text().catch(() => ''));
    return { consumed: false, challenge: null };
  }

  const rows = await res.json() as Challenge[];
  if (rows.length !== 1) {
    // Either already consumed, expired, or doesn't exist
    return { consumed: false, challenge: null };
  }

  return { consumed: true, challenge: rows[0] };
}

/**
 * Store a verified payment receipt for audit trail and Judge Mode.
 */
export async function storeReceipt(receipt: {
  txHash: string;
  challengeId: string;
  payerAddress: string;
  toolName: string;
  blockNumber: number;
  valueWei: string;
  valueOkb: string;
  responseHash?: string;
}): Promise<void> {
  const explorerUrl = `https://www.oklink.com/xlayer/tx/${receipt.txHash}`;

  await fetch(`${SB_URL}/rest/v1/mcp_payment_receipts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({
      tx_hash: receipt.txHash,
      challenge_id: receipt.challengeId,
      payer_address: receipt.payerAddress,
      tool_name: receipt.toolName,
      block_number: receipt.blockNumber,
      value_wei: receipt.valueWei,
      value_okb: receipt.valueOkb,
      response_hash: receipt.responseHash || null,
      explorer_url: explorerUrl,
    }),
  }).catch((err) => {
    console.error('[storeReceipt] Failed to store receipt:', err);
  });
}

/**
 * Get a challenge by ID (for validation).
 */
export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/mcp_payment_challenges?challenge_id=eq.${challengeId}&select=*`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    },
  );

  if (!res.ok) return null;
  const rows = await res.json() as Challenge[];
  return rows[0] || null;
}
