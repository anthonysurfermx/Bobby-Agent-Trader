// ============================================================
// POST /api/agents/register — Agent Registration for Hardness Finance
// Any AI agent registers with Bobby's financial orchestration layer.
// Persists profile in Supabase + returns metadata URI for on-chain registration.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HARDNESS_REGISTRY_ADDRESS } from '../_lib/hardness-registry.js';
import { getAgent, hasSupabase, upsertAgent, getAgentStrict, registerAgentCas, AgentReadError } from '../_lib/hardness-control-plane.js';
import { buildAuthChallenge, verifyAgentRequest } from '../_lib/agent-auth.js';
import { enforcePublicRateLimit } from '../_lib/request-security.js';

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
        fallback: 'Registration requires a wallet signature from the owner.',
      },
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await enforcePublicRateLimit(req, res, 'agent-register', 10, 3600)) return;
  if (!hasSupabase()) return res.status(503).json({ error: 'Agent registry storage is not configured' });

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

  const validAgentId = /^[A-Za-z0-9._:-]{1,100}$/.test(body.agentId);
  const validOwner = /^0x[a-fA-F0-9]{40}$/.test(body.owner);
  const validName = typeof body.name === 'string' && body.name.trim().length > 0 && body.name.length <= 100;
  const validUrl = (value?: string) => !value || (() => {
    try { return new URL(value).protocol === 'https:' && value.length <= 500; } catch { return false; }
  })();
  if (!validAgentId || !validOwner || !validName || !validUrl(body.mcpEndpoint) || !validUrl(body.webhookUrl)
    || (body.capabilities && (!Array.isArray(body.capabilities) || body.capabilities.length > 30
      || body.capabilities.some((item) => typeof item !== 'string' || item.length > 100)))) {
    return res.status(400).json({ error: 'Invalid or oversized agent registration' });
  }

  // BP-10: a failed read must never authorise a write — 502, not "new agent".
  let existing: Record<string, any> | null;
  try {
    existing = await getAgentStrict(body.agentId);
  } catch (error) {
    return res.status(502).json({ error: error instanceof AgentReadError ? error.message : 'Agent registry read failed' });
  }
  // Ownership never changes through registration; that is an explicit, separately
  // authorised transfer (POST /api/agents/transfer, signed by the current owner).
  if (existing && String(existing.owner_address).toLowerCase() !== body.owner.toLowerCase()) {
    return res.status(409).json({ error: 'Owner differs from the registered owner; use POST /api/agents/transfer signed by the current owner' });
  }

  const auth = await verifyAgentRequest(
    req,
    'register-agent',
    body as unknown as Record<string, unknown>,
    existing?.owner_address || body.owner
  );
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  // BP-10: compare-and-swap against exactly what was authorised above.
  const cas = await registerAgentCas({
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
  }, { owner: existing ? String(existing.owner_address) : null, version: existing ? Number(existing.version ?? 1) : null });
  if (!cas.ok) {
    if (cas.error === 'STALE_VERSION' || cas.error === 'OWNER_MISMATCH' || cas.error === 'OWNER_CHANGE_REQUIRES_TRANSFER') {
      return res.status(409).json({ error: `Registration conflict: ${cas.error}` });
    }
    if (cas.error === 'NOT_FOUND') return res.status(409).json({ error: 'Agent changed during the request; retry' });
    return res.status(502).json({ error: 'Agent registry write failed' });
  }
  const profile = cas.row;

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
