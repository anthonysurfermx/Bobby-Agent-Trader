import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 5 };

const HARDNESS_REGISTRY = process.env.HARDNESS_REGISTRY_ADDRESS || '0x95D045b1488F0776419a0E09de4fc0687AbbAFbf';

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
    mcp_endpoint: 'https://bobbyprotocol.xyz/api/mcp-http',
    registry_endpoint: 'https://bobbyprotocol.xyz/api/registry',
    hardness_test_endpoint: 'https://bobbyprotocol.xyz/api/hardness-test',
    contracts: {
      hardnessRegistry: HARDNESS_REGISTRY,
      agentEconomy: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871',
      convictionOracle: '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A',
      trackRecord: '0xF841b428E6d743187D7BE2242eccC1078fdE2395',
      adversarialBounties: '0xa8005ab465a0e02cb14824cd0e7630391fba673d',
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
      app: 'https://bobbyprotocol.xyz/agentic-world/bobby',
      submission: 'https://bobbyprotocol.xyz/submission',
      docs: 'https://bobbyprotocol.xyz/docs',
    },
  });
}
