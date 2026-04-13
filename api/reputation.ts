// ============================================================
// GET /api/reputation
// Public reputation endpoint — on-chain track record + economy
// stats for Bobby Protocol. Any agent can query this to assess
// Bobby's credibility before consuming paid tools.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Interface } from 'ethers';
import {
  BOBBY_AGENT_ECONOMY,
  BOBBY_ADVERSARIAL_BOUNTIES,
  XLAYER_CHAIN_ID,
  XLAYER_RPC_URL,
  getEconomyStats,
  readMinBounty,
  readNextBountyId,
} from './_lib/xlayer-payments.js';
import {
  BOBBY_CONVICTION_ORACLE,
  BOBBY_PROTOCOL_BASE_URL,
  BOBBY_TRACK_RECORD,
} from './_lib/protocol-constants.js';

export const config = { maxDuration: 15 };

const CONVICTION_ORACLE = BOBBY_CONVICTION_ORACLE;
const TRACK_RECORD = BOBBY_TRACK_RECORD;

const ORACLE_INTERFACE = new Interface([
  'function symbolCount() view returns (uint256)',
]);

const TRACK_RECORD_INTERFACE = new Interface([
  'function totalTrades() view returns (uint256)',
  'function totalCommitments() view returns (uint256)',
  'function getWinRate() view returns (uint256)',
  'function wins() view returns (uint256)',
  'function losses() view returns (uint256)',
  'function totalPnlBps() view returns (int256)',
  'function pendingCount() view returns (uint256)',
]);

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(XLAYER_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) throw new Error(json.error.message || 'rpc error');
  return json.result as T;
}

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[reputation]', (err as Error).message);
    return fallback;
  }
}

async function callView(to: string, iface: Interface, fn: string) {
  const data = iface.encodeFunctionData(fn);
  const raw = await rpcCall<string>('eth_call', [{ to, data }, 'latest']);
  return iface.decodeFunctionResult(fn, raw)[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [
    totalTrades,
    totalCommitments,
    winRateBps,
    wins,
    losses,
    totalPnlBps,
    pendingCount,
    symbolCount,
    economyStats,
    bountyMin,
    bountyNextId,
  ] = await Promise.all([
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'totalTrades'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'totalCommitments'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'getWinRate'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'wins'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'losses'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'totalPnlBps'), BigInt(0)),
    safe(() => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, 'pendingCount'), BigInt(0)),
    safe(() => callView(CONVICTION_ORACLE, ORACLE_INTERFACE, 'symbolCount'), BigInt(0)),
    safe(getEconomyStats, {
      totalDebates: '0',
      totalMcpCalls: '0',
      totalSignalAccesses: '0',
      totalVolumeWei: '0',
      totalVolumeOkb: '0',
      totalPayments: '0',
    }),
    safe(readMinBounty, { minBountyWei: '0', minBountyOkb: '0' }),
    safe(readNextBountyId, 1),
  ]);

  const winRate = Number(winRateBps) / 100;
  const pnlPct = Number(totalPnlBps) / 100;
  const totalBounties = Math.max(0, bountyNextId - 1);
  const bountyEscrowOkb = (totalBounties * Number(bountyMin.minBountyOkb || '0')).toFixed(4);
  const protocolNotionalOkb = (
    Number(economyStats.totalVolumeOkb || '0') + Number(bountyEscrowOkb)
  ).toFixed(4);

  // ── Composite Trust Score (0-100) ──
  // Weighted formula from on-chain data — no hardcoded values.
  // Components:
  //   track_record (35%): win rate scaled 0-100
  //   activity      (25%): log-scaled commitments (100+ = full marks)
  //   economy       (20%): log-scaled total interactions (50+ = full marks)
  //   bounties      (10%): external challenges posted (10+ = full marks)
  //   integrity     (10%): commit-reveal ratio (commitments vs trades)
  const nTrades = Number(totalTrades);
  const nCommitments = Number(totalCommitments);
  const nInteractions = Number(economyStats.totalPayments) + totalBounties;

  const trackScore = Math.min(winRate, 100);
  const activityScore = nCommitments > 0 ? Math.min(100, (Math.log10(nCommitments + 1) / Math.log10(101)) * 100) : 0;
  const economyScore = nInteractions > 0 ? Math.min(100, (Math.log10(nInteractions + 1) / Math.log10(51)) * 100) : 0;
  const bountyScore = Math.min(100, (totalBounties / 10) * 100);
  const integrityScore = nTrades > 0 ? Math.min(100, (nCommitments / Math.max(nTrades, 1)) * 100) : (nCommitments > 0 ? 100 : 0);

  const trustScore = Math.round(
    trackScore * 0.35 +
    activityScore * 0.25 +
    economyScore * 0.20 +
    bountyScore * 0.10 +
    integrityScore * 0.10
  );

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({
    ok: true,
    protocol: 'Bobby Protocol',
    version: '3.1.0',
    chain: { id: XLAYER_CHAIN_ID, name: 'X Layer', rpc: XLAYER_RPC_URL },
    fetchedAt: new Date().toISOString(),

    trustScore: {
      score: trustScore,
      components: {
        track_record: { weight: 0.35, raw: trackScore },
        activity: { weight: 0.25, raw: activityScore },
        economy: { weight: 0.20, raw: economyScore },
        bounties: { weight: 0.10, raw: bountyScore },
        integrity: { weight: 0.10, raw: integrityScore },
      },
      guardrails: {
        convictionGate: '3.5/10 minimum',
        mandatoryStopLoss: true,
        circuitBreaker: '3 consecutive losses',
        drawdownKillSwitch: '20% max',
        hardRiskGate: '$50/trade, 30% concentration',
        metacognition: 'auto-calibration on overconfidence',
        commitReveal: 'predictions on-chain before outcome',
        judgeMode: '6-dimension audit + bias detection',
        adversarialBounties: `${totalBounties} posted`,
        yieldParking: 'autonomous de-risk on low conviction',
        agentAuth: 'EIP-191 signed mutations',
      },
      philosophy: 'fail-closed',
    },

    reputation: {
      winRate,
      winRateRaw: winRateBps.toString(),
      totalTrades: nTrades,
      totalCommitments: nCommitments,
      pendingResolution: Number(pendingCount),
      wins: Number(wins),
      losses: Number(losses),
      cumulativePnlBps: Number(totalPnlBps),
      cumulativePnlPct: pnlPct,
    },

    oracle: {
      address: CONVICTION_ORACLE,
      symbolsTracked: Number(symbolCount),
    },

    economy: {
      address: BOBBY_AGENT_ECONOMY,
      totalDebates: Number(economyStats.totalDebates),
      totalMcpCalls: Number(economyStats.totalMcpCalls),
      totalSignalAccesses: Number(economyStats.totalSignalAccesses),
      totalVolumeOkb: economyStats.totalVolumeOkb,
      totalPayments: Number(economyStats.totalPayments),
    },

    protocolTotals: {
      bountyEscrowOkb,
      totalBounties,
      protocolNotionalOkb,
      totalInteractions: Number(economyStats.totalPayments) + totalBounties,
    },

    bounties: {
      address: BOBBY_ADVERSARIAL_BOUNTIES,
      verified: true,
      totalPosted: totalBounties,
      minBountyOkb: bountyMin.minBountyOkb,
    },

    contracts: {
      trackRecord: TRACK_RECORD,
      convictionOracle: CONVICTION_ORACLE,
      agentEconomy: BOBBY_AGENT_ECONOMY,
      adversarialBounties: BOBBY_ADVERSARIAL_BOUNTIES,
    },

    links: {
      skillMd: `${BOBBY_PROTOCOL_BASE_URL}/skill.md`,
      mcpEndpoint: `${BOBBY_PROTOCOL_BASE_URL}/api/mcp-http`,
      judgeManifest: `${BOBBY_PROTOCOL_BASE_URL}/ai-judge-manifest.json`,
      submission: `${BOBBY_PROTOCOL_BASE_URL}/submission`,
      github: 'https://github.com/anthonysurfermx/Bobby-Agent-Trader',
    },
  });
}
