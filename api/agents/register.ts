// ============================================================
// POST /api/agents/register — Agent Registration for Hardness Finance
// Any AI agent registers with Bobby's financial orchestration layer.
// Persists profile in Supabase + returns metadata URI for on-chain registration.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 15 };

const SB_URL = process.env.VITE_SUPABASE_URL || 'https://egpixaunlnzauztbrnuz.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const HARDNESS_REGISTRY = '0x95D045b1488F0776419a0E09de4fc0687AbbAFbf';

interface RegisterBody {
  agentId: string;
  owner: string;
  name: string;
  type?: string;
  capabilities?: string[];
  mcpEndpoint?: string;
  riskPolicy?: {
    minHardnessScore?: number;
    maxNotionalUsd?: number;
    allowedSymbols?: string[];
    requireJudge?: boolean;
    autoSettle?: boolean;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({
      endpoint: 'POST /api/agents/register',
      description: 'Register an AI agent with Bobby\'s financial orchestration layer. Provides identity, capabilities, and risk policy.',
      usage: 'POST with JSON body: { agentId, owner, name, type?, capabilities?, riskPolicy?: { minHardnessScore, maxNotionalUsd, allowedSymbols, requireJudge } }',
      registry: '0x95D045b1488F0776419a0E09de4fc0687AbbAFbf',
      stakeRequired: '0.01 OKB',
      docs: 'https://bobbyprotocol.xyz/protocol/console',
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
        capabilities: 'string[] (optional)',
        mcpEndpoint: 'string URL (optional)',
        riskPolicy: '{ minHardnessScore, maxNotionalUsd, allowedSymbols, requireJudge, autoSettle } (optional)',
      },
    });
  }

  const profile = {
    agent_id: body.agentId,
    owner_address: body.owner,
    name: body.name,
    agent_type: body.type || 'trading-agent',
    capabilities: body.capabilities || ['predict'],
    mcp_endpoint: body.mcpEndpoint || null,
    risk_policy: body.riskPolicy || {
      minHardnessScore: 60,
      maxNotionalUsd: 1000,
      allowedSymbols: ['BTC', 'ETH'],
      requireJudge: true,
      autoSettle: false,
    },
    status: 'registered',
    created_at: new Date().toISOString(),
  };

  try {
    // Persist in Supabase
    const sbRes = await fetch(`${SB_URL}/rest/v1/hardness_agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(profile),
    });

    let agentRecord = null;
    if (sbRes.ok) {
      const rows = await sbRes.json();
      agentRecord = Array.isArray(rows) ? rows[0] : rows;
    } else {
      // Table might not exist yet — still return success with metadata
      console.warn('[AgentRegister] Supabase insert failed:', sbRes.status, await sbRes.text().catch(() => ''));
    }

    // Build metadata URI for on-chain registration
    const metadataURI = `https://bobbyprotocol.xyz/api/agents/${body.agentId}`;

    return res.status(201).json({
      ok: true,
      agent: {
        agentId: body.agentId,
        name: body.name,
        type: body.type || 'trading-agent',
        status: 'registered',
        metadataURI,
      },
      onchain: {
        registry: HARDNESS_REGISTRY,
        chainId: 196,
        stakeRequired: '0.01 OKB',
        instruction: `Call HardnessRegistry.registerAgent("${metadataURI}") with 0.01 OKB to complete on-chain registration.`,
      },
      nextSteps: [
        'Complete on-chain registration with 0.01 OKB stake',
        'POST /api/orchestrate to submit your first prediction',
        'GET /api/agents/' + body.agentId + ' to check your profile',
      ],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[AgentRegister] Error:', msg);
    return res.status(500).json({ error: msg });
  }
}
