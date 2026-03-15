// ============================================================
// POST /api/agent-confirm — Record trade execution result
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { walletAddress, txHash, status, chain, tokenSymbol, amountUsd } = req.body || {};

  if (!txHash || !status) {
    return res.status(400).json({ error: 'Missing txHash or status' });
  }

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }

  try {
    // Insert execution record into agent_trades (or a general log)
    const record = {
      wallet_address: walletAddress || 'unknown',
      tx_hash: txHash,
      status, // confirmed | rejected | failed
      chain: chain || '196',
      token_symbol: tokenSymbol || '',
      amount_usd: amountUsd || 0,
      executed_at: new Date().toISOString(),
    };

    const resp = await fetch(`${sbUrl}/rest/v1/agent_trades`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: sbKey,
        Authorization: `Bearer ${sbKey}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(record),
    });

    if (!resp.ok) {
      // If agent_trades table doesn't exist yet, just log and return ok
      console.warn('[agent-confirm] Supabase insert failed:', resp.status, await resp.text());
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[agent-confirm] Error:', error);
    return res.status(500).json({ error: 'Internal error' });
  }
}
