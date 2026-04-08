import type { VercelRequest, VercelResponse } from '@vercel/node';

import { listAgentCommerceEvents } from './_lib/agent-commerce-log.js';
import { getEconomyStats } from './_lib/xlayer-payments.js';

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');

  try {
    const [economy, recentEvents] = await Promise.all([
      getEconomyStats(),
      listAgentCommerceEvents(50),
    ]);

    const uniquePayers = new Set(
      recentEvents
        .map((event) => String(event.payer_address || '').toLowerCase())
        .filter(Boolean),
    );

    const uniqueAgents = new Set(
      recentEvents
        .map((event) => String(event.external_agent || '').trim())
        .filter(Boolean),
    );

    return res.status(200).json({
      ok: true,
      ts: new Date().toISOString(),
      chain: 'X Layer (196)',
      economy,
      proof: {
        loggedCalls: recentEvents.length,
        uniquePayers: uniquePayers.size,
        uniqueAgents: uniqueAgents.size,
      },
      recentEvents,
    });
  } catch (error: any) {
    return res.status(503).json({
      error: error?.message || 'Agent commerce proof unavailable',
    });
  }
}
