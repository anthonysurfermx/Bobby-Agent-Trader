import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAgentOutcomeStats, getConsensusRows, listAgents, listRecentSessions } from '../_lib/hardness-control-plane.js';

export const config = { maxDuration: 12 };

function directionToBps(direction: string): number {
  if (direction === 'long') return 10000;
  if (direction === 'short') return -10000;
  return 0;
}

async function consensusForSymbol(symbol: string) {
  const rows = await getConsensusRows(symbol);
  const latestByAgent = new Map<string, any>();
  for (const row of rows) {
    if (!latestByAgent.has(row.agent_id)) latestByAgent.set(row.agent_id, row);
  }
  const items = Array.from(latestByAgent.values());
  const activeAgents = items.length;
  const averageDirectionBps = activeAgents > 0
    ? Math.round(items.reduce((sum, item) => sum + directionToBps(item.direction || item.decision_json?.prediction?.direction || 'none'), 0) / activeAgents)
    : 0;
  const averageHardness = activeAgents > 0
    ? Math.round(items.reduce((sum, item) => sum + Number(item.hardness_score || 0), 0) / activeAgents)
    : 0;

  return { symbol, activeAgents, averageDirectionBps, averageHardness };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [agents, recentSessions, btc, eth, sol] = await Promise.all([
    listAgents(24),
    listRecentSessions(20),
    consensusForSymbol('BTC'),
    consensusForSymbol('ETH'),
    consensusForSymbol('SOL'),
  ]);

  const enrichedAgents = await Promise.all(agents.map(async (agent: any) => ({
    agentId: agent.agent_id,
    name: agent.name,
    owner: agent.owner_address,
    type: agent.agent_type,
    status: agent.status,
    capabilities: agent.capabilities || [],
    stats: await getAgentOutcomeStats(agent.agent_id),
  })));

  return res.status(200).json({
    ok: true,
    summary: {
      totalAgents: enrichedAgents.length,
      totalSessions: recentSessions.length,
    },
    agents: enrichedAgents,
    consensus: [btc, eth, sol],
    recentActivity: recentSessions.map((session: any) => ({
      sessionId: session.session_id,
      agentId: session.agent_id,
      symbol: session.symbol,
      direction: session.direction,
      hardnessScore: session.hardness_score,
      decision: session.decision_json?.decision || null,
      createdAt: session.created_at,
    })),
  });
}
