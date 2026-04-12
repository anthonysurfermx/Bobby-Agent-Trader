import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAgent, getAgentOutcomeStats } from '../_lib/hardness-control-plane.js';

export const config = { maxDuration: 10 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const agentId = String(req.query.agentId || '').trim();
  if (!agentId) {
    return res.status(400).json({ error: 'Missing agentId' });
  }

  const agent = await getAgent(agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  const stats = await getAgentOutcomeStats(agentId);

  return res.status(200).json({
    ok: true,
    agent: {
      agentId: agent.agent_id,
      owner: agent.owner_address,
      name: agent.name,
      type: agent.agent_type,
      version: agent.version,
      status: agent.status,
      capabilities: agent.capabilities || [],
      mcpEndpoint: agent.mcp_endpoint,
      webhookUrl: agent.webhook_url,
      metadata: agent.metadata_json || {},
      riskPolicy: agent.risk_policy_json || {},
      stats,
      registeredAt: agent.created_at,
      updatedAt: agent.updated_at,
    },
  });
}
