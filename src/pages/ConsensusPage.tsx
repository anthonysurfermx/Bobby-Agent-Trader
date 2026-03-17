// src/pages/ConsensusPage.tsx - Wallet X-Ray Analyzer
import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Link2, Star, StarOff, ChevronDown, ChevronUp } from 'lucide-react';
import { PixelTarget, PixelLobster } from '@/components/ui/pixel-icons';
import { ScrambleText } from '@/components/agentic/ScrambleText';
import { AIInsightsTerminal } from '@/components/agentic/AIInsightsTerminal';
import { ShareScoreCard } from '@/components/agentic/ShareScoreCard';
import { ProWaitlistForm } from '@/components/agentic/ProWaitlistForm';
import { polymarketService, type AgentMetrics, type PolymarketPosition } from '@/services/polymarket.service';
import { detectBot, type BotDetectionResult, type SignalProgress, type StrategyType } from '@/services/polymarket-detector';
import { useAuth } from '@/hooks/useAuth';
import { useFollowedWallets } from '@/hooks/useFollowedWallets';
import { useScanLimit } from '@/hooks/useScanLimit';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

function formatUSD(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Signal bar component matching the Polymarket Tracker style
function PixelBar({ label, value, maxLabel, delay = 0 }: { label: string; value: number; maxLabel?: string; delay?: number }) {
  const [displayValue, setDisplayValue] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (value === 0) return;
    const showTimer = setTimeout(() => {
      setVisible(true);
      // Step up from 0 to value over ~600ms
      const steps = 12;
      const stepMs = 600 / steps;
      let step = 0;
      const iv = setInterval(() => {
        step++;
        setDisplayValue(Math.round((value / steps) * Math.min(step, steps)));
        if (step >= steps) clearInterval(iv);
      }, stepMs);
    }, delay);
    return () => clearTimeout(showTimer);
  }, [value, delay]);

  const barColor = value >= 80 ? 'bg-red-500' : value >= 60 ? 'bg-orange-500' : value >= 40 ? 'bg-yellow-500' : 'bg-green-500';
  const filled = Math.round((displayValue / 100) * 16);
  return (
    <div
      className="flex items-center gap-2 transition-opacity duration-300"
      style={{ opacity: visible || value === 0 ? 1 : 0 }}
    >
      <span className="text-cyan-400 text-[10px] w-24 shrink-0 font-mono">{label}</span>
      <div className="flex gap-[2px] flex-1">
        {Array.from({ length: 16 }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-2.5 ${i < filled ? barColor : 'bg-cyan-500/10'}`}
            style={{ imageRendering: 'pixelated' }}
          />
        ))}
      </div>
      <span className={`text-[10px] w-6 text-right font-mono ${value >= 70 ? 'text-red-400' : 'text-cyan-400'}`}>
        {displayValue}
      </span>
      {maxLabel && <span className="text-cyan-400/20 text-[9px] w-6 font-mono">{maxLabel}</span>}
    </div>
  );
}

function DirectionBiasBar({ yesPct, yesCount, noCount }: { yesPct: number; yesCount: number; noCount: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(yesPct), 200);
    return () => clearTimeout(t);
  }, [yesPct]);
  return (
    <div className="animate-fadeInUp" style={{ animationDelay: '500ms', animationFillMode: 'both' }}>
      <div className="text-[10px] text-cyan-400/40 mb-1">DIRECTION BIAS</div>
      <div className="flex h-2 overflow-hidden" style={{ imageRendering: 'pixelated' }}>
        <div className="bg-green-500 h-full transition-all duration-700 ease-out" style={{ width: `${width}%` }} />
        <div className="bg-red-500 h-full transition-all duration-700 ease-out" style={{ width: `${100 - width}%` }} />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-green-400 text-[9px]">YES {yesPct}% ({yesCount})</span>
        <span className="text-red-400 text-[9px]">NO {100 - yesPct}% ({noCount})</span>
      </div>
    </div>
  );
}

function TerminalHeader({ title, extra }: { title: string; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
      <div className="flex gap-1.5">
        <div className="w-2 h-2 rounded-full bg-red-500/60" />
        <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
        <div className="w-2 h-2 rounded-full bg-green-500/60" />
      </div>
      <span className="text-cyan-400 text-[10px] font-mono ml-1">{title}</span>
      {extra && <div className="ml-auto">{extra}</div>}
    </div>
  );
}

// Stat box that works with Tailwind (no dynamic class names)
function StatBox({ label, value, variant = 'cyan', delay = 0 }: { label: string; value: string; variant?: 'cyan' | 'green' | 'amber' | 'red'; delay?: number }) {
  const [visible, setVisible] = useState(false);
  const isLoading = value === '...';

  useEffect(() => {
    if (!isLoading) {
      const t = setTimeout(() => setVisible(true), delay);
      return () => clearTimeout(t);
    }
  }, [isLoading, delay]);

  const styles = {
    cyan: { border: 'border-cyan-500/30', labelColor: 'text-cyan-400/60', valueColor: 'text-cyan-400' },
    green: { border: 'border-green-500/30', labelColor: 'text-green-400/60', valueColor: 'text-green-400' },
    amber: { border: 'border-amber-500/30', labelColor: 'text-amber-400/60', valueColor: 'text-amber-400' },
    red: { border: 'border-red-500/30', labelColor: 'text-red-400/60', valueColor: 'text-red-400' },
  };
  const s = styles[variant];

  return (
    <div
      className={`border ${s.border} bg-black/60 p-3 transition-all duration-500`}
      style={{ opacity: isLoading ? 0.4 : visible ? 1 : 0.4 }}
    >
      <div className={`text-[10px] ${s.labelColor} font-mono uppercase`}>{'> '}{label}</div>
      <div className={`text-lg font-bold ${s.valueColor} font-mono mt-1`}>
        {isLoading ? (
          <span className="animate-pulse">...</span>
        ) : (
          <ScrambleText text={value} speed={25} iterations={8} />
        )}
      </div>
    </div>
  );
}

const STRATEGY_STYLES: Record<StrategyType, { border: string; bg: string; text: string; glow: string }> = {
  MARKET_MAKER: { border: 'border-blue-400/50', bg: 'bg-blue-500/10', text: 'text-blue-400', glow: 'shadow-[0_0_8px_rgba(96,165,250,0.3)]' },
  HYBRID:       { border: 'border-violet-400/50', bg: 'bg-violet-500/10', text: 'text-violet-400', glow: 'shadow-[0_0_8px_rgba(167,139,250,0.3)]' },
  SNIPER:       { border: 'border-red-400/50', bg: 'bg-red-500/10', text: 'text-red-400', glow: 'shadow-[0_0_8px_rgba(248,113,113,0.3)]' },
  MOMENTUM:     { border: 'border-amber-400/50', bg: 'bg-amber-500/10', text: 'text-amber-400', glow: 'shadow-[0_0_8px_rgba(251,191,36,0.3)]' },
  UNCLASSIFIED: { border: 'border-cyan-400/20', bg: 'bg-cyan-500/5', text: 'text-cyan-400/60', glow: '' },
};

const STRATEGY_ARCHETYPES: Record<StrategyType, { title: string; aka: string; behavior: string[]; signals: string[]; risk: string }> = {
  MARKET_MAKER: {
    title: 'The House',
    aka: 'Market Maker / Liquidity Provider',
    behavior: [
      'Buys YES and NO on the same market to collect the spread (YES + NO < $1.00)',
      'Uses merge operations to recombine token pairs back into collateral',
      'Consistent position sizing (low coefficient of variation)',
      'Active 24/7 with regular interval trades',
    ],
    signals: [
      'Both-sides trading >= 45%',
      'Merge ratio >= 15%',
      'Size CV < 0.8 (consistent bet sizes)',
    ],
    risk: 'Low risk per trade but exposed to sudden market moves that widen spreads. Profits erode in low-volume markets.',
  },
  SNIPER: {
    title: 'Latency Arb',
    aka: 'Sniper / Information Trader',
    behavior: [
      'Exploits lag between real-world events and Polymarket odds updates',
      'Takes one-directional bets with high conviction',
      'High ROI per trade, acts on information faster than the market',
      'Rarely hedges or trades both sides of a market',
    ],
    signals: [
      'Both-sides trading <= 10%',
      'Average ROI > 30%',
      'Directional bias >= 70%',
    ],
    risk: 'High variance. When the information edge disappears or the market adapts, returns drop sharply.',
  },
  HYBRID: {
    title: 'Spread + Alpha',
    aka: 'Hybrid / Dual Strategy',
    behavior: [
      'Combines market-making (both-sides spreads) with directional bets when model detects mispricing',
      'Entry prices show bimodal distribution: one cluster near 0.50 (spread) and another at extremes (conviction)',
      'Uses merges from the market-making side to fund directional overlays',
    ],
    signals: [
      'Bimodal entry price distribution',
      'Both-sides trading >= 15%',
      'Merge ratio >= 5%',
    ],
    risk: 'Medium risk. The directional component can lose if the thesis is wrong, but the spread income provides a buffer.',
  },
  MOMENTUM: {
    title: 'Trend Rider',
    aka: 'Momentum / Directional Trader',
    behavior: [
      'Scales into one direction with rhythmic intervals',
      'Follows short-term momentum signals and news catalysts',
      'High directional bias with consistent timing between entries',
    ],
    signals: [
      'Both-sides trading <= 15%',
      'Interval regularity >= 70',
      'Directional bias >= 80%',
    ],
    risk: 'Vulnerable to reversals. Strong in trending markets but can accumulate losses during choppy conditions.',
  },
  UNCLASSIFIED: {
    title: 'Mixed Strategy',
    aka: 'Unclassified / Insufficient Data',
    behavior: [
      'Does not clearly fit any known archetype',
      'May be a manual trader or using a unique strategy',
    ],
    signals: ['No strong signal pattern detected'],
    risk: 'Unknown risk profile. Requires more data or manual review.',
  },
};

function StrategyBadge({ type, label, confidence }: { type: StrategyType; label: string; confidence: number }) {
  const s = STRATEGY_STYLES[type];
  if (type === 'UNCLASSIFIED' && confidence === 0) return null;
  return (
    <div className={`px-2.5 py-1 border font-mono text-[10px] tracking-wider ${s.border} ${s.bg} ${s.text} ${s.glow}`}>
      {label.toUpperCase()}
      {confidence > 0 && <span className="opacity-50 ml-1">{confidence}%</span>}
    </div>
  );
}

export default function ConsensusPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const walletAddress = searchParams.get('wallet') || '';
  const marketId = searchParams.get('market') || '';

  const { isAuthenticated } = useAuth();
  const { follow, unfollow, isFollowing, canFollow, followsRemaining, followLimit } = useFollowedWallets();
  const [followLoading, setFollowLoading] = useState(false);

  const following = walletAddress ? isFollowing(walletAddress) : false;

  const handleFollow = async () => {
    if (!isAuthenticated) {
      toast.info('Sign in to follow wallets');
      navigate('/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search));
      return;
    }
    if (!following && !canFollow) {
      toast.info(`Free limit: ${followLimit} wallets. Pro coming soon with unlimited follows.`);
      return;
    }
    setFollowLoading(true);
    try {
      if (following) {
        await unfollow(walletAddress);
        toast.success('Wallet unfollowed');
      } else {
        await follow(walletAddress, metrics?.pseudonym || undefined);
        toast.success(`Wallet followed (${followsRemaining - 1} follows remaining)`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setFollowLoading(false);
    }
  };

  // Data states
  const [metrics, setMetrics] = useState<AgentMetrics | null>(null);
  const [positions, setPositions] = useState<PolymarketPosition[]>([]);
  const [botResult, setBotResult] = useState<BotDetectionResult | null>(null);
  const [liveProgress, setLiveProgress] = useState<SignalProgress | null>(null);

  // UI states
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<'loading' | 'analyzing' | 'done'>('loading');
  const [showAllPositions, setShowAllPositions] = useState(false);
  const [strategyExpanded, setStrategyExpanded] = useState(false);
  const [scanBlocked, setScanBlocked] = useState(false);
  const { canScanWallet, walletScansRemaining, walletScanLimit, walletCooldownText, consumeWalletScan } = useScanLimit();

  const runAnalysis = useCallback(async () => {
    if (!walletAddress) return;

    if (!canScanWallet) {
      setScanBlocked(true);
      setLoading(false);
      setPhase('done');
      return;
    }

    consumeWalletScan();
    setLoading(true);
    setPhase('loading');

    // Fetch portfolio metrics and positions in parallel
    const [metricsData, positionsData] = await Promise.all([
      polymarketService.getAgentMetrics(walletAddress),
      polymarketService.getAgentPositions(walletAddress),
    ]);

    setMetrics(metricsData);
    setPositions(positionsData);
    setPhase('analyzing');

    // Run bot detection with live progress
    try {
      const result = await detectBot(walletAddress, (progress) => {
        setLiveProgress(progress);
      });
      setBotResult(result);
    } catch {
      toast.error('Failed to run behavioral analysis');
    }

    setLoading(false);
    setPhase('done');

    // Increment global scan counter (fire-and-forget)
    supabase.rpc('increment_scan_count').catch(() => {});
  }, [walletAddress]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  // No wallet provided
  if (!walletAddress) {
    return (
      <div className="min-h-screen bg-black/95 flex items-center justify-center">
        <div className="text-center font-mono">
          <PixelTarget className="text-cyan-500/30 mx-auto mb-4" size={48} />
          <p className="text-cyan-400/60 text-sm">No wallet selected</p>
          <p className="text-cyan-300/30 text-[10px] mt-2">Use the Polymarket Agent Radar to select a wallet to analyze</p>
          <Link
            to="/agentic-world/polymarket"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 border border-cyan-500/30 text-cyan-400 text-xs hover:bg-cyan-500/10 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" />
            Go to Agent Radar
          </Link>
        </div>
      </div>
    );
  }

  // Derived data
  const totalPnl = positions.reduce((sum, p) => sum + p.cashPnl, 0);
  const winningPositions = positions.filter(p => p.cashPnl > 0).length;
  const winRate = positions.length > 0 ? Math.round((winningPositions / positions.length) * 100) : 0;
  const biggestWin = positions.length > 0 ? Math.max(...positions.map(p => p.cashPnl)) : 0;
  const biggestLoss = positions.length > 0 ? Math.min(...positions.map(p => p.cashPnl)) : 0;
  const avgPositionSize = positions.length > 0 ? positions.reduce((s, p) => s + p.currentValue, 0) / positions.length : 0;

  // Sort positions: biggest value first
  const sortedPositions = [...positions].sort((a, b) => b.currentValue - a.currentValue);
  const displayPositions = showAllPositions ? sortedPositions : sortedPositions.slice(0, 15);

  return (
    <div className="min-h-screen bg-black/95">
      <Helmet>
        <title>Wallet Analyzer | DeFi Hub M&eacute;xico</title>
        <meta name="description" content="Deep analysis of Polymarket wallet behavior, positions, and trading patterns" />
      </Helmet>

      <div className="container mx-auto px-4 py-8">
        {/* Back nav + header */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/agentic-world/polymarket"
            className="p-2 hover:bg-cyan-500/10 text-cyan-400/60 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-10 h-10 border border-amber-500/40 bg-amber-500/10 flex items-center justify-center">
            <PixelTarget size={22} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold font-mono text-foreground flex items-center gap-2">
              <ScrambleText text="DeFi MEXICO ANALYZER" speed={20} iterations={10} />
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-cyan-400 text-xs font-mono">{shortAddr(walletAddress)}</span>
              {metrics?.pseudonym && (
                <span className="text-foreground/40 text-xs font-mono">@{metrics.pseudonym}</span>
              )}
              <a
                href={`https://polymarket.com/portfolio/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400/30 hover:text-cyan-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast.success('URL copied to clipboard');
                }}
                className="text-cyan-400/30 hover:text-cyan-400 transition-colors"
                title="Copy share URL"
              >
                <Link2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {botResult && (
              <StrategyBadge
                type={botResult.strategy.type}
                label={botResult.strategy.label}
                confidence={botResult.strategy.confidence}
              />
            )}
            {botResult && (
              <div className={`px-3 py-1.5 border font-mono text-xs flex items-center gap-1.5 ${
                botResult.classification === 'bot' ? 'border-red-500/40 bg-red-500/10 text-red-400' :
                botResult.classification === 'likely-bot' ? 'border-orange-500/40 bg-orange-500/10 text-orange-400' :
                botResult.classification === 'mixed' ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400' :
                'border-green-500/40 bg-green-500/10 text-green-400'
              }`}>
                {(botResult.classification === 'bot' || botResult.classification === 'likely-bot') && <PixelLobster size={12} />}
                {botResult.classification.toUpperCase()} {botResult.botScore}
              </div>
            )}
            {botResult && (
              <ShareScoreCard
                address={walletAddress}
                pseudonym={metrics?.pseudonym}
                botScore={botResult.botScore}
                classification={botResult.classification}
                signals={botResult.signals}
                tradeCount={botResult.tradeCount}
                portfolioValue={metrics?.portfolioValue}
                profitPnL={metrics?.profitPnL}
              />
            )}
            {phase === 'done' && (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`px-3 py-1.5 border font-mono text-xs flex items-center gap-1.5 transition-colors ${
                  following
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                    : 'border-cyan-500/30 bg-cyan-500/5 text-cyan-400/60 hover:text-cyan-400 hover:bg-cyan-500/10'
                }`}
              >
                {following ? <StarOff className="w-3 h-3" /> : <Star className="w-3 h-3" />}
                {followLoading ? '...' : following ? 'UNFOLLOW' : 'FOLLOW'}
              </button>
            )}
          </div>
        </div>

        {/* Scan limit reached */}
        {scanBlocked && (
          <div className="border border-amber-500/30 bg-amber-500/5 p-6 mb-6 text-center font-mono">
            <div className="text-amber-400 text-lg font-bold mb-2">Scan limit reached</div>
            <p className="text-amber-300/60 text-sm mb-4">
              You've used all {walletScanLimit} free scans.
              {walletCooldownText
                ? ` Your scans reset in ${walletCooldownText}.`
                : ' Your scans will reset soon.'}
            </p>
            <div className="text-amber-500/40 text-xs mb-4">
              Free tier: {walletScanLimit} wallet scans per 12 hours
            </div>
            <div className="border-t border-amber-500/20 pt-4 mt-2">
              <p className="text-cyan-400/80 text-xs mb-2">Want unlimited scans? Get early access to Pro.</p>
              <ProWaitlistForm />
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
          <StatBox label="PORTFOLIO" value={metrics ? formatUSD(metrics.portfolioValue) : '...'} variant="cyan" delay={0} />
          <StatBox label="TOTAL P&L" value={metrics?.profitPnL != null ? `${metrics.profitPnL >= 0 ? '+' : ''}${formatUSD(metrics.profitPnL)}` : '...'} variant={metrics?.profitPnL != null && metrics.profitPnL >= 0 ? 'green' : 'red'} delay={150} />
          <StatBox label="WIN RATE" value={positions.length > 0 ? `${winRate}%` : '...'} variant={winRate >= 55 ? 'green' : 'amber'} delay={300} />
          <StatBox label="POSITIONS" value={metrics ? String(metrics.openPositions) : '...'} variant="cyan" delay={450} />
        </div>

        {/* Two-column layout: Behavioral Analysis + Position Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

          {/* Behavioral Analysis Terminal */}
          <div className="border border-cyan-500/30 bg-black/60 overflow-hidden font-mono">
            <TerminalHeader
              title={`analyze --wallet ${shortAddr(walletAddress)}`}
              extra={
                phase === 'done' ? (
                  <span className="text-green-400 text-[10px]">complete</span>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                )
              }
            />
            <div className="px-3 py-3 space-y-1.5">
              {phase === 'loading' && !liveProgress && (
                <div className="text-cyan-400/60 text-[11px] animate-pulse">
                  {'>'} Fetching portfolio data...
                </div>
              )}

              {liveProgress && liveProgress.phase === 'fetching' && (
                <div className="text-cyan-400/60 text-[11px] animate-pulse">
                  {'>'} Fetching trades, merges, positions...
                </div>
              )}

              {liveProgress && liveProgress.tradeCount !== undefined && (
                <div className="text-cyan-300/40 text-[10px] mb-2">
                  {'>'} loaded {liveProgress.tradeCount} trades, {liveProgress.mergeCount} merges
                </div>
              )}

              {/* Show signals as they compute */}
              {(liveProgress?.phase === 'analyzing' || phase === 'done') && (
                <>
                  {[
                    { key: 'intervalRegularity' as const, name: 'INTERVAL', weight: '20%' },
                    { key: 'splitMergeRatio' as const, name: 'SPLIT/MERGE', weight: '25%' },
                    { key: 'sizingConsistency' as const, name: 'SIZING', weight: '15%' },
                    { key: 'activity24h' as const, name: '24/7', weight: '15%' },
                    { key: 'winRateExtreme' as const, name: 'WIN_RATE', weight: '15%' },
                    { key: 'marketConcentration' as const, name: 'FOCUS', weight: '10%' },
                    { key: 'ghostWhale' as const, name: 'GHOST', weight: '50%' },
                  ].map((s, idx) => {
                    const val = botResult
                      ? botResult.signals[s.key]
                      : liveProgress?.signals[s.key];
                    const isActive = liveProgress?.signal === s.name;
                    const isDone = val !== undefined;
                    return (
                      <PixelBar
                        key={s.key}
                        label={isDone || isActive ? s.name : s.name}
                        value={isDone ? val : 0}
                        maxLabel={isDone ? s.weight : undefined}
                        delay={phase === 'done' ? idx * 120 : 0}
                      />
                    );
                  })}
                </>
              )}

              {botResult && botResult.signals.bothSidesBonus > 0 && (
                <div
                  className="text-red-400 text-[10px] pt-1 border-t border-cyan-500/10 animate-fadeInUp"
                  style={{ animationDelay: '900ms', animationFillMode: 'both' }}
                >
                  {'>'} BOTH_SIDES_BONUS: +{botResult.signals.bothSidesBonus}
                </div>
              )}

              {botResult && (
                <div
                  className="pt-2 border-t border-cyan-500/10 space-y-1 animate-fadeInUp"
                  style={{ animationDelay: '1000ms', animationFillMode: 'both' }}
                >
                  <div className="text-cyan-400/40 text-[10px]">
                    {'>'} {botResult.tradeCount} trades | {botResult.mergeCount} merges | {botResult.activeHours}/24h active | {botResult.bothSidesPercent}% both-sides
                  </div>
                </div>
              )}

              {/* Strategy Classification (collapsible) */}
              {botResult && botResult.strategy.confidence > 0 && (() => {
                const strat = botResult.strategy;
                const archetype = STRATEGY_ARCHETYPES[strat.type];
                const sStyle = STRATEGY_STYLES[strat.type];
                return (
                  <div
                    className="pt-2 border-t border-cyan-500/10 animate-fadeInUp"
                    style={{ animationDelay: '1100ms', animationFillMode: 'both' }}
                  >
                    <button
                      onClick={() => setStrategyExpanded(prev => !prev)}
                      className="w-full flex items-center gap-2 group cursor-pointer"
                    >
                      <span className={`text-[10px] font-bold ${sStyle.text}`}>
                        {'>'} STRATEGY: {strat.label.toUpperCase()}
                      </span>
                      <span className="text-cyan-400/30 text-[9px]">{strat.confidence}% conf</span>
                      <span className="ml-auto text-cyan-400/30 group-hover:text-cyan-400 transition-colors">
                        {strategyExpanded
                          ? <ChevronUp className="w-3 h-3" />
                          : <ChevronDown className="w-3 h-3" />
                        }
                      </span>
                    </button>

                    {/* Collapsed: just metrics row */}
                    <div className="flex gap-3 text-[9px] text-cyan-400/30 mt-1">
                      <span>ROI: {strat.avgROI}%</span>
                      <span>sizeCV: {strat.sizeCV}</span>
                      <span>bias: {strat.directionalBias}%</span>
                      {strat.bimodal && <span className="text-violet-400/60">BIMODAL</span>}
                    </div>

                    {/* Expanded: full archetype details */}
                    {strategyExpanded && (
                      <div className={`mt-3 border ${sStyle.border} ${sStyle.bg} p-3 space-y-2.5`}>
                        <div>
                          <div className={`text-[11px] font-bold ${sStyle.text}`}>{archetype.title}</div>
                          <div className="text-[9px] text-cyan-400/40">{archetype.aka}</div>
                        </div>

                        <div>
                          <div className="text-[9px] text-cyan-400/50 uppercase tracking-wider mb-1">Behavior Pattern</div>
                          {archetype.behavior.map((b, i) => (
                            <div key={i} className="text-[10px] text-cyan-300/70 leading-relaxed">
                              {'>'} {b}
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="text-[9px] text-cyan-400/50 uppercase tracking-wider mb-1">Detection Signals</div>
                          {archetype.signals.map((s, i) => (
                            <div key={i} className="text-[10px] text-cyan-300/50">
                              {'>'} {s}
                            </div>
                          ))}
                        </div>

                        <div>
                          <div className="text-[9px] text-cyan-400/50 uppercase tracking-wider mb-1">Risk Profile</div>
                          <div className="text-[10px] text-amber-400/70 leading-relaxed">
                            {'>'} {archetype.risk}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Position Summary Terminal */}
          <div className="border border-cyan-500/30 bg-black/60 overflow-hidden font-mono">
            <TerminalHeader
              title="portfolio --summary"
              extra={
                <span className="text-cyan-400/40 text-[10px]">{positions.length} positions</span>
              }
            />
            <div className="px-3 py-3 space-y-3">
              {positions.length > 0 ? (
                <>
                  {/* Quick stats */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {[
                      { label: 'TOTAL P&L (open)', node: <div className={`text-sm font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>{totalPnl >= 0 ? '+' : ''}{formatUSD(totalPnl)}</div> },
                      { label: 'WIN / LOSS', node: <div className="text-sm font-bold"><span className="text-green-400">{winningPositions}W</span><span className="text-cyan-400/30"> / </span><span className="text-red-400">{positions.length - winningPositions}L</span></div> },
                      { label: 'BEST TRADE', node: <div className="text-sm font-bold text-green-400">+{formatUSD(biggestWin)}</div> },
                      { label: 'WORST TRADE', node: <div className="text-sm font-bold text-red-400">{formatUSD(biggestLoss)}</div> },
                      { label: 'AVG SIZE', node: <div className="text-sm font-bold text-cyan-400">{formatUSD(avgPositionSize)}</div> },
                      { label: 'VOLUME', node: <div className="text-sm font-bold text-cyan-400">{metrics ? formatUSD(metrics.volumeTraded) : '...'}</div> },
                    ].map((item, idx) => (
                      <div
                        key={item.label}
                        className="animate-fadeInUp"
                        style={{ animationDelay: `${idx * 80}ms`, animationFillMode: 'both' }}
                      >
                        <div className="text-[10px] text-cyan-400/40">{item.label}</div>
                        {item.node}
                      </div>
                    ))}
                  </div>

                  {/* Side distribution bar */}
                  {(() => {
                    const yesCount = positions.filter(p => p.outcome === 'Yes').length;
                    const noCount = positions.length - yesCount;
                    const yesPct = Math.round((yesCount / positions.length) * 100);
                    return (
                      <DirectionBiasBar yesPct={yesPct} yesCount={yesCount} noCount={noCount} />
                    );
                  })()}
                </>
              ) : loading ? (
                <div className="text-cyan-400/40 text-[11px] animate-pulse py-4">
                  {'>'} Loading positions...
                </div>
              ) : (
                <div className="text-cyan-400/30 text-[11px] py-4">
                  {'>'} No open positions found
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Insights Terminal */}
        {phase === 'done' && botResult && metrics && (
          <div className="mb-6">
            <AIInsightsTerminal
              context="wallet"
              data={{
                wallet: walletAddress,
                metrics: {
                  portfolioValue: metrics.portfolioValue,
                  profitPnL: metrics.profitPnL,
                },
                positions: positions.slice(0, 10).map(p => ({
                  outcome: p.outcome,
                  title: p.title,
                  currentValue: p.currentValue,
                  cashPnl: p.cashPnl,
                })),
                winRate,
                botSignals: {
                  botScore: botResult.botScore,
                  classification: botResult.classification,
                  signals: botResult.signals,
                },
                strategy: {
                  type: botResult.strategy.type,
                  label: botResult.strategy.label,
                  confidence: botResult.strategy.confidence,
                  description: botResult.strategy.description,
                  avgROI: botResult.strategy.avgROI,
                  sizeCV: botResult.strategy.sizeCV,
                  bimodal: botResult.strategy.bimodal,
                  directionalBias: botResult.strategy.directionalBias,
                },
                marketContext: marketId || undefined,
              }}
              commandLabel={`openclaw --explain ${shortAddr(walletAddress)}`}
              buttonLabel="EXPLAIN WALLET WITH AI"
            />
          </div>
        )}

        {/* Positions Table */}
        {positions.length > 0 && (
          <div className="border border-cyan-500/30 bg-black/60 overflow-hidden font-mono">
            <TerminalHeader
              title={`positions --open ${positions.length}`}
              extra={
                <a
                  href={`https://polymarket.com/portfolio/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-cyan-400/40 hover:text-cyan-400 flex items-center gap-1 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> polymarket.com
                </a>
              }
            />

            {/* Desktop table */}
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-cyan-500/15">
                    <th className="text-left px-3 py-2 text-[10px] text-cyan-400/60">#</th>
                    <th className="text-center px-3 py-2 text-[10px] text-cyan-400/60">SIDE</th>
                    <th className="text-left px-3 py-2 text-[10px] text-cyan-400/60">MARKET</th>
                    <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">SIZE</th>
                    <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">AVG ENTRY</th>
                    <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">CURRENT</th>
                    <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">P&L</th>
                    <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">P&L %</th>
                  </tr>
                </thead>
                <tbody>
                  {displayPositions.map((pos, i) => {
                    const pnlColor = pos.cashPnl > 0 ? 'text-green-400' : pos.cashPnl < 0 ? 'text-red-400' : 'text-cyan-400/40';
                    return (
                      <tr key={i} className="border-b border-cyan-500/10 hover:bg-cyan-500/5 transition-colors">
                        <td className="px-3 py-2 text-cyan-400/30 text-[10px]">{String(i + 1).padStart(2, '0')}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 border ${
                            pos.outcome === 'Yes'
                              ? 'text-green-400 border-green-500/30 bg-green-500/10'
                              : 'text-red-400 border-red-500/30 bg-red-500/10'
                          }`}>
                            {pos.outcome}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-cyan-300 text-xs max-w-[300px] truncate">{pos.title}</td>
                        <td className="px-3 py-2 text-right text-xs text-cyan-300">{formatUSD(pos.currentValue)}</td>
                        <td className="px-3 py-2 text-right text-xs text-cyan-400/60">${pos.avgPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right text-xs text-cyan-300">${pos.curPrice.toFixed(2)}</td>
                        <td className={`px-3 py-2 text-right text-xs ${pnlColor}`}>
                          {pos.cashPnl > 0 ? '+' : ''}{formatUSD(pos.cashPnl)}
                        </td>
                        <td className={`px-3 py-2 text-right text-xs ${pnlColor}`}>
                          {pos.percentPnl > 0 ? '+' : ''}{pos.percentPnl.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-cyan-500/10">
              {displayPositions.map((pos, i) => {
                const pnlColor = pos.cashPnl > 0 ? 'text-green-400' : pos.cashPnl < 0 ? 'text-red-400' : 'text-cyan-400/40';
                return (
                  <div key={i} className="px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-cyan-400/30 text-[10px]">{String(i + 1).padStart(2, '0')}</span>
                        <span className={`text-[10px] px-1 py-0.5 border shrink-0 ${
                          pos.outcome === 'Yes'
                            ? 'text-green-400 border-green-500/30 bg-green-500/10'
                            : 'text-red-400 border-red-500/30 bg-red-500/10'
                        }`}>
                          {pos.outcome}
                        </span>
                        <span className="text-cyan-300 text-xs truncate">{pos.title}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1 pl-8">
                      <span className="text-cyan-400/60 text-[10px]">{formatUSD(pos.currentValue)}</span>
                      <span className={`text-[10px] ${pnlColor}`}>
                        {pos.cashPnl > 0 ? '+' : ''}{formatUSD(pos.cashPnl)} ({pos.percentPnl > 0 ? '+' : ''}{pos.percentPnl.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Show more / footer */}
            {sortedPositions.length > 15 && (
              <div className="px-3 py-2 border-t border-cyan-500/15">
                <button
                  onClick={() => setShowAllPositions(!showAllPositions)}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono transition-colors"
                >
                  {'>'} {showAllPositions ? 'SHOW LESS' : `+${sortedPositions.length - 15} more positions`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Trade History */}
        {metrics && metrics.recentTrades.length > 0 && (
          <div className="border border-cyan-500/30 bg-black/60 overflow-hidden font-mono mt-4">
            <TerminalHeader
              title={`trades --history ${metrics.recentTrades.length}`}
              extra={<span className="text-[10px] text-cyan-400/40">last 50 trades</span>}
            />
            <div className="hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-cyan-500/15">
                    <th className="text-left px-3 py-2 text-[10px] text-cyan-400/60">TIME</th>
                    <th className="text-center px-3 py-2 text-[10px] text-cyan-400/60">SIDE</th>
                    <th className="text-left px-3 py-2 text-[10px] text-cyan-400/60">MARKET</th>
                    <th className="text-center px-3 py-2 text-[10px] text-cyan-400/60">OUTCOME</th>
                    <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">SIZE</th>
                    <th className="text-right px-3 py-2 text-[10px] text-cyan-400/60">PRICE</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentTrades.map((t, i) => {
                    const time = new Date(t.timestamp * 1000);
                    const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                    const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const isBuy = t.side === 'BUY';
                    const isUp = t.outcome === 'Up' || t.outcome === 'Yes';
                    return (
                      <tr key={i} className="border-b border-cyan-500/10 hover:bg-cyan-500/5 transition-colors">
                        <td className="px-3 py-1.5 text-[10px] text-cyan-400/40 whitespace-nowrap">{dateStr} {timeStr}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 border ${isBuy ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>
                            {t.side}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-cyan-300 text-[11px] max-w-[280px] truncate">{t.title}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`text-[10px] ${isUp ? 'text-green-400' : 'text-red-400'}`}>{t.outcome}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right text-[11px] text-cyan-300">${t.usdcSize.toFixed(2)}</td>
                        <td className="px-3 py-1.5 text-right text-[11px] text-cyan-400/60">{(t.price * 100).toFixed(1)}¢</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-cyan-500/10">
              {metrics.recentTrades.map((t, i) => {
                const time = new Date(t.timestamp * 1000);
                const timeStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                const isBuy = t.side === 'BUY';
                const isUp = t.outcome === 'Up' || t.outcome === 'Yes';
                return (
                  <div key={i} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-[10px] px-1 py-0.5 border shrink-0 ${isBuy ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-red-400 border-red-500/30 bg-red-500/10'}`}>{t.side}</span>
                        <span className={`text-[10px] shrink-0 ${isUp ? 'text-green-400' : 'text-red-400'}`}>{t.outcome}</span>
                        <span className="text-cyan-300 text-[11px] truncate">{t.title}</span>
                      </div>
                      <span className="text-cyan-300 text-[11px] shrink-0">${t.usdcSize.toFixed(2)}</span>
                    </div>
                    <div className="text-cyan-400/30 text-[10px] mt-0.5 pl-0">{timeStr}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer info */}
        <div className="mt-6 text-center font-mono">
          <p className="text-cyan-400/20 text-[10px]">
            DeFi Mexico Analyzer v0.1 | data: polymarket data-api + gamma-api | runs client-side
          </p>
        </div>

        {/* Disclaimer */}
        <div className="mt-4 border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-red-400 text-[11px] font-mono text-center leading-relaxed">
            This is NOT investment advice. All data is for educational and research purposes only. You are solely responsible for your own trading decisions. Past performance does not guarantee future results. Trade at your own risk.
          </p>
        </div>
      </div>
    </div>
  );
}
