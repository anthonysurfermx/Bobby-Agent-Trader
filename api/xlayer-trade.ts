// ============================================================
// POST /api/xlayer-trade
// Bobby reads X Layer routes/signals via OnchainOS CLI
// Proxies to Digital Ocean droplet where CLI is installed
// Supports only allowlisted read/transaction-building actions; never signs
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkSwapTx, DexRefusal, requireAllowedRouters } from './_lib/dex-allowlist.js';
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
  if (action === 'swap_data') {
    const addressPattern = /^0x[a-fA-F0-9]{40}$/;
    if (!addressPattern.test(String(params?.from_token || ''))
      || !addressPattern.test(String(params?.to_token || ''))
      || !addressPattern.test(String(params?.wallet || ''))
      || !/^\d{1,78}$/.test(String(params?.amount || ''))) {
      return res.status(400).json({ error: 'Invalid X Layer swap parameters' });
    }
    try {
      requireAllowedRouters('196');
    } catch (error) {
      const refusal = error as DexRefusal;
      return res.status(503).json({ error: refusal.message, code: refusal.code });
    }
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

    const data = await response.json() as { ok?: boolean; data?: unknown };
    if (action === 'swap_data') {
      const route = Array.isArray(data.data) ? data.data[0] : data.data;
      const tx = route && typeof route === 'object' ? (route as { tx?: Record<string, unknown> }).tx : null;
      if (!tx) return res.status(502).json({ error: 'X Layer service returned no transaction' });
      try {
        const checked = checkSwapTx('196', {
          to: String(tx.to || ''),
          data: String(tx.data || ''),
          value: String(tx.value || '0'),
        }, String(params?.from_token), String(params?.amount));
        const minReceiveAmount = String(tx.minReceiveAmount || '');
        if (!/^\d{1,78}$/.test(minReceiveAmount) || BigInt(minReceiveAmount) <= 0n) {
          throw new DexRefusal('X Layer route has no valid minimum received amount', 'min_received_invalid');
        }
        Object.assign(tx, { to: checked.to, value: checked.value });
        Object.assign(route as object, {
          disclosure: {
            chainId: 196,
            router: checked.to,
            spender: null,
            valueWei: checked.value,
            minReceived: minReceiveAmount,
            note: 'Router passed Bobby allow-list; native OKB needs no token approval.',
          },
        });
      } catch (error) {
        const refusal = error instanceof DexRefusal ? error : new DexRefusal(String(error));
        return res.status(refusal.code === 'dex_not_configured' ? 503 : 502).json({ error: refusal.message, code: refusal.code });
      }
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error('[XLayer] Trade error:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'X Layer service unavailable' });
  }
}
