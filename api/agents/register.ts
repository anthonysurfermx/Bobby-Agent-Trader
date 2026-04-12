// ============================================================
// POST /api/agents/register — Agent Registration for Hardness Finance
// Any AI agent registers with Bobby's financial orchestration layer.
// Persists profile in Supabase + returns metadata URI for on-chain registration.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HARDNESS_REGISTRY_ADDRESS } from '../_lib/hardness-registry';
import { getAgent, upsertAgent } from '../_lib/hardness-control-plane';
import { buildAuthChallenge, verifyAgentRequest } from '../_lib/agent-auth';

export const config = { maxDuration: 15 };

interface RegisterBody {
  agentId: string;
  owner: string;
  name: string;
  type?: string;
  version?: string;
  capabilities?: string[];
  mcpEndpoint?: string;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
  riskPolicy?: {
    minHardnessScore?: number;
    maxNotionalUsd?: number;
    allowedSymbols?: string[];
    requireJudge?: boolean;
    requireOnchainProof?: boolean;
    mode?: 'advisory' | 'auto' | 'paper';
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      endpoint: 'POST /api/agents/register',
      description: 'Register an AI agent with Bobby\'s financial orchestration layer. Provides identity, capabilities, and risk policy.',
      usage: 'POST with JSON body: { agentId, owner, name, type?, version?, capabilities?, mcpEndpoint?, webhookUrl?, metadata?, riskPolicy?: { minHardnessScore, maxNotionalUsd, allowedSymbols, requireJudge, requireOnchainProof, mode } }',
      registry: HARDNESS_REGISTRY_ADDRESS,
      docs: 'https://bobbyprotocol.xyz/agentic-world/bobby/console',
      auth: {
        headers: ['x-agent-address', 'x-agent-timestamp', 'x-agent-signature'],
        challengeExample: buildAuthChallenge('register-agent', { agentId: 'your-agent', owner: '0x...', name: 'Your Agent' }, new Date().toISOString()),
        fallback: 'If omitted, Bobby accepts demo-mode registration.',
      },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body as RegisterBody;

  if (!body.agentId || !body.owner || !body.name) {
    return res.status(400).json({
      error: 'Missing required fields: agentId, owner, name',
      schema: {
        agentId: 'string (unique identifier)',
        owner: 'string (wallet address)',
        name: 'string (display name)',
        type: 'trading-agent | strategy-agent | observer (optional)',
        version: 'string semver (optional)',
        capabilities: 'string[] (optional)',
        mcpEndpoint: 'string URL (optional)',
        webhookUrl: 'string URL (optional)',
        metadata: 'object (optional)',
        riskPolicy: '{ minHardnessScore, maxNotionalUsd, allowedSymbols, requireJudge, requireOnchainProof, mode } (optional)',
      },
    });
  }

  const auth = await verifyAgentRequest(
    req,
    'register-agent',
    { agentId: body.agentId, owner: body.owner, name: body.name },
    body.owner
  );
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  const existing = await getAgent(body.agentId);

  const profile = await upsertAgent({
    agent_id: body.agentId,
    owner_address: body.owner,
    name: body.name,
    agent_type: body.type || 'trading-agent',
    version: body.version || '1.0.0',
    capabilities: body.capabilities || ['predict'],
    mcp_endpoint: body.mcpEndpoint || null,
    webhook_url: body.webhookUrl || null,
    metadata_json: body.metadata || {},
    risk_policy_json: body.riskPolicy || {
      minHardnessScore: 60,
      maxNotionalUsd: 1000,
      allowedSymbols: ['BTC', 'ETH'],
      requireJudge: true,
      requireOnchainProof: true,
      mode: 'advisory',
    },
    status: 'active',
  });

  try {
    // Build metadata URI for on-chain registration
    const metadataURI = `https://bobbyprotocol.xyz/api/agents/${body.agentId}`;

    return res.status(existing ? 200 : 201).json({
      ok: true,
      agent: {
        agentId: body.agentId,
        name: body.name,
        type: body.type || 'trading-agent',
        owner: body.owner,
        status: 'active',
        metadataURI,
        version: body.version || '1.0.0',
        stored: Boolean(profile),
        authMode: auth.mode,
      },
      onchain: {
        registry: HARDNESS_REGISTRY_ADDRESS,
        chainId: 196,
        instruction: `Call HardnessRegistry.registerAgent("${metadataURI}") to mirror this agent on-chain.`,
      },
      nextSteps: [
        'Complete on-chain registration',
        'POST /api/orchestrate to submit your first prediction',
        'GET /api/agents/' + body.agentId + ' to check your profile',
        'GET /api/agents/' + body.agentId + '/activity to inspect proofs',
      ],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AgentRegister] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
