// ============================================================
// GET /api/premium-signal — RETIRED (2026-09-03)
// The x402 demo that sold signals for OKB on X Layer (hackathon rail).
// X Layer is archive-only and Bobby sells no signals through this path.
// 410 so integrations fail loudly.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 5 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({ ok: false, code: 'xlayer_x402_retired', error: 'premium-signal is retired: the X Layer x402 rail is archive-only' });
}
