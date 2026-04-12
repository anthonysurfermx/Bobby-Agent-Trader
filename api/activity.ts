// ============================================================
// GET /api/activity
// Live activity feed — recent MCP calls, payments, and agent
// interactions. Powers the real-time feed on the landing page.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listAgentCommerceEvents } from './_lib/agent-commerce-log.js';

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const events = await listAgentCommerceEvents(limit);

  const feed = events.map((e) => {
    const agent = e.external_agent || 'anonymous';
    const tool = e.tool_name || 'unknown';
    const paid = e.payment_status === 'verified' && e.payment_amount_wei;
    const amountOkb = paid ? (Number(e.payment_amount_wei) / 1e18).toFixed(4) : null;
    const txHash = e.payment_tx_hash || null;
    const ago = e.created_at
      ? Math.floor((Date.now() - new Date(e.created_at).getTime()) / 1000)
      : null;

    return {
      agent,
      tool,
      paid: Boolean(paid),
      amountOkb,
      txHash,
      agoSeconds: ago,
      timestamp: e.created_at,
    };
  });

  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  return res.status(200).json({
    ok: true,
    count: feed.length,
    feed,
  });
}
