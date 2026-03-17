import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SignalResponse } from '@/lib/onchainos/types';

const INSTRUMENTS = [
  { id: 'BTC-USDT', label: 'BTC' },
  { id: 'ETH-USDT', label: 'ETH' },
  { id: 'SOL-USDT', label: 'SOL' },
  { id: 'XRP-USDT', label: 'XRP' },
  { id: 'DOGE-USDT', label: 'DOGE' },
  { id: 'SUI-USDT', label: 'SUI' },
  { id: 'LINK-USDT', label: 'LINK' },
  { id: 'AVAX-USDT', label: 'AVAX' },
];

const BATCH_DELAY_MS = 300;

interface RadarResult {
  instrument: string;
  label: string;
  spotPrice: number;
  impliedPrice: number;
  divergence: number;
  consensusStrength: string;
  decision: string;
  direction: 'LONG' | 'SHORT';
  rank: number;
  reason: string;
}

interface SignalRadarProps {
  livePrices: Record<string, number>;
  onSignal?: (signal: SignalResponse & { timestamp: number; instrument: string }) => void;
}

export const SignalRadar: React.FC<SignalRadarProps> = ({ livePrices, onSignal }) => {
  const [results, setResults] = useState<RadarResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef = useRef(false);
  const threshold = parseFloat(import.meta.env.VITE_MIN_DIVERGENCE_THRESHOLD || '3');

  const batchScanAll = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setProgress(0);
    const allResults: RadarResult[] = [];

    const batches = [INSTRUMENTS.slice(0, 4), INSTRUMENTS.slice(4, 8)];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];
      if (batchIdx > 0) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));

      const batchResults = await Promise.all(
        batch.map(async (inst) => {
          try {
            const priceRes = await fetch(`/api/onchainos-price?symbol=${inst.id}`);
            if (!priceRes.ok) throw new Error('Price fetch failed');
            const priceData = await priceRes.json();
            const spotPrice = priceData.price;

            const asset = inst.id.split('-')[0].toLowerCase();
            const signalRes = await fetch('/api/onchainos-signal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                walletAddress: '0x0000000000000000000000000000000000000000',
                marketSlug: `will-${asset}-price-move`,
                score: 85,
                direction: 'YES',
                outcomePrice: 0.65,
                positionDelta: 1000,
              }),
            });
            const signalData: SignalResponse = await signalRes.json();
            const implied = signalData.impliedPrice || spotPrice;

            return {
              instrument: inst.id,
              label: inst.label,
              spotPrice,
              impliedPrice: implied,
              divergence: signalData.divergence || 0,
              consensusStrength: signalData.consensusStrength || 'N/A',
              decision: signalData.decision,
              direction: (implied > spotPrice ? 'LONG' : 'SHORT') as 'LONG' | 'SHORT',
              rank: 0,
              reason: signalData.reason || '',
            };
          } catch {
            return {
              instrument: inst.id,
              label: inst.label,
              spotPrice: livePrices[inst.id] || 0,
              impliedPrice: 0,
              divergence: 0,
              consensusStrength: 'N/A',
              decision: 'SKIP',
              direction: 'LONG' as const,
              rank: 0,
              reason: 'scan_failed',
            };
          }
        })
      );
      allResults.push(...batchResults);
      setProgress(allResults.length);
    }

    allResults.sort((a, b) => b.divergence - a.divergence);
    allResults.forEach((r, i) => (r.rank = i + 1));

    setResults(allResults);
    setScanning(false);
    scanningRef.current = false;
    setLastScan(Date.now());

    // Emit actionable signals
    const now = Date.now();
    allResults.forEach((r) => {
      if (r.divergence < threshold) return;
      onSignal?.({
        decision: r.decision as SignalResponse['decision'],
        reason: 'alpha_radar_scan',
        trade: null,
        divergence: r.divergence,
        expectedEdge: r.divergence,
        txHash: null,
        spotPrice: r.spotPrice,
        impliedPrice: r.impliedPrice,
        consensusStrength: r.consensusStrength as 'WEAK' | 'MEDIUM' | 'STRONG',
        timestamp: now,
        instrument: r.instrument,
      });
    });
  }, [livePrices, onSignal, threshold]);

  useEffect(() => {
    if (autoRefresh) {
      batchScanAll();
      autoRef.current = setInterval(batchScanAll, 60_000);
    } else if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [autoRefresh, batchScanAll]);

  const topPick = results.find(r => r.divergence >= threshold);

  const getAction = (r: RadarResult): { label: string; color: string } => {
    if (r.divergence >= threshold) {
      return r.direction === 'LONG'
        ? { label: 'BUY', color: 'text-green-400' }
        : { label: 'SELL', color: 'text-red-400' };
    }
    return { label: 'SKIP', color: 'text-zinc-500' };
  };

  const getSignalBar = (div: number): string => {
    const segments = 8;
    const filled = Math.min(segments, Math.round((div / (threshold * 2)) * segments));
    return '\u2588'.repeat(filled) + '\u2591'.repeat(segments - filled);
  };

  return (
    <div className="border border-cyan-500/20 bg-black/60 overflow-hidden font-mono">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
        <div className="flex gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red-500/60" />
          <div className="w-2 h-2 rounded-full bg-yellow-500/60" />
          <div className="w-2 h-2 rounded-full bg-green-500/60" />
        </div>
        <span className="text-cyan-400 text-[10px]">
          signal-radar --scan-all --rank divergence
        </span>
        {scanning && <div className="ml-auto w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />}
      </div>

      {/* Progress bar */}
      {scanning && (
        <div className="px-3 py-1.5 border-b border-cyan-500/10">
          <div className="flex gap-[2px]">
            {INSTRUMENTS.map((_, i) => (
              <div
                key={i}
                className={`flex-1 h-1 transition-colors duration-200 ${
                  i < progress ? 'bg-cyan-500/60' : 'bg-cyan-500/10'
                }`}
              />
            ))}
          </div>
          <div className="text-[9px] text-cyan-400/40 mt-1">
            Scanning {progress}/{INSTRUMENTS.length}...
          </div>
        </div>
      )}

      {/* TOP PICK highlight */}
      {topPick && !scanning && (
        <div className="px-3 py-2 bg-green-500/10 border-b border-green-500/20 flex items-center gap-2">
          <span className="text-amber-400 text-[10px]">TOP PICK:</span>
          <span className="text-foreground text-sm font-bold">{topPick.label}</span>
          <span className="text-green-400 text-[10px]">Div: {topPick.divergence.toFixed(1)}%</span>
          <span className={`text-[9px] px-1 border ${
            topPick.consensusStrength === 'STRONG'
              ? 'border-green-500/30 text-green-400'
              : topPick.consensusStrength === 'MEDIUM'
                ? 'border-amber-500/30 text-amber-400'
                : 'border-zinc-500/30 text-zinc-500'
          }`}>
            {topPick.consensusStrength}
          </span>
          <span className={`text-[10px] font-bold ${topPick.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
            {topPick.direction === 'LONG' ? '>' : '>'} {topPick.direction === 'LONG' ? 'BUY' : 'SELL'}
          </span>
        </div>
      )}

      {/* Ranked table */}
      <div className="overflow-x-auto">
        {results.length === 0 && !scanning ? (
          <div className="px-4 py-6 text-center">
            <div className="text-cyan-400/20 text-xs">No scan data yet</div>
            <div className="text-cyan-400/10 text-[10px] mt-1">
              Hit SCAN ALL to analyze 8 pairs simultaneously
            </div>
          </div>
        ) : results.length > 0 ? (
          <>
            {/* Column headers */}
            <div className="flex items-center gap-2 px-3 py-1.5 text-[8px] text-cyan-400/30 uppercase border-b border-cyan-500/10">
              <span className="w-5">#</span>
              <span className="w-14">Pair</span>
              <span className="w-24 text-right">Spot</span>
              <span className="w-12 text-right">Div%</span>
              <span className="w-20 text-center">Signal</span>
              <span className="w-12 text-center">Action</span>
            </div>

            {results.map((r) => {
              const action = getAction(r);
              return (
                <React.Fragment key={r.instrument}>
                  <div
                    onClick={() => setExpandedRow(expandedRow === r.instrument ? null : r.instrument)}
                    className={`flex items-center gap-2 px-3 py-1.5 border-b border-cyan-500/5 cursor-pointer hover:bg-cyan-500/5 transition-colors ${
                      r.divergence >= threshold ? 'bg-green-500/5' : ''
                    }`}
                  >
                    <span className="text-cyan-400/30 text-[10px] w-5">{r.rank}</span>
                    <span className="text-foreground text-[11px] font-bold w-14">{r.label}</span>
                    <span className="text-cyan-400/60 text-[10px] w-24 text-right">
                      ${r.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-[10px] font-bold w-12 text-right ${
                      r.divergence >= threshold ? 'text-green-400' :
                      r.divergence >= 1 ? 'text-amber-400' : 'text-zinc-500'
                    }`}>
                      {r.divergence.toFixed(1)}%
                    </span>
                    <span className="text-[10px] w-20 text-center text-cyan-400/40">
                      {getSignalBar(r.divergence)}
                    </span>
                    <span className={`text-[10px] font-bold w-12 text-center ${action.color}`}>
                      {action.label}
                    </span>
                  </div>

                  {/* Expanded detail row */}
                  {expandedRow === r.instrument && (
                    <div className="px-6 py-2 bg-cyan-500/5 border-b border-cyan-500/10 text-[10px] space-y-1">
                      <div className="flex gap-4">
                        <span className="text-cyan-400/40">Implied:</span>
                        <span className="text-cyan-400/60">
                          ${r.impliedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-cyan-400/40">Direction:</span>
                        <span className={r.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                          {r.direction === 'LONG' ? '\u25B2' : '\u25BC'} {r.direction}
                        </span>
                        <span className="text-cyan-400/40">Strength:</span>
                        <span className={`px-1 border ${
                          r.consensusStrength === 'STRONG'
                            ? 'border-green-500/30 text-green-400'
                            : r.consensusStrength === 'MEDIUM'
                              ? 'border-amber-500/30 text-amber-400'
                              : 'border-zinc-500/30 text-zinc-500'
                        }`}>
                          {r.consensusStrength}
                        </span>
                      </div>
                      {r.reason && r.decision === 'SKIP' && (
                        <div className="text-zinc-500">{'>'} {r.reason.replace(/_/g, ' ')}</div>
                      )}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </>
        ) : null}
      </div>

      {/* Footer controls */}
      <div className="px-3 py-1.5 bg-cyan-500/5 border-t border-cyan-500/10 flex items-center gap-3">
        <button
          onClick={batchScanAll}
          disabled={scanning}
          className={`px-4 py-1 text-[10px] border transition-colors ${
            scanning
              ? 'border-cyan-500/20 text-cyan-400/30 cursor-wait'
              : 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
          }`}
        >
          {scanning ? 'SCANNING...' : 'SCAN ALL'}
        </button>

        <button
          onClick={() => setAutoRefresh(!autoRefresh)}
          className={`px-3 py-1 text-[10px] border transition-colors ${
            autoRefresh
              ? 'border-green-500/40 text-green-400 bg-green-500/10'
              : 'border-cyan-500/20 text-cyan-400/40 hover:text-cyan-400/60'
          }`}
        >
          Auto: {autoRefresh ? 'ON' : 'OFF'}
        </button>

        {autoRefresh && <span className="text-cyan-400/20 text-[9px]">every 60s</span>}

        {lastScan && (
          <span className="text-cyan-400/20 text-[9px] ml-auto">
            {new Date(lastScan).toLocaleTimeString('en-US', { hour12: false })}
          </span>
        )}
      </div>
    </div>
  );
};
