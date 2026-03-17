import React, { useState, useEffect, useCallback } from 'react';

export interface DiscoveredMarket {
  slug: string;
  conditionId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  endDate: string;
  volume: number;
}

type Timeframe = '5m' | '15m' | 'daily' | 'weekly' | 'monthly';

const ACTIVE_ASSETS = ['BTC', 'ETH', 'SOL', 'XRP'] as const;
const INACTIVE_ASSETS = ['DOGE', 'SUI', 'LINK', 'AVAX'] as const;
const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
];

const CACHE_TTL = 60_000;

interface CachedData {
  markets: Record<string, DiscoveredMarket>;
  timestamp: number;
}

interface MarketTimeframeSelectorProps {
  onMarketSelected?: (market: DiscoveredMarket, asset: string, timeframe: Timeframe) => void;
  onStartScan?: () => void;
  isScanning?: boolean;
}

export const MarketTimeframeSelector: React.FC<MarketTimeframeSelectorProps> = ({
  onMarketSelected,
  onStartScan,
  isScanning,
}) => {
  const [selectedAsset, setSelectedAsset] = useState<string>('BTC');
  const [selectedTf, setSelectedTf] = useState<Timeframe | null>(null);
  const [markets, setMarkets] = useState<Record<string, DiscoveredMarket>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarkets = useCallback(async (asset: string) => {
    const cacheKey = `market_discovery_${asset.toLowerCase()}`;
    const cached = sessionStorage.getItem(cacheKey);

    if (cached) {
      try {
        const data: CachedData = JSON.parse(cached);
        if (Date.now() - data.timestamp < CACHE_TTL) {
          setMarkets(data.markets);
          // Auto-select first available timeframe
          const firstTf = TIMEFRAMES.find(tf => data.markets[tf.id]);
          if (firstTf) {
            setSelectedTf(firstTf.id);
            onMarketSelected?.(data.markets[firstTf.id], asset, firstTf.id);
          }
          return;
        }
      } catch { /* cache corrupted, refetch */ }
    }

    setLoading(true);
    setError(null);
    setMarkets({});
    setSelectedTf(null);

    try {
      const res = await fetch(`/api/discover-markets?asset=${asset.toLowerCase()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.ok && data.markets) {
        setMarkets(data.markets);
        sessionStorage.setItem(cacheKey, JSON.stringify({
          markets: data.markets,
          timestamp: Date.now(),
        }));

        // Auto-select first available timeframe
        const firstTf = TIMEFRAMES.find(tf => data.markets[tf.id]);
        if (firstTf) {
          setSelectedTf(firstTf.id);
          onMarketSelected?.(data.markets[firstTf.id], asset, firstTf.id);
        }
      } else {
        setError('No markets found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load markets');
    } finally {
      setLoading(false);
    }
  }, [onMarketSelected]);

  // Fetch on mount and asset change
  useEffect(() => {
    fetchMarkets(selectedAsset);
  }, [selectedAsset, fetchMarkets]);

  const handleAssetClick = (asset: string) => {
    if (asset === selectedAsset) return;
    setSelectedAsset(asset);
  };

  const handleTfClick = (tf: Timeframe) => {
    if (!markets[tf]) return;
    setSelectedTf(tf);
    onMarketSelected?.(markets[tf], selectedAsset, tf);
  };

  const selectedMarket = selectedTf ? markets[selectedTf] : null;

  const formatEndTime = (endDate: string): string => {
    const d = new Date(endDate);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();

    if (diffMs < 0) return 'Expired';
    if (diffMs < 60_000) return `${Math.round(diffMs / 1000)}s left`;
    if (diffMs < 3600_000) return `${Math.round(diffMs / 60_000)}m left`;
    if (diffMs < 86400_000) return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="border border-purple-500/20 bg-black/60 overflow-hidden font-mono">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 border-b border-purple-500/20">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <div className="w-2 h-2 rounded-full bg-green-500/60" />
        </div>
        <span className="text-purple-400 text-[10px]">
          market-selector --crypto --polymarket
        </span>
        {loading && <div className="ml-auto w-2 h-2 rounded-full bg-purple-500 animate-pulse" />}
      </div>

      <div className="p-3 space-y-3">
        {/* Asset tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {ACTIVE_ASSETS.map((asset) => (
            <button
              key={asset}
              onClick={() => handleAssetClick(asset)}
              className={`px-3 py-1 text-[10px] font-bold border transition-colors ${
                selectedAsset === asset
                  ? 'border-purple-500/50 text-purple-300 bg-purple-500/15'
                  : 'border-purple-500/20 text-purple-400/50 hover:text-purple-400/80 hover:border-purple-500/30'
              }`}
            >
              {asset}
            </button>
          ))}
          <div className="w-px h-4 bg-purple-500/20 mx-1" />
          {INACTIVE_ASSETS.map((asset) => (
            <span
              key={asset}
              className="px-2 py-1 text-[10px] text-zinc-600 cursor-not-allowed"
              title="No Polymarket prediction markets available"
            >
              {asset}
            </span>
          ))}
        </div>

        {/* Timeframe buttons */}
        <div className="flex items-center gap-1">
          {TIMEFRAMES.map((tf) => {
            const available = !!markets[tf.id];
            const active = selectedTf === tf.id;
            return (
              <button
                key={tf.id}
                onClick={() => handleTfClick(tf.id)}
                disabled={!available}
                className={`px-3 py-1 text-[10px] border transition-colors ${
                  active
                    ? 'border-purple-500/50 text-purple-300 bg-purple-500/15'
                    : available
                      ? 'border-purple-500/20 text-purple-400/50 hover:text-purple-400/80'
                      : 'border-zinc-700/30 text-zinc-700 cursor-not-allowed'
                }`}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        {/* Selected market info */}
        {loading && (
          <div className="text-purple-400/40 text-[10px] animate-pulse">
            {'>'} Discovering {selectedAsset} markets on Polymarket...
          </div>
        )}

        {error && (
          <div className="text-red-400/60 text-[10px]">
            {'>'} Error: {error}
          </div>
        )}

        {selectedMarket && (
          <div className="border border-purple-500/15 bg-purple-500/5 p-3 space-y-2">
            <div className="text-purple-300 text-[11px] font-bold">
              {selectedMarket.question}
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <span>
                <span className="text-green-400">UP: {(selectedMarket.yesPrice * 100).toFixed(0)}¢</span>
              </span>
              <span className="text-purple-500/30">|</span>
              <span>
                <span className="text-red-400">DOWN: {(selectedMarket.noPrice * 100).toFixed(0)}¢</span>
              </span>
              <span className="text-purple-500/30">|</span>
              <span className="text-purple-400/40">
                Vol: ${selectedMarket.volume >= 1000 ? `${(selectedMarket.volume / 1000).toFixed(0)}K` : selectedMarket.volume.toFixed(0)}
              </span>
              <span className="text-purple-500/30">|</span>
              <span className="text-purple-400/40">
                {formatEndTime(selectedMarket.endDate)}
              </span>
            </div>
          </div>
        )}

        {/* Scan button */}
        <button
          onClick={onStartScan}
          disabled={!selectedMarket || isScanning}
          className={`w-full py-2 text-[11px] font-bold border transition-colors ${
            isScanning
              ? 'border-purple-500/20 text-purple-400/30 cursor-wait'
              : selectedMarket
                ? 'border-purple-500/40 text-purple-300 hover:bg-purple-500/10'
                : 'border-zinc-700/30 text-zinc-700 cursor-not-allowed'
          }`}
        >
          {isScanning ? 'SCANNING...' : 'SCAN 200 TRADERS ON THIS MARKET'}
        </button>
      </div>
    </div>
  );
};
