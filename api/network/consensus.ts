import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getConsensusRows, getAgent } from '../_lib/hardness-control-plane';

export const config = { maxDuration: 10 };

function directionToBps(direction: string): number {
  if (direction === 'long') return 10000;
  if (direction === 'short') return -10000;
  return 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = String(req.query.symbol || '').trim().toUpperCase();
  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol query param' });
  }

  const rows = await getConsensusRows(symbol);
  const latestByAgent = new Map<string, any>();
  for (const row of rows) {
    if (!latestByAgent.has(row.agent_id)) latestByAgent.set(row.agent_id, row);
  }

  const items = await Promise.all(Array.from(latestByAgent.values()).map(async (row: any) => {
    const profile = await getAgent(row.agent_id);
    const direction = row.direction || row.decision_json?.prediction?.direction || row.request_json?.prediction?.direction || 'none';
    const winRateBps = Number(profile?.stats?.winRateBps || 0);
    const weight = Math.max(1, winRateBps || 5000);
    return {
      agentId: row.agent_id,
      name: profile?.name || row.agent_id,
      direction,
      conviction: Number(row.decision_json?.conviction || row.request_json?.prediction?.conviction || 0),
      hardnessScore: Number(row.hardness_score || 0),
      winRateBps,
      weight,
    };
  }));

  const activeAgents = items.length;
  const averageDirectionBps = activeAgents > 0
    ? Math.round(items.reduce((sum, item) => sum + directionToBps(item.direction), 0) / activeAgents)
    : 0;
  const averageConviction = activeAgents > 0
    ? Math.round(items.reduce((sum, item) => sum + item.conviction, 0) / activeAgents)
    : 0;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const weightedAverageDirectionBps = totalWeight > 0
    ? Math.round(items.reduce((sum, item) => sum + directionToBps(item.direction) * item.weight, 0) / totalWeight)
    : 0;
  const weightedAverageConviction = totalWeight > 0
    ? Math.round(items.reduce((sum, item) => sum + item.conviction * item.weight, 0) / totalWeight)
    : 0;

  return res.status(200).json({
    ok: true,
    symbol,
    consensus: {
      averageDirectionBps,
      averageConviction,
      activeAgents,
      weightedAverageDirectionBps,
      weightedAverageConviction,
    },
    agents: items,
  });
}
