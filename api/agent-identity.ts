import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  BOBBY_ADVERSARIAL_BOUNTIES,
  BOBBY_AGENT_ECONOMY,
  BOBBY_CONVICTION_ORACLE,
  BOBBY_HARDNESS_REGISTRY,
  BOBBY_PROTOCOL_BASE_URL,
  BOBBY_TRACK_RECORD,
} from './_lib/protocol-constants.js';

export const config = { maxDuration: 5 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  return res.status(200).json({
    name: 'Bobby Protocol',
    version: '3.1.0',
    type: 'trading-agent',
    identity_standard: 'hardness-agent/v1',
    capabilities: ['debate', 'judge', 'predict', 'bounty', 'hardness_test'],
    mcp_endpoint: `${BOBBY_PROTOCOL_BASE_URL}/api/mcp-http`,
    registry_endpoint: `${BOBBY_PROTOCOL_BASE_URL}/api/registry`,
    hardness_test_endpoint: `${BOBBY_PROTOCOL_BASE_URL}/api/hardness-test`,
    contracts: {
      hardnessRegistry: BOBBY_HARDNESS_REGISTRY,
      agentEconomy: BOBBY_AGENT_ECONOMY,
      convictionOracle: BOBBY_CONVICTION_ORACLE,
      trackRecord: BOBBY_TRACK_RECORD,
      adversarialBounties: BOBBY_ADVERSARIAL_BOUNTIES,
    },
    pricing: {
      quick_score: '0.001 OKB',
      full_debate: '0.001 OKB',
      judge_mode: '0.001 OKB',
    },
    sandbox: {
      topology: 'alpha_redteam_cio_plus_judge',
      isolation_mode: 'shared_context_v1',
      roadmap: 'clean_room_v2',
    },
    links: {
      app: `${BOBBY_PROTOCOL_BASE_URL}/agentic-world/bobby`,
      submission: `${BOBBY_PROTOCOL_BASE_URL}/submission`,
      docs: `${BOBBY_PROTOCOL_BASE_URL}/docs`,
    },
  });
}
