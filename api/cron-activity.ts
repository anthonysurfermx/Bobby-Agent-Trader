// ============================================================
// GET /api/cron-activity — Vercel cron trigger for on-chain activity
// Runs every 2 hours, generates ~11 txs across 5 contracts
// Auth: Vercel cron sets Authorization header automatically
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 60 };

const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://bobbyprotocol.xyz';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel crons use GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only (Vercel cron)' });
  }

  // Auth: Vercel cron sends Authorization: Bearer <CRON_SECRET>
  const cronSecret = process.env.CRON_SECRET || process.env.BOBBY_CYCLE_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Call the main generate-activity endpoint
    const response = await fetch(`${BASE_URL}/api/generate-activity`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret || ''}`,
      },
      body: JSON.stringify({
        signals: 3,
        bounties: 2,
        commits: 2,
        economy: true,
        oracle: true,
      }),
    });

    const data = await response.json();

    console.log(`[CronActivity] Generated ${data.generated || 0} txs, cost: ${data.cost?.spent || '?'} OKB`);

    return res.status(200).json({
      ok: true,
      source: 'cron',
      schedule: 'every 2 hours',
      result: data,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CronActivity] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
