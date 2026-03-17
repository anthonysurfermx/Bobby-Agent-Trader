import React, { useRef, useEffect } from 'react';
import { Radio, Brain, Zap } from 'lucide-react';

export interface AgentLogEntry {
  agent: 'scout' | 'strategist' | 'executor';
  message: string;
  timestamp: number;
  status?: 'info' | 'success' | 'warning' | 'error' | 'pending';
}

interface AgentActivityLogProps {
  entries: AgentLogEntry[];
}

const AGENT_CONFIG = {
  scout:      { label: 'SCOUT',      color: 'text-green-400',  icon: Radio,  border: 'border-green-500/30' },
  strategist: { label: 'STRATEGIST', color: 'text-cyan-400',   icon: Brain,  border: 'border-cyan-500/30' },
  executor:   { label: 'EXECUTOR',   color: 'text-amber-400',  icon: Zap,    border: 'border-amber-500/30' },
} as const;

function getStatusClass(entry: AgentLogEntry): string {
  switch (entry.status) {
    case 'success': return 'text-green-300';
    case 'warning': return 'text-amber-300';
    case 'error':   return 'text-red-400';
    case 'pending': return `${AGENT_CONFIG[entry.agent].color} animate-pulse`;
    default:        return AGENT_CONFIG[entry.agent].color.replace('400', '300/70');
  }
}

function relativeTime(ts: number): string {
  const delta = Math.floor((Date.now() - ts) / 1000);
  if (delta < 3) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export const AgentActivityLog: React.FC<AgentActivityLogProps> = ({ entries }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div className="border border-green-500/20 bg-black/80 overflow-hidden font-mono w-full">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border-b border-green-500/20">
        <div className="flex gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ imageRendering: 'pixelated' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" style={{ imageRendering: 'pixelated' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" style={{ imageRendering: 'pixelated' }} />
        </div>
        <span className="text-green-400 text-[10px] uppercase tracking-widest">
          Agent Swarm v1.0
        </span>
        <span className="text-green-500/40 text-[9px] ml-auto">
          3 agents active
        </span>
      </div>

      {/* Log body */}
      <div
        ref={scrollRef}
        className="max-h-72 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-green-500/20"
      >
        {entries.length === 0 && (
          <p className="text-green-500/30 text-[10px] text-center py-4 animate-pulse">
            awaiting agent signals...
          </p>
        )}

        {entries.map((entry, i) => {
          const cfg = AGENT_CONFIG[entry.agent];
          const Icon = cfg.icon;
          const statusCls = getStatusClass(entry);

          return (
            <div
              key={i}
              className={`flex items-start gap-1.5 text-[10px] leading-relaxed px-1 py-0.5 rounded
                hover:bg-white/[0.02] transition-colors ${
                  entry.status === 'error' ? 'bg-red-500/5' : ''
                }`}
            >
              {/* Timestamp */}
              <span className="text-green-500/30 shrink-0 w-12 text-right text-[9px] pt-px">
                {relativeTime(entry.timestamp)}
              </span>

              {/* Agent badge */}
              <span className={`${cfg.color} shrink-0 flex items-center gap-0.5`}>
                <Icon size={9} />
                <span className="font-bold">[{cfg.label}]</span>
              </span>

              {/* Message */}
              <span className={statusCls}>
                {entry.message}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer cursor */}
      <div className="px-3 py-1 border-t border-green-500/10 flex items-center gap-1">
        <span className="text-green-500/40 text-[9px]">$</span>
        <span className="w-1.5 h-3 bg-green-400/60 animate-pulse" />
      </div>
    </div>
  );
};

export default AgentActivityLog;
