// ============================================================
// POST /api/bobby-wallet — Agentic Wallet via OnchainOS on droplet
// Proxy to the wallet service running onchainos CLI
// Read-only endpoints: status, balance, addresses, portfolio, history and scans
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireInternalAuth } from './_lib/request-security.js';

const WALLET_SERVER = process.env.WALLET_SERVER_URL || 'http://143.110.194.171:8789';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireInternalAuth(req, res)) return;

  const { action } = req.method === 'POST' ? (req.body || {}) : (req.query as Record<string, string>);

  if (!action) {
    return res.status(400).json({
      error: 'Missing action param',
      available: ['status', 'balance', 'addresses', 'portfolio', 'tx-history', 'scan-token', 'scan-dapp', 'swap-quote', 'trending', 'signals'],
    });
  }

  // Map action to wallet service endpoint
  const routeMap: Record<string, { path: string; method: string }> = {
    status:       { path: '/api/wallet/status', method: 'GET' },
    balance:      { path: '/api/wallet/balance', method: 'GET' },
    addresses:    { path: '/api/wallet/addresses', method: 'GET' },
    portfolio:    { path: '/api/wallet/portfolio', method: 'POST' },
    'tx-history': { path: '/api/wallet/tx-history', method: 'GET' },
    'scan-token': { path: '/api/security/scan-token', method: 'POST' },
    'scan-dapp':  { path: '/api/security/scan-dapp', method: 'POST' },
    'swap-quote': { path: '/api/dex/swap-quote', method: 'POST' },
    trending:     { path: '/api/dex/trending', method: 'GET' },
    signals:      { path: '/api/dex/signals', method: 'GET' },
  };

  const route = routeMap[action];
  if (!route) {
    return res.status(400).json({ error: `Unknown action: ${action}`, available: Object.keys(routeMap) });
  }

  try {
    const params = req.body?.params || {};
    const queryString = route.method === 'GET' && Object.keys(params).length > 0
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(`${WALLET_SERVER}${route.path}${queryString}`, {
      method: route.method,
      headers: route.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
      body: route.method === 'POST' ? JSON.stringify(params) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err: any) {
    const msg = err.name === 'AbortError' ? 'Wallet service timeout (20s)' : (err.message || 'Wallet service unavailable');
    return res.status(502).json({ ok: false, error: msg });
  }
}
