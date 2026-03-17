import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DivergenceGauge } from './DivergenceGauge';
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

interface ScanResult {
  instrument: string;
  spotPrice: number;
  divergence: number;
  consensusStrength: string;
  decision: string;
  reason: string;
  timestamp: number;
}

interface DivergenceScannerProps {
  livePrices: Record<string, number>;
  onSignal?: (signal: SignalResponse & { timestamp: number; instrument: string }) => void;
}

export const DivergenceScanner: React.FC<DivergenceScannerProps> = ({
  livePrices,
  onSignal,
}) => {
  const [selected, setSelected] = useState('BTC-USDT');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [autoScan, setAutoScan] = useState(false);
  const autoScanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const threshold = parseFloat(import.meta.env.VITE_MIN_DIVERGENCE_THRESHOLD || '3');

  const scanDivergence = useCallback(async (instrument?: string) => {
    const inst = instrument || selected;
    setScanning(true);

    try {
      // Obtener precio spot
      const priceRes = await fetch(`/api/onchainos-price?symbol=${inst}`);
      if (!priceRes.ok) throw new Error('Price fetch failed');
      const priceData = await priceRes.json();
      const spotPrice = priceData.price;

      // Construir slug sintético para el signal processor
      const asset = inst.split('-')[0].toLowerCase();
      const syntheticSlug = `will-${asset}-price-move`;

      const signalRes = await fetch('/api/onchainos-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: '0x0000000000000000000000000000000000000000',
          marketSlug: syntheticSlug,
          score: 85,
          direction: 'YES',
          outcomePrice: 0.65,
          positionDelta: 1000,
        }),
      });

      const signalData: SignalResponse = await signalRes.json();

      const scanResult: ScanResult = {
        instrument: inst,
        spotPrice,
        divergence: signalData.divergence || 0,
        consensusStrength: signalData.consensusStrength || 'N/A',
        decision: signalData.decision,
        reason: signalData.reason,
        timestamp: Date.now(),
      };

      setResult(scanResult);

      // Emitir señal al feed
      onSignal?.({
        ...signalData,
        timestamp: Date.now(),
        instrument: inst,
      });
    } catch (err) {
      setResult({
        instrument: inst,
        spotPrice: livePrices[inst] || 0,
        divergence: 0,
        consensusStrength: 'N/A',
        decision: 'SKIP',
        reason: err instanceof Error ? err.message : 'scan_failed',
        timestamp: Date.now(),
      });
    } finally {
      setScanning(false);
    }
  }, [selected, livePrices, onSignal]);

  // Auto-scan
  useEffect(() => {
    if (autoScan) {
      scanDivergence();
      autoScanRef.current = setInterval(() => scanDivergence(), 30_000);
    } else if (autoScanRef.current) {
      clearInterval(autoScanRef.current);
      autoScanRef.current = null;
    }
    return () => {
      if (autoScanRef.current) clearInterval(autoScanRef.current);
    };
  }, [autoScan, scanDivergence]);

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
          divergence-scanner --instrument {selected.split('-')[0]}
        </span>
        {scanning && <div className="ml-auto w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />}
      </div>

      {/* Instrument tabs */}
      <div className="flex gap-0 border-b border-cyan-500/10 overflow-x-auto">
        {INSTRUMENTS.map((inst) => (
          <button
            key={inst.id}
            onClick={() => { setSelected(inst.id); setResult(null); }}
            className={`px-3 py-2 text-[10px] transition-colors border-b-2 shrink-0 ${
              selected === inst.id
                ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
                : 'border-transparent text-cyan-400/30 hover:text-cyan-400/60 hover:bg-cyan-500/5'
            }`}
          >
            {inst.label}
          </button>
        ))}
      </div>

      {/* Scanner content */}
      <div className="p-4 space-y-4">
        {/* Price display */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[9px] text-cyan-400/40 uppercase mb-1">OKX Spot</div>
            <div className="text-lg font-bold text-foreground">
              ${(result?.spotPrice || livePrices[selected] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[9px] text-cyan-400/40 uppercase mb-1">Signal Status</div>
            {result ? (
              <span className={`px-2 py-0.5 border text-xs ${
                result.decision === 'EXECUTE'
                  ? 'border-green-500/40 text-green-400 bg-green-500/10'
                  : 'border-zinc-500/30 text-zinc-400 bg-zinc-500/10'
              }`}>
                {result.decision}
              </span>
            ) : (
              <span className="text-cyan-400/30 text-xs">Not scanned</span>
            )}
          </div>
        </div>

        {/* Divergence gauge */}
        {result && (
          <div>
            <div className="text-[9px] text-cyan-400/40 uppercase mb-2">Divergence vs Threshold</div>
            <DivergenceGauge divergence={result.divergence} threshold={threshold} />
          </div>
        )}

        {/* Reason */}
        {result && result.decision === 'SKIP' && result.reason && (
          <div className="text-[10px] text-zinc-500">
            {'>'} {result.reason.replace(/_/g, ' ')}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3 pt-2 border-t border-cyan-500/10">
          <button
            onClick={() => scanDivergence()}
            disabled={scanning}
            className={`px-4 py-1.5 text-[10px] border transition-colors ${
              scanning
                ? 'border-cyan-500/20 text-cyan-400/30 cursor-wait'
                : 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
            }`}
          >
            {scanning ? 'SCANNING...' : 'SCAN NOW'}
          </button>

          <button
            onClick={() => setAutoScan(!autoScan)}
            className={`px-3 py-1.5 text-[10px] border transition-colors ${
              autoScan
                ? 'border-green-500/40 text-green-400 bg-green-500/10'
                : 'border-cyan-500/20 text-cyan-400/40 hover:text-cyan-400/60'
            }`}
          >
            Auto: {autoScan ? 'ON' : 'OFF'}
          </button>

          {autoScan && (
            <span className="text-cyan-400/20 text-[9px]">every 30s</span>
          )}

          {result && (
            <span className="text-cyan-400/20 text-[9px] ml-auto">
              {new Date(result.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
