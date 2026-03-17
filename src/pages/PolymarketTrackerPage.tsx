import { useState, useMemo } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ExternalLink, Wallet, ArrowLeft,
  ScanSearch, ChevronDown, ChevronUp,
  Link2, Search, Sparkles, TrendingUp
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PixelLobster } from '@/components/ui/pixel-icons';
import { DexQuotePanel } from '@/components/claw-trader/DexQuotePanel';
import { AgentActivityLog, type AgentLogEntry } from '@/components/claw-trader/AgentActivityLog';
import { AgentRadarLanding } from '@/components/agent-radar/AgentRadarLanding';
import { polymarketService, type MarketInfo, type MarketHolder, type EventInfo, type PolymarketPosition, type OutcomePriceHistory, type LeaderboardEntry, type SmartMoneyMarket, type SmartMoneyTrader, type OutcomeBias, type WhaleSignal, type TraderPortfolio, type RecentTrade, type BondOpportunity, type ClosedPosition, type OrderBook } from '@/services/polymarket.service';
import { detectBot, type BotDetectionResult, type SignalProgress, type MarketContext, type StrategyType } from '@/services/polymarket-detector';
import { ShareScoreCard } from '@/components/agentic/ShareScoreCard';
import { AIInsightsTerminal } from '@/components/agentic/AIInsightsTerminal';
import { ProWaitlistForm } from '@/components/agentic/ProWaitlistForm';
import { SignalPanel } from '@/components/agentic/SignalPanel';
import { supabase } from '@/lib/supabase';
import { useScanLimit } from '@/hooks/useScanLimit';
import { toast } from 'sonner';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { SmartMoneyFlowChart } from '@/components/charts/SmartMoneyFlowChart';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function aggregateSmartMoney(
  leaderboard: LeaderboardEntry[],
  positionsByTrader: Map<string, PolymarketPosition[]>
): SmartMoneyMarket[] {
  // Group by conditionId (each conditionId is a unique binary market or sub-market)
  const marketMap = new Map<string, {
    conditionId: string;
    title: string;
    slug: string;
    traders: SmartMoneyTrader[];
    outcomeCapital: Map<string, number>;
    outcomeHeadcount: Map<string, number>;
    totalPnl: number;
    latestPrice: number;
    // For edge: weighted entry price calculation
    totalEntryWeighted: number; // sum of (entryPrice * positionValue)
    totalEntryCapital: number;  // sum of positionValue (for weighting)
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
      // Accumulate for weighted avg entry price + range
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

    // Build outcome bias array
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

    // Top outcome by capital
    const top = outcomeBias[0];
    const topCapitalPct = totalCapital > 0 ? Math.round((top.capital / totalCapital) * 100) : 0;
    const topHeadPct = totalHeads > 0 ? Math.round((top.headcount / totalHeads) * 100) : 0;

    // Capital consensus: how dominant is the top outcome (0-100)
    // 100 = all capital on one side, 50 = perfectly split between 2
    const capitalConsensus = Math.round(Math.abs(topCapitalPct - (100 / outcomeBias.length)) * (outcomeBias.length / (outcomeBias.length - 1)));
    // Head consensus: how many traders agree on top outcome
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

function BotScoreBadge({ score, classification }: { score: number; classification: string }) {
  const colors: Record<string, string> = {
    'bot': 'bg-red-500/15 text-red-400 border-red-500/30',
    'likely-bot': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    'mixed': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    'human': 'bg-green-500/15 text-green-400 border-green-500/30',
  };
  const labels: Record<string, string> = {
    'bot': 'AGENT',
    'likely-bot': 'LIKELY AGENT',
    'mixed': 'MIXED',
    'human': 'HUMAN',
  };
  const isAgent = classification === 'bot' || classification === 'likely-bot';
  return (
    <Badge className={`${colors[classification] || colors.mixed} text-[10px] font-mono flex items-center gap-1`}>
      {isAgent && <PixelLobster size={12} className="shrink-0" />}
      {labels[classification] || 'UNKNOWN'} {score}
    </Badge>
  );
}

function SignalBar({ label, value, maxLabel }: { label: string; value: number; maxLabel?: string }) {
  const color = value >= 80 ? 'bg-red-500' : value >= 60 ? 'bg-orange-500' : value >= 40 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="font-mono w-8 text-right">{value}</span>
      {maxLabel && <span className="text-muted-foreground text-[10px]">{maxLabel}</span>}
    </div>
  );
}

const STRATEGY_STYLES: Record<StrategyType, { border: string; bg: string; text: string }> = {
  MARKET_MAKER: { border: 'border-blue-400/40', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  HYBRID:       { border: 'border-violet-400/40', bg: 'bg-violet-500/10', text: 'text-violet-400' },
  SNIPER:       { border: 'border-red-400/40', bg: 'bg-red-500/10', text: 'text-red-400' },
  MOMENTUM:     { border: 'border-amber-400/40', bg: 'bg-amber-500/10', text: 'text-amber-400' },
  UNCLASSIFIED: { border: 'border-muted', bg: 'bg-muted/30', text: 'text-muted-foreground' },
};

function StrategyTag({ type, label }: { type: StrategyType; label: string }) {
  if (type === 'UNCLASSIFIED') return null;
  const s = STRATEGY_STYLES[type];
  return (
    <Badge className={`${s.border} ${s.bg} ${s.text} text-[9px] font-mono`}>
      {label.toUpperCase()}
    </Badge>
  );
}

export default function PolymarketTrackerPage() {
  const navigate = useNavigate();
  const { canScanMarket, marketScansRemaining, marketScanLimit, marketCooldownText, consumeMarketScan } = useScanLimit();

  // View toggle: landing (new UX) or advanced (legacy terminal)
  const [view, setView] = useState<'landing' | 'advanced'>('landing');

  // Scanner mode toggle
  const [scanMode, setScanMode] = useState<'market' | 'smartmoney' | 'bonds'>('market');

  // Market scanner state
  const [marketUrl, setMarketUrl] = useState('');
  const [marketInfo, setMarketInfo] = useState<MarketInfo | null>(null);
  const [marketHolders, setMarketHolders] = useState<(MarketHolder & { bot?: BotDetectionResult })[]>([]);
  const [marketScanning, setMarketScanning] = useState(false);
  const [marketScanProgress, setMarketScanProgress] = useState('');
  const [expandedHolder, setExpandedHolder] = useState<string | null>(null);
  const [liveAnalysis, setLiveAnalysis] = useState<{ address: string; progress: SignalProgress } | null>(null);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [priceHistory, setPriceHistory] = useState<OutcomePriceHistory[]>([]);
  const [holderPositions, setHolderPositions] = useState<Record<string, PolymarketPosition[]>>({});
  const [loadingPositions, setLoadingPositions] = useState<string | null>(null);
  const [scanLimit, setScanLimit] = useState(50);

  // Smart Money state
  const [smartMoneyMarkets, setSmartMoneyMarkets] = useState<SmartMoneyMarket[]>([]);
  const [smartMoneyLoading, setSmartMoneyLoading] = useState(false);
  const [smartMoneyProgress, setSmartMoneyProgress] = useState('');
  const [smartMoneyLeaderboard, setSmartMoneyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [expandedSmartMarket, setExpandedSmartMarket] = useState<string | null>(null);
  const [smartMoneyCategory, setSmartMoneyCategory] = useState('OVERALL');
  const [smartMoneyTimePeriod, setSmartMoneyTimePeriod] = useState('MONTH');
  const [smartMoneySort, setSmartMoneySort] = useState<'consensus' | 'capital' | 'traders' | 'aiscore'>('traders');
  const [whaleSignals, setWhaleSignals] = useState<WhaleSignal[]>([]);
  const [traderPortfolios, setTraderPortfolios] = useState<TraderPortfolio[]>([]);
  const [smartMoneyActivePanel, setSmartMoneyActivePanel] = useState<'flow' | 'signals' | 'edge' | 'portfolios' | 'alpha'>('flow');
  const [smartMoneyWalletCount, setSmartMoneyWalletCount] = useState(50);

  // Bond scanner state
  const [bondMarkets, setBondMarkets] = useState<BondOpportunity[]>([]);
  const [bondLoading, setBondLoading] = useState(false);
  const [bondMinPrice, setBondMinPrice] = useState(90); // as percentage (90 = 90¢)
  const [bondMinLiquidity, setBondMinLiquidity] = useState(1000);
  const [bondSort, setBondSort] = useState<'apy' | 'return' | 'liquidity' | 'time'>('apy');

  // Agent activity log
  const [agentLog, setAgentLog] = useState<AgentLogEntry[]>([]);
  const addLog = (agent: AgentLogEntry['agent'], message: string, status?: AgentLogEntry['status']) => {
    setAgentLog(prev => [...prev, { agent, message, timestamp: Date.now(), status }]);
  };

  // CLOB enrichment state
  const [openInterestMap, setOpenInterestMap] = useState<Map<string, number>>(new Map());
  const [closedPositionsMap, setClosedPositionsMap] = useState<Map<string, { wins: number; losses: number; totalPnl: number }>>(new Map());
  const [rewardRates, setRewardRates] = useState<Map<string, number>>(new Map());
  const [marketOrderBook, setMarketOrderBook] = useState<OrderBook | null>(null);
  const [orderBookLoading, setOrderBookLoading] = useState(false);

  const handleBondScan = async () => {
    setBondLoading(true);
    setBondMarkets([]);
    try {
      const [bonds, rewards] = await Promise.all([
        polymarketService.getBondMarkets({
          minPrice: bondMinPrice / 100,
          maxPrice: 0.995,
          minLiquidity: bondMinLiquidity,
          minVolume: 500,
          limit: 200,
        }),
        polymarketService.getCurrentRewards(),
      ]);
      // Build reward map by conditionId
      const rMap = new Map<string, number>();
      for (const r of rewards) {
        if (r.rewardsApy > 0) rMap.set(r.conditionId, r.rewardsApy);
      }
      setRewardRates(rMap);
      setBondMarkets(bonds);
      if (bonds.length === 0) {
        toast.info('No bond opportunities found with current filters. Try lowering the min price.');
      }
    } catch {
      toast.error('Failed to fetch bond markets');
    } finally {
      setBondLoading(false);
    }
  };

  const sortedBonds = useMemo(() => {
    return [...bondMarkets].sort((a, b) => {
      if (bondSort === 'apy') return b.apy - a.apy;
      if (bondSort === 'return') return b.returnPct - a.returnPct;
      if (bondSort === 'liquidity') return b.liquidity - a.liquidity;
      if (bondSort === 'time') return a.hoursToEnd - b.hoursToEnd;
      return 0;
    });
  }, [bondMarkets, bondSort]);

  const handleMarketScan = async () => {
    if (!canScanMarket) {
      toast.error(`Limit reached: ${marketScanLimit} market scans per 12 hours.${marketCooldownText ? ` Resets in ${marketCooldownText}.` : ''}`);
      return;
    }

    const slug = polymarketService.parseMarketUrl(marketUrl);
    if (!slug) {
      toast.error('Invalid Polymarket URL. Paste a link like polymarket.com/event/...');
      return;
    }

    consumeMarketScan();
    setMarketScanning(true);
    setMarketInfo(null);
    setMarketHolders([]);
    setExpandedHolder(null);
    setEventInfo(null);
    setPriceHistory([]);
    setHolderPositions({});
    setMarketScanProgress('Looking up market...');

    // Event slug might differ from market slug in sub-market URLs
    const eventSlug = polymarketService.parseEventSlug(marketUrl) || slug;

    // Fetch both market and event data in parallel
    const [info, eventData] = await Promise.all([
      polymarketService.getMarketBySlug(slug),
      polymarketService.getEventBySlug(eventSlug),
    ]);
    if (!info) {
      toast.error('Market not found. Check the URL and try again.');
      setMarketScanning(false);
      setMarketScanProgress('');
      return;
    }

    setMarketInfo(info);
    if (eventData) {
      setEventInfo(eventData);
      // Fetch price history in parallel (don't block scan)
      polymarketService.getEventPriceHistory(eventData.markets).then(setPriceHistory);
    }
    setMarketScanProgress('Fetching holders...');

    const holders = await polymarketService.getMarketHolders(info.conditionId);
    if (holders.length === 0) {
      toast.error('No holders found for this market.');
      setMarketScanning(false);
      setMarketScanProgress('');
      return;
    }

    // Show holders immediately, then scan each for bot behavior
    const holdersWithBot: (MarketHolder & { bot?: BotDetectionResult })[] = holders.map(h => ({ ...h }));
    setMarketHolders(holdersWithBot);

    // Run bot detection on top holders sequentially with live signal streaming
    const toScan = holdersWithBot.slice(0, scanLimit);
    for (let i = 0; i < toScan.length; i++) {
      const addr = toScan[i].address;
      setMarketScanProgress(`Scanning wallet ${i + 1}/${toScan.length}...`);
      setLiveAnalysis({ address: addr, progress: { phase: 'fetching', signals: {} } });
      const ctx: MarketContext = {
        holderAmount: toScan[i].amount,
        totalMarketVolume: info.volume,
      };
      try {
        const result = await detectBot(addr, (p) => {
          setLiveAnalysis({ address: addr, progress: p });
        }, ctx);
        setMarketHolders(prev =>
          prev.map(h =>
            h.address === addr ? { ...h, bot: result } : h
          )
        );
      } catch {
        // Skip failed scans
      }
    }

    setLiveAnalysis(null);
    setMarketScanning(false);
    setMarketScanProgress('');
    toast.success(`Scanned ${toScan.length} holders in "${info.question}"`);

    // Increment scan counter for each holder scanned (fire-and-forget)
    for (let i = 0; i < toScan.length; i++) {
      supabase.rpc('increment_scan_count').catch(() => {});
    }
  };

  const handleViewPositions = async (address: string) => {
    if (holderPositions[address]) {
      // Toggle off
      setHolderPositions(prev => {
        const next = { ...prev };
        delete next[address];
        return next;
      });
      return;
    }
    setLoadingPositions(address);
    try {
      const positions = await polymarketService.getAgentPositions(address);
      setHolderPositions(prev => ({ ...prev, [address]: positions }));
    } catch {
      toast.error('Failed to load positions');
    }
    setLoadingPositions(null);
  };

  const handleSmartMoneyFetch = async () => {
    setSmartMoneyLoading(true);
    setSmartMoneyMarkets([]);
    setWhaleSignals([]);
    setTraderPortfolios([]);
    setAgentLog([]);
    setSmartMoneyProgress('Fetching leaderboard...');
    addLog('scout', 'Initializing scan — fetching top trader leaderboard...');

    const cacheKey = `smartmoney_${smartMoneyCategory}_${smartMoneyTimePeriod}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < 5 * 60 * 1000) {
          setSmartMoneyLeaderboard(parsed.leaderboard);
          setSmartMoneyMarkets(parsed.markets);
          setSmartMoneyLoading(false);
          setSmartMoneyProgress('');
          return;
        }
      }
    } catch { /* cache miss */ }

    const leaderboard = await polymarketService.getLeaderboard(smartMoneyCategory, smartMoneyTimePeriod, smartMoneyWalletCount);
    if (leaderboard.length === 0) {
      toast.error('Failed to fetch leaderboard data');
      setSmartMoneyLoading(false);
      setSmartMoneyProgress('');
      return;
    }
    setSmartMoneyLeaderboard(leaderboard);
    addLog('scout', `Found ${leaderboard.length} traders. Scanning positions...`, 'success');

    // Batched concurrency: chunks of 5 to avoid 429 rate limiting
    const BATCH_SIZE = 5;
    const positionsByTrader = new Map<string, PolymarketPosition[]>();
    let completed = 0;

    for (let i = 0; i < leaderboard.length; i += BATCH_SIZE) {
      const batch = leaderboard.slice(i, i + BATCH_SIZE);
      setSmartMoneyProgress(`Scanning wallets ${completed + 1}-${Math.min(completed + batch.length, leaderboard.length)} of ${leaderboard.length}...`);

      const results = await Promise.allSettled(
        batch.map(async (trader) => {
          const positions = await polymarketService.getAgentPositions(trader.proxyWallet);
          // Filter out closed/zero-value positions
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
      setSmartMoneyProgress(`Scanned ${completed}/${leaderboard.length} traders...`);
    }

    addLog('scout', `Scanned ${positionsByTrader.size} wallets with active positions`, 'success');
    addLog('strategist', 'Aggregating consensus across markets...');
    setSmartMoneyProgress('Aggregating consensus...');
    const markets = aggregateSmartMoney(leaderboard, positionsByTrader);

    addLog('strategist', `Found ${markets.length} markets with smart money overlap`, 'success');

    // Fetch market prices for edge tracker
    addLog('strategist', 'Calculating edge: market prices vs entry prices...');
    setSmartMoneyProgress('Fetching market prices for edge analysis...');
    const conditionIds = markets.slice(0, 20).map(m => m.conditionId).filter(Boolean);
    const marketPrices = await polymarketService.getMarketPrices(conditionIds);
    for (const m of markets) {
      const mktPrice = marketPrices.get(m.conditionId);
      if (mktPrice !== undefined && mktPrice > 0) {
        m.marketPrice = mktPrice;
        // Edge = current market price vs smart money's weighted avg entry price
        // Positive edge = SM bought cheap, price went up (SM in profit = trend confirmed)
        // Negative edge = SM bought high, price dropped (SM underwater = potential opportunity or trap)
        if (m.avgEntryPrice > 0) {
          m.edgePercent = Math.round((mktPrice - m.avgEntryPrice) * 100);
          m.edgeDirection = m.edgePercent > 3 ? 'PROFIT' : m.edgePercent < -3 ? 'UNDERWATER' : 'NEUTRAL';
        }
      }
    }

    // Fetch recent trades for whale signals (top 15 traders, batched)
    addLog('scout', 'Scanning whale activity — last 72h trades from top 15...');
    setSmartMoneyProgress('Scanning whale activity...');
    const signals: WhaleSignal[] = [];
    const now = Date.now() / 1000;
    const tradeBatch = leaderboard.slice(0, 15);
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
          if (hoursAgo > 72) continue; // Only last 72h
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

    // Build portfolio analysis
    addLog('strategist', 'Analyzing portfolio concentration & hedges...');
    setSmartMoneyProgress('Analyzing portfolios...');
    const portfolios: TraderPortfolio[] = [];
    for (const trader of leaderboard.slice(0, 30)) {
      const positions = positionsByTrader.get(trader.proxyWallet) || [];
      if (positions.length === 0) continue;
      const totalValue = positions.reduce((a, p) => a + p.currentValue, 0);
      if (totalValue < 1) continue;

      // Concentration (HHI-based)
      const shares = positions.map(p => p.currentValue / totalValue);
      const hhi = shares.reduce((a, s) => a + s * s, 0);
      const concentration = Math.round(hhi * 100);

      // Top position
      const sorted = [...positions].sort((a, b) => b.currentValue - a.currentValue);
      const topPos = sorted[0];

      // Conviction bets (>15% of portfolio)
      const convictionBets = sorted
        .filter(p => (p.currentValue / totalValue) > 0.15)
        .map(p => ({
          title: p.title,
          value: p.currentValue,
          pctOfPortfolio: Math.round((p.currentValue / totalValue) * 100),
          outcome: p.outcome,
        }));

      // Detect hedges: same conditionId with different outcomes
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

      portfolios.push({
        address: trader.proxyWallet,
        name: trader.userName || `${trader.proxyWallet.slice(0, 6)}...`,
        rank: trader.rank,
        pnl: trader.pnl,
        totalValue,
        positionCount: positions.length,
        topPosition: topPos ? { title: topPos.title, value: topPos.currentValue, pctOfPortfolio: Math.round((topPos.currentValue / totalValue) * 100) } : null,
        concentration,
        categories: [], // Categories come from gamma API, skip for now
        hedges,
        convictionBets,
      });
    }
    portfolios.sort((a, b) => b.totalValue - a.totalValue);
    setTraderPortfolios(portfolios);

    setSmartMoneyMarkets(markets);

    addLog('strategist', `Built ${portfolios.length} portfolio profiles`, 'success');

    // ─── CLOB Enrichment: Open Interest + Spreads + Closed Positions (parallel, non-blocking) ───
    addLog('executor', 'Enriching with CLOB data: open interest, spreads, win rates...');
    setSmartMoneyProgress('Fetching CLOB data (OI, spreads, win rates)...');
    try {
      const conditionIdsForOI = markets.slice(0, 20).map(m => m.conditionId).filter(Boolean);
      const [oiMap, closedResults] = await Promise.all([
        polymarketService.getBatchOpenInterest(conditionIdsForOI),
        // Get closed positions for top 10 traders for real win rate
        Promise.allSettled(
          leaderboard.slice(0, 10).map(async (t) => {
            const closed = await polymarketService.getClosedPositions(t.proxyWallet, 50);
            const wins = closed.filter(c => c.isWin).length;
            const losses = closed.filter(c => !c.isWin).length;
            const totalPnl = closed.reduce((a, c) => a + c.pnl, 0);
            return { address: t.proxyWallet, wins, losses, totalPnl };
          })
        ),
      ]);
      setOpenInterestMap(oiMap);

      // Build closed positions map
      const cpMap = new Map<string, { wins: number; losses: number; totalPnl: number }>();
      for (const r of closedResults) {
        if (r.status === 'fulfilled') {
          cpMap.set(r.value.address, { wins: r.value.wins, losses: r.value.losses, totalPnl: r.value.totalPnl });
        }
      }
      setClosedPositionsMap(cpMap);
    } catch { /* CLOB enrichment failed, non-critical */ }

    addLog('executor', 'CLOB enrichment complete', 'success');
    addLog('executor', `Scan complete — ${markets.length} markets ranked by smart money consensus`, 'success');
    setSmartMoneyLoading(false);
    setSmartMoneyProgress('');

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), leaderboard, markets }));
    } catch { /* storage full */ }
  };

  // ─── AI CONVERGENCE SCORE: fuses 5 signals into one 0-100 score per market ───
  const convergenceScoreMap = useMemo(() => {
    const map = new Map<string, { score: number; tier: 'STRONG' | 'MODERATE' | 'WEAK'; breakdown: { consensus: number; edge: number; momentum: number; validation: number; quality: number } }>();
    if (smartMoneyMarkets.length === 0) return map;

    for (const market of smartMoneyMarkets) {
      // 1. Consensus (25 pts)
      const capitalScore = (market.capitalConsensus / 100) * 12;
      const headScore = (market.headConsensus / 100) * 8;
      const capitalBonus = market.totalCapital > 50000 ? 5 : market.totalCapital > 10000 ? 3 : market.totalCapital > 1000 ? 1 : 0;
      const consensus = Math.min(capitalScore + headScore + capitalBonus, 25);

      // 2. Edge (20 pts)
      let edge = 10;
      if (market.edgeDirection === 'PROFIT') edge = Math.min(10 + market.edgePercent * 0.5, 20);
      else if (market.edgeDirection === 'UNDERWATER') edge = Math.max(0, 5 - Math.abs(market.edgePercent) * 0.3);

      // 3. Momentum (20 pts) — whale signals for this market
      const marketSignals = whaleSignals.filter(s => s.marketSlug === market.slug || s.marketTitle === market.title);
      const recentBuys = marketSignals.filter(s => s.side === 'BUY' && s.hoursAgo <= 24);
      const recentSells = marketSignals.filter(s => s.side === 'SELL' && s.hoursAgo <= 24);
      const buyVol = recentBuys.reduce((a, s) => a + s.usdcSize, 0);
      const sellVol = recentSells.reduce((a, s) => a + s.usdcSize, 0);
      const momentumRatio = buyVol / (buyVol + sellVol + 1);
      let momentum = 0;
      if (recentBuys.length >= 2) momentum += 8;
      if (momentumRatio > 0.7) momentum += 8;
      else if (momentumRatio > 0.5) momentum += 4;
      if (recentBuys.some(s => s.conviction >= 15)) momentum += 4;
      momentum = Math.min(momentum, 20);

      // 4. Validation (15 pts) — OI + trader count
      const oi = openInterestMap.get(market.conditionId) || 0;
      const oiScore = oi > 500000 ? 8 : oi > 100000 ? 6 : oi > 10000 ? 4 : oi > 0 ? 2 : 0;
      const traderScore = market.traderCount >= 8 ? 7 : market.traderCount >= 5 ? 5 : market.traderCount >= 3 ? 3 : 1;
      const validation = Math.min(oiScore + traderScore, 15);

      // 5. Trader Quality (20 pts) — win rate + PnL
      const traderWinRates = market.traders.map(t => {
        const cp = closedPositionsMap.get(t.address);
        if (!cp || (cp.wins + cp.losses) === 0) return null;
        return cp.wins / (cp.wins + cp.losses);
      }).filter((v): v is number => v !== null);
      const avgWinRate = traderWinRates.length > 0 ? traderWinRates.reduce((a, b) => a + b, 0) / traderWinRates.length : 0.5;
      const winRateScore = avgWinRate >= 0.65 ? 12 : avgWinRate >= 0.55 ? 8 : avgWinRate >= 0.45 ? 5 : 2;
      const pnlScore = market.avgPnl > 0 ? Math.min(market.avgPnl / 500, 8) : 0;
      const quality = Math.min(winRateScore + pnlScore, 20);

      const score = Math.round(consensus + edge + momentum + validation + quality);
      const tier = score >= 75 ? 'STRONG' as const : score >= 45 ? 'MODERATE' as const : 'WEAK' as const;
      map.set(market.conditionId, { score, tier, breakdown: { consensus: Math.round(consensus), edge: Math.round(edge), momentum: Math.round(momentum), validation: Math.round(validation), quality: Math.round(quality) } });
    }
    return map;
  }, [smartMoneyMarkets, whaleSignals, openInterestMap, closedPositionsMap]);

  const sortedSmartMoneyMarkets = useMemo(() =>
    [...smartMoneyMarkets].sort((a, b) => {
      if (smartMoneySort === 'capital') return b.totalCapital - a.totalCapital;
      if (smartMoneySort === 'consensus') return b.capitalConsensus - a.capitalConsensus;
      if (smartMoneySort === 'aiscore') {
        const sa = convergenceScoreMap.get(a.conditionId)?.score || 0;
        const sb = convergenceScoreMap.get(b.conditionId)?.score || 0;
        return sb - sa;
      }
      return b.traderCount - a.traderCount;
    }),
    [smartMoneyMarkets, smartMoneySort, convergenceScoreMap]
  );

  // Memoize expensive edge calculations (only recalc when data changes, not on tab switch)
  const marketsWithEdge = useMemo(() =>
    sortedSmartMoneyMarkets
      .filter(m => m.marketPrice > 0 && m.avgEntryPrice > 0 && m.edgePercent !== 0)
      .sort((a, b) => Math.abs(b.edgePercent) - Math.abs(a.edgePercent)),
    [sortedSmartMoneyMarkets]
  );

  // Memoize whale signals for display (already sorted by timestamp in state)
  const displaySignals = useMemo(() => whaleSignals.slice(0, 50), [whaleSignals]);

  // Memoize portfolio display
  const displayPortfolios = useMemo(() => traderPortfolios.slice(0, 20), [traderPortfolios]);

  // ─── ALPHA SIGNALS: cross-references all data to find actionable opportunities ───
  const alphaSignals = useMemo(() => {
    if (smartMoneyMarkets.length === 0) return [];
    const signals: { id: string; type: string; title: string; description: string; confidence: number; markets: string[]; traders: string[]; suggestedAction: string }[] = [];

    // Signal 1: WHALE CONVERGENCE — 3+ traders bought same market in 24h
    for (const market of smartMoneyMarkets) {
      const recentBuys = whaleSignals.filter(s => (s.marketSlug === market.slug || s.marketTitle === market.title) && s.side === 'BUY' && s.hoursAgo <= 24);
      const uniqueTraders = [...new Set(recentBuys.map(s => s.address))];
      if (uniqueTraders.length >= 3) {
        const names = [...new Set(recentBuys.map(s => s.traderName))];
        const totalUsd = recentBuys.reduce((a, s) => a + s.usdcSize, 0);
        signals.push({
          id: `whale-${market.conditionId}`,
          type: 'WHALE_CONVERGENCE',
          title: market.title,
          description: `${uniqueTraders.length} top traders bought ${market.topOutcome} in the last 24h for ${formatUSD(totalUsd)}`,
          confidence: Math.min(uniqueTraders.length * 20, 100),
          markets: [market.title],
          traders: names.slice(0, 5),
          suggestedAction: `Coordinated entry from ${uniqueTraders.length} whales. High probability of price movement.`,
        });
      }
    }

    // Signal 2: UNDERWATER ACCUMULATION — SM underwater but still buying
    for (const market of smartMoneyMarkets.filter(m => m.edgeDirection === 'UNDERWATER')) {
      const recentBuys = whaleSignals.filter(s => (s.marketSlug === market.slug || s.marketTitle === market.title) && s.side === 'BUY' && s.hoursAgo <= 48);
      if (recentBuys.length >= 1) {
        const avgConviction = recentBuys.reduce((a, s) => a + s.conviction, 0) / recentBuys.length;
        const names = [...new Set(recentBuys.map(s => s.traderName))];
        signals.push({
          id: `underwater-${market.conditionId}`,
          type: 'UNDERWATER_ACCUMULATION',
          title: market.title,
          description: `Smart money is ${Math.abs(market.edgePercent)}pts underwater but still buying (${recentBuys.length} recent buys)`,
          confidence: Math.min(50 + Math.round(avgConviction), 100),
          markets: [market.title],
          traders: names.slice(0, 5),
          suggestedAction: `Contrarian accumulation. Whales are averaging down — strong conviction signal.`,
        });
      }
    }

    // Signal 3: YIELD + MOMENTUM — bond opportunity where SM is also bullish
    for (const bond of bondMarkets) {
      const matchingMarket = smartMoneyMarkets.find(m => m.conditionId === bond.conditionId);
      if (matchingMarket && matchingMarket.capitalConsensus >= 60) {
        const bondSideMatch = (bond.safeSide === 'YES' && matchingMarket.topOutcome.toLowerCase() === 'yes') ||
                              (bond.safeSide === 'NO' && matchingMarket.topOutcome.toLowerCase() === 'no');
        if (bondSideMatch) {
          signals.push({
            id: `yield-${bond.conditionId}`,
            type: 'YIELD_MOMENTUM',
            title: bond.question,
            description: `Bond yield ${bond.returnPct.toFixed(1)}% backed by ${matchingMarket.traderCount} traders with ${matchingMarket.capitalConsensus}% agreement`,
            confidence: Math.min(matchingMarket.capitalConsensus + Math.round(bond.returnPct * 5), 100),
            markets: [bond.question],
            traders: matchingMarket.traders.slice(0, 3).map(t => t.name),
            suggestedAction: `Double conviction: near-guaranteed yield + smart money aligned. Low risk.`,
          });
        }
      }
    }

    // Signal 4: HIGH CONVICTION CLUSTER — 2+ traders >20% portfolio in same market
    const convictionMap = new Map<string, { traders: string[]; avgConviction: number; totalConviction: number }>();
    for (const portfolio of traderPortfolios) {
      for (const bet of portfolio.convictionBets) {
        if (bet.pctOfPortfolio >= 20) {
          const existing = convictionMap.get(bet.title) || { traders: [], avgConviction: 0, totalConviction: 0 };
          existing.traders.push(portfolio.name);
          existing.totalConviction += bet.pctOfPortfolio;
          existing.avgConviction = existing.totalConviction / existing.traders.length;
          convictionMap.set(bet.title, existing);
        }
      }
    }
    for (const [market, data] of convictionMap) {
      if (data.traders.length >= 2) {
        signals.push({
          id: `conviction-${market.slice(0, 20)}`,
          type: 'HIGH_CONVICTION_CLUSTER',
          title: market,
          description: `${data.traders.length} traders have >${Math.round(data.avgConviction)}% of their portfolio in this market`,
          confidence: Math.min(data.traders.length * 25 + Math.round(data.avgConviction), 100),
          markets: [market],
          traders: data.traders.slice(0, 5),
          suggestedAction: `Maximum collective conviction. Top traders are going all-in here.`,
        });
      }
    }

    // Signal 5: OI SURGE + CONSENSUS — high OI + high consensus
    for (const market of smartMoneyMarkets) {
      const oi = openInterestMap.get(market.conditionId) || 0;
      if (oi > 100000 && market.capitalConsensus >= 70) {
        signals.push({
          id: `oi-${market.conditionId}`,
          type: 'OI_SURGE_CONSENSUS',
          title: market.title,
          description: `${formatUSD(oi)} in Open Interest + ${market.capitalConsensus}% smart money agreement`,
          confidence: Math.min(Math.round((oi / 1000000) * 30 + market.capitalConsensus), 100),
          markets: [market.title],
          traders: market.traders.slice(0, 3).map(t => t.name),
          suggestedAction: `Institutional signal. High capital at stake + whales aligned.`,
        });
      }
    }

    return signals.sort((a, b) => b.confidence - a.confidence);
  }, [smartMoneyMarkets, whaleSignals, bondMarkets, traderPortfolios, openInterestMap]);

  // ─── TRADER RELIABILITY SCORE: should you copy this trader? ───
  const traderReliabilityMap = useMemo(() => {
    const map = new Map<string, { score: number; tier: 'RELIABLE' | 'MODERATE' | 'UNPROVEN' }>();
    for (const portfolio of traderPortfolios) {
      const cp = closedPositionsMap.get(portfolio.address);
      const leaderboardEntry = smartMoneyLeaderboard.find(l => l.proxyWallet === portfolio.address);

      // Win Rate (0-40)
      let winRateScore = 0;
      if (cp && (cp.wins + cp.losses) > 0) {
        const total = cp.wins + cp.losses;
        const winRate = cp.wins / total;
        winRateScore = Math.min(Math.max(0, (winRate - 0.4) / 0.3 * 40), 40);
        if (total < 5) winRateScore *= 0.5;
        else if (total < 10) winRateScore *= 0.75;
      }

      // PnL (0-25)
      let pnlScore = 0;
      if (cp && cp.totalPnl > 0) pnlScore = Math.min(cp.totalPnl / 2000 * 25, 25);
      else if (leaderboardEntry && leaderboardEntry.pnl > 0) pnlScore = Math.min(leaderboardEntry.pnl / 10000 * 15, 15);

      // Diversification (0-20)
      let divScore = 0;
      if (portfolio.concentration >= 15 && portfolio.concentration <= 50) divScore = 20;
      else if (portfolio.concentration < 15) divScore = 12;
      else if (portfolio.concentration <= 70) divScore = 8;
      else divScore = 3;
      if (portfolio.hedges.length > 0) divScore = Math.min(divScore + 3, 20);

      // Data Confidence (0-15)
      let dataScore = 0;
      if (cp && (cp.wins + cp.losses) >= 10) dataScore += 8;
      else if (cp && (cp.wins + cp.losses) >= 3) dataScore += 4;
      if (portfolio.positionCount >= 3) dataScore += 4;
      if (leaderboardEntry) dataScore += 3;
      dataScore = Math.min(dataScore, 15);

      const score = Math.round(winRateScore + pnlScore + divScore + dataScore);
      const tier = score >= 65 ? 'RELIABLE' as const : score >= 35 ? 'MODERATE' as const : 'UNPROVEN' as const;
      map.set(portfolio.address, { score, tier });
    }
    return map;
  }, [traderPortfolios, closedPositionsMap, smartMoneyLeaderboard]);

  // Landing view — progressive disclosure
  if (view === 'landing') {
    return (
      <AgentRadarLanding
        onSwitchToAdvanced={(mode) => {
          setView('advanced');
          if (mode === 'market') setScanMode('market');
          else if (mode === 'smartmoney') setScanMode('smartmoney');
          else if (mode === 'bonds') setScanMode('bonds');
        }}
      />
    );
  }

  // Advanced (legacy) view
  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      <Helmet>
        <title>Polymarket Agent Radar | DeFi Hub Mexico</title>
        <meta name="description" content="Detect AI agents trading on Polymarket using behavioral analysis" />
      </Helmet>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header — Uniswap-style minimal */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              to="/agentic-world"
              className="p-2 hover:bg-white/5 rounded-xl text-neutral-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center">
              <PixelLobster size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Agent Radar</h1>
              <p className="text-neutral-500 text-sm">Smart money tracking + X Layer execution</p>
            </div>
          </div>
          <button
            onClick={() => setView('landing')}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            ← Overview
          </button>
        </div>

        {/* Scanner Card with Toggle */}
        <Card className="mb-6 border-neutral-800 bg-[#131313] rounded-2xl overflow-hidden">
          <CardHeader className="pb-3">
            {/* Uniswap-style segmented control */}
            <div className="inline-flex items-center bg-neutral-900 rounded-2xl p-1 mb-3">
              {([
                { key: 'market' as const, label: 'Scan', icon: Link2 },
                { key: 'smartmoney' as const, label: 'Smart Money', icon: TrendingUp },
                { key: 'bonds' as const, label: 'Yield', icon: Sparkles },
              ]).map(tab => {
                const Icon = tab.icon;
                const isActive = scanMode === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setScanMode(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-neutral-700/80 text-white shadow-sm'
                        : 'text-neutral-500 hover:text-neutral-300'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            {scanMode === 'market' ? (
              <>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-cyan-500" />
                  Scan Market by URL
                </CardTitle>
                <CardDescription>
                  Paste a Polymarket event URL to scan all holders and detect agents
                </CardDescription>
              </>
            ) : scanMode === 'bonds' ? (
              <>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                  Bond Scanner / Yield Finder
                </CardTitle>
                <CardDescription>
                  Find near-certain markets for quick yield — like buying a bond that pays in hours
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                  Smart Money Tracker
                </CardTitle>
                <CardDescription>
                  See where top Polymarket traders are putting their money — and follow the smart bets
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            {/* Market Scanner Tab */}
            {scanMode === 'market' && (<>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="https://polymarket.com/event/..."
                value={marketUrl}
                onChange={(e) => setMarketUrl(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && !marketScanning && handleMarketScan()}
              />
              <select
                value={scanLimit}
                onChange={(e) => setScanLimit(Number(e.target.value))}
                disabled={marketScanning}
                className="h-9 px-2 rounded-md border bg-background text-sm font-mono shrink-0 text-foreground"
              >
                {[10, 25, 50, 100, 200].map(n => (
                  <option key={n} value={n}>Top {n}</option>
                ))}
              </select>
              <Button
                onClick={handleMarketScan}
                disabled={marketScanning || !marketUrl}
                className="bg-cyan-600 hover:bg-cyan-700 shrink-0"
              >
                <Search className={`w-4 h-4 mr-2 ${marketScanning ? 'animate-pulse' : ''}`} />
                {marketScanning ? 'Scanning...' : 'Scan Market'}
              </Button>
            </div>

            <div className="flex items-center gap-2 mt-2">
              {marketScanProgress && (
                <div className="flex items-center gap-2 text-sm text-cyan-400">
                  <LoadingSpinner size="sm" />
                  {marketScanProgress}
                </div>
              )}
              {!marketScanning && (
                <div className="text-[10px] text-muted-foreground font-mono ml-auto">
                  {marketScansRemaining}/{marketScanLimit} scans remaining{marketCooldownText ? ` (resets in ${marketCooldownText})` : ''}
                </div>
              )}
            </div>

            {!canScanMarket && !marketScanning && (
              <div className="border border-amber-500/30 bg-amber-500/5 p-4 mt-3 text-center font-mono">
                <p className="text-amber-400 text-sm mb-1">Scan limit reached</p>
                <p className="text-amber-300/60 text-xs mb-3">
                  {marketCooldownText
                    ? `Resets in ${marketCooldownText}.`
                    : 'Your scans will reset soon.'}
                  {' '}Want unlimited scans?
                </p>
                <ProWaitlistForm />
              </div>
            )}

            {/* Live Analysis Terminal */}
            {liveAnalysis && (
              <div className="mt-3 border border-green-500/30 bg-black/80 overflow-hidden font-mono">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-green-400 text-[10px] ml-1">
                    openclaw --analyze {liveAnalysis.address.slice(0, 6)}...{liveAnalysis.address.slice(-4)}
                  </span>
                  <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                <div className="px-3 py-2 space-y-1.5">
                  {liveAnalysis.progress.phase === 'fetching' ? (
                    <div className="text-green-400/70 text-[11px] animate-pulse">
                      {'>'} Fetching trades, merges, positions...
                    </div>
                  ) : (
                    <>
                      {liveAnalysis.progress.tradeCount !== undefined && (
                        <div className="text-green-300/40 text-[10px]">
                          {'>'} loaded {liveAnalysis.progress.tradeCount} trades, {liveAnalysis.progress.mergeCount} merges
                        </div>
                      )}
                      {[
                        { key: 'intervalRegularity' as const, name: 'INTERVAL' },
                        { key: 'splitMergeRatio' as const, name: 'SPLIT/MERGE' },
                        { key: 'sizingConsistency' as const, name: 'SIZING' },
                        { key: 'activity24h' as const, name: '24/7' },
                        { key: 'winRateExtreme' as const, name: 'WIN_RATE' },
                        { key: 'marketConcentration' as const, name: 'FOCUS' },
                        { key: 'ghostWhale' as const, name: 'GHOST' },
                      ].map((s) => {
                        const val = liveAnalysis.progress.signals[s.key];
                        const isActive = liveAnalysis.progress.signal === s.name || liveAnalysis.progress.signal === s.name.replace('_', ' ');
                        const isDone = val !== undefined;
                        return (
                          <div key={s.key} className="flex items-center gap-2">
                            <span className={`text-[10px] w-20 shrink-0 ${isDone ? 'text-green-400' : isActive ? 'text-green-400 animate-pulse' : 'text-green-500/20'}`}>
                              {s.name}
                            </span>
                            <div className="flex gap-[2px] flex-1">
                              {Array.from({ length: 20 }).map((_, i) => {
                                const filled = isDone ? Math.round((val / 100) * 20) : 0;
                                const barColor = (val ?? 0) >= 80 ? 'bg-red-500' : (val ?? 0) >= 60 ? 'bg-orange-500' : (val ?? 0) >= 40 ? 'bg-yellow-500' : 'bg-green-500';
                                return (
                                  <div
                                    key={i}
                                    className={`w-1.5 h-2.5 transition-all duration-150 ${i < filled ? barColor : 'bg-green-500/10'}`}
                                    style={{ imageRendering: 'pixelated' }}
                                  />
                                );
                              })}
                            </div>
                            <span className={`text-[10px] w-6 text-right ${isDone ? (val >= 70 ? 'text-red-400' : 'text-green-400') : 'text-green-500/20'}`}>
                              {isDone ? val : '--'}
                            </span>
                          </div>
                        );
                      })}
                      {(liveAnalysis.progress.signals.bothSidesBonus ?? 0) > 0 && (
                        <div className="text-red-400 text-[10px] pt-1 border-t border-green-500/10">
                          {'>'} BOTH_SIDES_BONUS: +{liveAnalysis.progress.signals.bothSidesBonus}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Event Overview Terminal */}
            {eventInfo && eventInfo.markets.length > 0 && (
              <div className="mt-4 border border-cyan-500/30 bg-black/60 overflow-hidden font-mono">
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-cyan-400 text-[10px] ml-1">
                    market --overview {eventInfo.markets.length} outcomes
                  </span>
                  <span className="ml-auto text-cyan-400/40 text-[10px]">
                    vol: {formatUSD(eventInfo.volume)} | 24h: {formatUSD(eventInfo.volume24hr)}
                  </span>
                </div>

                {/* Event title + image */}
                <div className="flex items-center gap-3 px-3 py-2.5 border-b border-cyan-500/10">
                  {eventInfo.image && (
                    <img src={eventInfo.image} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-cyan-300 text-xs truncate">{eventInfo.title}</p>
                    <p className="text-cyan-400/40 text-[10px]">
                      ends {new Date(eventInfo.endDate).toLocaleDateString()} | liq: {formatUSD(eventInfo.liquidity)}
                    </p>
                  </div>
                </div>

                {/* Outcome cards grid */}
                <div className="p-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1.5">
                  {eventInfo.markets
                    .sort((a, b) => b.yesPrice - a.yesPrice)
                    .filter(m => m.yesPrice > 0.005 || m.active)
                    .slice(0, 12)
                    .map((m) => {
                      const pct = Math.round(m.yesPrice * 100);
                      const barColor = pct >= 50 ? 'bg-green-500' : pct >= 10 ? 'bg-yellow-500' : 'bg-red-500/60';
                      const filled = Math.round((pct / 100) * 10);
                      return (
                        <div
                          key={m.conditionId}
                          className={`border px-2 py-1.5 ${
                            m.active
                              ? 'border-cyan-500/20 bg-cyan-500/5'
                              : 'border-cyan-500/10 bg-black/40 opacity-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-cyan-300 text-[11px] truncate flex-1">{m.groupItemTitle}</span>
                            <span className={`text-[11px] font-bold ml-1 ${
                              pct >= 50 ? 'text-green-400' : pct >= 10 ? 'text-yellow-400' : 'text-red-400/60'
                            }`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="flex gap-[1px] mt-1">
                            {Array.from({ length: 10 }).map((_, i) => (
                              <div
                                key={i}
                                className={`flex-1 h-1 ${i < filled ? barColor : 'bg-cyan-500/10'}`}
                                style={{ imageRendering: 'pixelated' as const }}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-cyan-400/30 text-[9px]">{formatUSD(m.volume)}</span>
                            {!m.active && <span className="text-red-400/50 text-[9px]">closed</span>}
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Show remaining count */}
                {eventInfo.markets.filter(m => m.yesPrice > 0.005 || m.active).length > 12 && (
                  <div className="px-3 py-1 text-cyan-400/30 text-[9px] border-t border-cyan-500/10">
                    {'>'} +{eventInfo.markets.filter(m => m.yesPrice > 0.005 || m.active).length - 12} more outcomes
                  </div>
                )}

                {/* Price history chart */}
                {priceHistory.length > 0 && (() => {
                  const CHART_COLORS = ['#22d3ee', '#a78bfa', '#f59e0b', '#ef4444', '#10b981', '#f472b6'];
                  // Build unified time series: merge all timestamps, then for each timestamp find closest price per outcome
                  const allTimestamps = new Set<number>();
                  priceHistory.forEach(o => o.history.forEach(h => allTimestamps.add(h.t)));
                  const sortedTs = Array.from(allTimestamps).sort((a, b) => a - b);
                  // Sample to ~120 points for performance
                  const step = Math.max(1, Math.floor(sortedTs.length / 120));
                  const sampledTs = sortedTs.filter((_, i) => i % step === 0);

                  const chartData = sampledTs.map(t => {
                    const point: Record<string, number> = { t };
                    priceHistory.forEach(o => {
                      // Find closest price at or before this timestamp
                      let closest = 0;
                      for (const h of o.history) {
                        if (h.t <= t) closest = h.p;
                        else break;
                      }
                      point[o.label] = Math.round(closest * 100);
                    });
                    return point;
                  });

                  return (
                    <div className="border-t border-cyan-500/10 px-2 pt-3 pb-1">
                      <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 mb-2">
                        {priceHistory.map((o, i) => {
                          const lastPrice = o.history[o.history.length - 1]?.p || 0;
                          return (
                            <div key={o.label} className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-cyan-300 text-[10px]">{o.label}</span>
                              <span className="text-cyan-400/50 text-[10px]">{Math.round(lastPrice * 100)}%</span>
                            </div>
                          );
                        })}
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData}>
                          <XAxis
                            dataKey="t"
                            type="number"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={(t: number) => {
                              const d = new Date(t * 1000);
                              return `${d.getMonth() + 1}/${d.getDate()}`;
                            }}
                            tick={{ fill: '#22d3ee', fontSize: 9, opacity: 0.4 }}
                            axisLine={{ stroke: '#22d3ee', strokeOpacity: 0.1 }}
                            tickLine={false}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tickFormatter={(v: number) => `${v}%`}
                            tick={{ fill: '#22d3ee', fontSize: 9, opacity: 0.4 }}
                            axisLine={false}
                            tickLine={false}
                            width={35}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid rgba(34,211,238,0.2)', fontSize: 11, fontFamily: 'monospace' }}
                            labelFormatter={(t: number) => new Date(t * 1000).toLocaleDateString()}
                            formatter={(value: number, name: string) => [`${value}%`, name]}
                          />
                          {priceHistory.map((o, i) => (
                            <Line
                              key={o.label}
                              type="stepAfter"
                              dataKey={o.label}
                              stroke={CHART_COLORS[i % CHART_COLORS.length]}
                              strokeWidth={1.5}
                              dot={false}
                              isAnimationActive={false}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Order Book Depth */}
            {eventInfo && eventInfo.markets.length > 0 && !marketScanning && (
              <div className="mt-3 border border-cyan-500/20 bg-black/60 overflow-hidden font-mono">
                <div className="flex items-center justify-between px-3 py-1.5 bg-cyan-500/5 border-b border-cyan-500/15">
                  <span className="text-cyan-400/60 text-[10px]">{'>'} ORDER BOOK DEPTH (CLOB)</span>
                  <button
                    onClick={async () => {
                      const firstActive = eventInfo.markets.find(m => m.active && m.clobTokenId);
                      if (!firstActive?.clobTokenId) { toast.error('No CLOB token ID for this market'); return; }
                      setOrderBookLoading(true);
                      setMarketOrderBook(null);
                      const ob = await polymarketService.getOrderBook(firstActive.clobTokenId);
                      setMarketOrderBook(ob);
                      setOrderBookLoading(false);
                    }}
                    disabled={orderBookLoading}
                    className="text-[10px] px-2 py-0.5 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
                  >
                    {orderBookLoading ? 'LOADING...' : marketOrderBook ? 'REFRESH' : 'FETCH ORDER BOOK'}
                  </button>
                </div>
                {marketOrderBook && (
                  <div className="p-3 space-y-2">
                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-[2px] bg-cyan-500/10">
                      <div className="bg-black/80 p-2 text-center">
                        <div className="text-cyan-400/40 text-[9px]">SPREAD</div>
                        <div className="text-cyan-300 text-sm font-bold">{(marketOrderBook.spread * 100).toFixed(1)}¢</div>
                      </div>
                      <div className="bg-black/80 p-2 text-center">
                        <div className="text-cyan-400/40 text-[9px]">MIDPOINT</div>
                        <div className="text-cyan-300 text-sm font-bold">{(marketOrderBook.midpoint * 100).toFixed(1)}¢</div>
                      </div>
                      <div className="bg-black/80 p-2 text-center">
                        <div className="text-green-400/40 text-[9px]">BID DEPTH</div>
                        <div className="text-green-400 text-sm font-bold">{formatUSD(marketOrderBook.bidDepth)}</div>
                      </div>
                      <div className="bg-black/80 p-2 text-center">
                        <div className="text-red-400/40 text-[9px]">ASK DEPTH</div>
                        <div className="text-red-400 text-sm font-bold">{formatUSD(marketOrderBook.askDepth)}</div>
                      </div>
                    </div>
                    {/* Depth visualization: bids vs asks */}
                    <div className="grid grid-cols-2 gap-[2px]">
                      {/* Bids (green, left) */}
                      <div className="bg-black/60 p-2">
                        <div className="text-green-400/50 text-[9px] mb-1">BIDS ({marketOrderBook.bids.length})</div>
                        <div className="space-y-[1px]">
                          {marketOrderBook.bids.slice(0, 8).map((level, i) => {
                            const maxSize = Math.max(...marketOrderBook!.bids.slice(0, 8).map(l => l.size));
                            const barWidth = maxSize > 0 ? (level.size / maxSize) * 100 : 0;
                            return (
                              <div key={i} className="flex items-center gap-1">
                                <span className="text-green-400 text-[9px] w-10 text-right">{(level.price * 100).toFixed(1)}¢</span>
                                <div className="flex-1 h-2 bg-green-500/10 overflow-hidden relative">
                                  <div className="absolute right-0 top-0 h-full bg-green-500/30" style={{ width: `${barWidth}%` }} />
                                </div>
                                <span className="text-green-400/40 text-[8px] w-10 text-right">{level.size > 1000 ? `${(level.size / 1000).toFixed(1)}K` : Math.round(level.size)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Asks (red, right) */}
                      <div className="bg-black/60 p-2">
                        <div className="text-red-400/50 text-[9px] mb-1">ASKS ({marketOrderBook.asks.length})</div>
                        <div className="space-y-[1px]">
                          {marketOrderBook.asks.slice(0, 8).map((level, i) => {
                            const maxSize = Math.max(...marketOrderBook!.asks.slice(0, 8).map(l => l.size));
                            const barWidth = maxSize > 0 ? (level.size / maxSize) * 100 : 0;
                            return (
                              <div key={i} className="flex items-center gap-1">
                                <span className="text-red-400 text-[9px] w-10">{(level.price * 100).toFixed(1)}¢</span>
                                <div className="flex-1 h-2 bg-red-500/10 overflow-hidden relative">
                                  <div className="absolute left-0 top-0 h-full bg-red-500/30" style={{ width: `${barWidth}%` }} />
                                </div>
                                <span className="text-red-400/40 text-[8px] w-10">{level.size > 1000 ? `${(level.size / 1000).toFixed(1)}K` : Math.round(level.size)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    {/* Depth balance bar */}
                    <div className="flex items-center gap-2">
                      <span className="text-green-400/50 text-[9px]">BID</span>
                      <div className="flex-1 h-2 bg-black/40 overflow-hidden flex">
                        <div
                          className="h-full bg-green-500/40"
                          style={{ width: `${(marketOrderBook.bidDepth / (marketOrderBook.bidDepth + marketOrderBook.askDepth)) * 100}%` }}
                        />
                        <div
                          className="h-full bg-red-500/40"
                          style={{ width: `${(marketOrderBook.askDepth / (marketOrderBook.bidDepth + marketOrderBook.askDepth)) * 100}%` }}
                        />
                      </div>
                      <span className="text-red-400/50 text-[9px]">ASK</span>
                    </div>
                  </div>
                )}
                {marketOrderBook && !orderBookLoading && (
                  <div className="px-3 pb-3">
                    <AIInsightsTerminal
                      context="market"
                      data={{
                        type: 'order_book_analysis',
                        market: eventInfo.title,
                        spread: (marketOrderBook.spread * 100).toFixed(2),
                        midpoint: (marketOrderBook.midpoint * 100).toFixed(2),
                        bidDepth: Math.round(marketOrderBook.bidDepth),
                        askDepth: Math.round(marketOrderBook.askDepth),
                        bidLevels: marketOrderBook.bids.slice(0, 5).map(l => ({ price: (l.price * 100).toFixed(1), size: Math.round(l.size) })),
                        askLevels: marketOrderBook.asks.slice(0, 5).map(l => ({ price: (l.price * 100).toFixed(1), size: Math.round(l.size) })),
                        depthRatio: marketOrderBook.bidDepth > 0 ? (marketOrderBook.bidDepth / (marketOrderBook.bidDepth + marketOrderBook.askDepth) * 100).toFixed(1) : '50',
                      }}
                      commandLabel="openclaw --analyze-orderbook"
                      buttonLabel="EXPLAIN ORDER BOOK WITH AI"
                    />
                  </div>
                )}
                {!marketOrderBook && !orderBookLoading && (
                  <div className="px-3 py-2 text-cyan-400/25 text-[10px]">
                    Click "FETCH ORDER BOOK" to see bid/ask depth from the CLOB
                  </div>
                )}
                {orderBookLoading && (
                  <div className="px-3 py-3 flex items-center gap-2 text-[11px] text-cyan-400/50">
                    <LoadingSpinner size="sm" /> Fetching order book from CLOB...
                  </div>
                )}
              </div>
            )}

            {/* Explain Market with AI */}
            {marketHolders.length > 0 && !marketScanning && eventInfo && (() => {
              const scannedHolders = marketHolders.filter(h => h.bot);
              const classifications = {
                bot: scannedHolders.filter(h => h.bot?.classification === 'bot').length,
                likelyBot: scannedHolders.filter(h => h.bot?.classification === 'likely-bot').length,
                mixed: scannedHolders.filter(h => h.bot?.classification === 'mixed').length,
                human: scannedHolders.filter(h => h.bot?.classification === 'human').length,
              };
              const strategies = {
                MARKET_MAKER: scannedHolders.filter(h => h.bot?.strategy.type === 'MARKET_MAKER').length,
                SNIPER: scannedHolders.filter(h => h.bot?.strategy.type === 'SNIPER').length,
                HYBRID: scannedHolders.filter(h => h.bot?.strategy.type === 'HYBRID').length,
                MOMENTUM: scannedHolders.filter(h => h.bot?.strategy.type === 'MOMENTUM').length,
              };
              const agentCapitalByOutcome: Record<string, number> = {};
              scannedHolders
                .filter(h => h.bot?.classification === 'bot' || h.bot?.classification === 'likely-bot')
                .forEach(h => {
                  const side = h.outcome || 'Unknown';
                  agentCapitalByOutcome[side] = (agentCapitalByOutcome[side] || 0) + h.amount;
                });
              const topHolders = [...marketHolders]
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 5)
                .map(h => ({
                  name: h.pseudonym || `${h.address.slice(0, 6)}...${h.address.slice(-4)}`,
                  side: h.outcome,
                  amount: Math.round(h.amount),
                  classification: h.bot?.classification || 'unscanned',
                  strategy: h.bot?.strategy.label || null,
                }));
              const outcomes = eventInfo.markets
                .sort((a, b) => b.yesPrice - a.yesPrice)
                .slice(0, 8)
                .map(m => ({
                  label: m.groupItemTitle,
                  probability: Math.round(m.yesPrice * 100),
                  volume: Math.round(m.volume),
                }));

              const marketData = {
                title: eventInfo.title,
                volume: Math.round(eventInfo.volume),
                volume24hr: Math.round(eventInfo.volume24hr),
                liquidity: Math.round(eventInfo.liquidity),
                endDate: eventInfo.endDate,
                outcomeCount: eventInfo.markets.length,
                outcomes,
                classifications,
                strategies,
                topHolders,
                agentCapitalByOutcome: Object.fromEntries(
                  Object.entries(agentCapitalByOutcome).map(([k, v]) => [k, Math.round(v)])
                ),
              };

              return (
                <div className="mt-4">
                  <AIInsightsTerminal
                    context="market"
                    data={marketData}
                    commandLabel={`openclaw --market-intel "${eventInfo.title.slice(0, 30)}..."`}
                    buttonLabel="EXPLAIN MARKET WITH AI"
                  />
                </div>
              );
            })()}

            {/* Market Holders Results - Terminal Style */}
            {marketHolders.length > 0 && (
              <div className="mt-4 border border-cyan-500/30 bg-black/60 overflow-hidden font-mono">
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-cyan-400 text-[10px] ml-1">
                    holders --top {marketHolders.length}
                  </span>
                  {marketHolders.some(h => h.bot && (h.bot.classification === 'bot' || h.bot.classification === 'likely-bot')) && (
                    <span className="ml-auto text-red-400 text-[10px] flex items-center gap-1">
                      <PixelLobster size={10} />
                      {marketHolders.filter(h => h.bot && (h.bot.classification === 'bot' || h.bot.classification === 'likely-bot')).length} agents detected
                    </span>
                  )}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-cyan-500/15">
                        <th className="text-left px-3 py-2 text-[10px] text-cyan-400/60">{'>'} HOLDER</th>
                        <th className="text-center px-3 py-2 text-[10px] text-cyan-400/60">SIDE</th>
                        <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">AMOUNT</th>
                        <th className="text-center px-3 py-2 text-[10px] text-cyan-400/60">AGENT_SCORE</th>
                        <th className="px-3 py-2 w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketHolders.map((holder, idx) => {
                        const isExp = expandedHolder === holder.address;
                        return (
                          <>
                            <tr
                              key={holder.address}
                              className={`border-b border-cyan-500/10 hover:bg-cyan-500/5 cursor-pointer transition-colors ${
                                holder.bot?.classification === 'bot' ? 'bg-red-500/5' :
                                holder.bot?.classification === 'likely-bot' ? 'bg-orange-500/5' : ''
                              }`}
                              onClick={() => holder.bot && setExpandedHolder(isExp ? null : holder.address)}
                            >
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-cyan-400/40 text-[10px] w-4">{String(idx + 1).padStart(2, '0')}</span>
                                  <div className="flex flex-col">
                                    <span className="text-cyan-300 text-xs">
                                      {holder.pseudonym || `${holder.address.slice(0, 6)}...${holder.address.slice(-4)}`}
                                    </span>
                                    {holder.pseudonym && (
                                      <span className="text-cyan-400/30 text-[10px]">
                                        {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`text-[10px] px-1.5 py-0.5 border ${
                                  holder.outcome === 'Yes'
                                    ? 'text-green-400 border-green-500/30 bg-green-500/10'
                                    : 'text-red-400 border-red-500/30 bg-red-500/10'
                                }`}>
                                  {holder.outcome}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-xs text-cyan-300">
                                {formatUSD(holder.amount)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {holder.bot ? (
                                  <div className="flex items-center gap-1.5 justify-center flex-wrap">
                                    <BotScoreBadge score={holder.bot.botScore} classification={holder.bot.classification} />
                                    <StrategyTag type={holder.bot.strategy.type} label={holder.bot.strategy.label} />
                                  </div>
                                ) : marketScanning ? (
                                  <span className="text-cyan-400/40 text-[10px] animate-pulse">scanning...</span>
                                ) : (
                                  <span className="text-cyan-400/20 text-[10px]">--</span>
                                )}
                              </td>
                              <td className="px-3 py-2">
                                {holder.bot && (
                                  isExp ? <ChevronUp className="w-3 h-3 text-cyan-400/40" /> : <ChevronDown className="w-3 h-3 text-cyan-400/40" />
                                )}
                              </td>
                            </tr>
                            {isExp && holder.bot && (
                              <tr key={`${holder.address}-signals`}>
                                <td colSpan={5} className="p-0">
                                  <div className="bg-black/40 px-4 py-3 border-b border-cyan-500/10 space-y-1.5">
                                    <div className="text-cyan-400/40 text-[10px] mb-2">
                                      {'>'} {holder.bot.tradeCount} trades | {holder.bot.mergeCount} merges | {holder.bot.activeHours}/24h | {holder.bot.bothSidesPercent}% both-sides
                                    </div>
                                    {[
                                      { name: 'INTERVAL', weight: '20%', val: holder.bot.signals.intervalRegularity },
                                      { name: 'SPLIT/MERGE', weight: '25%', val: holder.bot.signals.splitMergeRatio },
                                      { name: 'SIZING', weight: '15%', val: holder.bot.signals.sizingConsistency },
                                      { name: '24/7', weight: '15%', val: holder.bot.signals.activity24h },
                                      { name: 'WIN_RATE', weight: '15%', val: holder.bot.signals.winRateExtreme },
                                      { name: 'FOCUS', weight: '10%', val: holder.bot.signals.marketConcentration },
                                      ...(holder.bot.signals.ghostWhale > 0 ? [{ name: 'GHOST', weight: '50%', val: holder.bot.signals.ghostWhale }] : []),
                                    ].map((s) => {
                                      const barColor = s.val >= 80 ? 'bg-red-500' : s.val >= 60 ? 'bg-orange-500' : s.val >= 40 ? 'bg-yellow-500' : 'bg-green-500';
                                      const filled = Math.round((s.val / 100) * 16);
                                      return (
                                        <div key={s.name} className="flex items-center gap-2">
                                          <span className="text-cyan-400 text-[10px] w-20 shrink-0">{s.name}</span>
                                          <div className="flex gap-[2px] flex-1">
                                            {Array.from({ length: 16 }).map((_, i) => (
                                              <div
                                                key={i}
                                                className={`w-1.5 h-2 ${i < filled ? barColor : 'bg-cyan-500/10'}`}
                                                style={{ imageRendering: 'pixelated' }}
                                              />
                                            ))}
                                          </div>
                                          <span className={`text-[10px] w-6 text-right ${s.val >= 70 ? 'text-red-400' : 'text-cyan-400'}`}>
                                            {s.val}
                                          </span>
                                          <span className="text-cyan-400/20 text-[9px] w-6">{s.weight}</span>
                                        </div>
                                      );
                                    })}
                                    {holder.bot.signals.bothSidesBonus > 0 && (
                                      <div className="text-red-400 text-[10px] pt-1 border-t border-cyan-500/10">
                                        {'>'} BOTH_SIDES_BONUS: +{holder.bot.signals.bothSidesBonus}
                                      </div>
                                    )}

                                    {/* Strategy classification */}
                                    {holder.bot.strategy.confidence > 0 && (
                                      <div className="pt-1.5 border-t border-cyan-500/10 space-y-1">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-[10px] font-bold ${STRATEGY_STYLES[holder.bot.strategy.type].text}`}>
                                            {'>'} {holder.bot.strategy.label.toUpperCase()}
                                          </span>
                                          <span className="text-cyan-400/30 text-[9px]">{holder.bot.strategy.confidence}%</span>
                                        </div>
                                        <div className="text-cyan-400/40 text-[9px]">{holder.bot.strategy.description}</div>
                                        <div className="flex gap-3 text-[8px] text-cyan-400/25">
                                          <span>ROI:{holder.bot.strategy.avgROI}%</span>
                                          <span>sizeCV:{holder.bot.strategy.sizeCV}</span>
                                          <span>bias:{holder.bot.strategy.directionalBias}%</span>
                                          {holder.bot.strategy.bimodal && <span className="text-violet-400/50">BIMODAL</span>}
                                        </div>
                                      </div>
                                    )}

                                    {/* View Positions button */}
                                    <div className="pt-2 border-t border-cyan-500/10 flex items-center gap-2">
                                      <button
                                        className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                                        onClick={(e) => { e.stopPropagation(); handleViewPositions(holder.address); }}
                                      >
                                        <Wallet className="w-3 h-3" />
                                        {holderPositions[holder.address] ? 'HIDE POSITIONS' : 'VIEW POSITIONS'}
                                      </button>
                                      {loadingPositions === holder.address && (
                                        <span className="text-cyan-400/40 text-[10px] animate-pulse">loading...</span>
                                      )}
                                      <span onClick={(e) => e.stopPropagation()}>
                                        <ShareScoreCard
                                          address={holder.address}
                                          pseudonym={holder.pseudonym}
                                          botScore={holder.bot.botScore}
                                          classification={holder.bot.classification}
                                          signals={holder.bot.signals}
                                          tradeCount={holder.bot.tradeCount}
                                        />
                                      </span>
                                      <a
                                        href={`https://polymarket.com/portfolio/${holder.address}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] text-cyan-400/40 hover:text-cyan-400 flex items-center gap-1 ml-auto transition-colors"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="w-3 h-3" /> polymarket.com
                                      </a>
                                    </div>

                                    {/* Positions list */}
                                    {holderPositions[holder.address] && (
                                      <div className="mt-2 space-y-1">
                                        <div className="text-cyan-400/40 text-[10px]">
                                          {'>'} {holderPositions[holder.address].length} open positions
                                        </div>
                                        {holderPositions[holder.address].slice(0, 15).map((pos, pi) => {
                                          const pnlColor = pos.cashPnl > 0 ? 'text-green-400' : pos.cashPnl < 0 ? 'text-red-400' : 'text-cyan-400/40';
                                          return (
                                            <div key={pi} className="flex items-center gap-2 text-[10px]">
                                              <span className="text-cyan-400/30 w-3">{String(pi + 1).padStart(2, '0')}</span>
                                              <span className={`px-1 py-0.5 border text-[9px] ${
                                                pos.outcome === 'Yes'
                                                  ? 'text-green-400 border-green-500/30 bg-green-500/10'
                                                  : 'text-red-400 border-red-500/30 bg-red-500/10'
                                              }`}>
                                                {pos.outcome}
                                              </span>
                                              <span className="text-cyan-300 truncate flex-1" title={pos.title}>{pos.title}</span>
                                              <span className="text-cyan-400 shrink-0">{formatUSD(pos.currentValue)}</span>
                                              <span className={`${pnlColor} shrink-0 w-16 text-right`}>
                                                {pos.cashPnl > 0 ? '+' : ''}{formatUSD(pos.cashPnl)}
                                              </span>
                                            </div>
                                          );
                                        })}
                                        {holderPositions[holder.address].length > 15 && (
                                          <div className="text-cyan-400/30 text-[9px]">
                                            {'>'} +{holderPositions[holder.address].length - 15} more positions
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden divide-y divide-cyan-500/10">
                  {marketHolders.map((holder, idx) => {
                    const isExp = expandedHolder === holder.address;
                    return (
                      <div
                        key={holder.address}
                        className={`px-3 py-2.5 ${
                          holder.bot?.classification === 'bot' ? 'bg-red-500/5' :
                          holder.bot?.classification === 'likely-bot' ? 'bg-orange-500/5' : ''
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <span className="text-cyan-400/40 text-[10px]">{String(idx + 1).padStart(2, '0')}</span>
                            <div>
                              <p className="text-cyan-300 text-xs">
                                {holder.pseudonym || `${holder.address.slice(0, 6)}...${holder.address.slice(-4)}`}
                              </p>
                              {holder.pseudonym && (
                                <p className="text-cyan-400/30 text-[10px]">
                                  {holder.address.slice(0, 6)}...{holder.address.slice(-4)}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-1.5 py-0.5 border ${
                              holder.outcome === 'Yes'
                                ? 'text-green-400 border-green-500/30 bg-green-500/10'
                                : 'text-red-400 border-red-500/30 bg-red-500/10'
                            }`}>
                              {holder.outcome}
                            </span>
                            {holder.bot && <BotScoreBadge score={holder.bot.botScore} classification={holder.bot.classification} />}
                            {holder.bot && <StrategyTag type={holder.bot.strategy.type} label={holder.bot.strategy.label} />}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-cyan-300 text-xs">{formatUSD(holder.amount)}</span>
                          {holder.bot && !marketScanning && (
                            <button
                              className="flex items-center gap-1 text-[10px] text-cyan-400/40"
                              onClick={() => setExpandedHolder(isExp ? null : holder.address)}
                            >
                              signals
                              {isExp ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                            </button>
                          )}
                          {!holder.bot && marketScanning && (
                            <span className="text-cyan-400/40 text-[10px] animate-pulse">scanning...</span>
                          )}
                        </div>
                        {isExp && holder.bot && (
                          <div className="mt-2 pt-2 border-t border-cyan-500/10 space-y-1">
                            {[
                              { name: 'INTERVAL', val: holder.bot.signals.intervalRegularity },
                              { name: 'SPLIT/MERGE', val: holder.bot.signals.splitMergeRatio },
                              { name: 'SIZING', val: holder.bot.signals.sizingConsistency },
                              { name: '24/7', val: holder.bot.signals.activity24h },
                              { name: 'WIN_RATE', val: holder.bot.signals.winRateExtreme },
                              { name: 'FOCUS', val: holder.bot.signals.marketConcentration },
                              ...(holder.bot.signals.ghostWhale > 0 ? [{ name: 'GHOST', val: holder.bot.signals.ghostWhale }] : []),
                            ].map((s) => {
                              const barColor = s.val >= 80 ? 'bg-red-500' : s.val >= 60 ? 'bg-orange-500' : s.val >= 40 ? 'bg-yellow-500' : 'bg-green-500';
                              const filled = Math.round((s.val / 100) * 12);
                              return (
                                <div key={s.name} className="flex items-center gap-2">
                                  <span className="text-cyan-400 text-[10px] w-16 shrink-0">{s.name}</span>
                                  <div className="flex gap-[2px] flex-1">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                      <div
                                        key={i}
                                        className={`w-1.5 h-2 ${i < filled ? barColor : 'bg-cyan-500/10'}`}
                                        style={{ imageRendering: 'pixelated' }}
                                      />
                                    ))}
                                  </div>
                                  <span className={`text-[10px] w-5 text-right ${s.val >= 70 ? 'text-red-400' : 'text-cyan-400'}`}>
                                    {s.val}
                                  </span>
                                </div>
                              );
                            })}
                            {holder.bot.signals.bothSidesBonus > 0 && (
                              <div className="text-red-400 text-[10px] pt-1 border-t border-cyan-500/10">
                                {'>'} BONUS: +{holder.bot.signals.bothSidesBonus}
                              </div>
                            )}

                            {/* View Positions - Mobile */}
                            <div className="pt-2 border-t border-cyan-500/10 flex flex-wrap items-center gap-2">
                              <button
                                className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                                onClick={(e) => { e.stopPropagation(); handleViewPositions(holder.address); }}
                              >
                                <Wallet className="w-3 h-3" />
                                {holderPositions[holder.address] ? 'HIDE' : 'POSITIONS'}
                              </button>
                              {loadingPositions === holder.address && (
                                <span className="text-cyan-400/40 text-[10px] animate-pulse">loading...</span>
                              )}
                              <ShareScoreCard
                                address={holder.address}
                                pseudonym={holder.pseudonym}
                                botScore={holder.bot.botScore}
                                classification={holder.bot.classification}
                                signals={holder.bot.signals}
                                tradeCount={holder.bot.tradeCount}
                              />
                              <a
                                href={`https://polymarket.com/portfolio/${holder.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] text-cyan-400/40 hover:text-cyan-400 flex items-center gap-1 ml-auto"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>

                            {holderPositions[holder.address] && (
                              <div className="mt-1.5 space-y-1">
                                {holderPositions[holder.address].slice(0, 10).map((pos, pi) => {
                                  const pnlColor = pos.cashPnl > 0 ? 'text-green-400' : pos.cashPnl < 0 ? 'text-red-400' : 'text-cyan-400/40';
                                  return (
                                    <div key={pi} className="flex items-center gap-1.5 text-[10px]">
                                      <span className={`px-1 border text-[9px] ${
                                        pos.outcome === 'Yes'
                                          ? 'text-green-400 border-green-500/30'
                                          : 'text-red-400 border-red-500/30'
                                      }`}>
                                        {pos.outcome}
                                      </span>
                                      <span className="text-cyan-300 truncate flex-1">{pos.title}</span>
                                      <span className={`${pnlColor} shrink-0`}>
                                        {pos.cashPnl > 0 ? '+' : ''}{formatUSD(pos.cashPnl)}
                                      </span>
                                    </div>
                                  );
                                })}
                                {holderPositions[holder.address].length > 10 && (
                                  <div className="text-cyan-400/30 text-[9px]">
                                    +{holderPositions[holder.address].length - 10} more
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Terminal footer */}
                <div className="px-3 py-1.5 border-t border-cyan-500/15 text-cyan-400/30 text-[9px]">
                  {'>'} {marketHolders.length} holders loaded | all scanned for agent behavior
                </div>
              </div>
            )}

            {/* OnchainOS Signal Panel — aparece cuando hay agentes con score ≥ 80 */}
            {marketHolders.some(h => h.bot && h.bot.botScore >= 80) && eventInfo && (
              <SignalPanel
                detectedAgents={marketHolders
                  .filter(h => h.bot && h.bot.botScore >= 80)
                  .map(h => {
                    // Precio real del outcome desde marketInfo o eventInfo
                    const isYes = h.outcome?.toUpperCase() === 'YES';
                    const outcomePrice = marketInfo?.outcomePrices
                      ? parseFloat(marketInfo.outcomePrices[isYes ? 0 : 1]) || 0.5
                      : eventInfo.markets?.[0]?.yesPrice
                        ? (isYes ? eventInfo.markets[0].yesPrice : 1 - eventInfo.markets[0].yesPrice)
                        : 0.5;
                    return {
                      address: h.address,
                      score: h.bot!.botScore,
                      direction: (isYes ? 'YES' : 'NO') as 'YES' | 'NO',
                      positionDelta: h.amount,
                      outcomePrice,
                    };
                  })}
                marketSlug={eventInfo.slug}
              />
            )}
            </>)}

            {/* Bond Scanner Tab */}
            {scanMode === 'bonds' && (
              <div className="border border-violet-500/30 bg-black/60 overflow-hidden font-mono" style={{ imageRendering: 'auto' }}>
                {/* Terminal header */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/10 border-b border-violet-500/20">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500/60" />
                    <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                    <div className="w-2 h-2 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-violet-400 text-[10px] ml-1 flex items-center gap-2">
                    <PixelLobster size={12} className="text-violet-400" />
                    openclaw --bonds --min-price {bondMinPrice}¢
                  </span>
                  {bondLoading && <div className="ml-auto w-2 h-2 rounded-full bg-violet-500 animate-pulse" />}
                </div>

                {/* Filter bar */}
                <div className="px-3 py-2.5 border-b border-violet-500/10">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={bondMinPrice}
                      onChange={(e) => setBondMinPrice(Number(e.target.value))}
                      disabled={bondLoading}
                      className="h-8 px-2 border border-violet-500/20 bg-black text-violet-400 text-[11px] font-mono"
                    >
                      <option value={85}>Min: 85¢ (15% return)</option>
                      <option value={90}>Min: 90¢ (11% return)</option>
                      <option value={93}>Min: 93¢ (7.5% return)</option>
                      <option value={95}>Min: 95¢ (5.3% return)</option>
                      <option value={97}>Min: 97¢ (3.1% return)</option>
                    </select>
                    <select
                      value={bondMinLiquidity}
                      onChange={(e) => setBondMinLiquidity(Number(e.target.value))}
                      disabled={bondLoading}
                      className="h-8 px-2 border border-violet-500/20 bg-black text-violet-400 text-[11px] font-mono"
                    >
                      <option value={500}>Liq: $500+</option>
                      <option value={1000}>Liq: $1K+</option>
                      <option value={5000}>Liq: $5K+</option>
                      <option value={10000}>Liq: $10K+</option>
                      <option value={50000}>Liq: $50K+</option>
                    </select>
                    <select
                      value={bondSort}
                      onChange={(e) => setBondSort(e.target.value as typeof bondSort)}
                      disabled={bondLoading}
                      className="h-8 px-2 border border-violet-500/20 bg-black text-violet-400 text-[11px] font-mono"
                    >
                      <option value="apy">Sort: Annualized Yield</option>
                      <option value="return">Sort: Actual Return</option>
                      <option value="liquidity">Sort: Available Liquidity</option>
                      <option value="time">Sort: Ending Soonest</option>
                    </select>
                    <button
                      onClick={handleBondScan}
                      disabled={bondLoading}
                      className="h-8 px-4 border border-violet-500/40 bg-violet-500/10 text-violet-400 text-[11px] font-bold hover:bg-violet-500/20 transition-colors disabled:opacity-50 flex items-center gap-2 justify-center"
                    >
                      <ScanSearch className={`w-3.5 h-3.5 ${bondLoading ? 'animate-pulse' : ''}`} />
                      {bondLoading ? 'SCANNING...' : 'SCAN BONDS'}
                    </button>
                  </div>
                </div>

                {/* Content area */}
                <div className="px-3 py-3 space-y-3">
                  {/* How it works explainer (shown before first scan) */}
                  {bondMarkets.length === 0 && !bondLoading && (
                    <div className="border border-violet-500/15 bg-violet-500/5 p-3 space-y-2">
                      <div className="text-violet-400 text-[11px] font-bold">{'>'} HOW POLYMARKET BONDS WORK</div>
                      <div className="text-violet-300/60 text-[10px] space-y-1">
                        <p>{'>'} Find markets where one outcome is nearly certain (e.g. 96¢)</p>
                        <p>{'>'} Buy that outcome → if it resolves to $1, you pocket the difference</p>
                        <p>{'>'} Example: Buy YES at 96¢ → market resolves YES → you earn 4¢ per share (4.17% return)</p>
                        <p>{'>'} APY = return annualized by time to resolution. Hidden for bonds &lt;7 days (misleading)</p>
                        <p className="text-amber-400/60">{'>'} RISK: If the "certain" outcome doesn't happen, you lose most of your investment</p>
                      </div>
                    </div>
                  )}

                  {/* Summary stats */}
                  {sortedBonds.length > 0 && (
                    <div className="grid grid-cols-4 gap-[2px] bg-violet-500/10">
                      <div className="bg-black/80 p-2.5 text-center">
                        <div className="text-violet-400 text-lg font-bold">{sortedBonds.length}</div>
                        <div className="flex justify-center gap-[2px] my-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 ${i < Math.min(Math.round(sortedBonds.length / 20), 5) ? 'bg-violet-500' : 'bg-violet-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                          ))}
                        </div>
                        <div className="text-violet-400/40 text-[9px]">BONDS FOUND</div>
                      </div>
                      <div className="bg-black/80 p-2.5 text-center">
                        <div className="text-green-400 text-lg font-bold">
                          {sortedBonds.length > 0 ? `${Math.max(...sortedBonds.map(b => b.returnPct)).toFixed(1)}%` : '—'}
                        </div>
                        <div className="flex justify-center gap-[2px] my-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 ${i < Math.min(Math.round(Math.max(...sortedBonds.map(b => b.returnPct)) / 2), 5) ? 'bg-green-500' : 'bg-green-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                          ))}
                        </div>
                        <div className="text-green-400/40 text-[9px]">BEST RETURN</div>
                      </div>
                      <div className="bg-black/80 p-2.5 text-center">
                        <div className="text-amber-400 text-lg font-bold">
                          {sortedBonds.length > 0 ? `${Math.max(...sortedBonds.map(b => b.returnPct)).toFixed(1)}%` : '—'}
                        </div>
                        <div className="flex justify-center gap-[2px] my-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 ${i < Math.min(Math.round(Math.max(...sortedBonds.map(b => b.returnPct)) / 4), 5) ? 'bg-amber-500' : 'bg-amber-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                          ))}
                        </div>
                        <div className="text-amber-400/40 text-[9px]">MAX RETURN</div>
                      </div>
                      <div className="bg-black/80 p-2.5 text-center">
                        <div className="text-violet-400 text-lg font-bold">
                          {sortedBonds.filter(b => b.hoursToEnd <= 48).length}
                        </div>
                        <div className="flex justify-center gap-[2px] my-1">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 ${i < Math.min(sortedBonds.filter(b => b.hoursToEnd <= 48).length, 5) ? 'bg-violet-500' : 'bg-violet-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                          ))}
                        </div>
                        <div className="text-violet-400/40 text-[9px]">ENDS {'<'}48H</div>
                      </div>
                    </div>
                  )}

                  {/* Bond list */}
                  {sortedBonds.length > 0 && (
                    <div className="border border-violet-500/15 bg-black/40 overflow-hidden">
                      {/* Table header */}
                      <div className="grid grid-cols-12 gap-1 px-3 py-1.5 bg-violet-500/5 border-b border-violet-500/10 text-[9px] text-violet-400/40">
                        <div className="col-span-3">MARKET</div>
                        <div className="text-center" title="Which side to buy (the near-certain outcome)">SIDE</div>
                        <div className="text-right" title="Current price per share (buy at this price, sells for $1 if correct)">PRICE</div>
                        <div className="text-right" title="Your profit if the market resolves in your favor">RETURN</div>
                        <div className="text-right" title="Annualized yield (hidden for bonds ending in less than 7 days)">APY</div>
                        <div className="text-right" title="Extra rewards from Polymarket for providing liquidity">+REWARD</div>
                        <div className="text-right" title="Available liquidity — how much you can buy without moving the price">LIQ</div>
                        <div className="text-right" title="Total trading volume on this market">VOL</div>
                        <div className="text-right" title="Time until market resolves (shorter = faster payout)">TIME</div>
                        <div className="text-center">LINK</div>
                      </div>

                      {/* Bond rows */}
                      <div className="divide-y divide-violet-500/10 max-h-[500px] overflow-y-auto">
                        {sortedBonds.map((bond, idx) => {
                          const timeLabel = bond.hoursToEnd < 24
                            ? `${bond.hoursToEnd}h`
                            : bond.daysToEnd < 30
                            ? `${bond.daysToEnd}d`
                            : `${Math.round(bond.daysToEnd / 30)}mo`;
                          // For short-term bonds (<7d), APY is misleading — cap display and add context
                          const isShortTerm = bond.daysToEnd < 7;
                          const cappedApy = Math.min(bond.apy, 9999);
                          const apyColor = isShortTerm ? 'text-violet-300/60' :
                            cappedApy >= 100 ? 'text-green-400' :
                            cappedApy >= 20 ? 'text-amber-400' : 'text-violet-300';
                          const timeColor = bond.hoursToEnd <= 24 ? 'text-red-400' :
                            bond.hoursToEnd <= 72 ? 'text-amber-400' : 'text-violet-300/60';

                          const rewardApy = rewardRates.get(bond.conditionId) || 0;
                          const effectiveApy = cappedApy + rewardApy;

                          return (
                            <div key={bond.conditionId} className="grid grid-cols-12 gap-1 px-3 py-2 hover:bg-violet-500/5 transition-colors items-center text-[10px]">
                              <div className="col-span-3 truncate text-violet-300" title={bond.question}>
                                <span className="text-violet-400/30 mr-1">{String(idx + 1).padStart(2, '0')}</span>
                                {bond.question}
                              </div>
                              <div className="text-center">
                                <span className={`px-1.5 py-0.5 border text-[9px] font-bold ${
                                  bond.safeSide === 'YES'
                                    ? 'text-green-400 border-green-500/30 bg-green-500/10'
                                    : 'text-red-400 border-red-500/30 bg-red-500/10'
                                }`}>
                                  {bond.safeSide}
                                </span>
                              </div>
                              <div className="text-right text-violet-300 font-bold">{(bond.safePrice * 100).toFixed(1)}¢</div>
                              <div className="text-right text-amber-400">{bond.returnPct.toFixed(1)}%</div>
                              <div className={`text-right ${apyColor}`} title={isShortTerm ? `Short-term bond (${timeLabel}) — APY is inflated. Actual return: ${bond.returnPct.toFixed(1)}%` : rewardApy > 0 ? `Price APY: ${cappedApy.toFixed(0)}% + Reward: ${rewardApy.toFixed(0)}% = ${effectiveApy.toFixed(0)}%` : `Annualized return based on ${timeLabel} to resolution`}>
                                {isShortTerm ? '—' : cappedApy >= 1000 ? `${(cappedApy / 1000).toFixed(1)}K` : `${cappedApy.toFixed(0)}%`}
                              </div>
                              <div className={`text-right ${rewardApy > 0 ? 'text-cyan-400' : 'text-violet-400/20'}`} title="Liquidity incentive reward APY from Polymarket">
                                {rewardApy > 0 ? `+${rewardApy >= 100 ? rewardApy.toFixed(0) : rewardApy.toFixed(1)}%` : '—'}
                              </div>
                              <div className="text-right text-violet-300/60">{formatUSD(bond.liquidity)}</div>
                              <div className="text-right text-violet-300/40">{formatUSD(bond.volume)}</div>
                              <div className={`text-right ${timeColor}`}>{timeLabel}</div>
                              <div className="text-center">
                                <a
                                  href={`https://polymarket.com/event/${bond.eventSlug || bond.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-violet-400/30 hover:text-violet-400 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="w-3 h-3 inline" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* AI Explain for Bonds */}
                  {sortedBonds.length > 0 && !bondLoading && (
                    <AIInsightsTerminal
                      context="smartmoney-bonds"
                      data={{
                        totalBonds: sortedBonds.length,
                        topByApy: sortedBonds.slice(0, 10).map(b => ({
                          market: b.question,
                          side: b.safeSide,
                          price: `${(b.safePrice * 100).toFixed(1)}¢`,
                          returnPct: b.returnPct,
                          apy: b.apy,
                          liquidity: Math.round(b.liquidity),
                          volume: Math.round(b.volume),
                          timeLeft: b.hoursToEnd < 24 ? `${b.hoursToEnd}h` : `${b.daysToEnd}d`,
                          holders: b.holdersCount,
                        })),
                        shortTerm: sortedBonds.filter(b => b.hoursToEnd <= 48).length,
                        avgReturn: sortedBonds.length > 0 ? (sortedBonds.reduce((a, b) => a + b.returnPct, 0) / sortedBonds.length).toFixed(2) : '0',
                        totalLiquidity: Math.round(sortedBonds.reduce((a, b) => a + b.liquidity, 0)),
                      }}
                      commandLabel="openclaw --analyze-bonds"
                      buttonLabel="EXPLAIN BONDS WITH AI"
                    />
                  )}
                </div>

                {/* Terminal footer */}
                <div className="px-3 py-1.5 border-t border-violet-500/15 text-violet-400/30 text-[9px] flex items-center justify-between">
                  <span>{'>'} bond scanner v2.0 (CLOB rewards) — not financial advice</span>
                  <span>{sortedBonds.length > 0 ? `${sortedBonds.length} opportunities · min ${bondMinPrice}¢` : 'ready'}</span>
                </div>
              </div>
            )}

            {/* Smart Money Tab */}
            {scanMode === 'smartmoney' && (
              <>
                {/* Terminal-style container */}
                <div className="border border-green-500/30 bg-black/60 overflow-hidden font-mono" style={{ imageRendering: 'auto' }}>
                  {/* Terminal header */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/60" />
                      <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
                      <div className="w-2 h-2 rounded-full bg-green-500/60" />
                    </div>
                    <span className="text-green-400 text-[10px] ml-1 flex items-center gap-2">
                      <PixelLobster size={12} className="text-green-400" />
                      openclaw --smart-money --wallets {smartMoneyWalletCount}
                    </span>
                    {smartMoneyLoading && <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                  </div>

                  {/* Filter bar */}
                  <div className="px-3 py-2.5 border-b border-green-500/10">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={smartMoneyCategory}
                        onChange={(e) => setSmartMoneyCategory(e.target.value)}
                        disabled={smartMoneyLoading}
                        className="h-8 px-2 border border-green-500/20 bg-black text-green-400 text-[11px] font-mono"
                      >
                        <option value="OVERALL">All Markets</option>
                        <option value="POLITICS">Politics</option>
                        <option value="SPORTS">Sports</option>
                        <option value="CRYPTO">Crypto</option>
                      </select>
                      <select
                        value={smartMoneyTimePeriod}
                        onChange={(e) => setSmartMoneyTimePeriod(e.target.value)}
                        disabled={smartMoneyLoading}
                        className="h-8 px-2 border border-green-500/20 bg-black text-green-400 text-[11px] font-mono"
                      >
                        <option value="DAY">Top PnL Today</option>
                        <option value="WEEK">Top PnL This Week</option>
                        <option value="MONTH">Top PnL This Month</option>
                        <option value="ALL">Top PnL All Time</option>
                      </select>
                      <select
                        value={smartMoneyWalletCount}
                        onChange={(e) => setSmartMoneyWalletCount(Number(e.target.value))}
                        disabled={smartMoneyLoading}
                        className="h-8 px-2 border border-green-500/20 bg-black text-green-400 text-[11px] font-mono"
                      >
                        {[10, 25, 50, 100, 150, 200].map(n => (
                          <option key={n} value={n}>Top {n} wallets</option>
                        ))}
                      </select>
                      <select
                        value={smartMoneySort}
                        onChange={(e) => setSmartMoneySort(e.target.value as 'consensus' | 'capital' | 'traders' | 'aiscore')}
                        disabled={smartMoneyLoading}
                        className="h-8 px-2 border border-green-500/20 bg-black text-green-400 text-[11px] font-mono"
                      >
                        <option value="aiscore">Sort: Best Overall</option>
                        <option value="traders">Sort: Most Traders</option>
                        <option value="consensus">Sort: Strongest Agreement</option>
                        <option value="capital">Sort: Most Money</option>
                      </select>
                      <button
                        onClick={handleSmartMoneyFetch}
                        disabled={smartMoneyLoading}
                        className="h-8 px-4 border border-green-500/40 bg-green-500/10 text-green-400 text-[11px] font-bold hover:bg-green-500/20 transition-colors disabled:opacity-50 flex items-center gap-2 justify-center"
                      >
                        <TrendingUp className={`w-3.5 h-3.5 ${smartMoneyLoading ? 'animate-pulse' : ''}`} />
                        {smartMoneyLoading ? 'SCANNING...' : `SCAN ${smartMoneyWalletCount} WALLETS`}
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  {smartMoneyProgress && (
                    <div className="px-3 py-2 border-b border-green-500/10 flex items-center gap-2 text-[11px] text-green-400">
                      <span className="animate-pulse">{'>'}</span>
                      {smartMoneyProgress}
                    </div>
                  )}

                  {/* Agent Activity Log */}
                  {agentLog.length > 0 && (
                    <div className="px-3 pt-3">
                      <AgentActivityLog entries={agentLog} />
                    </div>
                  )}

                  {/* Content area inside terminal */}
                  <div className="px-3 py-3 space-y-3">

                {/* Layer 1: Quick Stats — pixel style */}
                {sortedSmartMoneyMarkets.length > 0 && (
                  <div className="grid grid-cols-3 gap-[2px] bg-green-500/10">
                    <div className="bg-black/80 p-3 text-center">
                      <div className="text-green-400/40 text-[9px]">TOP TRADERS</div>
                      <div className="text-green-300 text-2xl font-bold">{smartMoneyLeaderboard.length}</div>
                      <div className="flex justify-center gap-[2px] mt-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 ${i < Math.min(Math.round(smartMoneyLeaderboard.length / (smartMoneyWalletCount / 10)), 10) ? 'bg-green-500' : 'bg-green-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                        ))}
                      </div>
                      <div className="text-green-400/30 text-[9px] mt-1">PnL: {formatUSD(smartMoneyLeaderboard.reduce((a, t) => a + t.pnl, 0))}</div>
                    </div>
                    <div className="bg-black/80 p-3 text-center">
                      <div className="text-green-400/40 text-[9px]">MARKETS FOUND</div>
                      <div className="text-green-300 text-2xl font-bold">{sortedSmartMoneyMarkets.length}</div>
                      <div className="flex justify-center gap-[2px] mt-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 ${i < Math.round(Math.max(...sortedSmartMoneyMarkets.map(m => m.capitalConsensus)) / 10) ? 'bg-green-500' : 'bg-green-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                        ))}
                      </div>
                      <div className="text-green-400/30 text-[9px] mt-1">Max: {Math.max(...sortedSmartMoneyMarkets.map(m => m.capitalConsensus))}%</div>
                    </div>
                    <div className="bg-black/80 p-3 text-center">
                      <div className="text-amber-400/40 text-[9px]">#1 SIGNAL</div>
                      <div className="text-amber-300 text-sm font-bold truncate mt-0.5" title={sortedSmartMoneyMarkets[0]?.title}>
                        {sortedSmartMoneyMarkets[0]?.title?.slice(0, 25) || '—'}
                      </div>
                      <div className="flex justify-center gap-[2px] mt-1">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 ${i < Math.round((sortedSmartMoneyMarkets[0]?.topOutcomeCapitalPct || 0) / 10) ? 'bg-amber-500' : 'bg-amber-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                        ))}
                      </div>
                      <div className="text-amber-400/30 text-[9px] mt-1">{sortedSmartMoneyMarkets[0]?.topOutcome} {sortedSmartMoneyMarkets[0]?.topOutcomeCapitalPct}%</div>
                    </div>
                  </div>
                )}

                {/* Intelligence Panel Tabs — pixel grid style */}
                {sortedSmartMoneyMarkets.length > 0 && (
                  <div className="space-y-1">
                    <div className="grid grid-cols-5 gap-[2px] bg-green-500/10">
                      {([
                        { key: 'flow' as const, label: 'MONEY MAP', icon: '◎', count: '' },
                        { key: 'signals' as const, label: 'WHALE MOVES', icon: '⚡', count: whaleSignals.length > 0 ? `${whaleSignals.length}` : '' },
                        { key: 'edge' as const, label: 'PRICE GAPS', icon: '◇', count: marketsWithEdge.length > 0 ? `${marketsWithEdge.length}` : '' },
                        { key: 'portfolios' as const, label: 'WALLETS', icon: '▦', count: traderPortfolios.length > 0 ? `${traderPortfolios.length}` : '' },
                        { key: 'alpha' as const, label: 'ALERTS', icon: '★', count: alphaSignals.length > 0 ? `${alphaSignals.length}` : '' },
                      ]).map(tab => (
                        <button
                          key={tab.key}
                          onClick={() => setSmartMoneyActivePanel(tab.key)}
                          className={`py-2 text-[10px] transition-all text-center ${
                            smartMoneyActivePanel === tab.key
                              ? 'bg-green-500/15 text-green-400'
                              : 'bg-black/60 text-green-400/30 hover:text-green-400/60 hover:bg-green-500/5'
                          }`}
                        >
                          <div className="text-sm">{tab.icon}</div>
                          <div className="mt-0.5">{tab.label}{tab.count ? ` (${tab.count})` : ''}</div>
                        </button>
                      ))}
                    </div>
                    <div className="text-[9px] text-green-400/25 font-mono px-1">
                      {smartMoneyActivePanel === 'flow' && '> Where the money is going — who is betting on what'}
                      {smartMoneyActivePanel === 'signals' && '> Recent buys & sells from top traders (last 72 hours)'}
                      {smartMoneyActivePanel === 'edge' && '> Markets where traders bought cheaper than current price'}
                      {smartMoneyActivePanel === 'portfolios' && '> How each trader spreads their bets across markets'}
                      {smartMoneyActivePanel === 'alpha' && '> Best opportunities found by combining all signals'}
                    </div>
                  </div>
                )}

                {/* Panel: Capital Flow (Sankey) */}
                {sortedSmartMoneyMarkets.length > 0 && smartMoneyActivePanel === 'flow' && (
                  <div className="mt-3 space-y-3">
                    <SmartMoneyFlowChart markets={sortedSmartMoneyMarkets} leaderboard={smartMoneyLeaderboard} />
                    {!smartMoneyLoading && (
                      <AIInsightsTerminal
                        context="smartmoney"
                        data={{
                          category: smartMoneyCategory,
                          timePeriod: smartMoneyTimePeriod,
                          traderCount: smartMoneyLeaderboard.length,
                          combinedPnl: Math.round(smartMoneyLeaderboard.reduce((a, t) => a + t.pnl, 0)),
                          topFlows: sortedSmartMoneyMarkets.slice(0, 8).map(m => ({
                            market: m.title,
                            traders: m.traderCount,
                            capital: Math.round(m.totalCapital),
                            topOutcome: m.topOutcome,
                            consensus: m.capitalConsensus,
                          })),
                        }}
                        commandLabel="smartmoney --analyze-flow"
                        buttonLabel="EXPLAIN CAPITAL FLOW WITH AI"
                      />
                    )}
                  </div>
                )}

                {/* Panel: Whale Signals */}
                {sortedSmartMoneyMarkets.length > 0 && smartMoneyActivePanel === 'signals' && (() => {
                  const buys = displaySignals.filter(s => s.side === 'BUY');
                  const sells = displaySignals.filter(s => s.side === 'SELL');
                  const highConviction = displaySignals.filter(s => s.conviction >= 20);

                  // Data for AI
                  const signalsAIData = {
                    signals: displaySignals.slice(0, 25).map(s => ({
                      trader: `#${s.traderRank} ${s.traderName}`,
                      side: s.side,
                      outcome: s.outcome,
                      market: s.marketTitle,
                      size: Math.round(s.usdcSize),
                      price: Math.round(s.price * 100),
                      hoursAgo: s.hoursAgo,
                      conviction: s.conviction,
                    })),
                  };

                  return (
                    <div className="mt-3 space-y-3">
                      {/* Summary row — pixel style */}
                      {displaySignals.length > 0 && (
                        <div className="grid grid-cols-3 gap-[2px] bg-green-500/10">
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-green-400 text-lg font-bold">{buys.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(Math.round(buys.length / (displaySignals.length / 5)), 5) ? 'bg-green-500' : 'bg-green-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-green-400/40 text-[9px]">BUYS · {formatUSD(buys.reduce((a, s) => a + s.usdcSize, 0))}</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-red-400 text-lg font-bold">{sells.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(Math.round(sells.length / (displaySignals.length / 5)), 5) ? 'bg-red-500' : 'bg-red-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-red-400/40 text-[9px]">SELLS · {formatUSD(sells.reduce((a, s) => a + s.usdcSize, 0))}</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-amber-400 text-lg font-bold">{highConviction.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(highConviction.length, 5) ? 'bg-amber-500' : 'bg-amber-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-amber-400/40 text-[9px]">HIGH CONVICTION ({'>'}20%)</div>
                          </div>
                        </div>
                      )}

                      {/* Signal list */}
                      <div className="border border-green-500/15 bg-black/40 overflow-hidden font-mono">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/5 border-b border-green-500/10">
                          <span className="text-green-400/50 text-[10px]">{'>'} SIGNALS (last 72h)</span>
                          <span className="text-green-400/25 text-[10px]">{whaleSignals.length} from top 15</span>
                        </div>
                        {displaySignals.length === 0 ? (
                          <div className="p-4 text-green-400/30 text-xs text-center">No recent whale trades detected. Run a scan first.</div>
                        ) : (
                          <div className="divide-y divide-green-500/10 max-h-[400px] overflow-y-auto">
                            {displaySignals.map((sig, i) => (
                              <div key={i} className="px-3 py-2 hover:bg-green-500/5 transition-colors">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] px-1.5 py-0.5 border font-bold ${
                                    sig.side === 'BUY'
                                      ? 'text-green-400 border-green-500/30 bg-green-500/10'
                                      : 'text-red-400 border-red-500/30 bg-red-500/10'
                                  }`}>
                                    {sig.side}
                                  </span>
                                  <span className="text-green-300 text-xs truncate flex-1">{sig.marketTitle}</span>
                                  <span className="text-green-400/50 text-[10px] shrink-0">
                                    {sig.hoursAgo < 1 ? 'just now' : sig.hoursAgo < 24 ? `${sig.hoursAgo}h ago` : `${Math.floor(sig.hoursAgo / 24)}d ago`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1 text-[10px]">
                                  <span className="text-green-400/70">#{sig.traderRank} {sig.traderName}</span>
                                  <span className={`px-1 py-0.5 border text-[9px] ${
                                    sig.outcome.toLowerCase() === 'yes'
                                      ? 'text-green-400 border-green-500/30'
                                      : 'text-red-400 border-red-500/30'
                                  }`}>{sig.outcome}</span>
                                  <span className="text-green-300">{formatUSD(sig.usdcSize)}</span>
                                  <span className="text-green-400/40">@ {(sig.price * 100).toFixed(0)}¢</span>
                                  {sig.conviction > 5 && (
                                    <span className={`px-1 py-0.5 text-[9px] border ${
                                      sig.conviction >= 30 ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                                      sig.conviction >= 15 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                                      'text-green-400/50 border-green-500/20'
                                    }`}>
                                      {sig.conviction}% conviction
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* AI Explain for Signals */}
                      {displaySignals.length > 0 && !smartMoneyLoading && (
                        <AIInsightsTerminal
                          context="smartmoney-signals"
                          data={signalsAIData}
                          commandLabel="smartmoney --analyze-signals"
                          buttonLabel="EXPLAIN SIGNALS WITH AI"
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Panel: Edge Tracker */}
                {sortedSmartMoneyMarkets.length > 0 && smartMoneyActivePanel === 'edge' && (() => {
                  const profitMarkets = marketsWithEdge.filter(m => m.edgeDirection === 'PROFIT');
                  const underwaterMarkets = marketsWithEdge.filter(m => m.edgeDirection === 'UNDERWATER');

                  // Build cross-reference summary with whale signals
                  const signalsSummary = whaleSignals.length > 0
                    ? marketsWithEdge.slice(0, 5).map(m => {
                        const marketSignals = whaleSignals.filter(s => s.marketTitle === m.title);
                        if (marketSignals.length === 0) return null;
                        const buyCount = marketSignals.filter(s => s.side === 'BUY').length;
                        const sellCount = marketSignals.filter(s => s.side === 'SELL').length;
                        return `  "${m.title}" (${m.edgeDirection}): ${buyCount} buys, ${sellCount} sells in 72h`;
                      }).filter(Boolean).join('\n')
                    : '';

                  // Data for AI
                  const edgeAIData = {
                    edges: marketsWithEdge.slice(0, 15).map(m => ({
                      title: m.title,
                      avgEntry: Math.round(m.avgEntryPrice * 100),
                      entryRange: m.entryPriceMin > 0 && m.entryPriceMax > m.entryPriceMin
                        ? `${Math.round(m.entryPriceMin * 100)}¢-${Math.round(m.entryPriceMax * 100)}¢`
                        : null,
                      marketPrice: Math.round(m.marketPrice * 100),
                      edge: m.edgePercent,
                      direction: m.edgeDirection,
                      topOutcome: m.topOutcome,
                      traders: m.traderCount,
                      capital: formatUSD(m.totalCapital),
                    })),
                    signalsSummary,
                  };

                  return (
                    <div className="mt-3 space-y-3">
                      {/* Summary row — pixel style */}
                      {marketsWithEdge.length > 0 && (
                        <div className="grid grid-cols-4 gap-[2px] bg-green-500/10">
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-green-400 text-lg font-bold">{profitMarkets.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(profitMarkets.length, 5) ? 'bg-green-500' : 'bg-green-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-green-400/40 text-[9px]">IN PROFIT</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-red-400 text-lg font-bold">{underwaterMarkets.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(underwaterMarkets.length, 5) ? 'bg-red-500' : 'bg-red-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-red-400/40 text-[9px]">UNDERWATER</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-amber-400 text-lg font-bold">
                              {marketsWithEdge.length > 0 ? `${Math.max(...marketsWithEdge.map(m => Math.abs(m.edgePercent)))}` : '—'}
                            </div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => {
                                const maxEdge = marketsWithEdge.length > 0 ? Math.max(...marketsWithEdge.map(m => Math.abs(m.edgePercent))) : 0;
                                return <div key={i} className={`w-2 h-2 ${i < Math.min(Math.round(maxEdge / 10), 5) ? 'bg-amber-500' : 'bg-amber-500/15'}`} style={{ imageRendering: 'pixelated' }} />;
                              })}
                            </div>
                            <div className="text-amber-400/40 text-[9px]">MAX EDGE pts</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-cyan-400 text-lg font-bold">
                              {(() => {
                                const totalOI = marketsWithEdge.reduce((a, m) => a + (openInterestMap.get(m.conditionId) || 0), 0);
                                return totalOI > 0 ? formatUSD(totalOI) : '—';
                              })()}
                            </div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => {
                                const oiCount = marketsWithEdge.filter(m => openInterestMap.has(m.conditionId)).length;
                                return <div key={i} className={`w-2 h-2 ${i < Math.min(oiCount, 5) ? 'bg-cyan-500' : 'bg-cyan-500/15'}`} style={{ imageRendering: 'pixelated' }} />;
                              })}
                            </div>
                            <div className="text-cyan-400/40 text-[9px]">OPEN INTEREST</div>
                          </div>
                        </div>
                      )}

                      {/* Edge list */}
                      <div className="border border-green-500/15 bg-black/40 overflow-hidden font-mono">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/5 border-b border-green-500/10">
                          <span className="text-green-400/50 text-[10px]">{'>'} ENTRY vs MARKET PRICE</span>
                          <span className="text-green-400/25 text-[10px]">{marketsWithEdge.length} markets</span>
                        </div>
                        <div className="px-3 py-1 border-b border-green-500/10 flex items-center gap-4 text-[9px] text-green-400/25">
                          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 bg-amber-400" style={{ imageRendering: 'pixelated' }} /> entry</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 bg-green-400" style={{ imageRendering: 'pixelated' }} /> profit</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 bg-red-400" style={{ imageRendering: 'pixelated' }} /> underwater</span>
                        </div>
                        {marketsWithEdge.length === 0 ? (
                          <div className="p-4 text-green-400/30 text-xs text-center">No edge data available. Entry prices may not be reported by the API.</div>
                        ) : (
                          <div className="divide-y divide-green-500/10">
                            {marketsWithEdge.slice(0, 15).map(market => {
                              const absEdge = Math.abs(market.edgePercent);
                              const isProfit = market.edgeDirection === 'PROFIT';
                              const isUnderwater = market.edgeDirection === 'UNDERWATER';
                              const edgeColor = isUnderwater ? 'text-red-400' : isProfit ? 'text-green-400' : 'text-green-400/60';
                              const edgeBg = isUnderwater
                                ? 'bg-red-500/10 border-red-500/30'
                                : absEdge >= 15 ? 'bg-green-500/15 border-green-500/30'
                                : absEdge >= 8 ? 'bg-green-500/10 border-green-500/20'
                                : 'bg-green-500/5 border-green-500/10';

                              return (
                                <div key={market.conditionId} className="px-3 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-1.5 py-0.5 border font-bold ${
                                      isUnderwater ? 'bg-red-500/15 border-red-500/30 text-red-400' :
                                      isProfit ? 'bg-green-500/15 border-green-500/30 text-green-400' :
                                      'bg-green-500/5 border-green-500/10 text-green-400/60'
                                    }`}>
                                      {market.edgeDirection}
                                    </span>
                                    <span className="text-green-300 text-xs truncate flex-1">{market.title}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 border font-bold ${edgeBg} ${edgeColor}`}>
                                      {market.edgePercent > 0 ? '+' : ''}{market.edgePercent}pts
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className="text-amber-400/60">Entry:</span>
                                      <span className="text-amber-300 font-bold">{(market.avgEntryPrice * 100).toFixed(0)}¢</span>
                                      {market.entryPriceMin > 0 && market.entryPriceMax > 0 && market.entryPriceMin !== market.entryPriceMax && (
                                        <span className="text-green-400/25" title="Entry price range across all traders">
                                          ({(market.entryPriceMin * 100).toFixed(0)}¢–{(market.entryPriceMax * 100).toFixed(0)}¢)
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px]">
                                      <span className="text-green-400/40">→</span>
                                      <span className={`font-bold ${isUnderwater ? 'text-red-300' : 'text-green-300'}`}>{(market.marketPrice * 100).toFixed(0)}¢</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px]">
                                      <span className="text-green-400/40">|</span>
                                      <span className="text-green-300">{market.topOutcome} {market.topOutcomeCapitalPct}%</span>
                                    </div>
                                    {openInterestMap.get(market.conditionId) ? (
                                      <span className="text-cyan-400/40 text-[10px]">OI: {formatUSD(openInterestMap.get(market.conditionId)!)}</span>
                                    ) : null}
                                    <span className="text-green-400/30 text-[10px] ml-auto">{market.traderCount} traders · {formatUSD(market.totalCapital)}</span>
                                  </div>
                                  {/* Visual: entry range + avg entry + market price */}
                                  <div className="mt-1.5 flex items-center gap-2">
                                    <span className="text-[9px] text-amber-400/50 w-8">entry</span>
                                    <div className="flex-1 h-2.5 bg-green-500/10 rounded-full overflow-hidden relative">
                                      {market.entryPriceMin > 0 && market.entryPriceMax > market.entryPriceMin && (
                                        <div
                                          className="absolute h-full bg-amber-400/10 rounded-full"
                                          style={{
                                            left: `${Math.min(market.entryPriceMin * 100, 100)}%`,
                                            width: `${Math.min((market.entryPriceMax - market.entryPriceMin) * 100, 100)}%`,
                                          }}
                                          title={`Entry range: ${(market.entryPriceMin * 100).toFixed(0)}¢–${(market.entryPriceMax * 100).toFixed(0)}¢`}
                                        />
                                      )}
                                      <div
                                        className="absolute h-full w-1.5 bg-amber-400 rounded-full z-10"
                                        style={{ left: `${Math.min(market.avgEntryPrice * 100, 99)}%` }}
                                        title={`Avg Entry: ${(market.avgEntryPrice * 100).toFixed(0)}¢`}
                                      />
                                      <div
                                        className={`absolute h-full rounded-full ${isUnderwater ? 'bg-red-400/25' : 'bg-green-400/25'}`}
                                        style={{
                                          left: `${Math.min(Math.min(market.avgEntryPrice, market.marketPrice) * 100, 100)}%`,
                                          width: `${Math.min(Math.abs(market.edgePercent), 100)}%`,
                                        }}
                                      />
                                      <div
                                        className={`absolute h-full w-1.5 rounded-full z-10 ${isUnderwater ? 'bg-red-400' : 'bg-green-400'}`}
                                        style={{ left: `${Math.min(market.marketPrice * 100, 99)}%` }}
                                        title={`Market: ${(market.marketPrice * 100).toFixed(0)}¢`}
                                      />
                                    </div>
                                    <span className={`text-[9px] w-8 text-right ${isUnderwater ? 'text-red-400/50' : 'text-green-400/50'}`}>now</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* AI Explain for Edge */}
                      {marketsWithEdge.length > 0 && !smartMoneyLoading && (
                        <AIInsightsTerminal
                          context="smartmoney-edge"
                          data={edgeAIData}
                          commandLabel="smartmoney --analyze-edge"
                          buttonLabel="EXPLAIN EDGE WITH AI"
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Panel: Portfolio Analyzer */}
                {sortedSmartMoneyMarkets.length > 0 && smartMoneyActivePanel === 'portfolios' && (() => {
                  const concentrated = displayPortfolios.filter(p => p.concentration >= 50);
                  const diversified = displayPortfolios.filter(p => p.concentration < 25);
                  const withHedges = displayPortfolios.filter(p => p.hedges.length > 0);

                  // Data for AI
                  const portfolioAIData = {
                    combinedValue: Math.round(displayPortfolios.reduce((a, p) => a + p.totalValue, 0)),
                    portfolios: displayPortfolios.slice(0, 15).map(p => ({
                      name: `#${p.rank} ${p.name}`,
                      pnl: Math.round(p.pnl),
                      totalValue: Math.round(p.totalValue),
                      positions: p.positionCount,
                      concentration: p.concentration,
                      concentrationLabel: p.concentration >= 50 ? 'CONCENTRATED' : p.concentration >= 25 ? 'MODERATE' : 'DIVERSIFIED',
                      hedges: p.hedges.length,
                      convictionBets: p.convictionBets.slice(0, 3).map(b => ({
                        outcome: b.outcome,
                        title: b.title,
                        pct: b.pctOfPortfolio,
                      })),
                    })),
                  };

                  return (
                    <div className="mt-3 space-y-3">
                      {/* Summary row — pixel style */}
                      {displayPortfolios.length > 0 && (
                        <div className="grid grid-cols-4 gap-[2px] bg-green-500/10">
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-red-400 text-lg font-bold">{concentrated.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(concentrated.length, 5) ? 'bg-red-500' : 'bg-red-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-red-400/40 text-[9px]">CONCENTRATED</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-green-400 text-lg font-bold">{diversified.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(diversified.length, 5) ? 'bg-green-500' : 'bg-green-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-green-400/40 text-[9px]">DIVERSIFIED</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-blue-400 text-lg font-bold">{withHedges.length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(withHedges.length, 5) ? 'bg-blue-500' : 'bg-blue-500/15'}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className="text-blue-400/40 text-[9px]">HEDGED</div>
                          </div>
                          <div className="bg-black/80 p-2.5 text-center">
                            <div className="text-green-400 text-lg font-bold">{displayPortfolios.filter(p => traderReliabilityMap.get(p.address)?.tier === 'RELIABLE').length}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => {
                                const reliableCount = displayPortfolios.filter(p => traderReliabilityMap.get(p.address)?.tier === 'RELIABLE').length;
                                return <div key={i} className={`w-2 h-2 ${i < Math.min(reliableCount, 5) ? 'bg-emerald-500' : 'bg-emerald-500/15'}`} style={{ imageRendering: 'pixelated' }} />;
                              })}
                            </div>
                            <div className="text-emerald-400/40 text-[9px]">RELIABLE</div>
                          </div>
                        </div>
                      )}

                      {/* Portfolio list */}
                      <div className="border border-green-500/15 bg-black/40 overflow-hidden font-mono">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-green-500/5 border-b border-green-500/10">
                          <span className="text-green-400/50 text-[10px]">{'>'} HOW EACH TRADER BETS</span>
                          <span className="text-green-400/25 text-[10px]">{traderPortfolios.length} traders</span>
                        </div>
                        {displayPortfolios.length === 0 ? (
                          <div className="p-4 text-green-400/30 text-xs text-center">No portfolio data. Run a scan first.</div>
                        ) : (
                          <div className="divide-y divide-green-500/10 max-h-[500px] overflow-y-auto">
                            {displayPortfolios.map(portfolio => {
                              const concColor = portfolio.concentration >= 50 ? 'text-red-400' : portfolio.concentration >= 25 ? 'text-amber-400' : 'text-green-400';
                              return (
                                <div key={portfolio.address} className="px-3 py-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-green-400/50 text-[10px]">#{portfolio.rank}</span>
                                    <span className="text-green-300 text-xs truncate">{portfolio.name}</span>
                                    <span className="text-green-400 text-xs ml-auto">{formatUSD(portfolio.totalValue)}</span>
                                    <span className={`text-[10px] ${portfolio.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {portfolio.pnl >= 0 ? '+' : ''}{formatUSD(portfolio.pnl)}
                                    </span>
                                  </div>

                                  {/* Stats row */}
                                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[10px]">
                                    <span className="text-green-400/40">{portfolio.positionCount} positions</span>
                                    <span className={`px-1.5 py-0.5 border font-bold text-[9px] ${
                                      portfolio.concentration >= 50 ? 'border-red-500/30 bg-red-500/10 text-red-400' :
                                      portfolio.concentration >= 25 ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                                      'border-green-500/30 bg-green-500/10 text-green-400'
                                    }`}>
                                      {portfolio.concentration >= 50 ? 'CONCENTRATED' : portfolio.concentration >= 25 ? 'MODERATE' : 'DIVERSIFIED'} {portfolio.concentration}%
                                    </span>
                                    {portfolio.hedges.length > 0 && (
                                      <span className="text-blue-400/70 px-1 py-0.5 border border-blue-500/30 bg-blue-500/10 text-[9px]">
                                        {portfolio.hedges.length} hedge{portfolio.hedges.length > 1 ? 's' : ''}
                                      </span>
                                    )}
                                    {(() => {
                                      const cp = closedPositionsMap.get(portfolio.address);
                                      if (!cp || (cp.wins + cp.losses) === 0) return null;
                                      const total = cp.wins + cp.losses;
                                      const winRate = Math.round((cp.wins / total) * 100);
                                      const wrColor = winRate >= 60 ? 'text-green-400 border-green-500/30 bg-green-500/10' :
                                        winRate >= 45 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                                        'text-red-400 border-red-500/30 bg-red-500/10';
                                      return (
                                        <span className={`px-1 py-0.5 border text-[9px] font-bold ${wrColor}`} title={`${cp.wins}W/${cp.losses}L from resolved bets (PnL: ${formatUSD(cp.totalPnl)})`}>
                                          {winRate}% WR ({total})
                                        </span>
                                      );
                                    })()}
                                    {(() => {
                                      const rel = traderReliabilityMap.get(portfolio.address);
                                      if (!rel) return null;
                                      const relColor = rel.tier === 'RELIABLE' ? 'text-green-400 border-green-500/30 bg-green-500/10' :
                                        rel.tier === 'MODERATE' ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                                        'text-gray-400 border-gray-500/30 bg-gray-500/10';
                                      return (
                                        <span className={`px-1 py-0.5 border text-[9px] font-bold ${relColor}`} title={`Reliability Score: ${rel.score}/100`}>
                                          {rel.tier} {rel.score}
                                        </span>
                                      );
                                    })()}
                                  </div>

                                  {/* Conviction bets */}
                                  {portfolio.convictionBets.length > 0 && (
                                    <div className="mt-1.5 space-y-0.5">
                                      {portfolio.convictionBets.slice(0, 3).map((bet, bi) => (
                                        <div key={bi} className="flex items-center gap-2 text-[10px]">
                                          <span className={`px-1 border text-[9px] ${
                                            bet.outcome.toLowerCase() === 'yes'
                                              ? 'text-green-400 border-green-500/30'
                                              : 'text-red-400 border-red-500/30'
                                          }`}>{bet.outcome}</span>
                                          <span className="text-green-300/70 truncate flex-1">{bet.title}</span>
                                          <span className="text-green-400 shrink-0">{formatUSD(bet.value)}</span>
                                          <span className={`shrink-0 px-1 py-0.5 border text-[9px] font-bold ${
                                            bet.pctOfPortfolio >= 40 ? 'text-red-400 border-red-500/30 bg-red-500/10' :
                                            bet.pctOfPortfolio >= 20 ? 'text-amber-400 border-amber-500/30 bg-amber-500/10' :
                                            'text-green-400/60 border-green-500/20'
                                          }`}>
                                            {bet.pctOfPortfolio}%
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Hedges */}
                                  {portfolio.hedges.length > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      {portfolio.hedges.slice(0, 2).map((hedge, hi) => (
                                        <div key={hi} className="flex items-center gap-2 text-[10px] text-blue-400/60">
                                          <span className="text-[9px]">⇄</span>
                                          <span className="truncate">{hedge.market}</span>
                                          <span className="shrink-0">YES:{formatUSD(hedge.yesCapital)}</span>
                                          <span className="shrink-0">NO:{formatUSD(hedge.noCapital)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Concentration bar */}
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-green-400/30 text-[9px] w-10">focus</span>
                                    <div className="flex gap-[2px] flex-1">
                                      {Array.from({ length: 10 }).map((_, i) => (
                                        <div
                                          key={i}
                                          className={`flex-1 h-1 ${
                                            i < Math.round(portfolio.concentration / 10)
                                              ? portfolio.concentration >= 50 ? 'bg-red-500' : portfolio.concentration >= 25 ? 'bg-amber-500' : 'bg-green-500'
                                              : 'bg-green-500/10'
                                          }`}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* AI Explain for Portfolios */}
                      {displayPortfolios.length > 0 && !smartMoneyLoading && (
                        <AIInsightsTerminal
                          context="smartmoney-portfolios"
                          data={portfolioAIData}
                          commandLabel="smartmoney --analyze-portfolios"
                          buttonLabel="EXPLAIN PORTFOLIOS WITH AI"
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Panel: Alpha Signals */}
                {sortedSmartMoneyMarkets.length > 0 && smartMoneyActivePanel === 'alpha' && (() => {
                  const signalTypeConfig: Record<string, { color: string; bgColor: string; borderColor: string; icon: string; label: string }> = {
                    'WHALE_CONVERGENCE': { color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', icon: '🐋', label: 'GROUP BUY' },
                    'UNDERWATER_ACCUMULATION': { color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', icon: '▼', label: 'BUYING DIP' },
                    'YIELD_MOMENTUM': { color: 'text-violet-400', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/30', icon: '$', label: 'NEAR-SURE' },
                    'HIGH_CONVICTION_CLUSTER': { color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30', icon: '◆', label: 'BIG BETS' },
                    'OI_SURGE_CONSENSUS': { color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30', icon: '◉', label: 'HOT MARKET' },
                  };

                  const typeCounts = {
                    whale: alphaSignals.filter(s => s.type === 'WHALE_CONVERGENCE').length,
                    underwater: alphaSignals.filter(s => s.type === 'UNDERWATER_ACCUMULATION').length,
                    yield: alphaSignals.filter(s => s.type === 'YIELD_MOMENTUM').length,
                    conviction: alphaSignals.filter(s => s.type === 'HIGH_CONVICTION_CLUSTER').length,
                    oi: alphaSignals.filter(s => s.type === 'OI_SURGE_CONSENSUS').length,
                  };

                  const alphaAIData = {
                    totalSignals: alphaSignals.length,
                    signalBreakdown: typeCounts,
                    topSignals: alphaSignals.slice(0, 10).map(s => ({
                      type: s.type,
                      market: s.title,
                      confidence: s.confidence,
                      traders: s.traders,
                      action: s.suggestedAction,
                      description: s.description,
                    })),
                  };

                  return (
                    <div className="mt-3 space-y-3">
                      {/* Summary row — one block per signal type */}
                      <div className="grid grid-cols-5 gap-[2px] bg-amber-500/10">
                        {([
                          { key: 'whale', label: 'GROUP BUY', count: typeCounts.whale, color: 'green' },
                          { key: 'underwater', label: 'BUYING DIP', count: typeCounts.underwater, color: 'red' },
                          { key: 'yield', label: 'NEAR-SURE', count: typeCounts.yield, color: 'violet' },
                          { key: 'conviction', label: 'BIG BETS', count: typeCounts.conviction, color: 'amber' },
                          { key: 'oi', label: 'HOT MARKET', count: typeCounts.oi, color: 'cyan' },
                        ] as const).map(item => (
                          <div key={item.key} className="bg-black/80 p-2 text-center">
                            <div className={`text-${item.color}-400 text-lg font-bold`}>{item.count}</div>
                            <div className="flex justify-center gap-[2px] my-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className={`w-2 h-2 ${i < Math.min(item.count, 5) ? `bg-${item.color}-500` : `bg-${item.color}-500/15`}`} style={{ imageRendering: 'pixelated' }} />
                              ))}
                            </div>
                            <div className={`text-${item.color}-400/40 text-[8px]`}>{item.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Signal cards */}
                      <div className="border border-amber-500/15 bg-black/40 overflow-hidden font-mono">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-500/5 border-b border-amber-500/10">
                          <span className="text-amber-400/50 text-[10px]">{'>'} BEST OPPORTUNITIES — signals combined from all data</span>
                          <span className="text-amber-400/25 text-[10px]">{alphaSignals.length} signals</span>
                        </div>
                        {alphaSignals.length === 0 ? (
                          <div className="p-4 text-amber-400/30 text-xs text-center">No alpha signals detected. Run a scan with more data for cross-referencing.</div>
                        ) : (
                          <div className="divide-y divide-amber-500/10 max-h-[500px] overflow-y-auto">
                            {alphaSignals.map(signal => {
                              const cfg = signalTypeConfig[signal.type] || signalTypeConfig['WHALE_CONVERGENCE'];
                              const confColor = signal.confidence >= 75 ? 'text-green-400 border-green-500/40 bg-green-500/10' :
                                signal.confidence >= 50 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' :
                                'text-red-400 border-red-500/40 bg-red-500/10';
                              return (
                                <div key={signal.id} className="px-3 py-2.5 hover:bg-amber-500/5 transition-colors">
                                  {/* Header row */}
                                  <div className="flex items-center gap-2">
                                    <span className={`px-1.5 py-0.5 border text-[9px] font-bold ${cfg.borderColor} ${cfg.bgColor} ${cfg.color}`}>
                                      {cfg.icon} {cfg.label}
                                    </span>
                                    <span className="text-amber-300/80 text-xs truncate flex-1">{signal.title}</span>
                                    <span className={`px-1.5 py-0.5 border text-[10px] font-bold ${confColor}`}>
                                      {signal.confidence}%
                                    </span>
                                  </div>

                                  {/* Description */}
                                  <div className="mt-1 text-[10px] text-amber-400/50">{signal.description}</div>

                                  {/* Traders involved */}
                                  {signal.traders.length > 0 && (
                                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                                      <span className="text-amber-400/30 text-[9px]">traders:</span>
                                      {signal.traders.map((t, i) => (
                                        <span key={i} className="text-amber-300/60 text-[9px] px-1 border border-amber-500/15 bg-amber-500/5">{t}</span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Suggested action */}
                                  <div className="mt-1.5 flex items-start gap-1">
                                    <span className="text-amber-400/30 text-[9px] shrink-0">action:</span>
                                    <span className="text-amber-200/60 text-[9px]">{signal.suggestedAction}</span>
                                  </div>

                                  {/* Confidence bar */}
                                  <div className="flex items-center gap-2 mt-1.5">
                                    <span className="text-amber-400/30 text-[9px] w-12">confidence</span>
                                    <div className="flex gap-[2px] flex-1">
                                      {Array.from({ length: 10 }).map((_, i) => (
                                        <div
                                          key={i}
                                          className={`flex-1 h-1 ${
                                            i < Math.round(signal.confidence / 10)
                                              ? signal.confidence >= 75 ? 'bg-green-500' : signal.confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                              : 'bg-amber-500/10'
                                          }`}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* AI Explain for Alpha */}
                      {alphaSignals.length > 0 && !smartMoneyLoading && (
                        <AIInsightsTerminal
                          context="smartmoney-alpha"
                          data={alphaAIData}
                          commandLabel="smartmoney --alpha-signals"
                          buttonLabel="EXPLAIN ALPHA SIGNALS WITH AI"
                        />
                      )}
                    </div>
                  );
                })()}

                {/* Layer 3: Simplified Market Cards */}
                {sortedSmartMoneyMarkets.length > 0 && (
                  <div className="space-y-[2px] font-mono">
                    <div className="flex items-center justify-between px-1 py-1">
                      <span className="text-green-400/30 text-[9px]">{'>'} Markets ranked by {smartMoneySort === 'aiscore' ? 'AI score' : smartMoneySort === 'capital' ? 'total money' : smartMoneySort === 'consensus' ? 'agreement' : 'trader count'}</span>
                      <span className="text-green-400/20 text-[9px]">{sortedSmartMoneyMarkets.length} results</span>
                    </div>
                    {sortedSmartMoneyMarkets.map((market) => {
                      const isExp = expandedSmartMarket === market.conditionId;
                      const consensusFilled = Math.round((market.capitalConsensus / 100) * 16);
                      const consensusColor = market.capitalConsensus >= 80 ? 'bg-green-500' : market.capitalConsensus >= 50 ? 'bg-yellow-500' : 'bg-green-500/40';
                      const badgeColor = market.topOutcome.toLowerCase() === 'yes'
                        ? 'border-green-500/40 bg-green-500/15 text-green-400'
                        : market.topOutcome.toLowerCase() === 'no'
                        ? 'border-red-500/40 bg-red-500/15 text-red-400'
                        : 'border-blue-500/40 bg-blue-500/15 text-blue-400';

                      return (
                        <div
                          key={market.conditionId}
                          className="border border-green-500/15 bg-black/40 overflow-hidden"
                        >
                          <div
                            className="p-3 cursor-pointer hover:bg-green-500/5 transition-colors"
                            onClick={() => setExpandedSmartMarket(isExp ? null : market.conditionId)}
                          >
                            <div className="flex items-start gap-3">
                              {/* Big outcome badge */}
                              <div className={`shrink-0 w-14 h-14 flex flex-col items-center justify-center border rounded ${badgeColor}`}>
                                <span className="text-[10px] font-bold leading-none">{market.topOutcome}</span>
                                <span className="text-lg font-bold leading-tight">{market.topOutcomeCapitalPct}%</span>
                              </div>

                              {/* AI Score badge */}
                              {(() => {
                                const cs = convergenceScoreMap.get(market.conditionId);
                                if (!cs) return null;
                                const scoreColor = cs.tier === 'STRONG' ? 'border-green-500/60 bg-green-500/15 text-green-400' :
                                  cs.tier === 'MODERATE' ? 'border-amber-500/60 bg-amber-500/15 text-amber-400' :
                                  'border-red-500/60 bg-red-500/15 text-red-400';
                                return (
                                  <div className={`shrink-0 w-11 h-14 flex flex-col items-center justify-center border rounded ${scoreColor}`} title={`AI Score ${cs.score}/100 — How strong this opportunity looks overall.\nAgreement: ${cs.breakdown.consensus}/25 (do traders agree?)\nPrice Gap: ${cs.breakdown.edge}/20 (did they buy cheap?)\nActivity: ${cs.breakdown.momentum}/20 (recent buying?)\nMarket Size: ${cs.breakdown.validation}/15 (enough volume?)\nTrack Record: ${cs.breakdown.quality}/20 (do these traders win?)`}>
                                    <span className="text-[8px] font-bold leading-none opacity-60">AI</span>
                                    <span className="text-lg font-bold leading-tight">{cs.score}</span>
                                  </div>
                                );
                              })()}

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-green-300 text-xs leading-tight" title={market.title}>
                                    {market.title}
                                  </span>
                                  {isExp ? <ChevronUp className="w-3 h-3 text-green-400/40 shrink-0 mt-0.5" /> : <ChevronDown className="w-3 h-3 text-green-400/40 shrink-0 mt-0.5" />}
                                </div>

                                {/* Consensus bar */}
                                <div className="flex items-center gap-2 mt-2">
                                  <div className="flex gap-[2px] flex-1">
                                    {Array.from({ length: 16 }).map((_, i) => (
                                      <div
                                        key={i}
                                        className={`flex-1 h-1.5 rounded-sm ${i < consensusFilled ? consensusColor : 'bg-green-500/10'}`}
                                        style={{ imageRendering: 'pixelated' as const }}
                                      />
                                    ))}
                                  </div>
                                  <span className="text-green-400/60 text-[10px] w-8 text-right" title="Agreement: what % of smart money capital is on the same side">{market.capitalConsensus}%</span>
                                </div>

                                {/* Quick stats */}
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px]">
                                  <span className="text-green-300" title="Total money from top traders in this market">{formatUSD(market.totalCapital)}</span>
                                  <span className="text-green-400/50" title="Number of top PnL traders with positions here">{market.traderCount} traders</span>
                                  <span className={market.avgPnl >= 0 ? 'text-green-400' : 'text-red-400'} title="Average profit/loss of traders in this market">
                                    avg {market.avgPnl >= 0 ? '+' : ''}{formatUSD(market.avgPnl)}
                                  </span>
                                  {openInterestMap.get(market.conditionId) ? (
                                    <span className="text-cyan-400/60" title="Open Interest: total capital at risk in this market">
                                      OI: {formatUSD(openInterestMap.get(market.conditionId)!)}
                                    </span>
                                  ) : null}
                                  {market.outcomeBias.length > 2 && (
                                    <span className="text-blue-400/50">{market.outcomeBias.length} outcomes</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Expanded trader list */}
                          {isExp && (
                            <div className="bg-black/40 px-3 py-2 border-t border-green-500/10 space-y-1.5">
                              {/* AI Score breakdown */}
                              {(() => {
                                const cs = convergenceScoreMap.get(market.conditionId);
                                if (!cs) return null;
                                const labels: Record<string, string> = { consensus: 'AGREEMENT', edge: 'PRICE GAP', momentum: 'ACTIVITY', validation: 'MARKET SIZE', quality: 'TRACK RECORD' };
                                const maxPts: Record<string, number> = { consensus: 25, edge: 20, momentum: 20, validation: 15, quality: 20 };
                                return (
                                  <div className="grid grid-cols-5 gap-[2px] bg-green-500/10 mb-2">
                                    {Object.entries(cs.breakdown).map(([key, value]) => (
                                      <div key={key} className="bg-black/80 p-1.5 text-center">
                                        <div className="text-green-400 text-sm font-bold">{value}<span className="text-green-400/30 text-[8px]">/{maxPts[key]}</span></div>
                                        <div className="text-green-400/40 text-[8px]">{labels[key]}</div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                              <div className="text-green-400/40 text-[10px] mb-1">
                                {'>'} {market.traders.length} traders in this market
                              </div>
                              {market.traders.map((trader, ti) => (
                                <div key={trader.address} className="flex items-center gap-2 text-[10px]">
                                  <span className="text-green-400/30 w-4 shrink-0">{String(ti + 1).padStart(2, '0')}</span>
                                  {/* Reliability dot */}
                                  {(() => {
                                    const r = traderReliabilityMap.get(trader.address);
                                    if (!r) return null;
                                    const color = r.tier === 'RELIABLE' ? 'bg-green-500' : r.tier === 'MODERATE' ? 'bg-amber-500' : 'bg-gray-500';
                                    return <div className={`w-1.5 h-1.5 rounded-full ${color} shrink-0`} title={`${r.tier} (${r.score})`} />;
                                  })()}
                                  <span className="text-green-400/50 w-5 shrink-0">#{trader.rank}</span>
                                  <span className={`px-1 py-0.5 border text-[9px] ${
                                    trader.outcome.toLowerCase() === 'yes'
                                      ? 'text-green-400 border-green-500/30 bg-green-500/10'
                                      : 'text-red-400 border-red-500/30 bg-red-500/10'
                                  }`}>
                                    {trader.outcome}
                                  </span>
                                  <span className="text-green-300 truncate flex-1">{trader.name}</span>
                                  <span className="text-green-400 shrink-0">{formatUSD(trader.positionValue)}</span>
                                  <span className={`shrink-0 w-16 text-right ${trader.currentPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {trader.currentPnl >= 0 ? '+' : ''}{formatUSD(trader.currentPnl)}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {trader.xUsername && (
                                      <a href={`https://x.com/${trader.xUsername}`} target="_blank" rel="noopener noreferrer" className="text-green-400/30 hover:text-green-400" onClick={(e) => e.stopPropagation()}>
                                        <ExternalLink className="w-2.5 h-2.5" />
                                      </a>
                                    )}
                                    <a href={`https://polymarket.com/portfolio/${trader.address}`} target="_blank" rel="noopener noreferrer" className="text-green-400/30 hover:text-green-400" onClick={(e) => e.stopPropagation()}>
                                      <Wallet className="w-2.5 h-2.5" />
                                    </a>
                                  </div>
                                </div>
                              ))}
                              {/* OKX DEX Quote — shows swap price on X Layer for tradeable assets */}
                              <DexQuotePanel
                                marketSlug={market.slug || ''}
                                marketTitle={market.title}
                                className="mt-2"
                              />

                              {market.slug && (
                                <div className="pt-1.5 border-t border-green-500/10">
                                  <a href={`https://polymarket.com/event/${market.slug}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-400/40 hover:text-green-400 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <ExternalLink className="w-3 h-3" /> View on Polymarket
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <div className="text-green-400/20 text-[9px] font-mono text-center py-1">
                      {'>'} {smartMoneyLeaderboard.length} wallets scanned · {sortedSmartMoneyMarkets.length} consensus markets · cache: 5min
                    </div>
                  </div>
                )}

                {/* AI Analysis for Smart Money */}
                {sortedSmartMoneyMarkets.length > 0 && !smartMoneyLoading && (() => {
                  const topMarkets = sortedSmartMoneyMarkets.slice(0, 10).map(m => ({
                    title: m.title,
                    traderCount: m.traderCount,
                    totalCapital: Math.round(m.totalCapital),
                    topOutcome: m.topOutcome,
                    topOutcomeCapitalPct: m.topOutcomeCapitalPct,
                    capitalConsensus: m.capitalConsensus,
                    headConsensus: m.headConsensus,
                    outcomes: m.outcomeBias.map(ob => ({
                      outcome: ob.outcome,
                      capitalPct: m.totalCapital > 0 ? Math.round((ob.capital / m.totalCapital) * 100) : 0,
                      headcount: ob.headcount,
                    })),
                    avgPnl: Math.round(m.avgPnl),
                    topTraders: m.traders.slice(0, 3).map(t => ({
                      name: t.name,
                      rank: t.rank,
                      side: t.outcome,
                      value: Math.round(t.positionValue),
                      pnl: Math.round(t.currentPnl),
                    })),
                  }));

                  // Edge opportunities (entry price vs market)
                  const edgeOpportunities = sortedSmartMoneyMarkets
                    .filter(m => m.marketPrice > 0 && m.avgEntryPrice > 0 && Math.abs(m.edgePercent) >= 5)
                    .sort((a, b) => Math.abs(b.edgePercent) - Math.abs(a.edgePercent))
                    .slice(0, 5)
                    .map(m => ({
                      title: m.title,
                      avgEntry: Math.round(m.avgEntryPrice * 100),
                      entryRange: m.entryPriceMin > 0 && m.entryPriceMax > m.entryPriceMin
                        ? `${Math.round(m.entryPriceMin * 100)}¢-${Math.round(m.entryPriceMax * 100)}¢`
                        : null,
                      marketPrice: Math.round(m.marketPrice * 100),
                      edge: m.edgePercent,
                      direction: m.edgeDirection,
                      topOutcome: m.topOutcome,
                      traders: m.traderCount,
                    }));

                  // Recent whale signals summary
                  const recentSignals = whaleSignals
                    .slice(0, 10)
                    .map(s => ({
                      trader: `#${s.traderRank} ${s.traderName}`,
                      action: s.side,
                      market: s.marketTitle,
                      outcome: s.outcome,
                      size: Math.round(s.usdcSize),
                      hoursAgo: s.hoursAgo,
                      conviction: s.conviction,
                    }));

                  // Portfolio insights
                  const portfolioInsights = traderPortfolios
                    .slice(0, 5)
                    .map(p => ({
                      name: `#${p.rank} ${p.name}`,
                      totalValue: Math.round(p.totalValue),
                      positions: p.positionCount,
                      concentration: p.concentration,
                      hedges: p.hedges.length,
                      topBet: p.convictionBets[0] ? `${p.convictionBets[0].outcome} ${p.convictionBets[0].title} (${p.convictionBets[0].pctOfPortfolio}%)` : null,
                    }));

                  const smartMoneyData = {
                    category: smartMoneyCategory,
                    timePeriod: smartMoneyTimePeriod,
                    traderCount: smartMoneyLeaderboard.length,
                    combinedPnl: Math.round(smartMoneyLeaderboard.reduce((a, t) => a + t.pnl, 0)),
                    combinedVolume: Math.round(smartMoneyLeaderboard.reduce((a, t) => a + t.volume, 0)),
                    consensusMarkets: sortedSmartMoneyMarkets.length,
                    topMarkets,
                    edgeOpportunities,
                    recentSignals,
                    portfolioInsights,
                  };

                  return (
                    <AIInsightsTerminal
                      context="smartmoney"
                      data={smartMoneyData}
                      commandLabel={`smartmoney --consensus ${smartMoneyCategory.toLowerCase()} --period ${smartMoneyTimePeriod.toLowerCase()}`}
                      buttonLabel="ANALYZE ALL WITH AI"
                    />
                  );
                })()}

                  </div>{/* end content area */}

                  {/* Terminal footer */}
                  <div className="px-3 py-1.5 border-t border-green-500/15 text-green-400/30 text-[9px] flex items-center justify-between">
                    <span>{'>'} openclaw smart-money engine v3.0 (CLOB enriched)</span>
                    <span>{sortedSmartMoneyMarkets.length > 0 ? `${smartMoneyLeaderboard.length} traders · ${sortedSmartMoneyMarkets.length} markets · ${whaleSignals.length} signals` : 'ready'}</span>
                  </div>
                </div>{/* end terminal container */}
              </>
            )}
          </CardContent>
        </Card>

        {/* Methodology Section */}
        <div className="mt-8 rounded-lg border border-green-500/30 bg-black/60 overflow-hidden" style={{ imageRendering: 'auto' }}>
          {/* Terminal header */}
          <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 border-b border-green-500/20">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-green-400 text-xs font-mono ml-2 flex items-center gap-2">
              <PixelLobster size={14} className="text-green-400" />
              openclaw --methodology
            </span>
          </div>

          <div className="p-4 md:p-6 font-mono text-sm space-y-5">
            {/* How it works */}
            <div>
              <div className="text-green-400 text-xs mb-2">{'>'} SYSTEM.OVERVIEW</div>
              <p className="text-green-300/70 text-xs leading-relaxed">
                OpenClaw reads on-chain behavior from Polymarket's public API:
                500 trades, 500 merges, 200 positions per wallet.
                Seven signals run through a weighted model. Ghost Whale mode activates
                for wallets with no trade history but large positions. Final score: 0 to 100.
              </p>
            </div>

            {/* Signal weights as pixel bars */}
            <div>
              <div className="text-green-400 text-xs mb-3">{'>'} SIGNAL.WEIGHTS</div>
              <div className="space-y-3">
                {[
                  { name: 'SPLIT/MERGE', weight: 25, blocks: 5, desc: 'Merge/redeem ratio. Arbitrage bots split and recombine conditional tokens.' },
                  { name: 'INTERVAL', weight: 20, blocks: 4, desc: 'Trade timing regularity. Sub-30s avg = machine speed.' },
                  { name: 'SIZING', weight: 15, blocks: 3, desc: 'Position size variance. Identical orders = automated.' },
                  { name: '24/7 ACTIVE', weight: 15, blocks: 3, desc: '22+ UTC hours covered = never sleeps.' },
                  { name: 'WIN RATE', weight: 15, blocks: 3, desc: '85%+ win rate = algorithmic edge.' },
                  { name: 'FOCUS', weight: 10, blocks: 2, desc: 'Category concentration. Bots specialize in one vertical.' },
                  { name: 'GHOST', weight: 50, blocks: 10, desc: 'No trade history but large positions. Alternate weighting mode activates.' },
                ].map((s) => (
                  <div key={s.name}>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 text-[10px] w-24 shrink-0">{s.name}</span>
                      <div className="flex gap-[2px]">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-3 h-3 ${i < s.blocks ? 'bg-green-500' : 'bg-green-500/15'}`}
                            style={{ imageRendering: 'pixelated' }}
                          />
                        ))}
                      </div>
                      <span className="text-green-300/50 text-[10px] ml-1">{s.weight}%</span>
                    </div>
                    <div className="text-green-300/40 text-[10px] ml-[6.5rem] mt-0.5">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Both-sides bonus */}
            <div>
              <div className="text-red-400 text-xs mb-2">{'>'} BONUS.BOTH_SIDES</div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                <span className="px-2 py-1 bg-red-500/15 border border-red-500/30 text-red-400">{'>'}10% = +8pts</span>
                <span className="px-2 py-1 bg-red-500/15 border border-red-500/30 text-red-400">{'>'}30% = +15pts</span>
                <span className="px-2 py-1 bg-red-500/15 border border-red-500/30 text-red-400">{'>'}50% = +20pts</span>
              </div>
              <div className="text-green-300/40 text-[10px] mt-1">YES + NO on same market = market-making / arb signal</div>
            </div>

            {/* Classification tiers as pixel blocks */}
            <div>
              <div className="text-green-400 text-xs mb-3">{'>'} CLASSIFICATION</div>
              <div className="grid grid-cols-4 gap-1">
                <div className="p-2 border border-green-500/30 bg-green-500/5 text-center">
                  <div className="text-green-400 font-bold text-sm">0-39</div>
                  <div className="flex justify-center mt-1 gap-[1px]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-green-500" style={{ imageRendering: 'pixelated' }} />
                    ))}
                  </div>
                  <div className="text-green-300/50 text-[9px] mt-1">HUMAN</div>
                </div>
                <div className="p-2 border border-yellow-500/30 bg-yellow-500/5 text-center">
                  <div className="text-yellow-400 font-bold text-sm">40-59</div>
                  <div className="flex justify-center mt-1 gap-[1px]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-yellow-500" style={{ imageRendering: 'pixelated' }} />
                    ))}
                  </div>
                  <div className="text-yellow-300/50 text-[9px] mt-1">MIXED</div>
                </div>
                <div className="p-2 border border-orange-500/30 bg-orange-500/5 text-center">
                  <div className="text-orange-400 font-bold text-sm">60-79</div>
                  <div className="flex justify-center mt-1 gap-[1px]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-orange-500" style={{ imageRendering: 'pixelated' }} />
                    ))}
                  </div>
                  <div className="text-orange-300/50 text-[9px] mt-1">LIKELY</div>
                </div>
                <div className="p-2 border border-red-500/30 bg-red-500/5 text-center">
                  <div className="text-red-400 font-bold text-sm flex items-center justify-center gap-1">
                    <PixelLobster size={12} /> 80+
                  </div>
                  <div className="flex justify-center mt-1 gap-[1px]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 bg-red-500" style={{ imageRendering: 'pixelated' }} />
                    ))}
                  </div>
                  <div className="text-red-300/50 text-[9px] mt-1">AGENT</div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="text-green-300/30 text-[10px] pt-2 border-t border-green-500/10">
              src: polymarket data-api + gamma-api | runs client-side | no data stored
            </div>
          </div>
        </div>

        {/* Disclaimer — Uniswap-style subtle */}
        <div className="mt-4 rounded-2xl bg-neutral-900/50 px-5 py-3">
          <p className="text-neutral-600 text-xs text-center leading-relaxed">
            Not investment advice. Educational and research purposes only. You are solely responsible for your trading decisions. Past performance ≠ future results.
          </p>
        </div>
      </div>

    </div>
  );
}
