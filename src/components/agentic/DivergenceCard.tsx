// ============================================================
// DivergenceCard — Muestra resultado de análisis de divergencia
// Precio Polymarket implícito vs OKX spot, consenso, y decisión
// ============================================================

import React from 'react';
import type { SignalResponse } from '@/lib/onchainos/types';

interface DivergenceCardProps {
  result: SignalResponse;
  walletAddress: string;
  marketSlug: string;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getDivergenceColor(divergence: number): string {
  if (divergence < 3) return 'text-red-400';
  if (divergence < 5) return 'text-amber-400';
  return 'text-green-400';
}

function getDivergenceBorder(divergence: number): string {
  if (divergence < 3) return 'border-red-500/30';
  if (divergence < 5) return 'border-amber-500/30';
  return 'border-green-500/30';
}

function getConsensusStyle(strength: string | undefined): { text: string; bg: string; border: string } {
  switch (strength) {
    case 'STRONG':
      return { text: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' };
    case 'MEDIUM':
      return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
    default:
      return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' };
  }
}

function getDecisionBadge(decision: string): { label: string; className: string } {
  switch (decision) {
    case 'EXECUTE':
      return {
        label: 'EXECUTED',
        className: 'bg-green-500/20 text-green-400 border-green-500/40',
      };
    case 'BOND_MODE':
      return {
        label: 'BOND MODE',
        className: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
      };
    default:
      return {
        label: 'SKIPPED',
        className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/40',
      };
  }
}

export const DivergenceCard: React.FC<DivergenceCardProps> = ({
  result,
  walletAddress,
  marketSlug,
}) => {
  const badge = getDecisionBadge(result.decision);
  const consensusStyle = getConsensusStyle(result.consensusStrength);
  const divColor = getDivergenceColor(result.divergence);
  const divBorder = getDivergenceBorder(result.divergence);

  return (
    <div className={`border ${divBorder} bg-black/60 font-mono text-xs overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-cyan-500/5 border-b border-cyan-500/10">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 text-[10px]">{'>'} DIVERGENCE_ANALYSIS</span>
          <span className="text-cyan-400/40 text-[10px]">{shortAddr(walletAddress)}</span>
        </div>
        <span className={`px-2 py-0.5 border text-[9px] tracking-wider ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Price Comparison */}
      <div className="grid grid-cols-2 gap-px bg-cyan-500/10">
        <div className="bg-black/80 p-3">
          <div className="text-cyan-400/50 text-[10px] uppercase mb-1">OKX Spot</div>
          <div className="text-cyan-400 text-sm font-bold">
            ${result.spotPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '—'}
          </div>
        </div>
        <div className="bg-black/80 p-3">
          <div className="text-cyan-400/50 text-[10px] uppercase mb-1">Polymarket Implied</div>
          <div className="text-cyan-400 text-sm font-bold">
            ${result.impliedPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 }) || '—'}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="p-3 space-y-2">
        {/* Divergencia */}
        <div className="flex items-center justify-between">
          <span className="text-cyan-400/60">Divergencia</span>
          <span className={`font-bold ${divColor}`}>
            {result.divergence.toFixed(2)}%
          </span>
        </div>

        {/* Edge Esperado */}
        <div className="flex items-center justify-between">
          <span className="text-cyan-400/60">Edge Esperado</span>
          <span className="text-green-400">
            {result.expectedEdge.toFixed(2)}%
          </span>
        </div>

        {/* Consenso Smart Money */}
        <div className="flex items-center justify-between">
          <span className="text-cyan-400/60">Smart Money Consensus</span>
          <span className={`px-2 py-0.5 border text-[9px] ${consensusStyle.text} ${consensusStyle.bg} ${consensusStyle.border}`}>
            {result.consensusStrength || 'N/A'}
          </span>
        </div>

        {/* Trade Info */}
        {result.trade && (
          <div className="border-t border-cyan-500/10 pt-2 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-cyan-400/60">Instrumento</span>
              <span className="text-foreground">{result.trade.instId}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-cyan-400/60">Dirección</span>
              <span className={result.trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                {result.trade.side.toUpperCase()} {result.trade.lever}x
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-cyan-400/60">Tamaño</span>
              <span className="text-foreground">${result.trade.size} USDC</span>
            </div>
          </div>
        )}

        {/* Razón de skip */}
        {result.decision === 'SKIP' && result.reason && (
          <div className="border-t border-cyan-500/10 pt-2 mt-2">
            <span className="text-zinc-500 text-[10px]">
              {'>'} {result.reason.replace(/_/g, ' ')}
            </span>
          </div>
        )}

        {/* TX Hash */}
        {result.txHash && (
          <div className="border-t border-cyan-500/10 pt-2 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-cyan-400/60">TX</span>
              <span className="text-green-400/80 text-[10px]">
                {result.txHash.startsWith('SIM-') ? `⚡ ${result.txHash}` : result.txHash}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1 bg-cyan-500/5 border-t border-cyan-500/10">
        <span className="text-cyan-400/30 text-[9px]">
          {marketSlug} · {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};
