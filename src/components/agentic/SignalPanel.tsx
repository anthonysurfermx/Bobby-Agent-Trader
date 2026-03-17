// ============================================================
// SignalPanel — Panel de señales OnchainOS × OpenClaw
// Muestra agentes detectados con score ≥ 80 y permite analizar divergencia
// ============================================================

import React, { useState } from 'react';
import { DivergenceCard } from './DivergenceCard';
import type { SignalResponse } from '@/lib/onchainos/types';

interface DetectedAgent {
  address: string;
  score: number;
  direction: 'YES' | 'NO';
  positionDelta: number;
  outcomePrice?: number;
}

interface SignalPanelProps {
  detectedAgents: DetectedAgent[];
  marketSlug: string;
}

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-red-400';
  if (score >= 85) return 'text-amber-400';
  return 'text-cyan-400';
}

interface AgentRowProps {
  agent: DetectedAgent;
  marketSlug: string;
}

const AgentRow: React.FC<AgentRowProps> = ({ agent, marketSlug }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SignalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeDivergence = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/onchainos-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: agent.address,
          marketSlug,
          score: agent.score,
          direction: agent.direction,
          outcomePrice: agent.outcomePrice || 0.5,
          positionDelta: agent.positionDelta,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const data: SignalResponse = await response.json();
      setResult(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-b border-cyan-500/10 last:border-b-0">
      {/* Agent Info Row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Score */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-sm font-bold font-mono ${getScoreColor(agent.score)}`}>
            {agent.score}
          </span>
          <span className="text-cyan-400/30 text-[9px]">SCORE</span>
        </div>

        {/* Address */}
        <span className="text-cyan-400 text-[11px] font-mono">
          {shortAddr(agent.address)}
        </span>

        {/* Direction Badge */}
        <span
          className={`px-1.5 py-0.5 text-[9px] font-mono border ${
            agent.direction === 'YES'
              ? 'text-green-400 border-green-500/30 bg-green-500/10'
              : 'text-red-400 border-red-500/30 bg-red-500/10'
          }`}
        >
          {agent.direction}
        </span>

        {/* Position Delta */}
        <span className="text-cyan-400/60 text-[10px] font-mono ml-auto">
          ${agent.positionDelta.toLocaleString()}
        </span>

        {/* Analyze Button */}
        <button
          onClick={analyzeDivergence}
          disabled={loading}
          className={`px-3 py-1 text-[10px] font-mono border transition-colors shrink-0 ${
            loading
              ? 'border-cyan-500/20 text-cyan-400/40 cursor-wait'
              : result
                ? 'border-green-500/30 text-green-400 bg-green-500/5 hover:bg-green-500/10'
                : 'border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
          }`}
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <span className="animate-pulse">⟳</span> ANALYZING...
            </span>
          ) : result ? (
            'RE-ANALYZE'
          ) : (
            'ANALYZE DIVERGENCE'
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 pb-2">
          <div className="border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-[10px] text-red-400 font-mono">
            {'>'} ERROR: {error}
          </div>
        </div>
      )}

      {/* Result Card */}
      {result && (
        <div className="px-3 pb-3">
          <DivergenceCard
            result={result}
            walletAddress={agent.address}
            marketSlug={marketSlug}
          />
        </div>
      )}
    </div>
  );
};

export const SignalPanel: React.FC<SignalPanelProps> = ({
  detectedAgents,
  marketSlug,
}) => {
  // Solo mostrar agentes con score ≥ 80
  const qualifiedAgents = detectedAgents.filter((a) => a.score >= 80);

  if (qualifiedAgents.length === 0) return null;

  return (
    <div className="border border-cyan-500/20 bg-black/60 overflow-hidden font-mono mt-4">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border-b border-cyan-500/20">
        <span className="text-cyan-400 text-[10px]">⚡</span>
        <span className="text-cyan-400 text-[10px] font-bold tracking-wider">
          ONCHAINOS SIGNAL EXECUTOR
        </span>
        <span className="text-cyan-400/40 text-[10px] ml-1">
          {qualifiedAgents.length} agent{qualifiedAgents.length > 1 ? 's' : ''} detected
        </span>
        <span className="ml-auto text-cyan-400/20 text-[9px]">
          score ≥ 80
        </span>
      </div>

      {/* Agent List */}
      <div>
        {qualifiedAgents.map((agent) => (
          <AgentRow
            key={agent.address}
            agent={agent}
            marketSlug={marketSlug}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-1 bg-cyan-500/5 border-t border-cyan-500/10 flex items-center justify-between">
        <span className="text-cyan-400/30 text-[9px]">
          OpenClaw × OnchainOS · {marketSlug}
        </span>
        <span className="text-cyan-400/20 text-[9px]">
          {process.env.NODE_ENV === 'production' ? 'LIVE' : 'DEV'}
        </span>
      </div>
    </div>
  );
};
