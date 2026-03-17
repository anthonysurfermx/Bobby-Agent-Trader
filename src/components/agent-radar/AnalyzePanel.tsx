// ============================================================
// AnalyzePanel — Clean market scanner with suggested markets
// No empty states — always shows something useful
// ============================================================

import { useState } from 'react';
import { Search, ExternalLink, TrendingUp, Users, Bot as BotIcon } from 'lucide-react';
import { polymarketService, type MarketInfo, type MarketHolder } from '@/services/polymarket.service';
import { detectBot, type BotDetectionResult, type MarketContext } from '@/services/polymarket-detector';
import { toast } from 'sonner';

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

// Suggested markets to fill empty state
const SUGGESTED = [
  { label: 'US Elections', slug: 'presidential-election-winner-2024' },
  { label: 'Fed Rate Cut', slug: 'fed-funds-rate-march-19' },
  { label: 'BTC > $100K', slug: 'will-bitcoin-reach-100k' },
];

interface Props {
  onSwitchToAdvanced: () => void;
}

interface ScanResult {
  market: MarketInfo;
  holders: (MarketHolder & { bot?: BotDetectionResult })[];
  botCount: number;
  humanCount: number;
  mixedCount: number;
}

export function AnalyzePanel({ onSwitchToAdvanced }: Props) {
  const [url, setUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleScan = async (inputUrl?: string) => {
    const target = inputUrl || url;
    const slug = polymarketService.parseMarketUrl(target) || target;
    if (!slug) {
      toast.error('Paste a valid Polymarket URL');
      return;
    }

    setScanning(true);
    setResult(null);
    setProgress('Looking up market...');

    const info = await polymarketService.getMarketBySlug(slug);
    if (!info) {
      toast.error('Market not found');
      setScanning(false);
      setProgress('');
      return;
    }

    setProgress('Fetching holders...');
    const holders = await polymarketService.getMarketHolders(info.conditionId);
    if (holders.length === 0) {
      toast.error('No holders found');
      setScanning(false);
      setProgress('');
      return;
    }

    const holdersWithBot: (MarketHolder & { bot?: BotDetectionResult })[] = holders.map(h => ({ ...h }));
    const toScan = holdersWithBot.slice(0, 8);

    for (let i = 0; i < toScan.length; i++) {
      setProgress(`Scanning ${i + 1}/${toScan.length}...`);
      const ctx: MarketContext = {
        holderAmount: toScan[i].amount,
        totalMarketVolume: info.volume,
      };
      try {
        const bot = await detectBot(toScan[i].address, undefined, ctx);
        holdersWithBot[i] = { ...holdersWithBot[i], bot };
      } catch { /* skip */ }
    }

    const scanned = holdersWithBot.filter(h => h.bot);
    const botCount = scanned.filter(h => h.bot?.classification === 'bot' || h.bot?.classification === 'likely-bot').length;
    const humanCount = scanned.filter(h => h.bot?.classification === 'human').length;
    const mixedCount = scanned.filter(h => h.bot?.classification === 'mixed').length;

    setResult({ market: info, holders: holdersWithBot, botCount, humanCount, mixedCount });
    setScanning(false);
    setProgress('');
  };

  return (
    <div className="space-y-3">
      {/* Compact search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-600" />
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !scanning && handleScan()}
          placeholder="Paste Polymarket URL or slug..."
          className="w-full bg-neutral-900/60 border border-neutral-800 rounded-xl pl-9 pr-16 py-2.5 text-sm text-neutral-200 placeholder-neutral-600 outline-none focus:border-cyan-500/30 transition-colors"
        />
        <button
          onClick={() => handleScan()}
          disabled={scanning || !url}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-cyan-500/15 text-cyan-400 rounded-lg text-[11px] font-medium hover:bg-cyan-500/25 transition-colors disabled:opacity-30"
        >
          {scanning ? (
            <span className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 border-[1.5px] border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              {progress}
            </span>
          ) : 'Scan'}
        </button>
      </div>

      {/* Results */}
      {result ? (
        <div className="space-y-3">
          {/* Market title + volume */}
          <div>
            <h4 className="text-[13px] font-medium text-neutral-200 leading-snug line-clamp-2">{result.market.question}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-neutral-500">{formatUSD(result.market.volume)} vol</span>
            </div>
          </div>

          {/* Agent detection bar */}
          <div className="flex items-center gap-1.5">
            {result.botCount > 0 && (
              <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/15 rounded-lg px-2 py-1.5">
                <BotIcon className="w-3 h-3 text-red-400" />
                <span className="text-[11px] font-bold text-red-400">{result.botCount}</span>
                <span className="text-[10px] text-red-400/60">agents</span>
              </div>
            )}
            {result.humanCount > 0 && (
              <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/15 rounded-lg px-2 py-1.5">
                <Users className="w-3 h-3 text-green-400" />
                <span className="text-[11px] font-bold text-green-400">{result.humanCount}</span>
                <span className="text-[10px] text-green-400/60">humans</span>
              </div>
            )}
            {result.mixedCount > 0 && (
              <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/15 rounded-lg px-2 py-1.5">
                <span className="text-[11px] font-bold text-amber-400">{result.mixedCount}</span>
                <span className="text-[10px] text-amber-400/60">mixed</span>
              </div>
            )}
          </div>

          {/* Top holders compact list */}
          <div className="space-y-0.5">
            {result.holders.slice(0, 4).map(h => (
              <div key={h.address} className="flex items-center justify-between text-[11px] py-1 px-2 rounded-md hover:bg-neutral-800/30">
                <span className="text-neutral-500 font-mono">{h.address.slice(0, 6)}...{h.address.slice(-4)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400">{formatUSD(h.amount)}</span>
                  {h.bot && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                      h.bot.classification === 'bot' || h.bot.classification === 'likely-bot'
                        ? 'bg-red-500/10 text-red-400'
                        : h.bot.classification === 'human'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-amber-500/10 text-amber-400'
                    }`}>
                      {h.bot.classification === 'bot' ? 'BOT' : h.bot.classification === 'likely-bot' ? 'LIKELY' : h.bot.classification === 'human' ? 'HUMAN' : 'MIXED'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={onSwitchToAdvanced}
              className="text-[11px] text-cyan-400/50 hover:text-cyan-400 transition-colors"
            >
              Full analysis →
            </button>
            <a
              href={`https://polymarket.com/event/${polymarketService.parseMarketUrl(url) || url}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              Polymarket
            </a>
          </div>
        </div>
      ) : !scanning ? (
        /* Suggested markets — no empty state */
        <div className="space-y-1.5">
          <div className="text-[10px] text-neutral-600 uppercase tracking-wider">Popular markets</div>
          {SUGGESTED.map(m => (
            <button
              key={m.slug}
              onClick={() => { setUrl(m.slug); handleScan(m.slug); }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-neutral-900/40 border border-neutral-800/50 hover:border-cyan-500/20 hover:bg-cyan-500/5 transition-all group text-left"
            >
              <TrendingUp className="w-3 h-3 text-neutral-600 group-hover:text-cyan-400 transition-colors" />
              <span className="text-[11px] text-neutral-400 group-hover:text-neutral-200 transition-colors">{m.label}</span>
              <Search className="w-2.5 h-2.5 text-neutral-700 ml-auto group-hover:text-cyan-400/50 transition-colors" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
