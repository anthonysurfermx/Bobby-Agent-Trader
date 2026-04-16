// ============================================================
// polymarket — smart-money leaderboard + consensus aggregator.
// Single source of truth; previously duplicated between agent-run.ts
// and bobby-intel.ts. Wrapped with the TTL cache so both callers hit
// the same `polymarket:consensus:v1` entry — one leaderboard + 15
// position fetches per 5-minute window regardless of which path asked.
// ============================================================

import { cached } from './api-cache';

const POLY_DATA = 'https://data-api.polymarket.com';

export interface PolyLeaderboardEntry {
  proxyWallet: string;
  userName: string;
  rank: number;
  pnl: number;
  volume: number;
}

export interface PolyPosition {
  conditionId: string;
  title: string;
  outcome: string;
  size: number;
  avgPrice: number;
  curPrice: number;
  currentValue: number;
  slug: string;
}

export interface SmartMoneyConsensus {
  conditionId: string;
  title: string;
  slug: string;
  traderCount: number;
  totalCapital: number;
  topOutcome: string;
  topOutcomePct: number;
  avgEntryPrice: number;
  currentPrice: number;
  edgePct: number;
}

export async function fetchPolyLeaderboard(limit = 15): Promise<PolyLeaderboardEntry[]> {
  try {
    const res = await fetch(
      `${POLY_DATA}/v1/leaderboard?limit=${limit}&timePeriod=MONTH&category=OVERALL`,
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((t: Record<string, unknown>) => ({
      proxyWallet: String(t.proxyWallet || ''),
      userName: String(t.userName || 'Unknown'),
      rank: Number(t.rank || 0),
      pnl: Number(t.pnl || 0),
      volume: Number(t.volume || 0),
    }));
  } catch {
    return [];
  }
}

export async function fetchPolyPositions(wallet: string): Promise<PolyPosition[]> {
  try {
    const res = await fetch(`${POLY_DATA}/positions?user=${wallet}&limit=100&sortBy=CURRENT`);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter((p: Record<string, unknown>) => Number(p.currentValue || 0) > 0.5)
      .map((p: Record<string, unknown>) => ({
        conditionId: String(p.conditionId || ''),
        title: String(p.title || ''),
        outcome: String(p.outcome || ''),
        size: Number(p.size || 0),
        avgPrice: Number(p.avgPrice || 0),
        curPrice: Number(p.curPrice || 0),
        currentValue: Number(p.currentValue || 0),
        slug: String(p.slug || ''),
      }));
  } catch {
    return [];
  }
}

/**
 * Group positions across traders by conditionId, return the top-10 markets
 * ranked by distinct-trader count, with >=2 traders required. Drops markets
 * where nobody has meaningful capital.
 */
export function aggregatePolyConsensus(
  traders: Array<{ proxyWallet: string }>,
  positionsByWallet: Map<string, PolyPosition[]>,
): SmartMoneyConsensus[] {
  const marketMap = new Map<
    string,
    {
      title: string;
      slug: string;
      traders: Set<string>;
      outcomeCapital: Map<string, number>;
      totalCapital: number;
      entryPrices: number[];
      currentPrices: number[];
    }
  >();

  for (const trader of traders) {
    const positions = positionsByWallet.get(trader.proxyWallet) || [];
    for (const pos of positions) {
      if (!pos.conditionId) continue;
      let market = marketMap.get(pos.conditionId);
      if (!market) {
        market = {
          title: pos.title,
          slug: pos.slug,
          traders: new Set(),
          outcomeCapital: new Map(),
          totalCapital: 0,
          entryPrices: [],
          currentPrices: [],
        };
        marketMap.set(pos.conditionId, market);
      }
      market.traders.add(trader.proxyWallet);
      market.outcomeCapital.set(
        pos.outcome,
        (market.outcomeCapital.get(pos.outcome) || 0) + pos.currentValue,
      );
      market.totalCapital += pos.currentValue;
      market.entryPrices.push(pos.avgPrice);
      market.currentPrices.push(pos.curPrice);
    }
  }

  const results: SmartMoneyConsensus[] = [];
  for (const [conditionId, m] of marketMap) {
    if (m.traders.size < 2) continue;

    let topOutcome = '';
    let topCapital = 0;
    for (const [outcome, capital] of m.outcomeCapital) {
      if (capital > topCapital) {
        topOutcome = outcome;
        topCapital = capital;
      }
    }

    const avgEntry = m.entryPrices.reduce((a, b) => a + b, 0) / m.entryPrices.length;
    const avgCurrent = m.currentPrices.reduce((a, b) => a + b, 0) / m.currentPrices.length;

    results.push({
      conditionId,
      title: m.title,
      slug: m.slug,
      traderCount: m.traders.size,
      totalCapital: m.totalCapital,
      topOutcome,
      topOutcomePct: m.totalCapital > 0 ? (topCapital / m.totalCapital) * 100 : 0,
      avgEntryPrice: avgEntry,
      currentPrice: avgCurrent,
      edgePct: avgCurrent > 0 ? ((avgCurrent - avgEntry) / avgEntry) * 100 : 0,
    });
  }

  results.sort((a, b) => b.traderCount - a.traderCount || b.totalCapital - a.totalCapital);
  return results.slice(0, 10);
}

export interface CollectOptions {
  logPrefix?: string;
  /** Suppress cache-miss / result-count logs. Used by bobby-intel where
   *  this runs on every dashboard hit and logs are noisy. */
  silent?: boolean;
}

/**
 * Fetch leaderboard, pull top-15 traders' positions in batches of 5, and
 * aggregate into consensus markets. Wrapped with a 5min TTL cache shared
 * across all callers — one upstream fetch per window regardless of how
 * many agent cycles or dashboards ask.
 */
export async function collectPolymarketIntelligence(
  options: CollectOptions = {},
): Promise<SmartMoneyConsensus[]> {
  const logPrefix = options.logPrefix || '[Polymarket]';
  return cached<SmartMoneyConsensus[]>('polymarket:consensus:v1', 300, async () => {
    if (!options.silent) console.log(`${logPrefix} Fetching leaderboard (cache miss)...`);
    const traders = await fetchPolyLeaderboard(15);
    if (traders.length === 0) return [];

    if (!options.silent) console.log(`${logPrefix} ${traders.length} top traders, fetching positions...`);
    const positionsByWallet = new Map<string, PolyPosition[]>();

    for (let i = 0; i < traders.length; i += 5) {
      const batch = traders.slice(i, i + 5);
      const results = await Promise.allSettled(batch.map((t) => fetchPolyPositions(t.proxyWallet)));
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
          positionsByWallet.set(batch[idx].proxyWallet, r.value);
        }
      });
    }

    const consensus = aggregatePolyConsensus(traders, positionsByWallet);
    if (!options.silent) console.log(`${logPrefix} ${consensus.length} consensus markets found`);
    return consensus;
  });
}
