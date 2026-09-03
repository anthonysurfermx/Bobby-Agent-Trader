// ============================================================
// POST /api/auto-bounty — RETIRED (2026-09-03)
// This endpoint generated on-chain activity on X Layer (proof-density
// batches). X Layer is archive-only and Bobby's server signs no protocol
// activity for the sake of volume; any on-chain proof now comes from real
// cycles through /api/protocol-record on Base. Kept as a 410 so old cron
// entries and callers fail loudly instead of silently disappearing.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 5 };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(410).json({
    ok: false,
    code: 'xlayer_activity_retired',
    error: 'auto-bounty is retired: X Layer is archive-only and Bobby signs no synthetic protocol activity',
  });
}
