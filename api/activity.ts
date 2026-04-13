// ============================================================
// GET /api/activity
// Live activity feed — recent on-chain txs + MCP commerce events.
// Powers the real-time feed on the landing page.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { listAgentCommerceEvents } from './_lib/agent-commerce-log.js';
import { listRecentBounties } from './_lib/xlayer-payments.js';
import { BOBBY_PROTOCOL_BASE_URL } from './_lib/protocol-constants.js';

export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'bobbyprotocol.xyz';
  const baseUrl = `${proto}://${host}`;

  // Fetch from both sources in parallel
  const [events, heartbeatRes, bountyFallback] = await Promise.all([
    listAgentCommerceEvents(limit).catch(() => []),
    fetch(`${baseUrl || BOBBY_PROTOCOL_BASE_URL}/api/protocol-heartbeat`, {
      headers: { 'Cache-Control': 'no-cache' },
    }).then(r => r.ok ? r.json() as Promise<{ recentTxs?: any[] }> : null).catch(() => null),
    listRecentBounties(limit).catch(() => []),
  ]);

  // Commerce events from Supabase
  const commerceFeed = events.map((e: any) => ({
    agent: e.external_agent || 'anonymous',
    tool: e.tool_name || 'unknown',
    paid: Boolean(e.payment_status === 'verified' && e.payment_amount_wei),
    amountOkb: e.payment_amount_wei ? (Number(e.payment_amount_wei) / 1e18).toFixed(4) : null,
    txHash: e.payment_tx_hash || null,
    agoSeconds: e.created_at ? Math.floor((Date.now() - new Date(e.created_at).getTime()) / 1000) : null,
    timestamp: e.created_at,
    source: 'commerce',
  }));

  // On-chain txs from heartbeat
  const onChainFeed = (heartbeatRes?.recentTxs || []).map((tx: any) => ({
    agent: 'bobby-protocol',
    tool: `${tx.contractName}::${tx.method}`,
    paid: parseFloat(tx.valueOkb || '0') > 0,
    amountOkb: parseFloat(tx.valueOkb || '0') > 0 ? parseFloat(tx.valueOkb).toFixed(4) : null,
    txHash: tx.hash,
    agoSeconds: tx.timestamp ? Math.floor(Date.now() / 1000 - tx.timestamp) : null,
    timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null,
    source: 'onchain',
  }));

  const bountyFeed = onChainFeed.length > 0 ? [] : bountyFallback.map((bounty: any) => ({
    agent: 'bobby-protocol',
    tool: `AdversarialBounties::${bounty.dimension}`,
    paid: true,
    amountOkb: bounty.rewardOkb ? Number(bounty.rewardOkb).toFixed(4) : null,
    txHash: null,
    agoSeconds: bounty.createdAt ? Math.max(0, Math.floor(Date.now() / 1000 - Number(bounty.createdAt))) : null,
    timestamp: bounty.createdAt ? new Date(Number(bounty.createdAt) * 1000).toISOString() : null,
    source: 'bounty',
  }));

  // Merge, deduplicate by txHash, sort by recency, limit
  const seen = new Set<string>();
  const merged = [...commerceFeed, ...onChainFeed, ...bountyFeed]
    .filter((item) => {
      if (!item.txHash || seen.has(item.txHash)) return !item.txHash ? true : false;
      seen.add(item.txHash);
      return true;
    })
    .sort((a, b) => (a.agoSeconds ?? 9999) - (b.agoSeconds ?? 9999))
    .slice(0, limit);

  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  return res.status(200).json({
    ok: true,
    count: merged.length,
    feed: merged,
  });
}
