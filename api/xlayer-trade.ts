// ============================================================
// POST /api/xlayer-trade
// Bobby reads X Layer routes/signals via OnchainOS CLI
// Proxies to Digital Ocean droplet where CLI is installed
// Supports only allowlisted read/transaction-building actions; never signs
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enforcePublicRateLimit } from './_lib/request-security.js';

const DROPLET_URL = process.env.DROPLET_URL || 'http://143.110.194.171';
const DROPLET_PORT = '8788'; // X Layer trade service
const PUBLIC_ACTIONS = new Set(['signals', 'quote', 'swap_data']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!await enforcePublicRateLimit(req, res, 'xlayer-trade', 30, 60)) return;

  const { action, params } = req.body as { action: string; params?: Record<string, string> };

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  if (!PUBLIC_ACTIONS.has(action)) {
    return res.status(400).json({ error: 'Unsupported action' });
  }

  let upstream: URL;
  try {
    upstream = new URL(DROPLET_URL);
  } catch {
    return res.status(503).json({ error: 'X Layer service is not configured' });
  }

  // swap_data becomes a transaction the browser asks the wallet to sign. An
  // unencrypted upstream could alter its target or calldata in transit, so the
  // transaction-building path must fail closed unless TLS is configured.
  if (action === 'swap_data' && upstream.protocol !== 'https:') {
    return res.status(503).json({ error: 'Secure swap service is not configured' });
  }

  try {
    upstream.port = upstream.port || DROPLET_PORT;
    upstream.pathname = '/api/xlayer';
    upstream.search = '';
    upstream.hash = '';
    const response = await fetch(upstream, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'X Layer service rejected the request' });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('[XLayer] Trade error:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'X Layer service unavailable' });
  }
}
