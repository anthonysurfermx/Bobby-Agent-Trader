// ============================================================
// GET /api/checkpoint — Public proof checkpoint
// Consolidated status report: recent debates, trades, bounties,
// risk decisions, and continuity metrics.
// ============================================================

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { BOBBY_PROTOCOL_BASE_URL } from './_lib/protocol-constants.js';
import { bobbyDbUrl, bobbyReadKey } from './_lib/bobby-db.js';

import { WIN_RATE_MIN_SAMPLE as MIN_SAMPLE } from './_lib/sample.js';

export const config = { maxDuration: 15 };

const SB_URL = bobbyDbUrl();
const SB_KEY = bobbyReadKey();

async function sbQuery(table: string, query: string): Promise<unknown[]> {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    });
    if (!res.ok) return [];
    return await res.json() as unknown[];
  } catch { return []; }
}

interface CycleRow {
  id: string;
  symbol: string;
  direction: string;
  conviction_score: number;
  status: string;
  resolution: string;
  entry_price: number;
  stop_price: number;
  target_price: number;
  resolution_pnl_pct: number;
  created_at: string;
  trigger_reason: string;
  debate_quality: { overall_score?: number } | null;
}

interface StatsResponse {
  ok: boolean;
  chain: { id: number; name: string; nativeSymbol: string; explorerUrl: string };
  treasury: { balanceNative: string };
  contracts: {
    trackRecord: { stats: { totalTrades: string; totalCommitments: string; winRateBps: string } };
    adversarialBounties: { totalPosted: number };
    agentEconomy: { stats: { totalDebates: string; totalVolumeNative: string } };
  };
  protocolTotals: { protocolNotionalNative: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }

  const hoursBack = Math.min(Number(req.query.hours) || 4, 24);
  const since = new Date(Date.now() - hoursBack * 3600_000).toISOString();

  // Fetch recent debates and on-chain stats in parallel
  const [recentThreads, statsRes] = await Promise.all([
    sbQuery('forum_threads', `scope=eq.public&created_at=gte.${since}&order=created_at.desc&limit=20&select=id,symbol,direction,conviction_score,status,resolution,entry_price,stop_price,target_price,resolution_pnl_pct,created_at,trigger_reason,debate_quality`),
    fetch(`${BOBBY_PROTOCOL_BASE_URL}/api/bobby-protocol-stats`).then(r => r.ok ? r.json() : null).catch(() => null),
  ]);

  const threads = recentThreads as CycleRow[];
  const stats = statsRes as StatsResponse | null;

  // Classify debates
  // The cycle marks a thread 'active' even when the CIO took no trade: a debate counts as executed only
  // with evidence of a trade (a direction and complete entry/stop/target levels).
  const isTrade = (t: CycleRow) => (t.status === 'executed' || t.status === 'active')
    && !!t.direction && t.entry_price != null && t.stop_price != null && t.target_price != null;
  const isStandAside = (t: CycleRow) => !isTrade(t) && t.status !== 'rejected' && t.status !== 'stale';
  const executed = threads.filter(isTrade);
  const skipped = threads.filter(t => t.status === 'rejected' || t.status === 'stale');
  const stoodAside = threads.filter(isStandAside);
  const resolved = threads.filter(t => t.resolution === 'win' || t.resolution === 'loss' || t.resolution === 'break_even');
  const wins = resolved.filter(t => t.resolution === 'win').length;
  const losses = resolved.filter(t => t.resolution === 'loss').length;

  // Conviction distribution
  const convictions = threads.map(t => t.conviction_score).filter(c => c != null);
  const avgConviction = convictions.length > 0 ? convictions.reduce((a, b) => a + b, 0) / convictions.length : 0;
  const maxConviction = convictions.length > 0 ? Math.max(...convictions) : 0;

  // Risk decisions summary
  const riskDecisions = {
    total_debates: threads.length,
    executed: executed.length,
    blocked: skipped.length,
    stood_aside: stoodAside.length,
    block_rate_pct: threads.length > 0 ? Math.round((skipped.length / threads.length) * 100) : 0,
    avg_conviction: parseFloat((avgConviction * 10).toFixed(1)),
    max_conviction: parseFloat((maxConviction * 10).toFixed(1)),
    resolved_in_window: resolved.length,
    wins_in_window: wins,
    losses_in_window: losses,
  };

  // Latest debate detail
  const latest = threads[0] || null;
  const latestDebate = latest ? {
    symbol: latest.symbol,
    direction: latest.direction,
    conviction: parseFloat((latest.conviction_score * 10).toFixed(1)),
    decision: isTrade(latest) ? 'EXECUTE' : isStandAside(latest) ? 'STAND_ASIDE' : 'BLOCKED',
    reason: isStandAside(latest) ? 'No trade: the debate did not produce a direction with complete levels.' : latest.trigger_reason || (latest.conviction_score < 0.35 ? `Conviction ${(latest.conviction_score * 10).toFixed(1)}/10 below 3.5 threshold` : 'Passed all guardrails'),
    quality_score: latest.debate_quality?.overall_score ?? null,
    time: latest.created_at,
  } : null;

  // On-chain proof
  const onChain = stats ? {
    chain: stats.chain,
    treasury_native: stats.treasury.balanceNative,
    total_commitments: Number(stats.contracts.trackRecord.stats.totalCommitments),
    total_trades: Number(stats.contracts.trackRecord.stats.totalTrades),
    // A rate over fewer than MIN_SAMPLE resolved trades is not a performance signal.
    win_rate_pct: Number(stats.contracts.trackRecord.stats.totalTrades) >= MIN_SAMPLE ? Number(stats.contracts.trackRecord.stats.winRateBps) / 100 : null,
    win_rate_note: Number(stats.contracts.trackRecord.stats.totalTrades) >= MIN_SAMPLE ? null : `${Number(stats.contracts.trackRecord.stats.totalTrades)} resolved · insufficient sample (needs ${MIN_SAMPLE})`,
    total_bounties: stats.contracts.adversarialBounties.totalPosted,
    total_debates: Number(stats.contracts.agentEconomy.stats.totalDebates),
    protocol_volume_native: stats.protocolTotals.protocolNotionalNative,
  } : null;

  // Guardrails status
  const guardrailsActive = {
    conviction_gate: '3.5/10 minimum',
    circuit_breaker: riskDecisions.block_rate_pct > 80 ? 'TRIGGERED — high block rate' : 'ARMED',
    stop_loss: 'MANDATORY on every position',
    drawdown_kill_switch: 'ARMED — 20% max',
    yield_parking: riskDecisions.executed === 0 && threads.length > 0 ? 'ACTIVE — all debates blocked, evaluating yield' : 'STANDBY',
    fail_closed: true,
  };

  const checkpoint = {
    ok: true,
    protocol: 'Bobby Protocol',
    checkpoint_at: new Date().toISOString(),
    window_hours: hoursBack,
    since,
    risk_decisions: riskDecisions,
    latest_debate: latestDebate,
    on_chain: onChain,
    guardrails: guardrailsActive,
    links: {
      landing: `${BOBBY_PROTOCOL_BASE_URL}/protocol`,
      heartbeat: `${BOBBY_PROTOCOL_BASE_URL}/api/protocol-heartbeat`,
      reputation: `${BOBBY_PROTOCOL_BASE_URL}/api/reputation`,
      mcp: `${BOBBY_PROTOCOL_BASE_URL}/api/mcp-http`,
      submission: `${BOBBY_PROTOCOL_BASE_URL}/submission`,
    },
  };

  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
  return res.status(200).json(checkpoint);
}
