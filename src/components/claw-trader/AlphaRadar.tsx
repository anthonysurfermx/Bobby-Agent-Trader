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

// Deduplicación: cooldown de 5 min por instrumento para evitar spam al feed
const SIGNAL_COOLDOWN_MS = 5 * 60 * 1000;
// Delay entre batches para evitar rate limiting
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
}

interface AlphaRadarProps {
  livePrices: Record<string, number>;
  onSignal?: (signal: SignalResponse & { timestamp: number; instrument: string }) => void;
}

export const AlphaRadar: React.FC<AlphaRadarProps> = ({ livePrices, onSignal }) => {
  const [results, setResults] = useState<RadarResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanningRef = useRef(false); // Guard contra race conditions
  const lastEmittedRef = useRef<Record<string, number>>({}); // Deduplicación
  const threshold = parseFloat(import.meta.env.VITE_MIN_DIVERGENCE_THRESHOLD || '3');

  const batchScanAll = useCallback(async () => {
    // Race condition guard: si ya hay un scan corriendo, no iniciar otro
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setProgress(0);
    const allResults: RadarResult[] = [];

    // 2 batches de 4 para no saturar la API
    const batches = [INSTRUMENTS.slice(0, 4), INSTRUMENTS.slice(4, 8)];

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batch = batches[batchIdx];

      // Delay entre batches (no antes del primero)
      if (batchIdx > 0) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }

      const batchResults = await Promise.all(
        batch.map(async (inst) => {
          try {
            // Paso 1: Precio spot
            const priceRes = await fetch(`/api/onchainos-price?symbol=${inst.id}`);
            if (!priceRes.ok) throw new Error('Price fetch failed');
            const priceData = await priceRes.json();
            const spotPrice = priceData.price;

            // Paso 2: Señal de divergencia
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
            };
          }
        })
      );
      allResults.push(...batchResults);
      setProgress(allResults.length);
    }

    // Ordenar por divergencia descendente
    allResults.sort((a, b) => b.divergence - a.divergence);
    allResults.forEach((r, i) => (r.rank = i + 1));

    setResults(allResults);
    setScanning(false);
    scanningRef.current = false;
    setLastScan(Date.now());

    // Emitir señales al feed con deduplicación anti-spam
    const now = Date.now();
    allResults.forEach((r) => {
      // Solo emitir si divergencia supera threshold
      if (r.divergence < threshold) return;

      // Cooldown: no emitir si ya se emitió para este par en los últimos 5 min
      const lastEmitted = lastEmittedRef.current[r.instrument] || 0;
      if (now - lastEmitted < SIGNAL_COOLDOWN_MS) return;

      onSignal?.({
        decision: r.decision,
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
      lastEmittedRef.current[r.instrument] = now;
    });
  }, [livePrices, onSignal, threshold]);

  // Auto-refresh cada 60s
  useEffect(() => {
    if (autoRefresh) {
      batchScanAll();
      autoRef.current = setInterval(batchScanAll, 60_000);
    } else if (autoRef.current) {
      clearInterval(autoRef.current);
      autoRef.current = null;
    }
    return () => {
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [autoRefresh, batchScanAll]);

  const getDivColor = (div: number): string => {
    if (div >= threshold) return 'text-green-400';
    if (div >= 1) return 'text-amber-400';
    return 'text-zinc-500';
  };

  const getRowBg = (div: number): string => {
    if (div >= threshold) return 'bg-green-500/5';
    return '';
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
          alpha-radar --scan-all --rank divergence
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
              <span className="w-12">Pair</span>
              <span className="w-24 text-right">Spot</span>
              <span className="w-16 text-right">Div%</span>
              <span className="w-16 text-center">Signal</span>
              <span className="w-16 text-center">Dir</span>
            </div>

            {/* Rows */}
            {results.map((r) => (
              <div
                key={r.instrument}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-cyan-500/5 ${getRowBg(r.divergence)}`}
              >
                <span className="text-cyan-400/30 text-[10px] w-5">{r.rank}</span>
                <span className="text-foreground text-[11px] font-bold w-12">{r.label}</span>
                <span className="text-cyan-400/60 text-[10px] w-24 text-right">
                  ${r.spotPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`text-[10px] font-bold w-16 text-right ${getDivColor(r.divergence)}`}>
                  {r.divergence.toFixed(1)}%
                </span>
                <span className="w-16 text-center">
                  {r.consensusStrength !== 'N/A' ? (
                    <span
                      className={`text-[9px] px-1 border ${
                        r.consensusStrength === 'STRONG'
                          ? 'border-green-500/30 text-green-400'
                          : r.consensusStrength === 'MEDIUM'
                            ? 'border-amber-500/30 text-amber-400'
                            : 'border-zinc-500/30 text-zinc-500'
                      }`}
                    >
                      {r.consensusStrength}
                    </span>
                  ) : (
                    <span className="text-zinc-600 text-[9px]">--</span>
                  )}
                </span>
                <span
                  className={`text-[10px] font-bold w-16 text-center ${
                    r.direction === 'LONG' ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {r.direction === 'LONG' ? '▲' : '▼'} {r.direction}
                </span>
              </div>
            ))}
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

        {autoRefresh && (
          <span className="text-cyan-400/20 text-[9px]">every 60s</span>
        )}

        {lastScan && (
          <span className="text-cyan-400/20 text-[9px] ml-auto">
            {new Date(lastScan).toLocaleTimeString('en-US', { hour12: false })}
          </span>
        )}
      </div>
    </div>
  );
};
