import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface AssetData {
  symbol: string;
  price: number;
  change24h: number;
}

interface ConvictionBoardProps {
  isVisible: boolean;
  bobbyThinking: boolean;
  marketData: Record<string, { price: number; change24h: number }>;
}

const TICKER_MAP: Record<string, string> = {
  BTC: 'BTC-USDT', ETH: 'ETH-USDT', SOL: 'SOL-USDT', OKB: 'OKB-USDT',
  NVDA: 'NVDA', TSLA: 'TSLA', SPY: 'SPY', GOLD: 'GOLD',
};

function AssetCell({ asset }: { asset: AssetData }) {
  const isUp = asset.change24h >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="relative p-3 rounded bg-[#1a1e28] hover:bg-[#202532] transition-colors flex flex-col justify-between overflow-hidden"
    >
      {/* Left accent bar colored by 24h performance */}
      <div className={`absolute top-0 left-0 w-1 h-full ${isUp ? 'bg-green-500/40' : 'bg-red-500/40'}`} />

      <div className="flex justify-between items-start mb-2 pl-2">
        <span className="font-mono font-bold text-white tracking-wider text-[11px]">{asset.symbol}</span>
        <span className={`flex items-center gap-0.5 font-mono font-bold text-[10px] ${isUp ? 'text-green-400' : 'text-red-400'}`}>
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isUp ? '+' : ''}{asset.change24h.toFixed(2)}%
        </span>
      </div>

      <div className="flex flex-col pl-2">
        <span className="font-mono text-white/90 text-[13px] font-medium">
          ${asset.price.toLocaleString(undefined, { maximumFractionDigits: asset.price < 1 ? 4 : 2 })}
        </span>
      </div>

      {/* Subtle glow */}
      <div className={`absolute -bottom-4 -right-4 w-12 h-12 rounded-full blur-[20px] opacity-10 ${isUp ? 'bg-green-500' : 'bg-red-500'}`} />
    </motion.div>
  );
}

export function ConvictionBoard({ isVisible, bobbyThinking, marketData }: ConvictionBoardProps) {
  const [assets, setAssets] = useState<AssetData[]>([]);

  useEffect(() => {
    const result: AssetData[] = [];
    for (const [symbol, tickerKey] of Object.entries(TICKER_MAP)) {
      const data = marketData[tickerKey];
      if (!data || data.price <= 0) continue; // Only show assets with REAL data
      result.push({ symbol, price: data.price, change24h: data.change24h });
    }
    // Sort by absolute change — most volatile first
    result.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
    setAssets(result);
  }, [marketData]);

  if (assets.length === 0) return null;

  return (
    <AnimatePresence>
      {(isVisible && !bobbyThinking) && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } }}
          className="w-full overflow-hidden"
        >
          <div className="bg-[#171b26] rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-mono text-[10px] uppercase tracking-[2px] text-white/50 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Bobby's Radar
              </h3>
              <span className="font-mono text-[9px] text-white/30 px-2 py-0.5">
                {assets.length} ASSETS LIVE
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {assets.slice(0, 8).map(asset => (
                <AssetCell key={asset.symbol} asset={asset} />
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
