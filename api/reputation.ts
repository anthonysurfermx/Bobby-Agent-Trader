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
import { DEFAULT_CHAIN } from './_lib/chains.js';
import { isTrackRecordV2, readTrackRecordPublicStats } from './_lib/track-record-v2.js';

export const config = { maxDuration: 15 };

const CONVICTION_ORACLE = BOBBY_CONVICTION_ORACLE;
const TRACK_RECORD = BOBBY_TRACK_RECORD;

const ORACLE_INTERFACE = new Interface([
  'function symbolCount() view returns (uint256)',
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
    trackRecord,
    symbolCount,
    economyStats,
    bountyMin,
    bountyNextId,
  ] = await Promise.all([
    safe(
      () => readTrackRecordPublicStats(
        (data) => rpcCall<string>('eth_call', [{ to: TRACK_RECORD, data }, 'latest']),
        isTrackRecordV2(DEFAULT_CHAIN.id),
      ),
      {
        version: isTrackRecordV2(DEFAULT_CHAIN.id) ? 'v2' as const : 'v1' as const,
        totalTrades: '0', totalCommitments: '0', winRateBps: '0', wins: '0', losses: '0',
        totalPnlBps: '0', pending: '0', resolutionBps: '0',
      },
    ),
    safe(() => callView(CONVICTION_ORACLE, ORACLE_INTERFACE, 'symbolCount'), BigInt(0)),
    safe(getEconomyStats, {
      totalDebates: '0',
      totalMcpCalls: '0',
      totalSignalAccesses: '0',
      totalVolumeWei: '0',
      totalVolumeNative: '0',
      totalPayments: '0',
    }),
    safe(readMinBounty, { minBountyWei: '0', minBountyNative: '0', minBountyOkb: '0' }),
    safe(readNextBountyId, 1),
  ]);

  const winRate = Number(trackRecord.winRateBps) / 100;
  const pnlPct = Number(trackRecord.totalPnlBps) / 100;
  const totalBounties = Math.max(0, bountyNextId - 1);
  const bountyEscrowNative = (totalBounties * Number(bountyMin.minBountyNative || '0')).toFixed(4);
  const protocolNotionalNative = (
    Number(economyStats.totalVolumeNative || '0') + Number(bountyEscrowNative)
  ).toFixed(4);

  // ── Composite Trust Score (0-100) ──
  // Weighted formula from on-chain data — no hardcoded values.
  // Components:
  //   track_record (35%): win rate scaled 0-100
  //   activity      (25%): log-scaled commitments (100+ = full marks)
  //   economy       (20%): log-scaled total interactions (50+ = full marks)
  //   bounties      (10%): external challenges posted (10+ = full marks)
  //   integrity     (10%): commit-reveal ratio (commitments vs trades)
  const nTrades = trackRecord.verified ? Number(trackRecord.verified.resolved) : Number(trackRecord.totalTrades);
  const nCommitments = trackRecord.verified
    ? Number(trackRecord.verified.resolved) + Number(trackRecord.verified.expired) + Number(trackRecord.verified.pending)
    : Number(trackRecord.totalCommitments);
  const nInteractions = Number(economyStats.totalPayments) + totalBounties;

  const resolutionFactor = trackRecord.version === 'v2'
    ? Math.min(1, Number(trackRecord.resolutionBps) / 10_000)
    : 1;
  const trackScore = Math.min(winRate, 100) * resolutionFactor;
  const activityScore = nCommitments > 0 ? Math.min(100, (Math.log10(nCommitments + 1) / Math.log10(101)) * 100) : 0;
  const economyScore = nInteractions > 0 ? Math.min(100, (Math.log10(nInteractions + 1) / Math.log10(51)) * 100) : 0;
  const bountyScore = Math.min(100, (totalBounties / 10) * 100);
  const integrityScore = trackRecord.version === 'v2'
    ? resolutionFactor * 100
    : nTrades > 0
      ? Math.min(100, (nTrades / Math.max(nCommitments, 1)) * 100)
      : 0;

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
    chain: {
      id: XLAYER_CHAIN_ID,
      name: DEFAULT_CHAIN.name,
      nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
      explorerUrl: DEFAULT_CHAIN.explorerUrl,
      rpc: XLAYER_RPC_URL,
    },
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
      version: trackRecord.version,
      winRate,
      winRateRaw: trackRecord.winRateBps,
      resolutionRate: Number(trackRecord.resolutionBps) / 100,
      totalTrades: nTrades,
      totalCommitments: nCommitments,
      pendingResolution: Number(trackRecord.pending),
      wins: Number(trackRecord.wins),
      losses: Number(trackRecord.losses),
      cumulativePnlBps: Number(trackRecord.totalPnlBps),
      cumulativePnlPct: pnlPct,
      attested: trackRecord.attested || null,
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
      totalVolumeNative: economyStats.totalVolumeNative,
      totalPayments: Number(economyStats.totalPayments),
    },

    protocolTotals: {
      bountyEscrowNative,
      totalBounties,
      protocolNotionalNative,
      totalInteractions: Number(economyStats.totalPayments) + totalBounties,
    },

    bounties: {
      address: BOBBY_ADVERSARIAL_BOUNTIES,
      verified: true,
      totalPosted: totalBounties,
      minBountyNative: bountyMin.minBountyNative,
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
