// ============================================================
// GET /api/registry
// Public agent registry — machine-readable catalog of Bobby's
// agents, MCP tools, contracts, and capabilities. Other protocols
// can discover Bobby automatically by fetching this endpoint.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { maxDuration: 5 };

const AGENTS = [
  {
    id: 'alpha',
    name: 'Alpha Hunter',
    role: 'opportunity_scout',
    model: 'claude-haiku-4-5-20251001',
    description: 'Proposes long/short theses from on-chain and market data',
    capabilities: ['market_analysis', 'signal_detection', 'thesis_generation'],
    biasRisk: ['recency_bias', 'confirmation_bias', 'anchoring'],
  },
  {
    id: 'redteam',
    name: 'Red Team',
    role: 'adversarial_critic',
    model: 'claude-sonnet-4-20250514',
    description: 'Attacks every thesis before capital is committed',
    capabilities: ['risk_assessment', 'counterargument', 'stress_testing'],
    biasRisk: ['negativity_bias', 'loss_aversion', 'status_quo_bias'],
  },
  {
    id: 'cio',
    name: 'Bobby CIO',
    role: 'final_decision',
    model: 'claude-sonnet-4-20250514',
    description: 'Weighs both sides and emits the final conviction score',
    capabilities: ['portfolio_management', 'conviction_scoring', 'execution_decision'],
    biasRisk: ['authority_bias', 'overconfidence', 'sunk_cost'],
  },
];

const TOOLS = {
  free: [
    { name: 'bobby_intel', description: 'Full intelligence briefing (10 sources)', cost: '0' },
    { name: 'bobby_ta', description: 'Technical analysis (SMA, RSI, MACD, Bollinger)', cost: '0' },
    { name: 'bobby_stats', description: 'Track record (win rate, PnL, trades)', cost: '0' },
    { name: 'bobby_xlayer_signals', description: 'Smart money signals on X Layer', cost: '0' },
    { name: 'bobby_xlayer_quote', description: 'DEX swap quote on X Layer', cost: '0' },
    { name: 'bobby_wallet_balance', description: 'Agentic wallet balance', cost: '0' },
    { name: 'bobby_dex_trending', description: 'Trending tokens on-chain', cost: '0' },
    { name: 'bobby_dex_signals', description: 'Smart money / whale / KOL signals', cost: '0' },
    { name: 'bobby_bounty_list', description: 'List recent adversarial bounties', cost: '0' },
    { name: 'bobby_bounty_get', description: 'Get single bounty details', cost: '0' },
  ],
  premium: [
    {
      name: 'bobby_analyze',
      description: 'Full market analysis with conviction score',
      cost: '0.001 OKB',
      breakdown: ['Alpha Hunter (thesis)', 'Red Team (attack)', 'CIO (verdict)'],
    },
    {
      name: 'bobby_debate',
      description: '3-agent debate on any trading question',
      cost: '0.001 OKB',
      breakdown: ['Alpha Hunter (bull case)', 'Red Team (bear case)', 'CIO (synthesis)'],
    },
    {
      name: 'bobby_judge',
      description: 'Judge Mode audit on 6 dimensions',
      cost: '0.001 OKB',
      breakdown: ['Data', 'Adversarial', 'Logic', 'Risk', 'Calibration', 'Novelty'],
    },
    {
      name: 'bobby_security_scan',
      description: 'Token contract honeypot/rug risk scan',
      cost: '0.001 OKB',
      breakdown: ['Contract analysis', 'Liquidity check', 'Risk scoring'],
    },
    {
      name: 'bobby_wallet_portfolio',
      description: 'Portfolio analysis (multi-chain)',
      cost: '0.001 OKB',
      breakdown: ['Token balances', 'DeFi positions', 'Risk assessment'],
    },
  ],
  bounty: [
    { name: 'bobby_bounty_post', description: 'Build calldata to post a bounty', cost: '0 (gas only)' },
    { name: 'bobby_bounty_challenge', description: 'Build calldata to challenge a bounty', cost: '0 (gas only)' },
  ],
};

const CONTRACTS = {
  agentEconomy: { address: '0xD9540D770C8aF67e9E6412C92D78E34bc11ED871', purpose: 'x402 payment settlement' },
  convictionOracle: { address: '0x03FA39B3a5B316B7cAcDabD3442577EE32Ab5f3A', purpose: 'Real-time conviction feed' },
  trackRecord: { address: '0xF841b428E6d743187D7BE2242eccC1078fdE2395', purpose: 'Commit-reveal track record' },
  adversarialBounties: { address: '0xa8005ab465a0e02cb14824cd0e7630391fba673d', purpose: 'Pay-to-challenge bounties', verified: true },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    protocol: 'Bobby Protocol',
    version: '3.0.0',
    chain: { id: 196, name: 'X Layer', rpc: 'https://xlayerrpc.okx.com/' },
    agents: AGENTS,
    tools: TOOLS,
    contracts: CONTRACTS,
    judgeDimensions: [
      'DATA_INTEGRITY',
      'ADVERSARIAL_QUALITY',
      'DECISION_LOGIC',
      'RISK_MANAGEMENT',
      'CALIBRATION_ALIGNMENT',
      'NOVELTY',
    ],
    endpoints: {
      mcp: 'https://bobbyprotocol.xyz/api/mcp-http',
      reputation: 'https://bobbyprotocol.xyz/api/reputation',
      registry: 'https://bobbyprotocol.xyz/api/registry',
      activity: 'https://bobbyprotocol.xyz/api/activity',
      skillMd: 'https://bobbyprotocol.xyz/skill.md',
      judgeManifest: 'https://bobbyprotocol.xyz/ai-judge-manifest.json',
    },
  });
}
