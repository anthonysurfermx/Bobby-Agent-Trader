// ============================================================
// useSmartMoneyScan — Extracts smart money scan logic from PolymarketTrackerPage
// Reusable hook for both AgentRadarLanding (autoStart) and Advanced View
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  polymarketService,
  type LeaderboardEntry,
  type SmartMoneyMarket,
  type SmartMoneyTrader,
  type PolymarketPosition,
  type OutcomeBias,
  type WhaleSignal,
  type TraderPortfolio,
} from '@/services/polymarket.service';
import type { AgentLogEntry } from '@/components/claw-trader/AgentActivityLog';

// ─── Pure function: aggregate positions into market consensus ───

function aggregateSmartMoney(
  leaderboard: LeaderboardEntry[],
  positionsByTrader: Map<string, PolymarketPosition[]>
): SmartMoneyMarket[] {
  const marketMap = new Map<string, {
    conditionId: string;
    title: string;
    slug: string;
    traders: SmartMoneyTrader[];
    outcomeCapital: Map<string, number>;
    outcomeHeadcount: Map<string, number>;
    totalPnl: number;
    latestPrice: number;
    totalEntryWeighted: number;
    totalEntryCapital: number;
    entryPriceMin: number;
    entryPriceMax: number;
  }>();

  for (const trader of leaderboard) {
    const positions = positionsByTrader.get(trader.proxyWallet) || [];
    for (const pos of positions) {
      const key = pos.conditionId || pos.title;
      if (!key || pos.currentValue < 0.5) continue;

      let entry = marketMap.get(key);
      if (!entry) {
        entry = {
          conditionId: pos.conditionId,
          title: pos.title,
          slug: pos.slug || pos.eventSlug,
          traders: [],
          outcomeCapital: new Map(),
          outcomeHeadcount: new Map(),
          totalPnl: 0,
          latestPrice: pos.curPrice,
          totalEntryWeighted: 0,
          totalEntryCapital: 0,
          entryPriceMin: Infinity,
          entryPriceMax: 0,
        };
        marketMap.set(key, entry);
      }

      const side = pos.outcome || 'Unknown';
      entry.outcomeCapital.set(side, (entry.outcomeCapital.get(side) || 0) + pos.currentValue);
      entry.outcomeHeadcount.set(side, (entry.outcomeHeadcount.get(side) || 0) + 1);
      entry.totalPnl += pos.cashPnl;
      if (pos.curPrice > 0) entry.latestPrice = pos.curPrice;
      if (pos.avgPrice > 0 && pos.currentValue > 0) {
        entry.totalEntryWeighted += pos.avgPrice * pos.currentValue;
        entry.totalEntryCapital += pos.currentValue;
        entry.entryPriceMin = Math.min(entry.entryPriceMin, pos.avgPrice);
        entry.entryPriceMax = Math.max(entry.entryPriceMax, pos.avgPrice);
      }

      entry.traders.push({
        address: trader.proxyWallet,
        name: trader.userName || `${trader.proxyWallet.slice(0, 6)}...${trader.proxyWallet.slice(-4)}`,
        profileImage: trader.profileImage,
        rank: trader.rank,
        pnl: trader.pnl,
        volume: trader.volume,
        outcome: side,
        positionValue: pos.currentValue,
        entryPrice: pos.avgPrice,
        currentPnl: pos.cashPnl,
        xUsername: trader.xUsername,
      });
    }
  }

  const results: SmartMoneyMarket[] = [];
  for (const entry of marketMap.values()) {
    if (entry.traders.length < 2) continue;

    const totalCapital = Array.from(entry.outcomeCapital.values()).reduce((a, b) => a + b, 0);
    const totalHeads = Array.from(entry.outcomeHeadcount.values()).reduce((a, b) => a + b, 0);
    const outcomeBias: OutcomeBias[] = [];
    for (const [outcome, capital] of entry.outcomeCapital) {
      outcomeBias.push({
        outcome,
        capital,
        headcount: entry.outcomeHeadcount.get(outcome) || 0,
      });
    }
    outcomeBias.sort((a, b) => b.capital - a.capital);

    const top = outcomeBias[0];
    const topCapitalPct = totalCapital > 0 ? Math.round((top.capital / totalCapital) * 100) : 0;
    const topHeadPct = totalHeads > 0 ? Math.round((top.headcount / totalHeads) * 100) : 0;

    const capitalConsensus = Math.round(Math.abs(topCapitalPct - (100 / outcomeBias.length)) * (outcomeBias.length / (outcomeBias.length - 1)));
    const headConsensus = Math.round(Math.abs(topHeadPct - (100 / outcomeBias.length)) * (outcomeBias.length / (outcomeBias.length - 1)));

    results.push({
      conditionId: entry.conditionId,
      title: entry.title,
      slug: entry.slug,
      traderCount: entry.traders.length,
      totalCapital,
      topOutcome: top.outcome,
      topOutcomeCapitalPct: topCapitalPct,
      topOutcomeHeadPct: topHeadPct,
      capitalConsensus: Math.min(capitalConsensus, 100),
      headConsensus: Math.min(headConsensus, 100),
      outcomeBias,
      avgPnl: entry.totalPnl / entry.traders.length,
      currentPrice: entry.latestPrice,
      traders: entry.traders.sort((a, b) => b.positionValue - a.positionValue),
      avgEntryPrice: entry.totalEntryCapital > 0 ? entry.totalEntryWeighted / entry.totalEntryCapital : 0,
      entryPriceMin: entry.entryPriceMin === Infinity ? 0 : entry.entryPriceMin,
      entryPriceMax: entry.entryPriceMax,
      marketPrice: entry.latestPrice,
      edgePercent: 0,
      edgeDirection: 'NEUTRAL' as const,
    });
  }

  results.sort((a, b) => {
    if (b.traderCount !== a.traderCount) return b.traderCount - a.traderCount;
    return b.capitalConsensus - a.capitalConsensus;
  });

  return results;
}

// ─── Hook ───

interface UseSmartMoneyScanOptions {
  autoStart?: boolean;
  category?: string;
  timePeriod?: string;
  walletCount?: number;
}

export function useSmartMoneyScan(options: UseSmartMoneyScanOptions = {}) {
  const {
    autoStart = false,
    category: initialCategory = 'OVERALL',
    timePeriod: initialTimePeriod = 'MONTH',
    walletCount: initialWalletCount = 50,
  } = options;

  const [markets, setMarkets] = useState<SmartMoneyMarket[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [whaleSignals, setWhaleSignals] = useState<WhaleSignal[]>([]);
  const [portfolios, setPortfolios] = useState<TraderPortfolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>([]);

  const [category, setCategory] = useState(initialCategory);
  const [timePeriod, setTimePeriod] = useState(initialTimePeriod);
  const [walletCount, setWalletCount] = useState(initialWalletCount);
  const [sort, setSort] = useState<'consensus' | 'capital' | 'traders' | 'aiscore'>('traders');

  const startedRef = useRef(false);

  const addLog = useCallback((agent: AgentLogEntry['agent'], message: string, status?: AgentLogEntry['status']) => {
    setAgentLog(prev => [...prev, { agent, message, timestamp: Date.now(), status }]);
  }, []);

  const startScan = useCallback(async () => {
    setLoading(true);
    setMarkets([]);
    setWhaleSignals([]);
    setPortfolios([]);
    setAgentLog([]);
    setProgress('Fetching leaderboard...');
    addLog('scout', 'Initializing scan — fetching top trader leaderboard...');

    const cacheKey = `smartmoney_${category}_${timePeriod}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          setLeaderboard(parsed.leaderboard);
          setMarkets(parsed.markets);
          addLog('scout', `Loaded from cache — ${parsed.markets.length} markets`, 'success');
          setLoading(false);
          setProgress('');
          return;
        }
      }
    } catch { /* cache miss */ }

    const lb = await polymarketService.getLeaderboard(category, timePeriod, walletCount);
    if (lb.length === 0) {
      addLog('scout', 'Failed to fetch leaderboard', 'error');
      setLoading(false);
      setProgress('');
      return;
    }
    setLeaderboard(lb);
    addLog('scout', `Found ${lb.length} traders. Scanning positions...`, 'success');

    // Batched concurrency
    const BATCH_SIZE = 5;
    const positionsByTrader = new Map<string, PolymarketPosition[]>();
    let completed = 0;

    for (let i = 0; i < lb.length; i += BATCH_SIZE) {
      const batch = lb.slice(i, i + BATCH_SIZE);
      setProgress(`Scanning wallets ${completed + 1}-${Math.min(completed + batch.length, lb.length)} of ${lb.length}...`);

      const results = await Promise.allSettled(
        batch.map(async (trader) => {
          const positions = await polymarketService.getAgentPositions(trader.proxyWallet);
          const active = positions.filter(p => p.currentValue > 0.5);
          return { wallet: trader.proxyWallet, positions: active };
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          positionsByTrader.set(r.value.wallet, r.value.positions);
        }
      }
      completed += batch.length;
    }

    addLog('scout', `Scanned ${positionsByTrader.size} wallets with active positions`, 'success');
    addLog('strategist', 'Aggregating consensus across markets...');
    setProgress('Aggregating consensus...');
    const aggMarkets = aggregateSmartMoney(lb, positionsByTrader);
    addLog('strategist', `Found ${aggMarkets.length} markets with smart money overlap`, 'success');

    // Fetch market prices for edge
    addLog('strategist', 'Calculating edge: market prices vs entry prices...');
    setProgress('Fetching market prices...');
    const conditionIds = aggMarkets.slice(0, 20).map(m => m.conditionId).filter(Boolean);
    const marketPrices = await polymarketService.getMarketPrices(conditionIds);
    for (const m of aggMarkets) {
      const mktPrice = marketPrices.get(m.conditionId);
      if (mktPrice !== undefined && mktPrice > 0) {
        m.marketPrice = mktPrice;
        if (m.avgEntryPrice > 0) {
          m.edgePercent = Math.round((mktPrice - m.avgEntryPrice) * 100);
          m.edgeDirection = m.edgePercent > 3 ? 'PROFIT' : m.edgePercent < -3 ? 'UNDERWATER' : 'NEUTRAL';
        }
      }
    }

    // Whale signals (top 15 traders)
    addLog('scout', 'Scanning whale activity — last 72h trades from top 15...');
    setProgress('Scanning whale activity...');
    const signals: WhaleSignal[] = [];
    const now = Date.now() / 1000;
    const tradeBatch = lb.slice(0, 15);
    for (let i = 0; i < tradeBatch.length; i += 5) {
      const batch = tradeBatch.slice(i, i + 5);
      const tradeResults = await Promise.allSettled(
        batch.map(t => polymarketService.getRecentTradesForWallet(t.proxyWallet, 30))
      );
      tradeResults.forEach((r, idx) => {
        if (r.status !== 'fulfilled') return;
        const trader = batch[idx];
        const traderPositions = positionsByTrader.get(trader.proxyWallet) || [];
        const portfolioValue = traderPositions.reduce((a, p) => a + p.currentValue, 0);
        for (const trade of r.value) {
          const hoursAgo = (now - trade.timestamp) / 3600;
          if (hoursAgo > 72) continue;
          const conviction = portfolioValue > 0 ? Math.round((trade.usdcSize / portfolioValue) * 100) : 0;
          signals.push({
            traderName: trader.userName || `${trader.proxyWallet.slice(0, 6)}...`,
            traderRank: trader.rank,
            traderPnl: trader.pnl,
            address: trader.proxyWallet,
            marketTitle: trade.title,
            marketSlug: trade.slug,
            outcome: trade.outcome,
            side: trade.side,
            size: trade.size,
            price: trade.price,
            usdcSize: trade.usdcSize,
            timestamp: trade.timestamp,
            hoursAgo: Math.round(hoursAgo),
            conviction,
          });
        }
      });
    }
    signals.sort((a, b) => b.timestamp - a.timestamp);
    setWhaleSignals(signals);
    addLog('scout', `Detected ${signals.length} whale signals in last 72h`, 'success');

    // Portfolio analysis
    addLog('strategist', 'Analyzing portfolio concentration & hedges...');
    setProgress('Analyzing portfolios...');
    const portfs: TraderPortfolio[] = [];
    for (const trader of lb.slice(0, 30)) {
      const positions = positionsByTrader.get(trader.proxyWallet) || [];
      if (positions.length === 0) continue;
      const totalValue = positions.reduce((a, p) => a + p.currentValue, 0);
      if (totalValue < 1) continue;

      const shares = positions.map(p => p.currentValue / totalValue);
      const hhi = shares.reduce((a, s) => a + s * s, 0);
      const concentration = Math.round(hhi * 100);

      const sorted = [...positions].sort((a, b) => b.currentValue - a.currentValue);
      const topPos = sorted[0];

      const convictionBets = sorted
        .filter(p => (p.currentValue / totalValue) > 0.15)
        .map(p => ({
          title: p.title,
          value: p.currentValue,
          pctOfPortfolio: Math.round((p.currentValue / totalValue) * 100),
          outcome: p.outcome,
        }));

      const byCondition = new Map<string, PolymarketPosition[]>();
      for (const p of positions) {
        const key = p.conditionId || p.title;
        const arr = byCondition.get(key) || [];
        arr.push(p);
        byCondition.set(key, arr);
      }
      const hedges: TraderPortfolio['hedges'] = [];
      for (const [, posGroup] of byCondition) {
        const outcomes = new Set(posGroup.map(p => p.outcome));
        if (outcomes.size > 1) {
          const yesCapital = posGroup.filter(p => p.outcome.toLowerCase() === 'yes').reduce((a, p) => a + p.currentValue, 0);
          const noCapital = posGroup.filter(p => p.outcome.toLowerCase() !== 'yes').reduce((a, p) => a + p.currentValue, 0);
          hedges.push({ market: posGroup[0].title, yesCapital, noCapital });
        }
      }

      portfs.push({
        address: trader.proxyWallet,
        name: trader.userName || `${trader.proxyWallet.slice(0, 6)}...`,
        rank: trader.rank,
        pnl: trader.pnl,
        totalValue,
        positionCount: positions.length,
        topPosition: topPos ? { title: topPos.title, value: topPos.currentValue, pctOfPortfolio: Math.round((topPos.currentValue / totalValue) * 100) } : null,
        concentration,
        categories: [],
        hedges,
        convictionBets,
      });
    }
    portfs.sort((a, b) => b.totalValue - a.totalValue);
    setPortfolios(portfs);
    addLog('strategist', `Built ${portfs.length} portfolio profiles`, 'success');

    setMarkets(aggMarkets);
    addLog('executor', `Scan complete — ${aggMarkets.length} markets ranked by consensus`, 'success');
    setLoading(false);
    setProgress('');

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), leaderboard: lb, markets: aggMarkets }));
    } catch { /* storage full */ }
  }, [category, timePeriod, walletCount, addLog]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      startScan();
    }
  }, [autoStart, startScan]);

  // Sorted markets
  const sortedMarkets = useMemo(() =>
    [...markets].sort((a, b) => {
      if (sort === 'capital') return b.totalCapital - a.totalCapital;
      if (sort === 'consensus') return b.capitalConsensus - a.capitalConsensus;
      return b.traderCount - a.traderCount;
    }),
    [markets, sort]
  );

  return {
    // Data
    markets,
    sortedMarkets,
    leaderboard,
    whaleSignals,
    portfolios,
    agentLog,

    // Status
    loading,
    progress,

    // Actions
    startScan,
    setSort,
    setCategory,
    setTimePeriod,
    setWalletCount,

    // Config
    sort,
    category,
    timePeriod,
    walletCount,
  };
}
