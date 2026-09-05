// ============================================================
// GET /api/reputation
// Public reputation endpoint — on-chain track record + economy
// stats for Bobby Protocol. Any agent can query this to assess
// Bobby's credibility before consuming paid tools.
//
// BP-11 (2026-09-04 review): the TrackRecord selectors are chosen from the
// deployment's DECLARED ABI version; a source that cannot be read reports
// itself `unavailable` and its numbers are null — never zeros under ok:true.
// BP-12: the advertised RPC is the static public endpoint, and no configured
// RPC URL (which may carry a provider key) can reach a response or a log.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Interface } from 'ethers';
import {
  BOBBY_AGENT_ECONOMY,
  BOBBY_ADVERSARIAL_BOUNTIES,
  PROTOCOL_CHAIN_ID,
  getEconomyStats,
  readMinBounty,
  readNextBountyId,
} from './_lib/protocol-payments.js';
import {
  BOBBY_CONVICTION_ORACLE,
  BOBBY_PROTOCOL_BASE_URL,
  BOBBY_TRACK_RECORD,
} from './_lib/protocol-constants.js';
import { DEFAULT_CHAIN } from './_lib/chains.js';
import { trackRecordSelectors } from './_lib/trackrecord-stats-adapter.js';
import { configuredRpcUrls, parseRpcJson, rpcEndpointLabel, rpcErrorMessage, scrubRpcSecrets } from './_lib/rpc-redact.js';

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
  // V2 (Base) splits ledgers per D-1 — the v1 combined selectors above do not
  // exist there. Reputation reports the VERIFIED ledger (the strong claim).
  'function getVerifiedWinRate() view returns (uint256)',
  'function winsVerified() view returns (uint256)',
  'function lossesVerified() view returns (uint256)',
  'function totalPnlBpsVerified() view returns (int256)',
]);

const SELECTORS = trackRecordSelectors(DEFAULT_CHAIN);
const RPC_URLS = configuredRpcUrls();

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  let lastError: Error | null = null;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`${rpcEndpointLabel(url)} responded ${res.status}`);
      const json = await parseRpcJson<{ result?: T; error?: { message?: string } }>(res, url);
      if (json.error) throw new Error(scrubRpcSecrets(json.error.message || '') || `${rpcEndpointLabel(url)} error`);
      if (json.result == null) throw new Error(`${rpcEndpointLabel(url)} returned no result`);
      return json.result as T;
    } catch (error) {
      lastError = new Error(rpcErrorMessage(error));
    }
  }
  throw lastError ?? new Error('all RPCs failed');
}

type Probe<T> = { ok: true; value: T } | { ok: false; error: string };

async function probe<T>(label: string, fn: () => Promise<T>): Promise<Probe<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    const message = rpcErrorMessage(err);
    console.error(`[reputation] ${label} unavailable:`, message);
    return { ok: false, error: message };
  }
}

async function callView(to: string, iface: Interface, fn: string): Promise<bigint> {
  const data = iface.encodeFunctionData(fn);
  const raw = await rpcCall<string>('eth_call', [{ to, data }, 'latest']);
  return BigInt(iface.decodeFunctionResult(fn, raw)[0].toString());
}

const num = (p: Probe<bigint>): number | null => (p.ok ? Number(p.value) : null);

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
    probe(`trackRecord.${SELECTORS.totalTrades}`, () => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, SELECTORS.totalTrades)),
    probe(`trackRecord.${SELECTORS.totalCommitments}`, () => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, SELECTORS.totalCommitments)),
    probe(`trackRecord.${SELECTORS.winRate}`, () => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, SELECTORS.winRate)),
    probe(`trackRecord.${SELECTORS.wins}`, () => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, SELECTORS.wins)),
    probe(`trackRecord.${SELECTORS.losses}`, () => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, SELECTORS.losses)),
    probe(`trackRecord.${SELECTORS.pnlBps}`, () => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, SELECTORS.pnlBps)),
    probe(`trackRecord.${SELECTORS.pendingCount}`, () => callView(TRACK_RECORD, TRACK_RECORD_INTERFACE, SELECTORS.pendingCount)),
    probe('oracle.symbolCount', () => callView(CONVICTION_ORACLE, ORACLE_INTERFACE, 'symbolCount')),
    probe('economy.getEconomyStats', getEconomyStats),
    probe('bounties.minBounty', readMinBounty),
    probe('bounties.nextBountyId', readNextBountyId),
  ]);

  const trackRecordProbes = [totalTrades, totalCommitments, winRateBps, wins, losses, totalPnlBps, pendingCount];
  const sources = {
    trackRecord: trackRecordProbes.every((p) => p.ok) ? 'ok' : 'unavailable',
    oracle: symbolCount.ok ? 'ok' : 'unavailable',
    economy: economyStats.ok ? 'ok' : 'unavailable',
    bounties: bountyMin.ok && bountyNextId.ok ? 'ok' : 'unavailable',
  } as const;
  const unavailable = (Object.keys(sources) as Array<keyof typeof sources>).filter((k) => sources[k] === 'unavailable');
  const allOk = unavailable.length === 0;

  const winRate = winRateBps.ok ? Number(winRateBps.value) / 100 : null;
  const pnlPct = totalPnlBps.ok ? Number(totalPnlBps.value) / 100 : null;
  const totalBounties = bountyNextId.ok ? Math.max(0, bountyNextId.value - 1) : null;
  const bountyEscrowNative = totalBounties !== null && bountyMin.ok
    ? (totalBounties * Number(bountyMin.value.minBountyNative || '0')).toFixed(4)
    : null;
  const protocolNotionalNative = economyStats.ok && bountyEscrowNative !== null
    ? (Number(economyStats.value.totalVolumeNative || '0') + Number(bountyEscrowNative)).toFixed(4)
    : null;

  // ── Composite Trust Score (0-100) ──
  // Weighted formula from on-chain data — no hardcoded values, and NO score at
  // all unless every input was actually read (BP-11: a missing source is not a
  // zero, so it cannot be averaged into a number).
  // Components:
  //   track_record (35%): win rate scaled 0-100
  //   activity      (25%): log-scaled commitments (100+ = full marks)
  //   economy       (20%): log-scaled total interactions (50+ = full marks)
  //   bounties      (10%): external challenges posted (10+ = full marks)
  //   integrity     (10%): commit-reveal ratio (commitments vs trades)
  let trustScore: {
    score: number | null;
    components: Record<string, { weight: number; raw: number }> | null;
    unavailable: string[];
  } = { score: null, components: null, unavailable: [...unavailable] };
  const nTrades = num(totalTrades);
  const nCommitments = num(totalCommitments);
  if (allOk && winRate !== null && nTrades !== null && nCommitments !== null && totalBounties !== null && economyStats.ok) {
    const nInteractions = Number(economyStats.value.totalPayments) + totalBounties;
    const trackScore = Math.min(winRate, 100);
    const activityScore = nCommitments > 0 ? Math.min(100, (Math.log10(nCommitments + 1) / Math.log10(101)) * 100) : 0;
    const economyScore = nInteractions > 0 ? Math.min(100, (Math.log10(nInteractions + 1) / Math.log10(51)) * 100) : 0;
    const bountyScore = Math.min(100, (totalBounties / 10) * 100);
    const integrityScore = nTrades > 0 ? Math.min(100, (nCommitments / Math.max(nTrades, 1)) * 100) : (nCommitments > 0 ? 100 : 0);
    trustScore = {
      score: Math.round(trackScore * 0.35 + activityScore * 0.25 + economyScore * 0.20 + bountyScore * 0.10 + integrityScore * 0.10),
      components: {
        track_record: { weight: 0.35, raw: trackScore },
        activity: { weight: 0.25, raw: activityScore },
        economy: { weight: 0.20, raw: economyScore },
        bounties: { weight: 0.10, raw: bountyScore },
        integrity: { weight: 0.10, raw: integrityScore },
      },
      unavailable: [],
    };
  }

  res.setHeader('Cache-Control', allOk ? 's-maxage=60, stale-while-revalidate=300' : 's-maxage=15, stale-while-revalidate=60');
  return res.status(200).json({
    ok: allOk,
    degraded: !allOk,
    sources,
    unavailable,
    protocol: 'Bobby Protocol',
    version: '3.1.0',
    chain: {
      id: PROTOCOL_CHAIN_ID,
      name: DEFAULT_CHAIN.name,
      nativeSymbol: DEFAULT_CHAIN.nativeSymbol,
      explorerUrl: DEFAULT_CHAIN.explorerUrl,
      // BP-12: the static public endpoint — never the configured override.
      rpc: DEFAULT_CHAIN.publicRpcUrl,
      trackRecordVersion: SELECTORS.version,
    },
    fetchedAt: new Date().toISOString(),

    trustScore: {
      ...trustScore,
      guardrails: {
        convictionGate: '3.5/10 minimum',
        mandatoryStopLoss: true,
        circuitBreaker: '3 consecutive losses',
        drawdownKillSwitch: '20% max',
        hardRiskGate: '$50/trade, 30% concentration',
        metacognition: 'auto-calibration on overconfidence',
        commitReveal: 'predictions on-chain before outcome',
        judgeMode: '6-dimension audit + bias detection',
        adversarialBounties: totalBounties === null ? 'unavailable' : `${totalBounties} posted`,
        yieldParking: 'autonomous de-risk on low conviction',
        agentAuth: 'EIP-191 signed mutations',
      },
      philosophy: 'fail-closed',
    },

    reputation: {
      ledger: SELECTORS.version === 'v2' ? 'verified' : 'combined',
      winRate,
      winRateRaw: winRateBps.ok ? winRateBps.value.toString() : null,
      totalTrades: nTrades,
      totalCommitments: nCommitments,
      pendingResolution: num(pendingCount),
      wins: num(wins),
      losses: num(losses),
      cumulativePnlBps: num(totalPnlBps),
      cumulativePnlPct: pnlPct,
    },

    oracle: {
      address: CONVICTION_ORACLE,
      symbolsTracked: num(symbolCount),
    },

    economy: {
      address: BOBBY_AGENT_ECONOMY,
      totalDebates: economyStats.ok ? Number(economyStats.value.totalDebates) : null,
      totalMcpCalls: economyStats.ok ? Number(economyStats.value.totalMcpCalls) : null,
      totalSignalAccesses: economyStats.ok ? Number(economyStats.value.totalSignalAccesses) : null,
      totalVolumeNative: economyStats.ok ? economyStats.value.totalVolumeNative : null,
      totalPayments: economyStats.ok ? Number(economyStats.value.totalPayments) : null,
    },

    protocolTotals: {
      bountyEscrowNative,
      totalBounties,
      protocolNotionalNative,
      totalInteractions: economyStats.ok && totalBounties !== null ? Number(economyStats.value.totalPayments) + totalBounties : null,
    },

    bounties: {
      address: BOBBY_ADVERSARIAL_BOUNTIES,
      verified: true,
      totalPosted: totalBounties,
      minBountyNative: bountyMin.ok ? bountyMin.value.minBountyNative : null,
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
