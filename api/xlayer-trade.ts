// ============================================================
// POST /api/xlayer-trade
// Bobby executes trades on X Layer via OnchainOS CLI
// Proxies to Digital Ocean droplet where CLI is installed
// Supports: quote, swap, signal, market data
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

const DROPLET_URL = process.env.DROPLET_URL || 'http://143.110.194.171';
const DROPLET_PORT = '8788'; // X Layer trade service

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, params } = req.body as { action: string; params?: Record<string, string> };

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  try {
    const response = await fetch(`${DROPLET_URL}:${DROPLET_PORT}/api/xlayer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('[XLayer] Trade error:', error instanceof Error ? error.message : error);
    return res.status(502).json({ error: 'X Layer service unavailable' });
  }
}
