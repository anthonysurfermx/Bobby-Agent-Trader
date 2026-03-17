import { useState, useCallback, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ClawTraderHero } from '@/components/claw-trader/ClawTraderHero';
import { SignalRadar } from '@/components/claw-trader/SignalRadar';
import { MarketTimeframeSelector, type DiscoveredMarket } from '@/components/claw-trader/MarketTimeframeSelector';
import { SimplifiedResults } from '@/components/claw-trader/SimplifiedResults';
import { RiskDashboard } from '@/components/claw-trader/RiskDashboard';
import { useTraderScan } from '@/hooks/useTraderScan';
import type { SignalResponse } from '@/lib/onchainos/types';
import type { SignalEntry } from '@/components/claw-trader/SignalFeed';

const MAX_SIGNALS = 50;

export default function ClawTraderPage() {
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [signals, setSignals] = useState<SignalEntry[]>([]);
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    tradingEnabled: false,
    maxPositionUsdc: '100',
    minDivergence: '3',
    maxLeverage: '5',
  });

  // Market selector state
  const [selectedMarket, setSelectedMarket] = useState<DiscoveredMarket | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string>('BTC');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('');
  const marketSectionRef = useRef<HTMLDivElement>(null);

  // 200-trader scan hook
  const { startScan, cancelScan, progress, allResults, botResults, isScanning } = useTraderScan();

  // Risk dashboard collapsed state
  const [riskExpanded, setRiskExpanded] = useState(false);

  const handlePricesUpdate = useCallback((prices: Record<string, number>) => {
    setLivePrices(prices);
  }, []);

  const handleStatusUpdate = useCallback((status: {
    connected: boolean;
    tradingEnabled: boolean;
    maxPositionUsdc: string;
    minDivergence: string;
    maxLeverage?: string;
  }) => {
    setConnectionStatus({
      connected: status.connected,
      tradingEnabled: status.tradingEnabled,
      maxPositionUsdc: status.maxPositionUsdc,
      minDivergence: status.minDivergence,
      maxLeverage: status.maxLeverage || '5',
    });
  }, []);

  const handleSignal = useCallback((signal: SignalResponse & { timestamp: number; instrument: string }) => {
    setSignals(prev => {
      const entry: SignalEntry = signal;
      const updated = [entry, ...prev];
      return updated.slice(0, MAX_SIGNALS);
    });
  }, []);

  const handleMarketSelected = useCallback((market: DiscoveredMarket, asset: string, timeframe: string) => {
    setSelectedMarket(market);
    setSelectedAsset(asset);
    setSelectedTimeframe(timeframe);
  }, []);

  const handleGetStarted = useCallback(() => {
    marketSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const marketLabel = selectedMarket
    ? `${selectedAsset.toLowerCase()}-${selectedTimeframe}`
    : undefined;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Claw Trader | DeFi Hub M\u00e9xico</title>
        <meta name="description" content="Scan 200 traders, detect bots, follow smart money. AI-powered Polymarket intelligence." />
      </Helmet>

      <div className="container mx-auto px-4 py-6 space-y-3">
        {/* Hero — compact with inline status */}
        <ClawTraderHero
          onPricesUpdate={handlePricesUpdate}
          onStatusUpdate={handleStatusUpdate}
          onGetStarted={handleGetStarted}
        />

        {/* Cross-link to Chat Mode */}
        <div className="flex justify-end">
          <Link
            to="/agentic-world/claw-trader-chat"
            className="text-[10px] font-mono text-green-400/40 hover:text-green-400/60 transition-colors"
          >
            Want a simpler experience? {'\u2192'} Claw Trader Chat
          </Link>
        </div>

        {/* Signal Radar — replaces AlphaRadar + DivergenceScanner + SignalFeed */}
        <SignalRadar
          livePrices={livePrices}
          onSignal={handleSignal}
        />

        {/* Market Timeframe Selector — full width, prominent */}
        <div ref={marketSectionRef}>
          <MarketTimeframeSelector
            onMarketSelected={handleMarketSelected}
            onStartScan={startScan}
            isScanning={isScanning}
          />
        </div>

        {/* Simplified Results — replaces AgentDetectionPanel + SmartMoneyCompass */}
        <SimplifiedResults
          isScanning={isScanning}
          progress={progress}
          botResults={botResults}
          allResults={allResults}
          marketLabel={marketLabel}
        />

        {/* Risk Dashboard — collapsible, default collapsed */}
        <div>
          {!riskExpanded ? (
            <button
              onClick={() => setRiskExpanded(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 border border-cyan-500/20 bg-black/60 font-mono hover:bg-cyan-500/5 transition-colors"
            >
              <span className="text-cyan-400/40 text-[10px]">
                {'\u25B8'} risk-manager --dashboard
              </span>
              <span className="text-cyan-400/20 text-[9px] ml-auto">click to expand</span>
            </button>
          ) : (
            <div>
              <RiskDashboard
                signals={signals}
                maxPositionUsdc={connectionStatus.maxPositionUsdc}
                minDivergence={connectionStatus.minDivergence}
                maxLeverage={connectionStatus.maxLeverage}
                tradingEnabled={connectionStatus.tradingEnabled}
              />
              <button
                onClick={() => setRiskExpanded(false)}
                className="w-full px-3 py-1 text-[9px] text-cyan-400/30 hover:text-cyan-400/50 transition-colors border border-cyan-500/10 border-t-0 bg-black/40"
              >
                {'\u25BE'} collapse risk dashboard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
